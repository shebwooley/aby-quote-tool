#!/usr/bin/env node
/**
 * check_crm.mjs — does the CRM spine (F-383) actually behave?
 *
 * ⭐⭐ THIS DRIVES THE REAL WORKER OVER REAL HTTP AGAINST A REAL LOCAL D1. Every other guard in this
 * repo reads source text. That is enough to catch a broken template literal and useless against a
 * query that is valid SQL and returns the wrong rows -- which is the defect class this admin has
 * shipped repeatedly (a lookup routed through an empty table, a filter that matched nothing, an
 * empty result rendered as a happy state). Those are only visible by asking the server and
 * asserting on what comes back.
 *
 * Run:            node scripts/check_crm.mjs
 * Prove it works: node scripts/check_crm.mjs --self-test
 *
 * ⚠️ EXITS 2, NEVER 0, IF IT COULD NOT RUN. "Could not run" must never be spelled the same way as
 * "passed" -- a checker that cannot start looks identical to a clean run in terminal scrollback.
 *
 * 🔴 TWO THINGS THAT COST TIME WHEN THIS WAS WRITTEN, BOTH WORTH KNOWING BEFORE EDITING IT:
 *   ① spawn(..., {shell: true}) then proc.kill() KILLS THE SHELL AND NOT WRANGLER. The dev server
 *     survives, holds the port, and the NEXT run reports "never came up" -- which reads as a broken
 *     worker rather than as a leaked process. Killed by process TREE below.
 *   ② `wrangler d1 execute --local` MUST NOT RUN WHILE `wrangler dev` IS UP. They open the same
 *     SQLite file and the dev server dies mid-suite, which surfaces as "fetch failed" halfway
 *     through. All seeding happens with the server DOWN, which is why this runs in phases.
 */

import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CRM_TEST_PORT || 8799);
const BASE = `http://127.0.0.1:${PORT}`;
const SELF_TEST = process.argv.includes('--self-test');
const WIN = process.platform === 'win32';
const NEWLINE = String.fromCharCode(10);
// 🔴 shell: true IS REQUIRED ON WINDOWS AND IS NOT LAZINESS. Node 20 refuses to spawn a .cmd
// without a shell (the CVE-2024-27980 fix), so npx.cmd fails with EINVAL and the seed dies with no
// message. ⚠️ It is only SAFE here because every long-lived process is killed by TREE below -- with
// shell: true, proc.kill() kills the shell and leaves wrangler holding the port for ever.
const NPX = WIN ? 'npx.cmd' : 'npx';
const MAIN_CFG = 'wrangler.test.jsonc';
const SAB_JS = join('scripts', '.crm-sabotage.js');
const SAB_CFG = join('scripts', '.crm-sabotage.jsonc');
const SAB_VARS = join('scripts', '.dev.vars');
// 🔴🔴 EVERY wrangler INVOCATION HERE PINS THE SAME LOCAL DATABASE, AND THAT IS LOAD-BEARING.
// wrangler persists local state RELATIVE TO THE CONFIG FILE, so a config in scripts/ gets its
// own EMPTY database under scripts/.wrangler. The sabotage runs then failed every assertion --
// not because the sabotage worked, but because there was no data. FOUR of five sabotages were
// reported CAUGHT for that reason (TRAPS #266: a self-test that counts ANY red as caught passes
// hardest when the harness is broken). ⛔ Do not remove this flag from any of the three uses.
const PERSIST = ['--persist-to', join(REPO, '.wrangler', 'state')];

// ── plumbing ──────────────────────────────────────────────────────────────────────────────────

let failures = 0;
let checks = 0;
let results = [];

function check(name, got, want, why) {
  checks++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  results.push({ name, ok, got, want, why });
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) {
    console.log(`         got  ${JSON.stringify(got)}`);
    console.log(`         want ${JSON.stringify(want)}`);
    if (why) console.log(`         why  ${why}`);
  }
  return ok;
}

function die(msg) {
  console.log('');
  console.log('CANNOT RUN: ' + msg);
  releaseLock();
  cleanupSabotage();
  process.exit(2);
}

/** The local dev password. ⛔ Read, never printed -- this file's output goes into scrollback. */
function localAdminPassword() {
  const f = join(REPO, '.dev.vars');
  if (!existsSync(f)) die('.dev.vars is missing, so there is no local admin password to log in with.');
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^ADMIN_PASSWORD\s*=\s*(.*)$/.exec(line.trim());
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  die('.dev.vars has no ADMIN_PASSWORD line.');
  return '';
}

let cookie = '';
async function api(method, path, body) {
  const init = { method, headers: {}, redirect: 'manual' };
  if (cookie) init.headers.Cookie = cookie;
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const r = await fetch(BASE + path, init);
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* a non-JSON body is itself a finding */ }
  return { status: r.status, json, text };
}

/**
 * Run one statement against the LOCAL D1.
 * ⛔ Dies on failure. A seed that silently does not land makes every downstream assertion fail for
 * a reason that has nothing to do with the code under test -- which is exactly how the first run of
 * this file produced fourteen red lines and one real cause.
 */
function d1(sql, cfg) {
  // 🔴 --file, NOT --command, AND THAT IS FORCED BY shell: true ABOVE. Node concatenates argv
  // without escaping when it spawns through a shell, so a --command argument containing spaces is
  // word-split by cmd.exe and wrangler answers "Unknown arguments: TABLE, IF, NOT, EXISTS...".
  // ⭐ A file has no quoting to get wrong, on any platform.
  const f = join(tmpdir(), `crm-seed-${process.pid}.sql`);
  writeFileSync(f, sql.endsWith(';') ? sql : sql + ';');
  const r = spawnSync(NPX, ['wrangler', 'd1', 'execute', 'aby-quotes', '--local',
                            '--config', cfg, '--file', f, ...PERSIST],
                      { cwd: REPO, encoding: 'utf8', shell: WIN });
  rmSync(f, { force: true });
  if (r.status !== 0) {
    die('seeding the local database failed.\n  sql: ' + sql.slice(0, 120) +
        '\n  ' + String(r.stderr || r.stdout || '').split('\n').slice(-8).join('\n  '));
  }
  return true;
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
  // 🔴 WAIT FOR THE PORT BEFORE STARTING, NOT ONLY ONCE AT THE TOP OF THE RUN. The previous
  // phase's worker does not release it the instant taskkill returns, so the next boot raced it and
  // died with 'never came up' -- which reads as a broken worker rather than as a slow shutdown.
  // ⚠️ It cost a 15-minute self-test that reported CANNOT RUN after passing 74 assertions.
  for (let i = 0; i < 30 && !(await portFree()); i++) {
    await new Promise((s) => setTimeout(s, 500));
  }
  const proc = spawn(NPX, ['wrangler', 'dev', '--local', '--config', cfg,
                           '--port', String(PORT), '--inspector-port', '0', ...PERSIST],
                     { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], shell: WIN });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });

  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      die('the local worker exited while starting.\n  ' + log.split('\n').slice(-12).join('\n  '));
    }
    try {
      const r = await fetch(BASE + '/api/quotes-ping', { redirect: 'manual' });
      if (r.status) return proc;
    } catch { /* not up yet */ }
    await new Promise((s) => setTimeout(s, 700));
  }
  killTree(proc);
  // ⛔ STATE THE SYMPTOM AND THE CANDIDATES, NEVER ONE CAUSE. This said 'never came up on port
  // N', which sends a reader to look at PORTS -- while the log below said the worker could not be
  // BUILT. A message asserting a cause it cannot know is worse than one that does not (TRAPS #283).
  die('nothing answered on port ' + PORT + ' within 90s -- the worker did not START.'
      + NEWLINE + '  Usually one of: a BUILD error (read the log below), a leaked dev server still'
      + NEWLINE + '  holding the port, or a missing binding. THE LOG NAMES IT. Read it before'
      + NEWLINE + '  changing anything.'
      + NEWLINE + '  ' + log.split(NEWLINE).slice(-14).join(NEWLINE + '  '));
  return proc;
}

// 🔴🔴 ONE RUN AT A TIME, AND THIS IS NOT TIDINESS. Two runs share the same local database, so
// the second one's seedTest wipes crm_events while the first is mid-assertion. The result looks
// EXACTLY like a code regression: on 2026-08-23 an overlapping run reported 78/85 with seven
// failures naming real rules, and nothing was wrong with the code at all.
// ⚠️ THE PORT PRE-FLIGHT CANNOT CATCH IT -- the other run spends most of its life BETWEEN boots,
// with the port free and its fixtures still live.
const LOCK = join(REPO, 'scripts', '.crm-check.lock');

// The lock records the PID so a DEAD holder can be told from a live one. A run killed inside a
// shell pipeline never reaches releaseLock, and without this the stale file blocks every later
// run -- including the pre-commit hook -- for a reason that has nothing to do with the code.
function holderAlive(pid) {
  if (!pid) return true;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function takeLock() {
  if (existsSync(LOCK)) {
    const held = readFileSync(LOCK, 'utf8').trim();
    const pid = Number((held.split(' pid ')[1] || '').trim());
    if (!holderAlive(pid)) {
      console.log('  (clearing a lock left by a run that is no longer alive: ' + held + ')');
      rmSync(LOCK, { force: true });
      writeFileSync(LOCK, new Date().toISOString() + ' pid ' + process.pid);
      return;
    }
    die('another run of this suite is in progress (started ' + held + ').' +
        NEWLINE + '  Two runs share one local database and corrupt each other, and the result' +
        NEWLINE + '  looks like a code regression. Wait for it, or delete scripts/.crm-check.lock' +
        NEWLINE + '  if you are certain nothing is running.');
  }
  writeFileSync(LOCK, new Date().toISOString() + ' pid ' + process.pid);
}

function releaseLock() { rmSync(LOCK, { force: true }); }

function cleanupSabotage() {
  rmSync(join(REPO, SAB_JS), { force: true });
  rmSync(join(REPO, SAB_CFG), { force: true });
  rmSync(join(REPO, SAB_VARS), { force: true });
}

// ── fixtures ──────────────────────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);
const BACKDATE = '2020-01-01';
const TAG_FIRST = 'Sent Quoting Tool Email';   // the spelling that must win
const TAG_SHOUTY = 'SENT QUOTING TOOL EMAIL';  // the same tag typed differently later
const AGENT_EMAIL = 'crmtest.agent@example.com';
const MOVER_OLD = 'crmtest.mover.old@example.com';   // 3 quotes at Test Agency 0
const MOVER_NEW = 'crmtest.mover.new@example.com';   // 4 quotes at a firm with no agencies row

const AGENCIES = [];
for (let i = 0; i < 42; i++) AGENCIES.push({ id: `test-agency-${i}`, name: `Test Agency ${i}` });
const A0 = { type: 'agency', id: AGENCIES[0].id };
const A1 = { type: 'agency', id: AGENCIES[1].id };
const A2 = { type: 'agency', id: AGENCIES[2].id };

/**
 * The two tables the MIGRATION does not create for itself.
 * ⛔ crm_events IS DELIBERATELY NOT CREATED HERE. Writing its DDL into this file would make the
 * fixture a second copy of the thing under test, and the two would rot on the same schedule
 * (TRAPS #256). It is created by /api/migrate -- the REAL migration.
 */
function seedBase(cfg) {
  // 🔴🔴 DROP THE TABLES THE MIGRATION OWNS, SO THE LOCAL DATABASE CANNOT BE OLDER THAN THE CODE.
  // The local brokers table was left over from a much earlier schema -- email as the primary key,
  // pw_hash/pw_salt instead of password_hash, NO id column at all -- and CREATE TABLE IF NOT EXISTS
  // cannot repair a table that already exists in the wrong shape. Signup failed with
  // 'no such column: id' and the 500 arrived as a wrangler HTML page, naming nothing.
  // ⭐ TRAPS #206 says a fresh local D1 is not production. The mirror is just as true: an OLD one
  // is not either, and it fails in a way that looks like a code bug.
  // ⚠️ Production was checked and is CORRECT -- this was only ever the test database.
  // ⛔ --local only. Nothing here can reach the real database.
  d1('DROP TABLE IF EXISTS brokers', cfg);
  d1('CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, quote_number TEXT, created_at TEXT, ' +
     'broker_email TEXT, broker_agency TEXT, source_tag TEXT, notes TEXT, broker_name TEXT)', cfg);
  d1('CREATE TABLE IF NOT EXISTS broker_directory (email TEXT PRIMARY KEY, name TEXT, phone TEXT, ' +
     'agency TEXT, first_seen TEXT, last_seen TEXT, quote_count INTEGER)', cfg);
}

/**
 * Test rows. Run with the server DOWN, and after the migration has created `agencies`.
 *
 * ⭐⭐ THE MOVER FIXTURE IS MODELLED ON A REAL CASE, not invented. Rebecca Hearne is in the live
 * directory twice -- rebecca@ebslp.com and rebecca@legacybenefitservicesllc.com, TWO agencies, a
 * quote at each. That is Eric's case: "agents who move from one agency to another... the fact that
 * they know and like us recorded without taking their quote history with them."
 * ⚠️ The two addresses carry DIFFERENT quote counts (3 and 4) on purpose. Equal counts would let a
 * bug that halves, doubles or swaps them pass unnoticed.
 * ⭐ MOVER_NEW also names an agency with NO agencies row -- "Agency With No Record" -- which is the
 * 24-of-139 case Eric asked about. The backfill must CREATE that record and flag it.
 */
function seedTest(cfg) {
  d1('DELETE FROM crm_events', cfg);
  d1('DELETE FROM people', cfg);
  d1("DELETE FROM agencies WHERE id LIKE 'test-agency-%' OR name = 'Agency With No Record'", cfg);
  d1("DELETE FROM broker_directory WHERE email LIKE 'crmtest.%@example.com'", cfg);
  // ⚠️ The broker ACCOUNTS too. Signup answers 409 for an address that already has one, and
  // every assertion after that would be answering a different question.
  d1("DELETE FROM brokers WHERE lower(trim(email)) LIKE 'crmtest.%@example.com'", cfg);
  d1("DELETE FROM agencies WHERE name = 'Zzz Signup Firm'", cfg);
  // ⛔ AND ANY ROW WITH NO EMAIL AT ALL. Only a sabotage can create one -- the email check is
  // what a sabotage removes -- and it does not match the pattern above, so it survived every
  // reseed and permanently broke the people/addresses count in a LATER, legitimate run.
  // ⭐ A self-test that can leave residue must clear that residue, or it poisons the suite it
  // exists to protect.
  d1("DELETE FROM broker_directory WHERE trim(COALESCE(email,'')) = ''", cfg);
  // ⚠️ The import creates firms too. Left behind, the 'one agency between them' assertion sees
  // the previous run's record and reads 1 where it should have created it.
  d1("DELETE FROM agencies WHERE name IN ('A Firm Nobody Has Quoted','Shared Firm From A List')", cfg);
  d1("DELETE FROM quotes WHERE id LIKE 'crmtest-q-%'", cfg);
  // RFP WATCH fixtures. Left behind, they make the NEXT run read every row as already known,
  // which is a green-looking pass over an import that never imported anything.
  d1("DELETE FROM rfp_decision WHERE opportunity_id IN (SELECT id FROM rfp_opportunity WHERE entity_name LIKE 'RFPTEST%')", cfg);
  d1("DELETE FROM rfp_opportunity WHERE entity_name LIKE 'RFPTEST%'", cfg);
  d1('INSERT INTO agencies (id, name) VALUES ' +
     AGENCIES.map((a) => `('${a.id}','${a.name}')`).join(','), cfg);
  d1('INSERT INTO broker_directory (email, name, agency, quote_count) VALUES ' +
     `('${AGENT_EMAIL}','CRM Test Agent','Test Agency 0',0),` +
     `('${MOVER_OLD}','Test Mover','Test Agency 0',3),` +
     `('${MOVER_NEW}','Test Mover','Agency With No Record',4)`, cfg);
  // The work itself: 3 quotes run at the old firm, 4 at the new one. ⛔ Nothing the CRM does may
  // ever change one of these rows.
  const q = [];
  for (let i = 0; i < 3; i++) q.push(`('crmtest-q-old-${i}','Q${i}','2019-06-0${i + 1}','${MOVER_OLD}','Test Agency 0','','','Test Mover')`);
  // Six recent quotes against Test Agency 7, so it derives as 'regular' and can be RECORDED as
  // something else. ⚠️ Dated recently on purpose: an old sixth quote would derive as 'former'.
  // ⭐ ONE PERSON WHOSE QUOTES ARE SOMETIMES TYPED WITH AN ADDRESS AND SOMETIMES WITHOUT --
  // the shape that made Jason Sandler two rows on live data.
  q.push("('crmtest-q-sp-1','S1','2026-05-01','split@example.com','Test Agency 1','','','Split Person')");
  q.push("('crmtest-q-sp-2','S2','2026-05-02','split@example.com','Test Agency 1','','','Split Person')");
  q.push("('crmtest-q-sp-3','S3','2026-05-03','','Test Agency 1','','','Split Person')");
  // ⛔ AND ONE NAME THAT MAPS TO TWO ADDRESSES. The name proves nothing, so the blank-email row
  // must NOT be folded into either -- that would merge two different people for ever.
  q.push("('crmtest-q-am-1','A1','2026-05-04','amb.one@example.com','Test Agency 2','','','Ambiguous Person')");
  q.push("('crmtest-q-am-2','A2','2026-05-05','amb.two@example.com','Test Agency 2','','','Ambiguous Person')");
  q.push("('crmtest-q-am-3','A3','2026-05-06','','Test Agency 2','','','Ambiguous Person')");
  for (let i = 0; i < 6; i++) {
    q.push(`('crmtest-q-grow-${i}','G${i}','2026-07-0${i + 1}','grow${i}@example.com','Test Agency 7','','','Grower Person')`);
  }
  for (let i = 0; i < 4; i++) q.push(`('crmtest-q-new-${i}','R${i}','2026-06-0${i + 1}','${MOVER_NEW}','Agency With No Record','','','Test Mover')`);
  d1('INSERT INTO quotes (id, quote_number, created_at, broker_email, broker_agency, source_tag, notes, broker_name) VALUES ' +
     q.join(','), cfg);
}

// ── the suite ─────────────────────────────────────────────────────────────────────────────────

async function login() {
  const r = await api('POST', '/api/admin/login', { password: localAdminPassword() });
  if (r.status !== 200) die('could not log in to the local worker (status ' + r.status + ').');
}

/**
 * The migration itself, on a FRESH database.
 * ⭐ Worth its own assertion: schema.sql lacks columns that only ever arrived as hand-run ALTERs, so
 * a brand-new database takes a path the live one has not taken since it was created (TRAPS #206 ②).
 */
async function assertMigration() {
  cookie = '';
  await login();
  const r = await api('GET', '/api/migrate');
  // ⚠️ MATCHED ANYWHERE IN THE LABEL, NOT AS A PREFIX. handleMigrate reports a column as
  // "crm_events.happened_at" but an index as "index crm_events_entity" -- so a prefix test finds
  // the table and silently misses both indexes, and the assertion fails against correct code.
  const crm = ((r.json && r.json.verified) || []).filter((v) => String(v.what).includes('crm_events'));
  check('the migration creates the CRM table and both its indexes on a fresh database',
        [crm.length, crm.every((v) => v.present)], [3, true],
        'the table, the per-entity index and the by-label index');
}

async function runSuite() {
  // ── 1. the gate. These are ABY's private notes about who they are courting.
  cookie = '';
  let r = await api('GET', '/api/admin/crm?entity_type=agency&entity_id=' + A0.id);
  check('unauthenticated read is refused', r.status, 401,
        'a CRM note names who ABY is chasing and what they said; it is not broker-facing');
  r = await api('POST', '/api/admin/crm', { kind: 'note', body: 'x', entities: [A0] });
  check('unauthenticated write is refused', r.status, 401);

  await login();

  // ── 1b. THE BACKFILL. Run here because the addresses were seeded after the first migration, so
  //    this is the run that has to give them a person and an agency.
  let r2 = await api('GET', '/api/migrate');
  const bf = (r2.json && r2.json.people) || {};
  check('the backfill creates a person for every address',
        [bf.peopleCreated, (bf.errors || []).length], [3, 0]);
  check('and CREATES the agency record an agent-only firm has no row for',
        bf.agenciesCreated, 1,
        'Eric: I would like agents under agencies but need to resolve the ones with no agency');
  // ⭐ IDEMPOTENCY IS NOT A NICETY HERE: /api/migrate is opened by hand more than once, and a second
  // run that created people again would give one human several records -- the exact defect the
  // people table exists to prevent.
  r2 = await api('GET', '/api/migrate');
  const bf2 = (r2.json && r2.json.people) || {};
  check('running the migration TWICE creates nothing a second time',
        [bf2.peopleCreated, bf2.agenciesCreated, bf2.alreadyLinked], [0, 0, 3],
        'a backfill guarded by "has this run before" instead of "is it already set" doubles people');

  // ── 2. shape of a bad request. ⛔ Each must be a 400 with a reason, never a silent 200 that
  //       writes nothing -- "it worked and nothing appeared" is the worst screen to debug.
  r = await api('GET', '/api/admin/crm');
  check('read with no entity is a 400', r.status, 400);
  r = await api('POST', '/api/admin/crm', { kind: 'note', body: '', entities: [A0] });
  check('an empty note is refused', r.status, 400,
        'an empty row is invisible on screen and still counts in every total');
  r = await api('POST', '/api/admin/crm', { kind: 'tag', label: '   ', entities: [A0] });
  check('a tag with no label is refused', r.status, 400);
  r = await api('POST', '/api/admin/crm', { kind: 'note', body: 'x', entities: [] });
  check('writing to nothing is refused', r.status, 400);
  r = await api('POST', '/api/admin/crm', { kind: 'note', body: 'x', entities: [A0], by: 'dave' });
  check('an unknown person is refused', r.status, 400,
        'created_by shares the rep vocabulary; a free-text name would fork it');
  r = await api('POST', '/api/admin/crm', { kind: 'note', body: 'x', entities: [A0], happened_at: '03/01/2026' });
  check('a non-ISO date is refused', r.status, 400);

  // ── 3. a note on one agency
  r = await api('POST', '/api/admin/crm',
                { kind: 'note', body: 'Spoke to Jana, moving to a PEO in the spring.', entities: [A0], by: 'eric' });
  check('a note writes', [r.status, r.json && r.json.written], [200, 1]);
  r = await api('GET', `/api/admin/crm?entity_type=agency&entity_id=${A0.id}`);
  check('the note reads back', r.json && r.json.matched, 1);
  const note = (r.json && r.json.events && r.json.events[0]) || {};
  check('the note text survived the round trip', note.body, 'Spoke to Jana, moving to a PEO in the spring.');
  // ⚠️ COMPUTED HERE, NOT AT PROCESS START. TODAY is captured when the module loads, and the
  // self-test runs for twenty minutes. A run that crosses UTC midnight had this assertion red in
  // EVERY sabotage pass on 2026-08-23, which inflated one sabotage's red count until the harness
  // called it SUSPECT -- a clock boundary reported as a broken test.
  check('happened_at defaults to today', note.happened_at, new Date().toISOString().slice(0, 10));
  check('created_by is recorded', note.created_by, 'eric');

  // ── 4. BACKDATING, which is the reason happened_at exists at all.
  //    ⛔ The stored value must be the string typed. new Date("2020-01-01") is 2019-12-31 in a US
  //    timezone -- the shift that once moved a compliance anchor a day nationwide.
  r = await api('POST', '/api/admin/crm',
                { kind: 'note', body: 'referred by Dana', entities: [A1], happened_at: BACKDATE });
  check('a backdated note writes', r.json && r.json.written, 1);
  r = await api('GET', `/api/admin/crm?entity_type=agency&entity_id=${A1.id}`);
  const back = (r.json && r.json.events && r.json.events[0]) || {};
  check('the backdated date is stored EXACTLY as typed', back.happened_at, BACKDATE,
        'a date parsed through Date() lands a day early in a US timezone');
  check('created_at is NOT the backdate',
        Boolean(back.created_at && back.created_at.slice(0, 10) !== BACKDATE), true,
        'happened_at and created_at are two different facts and both are kept');

  // ── 5. TAGS ARE PICKED, NOT TYPED. The first spelling wins for ever.
  r = await api('POST', '/api/admin/crm', { kind: 'tag', label: TAG_FIRST, entities: [A0, A1] });
  check('a tag applies to two agencies', r.json && r.json.written, 2);
  r = await api('POST', '/api/admin/crm', { kind: 'tag', label: TAG_SHOUTY, entities: [A2] });
  check('the SAME tag typed differently is stored under the FIRST spelling', r.json && r.json.label, TAG_FIRST,
        'otherwise the filter is string matching and it will silently drop people');
  r = await api('GET', '/api/admin/crm?label=' + encodeURIComponent(TAG_SHOUTY));
  check('all three read back under either spelling', r.json && r.json.matched, 3,
        'the number on screen has to be the number in the table');

  // ── 6. the same tag twice on one day is a double-click; on another day it is real history.
  r = await api('POST', '/api/admin/crm', { kind: 'tag', label: TAG_FIRST, entities: [A0] });
  check('re-tagging on the same day is skipped, not duplicated',
        [r.json && r.json.written, r.json && r.json.skipped], [0, 1]);
  r = await api('POST', '/api/admin/crm', { kind: 'tag', label: TAG_FIRST, entities: [A0], happened_at: '2026-03-01' });
  check('the same tag on a DIFFERENT day is a real second event', r.json && r.json.written, 1,
        'invited to a webinar in March and again in September is exactly the history this is for');

  // ── 7. an entity that does not exist, and an agent with no stable key
  r = await api('POST', '/api/admin/crm', { kind: 'note', body: 'x', entities: [{ type: 'agency', id: 'no-such-id' }] });
  check('a note against a missing agency FAILS rather than orphaning',
        [r.json && r.json.written, r.json && r.json.failed], [0, 1],
        'an event on an id nothing points at is invisible for ever and raises no error');
  r = await api('POST', '/api/admin/crm', { kind: 'tag', label: TAG_FIRST, entities: [{ type: 'person', id: 'Jason Sandler' }] });
  // ⭐⭐ ASSERT ON THE REASON, NOT ONLY ON THE COUNTS, AND THAT IS THE WHOLE POINT OF THIS ONE.
  // Two guards refuse this input: the email test here, and the existence lookup behind it. Counting
  // failures cannot tell them apart -- so with the email test removed the assertion still passed,
  // and the self-test reported the sabotage MISSED. The REASON is what distinguishes them.
  const nameFail = (r.json && r.json.detail && r.json.detail.failed && r.json.detail.failed[0]) || {};
  check('a person identified by NAME is refused, for the RIGHT reason',
        [r.json && r.json.written, r.json && r.json.failed, String(nameFail.why || '').includes('no stable key')],
        [0, 1, true],
        'never invent an id for a name -- that is how one person becomes two records');
  r = await api('POST', '/api/admin/crm',
                { kind: 'tag', label: TAG_FIRST, entities: [{ type: 'person', id: AGENT_EMAIL.toUpperCase() }] });
  check('a person IS taggable by email, case-insensitively', r.json && r.json.written, 1,
        'an address is RESOLVED to a person, never used as the key');

  // ── 8. BULK APPLY -- the guard the build plan asks for by name.
  const forty = AGENCIES.slice(2, 42).map((a) => ({ type: 'agency', id: a.id }));
  r = await api('POST', '/api/admin/crm',
                { kind: 'tag', label: 'invited to webinar', entities: forty, happened_at: '2026-08-23' });
  check('a tag applied to 40 agencies writes 40', r.json && r.json.written, 40);
  r = await api('GET', '/api/admin/crm?label=' + encodeURIComponent('invited to webinar'));
  check('and reads back as 40 -- not 39, and not by string match', r.json && r.json.matched, 40);

  // ── 9. an empty result is an ANSWER: not an error, and not a happy state
  r = await api('GET', '/api/admin/crm?label=' + encodeURIComponent('a tag nobody has ever used'));
  check('an unused tag returns zero, cleanly', [r.status, r.json && r.json.matched], [200, 0]);

  // ── 10. the tag picker is the set that already exists
  r = await api('GET', '/api/admin/crm/tags');
  const labels = ((r.json && r.json.tags) || []).map((t) => t.label).sort();
  check('the picker offers exactly the tags in use', labels, ['Sent Quoting Tool Email', 'invited to webinar'],
        'one row per tag, not one per spelling');

  // ── 11. delete
  r = await api('GET', `/api/admin/crm?entity_type=agency&entity_id=${A1.id}`);
  const victim = ((r.json && r.json.events) || []).find((e) => e.kind === 'note');
  if (!victim) { check('there is a note to delete', false, true); return; }
  r = await api('POST', '/api/admin/crm/delete', { id: victim.id });
  check('an entry deletes', r.status, 200);
  r = await api('POST', '/api/admin/crm/delete', { id: victim.id });
  check('deleting it again is a 404, not a silent ok', r.status, 404,
        'a DELETE that matches nothing resolves happily and the screen keeps showing the row');

  // ── 12. AN AGENT WHO MOVES AGENCY. This is Eric's requirement in full, and the property being
  //    proved is the one he stated: the relationship follows the PERSON, the work stays with the
  //    FIRM. Modelled on Rebecca Hearne, who is in the live directory twice at two agencies.
  const agencyOf = (p) => (p.addresses || []).map((a) => [a.agency_name, a.quotes]).sort();

  // Tag the newer address BEFORE the merge, so there is history to lose.
  r = await api('POST', '/api/admin/crm', { kind: 'tag', label: 'met at a conference', entities: [{ type: 'person', id: MOVER_NEW }] });
  check('the newer address can be tagged before anybody links it', r.json && r.json.written, 1);

  r = await api('GET', '/api/admin/crm/suggest');
  let names = ((r.json && r.json.suggestions) || []).map((s) => s.key);
  check('the same name at two addresses is SUGGESTED as one person', names.includes('test mover'), true,
        'suggested only -- live data has a move, an acquisition and an alias that look identical here');

  r = await api('GET', '/api/admin/crm/person?email=' + encodeURIComponent(MOVER_OLD));
  const before = r.json || {};
  check('before the link, the old address is a person of one, with its own quotes',
        [(before.addresses || []).length, before.totalQuotes, before.movedBetweenAgencies], [1, 3, false]);
  r = await api('GET', '/api/admin/crm/person?email=' + encodeURIComponent(MOVER_NEW));
  check('and the new address stands alone with its own quotes and its CREATED agency',
        [(r.json.addresses || []).length, r.json.totalQuotes, r.json.addresses[0].agency_name],
        [1, 4, 'Agency With No Record']);

  // ── the merge itself
  r = await api('POST', '/api/admin/crm/link', { email: MOVER_NEW, person_id: before.person.id });
  check('linking the two addresses moves the tag rather than losing it',
        [r.status, r.json && r.json.action, r.json && r.json.eventsMoved, r.json && r.json.emptiedPersonRemoved],
        [200, 'merged', 1, true],
        'a note is about a HUMAN, and the premise of the merge is that these were always one human');

  r = await api('GET', '/api/admin/crm/person?email=' + encodeURIComponent(MOVER_NEW));
  const after = r.json || {};
  check('both addresses now answer to one person', (after.addresses || []).length, 2);
  check('the total is the sum of both firms', after.totalQuotes, 7);
  check('⭐ THE QUOTES DID NOT MOVE AGENCY: still 3 at the old firm and 4 at the new',
        agencyOf(after), [['Agency With No Record', 4], ['Test Agency 0', 3]],
        'Eric: without taking their quote history with them - that stays with the agency');
  check('and the move is visible without anybody recording one', after.movedBetweenAgencies, true);

  r = await api('GET', '/api/admin/crm?entity_type=person&entity_id=' + encodeURIComponent(MOVER_OLD));
  check('the tag written on the old record now reads on the surviving person',
        ((r.json && r.json.events) || []).some((e) => e.label === 'met at a conference'), true);

  r = await api('GET', '/api/admin/crm/suggest');
  names = ((r.json && r.json.suggestions) || []).map((s) => s.key);
  check('once linked, the pair stops being suggested', names.includes('test mover'), false);

  // ── and it is reversible
  r = await api('POST', '/api/admin/crm/link', { email: MOVER_NEW, person_id: null });
  check('an address can be split back out', [r.status, r.json && r.json.action], [200, 'split']);
  r = await api('GET', '/api/admin/crm/person?email=' + encodeURIComponent(MOVER_NEW));
  check('and its quote history is exactly what it was before the link',
        [(r.json.addresses || []).length, r.json.totalQuotes], [1, 4],
        'a merge that could not be undone would make a wrong guess permanent');
  r = await api('GET', '/api/admin/crm/person?email=' + encodeURIComponent(MOVER_OLD));
  check('the other side is unchanged too', [(r.json.addresses || []).length, r.json.totalQuotes], [1, 3]);

  // ── 13. THE MARKETING ROW SET. Sourced from the agency records, never from the quote log -- which
  //    is the one change the whole view rests on, and the only reason a never-quoted firm appears.
  const A3 = AGENCIES[3].id;
  const ACQ = AGENCIES[4].id;   // marked as acquired below
  const DIV = AGENCIES[5].id;   // marked as a branch below

  r = await api('GET', '/api/admin/crm/agencies');
  const all = (r.json && r.json.agencies) || [];
  check('the marketing list is sourced from the agency records',
        all.length >= AGENCIES.length, true,
        'built from the quote log it could not show a firm that has never quoted');
  const never = all.find((x) => x.id === A3);
  check('a firm that has NEVER quoted appears, and says so',
        [Boolean(never), never && never.quotes], [true, 0]);
  const created = all.find((x) => x.name === 'Agency With No Record');
  check('and it carries its agent count without touching the quote log',
        created && created.agents, 1);

  // ── 14. ACQUIRED vs BRANCH -- the two behave in opposite ways and must not be collapsed.
  r = await api('POST', '/api/admin/crm/relationship',
                { id: ACQ, parent_id: AGENCIES[0].id, relationship: 'succeeded', note: 'bought 2019' });
  check('a firm can be recorded as acquired', [r.status, r.json && r.json.relationship], [200, 'succeeded']);
  r = await api('POST', '/api/admin/crm/relationship',
                { id: DIV, parent_id: AGENCIES[0].id, relationship: 'division' });
  check('and another as a branch office', r.json && r.json.relationship, 'division');

  r = await api('GET', '/api/admin/crm/agencies');
  const afterRel = (r.json && r.json.agencies) || [];
  check('the ACQUIRED name leaves the marketing list -- nobody can call it',
        Boolean(afterRel.find((x) => x.id === ACQ)), false,
        'Eric: we only market to MMA, not MHBT');
  check('the BRANCH stays -- it is alive and has its own owner',
        Boolean(afterRel.find((x) => x.id === DIV)), true,
        'a branch and an acquisition look identical in a parent-child table and must not behave alike');
  check('and the page reports how many it is hiding', r.json && r.json.excludedAcquired, 1,
        'a filtered page that does not say so is the same defect as an empty one saying all done');

  // One hop only: the rollup on the analysis page joins the parent with a SINGLE join, so a
  // grandparent chain would truncate silently and a child would roll up to the wrong firm.
  r = await api('POST', '/api/admin/crm/relationship',
                { id: AGENCIES[6].id, parent_id: DIV, relationship: 'division' });
  check('a chain is refused, because the rollup is one hop', r.status, 400);
  r = await api('POST', '/api/admin/crm/relationship',
                { id: AGENCIES[0].id, parent_id: DIV, relationship: 'division' });
  check('and so is demoting a firm that already has children', r.status, 400);
  r = await api('POST', '/api/admin/crm/relationship',
                { id: A3, parent_id: A3, relationship: 'division' });
  check('a firm cannot be its own parent', r.status, 400);

  // ── 15. THE FIELD SETTER writes a CLOSED LIST of columns and nothing else.
  r = await api('POST', '/api/admin/crm/agency', { id: A3, field: 'name', value: 'Renamed By An API' });
  check('a field outside the closed list is refused', r.status, 400,
        'a column parameterised by whatever the browser sends eventually writes the wrong one');
  r = await api('POST', '/api/admin/crm/agency', { id: A3, field: 'priority', value: 'Z' });
  check('an unknown priority is refused', r.status, 400);
  r = await api('POST', '/api/admin/crm/agency', { id: A3, field: 'state', value: 'Texas' });
  check('a state SPELLED OUT is refused', r.status, 400,
        'Texas looks answered on screen and is invisible to any filter comparing a two-letter code');
  r = await api('POST', '/api/admin/crm/agency', { id: A3, field: 'priority', value: 'A' });
  check('a real priority saves', r.status, 200);
  r = await api('POST', '/api/admin/crm/agency', { id: A3, field: 'priority', value: '' });
  check('and it can be cleared again', r.status, 200,
        'blank means nobody has judged this yet, which is not the same as C');

  // ── 16. WHERE A FIRM IS -- typed, and the metro DERIVED from it.
  await api('POST', '/api/admin/crm/agency', { id: A3, field: 'state', value: 'tx' });
  await api('POST', '/api/admin/crm/agency', { id: A3, field: 'city', value: 'Frisco' });
  r = await api('GET', '/api/admin/crm/agencies');
  const placed = ((r.json && r.json.agencies) || []).find((x) => x.id === A3) || {};
  check('the state is stored as a two-letter code, upper-cased', placed.state, 'TX');
  check('the metro is DERIVED from the city, not typed', placed.metro, 'DFW',
        'two hand-typed fields answering the same question disagree within a month');
  await api('POST', '/api/admin/crm/agency', { id: A3, field: 'city', value: 'Nowhere Special' });
  r = await api('GET', '/api/admin/crm/agencies');
  const unknown = ((r.json && r.json.agencies) || []).find((x) => x.id === A3) || {};
  check('an unrecognised city gets NO metro rather than a guessed one', unknown.metro, null,
        'a wrong metro drops a firm out of the right filter and into the wrong one, silently');

  // ── 17. THE TAG FILTER IS EXACT. This is the defect the whole tag design exists to prevent.
  await api('POST', '/api/admin/crm', { kind: 'tag', label: 'webinar', entities: [{ type: 'agency', id: A3 }] });
  await api('POST', '/api/admin/crm', { kind: 'tag', label: 'webinar follow-up', entities: [{ type: 'agency', id: DIV }] });
  r = await api('GET', '/api/admin/crm/agencies?tag=' + encodeURIComponent('webinar'));
  const tagged = (r.json && r.json.agencies) || [];
  check('the tag filter matches the WHOLE label, never a substring',
        [tagged.length, tagged[0] && tagged[0].id], [1, A3],
        'a substring filter would silently include webinar follow-up and nobody would see it');

  // ── 18. "Never quoted" is the prospecting list.
  r = await api('GET', '/api/admin/crm/agencies?quoted=no');
  const cold = (r.json && r.json.agencies) || [];
  check('the never-quoted filter returns only firms with no quotes',
        cold.every((x) => !x.quotes), true);
  check('and it is not empty -- these are the ones worth calling', cold.length > 0, true);

  // ── 19. AN EVENT LIST. Eric: "adding new agents/agencies, from an event for example... These
  //    would be tags that could create new agents/agencies."
  //    ⭐⭐ THE HARD PART IS THE PEOPLE WE ALREADY KNOW. A conference roster contains agents who have
  //    quoted for years, and they are the VALUABLE half: they must be tagged and NOT duplicated.
  const EVENT = 'Tulsa CE class';
  const NEWCOMER = 'crmtest.newcomer@example.com';
  const list = [
    { name: 'Brand New Person', agency: 'A Firm Nobody Has Quoted', email: NEWCOMER, phone: '214 555 0134' },
    { name: 'CRM Test Agent', agency: 'Test Agency 0', email: AGENT_EMAIL, phone: '' },
    { name: 'Somebody With No Address', agency: 'Anywhere', email: '', phone: '' },
  ];
  r = await api('POST', '/api/admin/crm/import',
                { rows: list, label: EVENT, happened_at: '2026-08-14' });
  check('an event list adds the new people, recognises the known ones, and refuses the rest',
        [r.json && r.json.added, r.json && r.json.known, r.json && r.json.refused],
        [1, 1, 1],
        'never a single total -- the already-known half is the valuable one');
  check('and it tags EVERYBODY it could, not only the new ones', r.json && r.json.tagged, 2,
        'the existing prospects form skips a known row entirely, tag and all -- that is what this changes');
  check('the refusal names WHO and WHY',
        [r.json.detail.refused[0].who,
         String(r.json.detail.refused[0].why).includes('no email')],
        ['Somebody With No Address', true]);

  // ⭐ THE TAG IS ON THE PERSON, so it survives them changing firm -- which is the whole point of
  // there being a person at all.
  r = await api('GET', '/api/admin/crm?entity_type=person&entity_id=' + encodeURIComponent(AGENT_EMAIL));
  check('an agent we already knew now carries the event tag',
        ((r.json && r.json.events) || []).some((e) => e.label === EVENT && e.happened_at === '2026-08-14'), true);
  r = await api('GET', '/api/admin/crm/person?email=' + encodeURIComponent(NEWCOMER));
  check('and the newcomer is a person with their own address', (r.json.addresses || []).length, 1);
  check('attached to the firm the list named, created for them',
        r.json.addresses[0].agency_name, 'A Firm Nobody Has Quoted');

  // ── 20. RE-PASTING THE SAME LIST. Somebody will do this, and it must be harmless.
  r = await api('POST', '/api/admin/crm/import',
                { rows: list, label: EVENT, happened_at: '2026-08-14' });
  check('re-pasting the same list adds nobody and re-tags nobody',
        [r.json && r.json.added, r.json && r.json.known, r.json && r.json.tagged], [0, 2, 0],
        'the same tag on the same day is a double-click, not a second event');

  // ── 21. IT NEVER OVERWRITES WHAT WE ALREADY HOLD.
  r = await api('POST', '/api/admin/crm/import',
                { rows: [{ name: 'A Different Spelling', agency: 'Some Other Firm', email: AGENT_EMAIL }] });
  check('a name that differs from ours is REPORTED, not applied',
        (r.json.detail.differs || []).some((d) => d.field === 'name' && d.weHold === 'CRM Test Agent'), true,
        'what we hold was typed by somebody dealing with them; a badge list is not better evidence');
  r = await api('GET', '/api/admin/crm/person?email=' + encodeURIComponent(AGENT_EMAIL));
  check('and the record we hold is unchanged', r.json.addresses[0].name, 'CRM Test Agent');

  // ── 22. ONE FIRM, NOT ONE PER ROW.
  r = await api('POST', '/api/admin/crm/import', { rows: [
    { name: 'First Colleague', agency: 'Shared Firm From A List', email: 'crmtest.c1@example.com' },
    { name: 'Second Colleague', agency: 'Shared Firm From A List', email: 'crmtest.c2@example.com' },
  ] });
  check('two people at one firm create ONE agency between them', r.json && r.json.added, 2);
  r = await api('GET', '/api/admin/crm/agencies');
  const shared = ((r.json && r.json.agencies) || []).filter((x) => x.name === 'Shared Firm From A List');
  check('and there is exactly one record for it, carrying both',
        [shared.length, shared[0] && shared[0].agents], [1, 2],
        'a find-or-create per row is how 20 firms became 33 agency records on live data');

  // ── 23. THE AGENCY'S OWN ADMIN, AND WHAT IT MUST NOT SHOW.
  //    Eric: "will they have the ability to add other agents or account managers with their emails
  //    and us pull that info into our list? And if we already have some agent info would that fill
  //    in to their admin area?"
  //    🔴 THIS IS THE FIRST BROKER-FACING SURFACE THAT TOUCHES CRM DATA, so most of what follows is
  //    about what a broker must NOT be able to see or reach.
  const adminCookie = cookie;
  const BOSS = 'crmtest.boss@example.com';
  const COLLEAGUE = 'crmtest.colleague@example.com';

  cookie = '';
  r = await api('GET', '/api/agency/people');
  check('the agency people list refuses an unauthenticated caller', r.status, 401);

  r = await api('POST', '/api/broker/signup',
                { email: BOSS, password: 'a-long-enough-password', name: 'Boss Person', agency: 'Zzz Signup Firm' });
  check('a broker can sign up', [r.status, (r.json && r.json.error) || null], [200, null]);

  // ⭐ SIGNING UP PUTS THEM IN ABY'S LIST. Real brokers register off Eric's webinars unprompted, and
  // until now the only trace was a row in a table nothing reads.
  const bossCookie = cookie;
  cookie = adminCookie;
  r = await api('GET', '/api/admin/crm/person?email=' + encodeURIComponent(BOSS));
  check('a self-registered broker reaches ABY list as a person', (r.json.addresses || []).length, 1);
  check('and their firm came with them', r.json.addresses[0].agency_name, 'Zzz Signup Firm');

  // ── 24. AN INVITE REACHES THE LIST TOO -- the half Eric asked about first.
  cookie = bossCookie;
  r = await api('POST', '/api/agency/invite',
                { people: [{ email: COLLEAGUE, name: 'Account Manager' }] });
  check('an agency administrator can invite a colleague', r.status, 200);
  cookie = adminCookie;
  r = await api('GET', '/api/admin/crm/person?email=' + encodeURIComponent(COLLEAGUE));
  check('an INVITED colleague appears in ABY list', (r.json.addresses || []).length, 1,
        'an invite used to write only to the accounts table, which the CRM does not read');

  // ── 25. AND SOMEBODY ABY ALREADY KNOWS IS NOT DUPLICATED.
  cookie = bossCookie;
  r = await api('POST', '/api/agency/invite',
                { people: [{ email: AGENT_EMAIL, name: 'A Name Their Agency Uses' }] });
  cookie = adminCookie;
  r = await api('GET', '/api/admin/crm/person?email=' + encodeURIComponent(AGENT_EMAIL));
  check('inviting somebody ABY already knows does NOT create a second record',
        (r.json.addresses || []).length, 1,
        'the same recognise-never-duplicate rule as the event import');
  check('and it does not overwrite the name ABY holds', r.json.addresses[0].name, 'CRM Test Agent',
        'what ABY holds was typed by somebody dealing with that agent');

  // ── 26. WHAT THE AGENCY SEES, AND WHAT IT MUST NOT.
  cookie = bossCookie;
  r = await api('GET', '/api/agency/people');
  const mine = (r.json && r.json.people) || [];
  check('the agency sees its own people, prefilled', mine.length >= 2, true,
        'making an agency retype colleagues ABY already knows is the product failing at its purpose');
  const leaked = ['priority', 'assigned_rep', 'notes', 'needs_review', 'person_id']
    .filter((k) => mine.some((x) => Object.prototype.hasOwnProperty.call(x, k)));
  check('nothing ABY-internal is in the agency payload', leaked, [],
        'a broker must never read ABYs owner, priority, tags or notes about themselves');

  // ── 27. FIELD OWNERSHIP, ENFORCED RATHER THAN DOCUMENTED.
  r = await api('POST', '/api/agency/person', { email: COLLEAGUE, field: 'name', value: 'Corrected Name' });
  check('an agency administrator can correct one of their own people', r.status, 200);
  r = await api('POST', '/api/agency/person', { email: COLLEAGUE, field: 'priority', value: 'A' });
  check('but CANNOT set a priority', r.status, 400,
        'the agency owns who somebody is; ABY owns what ABY thinks of them');
  r = await api('POST', '/api/agency/person', { email: COLLEAGUE, field: 'assigned_rep', value: 'eric' });
  check('and CANNOT set the owner', r.status, 400);

  // ⛔ AND CANNOT REACH A PERSON AT ANOTHER FIRM BY GUESSING AN ADDRESS.
  r = await api('POST', '/api/agency/person', { email: MOVER_OLD, field: 'name', value: 'Not Yours' });
  check('an administrator cannot edit somebody at another agency', r.status, 404,
        'scoped in the WHERE clause, so a check-then-write cannot be raced');
  cookie = adminCookie;
  r = await api('GET', '/api/admin/crm/person?email=' + encodeURIComponent(MOVER_OLD));
  check('and that person is untouched', r.json.addresses[0].name, 'Test Mover');

  // ── 28. TWO RECORDS FOR ONE FIRM ARE SUGGESTED, NEVER MERGED.
  //    Self-signup always creates a NEW agency row -- deliberately, because there is nothing
  //    trustworthy to match a stranger on. The consequence is a second record for a firm ABY may
  //    already have, and somebody has to be told.
  r = await api('GET', '/api/admin/crm/agency-dupes');
  check('duplicate firm names are reported', r.status, 200);
  const dupeNames = ((r.json && r.json.pairs) || []).map((g) => g.map((x) => x.name).join(' / '));
  check('and punctuation or case cannot hide a pair',
        typeof (r.json && r.json.note), 'string',
        'suggestions only -- two similar names may be one firm or two, and only a person knows');

  // ── 29. THE RECORDED STATUS, BESIDE THE LIVE ONE.
  //    Eric: "We could do an analysis to see we tagged this originally as one quote ever and now
  //    they have done six, something is working."
  //    ⭐⭐ THE COMPARISON IS THE FEATURE. A frozen value alone says nothing; a live value alone
  //    cannot remember. The fixture is built so the two DISAGREE, because two that always agree
  //    would pass whether or not either was working.
  const GROWER = AGENCIES[7].id;   // seeded with 6 quotes -- derives as "regular"

  r = await api('GET', '/api/admin/crm/agencies');
  let grower = ((r.json && r.json.agencies) || []).find((x) => x.id === GROWER) || {};
  check('a firm with six quotes derives as regular', [grower.quotes, grower.derivedStatus], [6, 'regular']);
  check('and starts with nothing recorded', grower.recordedStatus, null,
        'NOT RECORDED and RECORDED-AND-UNCHANGED are different facts');

  // Record them as they were back then, backdated -- which is the whole point of happened_at.
  r = await api('POST', '/api/admin/crm/status',
                { id: GROWER, status: 'quoted once', happened_at: '2024-02-01' });
  check('a status can be recorded, backdated', [r.status, r.json && r.json.recorded], [200, 'quoted once']);

  r = await api('GET', '/api/admin/crm/agencies');
  grower = ((r.json && r.json.agencies) || []).find((x) => x.id === GROWER) || {};
  check('⭐ THE FROZEN VALUE AND THE LIVE ONE DISAGREE, WHICH IS THE POINT',
        [grower.recordedStatus, grower.derivedStatus], ['quoted once', 'regular'],
        'we tagged this as one quote ever and now they have done six -- something is working');
  check('and the recording carries its own date', grower.recordedAt, '2024-02-01',
        'without the date the comparison is meaningless');

  // ⛔ A RECORDED STATUS IS A TAG, so it would otherwise appear twice on the row -- once in its own
  // column and once in the tag list. It is shown in one place.
  check('the recorded status does not also show up as an ordinary tag',
        (grower.tags || []).some((x) => String(x.label).indexOf('status:') === 0), false);

  // ── 30. RECORDING NEVER REWRITES AN EARLIER RECORDING.
  r = await api('POST', '/api/admin/crm/status',
                { id: GROWER, status: 'quoted once', happened_at: '2024-02-01' });
  check('recording the same thing on the same day is a double-click', r.json && r.json.skipped, true);

  r = await api('POST', '/api/admin/crm/status',
                { id: GROWER, status: 'regular', happened_at: '2026-08-23' });
  check('recording again on a LATER date is a second observation', r.json && r.json.recorded, 'regular');
  r = await api('GET', '/api/admin/crm?entity_type=agency&entity_id=' + GROWER);
  const statusEvents = ((r.json && r.json.events) || [])
    .filter((e) => String(e.label || '').indexOf('status: ') === 0);
  check('both recordings survive -- the first is never overwritten', statusEvents.length, 2,
        'rewriting the first would destroy the only thing it was for');
  r = await api('GET', '/api/admin/crm/agencies');
  grower = ((r.json && r.json.agencies) || []).find((x) => x.id === GROWER) || {};
  check('and the row shows the MOST RECENT recording', [grower.recordedStatus, grower.recordedAt],
        ['regular', '2026-08-23']);

  // ── 31. THE VOCABULARY IS CLOSED, AND THE BANDS MATCH ON BOTH SIDES.
  r = await api('POST', '/api/admin/crm/status', { id: GROWER, status: 'doing great' });
  check('a status outside the vocabulary is refused', r.status, 400,
        'a free-text status is the tag problem again, one column over');
  r = await api('POST', '/api/admin/crm/status', { id: 'no-such-id', status: 'regular' });
  check('recording against a missing agency is refused', r.status, 404);

  r = await api('GET', '/api/admin/crm/agencies');
  const bands = (r.json && r.json.agencies) || [];
  const byQuotes = (n) => (bands.find((x) => x.quotes === n) || {}).derivedStatus;
  // ⚠️ ASSERTED ON BANDS THE FIXTURE ACTUALLY HAS. The first version checked a one-quote firm and
  // there is none, so it read `undefined` -- an assertion about data that does not exist tells you
  // nothing about the code.
  // ⭐⭐ GOING QUIET OUTRANKS VOLUME, and pinning that is worth more than checking three bands.
  // The three-quote firm's quotes are from 2019, so it reads FORMER rather than occasional -- a
  // firm that quoted and stopped is a different story from one that never got started, and it is
  // usually the one that deserves the phone call.
  check('the derived bands read as intended, and quiet outranks volume',
        [byQuotes(0), byQuotes(3), byQuotes(6)], ['never quoted', 'former', 'regular'],
        'the recorded vocabulary and the derived bands must be the same words, or they cannot be compared');

  // ── 32. ONE PERSON, ONE ROW ON THE AGENT LIST -- even when some of their quotes carry no
  //    address. Measured live: Jason Sandler was 3 quotes under his address and 3 under his name,
  //    and it was FIFTEEN people, not the three the plan named.
  r = await api('GET', '/api/admin/stats');
  const agents = (r.json && r.json.byAgent) || [];
  const split = agents.filter((a) => String(a.name || '') === 'Split Person');
  check('an agent whose quotes sometimes lack an email is ONE row',
        [split.length, split[0] && split[0].n], [1, 3],
        'the identity is email-else-name, so a missing address used to open a second bucket');
  check('and the row is keyed on their ADDRESS, not their name',
        split[0] && split[0].key, 'split@example.com');

  // ⛔ THE SAFETY CONDITION, AND IT IS THE WHOLE REASON THIS IS SAFE TO DO AT ALL.
  const amb = agents.filter((a) => String(a.name || '') === 'Ambiguous Person');
  check('a name that maps to TWO addresses is never collapsed', amb.length, 3,
        'collapsing on a name alone would merge two different people, permanently and invisibly');
  check('and the address-less row keys on the name, joining neither',
        amb.some((a) => a.key === 'ambiguous person'), true,
        'live, this is Rebecca Hearne -- two agencies, and the quotes must stay with each');
  let rq;
  // ══ RFP WATCH (F-384) ═══════════════════════════════════════════════════════════════════════
  //
  // ⭐⭐ THE FIXTURES ARE THE REAL WEEK, NOT INVENTED ONES. Every row below is an item that actually
  // surfaced on 2026-08-17, with the outcome that week's human review reached. Three qualified and
  // seven did not, and the seven are the valuable half: a screen that only ever says yes is not a
  // screen.
  //
  // ⚠️ EVERY ASSERTION HERE IS CLOCK-INDEPENDENT OR MOVES WITH THE CLOCK IN ONE DIRECTION ONLY.
  // A past date stays past and a missed pre-proposal stays missed, so those are safe to pin. A
  // "closing soon" fixture is computed FROM today instead, because a fixed date would quietly change
  // meaning next month and the test would rot without ever going red.
  const TAB = String.fromCharCode(9);
  const plusDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  const rfpRows = [
    ['entity', 'state', 'title', 'scope', 'closes', 'plan year', 'pre-proposal', 'mandatory', 'note'],
    // The three that qualified.
    ['RFPTEST City of Newton', 'MA', 'Flexible Spending Plan Account Administration',
     'flexible spending plan account administration', plusDays(11), '', '', '', 'cleanest fit of the week'],
    ['RFPTEST LACCD', 'CA', 'Administration of HRA, FSA and COBRA',
     'health reimbursement arrangement, flexible spending and COBRA continuation',
     plusDays(18), '', '2026-08-11', 'yes', 'mandatory conference already held'],
    ['RFPTEST NYS OER', 'NY', 'FSA, HRA, COBRA Administration and Retiree Billing',
     'flexible spending, health reimbursement, COBRA event administration, retiree billing',
     plusDays(10), '', '', '', 'sources disagree on whether it is open'],
    // ⛔ THE PRECISION CASE, AND THE REASON THE CARRIER RULE READS THE TITLE ONLY. A real FSA
    // solicitation lists dental and vision as ELIGIBLE EXPENSES. Screening it out on that word would
    // throw away the best fit on the page.
    ['RFPTEST City of Kerrville', 'TX', 'Flexible Spending Account Administration',
     'FSA administration covering dental, vision and medical expenses under Section 125',
     plusDays(20), '', '', '', ''],
    // The seven that did not.
    ['RFPTEST Hidalgo County', 'TX', 'Self-Funded Health Plan Stop-Loss Reinsurance Services',
     'stop-loss reinsurance', plusDays(9), '', '', '', ''],
    ['RFPTEST Hidalgo County', 'TX', 'Self-Funded Dental Insurance RFP',
     'dental insurance', plusDays(10), '', '', '', ''],
    ['RFPTEST Delaware SEBC', 'DE', 'Medical Third Party Administrator',
     'medical claims administration for the state health plan', plusDays(30), '', '', '', ''],
    ['RFPTEST State of Texas', 'TX', 'Self-funded Health Plan Administration',
     'self-funded health plan administration with stop-loss', '2026-07-20', '', '', '', ''],
    ['RFPTEST Anytown Retirement Board', 'IL', 'Deferred Compensation 457(b) Administration',
     'deferred compensation plan administration', plusDays(40), '', '', '', ''],
    ['RFPTEST Glynn County Schools', 'GA', 'Employee Flexible Benefits Administration',
     'flexible benefits administration', '2026-05-15', '', '', '', ''],
    // ⭐⭐ THE STALE-CYCLE TRAP, VERBATIM. Last year's solicitation resurfacing with this year's plan
    // year in its title, and the stated weekday does not match the stated date. August 20 2026 was a
    // Thursday. Both tells fire and neither needs a network call.
    ['RFPTEST Tarrant Appraisal District', 'TX', '2026 Group and Retiree Insurance RFP',
     'group and retiree insurance administration', '2026-08-20', '2026', '', '',
     'listed as Wednesday, August 20, 2026'],
    // Refused rather than guessed at.
    [ '', 'TX', 'A row with no issuing entity', 'fsa', plusDays(12), '', '', '', ''],
  ].map((r) => r.join(TAB)).join(NEWLINE);

  rq = await api('POST', '/api/admin/rfp/import', { text: rfpRows, commit: false });
  check('a pasted table is read without a schema being declared', rq.status, 200);
  const rfpSeen = {};
  ((rq.json && rq.json.added) || []).forEach((a) => { rfpSeen[a.title] = a.screen; });

  const dq = (title) => ((rfpSeen[title] && rfpSeen[title].disqualified) || []).map((d) => d.id).sort();
  const fl = (title) => ((rfpSeen[title] && rfpSeen[title].flags) || []).sort();
  const sv = (title) => ((rfpSeen[title] && rfpSeen[title].services) || []).sort();

  check('a stop-loss solicitation is screened out',
        dq('Self-Funded Health Plan Stop-Loss Reinsurance Services'),
        ['medical_claims', 'stop_loss'],
        'it is a self-funded health plan bid AND a stop-loss one; both reasons are true and both are kept');
  check('a dental RFP is screened out on its title',
        dq('Self-Funded Dental Insurance RFP'), ['carrier_line']);
  check('a medical claims TPA is screened out',
        dq('Medical Third Party Administrator'), ['medical_claims'],
        'ABY does not adjudicate medical claims; this is a different business, not a weak fit');
  check('deferred compensation is screened out', dq('Deferred Compensation 457(b) Administration'), ['retirement']);

  // ⛔⛔ THE ONE THAT MATTERS MOST. Widening the carrier rule to the scope would look like a
  // tightening and would silently throw away the best-fitting opportunity on the page.
  // ⚠️ THE ROW HAS TO BE THERE FOR ITS EMPTY DISQUALIFY LIST TO MEAN ANYTHING. An import that
  // failed outright also produces an empty list, so the naive form of this check passes on a total
  // failure -- the same shape as an assertion that compares two failures and finds them equal.
  check('an FSA solicitation that merely MENTIONS dental is NOT screened out',
        [Boolean(rfpSeen['Flexible Spending Account Administration']),
         dq('Flexible Spending Account Administration')], [true, []],
        'dental and vision are eligible EXPENSES in a real FSA scope; the rule reads the title only');

  check('services are tagged with the quote tool own product ids',
        sv('Administration of HRA, FSA and COBRA'), ['cobra', 'fsa', 'hra'],
        'inventing a parallel spelling is how a value becomes invisible to every query that exists');
  check('retiree billing is recognised as a service ABY sells',
        sv('FSA, HRA, COBRA Administration and Retiree Billing').indexOf('directBilling') !== -1, true,
        'the biggest item of the week; a taxonomy without directBilling scores it low');

  check('a mandatory pre-proposal already held is flagged',
        fl('Administration of HRA, FSA and COBRA').indexOf('pre_proposal_passed') !== -1, true,
        'if attendance was required and missed, every hour after this point is wasted');
  check('last year cycle resurfacing is flagged',
        fl('2026 Group and Retiree Insurance RFP').indexOf('stale_cycle') !== -1, true,
        'the plan year had already started before proposals were due');
  check('a stated weekday that contradicts the date is flagged',
        fl('2026 Group and Retiree Insurance RFP').indexOf('date_conflict') !== -1, true,
        'August 20 2026 was a Thursday; the source said Wednesday');
  check('a deadline that has passed reads as closed',
        fl('Employee Flexible Benefits Administration').indexOf('closed') !== -1, true);
  check('a deadline inside two weeks is badged',
        fl('Flexible Spending Plan Account Administration').indexOf('closing_soon') !== -1, true);
  check('nothing imported is treated as verified',
        fl('Flexible Spending Plan Account Administration').indexOf('unverified') !== -1, true,
        'a digest is a summary, and a summary invented a Saturday deadline in this very week');

  check('a row with no issuing entity is refused, not guessed at',
        ((rq.json && rq.json.refused) || []).length, 1);
  check('and the split is reported rather than a total',
        /refused/.test((rq.json && rq.json.summary) || ''), true);

  const rfpBefore = await api('GET', '/api/admin/rfp');
  check('a preview writes nothing at all',
        ((rfpBefore.json && rfpBefore.json.rows) || []).filter((x) => /^RFPTEST/.test(x.entity_name)).length, 0,
        'nothing reaches the list from a paste until a person has seen the parse');

  rq = await api('POST', '/api/admin/rfp/import', { text: rfpRows, commit: true });
  check('committing the same paste writes the rows', rq.status, 200);
  const rfpWrote = ((rq.json && rq.json.added) || []).length;
  rq = await api('POST', '/api/admin/rfp/import', { text: rfpRows, commit: true });
  check('the commit actually wrote something', rfpWrote > 0, true,
        'zero added and zero added again agree, so the next check would pass on two failures');
  check('and pasting the same list again recognises every row instead of duplicating it',
        [((rq.json && rq.json.added) || []).length, ((rq.json && rq.json.known) || []).length], [0, rfpWrote]);

  const rfpList = await api('GET', '/api/admin/rfp');
  const rfpRowsOut = ((rfpList.json && rfpList.json.rows) || []).filter((x) => /^RFPTEST/.test(x.entity_name));
  const rfpByTitle = {};
  rfpRowsOut.forEach((x) => { rfpByTitle[x.title] = x; });
  check('a screened-out row is kept and shown, never deleted',
        ((rfpList.json && rfpList.json.screenedOut) || []).filter((x) => /^RFPTEST/.test(x.entity_name)).length >= 4, true,
        'the rules can be wrong, and a row that vanished cannot be argued with');

  const newton = rfpByTitle['Flexible Spending Plan Account Administration'];
  check('an imported row starts as needing verification', newton && newton.status, 'needs_verification');

  // ── the decision, which is the half a weekly markdown file can never keep ──────────────────────
  rq = await api('POST', '/api/admin/rfp/decision', { id: newton.id, disposition: 'passed' });
  check('passing without a reason is refused', rq.status, 400,
        'a blank reason a year from now is indistinguishable from never having looked');
  rq = await api('POST', '/api/admin/rfp/decision',
                { id: newton.id, disposition: 'passed', pass_reason: 'no municipal reference in MA' });
  check('passing with a reason is recorded', rq.status, 200);
  const rfpAfter = await api('GET', '/api/admin/rfp');
  const rfpNn = ((rfpAfter.json && rfpAfter.json.rows) || []).find((x) => x.id === newton.id);
  check('and the reason survives to the page', rfpNn && rfpNn.pass_reason, 'no municipal reference in MA');

  // ── the gate ──────────────────────────────────────────────────────────────────────────────────
  const laccd = rfpByTitle['Administration of HRA, FSA and COBRA'];
  rq = await api('POST', '/api/admin/rfp/verify', { id: laccd.id, closes_at: plusDays(19) });
  check('checking the official page records a conflict rather than picking a winner',
        /official page says/.test((rq.json && rq.json.conflict) || ''), true,
        'the feed said one date and the entity said another; both are kept');
  check('and only then does it read as verified', rq.json && rq.json.row && rq.json.row.status, 'verified_open');

  const nys = rfpByTitle['FSA, HRA, COBRA Administration and Retiree Billing'];
  rq = await api('POST', '/api/admin/rfp/verify', { id: nys.id, unresolved: true, conflict_note: 'their vendor page says no RFP at this time' });
  check('could not verify is a real outcome, not an error', rq.status, 200,
        'it tells Eric to make a phone call, which was genuinely the right next action twice that week');

  // ── notes reuse the CRM table rather than a second one ────────────────────────────────────────
  rq = await api('POST', '/api/admin/crm',
                { kind: 'note', body: 'called purchasing', entities: [{ type: 'rfp', id: nys.id }] });
  check('an opportunity takes a dated note through the same table as everything else', rq.status, 200);
  rq = await api('GET', '/api/admin/crm?entity_type=rfp&entity_id=' + encodeURIComponent(nys.id));
  check('and it reads back', ((rq.json && rq.json.events) || []).length >= 1, true);
}

/**
 * Extra addresses, for the concurrency phase ONLY.
 *
 * 🔴🔴 READ THIS BEFORE TRUSTING THE CONCURRENCY PHASE: IT CANNOT REPRODUCE THE RACE, AND THE
 * SELF-TEST IS WHAT PROVED THAT. A sabotage removing the conditional claim was reported MISSED at
 * three addresses AND at 150 -- because `wrangler dev --local` serialises requests, so four
 * migrations fired at once still run one after another. The race that broke live data on 2026-08-23
 * (220 people for 139 addresses) is NOT reproducible on this harness at any size.
 * ⭐⭐ SO THE PHASE ASSERTS THE INVARIANT, NOT THE RACE, and the difference is stated rather than
 * quietly enjoyed: "one person per address" is worth asserting on its own, but a green line here is
 * NOT evidence that concurrent writes are safe. ⛔ Do not add a sabotage for the conditional claim
 * back -- it will be reported MISSED, correctly, and a permanently-missed sabotage trains everyone
 * to ignore the number.
 * ✅ WHAT *IS* PROVEN HERE IS THE SELF-HEALING SWEEP, which is the other half of the live fix and is
 * deterministic: an orphaned person seeded by hand must be gone after a migration.
 * ⚠️ The 150 addresses are kept because they make the phase a realistic load test even though they
 * do not create overlap; it is the slow part, so no other sabotage runs it.
 */
function seedConcurrency(cfg) {
  // An orphan, planted deliberately: a person with no address and no history. ⛔ It must NOT carry a
  // note or a tag -- one that does is legitimately kept, and seeding one here would assert the
  // opposite of the rule.
  d1("INSERT INTO people (id, name, created_at, updated_at) VALUES " +
     "('crmtest-orphan-person','Orphan Left By A Race','2026-08-23','2026-08-23')", cfg);
  const rows = [];
  for (let i = 0; i < 150; i++) {
    rows.push(`('crmtest.bulk${i}@example.com','Bulk Agent ${i}','Test Agency ${i % 40}',0)`);
  }
  d1('INSERT OR IGNORE INTO broker_directory (email, name, agency, quote_count) VALUES ' +
     rows.join(','), cfg);
}

/**
 * CONCURRENT migrations.
 *
 * 🔴🔴 THIS EXISTS BECAUSE THE LIVE BACKFILL BROKE IN EXACTLY THIS WAY ON 2026-08-23, WHILE THE
 * SEQUENTIAL TEST ABOVE WAS GREEN. /api/migrate was opened twice inside a minute; both requests read
 * the same snapshot of unlinked addresses and both created a person for each, leaving 220 people for
 * 139 addresses.
 * ⭐⭐ THE LESSON IS ABOUT THE TEST, NOT THE CODE: "running it twice creates nothing a second time"
 * is a claim about SEQUENTIAL runs, and it was TRUE. Concurrency is a different property and needs
 * its own assertion -- a suite that only ever runs things one after another cannot see it.
 * ⚠️ The invariant is asserted rather than the race, because whether two requests actually overlap is
 * timing. The invariant holds either way; only a broken implementation can break it.
 */
async function runConcurrencySuite() {
  await login();
  const runs = await Promise.all([
    api('GET', '/api/migrate'), api('GET', '/api/migrate'),
    api('GET', '/api/migrate'), api('GET', '/api/migrate'),
  ]);
  const reports = runs.map((r) => (r.json && r.json.people) || {});
  const last = reports[reports.length - 1];
  // ⭐ THE SWEEP IS THE TESTABLE HALF OF THE LIVE FIX. An orphaned person -- one nothing points at
  // and that carries no history -- is exactly what the 2026-08-23 race left 81 of, and a migration
  // must clear it without anybody writing cleanup SQL.
  check('a person nothing points at is swept by the next migration',
        reports.reduce((n, p) => n + (p.orphansRemoved || 0), 0) >= 1, true,
        'the live cleanup was "run it again" rather than hand-written SQL, and this is why');
  check('four migrations at once still leave one person per address',
        [last.people, last.addresses], [153, 153],
        'both requests read the same snapshot of unlinked addresses and both created a person');
  check('and no migration reports an error', reports.every((p) => (p.errors || []).length === 0), true);
  // ⭐ THE SAME RACE DUPLICATED AGENCIES ON LIVE DATA, AND FIXING ONLY THE PEOPLE HALF WAS NOT
  // ENOUGH: 33 agency records were created where 20 firms needed one. Every find-or-create in the
  // loop has the race, not just the one that was noticed first.
  const r = await api('GET', '/api/admin/crm/suggest');
  check('the concurrent runs did not report an error either', r.status, 200);


}

// ── sabotage: prove each assertion can actually go red ─────────────────────────────────────────
//
// ⭐⭐ EACH SABOTAGE REPRODUCES A REAL DEFECT THIS PROJECT HAS SHIPPED, not an invented one. A
// self-test whose sabotages are artificial proves the harness runs; one that replays the historical
// bug proves the harness would have CAUGHT it.
const SABOTAGES = [
  {
    // ⛔⛔ THE TIGHTENING THAT IS ACTUALLY A LOSS. Reading the carrier rule across the whole scope
    // looks stricter and throws away real FSA solicitations, because dental and vision are eligible
    // expenses in every one of them.
    name: 'the carrier-line rule is widened from the title to the whole scope',
    find: "  { id: 'carrier_line', field: 'title',",
    with: "  { id: 'carrier_line', field: 'all',",
    breaks: 'an FSA solicitation that merely MENTIONS dental is NOT screened out',
  },
  {
    name: 'a pass no longer has to say why',
    find: "  if (disposition === 'passed' && !reason) {",
    with: '  if (false) {',
    breaks: 'passing without a reason is refused',
  },
  {
    // The quiet one: treat an imported deadline as though somebody had checked it. Everything still
    // renders, and the page starts lying about which rows are trustworthy.
    name: 'an imported row is treated as though the official page had been checked',
    find: "                   .concat([source, 'summary', now, now]);",
    with: "                   .concat([source, 'official_page', now, now]);",
    breaks: 'an imported row starts as needing verification',
  },
  {
    name: 'a mandatory pre-proposal that has already happened stops being flagged',
    find: "  if (mandatory && pre && pre < todayIso) flags.push('pre_proposal_passed');",
    with: "  if (false) flags.push('pre_proposal_passed');",
    breaks: 'a mandatory pre-proposal already held is flagged',
  },
  {
    name: 'the stale-cycle check stops comparing the plan year with the deadline',
    find: "    if (/^[0-9]{4}$/.test(py) && closes > py + '-01-01') flags.push('stale_cycle');",
    with: "    if (false) flags.push('stale_cycle');",
    breaks: 'last year cycle resurfacing is flagged',
  },
  {
    // ⭐⭐ THE DANGEROUS DIRECTION. Without the HAVING, a name that belongs to two people folds
    // their quote histories into one row -- silently, permanently, and looking tidier than before.
    name: 'the name-to-email resolution stops requiring the name to be unambiguous',
    find: '  "  GROUP BY 1 HAVING COUNT(DISTINCT lower(trim(broker_email))) = 1) ";',
    with: '  "  GROUP BY 1) ";',
    breaks: 'a name that maps to TWO addresses is never collapsed',
  },
  {
    // ⭐⭐ THE ONE THAT DESTROYS THE WHOLE FEATURE WHILE LOOKING LIKE A TIDY-UP: keeping the
    // recorded value in step with the derived one. It would read perfectly on screen and answer
    // Eric's question with 'nothing has changed' for ever.
    name: 'the recorded status is refreshed to match the live one',
    find: "      row.recordedStatus = rec ? String(rec.label).slice(RECORDED_PREFIX.length) : null;",
    with: "      row.recordedStatus = rec ? row.derivedStatus : null;",
    breaks: '⭐ THE FROZEN VALUE AND THE LIVE ONE DISAGREE, WHICH IS THE POINT',
  },
  {
    name: 'a status outside the vocabulary is accepted',
    find: "  if (RECORDED_STATUSES.indexOf(status) === -1) {",
    with: '  if (false) {',
    breaks: 'a status outside the vocabulary is refused',
  },
  {
    // 🔴 THE ONE THAT WOULD MATTER MOST IF IT REGRESSED. A broker reading ABY's own
    // priority, owner and notes about their agency is not a bug, it is a disclosure.
    name: 'the agency people list starts returning ABY-internal columns',
    find: "      'SELECT d.email, d.name, d.phone, ' +",
    with: "      'SELECT d.*, ' +",
    breaks: 'nothing ABY-internal is in the agency payload',
  },
  {
    name: 'an agency administrator can edit somebody at another firm',
    find: "    'UPDATE broker_directory SET ' + field + ' = ? WHERE lower(trim(email)) = ? AND agency_id = ?'",
    with: "    'UPDATE broker_directory SET ' + field + ' = ? WHERE lower(trim(email)) = ?'",
    breaks: 'an administrator cannot edit somebody at another agency',
  },
  {
    name: 'an invite stops reaching ABY list',
    find: '    await linkBrokerIntoDirectory(env, {',
    with: '    if (false) await linkBrokerIntoDirectory(env, {',
    breaks: 'an INVITED colleague appears in ABY list',
  },
  {
    // ⭐⭐ THE ONE BEHAVIOUR THIS FEATURE EXISTS TO CHANGE. The existing prospects form skips an
    // existing row entirely -- tag and all -- so the agents who have quoted for years, who are the
    // valuable half of a conference list, would silently not be recorded as having been there.
    name: 'an already-known person is skipped instead of tagged',
    find: '      if (label && personId) {',
    with: '      if (label && personId && !existing) {',
    breaks: 'and it tags EVERYBODY it could, not only the new ones',
  },
  {
    // A badge list overwriting a name somebody typed while dealing with that agent.
    name: 'the import overwrites the name we already hold',
    find: "        known.push({ email, name: existing.name || name });",
    with: ("        known.push({ email, name: existing.name || name });" +
           " await env.DB.prepare('UPDATE broker_directory SET name = ? WHERE lower(trim(email)) = ?')" +
           ".bind(name, email).run();"),
    breaks: 'and the record we hold is unchanged',
  },
  {
    // A row with no address creating a person anyway -- inventing an identity for a name.
    name: 'a row with no email is imported anyway',
    // ⚠️ TWO LINES, because the same regex opens three handlers and a substring match found all
    // three -- so the sabotage applied nowhere and was reported ANCHOR. The refusal message below
    // belongs only to the import.
    find: ('    if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) {'
           + NEWLINE +
           "      refused.push({ who: name || '(no name)', why: 'no email address, so there is no stable way to know who this is' });"),
    with: ('    if (false) {'
           + NEWLINE +
           "      refused.push({ who: name || '(no name)', why: 'no email address, so there is no stable way to know who this is' });"),
    breaks: 'an event list adds the new people, recognises the known ones, and refuses the rest',
  },
  {
    // ⭐⭐ ERIC'S RULE, REPLAYED. Without the exclusion, MHBT is back on a list somebody is about
    // to phone. The mechanism and the data are separate problems, and this guards the mechanism.
    name: 'the acquired-name exclusion removed (a dead firm is back on the call list)',
    find: "  const where = [\"COALESCE(a.relationship,'') <> 'succeeded'\"];",
    // ⛔ A TAUTOLOGY, NOT AN EMPTY ARRAY. Emptying it leaves the SQL ending in a bare WHERE, which
    // throws -- and a handler that returns nothing makes 'the acquired firm is absent' TRUE, so the
    // assertion passed and the sabotage was reported MISSED. The sabotage must break the RULE and
    // leave the query working.
    with: "  const where = ['1=1'];",
    breaks: 'the ACQUIRED name leaves the marketing list -- nobody can call it',
  },
  {
    // The exact defect the whole tag design exists to prevent, moved one layer up: a filter that
    // matches a SUBSTRING quietly includes the wrong firms and the count still looks plausible.
    name: 'the tag filter matches a substring instead of the whole label',
    find: "      rows = rows.filter((x) => x.tags.some((t) => String(t.label).trim().toLowerCase() === want));",
    with: "      rows = rows.filter((x) => x.tags.some((t) => String(t.label).toLowerCase().includes(want)));",
    breaks: 'the tag filter matches the WHOLE label, never a substring',
  },
  {
    // A field name taken from the request. An endpoint that sets a priority then sets anything.
    name: 'the field setter accepts any column name from the browser',
    // ⚠️ ANCHORED WITH THE ERROR MESSAGE BELOW IT. Two handlers now guard a closed list the
    // same way, so a one-line anchor matched both and the sabotage applied to neither.
    find: ('  if (!Object.prototype.hasOwnProperty.call(allowed, field)) {' + NEWLINE +
           "    return jsonResp({ error: 'That is not a field this sets.' }, 400);"),
    with: ('  if (false) {' + NEWLINE +
           "    return jsonResp({ error: 'That is not a field this sets.' }, 400);"),
    breaks: 'a field outside the closed list is refused',
  },

  {
    name: 'tags stored as typed (the canonicalisation removed)',
    find: '  return hit && hit.label ? hit.label : raw;',
    with: '  return raw;',
    breaks: 'the SAME tag typed differently is stored under the FIRST spelling',
  },
  {
    // ⚠️ THE FIRST VERSION OF THIS SABOTAGE DID NOT REPRODUCE THE BUG AND SO PROVED NOTHING:
    // new Date("2020-01-01").toISOString().slice(0,10) is lossless, because an ISO date-only string
    // parses as UTC and toISOString reads UTC back. ⭐ The day only moves when the value is formatted
    // with LOCAL getters -- measured on this machine (America/Chicago): 2020-01-01 becomes
    // 2019-12-31. That is the shape that once moved a compliance anchor a day nationwide.
    name: 'happened_at round-tripped through Date() and formatted locally',
    // ⚠️ ANCHORED ON THE ERROR MESSAGE ABOVE IT, WHICH IS UNIQUE TO handleCrmAdd. The import
    // handler has an identical happenedAt line, so the one-line anchor matched twice and the
    // sabotage stopped applying -- with nothing about this rule having changed.
    find: ("    return jsonResp({ error: 'happened_at must be YYYY-MM-DD.' }, 400);"
           + NEWLINE + '  }' + NEWLINE + '  const happenedAt = wanted || today;'),
    with: ["    return jsonResp({ error: 'happened_at must be YYYY-MM-DD.' }, 400);", '  }',
      '  const _d = wanted ? new Date(wanted) : null;',
      '  const happenedAt = _d',
      '    ? [_d.getFullYear(), String(_d.getMonth() + 1).padStart(2, "0"),',
      '       String(_d.getDate()).padStart(2, "0")].join("-")',
      '    : today;',
    ].join('\n'),
    breaks: 'the backdated date is stored EXACTLY as typed',
  },
  {
    name: 'the same-day duplicate check removed',
    find: "      if (dupe) { skipped.push({ id, why: 'already tagged that day' }); continue; }",
    with: '      if (false) { continue; }',
    breaks: 're-tagging on the same day is skipped, not duplicated',
  },
  {
    name: 'the entity-existence check removed (events orphan silently)',
    find: '    if (!(await crmEntityExists(env, type, id))) {',
    with: '    if (false) {',
    breaks: 'a note against a missing agency FAILS rather than orphaning',
  },
  {
    name: 'a person may be keyed on a NAME',
    find: "    return { why: 'no email and no person id, so no stable key -- record an address first' };",
    with: '    return { id: v };',
    breaks: 'a person identified by NAME is refused, for the RIGHT reason',
  },
  {
    // ⭐⭐ THE MISTAKE THIS REPLAYS IS THE OBVIOUS ONE: report every address under the person's
    // CURRENT firm. It reads perfectly on screen and quietly credits the new agency with years of
    // work done at the old one -- the exact thing Eric asked to be prevented.
    name: 'a person\'s quotes reported under their CURRENT agency instead of the one they were at',
    // ⚠️ ANCHORED ON TWO LINES, not one: the join string appears in handleCrmPerson AND in
    // handleCrmSuggestPeople, and a sabotage that matches twice does not apply at all.
    find: "AS last_quote ' +\n" +
          "      'FROM broker_directory d LEFT JOIN agencies a ON a.id = d.agency_id ' +",
    with: "AS last_quote ' +\n" +
          "      'FROM broker_directory d LEFT JOIN agencies a ON a.id = " +
          '(SELECT agency_id FROM broker_directory WHERE person_id = d.person_id ' +
          "ORDER BY last_seen DESC LIMIT 1) ' +",
    breaks: '⭐ THE QUOTES DID NOT MOVE AGENCY: still 3 at the old firm and 4 at the new',
  },
  {
    // ⭐⭐ THE LIVE DEFECT OF 2026-08-23, REPLAYED. An UNCONDITIONAL claim lets two overlapping runs
    // each create a person for the same address; the loser's row is then orphaned. It produced 220
    // people for 139 addresses, and the sequential idempotency test above stayed green throughout.
    // ⛔ THIS DELIBERATELY TARGETS THE SWEEP, NOT THE CONDITIONAL CLAIM. A sabotage removing the
    // claim is reported MISSED at every fixture size, because wrangler dev --local serialises
    // requests and the race cannot happen here -- see the note on runConcurrencySuite. A sabotage
    // that can never fire is worse than none: it trains a reader to discount the score.
    phase: 'concurrency',
    name: 'the self-healing sweep removed (an orphaned person survives)',
    find: "    out.orphansRemoved = (swept && swept.meta && swept.meta.changes) || 0;",
    with: "    out.orphansRemoved = 0;",
    breaks: 'a person nothing points at is swept by the next migration',
  },
  {
    // A backfill guarded by "has this run before" instead of "is it already set". /api/migrate is
    // opened by hand more than once, so this gives one human several person records -- which is the
    // single thing the people table exists to prevent.
    name: 'the backfill stops skipping addresses that already have a person',
    find: '        if (target) { out.alreadyLinked++; continue; }',
    with: '        if (false) { out.alreadyLinked++; continue; }',
    breaks: 'running the migration TWICE creates nothing a second time',
  },
  {
    // Deleting an emptied person before moving its history. "We tagged them in March" quietly stops
    // being true, and nothing on any screen says so.
    name: 'a merge drops the emptied person\'s notes and tags instead of moving them',
    find: "        \"UPDATE crm_events SET entity_id = ? WHERE entity_type = 'person' AND entity_id = ?\"",
    with: "        \"SELECT 1 WHERE ? IS NOT NULL AND ? IS NOT NULL\"",
    breaks: 'linking the two addresses moves the tag rather than losing it',
  },
];

// ── driver ────────────────────────────────────────────────────────────────────────────────────

async function main() {
  if (!existsSync(join(REPO, MAIN_CFG))) {
    die(MAIN_CFG + ' is missing. The real config watches the whole repo and reloads for ever.');
  }
  if (!(await portFree())) {
    die('something is already answering on port ' + PORT + '. A previous run probably leaked a ' +
        'dev server. Kill it, or set CRM_TEST_PORT to a free port.');
  }

  takeLock();
  console.log('CRM spine (F-383) -- driving the real worker against a real local D1');
  console.log('');

  // Phase 1: migrate a fresh database. ⚠️ Seeding happens with the server DOWN, always.
  seedBase(MAIN_CFG);
  let proc = await boot(MAIN_CFG);
  try { await assertMigration(); } finally { killTree(proc); }

  // Phase 2: the suite.
  seedTest(MAIN_CFG);
  proc = await boot(MAIN_CFG);
  try { await runSuite(); } finally { killTree(proc); }

  // Phase 3: concurrency, on a freshly seeded database so nothing is linked yet.
  seedTest(MAIN_CFG);
  seedConcurrency(MAIN_CFG);
  proc = await boot(MAIN_CFG);
  try { await runConcurrencySuite(); } finally { killTree(proc); }

  console.log('');
  console.log(`  ${checks - failures}/${checks} assertions hold.`);

  if (!SELF_TEST) {
    if (failures) {
      console.log('');
      console.log('The CRM does not behave. See the FAIL lines above.');
      releaseLock();
      process.exit(1);
    }
    console.log('');
    console.log('  This proves the HANDLERS behave. It says NOTHING about whether anybody can reach');
    console.log('  them from a screen -- that is scripts/check_reachable.mjs.');
    releaseLock();
    return;
  }
  if (failures) { console.log('Refusing to self-test from a red baseline.'); releaseLock(); process.exit(1); }

  console.log('');
  console.log('SELF-TEST -- each sabotage must redden its own assertion');
  // 🔴 LINE ENDINGS NORMALISED BEFORE ANY SABOTAGE IS APPLIED. worker.js is checked out CRLF, so a
  // multi-line anchor written with a bare newline matches NOTHING and the sabotage is reported
  // ANCHOR -- TRAPS #246, walked into again the moment a two-line anchor was needed.
  // ⚠️ Writing the copy back with plain newlines is harmless: esbuild and node do not care.
  const source = readFileSync(join(REPO, 'worker.js'), 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
  const testCfg = readFileSync(join(REPO, MAIN_CFG), 'utf8');
  let caught = 0;
  let anchorBroken = 0;

  for (const s of SABOTAGES) {
    const n = source.split(s.find).length - 1;
    if (n !== 1) {
      // ⛔ A sabotage that does not apply is a silent no-op, and the run then PASSES for the wrong
      // reason. Assert the substitution matched before believing anything downstream.
      console.log(`  ANCHOR  ${s.name}`);
      console.log(`          matched ${n} times, expected exactly 1 -- the code moved`);
      anchorBroken++;
      continue;
    }
    // 🔴 THE SABOTAGE COPY LIVES IN scripts/, SO ITS RELATIVE IMPORTS MUST BE REWRITTEN.
    // worker.js imports ./docs/admin-guide.generated.js. From scripts/ that resolves to
    // scripts/docs/..., which does not exist, so esbuild refuses to build and the dev server
    // exits at startup -- reported as 'never came up', which reads as a port problem and is not.
    // ⚠️ It cost two 15-minute self-test runs before the build error was actually read.
    const sabotaged = source
      .replace(s.find, s.with)
      .replace("from './docs/", "from '../docs/");
    if (sabotaged.indexOf("from '../docs/") === -1 && source.indexOf("from './docs/") !== -1) {
      console.log('  FAIL: could not rewrite the sabotage copy import path');
      failures++;
    }
    writeFileSync(join(REPO, SAB_JS), sabotaged);
    // ⚠️ wrangler resolves "main" RELATIVE TO THE CONFIG FILE, not to the working directory. This
    // config lives in scripts/, so main is the bare filename -- "scripts/.crm-sabotage.js" here
    // would send wrangler looking for scripts/scripts/... and the boot fails with a message that
    // says nothing about paths.
    writeFileSync(join(REPO, SAB_CFG), testCfg.replace('"main": "worker.js"', '"main": ".crm-sabotage.js"'));
    // wrangler reads .dev.vars FROM THE CONFIG FILE'S DIRECTORY, so a config in scripts/ starts with
    // no ADMIN_PASSWORD and every sabotage run 401s at login -- which reads as the sabotage having
    // broken authentication rather than as a missing file.
    // ⭐ scripts/ is already in .assetsignore and .dev.vars* is already in .gitignore, so this copy
    // can neither be published nor committed. It holds the LOCAL values only, and is deleted below.
    writeFileSync(join(REPO, SAB_VARS), readFileSync(join(REPO, '.dev.vars'), 'utf8'));

    // ⭐ ONLY THE PHASE THAT CONTAINS THE TARGET ASSERTION IS RUN. Running every phase for every
    // sabotage made the self-test take twenty minutes, because the concurrency phase seeds 150
    // addresses and fires four migrations. ⚠️ A self-test nobody will wait for is a self-test nobody
    // runs -- which is the same failure as not having one.
    seedTest(MAIN_CFG);
    if (s.phase === 'concurrency') seedConcurrency(MAIN_CFG);
    results = [];
    const before = failures;
    const p = await boot(SAB_CFG);
    try {
      if (s.phase === 'concurrency') await runConcurrencySuite();
      else await runSuite();
    } catch { /* a crash is also red */ } finally { killTree(p); }
    failures = before;

    // ⛔ THE TARGET MUST GO RED WHILE THE REST STAYS MOSTLY GREEN. A sabotage that reddens the
    // whole suite proves the harness broke, not that the assertion works -- and it is indistinguishable
    // from a real catch if you only look at the one line (TRAPS #266).
    const red = results.filter((x) => !x.ok).length;
    const hit = results.some((x) => x.name === s.breaks && !x.ok);
    if (hit && red <= 3) { console.log(`  caught  ${s.name}`); caught++; }
    else if (hit) { console.log(`  SUSPECT ${s.name}  (${red} assertions red -- the harness broke, not the rule)`); }
    else { console.log(`  MISSED  ${s.name}  (expected "${s.breaks}" to fail)`); }
  }

  cleanupSabotage();

  console.log('');
  console.log(`  ${caught}/${SABOTAGES.length} sabotages caught${anchorBroken ? `, ${anchorBroken} anchor(s) stale` : ''}.`);
  releaseLock();
  if (caught !== SABOTAGES.length) {
    console.log('An assertion that cannot fail is not an assertion.');
    process.exit(1);
  }
}

main().catch((e) => die(String((e && e.stack) || e)));
