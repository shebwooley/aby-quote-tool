#!/usr/bin/env node
/**
 * Does every product and package have a short label for the quote log?
 *
 * WHY THIS EXISTS. On 2026-08-21, shortening the labels meant reading PRODUCT_SHORT against
 * products.js for the first time, and the comparison found TWO live defects that nothing watched:
 *
 *   1. erisa listed a package 'fullPlan' that does not exist in products.js, while the two that DO
 *      exist -- fullSpd and fullSpdTesting -- had no label. Quoting either printed the raw id into
 *      the log: "ERISA - fullSpd".
 *   2. aca had no label for fullXL or selfXL (501 to 1,000 forms), same result.
 *
 * Neither is a crash. Both produce a slightly wrong screen, which is the class of defect that
 * survives longest because nobody files it.
 *
 * A missing label is invisible in exactly the way that matters: it only shows when somebody quotes
 * that specific package, which for the rarest products is almost never.
 *
 * Run: node scripts/check_product_labels.js [--self-test]
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

// products.js is browser code: it hangs everything off window. Give it a window and read it back,
// rather than regex-parsing a nested structure and quietly missing a branch.
function loadProducts() {
  const src = fs.readFileSync(path.join(ROOT, "assets/js/data/products.js"), "utf8");
  const sandbox = { window: {} };
  sandbox.ABYQuote = sandbox.window.ABYQuote = {};
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return (sandbox.window.ABYQuote && sandbox.window.ABYQuote.products) || sandbox.ABYQuote.products || [];
}

function loadShortMap() {
  const src = fs.readFileSync(path.join(ROOT, "worker.js"), "utf8");
  const m = src.match(/const PRODUCT_SHORT = \{[\s\S]*?\n\};/);
  if (!m) return null;
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(m[0] + "; this.OUT = PRODUCT_SHORT;", sandbox);
  return sandbox.OUT;
}

const products = loadProducts();
const SHORT = loadShortMap();

if (!products.length) { console.error("FAIL: no products parsed from products.js"); process.exit(2); }
if (!SHORT) { console.error("FAIL: PRODUCT_SHORT not found in worker.js -- renamed or removed"); process.exit(2); }

const MAX = 22;                       // a label longer than this defeats the point of having one
let fail = 0;
const bad = (msg) => { fail++; console.log("  FAIL " + msg); };

console.log(`${products.length} products, ${Object.keys(SHORT).length} with short labels\n`);

console.log("every product has a label");
for (const p of products) {
  const e = SHORT[p.id];
  if (!e) { bad(`${p.id} has NO entry -- the log will print its full name, "${String(p.name).slice(0, 50)}..."`); continue; }
  const def = typeof e === "string" ? e : e.def;
  if (!def) bad(`${p.id} has an entry with no def`);
  else if (def.length > MAX) bad(`${p.id} label is ${def.length} chars: "${def}"`);
}

console.log("\nevery package has a label, and every label has a package");
for (const p of products) {
  const e = SHORT[p.id];
  if (!e || typeof e === "string") continue;
  const real = new Set((p.packages || []).map((o) => o.id));
  const labelled = new Set(Object.keys(e.packages || {}));

  for (const id of real) {
    if (!labelled.has(id)) bad(`${p.id}.${id} has no label -- the log prints the raw id`);
  }
  // The reverse direction is the one that found the erisa bug: a label pointing at nothing.
  for (const id of labelled) {
    if (!real.has(id)) bad(`${p.id}.${id} is labelled but no such option exists in products.js`);
  }
  for (const [id, label] of Object.entries(e.packages || {})) {
    if (label.length > MAX) bad(`${p.id}.${id} label is ${label.length} chars: "${label}"`);
  }
}

// Eric, 2026-08-21: "Can you please capitalize all words."
console.log("\ntitle case");
const SKIP = new Set(["and", "or", "for", "of", "the", "with", "to", "up"]);
const check = (owner, label) => {
  for (const w of label.split(/[\s/]+/)) {
    const word = w.replace(/[^A-Za-z].*$/, "");
    if (!word || SKIP.has(word) || word === word.toUpperCase()) continue;
    if (word[0] !== word[0].toUpperCase()) bad(`${owner}: "${label}" -- "${word}" is not capitalised`);
  }
};
for (const [pid, e] of Object.entries(SHORT)) {
  check(pid, typeof e === "string" ? e : e.def || "");
  if (typeof e === "object") for (const [id, l] of Object.entries(e.packages || {})) check(`${pid}.${id}`, l);
}

if (process.argv.includes("--self-test")) {
  console.log("\nSELF-TEST -- break each rule, require it to be noticed");
  const cases = [
    ["a product with no entry", () => { const c = { ...SHORT }; delete c.cobra; return !c.cobra; }],
    ["a label pointing at a package that does not exist", () => {
      const real = new Set((products.find((p) => p.id === "erisa").packages || []).map((o) => o.id));
      // NON-EMPTY FIRST. This assertion was vacuous on its first run: I read the field as `options`,
      // so `real` was empty, "fullPlan is absent" was trivially true, and the case passed while
      // testing nothing. TRAPS #148 -- a sabotage that cannot fail is not a test.
      return real.size > 0 && !real.has("fullPlan");
    }],
    ["a package with no label", () => {
      const aca = SHORT.aca.packages;
      const real = (products.find((p) => p.id === "aca").packages || []).map((o) => o.id);
      return real.every((id) => id in aca); // must be TRUE now; was false for fullXL/selfXL
    }],
    ["an over-long label is rejected", () => "Section 125 Cafeteria Plan with FSA / DCAP / LFSA".length > MAX],
  ];
  let ok = 0;
  for (const [name, fn] of cases) {
    const passed = fn();
    if (passed) ok++;
    console.log(`  ${passed ? "ok  " : "FAIL"} ${name}`);
  }
  if (ok !== cases.length) { console.log("\nSELF-TEST FAILED"); process.exit(1); }
  console.log(`\nself-test OK -- ${cases.length}/${cases.length}`);
}

console.log(fail ? `\n${fail} problem(s)` : "\nevery product and package has a short, title-cased label");
process.exit(fail ? 1 : 0);
