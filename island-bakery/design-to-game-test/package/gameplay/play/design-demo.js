(function () {
  window.AIGCUtils = window.AIGCUtils || {};
  var AIGCUtils = window.AIGCUtils;

  var state = {
    scene: "map",
    coin: 0,
    fish: 0,
    coconut: 0,
    level: 1,
    fishing: { phase: "idle", timer: 0, lastTime: 0 },
    coconut: { phase: "idle", timer: 0, lastTime: 0, anim: 0 },
    shop: { phase: "idle", timer: 0, lastTime: 0 }
  };

  var sceneNames = {
    map: "地图",
    fishing: "钓鱼",
    coconut: "椰林",
    shop: "烤鱼店"
  };

  function pointerToLogical(event) {
    var canvas = AIGCUtils.DesignRenderer.canvas;
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    var clientX = event.clientX !== undefined ? event.clientX : (event.touches && event.touches[0] ? event.touches[0].clientX : 0);
    var clientY = event.clientY !== undefined ? event.clientY : (event.touches && event.touches[0] ? event.touches[0].clientY : 0);
    return {
      x: ((clientX - rect.left) * (canvas.width / dpr)) / rect.width,
      y: ((clientY - rect.top) * (canvas.height / dpr)) / rect.height
    };
  }

  function inRect(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  function mapZone(x, y) {
    var w = AIGCUtils.DesignRenderer.width;
    var h = AIGCUtils.DesignRenderer.height;
    var zones = [
      { scene: "fishing", rect: { x: w * 0.05, y: h * 0.16, w: w * 0.22, h: h * 0.18 } },
      { scene: "coconut", rect: { x: w * 0.39, y: h * 0.16, w: w * 0.22, h: h * 0.18 } },
      { scene: "shop", rect: { x: w * 0.15, y: h * 0.40, w: w * 0.22, h: h * 0.18 } }
    ];
    for (var i = 0; i < zones.length; i++) {
      if (inRect(x, y, zones[i].rect)) return zones[i].scene;
    }
    return null;
  }

  function handleTap(event) {
    var point = pointerToLogical(event);
    if (state.scene === "map") {
      var nextScene = mapZone(point.x, point.y);
      if (nextScene) state.scene = nextScene;
      console.log("[DesignDemo] map tap", point.x, point.y, nextScene);
      return;
    }
    if (state.scene === "fishing") {
      if (state.fishing.phase === "idle") {
        state.fishing.phase = "wait";
        state.fishing.timer = 0;
      } else if (state.fishing.phase === "pull") {
        state.fish += 1;
        state.fishing.phase = "idle";
      }
      console.log("[DesignDemo] fishing tap", state.fishing.phase);
      return;
    }
    if (state.scene === "coconut") {
      state.coconut.coconut += 1;
      state.coconut.anim = 1;
      console.log("[DesignDemo] coconut tap", state.coconut.coconut);
      return;
    }
    if (state.scene === "shop") {
      if (state.shop.phase === "idle" && state.fish > 0) {
        state.shop.phase = "cooking";
        state.shop.timer = 0;
      } else if (state.shop.phase === "ready") {
        state.fish -= 1;
        state.coin += 1;
        state.shop.phase = "idle";
      }
      console.log("[DesignDemo] shop tap", state.shop.phase, state.fish, state.coin);
      return;
    }
  }

  function drawHud() {
    var renderer = AIGCUtils.DesignRenderer;
    var width = renderer.width;
    var height = renderer.height;
    renderer.rect(0, 0, width, height * 0.09, [0.15, 0.10, 0.06, 0.55]);
    renderer.text(sceneNames[state.scene], 24, height * 0.035, 34, [0.99, 0.93, 0.74, 1], "left");
    renderer.text("金币 " + state.coin, width * 0.28, height * 0.035, 32, [0.99, 0.93, 0.74, 1], "left");
    renderer.text("鱼 " + state.fish, width * 0.48, height * 0.035, 32, [0.99, 0.93, 0.74, 1], "left");
    renderer.text("椰 " + state.coconut.coconut, width * 0.62, height * 0.035, 32, [0.99, 0.93, 0.74, 1], "left");
    renderer.text("等级 " + state.level, width * 0.80, height * 0.035, 32, [0.99, 0.93, 0.74, 1], "left");
  }

  function drawMapOverlay() {
    var renderer = AIGCUtils.DesignRenderer;
    var width = renderer.width;
    var height = renderer.height;
    renderer.text("点击开始", width * 0.5, height * 0.84, 44, [0.15, 0.08, 0.05, 0.9], "center");
  }

  function drawFishing() {
    var renderer = AIGCUtils.DesignRenderer;
    var width = renderer.width;
    var height = renderer.height;
    if (state.fishing.phase === "wait") {
      var progress = Math.min(1, state.fishing.timer / 1200);
      renderer.rect(width * 0.3, height * 0.74, width * 0.4, height * 0.035, [0.15, 0.10, 0.06, 0.55]);
      renderer.rect(width * 0.3, height * 0.74, width * 0.4 * progress, height * 0.035, [0.94, 0.63, 0.20, 1]);
    }
    if (state.fishing.phase === "pull") {
      renderer.rect(width * 0.3, height * 0.74, width * 0.4, height * 0.035, [0.15, 0.10, 0.06, 0.55]);
      renderer.rect(width * 0.3, height * 0.74, width * 0.4, height * 0.035, [0.94, 0.63, 0.20, 1]);
      renderer.text("点击", width * 0.5, height * 0.86, 40, [0.99, 0.93, 0.74, 1], "center");
    }
  }

  function drawCoconut() {
    var renderer = AIGCUtils.DesignRenderer;
    var width = renderer.width;
    var height = renderer.height;
    var pulse = 1 + Math.sin(AIGCUtils._now() / 240) * 0.08 * state.coconut.anim;
    renderer.rect(width * 0.5 - width * 0.035 * pulse, height * 0.5 - height * 0.035 * pulse, width * 0.07 * pulse, height * 0.07 * pulse, [0.20, 0.13, 0.07, 0.5]);
  }

  function drawShop() {
    var renderer = AIGCUtils.DesignRenderer;
    var width = renderer.width;
    var height = renderer.height;
    if (state.shop.phase === "cooking") {
      var progress = Math.min(1, state.shop.timer / 1800);
      renderer.rect(width * 0.3, height * 0.74, width * 0.4, height * 0.035, [0.15, 0.10, 0.06, 0.55]);
      renderer.rect(width * 0.3, height * 0.74, width * 0.4 * progress, height * 0.035, [0.94, 0.63, 0.20, 1]);
    }
    if (state.shop.phase === "ready") {
      renderer.text("点击交付", width * 0.5, height * 0.86, 40, [0.99, 0.93, 0.74, 1], "center");
    }
  }

  function drawBackButton() {
    var renderer = AIGCUtils.DesignRenderer;
    renderer.rect(renderer.width * 0.84, renderer.height * 0.84, renderer.width * 0.12, renderer.height * 0.08, [0.15, 0.10, 0.06, 0.65]);
    renderer.text("返回", renderer.width * 0.90, renderer.height * 0.86, 34, [0.99, 0.93, 0.74, 1], "center");
  }

  AIGCUtils.GameDesign = {
    scene: "map",
    state: state,
    init: function () {
      if (!AIGCUtils.DesignRenderer.init()) return;
      this.scene = state.scene;
      var canvas = AIGCUtils.DesignRenderer.canvas;
      var game = this;
      canvas.addEventListener("mousedown", function (event) { handleTap(event); });
      canvas.addEventListener("touchstart", function (event) { handleTap(event); event.preventDefault(); }, { passive: false });
      console.log("[DesignDemo] ready");
    },
    update: function (dt) {
      if (state.scene === "fishing" && state.fishing.phase === "wait") {
        state.fishing.timer += dt;
        if (state.fishing.timer >= 1200) {
          state.fishing.phase = "pull";
          state.fishing.timer = 0;
        }
      }
      if (state.scene === "shop" && state.shop.phase === "cooking") {
        state.shop.timer += dt;
        if (state.shop.timer >= 1800) {
          state.shop.phase = "ready";
          state.shop.timer = 0;
        }
      }
      if (state.coconut.anim > 0) {
        state.coconut.anim = Math.max(0, state.coconut.anim - dt / 300);
      }
    },
    render: function () {
      var renderer = AIGCUtils.DesignRenderer;
      if (!renderer.ready) return;
      renderer.resize();
      var dt = AIGCUtils._now() - (this.lastTime || AIGCUtils._now());
      this.lastTime = AIGCUtils._now();
      this.update(dt);
      this.scene = state.scene;
      renderer.draw(state.scene);
      drawHud();
      if (state.scene === "map") drawMapOverlay();
      if (state.scene === "fishing") drawFishing();
      if (state.scene === "coconut") drawCoconut();
      if (state.scene === "shop") drawShop();
      if (state.scene !== "map") drawBackButton();
      renderer.flushRects();
      renderer.flushText();
    }
  };

  AIGCUtils.GameDesign.init();
})();
