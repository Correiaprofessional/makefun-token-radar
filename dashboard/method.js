// The methodology panel: the model constants and formula, drawn from window.RADAR.model.
// Plain script, no imports; app.js calls window.RADAR_METHOD(DATA, el, section).
(function () {
  'use strict';

  window.RADAR_METHOD = function (DATA, el, section) {
    var M = DATA.model;
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
    var body = el('tbody');
    items.forEach(function (i) {
      body.appendChild(el('tr', null, el('td', null, i[0], el('small', { text: i[2] })), el('td', { text: String(i[1]) })));
    });
    var panel = section('Model ' + DATA.model_version, 'Methodology', null,
      el('p', { class: 'formula', text: 'implied = max(1, round(tvl x base_multiple x growth x maturity x category x chains x wrapped_staked_bridged_penalty)); growth = 1 + clamp(change_7d) / 100 x growth_weight; maturity = floor + min(age, maturity_days) / maturity_days x range; chains = 1 + chain_step x min(chains - 1, chain_cap).' }));
    panel.id = 'methodology';
    panel.appendChild(el('table', { class: 'consts' }, body));
    panel.appendChild(el('p', { class: 'sub model-note', text: 'Snapshot as of ' + DATA.as_of + ' (' + DATA.source + '). Figures come only from the snapshot; the implied value is a model output, not a price or a forecast.' }));
    return panel;
  };
})();
