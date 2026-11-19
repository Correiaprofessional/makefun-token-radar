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

  // Five category tones plus a sixth for wrapped, staked or bridged products (the model's penalty).
  var TONES = ['#2ee6a8', '#6ad7ff', '#ffb454', '#b18cff', '#ff8fa3', '#ff6b6b'];
  var TONE_NAMES = ['Trading', 'Credit', 'Yield', 'Assets', 'Other', 'Wrapped / staked / bridged'];
  var TONE_OF = {
    Dexs: 0, Derivatives: 0, 'Prediction Market': 0, Chain: 0, 'Basis Trading': 0, 'Liquidity Manager': 0,
    Lending: 1, CDP: 1, 'Collateral Markets': 1, 'Uncollateralized Lending': 1, 'Leveraged Farming': 1, CeDeFi: 1,
    Yield: 2, 'Yield Aggregator': 2, Farm: 2, 'Governance Incentives': 2, Indexes: 2,
    RWA: 3, 'Onchain Capital Allocator': 3, 'Risk Curators': 3, 'Dual-Token Stablecoin': 3, 'Anchor BTC': 3, 'Decentralized BTC': 3
  };
  var PENALISED = ['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaking', 'Stablecoin Wrapper'];

  // Tone index 0-5 for a board row: 5 when the model penalises it, otherwise by category group.
  function toneOf(row) {
    if (PENALISED.indexOf(row.category) >= 0 || /wrapped|staked|staking/i.test(row.name || '')) return 5;
    var t = TONE_OF[row.category];
    return t === undefined ? 4 : t;
  }

  window.RADAR_FORMAT = {
    toneOf: toneOf,
    TONES: TONES,
    TONE_NAMES: TONE_NAMES,
    formatUsd: formatUsd,
    formatPercent: formatPercent,
    pluralise: pluralise,
    describeChainCount: describeChainCount
  };
})();
