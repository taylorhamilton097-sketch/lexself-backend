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
  return { entries: [], _counters: {} };
}

// Allocate (or reuse) a token for `real`. Same string always gets
// the same token within one map.
function assign(map, real, prefix, kind) {
  const value = String(real || '').trim();
  if (!value) return '';
  const existing = map.entries.find(e => e.real.toLowerCase() === value.toLowerCase());
  if (existing) return existing.token;
  const n = (map._counters[prefix] = (map._counters[prefix] || 0) + 1);
  const token = `[${prefix}_${n}]`;
  map.entries.push({ real: value, token, kind });
  return token;
}

// Singleton token — no numeric suffix. For one-per-case roles.
function assignSingleton(map, real, prefix, kind) {
  const value = String(real || '').trim();
  if (!value) return '';
  const existing = map.entries.find(e => e.real.toLowerCase() === value.toLowerCase());
  if (existing) return existing.token;
  const token = `[${prefix}]`;
  map.entries.push({ real: value, token, kind });
  return token;
}

function prefixForRole(role) {
  const key = String(role || '').trim().toLowerCase();
  return ROLE_PREFIX[key] || 'PARTY';
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

function assignRedaction(map, value, prefix, kind) {
  const v = String(value || '').trim();
  if (v.length < MIN_REDACT_LEN) return '';
  return assign(map, v, prefix, kind);
}

/**
 * Build the real-value → token map for one user's case.
 * @param {object} data { product, profile, caseInfo, parties, children, charges }
 * @returns {object} map
 */
function buildPseudonymMap(data) {
  const { product, profile, caseInfo, parties, children, charges } = data || {};
  const map = createMap();

  // The user themselves.
  const selfName = fullName(profile);
  if (selfName) {
    const selfPrefix = product === 'criminal'
      ? 'ACCUSED'
      : prefixForRole(caseInfo && caseInfo.role) === 'PARTY'
        ? 'APPLICANT'
        : prefixForRole(caseInfo && caseInfo.role);
    assignSingleton(map, selfName, selfPrefix, 'self');
  }

  for (const p of parties || []) {
    const n = fullName(p);
    if (n) assign(map, n, prefixForRole(p.role), 'party');
    if (p.firm) assign(map, p.firm, 'FIRM', 'firm');
  }

  for (const ch of children || []) {
    const n = fullName(ch);
    if (n) assign(map, n, 'CHILD', 'child');
  }

  // Officers appear in two places and must share one counter so the
  // same officer named on the case and on a charge gets one token.
  if (caseInfo && caseInfo.officer)    assign(map, caseInfo.officer, 'OFFICER', 'officer');
  for (const c of charges || []) {
    if (c.arresting_officer) assign(map, c.arresting_officer, 'OFFICER', 'officer');
  }

  if (caseInfo && caseInfo.detachment) assign(map, caseInfo.detachment, 'DETACHMENT', 'detachment');
  // Numbered, not singleton: a case can change judges, and a bare
  // [JUSTICE] would have to be re-pointed at the new one — silently
  // rewriting who old saved conversations were talking about.
  if (caseInfo && caseInfo.judge)      assign(map, caseInfo.judge, 'JUSTICE', 'judge');

  // Represented-party counsel lives on family_case_info, not case_parties.
  const lawyer = fullName({ first: caseInfo && caseInfo.ml_lawyer_first, last: caseInfo && caseInfo.ml_lawyer_last });
  if (lawyer) assign(map, lawyer, 'COUNSEL', 'counsel');
  if (caseInfo && caseInfo.ml_lawyer_firm) assign(map, caseInfo.ml_lawyer_firm, 'FIRM', 'firm');

  // Free-text leak targets — dropped from structured output, still
  // scrubbed from bail conditions, prior record, and notes.
  if (profile) {
    assignRedaction(map, profile.address, 'ADDRESS', 'address');
    assignRedaction(map, profile.phone,   'PHONE',   'phone');
    assignRedaction(map, profile.email,   'EMAIL',   'email');
  }
  if (caseInfo) {
    assignRedaction(map, caseInfo.court_file_number, 'FILE_NO', 'file_no');
  }
  for (const p of parties || []) {
    assignRedaction(map, p.address, 'ADDRESS', 'address');
    assignRedaction(map, p.phone,   'PHONE',   'phone');
    assignRedaction(map, p.email,   'EMAIL',   'email');
  }
  for (const c of charges || []) {
    assignRedaction(map, c.location, 'LOCATION', 'location');
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
  publicMap,
  // exported for stage 2 + tests
  ageFromDob,
  fullName,
  prefixForRole,
  PLACEHOLDER_NOTICE,
};
