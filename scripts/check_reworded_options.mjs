// check_reworded_options - an application option reworded after people answered it still shows their answer.
//
// A saved choice IS the option's text, so rewording an option silently unticks every answer given in the old
// words. 10-06-2026: ABY asked for HSA funding option 2 to say the employer UPLOADS the contribution file rather
// than sends it to ABY. `formerly` maps the old text to the new; apply.js reads it when it ticks the radio.
//
//   node scripts/check_reworded_options.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const A = require('../public/assets/js/data/application-questions.js');

const out = [];
const ok = (n, c) => out.push([n, !!c]);
const all = [];
(function walk(x) {
  if (Array.isArray(x)) return x.forEach(walk);
  if (x && typeof x === 'object') {
    if (typeof x.key === 'string' && x.type) all.push(x);
    Object.values(x).forEach(walk);
  }
})(A);

const funding = all.find((q) => q.key === 'hsa.funding');
ok('the HSA funding question is found', !!funding);
const opt2 = (funding?.options ?? [])[1] ?? '';
ok('option 2 says the employer uploads the contribution file', /you upload a contribution file/.test(opt2));
ok('and no option still says they send it to ABY', !(funding?.options ?? []).some((o) => /send ABY/.test(o)));
ok('the old wording is mapped to the new', funding?.formerly?.['Option 2: you send ABY a contribution file each payroll and ABY draws the money from your account.'] === opt2);
const withFormerly = all.filter((q) => q.formerly);
ok('every formerly maps onto a CURRENT option of its own question', withFormerly.length > 0 &&
  withFormerly.every((q) => Object.values(q.formerly).every((n) => (q.options ?? []).includes(n))));

const apply = readFileSync(new URL('../public/assets/js/apply.js', import.meta.url), 'utf8');
const choice = apply.slice(apply.indexOf("case 'choice':"), apply.indexOf("case 'multi':"));
ok('the choice renderer reads formerly before ticking', /q\.formerly && q\.formerly\[v\]/.test(choice) && /cur === o/.test(choice));

let fail = 0;
for (const [n, c] of out) { console.log((c ? 'ok    ' : 'FAIL  ') + n); if (!c) fail++; }
if (out.length < 6) { console.log('FAIL  only ' + out.length + ' rules ran'); fail++; }
console.log('\ncheck_reworded_options - ' + (out.length - fail) + ' of ' + out.length + ' passed');
process.exit(fail ? 1 : 0);
