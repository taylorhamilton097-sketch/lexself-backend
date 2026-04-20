#!/usr/bin/env node
'use strict';

/**
 * verify-stripe-prices.js
 *
 * Session 1a verification — run BEFORE deploying any code changes.
 * Confirms every STRIPE_PRICE_* env var resolves to an active, correctly-priced
 * Stripe price object.
 *
 * Run locally (not on Railway):
 *   1. Copy your Railway env vars into a local .env file (or export them in PowerShell)
 *   2. Ensure STRIPE_SECRET_KEY is set
 *   3. node scripts/verify-stripe-prices.js
 *
 * Exit code 0 = all green. Exit code 1 = one or more failures.
 */

require('dotenv').config();

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error('❌ STRIPE_SECRET_KEY not set. Aborting.');
  process.exit(1);
}

const stripe = require('stripe')(SECRET);

// ── EXPECTED PRICES ──
// [envVar, expectedAmountCents, expectedInterval, label]
// interval: 'month' | 'year' | null (null = one-time)
const EXPECTED = [
  // Criminal standalone
  ['STRIPE_PRICE_CRIMINAL_ESSENTIAL_MONTHLY',   2900,   'month', 'Criminal Essential Monthly'],
  ['STRIPE_PRICE_CRIMINAL_ESSENTIAL_ANNUAL',   24900,   'year',  'Criminal Essential Annual'],
  ['STRIPE_PRICE_CRIMINAL_COMPLETE_MONTHLY',    6900,   'month', 'Criminal Complete Monthly'],
  ['STRIPE_PRICE_CRIMINAL_COMPLETE_ANNUAL',    58900,   'year',  'Criminal Complete Annual'],
  ['STRIPE_PRICE_CRIMINAL_COUNSEL_MONTHLY',    14900,   'month', 'Criminal Counsel Monthly'],
  ['STRIPE_PRICE_CRIMINAL_COUNSEL_ANNUAL',    124900,   'year',  'Criminal Counsel Annual'],

  // Family standalone
  ['STRIPE_PRICE_FAMILY_ESSENTIAL_MONTHLY',     2900,   'month', 'Family Essential Monthly'],
  ['STRIPE_PRICE_FAMILY_ESSENTIAL_ANNUAL',     24900,   'year',  'Family Essential Annual'],
  ['STRIPE_PRICE_FAMILY_COMPLETE_MONTHLY',      6900,   'month', 'Family Complete Monthly'],
  ['STRIPE_PRICE_FAMILY_COMPLETE_ANNUAL',      58900,   'year',  'Family Complete Annual'],
  ['STRIPE_PRICE_FAMILY_COUNSEL_MONTHLY',      14900,   'month', 'Family Counsel Monthly'],
  ['STRIPE_PRICE_FAMILY_COUNSEL_ANNUAL',      124900,   'year',  'Family Counsel Annual'],

  // Bundle
  ['STRIPE_PRICE_BUNDLE_ESSENTIAL_MONTHLY',     4900,   'month', 'Bundle Essential Monthly'],
  ['STRIPE_PRICE_BUNDLE_ESSENTIAL_ANNUAL',     41900,   'year',  'Bundle Essential Annual'],
  ['STRIPE_PRICE_BUNDLE_COMPLETE_MONTHLY',     10900,   'month', 'Bundle Complete Monthly'],
  ['STRIPE_PRICE_BUNDLE_COMPLETE_ANNUAL',      92900,   'year',  'Bundle Complete Annual'],
  ['STRIPE_PRICE_BUNDLE_COUNSEL_MONTHLY',      23900,   'month', 'Bundle Counsel Monthly'],
  ['STRIPE_PRICE_BUNDLE_COUNSEL_ANNUAL',      202900,   'year',  'Bundle Counsel Annual'],

  // Analysis packs (one-time)
  ['STRIPE_PRICE_FAMILY_ANALYSIS_PACK',         1900,   null,    'Family Analysis Pack (3 analyses)'],
  ['STRIPE_PRICE_CRIMINAL_ANALYSIS_PACK',       1900,   null,    'Criminal Analysis Pack (3 analyses)'],
];

// ClearSplit prices — verified but not restructured in Session 1a
const CLEARSPLIT = [
  ['STRIPE_PRICE_CLEARSPLIT_STANDARD',         29900,   null,    'ClearSplit Standard'],
  ['STRIPE_PRICE_CLEARSPLIT_SUBSCRIBER',       24900,   null,    'ClearSplit Subscriber'],
  ['STRIPE_PRICE_CLEARSPLIT_EXTENSION',         7400,   null,    'ClearSplit Extension'],
];

const fmt = (cents) => `$${(cents / 100).toFixed(2)}`;

async function checkPrice(envVar, expectedAmount, expectedInterval, label) {
  const priceId = process.env[envVar];

  if (!priceId) {
    return { ok: false, envVar, label, error: 'ENV VAR NOT SET in Railway' };
  }

  if (!priceId.startsWith('price_')) {
    return { ok: false, envVar, label, error: `Invalid format: "${priceId}" (should start with price_)` };
  }

  try {
    const price = await stripe.prices.retrieve(priceId);

    const issues = [];
    if (!price.active) issues.push('ARCHIVED (set to active in Stripe)');
    if (price.unit_amount !== expectedAmount) {
      issues.push(`amount is ${fmt(price.unit_amount)}, expected ${fmt(expectedAmount)}`);
    }
    if (price.currency !== 'cad') {
      issues.push(`currency is ${price.currency.toUpperCase()}, expected CAD`);
    }

    const actualInterval = price.recurring?.interval || null;
    if (actualInterval !== expectedInterval) {
      const got = actualInterval || 'one-time';
      const want = expectedInterval || 'one-time';
      issues.push(`interval is ${got}, expected ${want}`);
    }

    if (issues.length > 0) {
      return { ok: false, envVar, label, priceId, error: issues.join('; ') };
    }

    return {
      ok: true,
      envVar,
      label,
      priceId,
      display: `${fmt(price.unit_amount)} ${price.currency.toUpperCase()} ${expectedInterval ? '/ ' + expectedInterval : '(one-time)'}`,
    };
  } catch (err) {
    return { ok: false, envVar, label, priceId, error: `Stripe API: ${err.message}` };
  }
}

(async () => {
  console.log('════════════════════════════════════════════════════════════');
  console.log('  ClearStand Session 1a — Stripe Price Verification');
  console.log('════════════════════════════════════════════════════════════\n');

  const allChecks = [...EXPECTED, ...CLEARSPLIT];
  const results = await Promise.all(
    allChecks.map(([env, amt, ival, lbl]) => checkPrice(env, amt, ival, lbl))
  );

  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  console.log('── SUBSCRIPTION & ANALYSIS PACK PRICES ──\n');
  for (let i = 0; i < EXPECTED.length; i++) {
    const r = results[i];
    const marker = r.ok ? '✓' : '✗';
    if (r.ok) {
      console.log(`  ${marker} ${r.label.padEnd(36)} ${r.display.padEnd(20)} [${r.priceId}]`);
    } else {
      console.log(`  ${marker} ${r.label.padEnd(36)} ${r.envVar}`);
      console.log(`      └─ ${r.error}`);
    }
  }

  console.log('\n── CLEARSPLIT PRICES (unchanged, verified only) ──\n');
  for (let i = EXPECTED.length; i < allChecks.length; i++) {
    const r = results[i];
    const marker = r.ok ? '✓' : '✗';
    if (r.ok) {
      console.log(`  ${marker} ${r.label.padEnd(36)} ${r.display.padEnd(20)} [${r.priceId}]`);
    } else {
      console.log(`  ${marker} ${r.label.padEnd(36)} ${r.envVar}`);
      console.log(`      └─ ${r.error}`);
    }
  }

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`  RESULT: ${passed.length} passed, ${failed.length} failed`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (failed.length > 0) {
    console.log('❌ DO NOT DEPLOY until all checks pass.\n');
    process.exit(1);
  } else {
    console.log('✅ All price IDs verified. Safe to proceed to Session 1b.\n');
    process.exit(0);
  }
})();
