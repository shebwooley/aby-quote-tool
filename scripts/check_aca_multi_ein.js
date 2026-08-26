// MULTI-EIN AND LATE-FILING ACA QUOTES.
//
// Eric, 2026-08-26, after having to build one by hand: "this group has multiple EINs. If a group
// has multiple EINs or if they are filing late (past years), then self-service is not an option
// and should not be included on the quote."
//
// WHY IT NEEDED CODE RATHER THAN A NOTE. The rule was ALREADY in the tool -- pricing.js has
// carried "Multi-EIN employers must take Full Service: Self Service is not available where a
// second EIN is involved" for as long as the ACA product has existed. As a sentence. In a
// footnote. Nothing stopped anybody quoting Self Service to a multi-EIN group, which is exactly
// what happened. A rule with no enforcement is a preference.
//
// THE TWO DIRECTIONS, because a conditional has two silent failures:
//   * it does not fire -- a multi-EIN group is quoted Self Service, and ABY cannot deliver it;
//   * it fires when it should not -- an ordinary single-EIN group loses four packages and is
//     quoted thousands more than it should be.
// The second is the expensive one and is asserted just as hard.
//
//   node scripts/check_aca_multi_ein.js
//   node scripts/check_aca_multi_ein.js --self-test

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const FILES = [
  "assets/js/data/products.js",
  "assets/js/data/pricing.js",
  "assets/js/data/language.js",
  "assets/js/lib/utils.js",
  "assets/js/lib/engine.js",
  "assets/js/lib/renderer.js",
];

function build(edit) {
  const ctx = { console };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const rel of FILES) {
    let src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    if (edit) src = edit(rel, src);
    vm.runInContext(src, ctx, { filename: rel });
  }
  return ctx.ABYQuote;
}

const FORM = {
  companyName: "ALV Hospitality",
  effectiveDate: "2027-01-01",
  rep: { name: "Eric Johnson", email: "eric@abybenefits.com", phone: "(817) 366-7536" },
  recommendedPackages: {},
};

// One quote. `extras` is what the form collects from the new questions.
function quote(A, packageId, extras, count) {
  const sel = [{ productId: "aca", packageId, inputs: {}, count: count == null ? 120 : count, extras }];
  const results = A.engine.calculateAll(sel, true, "TX");
  return { results, html: A.renderer.renderForClient(FORM, results, "TX270101-T001-C", { includeAuthorization: true, employerEditableCounts: true }) };
}

const RULES = [
  {
    name: "an ordinary single-EIN group is still offered Self Service",
    why: "THE EXPENSIVE DIRECTION. Firing this rule on a normal group removes four packages and"
       + " quotes them thousands more than they should pay, on a document nobody would question.",
    holds: (A) => {
      const r = quote(A, "selfMid", undefined).results[0];
      return r && !r.blocked;
    },
  },
  {
    name: "multiple EINs blocks a Self Service package",
    why: "ABY cannot deliver Self Service to a multi-EIN employer. Quoting it sells something that"
       + " does not exist.",
    holds: (A) => !!quote(A, "selfMid", { einLarge: 2 }).results[0].blocked,
  },
  {
    name: "a small additional EIN blocks it too, not just a large one",
    why: "The $375 band is still a second EIN. A rule keyed on only one of the two questions is"
       + " the same defect with a narrower door.",
    holds: (A) => !!quote(A, "selfMid", { einSmall: 1 }).results[0].blocked,
  },
  {
    name: "late filing blocks it with no extra EIN at all",
    why: "Eric named two conditions joined by OR: 'multiple EINs OR if they are filing late'.",
    holds: (A) => !!quote(A, "selfMid", { priorYears: true }).results[0].blocked,
  },
  {
    name: "multiple EINs do NOT block Full Service",
    why: "Full Service is precisely what a multi-EIN group is supposed to buy. Blocking it would"
       + " leave the quote with nothing to offer.",
    holds: (A) => !quote(A, "fullMid", { einLarge: 2 }).results[0].blocked,
  },
  {
    name: "the engine refuses rather than silently upgrading the package",
    why: "Substituting Full Service for Self Service changes the price by thousands without saying"
       + " so, and the broker sends it. A refusal cannot be missed; a substitution can.",
    holds: (A) => {
      const r = quote(A, "selfMid", { einLarge: 2 }).results[0];
      return r.packageId === "selfMid" && !!r.blocked;
    },
  },
  {
    name: "additional EINs are priced at $750 and $375",
    why: "Two bands, and a single question with a rate chosen afterwards is how nine small EINs"
       + " get billed at the large rate.",
    holds: (A) => {
      const r = quote(A, "fullMid", { einLarge: 2, einSmall: 3 }).results[0];
      const by = Object.fromEntries((r.extraLines || []).map((l) => [l.id, l]));
      return by.einLarge && by.einLarge.amount === 1500
          && by.einSmall && by.einSmall.amount === 1125
          && r.extrasTotal === 2625;
    },
  },
  {
    name: "state filing is $500 for the first and $350 for each additional",
    why: "Eric: '$500 per EIN for that for the first state, $350 for additional states.'",
    holds: (A) => {
      const r = quote(A, "fullMid", { stateFirst: 2, stateMore: 3 }).results[0];
      const by = Object.fromEntries((r.extraLines || []).map((l) => [l.id, l]));
      return by.stateFirst && by.stateFirst.amount === 1000
          && by.stateMore && by.stateMore.amount === 1050;
    },
  },
  {
    name: "an unanswered extra is not a zero line",
    why: "A quote carrying '0 additional EINs' is a line about a thing that is not happening, on"
       + " every ACA quote ABY ever sends.",
    holds: (A) => {
      const r = quote(A, "fullMid", { einLarge: 1 }).results[0];
      return (r.extraLines || []).length === 1;
    },
  },
  {
    name: "the quantities reach the signature page, editable",
    why: "Eric: 'it needs to show up on the last page of the proposal where the employer can"
       + " change that number if needed.' His manual proposal does exactly this.",
    holds: (A) => {
      const h = quote(A, "fullMid", { einLarge: 2, stateFirst: 1 }).html;
      return h.includes('class="elected-qty"')
          && h.includes('per additional EIN with 10 or more W-2s')
          && h.includes("for the first state (per EIN)");
    },
  },
  {
    name: "the charged quantities also appear in the quote body",
    why: "The signature page is where they are changed; the body is where they are first read. An"
       + " employer meeting a $1,500 charge for the first time above their own signature is a"
       + " surprise, not a quote.",
    holds: (A) => {
      const h = quote(A, "fullMid", { einLarge: 2 }).html;
      return h.includes("Included in this quote, by quantity") && h.includes("2 x Additional EINs");
    },
  },
  {
    name: "a quote with no extras gains neither block",
    why: "Both new blocks must be absent entirely on an ordinary quote, not present and empty.",
    holds: (A) => {
      const h = quote(A, "fullMid", undefined).html;
      return !h.includes("Included in this quote, by quantity") && !h.includes('class="elected-qty"');
    },
  },
  {
    name: "the 1094/1095-B per-form rates are the ones Niels gave",
    why: "Approved by Eric 2026-08-26 -- $2.00 commissioned, $1.00 no-commission. The no-commission"
       + " figure REPLACES his own 2026-08-18 ruling of $2.50, so it is the one most likely to be"
       + " 'restored' by a later reader of that note.",
    holds: (A) => {
      const P = A.pricing.TX;
      return P.commissioned.aca.packages.smallB.formula.perForm === 2.00
          && P.noCommission.aca.packages.smallB.formula.perForm === 1.00
          && P.commissioned.aca.packages.smallB.formula.base === 475
          && P.noCommission.aca.packages.smallB.formula.base === 450;
    },
  },
  {
    name: "the C-form band prices were NOT touched",
    why: "Eric: 'I'll verify all of the ACA prices with Niels' and 'don't take any pricing off my"
       + " ALV quote.' These are the figures still under review, and this rule exists so that"
       + " changing one is a deliberate act rather than a side effect of this work.",
    holds: (A) => {
      const c = A.pricing.TX.commissioned.aca.packages;
      const n = A.pricing.TX.noCommission.aca.packages;
      return c.fullLt100.annualFee === 3500 && c.fullMid.annualFee === 3900
          && c.fullHigh.annualFee === 4300 && c.fullXL.annualFee === 4750
          && n.fullLt100.annualFee === 3300 && n.fullMid.annualFee === 3700
          && n.fullHigh.annualFee === 4100 && n.fullXL.annualFee === 4550;
    },
  },
];

const SABOTAGES = [
  { why: "the exclusion list is emptied, so a multi-EIN group is quoted Self Service",
    edit: (rel, s) => rel.endsWith("products.js")
      ? s.replace("excludeWhenAnyOf: ['einLarge', 'einSmall', 'priorYears'],", "excludeWhenAnyOf: [],") : s },
  { why: "only the large-EIN question excludes, so a $375 EIN slips through",
    edit: (rel, s) => rel.endsWith("products.js")
      ? s.replace("excludeWhenAnyOf: ['einLarge', 'einSmall', 'priorYears'],", "excludeWhenAnyOf: ['einLarge'],") : s },
  { why: "late filing stops excluding",
    edit: (rel, s) => rel.endsWith("products.js")
      ? s.replace("excludeWhenAnyOf: ['einLarge', 'einSmall', 'priorYears'],", "excludeWhenAnyOf: ['einLarge', 'einSmall'],") : s },
  { why: "the exclusion fires on Full Service too, leaving the quote nothing to offer",
    edit: (rel, s) => rel.endsWith("products.js")
      ? s.replace("excludedPackages: ['selfLt100', 'selfMid', 'selfHigh', 'selfXL'],",
                  "excludedPackages: ['selfLt100', 'selfMid', 'selfHigh', 'selfXL', 'fullMid'],") : s },
  { why: "the engine substitutes a package instead of refusing",
    edit: (rel, s) => rel.endsWith("engine.js")
      ? s.replace("result.blocked = product.excludedReason ||", "result.packageId = 'fullMid'; result.notBlocked = product.excludedReason ||") : s },
  { why: "an EIN fee is changed",
    edit: (rel, s) => rel.endsWith("products.js") ? s.replace("fee: 750,", "fee: 700,") : s },
  { why: "a state fee is changed",
    edit: (rel, s) => rel.endsWith("products.js") ? s.replace("fee: 350,", "fee: 300,") : s },
  { why: "zero-quantity extras start producing lines",
    edit: (rel, s) => rel.endsWith("engine.js") ? s.replace("if (!(qty > 0)) return;", "") : s },
  { why: "the elected quantities stop reaching the signature page",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace(/class="elected-qty"/g, 'class="gone-qty"') : s },
  { why: "the charged quantities stop appearing in the quote body",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("renderExtraCharges(first),", "") : s },
  { why: "the B-form per-form rate drifts back to the superseded $2.50",
    edit: (rel, s) => rel.endsWith("pricing.js")
      ? s.replace("smallB_base: 450, smallB_perForm: 1.00,", "smallB_base: 450, smallB_perForm: 2.50,") : s },
  { why: "a C-form band price is changed while nobody is looking",
    edit: (rel, s) => rel.endsWith("pricing.js")
      ? s.replace("fullHigh: 4300,", "fullHigh: 4200,") : s },
];

let bad = 0;
let A;
try { A = build(null); }
catch (e) { console.log("COULD NOT RENDER at all: " + e.message); process.exit(2); }

console.log("ACA MULTI-EIN -- " + RULES.length + " rules, asserted on the rendered quote");
const base = RULES.map((r) => { try { return !!r.holds(A); } catch (e) { return false; } });
RULES.forEach((r, i) => {
  console.log((base[i] ? "  ok   " : "  FAIL ") + r.name);
  if (!base[i]) { bad++; console.log("         " + r.why); }
});

if (process.argv.includes("--self-test")) {
  console.log("");
  console.log("SELF-TEST -- every sabotage must redden at least one rule");
  for (const s of SABOTAGES) {
    let applied = false;
    const edit = (rel, src) => { const out = s.edit(rel, src); if (out !== src) applied = true; return out; };
    let after;
    try {
      const B = build(edit);
      after = RULES.map((r) => { try { return !!r.holds(B); } catch (e) { return false; } });
    } catch (e) { after = RULES.map(() => false); }
    if (!applied) { console.log("  BROKEN  " + s.why + "  (the edit matched nothing)"); bad++; continue; }
    const flipped = after.filter((v, i) => base[i] && !v).length;
    console.log((flipped ? "  caught  " : "  MISSED  ") + s.why
      + (flipped ? "  (" + flipped + " rule(s) went green->red)" : ""));
    if (!flipped) bad++;
  }
}

console.log("");
if (bad) { console.log(">> " + bad + " problem(s)."); process.exit(1); }
console.log("multi-EIN and late-filing quotes offer only Full Service, and price the extras.");
