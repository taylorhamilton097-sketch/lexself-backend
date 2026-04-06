'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();
app.use(require('cors')());
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

// Criminal routes (reuse from existing criminal build or add here)
app.use('/api/chat',        require('./routes/criminal-chat'));
// app.use('/api/analyze',     require('./routes/analyze'));

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
app.get('/criminal-app', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/app.html')));
app.get('/criminal-defence', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/criminal.html')));
app.get('/family-law', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/family.html')));

// Criminal app at root or /criminal
app.use(express.static(path.join(__dirname, '../public-criminal')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../public-criminal/index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LexSelf Unified Backend → http://localhost:${PORT}`);
  console.log(`  Criminal: http://localhost:${PORT}/`);
  console.log(`  Family:   http://localhost:${PORT}/family`);
});
