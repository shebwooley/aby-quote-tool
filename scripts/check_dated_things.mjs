// The ONE dated-things list behind /admin/today (F-403), and the page that renders it.
//
// WHY A NEW SCREEN NEEDS THIS. Every source here is a QUERY, and a query that stops matching does
// not throw, does not fail node --check, and renders as a slightly shorter list. Nobody can tell a
// source that fell out from a quiet fortnight. So rule one is simply: every source reaches the list.
//
// AND THE SECOND REASON IS SPECIFIC TO THIS DATA. quotes.effective_date holds TWO vocabularies --
// 150 real ISO dates and 1,581 rows of prose like "Aug 2025 or later" from the 2009-2023 import.
// Compared against today in SQL the prose rows all come back as FUTURE, because the letter A sorts
// after the digit 2. The first measurement written for this feature said 1,513 quotes had a future
// effective date; the true number is 11. That is a wrong answer no type checker can see.
//
//   node scripts/check_dated_things.mjs
//   node scripts/check_dated_things.mjs --self-test   (prove every rule can go red)
//
// WHAT IT DOES NOT CHECK: whether the screen is USEFUL, and whether the live database still holds
// what the fixture describes. It runs the real code over a fixture, in memory. Nothing is written.

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = join(ROOT, "worker.js");
const SCRATCH = mkdtempSync(join(tmpdir(), "abydated-"));
process.on("exit", () => { try { rmSync(SCRATCH, { recursive: true, force: true }); } catch {} });

const SELFTEST = process.argv.includes("--self-test");

// ── Pulling the real code out of worker.js ────────────────────────────────────────────────────
// Extracted by NAME with brace matching, not by cutting between line numbers. worker.js has twice
// lost a top-level declaration to a line-range edit (check_declarations.mjs exists for that), and a
// checker that re-implements what it checks is testing its own paraphrase, not the code.

function extract(src, name, kind) {
  const head = kind === "const" ? "const " + name + " = " : "function " + name + "(";
  let i = src.indexOf(head);
  if (i === -1) throw new Error("could not find " + kind + " " + name + " in the source");
  // Take the `async` with it. Without that the copy is a plain function containing await, which is
  // a SyntaxError -- and the error names the await, not the missing keyword, so it reads as a bug
  // in the code under test rather than in the extractor.
  if (kind !== "const" && src.slice(Math.max(0, i - 6), i) === "async ") i -= 6;
  if (kind === "const") {
    const end = src.indexOf(";", i);
    return src.slice(i, end + 1);
  }
  let j = src.indexOf("{", i), d = 0;
  for (; j < src.length; j++) {
    if (src[j] === "{") d++;
    else if (src[j] === "}") { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  throw new Error("unbalanced braces reading " + name);
}

/** The page's inline script, so the fold logic can be RUN rather than grepped for. */
function pageScript(src) {
  const fn = extract(src, "adminTodayHTML", "function");
  const a = fn.indexOf("<script>");
  const b = fn.lastIndexOf("</script>");
  if (a === -1 || b === -1) throw new Error("adminTodayHTML has no inline script");
  // The page lives inside a template literal, so a doubled backslash in the source is a single one
  // by the time a browser sees it. Undo that here or the extracted copy is not what ships.
  return fn.slice(a + 8, b).split("\\\\").join("\\");
}

const SRC_RAW = readFileSync(WORKER, "utf8");

/** Build the scratch module. `mutate` lets a sabotage change the code before it is loaded. */
let modSeq = 0;
async function loadModule(mutate) {
  let src = SRC_RAW;
  if (mutate) src = mutate(src);

  const server = [
    extract(src, "isoDay", "function"),
    extract(src, "daysBetween", "function"),
    extract(src, "todayIso", "function"),
    extract(src, "addDays", "function"),
    extract(src, "FOLLOWUP_AFTER_DAYS", "const"),
    extract(src, "FOLLOWUP_UNTIL_DAYS", "const"),
    extract(src, "abyOwner", "function"),
    extract(src, "abyDatedThings", "function"),
  ].join("\n\n");

  const page = pageScript(src);
  // The page script ends by wiring the DOM and calling load(). None of that can run here, and none
  // of it is what this checker is about, so only the pure rendering functions are taken across.
  const pageParts = [
    "const MON=" + /var MON=(\[[^\]]*\]);/.exec(page)[1] + ";",
    "const SRC=" + /var SRC=(\[[\s\S]*?\}\];)/.exec(page)[1].replace(/;$/, "") + ";",
    "let OPEN={};",
    "let TODAY_STR='';",
    "function setOpen(o){OPEN=o}",
    "function setToday(t){TODAY_STR=t}",
    extract(page, "esc", "function"),
    extract(page, "dayLabel", "function"),
    extract(page, "ownerLabel", "function"),
    extract(page, "kindLabel", "function"),
    extract(page, "kindCount", "function"),
    extract(page, "rowHTML", "function"),
    extract(page, "sect", "function"),
    extract(page, "renderDue", "function"),
    extract(page, "renderMonth", "function"),
  ].join("\n\n");

  const file = join(SCRATCH, "m" + (++modSeq) + ".mjs");
  writeFileSync(file,
    server + "\n\n" + pageParts + "\n\n" +
    "export { isoDay, daysBetween, addDays, todayIso, abyOwner, abyDatedThings, " +
    "renderDue, renderMonth, rowHTML, setOpen, setToday, FOLLOWUP_AFTER_DAYS, FOLLOWUP_UNTIL_DAYS };\n");
  return import(pathToFileURL(file).href + "?v=" + modSeq);
}

// ── The fixture ───────────────────────────────────────────────────────────────────────────────
// A FIXTURE THAT PRODUCES NOTHING TO TEST IS A FIXTURE FAILURE, NEVER A PASS. The dashboard's
// equivalent checker shipped with an empty profile that yielded 21 applicable requirements of which
// ZERO were dated -- every rule passed and no compliance date was ever exercised. So this fixture is
// asserted to produce dated rows in EVERY source before a single rule runs, and the run aborts
// loudly if it stops doing so.

const TODAY = "2026-08-25";
const d = (n) => new Date(Date.UTC(2026, 7, 25) + n * 86400000).toISOString().slice(0, 10);
const ts = (n) => d(n) + "T12:00:00.000Z";

const FIXTURE = {
  aby_task: [
    { id: "t1", title: "Ring Brown and Brown about the COBRA rates", due_on: d(-9), owner: "eric",
      entity_type: "agency", entity_id: "a1", entity_label: "Brown & Brown", note: "", done_at: null },
    { id: "t2", title: "Draft the school district reference sheet", due_on: d(3), owner: "niels",
      entity_type: null, entity_id: null, entity_label: "", note: "", done_at: null },
    { id: "t3", title: "Renew the TPA bond", due_on: d(200), owner: "", entity_type: null,
      entity_id: null, entity_label: "", note: "", done_at: null },
    { id: "t4", title: "Tidy the Gallagher branch list", due_on: null, owner: "", entity_type: null,
      entity_id: null, entity_label: "", note: "no date on purpose", done_at: null },
    { id: "t5", title: "This one is finished", due_on: d(-2), owner: "eric", entity_type: null,
      entity_id: null, entity_label: "", note: "", done_at: ts(-1) },
  ],
  // Two real ISO dates ahead, one PROSE row from the back catalogue, one already Sold.
  quotes: [
    { quote_number: "TX260821-0001-C", client_name: "Fox Rental", effective_date: d(40),
      status: "P", created_at: ts(-4), broker_agency: "Acme Benefits", broker_name: "Jane Smith",
      broker_email: "jane@acme.com" },
    { quote_number: "TX260801-0002-C", client_name: "Steelfast, Inc.", effective_date: d(120),
      status: "P", created_at: ts(-24), broker_agency: "Acme Benefits", broker_name: "Jane Smith",
      broker_email: "jane@acme.com" },
    // A date that PASSES the SQL shape test and is not a day. SQLite's LIKE cannot tell; only
    // isoDay can, which is the whole reason the check is repeated in JavaScript.
    { quote_number: "TX260101-0008-C", client_name: "Impossible Date", effective_date: "2026-11-31",
      status: "P", created_at: ts(-200), broker_agency: "Acme Benefits", broker_name: "Jane Smith",
      broker_email: "jane@acme.com" },
    // THE TRAP ROW. 1,581 of these exist in production.
    { quote_number: "TX150101-9999-C", client_name: "Old Employer", effective_date: "Aug 2025 or later",
      status: "P", created_at: ts(-3000), broker_agency: "Gone Agency", broker_name: "",
      broker_email: "" },
    { quote_number: "TX260701-0003-C", client_name: "Already Sold", effective_date: d(60),
      status: "S", created_at: ts(-55), broker_agency: "Acme Benefits", broker_name: "Jane Smith",
      broker_email: "jane@acme.com" },
    // In the follow-up window, a different broker, so the roll-up has two groups to make.
    { quote_number: "TX260720-0004-C", client_name: "Bonham", effective_date: "", status: "P",
      created_at: ts(-36), broker_agency: "Blumberg Benefits", broker_name: "Ken Blumberg",
      broker_email: "ken@blumberg.com", source_tag: "import-2026" },
    { quote_number: "TX260722-0005-C", client_name: "Mackenzie", effective_date: "", status: "P",
      created_at: ts(-34), broker_agency: "Blumberg Benefits", broker_name: "Ken Blumberg",
      broker_email: "ken@blumberg.com", source_tag: "import-2026" },
    // Too new to chase, and too old to still be a lead. Neither is a follow-up.
    { quote_number: "TX260824-0006-C", client_name: "Yesterday", effective_date: "", status: "P",
      created_at: ts(-1), broker_agency: "Fresh Agency", broker_name: "", broker_email: "new@fresh.com" },
    { quote_number: "TX250101-0007-C", client_name: "Ancient", effective_date: "", status: "P",
      created_at: ts(-400), broker_agency: "Old Agency", broker_name: "", broker_email: "old@old.com" },
  ],
  rfp_opportunity: [
    { id: "r1", entity_name: "City of Bonham", title: "Benefits administration services",
      closes_at: d(21), questions_due_at: d(7), pre_proposal_at: d(2), pre_proposal_mandatory: 1,
      disposition: "new" },
    { id: "r2", entity_name: "Somewhere ISD", title: "We already passed on this",
      closes_at: d(30), questions_due_at: null, pre_proposal_at: null, pre_proposal_mandatory: 0,
      disposition: "pass" },
  ],
  commitments: [
    { id: "c1", quote_number: "TX260821-0001-C", employer_name: "Fox Rental", start_date: d(40) },
    { id: "c2", quote_number: "TX260101-0009-C", employer_name: "No Start Date", start_date: "" },
  ],
};

/**
 * A tiny D1 stand-in. It does not implement SQL -- it answers the five queries this module makes,
 * by reading the FIRST table named in the statement and applying the same filters in JavaScript.
 *
 * ⚠️ That means it can only prove the code's SHAPE, never that the SQL is valid D1. The live run at
 * the bottom of this file is what proves the SQL, and it is the reason this file has one.
 */
function fakeDB(opts) {
  const broken = (opts && opts.broken) || {};
  const DB = {
    prepare(sql) {
      const binds = [];
      const api = {
        bind(...v) { binds.push(...v); return api; },
        async all() {
          if (/FROM aby_task/.test(sql)) {
            if (broken.todo) throw new Error("no such table: aby_task");
            const hidesDone = /done_at IS NULL/.test(sql);
            return { results: FIXTURE.aby_task.filter((t) => !hidesDone || t.done_at === null) };
          }
          if (/FROM quotes/.test(sql) && /GROUP BY k/.test(sql)) {
            if (broken.followup) throw new Error("no such column: broker_email");
            const from = binds[0];
            // MIN and MAX are honoured only if the statement asks for them, so swapping one for the
            // other in a sabotage is something this stand-in can actually feel.
            const wantsNewest = /MAX\(created_at\) AS newest/.test(sql);
            const wantsOldestAsNewest = /MIN\(created_at\) AS newest/.test(sql);
            const wantsImported = /AS imported/.test(sql);
            const groups = new Map();
            for (const q of FIXTURE.quotes) {
              if ((q.status || "P") !== "P") continue;
              if (!(q.created_at >= from)) continue;
              const k = String(q.broker_email || q.broker_agency || "?").toLowerCase();
              const g = groups.get(k) || { k, n: 0, oldest: null, latest: null, imported: 0,
                                          who: null, agency: null };
              g.n++;
              if (/^import-/.test(String(q.source_tag || ""))) g.imported++;
              if (!g.oldest || q.created_at < g.oldest) g.oldest = q.created_at;
              if (!g.latest || q.created_at > g.latest) g.latest = q.created_at;
              g.who = q.broker_name || q.broker_agency;
              g.agency = q.broker_agency;
              groups.set(k, g);
            }
            return { results: [...groups.values()].map((g) => ({
              k: g.k, n: g.n, oldest: g.oldest,
              newest: wantsOldestAsNewest ? g.oldest : (wantsNewest ? g.latest : null),
              imported: wantsImported ? g.imported : null,
              who: g.who, agency: g.agency,
            })).sort((a, b) => b.n - a.n) };
          }
          if (/FROM quotes/.test(sql)) {
            if (broken.quote) throw new Error("no such column: effective_date");
            const today = binds[0];
            // Each clause is honoured only if the statement CONTAINS it.
            const wantsPending = /COALESCE\(status,'P'\) = 'P'/.test(sql);
            const wantsShape = /effective_date LIKE '____-__-__'/.test(sql);
            // SQLite's LIKE matches the WHOLE value and `_` is exactly one character, so the
            // pattern admits any ten-character string with dashes in those two places -- which
            // includes "2026-13-45". That is precisely why isoDay runs again in JavaScript.
            const shaped = (v) => { const t = String(v == null ? "" : v);
                                    return t.length === 10 && t[4] === "-" && t[7] === "-"; };
            return { results: FIXTURE.quotes
              .filter((q) => (!wantsPending || (q.status || "P") === "P") &&
                             (!wantsShape || shaped(q.effective_date)) &&
                             String(q.effective_date) >= today)
              .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1)) };
          }
          if (/FROM rfp_opportunity/.test(sql)) {
            if (broken.rfp) throw new Error("no such table: rfp_opportunity");
            return { results: FIXTURE.rfp_opportunity };
          }

          if (/FROM commitments/.test(sql)) {
            if (broken.commitment) throw new Error("no such table: commitments");
            return { results: FIXTURE.commitments };
          }
          throw new Error("the fake database was asked something it does not know: " + sql);
        },
      };
      return api;
    },
  };
  // Shaped like `env`, because that is what abyDatedThings takes. Returning the bare database was
  // the first thing this checker got wrong, and the fixture guard is what said so -- every source
  // reported "cannot read properties of undefined" and every rule would have passed on nothing.
  return { DB };
}

// ── The rules. Defined ONCE, as {name, why, holds}. ───────────────────────────────────────────
// A checker that writes each rule twice -- once to report, once to self-test -- is testing its
// paraphrase; the two copies disagreed on the first run, last time this project tried it.

/** Is this a real calendar day? Written here, on purpose, so no sabotage of the module reaches it. */
function realDay(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ""));
  if (!m) return false;
  const y = +m[1], mo = +m[2], da = +m[3];
  const t = new Date(Date.UTC(y, mo - 1, da));
  return t.getUTCFullYear() === y && t.getUTCMonth() + 1 === mo && t.getUTCDate() === da;
}

function rules(M) {
  const run = (opts) => M.abyDatedThings(fakeDB(opts), { today: TODAY });
  const kinds = (rows) => new Set(rows.map((r) => r.kind));

  return [
    { name: "all five sources reach the list",
      why: "a source that stops being built renders as a shorter list, which nobody can tell from a quiet week",
      async holds() {
        const { rows } = await run();
        const k = kinds(rows);
        return ["todo", "quote", "followup", "rfp", "commitment"].every((x) => k.has(x));
      } },

    { name: "a PROSE effective_date never becomes a dated row",
      why: "1,581 production rows say things like 'Aug 2025 or later', and in SQL they all compare as future",
      async holds() {
        const { rows } = await run();
        return !rows.some((r) => r.kind === "quote" && r.entity === "Old Employer");
      } },

    { name: "every dueOn that is set is a real calendar day",
      why: "the SQL shape test lets 2026-13-45 through, so isoDay has to be the thing that decides",
      async holds() {
        const { rows } = await run();
        // realDay() is the CHECKER's own arithmetic. Asking the module whether the module's output
        // is valid is an assertion that cannot fail.
        return rows.every((r) => r.dueOn === null || realDay(r.dueOn)) &&
               !rows.some((r) => r.entity === "Impossible Date");
      } },

    { name: "a quote that is not Pending contributes nothing",
      why: "a sold quote is not work; showing its effective date puts finished business on a to-do screen",
      async holds() {
        const { rows } = await run();
        return !rows.some((r) => r.entity === "Already Sold");
      } },

    { name: "an RFP somebody PASSED on contributes nothing",
      why: "a passed opportunity is a decision, and re-showing its deadline reverses it silently",
      async holds() {
        const { rows } = await run();
        return !rows.some((r) => r.kind === "rfp" && r.entity === "Somewhere ISD");
      } },

    { name: "an RFP contributes all three of its dates",
      why: "the close date is not the only deadline -- questions close first, and a mandatory meeting is a hard gate",
      async holds() {
        const { rows } = await run();
        const r1 = rows.filter((r) => r.kind === "rfp" && r.entity === "City of Bonham");
        return r1.length === 3 && r1.some((r) => r.title.indexOf("MANDATORY") !== -1);
      } },

    { name: "a done to-do is absent entirely",
      why: "a ticked item that lingers is the thing that makes people stop ticking",
      async holds() {
        const { rows } = await run();
        return !rows.some((r) => r.title === "This one is finished");
      } },

    { name: "an undated to-do is in the list, with days === null",
      why: "no date is a REAL answer; dropping it loses work and inventing one files it under a day it does not belong to",
      async holds() {
        const { rows } = await run();
        const t = rows.find((r) => r.id === "t4");
        return !!t && t.dueOn === null && t.days === null;
      } },

    { name: "an undated row uses null, never a large-number sentinel",
      why: "a sentinel sorts, compares and prints like a date, so it is a wrong answer rather than a missing one",
      async holds() {
        const { rows } = await run();
        return rows.every((r) => r.days === null || Math.abs(r.days) < 40000);
      } },

    { name: "follow-ups roll up per broker and carry the count",
      why: "the action is one phone call; 130 pending quotes as 130 rows is the wall this screen exists to avoid",
      async holds() {
        const { rows } = await run();
        const f = rows.filter((r) => r.kind === "followup");
        const ken = f.find((r) => r.id === "ken@blumberg.com");
        // Three brokers in the window; Ken stands for two quotes on his own. The COUNT is the half
        // that matters -- a roll-up that loses it hides work rather than summarising it.
        return f.length === 3 && !!ken && ken.count === 2;
      } },

    { name: "a broker quoted yesterday is not chased YET -- the row is future-dated, not overdue",
      why: "chasing a quote sent yesterday is noise, and noise is what makes a list stop being read",
      async holds() {
        const { rows } = await run();
        const fresh = rows.find((r) => r.kind === "followup" && r.id === "new@fresh.com");
        return !!fresh && fresh.days === 13;
      } },

    { name: "the chase is dated off the NEWEST quote to that broker, not the oldest",
      why: "the oldest anchor makes the broker you are working with hardest look the most neglected -- on the live book it put 14 rows more than two months late instead of 4",
      async holds() {
        const { rows } = await run();
        const ken = rows.find((r) => r.kind === "followup" && r.id === "ken@blumberg.com");
        // Ken's quotes are 36 and 34 days old. Newest plus fourteen is twenty days ago; the oldest
        // anchor would say twenty-two.
        return !!ken && ken.days === -20 && ken.note.indexOf("newest") === 0;
      } },

    { name: "a follow-up says how many of its quotes came from the spreadsheet",
      why: "Pending on an imported row means either 'still open' or 'nobody wrote the outcome down', and 122 of the 130 in the live window are imported -- a row that hides that has somebody ringing a broker about a quote settled in June",
      async holds() {
        const { rows, followupSource } = await run();
        const ken = rows.find((r) => r.kind === "followup" && r.id === "ken@blumberg.com");
        // Jane's two in-window quotes were run through the tool, Ken's two came from the
        // spreadsheet. A fixture where every row is the same kind cannot tell a report of the
        // SPLIT from a report of the total.
        const jane = rows.find((r) => r.kind === "followup" && r.id === "jane@acme.com");
        return !!ken && ken.imported === 2 && ken.note.indexOf("quote spreadsheet") !== -1 &&
               !!jane && jane.imported === 0 && jane.note.indexOf("spreadsheet") === -1 &&
               !!followupSource && followupSource.imported === 2 && followupSource.total > 2;
      } },

    { name: "a quote older than the window is not a follow-up any more",
      why: "without the bound this is 5,977 rows -- every row of a fifteen-year back catalogue is 'P'",
      async holds() {
        const { rows } = await run();
        return !rows.some((r) => r.kind === "followup" && r.id === "old@old.com");
      } },

    { name: "an overdue row has negative days",
      why: "the whole screen turns on this sign; get it wrong and late work sorts as future work",
      async holds() {
        const { rows } = await run();
        const t = rows.find((r) => r.id === "t1");
        return !!t && t.days === -9;
      } },

    { name: "a source that CANNOT be read is reported, not silently absent",
      why: "a missing source looks exactly like a quiet week, and the screen would say nothing is due",
      async holds() {
        const { rows, problems } = await run({ broken: { rfp: true } });
        return problems.some((p) => p.source === "rfp") && !kinds(rows).has("rfp");
      } },

    { name: "every key is unique",
      why: "two rows sharing a key is a tick that lands on the wrong item",
      async holds() {
        const { rows } = await run();
        return new Set(rows.map((r) => r.key)).size === rows.length;
      } },

    { name: "the owner vocabulary is exactly '', eric, niels",
      why: "a value spelled a fourth way does not fail -- it becomes a row no filter can ever show again",
      async holds() {
        return M.abyOwner("eric") === "eric" && M.abyOwner("NIELS") === "niels" &&
               M.abyOwner("") === "" && M.abyOwner("Eric Johnson") === null &&
               M.abyOwner("sara") === null;
      } },

    { name: "a date is not shifted by the timezone the server happens to be in",
      why: "new Date of a bare 2026-03-01 is the 28th of February in a US timezone, moving every due date by a day",
      async holds() {
        return M.daysBetween("2026-02-28", "2026-03-01") === 1 &&
               M.daysBetween("2026-03-01", "2026-02-28") === -1 &&
               M.addDays("2026-02-28", 1) === "2026-03-01" &&
               M.isoDay("2026-02-30") === null;
      } },

    // ── The page ───────────────────────────────────────────────────────────────────────────────

    { name: "a folded month is force-opened when it holds a late row",
      why: "the argument that it cannot happen was made on the dashboard, was correct-sounding, and the guard fired for three months on the first real run",
      async holds() {
        M.setOpen({}); M.setToday("2028-01-01");
        // Five months of near work first, so the late one is the SIXTH key and sits well inside
        // the folded region. Anything closer than the fourth month opens regardless, and a fixture
        // that never reaches the fold proves nothing about it.
        //
        // AND THE LATE ROW CARRIES A POSITIVE `days` ON PURPOSE. Every row with a negative days is
        // lifted into the Late block before the grid exists, so a row shaped that way can never
        // test the fold. What CAN reach it is a row whose date has passed while its arithmetic has
        // not caught up -- a payload built yesterday, a page left open overnight -- and that is the
        // row a fold would swallow.
        const rows = ["2027-05-10", "2027-06-10", "2027-07-10", "2027-08-10", "2027-09-10"]
          .map((dt, i) => ({ key: "n" + i, kind: "todo", id: "n" + i, title: "Near " + i,
                             entity: "", owner: "", note: "", dueOn: dt, days: 40 + i * 30 }));
        // Every one of these dates has passed by the time TODAY_STR says it is, while every `days`
        // still reads positive -- a payload built long ago against a page nobody reloaded.
        rows.push({ key: "x", kind: "todo", id: "x", title: "Late filing", entity: "", owner: "",
                    note: "", dueOn: "2027-12-01", days: 244 });
        const html = M.renderMonth(rows);
        M.setToday("");
        return html.indexOf("Late filing") !== -1;
      } },

    { name: "a folded month notices a date that has passed even when the arithmetic has not",
      why: "days is computed when the payload is built; dueOn is the fact, and after midnight the two disagree",
      async holds() {
        M.setOpen({}); M.setToday("2028-01-01");
        const rows = ["2027-05-10", "2027-06-10", "2027-07-10", "2027-08-10", "2027-09-10"]
          .map((dt, i) => ({ key: "n" + i, kind: "todo", id: "n" + i, title: "Near " + i,
                             entity: "", owner: "", note: "", dueOn: dt, days: 40 + i * 30 }));
        // Every one of these dates has passed by the time TODAY_STR says it is, while every `days`
        // still reads positive -- a payload built long ago against a page nobody reloaded.
        rows.push({ key: "x", kind: "todo", id: "x", title: "Stale row", entity: "", owner: "",
                    note: "", dueOn: "2027-12-01", days: 244 });
        const html = M.renderMonth(rows);
        M.setToday("");
        return html.indexOf("Stale row") !== -1 && html.indexOf("still open from earlier") !== -1;
      } },

    { name: "a folded month says what is inside it",
      why: "a fold labelled only 'March' is a fold that hides; the count and the kinds are what make it safe to close",
      async holds() {
        M.setOpen({});
        const rows = [];
        for (let i = 0; i < 6; i++) {
          rows.push({ key: "m" + i, kind: "todo", id: "m" + i, title: "Thing " + i, entity: "",
                      owner: "", note: "", dueOn: "2027-0" + (i + 1) + "-15", days: 150 + i * 30 });
        }
        const html = M.renderMonth(rows);
        return html.indexOf("class=\"inside\"") !== -1;
      } },

    { name: "rows past 90 days are counted and named, never silently cut",
      why: "a list that stops without saying so reads as a complete list",
      async holds() {
        const html = M.renderDue([
          { key: "f", kind: "todo", id: "f", title: "Far away", entity: "", owner: "", note: "",
            dueOn: "2027-06-01", days: 280 },
        ]);
        return html.indexOf("further than 90 days out") !== -1 && html.indexOf("1 more") !== -1;
      } },

    { name: "an undated row has a home in BOTH lenses",
      why: "a calendar has nowhere to put it, which is exactly how an undated to-do disappears",
      async holds() {
        const r = [{ key: "u", kind: "todo", id: "u", title: "Undated thing", entity: "", owner: "",
                     note: "", dueOn: null, days: null }];
        M.setOpen({});
        return M.renderDue(r).indexOf("Undated thing") !== -1 &&
               M.renderMonth(r).indexOf("Undated thing") !== -1;
      } },

    { name: "a row's text is escaped before it reaches the page",
      why: "client names and agency names are typed by people, and one of them will contain a bracket",
      async holds() {
        const html = M.rowHTML({ key: "x", kind: "todo", id: "x",
          title: "<img src=x onerror=boom>", entity: "A & B", owner: "eric", note: "",
          dueOn: "2026-09-01", days: 7 });
        // Needled for a RAW tag, not for the word onerror: escaping leaves that word in the text.
        return html.indexOf("<img") === -1 && html.indexOf("&amp;") !== -1;
      } },
  ];
}

// ── The fixture must be able to fail ──────────────────────────────────────────────────────────

async function assertFixtureIsNotVacuous(M) {
  const { rows, counts, problems } = await M.abyDatedThings(fakeDB(), { today: TODAY });
  const empties = Object.keys(counts).filter((k) => !counts[k]);
  const dated = rows.filter((r) => r.dueOn !== null);
  const late = rows.filter((r) => r.days !== null && r.days < 0);
  const undated = rows.filter((r) => r.dueOn === null);
  const bad = [];
  if (problems.length) bad.push("the fixture made a source throw: " + JSON.stringify(problems));
  if (empties.length) bad.push("these sources produced NOTHING: " + empties.join(", "));
  if (dated.length < 8) bad.push("only " + dated.length + " dated rows");
  if (!late.length) bad.push("no OVERDUE row, so the sign of `days` is never exercised");
  if (!undated.length) bad.push("no UNDATED row, so null is never exercised");
  if (bad.length) {
    console.log("\n  FIXTURE FAILURE -- the rules below would have passed on nothing:");
    for (const b of bad) console.log("    * " + b);
    console.log("  A fixture that produces nothing to test is a fixture failure, never a pass.\n");
    process.exit(2);
  }
  return { rows, counts, dated: dated.length, late: late.length, undated: undated.length };
}

// ── Sabotages. Each must redden the rule it is paired with. ───────────────────────────────────
// Every entry asserts its own substitution MATCHED, so a later reformat cannot turn a sabotage into
// a silent no-op that reports itself green.

const SABOTAGE = [
  ["all five sources reach the list",
   (s) => s.replace("    for (const c of (r.results || [])) {", "    for (const c of []) {")],
  // The LIKE is the first line of defence and the one that keeps 1,581 prose rows out of the
  // query at all. Removing it is the edit somebody makes while "simplifying" the statement.
  // TWO INDEPENDENT GUARDS KEEP PROSE OUT -- the SQL shape test and isoDay -- and each one alone
  // is enough, which is why breaking either on its own left the rule green. That is the design
  // working; it just means the sabotage has to remove both to prove the rule is load-bearing.
  ["a PROSE effective_date never becomes a dated row",
   (s) => s.replace("AND effective_date LIKE '____-__-__' ", "")
           .replace("      const due = isoDay(q.effective_date);\n      if (!due) continue;",
                    "      const due = String(q.effective_date).slice(0, 10);\n      if (!due) continue;")],
  // The round trip is what refuses 2026-02-30: the range test cannot, because February has 31
  // days as far as a range test is concerned.
  ["every dueOn that is set is a real calendar day",
   (s) => s.replace("  const back = new Date(Date.UTC(y, m - 1, d));\n" +
                    "  if (back.getUTCFullYear() !== y || back.getUTCMonth() + 1 !== m || back.getUTCDate() !== d) return null;",
                    "")],
  ["a quote that is not Pending contributes nothing",
   (s) => s.replace("WHERE COALESCE(status,'P') = 'P' AND effective_date LIKE", "WHERE effective_date LIKE")],
  ["an RFP somebody PASSED on contributes nothing",
   (s) => s.replace("      if (String(o.disposition || '') === 'pass') continue;", "")],
  ["an RFP contributes all three of its dates",
   (s) => s.replace("        ['questions', o.questions_due_at, 'Questions due'],", "")],
  ["a done to-do is absent entirely",
   (s) => s.replace('"FROM aby_task WHERE done_at IS NULL ORDER BY', '"FROM aby_task WHERE 1=1 ORDER BY')],
  ["an undated to-do is in the list, with days === null",
   (s) => s.replace("      const due = isoDay(t.due_on);", "      const due = isoDay(t.due_on);\n      if (!due) continue;")],
  ["an undated row uses null, never a large-number sentinel",
   (s) => s.replace("        days: due ? daysBetween(today, due) : null,\n      });\n      counts.todo++;",
                    "        days: due ? daysBetween(today, due) : 99999,\n      });\n      counts.todo++;")],
  ["follow-ups roll up per broker and carry the count",
   (s) => s.replace('"GROUP BY k ORDER BY n DESC"', '"ORDER BY n DESC"')],
  ["a broker quoted yesterday is not chased YET -- the row is future-dated, not overdue",
   (s) => s.replace("const FOLLOWUP_AFTER_DAYS = 14;", "const FOLLOWUP_AFTER_DAYS = 0;")],
  ["a follow-up says how many of its quotes came from the spreadsheet",
   (s) => s.replace("\"SUM(CASE WHEN COALESCE(source_tag,'') LIKE 'import-%' THEN 1 ELSE 0 END) AS imported, \" +", "")],
  ["the chase is dated off the NEWEST quote to that broker, not the oldest",
   (s) => s.replace("\"COUNT(*) AS n, MAX(created_at) AS newest, MIN(created_at) AS oldest, \" +",
                    "\"COUNT(*) AS n, MIN(created_at) AS newest, MIN(created_at) AS oldest, \" +")],
  ["a quote older than the window is not a follow-up any more",
   (s) => s.replace("const FOLLOWUP_UNTIL_DAYS = 90;", "const FOLLOWUP_UNTIL_DAYS = 9000;")],
  ["an overdue row has negative days",
   (s) => s.replace("  return Math.round((tb - ta) / 86400000);", "  return Math.abs(Math.round((tb - ta) / 86400000));")],
  ["a source that CANNOT be read is reported, not silently absent",
   (s) => s.replace("    problems.push({ source: 'rfp', error: String((e && e.message) || e) });", "")],
  ["every key is unique",
   (s) => s.replace("        key: 'rfp:' + o.id + ':' + slot[0],", "        key: 'rfp:' + o.id,")],
  ["the owner vocabulary is exactly '', eric, niels",
   (s) => s.replace("  if (s === '' || s === 'eric' || s === 'niels') return s;\n  return null;", "  return s;")],
  ["a date is not shifted by the timezone the server happens to be in",
   (s) => s.replace("  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));",
                    "  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) + 64800000;")],
  ["a folded month is force-opened when it holds a late row",
   (s) => s.replace("     var open = OPEN[k]!==undefined ? OPEN[k] : (i<3 || hasLate);",
                    "     var open = OPEN[k]!==undefined ? OPEN[k] : (i<3);")],
  // Breaking the guard the OTHER way: leave the force-open in place and blind the thing that feeds
  // it. A guard is only as good as the question it asks.
  ["a folded month notices a date that has passed even when the arithmetic has not",
   (s) => s.replace("       return !!(TODAY_STR&&r.dueOn&&r.dueOn<TODAY_STR);", "       return false;")],
  ["a folded month says what is inside it",
   (s) => s.replace("        (open?'':'<span class=\"inside\">'+esc(inside)+'</span>')+", "")],
  ["rows past 90 days are counted and named, never silently cut",
   (s) => s.replace("   if(far.length) h+='<p class=\"muted\" style=\"margin:4px 2px 18px\">'+far.length+", "   if(false) h+='<p class=\"muted\">'+far.length+")],
  ["an undated row has a home in BOTH lenses",
   (s) => s.replace("   if(un.length) h+=sect('No date yet',un);\n   if(!keys.length", "   if(false) h+=sect('No date yet',un);\n   if(!keys.length")],
  ["a row's text is escaped before it reaches the page",
   (s) => s.replace("   h+='<div class=\"what\">'+esc(r.title)+'<span class=\"tag t-'+esc(r.kind)+'\">'",
                    "   h+='<div class=\"what\">'+r.title+'<span class=\"tag t-'+esc(r.kind)+'\">'")],
];

// ── Run ───────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const M = await loadModule(null);
  const stats = await assertFixtureIsNotVacuous(M);

  console.log("\nFIXTURE  " + stats.rows.length + " rows -- " +
    Object.entries(stats.counts).map(([k, v]) => v + " " + k).join(", ") +
    "  (" + stats.dated + " dated, " + stats.late + " late, " + stats.undated + " undated)\n");

  const list = rules(M);
  let bad = 0;
  for (const r of list) {
    let ok = false, err = "";
    try { ok = await r.holds(); } catch (e) { err = String((e && e.message) || e); }
    if (!ok) { bad++; console.log("  FAIL  " + r.name + (err ? "  [" + err + "]" : "")); console.log("        " + r.why); }
    else console.log("  ok    " + r.name);
  }

  if (!SELFTEST) {
    console.log(bad ? "\n" + bad + " rule(s) failed.\n" : "\n" + list.length + " rules pass.\n");
    process.exit(bad ? 1 : 0);
  }

  // ── SELF-TEST ───────────────────────────────────────────────────────────────────────────────
  console.log("\nSELF-TEST -- breaking each rule on purpose. Every one must go red.\n");
  const covered = new Set(SABOTAGE.map(([n]) => n));
  const uncovered = list.filter((r) => !covered.has(r.name)).map((r) => r.name);
  if (uncovered.length) {
    console.log("  UNPROVEN RULES -- nothing shows these can fail:");
    for (const n of uncovered) console.log("    * " + n);
    bad += uncovered.length;
  }

  for (const [name, mutate] of SABOTAGE) {
    const before = SRC_RAW;
    const after = mutate(before);
    // A sabotage that changed nothing reports itself as a passing test of nothing.
    if (after === before) { console.log("  NO-OP " + name + "  -- the sabotage matched nothing"); bad++; continue; }
    let red = false, note = "";
    try {
      const M2 = await loadModule(mutate);
      const r2 = rules(M2).find((r) => r.name === name);
      try { red = !(await r2.holds()); } catch (e) { red = true; note = "threw"; }
    } catch (e) { red = true; note = "would not even load"; }
    if (red) console.log("  RED   " + name + (note ? "  (" + note + ")" : ""));
    else { console.log("  GREEN " + name + "  -- THE RULE DID NOT NOTICE"); bad++; }
  }

  console.log(bad ? "\n" + bad + " problem(s).\n"
                  : "\nself-test OK -- " + SABOTAGE.length + " sabotages, all reddened their rule.\n");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
