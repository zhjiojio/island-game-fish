(function () {
  var M3 = window.M3;
  var ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
  function result(ok, errors) { return { ok: ok, errors: errors || [] }; }
  function finite(n, min, max) { return typeof n === 'number' && isFinite(n) && n >= min && n <= max; }
  function validAsset(value) { return !value || (/^(https:\/\/|assets\/|subpackages\/)/.test(value) || /^[a-zA-Z0-9_-]+$/.test(value)); }
  function validateManifest(m) {
    var e = [], ids = {}, banned = {}, playable = 0, deckSize = m && m.deckRules && m.deckRules.deckSize, i, c, n, assets, key;
    if (!m || m.schemaVersion !== 1) e.push('manifest.schemaVersion');
    if (!m || !m.deckRules || !finite(m.deckRules.deckSize, 1, 10)) e.push('deckRules.deckSize');
    if (!m || !Array.isArray(m.cards) || m.cards.length < 1 || m.cards.length > 100) e.push('cards');
    if (m && m.deckRules && Array.isArray(m.deckRules.bannedCardIds)) for (i = 0; i < m.deckRules.bannedCardIds.length; i += 1) banned[m.deckRules.bannedCardIds[i]] = true;
    if (m && Array.isArray(m.cards)) for (i = 0; i < m.cards.length; i += 1) {
      c = m.cards[i];
      if (!c || !ID_RE.test(c.id || '') || !ID_RE.test(c.unitId || '') || ids[c.id]) e.push('cards[' + i + ']');
      else { ids[c.id] = true; if (c.unlocked !== false && !banned[c.id]) playable += 1; }
      if (c && !validAsset(c.portraitAsset)) e.push('cards.assets[' + i + ']');
    }
    if (finite(deckSize, 1, 10) && playable < deckSize) e.push('cards.playableCount');
    if (!m || !m.worldMap || !Array.isArray(m.worldMap.nodes)) e.push('worldMap.nodes');
    else for (i = 0; i < m.worldMap.nodes.length; i += 1) {
      n = m.worldMap.nodes[i];
      if (!n || !ID_RE.test(n.id || '') || !ID_RE.test(n.levelId || '')) e.push('worldMap.nodes[' + i + ']');
    }
    assets = m && m.presentation && m.presentation.sceneAssets;
    if (assets) for (key in assets) if (Object.prototype.hasOwnProperty.call(assets, key) && !validAsset(assets[key])) e.push('presentation.sceneAssets.' + key);
    return result(e.length === 0, e);
  }
  function validateLevel(l) {
    var e = [], ids = {}, i, u, g, p;
    if (!l || l.schemaVersion !== 5 || l.template !== 'fixed-path-v1') e.push('schema/template');
    if (!l || !l.map || !finite(l.map.width, 2, 40) || !finite(l.map.height, 2, 40)) e.push('map.size');
    if (l && l.map && (!Array.isArray(l.map.tiles) || l.map.tiles.length !== l.map.width * l.map.height)) e.push('map.tiles');
    if (l && l.map && Array.isArray(l.map.path)) for (i = 0; i < l.map.path.length; i += 1) {
      p = l.map.path[i];
      if (!p || !finite(p.x, 0, l.map.width - 1) || !finite(p.y, 0, l.map.height - 1)) e.push('map.path[' + i + ']');
    }
    if (!l || !Array.isArray(l.units) || l.units.length > 200) e.push('units');
    else for (i = 0; i < l.units.length; i += 1) {
      u = l.units[i];
      if (!u || !ID_RE.test(u.id || '') || ids[u.id]) e.push('units[' + i + ']');
      else ids[u.id] = u;
      if (u && (!validAsset(u.imageAsset) || !validAsset(u.soundAsset))) e.push('units.assets[' + i + ']');
    }
    if (!l || !l.economy || !finite(l.economy.baseHp, 1, 100000) || !finite(l.economy.initialGold, 0, 10000000)) e.push('economy');
    if (!l || !Array.isArray(l.waves) || l.waves.length > 200) e.push('waves');
    else for (i = 0; i < l.waves.length; i += 1) {
      if (!Array.isArray(l.waves[i].groups)) { e.push('waves[' + i + '].groups'); continue; }
      for (g = 0; g < l.waves[i].groups.length; g += 1) if (!ids[l.waves[i].groups[g].enemy]) e.push('waves[' + i + '].enemy');
    }
    if (l && l.map && !validAsset(l.map.backgroundAsset)) e.push('map.backgroundAsset');
    return result(e.length === 0, e);
  }
  M3.ConfigValidator = { validateManifest: validateManifest, validateLevel: validateLevel, validAsset: validAsset };
})();
