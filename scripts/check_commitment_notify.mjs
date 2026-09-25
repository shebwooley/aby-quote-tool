// THE COMMITMENT NOTIFICATION HAS TO BE ABLE TO REPORT ITS OWN FAILURE (09-25-2026).
//
// WHY THIS EXISTS, AND IT IS THE SECOND TIME THIS FEATURE HAS BEEN SILENT.
// Before 2026-08-18 a signed authorization emailed NOBODY. It landed in the database and waited
// for somebody to look, which made the strongest buying signal in the system its quietest event.
// The email was built to fix exactly that.
//
// ON 09-25-2026 ERIC SAID: "doesn't look like Niels and I are getting emails when someone submits
// a commitment to ABY." Measured that morning:
//   * 8 signed authorizations in D1, from 2026-08-27 to that same day;
//   * Resend's dashboard: "No sent emails yet" -- not one send, ever;
//   * the worker was deployed, and RESEND_API_KEY, NOTIFY_EMAILS and FROM_EMAIL were all set.
// So the call was being made and rejected before Resend ever recorded it, and the ONLY trace was a
// console.error into Workers logs nobody reads. EIGHT AUTHORIZATIONS WENT UNNOTIFIED AND THE TOOL
// NEVER SAID SO. The fix that was supposed to end the silence had failed in the same way.
//
// SO THE RULE THIS GUARDS IS NOT "send the email". It is: WHETHER IT WENT MUST REACH A SCREEN.
//   1. sendCommitmentEmail returns an outcome on EVERY path -- a bare `return;` is the old bug.
//   2. The outcome is RECORDED INSIDE the waitUntil promise. Chained after it, the worker may shut
//      down before the UPDATE runs, and the row then claims "not recorded" for a send that worked.
//   3. The migration adds both columns.
//   4. The screen shows THREE states. Rows signed before this shipped have no answer either way,
//      and printing "not sent" for them would accuse the tool of a failure nobody measured.
//   5. recordNotifyOutcome cannot throw -- the signature is already saved and must not be undone.
//   6. No backtick in the admin cell: it lives inside the page's own template literal.
//
//   node scripts/check_commitment_notify.mjs
//   node scripts/check_commitment_notify.mjs --self-test
//
// ABY has no build step, so SESSION START is the only trigger any checker here can have.
import { readFileSync } from "node:fs";

const SRC = "worker.js";
const selfTest = process.argv.includes("--self-test");
let fail = [];
const ok = (m) => console.log("  ok    " + m);
const bad = (m, d) => { fail.push(m); console.log("  FAIL  " + m + (d ? " -- " + d : "")); };

/** The body of a named async function, by brace matching. Refuses rather than guessing. */
function fnBody(src, name) {
  const start = src.indexOf("async function " + name);
  if (start < 0) return null;
  const open = src.indexOf("{", start);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (!depth) return src.slice(start, i + 1); }
  }
  return null;
}

function run(src) {
  fail = [];

  // ---- THE FLOOR. Every rule below asks whether a slice SAYS something, and a slice that could
  // not be cut makes all of them vacuously true. Fail loudly instead.
  const send = fnBody(src, "sendCommitmentEmail");
  const save = fnBody(src, "handleSaveCommitment");
  const record = fnBody(src, "recordNotifyOutcome");
  if (!send || !save || !record) {
    bad("the three functions can be sliced out of worker.js",
        "send=" + !!send + " save=" + !!save + " record=" + !!record);
    return;
  }

  // ---- 1. EVERY EXIT REPORTS -----------------------------------------------------------------
  // `return;` with nothing after it is the shape that made this unobservable.
  const bare = (send.match(/\breturn\s*;/g) || []).length;
  if (bare === 0) ok("sendCommitmentEmail has no bare `return;` -- every path reports an outcome");
  else bad("sendCommitmentEmail reports on every path", bare + " bare return(s)");

  if (/return\s*\{\s*ok:\s*true/.test(send)) ok("...it returns ok:true on the success path");
  else bad("a success outcome is returned");
  if ((send.match(/return\s*\{\s*ok:\s*false/g) || []).length >= 3)
    ok("...and ok:false with a reason on the no-key, no-recipient and refused paths");
  else bad("every failure path returns ok:false with a reason");

  // ---- 2. THE RECORDING IS INSIDE THE waitUntil PROMISE ---------------------------------------
  // ⛔ THE RULE THAT IS EASIEST TO BREAK BY TIDYING. `waitUntil` keeps the worker alive only for
  // the promise it is HANDED. Hand it the send alone and chain the UPDATE afterwards and the write
  // races the shutdown -- the row then says "not recorded" for a send that succeeded, which is a
  // worse lie than the silence this replaces.
  const notify = save.match(/const\s+notify\s*=\s*async\s*\(\s*\)\s*=>\s*\{[\s\S]*?\n\s*\};/);
  if (notify && /sendCommitmentEmail\(/.test(notify[0]) && /recordNotifyOutcome\(/.test(notify[0]))
    ok("the send and the recording are ONE promise");
  else bad("the send and the recording are one promise", "notify() does not contain both");
  if (/waitUntil\(\s*notify\(\)\s*\)/.test(save))
    ok("...and waitUntil is handed that promise, not the bare send");
  else bad("waitUntil is handed the combined promise");
  if (/waitUntil\(\s*sendCommitmentEmail\(/.test(save))
    bad("waitUntil is handed the bare send", "the UPDATE would race the shutdown");
  else ok("...waitUntil is never handed sendCommitmentEmail on its own");

  // ---- 3. THE MIGRATION -----------------------------------------------------------------------
  for (const col of ["notified_at", "notify_error"]) {
    const re = new RegExp('ALTER TABLE commitments ADD COLUMN ' + col + '[^"]*"\\s*,\\s*table:\\s*"commitments"');
    if (re.test(src)) ok("the migration adds commitments." + col);
    else bad("the migration adds commitments." + col);
  }

  // ---- 4. THREE STATES ON THE SCREEN, NOT TWO -------------------------------------------------
  const cell = src.match(/var notifyCell = function\(row\)\s*\{[\s\S]*?\n\s*\};/);
  if (!cell) { bad("the admin cell exists"); return; }
  const c = cell[0];
  if (/row\.notified_at/.test(c)) ok("the screen reads notified_at");
  else bad("the screen reads notified_at");
  if (/row\.notify_error/.test(c)) ok("...and notify_error");
  else bad("the screen reads notify_error");
  // ⭐⭐ AN UNKNOWN RENDERS NOTHING, AND THAT IS A RULE ERIC HAS ALREADY PAID FOR ONCE.
  // The first version printed a grey label whenever neither field was set -- which on the day it
  // shipped is EVERY row, because nothing had been recorded yet. `check_admin_render.mjs` carries
  // his objection to that exact shape from the brokers page: a line that printed under all 665
  // firms because none had a status, and he asked what it was for. A label identical on every row
  // is noise and teaches people to stop reading the column.
  // ⛔ So this asserts the LAST return is an empty string, not that some third label exists.
  if (/\n\s*return '';\s*\n\s*\};/.test(c) || /return '';/.test(c.slice(c.lastIndexOf("if ("))))
    ok("an unknown renders NOTHING -- no label on every row");
  else bad("an unknown renders nothing", "a label identical on every row is the shape Eric rejected");
  if (!/not recorded/.test(c)) ok("...and the retired phrase is not back");
  else bad("the retired phrase stays retired");
  if (/NOT NOTIFIED/.test(c)) ok("...and a real failure is loud");
  else bad("a failure is visible on the row");

  // ---- 5. RECORDING CANNOT UNDO A SIGNATURE ---------------------------------------------------
  if (/try\s*\{[\s\S]*UPDATE commitments SET notified_at[\s\S]*catch/.test(record))
    ok("recordNotifyOutcome cannot throw -- a lost status never costs a signature");
  else bad("recordNotifyOutcome wraps its write", "a failed status write must not undo a commitment");

  // ---- 6. THE FILE'S OWN RULE ------------------------------------------------------------------
  // The admin cell is inside the page's template literal; one backtick ends it and the page breaks
  // while node --check stays green (it passes this file even when it is broken).
  if (!c.includes("`")) ok("no backtick in the admin cell");
  else bad("no backtick in the admin cell", "it would terminate the page's template literal");
}

const src = readFileSync(SRC, "utf8");
console.log("\nwhether ABY was told, and whether anyone can see that it was\n");
run(src);
const realFailures = fail.length;

if (selfTest) {
  const sabotages = [
    ["the success path stops reporting", (s) =>
      s.replace("return { ok: true, at: new Date().toISOString(), to: to.join(', ') };", "return;")],
    ["waitUntil is handed the bare send again", (s) =>
      s.replace("ctx && ctx.waitUntil ? ctx.waitUntil(notify()) : await notify();",
                "ctx && ctx.waitUntil ? ctx.waitUntil(sendCommitmentEmail(env, {})) : await notify();")],
    ["the migration loses a column", (s) =>
      s.replace('{ sql: "ALTER TABLE commitments ADD COLUMN notify_error TEXT", table: "commitments", column: "notify_error" },', "")],
    // The shape Eric rejected on the brokers page: a label under every row that has no status.
    ["a label comes back under every row with no status", (s) =>
      s.replace(/(\r?\n) {8}return '';/, "$1        return '<br>no notification on file';")],
    // ⚠️ `\r?\n`, NOT `\n`. `worker.js` is entirely CRLF (19,593 pairs, zero bare LF), so a
    // multi-line anchor written with `\n` matches NOTHING and the sabotage silently becomes an
    // ABSENT test rather than a failing one. That is exactly how this one shipped BROKEN on its
    // first run, and the only reason it was caught is that the harness asserts the mutation landed.
    ["the status write is left unwrapped", (s) =>
      s.replace(/ {2}try \{(\r?\n) {4}await env\.DB\.prepare\('UPDATE commitments SET notified_at/,
                "  {$1    await env.DB.prepare('UPDATE commitments SET notified_at")],
    ["a backtick reaches the admin cell", (s) =>
      s.replace("'<br><span style=\"color:#1a5c3a;font-size:12px\" title=\"ABY was emailed at '",
                "`<br><span style=\"color:#1a5c3a;font-size:12px\" title=\"ABY was emailed at `")],
  ];
  let caught = 0, broken = 0;
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
    if (fail.length > realFailures) { caught++; console.log("  -> caught"); }
    else console.log("  -> MISSED");
  }
  console.log("\n  " + caught + "/" + sabotages.length + " sabotages caught, " + broken + " BROKEN (anchor gone)");
  process.exit(caught === sabotages.length && broken === 0 ? 0 : 1);
}

console.log("\n  " + (realFailures ? realFailures + " FAILED" : "all rules pass") + "\n");
process.exit(realFailures ? 1 : 0);
