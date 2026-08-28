// Did an edit silently DELETE a top-level declaration from worker.js?
//
// WHY THIS EXISTS, AND IT COST TWO OUTAGES IN ONE SESSION (2026-08-24).
// Replacing a function by cutting from its opening line to the NEXT `async function` assumes
// nothing lives in between. Twice it did:
//   * deriveStatus vanished, and the marketing list rendered
//       "Could not load the list: deriveStatus is not defined" to everyone.
//   * RECORDED_PREFIX vanished, the handler threw on every request, and its own catch turned that
//     into an EMPTY agency list -- so the page looked like a book with no firms in it. Four
//     assertions went red and none of them said "a constant is missing".
//
// NEITHER WAS CATCHABLE BY A PARSER. The syntax stays valid; the reference only fails at run time.
// `node --check` passes, the page checker passes, and the damage shows up as a wrong ANSWER.
//
// AND THE FIRST FIX WAS TOO NARROW, WHICH IS THE REAL LESSON. After losing deriveStatus I started
// diffing top-level FUNCTIONS before every commit -- so when a `const` went the same way, the check
// I had just added looked straight past it. A guard aimed at the last instance is not a guard
// against the class.
//
// It compares against the last COMMIT, so it only ever asks "did this edit remove something".
// Additions are expected and ignored.
//
// Run:  node scripts/check_declarations.mjs
//       node scripts/check_declarations.mjs --self-test

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["worker.js", "public/save-hook.js"];

// Every shape a module-level name can be declared in. `class` is here for completeness even though
// this file uses none today -- a guard that only knows the shapes currently in use goes blind the
// first time somebody adds one.
const DECL = /^(?:export\s+)?(?:async\s+function|function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm;

function names(src) {
  const out = new Set();
  let m;
  DECL.lastIndex = 0;
  while ((m = DECL.exec(src)) !== null) out.add(m[1]);
  return out;
}

// ── DELIBERATE RETIREMENTS ────────────────────────────────────────────────────────────────────
//
// This guard was written for a name that vanished by ACCIDENT -- cut out along with the function
// above it -- and it had no way to say yes to a name removed on purpose. So until 2026-08-26 a
// page could not be retired from this repo at all without bypassing the pre-commit hook, and
// "just use --no-verify" is how a guard stops being a guard.
//
// ⛔ A NAME GOES HERE ONLY WITH A DATE AND A REASON, and only once its callers are gone -- which
// is a separate rule, enforced separately: check_reachable.mjs asserts that nothing CALLS these.
// Two independent checks, because "I meant to delete it" and "nothing refers to it" are different
// claims and this file can only ever answer the first.
//
// ⚠️ Entries stay after the commit lands. They cost nothing -- the name is gone from HEAD too, so
// the comparison never sees it again -- and they are the record of what was retired and why.
const RETIRED = {
  // F-408, 2026-08-26. Eric: "Yes I think we should kill the pipeline page." All three of its
  // jobs moved: Log a quote to the quote log, Add prospects to the Marketing view's event import,
  // Everyone we track to that view's Never quoted filter. /admin/pipeline redirects rather than
  // 404s. The two endpoints went with it -- handleAdminAddProspects wrote into `brokers`, which
  // holds 6 rows on production and all 6 are leftover checker fixtures.
  // 2026-08-26. The inline agent list on the Marketing view. Eric: "what are the arrows for
  // anyway... maybe we should get rid of those." They opened a list the firm panel already shows,
  // and the caret that opened them was what made every wrapped firm name misalign.
  "worker.js": [
    "agentRows",
    "toggleFirm",
    "adminPipelineHTML",
    "handleAdminPipeline",
    "handleAdminAddProspects",
    "pipelineStatusSql",
    "PIPELINE_WINDOW_DAYS",
  ],
};

function committed(file) {
  try {
    return execFileSync("git", ["show", `HEAD:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null;   // a new file has nothing to compare against, which is not a failure
  }
}

function check(fileList) {
  let problems = 0;
  for (const f of fileList) {
    const now = fs.readFileSync(path.join(ROOT, f), "utf8");
    const was = committed(f);
    if (was === null) { console.log(`  skip ${f} (not committed yet)`); continue; }
    const before = names(was), after = names(now);
    const retired = new Set(RETIRED[f] || []);
    const allGone = [...before].filter((n) => !after.has(n));
    const gone = allGone.filter((n) => !retired.has(n));
    const onPurpose = allGone.filter((n) => retired.has(n));
    // NAMED, NOT SILENT. A removal waved through without a word on screen is indistinguishable
    // from one nobody noticed, which is the whole failure this file exists for.
    if (onPurpose.length) {
      console.log(`  retired ${f}: ${onPurpose.join(", ")}  (listed as deliberate -- see RETIRED)`);
    }
    if (gone.length) {
      console.log(`  LOST ${f}: ${gone.join(", ")}`);
      console.log("        A top-level declaration is in the last commit and not in the file now.");
      console.log("        If that was deliberate, the reference to it has to go too -- check first.");
      problems++;
    } else {
      const added = [...after].filter((n) => !before.has(n));
      console.log(`  ok   ${f}  (${after.size} top-level names${added.length ? `, ${added.length} new` : ""})`);
    }
  }
  return problems;
}

if (process.argv.includes("--self-test")) {
  // The sabotage is the real failure, replayed: take a declaration out and leave its uses behind.
  const f = "worker.js";
  const src = fs.readFileSync(path.join(ROOT, f), "utf8");
  const victim = "function deriveStatus";
  if (src.indexOf(victim) === -1) {
    console.log("SELF-TEST could not run: deriveStatus is not in worker.js to remove.");
    process.exit(2);
  }
  const before = names(src);
  const after = names(src.replace(victim, "function notTheSameName"));
  const caught = [...before].filter((n) => !after.has(n)).includes("deriveStatus");
  console.log(caught
    ? "  caught  a removed declaration is reported"
    : "  MISSED  a removed declaration slipped through");
  process.exit(caught ? 0 : 1);
}

// ── INVISIBLE CONTROL CHARACTERS ────────────────────────────────────────────────────────────
//
// 🔴 NOTHING IN THIS REPO COULD SEE ONE. On 2026-08-27 two separators went into worker.js as raw
// 0x01 and 0x02 bytes -- a GROUP_CONCAT separator and a group key joined on another. Both PARSED,
// both would have WORKED, and both are invisible in an editor and in a diff.
//
// ⛔ THAT IS WHAT MAKES THEM DANGEROUS RATHER THAN HARMLESS: the SQL side and the JavaScript side
// have to agree on the separator, and the next person to edit one of them cannot see what they are
// matching. benefitlab-notes has check-control-chars.py over the NOTES for the same reason; the
// code had nothing.
//
// ⚠️ TAB, NEWLINE AND CARRIAGE RETURN ARE FINE. Everything else below 0x20 is not.
function controlChars(files) {
  let bad = 0;
  for (const f of files) {
    const buf = fs.readFileSync(path.join(ROOT, f));
    const hits = [];
    for (let i = 0; i < buf.length; i += 1) {
      const b = buf[i];
      if (b === 9 || b === 10 || b === 13) continue;
      if (b < 32) {
        const line = buf.slice(0, i).toString("utf8").split("\n").length;
        hits.push("0x" + b.toString(16).padStart(2, "0") + " at line " + line);
      }
    }
    if (hits.length) {
      bad += 1;
      console.log("  FAIL " + f + ": " + hits.length + " control character(s) -- "
        + hits.slice(0, 5).join(", "));
    } else {
      console.log("  ok   " + f + "  (no control characters)");
    }
  }
  return bad;
}

console.log("TOP-LEVEL DECLARATIONS -- did this edit delete one?");
const problems = check(FILES);
console.log("\nCONTROL CHARACTERS -- a separator you cannot see is one nobody can maintain");
const ctl = controlChars(FILES);
if (problems) {
  console.log("\n>> A declaration went missing. That is a run-time error nothing else here can see.");
}
if (ctl) {
  console.log("\n>> An invisible control character is in the source. Replace it with a visible "
    + "separator -- both sides of it, because something else is matching on it.");
}
if (!problems && !ctl) {
  console.log("\nnothing that was declared has stopped being declared, and nothing invisible.");
}
process.exit(problems || ctl ? 1 : 0);
