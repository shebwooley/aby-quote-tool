// node scripts/check_commitment_link.mjs - 11-23-2026. Runs the REAL worker on an in-memory table: a quote NUMBER alone never
// opens the private link; the id or the token still does; and the Commitments tab escapes what the public form sent.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const W = (await import('../worker.js')).default;
const d1 = (db) => ({ prepare(sql) { let a = []; const st = { bind(...x) { a = x; return st; }, async first() { return db.prepare(sql).get(...a) || null; },
  async run() { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, async all() { return { results: db.prepare(sql).all(...a) }; } }; return st; } });
const db = new DatabaseSync(':memory:');
db.exec("CREATE TABLE quotes (id TEXT, quote_number TEXT, client_name TEXT, effective_date TEXT, broker_name TEXT, broker_agency TEXT, broker_phone TEXT, broker_email TEXT, products TEXT, share_token TEXT, status TEXT, committed_at TEXT, adjustment TEXT, state TEXT, resolved_pricing TEXT, created_at TEXT)");
db.exec("CREATE TABLE commitments (id TEXT, quote_number TEXT, share_token TEXT, quote_id TEXT, submitted_at TEXT, employer_name TEXT, products TEXT, address TEXT, city_state_zip TEXT, auth_signer TEXT, auth_title TEXT, auth_email TEXT, auth_phone TEXT, hr_contact TEXT, hr_title TEXT, hr_email TEXT, hr_phone TEXT, start_date TEXT, accepted_print TEXT, accepted_sign TEXT, client_id TEXT, broker_email TEXT, signature_image TEXT, notified_at TEXT, notify_error TEXT)");
const q = (id, no, tok) => db.prepare('INSERT INTO quotes (id, quote_number, client_name, products, share_token, status, state, resolved_pricing, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, no, 'Co', '[]', tok, 'P', 'TX', '{"x":1}', '2026-11-01');
q('q-1', 'TX261101-1111-C', null); q('q-2', 'TX261101-2222-C', 'realtokenabcdefg');
let fail = 0; const ok = (n, c) => { console.log((c ? '  ok   ' : '  FAIL ') + n); if (!c) fail++; };
const post = async (b) => (await W.fetch(new Request('https://local.test/api/commitments', { method: 'POST', body: JSON.stringify({ employerName: 'X', authSigner: 'X', products: ['HRA'], ...b }) }), { DB: d1(db) }, { waitUntil: (p) => p })).json();
let r = await post({ quoteNumber: 'TX261101-1111-C' });
ok('a number alone: no link back', !r.applyUrl);
ok('...and no link is made for the quote', db.prepare("SELECT share_token t FROM quotes WHERE id='q-1'").get().t === null);
ok('...but the signature is recorded against its quote', db.prepare('SELECT quote_id q FROM commitments WHERE id=?').get(r.id)?.q === 'q-1');
r = await post({ quoteNumber: 'TX261101-2222-C' });
ok('a number alone on a shared quote: no link back, and it does not stand in for the real signature', !r.applyUrl && !db.prepare('SELECT share_token t FROM commitments WHERE id=?').get(r.id)?.t);
ok('the quote id still gives the link', /\/q\/\w+\/apply$/.test((await post({ quoteNumber: 'TX261101-1111-C', quoteId: 'q-1' })).applyUrl || ''));
ok('the token still gives the link', ((await post({ quoteNumber: 'TX261101-2222-C', shareToken: 'realtokenabcdefg' })).applyUrl || '').includes('realtokenabcdefg'));
// The page's own escaper, taken from the page as the worker writes it.
const src = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
const body = /function escDeep\(v, skip\) \{[\s\S]*?\n\}\n/.exec(src.replace(/\r\n/g, '\n'))?.[0];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escDeep = body ? new Function('esc', body + 'return escDeep;')(esc) : (x) => x;
const bad = '<img src=x onerror=alert(1)>"';
const out = JSON.stringify(escDeep({ employer_name: bad, n: 3, products: '["A & B"]' }, 'products')) + JSON.stringify(escDeep([bad, { name: bad, fees: [{ label: bad }] }]));
ok('every value the Commitments tab and the Download print is escaped', !out.includes('<') && out.includes('&lt;img') && out.includes('[\\"A & B\\"]'));
ok('the tab draws from the escaped copy', /rows\.map\(function\(raw\) \{[\s\S]{0,300}var c = escDeep\(raw, 'products'\)/.test(src.replace(/\r\n/g, '\n')) && /products = escDeep\(JSON\.parse\(raw\.products/.test(src));
console.log(fail ? `\n${fail} failed` : '\ncheck_commitment_link: all passed'); process.exit(fail ? 1 : 0);
