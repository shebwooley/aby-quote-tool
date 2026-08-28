// A POP DOCUMENT-ONLY QUOTE MUST NOT DESCRIBE TESTING IT DOES NOT INCLUDE.
//
// Eric, 2026-08-26: on the $99 document-only package, add a bold line saying testing is not
// included and the employer is responsible for it -- "and then these two additional services
// should be removed since testing isn't included."
//
// WHY THIS IS A CHECKER AND NOT JUST AN EDIT. It is a CONDITIONAL on a client-facing document, and
// a conditional has two ways to be wrong that look nothing alike:
//   * it does not fire when it should -- the employer reads three paragraphs about nondiscrimination
//     testing, a table of what each test costs, and buys a product that includes none of it;
//   * it fires when it should NOT -- a broker showing document-only ALONGSIDE a testing package
//     loses two real prices off the option that does include testing.
// Neither shows up in a syntax check, and both are silent. So both directions are asserted here.
//
// ⭐ IT RENDERS THE REAL FILES. The engine and the renderer are browser code, so this builds a
// window, loads the four shipped files into it, and reads the HTML they produce. A rule that
// grepped the source would agree with itself while the page did something else -- which is the
// mistake this repo has already paid for more than once.
//
//   node scripts/check_pop_docsonly.js
//   node scripts/check_pop_docsonly.js --self-test

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

// A minimal form. Only what the POP section reads: the renderer takes the whole thing but this
// product's section does not touch the employer fields.
const FORM = {
  companyName: "Test Employer",
  effectiveDate: "2027-01-01",
  rep: { name: "Eric Johnson", email: "eric@abybenefits.com", phone: "(817) 366-7536" },
  recommendedPackages: {},
};

function render(A, packageIds) {
  const sel = packageIds.map((p) => ({ productId: "pop", packageId: p, inputs: {} }));
  const results = A.engine.calculateAll(sel, true, "TX");
  return A.renderer.renderForClient(FORM, results, "TX270101-T001-C", {});
}

// The exact sentence, read out of language.js rather than restated here. A copy in this file is a
// second place for it to be wrong, and the two would drift the first time Eric reworded it.
function notice(A) {
  return A.language.products.pop.docsOnlyNotice;
}

// AS IT APPEARS ON THE PAGE, escaped by the SHIPPED escaper rather than by a copy of it.
// The first version of this file re-implemented the escaping and wrote &#39; where utils.js
// writes &#039;. Two rules failed against a page that was completely correct -- a checker
// disagreeing with the product because it re-implemented the thing it was checking, which is
// the exact failure this whole suite exists to catch. Ask the code; never re-derive it.
function rendered(A) {
  return A.utils.escapeHtml(notice(A));
}

const RULES = [
  {
    name: "document-only: the bold notice is on the page",
    why: "Everything above it in that section describes testing ABY performs. Without this the"
       + " section reads as a description of what the employer is buying.",
    holds: (A) => {
      const h = render(A, ["docsOnly"]);
      const n = rendered(A);
      return !!notice(A) && h.includes(n);
    },
  },
  {
    name: "document-only: the notice is BOLD, as asked",
    why: "Eric asked for bold specifically. A caveat set in the same weight as the three paragraphs"
       + " it contradicts is a caveat the reader's eye slides past.",
    holds: (A) => render(A, ["docsOnly"]).includes("<strong>" + rendered(A) + "</strong>"),
  },
  {
    name: "document-only: neither NDT fee is quoted",
    why: "Eric: 'these two additional services should be removed since testing isn't included.'"
       + " Pricing an extra test on a quote that buys no tests invites a question with no answer.",
    holds: (A) => {
      const h = render(A, ["docsOnly"]);
      return !h.includes("Additional NDT") && !h.includes("Prior year NDT");
    },
  },
  {
    name: "document-only: the fees that are NOT about testing survive",
    why: "The point is to remove what testing pays for, not to empty the fee schedule. Data"
       + " reformatting is charged whatever package is bought.",
    holds: (A) => render(A, ["docsOnly"]).includes("Data manipulation"),
  },
  {
    name: "a testing package still quotes both NDT fees",
    why: "THE OTHER DIRECTION, and the expensive one. These are real prices on a package that does"
       + " include testing; suppressing them there strips accurate pricing off a live option.",
    holds: (A) => {
      const h = render(A, ["full"]);
      return h.includes("Additional NDT") && h.includes("Prior year NDT");
    },
  },
  {
    name: "a testing package does NOT carry the document-only notice",
    why: "It would tell an employer who is buying testing that they have not bought it.",
    holds: (A) => !render(A, ["full"]).includes(rendered(A)),
  },
  {
    name: "quoting BOTH packages keeps the fees and drops the notice",
    why: "A broker showing document-only next to a testing package is quoting a CHOICE, and an"
       + " employer being shown two packages is not 'being quoted the document only'. Getting this"
       + " backwards removes two real prices from the option that includes testing.",
    holds: (A) => {
      const h = render(A, ["docsOnly", "full"]);
      return h.includes("Additional NDT") && h.includes("Prior year NDT") && !h.includes(rendered(A));
    },
  },
  {
    name: "both rate books carry the flag, not just the commissioned one",
    why: "pricing.js holds TWO POP blocks -- commissioned and noCommission -- with the same two"
       + " fees. One fix applied to one copy of a pattern is not applied to the pattern.",
    holds: (A) => {
      const src = fs.readFileSync(path.join(ROOT, "public/assets/js/data/pricing.js"), "utf8");
      return (src.match(/needsTesting: true/g) || []).length === 4;
    },
  },
];

// Each sabotage is a way this conditional could break, silently, in a real edit.
const SABOTAGES = [
  { why: "the notice is dropped from language.js",
    edit: (rel, s) => rel.endsWith("language.js") ? s.replace(/docsOnlyNotice:/, "unusedNotice:") : s },
  { why: "the notice stops being bold",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("'<p><strong>' + esc(lang.docsOnlyNotice) + '</strong></p>'",
                  "'<p>' + esc(lang.docsOnlyNotice) + '</p>'") : s },
  { why: "the fee filter is removed, so a document-only quote prices two tests it does not include",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("if (docsOnly) fees = fees.filter(function (f) { return !f.needsTesting; });", "") : s },
  { why: "the filter is inverted, so a testing package loses its real NDT prices",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("if (docsOnly) fees = fees.filter(function (f) { return !f.needsTesting; });",
                  "if (!docsOnly) fees = fees.filter(function (f) { return !f.needsTesting; });") : s },
  { why: "the condition becomes 'any package is docsOnly' instead of 'every package is'",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("return rs.every(function (r) { return r.packageId === 'docsOnly'; });",
                  "return rs.some(function (r) { return r.packageId === 'docsOnly'; });") : s },
  { why: "a flag is lost from the second rate book",
    edit: (rel, s) => rel.endsWith("pricing.js")
      ? s.replace(/needsTesting: true, /, "") : s },
];

let bad = 0;
let A;
try { A = build(null); }
catch (e) { console.log("COULD NOT RENDER at all: " + e.message); process.exit(2); }

console.log("POP DOCUMENT-ONLY -- " + RULES.length + " rules, asserted on the rendered quote");
const base = RULES.map((r) => { try { return !!r.holds(A); } catch (e) { return false; } });
RULES.forEach((r, i) => {
  console.log((base[i] ? "  ok   " : "  FAIL ") + r.name);
  if (!base[i]) { bad++; console.log("         " + r.why); }
});

if (process.argv.includes("--self-test")) {
  console.log("");
  console.log("SELF-TEST -- every sabotage must redden at least one rule");
  for (const s of SABOTAGES) {
    // A SABOTAGE THAT DID NOT APPLY IS NOT A PASSING TEST, IT IS NO TEST AT ALL, and it looks
    // exactly like one that ran.
    let applied = false;
    const edit = (rel, src) => {
      const out = s.edit(rel, src);
      if (out !== src) applied = true;
      return out;
    };
    let after;
    try {
      const B = build(edit);
      after = RULES.map((r) => { try { return !!r.holds(B); } catch (e) { return false; } });
    } catch (e) {
      after = RULES.map(() => false);   // it stopped rendering: caught, loudly
    }
    if (!applied) { console.log("  BROKEN  " + s.why + "  (the edit matched nothing)"); bad++; continue; }
    const flipped = after.filter((v, i) => base[i] && !v).length;
    console.log((flipped ? "  caught  " : "  MISSED  ") + s.why
      + (flipped ? "  (" + flipped + " rule(s) went green->red)" : ""));
    if (!flipped) bad++;
  }
}

console.log("");
if (bad) {
  console.log(">> " + bad + " problem(s).");
  process.exit(1);
}
console.log("a document-only POP quote says what it does not include, and a testing quote keeps its prices.");
