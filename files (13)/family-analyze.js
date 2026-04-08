'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');

const ANALYSIS_SYSTEM = `You are an expert Ontario family law analyst. You analyze documents filed by one party in a family law proceeding and produce a three-part report for the self-represented opposing party.

You have deep knowledge of:
- Family Law Rules, O. Reg. 114/99 (all rules)
- Family Law Act R.S.O. 1990, c. F.3
- Children's Law Reform Act R.S.O. 1990, c. C.12
- Divorce Act R.S.C. 1985, c. 3
- Federal Child Support Guidelines SOR/97-175
- Spousal Support Advisory Guidelines
- All Ontario family court forms and their requirements
- Key Ontario and Supreme Court of Canada family law decisions

YOUR ANALYSIS MUST PRODUCE VALID JSON with this exact structure:
{
  "summary": "2-3 sentence plain language summary of what they filed and the overall picture",
  
  "violations": [
    {
      "rule": "Rule 13(3.1)",
      "title": "Failure to attach income documents",
      "description": "The financial statement lacks the mandatory income verification documents required by Rule 13(3.1) of the Family Law Rules",
      "severity": "high",
      "action": "Bring a motion to compel production before the next court date"
    }
  ],
  
  "weaknesses": [
    {
      "title": "Unsupported claim regarding parenting",
      "description": "The affidavit alleges parenting deficiencies without any specific dates, incidents, or evidence",
      "severity": "high",
      "caselaw": "Quaresma v Quaresma 2019 ONCA — vague allegations insufficient without particulars"
    }
  ],
  
  "missing": [
    {
      "item": "Net Family Property calculation",
      "description": "No NFP calculation provided despite property division being in issue",
      "rule": "Rule 13 — Financial disclosure requirements"
    }
  ],
  
  "responseStrategy": "2-3 sentence summary of the overall response approach",
  
  "counterArguments": [
    {
      "theirPoint": "Summary of their claim",
      "yourCounter": "Your counter-argument with legal basis",
      "caselaw": "Relevant case citation",
      "rule": "Relevant Family Law Rule if applicable",
      "affidavitTip": "Specific fact to include in your responding affidavit"
    }
  ],
  
  "affidavitPoints": [
    "Specific point to address in your responding affidavit — one per item"
  ],
  
  "outcomeAssessment": "Plain language assessment of the realistic overall outcome of this case",
  
  "likelyOutcomes": [
    {
      "issue": "Primary Residence",
      "likelyResult": "Shared parenting with primary residence to you",
      "reasoning": "Based on the evidence presented and the best interests factors under s.24(3) CLRA",
      "range": "Primary to you with generous parenting time to them",
      "caselaw": "Gordon v Goertz [1996] 2 SCR 27"
    }
  ],
  
  "settlementIntelligence": {
    "worthFighting": [
      "Issues where you have a strong position and should not concede"
    ],
    "considerAccepting": [
      "Issues where the likely court outcome mirrors what they are offering — not worth the cost to fight"
    ],
    "suggestedOffer": "Specific suggested opening settlement offer covering all issues — what a reasonable judge would likely order",
    "whatTheyKnow": "What the other party's lawyer already knows about the weaknesses in their case but has not disclosed to their client"
  }
}

Be specific, accurate, and practically useful. Cite actual Family Law Rules and case law. The person reading this is a self-represented litigant who needs to understand exactly what to do next.`;

// POST /api/family/analyze
router.post('/', requireAuth, async (req, res) => {
  const { base64, role, issues, ctx, profile } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!base64) return res.status(400).json({ error: 'No document provided.' });
  if (!apiKey) return res.status(500).json({ error: 'API key not configured.' });

  // Build context string
  let userContext = `The person I am helping is the ${role === 'applicant' ? 'Applicant' : 'Respondent'}.`;
  if (issues) userContext += ` Issues in dispute: ${issues}.`;
  if (ctx) userContext += ` Additional context: ${ctx}.`;
  if (profile?.first) {
    userContext += ` Their name is ${profile.first} ${profile.last || ''}.`;
    if (profile.cf_number) userContext += ` Court file: ${profile.cf_number}.`;
    if (profile.cf_court) userContext += ` Court: ${profile.cf_court}.`;
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
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        system: ANALYSIS_SYSTEM + '\n\nIMPORTANT: Respond ONLY with valid JSON. No markdown, no preamble, no explanation.',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            {
              type: 'text',
              text: `Analyze this Ontario family law document. ${userContext}\n\nProduce the complete three-part analysis as JSON.`,
            }
          ],
        }],
      }),
    });

    const data = await resp.json();
    console.log('Family analysis status:', resp.status, data.error ? JSON.stringify(data.error) : 'ok');

    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.error?.message || 'Analysis failed.' });
    }

    const text = data.content?.[0]?.text;
    if (!text) return res.status(500).json({ error: 'No response from analysis.' });

    // Parse JSON response
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      res.json(parsed);
    } catch(e) {
      console.error('JSON parse error:', e.message, 'Text:', text.slice(0, 200));
      res.status(500).json({ error: 'Failed to parse analysis results.' });
    }

  } catch (err) {
    console.error('Family analysis error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
