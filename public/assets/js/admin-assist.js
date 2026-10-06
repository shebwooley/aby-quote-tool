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
    '.aa-out{margin:8px 0 4px;border:1px solid #c9d6e6;background:#f6f9fd;border-radius:7px;padding:10px 12px;font-size:14px;line-height:1.5;color:#1f2a37}' +
    '.aa-out .aa-text{white-space:pre-wrap}' +
    '.aa-out .aa-bar{display:flex;gap:10px;align-items:center;margin-top:8px;font-size:13px;color:#4b5563}' +
    '.aa-out .aa-bar button{font-size:12.5px;padding:3px 10px}' +
    '.aa-out details{margin-top:6px;font-size:13px;color:#4b5563}' +
    '.aa-out .aa-err{color:#a12622}' +
    '.aa-btn{font-size:12px;padding:3px 9px}';
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

  function show(box, d) {
    if (d.error) {
      box.innerHTML = '<div class="aa-err">' + esc(d.error) + '</div>';
      return;
    }
    var looked = d.looked || [];
    var h = '<div class="aa-text">' + esc(d.text) + '</div>';
    if (looked.length) {
      h += '<details><summary>What it looked up (' + looked.length + ')</summary><ul>';
      for (var i = 0; i < looked.length; i++) {
        var l = looked[i];
        h += '<li>' + esc(l.why || 'a lookup') + (l.refused ? ' (refused)' : (l.rows != null ? ' (' + l.rows + ' rows)' : '')) + '</li>';
      }
      h += '</ul></details>';
    }
    h += '<div class="aa-bar"><button type="button" data-aa-copy>Copy</button>' +
         '<span>A draft for you to read. Nothing has been saved or sent.</span>' +
         '<a href="#" data-aa-close style="margin-left:auto">Close</a></div>';
    box.innerHTML = h;
    box.__text = d.text || '';
  }

  async function run(btn) {
    var job = btn.getAttribute('data-assist');
    var payload = { job: job, ids: btn.getAttribute('data-ids') || '', key: btn.getAttribute('data-key') || '', label: btn.getAttribute('data-label') || '' };
    if (job === 'ask') {
      var q = document.getElementById(btn.getAttribute('data-question') || 'aaQuestion');
      payload.question = q ? q.value : '';
    }
    var box = boxAfter(btn);
    box.innerHTML = '<div class="aa-text">Reading the records... this takes a few seconds.</div>';
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
    var close = t.closest('[data-aa-close]');
    if (close) { e.preventDefault(); var b = close.closest('.aa-out'); if (b) b.remove(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.shiftKey) return;
    var t = e.target;
    if (t && t.id === 'aaQuestion') { e.preventDefault(); var b = document.querySelector('[data-assist="ask"]'); if (b) run(b); }
  });
})();
