// ABY Quote Tool — Form controller

(function () {
  'use strict';

  var productListEl, formEl, outputEl, repSelectorEl, dateSelectEl;

  // -------------------------------------------------------------
  // Quote number continuity (Eric, 2026-08-06)
  //
  // Re-opening a saved quote must NOT change its number. It used to, for two
  // INDEPENDENT reasons, so fixing either alone did nothing: the admin's Re-run link
  // never carried the number, and generateQuoteNumber() ignores its arguments and
  // always mints a fresh one from TODAY's date plus a random suffix.
  //
  // `carriedQuoteNumber` is set only by prePopulateFromRerun(), off the admin link.
  // A quote typed from scratch has none and gets a new number exactly as before.
  // -------------------------------------------------------------

  var carriedQuoteNumber = null;

  // The BenefitLab client id, when the tool was opened from the broker dashboard
  // (F-268/F-341). ABY has never had a client identifier -- quotes are matched back to an
  // employer by the TYPED company name, so a typo silently attaches a quote to the wrong
  // one, or to none. Carrying the id makes that join exact.
  //
  // ⚠️ Published on `window` because save-hook.js is a separate script with no access to
  // this closure. It follows the channel `window.__abyReadOnly` already uses.
  var carriedClientId = null;
  var carriedBrokerLogoUrl = null;

  /**
   * Is this a broker logo URL we are willing to put in the quote's <img src>?
   *
   * 🔴 THIS IS NOT PARANOIA, IT IS THE THREAT MODEL: the value arrives in `?rerun=`, which is
   * a URL anyone can construct and send to anyone. Without a check, a crafted link would make
   * an ABY-branded quote display an arbitrary image from an arbitrary domain -- on a document
   * that carries ABY's fee schedule and an authorization page an employer signs. It would also
   * let a third party log every open (an <img> is a tracking pixel with extra steps).
   *
   * ⭐ SO IT IS AN ALLOWLIST, NOT A SANITISER. `https:` alone is not enough -- the point is not
   * that the URL is well-formed, it is that BenefitLab vouches for what is behind it.
   * ⚠️ Adding a host here is a deliberate act. It is a one-line data change; keep it that way.
   */
  var BROKER_LOGO_HOSTS = ['app.benefitlab.ai'];
  function isAllowedLogoUrl(value) {
    if (typeof value !== 'string' || !value) return false;
    var u;
    try { u = new URL(value); } catch (e) { return false; }
    if (u.protocol !== 'https:') return false;          // no data:, no javascript:, no http:
    return BROKER_LOGO_HOSTS.indexOf(u.hostname) !== -1;
  }

  // TX260806-1234-C / -NC. The suffix records whether commission is included, so it
  // is part of the quote's identity rather than decoration.
  var QUOTE_NUM_SHAPE = /^([A-Z]{2})(\d{6})-(\d{4})-(NC|C)$/;

  /**
   * Decide which number a render should carry.
   *
   * Keeping the carried number is the point, with ONE exception: if the broker flipped
   * the commission checkbox, the carried suffix now describes the wrong rate book. That
   * is a different quote at a different price, not a revision of the same one, so it
   * earns a new number.
   *
   * Pure, and kept as a named function so the rule can be tested without a browser.
   */
  function resolveQuoteNumber(carried, commissioned, mint) {
    var m = carried ? QUOTE_NUM_SHAPE.exec(carried) : null;
    if (!m) return mint();                                  // none carried, or unrecognisable
    if ((m[4] === 'C') !== !!commissioned) return mint();    // commission basis changed
    return carried;
  }

  // -------------------------------------------------------------
  // Build the product checkbox list from ABYQuote.products
  // -------------------------------------------------------------

  var ABY_COMMIT_JS = [
    'function abySign(v){v=(v||"").trim();var p=document.getElementById("printPreview"),s=document.getElementById("signPreview");if(p)p.textContent=v;if(s)s.textContent=v;}',
    'function abyElectedProducts(){var list=[];document.querySelectorAll(".opt-row").forEach(function(row){var cb=row.querySelector(".opt-check");if(!cb||!cb.checked)return;var label=cb.getAttribute("data-label");var sel=row.querySelector(".opt-tier-select");if(sel)label+=": "+sel.value;list.push(label);});return list;}',
    'function abyInitSignDate(){var d=document.getElementById("signDate");if(d&&!d.value)d.valueAsDate=new Date();}',
    'async function submitCommitment(e){e.preventDefault();var form=e.target;var products=abyElectedProducts();var msg=document.getElementById("commitMsg");if(products.length===0){msg.style.display="block";msg.style.color="#c00";msg.textContent="Please select at least one service to authorize.";return;}document.getElementById("productsField").value=JSON.stringify(products);var authSigner=(form.authSigner.value||"").trim();form.acceptedPrint.value=authSigner;form.acceptedSign.value=authSigner;var btn=document.getElementById("commitBtn");btn.disabled=true;btn.textContent="Submitting...";var payload={};new FormData(form).forEach(function(v,k){payload[k]=v;});try{payload.products=JSON.parse(payload.products||"[]");}catch(_){payload.products=products;}try{var res=await fetch("https://aby-quote-tool.eric-185.workers.dev/api/commitments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(res.ok){msg.style.display="block";msg.style.color="#1a5c3a";msg.innerHTML="✓ Authorization received. ABY Benefits has been notified and will be in touch shortly. You may print or save this page for your records.";btn.style.display="none";window.print();}else{msg.style.display="block";msg.style.color="#c00";msg.textContent="Submission failed. Please contact ABY Benefits directly.";btn.disabled=false;btn.textContent="Submit Authorization to ABY";}}catch(err){msg.style.display="block";msg.style.color="#c00";msg.textContent="Network error. Please contact ABY Benefits directly.";btn.disabled=false;btn.textContent="Submit Authorization to ABY";}}'
  ].join('\n');
  // Define the authorization-page helpers in-app so the on-screen preview is interactive too.
  try { (0, eval)(ABY_COMMIT_JS); } catch (e) {}

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

    // Optional: let the broker mark one option as "recommended" (highlighted on the quote).
    var recLabel = document.createElement('label');
    recLabel.style.cssText = 'display:block;margin-top:10px;';
    var recSpan = document.createElement('span');
    recSpan.textContent = 'Highlight a recommended option (optional)';
    var recSel = document.createElement('select');
    recSel.dataset.recommended = product.id;
    var noneOpt = document.createElement('option');
    noneOpt.value = ''; noneOpt.textContent = 'None';
    recSel.appendChild(noneOpt);
    product.packages.forEach(function (pkg) {
      var o = document.createElement('option');
      o.value = pkg.id; o.textContent = pkg.name;
      recSel.appendChild(o);
    });
    recLabel.appendChild(recSpan);
    recLabel.appendChild(recSel);
    wrap.appendChild(recLabel);

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

  var MAX_EFFECTIVE_DATE = '2027-01-01';

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

    data.recommendedPackages = {};
    formEl.querySelectorAll('[data-recommended]').forEach(function (sel) {
      if (sel.value) data.recommendedPackages[sel.dataset.recommended] = sel.value;
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

    // Medicare Secondary Payer (MSP) conflict check: COBRA implies 20+ employees,
    // which triggers MSP rules that disqualify the group from a Medicare HRA.
    var selectedIds = form.selections.map(function (s) { return s.productId; });
    if (selectedIds.indexOf('cobra') !== -1 && selectedIds.indexOf('mpra') !== -1) {
      var proceed = window.confirm(
        'You selected COBRA, which indicates the group has 20 or more employees. ' +
        'Groups that size are subject to the Medicare Secondary Payer (MSP) rules, which ' +
        'disqualify them from a Medicare Premium Reimbursement Arrangement (Medicare HRA). ' +
        'Are you sure you want to continue?'
      );
      if (!proceed) return;
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
      // ⭐ AN UPLOADED FILE WINS OVER THE CARRIED URL, and that order is deliberate: the broker
      // is standing at the form. If they took the trouble to attach a logo on this quote, that
      // is a more recent statement of intent than whatever their agency profile holds.
      if (carriedBrokerLogoUrl) form.brokerLogoUrl = carriedBrokerLogoUrl;
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
    var quoteNumber = resolveQuoteNumber(carriedQuoteNumber, form.commissioned, function () {
      return ABYQuote.utils.generateQuoteNumber(form.effectiveDate, form.commissioned);
    });
    // Hand the number to save-hook.js instead of making it scrape the rendered page for it.
    // save-hook.js used to recover the number by regexing #quoteOutput.textContent, so a
    // change to the renderer's markup could have stopped EVERY quote saving -- silently,
    // because that file swallows failures by design. Published BEFORE the innerHTML write,
    // so it is already set when the MutationObserver fires. Same channel as
    // `window.__abyClientId` / `window.__abyReadOnly`.
    window.__abyQuoteNumber = quoteNumber;

    var html = ABYQuote.renderer.renderInternal(form, results, quoteNumber, {
      includeAuthorization: true,
      clientId: window.__abyClientId || '',
    });

    outputEl.innerHTML =
      '<div class="output-toolbar no-print">' +
      '  <button type="button" class="primary" id="pdfBtn">Download PDF</button>' +
      '  <button type="button" class="secondary" id="htmlBtn">Download HTML</button>' +
      '  <button type="button" class="secondary" id="printBtn">Print</button>' +
      '</div>' +
      '<div class="quote">' + html + '</div>';

    if (typeof abyInitSignDate === 'function') abyInitSignDate();

    var printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

    var pdfBtn = document.getElementById('pdfBtn');
    if (pdfBtn) pdfBtn.addEventListener('click', function () { downloadQuoteAsPdf(form, quoteNumber); });

    var htmlBtn = document.getElementById('htmlBtn');
    if (htmlBtn) htmlBtn.addEventListener('click', function () { downloadQuoteAsHtml(form, quoteNumber); });

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

    // The PDF is a client artifact too. It strips `.no-print` (which is how the internal
    // notes box stays out of it), so the same disclosure gap applies -- tell the broker.
    noticeIfClientFileCarriesWarnings(
      ABYQuote.engine.calculateAll(expandSelections(form.selections), form.commissioned)
    );

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


  // -------------------------------------------------------------
  // Download HTML (self-contained, offline-ready)
  // -------------------------------------------------------------

  // ── Tell the broker when the file they just produced rests on a fallback price ──────────
  //
  // F-337: the engine falls back to the COMMISSIONED table when a no-commission rate is
  // missing and raises a warning. That warning renders only in the internal box, which the
  // client file correctly omits -- so the rep saw it and the employer got the price, and
  // nobody was told the two disagreed. This puts the fact where the broker is actually
  // looking at the moment they create the artifact, WITHOUT putting internal notes into the
  // client's document.
  //
  // ⛔ Deliberately does NOT block the download. Refusing to produce a file mid-quote is a
  // product decision on a live commercial tool and it is Eric's, not mine. This makes the
  // condition impossible to miss; it does not decide what to do about it.
  function noticeIfClientFileCarriesWarnings(results) {
    var warnings = ABYQuote.renderer.collectWarnings(results);
    var host = document.querySelector('.output-toolbar');
    var existing = document.getElementById('clientFileWarning');
    if (existing) existing.parentNode.removeChild(existing);
    if (warnings.length === 0 || !host) return;

    var el = document.createElement('div');
    el.id = 'clientFileWarning';
    el.className = 'no-print';
    el.setAttribute('role', 'status');
    el.style.cssText = 'margin-top:10px;padding:10px 12px;border:1px solid #d9a300;' +
      'background:#fff8e1;color:#5c4600;border-radius:6px;font-size:13px;line-height:1.45;';
    var lines = warnings.map(function (w) { return ABYQuote.utils.escapeHtml(w.message); });
    el.innerHTML = '<strong>Check this before sending:</strong> the file you just downloaded ' +
      'does not show these internal notes, but the prices in it depend on them.<ul style="margin:6px 0 0 18px;padding:0;">' +
      lines.map(function (m) { return '<li>' + m + '</li>'; }).join('') + '</ul>';
    host.parentNode.insertBefore(el, host.nextSibling);
  }

  function downloadQuoteAsHtml(form, quoteNumber) {
    var expanded = expandSelections(form.selections);
    var results = ABYQuote.engine.calculateAll(expanded, form.commissioned);
    noticeIfClientFileCarriesWarnings(results);
    var body = ABYQuote.renderer.renderForClient(form, results, quoteNumber, {
      includeAuthorization: true,
      clientId: window.__abyClientId || '',
    });
    // Make the ABY logo load from the deployed worker when the client opens the saved file.
    // ⭐ POINTS AT THE BRANDED DOMAIN, NOT `*.workers.dev`. This url is embedded in a document
    // an employer opens and signs, so it is read by a customer: a `workers.dev` hostname reads
    // as scaffolding, and it is a name ABY does not control long-term. Same origin, same file.
    // 🔴 It only resolves for the RECIPIENT because `/assets/images/` is now exempt from
    // SITE_LOCKED — before that, both hostnames returned a 401 login page and every downloaded
    // quote carried a broken ABY logo. The two changes ship together or neither works.
    body = body.replace('assets/images/aby-logo.png', 'https://abyquotes.com/assets/images/aby-logo.png');
    var title = ABYQuote.utils.escapeHtml((form.clientName || 'ABY Quote') + ' ' + quoteNumber);
    var safeName = (form.clientName ? form.clientName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') : 'ABY-Quote');

    fetch('assets/css/quote.css')
      .then(function (r) { return r.ok ? r.text() : ''; })
      .catch(function () { return ''; })
      .then(function (css) {
        var html = '<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8">' +
          '<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' + title + '</title>' +
          '<style>' + css + '\nbody{margin:0;background:linear-gradient(180deg,#eaf3f8 0%,#f4f7f9 42%,#fff 100%);}' +
          '.wrap{max-width:1100px;margin:0 auto;padding:28px 18px 46px;}</style></head><body>' +
          '<div class="wrap">' + body + '</div>' +
          '<scr' + 'ipt>' + ABY_COMMIT_JS + '\nabyInitSignDate();</scr' + 'ipt></body></html>';
        var blob = new Blob([html], { type: 'text/html' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = safeName + ' - ' + quoteNumber + '.html';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      });
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

    // Carry the ORIGINAL quote number so re-opening a saved quote keeps its identity.
    // ⚠️ It keeps its original creation DATE too, deliberately: the date is embedded in
    // the number, so re-dating it would change the number, which is the bug being fixed.
    // The revision date belongs on the document, not in the number (Eric, 2026-08-06).
    // Older links, generated before the admin started sending it, simply have none.
    if (state.quoteNumber) carriedQuoteNumber = String(state.quoteNumber);

    // Carried through to the saved row so the quote can be matched to a BenefitLab client
    // exactly rather than by company name. Absent for a quote started here, as before.
    if (state.clientId) {
      carriedClientId = String(state.clientId);
      window.__abyClientId = carriedClientId;
    }

    // The broker's logo, so the quote is CO-BRANDED without them uploading it every time
    // (Eric, 2026-08-06: ABY's mark and the broker's; colors explicitly out). F-342.
    // ⭐ THIS IS NOT A NEW FEATURE -- the form has always had a `brokerLogo` file input and the
    // stylesheet has always had `.broker-logo` rules. What was missing is that a broker had to
    // find and upload the same image on every single quote. Same defect as retyping their own
    // name, which this file already fixes one field above.
    // ⛔ A rejected URL is simply ignored: no console noise, no fallback, no placeholder. An
    // unknown host is not an error to report to a broker, it is a logo we decline to show.
    if (isAllowedLogoUrl(state.brokerLogoUrl)) {
      carriedBrokerLogoUrl = String(state.brokerLogoUrl);
    }

    // Basic text fields
    ['clientName', 'effectiveDate', 'brokerName', 'brokerAgency', 'brokerPhone', 'brokerEmail'].forEach(function (key) {
      if (!state[key]) return;
      var el = document.getElementById(key) || formEl.querySelector('[name="' + key + '"]');
      if (!el) return;
      // ⚠️ effectiveDate is a <select>. Assigning a value that is not one of its options sets the
      // control to BLANK and reports nothing -- so a date carried in from the dashboard could
      // silently fail to apply and the broker would believe it had. Only apply a value the list
      // actually offers; otherwise leave the placeholder, which visibly asks to be answered.
      if (el.tagName === 'SELECT') {
        var offered = Array.prototype.some.call(el.options, function (o) { return o.value === state[key]; });
        if (!offered) return;
      }
      el.value = state[key];
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

  // ── Broker email is required on the PUBLIC path (Eric, 2026-08-06) ─────────────────────
  //
  // 🔴 THE HOLE WAS NEVER THE FORMAT. `index.html` already declares type="email", so the
  // browser format-checks it. It is that NONE of the four broker fields is `required` --
  // only the effective date is -- so a quote from the shared "generic link" could reach ABY
  // carrying NO BROKER IDENTITY AT ALL: a saved row, a notification email, and no way to
  // tell who ran it. For a dashboard broker these fields arrive prefilled, so this closes a
  // hole that exists only for the audience the generic link is for.
  //
  // ⛔ NO SPELLING CHECK, ON ERIC'S INSTRUCTION: "I'm not worried about misspelled emails.
  // If that happens, we'll figure it out." He is right -- laura@vigilagecy.com passes every
  // check that exists, so a second validator would re-implement the browser's job and still
  // miss the only case that matters. Do not re-propose it.
  //
  // ⭐ SET HERE RATHER THAN IN index.html for two reasons: it keeps the deploy surface to the
  // files already in this batch, and it leaves the ABY-only overlay able to relax it --
  // ABY runs quotes too, and a required field must never stop them.
  function requireBrokerEmail() {
    if (window.ABY_INTERNAL) return;          // an ABY session: the overlay decides
    var el = formEl && formEl.querySelector('[name="brokerEmail"]');
    if (!el) return;
    el.required = true;
    // The label has to say so, or the browser's "please fill in this field" is the first the
    // broker hears of it -- and an unexplained required field on a live tool reads as broken.
    var label = el.closest('label') || (el.previousElementSibling && el.previousElementSibling.tagName === 'LABEL'
      ? el.previousElementSibling : null);
    var host = label || el.parentElement;
    if (host && !host.querySelector('.req-mark')) {
      var mark = document.createElement('span');
      mark.className = 'req-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.style.cssText = 'color:#c0392b;margin-left:3px;';
      mark.textContent = '*';
      var lbl = host.querySelector('label') || host;
      (lbl.firstElementChild === el ? host : lbl).appendChild(mark);
    }
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
    requireBrokerEmail();

    // Capture readonly flag BEFORE prePopulateFromRerun() strips URL params via history.replaceState.
    var isReadOnly = new URLSearchParams(window.location.search).get('readonly') === '1';

    prePopulateFromRerun();

    formEl.addEventListener('submit', generateQuote);
    var resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetForm);

    // View Quote mode: auto-generate without saving to the admin log.
    // save-hook.js sees window.__abyReadOnly = true and skips the POST.
    if (isReadOnly) {
      window.__abyReadOnly = true;
      setTimeout(generateQuote, 150);
    }
  });
})();