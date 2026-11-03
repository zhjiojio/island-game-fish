/**
 * test/unit/telemetry.test.js — Analytics.flushAll 分片上报单测
 * 覆盖：
 *   - flushAll 应为每个 screen/button/level 各上报一条独立事件（7055/7056/7057），
 *     而不是像修复前那样只报一条汇总事件、明细数据被丢弃
 *   - flushAll 后应清空内存缓冲，避免下次 onHide 重复计入旧数据
 */
'use strict';

function loadFresh() {
  jest.resetModules();
  require('../../js/core/product.config.js');
  require('../../js/core/config.js');
  require('../../js/systems/storage.js');
  global.M3 = global.M3 || {};
  global.M3._now = function () { return Date.now(); };
  require('../../js/systems/telemetry.js');
  return { Telemetry: window.Telemetry, Analytics: window.Analytics };
}

describe('Analytics.flushAll（分片上报）', function () {
  var Telemetry, Analytics, reports;

  beforeEach(function () {
    var mods = loadFresh();
    Telemetry = mods.Telemetry;
    Analytics = mods.Analytics;
    reports = [];
    global.ks = {
      reportScene: function (payload) { reports.push(payload); }
    };
  });

  afterEach(function () {
    delete global.ks;
  });

  test('应为每个 screen 各自上报一条 7055 事件（而非只报汇总）', function () {
    Analytics.trackScreen('home');
    Analytics.trackScreen('home');
    Analytics.trackScreen('game');
    Analytics.leaveScreen('game');

    Analytics.flushAll('test');

    var screenReports = reports.filter(function (r) { return r.sceneId === 7055; });
    expect(screenReports).toHaveLength(2);
    var homeReport = screenReports.find(function (r) { return r.dimension.screen === 'home'; });
    expect(homeReport.metric.pv).toBe(2);
  });

  test('应为每个 button 各自上报一条 7056 事件', function () {
    Analytics.trackButton('btn_a');
    Analytics.trackButton('btn_a');
    Analytics.trackButton('btn_b');

    Analytics.flushAll('test');

    var btnReports = reports.filter(function (r) { return r.sceneId === 7056; });
    expect(btnReports).toHaveLength(2);
    var btnA = btnReports.find(function (r) { return r.dimension.btnId === 'btn_a'; });
    expect(btnA.metric.clicks).toBe(2);
  });

  test('应为每个 level 各自上报一条 7057 事件，包含完整明细字段', function () {
    Analytics.trackLevelEvent(5, 'enter');
    Analytics.trackLevelEvent(5, 'win');
    Analytics.trackLevelEvent(5, 'wrong', 3);

    Analytics.flushAll('test');

    var lvReports = reports.filter(function (r) { return r.sceneId === 7057; });
    expect(lvReports).toHaveLength(1);
    expect(lvReports[0].dimension.levelIdx).toBe('5');
    expect(lvReports[0].metric).toEqual({
      enter: 1, win: 1, lose: 0, ms: 0, wrong: 3, hint: 0, found: 0, best: 0
    });
  });

  test('仍应上报一条 7054 汇总事件（保持向后兼容）', function () {
    Analytics.trackScreen('home');
    Analytics.flushAll('test');
    var summary = reports.filter(function (r) { return r.sceneId === 7054; });
    expect(summary).toHaveLength(1);
  });

  test('flushAll 后再次 flushAll 不应重复上报旧数据（内存缓冲需清空）', function () {
    Analytics.trackScreen('home');
    Analytics.trackButton('btn_a');
    Analytics.trackLevelEvent(1, 'enter');

    Analytics.flushAll('first');
    reports.length = 0; // 只看第二次 flush 的上报

    Analytics.flushAll('second');

    expect(reports.some(function (r) { return r.sceneId === 7055; })).toBe(false);
    expect(reports.some(function (r) { return r.sceneId === 7056; })).toBe(false);
    expect(reports.some(function (r) { return r.sceneId === 7057; })).toBe(false);

    var summary = reports.find(function (r) { return r.sceneId === 7054; });
    expect(summary.metric.totalPv).toBe(0);
    expect(summary.metric.totalClicks).toBe(0);
  });
});
