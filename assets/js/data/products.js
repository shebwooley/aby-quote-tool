// ABY Quote Tool — Product registry
// Defines what products exist, how they accept input, and their display metadata.
// To add a new product: append an entry here AND a matching entry in pricing.js + language.js.

window.ABYQuote = window.ABYQuote || {};

ABYQuote.products = [
  {
    id: 'pop',
    name: 'Section 125 Premium Only Plan (POP)',
    shortName: 'POP / Cafeteria Plan',
    inputType: 'package', // user picks a package, no participant count
    packages: [
      { id: 'docsOnly', name: 'POP Documents Only ($99/yr)' },
      { id: 'popHsa', name: 'Documents + NDT for POP & HSA' },
      { id: 'full', name: 'Documents + NDT for POP/FSA/LFSA/DCAP/HSA' }
    ]
  },
  {
    id: 'fsa',
    name: 'Section 125 Cafeteria Plan with FSA / DCAP / LFSA',
    shortName: 'FSA / DCAP / LFSA',
    inputType: 'count',
    countLabel: 'participants',
    notes: ['POP automatically included with FSA administration. LFSA and DCAP may be added at no extra admin charge.']
  },
  {
    id: 'hsa',
    name: 'Health Savings Account (HSA) Administration',
    shortName: 'HSA',
    inputType: 'count',
    countLabel: 'accounts'
  },
  {
    id: 'hra',
    name: 'Section 105 Health Reimbursement Arrangement (HRA)',
    shortName: 'HRA',
    inputType: 'count',
    countLabel: 'participants'
  },
  {
    id: 'ichra',
    name: 'ICHRA / QSEHRA',
    shortName: 'ICHRA / QSEHRA',
    inputType: 'package-with-count',
    packages: [
      { id: 'fullAdmin', name: 'Full Administration', requiresCount: true },
      { id: 'docsOnly', name: 'Plan Documents Only', requiresCount: false }
    ],
    countLabel: 'participants'
  },
  {
    id: 'cobra',
    name: 'COBRA Administration',
    shortName: 'COBRA',
    inputType: 'count',
    countLabel: 'COBRA-eligible employees',
    notes: ['Includes Texas State Continuation following COBRA for fully-insured groups at no additional charge.']
  },
  {
    id: 'stateContinuation',
    name: 'Texas State Continuation (Mini-COBRA)',
    shortName: 'State Continuation',
    inputType: 'count',
    countLabel: 'employees',
    notes: ['Standalone State Continuation. If quoting alongside COBRA, this is included with COBRA: no need to add it separately.']
  },
  {
    id: 'erisa',
    name: 'ERISA Wrap Document & Compliance',
    shortName: 'ERISA Wrap Document',
    inputType: 'multi-package',
    packages: [
      { id: 'basic', name: 'Basic: Electronic wrap "legal text" only' },
      { id: 'buyUp', name: 'Buy-Up: Electronic wrap "legal text" and Section 125 plan without testing' },
      { id: 'enhanced', name: 'Enhanced: Electronic wrap "legal text" and Section 125 plan with POP/HSA testing' },
      { id: 'fullSpd', name: 'Full SPD: Full SPD and Section 125 plan without testing' },
      { id: 'fullSpdTesting', name: 'Full SPD + Testing: Full SPD and Section 125 plan with POP/HSA testing' },
      { id: 'whiteGlove', name: 'White Glove: Full SPD, Section 125 plan with POP/HSA testing, and Form 5500 filing' }
    ]
  },
  {
    id: 'aca',
    name: 'ACA Forms 1094/1095 Reporting',
    shortName: 'ACA Reporting',
    inputType: 'package-with-count',
    countLabel: 'forms',

    // ── EXTRA QUESTIONS ON THIS PRODUCT (Eric, 2026-08-26) ──────────────────────────────────
    //
    // "I had to run a manual quote earlier on 1094/1095-C forms because the quoting tool is not
    // set up right to handle it. Basically, this group has multiple EINs."
    //
    // ⭐⭐ THE RULE WAS ALREADY IN THE TOOL AND WAS ONLY PROSE. pricing.js has carried the note
    // "Multi-EIN employers must take Full Service: Self Service is not available where a second
    // EIN is involved" for as long as the ACA product has existed -- as a sentence in a footnote
    // that a broker had to read and then act on. Nothing stopped anybody quoting Self Service to
    // a multi-EIN group, which is why this quote had to be built by hand.
    // A rule with no enforcement is a preference.
    //
    // ⛔ THE COUNTS ARE ASKED AS TWO SEPARATE QUESTIONS, NOT ONE PLUS A RATE. The price splits at
    // ten W-2s and the two bands are $375 and $750, so "how many additional EINs" alone cannot be
    // priced -- and a single question with a rate picked afterwards is how somebody prices nine
    // small EINs at the large rate.
    // ⚠️ W-2s, NOT FTEs, and that is Eric's own document's wording. Niels described the same split
    // as "1 to 9 FTE / 10+ FTE" on 2026-08-26; a W-2 count and an FTE count are different numbers
    // for the same group. FLAGGED TO ERIC, unanswered, and left as W-2 because that is what both
    // the tool and the proposal he sends already say. Do not quietly switch it.
    extras: [
      { id: 'einLarge', label: 'Additional EINs with 10 or more W-2s', type: 'number',
        fee: 750, feeUnit: 'per additional EIN', electedLabel: '$750.00 per additional EIN with 10 or more W-2s' },
      { id: 'einSmall', label: 'Additional EINs with fewer than 10 W-2s', type: 'number',
        fee: 375, feeUnit: 'per additional EIN', electedLabel: '$375.00 per additional EIN with fewer than 10 W-2s' },
      // ⭐ THE BOUNDARY IS EXCLUSIVE ON ONE SIDE AND INCLUSIVE ON THE OTHER, ON PURPOSE. Eric's
      // manual proposal says "10 or more" AND "10 or fewer" on the same page, so an EIN with
      // exactly ten W-2s qualifies for both $375 and $750. Page 4 of that document says "2-9"
      // instead, which disagrees with page 3 and drops 0 and 1. This is the only version of the
      // three that partitions the range. Reported to Eric 2026-08-26.
      { id: 'priorYears', label: 'Also filing for a prior year (late filing)', type: 'checkbox' },
      { id: 'stateFirst', label: 'EINs needing state filing (first state)', type: 'number',
        fee: 500, feeUnit: 'per EIN', electedLabel: '$500.00 for the first state (per EIN)' },
      { id: 'stateMore', label: 'Additional states, across those EINs', type: 'number',
        fee: 350, feeUnit: 'per EIN, per state', electedLabel: '$350.00 for each additional state (per EIN)' }
    ],

    // ── WHEN SELF SERVICE IS NOT ON OFFER ───────────────────────────────────────────────────
    // Eric: "If a group has multiple EINs or if they are filing late (past years), then
    // self-service is not an option and should not be included on the quote."
    // ⛔ NOT GREYED OUT AND NOT FOOTNOTED -- ABSENT. A disabled option still tells the employer a
    // cheaper thing exists that they are being refused, which is a conversation ABY does not want
    // to have on a proposal.
    excludeWhenAnyOf: ['einLarge', 'einSmall', 'priorYears'],
    excludedPackages: ['selfLt100', 'selfMid', 'selfHigh', 'selfXL'],
    excludedReason: 'Self Service is not available to an employer with more than one EIN, or when a prior year is being filed late.',

    packages: [
      { id: 'smallB',    name: 'Small Group / Self/Level/Balance Funded: 1094/1095-B (per-form)', requiresCount: true },
      { id: 'fullLt100', name: 'ALE Full Service: up to 100 forms',       requiresCount: false },
      { id: 'fullMid',   name: 'ALE Full Service: 101 to 250 forms',      requiresCount: false },
      { id: 'fullHigh',  name: 'ALE Full Service: 251 to 500 forms',      requiresCount: false },
      { id: 'fullXL',    name: 'ALE Full Service: 501 to 1,000 forms',    requiresCount: false },
      { id: 'selfLt100', name: 'ALE Self Service: up to 100 forms',       requiresCount: false },
      { id: 'selfMid',   name: 'ALE Self Service: 101 to 250 forms',      requiresCount: false },
      { id: 'selfHigh',  name: 'ALE Self Service: 251 to 500 forms',      requiresCount: false },
      { id: 'selfXL',    name: 'ALE Self Service: 501 to 1,000 forms',    requiresCount: false }
    ]
  },
  {
    id: 'mpra',
    name: 'Medicare Premium Reimbursement Arrangement (Medicare HRA)',
    shortName: 'Medicare HRA',
    inputType: 'package-with-count',
    packages: [
      { id: 'fullAdmin', name: 'Full Administration', requiresCount: true },
      { id: 'docsOnly', name: 'Documents Only', requiresCount: false }
    ],
    countLabel: 'participants'
  },
  {
    id: 'section127',
    name: 'Section 127 Educational Assistance (EDU) & Student Loan Reimbursement (SLRP)',
    shortName: 'Section 127 EDU / SLRP',
    inputType: 'package-with-count',
    packages: [
      { id: 'fullAdmin', name: 'Full Administration', requiresCount: true },
      { id: 'docsOnly', name: 'Documents Only', requiresCount: false }
    ],
    countLabel: 'participants'
  },
  {
    id: 'section132',
    name: 'Section 132 Qualified Commuter Benefits (QTB)',
    shortName: 'Section 132 Commuter (QTB)',
    inputType: 'package-with-count',
    packages: [
      { id: 'fullAdmin', name: 'Full Administration', requiresCount: true },
      { id: 'docsOnly', name: 'Documents Only', requiresCount: false }
    ],
    countLabel: 'participants'
  },
  {
    id: 'lifestyle',
    name: 'Lifestyle Benefit Plan (LSB)',
    shortName: 'Lifestyle Benefit',
    inputType: 'package-with-count',
    packages: [
      { id: 'fullAdmin', name: 'Full Administration', requiresCount: true },
      { id: 'docsOnly', name: 'Documents Only', requiresCount: false }
    ],
    countLabel: 'participants'
  },
  {
    id: 'directBilling',
    name: 'Direct Billing',
    shortName: 'Direct Billing',
    inputType: 'tiered',
    countLabel: 'participants'
  }
];
