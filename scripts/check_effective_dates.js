/**
 * check_effective_dates.js -- the ABY effective-date dropdown can never go empty (F-338).
 *
 * WHY THIS RUNS THE REAL FUNCTION RATHER THAN RE-IMPLEMENTING IT. The defect being guarded is an
 * interaction between three rules -- start at the current month, drop a month once past its 16th,
 * stop at a horizon -- and a reimplementation would encode my understanding of those rules, which is
 * exactly the thing under test. So the function's own source text is lifted out of app.js and
 * evaluated against frozen dates.
 *
 * WHAT IT ASSERTS:
 *   1. Eric's spec, verbatim: on 2026-08-17 the list runs through February 1, 2027.
 *   2. On 2026-09-01 it has gained March -- his own stated example of the roll.
 *   3. THE LIST IS NEVER EMPTY, at 60 monthly checkpoints across five years. This is the assertion
 *      that matters: the old hardcoded horizon did not make the list SHORT, it made it EMPTY, and
 *      the field is `required`, so an empty list is a tool that cannot produce a quote.
 *   4. The horizon is never further than 6 months out -- Eric capped it deliberately: "I don't want
 *      to go beyond that right now in case we change the pricing." Offering a date ABY has not
 *      committed pricing to is a commercial error, not a cosmetic one.
 *
 * Usage:  node scripts/check_effective_dates.js
 */
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "app.js"), "utf8");

function lift(name) {
  const start = SRC.indexOf("function " + name);
  if (start < 0) throw new Error("could not find function " + name + " -- has it been renamed?");
  let depth = 0, i = SRC.indexOf("{", start);
  const from = i;
  for (; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}") { depth--; if (depth === 0) break; }
  }
  return SRC.slice(start, i + 1);
}

const AHEAD = Number(/EFFECTIVE_DATE_MONTHS_AHEAD\s*=\s*(\d+)/.exec(SRC)[1]);

// Rebuild just enough of the module to run the real loop: a fake <select> that records options.
function optionsAsOf(iso) {
  const RealDate = Date;
  const frozen = new RealDate(iso + "T12:00:00");
  class FakeDate extends RealDate {
    constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(frozen); }
    static now() { return frozen.getTime(); }
  }
  const collected = [];
  const dateSelectEl = {
    innerHTML: "",
    appendChild(o) { if (o.value) collected.push({ value: o.value, label: o.textContent }); },
  };
  const document = { createElement: () => ({ value: "", textContent: "", disabled: false, selected: false }) };
  const body = `
    const Date = FakeDate;
    var EFFECTIVE_DATE_MONTHS_AHEAD = ${AHEAD};
    ${lift("maxEffectiveDate")}
    ${lift("buildEffectiveDateOptions")}
    buildEffectiveDateOptions();
  `;
  new Function("FakeDate", "dateSelectEl", "document", body)(FakeDate, dateSelectEl, document);
  return collected;
}

const fails = [];
const say = (as_of) => optionsAsOf(as_of).map((o) => o.value);

// 1 - Eric's spec, in his words
const aug = say("2026-08-17");
if (aug[aug.length - 1] !== "2027-02-01") {
  fails.push(`on 2026-08-17 the last date should be 2027-02-01 ("show through February right now"), got ${aug[aug.length - 1]}`);
}
if (aug[0] !== "2026-09-01") {
  fails.push(`on 2026-08-17 the first date should be 2026-09-01 (past the 16th, so August is gone), got ${aug[0]}`);
}

// 2 - his own example of the roll
const sep = say("2026-09-01");
if (!sep.includes("2027-03-01")) {
  fails.push(`on 2026-09-01 March should have appeared ("at the beginning of September you can add March"), got ${sep.join(", ")}`);
}

// 3 - never empty, ever. The defect this exists for.
for (let y = 2026; y <= 2030; y++) {
  for (let m = 1; m <= 12; m++) {
    for (const d of ["05", "20"]) {   // before and after the 16th cutoff
      const as_of = `${y}-${String(m).padStart(2, "0")}-${d}`;
      const got = say(as_of);
      if (got.length === 0) fails.push(`THE DROPDOWN IS EMPTY as of ${as_of} -- the tool cannot quote at all`);
      const horizon = new Date(got[got.length - 1] + "T12:00:00");
      const now = new Date(as_of + "T12:00:00");
      const months = (horizon.getFullYear() - now.getFullYear()) * 12 + (horizon.getMonth() - now.getMonth());
      if (months > AHEAD) fails.push(`as of ${as_of} the list reaches ${months} months out, beyond the agreed ${AHEAD}`);
    }
  }
}

if (fails.length) {
  console.error("\nX effective dates:\n");
  for (const f of [...new Set(fails)].slice(0, 12)) console.error("    - " + f);
  console.error();
  process.exit(1);
}
console.log(`\n[OK] effective dates: rolling ${AHEAD} months, never empty across 120 checkpoints.`);
console.log(`  as of 2026-08-17: ${aug.join(", ")}`);
console.log(`  as of 2026-09-01: ${sep.join(", ")}`);
