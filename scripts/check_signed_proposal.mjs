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

function run(rendererSrc, appSrcIn) {
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
  // ⛔ REMOVING THE BUTTON IS NOT ENOUGH. The handler is bound to the FORM, so Enter in any field
  // fires it, and the service checkboxes stay interactive. It happens to throw on the missing
  // button and abort before the fetch -- safe BY ACCIDENT, a TypeError standing in for a rule.
  // A signed document must not bind it at all.
  ok("a signed page does not bind the submit handler",
    !/onsubmit="submitCommitment/.test(signedHtml));
  ok("an unsigned page still binds it, or nobody could ever sign",
    /onsubmit="submitCommitment/.test(blankHtml));

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

  // -- ⑤ EVERY RENDER THAT CARRIES THE AUTHORIZATION PAGE MUST CARRY THE SIGNATURE ----------
  //
  // 🔴 THIS IS THE RULE THE FIRST FIX NEEDED AND DID NOT HAVE. The signature was threaded into
  // the ON-SCREEN render and not the DOWNLOAD one, so Download HTML produced a file with a blank
  // employer form on a proposal that had already been signed. Eric found it within minutes:
  // "when I click download html it clears out the employer form on the last page again."
  //
  // ⛔ ADDING `signed` TO THE SECOND CALL SITE WOULD HAVE FIXED THE SYMPTOM AND KEPT THE SHAPE.
  // TRAPS #197: a fix applied to one copy of a pattern is not applied to the pattern. So the
  // options are built in ONE place, authRenderOpts(), and this rule holds that line -- a THIRD
  // call site cannot quietly appear without it.
  //
  // ⚠️ Print and Download PDF are deliberately NOT covered: both work from the live DOM rather
  // than re-rendering, so they inherit whatever is on screen. Asserting on them would be
  // asserting a mechanism they do not use.
  const appSrc = appSrcIn;
  const authOptsCount = (appSrc.match(/includeAuthorization:/g) || []).length;
  ok("app.js builds authorization render options in exactly ONE place",
    authOptsCount === 1);
  ok("that one place carries the signature",
    /function authRenderOpts\(/.test(appSrc)
    && /signed:\s*\(window\.__ABY_SHARED && window\.__ABY_SHARED\.signed\)/.test(appSrc));
  ok("the DOWNLOAD path uses it (this is the one that regressed)",
    /renderForClient\(form, results, quoteNumber, authRenderOpts\(\)\)/.test(appSrc));
  ok("the ON-SCREEN path uses it too",
    /renderFn\(form, results, quoteNumber,\s*\n?\s*authRenderOpts\(/.test(appSrc));

  console.log("\n  " + pass + " passed, " + fail.length + " failed");
}

const rendererSrc = readFileSync(join(root, "public/assets/js/lib/renderer.js"), "utf8");
const appSrc = readFileSync(join(root, "public/assets/js/app.js"), "utf8");

console.log("F-481 -- a signed proposal shows the signature and retires the button\n");
// -- A NEWLINE-TOLERANT ANCHOR, BECAUSE THIS WORKING TREE IS CRLF ---------------------------
//
// TWO SABOTAGES BELOW SPANNED A NEWLINE AND SILENTLY STOPPED MATCHING. core.autocrlf=true, so
// the checkout is CRLF -- 945 CRLF pairs and zero bare LF in renderer.js, measured with a raw
// byte reader -- and a literal carrying a raw newline matches NOTHING there. The sabotage then
// changes nothing, the rule under it stays green, and the harness says BROKEN if you are lucky
// and nothing at all if you are not.
//
// THEY PASSED UNTIL THE DAY THESE FILES WERE CHECKED OUT WITH LF ENDINGS, which is what makes
// this class of fault expensive: it turns on how the tree was WRITTEN, not on the code. A
// single `git stash` round-trip flips it, because git normalises on the way through.
// TRAPS #246, #299 and #378 are all this same fault. Never put a raw newline in an anchor.
function anchor(literal) {
  const NEWLINE = String.fromCharCode(10), ESC = String.fromCharCode(92);
  const SPECIAL = '.*+?^${}()|[]' + ESC;
  const quote = (t) => t.split('').map(function (ch) {
    return SPECIAL.indexOf(ch) === -1 ? ch : ESC + ch;
  }).join('');
  return new RegExp(literal.split(NEWLINE).map(quote).join(ESC + 'r?' + ESC + 'n'));
}

run(rendererSrc, appSrc);
const realFailures = fail.length;

if (selfTest) {
  // Each sabotage names the FILE it patches. Four of these rules read app.js, and a harness that
  // could only mutate the renderer would have reported them green forever without ever testing
  // them -- which is the exact failure that let the download regression ship.
  const sabotages = [
    // FLIPS THE CONDITION, producing VALID JavaScript that behaves wrongly. The first version
    // inserted a comma and the renderer threw a SyntaxError -- which the harness scored as
    // "caught" while testing nothing about the rule. A sabotage that breaks the wrong thing
    // certifies nothing (TRAPS #243).
    ["renderer", "the Submit button comes back on a signed page",
      (s) => s.replace(
        anchor("      (signed\n        ? '      <div class=\"ack-submit\"><div style=\"padding:14px"),
        "      (false\n        ? '      <div class=\"ack-submit\"><div style=\"padding:14px")],
    ["renderer", "field() stops preferring the signed value",
      (s) => s.replace(
        "var v = (signed && signed[fname] != null && signed[fname] !== '') ? signed[fname] : val;",
        "var v = val;")],
    ["renderer", "the fields stop being read-only",
      (s) => s.replace("(signed ? ' readonly' : '')", "''")],
    ["renderer", "the date is handed the raw timestamp again",
      (s) => s.replace(
        "u.formatDateLong(String(signed.submittedAt).slice(0, 10))",
        "u.formatDateLong(signed.submittedAt)")],
    ["renderer", "the submit handler is bound even on a signed document",
      (s) => s.replace(
        "'    <form id=\"commitForm\"' + (signed ? '' : ' onsubmit=\"submitCommitment(event)\"') + '>',",
        "'    <form id=\"commitForm\" onsubmit=\"submitCommitment(event)\">',")],
    // -- app.js. The regression Eric found, and the shape that caused it.
    ["app", "the download path builds its own options again, losing the signature",
      (s) => s.replace(
        "renderForClient(form, results, quoteNumber, authRenderOpts())",
        "renderForClient(form, results, quoteNumber, { includeAuthorization: true })")],
    ["app", "authRenderOpts stops carrying the signature",
      (s) => s.replace(
        "signed: (window.__ABY_SHARED && window.__ABY_SHARED.signed) || null,",
        "signed: null,")],
    ["app", "the on-screen render stops going through the builder",
      (s) => s.replace(
        anchor("    var html = renderFn(form, results, quoteNumber,\n      authRenderOpts({ employerEditableCounts: forEmployer }));"),
        "    var html = renderFn(form, results, quoteNumber, { includeAuthorization: true });")],
  ];

  console.log("\n\n=== SELF-TEST ===");
  let caught = 0;
  let broken = 0;
  for (const [target, name, mutate] of sabotages) {
    const base = target === "app" ? appSrc : rendererSrc;
    const mutated = mutate(base);
    if (mutated === base) {
      broken++;
      console.log("\n  BROKEN  " + name + " -- the sabotage matched NOTHING, its anchor is gone.");
      console.log("          That is an ABSENT test, not a passing or a failing one.");
      continue;
    }
    console.log("\n  sabotage: [" + target + "] " + name);
    try {
      run(target === "app" ? rendererSrc : mutated, target === "app" ? mutated : appSrc);
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
