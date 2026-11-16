(function () {
  var AIGCUtils = window.AIGCUtils;

  /**
   * 地图点击区域（设计坐标）
   * 横屏：按用户红框标定 + ui-skin-map-land 上路牌「钓鱼区 / 烤鱼店 / 椰林区」位置（960×540）
   * 竖屏：ui-skin-map-port 三路牌分块（540×960）
   * 带锁路牌：横竖分别按 map-land / map-port 量取，不与钓鱼/椰林/烤鱼店重叠
   */
  AIGCUtils.MapZones = {
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

    hitLandscape: function (x, y, state) {
      var z = this.land;
      if (this.inRect(x, y, z.offline)) return "offline";
      if (this.inRect(x, y, z.fish)) return "fishing";
      if (this.inRect(x, y, z.coconut)) return "coconut";
      if (this.inRect(x, y, z.shop)) return state.shopBuilt ? "shop" : "locked";
      if (
        this.inRect(x, y, z.forest) ||
        this.inRect(x, y, z.farm) ||
        this.inRect(x, y, z.bakery) ||
        this.inRect(x, y, z.garden) ||
        this.inRect(x, y, z.warehouse)
      ) {
        return "locked";
      }
      return null;
    },

    hitPortrait: function (x, y, W, H, state) {
      var z = this.port;
      var offlineY = H - 72 - 62;
      var offline = { x: Math.round(W / 2) - 140, y: offlineY, w: 280, h: 48 };
      if (this.inRect(x, y, offline)) return "offline";
      if (this.inRect(x, y, z.fish)) return "fishing";
      if (this.inRect(x, y, z.coconut)) return "coconut";
      if (this.inRect(x, y, z.shop)) return state.shopBuilt ? "shop" : "locked";
      if (
        this.inRect(x, y, z.garden) ||
        this.inRect(x, y, z.bakery) ||
        this.inRect(x, y, z.warehouse)
      ) {
        return "locked";
      }
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
