'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  createConversation,
  listConversations,
  getConversation,
  updateConversationTitle,
  deleteConversation,
} = require('../db');

// Valid products for validation
const VALID_PRODUCTS = ['family', 'criminal'];

// ──────────────────────────────────────────────────
// GET /api/conversations?product=family|criminal
// List user's active conversations for a product
// ──────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const product = req.query.product;
  if (!VALID_PRODUCTS.includes(product)) {
    return res.status(400).json({ error: 'Invalid product.' });
  }
  try {
    const conversations = listConversations(req.user.id, product);
    res.json({ conversations });
  } catch (err) {
    console.error('[Conversations list error]', err.message);
    res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

// ──────────────────────────────────────────────────
// POST /api/conversations
// Create a new empty conversation
// Body: { product: 'family'|'criminal', title?: string }
// ──────────────────────────────────────────────────
router.post('/', requireAuth, (req, res) => {
  const { product, title } = req.body || {};
  if (!VALID_PRODUCTS.includes(product)) {
    return res.status(400).json({ error: 'Invalid product.' });
  }
  try {
    const cleanTitle = (title || '').toString().trim().slice(0, 120) || 'New Chat';
    const conv = createConversation(req.user.id, product, cleanTitle);
    res.status(201).json({ conversation: conv });
  } catch (err) {
    console.error('[Conversation create error]', err.message);
    res.status(500).json({ error: 'Failed to create conversation.' });
  }
});

// ──────────────────────────────────────────────────
// GET /api/conversations/:id
// Get one conversation with all its messages
// ──────────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid conversation ID.' });
  }
  try {
    const conv = getConversation(id, req.user.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
    res.json({ conversation: conv });
  } catch (err) {
    console.error('[Conversation get error]', err.message);
    res.status(500).json({ error: 'Failed to load conversation.' });
  }
});

// ──────────────────────────────────────────────────
// PATCH /api/conversations/:id
// Rename a conversation
// Body: { title: string }
// ──────────────────────────────────────────────────
router.patch('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid conversation ID.' });
  }
  const { title } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Title required.' });
  }
  try {
    const ok = updateConversationTitle(id, req.user.id, title);
    if (!ok) return res.status(404).json({ error: 'Conversation not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Conversation rename error]', err.message);
    res.status(500).json({ error: 'Failed to rename conversation.' });
  }
});

// ──────────────────────────────────────────────────
// DELETE /api/conversations/:id
// Soft-delete a conversation (recoverable for 30 days via direct DB access)
// ──────────────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid conversation ID.' });
  }
  try {
    const ok = deleteConversation(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Conversation not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Conversation delete error]', err.message);
    res.status(500).json({ error: 'Failed to delete conversation.' });
  }
});

module.exports = router;
