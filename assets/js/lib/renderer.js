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
    // ABY logo left; broker logo + broker contact right. Client is in the hero.
    // TWO SOURCES, ONE SLOT (F-342):
    //   brokerLogoDataUrl - the file the broker attached to THIS quote (pre-existing).
    //   brokerLogoUrl     - their agency logo, handed over by the BenefitLab dashboard, so it
    //                       does not have to be uploaded again on every quote.
    // ⭐ The uploaded file wins; app.js only sets the URL when no file was attached. Both end
    // up in the same <img>, and the stylesheet already sizes it (max 58px tall, 185px wide).
    // ⚠️ The URL is validated against an allowlist in app.js BEFORE it reaches here -- this
    // value arrives from `?rerun=`, which anybody can craft. Do not accept one from elsewhere
    // without the same check.
    var brokerLogoSrc = form.brokerLogoDataUrl || form.brokerLogoUrl;
    var brokerLogo = brokerLogoSrc
      ? '<img class="broker-logo" src="' + esc(brokerLogoSrc) + '" alt="Broker logo">'
      : '';
    var parts = [];
    if (form.brokerName || form.brokerAgency) parts.push('<div class="broker-name">' + esc([form.brokerName, form.brokerAgency].filter(Boolean).join(', ')) + '</div>');
    var bc = [];
    if (form.brokerPhone) bc.push(esc(form.brokerPhone));
    if (form.brokerEmail) bc.push(esc(form.brokerEmail));
    if (bc.length) parts.push('<div>' + bc.join(' &nbsp;|&nbsp; ') + '</div>');
    var brokerContact = parts.length ? '<div class="broker-contact">' + parts.join('') + '</div>' : '';
    return [
      '<div class="topbar">',
      '  <div class="brand-col">',
      '    <div class="logo-wrap"><img src="assets/images/aby-logo.png" alt="ABY Benefits LLC"></div>',
      '    <div class="eyebrow eyebrow-onlight">Employee benefits administrative services proposal</div>',
      '  </div>',
      '  <div class="prepared-for">',
      brokerLogo ? '    <div class="broker-logo-wrap">' + brokerLogo + '</div>' : '',
      brokerContact,
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
      '  <h1>' + esc(proposalTitle(groups)) + '</h1>',
      (form.clientName ? '  <p class="hero-lead"><strong>Prepared for ' + esc(form.clientName) + '</strong></p>' : ''),
      '  <p>Administrative services and compliance support for your employee benefit plans.</p>',
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
      '    <div class="section-head hero-head"><h2>' + esc(a.heading) + '</h2><p>A Dallas–Fort Worth–based third-party administrator, founded in 1986 and headquartered in Plano, Texas.</p></div>',
      '    <div class="section-body">',
      a.paragraphs.map(function (p) { return '      <p>' + esc(p) + '</p>'; }).join('\n'),
      '      <div class="callout" style="margin-top:18px;"><h3>Experience Highlights</h3><ul>' +
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
      var isGuarantee = /fees guaranteed/i.test(text);
      var cls = 'service-item' + (isFeature ? ' feature' : '') + (isGuarantee ? ' guarantee-item' : '');
      var content = isGuarantee ? ('&#10003; ' + esc(text)) : esc(text);
      return '<div class="' + cls + '">' + content + '</div>';
    }).join('\n');
    return [
      '<section>',
      '  <div class="section-card">',
      '    <div class="section-head hero-head"><h2>' + esc(s.heading) + '</h2><p>' + esc(s.intro) + '</p></div>',
      '    <div class="section-body">',
      '      <div class="service-list">' + items + '</div>',
      '      <p class="muted" style="margin-top:14px;">' + esc(s.closing) + '</p>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n');
  }

  function renderLearnMore(productId, skipFirst) {
    var lang = L.products[productId];
    if (!lang) return '';
    var body = [];
    (lang.paragraphs || []).slice(skipFirst ? 1 : 0).forEach(function (p) { body.push('<p>' + esc(p) + '</p>'); });
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

  // The count a tiered price was actually calculated on.
  //
  // The tier label -- "20-99 participants" -- is the BAND the group falls in, not
  // the number this quote used, and nothing else on the card carried it. So a quote
  // priced for 50 people showed $225 with no way for the reader to see the 50.
  // Reported by Eric, 2026-08-21, looking at a real FSA quote.
  //
  // Stated as an INPUT and never as arithmetic. "50 x $4.50" would be wrong every
  // time the monthly minimum binds: 10 participants at $4.50 is $45, but the card
  // correctly shows the $85 minimum, and a printed multiplication would not
  // reconcile with it.
  //
  // No countLabel means the product does not take a count at all (pop, erisa), so
  // there is no noun to use and we say nothing rather than invent "participants".
  function countNote(fee, meta) {
    if (!fee || !meta || !meta.countLabel) return '';
    // tierExceeded already names the count inside its own breakdown sentence.
    if (fee.tierExceeded) return '';
    if (fee.count != null) return 'Estimated for ' + fee.count + ' ' + meta.countLabel + '.';
    if (fee.countMissing) return 'No count was entered, so this shows the lowest tier.';
    return '';
  }

  function renderPricingCards(result, meta) {
    var cards = [];
    // Fixed fees. When setup and annual renewal are the same recurring amount,
    // show them as ONE "Annual Fee (setup / renewal)" line. Products where setup
    // is genuinely one-time (renewal is $0, e.g. HSA) keep a separate one-time
    // Setup line and no $0 renewal line.
    var setupAmt = result.setupFee ? result.setupFee.amount : null;
    var renewAmt = (result.renewalFee != null) ? result.renewalFee.amount : null;
    if (setupAmt != null && renewAmt != null && renewAmt > 0 && setupAmt === renewAmt) {
      cards.push({ label: 'Annual Fee (setup / renewal)', price: u.money(renewAmt), note: 'Same amount each year: covers plan setup and every annual renewal.' });
    } else {
      if (setupAmt != null && setupAmt > 0) cards.push({ label: result.setupFee.label || 'Setup fee', price: u.money(setupAmt), note: 'One-time setup.' });
      if (renewAmt != null && renewAmt > 0) cards.push({ label: result.renewalFee.label || 'Annual renewal', price: u.money(renewAmt), note: 'Per year.' });
    }
    if (result.docsFee) cards.push({ label: result.docsFee.label || 'Documents', price: u.money(result.docsFee.amount), note: 'One-time.' });
    if (result.annualFee != null) {
      var aNote = countNote(result.annualFee, meta) || 'Per year.';
      if (result.formulaBreakdown) aNote = result.formulaBreakdown;
      cards.push({ label: result.annualFee.label || 'Annual fee', price: u.money(result.annualFee.amount), note: aNote });
    }
    if (result.monthlyFee) {
      var mNote = [];
      if (result.monthlyFee.tierLabel) mNote.push(esc(result.monthlyFee.tierLabel));
      if (result.monthlyFee.breakdown) mNote.push(esc(result.monthlyFee.breakdown));
      // ⭐⭐ THE COUNT IS ITS OWN LINE, NOT THE TAIL OF THE RATE SENTENCE.
      // Eric, 2026-08-22 (night): "It still does not show estimated number of participants." It
      // DID -- his own quote rendered "Estimated for 46 participants." -- but appended to the
      // grey rate boilerplate it read as more of the same fine print and he did not see it.
      // ⛔ TECHNICALLY PRESENT AND PRACTICALLY INVISIBLE IS NOT SHOWN. He had asked for this
      // number twice; a reader who cannot find it has been given nothing.
      // ⭐ It now sits directly under the price, where the eye already is.
      var mCount = countNote(result.monthlyFee, meta);
      cards.push({
        label: result.monthlyFee.label || 'Monthly administration',
        price: u.money(result.monthlyFee.amount) + ' <small>monthly</small>',
        count: mCount,
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
        (c.count ? '<div class="price-count">' + esc(c.count) + '</div>' : '') +
        (c.note ? '<p class="muted">' + c.note + '</p>' : '') +
        '</div>';
    }).join('\n');
    return '<div class="pricing-grid' + cls + '">\n' + html + '\n</div>';
  }

  function renderOptionsTable(group, meta, recommendedPackageId) {
    // Products with a single annual fee (e.g. ERISA) show one "Annual fee"
    // column instead of separate setup + renewal.
    var annualOnly = group.results.every(function (r) { return !r.setupFee && r.renewalFee == null && r.annualFee != null; });
    var rows = group.results.map(function (r) {
      var pkg = findPackage(meta, r.packageId) || {};
      var parsed = splitPackageName(pkg.name || r.packageLabel || r.packageId);
      var isRec = recommendedPackageId && r.packageId === recommendedPackageId;
      var recTag = isRec ? '<span class="rec-tag">Recommended</span>' : '';
      var included = '<td>' + esc(parsed.detail || pkg.description || '') + '</td>';
      var nameCell = '<td>' + esc(parsed.name) + recTag + '</td>';
      if (annualOnly) {
        return '<tr' + (isRec ? ' class="recommended"' : '') + '>' + nameCell + included +
          '<td>' + (r.annualFee != null ? u.money(r.annualFee.amount) : 'n/a') + '</td></tr>';
      }
      var setup = r.setupFee ? u.money(r.setupFee.amount) : (r.annualFee ? u.money(r.annualFee.amount) : 'n/a');
      var renew = (r.renewalFee != null) ? u.money(r.renewalFee.amount) : 'n/a';
      return '<tr' + (isRec ? ' class="recommended"' : '') + '>' + nameCell + included +
        '<td>' + setup + '</td>' +
        '<td>' + renew + '</td></tr>';
    }).join('\n');
    var head = annualOnly
      ? '  <thead><tr><th>Option</th><th>What is included</th><th>Annual fee</th></tr></thead>'
      : '  <thead><tr><th>Option</th><th>What is included</th><th>Setup fee</th><th>Annual renewal</th></tr></thead>';
    return [
      '<table class="options-table">',
      head,
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
      if (!f.description) {
        return '<div class="fee-item"><div class="fee-static">' +
          '<span class="fee-name">' + esc(f.label) + '</span>' +
          '<span class="fee-amount">' + amt + unit + '</span></div></div>';
      }
      return '<details class="fee-item">' +
        '<summary>' + CHEV + '<span class="fee-name">' + esc(f.label) + '</span>' +
        '<span class="fee-amount">' + amt + unit + '</span></summary>' +
        '<div class="fee-explain">' + esc(f.description) + '</div></details>';
    }).join('\n');
    var anyExpandable = fees.some(function (f) { return !!f.description; });
    return [
      '<div class="fees-wrap">',
      '  <div class="fees-title">Additional Services Fee Schedule: ' + esc(meta.shortName || meta.name) + '</div>',
      anyExpandable ? '  <p class="fee-hint">Tap any line with an arrow to see what it covers.</p>' : '',
      items,
      '</div>'
    ].filter(Boolean).join('\n');
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
      '    <div class="section-head hero-head"><h2>' + esc(lang.heading || meta.name) + '</h2></div>',
      '    <div class="section-body">',
      intro,
      renderLearnMore(group.productId, true),
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
      '    <div class="section-head hero-head"><h2>' + esc(section.heading) + '</h2>' +
        (section.intro ? '<p>' + esc(section.intro) + '</p>' : '') + '</div>',
      '    <div class="section-body"><div class="cross-sell-grid">' + cards + '</div></div>',
      '  </div>',
      '</section>'
    ].join('\n');
  }

  function renderNextSteps(form) {
    var broker = [];
    if (form.brokerName || form.brokerAgency) broker.push(esc([form.brokerName, form.brokerAgency].filter(Boolean).join(', ')));
    if (form.brokerPhone) broker.push(esc(form.brokerPhone));
    if (form.brokerEmail) broker.push(esc(form.brokerEmail));
    var rep = [];
    rep.push(esc((form.repName ? form.repName + ', ' : '') + 'ABY Benefits LLC'));
    if (form.repPhone) rep.push(esc(form.repPhone));
    if (form.repEmail) rep.push(esc(form.repEmail));
    var cards = '';
    if (broker.length) cards += '<div class="contact-card"><strong>Broker Contact:</strong> ' + broker.join(' &nbsp;|&nbsp; ') + '</div>';
    cards += '<div class="contact-card"><strong>ABY Contact:</strong> ' + rep.join(' &nbsp;|&nbsp; ') + '</div>';
    return [
      '<section>',
      '  <div class="section-card">',
      '    <div class="section-head hero-head"><h2>Recommended Next Steps</h2><p>A few simple steps to move forward.</p></div>',
      '    <div class="section-body">',
      '      <ol class="steps">',
      '        <li><span class="step-num">1</span><span>Decide which administrative services you would like ABY to assist with.</span></li>',
      '        <li><span class="step-num">2</span><span>Complete the Employer Authorization page below and submit it to ABY.</span></li>',
      '        <li><span class="step-num">3</span><span>Upon receipt, ABY will email you the additional paperwork needed to set up the specific services you selected.</span></li>',
      '      </ol>',
      '      <p style="margin-top:10px;">If you have questions about this proposal or would like to adjust the services, contact your broker or your ABY representative.</p>',
      '      <div class="contact-strip">' + cards + '</div>',
      '    </div>',
      '  </div>',
      '</section>'
    ].join('\n');
  }

  // Exported so a CALLER can find out whether this quote carries engine warnings without
  // having to render anything and grep the markup. The download path uses it to tell the
  // broker, on screen, that the client file they just produced rests on a fallback price
  // (F-337) -- previously that note existed only in a box the download omitted.
  function collectWarnings(results) {
    var warnings = [];
    (results || []).forEach(function (r) {
      // The engine flags an over-the-top-tier count on monthlyFee, not on the warning
      // string, so carry it across here -- otherwise the red branch in renderWarnings
      // is unreachable and would look implemented while never once firing.
      var exceeded = !!(r.monthlyFee && r.monthlyFee.tierExceeded);
      (r.warnings || []).forEach(function (w) {
        warnings.push({
          productId: r.productId,
          message: w,
          tierExceeded: exceeded && w.indexOf('exceeds the highest defined pricing tier') !== -1
        });
      });
    });
    return warnings;
  }

  function renderWarnings(results) {
    var warnings = collectWarnings(results);
    if (warnings.length === 0) return '';
    // ⭐ Eric, 2026-08-18: a group over the top pricing tier must stand out in RED and say
    // to contact ABY. Everything here is already gated on opts.includeWarnings and carries
    // no-print, so it shows in the on-screen preview and NEVER on the client's file.
    // ⛔ The colour is inline rather than a CSS class on purpose: quote.css is not part of
    // this change set, so a class would style nothing until a second file shipped.
    var items = warnings.map(function (w) {
      var meta = findProduct(w.productId);
      var name = esc(meta ? meta.shortName : w.productId);
      if (w.tierExceeded) {
        return '<li style="color:#b3261e;font-weight:bold;">' +
          '<strong>' + name + ':</strong> ' + esc(w.message) +
          ' Please contact ABY for pricing.' +
          '<span style="display:block;font-weight:normal;color:#8c1d18;">' +
          'If you continue, the quote uses the highest published tier, which understates the price for a group this size.' +
          '</span></li>';
      }
      return '<li><strong>' + name + ':</strong> ' + esc(w.message) + '</li>';
    }).join('');
    return '<aside class="quote-warnings no-print"><h4>Internal notes (hidden in print / client file)</h4><ul>' + items + '</ul></aside>';
  }

  function renderAuthorizationPage(form, groups, quoteNumber, opts) {
    opts = opts || {};
    // What this line has to say is what the employer is AUTHORIZING, and it was missing
    // two thirds of it: it printed the per-participant rate but neither the headcount the
    // price was worked out on nor the monthly figure itself. So the page somebody signs
    // did not state how many people it covers or what it costs a month.
    // Eric, 2026-08-21, on where the count belongs: "if they change it on the quote that
    // number should appear near the bottom in the signature line ... when they sign the
    // part of the form saying they want to move forward, it will show the pricing there
    // (and the per employee amount)."
    // ORDER IS DELIBERATE: the amount first, then the rate that produced it, then the
    // count it assumed -- price, then workings.
    function feeSummary(r, meta) {
      var parts = [];
      if (r.setupFee) parts.push('Setup ' + u.money(r.setupFee.amount));
      if (r.docsFee) parts.push('Documents ' + u.money(r.docsFee.amount));
      if (r.renewalFee != null) parts.push('Renewal ' + u.money(r.renewalFee.amount) + '/yr');
      if (r.annualFee != null) parts.push(u.money(r.annualFee.amount) + '/yr');
      if (r.monthlyFee) {
        parts.push(u.money(r.monthlyFee.amount) + '/mo');
        if (r.monthlyFee.breakdown) parts.push(r.monthlyFee.breakdown);
      }
      var cn = countNote(r.monthlyFee || r.annualFee, meta);
      if (cn) parts.push(cn.replace(/\.$/, ''));
      return parts.join('  |  ');
    }
    // 🔴 CAPTURED UNDER A DIFFERENT NAME BECAUSE THE CALLBACK BELOW SHADOWS `opts`.
    // The multi-package branch declares its own `var opts = g.results.map(...)` for the <option>
    // list, and `var` is FUNCTION-scoped and hoisted -- so `opts` refers to that local
    // everywhere in the callback, including in branches where it was never assigned. Reading
    // `opts.anything` in the single-result branch therefore threw on `undefined`, which took the
    // whole authorization page and the entire quote with it.
    var pageOpts = opts;
    var picker = groups.map(function (g, i) {
      var meta = findProduct(g.productId);
      var name = meta ? (meta.shortName || meta.name) : g.productId;
      var tier = '', desc = '';
      if (g.results.length > 1) {
        var rec = (form.recommendedPackages || {})[g.productId];
        var opts = g.results.map(function (r) {
          var pkg = findPackage(meta, r.packageId) || {};
          var parsed = splitPackageName(pkg.name || r.packageId);
          var label = parsed.name + (parsed.detail ? ': ' + parsed.detail : '');
          var fs = feeSummary(r, meta);
          if (fs) label += '  (' + fs + ')';
          var sel = (rec && r.packageId === rec) ? ' selected' : '';
          return '<option value="' + esc(parsed.name) + '"' + sel + '>' + esc(label) + '</option>';
        }).join('');
        tier = '<div class="opt-tier"><label>Option:</label><select class="opt-tier-select">' + opts + '</select></div>';
      } else {
        var fs2 = feeSummary(g.results[0], meta);
        if (fs2) desc = '<div class="opt-desc">' + esc(fs2) + '</div>';
      }
      // THE EMPLOYER'S OWN COUNT, at the signature line and nowhere else (F-367).
      // Eric: "if they change it on the quote that number should appear near the bottom in the
      // signature line ... when they sign the part of the form saying they want to move forward,
      // it will show the pricing there (and the per employee amount)."
      // ⛔ THE QUOTE BODY ABOVE DOES NOT MOVE. What ABY quoted stays what ABY quoted; this is
      // the employer ASSERTING a number, which is why it belongs where they sign. A screenshot
      // of the body can never come back at a price ABY never gave.
      var countBox = '';
      var one = (g.results.length === 1) ? g.results[0] : null;
      var cMeta = one && one.monthlyFee && one.monthlyFee._m;
      if (pageOpts.employerEditableCounts && one && cMeta && cMeta.count != null) {
        var noun = (findProduct(g.productId) || {}).countLabel || 'participants';
        countBox =
          '<div class="emp-count no-print" data-product="' + esc(g.productId) + '"' +
               ' data-rate="' + esc(String(cMeta.rate || 0)) + '"' +
               ' data-min="' + esc(String(cMeta.min || 0)) + '"' +
               ' data-kind="' + esc(String(cMeta.kind || 'pppm')) + '"' +
               ' data-quoted="' + esc(String(cMeta.count)) + '"' +
               ' data-lo="' + esc(cMeta.lo == null ? '' : String(cMeta.lo)) + '"' +
               ' data-hi="' + esc(cMeta.hi == null ? '' : String(cMeta.hi)) + '"' +
               ' data-noun="' + esc(noun) + '">' +
            '<label>If your actual number of ' + esc(noun) + ' is different, enter it here' +
              '<input type="number" min="0" step="1" class="emp-count-input" value="' + esc(String(cMeta.count)) + '">' +
            '</label>' +
            '<div class="emp-count-out" aria-live="polite"></div>' +
          '</div>';
      }
      return '<div class="opt-row"><input type="checkbox" class="opt-check" data-label="' + esc(name) + '" checked>' +
        '<div class="opt-main"><div class="opt-title">' + esc(name) + '</div>' + desc + tier + countBox + '</div></div>';
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
      // The authorization form posts every FormData field, so these two travel with the
      // employer's signed commitment automatically. WHY THEY ARE HERE: `commitments` stored
      // NO broker at all -- its only link to one was `quote_number`, the non-unique string
      // F-339 exists to fix. So "who is the broker on this commitment?" could only be
      // answered by a join through a key that could collide. F-345.
      '      <input type="hidden" name="clientId" value="' + esc(opts.clientId || '') + '">',
      '      <input type="hidden" name="brokerEmail" value="' + esc(form.brokerEmail || '') + '">',
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

  // -------------------------------------------------------------
  // Estimated Annual Total
  // Recurring = annual/renewal fees + 12 months of admin.
  // One-time  = setup that is NOT already the recurring annual fee (e.g. HSA).
  // -------------------------------------------------------------

  function productAnnual(r) {
    var total = 0;
    if (r.annualFee != null) total += r.annualFee.amount;
    if (r.renewalFee != null) total += r.renewalFee.amount;       // 0 for HSA
    if (r.monthlyFee && !r.monthlyFee.tierExceeded) total += r.monthlyFee.amount * 12;
    return total;
  }
  function productOneTime(r) {
    var total = 0;
    if (r.docsFee) total += r.docsFee.amount;
    // Setup counts as one-time only when it is not already the recurring annual fee
    // (i.e. renewal is $0 or absent — the HSA case).
    if (r.setupFee && (r.renewalFee == null || r.renewalFee.amount === 0)) total += r.setupFee.amount;
    return total;
  }

  function computeTotals(groups) {
    var t = { recurring: 0, oneTime: 0, hasMonthly: false, monthlyIncomplete: false, anyMultiOption: false, rows: [] };
    groups.forEach(function (g) {
      var meta = findProduct(g.productId);
      var name = meta ? (meta.shortName || meta.name) : g.productId;
      var r;
      if (g.results.length > 1) {
        t.anyMultiOption = true;
        // No single option chosen yet → use the lowest-cost option for the estimate.
        r = g.results.reduce(function (a, b) { return productAnnual(b) < productAnnual(a) ? b : a; });
        name += ' (lowest option)';
      } else {
        r = g.results[0];
      }
      var ann = productAnnual(r), one = productOneTime(r);
      t.recurring += ann;
      t.oneTime += one;
      if (r.monthlyFee) { t.hasMonthly = true; if (r.monthlyFee.countMissing) t.monthlyIncomplete = true; }
      t.rows.push({ name: name, annual: ann, oneTime: one });
    });
    return t;
  }

  function renderTotalsSummary(groups) {
    if (!groups || !groups.length) return '';
    var t = computeTotals(groups);
    if (t.recurring <= 0 && t.oneTime <= 0) return '';

    var notes = [];
    if (t.hasMonthly) notes.push('Includes 12 months of administration.');
    if (t.oneTime > 0) notes.push('A one-time setup of ' + u.money(t.oneTime) + ' applies in the first year (shown separately below).');
    if (t.monthlyIncomplete) notes.push('Some monthly fees use a starting-tier estimate until participant counts are confirmed.');
    if (t.anyMultiOption) notes.push('Where several options are offered, the lowest-cost option is used for this estimate.');

    var big =
      '<div class="price-box featured">' +
        '<div class="price-label">Estimated Annual Total</div>' +
        '<div class="price">' + u.money(Math.round(t.recurring)) + ' <small>per year</small></div>' +
        (t.oneTime > 0 ? '<p class="muted">plus ' + u.money(t.oneTime) + ' one-time setup (year one only)</p>' : '') +
      '</div>';

    var rows = t.rows.map(function (row) {
      return '<tr><td>' + esc(row.name) + '</td>' +
        '<td style="text-align:right;">' + u.money(Math.round(row.annual)) + '</td>' +
        '<td style="text-align:right;">' + (row.oneTime > 0 ? u.money(row.oneTime) : '—') + '</td></tr>';
    }).join('\n');
    var tfootOne = t.oneTime > 0
      ? '<tr><td><strong>One-time setup (year one)</strong></td><td></td><td style="text-align:right;"><strong>' + u.money(t.oneTime) + '</strong></td></tr>'
      : '';
    var table =
      '<table class="options-table" style="margin-top:16px;">' +
      '<thead><tr><th>Service</th><th style="text-align:right;">Est. annual</th><th style="text-align:right;">One-time</th></tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td><strong>Estimated annual total</strong></td>' +
      '<td style="text-align:right;"><strong>' + u.money(Math.round(t.recurring)) + '</strong></td>' +
      '<td style="text-align:right;">' + (t.oneTime > 0 ? '' : '—') + '</td></tr>' + tfootOne + '</tfoot>' +
      '</table>';

    return [
      '<section>',
      '  <div class="section-card">',
      '    <div class="section-head hero-head"><h2>Estimated Annual Cost</h2><p>A summary estimate based on the services and counts entered. Final cost may vary with actual enrollment and elections.</p></div>',
      '    <div class="section-body">',
      '      <div class="pricing-grid cols-1">' + big + '</div>',
      (notes.length ? '      <p class="muted" style="margin-top:10px;">' + esc(notes.join(' ')) + '</p>' : ''),
      table,
      '    </div>',
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
    body.push(renderTotalsSummary(groups));
    body.push(renderDisclosures());
    body.push(renderFileFeed());
    body.push(renderCrossSell(results.map(function (r) { return r.productId; })));
    body.push(renderNextSteps(form));
    if (opts.includeAuthorization) body.push(renderAuthorizationPage(form, groups, quoteNumber, opts));
    var warnings = opts.includeWarnings ? renderWarnings(results) : '';
    return warnings +
      '<div class="aby-proposal">\n<div class="proposal-card">\n' +
      body.filter(Boolean).join('\n') +
      '\n</div>\n</div>';
  }

  // ── TWO AUDIENCES, TWO FUNCTIONS ───────────────────────────────────────────────────────
  //
  // 🔴 WHY THIS EXISTS (F-337). One `render()` served both the internal preview and the
  // client's document, distinguished by an OPTION. The preview passed `includeWarnings:
  // true`; the download simply did not pass it at all -- so when the engine fell back to
  // COMMISSIONED prices for a no-commission quote, the rep saw the note and the employer
  // received the wrong price with nothing saying so. Nobody wrote a bug; somebody forgot a
  // flag, and forgetting a flag is silent.
  //
  // ⭐ THE RULE: "does the client see this?" must be answered by WHICH FUNCTION YOU CALLED,
  // not by an options bag. A boolean that decides whether a warning reaches a customer is
  // too important to have a default.
  //
  // `render()` is kept and unchanged so any existing caller behaves exactly as before.
  function renderInternal(form, results, quoteNumber, opts) {
    var o = {};
    for (var k in (opts || {})) o[k] = opts[k];
    o.includeWarnings = true;
    return render(form, results, quoteNumber, o);
  }

  function renderForClient(form, results, quoteNumber, opts) {
    var o = {};
    for (var k in (opts || {})) o[k] = opts[k];
    // Explicit, not merely absent: the internal notes box is headed "hidden in print /
    // client file", so its CONTENT is wrong for this audience even though the FACT it
    // carries matters. The fact is surfaced to the broker on screen instead -- see
    // `collectWarnings` and app.js's download handlers.
    o.includeWarnings = false;
    return render(form, results, quoteNumber, o);
  }

  return {
    render: render,
    renderInternal: renderInternal,
    renderForClient: renderForClient,
    collectWarnings: collectWarnings,
  };
})();
