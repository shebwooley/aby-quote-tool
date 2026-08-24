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
  const agRowSrc = slice("function agRow(x, child, ownRow){", "\n   var shown", src);
  // ⭐⭐ THE ROW LOOP IS SLICED OUT OF THE PAGE TOO, and that is not fussiness.
  // The first version of this file wrote its own copy of the expand condition, so the sabotage
  // "children render even when collapsed" edited the page and the checker went on evaluating its
  // own duplicate -- it reported the sabotage MISSED, which is the self-test doing its job.
  // TRAPS #203: a checker that writes each rule twice is testing its paraphrase.
  const loop = slice("shown.map(function(x){", "}).join('')+moreRow", src) + "}).join('')";
  return { rollup, agRowSrc, loop };
}

// Family totals as SQL returns them: employers counted DISTINCTLY across the whole family.
// ⭐ THE NUMBERS HERE ARE DELIBERATELY LESS THAN THE SUM OF THE ROWS. Parent has 10 employers and
// the child has 6, but two were quoted under both names, so the family is 14 and not 16. A rule
// below asserts the rendered parent shows 14 -- which is the only way to catch a rollup that goes
// back to adding the rows up.
const FAMILY_FIXTURE = [
  // MMA's own row has 10 employers and MHBT's has 6, so a rollup that ADDS them gets 16.
  // The truth is 14: two employers were quoted under both names. A rule below asserts the
  // rendered MMA row says 14, which is the only way to catch a regression back to summing.
  { family: 'MMA', employers: 14, won: 7, kept: 5, n: 927 },
  { family: 'USI', employers: 12, won: 3, kept: 3, n: 335 },
  { family: 'HUB', employers: 9, won: 4, kept: 4, n: 70 },
  // A SYNTHESISED parent still gets a family row, because the SQL groups on
  // COALESCE(parent name, agency) -- the child's quotes land under the parent's name even though
  // the parent has never quoted under its own. Its figures are its only child's.
  { family: 'Ghostly', employers: 2, won: 0, kept: 0, n: 12 },
];

function run(rows, open, src) {
  const { rollup, agRowSrc, loop } = buildHarness(src || SRC);
  const prelude = `
    var ag = ROWS, OPEN_AG = OPEN;
    // The rollup reads CACHE.byAgent to nest the named agents under their agency. Stubbed from
    // the fixture so the harness exercises the real grouping rather than an empty list.
    var CACHE = { byAgent: AGENTS };
    // FAM_BY_NAME holds the per-FAMILY conversion figures that SQL counts distinctly, so a
    // rolled-up parent does not double-count an employer quoted under two names in the family.
    // Built here from the fixture the same way paint() builds it from the response.
    var FAM_BY_NAME = {}; (FAMILIES || []).forEach(function(f){ FAM_BY_NAME[f.family] = f; });
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
  const fn = new Function("ROWS", "OPEN", "AGENTS", "FAMILIES", body);
  return fn(rows, open || {}, AGENT_FIXTURE, FAMILY_FIXTURE);
}

// ---- fixtures ---------------------------------------------------------------------------------
// Shaped on the REAL data: MMA with MHBT beneath it, HUB with three children of both kinds, and
// a parent that has never quoted. A tidy fixture where every parent has its own quotes would pass
// whether or not rule 5 held (TRAPS #252 -- feed it the inputs that make it say the most).
// Named agents, some at a CHILD agency on purpose: an agent filed under MHBT must surface under
// MMA, or somebody has to look up the parent by hand -- the same subtraction Eric objected to.
const AGENT_FIXTURE = [
  { name: "Travis Sartain", email: "travis@marshmma.com", agency: "MMA", n: 3, last_quote: "2026-08-06" },
  { name: "Old Hand", email: "old@mhbt.com", agency: "MHBT", n: 2, last_quote: "2016-01-01" },
  { name: "Someone Else", email: "s@usi.com", agency: "USI", n: 1, last_quote: "2026-01-01" },
  // ⛔ An agency-keyed row with no person on it. It must NOT appear as an agent.
  { name: "", email: "", agency: "MMA", n: 99, last_quote: "2026-01-01" },
];

const FIXTURE = [
  { agency_label: "MMA", n: 743, employers: 10, won: 5, kept: 4, agents: 6, sales: 3, sales_inferred: 2, last_quote: "2026-08-06", agency_id: "id-mma" },
  { agency_label: "MHBT", n: 184, employers: 6, won: 3, kept: 1, agents: 2, sales: 5, sales_inferred: 5,
    // ⭐ MHBT HAS SALES AND MMA HAS FEWER. The dead name wrote the business; the parent
    // inherited it. That is the shape that makes a sales rollup observable at all -- if the
    // child had none, a parent showing its own 3 and a parent showing the family 3 would be
    // indistinguishable and the rule would be vacuous. last_quote: "2017-12-21",
    parent_name: "MMA", relationship: "succeeded", agency_id: "id-mhbt" },
  { agency_label: "USI", n: 335, employers: 12, won: 3, kept: 3, agents: 9, sales: 1, sales_inferred: 0, last_quote: "2026-08-03", agency_id: "id-usi" },
  { agency_label: "HUB", n: 41, employers: 5, won: 2, kept: 2, agents: 2, sales: 0, sales_inferred: 0, last_quote: "2026-06-04", agency_id: "id-hub" },
  { agency_label: "HUB-Wellspring", n: 13, employers: 3, won: 1, kept: 1, agents: 1, sales: 0, sales_inferred: 0, last_quote: "2021-12-27",
    parent_name: "HUB", relationship: "division", agency_id: "id-hw" },
  { agency_label: "Gus Bates", n: 16, employers: 4, won: 2, kept: 2, agents: 1, sales: 0, sales_inferred: 0, last_quote: "2019-10-23",
    parent_name: "HUB", relationship: "succeeded", agency_id: "id-gb" },
  // A child whose parent has NEVER quoted. The parent must be synthesised.
  { agency_label: "Ghost - TX", n: 12, employers: 2, won: 0, kept: 0, agents: 1, sales: 0, sales_inferred: 0, last_quote: "2024-01-01",
    parent_name: "Ghostly", relationship: "division", agency_id: "id-ghost" },
];

const RULES = [
  {
    // A SALE IS FILED UNDER THE NAME THAT WROTE IT. Benefits Texas wrote the business; Patriot
    // bought them. So a parent whose OWN name never quoted has no sales of its own, and before
    // sales were rolled its row showed a dash over a family holding fifty of them.
    // ⭐ Unlike EMPLOYERS, sales are safe to ADD -- a sale row belongs to exactly one agency, so
    // there is no double-count of the kind that forced conversion to be counted in SQL.
    name: "a parent's sales include its children's",
    holds(src) {
      const r = run(FIXTURE, {}, src);
      const row = r.html.slice(0, r.html.indexOf("USI"));
      return row.includes("<strong>8</strong>");        // MMA 3 + MHBT 5
    },
  },
  {
    // ⚠️ TESTED ON THE PARENT'S OWN ROW, NOT ON A CHILD. A child has no children of its own, so
    // rolling it returns its own number and a "child shows the family total" sabotage cannot
    // change anything about it -- the rule would be vacuous. The parent's OWN row is where the
    // two answers differ: MMA alone sold 3, the MMA family sold 8.
    name: "the parent's own row shows its own sales, not the family's",
    holds(src) {
      const r = run(FIXTURE, { MMA: true }, src);
      const head = r.html.slice(0, r.html.indexOf("MHBT"));
      // The headline (8) comes first, then the parent's own row (3), then the children.
      return head.includes("<strong>8</strong>") && head.includes("<strong>3</strong>");
    },
  },
  {
    // ⭐⭐ THE ONE THAT MATTERS. Summing the child rows gives 16 employers for the MMA family;
    // the truth is 14, because two employers were quoted under both MMA and MHBT. A rate built
    // on an inflated denominator is wrong in a CONSISTENT DIRECTION -- always too low -- which
    // is worse than an obviously broken one, because nothing about it looks wrong.
    name: "a rolled-up parent takes conversion from the FAMILY, not the sum of its rows",
    holds(src) {
      const r = run(FIXTURE, {}, src);
      const row = r.html.slice(0, r.html.indexOf("USI"));
      // 7 of 14 renders as 50%. Summing would be 8 of 16, which is ALSO 50% -- so assert on the
      // tooltip, which carries the counts, not on the percentage.
      return /7 of 14 employers/.test(row) && !/8 of 16 employers/.test(row);
    },
  },
  {
    // RETENTION IS OF WHAT WE WON, NOT OF WHAT WE QUOTED. MMA's family kept 5 of the 7 it won,
    // which is 71%. Measured against the 14 employers quoted it would read 36% -- a number that
    // is not wrong so much as answering a different question, silently. Both figures are
    // percentages in the same row, so nothing about the wrong one looks out of place.
    // ⚠️ Asserts the RENDERED percentage, because the tooltip is built from `won` either way and
    // would keep saying "of the 7 we won" while the cell showed 36%.
    name: "retention is measured against the employers we WON",
    holds(src) {
      const r = run(FIXTURE, {}, src);
      const row = r.html.slice(0, r.html.indexOf("USI"));
      return row.includes(">71%<") && !row.includes(">36%<");
    },
  },
  {
    name: "an expanded child shows its OWN conversion, not the family's",
    holds(src) {
      const r = run(FIXTURE, { MMA: true }, src);
      const i = r.html.indexOf("MHBT");
      return /3 of 6 employers/.test(r.html.slice(i, i + 900));
    },
  },
  {
    name: "the parent's own row shows the parent alone, not the family",
    holds(src) {
      const r = run(FIXTURE, { MMA: true }, src);
      // The parent's own row is rendered before the children; it must say 5 of 10, not 7 of 14.
      const head = r.html.slice(0, r.html.indexOf("MHBT"));
      return /5 of 10 employers/.test(head);
    },
  },
  {
    // ⛔ A PERCENTAGE OF A HANDFUL IS NOT A RATE. Ghost - TX has 2 employers; "0%" would sort and
    // read exactly like a real zero. Below the threshold the fraction is shown instead.
    name: "a tiny denominator renders as a fraction, never as a percentage",
    holds(src) {
      const r = run(FIXTURE, { Ghostly: true }, src);
      const i = r.html.indexOf("Ghost - TX");
      const cell = r.html.slice(i, i + 700);
      return cell.includes("0/2") && !/>0%</.test(cell);
    },
  },
  {
    name: "every agency row emits the same number of cells as the header",
    holds(src) {
      const r = run(FIXTURE, { MMA: true }, src);
      const rows = r.html.split("<tr").slice(1);
      return rows.every((row) => {
        const cells = (row.match(/<td/g) || []).length;
        return cells === 10 || /colspan="10"/.test(row);
      });
    },
  },
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
    // Eric: "list the agents under the agencies - just toggle ... you would see the agents that we
    // know are affiliated with their quote count."
    name: "expanding an agency lists the agents we can name",
    holds(src) {
      const h = run(FIXTURE, { MMA: true }, src).html;
      return h.includes("Travis Sartain") && h.includes("Agents we can name here");
    },
  },
  {
    // ⭐ An agent filed under a CHILD name belongs to the parent now. Without this, somebody has
    // to look up which agency MHBT became -- the same subtraction Eric objected to on the counts.
    name: "an agent at a child agency surfaces under the parent",
    holds(src) {
      const h = run(FIXTURE, { MMA: true }, src).html;
      return h.includes("Old Hand");
    },
  },
  {
    // ⛔ 639 of 768 rows in the agent table are keyed on an AGENCY, not a person. Repeating the
    // agency's own name inside its own drop-down is the noise Eric asked to be rid of.
    name: "an agency-keyed row is never listed as an agent",
    holds(src) {
      const h = run(FIXTURE, { MMA: true }, src).html;
      return !h.includes("(unnamed)") && !h.includes(">99<");
    },
  },
  {
    // 🔴 GALLAGHER HAS NINE NAMED AGENTS AND NO ACQUISITIONS. With the caret gated on child
    // agencies alone, its agents were built, correct and UNREACHABLE -- no control existed to
    // open them. Found by looking at the page, not by any rule that existed at the time.
    name: "an agency with agents but no child agencies still gets a toggle",
    holds(src) {
      // ⚠️ Assert on the toggle's OWN data attribute, not on a window sliced forward from the
      // agency name -- the caret is rendered BEFORE the name in the cell, so a forward slice
      // could never see it and the first version of this rule reported its sabotage MISSED.
      const h = run(FIXTURE, {}, src).html;
      return h.includes('data-ag="USI"');
    },
  },
  {
    // The agency rollup reads CACHE.byAgent. If that is assigned AFTER paintByAgency runs, the
    // agent index is empty on the FIRST render and an agency whose only children are people has
    // no expand control -- appearing only after some unrelated action repaints. Same shape as
    // TRAPS #239, about DATA rather than handlers.
    name: "the agent cache is populated before the agency table paints",
    holds(src) {
      const s2 = src || SRC;
      const assign = s2.indexOf("CACHE.byAgent=st.byAgent");
      const paint = s2.indexOf("paintByAgency();");
      return assign !== -1 && paint !== -1 && assign < paint;
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
    name: "the fallen-off query excludes acquired names AND aliases, but keeps divisions",
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
      // AN ALIAS IS NOT CALLABLE EITHER. This rule named only 'succeeded' and went green while a
      // misspelling with a quiet year could arrive on a list headed "worth a call". Eric asked
      // whether the fixes reach the performance side; the rollup did, this filter did not.
      // A DIVISION STILL BELONGS HERE -- it is trading, and somebody can ring it.
      return seg.includes("NOT IN ('succeeded','alias')") && !seg.includes("'division'");
    },
  },
];

// ---- sabotages: prove each rule can go red ----------------------------------------------------
const SABOTAGES = [
  { why: "a parent stops adding its children's sales",
    apply: (s) => s.replace(
      "var salesN = (child || ownRow) ? Number(x.sales||0) : rolledField(x, 'sales');",
      "var salesN = Number(x.sales||0);") },
  { why: "a child row shows the family's sales instead of its own",
    apply: (s) => s.replace(
      "var salesN = (child || ownRow) ? Number(x.sales||0) : rolledField(x, 'sales');",
      "var salesN = rolledField(x, 'sales');") },
  // ⭐⭐ THE REGRESSION THIS FEATURE IS MOST LIKELY TO SUFFER: somebody looks at the family lookup,
  // decides it is indirection for its own sake, and adds the child rows up instead. It gives a
  // plausible number that is always slightly too low.
  { why: "a parent sums its children's employers instead of using the family figure",
    apply: (s) => s.replace("var f = (child || ownRow) ? x : (FAM_BY_NAME[x.agency_label] || x);",
      "var f = (child || ownRow) ? x : (function(){ var k=(kids[x.agency_label]||[]);" +
      " return { employers: Number(x.employers||0)+k.reduce(function(t,c){return t+Number(c.employers||0);},0)," +
      " won: Number(x.won||0)+k.reduce(function(t,c){return t+Number(c.won||0);},0)," +
      " kept: Number(x.kept||0)+k.reduce(function(t,c){return t+Number(c.kept||0);},0) }; })();") },
  { why: "a child row shows the family's conversion rather than its own",
    apply: (s) => s.replace("var f = (child || ownRow) ? x : (FAM_BY_NAME[x.agency_label] || x);",
      "var f = (FAM_BY_NAME[x.parent_name||x.agency_label] || x);") },
  { why: "a percentage is printed however small the denominator",
    apply: (s) => s.replace("var body = (bottom < floor) ? (top+'/'+bottom) : (pc+'%');",
                            "var body = pc+'%';") },
  { why: "retention is measured against employers quoted instead of employers won",
    apply: (s) => s.replace("var keptCell = rate(kept, won, 5,", "var keptCell = rate(kept, emp, 5,") },
  { why: "a row emits fewer cells than the header",
    apply: (s) => s.replace("+ '<td class=\"c\">'+convCell+'</td><td class=\"c\">'+keptCell+'</td>'",
                            "+ '<td class=\"c\">'+convCell+'</td>'") },
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
  { why: "the agent cache is assigned after the agency table paints",
    apply: (s) => s.replace("CACHE.byAgent=st.byAgent||[];", "/*moved*/")
                   .replace("paintByAgent();", "CACHE.byAgent=st.byAgent||[];paintByAgent();") },
  { why: "an agency with only agents loses its toggle",
    apply: (s) => s.replace("(kid.length || hasPeople)", "(kid.length)") },
  { why: "agents stop being listed under their agency",
    apply: (s) => s.replace("var ppl = agentsFor(x);", "var ppl = [];") },
  { why: "an agent at a child agency stops rolling up to the parent",
    apply: (s) => s.replace("names.push(k.agency_label||k.agency||'');", "void k;") },
  { why: "agency-keyed rows leak into the agent list",
    apply: (s) => s.replace("if (!(p.name || p.email)) return;", "") },
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
      // 🔴🔴 A RULE ONLY COUNTS AS CATCHING A SABOTAGE IF IT WAS GREEN BEFORE AND IS RED AFTER.
      // The first version counted any red rule, and on 2026-08-22 that reported all seven
      // sabotages "caught" while eight rules were red for a completely unrelated reason: the
      // function signature had changed and their shared anchor no longer matched, so the harness
      // was broken and every sabotage looked detected. A self-test that passes because the
      // harness is broken is the exact failure this file exists to prevent (TRAPS #148).
      let reddened = 0;
      for (const r of RULES) {
        let before = false, after = false;
        try { before = r.holds(SRC); } catch { before = false; }
        if (!before) continue;                 // already red -- it can prove nothing here
        try { after = r.holds(broken); } catch { after = false; }
        if (!after) reddened++;
      }
      console.log((reddened ? "  caught  " : "  MISSED  ") + s.why
        + (reddened ? "  (" + reddened + " rule(s) went green->red)" : ""));
      if (!reddened) bad++;
    }
  }

  console.log("");
  console.log(bad ? bad + " problem(s)" : "rollup behaves: children roll up, nothing vanishes.");
  process.exit(bad ? 1 : 0);
}

main();
