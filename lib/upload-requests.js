// A SECURE UPLOAD LINK THAT IS NOT A QUOTE (Eric, 10-14-2026: "Is there a possibility for us to send a link separate
// from a quote to an employer who needs to upload a form securely? I have that case this morning.").
//
// ABY makes a link on /admin/secure-uploads (employer name, an optional note saying what is needed), emails it, and
// the employer opens /u/<token>: a page with nothing on it but upload buttons. The files land in the same R2 bucket,
// through the same handler, with the same rules as the setup-questions upload (lib/uploads.js): WRITE-ONLY through
// the link, downloaded only by a signed-in ABY admin, deleted 90 days after upload, ABY emailed per file.
// ABY can CLOSE a link when it has what it needs; a closed link takes no more files.

const TABLE_SQL = "CREATE TABLE IF NOT EXISTS upload_requests (" +
  "id TEXT PRIMARY KEY, token TEXT NOT NULL, employer_name TEXT NOT NULL, note TEXT, " +
  "created_at TEXT NOT NULL, closed_at TEXT)";
const INDEX_SQL = "CREATE UNIQUE INDEX IF NOT EXISTS upload_requests_token ON upload_requests (token)";
export const UPLOAD_REQUEST_MIGRATIONS = [
  { sql: TABLE_SQL, table: 'upload_requests', column: 'token' },
  { sql: INDEX_SQL, index: 'upload_requests_token' },
];
export async function ensureRequestTable(env) {
  await env.DB.prepare(TABLE_SQL).run();
  await env.DB.prepare(INDEX_SQL).run();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Same alphabet and length as a quote's share token ([a-z2-9]{16}), so the route patterns read alike. 128 bits
// of randomness is not needed for 16 characters of a 34-letter alphabet (~81 bits) to be unguessable.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz23456789';
export function newUploadToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let t = '';
  for (let i = 0; i < 16; i++) t += ALPHABET[b[i] % ALPHABET.length];
  return t;
}

// Used by lib/uploads.js to accept a request link where it would accept a signed quote link.
export async function findOpenRequest(env, token) {
  try {
    await ensureRequestTable(env);
    const r = await env.DB.prepare('SELECT * FROM upload_requests WHERE token = ?').bind(token).first();
    return r || null;
  } catch (e) {
    return null;
  }
}

async function readJson(request) {
  const t = await request.text();
  if (t.length > 8192) return null;
  try { return JSON.parse(t || '{}'); } catch (e) { return null; }
}

// POST /api/admin/upload-requests  { employerName, note }  (admin only - routed behind withAuth)
export async function handleCreateRequest(request, env) {
  const b = await readJson(request);
  const name = String((b && b.employerName) || '').trim().slice(0, 200);
  const note = String((b && b.note) || '').trim().slice(0, 1000);
  if (!name) return json({ ok: false, error: 'name', message: 'Please enter the employer\'s name.' }, 400);
  await ensureRequestTable(env);
  let token = newUploadToken();
  // A collision with a quote link or another request is astronomically unlikely; check anyway, it costs two reads.
  for (let i = 0; i < 3; i++) {
    const q = await env.DB.prepare('SELECT 1 AS x FROM quotes WHERE share_token = ?').bind(token).first();
    const r = await env.DB.prepare('SELECT 1 AS x FROM upload_requests WHERE token = ?').bind(token).first();
    if (!q && !r) break;
    token = newUploadToken();
  }
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO upload_requests (id, token, employer_name, note, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), token, name, note || null, now).run();
  return json({ ok: true, token, link: new URL(request.url).origin + '/u/' + token });
}

// GET /api/admin/upload-requests  (admin only) - every link, newest first, with the files each one received.
export async function handleListRequests(request, env) {
  await ensureRequestTable(env);
  const origin = new URL(request.url).origin;
  const reqs = (await env.DB.prepare('SELECT * FROM upload_requests ORDER BY created_at DESC LIMIT 200').all()).results || [];
  let files = [];
  try {
    files = (await env.DB.prepare(
      'SELECT u.* FROM app_uploads u JOIN upload_requests r ON r.token = u.share_token ORDER BY u.uploaded_at'
    ).all()).results || [];
  } catch (e) { /* no uploads table yet */ }
  const byToken = {};
  files.forEach((f) => { (byToken[f.share_token] = byToken[f.share_token] || []).push({
    id: f.id, kind: f.kind, name: f.file_name, size: f.size, uploadedAt: f.uploaded_at, deletedAt: f.deleted_at || null,
    deletedBy: f.deleted_at ? (f.deleted_by || 'expired') : null,
  }); });
  return json({ ok: true, requests: reqs.map((r) => ({
    id: r.id, employerName: r.employer_name, note: r.note || '', createdAt: r.created_at, closedAt: r.closed_at || null,
    link: origin + '/u/' + r.token, files: byToken[r.token] || [],
  })) });
}

// POST /api/admin/upload-requests/close  { id, reopen }  (admin only)
export async function handleCloseRequest(request, env) {
  const b = await readJson(request);
  const id = String((b && b.id) || '');
  await ensureRequestTable(env);
  const r = await env.DB.prepare('UPDATE upload_requests SET closed_at = ? WHERE id = ?')
    .bind(b && b.reopen ? null : new Date().toISOString(), id).run();
  return json({ ok: !!(r.meta && r.meta.changes) });
}

// GET /api/u/<token> - what the employer's page shows: who it is for, ABY's note, and the NAMES of what arrived.
export async function handlePublicRequest(token, env) {
  const r = await findOpenRequest(env, token);
  if (!r) return json({ ok: false, error: 'not_found' }, 404);
  let files = [];
  try {
    files = ((await env.DB.prepare('SELECT * FROM app_uploads WHERE share_token = ? ORDER BY uploaded_at')
      .bind(token).all()).results || []).map((f) => ({ kind: f.kind, name: f.file_name, size: f.size,
      uploadedAt: f.uploaded_at, deletedAt: f.deleted_at || null, deletedBy: f.deleted_at ? (f.deleted_by || 'expired') : null }));
  } catch (e) { /* no uploads yet */ }
  return json({ ok: true, employerName: r.employer_name, note: r.note || '', closed: !!r.closed_at,
    enabled: !!env.UPLOADS, files });
}

// ── The admin page, /admin/secure-uploads. Built by string concatenation (no template literal), like the guide. ─
export function adminSecureUploadsHTML(nav, headerCss) {
  const script = [
    'function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}',
    'function when(i){if(!i)return "";var d=new Date(i);return d.toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"}).replace(/\\//g,"-")+" "+d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}',
    'function size(n){n=Number(n)||0;return n>=1048576?(n/1048576).toFixed(1)+" MB":Math.max(1,Math.round(n/1024))+" KB"}',
    'var KIND={census:"Census",bank:"Bank details",other:"Document"};',
    'function emailText(name,link){return "To send your files to ABY Benefits securely, please use this link:\\n\\n"+link+"\\n\\nClick the upload button and choose your file. It will show as received once ABY has it. Please do not email these documents, because they contain Social Security numbers and other private information."}',
    'function copy(t,b){var done=function(){var o=b.textContent;b.textContent="Copied";setTimeout(function(){b.textContent=o},1600)};if(navigator.clipboard)navigator.clipboard.writeText(t).then(done);else{var a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();document.execCommand("copy");a.remove();done()}}',
    'function load(){fetch("/api/admin/upload-requests").then(function(r){return r.json()}).then(function(j){var el=document.getElementById("list");if(!j.ok){el.innerHTML="<p class=bad>Could not load the links.</p>";return}',
    'if(!j.requests.length){el.innerHTML="<p class=muted>No links yet.</p>";return}',
    'function fl(x){var n=x.deletedAt?esc(x.name):"<a href=\\"/api/admin/upload?id="+encodeURIComponent(x.id)+"\\" download>"+esc(x.name)+"</a>";return "<li><strong>"+(KIND[x.kind]||x.kind)+":</strong> "+n+" <span class=muted>"+size(x.size)+", "+(x.deletedAt?(x.deletedBy==="aby"?"deleted by ABY "+when(x.deletedAt):"deleted after 90 days"):"received "+when(x.uploadedAt))+"</span>"+(x.deletedAt?"":" <button class=\\"ghost sm\\" data-del=\\""+esc(x.id)+"\\" data-file=\\""+esc(x.name)+"\\">Delete</button>")+"</li>"}',
    // Deleted files fold away under one closed line (Eric, 10-14-2026: "I don't want some huge list of deleted files").
    'function files(list){var live=list.filter(function(x){return !x.deletedAt}),gone=list.filter(function(x){return x.deletedAt});if(!list.length)return "<p class=muted>Nothing uploaded yet.</p>";return (live.length?"<ul class=files>"+live.map(fl).join("")+"</ul>":"<p class=muted>No files waiting.</p>")+(gone.length?"<details class=gone><summary>Deleted files ("+gone.length+")</summary><ul class=files>"+gone.map(fl).join("")+"</ul></details>":"")}',
    'el.innerHTML=j.requests.map(function(r){var f=files(r.files);',
    'return "<div class=req><div class=top><div><h3>"+esc(r.employerName)+(r.closedAt?" <span class=tag>Closed</span>":"")+"</h3><div class=muted>Link made "+when(r.createdAt)+(r.note?" &middot; "+esc(r.note):"")+"</div></div>"+',
    '"<div class=acts><button class=ghost data-copy=\\""+esc(r.link)+"\\">Copy link</button><button class=ghost data-mail=\\""+esc(r.link)+"\\" data-name=\\""+esc(r.employerName)+"\\">Copy email text</button><button class=ghost data-close=\\""+r.id+"\\" data-reopen=\\""+(r.closedAt?"1":"")+"\\">"+(r.closedAt?"Reopen link":"Close link")+"</button></div></div>"+f+"</div>"}).join("");',
    'el.querySelectorAll("[data-copy]").forEach(function(b){b.onclick=function(){copy(b.getAttribute("data-copy"),b)}});',
    // Eric, 10-14-2026: delete a file once it is in ABY's own system. Asked once, because it cannot be undone.
    'el.querySelectorAll("[data-del]").forEach(function(b){b.onclick=function(){if(!confirm("Delete "+b.getAttribute("data-file")+" from ABY\'s storage? Do this once you have saved it in your own system. It cannot be undone."))return;b.disabled=true;fetch("/api/admin/upload/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:b.getAttribute("data-del")})}).then(function(r){return r.json()}).then(function(j){if(!j.ok){alert("That file could not be deleted.");b.disabled=false;return}load()})}});',
    'el.querySelectorAll("[data-mail]").forEach(function(b){b.onclick=function(){copy(emailText(b.getAttribute("data-name"),b.getAttribute("data-mail")),b)}});',
    'el.querySelectorAll("[data-close]").forEach(function(b){b.onclick=function(){fetch("/api/admin/upload-requests/close",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:b.getAttribute("data-close"),reopen:!!b.getAttribute("data-reopen")})}).then(load)}});',
    '})}',
    'document.getElementById("mk").onsubmit=function(e){e.preventDefault();var n=document.getElementById("nm").value.trim(),t=document.getElementById("nt").value.trim(),m=document.getElementById("made");if(!n){m.innerHTML="<p class=bad>Please enter the employer\'s name.</p>";return}',
    'fetch("/api/admin/upload-requests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({employerName:n,note:t})}).then(function(r){return r.json()}).then(function(j){if(!j.ok){m.innerHTML="<p class=bad>"+esc(j.message||"Could not make the link.")+"</p>";return}',
    'm.innerHTML="<div class=ok><strong>Link for "+esc(n)+":</strong><div class=row><input readonly value=\\""+esc(j.link)+"\\"><button type=button id=c1>Copy link</button><button type=button id=c2 class=ghost>Copy email text</button></div><p class=muted>Paste it into an email to the employer. Files they upload appear below, and you get an email for each one.</p></div>";',
    'document.getElementById("c1").onclick=function(){copy(j.link,this)};document.getElementById("c2").onclick=function(){copy(emailText(n,j.link),this)};',
    'document.getElementById("nm").value="";document.getElementById("nt").value="";load()})};',
    'load();',
    'function logout(){fetch("/api/admin/logout",{method:"POST"}).then(function(){location.href="/admin"})}',
  ].join('\n');
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Secure uploads &mdash; ABY admin</title><style>' +
    '*{box-sizing:border-box} body{margin:0;font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}' +
    headerCss +
    'main{max-width:980px;margin:24px auto 80px;padding:0 20px}' +
    'h2{font-size:24px;margin:0 0 6px} h3{font-size:18px;margin:0}' +
    '.card{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:22px 24px;margin:0 0 18px}' +
    'label{display:block;font-weight:600;font-size:15px;margin:12px 0 6px}' +
    'input,textarea{font:inherit;font-size:16px;width:100%;padding:9px 11px;border:1px solid #aebdcb;border-radius:8px;color:#12263f}' +
    'textarea{min-height:64px}' +
    'button{font:inherit;font-size:15px;font-weight:600;border-radius:8px;padding:8px 16px;cursor:pointer;border:1px solid #143c73;background:#143c73;color:#fff}' +
    'button.ghost{background:#fff;color:#143c73}' +
    'button.sm{font-size:13px;padding:3px 10px;margin-left:8px}' +
    'details.gone{margin-top:8px;color:#3f4b56}details.gone summary{cursor:pointer;color:#205aa6;font-weight:600;font-size:15px}' +
    '.row{display:flex;gap:8px;margin:8px 0}.row input{flex:1}' +
    '.muted{color:#3f4b56;font-size:15px}.bad{color:#b3261e;font-weight:600}' +
    '.ok{background:#f1f8f3;border:1px solid #b9dcc4;border-radius:10px;padding:14px 16px;margin-top:14px}' +
    '.req{border-top:1px solid #e3e8ee;padding:16px 0}.req:first-child{border-top:0;padding-top:0}' +
    '.top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.acts{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start}' +
    '.files{margin:10px 0 0 20px;padding:0}.files li{margin:4px 0}.files a{color:#205aa6;font-weight:600}' +
    '.tag{font-size:12px;background:#eef3f8;color:#3f4b56;border-radius:6px;padding:2px 8px;vertical-align:3px}' +
    '</style></head><body>' + nav +
    '<main><div class="card"><h2>Secure uploads</h2>' +
    '<p class="muted">Make a link for an employer who needs to send ABY a census or another private document. ' +
    'The link only uploads: nobody can open a file through it. You download the files here, signed in. ' +
    'Once you have saved a file in your own system, press Delete beside it; anything left is deleted automatically 90 days after it arrives.</p>' +
    '<form id="mk"><label for="nm">Employer name</label><input id="nm" maxlength="200" autocomplete="off">' +
    '<label for="nt">What ABY needs (optional, shown to the employer)</label><textarea id="nt" maxlength="1000" placeholder="For example: your COBRA census"></textarea>' +
    '<div style="margin-top:14px"><button type="submit">Make the link</button></div></form><div id="made"></div></div>' +
    '<div class="card"><h2 style="font-size:20px">Links</h2><div id="list"><p class="muted">Loading...</p></div></div></main>' +
    '<script>' + script + '</script></body></html>';
}

