// The parent/child agency rollup on /admin/brokers, run against real fixtures.
//
// WHY THIS EXISTS. check_worker_pages.mjs proves the page's JavaScript PARSES. It says nothing
// about whether the rollup groups correctly, and this project's own record is that the expensive
// bugs are the ones that parse: a count that silently double-adds, a child that vanishes from the
// table, a toggle wired only inside paint() and therefore dead on first load.
//
// AND THE ADMIN IS BEHIND A PASSWORD, so the person who wrote it cannot open the screen. A
// checker that runs the REAL emitted function against fixtures is the only substitute for looking.
//
// WHAT IT ASSERTS, and each is a way this feature can be wrong while looking right:
//   1. a child NEVER appears as a top-level row
//   2. the parent's headline is its OWN quotes PLUS every child -- not one or the other
//   3. collapsed, children are absent; expanded, they are present with their OWN counts
//   4. an acquired child is labelled differently from a division
//   5. a parent with no quotes of its own is still rendered, so its children cannot vanish
//   6. the table re-sorts on the ROLLED total, or a parent sits below firms it now outranks
//   7. a division stays on the fallen-off list and an acquired name is excluded from it
//
//   node check_agency_rollup.mjs
//   node check_agency_rollup.mjs --self-test    (prove every rule can go red)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const WORKER = join(dirname(fileURLToPath(import.meta.url)), "..", "worker.js");
const SRC = readFileSync(WORKER, "utf8");

// ---- pull the real functions out of the page --------------------------------------------------
// Sliced from the page source rather than reimplemented. A checker that writes its own copy of
// the rule is testing its paraphrase (TRAPS #203), and the copy rots on its own schedule.
function slice(startMark, endMark, src) {
  const i = src.indexOf(startMark);
  if (i === -1) throw new Error("ANCHOR NOT FOUND: " + startMark);
  const j = src.indexOf(endMark, i);
  if (j === -1) throw new Error("END ANCHOR NOT FOUND: " + endMark);
  return src.slice(i, j);
}

function buildHarness(src) {
  const rollup = slice("var kids = {};", "var shown = capRows", src);
  const agRowSrc = slice("function agRow(x, child){", "\n   var shown", src);
  // ⭐⭐ THE ROW LOOP IS SLICED OUT OF THE PAGE TOO, and that is not fussiness.
  // The first version of this file wrote its own copy of the expand condition, so the sabotage
  // "children render even when collapsed" edited the page and the checker went on evaluating its
  // own duplicate -- it reported the sabotage MISSED, which is the self-test doing its job.
  // TRAPS #203: a checker that writes each rule twice is testing its paraphrase.
  const loop = slice("shown.map(function(x){", "}).join('')+moreRow", src) + "}).join('')";
  return { rollup, agRowSrc, loop };
}

function run(rows, open, src) {
  const { rollup, agRowSrc, loop } = buildHarness(src || SRC);
  const prelude = `
    var ag = ROWS, OPEN_AG = OPEN;
    function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
    function pctOfTotal(n){ return String(n) + '%'; }
    function day(d){ return String(d || ''); }
    function repSelect(kind, id, cur){ return '<select data-id="' + id + '">' + (cur||'') + '</select>'; }
  `;
  // capRows caps the visible list; the fixture is far under the cap, so `shown` is `tops`.
  const body = `${prelude}
${rollup}
${agRowSrc}
    var shown = tops;
    var html = ${loop};
    return { tops: tops, kids: kids, rolled: rolled, html: html };`;
  const fn = new Function("ROWS", "OPEN", body);
  return fn(rows, open || {});
}

// ---- fixtures ---------------------------------------------------------------------------------
// Shaped on the REAL data: MMA with MHBT beneath it, HUB with three children of both kinds, and
// a parent that has never quoted. A tidy fixture where every parent has its own quotes would pass
// whether or not rule 5 held (TRAPS #252 -- feed it the inputs that make it say the most).
const FIXTURE = [
  { agency_label: "MMA", n: 743, agents: 6, sales: 3, last_quote: "2026-08-06", agency_id: "id-mma" },
  { agency_label: "MHBT", n: 184, agents: 2, sales: 0, last_quote: "2017-12-21",
    parent_name: "MMA", relationship: "succeeded", agency_id: "id-mhbt" },
  { agency_label: "USI", n: 335, agents: 9, sales: 1, last_quote: "2026-08-03", agency_id: "id-usi" },
  { agency_label: "HUB", n: 41, agents: 2, sales: 0, last_quote: "2026-06-04", agency_id: "id-hub" },
  { agency_label: "HUB-Wellspring", n: 13, agents: 1, sales: 0, last_quote: "2021-12-27",
    parent_name: "HUB", relationship: "division", agency_id: "id-hw" },
  { agency_label: "Gus Bates", n: 16, agents: 1, sales: 0, last_quote: "2019-10-23",
    parent_name: "HUB", relationship: "succeeded", agency_id: "id-gb" },
  // A child whose parent has NEVER quoted. The parent must be synthesised.
  { agency_label: "Ghost - TX", n: 12, agents: 1, sales: 0, last_quote: "2024-01-01",
    parent_name: "Ghostly", relationship: "division", agency_id: "id-ghost" },
];

const RULES = [
  {
    name: "a child never appears as a top-level row",
    holds(src) {
      const r = run(FIXTURE, {}, src);
      const labels = r.tops.map((t) => t.agency_label);
      return !labels.includes("MHBT") && !labels.includes("HUB-Wellspring")
        && !labels.includes("Gus Bates") && !labels.includes("Ghost - TX");
    },
  },
  {
    name: "the parent headline is its own quotes PLUS every child",
    holds(src) {
      const r = run(FIXTURE, {}, src);
      const mma = r.tops.find((t) => t.agency_label === "MMA");
      const hub = r.tops.find((t) => t.agency_label === "HUB");
      return r.rolled(mma) === 743 + 184 && r.rolled(hub) === 41 + 13 + 16;
    },
  },
  {
    name: "an unparented agency is unchanged by the rollup",
    holds(src) {
      const r = run(FIXTURE, {}, src);
      return r.rolled(r.tops.find((t) => t.agency_label === "USI")) === 335;
    },
  },
  {
    name: "collapsed, no child row is rendered",
    holds(src) {
      const h = run(FIXTURE, {}, src).html;
      return !h.includes("MHBT") && !h.includes("HUB-Wellspring");
    },
  },
  {
    name: "expanded, children render with their OWN counts, not the rolled total",
    holds(src) {
      const h = run(FIXTURE, { MMA: true }, src).html;
      if (!h.includes("MHBT")) return false;
      const row = h.slice(h.indexOf("MHBT"));
      // its own 184 must be present, and the parent's combined 927 must not be on that row
      return row.includes(">184<") && !row.includes(">927<");
    },
  },
  {
    name: "an acquired child is labelled differently from a division",
    holds(src) {
      const h = run(FIXTURE, { HUB: true }, src).html;
      const gb = h.slice(h.indexOf("Gus Bates"), h.indexOf("Gus Bates") + 260);
      const hw = h.slice(h.indexOf("HUB-Wellspring"), h.indexOf("HUB-Wellspring") + 260);
      return gb.includes("acquired") && hw.includes("division");
    },
  },
  {
    name: "a parent with no quotes of its own is still rendered",
    holds(src) {
      const r = run(FIXTURE, {}, src);
      const g = r.tops.find((t) => t.agency_label === "Ghostly");
      return !!g && r.rolled(g) === 12;
    },
  },
  {
    name: "the table sorts on the ROLLED total",
    holds(src) {
      const r = run(FIXTURE, {}, src);
      // MMA rolls to 927 and must outrank USI's 335, which it does not on its own 743 alone
      // being compared after a child is removed -- the ordering has to use the combined figure.
      return r.tops[0].agency_label === "MMA" && r.tops[1].agency_label === "USI";
    },
  },
  {
    name: "the toggle is wired from TWO call sites, not only inside paint()",
    holds(src) {
      const s = src || SRC;
      const inside = s.indexOf("wireAgToggles();") !== -1;
      const declared = s.indexOf("function wireAgToggles(") !== -1;
      return inside && declared;
    },
  },
  {
    // 🔴🔴 THE RULE THAT WOULD HAVE CAUGHT THE ONE BUG THAT REACHED PRODUCTION TODAY.
    // A missing comma after "AS days_quiet" made the SELECT list read
    //     ... AS days_quiet MAX(a.relationship) AS relationship
    // which is a syntax error, so the query threw, the try/catch swallowed it, and the card
    // rendered "Nobody has fallen off" over a hundred dormant agencies. No error on the page.
    // ⭐ THE TELL IS GENERAL: in a SELECT list split on commas, a fragment containing TWO
    // " AS " is a fragment where a comma is missing. Cheap, and it needs no database.
    name: "no missing comma in the fallen-off SELECT list",
    holds(src) {
      const s = src || SRC;
      const i = s.indexOf("const r4");
      if (i === -1) return false;
      const seg = s.slice(i, s.indexOf("FROM quotes q", i));
      // Recover the SQL from the concatenated string literals, dropping // comment lines.
      const sql = seg
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n")
        .split('"')
        .filter((_, n) => n % 2 === 1)
        .join("");
      const list = sql.replace(/^\s*SELECT\s+/i, "");
      // Split on commas that are not inside parentheses.
      const parts = [];
      let depth = 0, cur = "";
      for (const ch of list) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
      }
      parts.push(cur);
      // ⚠️ COUNT " AS " ONLY AT DEPTH ZERO. The first version of this rule counted it anywhere in
      // the fragment and reported a FALSE POSITIVE on the very line it was written for:
      // CAST(julianday(...) AS INTEGER) AS days_quiet legitimately has two, one inside the CAST.
      // TRAPS #24 -- a new checker's first run is evidence about the CHECKER, not about the code.
      const outerAs = (p) => {
        let d = 0, out = "";
        for (const ch of p) {
          if (ch === "(") d++;
          else if (ch === ")") d--;
          else if (d === 0) out += ch;
        }
        return (out.match(/\sAS\s/gi) || []).length;
      };
      return parts.every((p) => outerAs(p) <= 1);
    },
  },
  {
    name: "the fallen-off query excludes acquired names but keeps divisions",
    holds(src) {
      const s = src || SRC;
      const i = s.indexOf("const r4");
      if (i === -1) return false;
      // ⚠️ SLICE TO THE END OF THE STATEMENT, NOT A FIXED NUMBER OF CHARACTERS. This read
      // s.slice(i, i + 2600) and went red the moment a comment was added above the HAVING --
      // reporting the rule broken when only the file had grown. TRAPS #172: a fixed-width window
      // is not a parser, and it always fails on the thing furthest from the anchor.
      const end = s.indexOf(".bind(", i);
      if (end === -1) return false;
      const seg = s.slice(i, end);
      return seg.includes("<> 'succeeded'") && !seg.includes("<> 'division'");
    },
  },
];

// ---- sabotages: prove each rule can go red ----------------------------------------------------
const SABOTAGES = [
  { why: "children left in the top-level list",
    apply: (s) => s.replace("var tops = ag.filter(function(x){ return !x.parent_name; });",
                            "var tops = ag.slice();") },
  { why: "parent headline stops adding its children",
    apply: (s) => s.replace("return own + k.reduce(function(t,c){ return t+Number(c.n||0); }, 0);",
                            "return own;") },
  { why: "children render even when collapsed",
    apply: (s) => s.replace("if (OPEN_AG[x.agency_label]) {", "if (true) {") },
  { why: "acquired and division share one label",
    apply: (s) => s.replace(">acquired</span>", ">division</span>") },
  { why: "a parent with no quotes of its own is dropped",
    apply: (s) => s.replace("tops.push({ agency_label: pn, n: 0, sales: 0, agents: 0, last_quote: '', synthetic: true });",
                            "void pn;") },
  { why: "the fallen-off list stops excluding acquired names",
    apply: (s) => s.replace("AND COALESCE(MAX(a.relationship),'') <> 'succeeded' ", "") },
  // Reproduces the real bug on demand: drop the comma and the SELECT list becomes invalid SQL.
  // A checker whose self-test replays the failure it was written for is one you can still trust
  // in a year.
  { why: "the comma after days_quiet goes missing again",
    apply: (s) => s.replace("AS INTEGER) AS days_quiet, ", "AS INTEGER) AS days_quiet ") },
];

function main() {
  const selfTest = process.argv.includes("--self-test");
  let bad = 0;
  console.log("AGENCY ROLLUP -- " + RULES.length + " rules");
  for (const r of RULES) {
    let ok = false;
    try { ok = r.holds(SRC); } catch (e) { ok = false; r.err = String(e.message || e); }
    if (!ok) bad++;
    console.log((ok ? "  ok   " : "  FAIL ") + r.name + (r.err ? "  [" + r.err + "]" : ""));
  }

  if (selfTest) {
    console.log("");
    console.log("SELF-TEST -- every sabotage must redden at least one rule");
    for (const s of SABOTAGES) {
      const broken = s.apply(SRC);
      if (broken === SRC) {
        console.log("  UNPROVEN  " + s.why + "  <- the sabotage matched NOTHING, so it proves nothing");
        bad++;
        continue;
      }
      let reddened = 0;
      for (const r of RULES) {
        let ok = false;
        try { ok = r.holds(broken); } catch { ok = false; }
        if (!ok) reddened++;
      }
      console.log((reddened ? "  caught  " : "  MISSED  ") + s.why
        + (reddened ? "  (" + reddened + " rule(s) red)" : ""));
      if (!reddened) bad++;
    }
  }

  console.log("");
  console.log(bad ? bad + " problem(s)" : "rollup behaves: children roll up, nothing vanishes.");
  process.exit(bad ? 1 : 0);
}

main();
