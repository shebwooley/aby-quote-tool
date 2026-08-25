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
const SELF_TEST = process.argv.includes("--self-test");
const STATE = mkdtempSync(join(tmpdir(), "abysql-"));
process.on("exit", () => { try { rmSync(STATE, { recursive: true, force: true }); } catch {} });

function die(msg) {
  console.log("\nCANNOT RUN: " + msg + "\n");
  process.exit(2);
}

function d1(sql) {
  // WITH shell:true NOTHING QUOTES THE ARGUMENTS FOR YOU. The first version of this passed the SQL
  // unquoted, the shell split it on spaces, and wrangler answered with its usage text -- which the
  // caller reported as "no local D1". A tool that cannot run and a tool that is absent look the
  // same from the outside, so the quoting is done here, deliberately.
  const q = (a) => (/[ "]/.test(a) ? '"' + a.split('"').join('\\"') + '"' : a);
  const args = ["wrangler", "d1", "execute", "aby-quotes", "--local",
                "--persist-to", STATE, "--config", "wrangler.test.jsonc",
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

function abyTaskMigrations() {
  const out = [];
  const re = /\{ sql: ((?:"[^"]*"(?:\s*\+\s*)?)+),/g;
  let m;
  while ((m = re.exec(SRC))) {
    // eslint-disable-next-line no-eval
    const sql = eval(m[1]);
    if (/aby_task/.test(sql)) out.push(sql);
  }
  return out;
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
}

console.log(bad ? "\n" + bad + " problem(s).\n" : "\nevery statement runs on a fresh D1.\n");
process.exit(bad ? 1 : 0);
