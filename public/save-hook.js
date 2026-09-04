/**
 * save-hook.js — ABY Quote Tool backend integration
 *
 * Observes #quoteOutput for new quote renders, then silently POSTs the
 * quote data to /api/quotes. Never interrupts or slows down the broker.
 *
 * Add ONE line to index.html, after all other <script> tags:
 *   <script src="save-hook.js"></script>
 */
(function () {
  'use strict';

  // Quote numbers look like: TX260508-1234-C  or  TX260508-1234-NC
  const QUOTE_NUM_RE = /\b([A-Z]{2}\d{6}-\d{4}-N?C)\b/;

  /**
   * Which quote number are we saving?
   *
   * 🔴 THE DOM IS A RENDERING TARGET, NOT A DATA SOURCE. This used to read the number by
   * regexing the rendered page, which worked -- and meant a change to the renderer's markup
   * could stop EVERY quote from saving, with no error anywhere, because this file swallows
   * failures by design so the broker's workflow is never interrupted. It would have been
   * invisible until the day somebody asked where a week of quotes went. The renderer is also
   * exactly the file Change B rewrites.
   *
   * app.js now publishes the number it minted on `window.__abyQuoteNumber` before it writes
   * the output, so the code that MINTS the number hands it to the code that SAVES it.
   *
   * ⭐ THE SCRAPE IS KEPT AS A FALLBACK ON PURPOSE, and it is not belt-and-braces for its own
   * sake: these two files ship together but a saved/older page, or any render path that does
   * not go through app.js, would otherwise stop saving entirely. A fallback that is WORSE but
   * WORKING beats a hard dependency between two files deployed by hand.
   * ⚠️ The published value is validated against the same shape, so a stale or malformed
   * global cannot poison the record -- it just falls through to the scrape.
   */
  function resolveQuoteNumber(renderedText) {
    const published = window.__abyQuoteNumber;
    if (typeof published === 'string' && QUOTE_NUM_RE.test(published)) return published;
    const match = (renderedText || '').match(QUOTE_NUM_RE);
    return match ? match[1] : null;
  }

  function getFormValues() {
    const form = document.getElementById('quoteForm');
    if (!form) return {};
    const fd = new FormData(form);
    return {
      clientName:        fd.get('clientName')    || '',
      effectiveDate:     fd.get('effectiveDate') || '',
      brokerName:        fd.get('brokerName')    || '',
      brokerAgency:      fd.get('brokerAgency')  || '',
      brokerPhone:       fd.get('brokerPhone')   || '',
      brokerEmail:       fd.get('brokerEmail')   || '',
      repName:           (document.getElementById('repName')  || {}).value || fd.get('repName')  || '',
      repPhone:          (document.getElementById('repPhone') || {}).value || fd.get('repPhone') || '',
      repEmail:          (document.getElementById('repEmail') || {}).value || fd.get('repEmail') || '',
      commissionIncluded: !!(document.getElementById('commissionIncluded') || {}).checked,
    };
  }

  function collectProducts() {
    const products = [];
    // Covers checkboxes inside .product-item or any child of #productList
    const checked = document.querySelectorAll(
      '#productList input[type="checkbox"]:checked, .product-list input[type="checkbox"]:checked'
    );

    // Build a display-name → id lookup from the product registry (loaded before this script)
    const nameToId = {};
    if (window.ABYQuote && Array.isArray(window.ABYQuote.products)) {
      window.ABYQuote.products.forEach(function(p) { nameToId[p.name] = p.id; });
    }

    checked.forEach(function(cb) {
      // Skip every SUB-control. A checkbox inside the product list is either the product's own
      // selector or one of its answers, and only the first is a product.
      //
      // 🔴 THIS USED TO TEST FOR THREE COLON-SEPARATED PARTS ("erisa:package:basic") AND THAT
      // WAS A TEST ABOUT THE CONTROLS THAT EXISTED WHEN IT WAS WRITTEN, not about what a
      // product is. ACA's "Full Service only" switch is `aca:fullOnly` -- two parts -- so under
      // the old rule ticking it added a SECOND, bogus product row to the saved quote, named
      // after whatever label the container happened to hold. The right question is not how many
      // colons a control has; it is whether it carries `data-product-checkbox`.
      const pi = (cb.dataset && cb.dataset.productInput) ? cb.dataset.productInput : '';
      if (pi && !(cb.dataset && cb.dataset.productCheckbox)) return;

      // Walk up to the product container (.product-row wraps both the checkbox head
      // and the options panel; must not stop at .product-row-head which is a child)
      const item = cb.closest('.product-row') || cb.closest('.product-item') || cb.parentElement;

      // Name: try a heading, a label sibling, or fall back to the input name/id
      const nameEl = item && item.querySelector('h3,h4,.product-name,[class*="name"],legend,label');
      const name   = (nameEl && nameEl.textContent.trim()) || cb.getAttribute('aria-label') || cb.name || cb.id || '';

      // Collect any numeric/select sub-inputs (participant counts, package selects, etc.)
      const inputs = {};
      if (item) {
        // Named inputs (participant count number fields that have a name attr)
        item.querySelectorAll('input:not([type="checkbox"]):not([type="file"]), select').forEach(function(el) {
          if (el.name && el.value) inputs[el.name] = el.value;
        });
        // Capture package selects identified by data-product-input (no name attr, e.g. POP)
        item.querySelectorAll('select[data-product-input]').forEach(function(sel) {
          const parts = (sel.dataset.productInput || '').split(':');
          if (parts.length === 2 && parts[1] === 'package' && sel.value) {
            inputs.package = sel.value;
          }
        });
        // Capture participant/account/form count inputs (FSA, HSA, HRA, COBRA, etc.)
        item.querySelectorAll('input[data-product-input]').forEach(function(inp) {
          const parts = (inp.dataset.productInput || '').split(':');
          if (parts.length === 2 && parts[1] === 'count' && inp.value) {
            inputs.count = inp.value;
          }
        });
        // Collect checked multi-package sub-checkboxes (ERISA and POP packages to quote)
        const checkedPkgIds = [];
        item.querySelectorAll('input[type="checkbox"][data-product-input]:checked').forEach(function(pcb) {
          const parts = (pcb.dataset.productInput || '').split(':');
          if (parts.length === 3 && parts[1] === 'package') checkedPkgIds.push(parts[2]);
        });
        if (checkedPkgIds.length > 0) inputs.packageIds = checkedPkgIds.join(',');

        // A BAND PRODUCT (ACA) HAS NO PACKAGE CHECKBOXES -- it works out its package ids from a
        // form-count band and a service-level switch, and writes them into a hidden field.
        // Reading that field keeps this function a scraper: the arithmetic has exactly one home,
        // in `bandPackageIds`, and this side never learns what a band is.
        // ⛔ It must not overwrite a real checkbox answer, hence the guard -- one product cannot
        // have both, but a future one having both must not silently lose the ticked boxes.
        if (!inputs.packageIds) {
          item.querySelectorAll('input[type="hidden"][data-product-input]').forEach(function(hid) {
            const parts = (hid.dataset.productInput || '').split(':');
            if (parts.length === 2 && parts[1] === 'packageIds' && hid.value) {
              inputs.packageIds = hid.value;
            }
          });
        }
      }

      // Use data-product-checkbox attr first (gives clean IDs like 'pop', 'erisa'),
      // then fall back to name/id attr, registry lookup, or display name
      const id = cb.dataset.productCheckbox || cb.name || nameToId[name] || name;
      products.push({ id, name, inputs });
    });
    return products;
  }

  async function saveQuote(quoteNumber) {
    const payload = {
      ...getFormValues(),
      quoteNumber,
      // The BenefitLab client id, set by app.js when the tool was opened from the broker
      // dashboard. Sent from day one so quotes start carrying it; the worker ignores an
      // unknown field until the `client_id` column and the INSERT are in place, so this is
      // harmless on its own (handleSaveQuote destructures known keys only).
      clientId: window.__abyClientId || '',
      // WHICH SHARED LINK THIS CAME FROM (F-347). Set by app.js from `?src=` on the URL.
      // ⚠️ Eric was told its one cost when he approved it ("Not sure yet, build it anyway, it's
      // cheap"): a tag lives in a URL, and a URL gets copied, so a broker who forwards their link
      // to another broker attributes that second broker's quotes to the first tag. It is a HINT
      // about where a link travelled, never an identity -- `ran_by` and `client_id` are the fields
      // that mean something, and both are decided server-side or handed over deliberately.
      sourceTag: window.__abySourceTag || '',
      // What the quote is worth, published by app.js after the engine has run (see
      // `__abyQuoteValue`). Sent from day one; the worker ignores unknown keys.
      firstYearValue: (window.__abyQuoteValue && window.__abyQuoteValue.firstYear) || null,
      employeeCount:  (window.__abyQuoteValue && window.__abyQuoteValue.employees) || null,
      // The PRICED OUTPUT, so a shared link can show what was actually quoted rather than
      // re-running the engine at today's rates. Published by app.js beside __abyQuoteValue.
      // Sent from day one; the worker ignores unknown keys until the column exists.
      resolvedPricing: window.__abyResolvedPricing || null,
      products: collectProducts(),
    };

    try {
      const res = await fetch('/api/quotes', {
        method:    'POST',
        headers:   { 'Content-Type': 'application/json' },
        body:      JSON.stringify(payload),
        keepalive: true,   // lets the request finish even if the page is closing
      });
      // ⭐ KEEP THE ID. The response has always carried {id, quoteNumber, revision} and this hook
      // has always discarded it -- which is why the quote page could not offer a share link: a
      // link needs the row's id and nothing on the page knew it.
      // ⛔ STILL FIRE-AND-FORGET IN SPIRIT: if the read fails, or the save failed, the id simply
      // stays null and the share button does not appear. Nothing here can interrupt the broker.
      const saved = await res.json().catch(function () { return null; });
      if (saved && saved.id) {
        window.__abySavedQuoteId = saved.id;
        document.dispatchEvent(new CustomEvent('aby:quote-saved', { detail: { id: saved.id } }));
      }
    } catch (_) {
      // Silently swallow — a failed save should never affect the broker's workflow
    }
  }

  function init() {
    const output = document.getElementById('quoteOutput');
    if (!output) return;

    let lastSavedKey = null;

    /**
     * WHAT WAS ACTUALLY QUOTED, not merely WHICH quote it is.
     *
     * THE BUG THIS FIXES (Eric, 2026-08-31, and it cost him an afternoon): the guard below
     * compared the quote NUMBER alone. A re-run keeps its number deliberately, so the SECOND and
     * every later generate on one page load was silently skipped. He accidentally quoted
     * out-of-state, changed it back to TX and re-quoted several times, watched the screen show the
     * right price each time -- and the link the broker held went on serving the first, wrong one,
     * because nothing after the first generate was ever saved.
     *
     * His words: "If I click view quote from the dashboard, it shows the right price. But if I
     * open it from the link that was sent to the broker, it is still opening and showing $100 per
     * month." Two different sources: the dashboard RE-RUNS the engine, the link renders what was
     * STORED. Only the stored copy was stale.
     *
     * SO THE KEY IS THE NUMBER PLUS THE INPUTS. Same number and same inputs is the observer firing
     * twice on one render, which is the only thing this guard was ever for. Same number and
     * DIFFERENT inputs is a genuine re-price, and it must save.
     *
     * ABY_STATE AND ABY_ADJUSTMENT ARE READ HERE ON PURPOSE, EVEN THOUGH THIS FILE DOES NOT SEND
     * THEM. The overlay attaches both by patching fetch AFTER this payload is built, so a
     * fingerprint taken from the payload alone cannot see a STATE change -- which is exactly the
     * change that went missing. Both are undefined on the public page, where they are constant and
     * cost nothing.
     */
    function quoteKey(qNum) {
      var extra = '';
      try {
        // ABY_NEW_VERSION belongs here for the SAME reason as the other two, and leaving it
        // out would have re-created the bug this key was written to fix: ticking 'save as a
        // new version' without changing anything else produces identical inputs, so the
        // save would have been suppressed and the version never created.
        extra = JSON.stringify([window.ABY_STATE || '', window.ABY_ADJUSTMENT || null,
                                !!window.ABY_NEW_VERSION]);
      } catch (e) { extra = ''; }
      try {
        return qNum + '|' + JSON.stringify(getFormValues())
             + '|' + JSON.stringify(collectProducts())
             + '|' + JSON.stringify(window.__abyResolvedPricing || null)
             + '|' + extra;
      } catch (e) {
        // Fall back to saving rather than not saving: a missed save is the defect being fixed.
        return qNum + '|' + Date.now();
      }
    }

    const observer = new MutationObserver(function() {
      const text = output.textContent || '';
      if (!text.trim()) return;

      // The observer still TRIGGERS on the render -- that part the DOM is the right source
      // for, because "a quote just appeared" is genuinely a fact about the page. Only the
      // NUMBER now comes from the code that minted it.
      const qNum = resolveQuoteNumber(text);
      if (!qNum) return;

      // Don't double-save the same quote priced the same way. A RE-PRICE saves.
      const key = quoteKey(qNum);
      if (key === lastSavedKey) return;
      lastSavedKey = key;

      // View-only mode (opened via admin "View Quote"): skip this save,
      // then clear the flag so any subsequent manual generate does save normally.
      if (window.__abyReadOnly) {
        window.__abyReadOnly = false;
        return;
      }

      saveQuote(qNum);
    });

    observer.observe(output, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
