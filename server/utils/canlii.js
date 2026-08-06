'use strict';

/**
 * CanLII citation verification.
 *
 * ── What this can and cannot prove ─────────────────────────────────
 *
 * CAN prove:  the citation resolves to a real decision on CanLII, and
 *             the case name the model used matches the real style of
 *             cause for that citation.
 *
 * CANNOT prove: that the decision actually supports the proposition it
 *             was cited for. Nothing in the CanLII API can establish
 *             that — the API is metadata-only, with no document text
 *             and no full-text search. Any UI built on this MUST say so.
 *
 * ── How lookup works without a search endpoint ─────────────────────
 *
 * The API has no "find a case by citation" call. It does have
 * caseBrowse/{lang}/{databaseId}/{caseId}, and per CanLII's docs the
 * caseId "generally corresponds to the CanLII citation" — their own
 * example resolves 2008 SCC 9 at csc-scc/2008scc9.
 *
 * So for any NEUTRAL citation (roughly 2000 onward) the lookup key can
 * be constructed deterministically:
 *
 *     "2016 SCC 27"  ->  databaseId csc-scc, caseId 2016scc27
 *     "2019 ONCA 644" ->  databaseId onca,    caseId 2019onca644
 *
 * Pre-neutral citations ([1991] 3 SCR 326) have opaque ids of the form
 * 1991canlii45 that cannot be derived from the reporter citation. Those
 * are reported as UNVERIFIABLE, not as failures — an important
 * distinction, since several of the leading criminal cases (Stinchcombe,
 * W(D), Gladue) fall in this category.
 *
 * ── Rate limits (per CanLII's grant) ───────────────────────────────
 *   5,000 queries/day · 2 requests/second · 1 request at a time
 *
 * All three are enforced here. The concurrency limit is global, not
 * per-user, so every request funnels through a single serialised queue.
 * Caching is what makes this workable: criminal law has a small canon,
 * so hit rates climb quickly.
 */

const API_BASE = 'https://api.canlii.org/v1';

// ── Rate limiting ──────────────────────────────────────────────────
const MIN_GAP_MS   = 550;   // 2/sec with headroom
const DAILY_BUDGET = 4500;  // 5,000 granted; leave margin

let queueTail   = Promise.resolve();  // serialises to 1 concurrent request
let lastCallAt  = 0;
let dailyCount  = 0;
let dailyKey    = '';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function budgetRemaining() {
  if (dailyKey !== todayKey()) { dailyKey = todayKey(); dailyCount = 0; }
  return DAILY_BUDGET - dailyCount;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Queue a single API call. Serialised globally, spaced by MIN_GAP_MS,
 * and refused once the daily budget is spent.
 */
function enqueue(fn) {
  const run = queueTail.then(async () => {
    if (budgetRemaining() <= 0) {
      const e = new Error('CANLII_DAILY_BUDGET_EXHAUSTED');
      e.code = 'BUDGET';
      throw e;
    }
    const wait = MIN_GAP_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    dailyCount++;
    return fn();
  });
  // Keep the chain alive even when a call rejects.
  queueTail = run.then(() => {}, () => {});
  return run;
}

// ── Court → databaseId ─────────────────────────────────────────────
//
// Most Canadian court abbreviations lowercase directly into the CanLII
// databaseId (ONCA -> onca). The Supreme Court is the notable exception:
// its databaseId is csc-scc, not scc. Federal courts and a few others
// also differ, so the known cases are mapped explicitly and anything
// else falls back to the lowercased abbreviation.

const COURT_DB = {
  // Supreme Court of Canada — bilingual id
  SCC: 'csc-scc',
  CSC: 'csc-scc',
  // Federal
  FCA: 'fca', FC: 'fc', FCT: 'fct', TCC: 'tcc', CMAC: 'cmac',
  // Ontario
  ONCA: 'onca', ONSC: 'onsc', ONCJ: 'oncj', ONSCDC: 'onscdc',
  ONSCSM: 'onscsm', ONCTC: 'onctc',
  // Other provinces — appellate + superior
  BCCA: 'bcca', BCSC: 'bcsc', BCPC: 'bcpc',
  ABCA: 'abca', ABKB: 'abkb', ABQB: 'abqb', ABPC: 'abpc',
  SKCA: 'skca', SKKB: 'skkb', SKQB: 'skqb', SKPC: 'skpc',
  MBCA: 'mbca', MBKB: 'mbkb', MBQB: 'mbqb', MBPC: 'mbpc',
  QCCA: 'qcca', QCCS: 'qccs', QCCQ: 'qccq',
  NBCA: 'nbca', NBKB: 'nbkb', NBQB: 'nbqb', NBPC: 'nbpc',
  NSCA: 'nsca', NSSC: 'nssc', NSPC: 'nspc',
  PECA: 'peca', PESC: 'pesc',
  NLCA: 'nlca', NLSC: 'nlsc', NLPC: 'nlpc',
  YKCA: 'ykca', YKSC: 'yksc', YKTC: 'yktc',
  NWTCA: 'nwtca', NWTSC: 'nwtsc', NWTTC: 'nwttc',
  NUCA: 'nuca', NUCJ: 'nucj',
};

function databaseIdFor(courtAbbrev) {
  const key = String(courtAbbrev || '').toUpperCase().replace(/[^A-Z]/g, '');
  return COURT_DB[key] || key.toLowerCase();
}

// ── Citation parsing ───────────────────────────────────────────────

/**
 * Neutral citation: YYYY COURT NNN
 * Matches "2016 SCC 27", "2019 ONCA 644", "2023 SCC 9".
 * The court group is 2-8 letters so it won't swallow prose.
 */
const NEUTRAL_RE = /\b(1[89]\d{2}|20\d{2})\s+([A-Z]{2,8})\s+(\d{1,5})\b/g;

/**
 * Pre-neutral CanLII id: "1998 CanLII 2237 (ON CA)".
 * The caseId is derivable (1998canlii2237) but the databaseId comes from
 * the court in parentheses, which is not always present.
 */
const CANLII_RE = /\b(1[89]\d{2}|20\d{2})\s+CanLII\s+(\d{1,6})\s*(?:\(([^)]{2,40})\))?/gi;

/**
 * Reporter citation with no neutral equivalent: "[1991] 3 SCR 326".
 * Captured only so it can be reported as unverifiable rather than
 * silently ignored.
 */
const REPORTER_RE = /\[(1[89]\d{2}|20\d{2})\]\s+(\d{1,2})\s+(SCR|RCS|DLR|CCC|OR|WWR|CR)\b\.?\s*(?:\(?\d(?:st|nd|rd|th)\)?\s*)?(\d{1,4})/gi;

/**
 * Look backwards from a citation for the case name attached to it.
 * Handles "R v Jordan, 2016 SCC 27", "R. v. Grant 2009 SCC 32",
 * "Kerr v Baranow 2011 SCC 10", and italic/asterisk wrappers.
 */
// Lowercase words allowed to sit inside a style of cause, e.g.
// "Catholic Children's Aid Society of Metropolitan Toronto".
const NAME_CONNECTORS = new Set(['of', 'and', 'the', 'de', 'du', 'des', 'la', 'le']);

// Capitalised discourse words that sit in front of a case name in prose
// ("See R. v. Grant", "Older: R v Stinchcombe"). Stripped from the front
// of an extracted name so the user sees the style of cause, not the
// sentence that introduced it.
const LEAD_IN_WORDS = new Set([
  'see', 'compare', 'cf', 'also', 'older', 'per', 'citing', 'following',
  'applying', 'from', 'in', 'at', 'and', 'but', 'accord', 'contra',
  'eg', 'ie', 'ex', 'newer', 'recent', 'leading', 'cases', 'case', 'authorities',
]);

function looksLikeNameToken(tok) {
  if (!tok) return false;
  const clean = tok.replace(/[*_]/g, '');
  if (!clean) return false;
  // Bare numbers are reporter-citation debris ("3 SCR 326 and R v W"), not names.
  if (/^\d+[.,]?$/.test(clean)) return false;
  return /^[A-ZÀ-Ý0-9]/.test(clean) || NAME_CONNECTORS.has(clean.toLowerCase());
}

/**
 * Find the style of cause immediately preceding a citation.
 *
 * A greedy regex swallows the sentence in front of the case name
 * ("The leading case is R v Jordan"), so this anchors on the LAST
 * "v"/"v."/"vs" separator before the citation and walks outward:
 * left until a token stops looking like part of a name, right to the
 * citation itself.
 */
function caseNameBefore(text, index) {
  const window = text.slice(Math.max(0, index - 160), index);

  // Last party separator in the window.
  const sepRe = /(?:^|\s)(v\.?|vs\.?)(?=\s)/gi;
  let sep = null, m;
  while ((m = sepRe.exec(window)) !== null) sep = m;
  if (!sep) return null;

  const sepStart = sep.index + sep[0].length - sep[1].length;
  const sepEnd   = sep.index + sep[0].length;

  // ── Right side: second party, up to the citation ──
  let right = window.slice(sepEnd).replace(/[\s,;:—–\-]+$/, '').trim();
  // Stop at a clause break so we don't absorb trailing prose.
  // Split on clause breaks, but keep attached parentheticals like "W(D)".
  right = right.split(/[,;:]|\s\(/)[0].trim();
  // Stop before any citation that follows the second party, so a name
  // never absorbs the previous sentence's citation.
  const rightTokens = [];
  for (const tok of right.split(/\s+/).filter(Boolean)) {
    if (/^\[?(1[89]|20)\d{2}\]?[.,]?$/.test(tok)) break;  // a year — citation starts here
    rightTokens.push(tok);
    if (rightTokens.length >= 6) break;
  }
  if (!rightTokens.length || !/^[A-ZÀ-Ý]/.test(rightTokens[0].replace(/[*_]/g, ''))) return null;

  // ── Left side: first party, walking backwards ──
  const leftTokens = window.slice(0, sepStart).trim().split(/\s+/).filter(Boolean);
  const kept = [];
  for (let i = leftTokens.length - 1; i >= 0 && kept.length < 8; i--) {
    const tok = leftTokens[i];
    if (!looksLikeNameToken(tok)) break;
    // A connector only counts if a real name token follows it further left.
    if (NAME_CONNECTORS.has(tok.toLowerCase()) && kept.length === 0) break;
    kept.unshift(tok);
  }
  // Trim leading connectors and prose lead-ins left dangling by the walk.
  // Never strip the last remaining token — "R" alone is a valid party.
  while (kept.length > 1) {
    const head = kept[0].replace(/[^A-Za-zÀ-ÿ]/g, '').toLowerCase();
    const punctuated = /[:;]$/.test(kept[0]);
    if (NAME_CONNECTORS.has(head) || LEAD_IN_WORDS.has(head) || punctuated) kept.shift();
    else break;
  }
  if (!kept.length) return null;
  // A single leftover lead-in word is not a party name.
  if (kept.length === 1 && LEAD_IN_WORDS.has(kept[0].replace(/[^A-Za-zÀ-ÿ]/g, '').toLowerCase())) return null;

  const name = `${kept.join(' ')} ${sep[1]} ${rightTokens.join(' ')}`
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return name.length > 120 ? null : name;
}

/**
 * Extract every citation in a block of text.
 * Returns [{ raw, kind, databaseId, caseId, caseName, index }]
 * kind: 'neutral' | 'canlii' | 'reporter'
 */
function extractCitations(text) {
  if (!text || typeof text !== 'string') return [];
  const found = [];
  const seen = new Set();

  const push = (obj) => {
    const key = `${obj.kind}|${obj.databaseId || ''}|${obj.caseId || ''}|${obj.raw}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(obj);
  };

  let m;
  NEUTRAL_RE.lastIndex = 0;
  while ((m = NEUTRAL_RE.exec(text)) !== null) {
    const [raw, year, court, num] = m;
    // Skip things that look like citations but aren't courts.
    if (/^(RSC|RSO|SOR|SC|SO|CQLR)$/i.test(court)) continue;
    push({
      raw,
      kind: 'neutral',
      databaseId: databaseIdFor(court),
      caseId: `${year}${court.toLowerCase()}${num}`,
      caseName: caseNameBefore(text, m.index),
      index: m.index,
    });
  }

  CANLII_RE.lastIndex = 0;
  while ((m = CANLII_RE.exec(text)) !== null) {
    const [raw, year, num, court] = m;
    push({
      raw,
      kind: 'canlii',
      databaseId: court ? databaseIdFor(court.replace(/\s+/g, '')) : null,
      caseId: `${year}canlii${num}`,
      caseName: caseNameBefore(text, m.index),
      index: m.index,
    });
  }

  REPORTER_RE.lastIndex = 0;
  while ((m = REPORTER_RE.exec(text)) !== null) {
    push({
      raw: m[0],
      kind: 'reporter',
      databaseId: null,
      caseId: null,
      caseName: caseNameBefore(text, m.index),
      index: m.index,
    });
  }

  return found.sort((a, b) => a.index - b.index);
}

// ── Title comparison ───────────────────────────────────────────────

function normalizeTitle(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // strip accents
    .toLowerCase()
    .replace(/\(canlii\)/g, '')
    .replace(/\br\.?\s+v\.?s?\.?\s+/g, 'r v ')          // R. v. -> r v
    .replace(/\bregina\b|\bthe queen\b|\bthe king\b/g, 'r')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compare the case name the model used against CanLII's style of cause.
 * Returns { match: boolean, score: number }.
 *
 * Deliberately lenient — courts and counsel abbreviate styles of cause
 * constantly ("R v Jordan" for "R. v. Jordan"), and a false mismatch is
 * more damaging than a missed one because it trains the user to ignore
 * the warnings.
 */
function titlesMatch(claimed, actual) {
  if (!claimed || !actual) return { match: null, score: 0 };
  const a = normalizeTitle(claimed);
  const b = normalizeTitle(actual);
  if (!a || !b) return { match: null, score: 0 };
  if (a === b || b.includes(a) || a.includes(b)) return { match: true, score: 1 };

  const stop = new Set(['r', 'v', 'the', 'of', 'and', 'inc', 'ltd', 'corp', 'co']);
  const tokens = (s) => new Set(s.split(' ').filter(t => t.length > 2 && !stop.has(t)));
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return { match: null, score: 0 };

  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const score = shared / Math.min(ta.size, tb.size);
  return { match: score >= 0.5, score: Number(score.toFixed(2)) };
}

// ── API call ───────────────────────────────────────────────────────

/**
 * Fetch metadata for one case. Returns the parsed object, or null on 404.
 * Throws on network errors, auth failures, and budget exhaustion.
 */
async function fetchCaseMetadata(databaseId, caseId) {
  const key = process.env.CANLII_API_KEY;
  if (!key) {
    const e = new Error('CANLII_API_KEY not configured');
    e.code = 'NO_KEY';
    throw e;
  }

  const url = `${API_BASE}/caseBrowse/en/${encodeURIComponent(databaseId)}/`
            + `${encodeURIComponent(caseId)}/?api_key=${encodeURIComponent(key)}`;

  return enqueue(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (resp.status === 404) return null;        // no such case
      if (resp.status === 401 || resp.status === 403) {
        const e = new Error('CanLII API key rejected');
        e.code = 'AUTH';
        throw e;
      }
      if (resp.status === 429) {
        const e = new Error('CanLII rate limit hit');
        e.code = 'RATE_LIMIT';
        throw e;
      }
      if (!resp.ok) {
        const e = new Error(`CanLII API returned ${resp.status}`);
        e.code = 'HTTP_' + resp.status;
        throw e;
      }
      const data = await resp.json();
      // The API answers some bad ids with 200 + an error body.
      if (data && data.error) return null;
      return data;
    } finally {
      clearTimeout(timer);
    }
  });
}

// ── Verification ───────────────────────────────────────────────────

/**
 * Verify one parsed citation.
 *
 * status:
 *   'verified'     — exists, and the case name matches (or none claimed)
 *   'mismatch'     — exists, but the claimed name is a different case
 *   'not_found'    — well-formed neutral citation with no such decision
 *   'unverifiable' — pre-neutral citation; cannot be checked by construction
 *   'error'        — lookup failed (network, key, budget); NOT a verdict
 *
 * `cache` is optional and must expose get(dbId, caseId) / put(row).
 */
async function verifyCitation(cit, cache = null) {
  const base = {
    raw: cit.raw,
    caseName: cit.caseName || null,
    databaseId: cit.databaseId,
    caseId: cit.caseId,
  };

  if (cit.kind === 'reporter' || !cit.caseId || !cit.databaseId) {
    return {
      ...base,
      status: 'unverifiable',
      reason: 'Pre-2000 citations have no neutral citation and cannot be looked up automatically.',
      searchUrl: `https://www.canlii.org/en/#search/text=${encodeURIComponent(cit.raw)}`,
    };
  }

  // Cache first — most criminal citations repeat heavily.
  if (cache) {
    try {
      const hit = cache.get(cit.databaseId, cit.caseId);
      if (hit) {
        if (hit.found === 0) {
          return { ...base, status: 'not_found', cached: true,
                   searchUrl: `https://www.canlii.org/en/#search/text=${encodeURIComponent(cit.raw)}` };
        }
        const cmp = titlesMatch(cit.caseName, hit.title);
        return {
          ...base, cached: true,
          status: cmp.match === false ? 'mismatch' : 'verified',
          actualTitle: hit.title,
          actualCitation: hit.citation,
          decisionDate: hit.decision_date,
          url: hit.url,
          nameScore: cmp.score,
        };
      }
    } catch(e) { /* cache miss or failure — fall through to the API */ }
  }

  let data;
  try {
    data = await fetchCaseMetadata(cit.databaseId, cit.caseId);
  } catch(e) {
    return { ...base, status: 'error', reason: e.code || e.message };
  }

  if (!data) {
    if (cache) { try { cache.put({ databaseId: cit.databaseId, caseId: cit.caseId, found: 0 }); } catch(e) {} }
    return {
      ...base, status: 'not_found',
      searchUrl: `https://www.canlii.org/en/#search/text=${encodeURIComponent(cit.raw)}`,
    };
  }

  const url = data.url || `https://www.canlii.org/en/#search/text=${encodeURIComponent(cit.raw)}`;
  if (cache) {
    try {
      cache.put({
        databaseId: cit.databaseId, caseId: cit.caseId, found: 1,
        title: data.title, citation: data.citation,
        decisionDate: data.decisionDate, url,
      });
    } catch(e) {}
  }

  const cmp = titlesMatch(cit.caseName, data.title);
  return {
    ...base,
    status: cmp.match === false ? 'mismatch' : 'verified',
    actualTitle: data.title,
    actualCitation: data.citation,
    decisionDate: data.decisionDate,
    url,
    nameScore: cmp.score,
  };
}

/**
 * Extract and verify every citation in a block of text.
 * Returns { citations: [...], summary: {...} }.
 *
 * Never throws — a verification failure must not take down the response
 * it was checking. Individual failures surface as status 'error'.
 */
async function verifyText(text, cache = null, opts = {}) {
  const max = opts.max || 40;
  const cits = extractCitations(text).slice(0, max);
  const results = [];
  for (const c of cits) {
    try { results.push(await verifyCitation(c, cache)); }
    catch(e) { results.push({ raw: c.raw, status: 'error', reason: e.message }); }
  }
  const summary = { total: results.length, verified: 0, mismatch: 0, notFound: 0, unverifiable: 0, error: 0 };
  for (const r of results) {
    if (r.status === 'verified')          summary.verified++;
    else if (r.status === 'mismatch')     summary.mismatch++;
    else if (r.status === 'not_found')    summary.notFound++;
    else if (r.status === 'unverifiable') summary.unverifiable++;
    else                                  summary.error++;
  }
  return { citations: results, summary };
}

module.exports = {
  extractCitations,
  verifyCitation,
  verifyText,
  fetchCaseMetadata,
  titlesMatch,
  normalizeTitle,
  databaseIdFor,
  caseNameBefore,
  budgetRemaining,
  COURT_DB,
};
