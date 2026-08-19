// Every page the WORKER generates must emit valid HTML and valid inline JavaScript.
//
// THE BUG CLASS THIS EXISTS FOR, AND IT SHIPPED THREE TIMES IN ONE AFTERNOON. These pages are
// built inside TEMPLATE LITERALS, so a backslash escape (backslash-r, backslash-n, backslash-t)
// written in the page's OWN JavaScript is consumed by the OUTER template and never reaches the
// browser. What arrives is a literal tab or newline sitting inside a regex -- a SYNTAX ERROR.
// The page still loads, still renders, and simply does nothing, which is the hardest kind of
// broken to notice.
//
// AND IT IS INVISIBLE TO API TESTS. check_broker_flow.mjs passed 35 assertions against the live
// worker while the broker page's bulk-invite parser could not parse. Those tests call the
// endpoints; nobody was running the browser code. A green API suite says nothing about the page.
//
// AND THE HEADER OF THIS VERY FILE HIT THE SAME BUG ON ITS FIRST WRITE: the escape sequences it
// described were interpreted rather than printed, which broke the comment and crashed the
// checker. Hence the escapes are NAMED IN WORDS above. The trap is not theoretical.
//
// What it does NOT check: whether the page WORKS. Valid syntax is not a working screen.
//
//   node check_worker_pages.mjs
//   node check_worker_pages.mjs --self-test    (prove both text rules can go red)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";

// Resolved from THIS file, not from a hardcoded path and not from the working directory:
// a pre-commit hook runs with the repo root as cwd, and a developer may run it from scripts/.
const WORKER = join(dirname(fileURLToPath(import.meta.url)), "..", "worker.js");
const src = readFileSync(WORKER, "utf8");
// ⚠️ Extracted scripts go to a TEMP directory, never the working tree. Writing them beside
// the code litters the repo and -- as happened the first time this hook ran -- gets them
// committed. A checker must not change the thing it is checking.
const SCRATCH = mkdtempSync(join(tmpdir(), "abypages-"));
process.on("exit", () => { try { rmSync(SCRATCH, { recursive: true, force: true }); } catch {} });

function body(name, text) {
  const s = text || src;
  const i = s.indexOf("function " + name + "(");
  if (i === -1) return "";
  let j = s.indexOf("{", i), d = 0, end = -1;
  for (; j < s.length; j++) {
    if (s[j] === "{") d++;
    else if (s[j] === "}") { d--; if (d === 0) { end = j + 1; break; } }
  }
  return s.slice(i, end);
}

// The two writing mistakes that PARSE FINE and still break the page. Returns true if it reported a
// problem, so the caller can skip the eval -- and the ORDER is the point, see the call site.
//
//   (a) a BACKTICK anywhere in the page source, including inside a // comment, ends the template
//       literal early. worker.js still parses; the emitted page is cut in half.
//   (b) a LONE BACKSLASH is eaten by the template, so a regex shorthand reaches the browser
//       matching a bare letter. It parses perfectly and silently matches nothing, which is the
//       worse of the two because nothing ever goes red.
//
// Checked against the FUNCTION SOURCE, not the emitted HTML: by the time it is emitted the damage
// is already done and invisible.
//
// ⚠️ THE FIRST VERSION FLAGGED *EVERY* BACKSLASH AND I CLAIMED ZERO FALSE POSITIVES, having
// measured a single function. Across all six pages it fired three times on correct code. These
// sequences are legitimate and must not be flagged, because the template literal is exactly what
// makes them work: a doubled backslash (survives as one -- brokerPageHTML splits pasted lines that
// way), backslash-u or -x (a real escape resolving to the intended character), and an escaped
// backtick or dollar (the only way to include those at all).
function scanTemplateText(name, fnSrc) {
  // ⚠️ CODE POINTS, NOT ESCAPES -- newline 10, carriage return 13, backslash 92.
  // Writing this function INTO the file went through a heredoc and a Python string, and each layer
  // ate one backslash until every newline escape had become a REAL line break inside a string
  // literal -- four of them, in the checker written for the sibling trap. TRAPS #200: a repair
  // involving backslashes must not travel through a shell. A code point cannot be eaten.
  const NL = String.fromCharCode(10), CR = String.fromCharCode(13), BS = String.fromCharCode(92);
  const TICK = String.fromCharCode(96);
  const flatten = (s) => s.split(NL).join(" ").split(CR).join(" ");

  const first = fnSrc.indexOf(TICK), last = fnSrc.lastIndexOf(TICK);
  if (first === -1 || last <= first) return false;
  const inner = fnSrc.slice(first + 1, last);
  const lineAt = (off) => fnSrc.slice(0, first + 1 + off).split(NL).length;

  const tick = inner.indexOf(TICK);
  if (tick !== -1) {
    console.log("  FAIL " + name + ": BACKTICK inside the template literal at line ~" +
      lineAt(tick) + " of the function -- it ends the literal early, and the eval that follows " +
      "will blame an innocent word further down. Name the character in words instead.");
    console.log("         ..." + flatten(inner.slice(Math.max(0, tick - 40), tick + 40)) + "...");
    return true;
  }

  const LEGIT = new Set([BS, "u", "x", TICK, "$", NL, CR]);
  for (let k = 0; k < inner.length; k++) {
    if (inner[k] !== BS) continue;
    if (LEGIT.has(inner[k + 1])) { if (inner[k + 1] === BS) k++; continue; }
    console.log("  FAIL " + name + ": lone backslash in the template literal at line ~" +
      lineAt(k) + " -- the template eats it.");
    console.log("         ..." + flatten(inner.slice(Math.max(0, k - 40), k + 40)) + "...");
    console.log("         Use a character class ([0-9], [(]) or String.fromCharCode(92).");
    return true;
  }
  return false;
}

// 🔴 `adminHTML` WAS MISSING FROM THIS LIST UNTIL 2026-08-18, AND IT IS THE BIGGEST PAGE THE
// WORKER EMITS -- the quote log, the screen ABY works in all day, and the one with by far the most
// inline JavaScript. The list was written when the brokers / rates / pipeline pages were built and
// was simply never revisited.
// ⭐⭐ A CHECKER'S SCOPE IS A CLAIM, AND A LIST OF NAMES IS THE EASIEST CLAIM TO LET ROT: nothing
// fails when a page is absent from it. It printed "all pages emit valid HTML and valid inline JS",
// which reads as EVERY page, and the page nobody checked was the biggest one.
const PAGES = ["adminHTML", "adminBrokersHTML", "adminRatesHTML", "adminPipelineHTML",
               "adminReferralsHTML", "brokerPageHTML", "setPasswordPageHTML"];

function runAll(text) {
  let bad = 0;
  for (const name of PAGES) {
    const fnSrc = body(name, text);
    if (!fnSrc) { console.log("  FAIL " + name + ": not found in worker.js"); bad++; continue; }

    // ⭐⭐ THE SOURCE-TEXT CHECKS RUN FIRST, BEFORE THE EVAL. A stray backtick ends the template
    // literal, so the eval throws something like "Unexpected identifier 'hidden'" -- an error
    // naming an innocent word from the middle of the page, with no hint that a backtick three
    // lines earlier caused it. Running the cheap, precise check first reports "backtick at line N".
    // 🔴 This cost a diagnosis on 2026-08-18: the guard for that exact bug was already in the file
    // and could not fire, because the eval failed and skipped past it.
    if (scanTemplateText(name, fnSrc)) { bad++; continue; }

    let html;
    try { html = eval("(" + fnSrc + ")")(); }
    catch (e) { console.log("  FAIL " + name + " threw: " + e.message); bad++; continue; }

    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .map(m => m[1]);
    let ok = true;
    scripts.forEach((code, n) => {
      const f = join(SCRATCH, `_s_${name}_${n}.js`);
      writeFileSync(f, code, "utf8");
      try { execSync(`node --check "${f}"`, { stdio: "pipe" }); }
      catch (e) {
        ok = false; bad++;
        console.log("  FAIL " + name + " script#" + n + ": " +
          String(e.stderr).split("\n").slice(0, 3).join(" "));
      }
    });
    // A page that emits no closing </html> is a truncated template literal.
    if (!html.includes("</html>")) { ok = false; bad++; console.log("  FAIL " + name + ": no </html>"); }

    if (ok) console.log("  ok   " + name + "  (" + html.length + " bytes, " +
      scripts.length + " inline script(s) parse)");
  }
  return bad;
}

// A guard that has never gone red proves nothing. Both text rules are sabotaged against a COPY of
// the worker source held in memory -- nothing on disk is touched, so an interrupted run cannot
// leave a deliberately broken worker behind.
function selfTest() {
  const TICK = String.fromCharCode(96), BS = String.fromCharCode(92);
  // 🔴 THE ANCHOR MUST BE *INSIDE* THE TEMPLATE LITERAL, and the first version was not.
  // It injected just after `function adminHTML() {`, which is before the literal opens -- so the
  // rule correctly ignored it and the self-test reported MISSED against working code. ⭐ A
  // sabotage placed where the rule does not apply tests nothing; the self-test caught its own
  // bad case, which is the argument for having one.
  const anchor = "let quotes = [];";
  if (!src.includes(anchor)) { console.log("SELF-TEST: anchor not found in the page script"); return 1; }
  const cases = [
    ["a backtick in a comment", "// see " + TICK + "thing" + TICK + "\n" + anchor],
    ["a backslash shorthand",   "var junk = /" + BS + "d+/;\n" + anchor]
  ];
  let bad = 0;
  for (const [label, replacement] of cases) {
    const broken = src.replace(anchor, replacement);
    const n = runAllQuiet(broken);
    const caught = n > 0;
    console.log("  " + (caught ? "reddens " : "MISSED  ") + label);
    if (!caught) bad++;
  }
  const clean = runAllQuiet(src);
  console.log("  " + (clean === 0 ? "green   " : "MISSED  ") + "unmodified source stays green" +
    (clean ? " (" + clean + " problems)" : ""));
  if (clean !== 0) bad++;
  console.log(bad ? "\n" + bad + " self-test case(s) MISSED" : "\nall self-test cases behaved");
  return bad ? 1 : 0;
}

function runAllQuiet(text) {
  const log = console.log; console.log = () => {};
  let n; try { n = runAll(text); } finally { console.log = log; }
  return n;
}

if (process.argv.includes("--self-test")) {
  process.exit(selfTest());
} else {
  const bad = runAll(src);
  console.log(bad ? "\n" + bad + " problem(s)" : "\nall pages emit valid HTML and valid inline JS");
  process.exit(bad ? 1 : 0);
}
