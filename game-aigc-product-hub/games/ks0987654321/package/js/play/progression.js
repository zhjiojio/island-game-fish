(function () {
  var M3 = window.M3;
  M3.Progression = {
    cardLevel: function (cardId) { var c = M3.SaveData.get().cards[cardId]; return c && c.level ? Math.max(1, c.level) : 1; },
    statMultiplier: function (manifest, cardId) { var p = manifest.progression || {}, level = this.cardLevel(cardId); return 1 + (level - 1) * (p.statPerLevel || 0); },
    upgradeCost: function (manifest, cardId) { var p = manifest.progression || {}, level = this.cardLevel(cardId); return Math.round((p.baseUpgradeCost || 25) * Math.pow(p.upgradeCostGrowth || 1, level - 1)); },
    upgrade: function (manifest, cardId) { var d = M3.SaveData.get(), p = manifest.progression || {}, cost = this.upgradeCost(manifest, cardId), c, level = this.cardLevel(cardId); if (level >= (p.maxLevel || 20) || d.materials < cost) return false; c = d.cards[cardId] || { level: 1, xp: 0 }; d.materials -= cost; c.level += 1; d.cards[cardId] = c; M3.SaveData.save(); return true; }
  };
})();
