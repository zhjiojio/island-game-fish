(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.Recipes = {
    fish_grilled: {
      id: "fish_grilled",
      name: "烤鱼",
      ingredients: { fish: 1 },
      price: 5,
      kind: "grill"
    },
    coconut_juice: {
      id: "coconut_juice",
      name: "椰子汁",
      ingredients: { coconut: 1 },
      price: 8,
      kind: "juice"
    }
  };

  AIGCUtils.FishSpecies = [
    { id: "small", name: "小海鱼", price: 5, minWeight: 1, maxWeight: 2 },
    { id: "salmon", name: "三文鱼", price: 8, minWeight: 2, maxWeight: 4 },
    { id: "tuna", name: "金枪鱼", price: 12, minWeight: 4, maxWeight: 6 },
    { id: "golden", name: "金色传说", price: 20, minWeight: 8, maxWeight: 10 }
  ];

  var legacySpecies = { sardine: "small", mackerel: "salmon", snapper: "tuna" };

  AIGCUtils.Recipes.normalizeSpeciesId = function (id) {
    return legacySpecies[id] || id;
  };

  AIGCUtils.Recipes.getById = function (id) {
    return AIGCUtils.Recipes[id] || null;
  };

  AIGCUtils.Recipes.getFishSpecies = function (id) {
    id = this.normalizeSpeciesId(id);
    return AIGCUtils.FishSpecies.find(function (species) {
      return species.id === id;
    }) || AIGCUtils.FishSpecies[0];
  };

  /**
   * 当前钓点/鱼饵下「可被订单要求」的鱼种（与 rollFishSpecies 可出池一致，避免卡单）。
   * MVP：仅浅滩 + 蚯蚓 → 小海鱼 + 三文鱼；礁石/深海 UI 未解锁时按浅滩处理。
   */
  AIGCUtils.Recipes.getOrderableSpeciesIds = function (spotId, baitId) {
    var bait = baitId || "worm";
    if (bait !== "worm") return ["small"];
    var spot = spotId === "reef" || spotId === "deep" ? "shallow" : spotId;
    if (spot === "shallow") return ["small", "salmon"];
    return ["small"];
  };

  AIGCUtils.Recipes.rollFishSpecies = function (options) {
    options = options || {};
    var baitId = options.baitId || "worm";
    if (baitId !== "worm") {
      console.log("[Prototype] Fish roll fallback shallow worm-only pool", baitId);
    }
    var spotId = options.spotId === "reef" || options.spotId === "deep" ? "shallow" : options.spotId || "shallow";
    if (spotId === "shallow") {
      if (!options.perfect) return "small";
      return Math.random() < 0.65 ? "small" : "salmon";
    }
    var roll = Math.random();
    return roll < 0.55 ? "small" : roll < 0.85 ? "salmon" : roll < 0.98 ? "tuna" : "golden";
  };

  AIGCUtils.Recipes.createFishWeight = function (speciesId) {
    var species = this.getFishSpecies(speciesId);
    return Math.round((species.minWeight + Math.random() * (species.maxWeight - species.minWeight)) * 10) / 10;
  };

  AIGCUtils.Recipes.weightToPortions = function (weight) {
    return Math.max(2, Math.ceil(weight * 2 - 0.000001));
  };
})();
