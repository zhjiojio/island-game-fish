(function () {
  var AIGCUtils = window.AIGCUtils;

  /**
   * 新人引导状态机（R0025）：地图起手 → 钓鱼 → 椰林 → 烤鱼店 → 首次烤鱼结束。
   * 存档字段：GameState.onboarding = { done, stage }
   * 运行时：dialog / arrowZone 仅本局内存，由 stage 在 init 时恢复。
   */
  var STAGES = {
    intro: "intro",
    mapFishing: "mapFishing",
    coconutGuide: "coconutGuide",
    mapCoconut: "mapCoconut",
    coconutRound: "coconutRound",
    mapShop: "mapShop",
    shopBuild: "shopBuild",
    grill: "grill",
    done: "done"
  };

  function defaults() {
    return { done: false, stage: STAGES.intro };
  }

  function hasLegacyProgress(state) {
    if (!state) return false;
    if ((state.fishCaught || 0) > 0) return true;
    if (state.shopBuilt) return true;
    if (state.stats && (state.stats.totalBaked || 0) > 0) return true;
    if (state.tasks && (state.tasks.fish || state.tasks.coconut)) return true;
    return false;
  }

  AIGCUtils.Onboarding = {
    STAGES: STAGES,
    /** @type {null|"intro"|"coconutGuide"|"end"} */
    dialog: null,
    /** @type {null|"fishing"|"coconut"|"shop"} */
    arrowZone: null,
    /** 引导按钮热区，由 Renderer.drawOnboardingDialog 写入，Input 读取 */
    buttonBox: null,

    normalize: function (raw, state) {
      if (raw && typeof raw === "object") {
        var stage = raw.stage || STAGES.intro;
        var done = !!raw.done || stage === STAGES.done;
        if (done) return { done: true, stage: STAGES.done };
        if (!STAGES[stage]) stage = STAGES.intro;
        return { done: false, stage: stage };
      }
      // 旧档兼容：已有进度视为引导完成，不重播；零进度仍走新引导
      if (hasLegacyProgress(state)) {
        console.log("[Onboarding] legacy save → done");
        return { done: true, stage: STAGES.done };
      }
      console.log("[Onboarding] fresh save → intro");
      return defaults();
    },

    get: function () {
      var state = AIGCUtils.GameState;
      if (!state.onboarding) state.onboarding = defaults();
      return state.onboarding;
    },

    isDone: function () {
      var ob = this.get();
      return !!(ob.done || ob.stage === STAGES.done);
    },

    isActive: function () {
      return !this.isDone();
    },

    isDialogOpen: function () {
      return !!this.dialog;
    },

    setStage: function (stage, opts) {
      var ob = this.get();
      if (ob.done && stage !== STAGES.done) return;
      var prev = ob.stage;
      if (stage === STAGES.done) {
        ob.done = true;
        ob.stage = STAGES.done;
      } else {
        ob.stage = stage;
        ob.done = false;
      }
      if (!opts || opts.save !== false) AIGCUtils.GameState.save();
      console.log("[Onboarding] stage", prev, "→", ob.stage, "done=" + ob.done);
    },

    openDialog: function (kind) {
      this.dialog = kind;
      this.buttonBox = null;
      console.log("[Onboarding] dialog open", kind);
    },

    closeDialog: function () {
      var prev = this.dialog;
      this.dialog = null;
      this.buttonBox = null;
      console.log("[Onboarding] dialog close", prev);
    },

    setArrow: function (zone) {
      this.arrowZone = zone || null;
      console.log("[Onboarding] arrow", this.arrowZone);
    },

    clearArrow: function () {
      if (this.arrowZone) console.log("[Onboarding] arrow clear", this.arrowZone);
      this.arrowZone = null;
    },

    /** 椰林是否仍显示锁 / 命中 locked */
    isCoconutLocked: function () {
      return !AIGCUtils.GameState.tasks.fish;
    },

    /** 烤鱼店是否仍显示锁 / 命中 locked（教程解锁 mapShop 后无锁） */
    isShopLocked: function () {
      if (AIGCUtils.GameState.shopBuilt) return false;
      if (!this.isActive()) return true;
      var stage = this.get().stage;
      return (
        stage !== STAGES.mapShop &&
        stage !== STAGES.shopBuild &&
        stage !== STAGES.grill
      );
    },

    /** 地图热区：教程态店铺可点（未建店） */
    isShopClickableUnbuilt: function () {
      if (AIGCUtils.GameState.shopBuilt) return false;
      if (!this.isActive()) return false;
      var stage = this.get().stage;
      return (
        stage === STAGES.mapShop ||
        stage === STAGES.shopBuild ||
        stage === STAGES.grill
      );
    },

    /**
     * 启动落点：intro 强制地图+弹窗；其它未完成引导按 stage 恢复；已完成走调用方老逻辑。
     * @returns {boolean} true=已处理落点
     */
    applyInitLanding: function (game) {
      if (this.isDone()) return false;
      var stage = this.get().stage;
      this.dialog = null;
      this.arrowZone = null;
      this.buttonBox = null;

      if (stage === STAGES.intro) {
        game.currentArea = "map";
        this.openDialog("intro");
        return true;
      }
      if (stage === STAGES.mapFishing) {
        game.currentArea = "map";
        this.setArrow("fishing");
        return true;
      }
      if (stage === STAGES.coconutGuide) {
        game.currentArea = "map";
        this.openDialog("coconutGuide");
        return true;
      }
      if (stage === STAGES.mapCoconut) {
        game.currentArea = "map";
        this.setArrow("coconut");
        return true;
      }
      if (stage === STAGES.coconutRound) {
        game.currentArea = "coconut";
        return true;
      }
      if (stage === STAGES.mapShop || stage === STAGES.shopBuild) {
        game.currentArea = "map";
        this.setArrow("shop");
        // shopBuild 中途退出不持久化 building，回地图让玩家再点店
        if (stage === STAGES.shopBuild) this.setStage(STAGES.mapShop);
        return true;
      }
      if (stage === STAGES.grill) {
        game.currentArea = AIGCUtils.GameState.shopBuilt ? "shop" : "map";
        return true;
      }
      game.currentArea = "map";
      this.openDialog("intro");
      this.setStage(STAGES.intro);
      return true;
    },

    onIntroGoFishing: function () {
      this.closeDialog();
      this.setStage(STAGES.mapFishing);
      this.setArrow("fishing");
    },

    onGoCoconutFromGuide: function (game) {
      this.closeDialog();
      this.setStage(STAGES.mapCoconut);
      this.setArrow("coconut");
      if (game) game.navigate("map");
    },

    onEnterFishingFromMap: function () {
      if (!this.isActive()) return;
      this.clearArrow();
      // 仍停在 mapFishing，直到第一条鱼收篓后进 coconutGuide
    },

    onEnterCoconutFromMap: function () {
      if (!this.isActive()) return;
      this.clearArrow();
      if (this.get().stage === STAGES.mapCoconut) {
        this.setStage(STAGES.coconutRound);
      }
    },

    /** 未完成目标就回地图时，按 stage 恢复唯一红箭头 */
    syncArrowForMap: function () {
      if (!this.isActive() || this.dialog) {
        this.clearArrow();
        return;
      }
      var stage = this.get().stage;
      if (stage === STAGES.mapFishing) this.setArrow("fishing");
      else if (stage === STAGES.mapCoconut) this.setArrow("coconut");
      else if (stage === STAGES.mapShop || stage === STAGES.shopBuild) this.setArrow("shop");
      else this.clearArrow();
    },

    onFishAcknowledged: function () {
      if (!this.isActive()) return false;
      var stage = this.get().stage;
      // 第一条鱼收进鱼篓后弹椰林引导（用户确认时机）
      if (stage === STAGES.mapFishing || stage === STAGES.intro) {
        this.setStage(STAGES.coconutGuide);
        this.openDialog("coconutGuide");
        return true;
      }
      return false;
    },

    onGoShopFromCoconut: function (game) {
      if (!this.isActive()) return false;
      this.setStage(STAGES.mapShop);
      this.setArrow("shop");
      if (game) game.navigate("map");
      return true;
    },

    onStayInCoconut: function () {
      // 店铺保持锁定；下一轮结算仍可去
      console.log("[Onboarding] stay coconut, shop still locked");
    },

    onShopMapClick: function (game) {
      if (!this.isActive()) return false;
      this.clearArrow();
      // R0026：不再进入 shopBuild 小游戏，beginBuild 内直接开业
      if (game) game.beginBuild();
      return true;
    },

    onFinishBuild: function () {
      if (!this.isActive()) return;
      this.setStage(STAGES.grill);
    },

    onFirstGrillDone: function (plating) {
      if (!this.isActive()) return false;
      if (this.get().stage !== STAGES.grill && this.get().stage !== STAGES.shopBuild) {
        // 容错：已建店且仍在引导中
        if (this.isDone()) return false;
      }
      var recipeId = plating && plating.recipeId;
      if (recipeId !== "fish_grilled") return false;
      if (this.dialog === "end") return false;
      this.openDialog("end");
      console.log("[Onboarding] end dialog after fish_grilled plated on table");
      return true;
    },

    onEndDismiss: function () {
      this.closeDialog();
      this.clearArrow();
      this.setStage(STAGES.done);
    },

    /** 旧「三条鱼去椰林」仅引导完成后仍可用 */
    shouldShowLegacyThreeFishGuide: function () {
      return this.isDone();
    }
  };
})();
