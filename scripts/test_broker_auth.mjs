#!/usr/bin/env node
// End-to-end test of per-broker identity (F-6), against a LOCAL `wrangler dev`.
//
// ⚠️ WHY THIS EXISTS RATHER THAN "push it and look". `abyquotes.com` sits behind the site lock
// and answers 401 to every script, so nothing deployed there can be read back. That is a fine
// way to ship a date dropdown and a bad way to ship AUTHENTICATION: the failures that matter
// here are a broker seeing somebody else's book, or a revoked person still getting in, and
// neither announces itself. Running the real worker locally is the only way to exercise them.
//
//   Terminal 1:  npx wrangler dev --local --port 8787
//   Terminal 2:  node scripts/test_broker_auth.mjs
//
// It writes only to the LOCAL D1 in .wrangler/state. It never touches production.
const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'local-test-only-not-a-real-password';
const INTEGRATION_TOKEN = process.env.INTEGRATION_TOKEN || 'local-test-integration-token';

// 🔴 EVERY IDENTIFIER IS RUN-SCOPED, and this is a fix rather than a nicety. The first version
// used fixed emails and quote numbers, so it passed exactly once: on the second run the broker
// already had a password, no setup link was issued, and the script died on `new URL(null)`.
// ⚠️ A TEST THAT ONLY PASSES ON A VIRGIN DATABASE gets believed once and then quietly stops
// being run, which is worse than not having it -- the green result from weeks ago is what
// people remember.
const RUN = Date.now().toString(36);
const JANE = 'jane-' + RUN + '@agency.com';
const SAM  = 'sam-' + RUN + '@other.com';
const Q1 = 'Q-' + RUN + '-1', Q2 = 'Q-' + RUN + '-2', Q3 = 'Q-' + RUN + '-3';

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}

/** Keeps cookies per "browser", because the whole point is that sessions differ per person. */
function jar() {
  const store = new Map();
  return {
    header() { return [...store.entries()].map(([k, v]) => k + '=' + v).join('; '); },
    absorb(res) {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      for (const c of raw) {
        const [pair] = c.split(';');
        const i = pair.indexOf('=');
        const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
        if (v === 'deleted') store.delete(k); else store.set(k, v);
      }
    },
  };
}

async function req(path, { method = 'GET', body, cookies, headers = {} } = {}) {
  const h = { ...headers };
  if (body) h['Content-Type'] = 'application/json';
  if (cookies) h.Cookie = cookies.header();
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  if (cookies) cookies.absorb(res);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { res, text, json };
}

const aby = jar(), jane = jar(), sam = jar();

console.log('\nF-6 — per-broker identity, against ' + BASE + '\n');

// ── 1. ABY's existing door still works, and now issues a session ───────────────
{
  const bad = await req('/api/admin/login', { method: 'POST', body: { password: 'wrong' }, cookies: aby });
  ok('wrong admin password is refused', bad.res.status === 401);

  const good = await req('/api/admin/login', { method: 'POST', body: { password: ADMIN_PASSWORD }, cookies: aby });
  ok('ADMIN_PASSWORD still signs ABY in', good.res.status === 200 && good.json && good.json.role === 'aby');
  ok('ABY gets BOTH the legacy cookie and a session',
    aby.header().includes('aby_admin=') && aby.header().includes('aby_session='), aby.header());
}

// ── 2. Migration creates the brokers table and the normalised index ────────────
{
  const m = await req('/api/migrate', { cookies: aby });
  ok('migrate runs for ABY', m.res.status === 200 && m.json && m.json.ok === true, m.text.slice(0, 120));
}

// Seed quotes AFTER migrate, since `status` is one of the migrated columns.
{
  const seed = await req('/api/quotes', { method: 'POST', body: {
    quoteNumber: Q1, clientName: 'Acme Co', effectiveDate: '2027-01-01',
    brokerName: 'Jane Broker', brokerEmail: ' ' + JANE.toUpperCase() + ' ', products: [{ id: 'dental', name: 'Dental' }],
  } });
  ok('a quote saves (seed 1)', seed.res.status === 200 || seed.res.status === 201, seed.text.slice(0, 160));
  const seed2 = await req('/api/quotes', { method: 'POST', body: {
    quoteNumber: Q2, clientName: 'Beta LLC', effectiveDate: '2027-01-01',
    brokerName: 'Jane Broker', brokerEmail: JANE, products: [],
  } });
  ok('a quote saves (seed 2, same broker, different casing)', seed2.res.status === 200 || seed2.res.status === 201);
  const seed3 = await req('/api/quotes', { method: 'POST', body: {
    quoteNumber: Q3, clientName: 'Gamma Inc', effectiveDate: '2027-02-01',
    brokerName: 'Sam Other', brokerEmail: SAM, products: [],
  } });
  ok('a quote saves (seed 3, a different broker)', seed3.res.status === 200 || seed3.res.status === 201);
}

// ── 3. The integration endpoint the dashboard has been waiting for ────────────
let setupUrl = null;
{
  const noTok = await req('/api/broker-quotes?email=' + JANE);
  ok('integration endpoint refuses a request with no token', noTok.res.status === 401);

  const wrongTok = await req('/api/broker-quotes?email=' + JANE, { headers: { Authorization: 'Bearer nope' } });
  ok('integration endpoint refuses a wrong token', wrongTok.res.status === 401);

  const good = await req('/api/broker-quotes?email=' + JANE, { headers: { Authorization: 'Bearer ' + INTEGRATION_TOKEN } });
  const quotes = (good.json && good.json.quotes) || [];
  ok('integration endpoint returns Jane\'s quotes', good.res.status === 200 && quotes.length === 2,
    good.res.status + ' n=' + quotes.length);

  // 🔴 THE CASE-AND-SPACE JOIN. The first quote was saved with capitals and a TRAILING SPACE.
  // trailing space. If the join were exact, this returns 1 and a broker quietly loses half
  // their book with nothing in any log.
  ok('mixed-case / trailing-space emails join to ONE broker',
    quotes.some((q) => q.quote_number === Q1) && quotes.some((q) => q.quote_number === Q2));

  ok('ABY-internal adjustment fields are NOT exposed to the broker surface',
    quotes.every((q) => !('adjustment' in q) && !('adjustment_note' in q)), JSON.stringify(quotes[0] || {}).slice(0, 200));

  const empty = await req('/api/broker-quotes', { headers: { Authorization: 'Bearer ' + INTEGRATION_TOKEN } });
  ok('a missing email returns an EMPTY list, never the whole book',
    empty.res.status === 200 && empty.json && empty.json.quotes.length === 0);
}

// ── 4. ABY creates a broker and gets a setup link ─────────────────────────────
{
  const made = await req('/api/brokers', { method: 'POST', cookies: aby,
    body: { email: ' ' + JANE.toUpperCase() + ' ', name: 'Jane Broker', agency: 'Agency LLC' } });
  ok('ABY can create a broker', made.res.status === 200 && made.json && made.json.ok, made.text.slice(0, 160));
  ok('the created email is normalised', made.json && made.json.email === JANE, made.json && made.json.email);
  setupUrl = made.json && made.json.setupUrl;
  ok('a setup link is issued for an account with no password yet', !!setupUrl);

  const list = await req('/api/brokers', { cookies: aby });
  const rows = (list.json && list.json.brokers) || [];
  const jrow = rows.find((r) => r.email === JANE);
  ok('the broker list counts her quotes', !!jrow && Number(jrow.quote_count) === 2, JSON.stringify(jrow || {}));
  ok('the list reports she has no password yet', !!jrow && !Number(jrow.has_password));
}

// ── 5. A stranger cannot reach any of it ──────────────────────────────────────
{
  const brokers = await req('/api/brokers');
  ok('broker administration is closed to the signed-out', brokers.res.status === 401);
  const mine = await req('/api/my/quotes');
  ok('the broker API is closed to the signed-out', mine.res.status === 401);
  const dash = await req('/dashboard');
  ok('the dashboard shows a sign-in page rather than data', dash.res.status === 401 && dash.text.includes('Sign in'));
}

// ── 6. The broker sets their own password and signs in ────────────────────────
{
  const u = new URL(setupUrl);
  const email = u.searchParams.get('email'), token = u.searchParams.get('t');

  const short = await req('/api/my/password', { method: 'POST', body: { email, token, password: 'short' } });
  ok('a short password is refused', short.res.status === 400);

  const badTok = await req('/api/my/password', { method: 'POST', body: { email, token: token.slice(0, -2) + 'xx', password: 'a-good-long-password' } });
  ok('a tampered setup token is refused', badTok.res.status === 400);

  const set = await req('/api/my/password', { method: 'POST', cookies: jane, body: { email, token, password: 'a-good-long-password' } });
  ok('the broker sets their own password and is signed in', set.res.status === 200 && jane.header().includes('aby_session='));

  const reuse = await req('/api/my/password', { method: 'POST', body: { email, token, password: 'another-long-password' } });
  ok('the setup link stops working once a password exists', reuse.res.status === 400);
}

// ── 7. Scoping: a broker sees THEIR quotes and no others ──────────────────────
{
  const mine = await req('/api/my/quotes', { cookies: jane });
  const rows = (mine.json && mine.json.quotes) || [];
  ok('the broker sees their own two quotes', mine.res.status === 200 && rows.length === 2, 'n=' + rows.length);
  ok('and none belonging to anyone else',
    rows.length > 0 && rows.every((q) => q.quote_number !== Q3));

  // 🔴 THE ONE THAT MATTERS MOST. The scope comes from the SESSION, so asking for somebody
  // else's email in the query string must change nothing at all.
  const spoof = await req('/api/my/quotes?email=' + SAM, { cookies: jane });
  const srows = (spoof.json && spoof.json.quotes) || [];
  ok('?email= cannot widen a broker\'s scope', srows.length === 2 && srows.every((q) => q.quote_number !== Q3));

  const asAdmin = await req('/api/quotes', { cookies: jane });
  ok('a broker cannot reach the ABY admin quote list', asAdmin.res.status === 401, String(asAdmin.res.status));

  const brokers = await req('/api/brokers', { cookies: jane });
  ok('a broker cannot reach broker administration', brokers.res.status === 401, String(brokers.res.status));

  const dash = await req('/dashboard', { cookies: jane });
  ok('the broker dashboard renders for them', dash.res.status === 200 && dash.text.includes('Your quotes'));
}

// ── 8. Revocation takes effect immediately, not when the session lapses ───────
{
  const before = await req('/api/my/quotes', { cookies: jane });
  ok('the broker is working before revocation', before.res.status === 200);

  await req('/api/brokers', { method: 'POST', cookies: aby,
    body: { email: JANE, name: 'Jane Broker', agency: 'Agency LLC', status: 'disabled' } });

  const after = await req('/api/my/quotes', { cookies: jane });
  ok('a disabled broker is refused ON THE NEXT REQUEST, with a live session', after.res.status === 401, String(after.res.status));

  const login = await req('/api/admin/login', { method: 'POST', cookies: sam, body: { email: JANE, password: 'a-good-long-password' } });
  ok('a disabled broker cannot sign back in with the right password', login.res.status === 401);

  // ⚠️ Editing a disabled broker back to active must NOT have cleared the password on the way
  // through -- an upsert that writes every column is exactly how that happens.
  await req('/api/brokers', { method: 'POST', cookies: aby,
    body: { email: JANE, name: 'Jane Broker Renamed', agency: 'Agency LLC', status: 'active' } });
  const back = await req('/api/admin/login', { method: 'POST', cookies: sam, body: { email: JANE, password: 'a-good-long-password' } });
  ok('re-enabling keeps the password intact', back.res.status === 200 && back.json && back.json.role === 'broker');
}

// ── 9. Sign out clears BOTH credentials ───────────────────────────────────────
{
  await req('/api/admin/logout', { cookies: aby });
  ok('sign-out clears the legacy cookie AND the session',
    !aby.header().includes('aby_admin=') && !aby.header().includes('aby_session='), aby.header());
  const after = await req('/api/brokers', { cookies: aby });
  ok('and ABY really is signed out', after.res.status === 401);
}

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
