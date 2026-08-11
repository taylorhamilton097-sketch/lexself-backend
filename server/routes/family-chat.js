'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { checkLimit, recordUsage, getCaseProfile, trackApiUsage, trackGlobalApiUsage, checkCounselLimits,
        createConversation, getConversation, addMessageToConversation,
        updateConversationTitle, autoTitleFromMessage,
        getUserProfile, listChildren, getFamilyInfo, listParties,
        listPseudonyms, allocatePseudonym } = require('../db');
const { buildPseudonymMap, buildSystemPrompt, scrub, restore } = require('../lib/caseContext');

const FAMILY_SYSTEM = `You are ClearStand Family, an Ontario family law assistant for self-represented litigants (SRLs). You are always on the side of the person you are helping.

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
  const { messages, context, conversationId: incomingConvId } = req.body;
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
    const existing = getConversation(incomingConvId, user.id);
    if (existing) {
      conversationId = existing.id;
    } else {
      isNewConversation = true;
    }
  } else {
    isNewConversation = true;
  }

  if (isNewConversation) {
    const title = autoTitleFromMessage(latestUserContent);
    try {
      const conv = createConversation(user.id, 'family', title);
      conversationId = conv.id;
    } catch (e) {
      console.error('[Family chat] Failed to create conversation:', e.message);
    }
  }

  // ── Prompt assembly (see server/lib/caseContext.js) ──
  // Name, DOB, address, phone, email, court file number, and the
  // children's names and dates of birth are not emitted by any path
  // here. Children are described by age instead, which is what the
  // best-interests and support analysis actually needs.
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

  // The case block stays on when a builder supplies its own prompt.
  // This route sends the profile block on every request today, including
  // override paths, so keeping the case facts is what preserves the
  // affidavit builder's current input. Criminal-chat gates it off for
  // the same reason inverted — that route sends nothing today. Same
  // rule both places: keep what the builder gets now, minus identity.
  const extras = [];
  if (context?.currentForm) {
    extras.push(`The user is currently working on: ${scrub(String(context.currentForm), pseudonyms)}. Focus your response on this form's requirements, common mistakes, and relevant caselaw.`);
  }
  // The affidavit builder sends jsonMode and parses the reply; anything
  // that is not valid JSON leaves its document pane empty and export
  // reports no content. criminal-chat has always reinforced this, this
  // route never did. It goes in extras so it lands after the case block
  // rather than being buried above several hundred words of markdown.
  if (context?.jsonMode) {
    extras.push('IMPORTANT: Respond ONLY with valid JSON. No markdown, no preamble, no explanation, no code fences.');
  }

  const system = buildSystemPrompt({
    basePrompt:     FAMILY_SYSTEM,
    clientOverride: context?.systemOverride,
    product:        'family',
    data:           caseData,
    map:            pseudonyms,
    extra:          extras.join('\n\n'),
  });

  // Typed messages carry names the profile never sees. Full-name matches
  // only. The original text is what gets persisted below, not this copy.
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
        // claude-sonnet-4-20250514 retired 2026-06-15 and returns 404,
        // which surfaced to users as the assistant replying with the
        // model id — the client renders data.error when there is no
        // content block.
        //
        // Sonnet 5 runs adaptive thinking when `thinking` is omitted, and
        // max_tokens covers thinking plus the reply. Disabled here to keep
        // the same output budget as before rather than change two things
        // while restoring service.
        model: 'claude-sonnet-5',
        thinking: { type: 'disabled' },
        max_tokens: 4000,
        system,
        messages: outboundMessages,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) return res.status(resp.status).json({ error: data.error?.message });

    // Real names back before the client, the saved conversation, or any
    // export sees the reply. Matters more here than in criminal chat:
    // this route drafts affidavit text that gets filed.
    if (Array.isArray(data.content)) {
      data.content = data.content.map(b =>
        b && b.type === 'text' ? { ...b, text: restore(b.text, pseudonyms) } : b);
    }

    recordUsage(user.id, 'family', 'chat');

    // System B — track real token consumption for cost monitoring
    const tokens = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    trackApiUsage(user.id, 'chat', tokens);
    trackGlobalApiUsage(tokens);

    // Persist messages to conversation
    if (conversationId) {
      try {
        if (latestUserContent && !context?.systemOverride) {
          addMessageToConversation(conversationId, 'user', latestUserContent);
        }
        const assistantText = data.content?.[0]?.text;
        if (assistantText && !context?.systemOverride) {
          addMessageToConversation(conversationId, 'assistant', assistantText);
        }
      } catch (e) {
        console.error('[Family chat] Failed to save messages:', e.message);
      }
    }

    res.json({ ...data, conversationId });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
