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
    smallB:    { description: 'Small Group / Self/Level/Balance Funded: Forms 1094/1095-B', formula: { base: 450, perForm: rates.smallB_perForm }, requiresCount: true },
    fullLt100: { description: 'ALE: Forms 1094/1095-C, Full Service (<100 forms)',          annualFee: rates.fullLt100 },
    fullMid:   { description: 'ALE: Forms 1094/1095-C, Full Service (100–249 forms)',       annualFee: rates.fullMid },
    fullHigh:  { description: 'ALE: Forms 1094/1095-C, Full Service (250–499 forms)',       annualFee: rates.fullHigh },
    selfLt100: { description: 'ALE: Forms 1094/1095-C, Self Service (<100 forms)',          annualFee: rates.selfLt100 },
    selfMid:   { description: 'ALE: Forms 1094/1095-C, Self Service (100–249 forms)',       annualFee: rates.selfMid },
    selfHigh:  { description: 'ALE: Forms 1094/1095-C, Self Service (250–499 forms)',       annualFee: rates.selfHigh }
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
        { maxCount: null, type: 'pppm', amount: 4.25, minMonthly: 85, label: '100+ participants' }
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
        { maxCount: null, type: 'pppm', amount: 3.05, minMonthly: 50, label: '100+ accounts' }
      ],
      additionalFees: [
        { label: 'Debit card order', amount: 5, unit: 'per order', description: 'Charged when new or replacement participant debit cards are ordered.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 0, unit: 'fee depends on provider', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
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
        { label: 'Direct deposits', amount: 0, description: 'Participant reimbursements paid by ACH at no per-transaction charge.' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: 'Issued when a participant is paid by mailed check instead of direct deposit.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' }
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
        docsOnly: { setupFee: 350, renewalFee: 350, description: 'Plan documents only: no monthly administration', requiresCount: false }
      },
      additionalFees: [
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
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
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
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
        { label: 'Continuation participants', amount: 0, unit: 'per month', description: '' },
        { label: 'Open enrollment: generic renewal notice', amount: 0, description: 'A general open-enrollment notice to participants about renewal and any plan changes. Included.' },
        { label: 'Open enrollment: full continuation packet mailed', amount: 15, unit: 'per packet', description: 'A complete printed renewal packet mailed to each continuation participant at open enrollment.' }
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
        smallB_perForm: 2,
        fullLt100: 3300, fullMid: 3650, fullHigh: 4100,
        selfLt100: 1250, selfMid: 1600, selfHigh: 1600
        // NOTE: Per Eric's pricing template, Self Service 250–499 is the same as 100–249 ($1600).
      }),
      additionalFees: []
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
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: 'A custom-built feed for a provider not already integrated with ABY.' },
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
            { maxCount: 50,   type: 'pppm', amount: 4.00, minMonthly: 65, label: '2 to 50 participants' },
            { maxCount: 100,  type: 'pppm', amount: 3.75, label: '51 to 100 participants' },
            { maxCount: null, type: 'pppm', amount: 3.50, label: '101 to 250 participants' }
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
            { maxCount: 15,   type: 'flat', amount: 80, minMonthly: 80, label: '2 to 15 participants' },
            { maxCount: 50,   type: 'pppm', amount: 4.50, label: '16 to 50 participants' },
            { maxCount: 100,  type: 'pppm', amount: 4.25, label: '51 to 100 participants' },
            { maxCount: null, type: 'pppm', amount: 4.00, label: '101 to 200 participants' }
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
            { maxCount: 50,   type: 'pppm', amount: 4.00, minMonthly: 65, label: '2 to 50 participants' },
            { maxCount: 100,  type: 'pppm', amount: 3.75, label: '51 to 100 participants' },
            { maxCount: 250,  type: 'pppm', amount: 3.50, label: '101 to 250 participants' },
            { maxCount: null, type: 'pppm', amount: 3.25, label: '251 to 500 participants' }
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
        { maxCount: null, type: 'pppm', amount: 4.00, minMonthly: 80, label: '100+ participants' }
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
        { maxCount: null, type: 'pppm', amount: 2.90, minMonthly: 45, label: '100+ accounts' }
      ],
      additionalFees: [
        { label: 'Debit card order', amount: 5, unit: 'per order', description: 'Charged when new or replacement participant debit cards are ordered.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 0, unit: 'fee depends on provider', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
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
        { label: 'Direct deposits', amount: 0, description: 'Participant reimbursements paid by ACH at no per-transaction charge.' },
        { label: 'Paper checks', amount: 5, unit: 'per check', description: 'Issued when a participant is paid by mailed check instead of direct deposit.' },
        { label: 'Mobile app', amount: 0, description: 'Participant mobile app and online account access.' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' }
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
        docsOnly: { setupFee: 325, renewalFee: 325, description: 'Plan documents only: no monthly administration', requiresCount: false }
      },
      additionalFees: [
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
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
        { label: 'Standard file feed integration', amount: 0, description: 'An automated eligibility feed from a supported payroll or HRIS system so enrollment changes flow to ABY automatically.' },
        { label: 'Custom file feed integration', amount: 500, unit: 'annually', description: 'A custom-built eligibility feed for a payroll or HRIS provider not already integrated with ABY, using our SFTPs.' },
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
        { label: 'Continuation participants', amount: 0, unit: 'per month', description: '' },
        { label: 'Open enrollment: generic renewal notice', amount: 0, description: 'A general open-enrollment notice to participants about renewal and any plan changes. Included.' },
        { label: 'Open enrollment: full continuation packet mailed', amount: 15, unit: 'per packet', description: 'A complete printed renewal packet mailed to each continuation participant at open enrollment.' }
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
        smallB_perForm: 1,
        fullLt100: 3150, fullMid: 3500, fullHigh: 3925,
        selfLt100: 1200, selfMid: 1525, selfHigh: 1525
      }),
      additionalFees: []
    }
  }
};

// ── Multi-state wrap ────────────────────────────────────────────────────────
// The rate set above is Texas pricing. We nest it under a state key so the
// engine can read pricing[state]. TX is the only state in this public file;
// other states are ABY-only and are supplied to the /aby view separately, so
// broker (public) pages never contain non-TX pricing. Adding a state later is
// a pure data addition: ABYQuote.pricing.CA = { commissioned:{...}, noCommission:{...} }.
ABYQuote.pricing = { TX: ABYQuote.pricing };
