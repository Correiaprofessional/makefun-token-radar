// Small display helpers for the dashboard. Plain JavaScript, no imports; exposed as window.RADAR_FORMAT.
(function () {
  'use strict';

  function isNum(n) {
    return typeof n === 'number' && isFinite(n);
  }

  // Dollar amount with K/M/B suffix and one decimal, e.g. 1530000 -> "$1.5M". Missing values give "n/a".
  function formatUsd(n) {
    if (!isNum(n)) return 'n/a';
    var a = Math.abs(n);
    var sign = n < 0 ? '-' : '';
    if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return sign + '$' + (a / 1e3).toFixed(1) + 'K';
    return sign + '$' + Math.round(a);
  }

  // Signed percentage with two decimals, e.g. 3.456 -> "+3.46%". null or non-finite gives an em dash.
  function formatPercent(n) {
    if (!isNum(n)) return '\u2014';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }

  // Picks the singular form for exactly 1, otherwise the plural (default: singular + "s").
  function pluralise(count, singular, plural) {
    return count === 1 ? singular : (plural || singular + 's');
  }

  // "1 chain" / "3 chains"; a missing or zero count reads "no chains listed".
  function describeChainCount(n) {
    if (!isNum(n) || n <= 0) return 'no chains listed';
    return n + ' ' + pluralise(n, 'chain');
  }

  window.RADAR_FORMAT = {
    formatUsd: formatUsd,
    formatPercent: formatPercent,
    pluralise: pluralise,
    describeChainCount: describeChainCount
  };
})();
