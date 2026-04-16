'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/lexself.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA ──
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    email                 TEXT    UNIQUE NOT NULL COLLATE NOCASE,
    password              TEXT    NOT NULL,
    name                  TEXT    NOT NULL DEFAULT '',
    plan                  TEXT    NOT NULL DEFAULT 'free',
    products              TEXT    NOT NULL DEFAULT 'criminal',
    stripe_customer_id    TEXT,
    stripe_subscription_id TEXT,
    subscription_status   TEXT    DEFAULT 'inactive',
    plan_period_end       INTEGER,
    created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS usage (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product     TEXT    NOT NULL DEFAULT 'criminal',
    type        TEXT    NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS one_time_purchases (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product              TEXT    NOT NULL,
    stripe_payment_intent TEXT,
    used                 INTEGER NOT NULL DEFAULT 0,
    created_at           INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS case_profiles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product     TEXT    NOT NULL DEFAULT 'criminal',
    data        TEXT    NOT NULL DEFAULT '{}',
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, product)
  );

  CREATE INDEX IF NOT EXISTS idx_usage_user    ON usage(user_id, product, type);
  CREATE INDEX IF NOT EXISTS idx_usage_created ON usage(created_at);
  CREATE INDEX IF NOT EXISTS idx_users_email   ON users(email);
`);

// ── CLEARSPLIT SCHEMA ──
db.exec(`
  CREATE TABLE IF NOT EXISTS clearsplit_agreements (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    code                TEXT    UNIQUE NOT NULL,
    party1_user_id      INTEGER NOT NULL REFERENCES users(id),
    party2_user_id      INTEGER REFERENCES users(id),
    stripe_payment_id   TEXT    NOT NULL,
    stripe_product      TEXT    NOT NULL,
    amount_paid         INTEGER NOT NULL,
    purchased_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    active_until        DATETIME NOT NULL,
    extended_at         DATETIME,
    extension_until     DATETIME,
    status              TEXT    NOT NULL DEFAULT 'active',
    agreement_data      TEXT    NOT NULL DEFAULT '{}',
    last_modified_at    DATETIME,
    last_modified_by    INTEGER REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_csa_code     ON clearsplit_agreements(code);
  CREATE INDEX IF NOT EXISTS idx_csa_party1   ON clearsplit_agreements(party1_user_id);
  CREATE INDEX IF NOT EXISTS idx_csa_party2   ON clearsplit_agreements(party2_user_id);
  CREATE INDEX IF NOT EXISTS idx_csa_payment  ON clearsplit_agreements(stripe_payment_id);
`);

// Add ClearSplit columns to users if they don't exist
// (SQLite doesn't support IF NOT EXISTS for columns — use try/catch)
try { db.exec(`ALTER TABLE users ADD COLUMN clearsplit_role TEXT DEFAULT NULL`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN clearsplit_agreement_id INTEGER REFERENCES clearsplit_agreements(id) DEFAULT NULL`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN clearsplit_subscriber INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN stripe_price_id TEXT DEFAULT NULL`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN next_billing_date TEXT DEFAULT NULL`); } catch(e) {}

// ── STARTUP HEAL — fix users with paid plan but inactive status ──
// Self-heals any accounts affected by past webhook failures
try {
  const healed = db.prepare(`
    UPDATE users
    SET subscription_status = 'active'
    WHERE plan != 'free'
      AND plan IS NOT NULL
      AND subscription_status = 'inactive'
  `).run();
  if (healed.changes > 0) {
    console.log(`[DB] Healed subscription_status for ${healed.changes} user(s)`);
  }
} catch(e) {
  console.error('[DB] Healing query error:', e.message);
}

// ── PLAN CONFIG ──
// products: 'criminal' | 'family' | 'both'
// plan:     'free' | 'essential' | 'complete'
const PLANS = {
  free: {
    label: 'Free',
    chatPerDay: null, chatLifetime: 10,
    analysisPerMonth: null, analysisLifetime: 1,
    price: 0,
  },
  essential: {
    label: 'Essential',
    chatPerDay: 50, analysisPerMonth: 3,
    price: 2900,
  },
  complete: {
    label: 'Complete',
    chatPerDay: 100, analysisPerMonth: 5,
    price: 7900,
  },
  counsel: {
    label: 'Counsel',
    chatPerDay: Infinity, analysisPerMonth: Infinity,
    price: 15900,
  },
  admin: {
    label: 'Admin',
    chatPerDay: Infinity, analysisPerMonth: Infinity,
    price: 0,
  },
};

// Stripe price IDs — set in env
const STRIPE_PRICES = {
  // Criminal only
  criminal_essential: process.env.STRIPE_PRICE_CRIMINAL_ESSENTIAL,
  criminal_complete:  process.env.STRIPE_PRICE_CRIMINAL_COMPLETE,
  // Family only
  family_essential:   process.env.STRIPE_PRICE_FAMILY_ESSENTIAL,
  family_complete:    process.env.STRIPE_PRICE_FAMILY_COMPLETE,
  // Both products
  both_essential:     process.env.STRIPE_PRICE_BOTH_ESSENTIAL,
  both_complete:      process.env.STRIPE_PRICE_BOTH_COMPLETE,
};

// ── TIME HELPERS ──
const daysAgo = n => Math.floor(Date.now()/1000) - n * 86400;
const todayStart = () => { const d=new Date(); d.setHours(0,0,0,0); return Math.floor(d/1000); };
const monthStart = () => { const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return Math.floor(d/1000); };

// ── USAGE ──
function getChatCount(userId, product) {
  const plan = PLANS[db.prepare('SELECT plan FROM users WHERE id=?').get(userId)?.plan || 'free'];
  if (!plan.chatPerDay) {
    // Free: lifetime limit
    return db.prepare(`SELECT COUNT(*) as n FROM usage WHERE user_id=? AND product=? AND type='chat'`).get(userId, product).n;
  }
  return db.prepare(`SELECT COUNT(*) as n FROM usage WHERE user_id=? AND product=? AND type='chat' AND created_at>=?`).get(userId, product, todayStart()).n;
}

function getAnalysisCount(userId, product) {
  const user = db.prepare('SELECT plan FROM users WHERE id=?').get(userId);
  const plan = PLANS[user?.plan || 'free'];
  if (!plan.analysisPerMonth) {
    return db.prepare(`SELECT COUNT(*) as n FROM usage WHERE user_id=? AND product=? AND type='analysis'`).get(userId, product).n;
  }
  return db.prepare(`SELECT COUNT(*) as n FROM usage WHERE user_id=? AND product=? AND type='analysis' AND created_at>=?`).get(userId, product, monthStart()).n;
}

function hasOneTimePurchase(userId, product) {
  return !!db.prepare(`SELECT id FROM one_time_purchases WHERE user_id=? AND product=? AND used=0`).get(userId, product);
}

function markOneTimeUsed(userId, product) {
  db.prepare(`UPDATE one_time_purchases SET used=1 WHERE user_id=? AND product=? AND used=0`).run(userId, product);
}

function recordUsage(userId, product, type) {
  db.prepare(`INSERT INTO usage (user_id, product, type) VALUES (?,?,?)`).run(userId, product, type);
}

function checkAccess(user, product) {
  // Check product access
  const userProducts = user.products || 'criminal';
  if (userProducts !== 'both' && userProducts !== product) {
    return { allowed: false, reason: 'wrong_product', message: `Your plan does not include LexSelf ${product.charAt(0).toUpperCase() + product.slice(1)}.` };
  }
  return { allowed: true };
}

function checkLimit(user, product, action) {
  // Product access check first
  const access = checkAccess(user, product);
  if (!access.allowed) return { allowed: false, ...access };

  const plan = PLANS[user.plan] || PLANS.free;

  if (action === 'chat') {
    const isFree = user.plan === 'free';
    const used = getChatCount(user.id, product);
    const limit = isFree ? plan.chatLifetime : plan.chatPerDay;
    if (limit !== Infinity && used >= limit) {
      return {
        allowed: false,
        reason: isFree ? 'free_chat_exhausted' : 'daily_chat_limit',
        used, limit,
      };
    }
    return { allowed: true, used, limit };
  }

  if (action === 'analysis') {
    if (hasOneTimePurchase(user.id, product + '_analysis')) {
      return { allowed: true, oneTime: true };
    }
    const isFree = user.plan === 'free';
    const used = getAnalysisCount(user.id, product);
    const limit = isFree ? plan.analysisLifetime : plan.analysisPerMonth;
    if (limit !== Infinity && used >= limit) {
      return {
        allowed: false,
        reason: isFree ? 'free_analysis_exhausted' : 'monthly_analysis_limit',
        used, limit,
      };
    }
    return { allowed: true, used, limit };
  }

  return { allowed: false, reason: 'unknown_action' };
}

// ── USER CRUD ──
function createUser(email, passwordHash, name, products = 'criminal') {
  return db.prepare(`INSERT INTO users (email,password,name,products) VALUES (?,?,?,?) RETURNING *`).get(
    email.toLowerCase().trim(), passwordHash, name, products
  );
}
function getUserByEmail(email) {
  return db.prepare(`SELECT * FROM users WHERE email=?`).get(email.toLowerCase().trim());
}
function getUserById(id) {
  return db.prepare(`SELECT * FROM users WHERE id=?`).get(id);
}
function updateUserPlan(userId, plan, products, stripeSubId, periodEnd, status) {
  db.prepare(`UPDATE users SET plan=?,products=?,stripe_subscription_id=?,plan_period_end=?,subscription_status=?,updated_at=unixepoch() WHERE id=?`)
    .run(plan, products, stripeSubId, periodEnd, status, userId);
}
function updateStripeCustomer(userId, customerId) {
  db.prepare(`UPDATE users SET stripe_customer_id=?,updated_at=unixepoch() WHERE id=?`).run(customerId, userId);
}
function addOneTimePurchase(userId, product, paymentIntentId) {
  db.prepare(`INSERT INTO one_time_purchases (user_id,product,stripe_payment_intent) VALUES (?,?,?)`).run(userId, product, paymentIntentId);
}

// ── CASE PROFILES ──
function getCaseProfile(userId, product) {
  const row = db.prepare(`SELECT data FROM case_profiles WHERE user_id=? AND product=?`).get(userId, product);
  return row ? JSON.parse(row.data) : {};
}
function saveCaseProfile(userId, product, data) {
  db.prepare(`INSERT INTO case_profiles (user_id,product,data,updated_at) VALUES (?,?,?,unixepoch())
    ON CONFLICT(user_id,product) DO UPDATE SET data=excluded.data,updated_at=unixepoch()`)
    .run(userId, product, JSON.stringify(data));
}

// ── USAGE SUMMARY ──
function getUserUsageSummary(user, product) {
  const plan = PLANS[user.plan] || PLANS.free;
  const isFree = user.plan === 'free';
  return {
    plan: user.plan,
    planLabel: plan.label,
    products: user.products,
    chat: {
      used: getChatCount(user.id, product),
      limit: isFree ? plan.chatLifetime : plan.chatPerDay,
      resetLabel: isFree ? 'lifetime' : 'daily',
    },
    analysis: {
      used: getAnalysisCount(user.id, product),
      limit: isFree ? plan.analysisLifetime : plan.analysisPerMonth,
      resetLabel: isFree ? 'lifetime' : 'monthly',
      hasOneTime: hasOneTimePurchase(user.id, product + '_analysis'),
    },
  };
}

// ── CLEARSPLIT AGREEMENTS ──
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateClearSplitCode() {
  let code, attempts = 0;
  do {
    code = Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
    attempts++;
    if (attempts > 50) throw new Error('Code generation failed');
  } while (db.prepare('SELECT id FROM clearsplit_agreements WHERE code=?').get(code));
  return code;
}

function createClearSplitAgreement({ party1UserId, stripePaymentId, stripeProduct, amountPaid }) {
  const code = generateClearSplitCode();
  const now = new Date();
  const activeUntil = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  db.prepare(`
    INSERT INTO clearsplit_agreements
      (code, party1_user_id, stripe_payment_id, stripe_product, amount_paid, active_until)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(code, party1UserId, stripePaymentId, stripeProduct, amountPaid, activeUntil.toISOString());
  const agreement = getClearSplitAgreementByCode(code);
  // Link party1 user to agreement
  db.prepare(`UPDATE users SET clearsplit_role='purchaser', clearsplit_agreement_id=? WHERE id=?`)
    .run(agreement.id, party1UserId);
  return agreement;
}

function getClearSplitAgreementByCode(code) {
  return db.prepare('SELECT * FROM clearsplit_agreements WHERE code=?').get(code.toUpperCase());
}

function getClearSplitAgreementById(id) {
  return db.prepare('SELECT * FROM clearsplit_agreements WHERE id=?').get(id);
}

function getClearSplitAgreementByPayment(stripePaymentId) {
  return db.prepare('SELECT * FROM clearsplit_agreements WHERE stripe_payment_id=?').get(stripePaymentId);
}

function getClearSplitAgreementByUser(userId) {
  return db.prepare(`
    SELECT a.* FROM clearsplit_agreements a
    WHERE a.party1_user_id=? OR a.party2_user_id=?
    ORDER BY a.purchased_at DESC LIMIT 1
  `).get(userId, userId);
}

function joinClearSplitAgreement(code, party2UserId) {
  const agreement = getClearSplitAgreementByCode(code);
  if (!agreement) return { error: 'not_found' };
  if (agreement.party2_user_id) return { error: 'full' };
  const now = new Date();
  const activeUntil = new Date(agreement.extension_until || agreement.active_until);
  if (now > activeUntil) return { error: 'expired' };
  db.prepare('UPDATE clearsplit_agreements SET party2_user_id=? WHERE code=?')
    .run(party2UserId, code.toUpperCase());
  db.prepare(`UPDATE users SET clearsplit_role='participant', clearsplit_agreement_id=? WHERE id=?`)
    .run(agreement.id, party2UserId);
  return { success: true, agreement: getClearSplitAgreementByCode(code) };
}

function saveClearSplitAgreementData(agreementId, data, userId) {
  db.prepare(`
    UPDATE clearsplit_agreements
    SET agreement_data=?, last_modified_at=CURRENT_TIMESTAMP, last_modified_by=?
    WHERE id=?
  `).run(JSON.stringify(data), userId, agreementId);
}

function extendClearSplitAgreement(agreementId) {
  const agreement = getClearSplitAgreementById(agreementId);
  if (!agreement) return null;
  const base = agreement.extension_until
    ? new Date(agreement.extension_until)
    : new Date(agreement.active_until);
  const newExpiry = new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  db.prepare(`
    UPDATE clearsplit_agreements
    SET extended_at=?, extension_until=?, status='extended'
    WHERE id=?
  `).run(now.toISOString(), newExpiry.toISOString(), agreementId);
  return { previousExpiry: base, newExpiry };
}

function getClearSplitStatus(agreement) {
  const now = new Date();
  const expiry = new Date(agreement.extension_until || agreement.active_until);
  const isActive = now <= expiry;
  const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
  return {
    isActive,
    isExpired: !isActive,
    expiry,
    daysLeft: isActive ? daysLeft : 0,
    warningZone: isActive && daysLeft <= 14,
  };
}

// ClearSplit user creation (separate from subscription users)
function createClearSplitUser(email, passwordHash, firstName, lastName) {
  const name = `${firstName} ${lastName}`.trim();
  const existing = getUserByEmail(email);
  if (existing) return { existing: true, user: existing };
  return {
    existing: false,
    user: db.prepare(`
      INSERT INTO users (email, password, name, plan, products)
      VALUES (?, ?, ?, 'free', 'clearsplit')
      RETURNING *
    `).get(email.toLowerCase().trim(), passwordHash, name),
  };
}

function updateUserClearSplit(userId, role, agreementId) {
  db.prepare(`UPDATE users SET clearsplit_role=?, clearsplit_agreement_id=? WHERE id=?`)
    .run(role, agreementId, userId);
}

function setClearSplitParty1(agreementId, userId) {
  db.prepare(`UPDATE clearsplit_agreements SET party1_user_id=? WHERE id=?`)
    .run(userId, agreementId);
}

// Ensure old clearsplit_purchases table still accessible if it exists
function ensureClearSplitTable() { /* no-op — table created in schema above */ }

module.exports = {
  db, PLANS, STRIPE_PRICES,
  createUser, getUserByEmail, getUserById,
  updateUserPlan, updateStripeCustomer, addOneTimePurchase,
  getCaseProfile, saveCaseProfile,
  checkAccess, checkLimit, recordUsage, markOneTimeUsed,
  getUserUsageSummary,
  // ClearSplit
  generateClearSplitCode,
  createClearSplitAgreement,
  getClearSplitAgreementByCode,
  getClearSplitAgreementById,
  getClearSplitAgreementByPayment,
  getClearSplitAgreementByUser,
  joinClearSplitAgreement,
  saveClearSplitAgreementData,
  extendClearSplitAgreement,
  getClearSplitStatus,
  createClearSplitUser,
  updateUserClearSplit,
  setClearSplitParty1,
  ensureClearSplitTable,
};
