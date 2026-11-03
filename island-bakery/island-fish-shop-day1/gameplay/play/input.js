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
      if (y < 105 || y > 340) return -1;
      var centers = [265, 480, 695];
      for (var i = 0; i < centers.length; i++) {
        if (Math.abs(x - centers[i]) <= 95) return i;
      }
      return -1;
    },

    press: function (x, y) {
      this.isDown = true;
      var game = AIGCUtils.Game;
      var collection = AIGCUtils.Collection;
      var baking = AIGCUtils.Baking;
      if (game.offlinePrompt) {
        if (inside(x, y, 270, 340, 230, 58)) game.unlockOffline();
        if (inside(x, y, 520, 340, 170, 58)) game.closeOfflinePrompt();
        return;
      }
      if (game.offlineDialog) {
        if (inside(x, y, 205, 340, 170, 58)) game.claimOffline(false);
        if (inside(x, y, 395, 340, 230, 58)) game.claimOffline(true);
        if (inside(x, y, 645, 340, 110, 58)) game.closeOfflineDialog();
        return;
      }
      if (game.building) {
        if (inside(x, y, 330, 390, 300, 130)) game.buildAction();
        return;
      }
      if (game.energyPrompt) {
        var energy = AIGCUtils.Energy.get(game.energyPrompt);
        if (energy.remainingAds !== 0 && inside(x, y, 260, 340, 230, 58)) game.restoreEnergyByAd();
        if (inside(x, y, 520, 340, 180, 58) || energy.remainingAds === 0 && inside(x, y, 390, 340, 180, 58)) game.closeEnergyPrompt();
        return;
      }
      if (collection.phase === "fishResult") {
        var showGuide = AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt;
        if (showGuide && inside(x, y, 290, 335, 180, 54)) {
          collection.acknowledgeFish();
          game.navigate("map");
        } else if (showGuide && inside(x, y, 490, 335, 180, 54)) {
          collection.acknowledgeFish();
        } else if (!showGuide && inside(x, y, 370, 335, 220, 54)) {
          collection.acknowledgeFish();
        }
        return;
      }
      if (game.currentArea === "fishing" && collection.phase === "fishEscaped") {
        if (inside(x, y, 260, 335, 220, 54)) collection.reviveFish();
        if (inside(x, y, 500, 335, 180, 54)) collection.leaveFishing();
        return;
      }
      if (collection.phase === "coconutSummary" && game.currentArea === "coconut") {
        if (AIGCUtils.GameState.shopBuilt && inside(x, y, 280, 335, 180, 54)) collection.startCoconutRound(1);
        if (AIGCUtils.GameState.shopBuilt && inside(x, y, 500, 335, 180, 54)) game.navigate("map");
        if (!AIGCUtils.GameState.shopBuilt && AIGCUtils.GameState.tasks.coconut && inside(x, y, 500, 335, 180, 54)) collection.startCoconutRound(1);
        if (!AIGCUtils.GameState.tasks.coconut && inside(x, y, 390, 335, 180, 54)) collection.startCoconutRound(1);
        if (!AIGCUtils.GameState.shopBuilt && AIGCUtils.GameState.tasks.coconut && inside(x, y, 280, 335, 180, 54)) game.beginBuild();
        return;
      }
      if (game.showInventory) {
        game.showInventory = false;
        return;
      }
      if (y >= 468) {
        if (inside(x, y, 20, 476, 130, 48)) game.navigate("map");
        if (inside(x, y, 170, 476, 130, 48)) game.showInventory = true;
        return;
      }
      if (game.currentArea === "map") {
        if (inside(x, y, 675, 405, 250, 48)) {
          game.showOfflineEntry();
          return;
        }
        if (inside(x, y, 80, 105, 330, 180)) game.navigate("fishing");
        if (inside(x, y, 520, 90, 330, 180)) game.navigate("coconut");
        if (inside(x, y, 330, 295, 330, 150)) game.navigate("shop");
        return;
      }
      if (game.currentArea === "fishing") {
        if (inside(x, y, 835, 72, 100, 42)) {
          collection.leaveFishing();
          game.navigate("map");
          return;
        }
        if (collection.phase === "idle") {
          if (inside(x, y, 35, 110, 115, 44)) collection.selectSpot("shallow");
          if (inside(x, y, 160, 110, 115, 44)) collection.selectSpot("reef");
          if (inside(x, y, 285, 110, 115, 44)) collection.selectSpot("deep");
          if (inside(x, y, 35, 165, 115, 40)) collection.selectBait("worm");
          if (inside(x, y, 160, 165, 115, 40)) collection.selectBait("shrimp");
          if (inside(x, y, 285, 165, 115, 40)) collection.selectBait("secret");
          if (inside(x, y, 360, 405, 240, 50)) collection.startCharge();
          return;
        }
        if (collection.phase === "waiting" || collection.phase === "bite") {
          if (inside(x, y, 360, 405, 240, 50)) collection.strike();
          return;
        }
        if (collection.phase === "reeling" && inside(x, y, 330, 395, 300, 65)) collection.setReelHeld(true);
        return;
      }
      if (game.currentArea === "coconut") {
        if (collection.phase === "coconutRound" && collection.catchCoconut(x, y)) return;
        var treeIndex = this.treeAt(x, y);
        if (treeIndex >= 0) collection.shakeTree(treeIndex);
        return;
      }
      if (game.currentArea === "shop") {
        if (inside(x, y, 630, 95, 300, 140)) {
          game.sellCustomer(0);
          return;
        }
        if (inside(x, y, 630, 250, 300, 140)) {
          game.sellCustomer(1);
          return;
        }
        if (baking.current && inside(x, y, 45, 120, 550, 265)) {
          baking.hit();
          return;
        }
        if (!baking.current) {
          if (inside(x, y, 495, 175, 115, 115)) {
            game.startRecipe("coconut_juice");
            return;
          }
          for (var i = 0; i < AIGCUtils.FishSpecies.length; i++) {
            if (inside(x, y, 20 + i * 150, 402, 135, 54)) {
              game.startRecipe("fish_grilled", { speciesId: AIGCUtils.FishSpecies[i].id });
              return;
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
