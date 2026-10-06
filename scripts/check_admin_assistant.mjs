// check_admin_assistant - the ABY admin assistant reads and drafts, and can never write (F-603, 10-06-2026).
//
//   · the lookup gate passes a plain SELECT (and WITH ... SELECT) and refuses every write, a second
//     statement, and a write hidden after a WITH
//   · only Eric and Niels may use it (Eric: "Me and Niels only at first"); the office login is refused
//   · its only tool is the read-only lookup
//   · a missing model key answers "not switched on yet" before anything else happens
//   · every door exists: Draft a note on a Today follow-up, Look into this on all three tidy screens, the
//     question box on the quote log, and each of those pages loads the screen half
//
//   node scripts/check_admin_assistant.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../worker.js', import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const out = [];
const ok = (n, c) => out.push([n, !!c]);

// Pull the gate out of worker.js and run it: a copy here would test the copy.
const start = src.indexOf('function assistLookupSafe(');
const end = src.indexOf('\n}\n', start) + 3;
ok('the lookup gate is found', start > 0 && end > start);
const assistLookupSafe = new Function(src.slice(start, end) + '; return assistLookupSafe;')();

const pass = ['SELECT * FROM quotes LIMIT 5', 'select count(*) from agencies;', 'WITH x AS (SELECT 1 AS n) SELECT n FROM x',
  "SELECT name FROM agencies WHERE notes LIKE '%updated_at%' LIMIT 3"];
for (const q of pass) ok('passes: ' + q, assistLookupSafe(q) !== null);
const refuse = ['DELETE FROM quotes', 'UPDATE quotes SET status = 1', 'INSERT INTO quotes (id) VALUES (1)', 'DROP TABLE quotes',
  'SELECT 1; DELETE FROM quotes', 'WITH x AS (SELECT 1) DELETE FROM quotes', 'PRAGMA table_info(quotes)',
  'ATTACH DATABASE x AS y', 'select * from quotes; select 1', 'REPLACE INTO quotes (id) VALUES (1)', '', '   '];
for (const q of refuse) ok('refuses: ' + (q.trim() || '(empty)'), assistLookupSafe(q) === null);

ok('only Eric and Niels may use it', /const ASSIST_PEOPLE = \['eric', 'niels'\];/.test(src));
ok('and the handler checks it first', /if \(!ASSIST_PEOPLE\.includes\(who\)\) return jsonResp/.test(src));
ok('the route hands the handler WHO', src.includes("withAuth(request, env, (who) => handleAdminAssistant(request, env, who))"));
ok('a missing key says so before anything else', /if \(!env\.ANTHROPIC_API_KEY\) return jsonResp/.test(src));
const tools = src.slice(src.indexOf('const tools = [{', src.indexOf('async function handleAdminAssistant')), src.indexOf('const messages = [', src.indexOf('async function handleAdminAssistant')));
ok('its only tool is the lookup', (tools.match(/name: '/g) || []).length === 1 && tools.includes("name: 'look_up'"));
ok('every lookup goes through the gate', /const safe = assistLookupSafe\(sql\);/.test(src));

ok('door: Draft a note on a Today follow-up', src.includes('data-assist="followup"') && src.includes('Draft a note'));
ok('door: Look into this, same person twice', src.includes('data-assist="tidy-people"'));
ok('door: Look into this, two records for one firm', src.includes('data-assist="tidy-firms"'));
ok('door: Look into this, a firm named for a person', src.includes('data-assist="tidy-named"'));
ok('door: the question box on the quote log', src.includes('id="aaQuestion"') && src.includes('data-assist="ask"'));
ok('the screen half is loaded by all three pages', (src.match(/<script src="\/assets\/js\/admin-assist\.js"><\/script>/g) || []).length === 3);
const client = readFileSync(new URL('../public/assets/js/admin-assist.js', import.meta.url), 'utf8');
ok('the screen half posts to the route', client.includes("fetch('/api/admin/assistant'"));
ok('and says nothing was saved or sent', client.includes('Nothing has been saved or sent.'));

let fail = 0;
for (const [n, c] of out) { console.log((c ? 'ok    ' : 'FAIL  ') + n); if (!c) fail++; }
if (out.length < 25) { console.log('FAIL  only ' + out.length + ' rules ran'); fail++; }
console.log('\ncheck_admin_assistant - ' + (out.length - fail) + ' of ' + out.length + ' passed');
process.exit(fail ? 1 : 0);
