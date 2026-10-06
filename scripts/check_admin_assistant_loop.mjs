// check_admin_assistant_loop - runs the assistant's real server code (lifted out of worker.js) against a
// stub database and a stub model, so the loop is proven before a real key exists (F-603, 10-06-2026).
//
//   · the office login is refused (403); no key answers 503 and calls nothing
//   · a follow-up: the facts are fetched for the right broker key, the model's lookup runs, the model's
//     WRITE attempt is refused and never reaches the database, the draft comes back with what it looked up
//
//   node scripts/check_admin_assistant_loop.mjs
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../worker.js', import.meta.url), 'utf8').split(String.fromCharCode(13)).join('');
const a = src.indexOf('const ASSIST_MODEL');
const b = src.indexOf('async function withAuth(', a);
const block = src.slice(a, b);

const out = [];
const ok = (n, c) => out.push([n, !!c]);

const ran = [];
let spentSoFar = 0;
function stubDB() {
  return {
    prepare(sql) {
      const st = { sql, args: [] };
      st.bind = (...x) => { st.args = x; return st; };
      st.all = async () => { ran.push({ sql: st.sql, args: st.args }); return { results: [{ client_name: 'Acme Dental', created_at: '2026-08-02' }] }; };
      st.first = async () => { ran.push({ sql: st.sql, args: st.args }); return /assist_usage/.test(st.sql) ? { dollars: spentSoFar } : { id: 1, name: 'x' }; };
      st.run = async () => { ran.push({ sql: st.sql, args: st.args }); return {}; };
      return st;
    },
  };
}
const jsonResp = (data, status = 200) => ({ status, data });

let calls = 0;
const fakeFetch = async (url, init) => {
  calls++;
  const body = JSON.parse(init.body);
  if (calls === 1) return { ok: true, json: async () => ({ stop_reason: 'tool_use', usage: { input_tokens: 1000000, output_tokens: 0 }, content: [
    { type: 'tool_use', id: 't1', name: 'look_up', input: { sql: 'SELECT client_name FROM quotes LIMIT 3', why: 'their open quotes' } },
    { type: 'tool_use', id: 't2', name: 'look_up', input: { sql: 'DELETE FROM quotes', why: 'tidying' } },
  ] }) };
  fakeFetch.lastMessages = body.messages;
  return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Subject: Your open quotes' }] }) };
};

const make = new Function('jsonResp', 'fetch', block + '; return handleAdminAssistant;');
const handle = make(jsonResp, fakeFetch);
const req = (body) => ({ json: async () => body });

let r = await handle(req({ job: 'followup', key: 'b@x.com' }), { DB: stubDB(), ANTHROPIC_API_KEY: 'k' }, 'office');
ok('the office login is refused', r.status === 403);
r = await handle(req({ job: 'followup', key: 'b@x.com' }), { DB: stubDB() }, 'eric');
ok('no key: 503 and the model is never called', r.status === 503 && calls === 0);
r = await handle(req({ job: 'nope' }), { DB: stubDB(), ANTHROPIC_API_KEY: 'k' }, 'niels');
ok('an unknown job is refused', r.status === 400);

ran.length = 0;
r = await handle(req({ job: 'followup', key: 'B@X.com', label: 'Bob at X' }), { DB: stubDB(), ANTHROPIC_API_KEY: 'k' }, 'eric');
ok('a follow-up draft comes back', r.status === 200 && r.data.ok && /Your open quotes/.test(r.data.text));
ok('the facts were fetched for that broker, lower-cased', ran.some((q) => /COALESCE\(status,'P'\)='P'/.test(q.sql) && q.args[0] === 'b@x.com'));
ok("the model's lookup ran", ran.some((q) => q.sql === 'SELECT client_name FROM quotes LIMIT 3'));
ok("the model's DELETE never reached the database", !ran.some((q) => /delete/i.test(q.sql)));
ok('and it is reported as refused', (r.data.looked || []).some((l) => l.refused && l.why === 'tidying'));
const lastTool = (fakeFetch.lastMessages || []).slice(-1)[0];
ok('the model was told the write was refused', JSON.stringify(lastTool || {}).includes('Refused: only one plain SELECT'));
ok('the model was called twice (lookup, then answer)', calls === 2);
const charges = ran.filter((q) => /INSERT INTO assist_usage/.test(q.sql));
ok('each answer is charged to this month', charges.length === 2 && charges[0].args[0] === new Date().toISOString().slice(0, 7));
ok('a million input tokens is charged as $3', charges[0].args[1] === 3);

// The $20 cap (Eric, 10-06-2026).
spentSoFar = 20; calls = 0;
r = await handle(req({ job: 'ask', question: 'how many quotes?' }), { DB: stubDB(), ANTHROPIC_API_KEY: 'k' }, 'eric');
ok('at $20 spent this month the assistant refuses', r.status === 429 && /\$20 limit/.test(r.data.error));
ok('and the model is never called', calls === 0);
spentSoFar = 19.5; calls = 0;
r = await handle(req({ job: 'ask', question: 'how many quotes?' }), { DB: stubDB(), ANTHROPIC_API_KEY: 'k' }, 'eric');
ok('under the cap it answers', r.status === 200);

let fail = 0;
for (const [n, c] of out) { console.log((c ? 'ok    ' : 'FAIL  ') + n); if (!c) fail++; }
if (out.length < 15) { console.log('FAIL  only ' + out.length + ' rules ran'); fail++; }
console.log('\ncheck_admin_assistant_loop - ' + (out.length - fail) + ' of ' + out.length + ' passed');
process.exit(fail ? 1 : 0);
