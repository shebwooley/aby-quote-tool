// What a quote REQUEST carries, and the two server-to-server reads BenefitLab's ABY Quotes page needs (10-25-2026).
//
// ⭐ ERIC, 10-25-2026, after asking for a quote through BenefitLab himself: "It didn't pass on the number of employees
// ... that wouldn't have really helped because we need to know the number enrolled in a COBRA-eligible benefit, the
// number [who] would likely enroll in an FSA, HRA, HSA. It needs to ask with the expanded drop-down when a service is
// checked just like on the actual quoting tool." And: "When the broker runs the quote, it saves the name of the quote
// with no link and no way to get back to it."
//
// So a requested service now arrives in the SAME shape a saved quote stores ({ id, name, inputs }), plus the broker's
// answers as readable lines. That shape is what the quote form's ?rerun= reader already understands, which is what
// lets the Requests tab and the email offer "Run this quote" with every answer filled in. A plain string (the
// employer's door in ComplyDIY still sends those) is still accepted and shown as before.

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n || 200);

const EXTRA_IDS = ['einLarge', 'einSmall', 'priorYears', 'stateFirst', 'stateMore'];

/** One requested service, cleaned. Returns a string, an object, or null for nothing usable. */
function cleanOne(p) {
  if (typeof p === 'string') return str(p, 80) || null;
  if (!p || typeof p !== 'object') return null;
  const name = str(p.name, 120);
  const id = str(p.id, 40).replace(/[^A-Za-z0-9]/g, '');
  if (!name && !id) return null;
  const out = { id: id, name: name || id };
  const inp = (p.inputs && typeof p.inputs === 'object') ? p.inputs : {};
  const inputs = {};
  const n = Number(inp.count);
  if (Number.isFinite(n) && n > 0) inputs.count = Math.min(Math.round(n), 1000000);
  if (inp.package) inputs.package = str(inp.package, 40).replace(/[^A-Za-z0-9]/g, '');
  if (inp.packageIds) {
    inputs.packageIds = str(inp.packageIds, 300).split(',').map((x) => x.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean).join(',');
  }
  if (inp.extras && typeof inp.extras === 'object') {
    const ex = {};
    EXTRA_IDS.forEach((k) => {
      const v = inp.extras[k];
      if (v === true) ex[k] = true;
      else if (Number.isFinite(Number(v)) && Number(v) > 0) ex[k] = Math.min(Math.round(Number(v)), 10000);
    });
    if (Object.keys(ex).length) inputs.extras = ex;
  }
  if (Object.keys(inputs).length) out.inputs = inputs;
  const lines = Array.isArray(p.lines) ? p.lines.map((l) => str(l, 160)).filter(Boolean).slice(0, 10) : [];
  if (lines.length) out.lines = lines;
  return out;
}

/** The products list as stored on quote_request: a JSON array of strings and/or service objects. */
export function cleanRequestProducts(list) {
  const arr = Array.isArray(list) ? list : [];
  return JSON.stringify(arr.map(cleanOne).filter(Boolean).slice(0, 20));
}

export function parseRequestProducts(json) {
  try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

export function productName(p) { return typeof p === 'string' ? p : String((p && (p.name || p.id)) || ''); }
export function productLines(p) { return (p && typeof p === 'object' && Array.isArray(p.lines)) ? p.lines.map(String) : []; }

/** An effective date for a sentence: ISO becomes mm-dd-yyyy; anything else is shown as it was typed. */
export function effectiveForDisplay(s) {
  const v = String(s || '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? (m[2] + '-' + m[3] + '-' + m[1]) : v;
}

/** The same date for the quote form's select, whose options are yyyy-mm-01. Empty when it cannot be read. */
function effectiveForForm(s) {
  const v = String(s || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(v);
  return m ? (m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0')) : '';
}

/**
 * THE QUOTE FORM, FILLED IN FROM A REQUEST. /aby (not /): this link is only ever shown to ABY, on its own admin screen
 * and in its own email, and /aby is the same tool with ABY's state and rate controls.
 * ⛔ No quote number is carried: a request has never been quoted, so the form mints a new one.
 * Returns '' when nothing in the request is a service the form knows (an employer's plain-words request), because a
 * form with only a name in it is not "this quote".
 */
export function requestRunUrl(row) {
  const products = parseRequestProducts(row.products)
    .filter((p) => p && typeof p === 'object' && p.id)
    .map((p) => ({ id: p.id, name: p.name || p.id, inputs: p.inputs || {} }));
  if (!products.length) return '';
  const state = {
    clientName: row.client_name || '',
    clientId: row.client_id || '',
    effectiveDate: effectiveForForm(row.effective_date),
    brokerName: row.broker_name || '',
    brokerAgency: row.broker_agency || '',
    brokerPhone: row.broker_phone || '',
    brokerEmail: row.broker_email || '',
    products: JSON.stringify(products),
  };
  return '/aby?rerun=' + encodeURIComponent(JSON.stringify(state));
}

function bearerOk(request, env, safeEqual) {
  const expected = env.INTEGRATION_TOKEN;
  if (!expected) return { res: new Response(JSON.stringify({ error: 'This endpoint is not configured.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }) };
  const m = /^Bearer\s+(.+)$/i.exec((request.headers.get('Authorization') || '').trim());
  if (!m || !safeEqual(m[1], expected)) return { res: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) };
  return { ok: true };
}

const json = (body, status) => new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } });

/**
 * GET /api/broker-requests?email=   (bearer INTEGRATION_TOKEN)
 * A broker's own requests that have not become a quote yet, so their ABY Quotes page can say "ABY is running this"
 * instead of showing nothing until the quote exists. Declined ones from the last 60 days come back too, marked, so a
 * broker learns ABY is not quoting it rather than waiting for ever. Answered ones are left out: the quote itself is in
 * the list by then.
 * ⛔ No email, no answer (never "everyone's").
 */
export async function handleBrokerRequests(request, env, deps) {
  const gate = bearerOk(request, env, deps.safeEqual);
  if (!gate.ok) return gate.res;
  const email = str(new URL(request.url).searchParams.get('email'), 200).toLowerCase();
  if (!email) return json({ error: 'An email parameter is required.' }, 400);
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  try {
    const r = await env.DB.prepare(
      'SELECT id, created_at, client_name, effective_date, products, declined_at FROM quote_request ' +
      'WHERE lower(trim(broker_email)) = ? AND answered_at IS NULL ' +
      'AND (declined_at IS NULL OR declined_at >= ?) ORDER BY created_at DESC LIMIT 100'
    ).bind(email, since).all();
    const requests = (r.results || []).map((x) => ({
      id: x.id, created_at: x.created_at, client_name: x.client_name,
      effective_date: x.effective_date,
      products: parseRequestProducts(x.products).map(productName).filter(Boolean),
      declined: !!x.declined_at,
    }));
    return json({ requests: requests });
  } catch (err) {
    // A database without the table (before /api/migrate) has no requests; say so rather than 500 a broker's page.
    if (/no such table/i.test(String(err && err.message || err))) return json({ requests: [] });
    return json({ error: String(err && err.message || err) }, 500);
  }
}

/**
 * POST /api/integration/quote-link  { quoteId, emails: [...] }   (bearer INTEGRATION_TOKEN)
 * The quote's share link (/q/<token>), for the broker's "Open" on BenefitLab. The same link ABY sends an employer,
 * minted by the same function, with the same refusal for a quote a link would re-price wrongly.
 * ⛔ ONLY FOR A QUOTE FILED UNDER ONE OF THE ADDRESSES BenefitLab vouches for. BenefitLab decides which addresses a
 * signed-in person may see (their own, or their agency's when the agency shares); a quote under any other address is
 * refused as not found, so this cannot be walked across other brokers' quotes.
 */
export async function handleQuoteLink(request, env, deps) {
  const gate = bearerOk(request, env, deps.safeEqual);
  if (!gate.ok) return gate.res;
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'The body was not JSON.' }, 400); }
  const id = str(body.quoteId, 80);
  const emails = (Array.isArray(body.emails) ? body.emails : []).map((e) => str(e, 200).toLowerCase()).filter(Boolean);
  if (!id || !emails.length) return json({ error: 'A quoteId and at least one email are required.' }, 400);
  const q = await env.DB.prepare('SELECT id, broker_email FROM quotes WHERE id = ?').bind(id).first();
  if (!q || emails.indexOf(String(q.broker_email || '').trim().toLowerCase()) === -1) {
    return json({ error: 'Not found' }, 404);
  }
  return deps.handleShareQuote(id, env, new URL(request.url));
}
