(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.VIPSystem = {
    // VIP客人配置
    vipGuests: [
      { id: "captain", name: "船长", preference: ["bbq_fish", "seafood_soup"], bonus: 2.0, visitDay: 5 },
      { id: "merchant", name: "商人", preference: ["bread_fruit", "vip_cake"], bonus: 2.5, visitDay: 8 },
      { id: "explorer", name: "探险家", preference: ["bbq_meat", "seafood_porridge"], bonus: 3.0, visitDay: 12 },
    ],

    // 当前VIP客人
    currentVIP: null,
    // VIP计时器
    vipTimer: 0,
    VIP_DURATION: 30000, // VIP停留30秒

    update: function (dt) {
      if (!AIGCUtils.VIPSystem.currentVIP) return;

      AIGCUtils.VIPSystem.vipTimer += dt;
      if (AIGCUtils.VIPSystem.vipTimer >= AIGCUtils.VIPSystem.VIP_DURATION) {
        AIGCUtils.VIPSystem.leave();
      }
    },

    // 尝试生成VIP客人
    trySpawnVIP: function () {
      var day = AIGCUtils.GameState.day;
      var availableVIPs = AIGCUtils.VIPSystem.vipGuests.filter(function (v) {
        return v.visitDay <= day && Math.random() < 0.3; // 30%概率出现
      });

      if (availableVIPs.length > 0 && !AIGCUtils.VIPSystem.currentVIP) {
        var vip = availableVIPs[Math.floor(Math.random() * availableVIPs.length)];
        AIGCUtils.VIPSystem.currentVIP = {
          id: vip.id,
          name: vip.name,
          preference: vip.preference,
          bonus: vip.bonus,
          patience: 20000,
          maxPatience: 20000,
        };
        AIGCUtils.VIPSystem.vipTimer = 0;
        AIGCUtils.EventBus.emit("vip:arrived", { vip: AIGCUtils.VIPSystem.currentVIP });
      }
    },

    // VIP购买
    sellToVIP: function (recipeId) {
      var vip = AIGCUtils.VIPSystem.currentVIP;
      if (!vip) return { success: false, message: "没有VIP客人" };

      var isPreferred = vip.preference.indexOf(recipeId) >= 0;
      var recipe = AIGCUtils.Recipes.getById(recipeId);
      var price = recipe.price;

      if (isPreferred) {
        price = Math.floor(price * vip.bonus);
      }

      AIGCUtils.GameState.addCoins(price);
      AIGCUtils.GameState.stats.totalSold++;

      AIGCUtils.EventBus.emit("vip:sold", {
        vip: vip,
        recipeId: recipeId,
        price: price,
        preferred: isPreferred,
      });

      AIGCUtils.VIPSystem.leave();
      return { success: true, price: price };
    },

    // VIP离开
    leave: function () {
      if (!AIGCUtils.VIPSystem.currentVIP) return;
      AIGCUtils.EventBus.emit("vip:left", { vip: AIGCUtils.VIPSystem.currentVIP });
      AIGCUtils.VIPSystem.currentVIP = null;
      AIGCUtils.VIPSystem.vipTimer = 0;
    },

    // 获取当前VIP
    getCurrentVIP: function () {
      return AIGCUtils.VIPSystem.currentVIP;
    },

    // 检查是否有VIP
    hasVIP: function () {
      return AIGCUtils.VIPSystem.currentVIP !== null;
    },
  };
})();
