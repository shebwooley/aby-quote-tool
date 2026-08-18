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
const SITE_LOCKED = false;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // ── API routes ──────────────────────────────────────────────────────────────
    if (path === '/api/quotes' && method === 'POST')  return handleSaveQuote(request, env, ctx);
    if (path === '/api/quotes' && method === 'GET')   return withAuth(request, env, () => handleListQuotes(request, env));
    // The BenefitLab dashboard's read endpoint (F-268). NOT cookie-authed -- it is a
    // server-to-server call carrying a bearer token, so it gets its own gate.
    if (path === '/api/broker-quotes' && method === 'GET') return handleBrokerQuotes(request, env);

    // ── Broker accounts (F-6). Their own gate: a signed `aby_broker` cookie, NOT the admin one.
    if (path === '/api/broker/signup'  && method === 'POST') return handleBrokerSignup(request, env);
    if (path === '/api/broker/login'   && method === 'POST') return handleBrokerLogin(request, env);
    if (path === '/api/broker/logout'  && method === 'POST') return handleBrokerLogout();
    if (path === '/api/broker/me'      && method === 'GET')  return handleBrokerMe(request, env);
    if (path === '/api/broker/profile' && method === 'POST') return handleBrokerProfile(request, env);
    if (path === '/api/broker/quotes'  && method === 'GET')  return handleBrokerOwnQuotes(request, env);
    // The broker's own page. Public by design -- it IS the sign-in screen; everything behind it
    // is gated per request by the `aby_broker` cookie, not by hiding this route.
    if (path === '/broker' || path === '/broker/') {
      return new Response(brokerPageHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
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
    sourceTag          = '',
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

    // ── The source tag, written SEPARATELY and best-effort (F-347) ──────────────────────────
    //
    // 🔴🔴 IT IS NOT IN THE INSERT ABOVE, AND THAT IS THE WHOLE POINT. `source_tag` is a NEW
    // column. Putting it in the INSERT means that between this deploy and somebody opening
    // /api/migrate, EVERY INSERT REFERENCES A COLUMN THAT DOES NOT EXIST AND FAILS -- and
    // `save-hook.js` swallows failures by design, so the broker gets their quote on screen and
    // nothing is saved. Nobody is told. The site is no longer locked, so real brokers would hit it.
    // ⭐ THAT IS THE EXACT FAILURE F-343 KEPT THE TOOL LOCKED FOR TWELVE DAYS TO AVOID, and the
    // first version of this change walked straight back into it.
    // ▶️ So the quote saves first and the tag is a separate, ignorable write: before the migration
    // it is a no-op, after it the tag lands. No ordering requirement, no window.
    if (sourceTag) {
      try {
        await env.DB.prepare('UPDATE quotes SET source_tag = ? WHERE id = ?')
          .bind(String(sourceTag).slice(0, 40), id).run();
      } catch (err) {
        // No `source_tag` column yet. The quote is already saved, which is what matters.
        console.warn('source_tag not stored (column missing?):', String(err && err.message || err));
      }
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
  const cols = "id, quote_number, created_at, client_name, effective_date, broker_name, broker_agency, broker_phone, broker_email, rep_name, rep_phone, rep_email, commission_included, products, COALESCE(status, 'P') AS status, COALESCE(ran_by, 'broker') AS ran_by, COALESCE(state, 'TX') AS state, adjustment, adjustment_note, client_id, source_tag";

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

// ─── Broker-scoped read: the BenefitLab dashboard's endpoint (F-268) ───────────
//
// GET /api/broker-quotes?email=<broker email>
//   Authorization: Bearer <INTEGRATION_TOKEN>
//   -> { quotes: [ ... ] }
//
// ⭐⭐ THE WHOLE OF F-268 WAS THIS ONE FUNCTION, and the row said otherwise for weeks. It was
// filed as "ABY should send the client id", owned by "Eric / ABY", as though it needed a
// conversation with ABY. Measured 2026-08-18: `client_id` is ALREADY stored on `quotes` and
// already returned to the admin, and the dashboard side is ENTIRELY built -- a panel, its own
// server route holding the token, the matcher, and the renewal-source wiring. All of it was
// calling this path, which did not exist. **The dashboard has been fetching a 404.**
//
// 🔴🔴 IT DOES NOT REUSE `handleListQuotes`'s COLUMN LIST, AND THAT IS THE POINT OF THIS
// FUNCTION EXISTING SEPARATELY. That list includes `adjustment` and `adjustment_note` -- ABY's
// INTERNAL PRICING OVERRIDE. Handing those to a broker would disclose what ABY discounted and by
// how much, on the one surface a broker reads directly. ⛔ Never widen this to `SELECT *`, and
// never "simplify" it by sharing the admin's `cols`.
// ⭐ The fields sent are exactly the ones `AbyQuote` in `benefitlab-dashboard/src/lib/aby-quotes.ts`
// DECLARES. Anything extra would be silently dropped by the consumer while still being disclosed
// over the wire, which is the worst of both.
//
// 🔴 IT FAILS CLOSED. No `INTEGRATION_TOKEN` configured means 503, never "allow" -- an unset
// secret must not become an open endpoint. (Gates fail closed; UIs fail open.)
async function handleBrokerQuotes(request, env) {
  const expected = env.INTEGRATION_TOKEN;
  if (!expected) {
    return jsonResp({ error: 'This endpoint is not configured.' }, 503);
  }
  const auth = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m || !safeEqual(m[1], expected)) {
    return jsonResp({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(request.url);
  const email = (url.searchParams.get('email') || '').trim().toLowerCase();
  // ⛔ NO EMAIL MEANS NO ANSWER, not "every quote". A blank parameter must never widen the scope:
  // matching on '' would return exactly the rows that belong to NOBODY, which still carry employer
  // names. The caller always sends an address; a missing one is a bug worth surfacing.
  if (!email) {
    return jsonResp({ error: 'An email parameter is required.' }, 400);
  }
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '300', 10) || 300, 500);

  // ⚠️ `lower(trim(...))` on the COLUMN, not just the parameter. The address is broker-typed free
  // text, so a stored "Jane@Brokerage.com " and a requested "jane@brokerage.com" are the same
  // broker and an exact match would silently return nothing.
  const cols = "id, quote_number, created_at, client_name, client_id, effective_date, " +
               "broker_name, broker_agency, broker_email, rep_name, products, " +
               "COALESCE(status, 'P') AS status, COALESCE(ran_by, 'broker') AS ran_by, " +
               "COALESCE(state, 'TX') AS state";
  try {
    const result = await env.DB.prepare(
      `SELECT ${cols} FROM quotes WHERE lower(trim(broker_email)) = ? ORDER BY created_at DESC LIMIT ?`
    ).bind(email, limit).all();
    return jsonResp({ quotes: result.results || [] });
  } catch (err) {
    console.error('handleBrokerQuotes failed:', err);
    return jsonResp({ error: String(err) }, 500);
  }
}

// Length-independent compare, so a wrong token cannot be narrowed down by timing. Not the most
// important control here (the token is a long random secret), but it costs three lines.
function safeEqual(a, b) {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
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

// ─── The broker dashboard page (F-6) ───────────────────────────────────────────
//
// ⭐ ABY-BRANDED AND STANDALONE, WHICH IS THE POINT. Eric, 2026-07-23: ABY is marketed nationally,
// so many agents will know ABY and not BenefitLab. This page must make sense to someone who has
// never heard of BenefitLab, and it does not mention it.
function brokerPageHTML() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>My ABY Account</title>
<style>
 *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}
 header{background:#143c73;color:#fff;padding:14px 22px;display:flex;align-items:center;gap:14px}
 header h1{font-size:17px;margin:0;font-weight:600} header .sp{flex:1}
 header a,header button{color:#fff;background:transparent;border:1px solid rgba(255,255,255,.45);border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer;text-decoration:none}
 main{max-width:940px;margin:26px auto;padding:0 18px}
 .card{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:22px;margin-bottom:20px}
 h2{font-size:16px;margin:0 0 4px} .sub{color:#5b6b7f;font-size:13px;margin:0 0 16px}
 label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px}
 input[type=text],input[type=email],input[type=password],input[type=tel]{width:100%;padding:9px 11px;border:1px solid #c8d2de;border-radius:6px;font-size:14px}
 button.primary{background:#143c73;color:#fff;border:0;border-radius:6px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;margin-top:16px}
 .msg{margin-top:12px;padding:10px 12px;border-radius:6px;font-size:13px;display:none}
 .err{background:#fdecec;color:#a12622;border:1px solid #f3c2c2} .ok{background:#e8f4ec;color:#1a5c3a;border:1px solid #b8d9c4}
 table{width:100%;border-collapse:collapse;font-size:14px} th{text-align:left;font-size:12px;text-transform:uppercase;color:#5b6b7f;border-bottom:1px solid #dfe5ec;padding:8px 6px}
 td{padding:9px 6px;border-bottom:1px solid #eef2f6} .muted{color:#8a97a8}
 .tabs{display:flex;gap:8px;margin-bottom:16px} .tabs button{background:#fff;border:1px solid #c8d2de;border-radius:6px;padding:8px 14px;cursor:pointer;font-size:14px}
 .tabs button.on{background:#143c73;color:#fff;border-color:#143c73}
 .logo-prev{max-height:60px;max-width:220px;margin-top:10px;display:none;border:1px solid #dfe5ec;border-radius:6px;padding:6px;background:#fff}
</style></head><body>
<header><h1>ABY Quote Tool</h1><span class="sp"></span>
  <a href="/">New quote</a><button id="out" style="display:none">Sign out</button></header>
<main>
  <div id="authCard" class="card">
    <div class="tabs"><button id="tabIn" class="on">Sign in</button><button id="tabUp">Create an account</button></div>
    <h2 id="authTitle">Sign in</h2>
    <p class="sub" id="authSub">Your details fill in automatically on every quote you run.</p>
    <div id="upOnly" style="display:none">
      <label>Your name</label><input type="text" id="sName" autocomplete="name">
      <label>Agency</label><input type="text" id="sAgency" autocomplete="organization">
      <label>Phone</label><input type="tel" id="sPhone" autocomplete="tel">
    </div>
    <label>Email</label><input type="email" id="sEmail" autocomplete="email">
    <label>Password</label><input type="password" id="sPass" autocomplete="current-password">
    <button class="primary" id="go">Sign in</button>
    <div class="msg err" id="authMsg"></div>
  </div>

  <div id="appArea" style="display:none">
    <div class="card">
      <h2>Your details</h2>
      <p class="sub">Entered once. These fill in automatically every time you run a quote, and your logo appears on the proposal beside ABY's.</p>
      <label>Your name</label><input type="text" id="pName">
      <label>Agency</label><input type="text" id="pAgency">
      <label>Phone</label><input type="tel" id="pPhone">
      <label>Logo <span class="muted" style="font-weight:400">(PNG or JPG, under 300KB)</span></label>
      <input type="file" id="pLogo" accept="image/*">
      <img id="logoPrev" class="logo-prev" alt="Your logo">
      <button class="primary" id="save">Save details</button>
      <div class="msg" id="saveMsg"></div>
    </div>
    <div class="card">
      <h2>Your quotes</h2>
      <p class="sub">Every quote run under your email address.</p>
      <div id="quotes"><p class="muted">Loading…</p></div>
    </div>
  </div>
</main>
<script>
 var $=function(id){return document.getElementById(id)}, mode='in', logoData='';
 function show(el,text,cls){el.textContent=text;el.className='msg '+cls;el.style.display='block'}
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 $('tabIn').onclick=function(){mode='in';$('tabIn').className='on';$('tabUp').className='';$('upOnly').style.display='none';$('authTitle').textContent='Sign in';$('go').textContent='Sign in';$('sPass').autocomplete='current-password';$('authMsg').style.display='none'};
 $('tabUp').onclick=function(){mode='up';$('tabUp').className='on';$('tabIn').className='';$('upOnly').style.display='block';$('authTitle').textContent='Create an account';$('go').textContent='Create account';$('sPass').autocomplete='new-password';$('authMsg').style.display='none'};
 $('go').onclick=async function(){
   var body={email:$('sEmail').value,password:$('sPass').value};
   if(mode==='up'){body.name=$('sName').value;body.agency=$('sAgency').value;body.phone=$('sPhone').value}
   var r=await fetch('/api/broker/'+(mode==='up'?'signup':'login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   var d=await r.json().catch(function(){return{}});
   if(!r.ok){show($('authMsg'),d.error||'Something went wrong.','err');return}
   enter(d.broker);
 };
 $('out').onclick=async function(){await fetch('/api/broker/logout',{method:'POST'});location.reload()};
 $('pLogo').onchange=function(){
   var f=this.files[0]; if(!f) return;
   var rd=new FileReader(); rd.onload=function(){logoData=rd.result;$('logoPrev').src=logoData;$('logoPrev').style.display='block'};
   rd.readAsDataURL(f);
 };
 $('save').onclick=async function(){
   var r=await fetch('/api/broker/profile',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({name:$('pName').value,agency:$('pAgency').value,phone:$('pPhone').value,logoDataUrl:logoData})});
   var d=await r.json().catch(function(){return{}});
   if(!r.ok){show($('saveMsg'),d.error||'Could not save.','err');return}
   show($('saveMsg'),'Saved. These will fill in on your next quote.','ok');
 };
 function enter(b){
   $('authCard').style.display='none';$('appArea').style.display='block';$('out').style.display='inline-block';
   $('pName').value=b.name||'';$('pAgency').value=b.agency||'';$('pPhone').value=b.phone||'';
   if(b.logoDataUrl){logoData=b.logoDataUrl;$('logoPrev').src=logoData;$('logoPrev').style.display='block'}
   loadQuotes();
 }
 async function loadQuotes(){
   var r=await fetch('/api/broker/quotes'); var d=await r.json().catch(function(){return{}});
   var q=(d.quotes)||[];
   if(!q.length){$('quotes').innerHTML='<p class="muted">No quotes yet. Ones you run while signed in will appear here.</p>';return}
   var rows=q.map(function(x){
     return '<tr><td>'+esc((x.created_at||'').slice(0,10))+'</td><td>'+esc(x.client_name||'—')+'</td><td>'+esc(x.quote_number||'')+'</td><td>'+esc(x.state||'')+'</td></tr>';
   }).join('');
   $('quotes').innerHTML='<table><thead><tr><th>Date</th><th>Client</th><th>Quote number</th><th>State</th></tr></thead><tbody>'+rows+'</tbody></table>';
 }
 (async function(){
   var r=await fetch('/api/broker/me'); var d=await r.json().catch(function(){return{}});
   if(d && d.broker) enter(d.broker);
 })();
</script></body></html>`;
}

// ─── Broker account API (F-6) ──────────────────────────────────────────────────

const MAX_LOGO_CHARS = 400000;   // ~300KB of image, generous for a logo and small enough for a row

function brokerPublic(b) {
  return b ? { email: b.email, name: b.name || '', agency: b.agency || '', phone: b.phone || '',
               logoDataUrl: b.logo_data_url || '' } : null;
}

function sessionCookie(value, maxAgeSeconds) {
  return `${BROKER_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

async function handleBrokerSignup(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  // ⛔ Deliberately mild: a length floor and a shape check, not a character-class policy. Composition
  // rules push people towards `Password1!` and this is a quoting tool, not a bank.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonResp({ error: 'Enter a valid email address.' }, 400);
  if (password.length < 10) return jsonResp({ error: 'Use at least 10 characters.' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM brokers WHERE lower(trim(email)) = ?').bind(email).first();
  if (existing) return jsonResp({ error: 'An account already exists for that email. Try signing in.' }, 409);

  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO brokers (id, email, password_hash, name, agency, phone, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(id, email, await hashPassword(password),
    String(body.name || '').slice(0, 120), String(body.agency || '').slice(0, 120),
    String(body.phone || '').slice(0, 40), new Date().toISOString(), new Date().toISOString()).run();

  return new Response(JSON.stringify({ ok: true, broker: brokerPublic({ id, email, name: body.name, agency: body.agency, phone: body.phone }) }),
    { status: 200, headers: { 'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(await makeBrokerToken(id, env), 60 * 60 * 24 * 30) } });
}

async function handleBrokerLogin(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  const row = await env.DB.prepare(
    'SELECT id, email, password_hash, name, agency, phone, logo_data_url FROM brokers WHERE lower(trim(email)) = ?'
  ).bind(email).first();

  // ⚠️ ONE MESSAGE FOR BOTH FAILURES, ON PURPOSE. "No such account" tells a stranger which of ABY's
  // brokers exist, which is a customer list.
  if (!row || !await verifyPassword(String(body.password || ''), row.password_hash)) {
    return jsonResp({ error: 'That email and password do not match.' }, 401);
  }
  await env.DB.prepare('UPDATE brokers SET last_login_at = ? WHERE id = ?').bind(new Date().toISOString(), row.id).run();
  return new Response(JSON.stringify({ ok: true, broker: brokerPublic(row) }),
    { status: 200, headers: { 'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(await makeBrokerToken(row.id, env), 60 * 60 * 24 * 30) } });
}

function handleBrokerLogout() {
  return new Response(JSON.stringify({ ok: true }), { status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie('', 0) } });
}

async function handleBrokerMe(request, env) {
  const b = await currentBroker(request, env);
  return jsonResp({ broker: brokerPublic(b) });
}

/** Save the details that then carry into every quote. This IS the feature Eric asked for. */
async function handleBrokerProfile(request, env) {
  const b = await currentBroker(request, env);
  if (!b) return jsonResp({ error: 'Please sign in.' }, 401);
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }

  const logo = String(body.logoDataUrl || '');
  // ⛔ A data URL, an image, and bounded. An arbitrary string here reaches an <img src> on a
  // document an employer signs.
  if (logo && !/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/.test(logo)) {
    return jsonResp({ error: 'That does not look like an image file.' }, 400);
  }
  if (logo.length > MAX_LOGO_CHARS) return jsonResp({ error: 'That image is too large — please use one under 300KB.' }, 400);

  await env.DB.prepare('UPDATE brokers SET name = ?, agency = ?, phone = ?, logo_data_url = ? WHERE id = ?')
    .bind(String(body.name || '').slice(0, 120), String(body.agency || '').slice(0, 120),
          String(body.phone || '').slice(0, 40), logo, b.id).run();

  const fresh = await env.DB.prepare(
    'SELECT id, email, name, agency, phone, logo_data_url FROM brokers WHERE id = ?').bind(b.id).first();
  return jsonResp({ ok: true, broker: brokerPublic(fresh) });
}

/** The signed-in broker's OWN quotes. Same restricted columns as the dashboard endpoint. */
async function handleBrokerOwnQuotes(request, env) {
  const b = await currentBroker(request, env);
  if (!b) return jsonResp({ error: 'Please sign in.' }, 401);
  // 🔴 SCOPED TO THEIR OWN EMAIL, SERVER-SIDE, FROM THE SIGNED COOKIE -- never from a parameter.
  // ⛔ And the same column list as /api/broker-quotes: no `adjustment`, no `adjustment_note`.
  const cols = "id, quote_number, created_at, client_name, client_id, effective_date, " +
               "broker_name, broker_agency, broker_email, rep_name, products, " +
               "COALESCE(status, 'P') AS status, COALESCE(ran_by, 'broker') AS ran_by, " +
               "COALESCE(state, 'TX') AS state";
  const r = await env.DB.prepare(
    `SELECT ${cols} FROM quotes WHERE lower(trim(broker_email)) = ? ORDER BY created_at DESC LIMIT 300`
  ).bind(String(b.email).trim().toLowerCase()).all();
  return jsonResp({ quotes: r.results || [] });
}

// ─── Broker accounts: passwords and sessions (F-6) ─────────────────────────────
//
// 🔴 A BROKER PASSWORD IS NOT THE ADMIN PASSWORD AND MUST NOT BORROW ITS SCHEME. `makeToken`
// above signs a FIXED string with one shared secret -- fine for "is this the one admin", useless
// for "which of many brokers is this", because every holder would produce the same token.
//
// PBKDF2-SHA256, 100k iterations, a fresh 16-byte salt per account. Stored as `pbkdf2$<iter>$<salt>$<hash>`
// so the parameters travel WITH the hash and can be raised later without invalidating existing
// accounts -- a bare hash with the cost baked into the code is how a password store gets stuck.
const PBKDF2_ITERATIONS = 100000;

function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function unb64(s) { return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); }

async function hashPassword(password, saltBytes) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(bits)}`;
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, iter, salt, hash] = String(stored || '').split('$');
    if (scheme !== 'pbkdf2' || !salt || !hash) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: unb64(salt), iterations: Number(iter) || PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
    return safeEqual(b64(bits), hash);
  } catch { return false; }
}

// A session is `<brokerId>.<hmac>`, signed with the admin password as the server secret.
// ⚠️ THE ID IS SIGNED, NOT ENCRYPTED. It is not a secret -- the point is that a broker cannot
// EDIT it to become another broker, which is what an unsigned cookie would allow.
const BROKER_COOKIE = 'aby_broker';

async function makeBrokerToken(brokerId, env) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(env.ADMIN_PASSWORD || '')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('aby-broker-v1:' + brokerId));
  return brokerId + '.' + b64(sig);
}

/** The signed-in broker's row, or null. Never trusts the id in the cookie without the signature. */
async function currentBroker(request, env) {
  const raw = parseCookies(request.headers.get('Cookie') || '')[BROKER_COOKIE];
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const id = raw.slice(0, dot);
  if (!safeEqual(raw, await makeBrokerToken(id, env))) return null;
  try {
    return await env.DB.prepare(
      'SELECT id, email, name, agency, phone, logo_data_url FROM brokers WHERE id = ?').bind(id).first();
  } catch { return null; }   // table not migrated yet
}

function parseCookies(header) {
  const out = {};
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k.trim()] = rest.join('=').trim();
  }
  return out;
}

// ─── ABY internal door ─────────────────────────────────────────────────────────

// Boolean session check (does NOT block). Used to stamp ran_by on saves.
async function isAuthed(request, env) {
  const cookies = parseCookies(request.headers.get('Cookie') || '');
  const token = cookies[COOKIE_NAME];
  return !!(token && await verifyToken(token, env.ADMIN_PASSWORD));
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

// ─── The migration, as DATA ─────────────────────────────────────────────────────
//
// 🔴🔴 EACH ENTRY CARRIES BOTH THE STATEMENT AND HOW TO PROVE IT LANDED, IN ONE PLACE, ON PURPOSE.
// A second list of "things to check afterwards" would drift from this one the first time somebody
// added a column and forgot the other half -- and the whole point of F-357 is that a migration
// which cannot prove itself is indistinguishable from one that did not run.
const MIGRATIONS = [
  { sql: "ALTER TABLE quotes ADD COLUMN ran_by TEXT",           table: "quotes", column: "ran_by" },
  { sql: "ALTER TABLE quotes ADD COLUMN state TEXT",            table: "quotes", column: "state" },
  { sql: "ALTER TABLE quotes ADD COLUMN adjustment TEXT",       table: "quotes", column: "adjustment" },
  { sql: "ALTER TABLE quotes ADD COLUMN adjustment_note TEXT",  table: "quotes", column: "adjustment_note" },
  // Added 2026-08-06. `client_id` is the BenefitLab client this quote is for, so a quote
  // no longer has to be matched to an employer by a TYPED company name (F-268).
  { sql: "ALTER TABLE quotes ADD COLUMN client_id TEXT",        table: "quotes", column: "client_id" },
  // `source_tag` is F-347: WHICH SHARED LINK a quote came in on, from `?src=`. Eric approved it
  // as "not sure yet, build it anyway, it's cheap". ⚠️ It is a HINT, not an identity -- a tag
  // lives in a URL and URLs get copied, so a forwarded link attributes the wrong broker. `ran_by`
  // (server-side) and `client_id` (handed over deliberately) are the fields that mean something.
  { sql: "ALTER TABLE quotes ADD COLUMN source_tag TEXT",       table: "quotes", column: "source_tag" },
  // `revision` implements Eric's decision: re-running a saved quote keeps its number and
  // becomes revision 2, rather than minting a new number (F-339).
  { sql: "ALTER TABLE quotes ADD COLUMN revision INTEGER DEFAULT 1", table: "quotes", column: "revision" },
  // The quote number is the only human-readable identity the tool has, and `commitments`
  // join employers' signed authorisations to it -- so it must not be issuable twice.
  // SAFE TO ADD: measured in D1 on 2026-08-06, 45 quotes / 45 distinct numbers.
  //
  // 🔴 THIS IS THE ONE STATEMENT HERE THAT CAN GENUINELY FAIL ON DATA. `IF NOT EXISTS` only
  // suppresses "this index already exists"; a UNIQUE index still ABORTS if two rows share a
  // quote_number. So it is the statement most worth reporting on, and the one the old
  // swallow-everything loop hid most completely.
  { sql: "CREATE UNIQUE INDEX IF NOT EXISTS quotes_quote_number_unique ON quotes (quote_number)",
    index: "quotes_quote_number_unique" },
  // Added 2026-08-06 (F-345). The employer's signed authorization had no broker on it at
  // all; `broker_email` is stored on the row so the answer survives even if the quote it
  // came from is ever renumbered, and `client_id` is the BenefitLab employer.
  // ⭐ Denormalised ON PURPOSE rather than joined: a commitment is a RECORD OF SOMETHING
  // SOMEBODY SIGNED, and it should not be able to change its meaning because a row it
  // points at changed later.
  { sql: "ALTER TABLE commitments ADD COLUMN client_id TEXT",    table: "commitments", column: "client_id" },
  { sql: "ALTER TABLE commitments ADD COLUMN broker_email TEXT", table: "commitments", column: "broker_email" },

  // ── Broker accounts (F-6 / F-53) ────────────────────────────────────────────────────────────
  //
  // ⭐⭐ ERIC CHOSE OPTION (a), 2026-08-18: a SEPARATE ABY login, joined to BenefitLab BY EMAIL.
  // "We can go with a. Yes, we would need brokers who are using the ABY dashboard instead of
  // BenefitLab to upload their logo and input their contact info there once and have it carry to
  // the quote."
  //
  // 🔴 WHO THIS IS FOR, AND WHO IT IS NOT FOR. A broker who comes from the BenefitLab dashboard
  // ALREADY has their name, agency, phone, email and agency logo carried in on the `?rerun=`
  // payload -- verified live 2026-08-18. ⛔ THEY DO NOT NEED AN ABY ACCOUNT AND MUST NOT BE PUSHED
  // TOWARDS ONE. This table exists for the ABY-ONLY broker, who today retypes everything into
  // every quote and gets no logo at all.
  //
  // ⭐ EMAIL IS THE JOIN, WHICH IS WHY IT IS UNIQUE AND STORED LOWERCASE. `quotes.broker_email`
  // already carries it, so an ABY-only broker who later signs up for BenefitLab gets their whole
  // history with no migration and nobody doing anything. That property is the reason (a) was
  // chosen over SSO or a shared account system.
  //
  // ⚠️ `logo_data_url` HOLDS THE IMAGE ITSELF, not a link. The tool has no object storage, and the
  // quote form already turns an uploaded file into a data URL client-side, so this stores what the
  // renderer already knows how to draw. A link would rot; ABY cannot host the broker's file.
  { sql: "CREATE TABLE IF NOT EXISTS brokers (" +
         "  id TEXT PRIMARY KEY," +
         "  email TEXT NOT NULL," +
         "  password_hash TEXT NOT NULL," +
         "  name TEXT, agency TEXT, phone TEXT," +
         "  logo_data_url TEXT," +
         "  created_at TEXT, last_login_at TEXT)",
    table: "brokers", column: "email" },
  // 🔴 UNIQUE, AND IT CAN GENUINELY FAIL ON DATA the way the quote_number index can: two accounts
  // on one address would make "show me my quotes" ambiguous, and the email IS the identity here.
  { sql: "CREATE UNIQUE INDEX IF NOT EXISTS brokers_email_unique ON brokers (lower(trim(email)))",
    index: "brokers_email_unique" },
];

// Does this column resolve? A plain SELECT is used rather than PRAGMA table_info because column
// resolution happens at PREPARE time, so the probe answers even on an empty table, and its failure
// message names the exact problem ("no such column" vs "no such table").
// ⚠️ Deliberately NOT reused for the index: an index is invisible to a SELECT.
async function columnExists(env, table, column) {
  try {
    await env.DB.prepare(`SELECT "${column}" FROM "${table}" LIMIT 1`).all();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

async function indexExists(env, name) {
  try {
    const r = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?"
    ).bind(name).all();
    return { ok: Boolean(r && r.results && r.results.length) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// Idempotent migration: add attribution columns if they do not exist yet.
//
// 🔴🔴 WHY THIS REPORTS THE WAY IT DOES (F-357, 2026-08-12). It used to run every statement inside
// its own `try { } catch { /* ignore */ }` and then return `{ ok: true, applied }` no matter what.
// Three completely different outcomes -- "I added it", "it was already there", "it FAILED" -- came
// back as one word, and a real failure was reported as success.
//
// ⭐⭐ THAT IS NOT HYPOTHETICAL AND IT COST A DAY AND A HALF. On 2026-08-11 the migration was run
// and `client_id` demonstrably landed (the admin quote log went from `D1_ERROR: no such column:
// client_id` to rendering). Nothing could say whether the four statements AFTER it landed, and two
// of those are the columns Change H writes -- on a path where a failed write is swallowed too. So
// "did the migration run" stayed genuinely unanswerable while the response said `ok: true`.
//
// ⭐ THE VERDICT IS READ BACK OFF THE SCHEMA, NOT INFERRED FROM THE STATEMENT'S OWN RESULT. That is
// the same rule the `client_id` half was eventually settled by: verify on the thing that needed the
// change, never on the change's own report of itself. It also means a column added by hand, or by
// an earlier run, verifies correctly -- `already` and `applied` are both fine, only `failed` is not.
async function handleMigrate(env) {
  const statements = [];

  for (const m of MIGRATIONS) {
    try {
      await env.DB.prepare(m.sql).run();
      statements.push({ sql: m.sql, result: "applied" });
    } catch (e) {
      const msg = String((e && e.message) || e);
      // "duplicate column name: x" is SQLite saying the migration already ran. It is the ONLY
      // benign failure here, so it is the only one matched by name -- anything else is reported
      // as a failure with its message, rather than being assumed harmless.
      const benign = /duplicate column name/i.test(msg) || /already exists/i.test(msg);
      statements.push({ sql: m.sql, result: benign ? "already" : "failed", error: msg });
    }
  }

  // ── Now prove it, against the schema ────────────────────────────────────────
  const verified = [];
  for (const m of MIGRATIONS) {
    if (m.index) {
      const r = await indexExists(env, m.index);
      verified.push({ what: `index ${m.index}`, present: r.ok, ...(r.error ? { error: r.error } : {}) });
    } else {
      const r = await columnExists(env, m.table, m.column);
      verified.push({ what: `${m.table}.${m.column}`, present: r.ok, ...(r.error ? { error: r.error } : {}) });
    }
  }

  const missing = verified.filter((v) => !v.present).map((v) => v.what);

  // ⚠️ `ok` NOW MEANS "every object this migration is responsible for is present", which is the
  // question anybody opening this URL is actually asking. It used to be the constant `true`.
  // Nothing calls this endpoint programmatically (grep: one route, no callers) -- it is opened by
  // a human in a browser -- so tightening the meaning breaks nothing.
  return jsonResp({
    ok: missing.length === 0,
    missing,
    verified,
    statements,
    // Kept so an older eye still finds what it is looking for in the same payload.
    applied: statements.filter((s) => s.result === "applied").map((s) => s.sql),
  });
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
      // F-347. Shown only when there IS one, because a "Source —" line on every quote that ever
      // came in through the plain link is noise on the row a reader is trying to scan.
      (q.source_tag
        ? '<div class="detail-item"><label>Link source</label><span>' + esc(q.source_tag) + '</span></div>'
        : '') +
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

// ─── Internal overlay source (served at /internal/aby.js to ABY sessions only) ──
const ABY_INTERNAL_JS = `
(function () {
  'use strict';
  if (!window.ABYQuote || !window.ABYQuote.engine) return;

  // States ABY can quote. Add a state here once its pricing is provisioned.
  var STATES = [{ code: 'TX', name: 'Texas' }, { code: 'OUTSIDE', name: 'Outside Texas' }];

  window.ABY_STATE = 'TX';
  window.ABY_ADJUSTMENT = null;   // { mode:'percent'|'flat', amount:Number, scope:'all'|productId }
  window.ABY_ADJ_NOTE = '';

  // 1) Route state + override through BOTH the preview and the downloaded file.
  var origCalcAll = window.ABYQuote.engine.calculateAll;
  window.ABYQuote.engine.calculateAll = function (selections, commissioned, state) {
    var st = window.ABY_STATE || state || 'TX';
    var results = origCalcAll.call(this, selections, commissioned, st);
    if (window.ABY_ADJUSTMENT) {
      results = (window.ABY_ADJUSTMENT.mode === 'set')
        ? applySetPrice(results, window.ABY_ADJUSTMENT)
        : window.ABYQuote.engine.applyAdjustment(results, window.ABY_ADJUSTMENT);
    }
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
          b.adjustmentNote = describeOverride(window.ABY_ADJUSTMENT) +
            (window.ABY_ADJ_NOTE ? (' — ' + window.ABY_ADJ_NOTE) : '');
        }
        init.body = JSON.stringify(b);
      }
    } catch (e) {}
    return origFetch.apply(this, arguments);
  };

  // ── Typed price override (Eric, 2026-08-18: "I'd like for us to be able to just
  // enter a price") ──────────────────────────────────────────────────────────────
  // Percent and flat SHIFT the computed price; this REPLACES it. Any box left blank
  // is untouched, so ABY can set one figure without disturbing the rest.
  // ⛔ Lives here rather than in engine.applyAdjustment because engine.js is not part
  // of this change set, and patching it from the stale local clone would be a diff
  // against the wrong base.
  var SET_FIELDS = [
    { key: 'setupFee',   input: 'abySetSetup',   label: 'Setup' },
    { key: 'renewalFee', input: 'abySetRenewal', label: 'Renewal' },
    { key: 'annualFee',  input: 'abySetAnnual',  label: 'Annual' }
  ];

  function applySetPrice(results, adj) {
    var p = adj.prices || {};
    return results.map(function (r) {
      if (adj.scope !== 'all' && adj.scope !== r.productId) return r;
      var copy = JSON.parse(JSON.stringify(r));
      SET_FIELDS.forEach(function (f) {
        var v = p[f.key];
        if (v == null || isNaN(v)) return;
        if (!copy[f.key]) copy[f.key] = { label: f.label + ' Fee' };
        copy[f.key].amount = v;
        copy[f.key].adjusted = true;
      });
      if (p.monthlyFee != null && !isNaN(p.monthlyFee) && copy.monthlyFee) {
        copy.monthlyFee.amount = p.monthlyFee;
        copy.monthlyFee.breakdown = money(p.monthlyFee) + ' per month (agreed price)';
        copy.monthlyFee.adjusted = true;
        // The tier no longer describes what is being charged, so stop printing it.
        copy.monthlyFee.tierLabel = '';
      }
      copy.adjusted = true;
      return copy;
    });
  }

  function describeOverride(adj) {
    if (!adj) return '';
    if (adj.mode !== 'set') return window.ABYQuote.engine.describeAdjustment(adj);
    var scope = (!adj.scope || adj.scope === 'all') ? 'all products' : adj.scope;
    var parts = [];
    SET_FIELDS.forEach(function (f) {
      var v = (adj.prices || {})[f.key];
      if (v != null && !isNaN(v)) parts.push(f.label + ' ' + money(v));
    });
    var m = (adj.prices || {}).monthlyFee;
    if (m != null && !isNaN(m)) parts.push('Monthly ' + money(m));
    return parts.length ? ('Price set on ' + scope + ': ' + parts.join(', ')) : '';
  }

  function money(n) { return (n < 0 ? '-$' : '$') + Math.abs(n); }

  function recompute(panel) {
    var mode = panel.querySelector('#abyMode').value;
    var amtEl = panel.querySelector('#abyAmt');
    var amt = parseFloat(amtEl.value);
    var scope = panel.querySelector('#abyScope').value;
    window.ABY_STATE = panel.querySelector('#abyState').value || 'TX';
    window.ABY_ADJ_NOTE = panel.querySelector('#abyNote').value || '';
    var summary = panel.querySelector('#abySummary');
    var setRow = panel.querySelector('#abySetRow');
    setRow.style.display = (mode === 'set') ? 'flex' : 'none';
    amtEl.parentNode.style.display = (mode === 'set') ? 'none' : '';

    // 'set' is not driven by #abyAmt, so it must be handled BEFORE the isNaN(amt)
    // guard below -- otherwise an empty Amount box would silently clear a typed price.
    if (mode === 'set') {
      var prices = {};
      SET_FIELDS.forEach(function (f) {
        var v = parseFloat(panel.querySelector('#' + f.input).value);
        if (!isNaN(v)) prices[f.key] = v;
      });
      var mv = parseFloat(panel.querySelector('#abySetMonthly').value);
      if (!isNaN(mv)) prices.monthlyFee = mv;
      if (!Object.keys(prices).length) {
        window.ABY_ADJUSTMENT = null;
        summary.textContent = 'Set price selected, but no price typed yet. State: ' + window.ABY_STATE + '.';
        return;
      }
      window.ABY_ADJUSTMENT = { mode: 'set', scope: scope, prices: prices };
      summary.textContent = 'Applied: ' + describeOverride(window.ABY_ADJUSTMENT) +
        '. State: ' + window.ABY_STATE + '. Re-generate the quote to apply.';
      return;
    }

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
        '<label style="font-size:12px;color:#143c73;">Override<br><select id="abyMode" style="padding:6px;"><option value="none">None</option><option value="percent">Percent (%)</option><option value="flat">Flat ($)</option><option value="set">Set price ($)</option></select></label>' +
        '<label style="font-size:12px;color:#143c73;">Amount<br><input id="abyAmt" type="number" step="0.01" placeholder="e.g. 10 or -15" style="padding:6px;width:130px;"></label>' +
        '<label style="font-size:12px;color:#143c73;">Applies to<br><select id="abyScope" style="padding:6px;min-width:150px;">' + scopeOpts + '</select></label>' +
        '<label style="font-size:12px;color:#143c73;flex:1;min-width:180px;">Reason (internal note)<br><input id="abyNote" type="text" placeholder="e.g. DFW regional / ABC brokerage discount" style="padding:6px;width:100%;box-sizing:border-box;"></label>' +
      '</div>' +
      '<div id="abySetRow" style="display:none;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-top:12px;padding-top:12px;border-top:1px dashed #a9c2e0;">' +
        '<span style="font-size:12px;color:#143c73;width:100%;">Type the agreed price. Any box left blank keeps the standard price.</span>' +
        '<label style="font-size:12px;color:#143c73;">Setup<br><input id="abySetSetup" type="number" step="0.01" min="0" placeholder="unchanged" style="padding:6px;width:120px;"></label>' +
        '<label style="font-size:12px;color:#143c73;">Renewal<br><input id="abySetRenewal" type="number" step="0.01" min="0" placeholder="unchanged" style="padding:6px;width:120px;"></label>' +
        '<label style="font-size:12px;color:#143c73;">Annual<br><input id="abySetAnnual" type="number" step="0.01" min="0" placeholder="unchanged" style="padding:6px;width:120px;"></label>' +
        '<label style="font-size:12px;color:#143c73;">Monthly admin<br><input id="abySetMonthly" type="number" step="0.01" min="0" placeholder="unchanged" style="padding:6px;width:130px;"></label>' +
      '</div>' +
      '<div id="abySummary" style="margin-top:10px;font-size:12.5px;color:#143c73;font-weight:bold;"></div>';

    if (host === form && form.parentNode) form.parentNode.insertBefore(panel, form);
    else host.insertBefore(panel, host.firstChild);

    ['abyState', 'abyMode', 'abyAmt', 'abyScope', 'abyNote',
     'abySetSetup', 'abySetRenewal', 'abySetAnnual', 'abySetMonthly'].forEach(function (id) {
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
