'use strict';

/**
 * Tier-aware per-minute AI rate limiter — front-line circuit breaker.
 *
 * The authoritative per-hour and per-month caps live in db.checkLimit(), which
 * runs inside each chat/analyze route handler against the `usage` table. This
 * middleware adds a per-minute ceiling keyed by userId so a hostile client
 * can't burn an entire hourly allowance in 3 seconds. It also fails safe
 * for unauthenticated or malformed requests by passing them through — the
 * downstream auth middleware will reject them with a proper 401.
 *
 * Not Redis-backed: a plain in-memory Map is fine for a single Railway
 * instance. When we scale horizontally this becomes a documented migration
 * point (see README).
 */

const jwt = require('jsonwebtoken');
const { db, PLANS } = require('../db');

const SECRET = process.env.JWT_SECRET || 'change-in-production-minimum-32-chars';
const WINDOW_MS = 60 * 1000;

/**
 * Per-minute ceilings by plan. These sit ABOVE checkLimit's per-hour ceilings.
 *
 * Rationale: Essential allows 10 chat/hr, so 5/min lets a legitimate burst of
 * 5 rapid questions through and then the hourly cap catches the rest. A
 * script trying to drain the hour in 3 seconds is stopped at 5.
 */
const CHAT_PER_MIN = {
  free:      3,
  essential: 5,
  complete:  8,
  counsel:   12,
  admin:     Infinity,
};
const ANALYSIS_PER_MIN = {
  free:      1,
  essential: 1,
  complete:  2,
  counsel:   3,
  admin:     Infinity,
};

// Map<userId, Map<'chat'|'analysis', number[]>>
const hits = new Map();

function pushHit(userId, type) {
  const now = Date.now();
  let perUser = hits.get(userId);
  if (!perUser) { perUser = new Map(); hits.set(userId, perUser); }
  let arr = perUser.get(type);
  if (!arr) { arr = []; perUser.set(type, arr); }
  // Evict entries outside the window before pushing
  const cutoff = now - WINDOW_MS;
  while (arr.length && arr[0] < cutoff) arr.shift();
  arr.push(now);
  return arr.length;
}

function countHits(userId, type) {
  const perUser = hits.get(userId);
  if (!perUser) return 0;
  const arr = perUser.get(type);
  if (!arr) return 0;
  const cutoff = Date.now() - WINDOW_MS;
  while (arr.length && arr[0] < cutoff) arr.shift();
  return arr.length;
}

// Periodic prune so abandoned userIds don't keep empty arrays forever.
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [uid, perUser] of hits) {
    let alive = false;
    for (const [type, arr] of perUser) {
      while (arr.length && arr[0] < cutoff) arr.shift();
      if (arr.length === 0) perUser.delete(type);
      else alive = true;
    }
    if (!alive) hits.delete(uid);
  }
}, 5 * 60 * 1000).unref();

function resolveUserId(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), SECRET);
    return payload.sub || payload.userId || payload.id || null;
  } catch {
    return null;
  }
}

function planFor(userId) {
  try {
    const row = db.prepare('SELECT plan FROM users WHERE id=?').get(userId);
    const key = row?.plan || 'free';
    return { key, plan: PLANS[key] || PLANS.free };
  } catch {
    return { key: 'free', plan: PLANS.free };
  }
}

/**
 * Build a limiter for a given action type ('chat' | 'analysis').
 */
function buildLimiter(type) {
  const ceilings = type === 'chat' ? CHAT_PER_MIN : ANALYSIS_PER_MIN;

  return function limiter(req, res, next) {
    const userId = resolveUserId(req);
    // Fail safe: no valid token → pass through, requireAuth will 401 it.
    if (!userId) return next();

    const { key: planKey, plan } = planFor(userId);
    const ceiling = ceilings[planKey] ?? ceilings.free;

    if (ceiling === Infinity) {
      // Admin tier — still record for observability but never block.
      pushHit(userId, type);
      return next();
    }

    const current = countHits(userId, type);
    if (current >= ceiling) {
      // Too many in the last minute. Advise how long to wait based on the
      // oldest in-window timestamp. Minimum 5 seconds so clients don't spin.
      const perUser = hits.get(userId);
      const arr = perUser?.get(type) || [];
      const oldestInWindow = arr[0] || Date.now();
      const retryAfterMs = Math.max(5000, (oldestInWindow + WINDOW_MS) - Date.now());
      const retryAfter = Math.ceil(retryAfterMs / 1000);

      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `You're sending ${type} requests too quickly. Please wait ${retryAfter} seconds.`,
        code: type === 'chat' ? 'RATE_LIMIT_CHAT_MIN' : 'RATE_LIMIT_ANALYSIS_MIN',
        retryAfter,
        tier:   planKey,
        tierLabel: plan.label,
        perMinuteLimit: ceiling,
      });
    }

    pushHit(userId, type);
    next();
  };
}

const chatLimiter     = buildLimiter('chat');
const analysisLimiter = buildLimiter('analysis');

module.exports = {
  chatLimiter,
  analysisLimiter,
  // Exposed for tests / admin introspection
  CHAT_PER_MIN,
  ANALYSIS_PER_MIN,
  _internals: { hits, countHits, pushHit },
};
