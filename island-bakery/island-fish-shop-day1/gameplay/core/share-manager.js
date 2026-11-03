(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.ShareManager = {
    // 分享当前店铺状态
    shareShop: function () {
      if (typeof KwaiRepost === "undefined") {
        console.log("[Share] KwaiRepost not available");
        return;
      }

      var state = AIGCUtils.GameState;
      var query = "from=share&day=" + state.day + "&coins=" + state.coins + "&shopLevel=" + state.shopLevel;

      KwaiRepost.shareAppMessage({
        query: query,
        onSuccess: function () {
          console.log("[Share] Shop shared successfully");
          AIGCUtils.EventBus.emit("share:shop");
          // 分享奖励
          AIGCUtils.GameState.addCoins(10);
          AIGCUtils.GameState.save();
        },
        onFail: function (err) {
          console.warn("[Share] Failed:", err);
        },
      });
    },

    // 分享战绩
    shareScore: function () {
      if (typeof KwaiRepost === "undefined") return;

      var state = AIGCUtils.GameState;
      var query = "from=score&day=" + state.day + "&totalSold=" + state.stats.totalSold + "&totalCoins=" + state.stats.totalCoins;

      KwaiRepost.shareAppMessage({
        query: query,
        onSuccess: function () {
          AIGCUtils.EventBus.emit("share:score");
        },
        onFail: function (err) {
          console.warn("[Share] Score share failed:", err);
        },
      });
    },

    // 注册系统分享
    registerSystemShare: function () {
      if (typeof KwaiRepost === "undefined") return;

      KwaiRepost.registerSystemShare(function () {
        var state = AIGCUtils.GameState;
        return {
          title: "我在孤岛面包店经营到第" + state.day + "天，赚了" + state.coins + "金币！",
          query: "from=system_share&day=" + state.day + "&coins=" + state.coins,
        };
      });
    },

    // 处理分享进入
    handleLaunchQuery: function () {
      var query = null;
      if (typeof KwaiBase !== "undefined") {
        var options = KwaiBase.getLaunchOptions();
        query = options.query;
      }

      if (!query) return;

      if (query.from === "share" || query.from === "system_share") {
        console.log("[Share] Entered from share, day=" + query.day);
        // 可以给予分享进入的玩家奖励
        if (query.day) {
          var sharerDay = parseInt(query.day, 10);
          if (sharerDay > AIGCUtils.GameState.day) {
            AIGCUtils.GameState.addCoins(20);
            AIGCUtils.EventBus.emit("share:enter_bonus", { coins: 20 });
          }
        }
      }
    },
  };
})();
