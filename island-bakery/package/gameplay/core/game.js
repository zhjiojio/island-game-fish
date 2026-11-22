(function () {
  var AIGCUtils = window.AIGCUtils;
  AIGCUtils.EventBus = AIGCUtils.EventBus || window.KwaiEvent;
  var EventBus = AIGCUtils.EventBus;

  AIGCUtils.Game = {
    lastTime: 0,
    currentArea: "fishing",
    building: false,
    buildProgress: 0,
    buildStage: "chop",
    buildHits: 0,
    buildAnim: 0,
    message: "",
    messageTimer: 0,
    showInventory: false,
    energyPrompt: null,
    energyAdBusy: false,
    offlinePrompt: false,
    offlineDialog: false,
    offlineAdBusy: false,
    offlineUnlockMs: 15 * 60 * 1000,
    // 仅本局内存：稍后再说关掉后，本次游玩不再自动弹；下次进入且未解锁会再弹。
    offlinePromptDismissed: false,
    goFishingPrompt: false,
    goFishingSpeciesId: "small",
    // 地图点带锁路牌 / 未建烤鱼店：弹「未达到解锁条件」+ 分区条件
    mapLockedPrompt: false,
    mapLockedZone: null,
    suspended: false,
    checkpointTimeMs: 0,
    initialized: false,

    init: function () {
      if (this.initialized) return;
      this.initialized = true;
      this.lastTime = AIGCUtils._now();
      AIGCUtils.GameState.init();
      AIGCUtils.Energy.init();
      AIGCUtils.Collection.init();
      AIGCUtils.Baking.init();
      AIGCUtils.Selling.init();
      if (AIGCUtils.AnimDriver) AIGCUtils.AnimDriver.init();
      if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.init();
      this.bindEvents();
      this.bindLifecycle();
      if (!AIGCUtils.GameState.lastOnlineTime) AIGCUtils.GameState.lastOnlineTime = Date.now();
      AIGCUtils.OfflineManager.calculateEarnings();
      this.offlineDialog = !!AIGCUtils.GameState.pendingOffline;
      // R0025：新人引导未完成时由 Onboarding 决定落点；完成后沿用原进度落点
      var onboardLanded =
        AIGCUtils.Onboarding && AIGCUtils.Onboarding.applyInitLanding(this);
      if (!onboardLanded) {
        if (AIGCUtils.GameState.shopBuilt) {
          this.currentArea = "shop";
        } else if (AIGCUtils.GameState.readyToBuild()) {
          this.currentArea = "coconut";
          AIGCUtils.Collection.phase = "coconutSummary";
        } else {
          this.currentArea = AIGCUtils.GameState.tasks.fish ? "coconut" : "fishing";
        }
      }
      // 刷新进区：preload 后立即尝试自动播 BGM（快手可无手势；H5 尽力自动播）
      if (AIGCUtils.SoundManager) {
        AIGCUtils.SoundManager.currentArea = this.currentArea;
        AIGCUtils.SoundManager.preloadAreaBgm(this.currentArea);
        AIGCUtils.SoundManager.tryAutoplayBgm();
      }
      if (this.offlineDialog && AIGCUtils.SoundManager) {
        this._offlineSettleSoundPending = true;
      }
      console.log("[Prototype] Day one initialized", this.currentArea);
    },

    bindLifecycle: function () {
      var game = this;
      KwaiBase.onHide(function () { game.handleHide(); });
      KwaiBase.onShow(function () { game.handleShow(); });
    },

    handleHide: function () {
      this.suspended = true;
      AIGCUtils.OfflineManager.updateOnlineTime();
      console.log("[Prototype] Offline timestamp saved");
    },

    handleShow: function () {
      this.suspended = false;
      this.lastTime = AIGCUtils._now();
      AIGCUtils.OfflineManager.calculateEarnings();
      var hadOffline = this.offlineDialog;
      this.offlineDialog = !!AIGCUtils.GameState.pendingOffline;
      if (this.offlineDialog && !hadOffline && AIGCUtils.SoundManager) {
        AIGCUtils.SoundManager.play("ui.settle_open");
      }
      if (this.offlineAdBusy || this.energyAdBusy) return;
      this.offlinePromptDismissed = false;
      this.tryArmOfflinePrompt();
    },

    advancePlayTime: function (dt) {
      var state = AIGCUtils.GameState;
      state.playTimeMs += dt;
      this.checkpointTimeMs += dt;
      if (this.checkpointTimeMs >= 60000) {
        this.checkpointTimeMs = 0;
        AIGCUtils.OfflineManager.updateOnlineTime();
      }
      if (state.playTimeMs < this.offlineUnlockMs) return;
      state.stage = Math.max(3, state.stage || 1);
      this.tryArmOfflinePrompt();
    },

    tryArmOfflinePrompt: function () {
      var state = AIGCUtils.GameState;
      if (state.playTimeMs < this.offlineUnlockMs) return;
      if (!this._offlineThresholdLogged) {
        this._offlineThresholdLogged = true;
        console.log(
          "[Prototype] Offline threshold",
          "playTimeMs=" + state.playTimeMs,
          "offlinePromptSeen=" + state.offlinePromptSeen,
          "offlineUnlocked=" + state.offlineUnlocked,
          "offlinePrompt=" + this.offlinePrompt
        );
      }
      if (state.offlineUnlocked) return;
      if (this.offlinePromptDismissed) return;
      if (this.offlinePrompt) return;
      if (this.offlineDialog || this.energyPrompt || this.mapLockedPrompt) return;
      if (AIGCUtils.Onboarding && AIGCUtils.Onboarding.isDialogOpen()) return;
      // 弹窗是否看过只在 drawOfflinePrompt 真正画出来之后写入。
      // 这里不能提前落盘，否则存档里的 offlinePromptSeen 会在没画出时挡住下一次。
      this.offlinePrompt = true;
      if (!this._offlinePlayTimeSaved) {
        this._offlinePlayTimeSaved = true;
        state.save();
      }
      console.log("[Prototype] Offline prompt armed", "playTimeMs=" + state.playTimeMs);
    },

    showOfflineEntry: function () {
      if (AIGCUtils.GameState.pendingOffline) {
        this.offlineDialog = true;
        if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.play("ui.settle_open");
      } else if (!AIGCUtils.GameState.offlineUnlocked && AIGCUtils.GameState.playTimeMs >= this.offlineUnlockMs) {
        this.offlinePromptDismissed = false;
        this.offlinePrompt = true;
      } else if (AIGCUtils.GameState.playTimeMs < this.offlineUnlockMs) {
        this.notify("离线采集暂未解锁");
      } else if (AIGCUtils.GameState.offlineUnlocked) {
        this.notify("离线采集已开启");
      }
    },

    closeGoFishingPrompt: function () {
      this.goFishingPrompt = false;
    },

    showMapLockedPrompt: function (zoneKey) {
      this.mapLockedZone = zoneKey || null;
      this.mapLockedPrompt = true;
      console.log("[MapLocked] prompt open zone=" + this.mapLockedZone);
    },

    closeMapLockedPrompt: function () {
      var prev = this.mapLockedZone;
      this.mapLockedPrompt = false;
      this.mapLockedZone = null;
      console.log("[MapLocked] prompt closed zone=" + prev);
    },

    confirmGoFishing: function () {
      this.goFishingPrompt = false;
      this.navigate("fishing");
    },

    closeOfflinePrompt: function () {
      this.offlinePrompt = false;
      this.offlinePromptDismissed = true;
      console.log(
        "[Prototype] Offline prompt dismissed",
        "playTimeMs=" + AIGCUtils.GameState.playTimeMs,
        "offlineUnlocked=" + AIGCUtils.GameState.offlineUnlocked
      );
    },

    unlockOffline: function () {
      if (this.offlineAdBusy || AIGCUtils.GameState.offlineUnlocked || AIGCUtils.GameState.playTimeMs < this.offlineUnlockMs) return false;
      var game = this;
      this.offlineAdBusy = true;
      KwaiAd.showRewarded(function () {
        AIGCUtils.GameState.offlineUnlocked = true;
        AIGCUtils.GameState.lastOnlineTime = Date.now();
        AIGCUtils.GameState.save();
        game.offlineAdBusy = false;
        game.offlinePrompt = false;
        game.notify("离线采集已永久解锁");
        console.log("[Prototype] Offline collection permanently unlocked");
      }, function () {
        game.offlineAdBusy = false;
        game.offlinePrompt = false;
        game.offlinePromptDismissed = true;
        game.notify("未解锁 可稍后再试");
        console.log("[Prototype] Offline unlock ad cancelled", AIGCUtils.GameState.playTimeMs);
      });
      return true;
    },

    claimOffline: function (doubleReward) {
      if (this.offlineAdBusy || !AIGCUtils.GameState.pendingOffline) return false;
      var game = this;
      if (!doubleReward) {
        AIGCUtils.OfflineManager.claimEarnings(false);
        this.offlineDialog = false;
        if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.play("common.success");
        return true;
      }
      this.offlineAdBusy = true;
      KwaiAd.showRewarded(function () {
        AIGCUtils.OfflineManager.claimEarnings(true);
        game.offlineAdBusy = false;
        game.offlineDialog = false;
        if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.play("common.success");
        game.notify("双倍食材已放入背包");
      }, function () {
        game.offlineAdBusy = false;
        game.notify("未领取 可稍后再试");
      });
      return true;
    },

    closeOfflineDialog: function () {
      this.offlineDialog = false;
    },

    bindEvents: function () {
      var game = this;
      EventBus.on("collection:collected", function (data) {
        if (data.type === "coconut") game.notify("+1 椰子");
        if (data.type === "goldenCoconut") game.notify("+1 金椰子");
      });
      EventBus.on("baking:qte", function (data) {
        if (data.stage === "stoke") game.notify(data.perfect ? "完美火势 烤制加速20%" : "生火完成");
        if (data.stage === "flip") game.notify(data.perfect ? "外焦里嫩" : "一般");
      });
      EventBus.on("selling:sold", function (data) {
        console.log("[Prototype] Coins received", data.price);
      });
      // R0026：结束弹窗改在烤鱼落盘完成时触发（见 Baking.update），此处不再订阅 baking:done
    },

    beginBuild: function () {
      if (this.building || AIGCUtils.GameState.shopBuilt) return;
      if (!AIGCUtils.GameState.readyToBuild()) {
        this.notify("先完成钓鱼和采摘");
        return;
      }
      AIGCUtils.Collection.phase = "idle";
      AIGCUtils.Collection.coconuts = [];
      this.showInventory = false;
      // R0026：跳过砍树/锯木/搭建小游戏，直接开业进店
      console.log("[Onboarding] skip build mini-game → open shop");
      this.finishBuild();
    },

    buildAction: function () {
      if (!this.building) return false;
      var stages = ["chop", "saw", "assemble", "fire"];
      var required = [3, 3, 4, 2];
      var stageIndex = stages.indexOf(this.buildStage);
      if (stageIndex < 0) return false;
      var hitStage = this.buildStage;
      if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.playBuildHit(hitStage);
      this.buildHits++;
      this.buildAnim = 0;
      this.buildProgress = (stageIndex + this.buildHits / required[stageIndex]) / stages.length;
      if (this.buildHits >= required[stageIndex]) {
        if (stageIndex === stages.length - 1) {
          this.finishBuild();
          return true;
        }
        this.buildStage = stages[stageIndex + 1];
        this.buildHits = 0;
        if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.play("build.step_done");
      }
      console.log("[Prototype] Build action", this.buildStage, this.buildHits);
      return true;
    },

    finishBuild: function () {
      this.building = false;
      this.buildProgress = 1;
      AIGCUtils.GameState.shopBuilt = true;
      AIGCUtils.GameState.save();
      AIGCUtils.Selling.start();
      this.currentArea = "shop";
      if (AIGCUtils.Onboarding) AIGCUtils.Onboarding.onFinishBuild();
      if (AIGCUtils.SoundManager) {
        AIGCUtils.SoundManager.play("build.done");
        AIGCUtils.SoundManager.setArea("shop");
      }
      this.notify("烤鱼店开业");
      console.log("[Prototype] Shop opened");
    },

    navigate: function (area) {
      if (this.building) return false;
      this.showInventory = false;
      var fishingPhases = ["charging", "waiting", "bite", "reeling", "fishCaught", "fishEscaped"];
      if (this.currentArea === "fishing" && area !== "fishing" && fishingPhases.indexOf(AIGCUtils.Collection.phase) >= 0) {
        AIGCUtils.Collection.leaveFishing();
      }
      if (this.currentArea === "coconut" && area !== "coconut" && AIGCUtils.Collection.phase === "coconutRound") {
        AIGCUtils.Collection.leaveCoconut();
      }
      if (area === "map") {
        this.currentArea = "map";
        if (AIGCUtils.Onboarding) AIGCUtils.Onboarding.syncArrowForMap();
        if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.setArea("map");
        return true;
      }
      if (area === "shop" && !AIGCUtils.GameState.shopBuilt) {
        this.notify("先完成采集");
        return false;
      }
      if (area === "coconut" && !AIGCUtils.GameState.tasks.fish && !AIGCUtils.GameState.shopBuilt) {
        this.notify("先完成钓鱼");
        return false;
      }
      if (area === "coconut" && AIGCUtils.GameState.shopBuilt && AIGCUtils.Collection.phase === "coconutSummary") {
        AIGCUtils.Collection.phase = "idle";
      }
      if (area === "fishing") {
        var fishingBusy = ["idle", "charging", "waiting", "bite", "reeling", "fishCaught", "fishEscaped", "fishResult"];
        if (fishingBusy.indexOf(AIGCUtils.Collection.phase) < 0) {
          console.log("[Prototype] Fishing phase reset on enter", AIGCUtils.Collection.phase);
          AIGCUtils.Collection.resetFish();
        }
      }
      this.currentArea = area;
      if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.setArea(area);
      return true;
    },

    startRecipe: function (recipeId, options) {
      if (!AIGCUtils.GameState.shopBuilt) return;
      var result = AIGCUtils.Baking.start(recipeId, options);
      if (!result.success) {
        if (result.message === "缺少这种鱼") {
          this.goFishingSpeciesId = options && options.speciesId ? AIGCUtils.Recipes.normalizeSpeciesId(options.speciesId) : "small";
          this.goFishingPrompt = true;
        } else if (result.message === "缺椰子") {
          this.notify("缺椰子 去椰林区");
        } else {
          this.notify(result.message);
        }
        return;
      }
      // 首次烤鱼引导：成功开烤后写入存档，后续不再画箭头
      if (recipeId === "fish_grilled" && !AIGCUtils.GameState.grillFishGuideSeen) {
        AIGCUtils.GameState.grillFishGuideSeen = true;
        AIGCUtils.GameState.save();
        console.log("[ShopGuide] grillFishGuideSeen saved after first fish_grilled start");
      }
    },

    sellCustomer: function (index) {
      var result = AIGCUtils.Selling.sell(index);
      if (!result.success) this.notify(result.message);
    },

    notify: function (text) {
      if (this.message === text && this.messageTimer > 0) return;
      this.message = text;
      this.messageTimer = 1500;
    },

    showEnergyPrompt: function (type) {
      this.energyPrompt = type;
      this.showInventory = false;
      return false;
    },

    closeEnergyPrompt: function () {
      this.energyPrompt = null;
    },

    restoreEnergyByAd: function () {
      if (this.energyAdBusy || !this.energyPrompt) return false;
      var game = this;
      var type = this.energyPrompt;
      var energy = AIGCUtils.Energy.get(type);
      if (energy.remainingAds === 0) {
        this.notify("今日恢复次数已用完");
        return false;
      }
      this.energyAdBusy = true;
      KwaiAd.showRewarded(function () {
        AIGCUtils.Energy.restoreWithAd(type);
        game.energyAdBusy = false;
        game.energyPrompt = null;
        game.notify("体力已全部恢复");
      }, function () {
        game.energyAdBusy = false;
        game.notify("未恢复体力");
      });
      return true;
    },

    update: function (dt) {
      if (this.suspended) return;
      // R0037：资源门闸未过不跑玩法逻辑，避免加载中推进采集/烤制
      if (AIGCUtils.Renderer && AIGCUtils.Renderer.isBootReady && !AIGCUtils.Renderer.isBootReady(this.currentArea)) {
        return;
      }
      this.advancePlayTime(Math.max(0, dt));
      dt = Math.min(50, Math.max(0, dt));
      if (this.messageTimer > 0) this.messageTimer -= dt;
      if (
        this.offlinePrompt ||
        this.offlineDialog ||
        this.energyPrompt ||
        this.mapLockedPrompt ||
        (AIGCUtils.Onboarding && AIGCUtils.Onboarding.isDialogOpen())
      ) {
        return;
      }
      if (this.building) {
        this.buildAnim += dt;
        return;
      }
      if (this.currentArea === "fishing" || this.currentArea === "coconut") {
        AIGCUtils.Collection.update(dt);
      }
      AIGCUtils.Baking.update(dt);
      if (AIGCUtils.GameState.shopBuilt) AIGCUtils.Selling.update(dt);
      if (AIGCUtils.AnimDriver) AIGCUtils.AnimDriver.update(dt);
    },

    draw: function () {
      AIGCUtils.Renderer.draw();
    }
  };
})();
