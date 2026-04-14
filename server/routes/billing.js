'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getUserById, updateUserPlan, updateStripeCustomer, addOneTimePurchase } = require('../db');

// ══════════════════════════════════════════════════
// STRIPE PRICE IDs — all 24 products + ClearSplit
// Set via environment variables in Railway
// ══════════════════════════════════════════════════
const P = {
  // ── Family Law ──
  family_essential_monthly:  () => process.env.STRIPE_PRICE_FAMILY_ESSENTIAL,
  family_complete_monthly:   () => process.env.STRIPE_PRICE_FAMILY_COMPLETE,
  family_counsel_monthly:    () => process.env.STRIPE_PRICE_FAMILY_COUNSEL,
  family_essential_annual:   () => process.env.STRIPE_PRICE_FAMILY_ESSENTIAL_ANNUAL,
  family_complete_annual:    () => process.env.STRIPE_PRICE_FAMILY_COMPLETE_ANNUAL,
  family_counsel_annual:     () => process.env.STRIPE_PRICE_FAMILY_COUNSEL_ANNUAL,

  // ── Criminal Defence ──
  criminal_essential_monthly: () => process.env.STRIPE_PRICE_CRIMINAL_ESSENTIAL,
  criminal_complete_monthly:  () => process.env.STRIPE_PRICE_CRIMINAL_COMPLETE,
  criminal_counsel_monthly:   () => process.env.STRIPE_PRICE_CRIMINAL_COUNSEL,
  criminal_essential_annual:  () => process.env.STRIPE_PRICE_CRIMINAL_ESSENTIAL_ANNUAL,
  criminal_complete_annual:   () => process.env.STRIPE_PRICE_CRIMINAL_COMPLETE_ANNUAL,
  criminal_counsel_annual:    () => process.env.STRIPE_PRICE_CRIMINAL_COUNSEL_ANNUAL,

  // ── Bundle (both products) ──
  bundle_essential_monthly:  () => process.env.STRIPE_PRICE_BUNDLE_ESSENTIAL,
  bundle_complete_monthly:   () => process.env.STRIPE_PRICE_BUNDLE_COMPLETE,
  bundle_counsel_monthly:    () => process.env.STRIPE_PRICE_BUNDLE_COUNSEL,
  bundle_essential_annual:   () => process.env.STRIPE_PRICE_BUNDLE_ESSENTIAL_ANNUAL,
  bundle_complete_annual:    () => process.env.STRIPE_PRICE_BUNDLE_COMPLETE_ANNUAL,
  bundle_counsel_annual:     () => process.env.STRIPE_PRICE_BUNDLE_COUNSEL_ANNUAL,

  // ── One-time ──
  family_analysis_pack:      () => process.env.STRIPE_PRICE_FAMILY_ANALYSIS_PACK,
  criminal_analysis_pack:    () => process.env.STRIPE_PRICE_CRIMINAL_ANALYSIS_PACK,
  clearsplit_standard:       () => process.env.STRIPE_PRICE_CLEARSPLIT_STANDARD,
  clearsplit_subscriber:     () => process.env.STRIPE_PRICE_CLEARSPLIT_SUBSCRIBER,
  clearsplit_extension:      () => process.env.STRIPE_PRICE_CLEARSPLIT_EXTENSION,
};

// ══════════════════════════════════════════════════
// PLAN METADATA — maps planKey → Stripe price + DB fields
// ══════════════════════════════════════════════════
const PLAN_META = {
  // Family Law subscriptions
  family_essential:         { priceId: P.family_essential_monthly,  plan: 'essential', products: 'family',   label: 'Family Law — Essential' },
  family_complete:          { priceId: P.family_complete_monthly,   plan: 'complete',  products: 'family',   label: 'Family Law — Complete' },
  family_counsel:           { priceId: P.family_counsel_monthly,    plan: 'counsel',   products: 'family',   label: 'Family Law — Counsel' },
  family_essential_annual:  { priceId: P.family_essential_annual,   plan: 'essential', products: 'family',   label: 'Family Law — Essential Annual' },
  family_complete_annual:   { priceId: P.family_complete_annual,    plan: 'complete',  products: 'family',   label: 'Family Law — Complete Annual' },
  family_counsel_annual:    { priceId: P.family_counsel_annual,     plan: 'counsel',   products: 'family',   label: 'Family Law — Counsel Annual' },

  // Criminal Defence subscriptions
  criminal_essential:         { priceId: P.criminal_essential_monthly,  plan: 'essential', products: 'criminal', label: 'Criminal Defence — Essential' },
  criminal_complete:          { priceId: P.criminal_complete_monthly,   plan: 'complete',  products: 'criminal', label: 'Criminal Defence — Complete' },
  criminal_counsel:           { priceId: P.criminal_counsel_monthly,    plan: 'counsel',   products: 'criminal', label: 'Criminal Defence — Counsel' },
  criminal_essential_annual:  { priceId: P.criminal_essential_annual,   plan: 'essential', products: 'criminal', label: 'Criminal Defence — Essential Annual' },
  criminal_complete_annual:   { priceId: P.criminal_complete_annual,    plan: 'complete',  products: 'criminal', label: 'Criminal Defence — Complete Annual' },
  criminal_counsel_annual:    { priceId: P.criminal_counsel_annual,     plan: 'counsel',   products: 'criminal', label: 'Criminal Defence — Counsel Annual' },

  // Bundle subscriptions
  bundle_essential:         { priceId: P.bundle_essential_monthly,  plan: 'essential', products: 'both', label: 'Bundle — Essential' },
  bundle_complete:          { priceId: P.bundle_complete_monthly,   plan: 'complete',  products: 'both', label: 'Bundle — Complete' },
  bundle_counsel:           { priceId: P.bundle_counsel_monthly,    plan: 'counsel',   products: 'both', label: 'Bundle — Counsel' },
  bundle_essential_annual:  { priceId: P.bundle_essential_annual,   plan: 'essential', products: 'both', label: 'Bundle — Essential Annual' },
  bundle_complete_annual:   { priceId: P.bundle_complete_annual,    plan: 'complete',  products: 'both', label: 'Bundle — Complete Annual' },
  bundle_counsel_annual:    { priceId: P.bundle_counsel_annual,     plan: 'counsel',   products: 'both', label: 'Bundle — Counsel Annual' },

  // Legacy keys — keep for backward compatibility
  essential:         { priceId: P.criminal_essential_monthly,  plan: 'essential', products: 'criminal', label: 'ClearStand Essential' },
  complete:          { priceId: P.criminal_complete_monthly,   plan: 'complete',  products: 'criminal', label: 'ClearStand Complete' },
  counsel:           { priceId: P.criminal_counsel_monthly,    plan: 'counsel',   products: 'criminal', label: 'ClearStand Counsel' },
};

// One-time products
const ONE_TIME = {
  family_analysis_pack:   { priceId: P.family_analysis_pack,   label: 'Family Law — 3 Analyses',    product: 'family_analysis' },
  criminal_analysis_pack: { priceId: P.criminal_analysis_pack, label: 'Criminal Defence — 3 Analyses', product: 'criminal_analysis' },
  analysis_pack:          { priceId: P.criminal_analysis_pack, label: 'Analysis Pack — 3 Analyses',  product: 'criminal_analysis' }, // legacy
};

// ClearSplit one-time (no auth required)
const CLEARSPLIT_PRODUCTS = {
  clearsplit_standard:   { priceId: P.clearsplit_standard,   amount: 29900, label: 'ClearSplit — Standard' },
  clearsplit_subscriber: { priceId: P.clearsplit_subscriber,  amount: 24900, label: 'ClearSplit — Subscriber' },
  clearsplit_extension:  { priceId: P.clearsplit_extension,   amount: 7400,  label: 'ClearSplit — 30-Day Extension' },
};

let stripe;
const getStripe = () => {
  if (!stripe) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
};

const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

// ══════════════════════════════════════════════════
// POST /api/billing/checkout — subscriptions & analysis packs
// Requires auth
// ══════════════════════════════════════════════════
router.post('/checkout', requireAuth, async (req, res) => {
  const { planKey } = req.body;
  const user = req.user;
  const s = getStripe();

  const successUrl = `${APP_URL()}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${APP_URL()}/?cancelled=1`;

  try {
    // Ensure Stripe customer exists
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await s.customers.create({
        email: user.email,
        name:  user.name,
        metadata: { userId: String(user.id) },
      });
      customerId = customer.id;
      updateStripeCustomer(user.id, customerId);
    }

    let session;

    if (ONE_TIME[planKey]) {
      const ot = ONE_TIME[planKey];
      const priceId = ot.priceId();
      if (!priceId) return res.status(500).json({ error: `Stripe price ID not set for ${planKey}.` });
      session = await s.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url:  cancelUrl,
        metadata: { userId: String(user.id), product: ot.product },
      });
    } else if (PLAN_META[planKey]) {
      const meta = PLAN_META[planKey];
      const priceId = meta.priceId();
      if (!priceId) return res.status(500).json({ error: `Stripe price ID not set for ${planKey}. Check environment variables.` });
      session = await s.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url:  cancelUrl,
        metadata: { userId: String(user.id), plan: meta.plan, products: meta.products },
        subscription_data: {
          metadata: { userId: String(user.id), plan: meta.plan, products: meta.products },
        },
      });
    } else {
      return res.status(400).json({ error: `Unknown plan: ${planKey}` });
    }

    res.json({ url: session.url });
  } catch(err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message || 'Failed to create checkout session.' });
  }
});

// ══════════════════════════════════════════════════
// GET /api/billing/clearsplit/session — lookup purchase by Stripe session
// Called by success screen to display code
// ══════════════════════════════════════════════════
router.get('/clearsplit/session', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  try {
    const s = getStripe();
    const session = await s.checkout.sessions.retrieve(session_id);
    if (!session || session.payment_status !== 'paid') {
      return res.status(404).json({ error: 'Session not found or not paid.' });
    }

    // Look up purchase by payment_intent
    const { getClearSplitPurchaseByPayment } = require('../db');
    const purchase = getClearSplitPurchaseByPayment(session.payment_intent);
    if (!purchase) {
      return res.status(404).json({ error: 'Purchase record not found yet. Please check your email.' });
    }

    const effectiveExpiry = purchase.extension_expires_at || purchase.expires_at;
    res.json({ code: purchase.code, expiresAt: effectiveExpiry });
  } catch(err) {
    console.error('ClearSplit session lookup error:', err);
    res.status(500).json({ error: 'Failed to retrieve session.' });
  }
});

// ══════════════════════════════════════════════════
// POST /api/billing/clearsplit/checkout — no auth required
// Detects subscriber discount automatically
// ══════════════════════════════════════════════════
router.post('/clearsplit/checkout', async (req, res) => {
  const { existingCode } = req.body; // for extensions
  const s = getStripe();

  // Check if user is authenticated subscriber (for discount)
  let userId = null;
  let isSubscriber = false;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const { verifyToken } = require('../middleware/auth');
      const decoded = verifyToken(authHeader.slice(7));
      if (decoded) {
        const { getUserById } = require('../db');
        const user = getUserById(decoded.userId);
        if (user && (user.subscription_status === 'active' || user.subscription_status === 'trialing' || (user.plan && user.plan !== 'free'))) {
          userId = user.id;
          isSubscriber = true;
        }
      }
    } catch(e) { /* not authenticated — proceed without discount */ }
  }

  try {
    let productKey, successUrl, cancelUrl;

    if (existingCode) {
      // Extension flow
      const { getClearSplitPurchase } = require('../db');
      const purchase = getClearSplitPurchase(existingCode);
      if (!purchase) return res.status(404).json({ error: 'Code not found.' });

      const now = new Date();
      const expiry = new Date(purchase.expires_at);
      const gracePeriod = new Date(expiry.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (now > gracePeriod) {
        return res.status(400).json({ error: 'Code expired more than 30 days ago. Cannot extend.' });
      }

      productKey = 'clearsplit_extension';
      successUrl = `${APP_URL()}/clearsplit/extended?code=${existingCode}&session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl  = `${APP_URL()}/clearsplit/extend`;
    } else {
      // New purchase
      productKey = isSubscriber ? 'clearsplit_subscriber' : 'clearsplit_standard';
      successUrl = `${APP_URL()}/clearsplit/success?session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl  = `${APP_URL()}/clearsplit`;
    }

    const product = CLEARSPLIT_PRODUCTS[productKey];
    const priceId = product.priceId();
    if (!priceId) return res.status(500).json({ error: `Stripe price ID not set for ${productKey}.` });

    const sessionParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url:  cancelUrl,
      metadata: {
        product: productKey,
        existingCode: existingCode || '',
        ...(userId ? { userId: String(userId) } : {}),
      },
    };

    const session = await s.checkout.sessions.create(sessionParams);
    res.json({ url: session.url, isSubscriber, productKey });
  } catch(err) {
    console.error('ClearSplit checkout error:', err);
    res.status(500).json({ error: err.message || 'Failed to create checkout session.' });
  }
});

// ══════════════════════════════════════════════════
// POST /api/billing/clearsplit/verify — verify access code
// No auth required
// ══════════════════════════════════════════════════
router.post('/clearsplit/verify', async (req, res) => {
  const { code } = req.body;
  if (!code || code.length !== 6) return res.status(400).json({ error: 'Invalid code format.' });

  try {
    const { getClearSplitPurchase, incrementClearSplitAccess } = require('../db');
    const purchase = getClearSplitPurchase(code.toUpperCase());
    if (!purchase) return res.status(404).json({ error: 'Code not found.' });

    const now = new Date();
    const effectiveExpiry = purchase.extension_expires_at
      ? new Date(purchase.extension_expires_at)
      : new Date(purchase.expires_at);

    if (now > effectiveExpiry) {
      const gracePeriod = new Date(effectiveExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (now > gracePeriod) {
        return res.status(410).json({ error: 'expired_grace', message: 'Access period ended more than 30 days ago.' });
      }
      return res.status(410).json({ error: 'expired', message: 'Access period has ended.', expiresAt: effectiveExpiry });
    }

    // Valid — increment access count
    incrementClearSplitAccess(code.toUpperCase());

    res.json({
      valid: true,
      code: purchase.code,
      expiresAt: effectiveExpiry,
      accessCount: purchase.access_count + 1,
    });
  } catch(err) {
    console.error('ClearSplit verify error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ══════════════════════════════════════════════════
// POST /api/billing/portal
// ══════════════════════════════════════════════════
router.post('/portal', requireAuth, async (req, res) => {
  const user = req.user;
  if (!user.stripe_customer_id) return res.status(400).json({ error: 'No billing account found.' });
  const s = getStripe();
  try {
    const session = await s.billingPortal.sessions.create({
      customer:   user.stripe_customer_id,
      return_url: APP_URL() + '/',
    });
    res.json({ url: session.url });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════
// GET /api/billing/plans — public
// ══════════════════════════════════════════════════
router.get('/plans', (req, res) => {
  res.json({
    family: {
      free:     { features: ['1 document analysis', '10 chat messages', 'Family law forms guide', 'PDF export'] },
      essential: { monthly: 29, annual: 249, features: ['3 analyses/month', '50 chats/day', 'All family law forms', 'Full document analysis', 'PDF export'] },
      complete:  { monthly: 79, annual: 699, popular: true, features: ['5 analyses/month', '100 chats/day', 'All family law forms', 'Affidavit interview builder', 'PDF export'] },
      counsel:   { monthly: 159, annual: 1399, features: ['Unlimited analyses', 'Unlimited chat', 'All premium features', 'Dictation + cleanup', 'Affidavit builder', 'PDF export'] },
    },
    criminal: {
      free:     { features: ['1 Crown disclosure analysis', '10 chat messages', 'All charge modules', 'PDF export'] },
      essential: { monthly: 29, annual: 249, features: ['3 analyses/month', '50 chats/day', 'All charge modules', 'Full 5-pass disclosure reports', 'PDF export'] },
      complete:  { monthly: 79, annual: 699, popular: true, features: ['5 analyses/month', '100 chats/day', 'All charge modules', 'Full 5-pass reports', 'Cross-examination builder', 'Defence organization tool', 'PDF export'] },
      counsel:   { monthly: 159, annual: 1399, features: ['Unlimited analyses', 'Unlimited chat', 'All premium features', 'Dictation + cleanup', 'Cross-examination builder', 'Defence org tool', 'PDF export'] },
    },
    bundle: {
      essential: { monthly: 49, annual: 429, savings_monthly: 9, features: ['Both products', '3 analyses/month per product', '50 chats/day per product', 'PDF export'] },
      complete:  { monthly: 129, annual: 1099, savings_monthly: 29, best_value: true, features: ['Both products', '5 analyses/month per product', '100 chats/day per product', 'All premium features', 'PDF export'] },
      counsel:   { monthly: 249, annual: 2099, savings_monthly: 69, features: ['Both products', 'Unlimited everything', 'All premium features on both', 'Dictation on both', 'All builders and tools', 'PDF export'] },
    },
    clearsplit: { price: 299, subscriber_price: 249, extension: 74 },
    analysis_pack: { price: 29, analyses: 3 },
  });
});

// ══════════════════════════════════════════════════
// POST /api/billing/webhook — raw body required
// ══════════════════════════════════════════════════
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const s = getStripe();
  let event;
  try {
    event = s.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch(event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = parseInt(session.metadata?.userId);
        const product = session.metadata?.product;

        if (session.mode === 'payment') {
          // One-time purchases
          if (product === 'clearsplit_standard' || product === 'clearsplit_subscriber') {
            // New ClearSplit purchase
            await handleClearSplitPurchase(session, product, userId);
          } else if (product === 'clearsplit_extension') {
            // Extension purchase
            await handleClearSplitExtension(session);
          } else if (product && userId) {
            // Analysis pack
            addOneTimePurchase(userId, product, session.payment_intent);
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = parseInt(sub.metadata?.userId);
        if (!userId) break;
        const plan = sub.metadata?.plan || 'essential';
        const products = sub.metadata?.products || 'criminal';
        const status = sub.status;
        if (status === 'active' || status === 'trialing') {
          updateUserPlan(userId, plan, products, sub.id, sub.current_period_end, status);
        } else if (status === 'canceled' || status === 'unpaid') {
          updateUserPlan(userId, 'free', products, sub.id, null, status);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = parseInt(sub.metadata?.userId);
        if (!userId) break;
        const products = sub.metadata?.products || 'criminal';
        updateUserPlan(userId, 'free', products, null, null, 'canceled');
        break;
      }
    }
  } catch(err) {
    console.error('Webhook handler error:', err);
  }

  res.json({ received: true });
});

// ══════════════════════════════════════════════════
// CLEARSPLIT PURCHASE HANDLERS
// ══════════════════════════════════════════════════
async function handleClearSplitPurchase(session, productKey, userId) {
  const { createClearSplitAgreement, getClearSplitAgreementByPayment, getUserByEmail } = require('../db');
  const { sendClearSplitPurchaseEmail } = require('../utils/email');

  // Don't duplicate if webhook fires twice
  if (getClearSplitAgreementByPayment(session.payment_intent)) {
    console.log('[ClearSplit] Agreement already exists for payment:', session.payment_intent);
    return;
  }

  const purchaserEmail = session.customer_details?.email || '';
  const amountPaid = productKey === 'clearsplit_subscriber' ? 24900 : 29900;

  // Check if purchaser already has an account (subscription or existing ClearSplit)
  const existingUser = purchaserEmail ? getUserByEmail(purchaserEmail) : null;
  const party1UserId = existingUser ? existingUser.id : userId;

  if (!party1UserId) {
    // No user yet — create a placeholder agreement linked to temp user id 0
    // Will be linked when Party 1 creates their account on the success page
    console.log('[ClearSplit] Purchase without existing account — pending Party 1 registration');
  }

  const agreement = createClearSplitAgreement({
    party1UserId: party1UserId || 0,
    stripePaymentId: session.payment_intent,
    stripeProduct: productKey,
    amountPaid,
  });

  // Send purchase confirmation email
  try {
    await sendClearSplitPurchaseEmail({
      email: purchaserEmail,
      code: agreement.code,
      activeUntil: agreement.active_until,
      sessionId: session.id,
    });
  } catch(e) {
    console.error('[ClearSplit] Purchase email error:', e.message);
  }

  console.log(`[ClearSplit] Agreement created — code: ${agreement.code}`);
}

async function handleClearSplitExtension(session) {
  const { extendClearSplitAgreement, getClearSplitAgreementById, getUserById } = require('../db');
  const { sendClearSplitExtensionEmail } = require('../utils/email');
  const agreementId = parseInt(session.metadata?.agreementId);
  if (!agreementId) return;

  const result = extendClearSplitAgreement(agreementId);
  if (!result) return;

  // Send to both parties
  const agreement = getClearSplitAgreementById(agreementId);
  if (!agreement) return;

  const party1 = getUserById(agreement.party1_user_id);
  const party2 = agreement.party2_user_id ? getUserById(agreement.party2_user_id) : null;

  const emailPayload = { previousExpiry: result.previousExpiry, newExpiry: result.newExpiry };
  if (party1?.email) {
    sendClearSplitExtensionEmail({ email: party1.email, firstName: party1.name.split(' ')[0], ...emailPayload })
      .catch(e => console.error('[ClearSplit] Extension email P1:', e.message));
  }
  if (party2?.email) {
    sendClearSplitExtensionEmail({ email: party2.email, firstName: party2.name.split(' ')[0], ...emailPayload })
      .catch(e => console.error('[ClearSplit] Extension email P2:', e.message));
  }

  console.log(`[ClearSplit] Extended agreement ${agreementId} → expires ${result.newExpiry.toISOString()}`);
}

module.exports = router;
