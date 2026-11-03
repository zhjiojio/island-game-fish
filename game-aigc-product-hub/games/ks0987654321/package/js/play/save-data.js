(function () {
  var M3 = window.M3, KEY = 'm3-configurable-defense-save-v1';
  function defaults() { return { version: 1, playerLevel: 1, playerXp: 0, materials: 0, cards: {}, stars: {}, completed: {}, recentDeck: [] }; }
  function sanitize(v) {
    var d = defaults(); if (!v || v.version !== 1) return d;
    d.playerLevel = Math.max(1, Number(v.playerLevel) || 1); d.playerXp = Math.max(0, Number(v.playerXp) || 0);
    d.materials = Math.max(0, Number(v.materials) || 0); d.cards = v.cards || {}; d.stars = v.stars || {};
    d.completed = v.completed || {}; d.recentDeck = Array.isArray(v.recentDeck) ? v.recentDeck.slice(0, 10) : [];
    return d;
  }
  var data = defaults();
  M3.SaveData = {
    load: function () { try { data = sanitize(KwaiStorage.getSync(KEY)); } catch (e) { data = defaults(); } return data; },
    get: function () { return data; },
    save: function () { try { KwaiStorage.setSync(KEY, data); } catch (e) { console.warn('Save', '本地保存失败'); } },
    reset: function () { data = defaults(); this.save(); },
    setRecentDeck: function (ids) { data.recentDeck = ids.slice(0); this.save(); },
    completeLevel: function (id, stars, xp, materials) { data.completed[id] = true; data.stars[id] = Math.max(data.stars[id] || 0, stars); data.playerXp += xp || 0; data.materials += materials || 0; this.save(); }
  };
})();
