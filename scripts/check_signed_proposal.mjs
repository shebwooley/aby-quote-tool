// F-481 -- a SIGNED proposal shows what was signed, and stops offering to be signed again.
//
// WHY THIS EXISTS. serveSharedQuote read only the quotes table, so /q/<token> rendered the LIVE,
// EMPTY authorization form however many times the quote had been signed -- and went on showing a
// Submit button underneath it. Eric, 2026-09-02, on a commitment signed that day:
//
//     "when you click open the signed quote nothing is filled in."
//
// Nothing was ever lost: every field the employer typed was in the commitments table the whole
// time. The page simply never asked. Same shape as F-416's empty product box -- the store was
// faithful and only the READER disagreed.
//
// THE RULE THAT MATTERS MOST IS NOT "the fields are filled in", IT IS "the Submit button is GONE".
// A signed proposal that still invites a signature can be signed twice, which writes a second
// commitment for one agreement. That is the half a screenshot would not have caught.
//
// It drives the REAL renderer out of public/assets/js, in a sandbox, rather than a paraphrase.
//
// Run:  node scripts/check_signed_proposal.mjs [--self-test]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const selfTest = process.argv.includes("--self-test");

let pass = 0;
const fail = [];
const ok = (name, cond) => {
  if (cond) pass++;
  else fail.push(name);
  console.log("  " + (cond ? "ok  " : "FAIL") + " " + name);
};

function load(rendererSrc) {
  const sandbox = { window: {}, ABYQuote: {}, console, document: undefined };
  sandbox.window.ABYQuote = sandbox.ABYQuote;
  vm.createContext(sandbox);
  for (const f of ["public/assets/js/data/products.js",
                   "public/assets/js/data/pricing.js",
                   "public/assets/js/data/language.js",
                   "public/assets/js/lib/utils.js",
                   "public/assets/js/lib/engine.js"]) {
    vm.runInContext(readFileSync(join(root, f), "utf8"), sandbox);
  }
  vm.runInContext(rendererSrc, sandbox);
  return sandbox.window.ABYQuote || sandbox.ABYQuote;
}

// The commitment Eric reported on, with the personal details replaced. A fixture must not carry
// a real signer's contact details into the repository -- TRAPS #365, and this project has already
// paid for that once.
const SIGNED = {
  employerName:  "Fixture Holdings LLC",
  address:       "1 Example Way",
  cityStateZip:  "Dallas, TX, 75201",
  authSigner:    "Alex Fixture",
  authTitle:     "Human Resources Coordinator",
  authEmail:     "alex@example.invalid",
  authPhone:     "555-0100",
  hrContact:     "",
  hrTitle:       "",
  hrEmail:       "",
  hrPhone:       "",
  startDate:     "2026-10-01",
  acceptedPrint: "Alex Fixture",
  acceptedSign:  "Alex Fixture",
  submittedAt:   "2026-09-02T19:35:52.628Z",
};

const FORM = {
  clientName: "Fixture Holdings LLC",
  effectiveDate: "2026-10-01",
  commissioned: false,
  selections: [{ productId: "cobra", count: 130, packageId: "fullAdmin" }],
};

function renderWith(A, signed) {
  const results = A.engine.calculateAll(
    [{ productId: "cobra", count: 130, packageId: "fullAdmin" }], false, "TX");
  return A.renderer.renderForClient(FORM, results, "TX260901-8209-NC", {
    includeAuthorization: true,
    clientId: "",
    employerEditableCounts: true,
    signed: signed,
  });
}

function run(rendererSrc) {
  pass = 0;
  fail.length = 0;

  const A = load(rendererSrc);
  const signedHtml = renderWith(A, SIGNED);
  const blankHtml = renderWith(A, null);

  // -- FLOOR. If the renderer produced nothing, every "does it contain X" rule below is
  // vacuously answerable and the absence rules pass for the wrong reason (TRAPS #360).
  ok("floor: the signed page rendered something substantial", signedHtml.length > 4000);
  ok("floor: the unsigned page rendered something substantial", blankHtml.length > 4000);
  if (signedHtml.length <= 4000 || blankHtml.length <= 4000) return;

  // -- ① THE SIGNATURE IS SHOWN -------------------------------------------------------------
  ok("the signer's name appears on a signed page", signedHtml.includes("Alex Fixture"));
  ok("the signer's title appears", signedHtml.includes("Human Resources Coordinator"));
  ok("the address appears", signedHtml.includes("1 Example Way"));
  ok("the employer name appears", signedHtml.includes("Fixture Holdings LLC"));

  // -- ② THE BUTTON IS GONE. The rule this checker exists for. ------------------------------
  ok("a SIGNED page does not offer Submit Authorization",
    !signedHtml.includes("Submit Authorization to ABY"));
  ok("a signed page says so, and names who signed it",
    /Signed and submitted to ABY/.test(signedHtml) && /Authorized by Alex Fixture/.test(signedHtml));
  ok("a signed page does not invite a signature in the hint",
    !signedHtml.includes("Type your name in the Authorized Signer field above to sign"));
  // NAMES A SPECIFIC field()-RENDERED INPUT. A bare /readonly/ was the first version and the
  // self-test proved it vacuous: the signer box and the date box carry their own readonly, so
  // stripping it from field() -- which is every other field on the form -- left the rule green.
  // TRAPS #148.
  ok("the signed fields are read-only",
    /name="authTitle"[^>]*readonly/.test(signedHtml)
    && /name="address"[^>]*readonly/.test(signedHtml));

  // -- ③ THE UNSIGNED PAGE IS UNTOUCHED. A fix that breaks the ordinary path is not a fix, and
  // this is the path every employer who has NOT yet signed still uses.
  ok("an UNSIGNED page still offers Submit Authorization",
    blankHtml.includes("Submit Authorization to ABY"));
  ok("an unsigned page still carries the signing hint",
    blankHtml.includes("Type your name in the Authorized Signer field above to sign"));
  ok("an unsigned page still wires the live signature handler",
    blankHtml.includes("abySign(this.value)"));
  ok("an unsigned page has no read-only authorization fields",
    !/name="authTitle"[^>]*readonly/.test(blankHtml));

  // -- ④ THE DATE IS A DATE, NOT A TIMESTAMP OR A NaN ---------------------------------------
  // formatDateLong splits on "-" and wants three parts. Handed the raw ISO timestamp it takes
  // "02T19:35:52.628Z" as the day and prints "undefined NaN, NaN" -- and for anything that is
  // not three parts it returns its INPUT, so the near miss is a raw timestamp on a client
  // document rather than an error. Both are asserted against, by their fingerprints.
  ok("the signed date is rendered long-form", signedHtml.includes("September 2, 2026"));
  ok("no NaN or undefined reached the page",
    !/undefined NaN|NaN, NaN|\bundefined\b/.test(signedHtml));
  ok("the raw ISO timestamp is not printed at the reader",
    !signedHtml.includes("19:35:52"));

  console.log("\n  " + pass + " passed, " + fail.length + " failed");
}

const rendererPath = join(root, "public/assets/js/lib/renderer.js");
const rendererSrc = readFileSync(rendererPath, "utf8");

console.log("F-481 -- a signed proposal shows the signature and retires the button\n");
run(rendererSrc);
const realFailures = fail.length;

if (selfTest) {
  const sabotages = [
    // FLIPS THE CONDITION, producing VALID JavaScript that behaves wrongly. The first version
    // inserted a comma and the renderer threw a SyntaxError -- which the harness scored as
    // "caught" while testing nothing about the rule. A sabotage that breaks the wrong thing
    // certifies nothing (TRAPS #243).
    ["the Submit button comes back on a signed page",
      (s) => s.replace(
        "      (signed\n        ? '      <div class=\"ack-submit\"><div style=\"padding:14px",
        "      (false\n        ? '      <div class=\"ack-submit\"><div style=\"padding:14px")],
    ["field() stops preferring the signed value",
      (s) => s.replace(
        "var v = (signed && signed[fname] != null && signed[fname] !== '') ? signed[fname] : val;",
        "var v = val;")],
    ["the fields stop being read-only",
      (s) => s.replace("(signed ? ' readonly' : '')", "''")],
    ["the date is handed the raw timestamp again",
      (s) => s.replace(
        "u.formatDateLong(String(signed.submittedAt).slice(0, 10))",
        "u.formatDateLong(signed.submittedAt)")],
  ];

  console.log("\n\n=== SELF-TEST ===");
  let caught = 0;
  let broken = 0;
  for (const [name, mutate] of sabotages) {
    const mutated = mutate(rendererSrc);
    if (mutated === rendererSrc) {
      broken++;
      console.log("\n  BROKEN  " + name + " -- the sabotage matched NOTHING, its anchor is gone.");
      console.log("          That is an ABSENT test, not a passing or a failing one.");
      continue;
    }
    console.log("\n  sabotage: " + name);
    try {
      run(mutated);
      if (fail.length > realFailures) { caught++; console.log("  -> caught"); }
      else console.log("  -> MISSED");
    } catch (err) {
      // A sabotage that makes the renderer throw is still caught -- the page would not render.
      caught++;
      console.log("  -> caught (the renderer threw: " + String(err.message).slice(0, 60) + ")");
    }
  }
  console.log("\n  " + caught + "/" + sabotages.length + " caught, " + broken + " BROKEN");
  process.exit(caught === sabotages.length && broken === 0 ? 0 : 1);
}

process.exit(realFailures ? 1 : 0);
