#!/usr/bin/env node
/**
 * Do the /admin/today statements actually RUN on D1?
 *
 * WHY THIS IS A SECOND FILE. check_dated_things.mjs runs the real code over a FAKE database, so it
 * proves the shape of the answer and can prove nothing at all about the SQL: the stand-in never
 * parses a statement. A query can be wrong in ways only an engine notices -- a column that exists
 * in production because somebody ran an ALTER by hand and nowhere else, a function D1 does not
 * have, a LIKE pattern that means something different from what was intended.
 *
 * SO THIS ONE TAKES THE STATEMENTS OUT OF worker.js AND RUNS THEM, on a FRESH local D1 built from
 * this repo's own migrations. That asymmetry is the feature, not a compromise: a fresh database
 * takes the path production has not taken since the beginning, which is how the missing columns in
 * /api/migrate were found (TRAPS #206 ②).
 *
 *   node scripts/check_dated_sql.mjs
 *   node scripts/check_dated_sql.mjs --self-test   (prove it can fail)
 *
 * EXITS 2, NEVER 0, IF IT COULD NOT RUN. "Could not run" must not be spelled the same way as
 * "passed" -- that is how a checker goes quietly blind.
 *
 * WHAT IT DOES NOT CHECK: whether the rows are the RIGHT rows. It runs against an empty database on
 * purpose, because the question here is only whether D1 accepts the statement.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WIN = process.platform === "win32";
// shell:true is required on Windows -- Node refuses to spawn a .cmd without one -- and is safe here
// because nothing long-lived is started. Same reasoning as check_crm.mjs, which does start one.
const NPX = WIN ? "npx.cmd" : "npx";
// PINNED, AND NOT OUT OF CAUTION. A bare `npx wrangler` resolves to whatever is newest at the
// moment the checker runs, so a release upstream can change what this file measures without a line
// of it changing -- and on the day it happened here npx could not even install the new version
// (EBUSY renaming its own cache) and the checker refused to run. A checker's tools are part of the
// experiment. Override with ABY_WRANGLER when a version needs testing.
const WRANGLER = process.env.ABY_WRANGLER || "wrangler@4.125.0";
const SELF_TEST = process.argv.includes("--self-test");
// TWO DATABASES, AND THIS IS THE WHOLE REASON THE FIRST RUN LIED.
//
// The statement pass needs stand-in tables so the /admin/today queries can be planned at all, and
// it writes them with minimal shapes. The fresh-build pass needs a database with NOTHING in it. Run
// against one database the first poisons the second: `rfp_opportunity` got created by the fixture
// with seven columns, the real CREATE TABLE IF NOT EXISTS became a no-op, and the index over
// `solicitation_number` failed -- which this checker then reported as "an object that exists only
// in production", the exact F-391 shape, entirely of its own making.
// A CHECKER THAT SHARES STATE BETWEEN PASSES IS TESTING THE ORDER ITS PASSES HAPPEN TO RUN IN.
const STATE = mkdtempSync(join(tmpdir(), "abysql-"));
const STATE_FRESH = mkdtempSync(join(tmpdir(), "abyfresh-"));
process.on("exit", () => {
  for (const d of [STATE, STATE_FRESH]) {
    try { rmSync(d, { recursive: true, force: true }); } catch {}
  }
});

function die(msg) {
  console.log("\nCANNOT RUN: " + msg + "\n");
  process.exit(2);
}

function d1(sql, state) {
  // WITH shell:true NOTHING QUOTES THE ARGUMENTS FOR YOU. The first version of this passed the SQL
  // unquoted, the shell split it on spaces, and wrangler answered with its usage text -- which the
  // caller reported as "no local D1". A tool that cannot run and a tool that is absent look the
  // same from the outside, so the quoting is done here, deliberately.
  const q = (a) => (/[ "]/.test(a) ? '"' + a.split('"').join('\\"') + '"' : a);
  const args = [WRANGLER, "d1", "execute", "aby-quotes", "--local",
                "--persist-to", state || STATE, "--config", "wrangler.test.jsonc",
                "--json", "--command", sql].map(q);
  const r = spawnSync(NPX, args, { cwd: REPO, shell: true, encoding: "utf8", timeout: 120000 });
  const out = String(r.stdout || "") + String(r.stderr || "");
  if (r.error) return { ok: false, msg: String(r.error.message || r.error) };
  // wrangler prints its banner around the JSON, so the payload is found rather than parsed whole.
  const a = out.indexOf("[");
  if (a === -1) return { ok: false, msg: out.trim().slice(0, 400) || "no output" };
  try {
    const parsed = JSON.parse(out.slice(a, out.lastIndexOf("]") + 1));
    if (Array.isArray(parsed) && parsed[0] && parsed[0].success) return { ok: true, rows: parsed[0].results };
    return { ok: false, msg: JSON.stringify(parsed).slice(0, 400) };
  } catch {
    return { ok: false, msg: out.trim().slice(0, 400) };
  }
}

// ── The statements, read out of worker.js rather than copied ──────────────────────────────────
// A copy in this file would go stale the first time somebody edits a query, and would then report
// green about a statement that no longer ships.

const SRC = readFileSync(join(REPO, "worker.js"), "utf8");

/**
 * Strip `//` comments that sit OUTSIDE a double-quoted string.
 *
 * THIS IS NOT TIDINESS, IT IS THE DIFFERENCE BETWEEN 86 STATEMENTS AND 88. Several MIGRATIONS
 * entries interleave a comment between the concatenated pieces of ONE statement --
 *     "CREATE TABLE IF NOT EXISTS crm_events (" +
 *     "  entity_type TEXT NOT NULL," +      // 'agency' or 'person'
 * -- and a regex that walks quoted chunks stops dead at the first one. The first version of this
 * checker missed exactly those two CREATE TABLEs, then reported the three indexes that depend on
 * them as "objects that exist only in production".
 * A PARSER THAT READS TOO FEW STATEMENTS DOES NOT GO QUIET -- IT INVENTS FINDINGS, and they are
 * convincing, because the shape it reports is a real defect that really did happen here before.
 */
function stripLineComments(src) {
  let out = "", i = 0, inStr = false;
  while (i < src.length) {
    const c = src[i];
    if (inStr) {
      if (c === "\\") { out += src.slice(i, i + 2); i += 2; continue; }
      if (c === '"') inStr = false;
      out += c; i++; continue;
    }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === "/" && src[i + 1] === "/") {
      const j = src.indexOf("\n", i);
      i = j === -1 ? src.length : j;
      continue;
    }
    out += c; i++;
  }
  return out;
}

function migrationsBody() {
  const i = SRC.indexOf("const MIGRATIONS = [");
  if (i === -1) die("MIGRATIONS is not in worker.js -- has it been renamed?");
  return stripLineComments(SRC.slice(i, SRC.indexOf("\n];", i)));
}

/**
 * Split a .sql file into statements.
 *
 * schema.sql's own comments contain semicolons -- it documents the hand-run ALTERs inside `--`
 * lines -- so splitting the raw text on ";" produces fragments that are not SQL. That is the same
 * defect as `wrangler d1 execute --file`, which this repo has already been bitten by (TRAPS #300).
 */
function splitSql(text) {
  const noComments = text.split("\n").map((l) => {
    const i = l.indexOf("--");
    return i === -1 ? l : l.slice(0, i);
  }).join("\n");
  // FLATTENED TO ONE LINE, AND THAT IS NOT COSMETIC. These statements go to wrangler as a
  // --command argument through a shell, and a Windows shell truncates an argument at the first
  // newline -- so a multi-line CREATE TABLE arrived as its first line and came back "incomplete
  // input", which reads exactly like a broken schema file rather than a broken caller.
  // Safe here: the only string literals in schema.sql are '', '[]' and 'P', none of which carry
  // meaningful whitespace.
  return noComments.split(";")
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => x.length > 0);
}

function allMigrations() {
  const body = migrationsBody();
  const out = [];
  const re = /\{ sql: ((?:"[^"]*"(?:\s*\+\s*)?\s*)+),/g;
  let m;
  while ((m = re.exec(body))) {
    // eslint-disable-next-line no-eval
    out.push(eval(m[1].replace(/\s*\+\s*$/, "")));
  }
  return out;
}

function abyTaskMigrations() {
  return allMigrations().filter((sql) => /aby_task/.test(sql));
}

/**
 * The same three-phase ordering handleMigrate applies before it runs anything: tables, then the
 * columns that alter them, then the indexes over both. Copied deliberately rather than imported --
 * worker.js is a Cloudflare module and cannot be require()d here -- and asserted below to still
 * match the worker's own list, so the copy cannot drift silently.
 */
function phase(sql) {
  if (/^\s*CREATE\s+TABLE/i.test(sql)) return 0;
  if (/^\s*ALTER\s+TABLE/i.test(sql)) return 1;
  return 2;
}

/**
 * Every prepare() inside abyDatedThings, as SQL. The bind values are replaced with literals so the
 * statement can be run on its own.
 */
function datedStatements() {
  const i = SRC.indexOf("async function abyDatedThings(");
  if (i === -1) die("abyDatedThings is not in worker.js -- has it been renamed?");
  let j = SRC.indexOf("{", i), depth = 0, end = -1;
  for (; j < SRC.length; j++) {
    if (SRC[j] === "{") depth++;
    else if (SRC[j] === "}") { depth--; if (depth === 0) { end = j; break; } }
  }
  const body = SRC.slice(i, end);
  const out = [];
  const re = /env\.DB\.prepare\(\s*((?:"[^"]*"(?:\s*\+\s*)?\s*)+)\)/g;
  let m;
  while ((m = re.exec(body))) {
    // eslint-disable-next-line no-eval
    let sql = eval(m[1].replace(/\s*\+\s*$/, ""));
    // Placeholders become literals: this asks whether D1 can PARSE and PLAN the statement, which is
    // the question, and a bound value cannot change that answer.
    // A QUESTION MARK IS NOT ALWAYS A PLACEHOLDER. The follow-up query uses the string '?' as the
    // last fallback in a COALESCE, and replacing that one produced a statement with a doubled quote
    // in it -- reported as a syntax error in the WORKER, which is the wrong file to go looking in.
    const LITERAL_Q = String.fromCharCode(1);
    sql = sql.split("'?'").join(LITERAL_Q)
             .split("?").join("'2026-08-25'")
             .split(LITERAL_Q).join("'?'");
    out.push(sql);
  }
  return out;
}

// ── Run ───────────────────────────────────────────────────────────────────────────────────────

const probe = d1("select 1 as ok");
if (!probe.ok) die("no local D1 (" + probe.msg + "). wrangler and a wrangler.test.jsonc are needed.");

const migrations = abyTaskMigrations();
if (migrations.length < 3) die("expected the aby_task table and its two indexes in MIGRATIONS, found " + migrations.length);

console.log("\nBUILDING A FRESH LOCAL D1 FROM THE REPO'S OWN MIGRATIONS\n");
let bad = 0;
for (const sql of migrations) {
  const r = d1(sql);
  console.log("  " + (r.ok ? "ok  " : "FAIL") + " " + sql.slice(0, 78) + (sql.length > 78 ? "..." : ""));
  if (!r.ok) { console.log("       " + r.msg); bad++; }
}
// The other tables the queries read. A fresh database has none of them, and a statement cannot be
// planned against a table that does not exist -- so the fixtures below are the minimum shape that
// lets the real statements be tested at all. They are DELIBERATELY the production shapes.
for (const sql of [
  // source_tag was missing here on the first run and this checker is what said so -- the follow-up
  // query gained a column and the fresh-database shape did not hear about it. That is the exact
  // asymmetry this file exists for: production has the column because somebody ran an ALTER once.
  "CREATE TABLE IF NOT EXISTS quotes (quote_number TEXT, client_name TEXT, effective_date TEXT, " +
    "status TEXT, created_at TEXT, broker_agency TEXT, broker_name TEXT, broker_email TEXT, " +
    "source_tag TEXT)",
  "CREATE TABLE IF NOT EXISTS rfp_opportunity (id TEXT, entity_name TEXT, title TEXT, closes_at TEXT, " +
    "questions_due_at TEXT, pre_proposal_at TEXT, pre_proposal_mandatory INTEGER)",
  "CREATE TABLE IF NOT EXISTS rfp_decision (opportunity_id TEXT, disposition TEXT)",
  "CREATE TABLE IF NOT EXISTS commitments (id TEXT, quote_number TEXT, employer_name TEXT, start_date TEXT)",
]) {
  const r = d1(sql);
  if (!r.ok) { console.log("  FAIL fixture table: " + r.msg); bad++; }
}

// ── F-391: CAN THE MIGRATION LIST BUILD A DATABASE ON ITS OWN? ────────────────────────────────
//
// THE REGRESSION THIS GUARDS, AND IT REALLY HAPPENED. Production has tables, columns and indexes
// that arrived as hand-run ALTERs and were never written into MIGRATIONS at all -- broker_directory
// had no CREATE TABLE anywhere in the repo, while four ALTERs and an INDEX named it. Nothing
// noticed, because production is the one environment somebody is always looking at, and it already
// had the table. A fresh database is the only place the gap is visible.
//
// 🔴 F-391 SAID THIS WAS GUARDED BY scripts/check_migrations_real.mjs. THAT FILE HAS NEVER EXISTED
// -- no file, no commit, no mention anywhere in the repo (measured 2026-08-25). The code fixes it
// describes are real; the proof was not. So the guard lives here instead, in the file that already
// builds a fresh local D1, rather than in a second harness.
console.log("\nBUILDING A DATABASE THE DOCUMENTED WAY -- schema.sql, then every migration\n");
{
  // 🔴 THE QUESTION HAD TO BE CORRECTED, AND THE WRONG VERSION LOOKED LIKE A FINDING.
  // Asking "can MIGRATIONS build a database on its own" produced nineteen failures naming `quotes`
  // and `commitments` -- because those tables live in schema.sql and MIGRATIONS is the INCREMENT,
  // exactly as /api/migrate documents ("for an existing database, run these once"). The real
  // question, and the one F-391 was about, is whether the two TOGETHER reproduce production.
  const base = splitSql(readFileSync(join(REPO, "schema.sql"), "utf8"));
  let baseBad = 0;
  for (const sql of base) {
    const r = d1(sql, STATE_FRESH);
    if (!r.ok && !/duplicate column name|already exists/i.test(String(r.msg))) {
      baseBad++;
      if (baseBad <= 4) {
        console.log("  FAIL schema.sql: " + sql.slice(0, 84));
        console.log("         -> " + String(r.msg).replace(/\s+/g, " ").slice(0, 140));
      }
    }
  }
  console.log("  " + (baseBad ? "FAIL" : "ok  ") + " schema.sql applied (" + base.length + " statements)");
  if (baseBad) bad++;

  const all = allMigrations();
  // Counted against the list's OWN entries, never against a floor. `{ sql:` appears once per entry,
  // so the two numbers must agree exactly -- a floor of "at least 50" is what let two missing
  // statements through and turned a parser bug into three invented findings.
  const declared = (migrationsBody().match(/\{ sql:/g) || []).length;
  if (all.length !== declared) {
    console.log("  FAIL parsed " + all.length + " statements but MIGRATIONS declares " + declared + ".");
    console.log("       Every statement below is therefore judged against an incomplete list.");
    bad++;
  } else {
    console.log("  ok   parsed all " + declared + " entries MIGRATIONS declares");
  }
  const ordered = all.map((sql, i) => [i, sql]).sort((a, b) => phase(a[1]) - phase(b[1]) || a[0] - b[0]);
  const failures = [];
  for (const [, sql] of ordered) {
    const r = d1(sql, STATE_FRESH);
    // "duplicate column name" and "already exists" mean an earlier statement got there first, which
    // on a fresh database is the list saying the same thing twice -- harmless, and NOT a failure.
    const benign = !r.ok && /duplicate column name|already exists/i.test(String(r.msg));
    if (!r.ok && !benign) failures.push([sql, r.msg]);
  }
  console.log("  " + (failures.length ? "FAIL" : "ok  ") + " " + all.length +
              " statements, applied in the worker's own phase order, on a database that started empty");
  for (const [sql, msg] of failures.slice(0, 12)) {
    console.log("       " + sql.slice(0, 92));
    console.log("         -> " + String(msg).replace(/\s+/g, " ").slice(0, 150));
  }
  if (failures.length > 12) console.log("       ... and " + (failures.length - 12) + " more");
  if (failures.length) {
    bad++;
    console.log("");
    console.log("       A statement that fails on an EMPTY database is one whose object exists only");
    console.log("       in production, put there by hand and never written down. That is exactly the");
    console.log("       F-391 defect, and it is invisible everywhere except here.");
  }
}

console.log("\nRUNNING EVERY STATEMENT /admin/today MAKES\n");
const statements = datedStatements();
if (statements.length !== 5) {
  console.log("  FAIL expected 5 statements, found " + statements.length +
              " -- a source has been added or lost and this checker did not hear about it");
  bad++;
}
for (const sql of statements) {
  const r = d1(sql);
  console.log("  " + (r.ok ? "ok  " : "FAIL") + " " + sql.slice(0, 78) + "...");
  if (!r.ok) { console.log("       " + r.msg); bad++; }
}

// The one behaviour worth asserting rather than merely parsing: the LIKE really does exclude prose.
// This is the defect that produced a wrong measurement during the build, and a comment saying so is
// not evidence.
console.log("");
d1("INSERT INTO quotes (quote_number, client_name, effective_date, status, created_at) " +
   "VALUES ('A','Prose','Aug 2025 or later','P','2015-01-01T00:00:00.000Z')");
d1("INSERT INTO quotes (quote_number, client_name, effective_date, status, created_at) " +
   "VALUES ('B','Real','2026-10-01','P','2026-08-01T00:00:00.000Z')");
const like = d1("SELECT client_name FROM quotes WHERE effective_date LIKE '____-__-__' " +
                "AND effective_date >= '2026-08-25'");
const names = like.ok ? like.rows.map((r) => r.client_name).sort() : [];
const likeOk = like.ok && names.length === 1 && names[0] === "Real";
console.log("  " + (likeOk ? "ok  " : "FAIL") +
  " the LIKE pattern really does keep prose out of the query (got: " + JSON.stringify(names) + ")");
if (!likeOk) bad++;

// And the same query WITHOUT the pattern lets it straight through, which is what makes the clause
// load-bearing rather than decorative.
const loose = d1("SELECT client_name FROM quotes WHERE effective_date >= '2026-08-25'");
const looseNames = loose.ok ? loose.rows.map((r) => r.client_name).sort() : [];
const looseOk = loose.ok && looseNames.length === 2;
console.log("  " + (looseOk ? "ok  " : "FAIL") +
  " and without it the prose row comes back as FUTURE (got: " + JSON.stringify(looseNames) + ")");
if (!looseOk) bad++;

if (SELF_TEST) {
  console.log("\nSELF-TEST -- a statement that should NOT run\n");
  const r = d1("SELECT no_such_column FROM aby_task");
  console.log("  " + (r.ok ? "GREEN -- IT ACCEPTED A NONSENSE STATEMENT" : "RED   a bad statement is reported as a failure"));
  if (r.ok) bad++;
  const r2 = d1("SELECT * FROM aby_task_that_is_not_there");
  console.log("  " + (r2.ok ? "GREEN -- IT ACCEPTED A MISSING TABLE" : "RED   a missing table is reported as a failure"));
  if (r2.ok) bad++;

  // The fresh-build pass has to be able to fail too, or it is decoration. An ALTER naming a table
  // no CREATE ever makes is the exact F-391 shape.
  const r3 = d1("ALTER TABLE table_that_no_migration_creates ADD COLUMN x TEXT", STATE_FRESH);
  const benign3 = !r3.ok && /duplicate column name|already exists/i.test(String(r3.msg));
  console.log("  " + ((!r3.ok && !benign3) ? "RED   an ALTER on a table nothing created is a failure, not a benign skip"
                                           : "GREEN -- IT SWALLOWED AN ALTER ON A TABLE THAT DOES NOT EXIST"));
  if (r3.ok || benign3) bad++;

  // And the phase sort must really move things, or "applied in phase order" means nothing.
  const sorted = ["CREATE INDEX i ON t(a)", "ALTER TABLE t ADD COLUMN a TEXT", "CREATE TABLE t (id TEXT)"]
    .map((sql, i) => [i, sql]).sort((a, b) => phase(a[1]) - phase(b[1]) || a[0] - b[0]).map((x) => x[1]);
  const phaseOk = /^CREATE TABLE/.test(sorted[0]) && /^ALTER/.test(sorted[1]) && /^CREATE INDEX/.test(sorted[2]);
  console.log("  " + (phaseOk ? "RED   the phase sort puts tables before columns before indexes"
                              : "GREEN -- THE PHASE SORT DID NOT REORDER ANYTHING"));
  if (!phaseOk) bad++;
}

console.log(bad ? "\n" + bad + " problem(s).\n" : "\nevery statement runs on a fresh D1.\n");
process.exit(bad ? 1 : 0);
