(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.AdManager = {
    // 激励视频：3倍收益
    showTripleReward: function (baseReward, callback) {
      if (typeof KwaiAd === "undefined") {
        if (callback) callback(baseReward);
        return;
      }

      KwaiAd.showRewarded(
        function () {
          // 看完广告，3倍收益
          var reward = baseReward * 3;
          AIGCUtils.GameState.addCoins(reward - baseReward);
          AIGCUtils.GameState.daily.adWatched++;
          if (callback) callback(reward);
          AIGCUtils.EventBus.emit("ad:triple_reward", { reward: reward });
        },
        function () {
          // 中途关闭，正常收益
          if (callback) callback(baseReward);
        }
      );
    },

    // 激励视频：复活
    showRevive: function (callback) {
      if (typeof KwaiAd === "undefined") {
        if (callback) callback(true);
        return;
      }

      KwaiAd.showRewarded(
        function () {
          if (callback) callback(true);
          AIGCUtils.EventBus.emit("ad:revive");
        },
        function () {
          if (callback) callback(false);
        }
      );
    },

    // 激励视频：每日抽奖
    showDailyDraw: function (callback) {
      if (AIGCUtils.GameState.daily.freeDrawUsed) {
        if (callback) callback(false, "今日已抽奖");
        return;
      }

      if (typeof KwaiAd === "undefined") {
        AIGCUtils.AdManager.performDraw();
        if (callback) callback(true);
        return;
      }

      KwaiAd.showRewarded(
        function () {
          AIGCUtils.AdManager.performDraw();
          AIGCUtils.GameState.daily.freeDrawUsed = true;
          AIGCUtils.GameState.save();
          if (callback) callback(true);
        },
        function () {
          if (callback) callback(false, "观看完整广告才能抽奖");
        }
      );
    },

    // 执行抽奖
    performDraw: function () {
      var recipes = AIGCUtils.Recipes.getUnlocked(AIGCUtils.GameState.day, AIGCUtils.GameState.devices);
      var rareRecipes = recipes.filter(function (r) { return r.star >= 3; });

      var reward = {
        type: "materials",
        flour: Math.floor(Math.random() * 5) + 3,
        wood: Math.floor(Math.random() * 5) + 3,
        coins: Math.floor(Math.random() * 50) + 20,
      };

      if (rareRecipes.length > 0 && Math.random() < 0.3) {
        var recipe = rareRecipes[Math.floor(Math.random() * rareRecipes.length)];
        reward.type = "recipe";
        reward.recipeId = recipe.id;
        reward.recipeName = recipe.name;
      }

      // 发放奖励
      AIGCUtils.GameState.ingredients.flour += reward.flour || 0;
      AIGCUtils.GameState.ingredients.wood += reward.wood || 0;
      AIGCUtils.GameState.addCoins(reward.coins || 0);

      AIGCUtils.EventBus.emit("ad:daily_draw", reward);
      return reward;
    },

    // 插屏广告
    showInterstitial: function () {
      // 每完成3个游戏日触发一次
      if (AIGCUtils.GameState.day % 3 !== 0) return;

      // 插屏广告由平台自动管理，这里只做触发标记
      AIGCUtils.EventBus.emit("ad:interstitial");
    },

    // 检查是否需要显示插屏
    checkInterstitial: function () {
      if (AIGCUtils.GameState.day > 0 && AIGCUtils.GameState.day % 3 === 0) {
        if (AIGCUtils.GameState.daily.dayCompleted) {
          AIGCUtils.AdManager.showInterstitial();
        }
      }
    },
  };
})();
