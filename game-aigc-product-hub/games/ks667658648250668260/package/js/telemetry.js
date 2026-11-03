/** Scene-only telemetry. IDs and stable option identities are generated from content/.
 * One ID per real process startup. Duration uses bounded, non-overlapping delta slots.
 * See docs/telemetry-v93.md for metric definitions and delivery limitations.
 */
(function (global) {
  'use strict';
  var M = global.TelemetryManifest;
  if (!M) throw new Error('Load telemetry-manifest.js before telemetry.js');
  var VERSION = M.schemaVersion, enabled = true, debug = false, overlay = false;
  var bootT = Date.now(), boot = 'b_' + bootT.toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  var sent = {}, SC = {}, entry = 'launch', chapter = '', hidden = false;
  var baseline = bootT, active = false, pendingMs = 0, totalMs = 0, slot = 0, durationBypass = false;
  var visited = {}, nodeCount = 0, adCount = 0, lastNode = '', diagnostics = [];
  Object.keys(M.byKey).forEach(function (k) { if (k.indexOf('legacy:') === 0) SC[k.slice(7)] = M.byKey[k]; });
  function bypass() {
    return !!((global.AdminAdControl && global.AdminAdControl.isBypassed())
      || (global.state && global.state.sessionAdBypass === true));
  }
  function compact(obj, numbers) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      if (v === undefined || v === null || v === '') return;
      if (numbers && !isFinite(Number(v))) return;
      out[k] = String(v);
    });
    return out;
  }
  function bytes(s) { return unescape(encodeURIComponent(s)).length; }
  function scene(id, opts) {
    if (!enabled || !id || sent[id]) return false;
    opts = opts || {};
    var dim = compact(Object.assign({ v: VERSION, game_version: M.gameVersion, boot_id: boot,
      chapter_id: chapter, entry_source: entry, admin_bypass: bypass() ? '1' : '0' }, opts.dimension));
    var metric = compact(opts.metric, true);
    // Stable identifiers are never truncated to make room for optional prose.
    if (bytes(JSON.stringify(dim)) > 1000 || bytes(JSON.stringify(metric)) > 1000) {
      diagnostics.push('oversize:' + id); return false;
    }
    var api = global.KwaiDataAnalysis;
    if (!api || !api.reportScene) return false;
    var record = sent[id] = { status: 'pending', attempts: 0 };
    function send() {
      record.attempts++;
      var finished = false;
      function fail() {
        if (finished) return; finished = true;
        record.status = 'failed';
        // Only explicit failure can retry, never an ambiguous missing callback.
        if (record.attempts < 2) setTimeout(send, 1000);
        else {
          diagnostics.push('failed:' + id);
          if (id !== M.byKey.transport_issue) event('transport_issue', { failed_scene: id });
        }
      }
      try {
        var invoked = api.reportScene({ sceneId: id,
          costTime: Math.max(0, Math.round(opts.sinceStart ? Date.now() - bootT : opts.costTime || 0)),
          dimension: dim, metric: metric,
          success: function () { if (!finished) { finished = true; record.status = 'acknowledged'; } }, fail: fail });
        if (invoked === false) fail();
      } catch (_) { fail(); }
    }
    send();
    if (debug) console.log('[Telemetry Scene]', id, dim, metric);
    return true;
  }
  function event(key, dim, metric) {
    return scene(M.byKey[key], { sinceStart: true, dimension: Object.assign({ event_key: key }, dim), metric: metric });
  }
  function legacy(name, dim, metric) { return scene(SC[name], { sinceStart: true, dimension: dim, metric: metric }); }
  function settle() {
    var now = Date.now(), dt = Math.max(0, now - baseline); baseline = now;
    if (enabled && active && !hidden) { pendingMs += dt; totalMs += dt; }
  }
  function flush(reason) {
    settle();
    if (pendingMs <= 0) return;
    if (slot >= M.durationSlots) {
      event('duration_exhausted', { reason: reason, chapter_id: chapter }, { recorded_slots: slot });
      pendingMs = 0; return;
    }
    event('duration_slot:' + slot, { chapter_id: chapter, reason: reason, admin_bypass: durationBypass ? '1' : '0' }, { delta_ms: Math.round(pendingMs), seq: slot });
    slot++; pendingMs = 0;
  }
  function pause(reason) { flush(reason || 'pause'); active = false; }
  function context(ep, playable) {
    settle();
    if (chapter !== ep || active !== playable || durationBypass !== bypass()) flush(chapter !== ep ? 'chapter_change' : 'mode_change');
    durationBypass = bypass();
    chapter = ep || ''; active = !!playable;
    if (pendingMs >= 30000) flush('interval');
  }
  function onHide() { if (hidden) return; pause('hide'); hidden = true; }
  function onShow() { hidden = false; baseline = Date.now(); active = false; }
  function onPageExpose(page, opts) {
    var map = { splash: 'PAGE_SPLASH', game_story: 'PAGE_STORY', game_choice: 'PAGE_CHOICE', be_overlay: 'PAGE_BE',
      end_page: 'PAGE_END', chapter_panel: 'PAGE_CHAPTER', tutorial: 'PAGE_TUTORIAL' };
    if (map[page]) legacy(map[page], { page_name: page });
    else event('page_view:' + page, opts);
  }
  function onRenderTick(s, getNode, display) {
    display = display || {};
    if (!s || hidden) return;
    legacy('ENGINE_READY');
    var ui = s.ui || {}, ad = s.adLoading && s.adLoading.active;
    var home = s.splash && s.splash.active;
    var blocked = !!(ad || s._privacyOpen || display.achievements || ui.tutorialShowing || ui.logOpen);
    if (s._privacyOpen) onPageExpose('privacy');
    else if (display.achievements) onPageExpose('achievements');
    else if (ui.tutorialShowing) onPageExpose('tutorial');
    else if (ui.logOpen) onPageExpose('chapter_panel');
    if (home) {
      context('', false);
      if (!blocked) { onPageExpose('chapter_home'); onPageExpose('splash'); }
      return;
    }
    var ep = s._activeChapter || s.ep || chapter;
    if (s.chapterTransition) {
      context(ep, false);
      if (!blocked) {
        onPageExpose('chapter_transition');
        event('preview_view:' + s.chapterTransition.to.id, { chapter_id: s.chapterTransition.to.id, from_chapter: s.chapterTransition.from.id });
      }
      return;
    }
    var id = s.curId, n = getNode(id);
    if (id === '__be__') { id = (s.endInfo || {}).fromId || s.beSourceFromId; n = getNode(id); }
    if (id === '__end__') { id = (s.endPageInfo || {}).fromId; n = getNode(id); }
    var ready = !!n;
    if (ready && !n.options && s.curId.slice(0, 2) !== '__' && n.media) {
      if (n.media.kind === 'video') ready = !!s.videoStarted && !s.videoLoading;
      if (n.media.kind === 'image') ready = !!s.mediaImg && !s.mediaImgLoading && s._telemetryImageReadyKey === s.mediaImgKey;
    }
    if (n && n.options) ready = (s.hitZones || []).some(function (z) { return /^choose:\d+$/.test(z.action || '') && (!display.height || Math.min(display.height, z.y + z.h) - Math.max(0, z.y) >= z.h * .5); });
    var viewable = ready && !blocked;
    context(ep, viewable && !ui.paused && s.curId !== '__be__' && s.curId !== '__end__');
    if (!viewable) return;
    var dim = { chapter_id: ep, node_id: id, content_ep: n.ep || '', node_type: n.type || 'story' };
    event('chapter_ready:' + ep, { chapter_id: ep });
    event('node_view:' + id, dim);
    legacy('FIRST_NODE_ENTER', dim); legacy('FIRST_EP_ENTER', dim);
    if (!visited[id]) { visited[id] = true; nodeCount++; }
    [10, 30, 60, 100].forEach(function (v) { if (nodeCount >= v) legacy('REACH_' + v + '_NODES'); });
    if (s.curId === '__be__') onPageExpose('be_overlay');
    else if (s.curId === '__end__') { onPageExpose('end_page'); event('chapter_complete:' + ep, dim); }
    else onPageExpose(n.type === 'choice' ? 'game_choice' : 'game_story');
    if (n.options) {
      (s.hitZones || []).forEach(function (z) {
        if (!/^choose:\d+$/.test(z.action || '')) return;
        if (display.height && (Math.min(display.height, z.y + z.h) - Math.max(0, z.y)) < z.h * .5) return;
        var idx = Number(z.action.split(':')[1]), opt = n.options[idx]; if (!opt) return;
        var d = optionDim(id, n.ep, idx, opt);
        event('option_view:' + d.option_id, d); legacy('FIRST_CHOICE_SHOW');
        if (d.requires_ad === '1') legacy('AD_ENTRY_EXPOSED', d);
      });
    }
    lastNode = id;
  }
  function optionDim(id, ep, idx, opt) {
    return { chapter_id: chapter || ep, content_ep: ep, node_id: id,
      option_id: opt.id || (M.optionIds[id] || [])[idx], opt_idx: idx,
      configured_ad: opt.ad ? '1' : '0', requires_ad: opt.ad && !opt._adUnlocked && !bypass() ? '1' : '0' };
  }
  function onChoiceClick(id, ep, idx, opt) {
    var d = optionDim(id, ep, idx, opt);
    event('option_click:' + d.option_id, d); event('node_first_choice:' + id, d);
    legacy('FIRST_CHOICE_CLICK', d); legacy(opt.ad ? 'BTN_CHOICE_AD' : 'BTN_CHOICE_NORMAL', d);
  }
  function onChoiceCommit(id, ep, idx, opt) {
    var d = optionDim(id, ep, idx, opt);
    event('option_commit:' + d.option_id, d); event('node_first_commit:' + id, d);
    pause('choice_commit');
  }
  function onButtonClick(id) {
    var m = { btn_splash_start: 'BTN_SPLASH_START', btn_chapter_open: 'BTN_CHAPTER_OPEN', btn_chapter_jump: 'BTN_CHAPTER_JUMP' };
    if (m[id]) legacy(m[id], { button_id: id });
  }
  function onAdClick(source, extra) { pause('ad_request'); if (!bypass()) legacy('AD_ENTRY_CLICKED', { ad_source: source }); }
  function onAdResult(source, result) {
    if (bypass()) return;
    legacy(result === 'ok' ? 'AD_SHOW_OK' : 'AD_SHOW_FAIL', { ad_source: source });
    if (result === 'ok') { legacy('AD_REWARD_GRANTED'); if (++adCount >= 3) legacy('AD_REPEAT_3'); }
  }
  function startSession(source) { pause('chapter_entry'); entry = source || 'chapter'; }
  function onChapterEnter(ep, source) {
    startSession(source); chapter = ep;
    event('chapter_enter:' + ep, { chapter_id: ep });
    legacy(ep + '_ENTER', { chapter_id: ep });
  }
  function tick() {
    settle(); if (pendingMs >= 30000) flush('interval');
    [60, 180, 300, 600, 1200, 1800].forEach(function (sec) {
      if (totalMs >= sec * 1000) legacy('PLAY_' + (sec / 60) + 'MIN');
    });
  }
  if (typeof ks !== 'undefined') { if (ks.onHide) ks.onHide(onHide); if (ks.onShow) ks.onShow(onShow); }
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', function () { if (document.hidden) onHide(); else onShow(); });
  if (global.addEventListener) global.addEventListener('pagehide', onHide);
  global._telHeartbeat = setInterval(tick, 1000);
  function noop() {}
  global.Telemetry = {
    VERSION: VERSION, SC: SC, scene: scene, event: event, pause: pause, sceneFlush: flush,
    sceneReported: function (id) { return !!sent[id]; }, canReportScene: function () { return !!(global.KwaiDataAnalysis && global.KwaiDataAnalysis.reportScene); },
    track: function (name, data) { if (debug) console.log('[Telemetry diagnostic only]', name, data); },
    startSession: startSession, onChapterEnter: onChapterEnter, onRenderTick: onRenderTick,
    onPageExpose: onPageExpose, onButtonClick: onButtonClick, onBtnClick: onButtonClick,
    onChoiceClick: onChoiceClick, onChoiceCommit: onChoiceCommit, onAdClick: onAdClick, onAdResult: onAdResult,
    onBEReached: function () { legacy('FIRST_BE_REACHED'); }, onEndPage: function () { flush('end'); },
    onNarr: noop, onAssetLoad: function (kind, key, ok) { if (!ok && diagnostics.length < 100) diagnostics.push('asset:' + kind + ':' + String(key).slice(-70)); }, markRestart: function () { pause('restart'); },
    drawDebugOverlay: function (ctx) { if (!overlay) return; ctx.save(); ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText('Scene ' + Object.keys(sent).length + ' / duration ' + slot + '/256', 12, 20); ctx.restore(); },
    setEnabled: function (v) { pause('enabled_change'); enabled = !!v; }, setSceneEnabled: function (v) { pause('enabled_change'); enabled = !!v; },
    setDebugOverlay: function (v) { overlay = !!v; }, setDebugConsole: function (v) { debug = !!v; }, isEnabled: function () { return enabled; },
    diagnostics: function () { return { bootId: boot, durationSlots: slot, errors: diagnostics.slice(), reports: JSON.parse(JSON.stringify(sent)) }; }
  };
  legacy('JS_START');
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
