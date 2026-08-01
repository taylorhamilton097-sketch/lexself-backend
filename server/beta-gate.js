'use strict';

/**
 * Beta gate middleware.
 *
 * HTTP Basic Auth on every request. Only requests presenting valid
 * credentials matching BETA_USER / BETA_PASS environment variables
 * are passed through to the rest of the app.
 *
 * Bypass conditions:
 *   - Health-check endpoints (/health, /api/health) — Railway's uptime
 *     monitor calls these; gating them would make Railway report the
 *     service as unhealthy.
 *   - Requests when NODE_ENV=development (local machine) — so you don't
 *     have to type credentials every time you run the app locally.
 *   - If BETA_USER or BETA_PASS is not set, the gate is disabled entirely
 *     (fail-open by absence of config, so a missing env var doesn't lock
 *     you out of your own site).
 *
 * To disable the gate in production: remove or blank out either
 * BETA_USER or BETA_PASS in Railway, then redeploy.
 */

// timingSafeEqual protects against timing attacks — a naive `===` string
// comparison leaks information about how many characters matched. Not
// critical for a beta gate, but the right thing to do since it's basically
// free to write correctly.
const crypto = require('crypto');

function timingSafeStringEqual(a, b) {
  const abuf = Buffer.from(String(a));
  const bbuf = Buffer.from(String(b));
  // Buffers must be the same length for timingSafeEqual — pad the shorter
  // to match, and separately compare lengths so mismatched lengths still
  // return false without leaking timing information.
  if (abuf.length !== bbuf.length) {
    // Do a fake comparison of equal length so timing is consistent
    crypto.timingSafeEqual(abuf, abuf);
    return false;
  }
  return crypto.timingSafeEqual(abuf, bbuf);
}

module.exports = function betaGate(req, res, next) {
  // Bypass: health checks (Railway monitoring)
  if (req.path === '/health' || req.path === '/api/health') {
    return next();
  }

  // Bypass: local development
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  const user = process.env.BETA_USER;
  const pass = process.env.BETA_PASS;

  // Bypass: gate not configured (fail-open, so you can never lock yourself out
  // just by forgetting to set an env var)
  if (!user || !pass) {
    return next();
  }

  // Parse the Authorization header
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme !== 'Basic' || !encoded) {
    return challenge(res);
  }

  let decoded;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch (e) {
    return challenge(res);
  }

  // Basic Auth format: "user:pass" — split on first colon only, because
  // a password can legitimately contain colons
  const idx = decoded.indexOf(':');
  if (idx < 0) return challenge(res);

  const providedUser = decoded.slice(0, idx);
  const providedPass = decoded.slice(idx + 1);

  const userOk = timingSafeStringEqual(providedUser, user);
  const passOk = timingSafeStringEqual(providedPass, pass);

  if (userOk && passOk) {
    return next();
  }

  return challenge(res);
};

function challenge(res) {
  res.set('WWW-Authenticate', 'Basic realm="ClearStand Beta", charset="UTF-8"');
  res.status(401).type('text/plain').send('Authentication required.');
}
