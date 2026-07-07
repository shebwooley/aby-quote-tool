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
      { id: 'basic', name: 'Basic: Electronic Wrap "Legal Text" only' },
      { id: 'buyUp', name: 'Buy-Up: Wrap + Section 125 POP (no NDT testing)' },
      { id: 'enhanced', name: 'Enhanced: Wrap + Section 125 POP w/Testing for POP & HSA' },
      { id: 'fullPlan', name: 'Full Plan: Full SPD + POP w/Testing + Compliance Binder' },
      { id: 'whiteGlove', name: 'White Glove: Full SPD + POP w/Testing + 5500 Filing + Compliance Binder' }
    ]
  },
  {
    id: 'aca',
    name: 'ACA Forms 1094/1095 Reporting',
    shortName: 'ACA Reporting',
    inputType: 'package-with-count',
    countLabel: 'forms',
    packages: [
      { id: 'smallB',    name: 'Small Group / Self/Level/Balance Funded: 1094/1095-B (per-form)', requiresCount: true },
      { id: 'fullLt100', name: 'ALE Full Service: under 100 forms',     requiresCount: false },
      { id: 'fullMid',   name: 'ALE Full Service: 100–249 forms',       requiresCount: false },
      { id: 'fullHigh',  name: 'ALE Full Service: 250–499 forms',       requiresCount: false },
      { id: 'selfLt100', name: 'ALE Self Service: under 100 forms',     requiresCount: false },
      { id: 'selfMid',   name: 'ALE Self Service: 100–249 forms',       requiresCount: false },
      { id: 'selfHigh',  name: 'ALE Self Service: 250–499 forms',       requiresCount: false }
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
