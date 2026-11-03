(function () {
  var AIGCUtils = window.AIGCUtils;
  var SAVE_KEY = "island_fish_energy_v1";
  var CONFIG = {
    fish: { max: 30, recoveryMs: 15 * 60 * 1000, adLimit: null },
    coconut: { max: 5, recoveryMs: 36 * 60 * 1000, adLimit: 3 }
  };
  var state = null;

  function dayKey(now) {
    var date = new Date(now);
    var month = date.getMonth() + 1;
    var day = date.getDate();
    return date.getFullYear() + "-" + (month < 10 ? "0" : "") + month + "-" + (day < 10 ? "0" : "") + day;
  }

  function freshState() {
    var now = Date.now();
    return {
      day: dayKey(now),
      fish: { value: 30, updatedAt: now, adCount: 0 },
      coconut: { value: 5, updatedAt: now, adCount: 0 }
    };
  }

  function save() {
    try {
      if (typeof KwaiStorage !== "undefined") KwaiStorage.setSync(SAVE_KEY, state);
    } catch (error) {
      console.warn("[Prototype] Energy save failed", error);
    }
  }

  function refresh() {
    if (!state) return;
    var now = Date.now();
    var today = dayKey(now);
    if (state.day !== today) {
      state = freshState();
      save();
      return;
    }
    var changed = false;
    Object.keys(CONFIG).forEach(function (type) {
      var config = CONFIG[type];
      var energy = state[type];
      if (energy.value >= config.max) {
        energy.updatedAt = now;
        return;
      }
      var recovered = Math.floor(Math.max(0, now - energy.updatedAt) / config.recoveryMs);
      if (recovered <= 0) return;
      energy.value = Math.min(config.max, energy.value + recovered);
      energy.updatedAt = energy.value >= config.max ? now : energy.updatedAt + recovered * config.recoveryMs;
      changed = true;
    });
    if (changed) save();
  }

  AIGCUtils.Energy = {
    init: function () {
      state = freshState();
      try {
        if (typeof KwaiStorage !== "undefined") {
          var saved = KwaiStorage.getSync(SAVE_KEY);
          if (saved && saved.fish && saved.coconut) state = saved;
        }
      } catch (error) {
        console.warn("[Prototype] Energy read failed", error);
      }
      refresh();
    },

    get: function (type) {
      refresh();
      var config = CONFIG[type];
      var energy = state[type];
      return {
        value: energy.value,
        max: config.max,
        remainingAds: config.adLimit === null ? null : Math.max(0, config.adLimit - energy.adCount),
        updatedAt: energy.updatedAt,
        recoveryMs: config.recoveryMs
      };
    },

    consume: function (type) {
      refresh();
      var energy = state[type];
      var config = CONFIG[type];
      if (energy.value <= 0) return false;
      if (energy.value >= config.max) energy.updatedAt = Date.now();
      energy.value--;
      save();
      console.log("[Prototype] Energy consumed", type, energy.value);
      return true;
    },

    restoreWithAd: function (type) {
      refresh();
      var energy = state[type];
      var config = CONFIG[type];
      if (config.adLimit !== null && energy.adCount >= config.adLimit) return false;
      energy.adCount++;
      energy.value = config.max;
      energy.updatedAt = Date.now();
      save();
      console.log("[Prototype] Energy restored by ad", type, energy.adCount);
      return true;
    }
  };
})();
