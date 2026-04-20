'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  getUserById,
  createSession,
  getSessionByJti,
  touchSession,
  enforceSessionLimit,
  logIpEvent,
} = require('../db');

const SECRET = process.env.JWT_SECRET || 'change-in-production-minimum-32-chars';

/**
 * Resolve the best-available client IP. Express's req.ip respects trust proxy
 * and will use the first entry in X-Forwarded-For, which on Railway is the
 * real client IP.
 */
function clientIp(req) {
  return (req?.ip || req?.headers?.['x-forwarded-for'] || '').toString().split(',')[0].trim();
}

/**
 * Best-effort short device label from the User-Agent, purely for admin display.
 * We don't parse it strictly — a truncated UA is fine.
 */
function deviceLabelFromReq(req) {
  const ua = (req?.headers?.['user-agent'] || '').toString();
  return ua.slice(0, 200);
}

/**
 * Sign a JWT AND register the session in the DB.
 *
 * Call sites (login, register) should invoke enforceSessionLimit(userId) just
 * before this so the 2-device cap is applied. We do not call it here to keep
 * this function side-effect-light and to let the route decide the order.
 *
 * Returns the token string.
 */
function signToken(userId, req = null) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: userId, jti }, SECRET, { expiresIn: '30d' });
  try {
    createSession(jti, userId, deviceLabelFromReq(req), clientIp(req));
  } catch(e) {
    console.error('[signToken session write failed]', e.message);
  }
  return token;
}

/**
 * requireAuth — verifies JWT, enforces session presence (when jti claim is
 * present), updates lastSeenAt, logs IP events.
 *
 * Legacy tokens: tokens signed before Session 2 have no jti claim. To avoid
 * kicking every logged-in user at deploy time, tokens without a jti are
 * accepted but not tracked. They naturally age out inside 30 days.
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
  }

  let payload;
  try {
    payload = jwt.verify(header.slice(7), SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.', code: 'TOKEN_INVALID' });
  }

  const user = getUserById(payload.sub);
  if (!user) {
    return res.status(401).json({ error: 'User not found.', code: 'USER_NOT_FOUND' });
  }

  // Password-change invalidation: any token issued before the user's last
  // password change is stale. Tokens have `iat` by default (seconds).
  if (user.password_changed_at && payload.iat && payload.iat < user.password_changed_at) {
    return res.status(401).json({
      error: 'Your password was changed. Please sign in again.',
      code: 'PASSWORD_CHANGED',
    });
  }

  const ip = clientIp(req);

  if (payload.jti) {
    // Modern token: session MUST exist in the sessions table.
    const session = getSessionByJti(payload.jti);
    if (!session) {
      return res.status(401).json({
        error: 'You were signed out because this account signed in on another device.',
        code: 'SESSION_SUPERSEDED',
      });
    }
    try { touchSession(payload.jti, ip); } catch(e) { /* non-fatal */ }
  }
  // else: legacy token — let it through silently. Re-issued on next login.

  // IP detection — log + alert only, no auto-suspend.
  if (ip) {
    try {
      const { flagged, distinctIps } = logIpEvent(user.id, ip);
      if (flagged) {
        console.warn('[Security] IP_FLAGGED', {
          userId:       user.id,
          email:        user.email,
          distinctIps,
          ip,
          userAgent:    req.headers['user-agent'] || '',
          timestamp:    new Date().toISOString(),
        });
      }
    } catch(e) { /* non-fatal */ }
  }

  req.user = user;
  req.jti  = payload.jti || null;
  next();
}

module.exports = {
  signToken,
  requireAuth,
  // Exposed for routes that need to enforce the device cap before signing.
  enforceSessionLimit,
  // Utility — exposed for anywhere else that wants the same "best IP" rule.
  clientIp,
  deviceLabelFromReq,
};
