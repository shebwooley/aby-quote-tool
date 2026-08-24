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
const FILES = ["worker.js", "save-hook.js"];

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
    const gone = [...before].filter((n) => !after.has(n));
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

console.log("TOP-LEVEL DECLARATIONS -- did this edit delete one?");
const problems = check(FILES);
console.log(problems
  ? "\n>> A declaration went missing. That is a run-time error nothing else here can see."
  : "\nnothing that was declared has stopped being declared.");
process.exit(problems ? 1 : 0);
