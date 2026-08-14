'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { checkLimit, recordUsage, trackApiUsage, trackGlobalApiUsage, checkCounselLimits,
        createConversation, getConversation, addMessageToConversation,
        updateConversationTitle, autoTitleFromMessage,
        getUserProfile, getCriminalInfo, listParties, listCharges,
        listPseudonyms, allocatePseudonym } = require('../db');
const { buildPseudonymMap, buildSystemPrompt, scrub, restore } = require('../lib/caseContext');

const CRIMINAL_SYSTEM = `You are ClearStand Criminal, an AI-powered Canadian criminal defence assistant for self-represented accused, the people supporting them, and defence counsel. You were built with 25 years of Canadian law enforcement experience, giving you working knowledge of disclosure practices, investigative procedure, and how Crown briefs are assembled.

JURISDICTION: Canada — Criminal Code of Canada, Canadian Charter of Rights and Freedoms, Canada Evidence Act, CDSA, and applicable provincial court rules.

YOUR ROLE:
- You assist the defence. You are rigorous about the strength of an argument — flag weak positions as weak rather than overstating them
- You provide detailed, accurate, caselaw-grounded criminal defence guidance
- You explain legal concepts in plain language without dumbing them down
- You flag Charter violations proactively
- You help SRLs prepare for court, understand disclosure, and build their defence
- Where the user is counsel, assume professional knowledge and skip basic explanations

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
- Cite specific cases and sections where you are confident the citation is correct. Where you are not, name the doctrine or principle and say the citation needs checking. Fabricating a citation is worse than giving none
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
  const { messages, context, conversationId: incomingConvId } = req.body;
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

  // ── Conversation persistence: resolve or create a conversation for this message ──
  let conversationId = null;
  let isNewConversation = false;
  const latestUserMsg = Array.isArray(messages) ? [...messages].reverse().find(m => m.role === 'user') : null;
  const latestUserContent = typeof latestUserMsg?.content === 'string' ? latestUserMsg.content : '';

  if (incomingConvId) {
    // Verify it exists and belongs to this user
    const existing = getConversation(incomingConvId, user.id);
    if (existing) {
      conversationId = existing.id;
    } else {
      // Passed a bad/deleted ID — fall through to create a new one
      isNewConversation = true;
    }
  } else {
    isNewConversation = true;
  }

  if (isNewConversation) {
    const title = autoTitleFromMessage(latestUserContent);
    try {
      const conv = createConversation(user.id, 'criminal', title);
      conversationId = conv.id;
    } catch (e) {
      console.error('[Criminal chat] Failed to create conversation:', e.message);
      // Non-fatal — continue without persistence
    }
  }

  // ── Prompt assembly (see server/lib/caseContext.js) ──
  // Name, DOB, address, phone, email, and court file number are not
  // emitted by any path here. The module has no builder that produces
  // them, so no request flag can turn identity back on.
  const caseData = {
    product:  'criminal',
    profile:  getUserProfile(user.id),
    caseInfo: getCriminalInfo(user.id),
    parties:  listParties(user.id, 'criminal'),
    charges:  listCharges(user.id),
  };

  // Seeded with every token this user already has so restore() still
  // resolves names from conversations saved before a party was removed.
  const pseudonyms = buildPseudonymMap(
    caseData,
    (value, prefix, numbered) => allocatePseudonym(user.id, 'criminal', value, prefix, '', numbered),
    listPseudonyms(user.id, 'criminal')
  );

  // Builders that supply their own prompt keep the input they have
  // today: no case block. This gate preserves their current output —
  // it is not the privacy control. Identity is absent either way.
  const withCaseBlock = !context?.systemOverride && !context?.jsonMode;

  const extras = [];
  if (context?.jsonMode) {
    extras.push('IMPORTANT: Respond ONLY with valid JSON. No markdown, no preamble, just the JSON object.');
  }
  if (context?.analysisResults) {
    const r = context.analysisResults;
    const summary = [];
    if (r.pass1?.inconsistencies?.length) summary.push(`${r.pass1.inconsistencies.length} narrative inconsistencies found`);
    if (r.pass2?.charterIssues?.length) summary.push(`${r.pass2.charterIssues.length} Charter issues identified`);
    if (r.pass5?.defenceTheory) summary.push(`Defence theory: ${scrub(r.pass5.defenceTheory.slice(0,200), pseudonyms)}`);
    if (summary.length) extras.push(`DISCLOSURE ANALYSIS CONTEXT:\n${summary.join('\n')}`);
  }

  const system = buildSystemPrompt({
    basePrompt:     CRIMINAL_SYSTEM,
    clientOverride: context?.systemOverride,
    product:        'criminal',
    data:           withCaseBlock ? caseData : null,
    map:            pseudonyms,
    extra:          extras.join('\n\n'),
  });

  // Typed messages carry names the profile never sees. Full-name matches
  // only — substituting bare first names would wreck ordinary prose.
  // The original text is what gets persisted below, not this copy.
  const outboundMessages = Array.isArray(messages)
    ? messages.map(m => (typeof m.content === 'string'
        ? { ...m, content: scrub(m.content, pseudonyms) }
        : m))
    : messages;

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
        max_tokens: 1500,
        system,
        messages: outboundMessages,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) return res.status(resp.status).json({ error: data.error?.message || 'API error' });

    // Put the real names back before anything downstream sees the reply —
    // the client, the saved conversation, and any export all get the same
    // text the user would have got before this change.
    if (Array.isArray(data.content)) {
      data.content = data.content.map(b =>
        b && b.type === 'text' ? { ...b, text: restore(b.text, pseudonyms) } : b);
    }

    recordUsage(user.id, 'criminal', 'chat');

    // System B — track real token consumption for cost monitoring
    const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    trackApiUsage(user.id, 'chat', tokens);
    trackGlobalApiUsage(tokens);

    // Persist messages to conversation
    if (conversationId) {
      try {
        // Save the user's latest message (only if this is not an internal/tool call)
        if (latestUserContent && !context?.jsonMode && !context?.systemOverride) {
          addMessageToConversation(conversationId, 'user', latestUserContent);
        }
        // Save the assistant reply
        const assistantText = data.content?.[0]?.text;
        if (assistantText && !context?.jsonMode && !context?.systemOverride) {
          addMessageToConversation(conversationId, 'assistant', assistantText);
        }
      } catch (e) {
        console.error('[Criminal chat] Failed to save messages:', e.message);
      }
    }

    res.json({ ...data, conversationId });
  } catch (err) {
    console.error('Criminal chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
