// Can a user REACH the things we built?
//
// ⭐⭐ WHY THIS EXISTS, AND WHY IT ASSERTS SOMETHING NO OTHER CHECKER DOES.
// F-367 -- the employer corrects the headcount on a quote -- was built, deployed and CORRECT. It
// was closed on "built, deployed and driven in a browser", and every word of that was true of the
// page it was driven on. The control renders only when window.__ABY_SHARED is true, which is only
// true on /q/<token>, and the ONLY way to mint that token was a button inside an EXPANDED ROW of
// the quote log. So the broker who had just written a quote had no route to it.
//
// Eric, 2026-08-22: "I only see download pdf, download html, and print, not share link."
//
// ⛔ EVERY OTHER CHECKER IN THIS REPO ASKS "IS IT CORRECT". None asks "can anybody get to it", and
// that is the gap this fills. A pricing assertion cannot fail when the feature is unreachable --
// the maths is fine; the door is missing.
//
// ⚠️ The closing note for F-367 claimed two guards, check_count_on_quote.js and
// check_employer_count.js. NEITHER FILE EVER EXISTED. So the feature ran unguarded while the notes
// said it was covered, which is how it stayed broken-in-practice for a day.
//
// ⭐ THE RULES BELOW ARE DELIBERATELY STRUCTURAL, NOT BEHAVIOURAL. They ask whether the affordance
// is emitted at all -- a link, a button, a route -- because that is exactly what nothing checked.
//
// Run:  node scripts/check_reachable.mjs
//       node scripts/check_reachable.mjs --self-test

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const RULES = [
  // ── THE MARKETING VIEW (F-383) ──────────────────────────────────────────────────────────
  // Everything else this repo guards asks whether the CRM is CORRECT. These ask whether anybody
  // can get to it. The endpoints were built, tested with 74 assertions and deployed before the
  // page existed at all -- which is exactly the state F-367 shipped in.
  {
    name: "the marketing view has a visible switch on the page",
    why: "The rows, the tags and the bulk apply are all behind it. Without the toggle the whole"
       + " view is a route nobody can reach, which is how F-367 shipped.",
    holds: (f) => /id=['\"]vMkt['\"]/.test(f.worker) && /setView\('marketing'\)/.test(f.worker),
  },
  {
    name: "the switch actually asks the marketing endpoint for rows",
    why: "A toggle that flips a panel but fetches nothing renders an empty list, and an empty list"
       + " reads as 'no agencies' rather than as a broken screen.",
    holds: (f) => /\/api\/admin\/crm\/agencies/.test(f.worker) && /function loadMkt\(/.test(f.worker),
  },
  {
    name: "the acquisition control is on the firm panel",
    why: "The endpoint that records an acquisition was built, tested and DEPLOYED before any"
       + " control existed to call it -- the exact state F-367 shipped in, noticed only because"
       + " somebody went looking. Of 672 firms only 12 are mapped, so an unreachable control here"
       + " means the map never gets filled in.",
    holds: (f) => /id="fRel"/.test(f.worker) && /function saveRel\(/.test(f.worker)
      && /crm\/relationship/.test(f.worker),
  },
  {
    name: "bulk apply is reachable from the rows themselves",
    why: "Eric asked for tick-the-rows-pick-a-tag-apply. The bar only appears once something is"
       + " selected, so the checkbox is its only door.",
    holds: (f) => /id=['\"]bulkBar['\"]/.test(f.worker) && /function selOne\(/.test(f.worker)
      && /function applyBulk\(/.test(f.worker),
  },
  {
    name: "the quote page offers a way to share the quote",
    why: "Without it the employer-editable headcount cannot be reached at all (F-367, F-382).",
    holds: (f) => /id=['"]shareBtn['"]/.test(f.app) && /Copy share link/.test(f.app),
  },
  {
    name: "the share button is wired to the share endpoint",
    why: "A button that renders but calls nothing is the same defect one layer down.",
    holds: (f) => /\/share['"]?\s*,\s*\{\s*method:\s*['"]POST/.test(f.app)
      || /'\/api\/quotes\/'\s*\+\s*id\s*\+\s*'\/share'/.test(f.app),
  },
  {
    name: "the save hook keeps the quote id",
    why: "The share link needs the saved row's id. The hook discarded the whole response, which is"
       + " why the button could not exist on the quote page.",
    holds: (f) => /__abySavedQuoteId/.test(f.hook) && /res\.json\(\)/.test(f.hook),
  },
  {
    name: "the worker serves the shared quote route",
    why: "The token is useless without a route that renders it as the employer view.",
    holds: (f) => /\/q\//.test(f.worker) && /__ABY_SHARED/.test(f.worker),
  },
  {
    name: "the shared page turns the employer control on",
    why: "The control is gated on this flag; if the shared route never sets it, the page renders"
       + " as an ordinary quote and nothing says so.",
    holds: (f) => /employerEditableCounts/.test(f.app) && /__ABY_SHARED/.test(f.app),
  },
  {
    name: "every admin page is linked from the nav",
    why: "A page nobody links to is a page nobody opens -- the same failure at the page level.",
    holds: (f) => {
      const routes = [...f.worker.matchAll(/path === ['"](\/admin[^'"]*)['"]/g)].map((m) => m[1]);
      const linked = [...f.worker.matchAll(/href: ['"](\/[^'"]*)['"]/g)].map((m) => m[1]);
      // ⚠️ NORMALISE ALIASES FIRST. "/admin/" and "/admin.html" are the same page as "/admin",
      // and counting them as unlinked made this rule fail on a healthy tree. A checker that cries
      // wolf gets ignored, which is worse than not having it -- the same lesson the page checker's
      // own comments record twice.
      const norm = (r) => r.replace(/\.html$/, "").replace(/\/$/, "") || "/admin";
      const nav = new Set(linked.map(norm));
      const pages = [...new Set(routes.map(norm))].filter((r) => !r.startsWith("/admin/api"));
      const missing = pages.filter((p) => !nav.has(p));
      if (missing.length) console.log("         unlinked: " + missing.join(", "));
      return missing.length === 0;
    },
  },
];

const SABOTAGES = [
  {
    why: "the acquisition control is orphaned from its endpoint",
    apply: (f) => ({ ...f, worker: f.worker.replace(/function saveRel\(/g, "function unusedRel(") }),
  },
  {
    why: "the marketing switch is removed from the page",
    apply: (f) => ({ ...f, worker: f.worker.replace(/id="vMkt"/g, 'id="notTheSwitch"') }),
  },
  {
    why: "the marketing view stops fetching its rows",
    apply: (f) => ({ ...f, worker: f.worker.replace(/function loadMkt\(/g, "function unusedLoad(") }),
  },
  {
    why: "the bulk apply bar is orphaned from the row checkboxes",
    apply: (f) => ({ ...f, worker: f.worker.replace(/function selOne\(/g, "function unusedSel(") }),
  },
  {
    why: "the share button is removed from the quote page",
    apply: (f) => ({ ...f, app: f.app.replace(/id="shareBtn"/g, 'id="notShareBtn"') }),
  },
  {
    why: "the save hook goes back to discarding the response",
    apply: (f) => ({ ...f, hook: f.hook.replace(/__abySavedQuoteId/g, "unusedId") }),
  },
  {
    why: "the shared page stops enabling the employer control",
    apply: (f) => ({ ...f, app: f.app.replace(/employerEditableCounts/g, "unusedFlag") }),
  },
];

function load() {
  return {
    app: read("assets/js/app.js"),
    hook: read("save-hook.js"),
    worker: read("worker.js"),
  };
}

function run(files) {
  return RULES.map((r) => ({ name: r.name, ok: !!r.holds(files) }));
}

const files = load();
const results = run(files);
let bad = 0;

console.log("REACHABILITY -- " + RULES.length + " rules");
for (const r of results) {
  console.log((r.ok ? "  ok   " : "  FAIL ") + r.name);
  if (!r.ok) {
    bad++;
    const rule = RULES.find((x) => x.name === r.name);
    console.log("         " + rule.why);
  }
}

if (process.argv.includes("--self-test")) {
  console.log("");
  console.log("SELF-TEST -- every sabotage must redden at least one rule");
  for (const s of SABOTAGES) {
    const before = run(files);
    const after = run(s.apply(files));
    const flipped = after.filter((a, i) => before[i].ok && !a.ok).length;
    console.log((flipped ? "  caught  " : "  MISSED  ") + s.why
      + (flipped ? "  (" + flipped + " rule(s) went green->red)" : ""));
    if (!flipped) bad++;
  }
}

console.log("");
if (bad) {
  console.log(">> " + bad + " problem(s). A feature nobody can reach is not shipped.");
  process.exit(1);
}
console.log("everything built is reachable from a screen a user is already on.");
