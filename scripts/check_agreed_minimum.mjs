// AN AGREED PER-PARTICIPANT RATE WITH ITS OWN MINIMUM (Niels via Eric, 11-18-2026).
//
// Niels: "I set the discount to be $75 min and $4 pppm for FSA, $45 and 0.75 for COBRA and $40 and $3
// for HSA but it just went to the normal rates." He typed each minimum into Monthly admin (a fixed
// TOTAL) beside Per participant, the panel refuses that pair, one refused row drops every row, and
// quote TX261118-3090-NC (Dexter & Company) saved with no adjustment at standard prices.
// The fix: a Minimum box that travels with Per participant and replaces the standard floor.
//
// It runs the REAL engine and the REAL applySetPrice / readAdjRow / describeOverride sliced out of
// worker.js, on Dexter's own counts (FSA 25, HSA 18, COBRA 55, Texas, no commission).
//
//   node scripts/check_agreed_minimum.mjs [--self-test]
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LF = String.fromCharCode(10);
const SELF_TEST = process.argv.includes("--self-test");

function engine() {
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const rel of ["public/assets/js/data/products.js", "public/assets/js/data/pricing.js", "public/assets/js/lib/utils.js", "public/assets/js/lib/engine.js"]) {
    vm.runInContext(readFileSync(join(ROOT, rel), "utf8"), ctx, { filename: rel });
  }
  return ctx.ABYQuote;
}

function slice(w, head) {
  const at = w.indexOf(LF + "  function " + head + "(");
  if (at < 0) throw new Error("not found: " + head);
  let depth = 0;
  for (let j = w.indexOf("{", at); j < w.length; j++) {
    if (w[j] === "{") depth++;
    else if (w[j] === "}" && --depth === 0) return w.slice(at, j + 1);
  }
  throw new Error("unbalanced: " + head);
}
function constant(w, name) {
  const at = w.indexOf("var " + name);
  return w.slice(at, w.indexOf("];", at) + 2);
}

function overlay(A, w) {
  const ctx = { console, window: { ABYQuote: A }, money: (n) => (n < 0 ? "-$" : "$") + Math.abs(n), rateMoney: (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2) };
  vm.createContext(ctx);
  vm.runInContext([constant(w, "SET_FIELDS"), constant(w, "SET_INPUTS"), slice(w, "applySetPrice"), slice(w, "readAdjRow"),
    slice(w, "scopeName"), slice(w, "describeOverride"),
    "globalThis.__o = { applySetPrice: applySetPrice, readAdjRow: readAdjRow, describeOverride: describeOverride };"].join(LF), ctx);
  return ctx.__o;
}

// A panel row with nothing but what readAdjRow reads.
function row(mode, scope, vals) {
  const els = { adjMode: { value: mode }, adjScope: { value: scope }, adjAmt: { value: "" }, adjSet: { style: {} }, adjAmtWrap: { style: {} } };
  for (const c of ["setSetup", "setRenewal", "setAnnual", "setMonthly", "setPerPart", "setMin"]) els[c] = { value: vals[c] ?? "" };
  return { querySelector: (sel) => els[sel.slice(1)] || { value: "", style: {} } };
}

function run(w) {
  const A = engine();
  const O = overlay(A, w);
  const results = [];
  const ok = (name, cond, got) => results.push([name, !!cond, got]);
  const price = (sel) => A.engine.calculateAll(sel, false, "TX");
  const monthly = (rs, id) => (rs.find((r) => r.productId === id) || {}).monthlyFee || {};
  const dexter = [{ productId: "fsa", count: 25 }, { productId: "hsa", count: 18 }, { productId: "cobra", count: 55 }];

  // Niels' three rows, entered the way the panel now asks for them.
  const rows = [row("set", "fsa", { setPerPart: "4", setMin: "75" }), row("set", "cobra", { setPerPart: "0.75", setMin: "45" }), row("set", "hsa", { setPerPart: "3", setMin: "40" })];
  const read = rows.map((r) => O.readAdjRow(r));
  ok("all three rows are accepted", read.every((r) => r.item && !r.error), JSON.stringify(read.map((r) => r.error || "ok")));

  let rs = price(dexter);
  const before = { fsa: monthly(rs, "fsa").amount, hsa: monthly(rs, "hsa").amount, cobra: monthly(rs, "cobra").amount };
  ok("standard prices are what the saved quote showed (106.25 / 54.90 / 50)", before.fsa === 106.25 && Math.abs(before.hsa - 54.9) < 0.001 && before.cobra === 50, JSON.stringify(before));
  for (const r of read) rs = O.applySetPrice(rs, r.item);
  ok("FSA: 25 x $4.00 = $100", monthly(rs, "fsa").amount === 100, monthly(rs, "fsa").amount);
  ok("HSA: 18 x $3.00 = $54", monthly(rs, "hsa").amount === 54, monthly(rs, "hsa").amount);
  ok("COBRA: 55 x $0.75 = $41.25, so the agreed $45 minimum", monthly(rs, "cobra").amount === 45, monthly(rs, "cobra").amount);
  ok("COBRA's line says the AGREED minimum applies", /agreed minimum of \$45 per month applies/.test(monthly(rs, "cobra").breakdown || ""), monthly(rs, "cobra").breakdown);
  ok("FSA's line names its rate and its minimum", /^\$4\.00 per participant per month \(agreed rate, minimum \$75 per month\)$/.test(monthly(rs, "fsa").breakdown || ""), monthly(rs, "fsa").breakdown);

  // The agreed minimum goes BELOW the standard floor: FSA at 10 people is a flat $80 standard.
  let small = price([{ productId: "fsa", count: 10 }]);
  const std10 = monthly(small, "fsa").amount;
  small = O.applySetPrice(small, { mode: "set", scope: "fsa", prices: { monthlyRate: 4, monthlyMin: 75 } });
  ok(`FSA at 10 people: the agreed $75 replaces the standard $${std10}`, monthly(small, "fsa").amount === 75 && std10 > 75, monthly(small, "fsa").amount);

  // Without a Minimum the standard floor still holds (the 08-21 rule is unchanged).
  let noMin = O.applySetPrice(price([{ productId: "cobra", count: 55 }]), { mode: "set", scope: "cobra", prices: { monthlyRate: 0.75 } });
  ok("a rate with no Minimum keeps the standard $50 floor", monthly(noMin, "cobra").amount === 50, monthly(noMin, "cobra").amount);

  // Refusals.
  ok("Monthly admin + Per participant is still refused, and points at Minimum", /put the minimum in Minimum/.test(O.readAdjRow(row("set", "fsa", { setMonthly: "75", setPerPart: "4" })).error || ""));
  ok("a Minimum alone is refused", /goes with a Per participant rate/.test(O.readAdjRow(row("set", "fsa", { setMin: "75" })).error || ""));
  ok("a negative Minimum is refused", /cannot be negative \(Minimum\)/.test(O.readAdjRow(row("set", "fsa", { setPerPart: "4", setMin: "-75" })).error || ""));

  // The internal note names it.
  const note = O.describeOverride({ mode: "multi", items: read.map((r) => r.item) });
  ok("the internal note names each minimum", /Per participant \$4\.00, Minimum \$75/.test(note) && /Minimum \$45/.test(note) && /Minimum \$40/.test(note), note);
  return results;
}

const W = readFileSync(join(ROOT, "worker.js"), "utf8");
let fails = 0;
for (const [name, good, got] of run(W)) {
  if (!good) fails++;
  console.log(`  ${good ? "ok  " : "FAIL"} ${name}${good ? "" : "  (got " + got + ")"}`);
}

if (SELF_TEST) {
  console.log("\n  self-test: each break must turn something red\n");
  const sabotages = [
    ["the minimum is ignored", (w) => w.replace("if (agreedMin) floor = p.monthlyMin;", "")],
    ["the Minimum box is not read", (w) => w.replace("{ cls: 'setMin',     key: 'monthlyMin',  label: 'Minimum' }", "{ cls: 'setMinX', key: 'monthlyMin', label: 'Minimum' }")],
    ["a lone Minimum is let through", (w) => w.replace("if (prices.monthlyMin != null && prices.monthlyRate == null) {", "if (false) {")],
  ];
  for (const [name, breakIt] of sabotages) {
    const broken = breakIt(W);
    if (broken === W) { console.log(`  FAIL  ${name}: the sabotage did not match`); fails++; continue; }
    let red;
    try { red = run(broken).some((r) => !r[1]); } catch { red = true; }
    console.log(`  ${red ? "ok  " : "FAIL"} caught: ${name}`);
    if (!red) fails++;
  }
}
console.log(fails ? `\n  ${fails} FAILED` : "\n  An agreed rate carries its own minimum.");
process.exit(fails ? 1 : 0);
