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

// The admin guide, GENERATED from docs/admin-guide.md by scripts/build_guide.mjs.
// Eric, 2026-08-23, asked for the explanation to live in the app rather than only in the notes.
// It is imported rather than written here because the markdown is the only copy: two hand-kept
// versions of the same explanation have diverged every time this project has tried it.
// The generated file is JSON-escaped, so it contains no backtick and cannot end a page literal.
import { ADMIN_GUIDE_HTML } from './docs/admin-guide.generated.js';

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
    // The agency's own view of its people. ⛔ Broker-authenticated, and it returns nothing
    // ABY-internal -- no owner, no priority, no tags, no notes.
    if (path === '/api/agency/people'   && method === 'GET')  return handleAgencyPeople(request, env);
    if (path === '/api/agency/person'   && method === 'POST') return handleAgencyPersonUpdate(request, env);
    if (path === '/api/agency/me'       && method === 'GET')  return handleAgencyMe(request, env);
    if (path === '/api/agency/role'     && method === 'POST') return handleAgencyRole(request, env);
    // ABY's own admin views (Eric, 2026-08-18). Admin-gated, not broker-gated.
    if (path === '/api/admin/brokers' && method === 'GET')  return withAuth(request, env, () => handleAdminBrokers(request, env));
    if (path === '/api/admin/assign'  && method === 'POST') return withAuth(request, env, () => handleAdminAssign(request, env));
    if (path === '/api/admin/stats'   && method === 'GET')  return withAuth(request, env, () => handleAdminStats(request, env));
    // The CRM (F-383). Every one is behind withAuth: these are ABY's own notes about who they
    // are courting, and nothing here is broker-facing.
    if (path === '/api/admin/rfp'          && method === 'GET')  return withAuth(request, env, () => handleRfpList(request, env));
    if (path === '/api/admin/rfp'          && method === 'POST') return withAuth(request, env, () => handleRfpAdd(request, env));
    if (path === '/api/admin/rfp/import'   && method === 'POST') return withAuth(request, env, () => handleRfpImport(request, env));
    if (path === '/api/admin/rfp/decision' && method === 'POST') return withAuth(request, env, () => handleRfpDecision(request, env));
    if (path === '/api/admin/rfp/verify'   && method === 'POST') return withAuth(request, env, () => handleRfpVerify(request, env));
    if (path === '/api/admin/crm'        && method === 'GET')  return withAuth(request, env, () => handleCrmList(request, env));
    if (path === '/api/admin/crm'        && method === 'POST') return withAuth(request, env, () => handleCrmAdd(request, env));
    if (path === '/api/admin/crm/tags'   && method === 'GET')  return withAuth(request, env, () => handleCrmTags(request, env));
    if (path === '/api/admin/crm/delete' && method === 'POST') return withAuth(request, env, () => handleCrmDelete(request, env));
    if (path === '/api/admin/crm/person'  && method === 'GET')  return withAuth(request, env, () => handleCrmPerson(request, env));
    if (path === '/api/admin/crm/link'    && method === 'POST') return withAuth(request, env, () => handleCrmLinkPerson(request, env));
    if (path === '/api/admin/crm/person-field' && method === 'POST') return withAuth(request, env, () => handleCrmPersonField(request, env));
    if (path === '/api/admin/crm/suggest' && method === 'GET')  return withAuth(request, env, () => handleCrmSuggestPeople(request, env));
    if (path === '/api/admin/rfp/library'     && method === 'GET')  return withAuth(request, env, () => handleRfpLibrary(request, env));
    if (path === '/api/admin/rfp/answer'      && method === 'POST') return withAuth(request, env, () => handleRfpAnswerSave(request, env));
    if (path === '/api/admin/crm/agencies'     && method === 'GET')  return withAuth(request, env, () => handleCrmAgencies(request, env));
    if (path === '/api/admin/crm/relationship' && method === 'POST') return withAuth(request, env, () => handleCrmRelationship(request, env));
    if (path === '/api/admin/crm/agency'       && method === 'POST') return withAuth(request, env, () => handleCrmAgencyField(request, env));
    if (path === '/api/admin/crm/import'       && method === 'POST') return withAuth(request, env, () => handleCrmImport(request, env));
    // A staged bulk load. The rows sit in cce_staging; these two only MOVE them, and every row
    // still goes through /api/admin/crm/import, which is the one place the identity rules live.
    if (path === '/api/admin/crm/staged'       && method === 'GET')  return withAuth(request, env, () => handleCrmStagedNext(request, env));
    if (path === '/api/admin/crm/staged-done'  && method === 'POST') return withAuth(request, env, () => handleCrmStagedDone(request, env));
    if (path === '/api/admin/crm/agency-dupes' && method === 'GET')  return withAuth(request, env, () => handleCrmAgencyDupes(request, env));
    if (path === '/api/admin/crm/people'       && method === 'GET')  return withAuth(request, env, () => handleCrmAgencyPeople(request, env));
    if (path === '/api/admin/crm/never-quoted' && method === 'GET')  return withAuth(request, env, () => handleCrmNeverQuoted(request, env));
    if (path === '/api/admin/crm/rename'       && method === 'POST') return withAuth(request, env, () => handleCrmRename(request, env));
    if (path === '/api/admin/tidy-note'        && method === 'POST') return withAuth(request, env, () => handleTidyNote(request, env));
    if (path === '/api/admin/tidy-dismiss'     && method === 'POST') return withAuth(request, env, () => handleTidyDismiss(request, env));
    if (path === '/api/admin/tidy-note/delete' && method === 'POST') return withAuth(request, env, () => handleTidyNoteDelete(request, env));
    if (path === '/api/admin/crm/status'       && method === 'POST') return withAuth(request, env, () => handleCrmRecordStatus(request, env));
    if (path === '/api/admin/dated'    && method === 'GET')  return withAuth(request, env, () => handleAbyDated(request, env));
    if (path === '/api/admin/task'     && method === 'POST') return withAuth(request, env, () => handleAbyTask(request, env));
    if (path === '/api/admin/rate'     && method === 'POST') return withAuth(request, env, () => handleAdminRate(request, env));
    // Referral partners (F-referrals, Eric 2026-08-19)
    if (path === '/api/admin/referrals' && method === 'GET')  return withAuth(request, env, () => handleAdminReferrals(request, env));
    if (path === '/api/admin/clients' && method === 'GET')  return withAuth(request, env, () => handleAdminClients(request, env));
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
    // The SHARED QUOTE LINK (F-368). Public and unauthenticated by design -- an employer has no
    // account and must not need one to read a quote addressed to them. The token is the whole
    // credential, which is why it is 128 bits of randomness rather than the quote number.
    if (/^\/q\/[a-z2-9]{16}\/count$/.test(path) && method === 'POST') {
      return handleEmployerCount(path.split('/')[2], request, env);
    }
    if (/^\/q\/[a-z2-9]{16}$/.test(path) && method === 'GET') {
      return serveSharedQuote(path.slice(3), env, request);
    }
    // BOTH LOOKUPS ARE ADMIN ONLY. Each answers a question about ABY's book -- who a broker is,
    // and which agencies ABY works with. On a public endpoint either would be a harvesting
    // surface, and Eric's ask was about quotes ABY runs, so nothing is lost by gating them.
    if (path === '/api/broker-lookup' && method === 'GET') {
      return withAuth(request, env, () => handleBrokerLookup(url, env));
    }
    if (path === '/api/agency-lookup' && method === 'GET') {
      return withAuth(request, env, () => handleAgencyLookup(url, env));
    }
    // Minting one is ADMIN ONLY. Anyone who could mint a token could publish any quote.
    if (/^\/api\/quotes\/[^/]+\/share$/.test(path) && method === 'POST') {
      return withAuth(request, env, () => handleShareQuote(path.split('/')[3], env, url));
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
    if (path === '/admin/today') {
      return withAuth(request, env, () => new Response(adminTodayHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
    }
    // 🔴 RETIRED 2026-08-26 (F-408). The page is gone; the URL is NOT, because bookmarks, the
    // admin guide and every note that ever named it would otherwise 404. It lands on the view that
    // replaced it, already filtered to the never-quoted firms it used to list.
    // ⛔ 302, not 301: a permanent redirect is cached by the browser forever and cannot be taken
    // back if this lands somewhere better later.
    if (path === '/admin/pipeline') {
      return withAuth(request, env, () => Response.redirect(
        new URL('/admin/brokers?view=marketing&quoted=no', request.url).toString(), 302));
    }
    if (path === '/admin/brokers') {
      return withAuth(request, env, () => new Response(adminBrokersHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
    }
    if (path === '/admin/rfp-watch') {
      return withAuth(request, env, () => new Response(adminRfpHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
    }
    if (path === '/admin/referrals') {
      return withAuth(request, env, () => new Response(adminReferralsHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
    }
    if (path === '/admin/guide') {
      return withAuth(request, env, () => new Response(adminGuideHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      }));
    }
    if (path === '/admin/rates') {
      return withAuth(request, env, () => new Response(adminRatesHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }));
    }
    if (path === '/admin/clients') {
      return withAuth(request, env, () => new Response(adminClientsHTML(), {
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
    resolvedPricing    = null,
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
           ran_by, state, adjustment, adjustment_note, client_id, client_match_key, revision)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
      `).bind(
        id, quoteNumber, now, clientName, effectiveDate,
        brokerName, brokerAgency, brokerPhone, brokerEmail,
        repName, repPhone, repEmail,
        commissionIncluded ? 1 : 0,
        productsJson,
        ranBy, stateCode, adjustmentJson, adjustmentNoteVal,
        String(clientId || ''),
        // WRITTEN HERE SO IT CANNOT ROT. `client_match_key` is normName(client_name) stored on the
        // row, which is what lets a quote be joined to a client IN SQL instead of pulling both
        // tables into memory and normalising in JavaScript -- which is what every consumer used to
        // do, and how two screens come to disagree about one number.
        // A derived column is only safe while EVERY write path maintains it. There are three, and
        // backfill_quote_match_key.py repairs the table if one is ever missed.
        normName(clientName)
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
          client_name = ?, client_match_key = ?, effective_date = ?,
          broker_name = ?, broker_agency = ?, broker_phone = ?, broker_email = ?,
          rep_name = ?, rep_phone = ?, rep_email = ?, commission_included = ?, products = ?,
          ran_by = ?, state = ?, adjustment = ?, adjustment_note = ?,
          client_id = CASE WHEN ? <> '' THEN ? ELSE client_id END,
          revision = COALESCE(revision, 1) + 1
        WHERE quote_number = ?
      `).bind(
        clientName, normName(clientName), effectiveDate,
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

  // THE PRICED OUTPUT. Best-effort, on the same footing as source_tag and first_year_value:
  // a newer column than the INSERT, so a quote must save whether or not the migration has run.
  // A shared link renders from this instead of re-running the engine, which is what lets an
  // ADJUSTED quote be shared at all -- the discount stays here, only its effect travels.
  //
  // 🔴 OUTSIDE THE INSERT BRANCH, DELIBERATELY. It started inside it, so re-opening a saved
  // quote -- the no-op path -- never refreshed the stored price, and an old quote could never
  // acquire one at all. Both are exactly the cases a shared link is most likely to be used on.
  // ⚠️ Capped: client-supplied JSON reaching a database, and a priced quote is a few KB.
  if (resolvedPricing && rowId) {
    try {
      const rp = JSON.stringify(resolvedPricing);
      if (rp.length <= 120000) {
        await env.DB.prepare('UPDATE quotes SET resolved_pricing = ? WHERE id = ?').bind(rp, rowId).run();
      } else {
        console.warn('resolved_pricing not stored: ' + rp.length + ' bytes is too large');
      }
    } catch (err) {
      console.warn('resolved_pricing not stored (column missing?):', String(err && err.message || err));
    }
  }

  // REMEMBER THE BROKER (F-366). Best-effort and outside every branch: a re-opened quote is
  // still evidence of who this broker is, and the point is to learn them once.
  await rememberBroker(env, { brokerEmail, brokerName, brokerPhone, brokerAgency });

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
  // 🔴 THE 300 WAS NEVER A DECISION -- it was a default set when the table held 372 rows, so it
  // was effectively "everything" and nobody noticed it was a cap. The 2024-2026 import made it
  // hide 83% of the book overnight. It stays the DEFAULT, because it is a sensible first
  // screen, but the ceiling is now high enough that the toolbar can genuinely ask for all.
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  || '300'), 20000);
  // A whole year, chosen from the toolbar. ⚠️ FILTERED ON created_at, THE DATE THE QUOTE WAS
  // RUN -- never on source_tag, which records the FOLDER a proposal came out of and disagrees
  // with the quote date on 18 rows.
  const year   = (url.searchParams.get('year') || '').trim();
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const ranByFilter = (url.searchParams.get('ran_by') || '').trim();   // '', 'ABY', or 'broker'
  const stateFilter  = (url.searchParams.get('state')  || '').trim().toUpperCase();
  const cols = "id, quote_number, created_at, client_name, effective_date, broker_name, broker_agency, broker_phone, broker_email, rep_name, rep_phone, rep_email, commission_included, products, COALESCE(status, 'P') AS status, COALESCE(ran_by, 'broker') AS ran_by, COALESCE(state, 'TX') AS state, adjustment, adjustment_note, client_id, source_tag, notes, COALESCE(direct, 0) AS direct";

  try {
    const where = [];
    const args = [];
    if (q) {
      const like = `%${q}%`;
      const fields = ['client_name LIKE ?', 'broker_name LIKE ?', 'broker_agency LIKE ?',
                      'quote_number LIKE ?', 'rep_name LIKE ?'];
      args.push(like, like, like, like, like);

      // SEARCH WHAT IS ON THE SCREEN, NOT WHAT IS IN THE COLUMN (Eric, 2026-08-21).
      // The `products` column holds ids and OLD names -- "product-erisa", "ERISA Wrap Document",
      // "derivedC" -- while the log shows the SHORT labels: ERISA, 1094/1095-C, FSA. Searching the
      // raw column would find "ERISA" by luck and never find "1094/1095-C" at all, because that
      // string exists nowhere in the data. It is generated at render time.
      // So the term is resolved through the SAME label map the screen uses, back to the ids that
      // produce it, and those are matched in SQL. Typing what you can see works.
      for (const idPat of productIdsMatchingLabel(q)) {
        fields.push('products LIKE ?');
        args.push(idPat);
      }
      where.push('(' + fields.join(' OR ') + ')');
    }
    if (ranByFilter === 'ABY' || ranByFilter === 'broker') {
      where.push("COALESCE(ran_by, 'broker') = ?");
      args.push(ranByFilter);
    }
    if (stateFilter) {
      where.push("COALESCE(state, 'TX') = ?");
      args.push(stateFilter);
    }
    if (/^[0-9]{4}$/.test(year)) {
      where.push("substr(created_at,1,4) = ?");
      args.push(year);
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
    // SALES WITH NO QUOTE, SHOWN IN THE SOLD TAB (Eric, 2026-08-21): "it would be worth adding
    // the other sold ones to the sold tab with the sold products and just putting no quote in
    // the quote number field and then we can update it if we find the quote."
    //
    // They come from aby_sales, NOT from the quotes table, and that is deliberate. 156 of the
    // 406 sales have no quote at all, so writing them into quotes would add 156 to every quote
    // figure ABY tracks -- the by-agency counts, the totals, the aging report -- and
    // source_tag exists precisely so history cannot inflate adoption numbers. A sale is not a
    // quote. This shows them where Eric asked without counting them as something they are not.
    //
    // THE TABS FILTER IN THE BROWSER, so a row carrying status 'S' lands in the Sold tab by
    // itself. Nothing here has to know which tab is open.
    //
    // "we can update it if we find the quote" is already supported: aby_sales.quote_id links a
    // sale to a quote, and a linked sale drops out of this list automatically.
    // Eric's own reason for expecting more of them: "Several of my quotes are not yet in
    // there" -- the quote log is incomplete, so a missing quote is not evidence of no quote.
    let salesOnly = [];
    if (!q && !year && !ranByFilter && !stateFilter && offset === 0) {
      try {
        const sres = await env.DB.prepare(
          'SELECT id, employer, agency, broker_contact, products, effective_date, announced_at, ' +
          '       account_mgr, note, quote_match ' +
          'FROM aby_sales WHERE quote_id IS NULL ORDER BY announced_at DESC LIMIT 500'
        ).all();
        salesOnly = (sres.results || []).map(function (r) {
          var contact = String(r.broker_contact || '').split(';')[0];
          var name = contact.replace(/<[^>]*>/g, '').trim();
          var mail = (contact.match(/<([^>]+)>/) || [])[1] || '';
          return {
            id: 'sale-' + r.id,
            // The field Eric named. It is not a quote number because there is no quote.
            // NOT ALL UNLINKED SALES ARE QUOTE-LESS. 155 genuinely have no quote in the log;
            // the other 69 DO have one that is simply not linked yet, because the employer had
            // more than one open quote and picking for them would be a guess. Calling both
            // 'no quote' would overstate the first group and hide a job on the second.
            quote_number: (String(r.quote_match || '') === 'No quote found') ? 'no quote' : 'quote not linked',
            created_at: r.announced_at || '',
            client_name: r.employer || '',
            effective_date: r.effective_date || '',
            broker_name: name,
            broker_agency: r.agency || '',
            broker_phone: '',
            broker_email: mail,
            rep_name: r.account_mgr || '',
            rep_phone: '',
            rep_email: '',
            commission_included: null,
            // The sold products as the EMAIL stated them, carried in their own field. Not the
            // product-id JSON a quote has -- there is no quote that produced one, and inventing
            // ids would make these rows match product searches they have no business matching.
            products: '[]',
            sold_products: r.products || '',
            status: 'S',
            ran_by: 'ABY',
            state: 'TX',
            adjustment: null,
            adjustment_note: '',
            client_id: null,
            source_tag: 'sale-no-quote',
            notes: r.note || '',
            direct: 0,
            is_sale_without_quote: true,
            quote_match: r.quote_match || '',
          };
        });
      } catch (err) {
        // The table is newer than this handler. A missing table must not take the log down.
        console.warn('aby_sales not readable:', String(err && err.message || err));
      }
    }

    return jsonResp({ quotes: (result.results || []).concat(salesOnly),
                      total: (totalRow && totalRow.n) || 0,
                      salesWithoutQuote: salesOnly.length,
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

// --- Quote: a shareable link (F-368) ------------------------------------------
//
// Eric, 2026-08-21: "is there any way ... these html quotes could be sent via link? I think it
// would be more professional than sending an html attachment." He is right about the polish, and
// there is a harder reason underneath it: corporate mail security increasingly strips or
// quarantines HTML attachments, so some quotes are probably not arriving at all -- and an
// attachment that never lands looks like a broker who did not reply. Same family as the
// password-reset links that corporate scanners were spending (TRAPS #117).
//
// WHY A TOKEN AND NOT THE QUOTE NUMBER: quote numbers are readable and guessable --
// TX260821-8019-C differs from the next employer's by four digits, so anyone holding one link
// could walk the book. The token is 128 bits of randomness and carries no meaning at all.
//
// WHY A TOKEN AND NOT THE ENCODED STATE BLOB THE ADMIN ALREADY USES: whoever holds a ?rerun=
// URL holds the entire payload, so the SERVER can never decide what a given reader may see. A
// token puts that decision back on the server, which is also what F-367 needs -- an employer
// correcting a headcount has to persist somewhere ABY can look, and a URL cannot do that.

function newShareToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // No l, o, 0 or 1: the link gets read down a phone and typed by hand often enough to matter.
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function handleShareQuote(id, env, url) {
  try {
    const q = await env.DB.prepare(
      'SELECT id, quote_number, share_token, adjustment, state, resolved_pricing FROM quotes WHERE id = ?'
    ).bind(id).first();
    if (!q) return jsonResp({ error: 'Not found' }, 404);

    // REFUSE RATHER THAN SEND A PRICE THAT DOES NOT MATCH THE QUOTE.
    // A shared link RE-RUNS the pricing engine in the reader's browser from the inputs, and the
    // internal price adjustment is deliberately NOT among them -- publishing ABY's discount to
    // the employer would be worse than any of this. The consequence is that an adjusted quote
    // would re-price at STANDARD rates, so the employer opens a link showing MORE than the
    // document they were sent, with nothing on the page saying so.
    // Measured 2026-08-21: 0 of 1,751 quotes carry an adjustment, so nothing is blocked today --
    // but the per-participant price box shipped the same evening, so this becomes reachable the
    // first time somebody discounts a quote and shares it.
    // The real fix is to resolve the PRICE server-side too. Until that exists, refusing is the
    // honest behaviour; a silently wrong number is not.
    // WHY THE REFUSAL IS CONDITIONAL NOW. A quote saved with its PRICED OUTPUT can be shared
    // whatever adjustment produced it: the shared page renders the stored figures instead of
    // re-running the engine, so the employer sees exactly the numbers on their document and the
    // discount never leaves this server. Only a quote we would have to RE-COMPUTE is refused.
    const resolved = q.resolved_pricing && String(q.resolved_pricing).trim();
    const adjusted = q.adjustment && String(q.adjustment).trim() && String(q.adjustment) !== 'null';
    if (adjusted && !resolved) {
      return jsonResp({
        error: 'not_shareable_adjusted',
        message: 'This quote carries a price adjustment. A shared link re-prices at standard rates, so the employer would see a higher figure than the quote you sent. Send the file for this one.'
      }, 409);
    }
    // The same shape of mismatch: state is not carried either, so an Outside-Texas quote would
    // re-price at Texas rates.
    if (q.state && String(q.state) !== 'TX' && !resolved) {
      return jsonResp({
        error: 'not_shareable_state',
        message: 'This quote was priced outside Texas, and a shared link re-prices at Texas rates. Send the file for this one.'
      }, 409);
    }

    let token = q.share_token;
    if (!token) {
      token = newShareToken();
      const r = await env.DB.prepare(
        'UPDATE quotes SET share_token = ? WHERE id = ? AND share_token IS NULL'
      ).bind(token, id).run();
      // Report what came BACK. If the update changed nothing, a concurrent request minted one
      // first and THIS token was never stored -- handing it out would give a link that 404s.
      if (!r || !r.meta || !r.meta.changes) {
        const again = await env.DB.prepare('SELECT share_token FROM quotes WHERE id = ?').bind(id).first();
        token = (again && again.share_token) || null;
      }
    }
    if (!token) return jsonResp({ error: 'Could not mint a link' }, 500);
    return jsonResp({ ok: true, token: token, url: new URL('/q/' + token, url).toString() });
  } catch (err) {
    console.error('handleShareQuote failed:', err);
    return jsonResp({ error: String(err) }, 500);
  }
}

// --- The employer corrects the headcount on a shared quote (F-367) ------------
//
// Eric, 2026-08-21: "I didn't know the number of forms, so I entered 20 on each. The broker will
// need to come back to me with the real number and I'll need to revise the quote. What if the
// employer could just make that adjustment and have the new total compute automatically?"
//
// HIS THREE RULINGS SHAPE THIS ENTIRELY:
//   1. The quote BODY stays ABY's quote. The employer's number and its price appear at the
//      SIGNATURE LINE -- "what they sign is what they asserted", so a screenshot can never come
//      back at a price ABY never gave.
//   2. A price adjustment SURVIVES a count change, at the agreed rate.
//   3. ABY gets told. "A silently changed number is WORSE than today."
//
// THIS ENDPOINT IS ONLY RULING 3. The re-pricing happens in the reader's browser from the
// stored rate, because it has to feel instant while they are typing. This records what they
// said, so ABY can see it even if they never sign.
//
// PUBLIC, AND THE TOKEN IS THE WHOLE CREDENTIAL. That is acceptable for the same reason the
// page itself is: 128 bits of randomness, and the only thing it can do is annotate the ONE
// quote it belongs to. It CANNOT change the quote, the price, or ABY's own count -- those stay
// exactly as quoted, which is ruling 1 expressed in the schema rather than in the UI.
// --- The broker directory: remember them once, prefill after that (F-366) -----
//
// Eric, 2026-08-21: "is there any way for quotes that ABY is running for us to save the broker's
// info (name, email, phone, agency, logo) so that when we want to quote for them we could
// populate that stuff automatically instead of us having to start from scratch every time?"
//
// 🔴 IT IS ITS OWN TABLE, AND THAT IS THE WHOLE DESIGN DECISION. The obvious home is brokers,
// which already has exactly these columns -- and writing there would BREAK BROKER SIGNUP. That
// table backs self-service accounts: handleRegister refuses with "An account already exists
// for that email. Try signing in." the moment a row exists, and an auto-created row has an empty
// password_hash, which verifyPassword always rejects. So every broker ABY ever quoted for
// would be permanently locked out of registering, told an account exists that nobody can sign
// into. The invite path skips them for the same reason.
// ⭐ A directory of people we have quoted for is not a list of people with accounts. Two
// different facts, two tables.
//
// ⚠️ THE FIRST VERSION OF THIS ROW SAID THE DETAILS WERE ALREADY SITTING IN 1,752 QUOTES. They
// are not: measured 2026-08-21, ten quotes carry a broker name and six an email. The imported
// history only ever had an agency column. So this CAPTURES FORWARD -- it starts nearly empty and
// becomes useful with use, which is a different promise from "we already have this".

async function rememberBroker(env, fields) {
  const email = String(fields.brokerEmail || '').trim().toLowerCase();
  // No email, no identity. There is nothing to key a directory on and a row per typo is worse
  // than no row.
  if (!email || email.indexOf('@') === -1 || email.length > 200) return;

  const name   = String(fields.brokerName   || '').trim().slice(0, 120);
  const phone  = String(fields.brokerPhone  || '').trim().slice(0, 40);
  const agency = String(fields.brokerAgency || '').trim().slice(0, 120);
  const now    = new Date().toISOString();

  try {
    // COALESCE(NULLIF(...)) on every field: a later quote that leaves the phone blank must not
    // erase the phone we already learned. A blank is "not stated on this quote", never "cleared".
    await env.DB.prepare(
      'INSERT INTO broker_directory (email, name, phone, agency, first_seen, last_seen, quote_count) ' +
      'VALUES (?,?,?,?,?,?,1) ' +
      'ON CONFLICT(email) DO UPDATE SET ' +
      "  name        = COALESCE(NULLIF(excluded.name, ''), broker_directory.name), " +
      "  phone       = COALESCE(NULLIF(excluded.phone, ''), broker_directory.phone), " +
      "  agency      = COALESCE(NULLIF(excluded.agency, ''), broker_directory.agency), " +
      '  last_seen   = excluded.last_seen, ' +
      '  quote_count = broker_directory.quote_count + 1'
    ).bind(email, name, phone, agency, now, now).run();
  } catch (err) {
    // Best-effort, like source_tag: the table is newer than the save path and a quote must save
    // whether or not it exists.
    console.warn('broker_directory not updated:', String(err && err.message || err));
  }
}

// ADMIN ONLY, AND DELIBERATELY SO. This answers "who is broker@example.com?" with a name, a
// phone and an agency. On a PUBLIC endpoint that is an enumeration surface -- anyone could probe
// addresses and harvest the answer. Eric's ask was specifically about "quotes that ABY is
// running", so the prefill belongs to an authenticated ABY session and nothing is lost by
// keeping it there.
async function handleBrokerLookup(url, env) {
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return jsonResp({ matches: [] });

  const like = '%' + q.replace(/[%_]/g, '') + '%';
  const r = await env.DB.prepare(
    'SELECT email, name, phone, agency, quote_count FROM broker_directory ' +
    'WHERE lower(email) LIKE ? OR lower(name) LIKE ? OR lower(agency) LIKE ? ' +
    // Most-quoted first: the person ABY deals with often is the one they are most likely typing.
    'ORDER BY quote_count DESC, last_seen DESC LIMIT 8'
  ).bind(like, like, like).all();
  return jsonResp({ matches: r.results || [] });
}

// The agency names ABY has actually used, for the agency box. Straight from the quote history,
// which is the one field the imported book DOES carry -- 189 distinct names across 1,751 quotes.
// Admin only for the same reason as above: the agency list is ABY's book of business.
async function handleAgencyLookup(url, env) {
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return jsonResp({ matches: [] });
  const like = '%' + q.replace(/[%_]/g, '') + '%';
  const r = await env.DB.prepare(
    'SELECT trim(broker_agency) AS agency, COUNT(*) AS n FROM quotes ' +
    "WHERE trim(COALESCE(broker_agency,'')) <> '' AND lower(broker_agency) LIKE ? " +
    'GROUP BY trim(broker_agency) ORDER BY n DESC LIMIT 8'
  ).bind(like).all();
  return jsonResp({ matches: r.results || [] });
}

async function handleEmployerCount(token, request, env) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResp({ error: 'Invalid JSON' }, 400); }

  const q = await env.DB.prepare('SELECT id, quote_number FROM quotes WHERE share_token = ?')
    .bind(token).first();
  // Same silence as the page itself: an unknown token must not become a way to ask whether a
  // token exists.
  if (!q) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

  // Accept a small map of productId -> count and nothing else. It is unauthenticated input
  // heading for a database, so it is rebuilt rather than stored as received.
  const incoming = (body && typeof body.counts === 'object' && body.counts) || {};
  const counts = {};
  let kept = 0;
  for (const key of Object.keys(incoming)) {
    if (kept >= 20) break;
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(key)) continue;
    const n = Number(incoming[key]);
    // A headcount is a whole number and cannot be negative. 100000 is far past any group ABY
    // administers and is here to bound the field, not to express a business rule.
    if (!Number.isFinite(n) || n < 0 || n > 100000 || Math.floor(n) !== n) continue;
    counts[key] = n;
    kept++;
  }
  if (!kept) return jsonResp({ error: 'No usable counts' }, 400);

  try {
    await env.DB.prepare('UPDATE quotes SET employer_counts = ?, employer_counts_at = ? WHERE id = ?')
      .bind(JSON.stringify(counts), new Date().toISOString(), q.id).run();
  } catch (err) {
    // The columns are newer than the table. Recording is best-effort in exactly the way the
    // save path is: it must never stop an employer using the page.
    console.warn('employer_counts not stored (columns missing?):', String(err && err.message || err));
    return jsonResp({ ok: false, recorded: false });
  }

  return jsonResp({ ok: true, recorded: true });
}

async function serveSharedQuote(token, env, request) {
  const url = new URL(request.url);
  const q = await env.DB.prepare(
    'SELECT quote_number, client_name, effective_date, broker_name, broker_agency, broker_phone, ' +
    '       broker_email, commission_included, rep_name, products, resolved_pricing ' +
    'FROM quotes WHERE share_token = ?'
  ).bind(token).first();

  // An unknown token is a plain 404 with no detail. It must not become a way to ask whether a
  // token exists, which is the rule /api/agency-logo already follows.
  if (!q) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });

  // EXACTLY the fields the admin's own View link carries, and no more. Every one of them is
  // already printed on the client document, so the link exposes nothing the employer does not
  // hold. Everything internal -- adjustment, adjustment_note, ran_by, state, notes, status,
  // source_tag, client_id, first_year_value, direct -- stays on the server.
  const shared = {
    quoteNumber: q.quote_number || '',
    clientName: q.client_name || '',
    effectiveDate: q.effective_date || '',
    brokerName: q.broker_name || '',
    brokerAgency: q.broker_agency || '',
    brokerPhone: q.broker_phone || '',
    brokerEmail: q.broker_email || '',
    commissionIncluded: !!q.commission_included,
    repName: q.rep_name || '',
    products: q.products || '[]',
    readonly: true
  };

  // THE PRICED OUTPUT AS IT WAS QUOTED, when the quote carries one. The page renders these
  // figures rather than re-running the engine, which is what stops an old quote being re-priced
  // at today's rates and what lets a discounted quote be shared at all.
  // ⛔ These are AMOUNTS, not the adjustment. The same numbers are already on the document the
  // employer holds, and a discount is not recoverable from a price without the list price.
  if (q.resolved_pricing) {
    try {
      const parsed = JSON.parse(q.resolved_pricing);
      if (Array.isArray(parsed) && parsed.length) shared.resolvedPricing = parsed;
    } catch (e) {
      // Unparseable stored pricing falls back to re-running the engine, which is the behaviour
      // that existed before this. It must never take the page down.
    }
  }

  const res = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  let html = await res.text();
  // Neutralise the one sequence that can end a script element early: a client name containing
  // a closing tag would otherwise break out of it and the rest of the payload would render as
  // markup. Escaping the slash is invisible to JSON.parse and inert to the HTML parser.
  const CLOSE = '<' + '/';
  const payload = JSON.stringify(shared).split(CLOSE).join('<' + String.fromCharCode(92) + '/');
  // BASE HREF, AND IT IS NOT COSMETIC. index.html references every stylesheet and script with a
  // RELATIVE path (assets/js/app.js), which the browser resolves against the current directory.
  // At /q/<token> that directory is /q/, so every asset 404s: the page renders as a naked
  // unstyled form with no JavaScript, and the injected quote never applies. It still returns
  // 200 and still contains the payload, so nothing short of opening it in a browser shows this.
  // The tag must come BEFORE the first relative reference, so it goes at the top of <head>
  // rather than the bottom -- and the state rides with it, so it is set before any script runs.
  const OPEN_HEAD = '<head>';
  const inject = '<base href="/">' +
                 '<script>window.__ABY_SHARED = ' + payload + ';' + CLOSE + 'script>';
  html = html.indexOf(OPEN_HEAD) !== -1
    ? html.replace(OPEN_HEAD, OPEN_HEAD + inject)
    : inject + html;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Not cached: the quote behind the token can change, and a shared link should show what is
      // true now rather than what was true when somebody first opened it.
      'Cache-Control': 'no-store',
      // A quote carries an employer's name and a broker's contact details. It is reachable by
      // anyone holding the link by design, but it has no business in a search index.
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

// ─── Quote: delete (admin) ────────────────────────────────────────────────────

async function handleDeleteQuote(id, env) {
  try {
    // A SIGNED AUTHORIZATION MUST NOT OUTLIVE THE QUOTE IT AUTHORIZES.
    // This used to delete the quote row alone. Four orphaned commitments were found in
    // production on 2026-08-21 -- test signatures for quotes that no longer existed --
    // and an orphan is not merely untidy: a commitment is the record that an employer
    // said yes, so anything counting them counts an agreement nobody can produce.
    //
    // THE quote_number GUARD IS LOAD-BEARING. Commitments join to quotes by
    // quote_number, and that column was NOT unique until F-339 added the index, so
    // historic rows can share one. Deleting by number alone could therefore take a
    // commitment belonging to a quote that is staying. Only delete the commitment when
    // no OTHER quote still carries that number.
    const q = await env.DB.prepare('SELECT quote_number FROM quotes WHERE id = ?').bind(id).first();
    if (!q) {
      // 'ok: true' regardless of whether anything was deleted is how the old handler
      // reported a no-op as a success. Say what happened instead.
      return jsonResp({ error: 'Not found', deleted: 0 }, 404);
    }
    let commitments = 0;
    const others = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM quotes WHERE quote_number = ? AND id <> ?'
    ).bind(q.quote_number, id).first();
    if (!others || !others.n) {
      const c = await env.DB.prepare('DELETE FROM commitments WHERE quote_number = ?')
        .bind(q.quote_number).run();
      commitments = (c && c.meta && c.meta.changes) || 0;
    }
    const d = await env.DB.prepare('DELETE FROM quotes WHERE id = ?').bind(id).run();
    const deleted = (d && d.meta && d.meta.changes) || 0;
    // Report what came BACK, not what was asked for.
    return jsonResp({ ok: deleted > 0, deleted: deleted, commitments: commitments,
                      sharedNumber: !!(others && others.n) });
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
  if (!['P', 'I', 'S', 'D', 'N'].includes(status)) {
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
const QUOTE_EDITABLE = ['client_name', 'broker_name', 'broker_agency', 'broker_email',
                        'broker_phone', 'effective_date'];

async function handleQuoteEdit(request, id, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }

  const sets = [], vals = [];

  // ⭐ "THE CLIENT CAME TO US DIRECTLY" IS AN ANSWER, NOT AN ABSENCE (Eric, 2026-08-21):
  // "if there's no broker or if we're working directly with the client ... it wouldn't look on the
  // log like something's missing, instead it would note that they are direct."
  // 🔴 THIS IS WHY IT IS A STORED FLAG AND NOT INFERRED FROM AN EMPTY BROKER FIELD. A blank broker
  // means WE DO NOT KNOW -- 1742 of 1750 imported rows are blank because the spreadsheet never had
  // the agent's name, not because anybody came direct. Inferring would relabel the entire history.
  // ⚠️ And it does NOT assert that no broker exists. Eric: "I'm sure there is a broker, but the
  // client reached out to us directly." It is a fact about THIS QUOTE, not about the employer.
  if ('direct' in body) {
    sets.push('direct = ?');
    vals.push(body.direct ? 1 : 0);
  }

  for (const col of QUOTE_EDITABLE) {
    if (!(col in body)) continue;                       // absent means "leave it", never "clear it"
    let v = String(body[col] == null ? '' : body[col]).trim().slice(0, 200);
    // 🔴 EMAIL IS THE JOIN KEY, so it is normalised here the same way every other write, lookup
    // and join in this file normalises it. A broker's book is assembled by
    // lower(trim(broker_email)); one row saved as "Jane@Agency.com " and the next as
    // "jane@agency.com" splits one person in half with nothing in any log.
    // ⭐ EFFECTIVE DATE IS A HUMAN STRING IN THIS TABLE, NOT A DATE COLUMN. Most rows hold an
    // estimate the import produced -- "Oct 2025 or later", 85 of them on that value alone -- and
    // Eric asked to be able to set the real one once it is known.
    // 🔴 TWO GUARDS, BOTH LOAD-BEARING:
    //   ⛔ AN EMPTY VALUE IS IGNORED, NEVER SAVED. A date input that is cleared, or one the browser
    //     could not populate because the stored value is a phrase, would otherwise WIPE the estimate
    //     and leave the row with no effective date at all. Absent must not overwrite known.
    //   ⛔ ONLY ISO YYYY-MM-DD IS ACCEPTED. effectiveLabel() renders that as "Sep 1, 2026" and passes
    //     anything else through verbatim, and the SORT comparator reads the same value -- so a
    //     free-typed "9/1/26" would display raw and sort into the wrong place, silently.
    if (col === 'effective_date') {
      if (!v) continue;
      if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v)) {
        return jsonResp({ error: 'Effective date must be a real date.' }, 400);
      }
    }
    if (col === 'broker_email') v = v.toLowerCase();
    sets.push(col + ' = ?');
    vals.push(v);
    // Renaming the employer has to RE-KEY the row, or the quote silently stops joining to its
    // client -- and a conversion rate that quietly drops a quote looks like a business fact.
    if (col === 'client_name') {
      sets.push('client_match_key = ?');
      vals.push(normName(v));
    }
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

/**
 * 🔴 THE REP STORED ON A QUOTE IS A DISPLAY NAME, NEVER AN ID.
 *
 * ERIC, 2026-08-26: "I selected my name from the drop-down and it assigned me but didn't
 * capitalize my name." The form posted the id -- eric -- and it went into rep_name verbatim,
 * while every quote run through the tool stores "Eric Johnson". The log's Rep column prints the
 * FIRST WORD of rep_name, so his manually logged row read "eric" beside nine reading "Eric".
 *
 * ⛔ THIS IS NOT COSMETIC: the log's rep filter builds its options FROM rep_name, keyed on the
 * full string. Two spellings of one person are two entries in that dropdown, and picking either
 * hides the other person's quotes. Measured on production before the fix: 1 row said "eric",
 * 9 said "Eric Johnson".
 *
 * ⚠️ THE NAMES HAVE TO MATCH assets/js/data/reps.js EXACTLY, because that file is what the quote
 * tool writes. They are two copies of one list and nothing enforced that, so check_reachable.mjs
 * now asserts they agree -- one fix applied to one copy of a pattern is not applied to the
 * pattern (TRAPS #197).
 *
 * ⛔ DELIBERATELY THE PUBLIC TWO ONLY. The seven ABY staff on the internal overlay are account
 * managers who FIELD requests; the rep named on a quote is who it came from. If that turns out
 * to be wrong it is Eric's call, not a tidy-up.
 */
const QUOTE_REP_NAMES = {
  eric:  'Eric Johnson',
  niels: 'Niels Christiansen',
};

/**
 * The products a hand-logged quote may carry, ORDERED BY HOW OFTEN EACH IS ACTUALLY QUOTED.
 *
 * 📊 Measured on production 2026-08-26 across all 6,170 quotes: COBRA 3,145 - FSA 1,693 -
 * ERISA 1,369 - POP 883 - HSA 830 - HRA 829 - ACA 403 - State Continuation 67 - QTB 63 -
 * Medicare HRA 23 - ICHRA 19 - LSB 15. Section 127 and Direct Billing have never been quoted,
 * so they sit last rather than being left out -- never quoted is not the same as not sold.
 * ⭐ Alphabetical or catalog order would put the two nobody picks above the one everybody does.
 *
 * ⛔ THE THREE LEGACY IDS IN PRODUCT_SHORT ARE NOT HERE ON PURPOSE. form5500, ndt and hipaa are
 * not in products.js -- the tool no longer sells them -- so offering them would let somebody log
 * a quote for something ABY cannot fulfil. They stay in PRODUCT_SHORT because 77 imported rows
 * still have to render.
 */
const QUOTE_PRODUCT_IDS = [
  'cobra', 'fsa', 'erisa', 'pop', 'hsa', 'hra', 'aca',
  'stateContinuation', 'ichra', 'section132', 'mpra', 'lifestyle',
  'section127', 'directBilling',
];

async function handleAdminAddQuote(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const employer = String(body.employer || '').trim().slice(0, 160);
  if (!employer) return jsonResp({ error: 'Which employer?' }, 400);

  const agency = String(body.agency || '').trim().slice(0, 160);
  const when = String(body.quotedOn || '').trim() || new Date().toISOString().slice(0, 10);
  // ⛔ AN UNKNOWN REP IS REFUSED, NEVER STORED AND NEVER SILENTLY BLANKED. Storing the raw string
  // is what produced the lowercase "eric"; blanking it would lose the one fact the person typing
  // actually knew. Same shape as the unrecognised-product refusal on this form.
  const repId = String(body.rep || '').trim().toLowerCase();
  if (repId && !Object.prototype.hasOwnProperty.call(QUOTE_REP_NAMES, repId)) {
    return jsonResp({ error: 'Unknown rep.' }, 400);
  }
  const rep = repId ? QUOTE_REP_NAMES[repId] : '';
  const status = ['P', 'I', 'S', 'D', 'N'].includes(String(body.status || 'P')) ? String(body.status || 'P') : 'P';

  // Product ids arrive as the tool's own vocabulary, so a manual row filters and reports exactly
  // like a generated one.
  // 🔴 THE SERVER VALIDATES THEM, because the browser is no longer the only caller that could
  // send one. Before the pills shipped, the page mapped typed words through a table and rejected
  // what it did not recognise -- so the ONLY guard against a bad product id lived in the page.
  // A checker that only reads the form would have agreed with itself perfectly.
  const rawIds = Array.isArray(body.products) ? body.products.slice(0, 20) : [];
  const ids = [], badIds = [];
  rawIds.forEach((raw) => {
    const bare = String(raw).replace(/^product-/, '');
    if (QUOTE_PRODUCT_IDS.indexOf(bare) === -1) badIds.push(String(raw));
    else if (ids.indexOf(bare) === -1) ids.push(bare);
  });
  if (badIds.length) return jsonResp({ error: 'Not a product we sell: ' + badIds.join(', ') }, 400);
  // ⚠️ `name` carries the SHORT LABEL the quote log renders, not the bare id. It used to store the
  // id, so anything reading the name rather than looking the id up printed "cobra" in a column of
  // "COBRA". The id is still the identity; the name is display, and both are now right.
  // ⛔ VALIDATED AGAINST THE LABEL MAP, never taken on trust: an unknown package id would render
  // as its own raw text in the middle of a product column.
  const acaForms = String(body.acaForms || '').trim();
  if (acaForms && !['derivedB', 'derivedC'].includes(acaForms)) {
    return jsonResp({ error: 'Not an ACA form set.' }, 400);
  }
  const products = JSON.stringify(ids.map((id) => ({
    id: 'product-' + id,
    name: (PRODUCT_SHORT[id] && PRODUCT_SHORT[id].def) || id,
    inputs: (id === 'aca' && acaForms) ? { package: acaForms } : {},
  })));

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

// 🔴 THE PIPELINE API WENT WITH THE PIPELINE PAGE, 2026-08-26 (F-408).
//
// Deleted here: PIPELINE_WINDOW_DAYS, pipelineStatusSql() and handleAdminPipeline() -- the
// "Everyone we track" list -- plus handleAdminAddProspects(), the "Add prospects" paste box.
// ⛔ THEY HAD EXACTLY ONE CALLER EACH AND IT WAS THAT PAGE. Leaving a write endpoint alive with
// no door is how a half-retired feature comes back later as a mystery.
//
// ⚠️ handleAdminAddProspects WROTE INTO `brokers`, AND THAT IS THE REAL REASON IT IS GONE rather
// than rehomed. Measured on production 2026-08-26: `brokers` holds SIX rows, all six of them
// leftover checker fixtures (zz-test-*@example.invalid, "ZZ Test Agency"), and NOT ONE of the
// 6,170 quotes joins to it. The channel register is `people` + `agencies`, which is what the
// Marketing view import writes to. A second door onto the wrong table would have entrenched the
// model the contact register was built to replace.
// 📄 The Referrals page still reads `brokers` and is filed separately -- that is a design
// question, not a cleanup.

// ── THE CRM: notes and tags on an agency or an agent (F-383) ───────────────────────────────────
//
// ⭐⭐ ONE WRITE PATH SERVES ONE ROW AND FIVE HUNDRED. Eric asked for bulk apply -- check the rows,
// pick a tag, set a date, apply -- and a separate bulk endpoint would be a second copy of every
// validation rule in here. So "entities" is always an ARRAY, even when the screen sent one.
//
// 🔴 WHO WROTE IT CANNOT COME FROM THE SESSION, AND SAYING SO IS BETTER THAN GUESSING. The ABY
// admin has ONE shared password (F-6), so a session proves somebody is ABY and nothing more.
// created_by therefore arrives from the screen and is validated against the SAME rep vocabulary as
// everything else -- eric / niels -- with the empty string meaning "nobody said". ⛔ It is NOT
// authentication and must never be read as though it were. An unattributed note is a real state;
// stamping a guess would put words in one of their mouths.
const CRM_REPS = ['eric', 'niels'];

// 🔴 THE ANTI-DRIFT RULE, AND IT IS THE WHOLE REASON TAGS ARE NOT FREE TEXT. A tag is PICKED from
// the set that already exists; only a genuinely new one is typed. So before inserting, an incoming
// label is matched case-insensitively against the labels already in use and, if one is found, THE
// EXISTING SPELLING WINS. "Sent Quoting Tool Email" typed today becomes the "sent quoting tool
// email" that forty agencies already carry, instead of a second tag nobody can see is a duplicate.
// ⛔ Do NOT solve this by lowercasing everything on the way in -- Eric types the tags and they are
// read on screen, so the FIRST spelling is the one to keep, not a flattened one.
async function crmCanonicalLabel(env, label) {
  const raw = String(label || '').trim().slice(0, 80);
  if (!raw) return '';
  const hit = await env.DB.prepare(
    "SELECT label FROM crm_events WHERE kind = 'tag' AND lower(trim(label)) = ? LIMIT 1"
  ).bind(raw.toLowerCase()).first();
  return hit && hit.label ? hit.label : raw;
}

// Does this entity actually exist? ⛔ An event written against an id nothing points at is invisible
// for ever: it never appears on a page, it never appears in a tag filter, and no error was raised.
async function crmEntityExists(env, type, id) {
  // ⭐ 'rfp' JOINED THIS LIST RATHER THAN GETTING ITS OWN NOTES TABLE (F-384). A dated,
  // backdatable note with a tag on it is exactly what crm_events already is, and a second copy
  // would need its own write path, its own validation and its own bugs.
  const table = type === 'agency' ? 'agencies' : type === 'person' ? 'people'
              : type === 'rfp' ? 'rfp_opportunity' : null;
  if (!table) return false;
  const r = await env.DB.prepare('SELECT id FROM ' + table + ' WHERE id = ?').bind(id).first();
  return Boolean(r);
}

// 🔴🔴 A HUMAN IS A people.id, NOT AN EMAIL ADDRESS, AND THAT IS THE WHOLE POINT OF THE people TABLE.
// An address BELONGS TO AN AGENCY, so it changes when somebody moves firm -- exactly the moment the
// relationship most needs to survive. Eric, 2026-08-23: "the fact that they know and like us
// recorded without taking their quote history with them."
//
// ⭐ AN EMAIL IS STILL ACCEPTED AND IS RESOLVED, never used as the key. Most screens hold an address,
// and making every caller look up the person first would just move this lookup somewhere it gets
// written twice. ⛔ Resolution goes THROUGH broker_directory -- an address nobody has recorded does
// not silently mint a person.
//
// Returns { id } or { why } -- the REASON matters, because two different guards refuse a bad value
// and a caller counting failures cannot tell them apart.
async function crmResolvePerson(env, raw) {
  const v = String(raw || '').trim();
  if (!v) return { why: 'no id' };
  if (v.indexOf('@') !== -1) {
    const r = await env.DB.prepare(
      'SELECT person_id FROM broker_directory WHERE lower(trim(email)) = ?'
    ).bind(v.toLowerCase()).first();
    if (!r) return { why: 'no address on file for ' + v.toLowerCase() };
    if (!r.person_id) return { why: 'that address has no person yet -- run /api/migrate' };
    return { id: r.person_id };
  }
  // 🔴 NEVER INVENT AN ID FOR A NAME. A value that is neither an address nor an id is a NAME, and a
  // tag attached to a name attaches to a string -- which is how "Jason Sandler" is two rows on the
  // agent list today. Roughly 38 people on the quote log are known by name only; they become
  // taggable when somebody records an address, not before.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    return { why: 'no email and no person id, so no stable key -- record an address first' };
  }
  return { id: v };
}

/**
 * Read one entity's history, or everyone carrying one tag.
 *
 * ⭐ TWO QUESTIONS, ONE ENDPOINT, because they read the same table from opposite ends:
 *   ?entity_type=agency&entity_id=<id>   what has happened to THIS firm
 *   ?label=<tag>                         who carries THIS tag ("show me everyone we emailed")
 * ⚠️ An empty result is a real answer and is returned as one. It is NOT dressed up as a happy
 * state -- three pages in this admin have asserted "all done" over a population of zero.
 */
async function handleCrmList(request, env) {
  const u = new URL(request.url).searchParams;
  const label = (u.get('label') || '').trim();
  const type = (u.get('entity_type') || '').trim().toLowerCase();
  const id = (u.get('entity_id') || '').trim();

  try {
    if (label) {
      const r = await env.DB.prepare(
        "SELECT e.*, " +
        "       CASE WHEN e.entity_type = 'agency' THEN a.name ELSE COALESCE(NULLIF(trim(pp.name),''), e.entity_id) END AS entity_name " +
        'FROM crm_events e ' +
        "LEFT JOIN agencies a ON e.entity_type = 'agency' AND a.id = e.entity_id " +
        "LEFT JOIN people pp ON e.entity_type = 'person' AND pp.id = e.entity_id " +
        "WHERE e.kind = 'tag' AND lower(trim(e.label)) = ? " +
        'ORDER BY e.happened_at DESC LIMIT 2000'
      ).bind(label.toLowerCase()).all();
      const rows = r.results || [];
      return jsonResp({ events: rows, matched: rows.length, by: 'label' });
    }
    if (!type || !id) return jsonResp({ error: 'Which entity?' }, 400);
    // ⭐ A caller may name a person by address; it is resolved, never used as the key.
    let key = id;
    if (type === 'person') {
      const resolved = await crmResolvePerson(env, id);
      if (!resolved.id) return jsonResp({ error: resolved.why }, 400);
      key = resolved.id;
    }
    const r = await env.DB.prepare(
      'SELECT * FROM crm_events WHERE entity_type = ? AND entity_id = ? ' +
      'ORDER BY happened_at DESC, created_at DESC LIMIT 500'
    ).bind(type, key).all();
    const rows = r.results || [];
    return jsonResp({ events: rows, matched: rows.length, by: 'entity' });
  } catch (err) {
    // 🔴 A THROWN QUERY MUST NOT RENDER AS "nothing has happened here". Those are opposite facts and
    // this admin has confused them before (TRAPS #253, #264). The error travels to the screen.
    return jsonResp({ events: [], error: String((err && err.message) || err) }, 500);
  }
}

/** The tag set, with how many carry each. This IS the picker -- it is what makes a tag picked. */
async function handleCrmTags(request, env) {
  try {
    const r = await env.DB.prepare(
      'SELECT label, COUNT(*) AS n, MAX(happened_at) AS last_used ' +
      "FROM crm_events WHERE kind = 'tag' AND trim(COALESCE(label,'')) <> '' " +
      'GROUP BY lower(trim(label)) ORDER BY n DESC, label'
    ).all();
    return jsonResp({ tags: r.results || [] });
  } catch (err) {
    return jsonResp({ tags: [], error: String((err && err.message) || err) }, 500);
  }
}

/**
 * Write a note or a tag against one entity or many.
 *
 * ⚠️ EVERY ENTITY IS REPORTED INDIVIDUALLY -- written, skipped or failed -- and the screen shows the
 * counts. A bulk apply that says "done" over forty rows when six were refused is the same defect as
 * a filter that matches nothing: the number on screen has to be the number in the table. Eric's own
 * guard for this build says it plainly -- a tag applied to 40 agencies must read back as 40.
 */
async function handleCrmAdd(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }

  const kind = String(body.kind || '').trim().toLowerCase();
  if (kind !== 'note' && kind !== 'tag') return jsonResp({ error: 'kind must be note or tag.' }, 400);

  const bodyText = String(body.body || '').trim().slice(0, 4000);
  const label = kind === 'tag' ? await crmCanonicalLabel(env, body.label) : '';
  // A tag with no label is nothing; a note with no text is nothing. Refused rather than stored,
  // because an empty row is invisible on screen and still counts in every total.
  if (kind === 'tag' && !label) return jsonResp({ error: 'A tag needs a label.' }, 400);
  if (kind === 'note' && !bodyText) return jsonResp({ error: 'A note needs some text.' }, 400);

  // ⭐ THE DATE THE THING HAPPENED, WHICH IS ERIC'S ASK AND IS NOT TODAY BY DEFINITION.
  // Accepted as a plain YYYY-MM-DD and stored as typed. ⛔ NOT parsed through Date(): the string
  // 2026-03-01 through new Date() is 2026-02-28 in a US timezone, which is how a compliance anchor
  // once moved a day nationwide. A date the user typed is stored as the date they typed.
  const today = new Date().toISOString().slice(0, 10);
  const wanted = String(body.happened_at || '').trim();
  if (wanted && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(wanted)) {
    return jsonResp({ error: 'happened_at must be YYYY-MM-DD.' }, 400);
  }
  const happenedAt = wanted || today;

  const by = String(body.by || '').trim().toLowerCase();
  if (by && CRM_REPS.indexOf(by) === -1) return jsonResp({ error: 'Unknown person.' }, 400);

  const list = Array.isArray(body.entities) ? body.entities.slice(0, 500) : [];
  if (!list.length) return jsonResp({ error: 'Nothing selected.' }, 400);

  const written = [], skipped = [], failed = [];
  const now = new Date().toISOString();

  for (const ent of list) {
    const type = String((ent && ent.type) || '').trim().toLowerCase();
    let id = String((ent && ent.id) || '').trim();
    if (type !== 'agency' && type !== 'person' && type !== 'rfp') {
      failed.push({ id: id || '(blank)', why: 'unknown entity type' });
      continue;
    }

    if (type === 'person') {
      const resolved = await crmResolvePerson(env, id);
      if (!resolved.id) { failed.push({ id: id || '(blank)', why: resolved.why }); continue; }
      id = resolved.id;
    }
    if (!id) { failed.push({ id: '(blank)', why: 'no id' }); continue; }

    if (!(await crmEntityExists(env, type, id))) {
      failed.push({ id, why: 'no such ' + type });
      continue;
    }

    // ⭐ THE SAME TAG TWICE ON THE SAME DAY IS A DOUBLE-CLICK, NOT A SECOND EVENT. Skipped rather
    // than refused, so a bulk apply re-run over an overlapping selection is safe and says what it
    // did. ⚠️ A tag applied on a DIFFERENT date is a real second event and is kept -- "invited to
    // webinar" in March and again in September is exactly the history this table is for.
    if (kind === 'tag') {
      const dupe = await env.DB.prepare(
        "SELECT id FROM crm_events WHERE kind = 'tag' AND entity_type = ? AND entity_id = ? " +
        'AND lower(trim(label)) = ? AND happened_at = ? LIMIT 1'
      ).bind(type, id, label.toLowerCase(), happenedAt).first();
      if (dupe) { skipped.push({ id, why: 'already tagged that day' }); continue; }
    }

    try {
      await env.DB.prepare(
        'INSERT INTO crm_events (id, entity_type, entity_id, kind, label, body, happened_at, created_at, created_by) ' +
        'VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(crypto.randomUUID(), type, id, kind, label || null, bodyText || null, happenedAt, now, by).run();
      written.push({ id });
    } catch (err) {
      failed.push({ id, why: String((err && err.message) || err) });
    }
  }

  return jsonResp({
    ok: true, kind, label: label || null, happened_at: happenedAt,
    written: written.length, skipped: skipped.length, failed: failed.length,
    detail: { written, skipped, failed },
  });
}

/**
 * Remove one event.
 *
 * ⚠️ A HARD DELETE, DELIBERATELY, AND ONLY HERE. A mistyped note is noise a person wants gone, and
 * this table holds no money, no compliance record and nothing anybody signed. ⛔ The rule that DOES
 * apply is the one this whole design rests on: a RECORDED status is never REWRITTEN. Deleting a
 * wrong entry and writing the right one is fine; silently updating one in place is not, because the
 * frozen value is the measurement.
 */
async function handleCrmDelete(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const id = String(body.id || '').trim();
  if (!id) return jsonResp({ error: 'Which one?' }, 400);
  const r = await env.DB.prepare('DELETE FROM crm_events WHERE id = ?').bind(id).run();
  // A DELETE that matches nothing resolves happily, and the screen would keep showing a row the
  // server never removed. Assert the change, the same way handleAdminAssign does.
  if (!r || !r.meta || !r.meta.changes) return jsonResp({ error: 'No such entry.' }, 404);
  return jsonResp({ ok: true });
}


// ── PEOPLE: the human behind the address, and moving between agencies (F-383) ──────────────────
//
// ⭐⭐ THE VIEW NAMES LIVE HERE, IN ONE PLACE, SO RENAMING ONE IS A SINGLE EDIT. Eric asked
// directly whether the name could be changed easily if a better one turned up. It can, as long as
// nothing else in the codebase spells it out. ⛔ Do not inline these strings into a page.
// The KEYS are the stored vocabulary and must not change; only the labels are cosmetic.
// ⭐⭐ METRO IS DERIVED FROM THE CITY, NEVER TYPED AND NEVER STORED. Eric asked for "metro area
// (closest big city)"; that is a function of the city, so storing it would be a second
// hand-maintained field answering an overlapping question -- and the two disagree the first time
// somebody fills in one and not the other.
// ⛔ AN UNKNOWN CITY RETURNS null AND THE SCREEN SHOWS THE CITY. It does not guess the nearest big
// name: a wrong metro is worse than none, because it silently drops the firm out of the right
// filter and into the wrong one.
// ⚠️ Texas only for now, which is the platform's stated coverage. Add a state's metros when that
// state is actually worked -- an empty map is honest, a half-guessed one is not.
const TX_METROS = {
  'dallas': 'DFW', 'fort worth': 'DFW', 'plano': 'DFW', 'irving': 'DFW', 'arlington': 'DFW',
  'frisco': 'DFW', 'mckinney': 'DFW', 'richardson': 'DFW', 'addison': 'DFW', 'grapevine': 'DFW',
  'denton': 'DFW', 'southlake': 'DFW', 'lewisville': 'DFW', 'garland': 'DFW', 'allen': 'DFW',
  'houston': 'Houston', 'sugar land': 'Houston', 'the woodlands': 'Houston', 'katy': 'Houston',
  'pearland': 'Houston', 'spring': 'Houston', 'pasadena': 'Houston',
  'austin': 'Austin', 'round rock': 'Austin', 'cedar park': 'Austin', 'georgetown': 'Austin',
  'san antonio': 'San Antonio', 'new braunfels': 'San Antonio',
  'el paso': 'El Paso', 'lubbock': 'Lubbock', 'amarillo': 'Amarillo', 'midland': 'Permian Basin',
  'odessa': 'Permian Basin', 'corpus christi': 'Corpus Christi', 'waco': 'Waco',
  'tyler': 'Tyler', 'abilene': 'Abilene', 'wichita falls': 'Wichita Falls',
  'college station': 'Bryan-College Station', 'bryan': 'Bryan-College Station',
  'beaumont': 'Beaumont-Port Arthur', 'port arthur': 'Beaumont-Port Arthur',
  'mcallen': 'Rio Grande Valley', 'brownsville': 'Rio Grande Valley', 'harlingen': 'Rio Grande Valley',
  'laredo': 'Laredo', 'killeen': 'Killeen-Temple', 'temple': 'Killeen-Temple',
  'san angelo': 'San Angelo', 'texarkana': 'Texarkana', 'longview': 'Longview',
};

function metroFor(city, state) {
  const s = String(state || '').trim().toUpperCase();
  const c = String(city || '').trim().toLowerCase();
  if (!c) return null;
  if (s !== 'TX' && s !== '') return null;
  return TX_METROS[c] || null;
}

const CRM_VIEWS = {
  performance: 'Performance',  // what the quote log says they have DONE. Hides never-quoted rows.
  marketing: 'Marketing',      // who we are working. Hides agencies that no longer exist.
};

/**
 * Backfill, run from /api/migrate alongside the schema.
 *
 * ⭐ IDEMPOTENT BY CONSTRUCTION, and that is not a nicety: /api/migrate is opened by hand more than
 * once, and a backfill that ran twice would give one human two person records -- the exact defect it
 * exists to prevent. Every step is guarded by "is it already set", never by "has this run before".
 *
 * ⛔ IT NEVER OVERWRITES A MERGE. Once somebody has said two addresses are one person, this must not
 * undo it, so a row with a person_id is skipped entirely.
 *
 * Three steps, in this order because each depends on the last:
 *   ① create the agency records that only an AGENT knows about. 24 of the 139 addresses name a firm
 *     with no agencies row -- all real names, already typed. Eric, 2026-08-23: "I would like to have
 *     agents under agencies but need to resolve the ones with no agency." They are flagged
 *     needs_review so they read as CREATED-TO-HANG-AN-AGENT rather than as a firm ABY has dealt with.
 *   ② resolve agency_id for every address, so "7 while at the prior agency" is a fact about the
 *     ADDRESS and survives the person moving.
 *   ③ give every unlinked address its own person. ⭐ ONE TO ONE IS THE HONEST STARTING STATE: we know
 *     of 139 addresses and have been told about no moves at all. Merging is the exception, and it is
 *     always a human act -- a name matcher cannot tell a MOVE from an ACQUISITION from an ALIAS, and
 *     live data has one of each.
 */
async function backfillPeople(env) {
  const out = { danglingRepaired: 0, agenciesCreated: 0, agenciesLinked: 0, agenciesConsolidated: 0,
                strayAgenciesRemoved: 0, peopleCreated: 0, alreadyLinked: 0,
                lostRace: 0, orphansRemoved: 0, people: 0, addresses: 0, errors: [] };
  const now = new Date().toISOString();
  try {
    // -- SWEEP FIRST, AND THIS IS WHAT MAKES THE WHOLE THING SELF-HEALING.
    //
    // 🔴🔴 IT EXISTS BECAUSE IT HAPPENED, ON LIVE DATA, 2026-08-23: /api/migrate was opened twice
    // within a minute while the first request was still running. Both read the same snapshot of
    // unlinked addresses, both created a person for each, and the second run's 139 lost every
    // UPDATE -- leaving 220 people for 139 addresses, 81 of them pointing at nothing.
    // ⭐⭐ THE BUG WAS NOT "NOT IDEMPOTENT". It was idempotent across SEQUENTIAL runs, and the local
    // test proved exactly that, because the test ran them one after another. Concurrency is a
    // different property and needs its own assertion.
    //
    // ⛔ ONLY A PERSON NOTHING POINTS AT *AND* WITH NO HISTORY IS REMOVED. A person carrying a note
    // or a tag is never deleted here even with no addresses -- that is the state a merge leaves
    // behind for a moment, and deleting it would throw away something somebody wrote.
    //
    // 🔴🔴 AND A THIRD CONDITION ARRIVED WITH THE EMAILLESS PERSON, 2026-08-24. Before that change
    // "no address points at this person" and "this person is an orphan" were the same statement.
    // They are not any more: a person we hold by NAME AND FIRM has no broker_directory row BY
    // DESIGN, and this sweep would have deleted every one of them on the next migration -- silently,
    // because a sweep reports a count and not the names. ⛔ 532 imported prospects, gone, and the
    // screen would simply have shown fewer rows than the file had.
    // ⭐ agency_id IS NOT NULL is what says "deliberately held", so it is the guard.
    const swept = await env.DB.prepare(
      'DELETE FROM people WHERE NOT EXISTS (SELECT 1 FROM broker_directory d WHERE d.person_id = people.id) ' +
      "AND NOT EXISTS (SELECT 1 FROM crm_events e WHERE e.entity_type = 'person' AND e.entity_id = people.id) " +
      'AND agency_id IS NULL'
    ).run();
    out.orphansRemoved = (swept && swept.meta && swept.meta.changes) || 0;

    // -- THE SAME RACE DUPLICATED AGENCIES, AND FIXING ONLY THE PEOPLE HALF WAS NOT ENOUGH.
    //
    // 🔴 MEASURED LIVE 2026-08-23: 33 agency records were created where 20 distinct firms needed one.
    // Two agents at the same firm each created their own row -- Assured Partners, Lifetime Insurance
    // Services and Neldal Insurance Agency all appeared twice -- and nine more were left pointing at
    // nothing. ⭐ The lesson is that a race fixed in one place is not a race fixed: EVERY find-or-create
    // in the same loop has it.
    //
    // ⛔ ONLY MACHINE-CREATED ROWS ARE TOUCHED (needs_review IS NOT NULL). A firm ABY has actually
    // dealt with is never consolidated or deleted by a backfill, whatever its name looks like.
    const dupes = await env.DB.prepare(
      'SELECT lower(trim(name)) AS key, MIN(id) AS keep FROM agencies ' +
      'WHERE needs_review IS NOT NULL GROUP BY lower(trim(name)) HAVING COUNT(*) > 1'
    ).all();
    for (const d of (dupes.results || [])) {
      // Point every address at the survivor, then the losers hold nothing and the sweep below takes
      // them. ⚠️ Addresses are repointed BEFORE anything is deleted, never after.
      await env.DB.prepare(
        'UPDATE broker_directory SET agency_id = ? WHERE agency_id IN ' +
        '(SELECT id FROM agencies WHERE needs_review IS NOT NULL AND lower(trim(name)) = ? AND id <> ?)'
      ).bind(d.keep, d.key, d.keep).run();
      out.agenciesConsolidated++;
    }

    // A machine-created agency that nothing points at, no quote names, and nobody has written a note
    // about. ⛔ All three conditions, because any one of them alone would delete something real.
    const sweptAgencies = await env.DB.prepare(
      // 🔴🔴 THE SAME ASSUMPTION WAS BAKED IN HERE TOO, AND THIS ONE WAS NOT OBVIOUS.
      // A firm whose only contacts are phone-only has NO broker_directory row pointing at it, so
      // this swept the agency out from under them -- leaving people.agency_id pointing at nothing
      // and the next import creating a second copy of the firm. ⭐ Found by the adoption test
      // failing, not by reading: the people sweep was fixed and this one sat one screen below it.
      // ⛔ ONE FIX APPLIED TO ONE COPY OF A PATTERN IS NOT APPLIED TO THE PATTERN (TRAPS #197).
      'DELETE FROM agencies WHERE needs_review IS NOT NULL ' +
      'AND NOT EXISTS (SELECT 1 FROM broker_directory d WHERE d.agency_id = agencies.id) ' +
      'AND NOT EXISTS (SELECT 1 FROM people p WHERE p.agency_id = agencies.id) ' +
      'AND NOT EXISTS (SELECT 1 FROM quotes q WHERE lower(trim(q.broker_agency)) = lower(trim(agencies.name))) ' +
      "AND NOT EXISTS (SELECT 1 FROM crm_events e WHERE e.entity_type = 'agency' AND e.entity_id = agencies.id)"
    ).run();
    out.strayAgenciesRemoved = (sweptAgencies && sweptAgencies.meta && sweptAgencies.meta.changes) || 0;
    const { results } = await env.DB.prepare(
      'SELECT email, name, agency, person_id, agency_id FROM broker_directory'
    ).all();
    const rows = results || [];

    for (const row of rows) {
      const email = String(row.email || '').trim().toLowerCase();
      if (!email) continue;

      // ① + ② the agency this address belonged to
      if (!row.agency_id) {
        const agencyName = String(row.agency || '').trim();
        if (agencyName) {
          let a = await env.DB.prepare('SELECT id FROM agencies WHERE lower(trim(name)) = ?')
            .bind(agencyName.toLowerCase()).first();
          if (!a) {
            const newId = crypto.randomUUID();
            await env.DB.prepare(
              'INSERT INTO agencies (id, name, share_quotes, created_at, needs_review) VALUES (?,?,?,?,?)'
            ).bind(newId, agencyName, 0, now,
                   'created 2026-08-23 to hang an agent on -- no quote has ever named this firm').run();
            // 🔴 RE-READ AND TAKE THE CANONICAL ROW. A concurrent run may have inserted the same firm
            // between the SELECT above and this INSERT, and both would then be real rows. MIN(id) is
            // an arbitrary but STABLE choice, so every racing run picks the same winner -- which is
            // the property that matters. The loser's row is dropped here rather than left for the
            // sweep, so a single run never leaves a stray behind.
            const canon = await env.DB.prepare(
              'SELECT MIN(id) AS id FROM agencies WHERE lower(trim(name)) = ?'
            ).bind(agencyName.toLowerCase()).first();
            const keep = (canon && canon.id) || newId;
            if (keep !== newId) {
              await env.DB.prepare(
                'DELETE FROM agencies WHERE id = ? AND needs_review IS NOT NULL'
              ).bind(newId).run();
            } else {
              out.agenciesCreated++;
            }
            a = { id: keep };
          }
          await env.DB.prepare('UPDATE broker_directory SET agency_id = ? WHERE lower(trim(email)) = ?')
            .bind(a.id, email).run();
          out.agenciesLinked++;
        }
      }

      // ③ the human
      // 🔴 A POINTER IS NOT A PERSON. Skipping on person_id alone leaves an address whose person
      // has gone permanently unrepaired, and the people/addresses counts never agree again --
      // which is exactly how this was found. A DANGLING pointer is treated as UNLINKED.
      if (row.person_id) {
        const target = await env.DB.prepare('SELECT id FROM people WHERE id = ?')
          .bind(row.person_id).first();
        if (target) { out.alreadyLinked++; continue; }
        out.danglingRepaired++;
        await env.DB.prepare(
          'UPDATE broker_directory SET person_id = NULL WHERE lower(trim(email)) = ?'
        ).bind(email).run();
      }
      const personId = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO people (id, name, created_at, updated_at) VALUES (?,?,?,?)')
        .bind(personId, String(row.name || '').trim(), now, now).run();
      // 🔴 THE CLAIM IS CONDITIONAL, AND THE ROW COUNT IS THE ANSWER. "AND person_id IS NULL" means
      // a run that overlaps another cannot take an address a concurrent run has already linked --
      // and changes === 0 is how it finds out it lost.
      const claim = await env.DB.prepare(
        'UPDATE broker_directory SET person_id = ? WHERE lower(trim(email)) = ? AND person_id IS NULL'
      ).bind(personId, email).run();
      if (!claim || !claim.meta || !claim.meta.changes) {
        // ⭐ LOST THE RACE, SO PUT BACK WHAT WE MADE. Leaving it is what produced 81 stray people.
        // ⚠️ Deleted rather than reused: the winner's row is already correct, and two people rows for
        // one address is the defect this whole table exists to prevent.
        await env.DB.prepare('DELETE FROM people WHERE id = ?').bind(personId).run();
        out.lostRace++;
        continue;
      }
      out.peopleCreated++;
    }
    // ⭐ REPORT THE TWO NUMBERS THAT MUST AGREE. A backfill that says "created 139" tells you what it
    // did; these say whether the result is RIGHT. They differ only when a person carries history but
    // no address, which is legitimate and rare.
    const pc = await env.DB.prepare('SELECT COUNT(*) AS n FROM people').first();
    const ac = await env.DB.prepare('SELECT COUNT(*) AS n FROM broker_directory').first();
    out.people = (pc && pc.n) || 0;
    out.addresses = (ac && ac.n) || 0;
  } catch (e) {
    // ⚠️ REPORTED, NEVER THROWN. This rides along with the schema migration and a failure here must
    // not make /api/migrate look as though the schema did not apply.
    out.errors.push(String((e && e.message) || e));
  }
  return out;
}

/**
 * One person: their addresses, and their quote history SPLIT BY THE AGENCY THEY WERE AT.
 *
 * ⭐⭐ THE SPLIT IS THE WHOLE POINT AND IT IS ERIC'S SENTENCE: "Just a note that they quoted 7 while
 * at the prior agency." A single total would be the wrong answer twice over -- it would credit the
 * new agency with work done at the old one, and it would hide the thing that makes the person worth
 * calling, which is that they have been quoting us for years across two firms.
 *
 * ⚠️ COUNTED FROM the quotes table BY EMAIL, which is the only link between a person and their work that
 * exists on every row ever saved. The quote rows are never touched by a merge, so this figure cannot
 * be changed by anything the CRM does -- which is the property Eric asked for.
 */
async function handleCrmPerson(request, env) {
  const u = new URL(request.url).searchParams;
  // A caller may hold either. An ADDRESS is resolved to the person; it is never the key.
  const resolved = await crmResolvePerson(env, u.get('id') || u.get('email') || '');
  if (!resolved.id) return jsonResp({ error: resolved.why }, 400);
  const id = resolved.id;
  try {
    const person = await env.DB.prepare('SELECT * FROM people WHERE id = ?').bind(id).first();
    if (!person) return jsonResp({ error: 'No such person.' }, 404);

    const { results } = await env.DB.prepare(
      'SELECT d.email, d.name, d.phone, d.agency AS agency_typed, d.agency_id, ' +
      '       d.first_seen, d.last_seen, d.assigned_rep, ' +
      '       a.name AS agency_name, ' +
      "       (SELECT COUNT(*) FROM quotes q WHERE lower(trim(q.broker_email)) = lower(trim(d.email)) " +
      "          AND trim(q.broker_email) <> '') AS quotes, " +
      '       (SELECT MAX(q.created_at) FROM quotes q WHERE lower(trim(q.broker_email)) = lower(trim(d.email))) AS last_quote ' +
      'FROM broker_directory d LEFT JOIN agencies a ON a.id = d.agency_id ' +
      'WHERE d.person_id = ? ORDER BY quotes DESC, d.email'
    ).bind(id).all();

    const addresses = results || [];
    const total = addresses.reduce((n, r) => n + (r.quotes || 0), 0);
    return jsonResp({
      person, addresses, totalQuotes: total,
      // ⭐ MORE THAN ONE ADDRESS WITH QUOTES AT DIFFERENT FIRMS IS THE "they moved" SIGNAL, and it is
      // computed rather than stored -- a stored flag would go stale the moment an address was added.
      movedBetweenAgencies: new Set(addresses.filter((r) => r.quotes > 0).map((r) => r.agency_id || r.agency_typed)).size > 1,
    });
  } catch (err) {
    return jsonResp({ error: String((err && err.message) || err) }, 500);
  }
}

/**
 * "This address belongs to that person" -- the whole merge, and the whole unmerge.
 *
 * ⭐⭐ IT MOVES ONE POINTER AND NOTHING ELSE. No quote is rewritten, no count is recomputed, and no
 * history moves agency. That is exactly what Eric asked for: the relationship follows the person,
 * the work stays with the firm where it was done.
 *
 * ⚠️ IT IS REVERSIBLE. Post person_id null and the address gets a fresh person of its own, which
 * is the state the backfill left everything in. ⛔ The one thing that does NOT come back is which
 * notes and tags belonged to which half -- see below, and that is a deliberate choice rather than an
 * oversight.
 */
async function handleCrmLinkPerson(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!email) return jsonResp({ error: 'Which address?' }, 400);

  const addr = await env.DB.prepare(
    'SELECT email, name, person_id FROM broker_directory WHERE lower(trim(email)) = ?'
  ).bind(email).first();
  if (!addr) return jsonResp({ error: 'No such address.' }, 404);

  const now = new Date().toISOString();
  const target = body.person_id === null || body.person_id === undefined || body.person_id === ''
    ? null : String(body.person_id).trim();

  // ── SPLIT: give this address a person of its own.
  if (target === null) {
    const fresh = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO people (id, name, created_at, updated_at) VALUES (?,?,?,?)')
      .bind(fresh, String(addr.name || '').trim(), now, now).run();
    await env.DB.prepare('UPDATE broker_directory SET person_id = ? WHERE lower(trim(email)) = ?')
      .bind(fresh, email).run();
    // ⚠️ THE EVENTS STAY WITH THE PERSON THEY WERE WRITTEN ON, and are NOT copied to the new one.
    // A note saying "spoke to Rebecca, she is moving" is about a human, and after a split there are
    // two humans; guessing which one it belongs to would put a real note on the wrong record.
    return jsonResp({ ok: true, action: 'split', person_id: fresh, note: 'notes and tags stayed with the existing person' });
  }

  const person = await env.DB.prepare('SELECT id FROM people WHERE id = ?').bind(target).first();
  if (!person) return jsonResp({ error: 'No such person.' }, 404);
  if (addr.person_id === target) return jsonResp({ ok: true, action: 'no change' });

  const losing = addr.person_id;
  await env.DB.prepare('UPDATE broker_directory SET person_id = ? WHERE lower(trim(email)) = ?')
    .bind(target, email).run();
  await env.DB.prepare('UPDATE people SET updated_at = ? WHERE id = ?').bind(now, target).run();

  // ── Did that leave a person with no addresses at all?
  // ⛔ AN ORPHANED PERSON IS NOT DELETED WHILE IT HOLDS HISTORY. Its notes and tags are moved to the
  // surviving person first -- they are about a HUMAN, and the whole premise of this merge is that the
  // two records were always the same human. ⚠️ Deleting first and asking later is how "we tagged them
  // in March" quietly stops being true.
  let eventsMoved = 0, personRemoved = false;
  if (losing && losing !== target) {
    const still = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM broker_directory WHERE person_id = ?'
    ).bind(losing).first();
    if (still && Number(still.n) === 0) {
      const moved = await env.DB.prepare(
        "UPDATE crm_events SET entity_id = ? WHERE entity_type = 'person' AND entity_id = ?"
      ).bind(target, losing).run();
      eventsMoved = (moved && moved.meta && moved.meta.changes) || 0;
      await env.DB.prepare('DELETE FROM people WHERE id = ?').bind(losing).run();
      personRemoved = true;
    }
  }
  return jsonResp({ ok: true, action: 'merged', person_id: target, eventsMoved, emptiedPersonRemoved: personRemoved });
}

/**
 * Pairs that MIGHT be one person: the same name at two addresses.
 *
 * 🔴🔴 SUGGESTIONS, NEVER MERGES, AND THE LIVE DATA IS THE ARGUMENT. All three pairs in the
 * directory today share a name and need three DIFFERENT answers:
 *   Rebecca Hearne       two agencies, one quote at each -- a real MOVE, and Eric's case.
 *   Abby Crain           one agency, two domains -- NOT a move: Patriot ACQUIRED Benefits Texas.
 *   Jacob Kellum-Hudman  .com and .net at one agency -- an ALIAS.
 * ⛔ Nothing in the data distinguishes them. An automatic merge would be right once and wrong twice,
 * and the two wrong ones would be invisible afterwards.
 */
async function handleCrmSuggestPeople(request, env) {
  try {
    const { results } = await env.DB.prepare(
      'SELECT lower(trim(d.name)) AS key, COUNT(DISTINCT d.person_id) AS people_count, ' +
      "       GROUP_CONCAT(d.email, ' | ') AS emails, GROUP_CONCAT(COALESCE(a.name, d.agency), ' | ') AS agencies " +
      'FROM broker_directory d LEFT JOIN agencies a ON a.id = d.agency_id ' +
      "WHERE trim(COALESCE(d.name,'')) <> '' " +
      'GROUP BY lower(trim(d.name)) HAVING people_count > 1 ORDER BY key'
    ).all();
    return jsonResp({ suggestions: results || [], note: 'Suggestions only. A name matcher cannot tell a move from an acquisition from an alias.' });
  } catch (err) {
    return jsonResp({ suggestions: [], error: String((err && err.message) || err) }, 500);
  }
}


/**
 * The MARKETING row set: every firm ABY could work, whether or not it has ever quoted.
 *
 * ⭐⭐ THE ROWS COME FROM THE AGENCY RECORDS AND THE QUOTE STATS ARE ATTACHED. That single change is
 * what the whole view rests on. Brokers & Agencies builds its rows FROM the quote log, so a firm
 * that has never quoted cannot appear on it at all -- which is exactly the firm you most want to
 * see when you are prospecting.
 *
 * 🔴 IT IS ALSO 40x CHEAPER, MEASURED AGAINST LIVE D1 ON 2026-08-23, and that was the argument that
 * settled one page versus two. ONE of the seven quote-log aggregates behind the Performance view
 * reads 4,026,085 rows in 2,210 ms to produce 639 rows. This reads 107,302 in 56 ms to produce 660.
 * ⚠️ The difference is not cleverness -- it is asking the smaller table first. The quote-side join is
 * on lower(trim(name)), which is unindexed, so driving it from 6,154 quotes multiplies by 672
 * agencies; driving it from one pre-grouped aggregate does not.
 *
 * ⛔ SUCCEEDED NAMES ARE EXCLUDED, AND THAT IS ERIC'S RULE, NOT A TIDY-UP. "We only market to MMA,
 * not MHBT... for working/prospecting/crm purposes we don't really need the MHBT notes." An acquired
 * name has nobody left to ring. ⚠️ A DIVISION is NOT excluded: HUB Fort Worth is alive and is a real
 * relationship with its own owner.
 *
 * ⚠️ TAGS ARE FETCHED IN ONE QUERY AND MERGED IN JS, not as a correlated subquery per row. Six
 * hundred subqueries to decorate six hundred rows is how a page that was fast becomes slow six
 * months later, without anybody changing the page.
 */
/**
 * THE RFP ANSWER LIBRARY -- read side.
 *
 * ⭐ THE COUNTS ARE COMPUTED OVER THE WHOLE TABLE, NOT OVER THE FILTERED ROWS, and that is
 * deliberate: this screen is a long job somebody comes back to, so "how much is left" has to mean
 * the same thing every visit. A progress figure that moves when you change a filter is not
 * progress, it is arithmetic about the filter.
 */
async function handleRfpLibrary(request, env) {
  const u = new URL(request.url).searchParams;
  const priority = (u.get('priority') || '').trim();
  const status = (u.get('status') || '').trim();
  const topic = (u.get('topic') || '').trim();
  const find = (u.get('q') || '').trim();

  const where = [], args = [];
  // ⭐ DEFAULTS TO PRIORITY 1 AND 2 -- Eric's own instruction: "send Niels the filter set to
  // priority 1 and 2 -- 61 questions, one sitting." Opening on all 367 is what makes somebody
  // close the tab. The 249 one-offs belong in the library and are not homework.
  if (priority === 'all') { /* no clause */ }
  else if (/^[1-4]$/.test(priority)) { where.push('priority = ?'); args.push(Number(priority)); }
  else { where.push('priority <= 2'); }

  if (status === 'open') where.push("COALESCE(status,'') = ''");
  else if (['draft', 'verified', 'na'].includes(status)) { where.push('status = ?'); args.push(status); }
  if (topic) { where.push('topic = ?'); args.push(topic); }
  if (find) {
    where.push('(lower(question) LIKE ? OR lower(COALESCE(answer,%27%27)) LIKE ? OR lower(COALESCE(also_asked,%27%27)) LIKE ?)'
      .replace(/%27%27/g, "''"));
    const like = '%' + find.toLowerCase() + '%';
    args.push(like, like, like);
  }

  try {
    const rows = await env.DB.prepare(
      'SELECT id, priority, topic, question, also_asked, asked_by, seed_answer, answer, status, ' +
      '       needs_doc, doc_note, has_dated_fact, review_by, owner, updated_at ' +
      'FROM rfp_answer ' + (where.length ? 'WHERE ' + where.join(' AND ') + ' ' : '') +
      'ORDER BY priority ASC, asked_by DESC, topic ASC, question ASC LIMIT 500'
    ).bind(...args).all();

    const tot = await env.DB.prepare(
      "SELECT COUNT(*) AS total, " +
      "       SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified, " +
      "       SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft, " +
      "       SUM(CASE WHEN status = 'na' THEN 1 ELSE 0 END) AS na, " +
      "       SUM(CASE WHEN needs_doc = 1 THEN 1 ELSE 0 END) AS docs, " +
      "       SUM(CASE WHEN priority <= 2 AND COALESCE(status,'') = '' THEN 1 ELSE 0 END) AS p12_open " +
      "FROM rfp_answer"
    ).first();

    const topics = await env.DB.prepare(
      "SELECT topic, COUNT(*) AS n FROM rfp_answer WHERE COALESCE(topic,'') <> '' " +
      "GROUP BY topic ORDER BY topic"
    ).all();

    return jsonResp({
      rows: rows.results || [],
      totals: tot || {},
      topics: (topics.results || []),
      // ⛔ SAID OUT LOUD RATHER THAN LEFT TO BE DISCOVERED. R2 is not enabled on the account, so a
      // question can record WHICH document answers it and cannot yet hold the bytes. A silent
      // half-feature is how somebody thinks a file was stored.
      uploads: false,
    });
  } catch (err) {
    // 🔴 AN ERROR IS NOT AN EMPTY LIBRARY. Before the migration runs this table does not exist,
    // and "no questions" would read as a finished job rather than a missing one.
    return jsonResp({ error: String(err && err.message || err) }, 500);
  }
}

/**
 * Save one field of one answer. Every write is a single question, so nothing can be lost by a
 * concurrent edit of a different one.
 *
 * ⭐ FIELDS ARE OPTIONAL AND ONLY WHAT IS SENT IS WRITTEN. The page autosaves a textarea on blur
 * and a checkbox on click; sending the whole row each time would let a stale copy of a field the
 * user never touched overwrite what somebody else just typed.
 */
async function handleRfpAnswerSave(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const id = String(body.id || '').trim();
  if (!id) return jsonResp({ error: 'Which question?' }, 400);

  const sets = [], args = [];
  if (body.answer != null) { sets.push('answer = ?'); args.push(String(body.answer).slice(0, 20000)); }
  if (body.status != null) {
    const st = String(body.status).trim();
    if (!['', 'draft', 'verified', 'na'].includes(st)) return jsonResp({ error: 'Unknown status.' }, 400);
    sets.push('status = ?'); args.push(st);
  }
  if (body.owner != null) {
    const ow = String(body.owner).trim().toLowerCase();
    // Same two-name vocabulary as everywhere else in this admin. '' means nobody in particular,
    // which is a real answer here -- most of these have not been looked at.
    if (ow && !['eric', 'niels'].includes(ow)) return jsonResp({ error: 'Unknown person.' }, 400);
    sets.push('owner = ?'); args.push(ow);
  }
  if (body.needsDoc != null) { sets.push('needs_doc = ?'); args.push(body.needsDoc ? 1 : 0); }
  if (body.docNote != null) { sets.push('doc_note = ?'); args.push(String(body.docNote).slice(0, 1000)); }
  if (body.hasDatedFact != null) { sets.push('has_dated_fact = ?'); args.push(body.hasDatedFact ? 1 : 0); }
  if (body.reviewBy != null) { sets.push('review_by = ?'); args.push(String(body.reviewBy).slice(0, 40)); }
  if (!sets.length) return jsonResp({ error: 'Nothing to save.' }, 400);

  sets.push('updated_at = ?'); args.push(new Date().toISOString());
  args.push(id);

  try {
    const res = await env.DB.prepare('UPDATE rfp_answer SET ' + sets.join(', ') + ' WHERE id = ?')
      .bind(...args).run();
    // ⛔ A WRITE THAT MATCHED NOTHING IS A FAILURE, NOT A SUCCESS. Without this the page would show
    // "saved" for a question id that does not exist, which is the worst possible lie on a screen
    // whose entire job is capturing work somebody is doing by hand.
    if (!res.meta || res.meta.changes === 0) return jsonResp({ error: 'That question no longer exists.' }, 404);
    // Read back what was stored, so the screen reflects the DATABASE and not what it hoped it sent.
    const back = await env.DB.prepare(
      'SELECT id, answer, status, needs_doc, doc_note, has_dated_fact, review_by, owner, updated_at ' +
      'FROM rfp_answer WHERE id = ?').bind(id).first();
    return jsonResp({ ok: true, row: back });
  } catch (err) {
    return jsonResp({ error: String(err && err.message || err) }, 500);
  }
}

async function handleCrmAgencies(request, env) {
  const u = new URL(request.url).searchParams;
  const rep = (u.get('rep') || '').trim().toLowerCase();
  const priority = (u.get('priority') || '').trim().toUpperCase();
  const state = (u.get('state') || '').trim().toUpperCase();
  const tag = (u.get('tag') || '').trim();
  const quoted = (u.get('quoted') || '').trim();

  // 🔴🔴 TWO EXCLUSIONS, AND THE SECOND ONE IS WHY ERIC SAW "MMA; MHBT" ON A LIST THAT IS
  // MEANT TO HIDE ACQUIRED FIRMS. MHBT itself IS marked succeeded and IS hidden -- correctly. But
  // "MMA; MHBT" is a SEPARATE agency record whose NAME is two firms, created out of quote rows
  // where somebody typed both names during the transition. It carries no relationship at all, so
  // the acquired rule could never touch it. Measured 2026-08-24: 47 such rows, every one unmarked,
  // every one on this list.
  // ⛔ NOBODY CAN CALL "MMA; MHBT". A compound name is a QUOTE-LOG ARTEFACT, not a firm, and it
  // does not need Eric to adjudicate which survivor it belongs to before it comes off a
  // PROSPECTING list. Which firm owns those quotes is a real question and it lives on the analysis
  // view; this view only has to stop offering a name nobody answers to.
  // ⚠️ HIDDEN, NEVER DELETED, and counted out loud below -- the quote history hanging off those
  // names is real and the analysis view still needs it.
  // \u26d4 THREE THINGS ARE NOT CALLABLE FIRMS: an acquired name, a spelling variant of another
  // firm, and a row whose NAME is two firms at once. All three are hidden and all three are
  // counted out loud, because a list that quietly drops rows cannot be told from one that lost them.
  // ── WHO IS ON THE MARKETING LIST ────────────────────────────────────────────────────────
  //
  // ?disposition=  (blank)   the working list: nobody who has been dispositioned
  //              = <value>   just that reason, so "show me everyone who told us no" is one click
  //              = any       everything that has been dispositioned, whatever the reason
  //              = all       genuinely everything -- EXCEPT the suppressed, see below
  //
  // 🔴 `do_not_contact` IS NEVER IN A RESULT, AND `all` DOES NOT MEAN ALL. Every other value here
  // is a filter -- a view over rows that all exist. That one is an instruction from the person,
  // and a filter you can widen until it reappears is not a suppression, it is a default. Eric
  // asked for "unsubscribed (do not contact)" in the same breath as the others; it is stored the
  // same way and enforced differently, on purpose.
  // ⭐ The FIRM PANEL still shows it -- that is how somebody sees the record and why. What this
  // rule governs is the LIST you work from.
  const disposition = (u.get('disposition') || '').trim().toLowerCase();
  const where = ["COALESCE(a.relationship,'') NOT IN ('succeeded','alias')", "a.name NOT LIKE '%;%'",
                 "COALESCE(a.disposition,'') NOT IN ('" + SUPPRESSED.join("','") + "')"];
  if (disposition === 'all') { /* everything that is not suppressed */ }
  else if (disposition === 'any') where.push("COALESCE(a.disposition,'') <> ''");
  else if (DISPOSITIONS.includes(disposition)) { where.push("COALESCE(a.disposition,'') = ?"); args.push(disposition); }
  else where.push("COALESCE(a.disposition,'') = ''");
  const args = [];
  if (rep) { where.push("lower(COALESCE(a.assigned_rep,'')) = ?"); args.push(rep); }
  if (priority) { where.push("COALESCE(a.priority,'') = ?"); args.push(priority); }
  if (state) { where.push("upper(COALESCE(a.state,'')) = ?"); args.push(state); }

  const sql =
    // One pass over the quote log, grouped. Everything else joins to THIS.
    "WITH q AS (SELECT lower(trim(broker_agency)) k, COUNT(*) quotes, MAX(created_at) last_quote " +
    "           FROM quotes WHERE trim(COALESCE(broker_agency,'')) <> '' GROUP BY 1), " +
    // ⭐⭐ SALES, ASKED FOR BY ERIC 2026-08-24: "I noticed it doesn't show sales on that page, just
    // quotes and agent count." He is right and it was a real gap -- quotes without sales says who
    // asks, never who buys, and this is the page you decide who to call from.
    // ⛔ A GROUPED CTE, NOT 658 CORRELATED SUBQUERIES. The whole point of this page is that it stays
    // fast; a per-row subquery is exactly how it would stop being (the fault fixed earlier today).
    // ⚠️ Counted by the firm's OWN name, identically to the Quotes beside it, so the two columns can
    // never disagree about which firm they are describing. That means an acquired name's sales do
    // NOT roll up to the survivor here -- the analysis view is where families roll up, and this
    // list deliberately hides dead names anyway.
    "     s AS (SELECT lower(trim(agency)) k, COUNT(*) sales FROM aby_sales " +
    "           WHERE trim(COALESCE(agency,'')) <> '' GROUP BY 1) " +
    'SELECT a.id, a.name, a.city, a.state, a.priority, a.assigned_rep, a.needs_review, ' +
    '       a.disposition, a.disposition_note, a.disposition_at, a.website, ' +
    '       a.relationship, a.parent_id, a.relationship_note, pa.name AS parent_name, ' +
    // Carried so the firm panel can show that a name is settled, and the row can say so too.
    '       a.name_confirmed_at, ' +
    // ── A PARENT TOTALS ITS BRANCHES (Eric, 2026-08-26) ──────────────────────────────────
    //
    // "Why on Patriot Growth Insurance Services does it not show the total of the branches below
    // it? It shows never quoted, but shouldn't the main company total everything below it
    // (without double counting in the total)?"
    //
    // He is right, and it read worse than wrong: Patriot Growth showed NEVER QUOTED while its two
    // divisions between them hold 350 quotes -- 332 on Benefits Texas and 18 on JME. The join
    // matches a quote to an agency BY NAME, and no quote has ever carried the parent's name,
    // so the parent could only ever have counted zero.
    //
    // ⭐ THE ANALYSIS VIEW ALREADY DID THIS AND THIS ONE DID NOT. It groups on
    // COALESCE(pa.name, <the quote's own agency>), one hop, so a division's quotes land under its
    // parent. Two views of one book disagreeing about who owns a quote is worse than either
    // answer, so this follows the SAME rule rather than inventing a second.
    //
    // ⛔ ONE HOP, exactly like the analysis join, and for the same reason: the seeding script
    // asserts no parent is itself a child, so a chain cannot form and this cannot truncate one.
    //
    // ⚠️ NO DOUBLE COUNTING, WHICH IS THE HALF ERIC NAMED. A branch still shows its OWN number and
    // the parent shows the total -- and the branches render INDENTED UNDER the parent, so the
    // relationship is on screen rather than implied. `own_quotes` is returned beside the rollup so
    // a row can say both without either being recomputed in the page.
    // ── THE ROLLUP WALKS THE WHOLE TREE, NOT ONE HOP ───────────────────────────────────────
    //
    // 🔴 IT WAS ONE HOP UNTIL 2026-08-26, AND THE STRUCTURE ERIC ASKED FOR THAT EVENING BREAKS
    // THAT ASSUMPTION. His shape is three levels deep on purpose: a holding company (MMA), the
    // office that actually quotes (MMA - DFW), and the firms bought and folded INTO that office
    // (MHBT). With a single hop, MHBT's 185 quotes stop at MMA - DFW and never reach MMA -- so
    // the parent would under-report by exactly the acquisitions, which are the quotes somebody
    // most wants credited.
    //
    // ⚠️ THE OLD COMMENT SAID A CHAIN COULD NOT FORM, and it was true when written: "the seeding
    // script asserts no parent is itself a child". That assertion is what Eric's instruction
    // retires, and a rule that is enforced by a script somewhere else is not a rule this query
    // can lean on. So the query stops assuming.
    //
    // ⛔ THE `depth < 6` GUARD IS NOT DECORATION. A cycle -- A parent of B, B parent of A -- would
    // otherwise spin here forever, and nothing in the schema prevents somebody creating one from
    // the firm panel. Six is far deeper than any real ownership chain and terminates regardless.
    '       COALESCE(q.quotes, 0) AS own_quotes, ' +
    '       COALESCE(q.quotes, 0) + COALESCE((' +
    '         WITH RECURSIVE kin(id) AS (' +
    '           SELECT id FROM agencies WHERE parent_id = a.id' +
    '           UNION' +
    '           SELECT c.id FROM agencies c JOIN kin ON c.parent_id = kin.id' +
    '         ) SELECT SUM(cq.quotes) FROM kin JOIN agencies k ON k.id = kin.id' +
    '           JOIN q cq ON cq.k = lower(trim(k.name))), 0) AS quotes, ' +
    '       q.last_quote, ' +
    '       COALESCE(s.sales, 0) AS own_sales, ' +
    '       COALESCE(s.sales, 0) + COALESCE((' +
    '         WITH RECURSIVE kin2(id) AS (' +
    '           SELECT id FROM agencies WHERE parent_id = a.id' +
    '           UNION' +
    '           SELECT c.id FROM agencies c JOIN kin2 ON c.parent_id = kin2.id' +
    '         ) SELECT SUM(cs.sales) FROM kin2 JOIN agencies k2 ON k2.id = kin2.id' +
    '           JOIN s cs ON cs.k = lower(trim(k2.name))), 0) AS sales, ' +
    // ⭐ BOTH KINDS OF PERSON ARE COUNTED. Somebody held by name and firm has no broker_directory
    // row by design, so counting only that table would have reported "0 agents" for a firm whose
    // whole team we had just imported -- the count quietly meaning "agents with an email".
    '       ((SELECT COUNT(*) FROM broker_directory d WHERE d.agency_id = a.id) + ' +
    '        (SELECT COUNT(*) FROM people p WHERE p.agency_id = a.id ' +
    '           AND NOT EXISTS (SELECT 1 FROM broker_directory d2 WHERE d2.person_id = p.id))) AS agents, ' +
    "       (SELECT COUNT(*) FROM crm_events e WHERE e.entity_type = 'agency' AND e.entity_id = a.id " +
    "          AND e.kind = 'note') AS notes, " +
    "       (SELECT MAX(e.happened_at) FROM crm_events e WHERE e.entity_type = 'agency' " +
    '          AND e.entity_id = a.id) AS last_contact ' +
    'FROM agencies a ' +
    'LEFT JOIN agencies pa ON pa.id = a.parent_id ' +
    'LEFT JOIN q ON q.k = lower(trim(a.name)) ' +
    'LEFT JOIN s ON s.k = lower(trim(a.name)) ' +
    // ── A CAP IS A PROMISE ABOUT THE SIZE OF THE DATA, AND THE CE IMPORT BROKE IT ─────────────
    //
    // This read LIMIT 2000 and was invisible while the register held 1,564 firms. The CE load took
    // it to 2,365 in one evening, so the list silently stopped at 2,000 and 365 firms were in the
    // table and on no screen -- with the count beside it reading "2000 of 2000 firms", which is
    // the worst part: a truncated figure presented as a total is quotable.
    //
    // ⛔ THE NUMBER IS NOT THE FIX. Raising it buys time and nothing else, so the response now
    // carries `capped` and the page SAYS SO. A list that quietly drops rows is indistinguishable
    // from one that has lost them.
    'WHERE ' + where.join(' AND ') + ' ORDER BY a.name LIMIT ' + (AGENCY_LIST_CAP + 1);

  try {
    const r = await env.DB.prepare(sql).bind(...args).all();
    let rows = r.results || [];
    // One row over the cap means there are more; report it rather than trimming in silence.
    const capped = rows.length > AGENCY_LIST_CAP;
    if (capped) rows = rows.slice(0, AGENCY_LIST_CAP);

    // Every tag on every agency, once.
    const te = await env.DB.prepare(
      "SELECT entity_id, label, happened_at FROM crm_events WHERE entity_type = 'agency' " +
      "AND kind = 'tag' AND trim(COALESCE(label,'')) <> '' ORDER BY happened_at DESC"
    ).all();
    const byId = {};
    for (const e of (te.results || [])) {
      (byId[e.entity_id] = byId[e.entity_id] || []).push({ label: e.label, at: e.happened_at });
    }
    for (const row of rows) {

      // ⭐ DERIVED ON READ, NEVER STORED. A stored metro would be a second hand-kept field beside the
      // city, and the two disagree the first time somebody fills in one and not the other.
      row.metro = metroFor(row.city, row.state);
      // ⭐⭐ BOTH STATUSES, TOGETHER. Eric: 'we tagged this originally as one quote ever and now
      // they have done six, something is working.' That question needs the FROZEN value beside
      // the LIVE one, computed from the same numbers, on the same row.
      row.derivedStatus = deriveStatus(row.quotes, row.last_quote);
      const rec = (byId[row.id] || [])
        .filter((x) => String(x.label || '').toLowerCase().indexOf(RECORDED_PREFIX) === 0)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))[0];
      // ⚠️ THE MOST RECENT RECORDING, and its DATE. Without the date the comparison is
      // meaningless -- 'they were quoted-once' only means something alongside when that was.
      row.recordedStatus = rec ? String(rec.label).slice(RECORDED_PREFIX.length) : null;
      row.recordedAt = rec ? rec.at : null;
      // A recorded status is a tag, so it would otherwise appear twice on the row: once as
      // itself and once in the tag list. It is shown in its own column instead.
      row.tags = (byId[row.id] || [])
        .filter((x) => String(x.label || '').toLowerCase().indexOf(RECORDED_PREFIX) !== 0);
    }

    // ⚠️ THE TAG FILTER RUNS HERE, NOT IN SQL, AND ONLY BECAUSE THE TAGS ARE ALREADY IN HAND.
    // ⛔ It matches on the EXACT label, case-insensitively -- never a substring. A substring filter
    // is the failure this whole design exists to avoid: it silently includes "sent quoting tool
    // email v2" and silently excludes nothing, so the count looks plausible and is wrong.
    if (tag) {
      const want = tag.toLowerCase();
      rows = rows.filter((x) => x.tags.some((t) => String(t.label).trim().toLowerCase() === want));
    }
    // "Never quoted" is the prospecting list; "has quoted" is the relationship list.
    if (quoted === 'no') rows = rows.filter((x) => !x.quotes);
    if (quoted === 'yes') rows = rows.filter((x) => x.quotes > 0);

    return jsonResp({
      agencies: rows,
      matched: rows.length,
      // ⭐ REPORTED SO THE SCREEN CAN SAY WHAT IT IS HIDING. A filtered page that does not say it is
      // filtered is the same defect as an empty page that says everything is done.
      capped: capped,
      cap: AGENCY_LIST_CAP,
      excludedAcquired: await countAcquired(env),
      excludedCompound: await countCompound(env),
      // ⭐ THE ALIASES WERE HIDDEN AND UNCOUNTED. The page said it was hiding the acquired names
      // and the compound ones -- 52 rows -- while actually hiding 152, because 99 aliases went
      // unmentioned. Eric spotted the arithmetic not adding up ("1,412 at the top, 1,341 at the
      // bottom") and it took a measurement to explain a screen that should have explained itself.
      excludedAlias: await countAliases(env),
    });
  } catch (err) {
    // 🔴 A THROWN QUERY MUST NOT RENDER AS "no agencies". The error reaches the screen.
    return jsonResp({ agencies: [], error: String((err && err.message) || err) }, 500);
  }
}

// ⛔ A LIST THAT QUIETLY DROPS ROWS IS INDISTINGUISHABLE FROM ONE THAT LOST THEM. Both numbers
// are printed, so the reader knows the list is shorter than the table on purpose.
async function countAliases(env) {
  try {
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM agencies WHERE COALESCE(relationship,'') = 'alias'"
    ).first();
    return (r && r.n) || 0;
  } catch { return 0; }
}

async function countCompound(env) {
  try {
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM agencies WHERE name LIKE '%;%' AND COALESCE(relationship,'') <> 'succeeded'"
    ).first();
    return (r && r.n) || 0;
  } catch { return null; }
}

async function countAcquired(env) {
  try {
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM agencies WHERE COALESCE(relationship,'') = 'succeeded'"
    ).first();
    return (r && r.n) || 0;
  } catch { return null; }
}

/**
 * Record what happened to a firm: acquired by somebody, or a branch of them.
 *
 * ⭐⭐ THIS IS THE CONTROL THAT MAKES THE MAP FILLABLE. Of 672 agencies only 12 are recorded as
 * acquired and 9 as branches, and 47 rows have two firm names typed into one box. Only Eric and
 * Niels know these facts -- no query will ever work them out -- so the job is to make recording one
 * a click from the row you are already looking at, rather than a research project nobody starts.
 *
 * 🔴 THE TWO RELATIONSHIPS BEHAVE IN OPPOSITE WAYS AND MUST NOT BE COLLAPSED:
 *   succeeded  the name is DEAD. It rolls up for analysis and NEVER appears on a marketing list.
 *   division   the office is ALIVE. It rolls up AND stays on the marketing list on its own merits.
 *
 * ⛔ NO QUOTE IS EVER REWRITTEN. A 2013 quote really was MHBT, and relabelling it MMA would put MMA
 * in the log four years before it appears there at all. This is a display-time parent.
 */
async function handleCrmRelationship(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const id = String(body.id || '').trim();
  const parentId = String(body.parent_id || '').trim();
  const rel = String(body.relationship || '').trim().toLowerCase();
  const note = String(body.note || '').trim().slice(0, 400);
  if (!id) return jsonResp({ error: 'Which agency?' }, 400);

  const me = await env.DB.prepare('SELECT id, name FROM agencies WHERE id = ?').bind(id).first();
  if (!me) return jsonResp({ error: 'No such agency.' }, 404);

  // 🔴🔴 A CHAIN IS SILENT AND THE ROLLUP TRUNCATES IT. The rollup joins the parent with a
  // SINGLE join, so A -> B -> C loses A entirely. Eric built two chains within minutes of the
  // tidy-up screen shipping, just by resolving groups in the order they appeared: he aliased
  // Rogers to Rogers Benefit Group, then Rogers Benefit Group to Emerson Rogers.
  // ⛔ THE UI CANNOT PREVENT THIS -- the second click is legitimate on its own and the chain only
  // exists afterwards. So the rule lives here: a parent that is itself a child is climbed past.
  let realParent = parentId;
  if (realParent) {
    for (let hop = 0; hop < 5; hop++) {
      const up = await env.DB.prepare('SELECT parent_id FROM agencies WHERE id = ?').bind(realParent).first();
      if (!up || !up.parent_id) break;
      realParent = up.parent_id;
    }
    // ⚠️ AND ANY CHILDREN THIS ROW ALREADY HAS COME WITH IT, or they are orphaned onto a row
    // that is about to disappear from the list.
    await env.DB.prepare('UPDATE agencies SET parent_id = ? WHERE parent_id = ?')
      .bind(realParent, id).run();
  }

  // Clearing it is a real action: somebody recorded a relationship and was wrong.
  if (!rel) {
    await env.DB.prepare(
      'UPDATE agencies SET parent_id = NULL, relationship = NULL, relationship_note = ? WHERE id = ?'
    ).bind(note || null, id).run();
    return jsonResp({ ok: true, cleared: true });
  }
  // \u2b50\u2b50 A THIRD VALUE, AND IT IS NOT A KIND OF ACQUISITION. 'alias' means SAME FIRM, SPELLED
  // DIFFERENTLY -- Polaris / Polaris Benefits / Polaris Benefits, LLC. Measured 2026-08-24: 57 such
  // clusters covering 127 of 672 rows, and with the 47 compound names that is a QUARTER of the list
  // that is not a firm anybody can call.
  // \u26d4 IT MUST NOT BE RECORDED AS 'succeeded'. Acquired is a real commercial event with a date
  // and a survivor, and the analysis view reads it as one. A spelling variant is a data-entry
  // artefact. Collapsing the two would put a fake acquisition into the only record ABY has of real
  // ones -- and Eric is the only person who knows which firms were genuinely bought.
  // \u2b50 It behaves like 'succeeded' on the CALL LIST (hidden -- nobody dials a misspelling) and
  // like a child in the ROLLUP (its quotes belong to the survivor). Same handling, different fact.
  if (rel !== 'succeeded' && rel !== 'division' && rel !== 'alias') {
    return jsonResp({ error: 'A relationship is succeeded, division or alias.' }, 400);
  }
  if (!parentId) return jsonResp({ error: 'Which firm is the parent?' }, 400);
  if (parentId === id) return jsonResp({ error: 'A firm cannot be its own parent.' }, 400);

  const parent = await env.DB.prepare('SELECT id, parent_id FROM agencies WHERE id = ?').bind(parentId).first();
  if (!parent) return jsonResp({ error: 'No such parent agency.' }, 404);

  // 🔴 ONE HOP ONLY, AND THE RULE IS ENFORCED HERE RATHER THAN ASSUMED. The rollup on Brokers &
  // Agencies joins the parent with a SINGLE join; a grandparent chain would silently truncate, so a
  // child would roll up to the wrong firm and the totals would be quietly wrong rather than absent.
  if (parent.parent_id) {
    return jsonResp({
      error: 'That firm is itself under another. Point this one at the top of the family instead.',
    }, 400);
  }
  const kids = await env.DB.prepare('SELECT COUNT(*) AS n FROM agencies WHERE parent_id = ?').bind(id).first();
  if (kids && kids.n) {
    return jsonResp({
      error: 'Other firms are already under this one. Move them first, or this would make a chain.',
    }, 400);
  }

  await env.DB.prepare(
    'UPDATE agencies SET parent_id = ?, relationship = ?, relationship_note = ? WHERE id = ?'
  ).bind(realParent, rel, note || null, id).run();

  // ⭐⭐ AND THE QUOTES AND SALES ARE CORRECTED IN THE SAME CLICK.
  //
  // ERIC, 2026-08-24: "I'd rather you change the name of the firm and add to the note that the
  // quote itself was saved with a different firm name (and say the misspelling or the way it was
  // written)." He asked first whether the logs were being updated at all -- they were not. The
  // lists followed the alias link at READ time, which works only where somebody remembered to
  // follow it, and twice they had not.
  //
  // ⛔ THE OBVIOUS OBJECTION IS ANSWERED BY HIS OWN DESIGN. Overwriting the typed name would
  // normally destroy the evidence that tells a typo from a rename -- so the original spelling is
  // written into the quote's own note, in words, where somebody reading that quote can see it.
  // Nothing is lost and nothing has to be inferred later.
  //
  // ⚠️ ONLY FOR AN ALIAS. A division still trades under its own name and a quote it wrote was
  // correctly attributed; renaming those would be rewriting history rather than correcting a typo.
  // An acquisition is a real event and its old quotes belong to the old name.
  if (rel === 'alias' && realParent) {
    const survivor = await env.DB.prepare('SELECT name FROM agencies WHERE id = ?')
      .bind(realParent).first();
    const to = (survivor && survivor.name) || '';
    const from = String(me.name || '').trim();
    if (to && from && to.toLowerCase() !== from.toLowerCase()) {
      const stamp = new Date().toISOString().slice(0, 10);
      for (const t of [['quotes', 'broker_agency', 'notes', 'quote'],
                       ['aby_sales', 'agency', 'note', 'sale']]) {
        try {
          // Every SET expression reads the OLD row, so the previous name can be quoted into the
          // note while the column holding it is being replaced.
          await env.DB.prepare(
            'UPDATE ' + t[0] + ' SET ' + t[2] + " = TRIM(COALESCE(" + t[2] + ",'') " +
            " || CASE WHEN TRIM(COALESCE(" + t[2] + ",'')) = '' THEN '' ELSE '  ' END " +
            " || 'Agency name corrected to \"' || ? || '\" on ' || ? || '. This " + t[3] +
            " was saved as \"' || trim(" + t[1] + ") || '\".'), " +
            t[1] + ' = ?, agency_id = ? WHERE lower(trim(' + t[1] + ')) = ?'
          ).bind(to, stamp, to, realParent, from.toLowerCase()).run();
        } catch (err) {
          // Reported, never thrown: the relationship is already saved, and half a save that looks
          // like a failure is worse than a warning nobody sees on a good day.
          console.warn('could not correct ' + t[0] + ':', String((err && err.message) || err));
        }
      }
    }
  }
  return jsonResp({ ok: true, relationship: rel });
}

/** Set the priority, the owner, or the location on one firm. */
/**
 * Correct a firm's name, and make that correction STICK.
 *
 * ERIC, 2026-08-24, after being ignored a dozen times: "Why do you have that page for me to tidy up
 * if you are going to ignore the answers." The honest answer was that the page could not take this
 * kind of answer at all -- a firm could be tagged, noted, aliased and marked acquired, but its NAME
 * could only be changed by a session running SQL. So every correction he gave lived in a chat
 * window and was gone by the next session, while the wrong spelling stayed in the database.
 *
 * TWO THINGS HAPPEN HERE AND THE SECOND IS THE POINT:
 *   1. the firm is renamed, and every quote and sale it holds is corrected with it -- his standing
 *      rule, with the old spelling written into each row's own note so nothing is lost
 *   2. the name is STAMPED AS CONFIRMED, and the duplicate finder is required to leave it alone
 *      from then on. A suggestion engine that re-proposes something you have already answered is
 *      the whole complaint.
 *
 * CONFIRMING WITHOUT RENAMING IS ALLOWED, because "this name is already right, stop asking" is just
 * as much an answer as "call it this instead".
 *
 * ⛔ A SEMICOLON IS REFUSED. That character is what the 2009-2023 import used to join two agency
 * names it could not choose between, and every screen treats a name containing one as an artefact
 * rather than a firm. Letting one be typed in by hand would manufacture the exact thing this
 * cleanup exists to remove.
 */
async function handleCrmRename(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const id = String(body.id || '').trim();
  if (!id) return jsonResp({ error: 'Which agency?' }, 400);

  const raw = String(body.name == null ? '' : body.name).trim();
  const confirm = body.confirm !== false;

  const me = await env.DB.prepare('SELECT id, name FROM agencies WHERE id = ?').bind(id).first();
  if (!me) return jsonResp({ error: 'No such agency.' }, 404);

  const now = new Date().toISOString().slice(0, 10);
  let renamed = false, quotes = 0, sales = 0;

  if (raw && raw !== me.name) {
    if (raw.length > 120) return jsonResp({ error: 'That name is too long.' }, 400);
    if (raw.indexOf(';') !== -1) {
      return jsonResp({ error: 'A name cannot contain a semicolon -- that is how the old import '
                              + 'joined two firms it could not tell apart.' }, 400);
    }
    // ⚠️ ANOTHER FIRM ALREADY HOLDING THIS NAME IS A MERGE, NOT A RENAME, and merging is the
    // relationship control's job -- it decides whether the other row is an alias, a branch or dead.
    // Quietly creating a second firm with the same name would put the list back where it started.
    const clash = await env.DB.prepare(
      'SELECT id FROM agencies WHERE lower(trim(name)) = ? AND id <> ?'
    ).bind(raw.toLowerCase(), id).first();
    if (clash) {
      return jsonResp({ error: 'Another firm is already called that. Use "What happened to this '
                              + 'firm?" to roll one into the other.' }, 409);
    }

    const note = 'Agency name corrected to "' + raw + '" on ' + now
               + ' -- Eric confirmed the spelling. This row was saved as "';
    for (const t of [['quotes', 'broker_agency', 'notes'], ['aby_sales', 'agency', 'note']]) {
      try {
        const r = await env.DB.prepare(
          'UPDATE ' + t[0] + ' SET ' + t[2] + " = TRIM(COALESCE(" + t[2] + ",'') "
          + " || CASE WHEN TRIM(COALESCE(" + t[2] + ",'')) = '' THEN '' ELSE '  ' END "
          + ' || ? || trim(' + t[1] + ") || '\".'), "
          + t[1] + ' = ?, agency_id = ? WHERE lower(trim(' + t[1] + ')) = ?'
        ).bind(note, raw, id, String(me.name || '').trim().toLowerCase()).run();
        const n = (r && r.meta && r.meta.changes) || 0;
        if (t[0] === 'quotes') quotes = n; else sales = n;
      } catch (err) {
        // Reported, never thrown: the rename itself is what he asked for, and a half-done job that
        // looks like a failure is worse than one that says which half worked.
        console.warn('could not correct ' + t[0] + ':', String((err && err.message) || err));
      }
    }
    await env.DB.prepare('UPDATE agencies SET name = ? WHERE id = ?').bind(raw, id).run();
    renamed = true;

    // 🔴 RENAMING CLEARS "check the name", BECAUSE RENAMING IS THE CHECK.
    // Eric, 2026-08-26: "Once I fix a name like Group Health OK, why does it still say check the
    // name?" Because nothing cleared it -- the flag was set by an import and only an import knew
    // it existed.
    // ⭐⭐ THE FLAG SAYS WHAT TO DO, SO DOING IT MUST TURN IT OFF. A task that stays lit
    // after it is finished is worse than no task: the badge stops meaning "look at this" and
    // starts meaning "this row came from an import", which is what  already says.
    // ⛔ ONLY THAT ONE MESSAGE. A firm flagged for some other reason -- a miscategorised
    // domain, say -- keeps its flag, because a new name does not answer a question about what the
    // firm SELLS.
    await env.DB.prepare(
      "UPDATE agencies SET needs_review = NULL WHERE id = ? AND needs_review LIKE '%DERIVED%'"
    ).bind(id).run();
  }

  await env.DB.prepare(
    'UPDATE agencies SET name_confirmed_at = ?, name_confirmed_by = ? WHERE id = ?'
  ).bind(confirm ? now : null, confirm ? 'eric' : null, id).run();

  // ⭐ AND IT IS WRITTEN INTO THE HISTORY, not only into a column. The column is what the finder
  // reads; the note is what a person reads when they wonder why this firm stopped being offered.
  if (confirm) {
    const words = renamed
      ? 'Renamed from "' + me.name + '" to "' + raw + '" and the spelling confirmed. '
        + quotes + ' quote(s) and ' + sales + ' sale(s) moved with it.'
      : 'Name confirmed as "' + me.name + '". The duplicate finder will stop proposing changes to it.';
    try {
      await env.DB.prepare(
        'INSERT INTO crm_events (id, entity_type, entity_id, kind, label, body, happened_at, '
        + 'created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(crypto.randomUUID(), 'agency', id, 'note', null, words, now,
             new Date().toISOString(), 'eric').run();
    } catch (err) {
      console.warn('could not record the rename note:', String((err && err.message) || err));
    }
  }

  return jsonResp({ ok: true, renamed, name: renamed ? raw : me.name,
                    confirmed: confirm, quotes, sales });
}

/**
 * WHY A FIRM OR A PERSON IS OFF THE MARKETING LIST. Blank means they are on it.
 *
 * ⛔ `do_not_contact` IS NOT LIKE THE OTHERS AND THE CODE TREATS IT THAT WAY. The rest are
 * judgments that can be revisited -- a firm that was out of business can reopen, a firm that said
 * no can be asked again next year. That one is an instruction from the person themselves, and
 * `SUPPRESSED` below is what stops any list including them, whatever filter is set.
 */
// ⚠️ TWO OF THESE ARE ABOUT A PERSON, NOT A FIRM, and the first draft had only firm-shaped
// values. Eric, 2026-08-26: "part of that field should be no longer in business or deceased or
// something." A firm goes out of business; a person dies or moves on, and their FIRM is unaffected.
// Sharing one vocabulary is right -- the question ("why are they off the list?") is the same -- but
// the values have to cover both subjects or the person-level reasons get recorded as firm-level ones.
const DISPOSITIONS = ['out_of_business', 'no_group_products', 'not_interested', 'do_not_contact',
                      'deceased', 'left_the_firm', 'retired', 'wrong_record'];
// ⛔ NEVER IN ANY LIST, WHATEVER FILTER IS SET.
//  because the person asked.  for a reason that needs no argument -- and
// it belongs here rather than among the ordinary reasons because "show me everything" must not be
// able to put a dead person back into an outreach list. Both stay visible on the firm panel, which
// is where the record is kept and where somebody looks to find out why.
const SUPPRESSED = ['do_not_contact', 'deceased'];

// WHERE A PERSON CAME FROM, AND IT IS A WIDER LIST THAN AN IMPORT MAY CLAIM.
//
// CRM_SOURCES is what an IMPORT is allowed to assert -- three values, because an importer should
// not be able to invent a provenance. This is what a HUMAN may correct it to, and it has to cover
// every value already in the register or the correction screen could not describe what is there.
//
// Eric, 2026-08-27, asking for exactly this: "some of the people we're going to import are
// actually the ones who have requested some of the quotes that we've already recorded, so they'll
// need to be ABY Brokers as the source, but I won't know that right away."
//
// SOURCE IS SET ONCE AT FIRST CONTACT, which is what makes a correction screen necessary rather
// than optional: the field records where we MET somebody, so the only way it ever changes is a
// person looking at the record and knowing better. Measured in production 2026-08-27:
// cce_attendee 2,647 - web_research 1,672 - purchased_ok_doi 499 - aby_broker 140 - event 1.
const PERSON_SOURCES = ['aby_broker', 'cce_attendee', 'web_research', 'purchased_ok_doi',
                        'event', 'hand_added', 'quotes', 'import'];
const SOURCE_LABEL = {
  aby_broker: 'ABY Broker', cce_attendee: 'CCE Attendee', web_research: 'Web research',
  purchased_ok_doi: 'Purchased (OK DOI)', event: 'Event', hand_added: 'Added by hand',
  quotes: 'Seen on a quote', import: 'Imported',
};

// How many firms the agency list will return. ⚠️ It is fetched as CAP + 1 so the handler can tell
// "exactly this many" from "more than this", and the page says which. Raising it is not the fix
// on its own -- saying so is.
const AGENCY_LIST_CAP = 5000;

async function handleCrmAgencyField(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const id = String(body.id || '').trim();
  if (!id) return jsonResp({ error: 'Which agency?' }, 400);

  // ⛔ A CLOSED LIST OF COLUMNS, NEVER A NAME FROM THE REQUEST. A field parameterised by whatever the
  // browser sends is how an endpoint that sets a priority ends up setting a password hash.
  const allowed = {
    priority: (v) => {
      const s = String(v || '').trim().toUpperCase();
      // A, B, C or nothing. ⚠️ Blank is a real value -- "nobody has judged this yet" is not the same
      // as C, and forcing a rating would make the column meaningless within a week.
      return (s === '' || s === 'A' || s === 'B' || s === 'C') ? s || null : undefined;
    },
    assigned_rep: (v) => {
      const s = String(v || '').trim().toLowerCase();
      return (s === '' || s === 'eric' || s === 'niels' || s === 'open') ? s || null : undefined;
    },
    disposition: (v) => {
      const d = String(v || '').trim().toLowerCase();
      // '' puts them back on the list, which has to stay possible: a firm marked out of business
      // that turns out to be trading is a correction, not a new record.
      return (d === '' || DISPOSITIONS.includes(d)) ? d || null : undefined;
    },
    disposition_note: (v) => String(v || '').trim().slice(0, 500) || null,
    city: (v) => String(v || '').trim().slice(0, 80) || null,
    state: (v) => {
      const s = String(v || '').trim().toUpperCase();
      // ⚠️ TWO LETTERS ONLY. "Texas" looks answered on screen and is invisible to every filter that
      // compares a code -- the same defect that once made a compliance rule skip a whole state.
      return (s === '' || /^[A-Z]{2}$/.test(s)) ? s || null : undefined;
    },
  };

  const field = String(body.field || '').trim();
  if (!Object.prototype.hasOwnProperty.call(allowed, field)) {
    return jsonResp({ error: 'That is not a field this sets.' }, 400);
  }
  const value = allowed[field](body.value);
  if (value === undefined) return jsonResp({ error: 'That value is not one of the allowed ones.' }, 400);

  // ⭐ SETTING A DISPOSITION STAMPS WHEN. "Not interested" in 2024 is a different fact from
  // "not interested" last week, and without the date nobody can tell them apart -- which is how a
  // list of nos slowly becomes a list nobody dares re-approach.
  // ⛔ CLEARING IT CLEARS THE DATE TOO. A stamp left on a firm that is back on the list is a
  // claim about a decision that has been withdrawn.
  const stamp = (field === 'disposition');
  const sql = stamp
    ? 'UPDATE agencies SET disposition = ?, disposition_at = ? WHERE id = ?'
    : 'UPDATE agencies SET ' + field + ' = ? WHERE id = ?';
  const binds = stamp
    ? [value, value ? new Date().toISOString() : null, id]
    : [value, id];
  const r = await env.DB.prepare(sql).bind(...binds).run();
  if (!r || !r.meta || !r.meta.changes) return jsonResp({ error: 'No such agency.' }, 404);
  return jsonResp({ ok: true, field, value, metro: field === 'city' ? metroFor(value, body.state) : undefined });
}


/**
 * ONE FIELD ON ONE PERSON. The mirror of handleCrmAgencyField, and deliberately its twin.
 *
 * WHY IT HAD TO EXIST, 2026-08-27: people.disposition, people.disposition_note and
 * people.disposition_at had been migrated onto the table and NOTHING IN THE WORKER READ OR WROTE
 * ANY OF THEM. Three columns, zero readers, zero writers. So "retired" -- which Eric asked for by
 * name and which shipped into DISPOSITIONS the same evening -- was in the vocabulary and could not
 * be chosen anywhere, which reads as a missing feature rather than a missing button.
 *
 * A DISPOSITION ON A PERSON IS NOT A DISPOSITION ON THEIR FIRM, and that is the whole point.
 * The comment above DISPOSITIONS says it: a firm goes out of business, a person retires or dies or
 * moves on, and the FIRM is unaffected. Before this, recording that one agent retired could only
 * have been done by marking their agency retired -- which would have taken the whole firm off the
 * marketing list on the strength of one person leaving.
 *
 * A CLOSED LIST OF COLUMNS, never a name from the request -- same rule, same reason.
 */
async function handleCrmPersonField(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const raw = String(body.id || body.person_id || body.email || '').trim();
  if (!raw) return jsonResp({ error: 'Which person?' }, 400);
  // An ADDRESS is resolved to the person; it is never the key. Same helper the read side uses, so
  // the two cannot drift about what "this person" means.
  const resolved = await crmResolvePerson(env, raw);
  if (!resolved.id) return jsonResp({ error: resolved.why }, 400);
  const id = resolved.id;

  const allowed = {
    // NO name HERE, ON PURPOSE. Every field this sets has a control on the firm panel, and a
    // field with no caller is the exact defect this handler was written to fix -- shipping one
    // in the same change would be comic. Renaming a human is also a different act from
    // correcting their city: it is how two records quietly become one person's, and there is no
    // screen asking for it.
    phone: (v) => String(v || '').trim().slice(0, 40),
    city: (v) => String(v || '').trim().slice(0, 80) || null,
    source: (v) => {
      const t = String(v || '').trim().toLowerCase();
      return (t === '' || PERSON_SOURCES.includes(t)) ? t || null : undefined;
    },
    disposition: (v) => {
      const d = String(v || '').trim().toLowerCase();
      // Blank puts them back on the list, which has to stay possible: somebody recorded as retired
      // who turns out to be working is a correction, not a new record.
      return (d === '' || DISPOSITIONS.includes(d)) ? d || null : undefined;
    },
    disposition_note: (v) => String(v || '').trim().slice(0, 500) || null,
  };

  const field = String(body.field || '').trim();
  if (!Object.prototype.hasOwnProperty.call(allowed, field)) {
    return jsonResp({ error: 'That is not a field this sets.' }, 400);
  }
  const value = allowed[field](body.value);
  if (value === undefined) return jsonResp({ error: 'That value is not one of the allowed ones.' }, 400);

  // SETTING A DISPOSITION STAMPS WHEN, and CLEARING IT CLEARS THE STAMP. "Retired" recorded in
  // 2024 is a different fact from "retired" last week, and a date left behind on somebody who is
  // back on the list is a claim about a decision that has been withdrawn.
  const now = new Date().toISOString();
  const stamp = (field === 'disposition');
  const sql = stamp
    ? 'UPDATE people SET disposition = ?, disposition_at = ?, updated_at = ? WHERE id = ?'
    : 'UPDATE people SET ' + field + ' = ?, updated_at = ? WHERE id = ?';
  const binds = stamp ? [value, value ? now : null, now, id] : [value, now, id];
  const r = await env.DB.prepare(sql).bind(...binds).run();
  if (!r || !r.meta || !r.meta.changes) return jsonResp({ error: 'No such person.' }, 404);
  return jsonResp({ ok: true, id, field, value });
}

/**
 * Find or create an agency by name, safely under concurrency.
 *
 * ⭐⭐ ONE IMPLEMENTATION, USED BY EVERY CALLER. The backfill and the event import both need this, and
 * on 2026-08-23 the backfill's own copy produced 33 agency records where 20 firms needed one --
 * because two overlapping runs each inserted the same name. ⛔ A second copy of this would have the
 * race again, and "fixing one find-or-create is not fixing the race" is the lesson that cost that.
 *
 * 🔴 MIN(id) IS AN ARBITRARY BUT STABLE WINNER, which is the property that matters: every racing
 * caller picks the same row, so the loser can drop its own insert rather than leaving a stray.
 */
async function resolveAgency(env, rawName, now, provenance) {
  const name = String(rawName || '').trim().slice(0, 120);
  if (!name) return null;
  const found = await env.DB.prepare('SELECT id FROM agencies WHERE lower(trim(name)) = ?')
    .bind(name.toLowerCase()).first();
  if (found) return found.id;

  const newId = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO agencies (id, name, share_quotes, created_at, needs_review) VALUES (?,?,?,?,?)'
  ).bind(newId, name, 0, now, provenance || 'created by an import -- no quote has ever named this firm').run();

  const canon = await env.DB.prepare('SELECT MIN(id) AS id FROM agencies WHERE lower(trim(name)) = ?')
    .bind(name.toLowerCase()).first();
  const keep = (canon && canon.id) || newId;
  if (keep !== newId) {
    await env.DB.prepare('DELETE FROM agencies WHERE id = ? AND needs_review IS NOT NULL').bind(newId).run();
  }
  return keep;
}

/**
 * A list from an event: paste the rows, tag them all, in one action.
 *
 * ⭐⭐ ERIC, 2026-08-23: *"For adding new agents/agencies, from an event for example... These would be
 * tags that could create new agents/agencies."*
 *
 * 🔴🔴 THE HARD PART IS NOT CREATING PEOPLE, IT IS THE ONES WE ALREADY KNOW. A conference roster
 * includes agents who have quoted for years, and they are the VALUABLE half of the list.
 *   ⛔ They must NOT get a second record -- that is the defect the people table exists to prevent.
 *   ⭐ They MUST still be tagged -- "was at the Tulsa class" is true of them, and it is the whole
 *     reason for pasting the list.
 * ⚠️ THE EXISTING PROSPECTS FORM SKIPS AN EXISTING ROW ENTIRELY, TAG AND ALL. That is the one
 * behaviour this changes.
 *
 * ⛔ NOTHING IS EVER OVERWRITTEN. Somebody already on the list may have an account, quotes, a
 * priority and an owner; a re-pasted list must not quietly rewrite any of it. A name or phone that
 * differs from what we hold is REPORTED, not applied -- the version we have was typed by somebody
 * who was dealing with them, and a badge list is not better evidence than that.
 *
 * ⚠️ A ROW WITH NO EMAIL CREATES NOTHING AND IS REFUSED, by name, in the report. An email is the only
 * stable way to know who somebody is, and badge lists often have none -- so this will be a real and
 * visible fraction, and saying so is the point.
 */
// A PERSON WE KNOW BY NAME AND FIRM. Returns the one person at this agency with this name, or
// says why it will not answer.
//
// 🔴🔴 THE UNIQUENESS TEST IS THE WHOLE SAFETY PROPERTY, AND OMITTING IT MAKES THE SCREEN TIDIER,
// WHICH IS WHY IT GETS OMITTED. TRAPS #286: the agent list keyed on "email if present, else name"
// and welded fifteen people into eight, because two humans who share a name look like one row.
// Scoping to the agency makes a collision far rarer -- it does not make it impossible, and "rarer"
// is not a safety argument. Two Chris Millers at Higginbotham must stay two people.
// ⛔ SO AN AMBIGUOUS NAME IS REFUSED, NEVER RESOLVED. Refusing is recoverable by hand; a silent
// weld moves one person's history onto another and nobody ever finds out.
//
// It looks in BOTH places on purpose. Somebody may already be here as an emailed agent from the
// quote log, and importing a list that names them without an address must not mint a second them.
//
// 🔴🔴 addressedToo IS THE DIFFERENCE BETWEEN TWO QUESTIONS THAT LOOK LIKE ONE.
//   ① A ROW WITH NO EMAIL asks 'do we already know this person, in any form?' -- and it must see
//     emailed people too, or importing a list that names an agent we have quoted for years mints a
//     silent second copy of them.
//   ② AN EMAIL ARRIVING asks the much narrower 'is this the address for somebody we hold with NO
//     address?' -- and it must NOT see emailed people, because two different addresses at one firm
//     under one name are routinely one human with a work and a personal account, but they are
//     sometimes two humans, and this path cannot tell. ⛔ Merging them would be a weld, which is
//     the exact failure TRAPS #286 records, arriving from the other direction.
// ⭐ So adoption only ever claims somebody who has no address at all. That is precisely what Eric
// asked for -- 'an email added later' -- and nothing wider.
async function crmPersonAtAgency(env, name, agencyId, addressedToo) {
  const n = String(name || '').trim().toLowerCase();
  if (!n || !agencyId) return { id: null, why: 'need both a name and a firm' };

  // ⚠️ 'HELD WITH NO ADDRESS' IS A STATEMENT ABOUT broker_directory, NOT ABOUT people.agency_id.
  // The first version of this filtered on the agency link alone -- which every person carries,
  // addressed or not -- so the second of two addresses at one firm ADOPTED the first and welded
  // two humans together. The test caught it because the SETUP was asserted rather than assumed.
  const sql = 'SELECT p.id FROM people p WHERE p.agency_id = ? AND lower(trim(p.name)) = ?'
    + ' AND NOT EXISTS (SELECT 1 FROM broker_directory bd WHERE bd.person_id = p.id)'
    + (addressedToo
        ? ' UNION SELECT d.person_id AS id FROM broker_directory d WHERE d.agency_id = ?'
          + '   AND lower(trim(d.name)) = ? AND d.person_id IS NOT NULL'
        : '');
  const st = env.DB.prepare(sql);
  const rows = await (addressedToo ? st.bind(agencyId, n, agencyId, n) : st.bind(agencyId, n)).all();

  const ids = [...new Set((rows.results || []).map((r) => r.id).filter(Boolean))];
  if (ids.length === 1) return { id: ids[0], why: '' };
  if (ids.length > 1) {
    return { id: null, ambiguous: true, why: 'more than one person of this name at this firm, so it is not clear who this is' };
  }
  return { id: null, why: '' };
}

// ONE TAGGING PATH FOR BOTH KINDS OF ROW. An emailed person and a name-and-firm person take the
// same de-duplicated tag event. Writing it twice is how two rules meant to be identical drift.
async function crmTagPerson(env, personId, label, happenedAt, now, by) {
  const dupe = await env.DB.prepare(
    "SELECT id FROM crm_events WHERE kind = 'tag' AND entity_type = 'person' AND entity_id = ? " +
    'AND lower(trim(label)) = ? AND happened_at = ? LIMIT 1'
  ).bind(personId, label.toLowerCase(), happenedAt).first();
  if (dupe) return 0;
  await env.DB.prepare(
    'INSERT INTO crm_events (id, entity_type, entity_id, kind, label, body, happened_at, created_at, created_by) ' +
    "VALUES (?,'person',?,'tag',?,NULL,?,?,?)"
  ).bind(crypto.randomUUID(), personId, label, happenedAt, now, by).run();
  return 1;
}

async function handleCrmImport(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }

  const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : [];
  if (!rows.length) return jsonResp({ error: 'Nothing to import.' }, 400);

  // The tag is optional -- somebody may just be adding people -- but it is the reason this exists.
  const label = body.label ? await crmCanonicalLabel(env, body.label) : '';
  const today = new Date().toISOString().slice(0, 10);
  const wanted = String(body.happened_at || '').trim();
  if (wanted && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(wanted)) {
    return jsonResp({ error: 'The date must be YYYY-MM-DD.' }, 400);
  }
  const happenedAt = wanted || today;
  const by = String(body.by || '').trim().toLowerCase();
  if (by && CRM_REPS.indexOf(by) === -1) return jsonResp({ error: 'Unknown person.' }, 400);

  // ── WHERE WE FIRST MET THEM. IT IS SET ONCE, AND THE TAG SAYS WHICH ───────────────────────
  //
  // Eric's rule: source records where a person CAME FROM, never which lists they are on -- so it
  // is written when a person is created and never overwritten for somebody already held.
  //
  // It became a parameter on 2026-08-27 because everything created here was stamped "import",
  // which says nothing at all. Two of his sentences settle the shape:
  //
  //   "That's kind of a dumb way though to add someone because it's not from an event. Kelly just
  //    works there and I know it."   -- being TOLD is not the same provenance as arriving on a list
  //   "That event that I met Megan at was really the source."
  //
  // ⭐⭐ SO SOURCE IS THE CATEGORY AND THE TAG IS THE SPECIFIC EVENT. "event" is finite and
  // filterable; "NABIP Tulsa 2026.08.18" is neither, and a free-text source would grow one value
  // per event until no filter could offer them. Together they say exactly where somebody came
  // from without making the column unbounded.
  //
  // ⛔ AN UNKNOWN VALUE IS REFUSED, NEVER STORED. A typo would otherwise invent a source that no
  // filter offers and no screen shows -- present in the table and invisible in the product, which
  // is this project's most expensive shape.
  // cce_attendee: Eric's ComedyCE list. He teaches CE to licensed health agents, so attending a
  // class is genuinely where we first met most of these people. ⛔ IT IS A SOURCE AND NEVER A TAG:
  // "We are not going to Tag based on a CE class they attended. I've done 2,000 classes. That
  // would be stupid. If we do an ABY-hosted CE class, that's different."
  const CRM_SOURCES = ['event', 'hand_added', 'cce_attendee'];
  const source = String(body.source || 'event').trim().toLowerCase();
  if (CRM_SOURCES.indexOf(source) === -1) return jsonResp({ error: 'Unknown source.' }, 400);

  const now = new Date().toISOString();
  // ⭐ adopted IS ITS OWN OUTCOME, NOT A KIND OF "known". It means an address arrived for somebody
  // we already held by name and firm -- the thing Eric asked for -- and it is the one outcome that
  // proves the two halves joined up instead of quietly making a second copy of a person.
  const added = [], known = [], refused = [], differs = [], adopted = [];
  let tagged = 0;
  let schemaError = null;

  for (const row of rows) {
    const email = String((row && row.email) || '').trim().toLowerCase();
    const name = String((row && row.name) || '').trim().slice(0, 120);
    const agency = String((row && row.agency) || '').trim().slice(0, 120);
    const phone = String((row && row.phone) || '').trim().slice(0, 40);
    // Optional, and blank is a perfectly good answer -- most pasted lists carry no city at all.
    const city = String((row && row.city) || '').trim().slice(0, 80);

    // ⭐⭐ NO EMAIL IS NO LONGER A REFUSAL. Eric, 2026-08-24: "if we know an agent and an agency then
    // that should work and an email added later." What replaces the address as the key is the pair
    // NAME + FIRM -- and it is only ever accepted when it names exactly one person (see
    // crmPersonAtAgency). A row missing either half still cannot be placed and still says so.
    if (!email) {
      if (!name || !agency) {
        refused.push({ who: name || agency || '(blank row)',
          why: !name ? 'no email and no name, so there is nothing to know them by'
                     : 'no email and no firm -- a name on its own is not enough to tell two people apart' });
        continue;
      }
      try {
        const agencyId = await resolveAgency(env, agency, now,
          'created by an imported list -- no quote has ever named this firm');
        const hit = await crmPersonAtAgency(env, name, agencyId, true);
        if (hit.ambiguous) { refused.push({ who: name + ' (' + agency + ')', why: hit.why }); continue; }

        let personId = hit.id;
        if (personId) {
          known.push({ email: '', name: name });
          // ⭐ A PHONE IS THE ONLY WAY TO REACH SOMEBODY WITH NO ADDRESS, so a blank one is filled in
          // and an existing one is never overwritten -- same rule the emailed path uses for names.
          if (phone) {
            await env.DB.prepare("UPDATE people SET phone = ?, updated_at = ? WHERE id = ? AND trim(COALESCE(phone,'')) = ''")
              .bind(phone, now, personId).run();
          }
          // ⭐ SAME RULE FOR THE CITY: fill a blank, never overwrite. Somebody may have corrected
          // it by hand, and a list is not better evidence than a person who went and found out.
          if (city) {
            await env.DB.prepare("UPDATE people SET city = ?, updated_at = ? WHERE id = ? AND trim(COALESCE(city,'')) = ''")
              .bind(city, now, personId).run();
          }
        } else {
          personId = crypto.randomUUID();
          await env.DB.prepare(
            'INSERT INTO people (id, name, phone, city, agency_id, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
          ).bind(personId, name, phone, city, agencyId, source, now, now).run();
          added.push({ email: '', name: name });
        }
        if (label && personId) tagged += await crmTagPerson(env, personId, label, happenedAt, now, by);
      } catch (err) {
        const msg = String((err && err.message) || err);
        if (/no such (table|column)/i.test(msg)) { schemaError = msg; break; }
        refused.push({ who: name || '(no name)', why: msg });
      }
      continue;
    }

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      refused.push({ who: name || '(no name)', why: 'that does not look like an email address' });
      continue;
    }

    try {
      const existing = await env.DB.prepare(
        'SELECT email, name, agency, person_id FROM broker_directory WHERE lower(trim(email)) = ?'
      ).bind(email).first();

      let personId;
      if (existing) {
        personId = existing.person_id;
        // A person row may be missing if the backfill has not run for this address.
        if (!personId) {
          personId = crypto.randomUUID();
          await env.DB.prepare('INSERT INTO people (id, name, created_at, updated_at) VALUES (?,?,?,?)')
            .bind(personId, name || existing.name || '', now, now).run();
          await env.DB.prepare(
            'UPDATE broker_directory SET person_id = ? WHERE lower(trim(email)) = ? AND person_id IS NULL'
          ).bind(personId, email).run();
        }
        known.push({ email, name: existing.name || name });
        // Fill a blank city, never overwrite one. Same rule as the phone on the emailless path.
        if (city) {
          await env.DB.prepare("UPDATE people SET city = ?, updated_at = ? WHERE id = ? AND trim(COALESCE(city,'')) = ''")
            .bind(city, now, personId).run();
        }
        // ⚠️ REPORTED, NOT APPLIED. What we hold was typed by somebody dealing with them.
        if (name && existing.name && name.toLowerCase() !== String(existing.name).toLowerCase()) {
          differs.push({ email, weHold: existing.name, theList: name, field: 'name' });
        }
        if (agency && existing.agency && agency.toLowerCase() !== String(existing.agency).toLowerCase()) {
          differs.push({ email, weHold: existing.agency, theList: agency, field: 'agency' });
        }
      } else {
        const agencyId = await resolveAgency(env, agency, now,
          'created by an imported list -- no quote has ever named this firm');

        // ⭐⭐ THIS IS THE "AND AN EMAIL ADDED LATER" HALF OF ERIC'S RULE, AND IT IS THE HALF THAT
        // SILENTLY SPLITS PEOPLE IF IT IS LEFT OUT. We may already hold this person by NAME AND FIRM
        // with no address. Minting a new person here would leave the same human in the list twice --
        // once with an email and once without -- each looking whole, which is exactly the shape
        // TRAPS #286 describes. So an address arriving for somebody we already know ATTACHES to
        // them.
        // ⛔ And it attaches only when the name resolves to ONE person at that firm; ambiguity falls
        // through to creating a separate record rather than guessing which of two people this is.
        const prior = agencyId ? await crmPersonAtAgency(env, name, agencyId, false) : { id: null };
        if (prior.id) {
          personId = prior.id;
          adopted.push({ email, name });
          await env.DB.prepare('UPDATE people SET updated_at = ? WHERE id = ?').bind(now, personId).run();
          if (city) {
            await env.DB.prepare("UPDATE people SET city = ? WHERE id = ? AND trim(COALESCE(city,'')) = ''")
              .bind(city, personId).run();
          }
        } else {
          personId = crypto.randomUUID();
          await env.DB.prepare(
            'INSERT INTO people (id, name, phone, city, agency_id, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
          ).bind(personId, name, phone, city, agencyId, source, now, now).run();
        }
        // ⭐ source RECORDS WHERE THE ROW CAME FROM. Without it, first_seen on an imported agent reads
        // as "first quoted", which is a different and untrue fact.
        await env.DB.prepare(
          'INSERT INTO broker_directory (email, name, phone, agency, agency_id, first_seen, last_seen, ' +
          'quote_count, person_id, source) VALUES (?,?,?,?,?,?,?,?,?,?)'
        ).bind(email, name, phone, agency, agencyId, now, now, 0, personId, source).run();
        // ⭐ ADOPTED IS NOT ADDED. The address is new; the PERSON is not, and reporting them as a
        // new contact is how a list of 500 reads as 500 new relationships when some are existing ones.
        if (!prior.id) added.push({ email, name });
        // A person we held only by name and firm now has an address, so the agency link lives on
        // their broker_directory row and keeping it on people too would be the same fact twice.
        else await env.DB.prepare('UPDATE people SET agency_id = NULL WHERE id = ?').bind(personId).run();
      }

      if (label && personId) tagged += await crmTagPerson(env, personId, label, happenedAt, now, by);
    } catch (err) {
      const msg = String((err && err.message) || err);
      // ⛔ A MISSING COLUMN OR TABLE IS THE DEPLOY BEING AHEAD OF THE DATABASE. Reported once, at
      // the top, and the loop stops -- five hundred identical per-row refusals would bury it.
      if (/no such (column|table)/i.test(msg)) { schemaError = msg; break; }
      refused.push({ who: email, why: msg });
    }
  }

  // ⭐⭐ THE SPLIT, NEVER A TOTAL. "9 added, 4 already known and tagged, 1 refused" is the honest
  // sentence; "14 imported" is the one that hides the two facts somebody needs.
  if (schemaError) {
    return jsonResp({
      error: 'The database is behind the code: ' + schemaError +
             '. Open /api/migrate once, then paste the list again. Nothing was imported.',
      schema: true,
    }, 503);
  }

  return jsonResp({
    ok: true, label: label || null, happened_at: happenedAt,
    added: added.length, known: known.length, refused: refused.length,
    adopted: adopted.length, tagged,
    detail: { added, known, refused, differs, adopted },
  });
}


/**
 * Put a registered or invited broker into the directory ABY actually works from.
 *
 * 🔴🔴 THE GAP THIS CLOSES, AND IT IS ERIC'S QUESTION: "will they have the ability to add other
 * agents or account managers with their emails and us pull that info into our list?"
 * ⛔ UNTIL NOW, NO. An invite wrote to the brokers table (accounts) and the CRM reads broker_directory
 * (the people ABY knows of, built from the quote log). So an agency could hand ABY six account
 * managers and every one of them would be invisible to marketing.
 *
 * ⭐⭐ SAME RULE AS THE EVENT IMPORT: recognise, never duplicate. An agent ABY has known for years is
 * attached to the person they already are; only a genuinely new address creates one.
 *
 * ⚠️ THE AGENCY IS TAKEN AS AN ID, NOT A NAME. The inviter is signed in, so their agency is known
 * exactly -- there is nothing to match on and nothing to get wrong. That is strictly better than the
 * event import, which only ever has a typed firm name to work with.
 *
 * ⛔ IT NEVER OVERWRITES. If ABY already holds a name for that address, the agency's version is not
 * applied here -- the same reasoning as the import: what ABY holds was typed by somebody dealing
 * with that agent. The agency can correct it deliberately from their own screen.
 */
async function linkBrokerIntoDirectory(env, opts) {
  const email = String((opts && opts.email) || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { skipped: 'not an email' };
  const now = new Date().toISOString();
  const name = String((opts && opts.name) || '').trim().slice(0, 120);
  const phone = String((opts && opts.phone) || '').trim().slice(0, 40);
  const agencyId = String((opts && opts.agencyId) || '').trim() || null;
  const agencyName = String((opts && opts.agencyName) || '').trim().slice(0, 120);
  const source = String((opts && opts.source) || 'invite');

  try {
    const existing = await env.DB.prepare(
      'SELECT email, person_id, agency_id FROM broker_directory WHERE lower(trim(email)) = ?'
    ).bind(email).first();

    if (existing) {
      // ⭐ ONE THING IS FILLED IN RATHER THAN OVERWRITTEN: an address ABY knew from a quote may have
      // no agency record attached. Now that a signed-in administrator has asserted the membership,
      // that is the best evidence there will ever be for it.
      if (!existing.agency_id && agencyId) {
        await env.DB.prepare('UPDATE broker_directory SET agency_id = ? WHERE lower(trim(email)) = ? AND agency_id IS NULL')
          .bind(agencyId, email).run();
      }
      if (existing.person_id) return { linked: 'already known', personId: existing.person_id };
      const personId = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO people (id, name, created_at, updated_at) VALUES (?,?,?,?)')
        .bind(personId, name, now, now).run();
      await env.DB.prepare('UPDATE broker_directory SET person_id = ? WHERE lower(trim(email)) = ? AND person_id IS NULL')
        .bind(personId, email).run();
      return { linked: 'already known', personId };
    }

    const personId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO people (id, name, created_at, updated_at) VALUES (?,?,?,?)')
      .bind(personId, name, now, now).run();
    await env.DB.prepare(
      'INSERT INTO broker_directory (email, name, phone, agency, agency_id, first_seen, last_seen, ' +
      'quote_count, person_id, source) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(email, name, phone, agencyName, agencyId, now, now, 0, personId, source).run();
    return { linked: 'added', personId };
  } catch (e) {
    // ⚠️ REPORTED, NEVER THROWN. An invite must still succeed if this fails: the account and the
    // set-password email are what the agency asked for, and ABY's list is a second beneficiary.
    return { error: String((e && e.message) || e) };
  }
}

/**
 * What ABY already knows about the people at YOUR agency.
 *
 * ⭐⭐ THE HALF ERIC ASKED ABOUT SECOND, AND THE MORE VALUABLE ONE: "if we already have some agent
 * info would that fill in to their admin area where they can see it and update it if necessary?"
 * ABY knows 139 agents from fifteen years of quotes. Making an agency RETYPE their own colleagues is
 * the product failing at the thing it exists for.
 *
 * 🔴 IT RETURNS NOTHING ABY-INTERNAL. No priority, no owner, no tags, no notes. Those are ABY's
 * judgments about the agency, and a broker must never read them about themselves. The columns are
 * chosen one by one here rather than by SELECT *, so a column added later cannot leak by default.
 */
async function handleAgencyPeople(request, env) {
  const me = await currentBroker(request, env);
  if (!me) return jsonResp({ error: 'Please sign in.' }, 401);
  if (!me.agency_id) return jsonResp({ people: [], note: 'Your account is not attached to an agency.' });
  try {
    const { results } = await env.DB.prepare(
      'SELECT d.email, d.name, d.phone, ' +
      "       (SELECT COUNT(*) FROM quotes q WHERE lower(trim(q.broker_email)) = lower(trim(d.email)) " +
      "          AND trim(q.broker_email) <> '') AS quotes, " +
      '       (SELECT MAX(q.created_at) FROM quotes q WHERE lower(trim(q.broker_email)) = lower(trim(d.email))) AS last_quote, ' +
      "       CASE WHEN EXISTS (SELECT 1 FROM brokers b WHERE lower(trim(b.email)) = lower(trim(d.email)) " +
      "         AND b.password_hash <> '') THEN 1 ELSE 0 END AS has_account " +
      'FROM broker_directory d WHERE d.agency_id = ? ORDER BY quotes DESC, d.name'
    ).bind(me.agency_id).all();
    return jsonResp({ people: results || [] });
  } catch (err) {
    return jsonResp({ people: [], error: String((err && err.message) || err) }, 500);
  }
}

/**
 * An agency administrator corrects one of their own people.
 *
 * 🔴🔴 THE FIELD-OWNERSHIP RULE, ENFORCED RATHER THAN DOCUMENTED. The agency owns who somebody is --
 * their name and phone. ABY owns what ABY thinks of them -- the owner, the priority, the tags, the
 * notes. ⛔ A closed list of two columns, and the row must already belong to the caller's agency, so
 * an administrator cannot reach a person at another firm by guessing an address.
 */
async function handleAgencyPersonUpdate(request, env) {
  const me = await currentBroker(request, env);
  if (!me) return jsonResp({ error: 'Please sign in.' }, 401);
  if (me.role !== 'admin' || !me.agency_id) {
    return jsonResp({ error: 'Only an agency administrator can change these.' }, 403);
  }
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!email) return jsonResp({ error: 'Which person?' }, 400);

  const allowed = { name: 120, phone: 40 };
  const field = String(body.field || '').trim();
  if (!Object.prototype.hasOwnProperty.call(allowed, field)) {
    return jsonResp({ error: 'That is not a field you can change.' }, 400);
  }
  const value = String(body.value == null ? '' : body.value).trim().slice(0, allowed[field]);

  // ⛔ SCOPED TO THEIR OWN AGENCY IN THE WHERE CLAUSE, not checked beforehand. A check-then-write can
  // be raced; a scoped write cannot, and changes === 0 is how it reports the refusal.
  const r = await env.DB.prepare(
    'UPDATE broker_directory SET ' + field + ' = ? WHERE lower(trim(email)) = ? AND agency_id = ?'
  ).bind(value, email, me.agency_id).run();
  if (!r || !r.meta || !r.meta.changes) {
    return jsonResp({ error: 'That person is not on your agency.' }, 404);
  }
  return jsonResp({ ok: true, field, value });
}

/**
 * Registered agencies that look like a firm ABY already had.
 *
 * 🔴🔴 SELF-SIGNUP ALWAYS CREATES A NEW AGENCY ROW, DELIBERATELY -- there is nothing trustworthy to
 * match a stranger on, and guessing would put somebody inside another firm's book. ⭐ That decision
 * is right and it has a consequence: a firm ABY has quoted for years gets a SECOND record the moment
 * somebody there registers, and both appear on the Marketing list.
 *
 * ⛔ SUGGESTIONS, NEVER MERGES -- the same rule as the duplicate people, for the same reason. "Lone
 * Star Insurance" and "Lone Star Insurance Services" may be one firm or two, and only Eric or Niels
 * knows. ⚠️ Matched on letters and digits only, so punctuation and case cannot hide a pair.
 */
// THE PEOPLE AT ONE FIRM -- BOTH KINDS, IN ONE LIST.
//
// ⭐⭐ WRITTEN IN THE SAME COMMIT AS THE STORAGE, NOT AFTER IT (TRAPS #284, #275). Storing 532
// phone-only contacts behind a screen that only reads broker_directory would have put every one of
// them in the database and none of them in front of a human -- and the firm row would have shown a
// count nobody could act on. ⛔ A COUNT CANNOT BE CALLED.
//
// The UNION is the point: a person with an address comes from broker_directory, a person we hold by
// name and firm comes from people, and the screen must not care which. has_email lets the page say
// what is missing rather than rendering a blank cell that reads as a bug.
// ── A STAGED BULK LOAD, AND WHY IT IS SHAPED THIS WAY ─────────────────────────────────────────
//
// The CE list is 2,677 people. They have to reach handleCrmImport, because that is the ONLY place
// that knows the identity rules -- email is the key, otherwise name plus firm, and a name matching
// more than one person is refused rather than guessed. Re-implementing any of that in a loader
// would be the second copy this project keeps getting bitten by.
//
// ⛔ SO THE ROWS ARE NOT IMPORTED HERE. They are staged in cce_staging by one wrangler call that
// reads the file off disk, and these two handlers only hand them out and mark them done. The
// import itself still runs through the same endpoint an operator's paste uses.
//
// ⚠️ done IS SET AFTER THE IMPORT SUCCEEDS, NEVER BEFORE. Marking on read would skip a batch whose
// import then failed, and the loss would be silent -- the row would simply never arrive and no
// count would say so.
async function handleCrmStagedNext(request, env) {
  const u = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(u.searchParams.get('limit'), 10) || 40, 1), 100);
  try {
    const r = await env.DB.prepare(
      'SELECT n, name, email, phone, city, agency FROM cce_staging WHERE done = 0 ORDER BY n LIMIT ?'
    ).bind(limit).all();
    const left = await env.DB.prepare('SELECT COUNT(*) AS n FROM cce_staging WHERE done = 0').first();
    return jsonResp({ rows: r.results || [], remaining: (left && left.n) || 0 });
  } catch (err) {
    return jsonResp({ error: String((err && err.message) || err) }, 500);
  }
}

async function handleCrmStagedDone(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const ns = (Array.isArray(body.ns) ? body.ns : []).map(Number).filter((x) => Number.isFinite(x));
  if (!ns.length) return jsonResp({ error: 'Nothing to mark.' }, 400);
  try {
    const marks = ns.map(() => '?').join(',');
    const r = await env.DB.prepare('UPDATE cce_staging SET done = 1 WHERE n IN (' + marks + ')')
      .bind(...ns).run();
    // Report what came BACK, not that no error came back.
    return jsonResp({ marked: (r && r.meta && r.meta.changes) || 0, asked: ns.length });
  } catch (err) {
    return jsonResp({ error: String((err && err.message) || err) }, 500);
  }
}

async function handleCrmAgencyPeople(request, env) {
  const id = (new URL(request.url).searchParams.get('agency_id') || '').trim();
  if (!id) return jsonResp({ error: 'Which firm?' }, 400);
  try {
    const r = await env.DB.prepare(
      // ⭐ THE CITY COMES OFF THE PERSON EVEN ON THE EMAILED ARM, which is why this joins back to
      // people: broker_directory is keyed on an ADDRESS and has no city of its own. Without the
      // join, every agent we hold by email would show a blank city while the phone-only ones
      // showed theirs -- a column that looks broken rather than one that is simply not known yet.
      // THE PERSON ID IS CARRIED ON BOTH ARMS, and without it nothing on this panel could be
      // edited: the emailed arm is keyed on an ADDRESS, so the row had no handle on the human
      // behind it. The disposition rides along for the same reason the city does -- it lives on
      // the PERSON, and a row that cannot show it cannot let anybody set it.
      "SELECT d.name AS name, d.email AS email, d.phone AS phone, d.quote_count AS quotes, " +
      "       1 AS has_email, COALESCE(pd.city,'') AS city, COALESCE(d.source,'quotes') AS source, " +
      "       d.person_id AS person_id, COALESCE(pd.disposition,'') AS disposition, " +
      "       COALESCE(pd.disposition_note,'') AS disposition_note, pd.disposition_at AS disposition_at " +
      'FROM broker_directory d LEFT JOIN people pd ON pd.id = d.person_id ' +
      'WHERE d.agency_id = ? ' +
      'UNION ALL ' +
      "SELECT p.name AS name, '' AS email, COALESCE(p.phone,'') AS phone, 0 AS quotes, " +
      "       0 AS has_email, COALESCE(p.city,'') AS city, COALESCE(p.source,'import') AS source, " +
      "       p.id AS person_id, COALESCE(p.disposition,'') AS disposition, " +
      "       COALESCE(p.disposition_note,'') AS disposition_note, p.disposition_at AS disposition_at " +
      'FROM people p WHERE p.agency_id = ? ' +
      '  AND NOT EXISTS (SELECT 1 FROM broker_directory d2 WHERE d2.person_id = p.id) ' +
      'ORDER BY has_email DESC, quotes DESC, name COLLATE NOCASE'
    ).bind(id, id).all();
    const rows = r.results || [];
    return jsonResp({ people: rows, matched: rows.length,
                      dispositions: DISPOSITIONS, sources: PERSON_SOURCES,
                      sourceLabels: SOURCE_LABEL });
  } catch (err) {
    // 🔴 AN ERROR IS NOT AN EMPTY FIRM. The two must never render the same way -- this admin has
    // confused them before (TRAPS #253, #264).
    return jsonResp({ people: [], error: String((err && err.message) || err) }, 500);
  }
}

// 🔴🔴 RESTORED 2026-08-24 AFTER A SPLICE ATE IT AND TOOK THE LIVE PAGE DOWN.
// The edit replaced handleCrmAgencyDupes by cutting from its opening line to the NEXT
// 'async function' -- and this helper sat in between, so it went with it. The marketing list
// then rendered 'Could not load the list: deriveStatus is not defined' for every visitor.
// ⛔ CUTTING TO THE NEXT DECLARATION ASSUMES NOTHING LIVES BETWEEN THE TWO. Replace a function
// by matching its own braces, or anchor on the exact last line of the thing being replaced.
// ⭐ It was caught in one look at the page. No parser could: the syntax was valid and the
// reference only fails at RUN time -- which is why 'all pages emit valid JS' stayed green.
function deriveStatus(quotes, lastQuoteIso) {
  const n = Number(quotes || 0);
  if (!n) return 'never quoted';
  // A firm that quoted plenty and then went quiet is a different story from one that never started,
  // and "former" is the one that most often deserves a phone call.
  if (lastQuoteIso) {
    const days = (Date.now() - Date.parse(lastQuoteIso)) / 86400000;
    if (days > 730) return 'former';
  }
  if (n === 1) return 'quoted once';
  if (n < 6) return 'occasional';
  return 'regular';
}

// "These are different firms." An answer, kept.
async function handleTidyDismiss(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const key = String(body.group_key || '').trim();
  const names = String(body.names || '').trim().slice(0, 400);
  if (!key) return jsonResp({ error: 'Which group?' }, 400);
  try {
    // Saying it twice is not an error. The second click means the same thing as the first.
    await env.DB.prepare(
      'INSERT INTO tidy_dismissed (group_key, names, created_at) VALUES (?,?,?) ' +
      'ON CONFLICT(group_key) DO UPDATE SET names = excluded.names'
    ).bind(key, names, new Date().toISOString()).run();
    return jsonResp({ ok: true });
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (/no such table/i.test(msg)) {
      return jsonResp({ error: 'The database is behind the code. Open /api/migrate once.' }, 503);
    }
    return jsonResp({ error: msg }, 500);
  }
}

// A working message about one tidy-up group. It is not a note on a firm: it is an instruction
// with a lifespan, and it disappears from the screen the moment it is marked done.
async function handleTidyNote(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const key = String(body.group_key || '').trim();
  const text = String(body.body || '').trim().slice(0, 1000);
  const names = String(body.names || '').trim().slice(0, 400);
  if (!key || !text) return jsonResp({ error: 'Which group, and what about it?' }, 400);
  try {
    await env.DB.prepare(
      'INSERT INTO tidy_message (id, group_key, names, body, created_at) VALUES (?,?,?,?,?)'
    ).bind(crypto.randomUUID(), key, names, text, new Date().toISOString()).run();
    return jsonResp({ ok: true });
  } catch (err) {
    const msg = String((err && err.message) || err);
    if (/no such table/i.test(msg)) {
      return jsonResp({ error: 'The database is behind the code. Open /api/migrate once.' }, 503);
    }
    return jsonResp({ error: msg }, 500);
  }
}

// Deleting is how Eric takes one back before it has been acted on. Marking done is what I do
// AFTER acting -- that keeps a record of what was asked without it reappearing on the screen.
async function handleTidyNoteDelete(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const id = String(body.id || '').trim();
  if (!id) return jsonResp({ error: 'Which note?' }, 400);
  try {
    const r = await env.DB.prepare('DELETE FROM tidy_message WHERE id = ?').bind(id).run();
    // A delete that matched nothing is not a success. It usually means two tabs are open.
    const n = (r && r.meta && r.meta.changes) || 0;
    if (!n) return jsonResp({ error: 'That note was already gone.' }, 404);
    return jsonResp({ ok: true });
  } catch (err) {
    return jsonResp({ error: String((err && err.message) || err) }, 500);
  }
}

// RESTORED 2026-08-24. A splice replacing a nearby function swallowed these, and the marketing
// list then threw on every request -- the handler's catch turned it into an empty agency list,
// so the page looked like a book with no firms in it rather than a broken query.
// THIS IS THE SECOND TIME IN ONE SESSION. deriveStatus went the same way, and the check I added
// afterwards compared top-level FUNCTIONS only -- these are consts, so it saw nothing missing.
// Compare every top-level declaration, not just the ones that look like code.
const RECORDED_STATUSES = ['never quoted', 'quoted once', 'occasional', 'regular', 'former'];
const RECORDED_PREFIX = 'status: ';

/**
 * WHO HAS NEVER ASKED US FOR THIS, out of the firms that ask us for plenty.
 *
 * ERIC, 2026-08-22: "we are using this so that we can quote, keep up with quotes, but also target
 * our marketing efforts." This is the most concrete marketing list the data can produce, and it is
 * what turns the agency cleanup into calls.
 * MEASURED 2026-08-23 across the firms with 15 or more quotes: 28 of them have NEVER once asked
 * for ACA 1094/1095, while 438 firms have quoted COBRA and only 106 have ever quoted ACA. Those
 * are established relationships that already trust us with COBRA and have never been asked.
 *
 * THE ID VOCABULARY IS TWO VOCABULARIES, AND A FILTER ON EITHER ONE SILENTLY DROPS THE OTHER.
 * Measured 2026-08-24 over all 9,379 product rows in the log: the 2009-2026 import wrote
 * product-cobra, product-aca and so on (9,368 rows), while a quote run through the tool writes the
 * bare id the catalogue uses -- cobra, aca (11 rows). The bare form is the CANONICAL one
 * (assets/js/data/products.js) and it is the one that GROWS, because it is what the live tool
 * emits. So the prefix is stripped and everything is counted on the catalogue's own vocabulary.
 * An enumerated value spelled differently is invisible and does not announce itself: a filter on
 * product-aca would quietly have reported every tool-run ACA quote as never quoted.
 *
 * NO SECOND COPY OF THE PRODUCT LIST LIVES HERE, DELIBERATELY. Each product label is read out of
 * the quotes themselves -- every stored entry carries its own name -- so it cannot drift from the
 * catalogue the way a hard-coded map would. The most frequently used spelling wins.
 *
 * IT HIDES EXACTLY WHAT THE CALL LIST HIDES. Acquired names, spelling aliases and rows whose name
 * is two firms at once are excluded on the same rule as the marketing list, because a prospecting
 * list that offers a name nobody answers to is the defect F-388 was raised for.
 */
async function handleCrmNeverQuoted(request, env) {
  const u = new URL(request.url).searchParams;
  const product = (u.get('product') || '').trim();
  // The floor is what makes this a list of RELATIONSHIPS rather than a list of strangers. A firm
  // that quoted twice and never asked for ACA has not declined anything; it has barely met us.
  // Number(null) IS 0, NOT NaN, and so is Number(''). Reading the parameter straight into Number
  // therefore turned "no floor given" into a floor of 1 -- which is the opposite of the default and
  // fills the screen with firms that have quoted us once. Caught by check_never_quoted.mjs on its
  // first run, which is the entire reason that file exists.
  const rawMin = String(u.get('min') || '').trim();
  const asked = rawMin === '' ? NaN : Number(rawMin);
  const min = Number.isFinite(asked) ? Math.max(1, Math.min(500, Math.round(asked))) : 15;

  // One pass over the quote log, exploded to one row per product on each quote.
  const PQ =
    "WITH pq AS (SELECT lower(trim(q.broker_agency)) AS k, " +
    "              CASE WHEN j.value ->> 'id' LIKE 'product-%' " +
    "                   THEN substr(j.value ->> 'id', 9) ELSE j.value ->> 'id' END AS pid, " +
    "              j.value ->> 'name' AS pname " +
    "            FROM quotes q, json_each(q.products) j " +
    "            WHERE trim(COALESCE(q.broker_agency,'')) <> '' " +
    "              AND trim(COALESCE(q.products,'')) NOT IN ('', '[]')) ";

  try {
    // What products exist, and how each is usually spelled.
    const cat = await env.DB.prepare(
      PQ + "SELECT pid, pname, COUNT(*) AS uses FROM pq " +
           "WHERE pid IS NOT NULL AND pid <> '' GROUP BY pid, pname"
    ).all();

    const byId = {};
    for (const r of (cat.results || [])) {
      const e = byId[r.pid] || (byId[r.pid] = { id: r.pid, label: '', uses: 0, firms: 0, best: -1 });
      e.uses += Number(r.uses) || 0;
      if ((Number(r.uses) || 0) > e.best) { e.best = Number(r.uses) || 0; e.label = r.pname || r.pid; }
    }

    // COUNTED SEPARATELY, NEVER SUMMED. A firm that used both spellings of one product would be
    // counted twice by adding up the per-spelling figures, which is a rollup of distinct things.
    const firmsPer = await env.DB.prepare(
      PQ + "SELECT pid, COUNT(DISTINCT k) AS firms FROM pq " +
           "WHERE pid IS NOT NULL AND pid <> '' GROUP BY pid"
    ).all();
    for (const r of (firmsPer.results || [])) if (byId[r.pid]) byId[r.pid].firms = Number(r.firms) || 0;

    const products = Object.keys(byId).map(function (k) {
      const p = byId[k];
      return { id: p.id, label: p.label || p.id, uses: p.uses, firms: p.firms };
    }).sort(function (a, b) { return b.uses - a.uses; });

    if (!product) return jsonResp({ products, product: '', min, rows: [], eligible: 0 });

    // The callable firms with enough history to have had the conversation, that have never once
    // had THIS product on a quote. Counted by the firm's own name, exactly as the list beside it.
    const rows = await env.DB.prepare(
      PQ +
      ", tot AS (SELECT lower(trim(broker_agency)) k, COUNT(*) quotes, MAX(created_at) last_quote " +
      "          FROM quotes WHERE trim(COALESCE(broker_agency,'')) <> '' GROUP BY 1) " +
      "SELECT a.id, a.name, a.city, a.state, a.priority, a.assigned_rep, " +
      "       tot.quotes, tot.last_quote " +
      "FROM agencies a JOIN tot ON tot.k = lower(trim(a.name)) " +
      "WHERE COALESCE(a.relationship,'') NOT IN ('succeeded','alias') " +
      "  AND a.name NOT LIKE '%;%' " +
      "  AND tot.quotes >= ? " +
      "  AND NOT EXISTS (SELECT 1 FROM pq WHERE pq.k = tot.k AND pq.pid = ?) " +
      "ORDER BY tot.quotes DESC, a.name LIMIT 500"
    ).bind(min, product).all();

    // How many firms CLEAR THE FLOOR at all. Without it "28 firms" is a number with no
    // denominator -- 28 out of 78 is a campaign, 28 out of 30 is a product nobody wants.
    const el = await env.DB.prepare(
      "WITH tot AS (SELECT lower(trim(broker_agency)) k, COUNT(*) quotes FROM quotes " +
      "             WHERE trim(COALESCE(broker_agency,'')) <> '' GROUP BY 1) " +
      "SELECT COUNT(*) AS n FROM agencies a JOIN tot ON tot.k = lower(trim(a.name)) " +
      "WHERE COALESCE(a.relationship,'') NOT IN ('succeeded','alias') " +
      "  AND a.name NOT LIKE '%;%' AND tot.quotes >= ?"
    ).bind(min).first();

    return jsonResp({
      products: products,
      product: product,
      min: min,
      rows: rows.results || [],
      eligible: (el && el.n) || 0,
    });
  } catch (err) {
    // A thrown query must not render as "everybody has quoted everything", which is the shape of a
    // finished job. The error reaches the screen.
    return jsonResp({ error: String((err && err.message) || err) }, 500);
  }
}

async function handleCrmAgencyDupes(request, env) {
  try {
    // ⭐⭐ THE QUOTE HISTORY IS WHAT DECIDES WHICH NAME TO KEEP. Eric, 2026-08-24: "I think it would
    // be helpful to see some stats next to the rest so I know how often they have quoted." It had
    // already cost him a wrong answer: with every row reading "0 agents" he aliased Marsh & McLennan
    // into a 2-quote row when MMA (743) was the one to keep.
    // ⚠️ GROUPED CTEs, NOT PER-ROW SUBQUERIES -- the earlier version locked the page for fifteen
    // seconds. The whole query runs in about 20ms.
    const { results } = await env.DB.prepare(
      "WITH q AS (SELECT lower(trim(broker_agency)) k, COUNT(*) n, MAX(created_at) last " +
      "           FROM quotes WHERE trim(COALESCE(broker_agency,'')) <> '' GROUP BY 1), " +
      '     pe AS (SELECT agency_id, COUNT(*) n FROM broker_directory GROUP BY 1), ' +
      '     px AS (SELECT agency_id, COUNT(*) n FROM people WHERE agency_id IS NOT NULL GROUP BY 1) ' +
      'SELECT a.id, a.name, a.created_at, COALESCE(q.n, 0) AS quotes, q.last AS last_quote, ' +
      '       (COALESCE(pe.n, 0) + COALESCE(px.n, 0)) AS agents ' +
      'FROM agencies a ' +
      'LEFT JOIN q  ON q.k = lower(trim(a.name)) ' +
      'LEFT JOIN pe ON pe.agency_id = a.id ' +
      'LEFT JOIN px ON px.agency_id = a.id ' +
      "WHERE COALESCE(a.relationship,'') NOT IN ('succeeded','alias') " +
      // \ud83d\udd34\ud83d\udd34 A NAME ERIC HAS CONFIRMED IS NOT A CANDIDATE. This is the whole of his
      // 2026-08-24 complaint: "why do you have that page for me to tidy up if you are going to
      // ignore the answers." A finder that re-proposes something already answered is not a finder,
      // it is a loop -- and it spends the only expensive thing on this screen, which is his time.
      "  AND a.name_confirmed_at IS NULL " +
      "  AND a.name NOT LIKE '%;%' ORDER BY a.name"
    ).all();
    const rows = results || [];

    const NOISE = ['llc', 'l.l.c.', 'inc', 'inc.', 'co', 'co.', 'company', 'agency', 'agencies',
      'insurance', 'services', 'service', 'group', 'benefits', 'benefit', 'solutions',
      'partners', 'associates'];
    const FILLER = ['and', 'the', 'of', 'a'];

    function near1(a, b) {
      if (Math.abs(a.length - b.length) > 1) return false;
      let i = 0, j = 0, diff = 0;
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { i++; j++; continue; }
        if (++diff > 1) return false;
        if (a.length > b.length) i++;
        else if (b.length > a.length) j++;
        else { i++; j++; }
      }
      return true;
    }
    // A NOISE WORD WITH A TYPO IN IT IS STILL A NOISE WORD. Eric: "you also need to find more that
    // should be on the tidy up list, like Baldwin." Baldwin Group (21) and Baldwin Grouup (0) were
    // never offered, because "grouup" is not in the list and the tail was never stripped.
    const nearNoise = (w) => NOISE.indexOf(w) !== -1
      || (w.length >= 5 && NOISE.some((n) => near1(w, n)));
    // ⚠️ AMPERSAND IS A SPELLING OF "AND". "DFW Health & Life" and "DFW Health and Life LLC" are one
    // firm, and stripping punctuation alone left one with an extra word. Eric found this one too.
    const words = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ')
      .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
      .filter((w) => w && FILLER.indexOf(w) === -1);
    const key = (s) => {
      const t = words(s);
      while (t.length > 1 && nearNoise(t[t.length - 1])) t.pop();
      return t.join('');
    };

    // ── PASS ONE: the same name. Confident enough to lead with.
    // ⚠️ TWO KEYS PER ROW, because a noise word can be FUSED to the name. 'Assured Partners'
    // strips to 'assured' while 'AssuredPartners' is one word and keeps its tail -- so the tail rule
    // alone put a 65-quote firm and its own name in different buckets. Keying on the unstripped
    // form as well catches it, and a row joins every group either of its keys lands in.
    const byKey = {};
    for (const r of rows) {
      const ks = key(r.name);
      const kf = words(r.name).join('');
      for (const k of (ks === kf ? [ks] : [ks, kf])) {
        if (!k) continue;
        (byKey[k] = byKey[k] || []).push(r);
      }
    }
    // A row reached through two keys must not appear twice inside one group.
    for (const k of Object.keys(byKey)) {
      const seenHere = {};
      byKey[k] = byKey[k].filter((r) => (seenHere[r.id] ? false : (seenHere[r.id] = 1)));
    }
    // A typo in the MIDDLE of the real name: Holloway Benefit / Holloway Benefits Concepts.
    const keys = Object.keys(byKey), merged = {};
    for (let i = 0; i < keys.length; i++) {
      if (merged[keys[i]]) continue;
      for (let j = i + 1; j < keys.length; j++) {
        if (merged[keys[j]] || keys[i].length < 8) continue;
        if (near1(keys[i], keys[j])) { byKey[keys[i]] = byKey[keys[i]].concat(byKey[keys[j]]); merged[keys[j]] = 1; }
      }
    }
    // ⭐ EVERY ANSWER ALREADY GIVEN, READ BACK BEFORE ANYTHING IS PROPOSED. A group he has already
    // ruled on is not offered again, in either section.
    let dismissed = {};
    try {
      const dr = await env.DB.prepare('SELECT group_key FROM tidy_dismissed').all();
      for (const d of (dr.results || [])) dismissed[d.group_key] = 1;
    } catch (err) { /* the table arrives with the next migration */ }
    const gkey = (g) => g.map((r) => r.id).slice().sort().join('|');
    const order = (g) => g.slice().sort((x, y) => (y.quotes - x.quotes) || String(x.name).localeCompare(y.name));
    // ⛔⛔ THE SAME PAIR CAME OUT TWICE, ONE GROUP AFTER THE OTHER -- Eric spotted it on the screen.
    // Filing every row under BOTH its stripped and unstripped key is what lets 'Assured Partners'
    // meet 'AssuredPartners', and it also means a pair that agrees on both keys forms two identical
    // groups. ⚠️ The per-group dedupe added with the second key stops a row repeating INSIDE a
    // group; it says nothing about two groups being the same set. Different bug, same origin.
    const seen = {};
    const madeAlready = {};
    const pairs = keys.filter((k) => !merged[k] && byKey[k].length > 1).map((k) => order(byKey[k]))
      .filter((g) => {
        const sig = gkey(g);
        if (madeAlready[sig]) return false;
        madeAlready[sig] = 1;
        g.forEach((r) => { seen[r.id] = 1; });
        return !dismissed[sig];
      }).sort((a, b) => (b[0].quotes || 0) - (a[0].quotes || 0));

    // ── PASS TWO: the same FIRST WORD. Weaker, and offered as such.
    // ⭐⭐ ERIC ASKED FOR THIS DIRECTLY: "There are four versions of companies that start with
    // Creative. They should all be on there since they might all be the same." Pass one splits them,
    // because Creative Concepts and Creative Insurance Concepts reduce to different names.
    // ⛔ IT IS DELIBERATELY A SEPARATE, LOWER SECTION. These are prompts to look, not near-certain
    // duplicates, and mixing them in would make the confident list feel unreliable.
    // ⚠️ Capped at six rows and a first word of five letters or more, or every "American" and
    // "First" in the book arrives as one heap.
    // ⭐ THE FIRST SEVEN LETTERS, IGNORING SPACES AND PUNCTUATION. Tried against the real book:
    // this is what puts all five Creative rows together (including 'Creativa Associates'), all
    // three AssuredPartners spellings, Innovated / Innovative, the whole Lone Star family, Endeavor,
    // Waldman, Baldwin and True North. A first-word rule found far fewer, because the differences
    // are usually INSIDE the first word.
    // ⚠️ Seven, not six: six pulls in unrelated firms, and eight starts missing typos. Groups of
    // more than six are dropped -- that is a common prefix, not a firm.
    const squash = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const byPre = {};
    for (const r of rows) {
      const sq = squash(r.name);
      if (sq.length < 7) continue;
      const k = sq.slice(0, 7);
      (byPre[k] = byPre[k] || []).push(r);
    }
    const maybe = Object.keys(byPre).filter((w) => {
      const g = byPre[w];
      if (g.length < 2 || g.length > 6) return false;
      if (g.every((r) => seen[r.id])) return false;          // pass one already has them
      if (dismissed[gkey(order(byPre[w]))]) return false;    // already ruled on
      return new Set(g.map((r) => key(r.name))).size > 1;    // and it is not just pass one again
    }).map((w) => order(byPre[w])).sort((a, b) => (b[0].quotes || 0) - (a[0].quotes || 0));

    // ── ROWS THAT ARE NOT A FIRM AT ALL.
    // Eric: "102311 should be on there since we need to figure out what it is, but it's clearly not
    // a broker", and "I don't know why current client and current groups is on the list as an
    // agency." A DIFFERENT JOB FROM DUPLICATES: there is nothing to merge into, and the answer is an
    // identification. They came out of the folder import -- the agency is whatever the proposal
    // folder was called, so any folder that was not a broker's name became an agency. 102311 is a
    // date, 10/23/11.
    // ⛔ NOTHING IS CALLED JUNK ON A COUNT OF LETTERS. K&S has 85 quotes and G&A is a real PEO; an
    // earlier pass called both junk on a rule about name length and was wrong. The quote count and
    // the employers ride along, and the identification stays Eric's.
    const GENERIC = ['add on', 'addon', 'misc', 'none', 'n/a', 'na', 'unknown', 'tbd', 'test',
      'other', 'house', 'internal', 'web', 'online', 'employer', 'client', 'current client',
      'current clients', 'current group', 'current groups', 'renewal', 'renewals', 'new business',
      'prospect', 'prospects', 'sold', 'pending', 'quotes', 'proposals'];
    const odd = rows.filter((r) => {
      const nm = String(r.name || '').trim().toLowerCase();
      if (!nm) return false;
      if (GENERIC.indexOf(nm) !== -1) return true;
      if (!/[a-z]/.test(nm)) return true;                    // 102311 -- no letters at all
      return nm.replace(/[^a-z]/g, '').length <= 3;          // NX, RR, K&S: shown, never judged
    }).sort((a, b) => (b.quotes || 0) - (a.quotes || 0));

    for (const r of odd) {
      const ex = await env.DB.prepare(
        'SELECT client_name, substr(created_at,1,10) AS dt FROM quotes ' +
        'WHERE lower(trim(broker_agency)) = ? ORDER BY created_at DESC LIMIT 3'
      ).bind(String(r.name || '').trim().toLowerCase()).all();
      r.examples = (ex.results || []).map((x) => (x.client_name || '(not stated)') + ' · ' + x.dt);
    }

    // The messages ride back with the groups, so the screen can show what has already been said
    // about each one without a second request.
    let notes = [];
    try {
      const nr = await env.DB.prepare(
        'SELECT id, group_key, body, created_at FROM tidy_message WHERE done_at IS NULL ORDER BY created_at'
      ).all();
      notes = nr.results || [];
    } catch (err) { /* the table arrives with the next migration; the screen still works */ }

    // ── ONE QUOTE, TWO FIRM NAMES TYPED INTO ONE BOX ──────────────────────────────────────────
    //
    // ERIC, 2026-08-24: "we should not leave the incorrect due to provenance - we should fix it...
    // We shouldn't be punished for past errors, instead we should fix those errors so the data is
    // good that we're working with now."
    //
    // ⛔ THESE 47 ROWS WERE HIDDEN FROM THE CALL LIST AND NEVER FIXED, which was half a job: the
    // 48 quotes under them still count for a firm that does not exist, so somebody's totals are
    // short and nothing on any screen says so. Hiding an error is not correcting it.
    // ⭐ 33 of the 47 split into firms already on the books. Picking one runs the SAME correction
    // path as a spelling fix, so the quote is renamed and carries its own note about what it said.
    const compRows = await env.DB.prepare(
      "SELECT id, name FROM agencies WHERE name LIKE '%;%' " +
      "  AND COALESCE(relationship,'') NOT IN ('succeeded','alias') ORDER BY name"
    ).all();
    const realRows = await env.DB.prepare(
      "WITH q AS (SELECT agency_id k, COUNT(*) n FROM quotes WHERE agency_id IS NOT NULL GROUP BY 1) " +
      "SELECT a.id, a.name, COALESCE(q.n,0) AS quotes FROM agencies a " +
      'LEFT JOIN q ON q.k = a.id ' +
      "WHERE a.name NOT LIKE '%;%' AND COALESCE(a.relationship,'') <> 'alias'"
    ).all();
    const byName = {};
    for (const r of (realRows.results || [])) byName[String(r.name).trim().toLowerCase()] = r;

    const compound = [];
    for (const c of (compRows.results || [])) {
      // ⚠️ A HALF THAT IS NOT A FIRM WE HAVE IS SHOWN, NOT SILENTLY DROPPED. "NO BROKERS; Worth
      // Benefits" is one of these, and knowing the other half is unrecognised is the useful part.
      const parts = String(c.name).split(';').map((x) => x.trim()).filter(Boolean);
      const opts = parts.map((nm) => {
        const hit = byName[nm.toLowerCase()];
        return { name: nm, id: (hit && hit.id) || null, quotes: (hit && hit.quotes) || 0 };
      // The busiest real firm first: usually the one that actually ran it.
      }).sort((a, b) => (b.id ? 1 : 0) - (a.id ? 1 : 0) || (b.quotes - a.quotes));
      const ex = await env.DB.prepare(
        'SELECT client_name, substr(created_at,1,10) AS dt FROM quotes ' +
        'WHERE lower(trim(broker_agency)) = ? ORDER BY created_at DESC LIMIT 3'
      ).bind(String(c.name).trim().toLowerCase()).all();
      // \u26d4 A COMPOUND ROW WITH NO QUOTES LEFT HAS BEEN ANSWERED, AND MUST STOP BEING ASKED.
      // Resolving one moves its quotes onto the real firm -- either both firms, where two of them
      // genuinely quoted the employer, or the one whose logo is on the cover. The compound agency
      // record stays behind holding nothing, and it kept appearing on this list.
      // That is the same complaint that produced tidy_dismissed: a screen which re-asks a question
      // somebody has already answered burns the only expensive thing here, which is Eric's
      // attention. 20 of the 42 were answered on 2026-08-24 from the original proposals.
      // \u26a0\ufe0f HIDDEN, NEVER DELETED. The row is still on the analysis view and still carries the
      // history; it has simply stopped being a question.
      if (!(ex.results || []).length) continue;
      compound.push({
        id: c.id, name: c.name, options: opts,
        examples: (ex.results || []).map((x) => (x.client_name || '(not stated)') + ' · ' + x.dt),
      });
    }

    // -- A NAME ON QUOTES THAT NO AGENCY ROW ANSWERS TO -----------------------------------------
    //
    // FOUND 2026-08-24, AND IT IS THE FAILURE MODE OF THE TIDY-UP ITSELF. Every agency screen joins
    // quotes to agencies BY NAME. So a quote whose broker_agency has no matching agency row is
    // invisible everywhere: it is in no firm's count, no family rollup, and no marketing list --
    // and nothing anywhere said so.
    // IT IS PRODUCED BY DOING HALF OF ERIC'S OWN RULE. Resolving a group is supposed to rename the
    // firm ON THE QUOTE and write the old spelling into that quote's note. Create the new agency
    // rows and skip the rename, and the new rows read 0 quotes while the old name keeps them and
    // drops off every screen. Measured that day: 330 quotes still said Benefits Texas and 13 said
    // JME after both were resolved under Patriot Growth Insurance Services, so 343 quotes went
    // quiet and the two new division rows showed nothing.
    // NAMES THAT ARE NOT FIRMS ARE EXCLUDED, because they are supposed to have no agency row --
    // cleanAgency decides that, so this cannot disagree with the rest of the admin about it.
    // IT REPORTS, IT NEVER FIXES. Which firm those quotes belong to is a judgement, and the whole
    // point of this screen is that judgements are Eric's and the finding is the machine's.
    let orphans = [];
    try {
      const orph = await env.DB.prepare(
        "WITH tot AS (SELECT trim(broker_agency) AS nm, lower(trim(broker_agency)) k, " +
        "             COUNT(*) quotes, MAX(created_at) last_quote " +
        "             FROM quotes WHERE trim(COALESCE(broker_agency,'')) <> '' GROUP BY 1, 2) " +
        'SELECT nm, quotes, last_quote FROM tot ' +
        'WHERE NOT EXISTS (SELECT 1 FROM agencies a WHERE lower(trim(a.name)) = tot.k) ' +
        'ORDER BY quotes DESC LIMIT 100'
      ).all();
      orphans = (orph.results || []).filter(function (r) { return cleanAgency(r.nm) !== ''; });
    } catch (e) {
      // Reported as its own error rather than failing the whole screen: the duplicate finder above
      // is the everyday job and must not go dark because this extra query did.
      orphans = [];
    }

    // \u2b50 SAID OUT LOUD. A list that quietly stops offering rows cannot be told from one that has
    // run out of them -- and "nothing left to tidy" is exactly the wrong impression to give.
    let confirmed = 0;
    try {
      const cf = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM agencies WHERE name_confirmed_at IS NOT NULL'
      ).first();
      confirmed = (cf && cf.n) || 0;
    } catch { confirmed = 0; }

    return jsonResp({
      pairs, maybe, odd, notes, compound, orphans, confirmed, matched: pairs.length,
      orphanQuotes: orphans.reduce(function (t, r) { return t + (Number(r.quotes) || 0); }, 0),
      note: 'Suggestions only. Two similar names may be one firm or two, and only a person knows.',
    });
  } catch (err) {
    return jsonResp({ pairs: [], maybe: [], odd: [], error: String((err && err.message) || err) }, 500);
  }
}
async function handleCrmRecordStatus(request, env) {
  let body; try { body = await request.json(); } catch { return jsonResp({ error: 'Bad request' }, 400); }
  const id = String(body.id || '').trim();
  if (!id) return jsonResp({ error: 'Which agency?' }, 400);

  const status = String(body.status || '').trim().toLowerCase();
  if (RECORDED_STATUSES.indexOf(status) === -1) {
    return jsonResp({ error: 'That is not one of the recorded statuses.' }, 400);
  }

  const today = new Date().toISOString().slice(0, 10);
  const wanted = String(body.happened_at || '').trim();
  if (wanted && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(wanted)) {
    return jsonResp({ error: 'The date must be YYYY-MM-DD.' }, 400);
  }
  const happenedAt = wanted || today;
  const by = String(body.by || '').trim().toLowerCase();
  if (by && CRM_REPS.indexOf(by) === -1) return jsonResp({ error: 'Unknown person.' }, 400);

  const agency = await env.DB.prepare('SELECT id FROM agencies WHERE id = ?').bind(id).first();
  if (!agency) return jsonResp({ error: 'No such agency.' }, 404);

  const label = RECORDED_PREFIX + status;
  // The same-day guard the other tag paths use: recording twice in one sitting is a double-click.
  const dupe = await env.DB.prepare(
    "SELECT id FROM crm_events WHERE kind = 'tag' AND entity_type = 'agency' AND entity_id = ? " +
    'AND lower(trim(label)) = ? AND happened_at = ? LIMIT 1'
  ).bind(id, label, happenedAt).first();
  if (dupe) return jsonResp({ ok: true, recorded: status, happened_at: happenedAt, skipped: true });

  await env.DB.prepare(
    'INSERT INTO crm_events (id, entity_type, entity_id, kind, label, body, happened_at, created_at, created_by) ' +
    "VALUES (?,'agency',?,'tag',?,NULL,?,?,?)"
  ).bind(crypto.randomUUID(), id, label, happenedAt, new Date().toISOString(), by).run();

  return jsonResp({ ok: true, recorded: status, happened_at: happenedAt });
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

/**
 * Fold a company name to the shape both lists can be compared on.
 *
 * MUST STAY IN STEP WITH norm() IN benefitlab-notes/aby/agency_names.py, which is what every
 * offline measurement of these records was made with. The two are stated in the same order so
 * they can be diffed by eye, the same arrangement as the child-rating rule.
 *
 * WHY THIS IS NOT DONE IN SQL, AND IT IS NOT A STYLE PREFERENCE: SQLite cannot fold Inc / LLC /
 * ampersands / punctuation, and the difference is not marginal. Measured 2026-08-22 against the
 * live database: a raw lower(name) join matches 91 clients to quotes; this normaliser matches
 * 123. A SQL join would under-report the overlap by 26 percent and would read as missing data
 * rather than as a broken join.
 *
 * AND WHY IT IS NOT DONE IN THE PAGE'S OWN JAVASCRIPT: the admin pages are built inside template
 * literals, so a regex written in page script has its backslashes eaten by the outer literal and
 * arrives as a syntax error. That bug shipped three times in one afternoon. Server side, this is
 * ordinary code.
 */
// Agency values that are NOT a firm, and values that mean the client came to us DIRECTLY.
// ⭐ DIRECT IS AN ANSWER, NOT AN ABSENCE -- the same ruling as the `direct` flag on a quote.
// "Niels Direct" does not name an agency but it DOES say how the client arrived, and lumping it in
// with "we have no idea" would both understate what we know and invent a firm called Niels Direct.
const NOT_A_FIRM = new Set(['(no agency folder)', '(loose file - no agency folder)', '(not stated)',
  '', 'no brokers', 'no broker', 'existing client', 'independent', 'independent broker',
  'unknown', 'none', 'aby']);
const DIRECT_MARKERS = new Set(['direct', 'niels', 'eric', 'niels direct', 'eric direct']);

// A DASH IS NOT ONE CHARACTER, AND THE LOOKUP BELOW IS EXACT.
// Measured on live D1, 2026-08-24: 42 quotes carry the agency name
//     (loose file <en dash> no agency folder)
// with U+2013, while NOT_A_FIRM spells it with U+002D. So a value that IS in the not-a-firm list
// missed it by one character, and those 42 quotes have been counted as though a firm by that name
// had asked us for something. An enumerated value spelled differently is invisible: nothing throws,
// nothing is empty, the row simply appears in a population it does not belong to.
// Every one of these names came out of a FOLDER TITLE typed by a human on Windows, where Word and
// the shell both produce an en dash from a hyphen surrounded by spaces -- so this will keep
// happening, and matching the class beats adding the one spelling that bit us.
// U+2010 to U+2015 are the dash punctuation block; U+2212 is the mathematical minus, which some
// spreadsheet exports use.
function foldDashes(s) {
  return String(s == null ? '' : s).replace(/[\u2010-\u2015\u2212]/g, '-');
}

function cleanAgency(a) {
  const t = foldDashes(a).trim(), low = t.toLowerCase();
  if (DIRECT_MARKERS.has(low)) return '(direct)';
  return NOT_A_FIRM.has(low) ? '' : t;
}

function normName(s) {
  return String(s == null ? '' : s)
    .toLowerCase().trim()
    .replace(/&/g, ' and ')
    // TYPOGRAPHIC QUOTES FOLD TO STRAIGHT ONES. Every client list in this system arrives from
    // Word or from a screenshot of a shared drive, and both produce U+2019 -- so "Gosdin's Dozer
    // Service" on a folder and "Gosdin’s Dozer Service" on a quote kept the curly character
    // INSIDE the key and never matched. Six employers were affected when this was measured.
    // ⛔ It does NOT fold an apostrophe that is simply ABSENT: "Bone Daddys" and "Bone
    // Daddy's" stay apart, because that is a spelling difference and merging it is a guess.
    // ⚠ The backslash was in the Python twin's character class and not in this one. A
    // divergence in a pair of functions that MUST agree is exactly what the parity check exists
    // to catch, and it had never been exercised on a name containing one.
    .replace(/[.,/\'"‘’“”]+/g, ' ')
    .replace(/\b(inc|llc|ltd|lp|llp|pa|plc|pllc|co|corp|corporation|company|group|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ABY's CLIENT list, joined to the quotes and sales that mention the same employer.
 *
 * THE JOIN IS SHOWN, NEVER MERGED, AND THAT IS THE WHOLE DESIGN. Measured 2026-08-22: only 12
 * percent of ABY's recorded sales appear in the client folder list, and neither termination nor
 * a setup-and-invoice lag explains that gap (a lag predicts a gradient by age; the miss rate is
 * flat at 75 to 100 percent across fifteen months). Until somebody can say what the folder list
 * is actually a list of, writing "not a client" onto 359 sold groups would be asserting
 * something nobody knows.
 *
 * So this endpoint answers three separate questions and keeps them separate:
 *   - clients we have, and whether we ever quoted them
 *   - sales with no client folder    -- the unexplained 359
 *   - quoted employers with no client folder and no sale
 */
async function handleAdminClients(request, env) {
  const out = { totals: {}, rows: [], orphanSales: [], unavailable: {} };
  const attempt = async (name, run) => {
    try { return await run(); }
    catch (err) { out.unavailable[name] = String(err && err.message || err); return null; }
  };

  const c = await attempt('clients', () => env.DB.prepare(
    // COLLATE NOCASE, and it is not cosmetic. SQLite's default is BINARY, which sorts every
    // capital letter before every lower-case one -- so ACT, AFV, AMP, ATTCCC, AVAD, AVODAH and
    // AXISCADES all landed ABOVE "Abba Staffing". Measured on the rendered page: 386 of 400 rows
    // were out of the order a human reads. The shared-drive folder list this is loaded from sorts
    // case-insensitively, so the screen disagreed with the thing it is a copy of, and somebody
    // looking for a client would conclude it was missing.
    "SELECT id, name, match_key, status, source, note, original_broker, current_broker, " +
    "       effective_date, effective_date_is_estimate, term_date, products " +
    "FROM aby_clients ORDER BY name COLLATE NOCASE").all());
  const q = await attempt('quotes', () => env.DB.prepare(
    "SELECT quote_number, client_name, created_at, status, broker_agency, broker_name " +
    "FROM quotes WHERE client_name IS NOT NULL AND trim(client_name) <> ''").all());
  // The acquisition tree, so an employer quoted by MMA and again by MHBT is not reported as
  // "contested". MHBT IS MMA -- Marsh acquired it in 2015 -- and a client quoted under both names
  // before and after a rename is the single most ordinary thing in an acquired book.
  const fam = await attempt('agencies', () => env.DB.prepare(
    "SELECT a.name, pa.name AS parent FROM agencies a " +
    "LEFT JOIN agencies pa ON pa.id = a.parent_id").all());
  const s = await attempt('sales', () => env.DB.prepare(
    "SELECT employer, products, announced_at, agency FROM aby_sales " +
    "WHERE employer IS NOT NULL AND trim(employer) <> ''").all());

  const clients = (c && c.results) || [];
  const quotes  = (q && q.results) || [];
  const sales   = (s && s.results) || [];

  // agency name -> the family it belongs to. An unparented agency is its own family.
  const famOf = new Map();
  for (const r of ((fam && fam.results) || [])) {
    if (r.name) famOf.set(r.name.trim().toLowerCase(), (r.parent || r.name).trim());
  }
  const rootOf = (a) => famOf.get(String(a || '').trim().toLowerCase()) || a;

  const qBy = new Map(), sBy = new Map();
  for (const r of quotes) {
    const k = normName(r.client_name);
    if (!qBy.has(k)) qBy.set(k, []);
    qBy.get(k).push(r);
  }
  for (const r of sales) {
    const k = normName(r.employer);
    if (!sBy.has(k)) sBy.set(k, []);
    sBy.get(k).push(r);
  }

  const seen = new Set();
  for (const cl of clients) {
    // match_key is stored, but fall back to computing it so a row written by some future
    // importer that forgot the column still joins instead of silently showing zero.
    const k = cl.match_key || normName(cl.name);
    seen.add(k);
    const qs = qBy.get(k) || [];
    const ss = sBy.get(k) || [];
    qs.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    // THREE SOURCES OF ATTRIBUTION, IN ORDER OF DIRECTNESS:
    //   1. a sale record states the agency outright -- but only back to late May 2025
    //   2. a QUOTE that matches this client names one -- and those reach back to 2008
    //   3. nothing at all, which is the number worth knowing
    // ⭐ COMPARED BY FAMILY, DISPLAYED BY NAME. "USI / MMA / MHBT" is two firms, not three, and
    // calling it three would inflate the contested count with the most ordinary event in an
    // acquired book. The names are still shown in full, because which NAME quoted is real history.
    const qNames = [...new Set(qs.map((r) => cleanAgency(r.broker_agency)))].filter(Boolean);
    const qFamilies = [...new Set(qNames.map(rootOf))];
    const qAgencies = qFamilies.length <= 1 ? qFamilies : qNames;
    const saleAgency = ss.map((r) => cleanAgency(r.agency)).filter(Boolean)[0] || '';
    const attrib = saleAgency
      ? { src: 'sale', label: saleAgency, all: [saleAgency], firms: 1 }
      : qFamilies.length === 1
        // The family is the answer; the label names it, even if several of its names quoted.
        ? { src: 'quote', label: qNames.length > 1 ? qNames.join(' / ') : qFamilies[0],
            all: qNames, firms: 1 }
        : qFamilies.length > 1
          // ⛔ NEVER pick one. Two brokers competing on a single account is a real case here --
          // Authers Building Group and Gemmy Industries are both on record -- so the screen shows
          // every agency that quoted and says the attribution is a judgement.
          ? { src: 'contested', label: qAgencies.join(' / '), all: qAgencies,
              firms: qFamilies.length }
          : { src: 'none', label: '', all: [], firms: 0 };

    out.rows.push({
      id: cl.id,
      name: cl.name,
      status: cl.status,
      note: cl.note || '',
      termDate: String(cl.term_date || '').slice(0, 10),
      // WHEN THEY STARTED, WHERE WE CAN SAY. Eric, 2026-08-22: an estimate is "fine... It's better
      // to have something than nothing." ⛔ BUT IT MUST SAY THAT IT IS ONE. The date comes from the
      // ORIGINATING quote -- most of them recorded only "Aug 2025 or later", which is a month, not
      // a day. Rendering that as a plain 1 August would assert a precision nobody has.
      started: String(cl.effective_date || '').slice(0, 10),
      startedIsEstimate: cl.effective_date_is_estimate === 1,
      // ONLY a note that SAYS so means two folders. This read "if there is a note at all", which
      // was true while the sole note-writer was the duplicate-folder importer -- and then 977
      // termed clients arrived carrying a provenance note, and every one of them claimed a
      // duplicate folder it does not have. A flag inferred from a field's EMPTINESS breaks the
      // moment anything else writes that field.
      twoFolders: /also filed as/i.test(cl.note || ''),
      quotes: qs.length,
      pending: qs.filter((r) => r.status === 'P').length,
      sold: qs.filter((r) => r.status === 'S').length,
      lastQuote: qs.length ? String(qs[0].created_at || '').slice(0, 10) : '',
      // WHO IS RESPONSIBLE FOR THIS CLIENT. Eric, 2026-08-22: "current groups and termed groups
      // are still sales... we have quotes with agency info dating back several years, and some of
      // those quotes must match either the termed groups or the currently active groups... so we
      // could know which agencies are responsible for which sales and see how many we're missing
      // agency/agent info on."
      // ⛔ EVERY CLIENT IS A SALE. `aby_sales` is 15 months of announcement emails, not the book --
      // so attributing only from it discards every agency relationship older than a year.
      // 🔴 THIS CELL USED TO READ `qs[0].broker_agency`, which silently handed a contested account
      // to whichever quote happened to sort first. 46 clients were quoted by MORE THAN ONE agency,
      // and that is a real case in this book (two brokers competing), not a data fault.
      agency: attrib.label,
      agencies: attrib.all,
      // ⭐ THE BADGE COUNTS FIRMS, THE LABEL LISTS NAMES. "USI / MMA / MHBT" is three names and
      // TWO firms; a badge reading "3 agencies" over an acquisition would overstate the conflict.
      firmCount: attrib.firms,
      attribution: attrib.src,
      sales: ss.length,
      soldProducts: ss.map((r) => r.products).filter(Boolean).join('; ').slice(0, 120),
      // The row Eric can act on: an active client whose quote nobody ever dispositioned.
      pendingButActive: cl.status === 'active' && qs.some((r) => r.status === 'P'),
    });
  }

  // Sales whose employer has no client folder. NOT called "termed" -- see the header.
  for (const [k, rows] of sBy) {
    if (seen.has(k)) continue;
    out.orphanSales.push({
      employer: rows[0].employer,
      products: rows.map((r) => r.products).filter(Boolean).join('; ').slice(0, 120),
      announced: String(rows[0].announced_at || '').slice(0, 10),
      agency: rows[0].agency || '',
      quotes: (qBy.get(k) || []).length,
    });
  }
  out.orphanSales.sort((a, b) => String(b.announced).localeCompare(String(a.announced)));

  const quotedKeys = new Set(qBy.keys());
  out.totals = {
    clients: clients.length,
    clientsActive: clients.filter((r) => r.status === 'active').length,
    clientsTermed: clients.filter((r) => r.status === 'termed').length,
    termedWithDate: clients.filter((r) => r.status === 'termed' && r.term_date).length,
    quotes: quotes.length,
    sales: sales.length,
    clientsQuoted: out.rows.filter((r) => r.quotes > 0).length,
    clientsNeverQuoted: out.rows.filter((r) => r.quotes === 0).length,
    pendingButActive: out.rows.filter((r) => r.pendingButActive).length,
    pendingQuotesOnActive: out.rows.reduce((n, r) => n + (r.status === 'active' ? r.pending : 0), 0),
    salesWithNoClient: out.orphanSales.length,
    salesMatchedToClient: sales.length - out.orphanSales.length,
    // How much of the BOOK we can put a name to. This is the question Eric asked and nothing
    // answered it before: `aby_sales` covers 15 months, so counting only from there implied we
    // knew almost nothing about who brought our clients.
    clientsAttributed: out.rows.filter((r) => r.attribution !== 'none').length,
    clientsUnattributed: out.rows.filter((r) => r.attribution === 'none').length,
    clientsFromQuoteOnly: out.rows.filter((r) => r.attribution === 'quote').length,
    clientsContested: out.rows.filter((r) => r.attribution === 'contested').length,
    orphanSalesQuoted: out.orphanSales.filter((r) => r.quotes > 0).length,
    quotedNotAClient: [...quotedKeys].filter((k) => !seen.has(k)).length,
  };
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

// 🔴 THE PIPELINE PAGE WAS DELETED HERE ON 2026-08-26 (F-408). Eric: "Yes I think we should kill
// the pipeline page."
//
// ⭐⭐ IT WAS RETIRED BECAUSE EVERYTHING ON IT NOW LIVES SOMEWHERE BETTER, not because it was
// unloved. It carried three things and each had a successor:
//   - "Log a quote"      -> the QUOTE LOG, where the other 6,170 quotes are. Moved, not rebuilt.
//   - "Add prospects"    -> the Marketing view's "Add a list from an event", which is strictly
//                           better: it identifies a person by name AND firm when there is no
//                           email, ADOPTS an address that arrives later, tags, and de-duplicates.
//                           The old box demanded an email and wrote into `brokers`.
//   - "Everyone we track" -> the Marketing view, whose "Never quoted" filter IS this page's
//                           `prospect` status, alongside priority, owner, tags and bulk apply.
//
// ⛔ /admin/pipeline STILL ANSWERS -- it redirects. Old links, bookmarks and the guide must not
// break, which is the same rule the dashboard follows for ?view=calendar.
// 🔬 check_reachable.mjs asserts the redirect and asserts the Marketing view still carries all
// three successors. A merge is a REMOVAL, and the failure mode of a removal is SILENCE.

// ─── ABY admin sub-pages (Eric, 2026-08-18) ────────────────────────────────────
//
// ⭐ SEPARATE PAGES RATHER THAN MORE TABS ON `adminHTML()`. That function is the quote log, it
// works, and it is long. New capability goes beside it so a mistake here cannot take the log down.
//
// ── WHY THE STATUS CELL NO LONGER PRINTS A SECOND LINE WHEN NOTHING IS RECORDED (2026-08-26) ──
//
// It printed the words under EVERY row, and that was true of every row: measured on production,
// 0 of 665 firms carried a recorded status and 0 status events had ever been written. Eric asked
// "what is [it] for?", which is the question a label identical on all 665 rows always provokes.
//
// ⛔ THE COMMENT THAT USED TO SIT IN THAT BRANCH ARGUED THE OPPOSITE, and it is worth saying why
// it was wrong rather than just deleting it. It said the two states -- nothing recorded, versus
// recorded and unchanged -- would look identical if this said nothing. They are different facts,
// but they never looked identical: the recorded-and-unchanged branch prints "same since <date>".
// Silence against a dated sentence already tells them apart. The label was defending a distinction
// the other branch was already making, and charging every row a line of height for it.
//
// ⭐ THE PAGE'S OWN RULE ALREADY SAID SO, two screens further down: "A column where every row
// looks the same is a column nobody reads." The rule was here; this cell was what broke it.
//
// ⚠️ AND THE REASON THIS PARAGRAPH IS OUT HERE RATHER THAN BESIDE THE CODE: everything between the
// backticks below is SHIPPED TO THE BROWSER, comments included. Written in place, it added
// fourteen lines to every load of this page -- and it put the retired phrase back into the emitted
// HTML, where check_admin_render.mjs correctly failed on it. A long explanation belongs outside
// the template literal; a pointer belongs inside it.
function adminBrokersHTML() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Brokers &amp; Agencies — ABY admin</title>
<style> *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}
${ADMIN_HEADER_CSS}
 main{max-width:1180px;margin:22px auto;padding:0 18px}
 .card{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:20px;margin-bottom:18px}
 h2{font-size:16px;margin:0 0 4px} .sub{color:#5b6b7f;font-size:13px;margin:0 0 14px}
 table{width:100%;border-collapse:collapse;font-size:14px}
 th{text-align:left;font-size:12px;text-transform:uppercase;color:#5b6b7f;border-bottom:1px solid #dfe5ec;padding:8px 6px}
 th.srt{cursor:pointer;user-select:none}
 th.srt:hover{color:#1a5c3a;background:#eef2f7}
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
 /* Eric, 2026-08-22: "the agency name has way too much space and all the other info is crammed
    into tiny columns... for the number counts maybe center them in their column under a centered
    heading", and on Quotes by agency "the agents number [is] way to the right".
    CAUSE: these tables declared no column widths, so the browser gave the long free-text column
    everything it asked for and squeezed the rest. The right-align class then pushed each number to
    the far edge of its own narrow column, parking it against the next column -- which is why a
    count ended up sitting beside a date it has nothing to do with.
    FIX: fixed layout with a declared colgroup, and counts CENTRED under centred headings, so a
    number sits in the middle of its own space instead of on a boundary. */
 table.grid{table-layout:fixed;width:100%}
 table.grid td,table.grid th{overflow:hidden;text-overflow:ellipsis}
 table.grid td.wrapcell{white-space:normal;overflow-wrap:anywhere;text-overflow:clip}
 .c{text-align:center;font-variant-numeric:tabular-nums}
 th.c{text-align:center}
 .filters{display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap}
 .filters button{background:#fff;border:1px solid #c8d2de;border-radius:6px;padding:7px 13px;cursor:pointer;font-size:14px}
 .filters button.on{background:#1a5c3a;color:#fff;border-color:#1a5c3a}
 select{padding:5px 7px;border:1px solid #c8d2de;border-radius:5px;font-size:13px}
 a.dl{display:inline-block;background:#1a5c3a;color:#fff;padding:8px 15px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600}
 .views{display:flex;gap:0;align-items:center;margin:0 0 14px}
 .views button{background:#fff;border:1px solid #c8d2de;padding:8px 20px;cursor:pointer;font-size:14px;font-weight:600;color:#5b6b7f}
 .views button:first-of-type{border-radius:7px 0 0 7px}
 .views button:nth-of-type(2){border-radius:0 7px 7px 0;border-left:0}
 .views button.on{background:#1a5c3a;color:#fff;border-color:#1a5c3a}
 .vhint{margin-left:14px;color:#8a97a8;font-size:13px}
 .mfilters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 14px}
 /* THE A-Z BAR. Eric, 2026-08-26: "with so many letters, it takes a long time to scroll."
    It FILTERS rather than scrolling to an anchor, and that is the better answer to what he asked
    for: the list is capped at 150 rows by default, so an anchor for S would point at a row that
    has not been rendered. Filtering to one letter also puts the firm at the TOP of the screen
    instead of somewhere in the middle of a long page.
    A letter with no firms is DIMMED, never hidden -- a bar whose letters move around as you
    filter is harder to hit than the scrollbar it replaces. */
 /* THE FIRM CELL. One block per row so a wrapped name lines up with its own first line. */
 .firmcell{line-height:1.35}
 .site{font-size:12.5px;color:#1a5c3a;text-decoration:none;margin-left:4px}
 .site:hover{text-decoration:underline}
 /* ⛔ NOT UNDERLINED. Eric: "since every single agency will open when clicked, do we really need
    them all underlined?" No -- when a whole column is links, underlining every one is noise on
    1,552 rows. Weight and colour carry the affordance; the underline arrives on hover. */
 .firmname{color:#12263f;font-weight:600;text-decoration:none}
 .firmname:hover{color:#1a5c3a;text-decoration:underline}
 .firmmeta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:2px}
 .branches{font-size:11.5px;color:#1a5c3a;background:#e8f4ec;border-radius:9px;padding:1px 7px;font-weight:600}
 .firmmeta .muted{font-size:11.5px}
 .azbar{display:flex;flex-wrap:wrap;gap:2px;margin:0 0 12px;align-items:center}
 .azbar button{border:1px solid transparent;background:none;border-radius:5px;cursor:pointer;
               font:600 12.5px ui-monospace,Consolas,monospace;color:#2f6f4f;padding:3px 7px;min-width:24px}
 .azbar button:hover{background:#eef2f7;border-color:#c8d2de}
 .azbar button.on{background:#1a5c3a;border-color:#1a5c3a;color:#fff}
 .azbar button.off{color:#c3ccc6;cursor:default;background:none;border-color:transparent}
 .azbar .all{font-family:inherit;font-size:12.5px;min-width:0;margin-right:4px}
 .bulk{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#eef5f0;border:1px solid #cfe0d5;border-radius:8px;padding:10px 13px;margin:0 0 14px}
 .bulk input{padding:6px 9px;border:1px solid #c8d2de;border-radius:5px;font-size:13px}
 .bulk button{background:#fff;border:1px solid #c8d2de;border-radius:6px;padding:6px 13px;cursor:pointer;font-size:13px}
 .bulk button.go{background:#1a5c3a;color:#fff;border-color:#1a5c3a;font-weight:600}
 .tag{display:inline-block;background:#eef2f7;border-radius:11px;padding:1px 9px;margin:1px 3px 1px 0;font-size:12px;color:#3d5166}
 .pri{font-weight:700} .pri.A{color:#1a5c3a} .pri.B{color:#8a6d1f} .pri.C{color:#8a97a8}
 .never{color:#8a97a8;font-style:italic}
 .rev{background:#fdf1e0;color:#7a5410;border-radius:4px;padding:0 5px;font-size:11px;margin-left:5px}
</style></head><body>
${abyAdminNav('/admin/brokers')}
<main>
  <div id="warn" style="display:none;background:#fdecec;color:#a12622;border:1px solid #f3c2c2;border-radius:8px;padding:10px 13px;margin:0 0 16px;font-size:13.5px"></div>
  <!-- THE VIEW TOGGLE (F-383). Eric, 2026-08-23: one page, two views.
       PERFORMANCE answers "who has done what" and is built FROM the quote log, so a firm that
       has never quoted cannot appear on it -- correct for an analysis, useless for prospecting.
       MARKETING answers "who are we working" and is built from the AGENCY records instead, so
       it shows every firm and hides the ones that no longer exist.
       The two labels live in CRM_VIEWS in worker.js, so renaming one is a single edit. -->
  <div class="views">
    <button id="vPerf" class="on" onclick="setView('performance')">Performance</button>
    <button id="vMkt" onclick="setView('marketing')">Marketing</button>
    <span class="vhint" id="viewHint"></span>
  </div>
  <div class="filters">
    <!-- Eric, 2026-08-22: "a filter where we could choose to see number of quotes/sales since a
         specific date? Like 1/1/26, last 12 months, 1/1/25 for example." The named ranges are his,
         and the worker only ever receives a resolved ISO date -- the vocabulary lives here. -->
    <span class="muted" style="font-size:13px">Since:</span>
    <select id="fSince" style="margin-right:14px">
      <option value="">All time</option>
      <option value="ytd">This year (1 Jan 2026)</option>
      <option value="12m">Last 12 months</option>
      <option value="2025">Since 1 Jan 2025</option>
      <option value="2024">Since 1 Jan 2024</option>
    </select>
    <span class="muted" style="font-size:13px">Show:</span>
    <button data-rep="" class="on">Everyone</button>
    <button data-rep="eric">Eric</button>
    <button data-rep="niels">Niels</button>
    <!-- Up for grabs. The point of marking an agency "open" is being able to pull the list back
         out afterwards, so the filter ships with the value rather than after it. -->
    <button data-rep="open">Open</button>
    <span class="muted" id="totals" style="margin-left:auto;font-size:13px"></span>
  </div>
  <!-- Shown only when a section could not be read. See the note beside statsPerBlock: a page that
       renders blank on a database error is indistinguishable from one with no data. -->
  <div id="statsWarn" style="display:none;margin:0 0 14px;padding:10px 14px;border-radius:7px;
       background:#fdf1e0;border:1px solid #f0d9ae;color:#7a5410;font-size:13px"></div>
  <div id="perfView">
  <div class="card"><h2>Insights</h2>
    <p class="sub">Derived from the tables below, so nothing here can disagree with them.</p>
    <div id="insights"><p class="muted">Loading...</p></div></div>
  <div class="card"><h2>Quotes by agency</h2>
    <p class="sub">Counted from every quote ever run, including from people who never made an account.</p>
    <div id="byAgency"><p class="muted">Loading...</p></div></div>
  <div class="card"><h2>Quotes by agent</h2>
    <p class="sub" id="agentNote"></p>
    <div id="byAgent"><p class="muted">Loading...</p></div></div>
<div class="card"><h2>Quotes by status</h2>
    <p class="sub">2026 onward only &mdash; the back-catalog is counted by year further down. Value is the first year of a quote: setup, plan documents, annual fees and twelve months of any monthly fee.</p>
    <div id="byStatus"><p class="muted">Loading...</p></div></div>
  <div class="card"><h2>Open quotes, by age</h2>
    <p class="sub">Pending and in-process quotes only &mdash; a sold or dead quote is not waiting on
      anybody &mdash; and 2026 onward only. The back-catalog is below.</p>
    <div id="aging"><p class="muted">Loading...</p></div></div>
  <div class="card"><h2>Agencies that have fallen off</h2>
    <p class="sub">Sent us five or more quotes at some point and nothing in the last 12 months.
      Worth a call. Not affected by the Since filter &mdash; the question is about the whole
      history by definition.</p>
    <div id="dormant"><p class="muted">Loading...</p></div></div>
  <div class="card"><h2>Historic quotes, by year</h2>
    <p class="sub">Everything before 2026, newest first. Aging buckets say nothing across fifteen
      years; a year count does.</p>
    <div id="historic"><p class="muted">Loading...</p></div></div>
  <div class="card"><h2>Registered brokers</h2>
    <p class="sub">Everyone with an ABY account. Assign each one to whoever owns the relationship.</p>
    <div id="brokers"><p class="muted">Loading...</p></div></div>
  </div>

  <div id="mktView" style="display:none">
    <div class="card">
      <h2 style="cursor:default">Marketing</h2>
      <p class="sub" id="mktSub">Every firm we could work &mdash; including the ones that have never quoted.</p>
      <!-- ADD A LIST FROM AN EVENT (Eric, 2026-08-23). Shut by default: it is an occasional
           action and the list is the everyday one. -->
      <!-- TIDY UP. Shut by default: it is an occasional job and the list is the everyday thing.
           Loaded when it is opened, not with the page -- the same rule the analysis view now
           follows, because nobody should pay for a screen they are not looking at. -->
      <details style="margin:0 0 10px" ontoggle="if(this.open)loadDupes()">
        <summary style="cursor:pointer;font-size:13.5px;color:#1a5c3a;font-weight:600">
          Tidy up &mdash; rows that look like the same firm twice</summary>
        <div style="margin-top:10px">
          <div id="tidyMsg" class="muted" style="margin-bottom:8px"></div>
          <div id="tidyBox"><p class="muted">Looking...</p></div>
        </div>
      </details>
      <!-- WHO HAS NEVER ASKED US FOR THIS. Eric, 2026-08-22: the admin is for quoting, keeping up
           with quotes, AND targeting marketing. This is the one screen that turns the agency
           cleanup into calls. Shut by default and loaded when opened, like the rest. -->
      <details style="margin:0 0 10px" ontoggle="if(this.open)loadNeverQuoted()">
        <summary style="cursor:pointer;font-size:13.5px;color:#1a5c3a;font-weight:600">
          Never quoted &mdash; firms that use us a lot and have never asked for one product</summary>
        <div style="margin-top:10px">
          <p class="sub" style="margin:0 0 8px">Established relationships that have never once had
            this on a quote. <strong>The floor matters:</strong> a firm that quoted twice and never
            asked for ACA has not turned it down, it has barely met us.</p>
          <div class="mfilters">
            <select id="nqProduct" onchange="loadNeverQuoted()"><option value="">Pick a product</option></select>
            <label class="muted" style="font-size:13px">at least
              <input id="nqMin" type="number" min="1" max="500" value="15" onchange="loadNeverQuoted()"
                     style="width:64px;padding:5px 6px;border:1px solid #c8d2de;border-radius:5px;font-size:13px">
              quotes</label>
            <span class="muted" id="nqCount" style="margin-left:auto;font-size:13px"></span>
          </div>
          <div id="nqBox"><p class="muted">Pick a product.</p></div>
        </div>
      </details>
      <details style="margin:0 0 14px">
        <summary style="cursor:pointer;font-size:13.5px;color:#1a5c3a;font-weight:600">
          Add a list from an event</summary>
        <div style="margin-top:10px">
          <p class="sub" style="margin:0 0 8px">Paste rows straight out of a spreadsheet &mdash;
            name, firm, email, phone, in any order. <strong>An email is not required:</strong> a
            person is identified by their email when there is one, and otherwise by their name and
            firm together, so a phone-only contact can go in now and gain an address later.
            <strong>Anybody we already know is recognized and tagged, not duplicated</strong>
            &mdash; including when the address arrives for somebody already on the list by name.</p>
          <textarea id="importBox" oninput="previewList()" rows="5"
            placeholder="Jane Smith&#9;Acme Benefits&#9;jane@acme.com&#9;(214) 555-0134"
            style="width:100%;padding:9px;border:1px solid #c8d2de;border-radius:6px;font:13px ui-monospace,Consolas,monospace"></textarea>
          <div class="mfilters" style="margin-top:10px">
            <input id="importTag" list="tagList" placeholder="Tag them all (e.g. Tulsa CE class)">
            <input id="importDate" type="date">
            <button class="go" onclick="runImport()"
              style="background:#1a5c3a;color:#fff;border:1px solid #1a5c3a;border-radius:6px;padding:7px 15px;cursor:pointer;font-weight:600">
              Add them</button>
            <span class="muted" id="importMsg"></span>
          </div>
          <div id="importPreview"></div>
        </div>
      </details>
      <div class="mfilters">
        <select id="mQuoted" onchange="loadMkt()">
          <option value="">All firms</option>
          <option value="no">Never quoted</option>
          <option value="yes">Has quoted</option>
        </select>
        <select id="mPriority" onchange="loadMkt()">
          <option value="">Any priority</option>
          <option value="A">A</option><option value="B">B</option><option value="C">C</option>
        </select>
        <select id="mRep" onchange="loadMkt()">
          <option value="">Any owner</option>
          <option value="eric">Eric</option>
          <option value="niels">Niels</option>
          <option value="open">Open</option>
        </select>
        <!-- ⭐ THE STATE FILTER WAS ALREADY WIRED SERVER-SIDE AND HAD NO CONTROL. handleCrmAgencies
             has accepted ?state= since it was written; nothing on any screen ever sent one.
             Eric: "I do want to have a way to assign state to agencies and using that as a filter
             ... I mainly want it for the ones that have never quoted with us." -->
        <select id="mState" onchange="loadMkt()"><option value="">Any state</option></select>
        <!-- ⛔ DEFAULTS TO THE WORKING LIST. A list that opens showing firms somebody has already
             taken off it is the reason they were taken off it. -->
        <select id="mDisp" onchange="loadMkt()">
          <option value="">On the list</option>
          <option value="any">Taken off the list</option>
          <option value="out_of_business">&mdash; out of business</option>
          <option value="no_group_products">&mdash; no group products</option>
          <option value="not_interested">&mdash; told us no</option>
          <option value="left_the_firm">&mdash; no longer at this firm</option>
          <option value="wrong_record">&mdash; not a real firm</option>
          <option value="all">Everything</option>
        </select>
        <select id="mTag" onchange="loadMkt()"><option value="">Any tag</option></select>
        <input id="mFind" placeholder="Find a firm, city or state" oninput="paintMkt()"
               style="padding:5px 8px;border:1px solid #c8d2de;border-radius:5px;font-size:13px">
        <span class="muted" id="mCount" style="margin-left:auto;font-size:13px"></span>
      </div>
      <!-- BULK APPLY. Eric: tick the rows, pick a tag, set a date, apply.
           The date defaults to today and can be set to any PAST day, because the useful date is
           when the thing happened, not when it was typed. -->
      <div class="bulk" id="bulkBar" style="display:none">
        <strong id="bulkN"></strong>
        <input id="bulkTag" list="tagList" placeholder="Tag (pick one, or type a new one)">
        <datalist id="tagList"></datalist>
        <input id="bulkDate" type="date">
        <button class="go" onclick="applyBulk()">Apply</button>
        <button onclick="clearSel()">Clear</button>
        <span class="muted" id="bulkMsg"></span>
      </div>
      <div class="azbar" id="azbar"></div>
      <div id="mkt"><p class="muted">Loading...</p></div>
    </div>
  </div>
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
 // The Since dropdown reloads the same way the rep buttons do -- one code path, so the two
 // filters cannot end up applying to different sets.
 (function(){ var e=document.getElementById('fSince'); if(e) e.onchange=load; })();
 // \u2b50\u2b50 FOUR VALUES, AND BLANK vs OPEN IS THE ONE THAT MATTERS. Eric, 2026-08-22: "we could look
 // at all the others and figure out whether they need to be assigned or we can put open on them
 // - where they're up for grabs."
 // \ud83d\udd34 BLANK MEANS NOBODY HAS LOOKED AT THIS YET. OPEN MEANS SOMEBODY LOOKED AND DECIDED IT IS
 // UP FOR GRABS. Those are different facts and collapsing them loses the whole audit: a list of
 // 600 blanks tells you nothing, while "570 open, 30 unreviewed" tells you where the work is.
 // \u26a0\ufe0f This is the same rule the platform already applies to a compliance answer -- null means
 // "not yet", never "no" -- and to a renewal cycle column. Do not default anything to 'open'.
 var REP_LABELS={'':'\u2014','eric':'Eric','niels':'Niels','open':'Open'};
 function repSelect(kind,id,cur){
   var o=['','eric','niels','open'].map(function(v){
     return '<option value="'+v+'"'+((cur||'')===v?' selected':'')+'>'+REP_LABELS[v]+'</option>';
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
 var CACHE={brokers:[],byAgency:[],byAgent:[],byFamily:[]}, FAM_BY_NAME={}, SORTS={}, OPEN_AG={}, NAMED_ONLY=true, paint=function(){};
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

 // The named ranges live HERE, not in the worker: the worker takes a resolved ISO date and
 // nothing else, so "last 12 months" cannot mean two different things on two screens.
 function sinceISO(){
   var v=(document.getElementById('fSince')||{}).value||'';
   var now=new Date();
   if(v==='ytd')  return now.getFullYear()+'-01-01';
   if(v==='2025') return '2025-01-01';
   if(v==='2024') return '2024-01-01';
   if(v==='12m'){
     var d=new Date(now.getTime()); d.setFullYear(d.getFullYear()-1);
     return d.toISOString().slice(0,10);
   }
   return '';
 }

 async function load(){
   PERF_LOADED = true;
   var parts=[];
   if(rep) parts.push('rep='+encodeURIComponent(rep));
   var sv=sinceISO(); if(sv) parts.push('since='+encodeURIComponent(sv));
   var q=parts.length?('?'+parts.join('&')):'';
   // ⭐ BOTH REQUESTS GO OUT TOGETHER. They ran one after the other, so the page waited on
   // the small brokers query BEFORE it even asked for the roll-up over every quote. Awaiting
   // them separately below keeps the progressive paint; what goes away is the dead time.
   var pBrokers = fetch('/api/admin/brokers'+q).then(function(r){return r.json()}).catch(function(){return{}});
   var pStats   = fetch('/api/admin/stats'+q).then(function(r){return r.json()}).catch(function(){return{}});
   var b=await pBrokers;
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

   var st=await pStats;
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
   // THE ORDER OF THESE TWO LINES IS LOAD-BEARING. byAgent used to be assigned 400 lines further
   // down, just before paintByAgent(). The agency rollup reads CACHE.byAgent to nest the named
   // agents under their agency -- so on the page you actually LAND on, that index was empty, and
   // Gallagher (nine named agents, no acquisitions) rendered no expand control at all. It only
   // appeared once some other action triggered a repaint, which made it look intermittent.
   // TRAPS #239 in this same file, one layer over: that entry is about HANDLERS wired only inside
   // paint(); this is the same failure about DATA. The first render is not a repaint.
   CACHE.byAgent=st.byAgent||[];
   CACHE.byFamily=st.byFamily||[];
   FAM_BY_NAME={}; (CACHE.byFamily||[]).forEach(function(f){ FAM_BY_NAME[f.family]=f; });
   CACHE.byAgency=st.byAgency||[];
   // Share-of-total uses st.totals.quotes, NOT the sum of the rows above.
   // Two reasons, both of which would give a wrong percentage: byAgency is LIMIT 1000,
   // and the SHOW: Eric / Niels filter applies to both, so the denominator has to be the
   // filtered one. When totals is missing (the degraded path) share prints a dash rather
   // than a number computed from whatever happened to load.
   CACHE.totalQuotes=(st.totals&&st.totals.quotes)||0;
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

 function pctOfTotal(n){
   var t=CACHE.totalQuotes; if(!t) return '-';
   var v=(Number(n||0)*100)/t;
   // A one-quote agency out of 1,751 is 0.06%, which rounds to 0.1% and reads as more than
   // it is. Show it as under a tenth instead of rounding it up.
   return (v>0&&v<0.1)?'<0.1%':(v.toFixed(1)+'%');
 }
 function paintByAgency(){
   var ag=sorted('byAgency',CACHE.byAgency,{
     agency:function(x){return String(x.agency_label||x.agency||'').toLowerCase()},
     n:function(x){return Number(x.n||0)},
     share:function(x){return Number(x.n||0)},
     sales:function(x){return Number(x.sales||0)},
     agents:function(x){return Number(x.agents||0)},
     last:function(x){return String(x.last_quote||'')}
   },'n');
   // THE ROLLUP. Eric, 2026-08-22: "when an agency is acquired, I think we should have their
   // quotes under the other agency in a drop down. For instance, MMA would have the MMA and MHBT
   // quote count combined in the big view, when you hit the drop down, you would see MMA and its
   // quote count and MHBT and its quote count."
   //
   // A child NEVER appears at the top level. Its quotes are added to the parent's headline and it
   // is listed inside the drop-down with its own count. The quotes themselves are untouched: a
   // 2013 quote still says MHBT, and this is a display-time grouping, never a rewrite.
   //
   // A PARENT MAY HAVE NO QUOTES OF ITS OWN. If somebody links a child to a firm that has never
   // quoted, the parent has no row here, so one is synthesised rather than letting the child
   // vanish from the table. A row that silently disappears is the worst outcome of a regrouping.
   var kids = {};
   ag.forEach(function(x){
     if (!x.parent_name) return;
     (kids[x.parent_name] = kids[x.parent_name] || []).push(x);
   });
   // The AGENTS we can name, indexed by the agency string on their quotes. Built from the same
   // cache the agent table uses, so the two can never disagree about who works where.
   var agentsBy = {};
   (CACHE.byAgent||[]).forEach(function(p){
     if (!(p.name || p.email)) return;          // an agency-keyed row is not a person
     var k = String(p.agency||'').trim();
     if (!k) return;
     (agentsBy[k] = agentsBy[k] || []).push(p);
   });
   // Every agent at an agency OR at any name beneath it. An agent filed under MHBT works for MMA
   // now, and making somebody look that up by hand is the same subtraction Eric objected to.
   function agentsFor(x){
     var names = [x.agency_label||x.agency||''];
     (kids[x.agency_label||x.agency]||[]).forEach(function(k){
       names.push(k.agency_label||k.agency||'');
     });
     var out = [];
     names.forEach(function(n){ (agentsBy[n]||[]).forEach(function(p){ out.push(p); }); });
     out.sort(function(a,b){ return Number(b.n||0)-Number(a.n||0); });
     return out;
   }

   var tops = ag.filter(function(x){ return !x.parent_name; });
   Object.keys(kids).forEach(function(pn){
     if (!tops.some(function(t){ return (t.agency_label||t.agency) === pn; })) {
       tops.push({ agency_label: pn, n: 0, sales: 0, agents: 0, last_quote: '', synthetic: true });
     }
   });
   function rolled(x){
     var own = Number(x.n||0);
     var k = kids[x.agency_label||x.agency] || [];
     return own + k.reduce(function(t,c){ return t+Number(c.n||0); }, 0);
   }
   // SALES ROLL UP TOO, and they have to, for the same reason quotes do.
   // 🔴 A sale is filed under the name that WROTE it -- Benefits Texas, not Patriot -- because
   // that is what happened; Patriot merely owns the book now. So a parent whose own name never
   // quoted (Patriot, Ghostly) has no sales of its own and read as a dash over a family holding
   // fifty of them. Quotes were already rolled; sales were not, and nothing said so.
   // ⭐ Unlike EMPLOYERS, sales are safe to add: a sale row belongs to exactly one agency, so
   // there is no double-count of the kind that forced conversion to be counted in SQL.
   function rolledField(x, field){
     var k = kids[x.agency_label||x.agency] || [];
     return Number(x[field]||0) + k.reduce(function(t,c){ return t+Number(c[field]||0); }, 0);
   }
   // Re-sort on the ROLLED total, or a parent sits below firms it now outranks.
   tops.sort(function(a,b){ return rolled(b)-rolled(a); });

   function agRow(x, child, ownRow){
     var kid = kids[x.agency_label||x.agency] || [];
     // ownRow is the PARENT listed inside its own drop-down, showing what it quoted under its own
     // bare name. Eric: "MMA has quoted over 700 just under the MMA name but we don't show that -
     // we have to subtract to get it."
     var tot = (child || ownRow) ? Number(x.n||0) : rolled(x);
     // THE CARET LIVES IN THE MARGIN. Eric: "I don't like the arrow to the left of the agencies
     // that have more than one - it looks funny. Unless you can put it in the margin instead so
     // the text lines up." It is absolutely positioned inside the cell's left padding, and EVERY
     // row reserves that padding, so a row with no caret starts at the same x as one with.
     // THE CARET MUST APPEAR FOR AGENTS TOO, NOT ONLY FOR CHILD AGENCIES.
     // Gallagher has NINE named agents and no acquisitions, so with the caret gated on child
     // agencies alone its agents were built, correct, and unreachable -- there was no control to
     // open them with. Same for USI, Crandall, Combined Benefits and Lifetime.
     var hasPeople = (!child && !ownRow) ? agentsFor(x).length > 0 : false;
     var caret = (!child && !ownRow && (kid.length || hasPeople))
       ? '<button type="button" class="agtog" data-ag="'+esc(x.agency_label||'')+'" '
         + 'style="position:absolute;left:4px;top:50%;transform:translateY(-50%);background:none;'
         + 'border:0;cursor:pointer;color:#2f6f4f;font-size:12px;line-height:1;padding:2px">'
         + (OPEN_AG[x.agency_label]?'\u25be':'\u25b8')+'</button>'
       : '';
     var tag = '';
     if (ownRow) {
       tag = ' <span class="muted" style="font-size:12px">under this name</span>';
     } else if (child) {
       // THREE RELATIONSHIPS, THREE CAPTIONS. This read the relationship as a yes/no and called
       // anything that was not an acquisition a division -- so a misspelling was labelled a branch
       // office, which is a claim about the business rather than about the data.
       tag = (x.relationship === 'succeeded')
         ? ' <span class="muted" style="font-size:12px">acquired</span>'
         : (x.relationship === 'alias')
           ? ' <span class="muted" style="font-size:12px">same firm, spelled differently</span>'
           : ' <span class="muted" style="font-size:12px">division</span>';
     } else if (kid.length) {
       // (N) = how many NAMES sit under this heading, counting this one. The headline beside it is
       // the COMBINED total, and this is the number that explains it.
       tag = ' <span class="muted" style="font-size:12px">('+(kid.length+1)+')</span>';
     }
     // ⛔ No badge when an agency has only AGENTS beneath it -- "(1)" would be explaining a
     // combined total that is not combined with anything, and the caret already says there is
     // something to open.
     // \u26d4 AN INFERRED SALE AND AN ANNOUNCED ONE ARE NOT THE SAME KIND OF FACT, so the cell says
     // how many of each. 553 sales were reconstructed on 2026-08-22 by matching a client to the
     // quote that originated it; they carry no announced date because no announcement exists.
     // A column that silently blended the two would make the reconstruction invisible the moment
     // anybody stopped remembering it had happened.
     // A child row and the parent's own row show themselves; a rolled-up parent shows the family.
     var salesN = (child || ownRow) ? Number(x.sales||0) : rolledField(x, 'sales');
     var inf = (child || ownRow) ? Number(x.sales_inferred||0)
                                 : rolledField(x, 'sales_inferred');
     var sales = salesN
       ? ('<strong>'+salesN+'</strong>'
           +(inf ? '<span class="muted" style="font-size:11.5px" title="'+inf+' of these were'
                 + ' reconstructed by matching a client to the quote that originated it. There is'
                 + ' no announcement email behind them, so they carry no announced date. The other '
                 + (salesN-inf)+' came from a real announcement.">'
                 + ' ('+inf+' inf.)</span>' : '')
           +(salesN>tot
           ? ' <span title="more sales than quotes on file" style="color:#a0574f">*</span>' : ''))
       : '\u2014';
     // CONVERSION AND RETENTION.
     //   A ROLLED-UP PARENT USES THE FAMILY FIGURE FROM SQL, not the sum of the rows below it:
     //   37 employers were quoted under two names in the same family, so summing would inflate
     //   the denominator and understate the rate. A child row, and the parent's OWN row, use
     //   their own numbers -- which is what those rows are for.
     var f = (child || ownRow) ? x : (FAM_BY_NAME[x.agency_label] || x);
     var emp = Number(f.employers||0), won = Number(f.won||0), kept = Number(f.kept||0);
     // ⛔ A PERCENTAGE OF A HANDFUL IS NOT A RATE. One win out of three employers is 33% and
     // means nothing; shown plainly it would sort and read exactly like a real 33%. Below the
     // threshold the fraction is shown instead of a percentage, so the reader sees the size.
     function rate(top, bottom, floor, tip){
       if (!bottom) return '<span class="muted">—</span>';
       var pc = Math.round(100*top/bottom);
       var body = (bottom < floor) ? (top+'/'+bottom) : (pc+'%');
       return '<span'+(bottom < floor ? ' class="muted"' : '')+' title="'+esc(tip)+'">'+body+'</span>';
     }
     var convCell = rate(won, emp, 10,
       won+' of '+emp+' employers quoted here are on our books (active or termed). '+
       'A FLOOR, not a rate: an employer we won may sit in a folder tree we have not seen.');
     var keptCell = rate(kept, won, 5,
       kept+' of the '+won+' we won are still active. Both sides of this one come from folder '+
       'lists, so it is the sturdier of the two figures.');
     var indent = (child || ownRow) ? 38 : 22;
     return '<tr'+((child||ownRow)?' style="background:#fafbfa"':'')+'>'
       + '<td class="wrapcell" style="position:relative;padding-left:'+indent+'px">'+caret
       + esc(x.agency_label||x.agency||'(no agency)')+tag+'</td>'
       + '<td class="c">'+tot+'</td>'
       + '<td class="c">'+pctOfTotal(tot)+'</td>'
       + '<td class="c">'+sales+'</td>'
       // CLIENTS, NOT QUOTES. Eric, 2026-08-22: "we could know which agencies are responsible for
       // which sales". This number was already being computed -- it is the numerator of the
       // conversion rate -- but it only ever appeared inside a tooltip, so the table showed how
       // BUSY an agency was and never how much of the book it actually brought.
       // ⚠️ An employer quoted by two different firms counts for both; 36 clients are contested.
       + '<td class="c">'+(won ? '<strong>'+won+'</strong>'
            + '<span class="muted" style="font-size:11.5px"> / '+kept+' now</span>'
            : '<span class="muted">—</span>')+'</td>'
       + '<td class="c">'+convCell+'</td><td class="c">'+keptCell+'</td>'
       + '<td class="c">'+(x.agents||0)+'</td>'
       + '<td class="date">'+(x.last_quote?day(x.last_quote):'\u2014')+'</td>'
       + '<td>'+(x.agency_id?repSelect('agency',x.agency_id,x.rep):'<span class="muted">\u2014</span>')+'</td></tr>';
   }

   var shown = capRows('byAgency', tops);
   document.getElementById('byAgency').innerHTML = tops.length
     ? '<table class="grid"><colgroup>'
       + '<col style="width:23%"><col style="width:6%"><col style="width:6%">'
       + '<col style="width:6%"><col style="width:11%"><col style="width:9%">'
       + '<col style="width:8%"><col style="width:5%"><col style="width:11%">'
       + '<col style="width:15%">'
       + '</colgroup><thead><tr>'+hc('byAgency','agency','Agency')+hc('byAgency','n','Quotes','c')
       +hc('byAgency','share','Share','c')
       +hc('byAgency','sales','Sales','c')
       +'<th class="c" title="Clients on our books that this agency brought us — counted '
       +'from the whole history, by matching each client against the quotes. The second number is '
       +'how many are still active. Every client is a sale; the sales list only covers the last '
       +'fifteen months, so counting from there alone would miss most of this.">Clients</th>'
       +'<th class="c" title="Employers this agency quoted that are on our books, active or '
       +'termed. Counts each EMPLOYER once however many times they were quoted, and ignores the '
       +'quote status column entirely -- nothing in the back-book was ever dispositioned.">'
       +'Converted</th>'
       +'<th class="c" title="Of the employers we won here, how many are still active rather '
       +'than termed.">Still with us</th>'
       +hc('byAgency','agents','Agents','c')+hc('byAgency','last','Last quote')
       +'<th>Owner</th></tr></thead><tbody>'
       + shown.map(function(x){
           var out = agRow(x, false, false);
           if (OPEN_AG[x.agency_label]) {
             // The parent's OWN quotes come first, so the combined headline above is the sum of
             // the rows below it and nobody has to subtract to find out what MMA itself did.
             // A synthesised parent has no quotes of its own and contributes no row.
             if (Number(x.n||0) > 0 && (kids[x.agency_label]||[]).length) {
               out += agRow(x, false, true);
             }
             var list = (kids[x.agency_label]||[]).slice();
             list.sort(function(a,b){ return Number(b.n||0)-Number(a.n||0); });
             out += list.map(function(k){ return agRow(k, true, false); }).join('');
             // Then the people. ⚠️ These counts are a SUBSET of the agency total and are labelled
             // so, because most quotes carry no individual at all -- a reader who tried to add
             // them up would find a hole and think something was missing.
             var ppl = agentsFor(x);
             if (ppl.length) {
               out += '<tr style="background:#f4f7f5"><td colspan="10" style="padding:6px 22px;'
                 + 'font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:#6b7b72">'
                 + 'Agents we can name here &mdash; ' + ppl.length
                 + ' of the ' + (x.agents||0) + ' who have quoted</td></tr>';
               out += ppl.map(function(p){
                 return '<tr style="background:#f9fbfa">'
                   + '<td class="wrapcell" style="padding-left:54px">'
                   + esc(p.name || p.email || '(unnamed)')
                   + (p.email ? ' <span class="muted" style="font-size:11.5px">'+esc(p.email)+'</span>' : '')
                   + '</td>'
                   + '<td class="c">'+Number(p.n||0)+'</td>'
                   + '<td class="c"><span class="muted">&mdash;</span></td>'
                   // ⭐ THE AGENT'S OWN SOLD GROUPS. This used to be a dash on the grounds that a
                   // client folder records the AGENCY and never the person -- true, but the QUOTE
                   // records the person, and pairing the client back to the quote that originated
                   // it recovers the name. That is exactly what Eric asked for.
                   // ⚠️ Only where somebody typed the broker's name on the quote.
                   + '<td class="c">'+(Number(p.sold||0)
                        ? '<strong>'+Number(p.sold)+'</strong>'
                          + '<span class="muted" style="font-size:11.5px"> / '
                          + Number(p.sold_active||0)+' now</span>'
                        : '<span class="muted">&mdash;</span>')+'</td>'
                   + '<td class="c"><span class="muted">&mdash;</span></td>'
                   + '<td class="c"><span class="muted">&mdash;</span></td>'
                   + '<td class="c"><span class="muted">&mdash;</span></td>'
                   + '<td class="c"><span class="muted">&mdash;</span></td>'
                   + '<td class="date">'+(p.last_quote?day(p.last_quote):'&mdash;')+'</td>'
                   + '<td>'+(p.email
                       ? repSelect('agent', p.email, p.own_rep || '')
                       : '<span class="muted">&mdash;</span>')+'</td></tr>';
               }).join('');
             }
           }
           return out;
         }).join('')+moreRow('byAgency', shown.length, tops.length, 10)+'</tbody></table>'
     : '<p class="muted">Nothing yet.</p>';
   wireAgToggles();
   }
 // TWO CALL SITES, like wireCollapse. A handler attached only inside paint() is missing on the
 // FIRST render, because this page paints once directly before paint is assigned. TRAPS #239,
 // same file, and the reason that entry exists.
 // TWO CALL SITES, like wireCollapse and wireAgToggles: the first render happens before paint
 // is assigned, so a handler attached only inside paint() is dead on the page you land on.
 function wireAgentToggle(){
   var b = document.getElementById('agentToggle');
   if (b) b.onclick = function(){ NAMED_ONLY = !NAMED_ONLY; paintByAgent(); };
 }
 function wireAgToggles(){
   Array.prototype.forEach.call(document.querySelectorAll('.agtog'), function(b){
     b.onclick = function(){
       var k = b.getAttribute('data-ag');
       OPEN_AG[k] = !OPEN_AG[k];
       paintByAgency();
     };
   });
 }
   var SL={P:'Pending',I:'In process',S:'Sold',D:'Dead',N:'No Response'};
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

   // Historic quotes by year, newest first. Counts are centred under centred headings, same as
   // the two tables above, and the widths are declared so nothing drifts to a column edge.
   var hy = st.historic || [];
   document.getElementById('historic').innerHTML = hy.length
     ? '<table class="grid"><colgroup><col style="width:16%"><col style="width:21%">'
       + '<col style="width:21%"><col style="width:21%"><col style="width:21%"></colgroup>'
       + '<thead><tr><th>Year</th><th class="c">Quotes</th><th class="c">Sold</th>'
       + '<th class="c">Employers</th><th class="c">Agencies</th></tr></thead><tbody>'
       + hy.map(function(x){
           return '<tr><td>'+esc(x.yr||'—')+'</td><td class="c">'+x.n+'</td>'
             +'<td class="c">'+(Number(x.sold||0)||'—')+'</td>'
             +'<td class="c">'+x.employers+'</td><td class="c">'+x.agencies+'</td></tr>';
         }).join('')+'</tbody></table>'
     : '<p class="muted">Nothing before 2026.</p>';

   // Agencies that have fallen off.
   var dm = st.dormant || [];
   document.getElementById('dormant').innerHTML = dm.length
     ? '<table class="grid"><colgroup><col style="width:40%"><col style="width:15%">'
       + '<col style="width:20%"><col style="width:25%"></colgroup>'
       + '<thead><tr><th>Agency</th><th class="c">Quotes ever</th>'
       + '<th class="date">Last quote</th><th class="c">Quiet for</th></tr></thead><tbody>'
       + dm.map(function(x){
           // 🔴 THIS PRINTED "2 yrs 12 mo" AND "3 yrs 12 mo" ON THE LIVE PAGE.
           // Years and months were computed independently -- floor(days/365) alongside
           // round((days%365)/30) -- so a remainder near 355 days rounded up into a twelfth
           // month that should have rolled into the year. Derive TOTAL months once and divide,
           // so the two halves cannot disagree with each other.
           var totMos = Math.round((x.days_quiet||0)/30.44);
           var yrs = Math.floor(totMos/12), mos = totMos%12;
           var quiet = yrs ? (yrs+' yr'+(yrs>1?'s':'')+(mos?' '+mos+' mo':'')) : ((x.days_quiet||0)+' days');
           // ⛔ AN ACQUIRED NAME NEVER REACHES THIS LIST ANY MORE -- the query excludes
           // relationship = 'succeeded' outright. Eric: "we don't need to see MHBT on a dormant
           // list, even if grayed out." The old greyed-out row and its "acquired, now quotes as"
           // caption are gone with it, rather than left as a branch no input can reach.
           // ⭐ A DIVISION still arrives here and SHOULD: it is still trading, so somebody can
           // ring it. The caption says which parent it belongs to so the row is not mistaken for
           // an independent firm that went quiet.
           var under = x.parent_name
             ? ' <span class="muted">&mdash; part of <b>' + esc(x.parent_name) + '</b></span>'
             : '';
           return '<tr>'
             +'<td class="wrapcell">'+esc(x.agency_label||'(no agency)')+under
             + (x.contact ? '<br><span class="muted" style="font-size:12px">call '
                 + esc(x.contact) + '</span>' : '')+'</td>'
             +'<td class="c">'+x.n+'</td><td class="date">'+day(x.last_quote)+'</td>'
             +'<td class="c">'+quiet+'</td></tr>';
         }).join('')+'</tbody></table>'
     : '<p class="muted">Nobody has fallen off &mdash; every agency with five or more quotes has sent one in the last 12 months.</p>';

   // INSIGHTS. Eric, 2026-08-22: "would it be possible to provide some insights?"
   // Every number here is derived from what is already on this page, so nothing can disagree with
   // the tables under it. Concentration is the one that changes what you do: a book where a
   // handful of agencies carry most of the volume is a different business from a broad one.
   (function(){
     var ag = CACHE.byAgency || [], tot = (st.totals && st.totals.quotes) || 0;
     if (!ag.length || !tot) return;
     var sorted = ag.slice().sort(function(a,b){ return (b.n||0)-(a.n||0); });
     var top10 = sorted.slice(0,10).reduce(function(t,x){ return t+(x.n||0); }, 0);
     var ones  = sorted.filter(function(x){ return (x.n||0) === 1; }).length;
     var mid   = sorted.filter(function(x){ return (x.n||0) >= 10 && (x.n||0) <= 49; });
     var midN  = mid.reduce(function(t,x){ return t+(x.n||0); }, 0);
     // Count only the GENUINE lapses. An acquired agency in this total would overstate what
     // there is to go and recover, which is the one thing this number is for.
     // ⭐ THE DORMANT LIST NO LONGER CONTAINS ACQUIRED NAMES AT ALL -- the query excludes them --
     // so live is simply the list. The acquired count comes from the agency table instead,
     // which is where the register now lives.
     var live  = dm;
     var dmN   = live.reduce(function(t,x){ return t+(x.n||0); }, 0);
     var acq   = ag.filter(function(x){ return x.relationship === 'succeeded'; });
     var divs  = ag.filter(function(x){ return x.relationship === 'division'; });
     var el = document.getElementById('insights');
     if (!el) return;

     // 🔴🔴 ERIC, 2026-08-22: "10-49 band of what? 28% of what? Total quotes all time? Or, when we
     // filter by time period, 28% of quotes during the time frame?" -- and separately, "2 of the
     // five insights apply no matter what timeframe you're looking at."
     // ⭐⭐ RIGHT ON BOTH, AND THE SECOND IS THE STRUCTURAL ONE. The byAgency and totals queries DO
     // respect the Since filter; the dormant query deliberately does NOT, because "fallen off" is a
     // whole-history question -- scoping it would make it mean "quiet inside the window", which is
     // every agency outside that window. So this card was mixing two populations with nothing on
     // screen saying which was which, and every percentage had an unstated denominator.
     // ⛔ NO BACKTICKS IN THIS COMMENT, AND THAT IS NOT A STYLE CHOICE: this whole page is one
     // template literal, so a backtick ends it early and the parse error then blames an innocent
     // line much further down. Name identifiers in words here. (TRAPS #248 -- and the page checker
     // caught this comment doing it on the first run, which is the fifth time in this file.)
     // ▶️ SPLIT THEM UNDER HEADINGS THAT NAME THE PERIOD, and spell out what each number is a
     // share OF. A denominator the reader has to infer is one they will quote wrong later.
     var sel = document.getElementById('fSince');
     var periodText = 'all time';
     if (sel && sel.value) {
       var opt = sel.options[sel.selectedIndex];
       periodText = String((opt && opt.text) || '').toLowerCase();
     }
     var scoped = !!(sel && sel.value);
     var ofPeriod = scoped ? 'quotes in this period' : 'all quotes ever';

     // How few agencies it takes to reach half the book. A sharper concentration figure than a
     // fixed top-10, because it does not assume ten is the interesting cut.
     var half = 0, run = 0;
     for (var i = 0; i < sorted.length; i++) {
       run += (sorted[i].n || 0);
       if (run * 2 >= tot) { half = i + 1; break; }
     }

     // The MEDIAN agency, which is what makes the long tail concrete. A mean is dragged upward by
     // the top ten and describes nobody in the book.
     var med = 0;
     if (sorted.length) {
       var ns = sorted.map(function(x){ return Number(x.n || 0); }).sort(function(a,b){ return a-b; });
       var mi = Math.floor(ns.length / 2);
       med = ns.length % 2 ? ns[mi] : Math.round((ns[mi-1] + ns[mi]) / 2);
     }

     // ⚠️ The sales figure is only populated from late May 2025, where the mailbox starts, so
     // "no sale recorded" is a statement about WHAT WE CAN SEE, not about the agency. Said on screen
     // rather than left for the reader to discover, because it reads as a conversion rate otherwise.
     var noSale = sorted.filter(function(x){ return !Number(x.sales || 0); }).length;
     var multi  = sorted.filter(function(x){ return Number(x.agents || 0) > 1; }).length;

     function li(s){ return '<li>' + s + '</li>'; }

     var inPeriod = [
       li('<b>' + ag.length.toLocaleString() + ' agencies</b> sent at least one quote'
          + (scoped ? ' in this period' : ' at some point') + ', '
          + tot.toLocaleString() + ' quotes between them.'),
       li('The <b>top 10</b> agencies account for <b>' + Math.round(100*top10/tot) + '%</b> of '
          + ofPeriod + '.'),
       (half ? li('It takes only <b>' + half + ' of the ' + ag.length.toLocaleString() + ' agencies</b>'
          + ' to reach <b>half</b> of ' + ofPeriod + '.') : ''),
       li('<b>' + mid.length + ' agencies</b> have sent <b>between 10 and 49 quotes</b> each, and'
          + ' together they are <b>' + Math.round(100*midN/tot) + '%</b> of ' + ofPeriod + '.'
          + ' That is the middle of the book, and usually where growth is cheapest'
          + ' &ndash; they already know us.'),
       li('The <b>typical</b> agency has sent <b>' + med + '</b> '
          + (med === 1 ? 'quote' : 'quotes') + ' &ndash; half sent that many or fewer.'),
       li('<b>' + multi + ' agencies</b> reach us through <b>more than one agent</b>.'
          + ' The rest come through a single person.'),
       li('<b>' + noSale + ' of ' + ag.length.toLocaleString() + ' agencies</b> have quoted with no'
          + ' sale recorded against them. <span class="muted">The sales record now reaches back'
          + ' beyond the announcement emails, because a client can be matched to the quote that'
          + ' originated it &ndash; so this is agencies we could not match a sale for, not simply'
          + ' a gap in the emails.</span>')
     ].filter(function(s){ return s; }).join('');

     var wholeHistory = [
       li('<b>' + ones + ' agencies</b> have sent exactly <b>one quote, ever</b>.'),
       (live.length
         ? li('<b>' + live.length + ' agencies</b> that sent us five or more quotes have gone quiet'
              + ' for over a year, worth <b>' + dmN.toLocaleString() + '</b> quotes historically.'
              + ' They are listed below.')
         : ''),
       (acq.length
         ? li('<b>' + acq.length + ' names</b> in the log belong to firms that were '
              + '<b>acquired</b> and are counted under their buyer, not as lapses &ndash; '
              + acq.map(function(x){ return esc(x.agency_label)+' is now '+esc(x.parent_name||''); }).join(', ')
              + '.')
         : ''),
       (divs.length
         ? li('<b>' + divs.length + ' names</b> are <b>divisions or branch offices</b> of a bigger'
              + ' firm. They roll up into the parent above, and they stay on the fallen-off list'
              + ' on their own merits because somebody can still call them.')
         : '')
     ].filter(function(s){ return s; }).join('');

     function block(title, note, items){
       return '<div style="margin-bottom:14px">'
         + '<div style="font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6b7b72;'
         + 'font-weight:600;margin-bottom:4px">' + title + '</div>'
         + (note ? '<div class="muted" style="font-size:12px;margin-bottom:6px">' + note + '</div>' : '')
         + '<ul style="margin:0;padding-left:18px;line-height:1.7">' + items + '</ul></div>';
     }

     el.innerHTML =
       block('Showing: ' + esc(periodText),
             'These move when you change the Since filter.',
             inPeriod)
       + block('Whole history',
               'These cover the entire book and do <b>not</b> change with the Since filter'
               + ' &ndash; an agency is not "fallen off" just because it is quiet inside a window'
               + ' you picked.',
               wholeHistory);
   })();

   // (CACHE.byAgent is assigned above, before paintByAgency needs it.)
   paintByAgent();
   function paintByAgent(){
   // Eric, 2026-08-22: "When you click to quote by agent, it sorts by first name. Seems like last
   // name would be better." Sorted on the LAST word of the name, with the whole name as the
   // tie-break so two Smiths stay in a stable order.
   // A row with no name at all falls back to whatever it is labelled by (email, or the agency),
   // because that is what the cell actually shows -- a sort keyed on a field the cell does not
   // display is how a table comes to look wrongly ordered to the person reading it.
   function surname(x){
     var n = String(x.name||'').trim();
     if(!n) return String(x.email||x.agency||'').toLowerCase();
     var p = n.split(' ').filter(function(w){ return w; });
     return (p[p.length-1] + ' ' + n).toLowerCase();
   }
   // Eric: "only if we actually know the agents. It doesn't help to repeat the agencies there
   // since that makes up most of the list." Measured: 639 of 768 rows are keyed on an agency.
   // Hidden by DEFAULT, one click away, and the number is said out loud -- an unattributable
   // quote is a real fact about the book and a list that silently drops 83% of its rows is worse
   // than one that shows them.
   var allAgents = CACHE.byAgent || [];
   var namedAgents = allAgents.filter(function(x){ return x.name || x.email; });
   var hiddenAgents = allAgents.length - namedAgents.length;
   var noteEl = document.getElementById('agentNote');
   if (noteEl) {
     noteEl.innerHTML = hiddenAgents
       ? (NAMED_ONLY
           ? 'Showing the <b>' + namedAgents.length + '</b> agents we can name. '
             + '<b>' + hiddenAgents + '</b> more rows record an agency but no individual. '
             + '<button type="button" id="agentToggle" style="background:none;border:0;'
             + 'color:#2f6f4f;font-size:12.5px;cursor:pointer;text-decoration:underline;'
             + 'padding:0">show them</button>'
           : 'Showing all <b>' + allAgents.length + '</b> rows, including <b>' + hiddenAgents
             + '</b> that record an agency but no individual. '
             + '<button type="button" id="agentToggle" style="background:none;border:0;'
             + 'color:#2f6f4f;font-size:12.5px;cursor:pointer;text-decoration:underline;'
             + 'padding:0">name only</button>')
       : '';
   }
   var agt=sorted('byAgent', NAMED_ONLY ? namedAgents : allAgents, {
     name:surname,
     email:function(x){return String(x.email||'').toLowerCase()},
     agency:function(x){return String(x.agency||'').toLowerCase()},
     n:function(x){return Number(x.n||0)},
     last:function(x){return String(x.last_quote||'')}
   },'n');
   document.getElementById('byAgent').innerHTML = agt.length
     ? '<table class="grid"><colgroup>'
       + '<col style="width:20%"><col style="width:22%"><col style="width:20%">'
       + '<col style="width:9%"><col style="width:13%"><col style="width:16%">'
       + '</colgroup><thead><tr>'+hc('byAgent','name','Agent')+hc('byAgent','email','Email')
       +hc('byAgent','agency','Agency')+hc('byAgent','n','Quotes','c')
       +hc('byAgent','last','Last quote')+'<th>Owner</th></tr></thead><tbody>'
       + capRows('byAgent', agt).map(function(x){
           // \u2b50 A ROW IS NAMED BY WHATEVER IT HAS. Most of the imported book carries an agency and
           // no broker name or email, and printing a dash where the name goes made those rows look
           // like broken data rather than what they are: a quote we know the agency for.
           var who = x.name || x.email || (x.agency ? x.agency : '') || 'Not stated';
           var viaAgency = !x.name && !x.email && x.agency;
           return '<tr><td class="wrapcell">'+esc(who)
             +(viaAgency?' <span class="muted" title="This quote records an agency but no individual broker">(agency only)</span>':'')
             +'</td><td class="wrapcell">'+esc(x.email||'\u2014')+'</td><td class="wrapcell">'+esc(x.agency||'\u2014')+'</td><td class="c">'+x.n+'</td><td class="date">'+day(x.last_quote)+'</td>'
             // ONLY AN AGENT WE HAVE AN EMAIL FOR CAN BE ASSIGNED -- broker_directory is keyed on
             // it. Showing a control that cannot save is worse than showing none: it looks like
             // the assignment took and quietly did nothing.
             // The value shown may be INHERITED from the agency. It is styled differently and
             // titled so it is obvious which agents have been decided individually -- otherwise a
             // whole column of inherited values reads as a column of decisions nobody made.
             +'<td>'+(x.email
                 ? repSelect('agent', x.email, x.own_rep || '')
                   + (!x.own_rep && x.rep
                       ? ' <span class="muted" style="font-size:11px" title="inherited from the agency">via agency</span>'
                       : '')
                 : '<span class="muted" title="No email on any of these quotes, so there is nothing to attach an owner to">\u2014</span>')
             +'</td></tr>';
         }).join('')+moreRow('byAgent', capRows('byAgent', agt).length, agt.length, 6)+'</tbody></table>'
     : '<p class="muted">Nothing yet.</p>';
   }
   wireAgentToggle();
   wireSelects();
   wireSort();
   // Re-render the three lists from the cache when a header is clicked.
   paint=function(){ paintBrokers(); paintByAgency(); paintByAgent(); wireSelects(); wireSort(); wireCollapse(); wireMore(); wireAgentToggle(); };
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


 // ── THE MARKETING VIEW (F-383) ───────────────────────────────────────────────────────────────
 //
 // ⛔ NO BACKSLASHES ANYWHERE BELOW. Every page in worker.js is one template literal, so a lone
 // backslash is eaten before the browser sees it and a regex like [0-9] written the short way
 // arrives as the letter d. Everything here uses string methods or explicit character classes.
 var mktRows = [];
 var mktSel = {};
 var mktTags = [];
 var view = 'performance';
 // ⭐⭐ THE ANALYSIS IS LOADED ON DEMAND, EXACTLY LIKE THE MARKETING LIST ALREADY WAS.
 // Eric, 2026-08-24: 'I thought you told me that the brokers and agencies list would load
 // quickly now, but it still has to feed in.' He was right, and the note he was quoting was
 // about the QUERY rather than the PAGE: the Marketing view asks for no quote and no sale, so
 // its own fetch really is cheap -- but load() ran unconditionally at boot, so anybody landing
 // on Marketing still paid for the whole roll-up over every quote before seeing a single row.
 // ⛔ A CHEAP QUERY BEHIND AN EAGER PAGE IS NOT A FAST SCREEN.
 var PERF_LOADED = false;

 // ⭐ THE VIEW IS REMEMBERED. Somebody who works the Marketing list all morning should not land on
 // the analysis page every time they open this from the nav.
 function setView(v){
   view = (v === 'marketing') ? 'marketing' : 'performance';
   try { localStorage.setItem('abyCrmView', view); } catch(e) {}
   var mkt = (view === 'marketing');
   document.getElementById('perfView').style.display = mkt ? 'none' : '';
   document.getElementById('mktView').style.display = mkt ? '' : 'none';
   document.getElementById('vPerf').className = mkt ? '' : 'on';
   document.getElementById('vMkt').className = mkt ? 'on' : '';
   // The Since filter belongs to the analysis. The Marketing view has its own filters and asks for
   // no quote history, so leaving it on screen would imply it does something here.
   var f = document.querySelector('.filters');
   if (f) f.style.display = mkt ? 'none' : '';
   document.getElementById('viewHint').textContent = mkt
     ? 'Who we are working. Firms that no longer exist are hidden.'
     : 'What the quote log says. Firms that have never quoted do not appear here.';
   // Each view fetches its own rows the first time it is shown, and neither pays for the
   // other. The filter controls still call load() directly, which is a deliberate refetch.
   if (mkt) { if (!mktRows.length) loadMkt(); }
   else     { if (!PERF_LOADED) load(); }
 }

 function q(id){ return document.getElementById(id); }

 function closeFirm(){
   // If we pushed an entry, going back is the honest way out -- it keeps the URL and the screen
   // agreeing. If we did not (an old browser, or a direct link), just repaint.
   try {
     if (history.state && history.state.firm){ history.back(); return; }
   } catch (e) { /* fall through */ }
   paintMkt();
 }

 window.addEventListener('popstate', function(ev){
   if (view !== 'marketing') return;
   var st = ev.state;
   if (st && st.firm) openFirm(st.firm, true);
   else paintMkt();
 });

 // ⭐ A LINK STRAIGHT TO A FIRM LANDS ON THE FIRM, not on the list with the wrong view showing.
 // ⚠️ It has to wait for the rows: openFirm reads mktRows, so calling it before loadMkt has
 // returned finds nothing and silently does nothing -- the first render is not a repaint (#239).
 function openFirmFromUrl(){
   var m = String(location.search || '').match(/[?&]firm=([^&]+)/);
   if (!m) return false;
   var id = decodeURIComponent(m[1]);
   // A LINK TO A FIRM THAT IS NO LONGER HERE MUST FALL BACK TO THE LIST, NOT TO NOTHING.
   // openFirm reads mktRows and returns silently when the id is not in it -- so a stale link, or a
   // firm that has since been folded into another, left the page saying "Loading..." for ever.
   // Found by opening ?firm=x by hand. Nothing in the code says a bad id is impossible, and every
   // resolved duplicate turns a previously valid link into a stale one.
   var found = false;
   for (var i = 0; i < mktRows.length; i++) if (mktRows[i].id === id) found = true;
   if (!found) return false;
   try { history.replaceState({ firm: id }, '', location.search); } catch (e) {}
   openFirm(id, true);
   return true;
 }

 // ── ADDING A LIST FROM AN EVENT ──────────────────────────────────────────────────────────────
 //
 // ⛔ NO BACKSLASHES IN HERE. Every page is one template literal, so a regex written the short way
 // arrives at the browser with its escapes eaten. The parsing below uses string methods only.
 var parsed = [];

 // ⭐⭐ THE COLUMNS ARE DETECTED, NOT DECLARED. A badge list, a registration export and a hand-typed
 // list all put the columns in a different order, and asking somebody to rearrange a spreadsheet
 // before pasting it is how a feature stops being used. The EMAIL is unmistakable, so it anchors the
 // row: whatever cell holds an at-sign is the address, and the rest is read around it.
 // ⚠️ The preview is the point of pasting rather than uploading -- it shows what was understood
 // BEFORE anything is written.
 function mostlyDigits(s){
   var d = 0, c = 0;
   for (var i = 0; i < s.length; i++){
     var ch = s.charAt(i);
     if (ch >= '0' && ch <= '9') d++;
     if (ch !== ' ') c++;
   }
   return c > 6 && d >= c - 4;
 }

 function parseList(text){
   var out = [], lines = String(text || '').split(String.fromCharCode(10));
   for (var i = 0; i < lines.length; i++){
     var line = lines[i].replace(String.fromCharCode(13), '').trim();
     if (!line) continue;
     var cells = line.indexOf(String.fromCharCode(9)) !== -1
       ? line.split(String.fromCharCode(9))
       : line.split(',');
     for (var c = 0; c < cells.length; c++) cells[c] = cells[c].trim();

     var email = '', rest = [];
     for (var k = 0; k < cells.length; k++){
       if (!email && cells[k].indexOf('@') !== -1 && cells[k].indexOf(' ') === -1) email = cells[k].toLowerCase();
       else if (cells[k]) rest.push(cells[k]);
     }
     var phone = '';
     for (var m = 0; m < rest.length; m++){
       if (!phone && mostlyDigits(rest[m])){ phone = rest[m]; rest.splice(m, 1); break; }
     }
     out.push({ name: rest[0] || '', agency: rest[1] || '', email: email, phone: phone, line: line });
   }
   return out;
 }

 function previewList(){
   parsed = parseList(q('importBox').value);
   var noEmail = 0;
   for (var i = 0; i < parsed.length; i++) if (!parsed[i].email) noEmail++;
   if (!parsed.length){ q('importPreview').innerHTML = ''; q('importMsg').textContent = ''; return; }

   var h = '<p class="muted" style="margin:10px 0 6px">Read as ' + parsed.length + ' row'
         + (parsed.length === 1 ? '' : 's')
         // ⚠️ SAID UP FRONT, NOT AFTER. A row with no address cannot be added at all, and finding
         // that out after pressing Apply is the wrong moment.
         // ⭐ THIS SAID "which cannot be added" AND WAS TRUE UNTIL 2026-08-24. Leaving it would have
         // told somebody their phone-only rows were being dropped while they were quietly going in.
         + (noEmail ? '. <span class="muted">' + noEmail + ' with no email address &mdash; '
                    + (noEmail === 1 ? 'it goes in' : 'they go in')
                    + ' under the name and firm, and can gain an address later.</span>' : '.')
         + '</p><table class="grid"><colgroup><col><col><col style="width:230px"><col style="width:130px"></colgroup>'
         + '<thead><tr><th>Name</th><th>Firm</th><th>Email</th><th>Phone</th></tr></thead><tbody>';
   for (var j = 0; j < parsed.length && j < 12; j++){
     var r = parsed[j];
     h += '<tr><td>' + (esc(r.name) || '<span class="muted">—</span>') + '</td>'
        + '<td>' + (esc(r.agency) || '<span class="muted">—</span>') + '</td>'
        + '<td>' + (r.email ? esc(r.email) : '<span style="color:#a12622">no email</span>') + '</td>'
        + '<td>' + (esc(r.phone) || '<span class="muted">—</span>') + '</td></tr>';
   }
   h += '</tbody></table>';
   if (parsed.length > 12) h += '<p class="muted">…and ' + (parsed.length - 12) + ' more.</p>';
   q('importPreview').innerHTML = h;
 }

 async function runImport(){
   if (!parsed.length) previewList();
   if (!parsed.length){ q('importMsg').textContent = 'Paste some rows first.'; return; }
   q('importMsg').textContent = 'Adding...';
   var r = await fetch('/api/admin/crm/import', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       rows: parsed, label: q('importTag').value, happened_at: q('importDate').value,
       // This panel IS the event path, so the people it creates came from an event and the tag
       // beside them says which one. Eric: "that event that I met Megan at was really the source."
       source: 'event',
     }),
   });
   var d = await r.json().catch(function(){ return {}; });
   if (!r.ok){ q('importMsg').textContent = d.error || 'That did not import.'; return; }

   // ⭐⭐ THE SPLIT, NEVER A TOTAL. "9 added, 4 already known and tagged, 1 refused" is the honest
   // sentence. The already-known half is the valuable one -- those are agents who have quoted for
   // years and are now recorded as having been at the event.
   var parts = [d.added + ' added'];
   if (d.known) parts.push(d.known + ' already known');
   if (d.refused) parts.push(d.refused + ' refused');
   var line = parts.join(', ');
   if (d.label) line += '. ' + d.tagged + ' tagged ' + esc(d.label) + ' on ' + d.happened_at;
   var h = '<p><strong>' + line + '.</strong></p>';

   var det = d.detail || {};
   if (det.refused && det.refused.length){
     h += '<p class="muted">Refused:</p><ul>';
     for (var i = 0; i < det.refused.length; i++){
       h += '<li>' + esc(det.refused[i].who) + ' — ' + esc(det.refused[i].why) + '</li>';
     }
     h += '</ul>';
   }
   // ⛔ REPORTED, NEVER APPLIED. What we already hold was typed by somebody who was dealing with
   // them; a badge list is not better evidence than that. So a difference is shown and left alone.
   if (det.differs && det.differs.length){
     h += '<p class="muted">Different from what we hold, and left alone:</p><ul>';
     for (var k = 0; k < det.differs.length; k++){
       var x = det.differs[k];
       h += '<li>' + esc(x.email) + ' — we have ' + esc(x.field) + ' &ldquo;' + esc(x.weHold)
          + '&rdquo;, the list says &ldquo;' + esc(x.theList) + '&rdquo;</li>';
     }
     h += '</ul>';
   }
   q('importPreview').innerHTML = h;
   q('importMsg').textContent = '';
   q('importBox').value = '';
   parsed = [];
   await loadMkt();
 }

 // THE SAME RACE AS THE CROSS-SELL LIST, AND FOR THE SAME REASON: four filters, each firing this
 // on change, each awaiting a fetch. Whichever response ARRIVES last paints, so a quick change of
 // owner-then-tag can leave the rows from the first request under the filters of the second.
 // Quieter here than on the never-quoted list -- these filters narrow one population rather than
 // swapping it for another -- but it is the same defect and the fix is three lines.
 var mktSeq = 0;

 async function loadMkt(){
   var p = [];
   // ⛔ THIS VIEW USES ITS OWN OWNER FILTER, NOT THE ONE ON THE HIDDEN PERFORMANCE BAR. Reusing
   // the shared rep variable meant a filter set on the analysis silently narrowed this list with
   // screen to explain it -- an effect whose cause was invisible.
   var qd = q('mQuoted').value, pr = q('mPriority').value, tg = q('mTag').value, mr = q('mRep').value;
   var st = q('mState').value, dp = q('mDisp').value;
   if (st) p.push('state=' + encodeURIComponent(st));
   // ⛔ SENT EVEN WHEN BLANK IS THE DEFAULT... no: blank IS the default on the server too, so an
   // absent parameter and an empty one mean the same thing. Only send what changes the answer.
   if (dp) p.push('disposition=' + encodeURIComponent(dp));
   if (qd) p.push('quoted=' + encodeURIComponent(qd));
   if (pr) p.push('priority=' + encodeURIComponent(pr));
   if (tg) p.push('tag=' + encodeURIComponent(tg));
   if (mr) p.push('rep=' + encodeURIComponent(mr));
   var mine = ++mktSeq;
   q('mkt').innerHTML = '<p class="muted">Loading...</p>';
   var r = await fetch('/api/admin/crm/agencies' + (p.length ? '?' + p.join('&') : ''));
   var d = await r.json().catch(function(){ return {}; });
   // A response that a later request has already superseded is dropped, errors included: the
   // request that replaced it is in flight and will paint, and an error from a filter combination
   // nobody is looking at any more is noise on top of the right answer.
   if (mine !== mktSeq) return;
   // 🔴 AN ERROR IS NOT AN EMPTY LIST. Three pages in this admin have rendered a failed query as a
   // cheerful empty state; the two must never look the same.
   if (d.error) {
     q('mkt').innerHTML = '<p style="color:#a12622">Could not load the list: ' + esc(d.error) + '</p>';
     return;
   }
   mktRows = d.agencies || [];
   q('mktSub').textContent = 'Every firm we could work, including the ones that have never quoted.'
     + (d.excludedAcquired ? ' ' + d.excludedAcquired + ' acquired names are hidden, because nobody can call them.' : '')
     + (d.excludedCompound ? ' ' + d.excludedCompound + ' rows whose name is two firms at once ("MMA; MHBT") are hidden too'
                           + ' \u2014 they came out of the quote log and are not firms anybody answers to.' : '')
     + (d.excludedAlias ? ' ' + d.excludedAlias + ' are alternate spellings of a firm already on the list.' : '')
     + (d.capped ? ' \u26a0\ufe0f Only the first ' + d.cap + ' are shown \u2014 there are more.' : '');
   await loadTags();
   // ⚠️ THE URL WINS OVER THE DEFAULT RENDER, and only once the rows are here. openFirm reads
   // mktRows, so asking for a firm before this point finds nothing and does nothing at all.
   if (!openFirmFromUrl()) paintMkt();
 }

 async function loadTags(){
   var r = await fetch('/api/admin/crm/tags');
   var d = await r.json().catch(function(){ return {}; });
   mktTags = d.tags || [];
   // ⭐ THE PICKER IS THE SET IN USE. That is what makes a tag PICKED rather than typed, which is
   // what stops the filter silently dropping people whose tag was spelled differently.
   var sel = q('mTag'), keep = sel.value;
   var opts = ['<option value="">Any tag</option>'];
   var list = [];
   for (var i = 0; i < mktTags.length; i++){
     var lab = mktTags[i].label;
     opts.push('<option value="' + esc(lab) + '">' + esc(lab) + ' (' + mktTags[i].n + ')</option>');
     list.push('<option value="' + esc(lab) + '">');
   }
   sel.innerHTML = opts.join('');
   sel.value = keep;
   q('tagList').innerHTML = list.join('');
 }

 function repSel(id, cur){
   var o = ['', 'eric', 'niels', 'open'], lab = { '': '—', eric: 'Eric', niels: 'Niels', open: 'Open' };
   var h = '<select onchange="setField(this,' + "'" + id + "'" + ',' + "'assigned_rep'" + ')">';
   for (var i = 0; i < o.length; i++){
     h += '<option value="' + o[i] + '"' + ((cur || '') === o[i] ? ' selected' : '') + '>' + lab[o[i]] + '</option>';
   }
   return h + '</select>';
 }

 function priSel(id, cur){
   // ⚠️ BLANK IS A REAL VALUE. "Nobody has judged this yet" is not the same as C, and forcing a
   // rating would make the column meaningless within a week.
   var o = ['', 'A', 'B', 'C'];
   var h = '<select onchange="setField(this,' + "'" + id + "'" + ',' + "'priority'" + ')">';
   for (var i = 0; i < o.length; i++){
     h += '<option value="' + o[i] + '"' + ((cur || '') === o[i] ? ' selected' : '') + '>' + (o[i] || '—') + '</option>';
   }
   return h + '</select>';
 }

 // ── TIDY UP: THE ROWS THAT ARE NOT FIRMS ─────────────────────────────────────────────────────
 //
 // 🔴🔴 ERIC HAS ASKED FOR THE BROKERS AND AGENCIES TO BE ORGANISED, REPEATEDLY, AND THIS IS THE
 // ACTUAL JOB. Measured 2026-08-24 across the 672 rows: 57 clusters covering 127 rows are the same
 // firm spelled differently (Polaris / Polaris Benefits / Polaris Benefits, LLC), and 47 more have
 // TWO firms typed into one name. That is a quarter of the list that nobody can call.
 //
 // ⛔ THE ENDPOINT THAT FINDS THEM HAS EXISTED SINCE 08-23 AND NO SCREEN HAS EVER CALLED IT. It was
 // also keyed on punctuation alone, so it could not see any of these. A finder nobody can reach,
 // returning nothing, reads exactly like a clean list.
 //
 // ⭐⭐ IT PROPOSES; ERIC DECIDES. "Lone Star Benefits" and "Lone Star Insurance" may be one firm or
 // two and only a person knows. One click per cluster, and the survivor is the row with the most
 // history rather than the first alphabetically.
 var dupes = [];
 var maybes = [];
 var odds = [];
 var tidyNotes = [];
 var comps = [];

 // -- NEVER QUOTED: the cross-sell list ---------------------------------------------------------
 //
 // The product picker is built from what the log actually contains, never from a hard-coded list,
 // so it cannot drift from the catalogue. Each option carries how many firms have EVER asked, which
 // is the context that makes the answer readable: 22 of 65 have never asked for ACA is a campaign,
 // and it only means something beside "99 firms have ever quoted ACA at all".
 var nqLoaded = false;
 // \ud83d\udd34\ud83d\udd34 THE NEWEST ANSWER IS NOT THE NEWEST QUESTION, AND ON THIS SCREEN THAT IS THE WORST
 // POSSIBLE BUG. Found by opening the page: stepping the picker down to ACA fired a fetch per
 // keystroke, the HSA request resolved AFTER the ACA one, and the page ended up showing
 // "ACA 1094/1095 Reporting" over the twelve firms that have never quoted HSA.
 // Nothing looked wrong. The heading agreed with the picker, the rows were real firms with real
 // quote counts, and the list was for a different product -- so somebody would ring a firm about
 // something they already buy, holding a screen that says otherwise.
 // \u26a0\ufe0f An out-of-order response is not rare here: the picker has fifteen options and a keyboard
 // user passes through several on the way to the one they want.
 // Every request takes a number; a response whose number is not the latest is DISCARDED.
 var nqSeq = 0;

 async function loadNeverQuoted(){
   var box = q('nqBox');
   var pid = q('nqProduct').value;
   var min = q('nqMin').value || 15;
   var mine = ++nqSeq;
   box.innerHTML = '<p class="muted">Looking...</p>';
   var r = await fetch('/api/admin/crm/never-quoted?min=' + encodeURIComponent(min)
                       + (pid ? '&product=' + encodeURIComponent(pid) : ''));
   var d = await r.json().catch(function(){ return {}; });
   // \u26d4 A STALE ANSWER IS DROPPED IN SILENCE, and that is right: the request that replaced it is
   // already in flight and will paint. Showing an error here would blame the user for typing.
   if (mine !== nqSeq) return;
   // \ud83d\udd34 AN ERROR IS NOT AN EMPTY LIST. An empty list here reads as "everybody has already
   // been asked", which is the shape of a finished job -- the most expensive thing to get wrong on
   // a screen whose whole purpose is to produce work.
   if (d.error){
     box.innerHTML = '<p style="color:#a12622">Could not build the list: ' + esc(d.error) + '</p>';
     q('nqCount').textContent = '';
     return;
   }

   if (!nqLoaded && (d.products || []).length){
     var sel = q('nqProduct'), keep = sel.value;
     var opts = ['<option value="">Pick a product</option>'];
     for (var i = 0; i < d.products.length; i++){
       var p = d.products[i];
       opts.push('<option value="' + esc(p.id) + '">' + esc(p.label)
                 + ' (' + p.firms + ' firms have ever asked)</option>');
     }
     sel.innerHTML = opts.join('');
     sel.value = keep;
     nqLoaded = true;
   }

   if (!pid){
     box.innerHTML = '<p class="muted">Pick a product.</p>';
     q('nqCount').textContent = '';
     return;
   }

   var rows = d.rows || [];
   // \u26a0\ufe0f THE DENOMINATOR IS PART OF THE FINDING. "22 firms" on its own is unreadable: 22 of 65
   // is most of the book, 22 of 600 is a rounding error. A proportion without its denominator is
   // the same defect as a percentage without its sample.
   q('nqCount').textContent = rows.length + ' of ' + d.eligible + ' firms with ' + d.min + '+ quotes';

   if (!rows.length){
     box.innerHTML = '<p class="muted">Every firm with ' + d.min + ' or more quotes has asked for '
                   + 'this at least once. Try a lower floor, or another product.</p>';
     return;
   }

   // \u26a0\ufe0f COLUMN WIDTHS ARE DECLARED, NOT LEFT TO THE BROWSER. Without a colgroup the firm
   // names took all the room and squeezed the date column until its heading rendered as "L" and
   // the dates as "2" -- a column that is present, wrong, and easy to read straight past.
   var h = '<div style="overflow-x:auto"><table class="grid" style="min-width:720px"><colgroup>'
         + '<col><col style="width:120px"><col style="width:72px">'
         + '<col style="width:104px"><col style="width:78px"><col style="width:78px"></colgroup>'
         + '<thead><tr><th>Firm</th><th>Where</th><th class="c">Quotes</th>'
         + '<th class="date">Last quote</th><th>Priority</th><th>Owner</th></tr></thead><tbody>';
   for (var k = 0; k < rows.length; k++){
     var a = rows[k];
     var where = (a.city ? esc(a.city) : '') + (a.state ? (a.city ? ', ' : '') + esc(a.state) : '');
     h += '<tr><td class="wrapcell">'
        // The name is the link, the same as on the list above -- one habit, not two.
        + '<a href="?firm=' + encodeURIComponent(a.id) + '" onclick="openFirm(' + "'" + a.id + "'" + ');return false"><strong>'
        + esc(a.name) + '</strong></a></td>'
        + '<td>' + (where || '<span class="muted">&mdash;</span>') + '</td>'
        + '<td class="c"><strong>' + (Number(a.quotes) || 0) + '</strong></td>'
        + '<td class="date">' + (a.last_quote ? day(a.last_quote) : '<span class="muted">&mdash;</span>') + '</td>'
        + '<td>' + (a.priority ? esc(a.priority) : '<span class="muted">&mdash;</span>') + '</td>'
        + '<td>' + (a.assigned_rep ? esc(a.assigned_rep) : '<span class="muted">open</span>') + '</td>'
        + '</tr>';
   }
   h += '</tbody></table></div>';
   box.innerHTML = h;
 }

 // Quote-log names that no agency row answers to. Filled by loadDupes, drawn by paintDupes.
 var orphanNames = [], orphanQuotes = 0;
 // How many firms this screen is deliberately not asking about, because their names are settled.
 var confirmedCount = 0;

 async function loadDupes(){
   var box = q('tidyBox');
   box.innerHTML = '<p class="muted">Looking...</p>';
   var r = await fetch('/api/admin/crm/agency-dupes');
   var d = await r.json().catch(function(){ return {}; });
   // 🔴 AN ERROR IS NOT A CLEAN LIST. Those must never render the same way.
   if (d.error){ box.innerHTML = '<p style="color:#a12622">Could not check: ' + esc(d.error) + '</p>'; return; }
   dupes = d.pairs || [];
   maybes = d.maybe || [];
   odds = d.odd || [];
   tidyNotes = d.notes || [];
   comps = d.compound || [];
   confirmedCount = Number(d.confirmed) || 0;
   orphanNames = d.orphans || [];
   orphanQuotes = Number(d.orphanQuotes) || 0;
   paintDupes();
 }

 function dupeGroup(grp, g, kind){
   var h = '<div style="border:1px solid #dde5ee;border-radius:7px;padding:9px 11px;margin-bottom:8px">';
   for (var j = 0; j < grp.length; j++){
     var a = grp[j];
     // ⭐⭐ THE QUOTE COUNT IS THE ANSWER, SO IT IS THE LOUDEST THING ON THE ROW.
     var n = Number(a.quotes) || 0;
     var stat = n
       ? '<strong style="color:#1a5c3a">' + n + '</strong> quote' + (n === 1 ? '' : 's')
         + (a.last_quote ? ' <span class="muted">to ' + day(a.last_quote) + '</span>' : '')
       : '<span class="never">never quoted</span>';
     h += '<div style="display:flex;align-items:center;gap:9px;padding:3px 0">'
        + '<button style="font-size:12px;padding:3px 9px" onclick="keepThis(' + "'" + kind + "'" + ',' + g + ',' + j + ')">Keep this</button>'
        + '<span style="min-width:250px"><strong>' + esc(a.name) + '</strong></span>'
        + '<span style="font-size:12.5px">' + stat + '</span>'
        + '<span class="muted" style="font-size:12px">' + (a.agents || 0) + ' named</span>'
        + '</div>';
   }
   // ⭐⭐ A MESSAGE TO WHOEVER IS FIXING THE DATA, AND IT GOES AWAY WHEN THEY HAVE.
   // Eric, 2026-08-24: "I might need to tell you that one is correct, two others should be
   // corrected, and one doesn't belong. Then you fix it and the note goes away."
   // ⛔ THE FIRST VERSION SAVED THIS AS A DATED NOTE ON THE FIRM, WHICH IS THE WRONG SHAPE. A note
   // on an agency is a permanent fact about that agency; this is an instruction with a lifespan.
   // Putting working messages into the history is how a history stops being worth reading.
   var gk = groupKey(grp);
   var mine = tidyNotes.filter(function(n){ return n.group_key === gk; });
   for (var t = 0; t < mine.length; t++){
     h += '<div style="margin-top:6px;background:#fdf6e3;border:1px solid #ecdca8;border-radius:6px;'
        + 'padding:6px 9px;font-size:12.5px;display:flex;align-items:flex-start;gap:8px">'
        + '<span style="flex:1">' + esc(mine[t].body) + '</span>'
        + '<a href="#" onclick="dropNote(' + "'" + mine[t].id + "'" + ');return false" '
        + 'style="color:#8a6d1f;text-decoration:none" title="Remove this note">&times;</a></div>';
   }
   h += '<div style="margin-top:6px;display:flex;align-items:center;gap:7px">'
      + '<input id="nt_' + kind + '_' + g + '" placeholder="Tell me about this group &mdash; which to keep, which to correct, which does not belong" '
      + 'onkeydown="if(event.key===&#39;Enter&#39;)noteGroup(&#39;' + kind + '&#39;,' + g + ')" '
      + 'style="flex:1;padding:5px 8px;border:1px solid #c8d2de;border-radius:5px;font-size:12.5px">'
      + '<button style="font-size:12px;padding:3px 9px" onclick="noteGroup(' + "'" + kind + "'" + ',' + g + ')">Tell me</button>'
      + '<span class="muted" id="ntm_' + kind + '_' + g + '" style="font-size:12px"></span></div>';
   h += '<div style="margin-top:5px"><a href="#" onclick="notDupes(' + "'" + kind + "'" + ',' + g + ');return false" '
      + 'style="font-size:12px;color:#5b6b7f">These are different firms &mdash; leave them alone</a></div></div>';
   return h;
 }

 function paintDupes(){
   var box = q('tidyBox');
   var h = '';
   // ⭐ SAY HOW MANY ARE WAITING ON ME. Otherwise the only way to know a message was left is to
   // scroll the whole list looking for yellow.
   if (confirmedCount){
     h += '<p class="sub" style="margin:0 0 10px">' + confirmedCount + ' firm'
        + (confirmedCount === 1 ? '' : 's') + ' with a confirmed name '
        + (confirmedCount === 1 ? 'is' : 'are') + ' not offered here at all. '
        + 'Open a firm and press <em>This name is right</em> to add one.</p>';
   }
   if (tidyNotes.length){
     h += '<p style="margin:0 0 10px;font-size:13px;color:#7a5410"><strong>' + tidyNotes.length
        + '</strong> note' + (tidyNotes.length === 1 ? '' : 's') + ' waiting for me to action.</p>';
   }

   // \u2b50\u2b50 THE LOUDEST THING ON THIS SCREEN, BECAUSE IT IS THE ONE FAILURE THAT HIDES ITSELF.
   // Every other row here is a firm you can see and judge. These are quotes that have fallen off
   // every screen: their agency name matches no agency row, so they are in nobody's count. It is
   // what happens when a group is resolved and the quotes are not renamed with it -- 343 quotes
   // went quiet that way in one afternoon, under Benefits Texas and JME.
   if (orphanNames.length){
     h += '<div style="border:1px solid #e0c98a;background:#fdf9ef;border-radius:7px;padding:10px 12px;margin:0 0 12px">'
        + '<p style="margin:0 0 6px;font-size:13px;color:#7a5410"><strong>'
        + orphanQuotes + ' quote' + (orphanQuotes === 1 ? '' : 's') + '</strong> sit under '
        + orphanNames.length + ' name' + (orphanNames.length === 1 ? '' : 's')
        + ' that no agency record answers to, so they are counted nowhere.</p>'
        + '<p class="sub" style="margin:0 0 8px">Usually a group that was resolved without renaming '
        + 'the quotes. Add the firm, or rename the quotes onto the one that survived.</p>';
     for (var o = 0; o < orphanNames.length && o < 25; o++){
       var on = orphanNames[o];
       h += '<div style="display:flex;align-items:center;gap:9px;padding:2px 0;font-size:13px">'
          + '<span style="min-width:250px"><strong>' + esc(on.nm) + '</strong></span>'
          + '<span><strong style="color:#7a5410">' + (Number(on.quotes) || 0) + '</strong> quotes</span>'
          + '<span class="muted" style="font-size:12px">'
          + (on.last_quote ? 'to ' + day(on.last_quote) : '') + '</span></div>';
     }
     if (orphanNames.length > 25){
       h += '<p class="muted" style="margin:6px 0 0;font-size:12px">and '
          + (orphanNames.length - 25) + ' more.</p>';
     }
     h += '</div>';
   }

   if (dupes.length){
     var rows = 0;
     for (var i = 0; i < dupes.length; i++) rows += dupes[i].length;
     h += '<p class="sub" style="margin:0 0 10px"><strong>' + dupes.length + ' groups</strong> covering '
        + rows + ' rows look like one firm each. Pick the name to keep &mdash; normally the one with the '
        + 'quote history. <strong>Nothing is deleted.</strong></p>';
     for (var g = 0; g < dupes.length; g++) h += dupeGroup(dupes[g], g, 'sure');
   }

   // ⭐ A SEPARATE, LOWER SECTION ON PURPOSE. Eric asked for the four Creative rows to be offered
   // together even though they do not reduce to the same name. These are prompts to look, not
   // near-certain duplicates, and mixing them into the list above would make that list feel unsafe.
   if (maybes.length){
     h += '<p class="sub" style="margin:16px 0 10px;padding-top:12px;border-top:1px solid #e6ecf3">'
        + '<strong>' + maybes.length + ' more groups start the same way</strong> and might be the same firm. '
        + 'Less certain than the ones above &mdash; worth a look.</p>';
     for (var m = 0; m < maybes.length; m++) h += dupeGroup(maybes[m], m, 'maybe');
   }

   // ⭐⭐ NOT A DUPLICATE -- AN UNIDENTIFIED ROW. Eric: "102311 should be on there since we need to
   // figure out what it is, but it's clearly not a broker." There is nothing to merge it into, so
   // the screen shows the EVIDENCE instead: what was quoted under that name, and when.
   if (odds.length){
     h += '<p class="sub" style="margin:16px 0 10px;padding-top:12px;border-top:1px solid #e6ecf3">'
        + '<strong>' + odds.length + ' rows do not look like a firm.</strong> These came out of the folder '
        + 'import &mdash; the agency is whatever the proposal folder was named. What was quoted under each '
        + 'is shown so they can be identified. <strong>Nothing here is assumed to be junk</strong> &mdash; '
        + 'K&amp;S has 85 quotes.</p>';
     for (var o = 0; o < odds.length; o++){
       var x = odds[o];
       var nq = Number(x.quotes) || 0;
       h += '<div style="border:1px solid #dde5ee;border-radius:7px;padding:9px 11px;margin-bottom:8px">'
          + '<div style="display:flex;align-items:center;gap:9px">'
          + '<span style="min-width:250px"><strong>' + esc(x.name) + '</strong></span>'
          + '<span style="font-size:12.5px">' + (nq ? '<strong style="color:#1a5c3a">' + nq + '</strong> quote'
                                                     + (nq === 1 ? '' : 's') : '<span class="never">never quoted</span>')
          + '</span></div>';
       if (x.examples && x.examples.length){
         h += '<div class="muted" style="font-size:12px;margin-top:4px;padding-left:2px">quoted for: '
            + x.examples.map(esc).join(' &middot; ') + '</div>';
       }
       h += '</div>';
     }
   }

   // ⭐⭐ TWO FIRMS IN ONE NAME. Fixing one runs the ordinary correction path, so the quote is
   // renamed to the firm picked and keeps a note saying what it was typed as.
   if (comps.length){
     h += '<p class="sub" style="margin:16px 0 10px;padding-top:12px;border-top:1px solid #e6ecf3">'
        + '<strong>' + comps.length + ' rows have two firm names in one box.</strong> Somebody typed both '
        + 'while a firm was changing hands. Pick the one that ran it &mdash; the quote is corrected to '
        + 'that firm and keeps a note of what it said.</p>';
     for (var c = 0; c < comps.length; c++){
       var cr = comps[c];
       h += '<div style="border:1px solid #dde5ee;border-radius:7px;padding:9px 11px;margin-bottom:8px">'
          + '<div style="font-size:12.5px;margin-bottom:5px"><strong>' + esc(cr.name) + '</strong></div>';
       for (var o = 0; o < cr.options.length; o++){
         var op = cr.options[o];
         h += '<div style="display:flex;align-items:center;gap:9px;padding:2px 0">'
            + (op.id
                ? '<button style="font-size:12px;padding:3px 9px" onclick="pickFirm(' + c + ',' + o + ')">This one ran it</button>'
                // ⛔ A NAME WE DO NOT HAVE GETS NO BUTTON, and says why. Offering it would mean
                // inventing a firm from half a typo.
                : '<span class="muted" style="font-size:12px;padding:3px 9px">not a firm we have</span>')
            + '<span style="min-width:230px">' + esc(op.name) + '</span>'
            + '<span class="muted" style="font-size:12px">' + (op.quotes || 0) + ' quotes</span></div>';
       }
       if (cr.examples && cr.examples.length){
         h += '<div class="muted" style="font-size:12px;margin-top:4px">quoted for: '
            + cr.examples.map(esc).join(' &middot; ') + '</div>';
       }
       h += '</div>';
     }
   }

   if (!h){
     box.innerHTML = '<p class="muted">Nothing looks like a duplicate, and every row looks like a firm.</p>';
     return;
   }
   box.innerHTML = h;
 }

 // ⚠️ Dismissed for this sitting only, and it says so. Storing "not a duplicate" would be a fourth
 // kind of relationship to reason about, and the finder is cheap to re-run.
 // ⛔ THIS USED TO SPLICE THE ARRAY AND NOTHING ELSE, so the answer lived until the next reload
 // and the same pair came back. Eric answered several of them more than once before saying so.
 async function notDupes(kind, g){
   var list = (kind === 'maybe') ? maybes : dupes;
   var grp = list[g];
   if (!grp) return;
   var r = await fetch('/api/admin/tidy-dismiss', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ group_key: groupKey(grp),
                            names: grp.map(function(x){ return x.name; }).join(' / ') }),
   });
   // ⛔ IF IT DID NOT SAVE, SAY SO AND LEAVE THE ROW. Hiding it locally after a failed write is how
   // somebody answers the same question a third time.
   if (!r.ok){
     var d = await r.json().catch(function(){ return {}; });
     q('tidyMsg').innerHTML = '<span style="color:#a12622">' + esc(d.error || 'That did not save.') + '</span>';
     return;
   }
   list.splice(g, 1);
   paintDupes();
 }

 // ⚠️ THE KEY IS THE ROW IDS, SORTED -- not the position in the list and not the name. Resolving a
 // group above this one renumbers everything, and a note pinned to an index would jump to a
 // different firm. Ids survive that, and survive a rename.
 function groupKey(grp){
   return grp.map(function(x){ return x.id; }).slice().sort().join('|');
 }

 async function noteGroup(kind, g){
   var list = (kind === 'maybe') ? maybes : dupes;
   var grp = list[g];
   if (!grp || !grp.length) return;
   var el = q('nt_' + kind + '_' + g), msg = q('ntm_' + kind + '_' + g);
   var body = (el.value || '').trim();
   if (!body){ msg.textContent = 'Type it first.'; return; }
   var r = await fetch('/api/admin/tidy-note', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ group_key: groupKey(grp), body: body,
                            names: grp.map(function(x){ return x.name; }).join(' / ') }),
   });
   var d = await r.json().catch(function(){ return {}; });
   // ⛔ A REFUSED WRITE MUST NOT READ AS SAVED. The message is the whole point of the control.
   if (!r.ok){ msg.innerHTML = '<span style="color:#a12622">' + esc(d.error || 'That did not save.') + '</span>'; return; }
   el.value = '';
   msg.textContent = '';
   await loadDupes();
 }

 // Picking a firm is recorded as the ordinary "same firm, spelled differently" relationship, which
 // is what carries the quote rename and the note. One write path, so a compound fix and a spelling
 // fix cannot drift apart.
 async function pickFirm(c, o){
   var cr = comps[c], op = cr && cr.options[o];
   if (!cr || !op || !op.id) return;
   var r = await fetch('/api/admin/crm/relationship', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: cr.id, parent_id: op.id, relationship: 'alias',
                            note: 'Two firms were typed into one name. ' + op.name + ' ran it.' }),
   });
   if (!r.ok){
     var d = await r.json().catch(function(){ return {}; });
     q('tidyMsg').innerHTML = '<span style="color:#a12622">' + esc(d.error || 'That did not save.') + '</span>';
     return;
   }
   comps.splice(c, 1);
   paintDupes();
   await loadMkt();
 }

 async function dropNote(id){
   var r = await fetch('/api/admin/tidy-note/delete', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: id }),
   });
   if (!r.ok){ var d = await r.json().catch(function(){ return {}; });
     q('tidyMsg').innerHTML = '<span style="color:#a12622">' + esc(d.error || 'Could not remove that.') + '</span>'; return; }
   await loadDupes();
 }

 async function keepThis(kind, g, j){
   var list = (kind === 'maybe') ? maybes : dupes;
   var grp = list[g];
   var keep = grp[j];
   var msgs = [];
   for (var i = 0; i < grp.length; i++){
     if (i === j) continue;
     var r = await fetch('/api/admin/crm/relationship', {
       method: 'POST', headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ id: grp[i].id, parent_id: keep.id, relationship: 'alias',
                              note: 'the same firm as ' + keep.name + ', spelled differently' }),
     });
     var d = await r.json().catch(function(){ return {}; });
     // ⛔ A FAILURE IS NAMED, NOT SWALLOWED. Reporting "done" over a refused write is how a tidy-up
     // looks finished and is not.
     if (!r.ok) msgs.push(esc(grp[i].name) + ': ' + esc(d.error || 'did not save'));
   }
   // \u2b50\u2b50 KEEPING A NAME IS ANSWERING THE QUESTION, so the answer is recorded as one. Without
   // this the finder can offer the same group again the moment another near-match turns up, which
   // is what had Eric answering the same pairs over and over.
   try {
     await fetch('/api/admin/crm/rename', {
       method: 'POST', headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ id: keep.id, confirm: true }),
     });
   } catch (e) { /* the alias is already saved; confirming is the belt, not the braces */ }

   list.splice(g, 1);
   paintDupes();
   if (msgs.length) q('tidyMsg').innerHTML = '<span style="color:#a12622">' + msgs.join(' &middot; ') + '</span>';
   else q('tidyMsg').textContent = 'Kept ' + keep.name + '. That name is settled now.';
   await loadMkt();
 }

 // ── THE MARKETING LIST IS A HIERARCHY: FIRM -> BRANCHES -> AGENTS ────────────────────────────
 //
 // 🔴🔴 ERIC, 2026-08-24: "I thought we were going to have agencies with subagencies below" and
 // "Why are there no agents under the agencies on the marketing list?" He is right on both. This
 // list was a FLAT table that showed a branch as its own row with "(branch of X)" in grey, and an
 // agent COUNT with no way to see who those agents were. A count is not a call list, and a branch
 // sitting beside its parent as a peer is the opposite of the structure he asked for.
 //
 // ⚠️ THE ANALYSIS VIEW HAS DONE THIS SINCE 08-22 AND THIS ONE NEVER DID, which is why it read as
 // something that had been taken away. Same shape, different source: that one rolls up the QUOTE
 // LOG, this one nests the AGENCY RECORDS, so a firm that has never quoted still appears.
 var mktOpen = {};
 var mktBusy = {};
 // 🔴🔴 THE PAGE FROZE FOR TEN TO FIFTEEN SECONDS AND THE DATABASE WAS NOT THE CAUSE.
 // Measured 2026-08-24: the whole marketing query runs in 20ms. What locked the browser was the
 // DOM -- every row carries a priority select and an owner select, so 562 firms meant about 1,100
 // select elements and several thousand options, built and laid out in one go.
 // \u26d4 A SCREEN YOU HAVE TO WAIT THROUGH IS ONE YOU STOP OPENING, which is the same finding as
 // the analysis view earlier today -- and that view already solved it this way.
 // \u2b50 THE CAP SAYS SO, LOUDLY. A list that quietly stops at 150 cannot be told from a book that
 // only has 150 firms in it. The Find box still searches all of them, so the cap never hides a
 // firm somebody is looking for -- it only defers the ones nobody has scrolled to.
 var MKT_CAP = 150;
 // '' means every letter. Held next to MKT_CAP because the two interact: picking a letter lifts
 // the cap for that letter (see paintMkt), which is the whole point of picking one.
 var mktLetter = '';

 // The letter a firm files under, and it is deliberately the FIRST CHARACTER OF THE NAME AS SHOWN.
 // "The Daniel and Henry Company" files under T, because T is where it sits in the list this bar
 // replaces scrolling through. Filing it under D would be a librarian's answer to a question about
 // scrolling, and the letter you press would not be the letter you can see.
 function letterOf(name){
   var c = String(name || '').trim().charAt(0).toUpperCase();
   return (c >= 'A' && c <= 'Z') ? c : '#';
 }

 function pickLetter(L){
   mktLetter = (mktLetter === L) ? '' : L;   // pressing the active letter clears it
   paintMkt();
 }

 // Painted from mktRows -- what the SERVER filters returned -- not from the letter-filtered set,
 // or choosing a letter would grey out every other letter and strand you on it.
 // Built from the states actually present, so it can never offer one with nothing behind it --
 // and it is rebuilt only once, or changing it would drop the choice you just made.
 function paintStates(){
   var sel = q('mState');
   if (!sel || sel.options.length > 1) return;
   var seen = {};
   for (var i = 0; i < mktRows.length; i++){
     var v = String(mktRows[i].state || '').toUpperCase();
     if (v) seen[v] = (seen[v] || 0) + 1;
   }
   var keys = Object.keys(seen).sort();
   // ⚠️ SAYS SO WHEN IT KNOWS NOTHING. 0 of 665 firms carry a state today (F-390), so an empty
   // dropdown here is the ordinary case and must not read as a broken control.
   if (!keys.length){
     var o = document.createElement('option');
     o.value = ''; o.disabled = true;
     o.textContent = 'No states recorded yet';
     sel.appendChild(o);
     return;
   }
   for (var k = 0; k < keys.length; k++){
     var op = document.createElement('option');
     op.value = keys[k];
     op.textContent = keys[k] + ' (' + seen[keys[k]] + ')';
     sel.appendChild(op);
   }
 }

 function renderAZ(){
   var have = {};
   for (var i = 0; i < mktRows.length; i++) have[letterOf(mktRows[i].name)] = 1;
   var letters = ['#'];
   for (var c = 65; c <= 90; c++) letters.push(String.fromCharCode(c));
   var h = '<button type="button" class="all' + (mktLetter ? '' : ' on') + '" '
         + 'onclick="pickLetter(' + "''" + ')">All</button>';
   for (var k = 0; k < letters.length; k++){
     var L = letters[k];
     if (!have[L]) { h += '<button type="button" class="off" disabled>' + L + '</button>'; continue; }
     h += '<button type="button" class="' + (mktLetter === L ? 'on' : '') + '" '
        + 'onclick="pickLetter(' + "'" + L + "'" + ')">' + L + '</button>';
   }
   q('azbar').innerHTML = h;
 }
 var MKT_ALL = false;



 function paintMkt(){
   renderAZ();
   paintStates();
   var find = (q('mFind').value || '').trim().toLowerCase();
   var rows = mktRows;
   if (find) rows = rows.filter(function(x){
     return (String(x.name || '') + ' ' + String(x.city || '') + ' ' + String(x.state || ''))
              .toLowerCase().indexOf(find) !== -1;
   });
   if (mktLetter) rows = rows.filter(function(x){ return letterOf(x.name) === mktLetter; });

   // The letter is NAMED in the count. A filtered list that does not say what is filtering it is
   // how somebody concludes we have lost four hundred agencies.
   q('mCount').textContent = rows.length + ' of ' + mktRows.length + ' firms'
     + (mktLetter ? ' \u2014 ' + (mktLetter === '#' ? 'not starting with a letter' : mktLetter) : '');
   // ⛔ TESTED ON THE FILTERED LIST, NOT THE FETCHED ONE. Checking mktRows meant that filtering
   // 660 firms down to none fell through to the renderer and drew a header with no rows beneath it.
   if (!rows.length){
     q('mkt').innerHTML = mktRows.length
       ? '<p class="muted">None of the ' + mktRows.length + ' firms match these filters'
         + (mktLetter ? ' and start with ' + esc(mktLetter) : '') + '. Widen them, or clear the tag.</p>'
       : '<p class="muted">No firms came back at all. That is unexpected. Check the filters above, then say so.</p>';
     return;
   }

   // ⭐⭐ BRANCHES HANG OFF THEIR PARENT AND NEVER APPEAR AS PEERS. ⚠️ A branch whose parent is not
   // in the current result (filtered out, or acquired and hidden) is promoted to top level rather
   // than vanishing -- losing a callable firm because its parent was filtered is the worse failure.
   var byId = {}, kids = {};
   for (var i = 0; i < rows.length; i++) byId[rows[i].id] = rows[i];
   for (var j = 0; j < rows.length; j++){
     var pid = rows[j].parent_id;
     if (pid && byId[pid]) (kids[pid] = kids[pid] || []).push(rows[j]);
   }
   var tops = rows.filter(function(x){ return !(x.parent_id && byId[x.parent_id]); });

   var h = '<div style="overflow-x:auto">'
         + '<table class="grid" style="min-width:1080px"><colgroup>'
         + '<col style="width:30px"><col><col style="width:40px">'
         + '<col style="width:58px"><col style="width:58px"><col style="width:58px">'
         + '<col style="width:124px"><col style="width:84px"><col style="width:92px">'
         + '<col style="width:120px"><col style="width:82px"></colgroup><thead><tr>'
         + '<th><input type="checkbox" onclick="selAll(this)"></th>'
         // Eric, 2026-08-26: "get rid of the city in the main view and just show state". The city
         // is still SEARCHABLE and still on the firm panel -- it left the grid, not the record.
         + '<th>Firm</th><th>St</th><th class="c">Agents</th><th class="c">Quotes</th>'
         // ⭐⭐ SALES SITS BESIDE QUOTES BECAUSE THE PAIR IS THE POINT. Quotes alone says who ASKS;
         // it takes both to see who BUYS, and this is the page you decide who to call from.
         + '<th class="c">Sales</th><th>Status</th>'
         + '<th>Priority</th><th>Owner</th><th>Tags</th><th class="date">Last contact</th>'
         + '</tr></thead><tbody>';

   function firmRow(a, depth){
     // ⭐ THE CELL IS THE STATE, AND THE CITY IS THE TOOLTIP. Dropping a fact off a screen and
     // dropping it out of reach are different things; this does the first and not the second.
     var where = a.state ? esc(a.state) : '<span class="muted">&mdash;</span>';
     var whereTip = [a.metro || a.city, a.state].filter(Boolean).join(', ');
     var tags = '';
     for (var k = 0; k < a.tags.length && k < 4; k++) tags += '<span class="tag">' + esc(a.tags[k].label) + '</span>';
     if (a.tags.length > 4) tags += '<span class="muted">+' + (a.tags.length - 4) + '</span>';
     // ⭐ BRANCHES ARE COUNTED IN WORDS. The caret that used to sit here said only "there is
     // something below"; a count says how much, and it does not have to be pressed to say it.
     var kidCount = (kids[a.id] || []).length;
     var branches = kidCount
       ? '<span class="branches">' + kidCount + (kidCount === 1 ? ' branch' : ' branches') + '</span>'
       : '';
     var out = '<tr>'
        + '<td><input type="checkbox" ' + (mktSel[a.id] ? 'checked ' : '') + 'onclick="selOne(this,' + "'" + a.id + "'" + ')"></td>'
        // 🔴 ONE BLOCK, NOT THREE INLINE THINGS. The name is its own element with its own left
        // edge, so a name that wraps lines up with itself. That is the whole fix for the ragged
        // column in Eric's screenshot -- the badges sit BELOW the name rather than after it.
        + '<td class="firmcell"' + (depth ? ' style="padding-left:20px"' : '') + '>'
        + '<a class="firmname" href="?firm=' + encodeURIComponent(a.id) + '" onclick="openFirm('
        + "'" + a.id + "'" + ');return false">' + esc(a.name) + '</a>'
        + ((branches || depth || a.needs_review)
            ? '<div class="firmmeta">'
              + branches
              + (depth ? '<span class="muted">branch</span>' : '')
              + (a.needs_review ? '<span class="rev" title="' + esc(a.needs_review) + '">check the name</span>' : '')
              + '</div>'
            : '')
        + '</td>'
        + '<td' + (whereTip ? ' title="' + esc(whereTip) + '"' : '') + '>' + where + '</td>'
        + '<td class="c">' + (a.agents || '<span class="muted">0</span>') + '</td>'
        + '<td class="c">' + (a.quotes ? a.quotes : '<span class="never">never</span>') + '</td>'
        // ⚠️ NO SALES and NEVER QUOTED are different facts and must not print the same way. A firm
        // that quoted 40 times and sold nothing is the finding; a dash there would hide it.
        + '<td class="c">' + (a.sales ? a.sales : '<span class="muted">0</span>') + '</td>'
        + '<td class="wrapcell">' + statusCell(a) + '</td>'
        + '<td>' + priSel(a.id, a.priority) + '</td>'
        + '<td>' + repSel(a.id, a.assigned_rep) + '</td>'
        + '<td class="wrapcell">' + (tags || '<span class="muted">&mdash;</span>') + '</td>'
        + '<td class="date">' + (a.last_contact ? day(a.last_contact) : '<span class="muted">&mdash;</span>') + '</td>'
        + '</tr>';
     var kl = kids[a.id] || [];
     for (var m = 0; m < kl.length; m++) out += firmRow(kl[m], (depth || 0) + 1);
     return out;
   }

   // A CHOSEN LETTER IS SHOWN WHOLE. The cap exists because 665 rows with their selects and tag
   // chips is a slow paint; one letter never is. Capping a letter would answer "take me to S" with
   // the first 150 firms, which is the scrolling problem again with an extra click in front of it.
   var shown = (MKT_ALL || mktLetter) ? tops : tops.slice(0, MKT_CAP);
   for (var t = 0; t < shown.length; t++) h += firmRow(shown[t], 0);
   h += '</tbody></table></div>';
   if (tops.length > MKT_CAP && !mktLetter){
     h += '<p style="text-align:center;margin:10px 0 0">'
        + '<button type="button" onclick="MKT_ALL=!MKT_ALL;paintMkt()" style="background:none;border:0;'
        + 'color:#2f6f4f;font-size:12.5px;cursor:pointer;text-decoration:underline">'
        + (MKT_ALL ? 'Showing all ' + tops.length + ' \u2014 show the first ' + MKT_CAP + ' only'
                   : 'Showing the first ' + MKT_CAP + ' of ' + tops.length + ' \u2014 show all (slower)')
        + '</button></p>';
   }
   q('mkt').innerHTML = h;
   showBulk();
 }

 function selOne(el, id){ if (el.checked) mktSel[id] = 1; else delete mktSel[id]; showBulk(); }
 function selAll(el){
   var boxes = q('mkt').querySelectorAll('tbody input[type=checkbox]');
   // ⚠️ Only the rows ON SCREEN. Selecting rows a filter is hiding is how forty become four hundred.
   for (var i = 0; i < boxes.length; i++){ boxes[i].checked = el.checked; boxes[i].onclick(); }
 }
 function clearSel(){ mktSel = {}; paintMkt(); }
 function selCount(){ return Object.keys(mktSel).length; }
 function showBulk(){
   var n = selCount();
   q('bulkBar').style.display = n ? 'flex' : 'none';
   q('bulkN').textContent = n + (n === 1 ? ' firm selected' : ' firms selected');
   if (!q('bulkDate').value) q('bulkDate').value = new Date().toISOString().slice(0, 10);
   if (!q('importDate').value) q('importDate').value = new Date().toISOString().slice(0, 10);
 }

 async function applyBulk(){
   var label = (q('bulkTag').value || '').trim();
   if (!label){ q('bulkMsg').textContent = 'Pick a tag first.'; return; }
   var ids = Object.keys(mktSel);
   if (!ids.length) return;
   var ents = ids.map(function(id){ return { type: 'agency', id: id }; });
   q('bulkMsg').textContent = 'Applying...';
   var r = await fetch('/api/admin/crm', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ kind: 'tag', label: label, happened_at: q('bulkDate').value, entities: ents }),
   });
   var d = await r.json().catch(function(){ return {}; });
   if (!r.ok){ q('bulkMsg').textContent = d.error || 'That did not save.'; return; }
   // ⭐⭐ THE NUMBER ON SCREEN IS THE NUMBER THAT LANDED. Eric's own guard for this build: a tag
   // applied to 40 firms must read back as 40. Skipped and failed are named, never rounded away.
   var msg = d.written + ' tagged';
   if (d.skipped) msg += ', ' + d.skipped + ' already had it that day';
   if (d.failed) msg += ', ' + d.failed + ' refused';
   q('bulkMsg').textContent = msg;
   mktSel = {};
   await loadMkt();
 }

 async function setField(el, id, field){
   var r = await fetch('/api/admin/crm/agency', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: id, field: field, value: el.value }),
   });
   if (!r.ok){ await failed(r, 'That did not save.'); return; }
   for (var i = 0; i < mktRows.length; i++){ if (mktRows[i].id === id) mktRows[i][field] = el.value; }
 }

 // A firm's own panel: its notes, its people, and what happened to it.
 // ⭐⭐ OPENING A FIRM IS A HISTORY STEP, SO BACK COMES BACK HERE.
 //
 // Eric, 2026-08-24: "How come when you click it and you hit back it goes to a different page rather
 // than brokers and agencies?" 🔴 Because opening a firm changed NOTHING the browser could see. The
 // control was <a href="#"> with return false, so no entry was ever pushed and Back went to whatever
 // page you were on BEFORE this one -- usually the quote log. The firm panel and the list looked like
 // two pages and the browser only ever knew about one.
 // ⭐ Now the firm id is in the URL, so Back returns to the list, Close does the same thing as Back,
 // and a firm panel can be linked to -- the same trick the dashboard's ?tool=__log already uses.
 // ⚠️ THE PUSH IS GUARDED. saveWhere, addNote, recordStatus and saveRel all re-open the panel to
 // repaint it; without the guard each save would stack another identical entry and Back would walk
 // through them one at a time instead of returning to the list.
 async function openFirm(id, fromHistory){
   var a = null;
   for (var i = 0; i < mktRows.length; i++){ if (mktRows[i].id === id) a = mktRows[i]; }
   if (!a) return;
   try {
     var cur = history.state && history.state.firm;
     if (!fromHistory && cur !== id) history.pushState({ firm: id }, '', '?firm=' + encodeURIComponent(id));
   } catch (e) { /* history is a nicety; the panel still opens without it */ }
   var r = await fetch('/api/admin/crm?entity_type=agency&entity_id=' + encodeURIComponent(id));
   var d = await r.json().catch(function(){ return {}; });
   var ev = d.events || [];
   var h = '<div class="card" style="border-color:#1a5c3a"><h2 style="cursor:default">' + esc(a.name)
         // ⭐ CLOSE AND BACK DO THE SAME THING. Two ways out that behave differently is how somebody
         // ends up with a Back button that does not undo the thing they just did.
         + ' <button style="margin-left:auto;font-size:13px" onclick="closeFirm()">Close</button></h2>'
         + '<div class="mfilters">'
         + '<input id="fCity" placeholder="City" value="' + esc(a.city || '') + '" style="padding:6px 9px;border:1px solid #c8d2de;border-radius:5px">'
         + '<input id="fState" placeholder="TX" maxlength="2" size="3" value="' + esc(a.state || '') + '" style="padding:6px 9px;border:1px solid #c8d2de;border-radius:5px">'
         + '<button onclick="saveWhere(' + "'" + id + "'" + ')">Save location</button>'
         + '<span class="muted">' + (a.metro ? esc(a.metro) : '') + '</span>'
         // Eric, 2026-08-26: "perhaps to the right of location, we could add the website when
         // known?" 830 of 1,453 firms have one and not one was typed by a person: the web list
         // carries a Website column, and a Tulsa firm IS its email domain.
         // ⛔ SHOWN ONLY WHEN THERE IS ONE. An empty slot on 623 rows would be a promise the
         // record cannot keep, and a link that goes nowhere is worse than no link on a screen
         // somebody is calling from.
         // ⚠️ rel=noopener because target=_blank hands the new tab a handle on this one.
         + (a.website
             ? ' <a class="site" href="' + esc(a.website) + '" target="_blank" rel="noopener">'
               + esc(String(a.website).replace(/^https?:[/][/]/, '').replace(/^www[.]/, '')) + '</a>'
             : '')
         + '</div>'
         + dispHTML(a)
         // \u2b50\u2b50 THE NAME IS EDITABLE HERE, AND UNTIL 2026-08-24 IT WAS NOT EDITABLE ANYWHERE.
         // A firm could be tagged, noted, aliased and marked acquired from this panel, but its name
         // could only be changed by somebody running SQL. So every correction Eric gave lived in a
         // chat window and the wrong spelling stayed in the database -- he had to say "HUB -
         // Wellspring" about a dozen times before it stuck.
         // Saving also CONFIRMS the name, which takes the firm out of the duplicate finder for good.
         + '<div class="mfilters" style="align-items:center">'
         + '<input id="fName" value="' + esc(a.name) + '" style="flex:1;min-width:230px;padding:6px 9px;'
         + 'border:1px solid #c8d2de;border-radius:5px;font-weight:600">'
         + '<button class="go" onclick="saveName(' + "'" + id + "'" + ')" '
         + 'style="background:#1a5c3a;color:#fff;border:1px solid #1a5c3a;border-radius:6px;'
         + 'padding:6px 13px;cursor:pointer;font-weight:600">Save the name</button>'
         + (a.name_confirmed_at
             ? '<span class="muted" style="font-size:12.5px">Confirmed ' + day(a.name_confirmed_at)
               + ' &mdash; the tidy-up list leaves it alone. '
               + '<a href="#" onclick="unconfirmName(' + "'" + id + "'" + ');return false">undo</a></span>'
             : '<button onclick="confirmName(' + "'" + id + "'" + ')" style="font-size:12.5px">'
               + 'This name is right &mdash; stop suggesting changes</button>')
         + '</div>'
         + '<div class="mfilters"><input id="fNote" placeholder="What happened?" style="flex:1;padding:6px 9px;border:1px solid #c8d2de;border-radius:5px">'
         + '<input id="fNoteDate" type="date" value="' + new Date().toISOString().slice(0, 10) + '">'
         + '<button onclick="addNote(' + "'" + id + "'" + ')">Add note</button></div>'
         + '<div id="fMsg" class="muted" style="margin-bottom:10px"></div>'
         // ⭐ RECORD WHAT THEY LOOK LIKE TODAY, so it can be compared with what they look like
         // later. The date is backdatable like every other event: you may be recording what was
         // true when you last spoke to them.
         + '<div class="mfilters"><span class="muted" style="font-size:13px">Record them as</span>'
         + '<select id="recStatus">' + RECORDED.map(function(s){
             return '<option value="' + s + '"' + (a.derivedStatus === s ? ' selected' : '') + '>' + s + '</option>';
           }).join('') + '</select>'
         + '<input id="recDate" type="date" value="' + new Date().toISOString().slice(0, 10) + '">'
         + '<button onclick="recordStatus(' + "'" + id + "'" + ')">Record</button>'
         + '<span class="muted" style="font-size:12.5px">' + (a.recordedStatus
             ? 'Last recorded as ' + esc(a.recordedStatus) + ' on ' + day(a.recordedAt)
             : 'Never recorded') + '</span></div>'
         // ⭐⭐ RECORD AN ACQUISITION WHERE YOU NOTICE IT. Of 672 firms only 12 are marked as
         // acquired and 9 as branches, and 47 rows have two names typed into one box. Only Eric
         // and Niels know these facts, so the job is to make recording one a click from the row
         // they are already looking at, rather than a research project nobody starts.
         // 🔴 THE TWO CHOICES BEHAVE IN OPPOSITE WAYS and the wording says so on screen: an
         // acquired name leaves this list for good, a branch stays on it.
         + '<details style="margin-bottom:12px"><summary style="cursor:pointer;font-size:13px;color:#5b6b7f">'
         + 'What happened to this firm?</summary><div class="mfilters" style="margin-top:10px">'
         + '<select id="fRel"><option value="">Nothing / clear it</option>'
         + '<option value="succeeded"' + (a.relationship === 'succeeded' ? ' selected' : '') + '>Acquired &mdash; the name is dead, drop it from this list</option>'
         + '<option value="alias"' + (a.relationship === 'alias' ? ' selected' : '') + '>The same firm, spelled differently &mdash; roll it up and drop it from this list</option>'
         + '<option value="division"' + (a.relationship === 'division' ? ' selected' : '') + '>Branch office &mdash; still callable, keep it here</option>'
         + '</select>'
         + '<select id="fParent"><option value="">Which firm?</option>' + parentOpts(a) + '</select>'
         + '<input id="fRelNote" placeholder="Note (optional)" value="' + esc(a.relationship_note || '') + '" style="flex:1;padding:6px 9px;border:1px solid #c8d2de;border-radius:5px">'
         + '<button onclick="saveRel(' + "'" + id + "'" + ')">Save</button>'
         + '</div></details>';
   // ⭐⭐ THE PEOPLE AT THIS FIRM, WITH THE PHONE-ONLY ONES ALONGSIDE THE EMAILED ONES. The row
   // already showed an agent COUNT; a count is not a call list. Fetched here rather than with the
   // main list because a firm panel is opened one at a time and 668 sub-queries is a slow page.
   h += '<h3 style="font-size:14px;margin:16px 0 6px;color:#1a5c3a">People we have on file</h3>'
      + '<div id="firmPeople"><p class="muted">Loading...</p></div>';
   if (!ev.length){
     h += '<p class="muted">Nothing recorded about this firm yet.</p>';
   } else {
     h += '<table class="grid"><colgroup><col style="width:100px"><col style="width:78px"><col><col style="width:26px"></colgroup><tbody>';
     for (var j = 0; j < ev.length; j++){
       h += '<tr><td class="date">' + day(ev[j].happened_at) + '</td><td>'
          + (ev[j].kind === 'tag' ? '<span class="tag">tag</span>' : '<span class="muted">note</span>')
          + '</td><td class="wrapcell">' + esc(ev[j].label || '') + (ev[j].label && ev[j].body ? ' &mdash; ' : '')
          + esc(ev[j].body || '')
          // ⛔ A MISTYPED NOTE HAS TO BE REMOVABLE FROM THE SCREEN IT WAS TYPED ON. The endpoint
          // existed and was tested before any control called it -- the third time in one day.
          // ⚠️ Deleting and re-writing is the RIGHT way to correct a recorded entry; editing one
          // in place is not, because a recorded value is a measurement and must not be restated.
          + '</td><td style="width:26px"><a href="#" title="Remove this entry" style="color:#a12622;text-decoration:none"'
          + ' onclick="delEvent(' + "'" + ev[j].id + "','" + id + "'" + ');return false">x</a></td></tr>';
     }
     h += '</tbody></table>';
   }
   q('mkt').innerHTML = h + '</div>';
   // ⚠️ AFTER the innerHTML, never before: the container it fills does not exist until this line
   // has run. Same shape as TRAPS #239 -- the first render is not a repaint.
   loadFirmPeople(id);
 }

 // ── OFF THE MARKETING LIST, STILL ON THE BOOKS ──────────────────────────────────────────────
 // Eric, 2026-08-26. Deliberately NOT a value in the priority dropdown: priority ranks who you are
 // working, this says whether to work them at all, and putting them together would mean setting
 // one destroys the other.
 var DISP_LABEL = {
   '': 'On the marketing list',
   out_of_business: 'Out of business',
   no_group_products: 'Does not sell group products',
   not_interested: 'Told us no',
   do_not_contact: 'Do not contact',
   deceased: 'Deceased',
   left_the_firm: 'No longer at this firm',
   // Eric, 2026-08-27: "we need to add retired as an option under an agent as well." It is
   // DELIBERATELY not suppressed: a retired agent has not asked us to stop, and is not deceased,
   // so "show me everything" should still find them -- they may refer, and they may know who took
   // the book. Off the working list, still on the books.
   retired: 'Retired',
   wrong_record: 'Not a real firm'
 };

 function dispHTML(a){
   var cur = a.disposition || '';
   var opts = '';
   for (var k in DISP_LABEL){
     opts += '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + esc(DISP_LABEL[k]) + '</option>';
   }
   var when = a.disposition_at ? ' <span class="muted">since ' + esc(day(a.disposition_at)) + '</span>' : '';
   return '<div style="margin:12px 0 0"><div class="sec">Marketing</div>'
     + '<div class="mfilters">'
     +   '<select id="fDisp">' + opts + '</select>'
     +   '<input id="fDispNote" placeholder="Why? (optional)" value="' + esc(a.disposition_note || '') + '" style="flex:1;padding:6px 9px;border:1px solid #c8d2de;border-radius:5px">'
     +   '<button class="go" onclick="saveDisp(' + "'" + esc(a.id) + "'" + ')">Save</button>'
     +   when
     + '</div>'
     // \u26d4 SAID OUT LOUD, because it is the one value that behaves differently from the others.
     + '<p class="sub" style="margin:6px 0 0">Anything other than <em>On the marketing list</em> hides '
     + 'this firm from the working list without deleting it. <strong>Do not contact</strong> also '
     + 'removes it from every list, including <em>Everything</em>.</p>'
     + '</div>';
 }

 async function saveDisp(id){
   var v = q('fDisp').value, note = q('fDispNote').value;
   // TWO WRITES, and the note goes first: if the second fails, a firm still on the list with a
   // stray note is recoverable, while a firm removed with no reason recorded is not.
   var a = await fetch('/api/admin/crm/agency', { method: 'POST', headers: {'Content-Type':'application/json'},
     body: JSON.stringify({ id: id, field: 'disposition_note', value: note }) });
   if (!a.ok){ var e1 = await a.json().catch(function(){return{}}); q('fMsg').textContent = e1.error || 'That did not save.'; return; }
   var b = await fetch('/api/admin/crm/agency', { method: 'POST', headers: {'Content-Type':'application/json'},
     body: JSON.stringify({ id: id, field: 'disposition', value: v }) });
   if (!b.ok){ var e2 = await b.json().catch(function(){return{}}); q('fMsg').textContent = e2.error || 'That did not save.'; return; }
   // \u2b50 THE LIST IS REFETCHED, not patched in memory: dispositioning a firm usually REMOVES it
   // from the current view, and a row that stays on screen after you took it off the list is the
   // clearest possible way to make somebody do it twice.
   await loadMkt();
   openFirm(id);
 }

 async function saveWhere(id){
   for (var f = 0; f < 2; f++){
     var field = f ? 'state' : 'city';
     var el = q(f ? 'fState' : 'fCity');
     var r = await fetch('/api/admin/crm/agency', {
       method: 'POST', headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ id: id, field: field, value: el.value }),
     });
     var d = await r.json().catch(function(){ return {}; });
     if (!r.ok){ q('fMsg').textContent = d.error || 'That did not save.'; return; }
     for (var i = 0; i < mktRows.length; i++){ if (mktRows[i].id === id) mktRows[i][field] = el.value; }
   }
   openFirm(id);
 }

 // ⛔ AN ERROR, AN EMPTY FIRM AND A FIRM FULL OF PHONE-ONLY CONTACTS ARE THREE DIFFERENT ANSWERS
 // and all three used to be renderable as the same blank space.
 async function loadFirmPeople(id){
   var box = document.getElementById('firmPeople');
   if (!box) return;
   firmPeopleId = id;   // so a saved disposition can refetch the list it changed the shape of
   var r = await fetch('/api/admin/crm/people?agency_id=' + encodeURIComponent(id));
   var d = await r.json().catch(function(){ return {}; });
   if (d.error){ box.innerHTML = '<p class="muted">Could not load these: ' + esc(d.error) + '</p>'; return; }
   var rows = d.people || [];
   if (!rows.length){ box.innerHTML = '<p class="muted">Nobody on file at this firm yet.</p>'
                                    + addPersonForm(id); return; }
   var noEmail = 0;
   for (var i = 0; i < rows.length; i++){ if (!Number(rows[i].has_email)) noEmail++; }
   // The vocabulary comes from the SERVER, never from a copy kept here. DISPOSITIONS gained
   // "retired" on Eric's word and a hand-written list in the page would have gone on offering
   // yesterday's options while the endpoint accepted today's.
   firmDisp = d.dispositions || [];
   firmSrc = d.sources || [];
   firmSrcLabel = d.sourceLabels || {};
   var h = '<table class="grid"><thead><tr><th>NAME</th><th>EMAIL</th><th>PHONE</th><th>CITY</th>'
         + '<th>SOURCE</th><th>STATUS</th><th style="text-align:right">QUOTES</th></tr></thead><tbody>';
   for (var j = 0; j < rows.length; j++){
     var x = rows[j];
     var pid = x.person_id || '';
     // ⛔ A ROW WITH NO PERSON ID GETS NO CONTROLS, AND SAYS SO. An address that was never
     // linked to a person has nothing to write to, and rendering a live-looking dropdown over it
     // would silently drop whatever somebody chose.
     var editable = !!pid;
     // ⭐ "No email yet" is a STATE we chose to accept, not a missing value. Saying so stops it
     // reading as a broken row, and it is the thing somebody would go and find out.
     h += '<tr><td>' + (esc(x.name || '') || '&mdash;') + '</td>'
        + '<td>' + (Number(x.has_email) ? esc(x.email) : '<span class="muted">no email yet</span>') + '</td>'
        + '<td>' + (editable ? personInput(pid, 'phone', x.phone, '90px') : (esc(x.phone || '') || '&mdash;')) + '</td>'
        + '<td>' + (editable ? personInput(pid, 'city', x.city, '90px') : (esc(x.city || '') || '&mdash;')) + '</td>'
        + '<td>' + (editable ? personSelect(pid, 'source', firmSrc, x.source, null, firmSrcLabel)
                             : '<span class="muted">' + esc(x.source || '') + '</span>') + '</td>'
        + '<td>' + (editable ? personSelect(pid, 'disposition', firmDisp, x.disposition, 'Active', null)
                             : '<span class="muted">&mdash;</span>') + '</td>'
        + '<td style="text-align:right">' + (Number(x.quotes) || 0) + '</td></tr>';
     // The REASON sits under the row that carries it, and only when there is a status to explain.
     // A note box on every row would be five hundred empty inputs on a firm like Higginbotham.
     if (editable && x.disposition){
       var since = x.disposition_at ? ' <span class="muted">since ' + esc(day(x.disposition_at)) + '</span>' : '';
       h += '<tr><td></td><td colspan="6" style="padding-top:0">'
          + personInput(pid, 'disposition_note', x.disposition_note, '100%', 'Why? (optional)')
          + since + '</td></tr>';
     }
   }
   h += '</tbody></table>';
   if (rows.length && !rows[0].person_id) h += '<p class="muted" style="font-size:12.5px">'
      + 'Some of these have no person record yet, so they cannot be edited here.</p>';
   if (noEmail) h += '<p class="muted" style="font-size:12.5px;margin-top:6px">'
                  + noEmail + ' of these ' + (noEmail === 1 ? 'has' : 'have')
                  + ' no email address yet and can only be reached by phone.</p>';
   box.innerHTML = h + addPersonForm(id);
 }

 // ── EDITING ONE PERSON, FROM THE FIRM PANEL ────────────────────────────────
 //
 // 🔴 people.disposition, .disposition_note and .disposition_at were migrated onto the table and
 // NOTHING READ OR WROTE ANY OF THEM. So "retired" -- which Eric asked for by name, and which
 // shipped into DISPOSITIONS the same evening -- was in the vocabulary and unselectable anywhere.
 // A value nobody can choose reads as a missing FEATURE, not a missing button.
 //
 // ⭐ THE DISPOSITION IS ON THE PERSON, NOT THE FIRM, AND THAT IS THE POINT. Before this, the only
 // way to record that one agent had retired was to mark their AGENCY retired -- which takes the
 // whole firm off the marketing list because one person left.
 //
 // ⭐ SOURCE IS EDITABLE HERE FOR A REASON ERIC GAVE: "some of the people we're going to import
 // are actually the ones who have requested some of the quotes that we've already recorded, so
 // they'll need to be ABY Brokers as the source, but I won't know that right away." Source is set
 // ONCE at first contact, so correcting it by hand is the only way it can ever change.
 var firmDisp = [], firmSrc = [], firmSrcLabel = {}, firmPeopleId = '';

 function personInput(pid, field, value, width, placeholder){
   return '<input value="' + esc(value || '') + '"'
        + (placeholder ? ' placeholder="' + esc(placeholder) + '"' : '')
        + ' onchange="savePerson(this, ' + JSON.stringify(pid) + ', ' + JSON.stringify(field) + ')"'
        + ' style="width:' + width + ';padding:4px 6px;border:1px solid #c8d2de;border-radius:4px;font-size:12.5px">';
 }

 function personSelect(pid, field, values, current, blankLabel, labels){
   var o = '<option value="">' + esc(blankLabel || '\u2014') + '</option>';
   for (var i = 0; i < values.length; i++){
     var v = values[i];
     var label = (labels && labels[v]) ? labels[v] : (DISP_LABEL[v] || v);
     o += '<option value="' + esc(v) + '"' + (current === v ? ' selected' : '') + '>' + esc(label) + '</option>';
   }
   return '<select onchange="savePerson(this, ' + JSON.stringify(pid) + ', ' + JSON.stringify(field) + ')"'
        + ' style="padding:4px 6px;border:1px solid #c8d2de;border-radius:4px;font-size:12.5px">' + o + '</select>';
 }

 // ⛔ THE LIST IS REFETCHED AFTER A DISPOSITION, NOT PATCHED IN MEMORY -- the same rule the firm
 // panel already follows, and for a sharper reason here: setting one lays out a note row under it
 // and clearing one takes that row away, so the table's SHAPE changes, not just a cell.
 async function savePerson(el, pid, field){
   var box = document.getElementById('firmPeople');
   var r = await fetch('/api/admin/crm/person-field', {
     method: 'POST', headers: {'Content-Type':'application/json'},
     body: JSON.stringify({ id: pid, field: field, value: el.value }),
   });
   var d = await r.json().catch(function(){ return {}; });
   if (!r.ok){
     // 🔴 A REFUSED SAVE MUST NOT LOOK LIKE A SAVED ONE. The control keeps whatever was typed, so
     // leaving it alone would show the new value sitting in a field that never took it.
     if (box) box.insertAdjacentHTML('afterbegin',
       '<p class="muted" style="color:#a11">That did not save: ' + esc(d.error || 'unknown error') + '</p>');
     return;
   }
   if (field === 'disposition') loadFirmPeople(firmPeopleId);
 }

 // ── ADD A PERSON, WITHOUT PRETENDING IT WAS AN EVENT ──────────────────────────────────────
 //
 // Eric, 2026-08-27: "That's kind of a dumb way though to add someone because it's not from an
 // event. Kelly just works there and I know it." Until now the ONLY way to record a person was
 // the event paste, which asks for a tag and a date -- so recording a plain fact about who works
 // where meant inventing an occasion that never happened.
 //
 // ⭐ It posts to the SAME endpoint as the event paste, deliberately. The identity rules are hard
 // and they are already written once: an email is the key when there is one, otherwise name plus
 // firm, and a name matching more than one person is REFUSED rather than guessed. A second copy
 // of that logic here would be the place the two quietly stopped agreeing.
 function addPersonForm(id){
   var a = null;
   for (var i = 0; i < mktRows.length; i++){ if (mktRows[i].id === id){ a = mktRows[i]; break; } }
   var nm = a ? a.name : '';
   return '<div style="margin-top:12px;padding-top:10px;border-top:1px solid #e4eaf0">'
     + '<div style="font-size:12.5px;color:#5f6b76;margin-bottom:6px">Add someone who works at '
     + '<strong>' + esc(nm || 'this firm') + '</strong></div>'
     + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">'
     + '<input id="npName" placeholder="Name" style="flex:1 1 150px;padding:7px;border:1px solid #c8d2de;border-radius:6px">'
     + '<input id="npEmail" placeholder="Email (optional)" style="flex:1 1 180px;padding:7px;border:1px solid #c8d2de;border-radius:6px">'
     + '<input id="npPhone" placeholder="Phone (optional)" style="flex:1 1 130px;padding:7px;border:1px solid #c8d2de;border-radius:6px">'
     + '<input id="npCity" placeholder="City (optional)" style="flex:1 1 120px;padding:7px;border:1px solid #c8d2de;border-radius:6px">'
     + '<button onclick="addFirmPerson(' + "'" + id + "'" + ')" '
     + 'style="background:#1a5c3a;color:#fff;border:1px solid #1a5c3a;border-radius:6px;padding:7px 15px;cursor:pointer;font-weight:600">Add</button>'
     + '<span class="muted" id="npMsg"></span></div>'
     + '<p class="sub" style="margin:6px 0 0;font-size:12px">No email needed -- somebody is known by '
     + 'their address when there is one, and otherwise by their name and this firm together.</p>'
     + '</div>';
 }

 async function addFirmPerson(id){
   var msg = document.getElementById('npMsg');
   var name = (document.getElementById('npName').value || '').trim();
   if (!name){ msg.textContent = 'A name is needed.'; return; }
   var a = null;
   for (var i = 0; i < mktRows.length; i++){ if (mktRows[i].id === id){ a = mktRows[i]; break; } }
   if (!a){ msg.textContent = 'Could not tell which firm this is -- reload the page.'; return; }
   msg.textContent = 'Adding...';
   var r = await fetch('/api/admin/crm/import', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       rows: [{ name: name,
                email: (document.getElementById('npEmail').value || '').trim(),
                phone: (document.getElementById('npPhone').value || '').trim(),
                city: (document.getElementById('npCity').value || '').trim(),
                agency: a.name }],
       // Somebody we were TOLD about. Not an event, and not a list.
       source: 'hand_added' })
   });
   var d = await r.json().catch(function(){ return {}; });
   if (!r.ok || d.error){ msg.textContent = d.error || 'That did not save.'; return; }
   // ⛔ A REFUSAL IS NOT A SAVE, AND IT MUST NOT READ AS ONE. An ambiguous name comes back in
   // refused[] with a 200, so checking only r.ok would print "Added." over a person who was not.
   var refused = (d.refused || [])[0];
   await loadFirmPeople(id);
   // The list was just re-rendered, so the old element is gone -- ask for the new one.
   var m2 = document.getElementById('npMsg');
   if (!m2) return;
   m2.textContent = refused ? ('Not added: ' + refused.why)
                  : ((d.added && d.added.length) ? 'Added.'
                  : ((d.adopted && d.adopted.length) ? 'Already known -- their email is now on file.'
                  : 'Already on file at this firm.'));
 }

 // The firms this one could sit under. ⛔ ONLY TOP-LEVEL FIRMS ARE OFFERED, because the rollup on
 // the analysis page joins the parent with a SINGLE join -- a grandparent chain would truncate
 // silently and roll a child up to the wrong firm. The server refuses one too; this stops the
 // person being offered a choice that will be rejected.
 function parentOpts(a){
   var h = '';
   for (var i = 0; i < mktRows.length; i++){
     var o = mktRows[i];
     if (o.id === a.id || o.parent_id) continue;
     h += '<option value="' + o.id + '"' + (a.parent_id === o.id ? ' selected' : '') + '>' + esc(o.name) + '</option>';
   }
   return h;
 }

 // -- CORRECTING A NAME, AND MAKING IT STICK ---------------------------------------------------
 //
 // ERIC, 2026-08-24: "I have told you about 12 times now that Hubs-Wellspring is not right and it
 // should be HUB - Wellspring. Why do you have that page for me to tidy up if you are going to
 // ignore the answers."
 // Because until now the page could not take that answer. There was no way to change a firm's name
 // on any screen -- only a session running SQL could -- so his corrections lived in chat and the
 // wrong spelling stayed in the database. Saving a name here renames the firm, moves its quotes and
 // sales with it, and marks the name settled so the duplicate finder stops proposing it.
 async function saveName(id){
   var el = q('fName');
   if (!el) return;
   var want = (el.value || '').trim();
   if (!want){ q('fMsg').textContent = 'A firm needs a name.'; return; }
   q('fMsg').textContent = 'Saving...';
   var r = await fetch('/api/admin/crm/rename', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: id, name: want, confirm: true }),
   });
   var d = await r.json().catch(function(){ return {}; });
   // \ud83d\udd34 A REFUSAL IS SHOWN, NOT SWALLOWED. Renaming onto a firm that already exists is a MERGE
   // and the server says so rather than quietly making a second row with the same name.
   if (!r.ok){ q('fMsg').innerHTML = '<span style="color:#a12622">' + esc(d.error || 'That did not save.') + '</span>'; return; }
   q('fMsg').textContent = d.renamed
     ? 'Renamed. ' + d.quotes + ' quote(s) and ' + d.sales + ' sale(s) moved with it, each noting the old spelling.'
     : 'Name confirmed.';
   await loadMkt();
   openFirm(id, true);
 }

 async function confirmName(id){ await setConfirmed(id, true); }
 async function unconfirmName(id){ await setConfirmed(id, false); }

 async function setConfirmed(id, on){
   q('fMsg').textContent = on ? 'Confirming...' : 'Reopening...';
   var r = await fetch('/api/admin/crm/rename', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: id, confirm: on }),
   });
   var d = await r.json().catch(function(){ return {}; });
   if (!r.ok){ q('fMsg').innerHTML = '<span style="color:#a12622">' + esc(d.error || 'That did not save.') + '</span>'; return; }
   q('fMsg').textContent = on
     ? 'Confirmed. The tidy-up list will leave this name alone.'
     : 'Reopened. It can be suggested again.';
   await loadMkt();
   openFirm(id, true);
 }

 async function saveRel(id){
   var rel = q('fRel').value, par = q('fParent').value;
   var r = await fetch('/api/admin/crm/relationship', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: id, relationship: rel, parent_id: par, note: q('fRelNote').value }),
   });
   var d = await r.json().catch(function(){ return {}; });
   if (!r.ok){ q('fMsg').textContent = d.error || 'That did not save.'; return; }
   // ⚠️ SAY WHERE IT WENT. Marking a firm as acquired REMOVES IT FROM THIS LIST, and a row
   // vanishing with no explanation reads as a bug rather than as the thing you just asked for.
   await loadMkt();
   if (rel === 'succeeded'){
     q('mCount').textContent += ' - that firm is now hidden, because nobody can call it';
   } else {
     openFirm(id);
   }
 }
 async function delEvent(eventId, firmId){
   var r = await fetch('/api/admin/crm/delete', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: eventId }),
   });
   var d = await r.json().catch(function(){ return {}; });
   if (!r.ok){ q('fMsg').textContent = d.error || 'That did not delete.'; return; }
   await loadMkt();
   openFirm(firmId);
 }

 async function addNote(id){
   var body = (q('fNote').value || '').trim();
   if (!body){ q('fMsg').textContent = 'Type the note first.'; return; }
   var r = await fetch('/api/admin/crm', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ kind: 'note', body: body, happened_at: q('fNoteDate').value,
                            entities: [{ type: 'agency', id: id }] }),
   });
   var d = await r.json().catch(function(){ return {}; });
   if (!r.ok){ q('fMsg').textContent = d.error || 'That did not save.'; return; }
   q('fNote').value = '';
   await loadMkt();
   openFirm(id);
 }

 // ⭐ THE REMEMBERED VIEW IS RESTORED FIRST, AND IT DECIDES WHAT GETS FETCHED.
 // 🔴 THIS USED TO CALL load() UNCONDITIONALLY HERE, one line above the restore -- so the
 // heavy analysis was already in flight before the page knew which view you wanted. The old
 // note said the restore had to come second to avoid racing the two loads; now that each view
 // loads its own rows there is only ever ONE load in flight, so the race is gone rather than
 // reordered.
 // ⭐ setView IS CALLED EVEN WHEN THE VIEW IS NOT CHANGING, because it is what writes the hint
 // beside the buttons. Restoring only the remembered view left a first-time visitor looking at
 // two unlabelled buttons and an empty space.
 // ⭐ A ?firm= LINK OVERRIDES THE REMEMBERED VIEW. Landing on the analysis page because that is
 // where you were last is the wrong answer when the URL names a firm to open.
 var wantsFirm = String(location.search || '').indexOf('firm=') !== -1;
 // ⭐ ?view= AND ?quoted= ARE HONOURED, AND THAT IS WHAT MAKES THE /admin/pipeline REDIRECT LAND
 // SOMEWHERE REAL rather than on whichever view you happened to leave this page on. A retired page
 // that redirects to "the general area" is a broken link with extra steps.
 var QS = new URLSearchParams(location.search || '');
 var wantsMkt = QS.get('view') === 'marketing';
 var wantsQuoted = QS.get('quoted') || '';
 if (wantsQuoted === 'no' || wantsQuoted === 'yes') {
   var qsel = document.getElementById('mQuoted');
   if (qsel) qsel.value = wantsQuoted;
 }
 try {
   setView(wantsFirm || wantsMkt || localStorage.getItem('abyCrmView') === 'marketing' ? 'marketing' : 'performance');
 } catch(e) { setView(wantsFirm || wantsMkt ? 'marketing' : 'performance'); }

 // ── THE RECORDED STATUS, BESIDE THE LIVE ONE ────────────────────────────────────────────
 //
 // ⭐⭐ ERIC: 'we tagged this originally as one quote ever and now they have done six, something
 // is working.' The FROZEN value and the LIVE one have to sit together or the question cannot
 // be asked at all.
 // ⛔ AND THE MOVEMENT IS WHAT IS WORTH SEEING, so a recorded value that MATCHES today is shown
 // quietly and one that DIFFERS is shown loudly. A column where every row looks the same is a
 // column nobody reads.
 var RECORDED = ['never quoted','quoted once','occasional','regular','former'];

 function statusCell(a){
   var live = a.derivedStatus || '';
   var rec = a.recordedStatus;
   if (!rec) {
     // Nothing recorded: print the live status and stop. See the block above adminBrokersHTML().
     return '<span>' + esc(live) + '</span>';
   }
   if (rec === live) {
     return '<span>' + esc(live) + '</span>'
          + '<div class="muted" style="font-size:11.5px">same since ' + day(a.recordedAt) + '</div>';
   }
   return '<strong style="color:#1a5c3a">' + esc(live) + '</strong>'
        + '<div style="font-size:11.5px;color:#8a6d1f">was ' + esc(rec) + ' &middot; ' + day(a.recordedAt) + '</div>';
 }

 async function recordStatus(id){
   var sel = q('recStatus'), when = q('recDate');
   var r = await fetch('/api/admin/crm/status', {
     method: 'POST', headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ id: id, status: sel.value, happened_at: when.value }),
   });
   var d = await r.json().catch(function(){ return {}; });
   if (!r.ok){ q('fMsg').textContent = d.error || 'That did not save.'; return; }
   // ⛔ RECORDING NEVER REPLACES AN EARLIER RECORDING. A second one on a later date is a second
   // observation, and that is the entire point -- so the panel reloads to show the history.
   q('fMsg').textContent = d.skipped
     ? 'Already recorded that on ' + d.happened_at + '.'
     : 'Recorded as ' + d.recorded + ' on ' + d.happened_at + '.';
   await loadMkt();
   openFirm(id);
 }
</script></body></html>`;
}

// The rate viewer. Reads the SAME pricing.js the quote tool uses, loaded as a script, so there is
// no second copy of the rates to drift out of step.
// The referral partners page (Eric, 2026-08-19).
//
// ABY's CLIENT list -- who we serve, as distinct from who we quoted and who bought (F-377).
//
// ERIC, 2026-08-22: "I want the ABY client list to be part of the ABY admin."
//
// 🔴🔴 THE SCREEN SHOWS THREE LISTS SIDE BY SIDE AND DELIBERATELY DOES NOT RECONCILE THEM. Measured
// against live D1: only 47 of 406 recorded sales appear in the client folder list. Neither
// termination nor a setup-and-invoice lag explains that -- a lag predicts a gradient by age, and
// the miss rate is flat at 75 to 100 percent across fifteen months. Until somebody can say what
// the folder list is actually a list of, a merged view would assert that 359 sold groups are not
// clients, and afterwards nobody could tell which rows were known and which were assumed.
//
// ⭐ SO THE THIRD PANEL IS THE POINT, NOT AN APPENDIX: "sales with no client folder" is the open
// question rendered as a worklist, and it shrinks as the answer arrives.
//
// ⚠️ THE COUNTS HERE COME FROM normName(), NOT FROM SQL. A raw lower(name) join finds 91 where the
// normaliser finds 123. See handleAdminClients.
function adminClientsHTML() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Clients — ABY admin</title>
<style> *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}
${ADMIN_HEADER_CSS}
 main{max-width:1180px;margin:0 auto;padding:20px}
 .card{background:#fff;border:1px solid #e3e9f0;border-radius:9px;padding:16px 18px;margin-bottom:16px}
 .card h2{cursor:pointer;user-select:none}
 .card h2 .tw{font-size:11px;color:#8a97a8;margin-right:6px;display:inline-block;transition:transform .12s}
 .card.shut h2 .tw{transform:rotate(-90deg)}
 .card.shut .sub,.card.shut>div,.card.shut>table,.card.shut>p:not(.sub){display:none}
 h2{margin:0 0 4px;font-size:15px} .sub{margin:0 0 12px;color:#5b6b7f;font-size:13px}
 table{width:100%;border-collapse:collapse;font-size:14px}
 th{text-align:left;font-size:12px;text-transform:uppercase;color:#5b6b7f;border-bottom:1px solid #dfe5ec;padding:8px 6px}
 td{padding:8px 6px;border-bottom:1px solid #eef2f6}
 td.date,th.date{white-space:nowrap;width:1%}
 .n{text-align:right} .muted{color:#8a97a8}
 input,select{padding:6px 8px;border:1px solid #c8d2de;border-radius:6px;font-size:13px}
 .tiles{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px}
 .tile{flex:1 1 150px;border:1px solid #e3e9f0;border-radius:8px;padding:10px 12px;background:#fff}
 .tile b{display:block;font-size:22px;line-height:1.2}
 .tile span{font-size:12px;color:#5b6b7f}
 .tile.flag{border-color:#f0d9ae;background:#fdf7ec}
 .pill{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;font-weight:600}
 .pill.term{background:#fde8e8;color:#8a1c1c;border-color:#f5c2c2}
    .pill.act{background:#e4f4ec;color:#1a5c3a}
 .pill.unk{background:#eef2f6;color:#5b6b7f}
 .warn{margin:0 0 14px;padding:10px 14px;border-radius:7px;background:#fdf1e0;border:1px solid #f0d9ae;color:#7a5410;font-size:13px}
 .note{margin:0 0 14px;padding:10px 14px;border-radius:7px;background:#eef4fb;border:1px solid #cddff2;color:#234a77;font-size:13px}
</style></head><body>
${abyAdminNav('/admin/clients')}
<main>
  <div id="warn" class="warn" style="display:none"></div>

  <!-- ⭐ FOLDED AWAY BY DEFAULT. Eric, 2026-08-22: "the insights at the top of the clients page
       needs to be a toggle - we probably won't want to see that all the time." The counts and the
       explanation are worth having and are not worth carrying above every visit, so the card
       remembers its state and starts shut. -->
  <div class="card" id="insights">
    <h2>Overview</h2>
    <div class="tiles" id="tiles"></div>

    <div class="note">
    <b>These are three different records and this page keeps them apart on purpose.</b>
    A <b>quote</b> is a proposal we sent. A <b>sale</b> is something that happened on a date.
    A <b>client</b> is somebody we serve today, active or termed.
    <span id="gap"></span>
    <span id="attrib"></span>
    The reason is known: the sold groups sit in a <b>second folder tree</b> &mdash; Summit &mdash;
    which accounts for <b>226 of the 353</b> sales that had no folder before it was loaded, and 72%
    of the COBRA ones. So nothing here is merged, and no employer is ever marked <i>termed</i> just
      for being absent from a list.
    </div>
  </div>

  <div class="card">
    <h2>Clients</h2>
    <!-- ⛔ KEEP THIS SHORT. It said where the list came from, which stretches of the alphabet had
         been missing before they were filled in, and why the count is a floor. Eric: "I don't like
         this text at the top of the clients page." He is right and it is the second time today:
         the same instinct produced "announced 2025" on the quote log.
         ⭐⭐ THE PATTERN WORTH LEARNING: provenance and caveats are for the NOTES, not the screen.
         A reader here wants to know what they are looking at, not how it was assembled or how much
         to distrust it. The reasoning is not lost -- it lives in F-377 and in TRAPS. -->
    <p class="sub">From the shared-drive client folders: Active Groups, Summit, and the termed
      list.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <input id="q" placeholder="Search a client" style="min-width:260px" oninput="draw()">
      <select id="filter" onchange="draw()">
        <option value="active" selected>Active clients</option>
        <option value="">All clients (active and termed)</option>
        <option value="termed">Termed clients</option>
        <option value="started">We know when they started</option>
        <option value="noagency">No agency on file</option>
        <option value="contested">More than one agency quoted them</option>
        <option value="pending">Pending quote, and an active client</option>
        <option value="quoted">Quoted at some point</option>
        <option value="never">Never quoted through the tool</option>
      </select>
      <span id="count" class="muted" style="align-self:center"></span>
    </div>
    <div id="rows"></div>
  </div>

  <div class="card">
    <h2>Sales with no client folder</h2>
    <p class="sub">The open question, as a list. Somebody bought, and there is no client folder for
      them. Either the folder list is narrower than &ldquo;our clients&rdquo;, or these are filed
      somewhere else.</p>
    <div id="orphans"></div>
  </div>
</main>
<script>
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function day(s){return s?String(s).slice(0,10):'—'}
 var DATA={totals:{},rows:[],orphanSales:[]};

 async function load(){
  var d=await (await fetch('/api/admin/clients')).json().catch(function(){return{}});
  DATA=d||{};
  if(d && d.unavailable && Object.keys(d.unavailable).length){
    var w=document.getElementById('warn');
    w.style.display='block';
    w.textContent='Some of this could not be read: '+Object.keys(d.unavailable).join(', ')+
      '. The numbers below are incomplete, not zero.';
  }
  tiles(); draw(); orphans(); wireCollapse();
  // TWO CALL SITES, like the brokers page: the card exists in the markup before any fetch
  // returns, so wiring it only after load() leaves it unclickable until the data lands --
  // and on a slow or failed request, permanently.
 }

 function tiles(){
  var t=DATA.totals||{};
  var at=document.getElementById('attrib');
  if(at) at.innerHTML=' <b>Every client here is a sale</b> — the sales list holds '+
    (t.sales||0).toLocaleString()+' records only because it is fifteen months of announcement '+
    'emails. Matching each client against the quotes, which reach back to 2008, puts an agency on '+
    '<b>'+(t.clientsAttributed||0).toLocaleString()+'</b> of them; <b>'+
    (t.clientsFromQuoteOnly||0).toLocaleString()+'</b> of those come from a quote rather than a '+
    'sale record. <b>'+(t.clientsUnattributed||0).toLocaleString()+'</b> have nothing on file '+
    'saying who brought them, and '+(t.clientsContested||0).toLocaleString()+' were quoted by more '+
    'than one agency.';
  var g=document.getElementById('gap');
  if(g) g.innerHTML='Only <b>'+(t.salesMatchedToClient||0).toLocaleString()+' of '+
    (t.sales||0).toLocaleString()+'</b> recorded sales appear in the client folder list, and '+
    '<b>'+(t.orphanSalesQuoted||0).toLocaleString()+'</b> of the '+
    (t.salesWithNoClient||0).toLocaleString()+' that do not were quoted through this tool and then '+
    'bought &mdash; so they are not strangers to ABY&rsquo;s records.';
  var cells=[
   ['Active clients', t.clientsActive, ''],
   ['Termed clients', t.clientsTermed, ''],
   ['Quoted at some point', t.clientsQuoted, ''],
   ['We know which agency brought them', t.clientsAttributed, ''],
   ['No agency on file', t.clientsUnattributed, 'flag'],
   ['Never quoted here', t.clientsNeverQuoted, ''],
   ['Pending quotes on an active client', t.pendingQuotesOnActive, 'flag'],
   ['Sales with no client folder', t.salesWithNoClient, 'flag'],
   ['Quoted, no client folder', t.quotedNotAClient, '']
  ];
  document.getElementById('tiles').innerHTML=cells.map(function(c){
   return '<div class="tile '+c[2]+'"><b>'+(c[1]==null?'—':Number(c[1]).toLocaleString())+
          '</b><span>'+c[0]+'</span></div>';
  }).join('');
 }

 // ⭐⭐ ONE LIST, DEFAULTING TO ACTIVE -- NOT TWO LISTS. Eric asked whether active and termed
 // should be separate pages. The question this screen mostly answers is "is this company a
 // client?", and you do not know BEFORE searching which of the two they are in.
 // 🔴 SO TWO SEPARATE LISTS CREATE A FALSE NEGATIVE: you search the active list, find nothing, and
 // conclude they are not a client while they sit in the other one. An absence reading as a fact is
 // the failure this project keeps hitting.
 // ⭐ The compromise: the DEFAULT is active, so the live book is clean, but a search always looks
 // at everything and SAYS SO when the filter is hiding matches.
 function showAll(){ document.getElementById('filter').value=''; draw(); }
 function matches(r, q, f){
  if(q && r.name.toLowerCase().indexOf(q)<0) return false;
  if(f==='started') return !!r.started;
  if(f==='noagency') return r.attribution==='none';
  if(f==='contested') return r.attribution==='contested';
  if(f==='active') return r.status==='active';
  if(f==='termed') return r.status==='termed';
  if(f==='pending') return r.pendingButActive;
  if(f==='quoted') return r.quotes>0;
  if(f==='never') return r.quotes===0;
  return true;
 }
 // ⚠️ The twisty is added to the DOM rather than written into the heading, so a new card gets the
 // behaviour without anyone remembering to mark it up. Same helper as the brokers page.
 function wireCollapse(){
   Array.prototype.forEach.call(document.querySelectorAll('.card'),function(card){
     var h=card.querySelector('h2'); if(!h||h.dataset.wired) return;
     h.dataset.wired='1';
     var key='abyfold:clients:'+h.textContent.trim();
     var tw=document.createElement('span'); tw.className='tw'; tw.textContent='\u25bc';
     h.insertBefore(tw,h.firstChild);
     // ⭐ SHUT UNLESS THE READER HAS SAID OTHERWISE. The Overview is reference, not the reason to
     // open this page; the client table is. An unset preference means shut for it and open for
     // everything else, so the default matches what the card is FOR.
     var saved=localStorage.getItem(key);
     if(saved==='shut' || (!saved && card.id==='insights')) card.classList.add('shut');
     h.onclick=function(){
       card.classList.toggle('shut');
       localStorage.setItem(key, card.classList.contains('shut')?'shut':'open');
     };
   });
 }

 function draw(){
  var q=(document.getElementById('q').value||'').toLowerCase().trim();
  var f=document.getElementById('filter').value;
  var all=(DATA.rows||[]);
  var rows=all.filter(function(r){ return matches(r,q,f); });
  // How many the SEARCH found that the FILTER is hiding. Computed with the same matcher, so the
  // two can never disagree about what counts as a match.
  var hidden=q ? all.filter(function(r){ return matches(r,q,'') ; }).length-rows.length : 0;
  // ⛔ NO NESTED QUOTES IN THE HANDLER. Quoting inside an inline onclick needs backslashes, and
  // this page is a template literal that eats a lone one -- so the escapes vanished and the
  // emitted script was a syntax error (TRAPS #248, again, in the same session). A named function
  // takes no arguments and therefore needs no quoting at all.
  var note=hidden>0
   ? ' <a href="#" onclick="showAll();return false" style="color:#1a5c3a">'
     +hidden.toLocaleString()+' more match outside this filter</a>'
   : '';
  document.getElementById('count').innerHTML=rows.length.toLocaleString()+' shown'+note;
  if(!rows.length){
   document.getElementById('rows').innerHTML='<p class="muted">Nothing matches'
    +(hidden>0?', but '+hidden.toLocaleString()+' match outside this filter.':'.')+'</p>';
   return;
  }
  var h='<table><tr><th>Client</th><th>Status</th><th class="date" title="When they came on '+
        'board, taken from the quote that originated them. Most are marked ~ because the quote '+
        'recorded only a month.">Started</th><th class="n">Quotes</th><th class="n">Pending</th>'+
        '<th class="n">Sold</th><th class="date">Last quote</th><th>Agency</th><th class="n">Sales</th></tr>';
  rows.slice(0,400).forEach(function(r){
   h+='<tr><td>'+esc(r.name)+
      (r.twoFolders?' <span class="muted" title="'+esc(r.note)+'">(2 folders)</span>':'')+'</td>'+
      '<td><span class="pill '+(r.status==='active'?'act':(r.status==='termed'?'term':'unk'))+'">'+
      esc(r.status)+(r.termDate?' '+esc(r.termDate):'')+'</span></td>'+
      '<td class="date">'+(r.started
          ? (r.startedIsEstimate
              // A TILDE AND A MONTH, NOT A DAY. The source said "Aug 2025 or later"; printing
              // "2025-08-01" would invent a day and quietly turn an estimate into a record.
              ? '<span class="muted" title="Estimated from the originating quote, which recorded '
                + 'only a month. The day is not known.">~'+esc(r.started.slice(0,7))+'</span>'
              : esc(r.started))
          : '<span class="muted">—</span>')+'</td>'+
      '<td class="n">'+(r.quotes||'')+'</td>'+
      '<td class="n">'+(r.pendingButActive?'<b>'+r.pending+'</b>':(r.pending||''))+'</td>'+
      '<td class="n">'+(r.sold||'')+'</td>'+
      '<td class="date">'+(r.lastQuote||'—')+'</td>'+
      '<td>'+(r.attribution==='none'
          ? '<span class="muted">not on file</span>'
          : esc(r.agency||'')
            + (r.attribution==='contested'
                ? ' <span class="pill unk" title="'+r.firmCount+' agencies quoted this'
                  + ' employer, so who brought them is a judgment. Two brokers competing on one'
                  + ' account is a real case in this book and nothing here picks a winner.">'
                  + r.firmCount+' agencies</span>'
                : (r.attribution==='quote'
                    ? ' <span class="muted" title="Inferred from a quote that matches this'
                      + ' employer, not from a sale record. The sales list only goes back to late'
                      + ' May 2025; the quotes reach 2008.">from quote</span>'
                    : ''))
        )+'</td>'+
      '<td class="n">'+(r.sales||'')+'</td></tr>';
  });
  h+='</table>';
  if(rows.length>400) h+='<p class="muted">Showing the first 400 of '+rows.length.toLocaleString()+
     '. Search to narrow it — nothing is hidden, the list is just long.</p>';
  document.getElementById('rows').innerHTML=h;
 }

 function orphans(){
  var o=DATA.orphanSales||[];
  if(!o.length){ document.getElementById('orphans').innerHTML='<p class="muted">None.</p>'; return; }
  var h='<table><tr><th>Employer</th><th class="date">Announced</th><th>Products</th>'+
        '<th>Agency</th><th class="n">Quotes</th></tr>';
  o.slice(0,400).forEach(function(r){
   h+='<tr><td>'+esc(r.employer)+'</td><td class="date">'+day(r.announced)+'</td>'+
      '<td>'+esc(r.products||'')+'</td><td>'+esc(r.agency||'')+'</td>'+
      '<td class="n">'+(r.quotes||'')+'</td></tr>';
  });
  h+='</table>';
  if(o.length>400) h+='<p class="muted">Showing the first 400 of '+o.length.toLocaleString()+'.</p>';
  document.getElementById('orphans').innerHTML=h;
 }

 wireCollapse(); load();
</script></body></html>`;
}

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
${ADMIN_HEADER_CSS}
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
 button{padding:6px 12px;border:1px solid #1a5c3a;background:#1a5c3a;color:#fff;border-radius:6px;font-size:13px;cursor:pointer}
 button.ghost{background:#fff;color:#1a5c3a}
 .partner{border:1px solid #e3e9f0;border-radius:9px;margin-bottom:14px;background:#fff}
 .phead{display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid #eef2f6;flex-wrap:wrap}
 .pname{font-weight:600;font-size:15px}
 .score{display:flex;gap:14px;margin-left:auto;flex-wrap:wrap;font-size:13px;color:#5b6b7f}
 .score b{color:#12263f}
 .pbody{padding:12px 16px}
 .warn{margin:0 0 14px;padding:10px 14px;border-radius:7px;background:#fdf1e0;border:1px solid #f0d9ae;color:#7a5410;font-size:13px}
</style></head><body>
${abyAdminNav('/admin/referrals')}
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
     // ⛔ AN EMPTY SET MUST NOT ASSERT A HAPPY STATE. This said "Everyone has a referrer recorded"
     // whenever the list was empty -- and the list is built from the brokers table, which has ZERO rows
     // because nobody has ever registered an account. So it reported a completed job over a
     // population that does not exist, which is the same defect as the Pipeline page reading
     // "Nobody on the list yet" (F-378) and the agency card once reporting "nobody has fallen
     // off" over a hundred agencies. TRAPS #264.
     // ⭐ NOTHING and ALL DONE are different answers and must read differently.
     : (DATA.brokers.length
         ? '<p class="muted">Everyone has a referrer recorded.</p>'
         : '<p class="muted">No brokers have registered an account yet, so there is nobody to '
           + 'attribute. This list fills up as brokers sign in — it is not empty because the '
           + 'work is done.</p>');
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
${ADMIN_HEADER_CSS}
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
 .filters button.on{background:#1a5c3a;color:#fff;border-color:#1a5c3a}
 select{padding:5px 7px;border:1px solid #c8d2de;border-radius:5px;font-size:13px}
 a.dl{display:inline-block;background:#1a5c3a;color:#fff;padding:8px 15px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600}
</style></head><body>
${abyAdminNav('/admin/rates')}
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
  // 'open' is a real assignment meaning UP FOR GRABS -- somebody looked and decided nobody owns
  // it yet. It is deliberately not the same as '' (nobody has looked). See repSelect.
  if (rep && rep !== 'eric' && rep !== 'niels' && rep !== 'open') {
    return jsonResp({ error: 'Unknown rep.' }, 400);
  }
  const id = String(body.id || '');
  if (!id) return jsonResp({ error: 'Which one?' }, 400);

  // An AGENT is keyed on EMAIL, not on an id -- broker_directory's primary key is the address.
  // Kept as its own branch rather than folded into the line below, because a single statement
  // parameterised by both table AND key column is the shape that eventually writes to the wrong
  // one. The `kind` values are closed, so an unknown one is refused rather than defaulted.
  if (body.kind === 'agent') {
    const r = await env.DB.prepare(
      'UPDATE broker_directory SET assigned_rep = ? WHERE lower(trim(email)) = lower(trim(?))'
    ).bind(rep || null, id).run();
    // Assert a row was actually affected. An UPDATE that matches nothing resolves happily, and
    // the screen would keep showing the value the server never stored.
    if (!r || !r.meta || !r.meta.changes) {
      return jsonResp({ error: 'No agent with that email.' }, 404);
    }
    return jsonResp({ ok: true });
  }

  const table = body.kind === 'agency' ? 'agencies' : 'brokers';
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
// AGENCIES THAT WERE ACQUIRED, AND ARE THEREFORE NOT A LAPSED RELATIONSHIP.
//
// Eric found the news story on 2026-08-22: Marsh acquired MHBT in June 2015. MHBT was the LARGEST
// entry on "agencies that have fallen off" -- 184 quotes, silent eight years -- and it is not a
// relationship to circle back with. It is the same relationship trading under today's name.
//
// 🔴 THE QUOTES ARE NOT REWRITTEN AND MUST NOT BE. A 2013 quote really was MHBT; relabelling it MMA
// would put MMA in the log four years before it existed here. Eric's own rule says the same thing
// about branches: "We do want the branches kept."
//
// ⭐ THE DATA DATES THE REBRAND MORE PRECISELY THAN THE ACQUISITION DOES, which is worth knowing
// because the two are different events: MHBT ran 2011-03 to 2017-12 and MMA starts 2017-04, so the
// brands overlapped for about two years after the deal and the handover completed at the end of
// 2017. There is even a transitional row written "MMA; MHBT" on 2017-08-30.
//
// ⚠️ A CONSTANT, NOT A TABLE, ON PURPOSE -- there is one confirmed entry. Gallagher acquires
// constantly and Crandall & Associates already mails from @ajg.com, so this will grow; if it
// passes about ten, promote it to its own table rather than letting a list of business facts live
// in the source.
// WHO TO CALL AT AN AGENCY THE LOG HAS NO CONTACT FOR.
//
// Eric, 2026-08-22: "the agent for Creative Insurance Concepts is Mike Bilbrey. Also his wife
// Juanita Bilbrey." Creative Insurance Concepts is the second-largest entry on "agencies that have
// fallen off" -- 108 quotes across 14 years, quiet 16 months -- and every one of those 108 rows has
// an EMPTY broker name. So the list could say who has gone quiet but not who to ring, which is
// most of what makes it useful.
//
// ⛔ THE NAMES ARE NOT STAMPED ONTO THE 108 ROWS. Writing Mike Bilbrey onto all of them would
// assert he personally ran each one, including any his wife ran. The register says who is AT the
// agency; the rows keep saying what they actually recorded, which is nothing.
const AGENCY_CONTACTS = {
  'Creative Insurance Concepts': 'Mike Bilbrey, Juanita Bilbrey',
};

const SUCCEEDED_BY = {
  'MHBT': { by: 'MMA', when: 'Jun 2015', note: 'acquired by Marsh; quotes moved to MMA from 2018' },
};

// 🔴🔴 THE OWNER COLUMN WAS A DASH ON EVERY SINGLE ROW, AND THE REP FILTER MATCHED NOTHING.
// Eric, 2026-08-22: "It's called Owner on the Brokers & Agencies page and they all have dashes."
//
// THE CAUSE: the agencies table was reachable ONLY through brokers --
//     LEFT JOIN brokers b ON b.email = q.broker_email
//     LEFT JOIN agencies a ON a.id = b.agency_id
// and the brokers table holds ZERO rows, because no broker has ever registered an account. So
// a.id was NULL on all 6,153 quotes: the Owner cell fell through to its dash for every agency
// INCLUDING the 57 that have a record and an owner already set, and
// "Show: Eric / Niels" returned an empty page rather than a filtered one.
//
// ⭐⭐ THE FIX IS TO JOIN ON THE KEY THE QUOTE ACTUALLY CARRIES -- the agency NAME. Every quote
// has one; almost none has a registered broker behind it. Routing a lookup through a table that
// is empty by design is how a working feature reads as unpopulated data.
// ⚠️ Same shape as TRAPS #230: valid SQL, no error, a plausible-looking screen, wrong answer.
// ── WHO AN AGENT IS, ACROSS QUOTES THAT DO AND DO NOT CARRY AN EMAIL ───────────────────────────
//
// 🔴🔴 ONE PERSON WAS TWO ROWS, AND THE CAUSE IS THE KEY ITSELF. The identity is email-if-present,
// else name -- so a broker whose quotes are SOMETIMES typed with an address and sometimes without
// lands in two buckets: one keyed on the address, one keyed on the name.
// MEASURED LIVE 2026-08-23: Jason Sandler is 3 quotes under his address and 3 under his name.
// ⚠️ AND IT IS NOT THE THREE PEOPLE THE PLAN NAMED -- it is FIFTEEN. The three were the ones
// somebody happened to notice.
//
// ⭐⭐ THE FIX RESOLVES A BLANK EMAIL THROUGH THE NAME, AND ONLY WHERE THE NAME IS UNAMBIGUOUS.
// If a name maps to exactly ONE address anywhere in the log, a quote carrying that name and no
// address is that person. If it maps to two, the name proves nothing and the rows stay apart.
// ⛔ THAT CONDITION IS THE WHOLE SAFETY OF IT. Collapsing on a name alone would merge two
// different John Smiths into one row, permanently and invisibly -- the exact defect the people
// table exists to prevent, one layer up.
//
// ⭐ IT INVENTS NOTHING AND STORES NOTHING. The quotes are untouched; this is a GROUPING, resolved
// at read time, so a later quote that carries the address simply makes the answer better.
const AGENT_EMAIL_CTE =
  "WITH agent_email AS (" +
  "  SELECT lower(trim(broker_name)) AS nm, MIN(lower(trim(broker_email))) AS email " +
  "  FROM quotes " +
  "  WHERE trim(COALESCE(broker_name,'')) <> '' AND trim(COALESCE(broker_email,'')) <> '' " +
  "  GROUP BY 1 HAVING COUNT(DISTINCT lower(trim(broker_email))) = 1) ";

const AGENT_EMAIL_JOIN = " LEFT JOIN agent_email ae ON ae.nm = lower(trim(q.broker_name)) ";

const AGENT_KEY =
  "COALESCE(NULLIF(lower(trim(q.broker_email)),''), " +
  "         ae.email, " +
  "         NULLIF(lower(trim(q.broker_name)),''), " +
  "         NULLIF(lower(trim(q.broker_agency)),''), '(not stated)')";
const AGENCY_JOIN =
  "LEFT JOIN agencies a ON lower(trim(a.name)) = lower(trim(q.broker_agency)) " +
  "AND trim(coalesce(q.broker_agency,'')) <> '' " +
  // The PARENT of that agency, for the acquisition and division rollup. One hop only -- the
  // seeding script asserts no parent is itself a child, so a chain cannot form and this join
  // cannot silently truncate one.
  "LEFT JOIN agencies pa ON pa.id = a.parent_id ";

// ⛔ GROUPING STAYS ON THE QUOTE'S OWN NAME, deliberately, and no longer prefers a.name.
// With the join above, a.name is the SAME name matched case-insensitively -- so preferring it
// would let a record spelled "HUB" and a quote spelled "Hub" land in two different groups.
// The quote is the only thing every row has, so it is what the book is counted by.
const AGENCY_EXPR = "COALESCE(NULLIF(trim(q.broker_agency),''), '(no agency)')";

// 🔴 VALUES IN THE AGENCY COLUMN THAT ARE NOT FIRMS, so the fallen-off list does not put a filing
// convention on a call-back list. Seen live: "(no agency folder)" sat near the top at 135 quotes,
// with "Independent", "Independent Broker" and "Existing Client" below it. None of them is
// somebody you can ring.
// ⛔ AN EXACT LIST, NEVER A KEYWORD MATCH. A real agency can contain any of these words --
// "Independent Insurance Group" is a plausible firm and must not be swallowed by "Independent".
// ⚠️ PEOPLE'S NAMES ARE DELIBERATELY NOT HERE. "Byron Bavousett" and "Brian Kleve" look like
// placeholders and are probably one-person agencies, which is Eric's call and not a pattern's.
// ⭐ This only filters the FALLEN-OFF card. The agency table still counts every one of them,
// because an unattributable quote is a real fact about the book.
const NOT_A_FIRM_SQL =
  "('(no agency)','(no agency folder)','(loose file - no agency folder)'," +
  "'(loose file – no agency folder)','(not stated)','no brokers','no broker'," +
  "'existing client','independent','independent broker','direct','unknown','none'," +
  "'niels','niels direct','eric','aby')";

async function handleAdminStats(request, env) {
  const rep = (new URL(request.url).searchParams.get('rep') || '').trim().toLowerCase();
  // ⚠️ READS THE AGENCY'S OWNER FIRST. It used to read only b.assigned_rep, and with zero
  // broker rows that is always NULL -- so picking Eric or Niels returned an EMPTY page rather
  // than a filtered one, which reads as "neither of us owns anything".
  const repFilter = rep ? "AND lower(COALESCE(a.assigned_rep, b.assigned_rep,'')) = ?" : '';

  // SINCE. Eric, 2026-08-22: "maybe a filter where we could choose to see number of quotes/sales
  // since a specific date? Like 1/1/26, last 12 months, 1/1/25 for example."
  // Accepted as an ISO date, so the front end owns the vocabulary (this year / last 12 months /
  // since 2025) and the worker owns only the boundary. A bad value is IGNORED rather than guessed
  // at -- a filter that silently invents a date reports a subset as if it were the whole book.
  const sinceRaw = (new URL(request.url).searchParams.get('since') || '').trim();
  const since = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(sinceRaw) ? sinceRaw : '';
  // Compared on substr, matching every other date test in this file, because created_at carries a
  // time and a plain >= against a bare date would drop the first day.
  const sinceFilter = since ? " AND substr(q.created_at,1,10) >= '" + since + "' " : '';
    // Declared once so every section filters on the SAME definition of "whose quote this is",
    // and so no query has to repeat an expression it might repeat differently.
    // 🔴🔴 THE AGENCY JOIN IS PART OF THIS CONSTANT, NOT BOLTED ON PER QUERY.
    // repFilter reads a.assigned_rep. When the agency join lived at each call site, FOUR queries
    // that take repFilter did not have it -- byStatus, the ageing buckets, the historic-by-year
    // card and the totals -- and every one would have thrown on an unresolved column the moment
    // somebody picked Eric or Niels, blanking most of the page.
    // ⭐ Found by grepping every prepare() that mentions repFilter and asking which brought `a`
    // into scope, rather than by clicking the filter and hoping. Grep the consumers.
    const BROKER_JOIN = "LEFT JOIN brokers b ON lower(trim(b.email)) = lower(trim(q.broker_email)) AND trim(q.broker_email) <> '' " + AGENCY_JOIN;
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
    // ⭐ THE SHARED DEFINITION, so this and the fallback below cannot answer differently.
    const agentKey = AGENT_KEY;
    const byAgent = await env.DB.prepare(
      AGENT_EMAIL_CTE +
      "SELECT " + agentKey + " AS key, " +
      "       MAX(NULLIF(trim(q.broker_email),'')) AS email, " +
      "       MAX(NULLIF(trim(q.broker_name),'')) AS name, " +
      "       MAX(COALESCE(a.name, NULLIF(trim(q.broker_agency),''))) AS agency, " +
      // The agent's OWN owner first, then the agency's, then the registered broker's. An agent
      // inherits their agency's owner until somebody says otherwise, so a page that has been
      // assigned at agency level does not read as entirely unassigned at agent level.
      "       MAX(COALESCE(bd.assigned_rep, a.assigned_rep, b.assigned_rep)) AS rep, " +
      "       MAX(CASE WHEN bd.email IS NOT NULL THEN 1 ELSE 0 END) AS assignable, " +
      "       MAX(COALESCE(bd.assigned_rep,'')) AS own_rep, " +
      "       COUNT(*) AS n, MAX(q.created_at) AS last_quote, " +
      // GROUPS THIS PERSON SOLD. Eric, 2026-08-22: "the reason to pull in the clients is to try to
      // pair them with quotes so we can figure out which of our agents have sold groups and how
      // many". This is that pairing: an employer they quoted who is on our books today.
      // ⚠️ THE AGENT NAME IS ON THE QUOTE, NOT ON THE CLIENT FOLDER -- a folder records the AGENCY
      // and never the individual. So this can only ever cover quotes where somebody typed the
      // broker's name, which is 108 of the 974 clients that have a quote at all. The column shows
      // what we can see and the header says so; it is not a leaderboard.
      "       COUNT(DISTINCT CASE WHEN cc.status IS NOT NULL " +
      "                           THEN q.client_match_key END) AS sold, " +
      "       COUNT(DISTINCT CASE WHEN cc.status = 'active' " +
      "                           THEN q.client_match_key END) AS sold_active " +
      "FROM quotes q " +
      BROKER_JOIN + AGENT_EMAIL_JOIN + " " +
      "LEFT JOIN aby_clients cc ON cc.match_key = q.client_match_key " +
      // Only an agent we have an EMAIL for can be assigned -- broker_directory is keyed on it.
      // A name-keyed row ("Niels" and "Niels Andersen" are two groups) has nowhere to store a
      // value, and the page shows a dash rather than a control that would silently do nothing.
      "LEFT JOIN broker_directory bd ON lower(trim(bd.email)) = lower(trim(q.broker_email)) " +
      "  AND trim(coalesce(q.broker_email,'')) <> '' " +
      "WHERE 1=1 " + repFilter + sinceFilter +
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
      // The rollup: who this agency sits under, and on what terms. `succeeded` means the name is
      // dead (MHBT under MMA); `division` means it is still trading (HUB Fort Worth under HUB).
      // The page combines the counts and the drop-down shows each name separately.
      "       MAX(a.parent_id) AS parent_id, MAX(pa.name) AS parent_name, " +
      "       MAX(a.relationship) AS relationship, MAX(a.relationship_note) AS relationship_note, " +
      "       COUNT(*) AS n, " +
      // ⚠️ Counts distinct identities the same way the agent table groups them, so "6 agents" and
      // the agent list can no longer disagree about what an agent is.
      "       COUNT(DISTINCT COALESCE(NULLIF(lower(trim(q.broker_email)),''), " +
      "                               NULLIF(lower(trim(q.broker_name)),''))) AS agents, " +
      "       MAX(q.created_at) AS last_quote, " +
      // SALES, NOT QUOTES, AND FROM THEIR OWN TABLE. Eric, 2026-08-21: "We have been tracking
      // number of quotes from each agent and agency. Perhaps we should track number of sales
      // as well."
      // ⛔ A correlated subquery on aby_sales, NOT a join: a join would multiply the quote rows
      // by the sales rows and silently inflate the very count this table exists to report.
      // ⚠️ 156 of the 406 sales have no quote at all, so an agency can show sales with a low
      // quote count -- that is the finding, not an error.
      "       (SELECT COUNT(*) FROM aby_sales sx WHERE sx.agency = " + AGENCY_EXPR + ") AS sales, " +
      // How many of those we INFERRED rather than received an announcement for. Eric, 2026-08-22:
      // "I do think we should create sales records for the clients whose originating quote we can
      // now identify... we need to build it as well as we can right now."
      "       (SELECT COUNT(*) FROM aby_sales sx WHERE sx.agency = " + AGENCY_EXPR +
      "          AND sx.source LIKE 'inferred-%') AS sales_inferred, " +

      // CONVERSION AND RETENTION. Eric, 2026-08-22: "out of those quotes that were run, how many
      // were sold and how many are still active. That will help to tell us agency conversion and
      // retention rates."
      //
      // ⭐⭐ IT DELIBERATELY IGNORES quotes.status. Every row in the back-book is 'P' because
      // nothing was ever dispositioned, so a win rate read off that column is fiction. Asking
      // instead "did this employer end up on our books?" is a question the records can answer.
      //
      // ⭐ COUNT(DISTINCT client_match_key), NOT COUNT(*). An agency that quoted one company five
      // times did not get five chances to convert it, and counting quotes would reward re-quoting
      // an employer who never buys.
      //
      // ⚠️ THE JOIN IS 1:1 AND THAT IS LOAD-BEARING -- aby_clients.match_key carries a UNIQUE
      // index (measured 2026-08-22: 2,290 rows, 2,290 distinct keys, 0 duplicates). If it ever
      // stopped being unique this LEFT JOIN would multiply the quote rows and inflate `n`, which
      // is the exact failure the sales figure above uses a subquery to avoid.
      "       COUNT(DISTINCT NULLIF(q.client_match_key,'')) AS employers, " +
      "       COUNT(DISTINCT CASE WHEN cc.status IS NOT NULL " +
      "                           THEN q.client_match_key END) AS won, " +
      "       COUNT(DISTINCT CASE WHEN cc.status = 'active' " +
      "                           THEN q.client_match_key END) AS kept " +
      "FROM quotes q " +
      BROKER_JOIN + " " +
      "LEFT JOIN aby_clients cc ON cc.match_key = q.client_match_key " +
      "WHERE 1=1 " + repFilter + sinceFilter +
      " GROUP BY " + AGENCY_EXPR + " ORDER BY n DESC LIMIT 1000").bind(...args).all();

    // CONVERSION FOR A WHOLE FAMILY, COUNTED DISTINCTLY -- NOT SUMMED FROM THE ROWS ABOVE.
    //
    // ⭐⭐ SUMMING WOULD DOUBLE-COUNT, and by a measured amount: 37 employers were quoted under
    // BOTH a parent and one of its children (21 of them under MMA and MHBT, which is exactly what
    // an acquired book looks like -- the same employer quoted before and after the rename). Adding
    // MMA's 536 employers to MHBT's would produce a denominator 21 too big and quietly UNDERSTATE
    // MMA's conversion. A rate that is wrong in a consistent direction is worse than an obviously
    // broken one, because nothing about it looks wrong.
    //
    // So the family total is asked of the database, where COUNT(DISTINCT ...) can see the whole
    // family at once. Rows without a parent group onto themselves, so every agency appears here.
    const byFamily = await env.DB.prepare(
      "SELECT COALESCE(MAX(pa.name), " + AGENCY_EXPR + ") AS family, " +
      "       COUNT(DISTINCT NULLIF(q.client_match_key,'')) AS employers, " +
      "       COUNT(DISTINCT CASE WHEN cc.status IS NOT NULL " +
      "                           THEN q.client_match_key END) AS won, " +
      "       COUNT(DISTINCT CASE WHEN cc.status = 'active' " +
      "                           THEN q.client_match_key END) AS kept, " +
      "       COUNT(*) AS n " +
      "FROM quotes q " +
      BROKER_JOIN + " " +
      "LEFT JOIN aby_clients cc ON cc.match_key = q.client_match_key " +
      "WHERE 1=1 " + repFilter + sinceFilter +
      " GROUP BY COALESCE(pa.name, " + AGENCY_EXPR + ")").bind(...args).all();

    // 🔴 THE "SHOW: ERIC / NIELS" FILTER HAS TO REACH THIS LINE TOO.
    // It used to count the WHOLE BOOK regardless of who was selected, while the two tables below
    // it were filtered -- so the headline said 371 quotes over a table that added up to 46, and
    // neither number was wrong on its own. A filter that silently covers only part of a page is
    // worse than no filter, because the parts it misses look like corroboration.
    const totals = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM quotes q " + BROKER_JOIN + " WHERE 1=1 " + repFilter + sinceFilter + ") AS quotes, " +
      "       (SELECT COUNT(*) FROM brokers b WHERE 1=1 " + repFilter + ") AS brokers, " +
      "       (SELECT COUNT(*) FROM agencies a WHERE 1=1 " +
                (rep ? "AND lower(COALESCE(a.assigned_rep,'')) = ?" : '') + ") AS agencies"
    ).bind(...args, ...args, ...args).first();

    // ── By status, with value (Eric, 2026-08-18) ───────────────────────────────────────────
    // ⚠️ `valued` IS REPORTED ALONGSIDE `n` ON PURPOSE. Value was only added today, so most rows
    // have none, and a total presented without saying how many quotes it is drawn from would read
    // as the whole book. A proportion is not a fact unless its denominator travels with it.
    let byStatus = [], aging = [], historic = [], dormant = [];
    try {
      const r1 = await env.DB.prepare(
        // ⚠️ GROUP BY THE EXPRESSION, and qualify every column with q. -- the join below brings
        // the brokers table into scope, and grouping by a bare alias is exactly how "Quotes by
        // agency" collapsed into one blank row.
        // The OUTPUT name stays `status` -- the page reads x.status, and an alias in SELECT is
        // only a label on the result. The shadowing hazard was in GROUP BY, which now uses the
        // expression, so the alias is safe to keep.
        // 2026 ONWARD. Eric, 2026-08-22: "On quotes by status we need to remove the historic
        // count from pending." Pending read 5,967 against a live pipeline of about 370, so the
        // card described the back-catalogue rather than the book. The WHOLE card is scoped, not
        // just the Pending row -- a table with one filtered row and four unfiltered ones cannot
        // be added up, and the subtitle says which scope it is.
        // The pre-2026 counts are not lost: they are the Historic quotes by year card below.
        "SELECT " + STATUS_EXPR + " AS status, COUNT(*) AS n, " +
        "       SUM(CASE WHEN q.first_year_value IS NOT NULL THEN 1 ELSE 0 END) AS valued, " +
        "       COALESCE(SUM(q.first_year_value),0) AS value " +
        "FROM quotes q " + BROKER_JOIN +
        " WHERE substr(q.created_at,1,4) >= '2026' " + repFilter +
        " GROUP BY " + STATUS_EXPR).bind(...args).all();
      byStatus = r1.results || [];

      // How long has each open quote been sitting? Only P and I. A Sold, Dead or
      // No Response quote is not waiting on anybody, and including them would bury the
      // ones that are. No Response is CLOSED for this purpose even though nobody said no:
      // the point of dispositioning it is that we have stopped waiting.
      // 🔴 2026 ONWARD ONLY. Eric, 2026-08-22: "On open quotes by age, we shouldn't include
      // anything from 2025 and before." After the back-catalogue load, 5,834 quotes sat in the
      // over-90-days bucket and nobody is chasing one of them -- a bucket holding 94% of the rows
      // says nothing and buries the few that really are overdue.
      // ⛔ A DISPLAY boundary, not a disposition: no status is rewritten.
      const r2 = await env.DB.prepare(
        "SELECT " + BUCKET_EXPR + " AS bucket, COUNT(*) AS n, " +
        "       COALESCE(SUM(q.first_year_value),0) AS value " +
        "FROM quotes q " + BROKER_JOIN +
        " WHERE " + STATUS_EXPR + " IN ('P','I') AND substr(q.created_at,1,4) >= '2026' " +
        repFilter + " GROUP BY " + BUCKET_EXPR).bind(...args).all();
      aging = r2.results || [];

      // ⭐ The other half of the same instruction: "we should have a historic quotes section that
      // shows quotes by year, 2025 first."
      const r3 = await env.DB.prepare(
        "SELECT substr(q.created_at,1,4) AS yr, COUNT(*) AS n, " +
        "       SUM(CASE WHEN " + STATUS_EXPR + " = 'S' THEN 1 ELSE 0 END) AS sold, " +
        "       COUNT(DISTINCT q.client_name) AS employers, " +
        "       COUNT(DISTINCT q.broker_agency) AS agencies " +
        "FROM quotes q " + BROKER_JOIN +
        " WHERE substr(q.created_at,1,4) < '2026' " + repFilter +
        " GROUP BY yr ORDER BY yr DESC").bind(...args).all();
      historic = r3.results || [];

      // FALLEN OFF. Eric, 2026-08-22: "maybe some info on agencies that seem to have fallen off
      // that we need to circle back with?"
      // An agency that USED to send work and has stopped. Two numbers decide it and both come from
      // the same row, so they cannot disagree: how much they ever sent, and how long since the last
      // one.
      // ⭐ A LOW-VOLUME AGENCY GOING QUIET IS NOT A STORY. One quote in 2014 and silence since is
      // not a lapsed relationship, it is somebody who tried us once. The floor is 5 quotes, so the
      // list is people who really were sending work.
      // ⚠️ Deliberately NOT scoped by `since` -- this question is about the whole history by
      // definition. Scoping it would make "fallen off" mean "quiet inside the window", which is
      // every agency outside the window.
      const r4 = await env.DB.prepare(
        "SELECT " + AGENCY_EXPR + " AS agency_label, COUNT(*) AS n, " +
        "       MAX(q.created_at) AS last_quote, " +
        "       SUM(CASE WHEN q.created_at >= datetime('now','-365 days') THEN 1 ELSE 0 END) AS recent, " +
        // 🔴🔴 THE COMMA AT THE END OF THIS LINE IS LOAD-BEARING AND WAS MISSING FOR ONE DEPLOY.
        // Without it the SELECT list read "... AS days_quiet MAX(a.relationship) AS relationship",
        // which is a SQL syntax error -- so this whole query threw, the try/catch swallowed it,
        // and the fallen-off card rendered its EMPTY-STATE message: "Nobody has fallen off." A
        // hundred dormant agencies, reported as none, with no error anywhere on the page.
        // ⭐ Ten checker rules passed, because they read the source instead of running the SQL.
        // Only opening the page found it. check_agency_rollup.mjs now parses this SELECT list.
        "       CAST(julianday('now') - julianday(MAX(q.created_at)) AS INTEGER) AS days_quiet, " +
        // 🔴 BROKER_JOIN NOW CARRIES THE AGENCIES JOIN WITH IT, which is what makes this safe.
        // BROKER_JOIN alone brings in `brokers b` and nothing else, so the first version of
        // this query referenced an unresolved column, threw, and left the card empty -- while
        // byStatus, aging and historic all rendered, because they are assigned before it.
        // An empty card and a broken card look identical, which is why the direct query was
        // run against D1 to prove the SQL itself was sound before looking at the worker.
        // ⭐⭐ IT USES THE SAME JOIN AS THE PRIMARY PATH, ON PURPOSE. This is the
        // DEGRADED path: it only runs once the main query has already failed, which is exactly
        // when nobody is watching. Left joining through brokers here while the primary joins by
        // name would mean that on a bad day the page answers a different question and still
        // looks right. TRAPS #233 -- a fallback that answers a different question than the thing
        // it replaces is a second bug waiting for the day the first one fires.
        "       MAX(a.relationship) AS relationship, MAX(pa.name) AS parent_name, " +
        "       MAX(a.relationship_note) AS relationship_note " +
        "FROM quotes q " + BROKER_JOIN +
        " WHERE 1=1 " + repFilter +
        // 🔴🔴 AN ACQUIRED NAME IS NOT A LAPSED RELATIONSHIP AND IS EXCLUDED OUTRIGHT.
        // Eric, 2026-08-22: "9 years after they've stopped using the name, we don't need to see
        // MHBT on a dormant list, even if grayed out. MHBT is no longer doing business as MHBT."
        // ⭐ ONLY `succeeded` is excluded. A `division` -- HUB Wellspring, USI - OH -- is still
        // trading and is somebody you can actually ring, so it STAYS on the list on its own
        // merits. That distinction is the whole reason `relationship` exists beside `parent_id`.
        " GROUP BY " + AGENCY_EXPR +
        " HAVING n >= 5 AND recent = 0 " +
        // AN ALIAS MUST NOT REACH THIS LIST EITHER, and it took Eric asking to notice.
        // He: "Are you going back and fixing these on the quotes too so they will feed into the
        // performance list correctly?" The ROLLUP was already right -- it follows parent_name and
        // does not care which relationship put it there -- but this filter named only 'succeeded',
        // so a misspelling with five quotes and a quiet year would have arrived on a list headed
        // "worth a call". Nobody rings Baldwin Grouup.
        "    AND COALESCE(MAX(a.relationship),'') NOT IN ('succeeded','alias') " +
        "    AND lower(" + AGENCY_EXPR + ") NOT IN " + NOT_A_FIRM_SQL + " " +
        // SORTED BY HOW RECENTLY THEY WENT QUIET, NOT BY VOLUME.
        // Ordering by size put MHBT at the top at 184 quotes -- and MHBT was acquired in 2015,
        // making the single least actionable row the most prominent one. The calls worth making
        // are the 12-to-24-month lapses: big enough to matter, recent enough that somebody still
        // remembers us. Volume is still on the row, so nothing is hidden by the reorder.
        " ORDER BY days_quiet ASC, n DESC LIMIT 40").bind(...args).all();
      // Attach who to call. Done here rather than on the page so the register has ONE reader
      // and cannot drift between screens.
      // ⭐ The acquisition register now lives in the DATABASE (agencies.parent_id), not in the
      // SUCCEEDED_BY constant -- Eric's own note said a constant would not survive past about ten
      // entries, and HUB alone contributed three.
      dormant = (r4.results || []).map(function (d) {
        var key = (d.agency_label || '').trim();
        var who = AGENCY_CONTACTS[key];
        var out = Object.assign({}, d);
        if (who) out.contact = who;
        return out;
      });
    } catch (err) {
      // Columns may predate the migration. Report nothing rather than a wrong zero.
      console.warn('value/aging unavailable:', String(err && err.message || err));
    }

    return jsonResp({ byAgent: byAgent.results || [], byAgency: byAgency.results || [], byFamily: byFamily.results || [], totals, byStatus, aging, historic, dormant });
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
  const out = { byAgent: [], byAgency: [], byStatus: [], aging: [], historic: [],
                dormant: [], totals: null,
                unavailable: {}, error: firstError };

  // 🔴 THE REP FILTER HAS TO SURVIVE THE FALLBACK, OR IT LIES.
  // This path runs when the main query has already failed, and it used not to receive `rep` at
  // all -- so with "Show: Eric" selected it quietly returned the WHOLE BOOK while the button
  // still read as active. Unfiltered numbers under a filter label are worse than no numbers:
  // there is nothing on the screen to tell you they are not the ones you asked for.
  // ⭐ So the filter is applied here too. It needs the brokers join, which is one of the things
  // that may be broken -- and that is the right trade: a section that cannot honour the filter
  // reports itself unavailable, section by section, rather than answering a different question.
  // ⚠️ READS THE AGENCY'S OWNER FIRST. It used to read only b.assigned_rep, and with zero
  // broker rows that is always NULL -- so picking Eric or Niels returned an EMPTY page rather
  // than a filtered one, which reads as "neither of us owns anything".
  const repFilter = rep ? "AND lower(COALESCE(a.assigned_rep, b.assigned_rep,'')) = ?" : '';
  // 🔴 THE AGENCY JOIN IS PART OF THIS, NOT OPTIONAL. repFilter reads a.assigned_rep, so a
  // join that brings in only `brokers` leaves `a` unresolved and every query in the DEGRADED
  // path throws -- turning a partly-working page into a blank one, on the day the main path has
  // already failed. Caught before deploy by asking what repFilter references, not by running it.
  const joinIf    = rep
    ? " LEFT JOIN brokers b ON lower(trim(b.email)) = lower(trim(q.broker_email)) AND trim(q.broker_email) <> '' "
      + " LEFT JOIN agencies a ON lower(trim(a.name)) = lower(trim(q.broker_agency)) AND trim(coalesce(q.broker_agency,'')) <> '' "
    : ' ';
  const args      = rep ? [rep] : [];
  const attempt = async (name, run) => {
    try { return await run(); }
    catch (err) { out.unavailable[name] = String(err && err.message || err); return null; }
  };

  // ⚠️ SAME IDENTITY RULE AS THE MAIN QUERY. The fallback existing at all is only useful if it
  // answers the same question; a fallback that quietly applies a different rule is a second bug
  // waiting for the day the first one fires.
  const agent = await attempt('byAgent', () => env.DB.prepare(
    AGENT_EMAIL_CTE +
    "SELECT " + AGENT_KEY + " AS key, " +
    "       MAX(NULLIF(trim(q.broker_email),'')) AS email, " +
    "       MAX(NULLIF(trim(q.broker_name),'')) AS name, " +
    "       MAX(NULLIF(trim(q.broker_agency),'')) AS agency, NULL AS rep, COUNT(*) AS n, " +
    "       MAX(q.created_at) AS last_quote " +
    "FROM quotes q" + joinIf + AGENT_EMAIL_JOIN + "WHERE 1=1 " + repFilter +
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
    "WHERE substr(q.created_at,1,4) >= '2026' " + repFilter +
    " GROUP BY COALESCE(q.status,'P')").bind(...args).all());
  if (st) out.byStatus = st.results || [];

  // 🔴 THE AGEING REPORT EXCLUDES THE BACK-CATALOGUE. Eric, 2026-08-22: "On open quotes by age, we
  // shouldn't include anything from 2025 and before." He is right and the reason is that the
  // report answers "what is waiting on somebody" -- after the 2009-2023 load, 5,905 quotes were
  // sitting in the "over 90 days" bucket, none of which anybody is chasing. One bucket holding 94%
  // of the rows tells you nothing, and it buries the handful that ARE overdue.
  // ⛔ The cut-off is a DISPLAY boundary, exactly like the Historic tab -- no status is rewritten,
  // so nothing here disposes of a quote by date.
  const ag = await attempt('aging', () => env.DB.prepare(
    "SELECT CASE " +
    "  WHEN q.created_at >= datetime('now','-7 days')  THEN 'week' " +
    "  WHEN q.created_at >= datetime('now','-30 days') THEN 'month' " +
    "  WHEN q.created_at >= datetime('now','-90 days') THEN 'quarter' " +
    "  ELSE 'older' END AS bucket, COUNT(*) AS n, COALESCE(SUM(q.first_year_value),0) AS value " +
    "FROM quotes q" + joinIf + "WHERE COALESCE(q.status,'P') IN ('P','I') " +
    "  AND substr(q.created_at,1,4) >= '2026' " + repFilter +
    " GROUP BY bucket").bind(...args).all());
  if (ag) out.aging = ag.results || [];

  // ⭐ AND THE OTHER HALF OF THE SAME INSTRUCTION: "Instead, we should have a historic quotes
  // section that shows quotes by year, 2025 first." Every quote, every status, one row per year,
  // newest first -- the aging buckets make no sense across fifteen years, but a year count does.
  const hist = await attempt('historic', () => env.DB.prepare(
    "SELECT substr(q.created_at,1,4) AS yr, COUNT(*) AS n, " +
    "       SUM(CASE WHEN COALESCE(q.status,'P') = 'S' THEN 1 ELSE 0 END) AS sold, " +
    "       COUNT(DISTINCT q.client_name) AS employers, " +
    "       COUNT(DISTINCT q.broker_agency) AS agencies " +
    "FROM quotes q" + joinIf + "WHERE substr(q.created_at,1,4) < '2026' " + repFilter +
    " GROUP BY yr ORDER BY yr DESC").bind(...args).all());
  if (hist) out.historic = hist.results || [];

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

    <!-- WHAT ABY ALREADY KNOWS ABOUT THIS AGENCY (F-383). Eric: "if we already have some agent
         info would that fill in to their admin area where they can see it and update it if
         necessary?" ABY knows 139 agents from fifteen years of quotes, and making an agency
         retype their own colleagues is the product failing at the thing it exists for.
         SHOWN TO EVERY MEMBER, EDITABLE ONLY BY AN ADMINISTRATOR: seeing who is on file is
         useful to anybody there; changing it is not.
         It carries NOTHING ABY-INTERNAL -- no owner, no priority, no tags, no notes. -->
    <div class="card" id="peopleCard" style="display:none">
      <h2>People we have on file for your agency</h2>
      <p class="sub" id="peopleSub">Pulled from quotes run over the years, plus anyone invited
        here.</p>
      <div id="peopleList"><p class="muted">Loading&hellip;</p></div>
      <div class="msg" id="peopleMsg" style="display:none"></div>
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
   // Called for EVERY member, not only administrators: the list is worth seeing whether or not
   // you can change it. The function decides what is editable.
   loadAgencyPeople(b);
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

 // ── PEOPLE ABY ALREADY HAS ON FILE FOR THIS AGENCY ──────────────────────────────────────
 // ⛔ NO BACKSLASHES: this page is one template literal, and a lone one is eaten before the
 // browser sees it.
 var meRole='', meAgency='';
 async function loadAgencyPeople(b){
   if(b){ meRole=b.role||''; meAgency=b.agencyId||''; }
   if(!meAgency){ $('peopleCard').style.display='none'; return; }
   $('peopleCard').style.display='block';
   var r=await fetch('/api/agency/people');
   var d=await r.json().catch(function(){return{}});
   var box=$('peopleList');
   // 🔴 AN ERROR IS NOT AN EMPTY LIST. The two must never render the same way.
   if(d.error){ box.innerHTML='<p class="muted">Could not load this: '+esc(d.error)+'</p>'; return; }
   var rows=d.people||[];
   if(!rows.length){
     box.innerHTML='<p class="muted">Nobody on file yet. Anyone invited above will appear here.</p>';
     return;
   }
   var admin=(meRole==='admin');
   $('peopleSub').textContent=admin
     ? 'Pulled from quotes run over the years, plus anyone invited here. Correct anything out of date.'
     : 'Pulled from quotes run over the years. Your agency administrator can correct these.';
   var th='style="text-align:left;padding:6px 4px;font-size:12px;color:#5b6b7f"';
   var h='<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr>'
        +'<th '+th+'>NAME</th><th '+th+'>EMAIL</th><th '+th+'>PHONE</th>'
        +'<th style="text-align:right;padding:6px 4px;font-size:12px;color:#5b6b7f">QUOTES</th>'
        +'</tr></thead><tbody>';
   for(var i=0;i<rows.length;i++){
     var x=rows[i];
     var e=esc(x.email);
     h+='<tr><td style="padding:6px 4px">'
       +(admin?'<input value="'+esc(x.name||'')+'" style="width:100%;padding:5px 7px" '
               +'onchange="savePerson(this,&#39;'+e+'&#39;,&#39;name&#39;)">'
              :(esc(x.name||'')||'&mdash;'))
       +'</td><td style="padding:6px 4px">'+e+'</td><td style="padding:6px 4px">'
       +(admin?'<input value="'+esc(x.phone||'')+'" style="width:100%;padding:5px 7px" '
               +'onchange="savePerson(this,&#39;'+e+'&#39;,&#39;phone&#39;)">'
              :(esc(x.phone||'')||'&mdash;'))
       // ⭐ THE QUOTE COUNT IS WHY THIS IS WORTH SHOWING THEM. It is the evidence that ABY
       // already knows this person, and it is what makes the row worth correcting.
       +'</td><td style="text-align:right;padding:6px 4px">'+(x.quotes||0)+'</td></tr>';
   }
   box.innerHTML=h+'</tbody></table>';
 }

 async function savePerson(el,email,field){
   var r=await fetch('/api/agency/person',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({email:email,field:field,value:el.value})});
   var d=await r.json().catch(function(){return{}});
   // ⛔ A WRITE THAT FAILS MUST SAY SO, and the screen must go back to matching the server.
   // A control that keeps what you typed while the database holds the old value is the worst
   // of both.
   show($('peopleMsg'), r.ok?'Saved.':(d.error||'That did not save.'), r.ok?'ok':'err');
   if(!r.ok) loadAgencyPeople();
 }
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

  // ⭐ A SELF-REGISTERED BROKER REACHES THE LIST TOO. Real brokers sign up off Eric's webinars
  // unprompted, and until now the only trace was a row in a table nothing reads.
  await linkBrokerIntoDirectory(env, {
    email, name: String(body.name || ''), phone: String(body.phone || ''),
    agencyId, agencyName, source: 'signup',
  });

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

    // ⭐⭐ AND INTO THE DIRECTORY ABY ACTUALLY WORKS FROM. Without this the invite writes only to
    // `brokers`, which the CRM does not read -- so an agency could hand ABY six account managers
    // and every one would be invisible to marketing. Eric asked exactly this.
    // ⚠️ Its result is not checked before sending the email: the account and the set-password
    // link are what the AGENCY asked for, and ABY's list is a second beneficiary. A failure here
    // must not cost them their invite.
    await linkBrokerIntoDirectory(env, {
      email, name, phone: '', agencyId: me.agency_id,
      agencyName: agency ? agency.name : '', source: 'invite',
    });

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
// ---- ABY ADMIN NAV ---------------------------------------------------------------------------
// ONE list of links, six pages. It was six copies of the same markup, each differing only in which
// link carried class="here" -- so adding a screen meant editing all of them and the /aby tool had
// simply been forgotten.
// ⭐⭐ THE ONE ADMIN HEADER. Eric, 2026-08-22: "Can you make the headers on all of the app pages
// look like the Quote log one? They have different heights and colors."
//
// 🔴 THEY DIFFERED BECAUSE THE CSS WAS WRITTEN OUT SEVEN TIMES while the MARKUP was already shared
// (abyAdminNav). Five admin pages carried navy #143c73 at 13px 20px, the quote log green #1a5c3a
// at 14px 24px, and /aby a third variant. One component, several appearances -- and no way to
// change it without finding every copy, which is how they drifted apart.
// ⛔ Recolouring the copies would still leave copies. This is the definition; pages interpolate it.
//
// ⚠️ It styles a BARE header selector, so it belongs only on pages whose whole chrome is ours.
// /aby is the PUBLIC quote tool with its own stylesheet, so that page keeps the class-scoped
// .aby-adminbar rules -- a bare rule injected there would restyle the tool's own header for ABY
// users only, and nobody would connect that back to a nav bar.
const ADMIN_HEADER_CSS = `header{background:#1a5c3a;color:white;padding:14px 24px;display:flex;align-items:center;gap:12px;
       position:sticky;top:0;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.2)}
header h1{font-size:1.05rem;font-weight:700;margin:0;flex:0 0 auto;color:#fff}
header b{font-size:1.05rem;font-weight:700}
header nav{flex:1;display:flex;flex-wrap:wrap;gap:2px;margin-left:6px}
header a{color:rgba(255,255,255,.78);text-decoration:none;font-size:.85rem;font-weight:600;
         padding:5px 10px;border-radius:5px;white-space:nowrap}
header a:hover{background:rgba(255,255,255,.15);color:white}
header a.here{background:rgba(255,255,255,.2);color:white}
header a.act{background:#2f9e73;color:white;font-weight:700}
header a.act:hover{background:#37b284}
header .logout{color:rgba(255,255,255,.75);font-size:.875rem;cursor:pointer;background:none;
               border:none;padding:4px 8px;border-radius:4px}
header .logout:hover{background:rgba(255,255,255,.15);color:white}
@media print{header{display:none}}
`;

// Eric, 2026-08-21: "On the page where ABY runs quotes /aby is it possible to add the same header
// navigation that the other admin panels have?"

// ═══ RFP WATCH (F-384) ════════════════════════════════════════════════════════════════════════════
//
// Public-entity solicitations for the services ABY administers: cities, counties, school districts,
// higher ed. ABY has two dozen municipal references, which is what makes this a credible lane.
//
// 🔴🔴 THE RULE THAT EVERYTHING ELSE HANGS OFF, AND IT WAS EARNED RATHER THAN REASONED. One week of
// running this search by hand (2026-08-17) produced two confident wrong answers:
//
//   1. Tarrant Appraisal District's "2026 Group and Retiree Insurance RFP" came back with a due date
//      of "Wednesday, August 20, 2026". It was the 2025 solicitation for the 2026 PLAN YEAR, closed
//      nearly a year earlier. Two tells: August 20 2026 was a THURSDAY, and the plan year had
//      already started before the claimed deadline.
//   2. Two searches asserted a September 12 deadline where the structured record said September 10.
//      September 12 2026 was a SATURDAY. The summary invented a plausible date and dressed it with a
//      weekday.
//
// ⛔ SO A DATE HERE CARRIES ITS SOURCE, AND A SUMMARY IS NOT A SOURCE. Only somebody opening the
// issuing entity's own page makes a deadline trustworthy, and until that happens the row says so on
// its face. A tool that reports a dead RFP as live is worse than no tool: it burns a week and it
// teaches Eric to distrust the page.

// Where a date came from, worst to best. 'summary' is a digest or a search result and is the one
// that lied twice in a single week.
const RFP_DATE_SOURCES = ['summary', 'manual', 'feed', 'official_page'];

const RFP_DISPOSITIONS = ['new', 'reviewing', 'pursuing', 'submitted', 'won', 'lost', 'passed'];

const RFP_ENTITY_TYPES = ['city', 'county', 'school_district', 'higher_ed', 'state_agency',
                          'special_district', 'federal', 'other'];

// Texas first, then the states ABY already reaches, then everywhere else. Eric's priority order.
const RFP_TX_ADJACENT = ['OK', 'LA', 'AR', 'NM'];

function rfpRegion(state) {
  const s = String(state || '').trim().toUpperCase();
  if (s === 'TX') return 'tx';
  if (RFP_TX_ADJACENT.indexOf(s) !== -1) return 'tx_adjacent';
  return 'national';
}

// ⭐⭐ THE SERVICE LIST REUSES THE QUOTE TOOL'S OWN PRODUCT IDS WHERE ONE EXISTS, and says so where
// one does not. Inventing a parallel spelling is how a value becomes invisible to every query that
// already exists: 'sec125' and 'pop' are the same thing to a person and different strings to SQL.
// ⚠️ THREE OF THESE ARE DELIBERATELY NOT PRODUCT IDS. ABY answers RFPs for DCAP, limited-purpose
// FSA and Form 5500 work, and the quote tool does not sell them as separate products. They are
// marked product:false rather than forced into a product id that does not mean them.
const RFP_SERVICES = [
  { id: 'fsa',      product: true,  label: 'FSA',
    re: /flexible spending|health care spending account|\bfsa\b|\bhcsa\b/i },
  { id: 'lfsa',     product: false, label: 'Limited-purpose FSA',
    re: /limited[- ]purpose|\blfsa\b/i },
  { id: 'dcap',     product: false, label: 'Dependent care',
    re: /dependent care|\bdcap\b|dependent care advantage/i },
  { id: 'hra',      product: true,  label: 'HRA',
    re: /health reimbursement|\bhra\b|\bqsehra\b/i },
  { id: 'ichra',    product: true,  label: 'ICHRA',   re: /\bichra\b/i },
  { id: 'hsa',      product: true,  label: 'HSA',     re: /health savings|\bhsa\b/i },
  { id: 'cobra',    product: true,  label: 'COBRA',   re: /\bcobra\b|continuation coverage/i },
  { id: 'pop',      product: true,  label: 'Section 125 / POP',
    re: /section 125|cafeteria plan|premium only|\bpop\b/i },
  { id: 'aca',      product: true,  label: 'ACA reporting',
    re: /\baca\b|1094[- ]?c|1095[- ]?c|affordable care act report/i },
  { id: 'erisa',    product: true,  label: 'ERISA',   re: /\berisa\b|wrap document|\bhipaa\b/i },
  { id: 'form5500', product: false, label: 'Form 5500', re: /form 5500|\b5500\b/i },
  { id: 'section132', product: true, label: 'Commuter',
    re: /commuter|qualified transportation|section 132|transit benefit/i },
  { id: 'section127', product: true, label: 'Student loan / tuition',
    re: /student loan|tuition (reimbursement|assistance)|section 127/i },
  { id: 'lifestyle', product: true, label: 'Lifestyle',
    re: /lifestyle (spending|benefit)|\blsa\b|\blsb\b/i },
  { id: 'directBilling', product: true, label: 'Direct / retiree billing',
    re: /retiree billing|direct billing|premium billing/i },
];

// ⛔ THINGS THAT LOOK LIKE A MATCH TO A KEYWORD SEARCH AND ARE NOT. Four of the ten items surfaced
// on 2026-08-17 died here. These are NEGATIVE RULES, not low scores: a medical-claims TPA bid is not
// a weak fit, it is a different business.
//
// ⚠️ 'field' MATTERS AND IS NOT FUSSINESS. The carrier-line rule reads the TITLE ONLY, because
// "dental" and "vision" appear perfectly innocently inside the scope of a real FSA solicitation
// (they are eligible expenses). Reading it across the scope would screen out the best fits.
const RFP_DISQUALIFIERS = [
  { id: 'medical_claims', field: 'all',
    why: 'medical claims administration, which ABY does not adjudicate',
    re: /medical claims|claims adjudication|self[- ]?funded (health|medical)|health plan administration/i },
  { id: 'stop_loss', field: 'all', why: 'stop-loss or reinsurance',
    re: /stop[- ]?loss|reinsurance/i },
  { id: 'carrier_line', field: 'title',
    why: 'an insurance carrier line (dental, vision, life, disability)',
    re: /\b(dental|vision|life insurance|disability|long[- ]term care)\b/i },
  { id: 'brokerage', field: 'all', why: 'brokerage or consulting, where ABY is the administrator',
    re: /broker(age)? (of record|services)|benefits? consult(ing|ant)|agent of record/i },
  { id: 'retirement', field: 'all', why: 'retirement or deferred compensation',
    re: /\b457\b|403\(b\)|401\(k\)|deferred comp|pension|retirement plan/i },
  { id: 'benadmin_software', field: 'all',
    why: 'benefits administration software rather than the administration itself',
    re: /benefits? (administration|enrollment) (software|platform|system)|technology platform/i },
];

const RFP_WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** The weekday an ISO date actually falls on, computed in UTC so a timezone cannot shift it. */
function rfpWeekdayOf(iso) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (isNaN(d.getTime())) return null;
  return RFP_WEEKDAYS[d.getUTCDay()];
}

/**
 * ⭐ THE CHEAPEST LIE DETECTOR IN THE SYSTEM. When a source states both a weekday and a date, they
 * have to agree. "Wednesday, August 20, 2026" does not, and that one mismatch is what exposed a
 * closed solicitation being sold as open.
 */
function rfpWeekdayMismatch(iso, statedText) {
  const actual = rfpWeekdayOf(iso);
  if (!actual) return null;
  const said = String(statedText || '').toLowerCase();
  for (const w of RFP_WEEKDAYS) {
    if (said.indexOf(w) !== -1 && w !== actual) {
      return { stated: w, actual: actual };
    }
  }
  return null;
}

function rfpDaysBetween(fromIso, toIso) {
  const a = Date.parse(fromIso + 'T00:00:00Z'), b = Date.parse(toIso + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Reads one opportunity and says what it is. PURE: no database, no clock of its own, no network --
 * today is passed in, which is what makes the whole thing testable against a fixed week.
 *
 * Returns { services, disqualified, flags, status, daysToClose }.
 *
 * ⭐⭐ THERE IS NO FIT SCORE, DELIBERATELY. A weighted score ranks a list, and this list is three
 * items long in a good week (2026-08-17: zero in Texas across fourteen searches, three nationwide).
 * What earns its keep is the NEGATIVE half -- the rules that killed four of ten -- and the badges
 * that stop a week being wasted. Ranking machinery for a three-row table is machinery for a problem
 * ABY does not have.
 */
function rfpScreen(rec, todayIso) {
  const title = String((rec && rec.title) || '');
  const scope = String((rec && rec.scope) || '');
  const all = title + ' ' + scope;

  const services = RFP_SERVICES.filter((s) => s.re.test(all)).map((s) => s.id);

  const disqualified = [];
  for (const rule of RFP_DISQUALIFIERS) {
    const hay = rule.field === 'title' ? title : all;
    if (rule.re.test(hay)) disqualified.push({ id: rule.id, why: rule.why });
  }

  const flags = [];
  const closes = String((rec && rec.closes_at) || '').trim();
  let daysToClose = null;

  if (closes) {
    daysToClose = rfpDaysBetween(todayIso, closes);
    if (daysToClose !== null && daysToClose < 0) flags.push('closed');
    else if (daysToClose !== null && daysToClose <= 14) flags.push('closing_soon');

    // THE STALE-CYCLE TELL. A plan year that started BEFORE proposals are due means this is last
    // year's solicitation resurfacing with this year's plan year in its title. Kept as a flag rather
    // than a rejection because a mid-year award is a real thing, just a rare one worth looking at.
    const py = String((rec && rec.plan_year) || '').trim();
    if (/^[0-9]{4}$/.test(py) && closes > py + '-01-01') flags.push('stale_cycle');

    const mm = rfpWeekdayMismatch(closes, (rec && rec.source_note) || '');
    if (mm) flags.push('date_conflict');
  }

  const pre = String((rec && rec.pre_proposal_at) || '').trim();
  const mandatory = Number((rec && rec.pre_proposal_mandatory) || 0) === 1;
  // The LACCD failure: a mandatory pre-proposal conference that had already happened by the time the
  // opportunity surfaced. If it was truly mandatory, ABY is ineligible and every hour after this
  // point is wasted. It must be impossible to miss.
  if (mandatory && pre && pre < todayIso) flags.push('pre_proposal_passed');

  const src = String((rec && rec.closes_at_source) || 'summary');
  if (src !== 'official_page') flags.push('unverified');

  const override = String((rec && rec.override_screen) || '');
  const screenedOut = override === 'drop' || (disqualified.length > 0 && override !== 'keep');

  let status;
  if (screenedOut) status = 'screened_out';
  else if (flags.indexOf('closed') !== -1) status = 'closed';
  else if (flags.indexOf('date_conflict') !== -1 || flags.indexOf('stale_cycle') !== -1) status = 'conflicting';
  else if (flags.indexOf('unverified') !== -1) status = 'needs_verification';
  else status = 'verified_open';

  return { services: services, disqualified: disqualified, flags: flags,
           status: status, daysToClose: daysToClose };
}

function rfpToday() {
  return new Date().toISOString().slice(0, 10);
}

/** One row, screened and ready for the page. */
function rfpDecorate(row, todayIso) {
  const s = rfpScreen(row, todayIso);
  return Object.assign({}, row, {
    region: rfpRegion(row.state),
    services: s.services,
    disqualified: s.disqualified,
    flags: s.flags,
    status: s.status,
    daysToClose: s.daysToClose,
  });
}

// ── The paste importer ───────────────────────────────────────────────────────────────────────────
//
// ⭐⭐ IT DOES NOT PARSE PROSE, AND THAT IS A DECISION RATHER THAN A LIMITATION. The weekly digest is
// written by a model, so its shape is stable enough to read and never stable enough to depend on.
// Guessing at prose is exactly how a confident-wrong row reaches a sales pipeline. So this reads a
// TABLE -- tab, pipe or comma separated, with a header row it works out for itself -- and REFUSES
// anything it cannot map, out loud, rather than filling in a blank.
//
// ▶️ The weekly task should emit that block alongside its prose. That is a prompt change, not a
// parser.

const RFP_COLUMNS = [
  { field: 'entity_name', names: ['entity', 'entity name', 'issuer', 'agency', 'organization', 'organisation', 'buyer', 'client'] },
  { field: 'state', names: ['state', 'st'] },
  { field: 'title', names: ['title', 'rfp title', 'solicitation', 'description', 'opportunity'] },
  { field: 'solicitation_number', names: ['number', 'rfp number', 'rfp #', 'solicitation number', 'bid number', 'rfp no'] },
  { field: 'scope', names: ['scope', 'services', 'services requested', 'service lines'] },
  { field: 'posted_at', names: ['posted', 'posted at', 'released', 'issued', 'posted date'] },
  { field: 'closes_at', names: ['closes', 'closes at', 'close date', 'deadline', 'due', 'due date', 'proposals due'] },
  { field: 'plan_year', names: ['plan year'] },
  { field: 'questions_due_at', names: ['questions due', 'questions'] },
  { field: 'pre_proposal_at', names: ['pre-proposal', 'pre proposal', 'preproposal', 'conference'] },
  { field: 'pre_proposal_mandatory', names: ['mandatory', 'pre-proposal mandatory'] },
  { field: 'estimated_value', names: ['value', 'estimated value', 'amount'] },
  { field: 'official_url', names: ['official url', 'official link', 'entity url', 'official page'] },
  { field: 'listing_url', names: ['listing', 'listing url', 'aggregator', 'aggregator url', 'link', 'url'] },
  { field: 'entity_type', names: ['entity type', 'type'] },
  { field: 'source_note', names: ['note', 'notes', 'relevance', 'comment'] },
];

function rfpSplitRow(line, delim) {
  let cells = line.split(delim).map((c) => c.trim());
  // A markdown table writes a leading and trailing pipe, which produces two empty cells.
  if (delim === '|') {
    if (cells.length && cells[0] === '') cells = cells.slice(1);
    if (cells.length && cells[cells.length - 1] === '') cells = cells.slice(0, -1);
  }
  return cells;
}

function rfpDetectDelimiter(line) {
  if (line.indexOf('\t') !== -1) return '\t';
  if (line.indexOf('|') !== -1) return '|';
  if (line.indexOf(',') !== -1) return ',';
  return null;
}

/**
 * Parses a pasted block. Returns { rows, refused, header }.
 * ⛔ Never invents a value: a row missing an entity or a title is REFUSED with a reason, and the
 * caller reports how many, exactly like the CRM event-list import does.
 */
function rfpParsePaste(text) {
  const lines = String(text || '').split(/\r?\n/)
    .filter((l) => l.trim() && !/^[|\s:-]+$/.test(l.trim()));
  if (!lines.length) return { rows: [], refused: [], header: [] };

  const delim = rfpDetectDelimiter(lines[0]);
  if (!delim) return { rows: [], refused: [{ line: lines[0], why: 'no columns found (needs tabs, pipes or commas)' }], header: [] };

  const rawHeader = rfpSplitRow(lines[0], delim).map((h) => h.toLowerCase().replace(/[*_]/g, '').trim());
  const map = rawHeader.map((h) => {
    const hit = RFP_COLUMNS.find((c) => c.names.indexOf(h) !== -1);
    return hit ? hit.field : null;
  });
  if (map.every((m) => m === null)) {
    return { rows: [], refused: [{ line: lines[0], why: 'no column heading recognized' }], header: rawHeader };
  }

  const rows = [], refused = [];
  for (const line of lines.slice(1)) {
    const cells = rfpSplitRow(line, delim);
    const rec = {};
    map.forEach((field, i) => {
      if (!field) return;
      const v = (cells[i] || '').replace(/^\*+|\*+$/g, '').trim();
      if (v) rec[field] = v;
    });
    if (!rec.entity_name || !rec.title) {
      refused.push({ line: line.slice(0, 120), why: !rec.entity_name ? 'no entity' : 'no title' });
      continue;
    }
    for (const f of ['posted_at', 'closes_at', 'questions_due_at', 'pre_proposal_at']) {
      if (rec[f] && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(rec[f])) {
        // A date we cannot read is dropped and SAID, not guessed at. An unreadable deadline that
        // silently becomes blank is how a closed RFP reads as open.
        rec.source_note = (rec.source_note ? rec.source_note + ' ' : '') +
                          '[' + f + ' not read: ' + rec[f] + ']';
        delete rec[f];
      }
    }
    if (rec.state) rec.state = rec.state.toUpperCase().slice(0, 2);
    rows.push(rec);
  }
  return { rows: rows, refused: refused, header: rawHeader };
}


// ── Endpoints ────────────────────────────────────────────────────────────────────────────────────

const RFP_FIELDS = ['entity_name', 'entity_type', 'state', 'title', 'solicitation_number', 'scope',
                    'posted_at', 'closes_at', 'plan_year', 'questions_due_at', 'pre_proposal_at',
                    'estimated_value', 'official_url', 'listing_url', 'source_note', 'conflict_note'];

function rfpClean(rec) {
  const out = {};
  for (const f of RFP_FIELDS) {
    const v = rec && rec[f];
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) out[f] = s.slice(0, 2000);
  }
  // A pasted column says 'yes', a JSON body says 1. Both mean the gate is real.
  const m = String((rec && rec.pre_proposal_mandatory) || '').trim().toLowerCase();
  out.pre_proposal_mandatory = (m === '1' || m === 'yes' || m === 'y' || m === 'true') ? 1 : 0;
  return out;
}

function rfpDateProblem(rec) {
  for (const f of ['posted_at', 'closes_at', 'plan_year', 'questions_due_at', 'pre_proposal_at']) {
    const v = rec[f];
    if (!v) continue;
    const ok = f === 'plan_year' ? /^[0-9]{4}$/.test(v) : /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v);
    if (!ok) return f + ' must be ' + (f === 'plan_year' ? 'YYYY' : 'YYYY-MM-DD');
  }
  if (rec.entity_type && RFP_ENTITY_TYPES.indexOf(rec.entity_type) === -1) {
    return 'entity_type must be one of: ' + RFP_ENTITY_TYPES.join(', ');
  }
  return null;
}

/** Find an existing row for the same solicitation. Entity plus number, else entity plus title. */
async function rfpFindExisting(env, rec) {
  if (rec.solicitation_number) {
    const hit = await env.DB.prepare(
      'SELECT id FROM rfp_opportunity WHERE lower(trim(entity_name)) = ? ' +
      "AND lower(trim(COALESCE(solicitation_number,''))) = ? LIMIT 1"
    ).bind(rec.entity_name.toLowerCase(), rec.solicitation_number.toLowerCase()).first();
    if (hit) return hit.id;
  }
  const hit2 = await env.DB.prepare(
    'SELECT id FROM rfp_opportunity WHERE lower(trim(entity_name)) = ? AND lower(trim(title)) = ? LIMIT 1'
  ).bind(rec.entity_name.toLowerCase(), rec.title.toLowerCase()).first();
  return hit2 ? hit2.id : null;
}

async function rfpInsert(env, rec, source) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const cols = RFP_FIELDS.concat(['pre_proposal_mandatory']);
  const names = ['id'].concat(cols).concat(['source', 'closes_at_source', 'created_at', 'updated_at']);
  const vals = [id].concat(cols.map((c) => (rec[c] === undefined ? null : rec[c])))
                   .concat([source, 'summary', now, now]);
  const stmt = env.DB.prepare(
    'INSERT INTO rfp_opportunity (' + names.join(', ') + ') VALUES (' +
    names.map(() => '?').join(', ') + ')'
  );
  await stmt.bind(...vals).run();
  await env.DB.prepare(
    'INSERT INTO rfp_decision (opportunity_id, disposition, updated_at) VALUES (?,?,?)'
  ).bind(id, 'new', now).run();
  return id;
}

/** GET /api/admin/rfp -- every opportunity, screened, grouped the way Eric reads them. */
async function handleRfpList(request, env) {
  const u = new URL(request.url).searchParams;
  const today = rfpToday();

  const rows = (await env.DB.prepare(
    'SELECT o.*, d.disposition, d.pass_reason, d.owner, ' +
    "       (SELECT COUNT(*) FROM crm_events e WHERE e.entity_type = 'rfp' AND e.entity_id = o.id) AS notes " +
    'FROM rfp_opportunity o LEFT JOIN rfp_decision d ON d.opportunity_id = o.id ' +
    "ORDER BY COALESCE(o.closes_at, '9999-99-99') ASC"
  ).all()).results || [];

  const all = rows.map((r) => rfpDecorate(r, today));

  const region = (u.get('region') || '').trim().toLowerCase();
  const disposition = (u.get('disposition') || '').trim().toLowerCase();
  let shown = all.filter((r) => r.status !== 'screened_out');
  if (region) shown = shown.filter((r) => r.region === region);
  if (disposition) shown = shown.filter((r) => String(r.disposition || 'new') === disposition);

  const counts = {
    total: all.length,
    screened_out: all.filter((r) => r.status === 'screened_out').length,
    open: all.filter((r) => r.status !== 'screened_out' && r.status !== 'closed').length,
    needs_call: all.filter((r) => r.status === 'conflicting' || r.status === 'needs_verification').length,
  };

  return jsonResp({
    today: today,
    rows: shown,
    screenedOut: all.filter((r) => r.status === 'screened_out'),
    counts: counts,
    dispositions: RFP_DISPOSITIONS,
    entityTypes: RFP_ENTITY_TYPES,
  });
}

/** POST /api/admin/rfp -- one opportunity, typed in. The phone-call and word-of-mouth path. */
async function handleRfpAdd(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return jsonResp({ error: 'Bad JSON.' }, 400); }
  const rec = rfpClean(body);
  if (!rec.entity_name) return jsonResp({ error: 'Who is issuing it?' }, 400);
  if (!rec.title) return jsonResp({ error: 'What is it called?' }, 400);
  const bad = rfpDateProblem(rec);
  if (bad) return jsonResp({ error: bad }, 400);

  const existing = await rfpFindExisting(env, rec);
  if (existing) return jsonResp({ error: 'Already on the list.', id: existing }, 409);

  const id = await rfpInsert(env, rec, 'manual');
  return jsonResp({ ok: true, id: id, screen: rfpScreen(rec, rfpToday()) });
}

/**
 * POST /api/admin/rfp/import -- paste a block of rows.
 *
 * ⭐ TWO STEPS ON PURPOSE. commit:false previews what it read, what it would refuse, and what it
 * already holds; commit:true writes. Nothing is ever written from a paste without a person seeing
 * the parse first, because a mis-read deadline is the exact failure this module exists to prevent.
 */
async function handleRfpImport(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return jsonResp({ error: 'Bad JSON.' }, 400); }
  const parsed = rfpParsePaste(body.text);
  if (!parsed.rows.length && !parsed.refused.length) {
    return jsonResp({ error: 'Nothing to read.' }, 400);
  }

  const today = rfpToday();
  const commit = body.commit === true;
  const added = [], known = [], refused = parsed.refused.slice();

  for (const row of parsed.rows) {
    const rec = rfpClean(row);
    if (!rec.entity_name || !rec.title) { refused.push({ line: rec.title || rec.entity_name || '(blank)', why: 'no entity or title' }); continue; }
    const bad = rfpDateProblem(rec);
    if (bad) { refused.push({ line: rec.entity_name + ' - ' + rec.title, why: bad }); continue; }

    const existing = await rfpFindExisting(env, rec);
    if (existing) { known.push({ entity: rec.entity_name, title: rec.title }); continue; }

    if (commit) await rfpInsert(env, rec, 'digest');
    added.push({ entity: rec.entity_name, title: rec.title, screen: rfpScreen(rec, today) });
  }

  return jsonResp({
    committed: commit,
    header: parsed.header,
    added: added, known: known, refused: refused,
    // ⛔ THE SPLIT, NEVER A TOTAL. "5 added" hides the four it could not read.
    summary: added.length + (commit ? ' added' : ' new') + ', ' + known.length +
             ' already known, ' + refused.length + ' refused',
  });
}

/** POST /api/admin/rfp/decision -- what ABY decided. Separate from what the world is doing. */
async function handleRfpDecision(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return jsonResp({ error: 'Bad JSON.' }, 400); }
  const id = String(body.id || '').trim();
  const disposition = String(body.disposition || '').trim().toLowerCase();
  if (!id) return jsonResp({ error: 'Which opportunity?' }, 400);
  if (RFP_DISPOSITIONS.indexOf(disposition) === -1) {
    return jsonResp({ error: 'Unknown disposition.' }, 400);
  }
  const owner = String(body.owner || '').trim().toLowerCase();
  if (owner && CRM_REPS.indexOf(owner) === -1) return jsonResp({ error: 'Unknown person.' }, 400);

  const reason = String(body.pass_reason || '').trim();
  // ⭐⭐ PASSING WITHOUT A REASON IS THE ONE THING THIS MODULE MUST NOT ALLOW. "Did we look at this
  // entity last year, and why did we not bid?" is the question Eric cannot answer today, and a
  // blank reason a year from now is indistinguishable from never having looked.
  if (disposition === 'passed' && !reason) {
    return jsonResp({ error: 'Say why you passed. A year from now that is the whole value.' }, 400);
  }

  const exists = await env.DB.prepare('SELECT id FROM rfp_opportunity WHERE id = ?').bind(id).first();
  if (!exists) return jsonResp({ error: 'No such opportunity.' }, 404);

  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO rfp_decision (opportunity_id, disposition, pass_reason, owner, updated_at) ' +
    'VALUES (?,?,?,?,?) ON CONFLICT(opportunity_id) DO UPDATE SET ' +
    'disposition = excluded.disposition, pass_reason = excluded.pass_reason, ' +
    'owner = excluded.owner, updated_at = excluded.updated_at'
  ).bind(id, disposition, reason || null, owner || null, now).run();
  return jsonResp({ ok: true });
}

/**
 * POST /api/admin/rfp/verify -- somebody opened the issuing entity's own page and looked.
 *
 * 🔴🔴 THIS IS THE GATE, AND IT IS THE WHOLE POINT OF THE MODULE. Nothing reaches verified_open any
 * other way. It records WHAT WAS SEEN (the deadline on the official page) and WHO SAW IT, and if
 * that disagrees with what was imported it keeps BOTH and says so rather than picking a winner.
 */
async function handleRfpVerify(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return jsonResp({ error: 'Bad JSON.' }, 400); }
  const id = String(body.id || '').trim();
  const seen = String(body.closes_at || '').trim();
  const by = String(body.by || '').trim().toLowerCase();
  if (!id) return jsonResp({ error: 'Which opportunity?' }, 400);
  if (by && CRM_REPS.indexOf(by) === -1) return jsonResp({ error: 'Unknown person.' }, 400);
  if (seen && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(seen)) {
    return jsonResp({ error: 'closes_at must be YYYY-MM-DD.' }, 400);
  }

  const row = await env.DB.prepare('SELECT * FROM rfp_opportunity WHERE id = ?').bind(id).first();
  if (!row) return jsonResp({ error: 'No such opportunity.' }, 404);

  // ⛔ COULD NOT VERIFY IS A REAL OUTCOME, NOT AN ERROR TO HIDE. Two of the three live items on
  // 2026-08-17 needed a phone call, and saying so is more useful than a confident wrong answer.
  if (body.unresolved === true) {
    const note = String(body.conflict_note || '').trim() || 'Could not confirm from the official page.';
    await env.DB.prepare(
      'UPDATE rfp_opportunity SET conflict_note = ?, updated_at = ? WHERE id = ?'
    ).bind(note, new Date().toISOString(), id).run();
    return jsonResp({ ok: true, status: 'conflicting', note: note });
  }

  const now = new Date().toISOString();
  let conflict = null;
  if (seen && row.closes_at && seen !== row.closes_at) {
    conflict = 'Imported deadline said ' + row.closes_at + '; the official page says ' + seen + '.';
  }
  await env.DB.prepare(
    'UPDATE rfp_opportunity SET closes_at = COALESCE(?, closes_at), ' +
    "closes_at_source = 'official_page', verified_at = ?, verified_by = ?, " +
    'conflict_note = COALESCE(?, conflict_note), updated_at = ? WHERE id = ?'
  ).bind(seen || null, now, by || null, conflict, now, id).run();

  const after = await env.DB.prepare('SELECT * FROM rfp_opportunity WHERE id = ?').bind(id).first();
  return jsonResp({ ok: true, conflict: conflict, row: rfpDecorate(after, rfpToday()) });
}


/**
 * /admin/rfp-watch
 *
 * ⭐ GROUPED THE WAY ERIC READS THE DIGEST, not the way the database stores it: Texas, then the
 * states around it, then everywhere else, then a section for the ones that need a phone call.
 * ⛔ THE PHONE-CALL SECTION IS NOT AT THE BOTTOM. Two of the three real items on 2026-08-17 landed
 * there, and burying them is how the useful half of the week goes unread.
 */
function adminRfpHTML() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>RFP Watch — ABY admin</title>
<style> *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}
${ADMIN_HEADER_CSS}
 main{max-width:1180px;margin:0 auto;padding:20px}
 .card{background:#fff;border:1px solid #e3e9f0;border-radius:9px;padding:16px 18px;margin-bottom:16px}
 h2{margin:0 0 4px;font-size:15px} .sub{margin:0 0 12px;color:#5b6b7f;font-size:13px}
 table{width:100%;border-collapse:collapse;font-size:14px}
 th{text-align:left;font-size:12px;text-transform:uppercase;color:#5b6b7f;border-bottom:1px solid #dfe5ec;padding:8px 6px}
 td{padding:9px 6px;border-bottom:1px solid #eef2f6;vertical-align:top}
 td.date,th.date{white-space:nowrap;width:1%}
 .muted{color:#8a97a8} .n{text-align:right}
 input,select,textarea{padding:6px 8px;border:1px solid #c8d2de;border-radius:6px;font-size:13px;font-family:inherit}
 textarea{width:100%;min-height:120px}
 button{padding:6px 12px;border:1px solid #1a5c3a;background:#1a5c3a;color:#fff;border-radius:6px;font-size:13px;cursor:pointer}
 button.ghost{background:#fff;color:#1a5c3a}
 .chip{display:inline-block;padding:1px 7px;border-radius:10px;background:#eef3ee;color:#1a5c3a;font-size:11.5px;margin:1px 3px 1px 0}
 .badge{display:inline-block;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600;margin:1px 4px 1px 0;text-transform:uppercase;letter-spacing:.02em}
 .b-red{background:#fdecea;color:#a1160a;border:1px solid #f5c6c0}
 .b-amber{background:#fff6e5;color:#8a5a00;border:1px solid #f2dcb3}
 .b-grey{background:#eef2f6;color:#5b6b7f;border:1px solid #dfe5ec}
 .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
 .sec{margin:18px 0 6px;font-size:13px;font-weight:700;color:#1a5c3a;text-transform:uppercase;letter-spacing:.04em}
 details summary{cursor:pointer;color:#5b6b7f;font-size:13px}
 .note{font-size:12.5px;color:#5b6b7f;margin-top:3px}
 /* ── THE ANSWER LIBRARY (F-385) ──────────────────────────────────────────────────────────
    A SECOND VIEW, NOT A TENTH NAV ENTRY. Eric asked to "build that RFP answer library into the
    page somewhere", and F-408 had just taken the nav from ten entries to nine for being too
    many. Watch FINDS an opportunity and the library ANSWERS one -- the same job at two moments,
    which is what earns two views of one page rather than two pages. Same pattern as Brokers and
    Agencies (Performance / Marketing). */
 .vsw{display:flex;gap:6px;margin:0 0 16px}
 .vsw button{border:1px solid #c8d2de;background:#fff;color:#12263f;border-radius:7px;
             padding:7px 15px;cursor:pointer;font:600 13.5px inherit}
 .vsw button.on{background:#1a5c3a;border-color:#1a5c3a;color:#fff}
 .prog{display:flex;gap:18px;flex-wrap:wrap;font-size:13px;color:#5b6b7f;margin:0 0 12px}
 .prog b{color:#12263f;font-variant-numeric:tabular-nums}
 .bar{height:7px;background:#e9eef4;border-radius:4px;overflow:hidden;margin:0 0 14px}
 .bar i{display:block;height:100%;background:#1a5c3a}
 .qc{background:#fff;border:1px solid #e3e9f0;border-left:4px solid #c8d2de;border-radius:9px;
     padding:14px 16px;margin:0 0 12px}
 /* The left edge carries the STATE, because it is the one thing you scan a long list for. */
 .qc.s-draft{border-left-color:#c8a23a} .qc.s-verified{border-left-color:#1a5c3a}
 .qc.s-na{border-left-color:#c3ccc6;background:#fafbfc}
 .qc .qhead{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap;margin:0 0 7px}
 .qc .qt{font-weight:600;font-size:14.5px;flex:1;min-width:240px}
 .pchip{font:600 11px ui-monospace,Consolas,monospace;padding:2px 7px;border-radius:10px;
        background:#eef2f7;color:#5b6b7f;white-space:nowrap}
 .pchip.p1{background:#1a5c3a;color:#fff} .pchip.p2{background:#e8f5ee;color:#1a5c3a}
 .qc textarea{width:100%;min-height:74px;padding:9px 11px;border:1px solid #c8d2de;
              border-radius:7px;font:14px inherit;resize:vertical}
 .qc textarea:focus{outline:none;border-color:#1a5c3a}
 /* The 2025 answer is visibly NOT the answer box. It is a year old, it says "please check" in the
    workbook it came from, and it covers FSA and LSA only. Styling it like an answer would make 46
    unchecked claims look like 46 finished ones. */
 .seed{background:#fbf7ec;border:1px dashed #ddc98d;border-radius:7px;padding:9px 11px;
       margin:0 0 9px;font-size:13.5px;color:#6b5a2a}
 .seed .lbl{display:block;font:600 11px inherit;text-transform:uppercase;letter-spacing:.03em;
            color:#8a7433;margin:0 0 4px}
 .seed button{background:#fff;border:1px solid #ddc98d;color:#6b5a2a;border-radius:5px;
              padding:3px 9px;font-size:12px;cursor:pointer;margin-top:6px}
 .qacts{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:9px;font-size:13px}
 .qacts label{display:flex;gap:5px;align-items:center;cursor:pointer}
 .qsave{font-size:12px;color:#8a97a8;margin-left:auto}
 .qsave.ok{color:#1a5c3a} .qsave.bad{color:#a12622}
 details.also summary{cursor:pointer;font-size:12.5px;color:#5b6b7f;margin:0 0 6px}
 details.also div{font-size:12.5px;color:#5b6b7f;white-space:pre-wrap;
                  border-left:2px solid #e3e9f0;padding-left:10px;margin:0 0 8px}
</style></head><body>
${abyAdminNav('/admin/rfp-watch')}
<main>
  <div class="vsw">
    <button id="vWatch" class="on" onclick="setRfpView('watch')">Opportunities</button>
    <button id="vLib" onclick="setRfpView('library')">Answer library</button>
  </div>
<div id="watchView">
  <div class="card">
    <h2>RFP Watch</h2>
    <p class="sub" id="counts">Loading…</p>
    <p class="sub">Public entities buying these services direct: cities, counties, school districts, higher ed.
       This is a different channel from Brokers &amp; Agencies and the two lists never merge.</p>
    <div>
      <select id="fRegion" onchange="load()">
        <option value="">Everywhere</option><option value="tx">Texas</option>
        <option value="tx_adjacent">OK, LA, AR, NM</option><option value="national">National</option>
      </select>
      <select id="fDisp" onchange="load()"><option value="">Any disposition</option></select>
    </div>
  </div>

  <div id="lists"></div>

  <div class="card" id="pasteCard">
    <h2>Paste a list</h2>
    <p class="sub">A table with a heading row: tabs, pipes or commas. It works out the columns itself,
       shows you what it read, and refuses anything it cannot map rather than guessing.
       Headings it knows include entity, state, title, number, closes, posted, scope, official url, listing.</p>
    <textarea id="paste" placeholder="entity	state	title	closes	listing"></textarea>
    <p><button class="ghost" onclick="preview()">Read it</button>
       <button id="commitBtn" onclick="commitPaste()" style="display:none">Add these</button></p>
    <div id="pasteOut"></div>
  </div>

  <div class="card">
    <h2>Add one</h2>
    <p class="sub">For an opportunity that arrived by phone or word of mouth.</p>
    <div class="grid">
      <input id="aEntity" placeholder="Issuing entity"><input id="aState" placeholder="State" maxlength="2">
      <input id="aTitle" placeholder="Title"><input id="aNumber" placeholder="Solicitation number">
      <input id="aCloses" placeholder="Closes YYYY-MM-DD"><input id="aUrl" placeholder="Official page URL">
    </div>
    <p><input id="aScope" placeholder="Services requested" style="width:100%;margin-top:10px"></p>
    <p><button onclick="addOne()">Add</button> <span id="addOut" class="muted"></span></p>
  </div>

  <div class="card">
    <details><summary id="dropSummary">Screened out</summary><div id="dropped"></div></details>
  </div>
</div><!-- /watchView -->

<div id="libView" style="display:none">
  <div class="card">
    <h2>RFP answer library</h2>
    <p class="sub">Every question the nineteen solicitations asked, folded so the same question
      appears once. <strong>Answer them here</strong> &mdash; short and tentative is fine to start;
      tick <em>Verified</em> only when an answer is checked and complete.</p>
    <div class="prog" id="libProg"><span class="muted">Loading&hellip;</span></div>
    <div class="bar"><i id="libBar" style="width:0"></i></div>
    <div class="filters" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <select id="lPri" onchange="loadLib()">
        <option value="">Priority 1 and 2 (start here)</option>
        <option value="1">1 &mdash; asked by four or more</option>
        <option value="2">2 &mdash; asked by three</option>
        <option value="3">3 &mdash; asked by two</option>
        <option value="4">4 &mdash; one-offs</option>
        <option value="all">Everything</option>
      </select>
      <select id="lStatus" onchange="loadLib()">
        <option value="">Any state</option>
        <option value="open">Not started</option>
        <option value="draft">Draft</option>
        <option value="verified">Verified</option>
        <option value="na">Not applicable</option>
      </select>
      <select id="lTopic" onchange="loadLib()"><option value="">Any topic</option></select>
      <input id="lFind" placeholder="Find a question" oninput="debLib()"
             style="padding:6px 9px;border:1px solid #c8d2de;border-radius:6px;font-size:13px;min-width:200px">
      <span class="muted" id="lCount" style="margin-left:auto;font-size:13px"></span>
    </div>
  </div>
  <div id="libList"><p class="muted">Loading&hellip;</p></div>
</div>
</main>
<script>
var DATA = null;

function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

var BADGES = {
  pre_proposal_passed: ['b-red',  'Mandatory pre-proposal already held'],
  closed:              ['b-grey', 'Closed'],
  date_conflict:       ['b-red',  'Sources conflict'],
  stale_cycle:         ['b-red',  'Looks like last year'],
  closing_soon:        ['b-amber','Closing soon'],
  unverified:          ['b-amber','Deadline not confirmed']
};

function load(){
  var q = [];
  var r = document.getElementById('fRegion').value; if (r) q.push('region=' + r);
  var d = document.getElementById('fDisp').value;   if (d) q.push('disposition=' + d);
  fetch('/api/admin/rfp' + (q.length ? '?' + q.join('&') : ''))
    .then(function(res){
      // The worker answers HTML, not JSON, in exactly one situation worth naming: the tables are
      // not in this database yet. Letting the JSON parser fail produces "Unexpected token <",
      // which tells a reader nothing and sent one straight to the Cloudflare error page.
      var type = res.headers.get('content-type') || '';
      if (type.indexOf('json') === -1) {
        throw new Error(res.status === 200 || res.status === 500
          ? 'the RFP tables are not in this database yet. Open /api/migrate once while signed in, then reload this page. It is safe to run more than once.'
          : 'the server answered ' + res.status + ' instead of data.');
      }
      return res.json();
    })
    .then(function(j){ DATA = j; render(j); })
    .catch(function(e){
      document.getElementById('counts').textContent = 'Could not load: ' + (e && e.message ? e.message : e);
    });
}

// ── THE TWO VIEWS ────────────────────────────────────────────────────────────────────────
// Watch FINDS an opportunity; the library ANSWERS one. Two moments of one job, which is what
// earns two views rather than two pages -- the nav had just been cut from ten entries to nine.
// The choice is REMEMBERED, like the CRM's, because whichever you use is the one you use.
function setRfpView(v){
  var lib = (v === 'library');
  document.getElementById('watchView').style.display = lib ? 'none' : '';
  document.getElementById('libView').style.display = lib ? '' : 'none';
  document.getElementById('vWatch').className = lib ? '' : 'on';
  document.getElementById('vLib').className = lib ? 'on' : '';
  try { localStorage.setItem('abyRfpView', lib ? 'library' : 'watch'); } catch(e) {}
  // Each view fetches its own rows the first time it is shown, so opening the page does not pay
  // for the one you are not looking at.
  if (lib && !LIB_LOADED) loadLib();
}

var LIB = [], LIB_LOADED = false, libTimer;
function debLib(){ clearTimeout(libTimer); libTimer = setTimeout(loadLib, 250); }

function esc2(x){ return String(x == null ? '' : x).replace(/[&<>"]/g, function(c){
  return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

function loadLib(){
  var p = [];
  var pri = document.getElementById('lPri').value;
  var st = document.getElementById('lStatus').value;
  var tp = document.getElementById('lTopic').value;
  var fd = document.getElementById('lFind').value.trim();
  if (pri) p.push('priority=' + encodeURIComponent(pri));
  if (st) p.push('status=' + encodeURIComponent(st));
  if (tp) p.push('topic=' + encodeURIComponent(tp));
  if (fd) p.push('q=' + encodeURIComponent(fd));
  document.getElementById('libList').innerHTML = '<p class="muted">Loading&hellip;</p>';
  fetch('/api/admin/rfp/library' + (p.length ? '?' + p.join('&') : ''))
    .then(function(r){ return r.json(); })
    .then(function(j){
      // AN ERROR IS NOT AN EMPTY LIBRARY. Before the migration runs the table does not exist, and
      // "no questions" would read as a finished job rather than a missing one.
      if (j.error){
        document.getElementById('libList').innerHTML =
          '<div class="warn">Could not load the library: ' + esc2(j.error) +
          '. If this is the first time, open /api/migrate once while signed in, then reload.</div>';
        return;
      }
      LIB_LOADED = true; LIB = j.rows || [];
      paintProg(j.totals || {});
      paintTopics(j.topics || []);
      paintLib();
    })
    .catch(function(e){
      document.getElementById('libList').innerHTML =
        '<div class="warn">Could not load the library: ' + esc2(e && e.message ? e.message : e) + '</div>';
    });
}

// ⭐ THE PROGRESS IS OVER THE WHOLE TABLE, NEVER THE FILTERED ROWS. "How much is left" has to mean
// the same thing every visit; a figure that moves when you change a filter is arithmetic about
// the filter, not progress.
function paintProg(t){
  var total = Number(t.total || 0), ver = Number(t.verified || 0);
  var dr = Number(t.draft || 0), na = Number(t.na || 0);
  var done = ver + na;
  document.getElementById('libProg').innerHTML =
      '<span><b>' + ver + '</b> verified</span>'
    + '<span><b>' + dr + '</b> draft</span>'
    + '<span><b>' + na + '</b> not applicable</span>'
    + '<span><b>' + Math.max(0, total - ver - dr - na) + '</b> not started</span>'
    + '<span><b>' + Number(t.p12_open || 0) + '</b> left in priority 1 and 2</span>'
    + (Number(t.docs || 0) ? '<span><b>' + t.docs + '</b> need a document</span>' : '');
  document.getElementById('libBar').style.width = total ? Math.round(done * 100 / total) + '%' : '0';
}

function paintTopics(list){
  var sel = document.getElementById('lTopic');
  if (sel.options.length > 1) return;   // built once; rebuilding would drop the current choice
  for (var i = 0; i < list.length; i++){
    var o = document.createElement('option');
    o.value = list[i].topic;
    o.textContent = list[i].topic + ' (' + list[i].n + ')';
    sel.appendChild(o);
  }
}

function paintLib(){
  document.getElementById('lCount').textContent = LIB.length + ' question' + (LIB.length === 1 ? '' : 's');
  if (!LIB.length){
    document.getElementById('libList').innerHTML =
      '<p class="muted">Nothing matches those filters. Widen them, or switch the priority to Everything.</p>';
    return;
  }
  var h = '';
  for (var i = 0; i < LIB.length; i++) h += card(LIB[i]);
  document.getElementById('libList').innerHTML = h;
}

function card(r){
  var st = r.status || '';
  var id = esc2(r.id);
  var pc = 'pchip' + (r.priority === 1 ? ' p1' : r.priority === 2 ? ' p2' : '');
  var h = '<div class="qc s-' + esc2(st || 'none') + '" id="qc_' + id + '">'
    + '<div class="qhead">'
    + '<span class="' + pc + '">P' + esc2(r.priority) + '</span>'
    + '<span class="qt">' + esc2(r.question) + '</span>'
    + '<span class="muted" style="font-size:12px">' + esc2(r.topic || '') + '</span>'
    // ⭐ HOW MANY RFPs ASKED IT is the reason this question is where it is in the list, so it is
    // on screen rather than implied by the sort order.
    + '<span class="muted" style="font-size:12px">asked by ' + esc2(r.asked_by) + '</span>'
    + '</div>';

  if (r.also_asked) h += '<details class="also"><summary>Other wordings</summary><div>'
    + esc2(r.also_asked) + '</div></details>';

  // The 2025 answer is a SUGGESTION and is styled so it cannot be mistaken for the answer.
  if (r.seed_answer) h += '<div class="seed"><span class="lbl">ABY told College Station in 2025 &mdash; please check</span>'
    + esc2(r.seed_answer)
    + '<br><button type="button" onclick="useSeed(' + "'" + id + "'" + ')">Use this as a starting point</button></div>';

  h += '<textarea id="ta_' + id + '" placeholder="Short and tentative is fine to start" '
    + 'onblur="saveAnswer(' + "'" + id + "'" + ')">' + esc2(r.answer || '') + '</textarea>'
    + '<div class="qacts">'
    + '<label><input type="checkbox" id="vf_' + id + '"' + (st === 'verified' ? ' checked' : '')
    + ' onchange="setStatus(' + "'" + id + "'" + ', this.checked ? ' + "'verified'" + ' : ' + "'draft'" + ')"> Verified and complete</label>'
    + '<label><input type="checkbox" id="na_' + id + '"' + (st === 'na' ? ' checked' : '')
    + ' onchange="setStatus(' + "'" + id + "'" + ', this.checked ? ' + "'na'" + ' : ' + "''" + ')"> Not applicable</label>'
    + '<label><input type="checkbox" id="nd_' + id + '"' + (r.needs_doc ? ' checked' : '')
    + ' onchange="setDoc(' + "'" + id + "'" + ', this.checked)"> Needs a document</label>'
    + '<select onchange="setOwner(' + "'" + id + "'" + ', this.value)" style="font-size:12.5px">'
    + '<option value=""' + (!r.owner ? ' selected' : '') + '>&mdash; nobody yet &mdash;</option>'
    + '<option value="niels"' + (r.owner === 'niels' ? ' selected' : '') + '>Niels</option>'
    + '<option value="eric"' + (r.owner === 'eric' ? ' selected' : '') + '>Eric</option>'
    + '</select>'
    + '<span class="qsave" id="sv_' + id + '"></span>'
    + '</div>'
    // Only when it is flagged, so 367 empty boxes do not sit on screen asking a question nobody
    // has been asked yet.
    + '<div id="dn_' + id + '" style="' + (r.needs_doc ? '' : 'display:none;') + 'margin-top:8px">'
    + '<input id="di_' + id + '" placeholder="Which document answers this, and where is it?" '
    + 'value="' + esc2(r.doc_note || '') + '" onblur="saveDocNote(' + "'" + id + "'" + ')" '
    + 'style="width:100%;padding:7px 9px;border:1px solid #c8d2de;border-radius:6px;font-size:13px">'
    + '</div>'
    + '</div>';
  return h;
}

function rowOf(id){ for (var i = 0; i < LIB.length; i++) if (LIB[i].id === id) return LIB[i]; return null; }
function flash(id, text, bad){
  var el = document.getElementById('sv_' + id);
  if (!el) return;
  el.textContent = text;
  el.className = 'qsave' + (bad ? ' bad' : (text ? ' ok' : ''));
}

function post(id, body, after){
  flash(id, 'Saving...', false);
  fetch('/api/admin/rfp/answer', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(Object.assign({ id: id }, body)),
  }).then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); })
    .then(function(res){
      if (!res.ok){ flash(id, res.j.error || 'Not saved', true); return; }
      // ⛔ THE ROW IS REPLACED FROM WHAT THE DATABASE SENT BACK, never from what we hoped we sent.
      // Otherwise the screen agrees with itself while the store holds something else.
      var r = rowOf(id);
      if (r && res.j.row) for (var k in res.j.row) r[k] = res.j.row[k];
      flash(id, 'Saved', false);
      if (after) after(r);
      loadProgOnly();
    })
    .catch(function(e){
      // A NETWORK FAILURE IS NOT A REFUSAL. "Not saved" alone would have somebody retype it.
      flash(id, 'Could not reach the server, so nothing was saved', true);
    });
}

// The counters move on every save, and re-fetching the whole list would throw away a textarea
// somebody is part way through. So the totals are refreshed on their own.
function loadProgOnly(){
  fetch('/api/admin/rfp/library?priority=1&status=verified')
    .then(function(r){ return r.json(); })
    .then(function(j){ if (!j.error) paintProg(j.totals || {}); })
    .catch(function(){});
}

function saveAnswer(id){
  var r = rowOf(id); if (!r) return;
  var v = document.getElementById('ta_' + id).value;
  if (v === (r.answer || '')) { flash(id, '', false); return; }   // nothing typed: no write, no noise
  // ⭐ TYPING SOMETHING MAKES IT A DRAFT, unless it is already verified or set aside. Leaving a
  // typed answer at "not started" is how a question with words in it reads as untouched.
  var body = { answer: v };
  if (!r.status) body.status = v.trim() ? 'draft' : '';
  post(id, body, function(row){ if (row) applyState(id, row); });
}
function setStatus(id, st){ post(id, { status: st }, function(row){ if (row) applyState(id, row); }); }
function setOwner(id, ow){ post(id, { owner: ow }); }
function setDoc(id, on){
  document.getElementById('dn_' + id).style.display = on ? '' : 'none';
  post(id, { needsDoc: on });
}
function saveDocNote(id){
  var r = rowOf(id); if (!r) return;
  var v = document.getElementById('di_' + id).value;
  if (v === (r.doc_note || '')) return;
  post(id, { docNote: v });
}
function useSeed(id){
  var r = rowOf(id); if (!r || !r.seed_answer) return;
  var ta = document.getElementById('ta_' + id);
  // ⛔ NEVER OVERWRITES TYPED TEXT. The button is a starting point, and somebody who has already
  // written something has passed that point.
  if (ta.value.trim()){ flash(id, 'There is already an answer here', true); return; }
  ta.value = r.seed_answer;
  ta.focus();
  saveAnswer(id);
}

// Repaint just the chrome of one card, so the state is visible without redrawing the list and
// losing whatever else is half typed.
function applyState(id, row){
  var el = document.getElementById('qc_' + id);
  if (el) el.className = 'qc s-' + (row.status || 'none');
  var vf = document.getElementById('vf_' + id), na = document.getElementById('na_' + id);
  if (vf) vf.checked = row.status === 'verified';
  if (na) na.checked = row.status === 'na';
}

function render(j){
  var sel = document.getElementById('fDisp');
  if (sel.options.length === 1) {
    j.dispositions.forEach(function(d){
      var o = document.createElement('option'); o.value = d; o.textContent = d; sel.appendChild(o); });
  }
  document.getElementById('counts').textContent =
    j.counts.total + ' tracked, ' + j.counts.open + ' still open, ' +
    j.counts.needs_call + ' need a look at the official page, ' +
    j.counts.screened_out + ' screened out.';

  var call = j.rows.filter(function(r){ return r.status === 'conflicting'; });
  var rest = j.rows.filter(function(r){ return r.status !== 'conflicting'; });
  var html = '';
  html += section('Needs a phone call', call);
  html += section('Texas', rest.filter(function(r){ return r.region === 'tx'; }));
  html += section('Oklahoma, Louisiana, Arkansas, New Mexico',
                  rest.filter(function(r){ return r.region === 'tx_adjacent'; }));
  html += section('National', rest.filter(function(r){ return r.region === 'national'; }));
  document.getElementById('lists').innerHTML = html;

  document.getElementById('dropSummary').textContent =
    'Screened out (' + j.screenedOut.length + ') - the rules can be wrong, so they are kept and shown';
  document.getElementById('dropped').innerHTML = j.screenedOut.length
    ? table(j.screenedOut, true) : '<p class="sub">Nothing screened out yet.</p>';
}

function section(title, rows){
  var body = rows.length ? table(rows, false)
    : '<p class="sub">Nothing here. That is the system working, not a fault: a quiet week is the base rate.</p>';
  return '<div class="card"><div class="sec">' + esc(title) + ' (' + rows.length + ')</div>' + body + '</div>';
}

function table(rows, dropped){
  var h = '<table><tr><th>Entity</th><th>What they want</th><th class="date">Closes</th>' +
          (dropped ? '<th>Screened out because</th>' : '<th>Decision</th>') + '</tr>';
  rows.forEach(function(r){ h += rowHtml(r, dropped); });
  return h + '</table>';
}

function rowHtml(r, dropped){
  var badges = (r.flags || []).map(function(f){
    var b = BADGES[f]; return b ? '<span class="badge ' + b[0] + '">' + b[1] + '</span>' : ''; }).join('');
  var chips = (r.services || []).map(function(s){ return '<span class="chip">' + esc(s) + '</span>'; }).join('');
  var where = esc(r.entity_name) + (r.state ? ' <span class="muted">' + esc(r.state) + '</span>' : '');
  var when = r.closes_at ? esc(r.closes_at) : '<span class="muted">not stated</span>';
  if (r.daysToClose !== null && r.daysToClose >= 0) when += '<div class="note">' + r.daysToClose + ' days</div>';

  var last = '';
  if (dropped) {
    last = (r.disqualified || []).map(function(d){ return esc(d.why); }).join('<br>') +
           '<div class="note"><button class="ghost" onclick="keep(&quot;' + r.id + '&quot;)">This one is real</button></div>';
  } else {
    last = '<select onchange="setDisposition(&quot;' + r.id + '&quot;, this.value)">' +
      (DATA.dispositions || []).map(function(d){
        return '<option value="' + d + '"' + ((r.disposition || 'new') === d ? ' selected' : '') + '>' + d + '</option>';
      }).join('') + '</select>' +
      '<div class="note"><button class="ghost" onclick="verify(&quot;' + r.id + '&quot;)">I checked their own page</button></div>';
    if (r.conflict_note) last += '<div class="note">' + esc(r.conflict_note) + '</div>';
    if (r.pass_reason) last += '<div class="note">Passed: ' + esc(r.pass_reason) + '</div>';
  }

  var links = '';
  if (r.official_url) links += ' <a href="' + esc(r.official_url) + '" target="_blank" rel="noopener">their page</a>';
  if (r.listing_url) links += ' <a href="' + esc(r.listing_url) + '" target="_blank" rel="noopener">listing</a>';

  return '<tr><td>' + where + '</td><td>' + esc(r.title) +
         (r.solicitation_number ? ' <span class="muted">' + esc(r.solicitation_number) + '</span>' : '') +
         '<div>' + chips + '</div><div>' + badges + '</div>' +
         (links ? '<div class="note">' + links + '</div>' : '') +
         '</td><td class="date">' + when + '</td><td>' + last + '</td></tr>';
}

function post(url, body){
  return fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    .then(function(res){ return res.json().then(function(j){ return { ok: res.ok, j: j }; }); });
}

function setDisposition(id, disposition){
  var reason = '';
  if (disposition === 'passed') {
    reason = window.prompt('Why are we passing? A year from now this is the whole value.') || '';
    if (!reason.trim()) { alert('Not recorded: a pass needs a reason.'); load(); return; }
  }
  post('/api/admin/rfp/decision', { id:id, disposition:disposition, pass_reason:reason })
    .then(function(r){ if (!r.ok) alert(r.j.error || 'Did not save.'); load(); });
}

function verify(id){
  var seen = window.prompt('What deadline does the ISSUING ENTITY own page show? YYYY-MM-DD, or leave blank if you could not tell.');
  if (seen === null) return;
  if (!seen.trim()) {
    var why = window.prompt('What happened? (for example: their page does not list it, or it needs a phone call)') || '';
    post('/api/admin/rfp/verify', { id:id, unresolved:true, conflict_note:why }).then(function(){ load(); });
    return;
  }
  post('/api/admin/rfp/verify', { id:id, closes_at:seen.trim() }).then(function(r){
    if (!r.ok) { alert(r.j.error || 'Did not save.'); return; }
    if (r.j.conflict) alert(r.j.conflict + ' Both are kept. Neither is thrown away.');
    load();
  });
}

function keep(id){
  post('/api/admin/rfp/decision', { id:id, disposition:'reviewing' }).then(function(){
    alert('Moved to reviewing. The screening rules still show their reason.'); load(); });
}

function preview(){ paste(false); }
function commitPaste(){ paste(true); }

function paste(commit){
  var text = document.getElementById('paste').value;
  post('/api/admin/rfp/import', { text:text, commit:commit }).then(function(r){
    var j = r.j;
    if (!r.ok) { document.getElementById('pasteOut').innerHTML = '<p class="sub">' + esc(j.error || 'Could not read that.') + '</p>'; return; }
    var h = '<p class="sub"><strong>' + esc(j.summary) + '</strong></p>';
    if (j.header && j.header.length) h += '<p class="note">Columns read: ' + esc(j.header.join(', ')) + '</p>';
    if (j.added.length) {
      h += '<table><tr><th>Entity</th><th>Title</th><th>Screening</th></tr>';
      j.added.forEach(function(a){
        var flags = (a.screen.flags || []).join(', ');
        var dq = (a.screen.disqualified || []).map(function(d){ return d.why; }).join('; ');
        h += '<tr><td>' + esc(a.entity) + '</td><td>' + esc(a.title) + '</td><td>' +
             esc(dq ? 'screened out: ' + dq : (flags || 'looks like a fit')) + '</td></tr>';
      });
      h += '</table>';
    }
    if (j.refused.length) {
      h += '<p class="sub">Refused, and not guessed at:</p><ul class="sub">';
      j.refused.forEach(function(f){ h += '<li>' + esc(f.why) + ' - ' + esc(f.line) + '</li>'; });
      h += '</ul>';
    }
    document.getElementById('pasteOut').innerHTML = h;
    document.getElementById('commitBtn').style.display = (!commit && j.added.length) ? '' : 'none';
    if (commit) { document.getElementById('paste').value = ''; load(); }
  });
}

function addOne(){
  var body = {
    entity_name: document.getElementById('aEntity').value,
    state: document.getElementById('aState').value,
    title: document.getElementById('aTitle').value,
    solicitation_number: document.getElementById('aNumber').value,
    closes_at: document.getElementById('aCloses').value,
    official_url: document.getElementById('aUrl').value,
    scope: document.getElementById('aScope').value
  };
  post('/api/admin/rfp', body).then(function(r){
    document.getElementById('addOut').textContent = r.ok ? 'Added.' : (r.j.error || 'Not added.');
    if (r.ok) {
      ['aEntity','aState','aTitle','aNumber','aCloses','aUrl','aScope'].forEach(function(i){
        document.getElementById(i).value = ''; });
      load();
    }
  });
}

function logout(){ fetch('/api/admin/logout',{method:'POST'}).then(function(){ location.href='/admin'; }); }
load();

// THE REMEMBERED VIEW IS RESTORED AFTER load(), NOT BEFORE. load() paints the Opportunities
// list; restoring first would hide the container it is about to write into, and the library
// would then fetch on top of a page still settling. Watch is the default for a first visit.
try {
  if (localStorage.getItem('abyRfpView') === 'library') setRfpView('library');
} catch (e) { /* private mode: the default view is correct, not an error */ }
</script>
</body></html>`;
}

// ─── The dated things one ABY admin screen is built from (F-403) ───────────────
//
// ERIC, 2026-08-25: "I want to work on adding a to do list and calendar similar to what we just
// did to the ABY admin area."
//
// WHAT THE BROKER DASHBOARD DID AND WHY THIS IS NOT A COPY OF IT. There, the value was the MERGE:
// five sources -- compliance requirements, renewal milestones, renewal dates, quotes and the
// broker's own to-dos -- landing on one list, because a broker was checking five screens. ABY's
// admin does not have five sources. Counted against live D1 on 2026-08-25, before a line of this
// was written:
//
//   rfp_opportunity      0 rows          (the RFP watch is built and empty -- F-385, with Niels)
//   commitments          1 row
//   aby_clients          3,190 rows, of which 158 carry an effective_date
//                        AND ALL 158 ARE FLAGGED AN ESTIMATE
//   quotes               6,168 rows, of which only 150 hold a real ISO effective date;
//                        1,581 hold PROSE such as "Aug 2025 or later"
//
// So this is a TO-DO LIST with a few genuine dated rows beside it, which is what F-403 itself said
// to build if the measurement came out this way. A five-source merge would have rendered empty.
//
// WHY aby_clients IS NOT A SOURCE, STATED SO IT IS NOT ADDED LATER BY SOMEBODY READING THE TABLE
// AND NOT THE DATA: a renewal calendar needs an anniversary, every anniversary available here is
// an ESTIMATE, and a calendar that prints an estimated date as a due date is inventing work. The
// rule this project already has for that case is to print the blank and say why.
//
// THE PROSE TRAP IS LOAD-BEARING AND IT BIT DURING THIS BUILD. Comparing effective_date against
// today in SQL is TRUE for every one of the 1,581 prose rows, because in a string comparison the
// letter A sorts after the digit 2. The first measurement of this feature said 1,513 pending
// quotes had a future effective date. The real number is 11. Every read of that column goes
// through isoDay().

/** A calendar day, or null. Rejects anything that is not exactly YYYY-MM-DD, including prose. */
function isoDay(v) {
  const s = String(v == null ? '' : v).trim().slice(0, 10);
  if (s.length !== 10 || s[4] !== '-' || s[7] !== '-') return null;
  const y = Number(s.slice(0, 4)), m = Number(s.slice(5, 7)), d = Number(s.slice(8, 10));
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Reject a day that does not exist in that month, so 2026-02-30 cannot become a due date.
  const back = new Date(Date.UTC(y, m - 1, d));
  if (back.getUTCFullYear() !== y || back.getUTCMonth() + 1 !== m || back.getUTCDate() !== d) return null;
  return s;
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. Negative means `to` is in the past. */
function daysBetween(from, to) {
  const a = isoDay(from), b = isoDay(to);
  if (!a || !b) return null;
  // Built from the PARTS, never through new Date(string). new Date of a bare "2026-03-01" is the
  // 28th of February in a US timezone, which would move every due date by a day for everybody.
  const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((tb - ta) / 86400000);
}

/** "2026-08-19" as "Aug 19" -- the same shape the page prints in its date column, so a note beside
 *  a row does not read in a different language from the row. */
function dayName(iso) {
  const d = isoDay(iso);
  if (!d) return '';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return M[Number(d.slice(5, 7)) - 1] + ' ' + Number(d.slice(8, 10));
}

/** Today as YYYY-MM-DD, in UTC, so the server and every reader agree on which day it is. */
function todayIso() { return new Date().toISOString().slice(0, 10); }

/** `days` after an ISO day, as an ISO day. */
function addDays(iso, days) {
  const a = isoDay(iso);
  if (!a) return null;
  const t = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10)) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

// Silence this long since the LAST thing you sent a broker is worth a phone call. Eric has not set
// a number; 14 days is the tool's own rhythm -- a quote goes out, the broker takes it to the
// employer, and a fortnight with nothing back is the point to ring rather than wait.
const FOLLOWUP_AFTER_DAYS = 14;
// And a broker nobody has quoted in this long is not a follow-up any more, they are a dead lead.
// Without this bound the list is 5,977 quotes: every row of a fifteen-year back catalogue is 'P',
// because the import had no status to give it.
const FOLLOWUP_UNTIL_DAYS = 90;

/**
 * Everything with a date on it, from every source that has one, as one list.
 *
 * Each row: { key, kind, title, entity, dueOn (ISO or null), days (or null), owner, note }
 * `days` is negative for overdue. `dueOn: null` is a REAL answer -- an undated to-do -- and the
 * screen gives it its own section rather than dropping it or inventing a date.
 */
async function abyDatedThings(env, opts) {
  const today = (opts && opts.today) || todayIso();
  const out = [];
  const counts = { todo: 0, quote: 0, followup: 0, rfp: 0, commitment: 0 };
  const problems = [];

  // ① The to-dos. The only source somebody TYPES, and the reason this screen exists.
  try {
    const r = await env.DB.prepare(
      "SELECT id, title, due_on, due_time, kind, sort_order, owner, entity_type, entity_id, " +
      "       entity_label, note, done_at, done_note, created_at " +
      "FROM aby_task WHERE done_at IS NULL " +
      // ⭐ DATE, THEN TIME, THEN THE HAND-SET ORDER, THEN AGE. A 9am meeting sorts above a 2pm one
      // without anybody arranging anything -- which is what Eric asked for -- and the manual order
      // only decides the rows a clock cannot. An untimed to-do sorts AFTER the timed ones on its
      // day, because a thing with an appointment has to happen at that moment and a thing without
      // one can move.
      "ORDER BY COALESCE(due_on,'9999') ASC, COALESCE(due_time,'99:99') ASC, " +
      "COALESCE(sort_order, 0) ASC, created_at ASC"
    ).all();
    for (const t of (r.results || [])) {
      const due = isoDay(t.due_on);
      out.push({
        key: 'todo:' + t.id,
        kind: 'todo',
        id: t.id,
        title: String(t.title || ''),
        entity: String(t.entity_label || ''),
        entityType: String(t.entity_type || ''),
        entityId: String(t.entity_id || ''),
        owner: String(t.owner || ''),
        note: String(t.note || ''),
        dueOn: due,
        dueTime: String(t.due_time || ''),
        taskKind: String(t.kind || 'todo'),
        sortOrder: t.sort_order == null ? null : Number(t.sort_order),
        days: due ? daysBetween(today, due) : null,
      });
      counts.todo++;
    }
  } catch (e) {
    // A source that cannot be read is REPORTED, never silently absent. A missing source renders as
    // a slightly shorter list, which nobody can tell from a quiet week -- the exact failure this
    // whole screen exists to prevent.
    problems.push({ source: 'todo', error: String((e && e.message) || e) });
  }

  // ①b WHAT WAS COMPLETED -- returned SEPARATELY, never mixed into the due list.
  //
  // 🔴 THE RECORD WAS ALWAYS BEING KEPT AND WAS NEVER ONCE SHOWN. Marking a to-do done sets
  // `done_at`; nothing has ever deleted one. But every read of this table filtered
  // `WHERE done_at IS NULL`, so a finished item disappeared from the only screen that lists them
  // and the record became unreachable. Measured 2026-08-26: 4 to-dos, 1 done and invisible.
  // Eric: "mark them as done but actually have a record of what was completed."
  //
  // ⛔ NOT MERGED INTO `out`. This page answers "what is outstanding"; finished work in that list
  // would be answering a different question in the same column.
  // ⚠️ CAPPED AND RECENT-FIRST. The record is for looking back at the last few weeks, not for
  // paging through a year, and an uncapped list here would grow without anybody choosing it.
  const doneRows = [];
  try {
    const r = await env.DB.prepare(
      "SELECT id, title, due_on, due_time, kind, owner, entity_label, note, done_at, done_note " +
      "FROM aby_task WHERE done_at IS NOT NULL ORDER BY done_at DESC LIMIT 60"
    ).all();
    for (const t of (r.results || [])) {
      doneRows.push({
        id: t.id,
        title: String(t.title || ''),
        entity: String(t.entity_label || ''),
        owner: String(t.owner || ''),
        taskKind: String(t.kind || 'todo'),
        dueOn: isoDay(t.due_on),
        dueTime: String(t.due_time || ''),
        doneAt: String(t.done_at || ''),
        doneNote: String(t.done_note || ''),
      });
    }
  } catch (e) {
    problems.push({ source: 'done', error: String((e && e.message) || e) });
  }

  // ② Quotes with a real effective date still ahead of them, still Pending. The employer's
  // coverage is meant to start that day, so it is the date the chase has to beat.
  try {
    const r = await env.DB.prepare(
      "SELECT quote_number, client_name, effective_date, broker_agency, broker_name " +
      "FROM quotes WHERE COALESCE(status,'P') = 'P' AND effective_date LIKE '____-__-__' " +
      "AND effective_date >= ? ORDER BY effective_date ASC"
    ).bind(today).all();
    for (const q of (r.results || [])) {
      // Re-checked in JavaScript rather than trusted from SQL: the LIKE matches the SHAPE, so
      // "2026-13-45" gets through it. isoDay is the one place that decides what a date is.
      const due = isoDay(q.effective_date);
      if (!due) continue;
      out.push({
        key: 'quote:' + q.quote_number,
        kind: 'quote',
        id: String(q.quote_number || ''),
        // 🔴 THIS SAID "Coverage starts on quote X" AND EVERY ROW HERE IS A *PENDING* QUOTE.
        // Eric, 2026-08-26: "this was just a quote from today that's still pending - it's not a
        // sale yet. So why are you making it sound like it's sold?"
        // ⛔ A DEFAULT RENDERED AS A FINDING. The query above filters COALESCE(status,'P') = 'P',
        // so the ONE thing every row on this line has in common is that NOBODY HAS BOUGHT IT. The
        // sentence asserted the opposite of the filter that selected it.
        // ⭐ The comment above this block had it right all along: the employer's coverage is
        // MEANT to start that day, "so it is the date the chase has to beat". That is a deadline
        // for ABY, not an event in the world, and the title now says so.
        // ⚠️ The date is deliberately not repeated in the words -- it is already the WHEN column.
        title: 'Still pending: quote ' + String(q.quote_number || '') + ' asks for coverage from this date',
        entity: String(q.client_name || ''),
        owner: '',
        note: String(q.broker_agency || q.broker_name || ''),
        dueOn: due,
        days: daysBetween(today, due),
      });
      counts.quote++;
    }
  } catch (e) {
    problems.push({ source: 'quote', error: String((e && e.message) || e) });
  }

  // ③ Follow-ups, ROLLED UP PER BROKER rather than per quote, because the action is one phone call.
  // Measured 2026-08-25: 121 pending quotes in the window, 45 people to ring. A per-quote list here
  // is the wall Eric complained about on the dashboard, in a place where it is cheap to avoid.
  //
  // THE DUE DATE IS THE NEWEST QUOTE PLUS THE WINDOW, NOT THE OLDEST. See the note above the two
  // constants: anchoring on the oldest makes a broker you are actively quoting look the most
  // neglected, and puts fourteen rows more than two months late on a screen somebody has to trust.
  try {
    const from = addDays(today, -FOLLOWUP_UNTIL_DAYS);
    const r = await env.DB.prepare(
      "SELECT LOWER(COALESCE(NULLIF(broker_email,''), NULLIF(broker_agency,''), '?')) AS k, " +
      "COUNT(*) AS n, MAX(created_at) AS newest, MIN(created_at) AS oldest, " +
      "MAX(COALESCE(NULLIF(broker_name,''), broker_agency)) AS who, " +
      "MAX(broker_agency) AS agency " +
      "FROM quotes WHERE COALESCE(status,'P') = 'P' AND created_at >= ? " +
      "GROUP BY k ORDER BY n DESC"
    ).bind(from).all();
    for (const g of (r.results || [])) {
      const newest = isoDay(g.newest);
      const oldest = isoDay(g.oldest);
      const due = newest ? addDays(newest, FOLLOWUP_AFTER_DAYS) : null;
      const n = Number(g.n || 0);
      const agency = String(g.agency || '').trim();
      // WHERE the quotes went, in the title, because that is the unit of the phone call. Eric:
      // "you could just say follow up on 7 quotes from a particular agency."
      const where = agency ? (' from ' + agency) : '';
      // WHEN they went out. One date if they all went the same day, otherwise both ends -- the
      // newest is why it is due now, the oldest is how long it has been going on.
      // ⛔ NOTHING ABOUT WHERE THE ROW CAME FROM. See the note above this function.
      const note = !newest ? ''
        : (oldest && oldest !== newest) ? ('run between ' + dayName(oldest) + ' and ' + dayName(newest))
        : ('run ' + dayName(newest));
      out.push({
        key: 'followup:' + String(g.k || ''),
        kind: 'followup',
        id: String(g.k || ''),
        title: n === 1 ? ('Follow up on 1 quote' + where)
                       : ('Follow up on ' + n + ' quotes' + where),
        entity: String(g.who || agency || g.k || ''),
        owner: '',
        note: note,
        dueOn: due,
        days: due ? daysBetween(today, due) : null,
        count: n,
      });
      counts.followup++;
    }
  } catch (e) {
    problems.push({ source: 'followup', error: String((e && e.message) || e) });
  }

  // ④ RFP deadlines. ZERO ROWS TODAY and that is expected -- the watch list is built and waiting on
  // Niels (F-385). It is wired now rather than later because the day those rows arrive they carry
  // HARD EXTERNAL DEADLINES, and a missed close date is an opportunity that cannot be recovered.
  // An empty source is REPORTED as empty on the page, never quietly omitted: a chip that vanishes
  // when its source is empty is indistinguishable from a chip that was never built.
  try {
    const r = await env.DB.prepare(
      "SELECT o.id, o.entity_name, o.title, o.closes_at, o.questions_due_at, o.pre_proposal_at, " +
      "o.pre_proposal_mandatory, COALESCE(d.disposition,'new') AS disposition " +
      "FROM rfp_opportunity o LEFT JOIN rfp_decision d ON d.opportunity_id = o.id"
    ).all();
    for (const o of (r.results || [])) {
      // A passed opportunity is not work. Everything else keeps its dates.
      if (String(o.disposition || '') === 'pass') continue;
      const slots = [
        ['closes', o.closes_at, 'Proposal due'],
        ['questions', o.questions_due_at, 'Questions due'],
        ['preproposal', o.pre_proposal_at,
          Number(o.pre_proposal_mandatory) === 1 ? 'Pre-proposal meeting (MANDATORY)' : 'Pre-proposal meeting'],
      ];
      for (const slot of slots) {
        const due = isoDay(slot[1]);
        if (!due) continue;
        out.push({
          key: 'rfp:' + o.id + ':' + slot[0],
          kind: 'rfp',
          id: String(o.id || ''),
          title: slot[2] + ' — ' + String(o.title || ''),
          entity: String(o.entity_name || ''),
          owner: '',
          note: '',
          dueOn: due,
          days: daysBetween(today, due),
        });
        counts.rfp++;
      }
    }
  } catch (e) {
    problems.push({ source: 'rfp', error: String((e && e.message) || e) });
  }

  // ⑤ A signed authorization with a start date. One row today, and it is the strongest buying
  // signal the system has, so it belongs on the screen even at one.
  try {
    const r = await env.DB.prepare(
      "SELECT id, quote_number, employer_name, start_date FROM commitments"
    ).all();
    for (const c of (r.results || [])) {
      const due = isoDay(c.start_date);
      if (!due) continue;
      out.push({
        key: 'commitment:' + c.id,
        kind: 'commitment',
        id: String(c.id || ''),
        title: 'Signed authorization starts — quote ' + String(c.quote_number || ''),
        entity: String(c.employer_name || ''),
        owner: '',
        note: '',
        dueOn: due,
        days: daysBetween(today, due),
      });
      counts.commitment++;
    }
  } catch (e) {
    problems.push({ source: 'commitment', error: String((e && e.message) || e) });
  }

  // Undated last, dated by date. A stable order matters: the page re-renders on every filter click,
  // and rows that reshuffle look like rows that changed.
  out.sort(function (a, b) {
    if (!a.dueOn && !b.dueOn) return a.title < b.title ? -1 : 1;
    if (!a.dueOn) return 1;
    if (!b.dueOn) return -1;
    if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
    return a.key < b.key ? -1 : 1;
  });

  // ⭐ `done` RIDES ALONGSIDE `rows`, NEVER INSIDE IT. This page answers what is outstanding;
  // finished work belongs in its own section, on its own tab, counted separately.
  return { today, rows: out, done: doneRows, counts, problems };
}

async function handleAbyDated(request, env) {
  const data = await abyDatedThings(env);
  return jsonResp(data);
}

/**
 * The owner vocabulary, in ONE place.
 *
 * '' , 'eric' and 'niels' -- the same three values assigned_rep and the pipeline filters already
 * use. Returns null for anything else, which the callers turn into a 400. A value spelled a fourth
 * way does not fail; it becomes a row that no filter can ever show again.
 */
function abyOwner(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === '' || s === 'eric' || s === 'niels') return s;
  return null;
}

/**
 * Add, edit, tick or delete one to-do.
 *
 * EVERY WRITE NAMES ITS OWN ROW. The dashboard's F-244 was a shared list stored as one JSON blob on
 * the agency record, so saving one task rewrote the lot and two people editing at once lost each
 * other's work. Two people share this admin; one row per to-do is what stops that repeating.
 */
/**
 * The four fields a to-do gained on 2026-08-26, validated in ONE place.
 *
 * ⛔ SHARED BY `add` AND `update` ON PURPOSE. Two copies of a validation rule is how a value the
 * form refuses on creation gets in through an edit -- and this admin has already been bitten by
 * one fix landing on one copy of a pattern.
 *
 * Returns { sets, vals } for splicing into an UPDATE, or { error } to refuse.
 */
function taskExtraSets(body) {
  const sets = [], vals = [];

  if (body.dueTime !== undefined) {
    const raw = String(body.dueTime || '').trim();
    // ⚠️ 24-HOUR HH:MM, WHICH IS WHAT <input type="time"> SENDS. Accepting "2pm" would mean
    // parsing it, and a time that parses wrongly on a calendar is worse than one that is refused.
    if (raw && !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(raw)) {
      return { error: 'That time is not HH:MM on a 24-hour clock.' };
    }
    sets.push('due_time = ?'); vals.push(raw || null);
  }

  if (body.kind !== undefined) {
    const k = String(body.kind || '').trim().toLowerCase();
    if (k && !['todo', 'meeting', 'call'].includes(k)) {
      return { error: 'A to-do is a todo, a meeting or a call.' };
    }
    sets.push('kind = ?'); vals.push(k || 'todo');
  }

  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    if (!Number.isFinite(n)) return { error: 'That order is not a number.' };
    sets.push('sort_order = ?'); vals.push(Math.round(n));
  }

  // The entity a to-do hangs off -- a quote, an RFP opportunity, an agency.
  // 🔴 THESE COLUMNS HAVE EXISTED SINCE THE TABLE WAS CREATED AND NOTHING HAS EVER WRITTEN ONE.
  // Measured 2026-08-26: 0 of 4 to-dos carry an entity. Eric asked for exactly this -- "generate
  // the to-do within the actual opportunity / quote" -- and the model was already waiting for it.
  if (body.entityType !== undefined) {
    const t = String(body.entityType || '').trim().toLowerCase();
    if (t && !['quote', 'rfp', 'agency', 'person', 'client'].includes(t)) {
      return { error: 'Unknown kind of thing to attach to.' };
    }
    sets.push('entity_type = ?'); vals.push(t || null);
    sets.push('entity_id = ?'); vals.push(String(body.entityId || '').slice(0, 80) || null);
    sets.push('entity_label = ?'); vals.push(String(body.entityLabel || '').slice(0, 200));
  }

  return { sets, vals };
}

async function handleAbyTask(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return jsonResp({ error: 'Invalid JSON' }, 400); }

  const action = String(body.action || 'add');
  const now = new Date().toISOString();

  if (action === 'add') {
    const title = String(body.title || '').trim();
    if (!title) return jsonResp({ error: 'A to-do needs some words.' }, 400);
    // A due date that is not a date is REFUSED, not stored. Storing prose in a date column is how
    // quotes.effective_date ended up with 1,581 rows that no query can compare.
    const dueRaw = String(body.dueOn || '').trim();
    const due = dueRaw ? isoDay(dueRaw) : null;
    if (dueRaw && !due) return jsonResp({ error: 'That due date is not a calendar date (YYYY-MM-DD).' }, 400);
    const owner = abyOwner(body.owner);
    if (owner === null) return jsonResp({ error: 'Owner must be eric, niels, or nobody.' }, 400);
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        "INSERT INTO aby_task (id, title, due_on, owner, entity_type, entity_id, entity_label, note, created_at, created_by, done_at) " +
        "VALUES (?,?,?,?,?,?,?,?,?,?,NULL)"
      ).bind(id, title, due, owner,
             String(body.entityType || '') || null, String(body.entityId || '') || null,
             String(body.entityLabel || ''), String(body.note || ''), now, String(body.createdBy || '')).run();
      // ⭐ WRITTEN AS A SECOND STATEMENT, not folded into the INSERT above. That INSERT names its
      // columns positionally and is read by other code; widening it to carry four optional fields
      // would put four NULLs on every row that does not use them and make the column list harder
      // to check than the thing it inserts.
      const extra = taskExtraSets(body);
      if (extra.error) return jsonResp({ error: extra.error }, 400);
      if (extra.sets.length) {
        await env.DB.prepare("UPDATE aby_task SET " + extra.sets.join(', ') + " WHERE id = ?")
          .bind(...extra.vals, id).run();
      }
    } catch (e) {
      return jsonResp({ error: 'Could not save it: ' + String((e && e.message) || e) }, 500);
    }
    return jsonResp({ ok: true, id });
  }

  const id = String(body.id || '').trim();
  if (!id) return jsonResp({ error: 'Which to-do?' }, 400);

  if (action === 'done' || action === 'undone') {
    try {
      // ⭐ THE NOTE IS WHAT MAKES THIS A RECORD RATHER THAN A TIMESTAMP. Eric asked to "mark them
      // as done but actually have a record of what was completed" -- and for a call or a meeting
      // the outcome is the whole reason anybody looks back at it.
      // ⛔ UNDOING CLEARS IT. A note saying what happened, sitting on a to-do that is open again,
      // is a claim about a thing that has been un-claimed.
      await env.DB.prepare("UPDATE aby_task SET done_at = ?, done_note = ? WHERE id = ?")
        .bind(action === 'done' ? now : null,
              action === 'done' ? String(body.doneNote || '').slice(0, 2000) : null, id).run();
    } catch (e) {
      return jsonResp({ error: String((e && e.message) || e) }, 500);
    }
    return jsonResp({ ok: true });
  }

  // Record the outcome on something already marked done, without reopening it.
  if (action === 'donenote') {
    try {
      const r = await env.DB.prepare(
        "UPDATE aby_task SET done_note = ? WHERE id = ? AND done_at IS NOT NULL")
        .bind(String(body.doneNote || '').slice(0, 2000), id).run();
      // ⛔ A WRITE THAT MATCHED NOTHING IS NOT A SUCCESS. Without this, adding an outcome to a
      // to-do that is not actually done reports "saved" and stores nothing.
      if (!r.meta || r.meta.changes === 0) {
        return jsonResp({ error: 'That to-do is not marked done.' }, 404);
      }
    } catch (e) {
      return jsonResp({ error: String((e && e.message) || e) }, 500);
    }
    return jsonResp({ ok: true });
  }

  if (action === 'delete') {
    try { await env.DB.prepare("DELETE FROM aby_task WHERE id = ?").bind(id).run(); }
    catch (e) { return jsonResp({ error: String((e && e.message) || e) }, 500); }
    return jsonResp({ ok: true });
  }

  if (action === 'update') {
    const sets = [], vals = [];
    // The four new fields, validated the same way on `add` and `update` so the two cannot drift.
    const extra = taskExtraSets(body);
    if (extra.error) return jsonResp({ error: extra.error }, 400);
    sets.push(...extra.sets); vals.push(...extra.vals);
    if (body.title !== undefined) {
      const t = String(body.title || '').trim();
      if (!t) return jsonResp({ error: 'A to-do needs some words.' }, 400);
      sets.push('title = ?'); vals.push(t);
    }
    if (body.dueOn !== undefined) {
      const raw = String(body.dueOn || '').trim();
      const d = raw ? isoDay(raw) : null;
      if (raw && !d) return jsonResp({ error: 'That due date is not a calendar date (YYYY-MM-DD).' }, 400);
      sets.push('due_on = ?'); vals.push(d);
    }
    if (body.owner !== undefined) {
      const o = abyOwner(body.owner);
      if (o === null) return jsonResp({ error: 'Owner must be eric, niels, or nobody.' }, 400);
      sets.push('owner = ?'); vals.push(o);
    }
    if (body.note !== undefined) { sets.push('note = ?'); vals.push(String(body.note || '')); }
    if (!sets.length) return jsonResp({ error: 'Nothing to change.' }, 400);
    vals.push(id);
    try { await env.DB.prepare("UPDATE aby_task SET " + sets.join(', ') + " WHERE id = ?").bind(...vals).run(); }
    catch (e) { return jsonResp({ error: String((e && e.message) || e) }, 500); }
    return jsonResp({ ok: true });
  }

  return jsonResp({ error: 'Unknown action.' }, 400);
}

/**
 * /admin/today -- the to-do list and calendar for the ABY admin (F-403).
 *
 * THE SHAPE IS THE BROKER DASHBOARD'S, THE CONTENT IS NOT. What travels from that build is the
 * arrangement: one list of dated things, two lenses over it, a chip per source, a permanent add
 * box, undated items with a home of their own, and a fold that says what is inside it. What does
 * NOT travel is any code -- that screen is Next.js on Supabase, this is a Worker on D1.
 *
 * THE ONE THING TO KNOW BEFORE CHANGING ANYTHING HERE: THIS LIST IS SHARED AND IT IS NOT "MINE".
 * The ABY admin is one shared password with no user identity, so the worker cannot tell Eric from
 * Niels. Every label on this page says so -- "Owner", never "My to-dos" -- and the owner is a value
 * somebody picks, not something the session knows. The dashboard shipped the other version of this
 * once (F-244) and it took two people's work with it.
 */
function adminTodayHTML() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Today &mdash; ABY admin</title>
<style> *{box-sizing:border-box} body{margin:0;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}
${ADMIN_HEADER_CSS}
 main{max-width:1120px;margin:22px auto;padding:0 18px}
 .card{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:20px;margin-bottom:18px}
 h2{font-size:16px;margin:0 0 4px} .sub{color:#5b6b7f;font-size:13px;margin:0 0 14px}
 .muted{color:#8a97a8}
 .addrow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 .addrow input[type=text]{flex:3;min-width:230px;padding:8px 10px;border:1px solid #c8d2de;border-radius:6px;font-size:14px}
 .addrow input[type=date]{padding:7px 9px;border:1px solid #c8d2de;border-radius:6px;font-size:14px}
 select{padding:6px 8px;border:1px solid #c8d2de;border-radius:6px;font-size:13px}
 button.go{background:#1a5c3a;color:#fff;border:0;font-weight:600;padding:8px 16px;border-radius:6px;cursor:pointer}
 button.go:hover{background:#237a4c}

 /* The lens and source chips. A chip that is ON is FILLED; a chip that is OFF is an outline.
    Stated because the dashboard shipped these inverted and the selected lens read as switched off
    -- on a control whose whole job is to say which view you are in. */
 .chips{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 16px}
 .chips .lbl{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5b6b7f;margin-right:2px}
 .chip{border:1px solid #c8d2de;background:#fff;color:#5b6b7f;border-radius:16px;padding:6px 14px;
       font-size:13px;font-weight:600;cursor:pointer}
 .chip:hover{border-color:#1a5c3a;color:#1a5c3a}
 .chip.on{background:#1a5c3a;border-color:#1a5c3a;color:#fff}
 .chip.on:hover{background:#237a4c;color:#fff}
 .chip .n{opacity:.75;font-weight:600;margin-left:5px}
 .chip.empty{opacity:.55}

 .sect{margin:0 0 14px}
 .sect h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin:0 0 6px;color:#5b6b7f}
 .sect.late h3{color:#a12622}
 .rows{border:1px solid #dfe5ec;border-radius:10px;background:#fff;overflow:hidden}
 .sect.late .rows{background:#fdf4f4;border-color:#f3c2c2}
 .row{display:flex;gap:12px;align-items:flex-start;padding:10px 14px;border-bottom:1px solid #eef2f6}
 .row:last-child{border-bottom:0}
 .row .when{flex:0 0 84px;font-weight:700;font-size:13.5px;color:#8a5a12}
 .row.od .when{color:#a12622}
 .row .what{flex:1;min-width:0}
 .row .who{flex:0 0 auto;color:#5b6b7f;font-size:13px;text-align:right;max-width:34%}
 .row .act{flex:0 0 auto;display:flex;gap:8px;align-items:center}
 /* ADDED 2026-08-26 with edit, times, kinds, ordering and the completed record. */
 /* The time sits under the day and is quieter than it, because the day is what you scan. */
 .when .attime{font-size:12px;color:#1a5c3a;font-weight:600;margin-top:2px}
 .t-mk{background:#efe9dd;color:#6b5a2a}
 .row .act .mv{text-decoration:none;color:#8a97a8;font-size:11px;line-height:1}
 .row .act .mv:hover{color:#1a5c3a}
 .row .act .ed{font-size:12.5px;color:#1a5c3a;text-decoration:none}
 .row .act .ed:hover{text-decoration:underline}
 /* The edit panel is a sibling of its row, not a child, so opening one cannot reflow the list. */
 .edit{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 14px 12px 14px;
       background:#f7f9fc;border-bottom:1px solid #eef2f6}
 .edit input[type=text]{flex:1;min-width:180px}
 .edit input,.edit select{padding:6px 9px;border:1px solid #c8d2de;border-radius:6px;font-size:13px}
 .done-row{background:#fbfcfd}
 .done-row .what{color:#5b6b7f}
 .outcome{display:flex;gap:7px;margin-top:6px}
 .outcome input{flex:1;padding:5px 9px;border:1px solid #dde4ec;border-radius:6px;font-size:12.5px}
 /* Names what a new to-do will be filed against. A hidden attachment is how a to-do lands on a
    record nobody meant to touch. */
 .attach{margin:0 0 14px;padding:9px 13px;background:#e8f4ec;border:1px solid #b8d9c4;
         border-radius:8px;font-size:13px;color:#1a5c3a}
 .attach a{margin-left:10px;color:#1a5c3a}
 .tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11.5px;font-weight:600;margin-left:8px}
 .t-todo{background:#e6eefb;color:#1c4587} .t-quote{background:#e8f4ec;color:#1a5c3a}
 .t-followup{background:#fdf1e0;color:#8a5a12} .t-rfp{background:#f0e8fb;color:#4b2d80}
 .t-commitment{background:#e8f4ec;color:#1a5c3a}
 .own{font-size:11.5px;color:#5b6b7f}
 a.del{color:#a12622;font-size:12.5px;text-decoration:none} a.del:hover{text-decoration:underline}
 .tick{width:16px;height:16px;cursor:pointer;margin-top:3px}

 /* A folded month names what is inside it. A fold that says only "March" is a fold that hides. */
 .mon{border:1px solid #dfe5ec;border-radius:10px;background:#fff;margin:0 0 12px;overflow:hidden}
 .mon > .head{display:flex;gap:10px;align-items:center;padding:10px 14px;background:#f7f9fb;
              border-bottom:1px solid #eef2f6;cursor:pointer;user-select:none}
 .mon > .head .nm{font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:700}
 .mon > .head .cnt{background:#e6eefb;color:#1c4587;border-radius:10px;padding:1px 8px;font-size:11.5px;font-weight:700}
 .mon > .head .inside{color:#5b6b7f;font-size:12.5px}
 .mon.haslate > .head{background:#fdf4f4} .mon.haslate > .head .nm{color:#a12622}
 .mon.haslate > .head .why{color:#a12622;font-size:12px;font-weight:600}
 .warn{background:#fdecec;color:#a12622;border:1px solid #f3c2c2;border-radius:8px;padding:10px 13px;margin:0 0 16px;font-size:13.5px}
 .msg{display:none;margin-top:10px;padding:10px 12px;border-radius:6px;font-size:13px}
</style></head><body>
${abyAdminNav('/admin/today')}
<main>
  <div id="warn" class="warn" style="display:none"></div>

  <div class="card">
    <h2>Add a to-do</h2>
    <p class="sub">Shared with everyone who logs into this admin, so say who it is for.
      A to-do with no date is fine &mdash; it gets its own list rather than a made-up day.</p>
    <div class="addrow">
      <input type="text" id="tTitle" placeholder="e.g. Send Brown &amp; Brown the revised COBRA rates">
      <!-- ⭐ KIND IS ASKED, NEVER INFERRED FROM THE WORDS. Reading "call Blumberg" as a call would
           be a guess printed on a calendar as a fact, and it is wrong on "call sheet", "recall
           notice", and every to-do about a call somebody else is making. -->
      <select id="tKind">
        <option value="todo">To-do</option>
        <option value="meeting">Meeting</option>
        <option value="call">Call</option>
      </select>
      <select id="tOwner"><option value="">Nobody in particular</option><option value="eric">Eric</option><option value="niels">Niels</option></select>
      <input type="date" id="tDue">
      <!-- Optional. A to-do has a day; a meeting has a moment, and that moment is what orders it. -->
      <input type="time" id="tTime" title="Time, for a meeting or a call">
      <button class="go" id="tAdd">Add</button>
    </div>
    <div class="msg" id="tMsg"></div>
  </div>

  <div class="chips">
    <span class="lbl">View</span>
    <button class="chip on" id="lensDue" data-lens="due">What&rsquo;s due</button>
    <button class="chip" id="lensMonth" data-lens="month">By month</button>
    <button class="chip" id="lensDone" data-lens="done">Done</button>
    <span class="lbl" style="margin-left:14px">Owner</span>
    <select id="fOwner"><option value="">Everyone</option><option value="eric">Eric</option><option value="niels">Niels</option><option value="none">Unassigned</option></select>
  </div>
  <div class="chips" id="srcChips"><span class="lbl">Show</span></div>

  <div id="attachBar" class="attach" style="display:none"></div>
  <div id="body"><p class="muted">Loading...</p></div>
</main>
<script>
 function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
 function logout(){ fetch('/api/admin/logout',{method:'POST'}).then(function(){ location.href='/admin'; }); }

 var MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
 var SRC=[{k:'todo',label:'To-dos',one:'to-do'},
          {k:'quote',label:'Quote effective dates',one:'quote effective date'},
          {k:'followup',label:'Follow-ups',one:'follow-up'},
          {k:'rfp',label:'RFP deadlines',one:'RFP deadline'},
          {k:'commitment',label:'Signed',one:'signed authorization'}];
 var LENS='due', OWNER='', OFF={}, DATA=null;

 // ── A TO-DO ABOUT A PARTICULAR THING (Eric, 2026-08-26) ─────────────────────────────────────
 // "Unless we can generate the to-do within the actual opportunity / quote and have it show up on
 // the calendar for a particular day/time."
 //
 // THE COLUMNS HAVE EXISTED SINCE THE TABLE DID AND NOTHING HAD EVER WRITTEN ONE. entity_type,
 // entity_id and entity_label were there from the start; measured 2026-08-26, 0 of 4 to-dos
 // carried an entity. The model was already waiting for this.
 //
 // Carried in the URL rather than in storage, so the link from a quote is the whole instruction
 // and can be sent, bookmarked or opened twice without a hidden state deciding what it means.
 var ATTACH={type:'',id:'',label:''};
 (function(){
   var q=new URLSearchParams(location.search||'');
   var t=(q.get('attach')||'').trim().toLowerCase();
   if(!t) return;
   ATTACH={type:t,id:(q.get('attachId')||'').trim(),label:(q.get('attachLabel')||'').trim()};
 })();

 function showAttach(){
   var bar=document.getElementById('attachBar');
   if(!bar) return;
   if(!ATTACH.type){ bar.style.display='none'; return; }
   bar.style.display='';
   // NAMES WHAT IT WILL BE FILED AGAINST, and offers a way out. A hidden attachment is how a
   // to-do ends up on a record nobody meant to touch.
   bar.innerHTML='This to-do will be filed against <strong>'+esc(ATTACH.label||ATTACH.id)+'</strong>'
     +' <a href="#" id="attachClear">use no attachment</a>';
   document.getElementById('attachClear').onclick=function(e){ e.preventDefault(); clearAttach(); };
 }
 function clearAttach(){ ATTACH={type:'',id:'',label:''}; showAttach(); }
 // The server's idea of today, carried on the payload so the page and the list agree about
 // which day it is. Read as a FACT by the fold guard below.
 var TODAY_STR='';

 function msg(el,t,good){el.textContent=t;el.style.display='block';el.style.background=good?'#e8f4ec':'#fdecec';el.style.color=good?'#1a5c3a':'#a12622'}

 // The visible set. Owner filters TO-DOS only: nothing else on this page has an owner, and
 // silently dropping every derived row when somebody picks a name would look like a broken filter.
 function visible(){
   if(!DATA) return [];
   return DATA.rows.filter(function(r){
     if(OFF[r.kind]) return false;
     if(OWNER==='') return true;
     if(r.kind!=='todo') return true;
     if(OWNER==='none') return !r.owner;
     return r.owner===OWNER;
   });
 }

 function dayLabel(iso){
   if(!iso) return '';
   var m=Number(iso.slice(5,7)), d=Number(iso.slice(8,10));
   return MON[m-1].slice(0,3)+' '+d;
 }
 function ownerLabel(o){ return o==='eric'?'Eric':(o==='niels'?'Niels':'unassigned'); }

 // What a to-do IS -- a plain to-do, a meeting or a call. Only ever what somebody chose.
 var TKIND={meeting:{label:'Meeting',mark:'\\u25c9'},call:{label:'Call',mark:'\\u260e'}};

 function rowHTML(r){
   var od = (r.days!==null && r.days<0);
   var h='<div class="row'+(od?' od':'')+'" data-row="'+esc(r.id||'')+'">';
   // ⭐ THE TIME SITS UNDER THE DAY, not inside the title. It belongs to WHEN, and putting it in
   // the text would make it unsortable by eye down a column of days.
   h+='<div class="when">'+(r.dueOn?esc(dayLabel(r.dueOn)):'<span class="muted">no date</span>')
     +(r.dueTime?'<div class="attime">'+esc(hhmm(r.dueTime))+'</div>':'')+'</div>';
   h+='<div class="what">'+esc(r.title)+'<span class="tag t-'+esc(r.kind)+'">'+esc(kindLabel(r.kind))+'</span>';
   var tk=TKIND[r.taskKind];
   if(tk) h+='<span class="tag t-mk">'+tk.mark+' '+esc(tk.label)+'</span>';
   if(r.kind==='todo') h+='<div class="own">'+esc(ownerLabel(r.owner))+(r.note?' \\u00b7 '+esc(r.note):'')+'</div>';
   else if(r.note) h+='<div class="own">'+esc(r.note)+'</div>';
   h+='</div>';
   h+='<div class="who">'+esc(r.entity||'')+'</div>';
   h+='<div class="act">';
   if(r.kind==='todo'){
     // ⭐ MOVE UP AND DOWN ONLY WHERE THERE IS NO TIME. Two meetings at 9:00 and 14:00 already
     // have an order, and a hand-set number that disagreed with the clock would be a second
     // source of truth about the same thing. These decide the rows a clock cannot.
     if(!r.dueTime){
       h+='<a href="#" class="mv" data-mv="up" data-id="'+esc(r.id)+'" title="Move up">\\u25b2</a>';
       h+='<a href="#" class="mv" data-mv="down" data-id="'+esc(r.id)+'" title="Move down">\\u25bc</a>';
     }
     h+='<a href="#" class="ed" data-edit="'+esc(r.id)+'">Edit</a>';
     h+='<input class="tick" type="checkbox" data-done="'+esc(r.id)+'" title="Mark it done">';
     h+='<a href="#" class="del" data-del="'+esc(r.id)+'">Delete</a>';
   }
   h+='</div></div>';
   // The edit panel ships with the row and starts hidden, so opening one is not a fetch.
   if(r.kind==='todo') h+=editHTML(r);
   return h;
 }

 // 12-hour, because this is a calendar a person reads. The STORED value stays 24-hour HH:MM.
 function hhmm(t){
   var p=String(t||'').split(':'); if(p.length!==2) return t||'';
   var H=Number(p[0]); if(!Number.isFinite(H)) return t;
   var ap=H<12?'am':'pm', h=H%12; if(h===0) h=12;
   return h+':'+p[1]+ap;
 }

 // ⭐ EDITING WAS ALREADY BUILT AND HAD NO DOOR. The update action has accepted title, due date,
 // owner and note since the table existed; nothing on any screen ever called it. Same shape as
 // F-382 -- a feature that is correct, deployed and unreachable.
 function editHTML(r){
   var i=esc(r.id);
   return '<div class="edit" id="ed_'+i+'" style="display:none">'
     +'<input type="text" id="e_t_'+i+'" value="'+esc(r.title)+'" placeholder="What needs doing">'
     +'<select id="e_k_'+i+'">'
       +'<option value="todo"'+(r.taskKind==='todo'?' selected':'')+'>To-do</option>'
       +'<option value="meeting"'+(r.taskKind==='meeting'?' selected':'')+'>Meeting</option>'
       +'<option value="call"'+(r.taskKind==='call'?' selected':'')+'>Call</option>'
     +'</select>'
     +'<select id="e_o_'+i+'">'
       +'<option value=""'+(!r.owner?' selected':'')+'>Nobody in particular</option>'
       +'<option value="eric"'+(r.owner==='eric'?' selected':'')+'>Eric</option>'
       +'<option value="niels"'+(r.owner==='niels'?' selected':'')+'>Niels</option>'
     +'</select>'
     +'<input type="date" id="e_d_'+i+'" value="'+esc(r.dueOn||'')+'">'
     +'<input type="time" id="e_m_'+i+'" value="'+esc(r.dueTime||'')+'">'
     +'<input type="text" id="e_n_'+i+'" value="'+esc(r.note||'')+'" placeholder="Note (optional)">'
     +'<button class="go" data-save="'+i+'">Save</button>'
     +'<a href="#" class="del" data-cancel="'+i+'">Cancel</a>'
     +'</div>';
 }

 // ── WHAT WAS COMPLETED ──────────────────────────────────────────────────────────────────────
 // 🔴 THE RECORD WAS ALWAYS THERE AND WAS NEVER SHOWN. Marking a to-do done has always set
 // done_at and never deleted anything -- but every read filtered on done_at IS NULL, so a
 // finished item left the only screen that lists them. Eric asked for exactly this.
 function doneHTML(r){
   var i=esc(r.id);
   var tk=TKIND[r.taskKind];
   return '<div class="row done-row">'
     +'<div class="when">'+esc(dayLabel(String(r.doneAt||'').slice(0,10)))+'</div>'
     +'<div class="what">'+esc(r.title)
       +(tk?'<span class="tag t-mk">'+tk.mark+' '+esc(tk.label)+'</span>':'')
       +'<div class="own">'+esc(ownerLabel(r.owner))
         +(r.dueOn?' \\u00b7 was due '+esc(dayLabel(r.dueOn)):'')+'</div>'
       // The OUTCOME, and it is editable after the fact: what happened on a call is often known
       // a minute after the box was ticked.
       +'<div class="outcome"><input type="text" id="dn_'+i+'" value="'+esc(r.doneNote||'')
         +'" placeholder="What happened? (optional)">'
         +'<button class="go" data-donenote="'+i+'">Save</button></div>'
     +'</div>'
     +'<div class="who">'+esc(r.entity||'')+'</div>'
     +'<div class="act"><a href="#" class="ed" data-undone="'+i+'">Reopen</a></div>'
     +'</div>';
 }
 function kindLabel(k){
   for(var i=0;i<SRC.length;i++) if(SRC[i].k===k) return SRC[i].label;
   return k;
 }
 // What a fold says it is hiding, counted. "1 to-dos" is the kind of sentence that makes a screen
 // look unfinished, and a folded month holding exactly one thing is the ordinary case here.
 function kindCount(k,n){
   for(var i=0;i<SRC.length;i++) if(SRC[i].k===k) return n+' '+(n===1?SRC[i].one:SRC[i].label.toLowerCase());
   return n+' '+k;
 }
 function sect(title,rows,late){
   if(!rows.length) return '';
   return '<div class="sect'+(late?' late':'')+'"><h3>'+esc(title)+' &middot; '+rows.length+'</h3>'+
          '<div class="rows">'+rows.map(rowHTML).join('')+'</div></div>';
 }

 // ── LENS ONE: what is due ────────────────────────────────────────────────────────────────────
 // Overdue, this week, the next 90 days, then everything with no date at all. Anything further
 // out is COUNTED AND NAMED rather than silently cut, so the list never stops without saying so.
 function renderDue(rows){
   // YOUR OWN TO-DOS FIRST, IN THEIR OWN BLOCK, AND THIS IS NOT A PREFERENCE.
   // Eric: "Why don't the tasks that we add show up on the list for today? They just disappear."
   // They did not disappear. Rendering this page over a production-shaped list put a to-do due
   // tomorrow BELOW FORTY-EIGHT follow-up rows. The add box is at the top of the screen; what you
   // type into it cannot come out at the bottom.
   // ⛔ They appear here and NOWHERE ELSE below -- a row in two sections is a tick that looks like
   // it did not work.
   var mine=[], rest=[];
   rows.forEach(function(r){ (r.kind==='todo'?mine:rest).push(r) });
   mine.sort(function(a,b){
     if(a.dueOn&&b.dueOn) return a.dueOn<b.dueOn?-1:1;
     if(a.dueOn) return -1;
     if(b.dueOn) return 1;
     return 0;
   });
   var od=[],wk=[],soon=[],far=[],un=[];
   rest.forEach(function(r){
     if(r.days===null){un.push(r);return}
     if(r.days<0) od.push(r);
     else if(r.days<=7) wk.push(r);
     else if(r.days<=90) soon.push(r);
     else far.push(r);
   });
   var h='';
   // NOT tinted as a whole even when one is late -- a late row already shows its own date in
   // red, and washing the entire block pink makes five things you are on top of look urgent.
   h+=sect('Your to-dos',mine);
   h+=sect('Overdue',od,true);
   h+=sect('This week',wk);
   h+=sect('Next 90 days',soon);
   h+=sect('No date yet',un);
   if(far.length) h+='<p class="muted" style="margin:4px 2px 18px">'+far.length+
     (far.length===1?' more thing is':' more things are')+' further than 90 days out.</p>';
   if(!mine.length&&!od.length&&!wk.length&&!soon.length&&!un.length&&!far.length)
     h+='<div class="card"><p class="muted" style="margin:0">Nothing is due. Add a to-do above.</p></div>';
   return h;
 }

 // ── LENS TWO: by month ───────────────────────────────────────────────────────────────────────
 // The grid rotates from this month. Months more than three out are FOLDED -- three months is the
 // same 90-day horizon the other lens uses, so the two agree about what "near" means instead of
 // each inventing one.
 //
 // AND A FOLDED MONTH IS FORCE-OPENED IF IT HOLDS ANYTHING LATE. On this page every one-off date
 // that has passed is lifted into the Late block above the grid, so a folded month "cannot" hold a
 // late row -- and that argument is exactly what the same guard on the dashboard disproved on its
 // first run against real data, where it fired for three months. The proof costs a paragraph and
 // can be wrong; the guard costs a clause and cannot hide anything.
 function renderMonth(rows){
   var late=[],un=[],byMon={};
   rows.forEach(function(r){
     if(r.days===null){un.push(r);return}
     if(r.days<0){late.push(r);return}
     var key=r.dueOn.slice(0,7);
     (byMon[key]=byMon[key]||[]).push(r);
   });
   var h='';
   if(late.length) h+='<div class="sect late"><h3>Late &middot; dates that have passed &middot; '+late.length+'</h3>'+
                      '<div class="rows">'+late.map(rowHTML).join('')+'</div></div>';
   var keys=Object.keys(byMon).sort();
   keys.forEach(function(k,i){
     var rs=byMon[k];
     // Asks the DATE, not the arithmetic. A row whose dueOn has passed while its days is
     // still positive -- a stale payload, a page left open overnight -- is exactly the row a
     // fold would hide, and the only one the days test cannot see.
     var hasLate=rs.some(function(r){
       if(r.days!==null&&r.days<0) return true;
       return !!(TODAY_STR&&r.dueOn&&r.dueOn<TODAY_STR);
     });
     var open = OPEN[k]!==undefined ? OPEN[k] : (i<3 || hasLate);
     var nm=MON[Number(k.slice(5,7))-1]+' '+k.slice(0,4);
     var kinds={};
     rs.forEach(function(r){kinds[r.kind]=(kinds[r.kind]||0)+1});
     var inside=Object.keys(kinds).map(function(x){return kindCount(x,kinds[x])}).join(' \\u00b7 ');
     h+='<div class="mon'+(hasLate?' haslate':'')+'"><div class="head" data-mon="'+esc(k)+'">'+
        '<span class="nm">'+esc(nm)+'</span><span class="cnt">'+rs.length+'</span>'+
        (open?'':'<span class="inside">'+esc(inside)+'</span>')+
        (hasLate?'<span class="why">still open from earlier</span>':'')+
        '<span class="muted" style="margin-left:auto;font-size:12px">'+(open?'hide':'show')+'</span></div>'+
        (open?'<div class="rows">'+rs.map(rowHTML).join('')+'</div>':'')+'</div>';
   });
   if(un.length) h+=sect('No date yet',un);
   if(!keys.length&&!late.length&&!un.length)
     h+='<div class="card"><p class="muted" style="margin:0">Nothing dated. Add a to-do above.</p></div>';
   return h;
 }
 var OPEN={};

 function renderChips(){
   var el=document.getElementById('srcChips');
   var html='<span class="lbl">Show</span>';
   SRC.forEach(function(s){
     var n=DATA?(DATA.counts[s.k]||0):0;
     // An EMPTY source still shows its chip, dimmed, with a zero on it. A chip that disappears
     // when its source is empty cannot be told apart from a chip that was never built -- and one
     // of these sources (RFP) is genuinely empty today and will not stay that way.
     html+='<button class="chip'+(OFF[s.k]?'':' on')+(n?'':' empty')+'" data-src="'+s.k+'">'+
           esc(s.label)+'<span class="n">'+n+'</span></button>';
   });
   el.innerHTML=html;
   Array.prototype.forEach.call(el.querySelectorAll('[data-src]'),function(b){
     b.onclick=function(){ var k=b.getAttribute('data-src'); OFF[k]=!OFF[k]; renderChips(); render(); };
   });
 }

 function render(){
   var rows=visible();
   var html;
   if(LENS==='done') html=renderDone();
   else if(LENS==='month') html=renderMonth(rows);
   else html=renderDue(rows);
   document.getElementById('body').innerHTML = html;
   wire();
 }

 // WHAT WAS COMPLETED. Its own lens, never mixed into the due list: this page answers what is
 // outstanding, and finished work in that column answers a different question.
 function renderDone(){
   var d=(DATA && DATA.done) || [];
   // OWNER FILTERS THIS TOO, so switching to Eric does not silently show Niels's finished work.
   if(OWNER) d=d.filter(function(r){ return (r.owner||'')===OWNER; });
   if(!d.length){
     return '<p class="muted">Nothing has been ticked off yet'
       + (OWNER?' by '+esc(ownerLabel(OWNER)):'')
       + '. When a to-do is marked done it stays here, with what happened.</p>';
   }
   var h='<div class="sec"><h3>Completed <span class="n">'+d.length+'</span></h3><div class="rows">';
   for(var i=0;i<d.length;i++) h+=doneHTML(d[i]);
   return h+'</div></div>';
 }

 function wire(){
   Array.prototype.forEach.call(document.querySelectorAll('[data-done]'),function(c){
     c.onchange=function(){ task({action:'done',id:c.getAttribute('data-done')}); };
   });
   Array.prototype.forEach.call(document.querySelectorAll('[data-del]'),function(a){
     a.onclick=function(e){ e.preventDefault(); task({action:'delete',id:a.getAttribute('data-del')}); };
   });
   // EDIT: the panel is already in the page, so opening one is not a fetch.
   Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'),function(a){
     a.onclick=function(e){ e.preventDefault();
       var p=document.getElementById('ed_'+a.getAttribute('data-edit'));
       if(p) p.style.display = (p.style.display==='none') ? 'flex' : 'none';
     };
   });
   Array.prototype.forEach.call(document.querySelectorAll('[data-cancel]'),function(a){
     a.onclick=function(e){ e.preventDefault();
       var p=document.getElementById('ed_'+a.getAttribute('data-cancel'));
       if(p) p.style.display='none';
     };
   });
   Array.prototype.forEach.call(document.querySelectorAll('[data-save]'),function(b){
     b.onclick=function(){
       var i=b.getAttribute('data-save');
       task({action:'update',id:i,
             title:document.getElementById('e_t_'+i).value,
             kind:document.getElementById('e_k_'+i).value,
             owner:document.getElementById('e_o_'+i).value,
             dueOn:document.getElementById('e_d_'+i).value,
             dueTime:document.getElementById('e_m_'+i).value,
             note:document.getElementById('e_n_'+i).value});
     };
   });
   // MOVE. Only rendered on rows with no time; see the note in rowHTML.
   Array.prototype.forEach.call(document.querySelectorAll('[data-mv]'),function(a){
     a.onclick=function(e){ e.preventDefault(); move(a.getAttribute('data-id'), a.getAttribute('data-mv')); };
   });
   // DONE list: record an outcome, or reopen.
   Array.prototype.forEach.call(document.querySelectorAll('[data-donenote]'),function(b){
     b.onclick=function(){
       var i=b.getAttribute('data-donenote');
       task({action:'donenote',id:i,doneNote:document.getElementById('dn_'+i).value});
     };
   });
   Array.prototype.forEach.call(document.querySelectorAll('[data-undone]'),function(a){
     a.onclick=function(e){ e.preventDefault(); task({action:'undone',id:a.getAttribute('data-undone')}); };
   });
   Array.prototype.forEach.call(document.querySelectorAll('[data-mon]'),function(hd){
     hd.onclick=function(){
       var k=hd.getAttribute('data-mon');
       var cur = OPEN[k]!==undefined ? OPEN[k] : null;
       // First click flips whatever it currently shows, which is why the current state is read off
       // the rendered element rather than assumed to be closed.
       OPEN[k] = cur===null ? !hd.parentNode.querySelector('.rows') : !cur;
       render();
     };
   });
 }

 /**
  * Move an untimed to-do up or down among the untimed to-dos of the SAME DAY.
  *
  * SWAPS TWO NEIGHBOURS RATHER THAN RENUMBERING THE LIST. Rewriting every row's order on every
  * click is more writes, and it invents an order for rows nobody has ever arranged -- which then
  * looks deliberate to the next reader.
  * NEIGHBOURS ARE FOUND ON THE SAME DAY ONLY. Moving a row past a date boundary would silently
  * change WHEN it is due, which is a different edit from the one the arrow promises.
  */
 function move(id, dir){
   if(!DATA || !DATA.rows) return;
   var me=null;
   for(var i=0;i<DATA.rows.length;i++) if(DATA.rows[i].kind==='todo' && DATA.rows[i].id===id) me=DATA.rows[i];
   if(!me) return;
   var peers=DATA.rows.filter(function(r){
     return r.kind==='todo' && !r.dueTime && (r.dueOn||'')===(me.dueOn||'');
   });
   var at=peers.indexOf(me);
   var to=at+(dir==='up'?-1:1);
   if(at<0 || to<0 || to>=peers.length) return;      // already at the end: nothing to swap with
   var other=peers[to];
   // ORDER IS ASSIGNED FROM THE CURRENT POSITIONS, so a list that has never been arranged gets a
   // sensible sequence the first time somebody touches it rather than a pair of zeros.
   var mine = (me.sortOrder==null) ? at : me.sortOrder;
   var theirs = (other.sortOrder==null) ? to : other.sortOrder;
   if(mine===theirs){ mine=at; theirs=to; }
   task({action:'update',id:me.id,sortOrder:theirs});
   task({action:'update',id:other.id,sortOrder:mine});
 }

 async function task(payload){
   var r=await fetch('/api/admin/task',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify(payload)});
   var d=await r.json().catch(function(){return{}});
   if(!r.ok){ document.getElementById('warn').style.display='block';
              document.getElementById('warn').textContent=d.error||'That did not save.'; return; }
   document.getElementById('warn').style.display='none';
   load();
 }

 document.getElementById('tAdd').onclick=function(){
   var t=document.getElementById('tTitle').value.trim();
   if(!t){ msg(document.getElementById('tMsg'),'Type the to-do first.',false); return; }
   fetch('/api/admin/task',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({action:'add',title:t,owner:document.getElementById('tOwner').value,
                          dueOn:document.getElementById('tDue').value,
                          dueTime:document.getElementById('tTime').value,
                          kind:document.getElementById('tKind').value,
                          // ⭐ A to-do created from a quote or an opportunity arrives with the
                          // thing it is about already attached (?attach= on this page's URL).
                          entityType:ATTACH.type, entityId:ATTACH.id, entityLabel:ATTACH.label})})
   .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})})
   .then(function(x){
     msg(document.getElementById('tMsg'), x.ok?'Added.':(x.d.error||'Could not save it.'), x.ok);
     if(x.ok){ document.getElementById('tTitle').value=''; document.getElementById('tDue').value='';
               document.getElementById('tTime').value='';
               // ⛔ THE ATTACHMENT IS CLEARED AFTER ONE USE. Left set, the next unrelated to-do
               // somebody types would silently be filed against a quote they were not thinking
               // about, and nothing on screen would say so.
               clearAttach();
               load(); }
   });
 };
 document.getElementById('lensDue').onclick=function(){ setLens('due') };
 document.getElementById('lensMonth').onclick=function(){ setLens('month') };
 document.getElementById('lensDone').onclick=function(){ setLens('done') };
 function setLens(l){
   LENS=l;
   document.getElementById('lensDue').className='chip'+(l==='due'?' on':'');
   document.getElementById('lensMonth').className='chip'+(l==='month'?' on':'');
   document.getElementById('lensDone').className='chip'+(l==='done'?' on':'');
   // The URL carries the lens, so a link to the month view can be bookmarked and shared.
   try{ history.replaceState(null,'', l==='month'?'/admin/today?view=calendar':'/admin/today'); }catch(e){}
   render();
 }
 document.getElementById('fOwner').onchange=function(){ OWNER=this.value; render(); };

 async function load(){
   var r=await fetch('/api/admin/dated');
   if(!r.ok){ document.getElementById('body').innerHTML='<div class="warn">Could not load the list.</div>'; return; }
   DATA=await r.json();
   TODAY_STR=DATA.today||'';
   // A source that FAILED is named on screen. It would otherwise render as a shorter list, which
   // is indistinguishable from a quiet week -- the one failure this page must not have.
   if(DATA.problems&&DATA.problems.length){
     var w=document.getElementById('warn');
     w.style.display='block';
     w.textContent='Some of this list could not be read, so it is INCOMPLETE: '+
       DATA.problems.map(function(p){return p.source+' ('+p.error+')'}).join('; ');
   }
   renderChips(); showAttach(); render();
 }
 if(location.search.indexOf('view=calendar')!==-1) setLens('month');
 load();
</script>
</body></html>`;
}

const ABY_ADMIN_LINKS = [
  { href: '/aby',              label: 'Run a quote',          cls: 'act',
    title: 'Run a quote as ABY, with the internal price adjustments' },
  { href: '/admin',            label: 'Quote log' },
  // Second, and deliberately not last: it is the screen you open to find out what today holds, so
  // burying it behind the reference pages would make it the page nobody starts on.
  { href: '/admin/today',      label: 'Today' },
  // Sits next to the quote log because the two answer adjacent questions -- who we quoted, and
  // who we actually serve -- and the whole point of F-377 is that those are not the same list.
  { href: '/admin/clients',    label: 'Clients' },
  { href: '/admin/brokers',    label: 'Brokers &amp; Agencies' },
  // Public entities buying direct: a different CHANNEL from Brokers & Agencies, which is the
  // firms ABY quotes THROUGH. The two lists never merge.
  // ⚠️ This used to say "next to Pipeline because both answer what should we chase". Pipeline was
  // retired on 2026-08-26 and the sentence would have gone on explaining a neighbour that no
  // longer exists -- a comment describing a deleted thing reads as a description of the code.
  { href: '/admin/rfp-watch',  label: 'RFP Watch' },
  { href: '/admin/referrals',  label: 'Referrals' },
  { href: '/admin/rates',      label: 'Rates' },
  // Last on purpose: it is a reference, not a place work happens. ⛔ It is behind withAuth like
  // every other admin page -- the guide names how ABY decides who to chase, which is not
  // something a broker should read about themselves.
  { href: '/admin/guide',      label: 'Guide' },
];

/** The header bar. `here` is the path of the page being rendered, so it marks itself. */
/**
 * The admin guide -- what the tool does, in plain English, for Eric and Niels.
 *
 * The BODY is generated from docs/admin-guide.md. Only the page shell lives here, so editing the
 * guide means editing the markdown and re-running scripts/build_guide.mjs.
 *
 * Reading width is capped near 46em on purpose: this is the one admin page somebody READS rather
 * than scans, and a full-width line of prose across a 1400px monitor is close to unreadable.
 * Tables are allowed to break out of that width, because several of them are genuinely wide.
 */
function adminGuideHTML() {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Guide &mdash; ABY admin</title><style>' +
    '*{box-sizing:border-box} body{margin:0;font:16px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;background:#f4f6f9;color:#12263f}' +
    ADMIN_HEADER_CSS +
    'main{max-width:56em;margin:26px auto 80px;padding:0 22px}' +
    '.doc{background:#fff;border:1px solid #dfe5ec;border-radius:10px;padding:34px 40px}' +
    '.doc>*{max-width:46em}' +
    'h1{font-size:27px;line-height:1.25;margin:0 0 6px}' +
    'h2{font-size:20px;margin:38px 0 10px;padding-top:20px;border-top:1px solid #eef2f6}' +
    'h2:first-of-type{border-top:0;padding-top:0}' +
    'h3{font-size:16.5px;margin:26px 0 8px;color:#1a5c3a}' +
    'p{margin:0 0 13px} li{margin:0 0 7px} ul,ol{margin:0 0 15px;padding-left:22px}' +
    'hr{border:0;border-top:1px solid #eef2f6;margin:34px 0}' +
    'code{background:#eef2f7;border-radius:4px;padding:1px 5px;font-size:13.5px;font-family:ui-monospace,Consolas,monospace}' +
    'blockquote{margin:0 0 20px;padding:15px 20px;background:#f7f9fc;border-left:4px solid #1a5c3a;border-radius:0 8px 8px 0}' +
    'blockquote>*:last-child{margin-bottom:0}' +
    'blockquote h2,blockquote h3{border:0;padding-top:0;margin-top:14px}' +
    '.tw{max-width:none;overflow-x:auto;margin:0 0 20px}' +
    'table{border-collapse:collapse;font-size:14.5px;width:100%}' +
    'th{text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:#5b6b7f;border-bottom:2px solid #dfe5ec;padding:9px 12px 7px}' +
    'td{padding:9px 12px;border-bottom:1px solid #eef2f6;vertical-align:top}' +
    'tr:last-child td{border-bottom:0}' +
    'del{color:#8a97a8}' +
    '</style></head><body>' +
    abyAdminNav('/admin/guide') +
    '<main><div class="doc">' + ADMIN_GUIDE_HTML + '</div></main>' +
    '<script>function logout(){fetch("/api/admin/logout",{method:"POST"}).then(function(){location.href="/admin"})}</script>' +
    '</body></html>';
}

function abyAdminNav(here) {
  const links = ABY_ADMIN_LINKS.map((l) => {
    // The current page wins over the accent style: on /aby, "Run a quote" is where you ARE, not a
    // call to action, and leaving it green would make the bar look like it linked somewhere else.
    const cls = (l.href === here) ? 'here' : (l.cls || '');
    return '<a href="' + l.href + '"' + (cls ? ' class="' + cls + '"' : '') +
           (l.title ? ' title="' + l.title + '"' : '') + '>' + l.label + '</a>';
  }).join('');
  return '<header class="aby-adminbar"><h1>ABY admin</h1><nav>' + links + '</nav>' +
         '<button class="logout" onclick="logout()">Log out</button></header>';
}

async function serveAbyTool(request, env) {
  const url = new URL(request.url);
  // Fetch the root ('/'), not '/index.html': the asset handler redirects
  // '/index.html' -> '/' with an empty body, which would strip the app scripts.
  const res = await env.ASSETS.fetch(new Request(new URL('/', url), request));
  let html = await res.text();
  // ⭐ THE ADMIN NAV, ON THE TOOL ITSELF (Eric, 2026-08-21): "On the page where ABY runs quotes
  // /aby is it possible to add the same header navigation that the other admin panels have?"
  // /aby was the one authenticated screen with no way back to the rest of the admin, so getting
  // from a quote to the quote log meant typing the URL. The same defect the quote log itself had
  // on 2026-08-19, one page over.
  // 🔴 THE CSS IS CLASS-SCOPED, NOT ELEMENT-SCOPED, AND THAT IS THE CARE THIS NEEDED. The admin
  // pages style a bare header selector; this page is the PUBLIC QUOTE TOOL, with its own
  // stylesheet and its own header. A bare header rule injected here would restyle the tool's own
  // chrome for ABY users only, and nobody would connect that back to a nav bar.
  const navCss =
    '<style>' +
    '.aby-adminbar{background:#1a5c3a;color:#fff;padding:10px 20px;display:flex;align-items:center;' +
      'gap:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
    '.aby-adminbar h1{font-size:1.05rem;font-weight:700;margin:0;flex:0 0 auto;color:#fff}' +
    '.aby-adminbar nav{flex:1;display:flex;flex-wrap:wrap;gap:2px;margin-left:6px}' +
    '.aby-adminbar nav a{color:rgba(255,255,255,.78);text-decoration:none;font-size:.85rem;' +
      'font-weight:600;padding:5px 10px;border-radius:5px;white-space:nowrap}' +
    '.aby-adminbar nav a:hover{background:rgba(255,255,255,.15);color:#fff}' +
    '.aby-adminbar nav a.here{background:rgba(255,255,255,.2);color:#fff}' +
    '.aby-adminbar nav a.act{background:#2f9e73;color:#fff;font-weight:700}' +
    '.aby-adminbar .logout{color:rgba(255,255,255,.75);font-size:.875rem;cursor:pointer;' +
      'background:none;border:none;padding:4px 8px;border-radius:4px}' +
    '.aby-adminbar .logout:hover{background:rgba(255,255,255,.15);color:#fff}' +
    '@media print{.aby-adminbar{display:none}}' +
    '</style>';
  // ⛔ HIDDEN WHEN PRINTING. The output of this page gets handed to an employer; an internal
  // navigation bar must not turn up on a proposal.
  const logoutFn = '<script>function logout(){fetch("/api/admin/logout").then(function(){location.href="/admin";});}</script>';
  if (html.includes('</head>')) html = html.replace('</head>', navCss + '</head>');
  html = html.includes('<body>')
    ? html.replace('<body>', '<body>' + abyAdminNav('/aby'))
    : (abyAdminNav('/aby') + html);

  const inject = logoutFn + '<script>window.ABY_INTERNAL=true;</script>\n<script src="/internal/aby.js"></script>\n</body>';
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

  // The stored join key between a quote and a client. See the note at the INSERT in
  // handleQuoteSave: it exists so the two can be joined in SQL rather than in JavaScript, and it
  // is maintained by all three write paths that can change `client_name`.
  { sql: "ALTER TABLE quotes ADD COLUMN client_match_key TEXT",
    table: "quotes", column: "client_match_key" },
  { sql: "CREATE INDEX IF NOT EXISTS quotes_client_match_key ON quotes (client_match_key)",
    index: "quotes_client_match_key" },

  // Termination date for a client whose folder name carried one. Sibling of `effective_date`;
  // 47 of the 977 termed folders name a date.
  { sql: "ALTER TABLE aby_clients ADD COLUMN term_date TEXT",
    table: "aby_clients", column: "term_date" },
  // Added 2026-08-06. `client_id` is the BenefitLab client this quote is for, so a quote
  // no longer has to be matched to an employer by a TYPED company name (F-268).
  { sql: "ALTER TABLE quotes ADD COLUMN client_id TEXT",        table: "quotes", column: "client_id" },
  // `direct` = ABY worked straight with the employer on this quote. Added 2026-08-21 so a blank
  // broker stops reading as missing data. See handleQuoteEdit for why it is stored, not inferred.
  { sql: "ALTER TABLE quotes ADD COLUMN direct INTEGER",       table: "quotes", column: "direct" },
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

  // ── Parent agencies, acquisitions and divisions (Eric, 2026-08-22) ──────────────────────────
  //
  // "When an agency is acquired, I think we should have their quotes under the other agency in a
  // drop down. For instance, MMA would have the MMA and MHBT quote count combined in the big view
  // ... Because 9 years after they've stopped using the name, we don't need to see MHBT on a
  // dormant list, even if grayed out. MHBT is no longer doing business as MHBT. But there are
  // others where they truly are separate divisions ... For instance, HUB."
  //
  // 🔴🔴 THOSE TWO CASES LOOK IDENTICAL IN A PARENT-CHILD TABLE AND MUST BEHAVE IN OPPOSITE WAYS.
  // That is the whole reason `relationship` exists beside `parent_id`:
  //
  //   succeeded  the child name is DEAD. MHBT -> MMA. It rolls up, it shows in the drop-down with
  //              its own historical count, and it must NEVER appear on the fallen-off list --
  //              there is nobody left to ring. It cannot hold a rep or a contact.
  //   division   the child is ALIVE. HUB Fort Worth, HUB Wellspring, USI - OH, OneDigital - TX.
  //              It rolls up AND stays on the fallen-off list on its own merits, because it is a
  //              real relationship somebody can call, with its own owner.
  //
  // ⛔ THE QUOTES ARE NEVER REWRITTEN. A 2013 quote really was MHBT, and relabelling it MMA would
  // put MMA in the log four years before it appears there at all. This is a DISPLAY-TIME parent,
  // not a data rewrite -- the same rule the SUCCEEDED_BY constant already followed.
  //
  // ⭐ It replaces that constant, which was always going to outgrow source code: Gallagher
  // acquires constantly, and HUB alone contributes three rows.
  // ---- An owner for an AGENT, 2026-08-22 -----------------------------------------------------
  // Eric: "could this note be at the agent level? ... If there are specific agents in the agency
  // that I work with and others that Niels works with".
  //
  // assigned_rep ALREADY EXISTED on `brokers` and reached nothing: that table holds REGISTERED
  // broker accounts and has zero rows. The agents ABY actually knows are in broker_directory,
  // which is built from the quotes themselves and had no owner column at all.
  // A field that exists on the empty table and not on the populated one is the same defect as the
  // Owner column joining through brokers -- built, correct, and unreachable.
  // -- broker_directory HAS EXISTED ONLY IN PRODUCTION, AND NOTHING CREATED IT ANYWHERE -------
  //
  // FOUND 2026-08-24 by rehearsing this whole list against a real SQLite engine. FOUR ALTERs and
  // one INDEX below name this table, the worker reads and writes it on the CRM, the agent list and
  // the quote-save path -- and no CREATE TABLE for it existed in this list, in schema.sql, or
  // anywhere else in the repo. The only copy of its shape was a FIXTURE inside a checker
  // (scripts/check_crm.mjs), which is the one place a shape cannot help a real database.
  // It was made by hand on live D1 and never written down. Same defect as aby_sales below and as
  // quotes.agency_id above, and it is the FOURTH instance: production is the one environment
  // somebody is always looking at, which is exactly why this survives.
  // COPIED VERBATIM FROM PRODUCTION (sqlite_master, 2026-08-24), not written from memory. Only the
  // seven ORIGINAL columns are here; assigned_rep, person_id, agency_id and source stay as the
  // ALTERs that already add them, so each of those facts is still stated exactly once.
  { sql: "CREATE TABLE IF NOT EXISTS broker_directory (email TEXT PRIMARY KEY, " +
         "name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', " +
         "agency TEXT NOT NULL DEFAULT '', first_seen TEXT NOT NULL DEFAULT '', " +
         "last_seen TEXT NOT NULL DEFAULT '', quote_count INTEGER NOT NULL DEFAULT 0)",
    table: "broker_directory", column: "quote_count" },

  { sql: "ALTER TABLE broker_directory ADD COLUMN assigned_rep TEXT", table: "broker_directory", column: "assigned_rep" },

  { sql: "ALTER TABLE agencies ADD COLUMN parent_id TEXT",         table: "agencies", column: "parent_id" },
  { sql: "ALTER TABLE agencies ADD COLUMN relationship TEXT",      table: "agencies", column: "relationship" },
  { sql: "ALTER TABLE agencies ADD COLUMN relationship_note TEXT", table: "agencies", column: "relationship_note" },

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

  // -- ABY's own CLIENT list (F-377) ------------------------------------------------------------
  //
  // ERIC, 2026-08-22: "I want the ABY client list to be part of the ABY admin."
  //
  // WHY THIS IS ITS OWN TABLE AND NOT A FLAG ON quotes OR ON aby_sales. The question was put
  // directly -- "whether sold groups from quotes is the same record or a different record from
  // Active Groups" -- and it was settled by MEASUREMENT against live D1, not by preference:
  //
  //     can a client exist with NO sale?            YES -- 1,248 of 1,295
  //     can a sale exist with NO active client?     YES -- 359 of 406
  //
  // Either answer alone forces two records. A SALE IS AN EVENT WITH A DATE; A CLIENT IS A STATE
  // THAT IS TRUE TODAY. So this table is the spine, and quotes and sales stay as dated events
  // that point AT it. Folding a sale into a client row would turn an employer who buys again in
  // 2027 into a second client, and would take the originating sale away from a client who terms.
  //
  // It is the shape the BenefitLab dashboard already settled on: bl_client carries a STAGE rather
  // than living in a second table, and a lost client is archived, never deleted.
  //
  // BUILT TO GROW, DELIBERATELY. Eric, 2026-08-22: "Later, perhaps we'll get some better lists
  // that give us even more info like product lines, actual effective date, current broker (if
  // there was an AOR)." The client record is being RECONSTRUCTED from whatever artifacts exist,
  // so every new source adds a column. Nothing here is NOT NULL except the name.
  //
  // TWO BROKER FIELDS, AND THAT IS THE POINT, NOT DUPLICATION. Eric named the reason himself:
  // "current broker (if there was an AOR)". The broker on a quote is whoever ran it, frozen at
  // that date; an Agent of Record change moves the relationship and leaves NO trace in any of
  // these records. One broker column would quietly show somebody who has not touched the account
  // in years, with nothing on screen saying so. Same two-questions-two-fields ruling as ran_by
  // versus client_id in Change L.
  //
  // status is 'active' / 'termed' / 'unknown'. It is NOT a boolean, because the honest answer for
  // most rows today is that nobody knows, and a boolean would have to lie in one direction.
  // ONLY 12 PERCENT of ABY's recorded sales appear in the folder list this is first loaded from,
  // and neither termination nor a setup lag explains that gap -- so the folder list proves
  // ACTIVE, and it does NOT prove TERMED. An absent employer is 'unknown', never 'termed'.
  //
  // match_key is the normalised name every join runs on, stored rather than recomputed so the
  // admin does not derive it per row and so the unique index below can rest on it.
  { sql: "CREATE TABLE IF NOT EXISTS aby_clients (" +
         "  id TEXT PRIMARY KEY," +
         "  name TEXT NOT NULL," +
         "  match_key TEXT NOT NULL DEFAULT ''," +
         "  status TEXT NOT NULL DEFAULT 'unknown'," +
         "  source TEXT NOT NULL DEFAULT ''," +
         "  original_broker TEXT," +
         "  original_broker_agency TEXT," +
         "  current_broker TEXT," +
         "  current_broker_agency TEXT," +
         "  aor_changed_at TEXT," +
         "  effective_date TEXT," +
         "  effective_date_is_estimate INTEGER DEFAULT 0," +
         "  products TEXT," +
         "  account_mgr TEXT," +
         "  note TEXT," +
         "  first_seen_at TEXT," +
         "  updated_at TEXT)",
    table: "aby_clients", column: "name" },
  // The name is the only identity these records have, so it must not be loadable twice. The
  // folder list gets re-imported every time Eric re-screenshots the two missing stretches, and an
  // importer that can double a client is an importer that silently inflates every count.
  { sql: "CREATE UNIQUE INDEX IF NOT EXISTS aby_clients_match_key ON aby_clients (match_key)",
    index: "aby_clients_match_key" },

  // -- THE CRM SPINE (F-383) --------------------------------------------------------------------
  //
  // ERIC, 2026-08-23: "I think I like the idea of brokers and agencies being the crm page
  // essentially. With tags, notes, etc." ... "I want this to be really good and easy to read and
  // work with for both me and Niels."
  //
  // ONE ROW PER THING THAT HAPPENED TO ONE ENTITY. Notes and tags share a table because they share
  // a shape -- who, what, when, and who wrote it -- and splitting them would mean two histories to
  // merge every time a page wants to show what has happened to an agency.
  //
  // A NOTE AND A TAG ARE STILL DIFFERENT THINGS, AND kind IS WHAT KEEPS THEM APART.
  //   note   free text about ONE entity, never listed across firms. "Spoke to Jana, they are
  //          moving to a PEO in the spring."
  //   tag    a label repeated VERBATIM across many, whose entire purpose is to pull back everyone
  //          who carries it. "sent quoting tool email", "invited to webinar".
  //
  // THE TAG IS PICKED FROM A GROWING LIST, NEVER RETYPED, AND THAT IS NOT A UI PREFERENCE.
  // If tags are free text the filter is string matching and it will lie: the first person to type
  // "Sent quote tool email" instead of "sent quoting tool email" drops out of the list and nothing
  // says so. This project shipped that exact bug on 2026-08-22 -- product ids are "product-cobra",
  // a search for "cobra" matched nothing, and the report confidently said every agency had quoted
  // no products. A value spelled differently is invisible.
  //
  // WHY NOT agencies.notes, WHICH ALREADY EXISTS. Measured against live D1 on 2026-08-23: 577 of
  // the 578 populated rows hold a MACHINE-WRITTEN line -- "owner seeded 2026-08-22: 159 of 159
  // named-rep quotes run by Niels". That column is the seeder's, and a human note written into it
  // is destroyed the next time the seeder runs. The build plan listed it as ready-made CRM
  // infrastructure; it is not. THE CRM NEVER WRITES TO agencies.notes OR brokers.notes.
  //
  // happened_at IS SEPARATE FROM created_at AND THAT IS WHAT MAKES HISTORY WORK. Eric asked
  // directly: "Can I put a past date on the pipeline and the referrals page for notes about when
  // someone was referred to us?" So happened_at is the date the THING happened and is backdatable;
  // created_at is when the row was written and is not. Two different facts, both kept.
  // The same defect exists on brokers.referred_at today, which is stamped with the current time and
  // cannot be set -- the column is there, the UI simply never offers a date.
  //
  // entity_id IS A STABLE KEY AND NEVER A NAME.
  //   agency -> agencies.id
  //   agent  -> the LOWERCASED, TRIMMED EMAIL, because broker_directory has no id and its primary
  //             key IS the address. That matches handleAdminAssign, which already keys an agent
  //             update on email for the same reason.
  // A tag attached to a name attaches to a string: "Jason Sandler" is already two rows on the agent
  // list -- three of his quotes carry his email and three carry an empty one -- and inventing an id
  // for a name is how one person becomes two records permanently.
  //
  // NOTHING IS EVER RECOMPUTED IN THIS TABLE. A recorded status is a tag with a date on it, and the
  // whole point of Eric's question -- "we tagged this originally as one quote ever and now they
  // have done six, something is working" -- is that the tag stays FROZEN while the analysis stays
  // LIVE. Refreshing a recorded value destroys the only thing it was for.
  { sql: "CREATE TABLE IF NOT EXISTS crm_events (" +
         "  id TEXT PRIMARY KEY," +
         "  entity_type TEXT NOT NULL," +      // 'agency' or 'person'
         "  entity_id TEXT NOT NULL," +        // agencies.id, or people.id
         "  kind TEXT NOT NULL," +             // 'note' or 'tag'
         "  label TEXT," +                     // the tag, picked from the existing set. NULL on a plain note
         "  body TEXT," +                      // free text. Optional on a tag
         "  happened_at TEXT NOT NULL," +      // the date the THING happened. Backdatable
         "  created_at TEXT NOT NULL," +       // when the row was written. Never backdated
         "  created_by TEXT NOT NULL DEFAULT '')",
    table: "crm_events", column: "happened_at" },

  // Reading one entity's history is the commonest query on the page, and it is always newest first.
  { sql: "CREATE INDEX IF NOT EXISTS crm_events_entity ON crm_events (entity_type, entity_id, happened_at DESC)",
    index: "crm_events_entity" },
  // "Show me everyone we sent the quoting tool email to" reads the other way -- by label, across
  // every entity -- so it needs its own index or the filter degrades into a scan as tags accumulate.
  { sql: "CREATE INDEX IF NOT EXISTS crm_events_label ON crm_events (kind, label)",
    index: "crm_events_label" },

  // -- A PERSON IS NOT AN EMAIL ADDRESS (F-383) --------------------------------------------------
  //
  // ERIC, 2026-08-23: "agents who move from one agency to another. We want the fact that they know
  // and like us to be recorded without taking their quote history with them - that stays with the
  // agency. Just a note that they quoted 7 while at the prior agency."
  //
  // THAT IS THE MHBT RULE ONE LEVEL DOWN, AND IT RESOLVES THE SAME WAY: THE EVENT STAYS WHERE IT
  // HAPPENED, THE RELATIONSHIP FOLLOWS THE PERSON. A 2019 quote really was run at that agency and
  // must keep counting for it; the human being who ran it is somebody ABY still knows.
  //
  // WHY THIS CANNOT BE SOLVED BY KEYING ON EMAIL, WHICH IS WHAT THE ADMIN DOES TODAY. An address
  // BELONGS TO AN AGENCY -- rebecca@ebslp.com, rebecca@legacybenefitservicesllc.com -- so it changes
  // at exactly the moment we care about. Email as identity breaks on the one event this is for.
  //
  // MEASURED AGAINST LIVE D1, 2026-08-23, AND THE THREE CASES ARE THREE DIFFERENT THINGS THAT LOOK
  // IDENTICAL TO A NAME MATCHER -- which is why nothing here merges automatically:
  //   Rebecca Hearne   two addresses, TWO DIFFERENT AGENCIES (EBS, Legacy Benefit Services), one
  //                    quote at each. A REAL MOVE. This is Eric's case, live.
  //   Abby Crain       abby@benefitstexas.com and abby.crain@patriotgis.com, same agency name.
  //                    NOT a move -- Patriot ACQUIRED Benefits Texas, so the firm changed under her.
  //   Jacob Kellum-Hudman  .com and .net at one agency. Neither a move nor an acquisition: an ALIAS.
  //
  // SO A MERGE IS ALWAYS A HUMAN ACT. The page may SUGGEST a pair; it must never join them, because
  // the three cases above need three different answers and only a person knows which is which.
  //
  // ONE TABLE AND ONE COLUMN, NOT A REBUILD. broker_directory already IS the address list -- email
  // as the key, the agency, first_seen, last_seen, quote_count. It stays exactly as it is and gains
  // a pointer. Nothing is copied, so nothing can disagree.
  //
  // EVERY ADDRESS GETS ITS OWN PERSON AT BACKFILL, one to one. That is the honest starting state:
  // we know of 139 addresses and have been told about no moves at all. Merging is the exception.
  //
  // A MERGE IS REVERSIBLE AND REWRITES NO QUOTE. It repoints broker_directory.person_id, and that is
  // the whole operation. The quote rows are never touched -- the same rule the acquisition parent
  // follows, and for the same reason: relabelling history makes an agency appear in a year it did
  // not trade in.
  { sql: "CREATE TABLE IF NOT EXISTS people (" +
         "  id TEXT PRIMARY KEY," +
         "  name TEXT NOT NULL DEFAULT ''," +
         "  created_at TEXT," +
         "  updated_at TEXT)",
    table: "people", column: "name" },

  // Which human this address belongs to. NULL means nobody has said, and the read side treats an
  // unlinked address as a person of one -- so the column can be backfilled lazily and a row that
  // misses the backfill still renders, rather than vanishing off the page.
  { sql: "ALTER TABLE broker_directory ADD COLUMN person_id TEXT",
    table: "broker_directory", column: "person_id" },

  // "Show me this person's addresses" runs on every expanded row on the CRM page.
  { sql: "CREATE INDEX IF NOT EXISTS broker_directory_person ON broker_directory (person_id)",
    index: "broker_directory_person" },

  // THE AGENCY THIS ADDRESS BELONGED TO, RESOLVED ONCE AND STORED.
  // "7 while at the prior agency" is a question about the address, not about the person, and it must
  // survive the person moving. Resolved from the agency NAME already on the row -- the same
  // case-insensitive match the rest of the admin uses -- and stored so the per-agency split does not
  // have to re-derive it per render.
  // 115 of the 139 addresses resolved on the first pass; the other 24 all carry a real firm name
  // that simply had no agencies row, and the backfill creates those records rather than leaving the
  // agent unattachable. Eric, 2026-08-23: "I would like to have agents under agencies but need to
  // resolve the ones with no agency."
  { sql: "ALTER TABLE broker_directory ADD COLUMN agency_id TEXT",
    table: "broker_directory", column: "agency_id" },

  // An agency record CREATED so an agent had somewhere to hang, rather than one ABY has dealt with.
  // Eric asked for these to be flagged: "just repeat the name as the agency with a note that it
  // needs updating." The name was already there, so what is recorded is the provenance.
  // ⛔ NOT written into agencies.notes -- that column belongs to the owner-seeding script and 577 of
  // its 578 populated rows are its output. A human value written there is destroyed on the next run.
  { sql: "ALTER TABLE agencies ADD COLUMN needs_review TEXT",
    table: "agencies", column: "needs_review" },

  // -- WHERE THE FIRM IS (Eric, 2026-08-23) -----------------------------------------------------
  //
  // "Should we add city and state to the records? or at least metro area (closest big city) and
  // state?"
  //
  // 🔴 THERE IS NOTHING TO PREFILL FROM, AND THAT IS WORTH KNOWING BEFORE ANYBODY PLANS AROUND IT.
  // Measured 2026-08-23: only 5 of 6,154 quotes carry a broker phone, and 4 of the 139 known agents
  // do -- so an area-code inference would reach almost nobody. These get typed, the same
  // tidy-as-you-go way the acquisition map does.
  //
  // ⛔ quotes.state IS NOT THIS. It is the PRICING state, it is on every row, and it defaults to TX.
  // Reading it as the broker's location would put every agency in Texas with total confidence.
  //
  // ⭐⭐ CITY AND STATE ARE STORED; METRO IS DERIVED, AND THAT IS DELIBERATE. Eric asked for "metro
  // area (closest big city)" -- which is a FUNCTION OF THE CITY, not an independent fact. A typed
  // metro beside a typed city is two hand-maintained fields that answer overlapping questions, and
  // they disagree the first time somebody fills in one and not the other.
  //
  // ⚠️ IT BELONGS TO THE OFFICE, NOT THE BRAND. HUB Fort Worth and HUB are separate rows already
  // (relationship = division), so each carries its own location and the parent needs none. An
  // acquired name (relationship = succeeded) does not need one either -- nobody can visit it.
  // WHERE A DIRECTORY ROW CAME FROM (Eric, 2026-08-23, the event-list import).
  // Every row in broker_directory was built FROM THE QUOTES until now, so first_seen meant
  // 'first quoted'. An agent added from a conference list has never quoted, and without this
  // column their first_seen reads as a quote date -- a different and untrue fact.
  // NULL means the original source: derived from the quote log.
  { sql: "ALTER TABLE broker_directory ADD COLUMN source TEXT",
    table: "broker_directory", column: "source" },
  // -- THE RESOLVED FIRM, STORED ON THE QUOTE AND ON THE SALE -----------------------------------
  //
  // Added to PRODUCTION by hand while correcting the alias data, and NOT to this list -- so the
  // column existed on the live database and nowhere else. The dupes endpoint then 500d on every
  // fresh database, which is how the test suite found it. A column the shipped code reads and
  // the migration does not create is a page that works in one place and breaks everywhere else,
  // and it is the SECOND time in one day: aby_sales had the same gap this afternoon.
  //
  // agency_id is the SURVIVING firm, resolved once, so a list never has to re-derive it from
  // free text. broker_agency is corrected in place separately, on Eric's instruction, with the
  // original spelling written into the quote's own note.
  { sql: "ALTER TABLE quotes ADD COLUMN agency_id TEXT", table: "quotes", column: "agency_id" },
  { sql: "ALTER TABLE aby_sales ADD COLUMN agency_id TEXT", table: "aby_sales", column: "agency_id" },
  { sql: "CREATE INDEX IF NOT EXISTS quotes_agency_id ON quotes (agency_id)", index: "quotes_agency_id" },
  { sql: "CREATE INDEX IF NOT EXISTS aby_sales_agency_id ON aby_sales (agency_id)", index: "aby_sales_agency_id" },

  // -- "THESE ARE DIFFERENT FIRMS" HAS TO STICK ------------------------------------------------
  //
  // ERIC, 2026-08-24: "there are some that I've answered multiple times that keep showing up on the
  // tidy up list."
  //
  // MY FAULT, AND IT WAS A DELIBERATE CHOICE THAT WAS WRONG. The dismiss control removed the group
  // from the array in the browser and nothing else -- I wrote "dismissed for this sitting only" in
  // the comment and reasoned that storing it would be a fourth kind of relationship to think about.
  // So every judgement he made was thrown away on reload, and the finder cheerfully proposed the
  // same pair again the next morning.
  //
  // A SUGGESTION ENGINE THAT CANNOT BE TOLD NO IS AN ENGINE THAT WASTES THE ONLY EXPENSIVE THING
  // HERE, which is his attention. "Not a duplicate" is an ANSWER, exactly as much as "keep this
  // one" is, and it has to survive the page.
  { sql: "CREATE TABLE IF NOT EXISTS tidy_dismissed (" +
         "  group_key TEXT PRIMARY KEY," +
         "  names TEXT NOT NULL DEFAULT \'\'," +
         "  created_at TEXT NOT NULL)",
    table: "tidy_dismissed", column: "group_key" },

  // -- A MESSAGE TO WHOEVER IS FIXING THE DATA, NOT A RECORD ABOUT THE FIRM ---------------------
  //
  // ERIC, 2026-08-24: "I don't need something viewable months later. I need to tell you something
  // as I'm doing the tidying. You might list four different spellings and I might need to tell you
  // that one is correct, two others should be corrected, and one doesn't belong. Then you fix it
  // and the note goes away."
  //
  // The first attempt wrote these as dated notes on the firm, which is the WRONG SHAPE: a note on
  // an agency is a permanent fact about that agency, and this is an instruction with a lifespan --
  // it exists until somebody does the thing, and then it is noise. Storing working messages in the
  // history is how a history stops being worth reading.
  // done_at IS THE WHOLE DESIGN: pending ones show on the screen, resolved ones vanish from it and
  // stay in the table, so what was asked for is still auditable without cluttering the record.
  { sql: "CREATE TABLE IF NOT EXISTS tidy_message (" +
         "  id TEXT PRIMARY KEY," +
         "  group_key TEXT NOT NULL," +
         "  names TEXT NOT NULL DEFAULT ''," +
         "  body TEXT NOT NULL," +
         "  created_at TEXT NOT NULL," +
         "  done_at TEXT)",
    table: "tidy_message", column: "body" },
  { sql: "CREATE INDEX IF NOT EXISTS tidy_message_open ON tidy_message (done_at, group_key)",
    index: "tidy_message_open" },

  // -- WHAT KIND OF PERSON IS THIS (F-388) ------------------------------------------------------
  //
  // ERIC, 2026-08-24: "There apparently is no possible way to track people we are doing business
  // with (firms and the people) and other people we might want to do business with at some point."
  //
  // 🔴🔴 THE ROOT CAUSE, MEASURED: EVERY RECORD OF A PERSON OR A FIRM WAS DERIVED FROM THE
  // QUOTE LOG. 628 of 672 agencies exist ONLY because somebody quoted. The quote log says who
  // ASKED -- and somebody you might want to do business with has never asked, which is what makes
  // them a prospect. So the model could not hold one, and each time that came up a new table and a
  // new page were added instead: brokers (0 rows), referral_partners (2), referral_contacts (4).
  //
  // ERIC GAVE THE VOCABULARY: broker | referral | aby | other.
  // \u26a0\ufe0f BROKER MEANS ANYONE AT AN AGENCY -- "broker, account manager, etc" (Eric, same day).
  // It is NOT restricted to producers and a future session must not narrow it to one.
  // \u26a0\ufe0f referral is kept apart from broker because F-369 forbids flattening them: "One is a
  // broker, others are potential referral partners." A broker would SELL; a partner would
  // INTRODUCE. Different asks, and a single list cannot hold both without losing the distinction.
  //
  // 🔴🔴 AND THE CORRECTION THAT MATTERS, ERIC THE SAME DAY: "You do realize clients and
  // former clients are employers, they are not brokers, right?" \u26d4 PROSPECT | CLIENT | FORMER
  // CLIENT IS THE **EMPLOYER** AXIS -- aby_clients, 2,213 active and 977 termed -- and it does NOT
  // belong on an agency. A BROKER IS NEVER A CLIENT; an agency is the CHANNEL. A stage column was
  // nearly added to agencies here, and it would have been the wrong population AND a duplicate of
  // the DERIVED status that already answers how active a channel relationship is.
  // \u2b50 THE TWO AXES, SO THEY ARE NOT FORCED TOGETHER AGAIN:
  //     EMPLOYERS  quoted / RFP prospect -> client -> former client   (aby_clients)
  //     CHANNEL    producing / quoting / dormant / prospect, DERIVED  (agencies + people)
  { sql: "ALTER TABLE people ADD COLUMN kind TEXT", table: "people", column: "kind" },
  { sql: "CREATE INDEX IF NOT EXISTS people_kind ON people (kind)", index: "people_kind" },

  // -- aby_sales HAS EXISTED ONLY IN PRODUCTION, AND THAT IS A REAL HAZARD --------------------
  //
  // 🔴 FOUND 2026-08-24 by adding a Sales column to the CRM list: the query threw on a fresh
  // database with "no such table: aby_sales", which rendered the WHOLE marketing list as an error.
  // The table was created by hand during the sales-tracking work and never written into the
  // migration, so every environment except production has been missing it since.
  // \u26d4 CODE IN THE WORKER DEPENDS ON THIS TABLE. A table the shipped code reads and the
  // migration does not create is a page that works in one place and 500s everywhere else -- and it
  // is only ever found by somebody adding a feature that touches it.
  // \u26a0\ufe0f COPIED VERBATIM FROM PRODUCTION (sqlite_master, 2026-08-24), not written from memory:
  // a migration that creates a DIFFERENT shape from the live one is worse than no migration.
  { sql: "CREATE TABLE IF NOT EXISTS aby_sales (id TEXT PRIMARY KEY, employer TEXT NOT NULL DEFAULT '', " +
         "agency TEXT NOT NULL DEFAULT '', agency_raw TEXT NOT NULL DEFAULT '', " +
         "broker_contact TEXT NOT NULL DEFAULT '', account_mgr TEXT NOT NULL DEFAULT '', " +
         "products TEXT NOT NULL DEFAULT '', effective_date TEXT NOT NULL DEFAULT '', " +
         "announced_at TEXT NOT NULL DEFAULT '', quote_id TEXT, quote_number TEXT NOT NULL DEFAULT '', " +
         "source TEXT NOT NULL DEFAULT 'email-sweep-2026-08', note TEXT NOT NULL DEFAULT '', " +
         "quote_match TEXT NOT NULL DEFAULT '', effective_date_is_estimate INTEGER)",
    table: "aby_sales", column: "employer" },
  { sql: "CREATE INDEX IF NOT EXISTS aby_sales_agency ON aby_sales (agency)", index: "aby_sales_agency" },
  { sql: "ALTER TABLE agencies ADD COLUMN city TEXT",  table: "agencies", column: "city" },
  { sql: "ALTER TABLE agencies ADD COLUMN state TEXT", table: "agencies", column: "state" },
  // Filtering the CRM by area is the whole point of collecting it, so it is indexed rather than
  // scanned once the list is a few hundred rows.
  { sql: "CREATE INDEX IF NOT EXISTS agencies_location ON agencies (state, city)",
    index: "agencies_location" },

  // -- A PERSON WE KNOW BY NAME AND FIRM, WITH NO EMAIL YET --------------------------------------
  //
  // Eric, 2026-08-24: "if we know an agent and an agency then that should work and an email added
  // later." The prospecting list that prompted it holds 532 group-health contacts with a named
  // person, a phone and no published address -- and they are not the weak end of the list: they
  // include VPs of employee benefits and directors of benefit services at real agencies. Refusing
  // them would have thrown away some of the best rows in the file.
  //
  // WHY THESE COLUMNS GO ON people AND NOT ON broker_directory: that table's PRIMARY KEY is the
  // email. A person without one cannot be represented there at all, which is exactly the assumption
  // being retired. people is already the identity record -- "a person is not an email address" --
  // so it is where somebody with no address has to live.
  { sql: "ALTER TABLE people ADD COLUMN agency_id TEXT", table: "people", column: "agency_id" },
  { sql: "ALTER TABLE people ADD COLUMN phone TEXT NOT NULL DEFAULT ''", table: "people", column: "phone" },
  // NULL means the original source: created as the identity behind an address in the quote log.
  { sql: "ALTER TABLE people ADD COLUMN source TEXT", table: "people", column: "source" },
  { sql: "CREATE INDEX IF NOT EXISTS people_agency ON people (agency_id)", index: "people_agency" },

  // -- RFP WATCH (F-384) -------------------------------------------------------------------------
  //
  // Public-entity solicitations for the services ABY administers. A DIFFERENT CHANNEL from the rest
  // of this admin: the CRM is agencies and agents, the broker channel; an RFP is a city, a county or
  // a school district buying direct. Eric, 2026-08-23: "this has nothing to do with going through
  // agents." So an opportunity is never an agency row and the two lists never merge.
  //
  // NOTE THERE IS NO status COLUMN, AND THAT IS THE DESIGN. Status is DERIVED at read time from
  // facts a human actually established -- did somebody open the issuing entity's own page, and when.
  // A stored status is a value that rots the moment a deadline passes; the same lesson the recorded
  // broker status taught the other way round. What IS stored is the observation: closes_at_source,
  // verified_at, verified_by.
  // ── THE RFP ANSWER LIBRARY (F-385) ──────────────────────────────────────────────────────────
  //
  // ERIC, 2026-08-26: "the full question list you provided the other day, organized by priority,
  // with boxes for Niels to answer... we need to capture the answers first, and for that we need
  // the questions."
  //
  // ⭐⭐ CAPTURE FIRST, STRUCTURE LATER, AND HE IS RIGHT: there is nothing to retrieve until
  // somebody has written an answer. Designing the retrieval over content that does not exist is
  // how you end up with a beautiful empty screen.
  //
  // ⛔ IT IS NOT IN THE BENEFITS RAG AND MUST NOT GO THERE (Eric, 2026-08-26, overruling the
  // earlier plan): "The ABY answers cannot go into our Benefits RAG knowledge base."
  //
  // ⚠️ THE SEED ANSWER AND THE ANSWER ARE TWO COLUMNS, NEVER ONE. `seed_answer` is what ABY told
  // College Station in 2025; it is a year old, covers FSA and LSA only because that is all that
  // bid asked, and its own header in the workbook says "please check". Pre-filling `answer` with
  // it would turn 46 unchecked claims into 46 answers nobody wrote, and nothing would ever
  // distinguish them again.
  { sql: "CREATE TABLE IF NOT EXISTS rfp_answer (" +
         "  id TEXT PRIMARY KEY," +
         "  priority INTEGER NOT NULL," +          // 1 first, 2 next, 3 later, 4 one-off
         "  topic TEXT," +
         "  question TEXT NOT NULL," +
         "  also_asked TEXT," +                    // the folded duplicate phrasings
         "  asked_by INTEGER NOT NULL DEFAULT 1," + // how many of the 19 solicitations asked it
         "  seed_answer TEXT," +                   // ABY's 2025 College Station answer. READ ONLY.
         "  answer TEXT," +                        // what Niels writes
         // '' not started | draft | verified | na. ⭐ `na` IS A REAL OUTCOME, NOT A GAP -- the
         // same ruling RFP Watch already makes with "could not tell". 249 of the 367 are one-offs
         // and some are questions ABY would never answer; without this, a question deliberately
         // skipped looks identical to one nobody has reached.
         "  status TEXT NOT NULL DEFAULT ''," +
         "  needs_doc INTEGER NOT NULL DEFAULT 0," +
         "  doc_note TEXT," +                      // WHICH document answers it. See the note below.
         // ⚠️ Numbers about ABY are FACTS WITH A DATE, not strings. The College Station submission
         // says 1,250 active clients in Tab A and 750+ in Tab B -- in one document, to a
         // government buyer. An answer carrying a figure needs a review date or it rots in place.
         "  has_dated_fact INTEGER NOT NULL DEFAULT 0," +
         "  review_by TEXT," +
         // 🔴 NOT A USER. The ABY admin has ONE shared password and cannot tell Eric from Niels
         // (F-405), so this is a PICKED owner, exactly like the /admin/today to-do list. Never
         // build a "mine" here.
         "  owner TEXT," +
         "  updated_at TEXT" +
         ")",
    // A REPRESENTATIVE COLUMN, and it is not decoration: the verifier probes table.column, so an
    // entry with no column asks for "rfp_answer.undefined", which cannot exist. That made
    // /api/migrate return ok:false on every single call since this table was added -- a health
    // check that is permanently red is one nobody reads, which is the whole danger.
    // updated_at is chosen because it is the LAST column in the CREATE TABLE above, so it also
    // proves the statement was not truncated part way through.
    table: "rfp_answer", column: "updated_at" },
  { sql: "CREATE INDEX IF NOT EXISTS rfp_answer_priority ON rfp_answer (priority, topic)",
    index: "rfp_answer_priority" },
  { sql: "CREATE INDEX IF NOT EXISTS rfp_answer_status ON rfp_answer (status)",
    index: "rfp_answer_status" },

  { sql: "CREATE TABLE IF NOT EXISTS rfp_opportunity (" +
         "  id TEXT PRIMARY KEY," +
         "  entity_name TEXT NOT NULL," +
         "  entity_type TEXT," +               // city | county | school_district | higher_ed | state_agency | special_district | federal | other
         "  state TEXT," +
         "  title TEXT NOT NULL," +
         "  solicitation_number TEXT," +
         "  scope TEXT," +                     // the services text the screen reads
         "  posted_at TEXT," +
         "  closes_at TEXT," +
         "  closes_at_source TEXT NOT NULL DEFAULT 'summary'," +
         "  plan_year TEXT," +                 // kept SEPARATE from the dates on purpose. See rfpScreen
         "  questions_due_at TEXT," +
         "  pre_proposal_at TEXT," +
         "  pre_proposal_mandatory INTEGER NOT NULL DEFAULT 0," +
         "  estimated_value TEXT," +
         "  official_url TEXT," +              // the ISSUING ENTITY's own page, not a listing
         "  listing_url TEXT," +
         "  source TEXT NOT NULL DEFAULT 'manual'," +
         "  source_note TEXT," +
         "  verified_at TEXT," +
         "  verified_by TEXT," +
         "  conflict_note TEXT," +
         "  override_screen TEXT," +           // 'keep' or 'drop'. A human overruling the rules
         "  created_at TEXT NOT NULL," +
         "  updated_at TEXT NOT NULL)",
    table: "rfp_opportunity", column: "closes_at_source" },

  { sql: "CREATE INDEX IF NOT EXISTS rfp_opp_closes ON rfp_opportunity (closes_at)",
    index: "rfp_opp_closes" },
  // Re-importing the same digest next week must recognise what it already holds, and it matches on
  // the entity plus the solicitation number.
  { sql: "CREATE INDEX IF NOT EXISTS rfp_opp_ident ON rfp_opportunity (entity_name, solicitation_number)",
    index: "rfp_opp_ident" },

  // WHAT THE WORLD IS DOING AND WHAT ABY DECIDED ARE DIFFERENT FACTS, so they are different tables.
  // Merge them and a solicitation closing erases the record that you looked at this entity and
  // passed, which is the single thing a weekly markdown file can never do. Eric's value is here.
  { sql: "CREATE TABLE IF NOT EXISTS rfp_decision (" +
         "  opportunity_id TEXT PRIMARY KEY," +
         "  disposition TEXT NOT NULL DEFAULT 'new'," +
         "  pass_reason TEXT," +
         "  owner TEXT," +
         "  updated_at TEXT NOT NULL)",
    table: "rfp_decision", column: "disposition" },

  // -- EVERYTHING BELOW EXISTED IN PRODUCTION ONLY, AND IN NO MIGRATION ------------------------
  //
  // FOUND 2026-08-24 by rehearsing this whole list against a real SQLite engine and diffing the
  // result against live sqlite_master. FIVE COLUMNS and THREE INDEXES were on the live database
  // and created by nothing, anywhere. Added by hand as each feature was built, and never written
  // down -- the same defect as broker_directory above, as aby_sales, and as quotes.agency_id.
  // PRODUCTION IS THE ONE ENVIRONMENT SOMEBODY IS ALWAYS LOOKING AT. That is why this keeps
  // surviving, and it is why the checker now diffs against a snapshot of the live schema rather
  // than trusting that somebody remembered.
  // TWO OF THESE FAIL SILENTLY RATHER THAN LOUDLY, WHICH IS WORSE. The writes for
  // resolved_pricing and employer_counts are already wrapped in a try/catch that console.warns
  // "column missing?" and carries on -- so on any database but production the share link quietly
  // loses its stored pricing and the employer's headcount is quietly not saved. The feature looks
  // built and does nothing.
  // COPIED VERBATIM FROM PRODUCTION (sqlite_master, 2026-08-24), not written from memory: a
  // migration that creates a DIFFERENT shape from the live one is worse than no migration.

  // The quote's disposition. schema.sql has only ever carried this as a COMMENT telling a human to
  // paste an ALTER by hand -- so it has never been part of any automated migration at all.
  // P Pending (default), I In process, S Sold, D Dead. ABY's internal vocabulary, deliberately
  // not the broker-facing five words.
  { sql: "ALTER TABLE quotes ADD COLUMN status TEXT DEFAULT 'P'", table: "quotes", column: "status" },

  // The share link (2026-08-21). The token is what lets an employer open a quote with no login,
  // and adjust their own participant count on it.
  { sql: "ALTER TABLE quotes ADD COLUMN share_token TEXT", table: "quotes", column: "share_token" },
  // UNIQUE, and PARTIAL so the many rows with no token do not collide with each other. This is
  // what makes the "claim a token WHERE share_token IS NULL" write safe under a race.
  { sql: "CREATE UNIQUE INDEX IF NOT EXISTS quotes_share_token_unique ON quotes(share_token) " +
         "WHERE share_token IS NOT NULL",
    index: "quotes_share_token_unique" },

  // The prices as they were RESOLVED when the quote ran, so a shared link re-prices against what
  // the employer was actually shown rather than against today's rate card.
  { sql: "ALTER TABLE quotes ADD COLUMN resolved_pricing TEXT", table: "quotes", column: "resolved_pricing" },

  // What the EMPLOYER said their participant counts really are, and when they said it. Kept apart
  // from the broker's original figures: they are two different people's answers to one question.
  { sql: "ALTER TABLE quotes ADD COLUMN employer_counts TEXT", table: "quotes", column: "employer_counts" },
  { sql: "ALTER TABLE quotes ADD COLUMN employer_counts_at TEXT", table: "quotes", column: "employer_counts_at" },

  // THE IDEMPOTENCY KEY FOR THE SALES IMPORT, and the most expensive of these to be missing.
  // Without it a re-run of the mailbox sweep duplicates every sale it has already loaded, and the
  // Sales column beside Quotes on the marketing list silently doubles.
  { sql: "CREATE UNIQUE INDEX IF NOT EXISTS aby_sales_key ON aby_sales(employer, announced_at, products)",
    index: "aby_sales_key" },
  { sql: "CREATE INDEX IF NOT EXISTS aby_sales_contact ON aby_sales(broker_contact)",
    index: "aby_sales_contact" },

  // -- A NAME ERIC HAS CONFIRMED IS NOT A SUGGESTION ANY MORE -----------------------------------
  //
  // ERIC, 2026-08-24: "I have told you about 12 times now that Hubs-Wellspring is not right and it
  // should be HUB - Wellspring. Why do you have that page for me to tidy up if you are going to
  // ignore the answers."
  // He was right, and the database says why: there was not ONE crm_event against any HUB or
  // Wellspring row, one tidy_message ever, and nothing at all in tidy_dismissed. Every one of those
  // answers went into a chat window and died there, because THE SCREEN HAD NO WAY TO TAKE THEM --
  // a firm could be tagged, noted, aliased and acquired, but never RENAMED. Only a session could do
  // that, and sessions do not persist.
  // Worse, an earlier session had written its own reasoning onto the row (the date ranges do not
  // overlap, so they must be different) and the next session read that as fact.
  // So: a name he has confirmed is stamped here, and the duplicate finder never proposes it again.
  { sql: "ALTER TABLE agencies ADD COLUMN name_confirmed_at TEXT",
    table: "agencies", column: "name_confirmed_at" },
  { sql: "ALTER TABLE agencies ADD COLUMN name_confirmed_by TEXT",
    table: "agencies", column: "name_confirmed_by" },

  // -- THE ADMIN'S OWN TO-DO LIST (F-403, Eric 2026-08-25) --------------------------------------
  //
  // ERIC: "I want to work on adding a to do list and calendar similar to what we just did to the
  // ABY admin area." The dashboard's version merges FIVE sources; this one is mostly a list you
  // type into, and that is a measured decision rather than a shortcut. Counted in live D1 on
  // 2026-08-25: rfp_opportunity had ZERO rows, commitments ONE, and of 3,190 aby_clients only 158
  // carry an effective_date -- every one of which is flagged an ESTIMATE. There was no five-source
  // merge available to build.
  //
  // WHY THERE IS AN owner COLUMN AND NO user COLUMN, WHICH IS THE ONE THING TO UNDERSTAND HERE.
  // The ABY admin has NO USER IDENTITY: /admin is one shared ADMIN_PASSWORD and the session token
  // is derived from that password, so the worker cannot tell Eric from Niels. A list called
  // "my to-dos" would therefore be a lie on a shared screen -- which is the dashboard's own F-244,
  // where one shared list was labelled My tasks and saving one rewrote the whole agency record.
  // So the list is SHARED and the owner is TYPED IN, using the same eric / niels vocabulary that
  // assigned_rep and the pipeline filters already use. A value spelled a third way is invisible.
  //
  // due_on IS NULLABLE AND NULL IS A REAL ANSWER. "Ring the Gallagher office some time" is a
  // to-do with no date; giving it a fake one puts it in a calendar it does not belong in, and
  // dropping it loses it. It gets its own section on the page instead.
  //
  // entity_label IS DENORMALISED ON PURPOSE. A to-do says what it was about at the time it was
  // written; it must not change meaning because an agency was renamed afterwards.
  { sql: "CREATE TABLE IF NOT EXISTS aby_task (id TEXT PRIMARY KEY, " +
         "title TEXT NOT NULL, due_on TEXT, owner TEXT NOT NULL DEFAULT '', " +
         "entity_type TEXT, entity_id TEXT, entity_label TEXT NOT NULL DEFAULT '', " +
         "note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, " +
         "created_by TEXT NOT NULL DEFAULT '', done_at TEXT)",
    table: "aby_task", column: "title" },
  { sql: "CREATE INDEX IF NOT EXISTS aby_task_due ON aby_task (due_on)",
    index: "aby_task_due" },
  // Every read of this table filters on done_at, so it is the column worth an index even though
  // the table is small today. It will not stay small.
  { sql: "CREATE INDEX IF NOT EXISTS aby_task_done ON aby_task (done_at)",
    index: "aby_task_done" },

  // ── DISPOSITION: OFF THE MARKETING LIST, STILL ON THE BOOKS (Eric, 2026-08-26) ─────────────
  //
  // "There also needs to be a way to remove people/agencies from the marketing list while still
  // keeping track of them. For instance, out of business, doesn't sell group products, not
  // interested (they've actually told us no), unsubscribed (do not contact)."
  //
  // ⛔ ITS OWN COLUMN, NOT A VALUE IN `priority`. Eric asked whether it belonged with A/B/C and the
  // answer is no, for three reasons in increasing order of importance:
  //   ① They answer different questions. Priority RANKS people you are working; disposition says
  //     whether to work them at all. Merged, "priority A but they said no in March" is unsayable.
  //   ② Merging destroys information on the way in: setting the disposition would overwrite the A,
  //     and setting it back to A would silently un-say that they told us no.
  //   ③ 🔴 AND THE DECIDING ONE: `do_not_contact` IS AN OBLIGATION, NOT A JUDGMENT. In one dropdown
  //     with A/B/C, anybody could un-suppress somebody who asked not to be contacted by changing an
  //     unrelated ranking, and nothing would go red. That must not be reachable by accident.
  //
  // ⚠️ AND `relationship` IS NOT THE HOME EITHER, though it looks like one. It already carries the
  // NAME-CLEANUP axis -- alias, succeeded, division -- on 113 of 665 rows. Reusing it would make
  // "out of business" and "this is a misspelling of another firm" the same kind of fact.
  //
  // ⭐ THE NOTE AND THE DATE ARE PART OF IT. "Not interested" in 2024 is a different fact from
  // "not interested" last week, and without the date nobody can tell them apart.
  { sql: "ALTER TABLE agencies ADD COLUMN disposition TEXT", table: "agencies", column: "disposition" },
  { sql: "ALTER TABLE agencies ADD COLUMN disposition_note TEXT", table: "agencies", column: "disposition_note" },
  { sql: "ALTER TABLE agencies ADD COLUMN disposition_at TEXT", table: "agencies", column: "disposition_at" },
  { sql: "ALTER TABLE people ADD COLUMN disposition TEXT", table: "people", column: "disposition" },
  { sql: "ALTER TABLE people ADD COLUMN disposition_note TEXT", table: "people", column: "disposition_note" },
  { sql: "ALTER TABLE people ADD COLUMN disposition_at TEXT", table: "people", column: "disposition_at" },
  { sql: "CREATE INDEX IF NOT EXISTS agencies_disposition ON agencies (disposition)",
    index: "agencies_disposition" },

  // ── WHERE WE FIRST MET THEM (Eric, 2026-08-26) ───────────────────────
  //
  // "Can you put ABY Brokers as the source for everything we already have... I want them to be
  // distinct from all the stuff we are about to import, especially when there is overlap between
  // my CCE list and the existing ABY brokers."
  //
  // ⭐⭐ SOURCE IS WHERE WE FIRST MET THEM AND IT IS SET ONCE. It is not "which lists is this
  // person on" -- that is what TAGS are for, and the import already tags a whole batch with the
  // event it came from. The overlap Eric names is exactly why the two have to be different
  // things: somebody who is an ABY broker AND on the CE list is TWO facts, and a single field
  // that the second import overwrote would quietly destroy the first one.
  // ▶️ So the CE import will ADOPT an existing ABY broker, leave source alone, and add its tag.
  // The person then reads: source = ABY broker, tagged = that CE class. Both true.
  //
  // ⚠️  and  already HAD a source column and 0 of 288 rows used it.
  //  had none.
  { sql: "ALTER TABLE agencies ADD COLUMN source TEXT", table: "agencies", column: "source" },
  // Eric, 2026-08-26: "when you expand, perhaps to the right of location, we could add the website
  // when known? That would be helpful." The web prospecting list carries one for 572 firms, and a
  // Tulsa firm IS its email domain, so most rows can answer this without anybody typing.
  { sql: "ALTER TABLE agencies ADD COLUMN website TEXT", table: "agencies", column: "website" },
  { sql: "CREATE INDEX IF NOT EXISTS people_source ON people (source)", index: "people_source" },

  // ── A PERSON'S OWN CITY (Eric, 2026-08-27) ────────────────────────────────────────────────
  //
  // "For Higginbotham, put city on the broker profile if you know it." Higginbotham alone brings
  // 79 CE attendees, spread across many Texas offices, and they are all going under one
  // "Higginbotham - TX" row for now -- so the city is the only thing that says WHICH office, and
  // it is the field a later split will be built from.
  //
  // ⛔ ON THE PERSON, NOT THE FIRM, AND THEY ARE DIFFERENT FACTS. A firm's city is where the firm
  // is; a broker's city is where that broker sits, and for a national with twenty offices those
  // are not the same answer. Storing only the firm's would say every Higginbotham agent works in
  // Fort Worth, which is exactly the wrong thing to record.
  { sql: "ALTER TABLE people ADD COLUMN city TEXT", table: "people", column: "city" },

  // ── THE BROKERS AND AGENCIES PAGE TOOK 23 SECONDS, AND EVERY JOIN IS ON AN EXPRESSION ──────
  //
  // Eric, 2026-08-27, and he had been staring at it: "the f-ing list is gone." It was not gone.
  // /api/admin/stats was taking 22,957ms, so every card on the Performance view sat on
  // "Loading..." until it returned -- and switching view or losing patience before then meant the
  // lists simply never appeared. An empty-looking screen and a slow one are the same screen.
  //
  // MEASURED, NOT GUESSED: the byAgent query alone read 21,438,704 ROWS out of a table holding
  // 6,170 quotes -- about 3,475 rows scanned per quote. The cause is that every join in these
  // handlers matches on a COMPUTED value, of the shape
  //     lower(trim(a.name)) = lower(trim(q.broker_agency))
  // and an ordinary column index cannot answer that, so each join full-scans the other table once
  // per row, six times over.
  //
  // SQLite indexes an EXPRESSION perfectly well, and this repo already leans on that:
  // brokers_email_unique is ON brokers (lower(trim(email))). These six give the other hot joins
  // the same treatment.
  //
  // AFTER: byAgent 7,011ms -> 41.79ms, and 21,438,704 rows read -> 40,709. The whole endpoint went
  // 22,957ms -> ~700ms and returned the IDENTICAL 647 agents and 538 agencies. So this changes how
  // the answer is reached and never what the answer is, which is what made it safe to ship.
  //
  // DO NOT DROP THESE TO TIDY UP. An index is invisible on every screen and in every test until
  // the day somebody wonders why a page hangs, which is exactly how this one was found.
  { sql: "CREATE INDEX IF NOT EXISTS agencies_lower_name ON agencies (lower(trim(name)))",
    index: "agencies_lower_name" },
  { sql: "CREATE INDEX IF NOT EXISTS agencies_parent ON agencies (parent_id)",
    index: "agencies_parent" },
  { sql: "CREATE INDEX IF NOT EXISTS quotes_lower_broker_agency ON quotes (lower(trim(broker_agency)))",
    index: "quotes_lower_broker_agency" },
  { sql: "CREATE INDEX IF NOT EXISTS quotes_lower_broker_email ON quotes (lower(trim(broker_email)))",
    index: "quotes_lower_broker_email" },
  { sql: "CREATE INDEX IF NOT EXISTS quotes_lower_broker_name ON quotes (lower(trim(broker_name)))",
    index: "quotes_lower_broker_name" },
  { sql: "CREATE INDEX IF NOT EXISTS broker_directory_lower_email ON broker_directory (lower(trim(email)))",
    index: "broker_directory_lower_email" },

  // ── TO-DOS GROW A TIME, A KIND, AN ORDER AND A COMPLETION RECORD (Eric, 2026-08-26) ────────
  //
  // "Is there a way to edit To-Dos, to mark them as done but actually have a record of what was
  // completed, and to rearrange them or pick a time too so that they can appear in order if
  // they're meetings? Or actually add a meeting/call to-do since it's going on a calendar."
  //
  // ⭐ A TIME, NOT A DATETIME, and the two are not the same decision. `due_on` is already a date
  // and every query, index and month-lens grouping reads it. Folding a time into it would rewrite
  // all of them to get a field that is empty on most rows. A separate nullable time sorts within
  // the day and leaves the date alone.
  { sql: "ALTER TABLE aby_task ADD COLUMN due_time TEXT", table: "aby_task", column: "due_time" },

  // todo | meeting | call. ⚠️ DEFAULTS TO todo AND IS NEVER INFERRED FROM THE WORDS. Reading
  // "call Blumberg" as a call would be a guess printed on a calendar as a fact, and it would be
  // wrong on "call sheet", "recall notice" and every to-do about a call somebody else is making.
  { sql: "ALTER TABLE aby_task ADD COLUMN kind TEXT", table: "aby_task", column: "kind" },

  // Manual order WITHIN a day, for the items a time cannot order.
  // ⭐ TIME WINS WHERE THERE IS ONE. Two meetings at 9:00 and 14:00 have an order already, and a
  // hand-set number that disagreed with the clock would be a second source of truth about the
  // same thing. This only decides the rows a time cannot.
  { sql: "ALTER TABLE aby_task ADD COLUMN sort_order INTEGER", table: "aby_task", column: "sort_order" },

  // 🔴 WHAT WAS COMPLETED, WHICH IS THE HALF THAT WAS MISSING. `done_at` has always been stored --
  // marking a to-do done has never deleted anything -- but every read of this table filters
  // `WHERE done_at IS NULL`, so a finished item vanished from the only screen that shows them.
  // Measured 2026-08-26: 4 to-dos, 1 of them done and invisible.
  // ⛔ The record is the point, so it must be able to say more than a timestamp: a call that
  // happened has an outcome, and that outcome is the reason anybody looks back at it.
  { sql: "ALTER TABLE aby_task ADD COLUMN done_note TEXT", table: "aby_task", column: "done_note" },
];

// Does this column resolve? A plain SELECT is used rather than PRAGMA table_info because column
// resolution happens at PREPARE time, so the probe answers even on an empty table, and its failure
// message names the exact problem ("no such column" vs "no such table").
// ⚠️ Deliberately NOT reused for the index: an index is invisible to a SELECT.
async function columnExists(env, table, column) {
  // THIS ASKED THE QUESTION IN A WAY D1 CANNOT ANSWER, AND IT COULD NOT RETURN FALSE.
  // It used to run  SELECT "<column>" FROM "<table>" LIMIT 1  and treat a thrown error as absent.
  // SQLite's double-quoted-string misfeature is ON in D1: where the identifier does not resolve
  // to a column, the double-quoted text degrades to a STRING LITERAL and the query SUCCEEDS.
  // MEASURED AGAINST LIVE D1, 2026-08-24:
  //     SELECT "no_such_column_at_all" AS probe FROM "quotes" LIMIT 1
  //   returns one row with probe = no_such_column_at_all, and success: true.
  // So this returned ok for EVERY column name on any table that exists. An assertion that reads
  // the value under test cannot fail.
  // THAT IS THE EVIDENCE F-357 WAS CLOSED ON, and that SITE_LOCKED was lifted on: "missing came
  // back empty" is what this function returns whether or not the columns landed. Production is in
  // fact correct -- all 46 declared columns and 16 indexes were re-verified against sqlite_master
  // on 2026-08-24 -- so nothing was broken by it. The PROOF was worthless, not the schema.
  // pragma_table_info is a real catalogue lookup and discriminates: 1 for a column that exists,
  // 0 for one that does not. Both directions verified on live D1 before this was changed.
  // THE TABLE NAME IS INTERPOLATED AND THE COLUMN IS BOUND, DELIBERATELY. D1's authorizer refuses
  // a non-constant argument to pragma_table_info with SQLITE_AUTH -- measured, by trying it -- so
  // the table cannot be a parameter. It comes from the hard-coded MIGRATIONS list, never from a
  // request, and it is still validated here rather than trusted.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(table || ''))) {
    return { ok: false, error: 'unsafe table name: ' + String(table) };
  }
  // An entry that declares no column cannot be verified at all, and must not read as present.
  if (!String(column || '')) return { ok: false, error: 'migration entry declares no column' };
  try {
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM pragma_table_info('" + table + "') WHERE name = ?"
    ).bind(column).all();
    const rows = (r && r.results) || [];
    return { ok: Boolean(rows.length && Number(rows[0].n) > 0) };
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
/**
 * Strip the dead "Source: <filename>" segment out of imported notes.
 *
 * ⭐ ERIC, 2026-08-21: "Yes strip it. It's not useful at all. What is useful is notes like this was
 * quoted twice, once with and once without commission. or Kandice quoted this and Niels quoted it
 * too." The importer wrote the PROPOSAL FILENAME into notes, so on a COBRA proposal the note read
 * "Source: ABY COBRA Administration Proposal- <the same employer>" -- i.e. the source of the quote
 * is the quote. And LINK SOURCE already shows the import tag, so it was the second source on screen.
 *
 * 🔴🔴 WHY THIS IS SURGICAL AND NOT "clear the notes column". `notes` is up to THREE things joined
 * by " | ": a Commission line, this Source line, and the sheet's own note. The Commission line
 * exists because `commission_included` has only two states while the sheet had three -- "Quoted both
 * ways" is 305 rows, and that note is the ONLY place the real answer survives. It is also exactly
 * the kind of note Eric just said is worth keeping. ⛔ Clearing the column would destroy it.
 *
 * ⛔ AND NOT A DISPLAY-SIDE FILTER EITHER, which was the other candidate and is worse: that textarea
 * is EDITABLE with a Save button, so hiding a segment would mean the next person to edit a note
 * silently deletes the hidden text on save.
 *
 * ⚠️ SCOPED TO ROWS THE IMPORTER CREATED (`source_tag LIKE 'import-%'`), so a broker-typed note that
 * happens to begin with the word Source is never touched. The residual risk is a human note added to
 * an IMPORTED row that also begins that way, which is accepted.
 *
 * ✅ IDEMPOTENT: after one run nothing matches, so it reports 0 and changes nothing. `/api/migrate`
 * is opened by hand more than once and must stay safe to re-run.
 * ℹ️ RECOVERABLE if it is ever wanted: the filenames are re-derivable from the original spreadsheet
 * via `scripts/import_quote_log.py`. Nothing here is the only copy.
 */
function stripSourceSegment(notes) {
  const kept = String(notes == null ? '' : notes)
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s && !s.toLowerCase().startsWith('source:'));
  return kept.length ? kept.join(' | ') : null;
}

async function stripImportedSourceNotes(env) {
  let scanned = 0, changed = 0, emptied = 0;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, notes FROM quotes WHERE source_tag LIKE 'import-%' AND notes LIKE '%Source:%'"
    ).all();
    const rows = results || [];
    scanned = rows.length;

    const updates = [];
    for (const r of rows) {
      const next = stripSourceSegment(r.notes);
      if (next === r.notes) continue;
      if (next === null) emptied++;
      changed++;
      updates.push(env.DB.prepare("UPDATE quotes SET notes = ? WHERE id = ?").bind(next, r.id));
    }
    // Batched so a partial run cannot leave half the rows in one shape and half in another.
    if (updates.length) await env.DB.batch(updates);
    return { scanned, changed, emptied };
  } catch (e) {
    // ⚠️ REPORTED, NEVER THROWN. This is a tidy-up riding along with the schema migration; a failure
    // here must not make `/api/migrate` look like the schema did not apply.
    return { scanned, changed, emptied, error: String((e && e.message) || e) };
  }
}

function migrationPhase(sql) {
  // 0 CREATE TABLE, 1 ALTER TABLE (add a column), 2 CREATE INDEX. Every entry is one of the three.
  if (/^\s*CREATE\s+TABLE/i.test(sql)) return 0;
  if (/^\s*ALTER\s+TABLE/i.test(sql)) return 1;
  return 2;
}

async function handleMigrate(env) {
  // THREE PHASES, AND THAT IS A FIX FOR THE CLASS RATHER THAN FOR EIGHT LINES.
  // Run in declaration order, an ALTER or an INDEX written ABOVE its own CREATE TABLE fails on
  // every database that does not already have that table -- which means production, where somebody
  // made the table by hand, and nowhere else. The gap only shows up when a NEW feature touches the
  // column, and then it looks like the new feature is broken.
  // MEASURED 2026-08-24 by rehearsing this list against a real SQLite engine: EIGHT statements
  // failed on a fresh database, across THREE tables -- aby_clients, broker_directory and aby_sales.
  // A fresh D1 came up with a DIFFERENT SHAPE from production and nothing said so.
  // Reordering those eight would fix those eight and leave the trap armed for the next entry
  // somebody appends. Sorting by KIND removes the ordering question: a table cannot be altered
  // before it is created, whatever order the lines are written in.
  // THE REPORT IS PUT BACK INTO DECLARATION ORDER, because that is the order a human reading this
  // list expects, and the checkers index into it positionally.
  const order = MIGRATIONS.map(function (m, i) { return i; }).sort(function (a, b) {
    return migrationPhase(MIGRATIONS[a].sql) - migrationPhase(MIGRATIONS[b].sql) || a - b;
  });
  const statements = new Array(MIGRATIONS.length);

  for (const i of order) {
    const m = MIGRATIONS[i];
    try {
      await env.DB.prepare(m.sql).run();
      statements[i] = { sql: m.sql, result: "applied" };
    } catch (e) {
      const msg = String((e && e.message) || e);
      // "duplicate column name: x" is SQLite saying the migration already ran. It is the ONLY
      // benign failure here, so it is the only one matched by name -- anything else is reported
      // as a failure with its message, rather than being assumed harmless.
      const benign = /duplicate column name/i.test(msg) || /already exists/i.test(msg);
      statements[i] = { sql: m.sql, result: benign ? "already" : "failed", error: msg };
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

  // Data tidy-up, not schema. Runs after the columns are proven present, and reports what it moved.
  const notesCleanup = await stripImportedSourceNotes(env);

  // ⭐ THE PEOPLE BACKFILL RUNS ONLY WHEN ITS COLUMNS ARE PROVEN PRESENT. Running it against a
  // half-migrated database would create person rows it could not then link, and the second run
  // would create them all again -- giving one human several records, which is the single thing
  // this design exists to prevent.
  const people = missing.length ? { skipped: 'schema incomplete', missing }
                                : await backfillPeople(env);

  // ⚠️ `ok` NOW MEANS "every object this migration is responsible for is present", which is the
  // question anybody opening this URL is actually asking. It used to be the constant `true`.
  // Nothing calls this endpoint programmatically (grep: one route, no callers) -- it is opened by
  // a human in a browser -- so tightening the meaning breaks nothing.
  return jsonResp({
    ok: missing.length === 0,
    missing,
    verified,
    // `scanned` is how many imported rows still carried a Source line, `changed` how many were
    // rewritten, `emptied` how many held NOTHING ELSE and are now null. On a second run all zero.
    notesCleanup,
    people,
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
      // no-store, AND IT IS NOT A TIDY-UP. Every admin PAGE already sends no-store, but the JSON
      // those pages actually read sent no cache headers at all -- so the shell arrived fresh and
      // the numbers inside it were whatever the browser had kept.
      // FOUND 2026-08-22: "Quotes by status" went on reporting 5,967 Pending through two deploys
      // that had demonstrably changed the query, and a cache-busting query string on the PAGE did
      // not help, because it was the /api/ response being reused. A deploy that looks like it did
      // not work is the most expensive kind -- the next move is to change the code again.
      // Do not "optimise" this away: these endpoints serve live business data to one operator, so
      // there is nothing to gain by caching them and a wrong number to lose.
      'Cache-Control':               'no-store',
    },
  });
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Admin dashboard HTML ──────────────────────────────────────────────────────

// ---- PRODUCT LABELS FOR THE QUOTE LOG -------------------------------------------------
// Module scope on purpose: the SERVER needs them for product search, and the admin page
// needs them to render. adminHTML() interpolates this same object into the browser copy.
const PRODUCT_SHORT = {
  pop:              { def: 'POP', embedsName: true, packages: { docsOnly: 'POP Docs Only', popHsa: 'POP + NDT (POP & HSA)', full: 'POP + NDT (FSA & HSA)' } },
  // Eric: "FSA instead of all the other stuff that's mentioned." DCAP and LFSA ride along in the
  // full name on the proposal; in a scannable list the broker is looking for the letters FSA.
  fsa:              { def: 'FSA', countLabel: 'participants' },
  hsa:              { def: 'HSA', countLabel: 'accounts' },
  hra:              { def: 'HRA', countLabel: 'participants' },
  ichra:            { def: 'ICHRA / QSEHRA', packages: { fullAdmin: 'Full Admin', docsOnly: 'Docs Only' }, countLabel: 'participants' },
  cobra:            { def: 'COBRA', countLabel: 'eligible employees' },
  stateContinuation:{ def: 'State Continuation', countLabel: 'employees' },
  // Eric: "For ERISA Wrap can we just call it ERISA?"
  // FIXED SAME DAY: the package list named 'fullPlan', which does not exist in products.js, while
  // the two that DO exist (fullSpd, fullSpdTesting) had no label at all -- so quoting either one
  // printed the raw id, e.g. "ERISA - fullSpd", straight into the log.
  erisa:            { def: 'ERISA', packages: { basic: 'Basic', buyUp: 'Buy-Up', enhanced: 'Enhanced', fullSpd: 'Full SPD', fullSpdTesting: 'Full SPD + Testing', whiteGlove: 'White Glove' } },
  // Eric, 2026-08-21: label ACA by WHICH FORM SET it is, not by service tier -- "1094B/1095B or
  // 1094C/1095C" -- and deliberately WITHOUT Full vs Self: "A lot of the time we quote both full
  // and self so it's hard to say."
  // The B/C split is the real distinction: smallB is the non-ALE B-form product; every ALE option
  // is a C-form filing. The form-count band stays out of the label and lives in the quote.
  // FIXED SAME DAY: fullXL and selfXL (501 to 1,000 forms) had no label and printed their raw id.
  // Eric's preferred spelling, 2026-08-21: "I actually prefer that: 1094/1095-B and 1094/1095-C."
  // The 106 IMPORTED ACA quotes carry no package at all (inputs is {}), so which form set they were
  // cannot be recovered -- those read the bare def. Only quotes run through the tool can say B or C.
  // embedsName: the package label REPLACES the product name rather than being appended to it.
  // Without it this read "ACA Reporting - 1094/1095-C", which says the same thing twice and is the
  // long label Eric objected to. The form number alone is what he asked for.
  aca:              { def: 'ACA Reporting', embedsName: true, packages: {
                        smallB: '1094/1095-B',
                        fullLt100: '1094/1095-C', fullMid: '1094/1095-C', fullHigh: '1094/1095-C', fullXL: '1094/1095-C',
                        selfLt100: '1094/1095-C', selfMid: '1094/1095-C', selfHigh: '1094/1095-C', selfXL: '1094/1095-C',
                        // FORM SET KNOWN, SERVICE TIER NOT RECORDED. Every other C entry here names a
                        // tier (full or self, and a form-count band); these two say only which set of
                        // forms it is, which is sometimes all anybody knows.
                        // TWO LEGITIMATE SOURCES, and the second was added 2026-08-26:
                        //   1. Read back off the ORIGINAL PROPOSAL PDF for the imported quotes, which
                        //      stored no package at all (Eric: "Yes go with 1"). Those rows carry
                        //      inputs.derivedFrom naming the proposal it was read from.
                        //   2. STATED when a quote is logged by hand. Eric's own first hand-logged
                        //      quote was "1094/1095-C" with no tier, and the form had no way to say
                        //      so -- it went in as a bare "ACA Reporting".
                        // ⛔ THE ALTERNATIVE WAS WORSE: offering the eight tiered options on that
                        // form would make somebody pick one, and a guessed tier is indistinguishable
                        // from a recorded one the moment it is stored.
                        // NO BACKTICKS IN THIS BLOCK -- it is inside the adminHTML template literal.
                        // Written with them on the first attempt, for the third time in one day; the
                        // deploy refused it. Run check_worker_pages.mjs after ANY worker.js edit.
                        derivedB: '1094/1095-B', derivedC: '1094/1095-C',
                      }, countLabel: 'forms' },
  // ADDED 2026-08-21. These five had NO entry, so each fell through to its full name -- up to 76
  // characters, which is what pushed everything else in the cell behind a "+N more" nobody could open.
  mpra:             { def: 'Medicare HRA', packages: { fullAdmin: 'Full Admin', docsOnly: 'Docs Only' }, countLabel: 'participants' },
  section127:       { def: 'EDU / SLRP', packages: { fullAdmin: 'Full Admin', docsOnly: 'Docs Only' }, countLabel: 'participants' },
  section132:       { def: 'QTB', packages: { fullAdmin: 'Full Admin', docsOnly: 'Docs Only' }, countLabel: 'participants' },
  lifestyle:        { def: 'LSB', packages: { fullAdmin: 'Full Admin', docsOnly: 'Docs Only' }, countLabel: 'participants' },
  directBilling:    { def: 'Direct Bill', countLabel: 'participants' },
  // LEGACY-ONLY. These three are NOT in products.js -- the tool no longer offers them -- but they
  // are in the imported history and therefore on screen: Form 5500 (59 quotes), NDT (12), HIPAA (6).
  // Measured on production, not guessed. Do not delete them to tidy the map: the rows outlive the
  // product, and without an entry each prints whatever name the old spreadsheet happened to use.
  // RE-MEASURED 2026-08-26. It read "Form 5500 (9), NDT (7), HIPAA (6)" -- true when written, and
  // then the 2009-2023 back-catalogue landed and Form 5500 went up more than six-fold. Nothing was
  // wrong with the map; the NUMBER beside it had quietly stopped being true, which is the shape a
  // measured claim in a comment always rots into. It matters here because these counts are the
  // argument for keeping the three entries at all.
  form5500:         { def: 'Form 5500' },
  ndt:              { def: 'NDT' },
  hipaa:            { def: 'HIPAA' },
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
  // The fallback path, for older rows that stored a display NAME rather than an id.
  'Medicare Premium Reimbursement Arrangement (Medicare HRA)': 'mpra',
  'Section 127 Educational Assistance (EDU) & Student Loan Reimbursement (SLRP)': 'section127',
  'Section 132 Qualified Commuter Benefits (QTB)': 'section132',
  'Lifestyle Benefit Plan (LSB)': 'lifestyle',
  'Direct Billing': 'directBilling',
};

/**
 * Which stored product ids would DISPLAY a label containing this search term?
 *
 * Returns SQL LIKE patterns for the `products` column. Empty array when the term matches no label,
 * so an ordinary name search is unaffected.
 *
 * The two quoting shapes are deliberate and are what stop false positives:
 *   product id  ->  '%erisa"%'      matches both "erisa" and "product-erisa" (the imported form)
 *   package id  ->  '%"derivedC"%'  fully quoted, so "full" cannot match "fullMid"
 */
function productIdsMatchingLabel(term) {
  const t = String(term || '').trim().toLowerCase();
  if (t.length < 2) return [];
  const out = [];
  for (const [pid, entry] of Object.entries(PRODUCT_SHORT)) {
    const def = (typeof entry === 'string') ? entry : (entry.def || '');
    if (def && def.toLowerCase().indexOf(t) !== -1) out.push('%' + pid + '"%');
    const pkgs = (typeof entry === 'object' && entry.packages) || {};
    for (const [pkgId, label] of Object.entries(pkgs)) {
      if (String(label).toLowerCase().indexOf(t) !== -1) out.push('%"' + pkgId + '"%');
    }
  }
  // A term matching EVERY product is not a search, it is a full scan with extra steps.
  return out.length > 40 ? [] : out;
}

function shortProductName(p) {
  if (typeof p === 'string') return p;
  // THE IMPORTED HISTORY USES A DIFFERENT ID CONVENTION, AND IT IS THE MAJORITY OF THE LOG.
  // Measured on production 2026-08-21: of 1750 quotes, 1738 store ids like 'product-erisa' while
  // only 12 use the live tool's 'erisa'. So every label added on 2026-08-21 missed almost every row,
  // which is what Eric saw -- "it still says ERISA Wrap Document instead of ERISA".
  // Their stored NAMES are older too ("ERISA Wrap Document", "Qualified Transportation Benefit
  // (QTB)"), so matching on the name cannot rescue them either -- those strings are not in
  // products.js any more. Stripping the prefix fixes all twelve legacy ids in one rule, rather
  // than the three that happened to get noticed.
  const rawId = String(p.id || '');
  const baseId = rawId.indexOf('product-') === 0 ? rawId.slice(8) : rawId;
  const id = (baseId in PRODUCT_SHORT) ? baseId : (PRODUCT_NAME_TO_ID[rawId] || PRODUCT_NAME_TO_ID[p.name] || baseId);
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
${ADMIN_HEADER_CSS}
.toolbar{background:white;border-bottom:1px solid #e5e5e5;padding:12px 24px;
         display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.toolbar input{flex:1;max-width:400px;padding:.5rem .75rem;border:1px solid #ddd;
               border-radius:6px;font-size:.95rem}
.toolbar input:focus{outline:none;border-color:#1a5c3a}
/* ── LOG A QUOTE ────────────────────────────────────────────────────────────────────────
   MOVED HERE FROM /admin/pipeline, 2026-08-26. Eric: "We need to move log a quote to the
   quote log page." It was on the prospecting screen because that is where it was built, not
   because it belonged there -- a quote ABY emailed instead of running is a QUOTE, and it
   belongs beside the other 6,170 of them.
   It starts SHUT, which is Eric's own suggestion: "maybe when you click log a quote it should
   expand to reveal everything." The log is what this page is for; logging one is occasional. */
/* Eric, 2026-08-26: "give that log a quote section a border and colored background when it's
   expanded? Hard to tell where it starts and ends."
   ⭐ THE STYLE IS ON [open] ONLY, deliberately. Shut, this is a one-line control in a toolbar and
   a boxed, tinted one-liner would read as an alert. Open, it is a form with eleven fields sitting
   directly above a table of quotes -- and with no edge, the last row of the form and the first row
   of the log ran into each other, which is what he was seeing. */
.logq{background:#fff;border-bottom:1px solid #e5e5e5}
/* 🔴 THE FIRST ATTEMPT TINTED IT #f4f8f5 AND THIS PAGE'S BACKGROUND IS #f0f4f0 -- two pale greens
   four hex digits apart, so the panel Eric asked to have STAND OUT was invisible against the page
   it sits on. Eric: "the same color as the background behind it."
   ⭐ THE MISTAKE WAS PICKING A TINT WITHOUT READING THE BACKGROUND IT LANDS ON. A colour is never
   a property of the element; it is a property of the CONTRAST, and the page's own value was one
   grep away.
   ▶️ WHITE plus a real border does the work instead, and white is not a blend here either: the
   toolbar and the table are already white cards floating on the green, so this reads as one more
   card -- and the 2px brand-green edge and the deeper shadow are what say it is the OPEN one.
   The summary keeps a green strip so the header reads as the panel's handle. */
.logq[open]{background:#fff;border:2px solid #1a5c3a;border-radius:10px;margin:12px 24px;
            box-shadow:0 3px 10px rgba(26,92,58,.16)}
.logq[open]>summary{background:#e8f5ee;border-bottom:1px solid #cfe0d5;
                    border-radius:8px 8px 0 0;margin-bottom:8px}
.logq>summary{cursor:pointer;user-select:none;list-style:none;padding:10px 24px;
              font-size:.9rem;font-weight:600;color:#1a5c3a;display:flex;align-items:center;gap:8px}
.logq>summary::-webkit-details-marker{display:none}
.logq>summary .tw{font-size:.7rem;transition:transform .12s;display:inline-block}
.logq[open]>summary .tw{transform:rotate(90deg)}
.logq>summary .hint{font-weight:400;color:#8a97a8;font-size:.8rem}
.logq .body{padding:4px 24px 18px}
.logq .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.logq label.f{display:flex;flex-direction:column;gap:3px;font-size:.72rem;color:#5b6b7f;
              text-transform:uppercase;letter-spacing:.03em}
.logq input,.logq select{padding:.45rem .6rem;border:1px solid #ddd;border-radius:6px;font-size:.9rem}
.logq input:focus,.logq select:focus{outline:none;border-color:#1a5c3a}
.logq .grow{flex:1;min-width:190px}
/* ⭐ PRODUCT PILLS, not a comma-separated text box. Eric: "For products, we need to have the
   pills with the different products that we can click on."
   🔴 THE OLD FIELD WAS NOT MERELY AWKWARD, IT COULD SILENTLY UNDER-RECORD A QUOTE: it mapped
   typed words through a lookup table that knew 17 spellings and had NO entry at all for
   Section 127, Lifestyle or Direct Billing -- so those three could not be logged by any
   spelling, and the message said "use names like COBRA, FSA..." as though the typist had
   guessed wrong. A fixed list cannot be misspelled and cannot omit a product. */
.logq .pills{display:flex;gap:6px;flex-wrap:wrap}
.logq .pp{border:1px solid #c8d2de;background:#fff;color:#12263f;border-radius:14px;
          padding:4px 12px;font-size:.82rem;cursor:pointer;font-family:inherit}
.logq .pp:hover{border-color:#1a5c3a;color:#1a5c3a}
.logq .pp.on{background:#1a5c3a;border-color:#1a5c3a;color:#fff;font-weight:600}
.logq .go{background:#1a5c3a;color:#fff;border:0;border-radius:6px;padding:.5rem 1.1rem;
          font-weight:600;font-size:.9rem;cursor:pointer;font-family:inherit}
.logq .msg{display:none;margin-top:10px;padding:9px 12px;border-radius:6px;font-size:.85rem}
/* 🔴 A NOWRAP WHITE-SPACE RULE ON A FLEX ROW THAT COULD NOT WRAP IS WHAT PUSHED THE SOURCES
   DROPDOWN OFF THE RIGHT OF THE PAGE. The count grew when it started reporting a total,
   could not shrink, and had nowhere to go, so it shoved its neighbours out of the window.
   ⭐ Shorter wording alone would not have fixed this -- it would only have postponed it
   until the next long string. The row wraps now, and the count may wrap within itself. */
.count{color:#888;font-size:.85rem;margin-left:auto;min-width:0}
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
/* An estimated date. One glyph and a tooltip -- Eric: "just need effective or estimated effective
   date." No annotation beside the value, because that is what overflowed the column. */
.est{color:#7d8a80;border-bottom:1px dotted #c3ccc6;cursor:help}
/* ⛔ NEVER BREAK A PERSON'S NAME MID-WORD. "Kandice" rendered as "Kandic / e" in a 7% column,
   which reads as a different name.
   ⚠️ NOT nowrap+ellipsis, which was the first attempt: with two reps that quietly TRUNCATES the
   second person away, and a name that is merely missing looks like a name that was never there.
   The column is wider, the separator carries spaces so there is somewhere legal to break, and
   overflow-wrap normal forbids breaking inside a word. */
td.repcell{overflow-wrap:normal;word-break:normal}
/* The Rep column holds multi-person values like "Gerard/Mark, Kandice/Joe" on the sold rows that
   come from aby_sales. The table is table-layout:fixed, so without this the text runs straight out
   of the column and over the Products chips -- which is what Eric photographed on 2026-08-22.
   Wrapping makes the row slightly taller and keeps every name, which is the honest trade. */
td.repcell{white-space:normal;overflow-wrap:anywhere;word-break:break-word}
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
.direct-tag{display:inline-block;padding:1px 8px;border-radius:10px;background:#eef2f7;
            color:#40566f;font-size:.78rem;font-weight:600;border:1px solid #d4dde8}
.direct-check{display:flex;align-items:center;gap:6px;font-size:.875rem;color:#33404f;
              cursor:pointer;padding:4px 0}
.direct-check input{cursor:pointer;margin:0}
.detail-actions{margin:0;padding:10px 16px;border-top:1px solid #e4eee8;
                display:flex;gap:8px;flex-wrap:wrap;align-items:center}
/* ⭐ The manual-quote sentence, lifted OUT of the detail-actions row (Eric, 2026-08-21). Inside that
   row it competed with the buttons for width and pushed "Move to Dead" onto its own line. It carries
   the top border now, so the row below it keeps its separation without a doubled rule.
   ⛔ NO BACKTICKS IN THIS BLOCK. It lives inside a template literal, so one would end the literal
   early and the parse error would land on an innocent line further down. The page checker caught
   exactly that here on the first attempt, which is what it was rebuilt for. */
.detail-manual-note{margin:0;padding:10px 16px 0;border-top:1px solid #e4eee8;
                    font-size:.82rem;color:#5b6b7f;max-width:52rem}
.detail-manual-note + .detail-actions{border-top:none;padding-top:8px}
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
${abyAdminNav('/admin')}
<div class="toolbar">
  <input type="text" id="search" placeholder="Search by client, broker, agency, quote number, or product…">
  <span class="count" id="count"></span>
  <select id="repFilter" style="margin-left:auto;padding:.4rem .5rem;border:1px solid #ddd;border-radius:6px;font-size:.85rem">
    <option value="">All reps</option>
  </select>
  <select id="showFilter" title="How much of the log to load" style="padding:.4rem .5rem;border:1px solid #ddd;border-radius:6px;font-size:.85rem">
    <option value="100">Most recent 100</option>
    <option value="200">Most recent 200</option>
    <option value="300" selected>Most recent 300</option>
    <option value="y2026">2026 quotes</option>
    <option value="y2025">2025 quotes</option>
    <option value="y2024">2024 quotes</option>
    <option value="all">All quotes</option>
  </select>
  <select id="ranByFilter" style="padding:.4rem .5rem;border:1px solid #ddd;border-radius:6px;font-size:.85rem">
    <option value="">All sources</option>
    <option value="ABY">ABY-run</option>
    <option value="dashboard">Broker - dashboard</option>
    <option value="direct">Broker - direct link</option>
    <option value="broker">Broker (either)</option>
  </select>
  <!-- Only visible on the Historic tab. Eric asked for the year drop-down to live there, and it
       is populated from the DATA rather than a hardcoded range, so the back catalog's real span
       (2008 onward) shows up without anybody remembering to widen a list. -->
  <select id="histYear" style="display:none;padding:.4rem .5rem;border:1px solid #ddd;border-radius:6px;font-size:.85rem">
    <option value="">All years</option>
  </select>
</div>
<!-- LOG A QUOTE. Moved off /admin/pipeline 2026-08-26 at Eric's instruction; that page is gone.
     ⭐ The Effective date is here and was NOT on the old form, which is why every hand-logged
     quote was invisible to /admin/today: Today builds its deadline rows from effective_date, and
     the old form never asked for one. A row you logged so you would remember to circle back could
     not appear on the page whose whole job is reminding you to circle back. -->
<details class="logq" id="logq">
  <summary><span class="tw">&#9656;</span> Log a quote
    <span class="hint">for rates sent by email rather than run through the tool</span></summary>
  <div class="body">
    <div class="row">
      <label class="f grow">Employer<input type="text" id="qEmployer" placeholder="Acme Manufacturing"></label>
      <label class="f grow">Agency<input type="text" id="qAgency" placeholder="Boyd &amp; Co Benefits"></label>
      <label class="f">Quoted on<input type="date" id="qWhen"></label>
      <label class="f">Effective<input type="date" id="qEffective"></label>
    </div>
    <div class="row">
      <label class="f grow">Broker<input type="text" id="qAgent" placeholder="Jane Smith (optional)"></label>
      <label class="f grow">Broker email<input type="email" id="qAgentEmail" placeholder="jane@boyd.com (optional)"></label>
      <label class="f">First-year value<input type="number" id="qValue" placeholder="optional"></label>
      <label class="f">Employees<input type="number" id="qHeads" placeholder="optional"></label>
    </div>
    <div class="row" style="align-items:flex-start">
      <label class="f" style="flex:1">Products
        <div class="pills" id="qPills">${QUOTE_PRODUCT_IDS.map(function (id) {
          var e = PRODUCT_SHORT[id];
          var lbl = (e && e.def) || id;
          return '<button type="button" class="pp" data-pid="' + id + '">' + lbl + '</button>';
        }).join('')}</div>
        <!-- ACA IS THE ONE PRODUCT WHOSE LABEL IS THE FORM SET, so it is the one that needs a
             follow-up question. Eric's own first hand-logged quote was an ACA one and this form
             had no way to record which set, so it went in as a bare "ACA Reporting".
             ⛔ NOT ASKING THE SERVICE TIER. Full versus self and the form-count band are a real
             distinction we genuinely do not know from an emailed quote, and a dropdown defaulting
             to one of them would write a guess that reads exactly like a recorded fact.
             It appears only when ACA is picked -- a question about a product nobody selected is
             noise, and answering it would attach a package to nothing. -->
        <div id="qAcaWrap" style="display:none;margin-top:8px">
          <span class="muted" style="font-size:.75rem;text-transform:uppercase;letter-spacing:.03em">Which ACA forms</span>
          <div class="pills" style="margin-top:4px">
            <button type="button" class="pp" data-aca="derivedB">1094/1095-B</button>
            <button type="button" class="pp" data-aca="derivedC">1094/1095-C</button>
          </div>
        </div>
      </label>
    </div>
    <div class="row">
      <label class="f">Rep<select id="qRep">${
        ['<option value="">&mdash;</option>'].concat(
          Object.keys(QUOTE_REP_NAMES).map(function (id) {
            return '<option value="' + id + '">' + QUOTE_REP_NAMES[id] + '</option>';
          })).join('')
      }</select></label>
      <label class="f">Status<select id="qStatus">
        <option value="P">Pending</option><option value="I">In process</option>
        <option value="S">Sold</option><option value="D">Dead</option>
        <option value="N">No Response</option></select></label>
      <label style="font-size:.85rem;align-self:flex-end;padding-bottom:.5rem">
        <input type="checkbox" id="qComm" checked style="margin-right:6px">Commission</label>
      <button class="go" id="qAdd" style="align-self:flex-end">Log it</button>
    </div>
    <div class="msg" id="qMsg"></div>
  </div>
</details>
<div class="tabs">
  <button class="tab active" data-status="P">Pending</button>
  <!-- IN PROCESS. Eric agreed this status on 2026-08-18 -- "ones that are buying but we don't
       have anything yet" -- and the BACKEND shipped it: P/I/S/D are accepted, a signed
       commitment sets I, and the pipeline queries already count it. The TAB was never added,
       so an I quote appeared in no tab at all and vanished from the log. One row was already
       in that state. A status with nowhere to show is worse than no status. -->
  <button class="tab" data-status="I">In process</button>
  <button class="tab" data-status="S">Sold</button>
  <button class="tab" data-status="D">Dead</button>
  <!-- NO RESPONSE. Eric, 2026-08-21: "one that we never got an answer on, but it wasnt a
       no. Its just one that was out there with no response. That seems different than
       dead, though the effect is probably the same." He is right, and it is the same
       distinction he already drew on the BROKER side between lost and withdrawn:
       collapsing them makes a book look like it loses business it never competed for.
       The tab goes in at the SAME TIME as the status, because the In process row above is
       what happens when it does not. -->
  <button class="tab" data-status="N">No Response</button>
  <!-- HISTORIC. Eric, 2026-08-22, after the 2009-2023 back-catalogue landed: "I don't think
       pending is the appropriate place for anything before 2026. I'm thinking historic would be
       better and have the year drop-down there."
       He is right, and the numbers make it obvious: 5,768 of 6,153 quotes are pre-2026, so
       Pending read 5,967 while the live pipeline is about 370. A tab whose count is 94% history
       answers no question anybody has.
       🔴🔴 IT IS A VIEW, NOT A STATUS, AND THAT DISTINCTION IS LOAD-BEARING. Writing an 'H' into
       the status column would be DISPOSITIONING THE BACK-BOOK BY DATE -- the exact thing Eric stopped on
       2026-08-21 ("don't automatically disposition them by date just yet"), because it would make
       a guess indistinguishable from a real answer. These quotes keep status 'P', which honestly
       means "nobody knows". Historic only changes WHERE YOU LOOK, and it is reversible by
       deleting this button. -->
  <button class="tab" data-view="historic">Historic</button>
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
        <!-- ⚠️ Rep was 7% and broke first names mid-word ("Kandic / e"). Effective was 12% and
             its cell is nowrap, so anything long overflowed sideways into Client rather than
             wrapping. Both widened; Products gives up the slack because its chips wrap cleanly. -->
        <col style="width:14%">
        <col style="width:13%">
        <col style="width:17%">
        <col style="width:18%">
        <col style="width:9%">
        <col style="width:19%">
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
          <th>Products</th><th>Run by</th>
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
// Historic is a VIEW, never a status. See the tab's comment: writing a status would be
// dispositioning the back-book by date, which Eric stopped for good reasons.
let historicView = false;
const HISTORIC_BEFORE = '2026';   // Eric: "anything before 2026". One string, one place to change.
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

// ⭐ WHAT THE TOOLBAR'S "how much" CONTROL MEANS, IN ONE PLACE.
// Eric, 2026-08-19, after the import left 1,495 quotes unreachable: "I think we should instead be
// able to decide from a drop-down how many to show - 100, 200, 300, 2024 quotes, 2025 quotes,
// 2026 quotes, all."
// ⚠️ A YEAR IS NOT A COUNT. Picking 2024 must fetch EVERY 2024 quote, so it carries a high limit
// of its own -- otherwise "2024 quotes" would quietly mean "the most recent 300 of them", which is
// the exact defect this control exists to remove.
function showQuery() {
  var v = (document.getElementById('showFilter') || {}).value || '300';
  if (v === 'all') return 'limit=20000';
  if (v.charAt(0) === 'y') return 'year=' + v.slice(1) + '&limit=20000';
  return 'limit=' + encodeURIComponent(v);
}

async function load(q) {
  q = q || '';
  const parts = [showQuery()];
  if (q) parts.push('q=' + encodeURIComponent(q));
  const url = '/api/quotes?' + parts.join('&');
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
// The month list for the effective-date dropdown.
// ⛔ MONTHS ONLY. A group plan starts on the 1st, so the day was never a question and a calendar
// made you navigate to answer one (Eric, 2026-08-21). The VALUE is still a full ISO date ending
// -01, because effectiveLabel() only formats ISO and the sort comparator reads the same field.
// ⚠️ RANGE: 2024 (the oldest real effective date) to ONE year past today. Eric, 2026-08-21:
// "I definitely don't need 2028 in there right now - that's overkill." A group is quoted at
// most a renewal ahead, so a second future year is scrolling past months nobody will pick.
// ⭐ It is a rolling window, so 2028 appears on its own once 2027 arrives -- no edit needed.
// ⭐ THE FIRST OPTION IS EMPTY AND IS THE DEFAULT. An empty value is ignored by the save, so
// opening a quote and pressing Save can never overwrite an estimate you did not mean to touch.
function effectiveOptions(current) {
  var cur = String(current == null ? '' : current).trim();
  var isIso = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(cur);
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var thisYear = new Date().getFullYear();
  var out = '<option value="">' + (isIso ? 'Change to...' : 'Set a date...') + '</option>';
  for (var y = 2024; y <= thisYear + 1; y++) {
    out += '<option disabled style="color:#9aa5b1">' + y + '</option>';
    for (var m = 0; m < 12; m++) {
      var val = y + '-' + (m < 9 ? '0' : '') + (m + 1) + '-01';
      out += '<option value="' + val + '"' + (val === cur ? ' selected' : '') + '>' +
             MON[m] + ' ' + y + '</option>';
    }
  }
  return out;
}

/**
 * The Rep cell.
 *
 * 🔴 IT USED TO TAKE THE FIRST SPACE-SEPARATED WORD, WHICH IS RIGHT FOR EXACTLY ONE SHAPE OF VALUE.
 * "Eric Johnson" -> "Eric" is what it was for. Everything else broke:
 *   - "(no rep folder)" rendered as the word "(no"     -- Eric, 2026-08-22: "there are a bunch
 *     that say (no and that's it". 89 rows.
 *   - "Gerard/Mark, Kandice/Joe" rendered as "Gerard/Mark," and ran out of the column.
 *
 * ⭐ A PARENTHESISED VALUE IS A PLACEHOLDER, NOT A PERSON. "(no rep folder)" records that the
 * 2009-2011 and 2014 source trees have no rep layer at all -- real provenance, but not somebody's
 * name, so it has no business in a column of names. It renders as the same em dash the column
 * already uses for an empty rep, which is what Eric suggested.
 * ⭐ A MULTI-PERSON VALUE KEEPS EVERY NAME. Truncating "Gerard/Mark, Kandice/Joe" to its first
 * word does not shorten a name, it names the wrong people. The full value is kept and the cell is
 * allowed to wrap; only a genuine "First Last" is shortened to the first name.
 */
function repCell(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s || s.charAt(0) === '(') return '<span class="muted">—</span>';
  // A plain two-word personal name shortens to the first name, as before. Anything carrying a
  // separator is a list of people and is shown whole.
  // ⭐ SPACES AROUND THE SEPARATOR, BECAUSE THAT IS WHERE A LINE MAY BREAK. Eric, 2026-08-22:
  // "Kandice/Joe wraps in the middle of Joe's name." A slash with no spaces is one long unbreakable
  // token, so the browser has nowhere legal to wrap and breaks mid-word instead -- which reads as a
  // different person's name. Giving it a space either side turns the separator into a break
  // opportunity and the names stay whole.
  if (/[,;/&]/.test(s)) {
    // No backslashes -- the page is a template literal and eats a lone one (TRAPS #248),
    // so the space class is written out as a character class.
    return esc(s.split(/[ ]*[/&][ ]*/).filter(function(x){ return x; }).join(' / '));
  }
  // ⚠️ NO BACKSLASH: this function lives inside adminHTML's template literal, which eats a lone
  // one, so a whitespace class here would arrive at the browser broken. Splitting on a space and
  // dropping the empties does the same job with no escape at all. TRAPS #248.
  var parts = s.split(' ').filter(function(x){ return x; });
  return esc(parts.length === 2 ? parts[0] : s);
}

function effectiveLabel(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var m = s.match(/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/);
  if (!m) return s;
  var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return MON[+m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1];
}

/**
 * The Effective cell.
 *
 * 🔴 ERIC, 2026-08-22, TWICE. First: "It just has a month not a month and year." My fix appended a
 * muted "announced 2025" beside the date. He came back: "I don't even understand what announced
 * 2025 means and don't understand why you don't have a year on some of the effective date lines"
 * and then "I don't like the note. just need effective or estimated effective date."
 *
 * ⭐⭐ HE IS RIGHT AND THE FIRST FIX ANSWERED THE WRONG QUESTION. He asked for a YEAR; I gave him a
 * provenance annotation and still left the date itself yearless. A reader wants a date in the date
 * column. The uncertainty belongs in HOW the date is marked, not in a second value beside it.
 *
 * ⛔ THE YEAR IS STILL NOT ASSERTED AS FACT. 298 of the 308 sold rows carry an effective date the
 * announcement email worded loosely -- "October 1", "Sep 2026 or later" -- so the year is taken
 * from when the sale was announced and the whole date is prefixed with a tilde, the same mark the
 * Clients page already uses for an estimated start. One glyph, no sentence.
 *
 * ⚠️ AND IT FIXES A LAYOUT BUG AT THE SAME TIME: the cell is class="nowrap" inside a
 * table-layout:fixed table, so the appended note could not wrap and OVERFLOWED into the Client
 * column instead. A short value cannot spill.
 */
function effectiveCell(q) {
  var s = String(q.effective_date == null ? '' : q.effective_date).trim();
  if (!s) return '';
  if (/[0-9]{4}/.test(s)) return esc(effectiveLabel(s));   // the source states a year
  var yr = String(q.created_at || '').slice(0, 4);
  if (!yr) return esc(effectiveLabel(s));
  // Borrow the year, mark the whole thing estimated.
  // ⛔ NO BACKSLASHES. This whole page is one template literal and a lone backslash is eaten by
  // it, leaving a regex that silently means something else (TRAPS #224). Character classes say
  // exactly the same thing and survive.
  var m = s.match(/^([A-Za-z]+)[.]?[ ]+([0-9]{1,2})$/);
  var label = m ? esc(effectiveLabel(yr + '-' + pad2(monthNum(m[1])) + '-' + pad2(m[2])))
                // No day, so no comma: "September 2026", not "September, 2026".
                : esc(s) + ' ' + esc(yr);
  return '<span class="est" title="Estimated. The record gave only ' + esc(s)
       + '; the year is taken from when the sale was announced.">~' + label + '</span>';
}

function monthNum(name) {
  var MON = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  var i = MON.indexOf(String(name || '').slice(0, 3).toLowerCase());
  return i < 0 ? 1 : i + 1;
}

function pad2(n) { return (Number(n) < 10 ? '0' : '') + Number(n); }

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
    var yr = String(q.created_at || '').slice(0, 4);
    if (historicView) {
      // Everything before 2026, whatever its status -- a 2014 quote marked Sold is still history.
      if (!(yr && yr < HISTORIC_BEFORE)) return false;
      var pick = document.getElementById('histYear').value;
      if (pick && yr !== pick) return false;
    } else {
      // ⭐ AND THE OTHER HALF OF THE CHANGE, WHICH IS THE POINT OF IT: the working tabs now EXCLUDE
      // history. Without this, Pending still reads 5,967 and moving the old rows to their own tab
      // would have achieved nothing.
      if (yr && yr < HISTORIC_BEFORE) return false;
      if ((q.status || 'P') !== activeTab) return false;
    }
    if (ranByFilter && !originMatches(q, ranByFilter)) return false;
    // Eric, 2026-08-18: "Or filter based on rep." Matched on the WHOLE stored name, never the
    // first word the Rep column happens to display -- two reps called Chris would otherwise
    // silently share a filter.
    if (repFilter && String(q.rep_name || '') !== repFilter) return false;
    return true;
  }));

  // ⚠️ THE TAB COUNTS MUST EXCLUDE HISTORY TOO, or Pending still says 5,967 while showing 370.
  // A count that disagrees with the list under it is worse than no count.
  var live = quotes.filter(function(q){
    var y = String(q.created_at || '').slice(0, 4);
    return !(y && y < HISTORIC_BEFORE);
  });
  ['P','S','D'].forEach(function(s) {
    var btn = document.querySelector('.tab[data-status="' + s + '"]');
    if (!btn) return;
    var n = live.filter(function(q){ return (q.status || 'P') === s; }).length;
    var label = {P:'Pending',I:'In process',S:'Sold',D:'Dead',N:'No Response'}[s];
    btn.innerHTML = label + (n ? ' <span class="tab-count">' + n + '</span>' : '');
  });

  var histRows = quotes.filter(function(q){
    var y = String(q.created_at || '').slice(0, 4);
    return y && y < HISTORIC_BEFORE;
  });
  var hb = document.querySelector('.tab[data-view="historic"]');
  if (hb) hb.innerHTML = 'Historic' +
    (histRows.length ? ' <span class="tab-count">' + histRows.length + '</span>' : '');

  // Populate the year list once, from the data.
  var hy = document.getElementById('histYear');
  if (hy && hy.options.length <= 1) {
    var years = {};
    histRows.forEach(function(q){ years[String(q.created_at || '').slice(0, 4)] = 1; });
    Object.keys(years).sort().reverse().forEach(function(y){
      if (!y) return;
      var o = document.createElement('option');
      o.value = y; o.textContent = y;
      hy.appendChild(o);
    });
    hy.addEventListener('change', function(){ expandedId = null; render(); });
  }

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
  // ⚠️ THE WORDING HAS TO MATCH WHAT WAS ASKED FOR. "Most recent 300 of 1795" is honest for a count;
  // it is a lie for a year, where the page holds ALL of that year and nothing is being withheld.
  // ⭐ SHORT ON PURPOSE. Eric, 2026-08-19: the long form "was pushing the sources dropdown off the
  // right side of the page". "300 of 1795" already SAYS that more exist, so the sentence explaining
  // it was carrying no information the numbers did not -- and the new dropdown beside it is a more
  // discoverable answer than a hint in prose.
  // ⚠️ NOTHING IS LOST: the full wording moves to the tooltip, so the meaning is one hover away.
  var showVal = (document.getElementById('showFilter') || {}).value || '300';
  var isYear = (showVal.charAt(0) === 'y');
  var head = truncated ? (filtered.length + ' of ' + serverTotal)
           : isYear    ? (filtered.length + '  · ' + showVal.slice(1))
           :             (filtered.length + ' quote' + (filtered.length !== 1 ? 's' : ''));
  var el = document.getElementById('count');
  el.textContent = filtered.length
    ? (head + (parts.length > 1 ? '  (' + parts.join(' · ') + ')' : ''))
    : '';
  el.title = !filtered.length ? ''
    : truncated ? ('Showing the ' + quotes.length + ' most recent of ' + serverTotal +
                   ' quotes. Load more from the dropdown, or search to reach any of them.')
    : isYear    ? ('Every quote run in ' + showVal.slice(1) + '.')
    :             ('Every quote that matches.');
  if (!filtered.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No quotes found.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  for (const q of filtered) {
    // A SALE WITH NO QUOTE carries the products as the EMAIL worded them, in its own field,
    // because there is no quote-shaped product list behind it. Rendered as plain labels so the
    // row reads like the others without pretending to be one.
    const products = q.is_sale_without_quote
      ? String(q.sold_products || '').split(/[,&/]| and /).map(function (t) { return t.trim(); })
          .filter(Boolean)
      : parseProducts(q.products);
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
    // ⭐ DIRECT READS AS AN ANSWER, NOT AS A GAP (Eric, 2026-08-21). A blank broker plus a dash
    // looks like something nobody got round to filling in; this says somebody decided.
    // ⚠️ The fields stay EDITABLE underneath -- marking a quote direct does not erase a broker
    // name, and un-ticking it brings the row straight back. The label destroys nothing.
    const brokerCell = Number(q.direct)
      ? '<span class="direct-tag" title="ABY worked directly with the employer on this quote. It does not mean the employer has no broker.">Direct</span>'
      : inplace('broker_name', q.broker_name, '—') +
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
    // EVERY PRODUCT IS SHOWN. There is no "+N more" any more.
    // Eric, 2026-08-21: "How is that helpful if we don't know what the 'one more' is?" He was right,
    // and the honest reading is that the count was hiding a naming problem rather than a space one.
    // The full list WAS in a title tooltip, which is invisible on a tablet, does not print, and
    // requires knowing to hover -- so in practice the row said "there is something here" and stopped.
    // The cut to two chips was a reasonable response to labels running to 82 characters
    // ("White Glove: Full SPD, Section 125 plan with POP/HSA testing, and Form 5500 filing").
    // With PRODUCT_SHORT filled in, the labels are short enough that the reason to truncate is gone.
    // A quote with many products now makes its row slightly taller, which is the honest outcome.
    const chipHtml = products.map(function(p){
      return '<span class="chip" title="' + esc(p) + '">' + esc(shortLabel(p)) + '</span>';
    }).join('');

    row.innerHTML =
      // 🔴 THE QUOTE NUMBER CARRIES *THREE* COLUMNS' WORTH: the state, the commission basis, and
      // the created date. Eric: "we don't need a commission column since it already has NC",
      // "we don't really need the state if it's the beginning of the quote number", and the
      // created date wrapped onto three lines while restating TX260805. All three columns are gone
      // and no fact went with them. The full timestamp stays in the tooltip.
      '<td><span class="qnum" title="Run ' + esc(when.date) +
        (when.time ? ' at ' + esc(when.time) : '') + '">' +
        (esc(q.quote_number) || '—') + '</span></td>' +
      '<td class="nowrap">' + (effectiveCell(q) || '<span class="muted">—</span>') + '</td>' +
      '<td>' + inplace('client_name', q.client_name, 'not stated') + '</td>' +
      '<td>' + brokerCell + '</td>' +
      '<td class="repcell">' + repCell(q.rep_name) + '</td>' +
      '<td><div style="display:flex;flex-wrap:wrap;gap:4px;align-items:flex-start">' + chipHtml + '</div></td>' +
      '<td>' +
        // Three-way origin in the column that already existed, rather than a new column --
        // a new one would need every colspan widened, which is the defect H nearly shipped.
        '<span class="origin" style="' + ORIGIN_STYLE[originOf(q)] + '" title="' +
          (originOf(q) === 'dashboard' ? 'Handed over from the BenefitLab dashboard (carries a client id)'
           : originOf(q) === 'direct' ? 'Run on the shared link - broker typed their own details'
           : 'Run by ABY from the admin') + '">' + ORIGIN_LABEL[originOf(q)] + '</span>' +
        (q.adjustment ? '<br><span style="font-size:.72rem;color:#b8860b" title="' + esc(q.adjustment_note || "") + '">price adjusted</span>' : '') +
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

  // 🔴🔴 A QUOTE WE CANNOT REPRODUCE MUST NOT OFFER "VIEW QUOTE".
  // "View" does not open a stored document -- there isn't one. It RE-RUNS THE PRICING ENGINE from
  // the inputs on the row. For a quote that came from the spreadsheet, or was logged by hand, the
  // product entries carry no participant counts, so the engine would price it at TODAY's rates and
  // hand back a document carrying the ORIGINAL 2024 quote number. It looks exactly like the quote
  // that was sent. It is not, and it could be forwarded to a client.
  // ⭐ Eric, 2026-08-19: "for all of the ones that were manually run ... we can't actually show them
  // the quote ... the rates wouldn't be good anymore."
  // ⚠️ THE TEST IS THE INPUTS, NOT THE SOURCE TAG. What makes a row un-reproducible is having no
  // basis to reprice it -- which is equally true of an import and of a hand-logged quote, and would
  // stay true of any future origin that records what was sold without recording what it was priced on.
  var reproducible = false;
  try {
    var parsedForView = JSON.parse(q.products || '[]');
    reproducible = Array.isArray(parsedForView) && parsedForView.some(function (p) {
      return p && p.inputs && Object.keys(p.inputs).length > 0;
    });
  } catch (e) { reproducible = false; }

  // Re-quoting is still useful -- it prefills the client, broker and products -- but it must MINT A
  // NEW NUMBER rather than inherit the old one, or a fresh quote goes out wearing a 2024 identity.
  var freshState = JSON.stringify({
    clientName: q.client_name || '', effectiveDate: '',
    brokerName: q.broker_name || '', brokerAgency: q.broker_agency || '',
    brokerPhone: q.broker_phone || '', brokerEmail: q.broker_email || '',
    commissionIncluded: !!q.commission_included, repName: q.rep_name || '',
    products: q.products || '[]'
  });
  var freshUrl = '/?rerun=' + encodeURIComponent(freshState);
  var curStatus = q.status || 'P';
  // I sits between P and S deliberately: it is the order the work happens in, and the buttons
  // read as a path rather than a set of unrelated destinations.
  var moveTargets = ['P','I','S','D','N'].filter(function(s){ return s !== curStatus; });
  var moveLabels = {P:'Pending',I:'In process',S:'Sold',D:'Dead',N:'No Response'};
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
      // ⭐ THE DIRECT TICK SITS WITH THE BROKER FIELDS because that is the question it answers:
      // there is no broker on this one, and that is deliberate rather than unfinished.
      // ⛔ Not a free-text field. Eric had two of these in a day; it has to be one click.
      '<div class="detail-item"><label>Broker</label>' +
        '<label class="direct-check" onclick="event.stopPropagation()">' +
          '<input type="checkbox" data-edit-bool="direct" onchange="toggleDirectFields(this)"' + (Number(q.direct) ? ' checked' : '') + '> ' +
          'Client came to us directly' +
        '</label>' +
      '</div>' +
      // ⭐ BROKER NAME AND AGENCY, SHOWN ONLY WHEN DIRECT IS TICKED (Eric, 2026-08-21):
      // "it could be a direct client but we later learn the broker's info. better to include it
      // than not." Ticking Direct hides the in-place editors in the ROW, so without these there
      // was nowhere left to record a broker once you found out who it was.
      // ⛔ HIDDEN OTHERWISE, ON PURPOSE. Eric, 2026-08-18: "I don't like how everything shows up
      // twice - the group name, broker name, etc." When Direct is off the row already edits both
      // fields, and two live editors for one column is how one save quietly reverts the other.
      // ⚠️ The toggle is live rather than on reload, so ticking the box reveals them immediately.
      '<div class="detail-item direct-only"' + (Number(q.direct) ? '' : ' hidden') + '>' +
        '<label>Broker name</label>' +
        '<input data-edit="broker_name" value="' + esc(q.broker_name || '') + '" placeholder="if you learn it later" ' +
          'onclick="event.stopPropagation()" style="width:100%;padding:4px 6px;border:1px solid #d7e3da;' +
          'border-radius:5px;font:inherit;font-size:.875rem;background:#fff"></div>' +
      '<div class="detail-item direct-only"' + (Number(q.direct) ? '' : ' hidden') + '>' +
        '<label>Agency</label>' +
        '<input data-edit="broker_agency" value="' + esc(q.broker_agency || '') + '" placeholder="if you learn it later" ' +
          'onclick="event.stopPropagation()" style="width:100%;padding:4px 6px;border:1px solid #d7e3da;' +
          'border-radius:5px;font:inherit;font-size:.875rem;background:#fff"></div>' +
      // ⭐ EFFECTIVE DATE, EDITABLE (Eric, 2026-08-21): "We have so many that say Sept 2026 or
      // later and it would be nice to be able to put the right effective date if we learn it."
      // ⛔ A MONTH DROPDOWN, NOT A CALENDAR. Eric: "I do not want a calendar date picker because
      // it's always the first of the month. Drop-down is easier." A group plan starts on the 1st,
      // so a calendar makes you navigate to pick a day that was never in question.
      // ⚠️ IT STILL STORES A FULL ISO DATE (YYYY-MM-01). effectiveLabel() only formats ISO and the
      // sort comparator reads the same field, so storing a "Sep 2026" phrase would print raw and
      // sort as text. The dropdown is the INPUT shape; the stored shape does not change.
      // ⚠️ The list cannot show an estimate, so the CURRENT VALUE IS PRINTED BESIDE IT -- otherwise
      // the field reads empty on most of the book and looks as though nothing is recorded.
      '<div class="detail-item"><label>Effective date</label>' +
        '<select data-edit="effective_date" onclick="event.stopPropagation()" ' +
          'style="width:100%;padding:4px 6px;border:1px solid #d7e3da;border-radius:5px;' +
          'font:inherit;font-size:.875rem;background:#fff">' +
          effectiveOptions(q.effective_date) +
        '</select>' +
        (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(q.effective_date || '')) || !q.effective_date ? '' :
          '<div style="font-size:.75rem;color:#7b8794;margin-top:3px">now: ' + esc(q.effective_date) +
          ' — choosing a month replaces it</div>') +
      '</div>' +
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
    // ⭐ ERIC, 2026-08-21: the manual-quote sentence is RIGHT but was too long, and it sat INSIDE the
    // button row — so it ate the width and pushed "Move to Dead" onto a line of its own, away from
    // the other buttons. ✅ Two changes, and the second is the one that actually holds: the sentence
    // is shortened, AND it is lifted out of the detail-actions row into its own line above.
    // ⚠️ SHORTENING ALONE WOULD NOT HAVE FIXED IT. That row is flex-wrap:wrap, so any text sharing
    // it competes with the buttons for space and the break point just moves to a different window
    // width. With the note out of the row, the buttons are the only things in it and stay together
    // at every width.
    // ⛔ NO BACKTICKS ANYWHERE IN THIS COMMENT — it sits inside the adminHTML template literal.
    // ⛔ What must NOT be lost from the wording: re-quoting prices at CURRENT rates and mints a NEW
    // number. That is the sentence stopping somebody reading "Quote this again" as "reprint this".
    (reproducible
      ? ''
      : '<div class="detail-manual-note">Quoted outside the tool, so there is nothing to open. Quoting it again uses <strong>current</strong> rates and gets a new number.</div>') +
    '<div class="detail-actions">' +
      (reproducible
        ? '<a href="' + rerunUrl + '&readonly=1" target="_blank" style="display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;background:#e8f4ec;color:#1a5c3a;border-radius:6px;text-decoration:none;font-size:.85rem;font-weight:600;border:1px solid #b8d9c4">View Quote ↗</a>' +
          '<a href="' + rerunUrl + '" target="_blank" style="display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;background:white;color:#555;border-radius:6px;text-decoration:none;font-size:.85rem;font-weight:600;border:1px solid #ddd">Re-run Quote ↗</a>'
        : '<a href="' + freshUrl + '" target="_blank" style="display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;background:white;color:#555;border-radius:6px;text-decoration:none;font-size:.85rem;font-weight:600;border:1px solid #ddd">Quote this again ↗</a>') +
      // COPY A LINK instead of sending the HTML file (F-368). Only for a quote we can actually
      // reproduce -- the same test View Quote uses, and for the same reason: a link that
      // re-prices a 2024 quote at today's rates looks exactly like the quote that was sent.
      (reproducible
        ? '<button onclick="event.stopPropagation();shareQuote(this.dataset.id,this)" data-id="' + q.id + '" style="display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;background:white;color:#1a5c3a;border-radius:6px;font-size:.85rem;font-weight:600;border:1px solid #b8d9c4;cursor:pointer">Copy share link</button>'
        : '') +
      // ⭐ A TO-DO ABOUT THIS QUOTE, filed against it. Eric, 2026-08-26: "generate the to-do
      // within the actual opportunity / quote and have it show up on the calendar for a
      // particular day/time."
      // ⛔ IT NAVIGATES RATHER THAN POSTING. Typing the to-do here would mean a second add
      // form, in a second place, with its own copy of every field -- and the one on Today already
      // asks for the kind, the day and the time. This carries the attachment TO that form.
      '<a href="/admin/today?attach=quote&attachId=' + encodeURIComponent(q.quote_number || q.id) +
        '&attachLabel=' + encodeURIComponent((q.client_name || '') + ' · ' + (q.quote_number || '')) +
        '" onclick="event.stopPropagation()" style="display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .85rem;background:white;color:#555;border-radius:6px;text-decoration:none;font-size:.85rem;font-weight:600;border:1px solid #ddd">Add a to-do</a>' +
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

// WHAT A PRODUCT IS CALLED IN THE QUOTE LOG. Display only -- the full names in products.js are what
// a CLIENT reads on a proposal and are untouched by anything here (Eric, 2026-08-21: "In the log").
//
// Keyed on the product ID, never the display name, so renaming a product on a proposal cannot
// silently break its label here.
//
// TITLE CASE THROUGHOUT, on Eric's instruction: "Can you please capitalize all words: Direct Bill,
// for instance. Or Plan Docs."
// ONE DEFINITION, SERVED TO BOTH SIDES. These used to live here, inside the page, so the SERVER
// could not see them -- which is why product search could not use the labels. They now sit at
// module scope and the browser copy is generated from that same object below.
// Do not paste a second copy in here: two label maps that drift is the failure this avoids.
const PRODUCT_SHORT = ${JSON.stringify(PRODUCT_SHORT)};
const PRODUCT_NAME_TO_ID = ${JSON.stringify(PRODUCT_NAME_TO_ID)};
${shortProductName.toString()}

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
function toggleDirectFields(cb) {
  var host = cb.closest('.detail-inner');
  if (!host) return;
  Array.prototype.forEach.call(host.querySelectorAll('.direct-only'), function (el) {
    if (cb.checked) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
  });
}

async function saveQuoteEdits(id) {
  var msg  = document.querySelector('[data-note-msg="' + id + '"]');
  var host = document.querySelector('.detail-inner[data-qid="' + id + '"]');
  var box  = document.getElementById('qnote-' + id);
  if (msg) { msg.style.color = '#5b6b7f'; msg.textContent = 'Saving...'; }

  var payload = {};
  if (host) Array.prototype.forEach.call(host.querySelectorAll('[data-edit]'), function (inp) {
    // ⛔ A HIDDEN FIELD IS NOT AN ANSWER. The broker name and agency inputs only apply to a DIRECT
    // quote; when the box is unticked the ROW owns those columns, and submitting the panel's copy
    // as well would let a stale value overwrite whatever was just typed in the row.
    var wrap = inp.closest ? inp.closest('.direct-only') : null;
    if (wrap && wrap.hasAttribute('hidden')) return;
    payload[inp.getAttribute('data-edit')] = inp.value;
  });
  // ⚠️ CHECKBOXES CANNOT RIDE THE [data-edit] PATH. That reader takes .value, which on a checkbox
  // is the literal string "on" whether it is ticked or not -- so an unticked box would have saved
  // as truthy and there would be no way to turn Direct back off.
  // ⛔ NO BACKTICKS IN worker.js COMMENTS. Fourth time in one day; the page checker caught this one.
  if (host) Array.prototype.forEach.call(host.querySelectorAll('[data-edit-bool]'), function (cb) {
    payload[cb.getAttribute('data-edit-bool')] = cb.checked;
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

async function shareQuote(id, btn) {
  var original = btn.textContent;
  btn.textContent = 'Minting...';
  try {
    var r = await fetch('/api/quotes/' + id + '/share', { method: 'POST' });
    var d = await r.json().catch(function () { return {}; });
    if (!r.ok) {
      // SAY WHY. A refusal here is a real answer -- the quote carries a price adjustment, so a
      // link would show the employer a HIGHER figure than the document. Collapsing that into
      // 'something went wrong' would send somebody hunting for a bug that is not there.
      btn.textContent = original;
      alert(d.message || 'Could not create a link for this quote.');
      return;
    }
    var url = d.url || (location.origin + '/q/' + d.token);
    var copied = false;
    try { await navigator.clipboard.writeText(url); copied = true; } catch (e) { copied = false; }
    btn.textContent = copied ? 'Link copied' : 'Link ready';
    // If the clipboard is unavailable the link must still be GETTABLE, or the button did
    // nothing a human can act on.
    if (!copied) prompt('Copy this link:', url);
    setTimeout(function () { btn.textContent = original; }, 2500);
  } catch (e) {
    btn.textContent = original;
    alert('Could not create a link for this quote.');
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

// The choice is remembered: somebody who works in 2025 all morning should not re-pick it on every
// visit, and it is cheap to store.
(function () {
  var sel = document.getElementById('showFilter');
  if (!sel) return;
  var saved = localStorage.getItem('abyShow');
  if (saved) {
    var ok = Array.prototype.some.call(sel.options, function (o) { return o.value === saved; });
    if (ok) sel.value = saved;
  }
  sel.addEventListener('change', function () {
    localStorage.setItem('abyShow', sel.value);
    expandedId = null;
    load(document.getElementById('search').value.trim());
  });
})();

let searchTimer;
document.getElementById('search').addEventListener('input', function(e) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function() {
    expandedId = null;
    load(e.target.value.trim());
  }, 300);
});

load();

// ── LOG A QUOTE ────────────────────────────────────────────────────────────────────────────
// Moved here from /admin/pipeline, 2026-08-26, and the page it came from no longer exists.
//
// ⭐ THE PRODUCTS ARE PILLS, AND THE STATE LIVES IN THE DOM rather than in a parallel array.
// A second list of "which are selected" is one more thing that can disagree with the buttons
// the user is looking at; reading the .on class back off them cannot.
(function () {
  var pills = document.getElementById('qPills');
  if (!pills) return;
  var acaWrap = document.getElementById('qAcaWrap');
  pills.addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('.pp') : null;
    if (!b || !pills.contains(b)) return;
    b.classList.toggle('on');
    syncAca();
  });
  // The form-set buttons are a CHOICE OF ONE, so picking either clears the other -- unlike the
  // product pills, which are a set. Pressing the active one clears it back to unknown, because
  // "I do not know which" has to stay reachable after a misclick.
  acaWrap.addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('.pp') : null;
    if (!b || !acaWrap.contains(b)) return;
    var was = b.classList.contains('on');
    Array.prototype.forEach.call(acaWrap.querySelectorAll('.pp'), function (x) { x.classList.remove('on'); });
    if (!was) b.classList.add('on');
  });
  function syncAca() {
    var on = !!pills.querySelector('.pp.on[data-pid="aca"]');
    acaWrap.style.display = on ? '' : 'none';
    // ⛔ CLEARED WHEN ACA IS SWITCHED OFF. Left set, it would be re-applied silently if ACA were
    // switched back on later in a different quote, which is a value nobody chose.
    if (!on) Array.prototype.forEach.call(acaWrap.querySelectorAll('.pp'), function (x) { x.classList.remove('on'); });
  }

  function chosenProducts() {
    return Array.prototype.map.call(pills.querySelectorAll('.pp.on'), function (b) {
      return b.getAttribute('data-pid');
    });
  }
  function say(text, good) {
    var m = document.getElementById('qMsg');
    m.textContent = text;
    m.style.display = 'block';
    m.style.background = good ? '#e8f4ec' : '#fdecec';
    m.style.color = good ? '#1a5c3a' : '#a12622';
  }

  document.getElementById('qAdd').addEventListener('click', async function () {
    var employer = document.getElementById('qEmployer').value.trim();
    // ⛔ ASKED FOR HERE RATHER THAN LET THE SERVER REFUSE IT. The server still checks -- it is the
    // only guard that counts -- but a round trip to be told the first field is empty is a worse
    // sentence than the same one shown instantly.
    if (!employer) { say('Which employer?', false); return; }
    var products = chosenProducts();
    if (!products.length) { say('Pick at least one product.', false); return; }

    var btn = this;
    btn.disabled = true;
    var r, d;
    try {
      r = await fetch('/api/admin/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employer: employer,
          agency: document.getElementById('qAgency').value.trim(),
          quotedOn: document.getElementById('qWhen').value,
          effectiveDate: document.getElementById('qEffective').value,
          agentName: document.getElementById('qAgent').value.trim(),
          agentEmail: document.getElementById('qAgentEmail').value.trim(),
          products: products,
          acaForms: (acaWrap.querySelector('.pp.on') || {}).getAttribute
            ? acaWrap.querySelector('.pp.on').getAttribute('data-aca') : '',
          rep: document.getElementById('qRep').value,
          status: document.getElementById('qStatus').value,
          commissionIncluded: document.getElementById('qComm').checked,
          firstYearValue: document.getElementById('qValue').value,
          employeeCount: document.getElementById('qHeads').value
        })
      });
      d = await r.json().catch(function () { return {}; });
    } catch (netErr) {
      btn.disabled = false;
      // ⛔ A NETWORK FAILURE MUST NOT READ AS A REFUSAL. "Could not log it" would have the typist
      // change the form; nothing about the form is wrong.
      say('Could not reach the server, so nothing was saved: ' + netErr.message, false);
      return;
    }
    btn.disabled = false;
    if (!r.ok) { say(d.error || 'Could not log it.', false); return; }

    say('Logged as ' + d.quoteNumber + '. It is in the list below.', true);
    ['qEmployer', 'qAgency', 'qAgent', 'qAgentEmail', 'qValue', 'qHeads'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    Array.prototype.forEach.call(pills.querySelectorAll('.pp.on'), function (b) {
      b.classList.remove('on');
    });
    syncAca();
    // ⭐ THE LIST RELOADS, which is the whole reason this belongs on THIS page. On the old screen
    // you logged a quote and then had to go somewhere else to see whether it had landed.
    // ⚠️ It reloads with the CURRENT search, not with a cleared one -- clearing the box would look
    // like the search had broken itself.
    expandedId = null;
    load(document.getElementById('search').value.trim());
  });
})();

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
      // Historic is a VIEW over the same rows, not a status -- see the tab's own comment.
      historicView = (this.dataset.view === 'historic');
      document.getElementById('histYear').style.display = historicView ? '' : 'none';
      if (!historicView) activeTab = this.dataset.status;
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

  // 🔴🔴 THE ABY-ONLY REPS LIVE HERE, IN THE OVERLAY, AND NOWHERE ELSE.
  // Eric, 2026-08-19: "they should be in the dropdown as well for the ABY tool (when we are
  // running the quotes), but for outside brokers it should just [be] Niels and me to choose from."
  // ⛔ THE FILE assets/js/data/reps.js SHIPS IN THE PUBLIC BUNDLE -- anyone added there is offered to
  // every broker on the shared link. This file is served only to an authenticated ABY session,
  // which is exactly the distinction Eric drew.
  // ⚠️ THIS RUNS AT PARSE TIME AND THAT IS WHY IT WORKS: app.js builds the rep cards on
  // DOMContentLoaded (app.js:916), which fires after every script has been parsed. So the list is
  // already complete when the cards are drawn, and nothing has to be re-rendered.
  // ⭐ They are ABY staff who are NOT in sales -- account managers and others who field quote
  // requests from brokers and clients. No job title is set because Eric said "many but not all are
  // account managers", and guessing one each would put a wrong job title on a client proposal.
  var ABY_INTERNAL_REPS = [
    { id: 'sara',   name: 'Sara Wallace',    title: '', phone: '(817) 510-5843', email: 'sara@abybenefits.com'   },
    { id: 'mark',   name: 'Mark Tawadrous',  title: '', phone: '(817) 510-5841', email: 'mark@abybenefits.com'   },
    { id: 'martha', name: 'Martha Martinez', title: '', phone: '(817) 510-5838', email: 'martha@abybenefits.com' },
    { id: 'sam',    name: 'Sam Kimbrell',    title: '', phone: '(817) 510-5845', email: 'sam@abybenefits.com'    },
    { id: 'joe',    name: 'Joe Schoppe',     title: '', phone: '(817) 510-5839', email: 'joe@abybenefits.com'    },
    { id: 'katie',  name: 'Katie Tawadrous', title: '', phone: '(817) 510-5846', email: 'katie@abybenefits.com'  },
    { id: 'gage',   name: 'Gage Bridges',    title: '', phone: '(817) 510-5847', email: 'gage@abybenefits.com'   }
  ];
  if (window.ABYQuote && Array.isArray(window.ABYQuote.salesReps)) {
    ABY_INTERNAL_REPS.forEach(function (r) {
      var already = window.ABYQuote.salesReps.some(function (x) { return x.id === r.id; });
      if (!already) window.ABYQuote.salesReps.push(r);
    });
  }

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
      // A typed PER-PARTICIPANT rate. Unlike a typed total this survives a change in
      // headcount, which is the whole reason it exists: the price is rate times count,
      // so a new count re-prices at the agreed rate rather than at the standard one.
      // THE STANDARD MINIMUM STILL APPLIES, and that is a decision rather than an
      // oversight: the floor exists because a small group costs the same to administer.
      // But it is never applied silently -- when the floor is what is being charged the
      // breakdown says so, because a typed rate that appears to do nothing reads as a
      // broken box.
      if (p.monthlyRate != null && !isNaN(p.monthlyRate) && copy.monthlyFee && copy.monthlyFee._m) {
        var meta2 = copy.monthlyFee._m;
        var cnt = meta2.count;
        if (cnt != null && !isNaN(cnt)) {
          // THE FLOOR IS NOT ALWAYS meta.min. Below the first per-participant band the
          // standard book charges a FLAT amount -- FSA under 20 people is 85 dollars, a
          // flat tier whose min is zero -- so a naive rate times count made a 10-person
          // group 35 dollars and quietly undercut the small-group floor by more than half.
          // A flat tier IS that floor, wearing a different name, so treat it as one.
          // Somebody who really does mean 35 can type it into Monthly admin; both
          // intentions stay expressible, and neither happens by accident.
          var floor = (meta2.kind === 'flat') ? (meta2.rate || 0) : (meta2.min || 0);
          var raw = p.monthlyRate * cnt;
          meta2.rate = p.monthlyRate;
          meta2.kind = 'pppm';
          copy.monthlyFee.amount = Math.round(Math.max(raw, floor) * 100) / 100;
          // money() drops the pence, and a RATE is quoted to the cent -- it printed the
          // agreed 3.50 as "3.5", which reads like a typo on an internal record.
          var bd = rateMoney(p.monthlyRate) + ' per participant per month (agreed rate)';
          if (floor > 0 && floor > raw) {
            bd += ' - the standard minimum of ' + money(floor) + ' per month applies at this headcount';
          }
          copy.monthlyFee.breakdown = bd;
          copy.monthlyFee.tierLabel = '';
          copy.monthlyFee.adjusted = true;
        }
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
    var pr = (adj.prices || {}).monthlyRate;
    if (pr != null && !isNaN(pr)) parts.push('Per participant ' + rateMoney(pr));
    return parts.length ? ('Price set on ' + scope + ': ' + parts.join(', ')) : '';
  }

  function money(n) { return (n < 0 ? '-$' : '$') + Math.abs(n); }
  // Rates carry cents; totals do not. Kept separate rather than making money() always
  // show two places, because "$3,837.00" on a fee line is noise.
  function rateMoney(n) { return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2); }

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
      readPrice('abySetPerPart', 'Per participant', 'monthlyRate');
      if (negatives.length) {
        window.ABY_ADJUSTMENT = null;
        summary.textContent = 'Not applied — a set price cannot be negative (' + negatives.join(', ') +
          '). To take money OFF the standard price, use Percent or Flat, where a negative amount is a discount.';
        return;
      }
      // Eric, 2026-08-21, describing what he actually adjusts: "if we lower the per
      // employee fee ... it would survive if they adjust the number of employees". A typed
      // monthly TOTAL cannot do that -- 200 dollars for 50 people is still 200 for 78 -- so
      // the per-participant box exists to make his rule expressible.
      // Typing BOTH is refused rather than resolved: either answer would be a price nobody
      // chose, and this panel already refuses instead of guessing (see the negative check).
      if (prices.monthlyFee != null && prices.monthlyRate != null) {
        window.ABY_ADJUSTMENT = null;
        summary.textContent = 'Not applied - you have typed both a monthly total and a per-participant rate, and they can disagree. Type one: the total fixes the monthly figure, the rate re-prices when the headcount changes.';
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
      summary.textContent = 'No price adjustment. State: ' + window.ABY_STATE + '. Quotes run at standard ' + window.ABY_STATE + ' pricing.';
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
      '<p style="margin:0 0 12px;color:#4a5568;font-size:12.5px;">State pricing and price adjustments. An adjustment changes the quoted price; the adjustment itself is recorded internally and never appears on the client proposal or PDF.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">' +
        '<label style="font-size:12px;color:#143c73;">State<br><select id="abyState" style="padding:6px;min-width:150px;">' + stateOpts + '</select></label>' +
        '<label style="font-size:12px;color:#143c73;">Price Adjustment<br><select id="abyMode" style="padding:6px;"><option value="none">None</option><option value="percent">Percent (%)</option><option value="flat">Flat ($)</option><option value="set">Set price ($)</option></select></label>' +
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
        '<label style="font-size:12px;color:#143c73;">Per participant<br><input id="abySetPerPart" type="number" step="0.01" min="0" placeholder="unchanged" style="padding:6px;width:130px;"></label>' +
      '</div>' +
      '<div id="abySummary" style="margin-top:10px;font-size:12.5px;color:#143c73;font-weight:bold;"></div>';

    if (host === form && form.parentNode) form.parentNode.insertBefore(panel, form);
    else host.insertBefore(panel, host.firstChild);

    ['abyState', 'abyMode', 'abyAmt', 'abyScope', 'abyNote',
     'abySetSetup', 'abySetRenewal', 'abySetAnnual', 'abySetMonthly', 'abySetPerPart'].forEach(function (id) {
      var el = panel.querySelector('#' + id);
      el.addEventListener('input', function () { recompute(panel); });
      el.addEventListener('change', function () { recompute(panel); });
    });
    recompute(panel);
  }

  // --- Broker prefill, for an ABY session only (F-366) -------------------------
  //
  // Eric: "so that when we want to quote for them we could populate that stuff automatically
  // instead of us having to start from scratch every time."
  //
  // Type two characters of a name, an email or an agency into the broker box and pick the
  // person. Name, email, phone and agency fill together, because they are one fact about one
  // person and filling them one at a time is the retyping this removes.
  //
  // ⛔ IT LIVES IN THE ABY OVERLAY, which is served only to an authenticated session, and the
  // endpoints behind it are admin-gated as well. A public "who is this email" box is a
  // harvesting surface; Eric asked for it on the quotes ABY runs, so that is where it is.
  //
  // ⚠️ IT NEVER OVERWRITES SOMETHING ALREADY TYPED unless the user picks a suggestion. Picking
  // is a deliberate act; typing is not, and a box that rewrites itself while you work is worse
  // than one that stays empty.
  function attachDirectoryPrefill() {
    var nameEl   = document.querySelector('[name="brokerName"]');
    var emailEl  = document.querySelector('[name="brokerEmail"]');
    var phoneEl  = document.querySelector('[name="brokerPhone"]');
    var agencyEl = document.querySelector('[name="brokerAgency"]');
    if (!nameEl || !emailEl) return;

    var box = document.createElement('div');
    box.className = 'aby-suggest';
    box.style.cssText = 'position:absolute;z-index:60;background:#fff;border:1px solid #b8cddd;' +
      'border-radius:6px;box-shadow:0 6px 20px rgba(20,60,115,.14);min-width:280px;display:none;' +
      'max-height:260px;overflow:auto;font-size:13px;';
    document.body.appendChild(box);

    var timer = null, activeEl = null;

    function hide() { box.style.display = 'none'; activeEl = null; }

    function place(el) {
      var r = el.getBoundingClientRect();
      box.style.left = (r.left + window.scrollX) + 'px';
      box.style.top = (r.bottom + window.scrollY + 4) + 'px';
      box.style.minWidth = Math.max(280, r.width) + 'px';
    }

    function row(html, onPick) {
      var d = document.createElement('div');
      d.style.cssText = 'padding:7px 10px;cursor:pointer;border-bottom:1px solid #eef3f7;';
      d.innerHTML = html;
      d.addEventListener('mouseenter', function () { d.style.background = '#f2f7fb'; });
      d.addEventListener('mouseleave', function () { d.style.background = '#fff'; });
      // mousedown, not click: a click fires after the input's blur, and blur hides the box.
      d.addEventListener('mousedown', function (e) { e.preventDefault(); onPick(); hide(); });
      box.appendChild(d);
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function set(el, v) { if (el && v) el.value = v; }

    function lookupBrokers(el) {
      var q = el.value.trim();
      if (q.length < 2) return hide();
      fetch('/api/broker-lookup?q=' + encodeURIComponent(q))
        .then(function (r) { return r.ok ? r.json() : { matches: [] }; })
        .then(function (d) {
          var m = (d && d.matches) || [];
          if (!m.length) return hide();
          box.innerHTML = '';
          m.forEach(function (b) {
            row('<strong>' + esc(b.name || b.email) + '</strong>'
                + (b.agency ? ' <span style="color:#5f6b76">' + esc(b.agency) + '</span>' : '')
                + '<br><span style="color:#5f6b76">' + esc(b.email)
                + (b.quote_count > 1 ? ' &middot; ' + b.quote_count + ' quotes' : '') + '</span>',
              function () {
                // All four together. They describe one person.
                set(nameEl, b.name); set(emailEl, b.email);
                set(phoneEl, b.phone); set(agencyEl, b.agency);
              });
          });
          place(el); activeEl = el; box.style.display = 'block';
        })
        .catch(hide);
    }

    function lookupAgencies(el) {
      var q = el.value.trim();
      if (q.length < 2) return hide();
      fetch('/api/agency-lookup?q=' + encodeURIComponent(q))
        .then(function (r) { return r.ok ? r.json() : { matches: [] }; })
        .then(function (d) {
          var m = (d && d.matches) || [];
          if (!m.length) return hide();
          box.innerHTML = '';
          m.forEach(function (a) {
            row('<strong>' + esc(a.agency) + '</strong> <span style="color:#5f6b76">'
                + a.n + ' quote' + (a.n === 1 ? '' : 's') + '</span>',
              function () { set(agencyEl, a.agency); });
          });
          place(el); activeEl = el; box.style.display = 'block';
        })
        .catch(hide);
    }

    function wire(el, fn) {
      if (!el) return;
      el.addEventListener('input', function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { fn(el); }, 220);
      });
      el.addEventListener('blur', function () { setTimeout(hide, 150); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    }

    wire(nameEl, lookupBrokers);
    wire(emailEl, lookupBrokers);
    // The agency box gets the AGENCY list, which comes from the quote history rather than the
    // directory -- it is the one field the imported book actually carries, 189 names deep.
    wire(agencyEl, lookupAgencies);

    window.addEventListener('scroll', function () { if (activeEl) place(activeEl); }, true);
  }

  function boot() { build(); attachDirectoryPrefill(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
`;
