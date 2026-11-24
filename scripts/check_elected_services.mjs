// check_elected_services.mjs - additional services selected on a quote (Eric, 11-24-2026, for Jana Nentwich).
//
// Runs the real quote page in a browser with /api stubbed: tick two fee-schedule lines, generate, and check that they are
// highlighted, on the page the employer signs, in the total only when they are one set amount, in what is saved, in what
// the employer's link shows, on the signed record, and restored by a re-run. Writes nothing anywhere.
//
//   node scripts/check_elected_services.mjs [--shots <dir>] [--self-test]
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { formsFor } from '../lib/application.js';

// Playwright lives in the sibling Stella repo; this one carries no browser.
const { chromium } = createRequire(new URL('../../stella-quoting-app/package.json', import.meta.url))('playwright');
const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? '' : process.argv[i + 1]; };
const SHOTS = arg('--shots');
const SELF = process.argv.includes('--self-test');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
let shared = null, sabotage = false, saved = null, signed = null;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path.startsWith('/api/')) {
    let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => {
      if (path === '/api/quotes' && req.method === 'POST') saved = JSON.parse(b);
      res.setHeader('content-type', 'application/json'); res.end('{}');
    });
    return;
  }
  const file = join(PUB, path === '/' ? 'index.html' : path);
  if (!existsSync(file)) { res.statusCode = 404; return res.end(); }
  res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream');
  let body = readFileSync(file);
  if (path === '/' && shared) body = body.toString().replace('<head>', '<head><script>window.__ABY_SHARED=' + JSON.stringify(shared) + '</script>');
  if (sabotage && path.endsWith('/renderer.js')) body = body.toString().replace('extraRows + feeRows', 'extraRows');
  res.end(body);
}).listen(0);
const ORIGIN = 'http://localhost:' + server.address().port;

const PACKET = 'Annual Notice Packet';
const RIGHTS = 'Initial/general rights notices at setup or renewal (optional)';
const month = (() => { const d = new Date(); const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-01'; })();
const base = { quoteNumber: 'TX261028-1486-C', clientName: 'Test Employer', effectiveDate: month, brokerName: 'Test Broker', brokerAgency: 'Test Agency',
  brokerPhone: '', brokerEmail: 'broker@example.com', commissionIncluded: true, repName: 'Niels Christiansen',
  products: [{ id: 'cobra', name: 'COBRA Administration', inputs: { count: '25' } }, { id: 'erisa', name: 'ERISA Wrap Document & Compliance', inputs: { packageIds: 'enhanced' } }] };

async function run(browser) {
  const bad = [];
  const must = (c, m) => { if (!c) bad.push(m); };
  saved = null; signed = null; shared = null;
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 1000 });
  page.on('pageerror', (e) => bad.push('page error: ' + e.message));
  await page.route('**/*', (route) => {
    const r = route.request();
    if (r.url().includes('workers.dev')) {
      if (r.method() === 'POST') signed = JSON.parse(r.postData());
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: '{"applyUrl":"/x"}' });
    }
    return r.url().startsWith(ORIGIN) || r.url().startsWith('data:') ? route.continue() : route.abort();
  });
  const settle = () => new Promise((r) => setTimeout(r, 1500));
  const read = () => page.evaluate(() => ({
    hi: [...document.querySelectorAll('.fee-elected .fee-name')].map((e) => e.textContent.trim()),
    bg: [...document.querySelectorAll('.fee-elected')].map((e) => getComputedStyle(e).backgroundColor),
    sign: [...document.querySelectorAll('.opt-fee')].map((e) => e.getAttribute('data-label')),
    total: (document.querySelector('[data-aby-total-annual]') || {}).textContent,
  }));
  const open = async (state, q) => { await page.goto(ORIGIN + '/?rerun=' + encodeURIComponent(JSON.stringify(state)) + (q || ''), { waitUntil: 'load' }); await settle(); };
  const generate = async () => { await page.evaluate(() => document.getElementById('quoteForm').requestSubmit()); await settle(); };
  const tick = (l) => page.evaluate((x) => { const e = [...document.querySelectorAll('[data-fee-label]')].find((y) => y.dataset.feeLabel === x && y.closest('.product-row').querySelector('[data-product-checkbox]').checked); if (e) e.checked = true; return !!e; }, l);

  // 1. nothing ticked: the quote reads as before
  await open(base); await generate();
  let v = await read();
  const plain = Number(v.total.replace(/[^0-9]/g, ''));
  must(!v.hi.length && !v.sign.length, '1 an unticked quote shows selected services');
  must(plain === 125 + 55 * 12 + 700, '1 the total is $' + plain);
  // 2. both ticked
  await open(base);
  must(await tick(PACKET), '2 no box for the packet'); must(await tick(RIGHTS), '2 no box for the rights notices');
  if (SHOTS) { await page.evaluate(() => document.querySelectorAll('.product-fees').forEach((d) => { if (d.querySelector(':checked')) d.open = true; })); await page.screenshot({ path: join(SHOTS, 'form.png'), fullPage: true }); }
  await generate(); v = await read();
  must(v.hi.length === 2 && v.hi.every((x) => /Selected$/.test(x)), '2 highlighted: ' + v.hi.join(' | '));
  must(v.bg.every((c) => c === 'rgb(255, 246, 204)'), '2 highlight color: ' + v.bg);
  must(v.sign.includes('ERISA Wrap Document: ' + PACKET + ' ($125 per year)') && v.sign.includes('COBRA: ' + RIGHTS + ' ($3 per notice)'), '2 signing page: ' + v.sign.join(' | '));
  must(Number(v.total.replace(/[^0-9]/g, '')) === plain + 125, '2 total ' + v.total + ', expected ' + (plain + 125));
  must(saved && saved.products.length === 2 && saved.products.every((p) => p.inputs.fees && p.inputs.fees.length === 1), '2 saved: ' + JSON.stringify(saved && saved.products));
  // 3. a re-run restores them
  const again = { ...base, products: saved ? saved.products : [] };
  await open(again); await generate(); v = await read();
  must(v.hi.length === 2, '3 a re-run lost them');
  // 4. the employer's link, from the saved price; one left off; the signed record
  shared = { ...again, readonly: true, resolvedPricing: saved && saved.resolvedPricing };
  await page.goto(ORIGIN + '/', { waitUntil: 'load' }); await settle(); v = await read();
  must(v.hi.length === 2 && v.sign.length === 2, '4 the employer link: ' + JSON.stringify(v));
  if (SHOTS) {
    await (await page.$('.ack-group')).screenshot({ path: join(SHOTS, 'sign.png') });
    for (const [i, e] of (await page.$$('.fees-wrap')).entries()) await e.screenshot({ path: join(SHOTS, 'fees' + i + '.png') });
    await page.setViewportSize({ width: 390, height: 800 }); await (await page.$('.ack-group')).screenshot({ path: join(SHOTS, 'sign-phone.png') });
    await page.setViewportSize({ width: 1200, height: 1000 });
  }
  await page.evaluate(() => { const e = document.querySelector('.opt-fee[data-label^="COBRA"]'); if (e) e.checked = false; });
  const list = await page.evaluate(() => window.abyElectedProducts());
  must(list.length === 3 && list.some((x) => x.includes(PACKET)) && !list.some((x) => x.includes('rights')), '4 signed list: ' + list.join(' | '));
  const f = formsFor(base.products, list);
  must(f.forms.join() === 'cobra,erisa' && !f.other.length, '4 setup questions: ' + JSON.stringify(f));
  // 5. leaving the whole service off leaves its additional service off
  await page.evaluate(() => { document.querySelector('.opt-check[data-label="ERISA Wrap Document"]').checked = false; });
  must(!(await page.evaluate(() => window.abyElectedProducts())).some((x) => x.includes('ERISA')), '5 a service left off still signs its add-on');
  await page.close();
  return bad;
}

const browser = await chromium.launch();
let code = 0;
try {
  const bad = await run(browser);
  bad.forEach((b) => console.log('  FAIL ' + b));
  if (!bad.length) console.log('ok   selected services: highlighted, on the signing page, totaled, saved, shared, signed, re-run.');
  else code = 1;
  if (SELF) { sabotage = true; const s = await run(browser); console.log(s.length ? 'ok   sabotage caught' : 'FAIL sabotage missed'); if (!s.length) code = 1; }
} finally { await browser.close(); server.close(); }
process.exit(code);
