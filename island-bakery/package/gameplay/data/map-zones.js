(function () {
  var AIGCUtils = window.AIGCUtils;

  /**
   * 地图点击区域（设计坐标）
   * 横屏：按用户红框标定 + ui-skin-map-land 上路牌「钓鱼区 / 烤鱼店 / 椰林区」位置（960×540）
   * 竖屏：ui-skin-map-port 三路牌分块（540×960）
   * 带锁路牌：横竖分别按 map-land / map-port 量取，不与钓鱼/椰林/烤鱼店重叠
   */
  /**
   * 未解锁区域提示配置（仅展示条件；真扣币开门后置）
   * 权威数值：仓库根目录《孤岛烤鱼店 · 游戏设计文档》§三 / 附录 A2.1（2026-11-22 定稿）
   * key 与 hit 返回的 locked_* 后缀一致
   */
  var MAP_LOCKED_INFO = {
    forest: { name: "森林", level: 3, coins: 100 },
    warehouse: { name: "仓库", level: 4, coins: 200 },
    farm: { name: "养殖区", level: 5, coins: 500 },
    garden: { name: "菜园", level: 7, coins: 800 },
    bakery: { name: "面包房", level: 10, coins: 1000 },
    coconut: { fishGuide: true },
    shop: { buildGuide: true }
  };

  AIGCUtils.MapZones = {
    lockedInfo: MAP_LOCKED_INFO,

    land: {
      fish: { x: 228, y: 100, w: 134, h: 115 },
      coconut: { x: 385, y: 98, w: 118, h: 115 },
      shop: { x: 32, y: 252, w: 140, h: 130 },
      offline: { x: 675, y: 405, w: 250, h: 48 },
      // 带锁路牌（森林 / 养殖 / 面包房 / 菜园 / 仓库）
      forest: { x: 560, y: 105, w: 130, h: 115 },
      farm: { x: 600, y: 250, w: 130, h: 115 },
      bakery: { x: 225, y: 372, w: 134, h: 115 },
      garden: { x: 412, y: 377, w: 134, h: 115 },
      warehouse: { x: 600, y: 370, w: 120, h: 70 }
    },
    port: {
      fish: { x: 26, y: 90, w: 250, h: 215 },
      coconut: { x: 22, y: 312, w: 248, h: 235 },
      shop: { x: 268, y: 312, w: 252, h: 235 },
      offline: { x: 130, y: 884, w: 280, h: 48 },
      // 竖屏底段带锁路牌（菜园 / 面包房 / 仓库）
      garden: { x: 50, y: 560, w: 160, h: 140 },
      bakery: { x: 250, y: 620, w: 130, h: 130 },
      warehouse: { x: 380, y: 600, w: 140, h: 140 }
    },

    inRect: function (x, y, r) {
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    },

    lockedHit: function (zoneKey) {
      return "locked_" + zoneKey;
    },

    parseLockedZone: function (hit) {
      if (!hit || hit.indexOf("locked_") !== 0) return null;
      return hit.slice("locked_".length);
    },

    getLockedPromptLines: function (zoneKey) {
      var info = MAP_LOCKED_INFO[zoneKey];
      var title = "未达到解锁条件";
      if (!info) {
        return { title: title, detail: "该区域暂未开放" };
      }
      if (info.fishGuide) {
        return { title: title, detail: "先完成钓鱼" };
      }
      if (info.buildGuide) {
        return { title: title, detail: "先完成钓鱼和椰子采集并搭建" };
      }
      return {
        title: title,
        detail: info.name + "达到" + info.level + "级后花费" + info.coins + "金币即可解锁"
      };
    },

    /** R0025：椰林/烤鱼店是否教程态可点（未锁） */
    isCoconutOpen: function (state) {
      var Onboarding = AIGCUtils.Onboarding;
      if (Onboarding) return !Onboarding.isCoconutLocked();
      return !!(state && state.tasks && state.tasks.fish);
    },

    isShopOpen: function (state) {
      if (state && state.shopBuilt) return true;
      var Onboarding = AIGCUtils.Onboarding;
      if (Onboarding) return Onboarding.isShopClickableUnbuilt();
      return false;
    },

    hitLandscape: function (x, y, state) {
      var z = this.land;
      if (this.inRect(x, y, z.offline)) return "offline";
      if (this.inRect(x, y, z.fish)) return "fishing";
      if (this.inRect(x, y, z.coconut)) {
        return this.isCoconutOpen(state) ? "coconut" : this.lockedHit("coconut");
      }
      if (this.inRect(x, y, z.shop)) {
        return this.isShopOpen(state) ? "shop" : this.lockedHit("shop");
      }
      if (this.inRect(x, y, z.forest)) return this.lockedHit("forest");
      if (this.inRect(x, y, z.farm)) return this.lockedHit("farm");
      if (this.inRect(x, y, z.bakery)) return this.lockedHit("bakery");
      if (this.inRect(x, y, z.garden)) return this.lockedHit("garden");
      if (this.inRect(x, y, z.warehouse)) return this.lockedHit("warehouse");
      return null;
    },

    hitPortrait: function (x, y, W, H, state) {
      var z = this.port;
      var offlineY = H - 72 - 62;
      var offline = { x: Math.round(W / 2) - 140, y: offlineY, w: 280, h: 48 };
      if (this.inRect(x, y, offline)) return "offline";
      if (this.inRect(x, y, z.fish)) return "fishing";
      if (this.inRect(x, y, z.coconut)) {
        return this.isCoconutOpen(state) ? "coconut" : this.lockedHit("coconut");
      }
      if (this.inRect(x, y, z.shop)) {
        return this.isShopOpen(state) ? "shop" : this.lockedHit("shop");
      }
      if (this.inRect(x, y, z.garden)) return this.lockedHit("garden");
      if (this.inRect(x, y, z.bakery)) return this.lockedHit("bakery");
      if (this.inRect(x, y, z.warehouse)) return this.lockedHit("warehouse");
      return null;
    },

    /** @deprecated 仅 drawMap 竖屏遮罩用 */
    portraitLayout: function (H) {
      var ct = 64, ch = H - 136;
      var zoneH = Math.round(ch * 0.27);
      var gap = Math.round(ch * 0.035);
      return { zoneH: zoneH, fishY: ct + gap, coconutY: ct + zoneH + gap * 2 };
    }
  };
})();
