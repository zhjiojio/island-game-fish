(function () {
  var AIGCUtils = window.AIGCUtils;
  var EventBus = AIGCUtils.EventBus || window.KwaiEvent;

  AIGCUtils.Baking = {
    current: null,
    plating: null,
    /** 翻面点击后并行的烤鱼翻面特效，不挡结算 */
    flipFx: null,
    toolsDown: false,

    juiceAuto: {
      put_tools: 640,
      walk_to_work: 520,
      pick_coconut: 280,
      straw_anim: 480
    },

    init: function () {
      this.current = null;
      this.plating = null;
      this.flipFx = null;
      this.toolsDown = false;
      if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.stopLoop("shop.grill_loop");
    },

    start: function (recipeId, options) {
      if (this.current) return { success: false, message: "正在制作" };
      var recipe = AIGCUtils.Recipes.getById(recipeId);
      if (!recipe) return { success: false, message: "没有商品" };
      if (recipeId === "fish_grilled" && (!options || !options.speciesId)) {
        return { success: false, message: "先选择鱼种" };
      }
      if (!AIGCUtils.GameState.hasIngredients(recipeId, options)) {
        return { success: false, message: recipeId === "fish_grilled" ? "缺少这种鱼" : "缺椰子" };
      }
      var consumed = AIGCUtils.GameState.consumeIngredients(recipeId, options);
      var juiceStart = recipe.kind === "juice";
      this.current = {
        recipeId: recipeId,
        speciesId: recipeId === "fish_grilled" ? options.speciesId : null,
        fishQuality: recipeId === "fish_grilled" ? consumed.quality : null,
        stage: juiceStart ? "put_tools" : "stoke",
        taps: 0,
        cursor: 0,
        direction: 1,
        perfectFire: false,
        cookDuration: 0,
        elapsed: 0,
        stageTimer: 0,
        hitTimer: 0,
        crackDoneTimer: 0
      };
      this.toolsDown = juiceStart;
      EventBus.emit("baking:start", { recipeId: recipeId, speciesId: this.current.speciesId });
      if (juiceStart) {
        console.log("[ShopAnim] juice_put_tools");
        EventBus.emit("anim:play", { actorId: "rabbit", clipId: "rabbit_put_tools", force: true, lockMs: 640 });
      }
      if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.play("shop.ingredient");
      console.log("[Prototype] Production started", recipeId, this.current.speciesId || "");
      return { success: true };
    },

    hit: function () {
      if (!this.current) return false;
      var current = this.current;
      current.stageTimer = 0;
      if (current.stage === "stoke") {
        current.perfectFire = current.cursor >= 0.4 && current.cursor <= 0.6;
        current.cookDuration = current.perfectFire ? 2500 / 1.2 : 2500;
        current.stage = "cooking";
        current.cursor = 0;
        current.direction = 1;
        current.elapsed = 0;
        if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.playLoop("shop.grill_loop");
        EventBus.emit("baking:qte", { perfect: current.perfectFire, stage: "stoke" });
        console.log("[Prototype] Fire timing completed", current.perfectFire, current.cookDuration);
        return true;
      }
      if (current.stage === "flip") {
        var perfect = current.cursor >= 0.4 && current.cursor <= 0.6;
        // 立刻结算；翻面动画与烤鱼翻面特效并行
        this.flipFx = {
          timer: 0,
          duration: 960,
          speciesId: current.speciesId
        };
        // 火焰循环维持到 finish 收获；此处只播翻面点击
        if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.play("shop.flip");
        EventBus.emit("baking:qte", { perfect: perfect, stage: "flip" });
        this.finish(perfect ? "perfect" : "normal");
        return true;
      }
      if (current.stage === "crack") {
        if (current.taps >= 3) return false;
        current.taps++;
        current.hitTimer = 260;
        if (current.taps >= 3) current.crackDoneTimer = 260;
        if (AIGCUtils.SoundManager) AIGCUtils.SoundManager.play("juice.crack");
        EventBus.emit("baking:juice_hit", { kind: "crack", taps: current.taps });
        console.log("[Prototype] Coconut hammer hit", current.taps);
        return true;
      }
      if (current.stage === "straw") {
        // 先播插管，播完再 finish / 回走，避免插管与回位并行
        EventBus.emit("baking:juice_hit", { kind: "straw" });
        current.stage = "straw_anim";
        current.elapsed = 0;
        console.log("[ShopAnim] juice_straw_anim");
        return true;
      }
      // put_tools / walk_to_work / pick_coconut / straw_anim 自动段不可点
      return false;
    },

    finish: function (cookQuality) {
      if (!this.current) return;
      var current = this.current;
      var recipe = AIGCUtils.Recipes.getById(current.recipeId);
      var species = current.speciesId ? AIGCUtils.Recipes.getFishSpecies(current.speciesId) : null;
      var fishFactor = current.fishQuality === "fine" ? 1.25 : 1;
      var cookFactor = cookQuality === "perfect" ? 2 : 1;
      var unitPrice = Math.round((species ? species.price : recipe.price) * fishFactor * cookFactor);
      var qualityName = cookQuality === "perfect" ? "外焦里嫩" : cookQuality === "normal" ? "一般" : "新鲜";
      AIGCUtils.GameState.addProduct(current.recipeId, cookQuality, unitPrice, {
        qualityName: qualityName,
        speciesId: current.speciesId,
        fishQuality: current.fishQuality
      });
      if (current.recipeId === "coconut_juice") {
        AIGCUtils.GameState.stats.totalJuice++;
      } else {
        AIGCUtils.GameState.stats.totalBaked++;
      }
      this.plating = {
        recipeId: current.recipeId,
        title: current.recipeId === "coconut_juice" ? "椰子汁完成" : qualityName + "烤鱼",
        description: current.recipeId === "coconut_juice" ? "椰子已敲开，吸管也插好了" : species.name + " · " + (current.fishQuality === "fine" ? "优质鱼获" : "普通鱼获"),
        quality: cookQuality,
        qualityName: qualityName,
        speciesId: current.speciesId,
        unitPrice: unitPrice,
        timer: 0
      };
      this.current = null;
      if (AIGCUtils.SoundManager) {
        AIGCUtils.SoundManager.stopLoop("shop.grill_loop");
        AIGCUtils.SoundManager.play("common.success");
      }
      EventBus.emit("baking:done", this.plating);
      console.log("[Prototype] Production plated", this.plating.title, unitPrice);
    },

    advanceJuiceAuto: function (dt) {
      var current = this.current;
      if (!current || current.recipeId !== "coconut_juice") return;
      var auto = this.juiceAuto;
      if (current.stage === "put_tools" && current.elapsed >= auto.put_tools) {
        current.stage = "walk_to_work";
        current.elapsed = 0;
        console.log("[ShopAnim] juice_walk_to_work");
      } else if (current.stage === "walk_to_work" && current.elapsed >= auto.walk_to_work) {
        current.stage = "pick_coconut";
        current.elapsed = 0;
        console.log("[ShopAnim] juice_pick_coconut");
      } else if (current.stage === "pick_coconut" && current.elapsed >= auto.pick_coconut) {
        current.stage = "crack";
        current.elapsed = 0;
        console.log("[ShopAnim] juice_crack_ready");
      } else if (current.stage === "straw_anim" && current.elapsed >= (auto.straw_anim || 480)) {
        console.log("[ShopAnim] juice_straw_done_then_finish");
        this.finish("fresh");
      }
    },

    update: function (dt) {
      if (this.flipFx) {
        this.flipFx.timer += dt;
        if (this.flipFx.timer >= this.flipFx.duration) this.flipFx = null;
      }
      if (this.plating) {
        this.plating.timer += dt;
        // 椰汁回位：走回 + 拿工具，略长于烤鱼出餐提示
        var plateMs = this.plating.recipeId === "coconut_juice" ? 750 : 750;
        if (this.plating.timer >= plateMs) {
          var landed = this.plating;
          if (landed.recipeId === "coconut_juice") {
            this.toolsDown = false;
            console.log("[ShopAnim] juice_pick_tools_done");
          }
          this.plating = null;
          // R0026：烤鱼落到桌上后再弹新人引导结束窗
          if (
            landed.recipeId === "fish_grilled" &&
            AIGCUtils.Onboarding &&
            AIGCUtils.Onboarding.onFirstGrillDone
          ) {
            AIGCUtils.Onboarding.onFirstGrillDone(landed);
          }
        }
      }
      if (!this.current) return;
      var current = this.current;
      this.current.elapsed += dt;
      this.current.stageTimer += dt;
      this.current.hitTimer = Math.max(0, this.current.hitTimer - dt);
      this.advanceJuiceAuto(dt);
      // straw_anim 结束会 finish() 清空 current，后面必须先判空，否则抛错卡死整帧更新
      if (!this.current) return;
      current = this.current;
      if (current.stage === "crack" && current.taps >= 3) {
        current.crackDoneTimer = Math.max(0, current.crackDoneTimer - dt);
        if (current.crackDoneTimer <= 0) current.stage = "straw";
      }
      if (current.stage === "stoke" || current.stage === "flip") {
        current.cursor += current.direction * dt / 1250;
        if (current.cursor >= 1) {
          current.cursor = 1;
          current.direction = -1;
        } else if (current.cursor <= 0) {
          current.cursor = 0;
          current.direction = 1;
        }
      }
      if (current.stage === "cooking" && current.elapsed >= current.cookDuration) {
        current.stage = "flip";
        current.cursor = 0;
        current.direction = 1;
        current.elapsed = 0;
        // 进入翻面等待仍保持火焰燃烧，直到点击收获 finish
        console.log("[Prototype] Fish ready to flip");
      }
    },

    isBaking: function () {
      return this.current !== null;
    },

    /** 椰子是否已放到操作台（自动段结束后才可敲） */
    juiceOnWork: function () {
      if (!this.current || this.current.recipeId !== "coconut_juice") return false;
      var s = this.current.stage;
      return s === "crack" || s === "straw" || s === "straw_anim" || s === "pick_coconut";
    }
  };
})();
