#!/usr/bin/env node
/**
 * Does the notes cleanup remove ONLY the dead "Source:" segment?
 *
 * ⭐ Eric, 2026-08-21: "Yes strip it. It's not useful at all. What is useful is notes like this was
 * quoted twice, once with and once without commission. or Kandice quoted this and Niels quoted it
 * too."
 *
 * 🔴 THE RISK THIS EXISTS FOR IS NOT THE STRIP, IT IS THE COLLATERAL. `notes` is up to three things
 * joined by " | ", and the Commission segment is the ONLY surviving record of "Quoted both ways"
 * for 305 rows -- `commission_included` has two states and the sheet had three. A cleanup that took
 * the whole column, or that split carelessly, would destroy exactly the note Eric just called the
 * useful kind. Every case below that must SURVIVE is the real subject of this file.
 *
 * Run: node scripts/check_source_note_strip.js  [--self-test]
 */
const fs = require("fs");
const path = require("path");

// Pull the real function out of worker.js rather than restating it -- a copy here could drift from
// the deployed one and this file would keep passing while the worker did something else.
const SRC = fs.readFileSync(path.join(__dirname, "..", "worker.js"), "utf8");
const m = SRC.match(/function stripSourceSegment\(notes\)\s*\{[\s\S]*?\n\}/);
if (!m) {
  console.error("FAIL: stripSourceSegment() not found in worker.js -- it was renamed or removed.");
  console.error("      This checker asserts nothing when it cannot find its subject, so it fails.");
  process.exit(2);
}
const stripSourceSegment = new Function(m[0] + "; return stripSourceSegment;")();

const SELF_TEST = process.argv.includes("--self-test");
let fail = 0;
function eq(label, got, want) {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) console.log(`         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`);
}

console.log("what must be REMOVED");
eq("a lone Source line leaves nothing behind",
   stripSourceSegment("Source: ABY COBRA Administration Proposal- Tanglefoot Restaurants, LLC"), null);
eq("the Source line goes, the commission note stays",
   stripSourceSegment("Commission: Quoted both ways | Source: ABY COBRA Proposal- Acme"),
   "Commission: Quoted both ways");
eq("Source in the middle, both neighbours survive",
   stripSourceSegment("Commission: Quoted both ways | Source: file.pdf | Kandice quoted this and Niels quoted it too"),
   "Commission: Quoted both ways | Kandice quoted this and Niels quoted it too");
eq("case and spacing do not rescue it",
   stripSourceSegment("  source:   file.pdf  "), null);

console.log("\nwhat must SURVIVE -- the point of the whole file");
eq("a commission note alone is untouched",
   stripSourceSegment("Commission: Quoted both ways"), "Commission: Quoted both ways");
eq("a human note alone is untouched",
   stripSourceSegment("Kandice quoted this and Niels quoted it too"),
   "Kandice quoted this and Niels quoted it too");
eq("a note merely CONTAINING the word source is untouched",
   stripSourceSegment("Employer could not confirm the source of the census"),
   "Employer could not confirm the source of the census");
eq("a note ABOUT being quoted twice survives in full",
   stripSourceSegment("Quoted twice, once with and once without commission"),
   "Quoted twice, once with and once without commission");

console.log("\nedges");
eq("null in, null out", stripSourceSegment(null), null);
eq("empty in, null out", stripSourceSegment(""), null);
eq("already clean is returned unchanged (idempotent second run)",
   stripSourceSegment("Commission: Quoted both ways"), "Commission: Quoted both ways");
eq("running it twice is the same as running it once",
   stripSourceSegment(stripSourceSegment("Commission: X | Source: f.pdf")), "Commission: X");

if (SELF_TEST) {
  console.log("\nSELF-TEST -- break the rule, require these to notice");
  const sabotages = [
    ["strip everything, not just Source", (s) => null,
     "a commission note alone is untouched"],
    ["match anywhere instead of at the start", (s) =>
      String(s || "").split("|").map((x) => x.trim())
        .filter((x) => x && !x.toLowerCase().includes("source")).join(" | ") || null,
     "a note merely CONTAINING the word source is untouched"],
    ["return an empty string rather than null", (s) => {
      const r = stripSourceSegment(s); return r === null ? "" : r;
    }, "a lone Source line leaves nothing behind"],
  ];
  let caught = 0;
  for (const [name, broken, mustBreak] of sabotages) {
    // Re-run the one assertion this sabotage should redden.
    const cases = {
      "a commission note alone is untouched": ["Commission: Quoted both ways", "Commission: Quoted both ways"],
      "a note merely CONTAINING the word source is untouched":
        ["Employer could not confirm the source of the census", "Employer could not confirm the source of the census"],
      "a lone Source line leaves nothing behind": ["Source: f.pdf", null],
    };
    const [input, want] = cases[mustBreak];
    const got = broken(input);
    const noticed = got !== want;
    if (noticed) caught++;
    console.log(`  ${noticed ? "ok  " : "FAIL"} ${name} -- reddens "${mustBreak}"`);
  }
  if (caught !== sabotages.length) {
    console.log(`\nSELF-TEST FAILED: ${sabotages.length - caught} sabotage(s) changed nothing.`);
    process.exit(1);
  }
  console.log(`\nself-test OK -- ${sabotages.length} sabotages, all reddened their rule`);
}

console.log(fail ? `\n${fail} problem(s)` : "\nonly the dead Source line is removed; every useful note survives");
process.exit(fail ? 1 : 0);
