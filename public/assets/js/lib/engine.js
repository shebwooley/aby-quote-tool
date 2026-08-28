// ABY Quote Tool — Pricing engine
// Pure functions. Takes selections + form data, returns structured pricing data.
// NO HTML, no DOM. The renderer turns this output into a quote.
//
// Output shape per product:
//   {
//     productId: 'fsa',
//     setupFee:    { amount: 125, label: 'Setup Fee' },          // or null
//     renewalFee:  { amount: 125, label: 'Annual Renewal Fee' }, // or null
//     monthlyFee:  { amount: 85,  label: 'Monthly Admin Fee', tierLabel: '<20 participants', breakdown: '...' }, // or null
//     annualFee:   { amount: 99,  label: 'Annual Fee' },         // or null (POP, ICHRA docs-only)
//     packageLabel:'POP Documents Only',                          // package products only
//     additionalFees: [ { label, amount, unit }, ... ],
//     notes: [ '...' ],
//     warnings: [ '...' ]   // e.g. "100+ tier rate not yet defined"
//   }

window.ABYQuote = window.ABYQuote || {};

ABYQuote.engine = (function () {

  // Pick the right rate set based on commission toggle.
  // Falls back to commissioned rates if a no-commission entry isn't defined yet.
  function getProductRates(productId, commissioned, state) {
    var root = ABYQuote.pricing;
    // Multi-state: rates live under a state key (e.g. TX). If no state layer is
    // present (older data), fall back to the root so nothing breaks.
    var pricing = root[state || 'TX'] || root;
    if (commissioned) {
      return { rates: pricing.commissioned[productId], usedFallback: false };
    }
    var ncRates = pricing.noCommission && pricing.noCommission[productId];
    if (ncRates) {
      return { rates: ncRates, usedFallback: false };
    }
    return { rates: pricing.commissioned[productId], usedFallback: true };
  }

  // WHAT A FLAT BOTTOM TIER COSTS THE READER, AND WHY THIS EXISTS (F-448).
  //
  // Niels, via Eric 2026-08-28: "if there are fewer participants than the minimum billing, it just
  // shows the $85 minimum without showing the PPPM... it should show the PPPM for the next tier up
  // and say it's $85 per month minimum billing."
  //
  // He is describing a FLAT tier, not a minimum. Every tiered product opens with one -- measured
  // 2026-08-28, all 24 product and rate-book combinations -- and a flat tier genuinely has no rate
  // to print, so the estimate said only "$85.00 per month" and stopped. Nothing was broken; it just
  // was not the sentence a broker needs, and it disagreed with ABY's own published rate sheet,
  // which prints the whole ladder (Under 20 flat, then 20-99 at $4.50).
  //
  // THE NUMBER TO PRINT IS THE BREAKEVEN, NOT THE TIER BOUNDARY, and they are not the same. The
  // per-participant tier can START below the point where it beats the minimum:
  //   TX HSA          tier starts 15, but 15 x $3.20 = $48 against a $50 minimum, so 16.
  //   Outside-TX HSA  tier starts 15, $100 minimum, so 32.
  // Printing the boundary would understate the crossover by seventeen people on that last one, in
  // the direction that makes ABY look cheaper than it is. Eric flagged this himself as "or however
  // the math works".
  function nextPppmTier(tiers, from) {
    for (var j = from + 1; j < tiers.length; j++) if (tiers[j].type === 'pppm') return tiers[j];
    return null;
  }
  // The first count at which rate x count actually EXCEEDS the minimum. Starts at the tier's own
  // floor, so it can never name a count that is priced in a lower band.
  function pppmBeatsMinAt(tier, startAt) {
    var min = tier.minMonthly || 0;
    var n = Math.max(1, startAt);
    // Bounded: the rate is always positive, so this terminates. The cap is paranoia, not need.
    for (var guard = 0; guard < 100000 && n * tier.amount <= min; guard++) n++;
    return n;
  }

  // Compute the monthly fee for tiered products given a participant/account/employee count.
  // Returns { amount, tierLabel, breakdown } or null if no count provided.
  function computeMonthly(monthlyTiers, count) {
    if (!monthlyTiers || monthlyTiers.length === 0) return null;
    if (count == null || count === '' || isNaN(count)) {
      // No count → show the lowest tier as a starting point
      var first = monthlyTiers[0];
      return {
        amount: first.type === 'flat' ? first.amount : (first.minMonthly || first.amount),
        tierLabel: first.label || '',
        breakdown: tierDescription(first, monthlyTiers, 0),
        countMissing: true,
        _m: { kind: first.type === 'flat' ? 'flat' : 'pppm', rate: first.amount, min: first.minMonthly || 0, count: null }
      };
    }

    count = Number(count);

    for (var i = 0; i < monthlyTiers.length; i++) {
      var tier = monthlyTiers[i];
      var max = tier.maxCount;
      // The bottom of this band is one past the previous band's cap. The first band starts at
      // zero. `max` of null means the band is open-ended at the top.
      var lo = (i === 0) ? 0 : ((monthlyTiers[i - 1].maxCount || 0) + 1);
      if (max == null || count <= max) {
        if (tier.type === 'flat') {
          return {
            amount: tier.amount,
            tierLabel: tier.label || '',
            breakdown: flatBreakdown(monthlyTiers, i, tier),
            count: count,
            // lo/hi are the BAND this count was priced in. F-367 needs them: an employer
            // changing the headcount on a shared quote may only be re-priced at the agreed
            // rate while they stay inside it, and the shared page has no way to work that out
            // otherwise -- the public rate table is split by STATE and by rate book, and the
            // adjusted rate is not in either. Carried here so the answer travels with the price.
            _m: { kind: 'flat', rate: tier.amount, min: 0, count: count, lo: lo, hi: max }
          };
        }
        // PPPM tier: rate × count, but not less than minMonthly
        var raw = tier.amount * count;
        var min = tier.minMonthly || 0;
        var monthly = Math.max(raw, min);
        var explanation = ABYQuote.utils.moneyExact(tier.amount) + ' per participant per month';
        if (min > 0) {
          explanation += ' (minimum ' + ABYQuote.utils.money(min) + '/month)';
        }
        return {
          amount: monthly,
          tierLabel: tier.label || '',
          breakdown: explanation,
          count: count,
          _m: { kind: 'pppm', rate: tier.amount, min: min, count: count, lo: lo, hi: max }
        };
      }
    }

    // Count exceeds all defined tiers → flag for follow-up
    var lastTier = monthlyTiers[monthlyTiers.length - 1];
    return {
      amount: lastTier.type === 'flat' ? lastTier.amount : (lastTier.amount * count),
      tierLabel: 'count exceeds defined tiers',
      breakdown: 'Pricing for ' + count + ' exceeds defined tiers — contact ABY for custom quote',
      tierExceeded: true
    };
  }

  // ONE SENTENCE, TWO CALLERS. The flat branch above and tierDescription below both print the
  // bottom band, and they must not drift into saying different things about the same money.
  function flatBreakdown(tiers, i, tier) {
    var flat = ABYQuote.utils.money(tier.amount) + ' per month minimum billing';
    var nxt = nextPppmTier(tiers, i);
    if (!nxt) return ABYQuote.utils.money(tier.amount) + ' per month';
    var at = pppmBeatsMinAt(nxt, (tier.maxCount || 0) + 1);
    // moneyExact, never money: a RATE is quoted to the cent, and money() prints $4.50 as $4.5,
    // which has been reported as a typo before.
    return flat + '. From ' + at + ' participants, ' +
      ABYQuote.utils.moneyExact(nxt.amount) + ' per participant per month.';
  }

  function tierDescription(tier, tiers, i) {
    if (tier.type === 'flat') {
      if (tiers && typeof i === 'number') return flatBreakdown(tiers, i, tier);
      return ABYQuote.utils.money(tier.amount) + ' per month';
    }
    var s = ABYQuote.utils.moneyExact(tier.amount) + ' per participant per month';
    if (tier.minMonthly) s += ' (min ' + ABYQuote.utils.money(tier.minMonthly) + ')';
    return s;
  }

  // -------------------------------------------------------------
  // Per-product calculation routers
  // -------------------------------------------------------------

  function calculatePackage(productId, rates, packageId) {
    var pkg = rates.packages[packageId];
    if (!pkg) return null;

    var result = {
      productId: productId,
      packageId: packageId,
      packageLabel: pkg.description || '',
      additionalFees: rates.additionalFees || [],
      notes: rates.notes ? rates.notes.slice() : [],
      warnings: []
    };

    if (pkg.setupFee != null && pkg.setupFee > 0) {
      result.setupFee = { amount: pkg.setupFee, label: 'Setup Fee' };
    }
    if (pkg.renewalFee != null) {
      result.renewalFee = { amount: pkg.renewalFee, label: 'Annual Renewal Fee' };
    }
    if (pkg.annualFee != null) {
      result.annualFee = { amount: pkg.annualFee, label: 'Annual Fee' };
    }
    // Note: commissionable: false flag still controls engine logic;
    // it is intentionally NOT surfaced on the quote — clients shouldn't see commission language.
    return result;
  }

  function calculateTiered(productId, rates, count) {
    var result = {
      productId: productId,
      additionalFees: rates.additionalFees || [],
      notes: rates.notes ? rates.notes.slice() : [],
      warnings: []
    };

    if (rates.setupFee != null && rates.setupFee > 0) {
      result.setupFee = { amount: rates.setupFee, label: 'Setup Fee' };
    }
    if (rates.docsFee != null) {
      // Most products bundle docs in setup ($0); only show if non-zero
      if (rates.docsFee > 0) {
        result.docsFee = { amount: rates.docsFee, label: 'Plan Document Fee' };
      }
    }
    if (rates.renewalFee != null) {
      result.renewalFee = { amount: rates.renewalFee, label: 'Annual Renewal Fee' };
    }

    var monthly = computeMonthly(rates.monthlyTiers, count);
    if (monthly) {
      monthly.label = 'Monthly Admin Fee';
      result.monthlyFee = monthly;
      if (monthly.countMissing) {
        result.warnings.push('No participant count provided — showing the lowest tier rate as a placeholder.');
      }
      if (monthly.tierExceeded) {
        result.warnings.push('Participant count exceeds the highest defined pricing tier — confirm with ABY.');
      }
    }

    return result;
  }

  /**
   * The extra answers a product declares (ACA: additional EINs, late filing, state filing).
   *
   * TWO JOBS, AND THE SECOND ONE IS THE GUARD.
   *   1. PRICE them: each extra with a `fee` and a positive count becomes a line on the quote.
   *   2. REFUSE a package the answers exclude. The form already removes those options, but the
   *      form is not the only caller -- a quote arriving through the admin re-run link is built
   *      from stored inputs and never touches that code. A rule enforced only in the browser is
   *      enforced only where somebody is looking.
   *
   * ⛔ IT REFUSES LOUDLY RATHER THAN SUBSTITUTING. Quietly upgrading Self Service to Full Service
   * would change the price of a quote by thousands without saying so, and the broker would send
   * it. The result carries a blocking error instead, so the quote cannot be produced at all.
   */
  function applyExtras(result, selection) {
    var product = null;
    var list = (window.ABYQuote && window.ABYQuote.products) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === selection.productId) { product = list[i]; break; }
    }
    if (!product || !product.extras) return;

    var given = selection.extras || {};

    var excluded = (product.excludeWhenAnyOf || []).some(function (id) {
      var v = given[id];
      return v === true || (typeof v === 'number' && v > 0);
    });
    if (excluded && (product.excludedPackages || []).indexOf(result.packageId) !== -1) {
      result.blocked = product.excludedReason ||
        'That package is not available with the answers given.';
      result.warnings.push(result.blocked);
      return;
    }

    // ⭐ THE LINES ARE BUILT FROM THE PRODUCT'S OWN DECLARATION, so the label on the quote, the
    // label on the elected page and the fee are one definition rather than three.
    var lines = [];
    product.extras.forEach(function (x) {
      if (!x.fee) return;                     // a checkbox that only gates: nothing to charge
      var qty = Number(given[x.id] || 0);
      if (!(qty > 0)) return;
      lines.push({
        id: x.id,
        label: x.label,
        electedLabel: x.electedLabel || x.label,
        qty: qty,
        rate: x.fee,
        unit: x.feeUnit || '',
        amount: x.fee * qty
      });
    });
    if (lines.length) {
      result.extraLines = lines;
      result.extrasTotal = lines.reduce(function (a, l) { return a + l.amount; }, 0);
    }
    // A gating answer with no fee still has to reach the quote, or the reason Self Service is
    // missing is invisible to the person reading it.
    if (given.priorYears) result.priorYears = true;
  }

  function calculatePackageWithCount(productId, rates, packageId, count) {
    var pkg = rates.packages[packageId];
    if (!pkg) return null;

    var result = {
      productId: productId,
      packageId: packageId,
      packageLabel: pkg.description || '',
      additionalFees: rates.additionalFees || [],
      notes: rates.notes ? rates.notes.slice() : [],
      warnings: []
    };

    if (pkg.setupFee != null && pkg.setupFee > 0) {
      result.setupFee = { amount: pkg.setupFee, label: 'Setup Fee' };
    }
    if (pkg.renewalFee != null) {
      result.renewalFee = { amount: pkg.renewalFee, label: 'Annual Renewal Fee' };
    }
    if (pkg.annualFee != null) {
      result.annualFee = { amount: pkg.annualFee, label: 'Annual Fee' };
    }

    if (pkg.monthlyTiers) {
      var monthly = computeMonthly(pkg.monthlyTiers, count);
      if (monthly) {
        monthly.label = 'Monthly Admin Fee';
        result.monthlyFee = monthly;
        if (monthly.countMissing) {
          result.warnings.push('No participant count provided — showing the lowest tier rate as a placeholder.');
        }
        if (monthly.tierExceeded) {
          result.warnings.push('Participant count exceeds the highest defined pricing tier — confirm with ABY.');
        }
      }
    }

    // Formula-based annual fee (e.g. ACA Small Group B: base + perForm × count)
    if (pkg.formula) {
      var n = (count == null || count === '' || isNaN(count)) ? 0 : Number(count);
      var fee = pkg.formula.base + (pkg.formula.perForm * n);
      result.annualFee = { amount: fee, label: 'Annual Fee', count: n };
      result.formulaBreakdown = ABYQuote.utils.money(pkg.formula.base) + ' base + ' +
                                ABYQuote.utils.money(pkg.formula.perForm) + ' per form × ' + n + ' forms';
      if (n === 0) {
        result.warnings.push('No form count provided — showing base fee only.');
      }
    }

    return result;
  }

  // -------------------------------------------------------------
  // Top-level: calculate pricing for a single selection
  // -------------------------------------------------------------

  function calculateProduct(selection, commissioned, state) {
    var rateLookup = getProductRates(selection.productId, commissioned, state);
    var rates = rateLookup.rates;
    if (!rates) return null;

    var result;

    switch (rates.type) {
      case 'package':
        result = calculatePackage(selection.productId, rates, selection.packageId);
        break;
      case 'tiered':
        result = calculateTiered(selection.productId, rates, selection.count);
        break;
      case 'package-with-count':
        result = calculatePackageWithCount(selection.productId, rates, selection.packageId, selection.count);
        break;
      default:
        return null;
    }

    if (result) applyExtras(result, selection);

    if (result && rateLookup.usedFallback) {
      result.warnings.unshift(
        'No-commission rates not yet provided for this product — quote shows commissioned rates as a placeholder.'
      );
    }

    return result;
  }

  // Calculate all selected products. Returns an array of results.
  function calculateAll(selections, commissioned, state) {
    var results = [];
    for (var i = 0; i < selections.length; i++) {
      var r = calculateProduct(selections[i], commissioned, state);
      if (r) results.push(r);
    }
    return results;
  }

  // Core fixed fees that a flat-dollar or percent override applies to.
  var FIXED = ['setupFee', 'renewalFee', 'annualFee', 'docsFee'];

  function scaleAmount(amount, adj) {
    var out = adj.mode === 'percent' ? amount * (1 + (adj.amount / 100)) : amount + adj.amount;
    if (out < 0) out = 0;
    return Math.round(out * 100) / 100;
  }
  function scaleRate(rate, adj) {
    // percent-only path (flat never touches per-participant rates)
    var out = rate * (1 + (adj.amount / 100));
    if (out < 0) out = 0;
    return Math.round(out * 10000) / 10000;
  }

  function applyAdjustment(results, adjustment) {
    if (!adjustment || !adjustment.amount) return results;
    var adj = {
      mode: adjustment.mode === 'flat' ? 'flat' : 'percent',
      amount: Number(adjustment.amount) || 0,
      scope: adjustment.scope || 'all'
    };
    if (!adj.amount) return results;
    var money = ABYQuote.utils.money, moneyExact = ABYQuote.utils.moneyExact;

    return results.map(function (r) {
      if (adj.scope !== 'all' && adj.scope !== r.productId) return r;
      var copy = JSON.parse(JSON.stringify(r));

      FIXED.forEach(function (key) {
        var fee = copy[key];
        if (fee && typeof fee.amount === 'number') { fee.amount = scaleAmount(fee.amount, adj); fee.adjusted = true; }
      });

      // Monthly: only percent overrides adjust the per-participant/flat rate, and
      // we rebuild the breakdown so the printed rate always matches the amount.
      var m = copy.monthlyFee;
      if (m && m._m && !m.tierExceeded && adj.mode === 'percent') {
        var meta = m._m;
        if (meta.kind === 'flat') {
          meta.rate = scaleAmount(meta.rate, adj);
          m.amount = meta.rate;
          m.breakdown = money(meta.rate) + ' per month';
        } else {
          meta.rate = scaleRate(meta.rate, adj);
          meta.min  = scaleAmount(meta.min || 0, adj);
          var amt = meta.count ? Math.max(meta.rate * meta.count, meta.min) : (meta.min || meta.rate);
          m.amount = Math.round(amt * 100) / 100;
          var bd = moneyExact(meta.rate) + ' per participant per month';
          if (meta.min > 0) bd += ' (minimum ' + money(meta.min) + '/month)';
          m.breakdown = bd;
        }
        m.adjusted = true;
      }

      copy.adjusted = true;
      return copy;
    });
  }

  function describeAdjustment(adjustment) {
    if (!adjustment || !adjustment.amount) return '';
    var a = Number(adjustment.amount);
    var scope = (!adjustment.scope || adjustment.scope === 'all') ? 'all products' : adjustment.scope;
    if (adjustment.mode === 'flat') {
      return (a >= 0 ? '+$' + a : '-$' + Math.abs(a)) + ' flat on ' + scope + ' (fixed fees only)';
    }
    return (a >= 0 ? '+' + a + '%' : a + '%') + ' on ' + scope;
  }

  return {
    calculateProduct: calculateProduct,
    calculateAll: calculateAll,
    applyAdjustment: applyAdjustment,
    describeAdjustment: describeAdjustment
  };
})();
