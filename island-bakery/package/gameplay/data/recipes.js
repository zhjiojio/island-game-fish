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

  AIGCUtils.Recipes.rollFishSpecies = function (options) {
    options = options || {};
    if (options.spotId === "shallow" && !options.perfect) return "small";
    if (options.spotId === "shallow" && options.perfect) return Math.random() < 0.65 ? "small" : "salmon";
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
