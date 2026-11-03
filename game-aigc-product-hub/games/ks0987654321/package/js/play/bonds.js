(function () {
  var M3 = window.M3, TYPES = { attackMultiplier: true, attackSpeedMultiplier: true, slowPowerBonus: true, goldMultiplier: true };
  M3.Bonds = {
    evaluate: function (manifest, deckIds) {
      var cards = {}, counts = {}, effects = {}, active = [], i, j, c, b, t;
      (manifest.cards || []).forEach(function (x) { cards[x.id] = x; });
      for (i = 0; i < deckIds.length; i += 1) { c = cards[deckIds[i]]; if (c) for (j = 0; j < (c.tags || []).length; j += 1) { t = c.tags[j]; counts[t] = (counts[t] || 0) + 1; } }
      for (i = 0; i < (manifest.bonds || []).length; i += 1) { b = manifest.bonds[i]; for (j = 0; j < (b.thresholds || []).length; j += 1) if ((counts[b.tag] || 0) >= b.thresholds[j].count && TYPES[b.thresholds[j].effect.type]) { effects[b.thresholds[j].effect.type] = b.thresholds[j].effect.value; active.push(b.id); } }
      return { active: active, effects: effects };
    }
  };
})();
