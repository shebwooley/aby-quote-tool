// ABY Quote Tool — Utility helpers
// Pure formatting and ID-generation functions. No DOM, no business logic.

window.ABYQuote = window.ABYQuote || {};

ABYQuote.utils = (function () {

  // -------------------------------------------------------------
  // Currency formatting
  // -------------------------------------------------------------

  // Format as $X,XXX or $X,XXX.XX depending on whether the value has cents.
  function money(amount) {
    if (amount == null || isNaN(amount)) return '';
    var hasCents = (amount * 100) % 100 !== 0;
    return '$' + Number(amount).toLocaleString('en-US', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2
    });
  }

  // Always format with two decimals (used for PPPM rates like $4.50)
  function moneyExact(amount) {
    if (amount == null || isNaN(amount)) return '';
    return '$' + Number(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  // -------------------------------------------------------------
  // Date formatting
  // -------------------------------------------------------------

  // YYYY-MM-DD (from <input type="date">) → "Month D, YYYY"
  function formatDateLong(yyyymmdd) {
    if (!yyyymmdd) return '';
    var parts = yyyymmdd.split('-');
    if (parts.length !== 3) return yyyymmdd;
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
  }

  // -------------------------------------------------------------
  // Quote number generation
  // Format: <STATE><YYMMDD>-<NNNN>-<C|NC>      e.g. TX260507-9486-C
  // - STATE  = state prefix for this build (set in QUOTE_STATE_PREFIX below)
  // - YYMMDD = quote creation date (2-digit year), NOT effective date
  // - NNNN   = random 4-digit number (low volume; fine for now)
  // - C / NC = commission included or not
  // To deploy for another state, change QUOTE_STATE_PREFIX.
  // -------------------------------------------------------------

  // The DEFAULT state prefix. Still 'TX', still the answer for every public quote.
  var QUOTE_STATE_PREFIX = 'TX';

  /**
   * The prefix a quote number should actually carry.
   *
   * The comment above says "to deploy for another state, change QUOTE_STATE_PREFIX", which was
   * written for a ONE-STATE-PER-DEPLOYMENT model. The ABY-only overlay has since outgrown it: it
   * switches state at RUNTIME via `window.ABY_STATE` and routes it into the engine, so the RATES
   * follow the state while the NUMBER did not -- a California quote came out `TX260806-...` while
   * its rates, its saved `state` column and its admin row all said CA. F-344.
   *
   * Falls back to the default unless the overlay has set a plausible two-letter code, so the public
   * tool -- which never sets `ABY_STATE` -- is byte-identical to before.
   */
  function quoteStatePrefix() {
    var s = (typeof window !== 'undefined' && window.ABY_STATE) ? String(window.ABY_STATE).toUpperCase() : '';
    return /^[A-Z]{2}$/.test(s) ? s : QUOTE_STATE_PREFIX;
  }

  function todayShort() {
    var d = new Date();
    var yy = String(d.getFullYear() % 100).padStart(2, '0');
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yy + mm + dd;
  }

  function generateQuoteNumber(unusedEffectiveDate, commissioned) {
    // First param kept for backward compatibility with app.js; ignored.
    var random = String(Math.floor(1000 + Math.random() * 9000));
    var suffix = commissioned ? 'C' : 'NC';
    return quoteStatePrefix() + todayShort() + '-' + random + '-' + suffix;
  }

  // -------------------------------------------------------------
  // HTML escaping (used by renderer)
  // -------------------------------------------------------------

  function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Convert a list of strings into <p>...</p> blocks (with HTML escaping)
  function paragraphs(arr) {
    if (!arr) return '';
    return arr.map(function (p) { return '<p>' + escapeHtml(p) + '</p>'; }).join('\n');
  }

  // Convert a list of strings into <li>...</li> bullets (with HTML escaping)
  function bullets(arr) {
    if (!arr) return '';
    return arr.map(function (b) { return '<li>' + escapeHtml(b) + '</li>'; }).join('\n');
  }

  return {
    money: money,
    moneyExact: moneyExact,
    formatDateLong: formatDateLong,
    generateQuoteNumber: generateQuoteNumber,
    escapeHtml: escapeHtml,
    paragraphs: paragraphs,
    bullets: bullets
  };
})();
