(function () {
  var AIGCUtils = window.AIGCUtils;
  var SAVE_KEY = "island_fish_shop_day1_v2";

  function defaults() {
    return {
      coins: 0,
      day: 1,
      level: 1,
      ingredients: { fish: 0, coconut: 0, goldenCoconut: 0 },
      fishStock: [],
      bakedGoods: [],
      tasks: { fish: false, coconut: false },
      shopBuilt: false,
      fishCaught: 0,
      playTimeMs: 0,
      stage: 1,
      offlineUnlocked: false,
      offlinePromptSeen: false,
      /** 烤鱼店首次「点生鱼」箭头引导是否已看过；true 后不再显示 */
      grillFishGuideSeen: false,
      /** 新人引导：{ done, stage }；缺省由 Onboarding.normalize 兼容旧档 */
      onboarding: { done: false, stage: "intro" },
      lastOnlineTime: null,
      pendingOffline: null,
      stats: { totalBaked: 0, totalJuice: 0, totalSold: 0, totalOrders: 0, totalCoins: 0 }
    };
  }

  AIGCUtils.GameState = defaults();

  AIGCUtils.GameState.init = function () {
    var fresh = defaults();
    var saved = null;
    var wantFresh = false;
    try {
      wantFresh =
        typeof location !== "undefined" &&
        /(?:\?|&)fresh=1(?:&|$)/.test(String(location.search || ""));
      // 验收用：?fresh=1 清空本地存档，强制新人引导起手（不影响正式无参链路）
      if (wantFresh && typeof KwaiStorage !== "undefined" && KwaiStorage.removeSync) {
        KwaiStorage.removeSync(SAVE_KEY);
        console.log("[Prototype] fresh=1 wiped save", SAVE_KEY);
      }
    } catch (wipeErr) {
      console.warn("[Prototype] fresh wipe failed", wipeErr);
    }
    try {
      if (!wantFresh && typeof KwaiStorage !== "undefined") {
        saved = KwaiStorage.getSync(SAVE_KEY);
      }
    } catch (error) {
      console.warn("[Prototype] Save read failed", error);
    }
    Object.keys(fresh).forEach(function (key) {
      AIGCUtils.GameState[key] = saved && saved[key] !== undefined ? saved[key] : fresh[key];
    });
    AIGCUtils.GameState.fishStock = AIGCUtils.GameState.fishStock || [];
    AIGCUtils.GameState.fishStock.forEach(function (fish) {
      fish.speciesId = AIGCUtils.Recipes.normalizeSpeciesId(fish.speciesId);
      fish.portions = Math.max(1, fish.portions || 1);
    });
    AIGCUtils.GameState.bakedGoods.forEach(function (good) {
      if (good.speciesId) good.speciesId = AIGCUtils.Recipes.normalizeSpeciesId(good.speciesId);
    });
    AIGCUtils.GameState.fishCaught = Math.max(AIGCUtils.GameState.fishCaught || 0, AIGCUtils.GameState.fishStock.length);
    AIGCUtils.GameState.ingredients.fish = AIGCUtils.GameState.getFishCount();
    AIGCUtils.GameState.ingredients.coconut = Math.max(0, AIGCUtils.GameState.ingredients.coconut || 0);
    AIGCUtils.GameState.ingredients.goldenCoconut = Math.max(0, AIGCUtils.GameState.ingredients.goldenCoconut || 0);
    // R0025：旧档无 onboarding 时按进度判定 done / intro
    if (AIGCUtils.Onboarding) {
      AIGCUtils.GameState.onboarding = AIGCUtils.Onboarding.normalize(
        saved && saved.onboarding,
        AIGCUtils.GameState
      );
    } else if (!AIGCUtils.GameState.onboarding) {
      AIGCUtils.GameState.onboarding = { done: false, stage: "intro" };
    }
  };

  AIGCUtils.GameState.save = function () {
    try {
      if (typeof KwaiStorage !== "undefined") {
        KwaiStorage.setSync(SAVE_KEY, {
          coins: AIGCUtils.GameState.coins,
          day: 1,
          level: 1,
          ingredients: AIGCUtils.GameState.ingredients,
          fishStock: AIGCUtils.GameState.fishStock,
          bakedGoods: AIGCUtils.GameState.bakedGoods,
          tasks: AIGCUtils.GameState.tasks,
          shopBuilt: AIGCUtils.GameState.shopBuilt,
          fishCaught: AIGCUtils.GameState.fishCaught,
          playTimeMs: AIGCUtils.GameState.playTimeMs,
          stage: AIGCUtils.GameState.stage,
          offlineUnlocked: AIGCUtils.GameState.offlineUnlocked,
          offlinePromptSeen: AIGCUtils.GameState.offlinePromptSeen,
          grillFishGuideSeen: !!AIGCUtils.GameState.grillFishGuideSeen,
          onboarding: AIGCUtils.GameState.onboarding || { done: false, stage: "intro" },
          lastOnlineTime: AIGCUtils.GameState.lastOnlineTime,
          pendingOffline: AIGCUtils.GameState.pendingOffline,
          stats: AIGCUtils.GameState.stats
        });
      }
    } catch (error) {
      console.warn("[Prototype] Save write failed", error);
    }
  };

  AIGCUtils.GameState.collect = function (type, amount, details) {
    var value = amount || 1;
    if (type === "fish") {
      for (var i = 0; i < value; i++) {
        AIGCUtils.GameState.fishStock.push({
          id: details.id || "fish_" + Date.now() + "_" + i,
          speciesId: details.speciesId,
          quality: details.quality,
          weight: details.weight,
          portions: details.portions || 1
        });
      }
      AIGCUtils.GameState.ingredients.fish = AIGCUtils.GameState.getFishCount();
      AIGCUtils.GameState.tasks.fish = true;
    } else {
      AIGCUtils.GameState.ingredients[type] = (AIGCUtils.GameState.ingredients[type] || 0) + value;
    }
    AIGCUtils.GameState.save();
  };

  AIGCUtils.GameState.getFishCount = function (speciesId) {
    return AIGCUtils.GameState.fishStock.filter(function (fish) {
      return !speciesId || fish.speciesId === speciesId;
    }).reduce(function (total, fish) {
      return total + Math.max(1, fish.portions || 1);
    }, 0);
  };

  AIGCUtils.GameState.hasIngredients = function (recipeId, options) {
    var recipe = AIGCUtils.Recipes.getById(recipeId);
    if (!recipe) return false;
    if (recipeId === "fish_grilled") {
      return !!options && AIGCUtils.GameState.getFishCount(AIGCUtils.Recipes.normalizeSpeciesId(options.speciesId)) > 0;
    }
    return AIGCUtils.GameState.ingredients.coconut >= recipe.ingredients.coconut;
  };

  AIGCUtils.GameState.consumeIngredients = function (recipeId, options) {
    if (!AIGCUtils.GameState.hasIngredients(recipeId, options)) return false;
    if (recipeId === "fish_grilled") {
      var index = AIGCUtils.GameState.fishStock.findIndex(function (fish) {
      return fish.speciesId === AIGCUtils.Recipes.normalizeSpeciesId(options.speciesId);
      });
      var fish = AIGCUtils.GameState.fishStock.splice(index, 1)[0];
      fish.portions--;
      if (fish.portions > 0) AIGCUtils.GameState.fishStock.splice(index, 0, fish);
      AIGCUtils.GameState.ingredients.fish = AIGCUtils.GameState.getFishCount();
      AIGCUtils.GameState.save();
      return fish;
    }
    AIGCUtils.GameState.ingredients.coconut--;
    AIGCUtils.GameState.save();
    return true;
  };

  AIGCUtils.GameState.addProduct = function (recipeId, quality, unitPrice, details) {
    AIGCUtils.GameState.bakedGoods.push({
      recipeId: recipeId,
      quality: quality,
      qualityName: details.qualityName,
      speciesId: details.speciesId || null,
      fishQuality: details.fishQuality || null,
      unitPrice: unitPrice
    });
    AIGCUtils.GameState.save();
  };

  AIGCUtils.GameState.getProductCount = function (recipeId, speciesId) {
    return AIGCUtils.GameState.bakedGoods.filter(function (good) {
      return good.recipeId === recipeId && (!speciesId || good.speciesId === speciesId);
    }).length;
  };

  AIGCUtils.GameState.addCoins = function (amount) {
    AIGCUtils.GameState.coins += amount;
    AIGCUtils.GameState.stats.totalCoins += amount;
  };

  AIGCUtils.GameState.readyToBuild = function () {
    return AIGCUtils.GameState.tasks.fish && AIGCUtils.GameState.tasks.coconut;
  };
})();
