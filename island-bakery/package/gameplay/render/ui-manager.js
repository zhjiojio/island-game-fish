(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.UIManager = {
    // UI状态
    showShop: false,
    showSettings: false,
    showAchievements: false,
    showOfflineDialog: false,

    // 按钮区域定义
    buttons: {
      shop: { x: 320, y: 60, w: 80, h: 36 },
      settings: { x: 10, y: 60, w: 80, h: 36 },
      achievements: { x: 110, y: 60, w: 80, h: 36 },
      share: { x: 220, y: 60, w: 80, h: 36 },
      close: { x: 350, y: 10, w: 40, h: 40 },
    },

    init: function () {
      AIGCUtils.UIManager.showShop = false;
      AIGCUtils.UIManager.showSettings = false;
      AIGCUtils.UIManager.showAchievements = false;
      AIGCUtils.UIManager.showOfflineDialog = false;
    },

    // 检查点击
    handleClick: function (x, y) {
      // 检查离线收益弹窗
      if (AIGCUtils.UIManager.showOfflineDialog) {
        AIGCUtils.UIManager.showOfflineDialog = false;
        return true;
      }

      // 检查教程
      if (AIGCUtils.Tutorial && AIGCUtils.Tutorial.isActive()) {
        AIGCUtils.Tutorial.dismiss();
        return true;
      }

      // 检查设置面板
      if (AIGCUtils.UIManager.showSettings) {
        AIGCUtils.UIManager.showSettings = false;
        return true;
      }

      // 检查成就面板
      if (AIGCUtils.UIManager.showAchievements) {
        AIGCUtils.UIManager.showAchievements = false;
        return true;
      }

      // 检查商店面板
      if (AIGCUtils.UIManager.showShop) {
        // 检查关闭按钮
        var closeBtn = AIGCUtils.UIManager.buttons.close;
        if (AIGCUtils.UIManager.isHit(x, y, closeBtn)) {
          AIGCUtils.UIManager.showShop = false;
          return true;
        }
        // 检查升级购买
        AIGCUtils.UIManager.handleShopClick(x, y);
        return true;
      }

      // 检查顶部按钮
      if (AIGCUtils.UIManager.isHit(x, y, AIGCUtils.UIManager.buttons.shop)) {
        AIGCUtils.UIManager.showShop = true;
        return true;
      }
      if (AIGCUtils.UIManager.isHit(x, y, AIGCUtils.UIManager.buttons.settings)) {
        AIGCUtils.UIManager.showSettings = true;
        return true;
      }
      if (AIGCUtils.UIManager.isHit(x, y, AIGCUtils.UIManager.buttons.achievements)) {
        AIGCUtils.UIManager.showAchievements = true;
        return true;
      }
      if (AIGCUtils.UIManager.isHit(x, y, AIGCUtils.UIManager.buttons.share)) {
        if (AIGCUtils.ShareManager) AIGCUtils.ShareManager.shareShop();
        return true;
      }

      return false;
    },

    isHit: function (x, y, btn) {
      return x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
    },

    handleShopClick: function (x, y) {
      if (!AIGCUtils.Upgrades || !AIGCUtils.GameState) return;
      var upgrades = AIGCUtils.Upgrades.getAvailable(AIGCUtils.GameState.day, AIGCUtils.GameState.coins);
      upgrades.forEach(function (u, i) {
        var itemY = 120 + i * 70;
        if (y >= itemY && y <= itemY + 60 && x >= 20 && x <= 390) {
          var result = AIGCUtils.GameState.buyUpgrade(u.id);
          if (result) {
            AIGCUtils.EventBus.emit("ui:upgrade_bought", { upgrade: u });
          }
        }
      });
    },

    draw: function () {
      var renderer = AIGCUtils.Renderer;
      if (!renderer) return;

      // 绘制顶部按钮
      var btns = AIGCUtils.UIManager.buttons;
      renderer.drawButton(btns.settings.x, btns.settings.y, btns.settings.w, btns.settings.h, "设置", renderer.colors.ui_bg);
      renderer.drawButton(btns.achievements.x, btns.achievements.y, btns.achievements.w, btns.achievements.h, "成就", renderer.colors.ui_bg);
      renderer.drawButton(btns.share.x, btns.share.y, btns.share.w, btns.share.h, "分享", renderer.colors.ui_bg);
      renderer.drawButton(btns.shop.x, btns.shop.y, btns.shop.w, btns.shop.h, "商店", renderer.colors.ui_bg);

      // 绘制商店面板
      if (AIGCUtils.UIManager.showShop) {
        AIGCUtils.UIManager.drawShop(renderer);
      }

      // 绘制设置面板
      if (AIGCUtils.UIManager.showSettings) {
        AIGCUtils.UIManager.drawSettings(renderer);
      }

      // 绘制成就面板
      if (AIGCUtils.UIManager.showAchievements) {
        AIGCUtils.UIManager.drawAchievements(renderer);
      }

      // 绘制离线收益弹窗
      if (AIGCUtils.UIManager.showOfflineDialog) {
        AIGCUtils.UIManager.drawOfflineDialog(renderer);
      }

      // 绘制教程
      if (AIGCUtils.Tutorial) {
        AIGCUtils.Tutorial.draw();
      }
    },

    drawShop: function (renderer) {
      renderer.drawRect(0, 0, renderer.width, renderer.height, [0, 0, 0, 0.7]);
      renderer.drawRect(20, 80, renderer.width - 40, renderer.height - 160, renderer.colors.ui_bg);
      renderer.drawText("升级商店", renderer.width / 2 - 60, 100, 24, renderer.colors.gold);

      if (AIGCUtils.Upgrades && AIGCUtils.GameState) {
        var upgrades = AIGCUtils.Upgrades.getAvailable(AIGCUtils.GameState.day, AIGCUtils.GameState.coins);
        if (upgrades.length === 0) {
          renderer.drawText("暂无可购买升级", renderer.width / 2 - 80, 200, 18, renderer.colors.white);
        }
        upgrades.forEach(function (u, i) {
          var y = 140 + i * 70;
          renderer.drawRect(30, y, renderer.width - 60, 60, renderer.colors.wood);
          renderer.drawText(u.name + " - " + u.cost + "金币", 40, y + 10, 16, renderer.colors.white);
          renderer.drawText(u.description, 40, y + 35, 12, renderer.colors.gold);
        });
      }

      renderer.drawButton(renderer.width / 2 - 50, renderer.height - 120, 100, 36, "关闭", renderer.colors.ui_bg);
    },

    drawSettings: function (renderer) {
      renderer.drawRect(0, 0, renderer.width, renderer.height, [0, 0, 0, 0.7]);
      renderer.drawRect(40, 150, renderer.width - 80, 300, renderer.colors.ui_bg);
      renderer.drawText("设置", renderer.width / 2 - 30, 170, 24, renderer.colors.gold);

      var sound = AIGCUtils.SoundManager;
      var bgmText = sound && sound.bgmEnabled ? "BGM: 开" : "BGM: 关";
      var sfxText = sound && sound.sfxEnabled ? "音效: 开" : "音效: 关";

      renderer.drawButton(renderer.width / 2 - 80, 220, 160, 40, bgmText, renderer.colors.wood);
      renderer.drawButton(renderer.width / 2 - 80, 280, 160, 40, sfxText, renderer.colors.wood);
      renderer.drawButton(renderer.width / 2 - 80, 340, 160, 40, "重置游戏", renderer.colors.red);
      renderer.drawButton(renderer.width / 2 - 50, 400, 100, 36, "关闭", renderer.colors.ui_bg);
    },

    drawAchievements: function (renderer) {
      renderer.drawRect(0, 0, renderer.width, renderer.height, [0, 0, 0, 0.7]);
      renderer.drawRect(20, 80, renderer.width - 40, renderer.height - 160, renderer.colors.ui_bg);
      renderer.drawText("成就", renderer.width / 2 - 30, 100, 24, renderer.colors.gold);

      if (AIGCUtils.Achievement) {
        var progress = AIGCUtils.Achievement.getProgress();
        renderer.drawText("进度: " + progress, renderer.width / 2 - 50, 130, 16, renderer.colors.white);
      }

      renderer.drawButton(renderer.width / 2 - 50, renderer.height - 120, 100, 36, "关闭", renderer.colors.ui_bg);
    },

    drawOfflineDialog: function (renderer) {
      renderer.drawRect(0, 0, renderer.width, renderer.height, [0, 0, 0, 0.7]);
      renderer.drawRect(40, 200, renderer.width - 80, 200, renderer.colors.ui_bg);

      var earnings = AIGCUtils.GameState ? AIGCUtils.GameState.offlineEarnings : 0;
      var duration = AIGCUtils.OfflineManager ? AIGCUtils.OfflineManager.getOfflineDuration() : "";

      renderer.drawText("欢迎回来！", renderer.width / 2 - 60, 230, 24, renderer.colors.gold);
      renderer.drawText("离线时长: " + duration, renderer.width / 2 - 80, 270, 16, renderer.colors.white);
      renderer.drawText("离线收益: " + earnings + " 金币", renderer.width / 2 - 80, 300, 18, renderer.colors.gold);
      renderer.drawButton(renderer.width / 2 - 60, 340, 120, 40, "领取", renderer.colors.wood);
    },
  };
})();
