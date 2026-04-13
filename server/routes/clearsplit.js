'use strict';

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const { requireAuth, signToken, verifyToken } = require('../middleware/auth');
const db = require('../db');

// ── ClearSplit-specific auth middleware ──
function requireCsAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const decoded = verifyToken(header.slice(7));
    const user = db.getUserById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found.' });
    req.user = user;
    next();
  } catch(e) {
    res.status(401).json({ error: 'Invalid or expired session.' });
  }
}

// ══════════════════════════════════════════════════
// POST /api/clearsplit/validate-code
// Validates a code before Party 2 creates account
// No auth required
// ══════════════════════════════════════════════════
router.post('/validate-code', (req, res) => {
  const { code } = req.body;
  if (!code || code.length !== 6) return res.status(400).json({ error: 'invalid_format' });

  const agreement = db.getClearSplitAgreementByCode(code.toUpperCase());
  if (!agreement) return res.status(404).json({ error: 'not_found' });

  const now = new Date();
  const expiry = new Date(agreement.extension_until || agreement.active_until);
  if (now > expiry) return res.status(410).json({ error: 'expired' });
  if (agreement.party2_user_id) return res.status(409).json({ error: 'full' });

  // Return Party 1 first name for the join screen
  const party1 = db.getUserById(agreement.party1_user_id);
  const party1FirstName = party1 ? party1.name.split(' ')[0] : 'the other party';

  res.json({ valid: true, code: agreement.code, party1FirstName, activeUntil: agreement.extension_until || agreement.active_until });
});

// ══════════════════════════════════════════════════
// POST /api/clearsplit/register
// Creates account for Party 1 (post-payment) or Party 2 (join)
// No auth required
// ══════════════════════════════════════════════════
router.post('/register', async (req, res) => {
  const { firstName, lastName, email, password, confirmPassword, role, code, stripeSessionId } = req.body;

  if (!firstName || !lastName || !email || !password)
    return res.status(400).json({ error: 'All fields required.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (password !== confirmPassword)
    return res.status(400).json({ error: 'Passwords do not match.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Invalid email address.' });

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.createClearSplitUser(email, hash, firstName, lastName);
    const user = result.user;

    if (role === 'party2') {
      // Party 2 joining an existing agreement
      if (!code) return res.status(400).json({ error: 'Access code required.' });
      const joinResult = db.joinClearSplitAgreement(code.toUpperCase(), user.id);
      if (joinResult.error) return res.status(400).json({ error: joinResult.error });

      const token = signToken(user.id);
      // Send Party 2 welcome email
      const { sendClearSplitParty2Email } = require('../utils/email');
      const agreement = joinResult.agreement;
      const party1 = db.getUserById(agreement.party1_user_id);
      sendClearSplitParty2Email({
        email: user.email,
        firstName,
        party1FirstName: party1 ? party1.name.split(' ')[0] : 'the other party',
        activeUntil: agreement.extension_until || agreement.active_until,
      }).catch(e => console.error('[Email] Party2 email error:', e.message));

      return res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
    }

    if (role === 'party1') {
      // Party 1 — find their agreement by stripe session
      let agreement = null;
      if (stripeSessionId) {
        // Look up by payment intent via Stripe session
        try {
          const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
          const session = await stripe.checkout.sessions.retrieve(stripeSessionId);
          if (session.payment_intent) {
            agreement = db.getClearSplitAgreementByPayment(session.payment_intent);
          }
        } catch(e) { console.error('[ClearSplit] Stripe session lookup:', e.message); }
      }
      if (!agreement) {
        // Fallback: find pending agreement (party1_user_id is placeholder -1)
        agreement = db.getClearSplitAgreementByCode(code || '');
      }
      if (!agreement) return res.status(400).json({ error: 'Agreement not found. Please contact support.' });

      // Link Party 1 to this agreement
      db.updateUserClearSplit(user.id, 'purchaser', agreement.id);
      db.setClearSplitParty1(agreement.id, user.id);

      const token = signToken(user.id);
      return res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email }, agreement: { code: agreement.code, activeUntil: agreement.extension_until || agreement.active_until } });
    }

    res.status(400).json({ error: 'Invalid role.' });
  } catch(e) {
    console.error('[ClearSplit] Register error:', e);
    if (e.message && e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ══════════════════════════════════════════════════
// POST /api/clearsplit/signin
// ClearSplit-specific sign in
// No auth required
// ══════════════════════════════════════════════════
router.post('/signin', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  const user = db.getUserByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Invalid email or password.' });

  // Check user has a ClearSplit agreement
  const agreement = db.getClearSplitAgreementByUser(user.id);
  if (!agreement) return res.status(403).json({ error: 'No ClearSplit agreement found for this account.' });

  const token = signToken(user.id);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// ══════════════════════════════════════════════════
// GET /api/clearsplit/agreement
// Get current user's agreement + status
// Requires ClearSplit auth
// ══════════════════════════════════════════════════
router.get('/agreement', requireCsAuth, (req, res) => {
  const agreement = db.getClearSplitAgreementByUser(req.user.id);
  if (!agreement) return res.status(404).json({ error: 'No agreement found.' });

  const status = db.getClearSplitStatus(agreement);
  const party1 = db.getUserById(agreement.party1_user_id);
  const party2 = agreement.party2_user_id ? db.getUserById(agreement.party2_user_id) : null;

  res.json({
    agreement: {
      id: agreement.id,
      code: agreement.code,
      status: agreement.status,
      activeUntil: agreement.extension_until || agreement.active_until,
      purchasedAt: agreement.purchased_at,
      data: agreement.agreement_data ? JSON.parse(agreement.agreement_data) : {},
      lastModifiedAt: agreement.last_modified_at,
    },
    status,
    party1: { name: party1?.name, firstName: party1?.name?.split(' ')[0] },
    party2: party2 ? { name: party2.name, firstName: party2.name.split(' ')[0] } : null,
    currentUserRole: req.user.clearsplit_role,
    isPurchaser: req.user.clearsplit_role === 'purchaser',
  });
});

// ══════════════════════════════════════════════════
// POST /api/clearsplit/agreement
// Save agreement data
// Requires ClearSplit auth + active status
// ══════════════════════════════════════════════════
router.post('/agreement', requireCsAuth, (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'Agreement data required.' });

  const agreement = db.getClearSplitAgreementByUser(req.user.id);
  if (!agreement) return res.status(404).json({ error: 'No agreement found.' });

  const status = db.getClearSplitStatus(agreement);
  if (!status.isActive) return res.status(403).json({ error: 'Agreement is in archived (read-only) state.' });

  db.saveClearSplitAgreementData(agreement.id, data, req.user.id);
  res.json({ success: true });
});

// ══════════════════════════════════════════════════
// POST /api/clearsplit/extend
// Purchase extension — Party 1 only
// Requires ClearSplit auth
// ══════════════════════════════════════════════════
router.post('/extend', requireCsAuth, async (req, res) => {
  const user = req.user;
  if (user.clearsplit_role !== 'purchaser')
    return res.status(403).json({ error: 'party2_cannot_extend', party1Name: '' });

  const agreement = db.getClearSplitAgreementByUser(user.id);
  if (!agreement) return res.status(404).json({ error: 'No agreement found.' });

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const priceId = process.env.STRIPE_PRICE_CLEARSPLIT_EXTENSION;
    if (!priceId) return res.status(500).json({ error: 'Extension price not configured.' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL}/clearsplit/app?extended=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_URL}/clearsplit/app`,
      metadata: { product: 'clearsplit_extension', agreementId: String(agreement.id), userId: String(user.id) },
    });

    res.json({ url: session.url });
  } catch(e) {
    console.error('[ClearSplit] Extend checkout error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════
// GET /api/clearsplit/session
// Lookup agreement by Stripe session ID (post-purchase)
// No auth required
// ══════════════════════════════════════════════════
router.get('/session', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id required.' });
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (!session || session.payment_status !== 'paid')
      return res.status(404).json({ error: 'Session not paid.' });

    const agreement = db.getClearSplitAgreementByPayment(session.payment_intent);
    if (!agreement) return res.status(404).json({ error: 'Agreement not yet created. Please check your email.' });

    res.json({
      code: agreement.code,
      activeUntil: agreement.extension_until || agreement.active_until,
      party1UserId: agreement.party1_user_id,
      hasParty1Account: !!agreement.party1_user_id,
    });
  } catch(e) {
    console.error('[ClearSplit] Session lookup error:', e);
    res.status(500).json({ error: 'Failed to retrieve session.' });
  }
});

// ══════════════════════════════════════════════════
// POST /api/clearsplit/chat
// AI chat for ClearSplit — requires active agreement
// ══════════════════════════════════════════════════
router.post('/chat', requireCsAuth, async (req, res) => {
  const { messages } = req.body;
  const agreement = db.getClearSplitAgreementByUser(req.user.id);
  if (!agreement) return res.status(404).json({ error: 'No agreement found.' });

  const status = db.getClearSplitStatus(agreement);
  if (!status.isActive) return res.status(403).json({ error: 'Agreement is archived. AI assistance is not available.' });

  try {
    const fetch = globalThis.fetch || require('node-fetch');
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        system: `You are ClearSplit AI, a separation agreement advisor for Ontario, Canada. You help couples create fair, legally structured separation agreements. You know the Divorce Act, Family Law Act (Ontario), Federal Child Support Guidelines, and Spousal Support Advisory Guidelines. Be helpful, clear, and neutral. Never take sides. Always recommend independent legal advice before signing.`,
        messages,
      }),
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || '';
    res.json({ reply: text });
  } catch(e) {
    res.status(500).json({ error: 'AI service unavailable.' });
  }
});

module.exports = router;
