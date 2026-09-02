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

  // The logo from the broker's own ABY ACCOUNT (F-6), as a data URL. Lowest precedence of the
  // three: an uploaded file wins, then the BenefitLab hand-off, then this.
  var accountLogoDataUrl = null;

  // The name the BROKER'S FIRM wants a client to read, when it differs from the one ABY files
  // them under (F-429). Eric: "we might call an agency MMA-DFW but they may want it to say MMA
  // or Marsh on the quote."
  //
  // ⭐⭐ A SEPARATE VALUE FROM THE FORM FIELD, AND THAT IS THE WHOLE POINT. The brokerAgency INPUT
  // keeps our own name, because that is the string a saved quote stores and twenty joins on the
  // server match a firm on. This one is read only when the document is drawn. Putting the display
  // name into the input would have been simpler and would have written it into the next quote.
  //
  // 🔴 SERVER-SET ONLY, exactly like agencyLogoPath. It is applied under the same `fromServer`
  // guard, so a crafted ?rerun= link cannot put a firm's name of its choosing on an ABY document.
  var carriedAgencyDisplay = null;

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
  // ⭐ THE VERSION SUFFIX IS OPTIONAL AND WAS MISSING (2026-08-31). Without it TX260831-3379-NC-2
  // did not match at all, so re-running a version minted a brand-new number and lost the family.
  var QUOTE_NUM_SHAPE = /^([A-Z]{2})(\d{6})-(\d{4})-(NC|C)(?:-(\d+))?$/;

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
    if ((m[4] === 'C') !== !!commissioned) {
      // 🔴🔴 THE COMMISSION FLIP KEEPS THE FAMILY AND SWAPS ONLY THE RATE BOOK (Eric, 2026-08-31).
      //
      // This used to call mint(), which generates a fresh RANDOM block -- so quoting with
      // commission and then without produced two numbers with nothing in common, and the pair
      // could not be recognised as one quote by anybody reading them. Eric found it by testing:
      // "I quoted with commission and requoted without commission and it changed the four digits
      // in the quote number. was that supposed to happen?" It was not.
      //
      // ⭐ HIS OWN FRAMING IS THE RULE: "C and NC are part of the quote number... so at least THAT
      // part of the quote number should change." The state, the date and the 4-digit block are the
      // quote's identity and stay; only the rate book moves.
      // ⛔ THE VERSION IS DROPPED, not carried across. A version numbers revisions of one priced
      // line; the other rate book has its own line and starts at its own beginning. Carrying it
      // would produce TX260831-3379-C-2 with no -C ever having existed.
      return m[1] + m[2] + '-' + m[3] + '-' + (commissioned ? 'C' : 'NC');
    }
    return carried;
  }

  // -------------------------------------------------------------
  // Build the product checkbox list from ABYQuote.products
  // -------------------------------------------------------------

  var ABY_COMMIT_JS = [
    'function abySign(v){v=(v||"").trim();var p=document.getElementById("printPreview"),s=document.getElementById("signPreview");if(p)p.textContent=v;if(s)s.textContent=v;}',
    'function abyElectedProducts(){var list=[];document.querySelectorAll(".opt-row").forEach(function(row){var cb=row.querySelector(".opt-check");if(!cb||!cb.checked)return;var label=cb.getAttribute("data-label");var sel=row.querySelector(".opt-tier-select");if(sel)label+=": "+sel.value;list.push(label);});return list;}',
    'function abyInitSignDate(){var d=document.getElementById("signDate");if(d&&!d.value)d.valueAsDate=new Date();}',
        // WHICH QUOTE WAS SIGNED, backfilled at SUBMIT time (F-416). The fields are rendered
    // empty because the quote is drawn before save-hook.js has POSTed it; by the time an
    // employer has typed their details and signed, the id is long since known.
    // NO REGEX HERE, DELIBERATELY. This whole block is a STRING that is inlined into the
    // downloaded document, and a backslash escape inside it is eaten before it ever
    // becomes code -- which is TRAPS #224, and it would leave a pattern that silently
    // matches nothing. indexOf and slice need no escaping.
    'async function submitCommitment(e){e.preventDefault();var form=e.target;var qf=document.getElementById("quoteIdField");if(qf&&!qf.value&&window.__abySavedQuoteId)qf.value=window.__abySavedQuoteId;var tf=document.getElementById("shareTokenField");if(tf&&!tf.value){var pp=String(location.pathname||"");if(pp.indexOf("/q/")===0)tf.value=pp.slice(3).split("/")[0];}var products=abyElectedProducts();var msg=document.getElementById("commitMsg");if(products.length===0){msg.style.display="block";msg.style.color="#c00";msg.textContent="Please select at least one service to authorize.";return;}document.getElementById("productsField").value=JSON.stringify(products);var authSigner=(form.authSigner.value||"").trim();form.acceptedPrint.value=authSigner;form.acceptedSign.value=authSigner;var btn=document.getElementById("commitBtn");btn.disabled=true;btn.textContent="Submitting...";var payload={};new FormData(form).forEach(function(v,k){payload[k]=v;});try{payload.products=JSON.parse(payload.products||"[]");}catch(_){payload.products=products;}try{var res=await fetch("https://aby-quote-tool.eric-185.workers.dev/api/commitments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(res.ok){msg.style.display="block";msg.style.color="#1a5c3a";msg.innerHTML="✓ Authorization received. ABY Benefits has been notified and will be in touch shortly. You may print or save this page for your records.";btn.style.display="none";window.print();}else{msg.style.display="block";msg.style.color="#c00";msg.textContent="Submission failed. Please contact ABY Benefits directly.";btn.disabled=false;btn.textContent="Submit Authorization to ABY";}}catch(err){msg.style.display="block";msg.style.color="#c00";msg.textContent="Network error. Please contact ABY Benefits directly.";btn.disabled=false;btn.textContent="Submit Authorization to ABY";}}'
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
      if (product.extras) wrap.appendChild(buildExtras(product, pkgEl, updateCountVisibility));
    }
    return wrap;
  }

  /**
   * The extra questions a product declares (ACA: EIN counts, late filing, state filing).
   *
   * ⭐ GENERIC, DRIVEN FROM products.js. Nothing about EINs is written here -- the labels, the
   * fees and the exclusion rule are all data, so a second product needing its own questions gets
   * them without touching this function.
   */
  function buildExtras(product, pkgEl, afterChange) {
    var box = document.createElement('div');
    box.className = 'product-extras';
    box.dataset.productExtras = product.id;

    var note = document.createElement('p');
    note.className = 'extras-note';
    note.dataset.extrasNote = product.id;
    note.style.display = 'none';
    note.textContent = product.excludedReason || '';
    box.appendChild(note);

    product.extras.forEach(function (x) {
      var label = document.createElement('label');
      label.className = (x.type === 'checkbox') ? 'extra-check' : 'extra-num';
      var input = document.createElement('input');
      if (x.type === 'checkbox') {
        input.type = 'checkbox';
      } else {
        input.type = 'number';
        input.min = '0';
        input.placeholder = '0';
      }
      input.dataset.productInput = product.id + ':extra:' + x.id;
      var span = document.createElement('span');
      span.textContent = x.label;
      // A checkbox reads left to right; a number field reads label-then-box like every other
      // field on this form. Putting them in the same order would make one of the two look broken.
      if (x.type === 'checkbox') { label.appendChild(input); label.appendChild(span); }
      else { label.appendChild(span); label.appendChild(input); }
      input.addEventListener('change', function () { applyExclusions(product, pkgEl, afterChange); });
      box.appendChild(label);
    });
    return box;
  }

  /**
   * Take the excluded packages OFF the dropdown when an excluding answer is given, and put them
   * back when it is withdrawn.
   *
   * 🔴 REMOVED, NOT DISABLED. Eric: multi-EIN or late filing means self-service "should not be
   * included on the quote". A greyed-out option still tells the employer that a cheaper thing
   * exists which they are being refused -- a conversation ABY does not want to have on a proposal.
   *
   * ⚠️ THE BROWSER IS NOT THE GUARD. The engine refuses the same combination independently, because
   * this function cannot run for a quote arriving through the admin re-run link.
   */
  function applyExclusions(product, pkgEl, afterChange) {
    if (!product.excludeWhenAnyOf || !product.excludedPackages) return;
    var hit = product.excludeWhenAnyOf.some(function (id) {
      var el = formEl.querySelector('[data-product-input="' + product.id + ':extra:' + id + '"]');
      if (!el) return false;
      return (el.type === 'checkbox') ? el.checked : (Number(el.value) > 0);
    });

    var note = formEl.querySelector('[data-extras-note="' + product.id + '"]');
    if (note) note.style.display = hit ? '' : 'none';

    var excluded = product.excludedPackages;
    var have = {};
    Array.prototype.forEach.call(pkgEl.options, function (o) { have[o.value] = o; });

    if (hit) {
      // ⛔ IF THE BROKER HAD ALREADY PICKED ONE, MOVE THEM SOMEWHERE REAL AND SAY SO IMPLICITLY BY
      // CHANGING THE VISIBLE SELECTION. Removing the selected option silently leaves the <select>
      // showing whatever happens to be first, which is a different package than they chose.
      var wasExcluded = excluded.indexOf(pkgEl.value) !== -1;
      excluded.forEach(function (id) { if (have[id]) pkgEl.removeChild(have[id]); });
      if (wasExcluded) {
        var swap = { selfLt100: 'fullLt100', selfMid: 'fullMid', selfHigh: 'fullHigh', selfXL: 'fullXL' };
        var want = swap[pkgEl.value] || null;
        pkgEl.value = (want && pkgEl.querySelector('option[value="' + want + '"]')) ? want
                    : (pkgEl.options[0] ? pkgEl.options[0].value : '');
      }
    } else {
      // Restore them in the product's own order, so the list never comes back shuffled.
      var wanted = product.packages.map(function (p) { return p.id; });
      var current = pkgEl.value;
      pkgEl.innerHTML = '';
      product.packages.forEach(function (pkg) {
        var opt = document.createElement('option');
        opt.value = pkg.id;
        opt.textContent = pkg.name;
        pkgEl.appendChild(opt);
      });
      if (wanted.indexOf(current) !== -1) pkgEl.value = current;
    }
    if (afterChange) afterChange();
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
  // Effective date dropdown -- a ROLLING horizon, so it can never run out.
  //
  // ERIC, 2026-08-17: "let's go always 6 months out until I change that. So you can show through
  // February right now. At the beginning of September you can add March. I don't want to go beyond
  // that right now in case we change the pricing."
  //
  // THE NUMBER IS COMMERCIAL, NOT TECHNICAL -- it is how far ahead ABY will quote against today's
  // pricing. That is why it stays one named constant: changing how far ahead the tool quotes has to
  // be a one-line decision Eric can ask for.
  //
  // WHAT THIS REPLACES, AND IT MATTERS MORE THAN THE ASK: a hardcoded MAX_EFFECTIVE_DATE with a
  // "YEAR-END NOTE: update once a year" comment above it. The loop starts at the current month and
  // drops a month once past its 16th, so the list DOES NOT GET SHORT, IT GOES EMPTY -- and the field
  // is `required`, so from 16 January 2027 the tool could not have produced a quote at all. A note
  // asking a human to remember something once a year is not a mechanism. This removes the cliff
  // rather than moving it again.
  // -------------------------------------------------------------

  var EFFECTIVE_DATE_MONTHS_AHEAD = 6;

  // First of the month, EFFECTIVE_DATE_MONTHS_AHEAD months from the current one. Computed per call
  // rather than once at load, so a tab left open across a month boundary cannot go stale.
  // Day 1 also avoids the month-end rollover trap: new Date(2026, 7, 31) plus six months lands in
  // March, because 31 February does not exist and JS silently overflows it.
  function maxEffectiveDate() {
    var t = new Date();
    return new Date(t.getFullYear(), t.getMonth() + EFFECTIVE_DATE_MONTHS_AHEAD, 1);
  }

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

    var endDate = maxEffectiveDate();

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
      // ⭐ ZERO IS NOT RECORDED. An extras object full of zeros would put "0 additional EINs" on
      // the elected page of every ACA quote, which is a line about a thing that is not happening.
      if (product.extras) {
        var extras = {};
        product.extras.forEach(function (x) {
          var el = formEl.querySelector('[data-product-input="' + productId + ':extra:' + x.id + '"]');
          if (!el) return;
          if (x.type === 'checkbox') { if (el.checked) extras[x.id] = true; }
          else { var n = Number(el.value); if (el.value !== '' && n > 0) extras[x.id] = n; }
        });
        if (Object.keys(extras).length) selection.extras = extras;
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
      // 🔴🔴 AN IMAGE THE BROWSER CANNOT DECODE USED TO FAIL IN COMPLETE SILENCE, AND THAT IS
      // WHAT A REAL BROKER HIT. Eric, 2026-08-27, relaying Niels: "he uploaded the logo and ran
      // the quote and it never appeared -- not on his version of the quote, not on the quote that
      // popped up from the link, nothing."
      //
      // ⭐⭐ THE MECHANISM, REPRODUCED EXACTLY: FileReader happily turns ANY file into a data URL,
      // including one that is not a decodable image -- a HEIC from a phone, a renamed file, a
      // truncated download. The <img> is then emitted with a perfectly well-formed src, the
      // browser declines to decode it, and the result is an EMPTY BOX with no error anywhere.
      // ⚠️ `complete` is TRUE in that state; `naturalWidth === 0` is the only tell.
      //
      // ⛔ SO THE FILE IS DECODED BEFORE IT IS TRUSTED, and a failure is SAID OUT LOUD. Eric:
      // "it should probably tell us instead of accepting the upload and then not doing anything
      // with it." ⭐ The quote still renders -- a bad logo must never cost somebody their quote.
      reader.onerror = function () {
        logoProblem('That file could not be read. The quote was generated without a logo.');
        renderQuote(form);
      };
      reader.onload = function () {
        var probe = new Image();
        probe.onload = function () {
          if (!probe.naturalWidth) {
            logoProblem('That image could not be displayed, so the quote was generated without '
              + 'it. Please try a PNG or JPG saved from your computer.');
            renderQuote(form);
            return;
          }
          logoProblem('');
          form.brokerLogoDataUrl = reader.result;
          renderQuote(form);
        };
        probe.onerror = function () {
          // The usual case for a phone photo (HEIC) or a file whose name does not match its bytes.
          logoProblem('That does not look like an image this browser can show, so the quote was '
            + 'generated without it. Please try a PNG or JPG.');
          renderQuote(form);
        };
        probe.src = reader.result;
      };
      // ⚠️ SET BEFORE THE ASYNC BRANCH, NOT INSIDE IT. Both probe callbacks draw the document,
      // and attaching it on only one of them would mean a firm's chosen name appeared on a quote
      // with no logo and vanished on a quote with one -- the kind of difference nobody reproduces.
      if (carriedAgencyDisplay) form.brokerAgencyDisplay = carriedAgencyDisplay;
      reader.readAsDataURL(brokerLogoFile);
    } else {
      // ⭐ AN UPLOADED FILE WINS OVER THE CARRIED URL, and that order is deliberate: the broker
      // is standing at the form. If they took the trouble to attach a logo on this quote, that
      // is a more recent statement of intent than whatever their agency profile holds.
      // ⭐ THREE SOURCES, ONE ORDER, MOST-DELIBERATE FIRST: the file attached to THIS quote (handled
      // above), then the logo the BenefitLab dashboard handed over for THIS client, then the one
      // saved on the broker's ABY account. Each is a statement of intent; the narrower one wins.
      if (carriedBrokerLogoUrl) form.brokerLogoUrl = carriedBrokerLogoUrl;
      else if (accountLogoDataUrl) form.brokerLogoDataUrl = accountLogoDataUrl;
      if (carriedAgencyDisplay) form.brokerAgencyDisplay = carriedAgencyDisplay;
      renderQuote(form);
    }
  }

  /**
   * Say why the logo is missing, beside the field it came from.
   *
   * ⭐ NEXT TO THE INPUT, NOT AT THE TOP OF THE PAGE. The broker has just scrolled past this
   * control to press Generate; a banner somewhere else is a message about a field they can no
   * longer see. ⛔ And it is NOT an alert(): a modal dialog would interrupt a quote that
   * generated perfectly well, over decoration.
   * ⚠️ Called with '' to clear -- a stale complaint about a file that has since been replaced is
   * worse than none, because it makes the broker doubt a logo that is actually there.
   */
  function logoProblem(message) {
    var input = document.querySelector('[name="brokerLogo"]');
    if (!input) return;
    var box = document.getElementById('brokerLogoProblem');
    if (!box) {
      box = document.createElement('div');
      box.id = 'brokerLogoProblem';
      box.setAttribute('role', 'status');
      box.style.cssText = 'margin-top:6px;padding:7px 10px;border:1px solid #e0c98a;'
        + 'background:#fdf9ef;color:#7a5410;border-radius:5px;font-size:12.5px';
      (input.parentElement || input).appendChild(box);
    }
    box.textContent = message || '';
    box.style.display = message ? 'block' : 'none';
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

    // What this quote is worth, computed from the SAME results the document is rendered from, so
    // the stored figure and the printed one cannot disagree.
    // ⭐ FIRST YEAR: setup + documents + annual + twelve months of the monthly fee. Setup is a
    // one-off, so a recurring total would understate the sale; including it every year would
    // overstate everything after the first.
    // ⚠️ Published on `window` because save-hook.js is a separate script -- the same channel
    // `__abyClientId` and `__abyQuoteNumber` already use.
    try {
      var fyv = 0, heads = 0;
      results.forEach(function (r) {
        // ⭐ A SETUP FEE COUNTS ONLY WHERE A RENEWAL FEE FOLLOWS IT. Eric, 2026-08-18: "For HSA,
        // I would not include the setup fee in the calculation since there is no renewal fee."
        // ⛔ Written as HIS RULE rather than as `productId === 'hsa'`: he gave the reason, not just
        // the instance, so any future product with the same shape behaves the same way without
        // anybody remembering to add it to a list. Today it affects HSA alone (setup 125,
        // renewal 0); every other product with a setup has a renewal that matches it.
        var hasRenewal = !!(r.renewalFee && Number(r.renewalFee.amount) > 0);
        if (hasRenewal && r.setupFee && r.setupFee.amount) fyv += Number(r.setupFee.amount) || 0;
        if (r.docsFee && r.docsFee.amount)     fyv += Number(r.docsFee.amount) || 0;
        // ⭐ `annualFee` is NOT a year-two charge -- it is the ENTIRE price of the products that
        // have no setup at all (ERISA $425/$525, ACA $3,500-$4,750, POP docs-only $99), and Eric
        // confirmed it RECURS: "for ERISA it should be a per-year charge, not one-time."
        // ⛔ Excluding it would value an ACA quote at ZERO, which is the largest ticket in the book.
        if (r.annualFee && r.annualFee.amount) fyv += Number(r.annualFee.amount) || 0;
        if (r.monthlyFee && r.monthlyFee.amount) fyv += (Number(r.monthlyFee.amount) || 0) * 12;
        var c = r.count != null ? Number(r.count) : 0;
        if (c > heads) heads = c;
      });
      window.__abyQuoteValue = { firstYear: Math.round(fyv * 100) / 100, employees: heads || null };
    } catch (e) { window.__abyQuoteValue = null; }

    // THE PRICED OUTPUT, PUBLISHED FOR THE SAVE (F-368). Same channel as __abyQuoteValue above.
    //
    // WHY STORE THE OUTPUT AND NOT JUST THE INPUTS: a shared link RE-RUNS the engine, so it
    // prices at TODAY's rates while carrying the ORIGINAL quote number. For a quote from last
    // year that is a document which looks exactly like the one that was sent and is not.
    // And an ABY price adjustment is applied HERE, in the overlay's patched calculateAll, but is
    // deliberately never sent to a client -- so a re-run of a discounted quote shows the employer
    // MORE than they were quoted. Storing what was actually computed answers both.
    //
    // ⛔ THE ADJUSTMENT ITSELF STILL NEVER LEAVES THE SERVER. What is stored is the RESULT, which
    // is the same number already printed on the document the employer holds. A discount is not
    // recoverable from a price without knowing the list price, and the list price is not on the
    // page.
    try {
      window.__abyResolvedPricing = JSON.parse(JSON.stringify(results));
    } catch (e) { window.__abyResolvedPricing = null; }


    // 🔴 A SHARED PAGE GETS THE CLIENT RENDER, NOT THE INTERNAL ONE.
    // renderInternal sets includeWarnings, which emits a box headed "Internal notes (hidden in
    // print / client file)" -- and a shared link was showing it to the EMPLOYER on screen. It
    // carries lines like "No-commission rates not yet provided for this product, quote shows
    // commissioned rates as a placeholder", which is ABY talking to itself.
    // ⚠️ IT SURVIVED AN EXPOSURE AUDIT ON THE SAME DAY, because every sample quote used to check
    // the link had complete inputs and therefore no warnings, so the box rendered EMPTY. The
    // leak was in a branch no test input reached. A quote with no participant count reaches it.
    var forEmployer = !!window.__ABY_SHARED;
    var renderFn = forEmployer ? ABYQuote.renderer.renderForClient : ABYQuote.renderer.renderInternal;
    var html = renderFn(form, results, quoteNumber, {
      includeAuthorization: true,
      clientId: window.__abyClientId || '',
      employerEditableCounts: forEmployer,
    });

    outputEl.innerHTML =
      '<div class="output-toolbar no-print">' +
      '  <button type="button" class="primary" id="pdfBtn">Download PDF</button>' +
      '  <button type="button" class="secondary" id="htmlBtn">Download HTML</button>' +
      '  <button type="button" class="secondary" id="printBtn">Print</button>' +
      // ⭐ THE SHARE LINK, WHICH IS THE ONLY DOOR TO THE EMPLOYER-EDITABLE HEADCOUNT.
      // Hidden until the quote has been saved and we know its id; a button that cannot work is
      // worse than no button. Absent on a shared page, where the reader IS the employer.
      (forEmployer ? '' :
      '  <button type="button" class="secondary" id="shareBtn" hidden' +
      '          title="Creates a link you can send the employer. On that page they can correct' +
      ' the headcount and see the price update before they sign.">Copy share link</button>') +
      '</div>' +
      '<div class="quote">' + html + '</div>';

    if (typeof abyInitSignDate === 'function') abyInitSignDate();

    // The employer's count control only exists on a shared page, and only after this render.
    if (forEmployer) wireEmployerCounts(outputEl);

    var printBtn = document.getElementById('printBtn');
    if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

    var pdfBtn = document.getElementById('pdfBtn');
    if (pdfBtn) pdfBtn.addEventListener('click', function () { downloadQuoteAsPdf(form, quoteNumber); });

    var htmlBtn = document.getElementById('htmlBtn');
    if (htmlBtn) htmlBtn.addEventListener('click', function () { downloadQuoteAsHtml(form, quoteNumber); });

    wireShareButton();

    outputEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Mint and copy a link to this quote.
  //
  // ⚠️ THE SAVE IS ASYNCHRONOUS AND USUALLY LANDS AFTER THIS RENDER, so the button starts hidden
  // and appears when the id arrives. Showing it immediately and hoping would give a button that
  // fails for the first second on every quote -- which reads as broken, not as slow.
  function wireShareButton() {
    var btn = document.getElementById('shareBtn');
    if (!btn) return;

    function reveal(id) {
      if (!id) return;
      btn.hidden = false;
      btn.onclick = function () { copyShareLink(id, btn); };
      // ⭐ THE AUTHORIZATION FORM LEARNS THE QUOTE ID AT THE SAME MOMENT (F-416). The form is
      // drawn before the save returns, so its hidden field starts empty -- and a broker who
      // DOWNLOADS the document takes a copy of the form exactly as it stands. Filling it here is
      // what makes the DOWNLOADED copy carry the id; submitCommitment's own backfill runs in the
      // employer's browser and can never reach a file that was saved before it.
      var qf = document.getElementById('quoteIdField');
      if (qf && !qf.value) qf.value = String(id);
    }
    reveal(window.__abySavedQuoteId);
    document.addEventListener('aby:quote-saved', function (e) {
      reveal(e && e.detail && e.detail.id);
    });
  }

  async function copyShareLink(id, btn) {
    var original = btn.textContent;
    btn.textContent = 'Creating...';
    try {
      var r = await fetch('/api/quotes/' + id + '/share', { method: 'POST' });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        // ⛔ SAY WHY. The server refuses a link for a quote carrying a price adjustment, because
        // the link would re-price and show the employer a figure the document never gave. That is
        // a real answer and collapsing it into "something went wrong" sends somebody hunting a bug
        // that does not exist.
        btn.textContent = original;
        alert(d.message || 'Could not create a link for this quote.');
        return;
      }
      var url = d.url || (location.origin + '/q/' + d.token);
      var copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch (e) { copied = false; }
      btn.textContent = copied ? 'Link copied' : 'Link ready';
      if (!copied) prompt('Copy this link:', url);
      setTimeout(function () { btn.textContent = original; }, 2500);
    } catch (e) {
      btn.textContent = original;
      alert('Could not create a link for this quote.');
    }
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

  /**
   * Fill the broker's own details from their ABY account, for a broker who has one (F-6).
   *
   * ⭐⭐ THIS IS THE FEATURE ERIC ASKED FOR: "brokers who are using the ABY dashboard instead of
   * BenefitLab to upload their logo and input their contact info there once and have it carry to
   * the quote."
   *
   * 🔴 IT NEVER OVERWRITES A FIELD THAT ALREADY HAS A VALUE, AND THAT ORDERING IS THE WHOLE
   * DESIGN. `prePopulateFromRerun()` runs FIRST and carries what the BenefitLab dashboard handed
   * over. A broker who has BOTH an ABY account and a BenefitLab profile is a real case -- Eric
   * himself is one -- and the dashboard hand-off is the more specific answer, because it was
   * chosen for THIS client on THIS visit. ⛔ Filling from the account afterwards would silently
   * replace it with whatever is older.
   *
   * ⚠️ ASYNC AND UNAWAITED, DELIBERATELY. A broker with no account gets a 401 and nothing happens;
   * the form must never wait on a network call to become usable.
   */
  function prefillFromBrokerAccount() {
    fetch('/api/broker/me').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var b = d && d.broker;
      if (!b) return;
      var map = { brokerName: b.name, brokerAgency: b.agency, brokerPhone: b.phone, brokerEmail: b.email };
      Object.keys(map).forEach(function (key) {
        var el = formEl && formEl.querySelector('[name="' + key + '"]');
        if (el && !el.value && map[key]) el.value = map[key];
      });
      // The logo travels as a data URL the renderer already knows how to draw. Same rule: the
      // dashboard's logo, if one came over, wins.
      if (b.logoDataUrl && !carriedBrokerLogoUrl) accountLogoDataUrl = b.logoDataUrl;
    }).catch(function () { /* no account, or offline -- the form is unaffected */ });
  }

  // --- The employer's own headcount, at the signature line (F-367) -------------
  //
  // RE-PRICES AT THE RATE THEY WERE QUOTED, NOT THE STANDARD ONE. That is Eric's ruling: "if we
  // lower the per employee fee ... it would survive if they adjust the number of employees (as
  // long as it's in the same tier)". The stored pricing carries that rate, so a discounted quote
  // stays discounted when the number moves.
  //
  // ⛔ AND IT REFUSES TO PRICE A COUNT THAT LEAVES THE TIER. Eric's own words for that case are
  // "it will adjust based on our modified pricing for that tier" -- and the page cannot know
  // what ABY's modified pricing for a DIFFERENT tier is, because the adjustment deliberately
  // never leaves the server. Guessing would put a number on screen that ABY never set, which is
  // the one outcome worse than not answering. So it says the number changes and ABY will confirm.
  // ⚠️ THAT IS CONSERVATIVE FOR AN UNADJUSTED QUOTE TOO, where the public rate table would give
  // the right answer. Uniform on purpose: the alternative is telling the employer, implicitly,
  // whether their quote was discounted.
  function wireEmployerCounts(root) {
    var boxes = root.querySelectorAll('.emp-count');
    if (!boxes.length) return;

    // USE THE HOUSE FORMATTERS. Rolling a local one printed the agreed rate as "$2.7" and the
    // recomputed fee as "$210.6" -- the same defect fixed in the ABY overlay hours earlier, made
    // again three files away. utils already draws the distinction the document needs:
    // money() shows cents only when there are any, moneyExact() always shows two and its own
    // comment says it is "used for PPPM rates like $4.50".
    var money = ABYQuote.utils.money;
    var rateMoney = ABYQuote.utils.moneyExact;

    var pending = null;
    function record() {
      var counts = {};
      Array.prototype.forEach.call(boxes, function (b) {
        var v = Number(b.querySelector('.emp-count-input').value);
        if (Number.isFinite(v) && v >= 0 && v !== Number(b.dataset.quoted)) counts[b.dataset.product] = v;
      });
      if (!Object.keys(counts).length) return;
      var path = window.location.pathname.replace(/\/$/, '') + '/count';
      // Best effort and deliberately silent. Telling ABY is ruling 3, but a failure to record
      // must not sit on the employer's screen as an error about something that is not their
      // problem -- and the number rides with the authorization anyway when they sign.
      fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counts: counts }),
        keepalive: true,
      }).catch(function () {});
    }

    Array.prototype.forEach.call(boxes, function (box) {
      var input = box.querySelector('.emp-count-input');
      var out = box.querySelector('.emp-count-out');
      var quoted = Number(box.dataset.quoted);
      var rate = Number(box.dataset.rate);
      var min = Number(box.dataset.min) || 0;
      var kind = box.dataset.kind;
      var lo = box.dataset.lo === '' ? null : Number(box.dataset.lo);
      var hi = box.dataset.hi === '' ? null : Number(box.dataset.hi);
      var noun = box.dataset.noun;
      var productId = box.dataset.product;

      function update() {
        var n = Number(input.value);
        if (!Number.isFinite(n) || n < 0 || input.value === '') { out.textContent = ''; return; }
        if (n === quoted) { out.textContent = ''; return; }

        // IN THE SAME BAND? The bounds travel with the price (engine `_m.lo` / `_m.hi`), which
        // is the only way to know: the public rate table is split by STATE and by rate book,
        // and an agreed rate is in neither. An open-ended top band has hi === null.
        // ⛔ A quote priced before the bounds existed has neither, and defers to ABY rather
        // than guessing -- a missing bound must not read as "same band".
        var haveBand = (lo !== null && lo !== undefined);
        var sameTier = haveBand && n >= lo && (hi === null || hi === undefined || n <= hi);

        // Say BOTH numbers, always. The employer asserted one; ABY quoted the other; the page
        // never pretends the second did not happen.
        var both = 'You entered ' + n + ' ' + noun + '. ABY quoted ' + quoted + '.';

        if (!sameTier) {
          out.className = 'emp-count-out changed';
          out.textContent = both + ' This moves you outside the band this quote was priced in, so'
            + ' the monthly fee will change. ABY will confirm the figure -- submit below and they'
            + ' will be told.';
          record();
          return;
        }
        // A FLAT band charges the same figure across the whole band, so the fee does not move.
        // Saying so is better than silently showing an unchanged number, which reads as a
        // control that did nothing.
        if (kind === 'flat') {
          out.className = 'emp-count-out changed';
          out.textContent = both + ' That is still within the same band, so your monthly '
            + 'administration fee is unchanged at ' + money(rate) + ' per month.';
          record();
          return;
        }
        var monthly = Math.max(rate * n, min);
        monthly = Math.round(monthly * 100) / 100;
        out.className = 'emp-count-out changed';
        out.textContent = both + ' At the same rate of ' + rateMoney(rate) + ' per participant per month, your monthly administration fee would be ' + money(monthly) + '.'
          + (min > 0 && rate * n < min ? ' (The ' + money(min) + ' monthly minimum applies.)' : '');
        record();
      }

      input.addEventListener('input', function () {
        if (pending) clearTimeout(pending);
        pending = setTimeout(update, 400);
      });
      input.addEventListener('change', update);
    });

    // ── THE ELECTED-EXTRA QUANTITIES (additional EINs, state filing) ──────────────────────────
    //
    // Eric, 2026-08-26: it "needs to show up on the last page of the proposal where the employer
    // can change that number if needed."
    //
    // ⭐ ARITHMETIC ONLY, AND ON PURPOSE. Each line is quantity x a flat rate, so the answer is
    // multiplication -- unlike the participant count above, which has bands, minimums and a
    // priced range it can fall out of. Reaching for that machinery here would import a set of
    // failure modes these lines do not have.
    var rows = document.querySelectorAll('.elected-row');
    if (!rows.length) return;
    Array.prototype.forEach.call(rows, function (row) {
      var qty = row.querySelector('.elected-qty');
      var amt = row.querySelector('.elected-amount');
      if (!qty || !amt) return;
      qty.addEventListener('input', function () {
        var n = Number(qty.value);
        // ⛔ A BLANK OR NEGATIVE BOX SHOWS NOTHING RATHER THAN $0 OR NaN. Mid-typing an employer
        // has an empty field for a moment, and printing "$0" at them reads as a price.
        if (!Number.isFinite(n) || n < 0) { amt.textContent = ''; retotal(); return; }
        amt.textContent = money(n * Number(row.dataset.rate || 0));
        retotal();
      });
    });

    function retotal() {
      var wraps = document.querySelectorAll('.elected-extras');
      Array.prototype.forEach.call(wraps, function (w) {
        var sum = 0;
        Array.prototype.forEach.call(w.querySelectorAll('.elected-row'), function (r) {
          var n = Number(r.querySelector('.elected-qty').value);
          if (Number.isFinite(n) && n > 0) sum += n * Number(r.dataset.rate || 0);
        });
        var out = w.querySelector('.elected-total-amount');
        if (out) out.textContent = money(sum);
      });
    }
  }

  function prePopulateFromRerun() {
    var params = new URLSearchParams(window.location.search);
    var rerunParam = params.get('rerun');

    // A SHARED LINK RESOLVES SERVER-SIDE, so its state arrives on the page rather than in the
    // address bar. Eric, 2026-08-21: "is there any way ... these html quotes could be sent via
    // link? I think it would be more professional than sending an html attachment."
    // The reason it is not simply a longer ?rerun= URL: a short opaque token is the only shape
    // that lets the SERVER decide what a given reader may see. The encoded blob cannot, because
    // whoever holds the link holds the whole payload.
    var state = null;
    // ⭐⭐ WHICH BRANCH THE STATE CAME FROM IS A SECURITY FACT, NOT BOOKKEEPING. __ABY_SHARED is
    // written into the page by the SERVER for a valid share token; the rerun parameter is a URL
    // anyone can construct and send to anyone. A field that is safe from the first is not
    // necessarily safe from the second, so the source is RECORDED rather than inferred later.
    var fromServer = false;
    if (window.__ABY_SHARED && typeof window.__ABY_SHARED === 'object') {
      state = window.__ABY_SHARED;
      fromServer = true;
    } else {
      if (!rerunParam) return;
      try { state = JSON.parse(decodeURIComponent(rerunParam)); } catch (e) { return; }
    }
    if (!state) return;

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

    // ── THE FIRM'S OWN LOGO ON A SHARED QUOTE (F-428) ──────────────────────────────────────
    //
    // 🔴 Eric uploaded a logo for MMA - DFW and it never appeared when he clicked the share
    // link. One of the four reasons was that the shared payload carried no logo at all. The
    // server now resolves the firm -- by the quote's agency_id, or failing that by the firm's
    // NAME, because only 2 of the 6 shared quotes carry an id and his was not one of them.
    //
    // ⛔ SERVER BRANCH ONLY, AND THAT IS THE WHOLE POINT OF THE SEPARATE FIELD. brokerLogoUrl
    // above is guarded by a HOST allow-list because it arrives in a rerun link anyone can craft.
    // Adding a relative path to that allow-list would have opened the crafted-link path too.
    // This field is only ever written by the server, so it is only ever read from the server.
    //
    // ⚠️ THE SHAPE IS CHECKED AS WELL AS THE SOURCE. Belt and braces: a same-origin path to this
    // one endpoint and a uuid, so even a future change that let this field through from
    // elsewhere could not point an <img> at an arbitrary URL.
    if (fromServer && typeof state.agencyLogoPath === 'string'
        && /^\/api\/agency-logo\/[0-9a-fA-F-]{36}$/.test(state.agencyLogoPath)) {
      carriedBrokerLogoUrl = state.agencyLogoPath;
    }

    // ⭐ THE FIRM'S OWN PREFERRED NAME (F-429), on the same terms as the logo path above: server
    // only. ⛔ NOT applied to the brokerAgency input -- the input holds the name that gets SAVED,
    // and this is only ever the name that gets PRINTED.
    // ⚠️ Length-capped here as well as at the point it is set, because a value arriving over the
    // wire is not the same thing as a value this browser wrote.
    if (fromServer && typeof state.brokerAgencyDisplay === 'string'
        && state.brokerAgencyDisplay.trim() && state.brokerAgencyDisplay.length <= 120) {
      carriedAgencyDisplay = state.brokerAgencyDisplay.trim();
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
    // A shared link is read-only by its nature -- nobody browsing to somebody else's quote is
    // running a new one -- so the server says so on the page rather than in a query parameter
    // anybody could delete.
    var isReadOnly = new URLSearchParams(window.location.search).get('readonly') === '1'
                  || !!(window.__ABY_SHARED && window.__ABY_SHARED.readonly);

    // WHICH SHARED LINK THIS VISIT CAME FROM (F-347), from `?src=`.
    // 🔴 READ HERE, BESIDE `readonly`, AND FOR THE SAME REASON: prePopulateFromRerun() clears the
    // query string with history.replaceState, so anything read after it is already gone. Putting
    // this inside that function would not work either -- it returns early when there is no
    // `rerun` param, which is exactly the case a shared generic link is.
    // ⚠️ Sanitised and capped: it is broker-supplied text that reaches an admin screen and a
    // database, and a tag is a short label, not a payload.
    var srcParam = (new URLSearchParams(window.location.search).get('src') || '')
      .replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
    if (srcParam) window.__abySourceTag = srcParam;

    prePopulateFromRerun();
    prefillFromBrokerAccount();

    formEl.addEventListener('submit', generateQuote);
    var resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetForm);

    // View Quote mode: auto-generate without saving to the admin log.
    // save-hook.js sees window.__abyReadOnly = true and skips the POST.
    if (isReadOnly) {
      window.__abyReadOnly = true;
      setTimeout(generateQuote, 150);
    }

    // A SHARED LINK HAS A DIFFERENT READER, AND THAT IS NOT THE SAME THING AS READ-ONLY.
    // `readonly` exists for ABY looking at their own quote: it suppresses the duplicate save and
    // nothing else, because ABY WANTS to see the inputs that produced the figures.
    // An employer does not. Eric asked for a link because it is "more professional than sending
    // an html attachment" -- and landing on somebody else's quote-builder, with a Reset Form
    // button, is not that. So the shared page hides the form and the tool's own header, and
    // shows the proposal alone.
    // ⛔ HIDDEN, NOT REMOVED. generateQuote() reads its values out of these fields, and the
    // download and print handlers read them again afterwards. Removing the form would take the
    // quote with it.
    // RENDER THE PRICE THAT WAS QUOTED, NOT A FRESH ONE.
    //
    // The shared page otherwise re-runs the engine, which prices at TODAY's rates while carrying
    // the ORIGINAL quote number -- for a quote from last year that is a document which looks
    // exactly like the one that was sent and is not. It also loses any ABY price adjustment,
    // because the adjustment lives in the authenticated overlay and is deliberately never sent
    // to a client, so a discounted quote would show the employer MORE than they were quoted.
    //
    // Patching calculateAll is the same technique the ABY overlay uses, and for the same reason:
    // the figures have to reach every consumer -- the fee cards, the totals and the signature
    // line all call it separately.
    // ⚠️ Only when there is something to serve. A quote saved before this column existed has no
    // stored pricing, and those fall back to re-running, which is the behaviour that existed
    // before. ⛔ So a MISSING value degrades to the old behaviour rather than to a blank page.
    if (window.__ABY_SHARED && Array.isArray(window.__ABY_SHARED.resolvedPricing)
        && window.__ABY_SHARED.resolvedPricing.length) {
      var storedResults = window.__ABY_SHARED.resolvedPricing;
      ABYQuote.engine.calculateAll = function () {
        // A fresh deep copy each call: the renderer and the adjustment path both mutate what
        // they are handed, so returning the same objects twice would compound their edits.
        return JSON.parse(JSON.stringify(storedResults));
      };
    }

    if (window.__ABY_SHARED) {
      var hideWhenShared = ['#quoteForm', '.app-header'];
      hideWhenShared.forEach(function (sel) {
        var el = document.querySelector(sel);
        if (el) el.style.display = 'none';
      });
    }
  });
})();