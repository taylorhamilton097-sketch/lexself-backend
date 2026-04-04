'use strict';

const express = require('express');
const bcrypt  = require('bcryptjs');
const router  = express.Router();
const { createUser, getUserByEmail, getCaseProfile, saveCaseProfile, getUserUsageSummary } = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, name, product = 'criminal' } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: 'Email, password, and name required.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Invalid email address.' });
  if (getUserByEmail(email))
    return res.status(409).json({ error: 'An account with this email already exists.' });
  try {
    const hash = await bcrypt.hash(password, 12);
    const user = createUser(email, hash, name.trim(), product);
    const token = signToken(user.id);
    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan, products: user.products },
    });
  } catch(err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required.' });
  const user = getUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid email or password.' });
  const token = signToken(user.id);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, plan: user.plan, products: user.products },
  });
});

// GET /api/auth/me?product=criminal|family
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
    },
    usage,
  });
});

// GET /api/auth/profile?product=criminal|family
router.get('/profile', requireAuth, (req, res) => {
  const product = req.query.product || 'criminal';
  const profile = getCaseProfile(req.user.id, product);
  res.json({ profile });
});

// POST /api/auth/profile?product=criminal|family
router.post('/profile', requireAuth, (req, res) => {
  const product = req.query.product || 'criminal';
  const { profile } = req.body;
  if (!profile) return res.status(400).json({ error: 'Profile data required.' });
  saveCaseProfile(req.user.id, product, profile);
  res.json({ success: true });
});

module.exports = router;
