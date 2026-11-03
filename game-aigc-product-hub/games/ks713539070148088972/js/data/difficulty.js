/**
 * data/difficulty.js — 难度公式与宽容机制
 * 职责：
 *   - 计算关卡建议时长（suggestDuration）
 *   - 获取难度参数（getDiff）
 *   - 宽容机制（applyMercy / failStreak 管理）
 * 依赖：CONFIG, Storage
 * 导出：Difficulty
 */
(function () {
  'use strict';

  var Difficulty = window.Difficulty = {

    /**
     * 计算建议时长（秒）
     * @param {object} params  { mode, oddsCount, diffKey, boss }
     * @returns {number}
     */
    suggestDuration: function (params) {
      var mode      = params.mode || 'hidden';
      var diffKey   = params.diffKey || 'normal';
      var oddsCount = params.oddsCount || 3;
      var boss      = params.boss || false;

      var diffCfg = CONFIG.DIFF[diffKey] || CONFIG.DIFF['normal'];
      var setupSec = (CONFIG.GAMEPLAY_MODES[mode] || {}).setupSec || CONFIG.SETUP_SEC[mode] || 8;
      return setupSec + oddsCount * diffCfg.perOdd + (boss ? CONFIG.BOSS_BONUS : 0);
    },

    /**
     * 获取难度配置（内联 diff 优先于全局曲线）
     * @param {object} level  关卡对象（含 diff.key）
     * @returns {object}  { key, penalty, hitScale, perOdd }
     */
    getDiff: function (level) {
      var inline = level && level.diff;
      if (inline) {
        var base = CONFIG.DIFF[inline.key] || CONFIG.DIFF['normal'];
        return {
          key:      inline.key || 'normal',
          penalty:  inline.penalty !== undefined ? inline.penalty : base.penalty,
          hitScale: inline.hitScale !== undefined ? inline.hitScale : base.hitScale,
          perOdd:   base.perOdd,
          bonus:    inline.bonus || 0
        };
      }
      return CONFIG.DIFF['normal'];
    },

    /**
     * 计算宽容奖励时间（seconds），同时更新失败连击记录
     * 通关时调用 resetStreak(levelIdx)
     * @param {number} levelIdx
     * @returns {number}  额外秒数（0 = 无奖励）
     */
    checkMercy: function (levelIdx) {
      var streakData = Storage.get(CONFIG.STORAGE_KEYS.failStreak) || {};
      var streak     = streakData[levelIdx] || 0;
      if (streak >= CONFIG.MERCY_FAIL_THRESHOLD) {
        return CONFIG.MERCY_ADD_TIME;
      }
      return 0;
    },

    /**
     * 进关失败：连击数 +1
     * @param {number} levelIdx
     */
    addFailStreak: function (levelIdx) {
      var data = Storage.get(CONFIG.STORAGE_KEYS.failStreak) || {};
      data[levelIdx] = (data[levelIdx] || 0) + 1;
      Storage.set(CONFIG.STORAGE_KEYS.failStreak, data);
    },

    /**
     * 通关：清除该关连击
     * @param {number} levelIdx
     */
    resetStreak: function (levelIdx) {
      var data = Storage.get(CONFIG.STORAGE_KEYS.failStreak) || {};
      delete data[levelIdx];
      Storage.set(CONFIG.STORAGE_KEYS.failStreak, data);
    },

    /**
     * 计算通关星级
     * @param {number} remaining  剩余秒
     * @param {number} total      总秒
     * @returns {number}  1~3
     */
    calcStars: function (remaining, total) {
      var ratio = total > 0 ? remaining / total : 0;
      var thresholds = CONFIG.STAR_THRESHOLDS;
      for (var i = 0; i < thresholds.length; i++) {
        if (ratio >= thresholds[i].ratio) return thresholds[i].stars;
      }
      return 1;
    },

    /**
     * 计算击败百分比（固定抖动公式，与原版一致）
     * @param {number} stars  1~3
     * @returns {number}  0~100
     */
    calcBeatPercent: function (stars) {
      var ratio = (stars - 1) / 2;
      var base  = 40 + ratio * 55;
      // 稳定小抖动（用关卡 idx 做种子）
      var jitter = (((Date.now() % 100) / 100) - 0.5) * 6;
      return Math.round(Math.max(1, Math.min(99, base + jitter)));
    }
  };
})();
