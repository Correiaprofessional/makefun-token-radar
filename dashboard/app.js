// Token Radar's plain dashboard. It reads window.RADAR (data.js, written by main.ts) and renders a
// searchable, filterable board, a detail panel with the full farm plan, and the model's constants.
// No network and no imports: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var root = document.getElementById('board');
  if (!root) return;
  if (!DATA || !Array.isArray(DATA.rows)) {
    root.textContent = 'The board data (data.js) is missing.';
    root.removeAttribute('aria-busy');
    return;
  }
  var rows = DATA.rows;
  var M = DATA.model;
  var SVG_NS = 'http:' + '//www.w3.org/2000/svg';
  var state = { q: '', category: 'all', sort: 'rank', selected: null };

  var SORTS = {
    rank: { label: 'Rank', cmp: function (a, b) { return a.rank - b.rank; } },
    tvl: { label: 'TVL', cmp: function (a, b) { return (b.tvl_usd || 0) - (a.tvl_usd || 0) || a.rank - b.rank; } },
    change: { label: '7-day change', cmp: function (a, b) { return (b.change_7d === null ? -Infinity : b.change_7d) - (a.change_7d === null ? -Infinity : a.change_7d) || a.rank - b.rank; } },
    implied: { label: 'Implied value', cmp: function (a, b) { return (b.implied_value_usd || 0) - (a.implied_value_usd || 0) || a.rank - b.rank; } }
  };

  var F = window.RADAR_FORMAT;
  if (!F) {
    root.textContent = 'The dashboard helpers (format.js) are missing.';
    root.removeAttribute('aria-busy');
    return;
  }
  var fmtUsd = F.formatUsd;
  var fmtPct = F.formatPercent;
  function pctClass(n) {
    return n === null || n === undefined ? 'num' : n < 0 ? 'num neg' : 'num pos';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function svg(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.setAttribute('class', v);
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  var categories = [];
  rows.forEach(function (r) {
    var c = r.category || 'Uncategorised';
    if (categories.indexOf(c) < 0) categories.push(c);
  });
  categories.sort();

  function matches(r) {
    if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
    var q = state.q.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().indexOf(q) >= 0 || r.slug.toLowerCase().indexOf(q) >= 0;
  }

  var searchInput = el('input', { id: 'q', type: 'search', placeholder: 'Name or slug', autocomplete: 'off', oninput: function (e) { state.q = e.target.value; renderRows(); } });
  var categorySelect = el('select', { id: 'category', onchange: function (e) { state.category = e.target.value; renderRows(); } });
  categorySelect.appendChild(el('option', { value: 'all', text: 'All categories' }));
  categories.forEach(function (c) { categorySelect.appendChild(el('option', { value: c, text: c })); });
  var sortSelect = el('select', { id: 'sort', onchange: function (e) { state.sort = e.target.value; renderRows(); } });
  Object.keys(SORTS).forEach(function (k) { sortSelect.appendChild(el('option', { value: k, text: SORTS[k].label })); });
  var countLine = el('p', { class: 'count', role: 'status', 'aria-live': 'polite' });
  var tbody = el('tbody');
  var detail = el('aside', { class: 'detail', id: 'detail', hidden: '', 'aria-label': 'Protocol detail' });

  function renderRows() {
    var shown = rows.filter(matches).sort(SORTS[state.sort].cmp);
    tbody.textContent = '';
    shown.forEach(function (r) {
      var tr = el('tr', { tabindex: '0', 'data-slug': r.slug, 'data-selected': state.selected === r.slug ? 'true' : 'false', 'aria-label': 'Open details for ' + r.name },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { text: r.category || 'Uncategorised' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: pctClass(r.change_7d), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.implied_value_usd) }));
      tr.addEventListener('click', function () { openDetail(r.slug); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); }
      });
      tbody.appendChild(tr);
    });
    if (shown.length === 0) {
      tbody.appendChild(el('tr', null, el('td', { colspan: '6', class: 'sub', text: 'No rows match this search.' })));
    }
    countLine.textContent = 'Showing ' + shown.length + ' of ' + rows.length + ' ' + F.pluralise(rows.length, 'row');
    drawBars(shown);
  }

  function openDetail(slug) {
    var r = rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    state.selected = slug;
    detail.textContent = '';
    var closeBtn = el('button', { class: 'close', type: 'button', 'aria-label': 'Close detail', text: 'Close', onclick: closeDetail });
    var stats = el('div', { class: 'equation' });
    [
      ['TVL', fmtUsd(r.tvl_usd)],
      ['7-day change', fmtPct(r.change_7d)],
      ['Implied value', fmtUsd(r.implied_value_usd)],
      ['Category', r.category || 'Uncategorised'],
      ['Chain count', F.describeChainCount(r.chains ? r.chains.length : 0)],
      ['Chains', r.chains && r.chains.length ? r.chains.join(', ') : 'n/a']
    ].forEach(function (p) { stats.appendChild(el('div', null, el('span', { text: p[0] }), el('b', { text: p[1] }))); });
    var steps = el('ol', { class: 'steps' });
    (r.farm_steps || []).forEach(function (s) { steps.appendChild(el('li', { text: s })); });
    detail.appendChild(el('div', { class: 'detail-head' },
      el('div', null, el('h2', { text: r.name }), el('p', { class: 'sub', text: r.slug + ' · ' + (r.category || 'Uncategorised') + ' · rank ' + r.rank })),
      closeBtn));
    detail.appendChild(el('div', { class: 'detail-section' }, stats));
    detail.appendChild(el('div', { class: 'detail-section' },
      el('h3', { text: 'Farm steps' }),
      el('p', { class: 'sub', text: 'Research steps, not advice. No reward, price or allocation is promised; any deposit is optional and can lose money.' }),
      steps));
    detail.hidden = false;
    closeBtn.focus();
    renderRows();
  }
  function closeDetail() {
    state.selected = null;
    detail.hidden = true;
    renderRows();
  }
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !detail.hidden) closeDetail(); });

  function methodology() {
    var items = [
      ['base_multiple', M.base_multiple, 'implied value starts at TVL times this'],
      ['growth_weight', M.growth_weight, 'share of the capped 7-day change added to the value'],
      ['growth_floor / growth_cap', M.growth_floor + '% / ' + M.growth_cap + '%', 'the 7-day change is clamped to this range'],
      ['maturity_floor', M.maturity_floor, 'maturity multiplier for a brand-new protocol'],
      ['maturity_range', M.maturity_range, 'added to the floor as age reaches maturity_days'],
      ['maturity_days', M.maturity_days, 'age in days at which maturity reaches 1'],
      ['unknown_age_days', M.unknown_age_days, 'age assumed when listed_at is unknown'],
      ['fee_capture_multiple', M.fee_capture_multiple, 'derivatives, options, prediction markets, chains, launchpads, DEXs'],
      ['pass_through_multiple', M.pass_through_multiple, 'staking, restaking, allocators, wrappers, bridges: TVL is custody'],
      ['chain_step', M.chain_step, 'credit per extra chain'],
      ['chain_cap', M.chain_cap, 'maximum extra chains credited'],
      ['wrapped_staked_bridged_penalty', M.wrapped_staked_bridged_penalty, 'wrapped, staked or bridged products of a token that already trades are scaled by this instead of being excluded']
    ];
    var list = el('dl', { class: 'equation' });
    items.forEach(function (i) {
      list.appendChild(el('div', null, el('dt', null, el('b', { text: i[0] + ' = ' + i[1] })), el('dd', { class: 'sub', text: i[2] })));
    });
    return el('section', { class: 'panel model', id: 'methodology' },
      el('h2', { text: 'Methodology' }),
      el('p', { class: 'formula', text: 'implied = max(1, round(tvl x base_multiple x growth x maturity x category x chains x wrapped_staked_bridged_penalty)); growth = 1 + clamp(change_7d) / 100 x growth_weight; maturity = floor + min(age, maturity_days) / maturity_days x range; chains = 1 + chain_step x min(chains - 1, chain_cap).' }),
      list,
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + '. Snapshot as of ' + DATA.as_of + ' (' + DATA.source + '). Figures come only from the snapshot; the implied value is a model output, not a price or a forecast.' }));
  }

  function table() {
    var head = el('tr');
    ['#', 'Protocol', 'Category', 'TVL', '7-day change', 'Implied value'].forEach(function (h) { head.appendChild(el('th', { scope: 'col', text: h })); });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null, el('thead', null, head), tbody)));
  }

  function maxImplied() {
    var m = 1;
    rows.forEach(function (r) { if (r.implied_value_usd > m) m = r.implied_value_usd; });
    return m;
  }

  var BAR_ROWS = 25;

  var barSub = el('p', { class: 'sub' });
  var barMount = el('div');

  function valueBars() {
    return el('div', { class: 'panel value-bars' },
      el('h2', { text: 'Implied value by rank' }),
      barSub,
      barMount);
  }

  function drawBars(shown) {
    var top = shown.slice(0, BAR_ROWS);
    barMount.textContent = '';
    if (top.length === 0) {
      barSub.textContent = 'No rows to chart.';
      return;
    }
    var max = 1;
    top.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var rowH = 22, gap = 8, pad = 12, labelW = 250, barMax = 620, valueW = 110;
    var h = pad * 2 + top.length * (rowH + gap);
    barSub.textContent = 'The first ' + top.length + ' rows of the current selection, one horizontal bar each, width relative to the largest (' + fmtUsd(max) + ').';
    var chart = svg('svg', { width: String(pad + labelW + barMax + valueW + pad), height: String(h), role: 'img', 'aria-label': 'Implied value by rank for the rows shown' });
    top.forEach(function (r, i) {
      var y = pad + i * (rowH + gap);
      var barW = (r.implied_value_usd / max) * barMax;
      var name = r.name.length > 40 ? r.name.slice(0, 38) + '\u2026' : r.name;
      chart.appendChild(svg('text', { class: 'bar-label', x: '0', y: String(y + 15), text: r.rank + '  ' + name }));
      chart.appendChild(svg('rect', { class: 'vbar', x: String(labelW), y: String(y), width: String(Math.max(barW, 1)), height: String(rowH) }));
      chart.appendChild(svg('text', { class: 'bar-value', x: String(labelW + barW + 8), y: String(y + 15), text: fmtUsd(r.implied_value_usd) }));
    });
    barMount.appendChild(chart);
  }

  function categoryPanel() {
    var sums = {};
    rows.forEach(function (r) {
      var c = r.category || 'Uncategorised';
      var e = sums[c];
      if (!e) e = sums[c] = { count: 0, total: 0 };
      e.count += 1;
      e.total += r.implied_value_usd;
    });
    var keys = Object.keys(sums).sort(function (a, b) { return sums[b].total - sums[a].total || sums[b].count - sums[a].count; });
    var total = 0;
    keys.forEach(function (k) { total += sums[k].total; });
    var frame = el('div', { class: 'panel category-summary' },
      el('h2', { text: 'Category summary' }),
      el('p', { class: 'sub', text: 'Each board category with its row count and total implied value.' }));
    var table = el('table');
    var head = el('tr');
    ['Category', 'Rows', 'Total implied value'].forEach(function (h) { head.appendChild(el('th', { scope: 'col', text: h })); });
    table.appendChild(el('thead', null, head));
    var body = el('tbody');
    keys.forEach(function (k) {
      var s = sums[k];
      body.appendChild(el('tr', null,
        el('td', { text: k }),
        el('td', { class: 'num', text: String(s.count) }),
        el('td', { class: 'num', text: fmtUsd(s.total) })));
    });
    body.appendChild(el('tr', null,
      el('td', { text: 'All categories' }),
      el('td', { class: 'num', text: String(rows.length) }),
      el('td', { class: 'num', text: fmtUsd(total) })));
    table.appendChild(body);
    frame.appendChild(table);
    return frame;
  }

  root.appendChild(el('header', { class: 'top' },
    el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'token-radar' })),
    el('div', { class: 'top-meta' }, el('span', { text: 'As of ' + DATA.as_of }), el('span', { text: DATA.source }))));
  root.appendChild(el('section', { class: 'lede' },
    el('div', null, el('h1', { text: 'Pre-token protocols ranked by implied value' }),
      el('p', { text: 'Protocols with no token yet, scored from TVL, 7-day change, age, category and chains. Select a row for its research steps.' }))));
  root.appendChild(el('div', { class: 'controls' },
    el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), searchInput),
    el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), categorySelect),
    el('div', { class: 'field' }, el('label', { for: 'sort', text: 'Sort by' }), sortSelect),
    countLine));
  root.appendChild(table());
  root.appendChild(valueBars());
  root.appendChild(categoryPanel());
  root.appendChild(methodology());
  root.appendChild(detail);
  root.appendChild(el('footer', { class: 'sub site-footer' },
    el('p', { text: 'Snapshot source: ' + DATA.source + ', as of ' + DATA.as_of + '.' }),
    el('p', { text: 'This board is a model\u2019s ranking, not investment advice.' })));
  renderRows();
  root.removeAttribute('aria-busy');
})();
