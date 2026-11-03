/**
 * test/unit/difficulty.test.js — Difficulty 单测
 * 覆盖：建议时长公式、难度参数解析（内联 diff 优先）、宽容机制、星级/击败百分比计算
 */
'use strict';

function loadFresh() {
  jest.resetModules();
  require('../../js/core/product.config.js');
  require('../../js/core/config.js');
  require('../../js/systems/storage.js');
  require('../../js/data/difficulty.js');
  return window.Difficulty;
}

describe('Difficulty', function () {
  var Difficulty;

  beforeEach(function () {
    localStorage.clear();
    Difficulty = loadFresh();
  });

  describe('suggestDuration', function () {
    test('normal 难度默认参数应按公式计算：setupSec + oddsCount*perOdd', function () {
      var sec = Difficulty.suggestDuration({ mode: 'hidden', diffKey: 'normal', oddsCount: 3 });
      // hidden setupSec=6（GAMEPLAY_MODES 优先），normal.perOdd=15 → 6 + 3*15 = 51
      expect(sec).toBe(6 + 3 * 15);
    });

    test('boss 关应额外加上 BOSS_BONUS', function () {
      var normal = Difficulty.suggestDuration({ mode: 'hidden', diffKey: 'normal', oddsCount: 3 });
      var boss   = Difficulty.suggestDuration({ mode: 'hidden', diffKey: 'normal', oddsCount: 3, boss: true });
      expect(boss - normal).toBe(CONFIG.BOSS_BONUS);
    });

    test('未知 diffKey 应回退到 normal 曲线', function () {
      var known   = Difficulty.suggestDuration({ mode: 'hidden', diffKey: 'normal', oddsCount: 3 });
      var unknown = Difficulty.suggestDuration({ mode: 'hidden', diffKey: 'not-exist', oddsCount: 3 });
      expect(unknown).toBe(known);
    });

    test('未传参数时应有合理默认值（不抛异常）', function () {
      expect(function () { Difficulty.suggestDuration({}); }).not.toThrow();
    });
  });

  describe('getDiff', function () {
    test('无内联 diff 时应返回 normal 曲线', function () {
      expect(Difficulty.getDiff({})).toEqual(CONFIG.DIFF.normal);
    });

    test('内联 diff.key 存在时应以该 key 的 perOdd 为基准', function () {
      var d = Difficulty.getDiff({ diff: { key: 'hard' } });
      expect(d.key).toBe('hard');
      expect(d.perOdd).toBe(CONFIG.DIFF.hard.perOdd);
      expect(d.penalty).toBe(CONFIG.DIFF.hard.penalty);
      expect(d.hitScale).toBe(CONFIG.DIFF.hard.hitScale);
    });

    test('内联 diff 显式覆盖 penalty/hitScale 时应优先使用内联值', function () {
      var d = Difficulty.getDiff({ diff: { key: 'hard', penalty: 99, hitScale: 0.5 } });
      expect(d.penalty).toBe(99);
      expect(d.hitScale).toBe(0.5);
      expect(d.perOdd).toBe(CONFIG.DIFF.hard.perOdd); // perOdd 始终来自曲线，不可内联覆盖
    });

    test('内联 diff.bonus 缺省应为 0', function () {
      expect(Difficulty.getDiff({ diff: { key: 'easy' } }).bonus).toBe(0);
    });

    test('内联 diff.key 不存在于 CONFIG.DIFF 时应回退 normal 基准', function () {
      var d = Difficulty.getDiff({ diff: { key: 'not-exist' } });
      expect(d.perOdd).toBe(CONFIG.DIFF.normal.perOdd);
    });
  });

  describe('宽容机制（checkMercy / addFailStreak / resetStreak）', function () {
    test('未达到失败阈值时 checkMercy 应返回 0', function () {
      Difficulty.addFailStreak(1);
      expect(Difficulty.checkMercy(1)).toBe(0);
    });

    test('达到 MERCY_FAIL_THRESHOLD 次失败后应返回 MERCY_ADD_TIME', function () {
      for (var i = 0; i < CONFIG.MERCY_FAIL_THRESHOLD; i++) Difficulty.addFailStreak(1);
      expect(Difficulty.checkMercy(1)).toBe(CONFIG.MERCY_ADD_TIME);
    });

    test('resetStreak 后应清零连击，checkMercy 重新回到 0', function () {
      for (var i = 0; i < CONFIG.MERCY_FAIL_THRESHOLD; i++) Difficulty.addFailStreak(2);
      Difficulty.resetStreak(2);
      expect(Difficulty.checkMercy(2)).toBe(0);
    });

    test('不同关卡的失败连击互不影响', function () {
      for (var i = 0; i < CONFIG.MERCY_FAIL_THRESHOLD; i++) Difficulty.addFailStreak(3);
      expect(Difficulty.checkMercy(4)).toBe(0);
    });
  });

  describe('calcStars', function () {
    test('剩余时间比例达到最高档阈值应给 3 星', function () {
      var top = CONFIG.STAR_THRESHOLDS[0];
      expect(Difficulty.calcStars(top.ratio * 100, 100)).toBe(top.stars);
    });

    test('剩余时间为 0 应给最低档星级（通常 1 星）', function () {
      expect(Difficulty.calcStars(0, 100)).toBe(1);
    });

    test('total 为 0 时不应抛异常（避免除零）', function () {
      expect(function () { Difficulty.calcStars(5, 0); }).not.toThrow();
    });
  });

  describe('calcBeatPercent', function () {
    test('结果应始终落在 [1, 99] 区间内', function () {
      [1, 2, 3].forEach(function (stars) {
        var pct = Difficulty.calcBeatPercent(stars);
        expect(pct).toBeGreaterThanOrEqual(1);
        expect(pct).toBeLessThanOrEqual(99);
      });
    });

    test('3 星的期望值应显著高于 1 星（抛开抖动的整体趋势）', function () {
      var sum1 = 0, sum3 = 0, N = 20;
      for (var i = 0; i < N; i++) {
        sum1 += Difficulty.calcBeatPercent(1);
        sum3 += Difficulty.calcBeatPercent(3);
      }
      expect(sum3 / N).toBeGreaterThan(sum1 / N);
    });
  });
});
