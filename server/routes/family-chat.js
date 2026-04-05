'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { checkLimit, recordUsage, getCaseProfile } = require('../db');

const FAMILY_SYSTEM = `You are LexSelf Family, an Ontario family law assistant for self-represented litigants (SRLs). You are always on the side of the person you are helping.

JURISDICTION: Ontario, Canada.

LEGISLATION:
- Family Law Act R.S.O. 1990, c. F.3
- Children's Law Reform Act R.S.O. 1990, c. C.12
- Divorce Act R.S.C. 1985, c. 3
- Federal Child Support Guidelines SOR/97-175
- Ontario Family Law Rules O. Reg. 114/99
- Spousal Support Advisory Guidelines

Always cite cases as: Case Name [Year] citation.
Mark all draft content: DRAFT — REVIEW BEFORE FILING.
Recommend Legal Aid Ontario (1-800-668-8258) for complex matters.`;

router.post('/', requireAuth, async (req, res) => {
  const { messages, context } = req.body;
  const user = req.user;
  const apiKey = process.env.ANTHROPIC_API_KEY_RAW;
console.log('Raw key first 20 chars:', apiKey ? apiKey.substring(0, 20) : 'UNDEFINED');
  if (!apiKey)   return res.status(500).json({ error: 'API key not configured.' });
  if (!messages) return res.status(400).json({ error: 'No messages provided.' });

  const limit = checkLimit(user, 'family', 'chat');
  if (!limit.allowed) {
    return res.status(402).json({
      error: 'limit_reached', code: limit.reason,
      used: limit.used, limit: limit.limit, plan: user.plan,
    });
  }

  let system = FAMILY_SYSTEM;
  const profile = context?.profile || getCaseProfile(user.id, 'family');

  if (profile && (profile.first || profile.role)) {
    system += `\n\nUSER PROFILE:\nName: ${profile.first||''} ${profile.last||''}\nRole: ${profile.role||'unknown'}\nCourt File: ${profile.cf_number||'N/A'}\nCourt: ${profile.cf_court||'N/A'}\nNext Date: ${profile.cf_nextdate||'N/A'}`;
  }

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
        max_tokens: 1500,
        system,
        messages,
      }),
    });

    const data = await resp.json();
console.log('Anthropic response status:', resp.status, 'Error:', JSON.stringify(data.error));
if (!resp.ok) return res.status(resp.status).json({ error: data.error?.message || 'API error' });
    recordUsage(user.id, 'family', 'chat');
    res.json(data);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;