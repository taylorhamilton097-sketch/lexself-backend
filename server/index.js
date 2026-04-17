'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

// ── UNHANDLED REJECTION SAFETY ──
process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

const app = express();

// ── CANONICAL DOMAIN — www → clearstand.ca ──
// Forces all www traffic to non-www so localStorage
// tokens are always on the same origin (clearstand.ca)
app.use((req, res, next) => {
  if (req.headers.host === 'www.clearstand.ca') {
    return res.redirect(301, 'https://clearstand.ca' + req.originalUrl);
  }
  next();
});

// ── STRIPE WEBHOOK — raw body BEFORE json middleware ──
app.use('/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    try {
      require('./routes/billing').webhookHandler(req, res, next);
    } catch(e) {
      next(e);
    }
  }
);

app.use(express.json({ limit: '2mb' }));
app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all — JWT handles auth
  credentials: true,
}));

// ── API ROUTES ──
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/billing',        require('./routes/billing'));
app.use('/api/family/chat',    require('./routes/family-chat'));
app.use('/api/dictation',      require('./routes/dictation'));
app.use('/api/family/analyze', require('./routes/family-analyze'));
app.use('/api/admin',          require('./routes/admin'));
app.use('/api/forms',          require('./routes/forms'));
app.use('/api/chat',           require('./routes/criminal-chat'));
app.use('/api/analyze',        require('./routes/analyze'));

// ── HEALTH CHECK ──
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  version: '2.0.0',
  time: new Date().toISOString(),
}));

// ── STATIC FRONTENDS ──
app.use('/family', express.static(path.join(__dirname, '../public-family')));
app.get('/family/*', (req, res) =>
  res.sendFile(path.join(__dirname, '../public-family/index.html')));

// Named routes — must come BEFORE express.static and wildcard
app.get('/register',        (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/register.html')));
app.get('/login',           (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/register.html')));
app.get('/account',          (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/account.html')));
app.get('/pricing',          (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/pricing.html')));
app.get('/support',          (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/support.html')));
app.get('/payment-success',  (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/payment-success.html')));
app.get('/get-started',     (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/get-started.html')));
app.get('/about',           (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/about.html')));
app.get('/privacy-policy',  (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/privacy-policy.html')));
app.get('/terms-of-use',    (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/terms-of-use.html')));
app.get('/criminal-defence',(req, res) => res.sendFile(path.join(__dirname, '../public-criminal/criminal.html')));
app.get('/family-law',      (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/family.html')));
app.get('/criminal-app',    (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/app.html')));
app.get('/clearsplit',      (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/clearsplit.html')));
app.get('/clearsplit-app',  (req, res) => res.redirect(301, '/clearsplit/app'));
app.get('/clearsplit/app',  (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/clearsplit-app.html')));

// Static files
app.use(express.static(path.join(__dirname, '../public-criminal')));

// Wildcard — serve homepage for root, 404 for everything else
app.get('*', (req, res) => {
  // API routes that weren't matched return JSON 404
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Root serves homepage
  if (req.path === '/') {
    return res.sendFile(path.join(__dirname, '../public-criminal/index.html'));
  }
  // Everything else serves the 404 page with correct status
  res.status(404).sendFile(path.join(__dirname, '../public-criminal/404.html'));
});

// ── STARTUP ──
const PORT = process.env.PORT || 3000;

// Ensure admin account has Counsel plan
(async function ensureAdmin() {
  try {
    const { getUserByEmail, updateUserPlan } = require('./db');
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) return;
    const user = getUserByEmail(adminEmail);
    if (user && user.plan !== 'counsel') {
      updateUserPlan(user.id, 'counsel', 'both', null, null, 'active');
      console.log(`[Admin] ${adminEmail} → Counsel`);
    }
  } catch(e) {
    console.error('[Admin setup error]', e.message);
  }
})();

const server = app.listen(PORT, () => {
  console.log(`ClearStand v2 → http://localhost:${PORT}`);
  console.log(`  DB: ${process.env.DB_PATH || '/app/data/lexself.db'}`);
  console.log(`  ENV: ${process.env.NODE_ENV || 'development'}`);
});

// ── GRACEFUL SHUTDOWN ──
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Shutting down gracefully...');
  server.close(() => {
    console.log('[SIGTERM] Server closed.');
    process.exit(0);
  });
});
