// ABY Quote Tool — Quote renderer (2026 redesign)
// Takes form data + engine results and produces the full quote HTML.
// Output is wrapped in a single .aby-proposal root so quote.css styles it in
// isolation, and the same markup + stylesheet are reused for the downloadable
// client file (see app.js downloadQuoteAsHtml) so preview and PDF always match.

window.ABYQuote = window.ABYQuote || {};

ABYQuote.renderer = (function () {

  var u = null;
  var L = null;

  var CHEV = '<svg class="fee-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>';
  var LM_CHEV = '<svg class="lm-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4l4 4-4 4"/></svg>';

  var FEED_PROVIDERS = [
    'ADP', 'Bswift', 'Ceridian', 'Employee Navigator', 'Exponent HR',
    'Netchex', 'Paycom', 'Paycor', 'Paychex', 'Selerix',
    'UKG', 'Workday', 'Workforce Now'
  ];

  function init() { u = ABYQuote.utils; L = ABYQuote.language; }
  function esc(s) { return u.escapeHtml(s == null ? '' : String(s)); }

  function findProduct(productId) {
    for (var i = 0; i < ABYQuote.products.length; i++) {
      if (ABYQuote.products[i].id === productId) return ABYQuote.products[i];
    }
    return null;
  }
  function findPackage(productMeta, packageId) {
    if (!productMeta || !productMeta.packages) return null;
    for (var i = 0; i < productMeta.packages.length; i++) {
      if (productMeta.packages[i].id === packageId) return productMeta.packages[i];
    }
    return null;
  }
  function firstSentence(text) {
    if (!text) return '';
    var m = String(text).match(/^[\s\S]*?[.!?](\s|$)/);
    return (m ? m[0] : String(text)).trim();
  }
  function splitPackageName(name) {
    if (!name) return { name: '', detail: '' };
    var parts = String(name).split(/\s*[:–—]\s*/);
    if (parts.length < 2) return { name: parts[0].trim(), detail: '' };
    return { name: parts[0].trim(), detail: parts.slice(1).join(': ').trim() };
  }

  function renderTopbar(form) {
    var strongLine = form.clientName
      ? '<strong>Prepared for ' + esc(form.clientName) + '</strong>'
      : '<strong>Administrative Services Proposal</strong>';
    var detailLines = [];
    if (form.brokerName || form.brokerAgency) {
      detailLines.push('Broker: ' + esc([form.brokerName, form.brokerAgency].filter(Boolean).join(', ')));
    }
    var brokerContact = [];
    if (form.brokerPhone) brokerContact.push(esc(form.brokerPhone));
    if (form.brokerEmail) brokerContact.push(esc(form.brokerEmail));
    if (brokerContact.length) detailLines.push(brokerContact.join(' &nbsp;|&nbsp; '));
    // strongLine is a block element, so detail lines follow directly (no leading <br>)
    var preparedHtml = strongLine + detailLines.join('<br>');
    var brokerLogo = form.brokerLogoDataUrl
      ? '<img class="broker-logo" src="' + esc(form.brokerLogoDataUrl) + '" alt="Broker logo">'
      : '';
    return [
      '<div class="topbar">',
      '  <div class="logo-wrap"><img src="assets/images/aby-logo.png" alt="ABY Benefits LLC"></div>',
      '  <div class="prepared-for">',
      '    ' + preparedHtml,
      brokerLogo ? '    <br>' + brokerLogo : '',
      '  </div>',
      '</div>'
    ].filter(Boolean).join('\n');
  }

  function proposalTitle(groups) {
    var names = groups.map(function (g) {
      var meta = findProduct(g.productId);
      return meta ? (meta.shortName || meta.name) : g.productId;
    });
    if (names.length === 0) return 'Administrative Services Proposal';
    if (names.length <= 3) return names.join(' & ');
    return 'Employee Benefits Administrative Services Proposal';
  }

  function renderHero(form, groups, quoteNumber) {
    var meta = [];
    if (form.effectiveDate) meta.push('<div><span>Effective date</span><strong>' + esc(u.formatDateLong(form.effectiveDate)) + '</strong></div>');
    meta.push('<div><span>Quote number</span><strong>' + esc(quoteNumber) + '</strong></div>');
    meta.push('<div><span>Prepared by</span><strong>ABY Benefits LLC</strong></div>');
    return [
      '<div class="hero">',
      '  <div class="eyebrow">Employee benefits administrative services proposal</div>',
      '  <h1>' + esc(proposalTitle(groups)) + '</h1>',
      '  <p>Prepared' + (form.clientName ? ' for ' + esc(form.clientName) : '') +
        ' to outline the administrative services, pricing, and compliance support described below.</p>',
      '  <div class="hero-meta">' + meta.join('') + '</div>',
      '</div>'
    ].join('\n');
  }

  function renderHeroTiles(groups) {
    if (groups.length === 0) return '';
    var cls = groups.length === 1 ? ' cols-1' : (groups.length === 2 ? ' cols-2' : '');
    var tiles = groups.map(function (g) {
      var meta = findProduct(g.productId);
      var lang = L.products[g.productId];
      var title = meta ? (meta.shortName || meta.name) : g.productId;
      var blurb = lang && lang.paragraphs ? firstSentence(lang.paragraphs[0]) : '';
      return '<div class="hero-tile"><h3>' + esc(title) + '</h3><p>' + esc(blurb) + '</p></div>';
    }).join('\n');
    return '<div class="hero-grid' + cls + '">\n' + tiles + '\n</div>';
  }

  function renderAboutABY() {
    var a = L.aboutABY;
    return [
      '<section>',
      '  <div class="section-card">',
      '    <div class="section-head"><h2>' + esc(a.heading) + '</h2><p>A Dallas–Fort Worth–based third-party administrator, founded in 1986 and headquartered in Plano, Texas.</p></div>',
      '    <div class="section-body">',
      a.paragraphs.map(function (p) { return '      <p>' + esc(p) + '</p>'; }).join('\n'),
      '      <div class="callout"><h3>Experience Highlights</h3><ul>' +
        a.experienceHighlights.map(function (h) { return '<li>' + esc(h) + '</li>'; }).join('') + '</ul></div>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n');
  }

  function renderStandardServices() {
    var s = L.standardServices;
    var items = s.items.map(function (item) {
      var text = (item && typeof item === 'object') ? item.text : item;
      var isFeature = (item && typeof item === 'object' && item.bold && /account manager/i.test(text));
      if (/fees guaranteed/i.test(text)) return '';
      return '<div class="service-item' + (isFeature ? ' feature' : '') + '">' + esc(text) + '</div>';
    }).filter(Boolean).join('\n');
    return [
      '<section>',
      '  <div class="section-card">',
      '    <div class="section-head green"><h2>' + esc(s.heading) + '</h2><p>' + esc(s.intro) + '</p></div>',
      '    <div class="section-body">',
      '      <div class="service-list">' + items + '</div>',
      '      <div class="guarantee">✓ ' + esc(L.feeGuarantee || 'All fees guaranteed for three (3) years.') + '</div>',
      '      <p class="muted" style="margin-top:14px;">' + esc(s.closing) + '</p>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n');
  }

  function renderLearnMore(productId) {
    var lang = L.products[productId];
    if (!lang) return '';
    var body = [];
    (lang.paragraphs || []).forEach(function (p) { body.push('<p>' + esc(p) + '</p>'); });
    if (lang.bulletHeading) body.push('<p>' + esc(lang.bulletHeading) + '</p>');
    if (lang.bullets) body.push('<ul>' + lang.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>');
    (lang.closing || []).forEach(function (p) { body.push('<p>' + esc(p) + '</p>'); });
    if (body.length === 0) return '';
    var shortName = (findProduct(productId) || {}).shortName || (lang.heading || '');
    return [
      '<details class="learn-more">',
      '  <summary>' + LM_CHEV + 'Learn more about ' + esc(shortName) + ' compliance</summary>',
      '  <div class="lm-body">' + body.join('\n') + '</div>',
      '</details>'
    ].join('\n');
  }

  function renderPricingCards(result, meta) {
    var cards = [];
    if (result.setupFee) cards.push({ label: result.setupFee.label || 'Setup fee', price: u.money(result.setupFee.amount), note: 'One-time setup.' });
    if (result.docsFee) cards.push({ label: result.docsFee.label || 'Documents', price: u.money(result.docsFee.amount), note: 'One-time.' });
    if (result.renewalFee != null) cards.push({ label: result.renewalFee.label || 'Annual renewal', price: u.money(result.renewalFee.amount), note: 'Per year.' });
    if (result.annualFee != null) {
      var aNote = (result.annualFee.count != null && meta.countLabel) ? 'Estimated for ' + result.annualFee.count + ' ' + meta.countLabel + '.' : 'Per year.';
      if (result.formulaBreakdown) aNote = result.formulaBreakdown;
      cards.push({ label: result.annualFee.label || 'Annual fee', price: u.money(result.annualFee.amount), note: aNote });
    }
    if (result.monthlyFee) {
      var mNote = [];
      if (result.monthlyFee.tierLabel) mNote.push(esc(result.monthlyFee.tierLabel));
      if (result.monthlyFee.breakdown) mNote.push(esc(result.monthlyFee.breakdown));
      cards.push({
        label: result.monthlyFee.label || 'Monthly administration',
        price: u.money(result.monthlyFee.amount) + ' <small>monthly</small>',
        note: mNote.join(' '),
        featured: true,
        badge: (result.monthlyFee.count != null) ? 'Est. this group' : ''
      });
    }
    if (cards.length === 0) {
      cards.push({ label: 'Pricing', price: 'On request', note: 'Provide selection details for a quote.' });
    }
    var cls = cards.length === 1 ? ' cols-1' : (cards.length === 2 ? ' cols-2' : '');
    var html = cards.map(function (c) {
      return '<div class="price-box' + (c.featured ? ' featured' : '') + '">' +
        (c.badge ? '<span class="badge">' + esc(c.badge) + '</span>' : '') +
        '<div class="price-label">' + esc(c.label) + '</div>' +
        '<div class="price">' + c.price + '</div>' +
        (c.note ? '<p class="muted">' + c.note + '</p>' : '') +
        '</div>';
    }).join('\n');
    return '<div class="pricing-grid' + cls + '">\n' + html + '\n</div>';
  }

  function renderOptionsTable(group, meta, recommendedPackageId) {
    var rows = group.results.map(function (r) {
      var pkg = findPackage(meta, r.packageId) || {};
      var parsed = splitPackageName(pkg.name || r.packageLabel || r.packageId);
      var isRec = recommendedPackageId && r.packageId === recommendedPackageId;
      var setup = r.setupFee ? u.money(r.setupFee.amount) : (r.annualFee ? u.money(r.annualFee.amount) : 'n/a');
      var renew = (r.renewalFee != null) ? u.money(r.renewalFee.amount) : 'n/a';
      return '<tr' + (isRec ? ' class="recommended"' : '') + '>' +
        '<td>' + esc(parsed.name) + (isRec ? '<span class="rec-tag">Recommended</span>' : '') + '</td>' +
        '<td>' + esc(parsed.detail || pkg.description || '') + '</td>' +
        '<td>' + setup + '</td>' +
        '<td>' + renew + '</td></tr>';
    }).join('\n');
    return [
      '<table class="options-table">',
      '  <thead><tr><th>Option</th><th>What is included</th><th>Setup fee</th><th>Annual renewal</th></tr></thead>',
      '  <tbody>' + rows + '</tbody>',
      '</table>'
    ].join('\n');
  }

  function renderFeeSchedule(result, meta) {
    var fees = result.additionalFees || [];
    if (fees.length === 0) return '';
    var items = fees.map(function (f) {
      var amt = (f.amount === 0) ? 'Included' : u.money(f.amount);
      var unit = (f.amount !== 0 && f.unit) ? ' <span class="fee-unit">' + esc(f.unit) + '</span>' : '';
      var explain = f.description ? '<div class="fee-explain">' + esc(f.description) + '</div>' : '';
      return '<details class="fee-item">' +
        '<summary>' + CHEV + '<span class="fee-name">' + esc(f.label) + '</span>' +
        '<span class="fee-amount">' + amt + unit + '</span></summary>' +
        explain + '</details>';
    }).join('\n');
    return [
      '<div class="fees-wrap">',
      '  <div class="fees-title">Additional Services Fee Schedule: ' + esc(meta.shortName || meta.name) + '</div>',
      '  <p class="fee-hint">Tap any line to see what it covers.</p>',
      items,
      '</div>'
    ].join('\n');
  }

  function renderProductSection(group, form) {
    var meta = findProduct(group.productId);
    if (!meta) return '';
    var lang = L.products[group.productId] || {};
    var recMap = form.recommendedPackages || {};
    var isOptions = group.results.length > 1;
    var pricing = isOptions
      ? renderOptionsTable(group, meta, recMap[group.productId])
      : renderPricingCards(group.results[0], meta);
    var first = group.results[0];
    var notes = (first.notes || []).filter(function (n) { return n && n.indexOf('TODO') !== 0; });
    var notesHtml = notes.length
      ? '<p class="muted" style="font-size:12.5px;margin-top:12px;">' + notes.map(esc).join(' ') + '</p>'
      : '';
    var intro = (lang.paragraphs && lang.paragraphs[0]) ? '<p>' + esc(lang.paragraphs[0]) + '</p>' : '';
    return [
      '<section>',
      '  <div class="section-card">',
      '    <div class="section-head"><h2>' + esc(lang.heading || meta.name) + '</h2></div>',
      '    <div class="section-body">',
      intro,
      renderLearnMore(group.productId),
      pricing,
      renderFeeSchedule(first, meta),
      notesHtml,
      '    </div>',
      '  </div>',
      '</section>'
    ].filter(Boolean).join('\n');
  }

  function renderDisclosures() {
    var d = L.disclaimer;
    return [
      '<section>',
      '  <div class="section-card">',
      '    <div class="section-head"><h2>' + esc(d.heading) + '</h2></div>',
      '    <div class="section-body">',
      '      <p class="disclaimer-text">' + esc(d.text) + '</p>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n');
  }

  function renderFileFeed() {
    var chips = FEED_PROVIDERS.map(function (p) { return '<span class="feed-chip">' + esc(p) + '</span>'; }).join('');
    return [
      '<section>',
      '  <div class="section-card">',
      '    <div class="section-head"><h2>File Feed Integration</h2><p>ABY is integrated with numerous HRIS and payroll providers, and can set up file feeds with new providers using our SFTPs. A partial list of current integrations:</p></div>',
      '    <div class="section-body"><div class="feed-chips">' + chips + '</div></div>',
      '  </div>',
      '</section>'
    ].join('\n');
  }

  function applyBundlingRules(quotedIds, candidates) {
    var q = {};
    quotedIds.forEach(function (id) { q[id] = true; });
    return candidates.filter(function (s) {
      if (q[s.id]) return false;
      if (s.id === 'stateContinuation' && q.cobra) return false;
      if (s.id === 'cobra' && q.stateContinuation) return false;
      if (s.id === 'pop' && q.fsa) return false;
      return true;
    });
  }

  function renderCrossSell(quotedIds) {
    var section = L.additionalServices;
    if (!section || !section.services) return '';
    var available = applyBundlingRules(quotedIds, section.services);
    var shown = available.slice(0, section.maxToShow || 6);
    if (shown.length === 0) return '';
    var cards = shown.map(function (s) {
      return '<div class="cross-sell-card"><h3>' + esc(s.name) + '</h3><p>' + esc(s.description) + '</p></div>';
    }).join('\n');
    return [
      '<section>',
      '  <div class="section-card">',
      '    <div class="section-head green"><h2>' + esc(section.heading) + '</h2>' +
        (section.intro ? '<p>' + esc(section.intro) + '</p>' : '') + '</div>',
      '    <div class="section-body"><div class="cross-sell-grid">' + cards + '</div></div>',
      '  </div>',
      '</section>'
    ].join('\n');
  }

  function renderWarnings(results) {
    var warnings = [];
    results.forEach(function (r) {
      (r.warnings || []).forEach(function (w) { warnings.push({ productId: r.productId, message: w }); });
    });
    if (warnings.length === 0) return '';
    var items = warnings.map(function (w) {
      var meta = findProduct(w.productId);
      return '<li><strong>' + esc(meta ? meta.shortName : w.productId) + ':</strong> ' + esc(w.message) + '</li>';
    }).join('');
    return '<aside class="quote-warnings no-print"><h4>Internal notes (hidden in print / client file)</h4><ul>' + items + '</ul></aside>';
  }

  function renderAuthorizationPage(form, groups, quoteNumber) {
    var picker = groups.map(function (g, i) {
      var meta = findProduct(g.productId);
      var name = meta ? (meta.shortName || meta.name) : g.productId;
      var tier = '';
      if (g.results.length > 1) {
        var rec = (form.recommendedPackages || {})[g.productId];
        var opts = g.results.map(function (r) {
          var pkg = findPackage(meta, r.packageId) || {};
          var parsed = splitPackageName(pkg.name || r.packageId);
          var label = parsed.name + (parsed.detail ? ': ' + parsed.detail : '');
          var sel = (rec && r.packageId === rec) ? ' selected' : '';
          return '<option value="' + esc(parsed.name) + '"' + sel + '>' + esc(label) + '</option>';
        }).join('');
        tier = '<div class="opt-tier"><label>Option:</label><select class="opt-tier-select">' + opts + '</select></div>';
      }
      return '<div class="opt-row"><input type="checkbox" class="opt-check" data-label="' + esc(name) + '" checked>' +
        '<div class="opt-main"><div class="opt-title">' + esc(name) + '</div>' + tier + '</div></div>';
    }).join('\n');

    function field(label, fname, val, full, type) {
      return '<div class="ack-field' + (full ? ' full' : '') + '"><label>' + esc(label) + '</label>' +
        '<input type="' + (type || 'text') + '" name="' + fname + '"' + (val ? ' value="' + esc(val) + '"' : '') + '></div>';
    }

    return [
      '<section class="ack-page">',
      '  <div class="ack-card">',
      '    <div class="ack-head">',
      '      <div class="ack-brand">ABY Benefits LLC</div>',
      '      <h2>Employer Acceptance &amp; Authorization</h2>',
      '      <div class="ack-sub">Non-binding letter of intent, quote number: <strong>' + esc(quoteNumber) + '</strong></div>',
      '      <div class="ack-guarantee">All ABY admin fees guaranteed for 3 years</div>',
      '    </div>',
      '    <div class="ack-group"><div class="ack-group-label">Select the Services You Are Authorizing</div>',
      picker,
      '      <p class="fee-hint" style="padding-left:2px;">Uncheck any service you are not moving forward with. Your selections are sent to ABY with this authorization.</p>',
      '    </div>',
      '    <form id="commitForm" onsubmit="submitCommitment(event)">',
      '      <input type="hidden" name="quoteNumber" value="' + esc(quoteNumber) + '">',
      '      <input type="hidden" name="products" id="productsField" value="">',
      '      <div class="ack-group"><div class="ack-group-label">Employer Information</div><div class="ack-field-grid">',
      field('Employer Name', 'employerName', form.clientName || '', true),
      field('Address', 'address', ''),
      field('City / State / Zip', 'cityStateZip', ''),
      '      </div></div>',
      '      <div class="ack-group"><div class="ack-group-label">Authorized Signer</div><div class="ack-field-grid">',
      '        <div class="ack-field"><label>Name</label><input type="text" name="authSigner" id="authSignerInput" oninput="abySign(this.value)"></div>',
      field('Title', 'authTitle', ''),
      field('Email', 'authEmail', '', false, 'email'),
      field('Phone', 'authPhone', '', false, 'tel'),
      '      </div></div>',
      '      <div class="ack-group"><div class="ack-group-label">HR / Benefits Contact (if different)</div><div class="ack-field-grid">',
      field('Name', 'hrContact', ''),
      field('Title', 'hrTitle', ''),
      field('Email', 'hrEmail', '', false, 'email'),
      field('Phone', 'hrPhone', '', false, 'tel'),
      '      </div></div>',
      '      <div class="ack-group"><div class="ack-field-grid">',
      field('Proposed Administrative Start Date', 'startDate', form.effectiveDate || '', false, 'date'),
      '      </div></div>',
      '      <div class="ack-group"><div class="ack-group-label">Authorization</div><div class="ack-sign-grid">',
      '        <div><label style="font-size:12px;color:#5f6b76;display:block;margin-bottom:6px;">Accepted: Printed Name</label><div id="printPreview" class="sign-preview print-name"></div><input type="hidden" name="acceptedPrint" id="acceptedPrint"></div>',
      '        <div><label style="font-size:12px;color:#5f6b76;display:block;margin-bottom:6px;">Accepted: Electronic Signature</label><div id="signPreview" class="sign-preview signature"></div><input type="hidden" name="acceptedSign" id="acceptedSign"><div class="sign-hint">Type your name in the Authorized Signer field above to sign.</div></div>',
      '      </div>',
      '      <div style="margin-top:16px;max-width:220px;"><label style="font-size:12px;color:#5f6b76;display:block;margin-bottom:4px;">Date</label><input type="date" name="signDate" id="signDate" style="width:100%;padding:9px 11px;border:1px solid #c4d2dd;border-radius:8px;font:inherit;font-size:14px;"></div>',
      '      </div>',
      '      <div class="ack-submit"><button type="submit" id="commitBtn">Submit Authorization to ABY</button><div class="submit-note">This is a non-binding letter of intent. ABY will follow up to confirm implementation details.</div><div id="commitMsg" style="margin-top:12px;font-size:13px;display:none;"></div></div>',
      '    </form>',
      '    <p class="ack-disclaimer">This proposal is a summary of the services and pricing offered based on the information provided. Rates may be affected by actual enrollment and transferred information. This proposal does not constitute a final offer or agreement. Final service terms and plan details should be confirmed during setup.</p>',
      '  </div>',
      '</section>'
    ].filter(Boolean).join('\n');
  }

  function render(form, results, quoteNumber, opts) {
    opts = opts || {};
    init();
    var groups = [];
    results.forEach(function (r) {
      var last = groups[groups.length - 1];
      if (last && last.productId === r.productId) last.results.push(r);
      else groups.push({ productId: r.productId, results: [r] });
    });
    var body = [];
    body.push(renderTopbar(form));
    body.push(renderHero(form, groups, quoteNumber));
    body.push(renderHeroTiles(groups));
    body.push(renderAboutABY());
    body.push(renderStandardServices());
    groups.forEach(function (g) { body.push(renderProductSection(g, form)); });
    body.push(renderDisclosures());
    body.push(renderFileFeed());
    body.push(renderCrossSell(results.map(function (r) { return r.productId; })));
    if (opts.includeAuthorization) body.push(renderAuthorizationPage(form, groups, quoteNumber));
    var warnings = renderWarnings(results);
    return warnings +
      '<div class="aby-proposal">\n<div class="proposal-card">\n' +
      body.filter(Boolean).join('\n') +
      '\n</div>\n</div>';
  }

  return { render: render };
})();
