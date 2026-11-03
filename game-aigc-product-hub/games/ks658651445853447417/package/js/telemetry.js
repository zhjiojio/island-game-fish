// ═════════════════════════════════════════════════════════════════════════
// telemetry.js — 老铁眼真尖 埋点上报（ks.reportScene 封装）
// ═════════════════════════════════════════════════════════════════════════
// 【目的】针对 2026-08-14 数据分析出的 3 大薄弱环节做里程碑埋点：
//   💥💥 广告触点密度（人均 0.36 vs 对手 3.37，差 9.4x）
//   💥   激励广告渗透率（11.2% vs 53.4%，差 4.8x）
//   💥   人均停留时长（2.5min vs 6.1min，差 2.44x）
//   ✅   下发→曝光转化率（94.5% 健康）
//
// 【API 关键约束】
//   1. 每个 sceneId 一次启动只能上报一次（重复报错）→ 用里程碑事件设计
//   2. dimension 必须是非空 string
//   3. metric 必须是可 parse 为数字的 string
//   4. dimension/metric 序列化后 ≤1024 字符
//   5. Android/iOS <13.5.40 无 ks.reportScene → 自动降级 no-op
//
// 【场景 ID 分配】
//   A 组·启动加载漏斗（7001-7005）：诊断 loading 卡 52% / 首屏流失
//   B 组·时长留存漏斗（7010-7016）：诊断时长短 / 卡关点 / 内容认知度
//   C 组·广告漏斗   （7020-7024）：诊断广告触点密度 / 渗透率短板
//
// 【重要提醒】
//   所有 sceneId + dimension key + metric key 都需要在
//   「快手小程序管理后台 > 数据分析 > 埋点管理」预先注册，否则上报会报 20001。
// ═════════════════════════════════════════════════════════════════════════
(function(global){
  var M3 = global.M3 = global.M3 || {};

  // ─── 场景 ID 常量 ───────────────────────────────────────────────────────
  var SC = {
    // A 组·启动加载漏斗
    JS_START:            7001, // JS 首次执行（锚点）
    WELCOME_SHOWN:       7002, // 欢迎页首帧绘制完（loading 结束）
    HOME_READY:          7003, // 首页可点击就绪
    FIRST_LEVEL_ENTER:   7004, // 首次进入任一关卡
    SCENE_IMG_LOADED:    7005, // 关卡场景图加载完成（CDN vs 本地对比）
    // B 组·时长留存漏斗
    FIRST_LEVEL_END:     7010, // 首关结束（win/lose/quit）
    REACH_3_LEVELS:      7011, // 累计通过 3 关
    REACH_5_LEVELS:      7012, // 累计通过 5 关
    REACH_10_LEVELS:     7013, // 累计通过 10 关（重度用户）
    OPEN_SETTINGS:       7014, // 打开设置面板（探索深度）
    SEE_HIDDEN_ENTRY:    7015, // 看到隐藏关入口
    MERCY_TRIGGERED:     7016, // 触发仁慈机制（连败）
    // C 组·广告漏斗
    AD_ENTRY_EXPOSED:    7020, // 广告入口首次曝光
    AD_ENTRY_CLICKED:    7021, // 广告入口首次被点击
    AD_LOAD_OK:          7022, // 广告下发成功（load ok）
    AD_SHOW_END:         7023, // 广告完整曝光（真实收入产生）
    AD_REWARD_GRANTED:   7024, // 奖励发放到位
    // D 组·会话行为分析（v1.0.74 新增）— 分片聚合上报
    SESSION_SUMMARY:     7030, // 会话总览：总时长/总点击/总关卡数/总PV
    SCREEN_STATS_P1:     7031, // 屏幕 PV/停留时长 分片1
    SCREEN_STATS_P2:     7032, // 屏幕 PV/停留时长 分片2
    BUTTON_STATS_P1:     7033, // 按钮点击 分片1
    BUTTON_STATS_P2:     7034, // 按钮点击 分片2
    LEVEL_STATS_P1:      7040, // 关卡数据 分片1（关卡1-10）
    LEVEL_STATS_P2:      7041, // 关卡数据 分片2（关卡11-20）
    LEVEL_STATS_P3:      7042, // 关卡数据 分片3（关卡21-30）
    LEVEL_STATS_P4:      7043, // 关卡数据 分片4（关卡31-40）
    LEVEL_STATS_P5:      7044, // 关卡数据 分片5（关卡41-50）
    LEVEL_STATS_P6:      7045, // 关卡数据 分片6（关卡51-60）
    LEVEL_STATS_P7:      7046, // 关卡数据 分片7（关卡61-70）
    LEVEL_STATS_P8:      7047, // 关卡数据 分片8（关卡71-80）
    LEVEL_STATS_P9:      7048, // 关卡数据 分片9（关卡81-90）
    LEVEL_STATS_P10:     7049, // 关卡数据 分片10（关卡91-110）
    // E 组·关卡实时事件（v1.3.1 新增）—— 精确进出时间
    LEVEL_ENTER:         7050, // 进入关卡（含 themeId/levelIdx/isRetry 维度）
    LEVEL_EXIT:          7051, // 离开关卡（costTime=精确停留ms / result=win|lose|back）
    // F 组·按钮实时事件（v1.3.1 新增）—— 统一按钮点击 + 广告来源
    BUTTON_EXPOSE:       7052, // 按钮曝光（暂保留，本期先上 BUTTON_CLICK）
    BUTTON_CLICK:        7053  // 按钮点击（btnId/location/levelIdx/themeId/isAd/adSlot）
  };

  var _reported = {};              // 本地防重复上报
  var _t0 = Date.now();            // 启动锚点时间
  var _levelWinCnt = 0;            // 累计通关数（本次启动内）

  // 环境探测：ks.reportScene 是否可用
  var _canReport = (typeof ks !== 'undefined') && (typeof ks.reportScene === 'function');

  function _strDim(obj){
    if (!obj) return undefined;
    var o = {}, has = false;
    for (var k in obj){
      var v = obj[k];
      if (v === null || v === undefined || v === '') continue;
      o[k] = String(v);
      has = true;
    }
    return has ? o : undefined;
  }
  function _strMetric(obj){
    if (!obj) return undefined;
    var o = {}, has = false;
    for (var k in obj){
      var v = obj[k];
      if (v === null || v === undefined) continue;
      var n = Number(v);
      if (isNaN(n)) continue;   // metric 必须能 parse 为数字
      o[k] = String(n);
      has = true;
    }
    return has ? o : undefined;
  }

  /**
   * 上报场景
   * @param {number} sceneId
   * @param {object} [opts] { costTime, dimension, metric, sinceStart }
   *        sinceStart=true 时 costTime 自动取 Date.now()-_t0
   */
  function report(sceneId, opts){
    // E/F 组（7050+）为实时可重复上报事件，不防重
    var _canRepeat = (sceneId >= 7050);
    if (!_canRepeat && _reported[sceneId]) return;  // 已报过（SDK 也会拦，但本地先挡一层）
    if (!_canRepeat) _reported[sceneId] = 1;
    if (!_canReport) return;
    opts = opts || {};
    var costTime = opts.costTime;
    if (opts.sinceStart) costTime = Date.now() - _t0;
    var payload = {
      sceneId: sceneId,
      costTime: Math.max(0, costTime | 0),
      dimension: _strDim(opts.dimension),
      metric:    _strMetric(opts.metric),
      fail: function(res){
        try { console.log('[TELE FAIL]', sceneId, res && (res.errMsg || res.errCode)); } catch(_){}
      }
    };
    try {
      ks.reportScene(payload);
      console.log('[TELE OK]', sceneId, 'cost=' + payload.costTime,
                  payload.dimension ? JSON.stringify(payload.dimension) : '',
                  payload.metric ? JSON.stringify(payload.metric) : '');
    } catch(e){
      try { console.log('[TELE ERR]', sceneId, e && e.message); } catch(_){}
    }
  }

  function has(sceneId){ return !!_reported[sceneId]; }
  function elapsed(){ return Date.now() - _t0; }

  // 便捷方法：累计通关阶梯
  function onLevelWin(){
    _levelWinCnt++;
    if (_levelWinCnt === 3)  report(SC.REACH_3_LEVELS,  { sinceStart:true });
    if (_levelWinCnt === 5)  report(SC.REACH_5_LEVELS,  { sinceStart:true });
    if (_levelWinCnt === 10) report(SC.REACH_10_LEVELS, { sinceStart:true, metric:{ totalMs: elapsed() } });
  }

  // ─── 挂载 ──────────────────────────────────────────────────────────────
  M3.Tele = {
    report:     report,
    has:        has,
    elapsed:    elapsed,
    onLevelWin: onLevelWin,
    SC:         SC,
    canReport:  _canReport
  };

  // ═════════════════════════════════════════════════════════════════════
  // M3.Analytics — v1.0.74 会话行为分析（本地聚合 + 分片上报）
  // ═════════════════════════════════════════════════════════════════════
  // 【设计】ks.reportScene 每次启动同 sceneId 只能报一次 → 用本地累加器
  //   全程记录 screens/buttons/levels，会话结束/onHide/兜底时机分片上报
  // 【存储】ks.storage 持久化，防止杀进程数据丢失，下次启动补传
  // ─────────────────────────────────────────────────────────────────────
  var STORAGE_KEY = '__analytics_buffer__';
  var _screens = {};   // { screenName: {pv:N, ms:total_stay_ms} }
  var _buttons = {};   // { buttonName: clickCount }
  var _levels  = {};   // { levelIdx: {enter:N, win:N, lose:N, ms:sum_ms, wrong:sum, hint:sum, foundCnt:sum, best_ms} }
  var _sessionStart = Date.now();
  var _curScreen = null;
  var _curScreenTs = 0;
  var _reportedSummary = false; // 本次启动是否已上报过 summary（sceneId 单次限制）

  // ── 存储读写 ──────────────────────────────────────────
  function _storageGet(k){
    try {
      if (_canReport && typeof ks !== 'undefined' && ks.getStorageSync) return ks.getStorageSync(k);
      if (typeof localStorage !== 'undefined') return localStorage.getItem(k);
    } catch(_){}
    return null;
  }
  function _storageSet(k, v){
    try {
      if (_canReport && typeof ks !== 'undefined' && ks.setStorageSync) ks.setStorageSync(k, v);
      else if (typeof localStorage !== 'undefined') localStorage.setItem(k, v);
    } catch(_){}
  }

  // ── 屏幕曝光 & 停留时长 ───────────────────────────────
  function screenEnter(name){
    if (!name) return;
    var now = Date.now();
    // 先关闭上一个屏
    if (_curScreen && _curScreen !== name){
      var stay = now - _curScreenTs;
      _screens[_curScreen] = _screens[_curScreen] || { pv:0, ms:0 };
      _screens[_curScreen].ms += stay;
    }
    _screens[name] = _screens[name] || { pv:0, ms:0 };
    _screens[name].pv++;
    _curScreen = name;
    _curScreenTs = now;
  }
  function screenLeave(){
    if (!_curScreen) return;
    var stay = Date.now() - _curScreenTs;
    _screens[_curScreen] = _screens[_curScreen] || { pv:0, ms:0 };
    _screens[_curScreen].ms += stay;
    _curScreen = null;
  }

  // ── 按钮点击 ──────────────────────────────────────────
  function buttonClick(name){
    if (!name) return;
    _buttons[name] = (_buttons[name] || 0) + 1;
  }

  // ── 关卡维度 ──────────────────────────────────────────
  var _levelActive = null; // { idx, ts, wrong, hint, foundCnt }
  function levelStart(idx){
    _levelActive = { idx: idx|0, ts: Date.now(), wrong:0, hint:0, foundCnt:0 };
    _levels[idx] = _levels[idx] || { enter:0, win:0, lose:0, ms:0, wrong:0, hint:0, foundCnt:0, best:0 };
    _levels[idx].enter++;
  }
  function levelWrong(){ if (_levelActive) _levelActive.wrong++; }
  function levelHint(){ if (_levelActive) _levelActive.hint = 1; }
  function levelFound(cnt){ if (_levelActive) _levelActive.foundCnt = cnt|0; }
  function levelEnd(result){
    if (!_levelActive) return;
    var la = _levelActive;
    var dur = Date.now() - la.ts;
    var lv = _levels[la.idx] = _levels[la.idx] || { enter:1, win:0, lose:0, ms:0, wrong:0, hint:0, foundCnt:0, best:0 };
    if (result === 'win')  lv.win++;
    if (result === 'lose') lv.lose++;
    lv.ms += dur;
    lv.wrong += la.wrong;
    lv.hint += la.hint;
    lv.foundCnt += la.foundCnt;
    if (result === 'win' && (lv.best === 0 || dur < lv.best)) lv.best = dur;
    _levelActive = null;
  }

  // ── 持久化 ────────────────────────────────────────────
  function _persist(){
    try {
      var snap = { s:_screens, b:_buttons, l:_levels, t:_sessionStart };
      _storageSet(STORAGE_KEY, JSON.stringify(snap));
    } catch(_){}
  }

  // ── 分片上报 ──────────────────────────────────────────
  // 把 kv 打包成 metric 对象，控制序列化后长度不超过 900（留 buffer）
  function _packMetric(kv){
    var out = {}, size = 2; // "{}"
    for (var k in kv){
      var v = kv[k];
      if (v === null || v === undefined) continue;
      var n = Number(v);
      if (isNaN(n)) continue;
      var s = String(n);
      var add = (size > 2 ? 1 : 0) + k.length + s.length + 5; // "k":"v",
      if (size + add > 900) break;
      out[k] = s;
      size += add;
    }
    return out;
  }

  // 从大对象里，用 sceneId 数组分片上报
  function _reportChunks(sceneIds, buildKV) {
    var kv = buildKV();
    var keys = [];
    for (var k in kv) keys.push(k);
    if (keys.length === 0) return;
    var idx = 0;
    for (var si = 0; si < sceneIds.length && idx < keys.length; si++){
      var chunk = {};
      var size = 2;
      while (idx < keys.length){
        var k2 = keys[idx];
        var v2 = String(kv[k2]);
        var add = (size > 2 ? 1 : 0) + k2.length + v2.length + 5;
        if (size + add > 900) break;
        chunk[k2] = v2;
        size += add;
        idx++;
      }
      if (Object.keys(chunk).length){
        // 直接调 ks.reportScene（不走 report() 因为它内部会去重，这里我们要在 flushAll 时上报）
        if (_canReport){
          try {
            ks.reportScene({
              sceneId: sceneIds[si],
              costTime: 0,
              dimension: { batch: String(si+1), pkgVer: M3.BUILD_VER || 'unknown' },
              metric: chunk,
              fail: function(res){ try { console.log('[TELE FAIL]', sceneIds[si], res && (res.errMsg || res.errCode)); } catch(_){} }
            });
            console.log('[ANALYTICS OK]', sceneIds[si], Object.keys(chunk).length + ' keys');
          } catch(e){ try { console.log('[ANALYTICS ERR]', sceneIds[si], e && e.message); } catch(_){} }
        }
      }
    }
    if (idx < keys.length) console.log('[ANALYTICS WARN] ' + (keys.length - idx) + ' keys dropped (out of slots)');
  }

  // ── 一键上报所有 ─────────────────────────────────────
  function flushAll(reason){
    reason = reason || 'manual';
    screenLeave(); // 结算当前屏
    _persist();

    // 1. Session Summary
    if (!_reportedSummary && _canReport){
      _reportedSummary = true;
      try {
        var totalMs = Date.now() - _sessionStart;
        var totalClicks = 0; for (var b in _buttons) totalClicks += _buttons[b];
        var totalPv = 0, totalScreenMs = 0;
        for (var s in _screens){ totalPv += _screens[s].pv; totalScreenMs += _screens[s].ms; }
        var totalLevelEnter = 0, totalWin = 0, totalLose = 0, totalWrong = 0;
        for (var l in _levels){ totalLevelEnter += _levels[l].enter; totalWin += _levels[l].win; totalLose += _levels[l].lose; totalWrong += _levels[l].wrong; }
        ks.reportScene({
          sceneId: SC.SESSION_SUMMARY,
          costTime: totalMs,
          dimension: { reason: reason, pkgVer: M3.BUILD_VER || 'unknown' },
          metric: {
            totalMs: String(totalMs),
            totalClicks: String(totalClicks),
            totalPv: String(totalPv),
            screenMs: String(totalScreenMs),
            lvEnter: String(totalLevelEnter),
            lvWin: String(totalWin),
            lvLose: String(totalLose),
            wrongCnt: String(totalWrong)
          },
          fail:function(res){ try { console.log('[TELE FAIL] summary', res && res.errMsg); } catch(_){} }
        });
        console.log('[ANALYTICS SUMMARY]', 'totalMs=' + totalMs, 'clicks=' + totalClicks, 'lvEnter=' + totalLevelEnter);
      } catch(e){}
    }

    // 2. Screen stats（分 2 片，每片最多 ~15 屏 × 2 字段 = 30 键）
    _reportChunks([SC.SCREEN_STATS_P1, SC.SCREEN_STATS_P2], function(){
      var kv = {};
      for (var name in _screens){
        var short = String(name).substr(0, 10);
        kv[short + '_pv'] = _screens[name].pv;
        kv[short + '_ms'] = _screens[name].ms;
      }
      return kv;
    });

    // 3. Button stats（分 2 片）
    _reportChunks([SC.BUTTON_STATS_P1, SC.BUTTON_STATS_P2], function(){
      var kv = {};
      for (var name in _buttons){
        var short = String(name).substr(0, 14);
        kv[short] = _buttons[name];
      }
      return kv;
    });

    // 4. Level stats（分 10 片，每 10 关一片）
    var levelChunks = [SC.LEVEL_STATS_P1, SC.LEVEL_STATS_P2, SC.LEVEL_STATS_P3, SC.LEVEL_STATS_P4, SC.LEVEL_STATS_P5,
                       SC.LEVEL_STATS_P6, SC.LEVEL_STATS_P7, SC.LEVEL_STATS_P8, SC.LEVEL_STATS_P9, SC.LEVEL_STATS_P10];
    for (var ci = 0; ci < levelChunks.length; ci++){
      var loStart = ci * 10;
      var loEnd   = (ci === 9) ? 110 : (ci + 1) * 10; // 最后一片吃到 110
      var kv = {};
      var hasData = false;
      for (var idx = loStart; idx < loEnd; idx++){
        var lv = _levels[idx];
        if (!lv || lv.enter === 0) continue;
        hasData = true;
        var p = 'L' + idx + '_';
        kv[p+'e'] = lv.enter;
        kv[p+'w'] = lv.win;
        kv[p+'x'] = lv.lose;
        kv[p+'ms'] = lv.ms;
        kv[p+'wr'] = lv.wrong;
        kv[p+'h']  = lv.hint;
        kv[p+'b']  = lv.best;
      }
      if (!hasData || !_canReport) continue;
      try {
        var mc = _packMetric(kv);
        ks.reportScene({
          sceneId: levelChunks[ci],
          costTime: 0,
          dimension: { range: 'L' + loStart + '-L' + (loEnd - 1), pkgVer: M3.BUILD_VER || 'unknown' },
          metric: mc,
          fail:function(res){ try { console.log('[TELE FAIL] lvchunk', res && res.errMsg); } catch(_){} }
        });
        console.log('[ANALYTICS LV]', levelChunks[ci], 'L' + loStart + '-L' + (loEnd - 1), Object.keys(mc).length + ' keys');
      } catch(e){}
    }
  }

  M3.Analytics = {
    screenEnter:  screenEnter,
    screenLeave:  screenLeave,
    buttonClick:  buttonClick,
    levelStart:   levelStart,
    levelWrong:   levelWrong,
    levelHint:    levelHint,
    levelFound:   levelFound,
    levelEnd:     levelEnd,
    flushAll:     flushAll,
    persist:      _persist,
    _screens:     _screens,
    _buttons:     _buttons,
    _levels:      _levels
  };

  // ── 生命周期钩子：onHide 时上报 ──────────────────────
  try {
    if (_canReport && typeof ks !== 'undefined'){
      if (typeof ks.onHide === 'function'){
        ks.onHide(function(){
          try { console.log('[ANALYTICS] onHide -> flushAll'); flushAll('onHide'); } catch(_){}
        });
      }
      if (typeof ks.onShow === 'function'){
        ks.onShow(function(){
          try { console.log('[ANALYTICS] onShow'); } catch(_){}
        });
      }
    }
    // 90 秒兜底 flush（会话很长时防丢）
    setInterval(function(){
      try { _persist(); } catch(_){}
    }, 30000);
  } catch(_){}

  // ─── 立即打第一个锚点：JS_START ────────────────────────────────────────
  // 判断冷启/热启（简单策略：本次进程有无历史 storage 标记）
  var entry = 'cold';
  try {
    var lastBoot = null;
    if (_canReport && typeof ks !== 'undefined' && ks.getStorageSync){
      lastBoot = ks.getStorageSync('__tele_last_boot__');
    } else if (typeof localStorage !== 'undefined'){
      lastBoot = localStorage.getItem('__tele_last_boot__');
    }
    if (lastBoot && (Date.now() - Number(lastBoot) < 30 * 60 * 1000)) entry = 'warm';
    var stamp = String(Date.now());
    if (_canReport && typeof ks !== 'undefined' && ks.setStorageSync) ks.setStorageSync('__tele_last_boot__', stamp);
    else if (typeof localStorage !== 'undefined') localStorage.setItem('__tele_last_boot__', stamp);
  } catch(_){}

  report(SC.JS_START, {
    costTime: 0,
    dimension: {
      entry: entry,
      pkgVer: M3.BUILD_VER || 'unknown',
      canReport: _canReport ? 'yes' : 'no'
    }
  });

  console.log('[TELE INIT] telemetry.js loaded, canReport=' + _canReport + ', entry=' + entry);
})(typeof window !== 'undefined' ? window : this);
