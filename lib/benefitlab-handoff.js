// ONE CLICK FROM BENEFITLAB INTO THE QUOTE TOOL (F-609; Eric 09-27-2026 "I would prefer one click", built 10-21-2026
// on his "Yes, build it"). The plan: OneDrive Platform/ABY-ONE-CLICK-PLAN-2026-10-18.md.
//
// THE SHAPE: BenefitLab VOUCHES, ABY ISSUES A ONE-TIME LINK.
//   1. A broker presses an ABY quote button in BenefitLab.
//   2. The BenefitLab SERVER (never the browser) posts the broker's VERIFIED email, name, phone and BenefitLab
//      agency to POST /api/integration/broker-handoff, with the shared INTEGRATION_TOKEN.
//   3. ABY finds the broker by email. If there is none, it creates one inside the ABY firm linked to that
//      BenefitLab agency (agencies.benefitlab_agency_id), creating that firm on first use.
//   4. ABY mints a single-use token, good for two minutes, bound to that broker, and returns
//      /broker/handoff?t=<token>&next=<where the quote form is, with its prefill>.
//   5. The browser lands there. ABY spends the token in the same statement that reads it, sets the normal
//      30-day broker cookie and redirects to `next`.
//
// WHY: no password is ever typed or stored for the broker on ABY's side; the powerful key never leaves either
// server; the token in the URL is useless after one use or two minutes. And Eric's "invitation only" rule holds,
// because BenefitLab - which verified the broker's email and agency - is the one asserting the membership.
//
// ⛔ A NEW FIRM IS NEVER MATCHED TO AN EXISTING ABY FIRM BY NAME. Two firms can share a name, and a wrong match
// would put a stranger inside another firm, able to see its shared quotes. The new firm is created with a
// needs_review note instead, so ABY merges it by hand on the tidy-up screen if it is a firm they already have.
//
// Its own file for the same reason lib/application.js is one: worker.js is a 20,000-line file full of
// template-literal pages where a stray backtick or backslash has broken production.

const TOKEN_MINUTES = 2;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

// Added to worker.js MIGRATIONS; created by /api/migrate (a separate, human step on ABY - TRAPS #519).
export const HANDOFF_MIGRATIONS = [
  { sql: 'ALTER TABLE agencies ADD COLUMN benefitlab_agency_id TEXT', table: 'agencies', column: 'benefitlab_agency_id' },
  { sql: 'ALTER TABLE brokers ADD COLUMN handoff_token TEXT', table: 'brokers', column: 'handoff_token' },
  { sql: 'ALTER TABLE brokers ADD COLUMN handoff_expires TEXT', table: 'brokers', column: 'handoff_expires' },
];

/**
 * Where the broker may be sent after the handoff: a path on THIS site, and nothing else.
 * ⛔ `//evil.example` and `/\evil.example` are read by browsers as another host, so both are refused, as is
 * anything that is not a path. A refused value becomes the quote form, never an error the broker has to read.
 */
export function safeNext(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s || s[0] !== '/' || s[1] === '/' || s[1] === '\\' || /[\r\n]/.test(s) || s.length > 6000) {
    return '/broker?next=quote';
  }
  return s;
}

function token() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

/**
 * POST /api/integration/broker-handoff
 *   Authorization: Bearer <INTEGRATION_TOKEN>
 *   { email, name, phone, benefitlabAgencyId, agencyName, next }
 *   -> { ok, url, created: { broker, agency } }
 *
 * 🔴 IT FAILS CLOSED, like /api/broker-quotes and /api/quote-request: no INTEGRATION_TOKEN configured is a 503,
 * never "allow". An unset secret must not become a way to sign in as anybody.
 */
export async function handleBrokerHandoff(request, env, deps) {
  const expected = env.INTEGRATION_TOKEN;
  if (!expected) return json({ error: 'This endpoint is not configured.' }, 503);
  const auth = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!m || !deps.safeEqual(m[1], expected)) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'The body was not JSON.' }, 400); }
  const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 200);
  const email = str(body.email, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'A valid email is required.' }, 400);
  const blAgencyId = str(body.benefitlabAgencyId, 64);
  if (!blAgencyId) return json({ error: 'benefitlabAgencyId is required.' }, 400);
  const agencyName = str(body.agencyName, 120) || 'BenefitLab agency';
  const name = str(body.name, 120);
  const phone = str(body.phone, 40);
  const now = new Date().toISOString();
  const created = { broker: false, agency: false };

  let broker;
  try {
    broker = await env.DB.prepare('SELECT id, agency_id FROM brokers WHERE lower(trim(email)) = ?').bind(email).first();
  } catch (e) {
    return json({ error: 'Could not read brokers: ' + String(e && e.message || e) }, 500);
  }

  if (!broker) {
    // The ABY firm for this BenefitLab agency, made on first use.
    let agency;
    try {
      agency = await env.DB.prepare('SELECT id, name FROM agencies WHERE benefitlab_agency_id = ?').bind(blAgencyId).first();
    } catch (e) {
      // ⭐ THE MIGRATION IS NAMED. The column is new, so "no such column" is the likeliest failure on the day
      // this ships, and it is fixed by opening one URL.
      return json({ error: 'Could not read agencies: ' + String(e && e.message || e) +
        ' (if this says no such column, open /api/migrate while signed in as ABY).' }, 500);
    }
    if (!agency) {
      agency = { id: crypto.randomUUID(), name: agencyName };
      await env.DB.prepare(
        'INSERT INTO agencies (id, name, share_quotes, created_at, needs_review, benefitlab_agency_id) VALUES (?,?,?,?,?,?)'
      ).bind(agency.id, agency.name, 0, now,
        "created by a BenefitLab broker's first click into the quote tool -- merge it if ABY already has this firm",
        blAgencyId).run();
      created.agency = true;
    }
    const hasAdmin = await env.DB.prepare(
      "SELECT 1 AS yes FROM brokers WHERE agency_id = ? AND role = 'admin' LIMIT 1").bind(agency.id).first();
    const id = crypto.randomUUID();
    // ⚠️ NO PASSWORD, ON PURPOSE: this broker comes in through BenefitLab. "Forgot password" on ABY's sign-in
    // page still works for them if they ever want one.
    await env.DB.prepare(
      'INSERT INTO brokers (id, email, password_hash, name, agency, phone, agency_id, role, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(id, email, '', name, agency.name, phone, agency.id, hasAdmin ? 'member' : 'admin', now).run();
    created.broker = true;
    await deps.linkBrokerIntoDirectory(env, {
      email, name, phone, agencyId: agency.id, agencyName: agency.name, source: 'benefitlab-handoff',
    });
    broker = { id, agency_id: agency.id };
  }

  const t = token();
  const expires = new Date(Date.now() + TOKEN_MINUTES * 60 * 1000).toISOString();
  try {
    await env.DB.prepare('UPDATE brokers SET handoff_token = ?, handoff_expires = ? WHERE id = ?')
      .bind(t, expires, broker.id).run();
  } catch (e) {
    return json({ error: 'Could not issue the sign-in link: ' + String(e && e.message || e) +
      ' (if this says no such column, open /api/migrate while signed in as ABY).' }, 500);
  }
  const origin = new URL(request.url).origin;
  const url = origin + '/broker/handoff?t=' + t + '&next=' + encodeURIComponent(safeNext(body.next));
  return json({ ok: true, url, created });
}

/**
 * GET /broker/handoff?t=<token>&next=<path>
 * ⭐ THE TOKEN IS SPENT IN THE SAME STATEMENT THAT FINDS IT (UPDATE ... RETURNING), so two requests racing with
 * one token cannot both sign in. An unknown, used or expired token goes to the ordinary sign-in page with the
 * same `next`, so the broker is never stranded on an error.
 */
export async function handleHandoffLanding(request, env, deps) {
  const url = new URL(request.url);
  const t = String(url.searchParams.get('t') || '');
  const next = safeNext(url.searchParams.get('next'));
  let row = null;
  if (/^[0-9a-f]{64}$/.test(t)) {
    try {
      row = await env.DB.prepare(
        'UPDATE brokers SET handoff_token = NULL, handoff_expires = NULL ' +
        'WHERE handoff_token = ? AND handoff_expires > ? RETURNING id'
      ).bind(t, new Date().toISOString()).first();
    } catch { row = null; }
  }
  if (!row) {
    return new Response(null, { status: 302, headers: { Location: next, 'Cache-Control': 'no-store' } });
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: next,
      'Cache-Control': 'no-store',
      // ⚠️ The link carried a secret; do not hand it to the next page as a Referer.
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': deps.sessionCookie(await deps.makeBrokerToken(row.id, env), 60 * 60 * 24 * 30),
    },
  });
}
