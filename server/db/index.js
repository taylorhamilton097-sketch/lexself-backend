'use strict';

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/lexself.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run(`CREATE TABLE IF NOT EXISTS users (
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
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product TEXT NOT NULL DEFAULT 'criminal',
    type TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS case_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product TEXT NOT NULL DEFAULT 'criminal',
    data TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, product)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS one_time_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product TEXT NOT NULL,
    stripe_payment_intent TEXT,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS reminders_sent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product TEXT NOT NULL,
    court_date TEXT NOT NULL,
    days_before INTEGER NOT NULL,
    sent_date TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
    UNIQUE(user_id, product, court_date, days_before, sent_date)
  )`);
});

// Helper to run synchronous-style queries
db.get_ = (sql, params=[]) => new Promise((res,rej) => db.get(sql, params, (err,row) => err?rej(err):res(row)));
db.all_ = (sql, params=[]) => new Promise((res,rej) => db.all(sql, params, (err,rows) => err?rej(err):res(rows)));
db.run_ = (sql, params=[]) => new Promise((res,rej) => db.run(sql, params, function(err) { err?rej(err):res(this); }));

module.exports = { db };