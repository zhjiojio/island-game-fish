(function () {
  var AIGCUtils = window.AIGCUtils;
  var MAX_OFFLINE_MS = 6 * 60 * 60 * 1000;

  AIGCUtils.OfflineManager = {
    calculateEarnings: function (now) {
      var state = AIGCUtils.GameState;
      if (!state.offlineUnlocked || state.pendingOffline || !state.lastOnlineTime) return null;
      var elapsed = Math.max(0, Math.min(MAX_OFFLINE_MS, (now || Date.now()) - state.lastOnlineTime));
      var fish = Math.min(12, Math.floor(elapsed / (30 * 60 * 1000)));
      var coconut = Math.min(18, Math.floor(elapsed / (20 * 60 * 1000)));
      if (!fish && !coconut) return null;
      state.pendingOffline = { fish: fish, coconut: coconut, elapsedMs: elapsed };
      state.save();
      console.log("[Prototype] Offline earnings prepared", fish, coconut);
      return state.pendingOffline;
    },

    claimEarnings: function (doubleReward) {
      var state = AIGCUtils.GameState;
      var pending = state.pendingOffline;
      if (!pending) return null;
      var factor = doubleReward ? 2 : 1;
      if (pending.fish) {
        state.collect("fish", 1, {
          id: "offline_" + Date.now(),
          speciesId: "small",
          quality: "normal",
          weight: null,
          portions: pending.fish * factor
        });
      }
      if (pending.coconut) state.collect("coconut", pending.coconut * factor);
      state.pendingOffline = null;
      state.lastOnlineTime = Date.now();
      state.save();
      console.log("[Prototype] Offline earnings claimed", pending.fish * factor, pending.coconut * factor);
      return { fish: pending.fish * factor, coconut: pending.coconut * factor };
    },

    getOfflineDuration: function () {
      var pending = AIGCUtils.GameState.pendingOffline;
      if (!pending) return "0分钟";
      return Math.floor(pending.elapsedMs / 60000) + "分钟";
    },

    updateOnlineTime: function () {
      AIGCUtils.GameState.lastOnlineTime = Date.now();
      AIGCUtils.GameState.save();
    }
  };
})();
