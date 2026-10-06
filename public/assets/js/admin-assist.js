// THE ADMIN ASSISTANT'S SCREEN HALF (F-603, 10-06-2026). The server half is handleAdminAssistant in
// worker.js; read its header first.
//
// Any element with data-assist="<job>" is a door: a click asks the server and shows the answer in a
// box right under the button's line. ⭐ It lives in its own file, not inside a page template, so it is
// ordinary JavaScript (the page templates forbid backticks and backslashes).
// ⛔ It only SHOWS. The draft can be copied; nothing here saves, sends, merges or marks anything.
(function () {
  'use strict';
  if (window.__abyAssist) return;
  window.__abyAssist = true;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var css = document.createElement('style');
  css.textContent =
    // ⭐ DARK TEXT ON WHITE, 16px (Eric, 10-06-2026: "make the answer text a little darker ... you make it light and it's
    // difficult to read, especially with a shaded background"). No tinted background behind the answer, and no gray lines.
    '.aa-out{margin:8px 0 4px;border:1px solid #c9d6e6;background:#fff;border-radius:7px;padding:12px 14px;font-size:16px;line-height:1.55;color:#111111}' +
    '.aa-out .aa-text{white-space:pre-wrap}' +
    '.aa-out .aa-bar{display:flex;gap:10px;align-items:center;margin-top:10px;font-size:15px;color:#1f2937}' +
    '.aa-out .aa-bar button{font-size:14px;padding:3px 12px}' +
    '.aa-out details{margin-top:8px;font-size:15px;color:#1f2937}' +
    '.aa-out .aa-err{color:#a12622}' +
    '.aa-btn{font-size:12px;padding:3px 9px}' +
    // CLAUDE'S ORANGE (Eric, 10-06-2026: make it obvious we are asking AI). #D97757 is Claude's own orange, used for
    // outlines (3.1:1, enough for a border); #A84E2C fills the buttons so their white text reads at 5.5:1.
    '.aa-claude{background:#A84E2C;color:#fff;border:1px solid #A84E2C;border-radius:6px;font-weight:600;font-size:14px;padding:6px 14px;cursor:pointer}' +
    '.aa-claude:hover{background:#9A4526;border-color:#9A4526}' +
    '.aa-claude:disabled{opacity:.6;cursor:wait}' +
    '.aa-claude.aa-sm{font-size:12.5px;padding:3px 10px}' +
    '.aa-out{border:2px solid #D97757;background:#fff}' +
    '.aa-out .aa-who{font-weight:700;color:#8a3d20;margin-bottom:6px}' +
    '#aaQuestion::placeholder{color:#4b5563;opacity:1}' +
    // The conversation: your question on the right in a white card with a dark border, Claude's answer in the orange-edged
    // card. White behind every word of reading text (Eric: no shaded backgrounds).
    '.aa-me{background:#fff;border:1px solid #6b7280;border-radius:10px;padding:10px 14px;margin:16px 0 6px auto;max-width:85%;width:fit-content;' +
      'white-space:pre-wrap;font-size:16px;line-height:1.5;color:#111}' +
    '.aa-me .aa-mewho{font-weight:700;color:#111;margin-bottom:2px;font-size:15px}' +
    '.aa-turn{margin:8px 0 6px}' +
    '.aa-prop{margin-top:10px;border:1px solid #D97757;border-left:5px solid #D97757;border-radius:7px;padding:10px 12px;background:#fff;color:#111}' +
    '.aa-prop .aa-prop-what{margin-bottom:8px}' +
    '.aa-prop .aa-prop-note{margin-left:10px;font-size:15px;color:#1f2937}' +
    '.aa-prop .aa-prop-done{font-weight:700;color:#111}';
  document.head.appendChild(css);

  function boxAfter(btn) {
    var line = btn.closest('[data-assist-line]') || btn.parentElement;
    var box = line.nextElementSibling;
    if (!box || !box.classList || !box.classList.contains('aa-out')) {
      box = document.createElement('div');
      box.className = 'aa-out';
      line.parentNode.insertBefore(box, line.nextSibling);
    }
    return box;
  }

  // HOW MUCH OF THE MONTH'S CAP IS USED (Eric, 10-06-2026). Shown wherever the page has a #aaUsage line; refreshed
  // after every answer. An estimate from the token counts - the Anthropic console is the real bill.
  function money(n) {
    n = Number(n) || 0;
    return n > 0 && n < 0.01 ? 'less than 1\u00a2' : '$' + n.toFixed(2);
  }
  function paintUsage(u) {
    var el = document.getElementById('aaUsage');
    if (!el || !u || u.error) return;
    el.textContent = 'Used this month: ' + money(u.spent) + ' of $' + u.cap + '.';
  }
  if (document.getElementById('aaUsage')) {
    fetch('/api/admin/assistant/usage').then(function (r) { return r.json(); }).then(paintUsage).catch(function () {});
  }

  function show(box, d) {
    if (d && d.usage) paintUsage(d.usage);
    if (d.error) {
      box.innerHTML = '<div class="aa-err">' + esc(d.error) + '</div>';
      return;
    }
    var looked = d.looked || [];
    var h = '<div class="aa-who">Claude\u2019s answer (AI \u2013 check it before you act on it)</div>' +
            '<div class="aa-text">' + esc(d.text) + '</div>';
    if (looked.length) {
      h += '<details><summary>What it looked up (' + looked.length + ')</summary><ul>';
      for (var i = 0; i < looked.length; i++) {
        var l = looked[i];
        h += '<li>' + esc(l.why || 'a lookup') + (l.refused ? ' (refused)' : (l.rows != null ? ' (' + l.rows + ' rows)' : '')) + '</li>';
      }
      h += '</ul></details>';
    }
    h += '<div class="aa-props">' + proposalsHTML(d.proposals) + '</div>';
    h += '<div class="aa-bar"><button type="button" data-aa-copy>Copy</button>' +
         '<span>Nothing has been saved or changed.</span>' +
         '<a href="#" data-aa-close style="margin-left:auto">Close</a></div>';
    box.innerHTML = h;
    box.__text = d.text || '';
    box.__props = d.proposals || [];
  }

  // ── A CONVERSATION (the Ask Claude page; Eric, 10-06-2026: "I sort of wish that it looked a little more like chatting
  // with Claude or ChatGPT ... would it know what I was talking about if I said yes they are the same") ─────────────
  // Each turn is kept here and the earlier ones are sent with every new question (the server trims them), so a follow-up
  // knows what "they" means. Kept for this browser tab (sessionStorage): a reload keeps it, closing the tab ends it,
  // and New conversation clears it. ⛔ Never localStorage - a conversation about clients should not outlive the tab.
  var CHAT_KEY = 'aby.askClaude.chat';
  var chat = [];
  try { chat = JSON.parse(sessionStorage.getItem(CHAT_KEY) || '[]'); if (!Array.isArray(chat)) chat = []; } catch (e) { chat = []; }
  function saveChat() { try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(chat)); } catch (e) { /* not kept */ } }

  // ── MAKE THIS CHANGE (Eric, 10-06-2026: "Yes, build the button") ────────────────────────────────────────────────
  // A proposal arrives from the server already turned into the SAME requests the tidy screens' own buttons send. It is
  // shown with one button; nothing happens until it is pressed. ⛔ Only these requests may run from here - anything
  // else in a proposal is refused rather than sent.
  var ALLOWED = [
    { method: 'POST', test: function (u) { return u === '/api/admin/crm/relationship'; } },
    { method: 'POST', test: function (u) { return u === '/api/admin/crm/rename'; } },
    { method: 'POST', test: function (u) { return u === '/api/admin/tidy-dismiss'; } },
    { method: 'POST', test: function (u) { return u === '/api/admin/crm/merge-person'; } },
    { method: 'PATCH', test: function (u) { return /^\/api\/quotes\/[^/]+$/.test(u); } },
  ];
  function allowed(step) {
    return !!step && ALLOWED.some(function (a) { return a.method === step.method && a.test(String(step.url || '')); });
  }
  function proposalsHTML(props) {
    return (props || []).map(function (p, i) {
      return '<div class="aa-prop"><div class="aa-prop-what"><b>Proposed change:</b> ' + esc(p.summary) + '</div>' +
        (p.done
          ? '<div class="aa-prop-done">' + esc(p.done) + '</div>'
          : '<button type="button" class="aa-claude aa-sm" data-aa-do="' + i + '">Make this change</button>' +
            '<span class="aa-prop-note">Nothing has changed yet.</span>') +
        '</div>';
    }).join('');
  }
  async function makeChange(btn) {
    var card = btn.closest('.aa-out');
    var props = card && card.__props;
    var p = props && props[Number(btn.getAttribute('data-aa-do'))];
    if (!p || p.done) return;
    var steps = p.steps || [];
    if (!steps.length || !steps.every(allowed)) {
      p.done = 'Not made: this change is not one the page is allowed to make.';
      if (card.__save) card.__save();
      repaintProps(card);
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Making the change…';
    var failed = '';
    for (var i = 0; i < steps.length; i++) {
      try {
        var r = await fetch(steps[i].url, { method: steps[i].method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(steps[i].body || {}) });
        if (!r.ok) {
          var d = await r.json().catch(function () { return {}; });
          failed = d.error || ('it did not save (' + r.status + ')');
          break;
        }
      } catch (e) { failed = 'the connection dropped'; break; }
    }
    // ⛔ A FAILURE IS NAMED, NOT SWALLOWED - the same rule the tidy screens follow. A part-made change says so.
    p.done = failed
      ? (i > 0 ? 'Only partly made (' + i + ' of ' + steps.length + ' steps): ' : 'Not made: ') + failed
      : 'Done. The change is saved.';
    if (card.__save) card.__save();
    repaintProps(card);
  }
  function repaintProps(card) {
    var box = card.querySelector('.aa-props');
    if (box) box.innerHTML = proposalsHTML(card.__props);
  }

  function turnHTML(t) {
    if (t.role === 'user') return '<div class="aa-me"><div class="aa-mewho">You</div>' + esc(t.text) + '</div>';
    var looked = t.looked || [];
    var h = '<div class="aa-out aa-turn"><div class="aa-who">Claude’s answer (AI – check it before you act on it)</div>' +
            '<div class="aa-text">' + esc(t.text) + '</div>';
    if (looked.length) {
      h += '<details><summary>What it looked up (' + looked.length + ')</summary><ul>';
      for (var i = 0; i < looked.length; i++) {
        var l = looked[i];
        h += '<li>' + esc(l.why || 'a lookup') + (l.refused ? ' (refused)' : (l.rows != null ? ' (' + l.rows + ' rows)' : '')) + '</li>';
      }
      h += '</ul></details>';
    }
    h += '<div class="aa-props">' + proposalsHTML(t.proposals) + '</div>';
    return h + '</div>';
  }
  function paintChat(pending, err) {
    var el = document.getElementById('aaChat');
    if (!el) return;
    var h = chat.map(turnHTML).join('');
    if (pending) h += '<div class="aa-out aa-turn"><div class="aa-who">Asking Claude…</div><div class="aa-text">Claude is reading the records. This takes a few seconds.</div></div>';
    if (err) h += '<div class="aa-out aa-turn"><div class="aa-err">' + esc(err) + '</div></div>';
    el.innerHTML = h;
    var cards = el.querySelectorAll('.aa-turn'), k = 0;
    chat.forEach(function (t) {
      if (t.role !== 'assistant') return;
      var c = cards[k++];
      if (c) { c.__props = t.proposals || []; c.__save = saveChat; }
    });
    var ex = document.getElementById('aaExamples');
    if (ex) ex.style.display = chat.length || pending ? 'none' : '';
    var last = el.lastElementChild;
    if (last && (pending || err || chat.length)) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function runChat(btn) {
    var box = document.getElementById('aaQuestion');
    var q = box ? box.value.trim() : '';
    if (!q) { if (box) box.focus(); return; }
    var history = chat.slice();
    chat.push({ role: 'user', text: q });
    box.value = '';
    paintChat(true);
    btn.disabled = true;
    try {
      var r = await fetch('/api/admin/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job: 'ask', question: q, history: history.map(function (t) { return { role: t.role, text: t.text }; }) }),
      });
      var d = await r.json().catch(function () { return { error: 'The answer could not be read (' + r.status + ').' }; });
      if (d.usage) paintUsage(d.usage);
      if (d.error) throw new Error(d.error);
      chat.push({ role: 'assistant', text: d.text || '', looked: d.looked || [], proposals: d.proposals || [] });
      saveChat();
      paintChat(false);
    } catch (e) {
      // The question did not get an answer, so it leaves the conversation and goes back in the box to try again -
      // otherwise the next question would be sent with an unanswered one in front of it.
      chat.pop();
      box.value = q;
      paintChat(false, (e && e.message) || 'Could not reach the assistant. Check the connection and try again.');
    } finally {
      btn.disabled = false;
    }
  }
  if (document.getElementById('aaChat')) paintChat(false);

  async function run(btn) {
    if (btn.getAttribute('data-chat') && document.getElementById('aaChat')) return runChat(btn);
    var job = btn.getAttribute('data-assist');
    var payload = { job: job, ids: btn.getAttribute('data-ids') || '', key: btn.getAttribute('data-key') || '', label: btn.getAttribute('data-label') || '' };
    if (job === 'ask') {
      var q = document.getElementById(btn.getAttribute('data-question') || 'aaQuestion');
      payload.question = q ? q.value : '';
    }
    var box = boxAfter(btn);
    box.innerHTML = '<div class="aa-who">Asking Claude\u2026</div><div class="aa-text">Claude is reading the records. This takes a few seconds.</div>';
    btn.disabled = true;
    try {
      var r = await fetch('/api/admin/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      var d = await r.json().catch(function () { return { error: 'The answer could not be read (' + r.status + ').' }; });
      show(box, d);
    } catch (e) {
      show(box, { error: 'Could not reach the assistant. Check the connection and try again.' });
    } finally {
      btn.disabled = false;
    }
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = t.closest('[data-assist]');
    if (btn) { e.preventDefault(); run(btn); return; }
    var copy = t.closest('[data-aa-copy]');
    if (copy) {
      var box = copy.closest('.aa-out');
      if (box && navigator.clipboard) navigator.clipboard.writeText(box.__text || '').then(function () { copy.textContent = 'Copied'; });
      return;
    }
    var doBtn = t.closest('[data-aa-do]');
    if (doBtn) { e.preventDefault(); makeChange(doBtn); return; }
    if (t.closest('[data-aa-new]')) {
      chat = []; saveChat(); paintChat(false);
      var qb = document.getElementById('aaQuestion'); if (qb) { qb.value = ''; qb.focus(); }
      return;
    }
    var close = t.closest('[data-aa-close]');
    if (close) { e.preventDefault(); var b = close.closest('.aa-out'); if (b) b.remove(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    var t = e.target;
    if (t && t.id === 'aaQuestion') { e.preventDefault(); var b = document.querySelector('[data-assist="ask"]'); if (b) run(b); }
  });
})();
