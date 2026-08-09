'use strict';

/**
 * Ontario Family Court Form 14A — Affidavit (General)
 * FLR 14A (September 1, 2005)
 *
 * Data shape:
 *   data.profile       - user's core profile (first, last, address, city, province, postal, phone, email)
 *   data.familyInfo    - family_case_info row (role, court_file_number, court, court_type, judge)
 *   data.parties       - case_parties[] for family (respondent, lawyers, etc.)
 *   data.affidavitBody - user-provided numbered paragraphs (plain text, one per line OR split on 2+ newlines)
 *   data.sworn_at      - municipality where sworn (optional user-filled)
 *   data.sworn_in      - province/state/country where sworn
 *   data.sworn_date    - date sworn (YYYY-MM-DD)
 */

const {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, HeightRule, VerticalAlign,
  HeadingLevel,
} = require('docx');
const { normalizeRole, roleKey } = require('../../lib/caseContext');

// ── Helpers ──
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BORDERS_ALL = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

function txt(text, opts = {}) {
  return new TextRun({ text: String(text || ''), ...opts });
}
function p(text, opts = {}) {
  const children = Array.isArray(text)
    ? text.map(t => typeof t === 'string' ? txt(t) : t)
    : [typeof text === 'string' ? txt(text) : text];
  return new Paragraph({ children, ...opts });
}
function boldP(text, opts = {}) {
  return p([txt(text, { bold: true })], opts);
}
function emptyP() {
  return new Paragraph({ children: [txt('')] });
}
function cell(content, opts = {}) {
  const children = Array.isArray(content) ? content : [
    typeof content === 'string' ? p(content) : content,
  ];
  return new TableCell({
    children,
    borders: BORDERS_ALL,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    ...opts,
  });
}

// ── Format a party block for applicant/respondent cells ──
function formatPartyAddress(party) {
  if (!party) return '';
  const lines = [];
  const name = [party.first, party.last].filter(Boolean).join(' ').trim();
  if (name) lines.push(name);
  if (party.address) lines.push(party.address);
  const cityLine = [party.city, party.province, party.postal].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);
  if (party.phone) lines.push('Tel: ' + party.phone);
  if (party.email) lines.push(party.email);
  return lines.join('\n');
}

function formatLawyerBlock(party) {
  if (!party) return '';
  const lines = [];
  const name = [party.first, party.last].filter(Boolean).join(' ').trim();
  if (name) lines.push(name);
  if (party.firm) lines.push(party.firm);
  if (party.address) lines.push(party.address);
  const cityLine = [party.city, party.province, party.postal].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);
  if (party.phone) lines.push('Tel: ' + party.phone);
  if (party.email) lines.push(party.email);
  if (party.lso_number) lines.push('LSO #: ' + party.lso_number);
  return lines.join('\n');
}

function multilineCell(text, opts = {}) {
  if (!text) return cell('', opts);
  const lines = String(text).split('\n');
  const paras = lines.map(line => p(line || ' '));
  return new TableCell({
    children: paras,
    borders: BORDERS_ALL,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    ...opts,
  });
}

// ── Split body text into numbered paragraphs ──
function splitAffidavitBody(text) {
  if (!text || typeof text !== 'string') return [];
  // Strategy: split on blank lines (paragraph breaks). Fall back to single newlines if no blank lines exist.
  let parts = text.split(/\n\s*\n+/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 1 && text.includes('\n')) {
    parts = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  }
  // Strip any leading "1." / "1)" / "1:" that the user may have added themselves
  return parts.map(para => para.replace(/^\s*\d+[\.\)\:]\s*/, '').trim());
}

function build(data) {
  const { profile = {}, familyInfo = {}, parties = [], affidavitBody = '',
          sworn_at = '', sworn_in = '', sworn_date = '' } = data;

  // Which side of the file the user is on, and who is opposite them.
  // Party roles are written by several screens in several conventions,
  // so comparisons go through the shared normalisers rather than exact
  // string equality — the previous `x.role === 'respondent'` never
  // matched values stored as 'Respondent'.
  const selfRole = normalizeRole(familyInfo.role);
  const opposingRole = selfRole === 'applicant' ? 'respondent'
                     : selfRole === 'respondent' ? 'applicant'
                     : '';
  const opposing = opposingRole
    ? parties.find(x => normalizeRole(x.role) === opposingRole)
    : null;
  const byRole = key => parties.find(x => roleKey(x.role) === key);
  const myCounsel = byRole('my_counsel');
  const opposingCounsel = byRole('opposing_counsel');

  // Today's date for the form's "dated" header
  const dateStr = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── HEADER TABLE: Ontario | (name of court) | Form 14A / File # ──
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell([boldP('ONTARIO')], { columnSpan: 3 }),
      ]}),
      new TableRow({ children: [
        cell([p(familyInfo.court || '(Name of court)')], { width: { size: 40, type: WidthType.PERCENTAGE } }),
        cell([p('Court File Number'), p(familyInfo.court_file_number || ' ', { alignment: AlignmentType.CENTER })], { width: { size: 30, type: WidthType.PERCENTAGE } }),
        cell([p('Form 14A: Affidavit (general)'), p('dated ' + dateStr)], { width: { size: 30, type: WidthType.PERCENTAGE } }),
      ]}),
      new TableRow({ children: [
        cell([p('at ' + (familyInfo.court || ''))], { columnSpan: 3 }),
      ]}),
      new TableRow({ children: [
        cell([p('Court office address')], { columnSpan: 3 }),
      ]}),
    ],
  });

  // ── PARTIES TABLE ──
  // Rendered from the user's perspective: their block goes in whichever
  // box matches their own designation, and the opposing party's in the
  // other.
  //
  // When the side is unknown both boxes are left empty for completion by
  // hand. This form gets filed: a blank field is a gap the user fills in,
  // whereas guessing puts a party on the wrong side of a court document.
  const userBlock = formatPartyAddress(profile);
  const opposingBlock = formatPartyAddress(opposing);
  const myLawyerBlock = formatLawyerBlock(myCounsel);
  const otherLawyerBlock = formatLawyerBlock(opposingCounsel);

  const applicantSideBlock  = selfRole === 'applicant' ? userBlock
                            : selfRole === 'respondent' ? opposingBlock : '';
  const respondentSideBlock = selfRole === 'respondent' ? userBlock
                            : selfRole === 'applicant' ? opposingBlock : '';
  const applicantSideLawyer  = selfRole === 'applicant' ? myLawyerBlock
                             : selfRole === 'respondent' ? otherLawyerBlock : '';
  const respondentSideLawyer = selfRole === 'respondent' ? myLawyerBlock
                             : selfRole === 'applicant' ? otherLawyerBlock : '';

  const partiesTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell([boldP('Applicant(s)')], { columnSpan: 2 }),
      ]}),
      new TableRow({ children: [
        cell([p('Full legal name & address for service — street & number, municipality, postal code, telephone & fax numbers and e-mail address (if any).', { })]),
        cell([p('Lawyer\'s name & address — street & number, municipality, postal code, telephone & fax numbers and e-mail address (if any).')]),
      ]}),
      new TableRow({ children: [
        multilineCell(applicantSideBlock, { width: { size: 50, type: WidthType.PERCENTAGE } }),
        multilineCell(applicantSideLawyer, { width: { size: 50, type: WidthType.PERCENTAGE } }),
      ]}),
      new TableRow({ children: [
        cell([boldP('Respondent(s)')], { columnSpan: 2 }),
      ]}),
      new TableRow({ children: [
        cell([p('Full legal name & address for service — street & number, municipality, postal code, telephone & fax numbers and e-mail address (if any).')]),
        cell([p('Lawyer\'s name & address — street & number, municipality, postal code, telephone & fax numbers and e-mail address (if any).')]),
      ]}),
      new TableRow({ children: [
        multilineCell(respondentSideBlock),
        multilineCell(respondentSideLawyer),
      ]}),
    ],
  });

  // ── "My name is" / "I live in" ──
  const fullName = [profile.first, profile.last].filter(Boolean).join(' ').trim() || '_____________________';
  const livesIn = [profile.city, profile.province].filter(Boolean).join(', ') || '_____________________';

  // ── Numbered paragraphs ──
  const bodyParas = splitAffidavitBody(affidavitBody);
  const numberedChildren = bodyParas.length
    ? bodyParas.map((text, i) => p([
        txt(`${i + 1}.  `, { bold: true }),
        txt(text),
      ], { spacing: { after: 120 } }))
    : [p('_________________________________________________________________________________________', { spacing: { after: 120 } })];

  // ── Sworn/Affirmed block ──
  const swornTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell([p('Sworn/Affirmed before me at ' + (sworn_at || '____________________'))]),
        cell([p('')], { rowSpan: 4, width: { size: 40, type: WidthType.PERCENTAGE } }),
      ]}),
      new TableRow({ children: [
        cell([p('municipality')]),
      ]}),
      new TableRow({ children: [
        cell([p('in ' + (sworn_in || '____________________'))]),
      ]}),
      new TableRow({ children: [
        cell([p('province, state, or country')]),
      ]}),
      new TableRow({ children: [
        cell([p('on ' + (sworn_date || '____________________'))]),
        cell([p('Signature')]),
      ]}),
      new TableRow({ children: [
        cell([p('date')]),
        cell([p('Commissioner for taking affidavits (Type or print name below if signature is illegible.)')]),
      ]}),
      new TableRow({ children: [
        cell([p('(This form is to be signed in front of a lawyer, justice of the peace, notary public or commissioner for taking affidavits.)')], { columnSpan: 2 }),
      ]}),
    ],
  });

  // ── Footer ──
  const footerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell([p('FLR 14A (September 1, 2005)')]),
        cell([p('Page 1 of 2', { alignment: AlignmentType.RIGHT })]),
      ]}),
    ],
  });

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 20 }, // 10pt
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: [
        headerTable,
        emptyP(),
        partiesTable,
        emptyP(),
        p([txt('My name is ', { bold: true }), txt(fullName)]),
        p([txt('I live in ', { bold: true }), txt(livesIn)]),
        boldP('and I swear/affirm that the following is true:'),
        emptyP(),
        p('Set out the statements of fact in consecutively numbered paragraphs. Where possible, each numbered paragraph should consist of one complete sentence and be limited to a particular statement of fact. If you learned a fact from someone else, you must give that person\'s name and state that you believe that fact to be true.', { spacing: { after: 240 } }),
        ...numberedChildren,
        emptyP(),
        p('Put a line through any blank space left on this page.'),
        emptyP(),
        swornTable,
        emptyP(),
        footerTable,
      ],
    }],
  });
}

module.exports = { build };
