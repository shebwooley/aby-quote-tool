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
  die('the local worker never came up on port ' + PORT + '.\n  ' + log.split('\n').slice(-12).join('\n  '));
  return proc;
}

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
  d1('CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, quote_number TEXT, created_at TEXT, ' +
     'broker_email TEXT, broker_agency TEXT, source_tag TEXT, notes TEXT)', cfg);
  d1('CREATE TABLE IF NOT EXISTS broker_directory (email TEXT PRIMARY KEY, name TEXT, phone TEXT, ' +
     'agency TEXT, first_seen TEXT, last_seen TEXT, quote_count INTEGER)', cfg);
}

/** Test rows. Run with the server DOWN, and after the migration has created `agencies`. */
function seedTest(cfg) {
  d1('DELETE FROM crm_events', cfg);
  d1("DELETE FROM agencies WHERE id LIKE 'test-agency-%'", cfg);
  d1(`DELETE FROM broker_directory WHERE email = '${AGENT_EMAIL}'`, cfg);
  d1('INSERT INTO agencies (id, name) VALUES ' +
     AGENCIES.map((a) => `('${a.id}','${a.name}')`).join(','), cfg);
  d1('INSERT INTO broker_directory (email, name, agency, quote_count) VALUES ' +
     `('${AGENT_EMAIL}','CRM Test Agent','Test Agency 0',0)`, cfg);
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
  check('happened_at defaults to today', note.happened_at, TODAY);
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
  r = await api('POST', '/api/admin/crm', { kind: 'tag', label: TAG_FIRST, entities: [{ type: 'agent', id: 'Jason Sandler' }] });
  // ⭐⭐ ASSERT ON THE REASON, NOT ONLY ON THE COUNTS, AND THAT IS THE WHOLE POINT OF THIS ONE.
  // Two guards refuse this input: the email test here, and the existence lookup behind it. Counting
  // failures cannot tell them apart -- so with the email test removed the assertion still passed,
  // and the self-test reported the sabotage MISSED. The REASON is what distinguishes them.
  const nameFail = (r.json && r.json.detail && r.json.detail.failed && r.json.detail.failed[0]) || {};
  check('an agent identified by NAME is refused, for the RIGHT reason',
        [r.json && r.json.written, r.json && r.json.failed, String(nameFail.why || '').includes('no stable key')],
        [0, 1, true],
        'never invent an id for a name -- that is how one person becomes two records');
  r = await api('POST', '/api/admin/crm',
                { kind: 'tag', label: TAG_FIRST, entities: [{ type: 'agent', id: AGENT_EMAIL.toUpperCase() }] });
  check('an agent IS taggable by email, case-insensitively', r.json && r.json.written, 1);

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
}

// ── sabotage: prove each assertion can actually go red ─────────────────────────────────────────
//
// ⭐⭐ EACH SABOTAGE REPRODUCES A REAL DEFECT THIS PROJECT HAS SHIPPED, not an invented one. A
// self-test whose sabotages are artificial proves the harness runs; one that replays the historical
// bug proves the harness would have CAUGHT it.
const SABOTAGES = [
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
    find: '  const happenedAt = wanted || today;',
    with: [
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
    name: 'an agent may be keyed on a NAME',
    find: '      if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(id)) {',
    with: '      if (false) {',
    breaks: 'an agent identified by NAME is refused, for the RIGHT reason',
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

  console.log('');
  console.log(`  ${checks - failures}/${checks} assertions hold.`);

  if (!SELF_TEST) {
    if (failures) {
      console.log('');
      console.log('The CRM does not behave. See the FAIL lines above.');
      process.exit(1);
    }
    console.log('');
    console.log('  This proves the HANDLERS behave. It says NOTHING about whether anybody can reach');
    console.log('  them from a screen -- that is scripts/check_reachable.mjs.');
    return;
  }
  if (failures) { console.log('Refusing to self-test from a red baseline.'); process.exit(1); }

  console.log('');
  console.log('SELF-TEST -- each sabotage must redden its own assertion');
  const source = readFileSync(join(REPO, 'worker.js'), 'utf8');
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
    writeFileSync(join(REPO, SAB_JS), source.replace(s.find, s.with));
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

    seedTest(MAIN_CFG);
    results = [];
    const before = failures;
    const p = await boot(SAB_CFG);
    try { await runSuite(); } catch { /* a crash is also red */ } finally { killTree(p); }
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
  if (caught !== SABOTAGES.length) {
    console.log('An assertion that cannot fail is not an assertion.');
    process.exit(1);
  }
}

main().catch((e) => die(String((e && e.stack) || e)));
