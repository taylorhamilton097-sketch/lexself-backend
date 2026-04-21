'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const router   = express.Router();
const {
  createUser, getUserByEmail, getUserById,
  getCaseProfile, saveCaseProfile,
  getUserUsageSummary, updateUserPlan,
  enforceSessionLimit, revokeAllSessionsForUser,
  getOnboardingState, computeOnboardingStatus,
} = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../utils/email');
const { getStepsForProduct } = require('../config/onboarding');

// Plans that skip onboarding by default. Mirrors the set in routes/onboarding.js.
const SKIP_ONBOARDING_PLANS = new Set(['counsel', 'admin']);

// ── INPUT SANITIZATION (no external deps) ──
const sanitize = (input, maxLen = 500) => {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, maxLen);
};

const validateEmail = (email) =>
  typeof email === 'string' &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
  email.length <= 254;

const validatePassword = (pass) =>
  typeof pass === 'string' && pass.length >= 8 && pass.length <= 128;

/**
 * Issue a token for a user while enforcing the 2-device cap.
 * enforceSessionLimit revokes the least-recently-active session if needed,
 * then signToken creates the new session row.
 */
function issueToken(userId, req) {
  try { enforceSessionLimit(userId); } catch(e) { console.error('[enforceSessionLimit]', e.message); }
  return signToken(userId, req);
}

/**
 * Build the onboarding payload for /auth/me.
 * Bundled into /me so the app can render the checklist on first paint
 * without a second round-trip.
 */
function buildOnboardingPayload(user, product) {
  const steps = getStepsForProduct(product);
  const state = getOnboardingState(user.id);
  const completed = computeOnboardingStatus(user.id, product, steps);
  return {
    product,
    steps: steps.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      ctaLabel: s.ctaLabel,
      ctaAction: s.ctaAction,
    })),
    completed,
    dismissed: !!state.dismissed,
    skipForPlan: SKIP_ONBOARDING_PLANS.has(user.plan || ''),
  };
}

// ──────────────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, name, product = 'criminal' } = req.body;
  const cleanName  = sanitize(name, 100);
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!cleanEmail || !password || !cleanName)
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  if (!validateEmail(cleanEmail))
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!validatePassword(password))
    return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' });

  // Check for existing account
  const existing = getUserByEmail(email);
  if (existing) {
    // If registering for a different product — add it to their account
    const canAddProduct = (
      product !== 'clearsplit' &&
      existing.products !== 'both' &&
      existing.products !== product
    );
    if (canAddProduct) {
      // Upgrade to bundle access
      updateUserPlan(
        existing.id,
        existing.plan,
        'both',
        existing.stripe_subscription_id,
        existing.plan_period_end,
        existing.subscription_status
      );
      const token = issueToken(existing.id, req);
      return res.status(200).json({
        token,
        user: {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          plan: existing.plan,
          products: 'both',
        },
        productAdded: true,
      });
    }
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
  }

  // Create new account
  try {
    const hash = await bcrypt.hash(password, 12);
    const user = createUser(email, hash, name.trim(), product);
    const token = issueToken(user.id, req);
    sendWelcomeEmail(user).catch(e => console.error('[Email error]', e.message));
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan, products: user.products },
    });
  } catch(err) {
    console.error('[Register error]', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ──────────────────────────────────────────────────
// POST /api/auth/login
// ──────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!cleanEmail || !password)
    return res.status(400).json({ error: 'Email and password required.' });
  if (!validateEmail(cleanEmail))
    return res.status(400).json({ error: 'Invalid email or password. Please try again.' });

  const user = getUserByEmail(cleanEmail);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid email or password. Please try again.' });

  const token = issueToken(user.id, req);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan, products: user.products },
  });
});

// ──────────────────────────────────────────────────
// GET /api/auth/me
// ──────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const product = (req.query.product === 'family') ? 'family' : 'criminal';
  const usage = getUserUsageSummary(req.user, product);

  // Session 6a — bundle onboarding state so the client can render the
  // checklist on first paint without a second API call. If this fails
  // for any reason we still return a valid /me response.
  let onboarding = null;
  try {
    onboarding = buildOnboardingPayload(req.user, product);
  } catch(e) {
    console.warn('[onboarding payload]', e.message);
  }

  res.json({
    user: {
      id:                 req.user.id,
      email:              req.user.email,
      name:               req.user.name,
      plan:               req.user.plan,
      products:           req.user.products,
      subscriptionStatus: req.user.subscription_status,
      planPeriodEnd:      req.user.plan_period_end,
    },
    usage,
    onboarding,
  });
});

// ──────────────────────────────────────────────────
// GET /api/auth/profile
// ──────────────────────────────────────────────────
router.get('/profile', requireAuth, (req, res) => {
  const product = req.query.product || 'criminal';
  const profile = getCaseProfile(req.user.id, product);
  res.json({ profile });
});

// ──────────────────────────────────────────────────
// POST /api/auth/profile
// ──────────────────────────────────────────────────
router.post('/profile', requireAuth, (req, res) => {
  const product = req.query.product || 'criminal';
  const { profile } = req.body;
  if (!profile) return res.status(400).json({ error: 'Profile data required.' });
  saveCaseProfile(req.user.id, product, profile);
  res.json({ success: true });
});

// ──────────────────────────────────────────────────
// POST /api/auth/update-profile
// Update name/email
// ──────────────────────────────────────────────────
router.post('/update-profile', requireAuth, async (req, res) => {
  const { name, email } = req.body;
  if (!name && !email)
    return res.status(400).json({ error: 'Nothing to update.' });

  try {
    const { db } = require('../db');
    if (name) {
      db.prepare('UPDATE users SET name=? WHERE id=?').run(name.trim(), req.user.id);
    }
    if (email && email !== req.user.email) {
      const exists = getUserByEmail(email);
      if (exists) return res.status(409).json({ error: 'That email is already in use.' });
      db.prepare('UPDATE users SET email=? WHERE id=?').run(email.trim().toLowerCase(), req.user.id);
    }
    const updated = getUserById(req.user.id);
    res.json({ success: true, user: { id: updated.id, name: updated.name, email: updated.email } });
  } catch(e) {
    console.error('[Update profile error]', e);
    res.status(500).json({ error: 'Update failed. Please try again.' });
  }
});

// ──────────────────────────────────────────────────
// POST /api/auth/change-password
// Revokes all other sessions when password changes.
// ──────────────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Current and new password required.' });
  if (!validatePassword(newPassword))
    return res.status(400).json({ error: 'New password must be between 8 and 128 characters.' });

  try {
    const user = getUserById(req.user.id);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, 12);
    const { db } = require('../db');
    // Store password_changed_at to invalidate existing tokens on other devices
    db.prepare('UPDATE users SET password=?, password_changed_at=unixepoch() WHERE id=?')
      .run(hash, req.user.id);
    // Revoke every session for this user, then issue a fresh one so the caller
    // stays signed in on this device.
    try { revokeAllSessionsForUser(req.user.id); } catch(e) { /* non-fatal */ }
    const token = issueToken(req.user.id, req);
    res.json({
      success: true,
      token,
      message: 'Password updated. You have been signed out on all other devices.',
    });
  } catch(e) {
    console.error('[Change password error]', e.message);
    res.status(500).json({ error: 'Password change failed. Please try again.' });
  }
});

// ──────────────────────────────────────────────────
// POST /api/auth/logout
// Revoke current session only.
// ──────────────────────────────────────────────────
router.post('/logout', requireAuth, (req, res) => {
  try {
    if (req.jti) {
      const { revokeSession } = require('../db');
      revokeSession(req.jti);
    }
    res.json({ success: true });
  } catch(e) {
    console.error('[Logout error]', e.message);
    res.json({ success: true }); // idempotent — always report success
  }
});

// ──────────────────────────────────────────────────
// POST /api/auth/logout-all
// Revoke all sessions for this user (incl. current).
// ──────────────────────────────────────────────────
router.post('/logout-all', requireAuth, (req, res) => {
  try {
    revokeAllSessionsForUser(req.user.id);
    res.json({ success: true });
  } catch(e) {
    console.error('[Logout-all error]', e.message);
    res.json({ success: true });
  }
});

module.exports = router;
