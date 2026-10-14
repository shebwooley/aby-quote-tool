// THE SECURE UPLOAD FOR THE CENSUS AND BANK DETAILS (F-625, C18; Eric switched on R2 10-14-2026).
//
// The setup questions never ask for Social Security numbers, dates of birth or bank numbers. Those
// arrive here instead, as FILES: ABY's census spreadsheet filled in, and a voided check or bank letter.
// They are stored in the R2 bucket `aby-secure-uploads` (binding UPLOADS), never in D1 and never in email.
//
// WHAT THE EMPLOYER'S LINK CAN DO, AND WHAT IT CANNOT
//   - The share token is the credential, as it is for the quote and the setup questions. So the link is
//     WRITE-ONLY: it can add a file and list the NAMES of what arrived, and it can never download one.
//     A forwarded link (or the no-login ?view=all link ABY hands account managers) leaks no file.
//   - Only a signed-in ABY admin downloads (/api/admin/upload, routed behind withAuth in worker.js).
//     The download is always sent as an attachment of type application/octet-stream, so a file someone
//     uploaded can never render as a page on abyquotes.com.
//   - Files are deleted 90 days after upload, by the daily cron (purgeExpiredUploads). The row stays,
//     marked deleted, so the page can still say the file arrived and was removed.
//   - Only after the authorization is signed, only the file types the census and bank papers come in,
//     20 MB each, 30 per link.

import { findOpenRequest } from './upload-requests.js';

export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const UPLOAD_MAX_FILES = 30;
export const UPLOAD_KEEP_DAYS = 90;
const KINDS = { census: 'Employee census', bank: 'Bank details', other: 'Other document' };
const TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
  csv: 'text/csv', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  heic: 'image/heic', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const TABLE_SQL = "CREATE TABLE IF NOT EXISTS app_uploads (" +
  "id TEXT PRIMARY KEY, share_token TEXT NOT NULL, commitment_id TEXT, kind TEXT NOT NULL, " +
  "file_name TEXT NOT NULL, size INTEGER NOT NULL, content_type TEXT, r2_key TEXT NOT NULL, " +
  "uploaded_at TEXT NOT NULL, deleted_at TEXT)";
const INDEX_SQL = "CREATE INDEX IF NOT EXISTS app_uploads_token ON app_uploads (share_token)";
// WHO removed a file: 'aby' (an admin pressed Delete once the file was moved to ABY's own system - Eric, 10-14-2026:
// "we should have the ability to delete it once we have captured the documents") or 'expired' (the 90-day purge).
const DELETED_BY_SQL = "ALTER TABLE app_uploads ADD COLUMN deleted_by TEXT";
export const UPLOAD_MIGRATIONS = [
  { sql: TABLE_SQL, table: 'app_uploads', column: 'r2_key' },
  { sql: INDEX_SQL, index: 'app_uploads_token' },
  { sql: DELETED_BY_SQL, table: 'app_uploads', column: 'deleted_by' },
];
// The handlers also create the table (and the deleted_by column) on first use, so nothing waits on /api/migrate.
const columnsReady = new WeakSet();   // per database binding, once per isolate
async function ensureTable(env) {
  await env.DB.prepare(TABLE_SQL).run();
  await env.DB.prepare(INDEX_SQL).run();
  if (!columnsReady.has(env.DB)) {
    try { await env.DB.prepare(DELETED_BY_SQL).run(); } catch (e) { /* already there */ }
    columnsReady.add(env.DB);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// A name safe to show and to use inside the storage key: no path, no control characters, 120 at most.
export function cleanFileName(raw) {
  let n = String(raw || '');
  try { n = decodeURIComponent(n); } catch (e) { /* keep it as sent */ }
  n = n.split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f"<>|*?:]/g, '').replace(/\s+/g, ' ').trim();
  if (n.length > 120) { const dot = n.lastIndexOf('.'); n = n.slice(0, 110) + (dot > 0 ? n.slice(dot) : ''); }
  return n;
}
function extOf(name) { const m = /\.([a-z0-9]+)$/i.exec(name); return m ? m[1].toLowerCase() : ''; }

// The link must belong to a quote whose authorization was signed - the same rule the setup questions use - OR be a
// secure-upload link ABY made on /admin/secure-uploads (lib/upload-requests.js), still open.
async function signedLink(env, token) {
  const quote = await env.DB.prepare('SELECT id, quote_number, client_name FROM quotes WHERE share_token = ?').bind(token).first();
  if (!quote) {
    const r = await findOpenRequest(env, token);
    if (!r) return { status: 404 };
    if (r.closed_at) return { status: 410 };
    return { status: 200, request: r, quote: { quote_number: '', client_name: r.employer_name }, commitment: { id: null, employer_name: r.employer_name } };
  }
  const c = await env.DB.prepare(
    'SELECT id, employer_name FROM commitments WHERE share_token = ? ORDER BY submitted_at DESC LIMIT 1'
  ).bind(token).first();
  if (!c) return { status: 409 };
  return { status: 200, quote, commitment: c };
}

function publicRow(r) {
  return { id: r.id, kind: r.kind, kindLabel: KINDS[r.kind] || r.kind, name: r.file_name, size: r.size,
    uploadedAt: r.uploaded_at, deletedAt: r.deleted_at || null, deletedBy: r.deleted_at ? (r.deleted_by || 'expired') : null };
}
async function listFor(env, token) {
  const r = await env.DB.prepare(
    'SELECT * FROM app_uploads WHERE share_token = ? ORDER BY uploaded_at'
  ).bind(token).all();
  return (r.results || []).map(publicRow);
}

// GET /api/q/<token>/uploads - the NAMES of what arrived. Never a download link.
export async function handleListUploads(token, env) {
  try {
    await ensureTable(env);
    const ctx = await signedLink(env, token);
    if (ctx.status !== 200) return json({ ok: false, error: ctx.status === 404 ? 'not_found' : 'not_signed' }, ctx.status);
    return json({ ok: true, files: await listFor(env, token), enabled: !!env.UPLOADS, keepDays: UPLOAD_KEEP_DAYS });
  } catch (err) {
    console.error('upload list failed:', err);
    return json({ ok: false, error: 'server' }, 500);
  }
}

// POST /api/q/<token>/uploads?kind=census|bank|other   body = the file itself,
// header X-File-Name = the file's name (URI-encoded). One file per request.
export async function handleUpload(token, request, env, ctxWorker, notify) {
  if (!env.UPLOADS) return json({ ok: false, error: 'not_configured', message: 'The secure upload is not switched on yet. Please contact ABY Benefits at 817-731-6258.' }, 503);
  const url = new URL(request.url);
  const kind = String(url.searchParams.get('kind') || 'other');
  if (!KINDS[kind]) return json({ ok: false, error: 'bad_kind' }, 400);
  const name = cleanFileName(request.headers.get('X-File-Name'));
  const ext = extOf(name);
  if (!name || !TYPES[ext]) {
    return json({ ok: false, error: 'bad_type', message: 'That kind of file cannot be uploaded here. Please send a spreadsheet (Excel or CSV), a PDF, a Word document or a photo (JPG, PNG or HEIC).' }, 400);
  }
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > UPLOAD_MAX_BYTES) return json({ ok: false, error: 'too_large', message: 'That file is larger than 20 MB. Please send a smaller copy, or call ABY Benefits.' }, 413);
  try {
    await ensureTable(env);
    const ctx = await signedLink(env, token);
    if (ctx.status === 410) return json({ ok: false, error: 'closed', message: 'This upload link has been closed. Please contact ABY Benefits at 817-731-6258 for a new one.' }, 410);
    if (ctx.status !== 200) return json({ ok: false, error: ctx.status === 404 ? 'not_found' : 'not_signed' }, ctx.status);
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM app_uploads WHERE share_token = ?').bind(token).first();
    if (count && Number(count.n) >= UPLOAD_MAX_FILES) {
      return json({ ok: false, error: 'too_many', message: 'This link has reached its limit of 30 files. Please call ABY Benefits at 817-731-6258.' }, 409);
    }
    const body = await request.arrayBuffer();
    if (body.byteLength === 0) return json({ ok: false, error: 'empty', message: 'That file is empty.' }, 400);
    if (body.byteLength > UPLOAD_MAX_BYTES) return json({ ok: false, error: 'too_large', message: 'That file is larger than 20 MB. Please send a smaller copy, or call ABY Benefits.' }, 413);
    const id = crypto.randomUUID();
    const key = 'applications/' + token + '/' + id + '.' + ext;
    const now = new Date().toISOString();
    await env.UPLOADS.put(key, body, {
      httpMetadata: { contentType: TYPES[ext] },
      customMetadata: { fileName: name, kind, shareToken: token, commitmentId: String(ctx.commitment.id || '') },
    });
    // The file is stored first; a row that points at nothing would be worse than a file nobody listed.
    await env.DB.prepare(
      'INSERT INTO app_uploads (id, share_token, commitment_id, kind, file_name, size, content_type, r2_key, uploaded_at) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, token, ctx.commitment.id, kind, name, body.byteLength, TYPES[ext], key, now).run();
    if (notify) {
      const job = notify({
        employerName: ctx.commitment.employer_name || ctx.quote.client_name, quoteNumber: ctx.quote.quote_number,
        kindLabel: KINDS[kind], fileName: name, origin: url.origin, commitmentId: ctx.commitment.id,
        viewPath: ctx.request ? '/admin/secure-uploads' : null,
      }).catch((e) => console.error('upload email failed:', e));
      if (ctxWorker && ctxWorker.waitUntil) ctxWorker.waitUntil(job); else await job;
    }
    return json({ ok: true, file: publicRow({ id, kind, file_name: name, size: body.byteLength, uploaded_at: now }) });
  } catch (err) {
    console.error('upload failed:', err);
    return json({ ok: false, error: 'server', message: 'The upload did not go through. Please try again in a moment.' }, 500);
  }
}

// GET /api/admin/uploads?cid=<commitment id> - ABY admin only (worker.js checks the session).
export async function handleAdminListUploads(url, env) {
  await ensureTable(env);
  const cid = String(url.searchParams.get('cid') || '');
  const c = await env.DB.prepare('SELECT share_token FROM commitments WHERE id = ?').bind(cid).first();
  if (!c || !c.share_token) return json({ ok: false, error: 'not_found' }, 404);
  return json({ ok: true, files: await listFor(env, c.share_token), keepDays: UPLOAD_KEEP_DAYS });
}

// GET /api/admin/upload?id=<upload id> - ABY admin only. Always a download, never shown inline.
export async function handleAdminDownload(url, env) {
  await ensureTable(env);
  const id = String(url.searchParams.get('id') || '');
  const row = await env.DB.prepare('SELECT * FROM app_uploads WHERE id = ?').bind(id).first();
  if (!row) return new Response('Not found', { status: 404 });
  if (row.deleted_at) return new Response('This file was deleted ' + UPLOAD_KEEP_DAYS + ' days after it was uploaded.', { status: 410 });
  if (!env.UPLOADS) return new Response('The secure upload storage is not connected.', { status: 503 });
  const obj = await env.UPLOADS.get(row.r2_key);
  if (!obj) return new Response('The file is no longer in storage.', { status: 410 });
  const ascii = row.file_name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(row.file_name),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store, private',
    },
  });
}

// POST /api/admin/upload/delete  { id }  - ABY admin only. ABY has moved the file to its own system; it goes from storage
// now rather than at 90 days. The ROW stays, marked deleted by ABY, so every page can still say what arrived and when
// it was removed. Deleting twice is harmless.
export async function handleAdminDeleteUpload(request, env) {
  await ensureTable(env);
  let id = '';
  try { id = String((await request.json()).id || ''); } catch (e) { /* bad body */ }
  const row = id ? await env.DB.prepare('SELECT * FROM app_uploads WHERE id = ?').bind(id).first() : null;
  if (!row) return json({ ok: false, error: 'not_found' }, 404);
  if (!row.deleted_at) {
    if (env.UPLOADS) await env.UPLOADS.delete(row.r2_key);
    await env.DB.prepare("UPDATE app_uploads SET deleted_at = ?, deleted_by = 'aby' WHERE id = ?").bind(new Date().toISOString(), id).run();
  }
  const after = await env.DB.prepare('SELECT * FROM app_uploads WHERE id = ?').bind(id).first();
  return json({ ok: true, file: publicRow(after) });
}

// The daily cron: delete every file uploaded more than 90 days ago. Safe to run any number of times.
export async function purgeExpiredUploads(env, now) {
  if (!env.UPLOADS) return { deleted: 0 };
  await ensureTable(env);
  const t = now ? new Date(now) : new Date();
  const cutoff = new Date(t.getTime() - UPLOAD_KEEP_DAYS * 86400000).toISOString();
  const r = await env.DB.prepare(
    'SELECT id, r2_key FROM app_uploads WHERE deleted_at IS NULL AND uploaded_at < ? LIMIT 500'
  ).bind(cutoff).all();
  const rows = r.results || [];
  for (const row of rows) {
    await env.UPLOADS.delete(row.r2_key);
    await env.DB.prepare("UPDATE app_uploads SET deleted_at = ?, deleted_by = 'expired' WHERE id = ?").bind(t.toISOString(), row.id).run();
  }
  return { deleted: rows.length };
}

// For the commitment's JSON export: what arrived, by name, with the admin download address. No contents.
export async function uploadsForExport(env, shareToken, origin) {
  if (!shareToken) return [];
  try {
    const files = await listFor(env, shareToken);
    return files.map((f) => Object.assign(f, {
      download: f.deletedAt ? null : (origin || '') + '/api/admin/upload?id=' + encodeURIComponent(f.id),
    }));
  } catch (e) {
    return [];   // no table yet
  }
}

// Tell ABY a file arrived (same sender and recipients as a submitted application).
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export async function sendUploadEmail(env, a) {
  if (!env.RESEND_API_KEY) return { ok: false };
  const to = String(env.NOTIFY_EMAILS || 'eric@comedyce.com').split(',').map((x) => x.trim()).filter(Boolean);
  if (!to.length) return { ok: false };
  const view = (a.origin || '') + (a.viewPath || ('/admin/application?cid=' + encodeURIComponent(a.commitmentId || '')));
  const html =
    '<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#12263f">' +
    '<p><strong>' + escHtml(a.employerName || 'An employer') + '</strong> uploaded a file through the secure upload' +
    (a.quoteNumber ? ' for quote <strong>' + escHtml(a.quoteNumber) + '</strong>' : '') + '.</p>' +
    '<p><strong>' + escHtml(a.kindLabel || '') + ':</strong> ' + escHtml(a.fileName || '') + '</p>' +
    '<p>The file is not attached, on purpose. Download it from ' + (a.viewPath ? 'Secure uploads' : 'the setup answers') + ' while signed in to the ABY admin. It is deleted automatically after ' + UPLOAD_KEEP_DAYS + ' days.</p>' +
    '<p><a href="' + escHtml(view) + '" style="background:#143c73;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">' +
    (a.viewPath ? 'Open Secure uploads' : 'Open the setup answers') + '</a></p>' +
    '</div>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'ABY Quote Tool <' + (env.FROM_EMAIL || 'onboarding@resend.dev') + '>', to,
      subject: 'File uploaded: ' + (a.employerName || 'employer') + (a.quoteNumber ? ' (' + a.quoteNumber + ')' : ''), html }),
  });
  return { ok: res.ok };
}
