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
  // Financial (Unit 4b)
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

// ──────────────────────────────────────────────────
// FINANCIAL STATEMENT (Unit 4b — Form 13.1)
// Gated: family product access required (family or both).
// ──────────────────────────────────────────────────
function requireFamilyAccess(req, res, next) {
  const products = req.user && req.user.products;
  if (products === 'family' || products === 'both') return next();
  return res.status(403).json({ error: 'Family product access required.' });
}

// ── Aggregate (used to render the Finances tab) ──
router.get('/financial', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    res.json(getFinancialStatement(req.user.id));
  } catch (err) {
    console.error('[Financial get error]', err.message);
    res.status(500).json({ error: 'Failed to load financial statement.' });
  }
});

// ── Valuation dates (singleton) ──
router.put('/financial/valuation-dates', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    saveValuationDates(req.user.id, req.body || {});
    res.json({ valuation_dates: getValuationDates(req.user.id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save valuation dates.' });
  }
});

// ── Income meta (singleton) ──
router.put('/financial/income-meta', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    saveIncomeMeta(req.user.id, req.body || {});
    res.json({ income_meta: getIncomeMeta(req.user.id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save income metadata.' });
  }
});

// ── Income rows (list, update fixed, add/delete Schedule A) ──
router.put('/financial/income/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid income ID.' });
  try {
    const ok = updateIncome(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Income row not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update income row.' });
  }
});

router.post('/financial/income/schedule-a', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    const row = addScheduleAIncome(req.user.id, req.body || {});
    res.status(201).json({ income: row });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add Schedule A row.' });
  }
});

router.delete('/financial/income/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid income ID.' });
  try {
    const ok = deleteIncome(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Row not found or not deletable.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete income row.' });
  }
});

// ── Non-cash benefits ──
router.post('/financial/noncash', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    res.status(201).json({ noncash: addNoncash(req.user.id, req.body || {}) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add non-cash benefit.' });
  }
});

router.put('/financial/noncash/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID.' });
  try {
    const ok = updateNoncash(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update non-cash benefit.' });
  }
});

router.delete('/financial/noncash/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID.' });
  try {
    const ok = deleteNoncash(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete non-cash benefit.' });
  }
});

// ── Expenses (fixed rows, update only) ──
router.put('/financial/expenses/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid expense ID.' });
  try {
    const ok = updateExpense(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Expense row not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update expense.' });
  }
});

// ── Household (singleton) ──
router.put('/financial/household', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    saveHousehold(req.user.id, req.body || {});
    res.json({ household: getHousehold(req.user.id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save household info.' });
  }
});

// ── Assets ──
router.post('/financial/assets', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    res.status(201).json({ asset: addAsset(req.user.id, req.body || {}) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to add asset.' });
  }
});

router.put('/financial/assets/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid asset ID.' });
  try {
    const ok = updateAsset(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Asset not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update asset.' });
  }
});

router.delete('/financial/assets/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid asset ID.' });
  try {
    const ok = deleteAsset(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Asset not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete asset.' });
  }
});

// ── Debts ──
router.post('/financial/debts', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    res.status(201).json({ debt: addDebt(req.user.id, req.body || {}) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add debt.' });
  }
});

router.put('/financial/debts/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid debt ID.' });
  try {
    const ok = updateDebt(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Debt not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update debt.' });
  }
});

router.delete('/financial/debts/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid debt ID.' });
  try {
    const ok = deleteDebt(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Debt not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete debt.' });
  }
});

// ── Marriage-date property ──
router.post('/financial/mdp', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    res.status(201).json({ mdp: addMdp(req.user.id, req.body || {}) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to add marriage-date property.' });
  }
});

router.put('/financial/mdp/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID.' });
  try {
    const ok = updateMdp(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update row.' });
  }
});

router.delete('/financial/mdp/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID.' });
  try {
    const ok = deleteMdp(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete row.' });
  }
});

// ── Excluded property ──
router.post('/financial/excluded', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    res.status(201).json({ excluded: addExcluded(req.user.id, req.body || {}) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add excluded property.' });
  }
});

router.put('/financial/excluded/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID.' });
  try {
    const ok = updateExcluded(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update.' });
  }
});

router.delete('/financial/excluded/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID.' });
  try {
    const ok = deleteExcluded(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete.' });
  }
});

// ── Disposed property ──
router.post('/financial/disposed', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    res.status(201).json({ disposed: addDisposed(req.user.id, req.body || {}) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add disposed property.' });
  }
});

router.put('/financial/disposed/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID.' });
  try {
    const ok = updateDisposed(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update.' });
  }
});

router.delete('/financial/disposed/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID.' });
  try {
    const ok = deleteDisposed(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete.' });
  }
});

// ── Schedule B (list + meta) ──
router.post('/financial/schedule-b', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    res.status(201).json({ row: addScheduleB(req.user.id, req.body || {}) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add Schedule B row.' });
  }
});

router.put('/financial/schedule-b/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID.' });
  try {
    const ok = updateScheduleB(id, req.user.id, req.body || {});
    if (!ok) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update Schedule B.' });
  }
});

router.delete('/financial/schedule-b/:id', requireAuth, requireFamilyAccess, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID.' });
  try {
    const ok = deleteScheduleB(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete Schedule B row.' });
  }
});

router.put('/financial/schedule-b-meta', requireAuth, requireFamilyAccess, (req, res) => {
  try {
    saveScheduleBMeta(req.user.id, req.body || {});
    res.json({ schedule_b_meta: getScheduleBMeta(req.user.id) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save Schedule B meta.' });
  }
});

module.exports = router;
