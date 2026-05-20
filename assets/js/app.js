// ABY Quote Tool — Form controller

(function () {
  'use strict';

  var productListEl, formEl, outputEl, repSelectorEl, dateSelectEl;

  // -------------------------------------------------------------
  // Build the product checkbox list from ABYQuote.products
  // -------------------------------------------------------------

  function buildProductList() {
    productListEl.innerHTML = '';
    ABYQuote.products.forEach(function (product) {
      var row = document.createElement('div');
      row.className = 'product-row';
      row.dataset.productId = product.id;

      var head = document.createElement('div');
      head.className = 'product-row-head';

      var checkboxId = 'product-' + product.id;
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = checkboxId;
      checkbox.dataset.productCheckbox = product.id;

      var label = document.createElement('label');
      label.htmlFor = checkboxId;
      label.textContent = product.name;

      head.appendChild(checkbox);
      head.appendChild(label);
      row.appendChild(head);

      var options = buildProductOptions(product);
      options.hidden = true;
      row.appendChild(options);

      checkbox.addEventListener('change', function () {
        options.hidden = !checkbox.checked;
        row.classList.toggle('selected', checkbox.checked);
      });

      productListEl.appendChild(row);
    });
  }

  function buildProductOptions(product) {
    var wrap = document.createElement('div');
    wrap.className = 'product-row-options';
    wrap.dataset.productOptions = product.id;

    if (product.inputType === 'count') {
      wrap.appendChild(buildCountInput(product));
    } else if (product.inputType === 'multi-package' || product.id === 'erisa') {
      // ERISA always uses checkboxes so brokers can quote multiple packages at once.
      // The product.id check ensures this works even if products.js is cached with
      // the old inputType: 'package' value.
      wrap.appendChild(buildMultiPackageCheckboxes(product));
    } else if (product.inputType === 'package') {
      wrap.appendChild(buildPackageSelect(product));
    } else if (product.inputType === 'package-with-count') {
      var pkgSelect = buildPackageSelect(product);
      var countInput = buildCountInput(product);
      wrap.appendChild(pkgSelect);
      wrap.appendChild(countInput);
      var pkgEl = pkgSelect.querySelector('select');
      var countWrap = countInput;
      function updateCountVisibility() {
        var selectedPkgId = pkgEl.value;
        var pkg = product.packages.find(function (p) { return p.id === selectedPkgId; });
        countWrap.style.display = (pkg && pkg.requiresCount) ? '' : 'none';
      }
      pkgEl.addEventListener('change', updateCountVisibility);
      updateCountVisibility();
    }
    return wrap;
  }

  function buildCountInput(product) {
    var label = document.createElement('label');
    var span = document.createElement('span');
    span.textContent = 'Number of ' + (product.countLabel || 'participants');
    var input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.placeholder = '0';
    input.dataset.productInput = product.id + ':count';
    label.appendChild(span);
    label.appendChild(input);
    return label;
  }

  function buildPackageSelect(product) {
    var label = document.createElement('label');
    var span = document.createElement('span');
    span.textContent = 'Plan / Package';
    var select = document.createElement('select');
    select.dataset.productInput = product.id + ':package';
    product.packages.forEach(function (pkg) {
      var opt = document.createElement('option');
      opt.value = pkg.id;
      opt.textContent = pkg.name;
      select.appendChild(opt);
    });
    label.appendChild(span);
    label.appendChild(select);
    return label;
  }

  // Renders checkboxes so the broker can quote 1-5 ERISA packages at once.
  function buildMultiPackageCheckboxes(product) {
    var wrap = document.createElement('div');
    wrap.className = 'product-package-multi';

    var heading = document.createElement('p');
    heading.className = 'product-package-multi-label';
    heading.style.cssText = 'margin:0 0 8px;font-size:1rem;color:#555;font-weight:600;';
    heading.textContent = 'Select packages to quote — choose one or more:';
    wrap.appendChild(heading);

    product.packages.forEach(function (pkg) {
      var cbId = 'pkg-' + product.id + '-' + pkg.id;

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = cbId;
      cb.dataset.productInput = product.id + ':package:' + pkg.id;
      cb.style.cssText = 'margin:0;cursor:pointer;';

      // Wrap checkbox in a span so site-wide "input { width:100% }" can't stretch it
      var cbWrap = document.createElement('span');
      cbWrap.style.cssText = 'display:inline-flex;align-items:center;width:auto;flex-shrink:0;line-height:1;';
      cbWrap.appendChild(cb);

      var span = document.createElement('span');
      span.textContent = pkg.name;
      span.style.cssText = 'cursor:pointer;';

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:1rem;cursor:pointer;';
      row.appendChild(cbWrap);
      row.appendChild(span);

      // Clicking anywhere on the row toggles the checkbox
      row.addEventListener('click', function (e) {
        if (e.target !== cb) {
          cb.checked = !cb.checked;
        }
      });

      wrap.appendChild(row);
    });

    return wrap;
  }

  // -------------------------------------------------------------
  // Sales rep selector
  // -------------------------------------------------------------

  function buildRepSelector() {
    if (!ABYQuote.salesReps || ABYQuote.salesReps.length === 0) return;
    repSelectorEl.innerHTML = '';

    ABYQuote.salesReps.forEach(function (rep) {
      var card = document.createElement('label');
      card.className = 'rep-card';
      card.dataset.repId = rep.id;

      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'repPick';
      radio.value = rep.id;

      var info = document.createElement('div');
      info.className = 'rep-card-info';
      var nameEl = document.createElement('div');
      nameEl.className = 'rep-card-name';
      nameEl.textContent = rep.name || '(unnamed rep)';
      info.appendChild(nameEl);
      if (rep.title) {
        var titleEl = document.createElement('div');
        titleEl.className = 'rep-card-title';
        titleEl.textContent = rep.title;
        info.appendChild(titleEl);
      }

      card.appendChild(radio);
      card.appendChild(info);

      radio.addEventListener('change', function () {
        if (radio.checked) populateRepFields(rep);
        updateRepCardSelection();
      });

      repSelectorEl.appendChild(card);
    });
  }

  function updateRepCardSelection() {
    var cards = repSelectorEl.querySelectorAll('.rep-card');
    cards.forEach(function (c) {
      var radio = c.querySelector('input[type="radio"]');
      c.classList.toggle('selected', radio && radio.checked);
    });
  }

  function populateRepFields(rep) {
    document.getElementById('repName').value  = rep.name  || '';
    document.getElementById('repPhone').value = rep.phone || '';
    document.getElementById('repEmail').value = rep.email || '';
  }

  // -------------------------------------------------------------
  // Effective date dropdown
  // YEAR-END NOTE: update MAX_EFFECTIVE_DATE once a year.
  // -------------------------------------------------------------

  var MAX_EFFECTIVE_DATE = '2026-12-01';

  function buildEffectiveDateOptions() {
    if (!dateSelectEl) return;
    dateSelectEl.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Select effective date —';
    placeholder.disabled = true;
    placeholder.selected = true;
    dateSelectEl.appendChild(placeholder);

    var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    var now = new Date();
    var todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    var endParts = MAX_EFFECTIVE_DATE.split('-');
    var endDate = new Date(Number(endParts[0]), Number(endParts[1]) - 1, Number(endParts[2]));

    var iter = new Date(now.getFullYear(), now.getMonth(), 1);

    while (iter <= endDate) {
      var cutoff = new Date(iter.getFullYear(), iter.getMonth(), 16);
      if (todayMidnight < cutoff) {
        var y = iter.getFullYear();
        var m = iter.getMonth();
        var iso = y + '-' + String(m + 1).padStart(2, '0') + '-01';
        var label = monthNames[m] + ' 1, ' + y;
        var opt = document.createElement('option');
        opt.value = iso;
        opt.textContent = label;
        dateSelectEl.appendChild(opt);
      }
      iter.setMonth(iter.getMonth() + 1);
    }
  }

  // -------------------------------------------------------------
  // Read form values
  // -------------------------------------------------------------

  function readForm() {
    var fd = new FormData(formEl);
    var data = {};
    fd.forEach(function (val, key) { data[key] = (typeof val === 'string') ? val.trim() : val; });

    data.commissioned = formEl.querySelector('[name="commissionIncluded"]').checked;

    data.selections = [];
    var checkboxes = formEl.querySelectorAll('[data-product-checkbox]');
    checkboxes.forEach(function (cb) {
      if (!cb.checked) return;
      var productId = cb.dataset.productCheckbox;
      var product = ABYQuote.products.find(function (p) { return p.id === productId; });
      var selection = { productId: productId };

      if (product.inputType === 'count') {
        var ci = formEl.querySelector('[data-product-input="' + productId + ':count"]');
        selection.count = ci && ci.value !== '' ? Number(ci.value) : null;
      } else if (product.inputType === 'multi-package' || product.id === 'erisa') {
        var multiCbs = formEl.querySelectorAll('[data-product-input^="' + productId + ':package:"]');
        var packageIds = [];
        multiCbs.forEach(function (pcb) {
          if (pcb.checked) {
            packageIds.push(pcb.dataset.productInput.split(':')[2]);
          }
        });
        selection.packageIds = packageIds;
      } else if (product.inputType === 'package') {
        var ps = formEl.querySelector('[data-product-input="' + productId + ':package"]');
        selection.packageId = ps ? ps.value : (product.packages[0] && product.packages[0].id);
      } else if (product.inputType === 'package-with-count') {
        var ps2 = formEl.querySelector('[data-product-input="' + productId + ':package"]');
        var ci2 = formEl.querySelector('[data-product-input="' + productId + ':count"]');
        selection.packageId = ps2 ? ps2.value : null;
        selection.count = ci2 && ci2.value !== '' ? Number(ci2.value) : null;
      }
      data.selections.push(selection);
    });

    return data;
  }

  // -------------------------------------------------------------
  // Expand multi-package selections before passing to the engine
  // -------------------------------------------------------------

  function expandSelections(selections) {
    var expanded = [];
    selections.forEach(function (sel) {
      if (Array.isArray(sel.packageIds)) {
        sel.packageIds.forEach(function (pkgId) {
          expanded.push({ productId: sel.productId, packageId: pkgId });
        });
      } else {
        expanded.push(sel);
      }
    });
    return expanded;
  }

  // -------------------------------------------------------------
  // Generate quote
  // -------------------------------------------------------------

  function generateQuote(e) {
    if (e) e.preventDefault();
    var form = readForm();

    if (form.selections.length === 0) {
      outputEl.innerHTML = '<div class="empty-state">Select at least one product to generate a quote.</div>';
      return;
    }

    var brokerLogoFile = formEl.querySelector('[name="brokerLogo"]').files[0];
    if (brokerLogoFile) {
      var reader = new FileReader();
      reader.onload = function () {
        form.brokerLogoDataUrl = reader.result;
        renderQuote(form);
      };
      reader.readAsDataURL(brokerLogoFile);
    } else {
      renderQuote(form);
    }
  }

  function renderQuote(form) {
    var expanded = expandSelections(form.selections);
    if (expanded.length === 0) {
      outputEl.innerHTML = '<div class="empty-state">Select at least one product to generate a quote.</div>';
      return;
    }

    var results = ABYQuote.engine.calculateAll(expanded, form.commissioned);
    var quoteNumber = ABYQuote.utils.generateQuoteNumber(form.effectiveDate, form.commissioned);
    var html = ABYQuote.renderer.render(form, results, quoteNumber);

    outputEl.innerHTML =
      '<div class="output-toolbar no-print">' +
      '  <button type="button" class="primary" id="pdfBtn">Download PDF</button>' +
      '  <button type="button" class="secondary" id="printBtn">Print</button>' +
      '</div>' +
      '<div class="quote">' + html + '</div>';

    var printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

    var pdfBtn = document.getElementById('pdfBtn');
    if (pdfBtn) pdfBtn.addEventListener('click', function () { downloadQuoteAsPdf(form, quoteNumber); });

    outputEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // -------------------------------------------------------------
  // Download PDF
  // -------------------------------------------------------------

  function downloadQuoteAsPdf(form, quoteNumber) {
    if (typeof html2pdf === 'undefined') {
      alert('PDF library is loading — please try again in a moment.');
      return;
    }
    var liveQuote = outputEl.querySelector('.quote');
    if (!liveQuote) return;

    var element = liveQuote.cloneNode(true);

    var hiddenEls = element.querySelectorAll('.no-print');
    hiddenEls.forEach(function (el) { el.parentNode && el.parentNode.removeChild(el); });

    element.style.boxShadow = 'none';
    element.style.border = 'none';
    element.style.borderRadius = '0';
    element.style.padding = '0';
    element.style.margin = '0';
    element.style.background = '#fff';

    var clientPart = (form.clientName || 'Quote').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, ' ');
    var filename = clientPart + ' - ' + quoteNumber + '.pdf';

    var opt = {
      margin:       [0.5, 0.5, 0.5, 0.5],
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false, scrollY: 0 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
      pagebreak:    { mode: ['css', 'legacy'], before: '.page-break-before', avoid: ['.product-block', '.pricing-table-wrap', '.boxed', '.standard-services', '.disclaimer', '.cross-sell-card', 'table', 'tr'] }
    };

    html2pdf().set(opt).from(element).save();
  }

  function resetForm() {
    formEl.reset();
    var panels = formEl.querySelectorAll('[data-product-options]');
    panels.forEach(function (p) { p.hidden = true; });
    var rows = formEl.querySelectorAll('.product-row');
    rows.forEach(function (r) { r.classList.remove('selected'); });
    var repCards = repSelectorEl ? repSelectorEl.querySelectorAll('.rep-card') : [];
    repCards.forEach(function (c) { c.classList.remove('selected'); });
    outputEl.innerHTML = '';
  }

  // -------------------------------------------------------------
  // Phone number auto-format
  // -------------------------------------------------------------

  function formatPhone(raw) {
    if (!raw) return '';
    var digits = String(raw).replace(/\D/g, '');
    if (digits.length === 11 && digits[0] === '1') digits = digits.slice(1);
    if (digits.length !== 10) return raw;
    return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function attachPhoneFormatters() {
    var inputs = formEl.querySelectorAll('input[type="tel"]');
    inputs.forEach(function (input) {
      input.addEventListener('blur', function () {
        input.value = formatPhone(input.value);
      });
    });
  }

  // -------------------------------------------------------------
  // Pre-populate form from a ?rerun= URL param (set by admin Re-run link)
  // -------------------------------------------------------------

  function prePopulateFromRerun() {
    var params = new URLSearchParams(window.location.search);
    var rerunParam = params.get('rerun');
    if (!rerunParam) return;

    var state;
    try { state = JSON.parse(decodeURIComponent(rerunParam)); } catch (e) { return; }

    // Basic text fields
    ['clientName', 'effectiveDate', 'brokerName', 'brokerAgency', 'brokerPhone', 'brokerEmail'].forEach(function (key) {
      if (!state[key]) return;
      var el = document.getElementById(key) || formEl.querySelector('[name="' + key + '"]');
      if (el) el.value = state[key];
    });

    // Commission checkbox
    if (state.commissionIncluded != null) {
      var commCb = document.getElementById('commissionIncluded');
      if (commCb) commCb.checked = !!state.commissionIncluded;
    }

    // Rep: find the card whose visible name matches the saved rep name
    if (state.repName && repSelectorEl) {
      repSelectorEl.querySelectorAll('.rep-card').forEach(function (card) {
        var nameEl = card.querySelector('.rep-card-name');
        if (nameEl && nameEl.textContent.trim() === state.repName.trim()) {
          var radio = card.querySelector('input[type="radio"]');
          if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
        }
      });
    }

    // Products
    var productArr;
    try {
      productArr = typeof state.products === 'string' ? JSON.parse(state.products) : (state.products || []);
    } catch (e) { productArr = []; }

    productArr.forEach(function (p) {
      var cb = document.querySelector('[data-product-checkbox="' + p.id + '"]');
      if (!cb) return;
      cb.checked = true;
      cb.dispatchEvent(new Event('change')); // reveals the options panel

      if (!p.inputs) return;

      // Single package select (POP, ICHRA, ACA)
      if (p.inputs.package) {
        var sel = document.querySelector('[data-product-input="' + p.id + ':package"]');
        if (sel) { sel.value = p.inputs.package; sel.dispatchEvent(new Event('change')); }
      }

      // Multi-package checkboxes (ERISA)
      if (p.inputs.packageIds) {
        p.inputs.packageIds.split(',').filter(Boolean).forEach(function (pkgId) {
          var pkgCb = document.querySelector('[data-product-input="' + p.id + ':package:' + pkgId + '"]');
          if (pkgCb) pkgCb.checked = true;
        });
      }

      // Participant / account / form count
      if (p.inputs.count) {
        var countEl = document.querySelector('[data-product-input="' + p.id + ':count"]');
        if (countEl) { countEl.value = p.inputs.count; countEl.dispatchEvent(new Event('change')); }
      }
    });

    // Clean up URL so the long param doesn't linger in the address bar
    history.replaceState({}, '', window.location.pathname);
  }

  document.addEventListener('DOMContentLoaded', function () {
    productListEl = document.getElementById('productList');
    formEl = document.getElementById('quoteForm');
    outputEl = document.getElementById('quoteOutput');
    repSelectorEl = document.getElementById('repSelector');
    dateSelectEl = document.getElementById('effectiveDateSelect');

    buildProductList();
    buildRepSelector();
    buildEffectiveDateOptions();
    attachPhoneFormatters();
    prePopulateFromRerun();

    formEl.addEventListener('submit', generateQuote);
    var resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetForm);
  });
})();
