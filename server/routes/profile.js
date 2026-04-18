'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getUserProfile, saveUserProfile,
  listParties, addParty, updateParty, deleteParty,
  listChildren, addChild, updateChild, deleteChild,
  getFamilyInfo, saveFamilyInfo,
  getCriminalInfo, saveCriminalInfo,
  listCharges, addCharge, updateCharge, deleteCharge,
  getFullProfile,
} = require('../db');

const VALID_PRODUCTS = ['family', 'criminal', 'both'];

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// ──────────────────────────────────────────────────
// GET /api/profile
// Returns everything: core profile, children, and product-specific info/parties/charges
// ──────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  try {
    const full = getFullProfile(req.user.id, req.user.products || 'criminal');
    res.json(full);
  } catch(err) {
    console.error('[Profile get error]', err.message);
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// ──────────────────────────────────────────────────
// PUT /api/profile/core
// Update the user's core profile (name, address, etc.)
// ──────────────────────────────────────────────────
router.put('/core', requireAuth, (req, res) => {
  try {
    saveUserProfile(req.user.id, req.body || {});
    res.json({ profile: getUserProfile(req.user.id) });
  } catch(err) {
    console.error('[Profile core save error]', err.message);
    res.status(500).json({ error: 'Failed to save profile.' });
  }
});

// ──────────────────────────────────────────────────
// Parties: list / add / update / delete
// ──────────────────────────────────────────────────
router.get('/parties', requireAuth, (req, res) => {
  const product = req.query.product || 'all';
  if (product !== 'all' && !VALID_PRODUCTS.includes(product)) {
    return res.status(400).json({ error: 'Invalid product.' });
  }
  res.json({ parties: listParties(req.user.id, product) });
});

router.post('/parties', requireAuth, (req, res) => {
  const { product, ...data } = req.body || {};
  if (!VALID_PRODUCTS.includes(product)) {
    return res.status(400).json({ error: 'Invalid product.' });
  }
  try {
    const party = addParty(req.user.id, product, data);
    res.status(201).json({ party });
  } catch(err) {
    console.error('[Add party error]', err.message);
    res.status(400).json({ error: err.message || 'Failed to add party.' });
  }
});

router.put('/parties/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid party ID.' });
  try {
    const ok = updateParty(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Party not found.' });
    res.json({ success: true });
  } catch(err) {
    console.error('[Update party error]', err.message);
    res.status(500).json({ error: 'Failed to update party.' });
  }
});

router.delete('/parties/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid party ID.' });
  try {
    const ok = deleteParty(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Party not found.' });
    res.json({ success: true });
  } catch(err) {
    console.error('[Delete party error]', err.message);
    res.status(500).json({ error: 'Failed to delete party.' });
  }
});

// ──────────────────────────────────────────────────
// Children: list / add / update / delete
// ──────────────────────────────────────────────────
router.get('/children', requireAuth, (req, res) => {
  res.json({ children: listChildren(req.user.id) });
});

router.post('/children', requireAuth, (req, res) => {
  try {
    const child = addChild(req.user.id, req.body || {});
    res.status(201).json({ child });
  } catch(err) {
    console.error('[Add child error]', err.message);
    res.status(500).json({ error: 'Failed to add child.' });
  }
});

router.put('/children/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid child ID.' });
  try {
    const ok = updateChild(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Child not found.' });
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: 'Failed to update child.' });
  }
});

router.delete('/children/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid child ID.' });
  try {
    const ok = deleteChild(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Child not found.' });
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: 'Failed to delete child.' });
  }
});

// ──────────────────────────────────────────────────
// Family case info
// ──────────────────────────────────────────────────
router.get('/family', requireAuth, (req, res) => {
  res.json({ family: getFamilyInfo(req.user.id) });
});

router.put('/family', requireAuth, (req, res) => {
  try {
    saveFamilyInfo(req.user.id, req.body || {});
    res.json({ family: getFamilyInfo(req.user.id) });
  } catch(err) {
    res.status(500).json({ error: 'Failed to save family case info.' });
  }
});

// ──────────────────────────────────────────────────
// Criminal case info
// ──────────────────────────────────────────────────
router.get('/criminal', requireAuth, (req, res) => {
  res.json({ criminal: getCriminalInfo(req.user.id) });
});

router.put('/criminal', requireAuth, (req, res) => {
  try {
    saveCriminalInfo(req.user.id, req.body || {});
    res.json({ criminal: getCriminalInfo(req.user.id) });
  } catch(err) {
    res.status(500).json({ error: 'Failed to save criminal case info.' });
  }
});

// ──────────────────────────────────────────────────
// Criminal charges
// ──────────────────────────────────────────────────
router.get('/charges', requireAuth, (req, res) => {
  res.json({ charges: listCharges(req.user.id) });
});

router.post('/charges', requireAuth, (req, res) => {
  try {
    const charge = addCharge(req.user.id, req.body || {});
    res.status(201).json({ charge });
  } catch(err) {
    console.error('[Add charge error]', err.message);
    res.status(500).json({ error: 'Failed to add charge.' });
  }
});

router.put('/charges/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid charge ID.' });
  try {
    const ok = updateCharge(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Charge not found.' });
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: 'Failed to update charge.' });
  }
});

router.delete('/charges/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid charge ID.' });
  try {
    const ok = deleteCharge(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Charge not found.' });
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: 'Failed to delete charge.' });
  }
});

module.exports = router;
