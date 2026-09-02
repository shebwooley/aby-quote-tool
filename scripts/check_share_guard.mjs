// F-480 -- the share-link REFUSAL exists on one path and not on the other, and nothing said so.
//
// WHY THIS EXISTS.
// `handleShareQuote()` deliberately REFUSES to mint a /q/<token> link for a quote that carries an
// internal price `adjustment`, or that was priced outside Texas, when the quote has no stored
// `resolved_pricing`. Its own comment argues the case at length and the argument is right: a shared
// page RE-RUNS the pricing engine in the reader's browser, and neither the adjustment nor the state
// is among the inputs -- so the employer would open a page showing MORE than the document they were
// sent, with nothing on the page saying so. It returns 409 and tells the broker, in these words:
//
//     "This quote carries a price adjustment... Send the file for this one."
//
// THE SIGNING PATH IN handleSaveCommitment() (the F-416 link-back) MINTS A TOKEN WITH NO SUCH TEST.
// So the refusal's own recommended workaround completes the loop: Share is refused -> send the file,
// exactly as instructed -> the employer signs the file -> a token is minted -> "Open the signed
// proposal" appears on the commitments row -> the employer opens it and sees standard pricing.
// It is WORSE on the unguarded path, because the contradicted document is one they have signed.
//
// WHAT THIS CHECKER DOES, AND WHAT IT DELIBERATELY DOES NOT DO.
// It DECIDES NOTHING. Whether the signing path should withhold the link, or mint it anyway, is a
// client-facing question that is Eric's -- it is the question put to him on 2026-08-27 and still
// unanswered, now carried by F-480. Answering it here by turning a rule red would be a session
// making a commercial decision by writing a test.
//
// What it stops is the disagreement being INVISIBLE. It pins the measured split as a BASELINE and
// FAILS when either path moves, so a change reaches a person instead of being rediscovered later by
// somebody who guesses differently. Same shape as check-packet-vs-tag.mjs in complydiy-app.
//
// A CHECKER THAT ONLY PRINTS IS A REPORT, NOT A CHECK (TRAPS #215). This one can fail, and its
// failure means "one of the two paths changed -- go and read F-480", never "the code is wrong".
//
// Run:  node scripts/check_share_guard.mjs
//       node scripts/check_share_guard.mjs --self-test

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const selfTest = process.argv.includes("--self-test");

let pass = 0;
const fail = [];
const ok = (name, cond) => {
  if (cond) pass++;
  else fail.push(name);
  console.log("  " + (cond ? "ok  " : "FAIL") + " " + name);
};

// Absence rules must be answered by the CODE, never by the comment explaining the code -- and the
// comment is the single most likely place for the name to still appear (TRAPS #94, #126).
// Line comments only, deliberately: worker.js is built out of template literals and a naive block
// stripper would eat their contents.
const codeOnly = (src) => src.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

// Slice a named function out of the source by walking from its declaration to the next one at
// column 0. Anchored on a DECLARATION rather than a line number, because line numbers rot.
function fnBody(src, decl) {
  const start = src.indexOf(decl);
  if (start < 0) return "";
  const rest = src.slice(start + decl.length);
  const nextDecl = rest.search(/\n(?:async )?function \w+\s*\(/);
  return nextDecl < 0 ? rest : rest.slice(0, nextDecl);
}

function run(workerSrc) {
  pass = 0;
  fail.length = 0;

  const share = codeOnly(fnBody(workerSrc, "async function handleShareQuote(id, env, url) {"));
  const commit = codeOnly(fnBody(workerSrc, "async function handleSaveCommitment(request, env, ctx) {"));

  // -- FLOOR. A checker whose subject went missing must FAIL, not pass on an empty string.
  // Every rule below is "does this text contain X", and an empty slice makes the absence rules
  // vacuously true while the presence rules fail confusingly. Check the input first (TRAPS #360).
  ok("floor: handleShareQuote was found and is non-trivial", share.length > 400);
  ok("floor: handleSaveCommitment was found and is non-trivial", commit.length > 400);
  if (share.length <= 400 || commit.length <= 400) {
    console.log("\n  Could not slice one of the two functions -- every rule below would be");
    console.log("  meaningless. Fix the anchor before reading anything else.");
    return;
  }

  // -- ① THE GUARD STILL EXISTS ON THE SHARE PATH -----------------------------------------
  // If any of these three goes, the refusal has been removed and F-480 is moot in the WRONG
  // direction -- an adjusted quote would become shareable from the button too.
  ok("share path refuses an ADJUSTED quote (not_shareable_adjusted)",
    /not_shareable_adjusted/.test(share));
  ok("share path refuses an OUTSIDE-TEXAS quote (not_shareable_state)",
    /not_shareable_state/.test(share));
  ok("share path's refusal is CONDITIONAL on there being no resolved_pricing",
    /resolved_pricing/.test(share) && /!\s*resolved/.test(share));

  // -- ② THE BASELINE SPLIT, PINNED ---------------------------------------------------------
  // These are the rules that record F-480. They assert the split AS MEASURED on 2026-09-02.
  // When the signing path gains the test, these three go red -- and that is the SIGNAL, not a
  // regression: read F-480, confirm it was a deliberate fix, then delete these three rules.
  const commitMints = /UPDATE quotes SET share_token = \? WHERE id = \? AND share_token IS NULL/.test(commit);
  ok("signing path DOES mint a share token (this is F-416 working, and is not the defect)",
    commitMints);
  ok("BASELINE F-480: signing path does NOT test `adjustment`",
    !/\badjustment\b/.test(commit));
  ok("BASELINE F-480: signing path does NOT test `resolved_pricing`",
    !/\bresolved_pricing\b/.test(commit));

  // -- ③ THE INVARIANT THAT DOES HOLD -------------------------------------------------------
  // Whatever is decided about the refusal, BOTH paths must keep the race-safe claim. Minting
  // without `AND share_token IS NULL` would let a concurrent write hand out a token that was
  // never stored -- a link that 404s -- and, worse, REPLACING an existing token would kill every
  // proposal link already sitting in a client's inbox.
  ok("share path mints only where share_token IS NULL (race-safe, never replaces)",
    /WHERE id = \? AND share_token IS NULL/.test(share));
  ok("signing path mints only where share_token IS NULL (race-safe, never replaces)",
    /WHERE id = \? AND share_token IS NULL/.test(commit));

  console.log("\n  " + pass + " passed, " + fail.length + " failed");
  if (fail.length) {
    console.log("\n  ⚠ A FAILURE HERE IS NOT NECESSARILY A BUG. If rules under ② went red,");
    console.log("  somebody changed the signing path -- read F-480, and if the refusal was added");
    console.log("  deliberately, DELETE those three rules rather than softening them.");
  }
}

const workerPath = path.join(ROOT, "worker.js");
const src = fs.readFileSync(workerPath, "utf8");

console.log("F-480 -- the share-link refusal, on both paths\n");
run(src);
const realFailures = fail.length;

if (selfTest) {
  // Each sabotage must ASSERT THAT THE MUTATION LANDED. A String.replace whose pattern matches
  // nothing returns the source unchanged, the rule stays green, and the harness scores that as
  // "not caught" while the real problem is a rotted anchor (TRAPS #361, #288).
  const sabotages = [
    ["remove the adjusted refusal", (s) => s.replace("not_shareable_adjusted", "not_shareable_XXXX")],
    ["remove the outside-Texas refusal", (s) => s.replace("not_shareable_state", "not_shareable_YYYY")],
    ["give the signing path an adjustment test",
      (s) => s.replace(
        "      let qRow = null;\n      if (quoteId) {",
        "      let qRow = null;\n      const adjustment = null;\n      if (quoteId) {")],
    ["drop the race-safe claim from the signing path",
      (s) => s.replace(
        "            'UPDATE quotes SET share_token = ? WHERE id = ? AND share_token IS NULL'",
        "            'UPDATE quotes SET share_token = ? WHERE id = ?'")],
  ];

  console.log("\n\n=== SELF-TEST ===");
  let caught = 0;
  let broken = 0;
  for (const [name, mutate] of sabotages) {
    const mutated = mutate(src);
    if (mutated === src) {
      broken++;
      console.log("\n  BROKEN  " + name + " -- the sabotage matched NOTHING, its anchor is gone.");
      console.log("          That is an ABSENT test, not a passing or a failing one.");
      continue;
    }
    console.log("\n  sabotage: " + name);
    run(mutated);
    if (fail.length > realFailures) {
      caught++;
      console.log("  -> caught");
    } else {
      console.log("  -> MISSED");
    }
  }
  console.log("\n  " + caught + "/" + sabotages.length + " sabotages caught, " + broken + " BROKEN (anchor gone)");
  process.exit(caught === sabotages.length && broken === 0 ? 0 : 1);
}

process.exit(realFailures ? 1 : 0);
