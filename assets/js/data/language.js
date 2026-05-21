// ABY Quote Tool — Language blocks
// Centralized, reusable text content for proposals.
// Pulled from: ABY Quote Language.docx (the new master language doc — Feb 2026 revision).
// To revise wording: edit here, save, reload the page. No other files need to change.

window.ABYQuote = window.ABYQuote || {};

ABYQuote.language = {
  // ----------------------------------------------------------------
  // Standard sections — always shown on every quote
  // ----------------------------------------------------------------

  aboutABY: {
    heading: 'About ABY',
    paragraphs: [
      'ABY Benefits LLC is a Dallas–Fort Worth–based third-party administrator (TPA) specializing in flexible benefit plans and employer compliance solutions. Founded in 1986 and headquartered in Plano, Texas, ABY partners with employers nationwide to reduce healthcare costs while delivering strong, competitive benefit programs.',
      'We provide comprehensive administration for Health Reimbursement Arrangements (HRAs), Flexible Spending Accounts (FSAs), Health Savings Accounts (HSAs), Dependent Care Assistance Plans (DCAPs), COBRA, HIPAA, and related compliance services, including ERISA Wrap Documents and ACA Forms 1094/1095-C.',
      'Today, ABY supports more than 1,500 active employer clients and administers thousands of benefit plans across a wide range of industries. Our experienced team is built to scale—supporting small employers as well as organizations with complex plan designs or compliance requirements. Over the past three years, ABY has maintained steady annual growth while remaining focused on responsive service, accuracy, and long-term client relationships.'
    ],
    experienceHighlights: [
      '100+ years of combined industry experience across FSA/POP, HRA, COBRA, HSA, and group health benefits',
      'Active administration of more than 3,000 benefit plans nationwide',
      'Trusted provider of continuing education, delivering courses nationwide on Section 125, Section 105, COBRA, ACA compliance, ethics, and related HR topics'
    ]
  },

  standardServices: {
    heading: 'Standard Services Included With All ABY Plans',
    intro: 'All ABY clients receive a consistent level of service and support, regardless of the specific products selected. Included with every ABY-administered plan:',
    items: [
      { text: 'Dedicated Account Manager with direct phone and email access', bold: true },
      'Customized plan design and consultation',
      'Plan document package (unless a document-only option is elected)',
      'Electronic, employee-facing materials and communications',
      'Enrollment support, including DFW-area on-site meetings and virtual meetings',
      'Secure online portal with full employer, employee, and broker access',
      'Standard reporting and select ad-hoc reports as requested',
      'Mobile app access for participants, available via Google Play and the Apple App Store',
      { text: 'All fees guaranteed for three (3) years.', bold: true }
    ],
    closing: 'These services are designed to ensure consistent compliance, clear communication, and a positive experience for both employers and employees.'
  },

  commissionDisclosure: {
    heading: 'Commission & Pricing Disclosure',
    paragraphs: [
      'Unless otherwise noted, quoted fees include a standard broker commission. Discounts for bundled services may apply; all pricing shown assumes a single line of service unless specifically stated otherwise.',
      'Standalone Section 125 Premium Only Plan documents priced at $99 are non-commissionable, and no broker commission is included on that service.',
      'Pricing adjustments are typically available for brokers who elect not to receive commissions, and any such adjustments will be reflected directly in the quote.'
    ]
  },

  disclaimer: {
    heading: 'Proposal Disclaimer',
    text: 'This proposal is provided as a summary of the services available and is based on the information supplied at the time of quoting. Rates and costs shown may be affected by actual enrollment, census data, or other information provided during implementation. This proposal does not constitute a final offer or agreement.'
  },

  feeGuarantee: 'All fees guaranteed for three (3) years.',

  // ----------------------------------------------------------------
  // Cross-sell: "Additional Services ABY Offers"
  // Renders as the final page of every quote. Already-quoted products
  // are filtered out automatically; up to 6 of the rest are shown.
  // ----------------------------------------------------------------

  additionalServices: {
    heading: 'Additional Services ABY Offers',
    intro: 'In addition to the products in this proposal, ABY administers a wide range of compliance and benefit services. Below are a few you may be interested in. Contact us anytime for more information or a quote on any of these services.',
    services: [
      { id: 'pop',               name: 'Section 125 Premium Only Plan (POP)',          description: 'A POP allows employees to pay for qualifying group benefits with pre-tax dollars, reducing employee taxable income and generating FICA tax savings for the employer. ABY prepares the required plan documents and performs annual nondiscrimination testing.' },
      { id: 'fsa',               name: 'Flexible Spending Accounts (FSA / DCAP / LFSA)', description: 'FSAs and Dependent Care Assistance Plans let employees set aside pre-tax income for qualified healthcare and dependent care expenses, with payroll tax savings for employers and increased take-home pay for participants. Includes debit card and mobile app access.' },
      { id: 'hsa',               name: 'Health Savings Account (HSA) Administration',  description: 'HSAs pair with high-deductible health plans to give participants a triple tax advantage on healthcare savings. ABY coordinates account setup, payroll integration, debit cards, and ongoing administration with the HSA custodian.' },
      { id: 'hra',               name: 'Section 105 Health Reimbursement Arrangement (HRA)', description: 'A Section 105 HRA is an employer-funded benefit plan that reimburses employees for qualified medical expenses on a tax-free basis. Highly flexible plan design, with full administrative support and reimbursement processing.' },
      { id: 'ichra',             name: 'ICHRA / QSEHRA',                               description: 'Individual Coverage HRAs and Qualified Small Employer HRAs allow employers to reimburse employees—on a tax-free basis—for individual health insurance and qualified medical expenses, in lieu of (or alongside) a traditional group health plan.' },
      { id: 'cobra',             name: 'COBRA Administration',                         description: 'ABY administers the full COBRA lifecycle on the employer behalf, including required notices, election processing, premium collection, carrier coordination, and HIPAA-compliant participant communications.' },
      { id: 'stateContinuation', name: 'Texas State Continuation (Mini-COBRA)',         description: 'Texas State Continuation extends group medical coverage for employees of small fully-insured employers. Always included with COBRA administration at no additional cost; standalone administration is also available.' },
      { id: 'erisa',             name: 'ERISA Wrap Document & Compliance',              description: 'ABY prepares and maintains a customized ERISA Wrap Document and Summary Plan Description that consolidates an employer benefit plans, closing common compliance gaps and helping meet ongoing ERISA disclosure requirements.' },
      { id: 'aca',          name: 'ACA Forms 1094/1095 Reporting',            description: 'ABY prepares and files ACA Forms 1094/1095-B and 1094/1095-C for Applicable Large Employers and self/level-funded small employers, with self-service and full-service options available.' },
      { id: 'gagClause',    name: 'Gag Clause Attestation',                   description: 'ABY assists employers in meeting the annual Gag Clause Attestation requirement under the Consolidated Appropriations Act, ensuring health plan contracts do not include prohibited gag clauses.' },
      { id: 'rxdc',         name: 'Prescription Drug & Health Care Spending Reporting (RxDC)', description: 'ABY supports employers with annual RxDC reporting under the Consolidated Appropriations Act, gathering required carrier and PBM data for federal submission.' },
      { id: 'nqtl',         name: 'Mental Health Parity (NQTL) Analysis',     description: 'ABY conducts Non-Quantitative Treatment Limitation comparative analyses to help group health plan sponsors meet Mental Health Parity (MHPAEA) compliance obligations.' },
      { id: 'section132',   name: 'Section 132 Commuter Benefits',            description: 'Section 132 commuter benefit plans allow employees to use pre-tax dollars to pay for eligible parking and transit expenses, generating payroll tax savings for the employer.' },
      { id: 'section127',   name: 'Section 127 Educational Assistance / SLRP', description: 'Section 127 plans allow employers to provide up to $5,250 per employee per year in tax-free tuition reimbursement or qualifying student loan repayment.' },
      { id: 'lifestyle',    name: 'Lifestyle Benefit Plans',                  description: 'Lifestyle Benefit Plans give employers a flexible way to fund employee wellness, fitness, and lifestyle expenses through a structured, employer-managed reimbursement program.' },
      { id: 'directBilling', name: 'Direct Billing',                          description: 'ABY Direct Billing service handles premium collection, remittance, and tracking for retiree, leave-of-absence, or other non-COBRA continued-coverage scenarios where the employer needs to invoice participants directly.' }
    ],
    maxToShow: 6
  },

  // ----------------------------------------------------------------
  // Per-product overviews — only displayed for selected products
  // ----------------------------------------------------------------

  products: {

    pop: {
      heading: 'Section 125 Premium Only Plan (POP) / Cafeteria Plan Overview',
      paragraphs: [
        'A Section 125 Premium Only Plan (POP), also known as a Cafeteria Plan, allows eligible employees to pay for certain employer-sponsored benefits on a pre-tax basis. This structure reduces employees taxable income while generating payroll tax savings for the employer.',
        'Under a properly administered POP, employees may pay for qualified benefits—such as group health insurance premiums and dependent care—using pre-tax dollars. As a result, employees increase take-home pay, and employers reduce payroll taxes, including FICA, on those pre-tax contributions.',
        'Section 125 plans are subject to annual nondiscrimination testing, which is required by the Internal Revenue Code to ensure the plan does not disproportionately favor Highly Compensated Employees (HCEs) or Key Employees. This testing is similar in concept to 401(k) nondiscrimination testing and evaluates both eligibility and benefit utilization across employee groups.'
      ],
      bulletHeading: 'Required Section 125 nondiscrimination testing includes:',
      bullets: [
        'Eligibility Test — Confirms that a sufficient number of non-HCEs are eligible to participate',
        'Contributions and Benefits Test — Ensures benefit levels are not skewed in favor of HCEs',
        'Key Employee Concentration Test — Limits pre-tax benefits for key employees to no more than 25% of total plan benefits'
      ],
      closing: [
        'If a Section 125 plan fails nondiscrimination testing, affected benefits may become taxable to HCEs or key employees, and the employer may be exposed to additional IRS scrutiny or penalties. For this reason, ongoing plan administration and annual testing are critical components of maintaining a compliant POP.',
        'ABY administers Section 125 Premium Only Plans by preparing required plan documents, performing annual nondiscrimination testing based on employer-provided data, and providing corrective action guidance when testing results indicate potential issues—helping employers maintain compliance while preserving the intended tax advantages of the plan.',
        'For employers who purchase Flexible Spending Account (FSA) administration or certain ERISA compliance services, the required POP documentation and nondiscrimination testing are included as part of those services. In these cases, a separate standalone POP purchase is not required.'
      ]
    },

    fsa: {
      heading: 'Section 125 Cafeteria Plan with Flexible Spending Accounts (FSA) Overview',
      paragraphs: [
        'Flexible Spending Accounts (FSAs) are offered through a Section 125 Cafeteria Plan and allow employees to set aside pre-tax income to pay for qualified healthcare expenses. Dependent Care Assistance Plans (DCAPs) allow employees to use pre-tax dollars to pay for eligible dependent care expenses, such as daycare and after-school care. By using pre-tax dollars, employees reduce taxable income and increase take-home pay, while employers benefit from payroll tax savings.',
        'For 2026, contribution limits are $3,400 for medical FSAs and $7,500 for Dependent Care Assistance Plans (DCAPs).',
        'FSAs and DCAPs also generate employer payroll tax savings, as employee contributions are not subject to Social Security or Medicare taxes. When properly administered, these plans enhance the overall benefits package in a cost-effective way, helping employers attract and retain employees while supporting employee financial wellness by reducing out-of-pocket healthcare and dependent care costs.',
        'ABY administers Section 125 Cafeteria Plans with FSAs by preparing and maintaining required plan documents, including the Summary Plan Description (SPD), and performing annual Section 125 nondiscrimination testing to ensure the plan remains compliant and does not disproportionately benefit Highly Compensated or Key Employees.',
        'ABY FSA administration includes access to debit card functionality and mobile account management tools, allowing participants to pay for eligible expenses directly and manage their accounts without waiting for reimbursement, when permitted under IRS rules.',
        'FSAs may be structured alongside Health Savings Accounts when paired with a Limited-Purpose FSA (LFSA). In these arrangements, the HSA is used for medical and prescription expenses, while the LFSA is limited to eligible dental and vision expenses, preserving HSA eligibility while expanding benefit options.',
        'ABY administration may include any combination of POP, FSA, LFSA, and DCAP, as elected by the employer. A Section 125 Premium Only Plan (POP) is automatically included with FSA administration, and LFSA and DCAP options may be added without additional administrative charge.'
      ]
    },

    hsa: {
      heading: 'Health Savings Account (HSA) Administration Overview',
      paragraphs: [
        'A Health Savings Account (HSA) is a tax-advantaged savings account that allows eligible individuals to set aside funds for qualified medical expenses, including deductibles, copays, prescriptions, and certain over-the-counter items. To be eligible to contribute, individuals must be enrolled in a qualified High-Deductible Health Plan (HDHP) and have no disqualifying coverage, such as a general-purpose FSA or Medicare.'
      ],
      bulletHeading: 'HSAs offer a unique triple tax advantage:',
      bullets: [
        'Contributions are made on a pre-tax or tax-deductible basis',
        'Account earnings grow tax-free',
        'Withdrawals for qualified medical expenses are tax-free'
      ],
      closing: [
        'For 2026, contribution limits are $4,400 for employee-only coverage and $8,750 for family coverage, with an additional $1,000 catch-up contribution available to account holders age 55 and older.',
        'HSAs may be paired with a Limited-Purpose FSA when structured correctly. In these arrangements, the HSA is used for medical and prescription expenses, while the FSA is limited to eligible dental and vision expenses, helping preserve HSA eligibility while expanding employee benefit options.',
        'ABY administers HSA programs by coordinating account setup, payroll integration, and ongoing administration with the HSA custodian. This includes facilitating employee enrollment, supporting employer and employee contributions through payroll, and providing access to debit cards, mobile app functionality, online account management tools, bill pay services, and claims documentation storage.'
      ]
    },

    hra: {
      heading: 'Section 105 Health Reimbursement Arrangement (HRA) Overview',
      paragraphs: [
        'A Section 105 Health Reimbursement Arrangement (HRA) is an employer-funded benefit plan designed to reimburse employees for qualified medical expenses and, in some plan designs, individual insurance premiums. HRAs are funded entirely by the employer—employees do not contribute—and reimbursements are generally tax-free to the employee and tax-deductible to the employer.',
        'HRAs are highly customizable. Employers may design the plan to cover all or a portion of group health plan deductibles and copays, to reimburse dental and vision expenses, or to reimburse a specifically defined list of eligible expenses, depending on the employer benefit goals.',
        'HRAs may often be paired with other tax-advantaged accounts, including Health Savings Accounts (HSAs), depending on how the HRA is structured and which expenses it reimburses.',
        'HRAs are subject to specific IRS rules, including nondiscrimination requirements and proper documentation of reimbursements. ABY assists employers with plan design, plan documents, ongoing administration, and reimbursement processing to help maintain the plan tax-advantaged status.'
      ]
    },

    ichra: {
      heading: 'Individual Coverage HRA (ICHRA) / Qualified Small Employer HRA (QSEHRA) Overview',
      paragraphs: [
        'Individual Coverage HRAs (ICHRAs) and Qualified Small Employer HRAs (QSEHRAs) allow employers to reimburse employees—on a tax-free basis—for individual health insurance premiums and qualified medical expenses, in lieu of (or alongside) a traditional group health plan.',
        'An ICHRA is available to employers of any size and is generally used by employers who want to offer a defined-contribution benefit instead of, or in addition to, a group health plan. Employees must be enrolled in an ACA-compliant individual health plan to receive ICHRA reimbursements. Employers may segment employees into permitted classes (such as full-time vs. part-time, or salaried vs. hourly) and offer different reimbursement amounts to each class, subject to applicable rules.',
        'A QSEHRA is available only to small employers with fewer than 50 full-time and full-time-equivalent employees that do not offer a group health plan. Employees must maintain minimum essential coverage (MEC) to receive tax-free reimbursements. The arrangement must generally be offered to all eligible employees on the same terms, with limited variations permitted based on family status and age.',
        'Both arrangements are funded entirely by the employer; employees do not contribute. ABY assists employers with plan design, required plan documents, employee notices, and ongoing reimbursement administration in accordance with applicable IRS and ACA rules.'
      ]
    },

    cobra: {
      heading: 'COBRA Administration Overview',
      paragraphs: [
        'COBRA (the Consolidated Omnibus Budget Reconciliation Act) is a federal law that requires employers to offer continued group health coverage to eligible employees and dependents following certain qualifying events. COBRA compliance is highly technical, and the IRS has reported that a significant majority of employers are out of compliance and exposed to potential penalties.',
        'COBRA administration includes issuing required notices, managing elections, collecting and remitting premiums, communicating with insurance carriers, and properly terminating coverage when continuation rights end. These responsibilities must be handled accurately and within strict regulatory timeframes.',
        'Failure to comply with COBRA requirements can result in substantial penalties, including IRS excise taxes of up to $100 per day per qualified beneficiary, as well as ERISA penalties of up to $110 per day, per beneficiary.',
        'In general, employers with 20 or more employees are subject to federal COBRA. COBRA may apply not only to medical plans, but also to other employer-sponsored benefits such as FSAs, HRAs, dental, vision, prescription drug plans, and certain employee assistance programs.',
        'ABY administers the full COBRA lifecycle on the employer behalf. This includes issuing and tracking all required COBRA notices, processing elections, reinstating coverage for participants who timely elect COBRA, and managing ongoing premium collection. Participants are offered multiple payment options, including check, ACH, credit card, and debit card. ABY also monitors payment deadlines and grace periods and processes coverage terminations when premiums are not received in accordance with COBRA regulations.',
        'COBRA administration also involves compliance with HIPAA privacy and security requirements. Employers are responsible for safeguarding protected health information and maintaining compliant systems and processes. Failure to do so may result in regulatory penalties or employee litigation.'
      ]
    },

    stateContinuation: {
      heading: 'Texas State Continuation / Mini-COBRA Administration Overview',
      paragraphs: [
        'Texas State Continuation, often referred to as Mini-COBRA, is a state law requirement that applies to certain fully insured group medical plans governed by Texas insurance laws. In general, employers with fewer than 20 full-time equivalent (FTE) employees are required to offer continued group medical coverage for up to nine months following a qualifying termination of employment. State Continuation does not apply to self-funded plans.',
        'Employers that are not subject to federal COBRA must offer Texas State Continuation for up to nine months. Employers that are subject to federal COBRA are required to offer State Continuation for an additional six months after the federal COBRA continuation period ends, provided the group medical plan is fully insured and subject to Texas insurance regulations.',
        'Texas State Continuation applies only to fully insured group medical plans regulated by the Texas Department of Insurance. Employees electing continuation coverage are responsible for paying the full cost of coverage, including any applicable administrative fees.',
        'ABY administers the full State Continuation process on the employer behalf. This includes issuing and tracking all required State Continuation notices, processing elections, coordinating coverage reinstatement for participants who timely elect continuation, and managing ongoing premium collection. ABY monitors payment deadlines and grace periods and processes coverage terminations when premiums are not received in accordance with applicable state regulations.',
        'Failure to comply with Texas State Continuation requirements may result in penalties or enforcement actions imposed by state regulatory authorities.'
      ]
    },

    erisa: {
      heading: 'ERISA Wrap Document & Compliance Administration Overview',
      paragraphs: [
        'ERISA compliance is built on one core principle: timely and accurate communication with plan participants. The Employee Retirement Income Security Act (ERISA) applies to all employers—regardless of size—who offer employer-sponsored welfare benefit plans, and it establishes strict requirements around plan documentation, disclosure, and participant communication.',
        'ABY provides ERISA compliance administration by preparing and maintaining a customized ERISA Wrap Document that consolidates an employer benefit plans into a single, compliant framework. This ensures required plan terms, eligibility provisions, and administrative details are properly documented and communicated to employees in accordance with ERISA standards.',
        'As part of this service, ABY produces and maintains the required Summary Plan Description (SPD) and supporting compliance materials, helping employers meet ongoing disclosure obligations and respond to audit or participant inquiries. The wrap document is designed to wrap around carrier-provided certificates and summaries, closing common compliance gaps that occur when benefits are offered through multiple vendors.',
        'ABY ERISA Wrap Document services also include a Section 125 Premium Only Plan (POP), allowing eligible employee benefit contributions to be made on a pre-tax basis. This structure helps employers take advantage of current tax laws, generate FICA tax savings, and offer enhanced benefit options, while allowing employees to pay for qualified benefits and dependent care expenses with pre-tax dollars.',
        'Through document preparation, updates, and administrative support, ABY helps employers maintain ERISA compliance, reduce regulatory exposure, and ensure employees receive required benefit information clearly and on time.'
      ]
    },

    aca: {
      heading: 'ACA Forms 1094/1095 Reporting Overview',
      paragraphs: [
        'The Affordable Care Act (ACA) requires applicable employers to file annual information returns with the IRS and furnish related statements to employees. Forms 1094-B and 1095-B apply to insurers and certain small or self-funded employers, while Forms 1094-C and 1095-C apply to Applicable Large Employers (ALEs)—generally those with 50 or more full-time and full-time-equivalent employees.',
        'ABY prepares and files ACA Forms 1094 and 1095 on the employer\'s behalf, helping employers meet annual reporting obligations and avoid IRS penalties for incorrect or missed filings. Both self-service and full-service options are available for ALE filings, allowing employers to choose the level of preparation and review support that fits their needs. Pricing is tiered by total form count.',
        'Small group, self-funded, level-funded, and balance-funded employers filing Forms 1094-B / 1095-B are quoted with a flat annual base fee plus a per-form fee that scales with the number of covered individuals reported.'
      ]
    }
  }
};
