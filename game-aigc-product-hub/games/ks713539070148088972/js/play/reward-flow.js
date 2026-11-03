/**
 * play/reward-flow.js — 广告奖励与关卡解锁流程
 *
 * 负责所有“看广告后改变游戏流程”的操作，避免 PlayController 同时承担
 * 玩法判定、倒计时和商业化流程。
 */
(function () {
  'use strict';

  var PlayController = window.PlayController;
  if (!PlayController) return;

  var _sessionAdUnlocked = {};
  // 主题跳转是一个完整业务流程，不能挂在 state 上。进关时 state 会重置，
  // 如果第二个重复事件恰好在重置之后到达，就可能再次触发下一主题判断。
  var _themeTransitionLock = false;

  function sameId(a, b) {
    return a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
  }

  function isThemeUnlocked(theme) {
    if (!theme) return false;
    if (theme.unlocked || theme.unlockBy === 'free') return true;
    if (Storage.isThemePermUnlocked(theme.id)) return true;
    if (Storage.isTempUnlockAllActive()) return true;
    return !!(theme.dailyUnlock && Storage.isDailyUnlocked(CONFIG.STORAGE_KEYS.themeUnlocks, theme.id));
  }

  // 统一提供给通关弹窗、首页和主题跳转使用，避免各处解锁判断不一致。
  PlayController.isThemeUnlocked = isThemeUnlocked;

  PlayController._markLevelAdUnlocked = function (themeId) {
    _sessionAdUnlocked[themeId] = true;
  };

  PlayController._releaseThemeTransitionLock = function () {
    _themeTransitionLock = false;
  };

  PlayController._needLevelAd = function (theme, idx) {
    if (!theme || !theme.freeCount) return false;
    // 主题通过分享、主题广告或全部解锁获得的权限，不应在进入主题时再次触发关卡广告。
    // 注意不把 unlockBy:'free' / unlocked:true 放在这里，否则会破坏首个免费主题
    // 原本由 freeCount 控制的主题内关卡广告策略。
    var hasThemeUnlockBypass = Storage.isThemePermUnlocked(theme.id) ||
      Storage.isTempUnlockAllActive() ||
      (theme.dailyUnlock && Storage.isDailyUnlocked(CONFIG.STORAGE_KEYS.themeUnlocks, theme.id));
    if (hasThemeUnlockBypass) return false;
    if (_sessionAdUnlocked[theme.id]) return false;
    var levels = RemoteConfig.getLevelsByTheme(theme.id);
    var levelOrder = levels.findIndex(function (lv) { return lv.idx === idx; });
    return levelOrder >= theme.freeCount;
  };

  PlayController.useHint = function () {
    var state = PlayController.state;
    var level = state.level;
    var mode = level.mode;
    Telemetry.adEntryExposed('hint');

    PlayController._pauseForAd();
    Ads.showRewarded(function (ok) {
      PlayController._resumeAfterAd();
      if (!ok) return;
      state.hintUsed++;
      Analytics.trackLevelEvent(level.idx, 'hint');

      if (mode === 'dressup' || mode === 'puzzle') {
        if (state.mode && state.mode.onHint) state.mode.onHint(state);
        return;
      }

      var targetIdx = -1;
      for (var i = 0; i < (level.odds || []).length; i++) {
        if (state.hits.indexOf(i) < 0) { targetIdx = i; break; }
      }
      if (targetIdx < 0) return;
      state.hintArrow = { oddIdx: targetIdx };
      Audio.playHint();
    }, 'hint');
  };

  PlayController.useSkip = function () {
    var state = PlayController.state;
    PlayController._pauseForAd();
    Ads.showSkipAd(function () {
      PlayController._resumeAfterAd();
      Audio.playSkip();
      UIKit.toast('🚀 已跳过本关！');
      var levels = RemoteConfig.getLevelsByTheme(state.theme.id);
      var curPos = levels.findIndex(function (lv) { return lv.idx === state.level.idx; });
      if (curPos >= 0 && curPos < levels.length - 1) {
        PlayController.pickLevel(levels[curPos + 1].idx);
      } else {
        PlayController.goHome();
      }
    }, function () {
      PlayController._resumeAfterAd();
    });
  };

  PlayController.useAddTime = function () {
    var state = PlayController.state;
    Telemetry.adEntryExposed('add_time');
    PlayController._pauseForAd();
    Ads.showRewarded(function (ok) {
      PlayController._resumeAfterAd();
      if (!ok) return;
      // 所有计时玩法统一追加通用倒计时。
      state.time = (state.time || 0) + CONFIG.REVIVE_ADD_TIME;
      state.addTimeUsed = (state.addTimeUsed || 0) + 1;
      Analytics.trackLevelEvent(state.level.idx, 'add_time');
      Audio.playRevive();
      UIKit.toast('⏱ 时间 +' + CONFIG.REVIVE_ADD_TIME + '秒！');
    }, 'add_time');
  };

  PlayController.useAddChance = function () {
    var state = PlayController.state;
    Telemetry.adEntryExposed('add_chance');
    PlayController._pauseForAd();
    Ads.showRewarded(function (ok) {
      PlayController._resumeAfterAd();
      if (!ok) return;
      if (state.dressup) {
        state.dressup.maxErrors = (state.dressup.maxErrors || 0) + 5;
      } else if (state.puzzle) {
        state.puzzle.maxErrors = (state.puzzle.maxErrors || 0) + 5;
      }
      state.addChanceUsed = (state.addChanceUsed || 0) + 1;
      Analytics.trackLevelEvent(state.level.idx, 'add_chance');
      Audio.playRevive();
      UIKit.toast('❤️ 机会 +5 次！');
    }, 'add_chance');
  };

  PlayController.useRevive = function (limitType) {
    var state = PlayController.state;
    Ads.showRewarded(function (ok) {
      if (!ok) return;
      state.mode.onRevive(state, limitType);
      Audio.playRevive();
      UIKit.toast(state.mode.getReviveToast(limitType));
      SceneManager.close();
    }, 'revive');
  };

  PlayController._pauseForAd = function () {
    var state = PlayController.state;
    if (state) state.paused = true;
  };

  PlayController._resumeAfterAd = function () {
    var state = PlayController.state;
    if (!state) return;
    state.paused = false;
    state._lastTick = M3._now();
  };

  PlayController.goToNextTheme = function () {
    var state = PlayController.state;
    // 输入层负责识别同一次触摸，业务层再用独立锁保证主题跳转流程只执行一次。
    if (_themeTransitionLock) return;
    _themeTransitionLock = true;
    var themes = RemoteConfig.themes || [];
    if (!themes.length) { _themeTransitionLock = false; PlayController.goHome(); return; }

    var curThemeId = state.level ? state.level.themeId : null;
    var curIdx = -1;
    for (var i = 0; i < themes.length; i++) {
      if (sameId(themes[i].id, curThemeId)) { curIdx = i; break; }
    }
    if (curIdx < 0 || curIdx >= themes.length - 1) {
      _themeTransitionLock = false;
      PlayController.goHome();
      return;
    }

    var nextTheme = themes[curIdx + 1];
    function enterFirstLevel() {
      var levels = RemoteConfig.getLevelsByTheme(nextTheme.id);
      if (!levels || levels.length === 0) {
        _themeTransitionLock = false;
        PlayController.goHome();
        return;
      }
      PlayController.pickLevel(levels[0].idx);
    }
    function recordThemeUnlockAd() {
      var count = Storage.addCount(CONFIG.STORAGE_KEYS.themeUnlockAdCount);
      if (count >= 2 && !Storage.get(CONFIG.STORAGE_KEYS.unlockAllPromptShown)) {
        Storage.set(CONFIG.STORAGE_KEYS.unlockAllPromptShown, '1');
      }
    }

    if (PlayController.isThemeUnlocked(nextTheme)) {
      enterFirstLevel();
    } else if (nextTheme.unlockBy === 'rewardedAd') {
      var nextLevels = RemoteConfig.getLevelsByTheme(nextTheme.id);
      if (nextLevels && nextLevels[0]) PlayController.preloadLevelAssets(nextLevels[0]);
      Ads.showRewarded(function (ok) {
        if (!ok) {
          _themeTransitionLock = false;
          return;
        }
        if (nextTheme.dailyUnlock) {
          Storage.markDailyUnlocked(CONFIG.STORAGE_KEYS.themeUnlocks, nextTheme.id);
        } else {
          Storage.markThemePermUnlocked(nextTheme.id);
        }
        recordThemeUnlockAd();
        enterFirstLevel();
      }, 'theme_unlock');
    } else if (nextTheme.unlockBy === 'share') {
      SceneManager.close();
      SceneManager.open('share-unlock-overlay', { themeId: nextTheme.id });
    } else {
      enterFirstLevel();
    }
  };
})();
