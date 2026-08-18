// ABY Quote Tool — Pricing tables
// Two parallel rate sets: `commissioned` and `noCommission`.
// The engine reads from one or the other based on the form's commission toggle.
// To update a price: edit the relevant entry below. No other files need to change.
//
// SOURCES:
//   - aby-pricing-template.xlsx (Eric's filled-in pricing, May 2026)
//   - "some updated pricing.pdf" (May 2026 email from Eric Johnson / ABY)

window.ABYQuote = window.ABYQuote || {};

// ACA reporting add-on fees, read off FIVE signed ABY proposals supplied by Eric 2026-08-18:
//   Brown & Brown (2025, no commission) - Advocate / SPSD (2026, no commission) -
//   Smarter Benefits / St. George Episcopal School (2026, 1095-B) - Gibson (2026,
//   multi-tier, commissioned) - Lone Star National Bancshares (2026, up to 1,000 forms).
// ERIC: "For the extra fees, there is no commission." So BOTH rate sets get the same
// figures. A FUNCTION rather than a shared constant, so the two sets cannot end up
// pointing at one array and mutating together.
//
// Every figure below appears identically in all five EXCEPT the additional-EIN fee:
// the 2025 document says $725 and ALL THREE 2026 documents say $750. The 2026 figure is
// used. That is a dated reading, not a coin flip, and it is recorded here so the next
// person does not have to re-derive it.
function acaAdditionalFees() {
  return [
    { label: 'Print and mail forms to employees', amount: 2, unit: 'per form',
      description: 'Optional. $2.00 per form when the forms are ready to print before March 2; $2.50 per form after March 2. Elected in ABY secure portal once the forms are complete.' },
    { label: 'Correct and refile forms accepted with errors', amount: 150, unit: 'plus $2.00 per form resubmitted',
      description: 'Charged each time a correction is submitted. Waived, or applied to the following filing year, if the group renews by July 1. Optional, though ABY strongly recommends that all corrections are made and resubmitted.' },
    { label: 'Each additional EIN, 10 or more W-2s', amount: 750, unit: 'per additional EIN',
      description: 'Pricing is per EIN. Self service is not available to multi-EIN employers.' },
    { label: 'Each additional EIN, fewer than 10 W-2s', amount: 375, unit: 'per additional EIN',
      description: 'Pricing is per EIN. Self service is not available to multi-EIN employers.' },
    { label: 'State filing, large group (1095-C): first state', amount: 500, unit: 'per EIN',
      description: 'Rhode Island, New Jersey, Massachusetts, California, Washington DC and Vermont require state filing for employees residing there. Elected in the portal and billed the following April. Most fully insured carriers file the state forms, so confirm with the carrier first.' },
    { label: 'State filing, large group (1095-C): each additional state', amount: 350, unit: 'per EIN',
      description: 'As above, for every state after the first.' },
    { label: 'State filing, small group (1095-B)', amount: 275, unit: 'per state, per EIN',
      description: 'Billed during onboarding rather than in April, which is the small-group difference.' }
  ];
}

// Helper to build the seven ACA packages — same shape both rate sets
function buildAcaPackages(rates) {
  return {
    smallB:    { description: 'Small Group / Self/Level/Balance Funded: Forms 1094/1095-B', formula: { base: rates.smallB_base, perForm: rates.smallB_perForm }, requiresCount: true },
    fullLt100: { description: 'ALE: Forms 1094/1095-C, Full Service (up to 100 forms)',     annualFee: rates.fullLt100 },
    fullMid:   { description: 'ALE: Forms 1094/1095-C, Full Service (101 to 250 forms)',    annualFee: rates.fullMid },
    fullHigh:  { description: 'ALE: Forms 1094/1095-C, Full Service (251 to 500 forms)',    annualFee: rates.fullHigh },
    fullXL:    { description: 'ALE: Forms 1094/1095-C, Full Service (501 to 1,000 forms)',  annualFee: rates.fullXL },
    selfLt100: { description: 'ALE: Forms 1094/1095-C, Self Service (up to 100 forms)',     annualFee: rates.selfLt100 },
    selfMid:   { description: 'ALE: Forms 1094/1095-C, Self Service (101 to 250 forms)',    annualFee: rates.selfMid },
    selfHigh:  { description: 'ALE: Forms 1094/1095-C, Self Service (251 to 500 forms)',    annualFee: rates.selfHigh },
    selfXL:    { description: 'ALE: Forms 1094/1095-C, Self Service (501 to 1,000 forms)',  annualFee: rates.selfXL }
  };
}

ABYQuote.pricing = {
  // ============================================================
  // COMMISSIONED RATES
  // ============================================================
  commissioned: {

    pop: {
      type: 'package',
      packages: {
        docsOnly: { annualFee: 99,  commissionable: false, description: 'POP plan doc only: no testing' },
        popHsa:   { setupFee: 350,  renewalFee: 350,       description: 'POP plan doc + annual NDT for POP & HSA' },
        full:     { setupFee: 550,  renewalFee: 550,       description: 'POP plan doc + annual NDT for POP, FSA, LFSA, DCAP & HSA' }
      },
      additionalFees: [
        { label: 'Additional NDT (after first set per year)', amount: 250, unit: 'per additional test', description: 'Each nondiscrimination test set beyond the first one included per year.' },
        { label: 'Prior year NDT', amount: 300, unit: 'per plan year', description: 'Nondiscrimination testing for a prior plan year, typically requested to catch up or correct a year that was not tested.' },
        { label: 'Data manipulation / reformatting', amount: 5, unit: 'per participant', description: 'Reformatting or cleaning up census/participant data that is not provided in ABY\'s standard format.' }
      ]
    },

    fsa: {
      type: 'tiered',
      setupFee: 125, docsFee: 0, renewalFee: 125,
      monthlyTiers: [
        { maxCount: 19,   type: 'flat', amount: 85,   label: '<20 participants' },
        { maxCount: 99,   type: 'pppm', amount: 4.50, minMonthly: 85, label: '20–99 participants' },
        { maxCount: 200,  type: 'pppm', amount: 4.25, minMonthly: 85, label: '100 to 200 participants' }
      ],
      additionalFees: [
        { label: 'Plan documents (FSA/DCAP/LFSA/POP w/SPD)', amount: 0, description: '' },
        { label: 'Debit card order (FSA only)', amount: 5, unit: 'per order', description: 'Charged when new or replacement participant debit cards are ordered.' },
        { label: 'Direct deposits', amount: 0, description: 'Participant reimbursements paid by ACH at no per-transaction charge.' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: 'Issued when a participant is paid by mailed check instead of direct deposit.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
        { label: 'Paper enrollment package', amount: 2, unit: 'per packet', description: '' },
        { label: 'Paper/PDF setup or renewal', amount: 5, unit: 'per participant ($500 min)', description: '' }
      ]
    },

    hsa: {
      type: 'tiered',
      setupFee: 125, renewalFee: 0,
      monthlyTiers: [
        { maxCount: 14,   type: 'flat', amount: 50,   label: '<15 accounts' },
        { maxCount: 99,   type: 'pppm', amount: 3.20, minMonthly: 50, label: '15–99 accounts' },
        { maxCount: 200,  type: 'pppm', amount: 3.05, minMonthly: 50, label: '100 to 200 accounts' }
      ],
      additionalFees: [
        { label: 'Debit card order', amount: 5, unit: 'per order', description: 'Charged when new or replacement participant debit cards are ordered.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
        { label: 'Paper enrollment material', amount: 2, unit: 'per packet', description: '' }
      ],
      notes: ['Custodian: HSAToday. Participant-incurred ancillary fees (overdrafts, replacement cards, etc.) are billed directly to the account holder by the custodian.']
    },

    hra: {
      type: 'tiered',
      setupFee: 125, docsFee: 0, renewalFee: 125,
      monthlyTiers: [
        { maxCount: 19,   type: 'flat', amount: 85,   label: '<20 participants' },
        { maxCount: 99,   type: 'pppm', amount: 4.50, minMonthly: 85, label: '20–99 participants' },
        { maxCount: 200,  type: 'pppm', amount: 4.25, minMonthly: 85, label: '100 to 200 participants' }
      ],
      additionalFees: [
        { label: 'Plan documents (HRA w/SPD)', amount: 0, description: '' },
        { label: 'Direct deposits', amount: 0, description: 'Participant reimbursements paid by ACH at no per-transaction charge.' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: 'Issued when a participant is paid by mailed check instead of direct deposit.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' }
      ]
    },

    ichra: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 125, renewalFee: 125,
          monthlyTiers: [
            { maxCount: 19,   type: 'flat', amount: 85,   label: '<20 participants' },
            { maxCount: 99,   type: 'pppm', amount: 4.50, minMonthly: 85, label: '20–99 participants' },
            { maxCount: null, type: 'pppm', amount: 4.25, minMonthly: 85, label: '100+ participants' }
          ],
          description: 'Full administration including documents, SPD, and ongoing administration',
          requiresCount: true
        },
        docsOnly: { setupFee: 350, renewalFee: 350, description: 'Plan documents only: no monthly administration', requiresCount: false }
      },
      additionalFees: [
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
        { label: 'Direct deposits', amount: 0, description: 'Participant reimbursements paid by ACH at no per-transaction charge.' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: 'Issued when a participant is paid by mailed check instead of direct deposit.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' }
      ]
    },

    cobra: {
      type: 'tiered',
      setupFee: 125, renewalFee: 125,
      monthlyTiers: [
        { maxCount: 64,   type: 'flat', amount: 55,   label: '<65 employees' },
        { maxCount: null, type: 'pppm', amount: 0.85, minMonthly: 55, label: '65+ employees' }
      ],
      additionalFees: [
        { label: 'Qualifying Event (QE) notices', amount: 0, description: 'When an employee loses coverage (termination, reduction in hours, divorce, a dependent aging out), federal law requires a COBRA election notice. ABY prepares and mails these at no additional charge.' },
        { label: 'Initial/general rights notices during plan year', amount: 0, unit: 'per notice', description: 'The general COBRA rights notice sent to newly enrolled participants during the year. Included as part of standard administration.' },
        { label: 'Initial/general rights notices at setup or renewal (optional)', amount: 3, unit: 'per notice', description: 'If you would like ABY to mail the general rights notice to your entire covered population at setup or renewal, it is $3 per notice mailed.' },
        { label: 'COBRA participants', amount: 0, unit: 'per participant per month', description: 'There is no separate per-person charge for individuals actively enrolled in COBRA; their administration is covered by your monthly admin fee.' },
        { label: 'COBRA takeover', amount: 5, unit: 'per current participant (one-time)', description: 'A one-time fee to move existing COBRA participants from a prior administrator onto ABY\'s system, including their records, payment history, and remaining coverage timeline.' },
        { label: 'Retro notices', amount: 5, unit: 'per notice', description: 'A notice sent when COBRA coverage is applied or corrected retroactively.' },
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
        { label: 'Open enrollment: generic renewal notice', amount: 0, description: 'A general open-enrollment notice to participants about renewal and any plan changes. Included.' },
        { label: 'Open enrollment: full COBRA renewal packet mailed', amount: 15, unit: 'per packet', description: 'A complete printed renewal packet (new rates, plan summaries, and election materials) mailed to each COBRA participant at open enrollment.' }
      ],
      notes: [
        'Includes Texas State Continuation following COBRA for fully-insured groups.',
        'ABY collects and retains 2% of premiums collected from COBRA participants. This is paid by COBRA participants from their premium remittances and does not affect employer fees.'
      ]
    },

    stateContinuation: {
      type: 'tiered',
      setupFee: 125, renewalFee: 125,
      monthlyTiers: [
        { maxCount: null, type: 'flat', amount: 40, label: 'all groups' }
      ],
      additionalFees: [
        { label: 'Qualifying Event (QE) notices', amount: 0, description: 'When an employee loses coverage (termination, reduction in hours, divorce, a dependent aging out), federal law requires a COBRA election notice. ABY prepares and mails these at no additional charge.' },
        { label: 'Initial Rights notices during plan year', amount: 0, unit: 'per notice', description: '' },
        { label: 'Initial Rights notices at setup or renewal', amount: 1.50, unit: 'per notice', description: '' },
        { label: 'Takeover participants', amount: 5, unit: 'per participant (one-time)', description: '' },
        { label: 'Retro notices', amount: 5, unit: 'per notice', description: 'A notice sent when continuation coverage is applied or corrected retroactively.' },
        { label: 'Continuation participants', amount: 0, unit: 'per month', description: '' },
        { label: 'Open enrollment: generic renewal notice', amount: 0, description: 'A general open-enrollment notice to participants about renewal and any plan changes. Included.' },
        { label: 'Open enrollment: full continuation packet mailed', amount: 15, unit: 'per packet', description: 'A complete printed renewal packet mailed to each continuation participant at open enrollment.' }
      ]
    },

    erisa: {
      type: 'package',
      packages: {
        basic:          { annualFee: 425,  description: 'Electronic wrap "legal text" only' },
        buyUp:          { annualFee: 525,  description: 'Electronic wrap "legal text" and Section 125 plan without testing' },
        enhanced:       { annualFee: 700,  description: 'Electronic wrap "legal text" and Section 125 plan with POP/HSA testing' },
        fullSpd:        { annualFee: 700,  description: 'Full SPD and Section 125 plan without testing' },
        fullSpdTesting: { annualFee: 875,  description: 'Full SPD and Section 125 plan with POP/HSA testing' },
        whiteGlove:     { annualFee: 1100, description: 'Full SPD, Section 125 plan with POP/HSA testing, and Form 5500 filing' }
      },
      additionalFees: [
        { label: 'Annual Notice Packet', amount: 125, unit: 'per year', description: 'Includes GINA, CHIP, Medicare Creditable Coverage, HIPAA Special Enrollment, and Notice of Exchange.' },
        { label: 'FSA/DCAP language addition', amount: 125, unit: 'year 1', description: 'Adds Flexible Spending Account and/or Dependent Care Assistance Plan language to your wrap document. A one-time charge in the first year it is added.' },
        { label: 'FSA/DCAP NDT testing', amount: 175, unit: 'per year per test set', description: 'Annual nondiscrimination testing for FSA/DCAP plans, confirming benefits do not disproportionately favor highly compensated or key employees.' },
        { label: 'Additional current-year NDT (after one included)', amount: 125, unit: 'per additional test', description: 'One nondiscrimination test set is included with testing packages; any additional test for the current plan year is charged per test.' },
        { label: 'Prior year NDT', amount: 300, unit: 'per prior year', description: 'Nondiscrimination testing for a prior plan year, typically requested to catch up or correct a year that was not tested.' },
        { label: 'Annual hard copy', amount: 99, unit: 'each', description: 'A professionally printed copy of your wrap document and SPD. Documents are delivered electronically by default.' },
        { label: 'Additional USB (one included annually)', amount: 25, unit: 'each', description: 'Your documents come on one USB drive each year at no charge; additional copies are charged each.' },
        { label: 'Audit services', amount: 175, unit: 'per hour', description: 'Hands-on help responding to a Department of Labor or IRS audit or document request: gathering records, preparing responses, and supporting your team.' }
      ]
    },

    aca: {
      type: 'package-with-count',
      packages: buildAcaPackages({
        // Gibson 2026 (commissioned, multi-tier). Where its rate table and its signature
        // page disagreed, the HIGHER figure is used, per Eric 2026-08-18. The 501-1,000
        // band is Lone Star National Bancshares 2026, whose two pages agree.
        //
        // 2026-08-18: ERIC SET THE COMMISSIONED FIGURES HIMSELF, which is what resolved the
        // open question below. Every proposal supplied was a NO-COMMISSION quote, so taking the
        // higher figure from them had left the two books IDENTICAL -- i.e. ACA reporting
        // carrying no commission differential at all. It now carries one: +$200 on every Full
        // Service band, and +$50/$125/$100/$100 on Self Service.
        // DO NOT re-derive these from the proposals; they are his numbers, not the documents'.
        smallB_base: 475, smallB_perForm: 2.50,
        fullLt100: 3500, fullMid: 3900, fullHigh: 4300, fullXL: 4750,
        selfLt100: 1250, selfMid: 1675, selfHigh: 1950, selfXL: 2300
      }),
      additionalFees: acaAdditionalFees(),
      notes: [
        'Pricing is per EIN and is based on the number of forms created and filed. To count forms, total the employees who were full time on any day of the calendar year.',
        'Multi-EIN employers must take Full Service: Self Service is not available where a second EIN is involved. Each additional EIN is charged separately.',
        'These packages cover up to 1,000 forms. Above 1,000 forms please contact ABY, as pricing is quoted individually.'
      ]
    },

    mpra: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 125, renewalFee: 125,
          monthlyTiers: [
            { maxCount: null, type: 'flat', amount: 85, minMonthly: 85, label: 'monthly administration (under 20 participants)' }
          ],
          description: 'Full administration including plan document, SPD, and monthly administration',
          requiresCount: true
        },
        docsOnly: { setupFee: 350, renewalFee: 350, description: 'Plan document and SPD only: no monthly administration', requiresCount: false }
      },
      additionalFees: [
        { label: 'Standard file feed integration', amount: 0, description: 'Automated eligibility feed from a supported payroll or HRIS system, in ABY format.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built feed for a provider not already integrated with ABY.' },
        { label: 'Direct deposits', amount: 0, description: 'Reimbursements paid to participants by ACH at no per-transaction charge.' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: 'Issued when a participant is paid by mailed check instead of direct deposit.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Paper enrollment package', amount: 2, unit: 'per printed packet', description: 'Printed enrollment materials when the electronic package is not used.' },
        { label: 'Paper form / PDF setup or renewal', amount: 5, unit: 'per participant ($500 minimum)', description: 'Only billed if paper or PDF is used for setup or renewal instead of the ABY template.' }
      ],
      notes: ['Medicare HRA requires an employer with fewer than 20 employees and an ACA-compliant group medical plan. The minimum monthly administration fee is $85.']
    },

    section127: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 125, renewalFee: 125,
          monthlyTiers: [
            { maxCount: 100, type: 'pppm', amount: 4.00, minMonthly: 65, label: '2 to 100 participants' },
            { maxCount: 200, type: 'pppm', amount: 3.75, label: '101 to 200 participants' },
            { maxCount: 500, type: 'pppm', amount: 3.50, label: '201 to 500 participants' }
          ],
          description: 'Full administration including plan document, annual nondiscrimination testing, and monthly administration',
          requiresCount: true
        },
        docsOnly: { setupFee: 350, renewalFee: 350, description: 'Standalone Section 127 EDU/SLRP documents only', requiresCount: false }
      },
      additionalFees: [
        { label: 'Standard file feed integration', amount: 0, description: 'Automated eligibility feed from a supported payroll or HRIS system.' }
      ],
      notes: ['The $125 plan setup and annual renewal fee includes plan design consultation, plan amendments and changes, annual nondiscrimination testing, legal updates, and PDF print-ready required notices.']
    },

    section132: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 125, renewalFee: 125,
          monthlyTiers: [
            { maxCount: 19,   type: 'flat', amount: 85,   label: '<20 participants' },
            { maxCount: 99,   type: 'pppm', amount: 4.50, minMonthly: 85, label: '20–99 participants' },
            { maxCount: 200,  type: 'pppm', amount: 4.25, minMonthly: 85, label: '100 to 200 participants' }
          ],
          description: 'Full administration including plan document, annual nondiscrimination testing, and monthly administration',
          requiresCount: true
        },
        docsOnly: { setupFee: 350, renewalFee: 350, description: 'Standalone Section 132 QTB documents only', requiresCount: false }
      },
      additionalFees: [
        { label: 'Debit cards', amount: 0, unit: 'monthly', description: 'No monthly charge for participant debit cards.' },
        { label: 'Debit card order', amount: 2, unit: 'per card order', description: 'Charged when new or replacement cards are ordered. A single fee applies when enrolled in both Parking and Transit.' },
        { label: 'Standard file feed integration', amount: 0, description: 'Automated eligibility feed from a supported payroll or HRIS system.' }
      ],
      notes: ['The $125 plan setup and annual renewal fee includes plan design consultation, plan amendments and changes, annual nondiscrimination testing, and legal updates.']
    },

    lifestyle: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 125, renewalFee: 125,
          monthlyTiers: [
            { maxCount: 100, type: 'pppm', amount: 4.00, minMonthly: 65, label: '2 to 100 participants' },
            { maxCount: 200, type: 'pppm', amount: 3.75, label: '101 to 200 participants' },
            { maxCount: 500, type: 'pppm', amount: 3.50, label: '201 to 500 participants' }
          ],
          description: 'Full administration including plan document, monthly administration, and required notices',
          requiresCount: true
        },
        docsOnly: { setupFee: 250, renewalFee: 250, description: 'Standalone Lifestyle Benefit Plan documents only', requiresCount: false }
      },
      additionalFees: [
        { label: 'Debit cards', amount: 0, unit: 'monthly', description: 'No monthly charge for participant debit cards.' },
        { label: 'Debit card order', amount: 2, unit: 'per card order', description: 'Charged when new or replacement cards are ordered.' },
        { label: 'Standard file feed integration', amount: 0, description: 'Automated eligibility feed from a supported payroll or HRIS system.' }
      ],
      notes: ['The $125 plan setup and annual renewal fee includes plan design consultation, plan changes, and PDF print-ready required notices.']
    },

    directBilling: {
      type: 'tiered',
      setupFee: 250, renewalFee: 250,
      monthlyTiers: [
        { maxCount: null, type: 'pppm', amount: 3.00, minMonthly: 75, label: 'per participant per month' }
      ],
      additionalFees: [
        { label: 'Notices', amount: 2.50, unit: 'per notice', description: 'Billing statements and required notices sent to participants.' },
        { label: 'Standard file feed integration', amount: 0, description: 'Automated eligibility feed from a supported payroll or HRIS system.' }
      ],
      notes: ['Direct Billing handles premium collection, remittance, and tracking for retiree, leave-of-absence, and other non-COBRA continued-coverage situations. The minimum monthly fee is $75.']
    }
  },

  // ============================================================
  // NO-COMMISSION RATES
  // ============================================================
  noCommission: {

    pop: {
      type: 'package',
      packages: {
        docsOnly: { annualFee: 99,  commissionable: false, description: 'POP plan doc only: no testing' },
        popHsa:   { setupFee: 325,  renewalFee: 325,       description: 'POP plan doc + annual NDT for POP & HSA' },
        full:     { setupFee: 500,  renewalFee: 500,       description: 'POP plan doc + annual NDT for POP, FSA, LFSA, DCAP & HSA' }
      },
      additionalFees: [
        { label: 'Additional NDT (after first set per year)', amount: 250, unit: 'per additional test', description: 'Each nondiscrimination test set beyond the first one included per year.' },
        { label: 'Prior year NDT', amount: 300, unit: 'per plan year', description: 'Nondiscrimination testing for a prior plan year, typically requested to catch up or correct a year that was not tested.' },
        { label: 'Data manipulation / reformatting', amount: 5, unit: 'per participant', description: 'Reformatting or cleaning up census/participant data that is not provided in ABY\'s standard format.' }
      ]
    },

    fsa: {
      type: 'tiered',
      setupFee: 100, docsFee: 0, renewalFee: 100,
      monthlyTiers: [
        { maxCount: 19,   type: 'flat', amount: 80,   label: '<20 participants' },
        { maxCount: 99,   type: 'pppm', amount: 4.25, minMonthly: 80, label: '20–99 participants' },
        { maxCount: 200,  type: 'pppm', amount: 4.00, minMonthly: 80, label: '100 to 200 participants' }
      ],
      additionalFees: [
        { label: 'Plan documents (FSA/DCAP/LFSA/POP w/SPD)', amount: 0, description: '' },
        { label: 'Debit card order (FSA only)', amount: 5, unit: 'per order', description: 'Charged when new or replacement participant debit cards are ordered.' },
        { label: 'Direct deposits', amount: 0, description: 'Participant reimbursements paid by ACH at no per-transaction charge.' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: 'Issued when a participant is paid by mailed check instead of direct deposit.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
        { label: 'Paper enrollment package', amount: 2, unit: 'per packet', description: '' },
        { label: 'Paper/PDF setup or renewal', amount: 5, unit: 'per participant ($500 min)', description: '' }
      ]
    },

    hsa: {
      type: 'tiered',
      setupFee: 100, renewalFee: 0,
      monthlyTiers: [
        { maxCount: 14,   type: 'flat', amount: 45,   label: '<15 accounts' },
        { maxCount: 99,   type: 'pppm', amount: 3.05, minMonthly: 45, label: '15–99 accounts' },
        { maxCount: 200,  type: 'pppm', amount: 2.90, minMonthly: 45, label: '100 to 200 accounts' }
      ],
      additionalFees: [
        { label: 'Debit card order', amount: 5, unit: 'per order', description: 'Charged when new or replacement participant debit cards are ordered.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
        { label: 'Paper enrollment material', amount: 2, unit: 'per packet', description: '' }
      ],
      notes: ['Custodian: HSAToday. Participant-incurred ancillary fees (overdrafts, replacement cards, etc.) are billed directly to the account holder by the custodian.']
    },

    hra: {
      type: 'tiered',
      setupFee: 100, docsFee: 0, renewalFee: 100,
      monthlyTiers: [
        { maxCount: 19,   type: 'flat', amount: 80,   label: '<20 participants' },
        { maxCount: 99,   type: 'pppm', amount: 4.25, minMonthly: 80, label: '20–99 participants' },
        { maxCount: 200,  type: 'pppm', amount: 4.00, minMonthly: 80, label: '100 to 200 participants' }
      ],
      additionalFees: [
        { label: 'Plan documents (HRA w/SPD)', amount: 0, description: '' },
        { label: 'Direct deposits', amount: 0, description: 'Participant reimbursements paid by ACH at no per-transaction charge.' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: 'Issued when a participant is paid by mailed check instead of direct deposit.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' }
      ]
    },

    ichra: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 100, renewalFee: 100,
          monthlyTiers: [
            { maxCount: 19,   type: 'flat', amount: 80,   label: '<20 participants' },
            { maxCount: 99,   type: 'pppm', amount: 4.25, minMonthly: 80, label: '20–99 participants' },
            { maxCount: null, type: 'pppm', amount: 4.00, minMonthly: 80, label: '100+ participants' }
          ],
          description: 'Full administration including documents, SPD, and ongoing administration',
          requiresCount: true
        },
        docsOnly: { setupFee: 325, renewalFee: 325, description: 'Plan documents only: no monthly administration', requiresCount: false }
      },
      additionalFees: [
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
        { label: 'Direct deposits', amount: 0, description: 'Participant reimbursements paid by ACH at no per-transaction charge.' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: 'Issued when a participant is paid by mailed check instead of direct deposit.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' }
      ]
    },

    cobra: {
      type: 'tiered',
      setupFee: 100, renewalFee: 100,
      monthlyTiers: [
        { maxCount: 64,   type: 'flat', amount: 50,   label: '<65 employees' },
        { maxCount: null, type: 'pppm', amount: 0.80, minMonthly: 50, label: '65+ employees' }
      ],
      additionalFees: [
        { label: 'Qualifying Event (QE) notices', amount: 0, description: 'When an employee loses coverage (termination, reduction in hours, divorce, a dependent aging out), federal law requires a COBRA election notice. ABY prepares and mails these at no additional charge.' },
        { label: 'Initial/general rights notices during plan year', amount: 0, unit: 'per notice', description: 'The general COBRA rights notice sent to newly enrolled participants during the year. Included as part of standard administration.' },
        { label: 'Initial/general rights notices at setup or renewal (optional)', amount: 3, unit: 'per notice', description: 'If you would like ABY to mail the general rights notice to your entire covered population at setup or renewal, it is $3 per notice mailed.' },
        { label: 'COBRA participants', amount: 0, unit: 'per participant per month', description: 'There is no separate per-person charge for individuals actively enrolled in COBRA; their administration is covered by your monthly admin fee.' },
        { label: 'COBRA takeover', amount: 5, unit: 'per current participant (one-time)', description: 'A one-time fee to move existing COBRA participants from a prior administrator onto ABY\'s system, including their records, payment history, and remaining coverage timeline.' },
        { label: 'Retro notices', amount: 5, unit: 'per notice', description: 'A notice sent when COBRA coverage is applied or corrected retroactively.' },
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
        { label: 'Open enrollment: generic renewal notice', amount: 0, description: 'A general open-enrollment notice to participants about renewal and any plan changes. Included.' },
        { label: 'Open enrollment: full COBRA renewal packet mailed', amount: 15, unit: 'per packet', description: 'A complete printed renewal packet (new rates, plan summaries, and election materials) mailed to each COBRA participant at open enrollment.' }
      ],
      notes: [
        'Includes Texas State Continuation following COBRA for fully-insured groups.',
        'ABY collects and retains 2% of premiums collected from COBRA participants. This is paid by COBRA participants from their premium remittances and does not affect employer fees.'
      ]
    },

    stateContinuation: {
      type: 'tiered',
      setupFee: 100, renewalFee: 100,
      monthlyTiers: [
        { maxCount: null, type: 'flat', amount: 35, label: 'all groups' }
      ],
      additionalFees: [
        { label: 'Qualifying Event (QE) notices', amount: 0, description: 'When an employee loses coverage (termination, reduction in hours, divorce, a dependent aging out), federal law requires a COBRA election notice. ABY prepares and mails these at no additional charge.' },
        { label: 'Initial Rights notices during plan year', amount: 0, unit: 'per notice', description: '' },
        { label: 'Initial Rights notices at setup or renewal', amount: 1.50, unit: 'per notice', description: '' },
        { label: 'Takeover participants', amount: 5, unit: 'per participant (one-time)', description: '' },
        { label: 'Retro notices', amount: 5, unit: 'per notice', description: 'A notice sent when continuation coverage is applied or corrected retroactively.' },
        { label: 'Continuation participants', amount: 0, unit: 'per month', description: '' },
        { label: 'Open enrollment: generic renewal notice', amount: 0, description: 'A general open-enrollment notice to participants about renewal and any plan changes. Included.' },
        { label: 'Open enrollment: full continuation packet mailed', amount: 15, unit: 'per packet', description: 'A complete printed renewal packet mailed to each continuation participant at open enrollment.' }
      ]
    },

    erisa: {
      type: 'package',
      packages: {
        basic:          { annualFee: 400,  description: 'Electronic wrap "legal text" only' },
        buyUp:          { annualFee: 500,  description: 'Electronic wrap "legal text" and Section 125 plan without testing' },
        enhanced:       { annualFee: 675,  description: 'Electronic wrap "legal text" and Section 125 plan with POP/HSA testing' },
        fullSpd:        { annualFee: 675,  description: 'Full SPD and Section 125 plan without testing' },
        fullSpdTesting: { annualFee: 825,  description: 'Full SPD and Section 125 plan with POP/HSA testing' },
        whiteGlove:     { annualFee: 1050, description: 'Full SPD, Section 125 plan with POP/HSA testing, and Form 5500 filing' }
      },
      additionalFees: [
        { label: 'Annual Notice Packet', amount: 125, unit: 'per year', description: 'Includes GINA, CHIP, Medicare Creditable Coverage, HIPAA Special Enrollment, and Notice of Exchange.' },
        { label: 'FSA/DCAP language addition', amount: 125, unit: 'year 1', description: 'Adds Flexible Spending Account and/or Dependent Care Assistance Plan language to your wrap document. A one-time charge in the first year it is added.' },
        { label: 'FSA/DCAP NDT testing', amount: 175, unit: 'per year per test set', description: 'Annual nondiscrimination testing for FSA/DCAP plans, confirming benefits do not disproportionately favor highly compensated or key employees.' },
        { label: 'Additional current-year NDT (after one included)', amount: 125, unit: 'per additional test', description: 'One nondiscrimination test set is included with testing packages; any additional test for the current plan year is charged per test.' },
        { label: 'Prior year NDT', amount: 300, unit: 'per prior year', description: 'Nondiscrimination testing for a prior plan year, typically requested to catch up or correct a year that was not tested.' },
        { label: 'Annual hard copy', amount: 99, unit: 'each', description: 'A professionally printed copy of your wrap document and SPD. Documents are delivered electronically by default.' },
        { label: 'Additional USB (one included annually)', amount: 25, unit: 'each', description: 'Your documents come on one USB drive each year at no charge; additional copies are charged each.' },
        { label: 'Audit services', amount: 175, unit: 'per hour', description: 'Hands-on help responding to a Department of Labor or IRS audit or document request: gathering records, preparing responses, and supporting your team.' }
      ]
    },

    aca: {
      type: 'package-with-count',
      packages: buildAcaPackages({
        // Brown & Brown 2025 and Advocate 2026, both marked "no commission", taking the
        // higher figure where each document contradicted itself.
        // WARNING, AND IT IS A COMMERCIAL POINT FOR ERIC, NOT A CODING ONE: those figures
        // come out IDENTICAL to the commissioned book above. On the evidence supplied,
        // ACA C-form reporting carries no commission differential at all. That is a
        // change from what this file used to hold and it is flagged rather than assumed.
        // The two values with NO no-commission source are marked below.
        smallB_base: 450, smallB_perForm: 1,      // no no-commission B-form proposal supplied; left as they were
        fullLt100: 3300, fullMid: 3700, fullHigh: 4100, fullXL: 4550,   // fullXL: no no-comm source, matched to commissioned
        selfLt100: 1200, selfMid: 1550, selfHigh: 1850, selfXL: 2200    // selfXL: same
      }),
      additionalFees: acaAdditionalFees(),
      notes: [
        'Pricing is per EIN and is based on the number of forms created and filed. To count forms, total the employees who were full time on any day of the calendar year.',
        'Multi-EIN employers must take Full Service: Self Service is not available where a second EIN is involved. Each additional EIN is charged separately.',
        'These packages cover up to 1,000 forms. Above 1,000 forms please contact ABY, as pricing is quoted individually.'
      ]
    },

    mpra: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 100, renewalFee: 100,
          monthlyTiers: [
            { maxCount: null, type: 'flat', amount: 80, minMonthly: 80, label: 'monthly administration (under 20 participants)' }
          ],
          description: 'Full administration including plan document, SPD, and monthly administration',
          requiresCount: true
        },
        docsOnly: { setupFee: 325, renewalFee: 325, description: 'Plan document and SPD only: no monthly administration', requiresCount: false }
      },
      additionalFees: [
        { label: 'Standard file feed integration', amount: 0, description: 'Automated eligibility feed from a supported payroll or HRIS system, in ABY format.' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: 'A custom-built feed for a provider not already integrated with ABY.' },
        { label: 'Direct deposits', amount: 0, description: 'Reimbursements paid to participants by ACH at no per-transaction charge.' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: 'Issued when a participant is paid by mailed check instead of direct deposit.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Paper enrollment package', amount: 2, unit: 'per printed packet', description: 'Printed enrollment materials when the electronic package is not used.' },
        { label: 'Paper form / PDF setup or renewal', amount: 5, unit: 'per participant ($500 minimum)', description: 'Only billed if paper or PDF is used for setup or renewal instead of the ABY template.' }
      ],
      notes: ['Medicare HRA requires an employer with fewer than 20 employees and an ACA-compliant group medical plan. The minimum monthly administration fee is $80.']
    },

    section127: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 100, renewalFee: 100,
          monthlyTiers: [
            { maxCount: 100, type: 'pppm', amount: 3.75, minMonthly: 60, label: '2 to 100 participants' },
            { maxCount: 200, type: 'pppm', amount: 3.50, label: '101 to 200 participants' },
            { maxCount: 500, type: 'pppm', amount: 3.25, label: '201 to 500 participants' }
          ],
          description: 'Full administration including plan document, annual nondiscrimination testing, and monthly administration',
          requiresCount: true
        },
        docsOnly: { setupFee: 325, renewalFee: 325, description: 'Standalone Section 127 EDU/SLRP documents only', requiresCount: false }
      },
      additionalFees: [
        { label: 'Standard file feed integration', amount: 0, description: 'Automated eligibility feed from a supported payroll or HRIS system.' }
      ],
      notes: ['The $100 plan setup and annual renewal fee includes plan design consultation, plan amendments and changes, annual nondiscrimination testing, legal updates, and PDF print-ready required notices.']
    },

    section132: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 100, renewalFee: 100,
          monthlyTiers: [
            { maxCount: 19,   type: 'flat', amount: 80,   label: '<20 participants' },
            { maxCount: 99,   type: 'pppm', amount: 4.25, minMonthly: 80, label: '20–99 participants' },
            { maxCount: 200,  type: 'pppm', amount: 4.00, minMonthly: 80, label: '100 to 200 participants' }
          ],
          description: 'Full administration including plan document, annual nondiscrimination testing, and monthly administration',
          requiresCount: true
        },
        docsOnly: { setupFee: 325, renewalFee: 325, description: 'Standalone Section 132 QTB documents only', requiresCount: false }
      },
      additionalFees: [
        { label: 'Debit cards', amount: 0, unit: 'monthly', description: 'No monthly charge for participant debit cards.' },
        { label: 'Debit card order', amount: 2, unit: 'per card order', description: 'Charged when new or replacement cards are ordered. A single fee applies when enrolled in both Parking and Transit.' },
        { label: 'Standard file feed integration', amount: 0, description: 'Automated eligibility feed from a supported payroll or HRIS system.' }
      ],
      notes: ['The $100 plan setup and annual renewal fee includes plan design consultation, plan amendments and changes, annual nondiscrimination testing, and legal updates.']
    },

    lifestyle: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 100, renewalFee: 100,
          monthlyTiers: [
            { maxCount: 100, type: 'pppm', amount: 3.75, minMonthly: 60, label: '2 to 100 participants' },
            { maxCount: 200, type: 'pppm', amount: 3.50, label: '101 to 200 participants' },
            { maxCount: 500, type: 'pppm', amount: 3.25, label: '201 to 500 participants' }
          ],
          description: 'Full administration including plan document, monthly administration, and required notices',
          requiresCount: true
        },
        docsOnly: { setupFee: 250, renewalFee: 250, description: 'Standalone Lifestyle Benefit Plan documents only', requiresCount: false }
      },
      additionalFees: [
        { label: 'Debit cards', amount: 0, unit: 'monthly', description: 'No monthly charge for participant debit cards.' },
        { label: 'Debit card order', amount: 2, unit: 'per card order', description: 'Charged when new or replacement cards are ordered.' },
        { label: 'Standard file feed integration', amount: 0, description: 'Automated eligibility feed from a supported payroll or HRIS system.' }
      ],
      notes: ['The $100 plan setup and annual renewal fee includes plan design consultation, plan changes, and PDF print-ready required notices.']
    },

    directBilling: {
      type: 'tiered',
      setupFee: 250, renewalFee: 250,
      monthlyTiers: [
        { maxCount: null, type: 'pppm', amount: 3.00, minMonthly: 75, label: 'per participant per month' }
      ],
      additionalFees: [
        { label: 'Notices', amount: 2.50, unit: 'per notice', description: 'Billing statements and required notices sent to participants.' },
        { label: 'Standard file feed integration', amount: 0, description: 'Automated eligibility feed from a supported payroll or HRIS system.' }
      ],
      notes: ['Direct Billing handles premium collection, remittance, and tracking for retiree, leave-of-absence, and other non-COBRA continued-coverage situations. The minimum monthly fee is $75.']
    }
  }
};

// ── Multi-state wrap ────────────────────────────────────────────
// The rate set above is Texas pricing. We nest it under a state key so the
// engine can read pricing[state]. TX is the only state in this public file;
// other states are ABY-only and are supplied to the /aby view separately, so
// broker (public) pages never contain non-TX pricing. Adding a state later is
// a pure data addition: ABYQuote.pricing.CA = { commissioned:{...}, noCommission:{...} }.
// ── Outside Texas ───────────────────────────────────────────────
// Eric, 2026-08-18: "Out of Texas, PPPM fees for everything but COBRA can match the
// Texas prices, but make min billing $100 and setup/renewal $250. Outside Texas, COBRA
// pppm should be $1 with commissions and $.95 without. Setup $250 with commission or
// $200 without. Minimum is still $50." (and "match the Texas minimums: $55 and $50")
//
// ⛔ THIS IS A DEEP COPY, NEVER A REFERENCE. The obvious one-liner --
//    ABYQuote.pricing.OUTSIDE = ABYQuote.pricing.TX -- makes both keys point at ONE
//    object, so editing an Outside-Texas rate would silently change Texas too, and
//    every value-equality check would still pass because they ARE equal. The clone
//    below is what makes the two books independent.
//
// ⭐ It is DERIVED rather than duplicated on purpose: Eric's rule is "match the Texas
//    per-participant prices", so a Texas rate change should carry across by itself.
//    When a state needs genuinely independent numbers, replace this with a literal.
function buildOutsideTexas(tx) {
  var book = JSON.parse(JSON.stringify(tx));   // the deep copy

  ['commissioned', 'noCommission'].forEach(function (set) {
    var rates = book[set];
    if (!rates) return;
    var isComm      = (set === 'commissioned');
    var cobraSetup  = isComm ? 250 : 200;
    var cobraPppm   = isComm ? 1.00 : 0.95;
    var cobraMin    = isComm ? 55 : 50;

    // Texas State Continuation is a Texas product. It is not offered elsewhere.
    delete rates.stateContinuation;

    Object.keys(rates).forEach(function (productId) {
      var p = rates[productId];
      if (!p || typeof p !== 'object') return;

      if (productId === 'cobra') {
        p.setupFee = cobraSetup;
        p.renewalFee = cobraSetup;
        (p.monthlyTiers || []).forEach(function (t) {
          if (t.type === 'pppm') { t.amount = cobraPppm; t.minMonthly = cobraMin; }
          else if (t.type === 'flat') { t.amount = cobraMin; if (t.minMonthly) t.minMonthly = cobraMin; }
        });
        return;
      }

      // Everything else: Texas per-participant rates, a $100 monthly floor, and the
      // STANDARD admin setup/renewal lifted. Anything priced differently is left alone.
      applyOutside(p, isComm);
      if (p.packages) Object.keys(p.packages).forEach(function (k) { applyOutside(p.packages[k], isComm); });
    });
  });

  // Products Texas prices that are deliberately NOT sold outside Texas.
  // Read by check_state_parity.js so the absence is a decision on the record,
  // not an omission: an absent product looks identical to a forgotten one.
  book.notOffered = ['stateContinuation'];

  return book;

  function applyOutside(node, isComm) {
    if (!node || typeof node !== 'object') return;
    // ⭐ ERIC, 2026-08-18, asked twice and this is the SECOND, narrower answer:
    // "the docs only stay the way they are. It's the ones that normally have a $125/100
    // setup and renewal that should go to $250/200."
    // ⛔ So this is NOT a blanket $250 and NOT a floor. It moves exactly the STANDARD
    // administration fee and leaves every other price at its Texas value -- the
    // documents-only packages ($350/$325) and the POP packages ($550/$500) are untouched.
    // A blanket rule would have cut POP full from $550 to $250.
    var standard = isComm ? 125 : 100;   // what Texas charges for standard admin
    var lifted   = isComm ? 250 : 200;   // what it becomes outside Texas
    if (node.setupFee === standard) node.setupFee = lifted;
    if (node.renewalFee === standard) node.renewalFee = lifted;
    (node.monthlyTiers || []).forEach(function (t) {
      // A flat charge below the floor becomes the floor; per-participant rates are
      // unchanged and only their minimum moves.
      if (t.type === 'flat') { if (t.amount < 100) t.amount = 100; if (t.minMonthly != null) t.minMonthly = 100; }
      else { t.minMonthly = 100; }
    });
  }
}

ABYQuote.pricing = { TX: ABYQuote.pricing };
ABYQuote.pricing.OUTSIDE = buildOutsideTexas(ABYQuote.pricing.TX);
