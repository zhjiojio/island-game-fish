/**
 * systems/storage.js — 统一 KV 存储封装
 * 职责：
 *   - 平台探测（ks > wx > localStorage）单点封装
 *   - 日期失效结构（daily unlock）
 *   - 清空全量 key 清单（单点维护）
 * 依赖：CONFIG
 * 导出：Storage
 */
(function () {
  'use strict';

  function ksSet(key, value) {
    var str = JSON.stringify(value);
    if (typeof ks !== 'undefined' && ks.setStorageSync) {
      try { ks.setStorageSync({ key: key, data: str }); } catch (e) {}
    }
    try { localStorage.setItem(key, str); } catch (e) {}
  }

  function ksGet(key) {
    var str = null;
    if (typeof ks !== 'undefined' && ks.getStorageSync) {
      try {
        var res = ks.getStorageSync({ key: key });
        str = (res && res.data) ? res.data : null;
      } catch (e) {}
    }
    if (str === null || str === undefined) {
      try { str = localStorage.getItem(key); } catch (e) {}
    }
    if (!str) return null;
    try { return JSON.parse(str); } catch (e) { return str; }
  }

  function ksRemove(key) {
    if (typeof ks !== 'undefined' && ks.removeStorageSync) {
      try { ks.removeStorageSync({ key: key }); } catch (e) {}
    }
    try { localStorage.removeItem(key); } catch (e) {}
  }

  // ── 日期工具 ─────────────────────────────────────────────────────────────────
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
  }

  var Storage = window.Storage = {

    get: function (key) { return ksGet(key); },
    set: function (key, value) { ksSet(key, value); },
    remove: function (key) { ksRemove(key); },

    // ── 每日解锁结构 ──────────────────────────────────────────────────────────
    /**
     * 检查某 id 今天是否已解锁
     * @param {string} storageKey  CONFIG.STORAGE_KEYS.voiceUnlocks / themeUnlocks
     * @param {string|number} id
     * @returns {boolean}
     */
    isDailyUnlocked: function (storageKey, id) {
      var data = ksGet(storageKey);
      if (!data || data.date !== todayStr()) return false;
      return !!(data.ids && data.ids[id]);
    },

    /**
     * 标记今天已解锁
     */
    markDailyUnlocked: function (storageKey, id) {
      var today = todayStr();
      var data  = ksGet(storageKey) || {};
      if (data.date !== today) data = { date: today, ids: {} };
      data.ids[id] = 1;
      ksSet(storageKey, data);
    },

    // ── 永久解锁 ──────────────────────────────────────────────────────────────
    isThemePermUnlocked: function (themeId) {
      return ksGet(CONFIG.STORAGE_KEY_PREFIX + '_theme_' + themeId + '_unlocked') === '1';
    },
    markThemePermUnlocked: function (themeId) {
      ksSet(CONFIG.STORAGE_KEY_PREFIX + '_theme_' + themeId + '_unlocked', '1');
    },

    // ── 通关集合 ──────────────────────────────────────────────────────────────
    markLevelPassed: function (idx) {
      var data = ksGet(CONFIG.STORAGE_KEYS.passedLevels) || {};
      data[idx] = 1;
      ksSet(CONFIG.STORAGE_KEYS.passedLevels, data);
    },
    isLevelPassed: function (idx) {
      var data = ksGet(CONFIG.STORAGE_KEYS.passedLevels) || {};
      return !!data[idx];
    },

    // ── 通用计数器（供签到奖励等场景复用，非特定业务专属）───────────────────────
    /**
     * 指定 key 计数 +delta（默认 +1），返回自增后的最新值
     * @param {string} storageKey
     * @param {number} [delta=1]
     */
    addCount: function (storageKey, delta) {
      var v = (ksGet(storageKey) || 0) + (delta === undefined ? 1 : delta);
      ksSet(storageKey, v);
      return v;
    },
    getCount: function (storageKey) {
      return ksGet(storageKey) || 0;
    },

    // ── 限时解锁全部主题（通用机制，签到/活动奖励均可复用）───────────────────────
    /**
     * 授予「限时解锁全部主题」hours 小时；若已在生效中则在原到期时间基础上叠加，
     * 否则以当前时间为起点计算到期时间。
     * @param {number} hours
     */
    grantTempUnlockAllHours: function (hours) {
      var key = CONFIG.STORAGE_KEYS.tempUnlockAllUntil;
      var now = Date.now();
      var cur = ksGet(key) || 0;
      var base = cur > now ? cur : now;
      var until = base + hours * 3600 * 1000;
      ksSet(key, until);
      return until;
    },
    /** 限时解锁全部主题当前是否生效 */
    isTempUnlockAllActive: function () {
      var until = ksGet(CONFIG.STORAGE_KEYS.tempUnlockAllUntil) || 0;
      return Date.now() < until;
    },
    /** 限时解锁全部主题的到期时间戳（未生效返回 0） */
    getTempUnlockAllUntil: function () {
      return ksGet(CONFIG.STORAGE_KEYS.tempUnlockAllUntil) || 0;
    },

    // ── 统计 ──────────────────────────────────────────────────────────────────
    addStat: function (key, delta) {
      var stats = ksGet(CONFIG.STORAGE_KEYS.stats) || { correct: 0, wrong: 0, levelPass: 0 };
      stats[key] = (stats[key] || 0) + (delta || 1);
      ksSet(CONFIG.STORAGE_KEYS.stats, stats);
    },
    getStats: function () {
      return ksGet(CONFIG.STORAGE_KEYS.stats) || { correct: 0, wrong: 0, levelPass: 0 };
    },

    // ── 上次所在关卡 ──────────────────────────────────────────────────────────
    setLastLevel: function (themeId, idx) {
      ksSet(CONFIG.STORAGE_KEY_PREFIX + '_last_level_' + themeId, idx);
    },
    getLastLevel: function (themeId) {
      return ksGet(CONFIG.STORAGE_KEY_PREFIX + '_last_level_' + themeId);
    },

    // ── 清空全量进度（设置页「清空」按钮）────────────────────────────────────────
    clearAll: function (themes) {
      var K = CONFIG.STORAGE_KEYS;
      // 固定 key
      [K.user, K.voicePack, K.voiceUnlocks, K.themeUnlocks, K.passedLevels,
       K.stats, K.playtimeMs, K.failStreak, K.shortcutInstalled,
       K.themeUnlockAdCount, K.unlockAllPromptShown, K.unlockAllAdCount,
       K.checkinState, K.checkinPropCount, K.checkinHintCount, K.tempUnlockAllUntil,
       K.newUserFirstLevelDone].forEach(function (k) {
        ksRemove(k);
      });
      // 动态 key
      if (themes) {
        themes.forEach(function (t) {
          ksRemove(CONFIG.STORAGE_KEY_PREFIX + '_last_level_' + t.id);
          ksRemove(CONFIG.STORAGE_KEY_PREFIX + '_theme_' + t.id + '_unlocked');
        });
      }
    }
  };
})();
