'use strict';

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const helmet    = require('helmet');

const { chatLimiter, analysisLimiter } = require('./middleware/aiLimiter');

// ── UNHANDLED REJECTION SAFETY ──
process.on('unhandledRejection', (err) => {
  console.error('[Unhandled Rejection]', err);
});
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err);
});

const app = express();

// ── BETA GATE — HTTP Basic Auth on all requests ──
app.use(require('./beta-gate'));

// ── TRUST PROXY — Railway sits in front of this app ──
// Required for express-rate-limit to see real user IPs via X-Forwarded-For
app.set('trust proxy', 1);

// ── CANONICAL DOMAIN ──
//
// Driven by the CANONICAL_HOST environment variable rather than
// hardcoded, because a hardcoded redirect can strand the whole site.
//
// What happened in August 2026: the apex certificate for clearstand.ca
// expired while www.clearstand.ca stayed valid. The redirect sent every
// working www request to the broken apex, so there was no way into the
// site at all — the good domain handed visitors to the dead one.
//
//   CANONICAL_HOST unset      → no redirect; every domain serves directly
//   CANONICAL_HOST=clearstand.ca      → www redirects to apex
//   CANONICAL_HOST=www.clearstand.ca  → apex redirects to www
//
// Set it only to a host you have confirmed has a valid certificate.
// Leaving it unset is always safe.
const CANONICAL_HOST = (process.env.CANONICAL_HOST || '').trim().toLowerCase();

app.use((req, res, next) => {
  if (!CANONICAL_HOST) return next();
  const host = (req.headers.host || '').toLowerCase().split(':')[0];
  // Only redirect between the apex and its www form — never anything else.
  const apex = CANONICAL_HOST.replace(/^www\./, '');
  const isOurDomain = (host === apex || host === 'www.' + apex);
  if (isOurDomain && host !== CANONICAL_HOST) {
    return res.redirect(301, `https://${CANONICAL_HOST}${req.originalUrl}`);
  }
  next();
});

// ── SECURITY HEADERS (helmet) ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com"],
      imgSrc:        ["'self'", "data:", "https:"],
      connectSrc:    ["'self'", "https://api.stripe.com", "https://api.anthropic.com", "https://cdnjs.cloudflare.com"],
      frameSrc:      ["https://js.stripe.com", "https://hooks.stripe.com"],
      objectSrc:     ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  // HSTS. preload is deliberately OFF.
  //
  // With preload enabled, Chrome refuses to offer the "proceed anyway"
  // option when anything is wrong with the certificate — which is how a
  // routine expiry became a total lockout with no way in. It also means
  // a user on a network doing TLS inspection (courthouse wifi, a
  // corporate laptop) gets a hard wall rather than a warning.
  //
  // Turn preload back on only once the apex certificate is stable and
  // you intend to submit the domain to the browser preload list — which
  // is difficult to reverse.
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: false,
  },
}));

// ── CORS — restrict to clearstand.ca ──
const corsOptions = {
  origin: (origin, callback) => {
    // Allow same-origin requests (no origin header) and clearstand.ca
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

// ── GENERAL RATE LIMITERS (IP-keyed, cover the whole API) ──
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/api/health',
});

// Strict auth limit — prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiters
app.use('/api/', generalLimiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// Tier-aware AI limiters — per-minute, keyed by userId. Sit in front of
// route-level checkLimit() which enforces per-hour and per-month caps.
app.use('/api/chat',           chatLimiter);
app.use('/api/family/chat',    chatLimiter);
app.use('/api/analyze',        analysisLimiter);
app.use('/api/family/analyze', analysisLimiter);

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
app.use('/api/conversations',  require('./routes/conversations'));
app.use('/api/profile',        require('./routes/profile'));
app.use('/api/forms',          require('./routes/forms'));
app.use('/api/family/chat',    require('./routes/family-chat'));
app.use('/api/dictation',      require('./routes/dictation'));
app.use('/api/family/analyze', require('./routes/family-analyze'));
app.use('/api/admin',          require('./routes/admin'));
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
app.get('/case-profile',    (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/case-profile.html')));
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
`Contact: mailto:support@clearstand.ca
Preferred-Languages: en
Policy: https://clearstand.ca/privacy-policy`
  );
});

// ── STATIC FILES ──
app.use(express.static(path.join(__dirname, '../public-criminal')));

// ── WILDCARD ──
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.path === '/') {
    return res.sendFile(path.join(__dirname, '../public-criminal/index.html'));
  }
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

// Opportunistic prune of old ip_events rows on startup
(function startupMaintenance() {
  try {
    const { pruneOldIpEvents } = require('./db');
    pruneOldIpEvents();
  } catch(e) { /* non-fatal */ }
})();

const server = app.listen(PORT, () => {
  console.log(`ClearStand v2 → http://localhost:${PORT}`);
  console.log(`  DB: ${process.env.DB_PATH || '/app/data/lexself.db'}`);
  console.log(`  ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Security: helmet ✓ rate-limiting ✓ tier-aware AI ✓ CORS ✓`);
});

// ── GRACEFUL SHUTDOWN ──
process.on('SIGTERM', () => {
  console.log('[SIGTERM] Shutting down gracefully...');
  server.close(() => {
    console.log('[SIGTERM] Server closed.');
    process.exit(0);
  });
});
