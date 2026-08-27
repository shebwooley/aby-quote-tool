/**
 * check_commitment_flow.mjs — does a signed authorization actually MOVE the quote?
 *
 * WHY THIS EXISTS (2026-08-27, F-416)
 * -----------------------------------
 * Measured on production: `commitments` holds 0 rows, 0 of 6,170 quotes are in status 'I', and
 * NOT ONE quote has `committed_at` set. Eric confirmed he submitted one and then deleted the
 * commitment row -- so the INSERT works. Deleting a commitments row cannot clear `quotes`, and
 * `committed_at` is written in exactly ONE place (handleSaveCommitment) and cleared NOWHERE.
 *
 * So either his submission predates the status move (it landed 2026-08-18 at 0e92e61), or that
 * UPDATE has never matched a row. The two are indistinguishable from the database, because:
 *
 *   UPDATE quotes SET status = 'I', committed_at = ? WHERE quote_number = ? AND ... = 'P'
 *
 * matching ZERO rows is NOT an error. `.run()` resolves happily, the catch never fires, and the
 * employer still sees "Authorization received". That is this project's oldest shape: assert what
 * came BACK, never that no error came back.
 *
 * ⭐ SABOTAGE 'never matches' REPRODUCES THAT PRODUCTION SYMPTOM ON DEMAND. A checker whose
 * self-test replays the failure it was written for is one you can still trust in a year.
 *
 * HOW TO RUN
 * ----------
 *   node scripts/check_commitment_flow.mjs
 *   node scripts/check_commitment_flow.mjs --self-test
 *
 * ⚠️ `npx` is broken on this machine by an npm cache lock (EBUSY), which is why check_crm.mjs
 * cannot run here. Point this at a working wrangler instead of editing it:
 *   ABY_WRANGLER=".../node_modules/.bin/wrangler.cmd"
 *
 * TRAPS OBEYED (each cost this project real time; see TRAPS.md)
 *   #206 ① `wrangler dev` with the REAL config watches the whole repo and reloads for ever.
 *          Use wrangler.test.jsonc, which has no assets binding.
 *   #280 ② wrangler persists local D1 RELATIVE TO THE CONFIG FILE. Every invocation pins
 *          --persist-to, or the seed and the server talk to two different databases.
 *   #280   `d1 execute --local` MUST NOT run while `wrangler dev` is up: same SQLite file.
 *   #283   A copy of worker.js in another directory breaks its own relative imports, so the
 *          sabotage copy lives at the REPO ROOT and is named _s_*.js, which .gitignore and
 *          .assetsignore ALREADY cover -- no new deny-list entry to forget.
 *   #125   A sabotage that matches nothing is a silent no-op that reports the checker as strong
 *          while testing nothing. Every substitution asserts the source really changed.
 *   #266   A rule counts as CAUGHT only if it was GREEN before the sabotage and RED after.
 *   #243   A rule with no sabotage behind it is printed UNPROVEN, never counted as covered.
 *   #300   --file, never --command: --file has no shell quoting to get wrong.
 */

import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.COMMIT_TEST_PORT || 8801);
const BASE = 'http://127.0.0.1:' + PORT;
const WIN = process.platform === 'win32';
const NL = String.fromCharCode(10);
const MAIN_CFG = 'wrangler.test.jsonc';
const SAB_JS = '_s_commit_sabotage.js';
const SAB_CFG = '_s_commit_sabotage.jsonc';
const PERSIST = ['--persist-to', join(REPO, '.wrangler', 'state')];
const SELF_TEST = process.argv.includes('--self-test');

// The tool a gate depends on is PINNED, with an env override (TRAPS #320): an unpinned `npx`
// tried to install a new wrangler mid-run and the hook blamed the worker for not building.
const OVERRIDE = process.env.ABY_WRANGLER || '';
const BIN = OVERRIDE || (WIN ? 'npx.cmd' : 'npx');
const PREFIX = OVERRIDE ? [] : ['wrangler'];

// ── the rules, defined ONCE so the report and the self-test cannot paraphrase each other ──────
// (TRAPS #203: a checker that writes each rule twice is testing its paraphrase.)
const RULES = [
  'the commitment POST is accepted',
  'the commitment row is saved',
  'the quote moves out of Pending, to I',
  'committed_at is stamped on the quote',
  'a signature whose quote number matches NOTHING is still saved',
];

// Each sabotage names the rules it MUST redden. Anything else going red is reported as SUSPECT,
// because a sabotage that reddens the whole suite usually means the harness broke (TRAPS #280).
const SABOTAGES = [
  {
    name: 'the status UPDATE can never match (reproduces production)',
    find: "AND COALESCE(status,'P') = 'P'",
    replace: "AND COALESCE(status,'P') = 'ZZ'",
    breaks: ['the quote moves out of Pending, to I', 'committed_at is stamped on the quote'],
  },
  {
    name: 'the signature no longer moves the quote out of Pending',
    find: "UPDATE quotes SET status = 'I', committed_at = ?",
    replace: "UPDATE quotes SET status = 'P', committed_at = ?",
    breaks: ['the quote moves out of Pending, to I'],
  },
];

function die(msg) {
  console.error(NL + 'CANNOT RUN: ' + msg);
  // Exit 2, never 0. "Could not run" must never be spelled the same way as "passed".
  process.exit(2);
}

function d1(sql) {
  const f = join(tmpdir(), 'commit-seed-' + process.pid + '.sql');
  writeFileSync(f, sql.endsWith(';') ? sql : sql + ';');
  const r = spawnSync(BIN, [...PREFIX, 'd1', 'execute', 'aby-quotes', '--local',
                            '--config', MAIN_CFG, '--file', f, ...PERSIST],
                      { cwd: REPO, encoding: 'utf8', shell: WIN });
  rmSync(f, { force: true });
  if (r.status !== 0) {
    die('seeding the local database failed.' + NL + '  sql: ' + sql.slice(0, 140) + NL +
        '  ' + String(r.stderr || r.stdout || '').split(NL).slice(-10).join(NL + '  '));
  }
  return String(r.stdout || '');
}

function query(sql) {
  const out = d1(sql);
  const i = out.indexOf('[');
  if (i < 0) die('no JSON came back from a read. Output was:' + NL + out.slice(-400));
  try { return JSON.parse(out.slice(i))[0].results; }
  catch (e) { die('could not parse the read result: ' + e.message); }
}

function killTree(proc) {
  if (!proc || proc.exitCode !== null) return;
  if (WIN) spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { encoding: 'utf8' });
  else proc.kill('SIGTERM');
}

async function portFree() {
  try { await fetch(BASE + '/api/quotes-ping', { redirect: 'manual' }); return false; }
  catch { return true; }
}

async function boot(cfg) {
  for (let i = 0; i < 30 && !(await portFree()); i++) {
    await new Promise((s) => setTimeout(s, 500));
  }
  const proc = spawn(BIN, [...PREFIX, 'dev', '--local', '--config', cfg,
                           '--port', String(PORT), '--inspector-port', '0', ...PERSIST],
                     { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], shell: WIN });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      die('the local worker exited while starting.' + NL + '  ' +
          log.split(NL).slice(-14).join(NL + '  '));
    }
    try {
      const r = await fetch(BASE + '/api/quotes-ping', { redirect: 'manual' });
      if (r.status) return proc;
    } catch { /* not up yet */ }
    await new Promise((s) => setTimeout(s, 700));
  }
  killTree(proc);
  // ⛔ STATE THE SYMPTOM AND THE CANDIDATES, NEVER ONE CAUSE (TRAPS #283).
  die('nothing answered on port ' + PORT + ' within 90s -- the worker did not START.' + NL +
      '  Usually one of: a BUILD error (read the log), a leaked dev server holding the port,' + NL +
      '  or a missing binding. THE LOG NAMES IT. Read it before changing anything.' + NL +
      '  ' + log.split(NL).slice(-16).join(NL + '  '));
}

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}

/**
 * Seed a fresh quote, exercise the real handler, read the row back, and judge every rule.
 * Returns a Map of rule name -> {ok, detail}.
 *
 * Every identifier is scoped to the call, so the suite is idempotent and survives being run
 * twice (TRAPS #207: a test that only passes on a virgin database gets believed once).
 */
async function runRules(cfg, tag) {
  const stamp = 'CF' + tag + Date.now().toString(36).toUpperCase();
  const qnKnown = 'TX999999-' + stamp.slice(-4) + '-C';
  const qnOrphan = 'TX999998-' + stamp.slice(-4) + '-C';

  d1("DELETE FROM commitments WHERE quote_number IN ('" + qnKnown + "','" + qnOrphan + "')");
  d1("DELETE FROM quotes WHERE quote_number = '" + qnKnown + "'");
  d1("INSERT INTO quotes (id, quote_number, created_at, client_name, status) VALUES ('" +
     stamp + "','" + qnKnown + "','2026-08-27T00:00:00.000Z','Commitment Flow Test','P')");

  const before = query("SELECT status FROM quotes WHERE quote_number = '" + qnKnown + "'");
  if (!before.length) {
    die('the seeded quote is not there -- the seed and the server disagree about which database ' +
        'they are using. Check --persist-to.');
  }

  const proc = await boot(cfg);
  let res, orphanRes;
  try {
    res = await post('/api/commitments', {
      quoteNumber: qnKnown,
      employerName: 'Commitment Flow Test',
      authSigner: 'Test Signer',
      authEmail: 'signer@example.invalid',
      products: ['COBRA Administration'],
    });
    orphanRes = await post('/api/commitments', {
      quoteNumber: qnOrphan,
      employerName: 'Orphan Flow Test',
      authSigner: 'Test Signer',
      authEmail: 'signer@example.invalid',
      products: ['FSA Administration'],
    });
  } finally {
    killTree(proc);
    // The server does not release the SQLite file the instant taskkill returns.
    await new Promise((s) => setTimeout(s, 1500));
  }

  const after = query("SELECT status, committed_at FROM quotes WHERE quote_number = '" +
                      qnKnown + "'");
  const saved = query("SELECT quote_number FROM commitments WHERE quote_number IN ('" +
                      qnKnown + "','" + qnOrphan + "')");
  const row = after[0] || {};

  const out = new Map();
  out.set(RULES[0], { ok: res.status === 200, detail: 'got ' + res.status });
  out.set(RULES[1], { ok: saved.some((r) => r.quote_number === qnKnown), detail: '' });
  out.set(RULES[2], { ok: after.length === 1 && row.status === 'I',
                      detail: 'status is ' + row.status });
  out.set(RULES[3], { ok: after.length === 1 && !!row.committed_at,
                      detail: 'committed_at is ' + JSON.stringify(row.committed_at || null) });
  out.set(RULES[4], { ok: orphanRes.status === 200 &&
                          saved.some((r) => r.quote_number === qnOrphan),
                      detail: 'status ' + orphanRes.status });
  return out;
}

function writeSabotage(sab) {
  const src = readFileSync(join(REPO, 'worker.js'), 'utf8');
  if (!src.includes(sab.find)) {
    die('SABOTAGE ANCHOR NOT FOUND: ' + sab.name + NL +
        '  The anchor is a claim about worker.js, and it no longer matches. That is evidence ' +
        'about the SEARCH, not about the code (TRAPS #246).' + NL +
        '  Confirm the text is really gone (grep for it) BEFORE blaming a commit.');
  }
  const out = src.replace(sab.find, sab.replace);
  if (out === src) die('the substitution changed nothing for: ' + sab.name);
  writeFileSync(join(REPO, SAB_JS), out);
  // Same bindings, same local database, different worker name so a slip cannot deploy it.
  writeFileSync(join(REPO, SAB_CFG), JSON.stringify({
    name: 'aby-quote-tool-commit-sabotage',
    compatibility_date: '2026-05-08',
    main: SAB_JS,
    compatibility_flags: ['nodejs_compat'],
    d1_databases: [{ binding: 'DB', database_name: 'aby-quotes',
                     database_id: '72b0d610-c55f-4b56-af26-613ab047b592' }],
  }, null, 2));
}

function cleanSabotage() {
  rmSync(join(REPO, SAB_JS), { force: true });
  rmSync(join(REPO, SAB_CFG), { force: true });
}

// ── the run ───────────────────────────────────────────────────────────────────────────────────

console.log('Commitment flow — does a signature move the quote?');
console.log('  wrangler: ' + (OVERRIDE || 'npx wrangler'));
console.log('  worker:   ' + join(REPO, 'worker.js'));
console.log('  port:     ' + PORT);

const base = await runRules(MAIN_CFG, 'B');
let failures = 0;
const lines = [];
for (const name of RULES) {
  const r = base.get(name);
  if (!r.ok) failures++;
  lines.push((r.ok ? '  ok   ' : '  FAIL ') + name + (r.detail ? '   ' + r.detail : ''));
}
console.log(NL + lines.join(NL));
console.log(NL + (failures ? 'FAILED ' + failures + ' of ' + RULES.length
                           : 'all ' + RULES.length + ' rules pass'));

let selfFailures = 0;
if (SELF_TEST) {
  if (failures) {
    die('the UNMODIFIED worker already fails ' + failures + ' rules -- fix that first. A ' +
        'sabotage proves nothing when the baseline is red (TRAPS #266).');
  }
  console.log(NL + '── self-test ' + '─'.repeat(60));
  try {
    for (const sab of SABOTAGES) {
      writeSabotage(sab);
      const got = await runRules(SAB_CFG, 'S');
      const reddened = RULES.filter((n) => !got.get(n).ok);
      const missed = sab.breaks.filter((n) => !reddened.includes(n));
      const extra = reddened.filter((n) => !sab.breaks.includes(n));
      if (missed.length) {
        selfFailures++;
        console.log('  MISSED  ' + sab.name);
        missed.forEach((n) => console.log('          rule stayed GREEN: ' + n));
      } else if (extra.length) {
        // Not counted as caught: a sabotage that reddens more than its target usually means the
        // harness broke, and counting any red as "caught" passes hardest then (TRAPS #266/#280).
        selfFailures++;
        console.log('  SUSPECT ' + sab.name);
        extra.forEach((n) => console.log('          also reddened: ' + n));
      } else {
        console.log('  caught  ' + sab.name);
      }
    }
  } finally {
    cleanSabotage();
  }

  const proven = new Set(SABOTAGES.flatMap((s) => s.breaks));
  const unproven = RULES.filter((n) => !proven.has(n));
  if (unproven.length) {
    console.log(NL + '  UNPROVEN — no sabotage stands behind these rules, so a green run says' +
                NL + '  nothing about whether they could ever fail:');
    unproven.forEach((n) => console.log('    - ' + n));
  }
  console.log(NL + (selfFailures ? 'SELF-TEST FAILED: ' + selfFailures + ' of ' + SABOTAGES.length
                                 : 'self-test: ' + SABOTAGES.length + ' of ' + SABOTAGES.length +
                                   ' sabotages caught'));
}

console.log(NL + '⚠️ This proves the HANDLER moves the quote. It says nothing about whether the' +
            NL + '   authorization page inside a downloaded proposal reaches this endpoint.');
process.exitCode = (failures || selfFailures) ? 1 : 0;
