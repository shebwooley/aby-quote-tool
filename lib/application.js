// THE EMPLOYER APPLICATION, SERVER SIDE (F-625, Eric 09-29-2026).
//
// After an employer submits the authorization on a quote, the same link opens the setup questions
// ABY's enrollment kits ask (COBRA, HRA). Answers save as they go; the employer (or a broker helping
// them) comes back to the same link; Submit sends it to ABY. ABY reads it on the Commitments tab.
//
// WHY A SEPARATE FILE: worker.js is 20,000 lines with several template-literal pages inside it, and a
// stray backtick or backslash there has broken production more than once. This file has neither
// problem, so the new work lives here and worker.js only routes to it.
//
// WHAT THE LINK CAN DO, AND WHAT IT CANNOT
//   - The share token is the whole credential, exactly as it is for the quote page itself.
//   - It reads and writes ANSWERS ONLY. It never returns a census or bank details, because none are
//     asked or stored here. Those go through the secure upload (next step, needs R2 switched on).
//   - Answers are checked against the question list: an unknown key is dropped, values are capped.
//   - Once submitted the link is read-only. ABY can reopen it from the admin.
//   - ⭐ ABY CAN ADD OR CHANGE ANSWERS ON A SUBMITTED APPLICATION (10-07-2026, Eric: "Niels would like to add some
//     missing answers. Is there a way to edit or add? We need to be able to do that."). The employer's signature and
//     submission stay as they were; every answer ABY writes is MARKED (`_aby` inside the answers JSON, no new column)
//     and the pages say "Added by ABY", so the record never implies the employer signed something they did not write.

import Questions from '../public/assets/js/data/application-questions.js';

const KEYS = new Set(Questions.allKeys());
const MAX_BODY = 64 * 1024;
// The submit also carries the drawn signature (a 600x160 PNG is 5-20 KB; the same 150 KB ceiling the
// authorization uses), so it may be larger than a save.
const MAX_SUBMIT_BODY = MAX_BODY + 160 * 1024;
const MAX_SIGNATURE = 150000;
const MAX_TEXT = 2000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// ── The table (added to worker.js MIGRATIONS; created by /api/migrate) ─────────────────────────
// One application per quote link. `answers` is JSON keyed by question key; a blank answer is ABSENT,
// never an empty string standing in for "no".
export const APPLICATION_MIGRATIONS = [
  { sql: "CREATE TABLE IF NOT EXISTS applications (" +
         "id TEXT PRIMARY KEY, share_token TEXT NOT NULL, commitment_id TEXT, quote_id TEXT, " +
         "answers TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL DEFAULT 'draft', " +
         "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, submitted_at TEXT, " +
         "submitted_by TEXT, submitted_email TEXT)",
    table: 'applications', column: 'share_token' },
  { sql: "CREATE UNIQUE INDEX IF NOT EXISTS applications_share_token ON applications (share_token)",
    index: 'applications_share_token' },
  // The employer's drawn signature on the finished application (Eric and Niels, 10-01-2026).
  { sql: "ALTER TABLE applications ADD COLUMN signature_image TEXT", table: 'applications', column: 'signature_image' },
];

// A drawn signature is a PNG data URL under the ceiling, or it is not a signature.
function isSignature(s) {
  return typeof s === 'string' && s.indexOf('data:image/png;base64,') === 0 && s.length < MAX_SIGNATURE;
}

// ── Which setup forms the employer is buying ───────────────────────────────────────────────────
// The commitment stores what was TICKED as labels ("COBRA Administration", or "<name>: <option>");
// the quote stores {id, name}. A label matches a product when it is the name, or the name plus ": ".
export function formsFor(quoteProducts, electedLabels) {
  const products = Array.isArray(quoteProducts) ? quoteProducts : [];
  const labels = (Array.isArray(electedLabels) ? electedLabels : [])
    .map((p) => (p && typeof p === 'object' ? String(p.name || '') : String(p || '')).trim())
    .filter(Boolean);
  const forms = [];
  const other = [];
  const census = [];
  labels.forEach((label) => {
    // Either name can be on the record: the full one (older rows, tests) or the short one the
    // authorization page writes today. An option rides after a colon: "HRA: Basic".
    const hit = products.find((p) => p && [p.name, Questions.SHORT_NAME[p.id]].some((n) =>
      n && (label === n || label.indexOf(n + ':') === 0)));
    const form = hit ? Questions.FORM_FOR_PRODUCT[hit.id] : null;
    if (form) {
      [form].concat(Questions.extraForms(hit.id, label)).forEach((f) => { if (forms.indexOf(f) < 0) forms.push(f); });
      const c = Questions.CENSUS_FOR_PRODUCT[hit.id];
      if (c && census.indexOf(c) < 0) census.push(c);
    } else other.push(hit ? hit.name : label);
  });
  // Keep the page's order stable whatever order they were ticked in.
  const ORDER = Object.keys(Questions.FORMS);
  forms.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  return { forms, other, census: census.map((c) => Questions.CENSUS[c]).filter(Boolean) };
}

// ── What the authorization already said, so nobody types it twice ─────────────────────────────
function splitCityStateZip(s) {
  const m = String(s || '').match(/^\s*(.*?)[,\s]+([A-Za-z]{2})[,\s]+(\d{5}(?:-\d{4})?)\s*$/);
  return m ? { city: m[1].replace(/,\s*$/, ''), state: m[2].toUpperCase(), zip: m[3] } : null;
}

export function prefillFrom(commitment, quote) {
  const c = commitment || {};
  const q = quote || {};
  const p = {};
  const put = (k, v) => { const t = String(v == null ? '' : v).trim(); if (t) p[k] = t; };
  put('co.legalName', c.employer_name || q.client_name);
  put('co.street', c.address);
  const csz = splitCityStateZip(c.city_state_zip);
  if (csz) { put('co.city', csz.city); put('co.state', csz.state); put('co.zip', csz.zip); }
  else put('co.city', c.city_state_zip);
  put('contact.signer.name', c.auth_signer);
  put('contact.signer.title', c.auth_title);
  put('contact.signer.email', c.auth_email);
  put('contact.signer.phone', c.auth_phone);
  put('contact.hr.name', c.hr_contact);
  put('contact.hr.title', c.hr_title);
  put('contact.hr.email', c.hr_email);
  put('contact.hr.phone', c.hr_phone);
  put('co.adminStart', c.start_date || q.effective_date);
  put('plan.broker.office', q.broker_agency);
  put('plan.broker.contact', q.broker_name);
  put('plan.broker.email', c.broker_email || q.broker_email);
  put('plan.broker.phone', q.broker_phone);
  return p;
}

// ── Keep only answers to real questions, in the shapes the page writes ─────────────────────────
export function cleanAnswers(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  Object.keys(raw).forEach((k) => {
    if (!KEYS.has(k)) return;
    const v = raw[k];
    if (typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'number' && isFinite(v)) out[k] = String(v);
    else if (typeof v === 'string') { const t = v.slice(0, MAX_TEXT); if (t.trim() !== '') out[k] = t; }
    else if (Array.isArray(v)) {
      const arr = v.slice(0, 20).map((x) => String(x == null ? '' : x).slice(0, 300));
      if (arr.some((x) => x.trim() !== '')) out[k] = arr;
    }
  });
  return out;
}

async function readBody(request, max) {
  const text = await request.text();
  if (text.length > (max || MAX_BODY)) return { error: 'too_large' };
  try { return { body: JSON.parse(text || '{}') }; } catch (e) { return { error: 'bad_json' }; }
}

// ── Loading everything the page needs for one link ─────────────────────────────────────────────
async function context(env, token) {
  const quote = await env.DB.prepare(
    'SELECT id, quote_number, client_name, effective_date, broker_name, broker_agency, broker_phone, ' +
    '       broker_email, products FROM quotes WHERE share_token = ?'
  ).bind(token).first();
  if (!quote) return { status: 404 };
  // The newest signature on this link is the one standing - the same rule the quote page uses.
  const commitment = await env.DB.prepare(
    'SELECT * FROM commitments WHERE share_token = ? ORDER BY submitted_at DESC LIMIT 1'
  ).bind(token).first();
  if (!commitment) return { status: 409, quote };
  const application = await env.DB.prepare('SELECT * FROM applications WHERE share_token = ?')
    .bind(token).first();
  return { status: 200, quote, commitment, application, token };
}

function parse(s, fallback) { try { const v = JSON.parse(s); return v == null ? fallback : v; } catch (e) { return fallback; } }

// ── ABY's marks: { <question key>: { at, value } } stored under ABY_KEY inside the answers JSON ────────────
// A mark counts only while the answer still equals what ABY wrote, so an employer who later changes it owns it again.
export const ABY_KEY = '_aby';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function splitMarks(stored) {
  const all = stored && typeof stored === 'object' ? stored : {};
  const marks = all[ABY_KEY] && typeof all[ABY_KEY] === 'object' ? all[ABY_KEY] : {};
  const answers = {};
  Object.keys(all).forEach((k) => { if (k !== ABY_KEY) answers[k] = all[k]; });
  const live = {};
  Object.keys(marks).forEach((k) => { if (answers[k] !== undefined && same(answers[k], marks[k].value)) live[k] = marks[k]; });
  return { answers, marks: live };
}
// An employer save keeps ABY's marks (still only counted while the value matches).
function keepMarks(ctx, answers) {
  const { marks } = splitMarks(ctx.application ? parse(ctx.application.answers, {}) : {});
  return Object.keys(marks).length ? Object.assign({}, answers, { [ABY_KEY]: marks }) : answers;
}

function payload(ctx) {
  const { quote, commitment, application } = ctx;
  const { forms, other, census } = formsFor(parse(quote.products, []), parse(commitment.products, []));
  return {
    ok: true,
    quoteNumber: quote.quote_number || '',
    employerName: commitment.employer_name || quote.client_name || '',
    brokerName: quote.broker_name || '',
    brokerAgency: quote.broker_agency || '',
    forms,
    otherServices: other,
    census,
    prefill: prefillFrom(commitment, quote),
    answers: splitMarks(application ? parse(application.answers, {}) : {}).answers,
    abyAdded: splitMarks(application ? parse(application.answers, {}) : {}).marks,
    status: application ? application.status : 'new',
    updatedAt: application ? application.updated_at : null,
    submittedAt: application ? application.submitted_at : null,
    submittedBy: application ? (application.submitted_by || '') : '',
    // Null on an application submitted before signing existed, or before the column was migrated.
    signatureImage: application && isSignature(application.signature_image) ? application.signature_image : null,
  };
}

// GET /api/q/<token>/application
export async function handleGetApplication(token, env) {
  try {
    const ctx = await context(env, token);
    if (ctx.status === 404) return json({ ok: false, error: 'not_found' }, 404);
    if (ctx.status === 409) return json({ ok: false, error: 'not_signed' }, 409);
    return json(payload(ctx));
  } catch (err) {
    console.error('application load failed:', err);
    return json({ ok: false, error: 'server', message: 'This page could not be loaded right now.' }, 500);
  }
}

async function upsert(env, ctx, answers, extra) {
  const now = new Date().toISOString();
  if (ctx.application) {
    const sets = ['answers = ?', 'updated_at = ?', 'commitment_id = ?'];
    const vals = [JSON.stringify(answers), now, ctx.commitment.id];
    if (extra) Object.keys(extra).forEach((k) => { sets.push(k + ' = ?'); vals.push(extra[k]); });
    // Guarded on status so two tabs cannot write over a submitted application.
    const r = await env.DB.prepare(
      'UPDATE applications SET ' + sets.join(', ') + " WHERE id = ? AND status = 'draft'"
    ).bind(...vals, ctx.application.id).run();
    if (!r.meta || !r.meta.changes) return { conflict: true };
  } else {
    // 🔴 An `extra` column REPLACES the default rather than being appended after it. Appended, a
    // first-ever write that is also the submit (an employer who changed nothing the prefill gave
    // them) named `status` twice, SQLite kept the first - 'draft' - and the submit was lost while
    // the page said it had gone (found 10-01-2026 by check_application_signature.mjs).
    const row = { id: crypto.randomUUID(), share_token: ctx.token, commitment_id: ctx.commitment.id,
      quote_id: ctx.quote.id, answers: JSON.stringify(answers), status: 'draft', created_at: now, updated_at: now };
    if (extra) Object.keys(extra).forEach((k) => { row[k] = extra[k]; });
    const cols = Object.keys(row);
    const vals = cols.map((k) => row[k]);
    await env.DB.prepare(
      'INSERT INTO applications (' + cols.join(', ') + ') VALUES (' + cols.map(() => '?').join(', ') + ')'
    ).bind(...vals).run();
  }
  return { at: now };
}

// POST /api/q/<token>/application  { answers }
export async function handleSaveApplication(token, request, env) {
  const rb = await readBody(request);
  if (rb.error) return json({ ok: false, error: rb.error, message: 'That was too much to save at once.' }, 400);
  try {
    const ctx = await context(env, token);
    if (ctx.status !== 200) return json({ ok: false, error: ctx.status === 404 ? 'not_found' : 'not_signed' }, ctx.status);
    if (ctx.application && ctx.application.status !== 'draft') {
      return json({ ok: false, error: 'submitted', message: 'These answers were already submitted to ABY. Contact ABY to change them.' }, 409);
    }
    const r = await upsert(env, ctx, keepMarks(ctx, cleanAnswers(rb.body.answers)), null);
    if (r.conflict) return json({ ok: false, error: 'submitted', message: 'These answers were already submitted to ABY.' }, 409);
    return json({ ok: true, updatedAt: r.at });
  } catch (err) {
    console.error('application save failed:', err);
    return json({ ok: false, error: 'server', message: 'Not saved - please try again in a moment.' }, 500);
  }
}

// POST /api/q/<token>/application/submit  { answers, submittedBy, submittedEmail, confirmed, signatureImage }
export async function handleSubmitApplication(token, request, env, ctxWorker, notify) {
  const rb = await readBody(request, MAX_SUBMIT_BODY);
  if (rb.error) return json({ ok: false, error: rb.error }, 400);
  const b = rb.body || {};
  const by = String(b.submittedBy || '').trim().slice(0, 200);
  const email = String(b.submittedEmail || '').trim().slice(0, 200);
  if (!by || !email || b.confirmed !== true) {
    return json({ ok: false, error: 'incomplete', message: 'Please enter your name and email and confirm the answers.' }, 400);
  }
  if (!isSignature(b.signatureImage)) {
    return json({ ok: false, error: 'unsigned', message: 'Please sign in the signature box.' }, 400);
  }
  try {
    const ctx = await context(env, token);
    if (ctx.status !== 200) return json({ ok: false, error: ctx.status === 404 ? 'not_found' : 'not_signed' }, ctx.status);
    if (ctx.application && ctx.application.status !== 'draft') {
      return json({ ok: false, error: 'submitted', message: 'These answers were already submitted to ABY.' }, 409);
    }
    const now = new Date().toISOString();
    const answers = keepMarks(ctx, cleanAnswers(b.answers));
    const r = await upsert(env, ctx, answers,
      { status: 'submitted', submitted_at: now, submitted_by: by, submitted_email: email });
    if (r.conflict) return json({ ok: false, error: 'submitted', message: 'These answers were already submitted to ABY.' }, 409);
    // THE SIGNATURE, in its own statement: the answers are already safe, and a database whose
    // /api/migrate has not been run yet (no column) must not turn a submit into an error. The
    // admin view says "not stored" when it is missing, so the gap is visible rather than silent.
    try {
      await env.DB.prepare('UPDATE applications SET signature_image = ? WHERE share_token = ?')
        .bind(b.signatureImage, token).run();
    } catch (err) {
      console.error('application: could not store the drawn signature (run /api/migrate?):', err);
    }
    // Tell ABY - after the record is safe, and never able to undo it.
    if (notify) {
      const job = notify({
        quoteNumber: ctx.quote.quote_number, employerName: ctx.commitment.employer_name || ctx.quote.client_name,
        submittedBy: by, submittedEmail: email, origin: new URL(request.url).origin, commitmentId: ctx.commitment.id,
        shareToken: ctx.token,
      }).catch((e) => console.error('application email failed:', e));
      if (ctxWorker && ctxWorker.waitUntil) ctxWorker.waitUntil(job); else await job;
    }
    return json({ ok: true, submittedAt: now });
  } catch (err) {
    console.error('application submit failed:', err);
    return json({ ok: false, error: 'server', message: 'That did not go through. Your answers are saved; please try again.' }, 500);
  }
}

// GET /api/admin/application?cid=<commitment id>  (ABY admin only - the worker checks the session)
export async function handleAdminGetApplication(url, env) {
  const cid = String(url.searchParams.get('cid') || '');
  const c = await env.DB.prepare('SELECT share_token FROM commitments WHERE id = ?').bind(cid).first();
  if (!c || !c.share_token) return json({ ok: false, error: 'not_found' }, 404);
  // ⭐ THE LINK TO HAND ON (Eric, 10-06-2026: "Can we not just make that available without a login?"). The admin page
  // stays behind the login; the employer's own link already opens without one and shows the same answers, so the
  // admin view is given it to copy. Only the admin route adds it - the employer's page never shows its own token.
  const res = await handleGetApplication(c.share_token, env);
  if (res.status !== 200) return res;
  const body = await res.json();
  return json(Object.assign(body, { shareLink: '/q/' + c.share_token + '/apply?view=all' }));
}

// POST /api/admin/application/reopen  { cid }  - lets the employer edit again after a submit.
export async function handleAdminReopenApplication(request, env) {
  const rb = await readBody(request);
  const cid = String((rb.body && rb.body.cid) || '');
  const c = await env.DB.prepare('SELECT share_token FROM commitments WHERE id = ?').bind(cid).first();
  if (!c || !c.share_token) return json({ ok: false, error: 'not_found' }, 404);
  const r = await env.DB.prepare("UPDATE applications SET status = 'draft' WHERE share_token = ?").bind(c.share_token).run();
  return json({ ok: !!(r.meta && r.meta.changes) });
}

// POST /api/admin/application/answers  { cid, answers }  - ABY adds or changes answers (any status, signature kept).
// `answers` is the whole set the page holds; only keys whose value CHANGED are written and marked. A key ABY blanks is
// removed with its mark. Nothing else on the row moves: status, submitted_at/by and the signature stay the employer's.
export async function handleAdminSaveApplication(request, env) {
  const rb = await readBody(request);
  if (rb.error) return json({ ok: false, error: rb.error }, 400);
  const cid = String((rb.body && rb.body.cid) || '');
  const c = await env.DB.prepare('SELECT share_token FROM commitments WHERE id = ?').bind(cid).first();
  if (!c || !c.share_token) return json({ ok: false, error: 'not_found' }, 404);
  const ctx = await context(env, c.share_token);
  if (ctx.status !== 200) return json({ ok: false, error: 'not_found' }, 404);
  const now = new Date().toISOString();
  const before = splitMarks(ctx.application ? parse(ctx.application.answers, {}) : {});
  const next = cleanAnswers(rb.body.answers);
  const out = Object.assign({}, before.answers);
  // Eric, 10-07-2026: "definitely don't keep that for anything we answer before it's submitted." A mark says
  // ABY changed an answer the employer had already SIGNED; before a submit, the employer signs what ABY
  // filled in, so nothing is marked, and any older mark on an unsubmitted application is dropped.
  const signed = !!(ctx.application && ctx.application.status !== 'draft');
  const marks = signed ? Object.assign({}, before.marks) : {};
  const changed = [];
  new Set(Object.keys(next).concat(Object.keys(before.answers))).forEach((k) => {
    if (!KEYS.has(k)) return;
    if (next[k] === undefined) {
      if (before.answers[k] !== undefined && rb.body.answers && Object.prototype.hasOwnProperty.call(rb.body.answers, k)) {
        delete out[k]; delete marks[k]; changed.push(k);          // blanked on purpose
      }
      return;
    }
    if (!same(next[k], before.answers[k])) { out[k] = next[k]; if (signed) marks[k] = { at: now, value: next[k] }; changed.push(k); }
  });
  if (!signed && Object.keys(before.marks).length) changed.push('_marks_dropped');
  if (!changed.length) return json({ ok: true, changed: 0, updatedAt: ctx.application ? ctx.application.updated_at : null, abyAdded: marks });
  const stored = Object.keys(marks).length ? Object.assign({}, out, { [ABY_KEY]: marks }) : out;
  if (ctx.application) {
    await env.DB.prepare('UPDATE applications SET answers = ?, updated_at = ? WHERE id = ?')
      .bind(JSON.stringify(stored), now, ctx.application.id).run();
  } else {
    await upsert(env, ctx, stored, null);   // nothing saved yet: a draft the employer can still finish
  }
  return json({ ok: true, changed: changed.length, updatedAt: now, abyAdded: marks });
}

// The application block for the commitment's JSON export (aby.commitment/1 -> "application").
export async function applicationForExport(env, shareToken) {
  if (!shareToken) return null;
  try {
    const a = await env.DB.prepare('SELECT * FROM applications WHERE share_token = ?').bind(shareToken).first();
    if (!a) return null;
    return { status: a.status, updated_at: a.updated_at, submitted_at: a.submitted_at || null,
      submitted_by: a.submitted_by || null, submitted_email: a.submitted_email || null,
      // The drawn signature as a PNG data URL; null when submitted before signing existed.
      signature_image: isSignature(a.signature_image) ? a.signature_image : null,
      answers: splitMarks(parse(a.answers, {})).answers, aby_added: splitMarks(parse(a.answers, {})).marks,
      answers_labeled: labeledAnswers(splitMarks(parse(a.answers, {})).answers) };
  } catch (e) {
    return null;   // a database from before the table existed still exports the signature
  }
}

// ── Tell ABY an application was submitted (same sender and recipients as a signed authorization) ─
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export async function sendApplicationEmail(env, a) {
  if (!env.RESEND_API_KEY) return { ok: false, error: 'No Resend API key is set on the worker.' };
  const to = String(env.NOTIFY_EMAILS || 'eric@comedyce.com').split(',').map((x) => x.trim()).filter(Boolean);
  if (!to.length) return { ok: false, error: 'NOTIFY_EMAILS is empty.' };
  const view = (a.origin || '') + '/admin/application?cid=' + encodeURIComponent(a.commitmentId || '');
  const html =
    '<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#12263f">' +
    '<p><strong>' + escHtml(a.employerName || 'An employer') + '</strong> submitted the setup questions for quote <strong>' +
    escHtml(a.quoteNumber || '') + '</strong>.</p>' +
    '<p><strong>Submitted by:</strong> ' + escHtml(a.submittedBy || '') + (a.submittedEmail ? ' &middot; ' + escHtml(a.submittedEmail) : '') + '</p>' +
    '<p><a href="' + escHtml(view) + '" style="background:#143c73;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open the answers</a></p>' +
    // A link that opens WITHOUT an ABY login, to forward to whoever processes it (Eric, 10-06-2026). The email itself
    // still goes only to NOTIFY_EMAILS: "I do not want account managers getting the setup questions submitted email."
    (a.shareToken ? '<p style="margin-top:14px"><strong>To send it to someone without an ABY login</strong>, forward this link - it opens on all the answers:<br>' +
      '<a href="' + escHtml((a.origin || '') + '/q/' + a.shareToken + '/apply?view=all') + '">' + escHtml((a.origin || '') + '/q/' + a.shareToken + '/apply?view=all') + '</a></p>' : '') +
    '</div>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'ABY Quote Tool <' + (env.FROM_EMAIL || 'onboarding@resend.dev') + '>', to,
      subject: 'Setup questions submitted: ' + (a.employerName || 'employer') + ' (' + (a.quoteNumber || '') + ')', html }),
  });
  if (!res.ok) return { ok: false, error: 'Resend refused it (' + res.status + ')' };
  return { ok: true };
}

// ── The answers in a form a machine can read (Eric, 09-29-2026: "provide them in json format for
// our account managers who might want to pull them into the system they're working on creating").
// Each answer carries its KEY (stable, for a program) and its QUESTION and SECTION (for a person).
export function labeledAnswers(answers) {
  const out = [];
  Questions.SECTIONS.forEach((s) => s.questions.forEach((q) => {
    if (answers && answers[q.key] !== undefined) {
      out.push({ section: s.title, key: q.key, question: q.label, answer: answers[q.key] });
    }
  }));
  return out;
}
