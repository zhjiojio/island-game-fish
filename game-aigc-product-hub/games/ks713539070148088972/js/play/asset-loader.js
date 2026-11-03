/**
 * play/asset-loader.js — 关卡资源收集与加载
 *
 * 玩法通过 ModeRegistry 提供二维资源分组；本模块只负责展开、去重、预热、
 * 等待关卡资源，并在资源就绪后通知 PlayController 启动关卡。
 */
(function () {
  'use strict';

  var PlayController = window.PlayController;
  if (!PlayController) return;

  PlayController._collectLevelSrcs = function (level) {
    var theme = RemoteConfig.getTheme ? RemoteConfig.getTheme(level.themeId) : null;
    var groups = ModeRegistry.getAssetGroups(level.mode, level, theme);
    if (!groups) {
      console.warn('[Play] mode has no asset groups:', level.mode);
      groups = [];
    }
    return this._flattenAssetGroups(groups);
  };

  PlayController._collectLevelAssetGroups = function (level) {
    var theme = RemoteConfig.getTheme ? RemoteConfig.getTheme(level.themeId) : null;
    var groups = ModeRegistry.getAssetGroups(level.mode, level, theme) || [];
    // 二维数组第一层就是关键资源层，后续层按原顺序作为非关键资源层。
    var critical = this._flattenAssetGroups(groups.slice(0, 1));
    var criticalSet = {};
    critical.forEach(function (src) { criticalSet[src] = true; });
    var optional = this._flattenAssetGroups(groups).filter(function (src) {
      return !criticalSet[src];
    });
    return { critical: critical, optional: optional };
  };

  PlayController._flattenAssetGroups = function (groups) {
    var seen = {};
    var srcs = [];
    (groups || []).forEach(function (group) {
      (group || []).forEach(function (src) {
        if (src && !seen[src]) {
          seen[src] = true;
          srcs.push(src);
        }
      });
    });
    return srcs;
  };

  PlayController.preloadLevelAssets = function (level) {
    if (!level) return;
    this._collectLevelSrcs(level).forEach(function (src) {
      TextureManager.load(src).catch(function () {});
    });
  };

  function _getThemeTargetLevel(theme) {
    if (!theme || theme.comingsoon) return null;
    var levels = RemoteConfig.getLevelsByTheme(theme.id);
    if (!levels || levels.length === 0) return null;
    var lastIdx = Storage.getLastLevel(theme.id);
    var level = lastIdx ? RemoteConfig.getLevelByIdx(lastIdx) : null;
    if (!level || level.themeId !== theme.id) level = levels[0];
    return level;
  }

  /**
   * 后台预热单个主题当前真正可能进入的关卡。
   * home 只把当前可见主题传进来，避免列表一打开就把所有主题的图片都排进队列。
   */
  PlayController.preloadThemeLevelAssets = function (theme) {
    if (!theme || !this._isThemeUnlockedForPreload(theme)) return;
    var level = _getThemeTargetLevel(theme);
    if (level) this.preloadLevelAssets(level);
  };

  /**
   * 普通用户进入 home 后后台预热游戏页公共 UI，不阻塞首页展示。
   * 资源与冷启动 welcome 使用同一份清单，避免两套字段列表漂移。
   */
  PlayController.preloadGameUiAssets = function () {
    this._collectGameUiSrcs().forEach(function (src) {
      if (src) TextureManager.load(src).catch(function () {});
    });
  };

  /**
   * 收集游戏页公共 UI 和结算弹窗资源。
   * 这些资源不属于关卡 JSON，但进入第一关前必须尽量准备好，避免首屏或
   * 快速通关时才临时出现空白按钮/弹窗。
   */
  PlayController._collectGameUiSrcs = function () {
    var groups = this._collectGameUiAssetGroups();
    return this._flattenAssetGroups(groups);
  };

  PlayController._collectGameUiAssetGroups = function () {
    var critical = [];
    var optional = [];
    if (window.GameSceneAssets && GameSceneAssets.criticalAssetSrcs) {
      critical = critical.concat(GameSceneAssets.criticalAssetSrcs());
    }
    if (window.GameSceneAssets && GameSceneAssets.optionalAssetSrcs) {
      optional = optional.concat(GameSceneAssets.optionalAssetSrcs());
    }
    var winT = CONFIG.TEMPLATE.winModal || {};
    var loseT = CONFIG.TEMPLATE.loseModal || {};
    [
      winT.bgImageAsset, winT.decorationAsset,
      winT.primaryButtonAsset, winT.secondaryButtonAsset,
      winT.nextThemeButtonAsset, winT.nextThemeFreeButtonAsset,
      loseT.bgImageAsset, loseT.titleImageAsset,
      loseT.primaryButtonAsset, loseT.secondaryButtonAsset,
      loseT.hourglassAsset, loseT.timeTitleImageAsset,
      loseT.timeBgImageAsset, loseT.timeHourglassAsset,
      loseT.timePrimaryButtonAsset, loseT.timeSecondaryButtonAsset
    ].forEach(function (key) {
      if (key) optional.push(CONFIG.uiAsset(key));
    });
    return [critical, optional];
  };

  /**
   * 等待当前关卡真正需要的资源完成。
   * 与 preloadLevelAssets 的区别：后者只做后台预热，这里用于进入 game 前的
   * 资源门禁。TextureManager 自带缓存和 pending 去重，已预热完成时会快速命中。
   */
  PlayController.ensureLevelAssets = function (level) {
    if (!level) return Promise.reject(new Error('level is required'));
    var levelGroups = this._collectLevelAssetGroups(level);
    var gameGroups = this._collectGameUiAssetGroups();
    var criticalSrcs = this._flattenAssetGroups([gameGroups[0], levelGroups.critical]);
    var optionalSrcs = this._flattenAssetGroups([gameGroups[1], levelGroups.optional]);
    function loadSettled(srcs, failed) {
      return Promise.all(srcs.map(function (src) {
        return TextureManager.load(src).catch(function (err) {
          failed.push({ src: src, error: err });
          return null;
        });
      }));
    }
    var criticalFailed = [];
    var optionalFailed = [];
    return Promise.all([
      loadSettled(criticalSrcs, criticalFailed),
      loadSettled(optionalSrcs, optionalFailed)
    ]).then(function () {
      return {
        critical: criticalSrcs,
        optional: optionalSrcs,
        criticalFailed: criticalFailed,
        optionalFailed: optionalFailed
      };
    });
  };

  /**
   * 先进入 game，再在游戏页内确认资源；确认失败时沿用 _loadSceneImages 兜底。
   *
   * 进入页面和开始玩法是两个时机：页面需要立即给用户反馈，但倒计时和点击
   * 判定仍必须等 sceneReady。这样既不会让关卡列表看起来像“点击无反应”，
   * 也不会在场景图尚未就绪时误开始游戏。
   */
  PlayController._enterLevelWithAssets = function (level, theme, opts) {
    var self = this;
    this._doPickLevel(level, theme, opts);
    this.state.sceneReady = false;

    return this.ensureLevelAssets(level).then(function (assetResult) {
      // 资源请求期间如果用户已经切换到另一关，旧请求不能反向启动旧关卡。
      if (self.state.level !== level) return false;
      self.state.assetLoad = assetResult;
      if (assetResult.criticalFailed.length > 0) {
        console.error('[Play] critical assets failed:', assetResult.criticalFailed);
        if (window.UIKit && UIKit.toast) UIKit.toast('部分关键素材加载失败', 2200);
      }
      if (assetResult.optionalFailed.length > 0) {
        console.warn('[Play] optional assets failed:', assetResult.optionalFailed);
      }
      self.state.sceneReady = true;
      self._tryStartAfterSceneReady();
      return true;
    }).catch(function (err) {
      console.warn('[Play] level assets not ready, fallback to in-game loading:', err);
      if (self.state.level !== level) return false;
      self._loadSceneImages(level);
      return false;
    });
  };

  PlayController._isThemeUnlockedForPreload = function (theme) {
    if (!theme) return false;
    if (theme.unlocked) return true;
    if (theme.unlockBy === 'free') return true;
    if (Storage.isThemePermUnlocked(theme.id)) return true;
    if (Storage.isTempUnlockAllActive()) return true;
    if (theme.dailyUnlock && Storage.isDailyUnlocked(CONFIG.STORAGE_KEYS.themeUnlocks, theme.id)) return true;
    return false;
  };

  PlayController._preloadNextLevel = function (currentLevel) {
    var themeLevels = RemoteConfig.getLevelsByTheme(currentLevel.themeId);
    var curPos = -1;
    if (themeLevels) {
      for (var i = 0; i < themeLevels.length; i++) {
        if (themeLevels[i].idx === currentLevel.idx) { curPos = i; break; }
      }
    }
    if (curPos >= 0 && curPos < themeLevels.length - 1) {
      this.preloadLevelAssets(themeLevels[curPos + 1]);
      return;
    }
    var themes = RemoteConfig.themes || [];
    var curThemeIdx = -1;
    for (var t = 0; t < themes.length; t++) {
      if (themes[t].id === currentLevel.themeId) { curThemeIdx = t; break; }
    }
    if (curThemeIdx >= 0 && curThemeIdx < themes.length - 1) {
      var nextLevels = RemoteConfig.getLevelsByTheme(themes[curThemeIdx + 1].id);
      if (nextLevels && nextLevels[0]) this.preloadLevelAssets(nextLevels[0]);
    }
  };

  PlayController._loadSceneImages = function (level) {
    var self = this;
    var playState = this.state;
    var srcs = this._collectLevelSrcs(level);
    this._preloadResultModalAssets();

    var loadedCount = 0;
    function onLoaded() {
      loadedCount++;
      if (loadedCount >= srcs.length) {
        playState.sceneReady = true;
        self._tryStartAfterSceneReady();
      }
    }

    if (srcs.length === 0) {
      playState.sceneReady = true;
      this._tryStartAfterSceneReady();
      return;
    }

    srcs.forEach(function (src) {
      TextureManager.load(src).then(onLoaded).catch(function (err) {
        console.error('[Play] scene image load failed:', err);
        onLoaded();
      });
    });
  };

  PlayController._resultModalAssetsPreloaded = false;
  PlayController._preloadResultModalAssets = function () {
    if (this._resultModalAssetsPreloaded) return;
    this._resultModalAssetsPreloaded = true;
    var winT = CONFIG.TEMPLATE.winModal || {};
    var loseT = CONFIG.TEMPLATE.loseModal || {};
    var keys = [
      winT.bgImageAsset, winT.decorationAsset,
      winT.primaryButtonAsset, winT.secondaryButtonAsset, winT.nextThemeButtonAsset, winT.nextThemeFreeButtonAsset,
      loseT.bgImageAsset, loseT.titleImageAsset,
      loseT.primaryButtonAsset, loseT.secondaryButtonAsset, loseT.hourglassAsset,
      loseT.timeTitleImageAsset, loseT.timeBgImageAsset, loseT.timeHourglassAsset,
      loseT.timePrimaryButtonAsset, loseT.timeSecondaryButtonAsset
    ];
    keys.forEach(function (key) {
      var src = key ? CONFIG.uiAsset(key) : null;
      if (src) TextureManager.load(src).catch(function () {});
    });
  };
})();
