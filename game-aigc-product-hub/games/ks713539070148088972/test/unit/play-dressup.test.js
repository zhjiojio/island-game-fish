/**
 * test/unit/play-dressup.test.js — PlayController dressup 流程单测
 * 覆盖：
 *   - 进入 dressup 关卡时初始化错误次数且不启动倒计时
 *   - dressup 错误达到上限时打开失败弹窗
 *   - dressup 复活只清零错误次数且保留模式状态
 *   - dressup 完成时以零星级打开通关弹窗
 */
'use strict';

function loadFresh() {
  jest.resetModules();

  // ── 基础框架 ────────────────────────────────────────────────────────────
  require('../../js/core/product.config.js');
  require('../../js/core/config.js');

  // M3 工具
  global.M3 = global.M3 || {};
  global.M3._now = function () { return Date.now(); };
  global.M3.Layout = { w: 414, h: 896, safeTop: 0, usableH: 896 };

  // ── 依赖 mock ────────────────────────────────────────────────────────────
  global.Renderer = {
    drawRect: jest.fn(),
    drawRoundRect: jest.fn(),
    drawText: jest.fn(),
    drawImage: jest.fn(),
    drawImageCover: jest.fn(),
    drawCircle: jest.fn()
  };

  global.InputManager = {
    add: jest.fn(),
    addAll: jest.fn(),
    addDrag: jest.fn(),
    addDragAll: jest.fn(),
    clear: jest.fn(),
    addErrRipple: jest.fn(),
    isDragging: jest.fn(function () { return false; }),
    handleDragStart: jest.fn(),
    handleDragMove: jest.fn(),
    handleDragEnd: jest.fn(),
    handleTap: jest.fn()
  };

  global.TextureManager = {
    load: jest.fn(function () { return Promise.resolve(); })
  };

  global.SceneManager = {
    go: jest.fn(),
    open: jest.fn(),
    close: jest.fn()
  };

  global.Audio = {
    play: jest.fn(),
    playCorrect: jest.fn(),
    playWrong: jest.fn(),
    playTick: jest.fn(),
    playLose: jest.fn(),
    playHint: jest.fn(),
    playRevive: jest.fn(),
    playSkip: jest.fn(),
    stopBgm: jest.fn(),
    startBgm: jest.fn()
  };

  global.Storage = {
    get: jest.fn(function () { return null; }),
    set: jest.fn(),
    addStat: jest.fn(),
    markLevelPassed: jest.fn(),
    setLastLevel: jest.fn()
  };

  global.Difficulty = {
    checkMercy: jest.fn(function () { return 0; }),
    getDiff: jest.fn(function () { return { penalty: 5, hitScale: 1, bonus: 0 }; }),
    calcStars: jest.fn(function () { return 1; }),
    calcBeatPercent: jest.fn(function () { return 50; }),
    addFailStreak: jest.fn(),
    resetStreak: jest.fn()
  };

  global.Analytics = {
    trackLevelEvent: jest.fn()
  };

  global.Telemetry = {
    mercyTriggered: jest.fn(),
    levelEnter: jest.fn(),
    levelExit: jest.fn(),
    buttonClick: jest.fn(),
    adEntryExposed: jest.fn(),
    report: jest.fn()
  };

  global.Ads = {
    showRewarded: jest.fn(function (cb) { cb(true); }),
    showSkipAd: jest.fn(function (cb) { cb(); }),
    trySpawnInterstitial: jest.fn()
  };

  global.UIKit = {
    toast: jest.fn()
  };

  // RemoteConfig — 测试里逐个 test 可覆盖
  global.RemoteConfig = {
    getLevelByIdx: jest.fn(function () { return null; }),
    getTheme: jest.fn(function () { return { id: 'dress' }; }),
    getLevelsByTheme: jest.fn(function () { return []; }),
    tauntLines: []
  };

  // ModeRegistry — 空注册表，测试里可覆盖 create
  require('../../js/play/mode-registry.js');
  global.ModeRegistry.create = jest.fn(function () { return { draw: function () {} }; });

  // 加载 PlayController
  require('../../js/play/play.js');
  return window.PlayController;
}

describe('PlayController dressup', function () {
  var PlayController;

  beforeEach(function () {
    PlayController = loadFresh();
  });

  test('进入 dressup 关卡时初始化错误次数且不启动倒计时', async function () {
    var level = {
      idx: 100, mode: 'dressup', themeId: 'dress', maxErrors: 5,
      characters: [
        { id: 'c1', scene: 'a.jpg', result: 'ar.jpg', correctOutfit: 'o1' },
        { id: 'c2', scene: 'b.jpg', result: 'br.jpg', correctOutfit: 'o2' }
      ],
      outfits: [
        { id: 'o1', thumbnail: 't1.jpg' },
        { id: 'o2', thumbnail: 't2.jpg' }
      ]
    };
    RemoteConfig.getLevelByIdx = jest.fn(function () { return level; });
    RemoteConfig.getTheme = jest.fn(function () { return { id: 'dress' }; });
    ModeRegistry.register('dressup', {
      collectAssetGroups: function (assetLevel) {
        return [
          [assetLevel.characters[0].scene, assetLevel.characters[0].result],
          [assetLevel.outfits[0].thumbnail, assetLevel.outfits[1].thumbnail],
          [assetLevel.characters[1].scene, assetLevel.characters[1].result],
          [assetLevel.completeImage]
        ];
      }
    });
    ModeRegistry.create = jest.fn(function () { return { draw: function () {}, needsCountdown: function () { return false; }, getIntroAudio: function () { return null; }, showToolbarButtons: function () { return { hint: false, skip: false }; }, initState: function (st) { st.dressup = { maxErrors: typeof level.maxErrors === 'number' ? level.maxErrors : 3, errorCount: 0 }; } }; });

    await PlayController.pickLevel(100);

    expect(PlayController.state.dressup).toEqual({ maxErrors: 5, errorCount: 0 });
    expect(PlayController.state.running).toBe(false);
    expect(PlayController.state.sceneStarted).toBe(true);
    expect(TextureManager.load).toHaveBeenCalledWith('a.jpg');
    expect(TextureManager.load).toHaveBeenCalledWith('ar.jpg');
    expect(TextureManager.load).toHaveBeenCalledWith('b.jpg');
    expect(TextureManager.load).toHaveBeenCalledWith('br.jpg');
    expect(TextureManager.load).toHaveBeenCalledWith('t1.jpg');
    expect(TextureManager.load).toHaveBeenCalledWith('t2.jpg');
  });

  test('关卡资源未完成时也应立即进入 game，资源完成后才标记 sceneReady', async function () {
    var resolveScene;
    var level = {
      idx: 101, mode: 'dressup', themeId: 'dress', duration: 30,
      characters: [{ id: 'c1', scene: 'slow-scene.jpg', result: 'result.jpg' }],
      outfits: [{ id: 'o1', thumbnail: 'thumb.jpg' }]
    };
    RemoteConfig.getLevelByIdx = jest.fn(function () { return level; });
    RemoteConfig.getTheme = jest.fn(function () { return { id: 'dress' }; });
    ModeRegistry.register('dressup', {
      collectAssetGroups: function (assetLevel) {
        return [[assetLevel.characters[0].scene], [assetLevel.characters[0].result], [assetLevel.outfits[0].thumbnail]];
      }
    });
    ModeRegistry.create = jest.fn(function () {
      return {
        draw: function () {},
        needsCountdown: function () { return true; },
        getIntroAudio: function () { return null; },
        initState: function () {}
      };
    });
    TextureManager.load = jest.fn(function (src) {
      if (src === 'slow-scene.jpg') {
        return new Promise(function (resolve) { resolveScene = resolve; });
      }
      return Promise.resolve();
    });

    var entering = PlayController.pickLevel(101);
    expect(SceneManager.go).toHaveBeenCalledWith('game');
    expect(PlayController.state.sceneReady).toBe(false);
    expect(PlayController.state.sceneStarted).toBe(false);

    resolveScene();
    await entering;
    expect(PlayController.state.sceneReady).toBe(true);
    expect(PlayController.state.sceneStarted).toBe(true);
    expect(PlayController.state.running).toBe(true);
  });

  test('非关键资源失败只记录，不阻断关卡进入', async function () {
    var level = {
      idx: 102, mode: 'dressup', themeId: 'dress', duration: 30,
      characters: [{ id: 'c1', scene: 'scene.jpg', result: 'result.jpg' }],
      outfits: [{ id: 'o1', thumbnail: 'broken-thumb.jpg' }]
    };
    RemoteConfig.getLevelByIdx = jest.fn(function () { return level; });
    RemoteConfig.getTheme = jest.fn(function () { return { id: 'dress' }; });
    ModeRegistry.register('dressup', {
      collectAssetGroups: function (assetLevel) {
        return [[assetLevel.characters[0].scene, assetLevel.characters[0].result], [assetLevel.outfits[0].thumbnail]];
      }
    });
    ModeRegistry.create = jest.fn(function () {
      return {
        draw: function () {},
        needsCountdown: function () { return true; },
        getIntroAudio: function () { return null; },
        initState: function () {}
      };
    });
    TextureManager.load = jest.fn(function (src) {
      return src === 'broken-thumb.jpg'
        ? Promise.reject(new Error('thumbnail failed'))
        : Promise.resolve();
    });

    await PlayController.pickLevel(102);

    expect(PlayController.state.assetLoad.criticalFailed).toEqual([]);
    expect(PlayController.state.assetLoad.optionalFailed.map(function (item) { return item.src; }))
      .toContain('broken-thumb.jpg');
    expect(PlayController.state.sceneReady).toBe(true);
    expect(PlayController.state.running).toBe(true);
    expect(UIKit.toast).not.toHaveBeenCalledWith('部分关键素材加载失败', 2200);
  });

  test('关键资源失败会记录并提示，但不静默吞掉错误', async function () {
    var level = {
      idx: 103, mode: 'dressup', themeId: 'dress', duration: 30,
      characters: [{ id: 'c1', scene: 'broken-scene.jpg', result: 'result.jpg' }],
      outfits: [{ id: 'o1', thumbnail: 'thumb.jpg' }]
    };
    RemoteConfig.getLevelByIdx = jest.fn(function () { return level; });
    RemoteConfig.getTheme = jest.fn(function () { return { id: 'dress' }; });
    ModeRegistry.register('dressup', {
      collectAssetGroups: function (assetLevel) {
        return [[assetLevel.characters[0].scene, assetLevel.characters[0].result], [assetLevel.outfits[0].thumbnail]];
      }
    });
    ModeRegistry.create = jest.fn(function () {
      return {
        draw: function () {},
        needsCountdown: function () { return true; },
        getIntroAudio: function () { return null; },
        initState: function () {}
      };
    });
    TextureManager.load = jest.fn(function (src) {
      return src === 'broken-scene.jpg'
        ? Promise.reject(new Error('scene failed'))
        : Promise.resolve();
    });

    await PlayController.pickLevel(103);

    expect(PlayController.state.assetLoad.criticalFailed.map(function (item) { return item.src; }))
      .toContain('broken-scene.jpg');
    expect(UIKit.toast).toHaveBeenCalledWith('部分关键素材加载失败', 2200);
    expect(PlayController.state.sceneReady).toBe(true);
  });

  test('dressup 错误达到上限时打开失败弹窗', function () {
    PlayController.state.level = { idx: 100, mode: 'dressup' };
    PlayController.state.dressup = { maxErrors: 2, errorCount: 1 };
    PlayController.state.mode = {
      getDressupState: function () { return { totalPairs: 3, matchedCount: 1 }; },
      getLoseTitle: function () { return '机会用完！'; },
      getLoseSubtitle: function () { return '已匹配 1/3'; },
      getReviveLabel: function () { return '看广告续命'; },
      onWrongCallback: function (st, ctx) {
        st.dressup.errorCount++;
        if (window.Audio) Audio.playWrong();
        if (st.dressup.errorCount >= st.dressup.maxErrors) {
          st.running = false;
          if (window.Audio) Audio.playLose();
          var ds = this.getDressupState();
          var unmatched = ds.totalPairs - ds.matchedCount;
          SceneManager.open('lose-modal', {
            level: st.level,
            remaining: unmatched,
            title: this.getLoseTitle(),
            subtitle: this.getLoseSubtitle(st),
            reviveLabel: this.getReviveLabel()
          });
        }
      }
    };

    PlayController.onModeWrong({ id: 'wrong_top' });

    expect(PlayController.state.dressup.errorCount).toBe(2);
    expect(SceneManager.open).toHaveBeenCalledWith('lose-modal', expect.objectContaining({ level: PlayController.state.level, remaining: 2 }));
  });

  test('dressup 复活只清零错误次数且保留模式状态', function () {
    PlayController.state.level = { idx: 100, mode: 'dressup' };
    PlayController.state.dressup = { maxErrors: 3, errorCount: 3 };
    PlayController.state.mode = {
      onRevive: function (st) { st.dressup.errorCount = 0; },
      getReviveLabel: function () { return '看广告续命'; },
      getReviveToast: function () { return '错误次数已恢复！'; },
      getDressupState: function () { return { correctIds: ['hat'] }; }
    };
    Ads.showRewarded = function (done) { done(true); };

    PlayController.useRevive();

    expect(PlayController.state.dressup.errorCount).toBe(0);
    expect(PlayController.state.mode.getDressupState().correctIds).toEqual(['hat']);
  });

  test('dressup 完成时以零星级打开通关弹窗（复用 win-modal，不展示章节完结卡片）', function () {
    var level = { idx: 100, mode: 'dressup', themeId: 'dress' };
    PlayController.state.level = level;
    PlayController.state.theme = { id: 'dress' };
    PlayController.state.mode = {
      calcStars: function () { return 0; },
      calcBeatPct: function () { return 0; }
    };
    RemoteConfig.getLevelsByTheme = jest.fn(function () { return [{ idx: 100 }]; });

    PlayController.onModeComplete();

    expect(SceneManager.open).toHaveBeenCalledWith('win-modal', {
      level: level,
      stars: 0,
      beatPct: 0,
      isChapterEnd: true,
      theme: PlayController.state.theme
    });
    expect(SceneManager.open).not.toHaveBeenCalledWith('chapter-done', expect.anything());
  });
});
