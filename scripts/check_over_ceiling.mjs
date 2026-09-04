// ABOVE THE PUBLISHED PRICING TIERS: NO QUOTE IS CREATED, AND THE BROKER IS SENT TO ABY.
//
// Eric, 2026-09-04, correcting a first attempt that put the message on the employer's document:
//   "I don't want it to show up on the quote that it's above the published pricing tier, i want it
//    to show up for the broker when they try to quote a group above the published pricing tier. It
//    shouldn't create the quote at all - it should direct them to us. What I want is for ABY to
//    actually be able to quote it by entering a setup fee and monthly fee. So ... there should be
//    no employer facing text - it should be broker facing text."
//
// WHY THIS NEEDS A CHECKER. Two audiences, one code path, and the difference between them is a
// single flag. Both failure directions are silent:
//   * the refusal not firing -- a broker builds and SENDS a quote for a group ABY has not priced.
//     Measured before the fix: FSA at 250 lives printed $1,062.50 a month, which is the top tier's
//     rate times 250 and A PRICE ABY NEVER SET, with an annual total of $125 that omitted it.
//   * the refusal firing for ABY after they have typed a price -- which is the whole thing Eric
//     asked for, and it would look like the feature simply not working.
//
// ⛔ AND A THIRD, WHICH IS THE ONE HE CORRECTED: nothing about ABY's internal rate ladder may
// reach the employer. The refusal is rendered into the TOOL, never into a document.
//
// IT RUNS THE REAL applySetPrice, SLICED OUT OF worker.js -- a copy here would agree with itself
// while the admin tool did something else, and the defect that blocked all of this was INSIDE it.
//
//   node scripts/check_over_ceiling.mjs
//   node scripts/check_over_ceiling.mjs --self-test

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");
const LF = String.fromCharCode(10);

const RENDER_FILES = [
  "public/assets/js/data/products.js",
  "public/assets/js/data/pricing.js",
  "public/assets/js/data/language.js",
  // ⚠️ reps.js IS LOADED BECAUSE THE BROKER NOTICE READS ITS CONTACTS FROM IT. Left out of this
  // list at first, so `ABYQuote.salesReps` was undefined, the notice rendered with NO contact
  // block, and both contact rules failed. They were right and the fixture was wrong -- which is
  // the good direction for that to happen in.
  "public/assets/js/data/reps.js",
  "public/assets/js/lib/utils.js",
  "public/assets/js/lib/engine.js",
  "public/assets/js/lib/renderer.js",
];
const WORKER = "worker.js";

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

// The REAL applySetPrice, run for real.
function setPriceFn(A, edit) {
  let w = readFileSync(join(ROOT, WORKER), "utf8");
  if (edit) w = edit(WORKER, w);
  const at = w.indexOf(LF + "  function applySetPrice(");
  if (at < 0) return null;
  let i = w.indexOf("{", at), depth = 0, end = -1;
  for (let j = i; j < w.length; j++) {
    if (w[j] === "{") depth++;
    else if (w[j] === "}") { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) return null;
  const fieldsAt = w.indexOf("var SET_FIELDS");
  if (fieldsAt < 0) return null;
  const fields = w.slice(fieldsAt, w.indexOf(";", fieldsAt) + 1);
  const ctx = { console, money: A.utils.money, rateMoney: A.utils.moneyExact };
  vm.createContext(ctx);
  try {
    vm.runInContext(fields + LF + w.slice(at, end) + LF + "globalThis.__set = applySetPrice;", ctx);
    return ctx.__set;
  } catch (e) { return null; }
}

function appSource(edit) {
  let src = readFileSync(join(ROOT, "public/assets/js/app.js"), "utf8");
  if (edit) src = edit("public/assets/js/app.js", src);
  return src;
}

// THE BROKER NOTICE, SLICED OUT OF app.js AND RUN FOR REAL.
//
// ⭐ Its two rules used to GREP the source for the strings they wanted. That passes on a function
// that contains the right words and emits the wrong markup, and it could not see ORDER at all --
// which is the thing Eric actually asked for. Running it reads what a broker is handed.
// ⛔ It needs only three globals: the product registry, the escaper, and ABY_INTERNAL. Anything
// more and this would be re-implementing app.js rather than testing it.
function noticeFn(A, edit, internal) {
  let src = appSource(edit);
  const at = src.indexOf("function renderOverCeilingNotice(");
  if (at < 0) return null;
  let i = src.indexOf("{", at), depth = 0, end = -1;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) return null;
  const ctx = { console };
  ctx.window = ctx;
  ctx.ABYQuote = A;
  ctx.ABY_INTERNAL = !!internal;
  vm.createContext(ctx);
  try {
    vm.runInContext(src.slice(at, end) + LF + "globalThis.__n = renderOverCeilingNotice;", ctx);
    return ctx.__n;
  } catch (e) { return null; }
}

const FORM = { clientName: "Fixture Big Group", brokerAgency: "Fixture", recommendedPackages: {} };

// FSA's ladder is <=19 flat, <=99 pppm, <=200 pppm. 250 is off the end of it.
const OVER = 250;
const overCeiling = (A) => A.engine.calculateAll([{ productId: "fsa", count: OVER }], true, "TX");
const client = (A, r) => A.renderer.renderForClient(FORM, r, "TX270101-0001-C", {});
const internal = (A, r) => A.renderer.renderInternal(FORM, r, "TX270101-0001-C", {});
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const totalOf = (h) => (/Estimated Annual Total\s*(\$[\d,]+)/.exec(text(h)) || [])[1];

const RULES = [
  {
    name: "FIXTURE: the fixture group really is over the ceiling",
    why: "A FLOOR (TRAPS #360). Every rule below is about the over-ceiling branch. If the ladder is"
       + " ever extended past 250 this fixture stops exercising it, and every rule passes against"
       + " nothing while reporting itself green.",
    holds: (A) => {
      const m = overCeiling(A)[0].monthlyFee;
      return !!m && m.tierExceeded === true;
    },
  },
  {
    name: "generateQuote REFUSES rather than building a document",
    why: "\u1F534 THE WHOLE INSTRUCTION: *\"It shouldn't create the quote at all\"*. The guard sits in"
       + " generateQuote BEFORE a quote number is minted -- which is also the only place that stops"
       + " the download, PDF, save and share paths without each needing a guard of its own. A guard"
       + " in the renderer would have let all four through.",
    // ⚠️ THIS RULE FIRST TESTED ONLY THAT THE CODE WAS PRESENT, and two sabotages walked straight
    // past it: `if (false)` leaves every string it looked for exactly where it was.
    // ⭐ **PRESENCE IS NOT REACHABILITY.** It now slices the region between the detection and the
    // quote number, and requires a live test, the notice, AND the return that stops the build.
    holds: (A, edit) => {
      const app = appSource(edit);
      const at = app.indexOf("var overCeiling = results.filter(function (r) {");
      const mint = app.indexOf("var quoteNumber = resolveQuoteNumber(");
      if (at === -1 || mint === -1 || at > mint) return false;
      const guard = app.slice(at, mint);
      return guard.indexOf("return r.monthlyFee && r.monthlyFee.tierExceeded;") !== -1
          && guard.indexOf("if (overCeiling.length) {") !== -1
          && guard.indexOf("outputEl.innerHTML = renderOverCeilingNotice(overCeiling);") !== -1
          && guard.indexOf("return;") !== -1;
    },
  },
  {
    name: "NOTHING about the pricing ceiling can reach a client document",
    why: "\u1F534\u1F534 THE CORRECTION ERIC MADE, and the reason this rule reads the whole rendered"
       + " page rather than one element. A first version printed a Contact ABY card and a totals"
       + " note on the EMPLOYER's document -- telling them about ABY's internal rate ladder and"
       + " still producing a sendable quote for a group nobody had priced.",
    holds: (A) => {
      const h = client(A, overCeiling(A));
      const t = text(h);
      return !/published pricing tiers/i.test(t)
          && !/exceeds defined tiers/i.test(t)
          && !/Contact ABY/i.test(t)
          && !/quoted individually/i.test(t);
    },
  },
  {
    name: "the refusal is styled in app.css and NOT in quote.css",
    why: "\u26A0 quote.css is the stylesheet inlined into a DOWNLOADED quote, so anything defined"
       + " there travels to the employer. Putting a broker-only notice's styling in it would leak"
       + " the class into every client file -- invisible, but it is the wrong side of the line.",
    // ⚠️ IT TAKES THE EDIT. Written without it first, so its own sabotage — which appends the class
    // to quote.css — never reached it and reported MISSED. Same routing fault this session has now
    // produced three times: a rule that reads a file outside the rendered set must be handed the
    // sabotage, or it silently tests the pristine tree.
    holds: (A, edit) => {
      const read = (p) => {
        let src = readFileSync(join(ROOT, p), "utf8");
        if (edit) src = edit(p, src);
        return src;
      };
      return read("public/assets/css/app.css").indexOf(".over-ceiling-notice") !== -1
          && read("public/assets/css/quote.css").indexOf("over-ceiling") === -1;
    },
  },
  {
    name: "the notice names the product AND the count",
    why: "A refusal that does not say what to change is a dead end. On a multi-product quote the"
       + " broker cannot otherwise tell which line stopped it, and the count is what they would"
       + " have to check with the employer."
       + " ⚠️ ASSERTED ON THE RENDERED MARKUP, not on the source -- an earlier version grepped for"
       + " the variable names, which passes on a function that emits nothing.",
    holds: (A, edit) => {
      const render = noticeFn(A, edit, false);
      if (!render) return false;
      const html = render(overCeiling(A));
      return html.indexOf("FSA / DCAP / LFSA") !== -1
          && html.indexOf("250") !== -1
          && html.indexOf("participants") !== -1;
    },
  },
  {
    name: "a BROKER gets ABY's contacts, NIELS FIRST, and ABY does not",
    why: "⭐ ERIC, 2026-09-04: *\"can you put Niels' name on top and mine below?\"* — asserted by"
       + " POSITION in the rendered markup, which is the only way to test an order."
       + " ⭐ And the two audiences get different things because they can do different things: a"
       + " broker can only call ABY, ABY can fix it on the same screen. Handing ABY a phone number"
       + " they own, or a broker an instruction about a Set mode they cannot see, is a dead end.",
    holds: (A, edit) => {
      const asBroker = noticeFn(A, edit, false);
      const asAby = noticeFn(A, edit, true);
      if (!asBroker || !asAby) return false;
      const b = asBroker(overCeiling(A));
      const n = b.indexOf("Niels Christiansen");
      const e = b.indexOf("Eric Johnson");
      return n !== -1 && e !== -1 && n < e
          && b.indexOf("Set mode") === -1
          && asAby(overCeiling(A)).indexOf("Set mode") !== -1
          && asAby(overCeiling(A)).indexOf("abybenefits.com") === -1;
    },
  },
  {
    name: "the contact numbers come from reps.js, not from a copy in app.js",
    why: "⛔ A SECOND COPY OF A PHONE NUMBER IS ONE THAT GOES STALE SILENTLY. They were typed into"
       + " the notice on the first pass; changing one in `reps.js` would have left brokers being"
       + " handed the old one with nothing going red."
       + " ⚠️ The ORDER is expressed as ids rather than by reordering `reps.js`, because that array"
       + " also drives the rep picker and reordering it would change a quote's default rep.",
    holds: (A, edit) => {
      const app = appSource(edit);
      const reps = readFileSync(join(ROOT, "public/assets/js/data/reps.js"), "utf8");
      const render = noticeFn(A, edit, false);
      const html = render ? render(overCeiling(A)) : "";
      // every number the notice prints must be one reps.js declares
      const numbers = (html.match(/\(\d{3}\) \d{3}-\d{4}/g) || []);
      return numbers.length >= 2
          && numbers.every((p) => reps.indexOf(p) !== -1)
          && app.indexOf("ABYQuote.salesReps") !== -1
          && app.indexOf("(817) 366-7536") === -1;
    },
  },
  {
    name: "ABY typing a PER-PARTICIPANT rate actually prices the group",
    why: "\u1F534\u1F534 THE DEFECT THAT BLOCKED ERIC'S ASK, and it was not the flag."
       + " applySetPrice's per-participant branch is guarded on monthlyFee._m, which carries the"
       + " count -- and the over-ceiling return was the ONE return in computeMonthly that did not"
       + " attach it. The box did nothing, and said nothing, for the only groups it exists for.",
    holds: (A, edit) => {
      const set = setPriceFn(A, edit);
      if (!set) return false;
      const priced = set(overCeiling(A), { mode: "set", scope: "all", prices: { monthlyRate: 3.90 } });
      const m = priced[0].monthlyFee;
      return !!m && m.amount === 3.90 * OVER && /agreed rate/.test(m.breakdown || "");
    },
  },
  {
    name: "ABY typing a SETUP FEE AND A MONTHLY FEE prices it too",
    why: "\u2B50 ERIC'S OWN WORDS FOR WHAT HE WANTS TO TYPE: *\"by entering a setup fee and monthly"
       + " fee\"*. The per-participant box is the better instrument for a big group -- a typed RATE"
       + " survives a headcount change and a typed TOTAL does not -- but he asked for both, and"
       + " both must clear the ceiling.",
    holds: (A, edit) => {
      const set = setPriceFn(A, edit);
      const priced = set(overCeiling(A), {
        mode: "set", scope: "all", prices: { setupFee: 750, monthlyFee: 1400 },
      });
      const m = priced[0].monthlyFee;
      return m.tierExceeded === false && m.amount === 1400
          && priced[0].setupFee.amount === 750;
    },
  },
  {
    name: "an ABY-priced group BUILDS a quote -- the refusal does not fire",
    why: "The point of the whole request. One test serves both audiences because the ABY overlay"
       + " patches calculateAll and runs applySetPrice INSIDE it, so a priced group reaches the"
       + " guard with the flag already cleared.",
    holds: (A, edit) => {
      const set = setPriceFn(A, edit);
      const priced = set(overCeiling(A), { mode: "set", scope: "all", prices: { monthlyRate: 3.90 } });
      return priced.filter((r) => r.monthlyFee && r.monthlyFee.tierExceeded).length === 0;
    },
  },
  {
    name: "an ABY-priced group's monthly reaches the annual total",
    why: "\u2B50 THE NUMBER THE BROKER IS SENT. $3.90 x 250 = $975 a month, x 12 = $11,700, plus the"
       + " $125 renewal = $11,825. The same quote used to total $125.",
    holds: (A, edit) => {
      const set = setPriceFn(A, edit);
      const priced = set(overCeiling(A), { mode: "set", scope: "all", prices: { monthlyRate: 3.90 } });
      return totalOf(client(A, priced)) === A.utils.money(3.90 * OVER * 12 + 125);
    },
  },
  {
    name: "the stale over-ceiling warning is dropped with the flag",
    why: "\u26A0 THIS RULE FIRST TESTED THE WRONG STRING AND ITS SABOTAGE REPORTED MISSED. It looked"
       + " for the RED wording, which only renders while tierExceeded is true -- and clearing that"
       + " flag is exactly what this path does, so the red text was gone either way. The real"
       + " guarantee is that the warning TEXT leaves r.warnings, or a priced quote keeps an internal"
       + " note calling itself unpriced, quietly demoted to a grey bullet nobody questions.",
    holds: (A, edit) => {
      const set = setPriceFn(A, edit);
      const priced = set(overCeiling(A), { mode: "set", scope: "all", prices: { monthlyRate: 3.90 } });
      return !/exceeds the highest defined pricing tier/.test(internal(A, priced))
          && /exceeds the highest defined pricing tier/.test(internal(A, overCeiling(A)));
    },
  },
  {
    name: "a setup fee ALONE does not clear the ceiling",
    why: "\u26D4 THE DIRECTION THAT WOULD PUBLISH AN UNPRICED MONTHLY. A setup fee says nothing about"
       + " monthly administration, which is the figure the ceiling is about. Clearing on any edit at"
       + " all would let an agreed setup fee carry a computed monthly onto a sendable quote."
       + " \u26A0 Note this is NARROWER than the rule above it, which requires setup AND monthly.",
    holds: (A, edit) => {
      const set = setPriceFn(A, edit);
      const priced = set(overCeiling(A), { mode: "set", scope: "all", prices: { setupFee: 500 } });
      return priced[0].monthlyFee.tierExceeded === true;
    },
  },
  {
    name: "a group INSIDE the ladder is untouched by all of this",
    why: "The other direction, and it is most of the book. A 50-life FSA group must build exactly as"
       + " it always has, with its monthly in the total.",
    holds: (A) => {
      const r = A.engine.calculateAll([{ productId: "fsa", count: 50 }], true, "TX");
      return !r[0].monthlyFee.tierExceeded
          && totalOf(client(A, r)) === A.utils.money(4.5 * 50 * 12 + 125);
    },
  },
  {
    name: "the priced group can still be SHARED -- nothing new blocks the link",
    why: "\u2B50 *\"send the broker the quote link\"* is the point of the request. quoteShareBlockReason"
       + " blocks an ADJUSTED quote only when there is no stored resolved_pricing -- and a Set-mode"
       + " price IS an adjustment. What makes it shareable is that the priced results are captured"
       + " and saved, so the employer's page renders the AGREED figures rather than recomputing.",
    holds: () => {
      const w = readFileSync(join(ROOT, WORKER), "utf8");
      const app = readFileSync(join(ROOT, "public/assets/js/app.js"), "utf8");
      const hook = readFileSync(join(ROOT, "public/save-hook.js"), "utf8");
      return app.indexOf("window.__abyResolvedPricing = JSON.parse(JSON.stringify(results));") !== -1
          && hook.indexOf("resolvedPricing: window.__abyResolvedPricing") !== -1
          && w.indexOf("UPDATE quotes SET resolved_pricing = ? WHERE id = ?") !== -1
          && w.indexOf("if (resolved) return null;") !== -1;
    },
  },
];

const SABOTAGES = [
  { why: "the over-ceiling branch stops carrying the count, so a typed rate does nothing again",
    edit: (rel, s) => rel.endsWith("engine.js")
      ? s.replace("        lo: (lastTier.maxCount || 0) + 1,",
                  "        count: null, lo: (lastTier.maxCount || 0) + 1,") : s },
  { why: "the refusal is removed, so an unpriced big group builds a sendable quote again",
    edit: (rel, s) => rel.endsWith("app.js")
      ? s.replace("    if (overCeiling.length) {", "    if (false) {") : s },
  // ⚠️ THE DETECTION, NOT THE RESPONSE. Written first as "move the guard after the quote number",
  // which inserted a line BEFORE the filter and therefore moved nothing — it reported MISSED for
  // being a no-op, not for being uncaught. Breaking the test itself is the real regression.
  { why: "the detection stops looking at the flag, so no group is ever recognised as over-ceiling",
    edit: (rel, s) => rel.endsWith("app.js")
      ? s.replace("return r.monthlyFee && r.monthlyFee.tierExceeded;", "return false;") : s },
  { why: "the contact order flips back, putting Eric above Niels",
    edit: (rel, s) => rel.endsWith("app.js")
      ? s.replace("var CONTACT_ORDER = ['niels', 'eric'];",
                  "var CONTACT_ORDER = ['eric', 'niels'];") : s },
  { why: "a phone number is typed into the notice instead of read from reps.js",
    edit: (rel, s) => rel.endsWith("app.js")
      ? s.replace("var reps = ABYQuote.salesReps || [];",
                  "var reps = [{ id: 'eric', name: 'Eric Johnson', phone: '(817) 366-7536', email: 'x@y.z' }];") : s },
  { why: "the notice stops distinguishing ABY from a broker",
    edit: (rel, s) => rel.endsWith("app.js")
      ? s.replace("var internal = !!window.ABY_INTERNAL;", "var internal = false;") : s },
  { why: "a typed price no longer clears the ceiling, so ABY can never quote a big group",
    edit: (rel, s) => rel.endsWith("worker.js")
      ? s.replace("copy.monthlyFee.tierExceeded = false;", "") : s },
  { why: "the stale warning is left behind on a priced quote",
    edit: (rel, s) => rel.endsWith("worker.js")
      ? s.replace("return String(w).indexOf('exceeds the highest defined pricing tier') === -1;",
                  "return true;") : s },
  { why: "ANY set field clears the ceiling, so a setup fee alone publishes an unpriced monthly",
    edit: (rel, s) => rel.endsWith("worker.js")
      ? s.replace("var pricedMonthly = (p.monthlyFee != null && !isNaN(p.monthlyFee))",
                  "var pricedMonthly = true || (p.monthlyFee != null && !isNaN(p.monthlyFee))") : s },
  { why: "the client backstop is removed, so a stored over-ceiling quote leaks the invented number",
    edit: (rel, s) => rel.endsWith("renderer.js")
      ? s.replace("if (result.monthlyFee && result.monthlyFee.tierExceeded) {",
                  "if (false) {") : s },
  { why: "the ceiling notice's styling moves into the client stylesheet",
    edit: (rel, s) => rel.endsWith("quote.css")
      ? s + String.fromCharCode(10) + ".over-ceiling-notice { color: red; }" : s },
];

let A;
try { A = build(null); }
catch (e) { console.log("COULD NOT RENDER AT ALL: " + e.message); process.exit(2); }

if (!setPriceFn(A, null)) {
  console.log("COULD NOT SLICE applySetPrice OUT OF worker.js -- that is a FAILURE, not a pass.");
  console.log("Every ABY-side rule below is 'does this function do X', and a missing function");
  console.log("makes all of them vacuous.");
  process.exit(2);
}

let bad = 0;
console.log("check_over_ceiling: no quote above the ceiling, and ABY can price one");
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
  for (const s of SABOTAGES) {
    let mutated = false;
    for (const rel of [...RENDER_FILES, WORKER, "public/assets/js/app.js",
                      "public/assets/css/app.css", "public/assets/css/quote.css",
                      "public/save-hook.js"]) {
      const before = readFileSync(join(ROOT, rel), "utf8");
      if (s.edit(rel, before) !== before) mutated = true;
    }
    if (!mutated) {
      bad++;
      console.log("  BROKEN " + s.why);
      console.log("         its edit matched NOTHING -- the anchor has rotted, so this tests nothing");
      continue;
    }
    let caught = false;
    let B = null;
    try { B = build(s.edit); } catch (e) { caught = true; }
    if (!caught && B) {
      for (const r of RULES) {
        let held = false;
        try { held = !!r.holds(B, s.edit); } catch (e) { held = false; }
        if (!held) { caught = true; break; }
      }
    }
    console.log("  " + (caught ? "ok    " : "MISSED") + " " + s.why);
    if (!caught) bad++;
  }
}

console.log("");
if (bad) { console.log(bad + " problem(s)."); process.exit(1); }
console.log("Above the ceiling: no quote is built, the broker is sent to ABY, and an ABY price builds one.");
console.log("  ⚠️ It cannot check that the RATE ABY types is the right one -- that is ABY's call,");
console.log("     and the whole point is that the tool does not know it.");
