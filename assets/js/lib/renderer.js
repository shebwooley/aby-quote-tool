// ABY Quote Tool — Quote renderer
// Takes form data + engine results and produces the full quote HTML.

window.ABYQuote = window.ABYQuote || {};

ABYQuote.renderer = (function () {

  var u = null; // bound at runtime to ABYQuote.utils
  var L = null; // bound at runtime to ABYQuote.language

  function init() {
    u = ABYQuote.utils;
    L = ABYQuote.language;
  }

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

  // -------------------------------------------------------------
  // Header section: title, presented by, client, quote number
  // -------------------------------------------------------------

  function renderHeader(form, quoteNumber) {
    var brokerLogoHtml = '';
    if (form.brokerLogoDataUrl) {
      brokerLogoHtml = '<img class="broker-logo" src="' + u.escapeHtml(form.brokerLogoDataUrl) + '" alt="Broker logo">';
    }

    var clientBlock = '';
    if (form.clientName) {
      clientBlock =
        '<div class="quote-client">' +
        '  <div class="client-label">Prepared for</div>' +
        '  <div class="client-name">' + u.escapeHtml(form.clientName) + '</div>' +
        '</div>';
    }

    return [
      '<header class="quote-header">',
      '  <div class="logo-row">',
      '    <div class="aby-logo">',
      '      <img src="assets/images/aby-logo.png" alt="ABY Benefits LLC">',
      '    </div>',
      brokerLogoHtml ? '    <div class="broker-logo-wrap">' + brokerLogoHtml + '</div>' : '',
      '  </div>',
      '  <h1 class="quote-title">Administrative Proposal</h1>',
      clientBlock,
      '  <div class="quote-meta">',
      form.effectiveDate ? '    <div class="meta-row"><span class="meta-label">Effective date</span> <span class="meta-value">' + u.escapeHtml(u.formatDateLong(form.effectiveDate)) + '</span></div>' : '',
      '    <div class="meta-row"><span class="meta-label">Quote number</span> <span class="meta-value">' + u.escapeHtml(quoteNumber) + '</span></div>',
      '  </div>',
      renderPartyBlocks(form),
      '</header>'
    ].filter(Boolean).join('\n');
  }

  function renderPartyBlocks(form) {
    var hasBroker = form.brokerName || form.brokerAgency || form.brokerPhone || form.brokerEmail;
    var hasRep = form.repName || form.repPhone || form.repEmail;
    if (!hasBroker && !hasRep) return '';

    var parts = ['<div class="party-blocks">'];
    if (hasBroker) {
      parts.push('  <div class="party-block">');
      parts.push('    <div class="party-label">Presented by</div>');
      if (form.brokerAgency) parts.push('    <div class="party-name">' + u.escapeHtml(form.brokerAgency) + '</div>');
      if (form.brokerName) parts.push('    <div>' + u.escapeHtml(form.brokerName) + '</div>');
      if (form.brokerPhone) parts.push('    <div>' + u.escapeHtml(form.brokerPhone) + '</div>');
      if (form.brokerEmail) parts.push('    <div>' + u.escapeHtml(form.brokerEmail) + '</div>');
      parts.push('  </div>');
    }
    parts.push('  <div class="party-block">');
    parts.push('    <div class="party-label">' + (hasBroker ? 'In partnership with' : 'Presented by') + '</div>');
    parts.push('    <div class="party-name">ABY Benefits LLC</div>');
    if (hasRep) {
      if (form.repName) parts.push('    <div>' + u.escapeHtml(form.repName) + '</div>');
      if (form.repPhone) parts.push('    <div>' + u.escapeHtml(form.repPhone) + '</div>');
      if (form.repEmail) parts.push('    <div>' + u.escapeHtml(form.repEmail) + '</div>');
    }
    parts.push('  </div>');
    parts.push('</div>');
    return parts.join('\n');
  }

  // -------------------------------------------------------------
  // Proposal Contents (TOC list of selected products)
  // -------------------------------------------------------------

  function renderProposalContents(selections) {
    var items = selections.map(function (s) {
      var meta = findProduct(s.productId);
      if (!meta) return '';
      var label = meta.shortName || meta.name;
      if (s.packageId && meta.packages) {
        var pkg = findPackage(meta, s.packageId);
        if (pkg) label += ' — ' + pkg.name.replace(/\s*\(.*?\)\s*$/, '');
      }
      return '<li>' + u.escapeHtml(label) + '</li>';
    }).filter(Boolean).join('\n');

    return [
      '<section class="proposal-contents">',
      '  <h2>Proposal Contents</h2>',
      '  <p>This proposal contains pricing and services for the following:</p>',
      '  <ul>' + items + '</ul>',
      '</section>'
    ].join('\n');
  }

  // -------------------------------------------------------------
  // About ABY (always shown, shaded box)
  // -------------------------------------------------------------

  function renderAboutABY() {
    return [
      '<section class="about-aby boxed">',
      '  <h2>' + u.escapeHtml(L.aboutABY.heading) + '</h2>',
      u.paragraphs(L.aboutABY.paragraphs),
      '  <h3>Experience Highlights</h3>',
      '  <ul>' + u.bullets(L.aboutABY.experienceHighlights) + '</ul>',
      '</section>'
    ].join('\n');
  }

  // -------------------------------------------------------------
  // Standard Services (always shown)
  // -------------------------------------------------------------

  function renderStandardServices() {
    return [
      '<section class="standard-services">',
      '  <h2>' + u.escapeHtml(L.standardServices.heading) + '</h2>',
      '  <p>' + u.escapeHtml(L.standardServices.intro) + '</p>',
      '  <ul>' + u.bullets(L.standardServices.items) + '</ul>',
      '  <p>' + u.escapeHtml(L.standardServices.closing) + '</p>',
      '</section>'
    ].join('\n');
  }

  // -------------------------------------------------------------
  // Per-product overview (language block from language.js)
  // -------------------------------------------------------------

  function renderProductOverview(productId) {
    var lang = L.products[productId];
    if (!lang) return '';

    var html = ['<section class="product-overview">'];
    html.push('  <h2>' + u.escapeHtml(lang.heading) + '</h2>');
    if (lang.paragraphs) {
      html.push(u.paragraphs(lang.paragraphs));
    }
    if (lang.bulletHeading) {
      html.push('  <p>' + u.escapeHtml(lang.bulletHeading) + '</p>');
    }
    if (lang.bullets) {
      html.push('  <ul>' + u.bullets(lang.bullets) + '</ul>');
    }
    if (lang.closing) {
      html.push(u.paragraphs(lang.closing));
    }
    html.push('</section>');
    return html.join('\n');
  }

  // -------------------------------------------------------------
  // Per-product pricing table
  // -------------------------------------------------------------

  function renderPricingTable(result) {
    var meta = findProduct(result.productId);
    if (!meta) return '';

    var rows = [];

    if (result.packageLabel) {
      rows.push('<tr><td class="row-label">Plan selected</td><td colspan="2" class="row-value">' + u.escapeHtml(result.packageLabel) + '</td></tr>');
    }

    if (result.setupFee) {
      rows.push(feeRow(result.setupFee.label, u.money(result.setupFee.amount), 'one-time'));
    }
    if (result.docsFee) {
      rows.push(feeRow(result.docsFee.label, u.money(result.docsFee.amount), 'one-time'));
    }
    if (result.renewalFee != null) {
      rows.push(feeRow(result.renewalFee.label, u.money(result.renewalFee.amount), 'annual'));
    }
    if (result.annualFee != null) {
      rows.push(feeRow(result.annualFee.label, u.money(result.annualFee.amount), 'annual'));
      if (result.formulaBreakdown) {
        rows.push('<tr class="breakdown-row"><td></td><td colspan="2"><em>' + u.escapeHtml(result.formulaBreakdown) + '</em></td></tr>');
      }
      if (result.annualFee.count != null && meta.countLabel) {
        rows.push('<tr class="count-summary-row"><td></td><td colspan="2">Based on <strong>' + result.annualFee.count + ' ' + u.escapeHtml(meta.countLabel) + '</strong></td></tr>');
      }
    }
    if (result.monthlyFee) {
      var monthlyValue = u.money(result.monthlyFee.amount);
      var note = result.monthlyFee.tierLabel ? ' <span class="tier-note">(' + u.escapeHtml(result.monthlyFee.tierLabel) + ')</span>' : '';
      rows.push('<tr><td class="row-label">' + u.escapeHtml(result.monthlyFee.label) + '</td>' +
                '<td class="row-value">' + monthlyValue + note + '</td>' +
                '<td class="row-cadence">monthly</td></tr>');
      if (result.monthlyFee.breakdown) {
        rows.push('<tr class="breakdown-row"><td></td><td colspan="2"><em>' + u.escapeHtml(result.monthlyFee.breakdown) + '</em></td></tr>');
      }
      if (result.monthlyFee.count != null) {
        var countTerm = (meta.countLabel || 'enrollees');
        rows.push('<tr class="count-summary-row"><td></td><td colspan="2">Based on <strong>' + result.monthlyFee.count + ' ' + u.escapeHtml(countTerm) + '</strong></td></tr>');
      }
    }

    if (rows.length === 0) {
      rows.push('<tr><td colspan="3"><em>Pricing pending — provide selection details.</em></td></tr>');
    }

    var heading = (meta.shortName || meta.name) + ' — Fees';

    return [
      '<section class="pricing-table-wrap">',
      '  <h3>' + u.escapeHtml(heading) + '</h3>',
      '  <table class="pricing-table">',
      '    <tbody>',
      rows.join('\n'),
      '    </tbody>',
      '  </table>',
      renderProductNotes(result),
      renderAdditionalFees(result),
      '</section>'
    ].join('\n');
  }

  function feeRow(label, value, cadence) {
    return '<tr><td class="row-label">' + u.escapeHtml(label) + '</td>' +
           '<td class="row-value">' + value + '</td>' +
           '<td class="row-cadence">' + u.escapeHtml(cadence) + '</td></tr>';
  }

  function renderProductNotes(result) {
    var notes = (result.notes || []).filter(function (n) { return n && n.indexOf('TODO') !== 0; });
    if (notes.length === 0) return '';
    var html = ['<div class="product-notes">'];
    notes.forEach(function (n) { html.push('<p>' + u.escapeHtml(n) + '</p>'); });
    html.push('</div>');
    return html.join('\n');
  }

  function renderAdditionalFees(result) {
    var fees = result.additionalFees || [];
    if (fees.length === 0) return '';
    var rows = fees.map(function (f) {
      var amt = (f.amount === 0) ? 'Included' : u.money(f.amount);
      // Suppress the "per X" unit when the fee is included at no charge
      var unit = (f.amount !== 0 && f.unit) ? ' <span class="fee-unit">' + u.escapeHtml(f.unit) + '</span>' : '';
      var mainRow = '<tr class="fee-row"><td>' + u.escapeHtml(f.label) + '</td>' +
                    '<td class="fee-amount">' + amt + unit + '</td></tr>';
      var descRow = '';
      if (f.description) {
        descRow = '<tr class="fee-description-row"><td colspan="2">' +
                  u.escapeHtml(f.description) + '</td></tr>';
      }
      return mainRow + descRow;
    }).join('\n');
    return [
      '<details class="additional-fees" open>',
      '  <summary>Additional Services Fee Schedule</summary>',
      '  <table class="additional-fees-table">',
      '    <tbody>' + rows + '</tbody>',
      '  </table>',
      '</details>'
    ].join('\n');
  }

  // -------------------------------------------------------------
  // "Additional Services ABY Offers" — cross-sell page at the end
  // -------------------------------------------------------------

  function renderAdditionalServices(selectedProductIds) {
    var section = L.additionalServices;
    if (!section || !section.services || section.services.length === 0) return '';

    var quotedIds = {};
    selectedProductIds.forEach(function (id) { quotedIds[id] = true; });

    var available = section.services.filter(function (s) { return !quotedIds[s.id]; });
    var max = section.maxToShow || 6;
    var shown = available.slice(0, max);
    if (shown.length === 0) return '';

    var cards = shown.map(function (s) {
      return [
        '<div class="cross-sell-card">',
        '  <h3>' + u.escapeHtml(s.name) + '</h3>',
        '  <p>' + u.escapeHtml(s.description) + '</p>',
        '</div>'
      ].join('\n');
    }).join('\n');

    return [
      '<section class="additional-services page-break-before">',
      '  <h2>' + u.escapeHtml(section.heading) + '</h2>',
      section.intro ? '  <p class="cross-sell-intro">' + u.escapeHtml(section.intro) + '</p>' : '',
      '  <div class="cross-sell-grid">',
      cards,
      '  </div>',
      '</section>'
    ].filter(Boolean).join('\n');
  }

  // -------------------------------------------------------------
  // Disclaimer (always at bottom)
  // -------------------------------------------------------------

  function renderDisclaimer() {
    return [
      '<section class="disclaimer">',
      '  <h2>' + u.escapeHtml(L.disclaimer.heading) + '</h2>',
      '  <p>' + u.escapeHtml(L.disclaimer.text) + '</p>',
      '  <p class="fee-guarantee"><strong>' + u.escapeHtml(L.feeGuarantee) + '</strong></p>',
      '</section>'
    ].join('\n');
  }

  // -------------------------------------------------------------
  // Internal warning banner (only shown to broker, hidden in print)
  // -------------------------------------------------------------

  function renderWarnings(results) {
    var warnings = [];
    results.forEach(function (r) {
      (r.warnings || []).forEach(function (w) {
        warnings.push({ productId: r.productId, message: w });
      });
    });
    if (warnings.length === 0) return '';
    var items = warnings.map(function (w) {
      var meta = findProduct(w.productId);
      var label = meta ? meta.shortName : w.productId;
      return '<li><strong>' + u.escapeHtml(label) + ':</strong> ' + u.escapeHtml(w.message) + '</li>';
    }).join('\n');
    return [
      '<aside class="quote-warnings no-print">',
      '  <h4>Internal notes (hidden in print)</h4>',
      '  <ul>' + items + '</ul>',
      '</aside>'
    ].join('\n');
  }

  // -------------------------------------------------------------
  // Top-level render
  // -------------------------------------------------------------

  function render(form, results, quoteNumber) {
    init();

    var sections = [];
    sections.push(renderWarnings(results));
    sections.push(renderHeader(form, quoteNumber));
    if (results.length > 0) {
      sections.push(renderProposalContents(results.map(function (r) {
        return { productId: r.productId, packageId: r.packageId };
      })));
    }
    sections.push(renderAboutABY());
    sections.push(renderStandardServices());

    results.forEach(function (r) {
      sections.push('<div class="product-block">');
      sections.push(renderProductOverview(r.productId));
      sections.push(renderPricingTable(r));
      sections.push('</div>');
    });

    sections.push(renderDisclaimer());
    var selectedIds = results.map(function (r) { return r.productId; });
    sections.push(renderAdditionalServices(selectedIds));

    return sections.filter(Boolean).join('\n');
  }

  return { render: render };
})();
