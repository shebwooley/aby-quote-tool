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

// TEMPORARY SITE LOCK. While true, the whole public tool (and its assets) requires
// the same aby_admin login as /admin. The standalone /july-2026 page stays open so
// it can be shared with brokers. Flip to false (and redeploy) to reopen the tool.
const SITE_LOCKED = true;

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
    if (/^\/api\/commitments\/[^/]+$/.test(path) && method === 'DELETE') {
      return withAuth(request, env, () => handleDeleteCommitment(path.split('/').pop(), env));
    }
    if (path === '/api/admin/login'  && method === 'POST') return handleLogin(request, env);
    if (path === '/api/admin/logout')                      return handleLogout();

    // ── Per-broker identity and the broker dashboard (F-6) ─────────────────────
    // ⚠️ SERVER-TO-SERVER, NOT A BROWSER ROUTE. The BenefitLab dashboard calls this with a
    // bearer token and an email it has already verified through Supabase, so no ABY account
    // is needed for that path at all -- a broker signs into BenefitLab and their ABY quotes
    // are simply there. The client half has existed in `benefitlab-dashboard` since 08-06;
    // THIS END WAS NEVER BUILT, which is why the connector has been dormant.
    if (path === '/api/broker-quotes' && method === 'GET') return handleBrokerQuotesIntegration(request, env);
    // The broker's own signed-in view of the same data.
    if (path === '/api/my/quotes' && method === 'GET') {
      return withBroker(request, env, (s) => handleMyQuotes(env, s));
    }
    if (path === '/api/my/whoami' && method === 'GET') {
      return withBroker(request, env, (s) => jsonResp({ email: s.email, role: s.role }));
    }
    if (path === '/api/my/password' && method === 'POST') return handleSetPassword(request, env);
    // ABY-only broker administration.
    if (path === '/api/brokers' && method === 'GET')  return withAuth(request, env, () => handleListBrokers(env));
    if (path === '/api/brokers' && method === 'POST') return withAuth(request, env, () => handleUpsertBroker(request, env));

    // ── Broker-facing pages ────────────────────────────────────────────────────
    // ⚠️ The dashboard is served THROUGH `withBroker`, so an unauthenticated visitor gets the
    // sign-in page from the same URL rather than a redirect somewhere else. One address to
    // give a broker, whether or not they happen to be signed in when they open it.
    if (path === '/dashboard' || path === '/dashboard/') {
      return withBroker(request, env, () => new Response(brokerDashboardHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      }));
    }
    // ⛔ DELIBERATELY UNGATED, and it has to be: this is where somebody who has no password
    // yet goes to make one. The SIGNED TOKEN IN THE URL is the authorisation.
    if (path === '/set-password') {
      const em = normEmail(url.searchParams.get('email'));
      const t  = url.searchParams.get('t') || '';
      // ⚠️ VERIFIED BEFORE THE PAGE RENDERS, so a bad link says so plainly rather than showing
      // a form that can only fail after somebody has chosen a password and typed it twice.
      if (!em || !t || !(await verifySetupToken(env, em, t))) {
        return new Response(
          '<!DOCTYPE html><meta charset="utf-8"><title>Link expired</title>' +
          '<body style="font-family:system-ui;max-width:34rem;margin:4rem auto;padding:0 1rem">' +
          '<h1 style="font-size:1.2rem">That setup link is not valid</h1>' +
          '<p>Setup links expire after ' + SETUP_HOURS + ' hours, and stop working once a password ' +
          'has been set. Ask ABY for a new one.</p></body>',
          { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
        );
      }
      return new Response(setPasswordHTML(em, t), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }

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

    // ── ABY internal door (server-gated; brokers cannot reach it) ───────────────
    if (path === '/aby' || path === '/aby/') {
      return withAuth(request, env, () => serveAbyTool(request, env));
    }
    // Internal overlay JS is served ONLY to a valid ABY session, never as a static
    // asset, so the public bundle never contains the override / state code.
    if (path === '/internal/aby.js') {
      return withAuth(request, env, () => new Response(abyInternalJS(), {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
      }));
    }
    // One-time (idempotent) D1 migration to add the attribution columns.
    if (path === '/api/migrate') {
      return withAuth(request, env, () => handleMigrate(env));
    }

    // ── Diagnostics ─────────────────────────────────────────────────────────────
    // REMOVED 2026-08-04, on Eric's decision of 2026-07-23: `/api/debug` and
    // `/api/test-email` were both PUBLIC, with no auth in front of either.
    //
    // `/api/debug` returned the first 6 characters of the Resend API key, the
    // from-address, whether an admin password was set, the D1 connection state and
    // a live quote count — reconnaissance, served to anyone who knew the path.
    // `/api/test-email` sent a real message through Resend on every GET. Its `to:`
    // was hardcoded, so it could not be used to spam third parties, but it burned
    // Resend quota and filled one inbox on demand.
    //
    // Neither was reachable from the UI; both were development conveniences that
    // outlived their purpose and stayed public for a year of commits.
    //
    // If diagnostics are ever wanted again, wrap them in `withAuth` the way
    // `/api/quotes-ping` and `/api/migrate` already are (a few lines above) —
    // do not reintroduce an unauthenticated variant.

    // ── Temporary site lock ─────────────────────────────────────────────────────
    // Everything that reaches here (the tool at '/', its JS/CSS/images) is gated
    // behind the admin login while SITE_LOCKED is true, except the open pages below.
    if (SITE_LOCKED && !isOpenPath(path)) {
      if (!(await isAuthed(request, env))) {
        return new Response(loginHTML(), {
          status: 401,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
        });
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
    clientId           = '',
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
    state              = 'TX',
    adjustment         = null,
    adjustmentNote     = '',
  } = body;

  // Attribution is decided on the SERVER from the session cookie, so a broker
  // cannot spoof it: a valid aby_admin session => 'ABY', otherwise 'broker'.
  const ranBy = (await isAuthed(request, env)) ? 'ABY' : 'broker';
  // Brokers are TX-locked on the server: only an ABY session may set a non-TX state.
  const stateCode = (ranBy === 'ABY') ? String(state || 'TX').toUpperCase().slice(0, 8) : 'TX';
  // The override is ABY-only; ignore anything a non-ABY caller tries to attach.
  const adjustmentJson = (ranBy === 'ABY' && adjustment) ? JSON.stringify(adjustment) : null;
  const adjustmentNoteVal = (ranBy === 'ABY') ? String(adjustmentNote || '') : '';

  const productsJson = JSON.stringify(products);

  // ── Save: insert, revise, or do nothing (F-339) ──────────────────────────────────────
  //
  // This used to be a bare INSERT, so re-opening a saved quote added a ROW and re-sent the
  // notification email. Eric's decision, 2026-08-06, is three cases and they are handled here:
  //   re-opened, nothing changed  -> same number, NO new record, no email
  //   something changed           -> same number, revision + 1, notify
  //   a deliberately new quote    -> a new number arrives, so this is an INSERT
  //
  // ⚠️ WRITTEN AS SELECT-THEN-BRANCH, NOT `ON CONFLICT ... DO UPDATE ... RETURNING`, ON PURPOSE.
  // The elegant upsert needs two D1 behaviours (ON CONFLICT and RETURNING) that CANNOT be
  // exercised without deploying, and the failure mode if either is unsupported is the worst one
  // available here: `save-hook.js` swallows errors by design, so every save would fail SILENTLY
  // and brokers would go on quoting into nothing. Plain SELECT / UPDATE / INSERT are already used
  // elsewhere in this file, so they are known to work. Predictability beats elegance in code that
  // ships untested.
  let existing = null;
  try {
    existing = await env.DB.prepare(
      'SELECT id, revision, client_name, effective_date, commission_included, products, state, adjustment FROM quotes WHERE quote_number = ?'
    ).bind(quoteNumber).first();
  } catch (err) {
    // A pre-migration database has no `revision` column. Treat that as "not found" rather than
    // failing the save: an unsaved quote is worse than an un-revised one.
    console.error('DB lookup failed (continuing as insert):', err);
  }

  let rowId = id;
  let isNew = true;
  let unchanged = false;

  if (existing) {
    rowId = existing.id;
    isNew = false;
    // Did anything a reader would care about actually move? If not this is a re-open, and a
    // re-open must leave no trace at all -- that is the whole point of the fix.
    unchanged =
      String(existing.client_name || '') === String(clientName || '') &&
      String(existing.effective_date || '') === String(effectiveDate || '') &&
      Number(existing.commission_included) === (commissionIncluded ? 1 : 0) &&
      String(existing.products || '') === productsJson &&
      String(existing.state || 'TX') === stateCode &&
      String(existing.adjustment || '') === String(adjustmentJson || '');
  }

  if (!existing) {
    try {
      await env.DB.prepare(`
        INSERT INTO quotes
          (id, quote_number, created_at, client_name, effective_date,
           broker_name, broker_agency, broker_phone, broker_email,
           rep_name, rep_phone, rep_email, commission_included, products,
           ran_by, state, adjustment, adjustment_note, client_id, revision)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
      `).bind(
        id, quoteNumber, now, clientName, effectiveDate,
        brokerName, brokerAgency, brokerPhone, brokerEmail,
        repName, repPhone, repEmail,
        commissionIncluded ? 1 : 0,
        productsJson,
        ranBy, stateCode, adjustmentJson, adjustmentNoteVal,
        String(clientId || '')
      ).run();
    } catch (err) {
      console.error('DB insert failed:', err);
      return jsonResp({ error: 'Failed to save quote' }, 500);
    }
  } else if (!unchanged) {
    try {
      // `id`, `quote_number` and `created_at` are deliberately NOT updated. The number keeps its
      // ORIGINAL creation date because that date is embedded in it -- a moving date is a moving
      // number, which is the bug (Eric raised this himself).
      await env.DB.prepare(`
        UPDATE quotes SET
          client_name = ?, effective_date = ?,
          broker_name = ?, broker_agency = ?, broker_phone = ?, broker_email = ?,
          rep_name = ?, rep_phone = ?, rep_email = ?, commission_included = ?, products = ?,
          ran_by = ?, state = ?, adjustment = ?, adjustment_note = ?,
          client_id = CASE WHEN ? <> '' THEN ? ELSE client_id END,
          revision = COALESCE(revision, 1) + 1
        WHERE quote_number = ?
      `).bind(
        clientName, effectiveDate,
        brokerName, brokerAgency, brokerPhone, brokerEmail,
        repName, repPhone, repEmail,
        commissionIncluded ? 1 : 0,
        productsJson,
        ranBy, stateCode, adjustmentJson, adjustmentNoteVal,
        String(clientId || ''), String(clientId || ''),
        quoteNumber
      ).run();
    } catch (err) {
      console.error('DB update failed:', err);
      return jsonResp({ error: 'Failed to save quote' }, 500);
    }
  }

  // Notify on a NEW quote or a real revision -- never on a re-open, which is the duplicate
  // notification this fix removes.
  if (isNew || !unchanged) {
    const origin = new URL(request.url).origin;
    try {
      await sendEmail(env, { id: rowId, quoteNumber, clientName, effectiveDate, brokerName, brokerAgency, repName, repEmail, commissionIncluded, products, origin });
    } catch (err) {
      console.error('Email send failed:', err.message);
    }
  }

  return jsonResp({ id: rowId, quoteNumber, revision: existing ? (Number(existing.revision || 1) + (unchanged ? 0 : 1)) : 1, unchanged });
}

// ─── Quote: list (admin) ───────────────────────────────────────────────────────

async function handleListQuotes(request, env) {
  const url    = new URL(request.url);
  const q      = (url.searchParams.get('q') || '').trim();
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '300'), 500);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const ranByFilter = (url.searchParams.get('ran_by') || '').trim();   // '', 'ABY', or 'broker'
  const stateFilter  = (url.searchParams.get('state')  || '').trim().toUpperCase();
  const cols = "id, quote_number, created_at, client_name, effective_date, broker_name, broker_agency, broker_phone, broker_email, rep_name, rep_phone, rep_email, commission_included, products, COALESCE(status, 'P') AS status, COALESCE(ran_by, 'broker') AS ran_by, COALESCE(state, 'TX') AS state, adjustment, adjustment_note, client_id";

  try {
    const where = [];
    const args = [];
    if (q) {
      const like = `%${q}%`;
      where.push('(client_name LIKE ? OR broker_name LIKE ? OR broker_agency LIKE ? OR quote_number LIKE ? OR rep_name LIKE ?)');
      args.push(like, like, like, like, like);
    }
    if (ranByFilter === 'ABY' || ranByFilter === 'broker') {
      where.push("COALESCE(ran_by, 'broker') = ?");
      args.push(ranByFilter);
    }
    if (stateFilter) {
      where.push("COALESCE(state, 'TX') = ?");
      args.push(stateFilter);
    }
    const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
    const result = await env.DB.prepare(
      `SELECT ${cols} FROM quotes ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(...args, limit, offset).all();
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
    // Added 2026-08-06 (F-345). `commitments` stored NO broker at all -- its only link to one
    // was `quote_number`, which is not unique until the F-339 migration lands. So "who is the
    // broker on this signed authorization?" could only be answered through a key that could
    // collide, and the admin list simply did not show it. These arrive as hidden fields on
    // the authorization form the employer signs.
    clientId       = '',
    brokerEmail    = '',
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
         start_date, accepted_print, accepted_sign, products,
         client_id, broker_email)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      id, quoteNumber, now, employerName, address, cityStateZip,
      authSigner, authTitle, authEmail, authPhone,
      hrContact, hrTitle, hrEmail, hrPhone,
      startDate, acceptedPrint, acceptedSign,
      JSON.stringify(products),
      String(clientId || ''), String(brokerEmail || '')
    ).run();
  } catch (err) {
    console.error('Commitment insert failed:', err);
    return jsonResp({ error: 'Failed to save commitment' }, 500);
  }

  return jsonResp({ id, quoteNumber, submitted_at: now });
}

async function handleListCommitments(request, env) {
  // ⭐ The broker comes from the commitment's OWN columns first, and only falls back to the
  // quote it came from. Eric, 2026-08-06: "we don't know who the broker is without opening
  // the quote up." That was true, and the cause was not a missing COLUMN in the table -- it
  // was a missing column in the DATA: `commitments` recorded no broker at all.
  //
  // ⚠️ THE FALLBACK JOIN IS FOR HISTORY ONLY. Rows signed before the migration have no
  // `broker_email`, so their broker can only be recovered through `quote_number` -- the
  // non-unique key F-339 fixes. New rows carry their own answer and do not depend on it.
  // 🔴 LEFT JOIN, never an inner one: a commitment whose quote was deleted must still appear.
  // Losing the broker's name is a gap; losing an employer's signed authorization is a defect.
  const withJoin =
    'SELECT c.*, ' +
    "       COALESCE(NULLIF(c.broker_email,''), q.broker_email) AS broker_email_resolved, " +
    '       q.broker_name  AS quote_broker_name, ' +
    '       q.broker_agency AS quote_broker_agency ' +
    '  FROM commitments c ' +
    '  LEFT JOIN quotes q ON q.quote_number = c.quote_number ' +
    ' ORDER BY c.submitted_at DESC LIMIT 200';

  try {
    const result = await env.DB.prepare(withJoin).all();
    return jsonResp({ commitments: result.results || [] });
  } catch (err) {
    // A pre-migration database has no `commitments.client_id` / `broker_email`, so the query
    // above throws. Fall back to the plain list rather than failing the screen: an admin who
    // cannot see their commitments is worse off than one who cannot see the broker column.
    console.error('Commitment list with broker join failed (falling back):', err);
    try {
      const plain = await env.DB.prepare(
        'SELECT * FROM commitments ORDER BY submitted_at DESC LIMIT 200'
      ).all();
      return jsonResp({ commitments: plain.results || [] });
    } catch (err2) {
      return jsonResp({ error: String(err2) }, 500);
    }
  }
}

async function handleDeleteCommitment(id, env) {
  try {
    await env.DB.prepare('DELETE FROM commitments WHERE id = ?').bind(id).run();
    return jsonResp({ ok: true });
  } catch (err) {
    console.error('handleDeleteCommitment failed:', err);
    return jsonResp({ error: String(err) }, 500);
  }
}

/**
 * Sign in. TWO doors, and both had to stay open (F-6).
 *
 * ① ADMIN_PASSWORD with no email -- ABY's existing staff door. Unchanged for Eric, who signs
 *    in this way today; it now additionally issues a SESSION saying role=aby.
 * ② email + password -- a broker with their own account.
 *
 * ⚠️ THE ERROR MESSAGE IS DELIBERATELY THE SAME FOR "no such broker", "wrong password" and
 * "disabled". Distinguishing them tells anybody who asks which email addresses have accounts
 * here, which is a list of ABY's brokers.
 * ⚠️ AND A DISABLED BROKER IS REFUSED BEFORE THE PASSWORD IS EVEN CHECKED -- revoking access
 * is the point of this table, and a revoked person must not be able to learn that their
 * password was still right.
 */
async function handleLogin(request, env) {
  let pw, email;
  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const b = await request.json().catch(() => ({}));
    pw = b.password; email = b.email;
  } else {
    const fd = await request.formData().catch(() => null);
    pw = fd?.get('password'); email = fd?.get('email');
  }

  const who = normEmail(email);

  // ① The ABY staff door.
  if (!who) {
    if (!pw || pw !== env.ADMIN_PASSWORD) return jsonResp({ error: 'Unauthorized' }, 401);
    const legacy = await makeToken(env.ADMIN_PASSWORD);
    const session = await makeSession(env, { email: 'aby@abybenefits.com', role: 'aby' });
    // ⚠️ BOTH COOKIES. The legacy one keeps every existing `withAuth` route and the internal
    // overlay working exactly as before; the session is what carries identity from here on.
    // Removing the legacy cookie in the same change would have made one deploy responsible for
    // both a new auth model AND every screen that reads the old one.
    const h = new Headers({ 'Content-Type': 'application/json' });
    h.append('Set-Cookie', `${COOKIE_NAME}=${legacy}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=86400`);
    h.append('Set-Cookie', sessionCookie(session));
    return new Response(JSON.stringify({ ok: true, role: 'aby' }), { headers: h });
  }

  // ② A broker signing in with their own account.
  const row = await getBroker(env, who);
  const bad = () => jsonResp({ error: 'That email and password do not match an account.' }, 401);
  if (!row || row.status !== 'active') return bad();
  if (!pw || !(await verifyPassword(pw, row))) return bad();

  // Raise an old row to the current cost, now that the plaintext is in hand and correct.
  if (row.pw_iter !== PBKDF2_ITER) {
    const fresh = await hashPassword(pw);
    await env.DB.prepare('UPDATE brokers SET pw_hash=?, pw_salt=?, pw_iter=? WHERE email=?')
      .bind(fresh.hash, fresh.salt, fresh.iter, who).run().catch(() => {});
  }
  await env.DB.prepare('UPDATE brokers SET last_seen_at=? WHERE email=?')
    .bind(new Date().toISOString(), who).run().catch(() => {});

  const session = await makeSession(env, { email: who, role: row.role === 'aby' ? 'aby' : 'broker' });
  const h = new Headers({ 'Content-Type': 'application/json' });
  h.append('Set-Cookie', sessionCookie(session));
  // ⛔ AN ABY-ROLE BROKER DOES NOT GET THE LEGACY COOKIE. That cookie is password-equivalent
  // and is not theirs to hold; staff powers for them come from the session's role instead.
  return new Response(JSON.stringify({ ok: true, role: row.role === 'aby' ? 'aby' : 'broker' }), { headers: h });
}

function handleLogout() {
  // ⚠️ BOTH COOKIES, ALWAYS. Clearing only one leaves a signed-out person still holding a
  // working credential, which is the worst possible outcome of a "Sign out" button.
  const h = new Headers({ 'Content-Type': 'application/json' });
  h.append('Set-Cookie', `${COOKIE_NAME}=deleted; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
  h.append('Set-Cookie', clearedSessionCookie());
  return new Response(JSON.stringify({ ok: true }), { headers: h });
}

/**
 * The ABY-STAFF gate. Everything behind it sees every broker's data, so it must admit only
 * ABY.
 *
 * ⭐ TWO WAYS IN, AND THE SECOND IS THE NEW ONE: the legacy shared-password cookie, or a
 * SESSION whose role is 'aby'. A broker session reaches neither -- `readSession` returns
 * role 'broker' and the test below is an explicit === 'aby', not a truthiness check.
 */
async function withAuth(request, env, handler) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token   = cookies[COOKIE_NAME];

  if (token && await verifyToken(token, env.ADMIN_PASSWORD)) {
    return handler();
  }
  const session = await readSession(request, env);
  if (session && session.role === 'aby') {
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

// ═══ PER-BROKER IDENTITY (F-6) ═════════════════════════════════════════════════
//
// WHAT WAS HERE BEFORE, AND WHY IT HAD TO CHANGE. `makeToken()` above is an HMAC of the
// CONSTANT string 'aby-admin-v1' keyed by ADMIN_PASSWORD. Three consequences, none of them
// obvious from reading it:
//   ① The token is the SAME VALUE for everybody. It identifies nobody.
//   ② It NEVER EXPIRES. `Max-Age=86400` is a request to the browser, not a server rule --
//      a copied cookie works forever, until the password itself is changed.
//   ③ It is password-EQUIVALENT: anyone holding it has what the password grants.
// ⛔ Nothing below deletes that door. Eric signs in with ADMIN_PASSWORD today and must keep
// being able to; `handleLogin` still accepts it and now issues a SESSION that says role=aby.
//
// ⭐ A SESSION IS `payload.signature`, signed with HMAC-SHA256 and carrying identity and an
// EXPIRY IN THE SIGNED PART -- so expiry is enforced by the server, which is the whole
// difference from the cookie's Max-Age.
//
// 🔴 THE SIGNING KEY. `SESSION_SECRET` if set, otherwise ADMIN_PASSWORD. The fallback exists
// so this works the moment it deploys, with no new secret to set first -- but it has a real
// cost worth stating: while the fallback is in use, CHANGING ADMIN_PASSWORD SIGNS EVERYONE
// OUT, brokers included. Setting SESSION_SECRET separates the two.
const SESSION_COOKIE = 'aby_session';
const SESSION_HOURS  = 12;

function b64urlEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const pad = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function sessionKeyMaterial(env) {
  return env.SESSION_SECRET || env.ADMIN_PASSWORD || '';
}

async function hmac(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/**
 * ⚠️ CONSTANT-TIME COMPARISON. `a === b` on a signature leaks, through timing, how many
 * leading bytes were right -- which is enough to forge one byte at a time. The cost of doing
 * it properly here is a loop.
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function makeSession(env, { email, role }) {
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({
    e: String(email || '').toLowerCase(),
    r: role === 'aby' ? 'aby' : 'broker',
    x: Date.now() + SESSION_HOURS * 3600 * 1000,
  })));
  const sig = b64urlEncode(await hmac(sessionKeyMaterial(env), payload));
  return `${payload}.${sig}`;
}

/** The signed-in person, or null. Never throws -- a malformed cookie is simply not a session. */
async function readSession(request, env) {
  const secret = sessionKeyMaterial(env);
  if (!secret) return null;
  const raw = parseCookies(request.headers.get('Cookie') || '')[SESSION_COOKIE];
  if (!raw || raw.indexOf('.') < 0) return null;
  const [payload, sig] = raw.split('.');
  try {
    const expected = b64urlEncode(await hmac(secret, payload));
    if (!timingSafeEqual(sig, expected)) return null;
    const body = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    // ⚠️ THE EXPIRY IS CHECKED HERE, on the server, from the SIGNED payload. This is the line
    // that makes a copied cookie stop working.
    if (!body || typeof body.x !== 'number' || Date.now() > body.x) return null;
    return { email: String(body.e || '').toLowerCase(), role: body.r === 'aby' ? 'aby' : 'broker' };
  } catch {
    return null;
  }
}

function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_HOURS * 3600}`;
}
function clearedSessionCookie() {
  return `${SESSION_COOKIE}=deleted; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

// ─── Broker records ────────────────────────────────────────────────────────────

/**
 * 🔴 THE ONE NORMALISATION EVERYTHING DEPENDS ON. Broker email is typed by hand into the
 * quote form, so one person is "Jane@Agency.com" on one quote and "jane@agency.com " on the
 * next. Every write, every lookup and every scoping filter goes through this -- an exact
 * match anywhere else silently splits one broker's quotes into two people, and the symptom
 * is a broker who says "some of my quotes are missing" with nothing in any log.
 */
function normEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * PBKDF2-SHA256. Web Crypto, so no dependency in a Worker.
 *
 * ⚠️ THE ITERATION COUNT IS STORED PER ROW rather than fixed in code, so it can be raised
 * later without locking anybody out: an old row verifies at its own count and is re-hashed
 * at the current one on the next successful sign-in.
 */
const PBKDF2_ITER = 210000;

async function derivePassword(password, saltBytes, iterations) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, key, 256,
  );
  return b64urlEncode(new Uint8Array(bits));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    hash: await derivePassword(password, salt, PBKDF2_ITER),
    salt: b64urlEncode(salt),
    iter: PBKDF2_ITER,
  };
}

async function verifyPassword(password, row) {
  if (!row || !row.pw_hash || !row.pw_salt || !row.pw_iter) return false;
  const got = await derivePassword(password, b64urlDecode(row.pw_salt), row.pw_iter);
  return timingSafeEqual(got, row.pw_hash);
}

/**
 * The columns a BROKER may see. Deliberately narrower than the admin list.
 *
 * ⛔ `adjustment` AND `adjustment_note` ARE OMITTED, and that is the reason this is a separate
 * constant rather than a reuse of the admin one. They record ABY's internal rate override and
 * the reason for it -- ABY's own margin thinking. `adjustment_note` is even labelled
 * "(internal)" in the schema. A broker seeing their own quote must not see them, and the way
 * to guarantee that is to never select them, rather than to strip them afterwards.
 * ⚠️ It matches the 13 fields `benefitlab-dashboard/src/lib/aby-quotes.ts` declares, plus the
 * two it will want next. Adding a column here publishes it to the Broker Dashboard too.
 */
const BROKER_QUOTE_COLS =
  "id, quote_number, created_at, client_name, client_id, effective_date, broker_name, broker_agency, " +
  "broker_email, rep_name, products, COALESCE(status,'P') AS status, COALESCE(ran_by,'broker') AS ran_by, " +
  "COALESCE(state,'TX') AS state, commission_included";

/**
 * Every quote belonging to one broker, newest first.
 *
 * 🔴 THE JOIN IS ON A NORMALISED EMAIL AT BOTH ENDS. `quotes.broker_email` was typed by hand
 * on every row ever saved, so it carries mixed case and stray spaces; comparing it raw would
 * hide a broker's own quotes from them with no error anywhere.
 */
async function quotesForBroker(env, email, limit = 300) {
  const e = normEmail(email);
  if (!e) return [];
  const r = await env.DB.prepare(
    `SELECT ${BROKER_QUOTE_COLS} FROM quotes
      WHERE lower(trim(broker_email)) = ?
      ORDER BY created_at DESC LIMIT ?`,
  ).bind(e, limit).all();
  return r.results || [];
}

async function getBroker(env, email) {
  const e = normEmail(email);
  if (!e) return null;
  try {
    return await env.DB.prepare('SELECT * FROM brokers WHERE email = ?').bind(e).first();
  } catch {
    // The table may not exist yet on a database that has not been migrated. A missing table
    // must read as "no such broker", never as an error that takes the whole tool down.
    return null;
  }
}

// ─── ABY internal door ─────────────────────────────────────────────────────────

// Boolean session check (does NOT block). Used to stamp ran_by on saves.
async function isAuthed(request, env) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token = cookies[COOKIE_NAME];
  if (token && await verifyToken(token, env.ADMIN_PASSWORD)) return true;
  // ⚠️ `ran_by` MUST STAY 'ABY' ONLY FOR ABY. This function stamps who sat at the keyboard,
  // and a broker with their own login is still a broker -- so only the aby role counts here.
  // Treating any session as authed would relabel every broker's quote as ABY-run, silently,
  // and the column exists precisely to tell those apart.
  const session = await readSession(request, env);
  return !!(session && session.role === 'aby');
}

/**
 * The BROKER gate. Admits any active signed-in person and hands the handler their identity,
 * so the handler cannot forget to scope: there is no way to call it without an email in hand.
 *
 * 🔴 THE SCOPE COMES FROM THE SESSION, NEVER FROM THE REQUEST. A broker who edits
 * `?email=` in the address bar changes nothing -- the value is not read.
 */
async function withBroker(request, env, handler) {
  const session = await readSession(request, env);
  if (!session) {
    return new URL(request.url).pathname.startsWith('/api/')
      ? jsonResp({ error: 'Please sign in.' }, 401)
      : new Response(loginHTML(), { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  // ⚠️ RE-READ ON EVERY REQUEST rather than trusted from the signed cookie. Disabling a broker
  // has to take effect NOW, not when their 12-hour session happens to lapse -- otherwise
  // "revoke" means "revoke, eventually", which is not what anybody means by it.
  // ⭐ The ABY staff door has no `brokers` row at all, so it is exempt by identity, not by a
  // missing check.
  if (session.email !== 'aby@abybenefits.com') {
    const row = await getBroker(env, session.email);
    if (!row || row.status !== 'active') {
      const h = new Headers({ 'Content-Type': 'application/json' });
      h.append('Set-Cookie', clearedSessionCookie());
      return new Response(JSON.stringify({ error: 'Please sign in.' }), { status: 401, headers: h });
    }
  }
  return handler(session);
}

// Paths that stay public even while SITE_LOCKED is true. Add more here as needed.
//
// 🔴 `/assets/images/` ADDED 2026-08-06, AND IT FIXES A DEFECT THAT IS LIVE RIGHT NOW.
// `downloadQuoteAsHtml` rewrites ABY's own logo to an ABSOLUTE url so the saved file still
// renders it after the employer opens it from their inbox. But the lock gated that path, so
// MEASURED: both `abyquotes.com/assets/images/aby-logo.png` and the workers.dev equivalent
// returned **401 with a 2,032-byte login page** — an HTML document where an <img> expects a
// PNG. So every quote downloaded while the lock has been on carries a BROKEN ABY LOGO.
//
// ⭐⭐ AND THE FAILURE MODE IS THE WORST AVAILABLE: it works for the person who MADE the file
// and breaks for the person who RECEIVES it. ABY staff carry the admin cookie, so the logo
// loads on their screen; the employer has no cookie and gets a broken image on the document
// they are being asked to sign. Invisible to the sender by construction.
//
// ⭐ IMAGES ONLY, deliberately — not `/assets/`. The JS and CSS stay behind the lock, so this
// does not quietly reopen the tool; it exempts the one thing a THIRD PARTY has to be able to
// fetch. It is F-343's narrow option applied to a single directory rather than the whole site.
// ⚠️ Anything put in this directory is therefore PUBLIC even while the site is locked. It is a
// logo directory; keep it that way.
function isOpenPath(path) {
  if (path.startsWith('/assets/images/')) return true;
  // ⭐ F-6: the broker doors stay reachable while the tool itself is locked, and that is the
  // whole point of the lock now. `SITE_LOCKED` exists to keep the QUOTING TOOL closed while
  // pricing is settled; a broker signing in to READ THEIR OWN QUOTES is a different act.
  // ⚠️ Both are still gated -- `/dashboard` by `withBroker`, `/set-password` by a signed token.
  // "Open" here means "the site lock does not also apply", never "no authentication".
  if (path === '/dashboard' || path === '/dashboard/' || path === '/set-password') return true;
  return path === '/july-2026' || path === '/july-2026/' || path === '/july-2026.html';
}

// Serve the same front end as the public tool, plus the internal overlay script.
// The public bundle is never modified; the overlay is only referenced here.
async function serveAbyTool(request, env) {
  const url = new URL(request.url);
  // Fetch the root ('/'), not '/index.html': the asset handler redirects
  // '/index.html' -> '/' with an empty body, which would strip the app scripts.
  const res = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  let html = await res.text();
  const inject = '<script>window.ABY_INTERNAL=true;</script>\n<script src="/internal/aby.js"></script>\n</body>';
  html = html.includes('</body>') ? html.replace('</body>', inject) : (html + inject);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Idempotent migration: add attribution columns if they do not exist yet.
async function handleMigrate(env) {
  const stmts = [
    // 🔴 `status` WAS MISSING FROM THIS LIST UNTIL 2026-08-17, and it is not a cosmetic gap.
    // Production has the column because it was added BY HAND through the Cloudflare console,
    // so nothing ever noticed -- but every list query selects `COALESCE(status,'P')`, which
    // means a FRESH database could not serve a single quote list, admin or broker. Found by
    // standing a local D1 up from schema.sql and running the real endpoints against it.
    // ⚠️ Adding it here is safe on an existing database: a duplicate column throws and the
    // loop below swallows it, which is the same contract every other line here relies on.
    "ALTER TABLE quotes ADD COLUMN status TEXT DEFAULT 'P'",
    "ALTER TABLE quotes ADD COLUMN ran_by TEXT",
    "ALTER TABLE quotes ADD COLUMN state TEXT",
    "ALTER TABLE quotes ADD COLUMN adjustment TEXT",
    "ALTER TABLE quotes ADD COLUMN adjustment_note TEXT",
    // Added 2026-08-06. `client_id` is the BenefitLab client this quote is for, so a quote
    // no longer has to be matched to an employer by a TYPED company name (F-268).
    "ALTER TABLE quotes ADD COLUMN client_id TEXT",
    // `revision` implements Eric's decision: re-running a saved quote keeps its number and
    // becomes revision 2, rather than minting a new number (F-339).
    "ALTER TABLE quotes ADD COLUMN revision INTEGER DEFAULT 1",
    // The quote number is the only human-readable identity the tool has, and `commitments`
    // join employers' signed authorisations to it -- so it must not be issuable twice.
    // SAFE TO ADD: measured in D1 on 2026-08-06, 45 quotes / 45 distinct numbers.
    "CREATE UNIQUE INDEX IF NOT EXISTS quotes_quote_number_unique ON quotes (quote_number)",
    // Added 2026-08-06 (F-345). The employer's signed authorization had no broker on it at
    // all; `broker_email` is stored on the row so the answer survives even if the quote it
    // came from is ever renumbered, and `client_id` is the BenefitLab employer.
    // ⭐ Denormalised ON PURPOSE rather than joined: a commitment is a RECORD OF SOMETHING
    // SOMEBODY SIGNED, and it should not be able to change its meaning because a row it
    // points at changed later.
    "ALTER TABLE commitments ADD COLUMN client_id TEXT",
    "ALTER TABLE commitments ADD COLUMN broker_email TEXT",
    // ── Per-broker identity (F-6, 2026-08-17) ────────────────────────────────
    // ⚠️ CREATE TABLE IF NOT EXISTS, so it is idempotent on its own terms. The loop below
    // swallows errors to make re-running safe, which means a statement that only worked once
    // would be indistinguishable from one that never worked at all.
    "CREATE TABLE IF NOT EXISTS brokers (" +
      "email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', agency TEXT NOT NULL DEFAULT ''," +
      " phone TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'broker'," +
      " status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, last_seen_at TEXT," +
      " pw_hash TEXT, pw_salt TEXT, pw_iter INTEGER)",
    "CREATE INDEX IF NOT EXISTS brokers_status ON brokers (status)",
    // 🔴 THE JOIN THE WHOLE FEATURE RESTS ON IS `lower(trim(broker_email))`, and a plain column
    // index cannot serve it. Without this expression index every broker dashboard load scans
    // the entire quotes table -- fine at 45 rows, not fine later, and the day it stops being
    // fine nobody will connect it to this change.
    "CREATE INDEX IF NOT EXISTS quotes_broker_email_norm ON quotes (lower(trim(broker_email)))",
  ];
  const applied = [];
  for (const sql of stmts) {
    try { await env.DB.prepare(sql).run(); applied.push(sql); }
    catch (e) { /* duplicate column => already migrated; ignore */ }
  }
  return jsonResp({ ok: true, applied });
}

// The internal overlay: state selector + rate override, served ONLY to a valid
// ABY session. It monkey-patches the engine at runtime (state + applyAdjustment)
// and attaches state/adjustment to the save. No public file is touched.
function abyInternalJS() {
  return `` + ABY_INTERNAL_JS + ``;
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
  <select id="ranByFilter" style="margin-left:auto;padding:.4rem .5rem;border:1px solid #ddd;border-radius:6px;font-size:.85rem">
    <option value="">All sources</option>
    <option value="ABY">ABY-run</option>
    <option value="dashboard">Broker - dashboard</option>
    <option value="direct">Broker - direct link</option>
    <option value="broker">Broker (either)</option>
  </select>
</div>
<div class="tabs">
  <button class="tab active" data-status="P">Pending</button>
  <button class="tab" data-status="S">Sold</button>
  <button class="tab" data-status="D">Dead</button>
  <button class="tab" data-view="commitments" id="commitmentsTab" style="margin-left:auto">Commitments</button>
  <button class="tab" data-view="brokers" id="brokersTab">Brokers</button>
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
          <th>Broker / Agency</th><th>Rep</th><th>Products</th><th>Comm</th><th>Ran by</th>
        </tr>
      </thead>
      <tbody id="tbody">
        <tr><td colspan="7" class="loading">Loading quotes…</td></tr>
      </tbody>
    </table>
  </div>
<div id="brokers-wrap" style="display:none">
  <div style="background:#fff;border-radius:8px;padding:1rem 1.15rem;margin-bottom:1rem;
              box-shadow:0 1px 3px rgba(0,0,0,.08)">
    <h3 style="margin:0 0 .2rem;font-size:.95rem;color:#1a5c3a">Give a broker access to their own quotes</h3>
    <!-- ⭐ Eric, 2026-08-17: "let's not email the broker who hasn't asked for anything. ABY might
         suggest that they create an account." So this HANDS BACK A LINK rather than sending one. -->
    <p style="margin:.15rem 0 .8rem;color:#666;font-size:.85rem">
      Use the email address that is on their quotes. You will get a setup link to pass on however you
      like &ndash; nothing is emailed automatically, and they choose their own password.
    </p>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-end">
      <input id="bk-email" type="email" placeholder="Email on their quotes" style="flex:2 1 220px;padding:.5rem .65rem;border:1px solid #ddd;border-radius:6px;font:inherit">
      <input id="bk-name" placeholder="Name (optional)" style="flex:1 1 150px;padding:.5rem .65rem;border:1px solid #ddd;border-radius:6px;font:inherit">
      <input id="bk-agency" placeholder="Agency (optional)" style="flex:1 1 150px;padding:.5rem .65rem;border:1px solid #ddd;border-radius:6px;font:inherit">
      <button onclick="saveBroker()" style="padding:.55rem 1rem;background:#1a5c3a;color:#fff;border:0;border-radius:6px;font:inherit;cursor:pointer;font-weight:600">Create</button>
    </div>
    <div id="bk-msg" style="margin-top:.7rem;font-size:.87rem"></div>
  </div>
  <div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>Email</th><th>Name</th><th>Agency</th><th>Quotes</th>
        <th>Password</th><th>Status</th><th>Last seen</th><th></th>
      </tr></thead>
      <tbody id="bk-rows"></tbody>
    </table>
  </div>
</div>

<div id="commitments-wrap" style="display:none;overflow-x:auto">
  <table id="ctable" style="width:100%;border-collapse:collapse;font-size:13px">
    <thead>
      <tr>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0;white-space:nowrap">Submitted</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Quote #</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Employer</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Broker</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Auth Signer</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Email / Phone</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Start Date</th>
        <th style="text-align:left;padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0">Products</th>
        <th style="padding:10px 12px;background:#f7f9f7;border-bottom:2px solid #e0e0e0"></th>
      </tr>
    </thead>
    <tbody id="ctbody"><tr><td colspan="9" style="padding:20px;color:#888;text-align:center">Loading…</td></tr></tbody>
  </table>
</div>
</main>
<script>
let quotes = [];
let expandedId = null;
let activeTab = 'P';
let ranByFilter = '';
document.addEventListener('DOMContentLoaded', function(){
  var sel = document.getElementById('ranByFilter');
  if (sel) sel.addEventListener('change', function(){ ranByFilter = sel.value; render(); });
});

async function load(q) {
  q = q || '';
  const url = '/api/quotes' + (q ? ('?q=' + encodeURIComponent(q)) : '');
  const tbody = document.getElementById('tbody');

  tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading quotes…</td></tr>';

  let res;
  try {
    res = await fetch(url);
  } catch (netErr) {
    tbody.innerHTML = '<tr><td colspan="7" class="error-msg">Network error: ' + netErr.message + '</td></tr>';
    return;
  }

  if (res.status === 401) {
    tbody.innerHTML = '<tr><td colspan="7" class="error-msg">Session expired — <a href="/admin">click here to log in again</a>.</td></tr>';
    return;
  }
  if (!res.ok) {
    const errBody = await res.json().catch(function(){ return {}; });
    tbody.innerHTML = '<tr><td colspan="7" class="error-msg">Server error ' + res.status + ': ' + (errBody.error || 'unknown error') + '</td></tr>';
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch (parseErr) {
    tbody.innerHTML = '<tr><td colspan="7" class="error-msg">Could not read server response: ' + parseErr.message + '</td></tr>';
    return;
  }

  quotes = data.quotes || [];
  render();
}

// ── Where a quote came from: TWO AXES, deliberately not collapsed into one field ─────────
//
// Eric, 2026-08-06: "We will also have some quotes that ABY runs. So when we're keeping
// track, we need to account for that."
//
//   ran_by    -- WHO SAT AT THE KEYBOARD. Decided server-side from the admin cookie, never
//                from the form, so it cannot be spoofed.
//   client_id -- WHERE IT CAME FROM. Present only when the BenefitLab dashboard handed the
//                client over (Change E).
//
// ⭐ They are ORTHOGONAL, and that is not a technicality: Eric works at ABY and owns
// BenefitLab, so an ABY session opening a quote from the dashboard is a real combination.
// Merging them into a single "source" column would have to pick one, and would be wrong for
// him specifically. Same shape as the disposition decision -- two questions, two fields,
// labelled distinctly rather than reconciled.
function originOf(q) {
  if ((q.ran_by || 'broker') === 'ABY') return 'ABY';
  return (q.client_id && String(q.client_id).trim()) ? 'dashboard' : 'direct';
}
// 'broker' is kept as a filter value so links and habits from the old two-way control still
// work -- it now means "either broker origin".
function originMatches(q, want) {
  var o = originOf(q);
  if (want === 'broker') return o !== 'ABY';
  return o === want;
}
const ORIGIN_LABEL = { ABY: 'ABY', dashboard: 'Dashboard', direct: 'Direct link' };
const ORIGIN_COLOR = { ABY: '#205aa6', dashboard: '#1a5c3a', direct: '#777' };

function render() {
  const tbody = document.getElementById('tbody');
  const filtered = quotes.filter(function(q){
    if ((q.status || 'P') !== activeTab) return false;
    if (ranByFilter && !originMatches(q, ranByFilter)) return false;
    return true;
  });

  ['P','S','D'].forEach(function(s) {
    var btn = document.querySelector('.tab[data-status="' + s + '"]');
    if (!btn) return;
    var n = quotes.filter(function(q){ return (q.status || 'P') === s; }).length;
    var label = {P:'Pending',S:'Sold',D:'Dead'}[s];
    btn.innerHTML = label + (n ? ' <span class="tab-count">' + n + '</span>' : '');
  });

  // "When we're keeping track, we need to account for that" -- so the count is a BREAKDOWN,
  // not a total. A single number cannot answer "are brokers actually using the dashboard?",
  // which is the question the generic link exists to create.
  // ⚠️ Counted over the CURRENT TAB's filtered set, and it says which set, because a
  // breakdown whose scope is ambiguous is how two screens come to disagree.
  var byOrigin = { ABY: 0, dashboard: 0, direct: 0 };
  filtered.forEach(function (q) { byOrigin[originOf(q)]++; });
  var parts = ['ABY', 'dashboard', 'direct']
    .filter(function (k) { return byOrigin[k]; })
    .map(function (k) { return ORIGIN_LABEL[k] + ' ' + byOrigin[k]; });
  document.getElementById('count').textContent =
    filtered.length
      ? (filtered.length + ' quote' + (filtered.length !== 1 ? 's' : '') +
         (parts.length > 1 ? '  (' + parts.join(' · ') + ')' : ''))
      : '';
  if (!filtered.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No quotes found.</td></tr>';
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
      '<td><span class="badge ' + (isC ? 'badge-c' : 'badge-nc') + '">' + (isC ? 'C' : 'NC') + '</span></td>' +
      '<td>' +
        // Three-way origin in the column that already existed, rather than a new column --
        // a new one would need every colspan widened, which is the defect H nearly shipped.
        '<span class="badge" style="background:' + ORIGIN_COLOR[originOf(q)] + ';color:#fff" title="' +
          (originOf(q) === 'dashboard' ? 'Handed over from the BenefitLab dashboard (carries a client id)'
           : originOf(q) === 'direct' ? 'Run on the shared link - broker typed their own details'
           : 'Run by ABY from the admin') + '">' + ORIGIN_LABEL[originOf(q)] + '</span> ' +
        '<span style="font-size:.78rem;color:#888">' + esc(q.state || "TX") + '</span>' +
        (q.adjustment ? '<br><span style="font-size:.72rem;color:#b8860b" title="' + esc(q.adjustment_note || "") + '">rate override</span>' : '') +
      '</td>';

    row.addEventListener('click', function(){ toggleDetail(q.id); });
    tbody.appendChild(row);

    if (isExp) {
      const dr = document.createElement('tr');
      dr.className = 'detail-row';
      dr.innerHTML = '<td colspan="7">' + detailHTML(q, products) + '</td>';
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
    // The ORIGINAL quote number, so re-opening a saved quote keeps its identity instead
    // of minting a new one. Eric, 2026-08-06: "if I just want to look at it again, the
    // number should not change." app.js honours it unless the commission basis changed.
    quoteNumber: q.quote_number || '',
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

    var brokersWrap = document.getElementById('brokers-wrap');
    if (this.dataset.view === 'commitments') {
      document.querySelector('.table-wrap').style.display = 'none';
      document.getElementById('commitments-wrap').style.display = 'block';
      if (brokersWrap) brokersWrap.style.display = 'none';
      document.getElementById('search').style.display = 'none';
      document.getElementById('count').textContent = '';
      loadCommitments();
    } else if (this.dataset.view === 'brokers') {
      document.querySelector('.table-wrap').style.display = 'none';
      document.getElementById('commitments-wrap').style.display = 'none';
      if (brokersWrap) brokersWrap.style.display = 'block';
      document.getElementById('search').style.display = 'none';
      document.getElementById('count').textContent = '';
      loadBrokers();
    } else {
      document.querySelector('.table-wrap').style.display = 'block';
      document.getElementById('commitments-wrap').style.display = 'none';
      if (brokersWrap) brokersWrap.style.display = 'none';
      document.getElementById('search').style.display = '';
      activeTab = this.dataset.status;
      expandedId = null;
      render();
    }
  });
});


// ── Brokers (F-6) ────────────────────────────────────────────────────────────
// ⛔ NOTHING HERE SETS OR SHOWS A PASSWORD. ABY creates the row and hands over a setup link;
// the broker chooses their own. That is the only arrangement in which "we do not have your
// password" is a true sentence, and it is why there is no reset-to-a-value control anywhere.
var brokerRows = [];

async function loadBrokers() {
  var res = await fetch('/api/brokers');
  var j = await res.json().catch(function () { return {}; });
  brokerRows = (j && j.brokers) || [];
  renderBrokers();
}

function renderBrokers() {
  var tb = document.getElementById('bk-rows');
  if (!tb) return;
  if (!brokerRows.length) {
    tb.innerHTML = '<tr><td colspan="8" style="padding:1.4rem;color:#777">' +
      'No brokers yet. Add one above to let them see their own quotes.</td></tr>';
    return;
  }
  tb.innerHTML = brokerRows.map(function (b) {
    var disabled = b.status === 'disabled';
    // ⚠️ "No password yet" is a normal, expected state -- it means the setup link has not been
    // used. It is shown plainly rather than as a warning, because chasing it is Eric's call.
    var pw = Number(b.has_password)
      ? '<span style="color:#1a6640">Set</span>'
      : '<span style="color:#8a6100">Not yet</span>';
    var st = disabled
      ? '<span style="color:#c0392b">Disabled</span>'
      : '<span style="color:#1a6640">Active</span>';
    return '<tr' + (disabled ? ' style="opacity:.6"' : '') + '>' +
      '<td>' + escAdmin(b.email) + '</td>' +
      '<td>' + escAdmin(b.name || '') + '</td>' +
      '<td>' + escAdmin(b.agency || '') + '</td>' +
      '<td style="text-align:right">' + (b.quote_count || 0) + '</td>' +
      '<td>' + pw + '</td>' +
      '<td>' + st + '</td>' +
      '<td>' + escAdmin((b.last_seen_at || '').slice(0, 10) || '—') + '</td>' +
      // 🔴 NO QUOTES INSIDE QUOTES HERE, AND THIS IS THE REASON. The whole admin page is emitted
      // from a JS TEMPLATE LITERAL in worker.js, and a template literal CONSUMES backslash
      // escapes -- so an inline onclick written with escaped quotes reached the browser as
      // `toggleBroker('' + ...`, a SYNTAX ERROR that killed every script on the page, including
      // the quote list, which has nothing to do with brokers. Data attributes need no escaping.
      '<td><button class="bk-toggle" data-email="' + escAdmin(b.email) + '" data-disable="' +
        (disabled ? '0' : '1') + '" ' +
        'style="padding:.3rem .7rem;border:1px solid #ddd;background:#fff;border-radius:5px;cursor:pointer;font:inherit;font-size:.8rem">' +
        (disabled ? 'Re-enable' : 'Disable') + '</button></td>' +
    '</tr>';
  }).join('');
}

// ⚠️ ONE DELEGATED LISTENER rather than a handler per row: the rows are rebuilt on every load,
// and this survives that without re-attaching anything.
document.addEventListener('click', function (e) {
  var btn = e.target && e.target.closest ? e.target.closest('.bk-toggle') : null;
  if (!btn) return;
  toggleBroker(btn.getAttribute('data-email'), btn.getAttribute('data-disable') === '1');
});

function escAdmin(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function saveBroker() {
  var email = (document.getElementById('bk-email').value || '').trim();
  var msg = document.getElementById('bk-msg');
  if (!email) { msg.innerHTML = '<span style="color:#c0392b">Enter the email address on their quotes.</span>'; return; }
  msg.textContent = 'Saving…';
  var res = await fetch('/api/brokers', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email,
      name: document.getElementById('bk-name').value,
      agency: document.getElementById('bk-agency').value,
    }),
  });
  var j = await res.json().catch(function () { return {}; });
  if (!res.ok) { msg.innerHTML = '<span style="color:#c0392b">' + escAdmin(j.error || 'That did not work.') + '</span>'; return; }

  if (j.setupUrl) {
    msg.innerHTML = '<div style="background:#f4f9f6;border:1px solid #cfe6da;border-radius:6px;padding:.7rem .85rem">' +
      '<div style="font-weight:600;color:#1a5c3a;margin-bottom:.3rem">Setup link for ' + escAdmin(j.email) + '</div>' +
      '<div style="font-size:.8rem;color:#666;margin-bottom:.45rem">Send this to them however you like. ' +
      'It expires in ' + (j.setupHours || 72) + ' hours and stops working once they have set a password.</div>' +
      '<input readonly value="' + escAdmin(j.setupUrl) + '" onfocus="this.select()" ' +
      'style="width:100%;padding:.45rem .6rem;border:1px solid #ddd;border-radius:5px;font:inherit;font-size:.82rem">' +
      '</div>';
  } else {
    msg.innerHTML = '<span style="color:#1a6640">Saved. They already have a password, so no setup link is needed.</span>';
  }
  document.getElementById('bk-email').value = '';
  document.getElementById('bk-name').value = '';
  document.getElementById('bk-agency').value = '';
  loadBrokers();
}

async function toggleBroker(email, disable) {
  var row = brokerRows.filter(function (b) { return b.email === email; })[0] || {};
  await fetch('/api/brokers', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email, name: row.name || '', agency: row.agency || '',
      role: row.role || 'broker', status: disable ? 'disabled' : 'active',
    }),
  });
  loadBrokers();
}

var commitmentData = {};
let commitmentsLoaded = false;
async function loadCommitments() {
  if (commitmentsLoaded) return;
  const ctbody = document.getElementById('ctbody');
  try {
    const res = await fetch('/api/commitments');
    if (!res.ok) { ctbody.innerHTML = '<tr><td colspan="9" style="padding:16px;color:#c00;text-align:center">Error loading commitments.</td></tr>'; return; }
    const data = await res.json();
    const rows = data.commitments || [];
    document.getElementById('count').textContent = rows.length + ' commitment' + (rows.length !== 1 ? 's' : '');
    if (!rows.length) { ctbody.innerHTML = '<tr><td colspan="9" style="padding:20px;color:#888;text-align:center">No commitments yet.</td></tr>'; return; }
    ctbody.innerHTML = rows.map(function(c) {
      var dt = new Date(c.submitted_at);
      var dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      var products = [];
      try { products = JSON.parse(c.products || '[]'); } catch(e) {}
      commitmentData[c.id] = { c: c, products: products };
      var td = function(v, extra) { return '<td style="padding:9px 12px;border-bottom:1px solid #eee;vertical-align:top' + (extra || '') + '">' + (v || '<span style="color:#bbb">—</span>') + '</td>'; };
      // Prefer what the commitment itself recorded; fall back to the quote it references.
      // The agency line comes only from the quote (the signed form carries an email, not an
      // agency name), so it is shown muted -- it is a lookup, not part of what was signed.
      var brokerCellFor = function(row) {
        var email  = row.broker_email || row.broker_email_resolved || '';
        var name   = row.quote_broker_name || '';
        var agency = row.quote_broker_agency || '';
        var top    = name || email;
        if (!top) return '';
        var out = (name && email)
          ? '<a href="mailto:' + email + '">' + name + '</a>'
          : (email ? '<a href="mailto:' + email + '">' + email + '</a>' : name);
        if (agency) out += '<br><span style="color:#777;font-size:12px">' + agency + '</span>';
        return out;
      };
      var productNames = products.map(function(p){ return p.name || String(p); }).join('<br>');
      return '<tr class="c-row">' +
        td(dateStr, ';white-space:nowrap') +
        td('<strong>' + (c.quote_number || '') + '</strong>') +
        td((c.employer_name || '') + (c.address ? '<br><span style="color:#777;font-size:12px">' + c.address + (c.city_state_zip ? ', ' + c.city_state_zip : '') + '</span>' : '')) +
        // Broker. Named on the row itself for anything signed after the migration; recovered
        // through the quote only for older rows, which is why the agency line is muted and
        // why an unknown broker prints an em dash rather than being left blank.
        td(brokerCellFor(c)) +
        td((c.auth_signer || '') + (c.auth_title ? '<br><span style="color:#777;font-size:12px">' + c.auth_title + '</span>' : '')) +
        td((c.auth_email ? '<a href="mailto:' + c.auth_email + '">'  + c.auth_email + '</a>' : '') + (c.auth_phone ? '<br>' + c.auth_phone : '')) +
        td(c.start_date || '') +
        td(productNames) +
        '<td style="padding:9px 12px;border-bottom:1px solid #eee;vertical-align:top;white-space:nowrap">' +
          '<button class="dl-btn" data-cid="' + c.id + '" style="padding:5px 10px;background:#1a5c3a;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;margin-right:6px">&#11091; Download</button>' +
          '<button class="del-cmt-btn" data-cid="' + c.id + '" style="padding:5px 10px;background:white;color:#c0392b;border:1px solid #f5b8b8;border-radius:4px;font-size:12px;cursor:pointer">Delete ✕</button>' +
        '</td>' +
        '</tr>';
    }).join('');
    commitmentsLoaded = true;
    ctbody.addEventListener('click', function(e) {
      var dlBtn = e.target.closest('.dl-btn');
      if (dlBtn) { downloadCommitment(dlBtn.dataset.cid); return; }
      var delBtn = e.target.closest('.del-cmt-btn');
      if (delBtn) deleteCommitment(delBtn.dataset.cid);
    }, { once: true });
  } catch(err) {
    ctbody.innerHTML = '<tr><td colspan="9" style="padding:16px;color:#c00;text-align:center">Network error.</td></tr>';
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
          var m = f.tierNote ? f.tierNote.match(/^(\d+)\+/) : null;
          if (f.countNote) {
            var displayRate = f.rateNote || '';
            if (m && displayRate.indexOf('minimum') !== -1) {
              displayRate = displayRate.replace(/(\(minimum [^)]+\))/, '$1 for groups under ' + m[1] + ' employees');
            }
            return '<tr><td colspan="3" style="padding:5px 8px 1px 8px;font-size:13px;color:#555">' + f.label + ' — ' + f.countNote + '</td></tr>' +
              '<tr><td style="padding:1px 8px 2px 24px"></td>' +
              '<td style="padding:1px 8px 2px;text-align:right;font-weight:700;white-space:nowrap;border-bottom:1px solid #f0f0f0">' + (f.value || '') + '</td>' +
              '<td style="padding:1px 8px 2px;color:#888;white-space:nowrap;border-bottom:1px solid #f0f0f0">' + (f.cadence || '') + '</td></tr>' +
              (displayRate ? '<tr><td colspan="3" style="padding:0 8px 6px 24px;font-size:11px;color:#888;font-style:italic">' + displayRate + '</td></tr>' : '');
          }
          return '<tr>' +
            '<td style="padding:4px 8px;color:#555;border-bottom:1px solid #f0f0f0">' + (f.label || '') + '</td>' +
            '<td style="padding:4px 8px;text-align:right;font-weight:700;border-bottom:1px solid #f0f0f0;white-space:nowrap">' + (f.value || '') + '</td>' +
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

async function deleteCommitment(id) {
  if (!confirm('Delete this commitment? This cannot be undone.')) return;
  var res = await fetch('/api/commitments/' + id, { method: 'DELETE' });
  if (res.ok) {
    delete commitmentData[id];
    var row = document.querySelector('.del-cmt-btn[data-cid="' + id + '"]');
    if (row) row.closest('tr').remove();
    var remaining = Object.keys(commitmentData).length;
    document.getElementById('count').textContent = remaining + ' commitment' + (remaining !== 1 ? 's' : '');
  } else {
    alert('Delete failed — please try again.');
  }
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
<title>ABY Quotes — Sign in</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
     min-height:100vh;margin:0;background:#f0f4f0}
.card{background:white;padding:2.5rem;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,.12);width:340px}
h1{margin:0 0 .25rem;font-size:1.25rem;color:#1a5c3a}
.sub{color:#888;font-size:.875rem;margin:.25rem 0 1.5rem}
input[type=email],input[type=password]{width:100%;padding:.625rem .75rem;border:1px solid #ddd;border-radius:6px;
                      font-size:1rem;margin-bottom:.75rem;display:block}
input[type=email]:focus,input[type=password]:focus{outline:none;border-color:#1a5c3a;box-shadow:0 0 0 3px rgba(26,92,58,.15)}
button{width:100%;padding:.65rem;background:#1a5c3a;color:white;border:none;border-radius:6px;
       font-size:1rem;cursor:pointer;font-weight:600}
button:hover{background:#164d30}
button:disabled{opacity:.6;cursor:default}
.err{color:#c0392b;font-size:.85rem;margin-bottom:.5rem;display:none}
</style>
</head>
<body>
<div class="card">
  <h1>ABY Quotes</h1>
  <p class="sub">Sign in to see your quotes</p>
  <p class="err" id="err">That email and password do not match an account.</p>
  <input type="email" id="em" placeholder="Email address" autocomplete="username" autofocus>
  <input type="password" id="pw" placeholder="Password" autocomplete="current-password">
  <button id="btn" onclick="login()">Sign in</button>
</div>
<script>
// ⚠️ THE EMAIL IS OPTIONAL ON PURPOSE. Leaving it blank and entering the shared
// password is ABY's own staff door, which existed before per-broker logins and still works
// exactly as it did -- the server decides which door was used, not this page.
async function login(){
  const em=document.getElementById('em').value.trim();
  const pw=document.getElementById('pw').value;
  const btn=document.getElementById('btn');
  btn.disabled=true; btn.textContent='Checking…';
  const res=await fetch('/api/admin/login',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:em,password:pw})
  });
  if(res.ok){
    var j=await res.json().catch(function(){return {};});
    // A broker lands on their own dashboard; ABY reloads into whatever they asked for.
    if(j.role==='broker'){location.href='/dashboard';} else {location.reload();}
  }
  else{
    document.getElementById('err').style.display='block';
    btn.disabled=false; btn.textContent='Sign in';
  }
}
['em','pw'].forEach(function(id){
  document.getElementById(id).addEventListener('keydown',function(e){if(e.key==='Enter')login();});
});
</script>
</body>
</html>`;
}

// ─── Internal overlay source (served at /internal/aby.js to ABY sessions only) ──
const ABY_INTERNAL_JS = `
(function () {
  'use strict';
  if (!window.ABYQuote || !window.ABYQuote.engine) return;

  // States ABY can quote. Add a state here once its pricing is provisioned.
  var STATES = [{ code: 'TX', name: 'Texas' }];

  window.ABY_STATE = 'TX';
  window.ABY_ADJUSTMENT = null;   // { mode:'percent'|'flat', amount:Number, scope:'all'|productId }
  window.ABY_ADJ_NOTE = '';

  // 1) Route state + override through BOTH the preview and the downloaded file.
  var origCalcAll = window.ABYQuote.engine.calculateAll;
  window.ABYQuote.engine.calculateAll = function (selections, commissioned, state) {
    var st = window.ABY_STATE || state || 'TX';
    var results = origCalcAll.call(this, selections, commissioned, st);
    if (window.ABY_ADJUSTMENT) results = window.ABYQuote.engine.applyAdjustment(results, window.ABY_ADJUSTMENT);
    return results;
  };

  // 2) Attach state + adjustment to the save (internal only; never on client PDF).
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (init && (init.method || '').toUpperCase() === 'POST' && url.indexOf('/api/quotes') !== -1 && init.body) {
        var b = JSON.parse(init.body);
        b.state = window.ABY_STATE || 'TX';
        if (window.ABY_ADJUSTMENT) {
          b.adjustment = window.ABY_ADJUSTMENT;
          b.adjustmentNote = window.ABYQuote.engine.describeAdjustment(window.ABY_ADJUSTMENT) +
            (window.ABY_ADJ_NOTE ? (' — ' + window.ABY_ADJ_NOTE) : '');
        }
        init.body = JSON.stringify(b);
      }
    } catch (e) {}
    return origFetch.apply(this, arguments);
  };

  function money(n) { return (n < 0 ? '-$' : '$') + Math.abs(n); }

  function recompute(panel) {
    var mode = panel.querySelector('#abyMode').value;
    var amtEl = panel.querySelector('#abyAmt');
    var amt = parseFloat(amtEl.value);
    var scope = panel.querySelector('#abyScope').value;
    window.ABY_STATE = panel.querySelector('#abyState').value || 'TX';
    window.ABY_ADJ_NOTE = panel.querySelector('#abyNote').value || '';
    var summary = panel.querySelector('#abySummary');
    if (mode === 'none' || isNaN(amt) || amt === 0) {
      window.ABY_ADJUSTMENT = null;
      summary.textContent = 'No override. State: ' + window.ABY_STATE + '. Quotes run at standard ' + window.ABY_STATE + ' pricing.';
      return;
    }
    window.ABY_ADJUSTMENT = { mode: mode, amount: amt, scope: scope };
    summary.textContent = 'Applied: ' + window.ABYQuote.engine.describeAdjustment(window.ABY_ADJUSTMENT) +
      '. State: ' + window.ABY_STATE + '. Re-generate the quote to apply.';
  }

  function build() {
    var form = document.getElementById('quoteForm');
    var host = form || document.body;

    var stateOpts = STATES.map(function (s) { return '<option value="' + s.code + '">' + s.name + ' (' + s.code + ')</option>'; }).join('');
    var prods = (window.ABYQuote.products || []);
    var scopeOpts = '<option value="all">All products</option>' +
      prods.map(function (p) { return '<option value="' + p.id + '">' + (p.shortName || p.name || p.id) + '</option>'; }).join('');

    var panel = document.createElement('div');
    panel.id = 'aby-internal-panel';
    panel.style.cssText = 'border:2px solid #205aa6;background:#eef4fb;border-radius:12px;padding:16px 18px;margin:0 0 20px;font-family:Arial,Helvetica,sans-serif;';
    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">' +
        '<strong style="color:#143c73;font-size:15px;">ABY internal controls</strong>' +
        '<span style="background:#205aa6;color:#fff;font-size:11px;padding:2px 8px;border-radius:999px;">not visible to brokers</span>' +
      '</div>' +
      '<p style="margin:0 0 12px;color:#4a5568;font-size:12.5px;">State pricing and rate overrides. Overrides change the quoted price; the override itself is recorded internally and never appears on the client proposal or PDF.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">' +
        '<label style="font-size:12px;color:#143c73;">State<br><select id="abyState" style="padding:6px;min-width:150px;">' + stateOpts + '</select></label>' +
        '<label style="font-size:12px;color:#143c73;">Override<br><select id="abyMode" style="padding:6px;"><option value="none">None</option><option value="percent">Percent (%)</option><option value="flat">Flat ($)</option></select></label>' +
        '<label style="font-size:12px;color:#143c73;">Amount<br><input id="abyAmt" type="number" step="0.01" placeholder="e.g. 10 or -15" style="padding:6px;width:130px;"></label>' +
        '<label style="font-size:12px;color:#143c73;">Applies to<br><select id="abyScope" style="padding:6px;min-width:150px;">' + scopeOpts + '</select></label>' +
        '<label style="font-size:12px;color:#143c73;flex:1;min-width:180px;">Reason (internal note)<br><input id="abyNote" type="text" placeholder="e.g. DFW regional / ABC brokerage discount" style="padding:6px;width:100%;box-sizing:border-box;"></label>' +
      '</div>' +
      '<div id="abySummary" style="margin-top:10px;font-size:12.5px;color:#143c73;font-weight:bold;"></div>';

    if (host === form && form.parentNode) form.parentNode.insertBefore(panel, form);
    else host.insertBefore(panel, host.firstChild);

    ['abyState', 'abyMode', 'abyAmt', 'abyScope', 'abyNote'].forEach(function (id) {
      var el = panel.querySelector('#' + id);
      el.addEventListener('input', function () { recompute(panel); });
      el.addEventListener('change', function () { recompute(panel); });
    });
    recompute(panel);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
`;

// ═══ F-6 HANDLERS ══════════════════════════════════════════════════════════════

/**
 * The endpoint the BenefitLab Broker Dashboard has been waiting for.
 *
 * ⭐⭐ WHY THIS PATH NEEDS NO ABY ACCOUNT, and it is the strongest part of the design:
 * BenefitLab has ALREADY verified the broker's email through Supabase. ABY does not have to
 * re-verify a person it can trust its own sibling about -- it only has to trust the CALLER,
 * which is what the bearer token does. So a broker who signs into BenefitLab finds their ABY
 * quotes waiting with no second login, and Eric's market point still holds the other way: a
 * broker who only knows ABY signs in at ABY instead.
 *
 * 🔴 THE TOKEN IS THE ENTIRE SECURITY OF THIS ROUTE, because the email is supplied by the
 * caller. Anyone holding it can read any broker's quotes by asking. It is therefore a SERVER
 * secret at both ends -- `aby-quotes.ts` imports `server-only` so it cannot reach a browser.
 * ⛔ IF `INTEGRATION_TOKEN` IS UNSET THE ROUTE IS CLOSED, not open. An unset secret comparing
 * equal to an absent header is the classic way this kind of check fails open.
 */
async function handleBrokerQuotesIntegration(request, env) {
  const expected = env.INTEGRATION_TOKEN;
  if (!expected) return jsonResp({ error: 'Integration not configured.' }, 503);

  const auth = request.headers.get('Authorization') || '';
  const got = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!got || !timingSafeEqual(got, expected)) return jsonResp({ error: 'Unauthorized' }, 401);

  const email = normEmail(new URL(request.url).searchParams.get('email'));
  // ⚠️ An empty email returns an EMPTY LIST, never every quote. A caller that forgets the
  // parameter must not be handed the whole book.
  if (!email) return jsonResp({ quotes: [] });

  try {
    return jsonResp({ quotes: await quotesForBroker(env, email) });
  } catch (err) {
    return jsonResp({ error: String((err && err.message) || err) }, 500);
  }
}

/** A signed-in broker's own quotes. ABY sees the whole book through /admin instead. */
async function handleMyQuotes(env, session) {
  try {
    return jsonResp({ quotes: await quotesForBroker(env, session.email), email: session.email });
  } catch (err) {
    return jsonResp({ error: String((err && err.message) || err) }, 500);
  }
}

const SETUP_HOURS = 72;

async function makeSetupToken(env, email, expiresAt) {
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({ e: normEmail(email), x: expiresAt })));
  const sig = b64urlEncode(await hmac(sessionKeyMaterial(env), 'setup:' + payload));
  return payload + '.' + sig;
}

async function verifySetupToken(env, email, token) {
  const secret = sessionKeyMaterial(env);
  if (!secret || token.indexOf('.') < 0) return false;
  const [payload, sig] = token.split('.');
  try {
    const expected = b64urlEncode(await hmac(secret, 'setup:' + payload));
    if (!timingSafeEqual(sig, expected)) return false;
    const body = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    return !!body && normEmail(body.e) === normEmail(email) && typeof body.x === 'number' && Date.now() <= body.x;
  } catch {
    return false;
  }
}

/**
 * A broker setting their OWN password, using a one-time setup token issued by ABY.
 *
 * ⛔ THERE IS NO ROUTE ANYWHERE THAT SETS SOMEBODY ELSE'S PASSWORD, and there must not be.
 * ABY creates the row and hands over a link; the broker chooses the password. Nobody at ABY
 * ever sees it, which is the only arrangement under which "we do not have your password" is
 * a true statement.
 *
 * ⚠️ THE TOKEN IS SIGNED AND EXPIRING RATHER THAN A DATABASE ROW: an HMAC over the email plus
 * an expiry, so there is nothing to clean up and nothing to leak. It is single-use in the way
 * that matters -- once a password exists, a setup token for that email stops working, so a
 * link that leaks months later cannot be used to take an account over.
 */
async function handleSetPassword(request, env) {
  const b = await request.json().catch(() => ({}));
  const email = normEmail(b.email);
  const token = String(b.token || '');
  const pw = String(b.password || '');

  // 12 characters, because this is the only credential in front of a broker's book of
  // business and there is no second factor behind it.
  if (pw.length < 12) return jsonResp({ error: 'Please choose a password of at least 12 characters.' }, 400);
  if (!email || !token) return jsonResp({ error: 'That setup link is not valid.' }, 400);
  if (!(await verifySetupToken(env, email, token))) {
    return jsonResp({ error: 'That setup link has expired or is not valid. Ask ABY for a new one.' }, 400);
  }

  const row = await getBroker(env, email);
  if (!row || row.status !== 'active') return jsonResp({ error: 'That setup link is not valid.' }, 400);
  if (row.pw_hash) return jsonResp({ error: 'This account already has a password. Ask ABY to reset it.' }, 400);

  const fresh = await hashPassword(pw);
  await env.DB.prepare('UPDATE brokers SET pw_hash=?, pw_salt=?, pw_iter=? WHERE email=?')
    .bind(fresh.hash, fresh.salt, fresh.iter, email).run();

  const session = await makeSession(env, { email, role: row.role === 'aby' ? 'aby' : 'broker' });
  const h = new Headers({ 'Content-Type': 'application/json' });
  h.append('Set-Cookie', sessionCookie(session));
  return new Response(JSON.stringify({ ok: true }), { headers: h });
}

/** Every broker, with a quote count, for ABY's own screen. */
async function handleListBrokers(env) {
  try {
    const r = await env.DB.prepare(
      'SELECT b.email, b.name, b.agency, b.role, b.status, b.created_at, b.last_seen_at,' +
      ' (b.pw_hash IS NOT NULL) AS has_password,' +
      ' (SELECT COUNT(*) FROM quotes q WHERE lower(trim(q.broker_email)) = b.email) AS quote_count' +
      ' FROM brokers b ORDER BY b.created_at DESC',
    ).all();
    return jsonResp({ brokers: r.results || [] });
  } catch (err) {
    return jsonResp({ error: String((err && err.message) || err), brokers: [] }, 500);
  }
}

/**
 * Create or update a broker. ABY-only.
 *
 * ⭐ IT RETURNS A SETUP LINK RATHER THAN SENDING ONE. ABY has an email sender (Resend), but a
 * broker who has not asked for an account should not receive mail about one -- Eric,
 * 2026-08-17: "let's not email the broker who hasn't asked for anything. ABY might suggest
 * that they create an account." So the link is handed to whoever is at the screen, to pass on
 * however they choose.
 */
async function handleUpsertBroker(request, env) {
  const b = await request.json().catch(() => ({}));
  const email = normEmail(b.email);
  if (!email || email.indexOf('@') < 1) return jsonResp({ error: 'A valid email is required.' }, 400);

  const role = b.role === 'aby' ? 'aby' : 'broker';
  const status = b.status === 'disabled' ? 'disabled' : 'active';
  const now = new Date().toISOString();

  try {
    // ⚠️ THE UPDATE DELIBERATELY DOES NOT TOUCH pw_hash / pw_salt / pw_iter. Editing somebody's
    // name must never be able to clear their password, and an upsert that writes every column
    // is exactly how that happens.
    await env.DB.prepare(
      'INSERT INTO brokers (email, name, agency, phone, role, status, created_at)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?)' +
      ' ON CONFLICT(email) DO UPDATE SET' +
      '   name=excluded.name, agency=excluded.agency, phone=excluded.phone,' +
      '   role=excluded.role, status=excluded.status',
    ).bind(email, String(b.name || ''), String(b.agency || ''), String(b.phone || ''), role, status, now).run();

    const row = await getBroker(env, email);
    // A setup link only means anything for somebody who has no password yet.
    const setupUrl = row && !row.pw_hash
      ? new URL(request.url).origin + '/set-password?email=' + encodeURIComponent(email) +
        '&t=' + (await makeSetupToken(env, email, Date.now() + SETUP_HOURS * 3600 * 1000))
      : null;
    return jsonResp({ ok: true, email, setupUrl, setupHours: SETUP_HOURS });
  } catch (err) {
    return jsonResp({ error: String((err && err.message) || err) }, 500);
  }
}

/**
 * ⚠️ Server-side escaping for values interpolated into these pages. Broker name and email are
 * typed by a person, and both reach HTML here.
 */
function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══ F-6 SCREENS ═══════════════════════════════════════════════════════════════

/**
 * THE QUOTE VIEW, AS A REUSABLE COMPONENT — Eric, 2026-07-23: "build the quote view as a
 * reusable component that reskins for ABY vs BenefitLab."
 *
 * ⭐ WHY IT REPLACES A LOGIN RATHER THAN ADDING ONE. ABY is marketed nationally, so many agents
 * will know ABY and not BenefitLab -- and some will only know ABY BECAUSE of BenefitLab. The
 * same quotes therefore have to be reachable under both brands. What varies between them is
 * a wordmark and two colours; what must not vary is the data, the scoping or the columns.
 *
 * ⛔ SO THE MARKUP AND THE SCOPING LIVE HERE, ONCE, and the brand is arguments. The BenefitLab
 * surface renders its own React from `/api/broker-quotes`; this is the ABY-branded surface of
 * the identical rows.
 */
function brokerDashboardHTML(brand) {
  const b = brand || {};
  const name = b.name || 'ABY Benefits';
  const primary = b.primary || '#1a5c3a';
  const accent = b.accent || '#2f9e73';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(name)} — Your quotes</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f5f7f6;color:#1a222c}
header{background:${primary};color:#fff;padding:14px 22px;display:flex;align-items:center;
       justify-content:space-between;gap:14px;flex-wrap:wrap}
header h1{font-size:1.05rem;margin:0;font-weight:600}
header .who{font-size:.85rem;opacity:.85}
header button{background:${accent};color:#fff;border:0;border-radius:999px;padding:7px 14px;
              font:inherit;cursor:pointer}
main{max-width:1100px;margin:0 auto;padding:22px}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.bar input{padding:.5rem .7rem;border:1px solid #d8e0da;border-radius:6px;font:inherit;min-width:240px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;
      box-shadow:0 1px 3px rgba(0,0,0,.08)}
th{text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:#5b6875;
   padding:10px 12px;border-bottom:1px solid #e3e9e5;background:#fafbfa}
td{padding:10px 12px;border-bottom:1px solid #f0f3f1;font-size:.93rem;vertical-align:top}
tr:last-child td{border-bottom:0}
.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:.75rem;font-weight:600}
.p-P{background:#fff4d6;color:#8a6100}
.p-S{background:#dff3e6;color:#1a5c3a}
.p-D{background:#f1f3f4;color:#6b7280}
.empty{background:#fff;border-radius:8px;padding:2.5rem;text-align:center;color:#5b6875}
.wrap{overflow-x:auto}
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(name)} &middot; Your quotes</h1>
  <div style="display:flex;align-items:center;gap:12px">
    <span class="who" id="who"></span>
    <button onclick="signOut()">Sign out</button>
  </div>
</header>
<main>
  <div class="bar"><input id="q" placeholder="Filter by client or quote number" oninput="render()"></div>
  <div id="out" class="empty">Loading your quotes…</div>
</main>
<script>
var ALL=[];
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function money(n){return n==null?'':n;}
function products(json){
  try{var a=JSON.parse(json||'[]');return a.map(function(p){return p.name||p.id;}).filter(Boolean).join(', ');}
  catch(e){return '';}
}
function render(){
  var q=(document.getElementById('q').value||'').trim().toLowerCase();
  var rows=ALL.filter(function(r){
    if(!q)return true;
    return (r.client_name||'').toLowerCase().indexOf(q)>=0 ||
           (r.quote_number||'').toLowerCase().indexOf(q)>=0;
  });
  var out=document.getElementById('out');
  if(!rows.length){
    out.className='empty';
    out.textContent = ALL.length ? 'No quotes match that filter.'
      : 'No quotes yet. Quotes run for you will appear here.';
    return;
  }
  out.className='wrap';
  var html='<table><thead><tr><th>Quote</th><th>Client</th><th>Effective</th>'+
           '<th>Products</th><th>Status</th><th>Run</th></tr></thead><tbody>';
  rows.forEach(function(r){
    var st=(r.status||'P');
    var label={P:'Pending',S:'Sold',D:'Dead'}[st]||st;
    html+='<tr>'+
      '<td class="num">'+esc(r.quote_number)+'</td>'+
      '<td>'+esc(r.client_name)+'</td>'+
      '<td class="num">'+esc(r.effective_date)+'</td>'+
      '<td>'+esc(products(r.products))+'</td>'+
      '<td><span class="pill p-'+esc(st)+'">'+esc(label)+'</span></td>'+
      '<td class="num">'+esc((r.created_at||'').slice(0,10))+'</td>'+
    '</tr>';
  });
  out.innerHTML=html+'</tbody></table>';
}
async function load(){
  var res=await fetch('/api/my/quotes');
  if(res.status===401){location.href='/dashboard';return;}
  var j=await res.json().catch(function(){return {};});
  ALL=(j&&j.quotes)||[];
  document.getElementById('who').textContent=j.email||'';
  render();
}
async function signOut(){await fetch('/api/admin/logout');location.href='/dashboard';}
load();
</script>
</body>
</html>`;
}

/**
 * Where a broker chooses their own password, from a link ABY gave them.
 *
 * ⚠️ THE EMAIL AND TOKEN COME FROM THE URL AND ARE NOT EDITABLE HERE. The token is signed
 * against that exact email, so a typed-over address simply fails -- showing it as a field
 * would invite somebody to try, and the failure would look like a broken link rather than a
 * refusal.
 */
function setPasswordHTML(email, token) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ABY Quotes — Choose a password</title>
<style>
*{box-sizing:border-box}
body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;
     min-height:100vh;margin:0;background:#f0f4f0}
.card{background:#fff;padding:2.5rem;border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,.12);width:380px}
h1{margin:0 0 .25rem;font-size:1.2rem;color:#1a5c3a}
.sub{color:#666;font-size:.875rem;margin:.25rem 0 1.25rem}
.who{font-weight:600}
input{width:100%;padding:.625rem .75rem;border:1px solid #ddd;border-radius:6px;font-size:1rem;
      margin-bottom:.75rem;display:block}
input:focus{outline:none;border-color:#1a5c3a;box-shadow:0 0 0 3px rgba(26,92,58,.15)}
button{width:100%;padding:.65rem;background:#1a5c3a;color:#fff;border:0;border-radius:6px;
       font-size:1rem;cursor:pointer;font-weight:600}
button:disabled{opacity:.6;cursor:default}
.err{color:#c0392b;font-size:.85rem;margin-bottom:.5rem;display:none}
.hint{color:#777;font-size:.8rem;margin:-.4rem 0 .9rem}
</style>
</head>
<body>
<div class="card">
  <h1>Choose a password</h1>
  <p class="sub">for <span class="who">${escapeHtml(email)}</span></p>
  <p class="err" id="err"></p>
  <input type="password" id="p1" placeholder="New password" autocomplete="new-password" autofocus>
  <p class="hint">At least 12 characters.</p>
  <input type="password" id="p2" placeholder="Type it again" autocomplete="new-password">
  <button id="btn" onclick="save()">Save and sign in</button>
</div>
<script>
var EMAIL=${JSON.stringify(email)}, TOKEN=${JSON.stringify(token)};
function fail(m){var e=document.getElementById('err');e.textContent=m;e.style.display='block';
  var b=document.getElementById('btn');b.disabled=false;b.textContent='Save and sign in';}
async function save(){
  var a=document.getElementById('p1').value, b2=document.getElementById('p2').value;
  var btn=document.getElementById('btn');
  if(a!==b2){fail('Those two do not match.');return;}
  if(a.length<12){fail('Please use at least 12 characters.');return;}
  btn.disabled=true; btn.textContent='Saving…';
  var res=await fetch('/api/my/password',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:EMAIL,token:TOKEN,password:a})});
  if(res.ok){location.href='/dashboard';return;}
  var j=await res.json().catch(function(){return {};});
  fail(j.error||'That did not work.');
}
document.getElementById('p2').addEventListener('keydown',function(e){if(e.key==='Enter')save();});
</script>
</body>
</html>`;
}
