// check_agency_defaults.mjs - F-631 (Eric and Niels, 10-01-2026): an agency's quote defaults.
//
//   1. The ONE-SETUP-FEE rule (engine.bundleSetupFees): one administration setup fee per quote, the
//      rest waived; POP, ERISA, documents-only and direct billing never touched.
//   2. The settings endpoints, run for real on Node's own SQLite (no wrangler): saved, read back,
//      refused when wrong, and a database that has not been migrated never breaks a broker's sign-in.
//
//   node scripts/check_agency_defaults.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import {
  AGENCY_DEFAULT_MIGRATIONS, agencyDefaultsFor, handleGetAgencyDefaults, handleSaveAgencyDefaults,
} from '../lib/agency-defaults.js';

let fails = 0;
const check = (name, cond, detail) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : '  <- ' + detail));
  if (!cond) fails++;
};

// ── 1. the engine rule ─────────────────────────────────────────────────────────────────────
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['data/products.js', 'data/pricing.js', 'lib/utils.js', 'lib/engine.js']) {
  vm.runInContext(readFileSync(new URL('../public/assets/js/' + f, import.meta.url), 'utf8'), ctx);
}
const E = ctx.window.ABYQuote.engine;
const fees = (sel, commissioned = true) => E.bundleSetupFees(E.calculateAll(sel, commissioned, 'TX'))
  .map((r) => r.productId + (r.packageId ? '.' + r.packageId : '') + ':' +
    (r.setupFee ? (r.setupFee.waived ? 'waived' : r.setupFee.amount) : '-')).join(' ');

console.log('ONE SETUP FEE ON A BUNDLE (F-631)\n');
check('COBRA + FSA + HRA: one $125 charged, two waived (Eric\'s example)',
  fees([{ productId: 'cobra', count: 30 }, { productId: 'fsa', count: 30 }, { productId: 'hra', count: 30 }]) === 'cobra:125 fsa:waived hra:waived',
  fees([{ productId: 'cobra', count: 30 }, { productId: 'fsa', count: 30 }, { productId: 'hra', count: 30 }]));
check('HSA and state continuation are in the bundle',
  fees([{ productId: 'hsa', count: 30 }, { productId: 'stateContinuation', count: 3 }]) === 'hsa:125 stateContinuation:waived',
  fees([{ productId: 'hsa', count: 30 }, { productId: 'stateContinuation', count: 3 }]));
check('ICHRA and Medicare HRA full administration are in ("Yes let\'s put them in there as well")',
  fees([{ productId: 'ichra', packageId: 'fullAdmin', count: 30 }, { productId: 'mpra', packageId: 'fullAdmin', count: 5 }]) === 'ichra.fullAdmin:125 mpra.fullAdmin:waived',
  fees([{ productId: 'ichra', packageId: 'fullAdmin', count: 30 }, { productId: 'mpra', packageId: 'fullAdmin', count: 5 }]));
const mixed = fees([{ productId: 'cobra', count: 30 }, { productId: 'pop', packageId: 'full' },
  { productId: 'ichra', packageId: 'docsOnly', count: 5 }, { productId: 'directBilling', count: 3 }]);
check('POP, documents-only and direct billing are never waived ("Not things like ERISA fees or document only fees")',
  mixed === 'cobra:125 pop.full:550 ichra.docsOnly:350 directBilling:250', mixed);
check('a single administration service keeps its setup fee', fees([{ productId: 'fsa', count: 30 }]) === 'fsa:125', fees([{ productId: 'fsa', count: 30 }]));
check('the no-commission rate book works the same way',
  fees([{ productId: 'cobra', count: 30 }, { productId: 'fsa', count: 30 }], false) === 'cobra:100 fsa:waived',
  fees([{ productId: 'cobra', count: 30 }, { productId: 'fsa', count: 30 }], false));

// ── 2. the settings, on a real database ─────────────────────────────────────────────────────
function d1(db) {
  return { prepare(sql) { let a = []; const st = {
    bind(...x) { a = x; return st; },
    async first() { return db.prepare(sql).get(...a) || null; },
    async run() { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; },
  }; return st; } };
}
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE agencies (id TEXT, name TEXT)');
db.prepare('INSERT INTO agencies VALUES (?, ?)').run('ag1', 'Test Agency');
const env = { DB: d1(db) };

console.log('\nAGENCY SETTINGS\n');
check('before /api/migrate, reading the defaults returns null instead of failing a sign-in', (await agencyDefaultsFor(env, 'ag1')) === null, 'threw or returned something');
AGENCY_DEFAULT_MIGRATIONS.forEach((m) => db.exec(m.sql));
const post = (b) => handleSaveAgencyDefaults(new Request('https://x', { method: 'POST', body: JSON.stringify(b) }), env);
let r = await post({ id: 'ag1', rep: 'niels', commission: false, oneSetupFee: true });
let j = await r.json();
check('saved and read back', r.status === 200 && j.defaults.rep === 'niels' && j.defaults.commission === false && j.defaults.oneSetupFee === true, JSON.stringify(j));
const seen = await agencyDefaultsFor(env, 'ag1');
check('the broker\'s sign-in sees the same three settings', seen && seen.rep === 'niels' && seen.commission === false && seen.oneSetupFee === true, JSON.stringify(seen));
r = await post({ id: 'ag1', rep: 'somebody', commission: true });
check('an unknown rep is refused', r.status === 400, String(r.status));
r = await post({ id: 'ag1', rep: null, commission: null, oneSetupFee: false });
j = await r.json();
check('"No default" clears them', j.defaults.rep === null && j.defaults.commission === null && j.defaults.oneSetupFee === false, JSON.stringify(j.defaults));
r = await handleGetAgencyDefaults(new URL('https://x/?id=nope'), env);
check('an unknown agency is a 404', r.status === 404, String(r.status));

// ── 3. the quote page is wired to it ───────────────────────────────────────────────────────
const app = readFileSync(new URL('../public/assets/js/app.js', import.meta.url), 'utf8');
check('the quote page applies the defaults from the broker\'s sign-in', /applyAgencyDefaults\(d\.agencyDefaults/.test(app), 'call missing');
check('the bundle rule wraps the engine only when the agency has it', /ad\.oneSetupFee && !bundlePatched/.test(app), 'guard missing');
check('never on ABY\'s own page or a shared employer link', /window\.ABY_INTERNAL \|\| window\.__ABY_SHARED/.test(app), 'guard missing');

console.log(fails ? '\n' + fails + ' failed' : '\nall green');
process.exit(fails ? 1 : 0);
