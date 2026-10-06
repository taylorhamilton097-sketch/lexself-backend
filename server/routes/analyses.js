'use strict';

/**
 * Stored disclosure analyses — list, open, delete.
 *
 * Mounted at /api/analyses, NOT under /api/analyze, and that matters.
 * analysisLimiter is mounted on /api/analyze and counts every request
 * regardless of method, with a ceiling of one per minute on the free and
 * essential plans. Reading your own history would burn the allowance for
 * actually running an analysis, and 429 on the second click.
 *
 * Express boundary-matches app.use mount paths, so /api/analyses does not
 * match the /api/analyze mount. There is a test for that assumption.
 */

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { listDisclosureAnalyses, getDisclosureAnalysis, deleteDisclosureAnalysis,
        listPseudonyms, ANALYSIS_RETENTION_DAYS } = require('../db');
const { mapFromEntries, restoreDeep } = require('../lib/caseContext');

// GET /api/analyses — summaries, newest first
router.get('/', requireAuth, (req, res) => {
  try {
    res.json({
      analyses: listDisclosureAnalyses(req.user.id),
      retentionDays: ANALYSIS_RETENTION_DAYS,
    });
  } catch (e) {
    console.error('[analyses] list failed:', e.message);
    res.status(500).json({ error: 'Could not load your saved analyses.' });
  }
});

// GET /api/analyses/:id — one analysis in full
router.get('/:id', requireAuth, (req, res) => {
  try {
    // Scoped by user inside the query, so a guessed id is a 404 rather than
    // someone else's brief. Reading it also resets its retention clock.
    const row = getDisclosureAnalysis(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'That analysis is no longer available.' });

    // Names were replaced with role tokens before this was stored. Put them
    // back for display, so the user sees what they saw when it ran.
    //
    // Only the user's own map can do this: the tokens mean nothing without
    // case_pseudonyms, which is scoped to them and goes with their account.
    const map = mapFromEntries(listPseudonyms(req.user.id, 'criminal'));
    res.json({
      analysis: {
        ...row,
        results: restoreDeep(row.results, map),
        inventory: restoreDeep(row.inventory, map),
      },
      retentionDays: ANALYSIS_RETENTION_DAYS,
    });
  } catch (e) {
    console.error('[analyses] open failed:', e.message);
    res.status(500).json({ error: 'Could not open that analysis.' });
  }
});

// DELETE /api/analyses/:id — permanent
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const gone = deleteDisclosureAnalysis(req.params.id, req.user.id);
    // Already absent is reported as absent rather than as success, so the
    // interface cannot claim to have deleted something it did not.
    if (!gone) return res.status(404).json({ error: 'That analysis is no longer available.' });
    res.json({ deleted: true });
  } catch (e) {
    console.error('[analyses] delete failed:', e.message);
    res.status(500).json({ error: 'Could not delete that analysis.' });
  }
});

module.exports = router;
