'use strict';

/**
 * Ontario Family Court Form 13.1 — Financial Statement (Property and Support Claims)
 * FLR 13.1 (May 1, 2021)
 *
 * Data shape:
 *   data.profile       - user's core profile
 *   data.familyInfo    - family_case_info row
 *   data.parties       - case_parties[] for family (respondent, lawyers, etc.)
 *   data.children      - case_children[]
 *   data.financial     - the full financial statement bundle from getFinancialStatement()
 *                        (valuation_dates, income_meta, income, noncash, expenses,
 *                         household, assets, debts, marriage_date_property,
 *                         excluded, disposed, schedule_b, schedule_b_meta)
 */

const {
  Document, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, PageBreak, HeightRule,
} = require('docx');

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BORDERS_ALL = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

// ── Basic helpers (mirror 8a.js style) ──
function txt(text, opts = {}) { return new TextRun({ text: String(text || ''), ...opts }); }
function p(content, opts = {}) {
  const children = Array.isArray(content)
    ? content.map(t => typeof t === 'string' ? txt(t) : t)
    : [typeof content === 'string' ? txt(content) : content];
  return new Paragraph({ children, ...opts });
}
function boldP(text, opts = {}) { return p([txt(text, { bold: true })], opts); }
function emptyP() { return new Paragraph({ children: [txt('')] }); }
function pageBreak() { return new Paragraph({ children: [new PageBreak()] }); }
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
function checkBox(checked) { return checked ? '☒' : '☐'; }

// ── Currency formatting ──
function fmt(n) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Party helpers (copied from 8a.js pattern) ──
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

// ── Category labels (kept consistent with the UI) ──
const ASSET_CATEGORY_LABEL = {
  land: 'Land',
  household_vehicles: 'Household items & vehicles',
  bank_savings_pensions: 'Bank accounts, savings, securities & pensions',
  insurance: 'Life & disability insurance',
  business: 'Business interests',
  money_owed: 'Money owed to you',
  other: 'Other property',
};

const SUBCAT_4B = {
  household_goods: 'Household goods & furniture',
  vehicles: 'Cars, boats, vehicles',
  jewellery: 'Jewellery, art, electronics, tools, sports & hobby equipment',
  other_special: 'Other special items',
};

const MDP_CATEGORY_LABEL = {
  land: 'Land',
  household_vehicles: 'General household items & vehicles',
  bank_savings_pensions: 'Bank accounts, savings, securities & pensions',
  insurance: 'Life & disability insurance',
  business: 'Business interests',
  money_owed: 'Money owed to you',
  other: 'Other property',
  debts: 'Debts and other liabilities',
};

const DEBT_CATEGORY_LABEL = {
  mortgage: 'Mortgage', credit_card: 'Credit card', cra: 'Money owed to CRA',
  contingent: 'Contingent liability', legal: 'Legal/professional bills (this case)',
  other: 'Other',
};

// Part 1 income row labels (items 1-11 — order is fixed on the form)
const INCOME_ORDER = [
  ['employment',        'Employment income (before deductions)'],
  ['commissions',       'Commissions, tips and bonuses'],
  ['self_employment',   'Self-employment income'],
  ['ei',                'Employment Insurance benefits'],
  ['wcb',               "Workers' compensation benefits"],
  ['social_assistance', 'Social assistance income (including ODSP payments)'],
  ['investment',        'Interest and investment income'],
  ['pension',           'Pension income (including CPP and OAS)'],
  ['spousal_support',   'Spousal support received from a former spouse/partner'],
  ['child_benefits',    'Child Tax Benefits or Tax Rebates (e.g. GST)'],
  ['other',             'Other sources of income'],
];

// Part 2 expense section/row order — must match the form's visual grouping
const EXPENSE_ORDER = {
  automatic: {
    title: 'Automatic Deductions',
    rows: [
      ['auto_cpp', 'CPP contributions'],
      ['auto_ei', 'EI premiums'],
      ['auto_income_tax', 'Income taxes'],
      ['auto_pension', 'Employee pension contributions'],
      ['auto_union_dues', 'Union dues'],
    ],
  },
  housing: {
    title: 'Housing',
    rows: [
      ['house_rent_mortgage', 'Rent or mortgage'],
      ['house_property_tax', 'Property taxes'],
      ['house_insurance', 'Property insurance'],
      ['house_condo_fees', 'Condominium fees'],
      ['house_repairs', 'Repairs and maintenance'],
    ],
  },
  utilities: {
    title: 'Utilities',
    rows: [
      ['util_water', 'Water'],
      ['util_heat', 'Heat'],
      ['util_electricity', 'Electricity'],
      ['util_telephone', 'Telephone'],
      ['util_cell', 'Cell phone'],
      ['util_cable', 'Cable'],
      ['util_internet', 'Internet'],
    ],
  },
  household: {
    title: 'Household Expenses',
    rows: [
      ['hh_groceries', 'Groceries'],
      ['hh_supplies', 'Household supplies'],
      ['hh_meals_out', 'Meals outside the home'],
      ['hh_pet_care', 'Pet care'],
      ['hh_laundry', 'Laundry and dry cleaning'],
    ],
  },
  childcare: {
    title: 'Childcare Costs',
    rows: [
      ['cc_daycare', 'Daycare expense'],
      ['cc_babysitting', 'Babysitting costs'],
    ],
  },
  transportation: {
    title: 'Transportation',
    rows: [
      ['trans_public', 'Public transit, taxis'],
      ['trans_gas', 'Gas and oil'],
      ['trans_insurance', 'Car insurance and license'],
      ['trans_repairs', 'Repairs and maintenance'],
      ['trans_parking', 'Parking'],
      ['trans_car_loan', 'Car loan or lease payments'],
    ],
  },
  health: {
    title: 'Health',
    rows: [
      ['health_insurance', 'Health insurance premiums'],
      ['health_dental', 'Dental expenses'],
      ['health_drugs', 'Medicine and drugs'],
      ['health_eye', 'Eye care'],
    ],
  },
  personal: {
    title: 'Personal',
    rows: [
      ['pers_clothing', 'Clothing'],
      ['pers_hair', 'Hair care and beauty'],
      ['pers_alcohol_tobacco', 'Alcohol and tobacco'],
      ['pers_education', 'Education'],
      ['pers_entertainment', 'Entertainment/recreation (including children)'],
      ['pers_gifts', 'Gifts'],
    ],
  },
  other: {
    title: 'Other Expenses',
    rows: [
      ['other_life_insurance', 'Life insurance premiums'],
      ['other_rrsp_resp', 'RRSP/RESP withdrawals'],
      ['other_vacations', 'Vacations'],
      ['other_school_fees', 'School fees and supplies'],
      ['other_children_clothing', 'Clothing for children'],
      ['other_children_activities', "Children's activities"],
      ['other_summer_camp', 'Summer camp expenses'],
      ['other_debt_payments', 'Debt payments'],
      ['other_support_paid', 'Support paid for other children'],
      ['other_other', 'Other expenses not shown above'],
    ],
  },
};

// Look up an expense row's monthly amount by category key
function getExpense(rows, key) {
  const row = (rows || []).find(r => r.category === key);
  return row ? Number(row.monthly_amount) || 0 : 0;
}

// ──────────────────────────────────────────────────────────────
// MAIN BUILD
// ──────────────────────────────────────────────────────────────
function build(data) {
  const { profile = {}, familyInfo = {}, parties = [], children = [],
          financial = {} } = data;

  const fin = financial || {};
  const valDates = fin.valuation_dates || {};
  const incomeMeta = fin.income_meta || {};
  const incomeRows = fin.income || [];
  const noncash = fin.noncash || [];
  const expenseRows = fin.expenses || [];
  const household = fin.household || {};
  const assets = fin.assets || [];
  const debts = fin.debts || [];
  const mdp = fin.marriage_date_property || [];
  const excluded = fin.excluded || [];
  const disposed = fin.disposed || [];
  const scheduleB = fin.schedule_b || [];
  const scheduleBMeta = fin.schedule_b_meta || {};

  const respondent = parties.find(x => x.role === 'respondent');
  const myCounsel = parties.find(x => x.role === 'my_counsel');
  const opposingCounsel = parties.find(x => x.role === 'opposing_counsel');

  const userIsApplicant = (familyInfo.role || '').toLowerCase().includes('applicant') || !familyInfo.role;
  const applicant = userIsApplicant ? profile : (respondent || {});
  const respondentParty = userIsApplicant ? (respondent || {}) : profile;
  const applicantLawyer = userIsApplicant ? myCounsel : opposingCounsel;
  const respondentLawyer = userIsApplicant ? opposingCounsel : myCounsel;

  const filedByApplicant = userIsApplicant;
  const deponentName = [profile.first, profile.last].filter(Boolean).join(' ');
  const deponentMuniProv = [profile.city, profile.province].filter(Boolean).join(', ');

  // ── Running totals for the form ──
  const fixedIncomeRows = incomeRows.filter(r => !r.is_schedule_a);
  const incomeMonthlyTotal = fixedIncomeRows.reduce((s, r) => s + (Number(r.monthly_amount) || 0), 0);
  const incomeAnnualTotal = incomeMonthlyTotal * 12;

  // Part 2 subtotals per section
  const sectionSubtotals = {};
  for (const [sectionKey] of Object.entries(EXPENSE_ORDER)) {
    const sectionRows = expenseRows.filter(r => r.section === sectionKey);
    sectionSubtotals[sectionKey] = sectionRows.reduce((s, r) => s + (Number(r.monthly_amount) || 0), 0);
  }
  const expensesMonthlyTotal = Object.values(sectionSubtotals).reduce((s, v) => s + v, 0);
  const expensesYearlyTotal = expensesMonthlyTotal * 12;

  // Part 4 per-category totals (for items 15-21)
  function assetTotalByCat(cat, field) {
    return assets.filter(a => a.category === cat).reduce((s, a) => s + (Number(a[field]) || 0), 0);
  }
  const item15_marriage = assetTotalByCat('land','value_marriage');
  const item15_valuation = assetTotalByCat('land','value_valuation');
  const item16_marriage = assetTotalByCat('household_vehicles','value_marriage');
  const item16_valuation = assetTotalByCat('household_vehicles','value_valuation');
  const item17_marriage = assetTotalByCat('bank_savings_pensions','value_marriage');
  const item17_valuation = assetTotalByCat('bank_savings_pensions','value_valuation');
  const item18_marriage = assetTotalByCat('insurance','value_marriage');
  const item18_valuation = assetTotalByCat('insurance','value_valuation');
  const item19_marriage = assetTotalByCat('business','value_marriage');
  const item19_valuation = assetTotalByCat('business','value_valuation');
  const item20_marriage = assetTotalByCat('money_owed','value_marriage');
  const item20_valuation = assetTotalByCat('money_owed','value_valuation');
  const item21_marriage = assetTotalByCat('other','value_marriage');
  const item21_valuation = assetTotalByCat('other','value_valuation');

  // Item 22: total all property on valuation date
  const item22_marriage = item15_marriage + item16_marriage + item17_marriage + item18_marriage
                        + item19_marriage + item20_marriage + item21_marriage;
  const item22_valuation = item15_valuation + item16_valuation + item17_valuation + item18_valuation
                         + item19_valuation + item20_valuation + item21_valuation;

  // Item 23: total debts
  const item23_marriage = debts.reduce((s, d) => s + (Number(d.amount_marriage) || 0), 0);
  const item23_valuation = debts.reduce((s, d) => s + (Number(d.amount_valuation) || 0), 0);

  // Part 6 rollup totals
  const mdpAssetsTotal = mdp.reduce((s, r) => s + (Number(r.assets_value) || 0), 0);
  const mdpLiabTotal = mdp.reduce((s, r) => s + (Number(r.liabilities_value) || 0), 0);
  const item24 = mdpAssetsTotal - mdpLiabTotal; // Net value at date of marriage
  const item25 = item23_valuation + item24;     // Value of all deductions

  // Item 26: excluded property total
  const item26 = excluded.reduce((s, e) => s + (Number(e.value_valuation) || 0), 0);

  // Item 27: disposed property total
  const item27 = disposed.reduce((s, d) => s + (Number(d.value) || 0), 0);

  // Item 28: NFP (can't be negative by statute)
  const item28 = Math.max(0, item22_valuation - item23_valuation - item24 - item26);

  // Schedule B totals
  const schedBAnnual = scheduleB.reduce((s, r) =>
    s + ((Number(r.annual_amount) || 0) - (Number(r.tax_credits_deductions) || 0)), 0);
  const schedBMonthly = schedBAnnual / 12;

  // ══════════════════════════════════════════════════════════════
  // HEADER / PARTIES
  // ══════════════════════════════════════════════════════════════
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
          boldP('Form 13.1:'),
          p('Financial Statement'),
          p('(Property and Support Claims)'),
          p('sworn/affirmed'),
        ], { width: { size: 30, type: WidthType.PERCENTAGE } }),
      ]}),
      new TableRow({ children: [
        cell([p('at ' + (familyInfo.court || ''))], { columnSpan: 3 }),
      ]}),
    ],
  });

  const partiesTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell([boldP('Applicant(s)')]),
        cell([boldP("Applicant(s) Lawyer")]),
      ]}),
      new TableRow({ children: [
        multilineCell(partyLines(applicant), { width: { size: 50, type: WidthType.PERCENTAGE } }),
        multilineCell(lawyerLines(applicantLawyer), { width: { size: 50, type: WidthType.PERCENTAGE } }),
      ]}),
      new TableRow({ children: [
        cell([boldP('Respondent(s)')]),
        cell([boldP("Respondent(s) Lawyer")]),
      ]}),
      new TableRow({ children: [
        multilineCell(partyLines(respondentParty)),
        multilineCell(lawyerLines(respondentLawyer)),
      ]}),
    ],
  });

  const filedByTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell([
          boldP('This form is filed by:'),
          p(`${checkBox(filedByApplicant)} applicant    ${checkBox(!filedByApplicant)} respondent`),
        ]),
      ]}),
    ],
  });

  // ══════════════════════════════════════════════════════════════
  // OPENING SWORN STATEMENT
  // ══════════════════════════════════════════════════════════════
  const openingBlock = [
    boldP('1. My name is (full legal name):'),
    p(deponentName || ' '),
    boldP('I live in (municipality & province):'),
    p(deponentMuniProv || ' '),
    boldP('and I swear/affirm that the following is true:'),
  ];

  // ══════════════════════════════════════════════════════════════
  // PART 1 — INCOME
  // ══════════════════════════════════════════════════════════════
  const part1Header = boldP('PART 1: INCOME');

  const employmentStatusBlock = [
    boldP('2. I am currently'),
    p(`${checkBox(incomeMeta.employment_status === 'employed')}  employed by (name and address of employer):`),
    p(incomeMeta.employer_name_address || ' '),
    p(`${checkBox(incomeMeta.employment_status === 'self_employed')}  self-employed, carrying on business under the name of (name and address of business):`),
    p(incomeMeta.business_name_address || ' '),
    p(`${checkBox(incomeMeta.employment_status === 'unemployed')}  unemployed since (date when last employed):`),
    p(incomeMeta.unemployed_since || ' '),
  ];

  const item3Block = [
    boldP('3. I attach proof of my year-to-date income from all sources, including my most recent (attach all that are applicable):'),
    p('☐ pay cheque stub   ☐ social assistance stub   ☐ pension stub   ☐ workers\' compensation stub'),
    p('☐ employment insurance stub and last Record of Employment'),
    p('☐ statement of income and expenses/professional activities (for self-employed individuals)'),
    p('☐ other (e.g. a letter from your employer confirming all income received to date this year)'),
  ];

  const item4Block = [
    boldP('4. Last year, my gross income from all sources was:'),
    p(fmt(incomeMeta.last_year_gross_income) + '  (do not subtract any taxes that have been deducted from this income).'),
  ];

  const item5Block = [
    boldP('5. I am attaching all of the following required documents to this financial statement as proof of my income over the past three years, if they have not already been provided:'),
    p('☐ a copy of my personal income tax returns for each of the past three taxation years, including any materials that were filed with the returns.'),
    p('☐ a copy of my notices of assessment and any notices of reassessment for each of the past three taxation years.'),
    p('☐ where my notices of assessment and reassessment are unavailable, an Income and Deductions printout from the Canada Revenue Agency for each of those years.'),
    p('OR'),
    p(`${checkBox(!!incomeMeta.indian_act_election)}  I am an Indian within the meaning of the Indian Act (Canada) and I have chosen not to file income tax returns for the past three years. I am attaching the following proof of income for the last three years:`),
    p(incomeMeta.indian_act_documents || ' '),
  ];

  // Income table (items 1-13)
  const incomeTableRows = [
    new TableRow({ children: [
      cell([boldP('Income Source')], { width: { size: 70, type: WidthType.PERCENTAGE } }),
      cell([boldP('Amount Received/Month')], { width: { size: 30, type: WidthType.PERCENTAGE } }),
    ]}),
  ];
  INCOME_ORDER.forEach(([key, label], i) => {
    const row = fixedIncomeRows.find(r => r.category === key);
    const amount = row ? Number(row.monthly_amount) || 0 : 0;
    const suffix = key === 'self_employment' && incomeMeta.self_employment_gross_monthly
      ? ` (Monthly amount before expenses: ${fmt(incomeMeta.self_employment_gross_monthly)})` : '';
    incomeTableRows.push(new TableRow({ children: [
      cell([p(`${i + 1}. ${label}${suffix}`)]),
      cell([p(fmt(amount), { alignment: AlignmentType.RIGHT })]),
    ]}));
  });
  incomeTableRows.push(new TableRow({ children: [
    cell([boldP('12. Total monthly income from all sources:')]),
    cell([boldP(fmt(incomeMonthlyTotal), { alignment: AlignmentType.RIGHT })]),
  ]}));
  incomeTableRows.push(new TableRow({ children: [
    cell([boldP('13. Total monthly income × 12 = Total annual income:')]),
    cell([boldP(fmt(incomeAnnualTotal), { alignment: AlignmentType.RIGHT })]),
  ]}));
  const incomeTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: incomeTableRows });

  // Item 14 — Non-cash benefits
  const noncashHeader = [
    boldP('14. Other Benefits'),
    p('Provide details of any non-cash benefits that your employer provides to you or are paid for by your business such as medical insurance coverage, the use of a company car, or room and board.'),
  ];
  const noncashRows = [
    new TableRow({ children: [
      cell([boldP('Item')]),
      cell([boldP('Details')]),
      cell([boldP('Yearly Market Value')]),
    ]}),
  ];
  if (noncash.length === 0) {
    for (let i = 0; i < 4; i++) {
      noncashRows.push(new TableRow({ children: [cell(' '), cell(' '), cell(' ')] }));
    }
  } else {
    noncash.forEach(n => {
      noncashRows.push(new TableRow({ children: [
        cell([p(n.item || ' ')]),
        cell([p(n.details || ' ')]),
        cell([p(fmt(n.yearly_market_value), { alignment: AlignmentType.RIGHT })]),
      ]}));
    });
  }
  const noncashTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: noncashRows });

  // ══════════════════════════════════════════════════════════════
  // PART 2 — EXPENSES
  // ══════════════════════════════════════════════════════════════
  const part2Header = boldP('PART 2: EXPENSES');

  // Single wide table with section rows interspersed
  const expenseTableRows = [
    new TableRow({ children: [
      cell([boldP('Expense')], { width: { size: 70, type: WidthType.PERCENTAGE } }),
      cell([boldP('Monthly Amount')], { width: { size: 30, type: WidthType.PERCENTAGE } }),
    ]}),
  ];
  Object.entries(EXPENSE_ORDER).forEach(([sectionKey, section]) => {
    // Section header row (bold, shaded if we could)
    expenseTableRows.push(new TableRow({ children: [
      cell([boldP(section.title)], { columnSpan: 2 }),
    ]}));
    section.rows.forEach(([key, label]) => {
      const amount = getExpense(expenseRows, key);
      expenseTableRows.push(new TableRow({ children: [
        cell([p(label)]),
        cell([p(fmt(amount), { alignment: AlignmentType.RIGHT })]),
      ]}));
    });
    // Section subtotal
    expenseTableRows.push(new TableRow({ children: [
      cell([boldP('SUBTOTAL')]),
      cell([boldP(fmt(sectionSubtotals[sectionKey]), { alignment: AlignmentType.RIGHT })]),
    ]}));
  });
  // Grand totals
  expenseTableRows.push(new TableRow({ children: [
    cell([boldP('Total Amount of Monthly Expenses')]),
    cell([boldP(fmt(expensesMonthlyTotal), { alignment: AlignmentType.RIGHT })]),
  ]}));
  expenseTableRows.push(new TableRow({ children: [
    cell([boldP('Total Amount of Yearly Expenses')]),
    cell([boldP(fmt(expensesYearlyTotal), { alignment: AlignmentType.RIGHT })]),
  ]}));
  const expenseTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: expenseTableRows });

  // ══════════════════════════════════════════════════════════════
  // PART 3 — OTHER INCOME EARNERS IN THE HOME
  // ══════════════════════════════════════════════════════════════
  const part3Header = boldP('PART 3: OTHER INCOME EARNERS IN THE HOME');
  const part3Sub = p('Complete this part only if you are making or responding to a claim for undue hardship or spousal support. Check and complete all sections that apply to your circumstances.');
  const part3Block = [
    p(`1. ${checkBox(!!household.lives_alone)}  I live alone.`),
    p(`2. ${checkBox(!!household.spouse_partner_name)}  I am living with (full legal name of person you are married to or cohabiting with): ${household.spouse_partner_name || '  '}`),
    p(`3. ${checkBox(!!household.other_adults)}  I/we live with the following other adult(s): ${household.other_adults || '  '}`),
    p(`4. ${checkBox((household.children_count || 0) > 0)}  I/we have ${household.children_count || '  '} child(ren) who live(s) in the home.`),
    p(`5. My spouse/partner ${checkBox(!!household.spouse_works_at)} works at (place of work or business): ${household.spouse_works_at || '  '}`),
    p(`           ${checkBox(!!household.spouse_not_working)} does not work outside the home.`),
    p(`6. My spouse/partner ${checkBox((household.spouse_earns_amount || 0) > 0)} earns (give amount): ${fmt(household.spouse_earns_amount)} per ${household.spouse_earns_period || '  '}`),
    p(`           ${checkBox(!!household.spouse_no_income)} does not earn any income.`),
    p(`7. My spouse/partner or other adult residing in the home contributes about ${fmt(household.contribution_amount)} per ${household.contribution_period || '  '} towards the household expenses.`),
  ];

  // ══════════════════════════════════════════════════════════════
  // PART 4 — ASSETS IN AND OUT OF ONTARIO
  // ══════════════════════════════════════════════════════════════
  const part4Header = boldP('PART 4: ASSETS IN AND OUT OF ONTARIO');
  const part4Intro = [
    p('If any sections of Parts 4 to 9 do not apply, do not leave blank, print "NONE" in the section.'),
    p(`The date of marriage is: ${valDates.date_of_marriage || '  '}`),
    p(`The valuation date is: ${valDates.valuation_date || '  '}`),
    p(`The date of commencement of cohabitation is (if different from date of marriage): ${valDates.cohabitation_start_date || '  '}`),
  ];

  // Helper to build a triple-value table for a Part 4 subsection
  function buildTripleAssetTable(category, columns) {
    // columns: array of header strings for the left-side columns (before the three $ columns)
    const catRows = assets.filter(a => a.category === category);
    const headerChildren = columns.map(c => cell([boldP(c)]));
    headerChildren.push(cell([boldP('at marriage')]));
    headerChildren.push(cell([boldP('at valuation')]));
    headerChildren.push(cell([boldP('today')]));
    const tableRows = [new TableRow({ children: headerChildren })];

    if (catRows.length === 0) {
      const filler = columns.map(() => cell('NONE'));
      filler.push(cell(' '));
      filler.push(cell(' '));
      filler.push(cell(' '));
      tableRows.push(new TableRow({ children: filler }));
    } else {
      catRows.forEach(a => {
        const rowCells = [];
        if (category === 'land') {
          rowCells.push(cell([p(a.description || ' ')]));
          rowCells.push(cell([p(a.detail_2 || ' ')]));
        } else if (category === 'household_vehicles') {
          rowCells.push(cell([p(SUBCAT_4B[a.subcategory] || a.subcategory || ' ')]));
          const descLines = [a.description || ' '];
          if (a.not_in_possession) descLines.push('(Not in your possession)');
          rowCells.push(multilineCell(descLines));
        } else if (category === 'bank_savings_pensions') {
          rowCells.push(cell([p(a.description || ' ')]));
          rowCells.push(cell([p(a.detail_2 || ' ')]));
        } else if (category === 'insurance') {
          rowCells.push(cell([p(a.description || ' ')]));
          rowCells.push(cell([p(a.detail_2 || ' ')]));
        } else if (category === 'business') {
          rowCells.push(cell([p(a.description || ' ')]));
          rowCells.push(cell([p(a.detail_2 || ' ')]));
        } else if (category === 'money_owed') {
          rowCells.push(cell([p(a.description || ' ')]));
        } else if (category === 'other') {
          rowCells.push(cell([p(a.description || ' ')]));
          rowCells.push(cell([p(a.detail_2 || ' ')]));
        }
        rowCells.push(cell([p(fmt(a.value_marriage), { alignment: AlignmentType.RIGHT })]));
        rowCells.push(cell([p(fmt(a.value_valuation), { alignment: AlignmentType.RIGHT })]));
        rowCells.push(cell([p(fmt(a.value_current), { alignment: AlignmentType.RIGHT })]));
        tableRows.push(new TableRow({ children: rowCells }));
      });
    }
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows });
  }

  // Helper to build a Part 4 totals row (not in the data table — a simple standalone paragraph table)
  function totalsRow(itemNum, label, marriageVal, valuationVal) {
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [
        cell([boldP(`${itemNum}. ${label}`)], { width: { size: 60, type: WidthType.PERCENTAGE } }),
        cell([boldP(fmt(marriageVal), { alignment: AlignmentType.RIGHT })], { width: { size: 20, type: WidthType.PERCENTAGE } }),
        cell([boldP(fmt(valuationVal), { alignment: AlignmentType.RIGHT })], { width: { size: 20, type: WidthType.PERCENTAGE } }),
      ]})],
    });
  }

  // Part 4(a) Land
  const part4aHeader = boldP('PART 4(a): LAND');
  const part4aSub = p('Include any interest in land owned on the dates in each of the columns below, including leasehold interests and mortgages. Show estimated market value of your interest, but do not deduct encumbrances or costs of disposition; these encumbrances and costs should be shown under Part 5, "Debts and Other Liabilities".');
  const part4aTable = buildTripleAssetTable('land', ['Nature & Type of Ownership', 'Address of Property']);
  const part4aTotals = totalsRow('15', 'TOTAL VALUE OF LAND', item15_marriage, item15_valuation);

  // Part 4(b) Household Items & Vehicles
  const part4bHeader = boldP('PART 4(b): GENERAL HOUSEHOLD ITEMS AND VEHICLES');
  const part4bSub = p('Show estimated market value, not the cost of replacement for these items owned on the dates in each of the columns below.');
  const part4bTable = buildTripleAssetTable('household_vehicles', ['Item', 'Description']);
  const part4bTotals = totalsRow('16', 'TOTAL VALUE OF GENERAL HOUSEHOLD ITEMS AND VEHICLES', item16_marriage, item16_valuation);

  // Part 4(c) Bank Accounts, Savings, Securities & Pensions
  const part4cHeader = boldP('PART 4(c): BANK ACCOUNTS, SAVINGS, SECURITIES AND PENSIONS');
  const part4cSub = p('Show the items owned on the dates in each of the columns below by category, for example, cash, accounts in financial institutions, pensions, registered retirement or other savings plans, deposit receipts, any other savings, bonds, warrants, options, notes and other securities.');
  const part4cTable = buildTripleAssetTable('bank_savings_pensions', ['INSTITUTION/DESCRIPTION', 'Account number']);
  const part4cTotals = totalsRow('17', 'TOTAL VALUE OF ACCOUNTS, SAVINGS, SECURITIES AND PENSIONS', item17_marriage, item17_valuation);

  // Part 4(d) Life & Disability Insurance
  const part4dHeader = boldP('PART 4(d): LIFE AND DISABILITY INSURANCE');
  const part4dSub = p('List all policies in existence on the dates in each of the columns below.');
  const part4dTable = buildTripleAssetTable('insurance', ['Company, Type & Policy No.', 'Owner / Beneficiary / Face Amount']);
  const part4dTotals = totalsRow('18', 'TOTAL CASH SURRENDER VALUE OF INSURANCE POLICIES', item18_marriage, item18_valuation);

  // Part 4(e) Business Interests
  const part4eHeader = boldP('PART 4(e): BUSINESS INTERESTS');
  const part4eSub = p('Show any interest in an unincorporated business owned on the dates in each of the columns below. An interest in an incorporated business may be shown here or under "Bank Accounts, Savings, Securities, And Pensions" in Part 4(c).');
  const part4eTable = buildTripleAssetTable('business', ['Name of Firm or Company', 'Interest']);
  const part4eTotals = totalsRow('19', 'TOTAL VALUE OF BUSINESS INTERESTS', item19_marriage, item19_valuation);

  // Part 4(f) Money Owed to You
  const part4fHeader = boldP('PART 4(f): MONEY OWED TO YOU');
  const part4fSub = p('Give details of all money that other persons owe to you on the dates in each of the columns below, whether because of business or from personal dealings. Include any court judgments in your favour, any estate money and any income tax refunds owed to you.');
  const part4fTable = buildTripleAssetTable('money_owed', ['Details']);
  const part4fTotals = totalsRow('20', 'TOTAL OF MONEY OWED TO YOU', item20_marriage, item20_valuation);

  // Part 4(g) Other Property
  const part4gHeader = boldP('PART 4(g): OTHER PROPERTY');
  const part4gSub = p('Show other property or assets owned on the dates in each of the columns below. Include property of any kind not listed above. Give your best estimate of market value.');
  const part4gTable = buildTripleAssetTable('other', ['Category', 'Details']);
  const part4gTotals = totalsRow('21', 'TOTAL VALUE OF OTHER PROPERTY', item21_marriage, item21_valuation);

  const item22Row = totalsRow('22', 'VALUE OF ALL PROPERTY OWNED ON THE VALUATION DATE (Add items [15] to [21].)', item22_marriage, item22_valuation);

  // ══════════════════════════════════════════════════════════════
  // PART 5 — DEBTS
  // ══════════════════════════════════════════════════════════════
  const part5Header = boldP('PART 5: DEBTS AND OTHER LIABILITIES');
  const part5Sub = p('Show your debts and other liabilities on the dates in each of the columns below. List them by category such as mortgages, charges, liens, notes, credit cards, and accounts payable. Include money owed to CRA, contingent liabilities (indicate contingent), and unpaid legal or professional bills from this case.');

  const debtsRowsArr = [
    new TableRow({ children: [
      cell([boldP('Category')]),
      cell([boldP('Details')]),
      cell([boldP('at marriage')]),
      cell([boldP('at valuation')]),
      cell([boldP('today')]),
    ]}),
  ];
  if (debts.length === 0) {
    debtsRowsArr.push(new TableRow({ children: [
      cell('NONE'), cell(' '), cell(' '), cell(' '), cell(' '),
    ]}));
  } else {
    debts.forEach(d => {
      const catLabel = DEBT_CATEGORY_LABEL[d.category] || d.category || ' ';
      const details = (d.details || ' ') + (d.is_contingent ? ' (contingent)' : '');
      debtsRowsArr.push(new TableRow({ children: [
        cell([p(catLabel)]),
        cell([p(details)]),
        cell([p(fmt(d.amount_marriage), { alignment: AlignmentType.RIGHT })]),
        cell([p(fmt(d.amount_valuation), { alignment: AlignmentType.RIGHT })]),
        cell([p(fmt(d.amount_current), { alignment: AlignmentType.RIGHT })]),
      ]}));
    });
  }
  const debtsTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: debtsRowsArr });
  const item23Row = totalsRow('23', 'TOTAL OF DEBTS AND OTHER LIABILITIES', item23_marriage, item23_valuation);

  // ══════════════════════════════════════════════════════════════
  // PART 6 — PROPERTY, DEBTS ON DATE OF MARRIAGE
  // ══════════════════════════════════════════════════════════════
  const part6Header = boldP('PART 6: PROPERTY, DEBTS AND OTHER LIABILITIES ON DATE OF MARRIAGE');
  const part6Sub = p('Show by category the value of your property, debts and other liabilities, calculated as of the date of your marriage. (In this part, do not include the value of a matrimonial home or debts or other liabilities directly related to its purchase or significant improvement, if you and your spouse ordinarily occupied this property as your family residence at the time of separation.)');

  // Build the Part 6 table with one row per MDP_CATEGORY, pulling from fs_marriage_date_property
  const part6RowsArr = [
    new TableRow({ children: [
      cell([boldP('Category and details')], { width: { size: 60, type: WidthType.PERCENTAGE } }),
      cell([boldP('Assets')], { width: { size: 20, type: WidthType.PERCENTAGE } }),
      cell([boldP('Liabilities')], { width: { size: 20, type: WidthType.PERCENTAGE } }),
    ]}),
  ];
  // Aggregate by category (in case the user has multiple rows per category, which our UI allows as free-form)
  Object.entries(MDP_CATEGORY_LABEL).forEach(([key, label]) => {
    const catRows = mdp.filter(r => r.category === key);
    const assetsTotal = catRows.reduce((s, r) => s + (Number(r.assets_value) || 0), 0);
    const liabTotal = catRows.reduce((s, r) => s + (Number(r.liabilities_value) || 0), 0);
    const detailLines = [label];
    const details = catRows.map(r => r.details).filter(Boolean);
    if (details.length) detailLines.push(details.join('; '));
    part6RowsArr.push(new TableRow({ children: [
      multilineCell(detailLines),
      cell([p(fmt(assetsTotal), { alignment: AlignmentType.RIGHT })]),
      cell([p(fmt(liabTotal), { alignment: AlignmentType.RIGHT })]),
    ]}));
  });
  part6RowsArr.push(new TableRow({ children: [
    cell([boldP('TOTALS')]),
    cell([boldP(fmt(mdpAssetsTotal), { alignment: AlignmentType.RIGHT })]),
    cell([boldP(fmt(mdpLiabTotal), { alignment: AlignmentType.RIGHT })]),
  ]}));
  const part6Table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: part6RowsArr });

  const item24Row = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [
      cell([boldP('24. NET VALUE OF PROPERTY OWNED ON DATE OF MARRIAGE'), p('(From the total of the "Assets" column, subtract the total of the "Liabilities" column.)')], { width: { size: 75, type: WidthType.PERCENTAGE } }),
      cell([boldP(fmt(item24), { alignment: AlignmentType.RIGHT })], { width: { size: 25, type: WidthType.PERCENTAGE } }),
    ]})],
  });
  const item25Row = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [
      cell([boldP('25. VALUE OF ALL DEDUCTIONS'), p('(Add items [23] and [24].)')], { width: { size: 75, type: WidthType.PERCENTAGE } }),
      cell([boldP(fmt(item25), { alignment: AlignmentType.RIGHT })], { width: { size: 25, type: WidthType.PERCENTAGE } }),
    ]})],
  });

  // ══════════════════════════════════════════════════════════════
  // PART 7 — EXCLUDED PROPERTY
  // ══════════════════════════════════════════════════════════════
  const part7Header = boldP('PART 7: EXCLUDED PROPERTY');
  const part7Sub = p('Show by category the value of property owned on the valuation date that is excluded from the definition of "net family property" (such as gifts or inheritances received after marriage).');
  const part7RowsArr = [
    new TableRow({ children: [
      cell([boldP('Category')]),
      cell([boldP('Details')]),
      cell([boldP('Value on valuation date')]),
    ]}),
  ];
  if (excluded.length === 0) {
    part7RowsArr.push(new TableRow({ children: [cell('NONE'), cell(' '), cell(' ')] }));
  } else {
    excluded.forEach(e => {
      part7RowsArr.push(new TableRow({ children: [
        cell([p(e.category || ' ')]),
        cell([p(e.details || ' ')]),
        cell([p(fmt(e.value_valuation), { alignment: AlignmentType.RIGHT })]),
      ]}));
    });
  }
  const part7Table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: part7RowsArr });
  const item26Row = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [
      cell([boldP('26. TOTAL VALUE OF EXCLUDED PROPERTY')], { width: { size: 75, type: WidthType.PERCENTAGE } }),
      cell([boldP(fmt(item26), { alignment: AlignmentType.RIGHT })], { width: { size: 25, type: WidthType.PERCENTAGE } }),
    ]})],
  });

  // ══════════════════════════════════════════════════════════════
  // PART 8 — DISPOSED PROPERTY
  // ══════════════════════════════════════════════════════════════
  const part8Header = boldP('PART 8: DISPOSED-OF PROPERTY');
  const part8Sub = p('Show by category the value of all property that you disposed of during the two years immediately preceding the making of this statement, or during the marriage, whichever period is shorter.');
  const part8RowsArr = [
    new TableRow({ children: [
      cell([boldP('Category')]),
      cell([boldP('Details')]),
      cell([boldP('Value')]),
    ]}),
  ];
  if (disposed.length === 0) {
    part8RowsArr.push(new TableRow({ children: [cell('NONE'), cell(' '), cell(' ')] }));
  } else {
    disposed.forEach(d => {
      part8RowsArr.push(new TableRow({ children: [
        cell([p(d.category || ' ')]),
        cell([p(d.details || ' ')]),
        cell([p(fmt(d.value), { alignment: AlignmentType.RIGHT })]),
      ]}));
    });
  }
  const part8Table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: part8RowsArr });
  const item27Row = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [
      cell([boldP('27. TOTAL VALUE OF DISPOSED-OF PROPERTY')], { width: { size: 75, type: WidthType.PERCENTAGE } }),
      cell([boldP(fmt(item27), { alignment: AlignmentType.RIGHT })], { width: { size: 25, type: WidthType.PERCENTAGE } }),
    ]})],
  });

  // ══════════════════════════════════════════════════════════════
  // PART 9 — NFP CALCULATION
  // ══════════════════════════════════════════════════════════════
  const part9Header = boldP('PART 9: CALCULATION OF NET FAMILY PROPERTY');
  const part9Table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell([p(' ')]),
        cell([boldP('Deductions')]),
        cell([boldP('BALANCE')]),
      ]}),
      new TableRow({ children: [
        cell([p('Value of all property owned on valuation date (from item [22] above)')]),
        cell([p(' ')]),
        cell([p(fmt(item22_valuation), { alignment: AlignmentType.RIGHT })]),
      ]}),
      new TableRow({ children: [
        cell([p('Subtract value of all deductions (from item [25] above)')]),
        cell([p(fmt(item25), { alignment: AlignmentType.RIGHT })]),
        cell([p(fmt(item22_valuation - item25), { alignment: AlignmentType.RIGHT })]),
      ]}),
      new TableRow({ children: [
        cell([p('Subtract total value of excluded property (from item [26] above)')]),
        cell([p(fmt(item26), { alignment: AlignmentType.RIGHT })]),
        cell([p(fmt(item22_valuation - item25 - item26), { alignment: AlignmentType.RIGHT })]),
      ]}),
      new TableRow({ children: [
        cell([boldP('28. NET FAMILY PROPERTY')], { columnSpan: 2 }),
        cell([boldP(fmt(item28), { alignment: AlignmentType.RIGHT })]),
      ]}),
    ],
  });

  const updateNote = [
    boldP('NOTE: This financial statement must be updated before any court event if it is:'),
    p('• more than 60 days old by the time of the case conference,'),
    p('• more than 30 days old by the time the motion is heard, or'),
    p('• more than 40 days old by the start of the trial or the start of the trial sitting, whichever comes first.'),
  ];

  // ══════════════════════════════════════════════════════════════
  // SWORN/AFFIRMED BLOCK
  // ══════════════════════════════════════════════════════════════
  const swornTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [
        cell([p('Sworn/Affirmed before me at')]),
        cell([p(' ')]),
      ]}),
      new TableRow({ children: [
        cell([p(' '), p('municipality')]),
        cell([p(' ')]),
      ]}),
      new TableRow({ children: [
        cell([p('in')]),
        cell([p(' ')]),
      ]}),
      new TableRow({ children: [
        cell([p(' '), p('province, state or country')]),
        cell([p(' '), p('Signature (This form is to be signed in front of a lawyer, justice of the peace, notary public or commissioner for taking affidavits.)')]),
      ]}),
      new TableRow({ children: [
        cell([p('on')]),
        cell([p(' ')]),
      ]}),
      new TableRow({ children: [
        cell([p(' '), p('date')]),
        cell([p(' '), p('Commissioner for taking affidavits (Type or print name below if signature is illegible.)')]),
      ]}),
    ],
  });

  // ══════════════════════════════════════════════════════════════
  // SCHEDULE A — Additional income sources
  // ══════════════════════════════════════════════════════════════
  const schedAHeader = boldP('Schedule A: Additional Sources of Income');

  const schedARowsArr = [
    new TableRow({ children: [
      cell([boldP('Line')]),
      cell([boldP('Income Source')]),
      cell([boldP('Annual Amount')]),
    ]}),
  ];

  // Map Schedule A categories to form lines
  const SCHED_A_FORM_LINES = [
    ['sched_a_partnership',   'Net partnership income'],
    ['sched_a_rental',        'Net rental income'],
    ['sched_a_dividends',     'Total amount of dividends received from taxable Canadian corporations'],
    ['sched_a_capital_gains', 'Total capital gains less capital losses'],
    ['sched_a_rrsp',          'Registered retirement savings plan withdrawals'],
    ['sched_a_rrif',          'Income from a Registered Retirement Income Fund or Annuity'],
    ['sched_a_other',         'Any other income'],
  ];
  const schedARows = incomeRows.filter(r => r.is_schedule_a);
  let schedASubtotal = 0;
  SCHED_A_FORM_LINES.forEach(([key, label], i) => {
    // Sum across all user rows with this category (multiple "other" rows collapse to one form line)
    const matching = schedARows.filter(r => r.category === key);
    const amount = matching.reduce((s, r) => s + (Number(r.annual_amount) || 0), 0);
    schedASubtotal += amount;
    const details = matching.map(r => r.detail).filter(Boolean).join('; ');
    const labelWithDetails = details ? `${label} — ${details}` : label;
    schedARowsArr.push(new TableRow({ children: [
      cell([p(String(i + 1) + '.')]),
      cell([p(labelWithDetails)]),
      cell([p(fmt(amount), { alignment: AlignmentType.RIGHT })]),
    ]}));
  });
  schedARowsArr.push(new TableRow({ children: [
    cell([p(' ')]),
    cell([boldP('Subtotal:')]),
    cell([boldP(fmt(schedASubtotal), { alignment: AlignmentType.RIGHT })]),
  ]}));
  const schedATable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: schedARowsArr });

  // ══════════════════════════════════════════════════════════════
  // SCHEDULE B — Special/Extraordinary Expenses for Children
  // ══════════════════════════════════════════════════════════════
  const schedBHeader = boldP("Schedule B: Special or Extraordinary Expenses for the Child(ren)");

  const schedBRowsArr = [
    new TableRow({ children: [
      cell([boldP("Child's Name")]),
      cell([boldP('Expense')]),
      cell([boldP('Amount/yr.')]),
      cell([boldP('Available Tax Credits or Deductions')]),
    ]}),
  ];

  // Resolve child name (link to case_children.id or fall back to stored child_name)
  const childById = Object.fromEntries(children.map(c => [c.id, c]));
  if (scheduleB.length === 0) {
    for (let i = 0; i < 5; i++) {
      schedBRowsArr.push(new TableRow({ children: [cell(' '), cell(' '), cell(' '), cell(' ')] }));
    }
  } else {
    scheduleB.forEach(r => {
      let childName = r.child_name || '';
      if (r.child_id && childById[r.child_id]) {
        const c = childById[r.child_id];
        childName = [c.first, c.last].filter(Boolean).join(' ').trim() || childName;
      }
      schedBRowsArr.push(new TableRow({ children: [
        cell([p(childName || ' ')]),
        cell([p(r.expense || ' ')]),
        cell([p(fmt(r.annual_amount), { alignment: AlignmentType.RIGHT })]),
        cell([p(fmt(r.tax_credits_deductions), { alignment: AlignmentType.RIGHT })]),
      ]}));
    });
  }
  schedBRowsArr.push(new TableRow({ children: [
    cell([boldP('Total Net Annual Amount')], { columnSpan: 2 }),
    cell([boldP(fmt(schedBAnnual), { alignment: AlignmentType.RIGHT })]),
    cell([p(' ')]),
  ]}));
  schedBRowsArr.push(new TableRow({ children: [
    cell([boldP('Total Net Monthly Amount')], { columnSpan: 2 }),
    cell([boldP(fmt(schedBMonthly), { alignment: AlignmentType.RIGHT })]),
    cell([p(' ')]),
  ]}));
  const schedBTable = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: schedBRowsArr });

  const schedBFooter = [
    p('* Some of these expenses can be claimed in a parent\'s income tax return in relation to a tax credit or deduction (for example childcare costs). These credits or deductions must be shown in the above chart.'),
    p(`I earn ${fmt(scheduleBMeta.annual_income_for_share)} per year which should be used to determine my share of the above expenses.`),
    boldP('NOTE: Pursuant to the Child Support Guidelines, a court can order that the parents of a child share the costs of the following expenses for the child:'),
    p('• Necessary childcare expenses;'),
    p('• Medical insurance premiums and certain health-related expenses for the child that cost more than $100 annually;'),
    p('• Extraordinary expenses for the child\'s education;'),
    p('• Post-secondary school expenses;'),
    p('• Extraordinary expenses for extracurricular activities.'),
  ];

  // ══════════════════════════════════════════════════════════════
  // ASSEMBLE THE DOCUMENT
  // ══════════════════════════════════════════════════════════════
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
          size: { width: 12240, height: 15840 },
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: [
        // ── Header block ──
        headerTable,
        emptyP(),
        partiesTable,
        emptyP(),
        filedByTable,
        emptyP(),

        // Opening sworn statement
        ...openingBlock,
        emptyP(),

        // ── PART 1 ──
        part1Header,
        emptyP(),
        ...employmentStatusBlock,
        emptyP(),
        ...item3Block,
        emptyP(),
        ...item4Block,
        emptyP(),
        ...item5Block,
        emptyP(),
        incomeTable,
        emptyP(),
        ...noncashHeader,
        noncashTable,
        emptyP(),

        // ── PART 2 ──
        part2Header,
        emptyP(),
        expenseTable,
        emptyP(),

        // ── PART 3 ──
        part3Header,
        part3Sub,
        emptyP(),
        ...part3Block,
        emptyP(),

        // ── PART 4 ──
        part4Header,
        emptyP(),
        ...part4Intro,
        emptyP(),
        part4aHeader, part4aSub, part4aTable, part4aTotals, emptyP(),
        part4bHeader, part4bSub, part4bTable, part4bTotals, emptyP(),
        part4cHeader, part4cSub, part4cTable, part4cTotals, emptyP(),
        part4dHeader, part4dSub, part4dTable, part4dTotals, emptyP(),
        part4eHeader, part4eSub, part4eTable, part4eTotals, emptyP(),
        part4fHeader, part4fSub, part4fTable, part4fTotals, emptyP(),
        part4gHeader, part4gSub, part4gTable, part4gTotals, emptyP(),
        item22Row,
        emptyP(),

        // ── PART 5 ──
        part5Header,
        part5Sub,
        emptyP(),
        debtsTable,
        item23Row,
        emptyP(),

        // ── PART 6 ──
        part6Header,
        part6Sub,
        emptyP(),
        part6Table,
        item24Row,
        item25Row,
        emptyP(),

        // ── PART 7 ──
        part7Header,
        part7Sub,
        emptyP(),
        part7Table,
        item26Row,
        emptyP(),

        // ── PART 8 ──
        part8Header,
        part8Sub,
        emptyP(),
        part8Table,
        item27Row,
        emptyP(),

        // ── PART 9 ──
        part9Header,
        emptyP(),
        part9Table,
        emptyP(),
        ...updateNote,
        emptyP(),
        swornTable,

        // ── SCHEDULE A ──
        pageBreak(),
        schedAHeader,
        emptyP(),
        schedATable,
        emptyP(),

        // ── SCHEDULE B ──
        schedBHeader,
        emptyP(),
        schedBTable,
        emptyP(),
        ...schedBFooter,
        emptyP(),
        p('FLR 13.1 (May 1, 2021)', { alignment: AlignmentType.RIGHT }),
      ],
    }],
  });
}

module.exports = { build };
