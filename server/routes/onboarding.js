'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getOnboardingState,
  markOnboardingStepComplete,
  setOnboardingDismissed,
  computeOnboardingStatus,
} = require('../db');
const { getStepsForProduct } = require('../config/onboarding');

// Plans that skip onboarding by default.
// Counsel users are sophisticated buyers; admins are Taylor.
// They can still opt-in by calling POST /state/undismiss.
const SKIP_ONBOARDING_PLANS = new Set(['counsel', 'admin']);

function resolveProduct(req) {
  const raw = (req.query.product || req.body?.product || '').toString().toLowerCase();
  return raw === 'family' ? 'family' : 'criminal';
}

// ──────────────────────────────────────────────────
// GET /api/onboarding/state?product=criminal|family
// ──────────────────────────────────────────────────
router.get('/state', requireAuth, (req, res) => {
  const product = resolveProduct(req);
  const steps = getStepsForProduct(product);

  // Clients get the full step list so they can render the checklist
  // without a second round-trip for step metadata.
  const stateRow = getOnboardingState(req.user.id);
  const skipForPlan = SKIP_ONBOARDING_PLANS.has(req.user.plan || '');

  // Compute completion from existing tables. This is what makes the
  // feature safe to deploy to existing users: a pre-existing analysis
  // counts as a completed step without any backfill migration.
  const completed = computeOnboardingStatus(req.user.id, product, steps);

  res.json({
    product,
    steps: steps.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      ctaLabel: s.ctaLabel,
      ctaAction: s.ctaAction,
    })),
    completed,
    dismissed: !!stateRow?.dismissed,
    skipForPlan,     // client uses this to hide the checklist for counsel/admin
    plan: req.user.plan || 'free',
  });
});

// ──────────────────────────────────────────────────
// POST /api/onboarding/step   { stepId, product }
// Records an explicit completion (e.g. user clicked "Mark complete").
// Most steps will auto-complete via computeOnboardingStatus, but some
// flows may want a client-driven nudge.
// ──────────────────────────────────────────────────
router.post('/step', requireAuth, (req, res) => {
  const product = resolveProduct(req);
  const stepId = (req.body?.stepId || '').toString();
  const steps = getStepsForProduct(product);
  if (!steps.find(s => s.id === stepId)) {
    return res.status(400).json({ error: 'Unknown step.' });
  }
  markOnboardingStepComplete(req.user.id, product, stepId);
  res.json({ success: true });
});

// ──────────────────────────────────────────────────
// POST /api/onboarding/dismiss
// ──────────────────────────────────────────────────
router.post('/dismiss', requireAuth, (req, res) => {
  setOnboardingDismissed(req.user.id, true);
  res.json({ success: true });
});

// ──────────────────────────────────────────────────
// POST /api/onboarding/undismiss
// User reopens the checklist from the sidebar footer link.
// ──────────────────────────────────────────────────
router.post('/undismiss', requireAuth, (req, res) => {
  setOnboardingDismissed(req.user.id, false);
  res.json({ success: true });
});

module.exports = router;
