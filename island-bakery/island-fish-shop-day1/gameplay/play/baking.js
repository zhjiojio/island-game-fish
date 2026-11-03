(function () {
  var AIGCUtils = window.AIGCUtils;
  var EventBus = AIGCUtils.EventBus || window.KwaiEvent;

  AIGCUtils.Baking = {
    current: null,
    plating: null,

    init: function () {
      this.current = null;
      this.plating = null;
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
      this.current = {
        recipeId: recipeId,
        speciesId: recipeId === "fish_grilled" ? options.speciesId : null,
        fishQuality: recipeId === "fish_grilled" ? consumed.quality : null,
        stage: recipe.kind === "juice" ? "crack" : "stoke",
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
      EventBus.emit("baking:start", { recipeId: recipeId, speciesId: this.current.speciesId });
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
        EventBus.emit("baking:qte", { perfect: current.perfectFire, stage: "stoke" });
        console.log("[Prototype] Fire timing completed", current.perfectFire, current.cookDuration);
        return true;
      }
      if (current.stage === "flip") {
        var perfect = current.cursor >= 0.4 && current.cursor <= 0.6;
        EventBus.emit("baking:qte", { perfect: perfect, stage: "flip" });
        this.finish(perfect ? "perfect" : "normal");
        return true;
      }
      if (current.stage === "crack") {
        if (current.taps >= 3) return false;
        current.taps++;
        current.hitTimer = 260;
        if (current.taps >= 3) current.crackDoneTimer = 260;
        console.log("[Prototype] Coconut hammer hit", current.taps);
        return true;
      }
      if (current.stage === "straw") {
        this.finish("fresh");
        return true;
      }
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
      EventBus.emit("baking:done", this.plating);
      console.log("[Prototype] Production plated", this.plating.title, unitPrice);
    },

    update: function (dt) {
      if (this.plating) {
        this.plating.timer += dt;
        if (this.plating.timer >= 750) this.plating = null;
      }
      if (!this.current) return;
      var current = this.current;
      this.current.elapsed += dt;
      this.current.stageTimer += dt;
      this.current.hitTimer = Math.max(0, this.current.hitTimer - dt);
      if (this.current.stage === "crack" && this.current.taps >= 3) {
        this.current.crackDoneTimer = Math.max(0, this.current.crackDoneTimer - dt);
        if (this.current.crackDoneTimer <= 0) this.current.stage = "straw";
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
        console.log("[Prototype] Fish ready to flip");
      }
    },

    isBaking: function () {
      return this.current !== null;
    }
  };
})();
