// Tabbed card (ARIA tab pattern). window.RADAR_TABS.create(el, [{ id, label, caption, node }]).
(function () {
  'use strict';

  function create(el, tabs, start) {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var active = start || 0;
    var timer = 0;
    var strip = el('div', { class: 'tablist', role: 'tablist', 'aria-label': 'Board analysis' });
    var line = el('i', { class: 'tab-line', 'aria-hidden': 'true' });
    var caption = el('p', { class: 'tab-caption' });
    var stage = el('div', { class: 'tab-stage' });
    var btns = [];
    var panes = [];

    tabs.forEach(function (t, i) {
      var b = el('button', { class: 'tab', type: 'button', role: 'tab', id: 'tab-' + t.id, 'aria-controls': 'pane-' + t.id, text: t.label });
      b.addEventListener('click', function () { select(i, false); });
      b.addEventListener('keydown', function (e) {
        var n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (n === undefined) return;
        e.preventDefault();
        select((n + tabs.length) % tabs.length, true);
      });
      btns.push(b);
      strip.appendChild(b);
      var p = el('div', { class: 'tab-pane', role: 'tabpanel', id: 'pane-' + t.id, tabindex: '0', 'aria-labelledby': 'tab-' + t.id }, t.node);
      panes.push(p);
      stage.appendChild(p);
    });
    strip.appendChild(line);

    function place() {
      var b = btns[active];
      line.style.width = b.offsetWidth + 'px';
      line.style.transform = 'translateX(' + b.offsetLeft + 'px)';
    }

    function show(i, animate) {
      panes.forEach(function (p, k) {
        var on = k === i;
        p.classList.toggle('off', !on);
        p.classList.remove('out', 'in');
        if (on) p.removeAttribute('inert'); else p.setAttribute('inert', '');
      });
      if (animate) { void panes[i].offsetWidth; panes[i].classList.add('in'); }
    }

    function select(i, focus) {
      if (i !== active) {
        var prev = active;
        active = i;
        clearTimeout(timer);
        panes[prev].classList.add('out');
        timer = setTimeout(function () { show(i, true); }, 90);
      }
      btns.forEach(function (b, k) {
        b.setAttribute('aria-selected', k === active ? 'true' : 'false');
        b.tabIndex = k === active ? 0 : -1;
      });
      caption.textContent = tabs[active].caption || '';
      place();
      if (focus) btns[active].focus();
    }

    var head = el('div', { class: 'tabs-head' }, strip, caption);
    var card = el('section', { class: 'panel tabs', 'aria-label': 'Analysis' }, head, stage);
    show(active, false);
    select(active, false);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    return card;
  }

  window.RADAR_TABS = { create: create };
})();
