// ABY Quote Tool — Pricing tables
// Two parallel rate sets: `commissioned` and `noCommission`.
// The engine reads from one or the other based on the form's commission toggle.
// To update a price: edit the relevant entry below. No other files need to change.
//
// SOURCES:
//   - aby-pricing-template.xlsx (Eric's filled-in pricing, May 2026)
//   - "some updated pricing.pdf" (May 2026 email from Eric Johnson / ABY)

window.ABYQuote = window.ABYQuote || {};

// Helper to build the seven ACA packages — same shape both rate sets
function buildAcaPackages(rates) {
  return {
    smallB:    { description: 'Small Group / Self/Level/Balance Funded — Forms 1094/1095-B', formula: { base: 450, perForm: rates.smallB_perForm }, requiresCount: true },
    fullLt100: { description: 'ALE — Forms 1094/1095-C, Full Service (<100 forms)',          annualFee: rates.fullLt100 },
    fullMid:   { description: 'ALE — Forms 1094/1095-C, Full Service (100–249 forms)',       annualFee: rates.fullMid },
    fullHigh:  { description: 'ALE — Forms 1094/1095-C, Full Service (250–499 forms)',       annualFee: rates.fullHigh },
    selfLt100: { description: 'ALE — Forms 1094/1095-C, Self Service (<100 forms)',          annualFee: rates.selfLt100 },
    selfMid:   { description: 'ALE — Forms 1094/1095-C, Self Service (100–249 forms)',       annualFee: rates.selfMid },
    selfHigh:  { description: 'ALE — Forms 1094/1095-C, Self Service (250–499 forms)',       annualFee: rates.selfHigh }
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
        docsOnly: { annualFee: 99,  commissionable: false, description: 'POP plan doc only — no testing' },
        popHsa:   { setupFee: 350,  renewalFee: 350,       description: 'POP plan doc + annual NDT for POP & HSA' },
        full:     { setupFee: 550,  renewalFee: 550,       description: 'POP plan doc + annual NDT for POP, FSA, LFSA, DCAP & HSA' }
      },
      additionalFees: [
        { label: 'Additional NDT (after first set per year)', amount: 250, unit: 'per additional test', description: '' },
        { label: 'Prior year NDT', amount: 300, unit: 'per plan year', description: '' },
        { label: 'Data manipulation / reformatting', amount: 5, unit: 'per participant', description: '' }
      ]
    },

    fsa: {
      type: 'tiered',
      setupFee: 125, docsFee: 0, renewalFee: 125,
      monthlyTiers: [
        { maxCount: 19,   type: 'flat', amount: 85,   label: '<20 participants' },
        { maxCount: 99,   type: 'pppm', amount: 4.50, minMonthly: 85, label: '20–99 participants' },
        { maxCount: null, type: 'pppm', amount: 4.25, minMonthly: 85, label: '100+ participants' }
      ],
      additionalFees: [
        { label: 'Plan documents (FSA/DCAP/LFSA/POP w/SPD)', amount: 0, description: '' },
        { label: 'Debit card order (FSA only)', amount: 5, unit: 'per order', description: '' },
        { label: 'Direct deposits', amount: 0, description: '' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: '' },
        { label: 'Mobile app', amount: 0, description: '' },
        { label: 'Standard file feed integration', amount: 0, description: '' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: '' },
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
        { maxCount: null, type: 'pppm', amount: 3.05, minMonthly: 50, label: '100+ accounts' }
      ],
      additionalFees: [
        { label: 'Debit card order', amount: 5, unit: 'per order', description: '' },
        { label: 'Mobile app', amount: 0, description: '' },
        { label: 'Standard file feed integration', amount: 0, description: '' },
        { label: 'Custom file feed integration', amount: 0, unit: 'fee depends on provider', description: '' },
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
        { maxCount: null, type: 'pppm', amount: 4.25, minMonthly: 85, label: '100+ participants' }
      ],
      additionalFees: [
        { label: 'Plan documents (HRA w/SPD)', amount: 0, description: '' },
        { label: 'Direct deposits', amount: 0, description: '' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: '' },
        { label: 'Mobile app', amount: 0, description: '' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: '' }
      ]
    },

    ichra: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 125, renewalFee: 125,
          monthlyTiers: [
            { maxCount: 17,   type: 'flat', amount: 85,   label: '<18 participants' },
            { maxCount: 74,   type: 'pppm', amount: 4.50, minMonthly: 85, label: '18–74 participants' },
            { maxCount: null, type: 'pppm', amount: 4.25, minMonthly: 85, label: '75+ participants' }
          ],
          description: 'Full administration including documents, SPD, and ongoing administration',
          requiresCount: true
        },
        docsOnly: { setupFee: 350, renewalFee: 350, description: 'Plan documents only — no monthly administration', requiresCount: false }
      },
      additionalFees: [
        { label: 'Standard file feed integration', amount: 0, description: '' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: '' },
        { label: 'Direct deposits', amount: 0, description: '' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: '' },
        { label: 'Mobile app', amount: 0, description: '' }
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
        { label: 'Qualifying Event (QE) notices', amount: 0, description: '' },
        { label: 'Initial/general rights notices during plan year', amount: 0, unit: 'per notice', description: '' },
        { label: 'Initial/general rights notices at setup or renewal (optional)', amount: 3, unit: 'per notice', description: '' },
        { label: 'COBRA participants', amount: 0, unit: 'per participant per month', description: '' },
        { label: 'COBRA takeover', amount: 5, unit: 'per current participant (one-time)', description: '' },
        { label: 'Standard file feed integration', amount: 0, description: '' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: '' },
        { label: 'Open enrollment — generic renewal notice', amount: 0, description: '' },
        { label: 'Open enrollment — full COBRA renewal packet mailed', amount: 15, unit: 'per packet', description: '' }
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
        { label: 'Qualifying Event (QE) notices', amount: 0, description: '' },
        { label: 'Initial Rights notices during plan year', amount: 0, unit: 'per notice', description: '' },
        { label: 'Initial Rights notices at setup or renewal', amount: 1.50, unit: 'per notice', description: '' },
        { label: 'Takeover participants', amount: 5, unit: 'per participant (one-time)', description: '' },
        { label: 'Continuation participants', amount: 0, unit: 'per month', description: '' },
        { label: 'Open enrollment — generic renewal notice', amount: 0, description: '' },
        { label: 'Open enrollment — full continuation packet mailed', amount: 15, unit: 'per packet', description: '' }
      ]
    },

    erisa: {
      type: 'package',
      packages: {
        basic:      { setupFee: 400,  renewalFee: 300, description: 'Electronic Wrap "Legal Text" only' },
        buyUp:      { setupFee: 500,  renewalFee: 400, description: 'Electronic Wrap + Section 125 POP (no NDT testing)' },
        enhanced:   { setupFee: 625,  renewalFee: 500, description: 'Electronic Wrap + Section 125 POP w/Testing for POP & HSA' },
        fullPlan:   { setupFee: 950,  renewalFee: 625, description: 'Full SPD + Section 125 POP w/Testing + Compliance Binder' },
        whiteGlove: { setupFee: 1100, renewalFee: 750, description: 'Full SPD + Section 125 POP w/Testing + 5500 Filing + Compliance Binder' }
      },
      additionalFees: [
        { label: 'Annual Notice Packet', amount: 125, unit: 'per year', description: 'Includes GINA, CHIPS, Medicare Creditable Coverage, HIPAA Special Enrollment, and Notice of Exchange.' },
        { label: 'FSA/DCAP language addition', amount: 125, unit: 'year 1', description: '' },
        { label: 'FSA/DCAP NDT testing', amount: 175, unit: 'per year per test set', description: '' },
        { label: 'Additional current-year NDT (after one included)', amount: 125, unit: 'per additional test', description: '' },
        { label: 'Prior year NDT', amount: 300, unit: 'per prior year', description: '' },
        { label: 'Annual hard copy', amount: 99, unit: 'each', description: '' },
        { label: 'Additional USB (one included annually)', amount: 25, unit: 'each', description: '' },
        { label: 'Audit services', amount: 175, unit: 'per hour', description: '' }
      ]
    },

    aca: {
      type: 'package-with-count',
      packages: buildAcaPackages({
        smallB_perForm: 2,
        fullLt100: 3300, fullMid: 3650, fullHigh: 4100,
        selfLt100: 1250, selfMid: 1600, selfHigh: 1600
        // NOTE: Per Eric's pricing template, Self Service 250–499 is the same as 100–249 ($1600).
      }),
      additionalFees: []
    }
  },

  // ============================================================
  // NO-COMMISSION RATES
  // ============================================================
  noCommission: {

    pop: {
      type: 'package',
      packages: {
        docsOnly: { annualFee: 99,  commissionable: false, description: 'POP plan doc only — no testing' },
        popHsa:   { setupFee: 325,  renewalFee: 325,       description: 'POP plan doc + annual NDT for POP & HSA' },
        full:     { setupFee: 500,  renewalFee: 500,       description: 'POP plan doc + annual NDT for POP, FSA, LFSA, DCAP & HSA' }
      },
      additionalFees: [
        { label: 'Additional NDT (after first set per year)', amount: 250, unit: 'per additional test', description: '' },
        { label: 'Prior year NDT', amount: 300, unit: 'per plan year', description: '' },
        { label: 'Data manipulation / reformatting', amount: 5, unit: 'per participant', description: '' }
      ]
    },

    fsa: {
      type: 'tiered',
      setupFee: 100, docsFee: 0, renewalFee: 100,
      monthlyTiers: [
        { maxCount: 19,   type: 'flat', amount: 80,   label: '<20 participants' },
        { maxCount: 99,   type: 'pppm', amount: 4.25, minMonthly: 80, label: '20–99 participants' },
        { maxCount: null, type: 'pppm', amount: 4.00, minMonthly: 80, label: '100+ participants' }
      ],
      additionalFees: [
        { label: 'Plan documents (FSA/DCAP/LFSA/POP w/SPD)', amount: 0, description: '' },
        { label: 'Debit card order (FSA only)', amount: 5, unit: 'per order', description: '' },
        { label: 'Direct deposits', amount: 0, description: '' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: '' },
        { label: 'Mobile app', amount: 0, description: '' },
        { label: 'Standard file feed integration', amount: 0, description: '' },
        { label: 'Custom file feed integration', amount: 750, unit: 'annually', description: '' },
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
        { maxCount: null, type: 'pppm', amount: 2.90, minMonthly: 45, label: '100+ accounts' }
      ],
      additionalFees: [
        { label: 'Debit card order', amount: 5, unit: 'per order', description: '' },
        { label: 'Mobile app', amount: 0, description: '' },
        { label: 'Standard file feed integration', amount: 0, description: '' },
        { label: 'Custom file feed integration', amount: 0, unit: 'fee depends on provider', description: '' },
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
        { maxCount: null, type: 'pppm', amount: 4.00, minMonthly: 80, label: '100+ participants' }
      ],
      additionalFees: [
        { label: 'Plan documents (HRA w/SPD)', amount: 0, description: '' },
        { label: 'Direct deposits', amount: 0, description: '' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: '' },
        { label: 'Mobile app', amount: 0, description: '' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: '' }
      ]
    },

    ichra: {
      type: 'package-with-count',
      packages: {
        fullAdmin: {
          setupFee: 100, renewalFee: 100,
          monthlyTiers: [
            { maxCount: 17,   type: 'flat', amount: 80,   label: '<18 participants' },
            { maxCount: 74,   type: 'pppm', amount: 4.25, minMonthly: 80, label: '18–74 participants' },
            { maxCount: null, type: 'pppm', amount: 4.00, minMonthly: 80, label: '75+ participants' }
          ],
          description: 'Full administration including documents, SPD, and ongoing administration',
          requiresCount: true
        },
        docsOnly: { setupFee: 325, renewalFee: 325, description: 'Plan documents only — no monthly administration', requiresCount: false }
      },
      additionalFees: [
        { label: 'Standard file feed integration', amount: 0, description: '' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: '' },
        { label: 'Direct deposits', amount: 0, description: '' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: '' },
        { label: 'Mobile app', amount: 0, description: '' }
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
        { label: 'Qualifying Event (QE) notices', amount: 0, description: '' },
        { label: 'Initial/general rights notices during plan year', amount: 0, unit: 'per notice', description: '' },
        { label: 'Initial/general rights notices at setup or renewal (optional)', amount: 3, unit: 'per notice', description: '' },
        { label: 'COBRA participants', amount: 0, unit: 'per participant per month', description: '' },
        { label: 'COBRA takeover', amount: 5, unit: 'per current participant (one-time)', description: '' },
        { label: 'Standard file feed integration', amount: 0, description: '' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: '' },
        { label: 'Open enrollment — generic renewal notice', amount: 0, description: '' },
        { label: 'Open enrollment — full COBRA renewal packet mailed', amount: 15, unit: 'per packet', description: '' }
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
        { label: 'Qualifying Event (QE) notices', amount: 0, description: '' },
        { label: 'Initial Rights notices during plan year', amount: 0, unit: 'per notice', description: '' },
        { label: 'Initial Rights notices at setup or renewal', amount: 1.50, unit: 'per notice', description: '' },
        { label: 'Takeover participants', amount: 5, unit: 'per participant (one-time)', description: '' },
        { label: 'Continuation participants', amount: 0, unit: 'per month', description: '' },
        { label: 'Open enrollment — generic renewal notice', amount: 0, description: '' },
        { label: 'Open enrollment — full continuation packet mailed', amount: 15, unit: 'per packet', description: '' }
      ]
    },

    erisa: {
      type: 'package',
      packages: {
        basic:      { setupFee: 375,  renewalFee: 275, description: 'Electronic Wrap "Legal Text" only' },
        buyUp:      { setupFee: 475,  renewalFee: 375, description: 'Electronic Wrap + Section 125 POP (no NDT testing)' },
        enhanced:   { setupFee: 575,  renewalFee: 475, description: 'Electronic Wrap + Section 125 POP w/Testing for POP & HSA' },
        fullPlan:   { setupFee: 900,  renewalFee: 600, description: 'Full SPD + Section 125 POP w/Testing + Compliance Binder' },
        whiteGlove: { setupFee: 1025, renewalFee: 700, description: 'Full SPD + Section 125 POP w/Testing + 5500 Filing + Compliance Binder' }
      },
      additionalFees: [
        { label: 'Annual Notice Packet', amount: 125, unit: 'per year', description: 'Includes GINA, CHIPS, Medicare Creditable Coverage, HIPAA Special Enrollment, and Notice of Exchange.' },
        { label: 'FSA/DCAP language addition', amount: 125, unit: 'year 1', description: '' },
        { label: 'FSA/DCAP NDT testing', amount: 175, unit: 'per year per test set', description: '' },
        { label: 'Additional current-year NDT (after one included)', amount: 125, unit: 'per additional test', description: '' },
        { label: 'Prior year NDT', amount: 300, unit: 'per prior year', description: '' },
        { label: 'Annual hard copy', amount: 99, unit: 'each', description: '' },
        { label: 'Additional USB (one included annually)', amount: 25, unit: 'each', description: '' },
        { label: 'Audit services', amount: 175, unit: 'per hour', description: '' }
      ]
    },

    aca: {
      type: 'package-with-count',
      packages: buildAcaPackages({
        smallB_perForm: 1,
        fullLt100: 3150, fullMid: 3500, fullHigh: 3925,
        selfLt100: 1200, selfMid: 1525, selfHigh: 1525
      }),
      additionalFees: []
    }
  }
};
