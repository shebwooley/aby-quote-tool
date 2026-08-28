#!/usr/bin/env node
// F-448 -- a flat bottom tier must name the per-participant rate AND the real crossover.
//
// WHY THIS EXISTS. Niels, via Eric 2026-08-28: "if there are fewer participants than the minimum
// billing, it just shows the $85 minimum without showing the PPPM." Every tiered product opens with
// a FLAT tier, so there was no rate to print and the estimate stopped at the flat amount. That
// disagreed with ABY's own published rate sheet, which prints the whole ladder.
//
// THE ASSERTION THAT MATTERS IS THE CROSSOVER NUMBER, because it is the one a reader could act on
// and the one that is easy to get wrong: the per-participant tier can START below the point where
// it beats the minimum. Outside Texas an HSA tier starts at 15 and does not beat the $100 minimum
// until 32. Naming 15 would understate it by seventeen people, in the direction that makes ABY look
// cheaper than it is.
//
// Run:  node scripts/check_flat_tier_pppm.mjs [--self-test]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const selfTest = process.argv.includes("--self-test");

let pass = 0;
const fail = [];
const ok = (name, cond) => { cond ? pass++ : fail.push(name); console.log(`  ${cond ? "ok  " : "FAIL"} ${name}`); };

// Load the real pricing data and the real engine into one sandbox, so this tests the shipped
// functions rather than a paraphrase of them.
function load(engineSrc) {
  const sandbox = { window: {}, ABYQuote: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(root, "public/assets/js/data/pricing.js"), "utf8"), sandbox);
  vm.runInContext(readFileSync(join(root, "public/assets/js/lib/utils.js"), "utf8"), sandbox);
  vm.runInContext(engineSrc, sandbox);
  return sandbox.ABYQuote;
}

const engineSrc = readFileSync(join(root, "public/assets/js/lib/engine.js"), "utf8");
const A = load(engineSrc);

// Price one product the way the app does, through the exported entry point. computeMonthly is
// private and stays private: a checker is not a reason to widen a module's surface, and driving
// calculateProduct means this exercises the path a real quote takes.
function monthlyBreakdown(A, path, count) {
  const [state, book, productId] = path.split(".");
  const r = A.engine.calculateProduct(
    { productId, count, packageId: "fullAdmin" },
    book === "commissioned",
    state
  );
  return String((r && r.monthlyFee && r.monthlyFee.breakdown) || "");
}

// Every product in the rate data that opens with a flat tier under a per-participant tier.
function flatProducts(pricing) {
  const found = [];
  (function walk(o, path) {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o.monthlyTiers)) {
      const t = o.monthlyTiers;
      const i = t.findIndex((x) => x.type === "flat");
      const p = t.find((x) => x.type === "pppm");
      if (i >= 0 && p) found.push({ path, tiers: t, i, flat: t[i], pppm: p });
      return;
    }
    for (const k of Object.keys(o)) walk(o[k], path ? `${path}.${k}` : k);
  })(pricing, "");
  return found;
}

const products = flatProducts(A.pricing);
ok(`the rate data still has flat-under-pppm products (found ${products.length})`, products.length >= 20);

// The truth, computed here independently of the engine, so a wrong engine cannot agree with itself.
const trueCrossover = (pppm, startAt) => {
  const min = pppm.minMonthly || 0;
  let n = Math.max(1, startAt);
  while (n * pppm.amount <= min) n++;
  return n;
};

let named = 0, rateShown = 0, crossoverRight = 0;
const wrong = [];
for (const p of products) {
  // Price a group comfortably inside the flat band.
  const bd = monthlyBreakdown(A, p.path, Math.max(1, Math.floor((p.flat.maxCount || 1) / 2)));
  if (/minimum billing/i.test(bd)) named++;
  if (bd.includes(A.utils.moneyExact(p.pppm.amount))) rateShown++;
  const want = trueCrossover(p.pppm, (p.flat.maxCount || 0) + 1);
  if (new RegExp(`From ${want} participants`).test(bd)) crossoverRight++;
  else wrong.push(`${p.path}: wanted ${want}, got "${bd}"`);
}

ok(`every flat tier says "minimum billing" (${named}/${products.length})`, named === products.length);
ok(`every flat tier prints the next per-participant RATE (${rateShown}/${products.length})`, rateShown === products.length);
ok(`every flat tier names the TRUE crossover, not the tier boundary (${crossoverRight}/${products.length})`,
   crossoverRight === products.length);
if (wrong.length) wrong.slice(0, 4).forEach((w) => console.log("       " + w));

// The two products where boundary and breakeven differ are the whole point of the rule.
const hsaTx = products.find((p) => p.path === "TX.commissioned.hsa");
const hsaOut = products.find((p) => p.path === "OUTSIDE.commissioned.hsa");
if (hsaTx) {
  const bd = monthlyBreakdown(A, hsaTx.path, 5);
  ok("TX HSA says 16, not the tier boundary 15", /From 16 participants/.test(bd) && !/From 15 /.test(bd));
}
if (hsaOut) {
  const bd = monthlyBreakdown(A, hsaOut.path, 5);
  ok("Outside-TX HSA says 32, not the tier boundary 15", /From 32 participants/.test(bd));
}

// A rate must never be printed through money(), which renders $4.50 as $4.5.
const fsa = products.find((p) => p.path === "TX.commissioned.fsa");
if (fsa) {
  const bd = monthlyBreakdown(A, fsa.path, 5);
  ok("the rate keeps its cents ($4.50, never $4.5)", /\$4\.50 per participant/.test(bd));
  ok("the flat amount is still stated", /\$85 per month minimum billing/.test(bd));
}

// The no-count starting tier gets the same sentence.
if (fsa) {
  const bd = monthlyBreakdown(A, fsa.path, null);
  ok("a quote with no count yet also names the rate", /per participant per month/.test(bd));
}

// A per-participant tier must be untouched by all this.
if (fsa) {
  const bd = monthlyBreakdown(A, fsa.path, 50);
  ok("a normal per-participant tier still reads as before", /^\$4\.50 per participant per month \(minimum/.test(bd));
}

// ---- self-test: break the rule, require each break to be caught -------------------------------
if (selfTest) {
  console.log("\n  self-test: breaking the rule on a scratch copy\n");
  const sabotages = [
    ["prints the tier boundary instead of the breakeven",
     (s) => s.replace("var at = pppmBeatsMinAt(nxt, (tier.maxCount || 0) + 1);",
                      "var at = (tier.maxCount || 0) + 1;")],
    ["drops the rate from the sentence",
     (s) => s.replace(/return flat \+ ' From[\s\S]*?per participant per month\.';/,
                      "return flat + '.';")
             .replace(/return flat \+ '\. From[\s\S]*?per participant per month\.';/,
                      "return flat + '.';")],
    ["prints the rate through money() so it loses its cents",
     (s) => s.replace("ABYQuote.utils.moneyExact(nxt.amount) + ' per participant per month.'",
                      "ABYQuote.utils.money(nxt.amount) + ' per participant per month.'")],
  ];
  let caught = 0;
  for (const [name, breakIt] of sabotages) {
    const broken = breakIt(engineSrc);
    if (broken === engineSrc) { console.log(`  FAIL  ${name} -- the sabotage did not match, so it tested nothing`); continue; }
    let red = false;
    try {
      const B = load(broken);
      for (const p of products) {
        const bd = monthlyBreakdown(B, p.path, Math.max(1, Math.floor((p.flat.maxCount || 1) / 2)));
        const want = trueCrossover(p.pppm, (p.flat.maxCount || 0) + 1);
        if (!new RegExp(`From ${want} participants`).test(bd)) { red = true; break; }
        if (!bd.includes(B.utils.moneyExact(p.pppm.amount))) { red = true; break; }
      }
    } catch { red = true; }
    console.log(`  ${red ? "ok  " : "FAIL"} caught: ${name}`);
    if (red) caught++;
  }
  if (caught !== sabotages.length) fail.push("a sabotage went undetected");
}

console.log(`\n  ${pass} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach((f) => console.log(`    x ${f}`)); process.exit(1); }
console.log("  A flat bottom tier names its rate and the count at which that rate takes over.");
