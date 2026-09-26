// DOES LOGGING IN ACTUALLY SAVE A BROKER ANY TYPING? (F-6, Eric 09-25-2026)
//
// ERIC: "Well this is stupid. So an agent logs in but it can't pre-fill their info, they have to type
// it in every time?" He was right, and it had been true since the account system was built.
//
// THE SHAPE OF THE ORIGINAL DEFECT IS WORTH MORE THAN THE FIX. Every piece existed: brokers stored a
// name, agency and phone; handleBrokerProfile carried the comment "Save the details that then carry
// into every quote. This IS the feature Eric asked for"; the sign-in page promised "Your details fill
// in automatically on every quote you run". ⛔ And nothing joined them. The quote form's boxes were
// plain empty inputs and the page never asked who was signed in for anything but a link label. A
// feature can be fully built, correctly described in two places, and wired nowhere (#93, #275, #284).
//
// ⛔ THIS READS SOURCE. It proves the WIRING, never that a real broker saw their name in the box -
// that needs an account to exist, which is Eric's step. ABY has no build step, so session start is the
// only trigger this can have.
//   node scripts/check_broker_prefill.mjs [--self-test]

import { readFileSync } from "node:fs";

const JS = "public/assets/js/account-link.js";
const HTML = "public/index.html";
const FIELDS = ["brokerName", "brokerAgency", "brokerPhone", "brokerEmail"];

let pass = 0, fail = 0;
const ok = (s) => { pass += 1; console.log("  ok    " + s); };
const bad = (s, why) => { fail += 1; console.log("  FAIL  " + s + "\n        " + why); };

function run(js, html) {
  const before = fail;

  // FLOOR (#360): every rule below asks "does this text contain X".
  if (js.length < 1000 || html.length < 1000) {
    bad("FLOOR: both files were read", "js=" + js.length + " html=" + html.length + " - the rules below would be vacuous");
    return fail > before;
  }
  ok("both files read (js " + js.length + ", html " + html.length + ")");

  // ---- 1. THE FORM STILL HAS THE FIELDS THIS FILLS. A rule naming a field the form dropped is a rule
  // about nothing, and it would keep passing forever.
  const missing = FIELDS.filter((f) => !html.includes('name="' + f + '"'));
  if (missing.length) bad("the quote form still has the fields being filled", "index.html has no " + missing.join(", "));
  else ok("the quote form carries all four fields");

  // ---- 2. THE SCRIPT IS ACTUALLY LOADED. Built and unreachable is this row's whole history.
  if (!/<script src="assets\/js\/account-link\.js"><\/script>/.test(html))
    bad("index.html loads account-link.js", "the file exists and nothing on the page runs it");
  else ok("index.html loads the script");

  // ---- 3. EVERY FIELD IS FILLED.
  const unfilled = FIELDS.filter((f) => !new RegExp('fill\\("' + f + '"').test(js));
  if (unfilled.length) bad("all four details are filled from the account", "not filled: " + unfilled.join(", "));
  else ok("name, agency, phone and email are all filled from the account");

  // ---- 4. ONLY WHEN EMPTY. A late fetch overwriting a half-typed quote is worse than no prefill.
  if (!/String\(el\.value \|\| ""\)\.trim\(\) !== ""/.test(js))
    bad("a field is filled ONLY when it is empty", "no emptiness guard - a slow response would overwrite what the broker typed");
  else ok("a field is filled only when empty, so typing is never overwritten");

  // ---- 5. NOT FOR ABY STAFF. They quote on behalf of a broker, so filling THEIR details would put the
  // wrong name on somebody else's quote - worse than an empty box.
  if (!/window\.ABY_INTERNAL/.test(js))
    bad("ABY staff are skipped", "an ABY admin running a quote for a broker would get their own name on it");
  else ok("ABY staff are skipped, so a quote run for a broker keeps the broker's details");

  // ---- 6. ONE READER. Two fetches for one fact is how two parts of a page disagree about who is
  // signed in (#505).
  // ⚠️ THE CALL, NOT THE MENTION. Counting every occurrence of the path matched the header comment that
  // explains why there is only one, and reported the code broken. Third time tonight that a rule was
  // satisfied or broken by the prose describing it (#126) - the pattern is: assert on syntax, not on a
  // noun.
  const calls = (js.match(/fetch\("\/api\/broker\/me"/g) || []).length;
  if (calls !== 1) bad("exactly one /api/broker/me call", "found " + calls + " - the label and the prefill must read one answer");
  else ok("one /api/broker/me call serves both the label and the prefill");

  // ---- 7. A FAILED FETCH LEAVES A WORKING FORM. The page must degrade to what it was, never to blank.
  if (!/\.catch\(function \(\) \{/.test(js))
    bad("a failed fetch leaves the page alone", "no catch - a network blip would throw inside the page script");
  else ok("a failed fetch leaves the signed-out page exactly as it is");

  return fail > before;
}

const js0 = readFileSync(JS, "utf8");
const html0 = readFileSync(HTML, "utf8");

console.log("\nDOES LOGGING IN SAVE A BROKER ANY TYPING? (F-6)\n");
run(js0, html0);

if (process.argv.includes("--self-test")) {
  console.log("\n  SELF-TEST - can each rule go red?\n");
  const cases = [
    ["the emptiness guard removed, so a slow fetch overwrites typing",
      (js) => js.replace('if (!el || String(el.value || "").trim() !== "") return false;', "if (!el) return false;"), null],
    ["the agency stopped being filled",
      (js) => js.replace('if (fill("brokerAgency", b.agency)) filled += 1;', ""), null],
    ["ABY staff stopped being skipped, so their name lands on a broker's quote",
      (js) => js.replace("if (window.ABY_INTERNAL) {", "if (false) {"), null],
    ["a second /api/broker/me call appeared",
      (js) => js.replace('fetch("/api/broker/me", { credentials: "same-origin" })',
                         'fetch("/api/broker/me");\n    fetch("/api/broker/me", { credentials: "same-origin" })'), null],
    ["the page stopped loading the script",
      null, (html) => html.replace('<script src="assets/js/account-link.js"></script>', "")],
    ["the form lost a field the prefill still names",
      null, (html) => html.replace('name="brokerAgency"', 'name="brokerFirm"')],
  ];
  let caught = 0;
  for (const [name, mj, mh] of cases) {
    const js = mj ? mj(js0) : js0;
    const html = mh ? mh(html0) : html0;
    if (js === js0 && html === html0) { console.log("  BROKEN  " + name + " - the sabotage matched nothing (#361)"); continue; }
    const keep = { pass, fail };
    pass = 0; fail = 0;
    const quiet = console.log; console.log = () => {};
    const went = run(js, html);
    console.log = quiet;
    pass = keep.pass; fail = keep.fail;
    if (went) { caught += 1; console.log("  ok      " + name + " -> RED"); }
    else console.log("  MISS    " + name + " -> still green");
  }
  console.log("\n  " + caught + "/" + cases.length + " sabotages reddened a rule");
  if (caught < cases.length) fail += 1;
}

console.log("\n  " + pass + " passed, " + fail + " failed");
console.log("  Source only: it proves the wiring, never that a broker saw their name in the box.\n");
process.exit(fail === 0 ? 0 : 1);
