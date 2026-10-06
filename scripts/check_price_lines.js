// THE PRICE LINES ON THE SIGNATURE PAGE (F-448, Eric 10-06-2026: "Yes, ship it").
//
// Before: ONE run-on line per service, joined by bars -
//   Setup $125 | Renewal $125/yr | $225/mo | $4.50 per participant per month (minimum $85/month) | Estimated for 50 participants
// After: the recurring price and its rate in BOLD, then setup, renewal and the count underneath -
//   **$225 per month - $4.50 per participant per month (minimum $85/month)**
//   Setup $125 (one time). Renewal $125 per year. Estimated for 50 participants.
// A flat sentence that already opens with the amount stands alone (COBRA under its minimum), and a product whose setup
// and renewal are the same amount is a yearly price (POP: "($350 per year)").
//
// ⭐ IT RENDERS THE REAL FILES (the check_pop_docsonly.js harness): a rule that grepped the source would agree with
// itself while the page did something else. The estimate is the one Eric was shown 09-14: FSA 50, COBRA 40, POP.
//
//   node scripts/check_price_lines.js
//   node scripts/check_price_lines.js --self-test

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const FILES = [
  "public/assets/js/data/products.js",
  "public/assets/js/data/pricing.js",
  "public/assets/js/data/language.js",
  "public/assets/js/lib/utils.js",
  "public/assets/js/lib/engine.js",
  "public/assets/js/lib/renderer.js",
];
function build(edit) {
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const rel of FILES) {
    let src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    if (edit) src = edit(rel, src);
    vm.runInContext(src, ctx, { filename: rel });
  }
  return ctx.ABYQuote;
}
const FORM = { companyName: "Sample Employer", effectiveDate: "2027-01-01",
  rep: { name: "Eric Johnson", email: "eric@abybenefits.com", phone: "(817) 366-7536" }, recommendedPackages: {} };
const SEL = [{ productId: "fsa", count: 50 }, { productId: "cobra", count: 40 },
  { productId: "pop", packageId: "docsOnly" }, { productId: "pop", packageId: "popHsa" }, { productId: "pop", packageId: "full" }];

// Just the "Select the Services You Are Authorizing" block - scoped, so a price elsewhere on the quote cannot satisfy a rule.
function block(A) {
  const html = A.renderer.renderForClient(FORM, A.engine.calculateAll(SEL, true, "TX"), "TX270101-S001-C", { includeAuthorization: true });
  const i = html.indexOf("Select the Services");
  const j = html.indexOf("Uncheck any service", i);
  if (i < 0 || j < 0) throw new Error("the authorization block was not found - nothing below can be judged");
  return html.slice(i, j);
}

const RULES = [
  { name: "FSA: the monthly price and its rate, in bold, on their own line",
    holds: (A) => block(A).includes("<strong>$225 per month - $4.50 per participant per month (minimum $85/month)</strong>") },
  { name: "FSA: setup, renewal and the count underneath, as sentences",
    holds: (A) => block(A).includes("Setup $125 (one time). Renewal $125 per year. Estimated for 50 participants.") },
  { name: "COBRA under its minimum: the sentence that opens with the amount stands alone",
    holds: (A) => block(A).includes("<strong>$55 per month minimum billing. From 65 participants, $0.85 per participant per month.</strong>") },
  { name: "POP: an option whose setup equals its renewal reads as a yearly price",
    holds: (A) => block(A).includes("($350 per year)") && block(A).includes("($550 per year)") && !block(A).includes("Setup $350") },
  { name: "no run-on line joined by bars anywhere in the block",
    holds: (A) => !/\s\|\s/.test(block(A)) },
];

function run(A) {
  let bad = 0;
  for (const r of RULES) {
    let ok = false;
    try { ok = !!r.holds(A); } catch (e) { ok = false; }
    console.log((ok ? "  ok   " : "  FAIL ") + r.name);
    if (!ok) bad++;
  }
  return bad;
}

const SABOTAGES = [
  { rule: "FSA: the monthly price and its rate, in bold, on their own line",
    find: "return amt + ' per month' + (bd ? ' - ' + bd : '');", replace: "return amt + '/mo' + (bd ? '  |  ' + bd : '');" },
  { rule: "POP: an option whose setup equals its renewal reads as a yearly price",
    find: "if (sameYearly(r)) return u.money(r.setupFee.amount) + ' per year';", replace: "if (false) return '';" },
];

if (process.argv.includes("--self-test")) {
  let weak = 0;
  for (const s of SABOTAGES) {
    let landed = false;
    const A = build((rel, src) => {
      if (!rel.endsWith("renderer.js")) return src;
      landed = src.includes(s.find);
      return src.split(s.find).join(s.replace);
    });
    if (!landed) { console.log("  BROKEN " + s.rule + " - the sabotage anchor matched nothing"); weak++; continue; }
    const r = RULES.find((x) => x.name === s.rule);
    let holds = true;
    try { holds = !!r.holds(A); } catch (e) { holds = false; }
    console.log((holds ? "  WEAK   " : "  RED    ") + s.rule);
    if (holds) weak++;
  }
  console.log(weak ? `\nself-test FAILED - ${weak}` : `\nself-test OK - ${SABOTAGES.length} sabotages, all reddened their rule`);
  process.exit(weak ? 1 : 0);
}

console.log("PRICE LINES ON THE SIGNATURE PAGE (F-448)\n");
const bad = run(build());
console.log(bad ? `\n${bad} FAILED` : `\nall ${RULES.length} hold`);
process.exit(bad ? 1 : 0);
