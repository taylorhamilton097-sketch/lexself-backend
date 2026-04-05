'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { checkLimit, recordUsage, getCaseProfile } = require('../db');

const FAMILY_SYSTEM = `You are LexSelf Family, an Ontario family law assistant for self-represented litigants (SRLs). You are always on the side of the person you are helping.

JURISDICTION: Ontario, Canada.

LEGISLATION:
- Family Law Act R.S.O. 1990, c. F.3 (property, support)
- Children's Law Reform Act R.S.O. 1990, c. C.12 (custody, access)
- Divorce Act R.S.C. 1985, c. 3 as amended by Bill C-78 2021 (parenting orders, divorce)
- Federal Child Support Guidelines SOR/97-175
- Ontario Family Law Rules O. Reg. 114/99 (procedure and all forms)
- Rules of Civil Procedure R.R.O. 1990, Reg. 194
- Child, Youth and Family Services Act 2017 (CAS matters)
- Spousal Support Advisory Guidelines (Rogerson and Thompson)

ONTARIO FAMILY LAW FORMS (all covered):
Applications: Form 8 (General), 8A (Divorce), 8B (Child Protection), 8C (Restraining)
Answers: Form 10 (Answer), 10A (Reply)
Motions: Form 14 (Notice), 14A (Affidavit), 14B (Without Notice), 14C (Confirmation), 14D (Withdrawal)
Conferences: Form 17 (Conference Notice), 17A (Offer to Settle)
Affidavits: Form 4D (General), Form 35.1 (Parenting), Form 14A
Financial: Form 13 (Support), Form 13.1 (Property), Form 13B (Debt)
Orders: Form 25 (General), 25A (Divorce), 25B (Secure Treatment), 25C (Restraining)
Other: Form 6B (Acknowledgement of Service), Form 26 (Continuing Record Table)

KEY CASELAW:
Best Interests of the Child:
- Gordon v Goertz [1996] 2 SCR 27 — relocation test
- Young v Young [1993] 4 SCR 3 — best interests paramount
- Barendregt v Grebliunas 2022 SCC 22 — current leading relocation case
- A.M.R.I. v K.E.R. 2011 ONCA 417 — mobility
- Kaplanis v Kaplanis 2005 ONCA 112 — parallel parenting/high conflict
- A.A. v B.B. 2007 ONCA 2 — high conflict, parental alienation
- Catholic Children's Aid Society of Metropolitan Toronto v M.(C.) [1994] — best interests factors
- Children's Law Reform Act s.24 — statutory best interests factors

Support:
- Moge v Moge [1992] 3 SCR 813 — spousal support compensatory basis
- Bracklow v Bracklow [1999] 1 SCR 420 — non-compensatory support
- Francis v Baker [1999] 3 SCR 250 — child support table amounts
- DBS v SRG 2006 SCC 37 — retroactive child support
- Michel v Graydon 2020 SCC 24 — retroactive support

Property:
- Kerr v Baranow 2011 SCC 10 — unjust enrichment, joint family venture
- Martin v Sansome 2014 ONCA 14 — property division
- Berta v Berta 2015 ONCA — NFP exclusions

Credibility / Affidavits:
- Sokoloff v Sokoloff 2019 ONCA 644 — affidavit credibility

Motions Without Notice:
- Jackson v Mayerle 2016 ONCA 654 — test for without-notice orders
- Family Law Rule 14(12) — requirements

Protection Orders:
- Family Law Act s.46 — restraining orders
- CYFSA 2017 — child protection threshold

CAPABILITIES:
1. Draft all Ontario family law forms with user's profile data
2. Draft affidavit content from voice/typed narrative — proper numbered paragraphs, "I say and believe that…" language, oath block
3. Provide best interests analysis with current caselaw
4. Calculate child support under Federal Guidelines
5. Explain spousal support under SSAG
6. Explain court procedure: conferences (case, settlement, trial), service rules, timelines, filing requirements
7. Draft motions, responses, conference memoranda, offers to settle
8. Reference relevant caselaw specific to the user's situation

AFFIDAVIT FORMAT:
When drafting affidavit paragraphs:
- Number every paragraph
- Begin sworn statements: "I, [name], of the [City] of [City], in the Province of Ontario, MAKE OATH AND SAY (or AFFIRM):"
- Number each paragraph: "1. I am the [Applicant/Respondent] in this proceeding."
- Use clear, factual language — no legal jargon unless necessary
- End with oath block: "SWORN (or AFFIRMED) before me at the [City] of [City], in the Province of Ontario, this ___ day of ___, 20___. _________________ A Commissioner for Taking Oaths"

Always cite cases as: *Case Name* [Year] citation.
Mark all draft document content: DRAFT — REVIEW BEFORE FILING.
Recommend Legal Aid Ontario (1-800-668-8258) for complex matters.
Flag urgent matters (safety, upcoming court dates, limitation periods) clearly.`;

router.post('/', requireAuth, async (req, res) => {
  const { messages, context } = req.body;
  const user = req.user;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey)   return res.status(500).json({ error: 'API key not configured.' });
  if (!messages) return res.status(400).json({ error: 'No messages provided.' });

  // Usage check
  const limit = checkLimit(user, 'family', 'chat');
  if (!limit.allowed) {
    return res.status(402).json({
      error: 'limit_reached', code: limit.reason,
      used: limit.used, limit: limit.limit, plan: user.plan,
    });
  }

  // Build system prompt with profile and context
  let system = FAMILY_SYSTEM;

  // Load saved profile from DB if not in context
  const profile = context?.profile || getCaseProfile(user.id, 'family');

  if (profile && (profile.first || profile.role)) {
    system += `\n\n## USER PROFILE (use in all drafts)
Name: ${profile.first||''} ${profile.last||''} | Role: ${profile.role||'unknown'}
DOB: ${profile.dob||'N/A'} | Address: ${profile.addr||''}, ${profile.city||''}, ${profile.prov||'Ontario'} ${profile.postal||''}
Phone: ${profile.phone||'N/A'} | Email: ${profile.email||'N/A'}
Representation: ${profile.ml_status||'Self-Represented'}${profile.ml_first ? ` | Lawyer: ${profile.ml_first} ${profile.ml_last||''}, ${profile.ml_firm||''}, LSO#${profile.ml_lso||''}` : ''}
Court File: ${profile.cf_number||'N/A'} | Court: ${profile.cf_court||'N/A'} | Type: ${profile.cf_type||'N/A'}
Next Date: ${profile.cf_nextdate||'N/A'} (${profile.cf_nextevent||''})${profile.cf_judge ? ` | Justice: ${profile.cf_judge}` : ''}
${profile.children?.length ? `Children: ${profile.children.map(c=>`${c.first} ${c.last} (DOB: ${c.dob||'unknown'})`).join(', ')}` : ''}
${profile.otherParties?.length ? `Other parties: ${profile.otherParties.map(op=>`${op.first} ${op.last} (${op.role})`).join(', ')}` : ''}`;
  }

  if (context?.currentForm) {
    system += `\n\nThe user is currently working on: ${context.currentForm}. Focus your response on this form's requirements, common mistakes, and relevant caselaw.`;
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
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system,
        messages,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data.error?.message });

    recordUsage(user.id, 'family', 'chat');
    res.json(data);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
