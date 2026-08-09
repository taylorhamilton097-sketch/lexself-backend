'use strict';

// ──────────────────────────────────────────────────────────────
// caseContext.js — single owner of what case data reaches the API.
//
// Identity (names, DOB, address, phone, email, court file number)
// has NO code path to a prompt. There is deliberately no
// buildIdentityBlock() to disable — suppression is structural,
// not a flag a client request can toggle.
//
// Stage 1: pure functions. Callers pass already-loaded DB rows.
// No require('../db') here, by design — token persistence arrives
// in stage 2 and slots in behind loadMap().
// ──────────────────────────────────────────────────────────────

// Party role → token prefix. Unknown roles fall back to PARTY.
const ROLE_PREFIX = {
  applicant:   'APPLICANT',
  respondent:  'RESPONDENT',
  complainant: 'COMPLAINANT',
  witness:     'WITNESS',
  officer:     'OFFICER',
  police:      'OFFICER',
  crown:       'CROWN',
  counsel:     'COUNSEL',
  lawyer:      'COUNSEL',
  solicitor:   'COUNSEL',
  spouse:      'SPOUSE',
  partner:     'SPOUSE',
};

// Prepended to every case block so the model uses the placeholders
// rather than inventing names to fill the gaps.
const PLACEHOLDER_NOTICE = `Names in this case file have been replaced with role placeholders in square brackets (for example [ACCUSED], [OFFICER_1], [CHILD_1]). Use the same placeholders in your response. Do not invent real names, and do not ask the user for names — they are withheld deliberately and are not needed to answer.`;

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 'First Last' — empty string unless BOTH parts are present.
// Single-name entries are skipped: a bare first name is too
// collision-prone to substitute into free text safely.
function fullName(row) {
  if (!row) return '';
  const first = String(row.first || '').trim();
  const last  = String(row.last  || '').trim();
  if (!first || !last) return '';
  return `${first} ${last}`;
}

// Years between dob and today. Null if unparseable or implausible.
function ageFromDob(dob) {
  if (!dob) return null;
  const born = new Date(String(dob));
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

// ── Pseudonym map ─────────────────────────────────────────────
// Shape: { entries: [ { real, token, kind } ] }
// One array so it serialises straight to JSON for the client and,
// in stage 2, to the case_pseudonyms table.

function createMap() {
  // `self` is the token for the user themselves, set during the walk.
  // Callers that need it must not look it up by kind: seeded entries
  // carry whatever kind the database row had, and the walk returns
  // early on an already-seeded value without re-tagging it.
  return { entries: [], self: '', _counters: {} };
}

// Every prefix this module can mint, for residual-token detection.
const TOKEN_PREFIXES = [
  ...new Set(Object.values(ROLE_PREFIX)),
  'PARTY', 'ACCUSED', 'CHILD', 'FIRM', 'JUSTICE', 'DETACHMENT',
  'ADDRESS', 'PHONE', 'EMAIL', 'FILE_NO', 'LOCATION',
];
const TOKEN_RE = new RegExp(`\\[(?:${TOKEN_PREFIXES.join('|')})(?:_\\d+)?\\]`, 'g');

/**
 * Tokens from this module's namespace still present in text after a
 * restore() — i.e. a leak. Deliberately narrow: prompts elsewhere in
 * this codebase instruct the model to emit literal placeholders like
 * [name], [City] and [Applicant/Respondent], and those must not be
 * mistaken for ours. Matching is case-sensitive and ours are all caps.
 */
function residualTokens(text) {
  if (!text) return [];
  return [...new Set(String(text).match(TOKEN_RE) || [])];
}

// Default allocator: counters held in the map itself. Correct for a
// single request, but numbering restarts next time — fine for tests
// and any caller without a database. Routes pass a persistent
// allocator instead so tokens survive across requests.
function memoryAllocator(map) {
  return function (value, prefix, numbered) {
    if (numbered === false) return `[${prefix}]`;
    const n = (map._counters[prefix] = (map._counters[prefix] || 0) + 1);
    return `[${prefix}_${n}]`;
  };
}

function prefixForRole(role) {
  const key = String(role || '').trim().toLowerCase();
  return ROLE_PREFIX[key] || 'PARTY';
}

/**
 * Collapse a stored role to the side of the file it identifies, or ''
 * when it identifies none.
 *
 * Applicant and Respondent are fixed for the life of a file and set by
 * who filed the originating application. Moving Party and Responding
 * Party are per-motion and say nothing about that — a respondent who
 * brings a motion is the moving party and is still the respondent, and
 * an applicant answering it is the responding party and is still the
 * applicant. Those resolve to '' and the caller decides what to do.
 *
 * Matching is exact for the same reason: a prefix test on 'respond'
 * would wrongly capture 'Responding Party'. It is case-insensitive
 * because the profile stores 'Respondent' and the analyze screen sends
 * 'respondent'.
 */
function normalizeRole(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'applicant')  return 'applicant';
  if (s === 'respondent') return 'respondent';
  return '';
}

// Identifiers we never emit as structured fields but which routinely
// turn up inside free text — "Reside at 412 Bathurst St" is a standard
// bail term. Dropping the column is not enough; the value has to be
// scrubbable out of prose too.
//
// Values shorter than this collide with ordinary words, so they are
// left alone: a city of "London" would wreck "London Police Service".
// city and province are deliberately never redaction targets.
const MIN_REDACT_LEN = 6;

/**
 * Build the real-value → token map for one user's case.
 *
 * @param {object} data     { product, profile, caseInfo, parties, children, charges }
 * @param {function} [allocate] (value, prefix, numbered) => token.
 *        Omit for in-memory numbering; routes pass a DB-backed allocator
 *        so tokens are stable across requests.
 * @param {Array}  [seed]   Previously allocated { real, token, kind } rows.
 *        Seeded first so restore() still resolves tokens whose underlying
 *        party has since been deleted from the case.
 * @returns {object} map
 */
function buildPseudonymMap(data, allocate, seed) {
  const { product, profile, caseInfo, parties, children, charges } = data || {};
  const map = createMap();
  const alloc = allocate || memoryAllocator(map);

  for (const row of seed || []) {
    if (row && row.real && row.token) {
      map.entries.push({ real: String(row.real), token: row.token, kind: row.kind || '' });
    }
  }

  // Record and allocate. Deduped here so the allocator is called once
  // per distinct value regardless of how many places it appears in.
  function take(value, prefix, kind, numbered) {
    const v = String(value || '').trim();
    if (!v) return '';
    const hit = map.entries.find(e => e.real.toLowerCase() === v.toLowerCase());
    if (hit) return hit.token;
    const token = alloc(v, prefix, numbered !== false);
    if (!token) return '';
    map.entries.push({ real: v, token, kind });
    return token;
  }

  // Never emitted as a structured field, but still has to be strippable
  // from prose. Short values are skipped — see MIN_REDACT_LEN.
  function takeRedaction(value, prefix, kind) {
    const v = String(value || '').trim();
    if (v.length < MIN_REDACT_LEN) return '';
    return take(v, prefix, kind, true);
  }

  // The user themselves — the one role guaranteed not to change hands,
  // so it gets a bare token.
  const selfName = fullName(profile);
  if (selfName) {
    const selfPrefix = product === 'criminal'
      ? 'ACCUSED'
      : prefixForRole(caseInfo && caseInfo.role) === 'PARTY'
        ? 'APPLICANT'
        : prefixForRole(caseInfo && caseInfo.role);
    map.self = take(selfName, selfPrefix, 'self', false);
  }

  for (const p of parties || []) {
    const n = fullName(p);
    if (n) take(n, prefixForRole(p.role), 'party');
    if (p.firm) take(p.firm, 'FIRM', 'firm');
  }

  for (const ch of children || []) {
    const n = fullName(ch);
    if (n) take(n, 'CHILD', 'child');
  }

  // Officers appear in two places and must share one counter so the
  // same officer named on the case and on a charge gets one token.
  if (caseInfo && caseInfo.officer)    take(caseInfo.officer, 'OFFICER', 'officer');
  for (const c of charges || []) {
    if (c.arresting_officer) take(c.arresting_officer, 'OFFICER', 'officer');
  }

  if (caseInfo && caseInfo.detachment) take(caseInfo.detachment, 'DETACHMENT', 'detachment');
  // Numbered, not singleton: a case can change judges, and a bare
  // [JUSTICE] would have to be re-pointed at the new one — silently
  // rewriting who old saved conversations were talking about.
  if (caseInfo && caseInfo.judge)      take(caseInfo.judge, 'JUSTICE', 'judge');

  // Represented-party counsel lives on family_case_info, not case_parties.
  const lawyer = fullName({ first: caseInfo && caseInfo.ml_lawyer_first, last: caseInfo && caseInfo.ml_lawyer_last });
  if (lawyer) take(lawyer, 'COUNSEL', 'counsel');
  if (caseInfo && caseInfo.ml_lawyer_firm) take(caseInfo.ml_lawyer_firm, 'FIRM', 'firm');

  // Free-text leak targets — dropped from structured output, still
  // scrubbed from bail conditions, prior record, and notes.
  if (profile) {
    takeRedaction(profile.address, 'ADDRESS', 'address');
    takeRedaction(profile.phone,   'PHONE',   'phone');
    takeRedaction(profile.email,   'EMAIL',   'email');
  }
  if (caseInfo) {
    takeRedaction(caseInfo.court_file_number, 'FILE_NO', 'file_no');
  }
  for (const p of parties || []) {
    takeRedaction(p.address, 'ADDRESS', 'address');
    takeRedaction(p.phone,   'PHONE',   'phone');
    takeRedaction(p.email,   'EMAIL',   'email');
  }
  for (const c of charges || []) {
    takeRedaction(c.location, 'LOCATION', 'location');
  }

  return map;
}

/**
 * Replace known real values with tokens in free text.
 * Full names only (adjacent first + last). Bare first names are NOT
 * substituted — "I got the bill" must not become "I got the [WITNESS_1]".
 */
function scrub(text, map) {
  if (!text || !map || !map.entries.length) return text || '';
  let out = String(text);
  // Longest first, so "Jane Smith Holdings" wins over "Jane Smith".
  const sorted = [...map.entries].sort((a, b) => b.real.length - a.real.length);
  for (const e of sorted) {
    // \s+ between parts tolerates double spaces and line breaks.
    const pattern = escapeRegExp(e.real).replace(/\\?\s+/g, '\\s+');
    out = out.replace(new RegExp(`\\b${pattern}\\b`, 'gi'), e.token);
  }
  return out;
}

/** Inverse of scrub(). Exact token match only. */
function restore(text, map) {
  if (!text || !map || !map.entries.length) return text || '';
  let out = String(text);
  for (const e of map.entries) {
    out = out.replace(new RegExp(escapeRegExp(e.token), 'g'), e.real);
  }
  return out;
}

/**
 * restore() applied to every string inside a parsed structure.
 *
 * For routes where the model returns JSON. Restoring the raw text before
 * JSON.parse would risk corrupting the document — a real name containing
 * a quote or backslash would break the escaping. Parse first, restore
 * after. Object keys are schema field names, not data, so they are left
 * alone.
 */
function restoreDeep(value, map) {
  if (typeof value === 'string') return restore(value, map);
  if (Array.isArray(value)) return value.map(v => restoreDeep(v, map));
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = restoreDeep(value[k], map);
    return out;
  }
  return value;
}

/**
 * A map built purely from already-allocated rows, with no entity walk
 * and no allocation. For routes that need to scrub and restore but have
 * no case data of their own — they can only recognise names some other
 * route has already tokenised.
 */
function mapFromEntries(rows) {
  const map = createMap();
  for (const r of rows || []) {
    if (r && r.real && r.token) {
      map.entries.push({ real: String(r.real), token: r.token, kind: r.kind || '' });
    }
  }
  return map;
}

/**
 * Combine maps from different products for a single user.
 *
 * Tokens are unique per product, not per user: the same [WITNESS_1] can
 * mean one person in a criminal matter and someone else in a family one.
 * Restoring a merged map would then swap one name for another and quietly
 * corrupt the text. Any token that resolves to two different values is
 * therefore dropped from both — those names go unscrubbed, which is what
 * happens today anyway and is far better than rewriting them wrongly.
 */
function mergeMaps(...maps) {
  const byToken = new Map();
  const conflicted = new Set();
  for (const m of maps) {
    for (const e of (m && m.entries) || []) {
      const prev = byToken.get(e.token);
      if (!prev) byToken.set(e.token, e);
      else if (prev.real.toLowerCase() !== e.real.toLowerCase()) conflicted.add(e.token);
    }
  }
  const merged = createMap();
  for (const [token, entry] of byToken) {
    if (!conflicted.has(token)) merged.entries.push(entry);
  }
  return merged;
}

/** The client needs real↔token but never the internal counters. */
function publicMap(map) {
  return (map && map.entries ? map.entries : []).map(e => ({ real: e.real, token: e.token, kind: e.kind }));
}

// ── Case blocks ───────────────────────────────────────────────
// Case FACTS only. No name, DOB, address, phone, email, or court
// file number is emitted by either builder.

function line(label, value) {
  const v = String(value == null ? '' : value).trim();
  return v ? `${label}: ${v}` : '';
}

function buildCriminalBlock(data, map) {
  const { profile, caseInfo, parties, charges } = data || {};
  const ci = caseInfo || {};

  // Jurisdiction is excluded here on purpose: it always has a value, so
  // counting it as content would make every empty case emit a block.
  const facts = [
    line('Court', ci.court),
    line('Next Appearance', ci.next_date ? `${ci.next_date}${ci.next_event ? ` (${ci.next_event})` : ''}` : ''),
    line('Bail Conditions', scrub(ci.bail_conditions, map)),
    line('Prior Record', scrub(ci.prior_record, map)),
    line('Indigenous', ci.indigenous),
    line('Arresting Officer', ci.officer ? scrub(ci.officer, map) : ''),
    line('Detachment', ci.detachment ? scrub(ci.detachment, map) : ''),
  ].filter(Boolean);

  const chargeItems = (charges || []).map((c, i) => {
    const bits = [c.charge_label || '(unspecified)'];
    if (c.section)     bits.push(`— ${c.section}`);
    if (c.charge_date) bits.push(`(offence date: ${c.charge_date})`);
    const notes = scrub(c.notes, map);
    return `${i + 1}. ${bits.join(' ')}${notes ? `\n   Notes: ${notes}` : ''}`;
  });

  const others = (parties || [])
    .map(p => {
      const t = fullName(p) ? scrub(fullName(p), map) : '';
      return t ? `${t} (${p.role || 'role unknown'})` : '';
    })
    .filter(Boolean);

  if (!facts.length && !chargeItems.length && !others.length) return '';

  const jurisdiction = line('Jurisdiction', `${(profile && profile.province) || 'Ontario'}, Canada`);
  let out = `## CASE FACTS\n${[jurisdiction, ...facts].join('\n')}`;
  if (chargeItems.length) out += `\n\n## CHARGES\n${chargeItems.join('\n')}`;
  if (others.length)      out += `\n\n## OTHER PARTIES\n${others.join('\n')}`;
  return out;
}

function buildFamilyBlock(data, map) {
  const { profile, caseInfo, parties, children } = data || {};
  const f = caseInfo || {};
  const counsel = fullName({ first: f.ml_lawyer_first, last: f.ml_lawyer_last });

  // Jurisdiction excluded here for the same reason as the criminal block.
  // Representation is also excluded from the content test — it defaults to
  // 'self-represented' and would otherwise make every empty case non-empty.
  const facts = [
    line('Your Role', f.role),
    line('Your Counsel', counsel ? scrub(counsel, map) : ''),
    line('Court', f.court ? `${f.court}${f.court_type ? ` (${f.court_type})` : ''}` : ''),
    line('Next Appearance', f.next_date ? `${f.next_date}${f.next_event ? ` (${f.next_event})` : ''}` : ''),
    line('Presiding', f.judge ? scrub(f.judge, map) : ''),
  ].filter(Boolean);

  const kids = (children || [])
    .map(ch => {
      const t = fullName(ch) ? scrub(fullName(ch), map) : '';
      if (!t) return '';
      const age = ageFromDob(ch.dob);
      const bits = [t];
      if (age != null)    bits.push(`age ${age}`);
      if (ch.residency)   bits.push(String(ch.residency));
      const notes = scrub(ch.notes, map);
      return `${bits.join(', ')}${notes ? ` — ${notes}` : ''}`;
    })
    .filter(Boolean);

  const others = (parties || [])
    .map(p => {
      const t = fullName(p) ? scrub(fullName(p), map) : '';
      return t ? `${t} (${p.role || 'role unknown'})` : '';
    })
    .filter(Boolean);

  if (!facts.length && !kids.length && !others.length) return '';

  const header = [
    line('Jurisdiction', `${(profile && profile.province) || 'Ontario'}, Canada`),
    line('Representation', f.ml_status || 'self-represented'),
  ];
  let out = `## CASE FACTS\n${[...header, ...facts].join('\n')}`;
  if (kids.length)   out += `\n\n## CHILDREN\n${kids.join('\n')}`;
  if (others.length) out += `\n\n## OTHER PARTIES\n${others.join('\n')}`;
  return out;
}

/**
 * The case block for one product. Identity-free by construction.
 * @returns {string} '' when there is nothing to say
 */
function buildCaseBlock(product, data, map) {
  const body = product === 'criminal'
    ? buildCriminalBlock(data, map)
    : buildFamilyBlock(data, map);
  return body ? `${PLACEHOLDER_NOTICE}\n\n${body}` : '';
}

/**
 * Single assembly point for an outbound system prompt.
 *
 * clientOverride is an INPUT, not a replacement: a builder can supply
 * its own instructions but cannot suppress or bypass the case block,
 * and has no way to request identity because nothing emits it.
 */
function buildSystemPrompt(opts) {
  const { basePrompt, clientOverride, product, data, map, extra } = opts || {};
  const parts = [clientOverride || basePrompt || ''];
  const caseBlock = buildCaseBlock(product, data, map);
  if (caseBlock) parts.push(caseBlock);
  if (extra) parts.push(String(extra));
  return parts.filter(Boolean).join('\n\n');
}

module.exports = {
  buildPseudonymMap,
  buildCaseBlock,
  buildSystemPrompt,
  scrub,
  restore,
  restoreDeep,
  residualTokens,
  mapFromEntries,
  mergeMaps,
  publicMap,
  // exported for stage 2 + tests
  ageFromDob,
  fullName,
  prefixForRole,
  normalizeRole,
  PLACEHOLDER_NOTICE,
};
