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
    if (/^\/api\/quotes\/[^/]+\/status$/.test(path) && method === 'PATCH') {
      return withAuth(request, env, () => handleUpdateStatus(path.split('/')[3], request, env));
    }
    if (/^\/api\/quotes\/[^/]+$/.test(path) && method === 'GET') {
      return withAuth(request, env, () => handleGetQuote(path.split('/').pop(), env));
    }
    if (path === '/api/admin/login'  && method === 'POST') return handleLogin(request, env);
    if (path === '/api/admin/logout')                      return handleLogout();

    // ── Admin page ──────────────────────────────────────────────────────────────
    if (path === '/admin' || path === '/admin/') {
      return withAuth(request, env, () =>
        new Response(adminHTML(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      );
    }
    if (path === '/admin.html') {
      return Response.redirect(new URL('/admin', request.url).toString(), 302);
    }

    // ── Diagnostics (temporary) ─────────────────────────────────────────────────
    if (path === '/api/debug') {
      return jsonResp({
        hasResendKey:      !!env.RESEND_API_KEY,
        resendKeyPrefix:   env.RESEND_API_KEY ? env.RESEND_API_KEY.slice(0, 6) : 'MISSING',
        hasAdminPassword:  !!env.ADMIN_PASSWORD,
        hasFromEmail:      !!env.FROM_EMAIL,
        fromEmail:         env.FROM_EMAIL || 'MISSING',
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

  // First attempt: query with status column (works once column exists)
  try {
    let result;
    if (q) {
      const like = `%${q}%`;
      result = await env.DB.prepare(`
        SELECT id, quote_number, created_at, client_name, effective_date,
               broker_name, broker_agency, broker_phone, broker_email,
               rep_name, commission_included, products,
               COALESCE(status, 'pending') AS status
        FROM quotes
        WHERE (status IS NULL OR status != 'trashed')
          AND (client_name LIKE ? OR broker_name LIKE ? OR broker_agency LIKE ?
               OR quote_number LIKE ? OR rep_name LIKE ?)
        ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).bind(like, like, like, like, like, limit, offset).all();
    } else {
      result = await env.DB.prepare(`
        SELECT id, quote_number, created_at, client_name, effective_date,
               broker_name, broker_agency, broker_phone, broker_email,
               rep_name, commission_included, products,
               COALESCE(status, 'pending') AS status
        FROM quotes
        WHERE (status IS NULL OR status != 'trashed')
        ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).bind(limit, offset).all();
    }
    return jsonResp({ quotes: result.results || [] });
  } catch (_) {}

  // Second attempt: column doesn't exist yet — add it, then retry
  try {
    await env.DB.prepare(`ALTER TABLE quotes ADD COLUMN status TEXT DEFAULT 'pending'`).run();
  } catch (_) {}

  try {
    let result;
    if (q) {
      const like = `%${q}%`;
      result = await env.DB.prepare(`
        SELECT id, quote_number, created_at, client_name, effective_date,
               broker_name, broker_agency, broker_phone, broker_email,
               rep_name, commission_included, products,
               COALESCE(status, 'pending') AS status
        FROM quotes
        WHERE (status IS NULL OR status != 'trashed')
          AND (client_name LIKE ? OR broker_name LIKE ? OR broker_agency LIKE ?
               OR quote_number LIKE ? OR rep_name LIKE ?)
        ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).bind(like, like, like, like, like, limit, offset).all();
    } else {
      result = await env.DB.prepare(`
        SELECT id, quote_number, created_at, client_name, effective_date,
               broker_name, broker_agency, broker_phone, broker_email,
               rep_name, commission_included, products,
               COALESCE(status, 'pending') AS status
        FROM quotes
        WHERE (status IS NULL OR status != 'trashed')
        ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).bind(limit, offset).all();
    }
    return jsonResp({ quotes: result.results || [] });
  } catch (_) {}

  // Last resort: query without status column at all
  try {
    let result;
    if (q) {
      const like = `%${q}%`;
      result = await env.DB.prepare(`
        SELECT id, quote_number, created_at, client_name, effective_date,
               broker_name, broker_agency, broker_phone, broker_email,
               rep_name, commission_included, products
        FROM quotes
        WHERE client_name LIKE ? OR broker_name LIKE ? OR broker_agency LIKE ?
              OR quote_number LIKE ? OR rep_name LIKE ?
        ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).bind(like, like, like, like, like, limit, offset).all();
    } else {
      result = await env.DB.prepare(`
        SELECT id, quote_number, created_at, client_name, effective_date,
               broker_name, broker_agency, broker_phone, broker_email,
               rep_name, commission_included, products
        FROM quotes ORDER BY created_at DESC LIMIT ? OFFSET ?
      `).bind(limit, offset).all();
    }
    const rows = (result.results || []).map(r => ({ ...r, status: 'pending' }));
    return jsonResp({ quotes: rows });
  } catch (err) {
    return jsonResp({ error: String(err) }, 500);
  }
}

// ─── Quote: get single (admin) ─────────────────────────────────────────────────

async function handleGetQuote(id, env) {
  const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
  if (!row) return jsonResp({ error: 'Not found' }, 404);
  return jsonResp(row);
}

// ─── Quote: update status (admin) ─────────────────────────────────────────────

async function handleUpdateStatus(id, request, env) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResp({ error: 'Invalid JSON' }, 400); }

  const { status } = body;
  const allowed = ['pending', 'sold', 'dead', 'trashed'];
  if (!allowed.includes(status)) return jsonResp({ error: 'Invalid status' }, 400);

  try {
    await env.DB.prepare(`UPDATE quotes SET status = ? WHERE id = ?`).bind(status, id).run();
  } catch (err) {
    console.error('Status update failed:', err);
    return jsonResp({ error: 'Failed to update status' }, 500);
  }

  return jsonResp({ ok: true, id, status });
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

  return new Response(loginHTML(), {
    status: 401,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
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
.loading{text-align:center;padding:60px;color:#aaa}
/* Status badges */
.status-badge{display:inline-block;padding:2px 9px;border-radius:99px;font-size:.72rem;font-weight:700;letter-spacing:.03em;white-space:nowrap}
.s-pending{background:#f0f0f0;color:#666}
.s-sold{background:#e8f5ee;color:#1a6640}
.s-dead{background:#fde8e8;color:#b03030}
/* Status change buttons in detail view */
.status-controls{display:flex;flex-wrap:wrap;gap:6px;margin-top:.85rem}
.status-controls label{font-size:.72rem;font-weight:700;color:#888;text-transform:uppercase;
                        letter-spacing:.05em;display:block;margin-bottom:5px;width:100%}
.status-btn{padding:4px 14px;border-radius:6px;border:1px solid;font-size:.82rem;font-weight:600;
            cursor:pointer;background:white;transition:opacity .1s}
.status-btn:hover{opacity:.75}
.status-btn.pending{color:#666;border-color:#ccc}
.status-btn.sold{color:#1a6640;border-color:#b8d9c4}
.status-btn.dead{color:#b03030;border-color:#f5b8b8}
.status-btn.trash{color:#b03030;border-color:#f5b8b8;background:#fff5f5}
.status-btn.active{outline:2px solid currentColor;outline-offset:2px}
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
<main>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Date / Time</th><th>Quote #</th><th>Client</th>
          <th>Broker / Agency</th><th>Rep</th><th>Products</th><th>Status</th><th>Comm</th>
        </tr>
      </thead>
      <tbody id="tbody">
        <tr><td colspan="8" class="loading">Loading quotes…</td></tr>
      </tbody>
    </table>
  </div>
</main>
<script>
let quotes = [];
let expandedId = null;

const STATUS_LABEL = { pending: 'Pending', sold: 'Sold', dead: 'Dead' };
const STATUS_CLASS = { pending: 's-pending', sold: 's-sold', dead: 's-dead' };

async function load(q) {
  q = q || '';
  const url = '/api/quotes' + (q ? ('?q=' + encodeURIComponent(q)) : '');
  try {
    const res = await fetch(url);
    if (res.status === 401) { location.href = '/admin'; return; }
    if (!res.ok) {
      document.getElementById('tbody').innerHTML =
        '<tr><td colspan="8" class="loading" style="color:#c0392b">HTTP ' + res.status + ' — refresh to try again.</td></tr>';
      return;
    }
    const data = await res.json();
    quotes = data.quotes || [];
    render();
  } catch (e) {
    document.getElementById('tbody').innerHTML =
      '<tr><td colspan="8" class="loading" style="color:#c0392b">Failed to load quotes (' + e.message + ').</td></tr>';
  }
}

function render() {
  const tbody = document.getElementById('tbody');
  document.getElementById('count').textContent =
    quotes.length ? (quotes.length + ' quote' + (quotes.length !== 1 ? 's' : '')) : '';
  if (!quotes.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No quotes found.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  for (const q of quotes) {
    const isC      = !(q.quote_number || '').endsWith('-NC');
    const products = parseProducts(q.products);
    const dt       = new Date(q.created_at);
    const dateStr  = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr  = dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const isExp    = expandedId === q.id;
    const st       = q.status || 'pending';

    const row = document.createElement('tr');
    row.className = 'data-row' + (isExp ? ' expanded' : '');
    row.dataset.id = q.id;

    const brokerCell = (q.broker_name ? esc(q.broker_name) : '<span class="muted">—</span>') +
      (q.broker_agency ? '<br><span style="font-size:.8rem;color:#888">' + esc(q.broker_agency) + '</span>' : '');

    const chipHtml = products.slice(0,3).map(function(p){
      return '<span class="chip" style="white-space:nowrap">' + esc(p) + '</span>';
    }).join('') + (products.length > 3 ? '<span style="color:#888;font-size:.78rem;white-space:nowrap">+' + (products.length-3) + ' more</span>' : '');

    const statusBadge = '<span class="status-badge ' + (STATUS_CLASS[st] || 's-pending') + '">' + (STATUS_LABEL[st] || st) + '</span>';

    row.innerHTML =
      '<td><div class="date-main">' + dateStr + '</div><div class="date-time">' + timeStr + '</div></td>' +
      '<td class="qnum">' + esc(q.quote_number) + '</td>' +
      '<td>' + (esc(q.client_name) || '<span class="muted">—</span>') + '</td>' +
      '<td>' + brokerCell + '</td>' +
      '<td>' + (esc(q.rep_name) || '<span class="muted">—</span>') + '</td>' +
      '<td><div style="display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start">' + chipHtml + '</div></td>' +
      '<td>' + statusBadge + '</td>' +
      '<td><span class="badge ' + (isC ? 'badge-c' : 'badge-nc') + '">' + (isC ? 'C' : 'NC') + '</span></td>';

    row.addEventListener('click', function(){ toggleDetail(q.id); });
    tbody.appendChild(row);

    if (isExp) {
      const dr = document.createElement('tr');
      dr.className = 'detail-row';
      dr.innerHTML = '<td colspan="8">' + detailHTML(q, products) + '</td>';
      tbody.appendChild(dr);
    }
  }
}

function toggleDetail(id) {
  expandedId = (expandedId === id) ? null : id;
  render();
}

function detailHTML(q, products) {
  const st = q.status || 'pending';
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
  return '<div class="detail-inner">' +
    '<div class="detail-grid">' +
      '<div class="detail-item"><label>Effective Date</label><span>' + (esc(q.effective_date) || '—') + '</span></div>' +
      '<div class="detail-item"><label>Broker Phone</label><span>' + (esc(q.broker_phone) || '—') + '</span></div>' +
      '<div class="detail-item"><label>Broker Email</label><span>' + (esc(q.broker_email) || '—') + '</span></div>' +
    '</div>' +
    '<div class="status-controls">' +
      '<label>Update Status</label>' +
      '<button class="status-btn pending' + (st==='pending'?' active':'') + '" onclick="updateStatus(\'' + q.id + '\',\'pending\',event)">Pending</button>' +
      '<button class="status-btn sold' + (st==='sold'?' active':'') + '" onclick="updateStatus(\'' + q.id + '\',\'sold\',event)">Sold</button>' +
      '<button class="status-btn dead' + (st==='dead'?' active':'') + '" onclick="updateStatus(\'' + q.id + '\',\'dead\',event)">Dead</button>' +
      '<button class="status-btn trash" onclick="updateStatus(\'' + q.id + '\',\'trashed\',event)">🗑 Trash</button>' +
    '</div>' +
    '<div style="margin-top:.85rem">' +
      '<a href="' + rerunUrl + '" target="_blank" style="display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;background:#e8f4ec;color:#1a5c3a;border-radius:6px;text-decoration:none;font-size:.85rem;font-weight:600;border:1px solid #b8d9c4">Re-run Quote ↗</a>' +
    '</div>' +
    '</div>';
}

async function updateStatus(id, status, e) {
  if (e) e.stopPropagation();
  if (status === 'trashed' && !confirm('Remove this quote from the list? This cannot be undone.')) return;
  try {
    const res = await fetch('/api/quotes/' + id + '/status', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.status === 401) { location.href = '/admin'; return; }
    if (!res.ok) { alert('Failed to update status'); return; }
    const q = quotes.find(function(x) { return x.id === id; });
    if (q) {
      if (status === 'trashed') {
        quotes = quotes.filter(function(x) { return x.id !== id; });
        if (expandedId === id) expandedId = null;
      } else {
        q.status = status;
      }
      render();
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
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

let searchTimer;
document.getElementById('search').addEventListener('input', function(e) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function() {
    expandedId = null;
    load(e.target.value.trim());
  }, 300);
});

load();
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
