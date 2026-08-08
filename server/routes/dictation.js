'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { listPseudonyms } = require('../db');
const { mapFromEntries, mergeMaps, scrub, restore } = require('../lib/caseContext');

// POST /api/dictation/clean
// Cleans up voice dictation — removes filler words, fixes punctuation
router.post('/clean', requireAuth, async (req, res) => {
  const { text } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!text || !text.trim()) return res.status(400).json({ error: 'No text provided.' });
  if (!apiKey) return res.status(500).json({ error: 'API key not configured.' });

  // Don't bother cleaning very short inputs
  if (text.trim().split(' ').length < 4) {
    return res.json({ cleaned: text.trim() });
  }

  // This route has no case of its own and no product context, so it
  // recognises only names some other route has already tokenised, and
  // allocates nothing itself. A name spoken before the user has ever
  // used chat or forms is not in the map and passes through.
  const pseudonyms = mergeMaps(
    ...['criminal', 'family', 'clearsplit']
      .map(p => mapFromEntries(listPseudonyms(req.user.id, p)))
  );

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `You are cleaning up voice dictation for use in a Canadian legal document. 

Instructions:
- Remove ALL filler words: um, uh, like, you know, so, basically, literally, right, okay, ah, hmm
- Fix punctuation — add periods, commas, question marks where appropriate
- Capitalize the first word of each sentence
- Fix obvious speech errors and repeated words
- Keep ALL substantive content and meaning exactly intact — do not add, remove, or change any facts
- Do not add legal language that wasn't spoken
- Return ONLY the cleaned text — no commentary, no explanation, no quotation marks

Voice input:
${scrub(text.trim(), pseudonyms)}`
        }]
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      // If Claude fails, return original text
      return res.json({ cleaned: text.trim(), fallback: true });
    }

    const cleaned = data.content?.[0]?.text?.trim();
    if (!cleaned) return res.json({ cleaned: text.trim(), fallback: true });

    // Fallback paths above return the caller's own text untouched, so
    // they need no restore — only the model's output carries tokens.
    res.json({ cleaned: restore(cleaned, pseudonyms) });

  } catch (err) {
    console.error('Dictation cleanup error:', err.message);
    // Always return something — fall back to original
    res.json({ cleaned: text.trim(), fallback: true });
  }
});

module.exports = router;
