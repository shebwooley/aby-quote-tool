/**
 * The employer application page (F-625). Served at /q/<token>/apply and, read-only, at
 * /admin/application?cid=<commitment id>. The questions are data: assets/js/data/application-questions.js.
 *
 * SAVE AND COME BACK (Eric, 09-29-2026: "If they can save and come back, that would be preferable.")
 * Every change saves to the server a moment after it is made, so the link itself is the saved state:
 * the employer can close the page, and a broker helping them can open the same link and carry on.
 *
 * ASKED ONCE: the page shows the union of the questions each purchased form needs (see visible()).
 */
(function () {
  'use strict';
  var A = window.ABY_APPLICATION;
  var app = document.getElementById('app');
  var who = document.getElementById('who');

  var path = location.pathname;
  var adminMode = path.indexOf('/admin/') === 0;
  var token = adminMode ? '' : (path.split('/')[2] || '');
  var cid = adminMode ? (new URLSearchParams(location.search).get('cid') || '') : '';
  var API = adminMode ? '/api/admin/application?cid=' + encodeURIComponent(cid)
                      : '/api/q/' + encodeURIComponent(token) + '/application';

  var state = { data: null, answers: {}, prefilled: {}, step: 0, readonly: false, saveTimer: null, saving: false, dirty: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }
  function usDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function isBlank(v) {
    if (v == null) return true;
    if (Array.isArray(v)) return !v.some(function (x) { return String(x || '').trim() !== ''; });
    if (typeof v === 'boolean') return false;
    return String(v).trim() === '';
  }

  // ── load ───────────────────────────────────────────────────────────────────────────────────
  fetch(API, { headers: { 'Accept': 'application/json' } }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; });
  }).then(function (res) {
    if (res.status !== 200 || !res.body.ok) return fail(res.status, res.body);
    var d = res.body;
    state.data = d;
    state.readonly = adminMode || d.status === 'submitted';
    state.answers = d.answers || {};
    // PREFILL NEVER OVERWRITES: an answer anybody saved wins over what the authorization said.
    Object.keys(d.prefill || {}).forEach(function (k) {
      if (state.answers[k] === undefined && !isBlank(d.prefill[k])) {
        state.answers[k] = d.prefill[k];
        state.prefilled[k] = true;
      }
    });
    who.innerHTML = '<strong>' + esc(d.employerName || '') + '</strong>' +
      (d.quoteNumber ? ' &middot; quote ' + esc(d.quoteNumber) : '') +
      (d.brokerName || d.brokerAgency ? ' &middot; broker: ' + esc([d.brokerName, d.brokerAgency].filter(Boolean).join(', ')) : '');
    render();
  }).catch(function () { fail(0, {}); });

  function fail(status, body) {
    var msg = 'This page could not be loaded. Please check the link, or contact ABY Benefits at 817-731-6258.';
    if (status === 404) msg = 'We could not find this link. Please check that you have the whole address, or ask your broker or ABY Benefits for it again.';
    if (body && body.error === 'not_signed') msg = 'The setup questions open once the authorization on your quote has been submitted. Please go back to your quote, complete the Employer Acceptance and Authorization page, and submit it.';
    if (status === 401) msg = 'Please sign in to the ABY admin first.';
    app.innerHTML = '<div class="card"><div class="note bad">' + esc(msg) + '</div></div>';
  }

  // ── what to show ─────────────────────────────────────────────────────────────────────────
  function sections() { return A.visible(state.data.forms || [], state.answers); }
  function steps() {
    var list = sections().map(function (s) { return { id: s.section.id, title: s.section.title, questions: s.questions, section: s.section }; });
    list.push({ id: 'review', title: state.readonly ? 'Summary' : 'Review and submit', questions: [] });
    return list;
  }
  function blanks(questions) {
    return questions.filter(function (q) { return isBlank(state.answers[q.key]); });
  }

  function render() {
    var st = steps();
    if (state.step >= st.length) state.step = st.length - 1;
    var cur = st[state.step];
    var d = state.data;

    var html = '';
    html += '<h1>' + (adminMode ? 'Setup questions (ABY view)' : 'Setting up your ABY services') + '</h1>';
    if (state.step === 0) {
      html += '<p class="lead">' + (adminMode
        ? 'What the employer has answered so far. This view is read-only.'
        : 'A few questions ABY needs to set up the services you authorized. Your answers save as you go, so you can stop and come back to this same link any time. Your broker can open it too and fill in anything they know.') + '</p>';
      html += intro();
    }
    html += '<ul class="steps">' + st.map(function (s, i) {
      var n = s.id === 'review' ? '' : blanks(s.questions).length;
      return '<li><button type="button" data-step="' + i + '" class="' + (i === state.step ? 'on' : '') + '">' + esc(s.title) +
        (n ? '<span class="n">' + n + ' to go</span>' : '') + '</button></li>';
    }).join('') + '</ul>';

    html += '<div class="card">';
    if (cur.id === 'review') html += review(st);
    else {
      html += '<h2>' + esc(cur.title) + '</h2>';
      if (cur.section.intro) html += '<p class="intro">' + esc(cur.section.intro) + '</p>';
      if (cur.id === 'hra' && !state.readonly) {
        html += '<div class="note info">Bank details for reimbursements (Section 7 of the ABY form) are not asked here. They go through the secure upload, because an account number should never travel by email or sit on a web form.</div>';
      }
      html += '<div class="grid">' + cur.questions.map(question).join('') + '</div>';
    }
    html += '<div class="nav">' +
      (state.step > 0 ? '<button class="btn ghost" type="button" data-go="-1">Back</button>' : '<span></span>') +
      '<span class="saved" id="saved">' + savedText() + '</span>' +
      '<button class="btn ghost" type="button" id="printBtn">Print my answers</button>' +
      (state.step < st.length - 1 ? '<button class="btn" type="button" data-go="1">Next</button>' : '<span></span>') +
      '</div></div>';

    app.innerHTML = html;
    wire();
    printView();
  }

  // The paper version: every question the employer is being asked, all sections, answers as plain
  // text. Blank questions print as blank so a printed copy can be filled in by hand if wanted.
  function shown(q, v) {
    if (isBlank(v)) return '';
    if (v === true) return 'Yes';
    if (v === false) return 'No';
    if (Array.isArray(v)) return v.filter(function (x) { return String(x || '').trim(); }).join('; ');
    if (q.type === 'money' && /^[0-9.,]+$/.test(String(v))) return '$' + v;
    return String(v);
  }
  function printView() {
    var pv = document.getElementById('printview');
    if (!pv) return;
    var d = state.data;
    var out = '<h1>Setup questions for ABY Benefits</h1><p>' + esc(d.employerName || '') +
      (d.quoteNumber ? ' &middot; quote ' + esc(d.quoteNumber) : '') +
      (d.status === 'submitted' ? ' &middot; submitted' + (d.submittedAt ? ' ' + esc(usDate(d.submittedAt)) : '') : ' &middot; not yet submitted') + '</p>';
    sections().forEach(function (s) {
      out += '<div class="pv-sec"><h3>' + esc(s.section.title) + '</h3>' + s.questions.map(function (q) {
        var a = shown(q, state.answers[q.key]);
        return '<div class="pv-row"><div>' + esc(q.label) + '</div><div class="a' + (a ? '' : ' blank') + '">' + (a ? esc(a) : 'blank') + '</div></div>';
      }).join('') + '</div>';
    });
    pv.innerHTML = out;
  }

  function intro() {
    var d = state.data;
    var out = '';
    if (d.status === 'submitted') {
      out += '<div class="note ok"><strong>Submitted to ABY' + (d.submittedAt ? ' on ' + esc(usDate(d.submittedAt)) : '') + '.</strong>' +
        (d.submittedBy ? ' By ' + esc(d.submittedBy) + '.' : '') +
        (adminMode ? '' : ' To change an answer now, contact ABY Benefits or your broker.') + '</div>';
    }
    var names = (d.forms || []).map(function (f) { return A.FORMS[f] ? A.FORMS[f].title : f; });
    if (names.length) out += '<div class="note info">Questions for: <strong>' + esc(names.join(' and ')) + '</strong>. Anything the two share is asked only once.</div>';
    if (d.otherServices && d.otherServices.length) {
      out += '<div class="note info">ABY will follow up separately about: ' + esc(d.otherServices.join(', ')) + '.</div>';
    }
    return out;
  }

  // ── one question ─────────────────────────────────────────────────────────────────────────
  function question(q) {
    var v = state.answers[q.key];
    var ro = state.readonly ? ' readonly' : '';
    var dis = state.readonly ? ' disabled' : '';
    var cls = 'q' + (q.half ? ' half' : '') + (q.third ? ' third' : '') + (/\.offered$/.test(q.key) ? ' head' : '');
    var tag = state.prefilled[q.key] ? '<span class="tag">From your authorization</span>' : '';
    var id = 'f_' + q.key.replace(/[^a-z0-9]/gi, '_');
    var lbl = '<label for="' + id + '">' + esc(q.label) + tag + '</label>';
    var hint = q.hint ? '<div class="hint">' + esc(q.hint) + '</div>' : '';
    // "Why ABY asks this" (Eric, 09-29-2026: "drop-down instructions or why is this needed type info").
    if (q.why) hint += '<details class="why"><summary>Why ABY asks this</summary><div>' + esc(q.why) + '</div></details>';
    var input = '';
    var attr = ' id="' + id + '" data-key="' + esc(q.key) + '"';
    switch (q.type) {
      case 'yesno':
        lbl = '<div class="lbl">' + esc(q.label) + tag + '</div>';
        input = '<div class="opts">' + [['Yes', true], ['No', false]].map(function (o) {
          return '<label><input type="radio" name="' + id + '" data-key="' + esc(q.key) + '" data-bool="' + o[1] + '"' +
            (v === o[1] ? ' checked' : '') + dis + '> ' + o[0] + '</label>';
        }).join('') + '</div>';
        break;
      case 'choice':
        lbl = '<div class="lbl">' + esc(q.label) + tag + '</div>';
        input = '<div class="opts">' + q.options.map(function (o) {
          return '<label><input type="radio" name="' + id + '" data-key="' + esc(q.key) + '" value="' + esc(o) + '"' +
            (v === o ? ' checked' : '') + dis + '> ' + esc(o) + '</label>';
        }).join('') + '</div>';
        break;
      case 'multi':
        lbl = '<div class="lbl">' + esc(q.label) + tag + '</div>';
        input = '<div class="opts">' + q.options.map(function (o) {
          var on = Array.isArray(v) && v.indexOf(o) >= 0;
          return '<label><input type="checkbox" data-multi="' + esc(q.key) + '" value="' + esc(o) + '"' + (on ? ' checked' : '') + dis + '> ' + esc(o) + '</label>';
        }).join('') + '</div>';
        break;
      case 'state':
        input = '<select' + attr + dis + '><option value="">Choose a state</option>' + A.STATES.map(function (s) {
          return '<option' + (v === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('') + '</select>';
        break;
      case 'textarea':
        input = '<textarea' + attr + ro + '>' + esc(v || '') + '</textarea>';
        break;
      case 'list':
        var arr = Array.isArray(v) ? v : [];
        var rows = [];
        for (var i = 0; i < (q.max || 4); i++) {
          rows.push('<input type="text" data-list="' + esc(q.key) + '" data-i="' + i + '" value="' + esc(arr[i] || '') + '"' + ro + '>');
        }
        input = '<div class="list">' + rows.join('') + '</div>';
        break;
      default:
        var type = { email: 'email', tel: 'tel', date: 'date', number: 'text' }[q.type] || 'text';
        var extra = '';
        if (q.type === 'number') extra = ' inputmode="numeric"';
        if (q.type === 'money') extra = ' inputmode="decimal" placeholder="$"';
        if (q.type === 'md') extra = ' placeholder="MM-DD" maxlength="5"';
        if (q.type === 'ein') extra = ' placeholder="12-3456789" maxlength="10"';
        input = '<input type="' + type + '"' + attr + ' value="' + esc(v == null ? '' : v) + '"' + extra + ro + '>';
    }
    return '<div class="' + cls + '">' + lbl + hint + input + '</div>';
  }

  // ── review ───────────────────────────────────────────────────────────────────────────────
  function review(st) {
    var d = state.data;
    var out = '<h2>' + (state.readonly ? 'Summary' : 'Review and submit') + '</h2>';
    var open = [];
    st.forEach(function (s, i) {
      if (s.id === 'review') return;
      var b = blanks(s.questions);
      if (b.length) open.push({ i: i, title: s.title, n: b.length });
    });
    if (open.length) {
      out += '<div class="note warn"><strong>' + (state.readonly ? 'Still blank:' : 'Some questions are still blank.') + '</strong>' +
        (state.readonly ? '' : ' You can submit anyway and ABY will ask about them, but answering now saves a phone call.') +
        '<ul>' + open.map(function (o) {
          return '<li class="review-sec"><a data-step="' + o.i + '">' + esc(o.title) + '</a>: ' + o.n + ' blank</li>';
        }).join('') + '</ul></div>';
    } else {
      out += '<div class="note ok">Every question is answered.</div>';
    }

    out += '<h2 style="margin-top:22px">Your employee census' + ((d.forms || []).indexOf('hra') >= 0 ? ' and bank details' : '') + '</h2>';
    out += '<p class="intro">ABY also needs a list of your employees and their covered dependents, in ABY\'s spreadsheet. Download it, fill it in, and send it back through the secure upload ABY provides. Please do not email it: it holds Social Security numbers and dates of birth.</p>';
    out += '<div class="download">' + (d.forms || []).map(function (f) {
      var file = f === 'cobra' ? 'ABY-COBRA-census-template.xlsx' : 'ABY-HRA-census-template.xlsx';
      return '<a href="/assets/forms/' + file + '" download>Download the ' + (f === 'cobra' ? 'COBRA' : 'HRA') + ' census spreadsheet</a>';
    }).join('') + '</div>';

    if (state.readonly) return out;

    out += '<h2 style="margin-top:26px">Submit to ABY</h2>' +
      '<p class="intro">Submitting sends your answers to ABY. It is not a contract: ABY will send the Administrative Services Agreement for signature separately.</p>' +
      '<div class="grid">' +
      '<div class="q half"><label for="subName">Your name</label><input type="text" id="subName" value="' + esc(state.answers['contact.signer.name'] || '') + '"></div>' +
      '<div class="q half"><label for="subEmail">Your email</label><input type="email" id="subEmail" value="' + esc(state.answers['contact.signer.email'] || '') + '"></div>' +
      '<div class="q"><div class="opts"><label><input type="checkbox" id="subOk"> To the best of my knowledge, these answers are accurate.</label></div></div>' +
      '</div>' +
      '<div class="nav"><span></span><button class="btn" type="button" id="submitBtn">Submit to ABY</button></div>' +
      '<div id="subMsg"></div>';
    return out;
  }

  // ── events ───────────────────────────────────────────────────────────────────────────────
  function wire() {
    app.querySelectorAll('[data-step]').forEach(function (b) {
      b.addEventListener('click', function () { go(Number(b.getAttribute('data-step'))); });
    });
    var pb = document.getElementById('printBtn');
    if (pb) pb.addEventListener('click', function () { if (state.dirty) saveNow(); printView(); window.print(); });
    app.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () { go(state.step + Number(b.getAttribute('data-go'))); });
    });
    if (state.readonly) return;

    app.querySelectorAll('input[data-key], select[data-key], textarea[data-key]').forEach(function (inp) {
      var evt = (inp.type === 'radio' || inp.tagName === 'SELECT') ? 'change' : 'input';
      inp.addEventListener(evt, function () {
        var k = inp.getAttribute('data-key');
        var val;
        if (inp.type === 'radio') val = inp.hasAttribute('data-bool') ? inp.getAttribute('data-bool') === 'true' : inp.value;
        else val = inp.value;
        set(k, val, inp.type === 'radio' || inp.tagName === 'SELECT');
      });
    });
    app.querySelectorAll('input[data-multi]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var k = inp.getAttribute('data-multi');
        var vals = [];
        app.querySelectorAll('input[data-multi="' + k + '"]').forEach(function (c) { if (c.checked) vals.push(c.value); });
        set(k, vals, true);
      });
    });
    app.querySelectorAll('input[data-list]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var k = inp.getAttribute('data-list');
        var vals = [];
        app.querySelectorAll('input[data-list="' + k + '"]').forEach(function (c) { vals.push(c.value); });
        set(k, vals, false);
      });
    });
    var sb = document.getElementById('submitBtn');
    if (sb) sb.addEventListener('click', submit);
  }

  // A choice can open or close follow-up questions, so it redraws the step; typing does not,
  // or the cursor would jump out of the box being typed in.
  function set(k, v, redraw) {
    state.answers[k] = v;
    delete state.prefilled[k];
    state.dirty = true;
    scheduleSave();
    if (redraw) render();
  }

  function go(i) {
    var n = steps().length;
    state.step = Math.max(0, Math.min(n - 1, i));
    if (state.dirty) saveNow();
    render();
    window.scrollTo(0, 0);
  }

  function savedText() {
    if (state.readonly) return '';
    if (state.saveError) return '<span class="saved err">' + esc(state.saveError) + '</span>';
    if (state.saving) return 'Saving...';
    if (state.data && state.data.updatedAt) return 'Saved ' + esc(usDate(state.data.updatedAt));
    return 'Your answers save as you go.';
  }
  function showSaved() { var s = document.getElementById('saved'); if (s) s.innerHTML = savedText(); }

  function scheduleSave() {
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, 900);
  }
  function saveNow() {
    clearTimeout(state.saveTimer);
    if (!state.dirty || state.saving) return;
    state.saving = true; state.dirty = false; showSaved();
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: state.answers }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        state.saving = false;
        if (res.status === 200 && res.body.ok) { state.saveError = ''; state.data.updatedAt = res.body.updatedAt; }
        else { state.dirty = true; state.saveError = (res.body && res.body.message) || 'Not saved - please check your connection and try again.'; }
        showSaved();
        if (state.dirty && !state.saveError) scheduleSave();
      })
      .catch(function () { state.saving = false; state.dirty = true; state.saveError = 'Not saved - please check your connection.'; showSaved(); });
  }

  function submit() {
    var msg = document.getElementById('subMsg');
    var name = (document.getElementById('subName').value || '').trim();
    var email = (document.getElementById('subEmail').value || '').trim();
    if (!name || !email) { msg.innerHTML = '<div class="note bad">Please enter your name and email.</div>'; return; }
    if (!document.getElementById('subOk').checked) { msg.innerHTML = '<div class="note bad">Please check the box to confirm the answers.</div>'; return; }
    var btn = document.getElementById('submitBtn');
    btn.disabled = true; btn.textContent = 'Submitting...';
    fetch(API + '/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: state.answers, submittedBy: name, submittedEmail: email, confirmed: true }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.status === 200 && res.body.ok) {
          state.data.status = 'submitted';
          state.data.submittedAt = res.body.submittedAt;
          state.data.submittedBy = name;
          state.readonly = true; state.dirty = false;
          state.step = 0;
          render();
          window.scrollTo(0, 0);
        } else {
          btn.disabled = false; btn.textContent = 'Submit to ABY';
          msg.innerHTML = '<div class="note bad">' + esc((res.body && res.body.message) || 'That did not go through. Please try again, or call ABY Benefits at 817-731-6258.') + '</div>';
        }
      })
      .catch(function () {
        btn.disabled = false; btn.textContent = 'Submit to ABY';
        msg.innerHTML = '<div class="note bad">Network error. Your answers are saved; please try submitting again.</div>';
      });
  }

  window.addEventListener('beforeunload', function () { if (state.dirty) saveNow(); });
  // Ctrl+P prints the plain list too, with whatever was typed a moment ago.
  window.addEventListener('beforeprint', function () { if (state.data) printView(); });
})();
