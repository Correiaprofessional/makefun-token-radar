// Token Radar's dashboard: reads window.RADAR (data.js) and renders the hero, 3D skyline, board, detail
// drawer, charts and model constants. No network, no imports.
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
  var F = window.RADAR_FORMAT;
  if (!F) {
    root.textContent = 'The dashboard helpers (format.js) are missing.';
    root.removeAttribute('aria-busy');
    return;
  }
  var rows = DATA.rows;
  var M = DATA.model;
  var fmtUsd = F.formatUsd;
  var fmtPct = F.formatPercent;
  var state = { q: '', category: 'all', sort: 'rank', page: 0, selected: null };
  var PAGE = 50;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // SVG namespace read back from the HTML parser, so no URL literal is needed.
  var probe = document.createElement('div');
  probe.innerHTML = '<svg></svg>';
  var SVG_NS = probe.firstChild.namespaceURI;

  var SORTS = {
    rank: { label: 'Rank', cmp: function (a, b) { return a.rank - b.rank; } },
    tvl: { label: 'TVL', cmp: function (a, b) { return (b.tvl_usd || 0) - (a.tvl_usd || 0) || a.rank - b.rank; } },
    change: { label: '7-day', cmp: function (a, b) { return (b.change_7d === null ? -Infinity : b.change_7d) - (a.change_7d === null ? -Infinity : a.change_7d) || a.rank - b.rank; } },
    implied: { label: 'Implied', cmp: function (a, b) { return (b.implied_value_usd || 0) - (a.implied_value_usd || 0) || a.rank - b.rank; } }
  };

  function build(make, tag, attrs, kids) {
    var node = make(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      });
    }
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }
  function el(tag, attrs) { return build(function (t) { return document.createElement(t); }, tag, attrs, [].slice.call(arguments, 2)); }
  function svg(tag, attrs) { return build(function (t) { return document.createElementNS(SVG_NS, t); }, tag, attrs, [].slice.call(arguments, 2)); }

  function cat(r) { return r.category || 'Uncategorised'; }
  function pad3(n) { return String(n).padStart(3, '0'); }

  var categories = [];
  rows.forEach(function (r) { if (categories.indexOf(cat(r)) < 0) categories.push(cat(r)); });
  categories.sort();

  function matches(r) {
    if (state.category !== 'all' && cat(r) !== state.category) return false;
    var q = state.q.trim().toLowerCase();
    return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.slug.toLowerCase().indexOf(q) >= 0;
  }

  function chip(label, tone) {
    return el('span', { class: 'chip', style: '--tone:' + F.TONES[tone] }, el('i'), label);
  }

  // Counts up once over 600ms; reduced motion writes the final value.
  function countUp(node, to, fmt) {
    if (reduce) { node.textContent = fmt(to); return; }
    var t0 = null;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / 600, 1);
      node.textContent = fmt(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    }
    node.textContent = fmt(0);
    requestAnimationFrame(step);
  }

  var maxImplied = 1;
  rows.forEach(function (r) { if (r.implied_value_usd > maxImplied) maxImplied = r.implied_value_usd; });

  // Controls
  var searchInput = el('input', { id: 'q', type: 'search', placeholder: 'Search name or slug', autocomplete: 'off', 'aria-label': 'Search name or slug', oninput: function (e) { state.q = e.target.value; reset(); } });
  var categorySelect = el('select', { id: 'category', 'aria-label': 'Category', onchange: function (e) { state.category = e.target.value; reset(); } },
    el('option', { value: 'all', text: 'All categories' }));
  categories.forEach(function (c) { categorySelect.appendChild(el('option', { value: c, text: c })); });
  var seg = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Sort by' }, el('span', { class: 'pill' }));
  Object.keys(SORTS).forEach(function (k, i) {
    seg.appendChild(el('button', {
      type: 'button', role: 'radio', 'data-sort': k, 'aria-checked': k === state.sort ? 'true' : 'false', text: SORTS[k].label,
      onclick: function () {
        state.sort = k;
        state.page = 0;
        seg.style.setProperty('--at', String(i));
        [].forEach.call(seg.querySelectorAll('button'), function (b) { b.setAttribute('aria-checked', b.getAttribute('data-sort') === k ? 'true' : 'false'); });
        renderRows();
      }
    }));
  });
  var countLine = el('p', { class: 'count', role: 'status', 'aria-live': 'polite' });
  var searchBox = el('div', { class: 'search' },
    svg('svg', { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'aria-hidden': 'true' },
      svg('circle', { cx: '7', cy: '7', r: '4.5' }), svg('path', { d: 'M10.5 10.5 14 14' })),
    searchInput);

  // Board table
  var tbody = el('tbody');
  var tableWrap = el('div', { class: 'table-wrap' });
  var boardTable = el('table', null,
    el('thead', null, el('tr', null,
      el('th', { scope: 'col', text: '#' }), el('th', { scope: 'col', text: 'Protocol' }),
      el('th', { scope: 'col', class: 'col-hide', text: 'Category' }), el('th', { scope: 'col', class: 'r', text: 'TVL' }),
      el('th', { scope: 'col', class: 'r', text: '7-day' }), el('th', { scope: 'col', class: 'r', text: 'Implied value' }))),
    tbody);
  tableWrap.appendChild(boardTable);
  var pager = el('nav', { class: 'pager', 'aria-label': 'Board pages' });
  var enterTimer = 0;
  // Restarts the row entrance animation (24ms stagger, capped by --k).
  function enter() {
    if (reduce) return;
    clearTimeout(enterTimer);
    boardTable.classList.remove('first');
    void boardTable.offsetWidth;
    boardTable.classList.add('first');
    enterTimer = setTimeout(function () { boardTable.classList.remove('first'); }, 1500);
  }
  function reset() { state.page = 0; renderRows(); }
  function goPage(p) {
    if (p === state.page) return;
    state.page = p;
    var top = tableWrap.getBoundingClientRect().top;
    if (top < 130) tableWrap.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
    if (reduce) { renderRows(); return; }
    tbody.classList.add('out');
    setTimeout(function () { renderRows(); tbody.classList.remove('out'); enter(); }, 90);
  }
  function drawPager(pages) {
    pager.textContent = '';
    pager.hidden = pages < 2;
    function btn(label, p, off, cur) {
      pager.appendChild(el('button', { type: 'button', text: label, disabled: off ? '' : null, 'aria-current': cur ? 'page' : null,
        'aria-label': cur || /^\d+$/.test(label) ? 'Page ' + label : label === 'Prev' ? 'Previous page' : 'Next page', onclick: function () { goPage(p); } }));
    }
    btn('Prev', state.page - 1, state.page === 0);
    for (var i = 0; i < pages; i++) btn(String(i + 1), i, false, i === state.page);
    btn('Next', state.page + 1, state.page === pages - 1);
  }

  // Detail drawer
  var detail = el('aside', { class: 'detail', id: 'detail', 'aria-label': 'Protocol detail', 'aria-hidden': 'true' });
  var scrim = el('div', { class: 'scrim', onclick: function () { closeDetail(); } });
  var lastFocus = null;

  function markSelected() {
    [].forEach.call(tbody.querySelectorAll('tr[data-slug]'), function (tr) {
      tr.setAttribute('data-selected', tr.getAttribute('data-slug') === state.selected ? 'true' : 'false');
    });
  }

  function glyphPct(n) {
    if (n === null || n === undefined) return el('span', { class: 'num', text: fmtPct(n) });
    return el('span', { class: 'num ' + (n < 0 ? 'neg' : 'pos'), text: (n < 0 ? '\u25BC ' : '\u25B2 ') + fmtPct(n) });
  }

  function renderRows() {
    var shown = rows.filter(matches).sort(SORTS[state.sort].cmp);
    var pages = Math.max(1, Math.ceil(shown.length / PAGE));
    state.page = Math.min(state.page, pages - 1);
    var start = state.page * PAGE, view = shown.slice(start, start + PAGE);
    tbody.textContent = '';
    view.forEach(function (r, i) {
      var w = Math.max(3, Math.cbrt(r.implied_value_usd / maxImplied) * 100);
      var tr = el('tr', { tabindex: '0', 'data-slug': r.slug, 'data-selected': state.selected === r.slug ? 'true' : 'false', 'aria-label': 'Open details for ' + r.name, style: '--k:' + Math.min(i, 11) },
        el('td', { class: 'num', text: pad3(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'micro', text: r.slug }))),
        el('td', { class: 'col-hide' }, chip(cat(r), F.toneOf(r))),
        el('td', { class: 'num r', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'r' }, glyphPct(r.change_7d)),
        el('td', { class: 'r' }, el('div', { class: 'imp' }, el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'mbar', 'aria-hidden': 'true' }, el('i', { style: '--w:' + w.toFixed(1) + '%;--k:' + Math.min(i, 19) })))));
      tr.addEventListener('click', function () { openDetail(r.slug); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); }
      });
      tbody.appendChild(tr);
    });
    if (shown.length === 0) {
      tbody.appendChild(el('tr', { class: 'empty' }, el('td', { colspan: '6', text: 'No rows match this search.' })));
    }
    countLine.textContent = 'Showing ' + (shown.length ? (start + 1) + '\u2013' + (start + view.length) : '0') + ' of ' + shown.length + ' ' + F.pluralise(shown.length, 'row');
    drawPager(pages);
    drawBars(shown);
    if (!scene && !sceneFailed) startScene();
    // The skyline deliberately takes the whole filtered selection (it draws its head, sixty rows), not just this page.
    if (scene) scene.setRows(shown);
  }

  function openDetail(slug) {
    var r = rows.filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    if (state.selected === null) lastFocus = document.activeElement;
    state.selected = slug;
    var closeBtn = el('button', { class: 'close', type: 'button', 'aria-label': 'Close detail', text: 'Close', onclick: closeDetail });
    var stats = el('div', { class: 'kv' });
    [
      ['TVL', fmtUsd(r.tvl_usd)],
      ['7-day change', fmtPct(r.change_7d)],
      ['Implied value', fmtUsd(r.implied_value_usd)],
      ['Category', cat(r)],
      ['Chain count', F.describeChainCount(r.chains ? r.chains.length : 0)],
      ['Chains', r.chains && r.chains.length ? r.chains.join(', ') : 'n/a']
    ].forEach(function (p) { stats.appendChild(el('div', null, el('span', { text: p[0] }), el('b', { text: p[1] }))); });
    var steps = el('ol', { class: 'steps' });
    (r.farm_steps || []).forEach(function (s) { steps.appendChild(el('li', { text: s })); });
    detail.textContent = '';
    detail.appendChild(el('div', { class: 'detail-head' },
      el('div', null, el('div', { class: 'eyebrow', text: 'Protocol detail' }), el('h2', { text: r.name }), el('p', { class: 'sub', text: r.slug + ' \u00B7 ' + cat(r) + ' \u00B7 rank ' + pad3(r.rank) })),
      closeBtn));
    detail.appendChild(stats);
    detail.appendChild(el('div', { class: 'detail-section' },
      el('h3', { text: 'Farm steps' }),
      el('p', { class: 'sub', text: 'Research steps, not advice. No reward, price or allocation is promised; any deposit is optional and can lose money.' }),
      steps));
    detail.scrollTop = 0;
    detail.removeAttribute('aria-hidden');
    root.classList.add('open');
    closeBtn.focus();
    markSelected();
  }
  function closeDetail() {
    if (state.selected === null) return;
    state.selected = null;
    root.classList.remove('open');
    detail.setAttribute('aria-hidden', 'true');
    markSelected();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });

  // 3D skyline panel
  var scene = null, sceneFailed = false;
  var canvas = el('canvas', { width: '1080', height: '420', role: 'img', 'aria-label': 'Three-dimensional skyline of implied value: one tower per protocol row, height is the cube root of implied value, colour is category. Drag to orbit, click a tower to open its details.' });
  var sceneFoot = el('div', { class: 'scene-foot' },
    el.apply(null, ['ul', { class: 'legend', 'aria-label': 'Category colours' }].concat(F.TONE_NAMES.map(function (n, i) { return el('li', null, chip(n, i)); }))),
    el('p', { class: 'micro', text: 'drag to orbit \u00B7 click a tower' }));
  var scenePanel = el('section', { class: 'scene-panel', 'aria-label': 'Skyline' }, canvas, sceneFoot);

  function sceneFallback() {
    sceneFailed = true;
    canvas.remove();
    sceneFoot.remove();
    scenePanel.appendChild(el('p', { class: 'scene-fallback', text: 'The 3D view needs WebGL, which is not available here. The table and charts below show the same figures.' }));
  }
  function startScene() {
    if (!window.RADAR_SCENE) { sceneFallback(); return; }
    try {
      scene = window.RADAR_SCENE.create(canvas, rows.filter(matches).sort(SORTS[state.sort].cmp), openDetail);
    } catch (e) { scene = null; }
    if (!scene) sceneFallback();
  }

  // Bar chart of the first rows of the current selection
  var barSub = el('p', { class: 'sub' });
  var barMount = el('div', { class: 'chart-scroll' });
  var BAR_ROWS = 25;
  function drawBars(shown) {
    var top = shown.slice(0, BAR_ROWS);
    barMount.textContent = '';
    if (top.length === 0) { barSub.textContent = 'No rows to chart.'; return; }
    var max = 1;
    top.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var rowH = 22, gap = 8, pad = 12, labelW = 250, barMax = 620, valueW = 110;
    var h = pad * 2 + top.length * (rowH + gap);
    barSub.textContent = 'The first ' + top.length + ' rows of the current selection, one horizontal bar each, width relative to the largest (' + fmtUsd(max) + ').';
    var chart = svg('svg', { width: String(pad + labelW + barMax + valueW + pad), height: String(h), role: 'img', 'aria-label': 'Implied value by rank for the rows shown' },
      svg('defs', null, svg('linearGradient', { id: 'vg', x1: '0', x2: '1', y1: '0', y2: '0' },
        svg('stop', { offset: '0', 'stop-color': '#2ee6a8' }), svg('stop', { offset: '1', 'stop-color': '#6ad7ff' }))));
    top.forEach(function (r, i) {
      var y = pad + i * (rowH + gap);
      var barW = (r.implied_value_usd / max) * barMax;
      var name = r.name.length > 40 ? r.name.slice(0, 38) + '\u2026' : r.name;
      chart.appendChild(svg('text', { class: 'bar-label', x: '0', y: String(y + 15), text: pad3(r.rank) + '  ' + name }));
      chart.appendChild(svg('rect', { class: 'vbar', x: String(labelW), y: String(y), width: String(Math.max(barW, 1)), height: String(rowH), rx: '4' }));
      chart.appendChild(svg('text', { class: 'bar-value', x: String(labelW + barW + 8), y: String(y + 15), text: fmtUsd(r.implied_value_usd) }));
    });
    barMount.appendChild(chart);
  }

  function section(eyebrow, title, sub, extra) {
    return el('section', { class: 'panel' }, el('div', { class: 'eyebrow', text: eyebrow }), el('h2', { text: title }), sub ? el('p', { class: 'sub', text: sub }) : null, extra);
  }

  function categoryPanel() {
    var sums = {};
    rows.forEach(function (r) {
      var e = sums[cat(r)] || (sums[cat(r)] = { count: 0, total: 0 });
      e.count += 1;
      e.total += r.implied_value_usd;
    });
    var keys = Object.keys(sums).sort(function (a, b) { return sums[b].total - sums[a].total || sums[b].count - sums[a].count; });
    var total = 0;
    var body = el('tbody');
    keys.forEach(function (k) {
      total += sums[k].total;
      body.appendChild(el('tr', null, el('td', null, chip(k, F.toneOf({ category: k, name: '' }))),
        el('td', { class: 'num r', text: String(sums[k].count) }), el('td', { class: 'num r', text: fmtUsd(sums[k].total) })));
    });
    body.appendChild(el('tr', null, el('td', { class: 'num', text: 'All categories' }),
      el('td', { class: 'num r', text: String(rows.length) }), el('td', { class: 'num r', text: fmtUsd(total) })));
    return section('Distribution', 'Category summary', 'Each category with its row count and total implied value.',
      el('table', null, el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', class: 'r', text: 'Rows' }), el('th', { scope: 'col', class: 'r', text: 'Total implied' }))), body));
  }

  // Page assembly
  var bar = document.getElementById('bar');
  if (bar) {
    bar.appendChild(el('div', { class: 'brand' }, el('span', { class: 'dot' }), el('span', { text: 'token-radar' })));
    bar.appendChild(el('div', { class: 'bar-meta' }, el('span', { text: 'as of ' + DATA.as_of }), el('span', { text: String(DATA.source).split(' ')[0] })));
  }
  var statNodes = [
    [DATA.rows.length, String, 'board rows'],
    [DATA.watchlist_size, function (n) { return n + '/' + DATA.watchlist_size; }, 'watchlist covered'],
    [maxImplied, fmtUsd, 'top implied value']
  ].map(function (s) { return { to: s[0], fmt: s[1], node: el('b', { text: s[1](s[0]) }), label: s[2] }; });
  var stats = el('div', { class: 'stats' });
  statNodes.forEach(function (s, i) { stats.appendChild(el('div', { class: 'stat', style: '--i:' + (3 + i) }, s.node, el('span', { class: 'micro mono', text: s.label }))); });
  root.appendChild(el('section', { class: 'hero' },
    el('div', { class: 'eyebrow', style: '--i:0', text: 'DefiLlama snapshot \u00B7 ' + DATA.board_size + ' ranked protocols' }),
    el('h1', { style: '--i:1', text: 'Pre-token radar' }),
    el('p', { class: 'deck', style: '--i:2', text: 'Protocols with no token yet, scored from TVL, 7-day change, age, category and chains. Select a row for its research steps.' }),
    stats));
  root.appendChild(el('div', { class: 'section' }, scenePanel));
  root.appendChild(el('div', { class: 'controls' }, searchBox, categorySelect, seg, countLine));
  root.appendChild(el('div', { class: 'panel board' }, tableWrap, pager));
  root.appendChild(el('div', { class: 'section' }, section('Chart', 'Implied value by rank', null, el('div', null, barSub, barMount))));
  root.appendChild(el('div', { class: 'section split' }, categoryPanel(), window.RADAR_METHOD ? window.RADAR_METHOD(DATA, el, section) : null));
  root.appendChild(scrim);
  root.appendChild(detail);
  root.appendChild(el('footer', { class: 'site-footer' },
    el('p', { text: 'Snapshot source: ' + DATA.source + ', as of ' + DATA.as_of + '.' }),
    el('p', { text: 'This board is a model\u2019s ranking, not investment advice.' })));
  renderRows();
  root.removeAttribute('aria-busy');
  statNodes.forEach(function (s) { countUp(s.node, s.to, s.fmt); });
  enter();
})();
