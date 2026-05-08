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
  function getProductRates(productId, commissioned) {
    var pricing = ABYQuote.pricing;
    if (commissioned) {
      return { rates: pricing.commissioned[productId], usedFallback: false };
    }
    var ncRates = pricing.noCommission && pricing.noCommission[productId];
    if (ncRates) {
      return { rates: ncRates, usedFallback: false };
    }
    return { rates: pricing.commissioned[productId], usedFallback: true };
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
        breakdown: tierDescription(first),
        countMissing: true
      };
    }

    count = Number(count);

    for (var i = 0; i < monthlyTiers.length; i++) {
      var tier = monthlyTiers[i];
      var max = tier.maxCount;
      if (max == null || count <= max) {
        if (tier.type === 'flat') {
          return {
            amount: tier.amount,
            tierLabel: tier.label || '',
            breakdown: ABYQuote.utils.money(tier.amount) + ' per month',
            count: count
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
          count: count
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

  function tierDescription(tier) {
    if (tier.type === 'flat') {
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

  function calculateProduct(selection, commissioned) {
    var rateLookup = getProductRates(selection.productId, commissioned);
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

    if (result && rateLookup.usedFallback) {
      result.warnings.unshift(
        'No-commission rates not yet provided for this product — quote shows commissioned rates as a placeholder.'
      );
    }

    return result;
  }

  // Calculate all selected products. Returns an array of results.
  function calculateAll(selections, commissioned) {
    var results = [];
    for (var i = 0; i < selections.length; i++) {
      var r = calculateProduct(selections[i], commissioned);
      if (r) results.push(r);
    }
    return results;
  }

  return {
    calculateProduct: calculateProduct,
    calculateAll: calculateAll
  };
})();
