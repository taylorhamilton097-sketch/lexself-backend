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
app.use('/api/auth',           require('./routes/auth'));
app.use('/api/billing',        require('./routes/billing'));
app.use('/api/family/chat',    require('./routes/family-chat'));
app.use('/api/dictation',       require('./routes/dictation'));
app.use('/api/family/analyze',  require('./routes/family-analyze'));
app.use('/api/admin',           require('./routes/admin'));
app.use('/api/forms',           require('./routes/forms'));

// Criminal routes
app.use('/api/chat',        require('./routes/criminal-chat'));
app.use('/api/analyze',        require('./routes/analyze'));

// Admin
// app.use('/api/admin',       require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  version: '1.0.0',
  products: ['criminal', 'family'],
  time: new Date().toISOString(),
}));

// ── STATIC FRONTENDS ──
// Family app at /family or on its own subdomain
app.use('/family', express.static(path.join(__dirname, '../public-family')));
app.get('/family/*', (req, res) => res.sendFile(path.join(__dirname, '../public-family/index.html')));

// Auth page
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/register.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/register.html')));

// Get started selection page
app.get('/get-started', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/get-started.html')));
app.get('/about', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/about.html')));
app.get('/privacy-policy', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/privacy-policy.html')));
app.get('/terms-of-use', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/terms-of-use.html')));

// Marketing subpages
app.get('/criminal-defence', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/criminal.html')));
app.get('/family-law', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/family.html')));

// Criminal app route
app.get('/criminal-app', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/app.html')));

// Static files
app.use(express.static(path.join(__dirname, '../public-criminal')));
app.get('/clearsplit', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/clearsplit.html')));
app.get('/clearsplit-app', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/clearsplit-app.html')));
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

app.listen(PORT, () => {
  console.log(`ClearStand Unified Backend → http://localhost:${PORT}`);
  console.log(`  Criminal: http://localhost:${PORT}/`);
  console.log(`  Family:   http://localhost:${PORT}/family`);
});
