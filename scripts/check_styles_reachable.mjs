// A STYLE RULE MUST LIVE IN A STYLESHEET THE BROWSER LOADS.
//
// 🔴 WRITTEN 2026-09-04 AFTER FINDING NINE DAYS OF UNSTYLED MARKUP ON A CLIENT DOCUMENT (F-485).
// The multi-EIN work of 2026-08-26 wrote its styles into the repo-ROOT `quote.css`, which nothing
// loads -- `wrangler.jsonc` points `assets.directory` at `public/`. Measured on the live site:
// **zero occurrences of `.product-extras`, `.extra-num`, `.elected-row`, `.elected-qty` and
// `.elected-total` in either served stylesheet, while `app.js` and `renderer.js` emitted all of
// them.** The EIN questions on the broker's form, and the editable quantity rows on the
// AUTHORIZATION PAGE AN EMPLOYER SIGNS, rendered as bare inputs from the day they shipped.
// ⛔ Nothing could report it: a className matching no rule is not a build error, not a runtime
// error, and invisible to every gate in this repo (#91, #195, #308).
//
// ⭐⭐ WHAT THIS CHECKS, AND WHY IT IS NARROWER THAN THE OBVIOUS RULE.
// The first draft asserted "every emitted class has a CSS rule". **Its first run produced NINE
// findings and every one was a false positive** (#24, #318): form controls left to browser
// defaults (`.opt-tier-select`, `.opt-check`, `.emp-count-input`), plain wrappers whose children
// carry the styling (`.opt-card-body`), elements styled INLINE via `style.cssText`
// (`.product-package-multi`, `.req-mark`), and a class defined in the downloaded document's own
// `<style>` block (`.wrap`). **A rule with nine exceptions is not a rule, it is a habit** -- and an
// allow-list that long is where the next real defect would hide.
//
// So it asserts the two things that ARE unambiguous:
//   ① NO CSS FILE OUTSIDE THE SERVED DIRECTORY may define a class the code emits. That is the
//     defect exactly: the rule existed, in a file the browser never sees.
//   ② The classes that WERE lost are present in the right served sheet -- a regression pin, with
//     the broker-form and client-document halves kept apart on purpose.
//
//   node scripts/check_styles_reachable.mjs
//   node scripts/check_styles_reachable.mjs --self-test

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");
const LF = String.fromCharCode(10);

const SERVED_CSS_DIR = "public/assets/css";
const APP_CSS = SERVED_CSS_DIR + "/app.css";      // the tool's chrome; broker-facing only
const QUOTE_CSS = SERVED_CSS_DIR + "/quote.css";  // inlined into a downloaded quote; reaches the employer
const EMITTERS = ["public/assets/js/app.js", "public/assets/js/lib/renderer.js"];

const SKIP_DIRS = new Set(["node_modules", ".git", "docs"]);

function read(rel, edit) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  let s = readFileSync(p, "utf8");
  if (edit) s = edit(rel, s);
  return s;
}

// Every .css in the repo, so a stylesheet that is not served can be found rather than assumed absent.
function allCss(dir = ROOT, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) allCss(full, out);
    else if (name.endsWith(".css")) out.push(relative(ROOT, full).split("\\").join("/"));
  }
  return out;
}

function emittedClasses(edit) {
  const found = new Set();
  for (const rel of EMITTERS) {
    const src = read(rel, edit);
    if (src === null) continue;
    const re = /class(?:Name)?\s*=\s*["'`]([^"'`${}]+)["'`]/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      for (const c of m[1].trim().split(/\s+/)) {
        // ⚠️ A trailing hyphen means the class is ASSEMBLED at runtime ('cols-' + n). It is not a
        // class, it is a fragment, and treating it as one is how the first draft reported `.cols-`.
        if (c && !c.endsWith("-")) found.add(c);
      }
    }
  }
  return found;
}

// The classes lost in the original defect, and which SERVED sheet each must be in.
// ⛔ THE SPLIT IS LOAD-BEARING, not tidiness: quote.css is inlined into a downloaded quote, so a
// broker-form style placed there travels to the employer, and a client-document style placed in
// app.css never reaches them at all.
const MUST_BE_IN = {
  "product-extras": APP_CSS,
  "extras-note": APP_CSS,
  "extra-num": APP_CSS,
  "extra-check": APP_CSS,
  "elected-extras": QUOTE_CSS,
  "elected-row": QUOTE_CSS,
  "elected-qty": QUOTE_CSS,
  "elected-total": QUOTE_CSS,
};

function run(edit) {
  const fails = [];
  const emitted = emittedClasses(edit);
  const sheets = allCss();

  // FLOORS (#360): a broken scan must fail, never pass on an empty set.
  if (emitted.size < 50) return { fatal: `only ${emitted.size} classes found in the emitters -- the scan is broken, not the code` };
  if (!sheets.includes(APP_CSS) || !sheets.includes(QUOTE_CSS)) {
    return { fatal: "the served stylesheets were not found -- nothing was checked" };
  }

  // ① A stylesheet the browser never loads must not define classes the code emits.
  const unserved = sheets.filter((s) => !s.startsWith(SERVED_CSS_DIR + "/"));
  for (const rel of unserved) {
    const css = read(rel, edit);
    if (css === null) continue;
    const defined = new Set();
    const re = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g;
    let m;
    while ((m = re.exec(css)) !== null) if (emitted.has(m[1])) defined.add(m[1]);
    if (defined.size) {
      fails.push(`${rel} is NOT served (assets.directory is "public") yet defines ${defined.size} class(es) the ` +
                 `code emits, e.g. .${[...defined].slice(0, 3).join(", .")} -- editing it changes nothing on the site`);
    }
  }

  // ② The recovered rules are present, in the correct served sheet.
  //
  // 🔴 COMMENTS ARE STRIPPED FIRST, AND THIS RULE WAS VACUOUS WITHOUT IT (TRAPS #94). The
  // recovery comment in quote.css names `.elected-row`, `.elected-qty` and `.elected-total` in
  // prose, explaining that they had gone missing -- so the check for those very classes passed on
  // the sentence describing their absence. Its own sabotage reported MISSED, which is the only
  // reason it was found. **A checker satisfied by the comment explaining it checks nothing.**
  const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const [cls, want] of Object.entries(MUST_BE_IN)) {
    const css = stripComments(read(want, edit) || "");
    if (!new RegExp("\\." + cls + "\\b").test(css)) {
      fails.push(`.${cls} has no rule in ${want} -- it is emitted, so it renders unstyled`);
    }
  }
  return { fails, counts: { emitted: emitted.size, sheets: sheets.length, unserved: unserved.length } };
}

const real = run(null);
if (real.fatal) {
  console.error(LF + "X styles reachable: " + real.fatal + LF);
  process.exit(2);
}

console.log("check_styles_reachable: rules live where the browser can load them");
console.log(`  ${real.counts.emitted} classes emitted, ${real.counts.sheets} stylesheet(s) in the repo, ` +
            `${real.counts.unserved} of them not served`);
let bad = real.fails.length;
for (const f of real.fails) console.log("  FAIL " + f);
if (!real.fails.length) {
  console.log("  ok   no unserved stylesheet defines a class the code emits");
  console.log("  ok   all 8 recovered rules are in the correct served sheet");
}

if (SELF_TEST) {
  console.log("");
  console.log("self-test: each sabotage must produce at least one failure");
  const SABOTAGES = [
    { why: "the client-document rules go missing again (the F-485 defect itself)",
      edit: (rel, s) => rel.endsWith("css/quote.css")
        ? s.split(".aby-proposal .elected-row").join(".aby-proposal .GONE-elected-row") : s },
    { why: "the broker-form rules go missing",
      edit: (rel, s) => rel.endsWith("css/app.css")
        ? s.split(".product-extras").join(".GONE-product-extras") : s },
    // ⚠️ The anchor is the FULL selector as written. A shorter guess, `.aby-proposal .elected-qty`,
    // matched nothing -- the rule is nested as `.elected-row .elected-qty` -- and the floor
    // reported it BROKEN rather than letting it pass as caught (#243, #361).
    { why: "the quantity input's rule is renamed, so the employer's row loses its styling",
      edit: (rel, s) => rel.endsWith("css/quote.css")
        ? s.split(".aby-proposal .elected-row .elected-qty").join(".aby-proposal .elected-row .GONE-qty") : s },
  ];
  let missed = 0, broken = 0;
  for (const s of SABOTAGES) {
    let mutated = false;
    for (const rel of [APP_CSS, QUOTE_CSS, ...EMITTERS]) {
      const before = read(rel, null);
      if (before !== null && s.edit(rel, before) !== before) mutated = true;
    }
    if (!mutated) {
      broken++;
      console.log("  BROKEN " + s.why);
      console.log("         its edit matched NOTHING -- the anchor has rotted, so this tests nothing");
      continue;
    }
    const r = run(s.edit);
    const caught = !!r.fatal || r.fails.length > 0;
    console.log("  " + (caught ? "ok    " : "MISSED") + " " + s.why);
    if (!caught) missed++;
  }
  bad += missed + broken;
  if (!missed && !broken) console.log(`${LF}[OK] ${SABOTAGES.length}/${SABOTAGES.length} sabotages caught, 0 broken.`);
}

console.log("");
if (bad) { console.log(bad + " problem(s)."); process.exit(1); }
console.log("No style rule is stranded in a file the browser never loads.");
console.log("  ⚠️ It does NOT assert that every emitted class has a rule -- that premise produced");
console.log("     nine false positives on its first run, all legitimate: browser-default form");
console.log("     controls, bare wrappers, inline styles, and the download's own <style> block.");
