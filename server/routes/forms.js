'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getUserProfile, listChildren, getFamilyInfo, listParties,
  getFinancialStatement,
  listPseudonyms, allocatePseudonym,
} = require('../db');
const {
  buildPseudonymMap, fullName, scrub, restore, residualTokens,
} = require('../lib/caseContext');

const { generateForm } = require('../forms/generator');

// Form generation is a PAID feature but does NOT count against chat quota.
// Free users get no access. Paid users (any family-enabled tier) get unlimited.
function requirePaidFamilyAccess(req, res, next) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated.' });
  if (user.plan === 'free') {
    return res.status(402).json({
      error: 'paid_required',
      message: 'Form generation is available on paid plans. Upgrade to generate filled court forms.',
    });
  }
  if (user.products !== 'family' && user.products !== 'both') {
    return res.status(403).json({
      error: 'wrong_product',
      message: 'Family forms require a Family Law or Bundle subscription.',
    });
  }
  next();
}

// ──────────────────────────────────────────────────
// POST /api/forms/:formId/generate
// Body: { fields: {...form-specific inline fields...}, affidavitBody?: string, sworn_at?, sworn_in?, sworn_date? }
// Returns: docx buffer as download
// ──────────────────────────────────────────────────
router.post('/:formId/generate', requireAuth, requirePaidFamilyAccess, async (req, res) => {
  const { formId } = req.params;
  if (!['14a', '8a', '13_1'].includes(formId)) {
    return res.status(404).json({ error: 'Unknown form.' });
  }

  try {
    // Gather all case profile data the form needs
    const profile = getUserProfile(req.user.id);
    const children = listChildren(req.user.id);
    const familyInfo = getFamilyInfo(req.user.id);
    const parties = listParties(req.user.id, 'family');

    // Form-specific inline-filled fields from the preview page
    const formFields = req.body?.fields || {};

    const data = {
      profile,
      familyInfo,
      children,
      parties,
      // Form-specific payload
      affidavitBody: req.body?.affidavitBody || '',
      sworn_at:      req.body?.sworn_at || '',
      sworn_in:      req.body?.sworn_in || '',
      sworn_date:    req.body?.sworn_date || '',
      form8aFields:  formId === '8a' ? formFields : {},
      financial:     formId === '13_1' ? getFinancialStatement(req.user.id) : null,
    };

    const buffer = await generateForm(formId, data);

    const filename = `Form-${formId.toUpperCase().replace('_', '.')}-${(profile.last || 'Applicant').replace(/[^a-zA-Z0-9]/g, '')}-${new Date().toISOString().slice(0,10)}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch(err) {
    console.error('[Form generate error]', err);
    res.status(500).json({ error: 'Failed to generate form.', detail: err.message });
  }
});

// ──────────────────────────────────────────────────
// POST /api/forms/14a/clean-paragraphs
// Uses Claude to clean up user's dictated/raw text into proper numbered affidavit paragraphs.
// Does NOT count against chat quota (free form-feature AI call).
// ──────────────────────────────────────────────────
router.post('/14a/clean-paragraphs', requireAuth, requirePaidFamilyAccess, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI service not configured.' });

  const { rawText } = req.body || {};
  if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 10) {
    return res.status(400).json({ error: 'Please provide at least a few sentences.' });
  }
  if (rawText.length > 15000) {
    return res.status(400).json({ error: 'Text too long. Please break into smaller chunks.' });
  }

  // Load the user's profile so Claude can speak in their voice.
  // An affidavit is written in the first person, so the model does not
  // need to know who the deponent actually is to draft it — a role token
  // is enough. Real names go back in on the way out, before the text
  // reaches the preview or the .docx.
  const profile = getUserProfile(req.user.id);
  const familyInfo = getFamilyInfo(req.user.id);
  const parties = listParties(req.user.id, 'family');
  const respondent = parties.find(x => x.role === 'respondent');

  const caseData = {
    product:  'family',
    profile,
    caseInfo: familyInfo,
    parties,
    children: listChildren(req.user.id),
  };
  const pseudonyms = buildPseudonymMap(
    caseData,
    (value, prefix, numbered) => allocatePseudonym(req.user.id, 'family', value, prefix, '', numbered),
    listPseudonyms(req.user.id, 'family')
  );

  const respondentReal = fullName(respondent);
  const respondentEntry = respondentReal
    ? pseudonyms.entries.find(e => e.real.toLowerCase() === respondentReal.toLowerCase())
    : null;

  // Same fallbacks as before when the profile has no name on file.
  const userName = pseudonyms.self || 'the deponent';
  const respondentName = (respondentEntry && respondentEntry.token) || 'the respondent';
  const userRole = (familyInfo.role || 'applicant');

  const system = `You are drafting paragraphs for an Ontario family court Affidavit (Form 14A). Convert the user's dictated or typed narrative into clear, numbered affidavit paragraphs that will stand up in court.

RULES:
1. Write in first person ("I did", "I saw", "I believe") — the deponent is ${userName}, who is the ${userRole} in this matter.
2. One fact per paragraph. Short, clear sentences. No compound paragraphs.
3. Strip emotional language and stick to facts. ("He was aggressive" → "He raised his voice and stepped toward me.")
4. Use past tense for events that already happened. Use dates where the user gave them.
5. When referring to the opposing party, use "the Respondent" or their name (${respondentName}) — do not use "he/she" without antecedent.
6. If the user mentions hearsay (something someone else told them), structure it as "I was told by [name] that..." followed by "I believe this to be true" — this is required in affidavits.
7. Do not add facts the user did not mention. Do not embellish.
8. Do not include numbering — just output one paragraph per line separated by blank lines. The form template will add the numbers.
9. Do not include any preamble, explanation, or commentary. Output ONLY the paragraphs.`;

  // The dictated narrative is where names actually turn up — "Dana told
  // me she would not return Ella". Full-name matches only.
  const userPrompt = `Convert this narrative into clear affidavit paragraphs:\n\n${scrub(rawText, pseudonyms)}`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('[14a clean-paragraphs API error]', resp.status, errText);
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const data = await resp.json();
    const raw = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n\n').trim();

    if (!raw) return res.status(502).json({ error: 'Empty response from AI.' });

    const cleaned = restore(raw, pseudonyms);

    // These paragraphs end up in a document that gets filed. If a token
    // survives restore — because the model invented one that was never
    // allocated, say [RESPONDENT_2] when only _1 exists — it would be
    // typed into an affidavit. Log it so it is visible; the user reviews
    // the paragraphs in the preview before generating the .docx, so the
    // draft is still worth returning. Token names only, never the text.
    const residual = residualTokens(cleaned);
    if (residual.length) {
      console.error('[14a clean-paragraphs] unrestored tokens in output',
        { userId: req.user.id, tokens: residual });
    }

    res.json({ cleaned });
  } catch(err) {
    console.error('[14a clean-paragraphs error]', err);
    res.status(500).json({ error: 'Failed to clean paragraphs.' });
  }
});

module.exports = router;
