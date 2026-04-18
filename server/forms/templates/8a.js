'use strict';

/**
 * Ontario Family Court Form 8A — Application (Divorce)
 * FLR 8A (April 1, 2024)
 *
 * Data shape:
 *   data.profile       - user's core profile
 *   data.familyInfo    - family_case_info row
 *   data.parties       - case_parties[] for family
 *   data.children      - case_children[]
 *   data.form8aFields  - object with Form 8A specific fields (marriage date, separation date, claims, grounds, etc.)
 */

const {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle,
} = require('docx');

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BORDERS_ALL = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function txt(text, opts = {}) { return new TextRun({ text: String(text || ''), ...opts }); }
function p(content, opts = {}) {
  const children = Array.isArray(content)
    ? content.map(t => typeof t === 'string' ? txt(t) : t)
    : [typeof content === 'string' ? txt(content) : content];
  return new Paragraph({ children, ...opts });
}
function boldP(text, opts = {}) { return p([txt(text, { bold: true })], opts); }
function emptyP() { return new Paragraph({ children: [txt('')] }); }
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

function checkBox(checked) {
  return checked ? '☒' : '☐';
}

function multilineCell(lines, opts = {}) {
  const arr = Array.isArray(lines) ? lines : [lines];
  const paras = arr.filter(l => l !== null && l !== undefined).map(l => p(String(l || ' ')));
  if (!paras.length) paras.push(p(' '));
  return new TableCell({
    children: paras,
    borders: BORDERS_ALL,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    ...opts,
  });
}

function partyLines(person) {
  if (!person) return [' '];
  const name = [person.first, person.last].filter(Boolean).join(' ').trim();
  const lines = [];
  if (name) lines.push('Full legal name: ' + name);
  if (person.address) {
    const addr = [person.address, person.city, person.province, person.postal].filter(Boolean).join(', ');
    lines.push('Address: ' + addr);
  }
  if (person.phone) lines.push('Phone: ' + person.phone);
  if (person.email) lines.push('Email: ' + person.email);
  return lines.length ? lines : [' '];
}

function lawyerLines(person) {
  if (!person) return [' '];
  const name = [person.first, person.last].filter(Boolean).join(' ').trim();
  const lines = [];
  if (name) lines.push('Name: ' + name);
  if (person.firm) lines.push('Firm: ' + person.firm);
  if (person.address) {
    const addr = [person.address, person.city, person.province, person.postal].filter(Boolean).join(', ');
    lines.push('Address: ' + addr);
  }
  if (person.phone) lines.push('Phone: ' + person.phone);
  if (person.email) lines.push('Email: ' + person.email);
  if (person.lso_number) lines.push('LSO#: ' + person.lso_number);
  return lines.length ? lines : [' '];
}

function calcAge(dob) {
  if (!dob) return '';
  const d = new Date(dob);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? String(age) : '';
}

function build(data) {
  const { profile = {}, familyInfo = {}, parties = [], children = [],
          form8aFields = {} } = data;

  const respondent = parties.find(x => x.role === 'respondent');
  const myCounsel = parties.find(x => x.role === 'my_counsel');
  const opposingCounsel = parties.find(x => x.role === 'opposing_counsel');

  const userIsApplicant = (familyInfo.role || '').toLowerCase().includes('applicant') || !familyInfo.role;
  const applicant = userIsApplicant ? profile : (respondent || {});
  const respondentParty = userIsApplicant ? (respondent || {}) : profile;
  const applicantLawyer = userIsApplicant ? myCounsel : opposingCounsel;
  const respondentLawyer = userIsApplicant ? opposingCounsel : myCounsel;

  // Form 8A specific fields (filled inline via form preview)
  const f = form8aFields;
  const isJoint = !!f.isJoint;
  const isSimple = !isJoint;

  // ── HEADER ──
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell([boldP('ONTARIO')], { columnSpan: 3 }),
      ]}),
      new TableRow({ children: [
        cell([p(familyInfo.court || '(Name of court)')], { width: { size: 40, type: WidthType.PERCENTAGE } }),
        cell([p('Court File Number'), p(familyInfo.court_file_number || ' ', { alignment: AlignmentType.CENTER })], { width: { size: 30, type: WidthType.PERCENTAGE } }),
        cell([
          p('Form 8A: Application (Divorce)'),
          p(`${checkBox(isSimple)} Simple (divorce only)`),
          p(`${checkBox(isJoint)} Joint`),
        ], { width: { size: 30, type: WidthType.PERCENTAGE } }),
      ]}),
      new TableRow({ children: [
        cell([p('at ' + (familyInfo.court || ''))], { columnSpan: 3 }),
      ]}),
    ],
  });

  // ── APPLICANT / RESPONDENT TABLE ──
  const partiesTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell([boldP('Applicant(s)')]),
        cell([boldP('Applicant(s) Lawyer')]),
      ]}),
      new TableRow({ children: [
        multilineCell(partyLines(applicant), { width: { size: 50, type: WidthType.PERCENTAGE } }),
        multilineCell(lawyerLines(applicantLawyer), { width: { size: 50, type: WidthType.PERCENTAGE } }),
      ]}),
      new TableRow({ children: [
        cell([boldP('Respondent(s)')]),
        cell([boldP('Respondent(s) Lawyer')]),
      ]}),
      new TableRow({ children: [
        multilineCell(partyLines(respondentParty)),
        multilineCell(lawyerLines(respondentLawyer)),
      ]}),
    ],
  });

  // ── FAMILY HISTORY ──
  const familyHistoryRows = [
    new TableRow({ children: [
      cell([boldP('FAMILY HISTORY')], { columnSpan: 2 }),
    ]}),
    new TableRow({ children: [
      cell([
        boldP('APPLICANT:'),
        p(`Age: ${calcAge(applicant.dob)}`),
        p(`Birthdate: ${applicant.dob || '_______________'}`),
        p(`Resident in: ${[applicant.city, applicant.province].filter(Boolean).join(', ') || '_______________'}`),
        p(`First name on day before marriage: ${f.applicantMarriageFirstName || '_______________'}`),
        p(`Last name on day before marriage: ${f.applicantMarriageLastName || '_______________'}`),
        p(`Gender on day before marriage: ${f.applicantMarriageGender || '_______________'}`),
        p(`Divorced before? ${f.applicantPriorDivorce || '___'}`),
        p(`Habitually resident in Ontario for at least one year before this application? ${f.applicantResidencyOneYear || '___'}`),
      ]),
      cell([
        boldP('RESPONDENT / JOINT APPLICANT:'),
        p(`Age: ${calcAge(respondentParty.dob)}`),
        p(`Birthdate: ${respondentParty.dob || '_______________'}`),
        p(`Resident in: ${[respondentParty.city, respondentParty.province].filter(Boolean).join(', ') || '_______________'}`),
        p(`First name on day before marriage: ${f.respondentMarriageFirstName || '_______________'}`),
        p(`Last name on day before marriage: ${f.respondentMarriageLastName || '_______________'}`),
        p(`Gender on day before marriage: ${f.respondentMarriageGender || '_______________'}`),
        p(`Divorced before? ${f.respondentPriorDivorce || '___'}`),
        p(`Habitually resident in Ontario for at least one year before this application? ${f.respondentResidencyOneYear || '___'}`),
      ]),
    ]}),
    new TableRow({ children: [
      cell([
        boldP('RELATIONSHIP DATES:'),
        p(`Married on: ${f.marriageDate || '_______________'}`),
        p(`Started living together on: ${f.cohabitationStart || '_______________'}`),
        p(`Separated on: ${f.separationDate || '_______________'}`),
        p(`Never lived together: ${checkBox(f.neverLivedTogether)}`),
      ], { columnSpan: 2 }),
    ]}),
  ];
  const familyHistoryTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: familyHistoryRows,
  });

  // ── CHILDREN TABLE ──
  const childRows = [
    new TableRow({ children: [
      cell([boldP('THE CHILD(REN)')], { columnSpan: 5 }),
    ]}),
    new TableRow({ children: [
      cell([p('List all children involved in this case, even if no claim is made for these children.')], { columnSpan: 5 }),
    ]}),
    new TableRow({ children: [
      cell([boldP('Full legal name')]),
      cell([boldP('Age')]),
      cell([boldP('Birthdate')]),
      cell([boldP('Resident in')]),
      cell([boldP('Now Living With')]),
    ]}),
  ];

  const childrenToShow = children.length ? children : Array(3).fill({});
  childrenToShow.forEach(child => {
    const name = [child.first, child.last].filter(Boolean).join(' ').trim();
    const resLabel = {
      'with_user': userIsApplicant ? 'Applicant' : 'Respondent',
      'with_other': userIsApplicant ? 'Respondent' : 'Applicant',
      'shared': 'Shared',
    }[child.residency] || '';
    childRows.push(new TableRow({ children: [
      cell([p(name || ' ')]),
      cell([p(calcAge(child.dob))]),
      cell([p(child.dob || ' ')]),
      cell([p([profile.city, profile.province].filter(Boolean).join(', '))]),
      cell([p(resLabel)]),
    ]}));
  });

  const childrenTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: childRows,
  });

  // ── CLAIMS (simple divorce only, for MVP) ──
  const claimsHeader = isJoint
    ? boldP('WE JOINTLY ASK THE COURT FOR THE FOLLOWING:')
    : boldP('I ASK THE COURT FOR:');

  const claimsRows = (f.claims || ['00']).map(code => {
    const codeLabels = {
      '00': 'a divorce',
      '01': 'spousal support',
      '02': 'support for child(ren) – table amount',
      '03': 'support for child(ren) – other than table amount',
      '04': 'decision-making responsibility for child(ren)',
      '05': 'parenting time with child(ren)',
      '10': 'spousal support (FLA)',
      '11': 'support for child(ren) – table amount (FLA)',
      '12': 'support for child(ren) – other than table amount (FLA)',
      '13': 'decision-making responsibility for children (FLA)',
      '14': 'parenting time with child(ren) (FLA)',
      '15': 'restraining/non-harassment order',
      '16': 'indexing spousal support',
      '17': 'declaration of parentage',
      '18': 'guardianship over child\'s property',
      '20': 'equalization of net family properties',
      '21': 'exclusive possession of matrimonial home',
      '22': 'exclusive possession of contents of matrimonial home',
      '23': 'freezing assets',
      '24': 'sale of family property',
      '30': 'costs',
      '31': 'annulment of marriage',
      '32': 'prejudgment interest',
      '50': 'Other',
    };
    return p(`${checkBox(true)} [${code}]  ${codeLabels[code] || code}`);
  });

  // ── GROUNDS FOR DIVORCE ──
  const groundsChildren = [];
  groundsChildren.push(boldP('IMPORTANT FACTS SUPPORTING THE CLAIM FOR DIVORCE'));
  if (f.grounds === 'separation' || !f.grounds) {
    groundsChildren.push(p(`${checkBox(true)} Separation: The spouses have lived separate and apart since ${f.separationDate || '_______________'} and`));
    groundsChildren.push(p(`   ${checkBox(!f.reconciliationAttempts)} have not lived together again since that date in an unsuccessful attempt to reconcile.`));
    groundsChildren.push(p(`   ${checkBox(!!f.reconciliationAttempts)} have lived together again during the following period(s) in an unsuccessful attempt to reconcile: ${f.reconciliationAttempts || '_______________'}`));
  }
  if (f.grounds === 'adultery') {
    groundsChildren.push(p(`${checkBox(true)} Adultery: ${f.adulterySpouseName || '_______________'} has committed adultery.`));
    groundsChildren.push(p('   (It is not necessary to name any other person involved.)'));
  }
  if (f.grounds === 'cruelty') {
    groundsChildren.push(p(`${checkBox(true)} Cruelty: ${f.crueltySpouseName || '_______________'} has treated ${f.crueltySpouseTarget || (userIsApplicant ? applicant.first + ' ' + applicant.last : 'me')} with physical or mental cruelty of such a kind as to make continued cohabitation intolerable.`));
    if (f.crueltyDetails) groundsChildren.push(p(`   Details: ${f.crueltyDetails}`));
  }

  // ── APPLICANT'S CERTIFICATE ──
  const certChildren = [
    boldP('APPLICANT\'S CERTIFICATE'),
    p('(Your lawyer, if you are represented, must complete the Lawyer\'s Certificate below.)'),
    emptyP(),
    p('Sections 7.1 to 7.5 of the Divorce Act and section 33.1 of the Children\'s Law Reform Act require you and the other party to:'),
    p('• Exercise your decision-making responsibility, parenting time, or contact with a child in a manner that is consistent with the child\'s best interests;'),
    p('• Protect the child from conflict arising from this case, to the best of your ability;'),
    p('• Try to resolve your family law issues by using out-of-court dispute resolution options, if it is appropriate in your case;'),
    p('• Provide complete, accurate, and up-to-date information in this case; and'),
    p('• Comply with any orders made in this case.'),
    emptyP(),
    p(`I, ${[applicant.first, applicant.last].filter(Boolean).join(' ') || '_______________'}, certify that I am aware of these duties under the Divorce Act and the Children's Law Reform Act.`),
    emptyP(),
    p('_________________________________          _________________________________'),
    p('Date of signature                                                   Signature of applicant'),
  ];

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 20 },
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
        boldP(isJoint
          ? 'THIS CASE IS A JOINT APPLICATION FOR DIVORCE. THE DETAILS ARE SET OUT ON THE ATTACHED PAGES.'
          : 'IN THIS CASE, THE APPLICANT IS CLAIMING DIVORCE ONLY.'),
        emptyP(),
        familyHistoryTable,
        emptyP(),
        childrenTable,
        emptyP(),
        boldP('PREVIOUS CASES OR AGREEMENTS'),
        p(`Have the parties or the children been in a court case before? ${f.priorCase || '___'}`),
        p(`Have the parties made a written agreement dealing with any matter involved in this case? ${f.priorAgreement || '___'}`),
        emptyP(),
        boldP('CLAIMS'),
        claimsHeader,
        ...claimsRows,
        emptyP(),
        ...groundsChildren,
        emptyP(),
        emptyP(),
        ...certChildren,
        emptyP(),
        p('FLR 8A (April 1, 2024)', { alignment: AlignmentType.RIGHT }),
      ],
    }],
  });
}

module.exports = { build };
