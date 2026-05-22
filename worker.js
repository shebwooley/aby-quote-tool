/**
 * ABY Quote Tool — Cloudflare Worker
 * Handles API routes; all other requests pass through to static assets.
 *
 * Required bindings (set in wrangler.jsonc or Cloudflare dashboard):
 *   DB             — D1 database
 *   ASSETS         — static assets binding
 *
 * Required secrets (set via Cloudflare dashboard → Workers → Settings → Variables):
 *   RESEND_API_KEY — from resend.com
 *   ADMIN_PASSWORD — password for /admin
 *   FROM_EMAIL     — verified sender address in Resend (e.g. quotes@yourdomain.com)
 */

const COOKIE_NAME = 'aby_admin';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ── API routes ──────────────────────────────────────────────────────────────
    if (path === '/api/quotes' && method === 'POST')  return handleSaveQuote(request, env, ctx);
    if (path === '/api/quotes' && method === 'GET')   return withAuth(request, env, () => handleListQuotes(request, env));
    if (/^\/api\/quotes\/[^/]+$/.test(path) && method === 'GET') {
      return withAuth(request, env, () => handleGetQuote(path.split('/').pop(), env));
    }
    if (/^\/api\/quotes\/[^/]+$/.test(path) && method === 'DELETE') {
      return withAuth(request, env, () => handleDeleteQuote(path.split('/').pop(), env));
    }
    if (/^\/api\/quotes\/[^/]+$/.test(path) && method === 'PATCH') {
      return withAuth(request, env, () => handleUpdateQuoteStatus(request, path.split('/').pop(), env));
    }
    // CORS preflight for cross-origin requests (e.g. from downloaded HTML files)
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }});
    if (path === '/api/commitments' && method === 'POST') return handleSaveCommitment(request, env);
    if (path === '/api/commitments' && method === 'GET')  return withAuth(request, env, () => handleListCommitments(request, env));
    if (path === '/api/admin/login'  && method === 'POST') return handleLogin(request, env);
    if (path === '/api/admin/logout')                      return handleLogout();

    // ── Diagnostic: minimal auth-gated D1 query ────────────────────────────────
    if (path === '/api/quotes-ping') {
      return withAuth(request, env, async () => {
        try {
          const r = await env.DB.prepare(
            'SELECT id, quote_number, created_at FROM quotes ORDER BY created_at DESC LIMIT 3'
          ).all();
          return jsonResp({ ok: true, rowCount: (r.results || []).length, rows: r.results || [] });
        } catch (e) {
          return jsonResp({ ok: false, error: String(e) }, 500);
        }
      });
    }

    // ── Admin page ──────────────────────────────────────────────────────────────
    if (path === '/admin' || path === '/admin/') {
      return withAuth(request, env, () =>
        new Response(adminHTML(), {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',          // never let Cloudflare cache the authenticated page
          },
        })
      );
    }
    if (path === '/admin.html') {
      return Response.redirect(new URL('/admin', request.url).toString(), 302);
    }

    // ── Diagnostics ─────────────────────────────────────────────────────────────
    if (path === '/api/debug') {
      // Test DB connectivity and schema
      let dbStatus = 'not bound';
      let quoteCount = null;
      let hasStatusCol = null;
      if (env.DB) {
        try {
          const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM quotes').first();
          quoteCount = r ? r.n : 0;
          dbStatus = 'connected';
        } catch (e) {
          dbStatus = 'error: ' + String(e);
        }
        try {
          // PRAGMA table_info returns one row per column
          const cols = await env.DB.prepare("PRAGMA table_info('quotes')").all();
          hasStatusCol = (cols.results || []).some(c => c.name === 'status');
        } catch (e) {
          hasStatusCol = 'error: ' + String(e);
        }
      }
      return jsonResp({
        hasResendKey:     !!env.RESEND_API_KEY,
        resendKeyPrefix:  env.RESEND_API_KEY ? env.RESEND_API_KEY.slice(0, 6) : 'MISSING',
        hasAdminPassword: !!env.ADMIN_PASSWORD,
        hasFromEmail:     !!env.FROM_EMAIL,
        fromEmail:        env.FROM_EMAIL || 'MISSING',
        dbStatus,
        quoteCount,
        hasStatusCol,
      });
    }
    if (path === '/api/test-email') {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `ABY Quote Tool <${env.FROM_EMAIL || 'onboarding@resend.dev'}>`,
            to: ['eric@comedyce.com'],
            subject: 'ABY Quote Tool — test email',
            html: '<p>This is a test. If you got this, email notifications are working.</p>',
          }),
        });
        const body = await res.text();
        return jsonResp({ status: res.status, ok: res.ok, response: body });
      } catch (err) {
        return jsonResp({ error: err.message });
      }
    }

    // ── Static assets ───────────────────────────────────────────────────────────
    return env.ASSETS.fetch(request);
  }
};

// ─── Quote: save ───────────────────────────────────────────────────────────────

async function handleSaveQuote(request, env, ctx) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResp({ error: 'Invalid JSON' }, 400); }

  const id  = crypto.randomUUID();
  const now = new Date().toISOString();

  const {
    quoteNumber        = 'UNKNOWN',
    clientName         = '',
    effectiveDate      = '',
    brokerName         = '',
    brokerAgency       = '',
    brokerPhone        = '',
    brokerEmail        = '',
    repName            = '',
    repPhone           = '',
    repEmail           = '',
    commissionIncluded = true,
    products           = [],
  } = body;

  try {
    await env.DB.prepare(`
      INSERT INTO quotes
        (id, quote_number, created_at, client_name, effective_date,
         broker_name, broker_agency, broker_phone, broker_email,
         rep_name, rep_phone, rep_email, commission_included, products)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, quoteNumber, now, clientName, effectiveDate,
      brokerName, brokerAgency, brokerPhone, brokerEmail,
      repName, repPhone, repEmail,
      commissionIncluded ? 1 : 0,
      JSON.stringify(products)
    ).run();
  } catch (err) {
    console.error('DB insert failed:', err);
    return jsonResp({ error: 'Failed to save quote' }, 500);
  }

  const origin = new URL(request.url).origin;
  try {
    await sendEmail(env, { id, quoteNumber, clientName, effectiveDate, brokerName, brokerAgency, repName, repEmail, commissionIncluded, products, origin });
  } catch (err) {
    console.error('Email send failed:', err.message);
  }

  return jsonResp({ id, quoteNumber });
}

// ─── Quote: list (admin) ───────────────────────────────────────────────────────

async function handleListQuotes(request, env) {
  const url    = new URL(request.url);
  const q      = (url.searchParams.get('q') || '').trim();
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '300'), 500);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const cols = "id, quote_number, created_at, client_name, effective_date, broker_name, broker_agency, broker_phone, broker_email, rep_name, rep_phone, rep_email, commission_included, products, COALESCE(status, 'P') AS status";

  try {
    let result;
    if (q) {
      const like = `%${q}%`;
      result = await env.DB.prepare(`
        SELECT ${cols} FROM quotes
        WHERE client_name LIKE ? OR broker_name LIKE ? OR broker_agency LIKE ?
              OR quote_number LIKE ? OR rep_name LIKE ?
        ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).bind(like, like, like, like, like, limit, offset).all();
    } else {
      result = await env.DB.prepare(
        `SELECT ${cols} FROM quotes ORDER BY created_at DESC LIMIT ? OFFSET ?`
      ).bind(limit, offset).all();
    }
    return jsonResp({ quotes: result.results || [] });
  } catch (err) {
    console.error('handleListQuotes failed:', err);
    return jsonResp({ error: String(err) }, 500);
  }
}

// ─── Quote: get single (admin) ─────────────────────────────────────────────────

async function handleGetQuote(id, env) {
  const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
  if (!row) return jsonResp({ error: 'Not found' }, 404);
  return jsonResp(row);
}

// ─── Quote: delete (admin) ────────────────────────────────────────────────────

async function handleDeleteQuote(id, env) {
  try {
    await env.DB.prepare('DELETE FROM quotes WHERE id = ?').bind(id).run();
    return jsonResp({ ok: true });
  } catch (err) {
    console.error('handleDeleteQuote failed:', err);
    return jsonResp({ error: String(err) }, 500);
  }
}

// ─── Quote: update status (admin) ─────────────────────────────────────────────

async function handleUpdateQuoteStatus(request, id, env) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResp({ error: 'Invalid JSON' }, 400); }
  const { status } = body;
  if (!['P', 'S', 'D'].includes(status)) {
    return jsonResp({ error: 'Invalid status' }, 400);
  }
  try {
    await env.DB.prepare('UPDATE quotes SET status = ? WHERE id = ?').bind(status, id).run();
    return jsonResp({ ok: true });
  } catch (err) {
    console.error('handleUpdateQuoteStatus failed:', err);
    return jsonResp({ error: String(err) }, 500);
  }
}

// ─── Email via Resend ──────────────────────────────────────────────────────────

async function sendEmail(env, { quoteNumber, clientName, effectiveDate, brokerName, brokerAgency, repName, repEmail, commissionIncluded, products, origin }) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email notification');
    return;
  }

  const fromEmail  = env.FROM_EMAIL || 'onboarding@resend.dev';
  const adminUrl   = `${origin}/admin`;
  const productNames = Array.isArray(products)
    ? products.map(p => p.name || p.id || '?').filter(Boolean).join(', ')
    : String(products || '—');

  const subject = `New ABY Quote: ${quoteNumber} — ${clientName}`;
  const html = `<!DOCTYPE html>
<html><body style="font-family:system-ui,sans-serif;color:#1a1a1a;padding:24px;max-width:580px;margin:0 auto;">
  <div style="background:#1a5c3a;color:white;padding:16px 20px;border-radius:8px 8px 0 0;margin-bottom:0;">
    <strong style="font-size:1rem;">ABY Quote Tool</strong>
  </div>
  <div style="background:white;border:1px solid #e5e5e5;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
    <h2 style="margin:0 0 20px;font-size:1.15rem;color:#1a1a1a;">New Quote Generated</h2>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <tr><td style="padding:6px 16px 6px 0;color:#666;white-space:nowrap;width:120px;">Quote #</td>
          <td><strong style="font-family:monospace;">${quoteNumber}</strong></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666;">Client</td>
          <td><strong>${esc(clientName)}</strong></td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666;">Effective</td>
          <td>${esc(effectiveDate) || '—'}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666;">Broker</td>
          <td>${[brokerName, brokerAgency].filter(Boolean).map(esc).join(' — ') || '—'}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666;">Products</td>
          <td>${esc(productNames) || '—'}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666;">Commission</td>
          <td>${commissionIncluded ? 'Included (−C)' : 'Not included (−NC)'}</td></tr>
    </table>
    <div style="margin-top:24px;">
      <a href="${adminUrl}"
         style="display:inline-block;padding:10px 22px;background:#1a5c3a;color:white;
                text-decoration:none;border-radius:6px;font-weight:600;font-size:.9rem;">
        View all quotes in admin →
      </a>
    </div>
  </div>
</body></html>`;

  const repTo  = 'eric@comedyce.com';
  const ccList = [];

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    `ABY Quote Tool <${fromEmail}>`,
      to:      [repTo],
      cc:      ccList,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}

// ─── Admin auth ────────────────────────────────────────────────────────────────

async function handleSaveCommitment(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResp({ error: 'Invalid JSON' }, 400); }

  const id  = crypto.randomUUID();
  const now = new Date().toISOString();

  const {
    quoteNumber    = 'UNKNOWN',
    employerName   = '',
    address        = '',
    cityStateZip   = '',
    authSigner     = '',
    authTitle      = '',
    authEmail      = '',
    authPhone      = '',
    hrContact      = '',
    hrTitle        = '',
    hrEmail        = '',
    hrPhone        = '',
    startDate      = '',
    acceptedPrint  = '',
    acceptedSign   = '',
    products       = [],
  } = body;

  try {
    await env.DB.prepare(`
      INSERT INTO commitments
        (id, quote_number, submitted_at, employer_name, address, city_state_zip,
         auth_signer, auth_title, auth_email, auth_phone,
         hr_contact, hr_title, hr_email, hr_phone,
         start_date, accepted_print, accepted_sign, products)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, quoteNumber, now, employerName, address, cityStateZip,
      authSigner, authTitle, authEmail, authPhone,
      hrContact, hrTitle, hrEmail, hrPhone,
      startDate, acceptedPrint, acceptedSign,
      JSON.stringify(products)
    ).run();
  } catch (err) {
    console.error('Commitment insert failed:', err);
    return jsonResp({ error: 'Failed to save commitment' }, 500);
  }

  return jsonResp({ id, quoteNumber, submitted_at: now });
}

async function handleListCommitments(request, env) {
  try {
    const result = await env.DB.prepare(
      'SELECT * FROM commitments ORDER BY submitted_at DESC LIMIT 200'
    ).all();
    return jsonResp({ commitments: result.results || [] });
  } catch (err) {
    return jsonResp({ error: String(err) }, 500);
  }
}

async function handleLogin(request, env) {
  let pw;
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const b = await request.json().catch(() => ({}));
    pw = b.password;
  } else {
    const fd = await request.formData().catch(() => null);
    pw = fd?.get('password');
  }

  if (!pw || pw !== env.ADMIN_PASSWORD) {
    return jsonResp({ error: 'Unauthorized' }, 401);
  }

  const token = await makeToken(env.ADMIN_PASSWORD);
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`,
    },
  });
}

function handleLogout() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${COOKIE_NAME}=deleted; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`,
    },
  });
}

async function withAuth(request, env, handler) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token   = cookies[COOKIE_NAME];

  if (token && await verifyToken(token, env.ADMIN_PASSWORD)) {
    return handler();
  }

  // API routes: return JSON 401 so the admin JS can show a real error message
  if (new URL(request.url).pathname.startsWith('/api/')) {
    return jsonResp({ error: 'Session expired — please log in again.' }, 401);
  }

  // Page routes: show the login form, never cached
  return new Response(loginHTML(), {
    status: 401,
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

// ─── Token helpers ─────────────────────────────────────────────────────────────

async function makeToken(password) {
  const enc = new TextEncoder();
  const key  = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig  = await crypto.subtle.sign('HMAC', key, enc.encode('aby-admin-v1'));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifyToken(token, password) {
  if (!password) return false;
  try { return token === await makeToken(password); }
  catch { return false; }
}

function parseCookies(header) {
  const out = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k.trim()] = rest.join('=').trim();
  }
  return out;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Admin dashboard HTML ──────────────────────────────────────────────────────

function adminHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ABY Quote Admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#f0f4f0;color:#1a1a1a;min-height:100vh}
header{background:#1a5c3a;color:white;padding:14px 24px;display:flex;align-items:center;gap:12px;
       position:sticky;top:0;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.2)}
header h1{font-size:1.05rem;font-weight:700;flex:1}
header .logout{color:rgba(255,255,255,.75);font-size:.875rem;cursor:pointer;background:none;
               border:none;padding:4px 8px;border-radius:4px}
header .logout:hover{background:rgba(255,255,255,.15);color:white}
.toolbar{background:white;border-bottom:1px solid #e5e5e5;padding:12px 24px;
         display:flex;align-items:center;gap:12px}
.toolbar input{flex:1;max-width:400px;padding:.5rem .75rem;border:1px solid #ddd;
               border-radius:6px;font-size:.95rem}
.toolbar input:focus{outline:none;border-color:#1a5c3a}
.count{color:#888;font-size:.85rem;margin-left:auto;white-space:nowrap}
main{padding:20px 24px}
.table-wrap{background:white;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden}
table{width:100%;border-collapse:collapse}
thead{background:#f7f9f7}
th{padding:10px 14px;text-align:left;font-size:.75rem;font-weight:700;color:#555;
   text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;border-bottom:1px solid #e8e8e8}
td{padding:11px 14px;font-size:.875rem;border-top:1px solid #f0f0f0;vertical-align:middle}
tbody tr.data-row{cursor:pointer;transition:background .1s}
tbody tr.data-row:hover td{background:#f6fbf7}
tbody tr.data-row.expanded td{background:#f0f8f2;border-top-color:#d4ead9}
.qnum{font-family:monospace;font-size:.82rem;font-weight:700;color:#1a5c3a;white-space:nowrap}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:.72rem;font-weight:700;letter-spacing:.03em}
.badge-c{background:#e8f5ee;color:#1a6640}
.badge-nc{background:#fdf3e8;color:#a85400}
.date-main{font-size:.875rem}
.date-time{font-size:.78rem;color:#999}
.muted{color:#aaa;font-style:italic}
tr.detail-row td{background:#f5fbf6;padding:16px 20px 20px;border-top:none;border-bottom:2px solid #d4ead9}
.detail-inner{max-width:700px}
.detail-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:16px}
.detail-item label{display:block;font-size:.72rem;font-weight:700;color:#888;
                    text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
.detail-item span{font-size:.875rem;color:#1a1a1a}
.chip{background:#e8f5ee;color:#1a6640;border-radius:4px;padding:2px 8px;font-size:.8rem;font-weight:600}
.empty-row td{text-align:center;padding:60px;color:#aaa;font-style:italic}
.c-row:hover td{background:#f9fafb}
.loading{text-align:center;padding:60px;color:#aaa}
.error-msg{text-align:center;padding:40px;color:#c0392b}
.tabs{background:white;border-bottom:1px solid #e5e5e5;padding:0 24px;display:flex;gap:0}
.tab{width:auto !important;background:transparent !important;color:#666;border:none;
     border-bottom:3px solid transparent;border-radius:0 !important;padding:.75rem 1.25rem;
     font-size:.875rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:color .15s}
.tab:hover{background:rgba(0,0,0,.04) !important;color:#333}
.tab.active{color:#1a5c3a !important;border-bottom-color:#1a5c3a;background:transparent !important}
.tab-count{font-size:.75rem;background:#e8f5ee;color:#1a6640;border-radius:99px;
           padding:1px 7px;margin-left:5px;font-weight:700;display:inline-block}
.tab.active .tab-count{background:#1a5c3a;color:white}
.detail-actions{margin-top:.85rem;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
@media(max-width:680px){
  header{padding:12px 16px}
  .toolbar{padding:10px 12px}
  .tabs{padding:0 12px}
  .tab{padding:.6rem .8rem;font-size:.8rem}
  main{padding:12px}
  .table-wrap{background:transparent;box-shadow:none;overflow:visible}
  table,tbody{display:block;width:100%}
  thead,colgroup{display:none}
  tr.data-row{display:grid;grid-template-columns:1fr auto;
              grid-template-rows:auto auto auto auto;
              background:white;border-radius:8px;margin-bottom:8px;
              padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,.08);
              cursor:pointer;gap:1px 8px;border:1px solid #eaeaea}
  tr.data-row:hover td{background:transparent}
  tr.data-row.expanded{border-radius:8px 8px 0 0;border-bottom-color:transparent}
  tr.data-row td{display:block;border:none;padding:0;background:transparent !important}
  tr.data-row td:nth-child(1){grid-column:1;grid-row:1;font-size:.72rem;color:#999}
  tr.data-row td:nth-child(2){grid-column:1;grid-row:2;font-weight:600;font-size:.95rem}
  tr.data-row td:nth-child(3){grid-column:1;grid-row:3;font-size:.8rem;color:#666}
  tr.data-row td:nth-child(4){grid-column:1;grid-row:4;font-size:.78rem;color:#666}
  tr.data-row td:nth-child(5){grid-column:1/-1;grid-row:5;margin-top:6px}
  tr.data-row td:nth-child(6){grid-column:2;grid-row:1/-1;display:flex;align-items:center;justify-content:center}
  tr.detail-row{display:block;margin-bottom:12px}
  tr.detail-row td{display:block;border-radius:0 0 8px 8px;padding:14px}
  tr:not(.data-row):not(.detail-row){display:block}
  tr:not(.data-row):not(.detail-row) td{display:block}
  .detail-inner{max-width:100%}
  .detail-grid{grid-template-columns:1fr 1fr}
  .detail-actions{flex-direction:column;align-items:stretch}
  .detail-actions a,.detail-actions button{margin-left:0 !important;justify-content:center;text-align:center}
}
</style>
</head>
<body>
<header>
  <h1>ABY Quote Admin</h1>
  <button class="logout" onclick="logout()">Log out</button>
</header>
<div class="toolbar">
  <input type="text" id="search" placeholder="Search by client, broker, agency, or quote number…">
  <span class="count" id="count"></span>
</div>
<div class="tabs">
  <button class="tab active" data-status="P">Pending</button>
  <button class="tab" data-status="S">Sold</button>
  <button class="tab" data-status="D">Dead</button>
  <button class="tab" data-view="commitments" id="commitmentsTab" style="margin-left:auto">Commitments</button>
</div>
<main>
  <div class="table-wrap">
    <table>
      <colgroup>
        <col style="width:11%">
        <col style="width:17%">
        <col style="width:20%">
        <col style="width:12%">
        <col style="width:35%">
        <col style="width:5%">
      </colgroup>
      <thead>
        <tr>
          <th>Date / Time</th><th>Client</th>
          <th>Broker / Agency</th><th>Rep</th><th>Products</th><th>Comm</th>
        </tr>
      </thead>
      <tbody id="tbody">
        <tr><td colspan="6" class="loading">Loading quotes…</td></tr>
      </tbody>
    </table>
  </div>
<div id="commitments-wrap" style="display:none;overflow-x:auto">
  <table id="ctable" style="width:100%;border-collapse:collapse;font-size:13px">
    <thead>
      <tr>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0;white-space:nowrap">Submitted</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Quote #</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Employer</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Auth Signer</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Email / Phone</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Start Date</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Products</th>
        <th style="padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0"></th>
      </tr>
    </thead>
    <tbody id="ctbody"><tr><td colspan="8" style="padding:20px;color:#888;text-align:center">Loading…</td></tr></tbody>
  </table>
</div>
</main>
<script>
let quotes = [];
let expandedId = null;
let activeTab = 'P';

async function load(q) {
  q = q || '';
  const url = '/api/quotes' + (q ? ('?q=' + encodeURIComponent(q)) : '');
  const tbody = document.getElementById('tbody');

  tbody.innerHTML = '<tr><td colspan="6" class="loading">Loading quotes…</td></tr>';

  let res;
  try {
    res = await fetch(url);
  } catch (netErr) {
    tbody.innerHTML = '<tr><td colspan="6" class="error-msg">Network error: ' + netErr.message + '</td></tr>';
    return;
  }

  if (res.status === 401) {
    tbody.innerHTML = '<tr><td colspan="6" class="error-msg">Session expired — <a href="/admin">click here to log in again</a>.</td></tr>';
    return;
  }
  if (!res.ok) {
    const errBody = await res.json().catch(function(){ return {}; });
    tbody.innerHTML = '<tr><td colspan="6" class="error-msg">Server error ' + res.status + ': ' + (errBody.error || 'unknown error') + '</td></tr>';
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch (parseErr) {
    tbody.innerHTML = '<tr><td colspan="6" class="error-msg">Could not read server response: ' + parseErr.message + '</td></tr>';
    return;
  }

  quotes = data.quotes || [];
  render();
}

function render() {
  const tbody = document.getElementById('tbody');
  const filtered = quotes.filter(function(q){ return (q.status || 'P') === activeTab; });

  ['P','S','D'].forEach(function(s) {
    var btn = document.querySelector('.tab[data-status="' + s + '"]');
    if (!btn) return;
    var n = quotes.filter(function(q){ return (q.status || 'P') === s; }).length;
    var label = {P:'Pending',S:'Sold',D:'Dead'}[s];
    btn.innerHTML = label + (n ? ' <span class="tab-count">' + n + '</span>' : '');
  });

  document.getElementById('count').textContent =
    filtered.length ? (filtered.length + ' quote' + (filtered.length !== 1 ? 's' : '')) : '';
  if (!filtered.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No quotes found.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  for (const q of filtered) {
    const isC      = !(q.quote_number || '').endsWith('-NC');
    const products = parseProducts(q.products);
    const dt       = new Date(q.created_at);
    const dateStr  = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr  = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const isExp    = expandedId === q.id;

    const row = document.createElement('tr');
    row.className = 'data-row' + (isExp ? ' expanded' : '');
    row.dataset.id = q.id;

    const brokerCell = (q.broker_name ? esc(q.broker_name) : '<span class="muted">—</span>') +
      (q.broker_agency ? '<br><span style="font-size:.8rem;color:#888">' + esc(q.broker_agency) + '</span>' : '');

    const chipHtml = products.slice(0,3).map(function(p){
      return '<span class="chip" style="white-space:nowrap">' + esc(p) + '</span>';
    }).join('') + (products.length > 3 ? '<span style="color:#888;font-size:.78rem;white-space:nowrap">+' + (products.length-3) + ' more</span>' : '');

    row.innerHTML =
      '<td><div class="date-main">' + dateStr + '</div><div class="date-time">' + timeStr + '</div></td>' +
      '<td>' + (esc(q.client_name) || '<span class="muted">—</span>') + '</td>' +
      '<td>' + brokerCell + '</td>' +
      '<td>' + (q.rep_name ? esc(q.rep_name.split(' ')[0]) : '<span class="muted">—</span>') + '</td>' +
      '<td><div style="display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start">' + chipHtml + '</div></td>' +
      '<td><span class="badge ' + (isC ? 'badge-c' : 'badge-nc') + '">' + (isC ? 'C' : 'NC') + '</span></td>';

    row.addEventListener('click', function(){ toggleDetail(q.id); });
    tbody.appendChild(row);

    if (isExp) {
      const dr = document.createElement('tr');
      dr.className = 'detail-row';
      dr.innerHTML = '<td colspan="6">' + detailHTML(q, products) + '</td>';
      tbody.appendChild(dr);
    }
  }
}

function toggleDetail(id) {
  expandedId = (expandedId === id) ? null : id;
  render();
}

function detailHTML(q, products) {
  const rerunState = JSON.stringify({
    clientName: q.client_name || '',
    effectiveDate: q.effective_date || '',
    brokerName: q.broker_name || '',
    brokerAgency: q.broker_agency || '',
    brokerPhone: q.broker_phone || '',
    brokerEmail: q.broker_email || '',
    commissionIncluded: !!q.commission_included,
    repName: q.rep_name || '',
    products: q.products || '[]'
  });
  const rerunUrl = '/?rerun=' + encodeURIComponent(rerunState);
  var curStatus = q.status || 'P';
  var moveTargets = ['P','S','D'].filter(function(s){ return s !== curStatus; });
  var moveLabels = {P:'Pending',S:'Sold',D:'Dead'};
  var moveButtons = moveTargets.map(function(s){
    return '<button onclick="event.stopPropagation();moveQuote(this.dataset.id,this.dataset.status)" data-id="' + q.id + '" data-status="' + s + '" style="display:inline-flex;align-items:center;gap:.25rem;padding:.35rem .8rem;background:white;color:#555;border-radius:6px;font-size:.82rem;font-weight:600;border:1px solid #ddd;cursor:pointer">Move to ' + moveLabels[s] + '</button>';
  }).join('');
  return '<div class="detail-inner">' +
    '<div class="detail-grid">' +
      '<div class="detail-item"><label>Quote #</label><span class="qnum">' + esc(q.quote_number) + '</span></div>' +
      '<div class="detail-item"><label>Effective Date</label><span>' + (esc(q.effective_date) || '—') + '</span></div>' +
      '<div class="detail-item"><label>Broker Phone</label><span>' + (esc(q.broker_phone) || '—') + '</span></div>' +
      '<div class="detail-item"><label>Broker Email</label><span>' + (esc(q.broker_email) || '—') + '</span></div>' +
    '</div>' +
    '<div class="detail-actions">' +
      '<a href="' + rerunUrl + '&readonly=1" target="_blank" style="display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;background:#e8f4ec;color:#1a5c3a;border-radius:6px;text-decoration:none;font-size:.85rem;font-weight:600;border:1px solid #b8d9c4">View Quote ↗</a>' +
      '<a href="' + rerunUrl + '" target="_blank" style="display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;background:white;color:#555;border-radius:6px;text-decoration:none;font-size:.85rem;font-weight:600;border:1px solid #ddd">Re-run Quote ↗</a>' +
      moveButtons +
      '<button onclick="event.stopPropagation();deleteQuote(this.dataset.id)" data-id="' + q.id + '" style="margin-left:auto;display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;background:white;color:#c0392b;border-radius:6px;font-size:.85rem;font-weight:600;border:1px solid #f5b8b8;cursor:pointer">Delete ✕</button>' +
    '</div>' +
    '</div>';
}

const PRODUCT_SHORT = {
  pop:              { def: 'POP', embedsName: true, packages: { docsOnly: 'POP Docs Only', popHsa: 'POP + NDT (POP & HSA)', full: 'POP + NDT (FSA & HSA)' } },
  fsa:              { def: 'FSA / DCAP / LFSA', countLabel: 'participants' },
  hsa:              { def: 'HSA', countLabel: 'accounts' },
  hra:              { def: 'HRA', countLabel: 'participants' },
  ichra:            { def: 'ICHRA / QSEHRA', packages: { fullAdmin: 'Full Admin', docsOnly: 'Docs Only' }, countLabel: 'participants' },
  cobra:            { def: 'COBRA', countLabel: 'eligible employees' },
  stateContinuation:{ def: 'State Continuation', countLabel: 'employees' },
  erisa:            { def: 'ERISA Wrap', packages: { basic: 'Basic', buyUp: 'Buy-Up', enhanced: 'Enhanced', fullPlan: 'Full Plan', whiteGlove: 'White Glove' } },
  aca:              { def: 'ACA Reporting', packages: { smallB: 'Small/Level-Funded 1095-B', fullLt100: 'ALE Full <100', fullMid: 'ALE Full 100–249', fullHigh: 'ALE Full 250–499', selfLt100: 'ALE Self <100', selfMid: 'ALE Self 100–249', selfHigh: 'ALE Self 250–499' }, countLabel: 'forms' },
};
const PRODUCT_NAME_TO_ID = {
  'Section 125 Premium Only Plan (POP)': 'pop',
  'Section 125 Cafeteria Plan with FSA / DCAP / LFSA': 'fsa',
  'Health Savings Account (HSA) Administration': 'hsa',
  'Section 105 Health Reimbursement Arrangement (HRA)': 'hra',
  'ICHRA / QSEHRA': 'ichra',
  'COBRA Administration': 'cobra',
  'Texas State Continuation (Mini-COBRA)': 'stateContinuation',
  'ERISA Wrap Document & Compliance': 'erisa',
  'ACA Forms 1094/1095 Reporting': 'aca',
};

function shortProductName(p) {
  if (typeof p === 'string') return p;
  const id = (p.id in PRODUCT_SHORT) ? p.id : (PRODUCT_NAME_TO_ID[p.id] || PRODUCT_NAME_TO_ID[p.name] || p.id);
  const entry = PRODUCT_SHORT[id];
  let label;

  if (!entry) {
    label = p.name || p.id || '?';
  } else {
    const def        = (typeof entry === 'string') ? entry : (entry.def || id);
    const pkgs       = (typeof entry === 'object') ? entry.packages : null;
    const countLabel = (typeof entry === 'object' && entry.countLabel) ? entry.countLabel : 'participants';
    const embedsName = !!(typeof entry === 'object' && entry.embedsName);

    if (p.inputs && p.inputs.packageIds) {
      const labels = p.inputs.packageIds.split(',').filter(Boolean).map(function(pkgId) {
        return (pkgs && pkgs[pkgId]) || pkgId;
      });
      label = labels.length > 0 ? def + ' — ' + labels.join(', ') : def;
    } else if (p.inputs && p.inputs.package) {
      const pkgLabel = pkgs && pkgs[p.inputs.package];
      label = pkgLabel ? (embedsName ? pkgLabel : def + ' — ' + pkgLabel) : def;
    } else {
      label = def;
    }

    if (p.inputs && p.inputs.count) {
      label += ' (' + p.inputs.count + ' ' + countLabel + ')';
    }
  }

  return label;
}

function parseProducts(raw) {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
    return arr.map(shortProductName).filter(Boolean);
  } catch(e) { return []; }
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function logout() {
  await fetch('/api/admin/logout');
  location.href = '/admin';
}

async function moveQuote(id, status) {
  var res = await fetch('/api/quotes/' + id, {
    method: 'PATCH',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({status: status})
  });
  if (res.ok) {
    var q = quotes.find(function(q){ return q.id === id; });
    if (q) q.status = status;
    expandedId = null;
    render();
  } else {
    alert('Could not update status — please try again.');
  }
}

async function deleteQuote(id) {
  if (!confirm('Delete this quote? This cannot be undone.')) return;
  var res = await fetch('/api/quotes/' + id, { method: 'DELETE' });
  if (res.ok) {
    quotes = quotes.filter(function(q) { return q.id !== id; });
    expandedId = null;
    render();
  } else {
    alert('Delete failed — please try again.');
  }
}

let searchTimer;
document.getElementById('search').addEventListener('input', function(e) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function() {
    expandedId = null;
    load(e.target.value.trim());
  }, 300);
});

load();

document.querySelectorAll('.tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab').forEach(function(b){ b.classList.remove('active'); });
    this.classList.add('active');

    if (this.dataset.view === 'commitments') {
      document.querySelector('.table-wrap').style.display = 'none';
      document.getElementById('commitments-wrap').style.display = 'block';
      document.getElementById('search').style.display = 'none';
      document.getElementById('count').textContent = '';
      loadCommitments();
    } else {
      document.querySelector('.table-wrap').style.display = 'block';
      document.getElementById('commitments-wrap').style.display = 'none';
      document.getElementById('search').style.display = '';
      activeTab = this.dataset.status;
      expandedId = null;
      render();
    }
  });
});

var commitmentData = {};
let commitmentsLoaded = false;
async function loadCommitments() {
  if (commitmentsLoaded) return;
  const ctbody = document.getElementById('ctbody');
  try {
    const res = await fetch('/api/commitments');
    if (!res.ok) { ctbody.innerHTML = '<tr><td colspan="8" style="padding:16px;color:#c00;text-align:center">Error loading commitments.</td></tr>'; return; }
    const data = await res.json();
    const rows = data.commitments || [];
    document.getElementById('count').textContent = rows.length + ' commitment' + (rows.length !== 1 ? 's' : '');
    if (!rows.length) { ctbody.innerHTML = '<tr><td colspan="8" style="padding:20px;color:#888;text-align:center">No commitments yet.</td></tr>'; return; }
    ctbody.innerHTML = rows.map(function(c) {
      var dt = new Date(c.submitted_at);
      var dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      var products = [];
      try { products = JSON.parse(c.products || '[]'); } catch(e) {}
      commitmentData[c.id] = { c: c, products: products };
      var td = function(v, extra) { return '<td style="padding:9px 12px;border-bottom:1px solid #eee;vertical-align:top' + (extra || '') + '">' + (v || '<span style="color:#bbb">—</span>') + '</td>'; };
      var productNames = products.map(function(p){ return p.name || String(p); }).join('<br>');
      return '<tr class="c-row">' +
        td(dateStr, ';white-space:nowrap') +
        td('<strong>' + (c.quote_number || '') + '</strong>') +
        td((c.employer_name || '') + (c.address ? '<br><span style="color:#777;font-size:12px">' + c.address + (c.city_state_zip ? ', ' + c.city_state_zip : '') + '</span>' : '')) +
        td((c.auth_signer || '') + (c.auth_title ? '<br><span style="color:#777;font-size:12px">' + c.auth_title + '</span>' : '')) +
        td((c.auth_email ? '<a href="mailto:' + c.auth_email + '">'  + c.auth_email + '</a>' : '') + (c.auth_phone ? '<br>' + c.auth_phone : '')) +
        td(c.start_date || '') +
        td(productNames) +
        '<td style="padding:9px 12px;border-bottom:1px solid #eee;vertical-align:top">' +
          '<button class="dl-btn" data-cid="' + c.id + '" style="padding:5px 12px;background:#1a5c3a;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;white-space:nowrap">&#11091; Download</button>' +
        '</td>' +
        '</tr>';
    }).join('');
    commitmentsLoaded = true;
    ctbody.addEventListener('click', function(e) {
      var btn = e.target.closest('.dl-btn');
      if (btn) downloadCommitment(btn.dataset.cid);
    }, { once: true });
  } catch(err) {
    ctbody.innerHTML = '<tr><td colspan="8" style="padding:16px;color:#c00;text-align:center">Network error.</td></tr>';
  }
}

function downloadCommitment(id) {
  var entry = commitmentData[id];
  if (!entry) return;
  var c = entry.c;
  var products = entry.products;

  var productRows = products.map(function(p) {
    var feesHtml = '';
    if (Array.isArray(p.fees) && p.fees.length) {
      feesHtml = '<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:12px">' +
        p.fees.map(function(f) {
          return '<tr>' +
            '<td style="padding:4px 8px;color:#555;border-bottom:1px solid #f0f0f0">' + (f.label || '') + '</td>' +
            '<td style="padding:4px 8px;text-align:right;font-weight:600;border-bottom:1px solid #f0f0f0;white-space:nowrap">' + (f.value || '') + '</td>' +
            '<td style="padding:4px 8px;color:#888;border-bottom:1px solid #f0f0f0;white-space:nowrap">' + (f.cadence || '') + '</td>' +
            '</tr>';
        }).join('') + '</table>';
    }
    return '<div style="margin-bottom:14px;padding:12px 16px;border:1px solid #d8e8d8;border-radius:6px;background:#fafffe">' +
           '<strong style="font-size:14px;color:#1a5c3a">' + (p.name || '') + '</strong>' +
           feesHtml +
           '</div>';
  }).join('');

  var submittedDate = new Date(c.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<title>Commitment to Proceed - ' + (c.quote_number || '') + '</title>' +
    '<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap" rel="stylesheet">' +
    '<style>' +
    '*{box-sizing:border-box}' +
    'body{font-family:system-ui,Arial,sans-serif;max-width:820px;margin:40px auto;padding:0 32px;color:#222;font-size:14px}' +
    'h1{margin:0;color:#1a5c3a;font-size:22px}' +
    '.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:18px;border-bottom:2px solid #1a5c3a;margin-bottom:28px}' +
    '.header-right{text-align:right;font-size:13px;color:#555;line-height:1.8}' +
    '.section{margin-bottom:24px}' +
    '.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;margin:0 0 10px;padding-bottom:4px;border-bottom:1px solid #eee}' +
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 28px}' +
    '.field{margin-bottom:10px}' +
    '.field .lbl{font-size:11px;color:#999;margin-bottom:2px}' +
    '.field .val{font-size:14px;color:#222}' +
    '.sig-name{font-family:"Dancing Script",cursive;font-size:26px;color:#1a5c3a;border-bottom:2px solid #1a5c3a;padding-bottom:4px;display:inline-block;min-width:220px}' +
    '.print-btn{margin-top:28px;padding:10px 26px;background:#1a5c3a;color:white;border:none;border-radius:6px;font-size:14px;cursor:pointer;font-weight:600}' +
    '@media print{.print-btn{display:none}body{margin:20px;padding:0 20px}}' +
    '</style></head><body>' +
    '<div class="header">' +
      '<div>' +
        '<h1>ABY Benefits LLC</h1>' +
        '<div style="color:#666;font-size:13px;margin-top:4px">Commitment to Proceed</div>' +
      '</div>' +
      '<div class="header-right">' +
        '<div><strong>Quote #:</strong> ' + (c.quote_number || '') + '</div>' +
        '<div><strong>Submitted:</strong> ' + submittedDate + '</div>' +
        '<div><strong>Requested Start:</strong> ' + (c.start_date || '') + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="section">' +
      '<div class="section-title">Employer Information</div>' +
      '<div class="grid">' +
        '<div class="field"><div class="lbl">Company Name</div><div class="val">' + (c.employer_name || '') + '</div></div>' +
        '<div class="field"><div class="lbl">Address</div><div class="val">' + (c.address || '') + (c.city_state_zip ? '<br>' + c.city_state_zip : '') + '</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="section">' +
      '<div class="section-title">Authorized Signer</div>' +
      '<div class="grid">' +
        '<div class="field"><div class="lbl">Name</div><div class="val">' + (c.auth_signer || '') + '</div></div>' +
        '<div class="field"><div class="lbl">Title</div><div class="val">' + (c.auth_title || '') + '</div></div>' +
        '<div class="field"><div class="lbl">Email</div><div class="val">' + (c.auth_email || '') + '</div></div>' +
        '<div class="field"><div class="lbl">Phone</div><div class="val">' + (c.auth_phone || '') + '</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="section">' +
      '<div class="section-title">HR / Benefits Contact</div>' +
      '<div class="grid">' +
        '<div class="field"><div class="lbl">Name</div><div class="val">' + (c.hr_contact || '') + '</div></div>' +
        '<div class="field"><div class="lbl">Title</div><div class="val">' + (c.hr_title || '') + '</div></div>' +
        '<div class="field"><div class="lbl">Email</div><div class="val">' + (c.hr_email || '') + '</div></div>' +
        '<div class="field"><div class="lbl">Phone</div><div class="val">' + (c.hr_phone || '') + '</div></div>' +
      '</div>' +
    '</div>' +
    '<div class="section">' +
      '<div class="section-title">Products &amp; Pricing Agreed To</div>' +
      productRows +
    '</div>' +
    '<div class="section" style="margin-top:32px;padding-top:20px;border-top:2px solid #eee">' +
      '<div class="section-title">Electronic Signature</div>' +
      '<div class="field"><div class="lbl">Printed Name</div><div class="val">' + (c.accepted_print || '') + '</div></div>' +
      '<div class="field" style="margin-top:12px"><div class="lbl">Electronic Signature</div>' +
        '<div class="sig-name">' + (c.accepted_sign || '') + '</div>' +
      '</div>' +
    '</div>' +
    '<button class="print-btn" onclick="window.print()">Print / Save as PDF</button>' +
    '</body></html>';

  var blob = new Blob([html], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'Commitment-' + (c.quote_number || 'unknown') + '.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>
</body>
</html>`;
}

// ─── Login page HTML ───────────────────────────────────────────────────────────

function loginHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ABY Admin — Login</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
     min-height:100vh;margin:0;background:#f0f4f0}
.card{background:white;padding:2.5rem;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,.12);width:340px}
h1{margin:0 0 .25rem;font-size:1.25rem;color:#1a5c3a}
.sub{color:#888;font-size:.875rem;margin:.25rem 0 1.5rem}
input[type=password]{width:100%;padding:.625rem .75rem;border:1px solid #ddd;border-radius:6px;
                      font-size:1rem;margin-bottom:.75rem;display:block}
input[type=password]:focus{outline:none;border-color:#1a5c3a;box-shadow:0 0 0 3px rgba(26,92,58,.15)}
button{width:100%;padding:.65rem;background:#1a5c3a;color:white;border:none;border-radius:6px;
       font-size:1rem;cursor:pointer;font-weight:600}
button:hover{background:#164d30}
button:disabled{opacity:.6;cursor:default}
.err{color:#c0392b;font-size:.85rem;margin-bottom:.5rem;display:none}
</style>
</head>
<body>
<div class="card">
  <h1>ABY Quote Admin</h1>
  <p class="sub">Internal access only</p>
  <p class="err" id="err">Incorrect password.</p>
  <input type="password" id="pw" placeholder="Enter password" autofocus>
  <button id="btn" onclick="login()">Log in</button>
</div>
<script>
async function login(){
  const pw=document.getElementById('pw').value;
  const btn=document.getElementById('btn');
  btn.disabled=true; btn.textContent='Checking…';
  const res=await fetch('/api/admin/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({password:pw})
  });
  if(res.ok){location.reload();}
  else{
    document.getElementById('err').style.display='block';
    btn.disabled=false; btn.textContent='Log in';
  }
}
document.getElementById('pw').addEventListener('keydown',e=>{if(e.key==='Enter')login();});
</script>
</body>
</html>`;
}
