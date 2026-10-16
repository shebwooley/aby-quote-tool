// check_pay_forms - each bank or payment form shows only when it applies (Eric, 10-16-2026).
//   bank form for reimbursements: HRA / Medicare HRA / FSA when ABY pays reimbursements (check OR direct deposit)
//   HSA funding bank form:        HSA funding option 2
//   ACH payment authorization:    plan documents only (every POP and ERISA wrap package; the documents-only
//                                 CHOICE Arrangement and Medicare HRA) - administered services are invoiced
//   node scripts/check_pay_forms.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('../public/assets/js/data/application-questions.js');
const { formsFor } = await import('../lib/application.js');

const out = [];
const files = (f, a, ach) => A.payForms(f, a, ach).map((x) => x.file).join(',');
out.push(['HRA, ABY pays: the reimbursement bank form', files(['hra'], { 'hra.fromEmployerAccount': true }) === 'ABY-reimbursement-bank-form.pdf']);
out.push(['HRA, employer pays: no bank form', files(['hra'], { 'hra.fromEmployerAccount': false }) === '']);
out.push(['HRA, unanswered: no bank form yet', files(['hra'], {}) === '']);
out.push(['Medicare HRA, ABY pays: the reimbursement bank form', files(['mhra'], { 'mhra.fromEmployerAccount': true }) === 'ABY-reimbursement-bank-form.pdf']);
out.push(['FSA, ABY pays: the reimbursement bank form', files(['fsa'], { 'fsa.abyIssues': true }) === 'ABY-reimbursement-bank-form.pdf']);
out.push(['HRA and FSA both paid by ABY: ONE reimbursement form, not two',
  files(['hra', 'fsa'], { 'hra.fromEmployerAccount': true, 'fsa.abyIssues': true }) === 'ABY-reimbursement-bank-form.pdf']);
out.push(['HSA option 2: the HSA funding form', files(['hsa'], { 'hsa.funding': 'Option 2: you upload a contribution file each payroll and ABY draws the money from your account.' }) === 'ABY-HSA-funding-bank-form.pdf']);
out.push(['HSA option 1: no bank form', files(['hsa'], { 'hsa.funding': 'Option 1 (preferred): direct deposit through your payroll.' }) === '']);
out.push(['an answer for a form not bought does nothing', files(['cobra'], { 'hra.fromEmployerAccount': true }) === '']);

const P = [
  { id: 'pop', name: 'Premium Only Plan (POP)' }, { id: 'erisa', name: 'ERISA Wrap Document & Compliance' },
  { id: 'ichra', name: 'ICHRA / QSEHRA' }, { id: 'mpra', name: 'Medicare Premium Reimbursement Arrangement (Medicare HRA)' },
  { id: 'hra', name: 'Section 105 Health Reimbursement Arrangement (HRA)' }, { id: 'cobra', name: 'COBRA Administration' },
];
const ach = (labels) => formsFor(P, labels).achPull;
out.push(['POP (any package): ACH', ach(['POP / Cafeteria Plan: Documents + NDT: POP plan document, and annual nondiscrimination testing for POP and HSA']) === true]);
out.push(['ERISA White Glove: ACH', ach(['ERISA Wrap Document: White Glove']) === true]);
out.push(['CHOICE Arrangement documents only: ACH', ach(['ICHRA / QSEHRA: Plan Documents Only']) === true]);
out.push(['CHOICE Arrangement full administration: invoiced, no ACH', ach(['ICHRA / QSEHRA: Full Administration']) === false]);
out.push(['Medicare HRA documents only: ACH', ach(['Medicare HRA: Documents Only']) === true]);
out.push(['Medicare HRA full administration: invoiced, no ACH', ach(['Medicare HRA: Full Administration']) === false]);
out.push(['HRA and COBRA: invoiced, no ACH', ach(['HRA', 'COBRA']) === false]);

for (const f of Object.values(A.PAY_FORMS)) out.push([`${f.file} is on disk`, fs.existsSync(new URL(`../public/assets/forms/${f.file}`, import.meta.url))]);
// ⛔ ABY's own bank details (the "push" form) are never a public download.
out.push(['ABY\'s own bank account form is not in the public folder',
  !fs.readdirSync(new URL('../public/assets/forms/', import.meta.url)).some((n) => /push/i.test(n))]);

let bad = 0;
for (const [name, ok] of out) { console.log((ok ? '  ok   ' : '  FAIL ') + name); if (!ok) bad++; }
console.log(bad ? `${bad} failed` : 'all green');
process.exit(bad ? 1 : 0);
