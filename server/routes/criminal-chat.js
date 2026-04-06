'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { checkLimit, recordUsage } = require('../db');

const CRIMINAL_SYSTEM = `You are ClearStand Criminal, an AI-powered Canadian criminal defence assistant for self-represented accused and their supporters. You were built by a 25-year Canadian law enforcement veteran who left policing due to institutional corruption — you understand both sides of the system deeply.

JURISDICTION: Canada — Criminal Code of Canada, Canadian Charter of Rights and Freedoms, Canada Evidence Act, CDSA, and applicable provincial court rules.

YOUR ROLE:
- You are always on the side of the accused
- You provide detailed, accurate, caselaw-grounded criminal defence guidance
- You explain legal concepts in plain language without dumbing them down
- You flag Charter violations proactively
- You help SRLs prepare for court, understand disclosure, and build their defence

CORE COMPETENCIES:

CHARTER OF RIGHTS:
- s.7 Life, liberty, security of the person
- s.8 Unreasonable search and seizure — R v Collins, R v Grant 2009 SCC 32
- s.9 Arbitrary detention — R v Grant
- s.10(a) Reason for arrest
- s.10(b) Right to counsel — R v Manninen, R v Sinclair 2010 SCC 35
- s.11(b) Trial within reasonable time — R v Jordan 2016 SCC 27
- s.11(d) Presumption of innocence
- s.24(2) Exclusion of evidence — R v Grant three-part test

KEY CRIMINAL CODE SECTIONS:
- Self-defence: s.34 — R v Khill 2021 SCC 37
- Assault: s.265-266 — R v Ewanchuk [1999] consent
- Sexual assault: s.271-273 — R v Barton 2019 SCC 33, s.276 Mills regime
- Harassment: s.264 — R v Kosikar
- Threats: s.264.1 — McCraw test
- Impaired: s.320.14 — R v Breault 2023 SCC 9, R v St-Onge Lamoureux
- Breach: s.145 — R v Zora 2020 SCC 14 subjective mens rea
- Mischief: s.430 — colour of right
- Fraud: s.380 — R v Theroux deprivation element
- Weapons: s.86-96
- Homicide: s.222-236 — R v Khill self-defence, provocation s.232
- Obstruction: s.129/270 — lawful execution requirement

CREDIBILITY & EVIDENCE:
- W(D) test — R v W(D) [1991] 1 SCR 742 — three steps for credibility
- Prior inconsistent statements — CEA s.9-10, KGB statements
- Hearsay — principled approach R v Khan, R v Khelawon
- Similar fact evidence — R v Handy 2002 SCC 56
- Expert evidence — R v Mohan, R v Abbey

PROCEDURE:
- Disclosure: Stinchcombe [1991] 3 SCR 326 — full disclosure obligation
- Bail: s.515 — three grounds, ladder principle R v Antic 2017 SCC 27
- Jordan delay: 18-month ceiling provincial, 30-month superior
- Preliminary inquiry: s.535+ CC
- Plea: Gladue principles — R v Gladue [1999] 1 SCR 688, R v Ipeelee 2012 SCC 13
- Sentencing: s.718-718.2, R v Lacasse 2015 SCC 64, Parity principle

RESPONSE FORMAT:
- Lead with the most important information
- Cite specific cases and sections — always
- Be direct and practical — what should they DO
- Flag when something urgently requires a lawyer
- Mark draft documents: DRAFT — REVIEW BEFORE FILING
- For Charter applications, explain the three-part Grant test
- For credibility challenges, walk through W(D)
- For disclosure issues, reference Stinchcombe specifically

IMPORTANT DISCLAIMERS:
- Always note this is not legal advice
- For serious charges (sexual assault, homicide, major fraud) strongly recommend retaining counsel
- Legal Aid Ontario: 1-800-668-8258
- Duty counsel is available at all Ontario courts`;

router.post('/', requireAuth, async (req, res) => {
  const { messages, context } = req.body;
  const user = req.user;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'API key not configured.' });
  if (!messages) return res.status(400).json({ error: 'No messages provided.' });

  const limit = checkLimit(user, 'criminal', 'chat');
  if (!limit.allowed) {
    return res.status(402).json({
      error: 'limit_reached', code: limit.reason,
      used: limit.used, limit: limit.limit, plan: user.plan,
    });
  }

  let system = CRIMINAL_SYSTEM;

  // Inject profile context if available
  const profile = context?.profile;
  if (profile && (profile.first || profile.charges)) {
    system += `\n\nUSER PROFILE:\nName: ${profile.first||''} ${profile.last||''}\nCharges: ${profile.charges||'Not specified'}\nCourt File: ${profile.filenum||'N/A'}\nCourt: ${profile.court||'N/A'}\nNext Date: ${profile.nextdate||'N/A'}\nNext Event: ${profile.nextevent||'N/A'}\nBail Conditions: ${profile.bail||'N/A'}\nPrior Record: ${profile.record||'Not specified'}\nIndigenous: ${profile.indigenous||'Not specified'}`;
  }

  // Inject analysis results if available
  if (context?.analysisResults) {
    const r = context.analysisResults;
    const summary = [];
    if (r.pass1?.inconsistencies?.length) summary.push(`${r.pass1.inconsistencies.length} narrative inconsistencies found`);
    if (r.pass2?.charterIssues?.length) summary.push(`${r.pass2.charterIssues.length} Charter issues identified`);
    if (r.pass5?.defenceTheory) summary.push(`Defence theory: ${r.pass5.defenceTheory.slice(0,200)}`);
    if (summary.length) system += `\n\nDISCLOSURE ANALYSIS CONTEXT:\n${summary.join('\n')}`;
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
    console.log('Criminal chat response status:', resp.status, data.error ? JSON.stringify(data.error) : 'ok');

    if (!resp.ok) return res.status(resp.status).json({ error: data.error?.message || 'API error' });

    recordUsage(user.id, 'criminal', 'chat');
    res.json(data);
  } catch (err) {
    console.error('Criminal chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
