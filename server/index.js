'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const jwt     = require('jsonwebtoken');

// ── UNHANDLED REJECTION SAFETY ──
process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

const app = express();

// ── CANONICAL DOMAIN — www → clearstand.ca ──
app.use((req, res, next) => {
  if (req.headers.host === 'www.clearstand.ca') {
    return res.redirect(301, 'https://clearstand.ca' + req.originalUrl);
  }
  next();
});

// ── CORS ──
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = ['https://clearstand.ca', 'https://www.clearstand.ca', 'http://localhost:3000'];
    if (allowed.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS policy'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

// ── FAILED LOGIN MONITORING ──
app.use('/api/auth/login', (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    if (res.statusCode === 401) {
      console.warn('[Security] FAILED LOGIN ATTEMPT', {
        email:     req.body?.email || 'unknown',
        ip:        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        timestamp: new Date().toISOString(),
      });
    }
    return originalJson(data);
  };
  next();
});

// ── STRIPE WEBHOOK — raw body BEFORE json middleware ──
app.use('/api/billing/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    try {
      require('./routes/billing').webhookHandler(req, res, next);
    } catch(e) { next(e); }
  }
);

app.use(express.json({ limit: '2mb' }));

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
app.get('/health',     (req, res) => res.json({ status: 'ok' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '2.0.0', time: new Date().toISOString() }));

// ── STATIC FRONTENDS ──
app.use('/family', express.static(path.join(__dirname, '../public-family')));
app.get('/family/*', (req, res) =>
  res.sendFile(path.join(__dirname, '../public-family/index.html')));

// ── NAMED ROUTES ──
app.get('/register',        (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/register.html')));
app.get('/login',           (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/register.html')));
app.get('/account',         (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/account.html')));
app.get('/pricing',         (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/pricing.html')));
app.get('/support',         (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/support.html')));
app.get('/payment-success', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/payment-success.html')));
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

// ── SECURITY.TXT ──
app.get('/.well-known/security.txt', (req, res) => {
  res.type('text/plain').send(
`Contact: taylor@clearstand.ca
Preferred-Languages: en
Policy: https://clearstand.ca/privacy-policy`
  );
});

// ── STATIC FILES ──
app.use(express.static(path.join(__dirname, '../public-criminal')));

// ── WILDCARD ──
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (req.path === '/') return res.sendFile(path.join(__dirname, '../public-criminal/index.html'));
  res.status(404).sendFile(path.join(__dirname, '../public-criminal/404.html'));
});

// ── STARTUP ──
const PORT = process.env.PORT || 3000;

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
  console.log(`  DB: ${process.env.DB_PATH || '/app/data/clearstand.db'}`);
  console.log(`  ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Security: CORS ✓ login-monitoring ✓`);
});

// ── GRACEFUL SHUTDOWN ──
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Shutting down gracefully...');
  server.close(() => {
    console.log('[SIGTERM] Server closed.');
    process.exit(0);
  });
});
