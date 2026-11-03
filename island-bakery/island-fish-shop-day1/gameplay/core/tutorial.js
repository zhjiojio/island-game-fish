(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.Tutorial = {
    steps: [
      {
        id: "welcome",
        text: "欢迎来到孤岛面包店！你漂流到了一座荒岛，需要从零开始建造面包店。",
        condition: function () { return AIGCUtils.GameState.day === 1; },
      },
      {
        id: "collect",
        text: "点击绿色的采集点收集食材：树木→木材，椰子树→椰子，麦田→面粉。",
        condition: function () { return AIGCUtils.GameState.day === 1 && AIGCUtils.GameState.stats.totalBaked === 0; },
      },
      {
        id: "bake",
        text: "点击店铺开始烘焙面包！控制好火候，温度在140-160°C之间最佳。",
        condition: function () {
          return AIGCUtils.GameState.day === 1 &&
            AIGCUtils.GameState.ingredients.flour >= 1 &&
            AIGCUtils.GameState.ingredients.wood >= 1 &&
            AIGCUtils.GameState.stats.totalBaked === 0;
        },
      },
      {
        id: "sell",
        text: "面包烤好后，点击蓝色顾客售卖，赚取金币！",
        condition: function () {
          return AIGCUtils.GameState.stats.totalBaked > 0 &&
            AIGCUtils.GameState.stats.totalSold === 0;
        },
      },
      {
        id: "upgrade",
        text: "赚到金币后，可以升级设备、扩建店铺，解锁更多食谱！",
        condition: function () {
          return AIGCUtils.GameState.coins >= 50 &&
            AIGCUtils.GameState.unlockedUpgrades.length <= 1;
        },
      },
      {
        id: "night",
        text: "夜晚会有野兽来袭！建造防御塔保护你的面包店。",
        condition: function () {
          return AIGCUtils.GameState.day >= 2 &&
            AIGCUtils.DayCycle &&
            AIGCUtils.DayCycle.state === "night";
        },
      },
    ],

    currentStep: 0,
    shownSteps: [],
    active: false,

    init: function () {
      AIGCUtils.Tutorial.currentStep = 0;
      AIGCUtils.Tutorial.shownSteps = [];
      AIGCUtils.Tutorial.active = false;
    },

    update: function () {
      if (AIGCUtils.Tutorial.active) return;

      for (var i = 0; i < AIGCUtils.Tutorial.steps.length; i++) {
        var step = AIGCUtils.Tutorial.steps[i];
        if (AIGCUtils.Tutorial.shownSteps.indexOf(step.id) >= 0) continue;
        if (step.condition()) {
          AIGCUtils.Tutorial.show(step);
          break;
        }
      }
    },

    show: function (step) {
      AIGCUtils.Tutorial.active = true;
      AIGCUtils.Tutorial.shownSteps.push(step.id);
      AIGCUtils.EventBus.emit("tutorial:show", { step: step });
      console.log("[Tutorial] " + step.text);
    },

    dismiss: function () {
      AIGCUtils.Tutorial.active = false;
      AIGCUtils.EventBus.emit("tutorial:dismiss");
    },

    isActive: function () {
      return AIGCUtils.Tutorial.active;
    },

    draw: function () {
      if (!AIGCUtils.Tutorial.active) return;

      var renderer = AIGCUtils.Renderer;
      if (!renderer) return;

      // 半透明遮罩
      renderer.drawRect(0, 0, renderer.width, renderer.height, [0, 0, 0, 0.6]);

      // 提示框
      var boxW = renderer.width - 40;
      var boxH = 120;
      var boxX = 20;
      var boxY = renderer.height / 2 - boxH / 2;
      renderer.drawRect(boxX, boxY, boxW, boxH, renderer.colors.ui_bg);
      renderer.drawRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4, [0.15, 0.15, 0.25, 1.0]);

      // 文字
      var currentStep = AIGCUtils.Tutorial.steps.find(function (s) {
        return AIGCUtils.Tutorial.shownSteps.indexOf(s.id) >= 0 &&
          AIGCUtils.Tutorial.shownSteps[AIGCUtils.Tutorial.shownSteps.length - 1] === s.id;
      });
      if (currentStep) {
        renderer.drawText(currentStep.text, boxX + 20, boxY + 30, 16, renderer.colors.white);
      }

      // 继续按钮
      renderer.drawButton(boxX + boxW / 2 - 50, boxY + boxH - 50, 100, 36, "知道了", renderer.colors.wood);
    },
  };
})();
