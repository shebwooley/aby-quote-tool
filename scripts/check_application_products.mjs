// check_application_products.mjs - do the setup questions recognize what an employer signed for? (F-625)
//
// WHY IT EXISTS: the first live signature (09-29-2026) stored "HRA" and "COBRA" - products.js's
// shortName - while the matcher looked only for the full product name, so the setup page asked
// nothing and said "ABY will follow up separately about: HRA, COBRA." The fix keeps a copy of five
// short names in application-questions.js; this fails the moment that copy and products.js differ,
// and replays the exact labels that signature stored.
//
//   node scripts/check_application_products.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Q = require('../public/assets/js/data/application-questions.js');
const ctx = {}; ctx.window = ctx;   // products.js writes window.ABYQuote, then reads the bare global
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../public/assets/js/data/products.js', import.meta.url), 'utf8') +
  ';window.__p = ABYQuote.products;', ctx);
const products = ctx.window.__p;

let fails = 0;
const check = (name, cond, detail) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : '  <- ' + detail));
  if (!cond) fails++;
};

console.log('SETUP QUESTIONS <-> PRODUCTS (F-625)\n');
Object.keys(Q.FORM_FOR_PRODUCT).forEach((id) => {
  const p = products.find((x) => x.id === id);
  check('product "' + id + '" exists in products.js', !!p, 'missing');
  if (p) check('short name for "' + id + '" matches products.js', Q.SHORT_NAME[id] === (p.shortName || p.name),
    JSON.stringify(Q.SHORT_NAME[id]) + ' vs ' + JSON.stringify(p.shortName));
});

// The matcher itself, on the labels the live signature stored and on the older full-name form.
const { formsFor } = await import('../lib/application.js');
const quoted = products.filter((p) => ['cobra', 'hra', 'aca'].includes(p.id)).map((p) => ({ id: p.id, name: p.name }));
let r = formsFor(quoted, ['HRA', 'COBRA']);
check('short labels (the 09-29 live signature) find both forms', r.forms.join() === 'cobra,hra' && !r.other.length, JSON.stringify(r));
r = formsFor(quoted, quoted.map((p) => p.name));
check('full names still work, and a service with no form yet (ACA) is named as a follow-up', r.forms.join() === 'cobra,hra' && r.other.length === 1, JSON.stringify(r));
r = formsFor(quoted, ['HRA: Basic']);
check('a label with an option after a colon still matches', r.forms.join() === 'hra', JSON.stringify(r));

// The other lines of service (09-30-2026): the package decides the Form 5500, the product decides the census.
const all = products.map((p) => ({ id: p.id, name: p.name }));
r = formsFor(all, ['ERISA Wrap Document: White Glove']);
check('ERISA White Glove adds the Form 5500 questions', r.forms.join() === 'erisa,f5500', JSON.stringify(r.forms));
r = formsFor(all, ['ERISA Wrap Document: Full SPD']);
check('any other ERISA package does not', r.forms.join() === 'erisa', JSON.stringify(r.forms));
r = formsFor(all, ['ICHRA / QSEHRA', 'FSA / DCAP / LFSA', 'POP / Cafeteria Plan', 'HSA', 'Medicare HRA']);
check('ICHRA, FSA, POP, HSA and Medicare HRA each find their form', r.forms.join() === 'hra,mhra,pop,fsa,hsa', JSON.stringify(r.forms));
check('an ICHRA gets the contribution census, FSA the FSA census',
  r.census.map((c) => c.file).join() === 'ABY-ICHRA-census-template.xlsx,ABY-FSA-census-template.xlsx,ABY-HRA-census-template.xlsx', JSON.stringify(r.census));
const { existsSync } = await import('node:fs');
Object.values(Q.CENSUS).forEach((c) => check('census file exists: ' + c.file,
  existsSync(new URL('../public/assets/forms/' + c.file, import.meta.url)), 'missing'));

console.log(fails ? '\n' + fails + ' failed' : '\nall green');
process.exit(fails ? 1 : 0);
