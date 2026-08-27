// ── DOES A FIRM'S CHOSEN NAME REACH THE CLIENT'S DOCUMENT, AND ONLY THERE? (F-429) ──────────
//
// ⭐⭐ ERIC, 2026-08-27: "we might call an agency MMA-DFW but they may want it to say MMA or
// Marsh on the quote. Is it possible for us to have a friendly name for us and then a quoting
// name based on what they want for the quotes?"
//
// 🔴 THIS RENDERS THE REAL DOCUMENT AND READS THE HTML. Asserting that agencyLabel() returns the
// right string would pass with a call site still reading form.brokerAgency -- which is exactly
// the half-a-feature this project keeps shipping (TRAPS #315-#317). The letterhead and the
// closing contact card are SEPARATE functions and both had to change.
//
// ⛔ AND IT CHECKS THE NEGATIVE: the internal name must be ABSENT from a document that has a
// quoting name. A test that only asserts the new name is present would pass on a document
// printing both, which is worse than printing the wrong one.
import fs from 'fs';

// The REAL utils and language, not stubs. A stub escapeHtml would let a rendering bug through
// and would be exactly the fixture-tidier-than-production trap this project has already hit.
globalThis.window = globalThis;
const load = (f) => new Function(fs.readFileSync(f, 'utf8'))();
for (const f of ['assets/js/lib/utils.js', 'assets/js/data/language.js', 'assets/js/lib/renderer.js']) load(f);
const R = globalThis.ABYQuote.renderer;

const INTERNAL = 'MMA - DFW';
const CHOSEN = 'Marsh McLennan Agency';
const base = { brokerName: 'Niels Andersen', brokerAgency: INTERNAL, repName: 'Eric', clientName: 'Acme' };
const draw = (extra) => R.renderForClient({ ...base, ...extra }, [], 'TX260827-1001', {});
const count = (h, s) => h.split(s).length - 1;

let fail = 0;
const check = (name, cond) => { console.log((cond ? '  ok   ' : '  FAIL ') + name); if (!cond) fail++; };

const plain = draw({});
const named = draw({ brokerAgencyDisplay: CHOSEN });

check('a firm that has never been asked still prints our own name', count(plain, INTERNAL) >= 2);
check('a firm with a quoting name prints THEIRS', count(named, CHOSEN) >= 2);
check('and OURS is nowhere on their client document', count(named, INTERNAL) === 0);
check('both client-facing places changed, not one (' + count(plain, INTERNAL) + ' -> ' + count(named, CHOSEN) + ')',
      count(named, CHOSEN) === count(plain, INTERNAL));

// ⚠️ AN EMPTY OR WHITESPACE VALUE IS THE COMMON CASE -- 2,364 firms have never been asked. It
// must fall back, never blank the letterhead.
for (const bad of ['', '   ', null, undefined, 0, false]) {
  check('a quoting name of ' + JSON.stringify(bad) + ' falls back to ours',
        count(draw({ brokerAgencyDisplay: bad }), INTERNAL) >= 2);
}

// 🔴 THE SELF-TEST: revert either call site and this must go RED. A checker that cannot fail is
// a checker nobody can trust, and this project has shipped three of those.
const src = fs.readFileSync('assets/js/lib/renderer.js', 'utf8');
const sabotaged = src.replace('agencyLabel(form)].filter(Boolean).join(\', \')',
                              'form.brokerAgency].filter(Boolean).join(\', \')');
check('SELF-TEST: the sabotage actually changed the source', sabotaged !== src);
const keep = globalThis.ABYQuote.renderer;
new Function(sabotaged)();
const broken = globalThis.ABYQuote.renderer.renderForClient(
  { ...base, brokerAgencyDisplay: CHOSEN }, [], 'TX260827-1001', {});
check('SELF-TEST: reverting a call site is CAUGHT', count(broken, INTERNAL) > 0);

console.log(fail ? '\n>> ' + fail + ' FAILED -- the client document is not showing what the firm asked for.'
                 : '\nthe quoting name reaches the client document, in both places, and only there.');
process.exit(fail ? 1 : 0);
