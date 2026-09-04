// SEVERAL OPTIONS ON ONE QUOTE, AND A TOTAL THAT FOLLOWS THE ONE THE READER PICKS.
//
// Eric, 2026-09-04: "Right now we have drop-downs for the POP. We'd actually like to show all
// three options in a grid... With ACA, I'd like for it to show full service and self service both
// by default... Same with ERISA - I would like all options shown by default... I realize on the
// ones where there are multiple options shown, showing an annual total will likely not be possible
// unless you can figure out a way how. Perhaps by pre-checking an option and changing the total if
// someone selects a different option instead."
//
// WHY THIS NEEDS A CHECKER RATHER THAN A CAREFUL EDIT. Showing several options at once turned two
// numbers on a CLIENT-FACING document into things that have to AGREE:
//   * each option's printed price and the figures its radio carries, and
//   * the sum of the pre-checked options and the Estimated Annual Total.
// Neither disagreement throws. Both render as a confident, wrong money figure on a page an
// employer signs. Three of the defects below were live before this change and invisible only
// because POP never showed two options at once:
//   * "What is included" was EMPTY on every POP row -- the names had no colon to split on;
//   * POP Documents Only printed its $99 ANNUAL fee in the SETUP column, with renewal "n/a";
//   * the total silently took the CHEAPEST option and said so in a caveat.
//
// ⭐ IT RENDERS THE REAL FILES, and for the switching rules it reads the REAL bundle out of
// app.js rather than a copy. A checker that restated either would agree with itself while the
// page did something else.
//
//   node scripts/check_options_grid.mjs
//   node scripts/check_options_grid.mjs --self-test

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");

const RENDER_FILES = [
  "public/assets/js/data/products.js",
  "public/assets/js/data/pricing.js",
  "public/assets/js/data/language.js",
  "public/assets/js/lib/utils.js",
  "public/assets/js/lib/engine.js",
  "public/assets/js/lib/renderer.js",
];
const APP = "public/assets/js/app.js";
const WORKER = "worker.js";

// ── Loading the product under test ───────────────────────────────────────────────────────────

function build(edit) {
  const ctx = { console };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const rel of RENDER_FILES) {
    let src = readFileSync(join(ROOT, rel), "utf8");
    if (edit) src = edit(rel, src);
    vm.runInContext(src, ctx, { filename: rel });
  }
  return ctx.ABYQuote;
}

// THE COMMIT BUNDLE, TAKEN OUT OF app.js AS IT IS WRITTEN. This is the only code that reaches a
// DOWNLOADED quote -- the file an employer opens from their inbox loads nothing else -- so a rule
// that tested a copy of it would say nothing about the document that actually gets signed.
// ⛔ NO BACKSLASH IS WRITTEN ANYWHERE IN THIS FILE. The bundle's own rule is that it may not
// contain one (TRAPS #224 / #248), and a checker that has to escape one to look for one is a
// checker that can be defeated by its own quoting. Character codes instead.
const LF = String.fromCharCode(10);
const BACKTICK = String.fromCharCode(96);
const BACKSLASH = String.fromCharCode(92);
const JOIN_MARKER = "].join('" + BACKSLASH + "n');";

function bundleLiteral(edit) {
  let src = readFileSync(join(ROOT, APP), "utf8");
  if (edit) src = edit(APP, src);
  const start = src.indexOf("var ABY_COMMIT_JS = [");
  const end = src.indexOf(JOIN_MARKER, start);
  if (start < 0 || end < 0) return null;
  return src.slice(src.indexOf("[", start), end + 1);
}

// THE ARRAY'S SOURCE, WITH ITS WHOLE-LINE COMMENTS REMOVED.
// ⭐ The comments are stripped because they are the one part that never reaches the document --
// and this file's own commentary legitimately quotes `identifiers` in backticks. What must stay
// clean is the STRING LITERALS, because those are what gets inlined.
// ⚠️ Only WHOLE-LINE comments are dropped, deliberately: a naive strip at the first "//" would cut
// the submit URL in half and hide everything after it on that line.
function bundleSource(edit) {
  const literal = bundleLiteral(edit);
  if (literal === null) return null;
  return literal.split(LF).filter((l) => l.trim().indexOf("//") !== 0).join(LF);
}

// app.js with its whole-line comments removed, so a rule cannot be satisfied by the paragraph
// that explains the thing it is looking for (TRAPS #94).
function appSourceNoComments(edit) {
  let src = readFileSync(join(ROOT, APP), "utf8");
  if (edit) src = edit(APP, src);
  return src.split(LF).filter((l) => l.trim().indexOf("//") !== 0 && l.trim().indexOf("*") !== 0).join(LF);
}

function commitBundle(edit) {
  const literal = bundleLiteral(edit);
  if (literal === null) return null;
  try {
    return vm.runInNewContext("(" + literal + ")").join(LF);
  } catch (e) {
    return null;
  }
}

// One function out of worker.js, run for real. Slicing beats restating: the rule under test is
// what that function DOES with two package ids that share a label.
function workerFn(name, edit) {
  let src = readFileSync(join(ROOT, WORKER), "utf8");
  if (edit) src = edit(WORKER, src);
  const at = src.indexOf(LF + "function " + name + "(");
  if (at < 0) return null;
  let i = src.indexOf("{", at), depth = 0, endAt = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) { endAt = j + 1; break; } }
  }
  if (endAt < 0) return null;
  const shortMap = src.slice(src.indexOf("const PRODUCT_SHORT = {"),
                             src.indexOf(LF + "};", src.indexOf("const PRODUCT_SHORT = {")) + 3);
  const ctx = { console };
  vm.createContext(ctx);
  try {
    vm.runInContext(shortMap + LF + "const PRODUCT_NAME_TO_ID = {};" + LF + src.slice(at, endAt) +
                    LF + "globalThis.__fn = " + name + ";", ctx);
    return ctx.__fn;
  } catch (e) { return null; }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

const FORM = {
  clientName: "Fixture Employer",
  brokerAgency: "Fixture Agency",
  effectiveDate: "2027-01-01",
  recommendedPackages: {},
};

function renderQuote(A, sels, form) {
  const results = A.engine.calculateAll(sels, true, "TX");
  return {
    results,
    client: A.renderer.renderForClient(form || FORM, results, "TX270101-0001-C", { includeAuthorization: true }),
    internal: A.renderer.renderInternal(form || FORM, results, "TX270101-0001-C", { includeAuthorization: true }),
  };
}
const popAll = () => ["docsOnly", "popHsa", "full"].map((p) => ({ productId: "pop", packageId: p }));
const erisaAll = () => ["basic", "buyUp", "enhanced", "fullSpd", "fullSpdTesting", "whiteGlove"]
  .map((p) => ({ productId: "erisa", packageId: p }));
const acaBoth = (extras) => [
  { productId: "aca", packageId: "fullMid", extras },
  { productId: "aca", packageId: "selfMid", extras },
];

// Read the radios back out of rendered markup. Deliberately a parse of the PAGE rather than a
// call into the renderer: what matters is what the document carries.
function picks(html) {
  const out = [];
  const re = /<input type="radio"[^>]*class="opt-pick[^"]*"[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const attr = (n) => { const a = new RegExp(n + '="([^"]*)"').exec(tag); return a ? a[1] : null; };
    out.push({
      product: attr("data-opt-product"),
      pkg: attr("data-opt-package"),
      annual: Number(attr("data-opt-annual")),
      oneTime: Number(attr("data-opt-onetime")),
      checked: tag.indexOf(" checked") !== -1,
    });
  }
  return out;
}
function bigTotal(html) {
  const m = /<span data-aby-total-annual>([^<]*)<\/span>/.exec(html);
  return m ? m[1] : null;
}
function moneyOf(A, n) { return A.utils.money(Math.round(n)); }

// ── The rules ────────────────────────────────────────────────────────────────────────────────

const RULES = [
  {
    name: "three options render as CARDS, six render as the TABLE",
    why: "Eric's own split. Six cards wrap into a cramped 3+3 block and stop the eye running down"
       + " one column to compare prices, which is the only thing a six-option list is for.",
    holds: (A) => {
      const pop = renderQuote(A, popAll()).client;
      const er = renderQuote(A, erisaAll()).client;
      return pop.includes('class="options-grid') && !pop.includes('<table class="options-table">')
          && er.includes('<table class="options-table has-picks">') && !er.includes('class="options-grid');
    },
  },
  {
    name: "every option in BOTH layouts carries a radio with its own figures",
    why: "The layout split is about shape only. If the table had no radios, a reader could switch"
       + " a six-option quote on the signature page and watch the total sit still.",
    holds: (A) => {
      const p = picks(renderQuote(A, popAll()).client);
      const e = picks(renderQuote(A, erisaAll()).client);
      return p.length === 3 && e.length === 6
          && p.every((x) => x.product === "pop" && Number.isFinite(x.annual) && Number.isFinite(x.oneTime))
          && e.every((x) => x.product === "erisa" && Number.isFinite(x.annual) && Number.isFinite(x.oneTime));
    },
  },
  {
    name: "exactly one option per product is pre-checked",
    why: "None checked leaves the total resting on nothing; two checked is a radio group that has"
       + " lost its name attribute, and the reader can select both.",
    holds: (A) => {
      const all = picks(renderQuote(A, [...popAll(), ...erisaAll(), ...acaBoth()]).client);
      const byProduct = {};
      all.forEach((x) => { byProduct[x.product] = (byProduct[x.product] || 0) + (x.checked ? 1 : 0); });
      return Object.keys(byProduct).length === 3 &&
             Object.values(byProduct).every((n) => n === 1);
    },
  },
  {
    name: "the BROKER'S recommendation is the pre-checked option",
    why: "This is the change Eric asked for. Before it the total always took the cheapest option,"
       + " so a POP quote headlined $99 whatever the broker actually recommended.",
    holds: (A) => {
      const html = renderQuote(A, popAll(), { ...FORM, recommendedPackages: { pop: "full" } }).client;
      const checked = picks(html).filter((x) => x.checked);
      return checked.length === 1 && checked[0].pkg === "full";
    },
  },
  {
    name: "with no recommendation it falls back to the lowest-cost option",
    why: "Every quote run before today has no recommendation set. The old behaviour has to survive"
       + " for them, or reopening an old quote changes what it says.",
    holds: (A) => {
      const checked = picks(renderQuote(A, popAll()).client).filter((x) => x.checked);
      return checked.length === 1 && checked[0].pkg === "docsOnly";
    },
  },
  {
    name: "the Estimated Annual Total EQUALS the sum of the pre-checked options",
    why: "⭐ THE RULE THE WHOLE CHANGE RESTS ON. The headline figure and the selected options are"
       + " two statements about one price, computed in different places. Nothing else compares them.",
    holds: (A) => {
      const form = { ...FORM, recommendedPackages: { pop: "popHsa" } };
      const q = renderQuote(A, [...popAll(), ...acaBoth(), { productId: "hsa", count: 40 }], form);
      const chosen = picks(q.client).filter((x) => x.checked);
      // The single-option product (HSA) is not a radio, so take its figure from the engine.
      const hsa = q.results.filter((r) => r.productId === "hsa")[0];
      const hsaAnnual = (hsa.renewalFee ? hsa.renewalFee.amount : 0) +
                        (hsa.annualFee ? hsa.annualFee.amount : 0) +
                        (hsa.monthlyFee ? hsa.monthlyFee.amount * 12 : 0);
      const sum = chosen.reduce((a, x) => a + x.annual, 0) + hsaAnnual;
      return bigTotal(q.client) === moneyOf(A, sum);
    },
  },
  {
    name: "an option's printed price agrees with the figure its radio carries",
    why: "🔴 A REAL DEFECT, CAUGHT BY RENDERING IT. The first version printed POP Documents + NDT"
       + " as $350 one-time setup AND $350 per year -- $700 to a reader -- while its radio and the"
       + " total both said $350. A card that disagrees with the total beside it is worse than"
       + " either number being wrong, because nobody can tell which to believe.",
    holds: (A) => {
      const html = renderQuote(A, popAll()).client;
      const cards = html.split('<label class="option-card').slice(1);
      if (cards.length !== 3) return false;
      return cards.every((card) => {
        const pkg = /data-opt-package="([^"]*)"/.exec(card)[1];
        const annual = Number(/data-opt-annual="([^"]*)"/.exec(card)[1]);
        const oneTime = Number(/data-opt-onetime="([^"]*)"/.exec(card)[1]);
        const perYear = [...card.matchAll(/<span class="opt-price-amount">([^<]*)<\/span><span class="opt-price-unit">per year<\/span>/g)];
        const setups = [...card.matchAll(/<span class="opt-price-amount">([^<]*)<\/span><span class="opt-price-unit">one-time setup<\/span>/g)];
        const shownYear = perYear.length ? perYear[0][1] : A.utils.money(0);
        const shownOne = setups.length ? setups[0][1] : null;
        if (annual > 0 && shownYear !== A.utils.money(annual)) return false;
        if (oneTime > 0 && shownOne !== A.utils.money(oneTime)) return false;
        if (oneTime === 0 && shownOne !== null) return false;   // no phantom setup line
        return pkg.length > 0;
      });
    },
  },
  {
    name: "POP Documents Only is never printed as a SETUP fee",
    why: "🔴 IT WAS, AND IT WAS MEASURED. In the mixed table it printed $99 under 'Setup fee' with"
       + " 'n/a' under 'Annual renewal'. The package is $99 A YEAR; the page said it was a one-time"
       + " charge that never renews. Invisible while POP could only show one option at a time.",
    holds: (A) => {
      const html = renderQuote(A, popAll()).client;
      const only = html.split('<label class="option-card').filter((c) => c.includes('data-opt-package="docsOnly"'))[0];
      return !!only && only.includes("per year") && !only.includes("one-time setup");
    },
  },
  {
    name: "every option says what is included",
    why: "🔴 ALSO A LIVE DEFECT. `splitPackageName` splits a name on a colon; POP's three names had"
       + " none, so the description was empty on every row while ERISA's filled correctly. An"
       + " option with a price and no description is a number the employer cannot act on.",
    holds: (A) => {
      const pop = renderQuote(A, popAll()).client
        .split('<label class="option-card').slice(1)
        .every((c) => /<p class="opt-card-desc">[^<]{10,}<\/p>/.test(c));
      const erisa = renderQuote(A, erisaAll()).client;
      const body = erisa.slice(erisa.indexOf("<tbody>"), erisa.indexOf("</tbody>"));
      const noEmpty = !/<td><\/td>/.test(body);
      return pop && noEmpty;
    },
  },
  {
    name: "a REFUSED option is absent from the client document but named in the internal notes",
    why: "Eric on Self Service with multi-EIN: it 'should not be included on the quote' -- 'NOT"
       + " GREYED OUT AND NOT FOOTNOTED -- ABSENT.' The refusal still has to reach ABY and the"
       + " broker, or a quote quietly drops an option nobody knows was dropped.",
    holds: (A) => {
      const q = renderQuote(A, acaBoth({ einLarge: 2 }));
      const shown = picks(q.client).map((x) => x.pkg);
      return shown.indexOf("selfMid") === -1
          && q.internal.includes("Self Service is not available")
          // What survives is the Full Service price, and the EIN charge that forced it.
          && q.client.includes(A.utils.money(3900))
          && q.client.includes("Additional EINs with 10 or more");
    },
  },
  {
    name: "a ONE-OPTION quote still names the package it is for",
    why: "🔴 FOUND BY A RULE OF THIS CHECKER THAT WAS ITSELF WRONG, and older than this change."
       + " `renderPricingCards` names the KIND of fee, never the package -- so a Full-Service-only"
       + " ACA quote printed '$3,900 per year' and never said Full Service. Two ACA products more"
       + " than two thousand dollars apart look identical on the page.",
    holds: (A) => {
      const forced = renderQuote(A, acaBoth({ einLarge: 2 })).client;
      const ichra = renderQuote(A, [{ productId: "ichra", packageId: "docsOnly" }]).client;
      // ⛔ And a TIERED product has no package to name: an empty heading on every FSA quote in
      // the book would be this fix costing more than the defect.
      const fsa = renderQuote(A, [{ productId: "fsa", count: 30 }]).client;
      return forced.includes("ALE Full Service") &&
             ichra.includes('class="chosen-package"') &&
             !fsa.includes('class="chosen-package"');
    },
  },
  {
    name: "a product whose options are ALL refused still says so",
    why: "The filter drops refused options only when something survives. Dropping the last one"
       + " would delete the product from the quote in silence, which is the failure this repo has"
       + " recorded more than once -- better the loud refusal than a missing section.",
    holds: (A) => {
      const q = renderQuote(A, [{ productId: "aca", packageId: "selfMid", extras: { einLarge: 2 } }]);
      return q.internal.includes("Self Service is not available");
    },
  },
  {
    name: "the retired 'lowest-cost option' caveat is gone",
    why: "It described the OLD behaviour. A caveat left standing after the thing under it moved is"
       + " worse than none: a reader who trusts it is told the headline is the cheapest option on"
       + " offer when it may now be the dearest.",
    holds: (A) => !renderQuote(A, popAll()).client.includes("lowest-cost option is used"),
  },
  {
    name: "ACA quotes Full Service and Self Service together by default",
    why: "The ask itself. Both bands' ids have to price, or the form's two questions produce a"
       + " quote with one option in it.",
    holds: (A) => {
      const p = picks(renderQuote(A, acaBoth()).client);
      return p.length === 2 && p.some((x) => x.pkg === "fullMid") && p.some((x) => x.pkg === "selfMid");
    },
  },
  {
    name: "every ACA band names package ids that exist and can be priced",
    why: "The band table is a second name for the nine packages. A typo there produces a band that"
       + " quotes NOTHING, and an empty product section does not throw.",
    holds: (A) => {
      const aca = A.products.filter((p) => p.id === "aca")[0];
      if (!aca || !aca.bands || aca.bands.length < 2) return false;
      const known = {};
      aca.packages.forEach((p) => { known[p.id] = true; });
      return aca.bands.every((b) => {
        const ids = [b.packages.full, b.packages.self].filter(Boolean);
        if (!ids.length) return false;
        return ids.every((id) => known[id] &&
          A.engine.calculateProduct({ productId: "aca", packageId: id, count: 50 }, true, "TX"));
      });
    },
  },
  {
    name: "POP and ERISA both show every option by default",
    why: "Eric asked for all three POP options and all six ERISA options shown without the broker"
       + " having to tick anything. `defaultAll` is what the form reads.",
    holds: (A) => {
      const byId = {};
      A.products.forEach((p) => { byId[p.id] = p; });
      return byId.pop && byId.erisa &&
             byId.pop.inputType === "multi-package" && byId.pop.defaultAll === true &&
             byId.erisa.inputType === "multi-package" && byId.erisa.defaultAll === true &&
             byId.pop.packages.length === 3 && byId.erisa.packages.length === 6;
    },
  },
  // ── THE TWO FORM-SIDE RULES, AND WHAT THEY HONESTLY ARE ─────────────────────────────────────
  // ⚠️ THESE TWO ASSERT SOURCE, NOT BEHAVIOUR, AND THAT IS A REAL WEAKNESS RATHER THAN A CHOICE
  // I AM HAPPY WITH. The mechanisms live inside app.js's IIFE and read `formEl`, so there is no
  // DOM here to exercise them and nothing to extract. Both defects were found by driving the
  // real form in a browser on 2026-09-04 and both were fixed there; these rules exist so the
  // fixes cannot be deleted silently, which is the failure mode that actually happens.
  // ⛔ COMMENTS ARE STRIPPED BEFORE MATCHING (TRAPS #94): the paragraph explaining `userSet`
  // contains the word, and a checker satisfied by its own explanation checks nothing.
  {
    name: "withdrawing an excluding answer brings Self Service BACK",
    why: "🔴 A REAL BUG, FOUND BY RUNNING THE FORM. Clearing the EIN count unlocked the switch and"
       + " left it TICKED, so Self Service never returned and the quote stayed Full-Service-only"
       + " with nothing saying so. The dropdown this replaced did restore its removed options.",
    holds: (A, edit) => {
      const s = appSourceNoComments(edit);
      return s.indexOf("svcCb.checked = svcCb.dataset.userSet === '1';") !== -1 &&
             s.indexOf("svcCb.dataset.userSet = svcCb.checked ? '1' : '0';") !== -1;
    },
  },
  {
    name: "a re-run reopens a Full-Service-only quote as Full Service only",
    why: "🔴 THE SECOND HALF OF THE SAME BUG, and it pointed the other way: the restore above ran"
       + " on the prefilled control and reset it, so re-running a one-option ACA quote showed TWO"
       + " options. A re-run displaying more than the quote it reopens is a price change nobody"
       + " asked for.",
    holds: (A, edit) => {
      const s = appSourceNoComments(edit);
      return s.indexOf("fullOnlyEl.dataset.userSet = fullOnlyEl.checked ? '1' : '0';") !== -1;
    },
  },
  {
    name: "the ACA band default is one that HAS both service levels",
    why: "The first band in the list is the small-group B form, which has no service levels. A"
       + " default landing there would make 'both by default' true of every band except the one"
       + " the broker actually starts on.",
    holds: (A) => {
      const aca = A.products.filter((p) => p.id === "aca")[0];
      const band = (aca.bands || []).filter((b) => b.id === aca.defaultBand)[0];
      return !!band && !!band.packages.full && !!band.packages.self;
    },
  },
  {
    name: "the elected EXTRAS reach the Estimated Annual Total",
    why: "🔴 F-483, Eric 2026-09-04: *\"EIN and state filing charges would apply to the annual total"
       + " if they enter the number of EINs for 2-9 and 10+ and enter the number of states.\"* They"
       + " reached it on NO quote before that — a two-EIN ACA quote headlined $1,500 short of what"
       + " the employer would be billed, while the same $1,500 was printed twice elsewhere.",
    holds: (A) => {
      const extras = { stateFirst: 1, stateMore: 2 };            // 500 + 350x2 = 1200
      const q = renderQuote(A, [
        { productId: "aca", packageId: "fullLt100", extras },
        { productId: "aca", packageId: "selfLt100", extras },
      ]);
      // selfLt100 is the pre-checked (cheapest) option at $1,250, plus $1,200 of extras.
      // ⚠️ THE NOTE IS ASSERTED SEPARATELY FROM THE ROW, and it has to be: the row is NAMED
      // "…: additional services", so a loose `includes("additional services")` was satisfied by
      // the row and the note's own sabotage reported MISSED while nothing tested it.
      return bigTotal(q.client) === moneyOf(A, 1250 + 1200)
          && q.client.includes('data-aby-row="aca-extras"')
          && q.client.includes("additional services elected on this quote, at the quantities entered");
    },
  },
  {
    name: "the extras are their OWN row, not folded into the option's figure",
    why: "⭐ #381 again, and this is the direction it would have come back from. The cards print the"
       + " price of an OPTION; these charges are per PRODUCT and identical whichever option wins."
       + " Folding them in would make every card disagree with the total beside it.",
    holds: (A) => {
      const extras = { stateFirst: 1, stateMore: 2 };
      const q = renderQuote(A, [
        { productId: "aca", packageId: "fullLt100", extras },
        { productId: "aca", packageId: "selfLt100", extras },
      ]);
      const rows = [...q.client.matchAll(/data-aby-row="([^"]+)"/g)].map((m) => m[1]);
      const picked = picks(q.client);
      return rows.indexOf("aca") !== -1 && rows.indexOf("aca-extras") !== -1
          // every option radio still carries ONLY its own service price
          && picked.every((p) => p.annual === 1250 || p.annual === 3500);
    },
  },
  {
    name: "the extras row carries no option radio, so the switcher treats it as a constant",
    why: "It is what makes this need no new switching code: `abyRetotal()` reads a row's rendered"
       + " cells when the row has no radio. A radio there would make the charge move with the pick.",
    holds: (A) => {
      const extras = { einLarge: 2 };
      const q = renderQuote(A, [{ productId: "aca", packageId: "fullLt100", extras }]);
      return q.client.indexOf('data-opt-product="aca-extras"') === -1
          && q.client.indexOf('data-aby-row="aca-extras"') !== -1;
    },
  },
  {
    name: "a quote with NO extras answered gains no extras row and no note",
    why: "Eric's condition is *if they enter* the numbers. An unanswered question must add nothing —"
       + " a $0 'additional services' line on every quote is a line about a thing not happening.",
    holds: (A) => {
      const q = renderQuote(A, [{ productId: "aca", packageId: "fullLt100" }]);
      return q.client.indexOf("-extras") === -1
          && q.client.indexOf("additional services elected on this quote") === -1
          && bigTotal(q.client) === moneyOf(A, 3500);
    },
  },
  {
    name: "the switching bundle's SOURCE carries no backtick and no backslash",
    why: "TRAPS #224 and #248. Every entry is a single-quoted string inlined verbatim into a"
       + " downloaded document, so an escape is eaten before it becomes code -- leaving a pattern"
       + " that silently matches nothing."
       + " 🔴🔴 THIS RULE READ THE JOINED BUNDLE ON ITS FIRST DRAFT AND WAS THEREFORE VACUOUS FOR"
       + " THE THING IT EXISTS TO CATCH. Measured: writing /[^0-9.BSs]/ into the source produces"
       + " /[^0-9.s]/ in the joined string -- the backslash is GONE by the time the old rule"
       + " looked, which is the trap itself. The evidence only survives in the SOURCE.",
    holds: (A, edit) => {
      const src = bundleSource(edit);
      return !!src && src.indexOf(BACKTICK) === -1 && src.indexOf(BACKSLASH) === -1;
    },
  },
  {
    name: "the downloaded HTML actually STARTS the option switching",
    why: "⭐⭐ THE ONE THAT MAKES THE FEATURE REAL FOR THE EMPLOYER. The file that reaches an inbox"
       + " loads no app.js: if nothing calls abyWireOptions in that string, the radios are inert"
       + " and the total never moves, in the one place it most needs to. Built, correct and"
       + " unreachable -- TRAPS #93, #275, #284.",
    holds: (A, edit) => {
      let src = readFileSync(join(ROOT, APP), "utf8");
      if (edit) src = edit(APP, src);
      const at = src.indexOf("ABY_COMMIT_JS + ");
      if (at < 0) return false;
      const line = src.slice(at, src.indexOf(LF, at));
      return line.indexOf("abyWireOptions()") !== -1;
    },
  },
  {
    name: "the bundle's abyMoney agrees with utils.money",
    why: "It HAS to be a second implementation -- a downloaded file has no utils.js -- so the only"
       + " defence is comparing them. The last hand-rolled formatter in this repo printed a rate of"
       + " $2.70 as '$2.7' and shipped.",
    holds: (A, edit) => {
      const js = commitBundle(edit);
      if (!js) return false;
      const ctx = { console };
      vm.createContext(ctx);
      vm.runInContext(js + LF + "globalThis.__m = abyMoney;", ctx);
      const cases = [0, 1, 99, 350, 1100, 1536, 3900, 12.5, 4.5, 2.7, 1234567, 0.05];
      return cases.every((n) => ctx.__m(n) === A.utils.money(n));
    },
  },
  {
    name: "the quote log names a two-package ACA quote once, not twice",
    why: "PRODUCT_SHORT maps every ALE package to the one label '1094/1095-C', deliberately --"
       + " Eric, 2026-08-21: 'a lot of the time we quote both full and self so it is hard to say.'"
       + " Two ids, one label, so without a dedupe the log reads '1094/1095-C, 1094/1095-C'.",
    holds: (A, edit) => {
      const fn = workerFn("shortProductName", edit);
      if (!fn) return false;
      const aca = fn({ id: "aca", name: "ACA Reporting", inputs: { packageIds: "fullMid,selfMid" } });
      const pop = fn({ id: "pop", name: "POP", inputs: { packageIds: "docsOnly,popHsa,full" } });
      // embedsName: the package label REPLACES the product name rather than being appended.
      return aca === "1094/1095-C" && pop.indexOf("POP / Cafeteria") === -1 &&
             pop.indexOf("POP Docs Only") === 0;
    },
  },
];

// ── Sabotages: each is a way this could break silently in a real edit ─────────────────────────

const SABOTAGES = [
  { why: "the card limit is dropped, so six ERISA options render as cards",
    edit: (rel, s) => rel.endsWith("renderer.js") ? s.replace("var CARD_LIMIT = 3;", "var CARD_LIMIT = 99;") : s },
  { why: "the radio loses its figures, so the total cannot follow it",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.split("' data-opt-annual=\"' + esc(String(productAnnual(r))) + '\"' +").join("") : s },
  { why: "no option is pre-checked",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("(isDefault ? ' checked' : '')", "''") : s },
  { why: "the recommendation is ignored and lowest-cost comes back",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("if (hasRec) return rec;", "") : s },
  { why: "the total goes back to always taking the cheapest option",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("var wantId = defaultOptionFor(g, form);",
                  "var wantId = g.results.reduce(function (a, b) { return productAnnual(b) < productAnnual(a) ? b : a; }).packageId;") : s },
  // ⛔ SINGLE-LINE ANCHORS ONLY, EVERY ONE OF THEM. The working tree is CRLF (measured: 1,174
  // CRLF pairs and zero bare LF in renderer.js), so an anchor written across a newline matches
  // NOTHING and the sabotage silently changes nothing -- TRAPS #246 and #299. Two of these were
  // written multi-line and reported BROKEN, which is the floor below doing its job.
  { why: "the card prints the setup fee again beside the annual one (the $700 bug)",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("var one = productOneTime(r);",
                  "var one = 0; lines.push({ amount: u.money((r.setupFee||{}).amount || 0), unit: 'one-time setup' });") : s },
  // ⚠️ THIS SABOTAGE IS NOT "the names lose their colon", THOUGH THAT WAS THE ORIGINAL DEFECT.
  // Dropping the colon no longer empties anything, because both layouts fall back to the pricing
  // description -- so a sabotage written that way reported MISSED while the code was RIGHT, and
  // proved only that the fallback works. What has to be provable is that the fallback CHAIN is
  // load-bearing, so the sabotage removes the chain instead.
  { why: "the description fallback chain is cut, so an option can render with no description",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.split("parsed.detail || pkg.description || r.packageLabel || ''").join("''") : s },
  { why: "a refused option is rendered to the employer instead of being dropped",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("if (kept.length && kept.length !== g.results.length) g.results = kept;", "") : s },
  { why: "the stale lowest-cost caveat is put back",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("this total follows the option selected above.", "the lowest-cost option is used for this estimate.") : s },
  { why: "POP stops defaulting to all options",
    edit: (rel, s) => rel.endsWith("products.js")
      ? s.replace("    defaultAll: true,", "    defaultAll: false,") : s },
  { why: "an ACA band names a package id that does not exist",
    edit: (rel, s) => rel.endsWith("products.js")
      ? s.replace("packages: { full: 'fullMid',   self: 'selfMid'   }",
                  "packages: { full: 'fullMiddle', self: 'selfMid'   }") : s },
  { why: "a backslash gets into the switching bundle",
    edit: (rel, s) => rel.endsWith("app.js")
      ? s.replace('.replace(/[^0-9.]/g,"")', '.replace(/[^0-9.' + BACKSLASH + 's]/g,"")') : s },
  { why: "the downloaded file stops wiring the radios, so they are inert in the employer's copy",
    edit: (rel, s) => rel.endsWith("app.js")
      ? s.replace("+ '\\nabyInitSignDate();\\nabyWireOptions();</scr'", "+ '\\nabyInitSignDate();</scr'") : s },
  { why: "abyMoney drops its cents handling",
    edit: (rel, s) => rel.endsWith("app.js")
      ? s.replace("var c=(n*100)%100!==0;", "var c=false;") : s },
  { why: "the extras stop reaching the total",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("t.recurring += extras;", "") : s },
  // ⛔ ONE LINE, NO NEWLINE IN THE REPLACEMENT. Written first as a two-line insert and the shell
  // heredoc turned the escape into a REAL newline inside a string literal, which would not parse
  // (TRAPS #257). The single-statement form needs no escape and cannot be mangled.
  { why: "the extras are folded into the option's own figure, so cards disagree with the total",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("if (r.annualFee != null) total += r.annualFee.amount;",
                  "if (r.annualFee != null) total += r.annualFee.amount; total += r.extrasTotal || 0;") : s },
  { why: "an empty extras line is emitted on every quote",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("if (extras > 0) {", "if (extras >= 0) {") : s },
  { why: "the note stops saying the elected charges are included",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("if (t.hasExtras) notes.push(", "if (false) notes.push(") : s },
  { why: "the quote-log label stops deduping",
    edit: (rel, s) => rel.endsWith("worker.js")
      ? s.replace("if (seen.indexOf(t) === -1) seen.push(t);", "seen.push(t);") : s },
  { why: "the exclusion restore is dropped, so Self Service never comes back",
    edit: (rel, s) => rel.endsWith("app.js")
      ? s.replace("svcCb.checked = svcCb.dataset.userSet === '1';", "") : s },
  { why: "the re-run stops recording the saved state as the broker's intent",
    edit: (rel, s) => rel.endsWith("app.js")
      ? s.replace("fullOnlyEl.dataset.userSet = fullOnlyEl.checked ? '1' : '0';", "") : s },
  { why: "the ACA band default goes back to the band with no service levels",
    edit: (rel, s) => rel.endsWith("products.js")
      ? s.replace("defaultBand: 'lt100',", "defaultBand: 'smallB',") : s },
  { why: "a one-option quote stops naming its package",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("? namedPackageLine(group.results[0], meta) + renderPricingCards(group.results[0], meta)",
                  "? renderPricingCards(group.results[0], meta)") : s },
  // ⚠️ BOTH GUARDS, NOT ONE. Removing only the first reported MISSED, because the second one
  // ("no parsed name") catches a tiered product anyway -- so the sabotage proved the belt while
  // the braces held. A sabotage has to defeat every guard on the path, or it certifies nothing.
  { why: "the package name leaks onto TIERED products, which have none",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("if (!meta.packages || !result.packageId) return '';", "")
         .replace("if (!parsed.name) return '';", "parsed.name = parsed.name || 'Plan';") : s },
];

// ── Run ──────────────────────────────────────────────────────────────────────────────────────

let A;
try { A = build(null); }
catch (e) {
  console.log("COULD NOT RENDER AT ALL: " + e.message);
  console.log("That is a FAILURE, not a pass -- every rule below is 'does the page contain X'.");
  process.exit(2);
}

// A FLOOR (TRAPS #360). Every rule reads rendered markup, and an empty string satisfies most of
// the negative ones for free. If the fixture stops producing option radios, the checker has gone
// blind and must say so rather than tick fifteen rules against nothing.
const floorPicks = picks(renderQuote(A, [...popAll(), ...erisaAll()]).client);
if (floorPicks.length !== 9) {
  console.log("FIXTURE FAILURE: expected 9 option radios from POP(3) + ERISA(6), got " + floorPicks.length);
  console.log("A fixture that produces nothing to test is a fixture failure, never a pass.");
  process.exit(2);
}

let bad = 0;
console.log("check_options_grid: several options on one quote, and a total that follows the pick");
console.log("");
for (const r of RULES) {
  let held = false;
  try { held = !!r.holds(A, null); } catch (e) { held = false; }
  if (!held) { bad++; console.log("  FAIL " + r.name); console.log("       " + r.why); }
  else console.log("  ok   " + r.name);
}

if (SELF_TEST) {
  console.log("");
  console.log("self-test: each sabotage must redden at least one rule");
  let broken = 0;
  for (const s of SABOTAGES) {
    let caught = false;
    let mutated = false;
    // TRAPS #361: assert the sabotage LANDED. A replace() that matched nothing changes nothing,
    // every rule stays green, and the sabotage reports itself as "not caught" for the wrong
    // reason -- or worse, an inverse case passes automatically.
    for (const rel of [...RENDER_FILES, APP, WORKER]) {
      const before = readFileSync(join(ROOT, rel), "utf8");
      if (s.edit(rel, before) !== before) mutated = true;
    }
    if (!mutated) {
      broken++;
      console.log("  BROKEN " + s.why);
      console.log("         its edit matched NOTHING -- the anchor has rotted, so this tests nothing");
      continue;
    }
    let B = null;
    try { B = build(s.edit); } catch (e) { caught = true; }   // refusing to load is a red result
    if (!caught && B) {
      for (const r of RULES) {
        let held = false;
        // EVERY rule takes the sabotage, including the ones that read app.js or worker.js
        // rather than the rendered six. They used to be routed through a name-matching
        // dispatcher that silently skipped any rule whose title it did not recognise -- so two
        // new rules were reported MISSED while the code was correctly guarded.
        try { held = !!r.holds(B, s.edit); } catch (e) { held = false; }
        if (!held) { caught = true; break; }
      }
    }
    console.log("  " + (caught ? "ok    " : "MISSED") + " " + s.why);
    if (!caught) bad++;
  }
  if (broken) bad += broken;
}

console.log("");
if (bad) { console.log(bad + " problem(s)."); process.exit(1); }
console.log("Options render, one is pre-checked, and the Estimated Annual Total follows it.");
console.log("  This checks the RENDERED page and the REAL downloaded bundle. It cannot check that");
console.log("  the prices themselves are right -- that is pricing.js and ABY's rate sheet.");
