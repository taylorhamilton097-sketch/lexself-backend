'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getUserById, updateUserPlan, updateStripeCustomer, addOneTimePurchase } = require('../db');

const STRIPE_PRICES = {
  essential:          () => process.env.STRIPE_PRICE_ESSENTIAL,
  complete:           () => process.env.STRIPE_PRICE_COMPLETE,
  counsel:            () => process.env.STRIPE_PRICE_COUNSEL,
  analysis_pack:      () => process.env.STRIPE_PRICE_ANALYSIS_PACK,
  essential_annual:   () => process.env.STRIPE_PRICE_ESSENTIAL_ANNUAL,
  complete_annual:    () => process.env.STRIPE_PRICE_COMPLETE_ANNUAL,
  counsel_annual:     () => process.env.STRIPE_PRICE_COUNSEL_ANNUAL,
};

let stripe;
const getStripe = () => {
  if (!stripe) stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
};

const APP_URL = () => process.env.APP_URL || 'http://localhost:3000';

// Plan metadata for checkout
const PLAN_META = {
  essential:          { priceId: STRIPE_PRICES.essential,         plan: 'essential', products: 'both', label: 'ClearStand Essential' },
  complete:           { priceId: STRIPE_PRICES.complete,          plan: 'complete',  products: 'both', label: 'ClearStand Complete' },
  counsel:            { priceId: STRIPE_PRICES.counsel,           plan: 'counsel',   products: 'both', label: 'ClearStand Counsel' },
  essential_annual:   { priceId: STRIPE_PRICES.essential_annual,  plan: 'essential', products: 'both', label: 'ClearStand Essential Annual' },
  complete_annual:    { priceId: STRIPE_PRICES.complete_annual,   plan: 'complete',  products: 'both', label: 'ClearStand Complete Annual' },
  counsel_annual:     { priceId: STRIPE_PRICES.counsel_annual,    plan: 'counsel',   products: 'both', label: 'ClearStand Counsel Annual' },
  // Legacy keys for backward compatibility
  essential_criminal: { priceId: STRIPE_PRICES.essential,         plan: 'essential', products: 'criminal', label: 'ClearStand Essential' },
  essential_family:   { priceId: STRIPE_PRICES.essential,         plan: 'essential', products: 'family',   label: 'ClearStand Essential' },
};

// One-time analysis pack
const ONE_TIME = {
  analysis_pack: { priceId: STRIPE_PRICES.analysis_pack, label: 'ClearStand Analysis Pack — 3 Analyses', currency: 'cad' },
};

// POST /api/billing/checkout
router.post('/checkout', requireAuth, async (req, res) => {
  const { planKey } = req.body; // e.g. 'criminal_essential', 'family_complete', 'criminal_analysis'
  const user = req.user;
  const s = getStripe();

  const successUrl = `${APP_URL()}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl  = `${APP_URL()}/?cancelled=1`;

  try {
    // Ensure Stripe customer
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
      // One-time payment using Stripe Price ID
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
        metadata: { userId: String(user.id), product: planKey },
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

// POST /api/billing/portal
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

// GET /api/billing/plans — public
router.get('/plans', (req, res) => {
  res.json({
    criminal: [
      { id:'criminal_essential', label:'Essential', price:29, currency:'CAD', period:'month',
        features:['3 analyses/month','50 chat messages/day','All charge modules','Full 5-pass reports','PDF export'] },
      { id:'criminal_complete',  label:'Complete',  price:79, currency:'CAD', period:'month', popular:true,
        features:['Unlimited analyses','Unlimited chat','All charge modules','Full 5-pass reports','PDF export','Priority features'] },
      { id:'criminal_analysis',  label:'Single Analysis', price:29, currency:'CAD', oneTime:true,
        features:['One full analysis','No subscription','Full defence report','Stinchcombe letter'] },
    ],
    family: [
      { id:'family_essential', label:'Essential', price:29, currency:'CAD', period:'month',
        features:['Unlimited document prep','50 chat messages/day','All Ontario forms','Profile auto-fill','PDF export','Voice-to-affidavit'] },
      { id:'family_complete',  label:'Complete',  price:79, currency:'CAD', period:'month', popular:true,
        features:['Unlimited everything','All Ontario forms','Caselaw references','Profile auto-fill','PDF export','Voice-to-affidavit','Priority features'] },
    ],
    both: [
      { id:'both_essential', label:'Both — Essential', price:39.99, currency:'CAD', period:'month',
        features:['Criminal + Family Law','3 analyses/month','50 chats/day','All features','Single login'] },
      { id:'both_complete',  label:'Both — Complete',  price:79, currency:'CAD', period:'month', popular:true,
        features:['Criminal + Family Law','Unlimited everything','All features','Single login','Best value'] },
    ],
    free: { features:['1 disclosure analysis','10 chat messages','All charge modules'] },
  });
});

// POST /api/billing/webhook — MUST use raw body
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
        if (!userId) break;
        if (session.mode === 'payment') {
          // One-time purchase
          addOneTimePurchase(userId, session.metadata.product, session.payment_intent);
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
        updateUserPlan(userId, 'free', 'criminal', null, null, 'canceled');
        break;
      }
    }
  } catch(err) {
    console.error('Webhook handler error:', err);
  }

  res.json({ received: true });
});

module.exports = router;
