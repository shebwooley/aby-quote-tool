
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
