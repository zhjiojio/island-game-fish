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
    goFishingPrompt: false,
    goFishingSpeciesId: "small",
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
      this.bindEvents();
      this.bindLifecycle();
      if (!AIGCUtils.GameState.lastOnlineTime) AIGCUtils.GameState.lastOnlineTime = Date.now();
      AIGCUtils.OfflineManager.calculateEarnings();
      this.offlineDialog = !!AIGCUtils.GameState.pendingOffline;
      if (AIGCUtils.GameState.shopBuilt) {
        this.currentArea = "shop";
      } else if (AIGCUtils.GameState.readyToBuild()) {
        this.currentArea = "coconut";
        AIGCUtils.Collection.phase = "coconutSummary";
      } else {
        this.currentArea = AIGCUtils.GameState.tasks.fish ? "coconut" : "fishing";
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
      this.offlineDialog = !!AIGCUtils.GameState.pendingOffline;
    },

    advancePlayTime: function (dt) {
      var state = AIGCUtils.GameState;
      state.playTimeMs += dt;
      this.checkpointTimeMs += dt;
      if (this.checkpointTimeMs >= 60000) {
        this.checkpointTimeMs = 0;
        AIGCUtils.OfflineManager.updateOnlineTime();
      }
      if (state.playTimeMs < 20 * 60 * 1000) return;
      state.stage = Math.max(3, state.stage || 1);
      if (state.offlinePromptSeen) return;
      state.offlinePromptSeen = true;
      this.offlinePrompt = true;
      state.save();
      console.log("[Prototype] Offline unlock reached", state.playTimeMs);
    },

    showOfflineEntry: function () {
      if (AIGCUtils.GameState.pendingOffline) {
        this.offlineDialog = true;
      } else if (!AIGCUtils.GameState.offlineUnlocked && AIGCUtils.GameState.playTimeMs >= 20 * 60 * 1000) {
        this.offlinePrompt = true;
      } else if (AIGCUtils.GameState.playTimeMs < 20 * 60 * 1000) {
        this.notify("离线采集暂未解锁");
      } else if (AIGCUtils.GameState.offlineUnlocked) {
        this.notify("离线采集已开启");
      }
    },

    closeGoFishingPrompt: function () {
      this.goFishingPrompt = false;
    },

    confirmGoFishing: function () {
      this.goFishingPrompt = false;
      this.navigate("fishing");
    },

    closeOfflinePrompt: function () {
      this.offlinePrompt = false;
    },

    unlockOffline: function () {
      if (this.offlineAdBusy || AIGCUtils.GameState.offlineUnlocked || AIGCUtils.GameState.playTimeMs < 20 * 60 * 1000) return false;
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
        game.notify("未解锁 可稍后再试");
      });
      return true;
    },

    claimOffline: function (doubleReward) {
      if (this.offlineAdBusy || !AIGCUtils.GameState.pendingOffline) return false;
      var game = this;
      if (!doubleReward) {
        AIGCUtils.OfflineManager.claimEarnings(false);
        this.offlineDialog = false;
        return true;
      }
      this.offlineAdBusy = true;
      KwaiAd.showRewarded(function () {
        AIGCUtils.OfflineManager.claimEarnings(true);
        game.offlineAdBusy = false;
        game.offlineDialog = false;
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
    },

    beginBuild: function () {
      if (this.building || AIGCUtils.GameState.shopBuilt) return;
      if (!AIGCUtils.GameState.readyToBuild()) {
        this.notify("先完成钓鱼和采摘");
        return;
      }
      AIGCUtils.Collection.phase = "idle";
      AIGCUtils.Collection.coconuts = [];
      this.building = true;
      this.buildProgress = 0;
      this.buildStage = "chop";
      this.buildHits = 0;
      this.buildAnim = 0;
      this.currentArea = "build";
      this.showInventory = false;
      console.log("[Prototype] Shop construction started");
    },

    buildAction: function () {
      if (!this.building) return false;
      var stages = ["chop", "saw", "assemble", "fire"];
      var required = [3, 3, 4, 2];
      var stageIndex = stages.indexOf(this.buildStage);
      if (stageIndex < 0) return false;
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
      this.currentArea = area;
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
      this.advancePlayTime(Math.max(0, dt));
      dt = Math.min(50, Math.max(0, dt));
      if (this.messageTimer > 0) this.messageTimer -= dt;
      if (this.offlinePrompt || this.offlineDialog || this.energyPrompt) return;
      if (this.building) {
        this.buildAnim += dt;
        return;
      }
      if (this.currentArea === "fishing" || this.currentArea === "coconut") {
        AIGCUtils.Collection.update(dt);
      }
      AIGCUtils.Baking.update(dt);
      if (AIGCUtils.GameState.shopBuilt) AIGCUtils.Selling.update(dt);
    },

    draw: function () {
      AIGCUtils.Renderer.draw();
    }
  };
})();
