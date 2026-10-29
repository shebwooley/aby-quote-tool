// PRINTS A PROPOSAL TO A REAL PDF (10-29-2026, ABY via Eric).
//
// The Download PDF button used to PHOTOGRAPH the page in the browser (html2pdf) and slice the
// picture into pages: 5 MB files, text that cannot be selected, and page breaks that land wherever
// a page height falls. This prints the same document the way Chrome's own "Save as PDF" does, on
// Cloudflare's Browser Rendering, so the print rules in quote.css decide the breaks.
//
// ⛔ It renders HTML the caller sends, so it is fenced: same-site callers only, a size cap,
// JavaScript off, and no network except abyquotes.com (the logo) and inline data. Anything else
// the document asks for is refused, so it cannot be used to fetch other sites.
// 💲 Workers Free gives 10 browser minutes a day (about 3 seconds a proposal). Over that, Cloudflare
// answers 429 and the page falls back to the old in-browser PDF, so a busy day degrades, not breaks.
import puppeteer from '@cloudflare/puppeteer';

const MAX_HTML = 4 * 1024 * 1024;
const ALLOWED_ORIGINS = ['https://abyquotes.com', 'https://aby-quote-tool.eric-185.workers.dev'];

function sameSite(request) {
  const origin = request.headers.get('Origin') || '';
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function safeFilename(name) {
  const base = String(name || 'ABY Quote.pdf').replace(/[^a-zA-Z0-9 ._-]/g, '').trim() || 'ABY Quote.pdf';
  return /\.pdf$/i.test(base) ? base : base + '.pdf';
}

export async function handleQuotePdf(request, env) {
  if (!sameSite(request)) return new Response('Not allowed', { status: 403 });
  if (!env.BROWSER) return new Response('PDF printing is not set up', { status: 503 });
  let body;
  try { body = await request.json(); } catch (e) { return new Response('Bad request', { status: 400 }); }
  const html = typeof body.html === 'string' ? body.html : '';
  if (!html || html.length > MAX_HTML) return new Response('Bad request', { status: 400 });

  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if (u.startsWith('data:') || u.startsWith('about:') || u.startsWith('https://abyquotes.com/')) req.continue();
      else req.abort();
    });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20000 });
    const pdf = await page.pdf({
      format: 'letter',
      printBackground: true,
      margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' },
      scale: 0.85,
    });
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="' + safeFilename(body.filename) + '"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const msg = String(err && err.message || err);
    // Cloudflare's daily browser allowance is used up: say so, so the page can fall back.
    const status = /429|limit/i.test(msg) ? 429 : 502;
    return new Response('PDF printing failed', { status });
  } finally {
    if (browser) { try { await browser.close(); } catch (e) { /* already gone */ } }
  }
}
