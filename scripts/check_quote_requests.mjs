// ONE QUOTE REQUEST, HOWEVER MANY TIMES IT WAS RUN (Eric, 11-11-2026), checked against fixtures.
// Slices the REAL quoteRequestSql / quoteIdentitySql out of worker.js and runs them in SQLite (node:sqlite),
// so the rule is exercised rather than paraphrased.
//   node check_quote_requests.mjs            node check_quote_requests.mjs --self-test
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SRC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "worker.js"), "utf8");

function grab(src, name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error("not found: " + name);
  let d = 0;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1);
  }
}
function load(src) {
  const code = ["quoteEmployerSql", "quoteIdentitySql", "quoteRequestSql"].map((n) => grab(src, n)).join("\n");
  return new Function(code + "; return { quoteIdentitySql, quoteRequestSql };")();
}

const ROWS = [
  // id, agency, client, key, eff, created, products
  ["a1", "Acme Benefits", "Blind Dog", "blind dog", "2027-01-01", "2026-11-09T21:48", "fsa-C"],
  ["a2", "Acme Benefits", "Blind Dog", "blind dog", "2027-01-01", "2026-11-09T21:50", "fsa-NC"],   // commission flip: same request
  ["a3", "Acme Benefits", "Blind Dog", "blind dog", "2027-01-01", "2026-11-10T09:00", "fsa+cobra"], // product added: same request
  ["a4", "Acme Benefits", "Blind Dog", "blind dog", "2028-01-01", "2027-11-01T09:00", "fsa"],       // next year: new request
  ["a5", "Acme Benefits", "(not stated)", "(not stated)", "2027-01-01", "2026-11-01T09:00", "aca"],  // unnamed: never merged
  ["a6", "Acme Benefits", "(not stated)", "(not stated)", "2027-01-01", "2026-11-01T09:05", "aca"],
  ["b1", "Other Agency", "Blind Dog", "blind dog", "2027-01-01", "2026-11-09T22:00", "fsa"],        // another agency: its own request
  ["b2", "Other Agency", "No Date Co", "no date co", "", "2026-10-03T10:00", "cobra"],               // no effective date: month run
  ["b3", "Other Agency", "No Date Co", "no date co", "", "2026-10-20T10:00", "cobra"],
  ["b4", "Other Agency", "No Date Co", "no date co", "", "2026-12-01T10:00", "cobra"],
];

function run(fns) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE quotes (id TEXT, broker_agency TEXT, client_name TEXT, client_match_key TEXT, effective_date TEXT, created_at TEXT, products TEXT)");
  const ins = db.prepare("INSERT INTO quotes VALUES (?,?,?,?,?,?,?)");
  for (const r of ROWS) ins.run(...r);
  const R = fns.quoteRequestSql(""), Rq = fns.quoteRequestSql("q"), I = fns.quoteIdentitySql("");
  const total = db.prepare("SELECT COUNT(DISTINCT " + Rq + ") n FROM quotes q").get().n;
  const acme = db.prepare("SELECT COUNT(DISTINCT " + R + ") n FROM quotes WHERE broker_agency = 'Acme Benefits'").get().n;
  const other = db.prepare("SELECT COUNT(DISTINCT " + R + ") n FROM quotes WHERE broker_agency = 'Other Agency'").get().n;
  const ident = db.prepare("SELECT COUNT(DISTINCT " + I + ") n FROM quotes WHERE broker_agency = 'Acme Benefits'").get().n;
  const runs = db.prepare("SELECT id, COUNT(*) OVER (PARTITION BY " + R + ") runs, ROW_NUMBER() OVER (PARTITION BY " + R + " ORDER BY created_at, id) run_no FROM quotes ORDER BY id").all();
  const by = Object.fromEntries(runs.map((r) => [r.id, r.runs + "/" + r.run_no]));
  return [
    ["a commission flip and a product added count once; next year is new; two unnamed stay two (Acme: 4)", acme === 4],
    ["the same employer at another agency is that agency's own request; no date = the month run (Other: 3)", other === 3],
    ["the whole book counts 7 requests from 10 runs", total === 7],
    ["the broker scoreboard identity agrees within one agency (4)", ident === 4],
    ["the log marks a3 as run 3 of 3 and a4 as a single run", by.a3 === "3/3" && by.a4 === "1/1" && by.a5 === "1/1"],
  ];
}

function sites(src) {
  return [
    ["every agency count in worker.js goes through the rule (27 counts + the log)", (src.match(/quoteRequestSql\(/g) || []).length >= 30],
    ["no per-agency quote CTE still counts raw rows", !/lower\(trim\(broker_agency\)\) k, COUNT\(\*\)/.test(src)],
  ];
}

const report = (checks) => { let bad = 0; for (const [n, ok] of checks) { if (!ok) bad++; console.log("  " + (ok ? "ok" : "XX") + "  " + n); } return bad; };

if (process.argv.includes("--self-test")) {
  // Sabotage 1: the rule forgets the effective date -> next year's quote merges into this year's.
  const noDate = SRC.split(`"COALESCE(NULLIF(trim(" + p + "effective_date),''), substr(" + p + "created_at,1,7)) END)"`).join(`"'x' END)"`);
  // Sabotage 2: the unnamed guard removed -> two (not stated) rows merge.
  const noGuard = SRC.split("IN ('', '(not stated)', 'not stated')").join("IN ('#none#')");
  // Sabotage 3: one CTE back to raw rows.
  const raw = SRC.replace("COUNT(DISTINCT \" + quoteRequestSql('') + \") quotes, MAX(created_at) last_quote", "COUNT(*) quotes, MAX(created_at) last_quote");
  let missed = 0;
  for (const [label, s, f] of [["no effective date", noDate, (x) => run(load(x))], ["no unnamed guard", noGuard, (x) => run(load(x))], ["a raw-row CTE", raw, sites]]) {
    const caught = s !== SRC && f(s).some(([, ok]) => !ok);
    if (!caught) missed++;
    console.log("  " + (caught ? "ok" : "XX") + "  self-test: " + label + " is caught");
  }
  process.exit(missed ? 1 : 0);
}
const bad = report([...run(load(SRC)), ...sites(SRC)]);
console.log(bad ? `  ${bad} failed` : "  one request, however many runs: all checks pass");
process.exit(bad ? 1 : 0);
