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
    if (path === '/api/broker/forgot'   && method === 'POST') return handleForgotPassword(request, env);
    if (path === '/api/broker/set-password' && method === 'POST') return handleSetPassword(request, env);
    if (path === '/api/agency/invite'   && method === 'POST') return handleAgencyInvite(request, env);
    if (path === '/api/agency/settings' && method === 'POST') return handleAgencySettings(request, env);
    if (path === '/api/agency/quotes'   && method === 'GET')  return handleAgencyQuotes(request, env);
    if (path === '/api/agency/me'       && method === 'GET')  return handleAgencyMe(request, env);
    if (path === '/api/agency/role'     && method === 'POST') return handleAgencyRole(request, env);
    // ABY's own admin views (Eric, 2026-08-18). Admin-gated, not broker-gated.
    if (path === '/api/admin/brokers' && method === 'GET')  return withAuth(request, env, () => handleAdminBrokers(request, env));
    if (path === '/api/admin/assign'  && method === 'POST') return withAuth(request, env, () => handleAdminAssign(request, env));
    if (path === '/api/admin/stats'   && method === 'GET')  return withAuth(request, env, () => handleAdminStats(request, env));
    if (path === '/api/admin/pipeline' && method === 'GET')  return withAuth(request, env, () => handleAdminPipeline(request, env));
    if (path === '/api/admin/prospects' && method === 'POST') return withAuth(request, env, () => handleAdminAddProspects(request, env));
    if (path === '/api/admin/rate'     && method === 'POST') return withAuth(request, env, () => handleAdminRate(request, env));
    // Referral partners (F-referrals, Eric 2026-08-19)
    if (path === '/api/admin/referrals' && method === 'GET')  return withAuth(request, env, () => handleAdminReferrals(request, env));
    if (path === '/api/admin/referral-partner' && method === 'POST') return withAuth(request, env, () => handleReferralPartner(request, env));
    if (path === '/api/admin/referral-contact' && method === 'POST') return withAuth(request, env, () => handleReferralContact(request, env));
    if (path === '/api/admin/broker-referral'  && method === 'POST') return withAuth(request, env, () => handleBrokerReferral(request, env));
    if (path === '/api/admin/quote'    && method === 'POST') return withAuth(request, env, () => handleAdminAddQuote(request, env));
    if (/^\/api\/quotes\/[^/]+\/note$/.test(path) && method === 'POST') {
      return withAuth(request, env, () => handleQuoteNote(request, path.split('/')[3], env));
    }
    // Correcting the employer / broker details on a saved quote. Admin only, same as the note.
    if (/^\/api\/quotes\/[^/]+\/edit$/.test(path) && method === 'POST') {
      return withAuth(request, env, () => handleQuoteEdit(request, path.split('/')[3], env));
    }
    // The broker's own page. Public by design -- it IS the sign-in screen; everything behind it
    // is gated per request by the `aby_broker` cookie, not by hiding this route.
    if (path === '/broker/set-password') {
      return new Response(setPasswordPageHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
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
    if (path === '/api/commitments' && method === 'POST') return handleSaveCommitment(request, env, ctx);
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
    if (path === '/admin/pipeline') {
      return withAuth(request, env, () => new Response(adminPipelineHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
    }
    if (path === '/admin/brokers') {
      return withAuth(request, env, () => new Response(adminBrokersHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
    }
    if (path === '/admin/referrals') {
      return withAuth(request, env, () => new Response(adminReferralsHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
    }
    if (path === '/admin/rates') {
      return withAuth(request, env, () => new Response(adminRatesHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
    }
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
    firstYearValue     = null,
    employeeCount      = null,
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
    // Value and headcount ride the same best-effort path as the source tag, and for the same
    // reason: they are newer columns than the INSERT above, and a quote must save whether or not
    // the migration has run.
    try {
      await env.DB.prepare('UPDATE quotes SET first_year_value = ?, employee_count = ? WHERE id = ?')
        .bind(Number(firstYearValue) || null, Number(employeeCount) || null, id).run();
    } catch (err) {
      console.warn('value/headcount not stored (columns missing?):', String(err && err.message || err));
    }

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
  const cols = "id, quote_number, created_at, client_name, effective_date, broker_name, broker_agency, broker_phone, broker_email, rep_name, rep_phone, rep_email, commission_included, products, COALESCE(status, 'P') AS status, COALESCE(ran_by, 'broker') AS ran_by, COALESCE(state, 'TX') AS state, adjustment, adjustment_note, client_id, source_tag, notes";

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
    // 🔴🔴 THE TOTAL TRAVELS WITH THE PAGE, because the page used to count what it RECEIVED and
    // print that as the answer. At 372 quotes the cap of 300 was invisible; at 1,795 the screen
    // said "300 quotes" about a book more than five times that size -- a wrong number, stated
    // plainly, of exactly the kind that gets repeated. The count is now the count of what MATCHES,
    // and the page says how many of them it is showing.
    const totalRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM quotes ${whereSql}`
    ).bind(...args).first();
    return jsonResp({ quotes: result.results || [], total: (totalRow && totalRow.n) || 0,
                      limit: limit, offset: offset });
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
  // 'I' = IN PROCESS: the employer has signed and is buying, but nothing has been received.
  // ⛔ It had to be added HERE as well as in the commitment handler -- that one writes the
  // value straight to the database, so without this an admin could see the status and never
  // be able to set it back.
  if (!['P', 'I', 'S', 'D'].includes(status)) {
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

async function handleSaveCommitment(request, env, ctx) {
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

    // ── The two things a signature should DO, added 2026-08-18 ──────────────────────────────
    //
    // Both are deliberately AFTER the insert and individually wrapped: the employer has already
    // signed, and neither a status update nor an email is worth losing that record over.

    // ① Move the quote out of Pending. 'I' = in process: they are buying, nothing has been
    // received yet. Eric's distinction, and it keeps 'S' meaning money.
    try {
      await env.DB.prepare(
        "UPDATE quotes SET status = 'I', committed_at = ? WHERE quote_number = ? AND COALESCE(status,'P') = 'P'"
      ).bind(now, quoteNumber).run();
    } catch (err) {
      console.error('commitment: could not update quote status:', err);
    }

    // ② Tell ABY. Until 2026-08-18 a signed authorization emailed NOBODY -- it landed in the
    // database and waited for somebody to look, which made the strongest buying signal in the
    // system its quietest event.
    try {
      ctx && ctx.waitUntil
        ? ctx.waitUntil(sendCommitmentEmail(env, { quoteNumber, employerName, authSigner, authEmail, authPhone, brokerEmail, products, origin: new URL(request.url).origin }))
        : await sendCommitmentEmail(env, { quoteNumber, employerName, authSigner, authEmail, authPhone, brokerEmail, products, origin: new URL(request.url).origin });
    } catch (err) {
      console.error('commitment: could not send email:', err);
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

/**
 * Which of these people already have a BenefitLab BROKER account?
 *
 * ⭐ Answers Eric's question, 2026-08-18: "the ones with an ABY or BenefitLab account (and the
 * ability to easily quote) should also be noted." ABY knows its OWN accounts for free; this is the
 * other half.
 *
 * 🔴🔴 IT RETURNS `null` — NOT `false` — WHEN IT CANNOT ASK. A broker wrongly shown as having no
 * BenefitLab account is exactly the kind of wrong that prompts a pointless sales call, so an
 * unreachable dashboard, a missing token or a bad response must read as UNKNOWN on the screen.
 * ⛔ Never let a failure collapse into "no".
 *
 * ⚠️ This is ABY's only outbound dependency. It is deliberately best-effort: the pipeline renders
 * fully without it, with one column saying "unknown".
 */
async function benefitlabAccounts(env, emails) {
  const base = env.BENEFITLAB_URL, token = env.ABY_INTEGRATION_TOKEN;
  if (!base || !token || !emails.length) return null;
  try {
    const res = await fetch(base.replace(/\/$/, '') + '/api/aby/account-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ emails }),
    });
    if (!res.ok) { console.warn('account-check returned', res.status); return null; }
    const d = await res.json();
    return (d && d.accounts && typeof d.accounts === 'object') ? d.accounts : null;
  } catch (err) {
    console.warn('account-check unreachable:', String(err && err.message || err));
    return null;
  }
}

/**
 * Tell ABY that an employer has signed.
 *
 * 🔴 RECIPIENTS COME FROM `NOTIFY_EMAILS`, NOT FROM A HARDCODED ADDRESS. The quote email has
 * `eric@comedyce.com` baked into it, which Eric explains was deliberate while testing -- "I didn't
 * want to annoy Niels" -- and is due to become both work addresses in about a week. ⭐ A comma-
 * separated secret means that switch is a one-line change with no deploy, and Niels starts hearing
 * about his own quotes the moment it is set.
 */
async function sendCommitmentEmail(env, c) {
  if (!env.RESEND_API_KEY) { console.warn('RESEND_API_KEY not set -- commitment email skipped'); return; }
  const to = String(env.NOTIFY_EMAILS || 'eric@comedyce.com')
    .split(',').map((x) => x.trim()).filter(Boolean);
  if (!to.length) return;

  const lines = (Array.isArray(c.products) ? c.products : []).map((p) => `<li>${esc(String(p))}</li>`).join('');
  const html =
    `<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#12263f">` +
    `<p><strong>${esc(c.employerName || 'An employer')}</strong> has signed the authorization on quote ` +
    `<strong>${esc(c.quoteNumber || '')}</strong>.</p>` +
    (lines ? `<p>Services authorized:</p><ul>${lines}</ul>` : '') +
    `<p><strong>Signed by:</strong> ${esc(c.authSigner || '\u2014')}` +
    (c.authEmail ? ` &middot; ${esc(c.authEmail)}` : '') +
    (c.authPhone ? ` &middot; ${esc(c.authPhone)}` : '') + `</p>` +
    (c.brokerEmail ? `<p><strong>Broker:</strong> ${esc(c.brokerEmail)}</p>` : '') +
    `<p style="color:#5b6b7f;font-size:13px">The quote is now marked <strong>In process</strong>. ` +
    `Mark it Sold once the paperwork is in.</p>` +
    `<p><a href="${esc(c.origin || '')}/admin" style="background:#143c73;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Open the quote log</a></p></div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `ABY Quote Tool <${env.FROM_EMAIL || 'onboarding@resend.dev'}>`,
        to, subject: `Authorization signed: ${c.employerName || 'employer'} (${c.quoteNumber || ''})`, html }),
    });
    if (!res.ok) console.error('commitment email failed:', res.status, await res.text());
  } catch (err) { console.error('commitment email threw:', err); }
}

/**
 * Correct the identity fields on one quote. Admin only.
 *
 * Eric, 2026-08-18: "I thought you told me we would be able to edit the rows in the ABY admin
 * (like add a broker name or correct an employer name). That doesn't appear to be the case."
 * ⛔ HE WAS RIGHT -- only status and notes were writable. Everything else on a quote row was
 * whatever was typed when it was saved, permanently.
 *
 * 🔴 IT IS NEEDED MOST EXACTLY WHERE THE DATA IS WORST: the 2026 import brought in 321 rows, of
 * which 41 have NO employer name ("(not stated)") and one agency is spelled "Baldwin Grouup".
 * Those were imported as-is on purpose -- but "imported as-is" is only defensible if there is a
 * way to fix them afterwards, and there was not.
 *
 * ⭐ THE FIELD LIST IS A WHITELIST, NOT A LOOP OVER THE BODY. A generic "update whatever was
 * sent" would let this endpoint write `status`, `first_year_value`, `source_tag` or `client_id`
 * -- fields that other code DERIVES and that a person editing a name must not be able to reach.
 */
const QUOTE_EDITABLE = ['client_name', 'broker_name', 'broker_agency', 'broker_email', 'broker_phone'];

async function handleQuoteEdit(request, id, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }

  const sets = [], vals = [];
  for (const col of QUOTE_EDITABLE) {
    if (!(col in body)) continue;                       // absent means "leave it", never "clear it"
    let v = String(body[col] == null ? '' : body[col]).trim().slice(0, 200);
    // 🔴 EMAIL IS THE JOIN KEY, so it is normalised here the same way every other write, lookup
    // and join in this file normalises it. A broker's book is assembled by
    // lower(trim(broker_email)); one row saved as "Jane@Agency.com " and the next as
    // "jane@agency.com" splits one person in half with nothing in any log.
    if (col === 'broker_email') v = v.toLowerCase();
    sets.push(col + ' = ?');
    vals.push(v);
  }
  if (!sets.length) return jsonResp({ error: 'Nothing to change.' }, 400);

  try {
    vals.push(id);
    await env.DB.prepare('UPDATE quotes SET ' + sets.join(', ') + ' WHERE id = ?').bind(...vals).run();
    // ⚠️ Read it BACK and return it. An UPDATE that matched nothing reports success (TRAPS #95),
    // and the screen re-renders from what this returns, so a silent no-op would leave the edited
    // value sitting on screen looking saved.
    const back = await env.DB.prepare(
      'SELECT client_name, broker_name, broker_agency, broker_email FROM quotes WHERE id = ?'
    ).bind(id).first();
    if (!back) return jsonResp({ error: 'That quote no longer exists.' }, 404);
    return jsonResp({ ok: true, quote: back });
  } catch (err) {
    return jsonResp({ error: String(err && err.message || err) }, 500);
  }
}

/** Save a note against one quote. Admin only, like everything else on that screen. */
async function handleQuoteNote(request, id, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const notes = String(body.notes == null ? '' : body.notes).slice(0, 4000);
  try {
    await env.DB.prepare('UPDATE quotes SET notes = ? WHERE id = ?').bind(notes, id).run();
    // ⚠️ Assert the row was actually there. An UPDATE that matched nothing reports success, and a
    // note the user watched save but which went nowhere is worse than a visible failure.
    const back = await env.DB.prepare('SELECT notes FROM quotes WHERE id = ?').bind(id).first();
    if (!back) return jsonResp({ error: 'That quote no longer exists.' }, 404);
    return jsonResp({ ok: true, notes: back.notes || '' });
  } catch (err) {
    return jsonResp({ error: String(err && err.message || err) }, 500);
  }
}

/**
 * Log a quote that never went through the tool.
 *
 * ⭐ ERIC, 2026-08-18: "groups that agents reach out to us about and we just put the rates in an
 * email rather than running an official quote. We will likely want to track these opportunities so
 * we know to circle back on them."
 *
 * ⭐⭐ THERE ARE NOW THREE ORIGINS AND `source_tag` KEEPS THEM APART:
 *   (blank)       -- produced by the tool
 *   import-2026   -- history loaded from the spreadsheet
 *   manual        -- rates emailed, logged here
 * 🔴 THAT SEPARATION IS THE POINT. The moment anybody asks "how much is the quoting tool actually
 * being used?", the answer must not be inflated by history and hand-entered rows. A count that
 * cannot tell them apart quietly overstates adoption forever.
 *
 * ⚠️ VALUE IS OPTIONAL AND STAYS NULL WHEN UNKNOWN. Eric was clear that a minimum-billing figure
 * would be worse than a blank, because a floor stops looking like a guess the moment it is stored.
 */
async function handleAdminAddQuote(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const employer = String(body.employer || '').trim().slice(0, 160);
  if (!employer) return jsonResp({ error: 'Which employer?' }, 400);

  const agency = String(body.agency || '').trim().slice(0, 160);
  const when = String(body.quotedOn || '').trim() || new Date().toISOString().slice(0, 10);
  const rep = String(body.rep || '').trim().toLowerCase();
  const status = ['P', 'I', 'S', 'D'].includes(String(body.status || 'P')) ? String(body.status || 'P') : 'P';

  // Product ids arrive as the tool's own vocabulary, so a manual row filters and reports exactly
  // like a generated one.
  const ids = Array.isArray(body.products) ? body.products.slice(0, 20) : [];
  const products = JSON.stringify(ids.map((id) => ({ id: String(id), name: String(id).replace(/^product-/, ''), inputs: {} })));

  const value = Number(body.firstYearValue);
  const heads = Number(body.employeeCount);

  // Legible and unique. `MAN` marks the origin in the number itself, so it is obvious in a list
  // even before anybody looks at a column.
  const key = employer.replace(/[^A-Za-z0-9]/g, '').slice(0, 14).toUpperCase() || 'UNKNOWN';
  // ⭐ THE SAME SHAPE AS A REAL QUOTE NUMBER -- STATE + YYMMDD - block - C/NC. Eric on the imported
  // format: "I absolutely hate the quote number format... Can we not follow the same format as new
  // quotes? Maybe add something to represent Manual." The block carries M instead of four digits,
  // so origin is visible in the number without breaking the shape everything else reads.
  const seq = String(Math.floor(Math.random() * 900) + 100);
  const quoteNumber = `TX${when.replace(/-/g, '').slice(2)}-M${seq}-${body.commissionIncluded ? 'C' : 'NC'}`;

  try {
    await env.DB.prepare(
      'INSERT INTO quotes (id, quote_number, created_at, client_name, effective_date, broker_name, ' +
      'broker_agency, broker_email, rep_name, commission_included, products, status, ran_by, state, ' +
      'source_tag, first_year_value, employee_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(
      crypto.randomUUID(), quoteNumber, new Date(when).toISOString(), employer,
      String(body.effectiveDate || '').trim().slice(0, 40),
      String(body.agentName || '').trim().slice(0, 120), agency,
      String(body.agentEmail || '').trim().toLowerCase().slice(0, 160),
      rep, body.commissionIncluded ? 1 : 0, products, status, 'ABY', 'TX', 'manual',
      Number.isFinite(value) && value > 0 ? value : null,
      Number.isFinite(heads) && heads > 0 ? Math.round(heads) : null,
    ).run();
  } catch (err) {
    return jsonResp({ error: String(err && err.message || err) }, 500);
  }
  return jsonResp({ ok: true, quoteNumber });
}

// ─── The sales pipeline (Eric, 2026-08-18) ─────────────────────────────────────

/**
 * The four statuses, as SQL over the quote history.
 *
 * ⭐⭐ ERIC SET THE LINE AT A YEAR, and his reasoning is worth keeping because it is what makes a
 * long window correct: "since we'll reach out more to the quoting or producing ones, if they truly
 * go a year without quoting anything, they likely are really dormant."
 *
 * ⚠️ `Producing` is keyed on a SOLD quote, not on quoting volume. Somebody can quote constantly and
 * place nothing; that is a different conversation from somebody writing business, and collapsing
 * them would hide exactly the account worth a phone call.
 */
const PIPELINE_WINDOW_DAYS = 365;

function pipelineStatusSql(emailExpr) {
  const recent = `datetime('now','-${PIPELINE_WINDOW_DAYS} days')`;
  return (
    "CASE " +
    `WHEN EXISTS (SELECT 1 FROM quotes q WHERE lower(trim(q.broker_email)) = ${emailExpr} AND q.status = 'S' AND q.created_at >= ${recent}) THEN 'producing' ` +
    `WHEN EXISTS (SELECT 1 FROM quotes q WHERE lower(trim(q.broker_email)) = ${emailExpr} AND q.created_at >= ${recent}) THEN 'quoting' ` +
    `WHEN EXISTS (SELECT 1 FROM quotes q WHERE lower(trim(q.broker_email)) = ${emailExpr}) THEN 'dormant' ` +
    "ELSE 'prospect' END"
  );
}

/** Everyone ABY tracks: accounts and prospects alike, with status derived and priority as stored. */
async function handleAdminPipeline(request, env) {
  const u = new URL(request.url).searchParams;
  const rep = (u.get('rep') || '').trim().toLowerCase();
  const status = (u.get('status') || '').trim().toLowerCase();
  const priority = (u.get('priority') || '').trim().toUpperCase();

  const st = pipelineStatusSql("lower(trim(b.email))");
  const where = [], args = [];
  if (rep) { where.push("lower(COALESCE(b.assigned_rep, a.assigned_rep, '')) = ?"); args.push(rep); }
  if (priority) { where.push("COALESCE(b.priority, a.priority, '') = ?"); args.push(priority); }

  const sql =
    "SELECT b.id, b.email, b.name, b.phone, b.priority, b.notes, b.assigned_rep, " +
    "       CASE WHEN b.password_hash = '' THEN 0 ELSE 1 END AS has_account, " +
    "       a.id AS agency_id, COALESCE(a.name, b.agency) AS agency_name, " +
    "       a.priority AS agency_priority, a.assigned_rep AS agency_rep, " +
    `       ${st} AS status, ` +
    "       (SELECT COUNT(*) FROM quotes q WHERE lower(trim(q.broker_email)) = lower(trim(b.email)) AND trim(q.broker_email) <> '') AS quote_count, " +
    "       (SELECT MAX(q.created_at) FROM quotes q WHERE lower(trim(q.broker_email)) = lower(trim(b.email)) AND trim(q.broker_email) <> '') AS last_quote " +
    "FROM brokers b LEFT JOIN agencies a ON a.id = b.agency_id " +
    (where.length ? ('WHERE ' + where.join(' AND ') + ' ') : '') +
    "ORDER BY b.name LIMIT 1000";
  try {
    const r = await env.DB.prepare(sql).bind(...args).all();
    let rows = r.results || [];
    // ⚠️ Filtered in JS, not SQL, because `status` is a derived alias and SQLite will not let a
    // WHERE clause reference it. Filtering on the whole expression again would mean writing it
    // twice, and two copies of a rule is how they stop agreeing.
    if (status) rows = rows.filter((x) => x.status === status);

    // How much friction is between this person and their next quote? ABY's own account is already
    // on the row; this adds the BenefitLab half. `null` means we could not ask, and the screen says
    // so rather than guessing "no".
    const bl = await benefitlabAccounts(env, rows.map((x) => String(x.email || '').toLowerCase()));
    for (const r of rows) {
      r.benefitlab = bl ? !!bl[String(r.email || '').toLowerCase()] : null;
    }
    return jsonResp({ people: rows, windowDays: PIPELINE_WINDOW_DAYS, benefitlabChecked: bl !== null });
  } catch (err) {
    return jsonResp({ people: [], error: String(err && err.message || err) });
  }
}

/** Add prospects: agency name, agent name, email. Pasted or typed, same shape as an invite list. */
async function handleAdminAddProspects(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const rows = Array.isArray(body.people) ? body.people.slice(0, 500) : [];
  if (!rows.length) return jsonResp({ error: 'Nothing to add.' }, 400);
  const rep = String(body.rep || '').trim().toLowerCase();
  const priority = String(body.priority || '').trim().toUpperCase();
  const added = [], skipped = [], failed = [];

  for (const person of rows) {
    const email = String(person.email || '').trim().toLowerCase();
    const name = String(person.name || '').trim().slice(0, 120);
    const agencyName = String(person.agency || '').trim().slice(0, 120);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { failed.push({ email: email || '(blank)', why: 'not a valid email' }); continue; }

    const existing = await env.DB.prepare('SELECT id FROM brokers WHERE lower(trim(email)) = ?').bind(email).first();
    // ⛔ NEVER TOUCH AN EXISTING ROW. They may already have an account, quotes, and a rating; a
    // re-pasted list must not quietly rewrite any of it.
    if (existing) { skipped.push({ email, why: 'already on the list' }); continue; }

    // Reuse an agency of the same name if there is one, so pasting ten agents from one agency does
    // not create ten agencies. Matched case-insensitively on the typed name, which is all there is.
    let agencyId = null;
    if (agencyName) {
      const a = await env.DB.prepare('SELECT id FROM agencies WHERE lower(trim(name)) = ?').bind(agencyName.toLowerCase()).first();
      if (a) agencyId = a.id;
      else {
        agencyId = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO agencies (id, name, share_quotes, created_at, assigned_rep, priority) VALUES (?,?,?,?,?,?)')
          .bind(agencyId, agencyName, 0, new Date().toISOString(), rep || null, priority || null).run();
      }
    }
    // password_hash '' == no account. This person is on ABY's list, not in the tool.
    await env.DB.prepare(
      'INSERT INTO brokers (id, email, password_hash, name, agency, phone, agency_id, role, created_at, assigned_rep, priority) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(crypto.randomUUID(), email, '', name, agencyName, String(person.phone || '').slice(0, 40),
           agencyId, 'member', new Date().toISOString(), rep || null, priority || null).run();
    added.push({ email });
  }
  return jsonResp({ ok: true, added, skipped, failed });
}

/** Set a priority or a note on one person or agency. */
/**
 * Referral partners, their reps, and what each has actually produced (Eric, 2026-08-19).
 *
 * ⭐⭐ IT RETURNS A SCOREBOARD, NOT A LIST. "Show me everyone they referred" is answerable with a
 * list of names, but the question behind it -- is this relationship worth the effort -- is not.
 * So each partner and rep carries: referred, how many have QUOTED, how many are PRODUCING, and the
 * first-year value behind it.
 * ⭐ The producing/quoting definitions are lifted from the pipeline page rather than reinvented:
 * producing means a SOLD quote in the last 365 days, quoting means any quote in that window. Two
 * screens disagreeing about what "producing" means is worse than neither having it.
 */
async function handleAdminReferrals(request, env) {
  const win = "datetime('now','-365 days')";
  // ⚠️ LEFT JOINs throughout, and the counts come from `quotes` by EMAIL, which is the only link
  // between a person and their work that exists on every row ever saved.
  const roll =
    "SELECT b.id, b.name, b.email, b.agency, b.referred_by_partner AS partner_id, " +
    "       b.referred_by_contact AS contact_id, b.referred_at, b.referral_kind, " +
    "       (SELECT COUNT(*) FROM quotes q WHERE lower(trim(q.broker_email)) = lower(trim(b.email)) AND trim(q.broker_email) <> '') AS quotes, " +
    "       (SELECT COUNT(*) FROM quotes q WHERE lower(trim(q.broker_email)) = lower(trim(b.email)) AND trim(q.broker_email) <> '' " +
    "          AND q.created_at >= " + win + ") AS recent, " +
    "       (SELECT COUNT(*) FROM quotes q WHERE lower(trim(q.broker_email)) = lower(trim(b.email)) AND trim(q.broker_email) <> '' " +
    "          AND q.status = 'S' AND q.created_at >= " + win + ") AS sold_recent, " +
    "       (SELECT COALESCE(SUM(q.first_year_value),0) FROM quotes q " +
    "          WHERE lower(trim(q.broker_email)) = lower(trim(b.email)) AND trim(q.broker_email) <> '') AS value " +
    "FROM brokers b";

  const out = { partners: [], contacts: [], brokers: [], unavailable: {} };
  const attempt = async (name, run) => {
    try { return await run(); }
    catch (err) { out.unavailable[name] = String(err && err.message || err); return null; }
  };

  const p = await attempt('partners', () => env.DB.prepare(
    "SELECT id, name, kind, notes, created_at FROM referral_partners ORDER BY name").all());
  if (p) out.partners = p.results || [];

  const c = await attempt('contacts', () => env.DB.prepare(
    "SELECT id, partner_id, name, email, phone, COALESCE(active,1) AS active " +
    "FROM referral_contacts ORDER BY name").all());
  if (c) out.contacts = c.results || [];

  const b = await attempt('brokers', () => env.DB.prepare(roll).all());
  if (b) out.brokers = b.results || [];

  return jsonResp(out);
}

/** Add or rename a referral partner. */
async function handleReferralPartner(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const name = String(body.name || '').trim().slice(0, 120);
  if (!name) return jsonResp({ error: 'A partner needs a name.' }, 400);
  const kind = String(body.kind || '').trim().slice(0, 60);
  try {
    if (body.id) {
      await env.DB.prepare("UPDATE referral_partners SET name = ?, kind = ?, notes = ? WHERE id = ?")
        .bind(name, kind || null, String(body.notes || '').slice(0, 4000), String(body.id)).run();
      return jsonResp({ ok: true, id: String(body.id) });
    }
    // ⚠️ A DUPLICATE NAME IS REFUSED RATHER THAN CREATED. The entire reason this is a table and not
    // a text box is that two spellings of one partner cannot be added up; letting the picker offer
    // "Emerson Rogers" twice would reintroduce exactly that by the back door.
    const dupe = await env.DB.prepare(
      "SELECT id FROM referral_partners WHERE lower(trim(name)) = ?").bind(name.toLowerCase()).first();
    if (dupe) return jsonResp({ error: 'There is already a partner with that name.' }, 409);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO referral_partners (id, name, kind, notes, created_at) VALUES (?,?,?,?,?)")
      .bind(id, name, kind || null, String(body.notes || '').slice(0, 4000), new Date().toISOString()).run();
    return jsonResp({ ok: true, id });
  } catch (err) {
    return jsonResp({ error: String(err && err.message || err) }, 500);
  }
}

/** Add, edit or retire a rep at a partner. */
async function handleReferralContact(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const name = String(body.name || '').trim().slice(0, 120);
  const partnerId = String(body.partnerId || '').trim();
  try {
    if (body.id) {
      // ⭐ RETIRING A REP DEACTIVATES, NEVER DELETES. Brokers they referred still point at them, and
      // the history of who sent what has to survive somebody changing jobs.
      await env.DB.prepare(
        "UPDATE referral_contacts SET name = ?, email = ?, phone = ?, active = ? WHERE id = ?")
        .bind(name, String(body.email || '').trim().toLowerCase() || null,
              String(body.phone || '').trim() || null,
              body.active === false ? 0 : 1, String(body.id)).run();
      return jsonResp({ ok: true, id: String(body.id) });
    }
    if (!name || !partnerId) return jsonResp({ error: 'A rep needs a name and a partner.' }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO referral_contacts (id, partner_id, name, email, phone, active, created_at) " +
      "VALUES (?,?,?,?,?,1,?)")
      .bind(id, partnerId, name, String(body.email || '').trim().toLowerCase() || null,
            String(body.phone || '').trim() || null, new Date().toISOString()).run();
    return jsonResp({ ok: true, id });
  } catch (err) {
    return jsonResp({ error: String(err && err.message || err) }, 500);
  }
}

/**
 * Record who referred one broker.
 *
 * 🔴 THE PARTNER IS DERIVED FROM THE REP, NEVER TAKEN FROM THE CALLER. Accepting both would let a
 * row claim a rep at one partner and a partner they do not work for -- and that row would look
 * perfectly fine on every screen while making both totals wrong.
 */
async function handleBrokerReferral(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const brokerId = String(body.brokerId || '').trim();
  if (!brokerId) return jsonResp({ error: 'Which broker?' }, 400);
  const contactId = String(body.contactId || '').trim();
  let partnerId = String(body.partnerId || '').trim();
  try {
    if (contactId) {
      const row = await env.DB.prepare(
        "SELECT partner_id FROM referral_contacts WHERE id = ?").bind(contactId).first();
      if (!row) return jsonResp({ error: 'That rep no longer exists.' }, 404);
      partnerId = String(row.partner_id || '');
    }
    // ⚠️ `referred_at` is only stamped when it is not already set, so editing a rep years later
    // does not silently restate WHEN the referral happened.
    const existing = await env.DB.prepare(
      "SELECT referred_at FROM brokers WHERE id = ?").bind(brokerId).first();
    if (!existing) return jsonResp({ error: 'That broker no longer exists.' }, 404);
    const when = existing.referred_at || (partnerId ? new Date().toISOString() : null);
    await env.DB.prepare(
      "UPDATE brokers SET referred_by_partner = ?, referred_by_contact = ?, referral_kind = ?, " +
      "referred_at = ? WHERE id = ?")
      .bind(partnerId || null, contactId || null,
            String(body.kind || (partnerId ? 'referral' : '')).trim() || null, when, brokerId).run();
    return jsonResp({ ok: true, partnerId: partnerId || null, contactId: contactId || null, referredAt: when });
  } catch (err) {
    return jsonResp({ error: String(err && err.message || err) }, 500);
  }
}

async function handleAdminRate(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const table = body.kind === 'agency' ? 'agencies' : 'brokers';
  const id = String(body.id || '');
  if (!id) return jsonResp({ error: 'Which one?' }, 400);
  const priority = String(body.priority == null ? '' : body.priority).trim().toUpperCase();
  if (priority && !['A', 'B', 'C'].includes(priority)) return jsonResp({ error: 'Priority is A, B or C.' }, 400);
  if (body.priority != null) {
    await env.DB.prepare(`UPDATE ${table} SET priority = ? WHERE id = ?`).bind(priority || null, id).run();
  }
  if (body.notes != null) {
    await env.DB.prepare(`UPDATE ${table} SET notes = ? WHERE id = ?`).bind(String(body.notes).slice(0, 4000), id).run();
  }
  return jsonResp({ ok: true });
}

// The sales pipeline screen (Eric, 2026-08-18). Brokers and agencies ABY sells TO -- not
// employers, and deliberately sales-only: no service history, or it becomes a second place where
// client information lives.
function adminPipelineHTML() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Pipeline — ABY admin</title>
<style> *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}
 header{background:#143c73;color:#fff;padding:13px 20px;display:flex;align-items:center;gap:16px}
 header b{font-size:16px;font-weight:600} header a{color:#fff;font-size:13px;text-decoration:none;opacity:.85;padding:4px 8px;border-radius:5px} header a:hover{opacity:1;background:rgba(255,255,255,.14)}
 /* The page you are on. Without this the class added to the nav renders identically to the
    other three links -- markup that changes nothing, which is its own small trap. */
 header a.here{opacity:1;background:rgba(255,255,255,.2);font-weight:600}
 /* An ACTION, not a destination. Tinted so it reads as the thing you DO on a bar
    where everything else is somewhere you go to look. */
 header a.act{background:#2f9e73;opacity:1;font-weight:600}
 header a.act:hover{background:#37b284}
 main{max-width:1240px;margin:22px auto;padding:0 18px}
 .card{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:20px;margin-bottom:18px}
 h2{font-size:16px;margin:0 0 4px} .sub{color:#5b6b7f;font-size:13px;margin:0 0 14px}
 table{width:100%;border-collapse:collapse;font-size:14px}
 th{text-align:left;font-size:12px;text-transform:uppercase;color:#5b6b7f;border-bottom:1px solid #dfe5ec;padding:8px 6px}
 /* Sortable headers. The arrow sits in the label rather than a fixed slot because this table's
    headers are short and a reserved gap on nine of them reads as a rendering fault. */
 th.srt{cursor:pointer;user-select:none}
 th.srt:hover{color:#143c73;background:#eef2f7}
 td{padding:7px 6px;border-bottom:1px solid #eef2f6} .muted{color:#8a97a8}
 .n{text-align:right;font-variant-numeric:tabular-nums}
 .filters{display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap}
 .filters button{border:1px solid #c8d2de;border-radius:6px;padding:7px 13px;cursor:pointer;font-size:14px}
 select{padding:5px 7px;border:1px solid #c8d2de;border-radius:5px;font-size:13px}

 .pill{display:inline-block;padding:2px 9px;border-radius:11px;font-size:12px;font-weight:600}
 .producing{background:#e8f4ec;color:#1a5c3a} .quoting{background:#e6eefb;color:#1c4587}
 .dormant{background:#fdf1e0;color:#8a5a12} .prospect{background:#eef1f5;color:#5b6b7f}
 textarea{width:100%;padding:9px 11px;border:1px solid #c8d2de;border-radius:6px;font:14px monospace}
 .note{width:100%;border:1px solid transparent;background:transparent;border-radius:5px;padding:4px 6px;font-size:13px}
 .note:focus{border-color:#c8d2de;background:#fff;outline:none}
</style></head><body>
<header><b>ABY admin</b><a href="/aby" class="act" title="Run a quote as ABY, with the internal overrides">Run a quote</a><a href="/admin">Quote log</a><a href="/admin/brokers">Brokers &amp; Agencies</a><a href="/admin/pipeline" class="here">Pipeline</a><a href="/admin/referrals">Referrals</a><a href="/admin/rates">Rates</a></header>
<main>
  <div id="warn" style="display:none;background:#fdecec;color:#a12622;border:1px solid #f3c2c2;border-radius:8px;padding:10px 13px;margin:0 0 16px;font-size:13.5px"></div>
  <div class="card">
    <h2>Add prospects</h2>
    <p class="sub">One per line, as <strong>agency, name, email</strong>. Nobody is emailed and no account is created &mdash; this is your list, not an invitation.</p>
    <textarea id="box" rows="4" placeholder="Acme Benefits, Jane Smith, jane@acme.com&#10;Boyd &amp; Co, Tanya Boyd, tanya@boyd.com"></textarea>
    <div class="filters" style="margin-top:10px">
      <span class="muted" style="font-size:13px">Owner:</span>
      <select id="newRep"><option value="">—</option><option value="eric">Eric</option><option value="niels">Niels</option></select>
      <span class="muted" style="font-size:13px">Priority:</span>
      <select id="newPri"><option value="">—</option><option>A</option><option>B</option><option>C</option></select>
      <button id="add" style="background:#143c73;color:#fff;border:0;font-weight:600">Add to the list</button>
    </div>
    <div class="msg" id="addMsg" style="display:none;margin-top:10px;padding:10px 12px;border-radius:6px;font-size:13px"></div>
  </div>

  <div class="card">
    <h2>Log a quote</h2>
    <p class="sub">For rates sent by email rather than run through the tool &mdash; so the opportunity is tracked and you know to circle back.</p>
    <div class="filters">
      <input type="text" id="qEmployer" placeholder="Employer" style="flex:2;min-width:180px;padding:7px 9px;border:1px solid #c8d2de;border-radius:6px">
      <input type="text" id="qAgency" placeholder="Agency" style="flex:2;min-width:160px;padding:7px 9px;border:1px solid #c8d2de;border-radius:6px">
      <input type="date" id="qWhen" style="padding:6px 8px;border:1px solid #c8d2de;border-radius:6px">
    </div>
    <div class="filters">
      <input type="text" id="qProducts" placeholder="Products, e.g. COBRA, FSA, ERISA Wrap" style="flex:3;min-width:240px;padding:7px 9px;border:1px solid #c8d2de;border-radius:6px">
      <input type="number" id="qValue" placeholder="First-year value (optional)" style="flex:1;min-width:170px;padding:7px 9px;border:1px solid #c8d2de;border-radius:6px">
      <input type="number" id="qHeads" placeholder="Employees (optional)" style="flex:1;min-width:150px;padding:7px 9px;border:1px solid #c8d2de;border-radius:6px">
    </div>
    <div class="filters">
      <span class="muted" style="font-size:13px">Rep:</span>
      <select id="qRep"><option value="">—</option><option value="eric">Eric</option><option value="niels">Niels</option></select>
      <span class="muted" style="font-size:13px">Status:</span>
      <select id="qStatus"><option value="P">Pending</option><option value="I">In process</option><option value="S">Sold</option><option value="D">Dead</option></select>
      <label style="font-size:13px"><input type="checkbox" id="qComm" checked style="margin-right:6px">Commission</label>
      <button id="qAdd" style="background:#143c73;color:#fff;border:0;font-weight:600">Log it</button>
    </div>
    <div class="msg" id="qMsg" style="display:none;margin-top:10px;padding:10px 12px;border-radius:6px;font-size:13px"></div>
  </div>

  <div class="filters">
    <span class="muted" style="font-size:13px">Owner:</span>
    <select id="fRep"><option value="">Everyone</option><option value="eric">Eric</option><option value="niels">Niels</option></select>
    <span class="muted" style="font-size:13px">Status:</span>
    <select id="fStatus"><option value="">All</option><option value="producing">Producing</option><option value="quoting">Quoting</option><option value="dormant">Dormant</option><option value="prospect">Prospect</option></select>
    <span class="muted" style="font-size:13px">Priority:</span>
    <select id="fPri"><option value="">All</option><option>A</option><option>B</option><option>C</option></select>
    <span class="muted" id="counts" style="margin-left:auto;font-size:13px"></span>
  </div>

  <div class="card">
    <h2>Everyone we track</h2>
    <p class="sub" id="explain"></p>
    <div id="list"><p class="muted">Loading...</p></div>
  </div>
</main>
<script>
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function day(s){return s?String(s).slice(0,10):'\u2014'}
 var LBL={producing:'Producing',quoting:'Quoting',dormant:'Dormant',prospect:'Prospect'};
 // Least friction first. BenefitLab carries name, agency, phone, email AND logo into the quote;
 // an ABY account prefills their own details; neither means retyping everything, every time --
 // which is the row worth a phone call.
 function canQuote(x){
   if(x.benefitlab===true) return '<span class="pill producing">BenefitLab</span>';
   if(x.has_account) return '<span class="pill quoting">ABY account</span>';
   if(x.benefitlab===null) return '<span class="pill prospect" title="BenefitLab could not be reached, so this may be understated">unknown</span>';
   return '<span class="muted">neither</span>';
 }
 function msg(el,t,good){el.textContent=t;el.style.display='block';el.style.background=good?'#e8f4ec':'#fdecec';el.style.color=good?'#1a5c3a':'#a12622'}
 function priSelect(kind,id,cur){
   return '<select data-k="'+kind+'" data-id="'+esc(id)+'" class="pri">'
     +['','A','B','C'].map(function(v){return '<option value="'+v+'"'+((cur||'')===v?' selected':'')+'>'+(v||'\u2014')+'</option>'}).join('')+'</select>';
 }
 document.getElementById('add').onclick=async function(){
   var people=document.getElementById('box').value.split(/\\r?\\n/).map(function(l){
     var pcs=l.split(','); if(pcs.length<2) return null;
     return {agency:(pcs[0]||'').trim(), name:(pcs.length>2?pcs[1]:'').trim(), email:pcs[pcs.length-1].trim()};
   }).filter(function(x){return x&&x.email});
   if(!people.length){msg(document.getElementById('addMsg'),'Add at least one line as: agency, name, email',false);return}
   var r=await fetch('/api/admin/prospects',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({people:people,rep:document.getElementById('newRep').value,priority:document.getElementById('newPri').value})});
   var d=await r.json().catch(function(){return{}});
   if(!r.ok){msg(document.getElementById('addMsg'),d.error||'Could not add.',false);return}
   var bits=[];
   if(d.added.length) bits.push(d.added.length+' added');
   if(d.skipped.length) bits.push(d.skipped.length+' already on the list');
   if(d.failed.length) bits.push(d.failed.length+' rejected ('+d.failed.map(function(x){return x.email}).join(', ')+')');
   msg(document.getElementById('addMsg'),bits.join('. '),!d.failed.length);
   document.getElementById('box').value=''; load();
 };
 // The spreadsheet's own spellings, mapped to the tool's product ids -- the same table the 2026
 // import used, so a manually logged quote filters and reports exactly like a generated one.
 var PMAP={'cobra':'cobra','erisa wrap':'erisa','erisa':'erisa','fsa':'fsa','dcap':'fsa','lfsa':'fsa',
   'hsa':'hsa','pop':'pop','pop / section 125':'pop','section 125':'pop','aca':'aca',
   'aca 1094/1095 reporting':'aca','hra':'hra','tx state continuation':'stateContinuation',
   'state continuation':'stateContinuation','qtb':'section132','medicare hra':'mpra','ichra':'ichra'};
 document.getElementById('qAdd').onclick=async function(){
   var raw=document.getElementById('qProducts').value.split(',').map(function(x){return x.trim()}).filter(Boolean);
   var ids=[], unknown=[];
   raw.forEach(function(x){ var id=PMAP[x.toLowerCase()]; if(id) ids.push('product-'+id); else unknown.push(x); });
   // ⛔ An unrecognised product is REPORTED, never dropped. A silently missing product is an
   // understated count that nobody can see.
   if(unknown.length){
     var m=document.getElementById('qMsg');
     m.textContent='Not recognised: '+unknown.join(', ')+'. Use names like COBRA, FSA, HSA, POP, ERISA Wrap, ACA, HRA, QTB.';
     m.style.display='block'; m.style.background='#fdecec'; m.style.color='#a12622'; return;
   }
   var r=await fetch('/api/admin/quote',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({employer:document.getElementById('qEmployer').value,
       agency:document.getElementById('qAgency').value, quotedOn:document.getElementById('qWhen').value,
       products:ids, rep:document.getElementById('qRep').value, status:document.getElementById('qStatus').value,
       commissionIncluded:document.getElementById('qComm').checked,
       firstYearValue:document.getElementById('qValue').value, employeeCount:document.getElementById('qHeads').value})});
   var d=await r.json().catch(function(){return{}});
   var m=document.getElementById('qMsg');
   m.style.display='block';
   m.style.background=r.ok?'#e8f4ec':'#fdecec'; m.style.color=r.ok?'#1a5c3a':'#a12622';
   m.textContent=r.ok?('Logged as '+d.quoteNumber):(d.error||'Could not log it.');
   if(r.ok){['qEmployer','qAgency','qProducts','qValue','qHeads'].forEach(function(i){document.getElementById(i).value=''}); load();}
 };
 ['fRep','fStatus','fPri'].forEach(function(id){document.getElementById(id).onchange=load});

 // Sorting for "Everyone we track". Eric asked for it on the quote log -- "Why can't we sort by
 // agent name or agency name?" -- and this is the page that IS the list of agents and agencies,
 // so the same want applies with more force.
 // ⭐ The rows are HELD rather than re-fetched on each sort. Re-querying the server to reorder rows
 // already on screen is slow, and it can quietly return a DIFFERENT set if anything changed in
 // between -- so the list would appear to sort and also silently gain or lose a row.
 var PEOPLE=[], sortKey='agency', sortDir=1;
 var SORTV={
   agency:function(x){return String(x.agency_name||'').toLowerCase()},
   agent:function(x){return String(x.name||'').toLowerCase()},
   email:function(x){return String(x.email||'').toLowerCase()},
   status:function(x){return String(x.status||'')},
   quotes:function(x){return Number(x.quote_count||0)},
   last:function(x){return String(x.last_quote||'')},
   priority:function(x){return String(x.priority||'')}
 };
 function sortPeople(list){
   var g=SORTV[sortKey]||SORTV.agency;
   return list.slice().sort(function(a,b){
     var x=g(a), y=g(b);
     // ⚠️ BLANKS SINK IN BOTH DIRECTIONS. A prospect with no agency name is not "first
     // alphabetically", it is unknown -- and floating the unnamed to the top of every ascending
     // sort buries the rows somebody is actually looking for. Same rule as the quote log.
     var xe=(x===''||x===null||x===undefined), ye=(y===''||y===null||y===undefined);
     if(xe&&!ye) return 1;
     if(!xe&&ye) return -1;
     if(x<y) return -1*sortDir;
     if(x>y) return 1*sortDir;
     return 0;
   });
 }
 function arrow(k){ return sortKey===k ? (sortDir===1?' ▲':' ▼') : ''; }
 function hcell(k,label,cls){
   return '<th class="srt'+(cls?' '+cls:'')+'" data-k="'+k+'">'+label+arrow(k)+'</th>';
 }

 async function load(){
   var q=[];
   if(document.getElementById('fRep').value) q.push('rep='+document.getElementById('fRep').value);
   if(document.getElementById('fStatus').value) q.push('status='+document.getElementById('fStatus').value);
   if(document.getElementById('fPri').value) q.push('priority='+document.getElementById('fPri').value);
   var d=await (await fetch('/api/admin/pipeline'+(q.length?('?'+q.join('&')):''))).json().catch(function(){return{}});
   var rows=d.people||[];
   document.getElementById('explain').textContent=
     'Status is worked out from the quote history and cannot be edited: Producing means a sold quote in the last '
     +(d.windowDays||365)+' days, Quoting means a quote in that window, Dormant means quoted before but not since, Prospect means never quoted.';
   var c={producing:0,quoting:0,dormant:0,prospect:0};
   rows.forEach(function(x){c[x.status]=(c[x.status]||0)+1});
   if(d.benefitlabChecked===false)
     document.getElementById('explain').textContent+=
       ' \u26a0 BenefitLab could not be reached, so "Can quote" shows unknown rather than guessing.';
   document.getElementById('counts').textContent=
     c.producing+' producing \u00b7 '+c.quoting+' quoting \u00b7 '+c.dormant+' dormant \u00b7 '+c.prospect+' prospect';
   PEOPLE = rows;
   renderList();
 }

 function renderList(){
   var rows = sortPeople(PEOPLE);
   document.getElementById('list').innerHTML = rows.length
     ? '<table><thead><tr>'
       + hcell('agency','Agency') + hcell('agent','Agent') + hcell('email','Email')
       + hcell('status','Status') + hcell('quotes','Quotes','n') + hcell('last','Last quote')
       // ⛔ "Can quote" and "Note" are NOT sortable, deliberately. Can-quote is a live lookup
       // against BenefitLab that can read "unknown" when it could not be reached, so an order built
       // on it would change meaning between refreshes; Note is free text nobody scans in order.
       + '<th>Can quote</th>' + hcell('priority','Priority') + '<th>Note</th>'
       + '</tr></thead><tbody>'
       + rows.map(function(x){
           return '<tr><td>'+esc(x.agency_name||'\u2014')+'</td><td>'+esc(x.name||'\u2014')+'</td><td>'+esc(x.email)+'</td>'
             +'<td><span class="pill '+x.status+'">'+LBL[x.status]+'</span></td>'
             +'<td class="n">'+x.quote_count+'</td><td>'+day(x.last_quote)+'</td>'
             +'<td>'+canQuote(x)+'</td>'
             +'<td>'+priSelect('broker',x.id,x.priority)+'</td>'
             +'<td><input class="note" data-id="'+esc(x.id)+'" value="'+esc(x.notes||'')+'" placeholder="\u2026"></td></tr>';
         }).join('')+'</tbody></table>'
     : '<p class="muted">Nobody on the list yet. Paste some above.</p>';
   // ⭐ Clicking the SAME column flips direction; a NEW column starts at its natural direction --
   // A-Z for a name, and biggest-first for a count or a date, because "who has quoted most" and
   // "who quoted most recently" are the questions those columns get opened for.
   Array.prototype.forEach.call(document.querySelectorAll('th.srt'),function(h){
     h.onclick=function(){
       var k=h.getAttribute('data-k');
       if(k===sortKey) sortDir=-sortDir;
       else { sortKey=k; sortDir=(k==='quotes'||k==='last')?-1:1; }
       renderList();
     };
   });
   Array.prototype.forEach.call(document.querySelectorAll('select.pri'),function(sel){
     sel.onchange=async function(){
       var r=await fetch('/api/admin/rate',{method:'POST',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({kind:sel.getAttribute('data-k'),id:sel.getAttribute('data-id'),priority:sel.value})});
       if(r.ok) load(); else await failed(r,'Could not save that priority.');
     };
   });
   Array.prototype.forEach.call(document.querySelectorAll('input.note'),function(inp){
     inp.onchange=async function(){
       // ⚠️ THIS ONE HAD NO RELOAD EITHER, so a failed save left the typed note sitting on screen
       // looking saved, with nothing anywhere that disagreed.
       var r=await fetch('/api/admin/rate',{method:'POST',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({kind:'broker',id:inp.getAttribute('data-id'),notes:inp.value})});
       if(!r.ok) await failed(r,'Could not save that note.');
     };
   });
 }

 // ⛔⛔ A WRITE THAT FAILS MUST SAY SO. These handlers used to be "await fetch(...); load();" with
 // the result thrown away, so a 500 was indistinguishable from a save: the control either snapped
 // back for no stated reason, or -- worse, where there was no reload -- kept showing what you typed
 // while the database still held the old value.
 // ⭐ Reload FIRST so the screen matches the server, then say why.
 async function failed(r, fallback){
   var d=await r.json().catch(function(){return{}});
   try { await load(); } catch(e) {}
   var w=document.getElementById('warn');
   if(w){ w.style.display='block'; w.textContent=(d.error||fallback); }
 }

 load();
</script></body></html>`;
}

// ─── ABY admin sub-pages (Eric, 2026-08-18) ────────────────────────────────────
//
// ⭐ SEPARATE PAGES RATHER THAN MORE TABS ON `adminHTML()`. That function is the quote log, it
// works, and it is long. New capability goes beside it so a mistake here cannot take the log down.
function adminBrokersHTML() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Brokers &amp; Agencies — ABY admin</title>
<style> *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}
 header{background:#143c73;color:#fff;padding:13px 20px;display:flex;align-items:center;gap:16px}
 header b{font-size:16px;font-weight:600} header a{color:#fff;font-size:13px;text-decoration:none;opacity:.85;padding:4px 8px;border-radius:5px} header a:hover{opacity:1;background:rgba(255,255,255,.14)}
 /* The page you are on. Without this the class added to the nav renders identically to the
    other three links -- markup that changes nothing, which is its own small trap. */
 header a.here{opacity:1;background:rgba(255,255,255,.2);font-weight:600}
 /* An ACTION, not a destination. Tinted so it reads as the thing you DO on a bar
    where everything else is somewhere you go to look. */
 header a.act{background:#2f9e73;opacity:1;font-weight:600}
 header a.act:hover{background:#37b284}
 main{max-width:1180px;margin:22px auto;padding:0 18px}
 .card{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:20px;margin-bottom:18px}
 h2{font-size:16px;margin:0 0 4px} .sub{color:#5b6b7f;font-size:13px;margin:0 0 14px}
 table{width:100%;border-collapse:collapse;font-size:14px}
 th{text-align:left;font-size:12px;text-transform:uppercase;color:#5b6b7f;border-bottom:1px solid #dfe5ec;padding:8px 6px}
 th.srt{cursor:pointer;user-select:none}
 th.srt:hover{color:#143c73;background:#eef2f7}
 td{padding:8px 6px;border-bottom:1px solid #eef2f6}
 /* Eric, 2026-08-19: "The date looks stupid - not enough room." An ISO date wrapping
    after the month reads as broken data rather than as a narrow column. It is a fixed
    width string, so it should simply never wrap. */
 td.date,th.date{white-space:nowrap;width:1%}
 /* Collapsible sections. Eric: "I'd like to be able to collapse each section of that
    page." Five stacked tables is a long scroll when four of them are not what you came
    for. ⭐ The state is REMEMBERED, because a section you collapse every visit is one
    you are telling us you do not want. */
 .card h2{cursor:pointer;user-select:none;display:flex;align-items:center;gap:8px}
 .card h2 .tw{font-size:11px;color:#8a97a8;transition:transform .12s}
 .card.shut h2 .tw{transform:rotate(-90deg)}
 .card.shut .sub,.card.shut>div,.card.shut>table,.card.shut>p:not(.sub){display:none}
 .card h2 .cnt{margin-left:auto;font-size:12px;font-weight:400;color:#8a97a8} .muted{color:#8a97a8}
 .n{text-align:right;font-variant-numeric:tabular-nums}
 .filters{display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap}
 .filters button{background:#fff;border:1px solid #c8d2de;border-radius:6px;padding:7px 13px;cursor:pointer;font-size:14px}
 .filters button.on{background:#143c73;color:#fff;border-color:#143c73}
 select{padding:5px 7px;border:1px solid #c8d2de;border-radius:5px;font-size:13px}
 a.dl{display:inline-block;background:#143c73;color:#fff;padding:8px 15px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600}
</style></head><body>
<header><b>ABY admin</b><a href="/aby" class="act" title="Run a quote as ABY, with the internal overrides">Run a quote</a><a href="/admin">Quote log</a><a href="/admin/brokers" class="here">Brokers &amp; Agencies</a><a href="/admin/pipeline">Pipeline</a><a href="/admin/referrals">Referrals</a><a href="/admin/rates">Rates</a></header>
<main>
  <div id="warn" style="display:none;background:#fdecec;color:#a12622;border:1px solid #f3c2c2;border-radius:8px;padding:10px 13px;margin:0 0 16px;font-size:13.5px"></div>
  <div class="filters">
    <span class="muted" style="font-size:13px">Show:</span>
    <button data-rep="" class="on">Everyone</button>
    <button data-rep="eric">Eric</button>
    <button data-rep="niels">Niels</button>
    <span class="muted" id="totals" style="margin-left:auto;font-size:13px"></span>
  </div>
  <!-- Shown only when a section could not be read. See the note beside statsPerBlock: a page that
       renders blank on a database error is indistinguishable from one with no data. -->
  <div id="statsWarn" style="display:none;margin:0 0 14px;padding:10px 14px;border-radius:7px;
       background:#fdf1e0;border:1px solid #f0d9ae;color:#7a5410;font-size:13px"></div>
  <div class="card"><h2>Quotes by agency</h2>
    <p class="sub">Counted from every quote ever run, including from people who never made an account.</p>
    <div id="byAgency"><p class="muted">Loading...</p></div></div>
  <div class="card"><h2>Quotes by agent</h2>
    <div id="byAgent"><p class="muted">Loading...</p></div></div>
<div class="card"><h2>Quotes by status</h2>
    <p class="sub">Value is the first year of a quote: setup, plan documents, annual fees and twelve months of any monthly fee.</p>
    <div id="byStatus"><p class="muted">Loading...</p></div></div>
  <div class="card"><h2>Open quotes, by age</h2>
    <p class="sub">Pending and in-process quotes only &mdash; a sold or dead quote is not waiting on anybody.</p>
    <div id="aging"><p class="muted">Loading...</p></div></div>
  <div class="card"><h2>Registered brokers</h2>
    <p class="sub">Everyone with an ABY account. Assign each one to whoever owns the relationship.</p>
    <div id="brokers"><p class="muted">Loading...</p></div></div>
  </main>
<script>
 var rep='';
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function day(s){return s?String(s).slice(0,10):'\u2014'}
 Array.prototype.forEach.call(document.querySelectorAll('.filters button'),function(b){
   b.onclick=function(){
     rep=b.getAttribute('data-rep');
     Array.prototype.forEach.call(document.querySelectorAll('.filters button'),function(x){x.className=''});
     b.className='on'; load();
   };
 });
 function repSelect(kind,id,cur){
   var o=['','eric','niels'].map(function(v){
     return '<option value="'+v+'"'+((cur||'')===v?' selected':'')+'>'+(v===''?'\u2014':(v==='eric'?'Eric':'Niels'))+'</option>';
   }).join('');
   return '<select data-kind="'+kind+'" data-id="'+esc(id)+'">'+o+'</select>';
 }
 function wireSelects(){
   Array.prototype.forEach.call(document.querySelectorAll('select[data-id]'),function(sel){
     sel.onchange=async function(){
       var r=await fetch('/api/admin/assign',{method:'POST',headers:{'Content-Type':'application/json'},
         body:JSON.stringify({kind:sel.getAttribute('data-kind'),id:sel.getAttribute('data-id'),rep:sel.value})});
       if(r.ok) load(); else await failed(r,'Could not save that owner.');
     };
   });
 }
 // Sorting for the three list tables on this page (Eric, 2026-08-19).
 // ⭐ ONE HELPER SHARED BY ALL THREE rather than three copies. Three hand-written sorts is three
 // places for the blank-handling rule to drift, and that rule is the one that matters.
 // ⭐ The rows are CACHED so re-sorting does not re-query. Reordering what is already on screen
 // must not be able to return a different set than the one being looked at.
 var CACHE={brokers:[],byAgency:[],byAgent:[]}, SORTS={}, paint=function(){};
 var TOP_N=25, SHOW_ALL={};
 // ⚠️ THE DEFAULT DIRECTION FOLLOWS THE DEFAULT KEY. Initialising every table ascending put
 // '(no agency)' with 12 quotes above MMA with 36 on first paint -- technically sorted, and the
 // wrong way round for the only question that table is opened to answer.
 function isDesc(k){ return k==='n'||k==='quotes'||k==='agents'||k==='last'; }
 function sorted(tbl,rows,getters,defKey){
   var s=SORTS[tbl]||(SORTS[tbl]={k:defKey,d:isDesc(defKey)?-1:1});
   var g=getters[s.k]||getters[defKey];
   return rows.slice().sort(function(a,b){
     var x=g(a), y=g(b);
     // ⚠️ BLANKS SINK IN BOTH DIRECTIONS -- an unknown agency is not "first alphabetically".
     var xe=(x===''||x===null||x===undefined), ye=(y===''||y===null||y===undefined);
     if(xe&&!ye) return 1;
     if(!xe&&ye) return -1;
     if(x<y) return -1*s.d;
     if(x>y) return 1*s.d;
     return 0;
   });
 }
 function hc(tbl,k,label,cls){
   var s=SORTS[tbl]||{};
   var mark = s.k===k ? (s.d===1?' ▲':' ▼') : '';
   return '<th class="srt'+(cls?' '+cls:'')+'" data-t="'+tbl+'" data-k="'+k+'">'+label+mark+'</th>';
 }
 function wireSort(){
   Array.prototype.forEach.call(document.querySelectorAll('th.srt'),function(h){
     h.onclick=function(){
       var tbl=h.getAttribute('data-t'), k=h.getAttribute('data-k');
       var s=SORTS[tbl]||(SORTS[tbl]={k:k,d:1});
       if(s.k===k) s.d=-s.d;
       // A count or a date opens biggest/newest first; a name opens A-Z.
       else { s.k=k; s.d=isDesc(k)?-1:1; }
       paint();
     };
   });
 }

 async function load(){
   var q=rep?('?rep='+encodeURIComponent(rep)):'';
   var b=await (await fetch('/api/admin/brokers'+q)).json().catch(function(){return{}});
   var list=b.brokers||[];
   CACHE.brokers=list;
   paintBrokers();
   function paintBrokers(){
   var list=sorted('brokers',CACHE.brokers,{
     name:function(x){return String(x.name||'').toLowerCase()},
     email:function(x){return String(x.email||'').toLowerCase()},
     agency:function(x){return String(x.agency_name||'').toLowerCase()},
     role:function(x){return String(x.role||'member')},
     quotes:function(x){return Number(x.quote_count||0)},
     last:function(x){return String(x.last_login_at||'')}
   },'name');
   document.getElementById('brokers').innerHTML = list.length
     ? '<table><thead><tr>'+hc('brokers','name','Name')+hc('brokers','email','Email')
       +hc('brokers','agency','Agency')+hc('brokers','role','Role')
       +hc('brokers','quotes','Quotes','n')+hc('brokers','last','Last sign-in')
       +'<th>Status</th><th>Owner</th></tr></thead><tbody>'
       + list.map(function(x){
           return '<tr><td>'+esc(x.name||'\u2014')+'</td><td>'+esc(x.email)+'</td><td>'+esc(x.agency_name||'\u2014')+'</td><td>'+esc(x.role||'member')+'</td>'
             +'<td class="n">'+x.quote_count+'</td><td class="date">'+day(x.last_login_at)+'</td>'
             +'<td>'+(x.pending?'<span class="muted">invited</span>':'active')+'</td><td>'+repSelect('broker',x.id,x.assigned_rep)+'</td></tr>';
         }).join('')+'</tbody></table>'
     : '<p class="muted">No broker accounts yet.</p>';
   }

   var st=await (await fetch('/api/admin/stats'+q)).json().catch(function(){return{}});
   if(st.totals) document.getElementById('totals').textContent=
     st.totals.quotes+' quotes'
     +(st.totals.brokers==null?'':' \u00b7 '+st.totals.brokers+' brokers')
     +(st.totals.agencies==null?'':' \u00b7 '+st.totals.agencies+' agencies');
   // \ud83d\udd34 SAY SO WHEN A SECTION COULD NOT BE READ. An empty table and an unreadable one look
   // identical, and this whole page rendered blank when a single query failed -- with the reason
   // sitting unread in the response. A screen that cannot explain itself sends somebody hunting.
   var warn=document.getElementById('statsWarn');
   var bad=st.unavailable?Object.keys(st.unavailable):[];
   if(warn){
     if(bad.length||st.error){
       warn.style.display='block';
       warn.textContent=(bad.length?('Some sections could not be read: '+bad.join(', ')+'. '):'Something did not load. ')
         +'This usually means the database is behind the code \u2014 open /api/migrate while signed in. Details: '
         +(st.error||st.unavailable[bad[0]]||'unknown');
     } else { warn.style.display='none'; }
   }
   CACHE.byAgency=st.byAgency||[];
   paintByAgency();
   // 🔴🔴 THESE TWO TABLES HOLD 235 ROWS EACH SINCE THE 2024-2026 IMPORT, AND THE PAGE WAS 31
 // SCREENS TALL. "Quotes by status" and "Open quotes, by age" -- the two short summaries most
 // worth glancing at -- sat below 18,000 pixels of table and were effectively unreachable.
 // ⭐ The top rows are the valuable ones (both tables sort by volume), so the fix is a CAP with a
 // way past it, not a collapse: you still land on the biggest agencies without scrolling.
 // ⛔ AND THE CAP SAYS SO. A list that quietly stops at 25 is indistinguishable from an agency
 // book that only has 25 in it -- the same defect as the 300-of-1795 quote count (TRAPS #237).
 // ⚠️ TOP_N and SHOW_ALL are declared with CACHE, not here: paint() runs before this point
 // in load(), and a var assigned later reads as undefined when the first paint uses it.
 function capRows(key, rows){
   return SHOW_ALL[key] ? rows : rows.slice(0, TOP_N);
 }
 function moreRow(key, shown, total, cols){
   if (total <= TOP_N) return '';
   var label = SHOW_ALL[key]
     ? 'Showing all ' + total + ' \u2014 show the top ' + TOP_N + ' only'
     : 'Showing the top ' + shown + ' of ' + total + ' \u2014 show all';
   return '<tr class="morerow"><td colspan="' + cols + '" style="text-align:center;padding:10px">'
     + '<button type="button" class="morebtn" data-k="' + key + '" style="background:none;border:0;'
     + 'color:#2f6f4f;font-size:12.5px;cursor:pointer;text-decoration:underline">' + label + '</button>'
     + '</td></tr>';
 }
 function wireMore(){
   Array.prototype.forEach.call(document.querySelectorAll('.morebtn'), function(b){
     b.onclick = function(){ var k = b.getAttribute('data-k'); SHOW_ALL[k] = !SHOW_ALL[k]; paint(); };
   });
 }

 function paintByAgency(){
   var ag=sorted('byAgency',CACHE.byAgency,{
     agency:function(x){return String(x.agency_label||x.agency||'').toLowerCase()},
     n:function(x){return Number(x.n||0)},
     agents:function(x){return Number(x.agents||0)},
     last:function(x){return String(x.last_quote||'')}
   },'n');
   document.getElementById('byAgency').innerHTML = ag.length
     ? '<table><thead><tr>'+hc('byAgency','agency','Agency')+hc('byAgency','n','Quotes','n')
       +hc('byAgency','agents','Agents','n')+hc('byAgency','last','Last quote')
       +'<th>Owner</th></tr></thead><tbody>'
       + capRows('byAgency', ag).map(function(x){
           return '<tr><td>'+esc(x.agency_label||x.agency||'(no agency)')+'</td><td class="n">'+x.n+'</td><td class="n">'+x.agents+'</td><td class="date">'+day(x.last_quote)+'</td>'
             +'<td>'+(x.agency_id?repSelect('agency',x.agency_id,x.rep):'<span class="muted">\u2014</span>')+'</td></tr>';
         }).join('')+moreRow('byAgency', capRows('byAgency', ag).length, ag.length, 5)+'</tbody></table>'
     : '<p class="muted">Nothing yet.</p>';
   }
   var SL={P:'Pending',I:'In process',S:'Sold',D:'Dead'};
   function money(v){return v?('$'+Number(v).toLocaleString('en-US',{maximumFractionDigits:0})):'\u2014'}
   var bs=st.byStatus||[];
   document.getElementById('byStatus').innerHTML = bs.length
     ? '<table><thead><tr><th>Status</th><th class="n">Quotes</th><th class="n">First-year value</th><th>Based on</th></tr></thead><tbody>'
       + bs.map(function(x){
           return '<tr><td>'+esc(SL[x.status]||x.status)+'</td><td class="n">'+x.n+'</td><td class="n">'+money(x.value)+'</td>'
             +'<td class="muted">'+x.valued+' of '+x.n+' priced</td></tr>';
         }).join('')+'</tbody></table>'
       + '<p class="sub" style="margin-top:8px">Quotes run before today carry no value, so those totals are drawn only from the ones that do.</p>'
     : '<p class="muted">Nothing yet.</p>';
   var AL={week:'Last 7 days',month:'8 to 30 days',quarter:'31 to 90 days',older:'Over 90 days'};
   var ordered=['week','month','quarter','older'], ag2=st.aging||[];
   document.getElementById('aging').innerHTML = ag2.length
     ? '<table><thead><tr><th>Age</th><th class="n">Open quotes</th><th class="n">Value</th></tr></thead><tbody>'
       + ordered.filter(function(k){return ag2.some(function(x){return x.bucket===k})}).map(function(k){
           var x=ag2.find(function(y){return y.bucket===k});
           return '<tr><td>'+AL[k]+'</td><td class="n">'+x.n+'</td><td class="n">'+money(x.value)+'</td></tr>';
         }).join('')+'</tbody></table>'
     : '<p class="muted">No open quotes.</p>';
   CACHE.byAgent=st.byAgent||[];
   paintByAgent();
   function paintByAgent(){
   var agt=sorted('byAgent',CACHE.byAgent,{
     name:function(x){return String(x.name||'').toLowerCase()},
     email:function(x){return String(x.email||'').toLowerCase()},
     agency:function(x){return String(x.agency||'').toLowerCase()},
     n:function(x){return Number(x.n||0)},
     last:function(x){return String(x.last_quote||'')}
   },'n');
   document.getElementById('byAgent').innerHTML = agt.length
     ? '<table><thead><tr>'+hc('byAgent','name','Agent')+hc('byAgent','email','Email')
       +hc('byAgent','agency','Agency')+hc('byAgent','n','Quotes','n')
       +hc('byAgent','last','Last quote')+'</tr></thead><tbody>'
       + capRows('byAgent', agt).map(function(x){
           // \u2b50 A ROW IS NAMED BY WHATEVER IT HAS. Most of the imported book carries an agency and
           // no broker name or email, and printing a dash where the name goes made those rows look
           // like broken data rather than what they are: a quote we know the agency for.
           var who = x.name || x.email || (x.agency ? x.agency : '') || 'Not stated';
           var viaAgency = !x.name && !x.email && x.agency;
           return '<tr><td>'+esc(who)
             +(viaAgency?' <span class="muted" title="This quote records an agency but no individual broker">(agency only)</span>':'')
             +'</td><td>'+esc(x.email||'\u2014')+'</td><td>'+esc(x.agency||'\u2014')+'</td><td class="n">'+x.n+'</td><td class="date">'+day(x.last_quote)+'</td></tr>';
         }).join('')+moreRow('byAgent', capRows('byAgent', agt).length, agt.length, 5)+'</tbody></table>'
     : '<p class="muted">Nothing yet.</p>';
   }
   wireSelects();
   wireSort();
   // Re-render the three lists from the cache when a header is clicked.
   paint=function(){ paintBrokers(); paintByAgency(); paintByAgent(); wireSelects(); wireSort(); wireCollapse(); wireMore(); };
   // ⚠️ BOTH OF THESE MUST BE CALLED HERE AS WELL AS INSIDE paint().
   // The first render happens by calling paintBrokers/paintByAgency/paintByAgent directly,
   // BEFORE paint is assigned -- so anything wired only inside paint() is missing on the
   // page you actually land on, and only appears once something triggers a repaint. The
   // show-all buttons had no handler at all until you happened to click a sort header.
   wireCollapse();
   wireMore();
 }

 // Collapse / expand, remembered in localStorage per section.
 // ⚠️ The twisty is added to the DOM rather than written into every heading, so a new card gets the
 // behaviour without anyone remembering to mark it up.
 function wireCollapse(){
   Array.prototype.forEach.call(document.querySelectorAll('.card'),function(card){
     var h=card.querySelector('h2'); if(!h||h.dataset.wired) return;
     h.dataset.wired='1';
     var key='abyfold:'+h.textContent.trim();
     var tw=document.createElement('span'); tw.className='tw'; tw.textContent='\u25bc';
     h.insertBefore(tw,h.firstChild);
     if(localStorage.getItem(key)==='shut') card.classList.add('shut');
     h.onclick=function(){
       card.classList.toggle('shut');
       localStorage.setItem(key, card.classList.contains('shut')?'shut':'open');
     };
   });
 }

 // ⛔⛔ A WRITE THAT FAILS MUST SAY SO. These handlers used to be "await fetch(...); load();" with
 // the result thrown away, so a 500 was indistinguishable from a save: the control either snapped
 // back for no stated reason, or -- worse, where there was no reload -- kept showing what you typed
 // while the database still held the old value.
 // ⭐ Reload FIRST so the screen matches the server, then say why.
 async function failed(r, fallback){
   var d=await r.json().catch(function(){return{}});
   try { await load(); } catch(e) {}
   var w=document.getElementById('warn');
   if(w){ w.style.display='block'; w.textContent=(d.error||fallback); }
 }

 load();
</script></body></html>`;
}

// The rate viewer. Reads the SAME `pricing.js` the quote tool uses, loaded as a script, so there is
// no second copy of the rates to drift out of step.
// The referral partners page (Eric, 2026-08-19).
//
// ⭐⭐ IT IS A SCOREBOARD, NOT A DIRECTORY. "Show me everyone they referred" is a list; "is this
// relationship worth the effort" is the question behind it, and only the second justifies the
// screen. So every partner and rep carries referred / quoting / producing / first-year value.
// ⚠️ Producing and quoting mean exactly what they mean on the pipeline page -- a SOLD quote in the
// last 365 days, and any quote in that window. Two screens disagreeing about "producing" is worse
// than one of them not having it.
function adminReferralsHTML() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Referrals — ABY admin</title>
<style> *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}
 header{background:#143c73;color:#fff;padding:13px 20px;display:flex;align-items:center;gap:16px}
 header b{font-size:16px;font-weight:600} header a{color:#fff;font-size:13px;text-decoration:none;opacity:.85;padding:4px 8px;border-radius:5px} header a:hover{opacity:1;background:rgba(255,255,255,.14)}
 header a.here{opacity:1;background:rgba(255,255,255,.2);font-weight:600}
 /* An ACTION, not a destination. Tinted so it reads as the thing you DO on a bar
    where everything else is somewhere you go to look. */
 header a.act{background:#2f9e73;opacity:1;font-weight:600}
 header a.act:hover{background:#37b284}
 main{max-width:1100px;margin:0 auto;padding:20px}
 .card{background:#fff;border:1px solid #e3e9f0;border-radius:9px;padding:16px 18px;margin-bottom:16px}
 h2{margin:0 0 4px;font-size:15px} .sub{margin:0 0 12px;color:#5b6b7f;font-size:13px}
 table{width:100%;border-collapse:collapse;font-size:14px}
 th{text-align:left;font-size:12px;text-transform:uppercase;color:#5b6b7f;border-bottom:1px solid #dfe5ec;padding:8px 6px}
 td{padding:8px 6px;border-bottom:1px solid #eef2f6}
 /* Eric, 2026-08-19: "The date looks stupid - not enough room." An ISO date wrapping
    after the month reads as broken data rather than as a narrow column. It is a fixed
    width string, so it should simply never wrap. */
 td.date,th.date{white-space:nowrap;width:1%}
 .n{text-align:right} .muted{color:#8a97a8}
 input,select{padding:6px 8px;border:1px solid #c8d2de;border-radius:6px;font-size:13px}
 button{padding:6px 12px;border:1px solid #143c73;background:#143c73;color:#fff;border-radius:6px;font-size:13px;cursor:pointer}
 button.ghost{background:#fff;color:#143c73}
 .partner{border:1px solid #e3e9f0;border-radius:9px;margin-bottom:14px;background:#fff}
 .phead{display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid #eef2f6;flex-wrap:wrap}
 .pname{font-weight:600;font-size:15px}
 .score{display:flex;gap:14px;margin-left:auto;flex-wrap:wrap;font-size:13px;color:#5b6b7f}
 .score b{color:#12263f}
 .pbody{padding:12px 16px}
 .warn{margin:0 0 14px;padding:10px 14px;border-radius:7px;background:#fdf1e0;border:1px solid #f0d9ae;color:#7a5410;font-size:13px}
</style></head><body>
<header><b>ABY admin</b><a href="/aby" class="act" title="Run a quote as ABY, with the internal overrides">Run a quote</a><a href="/admin">Quote log</a><a href="/admin/brokers">Brokers &amp; Agencies</a><a href="/admin/pipeline">Pipeline</a><a href="/admin/referrals" class="here">Referrals</a><a href="/admin/rates">Rates</a></header>
<main>
  <div id="warn" class="warn" style="display:none"></div>

  <div class="card">
    <h2>Referral partners</h2>
    <p class="sub">Who sends brokers to ABY. A general agency, an association, anyone.
      Add the partner first, then the reps there who actually send the business.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <input id="pName" placeholder="Partner name, e.g. Emerson Rogers" style="min-width:260px">
      <input id="pKind" placeholder="Kind, e.g. general agency" style="min-width:180px">
      <button onclick="addPartner()">Add partner</button>
      <span id="pMsg" class="muted" style="align-self:center"></span>
    </div>
  </div>

  <div id="partners"></div>

  <div class="card">
    <h2>Brokers with no referral recorded</h2>
    <p class="sub">Everyone who came to ABY some other way, or whose referrer has not been set yet.
      Assign one and they move up into that partner.</p>
    <div id="unattributed"></div>
  </div>
</main>
<script>
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function money(v){return v?('$'+Number(v).toLocaleString('en-US',{maximumFractionDigits:0})):'—'}
 function day(s){return s?String(s).slice(0,10):'—'}
 var DATA={partners:[],contacts:[],brokers:[]};

 async function load(){
   var d=await (await fetch('/api/admin/referrals')).json().catch(function(){return{}});
   DATA=d;
   var bad=d.unavailable?Object.keys(d.unavailable):[];
   var w=document.getElementById('warn');
   if(bad.length){
     w.style.display='block';
     w.textContent='Some of this could not be read: '+bad.join(', ')
       +'. If this is the first time, open /api/migrate while signed in. Details: '+d.unavailable[bad[0]];
   } else { w.style.display='none'; }
   paint();
 }

 // ⭐ The scoreboard is computed from the brokers list rather than asked for separately, so the
 // totals can never disagree with the rows printed underneath them.
 function score(rows){
   return { referred: rows.length,
            quoting: rows.filter(function(b){return b.recent>0}).length,
            producing: rows.filter(function(b){return b.sold_recent>0}).length,
            value: rows.reduce(function(a,b){return a+Number(b.value||0)},0) };
 }

 function brokerTable(rows){
   if(!rows.length) return '<p class="muted">Nobody yet.</p>';
   return '<table><thead><tr><th>Broker</th><th>Agency</th><th>Referred</th>'
     +'<th class="n">Quotes</th><th class="n">Value</th><th>Rep</th></tr></thead><tbody>'
     + rows.map(function(b){
         var reps=DATA.contacts.filter(function(c){return c.partner_id===b.partner_id});
         var sel='<select onchange="setRef(this)" data-b="'+esc(b.id)+'">'
           +'<option value="">— rep not known —</option>'
           + reps.map(function(c){
               return '<option value="'+esc(c.id)+'"'+(c.id===b.contact_id?' selected':'')+'>'
                 +esc(c.name)+(c.active?'':' (retired)')+'</option>';
             }).join('')+'</select>';
         return '<tr><td>'+esc(b.name||b.email)+'</td><td>'+esc(b.agency||'—')+'</td>'
           +'<td>'+day(b.referred_at)+'</td><td class="n">'+b.quotes+'</td>'
           +'<td class="n">'+money(b.value)+'</td><td>'+sel+'</td></tr>';
       }).join('')+'</tbody></table>';
 }

 function paint(){
   var host=document.getElementById('partners');
   host.innerHTML = DATA.partners.map(function(p){
     var mine=DATA.brokers.filter(function(b){return b.partner_id===p.id});
     var s=score(mine);
     var reps=DATA.contacts.filter(function(c){return c.partner_id===p.id});
     // Per rep, the same four numbers -- because "thank the reps" is a per-person act.
     var repRows=reps.map(function(c){
       var r=DATA.brokers.filter(function(b){return b.contact_id===c.id});
       var rs=score(r);
       return '<tr><td>'+esc(c.name)+(c.active?'':' <span class="muted">(retired)</span>')+'</td>'
         +'<td>'+esc(c.email||'—')+'</td><td class="n">'+rs.referred+'</td>'
         +'<td class="n">'+rs.quoting+'</td><td class="n">'+rs.producing+'</td>'
         +'<td class="n">'+money(rs.value)+'</td></tr>';
     }).join('');
     return '<div class="partner"><div class="phead">'
       +'<span class="pname">'+esc(p.name)+'</span>'
       +(p.kind?'<span class="muted">'+esc(p.kind)+'</span>':'')
       +'<span class="score"><span>referred <b>'+s.referred+'</b></span>'
       +'<span>quoting <b>'+s.quoting+'</b></span>'
       +'<span>producing <b>'+s.producing+'</b></span>'
       +'<span>value <b>'+money(s.value)+'</b></span></span></div>'
       +'<div class="pbody">'
       +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
       +'<input placeholder="Rep name" data-p="'+esc(p.id)+'" class="rn" style="min-width:180px">'
       +'<input placeholder="Email" data-p="'+esc(p.id)+'" class="re" style="min-width:200px">'
       +'<button class="ghost" onclick="addContact(this)" data-p="'+esc(p.id)+'">Add rep</button></div>'
       +(reps.length
          ? '<table><thead><tr><th>Rep</th><th>Email</th><th class="n">Referred</th>'
            +'<th class="n">Quoting</th><th class="n">Producing</th><th class="n">Value</th></tr></thead><tbody>'
            +repRows+'</tbody></table>'
          : '<p class="muted">No reps yet.</p>')
       +'<h2 style="margin-top:14px">Brokers referred</h2>'+brokerTable(mine)
       +'</div></div>';
   }).join('') || '<div class="card"><p class="muted">No partners yet. Add one above.</p></div>';

   var none=DATA.brokers.filter(function(b){return !b.partner_id});
   document.getElementById('unattributed').innerHTML = none.length
     ? '<table><thead><tr><th>Broker</th><th>Agency</th><th class="n">Quotes</th><th>Assign to</th></tr></thead><tbody>'
       + none.map(function(b){
           var opts=DATA.partners.map(function(p){
             var reps=DATA.contacts.filter(function(c){return c.partner_id===p.id});
             return reps.length
               ? reps.map(function(c){return '<option value="c:'+esc(c.id)+'">'+esc(p.name)+' — '+esc(c.name)+'</option>'}).join('')
                 +'<option value="p:'+esc(p.id)+'">'+esc(p.name)+' — rep not known</option>'
               : '<option value="p:'+esc(p.id)+'">'+esc(p.name)+' — rep not known</option>';
           }).join('');
           return '<tr><td>'+esc(b.name||b.email)+'</td><td>'+esc(b.agency||'—')+'</td>'
             +'<td class="n">'+b.quotes+'</td>'
             +'<td><select onchange="setRef(this)" data-b="'+esc(b.id)+'">'
             +'<option value="">— not referred —</option>'+opts+'</select></td></tr>';
         }).join('')+'</tbody></table>'
     : '<p class="muted">Everyone has a referrer recorded.</p>';
 }

 async function addPartner(){
   var name=document.getElementById('pName').value.trim();
   var kind=document.getElementById('pKind').value.trim();
   var m=document.getElementById('pMsg');
   if(!name){ m.textContent='Name it first.'; return; }
   m.textContent='Saving…';
   var r=await fetch('/api/admin/referral-partner',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({name:name,kind:kind})});
   var d=await r.json().catch(function(){return{}});
   m.textContent = r.ok ? 'Added' : (d.error||'Could not add it');
   if(r.ok){ document.getElementById('pName').value=''; document.getElementById('pKind').value=''; load(); }
 }

 async function addContact(btn){
   var pid=btn.getAttribute('data-p');
   var name=document.querySelector('input.rn[data-p="'+pid+'"]').value.trim();
   var email=document.querySelector('input.re[data-p="'+pid+'"]').value.trim();
   if(!name) return;
   var r=await fetch('/api/admin/referral-contact',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({partnerId:pid,name:name,email:email})});
   if(r.ok) load(); else await failed(r,'Could not add that rep.');
 }

 // ⛔⛔ A FAILED SAVE MUST NOT LEAVE THE SCREEN SHOWING THE VALUE THAT DID NOT SAVE.
 // Both writes below used to read "if (r.ok) load();" with no else, so a 500 was completely
 // silent: the dropdown kept the rep you had just chosen while the database still held the old
 // one, and nothing on the page disagreed with you. On a page whose whole job is knowing which
 // rep to thank, a wrong answer that looks saved is the worst thing it can do.
 // ⭐ So it reloads FIRST -- putting the screen back to what the server actually has, which
 // reverts the control on its own -- and only then says why. The order matters: load() owns the
 // warning banner and would wipe a message written before it.
 async function failed(r, fallback){
   var d=await r.json().catch(function(){return{}});
   await load();
   var w=document.getElementById('warn');
   w.style.display='block';
   w.textContent=(d.error||fallback);
 }

 // ⚠️ The value carries WHICH KIND of assignment it is -- a rep or a partner-only -- so the server
 // is never asked to guess, and a partner is always derived from the rep when there is one.
 async function setRef(sel){
   var v=sel.value, body={brokerId:sel.getAttribute('data-b')};
   if(v.indexOf('c:')===0) body.contactId=v.slice(2);
   else if(v.indexOf('p:')===0) body.partnerId=v.slice(2);
   var r=await fetch('/api/admin/broker-referral',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify(body)});
   if(r.ok) load(); else await failed(r,'Could not save that referral.');
 }

 load();
</script></body></html>`;
}

function adminRatesHTML() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Rates — ABY admin</title>
<style> *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}
 header{background:#143c73;color:#fff;padding:13px 20px;display:flex;align-items:center;gap:16px}
 header b{font-size:16px;font-weight:600} header a{color:#fff;font-size:13px;text-decoration:none;opacity:.85;padding:4px 8px;border-radius:5px} header a:hover{opacity:1;background:rgba(255,255,255,.14)}
 /* The page you are on. Without this the class added to the nav renders identically to the
    other three links -- markup that changes nothing, which is its own small trap. */
 header a.here{opacity:1;background:rgba(255,255,255,.2);font-weight:600}
 /* An ACTION, not a destination. Tinted so it reads as the thing you DO on a bar
    where everything else is somewhere you go to look. */
 header a.act{background:#2f9e73;opacity:1;font-weight:600}
 header a.act:hover{background:#37b284}
 main{max-width:1180px;margin:22px auto;padding:0 18px}
 .card{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:20px;margin-bottom:18px}
 h2{font-size:16px;margin:0 0 4px} .sub{color:#5b6b7f;font-size:13px;margin:0 0 14px}
 table{width:100%;border-collapse:collapse;font-size:14px;border:1px solid #dfe5ec}
 /* Eric, 2026-08-19: "can we add grid lines - will be easier to read." Ten columns of numbers
    with only horizontal rules makes the eye lose its place between Amount, Min, Max, Setup,
    Renewal and Annual -- the six that matter and all look alike. Vertical rules plus a zebra
    stripe give both axes something to track. */
 th{text-align:left;font-size:12px;text-transform:uppercase;color:#5b6b7f;border-bottom:2px solid #cfd8e3;border-right:1px solid #dfe5ec;padding:8px 6px;background:#f4f7fa;position:sticky;top:0}
 th:last-child,td:last-child{border-right:none}
 td{padding:8px 6px;border-bottom:1px solid #eef2f6;border-right:1px solid #eef2f6}
 tbody tr:nth-child(even){background:#fafcfe}
 tbody tr:hover{background:#eef4fa}
 .muted{color:#8a97a8}
 .n{text-align:right;font-variant-numeric:tabular-nums}
 .filters{display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap}
 .filters button{background:#fff;border:1px solid #c8d2de;border-radius:6px;padding:7px 13px;cursor:pointer;font-size:14px}
 .filters button.on{background:#143c73;color:#fff;border-color:#143c73}
 select{padding:5px 7px;border:1px solid #c8d2de;border-radius:5px;font-size:13px}
 a.dl{display:inline-block;background:#143c73;color:#fff;padding:8px 15px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600}
</style></head><body>
<header><b>ABY admin</b><a href="/aby" class="act" title="Run a quote as ABY, with the internal overrides">Run a quote</a><a href="/admin">Quote log</a><a href="/admin/brokers">Brokers &amp; Agencies</a><a href="/admin/pipeline">Pipeline</a><a href="/admin/referrals">Referrals</a><a href="/admin/rates" class="here">Rates</a></header>
<main>
  <div class="filters">
    <span class="muted" style="font-size:13px">State:</span>
    <select id="state"></select>
    <span class="muted" style="font-size:13px">Book:</span>
    <select id="book"><option value="commissioned">Commissioned</option><option value="noCommission">No commission</option></select>
    <a href="#" class="dl" id="dl" style="margin-left:auto">Download all rates (CSV)</a>
  </div>
  <div class="card"><h2 id="title">Rates</h2>
    <p class="sub">Read from the same pricing file the quote tool uses, so this is what a broker would be quoted.</p>
    <div id="out"><p class="muted">Loading...</p></div></div>
</main>
<script src="/assets/js/data/pricing.js"></script>
<!-- The SAME registry the quote tool shows brokers, so this page names a product the way
     everyone here says it out loud. Without it the table printed raw ids -- "pop", "docsOnly",
     "section132" -- on the one page whose entire job is being read easily. -->
<script src="/assets/js/data/products.js"></script>
<script>
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 var P=(window.ABYQuote&&ABYQuote.pricing)||{};
 var st=document.getElementById('state');
 Object.keys(P).forEach(function(k){var o=document.createElement('option');o.value=k;o.textContent=(k==='OUTSIDE'?'Outside Texas':k);st.appendChild(o)});
 function money(v){return (v==null||v==='')?'':('$'+v)}
 // ⭐ NAMES COME FROM products.js, THE SAME FILE THE QUOTE TOOL SHOWS BROKERS. The table read
 // "pop / docsOnly / section132" -- internal ids -- on the one page whose entire job is being
 // read easily. A second copy of the names here would drift; mapping through the registry cannot.
 // ⚠️ It falls back to the raw id when a product is priced but NOT registered, because that is a
 // real disagreement between the rate book and the product list, and worth seeing rather than
 // hiding behind a blank.
 function prodName(id){
   var list=(window.ABYQuote&&ABYQuote.products)||[];
   var p=list.filter(function(x){return x.id===id})[0];
   return p?(p.shortName||p.name||id):id;
 }
 function pkgName(pid,key){
   if(!key) return '';
   if(key==='additional fee') return 'Additional fee';
   var list=(window.ABYQuote&&ABYQuote.products)||[];
   var p=list.filter(function(x){return x.id===pid})[0];
   var pk=p&&p.packages?p.packages.filter(function(k){return k.id===key})[0]:null;
   return pk?(pk.name||key):key;
 }
 // Every priced thing, flattened to one row each. Used for BOTH the screen and the CSV, so what is
 // downloaded is what was displayed.
 function rows(state,book){
   var out=[], b=(P[state]||{})[book]||{};
   Object.keys(b).forEach(function(pid){
     var p=b[pid]; if(!p||typeof p!=='object') return;
     function tiers(list,pkg){(list||[]).forEach(function(t){
       out.push({product:pid,pkg:pkg||'',item:t.label||'',type:t.type||'',amount:t.amount,min:t.minMonthly,max:t.maxCount,setup:'',renewal:'',annual:''});
     })}
     if(p.monthlyTiers) tiers(p.monthlyTiers,'');
     if(p.packages) Object.keys(p.packages).forEach(function(k){
       var pk=p.packages[k];
       out.push({product:pid,pkg:k,item:pk.description||'',type:pk.formula?'formula':'package',
         amount:pk.formula?pk.formula.base:'',min:pk.formula?pk.formula.perForm:'',max:'',
         setup:pk.setupFee,renewal:pk.renewalFee,annual:pk.annualFee});
       if(pk.monthlyTiers) tiers(pk.monthlyTiers,k);
     });
     if(!p.monthlyTiers&&!p.packages) out.push({product:pid,pkg:'',item:p.description||'',type:p.type||'',amount:'',min:'',max:'',setup:p.setupFee,renewal:p.renewalFee,annual:p.annualFee});
     (p.additionalFees||[]).forEach(function(f){
       out.push({product:pid,pkg:'additional fee',item:f.label||'',type:f.unit||'',amount:f.amount,min:'',max:'',setup:'',renewal:'',annual:''});
     });
   });
   return out;
 }
 function draw(){
   var state=st.value, book=document.getElementById('book').value;
   document.getElementById('title').textContent='Rates \u2014 '+(state==='OUTSIDE'?'Outside Texas':state)+', '+(book==='commissioned'?'commissioned':'no commission');
   var r=rows(state,book);
   document.getElementById('out').innerHTML='<table><thead><tr><th>Product</th><th>Package</th><th>Item</th><th>Type</th><th class="n">Amount</th><th class="n">Min</th><th class="n">Max</th><th class="n">Setup</th><th class="n">Renewal</th><th class="n">Annual</th></tr></thead><tbody>'
     + r.map(function(x){return '<tr><td>'+esc(prodName(x.product))+'</td><td>'+esc(pkgName(x.product,x.pkg))+'</td><td>'+esc(x.item)+'</td><td>'+esc(x.type)+'</td><td class="n">'+esc(money(x.amount))+'</td><td class="n">'+esc(money(x.min))+'</td><td class="n">'+esc(x.max==null?'':x.max)+'</td><td class="n">'+esc(money(x.setup))+'</td><td class="n">'+esc(money(x.renewal))+'</td><td class="n">'+esc(money(x.annual))+'</td></tr>'}).join('')
     + '</tbody></table><p class="sub" style="margin-top:10px">'+r.length+' priced rows.</p>';
 }
 st.onchange=draw; document.getElementById('book').onchange=draw; draw();
 // 🔴 CSV INJECTION GUARD. A cell beginning = + - or @ is executed as a FORMULA by Excel when the
 // file is opened. These values are broker-facing product names, so the risk is real and the fix is
 // one apostrophe. This project has been bitten by exactly this before.
 function cell(v){
   var t=(v==null?'':String(v));
   if(/^[=+\\-@\\t\\r]/.test(t)) t="'"+t;
   return '"'+t.replace(/"/g,'""')+'"';
 }
 document.getElementById('dl').onclick=function(e){
   e.preventDefault();
   var head=['state','book','product','package','item','type','amount','min','max','setup','renewal','annual'];
   var lines=[head.map(cell).join(',')];
   Object.keys(P).forEach(function(state){
     ['commissioned','noCommission'].forEach(function(book){
       rows(state,book).forEach(function(x){
         lines.push([state,book,x.product,x.pkg,x.item,x.type,x.amount,x.min,x.max,x.setup,x.renewal,x.annual].map(cell).join(','));
       });
     });
   });
   var blob=new Blob(['\ufeff'+lines.join('\\r\\n')],{type:'text/csv;charset=utf-8'});
   var a=document.createElement('a');
   a.href=URL.createObjectURL(blob); a.download='aby-rates.csv'; a.click();
 };
</script></body></html>`;
}

// ─── ABY admin: brokers, agencies and sales stats (Eric, 2026-08-18) ───────────
//
// ⭐ ALL BEHIND `withAuth`, i.e. the ABY admin login. These answer ABY's own commercial questions
// ("who has registered, whose account is it, how much are they quoting"), which is a different
// audience from /api/broker/* (one broker's own data) and /api/broker-quotes (the dashboard).
//
// ⚠️ `rep` FILTERING IS A VIEW, NOT A PERMISSION. Eric: "filter brokers and quotes by me and Niels
// so we only see ours." Both of them are ABY admins and can see everything; this narrows a list so
// it is readable, and must not be mistaken for access control.

/** Everyone who has registered, with their agency, their owner, and how much they have quoted. */
async function handleAdminBrokers(request, env) {
  const rep = (new URL(request.url).searchParams.get('rep') || '').trim().toLowerCase();
  const where = rep ? "WHERE lower(COALESCE(b.assigned_rep,'')) = ?" : '';
  const args = rep ? [rep] : [];
  const sql =
    "SELECT b.id, b.email, b.name, b.phone, b.role, b.assigned_rep, b.created_at, b.last_login_at, " +
    "       CASE WHEN b.password_hash = '' THEN 1 ELSE 0 END AS pending, " +
    "       a.id AS agency_id, a.name AS agency_name, a.assigned_rep AS agency_rep, " +
    "       (SELECT COUNT(*) FROM quotes q WHERE lower(trim(q.broker_email)) = lower(trim(b.email)) AND trim(q.broker_email) <> '') AS quote_count " +
    "FROM brokers b LEFT JOIN agencies a ON a.id = b.agency_id " +
    where + " ORDER BY quote_count DESC, b.created_at DESC LIMIT 500";
  try {
    const r = await env.DB.prepare(sql).bind(...args).all();
    return jsonResp({ brokers: r.results || [] });
  } catch (err) {
    // The brokers table may not exist on an un-migrated database. Say so plainly rather than 500.
    return jsonResp({ brokers: [], error: String(err && err.message || err) });
  }
}

/** Assign a broker or an agency to a rep. */
async function handleAdminAssign(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const rep = String(body.rep || '').trim().toLowerCase();
  // '' clears the assignment, which has to stay possible -- an unassigned broker is a real state
  // and "assign to somebody to make the warning go away" is how a list stops meaning anything.
  if (rep && rep !== 'eric' && rep !== 'niels') return jsonResp({ error: 'Unknown rep.' }, 400);
  const table = body.kind === 'agency' ? 'agencies' : 'brokers';
  const id = String(body.id || '');
  if (!id) return jsonResp({ error: 'Which one?' }, 400);
  await env.DB.prepare(`UPDATE ${table} SET assigned_rep = ? WHERE id = ?`).bind(rep || null, id).run();
  return jsonResp({ ok: true });
}

/**
 * Quote counts by agency and by agent.
 *
 * ⚠️ COUNTED FROM `quotes`, JOINED ON EMAIL, WHICH MEANS QUOTES FROM PEOPLE WITH NO ACCOUNT STILL
 * COUNT -- they simply have no agency. That is the honest picture: most of ABY's quoting history
 * predates accounts entirely, and a stat that silently dropped it would understate the tool.
 */
// The agency an aggregate row belongs to. ⭐ ONE definition used by BOTH the query and its
// GROUP BY, because those two disagreeing is exactly the bug this replaced.
const AGENCY_EXPR = "COALESCE(a.name, NULLIF(trim(q.broker_agency),''), '(no agency)')";

async function handleAdminStats(request, env) {
  const rep = (new URL(request.url).searchParams.get('rep') || '').trim().toLowerCase();
  const repFilter = rep ? "AND lower(COALESCE(b.assigned_rep,'')) = ?" : '';
    // Declared once so every section filters on the SAME definition of "whose quote this is",
    // and so no query has to repeat an expression it might repeat differently.
    const BROKER_JOIN = "LEFT JOIN brokers b ON lower(trim(b.email)) = lower(trim(q.broker_email)) AND trim(q.broker_email) <> ''";
    const STATUS_EXPR = "COALESCE(q.status,'P')";
    const BUCKET_EXPR = "CASE " +
      "  WHEN q.created_at >= datetime('now','-7 days')  THEN 'week' " +
      "  WHEN q.created_at >= datetime('now','-30 days') THEN 'month' " +
      "  WHEN q.created_at >= datetime('now','-90 days') THEN 'quarter' " +
      "  ELSE 'older' END";
  const args = rep ? [rep] : [];
  try {
    // 🔴🔴 IT USED TO REQUIRE A BROKER EMAIL, WHICH HID MOST OF THE BOOK.
    // Eric, 2026-08-19: "Why would it only work if it carries a broker email? That makes it fairly
    // worthless to us." He is right. The 321 rows imported from the 2026 spreadsheet carry an
    // AGENCY and an ABY rep, and largely no broker email -- so a WHERE on email quietly dropped
    // them and the table reported on the handful of quotes run through the live tool.
    // ⭐ THE IDENTITY IS NOW WHATEVER THE ROW ACTUALLY HAS: email if there is one, else the broker
    // name, else the agency. Nothing is excluded, and rows with none of the three are GROUPED and
    // COUNTED as "(not stated)" rather than dropped -- an unattributable quote is a real fact about
    // the book, and a table that silently omits it reports a smaller business than exists.
    // ⚠️ A name-keyed group is weaker than an email-keyed one: "Niels" and "Niels Andersen" are two
    // rows. That is a known cost, and it is far smaller than showing none of them.
    const agentKey =
      "COALESCE(NULLIF(lower(trim(q.broker_email)),''), " +
      "         NULLIF(lower(trim(q.broker_name)),''), " +
      "         NULLIF(lower(trim(q.broker_agency)),''), '(not stated)')";
    const byAgent = await env.DB.prepare(
      "SELECT " + agentKey + " AS key, " +
      "       MAX(NULLIF(trim(q.broker_email),'')) AS email, " +
      "       MAX(NULLIF(trim(q.broker_name),'')) AS name, " +
      "       MAX(COALESCE(a.name, NULLIF(trim(q.broker_agency),''))) AS agency, " +
      "       MAX(b.assigned_rep) AS rep, " +
      "       COUNT(*) AS n, MAX(q.created_at) AS last_quote " +
      "FROM quotes q " +
      "LEFT JOIN brokers b ON lower(trim(b.email)) = lower(trim(q.broker_email)) AND trim(q.broker_email) <> '' " +
      "LEFT JOIN agencies a ON a.id = b.agency_id " +
      "WHERE 1=1 " + repFilter +
      " GROUP BY key ORDER BY n DESC LIMIT 1000").bind(...args).all();

    const byAgency = await env.DB.prepare(
      // 🔴🔴 IT GROUPED ALL 371 QUOTES INTO ONE BLANK ROW, AND THE CAUSE IS A SHADOWED ALIAS.
      // This read `... AS agency ... GROUP BY agency`. The `brokers` table HAS A REAL COLUMN CALLED
      // `agency`, and the LEFT JOIN brings it into scope -- so SQLite bound GROUP BY to `b.agency`
      // rather than the SELECT alias. That column is NULL for every quote whose email matches no
      // account, which is nearly all of them, so the whole book collapsed into a single group with
      // a blank label: "371 quotes, 6 agents" against no agency name.
      // ⭐ GROUPING BY THE EXPRESSION cannot be shadowed. The alias is renamed too, so no future
      // join can quietly capture it again.
      // ⚠️ And NULLIF on the trimmed value, not a bare COALESCE: an EMPTY STRING is not NULL, so
      // `COALESCE(x,'(no agency)')` would leave '' as its own nameless group -- the same defect one
      // layer down.
      "SELECT " + AGENCY_EXPR + " AS agency_label, MAX(a.id) AS agency_id, " +
      "       MAX(COALESCE(a.assigned_rep, b.assigned_rep)) AS rep, " +
      "       COUNT(*) AS n, " +
      // ⚠️ Counts distinct identities the same way the agent table groups them, so "6 agents" and
      // the agent list can no longer disagree about what an agent is.
      "       COUNT(DISTINCT COALESCE(NULLIF(lower(trim(q.broker_email)),''), " +
      "                               NULLIF(lower(trim(q.broker_name)),''))) AS agents, " +
      "       MAX(q.created_at) AS last_quote " +
      "FROM quotes q " +
      "LEFT JOIN brokers b ON lower(trim(b.email)) = lower(trim(q.broker_email)) AND trim(q.broker_email) <> '' " +
      "LEFT JOIN agencies a ON a.id = b.agency_id " +
      "WHERE 1=1 " + repFilter +
      " GROUP BY " + AGENCY_EXPR + " ORDER BY n DESC LIMIT 1000").bind(...args).all();

    // 🔴 THE "SHOW: ERIC / NIELS" FILTER HAS TO REACH THIS LINE TOO.
    // It used to count the WHOLE BOOK regardless of who was selected, while the two tables below
    // it were filtered -- so the headline said 371 quotes over a table that added up to 46, and
    // neither number was wrong on its own. A filter that silently covers only part of a page is
    // worse than no filter, because the parts it misses look like corroboration.
    const totals = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM quotes q " + BROKER_JOIN + " WHERE 1=1 " + repFilter + ") AS quotes, " +
      "       (SELECT COUNT(*) FROM brokers b WHERE 1=1 " + repFilter + ") AS brokers, " +
      "       (SELECT COUNT(*) FROM agencies a WHERE 1=1 " +
                (rep ? "AND lower(COALESCE(a.assigned_rep,'')) = ?" : '') + ") AS agencies"
    ).bind(...args, ...args, ...args).first();

    // ── By status, with value (Eric, 2026-08-18) ───────────────────────────────────────────
    // ⚠️ `valued` IS REPORTED ALONGSIDE `n` ON PURPOSE. Value was only added today, so most rows
    // have none, and a total presented without saying how many quotes it is drawn from would read
    // as the whole book. A proportion is not a fact unless its denominator travels with it.
    let byStatus = [], aging = [];
    try {
      const r1 = await env.DB.prepare(
        // ⚠️ GROUP BY THE EXPRESSION, and qualify every column with q. -- the join below brings
        // the brokers table into scope, and grouping by a bare alias is exactly how "Quotes by
        // agency" collapsed into one blank row.
        // The OUTPUT name stays `status` -- the page reads x.status, and an alias in SELECT is
        // only a label on the result. The shadowing hazard was in GROUP BY, which now uses the
        // expression, so the alias is safe to keep.
        "SELECT " + STATUS_EXPR + " AS status, COUNT(*) AS n, " +
        "       SUM(CASE WHEN q.first_year_value IS NOT NULL THEN 1 ELSE 0 END) AS valued, " +
        "       COALESCE(SUM(q.first_year_value),0) AS value " +
        "FROM quotes q " + BROKER_JOIN + " WHERE 1=1 " + repFilter +
        " GROUP BY " + STATUS_EXPR).bind(...args).all();
      byStatus = r1.results || [];

      // How long has each open quote been sitting? Only P and I -- a Sold or Dead quote is not
      // waiting on anybody, and including them would bury the ones that are.
      const r2 = await env.DB.prepare(
        "SELECT " + BUCKET_EXPR + " AS bucket, COUNT(*) AS n, " +
        "       COALESCE(SUM(q.first_year_value),0) AS value " +
        "FROM quotes q " + BROKER_JOIN +
        " WHERE " + STATUS_EXPR + " IN ('P','I') " + repFilter +
        " GROUP BY " + BUCKET_EXPR).bind(...args).all();
      aging = r2.results || [];
    } catch (err) {
      // Columns may predate the migration. Report nothing rather than a wrong zero.
      console.warn('value/aging unavailable:', String(err && err.message || err));
    }

    return jsonResp({ byAgent: byAgent.results || [], byAgency: byAgency.results || [], totals, byStatus, aging });
  } catch (err) {
    // 🔴🔴 ONE FAILING QUERY USED TO BLANK THE WHOLE PAGE, AND SAY NOTHING ABOUT IT.
    // Eric, 2026-08-19: "nothing is filled in on the Brokers & agencies page." The three queries
    // above share one try, so a single missing column -- b.assigned_rep, added by a migration that
    // has not been run since -- threw, and this returned empty arrays for EVERYTHING. byStatus and
    // aging read only the quotes table and would have worked perfectly; they never got the chance.
    // ⛔ And the error was returned while the screen displayed nothing, so a BROKEN page and an
    // EMPTY one looked identical. That is the undiagnosable-UI trap with the volume at zero.
    // ⭐ Now every block is retried on its own and whatever cannot run is NAMED.
    return await statsPerBlock(env, String(err && err.message || err), rep);
  }
}

/**
 * Re-run the stats one block at a time, so a query that cannot run costs only its own section.
 *
 * ⭐ IT REPORTS `unavailable` PER SECTION RATHER THAN RETURNING ZERO. A zero is a claim -- "this
 * agency has no quotes" -- and a missing column is not evidence for it. The screen can then say
 * which section could not be read and why, which is the difference between a bug somebody can act
 * on and a page that merely looks empty.
 * ⚠️ These fallbacks read ONLY `quotes`, with no join to `brokers` or `agencies`. That is the
 * point: the join is what fails when those tables are behind a migration, and the quote table on
 * its own still answers most of the question.
 */
async function statsPerBlock(env, firstError, rep) {
  const out = { byAgent: [], byAgency: [], byStatus: [], aging: [], totals: null,
                unavailable: {}, error: firstError };

  // 🔴 THE REP FILTER HAS TO SURVIVE THE FALLBACK, OR IT LIES.
  // This path runs when the main query has already failed, and it used not to receive `rep` at
  // all -- so with "Show: Eric" selected it quietly returned the WHOLE BOOK while the button
  // still read as active. Unfiltered numbers under a filter label are worse than no numbers:
  // there is nothing on the screen to tell you they are not the ones you asked for.
  // ⭐ So the filter is applied here too. It needs the brokers join, which is one of the things
  // that may be broken -- and that is the right trade: a section that cannot honour the filter
  // reports itself unavailable, section by section, rather than answering a different question.
  const repFilter = rep ? "AND lower(COALESCE(b.assigned_rep,'')) = ?" : '';
  const joinIf    = rep ? " LEFT JOIN brokers b ON lower(trim(b.email)) = lower(trim(q.broker_email)) AND trim(q.broker_email) <> '' " : ' ';
  const args      = rep ? [rep] : [];
  const attempt = async (name, run) => {
    try { return await run(); }
    catch (err) { out.unavailable[name] = String(err && err.message || err); return null; }
  };

  // ⚠️ SAME IDENTITY RULE AS THE MAIN QUERY. The fallback existing at all is only useful if it
  // answers the same question; a fallback that quietly applies a different rule is a second bug
  // waiting for the day the first one fires.
  const agent = await attempt('byAgent', () => env.DB.prepare(
    "SELECT COALESCE(NULLIF(lower(trim(q.broker_email)),''), " +
    "                NULLIF(lower(trim(q.broker_name)),''), " +
    "                NULLIF(lower(trim(q.broker_agency)),''), '(not stated)') AS key, " +
    "       MAX(NULLIF(trim(q.broker_email),'')) AS email, " +
    "       MAX(NULLIF(trim(q.broker_name),'')) AS name, " +
    "       MAX(NULLIF(trim(q.broker_agency),'')) AS agency, NULL AS rep, COUNT(*) AS n, " +
    "       MAX(q.created_at) AS last_quote " +
    "FROM quotes q" + joinIf + "WHERE 1=1 " + repFilter +
    " GROUP BY key ORDER BY n DESC LIMIT 1000").bind(...args).all());
  if (agent) out.byAgent = agent.results || [];

  const agency = await attempt('byAgency', () => env.DB.prepare(
    "SELECT COALESCE(NULLIF(trim(q.broker_agency),''), '(no agency)') AS agency_label, " +
    "       NULL AS agency_id, NULL AS rep, COUNT(*) AS n, " +
    "       COUNT(DISTINCT COALESCE(NULLIF(lower(trim(q.broker_email)),''), " +
    "                               NULLIF(lower(trim(q.broker_name)),''))) AS agents, " +
    "       MAX(q.created_at) AS last_quote " +
    "FROM quotes q" + joinIf + "WHERE 1=1 " + repFilter +
    " GROUP BY COALESCE(NULLIF(trim(q.broker_agency),''), '(no agency)') " +
    "ORDER BY n DESC LIMIT 1000").bind(...args).all());
  if (agency) out.byAgency = agency.results || [];

  const totals = await attempt('totals', () => env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM quotes q" + joinIf + "WHERE 1=1 " + repFilter +
    ") AS quotes, NULL AS brokers, NULL AS agencies").bind(...args).first());
  if (totals) out.totals = totals;

  const st = await attempt('byStatus', () => env.DB.prepare(
    "SELECT COALESCE(q.status,'P') AS status, COUNT(*) AS n, " +
    "       SUM(CASE WHEN q.first_year_value IS NOT NULL THEN 1 ELSE 0 END) AS valued, " +
    "       COALESCE(SUM(q.first_year_value),0) AS value FROM quotes q" + joinIf +
    "WHERE 1=1 " + repFilter + " GROUP BY COALESCE(q.status,'P')").bind(...args).all());
  if (st) out.byStatus = st.results || [];

  const ag = await attempt('aging', () => env.DB.prepare(
    "SELECT CASE " +
    "  WHEN q.created_at >= datetime('now','-7 days')  THEN 'week' " +
    "  WHEN q.created_at >= datetime('now','-30 days') THEN 'month' " +
    "  WHEN q.created_at >= datetime('now','-90 days') THEN 'quarter' " +
    "  ELSE 'older' END AS bucket, COUNT(*) AS n, COALESCE(SUM(q.first_year_value),0) AS value " +
    "FROM quotes q" + joinIf + "WHERE COALESCE(q.status,'P') IN ('P','I') " + repFilter +
    " GROUP BY bucket").bind(...args).all());
  if (ag) out.aging = ag.results || [];

  return jsonResp(out);
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
    <div><a href="#" id="forgot" style="font-size:13px;color:#143c73;display:inline-block;margin-top:12px">Forgot your password?</a></div>
    <div class="msg" id="authMsg"></div>
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
    <div class="card" id="agencyCard" style="display:none">
      <h2>Your agency</h2>
      <p class="sub">The logo here applies to everyone in the agency who has not uploaded their own.</p>
      <label>Agency name</label><input type="text" id="aName">
      <label>Agency logo <span class="muted" style="font-weight:400">(PNG or JPG, under 300KB)</span></label>
      <input type="file" id="aLogo" accept="image/*">
      <img id="aLogoPrev" class="logo-prev" alt="Agency logo">
      <label style="margin-top:16px"><input type="checkbox" id="aShare" style="width:auto;margin-right:8px">Let everyone in the agency see each other's quotes</label>
      <p class="sub" style="margin-top:6px">You can see all of them either way, because you are the administrator.</p>
      <button class="primary" id="aSave">Save agency settings</button>
      <div class="msg" id="aMsg"></div>
    </div>

    <div class="card" id="inviteCard" style="display:none">
      <h2>Add people</h2>
      <p class="sub">One per line, as <strong>name, email</strong> — or just an email address on its own. Each person gets an email inviting them to choose a password. People who already have an account are skipped.</p>
      <textarea id="inviteBox" rows="6" style="width:100%;padding:9px 11px;border:1px solid #c8d2de;border-radius:6px;font:14px monospace" placeholder="Jane Smith, jane@agency.com&#10;Raj Patel, raj@agency.com"></textarea>
      <button class="primary" id="inviteGo">Send invitations</button>
      <div class="msg" id="inviteMsg"></div>
      <div id="memberList" style="margin-top:18px"></div>
    </div>

    <div class="card">
      <div class="tabs"><button id="tabMine" class="on">My quotes</button><button id="tabAgency">Agency quotes</button></div>
      <p class="sub" id="quotesSub">Every quote run under your email address.</p>
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
 $('forgot').onclick=async function(e){
   e.preventDefault();
   if(!$('sEmail').value){show($('authMsg'),'Enter your email address first, then click again.','err');return}
   var r=await fetch('/api/broker/forgot',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('sEmail').value})});
   var d=await r.json().catch(function(){return{}});
   show($('authMsg'),d.message||'If there is an account for that address, a link is on its way.','ok');
 };
 var agencyLogoData='', meEmail='';
 $('aLogo').onchange=function(){
   var f=this.files[0]; if(!f) return;
   var rd=new FileReader(); rd.onload=function(){agencyLogoData=rd.result;$('aLogoPrev').src=agencyLogoData;$('aLogoPrev').style.display='block'};
   rd.readAsDataURL(f);
 };
 $('aSave').onclick=async function(){
   var r=await fetch('/api/agency/settings',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({name:$('aName').value,logoDataUrl:agencyLogoData,shareQuotes:$('aShare').checked})});
   var d=await r.json().catch(function(){return{}});
   show($('aMsg'),r.ok?'Saved.':(d.error||'Could not save.'),r.ok?'ok':'err');
 };
 $('inviteGo').onclick=async function(){
   // 🔴🔴 A LINE THAT DID NOT PARSE USED TO VANISH WITHOUT A WORD, AND THE BOX WAS THEN CLEARED.
   // The old rule was "no comma, no person": a bare email address -- the single most likely thing
   // to be pasted out of a spreadsheet -- was dropped on the floor. Paste five people with two
   // bare emails among them and only three were invited, the confirmation counted only those
   // three without mentioning the other two, and the textarea was wiped, so the evidence went too.
   // ⭐ THE SERVER ONLY EVER REQUIRED AN EMAIL -- the name is optional there -- so a bare address
   // is now a perfectly good line, and that person simply arrives without a name.
   // ⭐ Anything with no at-sign at all BLOCKS THE SEND and is named back. Blocking beats sending
   // the good ones, because a partial send is the silent failure wearing a friendlier face, and
   // the box is left untouched so the typo can be fixed in place.
   // ⚠️ String.fromCharCode rather than a backslash-n regex: this page is a template literal and
   // it EATS lone backslashes (TRAPS #224).
   var people=[], unusable=[];
   $('inviteBox').value.split(String.fromCharCode(10)).forEach(function(raw){
     var l=raw.split(String.fromCharCode(13)).join('').trim();
     if(!l) return;
     var parts=l.split(',');
     var email=parts[parts.length-1].trim();
     // Trim each part BEFORE joining, or "Smith, Jane, x@y.com" arrives as "Smith  Jane"
     // with a double space -- the join happens between already-spaced fragments.
     var name=(parts.length>1)
       ? parts.slice(0,-1).map(function(s){return s.trim()}).filter(Boolean).join(' ')
       : '';
     if(email.indexOf('@')<0){ unusable.push(l); return; }
     people.push({name:name, email:email});
   });
   if(unusable.length){
     show($('inviteMsg'),'Nothing was sent. These lines have no email address in them: '
       +unusable.join(' · ')+'. Fix or remove them and try again.','err');
     return;
   }
   if(!people.length){show($('inviteMsg'),'Add at least one line. A name and email, or just an email.','err');return}
   $('inviteGo').disabled=true;$('inviteGo').textContent='Sending...';
   var r=await fetch('/api/agency/invite',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({people:people})});
   var d=await r.json().catch(function(){return{}});
   $('inviteGo').disabled=false;$('inviteGo').textContent='Send invitations';
   if(!r.ok){show($('inviteMsg'),d.error||'Could not send.','err');return}
   var bits=[];
   if(d.invited.length) bits.push(d.invited.length+' invited');
   if(d.skipped.length) bits.push(d.skipped.length+' skipped ('+d.skipped.map(function(x){return x.email+' - '+x.why}).join('; ')+')');
   if(d.failed.length)  bits.push(d.failed.length+' failed ('+d.failed.map(function(x){return x.email+' - '+x.why}).join('; ')+')');
   show($('inviteMsg'),bits.join('. '),d.failed.length?'err':'ok');
   $('inviteBox').value=''; loadAgency();
 };
 async function setRole(email,role){
   var r=await fetch('/api/agency/role',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email,role:role})});
   var d=await r.json().catch(function(){return{}});
   if(!r.ok){show($('inviteMsg'),d.error||'Could not change that.','err');return}
   loadAgency();
 }
 async function loadAgency(){
   var r=await fetch('/api/agency/me'); var d=await r.json().catch(function(){return{}});
   if(!d||!d.agency) return;
   $('aName').value=d.agency.name||''; $('aShare').checked=!!d.agency.shareQuotes;
   if(d.agency.logoDataUrl){agencyLogoData=d.agency.logoDataUrl;$('aLogoPrev').src=agencyLogoData;$('aLogoPrev').style.display='block'}
   var rows=(d.members||[]).map(function(m){
     var other=m.email!==meEmail;
     var btn=other?'<button style="font-size:12px;padding:4px 9px;border:1px solid #c8d2de;background:#fff;border-radius:5px;cursor:pointer" data-e="'+esc(m.email)+'" data-r="'+(m.role==='admin'?'member':'admin')+'">'+(m.role==='admin'?'Make member':'Make admin')+'</button>':'<span class="muted">you</span>';
     return '<tr><td>'+esc(m.name||'-')+'</td><td>'+esc(m.email)+'</td><td>'+esc(m.role||'member')+'</td><td>'+(m.pending?'<span class="muted">invited, not signed in yet</span>':'active')+'</td><td>'+btn+'</td></tr>';
   }).join('');
   $('memberList').innerHTML='<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>';
   Array.prototype.forEach.call($('memberList').querySelectorAll('button[data-e]'),function(b){
     b.onclick=function(){setRole(b.getAttribute('data-e'),b.getAttribute('data-r'))};
   });
 }
 $('tabMine').onclick=function(){$('tabMine').className='on';$('tabAgency').className='';$('quotesSub').textContent='Every quote run under your email address.';loadQuotes('/api/broker/quotes')};
 $('tabAgency').onclick=function(){$('tabAgency').className='on';$('tabMine').className='';$('quotesSub').textContent='Every quote run by anyone in your agency.';loadQuotes('/api/agency/quotes')};
 function enter(b){
   meEmail=b.email||'';
   $('authCard').style.display='none';$('appArea').style.display='block';$('out').style.display='inline-block';
   $('pName').value=b.name||'';$('pAgency').value=b.agency||'';$('pPhone').value=b.phone||'';
   if(b.logoDataUrl){logoData=b.logoDataUrl;$('logoPrev').src=logoData;$('logoPrev').style.display='block'}
   if(b.role==='admin'){$('agencyCard').style.display='block';$('inviteCard').style.display='block';loadAgency()}
   loadQuotes();
 }
 async function loadQuotes(url){
   var r=await fetch(url||'/api/broker/quotes'); var d=await r.json().catch(function(){return{}});
   var q=(d.quotes)||[];
   if(!q.length){
     var why=d.reason==='not-shared'?'Your agency administrator has not turned on shared quotes.'
       :d.reason==='no-agency'?'You are not part of an agency yet.'
       :'No quotes yet. Ones you run while signed in will appear here.';
     $('quotes').innerHTML='<p class="muted">'+why+'</p>';return}
   var rows=q.map(function(x){
     return '<tr><td>'+esc((x.created_at||'').slice(0,10))+'</td><td>'+esc(x.client_name||'—')+'</td><td>'+esc(x.broker_name||x.broker_email||'—')+'</td><td>'+esc(x.quote_number||'')+'</td><td>'+esc(x.state||'')+'</td></tr>';
   }).join('');
   $('quotes').innerHTML='<table><thead><tr><th>Date</th><th>Client</th><th>Run by</th><th>Quote number</th><th>State</th></tr></thead><tbody>'+rows+'</tbody></table>';
 }
 (async function(){
   var r=await fetch('/api/broker/me'); var d=await r.json().catch(function(){return{}});
   if(d && d.broker) enter(d.broker);
 })();
</script></body></html>`;
}

// The page an invited broker, or one who forgot their password, lands on from the email link.
// ⭐ ONE PAGE FOR BOTH, matching the one token column: "set your password because you were
// invited" and "set your password because you forgot" are the same action to the person doing it.
function setPasswordPageHTML() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Choose your password</title>
<style>
 body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}
 header{background:#143c73;color:#fff;padding:14px 22px;font-size:17px;font-weight:600}
 main{max-width:460px;margin:40px auto;padding:0 18px}
 .card{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:24px}
 h2{font-size:17px;margin:0 0 6px} p.sub{color:#5b6b7f;font-size:13px;margin:0 0 18px}
 label{display:block;font-size:13px;font-weight:600;margin:12px 0 4px}
 input{width:100%;padding:9px 11px;border:1px solid #c8d2de;border-radius:6px;font-size:14px;box-sizing:border-box}
 button{background:#143c73;color:#fff;border:0;border-radius:6px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;margin-top:18px}
 .msg{margin-top:14px;padding:10px 12px;border-radius:6px;font-size:13px;display:none}
 .err{background:#fdecec;color:#a12622;border:1px solid #f3c2c2}
 .ok{background:#e8f4ec;color:#1a5c3a;border:1px solid #b8d9c4}
</style></head><body>
<header>ABY Quote Tool</header>
<main><div class="card">
  <h2>Choose your password</h2>
  <p class="sub">At least 10 characters. You will be signed in straight away.</p>
  <label>New password</label><input type="password" id="p1" autocomplete="new-password">
  <label>Confirm</label><input type="password" id="p2" autocomplete="new-password">
  <button id="go">Set password and sign in</button>
  <div class="msg" id="m"></div>
</div></main>
<script>
 var $=function(i){return document.getElementById(i)};
 function show(t,c){var m=$('m');m.textContent=t;m.className='msg '+c;m.style.display='block'}
 var token=new URLSearchParams(location.search).get('token')||'';
 if(!token) show('That link is missing its code. Ask for a new one.','err');
 $('go').onclick=async function(){
   if($('p1').value!==$('p2').value){show('Those two passwords do not match.','err');return}
   var r=await fetch('/api/broker/set-password',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({token:token,password:$('p1').value})});
   var d=await r.json().catch(function(){return{}});
   if(!r.ok){show(d.error||'Could not set your password.','err');return}
   show('Done. Taking you to your account...','ok');
   setTimeout(function(){location.href='/broker'},900);
 };
</script></body></html>`;
}

// ─── Broker account API (F-6) ──────────────────────────────────────────────────

const MAX_LOGO_CHARS = 400000;   // ~300KB of image, generous for a logo and small enough for a row

function brokerPublic(b) {
  return b ? { email: b.email, name: b.name || '', agency: b.agency || '', phone: b.phone || '',
               logoDataUrl: b.logo_data_url || '',
               // The page shows the agency tab and the admin controls off these two.
               agencyId: b.agency_id || '', role: b.role || 'member' } : null;
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
  const agencyName = String(body.agency || '').slice(0, 120);

  // ⭐ SELF-SIGNUP ALWAYS CREATES A NEW AGENCY WITH THIS PERSON AS ITS ADMIN, and it deliberately
  // does NOT try to attach them to an existing one. There is nothing trustworthy to match on --
  // agency names are typed free text and email domains are mixed and often personal -- so guessing
  // would put a stranger inside somebody's book. ⛔ Joining an existing agency happens by
  // INVITATION, which is the direction Eric chose and the only one where somebody with authority
  // asserts the membership.
  const agencyId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO agencies (id, name, share_quotes, created_at) VALUES (?,?,?,?)')
    .bind(agencyId, agencyName || (String(body.name || '').slice(0, 120) || email), 0, new Date().toISOString()).run();

  await env.DB.prepare(
    'INSERT INTO brokers (id, email, password_hash, name, agency, phone, agency_id, role, created_at, last_login_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
  ).bind(id, email, await hashPassword(password),
    String(body.name || '').slice(0, 120), agencyName,
    String(body.phone || '').slice(0, 40), agencyId, 'admin',
    new Date().toISOString(), new Date().toISOString()).run();

  return new Response(JSON.stringify({ ok: true, broker: brokerPublic({ id, email, name: body.name, agency: agencyName, phone: body.phone, agency_id: agencyId, role: 'admin' }) }),
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

// ─── Agencies, invitations and resets (F-53) ───────────────────────────────────

/** Send one "set your password" email. Used for BOTH an invitation and a forgotten password. */
async function sendSetPasswordEmail(env, { to, link, agencyName, invited }) {
  if (!env.RESEND_API_KEY) { console.warn('RESEND_API_KEY not set — cannot send'); return false; }
  const subject = invited
    ? `You have been added to the ABY Quote Tool${agencyName ? ' by ' + agencyName : ''}`
    : 'Reset your ABY Quote Tool password';
  const intro = invited
    ? `${agencyName ? agencyName + ' has' : 'Your agency has'} set up an account for you on the ABY Quote Tool. Choose a password to get started.`
    : 'Somebody asked to reset the password on this account. If it was not you, ignore this email and nothing will change.';
  const html =
    `<div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#12263f">` +
    `<p>${esc(intro)}</p>` +
    `<p style="margin:24px 0"><a href="${esc(link)}" style="background:#143c73;color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none">Choose your password</a></p>` +
    `<p style="color:#5b6b7f;font-size:13px">This link works once and expires in 7 days.</p></div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `ABY Quote Tool <${env.FROM_EMAIL || 'onboarding@resend.dev'}>`,
                             to: [to], subject, html }),
    });
    if (!res.ok) console.error('invite/reset email failed:', res.status, await res.text());
    return res.ok;
  } catch (err) { console.error('invite/reset email threw:', err); return false; }
}

async function issueResetToken(env, brokerId) {
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('UPDATE brokers SET reset_token = ?, reset_expires = ? WHERE id = ?')
    .bind(token, expires, brokerId).run();
  return token;
}

/**
 * Bulk-invite agency members from pasted names and emails.
 *
 * ⭐ ERIC'S FLOW, BUILT AS HE DESCRIBED IT: the agency supplies names and emails, accounts are
 * created, and each person gets a link to choose a password.
 * ⚠️ EXISTING ACCOUNTS ARE SKIPPED, NEVER OVERWRITTEN. Re-pasting a list that includes somebody
 * who already signed up must not reset their password or move their quotes.
 */
async function handleAgencyInvite(request, env) {
  const me = await currentBroker(request, env);
  if (!me) return jsonResp({ error: 'Please sign in.' }, 401);
  if (me.role !== 'admin' || !me.agency_id) return jsonResp({ error: 'Only an agency administrator can invite people.' }, 403);

  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const rows = Array.isArray(body.people) ? body.people.slice(0, 200) : [];
  if (!rows.length) return jsonResp({ error: 'No names and emails were supplied.' }, 400);

  const agency = await env.DB.prepare('SELECT name FROM agencies WHERE id = ?').bind(me.agency_id).first();
  const origin = new URL(request.url).origin;
  const invited = [], skipped = [], failed = [];

  for (const p of rows) {
    const email = String(p.email || '').trim().toLowerCase();
    const name = String(p.name || '').trim().slice(0, 120);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { failed.push({ email: email || '(blank)', why: 'not a valid email' }); continue; }
    const existing = await env.DB.prepare('SELECT id, agency_id FROM brokers WHERE lower(trim(email)) = ?').bind(email).first();
    if (existing) { skipped.push({ email, why: existing.agency_id === me.agency_id ? 'already in your agency' : 'already has an account' }); continue; }

    const id = crypto.randomUUID();
    // ⛔ password_hash is '' — an account nobody can sign into until they set one. `verifyPassword`
    // returns false for an empty stored hash, so this is a locked account, not an open one.
    await env.DB.prepare(
      'INSERT INTO brokers (id, email, password_hash, name, agency, phone, agency_id, role, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(id, email, '', name, agency ? agency.name : '', '', me.agency_id, 'member', new Date().toISOString()).run();

    const token = await issueResetToken(env, id);
    const ok = await sendSetPasswordEmail(env, {
      to: email, link: `${origin}/broker/set-password?token=${token}`,
      agencyName: agency ? agency.name : '', invited: true,
    });
    (ok ? invited : failed).push(ok ? { email } : { email, why: 'account created, but the email could not be sent' });
  }
  return jsonResp({ ok: true, invited, skipped, failed });
}

async function handleForgotPassword(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  const row = await env.DB.prepare('SELECT id FROM brokers WHERE lower(trim(email)) = ?').bind(email).first();
  if (row) {
    const token = await issueResetToken(env, row.id);
    await sendSetPasswordEmail(env, { to: email, link: `${new URL(request.url).origin}/broker/set-password?token=${token}`, invited: false });
  }
  // ⚠️ THE SAME ANSWER WHETHER OR NOT THE ACCOUNT EXISTS, for the same reason the login does:
  // otherwise this endpoint answers "is this person one of ABY's brokers?" for anyone who asks.
  return jsonResp({ ok: true, message: 'If there is an account for that address, a link is on its way.' });
}

async function handleSetPassword(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const token = String(body.token || '');
  const password = String(body.password || '');
  if (password.length < 10) return jsonResp({ error: 'Use at least 10 characters.' }, 400);
  if (!token) return jsonResp({ error: 'That link is not valid.' }, 400);

  const row = await env.DB.prepare('SELECT id, email, reset_expires FROM brokers WHERE reset_token = ?').bind(token).first();
  if (!row) return jsonResp({ error: 'That link is not valid. Ask for a new one.' }, 400);
  if (!row.reset_expires || new Date(row.reset_expires) < new Date()) {
    return jsonResp({ error: 'That link has expired. Ask for a new one.' }, 400);
  }
  // ⭐ The token is cleared in the same statement that sets the password, so a link works ONCE.
  await env.DB.prepare('UPDATE brokers SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?')
    .bind(await hashPassword(password), row.id).run();

  return new Response(JSON.stringify({ ok: true }), { status: 200,
    headers: { 'Content-Type': 'application/json',
      'Set-Cookie': sessionCookie(await makeBrokerToken(row.id, env), 60 * 60 * 24 * 30) } });
}

/** The signed-in broker's agency, so the page knows what to show. Any member may read it. */
async function handleAgencyMe(request, env) {
  const me = await currentBroker(request, env);
  if (!me) return jsonResp({ error: 'Please sign in.' }, 401);
  if (!me.agency_id) return jsonResp({ agency: null });
  const a = await env.DB.prepare('SELECT id, name, logo_data_url, share_quotes FROM agencies WHERE id = ?')
    .bind(me.agency_id).first();
  if (!a) return jsonResp({ agency: null });
  const members = await env.DB.prepare(
    "SELECT email, name, role, CASE WHEN password_hash = '' THEN 1 ELSE 0 END AS pending " +
    "FROM brokers WHERE agency_id = ? ORDER BY name").bind(me.agency_id).all();
  return jsonResp({
    agency: { id: a.id, name: a.name || '', logoDataUrl: a.logo_data_url || '', shareQuotes: !!a.share_quotes },
    // ⭐ `pending` is "invited but has never set a password" -- an admin needs to see who has not
    // acted yet, or a bulk invite is a black hole.
    members: members.results || [],
  });
}

/**
 * Promote or demote a member. Admin only.
 *
 * ⭐ ERIC ASKED WHETHER MULTIPLE ADMINS ARE POSSIBLE, 2026-08-18. They must be, and for this
 * flag's own reason: an agency whose ONE admin leaves cannot change its settings, cannot add
 * anybody, and cannot promote a replacement -- the "agent leaves and the agency loses something"
 * problem, applied to the role instead of the quotes.
 *
 * 🔴 THE LAST ADMIN CANNOT BE DEMOTED. Counted in the same request, not assumed, because an
 * agency with zero admins is unrecoverable without a developer.
 */
async function handleAgencyRole(request, env) {
  const me = await currentBroker(request, env);
  if (!me) return jsonResp({ error: 'Please sign in.' }, 401);
  if (me.role !== 'admin' || !me.agency_id) return jsonResp({ error: 'Only an agency administrator can do that.' }, 403);
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }

  const email = String(body.email || '').trim().toLowerCase();
  const role = body.role === 'admin' ? 'admin' : 'member';
  const target = await env.DB.prepare(
    'SELECT id, agency_id, role FROM brokers WHERE lower(trim(email)) = ?').bind(email).first();
  if (!target || target.agency_id !== me.agency_id) return jsonResp({ error: 'That person is not in your agency.' }, 404);

  if (role === 'member' && target.role === 'admin') {
    const admins = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM brokers WHERE agency_id = ? AND role = 'admin'").bind(me.agency_id).first();
    if (Number(admins && admins.n) <= 1) {
      return jsonResp({ error: 'Somebody has to be an administrator. Make someone else one first.' }, 400);
    }
  }
  await env.DB.prepare('UPDATE brokers SET role = ? WHERE id = ?').bind(role, target.id).run();
  return jsonResp({ ok: true });
}

/** Agency settings: the name, the shared logo, and the sharing switch. Admin only. */
async function handleAgencySettings(request, env) {
  const me = await currentBroker(request, env);
  if (!me) return jsonResp({ error: 'Please sign in.' }, 401);
  if (me.role !== 'admin' || !me.agency_id) return jsonResp({ error: 'Only an agency administrator can change these.' }, 403);
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }

  const logo = String(body.logoDataUrl || '');
  if (logo && !/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/.test(logo)) {
    return jsonResp({ error: 'That does not look like an image file.' }, 400);
  }
  if (logo.length > MAX_LOGO_CHARS) return jsonResp({ error: 'That image is too large — please use one under 300KB.' }, 400);

  await env.DB.prepare('UPDATE agencies SET name = ?, logo_data_url = ?, share_quotes = ? WHERE id = ?')
    .bind(String(body.name || '').slice(0, 120), logo, body.shareQuotes ? 1 : 0, me.agency_id).run();
  return jsonResp({ ok: true });
}

/**
 * The agency's quotes: every member's, newest first.
 *
 * 🔴 GATED TWICE. An admin always sees them, because somebody has to be able to answer "what did
 * the agent who left leave behind" -- which is the problem this row exists for. A MEMBER sees them
 * only while `share_quotes` is on, which is the administrator's decision to make and reverse.
 */
async function handleAgencyQuotes(request, env) {
  const me = await currentBroker(request, env);
  if (!me) return jsonResp({ error: 'Please sign in.' }, 401);
  if (!me.agency_id) return jsonResp({ quotes: [], reason: 'no-agency' });

  const agency = await env.DB.prepare('SELECT share_quotes FROM agencies WHERE id = ?').bind(me.agency_id).first();
  if (me.role !== 'admin' && !(agency && agency.share_quotes)) {
    return jsonResp({ quotes: [], reason: 'not-shared' });
  }
  const cols = "q.id, q.quote_number, q.created_at, q.client_name, q.client_id, q.effective_date, " +
               "q.broker_name, q.broker_agency, q.broker_email, q.rep_name, q.products, " +
               "COALESCE(q.status, 'P') AS status, COALESCE(q.ran_by, 'broker') AS ran_by, " +
               "COALESCE(q.state, 'TX') AS state";
  // Joined on email, which is the same key everything else in this system uses.
  const r = await env.DB.prepare(
    `SELECT ${cols} FROM quotes q JOIN brokers b ON lower(trim(q.broker_email)) = lower(trim(b.email)) AND trim(q.broker_email) <> '' ` +
    `WHERE b.agency_id = ? ORDER BY q.created_at DESC LIMIT 500`
  ).bind(me.agency_id).all();
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
      'SELECT id, email, name, agency, phone, logo_data_url, agency_id, role FROM brokers WHERE id = ?').bind(id).first();
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

  // ── Agencies (F-53) ─────────────────────────────────────────────────────────────────────────
  //
  // ⭐⭐ THE PROBLEM F-53 EXISTS FOR: "quotes belong to PEOPLE in ABY, not agencies. An agent runs
  // 40 quotes, leaves, and the agency loses all 40."
  //
  // 🔴 `share_quotes` IS AN AGENCY-LEVEL SWITCH, AND IT DEFAULTS TO OFF. Eric, 2026-08-18: "let
  // the agency administrator (the one who sets up the main agency account) decide if everyone
  // gets access or not." ⛔ Defaulting it ON would disclose every agent's book to their
  // colleagues the moment a second person joined -- a decision nobody made, made silently.
  //
  // ⭐ `logo_data_url` LIVES HERE TOO, and that is Eric's other ask: "have the agency upload the
  // logo and it automatically apply to everyone under them." A member with no logo of their own
  // inherits this one, so an agency sets its brand once.
  { sql: "CREATE TABLE IF NOT EXISTS agencies (" +
         "  id TEXT PRIMARY KEY," +
         "  name TEXT NOT NULL," +
         "  logo_data_url TEXT," +
         "  share_quotes INTEGER DEFAULT 0," +
         "  created_at TEXT)",
    table: "agencies", column: "name" },
  { sql: "ALTER TABLE brokers ADD COLUMN agency_id TEXT", table: "brokers", column: "agency_id" },
  // 'admin' can invite people and flip sharing; 'member' cannot. The first account of an agency
  // is its admin, because somebody has to be.
  { sql: "ALTER TABLE brokers ADD COLUMN role TEXT",      table: "brokers", column: "role" },

  // ── Invitations and password resets (F-53) ──────────────────────────────────────────────────
  //
  // ⭐ ERIC, 2026-08-18, AND THE REASONING IS SOUND: "For the agency to provide names and emails
  // of each broker, maybe via spreadsheet, and have accounts created for all of them. And if so,
  // would they just click forgot password... Seems like that would be easier than having each one
  // try to set up an account and get it tied to the agency."
  // 🔴 IT IS NOT ONLY EASIER, IT IS THE ONLY RELIABLE WAY TO GET THE AGENCY LINK RIGHT. A
  // self-registering broker cannot be attached to an agency by anything trustworthy -- email
  // domains are mixed and often personal -- so the AGENCY has to assert who belongs to it.
  //
  // ⚠️ ONE TOKEN COLUMN SERVES BOTH INVITE AND RESET, deliberately: "set your password because you
  // were invited" and "set your password because you forgot it" are the same action, and two
  // near-identical flows is how one of them rots.
  { sql: "ALTER TABLE brokers ADD COLUMN reset_token TEXT",   table: "brokers", column: "reset_token" },
  { sql: "ALTER TABLE brokers ADD COLUMN reset_expires TEXT", table: "brokers", column: "reset_expires" },

  // ── Who at ABY owns this relationship (Eric, 2026-08-18) ────────────────────────────────────
  // "I'd like to be able to see all the brokers who are registered (and who they're assigned to -
  // Neils or me)... filter brokers and quotes by me and Niels so we only see ours."
  // ⭐ The values are the ids already in `reps.js` (`eric` / `niels`), NOT new ones, so the sales
  // rep on a quote and the owner of a broker are the same vocabulary.
  { sql: "ALTER TABLE brokers  ADD COLUMN assigned_rep TEXT", table: "brokers",  column: "assigned_rep" },
  { sql: "ALTER TABLE agencies ADD COLUMN assigned_rep TEXT", table: "agencies", column: "assigned_rep" },

  // ── The sales pipeline (Eric, 2026-08-18) ───────────────────────────────────────────────────
  //
  // "I want currently selling, currently quoting, sold or quoted in past, and prospects... Then,
  // for the agencies and agents, I'd like some sort of priority level - how much would we like to
  // have them working with us."
  //
  // 🔴🔴 THOSE ARE TWO DIFFERENT KINDS OF THING AND ONLY ONE IS STORED.
  //   STATUS is a FACT and is DERIVED, never typed -- see `pipelineStatusSql()`. A hand-maintained
  //   status is wrong within a fortnight: an agency quotes on Tuesday and their row still says
  //   prospect. ⛔ There is deliberately NO status column.
  //   PRIORITY is a JUDGMENT and can only come from a person. A large agency that has never quoted
  //   is a prospect by the data and an A by intent, and no query will ever work that out.
  //
  // ⭐ A PROSPECT IS JUST A ROW WITH NO ACCOUNT. Brokers and agencies already exist without one --
  // that is what an invited-but-not-yet-registered person is -- so a prospect needs no new table.
  // ⛔ A SEPARATE `prospects` TABLE WAS REJECTED: the merge would land exactly when a prospect
  // signs up, i.e. at the best moment, forcing somebody to reconcile sales notes against a new
  // account by hand. Same reasoning that keeps agencies one table.
  { sql: "ALTER TABLE brokers  ADD COLUMN priority TEXT", table: "brokers",  column: "priority" },
  { sql: "ALTER TABLE agencies ADD COLUMN priority TEXT", table: "agencies", column: "priority" },
  { sql: "ALTER TABLE brokers  ADD COLUMN notes TEXT",    table: "brokers",  column: "notes" },
  { sql: "ALTER TABLE agencies ADD COLUMN notes TEXT",    table: "agencies", column: "notes" },

  // ── When the employer signed (Eric, 2026-08-18) ─────────────────────────────────────────────
  //
  // ⭐ THE SIGNATURE IS THE STRONGEST SIGNAL IN THE SYSTEM AND IT USED TO MOVE NOTHING. An employer
  // committed, the quote still said Pending, and somebody had to notice and hand-edit it.
  //
  // 🔴 IT SETS 'I' (IN PROCESS), NOT 'S' (SOLD), AND THAT IS ERIC'S DISTINCTION: "we need to have a
  // category for in process or something - ones that are buying but we don't have anything yet."
  // ⛔ A signature is intent, not money received. Marking it Sold would overstate the book, and the
  // whole point of adding value reporting is that the numbers become worth trusting.
  { sql: "ALTER TABLE quotes ADD COLUMN committed_at TEXT", table: "quotes", column: "committed_at" },

  // ── What a quote is WORTH (Eric, 2026-08-18) ────────────────────────────────────────────────
  //
  // 🔴 THE TOOL COMPUTED THE PRICE, PRINTED IT ON THE DOCUMENT, AND THREW IT AWAY. Every count in
  // the admin therefore weighed a 5-life POP exactly the same as a 500-life ACA engagement.
  //
  // `first_year_value` = setup + plan documents + annual + twelve months of PPPM, summed across the
  // products on the quote. ⭐ FIRST YEAR SPECIFICALLY, because setup is a one-off: a recurring
  // figure would understate the sale and an all-in figure would overstate every year after it.
  // ⚠️ It is what the QUOTE said, not what was invoiced. Stored on the row so a later rate change
  // cannot silently restate the history.
  //
  // `employee_count` is the largest count on the quote. Eric asked whether to store headcount too;
  // it is worth it because value alone cannot tell a big group from an expensive one, and the
  // broker has already typed it.
  { sql: "ALTER TABLE quotes ADD COLUMN first_year_value REAL", table: "quotes", column: "first_year_value" },
  { sql: "ALTER TABLE quotes ADD COLUMN employee_count INTEGER", table: "quotes", column: "employee_count" },

  // ── Notes on a quote (Eric, 2026-08-18) ─────────────────────────────────────────────────────
  // "so we can add some notes based on what an agent tells us on the phone or by email"
  // ⭐ ON THE QUOTE, not on the agency, because the useful note is usually about THIS opportunity
  // -- what they asked for, what they objected to, when to chase. An agency-level note would blur
  // six conversations into one box.
  { sql: "ALTER TABLE quotes ADD COLUMN notes TEXT", table: "quotes", column: "notes" },

  // ── Referral partners (Eric, 2026-08-19) ────────────────────────────────────────────────────
  //
  // Eric: "Currently Emerson Rogers refers brokers to us. Different reps there refer to us. I'd
  // like to track that so we can take care of those brokers and thank the reps." And: "Emerson
  // Rogers is a general agency. They don't write anything direct. There will be others like that."
  //
  // ⭐⭐ TWO TABLES, NOT A `source` TEXT BOX, AND THAT IS THE WHOLE DESIGN. A partner and the REP at
  // that partner are two facts. One free-text field would hold "Emerson Rogers", "Emerson",
  // "emerson rogers" and "Emerson Rogers - Dana" within a month, and then neither a partner total
  // nor a rep thank-you is possible. This project has paid for that lesson three times: "Baldwin
  // Grouup" in the 2026 import, 118 carrier strings for ~97 real companies, and broker emails that
  // split one person's book until they were normalised.
  //
  // ⭐ PARTNERS ARE THEIR OWN TABLE, NOT ROWS IN `agencies` -- and Eric's answer is why, rather than
  // my preference: a general agency writes nothing direct, so it can never be an agency that quotes
  // here. A referral relationship and a quoting relationship are different things that merely share
  // the word "agency".
  { sql: "CREATE TABLE IF NOT EXISTS referral_partners (" +
         "  id TEXT PRIMARY KEY," +
         "  name TEXT NOT NULL," +
         "  kind TEXT," +
         "  notes TEXT," +
         "  created_at TEXT)",
    table: "referral_partners", column: "name" },

  // The people at a partner who actually send business. ⭐ THE REP IS THE POINT: a general agency's
  // reps each hold their own book of retail brokers and choose where to place them, so "thank the
  // reps" is the relationship being maintained, and a partner-level total cannot express it.
  { sql: "CREATE TABLE IF NOT EXISTS referral_contacts (" +
         "  id TEXT PRIMARY KEY," +
         "  partner_id TEXT NOT NULL," +
         "  name TEXT NOT NULL," +
         "  email TEXT, phone TEXT," +
         "  active INTEGER DEFAULT 1," +
         "  created_at TEXT)",
    table: "referral_contacts", column: "partner_id" },

  // ⭐ THE BROKER POINTS AT THE CONTACT, WHICH IMPLIES THE PARTNER -- one link, so a row can never
  // claim a partner and a rep who works somewhere else. The partner is stored alongside for the
  // case where the partner is known and the rep is not.
  // ⚠️ ATTRIBUTION IS PERMANENT, NOT A LIVE POINTER. Dana referred that broker in March; that stays
  // true after Dana leaves, which is why a rep is deactivated rather than deleted.
  { sql: "ALTER TABLE brokers ADD COLUMN referred_by_partner TEXT", table: "brokers", column: "referred_by_partner" },
  { sql: "ALTER TABLE brokers ADD COLUMN referred_by_contact TEXT", table: "brokers", column: "referred_by_contact" },
  // ⚠️ NOT CALLED `source`. `source_tag` already exists on `quotes` and means "which shared link did
  // this quote arrive on" -- a different question, and two things called source would be confused
  // in every future conversation.
  { sql: "ALTER TABLE brokers ADD COLUMN referral_kind TEXT", table: "brokers", column: "referral_kind" },
  // ⏳ The date is what makes the two real questions answerable: "thank the reps" is time-sensitive,
  // and "is this partner worth the effort" is a quarterly question. Without it the only available
  // answer is "ever".
  { sql: "ALTER TABLE brokers ADD COLUMN referred_at TEXT", table: "brokers", column: "referred_at" },
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
<title>Quote log — ABY admin</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#f0f4f0;color:#1a1a1a;min-height:100vh}
header{background:#1a5c3a;color:white;padding:14px 24px;display:flex;align-items:center;gap:12px;
       position:sticky;top:0;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.2)}
header h1{font-size:1.05rem;font-weight:700;flex:0 0 auto}
/* 🔴 THE QUOTE LOG HAD NO NAVIGATION AT ALL, AND IT IS THE LANDING PAGE.
   Eric, 2026-08-19: "Where is the full list of agents/agencies, Prospects (when we add), etc? Why
   is there no link from /admin?" The three other admin screens -- brokers and agencies, the
   pipeline, the rate viewer -- each carried a nav bar linking to all four. This one did not, so
   the front door was the only page with no way out, and everything else was reachable only by
   typing the URL. Built, deployed, and effectively invisible.
   ⚠️ I told him yesterday the nav was "in the header of every admin page". I had read it on the
   pipeline page and generalised. The one page it was missing from is the one everybody starts on. */
header nav{flex:1;display:flex;flex-wrap:wrap;gap:2px;margin-left:6px}
header nav a{color:rgba(255,255,255,.78);text-decoration:none;font-size:.85rem;font-weight:600;
             padding:5px 10px;border-radius:5px;white-space:nowrap}
header nav a:hover{background:rgba(255,255,255,.15);color:white}
/* ⭐ The current page is marked. A four-link bar with nothing showing where you are makes every
   page look the same, which is its own small way of being lost. */
header nav a.here{background:rgba(255,255,255,.2);color:white}
header nav a.act{background:#2f9e73;color:white;font-weight:700}
header nav a.act:hover{background:#37b284}
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
/* 🔴 overflow-x IS auto, NOT hidden, AND THAT IS THE BUG ERIC REPORTED: "Ran By is off the page -
   you just see the first letter." With hidden, a table wider than its box is CLIPPED -- silently,
   with no scrollbar to say so, so the last column simply ceases to exist. Measured: at 820px wide
   104px of the Ran by column was gone, at 760px 164px.
   ⭐ THE RULE: a container that can be narrower than its content must SCROLL or REFLOW. Hiding
   the overflow is only safe when you can prove the content never exceeds the box, and a table
   sized by broker-typed names can never prove that.
   (No backticks in this file's page templates -- they end the literal. TRAPS #224.) */
.table-wrap{background:white;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08);
            overflow-x:auto;overflow-y:hidden}
/* 🔴🔴 table-layout:fixed IS WHAT ACTUALLY BINDS THE COLUMN WIDTHS, AND IT IS THE REAL FIX FOR
   "Ran By is off the page". Under the default auto layout the colgroup percentages are only
   HINTS: the browser measures content first and any cell that cannot shrink wins. So the table
   grew past 100% of its container and the last column was pushed off the right -- while every
   declared width still summed to exactly 100%, which is why nothing looked wrong in the source.
   🔬 The content doing the pushing was the PRODUCT CHIPS, and only real data showed it: the labels
   carry counts, so a single nowrap chip reads "FSA / DCAP / LFSA (25 participants)" or
   "COBRA (87 eligible employees)" -- ~250-300px each. My test fixtures used bare product names and
   were far too kind. ⚠️ Fixtures that are tidier than production hide exactly this class of bug.
   ⭐ With fixed, the widths are obeyed, the table can never exceed its box, and there is nothing to
   push off. Scrolling and the card reflow become the safety net rather than the mechanism. */
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead{background:#f7f9f7}
th{padding:10px 14px;text-align:left;font-size:.75rem;font-weight:700;color:#555;
   text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;border-bottom:1px solid #e8e8e8}
/* Sortable headers. ⭐ The arrow is rendered in a fixed-width slot that is ALWAYS present, so the
   header row does not reflow by a few pixels when the sort column changes -- a wobble on click
   reads as the table having jumped to different data. */
th.sortable{cursor:pointer;user-select:none}
th.sortable:hover{background:#eef4ef;color:#1a5c3a}
th .arr{display:inline-block;width:.85em;text-align:center;color:#b6c4bb;font-size:.7rem}
th.sorted{color:#1a5c3a}
th.sorted .arr{color:#1a5c3a}
/* Eric: "the pill for ABY and Direct Link look weird." They were solid saturated blocks with white
   text, which reads as a STATUS badge -- the loudest thing in a row whose subject is the client.
   Tinted background, dark text, and no shouting. */
.origin{display:inline-block;padding:2px 8px;border-radius:5px;font-size:.72rem;font-weight:600;
        letter-spacing:.01em;white-space:nowrap;border:1px solid transparent}
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
.nowrap{white-space:nowrap}
/* EDIT IN PLACE. ⭐ It must read as TEXT until touched -- a table full of visible input boxes is
   the look Eric objected to in the panel, and putting it in every row would be worse. The outline
   appears on hover so the affordance is discoverable without being permanent. */
.ip{display:inline-block;min-width:2ch;padding:1px 3px;margin:-1px -3px;border-radius:4px;
    cursor:text;outline:none}
.ip:hover{background:#fff;box-shadow:inset 0 0 0 1px #cfdcd4}
.ip:focus{background:#fff;box-shadow:inset 0 0 0 2px #1a5c3a}
.ip-saving{background:#fffbe8}
.ip-saved{background:#e8f5ee;transition:background .6s}
.ip-failed{background:#fdecea;box-shadow:inset 0 0 0 2px #c0392b}
/* The placeholder is a SIBLING, not the field's own text: text inside a contenteditable would be
   saved as the value the moment somebody clicked in and out again. */
.ip-ph{color:#bbb;font-style:italic;pointer-events:none}
.ip:focus + .ip-ph,.ip:hover + .ip-ph{display:none}
tr.detail-row td{background:#f5fbf6;padding:0;border-top:none;border-bottom:2px solid #d4ead9}
.detail-inner{max-width:none}
/* Eric, 2026-08-18: "some lines separating the info or some boxes... we don't need so much space
   between the sections. In fact, I think link could be on the same line too."
   ⭐ A FIXED 4-UP GRID, NOT auto-fill. The old repeat(auto-fill,minmax(180px,1fr)) inside a 700px
   box resolved to THREE tracks -- which is the entire reason Broker Email sat on the line BELOW
   Broker Phone. Nobody chose that; the track count did. Four fixed columns put quote number,
   effective date, phone and email on one row, with link source beside them on the next. */
.detail-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;
             border-bottom:1px solid #dfeae2}
.detail-item{padding:9px 16px;border-left:1px solid #e4eee8;min-width:0}
.detail-item:first-child{border-left:none}
/* The placeholder cell that keeps the grid four wide when there is no link source: it holds the
   shape without drawing a divider against empty space. */
.detail-item:empty{border-left-color:transparent}
.detail-item label{display:block;font-size:.68rem;font-weight:700;color:#8a9a90;
                    text-transform:uppercase;letter-spacing:.05em;margin-bottom:1px}
.detail-item span{font-size:.875rem;color:#1a1a1a;word-break:break-word}
.detail-notes{padding:10px 16px}
.detail-notes label{display:block;font-size:.68rem;font-weight:700;color:#8a9a90;
                    text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
/* ⚠️ Chips WRAP now. They were nowrap, which is what let one of them set a floor the whole table
   had to obey. A product label with its count is long enough that no sensible column width fits it
   on one line, so the choice was "wrap" or "push a column off the screen". */
.chip{background:#e8f5ee;color:#1a6640;border-radius:4px;padding:2px 8px;font-size:.8rem;
      font-weight:600;white-space:normal;overflow-wrap:anywhere}
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
/* A separator instead of a gap. Eric: "we don't need so much space between the sections" -- the
   answer to "which block am I looking at" is a LINE, and a line costs no vertical room. */
.detail-actions{margin:0;padding:10px 16px;border-top:1px solid #e4eee8;
                display:flex;gap:8px;flex-wrap:wrap;align-items:center}
/* 🔴 RAISED FROM 680px TO 900px, 2026-08-18. Between the old breakpoint and roughly 950px the
   seven-column table could not fit and was being CLIPPED -- that is where "Ran By is off the page"
   was happening, and it is not a phone width, it is an ordinary half-screen desktop window.
   ⭐ The card layout is not a phone concession: below ~900px it is simply the readable one, and it
   shows every field instead of hiding the last. Above it the table fits; between 900 and the true
   minimum, overflow-x:auto scrolls rather than clips. Three defences, in that order. */
@media(max-width:900px){
  header{padding:12px 16px}
  .toolbar{padding:10px 12px}
  .tabs{padding:0 12px}
  .tab{padding:.6rem .8rem;font-size:.8rem}
  main{padding:12px}
  .table-wrap{background:transparent;box-shadow:none;overflow:visible}
  table,tbody{display:block;width:100%}
  thead,colgroup{display:none}
  /* ⚠️ REMAPPED for the new column order (Date · Quote # · Client · Broker · Rep · Products ·
     Ran by). These rules address cells by POSITION, so adding the quote-number column silently
     moved every one of them by one -- Client would have rendered with the Broker row's styling
     and Ran by, which had no rule at all, would have landed wherever the grid put it.
     ⭐ A position-addressed stylesheet is a CONSUMER of the column order. */
  tr.data-row{display:grid;grid-template-columns:1fr auto;
              grid-template-rows:auto auto auto auto auto auto;
              background:white;border-radius:8px;margin-bottom:8px;
              padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,.08);
              cursor:pointer;gap:1px 8px;border:1px solid #eaeaea}
  tr.data-row:hover td{background:transparent}
  tr.data-row.expanded{border-radius:8px 8px 0 0;border-bottom-color:transparent}
  tr.data-row td{display:block;border:none;padding:0;background:transparent !important}
  tr.data-row td:nth-child(1){grid-column:1;grid-row:4;font-size:.78rem}                 /* Quote # */
  tr.data-row td:nth-child(2){grid-column:1;grid-row:1;font-size:.72rem;color:#999}      /* Effective */
  tr.data-row td:nth-child(3){grid-column:1;grid-row:2;font-weight:600;font-size:.95rem} /* Client */
  tr.data-row td:nth-child(4){grid-column:1;grid-row:3;font-size:.8rem;color:#666}       /* Broker */
  tr.data-row td:nth-child(5){grid-column:1;grid-row:5;font-size:.78rem;color:#666}      /* Rep */
  tr.data-row td:nth-child(6){grid-column:1/-1;grid-row:6;margin-top:6px}                /* Products */
  tr.data-row td:nth-child(7){grid-column:2;grid-row:1;display:flex;align-items:center;justify-content:flex-end}
  tr.detail-row{display:block;margin-bottom:12px}
  tr.detail-row td{display:block;border-radius:0 0 8px 8px;padding:14px}
  tr:not(.data-row):not(.detail-row){display:block}
  tr:not(.data-row):not(.detail-row) td{display:block}
  .detail-inner{max-width:100%}
  .detail-grid{grid-template-columns:1fr 1fr}
  /* On two columns the third cell starts a new row, so its left border would draw a stray
     vertical line against nothing. */
  .detail-item:nth-child(odd){border-left:none}
  .detail-actions{flex-direction:column;align-items:stretch}
  .detail-actions a,.detail-actions button{margin-left:0 !important;justify-content:center;text-align:center}
}
</style>
</head>
<body>
<header>
  <h1>ABY admin</h1>
  <nav>
    <a href="/aby" class="act" title="Run a quote as ABY, with the internal overrides">Run a quote</a>
    <a href="/admin" class="here">Quote log</a>
    <a href="/admin/brokers">Brokers &amp; Agencies</a>
    <a href="/admin/pipeline">Pipeline</a>
    <a href="/admin/referrals">Referrals</a>
    <a href="/admin/rates">Rates</a>
  </nav>
  <button class="logout" onclick="logout()">Log out</button>
</header>
<div class="toolbar">
  <input type="text" id="search" placeholder="Search by client, broker, agency, or quote number…">
  <span class="count" id="count"></span>
  <select id="repFilter" style="margin-left:auto;padding:.4rem .5rem;border:1px solid #ddd;border-radius:6px;font-size:.85rem">
    <option value="">All reps</option>
  </select>
  <select id="ranByFilter" style="padding:.4rem .5rem;border:1px solid #ddd;border-radius:6px;font-size:.85rem">
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
      <!-- ⚠️ SEVEN cols for seven columns. It declared SIX against a seven-column table, so every
           width applied to the wrong column and the last was unconstrained. -->
      <colgroup>
        <!-- ⭐ These are BINDING now, because the table is table-layout:fixed. Quote # gets enough
             for the longest form of the number (TX260818-M135-NC in monospace) since it is the one
             value that must not wrap; Products takes the slack because its chips can. -->
        <col style="width:15%">
        <col style="width:12%">
        <col style="width:17%">
        <col style="width:18%">
        <col style="width:7%">
        <col style="width:21%">
        <col style="width:10%">
      </colgroup>
      <thead>
        <tr>
          <!-- 🔴 THE CREATED-DATE COLUMN IS GONE, AND NOTHING WAS LOST WITH IT. The quote number
               already carries the created date the same way it carries the state and the -C:
               TX260805 IS 5 August 2026. Keeping both spent a column restating one fact, wrapped
               it onto three lines in a 10% column, and left no room for the date that actually
               decides something. Sorting by "Quote #" therefore still sorts by when it was run,
               within a state. The full timestamp remains in the cell's tooltip. -->
          <th class="sortable" data-sort="quote">Quote # <span class="arr"></span></th>
          <!-- Eric asked whether effective date beats the quote number here. It beats the CREATED
               date: validity keys on it -- "we will honor original quotes if the effective date
               hasn't passed" -- so it is the column somebody scans. A quote number is a lookup
               key, and lookup is what the search box is for. -->
          <th class="sortable" data-sort="effective">Effective <span class="arr"></span></th>
          <th class="sortable" data-sort="client">Client <span class="arr"></span></th>
          <!-- Eric: "Why can't we sort by agent name or agency name?" They are two facts stacked in
               one cell, so the header offers BOTH keys rather than picking one for him. -->
          <th class="sortable" data-sort="broker">Broker <span class="arr"></span>
            <span style="color:#c3ccc6">/</span>
            <span class="sortable-sub" data-sort="agency" style="cursor:pointer">Agency <span class="arr"></span></span></th>
          <th class="sortable" data-sort="rep">Rep <span class="arr"></span></th>
          <th>Products</th><th>Ran by</th>
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
let repFilter = '';
document.addEventListener('DOMContentLoaded', function(){
  var sel = document.getElementById('ranByFilter');
  if (sel) sel.addEventListener('change', function(){ ranByFilter = sel.value; expandedId = null; render(); });
  var rep = document.getElementById('repFilter');
  if (rep) rep.addEventListener('change', function(){ repFilter = rep.value; expandedId = null; render(); });

  // Sorting. Bound on the THEAD once rather than per header, so the two keys that live inside the
  // Broker / Agency cell work the same way as the plain ones.
  var head = document.querySelector('thead');
  if (head) head.addEventListener('click', function(e){
    var el = e.target.closest('[data-sort]');
    if (!el) return;
    var key = el.getAttribute('data-sort');
    // ⭐ Clicking the SAME key flips direction; a NEW key starts at its natural direction --
    // newest-first for a date, A-Z for a name. Starting every column descending makes an
    // alphabetical sort open at Z and read as broken.
    if (key === sortKey) sortDir = -sortDir;
    else { sortKey = key; sortDir = (key === 'date') ? -1 : 1; }
    expandedId = null;
    render();
  });
});

// EDIT IN PLACE -- one delegated set of handlers on the tbody, so rows re-rendered at any time
// keep working without rebinding.
// ⭐ SAVES ON BLUR, and on Enter, and reverts on Escape. There is no Save button because the unit
// being saved is one field: a button would imply a form, and a form implies you can leave it
// half-entered, which is how the panel's duplicate fields got out of step in the first place.
// ⛔ THE WHITESPACE PATTERN IS BUILT FROM CODE POINTS, AND IT HAS TO BE. This page is a template
// literal, so the backslash-s shorthand is eaten before the browser ever sees it -- the pattern
// would match the LETTER s and collapse runs of it. Writing the class out does not help either:
// tab and newline are backslash escapes too and go the same way. Code points cannot be eaten by
// anything. (space, tab, newline, carriage return.) TRAPS #200 and #224.
var WS = new RegExp('[' + String.fromCharCode(32, 9, 10, 13) + ']+', 'g');

document.addEventListener('DOMContentLoaded', function () {
  var tb = document.getElementById('tbody');
  if (!tb) return;

  // A click in an editable cell must NOT toggle the row open or shut.
  // 🔴 THE THIRD ARGUMENT, TRUE, IS THE WHOLE POINT -- CAPTURE PHASE. This guard sits on the TBODY, but the
  // handler it is defending against sits on the ROW, which is a DESCENDANT. Bubbling visits the
  // descendant FIRST, so as a bubble listener this ran only after the row had already toggled and
  // stopPropagation had nothing left to stop. It read as correct and did nothing for as long as
  // edit-in-place has existed. Capture visits the tbody before the row, so the event never
  // reaches the toggle. (Caret placement and focus come from mousedown, not click, so stopping
  // the click here does not stop you editing.)
  tb.addEventListener('click', function (e) {
    if (e.target.closest('.ip')) e.stopPropagation();
  }, true);

  tb.addEventListener('keydown', function (e) {
    var el = e.target.closest('.ip');
    if (!el) return;
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    else if (e.key === 'Escape') {
      e.preventDefault();
      el.textContent = el.getAttribute('data-was') == null ? el.textContent : el.getAttribute('data-was');
      el.blur();
    }
  });

  // Remember the value on entry so blur can tell "changed" from "clicked through", and Escape has
  // something to restore.
  tb.addEventListener('focusin', function (e) {
    var el = e.target.closest('.ip');
    if (el) el.setAttribute('data-was', el.textContent);
  });

  // ⚠️ PASTE IS FORCED TO PLAIN TEXT. A contenteditable happily accepts pasted HTML -- copying a
  // company name out of a web page would otherwise drop markup straight into the cell and into
  // the database.
  tb.addEventListener('paste', function (e) {
    if (!e.target.closest('.ip')) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text').replace(WS, ' ').trim();
    document.execCommand('insertText', false, text);
  });

  tb.addEventListener('focusout', async function (e) {
    var el = e.target.closest('.ip');
    if (!el) return;
    var was = el.getAttribute('data-was');
    var now = el.textContent.replace(WS, ' ').trim();
    el.textContent = now;
    if (was == null || now === was.replace(WS, ' ').trim()) return;   // nothing changed

    var id = el.getAttribute('data-id'), col = el.getAttribute('data-edit');
    var body = {}; body[col] = now;
    el.className = 'ip ip-saving';
    try {
      var r = await fetch('/api/quotes/' + id + '/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) throw new Error(d.error || 'failed');
      // ⭐ Show what the SERVER stored, not what was typed -- the email is lower-cased on write,
      // and a cell still showing the typed casing would quietly disagree with the database.
      var local = quotes.filter(function (x) { return x.id === id; })[0];
      if (local && d.quote) Object.keys(d.quote).forEach(function (k) { local[k] = d.quote[k]; });
      if (local && d.quote && d.quote[col] != null) el.textContent = d.quote[col];
      el.className = 'ip ip-saved';
      // 🔴 NO re-render here. Re-rendering the table under somebody who has just tabbed to the
      // next cell moves the cell out from under them mid-edit.
      setTimeout(function () { if (el.className === 'ip ip-saved') el.className = 'ip'; }, 900);
    } catch (err) {
      // ⛔ The typed value STAYS on screen on failure. Reverting it would look like a successful
      // save of the old value, which is the worst of the three possible outcomes.
      el.className = 'ip ip-failed';
      el.title = 'Not saved: ' + (err && err.message ? err.message : 'try again');
    }
  });
});

// Fills the rep dropdown from the quotes actually loaded, so it can never offer a rep with no
// rows -- and never hide one who has some. ⚠️ Keyed on the FULL name; the Rep column shows only
// the first word, which is display, not identity.
function syncRepFilter() {
  var sel = document.getElementById('repFilter');
  if (!sel) return;
  var names = [];
  quotes.forEach(function(q){
    var n = String(q.rep_name || '').trim();
    if (n && names.indexOf(n) === -1) names.push(n);
  });
  names.sort();
  if (repFilter && names.indexOf(repFilter) === -1) names.push(repFilter);
  sel.innerHTML = '<option value="">All reps</option>' + names.map(function(n){
    return '<option value="' + esc(n) + '"' + (n === repFilter ? ' selected' : '') + '>' + esc(n) + '</option>';
  }).join('');
}

// The arrow, and WHICH header carries it. Only the active key is marked, so two sortable keys in
// one cell cannot both look active.
function syncSortIndicators() {
  document.querySelectorAll('[data-sort]').forEach(function(el){
    var on = el.getAttribute('data-sort') === sortKey;
    el.classList.toggle('sorted', on);
    var arr = el.querySelector('.arr');
    if (arr) arr.textContent = on ? (sortDir === 1 ? '▲' : '▼') : '';
  });
}

// 🔴 HOW MANY QUOTES MATCH, which is NOT how many are on screen. The server sends the most
// recent 300; this page used to print the length of what it received and call that the count,
// so a book of 1,795 read as "300 quotes".
var serverTotal = 0;

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
  // How many MATCHED on the server, versus how many it sent. render() needs both to tell the truth.
  serverTotal = (typeof data.total === 'number') ? data.total : quotes.length;
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
// Eric, 2026-08-18: "What does direct link mean?" -- so it did not say what it meant. It is the
// SHARED public link: not handed over from the BenefitLab dashboard, not run by ABY, just somebody
// who opened the link and typed their own broker details. ⭐ Renamed to "Shared link", which is
// the phrase the notes use for it anyway. ⛔ The stored VALUE stays 'direct' -- it is in the filter
// dropdown, in saved URLs and in habits; this is a label change, not a data change.
// Eric, 2026-08-18: "instead of Shared link we should say Broker. Would you agree?"
// ⭐ AGREED FOR THIS ONE, WITH ONE WRINKLE WORTH KNOWING: a DASHBOARD quote was run by a broker
// too. So the three labels are no longer parallel -- "ABY / Dashboard / Broker" answers WHO for
// two of them and HOW for the third, which could read as "Dashboard is not a broker".
// ⚠️ Left as he asked because it is his screen and the tooltips carry the full answer, but if it
// ever reads oddly the fix is to make the pair explicit (Broker, Broker via dashboard) rather than
// to go back to naming the route. ⛔ The stored VALUE stays 'direct' -- filters, saved URLs, habits.
const ORIGIN_LABEL = { ABY: 'ABY', dashboard: 'Dashboard', direct: 'Broker' };
// Tinted, not solid. Eric: "the pill for ABY and Direct Link look weird."
// ⭐ Kept as three DISTINCT tints rather than one neutral chip, because the whole point of the
// three-way origin (L) is that they are different answers -- ABY ran it, a dashboard broker ran
// it, or somebody came in off the shared link. A single grey chip would throw that away to look tidy.
const ORIGIN_STYLE = {
  ABY:       'background:#eaf1fa;color:#1d4f8f;border-color:#cfe0f2',
  dashboard: 'background:#e9f5ee;color:#1a5c3a;border-color:#cde6d7',
  direct:    'background:#f1f2f3;color:#5c6469;border-color:#e0e3e5'
};

// 🔴🔴 THE DATE WAS A DAY OUT ON EVERY IMPORTED AND MANUAL QUOTE, AND THE SCREEN SAID SO IF YOU
// READ BOTH HALVES: a row showed "Jul 26, 2026  7:00 PM" while its own quote number said TX260727.
// The import stored a DATE with no time, which becomes midnight UTC, and toLocaleDateString then
// renders it in Central time -- i.e. 7pm the PREVIOUS DAY. 321 of the rows in this table are that
// import, so the column disagreed with the quote number on most of the book.
// ⭐ THE 7:00 PM WAS THE TELL AND IT IS WHY THE TIME GOES: a fabricated timestamp printed to the
// minute asserts a precision nobody has. Eric: "I don't know why we need the time of the quote."
// ▶️ THE RULE: a timestamp of exactly midnight UTC is a DATE, so read its parts straight off the
// string with no timezone conversion. Anything else is a real moment and keeps its local time.
function createdParts(q) {
  var raw = String(q.created_at || '');
  // ⛔⛔ CHARACTER CLASSES, NOT THE BACKSLASH-d SHORTHAND. This page is built inside a template
  // literal, which EATS the backslash: the shorthand arrives in the browser as a bare letter d,
  // the pattern matches nothing, every date falls through to local-time conversion, and the bug
  // this function exists to fix comes straight back. It parses either way, so
  // check_worker_pages.mjs stays green -- it proves the script PARSES, not that it WORKS.
  // 🔴 That is exactly what happened on the first draft, and only rendering the page caught it.
  // TRAPS #220.
  var m = raw.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:[T ]([0-9]{2}):([0-9]{2}))?/);
  var dateOnly = !m || !m[4] || (m[4] === '00' && m[5] === '00');
  if (m && dateOnly) {
    var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return { date: MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1], time: '' };
  }
  var dt = new Date(raw);
  if (isNaN(dt.getTime())) return { date: raw.slice(0, 10) || '—', time: '' };
  return {
    date: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  };
}

// 🔴 THE EFFECTIVE DATE COLUMN HOLDS TWO DIFFERENT KINDS OF VALUE and a sort has to survive both.
// (No backticks in here: this whole page is one template literal. TRAPS #224 -- third instance.)
// The quote
// form stores an ISO first-of-month ("2026-09-01"); the 2026 IMPORT stored free text, because the
// spreadsheet only knew the month -- "Sep 2026 or later". Sorting those as plain strings puts every
// imported row in alphabetical order by month NAME (April, August, December...), which looks like
// a broken sort rather than mixed data.
// ⭐ Both collapse to a sortable YYYY-MM. Anything unparseable sorts last rather than first: an
// unknown date is not "the earliest", and blanks must not lead the list.
const MONTH_KEY = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
                    jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
function effectiveKey(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var iso = s.match(/^([0-9]{4})-([0-9]{2})/);
  if (iso) return iso[1] + '-' + iso[2];
  var named = s.match(/([A-Za-z]{3})[a-z]*[ ]+([0-9]{4})/);
  if (named) {
    var mm = MONTH_KEY[named[1].toLowerCase()];
    if (mm) return named[2] + '-' + mm;
  }
  return 'zzzz-' + s.toLowerCase();      // unparseable: keep it stable, keep it last
}
// How the effective date READS in the row. An ISO value becomes "Sep 1, 2026"; free text from the
// import passes through untouched, because "Sep 2026 or later" is what was actually agreed and
// tidying it into a specific day would invent precision the spreadsheet never had.
function effectiveLabel(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var m = s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if (!m) return s;
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
}

// Sorting. ⭐ The comparators read the SAME values the cells render, so what you see is what you
// sorted -- a sort keyed on a raw field while the cell shows a formatted one is how a table comes
// to look wrongly ordered to the person reading it.
var sortKey = 'date', sortDir = -1;
const SORT_VALUE = {
  date:    function(q){ return String(q.created_at || ''); },   // the default, with no column
  quote:   function(q){ return String(q.quote_number || '').toLowerCase(); },
  effective: function(q){ return effectiveKey(q.effective_date); },
  client:  function(q){ return String(q.client_name || '').toLowerCase(); },
  broker:  function(q){ return String(q.broker_name || '').toLowerCase(); },
  agency:  function(q){ return String(q.broker_agency || '').toLowerCase(); },
  rep:     function(q){ return String(q.rep_name || '').toLowerCase(); }
};
function sortQuotes(list) {
  var get = SORT_VALUE[sortKey] || SORT_VALUE.date;
  return list.slice().sort(function(a, b) {
    var x = get(a), y = get(b);
    // ⚠️ BLANKS SINK, in BOTH directions. A quote with no agency is not "first alphabetically";
    // it is unknown, and floating 41 unnamed employers to the top of every ascending sort would
    // bury the rows somebody is actually looking for.
    if (!x && y) return 1;
    if (x && !y) return -1;
    if (x < y) return -1 * sortDir;
    if (x > y) return 1 * sortDir;
    return 0;
  });
}

function render() {
  const tbody = document.getElementById('tbody');
  syncRepFilter();
  syncSortIndicators();
  const filtered = sortQuotes(quotes.filter(function(q){
    if ((q.status || 'P') !== activeTab) return false;
    if (ranByFilter && !originMatches(q, ranByFilter)) return false;
    // Eric, 2026-08-18: "Or filter based on rep." Matched on the WHOLE stored name, never the
    // first word the Rep column happens to display -- two reps called Chris would otherwise
    // silently share a filter.
    if (repFilter && String(q.rep_name || '') !== repFilter) return false;
    return true;
  }));

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
  // ⭐ WHEN THE SERVER HAS MORE THAN IT SENT, SAY SO ON THE SCREEN. A cap nobody is told about
  // is indistinguishable from the whole book, and this one hid 83% of it.
  var truncated = serverTotal > quotes.length;
  document.getElementById('count').textContent =
    filtered.length
      ? (filtered.length + ' quote' + (filtered.length !== 1 ? 's' : '') +
         (parts.length > 1 ? '  (' + parts.join(' · ') + ')' : '') +
         (truncated ? '  · most recent ' + quotes.length + ' of ' + serverTotal +
                      ' loaded — search to reach the rest' : ''))
      : '';
  if (!filtered.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No quotes found.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  for (const q of filtered) {
    const products = parseProducts(q.products);
    const when     = createdParts(q);
    const isExp    = expandedId === q.id;

    const row = document.createElement('tr');
    row.className = 'data-row' + (isExp ? ' expanded' : '');
    row.dataset.id = q.id;

    // Eric, 2026-08-18: "I wish that instead when we need to edit we could edit in place."
    // ⭐ contenteditable, NOT an <input>. A table of input boxes is the "boxes everywhere" look he
    // had already objected to; this reads as plain text until you hover or click it.
    // ⚠️ Only the three free-text identity fields are editable here. The quote number, the state
    // and the commission basis are DERIVED and must not be typed over.
    const inplace = function(col, val, ph, extra) {
      return '<span class="ip" contenteditable="true" data-edit="' + col + '" data-id="' + esc(q.id) + '"' +
        (extra || '') + '>' + esc(val || '') + '</span>' +
        (val ? '' : '<span class="ip-ph">' + esc(ph || '—') + '</span>');
    };
    const brokerCell = inplace('broker_name', q.broker_name, '—') +
      '<br><span style="font-size:.8rem;color:#888">' +
      inplace('broker_agency', q.broker_agency, '—') + '</span>';

    // ⭐ TWO chips, not three. Measured 2026-08-18: Products had a 223px floor -- by far the widest
    // in the table and the reason the whole row could not shrink -- because each chip is nowrap and
    // "FSA / DCAP / LFSA" is a long one. Dropping to two takes the floor down without losing the
    // count, since anything beyond is summarised. The full list is in the quote itself.
    // ⭐ THE COUNT COMES OFF THE CHIP AND GOES INTO THE TOOLTIP. The labels read
    // "FSA / DCAP / LFSA (25 participants)" and "COBRA (87 eligible employees)" -- long enough that
    // two of them wrapped a row to 107px. The PRODUCT is what you scan a list for; the headcount is
    // what you open the quote for. ⚠️ Only a parenthetical STARTING WITH A DIGIT is stripped, so
    // "POP + NDT (POP & HSA)" keeps its qualifier -- that is part of the product's name, not a count.
    const shortLabel = function(p) {
      var i = p.lastIndexOf('(');
      if (i > 0 && p.charAt(p.length - 1) === ')') {
        var inside = p.slice(i + 1);
        if (inside.length && inside.charAt(0) >= '0' && inside.charAt(0) <= '9') {
          return p.slice(0, i).trim();
        }
      }
      return p;
    };
    const chipHtml = products.slice(0,2).map(function(p){
      return '<span class="chip" title="' + esc(p) + '">' + esc(shortLabel(p)) + '</span>';
    }).join('') + (products.length > 2 ? '<span style="color:#888;font-size:.78rem;white-space:nowrap" title="' + esc(products.join(', ')) + '">+' + (products.length-2) + ' more</span>' : '');

    row.innerHTML =
      // 🔴 THE QUOTE NUMBER CARRIES *THREE* COLUMNS' WORTH: the state, the commission basis, and
      // the created date. Eric: "we don't need a commission column since it already has NC",
      // "we don't really need the state if it's the beginning of the quote number", and the
      // created date wrapped onto three lines while restating TX260805. All three columns are gone
      // and no fact went with them. The full timestamp stays in the tooltip.
      '<td><span class="qnum" title="Run ' + esc(when.date) +
        (when.time ? ' at ' + esc(when.time) : '') + '">' +
        (esc(q.quote_number) || '—') + '</span></td>' +
      '<td class="nowrap">' + (esc(effectiveLabel(q.effective_date)) || '<span class="muted">—</span>') + '</td>' +
      '<td>' + inplace('client_name', q.client_name, 'not stated') + '</td>' +
      '<td>' + brokerCell + '</td>' +
      '<td>' + (q.rep_name ? esc(q.rep_name.split(' ')[0]) : '<span class="muted">—</span>') + '</td>' +
      '<td><div style="display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start">' + chipHtml + '</div></td>' +
      '<td>' +
        // Three-way origin in the column that already existed, rather than a new column --
        // a new one would need every colspan widened, which is the defect H nearly shipped.
        '<span class="origin" style="' + ORIGIN_STYLE[originOf(q)] + '" title="' +
          (originOf(q) === 'dashboard' ? 'Handed over from the BenefitLab dashboard (carries a client id)'
           : originOf(q) === 'direct' ? 'Run on the shared link - broker typed their own details'
           : 'Run by ABY from the admin') + '">' + ORIGIN_LABEL[originOf(q)] + '</span>' +
        (q.adjustment ? '<br><span style="font-size:.72rem;color:#b8860b" title="' + esc(q.adjustment_note || "") + '">rate override</span>' : '') +
      '</td>';

    row.addEventListener('click', function(e){
      // Belt and braces: an edit-in-place cell handles its own clicks. The tbody guard
      // above should already have stopped this, but that guard was silently ineffective
      // for a long time, so the row declines rather than trusting it.
      if (e.target.closest('.ip')) return;
      toggleDetail(q.id);
    });
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
  // ⭐ The quote number is NOT repeated here any more -- it is now a column in the row directly
  // above, and a panel that opens by restating the line you clicked wastes its first field.
  // Effective date, phone, email and link source sit on ONE row of four, which is what Eric asked
  // for ("link could be on the same line too").
  // Eric, 2026-08-18: "add a broker name or correct an employer name."
  // ⭐ ONE editable block, saved by one button, rather than a pencil per field. The rows that need
  // this most are the imported ones, where the employer name is blank AND the broker name is
  // whatever the spreadsheet said -- so the realistic action is fixing two or three fields in one
  // sitting, and three separate save clicks would be three chances to leave it half done.
  const ed = function(col, label, val, ph) {
    return '<div class="detail-item"><label>' + label + '</label>' +
      '<input data-edit="' + col + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '" ' +
        'onclick="event.stopPropagation()" ' +
        'style="width:100%;padding:4px 6px;border:1px solid #d7e3da;border-radius:5px;' +
        'font:inherit;font-size:.875rem;background:#fff"></div>';
  };
  return '<div class="detail-inner" data-qid="' + esc(q.id) + '">' +
    '<div class="detail-grid">' +
      // 🔴 EMPLOYER, BROKER AND AGENCY ARE NOT REPEATED HERE ANY MORE. Eric: "I don't like how
      // everything shows up twice - the group name, broker name, etc." They were duplicated
      // because the panel was the only place they could be EDITED; now that the row edits in
      // place, the duplicate has no job. ⭐ The panel holds only what the row does not show.
      ed('broker_email', 'Broker email', q.broker_email, '—') +
      // ⚠️ Phone is NOT a join key -- only the email is -- which is why it needs no normalising.
      ed('broker_phone', 'Broker phone', q.broker_phone, '—') +
      // F-347. Emitted even when empty so the grid keeps its shape; an omitted cell would let the
      // next field slide into its slot and move position from row to row.
      (q.source_tag
        ? '<div class="detail-item"><label>Link source</label><span>' + esc(q.source_tag) + '</span></div>'
        : '<div class="detail-item"></div>') +
      '<div class="detail-item"></div>' +
    '</div>' +
    // Eric, 2026-08-18: somewhere to put what an agent said on the phone. Full width, because a
    // note squeezed into a detail-item column is a note nobody writes.
    '<div class="detail-notes"><label>Notes</label>' +
      '<textarea id="qnote-' + esc(q.id) + '" rows="2" onclick="event.stopPropagation()" ' +
        'style="width:100%;padding:7px 9px;border:1px solid #c8d2de;border-radius:6px;font:13px inherit;resize:vertical">' +
        esc(q.notes || '') + '</textarea>' +
      // ⭐ ONE button for the whole panel, not one per block. There were two saves the moment the
      // fields became editable, and two saves on one form is how somebody edits a name, saves the
      // note, and loses the name.
      '<div style="margin-top:6px;display:flex;align-items:center;gap:10px">' +
        '<button type="button" onclick="event.stopPropagation();saveQuoteEdits(this.dataset.id)" data-id="' + esc(q.id) + '" style="padding:.3rem .9rem;border:1px solid #b8d9c4;background:#e8f4ec;color:#1a5c3a;font-weight:600;border-radius:6px;cursor:pointer;font-size:.82rem">Save changes</button>' +
        '<span data-note-msg="' + esc(q.id) + '" style="font-size:.8rem;color:#5b6b7f"></span>' +
      '</div>' +
    '</div>' +
    '<div class="detail-actions">' +
      '<a href="' + rerunUrl + '&readonly=1" target="_blank" style="display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;background:#e8f4ec;color:#1a5c3a;border-radius:6px;text-decoration:none;font-size:.85rem;font-weight:600;border:1px solid #b8d9c4">View Quote ↗</a>' +
      '<a href="' + rerunUrl + '" target="_blank" style="display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;background:white;color:#555;border-radius:6px;text-decoration:none;font-size:.85rem;font-weight:600;border:1px solid #ddd">Re-run Quote ↗</a>' +
      moveButtons +
      // 🔴 DELETE IS NO LONGER HERE. Eric, 2026-08-18: "Yes delete should move it out of the quote
      // panel." It sat as a peer of View, Re-run and Move to Sold -- four routine buttons and one
      // irreversible one, all the same size, in the row your hand is already in.
      // ⭐ AND ITS JOB LARGELY WENT AWAY THIS SESSION: the reason to delete a quote was usually a
      // wrong name, and names are editable in the row now. What is left is genuinely junk rows,
      // which are rare and not urgent.
      '</div>' +
    // Out of the action row, into its own quiet footer: still reachable, no longer adjacent to
    // anything routine, and behind the same confirm as before.
    '<div style="padding:8px 16px;border-top:1px solid #eef2ef;text-align:right">' +
      '<button onclick="event.stopPropagation();deleteQuote(this.dataset.id)" data-id="' + q.id + '" style="background:none;border:none;color:#a0574f;font-size:.78rem;text-decoration:underline;cursor:pointer;padding:2px 4px">Delete this quote</button>' +
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

// ⚠️ THE DOUBLE-QUOTE CHARACTER WAS MISSING AND THIS FUNCTION IS USED INSIDE ATTRIBUTES.
// The title attribute on the rate-override marker, and the rep dropdown's option value, both
// put broker-typed text into an attribute, so one double-quote ended the attribute early.
// Nothing has broken because those values happen to be internal today -- luck, not a guard.
// ⛔ AND NOTE WHAT THIS COMMENT MAY NOT CONTAIN: A BACKTICK. The whole admin page is built
// inside a template literal, so a backtick here TERMINATES it -- the emitted page breaks while
// worker.js itself still passes node --check, because the file stays valid overall.
// 🔴 Not hypothetical: the first draft of this very comment quoted the attribute using
// backticks and did exactly that. TRAPS #220, caught by check_worker_pages.mjs on its first
// run against this page.
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
                        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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

/**
 * Save the note on one quote (Eric, 2026-08-18).
 *
 * ⚠️ THE TEXTAREA IS NOT CLEARED AND THE PANEL IS NOT RE-RENDERED ON SUCCESS. Re-rendering would
 * throw away anything typed in another open row, and a note is exactly the thing somebody is
 * halfway through writing. It confirms in place instead.
 */
// Saves the editable identity fields AND the note, in that order.
// 🔴 THE ORDER IS DELIBERATE AND THE MESSAGE IS HONEST ABOUT A PARTIAL FAILURE. Two requests
// cannot be made atomic from here, so if the fields save and the note does not, the panel says
// exactly that rather than "Saved" -- a green confirmation covering a write that did not happen
// is the failure this whole screen keeps re-learning (save-hook.js swallowing errors, an UPDATE
// matching no rows). ⭐ The local row is patched from what the SERVER returned, never from what
// was typed, so a value the database normalised (email is lower-cased) shows as stored.
async function saveQuoteEdits(id) {
  var msg  = document.querySelector('[data-note-msg="' + id + '"]');
  var host = document.querySelector('.detail-inner[data-qid="' + id + '"]');
  var box  = document.getElementById('qnote-' + id);
  if (msg) { msg.style.color = '#5b6b7f'; msg.textContent = 'Saving...'; }

  var payload = {};
  if (host) Array.prototype.forEach.call(host.querySelectorAll('[data-edit]'), function (inp) {
    payload[inp.getAttribute('data-edit')] = inp.value;
  });

  var fieldsOk = true, fieldErr = '';
  if (Object.keys(payload).length) {
    try {
      var r = await fetch('/api/quotes/' + id + '/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var dd = await r.json().catch(function () { return {}; });
      fieldsOk = r.ok;
      fieldErr = dd.error || 'Could not save the details';
      if (r.ok && dd.quote) {
        var local = quotes.filter(function (x) { return x.id === id; })[0];
        if (local) Object.keys(dd.quote).forEach(function (k) { local[k] = dd.quote[k]; });
      }
    } catch (e) { fieldsOk = false; fieldErr = 'Could not save the details'; }
  }

  var noteOk = true;
  if (box) {
    try {
      var r2 = await fetch('/api/quotes/' + id + '/note', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: box.value })
      });
      noteOk = r2.ok;
      if (r2.ok) {
        var l2 = quotes.filter(function (x) { return x.id === id; })[0];
        if (l2) l2.notes = box.value;
      }
    } catch (e) { noteOk = false; }
  }

  var text, colour = '#c0392b';
  if (fieldsOk && noteOk)       { text = 'Saved'; colour = '#1a5c3a'; }
  else if (!fieldsOk && noteOk) { text = fieldErr + ' (the note saved)'; }
  else if (fieldsOk && !noteOk) { text = 'The details saved, the note did not'; }
  else                          { text = 'Could not save'; }

  // ⚠️ Re-render only on full success. Re-rendering after a partial failure would wipe whatever
  // is still typed, on the one screen where the user has just been told to try again.
  // 🔴 AND THE MESSAGE IS WRITTEN *AFTER* THE RE-RENDER, ONTO THE NEW ELEMENT. Setting it first
  // looked right and showed nothing at all: render() rebuilds the panel, so the confirmation was
  // being written to a node that was thrown away microseconds later. A save that works but says
  // nothing reads as a save that failed -- caught by driving the screen, not by reading it.
  if (fieldsOk && noteOk) render();
  var live = document.querySelector('[data-note-msg="' + id + '"]');
  if (live) { live.style.color = colour; live.textContent = text; }
}

async function saveQuoteNote(id) {
  var box = document.getElementById('qnote-' + id);
  var msg = document.querySelector('[data-note-msg="' + id + '"]');
  if (!box) return;
  if (msg) { msg.style.color = '#5b6b7f'; msg.textContent = 'Saving...'; }
  try {
    var res = await fetch('/api/quotes/' + id + '/note', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: box.value }),
    });
    var d = await res.json().catch(function () { return {}; });
    if (msg) {
      msg.style.color = res.ok ? '#1a5c3a' : '#c0392b';
      msg.textContent = res.ok ? 'Saved' : (d.error || 'Could not save');
    }
  } catch (e) {
    if (msg) { msg.style.color = '#c0392b'; msg.textContent = 'Could not save'; }
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

// ⭐ DELEGATED ONCE, ON THE STATIC TBODY -- NOT inside loadCommitments, and NOT with { once: true }.
// It used to be both, which meant the first click ANYWHERE in this table (a date cell counted)
// removed the handler and killed every Download and Delete button until the page was reloaded.
// Re-opening the tab could not repair it, because commitmentsLoaded short-circuits the reload.
document.getElementById('ctbody').addEventListener('click', function(e) {
  var dlBtn = e.target.closest('.dl-btn');
  if (dlBtn) { downloadCommitment(dlBtn.dataset.cid); return; }
  var delBtn = e.target.closest('.del-cmt-btn');
  if (delBtn) deleteCommitment(delBtn.dataset.cid);
});
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
          // ⛔ CHARACTER CLASSES, NOT BACKSLASH ESCAPES -- this whole page is a template literal and it
          // EATS them. This line used to read backslash-d-plus backslash-plus, which reached the browser
          // as a pattern matching the LETTER d, so it never matched and the "for groups under N
          // employees" note below has never once rendered. It parsed, it ran, it did nothing.
          // Found 2026-08-18 by check_worker_pages.mjs; pre-existing, not from this change. TRAPS #224.
          var m = f.tierNote ? f.tierNote.match(/^([0-9]+)[+]/) : null;
          if (f.countNote) {
            var displayRate = f.rateNote || '';
            if (m && displayRate.indexOf('minimum') !== -1) {
              displayRate = displayRate.replace(/([(]minimum [^)]+[)])/, '$1 for groups under ' + m[1] + ' employees');
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
    '<title>Commitment to Proceed — ' + (c.quote_number || '') + '</title>' +
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
      // 🔴🔴 A SET PRICE IS A PRICE, AND A PRICE CANNOT BE NEGATIVE.
      // ⛔ THIS PANEL USES TWO OPPOSITE SIGN CONVENTIONS IN ADJACENT FIELDS: in Percent and Flat a
      // NEGATIVE amount is a DISCOUNT (-25 takes $25 off), so somebody who has learned that here
      // will type -500 in Set price meaning "take 500 off" -- and used to get a setup fee of
      // MINUS $500, applied silently, with no warning anywhere, straight onto a client proposal.
      // ⭐ It REFUSES rather than clamping to 0: silently turning -500 into 0 would be a second
      // wrong price, and just as quiet. The message names the mode that does what they meant.
      var prices = {}, negatives = [];
      var readPrice = function (inputId, label, key) {
        var v = parseFloat(panel.querySelector('#' + inputId).value);
        if (isNaN(v)) return;
        if (v < 0) { negatives.push(label); return; }
        prices[key] = v;
      };
      SET_FIELDS.forEach(function (f) { readPrice(f.input, f.label, f.key); });
      readPrice('abySetMonthly', 'Monthly admin', 'monthlyFee');
      if (negatives.length) {
        window.ABY_ADJUSTMENT = null;
        summary.textContent = 'Not applied — a set price cannot be negative (' + negatives.join(', ') +
          '). To take money OFF the standard price, use Percent or Flat, where a negative amount is a discount.';
        return;
      }
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
