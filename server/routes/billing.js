'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getUserById, updateUserPlan, updateStripeCustomer, addOneTimePurchase } = require('../db');

// ══════════════════════════════════════════════════
// STRIPE_PRICES — central price ID configuration
// Single source of truth for all Stripe price IDs.
// Reads from Railway environment variables.
// New naming convention: STRIPE_PRICE_*_MONTHLY
// Falls back to old naming for backward compatibility.
// Never hardcode price IDs anywhere else in the app.
// ══════════════════════════════════════════════════
const STRIPE_PRICES = {
  // ── Standalone Monthly ──
  family_essential_monthly:   process.env.STRIPE_PRICE_FAMILY_ESSENTIAL_MONTHLY   || process.env.STRIPE_PRICE_FAMILY_ESSENTIAL,
  family_complete_monthly:    process.env.STRIPE_PRICE_FAMILY_COMPLETE_MONTHLY    || process.env.STRIPE_PRICE_FAMILY_COMPLETE,
  family_counsel_monthly:     process.env.STRIPE_PRICE_FAMILY_COUNSEL_MONTHLY     || process.env.STRIPE_PRICE_FAMILY_COUNSEL,
  criminal_essential_monthly: process.env.STRIPE_PRICE_CRIMINAL_ESSENTIAL_MONTHLY || process.env.STRIPE_PRICE_CRIMINAL_ESSENTIAL,
  criminal_complete_monthly:  process.env.STRIPE_PRICE_CRIMINAL_COMPLETE_MONTHLY  || process.env.STRIPE_PRICE_CRIMINAL_COMPLETE,
  criminal_counsel_monthly:   process.env.STRIPE_PRICE_CRIMINAL_COUNSEL_MONTHLY   || process.env.STRIPE_PRICE_CRIMINAL_COUNSEL,
  // ── Standalone Annual ──
  family_essential_annual:    process.env.STRIPE_PRICE_FAMILY_ESSENTIAL_ANNUAL,
  family_complete_annual:     process.env.STRIPE_PRICE_FAMILY_COMPLETE_ANNUAL,
  family_counsel_annual:      process.env.STRIPE_PRICE_FAMILY_COUNSEL_ANNUAL,
  criminal_essential_annual:  process.env.STRIPE_PRICE_CRIMINAL_ESSENTIAL_ANNUAL,
  criminal_complete_annual:   process.env.STRIPE_PRICE_CRIMINAL_COMPLETE_ANNUAL,
  criminal_counsel_annual:    process.env.STRIPE_PRICE_CRIMINAL_COUNSEL_ANNUAL,
  // ── Bundle Monthly ──
  bundle_essential_monthly:   process.env.STRIPE_PRICE_BUNDLE_ESSENTIAL_MONTHLY   || process.env.STRIPE_PRICE_BUNDLE_ESSENTIAL,
  bundle_complete_monthly:    process.env.STRIPE_PRICE_BUNDLE_COMPLETE_MONTHLY    || process.env.STRIPE_PRICE_BUNDLE_COMPLETE,
  bundle_counsel_monthly:     process.env.STRIPE_PRICE_BUNDLE_COUNSEL_MONTHLY     || process.env.STRIPE_PRICE_BUNDLE_COUNSEL,
  // ── Bundle Annual ──
  bundle_essential_annual:    process.env.STRIPE_PRICE_BUNDLE_ESSENTIAL_ANNUAL,
  bundle_complete_annual:     process.env.STRIPE_PRICE_BUNDLE_COMPLETE_ANNUAL,
  bundle_counsel_annual:      process.env.STRIPE_PRICE_BUNDLE_COUNSEL_ANNUAL,
  // ── One-time ──
  analysis_pack:              process.env.STRIPE_PRICE_ANALYSIS_PACK,
  family_analysis_pack:       process.env.STRIPE_PRICE_FAMILY_ANALYSIS_PACK,
  criminal_analysis_pack:     process.env.STRIPE_PRICE_CRIMINAL_ANALYSIS_PACK,
  // ── ClearSplit ──
  clearsplit_monthly:         process.env.STRIPE_PRICE_CLEARSPLIT_MONTHLY         || process.env.STRIPE_PRICE_CLEARSPLIT_STANDARD,
  clearsplit_annual:          process.env.STRIPE_PRICE_CLEARSPLIT_ANNUAL,
  clearsplit_standard:        process.env.STRIPE_PRICE_CLEARSPLIT_STANDARD,
  clearsplit_subscriber:      process.env.STRIPE_PRICE_CLEARSPLIT_SUBSCRIBER,
  clearsplit_extension:       process.env.STRIPE_PRICE_CLEARSPLIT_EXTENSION,
};

// Startup validation — warn on missing price IDs, never crash
const validateStripePrices = () => {
  const missing = Object.entries(STRIPE_PRICES)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    console.warn('[Stripe] Missing price IDs:', missing.join(', '));
  } else {
    console.log('[Stripe] Price configuration: all IDs loaded ✓');
  }
};
validateStripePrices();

// ══════════════════════════════════════════════════
// STRIPE_COUPONS — central coupon configuration
// Never hardcode coupon IDs anywhere else.
// ══════════════════════════════════════════════════
const STRIPE_COUPONS = {
  clearsplit_discount: process.env.STRIPE_COUPON_CLEARSPLIT,
};


// All priceId values reference STRIPE_PRICES only.
// ══════════════════════════════════════════════════
const PLAN_META = {
  // Family Law subscriptions
  family_essential:        { priceId: () => STRIPE_PRICES.family_essential_monthly,  plan: 'essential', products: 'family',   label: 'Family Law — Essential' },
  family_complete:         { priceId: () => STRIPE_PRICES.family_complete_monthly,   plan: 'complete',  products: 'family',   label: 'Family Law — Complete' },
  family_counsel:          { priceId: () => STRIPE_PRICES.family_counsel_monthly,    plan: 'counsel',   products: 'family',   label: 'Family Law — Counsel' },
  family_essential_annual: { priceId: () => STRIPE_PRICES.family_essential_annual,   plan: 'essential', products: 'family',   label: 'Family Law — Essential Annual' },
  family_complete_annual:  { priceId: () => STRIPE_PRICES.family_complete_annual,    plan: 'complete',  products: 'family',   label: 'Family Law — Complete Annual' },
  family_counsel_annual:   { priceId: () => STRIPE_PRICES.family_counsel_annual,     plan: 'counsel',   products: 'family',   label: 'Family Law — Counsel Annual' },
  // Criminal Defence subscriptions
  criminal_essential:        { priceId: () => STRIPE_PRICES.criminal_essential_monthly,  plan: 'essential', products: 'criminal', label: 'Criminal Defence — Essential' },
  criminal_complete:         { priceId: () => STRIPE_PRICES.criminal_complete_monthly,   plan: 'complete',  products: 'criminal', label: 'Criminal Defence — Complete' },
  criminal_counsel:          { priceId: () => STRIPE_PRICES.criminal_counsel_monthly,    plan: 'counsel',   products: 'criminal', label: 'Criminal Defence — Counsel' },
  criminal_essential_annual: { priceId: () => STRIPE_PRICES.criminal_essential_annual,   plan: 'essential', products: 'criminal', label: 'Criminal Defence — Essential Annual' },
  criminal_complete_annual:  { priceId: () => STRIPE_PRICES.criminal_complete_annual,    plan: 'complete',  products: 'criminal', label: 'Criminal Defence — Complete Annual' },
  criminal_counsel_annual:   { priceId: () => STRIPE_PRICES.criminal_counsel_annual,     plan: 'counsel',   products: 'criminal', label: 'Criminal Defence — Counsel Annual' },
  // Bundle subscriptions
  bundle_essential:        { priceId: () => STRIPE_PRICES.bundle_essential_monthly,  plan: 'essential', products: 'both', label: 'Bundle — Essential' },
  bundle_complete:         { priceId: () => STRIPE_PRICES.bundle_complete_monthly,   plan: 'complete',  products: 'both', label: 'Bundle — Complete' },
  bundle_counsel:          { priceId: () => STRIPE_PRICES.bundle_counsel_monthly,    plan: 'counsel',   products: 'both', label: 'Bundle — Counsel' },
  bundle_essential_annual: { priceId: () => STRIPE_PRICES.bundle_essential_annual,   plan: 'essential', products: 'both', label: 'Bundle — Essential Annual' },
  bundle_complete_annual:  { priceId: () => STRIPE_PRICES.bundle_complete_annual,    plan: 'complete',  products: 'both', label: 'Bundle — Complete Annual' },
  bundle_counsel_annual:   { priceId: () => STRIPE_PRICES.bundle_counsel_annual,     plan: 'counsel',   products: 'both', label: 'Bundle — Counsel Annual' },
  // Legacy keys — backward compatibility
  essential: { priceId: () => STRIPE_PRICES.criminal_essential_monthly, plan: 'essential', products: 'criminal', label: 'ClearStand Essential' },
  complete:  { priceId: () => STRIPE_PRICES.criminal_complete_monthly,  plan: 'complete',  products: 'criminal', label: 'ClearStand Complete' },
  counsel:   { priceId: () => STRIPE_PRICES.criminal_counsel_monthly,   plan: 'counsel',   products: 'criminal', label: 'ClearStand Counsel' },
};

// One-time products — all reference STRIPE_PRICES
const ONE_TIME = {
  family_analysis_pack:   { priceId: () => STRIPE_PRICES.family_analysis_pack,   label: 'Family Law — 3 Analyses',       product: 'family_analysis' },
  criminal_analysis_pack: { priceId: () => STRIPE_PRICES.criminal_analysis_pack, label: 'Criminal Defence — 3 Analyses', product: 'criminal_analysis' },
  analysis_pack:          { priceId: () => STRIPE_PRICES.criminal_analysis_pack, label: 'Analysis Pack — 3 Analyses',    product: 'criminal_analysis' },
};

// ClearSplit — all reference STRIPE_PRICES
const CLEARSPLIT_PRODUCTS = {
  clearsplit_standard:   { priceId: () => STRIPE_PRICES.clearsplit_standard,   amount: 29900, label: 'ClearSplit — Standard' },
  clearsplit_subscriber: { priceId: () => STRIPE_PRICES.clearsplit_subscriber,  amount: 24900, label: 'ClearSplit — Subscriber' },
  clearsplit_extension:  { priceId: () => STRIPE_PRICES.clearsplit_extension,   amount: 7400,  label: 'ClearSplit — 30-Day Extension' },
};

let stripe;
const getStripe = () => {
  if (!stripe) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
};

const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

// ══════════════════════════════════════════════════
// TEMPORARY DEBUG — remove after testing
router.get('/debug-users', (req, res) => {
  try {
    const { db } = require('../db');
    const users = db.prepare('SELECT id, email, plan, subscription_status, products FROM users').all();
    res.json(users);
  } catch(e) {
    res.json({ error: e.message });
  }
});

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

      // Check ClearSplit discount eligibility
      const isClearSplitEligible = !!(user.clearsplit_subscriber || user.plan === 'clearsplit');
      const sessionParams = {
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
      };
      if (isClearSplitEligible) {
        sessionParams.discounts = [{ coupon: STRIPE_COUPONS.clearsplit_discount }];
      }
      session = await s.checkout.sessions.create(sessionParams);
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
// Detects subscriber discount automatically via price ID selection
// ══════════════════════════════════════════════════
router.post('/clearsplit/checkout', async (req, res) => {
  const { existingCode } = req.body;
  const s = getStripe();

  // ── ELIGIBILITY CHECK ──
  let userId = null;
  let isSubscriber = false;
  let diagUser = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const { verifyToken } = require('../middleware/auth');
      const decoded = verifyToken(authHeader.slice(7));
      if (decoded) {
        const { getUserById, db } = require('../db');
        const user = getUserById(decoded.userId);
        diagUser = user;

        // Fix 2: Self-heal subscription_status for paid users affected by webhook failures
        if (user && user.plan && user.plan !== 'free' && user.subscription_status === 'inactive') {
          db.prepare(`UPDATE users SET subscription_status='active' WHERE id=?`).run(user.id);
          user.subscription_status = 'active';
          console.log(`[ClearSplit] Healed subscription_status for user ${user.email}`);
        }

        // Fix 2: Exact eligibility condition
        isSubscriber = !!(
          user && (
            user.subscription_status === 'active' ||
            user.subscription_status === 'trialing' ||
            (user.plan && user.plan !== 'free')
          )
        );

        if (isSubscriber) {
          userId = user.id;
        }
      }
    } catch(e) {
      console.warn('[ClearSplit] Token verification failed:', e.message);
    }
  }

  try {
    let productKey, successUrl, cancelUrl;

    if (existingCode) {
      const { getClearSplitPurchase } = require('../db');
      const purchase = getClearSplitPurchase(existingCode);
      if (!purchase) return res.status(404).json({ error: 'Code not found.' });
      const now = new Date();
      const expiry = new Date(purchase.expires_at);
      const gracePeriod = new Date(expiry.getTime() + 30 * 24 * 60 * 60 * 1000);
      if (now > gracePeriod) return res.status(400).json({ error: 'Code expired more than 30 days ago. Cannot extend.' });
      productKey = 'clearsplit_extension';
      successUrl = `${APP_URL()}/clearsplit/extended?code=${existingCode}&session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl  = `${APP_URL()}/clearsplit/extend`;
    } else {
      // Fix 3: Explicit price ID selection via STRIPE_PRICES
      productKey = isSubscriber ? 'clearsplit_subscriber' : 'clearsplit_standard';
      successUrl = `${APP_URL()}/clearsplit/success?session_id={CHECKOUT_SESSION_ID}`;
      cancelUrl  = `${APP_URL()}/clearsplit`;
    }

    const product = CLEARSPLIT_PRODUCTS[productKey];
    const priceId = product.priceId();

    // Fix 3: Explicit price ID validation with clear error
    if (!priceId) {
      console.error(`[ClearSplit] Missing price ID for ${productKey} — isSubscriber: ${isSubscriber}`);
      console.error(`[ClearSplit] STRIPE_PRICES.clearsplit_subscriber = ${STRIPE_PRICES.clearsplit_subscriber}`);
      console.error(`[ClearSplit] STRIPE_PRICES.clearsplit_standard = ${STRIPE_PRICES.clearsplit_standard}`);
      return res.status(500).json({ error: `Price configuration error for ${productKey}. Please contact support.` });
    }

    // Fix 4: Diagnostic logging — visible in Railway logs on every checkout attempt
    console.log('[ClearSplit] Checkout initiated', {
      userId:             diagUser?.id || 'no token',
      userEmail:          diagUser?.email || 'no user found',
      userPlan:           diagUser?.plan || 'no user found',
      subscriptionStatus: diagUser?.subscription_status || 'unknown',
      isSubscriber,
      productKey,
      priceIdSelected:    priceId ? 'found ✓' : 'MISSING ✗',
      timestamp:          new Date().toISOString(),
    });

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
    console.error('[ClearSplit] Checkout error:', err);
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
// POST /api/billing/preview-upgrade
// Calculate proration before committing upgrade
// ══════════════════════════════════════════════════
router.post('/preview-upgrade', requireAuth, async (req, res) => {
  const { newPlanKey } = req.body;
  const user = req.user;
  const s = getStripe();

  const meta = PLAN_META[newPlanKey];
  if (!meta) return res.status(400).json({ error: 'Invalid plan.' });
  const newPriceId = meta.priceId();
  if (!newPriceId) return res.status(500).json({ error: 'Price not configured.' });

  if (!user.stripe_customer_id || !user.stripe_subscription_id) {
    return res.status(400).json({ error: 'No active subscription found.' });
  }

  try {
    const subscription = await s.subscriptions.retrieve(user.stripe_subscription_id);
    const currentItemId = subscription.items.data[0]?.id;
    if (!currentItemId) return res.status(400).json({ error: 'Subscription item not found.' });

    const preview = await s.invoices.retrieveUpcoming({
      customer: user.stripe_customer_id,
      subscription: user.stripe_subscription_id,
      subscription_items: [{ id: currentItemId, price: newPriceId }],
      subscription_proration_behavior: 'create_prorations',
    });

    const dueToday = preview.amount_due / 100;
    const nextAmount = preview.lines.data.find(l => !l.proration)?.amount / 100 || meta.price;
    const creditLine = preview.lines.data.find(l => l.proration && l.amount < 0);
    const creditAmount = creditLine ? Math.abs(creditLine.amount / 100) : 0;
    const nextDate = new Date(preview.period_end * 1000).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });

    // Check ClearSplit discount eligibility
    const isClearSplitEligible = !!(user.clearsplit_subscriber || user.plan === 'clearsplit');
    const discountAmount = isClearSplitEligible ? parseFloat((nextAmount * 0.2).toFixed(2)) : 0;
    const discountedPrice = isClearSplitEligible ? parseFloat((nextAmount - discountAmount).toFixed(2)) : nextAmount;

    res.json({
      creditAmount:       `$${creditAmount.toFixed(2)}`,
      dueToday:           `$${Math.max(0, dueToday).toFixed(2)}`,
      nextBillingDate:    nextDate,
      nextBillingAmount:  `$${discountedPrice.toFixed(2)}`,
      newPlanName:        meta.label,
      newPlanKey,
      newPriceId,
      currentItemId,
      isClearSplitEligible,
      discountAmount:     discountAmount > 0 ? `$${discountAmount.toFixed(2)}` : null,
    });
  } catch(err) {
    console.error('[Preview upgrade error]', err.message);
    res.status(500).json({ error: 'Could not calculate upgrade preview. Please try again.' });
  }
});

// ══════════════════════════════════════════════════
// POST /api/billing/upgrade-subscription
// Execute immediate subscription upgrade
// ══════════════════════════════════════════════════
router.post('/upgrade-subscription', requireAuth, async (req, res) => {
  const { newPlanKey, currentItemId } = req.body;
  const user = req.user;
  const s = getStripe();

  const meta = PLAN_META[newPlanKey];
  if (!meta) return res.status(400).json({ error: 'Invalid plan.' });
  const newPriceId = meta.priceId();
  if (!newPriceId) return res.status(500).json({ error: 'Price not configured.' });

  if (!user.stripe_subscription_id) {
    return res.status(400).json({ error: 'No active subscription found.' });
  }

  try {
    const updateParams = {
      items: [{ id: currentItemId, price: newPriceId }],
      proration_behavior: 'create_prorations',
      billing_cycle_anchor: 'unchanged',
      metadata: { userId: String(user.id), plan: meta.plan, products: meta.products },
    };

    // Apply ClearSplit discount if eligible
    if (user.clearsplit_subscriber) {
      updateParams.discounts = [{ coupon: STRIPE_COUPONS.clearsplit_discount }];
    }

    await s.subscriptions.update(user.stripe_subscription_id, updateParams);

    // Immediately update user record
    updateUserPlan(user.id, meta.plan, meta.products, user.stripe_subscription_id, null, 'active');

    console.log(`[Upgrade] User ${user.id} → ${newPlanKey}`);
    res.json({
      success: true,
      newPlan: meta.label,
      products: meta.products,
      accessUnlocked: meta.products === 'both' ? ['family', 'criminal'] : [meta.products],
    });
  } catch(err) {
    console.error('[Upgrade error]', err.message);
    res.status(500).json({ error: 'Upgrade failed. Your plan has not been changed. Please try again.' });
  }
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
        const plan     = sub.metadata?.plan     || 'essential';
        const products = sub.metadata?.products || 'criminal';
        const status   = sub.status;
        const nextBilling = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        if (status === 'active' || status === 'trialing') {
          updateUserPlan(userId, plan, products, sub.id, sub.current_period_end, status);
        } else if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
          updateUserPlan(userId, 'free', products, sub.id, null, status);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = parseInt(sub.metadata?.userId);
        if (!userId) break;
        updateUserPlan(userId, 'free', sub.metadata?.products || 'criminal', null, null, 'canceled');
        console.log(`[Webhook] Subscription canceled for user ${userId}`);
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object;
        const custId = inv.customer;
        console.error(`[Webhook] Payment failed — customer: ${custId}, invoice: ${inv.id}`);
        // Grace period handled by Stripe Smart Retries — we log only
        // Access restriction happens via subscription.updated → past_due
        break;
      }

      case 'invoice.payment_succeeded': {
        const inv = event.data.object;
        if (inv.billing_reason === 'subscription_cycle') {
          // Renewal — confirm access is active
          const sub = await getStripe().subscriptions.retrieve(inv.subscription);
          const userId = parseInt(sub.metadata?.userId);
          if (userId && (sub.status === 'active')) {
            const plan     = sub.metadata?.plan     || 'essential';
            const products = sub.metadata?.products || 'criminal';
            updateUserPlan(userId, plan, products, sub.id, sub.current_period_end, 'active');
          }
        }
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
module.exports.STRIPE_PRICES = STRIPE_PRICES;
module.exports.STRIPE_COUPONS = STRIPE_COUPONS;
module.exports.webhookHandler = router;
