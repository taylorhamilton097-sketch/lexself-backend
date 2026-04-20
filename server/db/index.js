'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/clearstand.db');
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

// ── CONVERSATIONS SCHEMA (chat persistence) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product     TEXT    NOT NULL,
    title       TEXT    NOT NULL DEFAULT 'New Chat',
    deleted_at  INTEGER DEFAULT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS conversation_messages (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role             TEXT    NOT NULL,
    content          TEXT    NOT NULL,
    created_at       INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_conv_user    ON conversations(user_id, product, deleted_at, updated_at);
  CREATE INDEX IF NOT EXISTS idx_conv_msgs    ON conversation_messages(conversation_id, created_at);
`);

// ── CASE PROFILE SCHEMA (Unit 2 — shared across products) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first       TEXT DEFAULT '',
    last        TEXT DEFAULT '',
    dob         TEXT DEFAULT '',
    address     TEXT DEFAULT '',
    city        TEXT DEFAULT '',
    province    TEXT DEFAULT 'Ontario',
    postal      TEXT DEFAULT '',
    phone       TEXT DEFAULT '',
    email       TEXT DEFAULT '',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS case_parties (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product         TEXT NOT NULL,
    role            TEXT NOT NULL,
    first           TEXT DEFAULT '',
    last            TEXT DEFAULT '',
    address         TEXT DEFAULT '',
    city            TEXT DEFAULT '',
    province        TEXT DEFAULT '',
    postal          TEXT DEFAULT '',
    phone           TEXT DEFAULT '',
    email           TEXT DEFAULT '',
    lso_number      TEXT DEFAULT '',
    firm            TEXT DEFAULT '',
    notes           TEXT DEFAULT '',
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS case_children (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first           TEXT DEFAULT '',
    last            TEXT DEFAULT '',
    dob             TEXT DEFAULT '',
    residency       TEXT DEFAULT '',
    notes           TEXT DEFAULT '',
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS family_case_info (
    user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    role                 TEXT DEFAULT '',
    court_file_number    TEXT DEFAULT '',
    court                TEXT DEFAULT '',
    court_type           TEXT DEFAULT '',
    next_date            TEXT DEFAULT '',
    next_event           TEXT DEFAULT '',
    judge                TEXT DEFAULT '',
    ml_status            TEXT DEFAULT 'self-represented',
    ml_lawyer_first      TEXT DEFAULT '',
    ml_lawyer_last       TEXT DEFAULT '',
    ml_lawyer_firm       TEXT DEFAULT '',
    ml_lawyer_lso        TEXT DEFAULT '',
    updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS criminal_case_info (
    user_id              INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    court_file_number    TEXT DEFAULT '',
    court                TEXT DEFAULT '',
    next_date            TEXT DEFAULT '',
    next_event           TEXT DEFAULT '',
    bail_conditions      TEXT DEFAULT '',
    prior_record         TEXT DEFAULT '',
    indigenous           TEXT DEFAULT '',
    officer              TEXT DEFAULT '',
    detachment           TEXT DEFAULT '',
    updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS criminal_charges (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    charge_key        TEXT DEFAULT '',
    charge_label      TEXT DEFAULT '',
    section           TEXT DEFAULT '',
    charge_date       TEXT DEFAULT '',
    arresting_officer TEXT DEFAULT '',
    location          TEXT DEFAULT '',
    notes             TEXT DEFAULT '',
    created_at        INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_parties_user   ON case_parties(user_id, product);
  CREATE INDEX IF NOT EXISTS idx_children_user  ON case_children(user_id);
  CREATE INDEX IF NOT EXISTS idx_charges_user   ON criminal_charges(user_id);
`);

// ── FORM 13.1 FINANCIAL SCHEMA (Unit 4b — family-only) ──
db.exec(`
  CREATE TABLE IF NOT EXISTS fs_valuation_dates (
    user_id                 INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    date_of_marriage        TEXT DEFAULT '',
    valuation_date          TEXT DEFAULT '',
    cohabitation_start_date TEXT DEFAULT '',
    updated_at              INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS fs_income_meta (
    user_id                       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    employment_status             TEXT DEFAULT '',
    employer_name_address         TEXT DEFAULT '',
    business_name_address         TEXT DEFAULT '',
    unemployed_since              TEXT DEFAULT '',
    last_year_gross_income        REAL DEFAULT 0,
    self_employment_gross_monthly REAL DEFAULT 0,
    indian_act_election           INTEGER DEFAULT 0,
    indian_act_documents          TEXT DEFAULT '',
    updated_at                    INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS fs_income (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category        TEXT NOT NULL,
    detail          TEXT DEFAULT '',
    monthly_amount  REAL DEFAULT 0,
    annual_amount   REAL DEFAULT 0,
    is_schedule_a   INTEGER DEFAULT 0,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS fs_noncash_benefits (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item                TEXT DEFAULT '',
    details             TEXT DEFAULT '',
    yearly_market_value REAL DEFAULT 0,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS fs_expenses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category        TEXT NOT NULL,
    section         TEXT NOT NULL,
    detail          TEXT DEFAULT '',
    monthly_amount  REAL DEFAULT 0,
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, category)
  );

  CREATE TABLE IF NOT EXISTS fs_household (
    user_id               INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    lives_alone           INTEGER DEFAULT 0,
    spouse_partner_name   TEXT DEFAULT '',
    other_adults          TEXT DEFAULT '',
    children_count        INTEGER DEFAULT 0,
    spouse_works_at       TEXT DEFAULT '',
    spouse_not_working    INTEGER DEFAULT 0,
    spouse_earns_amount   REAL DEFAULT 0,
    spouse_earns_period   TEXT DEFAULT '',
    spouse_no_income      INTEGER DEFAULT 0,
    contribution_amount   REAL DEFAULT 0,
    contribution_period   TEXT DEFAULT '',
    updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS fs_assets (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category          TEXT NOT NULL,
    subcategory       TEXT DEFAULT '',
    description       TEXT DEFAULT '',
    detail_2          TEXT DEFAULT '',
    detail_3          TEXT DEFAULT '',
    not_in_possession INTEGER DEFAULT 0,
    value_marriage    REAL DEFAULT 0,
    value_valuation   REAL DEFAULT 0,
    value_current     REAL DEFAULT 0,
    created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS fs_debts (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category          TEXT DEFAULT '',
    details           TEXT DEFAULT '',
    is_contingent     INTEGER DEFAULT 0,
    amount_marriage   REAL DEFAULT 0,
    amount_valuation  REAL DEFAULT 0,
    amount_current    REAL DEFAULT 0,
    created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS fs_marriage_date_property (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category          TEXT NOT NULL,
    details           TEXT DEFAULT '',
    assets_value      REAL DEFAULT 0,
    liabilities_value REAL DEFAULT 0,
    created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS fs_excluded_property (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category        TEXT DEFAULT '',
    details         TEXT DEFAULT '',
    value_valuation REAL DEFAULT 0,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS fs_disposed_property (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category   TEXT DEFAULT '',
    details    TEXT DEFAULT '',
    value      REAL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS fs_schedule_b (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    child_id               INTEGER REFERENCES case_children(id) ON DELETE SET NULL,
    child_name             TEXT DEFAULT '',
    expense                TEXT DEFAULT '',
    annual_amount          REAL DEFAULT 0,
    tax_credits_deductions REAL DEFAULT 0,
    created_at             INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at             INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS fs_schedule_b_meta (
    user_id                 INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    annual_income_for_share REAL DEFAULT 0,
    updated_at              INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_fs_income_user   ON fs_income(user_id);
  CREATE INDEX IF NOT EXISTS idx_fs_expenses_user ON fs_expenses(user_id);
  CREATE INDEX IF NOT EXISTS idx_fs_assets_user   ON fs_assets(user_id, category);
  CREATE INDEX IF NOT EXISTS idx_fs_debts_user    ON fs_debts(user_id);
  CREATE INDEX IF NOT EXISTS idx_fs_mdp_user      ON fs_marriage_date_property(user_id);
  CREATE INDEX IF NOT EXISTS idx_fs_excl_user     ON fs_excluded_property(user_id);
  CREATE INDEX IF NOT EXISTS idx_fs_disp_user     ON fs_disposed_property(user_id);
  CREATE INDEX IF NOT EXISTS idx_fs_schedb_user   ON fs_schedule_b(user_id);
  CREATE INDEX IF NOT EXISTS idx_fs_noncash_user  ON fs_noncash_benefits(user_id);
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
try { db.exec(`ALTER TABLE clearsplit_agreements ADD COLUMN party2_invited_email TEXT DEFAULT NULL`); } catch(e) {}
try { db.exec(`ALTER TABLE clearsplit_agreements ADD COLUMN invite_sent_at DATETIME DEFAULT NULL`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN password_changed_at INTEGER DEFAULT NULL`); } catch(e) {}

// ── API USAGE TRACKING (Counsel soft ceiling + cost protection) ──
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      date              TEXT NOT NULL,
      chat_count        INTEGER DEFAULT 0,
      analysis_count    INTEGER DEFAULT 0,
      token_count       INTEGER DEFAULT 0,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, date)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS global_api_usage (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         TEXT UNIQUE NOT NULL,
      total_calls  INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0
    )
  `);
} catch(e) { console.error('[DB] Usage table error:', e.message); }

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
// products:      'criminal' | 'family' | 'both' | 'clearsplit'
// plan:          'free' | 'essential' | 'complete' | 'counsel' | 'admin'
// chatPerMonth:  monthly chat cap; null = lifetime bucket (free tier only)
// chatPerHour:   hourly rate-limit ceiling; Infinity = no hourly cap (admin only)
// analysisPerMonth: monthly analysis cap; null = lifetime bucket (free tier only)
// analysisPerHour: hourly rate-limit ceiling; Infinity = no hourly cap
// price:         CAD cents for standalone monthly (reference only; canonical prices live in Stripe)
const PLANS = {
  free: {
    label: 'Free',
    chatPerMonth: null,  chatLifetime: 10,
    chatPerHour: 5,
    analysisPerMonth: null, analysisLifetime: 1,
    analysisPerHour: 1,
    price: 0,
  },
  essential: {
    label: 'Essential',
    chatPerMonth: 150,   chatPerHour: 10,
    analysisPerMonth: 3, analysisPerHour: 2,
    price: 2900,
  },
  complete: {
    label: 'Complete',
    chatPerMonth: 500,   chatPerHour: 20,
    analysisPerMonth: 10, analysisPerHour: 3,
    price: 6900,
  },
  counsel: {
    label: 'Counsel',
    chatPerMonth: 1500,  chatPerHour: 30,
    analysisPerMonth: 20, analysisPerHour: 5,
    price: 14900,
  },
  admin: {
    label: 'Admin',
    chatPerMonth: Infinity, chatPerHour: Infinity,
    analysisPerMonth: Infinity, analysisPerHour: Infinity,
    price: 0,
  },
};



// ── TIME HELPERS ──
const daysAgo = n => Math.floor(Date.now()/1000) - n * 86400;
const todayStart = () => { const d=new Date(); d.setHours(0,0,0,0); return Math.floor(d/1000); };
const monthStart = () => { const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return Math.floor(d/1000); };
const hourStart  = () => { const d=new Date(); d.setMinutes(0,0,0); return Math.floor(d/1000); };

// Toronto-local date string (YYYY-MM-DD) — handles EST/EDT transitions automatically via IANA tz
const torontoDateString = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
};
// ── USAGE ──
function getChatCount(userId, product) {
  const plan = PLANS[db.prepare('SELECT plan FROM users WHERE id=?').get(userId)?.plan || 'free'];
  if (!plan.chatPerMonth) {
    // Free: lifetime limit
    return db.prepare(`SELECT COUNT(*) as n FROM usage WHERE user_id=? AND product=? AND type='chat'`).get(userId, product).n;
  }
  return db.prepare(`SELECT COUNT(*) as n FROM usage WHERE user_id=? AND product=? AND type='chat' AND created_at>=?`).get(userId, product, monthStart()).n;
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
    return { allowed: false, reason: 'wrong_product', message: `Your plan does not include ClearStand ${product.charAt(0).toUpperCase() + product.slice(1)}.` };
  }
  return { allowed: true };
}

function checkLimit(user, product, action) {
  // Product access check first
  const access = checkAccess(user, product);
  if (!access.allowed) return { allowed: false, ...access };

  const plan = PLANS[user.plan] || PLANS.free;
  const isFree = user.plan === 'free';

  if (action === 'chat') {
    // Hourly rate limit — checked before monthly so abuse gets caught fast
    const hourlyLimit = plan.chatPerHour ?? Infinity;
    if (hourlyLimit !== Infinity) {
      const hourlyUsed = getHourlyCount(user.id, product, 'chat');
      if (hourlyUsed >= hourlyLimit) {
        return {
          allowed: false,
          reason: 'hourly_chat_limit',
          used: hourlyUsed,
          limit: hourlyLimit,
          message: `You have reached the hourly rate limit for your plan. Please wait a few minutes before sending more messages.`,
        };
      }
    }

    const used = getChatCount(user.id, product);
    const limit = isFree ? plan.chatLifetime : plan.chatPerMonth;
    if (limit !== null && limit !== Infinity && used >= limit) {
      return {
        allowed: false,
        reason: isFree ? 'free_chat_exhausted' : 'monthly_chat_limit',
        used, limit,
      };
    }
    return { allowed: true, used, limit };
  }

  if (action === 'analysis') {
    if (hasOneTimePurchase(user.id, product + '_analysis')) {
      return { allowed: true, oneTime: true };
    }

    // Hourly rate limit first
    const hourlyLimit = plan.analysisPerHour ?? Infinity;
    if (hourlyLimit !== Infinity) {
      const hourlyUsed = getHourlyCount(user.id, product, 'analysis');
      if (hourlyUsed >= hourlyLimit) {
        return {
          allowed: false,
          reason: 'hourly_analysis_limit',
          used: hourlyUsed,
          limit: hourlyLimit,
          message: `You have reached the hourly analysis limit for your plan. Please wait before running another analysis.`,
        };
      }
    }

    const used = getAnalysisCount(user.id, product);
    const limit = isFree ? plan.analysisLifetime : plan.analysisPerMonth;
    if (limit !== null && limit !== Infinity && used >= limit) {
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
      limit: isFree ? plan.chatLifetime : plan.chatPerMonth,
      resetLabel: isFree ? 'lifetime' : 'monthly',
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

function updateClearSplitInvite(code, party2Email) {
  db.prepare(`
    UPDATE clearsplit_agreements
    SET party2_invited_email=?, invite_sent_at=CURRENT_TIMESTAMP
    WHERE code=?
  `).run(party2Email.toLowerCase().trim(), code.toUpperCase());
}

// ── API USAGE TRACKING ──
function trackApiUsage(userId, type, tokens = 0) {
  const today = new Date().toISOString().split('T')[0];
  try {
    db.prepare(`
      INSERT INTO api_usage (user_id, date, chat_count, analysis_count, token_count)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        chat_count     = chat_count + excluded.chat_count,
        analysis_count = analysis_count + excluded.analysis_count,
        token_count    = token_count + excluded.token_count
    `).run(
      userId, today,
      type === 'chat' ? 1 : 0,
      type === 'analysis' ? 1 : 0,
      tokens
    );

    // High usage alert
    const usage = db.prepare('SELECT chat_count, analysis_count FROM api_usage WHERE user_id=? AND date=?').get(userId, today);
    if (usage?.chat_count >= 200) {
      console.warn('[HIGH USAGE]', { userId, chatCount: usage.chat_count, date: today });
    }
  } catch(e) {
    console.error('[trackApiUsage error]', e.message);
  }
}

function trackGlobalApiUsage(tokens = 0) {
  const today = new Date().toISOString().split('T')[0];
  try {
    db.prepare(`
      INSERT INTO global_api_usage (date, total_calls, total_tokens)
      VALUES (?, 1, ?)
      ON CONFLICT(date) DO UPDATE SET
        total_calls  = total_calls + 1,
        total_tokens = total_tokens + excluded.total_tokens
    `).run(today, tokens);

    const global = db.prepare('SELECT total_calls FROM global_api_usage WHERE date=?').get(today);
    if (global?.total_calls >= 10000) {
      console.error('[CRITICAL] Global API limit reached', { date: today, totalCalls: global.total_calls });
    }
  } catch(e) {
    console.error('[trackGlobalApiUsage error]', e.message);
  }
}

function checkCounselLimits(userId) {
  const today = new Date().toISOString().split('T')[0];
  try {
    const usage = db.prepare('SELECT chat_count, analysis_count FROM api_usage WHERE user_id=? AND date=?').get(userId, today);
    if (!usage) return { allowed: true };
    // Shared daily safety bucket: chats + analyses count toward the same cap
    const combined = (usage.chat_count || 0) + (usage.analysis_count || 0);
    if (combined >= 500) {
      return {
        allowed: false,
        message: 'You have reached your daily limit. Your access resets tomorrow. If you need immediate assistance contact support@clearstand.ca',
      };
    }
    return { allowed: true };
  } catch(e) {
    return { allowed: true }; // fail open — don't block on tracking errors
  }
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

// ── CONVERSATIONS (chat persistence) ──
function createConversation(userId, product, title = 'New Chat') {
  return db.prepare(`
    INSERT INTO conversations (user_id, product, title)
    VALUES (?, ?, ?)
    RETURNING *
  `).get(userId, product, title);
}

function listConversations(userId, product) {
  return db.prepare(`
    SELECT id, title, created_at, updated_at
    FROM conversations
    WHERE user_id=? AND product=? AND deleted_at IS NULL
    ORDER BY updated_at DESC
  `).all(userId, product);
}

function getConversation(conversationId, userId) {
  // Ownership check: only return the conversation if it belongs to this user and isn't deleted
  const conv = db.prepare(`
    SELECT * FROM conversations
    WHERE id=? AND user_id=? AND deleted_at IS NULL
  `).get(conversationId, userId);
  if (!conv) return null;

  const messages = db.prepare(`
    SELECT role, content, created_at
    FROM conversation_messages
    WHERE conversation_id=?
    ORDER BY created_at ASC, id ASC
  `).all(conversationId);

  return { ...conv, messages };
}

function addMessageToConversation(conversationId, role, content) {
  db.prepare(`
    INSERT INTO conversation_messages (conversation_id, role, content)
    VALUES (?, ?, ?)
  `).run(conversationId, role, content);
  // Bump the parent conversation's updated_at so it floats to top of list
  db.prepare(`UPDATE conversations SET updated_at=unixepoch() WHERE id=?`).run(conversationId);
}

function updateConversationTitle(conversationId, userId, title) {
  // Ownership check via WHERE clause
  const cleanTitle = (title || '').toString().trim().slice(0, 120) || 'New Chat';
  const result = db.prepare(`
    UPDATE conversations
    SET title=?, updated_at=unixepoch()
    WHERE id=? AND user_id=? AND deleted_at IS NULL
  `).run(cleanTitle, conversationId, userId);
  return result.changes > 0;
}

function deleteConversation(conversationId, userId) {
  // Soft delete — set deleted_at timestamp, keep the row for recovery
  const result = db.prepare(`
    UPDATE conversations
    SET deleted_at=unixepoch()
    WHERE id=? AND user_id=? AND deleted_at IS NULL
  `).run(conversationId, userId);
  return result.changes > 0;
}

function autoTitleFromMessage(content) {
  // Take first 60 chars of the user's first message as the conversation title
  if (!content || typeof content !== 'string') return 'New Chat';
  const firstLine = content.split('\n')[0].trim();
  if (firstLine.length <= 60) return firstLine || 'New Chat';
  return firstLine.slice(0, 57).trim() + '…';
}

// ── CASE PROFILE (Unit 2) ──
// Whitelist of allowed columns per table — protects against mass-assignment attacks
const USER_PROFILE_FIELDS = ['first','last','dob','address','city','province','postal','phone','email'];
const PARTY_FIELDS        = ['role','first','last','address','city','province','postal','phone','email','lso_number','firm','notes'];
const CHILD_FIELDS        = ['first','last','dob','residency','notes'];
const FAMILY_INFO_FIELDS  = ['role','court_file_number','court','court_type','next_date','next_event','judge','ml_status','ml_lawyer_first','ml_lawyer_last','ml_lawyer_firm','ml_lawyer_lso'];
const CRIMINAL_INFO_FIELDS = ['court_file_number','court','next_date','next_event','bail_conditions','prior_record','indigenous','officer','detachment'];
const CHARGE_FIELDS       = ['charge_key','charge_label','section','charge_date','arresting_officer','location','notes'];

function pickFields(obj, allowed) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const key of allowed) {
    if (key in obj) {
      const v = obj[key];
      out[key] = v === null || v === undefined ? '' : String(v).slice(0, 500);
    }
  }
  return out;
}

function getUserProfile(userId) {
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id=?').get(userId);
  if (profile) return profile;
  // Create empty profile on first fetch so downstream code can trust it exists
  db.prepare('INSERT INTO user_profiles (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM user_profiles WHERE user_id=?').get(userId);
}

function saveUserProfile(userId, data) {
  const clean = pickFields(data, USER_PROFILE_FIELDS);
  // Ensure a row exists
  getUserProfile(userId);
  if (!Object.keys(clean).length) return;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), userId];
  db.prepare(`UPDATE user_profiles SET ${setClause}, updated_at=unixepoch() WHERE user_id=?`).run(...values);
}

function listParties(userId, product) {
  // product: 'family' | 'criminal' | 'all' (returns both plus 'both'-scoped)
  if (product === 'all') {
    return db.prepare("SELECT * FROM case_parties WHERE user_id=? ORDER BY product, role, id").all(userId);
  }
  return db.prepare("SELECT * FROM case_parties WHERE user_id=? AND (product=? OR product='both') ORDER BY role, id").all(userId, product);
}

function addParty(userId, product, data) {
  if (!['family','criminal','both'].includes(product)) throw new Error('Invalid product');
  const clean = pickFields(data, PARTY_FIELDS);
  if (!clean.role) throw new Error('Role required');
  const cols = ['user_id','product',...Object.keys(clean)];
  const vals = [userId, product, ...Object.values(clean)];
  const placeholders = cols.map(() => '?').join(',');
  const stmt = db.prepare(`INSERT INTO case_parties (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`);
  return stmt.get(...vals);
}

function updateParty(partyId, userId, data) {
  const clean = pickFields(data, PARTY_FIELDS);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), partyId, userId];
  const result = db.prepare(
    `UPDATE case_parties SET ${setClause}, updated_at=unixepoch() WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

function deleteParty(partyId, userId) {
  const result = db.prepare('DELETE FROM case_parties WHERE id=? AND user_id=?').run(partyId, userId);
  return result.changes > 0;
}

function listChildren(userId) {
  return db.prepare('SELECT * FROM case_children WHERE user_id=? ORDER BY id').all(userId);
}

function addChild(userId, data) {
  const clean = pickFields(data, CHILD_FIELDS);
  const cols = ['user_id', ...Object.keys(clean)];
  const vals = [userId, ...Object.values(clean)];
  const placeholders = cols.map(() => '?').join(',');
  return db.prepare(`INSERT INTO case_children (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`).get(...vals);
}

function updateChild(childId, userId, data) {
  const clean = pickFields(data, CHILD_FIELDS);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), childId, userId];
  const result = db.prepare(
    `UPDATE case_children SET ${setClause}, updated_at=unixepoch() WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

function deleteChild(childId, userId) {
  const result = db.prepare('DELETE FROM case_children WHERE id=? AND user_id=?').run(childId, userId);
  return result.changes > 0;
}

function getFamilyInfo(userId) {
  const info = db.prepare('SELECT * FROM family_case_info WHERE user_id=?').get(userId);
  if (info) return info;
  db.prepare('INSERT INTO family_case_info (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM family_case_info WHERE user_id=?').get(userId);
}

function saveFamilyInfo(userId, data) {
  const clean = pickFields(data, FAMILY_INFO_FIELDS);
  getFamilyInfo(userId);
  if (!Object.keys(clean).length) return;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), userId];
  db.prepare(`UPDATE family_case_info SET ${setClause}, updated_at=unixepoch() WHERE user_id=?`).run(...values);
}

function getCriminalInfo(userId) {
  const info = db.prepare('SELECT * FROM criminal_case_info WHERE user_id=?').get(userId);
  if (info) return info;
  db.prepare('INSERT INTO criminal_case_info (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM criminal_case_info WHERE user_id=?').get(userId);
}

function saveCriminalInfo(userId, data) {
  const clean = pickFields(data, CRIMINAL_INFO_FIELDS);
  getCriminalInfo(userId);
  if (!Object.keys(clean).length) return;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), userId];
  db.prepare(`UPDATE criminal_case_info SET ${setClause}, updated_at=unixepoch() WHERE user_id=?`).run(...values);
}

function listCharges(userId) {
  return db.prepare('SELECT * FROM criminal_charges WHERE user_id=? ORDER BY created_at DESC, id DESC').all(userId);
}

function addCharge(userId, data) {
  const clean = pickFields(data, CHARGE_FIELDS);
  const cols = ['user_id', ...Object.keys(clean)];
  const vals = [userId, ...Object.values(clean)];
  const placeholders = cols.map(() => '?').join(',');
  return db.prepare(`INSERT INTO criminal_charges (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`).get(...vals);
}

function updateCharge(chargeId, userId, data) {
  const clean = pickFields(data, CHARGE_FIELDS);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), chargeId, userId];
  const result = db.prepare(
    `UPDATE criminal_charges SET ${setClause} WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

function deleteCharge(chargeId, userId) {
  const result = db.prepare('DELETE FROM criminal_charges WHERE id=? AND user_id=?').run(chargeId, userId);
  return result.changes > 0;
}

// Aggregated profile — one endpoint returns everything relevant
function getFullProfile(userId, products) {
  // products: string from users.products — 'family' | 'criminal' | 'both' | 'clearsplit'
  const profile = getUserProfile(userId);
  const children = listChildren(userId);
  const result = { profile, children };

  const hasFamily = products === 'family' || products === 'both';
  const hasCriminal = products === 'criminal' || products === 'both';

  if (hasFamily) {
    result.family = {
      info: getFamilyInfo(userId),
      parties: listParties(userId, 'family'),
    };
  }
  if (hasCriminal) {
    result.criminal = {
      info: getCriminalInfo(userId),
      parties: listParties(userId, 'criminal'),
      charges: listCharges(userId),
    };
  }
  return result;
}

// ── FORM 13.1 FINANCIAL (Unit 4b) ──

// Typed field picker. Unlike pickFields (which stringifies everything to 500 chars),
// this respects numeric, boolean, and integer types — needed for financial data.
function pickFieldsTyped(obj, schema) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [key, type] of Object.entries(schema)) {
    if (!(key in obj)) continue;
    const v = obj[key];
    if (v === null || v === undefined) {
      out[key] = type === 'text' ? '' : 0;
      continue;
    }
    if (type === 'number') {
      const n = Number(v);
      out[key] = Number.isFinite(n) ? n : 0;
    } else if (type === 'int') {
      const n = parseInt(v, 10);
      out[key] = Number.isFinite(n) ? n : 0;
    } else if (type === 'bool') {
      out[key] = v ? 1 : 0;
    } else {
      out[key] = String(v).slice(0, 500);
    }
  }
  return out;
}

// ── Field whitelists + schemas ──
const FS_VALUATION_DATES_SCHEMA = {
  date_of_marriage: 'text',
  valuation_date: 'text',
  cohabitation_start_date: 'text',
};

const FS_INCOME_META_SCHEMA = {
  employment_status: 'text',
  employer_name_address: 'text',
  business_name_address: 'text',
  unemployed_since: 'text',
  last_year_gross_income: 'number',
  self_employment_gross_monthly: 'number',
  indian_act_election: 'bool',
  indian_act_documents: 'text',
};

const FS_INCOME_SCHEMA = {
  category: 'text',
  detail: 'text',
  monthly_amount: 'number',
  annual_amount: 'number',
  is_schedule_a: 'bool',
};

const FS_NONCASH_SCHEMA = {
  item: 'text',
  details: 'text',
  yearly_market_value: 'number',
};

const FS_EXPENSES_SCHEMA = {
  detail: 'text',
  monthly_amount: 'number',
};

const FS_HOUSEHOLD_SCHEMA = {
  lives_alone: 'bool',
  spouse_partner_name: 'text',
  other_adults: 'text',
  children_count: 'int',
  spouse_works_at: 'text',
  spouse_not_working: 'bool',
  spouse_earns_amount: 'number',
  spouse_earns_period: 'text',
  spouse_no_income: 'bool',
  contribution_amount: 'number',
  contribution_period: 'text',
};

const FS_ASSETS_SCHEMA = {
  category: 'text',
  subcategory: 'text',
  description: 'text',
  detail_2: 'text',
  detail_3: 'text',
  not_in_possession: 'bool',
  value_marriage: 'number',
  value_valuation: 'number',
  value_current: 'number',
};

const FS_DEBTS_SCHEMA = {
  category: 'text',
  details: 'text',
  is_contingent: 'bool',
  amount_marriage: 'number',
  amount_valuation: 'number',
  amount_current: 'number',
};

const FS_MDP_SCHEMA = {
  category: 'text',
  details: 'text',
  assets_value: 'number',
  liabilities_value: 'number',
};

const FS_EXCLUDED_SCHEMA = {
  category: 'text',
  details: 'text',
  value_valuation: 'number',
};

const FS_DISPOSED_SCHEMA = {
  category: 'text',
  details: 'text',
  value: 'number',
};

const FS_SCHEDULE_B_SCHEMA = {
  child_id: 'int',
  child_name: 'text',
  expense: 'text',
  annual_amount: 'number',
  tax_credits_deductions: 'number',
};

const FS_SCHEDULE_B_META_SCHEMA = {
  annual_income_for_share: 'number',
};

// Fixed seed categories for Part 2 expenses — seeded once per user on first load
const FS_EXPENSE_CATEGORIES = [
  // Automatic deductions
  { category: 'auto_cpp',            section: 'automatic' },
  { category: 'auto_ei',             section: 'automatic' },
  { category: 'auto_income_tax',     section: 'automatic' },
  { category: 'auto_pension',        section: 'automatic' },
  { category: 'auto_union_dues',     section: 'automatic' },
  // Housing
  { category: 'house_rent_mortgage', section: 'housing' },
  { category: 'house_property_tax',  section: 'housing' },
  { category: 'house_insurance',     section: 'housing' },
  { category: 'house_condo_fees',    section: 'housing' },
  { category: 'house_repairs',       section: 'housing' },
  // Utilities
  { category: 'util_water',          section: 'utilities' },
  { category: 'util_heat',           section: 'utilities' },
  { category: 'util_electricity',    section: 'utilities' },
  { category: 'util_telephone',      section: 'utilities' },
  { category: 'util_cell',           section: 'utilities' },
  { category: 'util_cable',          section: 'utilities' },
  { category: 'util_internet',       section: 'utilities' },
  // Household
  { category: 'hh_groceries',        section: 'household' },
  { category: 'hh_supplies',         section: 'household' },
  { category: 'hh_meals_out',        section: 'household' },
  { category: 'hh_pet_care',         section: 'household' },
  { category: 'hh_laundry',          section: 'household' },
  // Childcare
  { category: 'cc_daycare',          section: 'childcare' },
  { category: 'cc_babysitting',      section: 'childcare' },
  // Transportation
  { category: 'trans_public',        section: 'transportation' },
  { category: 'trans_gas',           section: 'transportation' },
  { category: 'trans_insurance',     section: 'transportation' },
  { category: 'trans_repairs',       section: 'transportation' },
  { category: 'trans_parking',       section: 'transportation' },
  { category: 'trans_car_loan',      section: 'transportation' },
  // Health
  { category: 'health_insurance',    section: 'health' },
  { category: 'health_dental',       section: 'health' },
  { category: 'health_drugs',        section: 'health' },
  { category: 'health_eye',          section: 'health' },
  // Personal
  { category: 'pers_clothing',       section: 'personal' },
  { category: 'pers_hair',           section: 'personal' },
  { category: 'pers_alcohol_tobacco',section: 'personal' },
  { category: 'pers_education',      section: 'personal' },
  { category: 'pers_entertainment',  section: 'personal' },
  { category: 'pers_gifts',          section: 'personal' },
  // Other
  { category: 'other_life_insurance',section: 'other' },
  { category: 'other_rrsp_resp',     section: 'other' },
  { category: 'other_vacations',     section: 'other' },
  { category: 'other_school_fees',   section: 'other' },
  { category: 'other_children_clothing', section: 'other' },
  { category: 'other_children_activities', section: 'other' },
  { category: 'other_summer_camp',   section: 'other' },
  { category: 'other_debt_payments', section: 'other' },
  { category: 'other_support_paid',  section: 'other' },
  { category: 'other_other',         section: 'other' },
];

// Fixed seed categories for Part 1 income (items 1-11)
const FS_INCOME_SEED_CATEGORIES = [
  'employment', 'commissions', 'self_employment', 'ei', 'wcb',
  'social_assistance', 'investment', 'pension', 'spousal_support',
  'child_benefits', 'other',
];

// ── Valuation dates (singleton) ──
function getValuationDates(userId) {
  const row = db.prepare('SELECT * FROM fs_valuation_dates WHERE user_id=?').get(userId);
  if (row) return row;
  db.prepare('INSERT INTO fs_valuation_dates (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM fs_valuation_dates WHERE user_id=?').get(userId);
}

function saveValuationDates(userId, data) {
  const clean = pickFieldsTyped(data, FS_VALUATION_DATES_SCHEMA);
  getValuationDates(userId);
  if (!Object.keys(clean).length) return;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), userId];
  db.prepare(`UPDATE fs_valuation_dates SET ${setClause}, updated_at=unixepoch() WHERE user_id=?`).run(...values);
}

// ── Income meta (singleton) ──
function getIncomeMeta(userId) {
  const row = db.prepare('SELECT * FROM fs_income_meta WHERE user_id=?').get(userId);
  if (row) return row;
  db.prepare('INSERT INTO fs_income_meta (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM fs_income_meta WHERE user_id=?').get(userId);
}

function saveIncomeMeta(userId, data) {
  const clean = pickFieldsTyped(data, FS_INCOME_META_SCHEMA);
  getIncomeMeta(userId);
  if (!Object.keys(clean).length) return;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), userId];
  db.prepare(`UPDATE fs_income_meta SET ${setClause}, updated_at=unixepoch() WHERE user_id=?`).run(...values);
}

// ── Income rows (list + seed) ──
function seedIncomeRows(userId) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM fs_income WHERE user_id=? AND is_schedule_a=0').get(userId).n;
  if (count > 0) return;
  const stmt = db.prepare('INSERT INTO fs_income (user_id, category, is_schedule_a) VALUES (?, ?, 0)');
  const tx = db.transaction(() => {
    for (const cat of FS_INCOME_SEED_CATEGORIES) stmt.run(userId, cat);
  });
  tx();
}

function listIncome(userId) {
  seedIncomeRows(userId);
  return db.prepare('SELECT * FROM fs_income WHERE user_id=? ORDER BY is_schedule_a, id').all(userId);
}

function updateIncome(incomeId, userId, data) {
  const clean = pickFieldsTyped(data, FS_INCOME_SCHEMA);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), incomeId, userId];
  const result = db.prepare(
    `UPDATE fs_income SET ${setClause}, updated_at=unixepoch() WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

function addScheduleAIncome(userId, data) {
  const clean = pickFieldsTyped(data, FS_INCOME_SCHEMA);
  clean.is_schedule_a = 1;
  if (!clean.category) clean.category = 'sched_a_other';
  const cols = ['user_id', ...Object.keys(clean)];
  const vals = [userId, ...Object.values(clean)];
  const placeholders = cols.map(() => '?').join(',');
  return db.prepare(`INSERT INTO fs_income (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`).get(...vals);
}

function deleteIncome(incomeId, userId) {
  // Only allow deleting Schedule A rows; fixed rows 1-11 are permanent
  const result = db.prepare(
    'DELETE FROM fs_income WHERE id=? AND user_id=? AND is_schedule_a=1'
  ).run(incomeId, userId);
  return result.changes > 0;
}

// ── Non-cash benefits (list) ──
function listNoncash(userId) {
  return db.prepare('SELECT * FROM fs_noncash_benefits WHERE user_id=? ORDER BY id').all(userId);
}

function addNoncash(userId, data) {
  const clean = pickFieldsTyped(data, FS_NONCASH_SCHEMA);
  const cols = ['user_id', ...Object.keys(clean)];
  const vals = [userId, ...Object.values(clean)];
  const placeholders = cols.map(() => '?').join(',');
  return db.prepare(`INSERT INTO fs_noncash_benefits (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`).get(...vals);
}

function updateNoncash(id, userId, data) {
  const clean = pickFieldsTyped(data, FS_NONCASH_SCHEMA);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), id, userId];
  const result = db.prepare(
    `UPDATE fs_noncash_benefits SET ${setClause}, updated_at=unixepoch() WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

function deleteNoncash(id, userId) {
  const result = db.prepare('DELETE FROM fs_noncash_benefits WHERE id=? AND user_id=?').run(id, userId);
  return result.changes > 0;
}

// ── Expenses (list + seed) ──
function seedExpenseRows(userId) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM fs_expenses WHERE user_id=?').get(userId).n;
  if (count >= FS_EXPENSE_CATEGORIES.length) return;
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO fs_expenses (user_id, category, section) VALUES (?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const c of FS_EXPENSE_CATEGORIES) stmt.run(userId, c.category, c.section);
  });
  tx();
}

function listExpenses(userId) {
  seedExpenseRows(userId);
  return db.prepare('SELECT * FROM fs_expenses WHERE user_id=? ORDER BY section, id').all(userId);
}

function updateExpense(expenseId, userId, data) {
  const clean = pickFieldsTyped(data, FS_EXPENSES_SCHEMA);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), expenseId, userId];
  const result = db.prepare(
    `UPDATE fs_expenses SET ${setClause}, updated_at=unixepoch() WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

// ── Household (singleton) ──
function getHousehold(userId) {
  const row = db.prepare('SELECT * FROM fs_household WHERE user_id=?').get(userId);
  if (row) return row;
  db.prepare('INSERT INTO fs_household (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM fs_household WHERE user_id=?').get(userId);
}

function saveHousehold(userId, data) {
  const clean = pickFieldsTyped(data, FS_HOUSEHOLD_SCHEMA);
  getHousehold(userId);
  if (!Object.keys(clean).length) return;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), userId];
  db.prepare(`UPDATE fs_household SET ${setClause}, updated_at=unixepoch() WHERE user_id=?`).run(...values);
}

// ── Assets (list) ──
function listAssets(userId) {
  return db.prepare('SELECT * FROM fs_assets WHERE user_id=? ORDER BY category, id').all(userId);
}

function addAsset(userId, data) {
  const clean = pickFieldsTyped(data, FS_ASSETS_SCHEMA);
  if (!clean.category) throw new Error('Category required');
  const cols = ['user_id', ...Object.keys(clean)];
  const vals = [userId, ...Object.values(clean)];
  const placeholders = cols.map(() => '?').join(',');
  return db.prepare(`INSERT INTO fs_assets (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`).get(...vals);
}

function updateAsset(id, userId, data) {
  const clean = pickFieldsTyped(data, FS_ASSETS_SCHEMA);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), id, userId];
  const result = db.prepare(
    `UPDATE fs_assets SET ${setClause}, updated_at=unixepoch() WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

function deleteAsset(id, userId) {
  const result = db.prepare('DELETE FROM fs_assets WHERE id=? AND user_id=?').run(id, userId);
  return result.changes > 0;
}

// ── Debts (list) ──
function listDebts(userId) {
  return db.prepare('SELECT * FROM fs_debts WHERE user_id=? ORDER BY id').all(userId);
}

function addDebt(userId, data) {
  const clean = pickFieldsTyped(data, FS_DEBTS_SCHEMA);
  const cols = ['user_id', ...Object.keys(clean)];
  const vals = [userId, ...Object.values(clean)];
  const placeholders = cols.map(() => '?').join(',');
  return db.prepare(`INSERT INTO fs_debts (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`).get(...vals);
}

function updateDebt(id, userId, data) {
  const clean = pickFieldsTyped(data, FS_DEBTS_SCHEMA);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), id, userId];
  const result = db.prepare(
    `UPDATE fs_debts SET ${setClause}, updated_at=unixepoch() WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

function deleteDebt(id, userId) {
  const result = db.prepare('DELETE FROM fs_debts WHERE id=? AND user_id=?').run(id, userId);
  return result.changes > 0;
}

// ── Marriage-date property (list) ──
function listMdp(userId) {
  return db.prepare('SELECT * FROM fs_marriage_date_property WHERE user_id=? ORDER BY id').all(userId);
}

function addMdp(userId, data) {
  const clean = pickFieldsTyped(data, FS_MDP_SCHEMA);
  if (!clean.category) throw new Error('Category required');
  const cols = ['user_id', ...Object.keys(clean)];
  const vals = [userId, ...Object.values(clean)];
  const placeholders = cols.map(() => '?').join(',');
  return db.prepare(`INSERT INTO fs_marriage_date_property (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`).get(...vals);
}

function updateMdp(id, userId, data) {
  const clean = pickFieldsTyped(data, FS_MDP_SCHEMA);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), id, userId];
  const result = db.prepare(
    `UPDATE fs_marriage_date_property SET ${setClause}, updated_at=unixepoch() WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

function deleteMdp(id, userId) {
  const result = db.prepare('DELETE FROM fs_marriage_date_property WHERE id=? AND user_id=?').run(id, userId);
  return result.changes > 0;
}

// ── Excluded property (list) ──
function listExcluded(userId) {
  return db.prepare('SELECT * FROM fs_excluded_property WHERE user_id=? ORDER BY id').all(userId);
}

function addExcluded(userId, data) {
  const clean = pickFieldsTyped(data, FS_EXCLUDED_SCHEMA);
  const cols = ['user_id', ...Object.keys(clean)];
  const vals = [userId, ...Object.values(clean)];
  const placeholders = cols.map(() => '?').join(',');
  return db.prepare(`INSERT INTO fs_excluded_property (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`).get(...vals);
}

function updateExcluded(id, userId, data) {
  const clean = pickFieldsTyped(data, FS_EXCLUDED_SCHEMA);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), id, userId];
  const result = db.prepare(
    `UPDATE fs_excluded_property SET ${setClause}, updated_at=unixepoch() WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

function deleteExcluded(id, userId) {
  const result = db.prepare('DELETE FROM fs_excluded_property WHERE id=? AND user_id=?').run(id, userId);
  return result.changes > 0;
}

// ── Disposed property (list) ──
function listDisposed(userId) {
  return db.prepare('SELECT * FROM fs_disposed_property WHERE user_id=? ORDER BY id').all(userId);
}

function addDisposed(userId, data) {
  const clean = pickFieldsTyped(data, FS_DISPOSED_SCHEMA);
  const cols = ['user_id', ...Object.keys(clean)];
  const vals = [userId, ...Object.values(clean)];
  const placeholders = cols.map(() => '?').join(',');
  return db.prepare(`INSERT INTO fs_disposed_property (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`).get(...vals);
}

function updateDisposed(id, userId, data) {
  const clean = pickFieldsTyped(data, FS_DISPOSED_SCHEMA);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), id, userId];
  const result = db.prepare(
    `UPDATE fs_disposed_property SET ${setClause}, updated_at=unixepoch() WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

function deleteDisposed(id, userId) {
  const result = db.prepare('DELETE FROM fs_disposed_property WHERE id=? AND user_id=?').run(id, userId);
  return result.changes > 0;
}

// ── Schedule B (list) ──
function listScheduleB(userId) {
  return db.prepare('SELECT * FROM fs_schedule_b WHERE user_id=? ORDER BY id').all(userId);
}

function addScheduleB(userId, data) {
  const clean = pickFieldsTyped(data, FS_SCHEDULE_B_SCHEMA);
  const cols = ['user_id', ...Object.keys(clean)];
  const vals = [userId, ...Object.values(clean)];
  const placeholders = cols.map(() => '?').join(',');
  return db.prepare(`INSERT INTO fs_schedule_b (${cols.join(',')}) VALUES (${placeholders}) RETURNING *`).get(...vals);
}

function updateScheduleB(id, userId, data) {
  const clean = pickFieldsTyped(data, FS_SCHEDULE_B_SCHEMA);
  if (!Object.keys(clean).length) return false;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), id, userId];
  const result = db.prepare(
    `UPDATE fs_schedule_b SET ${setClause}, updated_at=unixepoch() WHERE id=? AND user_id=?`
  ).run(...values);
  return result.changes > 0;
}

function deleteScheduleB(id, userId) {
  const result = db.prepare('DELETE FROM fs_schedule_b WHERE id=? AND user_id=?').run(id, userId);
  return result.changes > 0;
}

// ── Schedule B meta (singleton) ──
function getScheduleBMeta(userId) {
  const row = db.prepare('SELECT * FROM fs_schedule_b_meta WHERE user_id=?').get(userId);
  if (row) return row;
  db.prepare('INSERT INTO fs_schedule_b_meta (user_id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM fs_schedule_b_meta WHERE user_id=?').get(userId);
}

function saveScheduleBMeta(userId, data) {
  const clean = pickFieldsTyped(data, FS_SCHEDULE_B_META_SCHEMA);
  getScheduleBMeta(userId);
  if (!Object.keys(clean).length) return;
  const setClause = Object.keys(clean).map(k => `${k}=?`).join(', ');
  const values = [...Object.values(clean), userId];
  db.prepare(`UPDATE fs_schedule_b_meta SET ${setClause}, updated_at=unixepoch() WHERE user_id=?`).run(...values);
}

// ── Aggregate: everything needed to render the Finances tab + generate Form 13.1 ──
function getFinancialStatement(userId) {
  return {
    valuation_dates: getValuationDates(userId),
    income_meta: getIncomeMeta(userId),
    income: listIncome(userId),
    noncash: listNoncash(userId),
    expenses: listExpenses(userId),
    household: getHousehold(userId),
    assets: listAssets(userId),
    debts: listDebts(userId),
    marriage_date_property: listMdp(userId),
    excluded: listExcluded(userId),
    disposed: listDisposed(userId),
    schedule_b: listScheduleB(userId),
    schedule_b_meta: getScheduleBMeta(userId),
  };
}

module.exports = {
  db, PLANS, 
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
  updateClearSplitInvite,
  trackApiUsage,
  trackGlobalApiUsage,
  checkCounselLimits,
  // Conversations (chat persistence)
  createConversation,
  listConversations,
  getConversation,
  addMessageToConversation,
  updateConversationTitle,
  deleteConversation,
  autoTitleFromMessage,
  // Case profile (Unit 2)
  getUserProfile, saveUserProfile,
  listParties, addParty, updateParty, deleteParty,
  listChildren, addChild, updateChild, deleteChild,
  getFamilyInfo, saveFamilyInfo,
  getCriminalInfo, saveCriminalInfo,
  listCharges, addCharge, updateCharge, deleteCharge,
  getFullProfile,
  // Financial statement (Unit 4b — Form 13.1)
  pickFieldsTyped,
  getValuationDates, saveValuationDates,
  getIncomeMeta, saveIncomeMeta,
  listIncome, updateIncome, addScheduleAIncome, deleteIncome,
  listNoncash, addNoncash, updateNoncash, deleteNoncash,
  listExpenses, updateExpense,
  getHousehold, saveHousehold,
  listAssets, addAsset, updateAsset, deleteAsset,
  listDebts, addDebt, updateDebt, deleteDebt,
  listMdp, addMdp, updateMdp, deleteMdp,
  listExcluded, addExcluded, updateExcluded, deleteExcluded,
  listDisposed, addDisposed, updateDisposed, deleteDisposed,
  listScheduleB, addScheduleB, updateScheduleB, deleteScheduleB,
  getScheduleBMeta, saveScheduleBMeta,
  getFinancialStatement,
};
