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

      // ── 弹窗交互：短框热区与 Renderer.getSettlementLayout 同源 ──
      var hitShort = function (boxes, index) {
        var box = boxes[index];
        return box && inside(x, y, box.x, box.y, box.w, box.h);
      };
      if (game.goFishingPrompt) {
        var goLayout = R.getSettlementLayout(hw, hh);
        var goBoxes = (R.goFishingShortBoxes && R.goFishingShortBoxes.length === 2)
          ? R.goFishingShortBoxes
          : R.getSettlementShortBoxes(goLayout, 2);
        if (hitShort(goBoxes, 0)) {
          console.log("[厨房缺鱼] 命中左短框 去钓鱼", goBoxes[0].x, goBoxes[0].y, goBoxes[0].w, goBoxes[0].h);
          game.confirmGoFishing();
        } else if (hitShort(goBoxes, 1)) {
          console.log("[厨房缺鱼] 命中右短框 暂时不去", goBoxes[1].x, goBoxes[1].y, goBoxes[1].w, goBoxes[1].h);
          game.closeGoFishingPrompt();
        } else {
          console.log("[厨房缺鱼] 点在框外 不关闭");
        }
        return;
      }
      if (game.mapLockedPrompt) {
        console.log("[MapLocked] dismiss by tap", x, y);
        game.closeMapLockedPrompt();
        return;
      }
      if (game.offlinePrompt) {
        var offLayout = R.getSettlementLayout(hw, hh);
        var offBoxes = R.getSettlementShortBoxes(offLayout, 2);
        if (hitShort(offBoxes, 0)) {
          console.log("[Settlement] hit offline unlock", offBoxes[0]);
          game.unlockOffline();
        }
        if (hitShort(offBoxes, 1)) game.closeOfflinePrompt();
        return;
      }
      if (game.offlineDialog) {
        var claimLayout = R.getSettlementLayout(hw, hh);
        var claimBoxes = R.getSettlementShortBoxes(claimLayout, 3);
        if (hitShort(claimBoxes, 0)) {
          console.log("[Settlement] hit offline claim", claimBoxes[0]);
          game.claimOffline(false);
        }
        if (hitShort(claimBoxes, 1)) game.claimOffline(true);
        if (hitShort(claimBoxes, 2)) game.closeOfflineDialog();
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
        var energyLayout = R.getSettlementLayout(hw, hh);
        var energyBoxes = R.getSettlementShortBoxes(
          energyLayout,
          energy.remainingAds === 0 ? 1 : 2
        );
        if (energy.remainingAds !== 0 && hitShort(energyBoxes, 0)) game.restoreEnergyByAd();
        if (
          (energy.remainingAds === 0 && hitShort(energyBoxes, 0)) ||
          (energy.remainingAds !== 0 && hitShort(energyBoxes, 1))
        ) {
          game.closeEnergyPrompt();
        }
        return;
      }
      if (collection.phase === "fishResult") {
        var showGuide =
          AIGCUtils.GameState.fishCaught >= 3 &&
          !AIGCUtils.GameState.tasks.coconut &&
          !AIGCUtils.GameState.shopBuilt;
        var fishLayout = R.getSettlementLayout(hw, hh, "fish");
        var fishBoxes = R.getSettlementShortBoxes(fishLayout, showGuide ? 2 : 1);
        if (showGuide && hitShort(fishBoxes, 0)) {
          collection.acknowledgeFish();
          game.navigate("map");
        } else if (showGuide && hitShort(fishBoxes, 1)) {
          collection.acknowledgeFish();
        } else if (!showGuide && hitShort(fishBoxes, 0)) {
          collection.acknowledgeFish();
        }
        return;
      }
      if (game.currentArea === "fishing" && collection.phase === "fishEscaped") {
        var escapeLayout = R.getSettlementLayout(hw, hh, "fish");
        var escapeBoxes = R.getSettlementShortBoxes(escapeLayout, 2);
        if (hitShort(escapeBoxes, 0)) collection.reviveFish();
        if (hitShort(escapeBoxes, 1)) collection.leaveFishing();
        return;
      }
      if (collection.phase === "coconutSummary" && game.currentArea === "coconut") {
        var settleLayout = R.getSettlementLayout(hw, hh);
        var cocoBoxes;
        if (AIGCUtils.GameState.shopBuilt) {
          cocoBoxes = R.getSettlementShortBoxes(settleLayout, 2);
          if (hitShort(cocoBoxes, 0)) {
            console.log("[CoconutSummary] hit continue harvest", cocoBoxes[0]);
            collection.startCoconutRound(1);
          }
          if (hitShort(cocoBoxes, 1)) {
            console.log("[CoconutSummary] hit go map", cocoBoxes[1]);
            game.navigate("map");
          }
        } else if (AIGCUtils.GameState.tasks.coconut) {
          cocoBoxes = R.getSettlementShortBoxes(settleLayout, 2);
          if (hitShort(cocoBoxes, 0)) {
            console.log("[CoconutSummary] hit begin build", cocoBoxes[0]);
            game.beginBuild();
          }
          if (hitShort(cocoBoxes, 1)) {
            console.log("[CoconutSummary] hit another round", cocoBoxes[1]);
            collection.startCoconutRound(1);
          }
        } else {
          cocoBoxes = R.getSettlementShortBoxes(settleLayout, 1);
          if (hitShort(cocoBoxes, 0)) {
            console.log("[CoconutSummary] hit retry", cocoBoxes[0]);
            collection.startCoconutRound(1);
          }
        }
        return;
      }
      if (game.showInventory) {
        game.showInventory = false;
        return;
      }
      // ── 导航栏 ──
      if (y >= navY) {
        if (game.currentArea === "fishing" && collection.fishingDrawerOpen) {
          collection.fishingDrawerOpen = false;
          console.log("[Prototype] Fishing gear drawer closed outside");
        }
        if (inside(x, y, 20, navY + 8, 130, 48)) game.navigate("map");
        if (inside(x, y, 170, navY + 8, 130, 48)) game.showInventory = true;
        return;
      }
      // ── 地图 ──
      if (game.currentArea === "map") {
        var mapHit = portrait
          ? AIGCUtils.MapZones.hitPortrait(x, y, W, H, AIGCUtils.GameState)
          : AIGCUtils.MapZones.hitLandscape(x, y, AIGCUtils.GameState);
        if (mapHit === "offline") { game.showOfflineEntry(); return; }
        if (mapHit === "fishing") game.navigate("fishing");
        if (mapHit === "coconut") game.navigate("coconut");
        if (mapHit === "shop") game.navigate("shop");
        if (mapHit === "locked") {
          console.log("[MapLocked] hit locked zone", x, y);
          game.showMapLockedPrompt();
        }
        return;
      }
      // ── 钓鱼区 ──
      if (game.currentArea === "fishing") {
        if (portrait) {
          var ct2 = 64, cb2 = H - 72;
          var actY = cb2 - 58;
          // 离开按钮
          if (inside(x, y, W - 108, ct2 + 8, 98, 38)) { collection.leaveFishing(); game.navigate("map"); return; }
          if (collection.phase === "idle") {
            var portGear = R.fishingGearPortLayout();
            var portEntry = portGear.entry;
            if (inside(x, y, portEntry.x, portEntry.y, portEntry.w, portEntry.h)) {
              collection.toggleFishingDrawer();
              return;
            }
            if (collection.fishingDrawerOpen) {
              var hitPort = false;
              var pi;
              var portLabel = portGear.label;
              if (inside(x, y, portLabel.x, portLabel.y, portLabel.w, portLabel.h)) hitPort = true;
              for (pi = 0; pi < portGear.spots.length; pi++) {
                var portSpot = portGear.spots[pi];
                if (inside(x, y, portSpot.x, portSpot.y, portSpot.w, portSpot.h)) {
                  collection.selectSpot(portSpot.id);
                  hitPort = true;
                }
              }
              for (pi = 0; pi < portGear.baits.length; pi++) {
                var portBait = portGear.baits[pi];
                if (inside(x, y, portBait.x, portBait.y, portBait.w, portBait.h)) {
                  collection.selectBait(portBait.id);
                  hitPort = true;
                }
              }
              if (!hitPort) {
                collection.fishingDrawerOpen = false;
                console.log("[Prototype] Fishing gear drawer closed outside");
              } else {
                return;
              }
            }
            var castPort = R.fishingCastPortButton();
            if (inside(x, y, castPort.x, castPort.y, castPort.w, castPort.h)) collection.startCharge();
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
            var gear = R.fishingGearLandLayout();
            var entry = gear.entry;
            if (inside(x, y, entry.x, entry.y, entry.w, entry.h)) {
              collection.toggleFishingDrawer();
              return;
            }
            if (collection.fishingDrawerOpen) {
              var hitGear = false;
              var gi;
              var landLabel = gear.label;
              if (inside(x, y, landLabel.x, landLabel.y, landLabel.w, landLabel.h)) hitGear = true;
              for (gi = 0; gi < gear.spots.length; gi++) {
                var spotBox = gear.spots[gi];
                if (inside(x, y, spotBox.x, spotBox.y, spotBox.w, spotBox.h)) {
                  collection.selectSpot(spotBox.id);
                  hitGear = true;
                }
              }
              for (gi = 0; gi < gear.baits.length; gi++) {
                var baitBox = gear.baits[gi];
                if (inside(x, y, baitBox.x, baitBox.y, baitBox.w, baitBox.h)) {
                  collection.selectBait(baitBox.id);
                  hitGear = true;
                }
              }
              if (!hitGear) {
                collection.fishingDrawerOpen = false;
                console.log("[Prototype] Fishing gear drawer closed outside");
              } else {
                return;
              }
            }
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
        // 先接椰子：成功则立刻停晃并 return，同一次点击不再 shakeTree
        if (collection.phase === "coconutRound" && collection.catchCoconut(x, y)) {
          var stopTree = this.treeAt(x, y);
          if (stopTree >= 0) collection.treeShakes[stopTree] = 0;
          return;
        }
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
          var portBoard = AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.port;
          // 中层圆木板：只做椰汁，绝不交付顾客（须先于顾客热区判定）
          if (portBoard && portBoard.work) {
            var workPt = R.shopPoint(portBoard.work);
            var workHit = Math.round(W * 0.22);
            if (inside(x, y, workPt.x - workHit / 2, workPt.y - workHit / 2, workHit, workHit)) {
              console.log("[ShopHit] port work juice", Math.round(x), Math.round(y), "recipe", baking.current ? baking.current.recipeId : "none");
              if (baking.current && baking.current.recipeId === "coconut_juice") { baking.hit(); return; }
              if (!baking.current) { game.startRecipe("coconut_juice"); return; }
              return;
            }
          }
          // 上层两桌：顾客脚下两块矩形
          if (portBoard && portBoard.customers) {
            var custHitW = Math.round(W * 0.28);
            var custHitH = Math.round(H * 0.12);
            for (var ci = 0; ci < portBoard.customers.length; ci++) {
              var cFoot = R.shopPoint(portBoard.customers[ci]);
              var cLeft = cFoot.x - custHitW / 2;
              var cTop = cFoot.y - custHitH * 0.75;
              if (inside(x, y, cLeft, cTop, custHitW, custHitH)) {
                console.log("[ShopHit] port customer", ci, Math.round(x), Math.round(y), "foot", Math.round(cFoot.x), Math.round(cFoot.y));
                game.sellCustomer(ci); return;
              }
            }
          }
          // 烤制区（左2/3厨房）
          if (baking.current && inside(x, y, 0, kitchenY3, kitchenW3, kitchenH3)) {
            baking.hit(); return;
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
