// check_application_signature.mjs - does the finished application get SIGNED, and does the closing
// free-text box keep what the employer wrote? (Eric and Niels, 10-01-2026)
//
// Runs the real handlers in lib/application.js against a real SQLite database (Node's built-in
// node:sqlite, wrapped to look like D1), so no wrangler, no network and no npm cache is involved -
// `npx wrangler` is the thing that keeps breaking on this machine (EBUSY), and this check must not
// depend on it.
//
//   node scripts/check_application_signature.mjs
import { DatabaseSync } from 'node:sqlite';
import {
  APPLICATION_MIGRATIONS, handleSubmitApplication, handleGetApplication, handleSaveApplication,
  applicationForExport,
} from '../lib/application.js';

let fails = 0;
const check = (name, cond, detail) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : '  <- ' + detail));
  if (!cond) fails++;
};

// A D1 look-alike: prepare(sql).bind(...).first() / .run() / .all().
function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
      };
      return st;
    },
  };
}

const TOKEN = 'abcdefghjkmnpqrs';
function freshDb({ migrateSignature }) {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE quotes (id TEXT, quote_number TEXT, client_name TEXT, effective_date TEXT, broker_name TEXT, " +
          "broker_agency TEXT, broker_phone TEXT, broker_email TEXT, products TEXT, share_token TEXT)");
  db.exec("CREATE TABLE commitments (id TEXT, share_token TEXT, submitted_at TEXT, employer_name TEXT, products TEXT, " +
          "address TEXT, city_state_zip TEXT, auth_signer TEXT, auth_title TEXT, auth_email TEXT, auth_phone TEXT, " +
          "hr_contact TEXT, hr_title TEXT, hr_email TEXT, hr_phone TEXT, start_date TEXT, broker_email TEXT)");
  APPLICATION_MIGRATIONS.forEach((m) => {
    if (!migrateSignature && /signature_image/.test(m.sql)) return;
    db.exec(m.sql);
  });
  db.prepare('INSERT INTO quotes VALUES (?,?,?,?,?,?,?,?,?,?)').run('q1', 'TX000001-TEST-C', 'Test Employer', '2027-01-01',
    'Broker', 'Agency', '', 'b@example.invalid', JSON.stringify([{ id: 'hra', name: 'Health Reimbursement Arrangement' }]), TOKEN);
  db.prepare('INSERT INTO commitments (id, share_token, submitted_at, employer_name, products) VALUES (?,?,?,?,?)')
    .run('c1', TOKEN, '2026-10-01T00:00:00Z', 'Test Employer', JSON.stringify(['HRA']));
  return { env: { DB: d1(db) }, db };
}

// A real-sized drawn signature: ~20 KB of PNG data URL, the size a 600x160 pad produces.
const SIG = 'data:image/png;base64,' + 'A'.repeat(20000);
const post = (body) => new Request('https://x.test/api/q/' + TOKEN + '/application/submit',
  { method: 'POST', body: JSON.stringify(body) });
const base = { submittedBy: 'Pat Employer', submittedEmail: 'pat@example.invalid', confirmed: true,
  answers: { 'co.legalName': 'Test Employer', 'notes.anythingElse': 'Please start in January; we have a question about debit cards.' } };

console.log('APPLICATION SIGNATURE AND THE ANYTHING-ELSE BOX (10-01-2026)\n');

{
  const { env } = freshDb({ migrateSignature: true });
  let r = await handleSubmitApplication(TOKEN, post(base), env, null, null);
  let j = await r.json();
  check('a submit with NO signature is refused, and says why', r.status === 400 && j.error === 'unsigned', r.status + ' ' + JSON.stringify(j));

  r = await handleSubmitApplication(TOKEN, post({ ...base, signatureImage: 'data:image/jpeg;base64,xx' }), env, null, null);
  check('a signature that is not a PNG drawing is refused', r.status === 400, String(r.status));

  r = await handleSubmitApplication(TOKEN, post({ ...base, signatureImage: SIG }), env, null, null);
  j = await r.json();
  check('a signed submit is accepted (a real-sized drawing is not "too large")', r.status === 200 && j.ok, r.status + ' ' + JSON.stringify(j));

  r = await handleGetApplication(TOKEN, env);
  j = await r.json();
  check('a submit that is the FIRST write (nothing typed after the prefill) is recorded as submitted',
    j.status === 'submitted', String(j.status));
  check('the page gets the signature back to show it', j.signatureImage === SIG, String(j.signatureImage).slice(0, 40));
  check('the anything-else answer is kept', j.answers['notes.anythingElse'] === base.answers['notes.anythingElse'], JSON.stringify(j.answers));

  const ex = await applicationForExport(env, TOKEN);
  check('the JSON export carries the signature', ex && ex.signature_image === SIG, ex ? String(ex.signature_image).slice(0, 40) : 'null');
  check('the JSON export labels the anything-else answer for a person',
    ex && ex.answers_labeled.some((a) => a.key === 'notes.anythingElse' && a.section === 'Anything else'), JSON.stringify(ex && ex.answers_labeled));

  r = await handleSaveApplication(TOKEN, new Request('https://x.test', { method: 'POST', body: JSON.stringify({ answers: { 'co.legalName': 'Changed' } }) }), env);
  check('once signed and submitted, the answers cannot be changed through the link', r.status === 409, String(r.status));
}

{
  // The deploy ships before somebody opens /api/migrate (TRAPS #519). That gap must cost the
  // signature at worst, never the employer's submit.
  const { env } = freshDb({ migrateSignature: false });
  const r = await handleSubmitApplication(TOKEN, post({ ...base, signatureImage: SIG }), env, null, null);
  check('before the database is migrated, a signed submit still goes through', r.status === 200, String(r.status));
  const j = await (await handleGetApplication(TOKEN, env)).json();
  check('...and the answers are saved, with the signature honestly missing', j.status === 'submitted' && j.signatureImage === null,
    j.status + ' ' + String(j.signatureImage));
}

console.log(fails ? '\n' + fails + ' failed' : '\nall green');
process.exit(fails ? 1 : 0);
