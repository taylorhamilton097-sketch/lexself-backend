'use strict';
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/lexself.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT 'free',
    products TEXT NOT NULL DEFAULT 'criminal',
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    subscription_status TEXT DEFAULT 'inactive',
    plan_period_end INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product TEXT NOT NULL DEFAULT 'criminal',
    type TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS case_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product TEXT NOT NULL DEFAULT 'criminal',
    data TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, product)
  );
  CREATE TABLE IF NOT EXISTS one_time_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product TEXT NOT NULL,
    stripe_payment_intent TEXT,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS reminders_sent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product TEXT NOT NULL,
    court_date TEXT NOT NULL,
    days_before INTEGER NOT NULL,
    sent_date TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, product, court_date, days_before, sent_date)
  );
`);

const PLANS = {
  free:      { label:'Free',      chatPerDay:null, chatLifetime:10, analysisPerMonth:null, analysisLifetime:1 },
  essential: { label:'Essential', chatPerDay:50,   analysisPerMonth:3 },
  complete:  { label:'Complete',  chatPerDay:Infinity, analysisPerMonth:Infinity },
};

const todayStart  = () => { const d=new Date(); d.setHours(0,0,0,0); return Math.floor(d/1000); };
const monthStart  = () => { const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return Math.floor(d/1000); };

function createUser(email, passwordHash, name, products='criminal') {
  return db.prepare(`INSERT INTO users (email,password,name,products) VALUES (?,?,?,?) RETURNING *`)
    .get(email.toLowerCase().trim(), passwordHash, name, products);
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
function getCaseProfile(userId, product) {
  const row = db.prepare(`SELECT data FROM case_profiles WHERE user_id=? AND product=?`).get(userId, product);
  return row ? JSON.parse(row.data) : {};
}
function saveCaseProfile(userId, product, data) {
  db.prepare(`INSERT INTO case_profiles (user_id,product,data,updated_at) VALUES (?,?,?,unixepoch())
    ON CONFLICT(user_id,product) DO UPDATE SET data=excluded.data,updated_at=unixepoch()`)
    .run(userId, product, JSON.stringify(data));
}
function recordUsage(userId, product, type) {
  db.prepare(`INSERT INTO usage (user_id,product,type) VALUES (?,?,?)`).run(userId, product, type);
}
function getChatCount(userId, product) {
  const user = getUserById(userId);
  const plan = PLANS[user?.plan||'free'];
  if (!plan.chatPerDay) return db.prepare(`SELECT COUNT(*) as n FROM usage WHERE user_id=? AND product=? AND type='chat'`).get(userId,product).n;
  return db.prepare(`SELECT COUNT(*) as n FROM usage WHERE user_id=? AND product=? AND type='chat' AND created_at>=?`).get(userId,product,todayStart()).n;
}
function getAnalysisCount(userId, product) {
  const user = getUserById(userId);
  const plan = PLANS[user?.plan||'free'];
  if (!plan.analysisPerMonth) return db.prepare(`SELECT COUNT(*) as n FROM usage WHERE user_id=? AND product=? AND type='analysis'`).get(userId,product).n;
  return db.prepare(`SELECT COUNT(*) as n FROM usage WHERE user_id=? AND product=? AND type='analysis' AND created_at>=?`).get(userId,product,monthStart()).n;
}
function hasOneTimePurchase(userId, product) {
  return !!db.prepare(`SELECT id FROM one_time_purchases WHERE user_id=? AND product=? AND used=0`).get(userId,product);
}
function markOneTimeUsed(userId, product) {
  db.prepare(`UPDATE one_time_purchases SET used=1 WHERE user_id=? AND product=? AND used=0`).run(userId,product);
}
function checkAccess(user, product) {
  const userProducts = user.products||'criminal';
  if (userProducts!=='both' && userProducts!==product) return { allowed:false, reason:'wrong_product' };
  return { allowed:true };
}
function checkLimit(user, product, action) {
  const access = checkAccess(user, product);
  if (!access.allowed) return { allowed:false, ...access };
  const plan = PLANS[user.plan]||PLANS.free;
  const isFree = user.plan==='free';
  if (action==='chat') {
    const used=getChatCount(user.id,product);
    const limit=isFree?plan.chatLifetime:plan.chatPerDay;
    if (limit!==Infinity && used>=limit) return { allowed:false, reason:isFree?'free_chat_exhausted':'daily_chat_limit', used, limit };
    return { allowed:true, used, limit };
  }
  if (action==='analysis') {
    if (hasOneTimePurchase(user.id,product+'_analysis')) return { allowed:true, oneTime:true };
    const used=getAnalysisCount(user.id,product);
    const limit=isFree?plan.analysisLifetime:plan.analysisPerMonth;
    if (limit!==Infinity && used>=limit) return { allowed:false, reason:isFree?'free_analysis_exhausted':'monthly_analysis_limit', used, limit };
    return { allowed:true, used, limit };
  }
  return { allowed:false, reason:'unknown_action' };
}
function getUserUsageSummary(user, product) {
  const plan=PLANS[user.plan]||PLANS.free;
  const isFree=user.plan==='free';
  return {
    plan:user.plan, planLabel:plan.label, products:user.products,
    chat:{ used:getChatCount(user.id,product), limit:isFree?plan.chatLifetime:plan.chatPerDay, resetLabel:isFree?'lifetime':'daily' },
    analysis:{ used:getAnalysisCount(user.id,product), limit:isFree?plan.analysisLifetime:plan.analysisPerMonth, resetLabel:isFree?'lifetime':'monthly', hasOneTime:hasOneTimePurchase(user.id,product+'_analysis') },
  };
}

module.exports = {
  db, PLANS,
  createUser, getUserByEmail, getUserById,
  updateUserPlan, updateStripeCustomer, addOneTimePurchase,
  getCaseProfile, saveCaseProfile,
  checkAccess, checkLimit, recordUsage, markOneTimeUsed,
  getUserUsageSummary,
};