(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.DayCycle = {
    DAY_DURATION: 60000,      // 白天时长 60 秒（游戏内一天）
    NIGHT_DURATION: 30000,    // 夜晚时长 30 秒
    TRANSITION_DURATION: 2000,// 昼夜切换过渡时间

    state: "day",             // day / night / transition
    timer: 0,
    transitionTimer: 0,
    dayTimeRemaining: 0,

    init: function () {
      AIGCUtils.DayCycle.state = "day";
      AIGCUtils.DayCycle.timer = 0;
      AIGCUtils.DayCycle.dayTimeRemaining = AIGCUtils.DayCycle.DAY_DURATION;
    },

    update: function (dt) {
      var cycle = AIGCUtils.DayCycle;

      if (cycle.state === "transition") {
        cycle.transitionTimer += dt;
        if (cycle.transitionTimer >= cycle.TRANSITION_DURATION) {
          cycle.state = cycle.state === "transition" ? "night" : "day";
          // 实际逻辑：transition 完成后切换到目标状态
          if (AIGCUtils.GameState.timeOfDay === "day") {
            cycle.state = "night";
            AIGCUtils.GameState.timeOfDay = "night";
            cycle.timer = 0;
            AIGCUtils.EventBus.emit("night:start");
          } else {
            cycle.state = "day";
            AIGCUtils.GameState.timeOfDay = "day";
            AIGCUtils.GameState.dayProgress = 0;
            cycle.timer = 0;
            AIGCUtils.GameState.nextDay();
            AIGCUtils.EventBus.emit("day:start");
          }
          cycle.transitionTimer = 0;
        }
        return;
      }

      cycle.timer += dt;

      if (cycle.state === "day") {
        cycle.dayTimeRemaining = Math.max(0, cycle.DAY_DURATION - cycle.timer);
        AIGCUtils.GameState.dayProgress = cycle.timer / cycle.DAY_DURATION;

        if (cycle.timer >= cycle.DAY_DURATION) {
          AIGCUtils.DayCycle.startTransition("night");
        }
      } else if (cycle.state === "night") {
        if (cycle.timer >= cycle.NIGHT_DURATION) {
          AIGCUtils.DayCycle.startTransition("day");
        }
      }
    },

    startTransition: function (target) {
      AIGCUtils.DayCycle.state = "transition";
      AIGCUtils.DayCycle.transitionTimer = 0;
      AIGCUtils.GameState.timeOfDay = target;
      AIGCUtils.EventBus.emit("transition:start", { target: target });
    },

    // 获取当前进度 0-1
    getProgress: function () {
      var cycle = AIGCUtils.DayCycle;
      if (cycle.state === "day") {
        return cycle.timer / cycle.DAY_DURATION;
      } else if (cycle.state === "night") {
        return cycle.timer / cycle.NIGHT_DURATION;
      }
      return 0;
    },

    // 获取当前状态文本
    getStateText: function () {
      var cycle = AIGCUtils.DayCycle;
      if (cycle.state === "day") return "白天";
      if (cycle.state === "night") return "夜晚";
      return "切换中";
    },

    // 是否处于白天
    isDay: function () {
      return AIGCUtils.DayCycle.state === "day";
    },

    // 是否处于夜晚
    isNight: function () {
      return AIGCUtils.DayCycle.state === "night";
    },
  };
})();
