// node scripts/check_sessions_and_saves.mjs - 11-23-2026. Runs the REAL worker on an in-memory database: who may save over a
// quote, what an unanswered agency invitation shows, and what a sign-in is worth.   Another tree: ABY_WORKER=<path to worker.js>
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
const W = (await import(process.env.ABY_WORKER ? pathToFileURL(process.env.ABY_WORKER).href : '../worker.js')).default;
globalThis.fetch = async () => new Response('{}');   // no email ever leaves this check
const db = new DatabaseSync(':memory:');
const st = (sql) => {
  let a = [];
  const o = {
    bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return o; },
    async first() { return db.prepare(sql).get(...a) || null; },
    async run() { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; },
    async all() { return { results: db.prepare(sql).all(...a) }; },
  };
  return o;
};
db.exec(`CREATE TABLE brokers (id TEXT, email TEXT, password_hash TEXT, name TEXT, agency TEXT, phone TEXT, logo_data_url TEXT, agency_id TEXT, role TEXT, created_at TEXT, last_login_at TEXT, reset_token TEXT, reset_expires TEXT, handoff_token TEXT, handoff_expires TEXT);
CREATE TABLE agencies (id TEXT, name TEXT, share_quotes INTEGER, logo_data_url TEXT);
CREATE TABLE people (id TEXT, name TEXT, created_at TEXT, updated_at TEXT, agency_id TEXT);
CREATE TABLE broker_directory (email TEXT, name TEXT, phone TEXT, agency TEXT, agency_id TEXT, first_seen TEXT, last_seen TEXT, quote_count INTEGER, person_id TEXT, source TEXT);
CREATE TABLE admin_login_fails (ip TEXT, at TEXT);
CREATE TABLE quotes (id TEXT, quote_number TEXT, created_at TEXT, client_name TEXT, effective_date TEXT, broker_name TEXT, broker_agency TEXT, broker_phone TEXT, broker_email TEXT, rep_name TEXT, rep_phone TEXT, rep_email TEXT, commission_included INTEGER, products TEXT, ran_by TEXT, ran_by_who TEXT, state TEXT, adjustment TEXT, adjustment_note TEXT, client_id TEXT, client_match_key TEXT, version INTEGER, quote_family TEXT, revision INTEGER, agency_id TEXT, share_token TEXT, resolved_pricing TEXT, status TEXT, first_year_value REAL, employee_count INTEGER);`);
const env = { DB: { prepare: st, batch: async (l) => Promise.all(l.map((x) => x.run())) }, ADMIN_PASSWORD: 'office-pass', ADMIN_PASSWORD_ERIC: 'eric-pass', SESSION_SECRET: 'x'.repeat(48) };
let fail = 0;
const ok = (n, c) => { console.log((c ? '  ok   ' : '  FAIL ') + n); if (!c) fail++; };
const call = (path, method, body, cookie, e = env) => W.fetch(new Request('https://local.test' + path, {
  method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
}), e, { waitUntil() {} });
const cookieOf = (r) => (r.headers.get('Set-Cookie') || '').split(';')[0];

db.exec("INSERT INTO agencies VALUES ('A','Firm A',0,''),('B','Firm B',0,'')");
const person = async (id, agency, role) => {
  db.prepare('INSERT INTO brokers (id,email,password_hash,agency_id,role,reset_token,reset_expires) VALUES (?,?,?,?,?,?,?)')
    .run(id, id + '@x.com', '', agency, role, 'tok-' + id, '2099-01-01');
  return cookieOf(await call('/api/broker/set-password', 'POST', { token: 'tok-' + id, password: 'longpassword-' + id }));
};
const ann = await person('ann', 'A', 'member'), asst = await person('asst', 'A', 'member');
const boss = await person('boss', 'A', 'admin'), bob = await person('bob', 'B', 'admin');

// WHO MAY SAVE OVER A QUOTE
const save = (c, no, over = {}) => call('/api/quotes', 'POST', { quoteNumber: no, clientName: 'Co', brokerEmail: 'ann@x.com', products: [{ id: 'hra' }], ...over }, c);
const client = (no) => (db.prepare('SELECT client_name n FROM quotes WHERE quote_number = ?').get(no) || {}).n;
const N = 'TX261123-1111-C';
ok('a broker saves their own quote', (await save(ann, N)).status === 200 && client(N) === 'Co');
ok('...and saves it again, changed', (await save(ann, N, { clientName: 'Co 2' })).status === 200 && client(N) === 'Co 2');
const r = await save(bob, N, { clientName: 'Stolen', brokerEmail: 'bob@x.com', resolvedPricing: [{ x: 1 }] });
ok('another broker cannot save over it by its number', r.status === 403 && client(N) === 'Co 2' && (await r.json()).notYours === true);
ok('...nor change its stored price', !db.prepare('SELECT resolved_pricing p FROM quotes WHERE quote_number=?').get(N).p);
ok('...nor save a version of it', (await save(bob, N, { saveAsNewVersion: true, brokerEmail: 'bob@x.com' })).status === 403);
ok('a colleague cannot while the agency does not share', (await save(asst, N, { clientName: 'Z' })).status === 403);
ok('their administrator can', (await save(boss, N, { clientName: 'Co 3' })).status === 200 && client(N) === 'Co 3');
db.exec("UPDATE agencies SET share_quotes = 1 WHERE id = 'A'");
ok('a colleague can once the agency shares', (await save(asst, N, { clientName: 'Co 4' })).status === 200);
db.exec("UPDATE agencies SET share_quotes = 0 WHERE id = 'A'");
ok("an assistant saves and re-saves a quote under a producer's email",
  (await save(asst, 'TX261123-2222-C')).status === 200 && (await save(asst, 'TX261123-2222-C', { clientName: 'Again' })).status === 200);

// THE LOG'S VALUE (Eric, 11-24-2026): a re-run moves it, whether or not anything else changed; a save with no value keeps it.
const V = 'TX261124-3333-C', worth = () => db.prepare('SELECT first_year_value v FROM quotes WHERE quote_number=?').get(V).v;
await save(ann, V, { firstYearValue: 1660 });
ok('a first save records the value', worth() === 1660);
await save(ann, V, { firstYearValue: 1685, products: [{ id: 'cobra' }] });
ok('a re-run updates the value', worth() === 1685);
await save(ann, V, { firstYearValue: 1700, products: [{ id: 'cobra' }] });
ok('...and a re-open with nothing else changed corrects it', worth() === 1700);
await save(ann, V, { products: [{ id: 'fsa' }] });
ok('...and a save without a value keeps it', worth() === 1700);

// ABY
let eric = '';
for (const p of ['/api/admin/login', '/api/login', '/admin/login']) {
  const x = await call(p, 'POST', { password: 'eric-pass' });
  if (cookieOf(x).startsWith('aby_admin')) { eric = cookieOf(x); break; }
}
ok('ABY signs in by name', /^aby_admin=eric\./.test(eric));
ok('ABY may save over any quote', (await save(eric, N, { clientName: 'ABY' })).status === 200 && client(N) === 'ABY');

// WHAT A SIGN-IN IS WORTH
const me = async (c, e = env) => (await (await call('/api/broker/me', 'GET', null, c, e)).json()).broker;
const admin = async (c, e = env) => (await call('/api/admin/brokers', 'GET', null, c, e)).status !== 401;
ok('a broker stays signed in', ((await me(ann)) || {}).email === 'ann@x.com');
ok('ABY stays signed in', await admin(eric));
const real = Date.now;
Date.now = () => real() + 1000 * 60 * 60 * 24 * 31;
ok("a broker's sign-in ends after 30 days", !(await me(ann)));
ok("ABY's sign-in ends after 30 days", !(await admin(eric)));
Date.now = real;
const later = (c) => c.replace(/\.(\d{13})\./, (_, t) => '.' + (Number(t) + 9e9) + '.');
ok('a later end date written into the cookie is refused', later(ann) !== ann && !(await me(later(ann))) && !(await admin(later(eric))));
const forge = async (pw, text) => {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(text)))));
};
ok('knowing the office password does not make a broker sign-in', !(await me('aby_broker=ann.' + await forge('office-pass', 'aby-broker-v1:ann'))));
ok('the old kind of ABY sign-in is refused', !(await admin('aby_admin=eric.' + await forge('eric-pass', 'aby-admin-v1:eric'))));
db.exec("UPDATE brokers SET reset_token='again', reset_expires='2099-01-01' WHERE id='ann'");
const ann2 = cookieOf(await call('/api/broker/set-password', 'POST', { token: 'again', password: 'another-long-one' }));
ok('a new password signs the old sign-in out, and the new one in', !(await me(ann)) && !!(await me(ann2)));
ok('a changed ABY password signs that login out', !(await admin(eric, { ...env, ADMIN_PASSWORD_ERIC: 'new' })));
ok('no SESSION_SECRET: nobody is signed in', !(await me(ann2, { ...env, SESSION_SECRET: '' })) && !(await admin(eric, { ...env, SESSION_SECRET: '' })));
ok('the password hash never reaches the page', !JSON.stringify(await me(ann2)).includes('pbkdf2'));

// AN INVITATION NOBODY ANSWERED
db.exec("INSERT INTO broker_directory (email,name,phone,person_id) VALUES ('carl@x.com','Carl','555','p1')");
db.exec("INSERT INTO quotes (id,quote_number,client_name,broker_email,products,created_at) VALUES ('q-carl','TX261101-9999-C','Carl Client','carl@x.com','[]','2026-11-01')");
const firm = async (c) => JSON.stringify((await (await call('/api/agency/quotes', 'GET', null, c)).json()).quotes);
ok('an invitation is made', (await call('/api/agency/invite', 'POST', { people: [{ email: 'carl@x.com' }] }, bob)).status === 200
  && !!db.prepare("SELECT 1 x FROM brokers WHERE email='carl@x.com'").get());
ok("unanswered, it shows none of the person's quotes", !(await firm(bob)).includes('Carl Client'));
ok('...opens none', (await call('/api/broker/quote-link', 'POST', { quoteId: 'q-carl' }, bob)).status === 404);
ok('...does not list their phone or how much they quote', !(await (await call('/api/agency/people', 'GET', null, bob)).text()).includes('555'));
ok('...and lets nobody save over their quote', (await save(bob, 'TX261101-9999-C', { brokerEmail: 'bob@x.com' })).status === 403);
const tok = db.prepare("SELECT reset_token t FROM brokers WHERE email='carl@x.com'").get().t;
await call('/api/broker/set-password', 'POST', { token: tok, password: 'carl-long-password' });
ok('once they accept, the administrator sees their quotes', (await firm(bob)).includes('Carl Client'));
ok('...and the people list has them', (await (await call('/api/agency/people', 'GET', null, bob)).text()).includes('555'));
ok('...and they are in the firm', db.prepare("SELECT agency_id a FROM broker_directory WHERE email='carl@x.com'").get().a === 'B');
console.log(fail ? `\n${fail} failed` : '\ncheck_sessions_and_saves: all passed');
process.exit(fail ? 1 : 0);
