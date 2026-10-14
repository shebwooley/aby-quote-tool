// check_application_uploads.mjs - the secure census / bank-details upload (C18, 10-14-2026).
//
// Runs the real handlers in lib/uploads.js against a real SQLite database (node:sqlite wrapped to look
// like D1) and an in-memory stand-in for the R2 bucket. No wrangler, no network.
//
// What it holds the upload to: write-only through the employer's link, downloads only through the admin
// route (and always as an attachment), signed links only, the type / size / count limits, and the
// 90-day purge.
//
//   node scripts/check_application_uploads.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  handleUpload, handleListUploads, handleAdminListUploads, handleAdminDownload, purgeExpiredUploads, handleAdminDeleteUpload,
  uploadsForExport, cleanFileName, UPLOAD_MAX_FILES,
} from '../lib/uploads.js';
import {
  handleCreateRequest, handleListRequests, handleCloseRequest, handlePublicRequest, adminSecureUploadsHTML,
} from '../lib/upload-requests.js';

let fails = 0;
const check = (name, cond, detail) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (cond ? '' : '  <- ' + detail));
  if (!cond) fails++;
};

function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) { args = a; return st; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() { if (!args.length && /^\s*CREATE/i.test(sql)) { db.exec(sql); return { meta: { changes: 0 } }; }
          const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
      };
      return st;
    },
  };
}
function r2() {
  const m = new Map();
  return {
    m,
    async put(k, v, o) { m.set(k, { body: new Uint8Array(v), opts: o }); },
    async get(k) { const o = m.get(k); return o ? { body: o.body } : null; },
    async delete(k) { m.delete(k); },
  };
}

const TOKEN = 'abcdefghjkmnpqrs';
const UNSIGNED = 'zzzzzzzzzzzzzzzz';
function fresh() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE quotes (id TEXT, quote_number TEXT, client_name TEXT, share_token TEXT)');
  db.exec('CREATE TABLE commitments (id TEXT, share_token TEXT, submitted_at TEXT, employer_name TEXT)');
  db.prepare('INSERT INTO quotes VALUES (?,?,?,?)').run('q1', 'TX000001-TEST-C', 'Test Employer', TOKEN);
  db.prepare('INSERT INTO quotes VALUES (?,?,?,?)').run('q2', 'TX000002-TEST-C', 'Unsigned Employer', UNSIGNED);
  db.prepare('INSERT INTO commitments VALUES (?,?,?,?)').run('c1', TOKEN, '2026-10-01T00:00:00Z', 'Test Employer');
  return { db, env: { DB: d1(db), UPLOADS: r2() } };
}
const up = (token, kind, name, bytes, extraHeaders) => new Request(
  'https://abyquotes.com/api/q/' + token + '/uploads?kind=' + kind,
  { method: 'POST', body: bytes, headers: Object.assign({ 'X-File-Name': encodeURIComponent(name) }, extraHeaders || {}) });
const sent = [];
const notify = async (a) => { sent.push(a); };

console.log('SECURE UPLOAD (C18)\n');
{
  const { env, db } = fresh();
  let r = await handleUpload(UNSIGNED, up(UNSIGNED, 'census', 'census.xlsx', new Uint8Array([1, 2, 3])), env, null, notify);
  check('a link nobody has signed cannot upload', r.status === 409, String(r.status));

  r = await handleUpload(TOKEN, up(TOKEN, 'census', 'evil.html', new Uint8Array([1])), env, null, notify);
  check('a web page cannot be uploaded (type allow-list)', r.status === 400, String(r.status));
  r = await handleUpload(TOKEN, up(TOKEN, 'census', 'census.svg', new Uint8Array([1])), env, null, notify);
  check('an SVG cannot be uploaded either', r.status === 400, String(r.status));
  r = await handleUpload(TOKEN, up(TOKEN, 'nonsense', 'census.xlsx', new Uint8Array([1])), env, null, notify);
  check('an unknown kind is refused', r.status === 400, String(r.status));
  r = await handleUpload(TOKEN, up(TOKEN, 'census', 'census.xlsx', new Uint8Array(0)), env, null, notify);
  check('an empty file is refused', r.status === 400, String(r.status));
  r = await handleUpload(TOKEN, up(TOKEN, 'census', 'big.xlsx', new Uint8Array(1), { 'Content-Length': String(21 * 1024 * 1024) }), env, null, notify);
  check('a file declared over 20 MB is refused before it is read', r.status === 413, String(r.status));

  r = await handleUpload(TOKEN, up(TOKEN, 'census', 'Our Census 2027.xlsx', new Uint8Array([80, 75, 3, 4, 9])), env, null, notify);
  let j = await r.json();
  check('a signed link uploads a census', r.status === 200 && j.ok && j.file.name === 'Our Census 2027.xlsx', r.status + ' ' + JSON.stringify(j));
  check('the file is in the bucket, under the link', env.UPLOADS.m.size === 1 && [...env.UPLOADS.m.keys()][0].startsWith('applications/' + TOKEN + '/'), JSON.stringify([...env.UPLOADS.m.keys()]));
  check('ABY is told, by name, with no contents', sent.length === 1 && sent[0].fileName === 'Our Census 2027.xlsx' && !('body' in sent[0]), JSON.stringify(sent));

  r = await handleListUploads(TOKEN, env);
  j = await r.json();
  check('the link lists the name of what arrived', j.ok && j.files.length === 1 && j.files[0].name === 'Our Census 2027.xlsx', JSON.stringify(j));
  check('the link list carries NO download address', !JSON.stringify(j).includes('/api/admin/upload') && !('download' in j.files[0]), JSON.stringify(j));

  r = await handleAdminListUploads(new URL('https://abyquotes.com/api/admin/uploads?cid=c1'), env);
  j = await r.json();
  const id = j.files[0].id;
  r = await handleAdminDownload(new URL('https://abyquotes.com/api/admin/upload?id=' + id), env);
  const bytes = new Uint8Array(await r.arrayBuffer());
  check('the admin download returns the exact file', r.status === 200 && bytes.length === 5 && bytes[4] === 9, r.status + ' ' + bytes.length);
  check('it is always an attachment of an inert type', r.headers.get('Content-Type') === 'application/octet-stream' &&
    /^attachment;/.test(r.headers.get('Content-Disposition') || '') && r.headers.get('X-Content-Type-Options') === 'nosniff',
    r.headers.get('Content-Type') + ' / ' + r.headers.get('Content-Disposition'));

  const ex = await uploadsForExport(env, TOKEN, 'https://abyquotes.com');
  check('the JSON export lists the file with the admin download address', ex.length === 1 && ex[0].download === 'https://abyquotes.com/api/admin/upload?id=' + id, JSON.stringify(ex));

  // Count limit.
  for (let i = 1; i < UPLOAD_MAX_FILES; i++) await handleUpload(TOKEN, up(TOKEN, 'bank', 'check' + i + '.pdf', new Uint8Array([1])), env, null, null);
  r = await handleUpload(TOKEN, up(TOKEN, 'bank', 'one-too-many.pdf', new Uint8Array([1])), env, null, null);
  check('the 31st file on one link is refused', r.status === 409, String(r.status));

  // The 90-day purge.
  db.prepare("UPDATE app_uploads SET uploaded_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(id);
  const before = env.UPLOADS.m.size;
  const p = await purgeExpiredUploads(env, '2026-10-14T12:00:00Z');
  check('the purge deletes exactly the file older than 90 days', p.deleted === 1 && env.UPLOADS.m.size === before - 1, JSON.stringify(p));
  r = await handleAdminDownload(new URL('https://abyquotes.com/api/admin/upload?id=' + id), env);
  check('a purged file says so (410), it does not pretend to be missing', r.status === 410, String(r.status));
  const p2 = await purgeExpiredUploads(env, '2026-10-14T12:00:00Z');
  check('running the purge again deletes nothing more', p2.deleted === 0, JSON.stringify(p2));
}
{
  const { env } = fresh();
  delete env.UPLOADS;
  const r = await handleUpload(TOKEN, up(TOKEN, 'census', 'c.xlsx', new Uint8Array([1])), env, null, null);
  check('with no bucket bound, the upload says it is not switched on (503)', r.status === 503, String(r.status));
}

// THE STAND-ALONE LINK (Eric, 10-14-2026): a link that is not a quote, for an employer who needs to send a census.
{
  const { env } = fresh();
  sent.length = 0;
  const mk = (body) => new Request('https://abyquotes.com/api/admin/upload-requests', { method: 'POST', body: JSON.stringify(body) });
  let r = await handleCreateRequest(mk({ employerName: '' }), env);
  check('a link needs an employer name', r.status === 400, String(r.status));
  r = await handleCreateRequest(mk({ employerName: 'Acme Plumbing', note: 'Your COBRA census' }), env);
  let j = await r.json();
  const tok = j.token;
  check('a link is made, in the quote-token shape', j.ok && /^[a-z2-9]{16}$/.test(tok) && j.link === 'https://abyquotes.com/u/' + tok, JSON.stringify(j));
  r = await handlePublicRequest(tok, env);
  j = await r.json();
  check('the employer page shows the name and the note from ABY', j.ok && j.employerName === 'Acme Plumbing' && j.note === 'Your COBRA census' && j.enabled, JSON.stringify(j));
  r = await handleUpload(tok, up(tok, 'census', 'acme census.xlsx', new Uint8Array([1, 2, 3])), env, null, notify);
  j = await r.json();
  check('the link takes a file (no quote, no signature needed)', r.status === 200 && j.ok, r.status + ' ' + JSON.stringify(j));
  check('ABY is told, and the email points at Secure uploads', sent.length === 1 && sent[0].viewPath === '/admin/secure-uploads' && sent[0].employerName === 'Acme Plumbing', JSON.stringify(sent));
  r = await handlePublicRequest(tok, env);
  j = await r.json();
  check('the employer page lists the name, with no id and no download address',
    j.files.length === 1 && j.files[0].name === 'acme census.xlsx' && !('id' in j.files[0]) && !JSON.stringify(j).includes('/api/admin/upload'), JSON.stringify(j));
  r = await handleListRequests(new Request('https://abyquotes.com/api/admin/upload-requests'), env);
  j = await r.json();
  const row = j.requests[0];
  check('the admin list carries the link and the file with its id', row && row.files.length === 1 && row.files[0].id && row.link.endsWith('/u/' + tok), JSON.stringify(j));
  r = await handleAdminDownload(new URL('https://abyquotes.com/api/admin/upload?id=' + row.files[0].id), env);
  check('ABY downloads it through the same admin route', r.status === 200 && r.headers.get('Content-Type') === 'application/octet-stream', String(r.status));
  await handleCloseRequest(new Request('https://x', { method: 'POST', body: JSON.stringify({ id: row.id }) }), env);
  r = await handleUpload(tok, up(tok, 'census', 'late.xlsx', new Uint8Array([1])), env, null, null);
  check('a CLOSED link takes no more files (410)', r.status === 410, String(r.status));
  j = await (await handlePublicRequest(tok, env)).json();
  check('and its page says it is closed', j.closed === true, JSON.stringify(j));
  await handleCloseRequest(new Request('https://x', { method: 'POST', body: JSON.stringify({ id: row.id, reopen: true }) }), env);
  r = await handleUpload(tok, up(tok, 'other', 'more.pdf', new Uint8Array([1])), env, null, null);
  check('a reopened link takes files again', r.status === 200, String(r.status));
  r = await handleUpload('zzzzzzzzzzzzzzz9', up('zzzzzzzzzzzzzzz9', 'census', 'x.xlsx', new Uint8Array([1])), env, null, null);
  check('a made-up link takes nothing (404)', r.status === 404, String(r.status));
  // The admin page's inline script must parse - it is built inside a JS string, where one bad escape breaks the page.
  const page = adminSecureUploadsHTML('<header></header>', '');
  const js = page.slice(page.indexOf('<script>') + 8, page.lastIndexOf('</script>'));
  let parsed = true; try { new Function(js); } catch (e) { parsed = String(e); }
  check('the Secure uploads admin page script parses', parsed === true, parsed);
  const emailLine = js.split('\n').find((l) => l.startsWith('function emailText'));
  let text = '';
  try { text = new Function(emailLine + '; return emailText("A", "https://abyquotes.com/u/x");')(); } catch (e) { text = String(e); }
  check('its email text carries the link on its own line', text.includes('\n\nhttps://abyquotes.com/u/x\n\n'), JSON.stringify(text));
}

// ABY DELETES A FILE once it is saved in ABY's own system (Eric, 10-14-2026).
{
  const { env } = fresh();
  await handleUpload(TOKEN, up(TOKEN, 'census', 'to-delete.xlsx', new Uint8Array([7, 7])), env, null, null);
  let j = await (await handleAdminListUploads(new URL('https://abyquotes.com/api/admin/uploads?cid=c1'), env)).json();
  const id = j.files[0].id;
  const del = (x) => handleAdminDeleteUpload(new Request('https://x', { method: 'POST', body: JSON.stringify({ id: x }) }), env);
  let r = await del(id);
  j = await r.json();
  check('delete: the file leaves storage', r.status === 200 && env.UPLOADS.m.size === 0, `${r.status} ${env.UPLOADS.m.size}`);
  check('delete: the record stays, marked deleted by ABY', j.file?.deletedAt && j.file?.deletedBy === 'aby', JSON.stringify(j));
  r = await handleAdminDownload(new URL('https://abyquotes.com/api/admin/upload?id=' + id), env);
  check('delete: a download afterwards says it is gone (410)', r.status === 410, String(r.status));
  j = await (await handleListUploads(TOKEN, env)).json();
  check('delete: the employer page still lists it, as removed by ABY', j.files.length === 1 && j.files[0].deletedBy === 'aby', JSON.stringify(j));
  r = await del(id);
  check('delete: deleting twice is harmless', r.status === 200, String(r.status));
  r = await del('no-such-id');
  check('delete: an unknown file is 404', r.status === 404, String(r.status));
  const p = await purgeExpiredUploads(env, '2099-01-01T00:00:00Z');
  check('delete: the 90-day purge does not touch a file ABY already deleted', p.deleted === 0, JSON.stringify(p));
}

check('a path in a file name is stripped', cleanFileName('..%2F..%2Fetc%2Fpasswd.csv') === 'passwd.csv', cleanFileName('..%2F..%2Fetc%2Fpasswd.csv'));

// The routes: the download and the admin list must sit behind withAuth; the link routes must not offer a download.
const w = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
check('the download route is behind the admin login', /path === '\/api\/admin\/upload' && method === 'GET'\) \{\s*return withAuth\(/.test(w), 'route not wrapped');
const applyJs = readFileSync(new URL('../public/assets/js/apply.js', import.meta.url), 'utf8');
const adminPage = (await import('../lib/upload-requests.js')).adminSecureUploadsHTML('', '');
check('deleted files fold away on both admin pages (Eric, 10-14-2026)',
  applyJs.includes("'<details class=\"gone\"><summary>Deleted files ('") && adminPage.includes('<details class=gone><summary>Deleted files ('), 'no fold');
check('finished links (every file deleted) fold away on Secure uploads (Eric, 10-14-2026)',
  adminPage.includes('<details class=gone><summary>Finished links (') && adminPage.includes('r.files.every(function(x){return x.deletedAt})'), 'no fold');
check('the delete route is behind the admin login', /path === '\/api\/admin\/upload\/delete' && method === 'POST'\) \{\s*return withAuth\(/.test(w), 'route not wrapped');
check('the admin file list is behind the admin login', /path === '\/api\/admin\/uploads' && method === 'GET'\) \{\s*return withAuth\(/.test(w), 'route not wrapped');
const wr = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
check('the employer upload page route exists, and the admin page and its APIs are behind the login',
  w.includes('return serveUploadPage(request, env);') &&
  /path === '\/admin\/secure-uploads' && method === 'GET'\) \{\s*return withAuth\(/.test(w) &&
  (w.match(/path === '\/api\/admin\/upload-requests(\/close)?' && method === '(GET|POST)'\) \{\s*return withAuth\(/g) || []).length === 3,
  'routes not as expected');
check('wrangler binds the bucket Eric made', /"binding":\s*"UPLOADS"[\s\S]*"bucket_name":\s*"aby-secure-uploads"/.test(wr), 'no binding');
check('wrangler schedules the daily purge', /"crons":\s*\[\s*"[^"]+"\s*\]/.test(wr), 'no cron');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
