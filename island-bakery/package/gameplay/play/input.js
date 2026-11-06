(function () {
  var AIGCUtils = window.AIGCUtils;

  function inside(x, y, left, top, width, height) {
    return x >= left && x <= left + width && y >= top && y <= top + height;
  }

  AIGCUtils.Input = {
    initialized: false,
    isDown: false,
    lastTouchAt: 0,

    init: function () {
      if (this.initialized) return;
      this.initialized = true;
      var canvas = window.canvas;
      canvas.addEventListener("touchstart", this.onTouchStart.bind(this), { passive: false });
      canvas.addEventListener("touchmove", this.onTouchMove.bind(this), { passive: false });
      canvas.addEventListener("touchend", this.onTouchEnd.bind(this), { passive: false });
      canvas.addEventListener("mousedown", this.onMouseDown.bind(this));
      canvas.addEventListener("mouseup", this.onMouseUp.bind(this));
    },

    point: function (clientX, clientY) {
      var canvas = window.canvas;
      var rect = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      var logicalX = ((clientX - rect.left) * (canvas.width / dpr)) / rect.width;
      var logicalY = ((clientY - rect.top) * (canvas.height / dpr)) / rect.height;
      return AIGCUtils.Renderer.toDesign(logicalX, logicalY);
    },

    onTouchStart: function (event) {
      event.preventDefault();
      this.lastTouchAt = Date.now();
      var touch = event.touches[0];
      var point = this.point(touch.clientX, touch.clientY);
      this.press(point.x, point.y);
    },

    onTouchMove: function (event) {
      event.preventDefault();
    },

    onTouchEnd: function (event) {
      event.preventDefault();
      this.lastTouchAt = Date.now();
      this.release();
    },

    onMouseDown: function (event) {
      if (Date.now() - this.lastTouchAt < 700) return;
      var point = this.point(event.clientX, event.clientY);
      this.press(point.x, point.y);
    },

    onMouseUp: function () {
      if (Date.now() - this.lastTouchAt < 700) return;
      this.release();
    },

    treeAt: function (x, y) {
      var R = AIGCUtils.Renderer;
      var W = R.width, H = R.height;
      var ct = 64, cb = H - 72, ch = cb - ct;
      var groundRatio = R.portrait ? 0.72 : 0.64;
      var groundY = ct + Math.round(ch * groundRatio);
      var treeTopY = ct + Math.round(ch * 0.05);
      if (y < treeTopY || y > groundY + 40) return -1;
      var treeX = R.portrait
        ? [Math.round(W * 0.276), Math.round(W * 0.5), Math.round(W * 0.724)]
        : [265, 480, 695];
      var hitRadius = Math.round(W * 0.1);
      for (var i = 0; i < treeX.length; i++) {
        if (Math.abs(x - treeX[i]) <= hitRadius) return i;
      }
      return -1;
    },

    press: function (x, y) {
      this.isDown = true;
      var game = AIGCUtils.Game;
      var collection = AIGCUtils.Collection;
      var baking = AIGCUtils.Baking;
      var R = AIGCUtils.Renderer;
      var W = R.width, H = R.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      var portrait = R.portrait;
      var navY = H - 72;

      // ── 弹窗交互（W/H 居中，横竖屏通用）──
      if (game.offlinePrompt) {
        if (inside(x, y, hw - 230, hh + 40, 230, 58)) game.unlockOffline();
        if (inside(x, y, hw + 20, hh + 40, 170, 58)) game.closeOfflinePrompt();
        return;
      }
      if (game.offlineDialog) {
        if (inside(x, y, hw - 295, hh + 40, 170, 58)) game.claimOffline(false);
        if (inside(x, y, hw - 115, hh + 40, 230, 58)) game.claimOffline(true);
        if (inside(x, y, hw + 125, hh + 40, 110, 58)) game.closeOfflineDialog();
        return;
      }
      if (game.building) {
        if (portrait) {
          if (inside(x, y, hw - 110, H - 72 - 68, 220, 54)) game.buildAction();
        } else {
          if (inside(x, y, 330, 390, 300, 130)) game.buildAction();
        }
        return;
      }
      if (game.energyPrompt) {
        var energy = AIGCUtils.Energy.get(game.energyPrompt);
        if (energy.remainingAds !== 0 && inside(x, y, hw - 220, hh + 40, 230, 58)) game.restoreEnergyByAd();
        if (inside(x, y, hw + 20, hh + 40, 180, 58) || energy.remainingAds === 0 && inside(x, y, hw - 90, hh + 40, 180, 58)) game.closeEnergyPrompt();
        return;
      }
      if (collection.phase === "fishResult") {
        var showGuide = AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt;
        if (showGuide && inside(x, y, hw - 200, hh + 65, 180, 54)) {
          collection.acknowledgeFish();
          game.navigate("map");
        } else if (showGuide && inside(x, y, hw + 10, hh + 65, 180, 54)) {
          collection.acknowledgeFish();
        } else if (!showGuide && inside(x, y, hw - 110, hh + 65, 220, 54)) {
          collection.acknowledgeFish();
        }
        return;
      }
      if (game.currentArea === "fishing" && collection.phase === "fishEscaped") {
        if (portrait) {
          var dlgH2 = 280, dlgY2 = Math.round(H / 2 - dlgH2 / 2);
          if (inside(x, y, 30, dlgY2 + 180, 220, 52)) collection.reviveFish();
          if (inside(x, y, 268, dlgY2 + 180, 170, 52)) collection.leaveFishing();
        } else {
          if (inside(x, y, 260, 335, 220, 54)) collection.reviveFish();
          if (inside(x, y, 500, 335, 180, 54)) collection.leaveFishing();
        }
        return;
      }
      if (collection.phase === "coconutSummary" && game.currentArea === "coconut") {
        if (AIGCUtils.GameState.shopBuilt && inside(x, y, hw - 200, hh + 50, 180, 54)) collection.startCoconutRound(1);
        if (AIGCUtils.GameState.shopBuilt && inside(x, y, hw + 10, hh + 50, 180, 54)) game.navigate("map");
        if (!AIGCUtils.GameState.shopBuilt && AIGCUtils.GameState.tasks.coconut && inside(x, y, hw + 10, hh + 50, 180, 54)) collection.startCoconutRound(1);
        if (!AIGCUtils.GameState.tasks.coconut && inside(x, y, hw - 90, hh + 50, 180, 54)) collection.startCoconutRound(1);
        if (!AIGCUtils.GameState.shopBuilt && AIGCUtils.GameState.tasks.coconut && inside(x, y, hw - 200, hh + 50, 180, 54)) game.beginBuild();
        return;
      }
      if (game.showInventory) {
        game.showInventory = false;
        return;
      }
      // ── 导航栏 ──
      if (y >= navY) {
        if (inside(x, y, 20, navY + 8, 130, 48)) game.navigate("map");
        if (inside(x, y, 170, navY + 8, 130, 48)) game.showInventory = true;
        return;
      }
      // ── 地图 ──
      if (game.currentArea === "map") {
        if (portrait) {
          var ct = 64, ch = H - 136;
          var zoneH = Math.round(ch * 0.27);
          var gap = Math.round(ch * 0.035);
          var fishY = ct + gap, coconutY = ct + zoneH + gap * 2, shopY = ct + zoneH * 2 + gap * 3;
          if (inside(x, y, hw - 140, H - 72 - 62, 280, 48)) { game.showOfflineEntry(); return; }
          if (inside(x, y, 10, fishY, W - 20, zoneH)) game.navigate("fishing");
          if (inside(x, y, 10, coconutY, W - 20, zoneH)) game.navigate("coconut");
          if (inside(x, y, 10, shopY, W - 20, zoneH)) game.navigate("shop");
        } else {
          if (inside(x, y, 675, 405, 250, 48)) { game.showOfflineEntry(); return; }
          if (inside(x, y, 80, 105, 330, 180)) game.navigate("fishing");
          if (inside(x, y, 520, 90, 330, 180)) game.navigate("coconut");
          if (inside(x, y, 330, 295, 330, 150)) game.navigate("shop");
        }
        return;
      }
      // ── 钓鱼区 ──
      if (game.currentArea === "fishing") {
        if (portrait) {
          var ct2 = 64, cb2 = H - 72, ch2 = cb2 - ct2;
          var uiH = Math.round(ch2 * 0.33);
          var btnW = Math.round((W - 16) / 3);
          var actY = cb2 - 58;
          // 离开按钮
          if (inside(x, y, W - 108, ct2 + 8, 98, 38)) { collection.leaveFishing(); game.navigate("map"); return; }
          if (collection.phase === "idle") {
            // 钓点
            if (inside(x, y, 8, ct2 + 54, btnW, 34)) collection.selectSpot("shallow");
            if (inside(x, y, 8 + btnW + 2, ct2 + 54, btnW, 34)) collection.selectSpot("reef");
            if (inside(x, y, 8 + (btnW + 2) * 2, ct2 + 54, btnW, 34)) collection.selectSpot("deep");
            // 鱼饵
            if (inside(x, y, 8, ct2 + 94, btnW, 34)) collection.selectBait("worm");
            if (inside(x, y, 8 + btnW + 2, ct2 + 94, btnW, 34)) collection.selectBait("shrimp");
            if (inside(x, y, 8 + (btnW + 2) * 2, ct2 + 94, btnW, 34)) collection.selectBait("secret");
            // 抛竿按钮
            if (inside(x, y, hw - 120, actY, 240, 50)) collection.startCharge();
            return;
          }
          if (collection.phase === "waiting" || collection.phase === "bite") {
            if (inside(x, y, hw - 120, actY, 240, 50)) collection.strike();
            return;
          }
          if (collection.phase === "reeling" && inside(x, y, hw - 140, actY, 280, 52)) collection.setReelHeld(true);
        } else {
          if (inside(x, y, 835, 72, 100, 42)) { collection.leaveFishing(); game.navigate("map"); return; }
          if (collection.phase === "idle") {
            if (inside(x, y, 14, 376, 120, 38)) collection.selectSpot("shallow");
            if (inside(x, y, 142, 376, 120, 38)) collection.selectSpot("reef");
            if (inside(x, y, 270, 376, 120, 38)) collection.selectSpot("deep");
            if (inside(x, y, 14, 420, 120, 38)) collection.selectBait("worm");
            if (inside(x, y, 142, 420, 120, 38)) collection.selectBait("shrimp");
            if (inside(x, y, 270, 420, 120, 38)) collection.selectBait("secret");
            if (inside(x, y, 520, 405, 240, 50)) collection.startCharge();
            return;
          }
          if (collection.phase === "waiting" || collection.phase === "bite") {
            if (inside(x, y, 360, 405, 240, 50)) collection.strike();
            return;
          }
          if (collection.phase === "reeling" && inside(x, y, 330, 395, 300, 65)) collection.setReelHeld(true);
        }
        return;
      }
      // ── 椰林区 ──
      if (game.currentArea === "coconut") {
        if (collection.phase === "coconutRound" && collection.catchCoconut(x, y)) return;
        var treeIndex = this.treeAt(x, y);
        if (treeIndex >= 0) collection.shakeTree(treeIndex);
        return;
      }
      // ── 烤鱼店 ──
      if (game.currentArea === "shop") {
        if (portrait) {
          var ct3 = 64, ch3 = H - 136;
          var custH3 = Math.round(ch3 * 0.47);
          var custBottom3 = ct3 + custH3;
          var kitchenY3 = custBottom3 + 14;
          var kitchenH3 = Math.round(ch3 * 0.38);
          var kitchenW3 = Math.round(W * 2 / 3);
          var juiceW3 = W - kitchenW3;
          // 顾客点击（左/右半区域，面朝玩家）
          if (y >= ct3 && y <= custBottom3) {
            if (x < Math.round(W / 2)) { game.sellCustomer(0); return; }
            else { game.sellCustomer(1); return; }
          }
          // 烤制区（左2/3厨房）
          if (baking.current && inside(x, y, 0, kitchenY3, kitchenW3, kitchenH3)) {
            baking.hit(); return;
          }
          // 椰子汁区（右1/3）
          if (inside(x, y, kitchenW3 + 4, kitchenY3 + 28, juiceW3 - 10, kitchenH3 - 40)) {
            if (baking.current && baking.current.recipeId === "coconut_juice") { baking.hit(); return; }
            if (!baking.current) { game.startRecipe("coconut_juice"); return; }
          }
          // 鱼品选择
          var bW2 = Math.round((W - 10) / AIGCUtils.FishSpecies.length);
          for (var i = 0; i < AIGCUtils.FishSpecies.length; i++) {
            if (inside(x, y, 5 + i * bW2, H - 72 - 60, bW2 - 4, 50)) {
              game.startRecipe("fish_grilled", { speciesId: AIGCUtils.FishSpecies[i].id }); return;
            }
          }
        } else {
          if (inside(x, y, 630, 95, 300, 140)) { game.sellCustomer(0); return; }
          if (inside(x, y, 630, 250, 300, 140)) { game.sellCustomer(1); return; }
          if (baking.current && inside(x, y, 45, 120, 550, 265)) { baking.hit(); return; }
          if (!baking.current) {
            if (inside(x, y, 495, 175, 115, 115)) { game.startRecipe("coconut_juice"); return; }
            for (var j = 0; j < AIGCUtils.FishSpecies.length; j++) {
              if (inside(x, y, 20 + j * 150, 402, 135, 54)) {
                game.startRecipe("fish_grilled", { speciesId: AIGCUtils.FishSpecies[j].id }); return;
              }
            }
          }
        }
      }
    },

    release: function () {
      this.isDown = false;
      if (AIGCUtils.Game.currentArea !== "fishing") return;
      if (AIGCUtils.Collection.phase === "charging") AIGCUtils.Collection.releaseCast();
      AIGCUtils.Collection.setReelHeld(false);
    }
  };
})();
