/**
 * THE EMPLOYER APPLICATION - every question ABY's setup forms ask, as DATA (F-625, 09-29/30-2026).
 *
 * Eric, 09-29-2026: the employer application questions are "the next questions asked when someone
 * starts the process from their ABY quote", and "when they [want more than one line of coverage],
 * I'd like for it to ask the common questions only once." Then, 09-30: "build in the other apps for
 * the other lines of service."
 *
 * HOW "ONCE" IS DONE: every question names the FORMS that need it (`forms`). The page shows a
 * question when any form the employer is buying needs it, so a question several forms share is
 * asked one time and every form reads the same answer. Three layers are shared:
 *   - company and contacts ............ every form
 *   - broker + correspondence ......... with the contacts; officers + the owner's family in their own
 *                                        section (Eric, 09-30-2026: they are not "how your plans work")
 *   - plan.* (how your plans work) .... HRA, Medicare HRA, POP, FSA, ERISA - eligibility, exclusions,
 *                                        waiting period. The forms print these nearly word for word.
 *   - caf.* (your cafeteria plan) ..... POP and FSA - both describe the SAME Section 125 plan.
 *
 * WHERE THE QUESTIONS CAME FROM: ABY's own blank forms, read page by page -
 *   cobra = COBRA Employer Kit · hra = HRA Employer Application 12.2023 · mhra = Medicare HRA
 *   Enrollment Kit · pop = POP ER Enrollment Form · fsa = FSA Employer Application 1.2025 ·
 *   hsa = HSA Employer Setup Application · erisa = ERISA Compliant Wrap Document application ·
 *   f5500 = Welfare Benefit Plan Form 5500 data gathering (asked only with the White Glove package).
 * Where a form was broken (a question with no blank, "Other" with nowhere to say what), the question
 * here asks it properly. Where a form printed stale IRS limits, no figure is repeated here.
 *
 * NEVER ASKED HERE, ON PURPOSE: Social Security numbers, dates of birth, bank routing or account
 * numbers, direct-deposit (debit) authorizations, or the check-printing signatures some forms ask
 * for. The census and the bank details go through the secure upload (Eric: "I think those will need
 * to be sent securely"). The employer DOES sign the finished application, on the submit step, the
 * way they signed the authorization (Eric and Niels, 10-01-2026) - that is apply.js, not a question.
 *
 * `optional: true` marks a question that is never counted as "to go" or "still blank": the closing
 * free-text box is an invitation, not a gap.
 *
 * KEYS ARE PERMANENT once real answers exist. An answer is stored under its key, so renaming a key
 * orphans every saved answer. Change the words freely; add a new key rather than reuse an old one.
 * (The hra.* plan-administration keys became plan.* on 09-30-2026, when the only saved answers were
 * ABY's own test.)
 *
 * Loaded by the browser (window.ABY_APPLICATION) and by the server and checkers (module.exports).
 */
(function (root) {
  'use strict';

  var STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
    'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

  // Which setup form each quoted service uses. A product not listed here has no form yet; the page
  // says ABY will follow up separately rather than pretending there is nothing to do.
  var FORM_FOR_PRODUCT = {
    cobra: 'cobra',
    stateContinuation: 'cobra',
    hra: 'hra',
    ichra: 'hra',
    mpra: 'mhra',
    pop: 'pop',
    fsa: 'fsa',
    hsa: 'hsa',
    erisa: 'erisa'
  };

  // THE SHORT LABEL THE SIGNED RECORD STORES. The authorization page names each service by its
  // products.js `shortName` ("COBRA"), while the saved quote carries the full `name` - so matching
  // on the name alone found nothing on the first live signature (09-29-2026). A COPY of products.js,
  // kept honest by scripts/check_application_products.mjs, which fails the moment the two differ.
  var SHORT_NAME = {
    cobra: 'COBRA',
    stateContinuation: 'State Continuation',
    hra: 'HRA',
    ichra: 'ICHRA / QSEHRA',
    mpra: 'Medicare HRA',
    pop: 'POP / Cafeteria Plan',
    fsa: 'FSA / DCAP / LFSA',
    hsa: 'HSA',
    erisa: 'ERISA Wrap Document'
  };

  // A form that one PACKAGE of a product adds. The ERISA White Glove package includes the Form 5500
  // filing (products.js: "White Glove: Full SPD, Section 125 plan with POP/HSA testing, and Form 5500
  // filing"); the signed record carries the package after a colon: "ERISA Wrap Document: White Glove".
  function extraForms(productId, label) {
    if (productId === 'erisa' && /white glove/i.test(String(label || ''))) return ['f5500'];
    return [];
  }

  var FORMS = {
    cobra: { title: 'COBRA administration' },
    hra:   { title: 'Health Reimbursement Arrangement (HRA)', bank: true },
    mhra:  { title: 'Medicare HRA', bank: true },
    pop:   { title: 'Premium Only Plan (POP)' },
    fsa:   { title: 'Flexible Spending Account (FSA)', bank: true },
    hsa:   { title: 'Health Savings Account (HSA)', bank: true },
    erisa: { title: 'ERISA wrap document' },
    f5500: { title: 'Form 5500 filing' }
  };

  // The census spreadsheet each service needs, by PRODUCT (a CHOICE Arrangement's census carries the
  // contribution columns the plain HRA's does not). Files live in public/assets/forms/.
  var CENSUS_FOR_PRODUCT = {
    cobra: 'cobra', stateContinuation: 'cobra', hra: 'hra', mpra: 'hra', ichra: 'ichra', fsa: 'cdh'
  };
  var CENSUS = {
    cobra: { file: 'ABY-COBRA-census-template.xlsx', label: 'COBRA census spreadsheet' },
    hra:   { file: 'ABY-HRA-census-template.xlsx', label: 'HRA census spreadsheet' },
    ichra: { file: 'ABY-ICHRA-census-template.xlsx', label: 'CHOICE Arrangement / QSEHRA census spreadsheet' },
    cdh:   { file: 'ABY-FSA-census-template.xlsx', label: 'FSA census spreadsheet' }
  };

  var ALL = ['cobra', 'hra', 'mhra', 'pop', 'fsa', 'hsa', 'erisa', 'f5500'];
  var ORG = ['cobra', 'hra', 'mhra', 'pop', 'fsa', 'hsa', 'erisa'];
  var PLAN = ['hra', 'mhra', 'pop', 'fsa'];               // officers, broker, correspondence
  var ELIG = ['hra', 'mhra', 'pop', 'fsa', 'erisa'];      // eligibility, exclusions, waiting period
  var CAF = ['pop', 'fsa'];

  // `more` is merged into all four questions (a `show` condition, `optional: true`).
  function contact(prefix, who, forms, more) {
    return [
      { key: prefix + '.name',  label: who + ' - name',  type: 'text',  forms: forms },
      { key: prefix + '.title', label: 'Title',          type: 'text',  forms: forms, half: true },
      { key: prefix + '.email', label: 'Email',          type: 'email', forms: forms, half: true },
      { key: prefix + '.phone', label: 'Phone',          type: 'tel',   forms: forms, half: true }
    ].map(function (q) {
      Object.keys(more || {}).forEach(function (k) { q[k] = more[k]; });
      return q;
    });
  }

  // One COBRA benefit block (the form has room for 4 medical, dental, vision and 2 additional).
  function cobraBenefit(slot, heading, askName) {
    var on = { key: 'cobra.' + slot + '.offered', equals: true };
    var rated = { all: [on, { key: 'cobra.' + slot + '.ageRated', equals: false }] };
    var q = [];
    q.push({ key: 'cobra.' + slot + '.offered', label: heading, type: 'yesno', forms: ['cobra'], head: true,
      hint: slot === 'med1' ? 'Your main medical plan.' : '' });
    if (askName) q.push({ key: 'cobra.' + slot + '.name', label: 'Which benefit or plan is this?', type: 'text', forms: ['cobra'], show: on });
    q.push(
      { key: 'cobra.' + slot + '.ratesFrom', label: 'Rates in effect from', type: 'date', forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.ratesTo',   label: 'to', type: 'date', forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.ageRated', label: 'Is it individually or age rated?', type: 'yesno', forms: ['cobra'], show: on,
        hint: 'If yes, ABY will ask for a copy of the rate table instead of the four rates below.' },
      { key: 'cobra.' + slot + '.eo', label: 'Monthly rate - employee only',       type: 'money', forms: ['cobra'], show: rated, half: true,
        why: 'People on COBRA pay based on your current rates, so ABY needs them to bill correctly.' },
      { key: 'cobra.' + slot + '.es', label: 'Monthly rate - employee + spouse',   type: 'money', forms: ['cobra'], show: rated, half: true },
      { key: 'cobra.' + slot + '.ec', label: 'Monthly rate - employee + children', type: 'money', forms: ['cobra'], show: rated, half: true },
      { key: 'cobra.' + slot + '.ef', label: 'Monthly rate - employee + family',   type: 'money', forms: ['cobra'], show: rated, half: true },
      { key: 'cobra.' + slot + '.terminate', label: 'When someone leaves, coverage ends', type: 'choice', forms: ['cobra'], show: on,
        options: ['At the end of the month', 'On the date of termination'],
        why: 'It sets the day COBRA coverage has to pick up from, so there is no gap.' },
      { key: 'cobra.' + slot + '.carrier', label: 'Insurance carrier', type: 'text', forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.group',   label: 'Group number',      type: 'text', forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.carrierContact', label: 'Carrier contact ABY should work with', type: 'text', forms: ['cobra'], show: on,
        why: 'ABY sends COBRA enrollments, terminations and questions for this benefit to this person at the carrier.' },
      { key: 'cobra.' + slot + '.carrierPhone', label: 'Carrier contact phone', type: 'tel',   forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.carrierFax',   label: 'Carrier contact fax',   type: 'tel',   forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.carrierEmail', label: 'Carrier contact email', type: 'email', forms: ['cobra'], show: on }
    );
    return q;
  }

  // THE HRA AND THE MEDICARE HRA ARE ONE FORM WITH DIFFERENCES (read side by side, 09-30-2026): the
  // Medicare kit drops the "which kind of HRA" section, covers Medicare premiums, offers only the
  // employee and employee + spouse tiers, adds a $5 minimum and asks about a debit card.
  // (The minimum-reimbursement question itself was removed from every form on 10-01-2026 - Niels was
  // fine without it. Its keys, *.minReimb and *.minReimbOther, are retired: never reuse them.)
  function hraQuestions(p, form, medicare) {
    var F = [form];
    var capBy = { key: p + '.capType', equals: 'By coverage level' };
    var q = [];
    if (!medicare) {
      q.push({ key: p + '.type', label: 'Which kind of HRA?', type: 'multi', forms: F,
        options: ['Integrated HRA (with a group health plan)', 'CHOICE Arrangement (formerly ICHRA)', 'QSEHRA',
                  'Excepted benefit HRA', 'Medicare HRA'] });
    }
    q.push(
      { key: p + '.planNumber', label: 'Plan number', type: 'text', forms: F, half: true, hint: 'Leave blank if you do not know it.' },
      { key: p + '.originalEffective', label: 'Original effective date', type: 'date', forms: F, half: true },
      { key: p + '.planYearFrom', label: 'Plan year runs from (month and day)', type: 'md', forms: F, half: true },
      { key: p + '.planYearTo',   label: 'to', type: 'md', forms: F, half: true },
      { key: p + '.currentBegins', label: 'Current plan year begins', type: 'date', forms: F, half: true },
      { key: p + '.currentEnds',   label: 'Current plan year ends', type: 'date', forms: F, half: true },
      { key: p + '.firstYear', label: 'Is this the first plan year?', type: 'yesno', forms: F, half: true,
        hint: 'If this is an existing HRA, ABY will ask for your plan document and SPD.' },
      { key: p + '.shortYear', label: 'Is this a short plan year?', type: 'yesno', forms: F, half: true },
      { key: p + '.covered', label: 'What will the HRA pay for?', type: 'multi', forms: F,
        options: medicare
          ? ['Copays and prescriptions', 'Coinsurance', 'Individual health insurance premiums', 'Medicare premiums']
          : ['In-network expenses', 'Out-of-network expenses', 'Copays and prescriptions', 'Coinsurance', 'Over-the-counter items', 'Individual health insurance premiums'] },
      { key: p + '.linkedCarrier', label: 'If it is linked to a health plan, which carrier?', type: 'text', forms: F, half: true },
      { key: p + '.linkedPlan',    label: 'Plan name', type: 'text', forms: F, half: true },
      { key: p + '.payFirst', label: 'If you offer both an HRA and an FSA, which should pay first?', type: 'choice', forms: F, options: ['HRA', 'FSA', 'We do not offer an FSA'],
        why: 'When an expense could be paid from either account, this decides which one pays first.' },
      { key: p + '.capType', label: 'Reimbursement cap', type: 'choice', forms: F, options: ['One flat amount', 'By coverage level'] },
      { key: p + '.capFlat', label: 'Flat amount', type: 'money', forms: F, show: { key: p + '.capType', equals: 'One flat amount' } },
      { key: p + '.capEO', label: 'Employee only',        type: 'money', forms: F, half: true, show: capBy },
      { key: p + '.capES', label: 'Employee + spouse',    type: 'money', forms: F, half: true, show: capBy }
    );
    if (!medicare) {
      q.push(
        { key: p + '.capEC', label: 'Employee + children', type: 'money', forms: F, half: true, show: capBy },
        { key: p + '.capEF', label: 'Employee + family',   type: 'money', forms: F, half: true, show: capBy }
      );
    }
    q.push(
      { key: p + '.howReimburse', label: 'How will the HRA reimburse?', type: 'textarea', forms: F,
        hint: medicare
          ? "For example: up to $1,500 a year toward an employee's Medicare premiums. Or: up to 100% of the Medicare premium each month."
          : 'For example: $1,000 a year for employee-only coverage after the first $1,500 of in-network deductible. Or: up to $325 a month toward an individually purchased premium.' },
      { key: p + '.carryover', label: "Should employees' unused HRA dollars carry over to the next plan year?", type: 'yesno', forms: F },
      { key: p + '.carryoverPct', label: 'Carry over this percentage', type: 'number', forms: F, third: true, show: { key: p + '.carryover', equals: true } },
      { key: p + '.carryoverAmt', label: 'or this amount', type: 'money', forms: F, third: true, show: { key: p + '.carryover', equals: true } },
      { key: p + '.carryoverMax', label: 'Not to exceed', type: 'money', forms: F, third: true, show: { key: p + '.carryover', equals: true } },
      { key: p + '.calendarDeductible', label: 'Should the plan line up with the calendar-year deductible?', type: 'yesno', forms: F },
      { key: p + '.midYear', label: 'If the plan starts mid-year, how should the benefit pay out?', type: 'choice', forms: F,
        options: ['100% of the benefit', 'Pro-rated'] },
      { key: p + '.runout', label: 'Run-out period', type: 'choice', forms: F, options: ['60 days', '90 days', 'Other'],
        hint: 'How long after the plan year ends employees can still submit claims from that year.' },
      { key: p + '.runoutOther', label: 'Run-out period (days)', type: 'number', forms: F, show: { key: p + '.runout', equals: 'Other' } },
      { key: p + '.fromEmployerAccount', label: 'Should ABY issue reimbursements (checks or direct deposit) from your company account?', type: 'yesno', forms: F,
        hint: 'If yes, ABY needs your bank details and a signature for printing checks. Those go through the secure upload, never on this page. There is an additional charge of $5 per check printed.' },
      { key: p + '.checksTo', label: 'Checks should be', type: 'choice', forms: F, options: ['Sent to the employee', 'Sent to the employer for signature'],
        show: { key: p + '.fromEmployerAccount', equals: true } }
    );
    if (medicare) {
      q.push({ key: p + '.debitCard', label: 'Do you want to offer employees a debit card for the HRA?', type: 'yesno', forms: F });
    }
    return q;
  }

  var planHas = function (value) { return { key: 'plan.eligible', includes: value }; };
  var planExcl = function (value) { return { key: 'plan.excluded', includes: value }; };
  var fsaLine = function (value) { return { key: 'fsa.lines', includes: value }; };
  var erisaBen = function (value) { return { key: 'erisa.benefits', includes: value }; };
  var LOOKBACK = { key: 'erisa.varHour', equals: 'Yes, and we use the look-back measurement method' };

  var HEALTH_FSA = ['Health FSA - general purpose', 'Health FSA - limited purpose (dental and vision)'];
  var ERISA_BENEFITS = ['Medical', 'Dental', 'Vision', 'Short-term disability', 'Long-term disability',
    'Group term life insurance', 'AD&D', 'Employee assistance program (EAP)', 'Health reimbursement arrangement (HRA)',
    'Wellness program', 'Health savings account (HSA)', 'Health FSA', 'Dependent care FSA', 'Other'];

  var SECTIONS = [
    {
      id: 'company',
      title: 'About your company',
      intro: '',
      questions: [
        { key: 'co.legalName', label: 'Legal name', type: 'text', forms: ALL, required: true,
          hint: 'As it appears on your tax returns and as it should appear on documents.',
          why: "ABY's documents and notices use the name exactly as you write it here, so it should match your tax returns." },
        { key: 'co.street', label: 'Physical street address', type: 'text', forms: ALL },
        { key: 'co.city',   label: 'City',  type: 'text',  forms: ALL, third: true },
        { key: 'co.state',  label: 'State', type: 'state', forms: ALL, third: true },
        { key: 'co.zip',    label: 'ZIP',   type: 'text',  forms: ALL, third: true },
        { key: 'co.mailingSame', label: 'Is the mailing address the same?', type: 'yesno', forms: ['cobra', 'hsa'] },
        { key: 'co.mailStreet', label: 'Mailing street address', type: 'text',  forms: ['cobra', 'hsa'], show: { key: 'co.mailingSame', equals: false } },
        { key: 'co.mailCity',   label: 'City',  type: 'text',  forms: ['cobra', 'hsa'], third: true, show: { key: 'co.mailingSame', equals: false } },
        { key: 'co.mailState',  label: 'State', type: 'state', forms: ['cobra', 'hsa'], third: true, show: { key: 'co.mailingSame', equals: false } },
        { key: 'co.mailZip',    label: 'ZIP',   type: 'text',  forms: ['cobra', 'hsa'], third: true, show: { key: 'co.mailingSame', equals: false } },
        { key: 'co.ein', label: 'Federal employer tax ID (EIN)', type: 'ein', forms: ALL, required: true, half: true,
          why: "Your plan documents and ABY's records identify the company by its EIN." },
        { key: 'co.incorporated', label: 'Date incorporated or organized', type: 'date', forms: ORG, half: true },
        { key: 'co.lawsState', label: 'State whose laws the company operates under', type: 'state', forms: ORG, half: true },
        { key: 'co.orgType', label: 'Type of organization', type: 'choice', forms: ORG,
          options: ['C corporation', 'S corporation', 'Partnership', 'Limited liability company (LLC)',
                    'Sole proprietorship', 'Government or municipality', 'Not-for-profit (school or church)'],
          hint: 'Sole proprietors, partners and more-than-2% shareholders of an S corporation cannot take part in a cafeteria plan or an HRA themselves.' },
        { key: 'co.business', label: 'Nature of the business', type: 'text', forms: ['cobra', 'hra', 'mhra', 'pop', 'fsa', 'hsa'] },
        { key: 'co.employees', label: 'Number of employees', type: 'number', forms: ['hra', 'mhra', 'pop', 'fsa', 'erisa'], half: true },
        { key: 'co.eligibleEmployees', label: 'Number of eligible employees', type: 'number', forms: ['hra', 'mhra', 'pop', 'fsa'], half: true },
        { key: 'co.phone',   label: 'Company phone', type: 'tel',  forms: ['hra', 'mhra', 'pop', 'fsa', 'f5500'], half: true },
        { key: 'co.fax',     label: 'Company fax',   type: 'tel',  forms: ['hra', 'mhra', 'pop', 'fsa'], half: true },
        { key: 'co.website', label: 'Website',       type: 'text', forms: ['hra', 'mhra', 'pop', 'fsa'] },
        { key: 'co.relatedEins', label: 'Related companies (a controlled group): name and EIN of each', type: 'list', max: 4,
          forms: ['hra', 'mhra', 'pop', 'fsa', 'erisa', 'f5500'], hint: 'Leave blank if there are none.',
          why: 'Companies under common ownership can count as one employer under the tax rules, so ABY needs to know about them when setting up the plan.' }
      ]
    },
    {
      id: 'contacts',
      title: 'Who ABY should work with',
      intro: 'Leave a contact blank if it is the same person as the one above it. The additional contact is optional.',
      questions: []
        .concat(contact('contact.signer', 'Authorized signer', ALL))
        .concat(contact('contact.hr', 'HR / payroll / plan contact', ORG))
        // Niels, 10-01-2026: billing is often the HR contact, so one tick saves typing them twice.
        // Ticked, the billing questions disappear and ABY uses the HR contact's details.
        .concat([{ key: 'contact.billingSameAsHr', label: 'The billing contact is the same as the HR / payroll contact', type: 'check',
          forms: ['cobra', 'hsa'], optional: true, head: true }])
        .concat(contact('contact.billing', 'Billing / accounts payable contact', ['cobra', 'hsa'],
          { show: { key: 'contact.billingSameAsHr', notEquals: true } }))
        // Eric, 10-01-2026: make it clear the third contact is optional.
        .concat(contact('contact.other', 'Additional contact (optional)', ['cobra', 'hsa'], { optional: true }))
        .concat(contact('contact.legal', 'Legal representative (if any)', ['erisa'], { optional: true }))
        .concat([
        { key: 'plan.broker.office',  label: "Broker's office", type: 'text',  forms: PLAN, half: true, head: true },
        { key: 'plan.broker.contact', label: 'Broker contact',  type: 'text',  forms: PLAN, half: true },
        { key: 'plan.broker.email',   label: 'Broker email',    type: 'email', forms: PLAN, half: true },
        { key: 'plan.broker.phone',   label: 'Broker phone',    type: 'tel',   forms: PLAN, half: true },
        { key: 'plan.correspondTo', label: 'Questions and correspondence should go to', type: 'choice', forms: PLAN,
          options: ['Your company contact', 'The broker'] },
        { key: 'plan.copyBroker', label: 'Should the broker be copied on all written correspondence?', type: 'yesno', forms: PLAN },
          { key: 'co.adminStart', label: 'Start date of administration', type: 'date', forms: ['cobra', 'hsa'],
            why: 'The date ABY takes over. Anything that happens before it stays with whoever handled it before.' }
        ])
    },
    {
      id: 'officers',
      title: 'Company officers and family members',
      intro: 'Plans treat owners and their families differently, so ABY needs to know who they are.',
      questions: [
        { key: 'plan.officers.president', label: 'President', type: 'text', forms: PLAN, half: true },
        { key: 'plan.officers.vp',        label: 'Vice president', type: 'text', forms: PLAN, half: true },
        { key: 'plan.officers.cfo',       label: 'CFO', type: 'text', forms: PLAN, half: true },
        { key: 'plan.officers.ceo',       label: 'CEO', type: 'text', forms: PLAN, half: true },
        { key: 'plan.officers.other',     label: 'Other officers', type: 'text', forms: PLAN },
        { key: 'plan.ineligibleFamily', label: 'Employee spouses or immediate family of the owner who are not eligible', type: 'textarea', forms: PLAN,
          hint: 'Names, if any.' }
      ]
    },
    {
      id: 'plan',
      title: 'How your plans work',
      intro: 'Who can join your plans, and when.',
      questions: [

        { key: 'plan.eligible', label: 'Which employees are eligible?', type: 'multi', forms: ELIG,
          options: ['All', 'Salaried employees only', 'Hourly employees only', 'Full-time employees', 'Part-time employees', 'Other'],
          hint: 'Rules that favor highly compensated employees can bring tax penalties. Check with your advisor before limiting who can take part.' },
        { key: 'plan.ftHours', label: 'Full-time means scheduled to work at least this many hours a week', type: 'number', forms: ELIG, show: planHas('Full-time employees') },
        { key: 'plan.ptHours', label: 'Part-time means scheduled to work at least this many hours a week', type: 'number', forms: ELIG, show: planHas('Part-time employees') },
        { key: 'plan.eligibleOther', label: 'Other eligible class', type: 'text', forms: ELIG, show: planHas('Other') },
        { key: 'plan.excluded', label: 'Who is excluded?', type: 'multi', forms: ELIG,
          options: ['No exclusions', 'Part-time employees', 'Non-resident aliens', 'Employees under a certain age', 'Seasonal', 'Union employees', 'Contract', 'Other'] },
        { key: 'plan.excludedAge', label: 'Employees under what age are excluded?', type: 'number', forms: ELIG, show: planExcl('Employees under a certain age') },
        { key: 'plan.unionHours', label: 'Union employees scheduled to work at least this many hours a week', type: 'number', forms: ELIG, show: planExcl('Union employees') },
        { key: 'plan.excludedOther', label: 'Other excluded class', type: 'text', forms: ELIG, show: planExcl('Other') },
        { key: 'plan.waiting', label: 'Waiting period before a new employee is eligible', type: 'choice', forms: ELIG,
          options: ['As of the date of hire', 'First of the month following a number of days', 'A number of months after the date of hire', 'A number of days after the date of hire'] },
        { key: 'plan.waitingNumber', label: 'How many?', type: 'number', forms: ELIG,
          show: { key: 'plan.waiting', oneOf: ['First of the month following a number of days', 'A number of months after the date of hire', 'A number of days after the date of hire'] } },
        { key: 'plan.sameForAll', label: 'Do these eligibility rules apply the same way to every plan ABY is setting up?', type: 'yesno', forms: ELIG,
          hint: 'For example, a premium-only plan might cover everyone while an HRA covers only people on the medical plan.' },
        { key: 'plan.differences', label: 'How do the rules differ, plan by plan?', type: 'textarea', forms: ELIG, show: { key: 'plan.sameForAll', equals: false } }
      ]
    },
    {
      id: 'caf',
      title: 'Your cafeteria (Section 125) plan',
      intro: '',
      questions: [
        { key: 'caf.planNumber', label: 'Plan number', type: 'text', forms: CAF, half: true, hint: 'Leave blank if you do not know it.' },
        { key: 'caf.originalEffective', label: 'Original effective date', type: 'date', forms: CAF, half: true },
        { key: 'caf.planYearFrom', label: 'Plan year runs from (month and day)', type: 'md', forms: CAF, half: true },
        { key: 'caf.planYearTo',   label: 'to', type: 'md', forms: CAF, half: true },
        { key: 'caf.currentBegins', label: 'Current plan year begins', type: 'date', forms: CAF, half: true },
        { key: 'caf.currentEnds',   label: 'Current plan year ends', type: 'date', forms: CAF, half: true },
        { key: 'caf.firstYear', label: 'Is this your first plan year?', type: 'yesno', forms: CAF, half: true,
          hint: 'If this is an existing cafeteria plan, ABY will ask for your plan document, your SPD and a list of your ERISA welfare plan names and numbers.' },
        { key: 'caf.shortYear', label: 'Is this a short plan year?', type: 'yesno', forms: CAF, half: true },
        { key: 'caf.pretax', label: 'Which employee premiums or contributions should be paid pre-tax through the plan?', type: 'multi', forms: CAF,
          options: ['Major medical insurance', 'Health savings account (HSA) contributions', 'Dental insurance', 'Vision insurance', 'AD&D',
                    'Prescription plan', 'Adoption assistance plan', 'Employee assistance plan', 'Group term life',
                    'Short and/or long-term disability', 'Health FSA', 'Dependent care FSA', 'Other'],
          hint: "Include the employee's share of the premium for their dependents." },
        { key: 'caf.pretaxOther', label: 'Other benefit paid pre-tax', type: 'text', forms: CAF, show: { key: 'caf.pretax', includes: 'Other' } }
      ]
    },
    {
      id: 'cobra',
      form: 'cobra',
      title: 'COBRA administration',
      intro: 'The current rates for each benefit that COBRA applies to, and the carrier contact ABY will send COBRA enrollments and terminations to.',
      questions: [
        { key: 'cobra.funding', label: 'Your plans are', type: 'choice', forms: ['cobra'],
          options: ['Fully insured', 'Self-insured', 'Level funded'],
          why: 'How your plan is funded changes which rules apply and who ABY works with on COBRA.' },
        { key: 'cobra.stateCont', label: 'Is there state continuation after COBRA runs out?', type: 'yesno', forms: ['cobra'], half: true,
          why: 'Some states let people keep coverage for a while after federal COBRA ends. ABY needs to know whether that applies to your plan.' },
        { key: 'cobra.stateContState', label: 'Which state?', type: 'state', forms: ['cobra'], half: true,
          show: { key: 'cobra.stateCont', equals: true } },
        { key: 'cobra.initialNotice', label: 'Should ABY send the initial COBRA rights notice to your current employees?', type: 'yesno', forms: ['cobra'],
          why: 'ABY can send the notice that explains COBRA rights to the employees already on your plan. Answer no if they have already received it.' }
      ]
        .concat(cobraBenefit('med1', 'Medical plan 1', true))
        .concat(cobraBenefit('med2', 'Do you offer a second medical plan?', true))
        .concat(cobraBenefit('med3', 'A third medical plan?', true))
        .concat(cobraBenefit('med4', 'A fourth medical plan?', true))
        .concat(cobraBenefit('dental', 'Do you offer dental?', false))
        .concat(cobraBenefit('vision', 'Do you offer vision?', false))
        .concat(cobraBenefit('add1', 'Any other benefit COBRA applies to (for example an EAP)?', true))
        .concat(cobraBenefit('add2', 'Another one?', true))
        .concat([
          { key: 'cobra.hasFsa', label: 'Do you offer a health FSA?', type: 'yesno', forms: ['cobra'], head: true },
          { key: 'cobra.fsaPlanYear', label: 'FSA plan year', type: 'text', forms: ['cobra'], half: true,
            show: { key: 'cobra.hasFsa', equals: true }, hint: 'For example January 1 to December 31.' },
          { key: 'cobra.fsaEffective', label: 'FSA effective date', type: 'date', forms: ['cobra'], half: true,
            show: { key: 'cobra.hasFsa', equals: true } },
          { key: 'cobra.fsaCarryover', label: 'Is the FSA carryover used for COBRA eligibility?', type: 'yesno', forms: ['cobra'],
            show: { key: 'cobra.hasFsa', equals: true } },
          // Answered by the HRA section instead when they are buying the HRA too - asked once.
          { key: 'cobra.hasHra', label: 'Do you offer an HRA?', type: 'yesno', forms: ['cobra'], unlessForm: 'hra' },
          { key: 'cobra.hraDesign', label: 'Describe the HRA plan design', type: 'textarea', forms: ['cobra'], unlessForm: 'hra',
            show: { key: 'cobra.hasHra', equals: true },
            hint: 'ABY works out the COBRA "premium" for the HRA and includes it with the related medical plan.' }
        ])
    },
    {
      id: 'hra',
      form: 'hra',
      title: 'Health Reimbursement Arrangement (HRA)',
      intro: 'How the HRA works: what it pays for, how much, and how reimbursements are paid.',
      secureNote: true,
      questions: hraQuestions('hra', 'hra', false)
    },
    {
      id: 'mhra',
      form: 'mhra',
      title: 'Medicare HRA',
      intro: 'How the Medicare HRA works: what it pays for, how much, and how reimbursements are paid.',
      secureNote: true,
      questions: hraQuestions('mhra', 'mhra', true)
    },
    {
      id: 'fsa',
      form: 'fsa',
      title: 'Flexible Spending Account (FSA)',
      intro: 'Which accounts you are offering, their limits, and how claims are paid.',
      secureNote: true,
      questions: [
        { key: 'fsa.lines', label: 'Which accounts are you offering?', type: 'multi', forms: ['fsa'],
          options: HEALTH_FSA.concat(['Dependent care FSA', 'Parking reimbursement', 'Transit reimbursement']) },
        { key: 'fsa.medMax', label: 'Health FSA annual maximum', type: 'money', forms: ['fsa'], half: true,
          show: { key: 'fsa.lines', includesAny: HEALTH_FSA },
          hint: 'The most an employee can put in for the year. The IRS sets a ceiling each year; ABY can confirm the current one.' },
        { key: 'fsa.dcMax', label: 'Dependent care FSA annual maximum', type: 'money', forms: ['fsa'], half: true, show: fsaLine('Dependent care FSA') },
        { key: 'fsa.transitMax', label: 'Transit annual maximum', type: 'money', forms: ['fsa'], half: true, show: fsaLine('Transit reimbursement') },
        { key: 'fsa.parkMax', label: 'Parking annual maximum', type: 'money', forms: ['fsa'], half: true, show: fsaLine('Parking reimbursement') },
        { key: 'fsa.flexCredits', label: 'Do you offer flex credits (employer money employees can spend in the plan)?', type: 'yesno', forms: ['fsa'], head: true },
        { key: 'fsa.flexCash', label: 'Can employees opt out and take the flex credits as taxable cash?', type: 'yesno', forms: ['fsa'], show: { key: 'fsa.flexCredits', equals: true } },
        { key: 'fsa.grace', label: 'Do you want to offer a 2.5-month grace period?', type: 'multi', forms: ['fsa'],
          options: ['Yes, for the health FSA', 'Yes, for the dependent care FSA'],
          hint: 'Leave both unchecked for no grace period. For the health FSA you can offer a grace period or a carryover, not both.' },
        { key: 'fsa.carryover', label: 'For the health FSA, do you want to allow the carryover?', type: 'yesno', forms: ['fsa'],
          show: { key: 'fsa.lines', includesAny: HEALTH_FSA },
          hint: 'If you choose yes, ABY raises the carryover each year to the IRS maximum. Carried-over money is available after the run-out period ends.' },
        { key: 'fsa.runMedActive', label: 'Health FSA run-out period for active employees', type: 'choice', forms: ['fsa'], half: true,
          options: ['0 days', '30 days', '60 days'], show: { key: 'fsa.lines', includesAny: HEALTH_FSA },
          hint: 'How long after the plan year ends employees can still submit claims from that year. With a carryover, ABY suggests 30 days.' },
        { key: 'fsa.runMedTerm', label: 'Health FSA run-out period after someone leaves', type: 'choice', forms: ['fsa'], half: true,
          options: ['0 days', '30 days', '60 days'], show: { key: 'fsa.lines', includesAny: HEALTH_FSA } },
        { key: 'fsa.runDcActive', label: 'Dependent care FSA run-out period for active employees', type: 'choice', forms: ['fsa'], half: true,
          options: ['0 days', '30 days', '60 days'], show: fsaLine('Dependent care FSA') },
        { key: 'fsa.runDcTerm', label: 'Dependent care FSA run-out period after someone leaves', type: 'choice', forms: ['fsa'], half: true,
          options: ['0 days', '30 days', '60 days'], show: fsaLine('Dependent care FSA') },
        { key: 'fsa.abyIssues', label: 'Should ABY issue employee reimbursements?', type: 'yesno', forms: ['fsa'], head: true },
        { key: 'fsa.issueHow', label: 'How?', type: 'multi', forms: ['fsa'], options: ['By check', 'By direct deposit'],
          show: { key: 'fsa.abyIssues', equals: true },
          hint: 'Checks cost an additional $5 each. ABY will need your bank details and a signature for printing checks, sent through the secure upload.' },
        { key: 'fsa.checksTo', label: 'Checks should be', type: 'choice', forms: ['fsa'], options: ['Sent to the employee', 'Sent to the employer for signature'],
          show: { key: 'fsa.issueHow', includes: 'By check' } },
        { key: 'fsa.debitCard', label: 'Do you want to offer employees a debit card for the FSA?', type: 'yesno', forms: ['fsa'] },
        { key: 'fsa.processFreq', label: 'How often should claims be processed?', type: 'choice', forms: ['fsa'], half: true,
          options: ['Weekly', 'Every two weeks', 'Twice a month', 'Monthly'] },
        { key: 'fsa.processDay', label: 'Day of the week or date(s)', type: 'text', forms: ['fsa'], half: true },
        { key: 'fsa.samePay', label: 'Are all employees paid on the same pay schedule?', type: 'yesno', forms: ['fsa'], head: true },
        { key: 'fsa.payFreq', label: 'How are employees paid? (check all that apply)', type: 'multi', forms: ['fsa'],
          options: ['Weekly (52)', 'Every two weeks (26)', 'Twice a month (24)', 'Monthly (12)'] },
        { key: 'fsa.firstPayWeekly', label: 'Weekly: first pay date after the effective date', type: 'date', forms: ['fsa'], half: true, show: { key: 'fsa.payFreq', includes: 'Weekly (52)' } },
        { key: 'fsa.firstPayBiweekly', label: 'Every two weeks: first pay date after the effective date', type: 'date', forms: ['fsa'], half: true, show: { key: 'fsa.payFreq', includes: 'Every two weeks (26)' } },
        { key: 'fsa.firstPaySemi', label: 'Twice a month: first pay date after the effective date', type: 'date', forms: ['fsa'], half: true, show: { key: 'fsa.payFreq', includes: 'Twice a month (24)' } },
        { key: 'fsa.firstPayMonthly', label: 'Monthly: first pay date after the effective date', type: 'date', forms: ['fsa'], half: true, show: { key: 'fsa.payFreq', includes: 'Monthly (12)' } },
        { key: 'fsa.monthlyWhen', label: 'Monthly payroll is paid on', type: 'choice', forms: ['fsa'], options: ['The 15th of each month', 'The last day of each month'],
          show: { key: 'fsa.payFreq', includes: 'Monthly (12)' } }
      ]
    },
    {
      id: 'hsa',
      form: 'hsa',
      title: 'Health Savings Account (HSA)',
      intro: 'The HSA-compatible medical plans, and how contributions reach the accounts.',
      secureNote: true,
      questions: [
        { key: 'hsa.med1.name', label: 'HSA-compatible medical plan', type: 'text', forms: ['hsa'] },
        { key: 'hsa.med1.from', label: 'Rate period from', type: 'date', forms: ['hsa'], half: true },
        { key: 'hsa.med1.to',   label: 'to', type: 'date', forms: ['hsa'], half: true },
        { key: 'hsa.med1.terminate', label: 'When someone leaves, coverage ends', type: 'choice', forms: ['hsa'], options: ['At the end of the month', 'On the date of termination'] },
        { key: 'hsa.med2.offered', label: 'Is there a second HSA-compatible medical plan?', type: 'yesno', forms: ['hsa'], head: true },
        { key: 'hsa.med2.name', label: 'Second plan', type: 'text', forms: ['hsa'], show: { key: 'hsa.med2.offered', equals: true } },
        { key: 'hsa.med2.from', label: 'Rate period from', type: 'date', forms: ['hsa'], half: true, show: { key: 'hsa.med2.offered', equals: true } },
        { key: 'hsa.med2.to',   label: 'to', type: 'date', forms: ['hsa'], half: true, show: { key: 'hsa.med2.offered', equals: true } },
        { key: 'hsa.med2.terminate', label: 'When someone leaves, coverage ends', type: 'choice', forms: ['hsa'], options: ['At the end of the month', 'On the date of termination'],
          show: { key: 'hsa.med2.offered', equals: true } },
        { key: 'hsa.contribBy', label: 'Who contributes to the accounts?', type: 'multi', forms: ['hsa'], options: ['The employer', 'Employees, through payroll'], head: true },
        { key: 'hsa.funding', label: 'How should contributions reach the accounts?', type: 'choice', forms: ['hsa'],
          options: ['Option 1 (preferred): direct deposit through your payroll. ABY gives you the account numbers once the accounts open.',
                    'Option 2: you upload a contribution file each payroll and ABY draws the money from your account.'],
          // 10-06-2026, ABY's request via Eric: "upload a file instead of sending it to ABY". A saved answer IS the
          // option's text, so an employer who picked option 2 before the change still shows it picked (apply.js).
          formerly: { 'Option 2: you send ABY a contribution file each payroll and ABY draws the money from your account.':
                      'Option 2: you upload a contribution file each payroll and ABY draws the money from your account.' },
          hint: 'With option 2, ABY needs your bank details and a signed debit authorization. Those go through the secure upload, never on this page.' }
      ]
    },
    {
      id: 'erisa',
      form: 'erisa',
      title: 'ERISA wrap document',
      intro: 'What goes into your wrap document: the plan, the benefits it covers, and how people join, take leave and leave.',
      questions: [
        { key: 'erisa.planNumber', label: 'Plan number', type: 'text', forms: ['erisa'], half: true, hint: 'Usually three digits, such as 501. Leave blank if you do not know it.' },
        { key: 'erisa.firstYear', label: 'Is this the first plan year?', type: 'yesno', forms: ['erisa'], half: true },
        { key: 'erisa.calendarYear', label: 'Does the plan run on the calendar year?', type: 'yesno', forms: ['erisa'], half: true },
        { key: 'erisa.amending', label: 'Amending the plan effective on', type: 'date', forms: ['erisa'], half: true, show: { key: 'erisa.firstYear', equals: false } },
        { key: 'erisa.effFrom', label: 'Plan effective from', type: 'date', forms: ['erisa'], half: true },
        { key: 'erisa.effTo',   label: 'to', type: 'date', forms: ['erisa'], half: true },
        { key: 'erisa.rehire', label: 'If an employee is rehired, they get the same benefits back if they return within', type: 'choice', forms: ['erisa'],
          options: ['30 days', '60 days', '90 days', 'Not applicable: rehired employees are treated as new employees'] },
        { key: 'erisa.multiClass', label: 'Do different groups of employees have different eligibility rules?', type: 'yesno', forms: ['erisa'] },
        { key: 'erisa.classes', label: 'Describe each group and its waiting period', type: 'textarea', forms: ['erisa'], show: { key: 'erisa.multiClass', equals: true },
          hint: 'For example: Class 1, full-time office staff, first of the month after 30 days. Class 2, drivers, first of the month after 60 days.' },

        { key: 'erisa.benefits', label: 'Which benefits does the plan include?', type: 'multi', forms: ['erisa'], options: ERISA_BENEFITS, head: true },
        { key: 'erisa.benefitsOther', label: 'Other benefits', type: 'text', forms: ['erisa'], show: erisaBen('Other') },
        { key: 'erisa.grandfathered', label: 'Is the medical plan grandfathered?', type: 'yesno', forms: ['erisa'], show: erisaBen('Medical') },
        { key: 'erisa.selfInsured', label: 'Which of these are self-insured?', type: 'multi', forms: ['erisa'], options: ERISA_BENEFITS,
          hint: 'Leave all unchecked if everything is insured. If a plan is level funded, check it here and say so in the carriers box below.' },
        { key: 'erisa.hipaa', label: 'HIPAA special enrollment rights (gaining a dependent or losing other coverage) apply to', type: 'multi', forms: ['erisa'],
          options: ['Medical', 'Dental', 'Vision', 'Employee assistance program (EAP)', 'Health reimbursement arrangement (HRA)', 'Wellness program', 'Health FSA', 'Dependent care FSA'] },
        { key: 'erisa.cobraOffered', label: 'Under COBRA, these benefits will be offered', type: 'multi', forms: ['erisa'],
          options: ['Medical', 'Dental', 'Vision', 'Employee assistance program (EAP)', 'Health reimbursement arrangement (HRA)', 'Wellness program', 'Health FSA'] },
        { key: 'erisa.carriers', label: 'For each benefit: the carrier, plan name and group number', type: 'textarea', forms: ['erisa'],
          hint: 'One benefit per line, for example: Medical - Blue Cross Blue Shield of Texas - Blue Choice PPO - group 123456.' },
        { key: 'erisa.claimsAdmin', label: 'If any benefit is self-insured, does an outside claims administrator pay claims?', type: 'choice', forms: ['erisa'],
          options: ['Not applicable: nothing is self-insured', 'Yes', 'No, there is no outside administrator'] },
        { key: 'erisa.claimsAdminName', label: 'Claims administrator', type: 'text', forms: ['erisa'], show: { key: 'erisa.claimsAdmin', equals: 'Yes' } },
        { key: 'erisa.claimsFiduciary', label: 'Does the claims administrator make final decisions on claims (a named fiduciary for claims)?', type: 'yesno', forms: ['erisa'],
          show: { key: 'erisa.claimsAdmin', equals: 'Yes' } },

        { key: 'erisa.fmla', label: 'During FMLA leave, which benefits continue?', type: 'choice', forms: ['erisa'], head: true,
          options: ['All benefits', 'Medical and some other benefits', 'Only medical', 'Not applicable: FMLA does not apply to us'] },
        { key: 'erisa.fmlaWhich', label: 'Which other benefits continue during FMLA leave?', type: 'text', forms: ['erisa'], show: { key: 'erisa.fmla', equals: 'Medical and some other benefits' } },
        { key: 'erisa.fmlaPay', label: 'If contributions are required during FMLA leave, the employee pays them', type: 'multi', forms: ['erisa'],
          options: ['Before leave begins', 'During leave', 'After leave, when they return'] },
        { key: 'erisa.otherLeave', label: 'During other approved leaves of absence, which benefits continue?', type: 'choice', forms: ['erisa'],
          options: ['All benefits', 'Medical and some other benefits', 'Only medical', 'None: the employee is treated as terminated'] },
        { key: 'erisa.otherLeaveWhich', label: 'Which other benefits continue during other leaves?', type: 'text', forms: ['erisa'], show: { key: 'erisa.otherLeave', equals: 'Medical and some other benefits' } },
        { key: 'erisa.otherLeavePay', label: 'If contributions are required during other leaves, the employee pays them', type: 'multi', forms: ['erisa'],
          options: ['Before leave begins', 'During leave', 'After leave, when they return'] },

        { key: 'erisa.termEvents', label: "Which events end someone's participation?", type: 'multi', forms: ['erisa'], head: true,
          options: ['Termination of employment', 'Transfer to a group that is not eligible', 'Reduction of work hours', 'Losing eligibility for the medical plan', 'Submitting false claims', 'Other'] },
        { key: 'erisa.termEventsOther', label: 'Other event', type: 'text', forms: ['erisa'], show: { key: 'erisa.termEvents', includes: 'Other' } },
        { key: 'erisa.termMDV', label: 'When someone leaves, medical, dental and vision end', type: 'choice', forms: ['erisa'], half: true,
          options: ['At termination', 'At the end of the month after termination', 'Other'] },
        { key: 'erisa.termMDVOther', label: 'Describe', type: 'text', forms: ['erisa'], half: true, show: { key: 'erisa.termMDV', equals: 'Other' } },
        { key: 'erisa.termRest', label: 'When someone leaves, all other coverage ends', type: 'choice', forms: ['erisa'], half: true,
          options: ['At termination', 'At the end of the month after termination', 'Other'] },
        { key: 'erisa.termRestOther', label: 'Describe', type: 'text', forms: ['erisa'], half: true, show: { key: 'erisa.termRest', equals: 'Other' } },
        { key: 'erisa.cobraElection', label: 'When someone elects COBRA, is it one election for all benefits?', type: 'choice', forms: ['erisa'],
          options: ['Yes, one election for all benefits', 'No, a separate election for each benefit'] },

        { key: 'erisa.planAdmin', label: 'Who is the plan administrator?', type: 'choice', forms: ['erisa'], head: true,
          options: ['The company sponsoring the plan', 'An individual', 'A committee appointed by the company', 'Other'] },
        { key: 'erisa.planAdminName', label: 'Name and title', type: 'text', forms: ['erisa'],
          show: { key: 'erisa.planAdmin', oneOf: ['An individual', 'Other'] } },
        { key: 'erisa.namedFiduciary', label: 'Who is the named fiduciary?', type: 'choice', forms: ['erisa'],
          options: ['The company sponsoring the plan', 'The plan administrator', 'Other'] },
        { key: 'erisa.namedFiduciaryName', label: 'Name and title', type: 'text', forms: ['erisa'], show: { key: 'erisa.namedFiduciary', equals: 'Other' } },
        { key: 'erisa.selfFundedFiduciary', label: 'For any self-funded benefits, who is the named fiduciary?', type: 'choice', forms: ['erisa'],
          options: ['The company sponsoring the plan', 'The plan administrator', 'Other', 'Not applicable: nothing is self-funded'] },
        { key: 'erisa.selfFundedFiduciaryName', label: 'Name and title', type: 'text', forms: ['erisa'], show: { key: 'erisa.selfFundedFiduciary', equals: 'Other' } },

        { key: 'erisa.varHour', label: 'Do you have variable-hour employees?', type: 'choice', forms: ['erisa'], head: true,
          options: ['No', 'Yes, and we decide who is full-time month by month', 'Yes, and we use the look-back measurement method'] },
        { key: 'erisa.initMeasure', label: 'New employees: initial measurement period (months)', type: 'number', forms: ['erisa'], third: true, show: LOOKBACK },
        { key: 'erisa.initStability', label: 'Initial stability period (months)', type: 'number', forms: ['erisa'], third: true, show: LOOKBACK },
        { key: 'erisa.initAdmin', label: 'Initial administrative period (months)', type: 'number', forms: ['erisa'], third: true, show: LOOKBACK },
        { key: 'erisa.newFrom', label: 'A new employee is measured from', type: 'choice', forms: ['erisa'], options: ['The date of hire', 'The first of the month after the date of hire'], show: LOOKBACK },
        { key: 'erisa.stdMeasure', label: 'Ongoing employees: standard measurement period (months)', type: 'number', forms: ['erisa'], half: true, show: LOOKBACK },
        { key: 'erisa.stdMeasureFrom', label: 'measured from', type: 'text', forms: ['erisa'], half: true, show: LOOKBACK },
        { key: 'erisa.stdStability', label: 'Standard stability period (months)', type: 'number', forms: ['erisa'], half: true, show: LOOKBACK },
        { key: 'erisa.stdStabilityFrom', label: 'measured from', type: 'text', forms: ['erisa'], half: true, show: LOOKBACK },
        { key: 'erisa.stdAdmin', label: 'Standard administrative period (months)', type: 'number', forms: ['erisa'], show: LOOKBACK },

        { key: 'erisa.depSpouse', label: 'Spouses are eligible for', type: 'multi', forms: ['erisa'], head: true,
          options: ['Nothing: benefits are not offered to spouses', 'Medical', 'Dental', 'Vision', 'HRA', 'Health FSA', 'Other'] },
        { key: 'erisa.depChildren', label: 'Children are eligible for', type: 'multi', forms: ['erisa'],
          options: ['The same benefits as spouses', 'Medical', 'Dental', 'Vision', 'HRA', 'Health FSA', 'Other'] },
        { key: 'erisa.depPartner', label: 'Domestic partners are eligible for', type: 'multi', forms: ['erisa'],
          options: ['Nothing: benefits are not offered to domestic partners', 'The same benefits as spouses', 'Medical', 'Dental', 'Vision', 'HRA', 'Health FSA', 'Other'] },
        { key: 'erisa.depOther', label: 'Any other dependents, and what they are eligible for', type: 'text', forms: ['erisa'] },

        { key: 'erisa.sameAsMedical', label: 'Do all benefits have the same eligibility and enrollment date as medical?', type: 'yesno', forms: ['erisa'], head: true },
        { key: 'erisa.medEligible', label: 'Medical: who is eligible', type: 'choice', forms: ['erisa'],
          options: ['All employees', 'Full-time employees only', 'Full-time and variable-hour employees', 'Other'] },
        { key: 'erisa.medEligibleOther', label: 'Describe', type: 'text', forms: ['erisa'], show: { key: 'erisa.medEligible', equals: 'Other' } },
        { key: 'erisa.medEnroll', label: 'Medical: coverage starts', type: 'choice', forms: ['erisa'],
          options: ['On the date of hire', 'The first of the month after the date of hire', 'The first of the month after a number of days of service', 'Other'] },
        { key: 'erisa.medEnrollDays', label: 'Number of days of service', type: 'number', forms: ['erisa'],
          show: { key: 'erisa.medEnroll', equals: 'The first of the month after a number of days of service' } },
        { key: 'erisa.medEnrollOther', label: 'Describe', type: 'text', forms: ['erisa'], show: { key: 'erisa.medEnroll', equals: 'Other' } },
        { key: 'erisa.perBenefit', label: 'For each benefit that differs from medical: who is eligible and when coverage starts', type: 'textarea', forms: ['erisa'],
          show: { key: 'erisa.sameAsMedical', equals: false } }
      ]
    },
    {
      id: 'f5500',
      form: 'f5500',
      title: 'Form 5500 filing',
      intro: 'Included in your White Glove package. Most of this is about the plan year being filed.',
      questions: [
        { key: 'f5500.yearBegins', label: 'The plan year being filed begins', type: 'date', forms: ['f5500'], half: true },
        { key: 'f5500.yearEnds',   label: 'and ends', type: 'date', forms: ['f5500'], half: true },
        { key: 'f5500.planName', label: 'Welfare benefit plan name', type: 'text', forms: ['f5500'], hint: 'For example: ABC Company Health and Welfare Plan.' },
        { key: 'f5500.naics', label: 'Business code (NAICS)', type: 'text', forms: ['f5500'], half: true, hint: 'The six-digit code on your tax return.' },
        { key: 'f5500.originalEffective', label: 'Original effective date of the plan', type: 'date', forms: ['f5500'], half: true },
        { key: 'f5500.partBegin', label: 'Employee participants at the beginning of the plan year', type: 'number', forms: ['f5500'], half: true, head: true },
        { key: 'f5500.partEnd',   label: 'Active employee participants at the end of the plan year', type: 'number', forms: ['f5500'], half: true },
        { key: 'f5500.retiredReceiving', label: 'Retired or separated participants receiving benefits', type: 'number', forms: ['f5500'], half: true, hint: 'Usually 0.' },
        { key: 'f5500.retiredFuture', label: 'Retired or separated participants entitled to future benefits', type: 'number', forms: ['f5500'], half: true, hint: 'Usually 0.' },
        { key: 'f5500.nextYear', label: 'Active employee participants for the following plan year', type: 'number', forms: ['f5500'] },
        { key: 'f5500.funding', label: 'Is the plan', type: 'choice', forms: ['f5500'], options: ['Fully insured', 'Partially self-funded', 'Fully self-funded'] },
        { key: 'f5500.firstReturn', label: 'Is this the first return for the plan?', type: 'yesno', forms: ['f5500'], half: true },
        { key: 'f5500.terminated', label: 'Did the plan end this year?', type: 'yesno', forms: ['f5500'], half: true },
        { key: 'f5500.filer', label: 'Which describes your plan?', type: 'choice', forms: ['f5500'],
          options: ['A single-employer plan', 'A plan for a controlled group or commonly controlled employers'],
          hint: 'Most employers are a single-employer plan. If you listed related companies above, ABY will confirm.' },
        { key: 'f5500.eeContribute', label: 'Do participants contribute to the plan?', type: 'yesno', forms: ['f5500'], half: true },
        { key: 'f5500.via125', label: 'Are their contributions made through a Section 125 cafeteria plan?', type: 'yesno', forms: ['f5500'], half: true,
          show: { key: 'f5500.eeContribute', equals: true } },
        { key: 'f5500.m1', label: 'Is the plan subject to an M-1 filing?', type: 'yesno', forms: ['f5500'], half: true },
        { key: 'f5500.m1Code', label: 'M-1 receipt confirmation code', type: 'text', forms: ['f5500'], half: true, show: { key: 'f5500.m1', equals: true } },
        { key: 'f5500.arrangement', label: 'How were benefits actually provided during the plan year?', type: 'choice', forms: ['f5500'],
          options: ['Through a trust', 'A trust and insurance', 'Insurance', "Only from the company's general assets (unfunded)",
                    "Partly insured and partly from the company's general assets", 'Other'],
          hint: 'A "trust" means any fund or account that holds plan money other than an insurance policy.' },
        { key: 'f5500.arrangementOther', label: 'Describe', type: 'text', forms: ['f5500'], show: { key: 'f5500.arrangement', equals: 'Other' } },
        { key: 'f5500.providers', label: 'Did any service provider receive $5,000 or more for services to the plan during the year?', type: 'yesno', forms: ['f5500'], head: true,
          hint: "Leave out: employees of the plan paid under $1,000 a month, your own employees paid nothing by the plan, employees of another business that served the plan, and anyone paid only the insurance commissions shown on the carriers' Schedule A." },
        { key: 'f5500.providerList', label: 'Each provider: name, EIN and address', type: 'textarea', forms: ['f5500'], show: { key: 'f5500.providers', equals: true } },
        { key: 'f5500.extension', label: 'Would you like help filing an extension (Form 5558)?', type: 'yesno', forms: ['f5500'],
          hint: 'The Form 5500 is due seven months after the plan year ends unless it is extended.' }
      ]
    },
    {
      // Eric and Niels, 10-01-2026: "a free text box where the employer can tell us anything else we
      // need to know about the setup, timing, ask questions, etc." Every application gets it, once,
      // as the last step before review.
      id: 'notes',
      title: 'Anything else',
      intro: 'Tell ABY anything the questions above did not cover.',
      questions: [
        { key: 'notes.anythingElse', label: 'Anything else ABY should know?', type: 'textarea', forms: ALL, optional: true,
          hint: 'For example: timing or deadlines, how you would like something set up, or questions for ABY. Optional.' }
      ]
    }
  ];

  var API = {
    STATES: STATES,
    FORMS: FORMS,
    FORM_FOR_PRODUCT: FORM_FOR_PRODUCT,
    SHORT_NAME: SHORT_NAME,
    CENSUS: CENSUS,
    CENSUS_FOR_PRODUCT: CENSUS_FOR_PRODUCT,
    SECTIONS: SECTIONS,
    extraForms: extraForms,

    /** Does one condition hold against the answers? Unanswered never satisfies a condition. */
    holds: function holds(cond, answers) {
      if (!cond) return true;
      if (cond.all) return cond.all.every(function (c) { return holds(c, answers); });
      var v = answers[cond.key];
      if ('equals' in cond) return v === cond.equals;
      // The one condition an unanswered question DOES satisfy: "not ticked" includes "never touched".
      if ('notEquals' in cond) return v !== cond.notEquals;
      if (cond.includes) return Array.isArray(v) && v.indexOf(cond.includes) >= 0;
      if (cond.includesAny) return Array.isArray(v) && cond.includesAny.some(function (x) { return v.indexOf(x) >= 0; });
      if (cond.oneOf) return cond.oneOf.indexOf(v) >= 0;
      return false;
    },

    /** The questions to show, given the forms being bought and the answers so far. */
    visible: function visible(forms, answers) {
      var out = [];
      SECTIONS.forEach(function (s) {
        if (s.form && forms.indexOf(s.form) < 0) return;
        var qs = s.questions.filter(function (q) {
          if (!q.forms.some(function (f) { return forms.indexOf(f) >= 0; })) return false;
          if (q.unlessForm && forms.indexOf(q.unlessForm) >= 0) return false;
          return API.holds(q.show, answers);
        });
        if (qs.length) out.push({ section: s, questions: qs });
      });
      return out;
    },

    /** Every key a question can be saved under - the server's allow-list. */
    allKeys: function allKeys() {
      var keys = [];
      SECTIONS.forEach(function (s) { s.questions.forEach(function (q) { keys.push(q.key); }); });
      return keys;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ABY_APPLICATION = API;
})(this);
