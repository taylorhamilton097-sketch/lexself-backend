'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const {
  createUser, getUserByEmail, getUserById,
  getCaseProfile, saveCaseProfile,
  getUserUsageSummary, updateUserPlan,
} = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../utils/email');

// ──────────────────────────────────────────────────
// POST /api/auth/register
// ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password, name, product = 'criminal' } = req.body;

  // Validation
  if (!email || !password || !name)
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Please enter a valid email address.' });

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
      const token = signToken(existing.id);
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
    const token = signToken(user.id);
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
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required.' });

  const user = getUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid email or password. Please try again.' });

  const token = signToken(user.id);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan, products: user.products },
  });
});

// ──────────────────────────────────────────────────
// GET /api/auth/me
// ──────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const product = req.query.product || 'criminal';
  const usage = getUserUsageSummary(req.user, product);
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
// ──────────────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Current and new password required.' });
  if (newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });

  try {
    const user = getUserById(req.user.id);
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, 12);
    const { db } = require('../db');
    db.prepare('UPDATE users SET password=? WHERE id=?').run(hash, req.user.id);
    res.json({ success: true });
  } catch(e) {
    console.error('[Change password error]', e);
    res.status(500).json({ error: 'Password change failed. Please try again.' });
  }
});

module.exports = router;
