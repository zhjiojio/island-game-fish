/**
 * 老铁眼真尖 · 远程关卡配置动态下发（level-loader）
 * ─────────────────────────────────────────────────────────
 * 目标：
 *   1. 每次启动强制拉取最新 JSON（cache-buster ?_t + no-cache 头）
 *   2. **忽略本地缓存**（不落盘 ks.setStorageSync，避免上一次的旧配置污染）
 *   3. 3s 超时 · 失败静默 fallback 到 levels.js baseline（绝不能挂网导致打不开）
 *   4. 远程 JSON 权威覆盖 M3.THEMES / M3.LEVELS / M3.PROPS / M3.LAOTIE_LINES
 *   5. 支持 hiddenIdxRanges 运行时隐藏（替代 levels.js 尾部 filter 硬编码）
 *
 * 加载顺序（index.html）：
 *   levels.js（baseline）→ level-loader.js（拉取覆盖）→ welcome.js（等待就绪）
 *
 * 就绪回调：
 *   M3.remoteLevelsReady(function(){ ... })   // 无论成功失败都会回调
 *
 * 状态查询：
 *   M3.remoteLevelsStatus   // 'pending' | 'success' | 'timeout' | 'error'
 *   M3.remoteLevelsVersion  // 远程 JSON 的 version 字段（成功时）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  // ─── 配置 ─────────────────────────────────────────
  // 精确文件 URL；禁止再拼接文件名，否则会请求 levels-config.jsonlevels-config.json。
  var CDN_BASE = 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config-v3.json';
  var REMOTE_URL = CDN_BASE;
  var TIMEOUT_MS = 3000;   // 3 秒兜底
  var DEBUG      = true;   // 上线可关

  // ⭐ 主题解锁策略「本地覆盖表」（代码权威 · 覆盖远程 JSON 的 unlockBy/unlocked/dailyUnlock）
  //   背景：主题解锁方式原本只能在 laotie-editor 后台改，改完还要重新导出上传 CDN JSON。
  //         这里加一层代码侧覆盖，让解锁策略与包版本绑定，改代码 + build 即生效。
  //   规则：key = themeId，value = 要强制写入该主题的字段。
  //   现行策略（2026-09-02）：
  //     · 2917 重回 80 年代 → 首页直接进（free），但关卡内第4关起需看激励视频（freeCount=3）
  //     · 2797 后宫眼真尖   → 每天看 1 个激励视频解锁整个主题
  //     · 2744 谁是第三者   → 每天看 1 个激励视频解锁整个主题
  var THEME_UNLOCK_OVERRIDE = {
    2917: { unlocked: true,  unlockBy: 'free',       dailyUnlock: false },
    2797: { unlocked: false, unlockBy: 'rewardedAd', dailyUnlock: true  },
    2744: { unlocked: false, unlockBy: 'rewardedAd', dailyUnlock: true  }
  };

  function _log(){
    if (!DEBUG) return;
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[level-loader]');
      console.log.apply(console, args);
    } catch(e){}
  }

  // ─── baseline 备份（防止部分覆盖失败后 M3.LEVELS 变半截）─────
  M3._levelsBaseline = {
    THEMES:       (M3.THEMES || []).slice(),
    LEVELS:       (M3.LEVELS || []).slice(),
    PROPS:        _deepClone(M3.PROPS || {}),
    LAOTIE_LINES: (M3.LAOTIE_LINES || []).slice()
  };

  function _deepClone(o){
    try { return JSON.parse(JSON.stringify(o)); } catch(e){ return o; }
  }

  // ─── 状态机 ────────────────────────────────────────
  M3.remoteLevelsStatus  = 'pending';
  M3.remoteLevelsVersion = null;
  M3.remoteLevelsError   = null;
  var _readyCbs = [];
  var _resolved = false;

  function _resolve(){
    if (_resolved) return;
    _resolved = true;
    var cbs = _readyCbs.slice(); _readyCbs.length = 0;
    for (var i=0;i<cbs.length;i++){
      try { cbs[i](); } catch(e){ _log('cb err', e); }
    }
  }

  M3.remoteLevelsReady = function(cb){
    if (typeof cb !== 'function') return;
    if (_resolved){ try { cb(); } catch(e){} return; }
    _readyCbs.push(cb);
  };

  // ─── 应用远程 JSON ─────────────────────────────────
  function _applyRemote(data){
    if (!data || typeof data !== 'object') throw new Error('empty payload');

    // 每一项都独立校验，缺失就用 baseline 兜底（增量下发友好）
    if (Array.isArray(data.themes) && data.themes.length){
      M3.THEMES = data.themes;
      // ⭐ v1.2.4 本地 scenes/covers/* 和 scenes/hidden/* 已全部删除，cover/scene 统一走 CDN URL。
      //   远程 JSON 的 cover 字段必为 http 开头的 CDN 地址；若编辑器误下发本地相对路径，这里兜底删除避免 404。
      try {
        for (var _ci=0; _ci<M3.THEMES.length; _ci++){
          var _ct = M3.THEMES[_ci];
          if (!_ct) continue;
          if (_ct.cover && typeof _ct.cover === 'string' && _ct.cover.indexOf('http') !== 0)      delete _ct.cover;
          if (_ct.cover_full && typeof _ct.cover_full === 'string' && _ct.cover_full.indexOf('http') !== 0) delete _ct.cover_full;
        }
      } catch(_e){ _log('themes cover patch err', _e); }

      // ⭐ 应用主题解锁策略本地覆盖（代码 > 远程 JSON）
      try {
        for (var _ui=0; _ui<M3.THEMES.length; _ui++){
          var _ut = M3.THEMES[_ui];
          if (!_ut || _ut.id == null) continue;
          var _ov = THEME_UNLOCK_OVERRIDE[_ut.id];
          if (!_ov) continue;
          for (var _k in _ov){
            if (Object.prototype.hasOwnProperty.call(_ov, _k)) _ut[_k] = _ov[_k];
          }
          _log('unlock override id=' + _ut.id + ' → ' + _ut.unlockBy + ' daily=' + _ut.dailyUnlock);
        }
      } catch(_e){ _log('unlock override err', _e); }
    }
    if (Array.isArray(data.levels) && data.levels.length){
      // 单一远程 JSON 是关卡数据与开场弹窗文案的权威来源。
      // 本地 levels.js 只在请求失败、超时或 JSON 非法时整体兜底。
      M3.LEVELS = data.levels;
    }
    if (data.props && typeof data.props === 'object' && !Array.isArray(data.props)){
      M3.PROPS = data.props;
    }
    if (Array.isArray(data.laotieLines) && data.laotieLines.length){
      M3.LAOTIE_LINES = data.laotieLines;
    }

    // hiddenIdxRanges: [[start,end], ...] 运行时过滤
    if (Array.isArray(data.hiddenIdxRanges)){
      for (var i=0;i<data.hiddenIdxRanges.length;i++){
        var r = data.hiddenIdxRanges[i];
        if (!r || r.length < 2) continue;
        var lo = r[0], hi = r[1];
        M3.LEVELS = M3.LEVELS.filter(function(l){ return !(l.idx >= lo && l.idx <= hi); });
      }
    }

    M3.remoteLevelsVersion = data.version || null;
    return true;
  }

  function _rollbackBaseline(){
    M3.THEMES       = M3._levelsBaseline.THEMES.slice();
    M3.LEVELS       = M3._levelsBaseline.LEVELS.slice();
    M3.PROPS        = _deepClone(M3._levelsBaseline.PROPS);
    M3.LAOTIE_LINES = M3._levelsBaseline.LAOTIE_LINES.slice();
  }

  // ─── 网络层（ks.request 优先 · fetch 兜底）─────────
  function _fetch(url, cb){
    var timer = null;
    function _done(err, data){
      if (timer){ clearTimeout(timer); timer = null; }
      cb(err, data);
    }

    // 快手小游戏原生请求
    if (typeof ks !== 'undefined' && ks.request){
      timer = setTimeout(function(){ _done('timeout'); }, TIMEOUT_MS);
      try {
        ks.request({
          url: url,
          method: 'GET',
          timeout: TIMEOUT_MS,
          header: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          },
          dataType: 'json',
          success: function(res){
            if (!timer) return; // 已超时
            if (res && res.statusCode >= 200 && res.statusCode < 300){
              _done(null, res.data);
            } else {
              _done('http_' + (res && res.statusCode));
            }
          },
          fail: function(err){
            if (!timer) return;
            _done('fail_' + ((err && err.errMsg) || 'unknown'));
          }
        });
      } catch(e){
        _done('req_ex_' + (e && e.message));
      }
      return;
    }

    // H5 fetch 兜底
    if (typeof fetch === 'function'){
      var ctrl = null;
      try { ctrl = new AbortController(); } catch(_){}
      timer = setTimeout(function(){
        try { ctrl && ctrl.abort(); } catch(_){}
        _done('timeout');
      }, TIMEOUT_MS);
      fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: ctrl && ctrl.signal,
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      })
      .then(function(r){
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
      })
      .then(function(d){ _done(null, d); })
      .catch(function(e){ _done('fetch_' + (e && e.message ? e.message : String(e))); });
      return;
    }

    _done('no_network_api');
  }

  // ─── 入口 ─────────────────────────────────────────
  M3.loadRemoteLevels = function(onDone){
    onDone = onDone || function(){};
    // 强制刷新：cache-buster + 每次请求都是新 URL
    var url = REMOTE_URL + '?_t=' + Date.now();
    _log('fetch', url);
    _fetch(url, function(err, data){
      if (err){
        M3.remoteLevelsStatus = (err === 'timeout') ? 'timeout' : 'error';
        M3.remoteLevelsError  = err;
        _log('FAIL, use local baseline. reason=' + err);
        _resolve();
        onDone(false, err);
        return;
      }
      try {
        _applyRemote(data);
        M3.remoteLevelsStatus = 'success';
        _log('OK v=' + M3.remoteLevelsVersion + ' themes=' + (M3.THEMES||[]).length + ' levels=' + (M3.LEVELS||[]).length);
        // ⭐ debug: 打印每个主题的 freeCount，方便验证 JSON 是否下发正确
        try {
          (M3.THEMES||[]).forEach(function(t){
            _log('THEME id=' + t.id + ' "' + t.subject + '" freeCount=' + (t.freeCount||'未设') + ' unlockBy=' + (t.unlockBy||'free'));
          });
        } catch(_e){}
        _resolve();
        onDone(true, null);
      } catch(e){
        M3.remoteLevelsStatus = 'error';
        M3.remoteLevelsError  = e && e.message;
        _rollbackBaseline();
        _log('APPLY FAIL, rollback baseline. reason=' + (e && e.message));
        _resolve();
        onDone(false, String(e && e.message));
      }
    });
  };

  // 立即触发（页面加载即拉，与首屏 loading 并行）
  M3.loadRemoteLevels();
})();
