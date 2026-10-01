// AGENCY QUOTE DEFAULTS (F-631, Eric and Niels, 10-01-2026).
//
// "When we [create a broker link], pre-select the sales rep (Niels or me), pre-select whether to have
// commission on or off by default, and check a box to say that on bundled products (COBRA and FSA,
// for instance), we will only charge one setup fee ... it should be our choice whether to offer that
// to an agency or not."
//
// WHY ON THE AGENCY, NOT THE INVITE: a broker link puts a person INTO a firm, and the deal is with the
// firm - so every broker ABY ever invites into it (and every colleague their administrator adds)
// quotes the same way. ABY sets it once per agency, and can change it any time.
//
// WHAT EACH SETTING DOES ON THE BROKER'S QUOTE PAGE (public/assets/js/app.js):
//   default_rep         'eric' | 'niels' | null - pre-selected and LOCKED (Eric: "lock the rep").
//   default_commission  1 | 0 | null            - pre-set; the broker may change it ("let them change
//                                                 commission"). Null leaves the page's own default.
//   one_setup_fee       1 | 0                   - one administration setup fee per quote
//                                                 (engine.bundleSetupFees).
//
// Its own file for the same reason lib/application.js is one: worker.js is a 20,000-line file full of
// template-literal pages where a stray backtick or backslash has broken production.

const REPS = ['eric', 'niels'];   // the ids in public/assets/js/data/reps.js

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Added to worker.js MIGRATIONS; created by /api/migrate (a separate, human step on ABY - TRAPS #519).
export const AGENCY_DEFAULT_MIGRATIONS = [
  { sql: 'ALTER TABLE agencies ADD COLUMN default_rep TEXT', table: 'agencies', column: 'default_rep' },
  { sql: 'ALTER TABLE agencies ADD COLUMN default_commission INTEGER', table: 'agencies', column: 'default_commission' },
  { sql: 'ALTER TABLE agencies ADD COLUMN one_setup_fee INTEGER', table: 'agencies', column: 'one_setup_fee' },
];

function shape(row) {
  return {
    rep: row && REPS.indexOf(row.default_rep) >= 0 ? row.default_rep : null,
    commission: row && (row.default_commission === 1 || row.default_commission === 0) ? row.default_commission === 1 : null,
    oneSetupFee: !!(row && row.one_setup_fee === 1),
  };
}

// The defaults for one agency, or null. NEVER THROWS: before /api/migrate has run the columns do not
// exist, and a broker's sign-in must not fail because a pricing preference could not be read.
export async function agencyDefaultsFor(env, agencyId) {
  if (!agencyId) return null;
  try {
    const row = await env.DB.prepare(
      'SELECT default_rep, default_commission, one_setup_fee FROM agencies WHERE id = ?'
    ).bind(agencyId).first();
    return row ? shape(row) : null;
  } catch (err) {
    console.error('agency defaults: could not read (run /api/migrate?):', err);
    return null;
  }
}

// GET /api/admin/agency-defaults?id=<agency id>   (ABY admin only - the worker checks the session)
export async function handleGetAgencyDefaults(url, env) {
  const id = String(url.searchParams.get('id') || '');
  if (!id) return json({ ok: false, error: 'No agency given.' }, 400);
  try {
    const row = await env.DB.prepare(
      'SELECT id, name, default_rep, default_commission, one_setup_fee FROM agencies WHERE id = ?'
    ).bind(id).first();
    if (!row) return json({ ok: false, error: 'No such agency.' }, 404);
    return json({ ok: true, agency: row.name, defaults: shape(row) });
  } catch (err) {
    return json({ ok: false, error: 'The database has not been updated for this yet. Open /api/migrate while signed in, then try again.' }, 503);
  }
}

// POST /api/admin/agency-defaults  { id, rep: 'eric'|'niels'|null, commission: true|false|null, oneSetupFee: bool }
export async function handleSaveAgencyDefaults(request, env) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'Bad request' }, 400); }
  const id = String((b && b.id) || '');
  if (!id) return json({ ok: false, error: 'Pick the agency first.' }, 400);
  const rep = b.rep == null || b.rep === '' ? null : String(b.rep);
  if (rep !== null && REPS.indexOf(rep) < 0) return json({ ok: false, error: 'Unknown sales rep.' }, 400);
  const commission = b.commission === true ? 1 : b.commission === false ? 0 : null;
  const one = b.oneSetupFee === true ? 1 : 0;
  try {
    const r = await env.DB.prepare(
      'UPDATE agencies SET default_rep = ?, default_commission = ?, one_setup_fee = ? WHERE id = ?'
    ).bind(rep, commission, one, id).run();
    if (!r.meta || !r.meta.changes) return json({ ok: false, error: 'No such agency.' }, 404);
    return handleGetAgencyDefaults(new URL('https://x/?id=' + encodeURIComponent(id)), env);
  } catch (err) {
    return json({ ok: false, error: 'The database has not been updated for this yet. Open /api/migrate while signed in, then try again.' }, 503);
  }
}
