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
      // Skip multi-package sub-checkboxes (e.g. individual ERISA package options).
      // These have data-product-input with 3 colon-separated parts like "erisa:package:basic".
      // They are collected below via the item scan, not as top-level product selections.
      const pi = (cb.dataset && cb.dataset.productInput) ? cb.dataset.productInput : '';
      if (pi && pi.split(':').length >= 3) return;

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
        // Collect checked multi-package sub-checkboxes (e.g. ERISA packages selected for quoting)
        const checkedPkgIds = [];
        item.querySelectorAll('input[type="checkbox"][data-product-input]:checked').forEach(function(pcb) {
          const parts = (pcb.dataset.productInput || '').split(':');
          if (parts.length === 3 && parts[1] === 'package') checkedPkgIds.push(parts[2]);
        });
        if (checkedPkgIds.length > 0) inputs.packageIds = checkedPkgIds.join(',');
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
      products: collectProducts(),
    };

    try {
      await fetch('/api/quotes', {
        method:    'POST',
        headers:   { 'Content-Type': 'application/json' },
        body:      JSON.stringify(payload),
        keepalive: true,   // lets the request finish even if the page is closing
      });
    } catch (_) {
      // Silently swallow — a failed save should never affect the broker's workflow
    }
  }

  function init() {
    const output = document.getElementById('quoteOutput');
    if (!output) return;

    let lastSavedNum = null;

    const observer = new MutationObserver(function() {
      const text = output.textContent || '';
      if (!text.trim()) return;

      const match = text.match(QUOTE_NUM_RE);
      if (!match) return;

      const qNum = match[1];
      if (qNum === lastSavedNum) return;   // don't double-save the same quote
      lastSavedNum = qNum;

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
