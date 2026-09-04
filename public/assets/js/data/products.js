// ABY Quote Tool — Product registry
// Defines what products exist, how they accept input, and their display metadata.
// To add a new product: append an entry here AND a matching entry in pricing.js + language.js.

window.ABYQuote = window.ABYQuote || {};

ABYQuote.products = [
  {
    id: 'pop',
    name: 'Section 125 Premium Only Plan (POP)',
    shortName: 'POP / Cafeteria Plan',
    // ── ALL THREE OPTIONS, SIDE BY SIDE (Eric, 2026-09-04) ─────────────────────────────────
    //
    // "Right now we have drop-downs for the POP. We'd actually like to show all three options
    // in a grid. Or at least have the option to."
    //
    // ⭐ THE MACHINERY ALREADY EXISTED -- this is the same `multi-package` type ERISA has used
    // since it was built. What changes here is the TYPE and the DEFAULT, not the engine.
    // `defaultAll` ticks every box when the product is selected, so the broker gets all three
    // without doing anything and unticks whichever they do not want to show.
    //
    // 🔴 THE NAMES CHANGED AND THAT IS LOAD-BEARING, NOT COSMETIC. Two defects, both measured
    // by rendering all three through the real renderer BEFORE any of this was written:
    //   1. `splitPackageName` splits an option name on a COLON into a short name and a
    //      description. These three had no colon, so the "What is included" column rendered
    //      EMPTY on every row while ERISA's filled correctly. One name feeds two columns.
    //   2. "($99/yr)" was baked into the first name AND printed again in the fee column, so
    //      the same $99 appeared twice meaning two different things.
    // ⛔ THE PACKAGE IDS ARE UNCHANGED (`docsOnly` / `popHsa` / `full`). They are stored on
    // every saved quote and are what `PRODUCT_SHORT` in worker.js labels the quote log by.
    inputType: 'multi-package',
    defaultAll: true,
    packages: [
      { id: 'docsOnly', name: 'Documents Only: POP plan document, no nondiscrimination testing' },
      { id: 'popHsa',   name: 'Documents + NDT: POP plan document, and annual nondiscrimination testing for POP and HSA' },
      { id: 'full',     name: 'Documents + Full NDT: POP plan document, and annual nondiscrimination testing for POP, FSA, LFSA, DCAP and HSA' }
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
    // ⭐ ALL SIX TICKED BY DEFAULT (Eric, 2026-09-04): "Same with ERISA - I would like all
    // options shown by default." The checkboxes already existed and started EMPTY, so every
    // ERISA quote needed six deliberate clicks before it showed anything.
    inputType: 'multi-package',
    defaultAll: true,
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

    // ── ONE BAND, BOTH SERVICE LEVELS (Eric, 2026-09-04) ───────────────────────────────────
    //
    // "With ACA, I'd like for it to show full service and self service both by default, but if
    // it's multi-EIN or late, where full-service is required, I'd like the option of showing
    // full service only."
    //
    // ⭐ HE HAD ALREADY SAID THE SAME THING FROM THE OTHER SIDE, 2026-08-21, when the quote-log
    // label was designed: "A lot of the time we quote both full and self so it's hard to say."
    // That is why `PRODUCT_SHORT` labels every ALE package `1094/1095-C` with no service tier --
    // the log was built for this before the quote form could do it.
    //
    // 🔴 THE NINE PACKAGES ARE FOUR FORM-COUNT BANDS CROSSED WITH TWO SERVICE LEVELS, PLUS THE
    // SMALL-GROUP B FORM. A flat list of nine made the broker pick ONE, which is why quoting
    // both meant running the quote twice. The form now asks the two questions that actually
    // vary -- WHICH BAND, and BOTH LEVELS OR JUST FULL -- and computes the package ids from
    // them. ⛔ The output is still `packageIds`, exactly what ERISA emits, so the engine, the
    // renderer, `save-hook.js` and the worker's log label all keep working untouched.
    //
    // ⚠️ `smallB` HAS NO SERVICE LEVEL AND IS NOT AN ALE PRODUCT. It is the non-ALE B-form
    // filing, priced per form, so it is a band with one package and a count. Offering "both
    // service levels" there would invent a product ABY does not sell.
    inputType: 'package-band',
    serviceLevels: [
      { id: 'full', label: 'Full Service' },
      { id: 'self', label: 'Self Service' }
    ],
    // 🔴 THE DEFAULT BAND IS AN ALE ONE, AND IT HAS TO BE FOR THE ASK TO HOLD. `smallB` is first
    // in the list because that is the order the rate sheet reads, and it was also what the old
    // dropdown defaulted to -- but it is the ONE band with no service levels, so leaving the
    // default there would mean a new ACA quote showed a single option and Eric's "full service
    // and self service both by default" would be true of every band except the one you land on.
    // ⛔ Named rather than fixed by reordering the list: the reading order is a separate decision
    // from the default, and merging them means changing one to change the other.
    defaultBand: 'lt100',
    bands: [
      { id: 'smallB', label: 'Small group / self, level or balance funded: 1094/1095-B, per form',
        packages: { full: 'smallB' }, requiresCount: true },
      { id: 'lt100',  label: 'ALE: up to 100 forms',       packages: { full: 'fullLt100', self: 'selfLt100' } },
      { id: 'mid',    label: 'ALE: 101 to 250 forms',      packages: { full: 'fullMid',   self: 'selfMid'   } },
      { id: 'high',   label: 'ALE: 251 to 500 forms',      packages: { full: 'fullHigh',  self: 'selfHigh'  } },
      { id: 'xl',     label: 'ALE: 501 to 1,000 forms',    packages: { full: 'fullXL',    self: 'selfXL'    } }
    ],
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
    //
    // ⭐ WHAT MOVED ON 2026-09-04, AND WHAT DID NOT. The rule is unchanged and still fires on the
    // same three answers. What it now withdraws is the SELF SERVICE LEVEL rather than four
    // options from a dropdown, because the form no longer has that dropdown. The broker's
    // "show both" switch locks to Full Service only, says why, and cannot be switched back while
    // an excluding answer stands -- which is the same outcome by a mechanism the new form has.
    // ⚠️ Eric asked for "the OPTION of showing full service only". That switch is available on
    // EVERY quote, not only the excluded ones: a broker can choose to show Full Service alone
    // for a group with one EIN filing on time. The exclusion FORCES it; the switch OFFERS it.
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
