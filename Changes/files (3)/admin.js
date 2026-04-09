'use strict';

const express = require('express');
const router  = express.Router();
const { getUserByEmail, updateUserPlan } = require('../db');

// Simple admin password check
const adminAuth = (req, res, next) => {
  const pwd = req.headers['x-admin-password'] || req.query.pwd;
  if (pwd !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// POST /api/admin/set-plan
// Body: { email, plan }
// Plans: free, essential, complete, counsel, admin
router.post('/set-plan', adminAuth, (req, res) => {
  const { email, plan } = req.body;
  if (!email || !plan) return res.status(400).json({ error: 'Email and plan required.' });

  const user = getUserByEmail(email);
  if (!user) return res.status(404).json({ error: `User ${email} not found.` });

  updateUserPlan(user.id, plan, 'both', null, null, 'active');
  res.json({ success: true, message: `${email} set to ${plan} plan` });
});

// GET /api/admin/user?email=xxx
router.get('/user', adminAuth, (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required.' });
  const user = getUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ id: user.id, email: user.email, name: user.name, plan: user.plan, products: user.products });
});

module.exports = router;
