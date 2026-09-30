/**
 * THE EMPLOYER APPLICATION - every question ABY's setup forms ask, as DATA (F-625, 09-29-2026).
 *
 * Eric, 09-29-2026: the employer application questions are "the next questions asked when someone
 * starts the process from their ABY quote", and "when they [want more than one line of coverage],
 * I'd like for it to ask the common questions only once."
 *
 * HOW "ONCE" IS DONE: every question names the FORMS that need it (`forms`). The page shows a
 * question when any form the employer is buying needs it, so a question two forms share is asked
 * one time and both forms read the same answer. Nothing here is duplicated per form.
 *
 * WHERE THE QUESTIONS CAME FROM: ABY's own blank forms, read box by box -
 *   cobra  = "COBRA Employer Kit" (Employer Information, Employer Contacts, Benefit Information)
 *   hra    = "HRA Employer Application" 12.2023 (Sections 1-6; Section 7 is banking)
 * The July map of all seven forms is ABY-Forms-Field-Map.md in the BenefitLab brain folder.
 *
 * NEVER ASKED HERE, ON PURPOSE: Social Security numbers, dates of birth, bank routing or account
 * numbers, or a handwritten signature. The census and the bank details go through the secure upload,
 * never through these answers (Eric: "I think those will need to be sent securely").
 *
 * KEYS ARE PERMANENT. An answer is stored under its key, so renaming a key orphans every saved
 * answer. Change the words freely; add a new key rather than reuse an old one.
 *
 * Loaded by the browser (window.ABY_APPLICATION) and by the checkers (module.exports).
 */
(function (root) {
  'use strict';

  var STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK',
    'OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

  // Which quoted services each setup form covers. A product not listed here has no questions yet;
  // the page says ABY will send those separately rather than pretending there is nothing to do.
  var FORM_FOR_PRODUCT = {
    cobra: 'cobra',
    stateContinuation: 'cobra',
    hra: 'hra',
    ichra: 'hra',
    mpra: 'hra'
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
    mpra: 'Medicare HRA'
  };

  var FORMS = {
    cobra: { title: 'COBRA administration' },
    hra:   { title: 'Health Reimbursement Arrangement (HRA)' }
  };

  function contact(prefix, who, forms, extra) {
    return [
      { key: prefix + '.name',  label: who + ' - name',  type: 'text',  forms: forms },
      { key: prefix + '.title', label: 'Title',          type: 'text',  forms: forms },
      { key: prefix + '.email', label: 'Email',          type: 'email', forms: forms },
      { key: prefix + '.phone', label: 'Phone',          type: 'tel',   forms: forms }
    ].concat(extra || []);
  }

  // One COBRA benefit block (the form has room for 4 medical, dental, vision and 2 additional).
  function cobraBenefit(slot, heading, askName) {
    var on = { key: 'cobra.' + slot + '.offered', equals: true };
    var rated = { all: [on, { key: 'cobra.' + slot + '.ageRated', equals: false }] };
    var q = [];
    q.push({ key: 'cobra.' + slot + '.offered', label: heading, type: 'yesno', forms: ['cobra'],
      hint: slot === 'med1' ? 'Your main medical plan.' : '' });
    if (askName) q.push({ key: 'cobra.' + slot + '.name', label: 'Which benefit or plan is this?', type: 'text', forms: ['cobra'], show: on });
    q.push(
      { key: 'cobra.' + slot + '.ratesFrom', label: 'Rates in effect from', type: 'date', forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.ratesTo',   label: 'to', type: 'date', forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.ageRated', label: 'Is it individually or age rated?', type: 'yesno', forms: ['cobra'], show: on,
        hint: 'If yes, ABY will ask for a copy of the rate table instead of the four rates below.' },
      { key: 'cobra.' + slot + '.eo', label: 'Monthly rate - employee only',       type: 'money', forms: ['cobra'], show: rated, half: true, why: 'People on COBRA pay based on your current rates, so ABY needs them to bill correctly.' },
      { key: 'cobra.' + slot + '.es', label: 'Monthly rate - employee + spouse',   type: 'money', forms: ['cobra'], show: rated, half: true },
      { key: 'cobra.' + slot + '.ec', label: 'Monthly rate - employee + children', type: 'money', forms: ['cobra'], show: rated, half: true },
      { key: 'cobra.' + slot + '.ef', label: 'Monthly rate - employee + family',   type: 'money', forms: ['cobra'], show: rated, half: true },
      { key: 'cobra.' + slot + '.terminate', label: 'When someone leaves, coverage ends', type: 'choice', forms: ['cobra'], show: on, why: 'It sets the day COBRA coverage has to pick up from, so there is no gap.',
        options: ['At the end of the month', 'On the date of termination'] },
      { key: 'cobra.' + slot + '.carrier', label: 'Insurance carrier', type: 'text', forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.group',   label: 'Group number',      type: 'text', forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.carrierContact', label: 'Carrier contact ABY should work with', type: 'text', forms: ['cobra'], show: on, why: 'ABY sends COBRA enrollments, terminations and questions for this benefit to this person at the carrier.',
        hint: 'ABY sends COBRA enrollments and terminations to this person.' },
      { key: 'cobra.' + slot + '.carrierPhone', label: 'Carrier contact phone', type: 'tel',   forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.carrierFax',   label: 'Carrier contact fax',   type: 'tel',   forms: ['cobra'], show: on, half: true },
      { key: 'cobra.' + slot + '.carrierEmail', label: 'Carrier contact email', type: 'email', forms: ['cobra'], show: on }
    );
    return q;
  }

  var hraHas = function (value) { return { key: 'hra.eligible', includes: value }; };
  var hraExcl = function (value) { return { key: 'hra.excluded', includes: value }; };

  var SECTIONS = [
    {
      id: 'company',
      title: 'About your company',
      intro: 'These are asked once, however many services you are setting up.',
      questions: [
        { key: 'co.legalName', label: 'Legal name', type: 'text', why: "ABY's documents and notices use the name exactly as you write it here, so it should match your tax returns.", forms: ['cobra', 'hra'], required: true,
          hint: 'As it appears on your tax returns and as it should appear on documents.' },
        { key: 'co.street', label: 'Physical street address', type: 'text', forms: ['cobra', 'hra'] },
        { key: 'co.city',   label: 'City',  type: 'text',  forms: ['cobra', 'hra'], third: true },
        { key: 'co.state',  label: 'State', type: 'state', forms: ['cobra', 'hra'], third: true },
        { key: 'co.zip',    label: 'ZIP',   type: 'text',  forms: ['cobra', 'hra'], third: true },
        { key: 'co.mailingSame', label: 'Is the mailing address the same?', type: 'yesno', forms: ['cobra'] },
        { key: 'co.mailStreet', label: 'Mailing street address', type: 'text',  forms: ['cobra'], show: { key: 'co.mailingSame', equals: false } },
        { key: 'co.mailCity',   label: 'City',  type: 'text',  forms: ['cobra'], third: true, show: { key: 'co.mailingSame', equals: false } },
        { key: 'co.mailState',  label: 'State', type: 'state', forms: ['cobra'], third: true, show: { key: 'co.mailingSame', equals: false } },
        { key: 'co.mailZip',    label: 'ZIP',   type: 'text',  forms: ['cobra'], third: true, show: { key: 'co.mailingSame', equals: false } },
        { key: 'co.ein', label: 'Federal employer tax ID (EIN)', type: 'ein', why: "Your plan documents and ABY's records identify the company by its EIN.", forms: ['cobra', 'hra'], required: true, half: true },
        { key: 'co.incorporated', label: 'Date incorporated or organized', type: 'date', forms: ['cobra', 'hra'], half: true },
        { key: 'co.lawsState', label: 'State whose laws the company operates under', type: 'state', forms: ['cobra', 'hra'], half: true },
        { key: 'co.orgType', label: 'Type of organization', type: 'choice', forms: ['cobra', 'hra'],
          options: ['C corporation', 'S corporation', 'Partnership', 'Limited liability company (LLC)',
                    'Sole proprietorship', 'Government or municipality', 'Not-for-profit (school or church)'],
          hint: 'Sole proprietors, partners and more-than-2% shareholders of an S corporation cannot participate in an HRA themselves.' },
        { key: 'co.business', label: 'Nature of the business', type: 'text', forms: ['cobra', 'hra'] },
        { key: 'co.employees', label: 'Number of employees', type: 'number', forms: ['hra'], half: true },
        { key: 'co.eligibleEmployees', label: 'Number of eligible employees', type: 'number', forms: ['hra'], half: true },
        { key: 'co.phone',   label: 'Company phone', type: 'tel',  forms: ['hra'], half: true },
        { key: 'co.fax',     label: 'Company fax',   type: 'tel',  forms: ['hra'], half: true },
        { key: 'co.website', label: 'Website',       type: 'text', forms: ['hra'] },
        { key: 'co.relatedEins', label: 'Related companies (a controlled group): name and EIN of each', type: 'list', max: 4, why: "Companies under common ownership can count as one employer under the tax rules, so ABY needs to know about them when setting up the plan.", forms: ['hra'],
          hint: 'Leave blank if there are none.' }
      ]
    },
    {
      id: 'contacts',
      title: 'Who ABY should work with',
      intro: 'Also asked once. Leave a contact blank if it is the same person as the one above it.',
      questions: []
        .concat(contact('contact.signer', 'Authorized signer', ['cobra', 'hra']))
        .concat(contact('contact.hr', 'HR / payroll contact', ['cobra', 'hra']))
        .concat(contact('contact.billing', 'Billing / accounts payable contact', ['cobra']))
        .concat(contact('contact.other', 'Additional contact', ['cobra']))
        .concat([
          { key: 'co.adminStart', label: 'Start date of administration', type: 'date', why: "The date ABY takes over. Anything that happens before it stays with whoever handled it before.", forms: ['cobra'] }
        ])
    },
    {
      id: 'cobra',
      form: 'cobra',
      title: 'COBRA administration',
      intro: 'The current rates for each benefit that COBRA applies to, and the carrier contact ABY will send COBRA enrollments and terminations to.',
      questions: [
        { key: 'cobra.funding', label: 'Your plans are', type: 'choice', why: "How your plan is funded changes which rules apply and who ABY works with on COBRA.", forms: ['cobra'],
          options: ['Fully insured', 'Self-insured', 'Level funded'] },
        { key: 'cobra.stateCont', label: 'Is there state continuation after COBRA runs out?', type: 'yesno', why: "Some states let people keep coverage for a while after federal COBRA ends. ABY needs to know whether that applies to your plan.", forms: ['cobra'], half: true },
        { key: 'cobra.stateContState', label: 'Which state?', type: 'state', forms: ['cobra'], half: true,
          show: { key: 'cobra.stateCont', equals: true } },
        { key: 'cobra.initialNotice', label: 'Should ABY send the initial COBRA rights notice to your current employees?', type: 'yesno', why: "ABY can send the notice that explains COBRA rights to the employees already on your plan. Answer no if they have already received it.", forms: ['cobra'] }
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
          { key: 'cobra.hasFsa', label: 'Do you offer a health FSA?', type: 'yesno', forms: ['cobra'] },
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
      intro: 'How the HRA works: who is eligible, what it pays for and how much.',
      questions: [
        { key: 'hra.type', label: 'Which kind of HRA?', type: 'multi', forms: ['hra'],
          options: ['Integrated HRA (with a group health plan)', 'CHOICE Arrangement (formerly ICHRA)', 'QSEHRA',
                    'Excepted benefit HRA', 'Medicare HRA'] },
        { key: 'hra.officers.president', label: 'President', type: 'text', forms: ['hra'], half: true },
        { key: 'hra.officers.vp',        label: 'Vice president', type: 'text', forms: ['hra'], half: true },
        { key: 'hra.officers.cfo',       label: 'CFO', type: 'text', forms: ['hra'], half: true },
        { key: 'hra.officers.ceo',       label: 'CEO', type: 'text', forms: ['hra'], half: true },
        { key: 'hra.officers.other',     label: 'Other officers', type: 'text', forms: ['hra'] },
        { key: 'hra.ineligibleFamily', label: 'Employee spouses or immediate family of the owner who are not eligible', type: 'text', forms: ['hra'],
          hint: 'Names, if any.' },
        { key: 'hra.broker.office',  label: "Broker's office", type: 'text',  forms: ['hra'], half: true },
        { key: 'hra.broker.contact', label: 'Broker contact',  type: 'text',  forms: ['hra'], half: true },
        { key: 'hra.broker.email',   label: 'Broker email',    type: 'email', forms: ['hra'], half: true },
        { key: 'hra.broker.phone',   label: 'Broker phone',    type: 'tel',   forms: ['hra'], half: true },
        { key: 'hra.correspondTo', label: 'Questions and correspondence should go to', type: 'choice', forms: ['hra'],
          options: ['Your company contact', 'The broker'] },
        { key: 'hra.copyBroker', label: 'Should the broker be copied on all written correspondence?', type: 'yesno', forms: ['hra'] },

        { key: 'hra.eligible', label: 'Which employees are eligible?', type: 'multi', forms: ['hra'],
          options: ['All', 'Salaried employees only', 'Hourly employees only', 'Full-time employees', 'Part-time employees', 'Other'],
          hint: 'Rules that favor highly compensated employees can bring tax penalties. Check with your advisor before limiting who can participate.' },
        { key: 'hra.ftHours', label: 'Full-time means scheduled to work at least this many hours a week', type: 'number', forms: ['hra'], show: hraHas('Full-time employees') },
        { key: 'hra.ptHours', label: 'Part-time means scheduled to work at least this many hours a week', type: 'number', forms: ['hra'], show: hraHas('Part-time employees') },
        { key: 'hra.eligibleOther', label: 'Other eligible class', type: 'text', forms: ['hra'], show: hraHas('Other') },
        { key: 'hra.excluded', label: 'Who is excluded?', type: 'multi', forms: ['hra'],
          options: ['No exclusions', 'Part-time employees', 'Non-resident aliens', 'Employees under a certain age', 'Seasonal', 'Union employees', 'Contract', 'Other'] },
        { key: 'hra.excludedAge', label: 'Employees under what age are excluded?', type: 'number', forms: ['hra'], show: hraExcl('Employees under a certain age') },
        { key: 'hra.unionHours', label: 'Union employees scheduled to work at least this many hours a week', type: 'number', forms: ['hra'], show: hraExcl('Union employees') },
        { key: 'hra.excludedOther', label: 'Other excluded class', type: 'text', forms: ['hra'], show: hraExcl('Other') },
        { key: 'hra.waiting', label: 'Waiting period before a new employee is eligible', type: 'choice', forms: ['hra'],
          options: ['As of the date of hire', 'First of the month following a number of days', 'A number of months after the date of hire', 'A number of days after the date of hire'] },
        { key: 'hra.waitingNumber', label: 'How many?', type: 'number', forms: ['hra'],
          show: { key: 'hra.waiting', oneOf: ['First of the month following a number of days', 'A number of months after the date of hire', 'A number of days after the date of hire'] } },

        { key: 'hra.planNumber', label: 'Plan number', type: 'text', forms: ['hra'], half: true, hint: 'Leave blank if you do not know it.' },
        { key: 'hra.originalEffective', label: 'Original effective date', type: 'date', forms: ['hra'], half: true },
        { key: 'hra.planYearFrom', label: 'Plan year runs from (month and day)', type: 'md', forms: ['hra'], half: true },
        { key: 'hra.planYearTo',   label: 'to', type: 'md', forms: ['hra'], half: true },
        { key: 'hra.currentBegins', label: 'Current plan year begins', type: 'date', forms: ['hra'], half: true },
        { key: 'hra.currentEnds',   label: 'Current plan year ends', type: 'date', forms: ['hra'], half: true },
        { key: 'hra.firstYear', label: 'Is this the first plan year?', type: 'yesno', forms: ['hra'], half: true,
          hint: 'If this is an existing HRA, ABY will ask for your plan document and SPD.' },
        { key: 'hra.shortYear', label: 'Is this a short plan year?', type: 'yesno', forms: ['hra'], half: true },

        { key: 'hra.covered', label: 'What will the HRA pay for?', type: 'multi', forms: ['hra'],
          options: ['In-network expenses', 'Out-of-network expenses', 'Copays and prescriptions', 'Coinsurance', 'Over-the-counter items', 'Individual health insurance premiums'] },
        { key: 'hra.linkedCarrier', label: 'If it is linked to a health plan, which carrier?', type: 'text', forms: ['hra'], half: true },
        { key: 'hra.linkedPlan',    label: 'Plan name', type: 'text', forms: ['hra'], half: true },
        { key: 'hra.payFirst', label: 'If you offer both an HRA and an FSA, which should pay first?', type: 'choice', why: "When an expense could be paid from either account, this decides which one pays first.", forms: ['hra'], options: ['HRA', 'FSA', 'We do not offer an FSA'] },

        { key: 'hra.capType', label: 'Reimbursement cap', type: 'choice', forms: ['hra'], options: ['One flat amount', 'By coverage level'] },
        { key: 'hra.capFlat', label: 'Flat amount', type: 'money', forms: ['hra'], show: { key: 'hra.capType', equals: 'One flat amount' } },
        { key: 'hra.capEO', label: 'Employee only',        type: 'money', forms: ['hra'], half: true, show: { key: 'hra.capType', equals: 'By coverage level' } },
        { key: 'hra.capES', label: 'Employee + spouse',    type: 'money', forms: ['hra'], half: true, show: { key: 'hra.capType', equals: 'By coverage level' } },
        { key: 'hra.capEC', label: 'Employee + children',  type: 'money', forms: ['hra'], half: true, show: { key: 'hra.capType', equals: 'By coverage level' } },
        { key: 'hra.capEF', label: 'Employee + family',    type: 'money', forms: ['hra'], half: true, show: { key: 'hra.capType', equals: 'By coverage level' } },
        { key: 'hra.howReimburse', label: 'How will the HRA reimburse?', type: 'textarea', forms: ['hra'],
          hint: 'For example: $1,000 a year for employee-only coverage after the first $1,500 of in-network deductible. Or: up to $325 a month toward an individually purchased premium.' },
        { key: 'hra.carryover', label: "Should employees' unused HRA dollars carry over to the next plan year?", type: 'yesno', forms: ['hra'] },
        { key: 'hra.carryoverPct', label: 'Carry over this percentage', type: 'number', forms: ['hra'], third: true, show: { key: 'hra.carryover', equals: true } },
        { key: 'hra.carryoverAmt', label: 'or this amount', type: 'money', forms: ['hra'], third: true, show: { key: 'hra.carryover', equals: true } },
        { key: 'hra.carryoverMax', label: 'Not to exceed', type: 'money', forms: ['hra'], third: true, show: { key: 'hra.carryover', equals: true } },
        { key: 'hra.calendarDeductible', label: 'Should the plan line up with the calendar-year deductible?', type: 'yesno', forms: ['hra'] },
        { key: 'hra.midYear', label: 'If the plan starts mid-year, how should the benefit pay out?', type: 'choice', forms: ['hra'],
          options: ['100% of the benefit', 'Pro-rated'] },
        { key: 'hra.runout', label: 'Run-out period', type: 'choice', forms: ['hra'], options: ['60 days', '90 days', 'Other'],
          hint: 'How long after the plan year ends employees can still submit claims from that year.' },
        { key: 'hra.runoutOther', label: 'Run-out period (days)', type: 'number', forms: ['hra'], show: { key: 'hra.runout', equals: 'Other' } },

        { key: 'hra.minReimb', label: 'Minimum reimbursement amount', type: 'choice', forms: ['hra'], options: ['$10', 'Other'] },
        { key: 'hra.minReimbOther', label: 'Minimum amount', type: 'money', forms: ['hra'], show: { key: 'hra.minReimb', equals: 'Other' } },
        { key: 'hra.fromEmployerAccount', label: 'Should ABY issue reimbursements (checks or direct deposit) from your company account?', type: 'yesno', forms: ['hra'],
          hint: 'If yes, ABY needs your bank details and a signature for printing checks. Those are sent through the secure upload, never on this page. There is an additional charge of $5 per check printed.' },
        { key: 'hra.checksTo', label: 'Checks should be', type: 'choice', forms: ['hra'], options: ['Sent to the employee', 'Sent to the employer for signature'],
          show: { key: 'hra.fromEmployerAccount', equals: true } }
      ]
    }
  ];

  var API = {
    STATES: STATES,
    FORMS: FORMS,
    FORM_FOR_PRODUCT: FORM_FOR_PRODUCT,
    SHORT_NAME: SHORT_NAME,
    SECTIONS: SECTIONS,

    /** Does one condition hold against the answers? Unanswered never satisfies a condition. */
    holds: function holds(cond, answers) {
      if (!cond) return true;
      if (cond.all) return cond.all.every(function (c) { return holds(c, answers); });
      var v = answers[cond.key];
      if ('equals' in cond) return v === cond.equals;
      if (cond.includes) return Array.isArray(v) && v.indexOf(cond.includes) >= 0;
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
