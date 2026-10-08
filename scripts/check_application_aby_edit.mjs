// check_application_aby_edit.mjs - can ABY add or change answers on a SUBMITTED application without touching the
// employer's submission or signature, and is every answer ABY writes marked as ABY's? (10-07-2026, Eric: "Niels would
// like to add some missing answers. Is there a way to edit or add? We need to be able to do that.")
//
// Runs the real handlers in lib/application.js against node:sqlite wrapped to look like D1 (the same harness as
// check_application_signature.mjs). Sabotage it with  --sabotage  : the admin save then also writes the employer's
// status, and the check must go red.
//
//   node scripts/check_application_aby_edit.mjs [--sabotage]
import { DatabaseSync } from 'node:sqlite';
import {
  APPLICATION_MIGRATIONS, handleSubmitApplication, handleGetApplication, handleSaveApplication,
  handleAdminSaveApplication, handleAdminReopenApplication, applicationForExport,
} from '../lib/application.js';

let fails = 0;
const check = (name, cond, detail) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : '  <- ' + detail));
  if (!cond) fails++;
};
const SABOTAGE = process.argv.includes('--sabotage');

function d1(db) {
  return {
    prepare(sql) {
      // The sabotage: an admin save that also flips the row back to draft (what a careless "reopen and edit" would do).
      if (SABOTAGE && /^UPDATE applications SET answers = \?, updated_at = \? WHERE id = \?$/.test(sql)) {
        sql = "UPDATE applications SET answers = ?, updated_at = ?, status = 'draft' WHERE id = ?";
      }
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
const db = new DatabaseSync(':memory:');
db.exec("CREATE TABLE quotes (id TEXT, quote_number TEXT, client_name TEXT, effective_date TEXT, broker_name TEXT, " +
        "broker_agency TEXT, broker_phone TEXT, broker_email TEXT, products TEXT, share_token TEXT)");
db.exec("CREATE TABLE commitments (id TEXT, share_token TEXT, submitted_at TEXT, employer_name TEXT, products TEXT, " +
        "address TEXT, city_state_zip TEXT, auth_signer TEXT, auth_title TEXT, auth_email TEXT, auth_phone TEXT, " +
        "hr_contact TEXT, hr_title TEXT, hr_email TEXT, hr_phone TEXT, start_date TEXT, broker_email TEXT)");
APPLICATION_MIGRATIONS.forEach((m) => db.exec(m.sql));
db.prepare('INSERT INTO quotes VALUES (?,?,?,?,?,?,?,?,?,?)').run('q1', 'TX000001-TEST-C', 'Test Employer', '2027-01-01',
  'Broker', 'Agency', '', 'b@example.invalid', JSON.stringify([{ id: 'hra', name: 'Health Reimbursement Arrangement' }]), TOKEN);
db.prepare('INSERT INTO commitments (id, share_token, submitted_at, employer_name, products) VALUES (?,?,?,?,?)')
  .run('c1', TOKEN, '2026-10-01T00:00:00Z', 'Test Employer', JSON.stringify(['HRA']));
const env = { DB: d1(db) };

const SIG = 'data:image/png;base64,' + 'A'.repeat(20000);
const admin = (answers) => handleAdminSaveApplication(new Request('https://x.test/api/admin/application/answers',
  { method: 'POST', body: JSON.stringify({ cid: 'c1', answers }) }), env);
const get = async () => (await handleGetApplication(TOKEN, env)).json();

console.log('ABY ADDS ANSWERS TO A SUBMITTED APPLICATION (10-07-2026)' + (SABOTAGE ? '  [SABOTAGE]' : '') + '\n');

let r = await handleSubmitApplication(TOKEN, new Request('https://x.test', { method: 'POST', body: JSON.stringify({
  submittedBy: 'Pat Employer', submittedEmail: 'pat@example.invalid', confirmed: true, signatureImage: SIG,
  answers: { 'co.legalName': 'Test Employer' } }) }), env, null, null);
check('the employer submits and signs', r.status === 200, String(r.status));
const before = await get();

r = await admin({ 'co.legalName': 'Test Employer', 'notes.anythingElse': 'Added by Niels on the phone', 'not.a.question': 'x' });
let j = await r.json();
check('ABY can save on a SUBMITTED application', r.status === 200 && j.ok && j.changed === 1, r.status + ' ' + JSON.stringify(j));
let after = await get();
check('the answer ABY added is there', after.answers['notes.anythingElse'] === 'Added by Niels on the phone', JSON.stringify(after.answers));
check('...and it is MARKED as ABY\'s', !!(after.abyAdded && after.abyAdded['notes.anythingElse']), JSON.stringify(after.abyAdded));
check('the employer\'s own answer is NOT marked (it did not change)', !after.abyAdded['co.legalName'], JSON.stringify(after.abyAdded));
check('a key that is not a question is dropped', after.answers['not.a.question'] === undefined, JSON.stringify(after.answers));
check('the submission is untouched: still submitted, same signer, same time', after.status === 'submitted' &&
  after.submittedBy === before.submittedBy && after.submittedAt === before.submittedAt, after.status + ' ' + after.submittedAt);
check('the signature is untouched', after.signatureImage === SIG, String(after.signatureImage).slice(0, 30));
check('the page never sees the internal marks key', after.answers._aby === undefined, Object.keys(after.answers).join());

r = await handleSaveApplication(TOKEN, new Request('https://x.test', { method: 'POST', body: JSON.stringify({ answers: { 'co.legalName': 'Hack' } }) }), env);
check('the employer\'s link is still read-only after ABY edits', r.status === 409, String(r.status));

const ex = await applicationForExport(env, TOKEN);
check('the export carries what ABY added, apart from the answers', ex && ex.aby_added && ex.aby_added['notes.anythingElse'] &&
  ex.answers._aby === undefined, JSON.stringify(ex && ex.aby_added));

r = await admin({ 'co.legalName': 'Test Employer' , 'notes.anythingElse': '' });
after = await get();
check('ABY can blank an answer it added, and the mark goes with it',
  after.answers['notes.anythingElse'] === undefined && !after.abyAdded['notes.anythingElse'], JSON.stringify(after));

// Reopened for the employer: their own change to an ABY answer makes it theirs again.
await admin({ 'co.legalName': 'Test Employer', 'notes.anythingElse': 'ABY wrote this' });
await handleAdminReopenApplication(new Request('https://x.test', { method: 'POST', body: JSON.stringify({ cid: 'c1' }) }), env);
await handleSaveApplication(TOKEN, new Request('https://x.test', { method: 'POST', body: JSON.stringify({
  answers: { 'co.legalName': 'Test Employer', 'notes.anythingElse': 'The employer rewrote it' } }) }), env);
after = await get();
check('after a reopen, an answer the employer rewrites is no longer marked ABY\'s',
  after.answers['notes.anythingElse'] === 'The employer rewrote it' && !after.abyAdded['notes.anythingElse'], JSON.stringify(after.abyAdded));
await handleSaveApplication(TOKEN, new Request('https://x.test', { method: 'POST', body: JSON.stringify({
  answers: { 'co.legalName': 'Test Employer', 'notes.anythingElse': 'The employer rewrote it' } }) }), env);
check('an employer save keeps no stray marks key in their answers', (await get()).answers._aby === undefined, '');

// Eric, 10-07-2026: "definitely don't keep that for anything we answer before it's submitted."
const T2 = 'zyxwvutsrqpnmkjh';
db.prepare('INSERT INTO quotes VALUES (?,?,?,?,?,?,?,?,?,?)').run('q2', 'TX000002-TEST-C', 'Paper Co', '2027-01-01',
  'Broker', 'Agency', '', 'b@example.invalid', JSON.stringify([{ id: 'hra', name: 'Health Reimbursement Arrangement' }]), T2);
db.prepare('INSERT INTO commitments (id, share_token, submitted_at, employer_name, products) VALUES (?,?,?,?,?)')
  .run('c2', T2, '2026-10-01T00:00:00Z', 'Paper Co', JSON.stringify(['HRA']));
const admin2 = (answers) => handleAdminSaveApplication(new Request('https://x.test/api/admin/application/answers',
  { method: 'POST', body: JSON.stringify({ cid: 'c2', answers }) }), env);
const get2 = async () => (await handleGetApplication(T2, env)).json();
r = await admin2({ 'co.ein': '12-3456789' });
let g2 = await get2();
check('ABY filling in an UNSUBMITTED application marks nothing', g2.answers['co.ein'] === '12-3456789'
  && Object.keys(g2.abyAdded || {}).length === 0 && g2.status === 'draft', JSON.stringify(g2.abyAdded));
// a mark written before this rule (New Metals, 10-07-2026) is cleared by the next ABY save, even one that changes nothing
db.prepare('UPDATE applications SET answers = ? WHERE share_token = ?').run(JSON.stringify({ 'co.ein': '12-3456789',
  _aby: { 'co.ein': { at: '2026-10-07T00:00:00Z', value: '12-3456789' } } }), T2);
check('(setup) the stale mark shows before the save', Object.keys((await get2()).abyAdded || {}).length === 1, '');
await admin2({ 'co.ein': '12-3456789' });
g2 = await get2();
check('an older mark on an unsubmitted application is dropped by the next ABY save',
  Object.keys(g2.abyAdded || {}).length === 0 && g2.answers['co.ein'] === '12-3456789', JSON.stringify(g2.abyAdded));

console.log(fails ? '\n' + fails + ' failed' : '\nall green');
if (fails) process.exit(1);
