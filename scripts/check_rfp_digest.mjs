#!/usr/bin/env node
/**
 * check_rfp_digest.mjs -- does the Monday RFP search's report land on the admin's RFP Watch?
 *
 * Eric, 10-12-2026: the weekly search wrote a Drive file and a phone notification he never saw, so in
 * two weeks no lead reached /admin/rfp-watch. The routine now POSTs to /api/rfp-watch/digest and reads
 * /api/rfp-watch/open. This drives the REAL worker over HTTP against a LOCAL D1 (TRAPS #206).
 *
 * Run:            node scripts/check_rfp_digest.mjs
 * Prove it works: node scripts/check_rfp_digest.mjs --self-test
 *
 * EXITS 2, NEVER 0, IF IT COULD NOT RUN.
 * Shares the local database AND the lock with check_crm.mjs, so the two can never overlap.
 * Every wrangler call is --local. Nothing here can reach the real database.
 */

import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.RFP_TEST_PORT || 8797);
const BASE = 'http://127.0.0.1:' + PORT;
const SELF_TEST = process.argv.includes('--self-test');
const WIN = process.platform === 'win32';
const NPX = WIN ? 'npx.cmd' : 'npx';
const MAIN_CFG = 'wrangler.test.jsonc';
const SAB_JS = join('scripts', '.rfp-sabotage.js');
const SAB_CFG = join('scripts', '.rfp-sabotage.jsonc');
// wrangler reads .dev.vars beside the CONFIG, so the sabotage config needs its own copy (the local
// admin password); without it every login is a 401 and the run stops.
const SAB_VARS = join('scripts', '.dev.vars');
const PERSIST = ['--persist-to', join(REPO, '.wrangler', 'state')];
const LOCK = join(REPO, 'scripts', '.crm-check.lock');
const TOKEN = 'rfp-test-token-' + process.pid;
const RUN1 = '2026-10-05', RUN2 = '2026-10-12';

let failures = 0, checks = 0;
const failed = new Set();
function check(name, got, want) {
  checks++;
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { failures++; failed.add(name); }
  if (!QUIET) {
    console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + name);
    if (!ok) console.log('         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want));
  }
}
let QUIET = false;

function die(msg) {
  console.log('\nCANNOT RUN: ' + msg);
  rmSync(LOCK, { force: true });
  rmSync(join(REPO, SAB_JS), { force: true }); rmSync(join(REPO, SAB_CFG), { force: true }); rmSync(join(REPO, SAB_VARS), { force: true });
  process.exit(2);
}

function localAdminPassword() {
  const f = join(REPO, '.dev.vars');
  if (!existsSync(f)) die('.dev.vars is missing, so there is no local admin password.');
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^ADMIN_PASSWORD\s*=\s*(.*)$/.exec(line.trim());
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  die('.dev.vars has no ADMIN_PASSWORD line.');
}

let cookie = '';
async function api(method, path, body, headers) {
  const init = { method, headers: Object.assign({}, headers || {}), redirect: 'manual' };
  if (cookie) init.headers.Cookie = cookie;
  if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const r = await fetch(BASE + path, init);
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* non-JSON is itself a finding */ }
  return { status: r.status, json, text };
}
const bearer = (t) => ({ Authorization: 'Bearer ' + t });

function d1(sql, cfg) {
  const f = join(tmpdir(), 'rfp-seed-' + process.pid + '.sql');
  writeFileSync(f, sql.endsWith(';') ? sql : sql + ';');
  const r = spawnSync(NPX, ['wrangler', 'd1', 'execute', 'aby-quotes', '--local', '--config', cfg, '--file', f, ...PERSIST],
                      { cwd: REPO, encoding: 'utf8', shell: WIN });
  rmSync(f, { force: true });
  if (r.status !== 0) die('seeding the local database failed.\n  ' + String(r.stderr || r.stdout || '').split('\n').slice(-8).join('\n  '));
}

function killTree(proc) {
  if (!proc || proc.exitCode !== null) return;
  if (WIN) spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { encoding: 'utf8' });
  else proc.kill('SIGTERM');
}
async function portFree() {
  try { await fetch(BASE + '/api/quotes-ping', { redirect: 'manual' }); return false; } catch { return true; }
}
async function boot(cfg, withToken) {
  for (let i = 0; i < 30 && !(await portFree()); i++) await new Promise((s) => setTimeout(s, 500));
  const vars = withToken ? ['--var', 'RFP_WATCH_TOKEN:' + TOKEN] : [];
  const proc = spawn(NPX, ['wrangler', 'dev', '--local', '--config', cfg, '--port', String(PORT),
                           '--inspector-port', '0', ...vars, ...PERSIST],
                     { cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'], shell: WIN });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; }); proc.stderr.on('data', (d) => { log += d; });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) die('the local worker exited while starting.\n  ' + log.split('\n').slice(-12).join('\n  '));
    try { const r = await fetch(BASE + '/api/quotes-ping', { redirect: 'manual' }); if (r.status) return proc; } catch { /* not up */ }
    await new Promise((s) => setTimeout(s, 700));
  }
  killTree(proc);
  die('nothing answered on port ' + PORT + ' within 90s. The log names the cause:\n  ' + log.split('\n').slice(-14).join('\n  '));
}

function clearFixtures(cfg) {
  d1("DELETE FROM rfp_decision WHERE opportunity_id IN (SELECT id FROM rfp_opportunity WHERE entity_name LIKE 'RFPTEST%')", cfg);
  d1("DELETE FROM rfp_opportunity WHERE entity_name LIKE 'RFPTEST%'", cfg);
  d1("DELETE FROM crm_events WHERE entity_type = 'rfp_digest'", cfg);
}

const TABLE =
  '| Entity | Entity type | State | Title | Number | Scope | Posted | Due | Official URL | Notes |\n' +
  '|---|---|---|---|---|---|---|---|---|---|\n' +
  '| RFPTEST Region Service Center | special_district | TX | Employee Benefits Enrollment Administrative Services | 27-01 | Section 125 cafeteria plan administration | | 2099-11-03 | https://example.com/r4 | test row |\n' +
  '| RFPTEST No Title Agency | city | TX |  | 1 | COBRA | | 2099-11-03 | | a row with no title must be refused, out loud |\n';

async function suite() {
  // The gate. A missing or wrong token is refused before anything is read or written.
  check('no token is refused', (await api('POST', '/api/rfp-watch/digest', { table: TABLE })).status, 401);
  check('a wrong token is refused', (await api('POST', '/api/rfp-watch/digest', { table: TABLE }, bearer('nope'))).status, 401);
  check('the open list is gated too', (await api('GET', '/api/rfp-watch/open')).status, 401);

  let r = await api('POST', '/api/rfp-watch/digest', { runDate: RUN1, summary: 'TEXAS\nOne lead.', table: TABLE }, bearer(TOKEN));
  check('first report: 1 added', r.json && r.json.added, 1);
  check('first report: the no-title row refused, not invented', r.json && r.json.refused.length, 1);

  r = await api('POST', '/api/rfp-watch/digest', { runDate: RUN1, summary: 'TEXAS\nRe-run.', table: TABLE }, bearer(TOKEN));
  check('the same lead reported again is recognised, not doubled', [r.json && r.json.added, r.json && r.json.known], [0, 1]);

  r = await api('GET', '/api/rfp-watch/open', undefined, bearer(TOKEN));
  const mine = ((r.json && r.json.open) || []).filter((o) => /^RFPTEST/.test(o.entity));
  check('the open list carries the lead so next week re-checks it', mine.map((o) => [o.entity, o.number, o.closes_at]),
        [['RFPTEST Region Service Center', '27-01', '2099-11-03']]);

  // A quiet week still reports, and becomes the newest run.
  r = await api('POST', '/api/rfp-watch/digest', { runDate: RUN2, summary: 'Nothing strong this week.', table: 'No rows this week.' }, bearer(TOKEN));
  check('a week with no rows is not a parse failure', [r.status, r.json && r.json.added, r.json && r.json.refused.length], [200, 0, 0]);

  cookie = '';
  const lr = await api('POST', '/api/admin/login', { password: localAdminPassword() });
  if (lr.status !== 200) die('could not log in to the local worker (status ' + lr.status + ').');
  r = await api('GET', '/api/admin/rfp');
  const d = r.json && r.json.lastDigest;
  check('the admin page reads the NEWEST run', d && d.runDate, RUN2);
  check('and shows what it said', d && d.summary, 'Nothing strong this week.');
  const listed = ((r.json && r.json.rows) || []).filter((x) => /^RFPTEST/.test(x.entity_name)).map((x) => [x.entity_name, x.disposition]);
  check('the lead is on the admin list as new, for a person to decide', listed, [['RFPTEST Region Service Center', 'new']]);
  cookie = '';
}

async function unsetSuite() {
  check('with the secret unset the endpoint is closed (503), never open',
        (await api('POST', '/api/rfp-watch/digest', { table: TABLE }, bearer('anything'))).status, 503);
}

async function runAll(cfg) {
  clearFixtures(cfg);
  let proc = await boot(cfg, true);
  try { await suite(); } finally { killTree(proc); }
  proc = await boot(cfg, false);
  try { await unsetSuite(); } finally { killTree(proc); }
  clearFixtures(cfg);
}

const SABOTAGES = [
  { name: 'the gate accepts any token', find: 'if (!m || !safeEqual(m[1], expected)) return jsonResp', replace: 'if (false) return jsonResp', reddens: 'a wrong token is refused' },
  { name: 'the duplicate match is skipped', find: "      const existing = await rfpFindExisting(env, rec);\n      if (existing) { known.push({ entity: rec.entity_name, title: rec.title }); continue; }\n      await rfpInsert(env, rec, 'digest');",
    replace: "      await rfpInsert(env, rec, 'digest');", reddens: 'the same lead reported again is recognised, not doubled' },
  { name: 'an unset secret is let through', find: "  if (!expected) return jsonResp({ error: 'This endpoint is not configured.' }, 503);\n  const m = /^Bearer",
    replace: "  const m = /^Bearer", reddens: 'with the secret unset the endpoint is closed (503), never open' },
  { name: 'the page reads the OLDEST run', find: "'ORDER BY happened_at DESC, created_at DESC LIMIT 1'", replace: "'ORDER BY happened_at ASC, created_at ASC LIMIT 1'", reddens: 'the admin page reads the NEWEST run' },
];

async function main() {
  if (!existsSync(join(REPO, MAIN_CFG))) die(MAIN_CFG + ' is missing.');
  if (!(await portFree())) die('something is already answering on port ' + PORT + '.');
  if (existsSync(LOCK)) die('check_crm.mjs or this check is already running (scripts/.crm-check.lock). They share one local database.');
  writeFileSync(LOCK, new Date().toISOString() + ' pid ' + process.pid);

  // The real migration creates the tables, so the fixture holds no second copy of the schema.
  let proc = await boot(MAIN_CFG, true);
  try {
    await api('POST', '/api/admin/login', { password: localAdminPassword() });
    const m = await api('GET', '/api/migrate');
    if (m.status !== 200) die('/api/migrate answered ' + m.status + ' on the local database.');
    cookie = '';
  } finally { killTree(proc); }

  console.log('RFP Watch weekly report -- the real worker against a local D1');
  await runAll(MAIN_CFG);
  console.log('\n  ' + (checks - failures) + '/' + checks + ' assertions hold.');
  if (failures) { rmSync(LOCK, { force: true }); process.exit(SELF_TEST ? 1 : 1); }
  if (!SELF_TEST) { rmSync(LOCK, { force: true }); return; }

  console.log('\nSELF-TEST -- each sabotage must redden its own assertion');
  // The copy lives in scripts/, so worker.js's own relative imports ('./lib/...', './docs/...') are
  // re-pointed one level up; left alone, every sabotage fails to BUILD and would read as caught.
  const source = readFileSync(join(REPO, 'worker.js'), 'utf8').split('\r\n').join('\n')
    .split("from './lib/").join("from '../lib/").split("from './docs/").join("from '../docs/");
  const cfgText = readFileSync(join(REPO, MAIN_CFG), 'utf8').replace('"main": "worker.js"', '"main": "./.rfp-sabotage.js"');
  let caught = 0;
  for (const s of SABOTAGES) {
    if (source.indexOf(s.find) === -1) { console.log('  ANCHOR ' + s.name + ' -- the sabotage text is not in worker.js'); continue; }
    writeFileSync(join(REPO, SAB_JS), source.replace(s.find, s.replace));
    writeFileSync(join(REPO, SAB_CFG), cfgText);
    writeFileSync(join(REPO, SAB_VARS), readFileSync(join(REPO, '.dev.vars'), 'utf8'));
    failures = 0; failed.clear(); QUIET = true;
    await runAll(SAB_CFG);
    QUIET = false;
    const hit = failed.has(s.reddens);
    if (hit) caught++;
    console.log('  ' + (hit ? 'caught ' : 'MISSED ') + s.name + (hit ? '' : ' (expected "' + s.reddens + '" to go red)'));
  }
  rmSync(join(REPO, SAB_JS), { force: true }); rmSync(join(REPO, SAB_CFG), { force: true }); rmSync(join(REPO, SAB_VARS), { force: true });
  rmSync(LOCK, { force: true });
  console.log('\n  ' + caught + '/' + SABOTAGES.length + ' sabotages caught.');
  process.exit(caught === SABOTAGES.length ? 0 : 1);
}

main().catch((e) => die(String(e && e.stack || e)));
