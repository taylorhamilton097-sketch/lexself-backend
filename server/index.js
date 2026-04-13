'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// Stripe webhook needs raw body — mount BEFORE json middleware
app.use('/api/billing/webhook', require('./routes/billing').webhookHandler ||
  (() => { const r = express.Router(); r.post('/', express.raw({type:'application/json'}), (req,res)=>res.json({received:true})); return r; })()
);

app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: [
    process.env.APP_URL,
    process.env.FAMILY_APP_URL,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean),
  credentials: true,
}));

// ── ROUTES ──
app.use('/api/auth',            require('./routes/auth'));
app.use('/api/billing',         require('./routes/billing'));
app.use('/api/family/chat',     require('./routes/family-chat'));
app.use('/api/dictation',       require('./routes/dictation'));
app.use('/api/family/analyze',  require('./routes/family-analyze'));
app.use('/api/admin',           require('./routes/admin'));
app.use('/api/forms',           require('./routes/forms'));
app.use('/api/chat',            require('./routes/criminal-chat'));
app.use('/api/analyze',         require('./routes/analyze'));

// Health check
app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  version: '2.0.0',
  products: ['criminal', 'family', 'clearsplit'],
  time: new Date().toISOString(),
}));

// ── STATIC FRONTENDS ──

// Family app
app.use('/family', express.static(path.join(__dirname, '../public-family')));
app.get('/family/*', (req, res) => res.sendFile(path.join(__dirname, '../public-family/index.html')));

// Auth / account pages
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/register.html')));
app.get('/login',    (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/register.html')));

// Static pages
app.get('/get-started',    (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/get-started.html')));
app.get('/about',          (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/about.html')));
app.get('/privacy-policy', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/privacy-policy.html')));
app.get('/terms-of-use',   (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/terms-of-use.html')));
app.get('/unsubscribe',    (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/unsubscribe.html')));

// Marketing subpages
app.get('/criminal-defence', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/criminal.html')));
app.get('/family-law',       (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/family.html')));

// Criminal app
app.get('/criminal-app', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/app.html')));

// ── CLEARSPLIT ROUTES ──
// Marketing page
app.get('/clearsplit', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/clearsplit.html')));

// Code entry screen (no auth)
app.get('/clearsplit/access', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/clearsplit-access.html')));

// Purchase success screen (no auth)
app.get('/clearsplit/success', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/clearsplit-success.html')));

// Extension purchase page (no auth)
app.get('/clearsplit/extend', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/clearsplit-extend.html')));

// Extension success
app.get('/clearsplit/extended', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/clearsplit-extended.html')));

// The app itself — code-gated, no subscription auth
app.get('/clearsplit-app', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/clearsplit-app.html')));

// Static files (must come before wildcard)
app.use(express.static(path.join(__dirname, '../public-criminal')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/index.html')));

const PORT = process.env.PORT || 3000;

// Ensure admin account has counsel plan on every startup
(async function ensureAdmin() {
  try {
    const { getUserByEmail, updateUserPlan } = require('./db');
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;
    const user = getUserByEmail(adminEmail);
    if (user && user.plan !== 'counsel' && user.plan !== 'admin') {
      updateUserPlan(user.id, 'counsel', 'both', null, null, 'active');
      console.log(`Admin account ${adminEmail} upgraded to counsel`);
    }
  } catch(e) {
    console.error('Admin setup error:', e.message);
  }
})();

// Ensure ClearSplit purchases table exists
(function ensureClearSplitTable() {
  try {
    const { ensureClearSplitTable } = require('./db');
    if (typeof ensureClearSplitTable === 'function') ensureClearSplitTable();
  } catch(e) {
    console.error('ClearSplit table setup error:', e.message);
  }
})();

app.listen(PORT, () => {
  console.log(`ClearStand Unified Backend → http://localhost:${PORT}`);
  console.log(`  Criminal:   http://localhost:${PORT}/criminal-app`);
  console.log(`  Family:     http://localhost:${PORT}/family`);
  console.log(`  ClearSplit: http://localhost:${PORT}/clearsplit`);
});
