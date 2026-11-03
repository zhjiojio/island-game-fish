(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.Achievement = {
    achievements: [
      { id: "first_bread", name: "第一个面包", description: "烤出第一个面包", condition: function () { return AIGCUtils.GameState.stats.totalBaked >= 1; }, reward: 10 },
      { id: "baker_10", name: "初级面包师", description: "累计烤出10个面包", condition: function () { return AIGCUtils.GameState.stats.totalBaked >= 10; }, reward: 50 },
      { id: "baker_100", name: "高级面包师", description: "累计烤出100个面包", condition: function () { return AIGCUtils.GameState.stats.totalBaked >= 100; }, reward: 200 },
      { id: "seller_10", name: "初级商人", description: "累计卖出10个面包", condition: function () { return AIGCUtils.GameState.stats.totalSold >= 10; }, reward: 50 },
      { id: "seller_100", name: "高级商人", description: "累计卖出100个面包", condition: function () { return AIGCUtils.GameState.stats.totalSold >= 100; }, reward: 200 },
      { id: "rich_100", name: "小有积蓄", description: "累计赚取100金币", condition: function () { return AIGCUtils.GameState.stats.totalCoins >= 100; }, reward: 20 },
      { id: "rich_1000", name: "富甲一方", description: "累计赚取1000金币", condition: function () { return AIGCUtils.GameState.stats.totalCoins >= 1000; }, reward: 100 },
      { id: "survivor_7", name: "一周生存", description: "生存到第7天", condition: function () { return AIGCUtils.GameState.day >= 7; }, reward: 100 },
      { id: "survivor_30", name: "月度经营", description: "生存到第30天", condition: function () { return AIGCUtils.GameState.day >= 30; }, reward: 500 },
      { id: "defender", name: "守夜人", description: "成功防御10波野兽", condition: function () { return AIGCUtils.GameState.day >= 10; }, reward: 150 },
      { id: "collector", name: "采集大师", description: "解锁所有采集点", condition: function () { return AIGCUtils.GameState.day >= 8; }, reward: 100 },
      { id: "vip_serve", name: "VIP服务", description: "成功招待VIP客人", condition: function () { return false; }, reward: 200 },
    ],

    unlocked: [],

    init: function () {
      AIGCUtils.Achievement.unlocked = [];
    },

    update: function () {
      AIGCUtils.Achievement.achievements.forEach(function (ach) {
        if (AIGCUtils.Achievement.unlocked.indexOf(ach.id) >= 0) return;
        if (ach.condition()) {
          AIGCUtils.Achievement.unlock(ach);
        }
      });
    },

    unlock: function (achievement) {
      AIGCUtils.Achievement.unlocked.push(achievement.id);
      AIGCUtils.GameState.addCoins(achievement.reward);
      AIGCUtils.EventBus.emit("achievement:unlock", {
        achievement: achievement,
        reward: achievement.reward,
      });
      console.log("[Achievement] Unlocked: " + achievement.name + " (+" + achievement.reward + "金币)");
    },

    getUnlocked: function () {
      return AIGCUtils.Achievement.unlocked;
    },

    getProgress: function () {
      return AIGCUtils.Achievement.unlocked.length + "/" + AIGCUtils.Achievement.achievements.length;
    },
  };
})();
