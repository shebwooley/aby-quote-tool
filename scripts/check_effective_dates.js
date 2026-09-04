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

// 🔴 THE `public/` SEGMENT WAS MISSING AND THIS CHECKER HAD NEVER RUN (F-484, fixed 2026-09-04).
// It opened `<repo>/assets/js/app.js`, which does not exist -- the served tree is `public/assets/`.
// Every invocation died `ENOENT` before a single assertion, and since ABY has no `prebuild` the
// only thing that runs these is a person at session start, so nothing ever reported it.
// ⛔ #249: a checker pointed at a dead tree is worse than no checker, because the suite looks
// complete. It was listed among the ABY checkers and counted as covered for as long as it existed.
// ⚠️ AND THERE IS A `<repo>/app.js` CARRYING A FUNCTION OF THE SAME NAME -- a dead root duplicate
// (F-485) -- so anybody debugging the path could reasonably have "found" the file and been misled.
const APP = path.join(__dirname, "..", "public", "assets", "js", "app.js");
if (!fs.existsSync(APP)) {
  // ⛔ CANNOT RUN IS A FAILURE, NEVER A PASS -- the same rule as check-agerating-parity. A missing
  // file means the rule is unchecked, and this checker has just spent months demonstrating that a
  // silent absence is indistinguishable from a green run.
  console.error("\nX effective dates: cannot read " + APP);
  console.error("  That is a FAILURE, not a pass -- nothing below was asserted.\n");
  process.exit(2);
}
// ⚠️ MUTABLE, so `--self-test` can run the same assertions against a sabotaged copy of app.js.
// `REAL_SRC` is never written to; `SRC` is what `lift()` and the AHEAD regex read.
const REAL_SRC = fs.readFileSync(APP, "utf8");
let SRC = REAL_SRC;

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

// Re-read per run: a sabotage that changes the horizon must change what the checker expects too,
// or the test would pass for the wrong reason.
let AHEAD;
function readAhead() {
  const m = /EFFECTIVE_DATE_MONTHS_AHEAD\s*=\s*(\d+)/.exec(SRC);
  if (!m) throw new Error("EFFECTIVE_DATE_MONTHS_AHEAD is gone from app.js");
  AHEAD = Number(m[1]);
}
readAhead();

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

// The assertions, as a function so `--self-test` can run them against a sabotaged source.
function runAssertions() {
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
        if (got.length === 0) { fails.push(`THE DROPDOWN IS EMPTY as of ${as_of} -- the tool cannot quote at all`); continue; }
        const horizon = new Date(got[got.length - 1] + "T12:00:00");
        const now = new Date(as_of + "T12:00:00");
        const months = (horizon.getFullYear() - now.getFullYear()) * 12 + (horizon.getMonth() - now.getMonth());
        if (months > AHEAD) fails.push(`as of ${as_of} the list reaches ${months} months out, beyond the agreed ${AHEAD}`);
      }
    }
  }
  return fails;
}

// ── SELF-TEST ────────────────────────────────────────────────────────────────────────────────
//
// ⭐⭐ ADDED 2026-09-04 WITH THE PATH FIX (F-484), AND IT IS THE HALF THAT MATTERED. Repointing the
// path made this checker RUN; it says nothing about whether it TESTS. A checker whose first real
// run is green is exactly the shape of one that asserts nothing -- TRAPS #24 -- and this one had
// never executed a single assertion, so nobody had ever seen it fail.
// ⛔ AND A SABOTAGE RUN BY HAND IS NOT A SELF-TEST (#125): it is a claim about a session nobody can
// re-check. Each sabotage below asserts its own mutation LANDED (#361), because a `replace()` that
// matches nothing changes nothing and reports "caught" for the wrong reason.
if (process.argv.includes("--self-test")) {
  const SABOTAGES = [
    { why: "the horizon is widened past what Eric agreed",
      // He capped it deliberately: "I don't want to go beyond that right now in case we change the
      // pricing." Offering a date ABY has not committed pricing to is a commercial error.
      edit: (s) => s.replace("var EFFECTIVE_DATE_MONTHS_AHEAD = 6;",
                             "var EFFECTIVE_DATE_MONTHS_AHEAD = 12;") },
    { why: "the horizon is FROZEN again -- the original defect, which emptied the list",
      // F-338: a hardcoded end date does not make the list short, it makes it EMPTY, and the field
      // is `required`, so the tool cannot produce a quote at all.
      edit: (s) => s.replace("return new Date(t.getFullYear(), t.getMonth() + EFFECTIVE_DATE_MONTHS_AHEAD, 1);",
                             "return new Date(2027, 1, 1);") },
    { why: "the 16th-of-the-month roll is dropped, so a stale month stays on offer",
      // ⚠️ The anchor is the REAL comparison, `todayMidnight < cutoff`, where `cutoff` is the 16th
      // of the month being offered. Written first as `d.getDate() > 16` -- a guess at the shape --
      // and the floor reported it BROKEN rather than letting it pass as caught. That floor is the
      // only reason this sabotage tests anything.
      edit: (s) => s.replace("if (todayMidnight < cutoff) {", "if (true) {") },
  ];

  let broken = 0, missed = 0;
  console.log("\nself-test: each sabotage must produce at least one failure\n");
  for (const s of SABOTAGES) {
    const mutated = s.edit(REAL_SRC);
    if (mutated === REAL_SRC) {
      broken++;
      console.log("  BROKEN " + s.why);
      console.log("         its edit matched NOTHING -- the anchor has rotted, so this tests nothing");
      continue;
    }
    SRC = mutated;
    let caught = false;
    try { readAhead(); caught = runAssertions().length > 0; }
    catch (e) { caught = true; }        // refusing to run at all is a red result
    SRC = REAL_SRC;
    readAhead();
    console.log("  " + (caught ? "ok    " : "MISSED") + " " + s.why);
    if (!caught) missed++;
  }
  if (broken || missed) {
    console.error(`\nX self-test: ${missed} missed, ${broken} broken.\n`);
    process.exit(1);
  }
  console.log(`\n[OK] ${SABOTAGES.length}/${SABOTAGES.length} sabotages caught, 0 broken.`);
}

const fails = runAssertions();
const aug = optionsAsOf("2026-08-17").map((o) => o.value);
const sep = optionsAsOf("2026-09-01").map((o) => o.value);

if (fails.length) {
  console.error("\nX effective dates:\n");
  for (const f of [...new Set(fails)].slice(0, 12)) console.error("    - " + f);
  console.error();
  process.exit(1);
}
console.log(`\n[OK] effective dates: rolling ${AHEAD} months, never empty across 120 checkpoints.`);
console.log(`  as of 2026-08-17: ${aug.join(", ")}`);
console.log(`  as of 2026-09-01: ${sep.join(", ")}`);
