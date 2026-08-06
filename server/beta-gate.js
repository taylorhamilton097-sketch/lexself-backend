'use strict';

/**
 * BETA GATE — HTTP Basic Auth across the whole site.
 *
 * This is a soft "not open to the public yet" barrier, not a security
 * boundary. Real security is the JWT layer in middleware/auth.js.
 *
 * ── Why some requests are exempt ───────────────────────────────────
 *
 * 1. Bearer-token requests.
 *    Basic Auth and the app's JWT both travel in the SAME header:
 *    `Authorization`. Once a user signs in, every fetch() in app.html
 *    sets `Authorization: Bearer <jwt>` explicitly. The browser will
 *    NOT merge its cached Basic credentials into a request that already
 *    sets that header — the Bearer value wins. The gate then sees no
 *    Basic credentials, returns 401 with WWW-Authenticate, and the
 *    browser pops the password dialog. Entering the password cannot fix
 *    it, because the next API call overwrites the header again.
 *
 *    So: if a request carries a Bearer token, the gate stands down and
 *    lets requireAuth judge it instead.
 *
 *    This is not a hole. A Bearer token can only be obtained by first
 *    signing in, and /api/auth/login and /register send no Authorization
 *    header — so they are still gated. Someone sending a junk Bearer
 *    header bypasses the gate only to be rejected by requireAuth, and
 *    every HTML page is still gated because browsers request pages
 *    without an Authorization header.
 *
 * 2. Stripe webhooks (/api/billing/webhook).
 *    Stripe cannot send Basic Auth credentials. With the gate mounted
 *    before the webhook route, every Stripe delivery was being answered
 *    with a 401. Stripe retries for a while and then stops. The webhook
 *    has its own, stronger authentication: signature verification
 *    against STRIPE_WEBHOOK_SECRET.
 *
 * 3. Health checks (/health, /api/health).
 *    Railway's platform health check cannot authenticate either. A
 *    gated health endpoint reports the container as unhealthy.
 *
 * ── Behaviour when BETA_USER / BETA_PASS are unset ─────────────────
 *
 * The gate disables itself and logs a warning. It fails OPEN, not
 * closed, deliberately: an accidentally-missing environment variable
 * should not take the site down. The trade-off is that clearing those
 * variables makes the site publicly reachable — which is exactly how
 * you turn the gate off when you launch.
 */

const crypto = require('crypto');

// Paths that must never be gated, matched as prefixes.
const EXEMPT_PREFIXES = [
  '/api/billing/webhook',  // Stripe cannot authenticate
  '/health',               // Railway platform health check
  '/api/health',
];

/**
 * Timing-safe string comparison. Length is compared first because
 * timingSafeEqual throws on mismatched buffer lengths.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

let warnedDisabled = false;

module.exports = function betaGate(req, res, next) {
  const USER = process.env.BETA_USER;
  const PASS = process.env.BETA_PASS;

  // Gate not configured — pass everything through.
  if (!USER || !PASS) {
    if (!warnedDisabled) {
      console.warn('[Beta gate] BETA_USER / BETA_PASS not set — gate is DISABLED and the site is public.');
      warnedDisabled = true;
    }
    return next();
  }

  // Exempt paths.
  const p = req.path || '';
  for (const prefix of EXEMPT_PREFIXES) {
    if (p === prefix || p.startsWith(prefix + '/')) return next();
  }

  const header = req.headers.authorization || '';

  // Already authenticated by JWT — let requireAuth handle this request.
  if (header.startsWith('Bearer ')) return next();

  // Otherwise require Basic credentials.
  if (!header.startsWith('Basic ')) return challenge(res);

  let decoded;
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch (e) {
    return challenge(res);
  }

  const idx = decoded.indexOf(':');
  if (idx === -1) return challenge(res);

  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);

  // Evaluate both comparisons before branching so a wrong username and a
  // wrong password take the same amount of time.
  const userOk = safeEqual(user, USER);
  const passOk = safeEqual(pass, PASS);

  if (userOk && passOk) return next();
  return challenge(res);
};

function challenge(res) {
  res.set('WWW-Authenticate', 'Basic realm="ClearStand Beta", charset="UTF-8"');
  return res.status(401).send('Authentication required.');
}
