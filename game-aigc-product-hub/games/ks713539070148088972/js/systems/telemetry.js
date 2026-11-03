/**
 * systems/telemetry.js — 埋点体系（Tele + Analytics）
 * 职责：
 *   - ks.reportScene 封装（防重 + dimension 校验 + 序列化长度限制）
 *   - M3.Analytics：本地会话统计分片上报
 *   - ks.onHide flushAll 防杀进程丢失
 * 依赖：CONFIG, Storage
 * 导出：Telemetry, Analytics
 */
(function () {
  'use strict';

  var _reported = {};   // sceneId 7001~7049 本地防重

  // ── 基础上报 ──────────────────────────────────────────────────────────────────
  var Telemetry = window.Telemetry = {

    /**
     * 上报场景里程碑事件
     * @param {number} sceneId
     * @param {object} [dimensions]  dimension key→value（必须非空字符串）
     * @param {object} [metrics]     metric key→数字
     */
    report: function (sceneId, dimensions, metrics) {
      // 7001~7049 防重
      if (sceneId >= 7001 && sceneId <= 7049) {
        if (_reported[sceneId]) return;
        _reported[sceneId] = true;
      }

      var dim = {};
      if (dimensions) {
        Object.keys(dimensions).forEach(function (k) {
          var v = dimensions[k];
          if (v !== null && v !== undefined) dim[k] = String(v);
        });
      }
      // 必须有至少一个 dimension
      if (Object.keys(dim).length === 0) dim['_'] = '1';

      var met = {};
      if (metrics) {
        Object.keys(metrics).forEach(function (k) {
          var v = Number(metrics[k]);
          if (!isNaN(v)) met[k] = v;
        });
      }

      // 序列化长度限制 ≤1024
      var payload = JSON.stringify({ dimension: dim, metric: met });
      if (payload.length > 1024) {
        console.warn('[Tele] payload too long, trimming', sceneId);
        return;
      }

      if (typeof ks !== 'undefined' && ks.reportScene) {
        try {
          ks.reportScene({ sceneId: sceneId, dimension: dim, metric: met });
        } catch(e) {
          // 客户端 < 13.5.40 自动 no-op
        }
      }
    },

    // 快捷方法（常用事件）
    jsStart:        function (isCold) { this.report(7001, { entry: isCold ? 'cold' : 'warm' }); },
    welcomeShown:   function ()       { this.report(7002, { _: '1' }); },
    homeReady:      function ()       { this.report(7003, { _: '1' }); },
    firstLevelEnter:function ()       { this.report(7004, { _: '1' }); },
    sceneImgLoaded: function (type)   { this.report(7005, { imgSrc: type }); },
    mercyTriggered: function (lvIdx)  { this.report(7016, { levelIdx: String(lvIdx) }); },
    openSettings:   function ()       { this.report(7014, { _: '1' }); },

    levelEnter: function (lv, isRetry) {
      this.report(7050, {
        levelIdx:   String(lv.idx),
        themeId:    String(lv.themeId),
        levelTitle: lv.title || '',
        mode:       lv.mode || '',
        isRetry:    isRetry ? '1' : '0'
      });
    },
    levelExit: function (lv, result, costMs) {
      this.report(7051, { result: result, levelIdx: String(lv.idx) }, { costTime: costMs });
    },

    buttonClick: function (btnId, extra) {
      var dim = Object.assign({ btnId: btnId }, extra || {});
      this.report(7053, dim);
    },

    adEntryExposed: function (slot) { this.report(7020, { slot: slot }); },
    adEntryClicked: function (slot) { this.report(7021, { slot: slot }); }
  };

  // ── Analytics（D 组：会话累计统计）──────────────────────────────────────────
  var _screens  = {};   // { sceneName: { pv, ms, lastEnter } }
  var _buttons  = {};   // { btnId: count }
  var _levels   = {};   // { idx: { enter,win,lose,ms,wrong,hint,found,best } }
  var _startMs  = M3._now();

  // 30s 持久化防杀进程
  var _saveTimer = null;
  function scheduleSave() {
    if (_saveTimer) return;
    _saveTimer = setTimeout(function () {
      _saveTimer = null;
      Storage.set(CONFIG.STORAGE_KEYS.analyticsBuffer, {
        screens: _screens, buttons: _buttons, levels: _levels
      });
    }, 30000);
  }

  var Analytics = window.Analytics = {

    trackScreen: function (name) {
      if (!_screens[name]) _screens[name] = { pv: 0, ms: 0 };
      _screens[name].pv++;
      _screens[name].lastEnter = M3._now();
      scheduleSave();
    },

    leaveScreen: function (name) {
      var s = _screens[name];
      if (s && s.lastEnter) {
        s.ms += M3._now() - s.lastEnter;
        s.lastEnter = null;
      }
      scheduleSave();
    },

    trackButton: function (btnId) {
      _buttons[btnId] = (_buttons[btnId] || 0) + 1;
      scheduleSave();
    },

    trackLevelEvent: function (idx, event, val) {
      if (!_levels[idx]) _levels[idx] = { enter:0,win:0,lose:0,ms:0,wrong:0,hint:0,found:0,best:0 };
      _levels[idx][event] = (_levels[idx][event] || 0) + (val || 1);
      scheduleSave();
    },

    /**
     * 分片上报全部积累数据（onHide 时调用）。
     * 修复说明：此前只上报了一条汇总事件（7030：totalMs/totalPv/totalClicks），
     * _screens/_buttons/_levels 里的明细数据只用来算汇总数字，本身从未真正上报，
     * 与函数名/注释宣称的"分片上报全部积累数据"不符——单条 report() 有 1024 字符
     * 序列化长度限制，塞不下全部明细，所以真正的分片策略是"一个 item 一条 report()"：
     * 每个 screen/button/level 各自独立上报一条事件，天然受 report() 内置的长度
     * 校验保护，不会因为某一项异常大而拖垮整批。
     *
     * sceneId 选择 7054~7057（而非继续用落在 7001~7049 的 7030）：report() 对
     * 7001~7049 区间做的是「按 sceneId 去重，一个session只报一次」，适合 jsStart/
     * welcomeShown 这类一次性里程碑事件；但 flushAll 本身可能在一次 session 里被
     * 多次触发（切后台不代表进程被杀），且每次要为多个不同的 screen/button/level
     * 各报一条，若继续复用 7001~7049 区间的 sceneId，同一 sceneId 的第 2 条起会被
     * 去重逻辑直接吞掉（这是排查此前"汇总事件也只报一次"疑点时发现的关联 bug）。
     *
     * 同时：上报后必须清空内存里的 _screens/_buttons/_levels，否则下次 onHide
     * 会把旧数据重复计入汇总。
     */
    flushAll: function (reason) {
      var totalMs = M3._now() - _startMs;
      var totalPv = 0, totalClicks = 0;
      Object.keys(_screens).forEach(function (k) { totalPv += _screens[k].pv; });
      Object.keys(_buttons).forEach(function (k) { totalClicks += _buttons[k]; });

      Telemetry.report(7054, { reason: reason || 'flush' }, {
        totalMs: totalMs, totalPv: totalPv, totalClicks: totalClicks
      });

      // 分片上报：每个 screen 一条
      Object.keys(_screens).forEach(function (name) {
        var s = _screens[name];
        Telemetry.report(7055, { screen: name }, { pv: s.pv, ms: s.ms });
      });

      // 分片上报：每个 button 一条
      Object.keys(_buttons).forEach(function (btnId) {
        Telemetry.report(7056, { btnId: btnId }, { clicks: _buttons[btnId] });
      });

      // 分片上报：每个 level 一条
      Object.keys(_levels).forEach(function (idx) {
        var lv = _levels[idx];
        Telemetry.report(7057, { levelIdx: idx }, {
          enter: lv.enter, win: lv.win, lose: lv.lose, ms: lv.ms,
          wrong: lv.wrong, hint: lv.hint, found: lv.found, best: lv.best
        });
      });

      // 清空内存缓冲（避免下次 onHide 重复计入本次已上报的数据）+ 清空本地持久化
      _screens = {};
      _buttons = {};
      _levels  = {};
      _startMs = M3._now();
      Storage.remove(CONFIG.STORAGE_KEYS.analyticsBuffer);
    }
  };

  // ks.onHide 时 flush
  if (typeof ks !== 'undefined' && ks.onHide) {
    ks.onHide(function () { Analytics.flushAll('onHide'); });
  }
})();
