// What does the admin actually PUT ON THE PAGE?
//
// WHY THIS IS A SEPARATE CHECKER FROM THE OTHER TWO, AND IT IS THE GAP BETWEEN THEM.
//   check_worker_pages.mjs asks: does this page emit valid HTML and parseable JS?
//   check_reachable.mjs  asks: does worker.js CONTAIN the affordance?
// Neither reads the HTML that comes out. A rule matching a string in the source is satisfied by
// that string sitting in a comment, in dead code, or in a branch no request takes -- which is how
// three endpoints in one day were built, tested, deployed and unreachable, and how a checker that
// re-implements a read agrees with itself perfectly while the product is broken.
//
// So this one CALLS the page functions and asserts on the OUTPUT. It is not a browser and does not
// claim to be: it cannot say whether a click works or whether anything is legible. It can say that
// the control is in the shipped markup, which nothing else here does.
//
// Added 2026-08-26 with the F-408 merge, after wrangler dev could not be kept up long enough to
// fetch a page (its asset directory is the repo root, so it reload-loops). A checker that renders
// in-process has no server to fall over.
//
//   node scripts/check_admin_render.mjs
//   node scripts/check_admin_render.mjs --self-test

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "worker.js"), "utf8").replace(/\r\n/g, "\n");

// ── Bring the page functions into scope, the same way check_worker_pages.mjs does ────────────
// ORDER MATTERS: a declaration that reads another has to come after it.
const DEPS = [
  "const PRODUCT_SHORT = ", "const PRODUCT_NAME_TO_ID = ", "const ADMIN_HEADER_CSS = ",
  "const ABY_ADMIN_LINKS = ", "const QUOTE_REP_NAMES = ", "const QUOTE_PRODUCT_IDS = ",
  "function shortProductName(", "function abyAdminNav(",
];

// A FUNCTION IS FOUND BY COUNTING BRACES, NOT BY LOOKING FOR ONE ON ITS OWN LINE.
// The first version searched for a closing brace at the start of a line, which is what the sibling
// checker's CONST slicer does -- and these pages are template literals full of CSS, so it stopped
// at the first `}` closing a media query and handed back half a page. The failure surfaced as
// "Unexpected identifier 'html'", i.e. pointing at innocent markup a hundred lines from the cut.
// CSS blocks and ${} interpolations are both balanced, so counting is safe here.
function fnBody(name, text) {
  const i = text.indexOf("\nfunction " + name + "(");
  if (i === -1) return null;
  let depth = 0;
  for (let j = text.indexOf("{", i); j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") { depth--; if (depth === 0) return text.slice(i, j + 1); }
  }
  return null;
}

function slice(decl, text) {
  if (decl.startsWith("function")) {
    return fnBody(decl.replace("function ", "").replace("(", ""), text);
  }
  const at = text.indexOf("\n" + decl);
  if (at === -1) return null;
  let close = "\n};\n";
  let end = text.indexOf(close, at);
  for (const alt of ["\n];\n", "\n" + String.fromCharCode(96) + ";\n"]) {
    const a = text.indexOf(alt, at);
    if (a !== -1 && (end === -1 || a < end)) { close = alt; end = a; }
  }
  return end === -1 ? null : text.slice(at, end + close.length);
}

function build(text) {
  const parts = [];
  for (const d of DEPS) {
    const s = slice(d, text);
    if (!s) throw new Error("could not find " + d.trim() + " at module scope");
    parts.push(s);
  }
  for (const fn of ["adminHTML", "adminBrokersHTML"]) {
    const s = slice("function " + fn + "(", text);
    if (!s) throw new Error("could not find " + fn);
    parts.push(s);
  }
  // The guide body is imported, not declared. Stubbed here because no rule below reads it.
  const code = "const ADMIN_GUIDE_HTML = '';\n" + parts.join("\n") +
               "\n;({ log: adminHTML(), brokers: adminBrokersHTML() });";
  return (0, eval)(code);
}

// ── The rules. Each asserts something about the EMITTED HTML. ─────────────────────────────────
const RULES = [
  {
    name: "the quote log ships the Log a quote panel, and it starts SHUT",
    why: "Eric asked for it here and asked that it expand on click. A <details> with `open` would"
       + " push the log itself below the fold, which is the opposite of what the page is for.",
    holds: (p) => /<details class="logq" id="logq">/.test(p.log)
               && !/<details class="logq" id="logq" open>/.test(p.log),
  },
  {
    name: "every product the tool sells reaches the page as a pill",
    why: "The point of pills over a text box is that nothing can be missed. Reading the emitted"
       + " markup is the only way to know the loop actually ran -- a rule matching the source is"
       + " satisfied by the code that builds them existing, whether or not it produced anything.",
    holds: (p) => {
      const products = readFileSync(join(ROOT, "assets/js/data/products.js"), "utf8");
      const sold = (products.match(/^    id: '([A-Za-z0-9]+)',$/gm) || [])
        .map((x) => /'([A-Za-z0-9]+)'/.exec(x)[1]);
      if (!sold.length) return false;   // read nothing: unchecked, never a pass
      return sold.every((id) => p.log.includes('data-pid="' + id + '"'));
    },
  },
  {
    name: "the rep dropdown offers display names, not ids",
    why: "This is the defect Eric reported. The value posted is the id; what he READS has to be"
       + " the name, or the option he picks looks like the wrong thing before it is even saved.",
    holds: (p) => /<option value="eric">Eric Johnson<\/option>/.test(p.log)
               && /<option value="niels">Niels Christiansen<\/option>/.test(p.log),
  },
  {
    name: "Pipeline is not in the emitted nav bar on either page",
    why: "The nav is built from one array and rendered into every admin page. If the entry came"
       + " back, it would come back everywhere at once.",
    holds: (p) => !/href="\/admin\/pipeline"/.test(p.log)
               && !/href="\/admin\/pipeline"/.test(p.brokers),
  },
  {
    name: "the nav still carries the eight pages that remain",
    why: "The counter-check to the one above. Removing an entry from an array is exactly the edit"
       + " that takes a neighbour with it, and a nav one link short reads as a page that never"
       + " existed rather than as a mistake.",
    holds: (p) => ["/aby", "/admin", "/admin/today", "/admin/clients", "/admin/brokers",
                   "/admin/rfp-watch", "/admin/referrals", "/admin/rates", "/admin/guide"]
      .every((h) => p.log.includes('href="' + h + '"')),
  },
  {
    name: "the A-Z bar has a mount point on Brokers and Agencies",
    why: "It is painted by renderAZ() at paint time, so what ships is the container. If that is"
       + " gone the bar silently never appears and the page looks exactly as it did before.",
    holds: (p) => /<div class="azbar" id="azbar"><\/div>/.test(p.brokers),
  },
  {
    name: "the open panel is visually bounded, and the shut one is not",
    why: "Eric, 2026-08-26: 'Hard to tell where it starts and ends.' Open, it is an eleven-field"
       + " form sitting directly on top of a table of quotes. Shut, it is a one-line control in a"
       + " toolbar, and boxing THAT would read as an alert -- so the rule pins both halves.",
    // ⭐ ASSERTS CONTRAST, NOT A COLOUR, because a named colour is exactly what went wrong: the
    // first version was tinted #f4f8f5 on a #f0f4f0 page and was invisible. A rule pinning that
    // hex would have passed on the broken version. So it reads the page's OWN body background out
    // of the same stylesheet and requires the panel not to match it.
    holds: (p) => {
      const open = /\.logq\[open\]\{([^}]*)\}/.exec(p.log);
      if (!open) return false;
      const body = /body\{[^}]*background:(#[0-9a-f]{3,6})/.exec(p.log);
      if (!body) return false;                       // could not read it: unchecked, never a pass
      const panel = /background:(#[0-9a-f]{3,6})/.exec(open[1]);
      if (!panel) return false;
      return panel[1].toLowerCase() !== body[1].toLowerCase()
          && /border:2px solid/.test(open[1])
          && !/\n\.logq\{[^}]*border-radius/.test(p.log);
    },
  },
  {
    name: "an ACA quote can record WHICH form set, and is not asked for a tier",
    why: "ACA is the one product whose label IS the form set, and the form could not record it --"
       + " Eric's own first hand-logged quote went in as a bare 'ACA Reporting'. The tier (full vs"
       + " self, and the band) is deliberately NOT offered: a dropdown defaulting to one writes a"
       + " guess that reads exactly like a recorded fact.",
    holds: (p) => /data-aca="derivedB"/.test(p.log)
               && /data-aca="derivedC"/.test(p.log)
               && !/data-aca="fullLt100"/.test(p.log)
               && !/data-aca="selfLt100"/.test(p.log),
  },
  {
    name: "the ACA question is hidden until ACA is picked",
    why: "A question about a product nobody selected is noise, and answering it would attach a"
       + " package to nothing.",
    // The emitted attribute is `display:none;margin-top:8px`, so anchoring on a closing quote
    // right after `none` matched nothing. The rule failed for its own reasons, not the page's --
    // and the sabotage-must-apply guard is what said so, on the first run.
    holds: (p) => /<div id="qAcaWrap" style="display:none;/.test(p.log),
  },
  {
    name: "no page ships the words 'not recorded'",
    why: "It printed under all 665 firms, because 0 of them had a recorded status. Eric asked what"
       + " it was for, which is the question a label identical on every row always provokes.",
    holds: (p) => !/not recorded/.test(p.brokers) && !/not recorded/.test(p.log),
  },
];

// ── Sabotages: every rule must be shown able to go red. ──────────────────────────────────────
const SABOTAGES = [
  { why: "the panel ships open, burying the log below it",
    edit: (t) => t.replace('<details class="logq" id="logq">', '<details class="logq" id="logq" open>') },
  { why: "a product is dropped from the pill list",
    edit: (t) => t.replace("'directBilling',\n", "") },
  { why: "the rep dropdown goes back to printing the id",
    edit: (t) => t.replace("+ QUOTE_REP_NAMES[id] +", "+ id +") },
  { why: "the Pipeline nav entry comes back",
    edit: (t) => t.replace("  { href: '/admin/rfp-watch',  label: 'RFP Watch' },",
                           "  { href: '/admin/pipeline',   label: 'Pipeline' },\n  { href: '/admin/rfp-watch',  label: 'RFP Watch' },") },
  { why: "a surviving nav entry is lost along with the removed one",
    edit: (t) => t.replace("  { href: '/admin/rates',      label: 'Rates' },", "") },
  { why: "the A-Z bar's mount point is removed",
    edit: (t) => t.replace('<div class="azbar" id="azbar"></div>', "") },
  { why: "the open panel loses its border, so the form runs into the quote table again",
    edit: (t) => t.replace("border:2px solid #1a5c3a;", "") },
  { why: "the open panel is tinted the same colour as the page behind it -- the real bug",
    edit: (t) => t.replace(".logq[open]{background:#fff;", ".logq[open]{background:#f0f4f0;") },
  { why: "the shut panel gets boxed too, so a one-line control reads as an alert",
    edit: (t) => t.replace(".logq{background:#fff;border-bottom:1px solid #e5e5e5}",
                           ".logq{background:#fff;border-bottom:1px solid #e5e5e5;border-radius:10px}") },
  { why: "the ACA form-set choice is dropped, so the label cannot say B or C",
    edit: (t) => t.replace('data-aca="derivedC"', 'data-nothing="x"') },
  { why: "the form starts asking for a service tier nobody knows",
    edit: (t) => t.replace('<button type="button" class="pp" data-aca="derivedB">1094/1095-B</button>',
                           '<button type="button" class="pp" data-aca="fullLt100">1094/1095-C full</button>') },
  { why: "the ACA question ships visible, asking about a product nobody picked",
    edit: (t) => t.replace('<div id="qAcaWrap" style="display:none;', '<div id="qAcaWrap" style="display:block;') },
  { why: "the 'not recorded' line comes back under every firm",
    edit: (t) => t.replace("     return '<span>' + esc(live) + '</span>';",
                           "     return '<span>' + esc(live) + '</span>' + '<div>not recorded</div>';") },
];

function run(text) {
  const pages = build(text);
  return RULES.map((r) => ({ name: r.name, ok: !!r.holds(pages) }));
}

let bad = 0;
let base;
try { base = run(src); }
catch (e) {
  console.log("RENDER FAILED before any rule could run: " + e.message);
  process.exit(2);   // could not run is a FAILURE, never a pass
}

console.log("ADMIN RENDER -- " + RULES.length + " rules, asserted on the emitted HTML");
for (const r of base) {
  console.log((r.ok ? "  ok   " : "  FAIL ") + r.name);
  if (!r.ok) { bad++; console.log("         " + RULES.find((x) => x.name === r.name).why); }
}

if (process.argv.includes("--self-test")) {
  console.log("");
  console.log("SELF-TEST -- every sabotage must redden at least one rule");
  for (const s of SABOTAGES) {
    const edited = s.edit(src);
    // A SABOTAGE THAT DID NOT APPLY IS NOT A PASSING TEST, IT IS NO TEST AT ALL -- and it looks
    // identical to one that ran. This is the trap that made three of seven rules vacuous elsewhere
    // in this project, so the substitution is asserted before its effect is measured.
    if (edited === src) {
      console.log("  BROKEN  " + s.why + "  (the edit matched nothing -- this tests nothing)");
      bad++; continue;
    }
    let after;
    try { after = run(edited); }
    catch { console.log("  caught  " + s.why + "  (the page stopped rendering at all)"); continue; }
    const flipped = after.filter((a, i) => base[i].ok && !a.ok).length;
    console.log((flipped ? "  caught  " : "  MISSED  ") + s.why
      + (flipped ? "  (" + flipped + " rule(s) went green->red)" : ""));
    if (!flipped) bad++;
  }
}

console.log("");
if (bad) {
  console.log(">> " + bad + " problem(s). The source containing a control is not the page showing it.");
  process.exit(1);
}
console.log("the admin pages emit the controls they are supposed to.");
