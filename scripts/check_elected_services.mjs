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
let shotsOn = true;
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
  const tick = (l) => page.evaluate((x) => { const e = [...document.querySelectorAll('[data-fee-label]')].find((y) => y.dataset.feeLabel === x && y.closest('.product-row').querySelector('[data-product-checkbox]').checked); if (e) { e.checked = true; e.dispatchEvent(new Event('change')); } return !!e; }, l);

  // 1. nothing ticked: the quote reads as before
  await open(base); await generate();
  let v = await read();
  const plain = Number(v.total.replace(/[^0-9]/g, ''));
  must(!v.hi.length && !v.sign.length, '1 an unticked quote shows selected services');
  must(plain === 125 + 55 * 12 + 700, '1 the total is $' + plain);
  // 2. both ticked
  await open(base);
  must(await tick(PACKET), '2 no box for the packet'); must(await tick(RIGHTS), '2 no box for the rights notices');
  if (SHOTS && shotsOn) { await page.evaluate(() => document.querySelectorAll('.product-fees').forEach((d) => { if (d.querySelector(':checked')) d.open = true; })); await page.screenshot({ path: join(SHOTS, 'form.png'), fullPage: true }); }
  await generate(); v = await read();
  must(v.hi.length === 2 && v.hi.every((x) => /Selected(: 25 x \$3 = \$75)?$/.test(x)), '2 highlighted: ' + v.hi.join(' | '));
  must(v.bg.every((c) => c === 'rgb(255, 246, 204)'), '2 highlight color: ' + v.bg);
  must(v.sign.includes('ERISA Wrap Document: ' + PACKET + ' ($125 per year)') && v.sign.includes('COBRA: ' + RIGHTS + ' (25 x $3 per notice = $75)'), '2 signing page: ' + v.sign.join(' | '));
  must(Number(v.total.replace(/[^0-9]/g, '')) === plain + 200, '2 total ' + v.total + ', expected ' + (plain + 200));
  must(saved && saved.products.length === 2 && saved.products.every((p) => p.inputs.fees && p.inputs.fees.length === 1), '2 saved: ' + JSON.stringify(saved && saved.products));
  // 3. a re-run restores them
  const again = { ...base, products: saved ? saved.products : [] };
  await open(again); await generate(); v = await read();
  must(v.hi.length === 2 && Number(v.total.replace(/[^0-9]/g, '')) === plain + 200, '3 a re-run lost them, total ' + v.total);
  // 3b. a quote that ticked the notices before quantities existed takes the count on the form (Adonius)
  const old = JSON.parse(JSON.stringify(again)); old.products.forEach((p) => { delete p.inputs.feeQty; });
  await open(old); await generate(); v = await read();
  must(Number(v.total.replace(/[^0-9]/g, '')) === plain + 200, '3b re-run without a quantity, total ' + v.total);
  // 3c. the log's value is the printed total, also when several options are offered
  must(saved.firstYearValue === plain + 200, '3c the log would say ' + saved.firstYearValue);
  const two = JSON.parse(JSON.stringify(again)); two.products[1].inputs.packageIds = 'enhanced,fullSpdTesting';
  await open(two); await generate(); v = await read();
  must(saved.firstYearValue === Number(v.total.replace(/[^0-9]/g, '')), '3c two options: log ' + saved.firstYearValue + ', printed ' + v.total);
  await open(again); await generate();
  // 4. the employer's link, from the saved price; one left off; the signed record
  const first = saved && saved.resolvedPricing;
  shared = { ...again, readonly: true, resolvedPricing: first };
  await page.goto(ORIGIN + '/', { waitUntil: 'load' }); await settle(); v = await read();
  must(v.hi.length === 2 && v.sign.length === 2, '4 the employer link: ' + JSON.stringify(v));
  if (SHOTS && shotsOn) {
    await (await page.$('.ack-group')).screenshot({ path: join(SHOTS, 'sign.png') });
    for (const [i, e] of (await page.$$('.fees-wrap')).entries()) await e.screenshot({ path: join(SHOTS, 'fees' + i + '.png') });
    await page.setViewportSize({ width: 390, height: 800 }); await (await page.$('.ack-group')).screenshot({ path: join(SHOTS, 'sign-phone.png') });
    await page.setViewportSize({ width: 1200, height: 1000 });
  }
  await page.evaluate(() => { const e = document.querySelector('.opt-fee[data-label^="COBRA"]'); if (e) e.checked = false; });
  const list = await page.evaluate(() => window.abyElectedProducts());
  must(list.length === 3 && list.includes('ERISA Wrap Document: Enhanced') && list.some((x) => x.includes(PACKET)) && !list.some((x) => x.includes('rights')), '4 signed list: ' + list.join(' | '));
  const f = formsFor(base.products, list);
  must(f.forms.join() === 'cobra,erisa' && !f.other.length, '4 setup questions: ' + JSON.stringify(f));
  // 4c. on paper (Eric, 11-24-2026: "Will this still look good ... saved as a pdf?"): the employer's print keeps their details
  // and signature on one sheet (print.css hid every form), and Download PDF does too.
  const sheet = async (how) => page.evaluate(() => {
    const c = document.querySelector('.ack-card').getBoundingClientRect(), i = document.querySelector('.ack-page input[name=ein]').getBoundingClientRect();
    return { h: c.height, w: c.width, shown: i.height > 0 && !!document.getElementById('sigPad').getBoundingClientRect().height };
  });
  await page.setViewportSize({ width: 739, height: 979 });   // letter, 0.4in margins
  await page.emulateMedia({ media: 'print' });
  const paper = await sheet();
  must(paper.shown && paper.h <= 975, '4c the printed signing page: ' + JSON.stringify(paper));
  await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1200, height: 1000 });
  // 4b. the EIN: on the signing page, refused at the wrong length, sent formatted, optional
  must(await page.evaluate(() => { const e = document.querySelector('.ack-page input[name=ein]'); return !!e && !e.readOnly && e.closest('.ack-field').textContent.includes('EIN'); }), '4b no EIN box');
  if (SHOTS && shotsOn) await (await page.$('.ack-page')).screenshot({ path: join(SHOTS, 'ein.png') });
  const trySign = async (ein) => {
    signed = null;
    await page.evaluate((x) => { window.print = () => {}; window.__abySigInk = true; const f = document.querySelector('.ack-page form'); f.ein.value = x; f.authSigner.value = 'Test Signer'; const b = document.getElementById('commitBtn'); b.disabled = false; b.style.display = ''; return window.submitCommitment({ preventDefault() {}, target: f }); }, ein);
    return page.evaluate(() => document.getElementById('commitMsg').textContent);
  };
  must(/9 digits/.test(await trySign('12-345')) && !signed, '4b a short EIN was sent');
  await trySign('123456789');
  must(signed && signed.ein === '12-3456789', '4b sent EIN: ' + JSON.stringify(signed && signed.ein));
  await trySign('');
  must(signed && signed.ein === '', '4b a blank EIN blocked the signature');
  // 7. the employer unchecks a service (Eric, 11-24-2026): the total follows, in both places, and back again
  {
    const t = () => page.evaluate(() => ({ total: [...document.querySelectorAll('[data-aby-total-annual]')].map((e) => e.textContent).join(), off: document.querySelectorAll('tr.aby-off').length, list: abyElectedProducts().join('|') }));
    const click = (sel) => page.evaluate((x) => { const e = document.querySelector(x); if (e) e.click(); }, sel);
    shared = { ...again, readonly: true, resolvedPricing: first };
    await page.goto(ORIGIN + '/', { waitUntil: 'load' }); await settle();
    const whole = plain + 200, m = (n) => '$' + n.toLocaleString('en-US') + ',$' + n.toLocaleString('en-US');
    let z = await t(); must(z.total === m(whole) && !z.off, '7 start ' + z.total);
    await click('.aby-inc[data-inc="cobra"]'); z = await t();
    must(z.total === m(whole - 860) && z.off === 2 && !/COBRA/.test(z.list), '7 COBRA off in the table: ' + JSON.stringify(z));
    await click('.opt-check[data-inc="cobra"]'); z = await t();
    must(z.total === m(whole) && !z.off && /Initial/.test(z.list), '7 COBRA back on the authorization page: ' + JSON.stringify(z));
    await click('.opt-fee[data-inc="erisa-fee-0"]'); z = await t();
    must(z.total === m(whole - 125) && z.off === 1 && !/Packet/.test(z.list), '7 the packet off: ' + JSON.stringify(z));
    if (SHOTS && shotsOn) await page.evaluate(() => document.querySelector('[data-aby-row]').closest('section').setAttribute('id', 'shotcost')).then(async () => (await page.$('#shotcost')).screenshot({ path: join(SHOTS, 'cost.png') }));
    // an ERISA option with the box unchecked: picking another option does not bring it back
    await click('.aby-inc[data-inc="erisa"]'); z = await t(); must(z.total === m(860), '7 ERISA off: ' + z.total);
    // a signed copy shows what was signed, and nothing moves
    shared = { ...again, readonly: true, resolvedPricing: first, signed: { acceptedSign: 'X', products: ['ERISA Wrap Document: Enhanced'] } };
    await page.goto(ORIGIN + '/', { waitUntil: 'load' }); await settle(); z = await t();
    must(z.total === m(700) && z.off === 3 && (await page.evaluate(() => [...document.querySelectorAll('input[data-inc]')].every((b) => b.disabled))), '7 signed: ' + JSON.stringify(z));
    shared = { ...again, readonly: true, resolvedPricing: first, signed: { acceptedSign: 'X' } };
    await page.goto(ORIGIN + '/', { waitUntil: 'load' }); await settle(); z = await t();
    must(z.total === m(whole) && !z.off, '7 an older signature keeps every service: ' + z.total);
    // an option pick still moves the total, and respects the box
    shared = null; await open({ ...base, products: [base.products[0], { id: 'erisa', name: 'ERISA', inputs: { packageIds: 'basic,enhanced' } }] }); await generate();
    await page.evaluate(() => { const r = document.querySelector('input.opt-pick[data-opt-package="enhanced"]'); r.checked = true; r.dispatchEvent(new Event('change')); }); z = await t();
    must(z.total === m(785 + 700), '7 option pick ' + z.total);
    await click('.aby-inc[data-inc="erisa"]'); z = await t(); must(z.total === m(785), '7 option pick then off ' + z.total);
  }
  // 6. a service shown in the quote only (Gates Production, 11-24-2026)
  shared = null; saved = null;
  const gates = { ...base, quoteNumber: 'TX261124-5474-C', products: [{ id: 'fsa', name: 'FSA', inputs: { count: '1', infoOnly: true } }, { id: 'erisa', name: 'ERISA', inputs: { packageIds: 'buyUp' } }] };
  await open(gates); await generate();
  const look = () => page.evaluate(() => ({ rows: [...document.querySelectorAll('[data-aby-row]')].map((r) => r.getAttribute('data-aby-row')).join(), total: document.querySelector('[data-aby-total-annual]').textContent, sign: [...document.querySelectorAll('.opt-check')].map((e) => e.dataset.label).join(), page: document.querySelector('.aby-proposal').textContent, notes: document.querySelectorAll('.info-only-note').length }));
  const inBoth = async (where) => {
    const g = await look();
    must(g.rows === 'erisa' && g.total === '$525' && g.sign === 'ERISA Wrap Document: Buy-Up' && g.notes === 1 && /\$85/.test(g.page), '6 ' + where + ': ' + g.rows + ' ' + g.total + ' ' + g.sign + ' ' + g.notes);
  };
  await inBoth('on screen');
  must(saved && saved.firstYearValue === 525 && saved.products[0].inputs.infoOnly === true, '6 saved: ' + JSON.stringify(saved && [saved.firstYearValue, saved.products]));
  if (SHOTS && shotsOn) for (const [i, e] of (await page.$$('.section-card')).entries()) if ((await e.textContent()).includes('For your information')) await e.screenshot({ path: join(SHOTS, 'infoonly.png') });
  shared = { ...gates, products: saved.products, readonly: true, resolvedPricing: saved.resolvedPricing };
  await page.goto(ORIGIN + '/', { waitUntil: 'load' }); await settle(); await inBoth('employer link');
  shared = null;
  await open({ ...gates, products: gates.products.map((p) => ({ ...p, inputs: { ...p.inputs, infoOnly: true } })) }); await generate();
  must((await look()).sign.split(',').length === 2, '6 every service marked shown-only left nothing to sign');
  shared = { ...again, readonly: true, resolvedPricing: first };
  await page.goto(ORIGIN + '/', { waitUntil: 'load' }); await settle();
  // 5. leaving the whole service off leaves its additional service off
  await page.evaluate(() => { document.querySelector('.opt-check[data-label="ERISA Wrap Document: Enhanced"]').checked = false; });
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
  if (SELF) { shotsOn = false; sabotage = true; const s = await run(browser); console.log(s.length ? 'ok   sabotage caught' : 'FAIL sabotage missed'); if (!s.length) code = 1; }
} finally { await browser.close(); server.close(); }
process.exit(code);
