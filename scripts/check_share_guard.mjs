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
// THE SIGNING PATH IN handleSaveCommitment() (the F-416 link-back) MINTED A TOKEN WITH NO SUCH
// TEST. So the refusal's own recommended workaround completed the loop: Share is refused -> send
// the file, exactly as instructed -> the employer signs the file -> a token is minted -> "Open the
// signed proposal" appears on the commitments row -> the employer opens it and sees standard
// pricing. It was WORSE on the unguarded path, because the contradicted document is one they have
// already signed.
//
// ✅ FIXED 2026-09-02 ON ERIC'S RULING, AND THIS HEADER WAS REWRITTEN WITH IT.
// He was asked whether to withhold the link or let it re-price, and answered in one line:
// "It needs to stay accurate." So the shareability test is now ONE named predicate --
// quoteShareBlockReason() -- called by BOTH paths, and the signing path withholds the LINK while
// still recording quote_id, so nothing about the signature is lost.
//
// ⛔ THIS FILE USED TO SAY IT "DECIDES NOTHING" AND PINNED THE MEASURED SPLIT AS A BASELINE,
// because the question was open and answering it by writing a test would have been a session
// making a commercial decision. That was right THEN and is wrong NOW -- and a checker whose header
// describes a state of the world that has moved is the thing this project keeps getting bitten by
// ("expect it red" instructions, TRAPS.md's own session checklist). The three baseline rules were
// DELETED, as this file instructed, not softened.
//
// WHAT IT ASSERTS NOW IS THE GUARANTEE, NOT THE MECHANISM: one predicate exists, it weighs all
// three facts, both paths call it, signing still mints when the quote IS shareable, and a withheld
// link still records quote_id.
//
// A CHECKER THAT ONLY PRINTS IS A REPORT, NOT A CHECK (TRAPS #215). This one can fail, and its
// failure means the two paths have diverged again -- go and read F-480.
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
  // -- ② F-480 IS FIXED: ONE PREDICATE, BOTH PATHS ------------------------------------------
  // ⭐ THESE REPLACED THREE "BASELINE" RULES THAT PINNED THE SPLIT AS IT WAS ON 2026-09-02.
  // They went red the moment the signing path gained the test, exactly as they were written to,
  // and this checker's own instruction was to DELETE them once the fix was confirmed deliberate
  // rather than soften them. Eric ruled: "It needs to stay accurate."
  //
  // ⚠️ A THIRD RULE WENT WITH THEM AND IT IS THE MORE INTERESTING ONE: "the share path's refusal
  // is CONDITIONAL on resolved_pricing" asserted WHERE the check lived, so moving it into a
  // shared predicate -- the fix itself -- broke it. TRAPS #355: a checker that enforces the
  // MECHANISM blocks the change that improves it. What follows tests the GUARANTEE instead.
  ok("the shareability test exists as ONE named predicate",
    /function quoteShareBlockReason\(q\)/.test(workerSrc));
  ok("the predicate weighs all three facts: stored price, adjustment, state",
    (() => {
      const i = workerSrc.indexOf("function quoteShareBlockReason(q)");
      const body = i < 0 ? "" : workerSrc.slice(i, i + 900);
      return /resolved_pricing/.test(body) && /adjustment/.test(body) && /'TX'/.test(body);
    })());
  ok("the SHARE path decides by calling the predicate, not its own copy",
    /quoteShareBlockReason\(q\)/.test(share));
  ok("the SIGNING path decides by calling the predicate too",
    /quoteShareBlockReason\(qRow\)/.test(commit));
  ok("signing still mints a token when the quote IS shareable (F-416 still works)",
    /UPDATE quotes SET share_token = \? WHERE id = \? AND share_token IS NULL/.test(commit));
  // ⛔ THE HALF THAT IS EASY TO LOSE. Withholding the LINK must never withhold the RECORD:
  // quote_id is what F-416 exists to store, and a signed document that cannot be traced back to
  // its quote is a worse defect than the one being fixed.
  ok("a withheld link still records quote_id on the commitment",
    /UPDATE commitments SET quote_id = \? WHERE id = \?/.test(commit));

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
    ["the signing path stops consulting the predicate, so a discounted quote gets a link again",
      (s) => s.replace("quoteShareBlockReason(qRow)", "null")],
    ["withholding the link also drops quote_id, losing the link-back F-416 built",
      (s) => s.replace(
        "        await env.DB.prepare('UPDATE commitments SET quote_id = ? WHERE id = ?')",
        "        await env.DB.prepare('SELECT 1 WHERE 0 -- quote_id = ? WHERE id = ?')")],
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
