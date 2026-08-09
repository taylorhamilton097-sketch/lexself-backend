'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { checkLimit, recordUsage, trackApiUsage, trackGlobalApiUsage, checkCounselLimits,
        getUserProfile, getFamilyInfo, listParties, listChildren,
        listPseudonyms, allocatePseudonym } = require('../db');
const { buildPseudonymMap, buildSystemPrompt, scrub, restoreDeep } = require('../lib/caseContext');

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

// Collapse either selector's vocabulary to 'applicant' | 'respondent'.
// A motion's moving party is the one who brought it and the responding
// party is the one answering, which is the same distinction the analysis
// needs: whose document is being examined.
function normalizeRole(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s.startsWith('respond')) return 'respondent';           // respondent, responding party
  if (s.startsWith('applic') || s.startsWith('moving')) return 'applicant';
  return '';
}

// POST /api/family/analyze
router.post('/', requireAuth, async (req, res) => {
  // profile is deliberately NOT read from req.body. This route used to
  // take the user's name and court file number from the request and pass
  // them to the API. Identity now comes from the database or not at all,
  // so a client cannot supply it even if it still sends the field.
  const { base64, role, issues, ctx } = req.body;
  const user = req.user;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!base64) return res.status(400).json({ error: 'No document provided.' });
  if (!apiKey) return res.status(500).json({ error: 'API key not configured.' });

  // Usage + product access check (checkLimit runs checkAccess internally)
  const limit = checkLimit(user, 'family', 'analysis');
  if (!limit.allowed) {
    return res.status(402).json({
      error: 'limit_reached', code: limit.reason,
      used: limit.used, limit: limit.limit, plan: user.plan,
      message: limit.message,
    });
  }

  // Counsel daily safety cap — catches runaway usage (bot/script/abuse)
  if (user.plan === 'counsel') {
    const counselCheck = checkCounselLimits(user.id);
    if (!counselCheck.allowed) {
      return res.status(402).json({
        error: 'limit_reached',
        code: 'daily_safety_cap',
        message: counselCheck.message,
        plan: user.plan,
      });
    }
  }

  // ── Prompt assembly (see server/lib/caseContext.js) ──
  const caseData = {
    product:  'family',
    profile:  getUserProfile(user.id),
    caseInfo: getFamilyInfo(user.id),
    parties:  listParties(user.id, 'family'),
    children: listChildren(user.id),
  };

  const pseudonyms = buildPseudonymMap(
    caseData,
    (value, prefix, numbered) => allocatePseudonym(user.id, 'family', value, prefix, '', numbered),
    listPseudonyms(user.id, 'family')
  );

  // Court and court file used to come from the request body. Court now
  // comes from the case block below; the file number is not sent at all.
  // issues and ctx are typed by the user about their own matter, so they
  // get the same full-name scrub as chat messages.

  // Role is stated twice — here and as "Your Role" in the case block —
  // and the two sources can disagree. The analyze screen's selector is
  // hardcoded to default to "applicant" and is never prefilled from the
  // profile, so a respondent who does not touch it sends "applicant".
  //
  // This route analyses the OTHER side's document, so the role decides
  // whose case is being attacked; getting it backwards inverts the whole
  // analysis. The saved profile wins where it is set: it is the value the
  // user deliberately entered and the one family-chat and forms.js
  // already use. The request value is the fallback for users who have not
  // filled in their case profile yet.
  // The two sources do not share a vocabulary. The profile selector
  // stores 'Applicant', 'Respondent', 'Moving Party' or 'Responding
  // Party'; the analyze selector sends lowercase 'applicant' or
  // 'respondent'. A direct comparison against 'applicant' fails on the
  // capitalised profile value and silently yields the opposite role,
  // so both are normalised before use.
  const effectiveRole = normalizeRole(caseData.caseInfo && caseData.caseInfo.role)
                     || normalizeRole(role)
                     || 'applicant';
  let userContext = `The person I am helping is the ${effectiveRole === 'applicant' ? 'Applicant' : 'Respondent'}.`;
  if (issues) userContext += ` Issues in dispute: ${scrub(String(issues), pseudonyms)}.`;
  if (ctx)    userContext += ` Additional context: ${scrub(String(ctx), pseudonyms)}.`;

  const system = buildSystemPrompt({
    basePrompt: ANALYSIS_SYSTEM,
    product:    'family',
    data:       caseData,
    map:        pseudonyms,
    extra:      'IMPORTANT: Respond ONLY with valid JSON. No markdown, no preamble, no explanation.',
  });

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
        system,
        messages: [{
          role: 'user',
          content: [
            {
              // The document itself is sent as uploaded. Its contents are
              // not redacted and cannot be with the current pipeline —
              // this is the known gap the case-block work does not close.
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
      // Parse before restoring: putting real names back into the raw
      // string first would break the JSON if a name contained a quote
      // or a backslash.
      const parsed = restoreDeep(JSON.parse(clean), pseudonyms);

      // Record usage only after successful parse (failed parses shouldn't burn quota)
      recordUsage(user.id, 'family', 'analysis');

      // System B — track real token consumption for cost monitoring
      const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
      trackApiUsage(user.id, 'analysis', tokens);
      trackGlobalApiUsage(tokens);

      res.json(parsed);
    } catch(e) {
      console.error('JSON parse error:', e.message);
      res.status(500).json({ error: 'Failed to parse analysis results.' });
    }

  } catch (err) {
    console.error('Family analysis error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
