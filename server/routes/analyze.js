'use strict';

const express = require('express');
const router  = express.Router();
const { requireAuth } = require('../middleware/auth');
const { checkLimit, recordUsage, trackApiUsage, trackGlobalApiUsage, checkCounselLimits } = require('../db');

// A disclosure package is capped on PAGES, not on file count. One 400-page
// PDF and ten 40-page PDFs cost exactly the same to analyse, so a file-count
// limit would restrict the wrong thing. Pages are what the API bills for.
//
// These are the per-analysis ceilings. One analysis credit buys one package,
// so without a ceiling a single credit would buy an unbounded amount of API
// spend. Counsel at 1000 pages x 20 analyses is the tightest against its
// price; that is the number to revisit if real packages run long.
//
// Free matches essential deliberately. A free account gets one analysis ever,
// so its total exposure is about a dollar and the ceiling has nothing to bound.
// A typical impaired brief runs 40-80 pages, and refusing a realistic first
// analysis would cost a conversion to save nothing. Essential's value is three
// analyses a month, not larger ones.
const PAGE_CEILING = {
  free: 150, essential: 150, complete: 400, counsel: 1000, admin: 4000,
};

const MAX_FILES = 20;

// Output ceiling per pass.
//
// THE BINDING CONSTRAINT IS TIME, NOT MONEY. These requests are not streamed,
// so the API sends nothing until the whole response has finished generating,
// and Node's fetch (undici) gives up if no body arrives within 300 seconds.
// At roughly 45-60 output tokens a second that puts the hard limit somewhere
// around 13,500-18,000 tokens in a single request.
//
// A previous version set pass3 to 14000 and allowed a retry at 21000. The
// retry could not possibly return inside the window and the analysis died
// with "fetch failed" partway through, leaving the browser showing a progress
// bar for a request that no longer existed.
//
// So these are sized to finish comfortably inside the window, not to fit
// everything the model would like to write. Some passes will truncate at
// these values — that is the deliberate trade, because a truncated pass is
// now reported honestly on screen whereas a timeout loses the whole run.
//
// Streaming removes this constraint entirely and is the proper fix. Until it
// lands, do not raise these.
const PASS_MAX_TOKENS = {
  pass1: 8000, pass2: 8000, pass3: 8000, pass4: 9000, pass5: 8000,
};

// A pass is retried ONLY when it came back complete but malformed, and then at
// the same ceiling. Retrying a truncated pass with a bigger budget was tried
// and measured: it truncated again every time, because the constraint is the
// 300-second window rather than the number. See the classify() comment below.
//
// Our own deadline, set below undici's 300s so a request that is going to fail
// fails as OUR error with a message that says what happened, rather than as a
// bare "fetch failed" from somewhere in the network stack.
const REQUEST_TIMEOUT_MS = 270000;

// The Anthropic request has a hard payload limit and base64 inflates a PDF by
// about a third, so the raw total has to stay comfortably under it.
const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;

// Appended to every pass. The passes were not asking for too many findings,
// they were writing each one as prose: five or six paragraph-length fields per
// item. Three of five passes overran the time window on a 23-page brief.
//
// This constrains HOW EACH FINDING IS WRITTEN and deliberately does not cap how
// many are reported. Dropping a genuine Charter breach to save tokens is not a
// trade this tool gets to make.
const BREVITY = `

LENGTH DISCIPLINE — this is a working document for a lawyer, not prose:
- Each field is one or two sentences. Never a paragraph.
- Quote at most 25 words, and only where the exact wording carries the point.
- State each fact once. Do not restate it in a second field.
- No preamble, no restating the instruction, no summary of your own answer.
- Omit any optional field you have nothing specific to put in rather than
  filling it with a generality.

Report EVERY finding you identify. This applies to how each finding is written,
not to how many you report. Order them most significant first.`;

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

Do NOT draft the demand letter here — it is requested separately.

Return JSON: { "missingItems": [...], "overallDisclosureAssessment": "..." }
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

// The demand letter used to be requested inside pass 4, alongside a list of
// missing disclosure across twelve categories with five fields each. A formal
// letter and a long findings list were competing for one budget, and pass 4
// overran every time. Separated, each fits comfortably.
//
// Returned as plain text rather than inside JSON on purpose: a letter carries
// newlines and quotation marks, and escaping it into a JSON string is exactly
// what produces the unparseable responses this route already has to handle.
const LETTER_PROMPT = `You are Canadian defence counsel. Draft a formal Stinchcombe disclosure demand letter addressed to the Crown, requesting the items listed below.

Requirements:
- Standard letter form, ready to be put on letterhead and sent.
- Ground the request in Stinchcombe [1991] 3 SCR 326 and the Crown's ongoing disclosure obligation.
- Group the items sensibly rather than listing them mechanically.
- State a reasonable deadline for production and the application that follows if it is not met.
- Mark it DRAFT — REVIEW BEFORE SENDING at the top.
- Do not invent a court file number, a date, or the names of counsel. Use a
  clearly marked placeholder in square brackets where one is needed.

Return the letter text only. No JSON, no markdown fences, no commentary before or after.`;

// A letter of this kind runs to roughly 800-1500 words. 4000 tokens is ample
// and well inside the request window.
const LETTER_MAX_TOKENS = 4000;

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

  // Get PDFs from multipart form. Same field name as the single-file version,
  // so a client sending one file still works unchanged.
  const multer = require('multer');
  const storage = multer.memoryStorage();
  const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024, files: MAX_FILES },
  }).array('disclosure', MAX_FILES);

  upload(req, res, async (err) => {
    if (err) {
      // multer's own messages are opaque, so name the limit that was hit.
      const message =
        err.code === 'LIMIT_FILE_SIZE'  ? 'One of those PDFs is larger than 25MB. Split it and try again.' :
        err.code === 'LIMIT_FILE_COUNT' ? `Please add no more than ${MAX_FILES} PDFs to one analysis.` :
        'File upload error: ' + err.message;
      return res.status(400).json({ error: message });
    }

    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No PDF file provided.' });

    const totalBytes = files.reduce((n, f) => n + f.size, 0);
    if (totalBytes > MAX_PACKAGE_BYTES) {
      const mb = (totalBytes / 1024 / 1024).toFixed(1);
      return res.status(413).json({
        error: `That package is ${mb}MB in total, above the ${MAX_PACKAGE_BYTES / 1024 / 1024}MB a single analysis can carry. Remove some documents, or run the package in parts.`,
        code: 'package_too_large',
      });
    }

    // Page count before anything is sent, so an oversized package is refused
    // for nothing rather than failing partway through pass 3 with two passes
    // already paid for.
    //
    // pdf-parse is pinned to a 2018 build of pdf.js which rejects outright on
    // anything it dislikes, and a scanned Crown PDF it refuses may be one the
    // API reads perfectly well. So a failed count never blocks the analysis —
    // that file counts as unknown and the byte ceiling above backstops it.
    const pdfParse = require('pdf-parse');
    const pageCounts = [];
    let totalPages = 0, unknownPages = 0;
    for (const f of files) {
      let pages = null;
      try {
        const parsed = await pdfParse(f.buffer, { max: 1 });
        pages = parsed.numpages || null;
      } catch (e) {
        // Reason only — never document content.
        console.error('[analysis] page count unavailable for one file:', e.message);
      }
      pageCounts.push(pages);
      if (pages) totalPages += pages; else unknownPages++;
    }

    const ceiling = PAGE_CEILING[user.plan] || PAGE_CEILING.free;
    if (totalPages > ceiling) {
      return res.status(413).json({
        error: `That package is ${totalPages} pages. Your plan allows up to ${ceiling} pages in one analysis. Remove some documents, or run the package in parts.`,
        code: 'page_ceiling',
        pages: totalPages,
        limit: ceiling,
      });
    }

    const chargeContext = req.body.chargeContext || '';

    // Built once and reused on all five passes. The cache is a prefix match,
    // so these blocks have to be byte-identical every time — building them
    // inside the pass loop would also re-encode every document five times.
    //
    // Labels are deliberately generic. Crown filenames routinely contain the
    // complainant's name, and filenames are not worth sending to the API to
    // get a label. The real names go back to the browser in meta.documents.
    const documentContent = [];
    files.forEach((f, idx) => {
      documentContent.push({
        type: 'text',
        text: `--- Document ${idx + 1} of ${files.length} ---`,
      });
      documentContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: f.buffer.toString('base64') },
        // One breakpoint caches everything above it and only four are
        // available, so it goes on the last document, not on every one.
        ...(idx === files.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
      });
    });

    const packageNote = files.length > 1
      ? `\n\nYou have been given ${files.length} documents from a single Crown disclosure package, labelled Document 1 through Document ${files.length}. Analyse them together as one package — a contradiction between two documents matters as much as one inside a single document. Where a finding rests on a particular document, name its label.`
      : '';

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    const results = {};
    // Passes that could not be used, so the report can say so instead of
    // rendering them as zero findings.
    const warnings = [];
    const passes = ['pass1', 'pass2', 'pass3', 'pass4', 'pass5'];
    const passNames = {
      pass1: 'Narrative & Inconsistencies',
      pass2: 'Charter Analysis',
      pass3: 'Credibility & Fabrication',
      pass4: 'Missing Disclosure',
      pass5: 'Defence Strategy',
    };
    let totalTokens = 0;
    // Split out so the saving is measurable. Cached reads bill at about
    // 0.1x and the initial write at about 1.25x, so these three numbers
    // are what turn a token count into a cost.
    let cacheWriteTokens = 0, cacheReadTokens = 0, freshInputTokens = 0, outputTokens = 0;
    // How many passes had to be run twice. A number worth watching: if it is
    // routinely above zero the ceilings are set too low and every retry is
    // output paid for and thrown away.
    let retried = 0;

    // Called for every API response including a retry, so a pass that ran
    // twice is billed as twice.
    //
    // input_tokens counts only the uncached remainder, so with caching on, the
    // package sits in cache_read instead. All four are summed so token_count
    // keeps meaning "tokens processed" and stays comparable with rows written
    // before caching existed — the saving shows up as cost, not a smaller count.
    const countTokens = (data) => {
      const u = data.usage || {};
      const cw = u.cache_creation_input_tokens || 0;
      const cr = u.cache_read_input_tokens || 0;
      freshInputTokens += u.input_tokens || 0;
      outputTokens     += u.output_tokens || 0;
      cacheWriteTokens += cw;
      cacheReadTokens  += cr;
      totalTokens += (u.input_tokens || 0) + (u.output_tokens || 0) + cw + cr;
    };

    try {
      // Extract charge info first
      send({
        type: 'progress', pass: 'extract', percent: 2,
        message: files.length > 1
          ? `Reading ${files.length} documents${totalPages ? ` — ${totalPages} pages` : ''}…`
          : 'Reading disclosure document…',
      });

      for (let i = 0; i < passes.length; i++) {
        const pass = passes[i];
        const percent = Math.round(10 + (i / passes.length) * 85);
        send({ type: 'progress', pass, percent, message: `Pass ${i+1} — ${passNames[pass]}…` });

        const contextNote = chargeContext ? `\n\nCharge context: ${chargeContext}` : '';

        // Only passes that actually parsed are carried forward. A pass that
        // was cut off would otherwise be stringified into every later pass
        // as a fragment — paid for on each one, and inviting the model to
        // reason from half a sentence.
        const usable = {};
        for (const [key, value] of Object.entries(results)) {
          if (value && !value._incomplete) usable[key] = value;
        }
        const prevResults = Object.keys(usable).length > 0
          ? `\n\nPrevious analysis results:\n${JSON.stringify(usable, null, 2)}`
          : '';

        // Extracted so a pass that runs out of room can be run again with
        // more of it. Everything above the text block is unchanged between
        // the two attempts, so the retry reads the package from cache.
        // promptText is passed in rather than derived, so the demand letter can
        // reuse this with the same cached document blocks above it.
        const runPass = async (maxTokens, promptText) => {
          // Without a signal this waits on undici's default and then reports
          // "fetch failed", which says nothing about what went wrong.
          //
          // The deadline has to stay live until the BODY has been read, not
          // just until fetch resolves. fetch resolves on headers; for an
          // unstreamed request the response text arrives afterwards and is
          // the slow part. Clearing the timer before reading the body would
          // leave the slowest stretch of the request unprotected.
          const controller = new AbortController();
          const deadline = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
          try {
            const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-5-20250929',
              max_tokens: maxTokens,
              messages: [{
                role: 'user',
                content: [
                  // The whole package is sent on every one of the five passes.
                  // cache_control on the last document means pass 1 writes it
                  // to the cache and passes 2-5 read it back at roughly a tenth
                  // of the price, instead of paying full rate five times.
                  //
                  // Caching is a prefix match, so this only works while these
                  // blocks stay byte-identical across passes and everything
                  // that varies — the pass prompt, the charge context, the
                  // accumulated results — stays in the text block below them.
                  // Do not move anything that changes per pass above this point.
                  //
                  // The five-minute cache lifetime refreshes on each read, so
                  // sequential passes keep it alive.
                  ...documentContent,
                  { type: 'text', text: promptText }
                ],
              }],
            }),
            });

            if (!resp.ok) {
              const e = await resp.json().catch(() => ({}));
              throw new Error(e.error?.message || `Pass ${i+1} failed (HTTP ${resp.status})`);
            }
            return await resp.json();
          } catch (e) {
            if (e.name === 'AbortError') {
              throw new Error(
                `Pass ${i+1} (${passNames[pass]}) took longer than ${Math.round(REQUEST_TIMEOUT_MS/1000)} seconds and was stopped. ` +
                `Try again — if it keeps happening the document is too long for a single pass.`
              );
            }
            // A network failure. Surface the underlying reason: "fetch failed"
            // on its own is undici's wrapper and tells us nothing. An error we
            // threw ourselves above has no cause and passes through unchanged.
            if (e.cause) throw new Error(`Pass ${i+1} could not reach the API (${e.cause.code || e.cause.message})`);
            throw e;
          } finally {
            clearTimeout(deadline);
          }
        };

        // Two distinct failures, which need opposite treatment.
        //
        // stop_reason 'max_tokens' means the model was still writing when it
        // ran out of room, so the JSON is unterminated. Retrying that is
        // futile: truncation means the pass wants more room than the 300s
        // window allows at ANY workable ceiling. Measured on a 23-page brief,
        // passes 3, 4 and 5 each truncated at their ceiling and truncated
        // again on retry — about 11 minutes and 30,000 output tokens per run
        // spent to achieve nothing.
        //
        // A complete but malformed response is the opposite case. Pass 2 once
        // returned a markdown heading instead of JSON, failing at position 0.
        // Nothing was too long; the model just ignored the format. A second
        // attempt at the same ceiling usually complies.
        const classify = (data) => {
          if (data.stop_reason === 'max_tokens') return { reason: 'truncated' };
          const text = data.content?.[0]?.text || '{}';
          try {
            return { ok: true, value: JSON.parse(text.replace(/```json|```/g, '').trim()) };
          } catch (e) {
            return { reason: 'unparseable', detail: e.message };
          }
        };

        const promptText = PASS_PROMPTS[pass] + BREVITY + packageNote + contextNote + prevResults;
        const ceiling = PASS_MAX_TOKENS[pass] || 8000;
        let data = await runPass(ceiling, promptText);
        countTokens(data);
        let outcome = classify(data);

        // Same ceiling — this is a formatting retry, not a bigger-budget one.
        if (!outcome.ok && outcome.reason === 'unparseable') {
          console.error(`[analysis] ${pass} came back malformed, retrying once`);
          send({
            type: 'progress', pass, percent,
            message: `Pass ${i+1} — ${passNames[pass]} (reformatting)…`,
          });
          data = await runPass(ceiling, promptText);
          countTokens(data);
          outcome = classify(data);
          retried++;
        }

        // A pass that cannot be used is recorded as unusable, not as an empty
        // object. The report reads a missing array as zero findings, so before
        // this a discarded Charter pass displayed as "0 Charter issues" —
        // indistinguishable from a brief with no Charter problems in it.
        if (outcome.ok) {
          results[pass] = outcome.value;

          // Drafted as its own request, immediately after the items it is based
          // on, so the progress step still reads as pass 4 and the report finds
          // the letter where it has always looked for it.
          if (pass === 'pass4') {
            send({
              type: 'progress', pass, percent,
              message: `Pass ${i+1} — ${passNames[pass]} (drafting the demand letter)…`,
            });
            try {
              const letterPrompt = LETTER_PROMPT + packageNote + contextNote +
                `\n\nItems to request:\n${JSON.stringify(outcome.value.missingItems || [], null, 2)}`;
              const letterData = await runPass(LETTER_MAX_TOKENS, letterPrompt);
              countTokens(letterData);
              const letter = letterData.content?.[0]?.text || '';
              if (letterData.stop_reason === 'max_tokens' || !letter.trim()) {
                // Half a demand letter is worse than none — it reads as
                // complete and would be sent that way.
                console.error('[analysis] demand letter unusable:',
                  letterData.stop_reason === 'max_tokens' ? 'cut off' : 'empty');
                warnings.push({
                  pass: 'letter',
                  name: 'Stinchcombe Demand Letter',
                  message: 'The demand letter could not be drafted. The missing disclosure list above is unaffected.',
                });
              } else {
                results.pass4.disclosureRequestLetter = letter.trim();
              }
            } catch (e) {
              // The letter failing must not lose the four passes already done.
              console.error('[analysis] demand letter failed:', e.message);
              warnings.push({
                pass: 'letter',
                name: 'Stinchcombe Demand Letter',
                message: 'The demand letter could not be drafted. The missing disclosure list above is unaffected.',
              });
            }
          }
        } else {
          const truncated = outcome.reason === 'truncated';
          // The reason only — never document content.
          console.error(`[analysis] ${pass} unusable:`,
            truncated ? 'cut off at the output ceiling' : outcome.detail);
          results[pass] = { _incomplete: true, _reason: outcome.reason };
          warnings.push({
            pass,
            name: passNames[pass],
            message: truncated
              ? `${passNames[pass]} was cut off before it finished. It has been left out of this report.`
              : `${passNames[pass]} came back in a form the app could not read. It has been left out of this report.`,
          });
        }
      }

      recordUsage(user.id, 'criminal', 'analysis');

      // System B — one analysis, summed tokens across all 5 passes
      trackApiUsage(user.id, 'analysis', totalTokens);
      trackGlobalApiUsage(totalTokens);

      // Numbers only — never document content. cacheRead near zero across
      // a whole analysis means the cache is not being hit and the document
      // is being paid for five times; that is the thing to watch for.
      console.log('[analysis tokens]', {
        userId: user.id,
        passes: passes.length,
        documents: files.length,
        pages: totalPages,
        freshInput: freshInputTokens,
        cacheWrite: cacheWriteTokens,
        cacheRead: cacheReadTokens,
        output: outputTokens,
        total: totalTokens,
        retried,
        incomplete: warnings.length,
      });

      // Try to detect charge from pass1
      const chargeDetected = results.pass1?.chargeDetected || chargeContext || 'Unknown Charge';

      send({
        type: 'complete',
        results: { ...results, chargeLabel: chargeDetected, chargeDetected },
        warnings,
        meta: {
          // A real count now, where pdf.js could read it. Filenames go back
          // for display only — they were never sent to the API.
          pages: totalPages || '?',
          pagesUnknownFor: unknownPages,
          documents: files.map((f, i) => ({
            label: `Document ${i + 1}`,
            name: f.originalname,
            pages: pageCounts[i],
          })),
        },
      });

    } catch(err) {
      // err.cause carries the real reason for a network failure — an undici
      // timeout code, a DNS failure, a closed socket. Logging only err.message
      // gave "fetch failed" and left the actual cause to be guessed at.
      const cause = err.cause?.code || err.cause?.message || '';
      console.error('Analysis error:', err.message, cause ? `| cause: ${cause}` : '');
      send({ type: 'error', message: err.message });
    }

    res.end();
  });
});

module.exports = router;
