'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { checkLimit, recordUsage } = require('../db');

const PASS_PROMPTS = {
  pass1: `You are a Canadian criminal defence expert. Analyze this Crown disclosure document for NARRATIVE INCONSISTENCIES.

Find ALL contradictions between:
- Witness statements vs officer notes
- Officer notes vs will-says
- Timeline inconsistencies
- Physical evidence vs witness accounts
- Different witness accounts of the same event

For each inconsistency return:
{
  "title": "Brief label",
  "severity": "HIGH|MEDIUM|LOW",
  "description": "What the inconsistency is",
  "sourceA": "Quote or paraphrase from source A",
  "sourceB": "Quote or paraphrase from source B that contradicts",
  "defenceValue": "How to use this in defence"
}

Return JSON: { "inconsistencies": [...], "overallNarrativeAssessment": "..." }
Respond ONLY with valid JSON.`,

  pass2: `You are a Canadian constitutional law expert. Analyze this Crown disclosure for CHARTER OF RIGHTS VIOLATIONS.

Look for violations of:
- s.8 — Unreasonable search or seizure (ITO problems, warrantless searches)
- s.9 — Arbitrary detention (unlawful stops, detention without cause)
- s.10(a) — Failure to inform reason for arrest
- s.10(b) — Right to counsel (delayed, denied, or inadequate)
- s.7 — Fundamental justice issues
- s.11(b) — Right to trial within reasonable time (Jordan)

For each issue return:
{
  "section": "s.8",
  "breach": "Description of the breach",
  "severity": "STRONG|ARGUABLE|WEAK",
  "factualBasis": "What in the disclosure supports this",
  "keyCase": "Most relevant case",
  "supportingCases": ["case1", "case2"],
  "remedy": "Exclusion of evidence / Stay of proceedings / etc",
  "applicationStrategy": "How to bring this application"
}

Return JSON: { "charterIssues": [...], "overallCharterAssessment": "..." }
Respond ONLY with valid JSON.`,

  pass3: `You are a Canadian criminal defence expert specializing in credibility. Analyze this Crown disclosure for WITNESS CREDIBILITY ISSUES and MOTIVES TO FABRICATE.

Analyze:
- Complainant credibility weaknesses
- Prior inconsistent statements (CEA s.9-10)
- Motive to fabricate (especially family court proceedings, financial disputes, relationship breakdowns)
- W(D) analysis framework
- Perception issues (lighting, distance, intoxication, stress)
- Memory reliability issues

For motives to fabricate:
{
  "motive": "Description of the motive",
  "factualSupport": "What in disclosure supports this motive",
  "howToEstablish": "How to establish this in cross-examination",
  "familyCourtNexus": true/false
}

For credibility issues:
{
  "category": "Prior statement / Perception / Memory / Bias",
  "description": "The credibility issue",
  "evidenceFromDisclosure": "What supports this",
  "crossExaminationValue": "How to use in cross"
}

Return JSON: { "wDAnalysis": "...", "complainantCredibility": { "issues": [...] }, "motivesToFabricate": [...] }
Respond ONLY with valid JSON.`,

  pass4: `You are a Canadian criminal defence expert. Analyze this Crown disclosure for MISSING DISCLOSURE items under Stinchcombe.

Identify what is MISSING that should have been produced:
- Officer notes (all officers involved)
- 911 call recordings and transcripts
- Body cam footage
- Surveillance footage
- Expert reports and underlying data
- Witness statements for all witnesses
- Forensic reports
- Breathalyzer maintenance records (if driving)
- Prior communications (texts, emails mentioned but not produced)
- ITO and warrant materials
- Informer tip details (where applicable)
- Any document referenced but not included

For each missing item:
{
  "item": "Description of missing item",
  "importance": "CRITICAL|HIGH|MODERATE",
  "legalBasis": "Stinchcombe + specific requirement",
  "howToRequest": "What to write in disclosure demand",
  "ifNotProduced": "Application to make if Crown refuses"
}

Also draft a formal Stinchcombe disclosure demand letter.

Return JSON: { "missingItems": [...], "overallDisclosureAssessment": "...", "disclosureRequestLetter": "Full formal letter text" }
Respond ONLY with valid JSON.`,

  pass5: `You are a senior Canadian criminal defence counsel. Based on the disclosure analysis, develop a COMPREHENSIVE DEFENCE STRATEGY.

Synthesize all findings into:
1. Primary defence theory
2. Prioritized defence strategies (ranked by likelihood of success)
3. Immediate actions required
4. Verdict outlook

For each strategy:
{
  "rank": 1,
  "type": "Charter Application / Credibility Attack / etc",
  "strategy": "Name of strategy",
  "description": "Detailed description",
  "keyArguments": ["argument 1", "argument 2"],
  "keyCases": ["R v Case 2020 SCC 1"],
  "whatYouNeed": "What evidence or arguments you need to succeed"
}

Verdict outlook:
{
  "assessment": "STRONG DEFENCE / VIABLE DEFENCE / UPHILL BATTLE / INSUFFICIENT",
  "reasoning": "Detailed explanation"
}

Return JSON: {
  "defenceTheory": "...",
  "immediateActions": ["action 1", "action 2"],
  "prioritisedStrategies": [...],
  "verdictOutlook": { "assessment": "...", "reasoning": "..." }
}
Respond ONLY with valid JSON.`
};

// POST /api/analyze — 5-pass Crown disclosure analysis (SSE streaming)
router.post('/', requireAuth, async (req, res) => {
  const user = req.user;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured.' });

  const limit = checkLimit(user, 'criminal', 'analysis');
  if (!limit.allowed) {
    return res.status(402).json({
      error: 'limit_reached', code: limit.reason,
      used: limit.used, limit: limit.limit, plan: user.plan,
    });
  }

  // Get PDF from multipart form
  const multer = require('multer');
  const storage = multer.memoryStorage();
  const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }).single('disclosure');

  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: 'File upload error: ' + err.message });
    if (!req.file) return res.status(400).json({ error: 'No PDF file provided.' });

    const base64 = req.file.buffer.toString('base64');
    const chargeContext = req.body.chargeContext || '';

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const results = {};
    const passes = ['pass1', 'pass2', 'pass3', 'pass4', 'pass5'];
    const passNames = {
      pass1: 'Narrative & Inconsistencies',
      pass2: 'Charter Analysis',
      pass3: 'Credibility & Fabrication',
      pass4: 'Missing Disclosure',
      pass5: 'Defence Strategy',
    };

    try {
      // Extract charge info first
      send({ type: 'progress', pass: 'extract', percent: 2, message: 'Reading disclosure document…' });

      for (let i = 0; i < passes.length; i++) {
        const pass = passes[i];
        const percent = Math.round(10 + (i / passes.length) * 85);
        send({ type: 'progress', pass, percent, message: `Pass ${i+1} — ${passNames[pass]}…` });

        const contextNote = chargeContext ? `\n\nCharge context: ${chargeContext}` : '';
        const prevResults = Object.keys(results).length > 0
          ? `\n\nPrevious analysis results:\n${JSON.stringify(results, null, 2)}`
          : '';

        const resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 3000,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                },
                {
                  type: 'text',
                  text: PASS_PROMPTS[pass] + contextNote + prevResults,
                }
              ],
            }],
          }),
        });

        if (!resp.ok) {
          const e = await resp.json();
          throw new Error(e.error?.message || `Pass ${i+1} failed`);
        }

        const data = await resp.json();
        const text = data.content?.[0]?.text || '{}';

        try {
          const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
          results[pass] = parsed;
        } catch(e) {
          console.error(`Pass ${pass} JSON parse error:`, e.message);
          results[pass] = { error: 'Parse failed', raw: text.slice(0, 200) };
        }
      }

      recordUsage(user.id, 'criminal', 'analysis');

      // Try to detect charge from pass1
      const chargeDetected = results.pass1?.chargeDetected || chargeContext || 'Unknown Charge';

      send({
        type: 'complete',
        results: { ...results, chargeLabel: chargeDetected, chargeDetected },
        meta: { pages: '?' },
      });

    } catch(err) {
      console.error('Analysis error:', err.message);
      send({ type: 'error', message: err.message });
    }

    res.end();
  });
});

module.exports = router;
