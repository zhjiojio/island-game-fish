(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.Upgrades = {
    // 设备升级
    oven: {
      id: "oven",
      name: "基础烤箱",
      description: "能烤出香喷喷的面包",
      cost: 0,
      unlockDay: 1,
      category: "device",
      effect: { bakeSpeed: 1.0 },
    },
    grill: {
      id: "grill",
      name: "烧烤架",
      description: "解锁烧烤类食谱",
      cost: 200,
      unlockDay: 5,
      category: "device",
      effect: { unlockCategory: "bbq" },
    },
    pot: {
      id: "pot",
      name: "大锅",
      description: "解锁海鲜类食谱",
      cost: 500,
      unlockDay: 10,
      category: "device",
      effect: { unlockCategory: "seafood" },
    },
    oven_advanced: {
      id: "oven_advanced",
      name: "高级烤箱",
      description: "解锁VIP专属食谱",
      cost: 1000,
      unlockDay: 15,
      category: "device",
      effect: { unlockCategory: "dessert", bakeSpeed: 1.5 },
    },
    // 店铺扩建
    shop_expand_1: {
      id: "shop_expand_1",
      name: "扩建一层",
      description: "店铺从木板升级为石屋",
      cost: 100,
      unlockDay: 3,
      category: "shop",
      effect: { maxCustomers: 3, visualLevel: 2 },
    },
    shop_expand_2: {
      id: "shop_expand_2",
      name: "扩建二层",
      description: "店铺升级为木屋",
      cost: 300,
      unlockDay: 7,
      category: "shop",
      effect: { maxCustomers: 5, visualLevel: 3 },
    },
    shop_expand_3: {
      id: "shop_expand_3",
      name: "扩建三层",
      description: "店铺升级为豪华小楼",
      cost: 800,
      unlockDay: 14,
      category: "shop",
      effect: { maxCustomers: 8, visualLevel: 4 },
    },
    // 效率升级
    auto_collect: {
      id: "auto_collect",
      name: "自动采集",
      description: "离线时自动采集基础食材",
      cost: 150,
      unlockDay: 4,
      category: "efficiency",
      effect: { offlineCollect: true },
    },
    fast_bake: {
      id: "fast_bake",
      name: "快速烘焙",
      description: "烘焙速度提升50%",
      cost: 250,
      unlockDay: 8,
      category: "efficiency",
      effect: { bakeSpeed: 1.5 },
    },
    auto_sell: {
      id: "auto_sell",
      name: "自动售卖",
      description: "面包烤好后自动出售",
      cost: 400,
      unlockDay: 11,
      category: "efficiency",
      effect: { autoSell: true },
    },
  };

  AIGCUtils.Upgrades.getAvailable = function (day, coins) {
    var list = [];
    for (var key in AIGCUtils.Upgrades) {
      var u = AIGCUtils.Upgrades[key];
      if (!u || typeof u !== "object" || !u.id) continue;
      if (u.unlockDay <= day && coins >= u.cost) {
        list.push(u);
      }
    }
    return list;
  };

  AIGCUtils.Upgrades.getById = function (id) {
    return AIGCUtils.Upgrades[id] || null;
  };
})();
