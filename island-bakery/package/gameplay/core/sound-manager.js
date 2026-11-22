(function () {
  var AIGCUtils = window.AIGCUtils;

  /**
   * 全局音效。素材来自 assets/声音（文件名即场景），能复用则复用。
   * 设计：docs/codeMonkey/specs/2026-11-22--16-用户音效替换占位蜂鸣-design.md
   * 循环音效必须在对应交互结束时 stopLoop（烤鱼火焰、拉线）。
   */
  var CATALOG = {
    // 用户：按钮点击音效.wav
    "ui.click": "res/Audio/ui/click.wav",
    // 用户：结算-金币到账.mp3（结算弹窗复用）
    "ui.settle_open": "res/Audio/common/coin.mp3",
    "common.coin": "res/Audio/common/coin.mp3",
    // 用户：胜利音效.wav
    "common.success": "res/Audio/common/success.wav",
    // 暂无独立失败音 → 复用按钮
    "common.fail": "res/Audio/ui/click.wav",
    // 用户：钓鱼-抛竿&收杆音效.mp3
    "fish.cast": "res/Audio/fish/cast_reel.mp3",
    "fish.bite": "res/Audio/fish/cast_reel.mp3",
    "fish.catch": "res/Audio/fish/cast_reel.mp3",
    // 用户：钓鱼-拉鱼线时的循环音效（flac→wav）
    "fish.reel": "res/Audio/fish/reel_loop.wav",
    // 用户：椰子点击音效（flac→wav）
    "coco.shake": "res/Audio/coco/tap.wav",
    "coco.catch": "res/Audio/coco/tap.wav",
    "coco.miss_crack": "res/Audio/coco/tap.wav",
    "juice.crack": "res/Audio/coco/tap.wav",
    "shop.ingredient": "res/Audio/coco/tap.wav",
    // 建店暂无专属 → 复用按钮 / 胜利
    "build.hit": "res/Audio/ui/click.wav",
    "build.hit_chop": "res/Audio/ui/click.wav",
    "build.hit_saw": "res/Audio/ui/click.wav",
    "build.hit_assemble": "res/Audio/ui/click.wav",
    "build.hit_fire": "res/Audio/ui/click.wav",
    "build.step_done": "res/Audio/common/success.wav",
    "build.done": "res/Audio/common/success.wav",
    // 用户：烤鱼-火焰燃烧音效.mp3（仅 cooking 循环）
    "shop.grill_loop": "res/Audio/shop/grill_fire.mp3",
    "shop.flip": "res/Audio/ui/click.wav",
    "shop.customer_arrive": "res/Audio/ui/click.wav",
    // 用户：烤鱼区-顾客取餐成功音效.mp3
    "shop.deliver": "res/Audio/shop/deliver.mp3",
    // 分区 BGM（assets/声音；已做首尾淡化循环衔接）
    "bgm.map": "res/Audio/bgm/bgm_map.mp3",
    "bgm.coconut": "res/Audio/bgm/bgm_coco.mp3",
    "bgm.shop": "res/Audio/bgm/bgm_shop.mp3",
    "bgm.fishing": "res/Audio/bgm/bgm_fish.mp3",
    "bgm.fishing_wave": "res/Audio/bgm/bgm_fish_wave.mp3"
  };

  var AREA_BGM = {
    map: "bgm.map",
    coconut: "bgm.coconut",
    shop: "bgm.shop",
    build: "bgm.shop",
    fishing: "bgm.fishing"
  };

  var BUILD_HIT = {
    chop: "build.hit_chop",
    saw: "build.hit_saw",
    assemble: "build.hit_assemble",
    fire: "build.hit_fire"
  };

  AIGCUtils.SoundManager = {
    bgmEnabled: true,
    sfxEnabled: true,
    gestureUnlocked: false,
    currentArea: null,
    currentBgmId: null,
    _lastPlayAt: {},
    _activeLoops: {},
    _throttleMs: 80,

    init: function () {
      try {
        if (typeof KwaiStorage !== "undefined") {
          var settings = KwaiStorage.getSync("island_bakery_settings");
          if (settings) {
            AIGCUtils.SoundManager.bgmEnabled = settings.bgmEnabled !== false;
            AIGCUtils.SoundManager.sfxEnabled = settings.sfxEnabled !== false;
          }
        }
      } catch (e) {
        console.error("[Sound] Load settings failed:", e);
      }
      // 快手小游戏可自动播；H5 也会尝试自动播，失败再等点击兜底
      if (typeof ks !== "undefined") {
        AIGCUtils.SoundManager.gestureUnlocked = true;
      }
      if (typeof KwaiMedia !== "undefined" && KwaiMedia.Audio) {
        KwaiMedia.Audio.setBgmEnabled(AIGCUtils.SoundManager.bgmEnabled);
        KwaiMedia.Audio.setSfxEnabled(AIGCUtils.SoundManager.sfxEnabled);
      }
      AIGCUtils.SoundManager._bindAutoplayHooks();
      console.log(
        "[Sound] init user-assets",
        "bgm=" + AIGCUtils.SoundManager.bgmEnabled,
        "sfx=" + AIGCUtils.SoundManager.sfxEnabled,
        "auto=" + AIGCUtils.SoundManager.gestureUnlocked
      );
    },

    resolve: function (id) {
      return CATALOG[id] || null;
    },

    /** 刷新进区后自动开 BGM（不依赖先点一下） */
    tryAutoplayBgm: function () {
      if (!AIGCUtils.SoundManager.bgmEnabled) return;
      var area =
        (AIGCUtils.Game && AIGCUtils.Game.building && "build") ||
        (AIGCUtils.Game && AIGCUtils.Game.currentArea) ||
        AIGCUtils.SoundManager.currentArea ||
        null;
      if (!area) return;
      // 允许 BGM 在无手势时也尝试播放
      AIGCUtils.SoundManager._bgmAutoplayTried = true;
      AIGCUtils.SoundManager.setArea(area, true);
      console.log("[Sound] tryAutoplayBgm", area);
    },

    _bindAutoplayHooks: function () {
      if (AIGCUtils.SoundManager._autoplayBound) return;
      AIGCUtils.SoundManager._autoplayBound = true;
      var retry = function () {
        AIGCUtils.SoundManager.tryAutoplayBgm();
      };
      setTimeout(retry, 0);
      setTimeout(retry, 350);
      setTimeout(retry, 1000);
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", function () {
          if (!document.hidden) retry();
        });
        // 部分 H5 在 pageshow / 焦点回前台时可补播
        window.addEventListener("pageshow", retry);
        window.addEventListener("focus", retry);
      }
      if (typeof KwaiBase !== "undefined" && KwaiBase.onShow) {
        KwaiBase.onShow(function () { retry(); });
      }
    },

    noteUserGesture: function () {
      if (AIGCUtils.SoundManager.gestureUnlocked) {
        // 已解锁仍可能因 H5 首次自动播失败，补一次当前区
        if (!AIGCUtils.SoundManager._bgmPlayingConfirmed) {
          AIGCUtils.SoundManager.tryAutoplayBgm();
        }
        return;
      }
      AIGCUtils.SoundManager.gestureUnlocked = true;
      console.log("[Sound] user gesture unlocked audio");
      AIGCUtils.SoundManager.tryAutoplayBgm();
    },

    /** 预加载当前区 BGM，刷新进烤鱼店后首次点击可立刻出声 */
    preloadAreaBgm: function (area) {
      if (!area || typeof KwaiMedia === "undefined" || !KwaiMedia.Audio) return;
      var bgmId = AREA_BGM[area];
      if (!bgmId) return;
      var path = AIGCUtils.SoundManager.resolve(bgmId);
      if (!path) return;
      if (KwaiMedia.Audio.preloadBgm) KwaiMedia.Audio.preloadBgm(path);
      AIGCUtils.SoundManager.currentBgmId = bgmId;
      if (area === "fishing") {
        var wavePath = AIGCUtils.SoundManager.resolve("bgm.fishing_wave");
        if (wavePath && KwaiMedia.Audio.preloadBgmLayer) {
          KwaiMedia.Audio.preloadBgmLayer("fishing_wave", wavePath, 1);
        }
      }
      console.log("[Sound] preloadAreaBgm", area, bgmId);
    },

    play: function (id, options) {
      if (!AIGCUtils.SoundManager.sfxEnabled) return false;
      if (!AIGCUtils.SoundManager.gestureUnlocked && !(options && options.allowBeforeGesture)) {
        return false;
      }
      var path = AIGCUtils.SoundManager.resolve(id);
      if (!path) {
        console.warn("[Sound] unknown id", id);
        return false;
      }
      var minGap = (options && options.throttleMs) || AIGCUtils.SoundManager._throttleMs;
      var now = typeof AIGCUtils._now === "function" ? AIGCUtils._now() : Date.now();
      var last = AIGCUtils.SoundManager._lastPlayAt[id] || 0;
      if (now - last < minGap) return false;
      AIGCUtils.SoundManager._lastPlayAt[id] = now;
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Audio) return false;
      var vol = options && options.volume !== undefined ? options.volume : 1;
      KwaiMedia.Audio.playSfx(path, vol);
      return true;
    },

    playLoop: function (id) {
      if (!AIGCUtils.SoundManager.sfxEnabled) return false;
      if (!AIGCUtils.SoundManager.gestureUnlocked) return false;
      if (AIGCUtils.SoundManager._activeLoops[id]) return true;
      var path = AIGCUtils.SoundManager.resolve(id);
      if (!path) {
        console.warn("[Sound] unknown loop id", id);
        return false;
      }
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Audio || !KwaiMedia.Audio.playLoop) {
        console.warn("[Sound] playLoop unavailable, skip", id);
        return false;
      }
      KwaiMedia.Audio.playLoop(path);
      AIGCUtils.SoundManager._activeLoops[id] = path;
      console.log("[Sound] loop start", id, path);
      return true;
    },

    stopLoop: function (id) {
      var path = AIGCUtils.SoundManager._activeLoops[id];
      if (!path) return;
      if (typeof KwaiMedia !== "undefined" && KwaiMedia.Audio && KwaiMedia.Audio.stopLoop) {
        KwaiMedia.Audio.stopLoop(path);
      }
      delete AIGCUtils.SoundManager._activeLoops[id];
      console.log("[Sound] loop stop", id);
    },

    stopAllLoops: function () {
      var ids = Object.keys(AIGCUtils.SoundManager._activeLoops);
      for (var i = 0; i < ids.length; i++) {
        AIGCUtils.SoundManager.stopLoop(ids[i]);
      }
    },

    /**
     * 切区：停玩法循环音 → 切 BGM。
     * 钓鱼区：主曲 + 海浪叠轨，等音量；其它区单轨。
     * 刷新落在烤鱼店时：先 preload，首次手势 force 播放且不 stop 清掉 preload。
     */
    setArea: function (area, force) {
      if (!area) return;
      var prevArea = AIGCUtils.SoundManager.currentArea;
      if (!force && prevArea === area) return;
      var unlockingSame = !!(force && prevArea === area);
      AIGCUtils.SoundManager.currentArea = area;
      AIGCUtils.SoundManager.stopAllLoops();

      var bgmId = AREA_BGM[area];
      if (!AIGCUtils.SoundManager.bgmEnabled) {
        AIGCUtils.SoundManager.preloadAreaBgm(area);
        console.log("[Sound] setArea", area, "(bgm off, preloaded)");
        return;
      }
      if (!bgmId) {
        console.warn("[Sound] no bgm for area", area);
        return;
      }

      if (typeof KwaiMedia !== "undefined" && KwaiMedia.Audio) {
        if (unlockingSame) {
          console.log("[Sound] same area bgm play", area, bgmId);
        } else if (AIGCUtils.SoundManager.currentBgmId !== bgmId) {
          KwaiMedia.Audio.stopBgm();
          AIGCUtils.SoundManager.currentBgmId = null;
        } else if (area !== "fishing") {
          // shop/build 共用曲：确保仍在播
          AIGCUtils.SoundManager.playBgmId(bgmId);
          console.log("[Sound] setArea", area, "reuse/resume bgm", bgmId);
          return;
        } else if (KwaiMedia.Audio.stopBgmLayers) {
          KwaiMedia.Audio.stopBgmLayers();
        }
      }

      AIGCUtils.SoundManager.playBgmId(bgmId);
      if (area === "fishing") {
        AIGCUtils.SoundManager.playBgmLayer("fishing_wave", "bgm.fishing_wave", 1);
      } else if (typeof KwaiMedia !== "undefined" && KwaiMedia.Audio && KwaiMedia.Audio.stopBgmLayers) {
        KwaiMedia.Audio.stopBgmLayers();
      }
      console.log("[Sound] setArea", area, bgmId, area === "fishing" ? "+wave" : "");
    },

    playBgmId: function (bgmId) {
      if (!AIGCUtils.SoundManager.bgmEnabled) return;
      var path = AIGCUtils.SoundManager.resolve(bgmId);
      if (!path) return;
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Audio) return;
      AIGCUtils.SoundManager.currentBgmId = bgmId;
      KwaiMedia.Audio.playBgm(path);
      AIGCUtils.SoundManager._bgmPlayingConfirmed = true;
    },

    playBgmLayer: function (layerKey, bgmId, volumeScale) {
      if (!AIGCUtils.SoundManager.bgmEnabled) return;
      var path = AIGCUtils.SoundManager.resolve(bgmId);
      if (!path) return;
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Audio || !KwaiMedia.Audio.playBgmLayer) return;
      KwaiMedia.Audio.playBgmLayer(layerKey, path, volumeScale === undefined ? 1 : volumeScale);
    },

    playBgm: function (name) {
      AIGCUtils.SoundManager.playBgmId("bgm." + name);
    },

    playSfx: function (name) {
      if (name === "bite") return AIGCUtils.SoundManager.play("fish.bite");
      return AIGCUtils.SoundManager.play(name);
    },

    playCollect: function () {
      AIGCUtils.SoundManager.play("coco.catch");
    },
    playBake: function () {
      AIGCUtils.SoundManager.play("shop.flip");
    },
    playSell: function () {
      AIGCUtils.SoundManager.play("shop.deliver");
    },
    playCoin: function () {
      AIGCUtils.SoundManager.play("common.coin");
    },
    playUpgrade: function () {
      AIGCUtils.SoundManager.play("common.success");
    },
    playDefense: function () {},
    playNight: function () {},
    playDay: function () {},

    playBuildHit: function (stage) {
      var id = BUILD_HIT[stage] || "build.hit";
      return AIGCUtils.SoundManager.play(id);
    },

    setBgmEnabled: function (enabled) {
      AIGCUtils.SoundManager.bgmEnabled = enabled;
      if (typeof KwaiMedia !== "undefined" && KwaiMedia.Audio) {
        KwaiMedia.Audio.setBgmEnabled(enabled);
      }
      if (enabled && AIGCUtils.SoundManager.gestureUnlocked && AIGCUtils.SoundManager.currentArea) {
        AIGCUtils.SoundManager.setArea(AIGCUtils.SoundManager.currentArea, true);
      } else if (!enabled && typeof KwaiMedia !== "undefined" && KwaiMedia.Audio) {
        KwaiMedia.Audio.stopBgm();
      }
      AIGCUtils.SoundManager.saveSettings();
    },

    setSfxEnabled: function (enabled) {
      AIGCUtils.SoundManager.sfxEnabled = enabled;
      if (typeof KwaiMedia !== "undefined" && KwaiMedia.Audio) {
        KwaiMedia.Audio.setSfxEnabled(enabled);
      }
      if (!enabled) AIGCUtils.SoundManager.stopAllLoops();
      AIGCUtils.SoundManager.saveSettings();
    },

    saveSettings: function () {
      try {
        if (typeof KwaiStorage !== "undefined") {
          KwaiStorage.setSync("island_bakery_settings", {
            bgmEnabled: AIGCUtils.SoundManager.bgmEnabled,
            sfxEnabled: AIGCUtils.SoundManager.sfxEnabled
          });
        }
      } catch (e) {
        console.error("[Sound] Save settings failed:", e);
      }
    }
  };
})();
