(function () {
  var AIGCUtils = window.AIGCUtils;
  var EventBus = AIGCUtils.EventBus || window.KwaiEvent;
  var TREE_X = [265, 480, 695];

  AIGCUtils.Collection = {
    phase: "idle",
    spotId: "shallow",
    baitId: "worm",
    power: 0,
    direction: 1,
    timer: 0,
    waitDuration: 0,
    biteWindow: 1000,
    hookX: 480,
    hookY: 275,
    bubbleX: 480,
    bubbleY: 275,
    accurateCast: false,
    perfectHook: false,
    castPower: 0,
    reelCursor: 0.5,
    reelProgress: 0,
    tension: 0.3,
    reelHeld: false,
    struggleTime: 0,
    caughtFish: null,
    reviveBusy: false,
    coconuts: [],
    basketVisual: 0,
    treeShakes: [0, 0, 0],
    treeCooldowns: [0, 0, 0],
    waveIndex: 0,
    spawnTimer: 0,
    roundDuration: 20000,
    caughtThisRound: 0,

    init: function () {
      this.resetFish();
      this.coconuts = [];
      this.basketVisual = 0;
      this.treeShakes = [0, 0, 0];
      this.treeCooldowns = [0, 0, 0];
      this.waveIndex = 0;
      this.spawnTimer = 0;
      this.caughtThisRound = 0;
      this.reviveBusy = false;
    },

    resetFish: function () {
      this.phase = "idle";
      this.power = 0;
      this.direction = 1;
      this.timer = 0;
      this.waitDuration = 0;
      this.reelCursor = 0.5;
      this.reelProgress = 0;
      this.tension = 0.3;
      this.reelHeld = false;
      this.struggleTime = 0;
      this.caughtFish = null;
      this.accurateCast = false;
      this.perfectHook = false;
    },

    selectSpot: function (spotId) {
      if (this.phase !== "idle") return false;
      if (spotId !== "shallow") {
        AIGCUtils.Game.notify(spotId === "reef" ? "铁竿解锁礁石" : "金竿解锁深海");
        return false;
      }
      this.spotId = spotId;
      console.log("[Prototype] Fishing spot selected", spotId);
      return true;
    },

    selectBait: function (baitId) {
      if (this.phase !== "idle") return false;
      if (baitId !== "worm") {
        AIGCUtils.Game.notify(baitId === "shrimp" ? "完成10次钓鱼解锁虾米" : "5级解锁秘制鱼饵");
        return false;
      }
      this.baitId = baitId;
      console.log("[Prototype] Bait selected", baitId);
      return true;
    },

    startCharge: function () {
      if (this.phase !== "idle") return false;
      if (!AIGCUtils.Energy.consume("fish")) return AIGCUtils.Game.showEnergyPrompt("fish");
      this.phase = "charging";
      this.power = 0;
      this.direction = 1;
      this.reelProgress = 0;
      this.reelCursor = 0.5;
      this.tension = 0.3;
      this.reelHeld = false;
      this.caughtFish = null;
      console.log("[Prototype] Cast charging started");
      return true;
    },

    releaseCast: function () {
      if (this.phase !== "charging") return false;
      this.castPower = this.power;
      this.accurateCast = this.power >= 0.4 && this.power <= 0.7;
      this.hookX = this.bubbleX + (this.accurateCast ? 0 : (this.power < 0.4 ? -125 : 125));
      this.hookY = this.bubbleY;
      this.waitDuration = 3000 + Math.random() * 2000 + (this.accurateCast ? 0 : 2000);
      this.phase = "waiting";
      this.timer = 0;
      console.log("[Prototype] Cast released", this.power.toFixed(2), this.accurateCast, this.waitDuration);
      return true;
    },

    strike: function () {
      if (this.phase === "waiting") {
        AIGCUtils.Game.notify("太早了 继续等待");
        console.log("[Prototype] Hook attempted too early");
        return false;
      }
      if (this.phase !== "bite") return false;
      this.perfectHook = this.timer <= 350;
      this.phase = "reeling";
      this.timer = 0;
      this.struggleTime = 0;
      this.reelCursor = 0.5;
      this.reelProgress = 0;
      this.tension = 0.3;
      this.reelHeld = false;
      console.log("[Prototype] Fish hooked", this.perfectHook);
      return true;
    },

    setReelHeld: function (held) {
      if (!held) {
        if (this.reelHeld) console.log("[Prototype] Line released");
        this.reelHeld = false;
        return true;
      }
      if (this.phase !== "reeling") return false;
      this.reelHeld = true;
      return true;
    },

    chooseFish: function () {
      var species = AIGCUtils.Recipes.rollFishSpecies({ spotId: this.spotId, perfect: this.perfectHook });
      return {
        speciesId: species,
        quality: this.perfectHook && this.accurateCast ? "fine" : "normal",
        weight: AIGCUtils.Recipes.createFishWeight(species)
      };
    },

    catchFish: function () {
      this.caughtFish = this.chooseFish();
      this.caughtFish.id = "fish_" + Date.now() + "_" + Math.floor(Math.random() * 1000000);
      this.caughtFish.portions = AIGCUtils.Recipes.weightToPortions(this.caughtFish.weight);
      AIGCUtils.GameState.fishCaught++;
      AIGCUtils.GameState.collect("fish", 1, this.caughtFish);
      this.phase = "fishCaught";
      this.timer = 0;
      this.reelHeld = false;
      EventBus.emit("collection:collected", { type: "fish", amount: this.caughtFish.portions, fish: this.caughtFish });
      console.log("[Prototype] Fish caught", this.caughtFish.speciesId, this.caughtFish.weight, this.caughtFish.portions);
    },

    escapeFish: function (reason) {
      if (this.phase !== "bite" && this.phase !== "reeling") return;
      this.phase = "fishEscaped";
      this.timer = 0;
      this.reelHeld = false;
      EventBus.emit("collection:escaped", { reason: reason });
      console.log("[Prototype] Fish escaped", reason);
    },

    reviveFish: function () {
      if (this.phase !== "fishEscaped" || this.reviveBusy) return false;
      var collection = this;
      this.reviveBusy = true;
      AIGCUtils.AdManager.showRevive(function (success) {
        collection.reviveBusy = false;
        if (success) {
          collection.phase = "reeling";
          collection.timer = 0;
          collection.struggleTime = 0;
          collection.reelCursor = 0.5;
          collection.reelProgress = 0;
          collection.tension = 0.3;
          collection.reelHeld = false;
          AIGCUtils.Game.notify("鱼回来了 按住收线");
          console.log("[Prototype] Fishing revived after rewarded ad");
        } else {
          AIGCUtils.Game.notify("未复活 可重新钓鱼");
        }
      });
      return true;
    },

    acknowledgeFish: function () {
      if (this.phase !== "fishResult") return false;
      this.phase = "idle";
      this.caughtFish = null;
      return true;
    },

    leaveFishing: function () {
      this.resetFish();
      console.log("[Prototype] Fishing left without consuming bait");
      return true;
    },

    startCoconutRound: function (treeIndex) {
      if (this.phase !== "idle" && this.phase !== "coconutSummary") return false;
      if (!AIGCUtils.Energy.consume("coconut")) return AIGCUtils.Game.showEnergyPrompt("coconut");
      this.phase = "coconutRound";
      this.timer = 0;
      this.caughtThisRound = 0;
      this.basketVisual = 0;
      this.waveIndex = 0;
      this.spawnTimer = 1200;
      this.coconuts = [];
      this.treeShakes = [0, 0, 0];
      this.treeCooldowns = [0, 0, 0];
      var index = treeIndex === undefined ? 1 : treeIndex;
      this.treeShakes[index] = 360;
      this.spawnWave(index);
      console.log("[Prototype] Coconut round started");
      return true;
    },

    shakeTree: function (treeIndex) {
      var index = Math.max(0, Math.min(2, treeIndex));
      if (this.phase === "idle" || this.phase === "coconutSummary") return this.startCoconutRound(index);
      if (this.phase !== "coconutRound" || this.treeCooldowns[index] > 0) return false;
      this.treeShakes[index] = 360;
      this.treeCooldowns[index] = 700;
      this.spawnCoconut(index, 82 + Math.max(0, this.waveIndex - 1) * 9);
      return true;
    },

    spawnWave: function (preferredTree) {
      var count = 3 + this.waveIndex;
      var speed = 82 + this.waveIndex * 9;
      for (var i = 0; i < count; i++) {
        this.spawnCoconut(i === 0 && preferredTree !== undefined ? preferredTree : Math.floor(Math.random() * 3), speed);
      }
      this.waveIndex++;
      console.log("[Prototype] Coconut wave", this.waveIndex, count);
    },

    spawnCoconut: function (treeIndex, speed, forceGolden) {
      this.coconuts.push({
        treeIndex: treeIndex,
        x: TREE_X[treeIndex] + (Math.random() - 0.5) * 120,
        y: 165 + Math.random() * 35,
        vy: speed + Math.random() * 10,
        golden: forceGolden === true || forceGolden !== false && Math.random() < 0.2,
        caught: false,
        cracked: false,
        crackTimer: 0,
        catchTimer: 0,
        rotation: Math.random() * Math.PI * 2
      });
    },

    catchCoconut: function (x, y) {
      if (this.phase !== "coconutRound") return false;
      for (var i = 0; i < this.coconuts.length; i++) {
        var coconut = this.coconuts[i];
        if (coconut.caught || coconut.cracked) continue;
        var dx = x - coconut.x;
        var dy = y - coconut.y;
        if (dx * dx + dy * dy < 3600) {
          coconut.caught = true;
          coconut.catchTimer = 0;
          coconut.catchStartX = coconut.x;
          coconut.catchStartY = coconut.y;
          this.caughtThisRound++;
          var type = coconut.golden ? "goldenCoconut" : "coconut";
          AIGCUtils.GameState.collect(type, 1);
          EventBus.emit("collection:collected", { type: type, amount: 1 });
          console.log("[Prototype] Coconut caught", type, this.caughtThisRound);
          return true;
        }
      }
      return false;
    },

    finishCoconutRound: function () {
      this.phase = "coconutSummary";
      this.coconuts = [];
      this.reelHeld = false;
      if (this.caughtThisRound > 0) AIGCUtils.GameState.tasks.coconut = true;
      AIGCUtils.GameState.save();
      EventBus.emit("collection:round-complete", { caught: this.caughtThisRound });
      console.log("[Prototype] Coconut round finished", this.caughtThisRound);
    },

    leaveCoconut: function () {
      if (this.phase === "coconutRound") {
        if (this.caughtThisRound > 0) AIGCUtils.GameState.tasks.coconut = true;
        AIGCUtils.GameState.save();
      }
      this.phase = "idle";
      this.coconuts = [];
      console.log("[Prototype] Coconut area left with caught inventory retained");
    },

    updateFish: function (dt) {
      if (this.phase === "charging") {
        this.power += this.direction * dt / 900;
        if (this.power >= 1) {
          this.power = 1;
          this.direction = -1;
        } else if (this.power <= 0) {
          this.power = 0;
          this.direction = 1;
        }
        return;
      }
      if (this.phase === "waiting") {
        this.timer += dt;
        if (this.timer >= this.waitDuration) {
          this.phase = "bite";
          this.timer = 0;
          AIGCUtils.SoundManager.playSfx("bite");
          console.log("[Prototype] Fish bite signal");
        }
        return;
      }
      if (this.phase === "bite") {
        this.timer += dt;
        if (this.timer > this.biteWindow) this.escapeFish("提竿太晚");
        return;
      }
      if (this.phase === "reeling") {
        this.timer += dt;
        this.struggleTime += dt;
        this.reelCursor = (Math.sin(this.struggleTime / 430) + 1) / 2;
        if (this.reelHeld) {
          if (this.reelCursor >= 0.35 && this.reelCursor <= 0.65) {
            this.reelProgress += dt / 500;
            this.tension = Math.max(0, this.tension - dt / 1800);
          } else if (this.reelCursor > 0.65) {
            this.tension += dt / 650;
            this.reelProgress = Math.max(0, this.reelProgress - dt / 5000);
          } else {
            this.tension += dt / 1800;
            this.reelProgress = Math.max(0, this.reelProgress - dt / 3000);
          }
        } else {
          this.tension = Math.max(0, this.tension - dt / 650);
          if (this.reelCursor < 0.35) this.reelProgress = Math.max(0, this.reelProgress - dt / 5000);
        }
        if (this.tension >= 1) {
          this.escapeFish("线张力过高断线");
          return;
        }
        if (this.reelProgress >= 1) this.catchFish();
        return;
      }
      if (this.phase === "fishCaught") {
        this.timer += dt;
        if (this.timer >= 850) this.phase = "fishResult";
      }
    },

    updateCoconuts: function (dt) {
      for (var i = 0; i < 3; i++) {
        this.treeShakes[i] = Math.max(0, this.treeShakes[i] - dt);
        this.treeCooldowns[i] = Math.max(0, this.treeCooldowns[i] - dt);
      }
      if (this.phase !== "coconutRound") return;
      this.timer += dt;
      if (this.timer >= this.waveIndex * 8000) this.waveIndex++;
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        var level = Math.max(0, this.waveIndex - 1);
        var count = 3 + level;
        for (var drop = 0; drop < count; drop++) this.spawnCoconut(Math.floor(Math.random() * 3), 82 + level * 9);
        this.spawnTimer = Math.max(650, 1400 - level * 80);
      }
      for (var j = this.coconuts.length - 1; j >= 0; j--) {
        var coconut = this.coconuts[j];
        if (coconut.caught) {
          coconut.catchTimer += dt;
          var t = Math.min(1, coconut.catchTimer / 280);
          coconut.x = coconut.catchStartX + (810 - coconut.catchStartX) * t;
          coconut.y = coconut.catchStartY + (395 - coconut.catchStartY) * t - Math.sin(t * Math.PI) * 45;
          if (t >= 1) {
            this.basketVisual = Math.min(10, this.basketVisual + 1);
            this.coconuts.splice(j, 1);
          }
        } else if (coconut.cracked) {
          coconut.crackTimer += dt;
          if (coconut.crackTimer >= 500) this.coconuts.splice(j, 1);
        } else {
          coconut.y += coconut.vy * dt / 1000;
          coconut.rotation += dt / 600;
          if (coconut.y > 430) {
            coconut.y = 430;
            coconut.cracked = true;
            coconut.crackTimer = 0;
            console.log("[Prototype] Coconut cracked on ground", coconut.golden);
          }
        }
      }
      if (this.timer >= this.roundDuration) this.finishCoconutRound();
    },

    update: function (dt) {
      if (AIGCUtils.Game.currentArea === "fishing") this.updateFish(dt);
      if (AIGCUtils.Game.currentArea === "coconut") this.updateCoconuts(dt);
    }
  };
})();
