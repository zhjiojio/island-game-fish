(function () {
  var M3 = window.M3, CACHE = 'm3-runtime-config-v1', BASE = (window.RUNTIME_CONFIG_BASE_URL || '').replace(/\/$/, ''), ENDPOINTS = window.RUNTIME_CONFIG_ENDPOINTS || {}, MANIFEST_URL = ENDPOINTS.manifestUrl || (BASE ? BASE + '/v1/games/ks0987654321/runtime-manifest' : ''), LEVEL_URL_TEMPLATE = ENDPOINTS.levelUrlTemplate || (BASE ? BASE + '/v1/games/ks0987654321/levels/{levelId}' : ''), state = { source: 'fallback', manifest: null, levels: {}, errors: [] };
  function levelUrl(manifest, id) { var ref = manifest.levels && manifest.levels[id]; return ref && typeof ref.url === 'string' && /^https:\/\//.test(ref.url) ? ref.url : LEVEL_URL_TEMPLATE.replace('{levelId}', encodeURIComponent(id)); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function merge(base, extra) { var out = {}, key; for (key in base) if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key]; for (key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) out[key] = extra[key]; return out; }
  function color(value, fallback) { return Array.isArray(value) && value.length >= 3 ? value.slice(0, 4) : clone(fallback); }
  function appearance(value, fallback, primary) { var out = merge(fallback, value || {}); out.primaryColor = color(value && value.primaryColor, primary); out.secondaryColor = color(value && value.secondaryColor, fallback.secondaryColor); out.accentColor = color(value && value.accentColor, fallback.accentColor); return out; }
  function applyPresentationFallback(manifest, levels) {
    var defaults = M3.NeutralConfig.manifest.presentation, supplied = manifest.presentation || {}, dc = defaults.colors, sc = supplied.colors || {}, cards = manifest.cards || [], rolePalette, enemyPalette, roleAppearances, enemyAppearances, cardByUnit = {}, key, i, j, units, enemyIndex, fallbackAppearance;
    manifest.presentation = clone(defaults); manifest.presentation.themeId = supplied.themeId || defaults.themeId; manifest.presentation.displayName = supplied.displayName || defaults.displayName;
    manifest.presentation.sceneAssets = merge(defaults.sceneAssets, supplied.sceneAssets || {});
    manifest.presentation.copy = merge(defaults.copy, supplied.copy || {});
    for (key in dc) if (Object.prototype.hasOwnProperty.call(dc, key)) manifest.presentation.colors[key] = color(sc[key], dc[key]);
    rolePalette = Array.isArray(supplied.rolePalette) && supplied.rolePalette.length ? supplied.rolePalette : defaults.rolePalette;
    enemyPalette = Array.isArray(supplied.enemyPalette) && supplied.enemyPalette.length ? supplied.enemyPalette : defaults.enemyPalette;
    manifest.presentation.rolePalette = rolePalette.map(function (c, index) { return color(c, defaults.rolePalette[index % defaults.rolePalette.length]); });
    manifest.presentation.enemyPalette = enemyPalette.map(function (c, index) { return color(c, defaults.enemyPalette[index % defaults.enemyPalette.length]); });
    manifest.presentation.mapStyle = merge(defaults.mapStyle, supplied.mapStyle || {});
    roleAppearances = Array.isArray(supplied.roleAppearances) && supplied.roleAppearances.length ? supplied.roleAppearances : defaults.roleAppearances;
    enemyAppearances = Array.isArray(supplied.enemyAppearances) && supplied.enemyAppearances.length ? supplied.enemyAppearances : defaults.enemyAppearances;
    manifest.presentation.roleAppearances = roleAppearances.map(function (a, index) { return appearance(a, defaults.roleAppearances[index % defaults.roleAppearances.length], manifest.presentation.rolePalette[index % manifest.presentation.rolePalette.length]); });
    manifest.presentation.enemyAppearances = enemyAppearances.map(function (a, index) { return appearance(a, defaults.enemyAppearances[index % defaults.enemyAppearances.length], manifest.presentation.enemyPalette[index % manifest.presentation.enemyPalette.length]); });
    for (i = 0; i < cards.length; i += 1) { cards[i].color = color(cards[i].color, manifest.presentation.rolePalette[i % manifest.presentation.rolePalette.length]); cards[i].symbol = cards[i].symbol || (i % 9) + 1; cards[i].uiName = cards[i].uiName || cards[i].displayName || ('守卫' + (i + 1)); if (typeof cards[i].portraitAsset !== 'string') cards[i].portraitAsset = ''; fallbackAppearance = manifest.presentation.roleAppearances[i % manifest.presentation.roleAppearances.length]; cards[i].appearance = appearance(cards[i].appearance, fallbackAppearance, cards[i].color); cardByUnit[cards[i].unitId] = cards[i]; }
    for (key in levels) if (Object.prototype.hasOwnProperty.call(levels, key)) {
      levels[key].map.presentation = merge({ groundColor: dc.ground, routeColor: dc.route, obstacleColor: dc.obstacle, waterColor: dc.background }, levels[key].map.presentation || {});
      levels[key].map.presentation.style = merge(manifest.presentation.mapStyle, levels[key].map.presentation.style || {});
      levels[key].uiName = levels[key].uiName || levels[key].name || '珊瑚前哨'; levels[key].description = levels[key].description || '守住最后的珊瑚礁'; levels[key].objective = levels[key].objective || ('坚持' + levels[key].waves.length + '波攻击');
      units = levels[key].units || []; enemyIndex = 0;
      for (j = 0; j < units.length; j += 1) { if (typeof units[j].attack === 'number') { fallbackAppearance = cardByUnit[units[j].id] ? cardByUnit[units[j].id].appearance : manifest.presentation.roleAppearances[j % manifest.presentation.roleAppearances.length]; units[j].color = color(units[j].color, fallbackAppearance.primaryColor); units[j].appearance = appearance(units[j].appearance, fallbackAppearance, units[j].color); } else { fallbackAppearance = manifest.presentation.enemyAppearances[enemyIndex % manifest.presentation.enemyAppearances.length]; units[j].color = color(units[j].color, manifest.presentation.enemyPalette[enemyIndex % manifest.presentation.enemyPalette.length]); units[j].appearance = appearance(units[j].appearance, fallbackAppearance, units[j].color); enemyIndex += 1; } }
    }
    return { manifest: manifest, levels: levels };
  }
  function accept(manifest, levels, source, errors) { var bundle = applyPresentationFallback(clone(manifest), clone(levels)); state.manifest = bundle.manifest; state.levels = bundle.levels; state.source = source; state.errors = errors || []; if (source === 'remote') try { KwaiStorage.setSync(CACHE, bundle); } catch (e) {} }
  function validBundle(manifest, levels) {
    var refs = manifest && manifest.levels, nodes = manifest && manifest.worldMap && manifest.worldMap.nodes, cards = manifest && manifest.cards, key, i, j, unitIds;
    if (!M3.ConfigValidator.validateManifest(manifest).ok || !refs || !levels) return false;
    for (key in refs) if (Object.prototype.hasOwnProperty.call(refs, key)) {
      if (!levels[key] || !M3.ConfigValidator.validateLevel(levels[key]).ok) return false;
      unitIds = {}; for (i = 0; i < levels[key].units.length; i += 1) unitIds[levels[key].units[i].id] = true;
      for (j = 0; j < cards.length; j += 1) if (cards[j].unlocked !== false && !unitIds[cards[j].unitId]) return false;
    }
    for (i = 0; i < nodes.length; i += 1) if (!refs[nodes[i].levelId] || !levels[nodes[i].levelId]) return false;
    return Object.keys(refs).length > 0;
  }
  function fallback(reason) {
    var cached, errors = state.errors.slice(0);
    state.errors.push(reason || 'fallback');
    errors.push(reason || 'fallback');
    try { cached = KwaiStorage.getSync(CACHE); } catch (e) {}
    if (cached && validBundle(cached.manifest, cached.levels)) { accept(cached.manifest, cached.levels, 'cache', errors); return; }
    accept(clone(M3.NeutralConfig.manifest), clone(M3.NeutralConfig.levels), 'fallback', errors);
  }
  function request(url, callback, retried) {
    KwaiNetwork.request({ url: url, method: 'GET', timeout: 5000, onSuccess: function (res) {
      if (res.statusCode >= 200 && res.statusCode < 300) callback(null, res.data); else if (res.statusCode >= 500 && !retried) setTimeout(function () { request(url, callback, true); }, 500); else callback(new Error('HTTP ' + res.statusCode));
    }, onFail: function (err) { if (!retried) setTimeout(function () { request(url, callback, true); }, 500); else callback(new Error((err && err.errMsg) || 'network')); } });
  }
  function loadRemote(done) {
    request(MANIFEST_URL, function (err, manifest) {
      var validation, refs = [], levels = {}, pending, failed = false;
      if (err) { fallback(err.message); done(); return; }
      validation = M3.ConfigValidator.validateManifest(manifest); if (!validation.ok) { fallback(validation.errors.join(',')); done(); return; }
      Object.keys(manifest.levels || {}).forEach(function (id) { refs.push(id); }); pending = refs.length;
      if (!pending) { fallback('no levels'); done(); return; }
      refs.forEach(function (id) { request(levelUrl(manifest, id), function (levelErr, level) {
        if (levelErr || !M3.ConfigValidator.validateLevel(level).ok) failed = true; else levels[id] = level;
        pending -= 1; if (!pending) { if (failed || !validBundle(manifest, levels)) fallback('level load failed'); else accept(manifest, levels, 'remote', []); done(); }
      }); });
    });
  }
  M3.RuntimeConfig = {
    init: function (done) { if (!MANIFEST_URL) { fallback('runtime endpoints empty'); setTimeout(done, 0); } else loadRemote(done); },
    getManifest: function () { return state.manifest; }, getLevel: function (id) { return state.levels[id]; },
    getSource: function () { return state.source; }, getErrors: function () { return state.errors.slice(0); }, getBaseUrl: function () { return BASE; }
  };
})();
