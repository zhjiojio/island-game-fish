(function () {
  var AIGCUtils = window.AIGCUtils;
  var C = {
    ink: [0.24, 0.19, 0.15, 1],
    cream: [0.98, 0.92, 0.79, 1],
    paper: [0.96, 0.86, 0.67, 1],
    sand: [0.91, 0.76, 0.52, 1],
    sea: [0.25, 0.61, 0.69, 1],
    seaDark: [0.16, 0.43, 0.53, 1],
    sky: [0.69, 0.83, 0.79, 1],
    leaf: [0.31, 0.52, 0.30, 1],
    leafLight: [0.47, 0.65, 0.36, 1],
    wood: [0.48, 0.30, 0.17, 1],
    woodLight: [0.67, 0.44, 0.24, 1],
    honey: [0.94, 0.63, 0.20, 1],
    orange: [0.88, 0.39, 0.20, 1],
    green: [0.42, 0.67, 0.34, 1],
    red: [0.76, 0.29, 0.22, 1],
    white: [0.99, 0.96, 0.86, 1],
    brown: [0.35, 0.22, 0.13, 1],
    fish: [0.55, 0.75, 0.76, 1],
    fishCooked: [0.83, 0.48, 0.20, 1],
    shadow: [0.18, 0.15, 0.12, 0.25],
    disabled: [0.43, 0.43, 0.39, 0.7],
    overlay: [0.12, 0.12, 0.12, 0.68]
  };

  AIGCUtils.Renderer = {
    gl: null,
    program: null,
    buffer: null,
    fontTexture: null,
    fontLoading: false,
    fontReady: false,
    fontNextRetryAt: 0,
    missingGlyphs: {},
    vertices: [],
    width: 960,
    height: 540,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    colors: C,

    init: function () {
      if (this.gl) return true;
      var gl = window.canvas.getContext("webgl");
      if (!gl) return false;
      var vertexSource = "attribute vec2 a_position;attribute vec4 a_color;attribute vec2 a_uv;attribute float a_textured;varying vec4 v_color;varying vec2 v_uv;varying float v_textured;void main(){gl_Position=vec4(a_position,0.0,1.0);v_color=a_color;v_uv=a_uv;v_textured=a_textured;}";
      var fragmentSource = "precision mediump float;uniform sampler2D u_font;varying vec4 v_color;varying vec2 v_uv;varying float v_textured;void main(){vec4 color=v_color;if(v_textured>1.5){vec4 tex=texture2D(u_font,v_uv);color=vec4(tex.rgb*v_color.rgb,tex.a*v_color.a);}else if(v_textured>0.5){color.a*=texture2D(u_font,v_uv).a;}gl_FragColor=color;}";
      function compile(type, source) {
        var shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("[Prototype] Shader error", gl.getShaderInfoLog(shader));
          return null;
        }
        return shader;
      }
      var vertex = compile(gl.VERTEX_SHADER, vertexSource);
      var fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      if (!vertex || !fragment) return false;
      var program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
      this.gl = gl;
      this.program = program;
      this.buffer = gl.createBuffer();
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      var position = gl.getAttribLocation(program, "a_position");
      var color = gl.getAttribLocation(program, "a_color");
      var uv = gl.getAttribLocation(program, "a_uv");
      var textured = gl.getAttribLocation(program, "a_textured");
      gl.enableVertexAttribArray(position);
      gl.enableVertexAttribArray(color);
      gl.enableVertexAttribArray(uv);
      gl.enableVertexAttribArray(textured);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 36, 0);
      gl.vertexAttribPointer(color, 4, gl.FLOAT, false, 36, 8);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 36, 24);
      gl.vertexAttribPointer(textured, 1, gl.FLOAT, false, 36, 32);
      this.fontUniform = gl.getUniformLocation(program, "u_font");
      gl.uniform1i(this.fontUniform, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.loadFont();
      this.loadScenes();
      return true;
    },

    loadFont: function () {
      if (this.fontLoading || this.fontReady) return;
      if (Date.now() < this.fontNextRetryAt) return;
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Image) {
        this.fontNextRetryAt = Date.now() + 1000;
        console.error("[Prototype] Font image loader unavailable");
        return;
      }
      this.fontLoading = true;
      var renderer = this;
      KwaiMedia.Image.load(AIGCUtils.FontAtlas.image).then(function (image) {
        var gl = renderer.gl;
        var texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        renderer.fontTexture = texture;
        renderer.fontReady = true;
        renderer.fontLoading = false;
        console.log("[Prototype] Simplified Chinese font atlas loaded");
      }).catch(function (error) {
        renderer.fontLoading = false;
        renderer.fontNextRetryAt = Date.now() + 1000;
        console.error("[Prototype] Font atlas load failed", error);
      });
    },

    // 场景原画。key 对应 package/res/Image 下的横竖屏图，加载失败时继续用色块，不挡玩法。
    sceneCatalog: [
      { key: "map-land", path: "res/Image/scene-map-land.jpg" },
      { key: "map-port", path: "res/Image/scene-map-port.jpg" },
      { key: "fish-land", path: "res/Image/scene-fish-land.jpg" },
      { key: "fish-port", path: "res/Image/scene-fish-port.jpg" },
      { key: "coconut-land", path: "res/Image/scene-coconut-land.jpg" },
      { key: "coconut-port", path: "res/Image/scene-coconut-port.jpg" },
      { key: "shop-land", path: "res/Image/scene-shop-land.jpg" },
      { key: "shop-port", path: "res/Image/scene-shop-port.jpg" },
      { key: "build-land", path: "res/Image/scene-build-land.jpg" },
      { key: "night", path: "res/Image/scene-night.jpg" }
    ],
    uiSkinCatalog: [
      { key: "ui-skin-fish-land", path: "res/Image/ui/ui-skin-fish-land.png" },
      { key: "ui-skin-fish-port", path: "res/Image/ui/ui-skin-fish-port.png" },
      { key: "ui-skin-shop-land", path: "res/Image/ui/ui-skin-shop-land.png" },
      { key: "ui-skin-shop-port", path: "res/Image/ui/ui-skin-shop-port.png" },
      { key: "ui-skin-coconut-land", path: "res/Image/ui/ui-skin-coconut-land.png" },
      { key: "ui-skin-coconut-port", path: "res/Image/ui/ui-skin-coconut-port.png" },
      { key: "ui-skin-map-land", path: "res/Image/ui/ui-skin-map-land.png" },
      { key: "ui-skin-map-port", path: "res/Image/ui/ui-skin-map-port.png" }
    ],
    uiAssetCatalog: [
      { key: "btn-wood", path: "res/Image/ui/btn-wood.png" },
      { key: "dialog-fish-result", path: "res/Image/ui/dialog-fish-result.png" },
      { key: "dialog-coconut-summary", path: "res/Image/ui/dialog-coconut-summary.png" },
      { key: "dialog-offline", path: "res/Image/ui/dialog-offline.png" },
      { key: "dialog-go-fishing", path: "res/Image/ui/dialog-go-fishing.png" },
      { key: "dialog-inventory", path: "res/Image/ui/dialog-inventory.png" },
      { key: "order-bubble", path: "res/Image/ui/order-bubble.png?v=3" },
      { key: "order-bubble-skin-land", path: "res/Image/ui/order-bubble-skin-land.png?v=1" },
      { key: "e1-fish-icons", path: "res/Image/e1_fish_icons.png?v=3" },
      { key: "e3-coconuts", path: "res/Image/e3_coconuts.png?v=3" },
      { key: "e4-grilled-fish", path: "res/Image/e4_grilled_fish.png?v=2" },
      { key: "grill_lv1", path: "res/Image/sprites/grill_lv1.png" },
      { key: "grill_lv2", path: "res/Image/sprites/grill_lv2.png" },
      { key: "grill_lv3", path: "res/Image/sprites/grill_lv3.png" },
      { key: "grill_lv4", path: "res/Image/sprites/grill_lv4.png" },
      { key: "hero_rabbit_grill", path: "res/Image/sprites/hero_rabbit_grill.png" },
      { key: "hero_rabbit_fish", path: "res/Image/sprites/hero_rabbit_fish.png" },
      { key: "fish_raw_small", path: "res/Image/sprites/fish_raw_small.png" },
      { key: "fish_raw_salmon", path: "res/Image/sprites/fish_raw_salmon.png" },
      { key: "fish_raw_tuna", path: "res/Image/sprites/fish_raw_tuna.png" },
      { key: "fish_raw_golden", path: "res/Image/sprites/fish_raw_golden.png" },
      { key: "customer_bear_blue", path: "res/Image/sprites/customer_bear_blue.png" },
      { key: "customer_bear_cream", path: "res/Image/sprites/customer_bear_cream.png" },
      { key: "customer_pig", path: "res/Image/sprites/customer_pig.png" },
      { key: "customer_penguin", path: "res/Image/sprites/customer_penguin.png" },
      { key: "customer_fox", path: "res/Image/sprites/customer_fox.png" },
      { key: "grilled_small", path: "res/Image/sprites/grilled_small.png" },
      { key: "grilled_salmon", path: "res/Image/sprites/grilled_salmon.png" },
      { key: "grilled_tuna", path: "res/Image/sprites/grilled_tuna.png" },
      { key: "grilled_golden", path: "res/Image/sprites/grilled_golden.png" },
      { key: "coconut_green", path: "res/Image/sprites/coconut_green.png" },
      { key: "coconut_green_juiced", path: "res/Image/sprites/coconut_green_juiced.png" },
      { key: "coconut_tree", path: "res/Image/sprites/coconut_tree.png?v=2" }
    ],

    fishingGearPanelLand: { x: 498, y: 296, w: 448, h: 96, rowSpotY: 302, rowBaitY: 336, col0: 508, col1: 618, col2: 728, btnW: 96, btnH: 30 },
    scenes: {},
    sceneAspect: {},
    sceneLoading: {},
    artOn: false,
    missingShopSprites: {},
    uiSkinChrome: false,
    artShiftX: 0,

    loadScenes: function () {
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Image) {
        console.error("[Prototype] Scene art loader unavailable");
        return;
      }
      var renderer = this;
      var catalog = this.sceneCatalog.concat(this.uiSkinCatalog || []).concat(this.uiAssetCatalog || []);
      catalog.forEach(function (item) {
        if (renderer.scenes[item.key] || renderer.sceneLoading[item.key]) return;
        renderer.sceneLoading[item.key] = true;
        KwaiMedia.Image.load(item.path).then(function (image) {
          var gl = renderer.gl;
          var texture = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          renderer.scenes[item.key] = texture;
          renderer.sceneAspect[item.key] = image.width / image.height;
          renderer.sceneLoading[item.key] = false;
          console.log("[Prototype] Scene art ready", item.key, image.width, image.height);
        }).catch(function (error) {
          renderer.sceneLoading[item.key] = false;
          console.error("[Prototype] Scene art failed", item.key, error);
        });
      });
    },

    ensureDummyTexture: function () {
      if (this.dummyTexture) return this.dummyTexture;
      var gl = this.gl;
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      this.dummyTexture = texture;
      return texture;
    },

    useTexture: function (texture) {
      var next = texture || this.fontTexture || this.ensureDummyTexture();
      if (this.boundTexture === next) return;
      this.flush();
      this.boundTexture = next;
    },

    flush: function () {
      if (!this.vertices.length || !this.gl) return;
      var gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.boundTexture || this.fontTexture || this.ensureDummyTexture());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / 9);
      this.vertices = [];
    },

    sceneKey: function (base) {
      return this.portrait ? base + "-port" : base + "-land";
    },

    backdropKey: function (area) {
      if (area === "map") {
        var night = AIGCUtils.DayCycle && AIGCUtils.DayCycle.state === "night" && this.scenes.night;
        if (night) return "night";
        var mapUi = this.portrait ? "ui-skin-map-port" : "ui-skin-map-land";
        if (this.scenes[mapUi]) return mapUi;
        return this.sceneKey("map");
      }
      if (area === "fishing") {
        var fishUi = this.portrait ? "ui-skin-fish-port" : "ui-skin-fish-land";
        if (this.scenes[fishUi]) return fishUi;
        return this.sceneKey("fish");
      }
      if (area === "coconut") {
        var cocoUi = this.portrait ? "ui-skin-coconut-port" : "ui-skin-coconut-land";
        if (this.scenes[cocoUi]) return cocoUi;
        return this.sceneKey("coconut");
      }
      if (area === "shop") {
        var shopUi = this.portrait ? "ui-skin-shop-port" : "ui-skin-shop-land";
        if (this.scenes[shopUi]) return shopUi;
        return this.sceneKey("shop");
      }
      if (area === "build") return this.portrait ? "shop-port" : "build-land";
      return null;
    },

    paintScene: function (key, x, y, width, height, dx, dy) {
      var texture = this.scenes[key];
      if (!texture) return false;
      this.useTexture(texture);
      var aspect = this.sceneAspect[key] || (width / height);
      var rectAspect = width / height;
      var u0 = 0, v0 = 0, u1 = 1, v1 = 1;
      if (aspect > rectAspect) {
        var showU = rectAspect / aspect;
        var padU = (1 - showU) / 2;
        u0 = padU;
        u1 = 1 - padU;
      } else {
        var showV = aspect / rectAspect;
        var padV = (1 - showV) / 2;
        v0 = padV;
        v1 = 1 - padV;
      }
      var shiftX = dx || 0;
      var shiftY = dy || 0;
      var white = [1, 1, 1, 1];
      this.vertex(x + shiftX, y + shiftY, white, u0, v0, 2);
      this.vertex(x + width + shiftX, y + shiftY, white, u1, v0, 2);
      this.vertex(x + shiftX, y + height + shiftY, white, u0, v1, 2);
      this.vertex(x + width + shiftX, y + shiftY, white, u1, v0, 2);
      this.vertex(x + width + shiftX, y + height + shiftY, white, u1, v1, 2);
      this.vertex(x + shiftX, y + height + shiftY, white, u0, v1, 2);
      return true;
    },

    paintUiStretch: function (key, x, y, width, height) {
      return this.paintUiRegion(key, x, y, width, height, 0, 0, 1, 1);
    },

    paintUiRegion: function (key, x, y, width, height, u0, v0, u1, v1) {
      var texture = this.scenes[key];
      if (!texture) return false;
      this.useTexture(texture);
      var white = [1, 1, 1, 1];
      this.vertex(x, y, white, u0, v0, 2);
      this.vertex(x + width, y, white, u1, v0, 2);
      this.vertex(x, y + height, white, u0, v1, 2);
      this.vertex(x + width, y, white, u1, v0, 2);
      this.vertex(x + width, y + height, white, u1, v1, 2);
      this.vertex(x, y + height, white, u0, v1, 2);
      return true;
    },

    drawOrderRow: function (cx, centerY, lineSize, label, iconSize, drawIcon) {
      var tw = this.textWidth(label, lineSize);
      var gap = 5;
      var total = iconSize + gap + tw;
      var left = Math.round(cx - total / 2);
      var iconCx = left + Math.round(iconSize / 2);
      var textX = left + iconSize + gap;
      drawIcon(iconCx, centerY);
      this.text(label, textX, this.textYInBox(label, lineSize, centerY - lineSize, lineSize + 6), lineSize, C.ink, "left");
    },

    paintCoconutIcon: function (variant, cx, cy, size) {
      var key = variant || "juice";
      if (!this.scenes["e3-coconuts"] && !this.sceneLoading["e3-coconuts"]) this.loadScenes();
      var grid = {
        green: [0, 0, 0.5, 0.5],
        golden: [0.5, 0, 1, 0.5],
        green_juiced: [0, 0.5, 0.5, 1],
        golden_juiced: [0.5, 0.5, 1, 1],
        juice: [0, 0.5, 0.5, 1],
        order: [0, 0.5, 0.5, 1]
      };
      var uv = grid[key] || grid.juice;
      if (
        this.paintUiRegion("e3-coconuts", cx - size / 2, cy - size / 2, size, size, uv[0], uv[1], uv[2], uv[3])
      ) {
        this.flush();
        return true;
      }
      if (this.uiSkinChrome) return false;
      this.juice(cx, cy, size * 0.85, true);
      return false;
    },

    paintFishIcon: function (speciesId, cx, cy, size) {
      var id = AIGCUtils.Recipes.normalizeSpeciesId(speciesId);
      if (!this.scenes["e1-fish-icons"] && !this.sceneLoading["e1-fish-icons"]) this.loadScenes();
      var grid = {
        small: [0, 0, 0.5, 0.5],
        salmon: [0.5, 0, 1, 0.5],
        tuna: [0, 0.5, 0.5, 1],
        golden: [0.5, 0.5, 1, 1]
      };
      var uv = grid[id] || grid.small;
      if (this.paintUiRegion("e1-fish-icons", cx - size / 2, cy - size / 2, size, size, uv[0], uv[1], uv[2], uv[3])) {
        this.flush();
        return true;
      }
      if (this.uiSkinChrome) return false;
      this.fish(cx, cy, size * 0.45, true, id);
      return false;
    },

    paintGrilledIcon: function (speciesId, cx, cy, size) {
      var id = AIGCUtils.Recipes.normalizeSpeciesId(speciesId);
      if (!this.scenes["e4-grilled-fish"] && !this.sceneLoading["e4-grilled-fish"]) this.loadScenes();
      var grid = {
        small: [0, 0, 0.5, 0.5],
        salmon: [0.5, 0, 1, 0.5],
        tuna: [0, 0.5, 0.5, 1],
        golden: [0.5, 0.5, 1, 1]
      };
      var uv = grid[id] || grid.small;
      if (
        this.paintUiRegion("e4-grilled-fish", cx - size / 2, cy - size / 2, size, size, uv[0], uv[1], uv[2], uv[3])
      ) {
        this.flush();
        return true;
      }
      return this.paintFishIcon(id, cx, cy, size);
    },

    drawFishingGearSlot: function (x, y, w, h, label, active, unlocked) {
      if (!unlocked) {
        if (!this.uiSkinChrome) {
          this.rect(x, y, w, h, [0.52, 0.48, 0.42, 0.88]);
          this.text("锁", x + w / 2, y + h / 2 - 10, 15, C.cream, "center");
          this.text(label, x + w / 2, y + h / 2 + 8, 12, [0.95, 0.92, 0.86, 0.95], "center");
        }
        return;
      }
      this.button(x, y, w, h, label, active);
    },

    drawFishingGearDrawerPanel: function (collection, portrait) {
      var fs = 13;
      var inkMuted = [0.48, 0.44, 0.4, 0.88];
      if (portrait) {
        var W = this.width;
        var ct = 64;
        var btnW = Math.round((W - 24) / 3);
        var px = 8;
        var py = ct + 128;
        var ph = 76;
        if (!this.uiSkinChrome) this.rect(px, py, W - 16, ph, [0.98, 0.94, 0.86, 0.94]);
        this.text("当前 · 浅滩 · 蚯蚓", Math.round(W / 2), py - 10, fs, inkMuted, "center");
        this.drawFishingGearSlot(px, py + 6, btnW, 32, "浅滩", collection.spotId === "shallow", true);
        this.drawFishingGearSlot(px + btnW + 4, py + 6, btnW, 32, "礁石", collection.spotId === "reef", collection.isSpotUnlocked("reef"));
        this.drawFishingGearSlot(px + (btnW + 4) * 2, py + 6, btnW, 32, "深海", collection.spotId === "deep", collection.isSpotUnlocked("deep"));
        this.drawFishingGearSlot(px, py + 42, btnW, 32, "蚯蚓", collection.baitId === "worm", true);
        this.drawFishingGearSlot(px + btnW + 4, py + 42, btnW, 32, "虾米", collection.baitId === "shrimp", collection.isBaitUnlocked("shrimp"));
        this.drawFishingGearSlot(px + (btnW + 4) * 2, py + 42, btnW, 32, "秘制", collection.baitId === "secret", collection.isBaitUnlocked("secret"));
        if (!collection.isSpotUnlocked("reef")) {
          this.text("礁石·铁竿（剧情解锁）", px + btnW + 4 + btnW / 2, py + 22, 11, inkMuted, "center");
        }
        if (!collection.isBaitUnlocked("shrimp")) {
          this.text("虾米（图鉴解锁）", px + btnW + 4 + btnW / 2, py + 58, 11, inkMuted, "center");
        }
        return;
      }
      var P = this.fishingGearPanelLand;
      if (!this.uiSkinChrome) this.rect(P.x, P.y, P.w, P.h, [0.98, 0.94, 0.86, 0.92]);
      this.text("当前 · 浅滩 · 蚯蚓", P.x + P.w / 2, P.y - 8, fs, inkMuted, "center");
      this.drawFishingGearSlot(P.col0, P.rowSpotY, P.btnW, P.btnH, "浅滩", collection.spotId === "shallow", true);
      this.drawFishingGearSlot(P.col1, P.rowSpotY, P.btnW, P.btnH, "礁石", collection.spotId === "reef", collection.isSpotUnlocked("reef"));
      this.drawFishingGearSlot(P.col2, P.rowSpotY, P.btnW, P.btnH, "深海", collection.spotId === "deep", collection.isSpotUnlocked("deep"));
      this.drawFishingGearSlot(P.col0, P.rowBaitY, P.btnW, P.btnH, "蚯蚓", collection.baitId === "worm", true);
      this.drawFishingGearSlot(P.col1, P.rowBaitY, P.btnW, P.btnH, "虾米", collection.baitId === "shrimp", collection.isBaitUnlocked("shrimp"));
      this.drawFishingGearSlot(P.col2, P.rowBaitY, P.btnW, P.btnH, "秘制", collection.baitId === "secret", collection.isBaitUnlocked("secret"));
    },

    drawFishingGear: function (collection, portrait) {
      if (collection.phase !== "idle") return;
      if (this.uiSkinChrome && this.artOn) {
        if (portrait) {
          this.button(this.width - 112, 64 + 54, 104, 34, collection.fishingDrawerOpen ? "收起钓具" : "钓具", true);
        } else {
          this.button(392, 376, 112, 38, collection.fishingDrawerOpen ? "收起钓具" : "钓具", true);
        }
        if (!collection.fishingDrawerOpen) return;
        this.drawFishingGearDrawerPanel(collection, portrait);
        return;
      }
      if (portrait) {
        var W = this.width, ct = 64;
        var btnW = Math.round((W - 16) / 3);
        this.drawFishingGearSlot(8, ct + 54, btnW, 34, "浅滩", collection.spotId === "shallow", true);
        this.drawFishingGearSlot(8, ct + 94, btnW, 34, "蚯蚓", collection.baitId === "worm", true);
        this.button(W - 112, ct + 54, 104, 34, collection.fishingDrawerOpen ? "收起" : "更多", true);
        if (collection.fishingDrawerOpen) {
          if (!this.uiSkinChrome) this.rect(8, ct + 132, W - 16, 72, [0.98, 0.94, 0.86, 0.92]);
          this.drawFishingGearSlot(8 + btnW + 2, ct + 54, btnW, 34, "礁石", collection.spotId === "reef", collection.isSpotUnlocked("reef"));
          this.drawFishingGearSlot(8 + (btnW + 2) * 2, ct + 54, btnW, 34, "深海", collection.spotId === "deep", collection.isSpotUnlocked("deep"));
          this.drawFishingGearSlot(8 + btnW + 2, ct + 94, btnW, 34, "虾米", collection.baitId === "shrimp", collection.isBaitUnlocked("shrimp"));
          this.drawFishingGearSlot(8 + (btnW + 2) * 2, ct + 94, btnW, 34, "秘制", collection.baitId === "secret", collection.isBaitUnlocked("secret"));
        }
      } else {
        this.drawFishingGearSlot(14, 376, 120, 38, "浅滩", collection.spotId === "shallow", true);
        this.drawFishingGearSlot(14, 420, 120, 38, "蚯蚓", collection.baitId === "worm", true);
        this.button(392, 376, 100, 38, collection.fishingDrawerOpen ? "收起" : "更多", true);
        if (collection.fishingDrawerOpen) {
          if (!this.uiSkinChrome) this.rect(8, 318, 388, 58, [0.98, 0.94, 0.86, 0.92]);
          this.drawFishingGearSlot(142, 328, 120, 34, "礁石·铁竿", collection.spotId === "reef", collection.isSpotUnlocked("reef"));
          this.drawFishingGearSlot(270, 328, 120, 34, "深海·金竿", collection.spotId === "deep", collection.isSpotUnlocked("deep"));
          this.drawFishingGearSlot(142, 366, 120, 34, "虾米", collection.baitId === "shrimp", collection.isBaitUnlocked("shrimp"));
          this.drawFishingGearSlot(270, 366, 120, 34, "秘制", collection.baitId === "secret", collection.isBaitUnlocked("secret"));
        }
      }
    },

    speciesShopUnlocked: function (speciesId) {
      if (speciesId === "small") return true;
      if (AIGCUtils.GameState.getFishCount(speciesId) > 0) return true;
      var pool = AIGCUtils.Recipes.getOrderableSpeciesIds("shallow", "worm");
      return pool.indexOf(speciesId) >= 0;
    },

    rawFishKey: function (speciesId) {
      var id = AIGCUtils.Recipes.normalizeSpeciesId(speciesId || "small");
      if (id !== "small" && id !== "salmon" && id !== "tuna" && id !== "golden") id = "small";
      return "fish_raw_" + id;
    },

    paintSwimFish: function (speciesId, x, y, targetH, flip) {
      var key = this.rawFishKey(speciesId);
      var frame = this.spriteFrame(key, 0, targetH);
      if (!frame) return false;
      var left = x - frame.w / 2;
      var top = y - frame.h / 2;
      var u0 = frame.u0;
      var u1 = frame.u1;
      if (flip) {
        var swap = u0;
        u0 = u1;
        u1 = swap;
      }
      if (!this.paintTexturedQuad(key, left, top, frame.w, frame.h, u0, frame.v0, u1, frame.v1, 0, x, y)) return false;
      this.flush();
      return true;
    },

    paintEscapedFish: function (x, y, size) {
      if (!this.artOn) {
        this.fish(x, y, size, false);
        return;
      }
      var pool = AIGCUtils.Recipes.getOrderableSpeciesIds(AIGCUtils.Collection.spotId, AIGCUtils.Collection.baitId);
      var id = (pool && pool[0]) || "small";
      if (!this.paintSwimFish(id, x, y, Math.round(size * 1.6), true)) this.fish(x, y, size, false);
    },

    /**
     * 钓鱼兔子脚底对齐座位。竿尖是精灵内部的木色尖端，旋转后仍从该点出线。
     * footU/tipU/tipV 来自 hero_rabbit_fish.png 内容区，不是整张画布中心。
     */
    paintFishingRabbit: function (seatX, seatY, targetH, rot) {
      var key = "hero_rabbit_fish";
      var frame = this.spriteFrame(key, 0, targetH);
      if (!frame) return null;
      var footU = 0.3813;
      var tipU = 0.9991;
      var tipV = 0.0532;
      var left = seatX - footU * frame.w;
      var top = seatY - frame.h;
      if (!this.paintTexturedQuad(key, left, top, frame.w, frame.h, frame.u0, frame.v0, frame.u1, frame.v1, rot, seatX, seatY)) return null;
      this.flush();
      var dx = left + tipU * frame.w - seatX;
      var dy = top + tipV * frame.h - seatY;
      var c = Math.cos(rot || 0);
      var s = Math.sin(rot || 0);
      return {
        tipX: seatX + dx * c - dy * s,
        tipY: seatY + dx * s + dy * c
      };
    },

    drawArtFishingMotion: function () {
      var collection = AIGCUtils.Collection;
      var portrait = this.portrait;
      var now = Date.now();
      var shift = this.artShiftX || 0;
      // 座位槽：横屏左舱内沿，竖屏灯笼右侧空长凳。单位是设计坐标。
      var seatX = (portrait ? 194 : 152) + shift;
      var seatY = portrait ? 828 : 228;
      var rabbitH = portrait ? 131 : 92;
      var rot = collection.phase === "reeling" && collection.reelHeld ? Math.sin(collection.timer / 75) * 0.12 : 0;
      var pool = AIGCUtils.Recipes.getOrderableSpeciesIds(collection.spotId, collection.baitId);
      if (!pool || !pool.length) pool = ["small"];
      var school = portrait ? [
        { id: "small", x: 90, y: 620, h: 34, flip: false, phase: 0.2 },
        { id: "small", x: 250, y: 690, h: 28, flip: true, phase: 1.4 },
        { id: "small", x: 410, y: 640, h: 32, flip: false, phase: 2.3 },
        { id: "salmon", x: 180, y: 530, h: 48, flip: true, phase: 0.8 }
      ] : [
        { id: "small", x: 470, y: 355, h: 26, flip: false, phase: 0.4 },
        { id: "small", x: 640, y: 385, h: 22, flip: true, phase: 1.6 },
        { id: "small", x: 860, y: 348, h: 24, flip: false, phase: 2.5 },
        { id: "salmon", x: 760, y: 268, h: 38, flip: true, phase: 0.9 }
      ];
      for (var i = 0; i < school.length; i++) {
        var swimmer = school[i];
        if (pool.indexOf(swimmer.id) < 0) continue;
        var swimX = swimmer.x + shift + Math.sin(now / 900 + swimmer.phase) * 16;
        var swimY = swimmer.y + Math.cos(now / 1100 + swimmer.phase) * 6;
        this.paintSwimFish(swimmer.id, swimX, swimY, swimmer.h, swimmer.flip);
      }
      var rabbit = this.paintFishingRabbit(seatX, seatY, rabbitH, rot);
      var mark = (portrait ? "port" : "land") + ":" + collection.spotId + ":" + pool.join("+");
      if (this.fishArtLog !== mark) {
        this.fishArtLog = mark;
        console.log("[FishingArt] seat", Math.round(seatX), Math.round(seatY), "tip", rabbit ? Math.round(rabbit.tipX) + "," + Math.round(rabbit.tipY) : "missing", "pool", pool.join(","));
      }
      if (!rabbit) return;
      var lineOut = collection.phase === "charging" || collection.phase === "waiting" || collection.phase === "bite" || collection.phase === "reeling";
      var floatX = collection.bubbleX;
      var floatY = collection.bubbleY + Math.sin(now / 260) * 5;
      if (collection.phase === "bite") floatY += 18;
      if (collection.phase === "reeling") {
        floatX += Math.sin(collection.timer / 90) * 18;
        floatY += Math.cos(collection.timer / 110) * 8;
      }
      if (lineOut) {
        this.line(rabbit.tipX, rabbit.tipY, floatX, floatY, 2, C.ink);
        var ripples = collection.phase === "bite" ? 3 : 2;
        for (var ripple = 0; ripple < ripples; ripple++) {
          var progress = ((now / 650 + ripple * 0.33) % 1);
          this.circle(floatX, floatY, 6 + progress * 30, [0.98, 0.92, 0.79, 0.3 * (1 - progress)], 14);
        }
        this.circle(floatX, floatY, collection.phase === "bite" ? 11 : 7, C.orange);
      }
      if (collection.phase === "reeling") {
        var hooked = pool[Math.floor(now / 700) % pool.length];
        this.paintSwimFish(hooked, floatX + 18, floatY + 26, portrait ? 36 : 32, false);
      }
      if (collection.phase === "fishCaught") {
        var caughtT = Math.min(1, collection.timer / 850);
        var caughtId = collection.caughtFish && collection.caughtFish.speciesId;
        if (pool.indexOf(caughtId) < 0) caughtId = pool[0];
        var jumpY = collection.bubbleY - Math.sin(caughtT * Math.PI) * (portrait ? 110 : 130);
        this.paintSwimFish(caughtId, collection.bubbleX, jumpY, portrait ? 52 : 46, false);
        this.line(rabbit.tipX, rabbit.tipY, collection.bubbleX, jumpY, 2, C.ink);
        this.text("钓到了", portrait ? this.width / 2 : 610, portrait ? 420 : 150, 28, C.cream, "center");
      }
    },

    pulseFrame: function (x, y, width, height) {
      var alpha = 0.45 + Math.sin(Date.now() / 220) * 0.35;
      var color = [0.94, 0.63, 0.2, alpha];
      this.rect(x, y, width, 6, color);
      this.rect(x, y + height - 6, width, 6, color);
      this.rect(x, y, 6, height, color);
      this.rect(x + width - 6, y, 6, height, color);
    },

    resize: function () {
      var layout = AIGCUtils.Layout || { w: 896, h: 414 };
      var width = layout.w || 896;
      var height = layout.h || 414;
      this.portrait = height > width;
      if (this.portrait) {
        this.width = 540;
        this.height = 960;
      } else {
        this.width = 960;
        this.height = 540;
      }
      this.scale = Math.min(width / this.width, height / this.height);
      this.offsetX = (width - this.width * this.scale) / 2;
      this.offsetY = (height - this.height * this.scale) / 2;
      this.viewWidth = width;
      this.viewHeight = height;
    },

    toDesign: function (x, y) {
      if (!this.scale) this.resize();
      return {
        x: (x - this.offsetX) / this.scale,
        y: (y - this.offsetY) / this.scale
      };
    },

    point: function (x, y) {
      return [
        ((this.offsetX + x * this.scale) / this.viewWidth) * 2 - 1,
        1 - ((this.offsetY + y * this.scale) / this.viewHeight) * 2
      ];
    },

    vertex: function (x, y, color, u, v, textured) {
      var point = this.point(x, y);
      var mode = textured === true ? 1 : (textured || 0);
      this.vertices.push(point[0], point[1], color[0], color[1], color[2], color[3], u || 0, v || 0, mode);
    },

    tri: function (x1, y1, x2, y2, x3, y3, color) {
      this.vertex(x1, y1, color);
      this.vertex(x2, y2, color);
      this.vertex(x3, y3, color);
    },

    rect: function (x, y, width, height, color) {
      this.tri(x, y, x + width, y, x, y + height, color);
      this.tri(x + width, y, x + width, y + height, x, y + height, color);
    },

    circle: function (x, y, radius, color, segments) {
      var count = segments || 24;
      for (var i = 0; i < count; i++) {
        var a = i / count * Math.PI * 2;
        var b = (i + 1) / count * Math.PI * 2;
        this.tri(x, y, x + Math.cos(a) * radius, y + Math.sin(a) * radius, x + Math.cos(b) * radius, y + Math.sin(b) * radius, color);
      }
    },

    ellipse: function (x, y, radiusX, radiusY, color) {
      var count = 28;
      for (var i = 0; i < count; i++) {
        var a = i / count * Math.PI * 2;
        var b = (i + 1) / count * Math.PI * 2;
        this.tri(x, y, x + Math.cos(a) * radiusX, y + Math.sin(a) * radiusY, x + Math.cos(b) * radiusX, y + Math.sin(b) * radiusY, color);
      }
    },

    line: function (x1, y1, x2, y2, width, color) {
      var dx = x2 - x1;
      var dy = y2 - y1;
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      var px = -dy / length * width / 2;
      var py = dx / length * width / 2;
      this.tri(x1 + px, y1 + py, x2 + px, y2 + py, x1 - px, y1 - py, color);
      this.tri(x2 + px, y2 + py, x2 - px, y2 - py, x1 - px, y1 - py, color);
    },

    textWidth: function (text, size) {
      var value = String(text);
      var font = AIGCUtils.FontAtlas;
      var scale = size / font.fontSize;
      var width = 0;
      for (var i = 0; i < value.length; i++) {
        var glyph = font.glyphs[value[i]];
        if (glyph) width += glyph.advance * scale;
      }
      return width;
    },

    /** 单行文字外框（与 text() 绘制一致），用于在矩形内垂直居中 */
    textLineBounds: function (text, size) {
      var value = String(text);
      var font = AIGCUtils.FontAtlas;
      var scale = size / font.fontSize;
      var minOff = null;
      var maxExt = 0;
      for (var i = 0; i < value.length; i++) {
        var glyph = font.glyphs[value[i]];
        if (!glyph || glyph.w <= 0 || glyph.h <= 0) continue;
        if (minOff === null || glyph.yoffset < minOff) minOff = glyph.yoffset;
        var ext = glyph.yoffset + glyph.h;
        if (ext > maxExt) maxExt = ext;
      }
      if (minOff === null) minOff = 0;
      return { scale: scale, minOff: minOff, maxExt: maxExt };
    },

    textYInBox: function (text, size, boxY, boxHeight) {
      var b = this.textLineBounds(text, size);
      return boxY + boxHeight / 2 - ((b.minOff + b.maxExt) / 2) * b.scale;
    },

    textQuad: function (x, y, width, height, glyph, color) {
      var font = AIGCUtils.FontAtlas;
      var left = glyph.x / font.width;
      var right = (glyph.x + glyph.w) / font.width;
      var top = glyph.y / font.height;
      var bottom = (glyph.y + glyph.h) / font.height;
      this.vertex(x, y, color, left, top, true);
      this.vertex(x + width, y, color, right, top, true);
      this.vertex(x, y + height, color, left, bottom, true);
      this.vertex(x + width, y, color, right, top, true);
      this.vertex(x + width, y + height, color, right, bottom, true);
      this.vertex(x, y + height, color, left, bottom, true);
    },

    text: function (text, x, y, size, color, align) {
      if (!this.fontReady) return;
      this.useTexture(this.fontTexture);
      var value = String(text);
      var font = AIGCUtils.FontAtlas;
      var scale = size / font.fontSize;
      var startX = x;
      if (align === "center") startX -= this.textWidth(value, size) / 2;
      if (align === "right") startX -= this.textWidth(value, size);
      var cursor = startX;
      for (var i = 0; i < value.length; i++) {
        var character = value[i];
        var glyph = font.glyphs[character];
        if (!glyph) {
          if (!this.missingGlyphs[character]) {
            this.missingGlyphs[character] = true;
            console.warn("[Prototype] Font glyph missing", character);
          }
          continue;
        }
        if (glyph.w > 0 && glyph.h > 0) {
          this.textQuad(
            cursor + glyph.xoffset * scale,
            y + glyph.yoffset * scale,
            glyph.w * scale,
            glyph.h * scale,
            glyph,
            color
          );
        }
        cursor += glyph.advance * scale;
      }
    },

    button: function (x, y, width, height, label, active) {
      if (this.uiSkinChrome) {
        if (this.scenes["btn-wood"]) {
          var pad = Math.max(2, Math.min(6, Math.round(Math.min(width, height) * 0.1)));
          this.paintUiStretch("btn-wood", x + pad, y + pad, width - pad * 2, height - pad * 2);
          this.flush();
          var fsSkin = 16;
          this.text(
            label,
            x + width / 2,
            this.textYInBox(label, fsSkin, y, height),
            fsSkin,
            [0.22, 0.18, 0.14, active ? 1 : 0.88],
            "center"
          );
        } else {
          var ink = active ? C.ink : [0.42, 0.38, 0.34, 0.92];
          var fsFallback = 16;
          this.text(label, x + width / 2, this.textYInBox(label, fsFallback, y, height), fsFallback, ink, "center");
        }
        return;
      }
      if (this.scenes["btn-wood"]) {
        var alpha = active ? 1 : 0.82;
        var fsWood = 17;
        this.paintUiStretch("btn-wood", x, y, width, height);
        this.text(
          label,
          x + width / 2,
          this.textYInBox(label, fsWood, y, height),
          fsWood,
          [0.22, 0.18, 0.14, alpha],
          "center"
        );
        return;
      }
      this.rect(x + 3, y + 5, width, height, C.shadow);
      this.rect(x, y, width, height, active ? C.orange : C.wood);
      this.rect(x + 4, y + 4, width - 8, height - 10, active ? C.honey : C.paper);
      var fsVec = 17;
      this.text(label, x + width / 2, this.textYInBox(label, fsVec, y, height), fsVec, C.ink, "center");
    },

    progress: function (x, y, width, value, cursor, zoneStart, zoneEnd) {
      var start = zoneStart === undefined ? 0.25 : zoneStart;
      var end = zoneEnd === undefined ? 0.75 : zoneEnd;
      if (this.uiSkinChrome) {
        this.rect(x + width * start, y + 6, width * (end - start), 10, [0.42, 0.58, 0.38, 0.35]);
        var marker = cursor === undefined || cursor === null ? value : cursor;
        this.rect(x + width * marker - 2, y, 4, 22, C.red);
        if (value !== null) this.rect(x, y + 18, width * Math.max(0, Math.min(1, value)), 6, C.honey);
        return;
      }
      this.rect(x - 4, y - 4, width + 8, 32, C.wood);
      this.rect(x, y, width, 24, C.cream);
      this.rect(x + width * start, y, width * (end - start), 24, C.green);
      if (value !== null) this.rect(x, y + 29, width * Math.max(0, Math.min(1, value)), 8, C.honey);
      var marker = cursor === undefined || cursor === null ? value : cursor;
      this.rect(x + width * marker - 3, y - 8, 6, 40, C.red);
    },

    fish: function (x, y, size, cooked, speciesId) {
      var color = C.fish;
      if (speciesId === "salmon") color = C.orange;
      if (speciesId === "tuna") color = C.seaDark;
      if (speciesId === "golden") color = C.honey;
      if (cooked) {
        color = speciesId === "salmon" ? C.wood : speciesId === "tuna" ? C.seaDark : speciesId === "golden" ? C.honey : C.fishCooked;
      }
      this.ellipse(x, y, size, size * (speciesId === "golden" ? 0.58 : 0.48), color);
      this.tri(x - size * 0.75, y, x - size * 1.35, y - size * 0.55, x - size * 1.35, y + size * 0.55, color);
      this.circle(x + size * 0.45, y - size * 0.1, size * 0.09, C.ink, 12);
      if (speciesId === "salmon") {
        this.line(x - size * 0.25, y - size * 0.35, x - size * 0.1, y + size * 0.35, 2, C.cream);
        this.line(x + size * 0.1, y - size * 0.35, x + size * 0.25, y + size * 0.35, 2, C.cream);
      }
      if (speciesId === "tuna" || speciesId === "golden") this.tri(x - size * 0.2, y - size * 0.4, x + size * 0.15, y - size * 0.85, x + size * 0.35, y - size * 0.4, color);
      if (cooked) {
        this.line(x - size * 0.35, y - size * 0.3, x - size * 0.1, y + size * 0.3, 3, C.brown);
        this.line(x + size * 0.05, y - size * 0.3, x + size * 0.3, y + size * 0.3, 3, C.brown);
      }
    },

    coconut: function (x, y, radius, golden) {
      if (golden) this.circle(x, y, radius + 3, C.honey);
      this.circle(x, y, radius, golden ? C.honey : C.brown);
      this.circle(x - radius * 0.25, y - radius * 0.2, radius * 0.12, C.ink, 10);
      this.circle(x + radius * 0.2, y - radius * 0.25, radius * 0.12, C.ink, 10);
      this.circle(x, y + radius * 0.2, radius * 0.12, C.ink, 10);
    },

    juice: function (x, y, size, withStraw) {
      this.rect(x - size * 0.45, y - size * 0.55, size * 0.9, size * 1.1, C.cream);
      this.rect(x - size * 0.35, y - size * 0.1, size * 0.7, size * 0.55, C.honey);
      if (withStraw !== false) this.line(x + size * 0.1, y - size * 0.55, x + size * 0.5, y - size, 5, C.orange);
      this.coconut(x - size * 0.15, y - size * 0.3, size * 0.22);
    },

    rabbit: function (x, y, size) {
      this.ellipse(x - size * 0.28, y - size * 1.25, size * 0.2, size * 0.65, C.white);
      this.ellipse(x + size * 0.28, y - size * 1.25, size * 0.2, size * 0.65, C.white);
      this.ellipse(x, y + size * 0.65, size * 0.75, size * 0.85, C.white);
      this.circle(x, y, size * 0.78, C.white);
      this.circle(x - size * 0.25, y - size * 0.05, size * 0.08, C.ink, 12);
      this.circle(x + size * 0.25, y - size * 0.05, size * 0.08, C.ink, 12);
      this.circle(x, y + size * 0.18, size * 0.07, C.orange, 12);
      this.rect(x - size * 0.45, y + size * 0.45, size * 0.9, size * 0.85, C.paper);
      this.circle(x - size * 0.35, y - size * 0.85, size * 0.34, C.white);
      this.circle(x, y - size * 0.98, size * 0.38, C.white);
      this.circle(x + size * 0.35, y - size * 0.85, size * 0.34, C.white);
    },

    rabbitBack: function (x, y, size) {
      // 背向玩家版：耳朵 + 头 + 短身躯 + 小尾巴
      this.ellipse(x - size * 0.28, y - size * 1.1, size * 0.18, size * 0.55, C.white);  // 左耳
      this.ellipse(x + size * 0.28, y - size * 1.1, size * 0.18, size * 0.55, C.white);  // 右耳
      this.circle(x - size * 0.32, y - size * 0.78, size * 0.3, C.white);  // 头后左
      this.circle(x, y - size * 0.9, size * 0.34, C.white);                // 头顶
      this.circle(x + size * 0.32, y - size * 0.78, size * 0.3, C.white);  // 头后右
      this.circle(x, y, size * 0.72, C.white);                              // 头/颈
      this.ellipse(x, y + size * 0.42, size * 0.65, size * 0.5, C.white);  // 短身躯
      this.circle(x, y + size * 0.78, size * 0.18, C.white);               // 小尾巴
    },

    customer: function (x, y, wants, active) {
      if (!active) {
        this.text("完成", x, y, 20, C.green, "center");
        return;
      }
      this.ellipse(x, y + 28, 45, 48, wants === "fish_grilled" ? C.woodLight : C.honey);
      this.circle(x, y, 42, wants === "fish_grilled" ? C.woodLight : C.honey);
      this.circle(x - 25, y - 30, 15, C.woodLight);
      this.circle(x + 25, y - 30, 15, C.woodLight);
      this.circle(x - 14, y - 4, 5, C.ink, 10);
      this.circle(x + 14, y - 4, 5, C.ink, 10);
      this.rect(x - 75, y - 100, 150, 48, C.cream);
      if (wants === "fish_grilled") {
        this.fish(x, y - 76, 25, true);
      } else {
        this.juice(x, y - 77, 28);
      }
    },

    palm: function (x, y, scale) {
      this.line(x, y + 150 * scale, x + 15 * scale, y, 24 * scale, C.wood);
      this.line(x + 15 * scale, y, x - 90 * scale, y - 50 * scale, 22 * scale, C.leaf);
      this.line(x + 15 * scale, y, x + 110 * scale, y - 55 * scale, 22 * scale, C.leaf);
      this.line(x + 15 * scale, y, x - 65 * scale, y + 25 * scale, 20 * scale, C.leafLight);
      this.line(x + 15 * scale, y, x + 90 * scale, y + 30 * scale, 20 * scale, C.leafLight);
      this.coconut(x - 5 * scale, y + 18 * scale, 15 * scale);
      this.coconut(x + 30 * scale, y + 20 * scale, 15 * scale);
    },

    hudBarY: 10,
    hudBarH: 44,
    hudSlotCenters: function () {
      if (this.portrait) {
        return [
          { cx: 0.27, text: null },
          { cx: 0.415, text: null },
          { cx: 0.56, text: null },
          { cx: 0.705, text: null },
          { cx: 0.85, text: null }
        ];
      }
      return [
        { cx: 0.4025, text: null },
        { cx: 0.5225, text: null },
        { cx: 0.6525, text: null },
        { cx: 0.7875, text: null },
        { cx: 0.912, text: null }
      ];
    },

    drawHudMetric: function (line, slotIndex, size) {
      var slots = this.hudSlotCenters();
      var slot = slots[slotIndex];
      if (!slot) return;
      var cx = Math.round(this.width * slot.cx);
      var y = this.textYInBox(line, size, this.hudBarY, this.hudBarH);
      this.text(line, cx, y, size, C.ink, "center");
    },

    drawHUD: function () {
      var state = AIGCUtils.GameState;
      var W = this.width;
      if (!this.uiSkinChrome) {
        this.rect(0, 0, W, 64, C.cream);
        this.rect(0, 60, W, 4, C.wood);
      }
      var fs = this.uiSkinChrome ? (this.portrait ? 14 : 15) : this.portrait ? 15 : 17;
      if (this.uiSkinChrome) {
        this.drawHudMetric("第" + state.day + "天", 0, fs);
        this.drawHudMetric("金币" + state.coins, 1, fs);
        this.drawHudMetric("鱼肉" + state.ingredients.fish, 2, fs);
        this.drawHudMetric("椰子" + state.ingredients.coconut, 3, fs);
        this.drawHudMetric("等级" + state.level, 4, fs);
        return;
      }
      if (this.portrait) {
        this.text("孤岛烤鱼店", 10, 16, 17, C.ink);
        this.text("第" + state.day + "天", 115, 21, 15, C.ink);
        this.text("金币" + state.coins, 192, 21, 15, C.ink);
        this.text("鱼肉" + state.ingredients.fish, 271, 21, 15, C.ink);
        this.text("椰子" + state.ingredients.coconut, 350, 21, 15, C.ink);
        this.text("等级" + state.level, 429, 21, 15, C.ink);
      } else {
        this.text("孤岛烤鱼店", 20, 16, 17, C.ink);
        this.text("第" + state.day + "天", 350, 21, 17, C.ink);
        this.text("金币 " + state.coins, 445, 21, 17, C.ink);
        this.text("鱼肉 " + state.ingredients.fish, 575, 21, 17, C.ink);
        this.text("椰子 " + state.ingredients.coconut, 700, 21, 17, C.ink);
        this.text("等级 " + state.level, 830, 21, 17, C.ink);
      }
    },

    drawNav: function () {
      var W = this.width, H = this.height;
      var navY = H - 72;
      var fishEnergy = AIGCUtils.Energy.get("fish");
      var coconutEnergy = AIGCUtils.Energy.get("coconut");
      var energyText = this.portrait
        ? "钓" + fishEnergy.value + "/" + fishEnergy.max + " 摘" + coconutEnergy.value + "/" + coconutEnergy.max
        : "钓鱼体力 " + fishEnergy.value + "/" + fishEnergy.max + "  采摘体力 " + coconutEnergy.value + "/" + coconutEnergy.max;
      if (this.uiSkinChrome) {
        var enSize = this.portrait ? 14 : 15;
        var enY = this.textYInBox(energyText, enSize, navY + 10, 52);
        this.text(energyText, W - 12, enY, enSize, C.ink, "right");
        return;
      }
      this.rect(0, navY, W, 72, C.cream);
      this.rect(0, navY, W, 4, C.wood);
      this.button(20, navY + 8, 130, 48, "地图", AIGCUtils.Game.currentArea === "map");
      this.button(170, navY + 8, 130, 48, "背包", false);
      this.text(energyText, W - 10, navY + 27, 17, C.ink, "right");
    },

    drawMap: function () {
      var W = this.width, H = this.height;
      var ct = 64, cb = H - 72, ch = cb - ct;
      var hw = Math.round(W / 2);
      if (!this.artOn) this.rect(0, ct, W, ch, C.sea);
      if (this.portrait) {
        // 竖屏：三区域上中下分布
        var zoneH = Math.round(ch * 0.27);
        var gap = Math.round(ch * 0.035);
        var fishY = ct + gap;
        var coconutY = ct + zoneH + gap * 2;
        var shopY = ct + zoneH * 2 + gap * 3;
        if (!this.artOn) {
          this.ellipse(hw, ct + ch * 0.5, W * 0.38, ch * 0.28, C.sand);
          this.rect(10, fishY, W - 20, zoneH, C.paper);
          this.rect(10, coconutY, W - 20, zoneH, C.leafLight);
          this.rect(10, shopY, W - 20, zoneH, AIGCUtils.GameState.shopBuilt ? C.honey : C.woodLight);
        } else {
          var nextZone = fishY;
          if (AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt) nextZone = coconutY;
          else if (AIGCUtils.GameState.shopBuilt || AIGCUtils.GameState.tasks.coconut) nextZone = shopY;
          this.pulseFrame(10, nextZone, W - 20, zoneH);
        }
        if (!this.artOn) {
          this.fish(70, fishY + zoneH * 0.5, 36, false);
          this.palm(90, coconutY + zoneH * 0.35, 0.42);
        }
        if (this.uiSkinChrome) {
          var pz = AIGCUtils.MapZones.port;
          if (AIGCUtils.GameState.fishCaught < 3 && !AIGCUtils.GameState.tasks.coconut) {
            this.rect(pz.coconut.x, pz.coconut.y, pz.coconut.w, pz.coconut.h, [0.35, 0.32, 0.28, 0.45]);
          }
          if (!AIGCUtils.GameState.shopBuilt) {
            this.rect(pz.shop.x, pz.shop.y, pz.shop.w, pz.shop.h, [0.35, 0.32, 0.28, 0.45]);
          }
        } else {
          this.text("钓鱼区", hw, fishY + zoneH * 0.45, 26, C.ink, "center");
          this.text("椰林区", hw, coconutY + zoneH * 0.45, 26, C.ink, "center");
          this.text(AIGCUtils.GameState.shopBuilt ? "烤鱼店" : "待搭建", hw, shopY + zoneH * 0.45, 26, C.ink, "center");
          if (AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt) {
            this.text("新目标 采摘椰子", hw, coconutY + zoneH * 0.72, 17, C.ink, "center");
          }
        }
        var offlineLit = !!AIGCUtils.GameState.pendingOffline || AIGCUtils.GameState.playTimeMs >= 20 * 60 * 1000;
        var offlineLabel = AIGCUtils.GameState.pendingOffline ? "领取" : "离线";
        this.button(hw - 140, cb - 62, 280, 48, offlineLabel, offlineLit);
      } else {
        if (!this.artOn) {
          this.ellipse(480, 270, 405, 185, C.sand);
          this.line(310, 235, 480, 350, 16, C.paper);
          this.line(480, 350, 660, 220, 16, C.paper);
          this.rect(80, 105, 330, 180, C.paper);
          this.rect(520, 90, 330, 180, C.leafLight);
          this.rect(330, 295, 330, 150, AIGCUtils.GameState.shopBuilt ? C.honey : C.woodLight);
        } else {
          var mapZ = AIGCUtils.MapZones.land;
          var guide = mapZ.fish;
          if (AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt) guide = mapZ.coconut;
          else if (AIGCUtils.GameState.shopBuilt || AIGCUtils.GameState.tasks.coconut) guide = mapZ.shop;
          this.pulseFrame(guide.x, guide.y, guide.w, guide.h);
        }
        if (!this.artOn) {
          this.fish(185, 175, 48, false);
          this.palm(610, 150, 0.45);
        }
        if (this.uiSkinChrome) {
          var mz = AIGCUtils.MapZones.land;
          if (AIGCUtils.GameState.fishCaught < 3 && !AIGCUtils.GameState.tasks.coconut) {
            this.rect(mz.coconut.x, mz.coconut.y, mz.coconut.w, mz.coconut.h, [0.35, 0.32, 0.28, 0.45]);
          }
          if (!AIGCUtils.GameState.shopBuilt) {
            this.rect(mz.shop.x, mz.shop.y, mz.shop.w, mz.shop.h, [0.35, 0.32, 0.28, 0.45]);
          }
        } else {
          this.text("钓鱼区", 280, 160, 28, C.ink, "center");
          this.text("椰林区", 735, 150, 28, C.ink, "center");
          this.text(AIGCUtils.GameState.shopBuilt ? "烤鱼店" : "待搭建", 495, 345, 28, C.ink, "center");
          this.text("地图", 480, 76, 22, C.cream, "center");
          if (AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt) {
            this.text("新目标 采摘椰子", 735, 210, 17, C.ink, "center");
          }
        }
        var offlineLitLand = !!AIGCUtils.GameState.pendingOffline || AIGCUtils.GameState.playTimeMs >= 20 * 60 * 1000;
        var offlineLabelLand = AIGCUtils.GameState.pendingOffline ? "领取" : "离线";
        this.button(675, 405, 250, 48, offlineLabelLand, offlineLitLand);
      }
    },

    drawFishing: function () {
      var W = this.width, H = this.height;
      var ct = 64, cb = H - 72, ch = cb - ct;
      var hw = Math.round(W / 2);
      var collection = AIGCUtils.Collection;
      var struggling = collection.phase === "reeling";
      var pull = struggling && collection.reelHeld ? Math.sin(collection.timer / 75) * 9 : 0;

      if (this.portrait) {
        // ── 竖屏布局 ──
        var uiH = Math.round(ch * 0.25);   // 上方操控区高度
        var skyH = Math.round(ch * 0.12);  // 天空
        var seaTop = ct + uiH + skyH;
        var seaH = cb - seaTop;
        if (!this.artOn) {
          this.rect(0, ct + uiH, W, skyH, C.sky);
          this.rect(0, seaTop, W, seaH, C.sea);
        }
        if (!this.uiSkinChrome) {
          this.rect(0, ct, W, uiH, C.cream);
          this.rect(0, ct + uiH - 4, W, 4, C.wood);
        }
        if (!this.uiSkinChrome) {
          this.rect(10, ct + 8, W - 120, 38, C.paper);
          this.text("1选点 2选饵 3抛竿 4等咬钩 5提竿", hw - 50, ct + 18, 14, C.ink, "center");
        }
        this.button(W - 108, ct + 8, 98, 38, "离开", false);
        // 钓点和鱼饵按钮（3列网格）
        this.drawFishingGear(collection, true);
        if (!this.artOn) {
          for (var i = 0; i < 6; i++) {
            this.line(seaTop > 0 ? 40 + i * 80 : 0, seaTop + 22 + (i % 2) * 26, 70 + i * 80, seaTop + 22 + (i % 2) * 26, 4, C.cream);
          }
          var islandY = seaTop + Math.round(seaH * 0.78);
          this.ellipse(80, islandY + 28, 108, 42, C.sand);
          this.rabbit(70 - Math.abs(pull) * 0.5, islandY - 26 + Math.abs(pull) * 0.25, 34);
          var rodTipX = 120 + pull;
          var rodTipY = islandY - 78 + Math.abs(pull) * 0.5;
          this.line(105, islandY - 18, rodTipX, rodTipY, 5, C.wood);
          var bubblePulse = 4 + Math.sin(Date.now() / 350) * 2;
          for (var bubble = 0; bubble < 5; bubble++) {
            this.circle(collection.bubbleX - 28 + bubble * 14, collection.bubbleY + (bubble % 2) * 10, bubblePulse, C.cream, 12);
          }
          var fishX, fishY2;
          if (collection.phase === "idle") {
            fishX = rodTipX + 28;
            fishY2 = seaTop + 25;
          } else {
            fishX = collection.hookX + (struggling ? Math.sin(collection.timer / 90) * 16 : 0);
            var biteDrop = collection.phase === "bite" ? 18 : 0;
            fishY2 = collection.hookY + biteDrop + (struggling ? Math.cos(collection.timer / 110) * 8 : collection.phase === "waiting" ? Math.sin(collection.timer / 70) * 4 : 0);
          }
          if (rodTipY < seaTop && fishY2 >= seaTop) {
            var lineT = (seaTop - rodTipY) / (fishY2 - rodTipY);
            var waterEntryX = rodTipX + lineT * (fishX - rodTipX);
            this.line(rodTipX, rodTipY, waterEntryX, seaTop, 2, C.ink);
            this.line(waterEntryX, seaTop, fishX, fishY2, 2, C.seaDark);
          } else {
            this.line(rodTipX, rodTipY, fishX, fishY2, 2, C.ink);
          }
          this.circle(fishX, fishY2, 7, C.orange);
          if (struggling) {
            this.fish(fishX + 12, fishY2 + 28, 22, false);
            this.text("绿色区按住收线 松开放线", hw, seaTop + 40, 16, C.cream, "center");
          }
          if (collection.phase === "fishCaught") {
            var caughtT = Math.min(1, collection.timer / 850);
            this.fish(hw + caughtT * 80, seaTop + seaH * 0.35 - Math.sin(caughtT * Math.PI) * 120, 36, false);
            this.text("钓到了", hw, seaTop + 36, 26, C.cream, "center");
          }
        } else {
          this.drawArtFishingMotion();
        }
        if (collection.phase === "fishEscaped") {
          var escapedT = Math.min(1, collection.timer / 850);
          this.paintEscapedFish(hw + escapedT * 160, seaTop + seaH * 0.35 + escapedT * 55, 28);
          this.drawFishEscapedDialog(hw, Math.round(H / 2), W, true);
          return;
        }
        var instr = "按住抛竿";
        if (collection.phase === "charging") instr = "松开甩竿";
        if (collection.phase === "waiting") instr = "等待浮标下沉再提竿";
        if (collection.phase === "bite") instr = "咬钩了 立即提竿";
        if (collection.phase === "reeling") instr = "拉锯战 控制线张力";
        if (collection.phase === "idle") instr = "选中浅滩与蚯蚓 按住抛竿";
        var instrY = this.uiSkinChrome ? ct + 78 : seaTop + (struggling ? 64 : 40);
        var instrColor = this.uiSkinChrome ? [0.42, 0.38, 0.34, 0.92] : C.cream;
        this.text(instr, hw, instrY, 15, instrColor, "center");
        // 进度条
        var barY = cb - 110;
        if (collection.phase === "charging") this.progress(20, barY, W - 40, collection.power, collection.power, 0.4, 0.7);
        if (collection.phase === "reeling") {
          this.progress(20, barY, W - 40, collection.reelProgress, collection.reelCursor, 0.35, 0.65);
          if (!this.uiSkinChrome) {
            this.text("线张力", 18, barY + 38, 15, C.cream, "right");
            this.rect(20, barY + 38, W - 40, 11, C.cream);
          } else {
            this.text("线张力", 18, barY + 38, 15, C.ink, "right");
          }
          this.rect(20, barY + 38, (W - 40) * Math.min(1, collection.tension), 11, collection.tension > 0.8 ? C.red : C.honey);
        }
        // 主操作按钮
        var actY = cb - 58;
        if (collection.phase === "idle") this.button(hw - 120, actY, 240, 50, "按住抛竿", true);
        if (collection.phase === "charging") this.button(hw - 120, actY, 240, 50, "松开抛竿 " + Math.round(collection.power * 100) + "%", true);
        if (collection.phase === "waiting") this.button(hw - 120, actY, 240, 50, "提竿", false);
        if (collection.phase === "bite") this.button(hw - 120, actY, 240, 50, "立即提竿", true);
        if (collection.phase === "reeling") this.button(hw - 140, actY, 280, 52, collection.reelHeld ? "收线中 松开可放线" : "按住收线 松开放线", true);

      } else {
        if (!this.artOn) {
          this.rect(0, 64, 960, 404, C.sky);
          this.rect(0, 150, 960, 318, C.sea);
        }
        if (!this.uiSkinChrome) {
          this.rect(20, 72, 810, 42, C.cream);
          this.text("1选点  2看气泡  3选饵  4抛竿  5等咬钩  6提竿  7拉锯", 425, 82, 17, C.ink, "center");
        }
        this.button(835, 72, 100, 42, "离开", false);
        this.drawFishingGear(collection, false);
        if (!this.artOn) {
          for (var i = 0; i < 8; i++) {
            this.line(300 + i * 85, 205 + (i % 3) * 52, 340 + i * 85, 205 + (i % 3) * 52, 4, C.cream);
          }
          this.ellipse(125, 415, 180, 75, C.sand);
          this.rabbit(145 - Math.abs(pull) * 0.5, 280 + Math.abs(pull) * 0.25, 42);
          this.line(185, 260, 350 + pull, 180 + Math.abs(pull) * 0.5, 6, C.wood);
          var bubblePulse = 4 + Math.sin(Date.now() / 350) * 2;
          for (var bubble = 0; bubble < 5; bubble++) {
            this.circle(collection.bubbleX - 32 + bubble * 16, collection.bubbleY + (bubble % 2) * 12, bubblePulse, C.cream, 12);
          }
          var lsRodTipX = 350 + pull, lsRodTipY = 180 + Math.abs(pull) * 0.5;
          var fishX, fishY2;
          if (collection.phase === "idle") {
            fishX = lsRodTipX + 28;
            fishY2 = 175;
          } else {
            fishX = collection.hookX + (struggling ? Math.sin(collection.timer / 90) * 20 : 0);
            var biteDrop = collection.phase === "bite" ? 20 : 0;
            fishY2 = collection.hookY + biteDrop + (struggling ? Math.cos(collection.timer / 110) * 9 : collection.phase === "waiting" ? Math.sin(collection.timer / 70) * 4 : 0);
          }
          this.line(lsRodTipX, lsRodTipY, fishX, fishY2, 2, C.ink);
          this.circle(fishX, fishY2, 8, C.orange);
          if (struggling) {
            this.fish(fishX + 15, fishY2 + 36, 27, false);
            this.text("绿色区按住收线 松开放线", 600, 170, 18, C.cream, "center");
          }
          if (collection.phase === "fishCaught") {
            var caughtT = Math.min(1, collection.timer / 850);
            this.fish(460 + caughtT * 100, 300 - Math.sin(caughtT * Math.PI) * 150, 42, false);
            this.text("钓到了", 610, 175, 30, C.cream, "center");
          }
        } else {
          this.drawArtFishingMotion();
        }
        if (collection.phase === "fishEscaped") {
          var escapedT = Math.min(1, collection.timer / 850);
          this.paintEscapedFish(470 + escapedT * 210, 300 + escapedT * 70, 34);
          this.drawFishEscapedDialog(480, 270, 960, false);
          return;
        }
        var instruction = "按住抛竿";
        if (collection.phase === "charging") instruction = "松开甩竿";
        if (collection.phase === "waiting") instruction = "等待浮标下沉再提竿";
        if (collection.phase === "bite") instruction = "咬钩了 立即提竿";
        if (collection.phase === "reeling") instruction = "拉锯战 控制线张力";
        if (collection.phase === "idle") instruction = "选中浅滩与蚯蚓 按住抛竿";
        var landInstrY = this.uiSkinChrome ? 118 : 225;
        var landInstrColor = this.uiSkinChrome ? [0.42, 0.38, 0.34, 0.92] : C.cream;
        this.text(instruction, 600, landInstrY, 15, landInstrColor, "center");
        if (collection.phase === "charging") this.progress(350, 340, 480, collection.power, collection.power, 0.4, 0.7);
        if (collection.phase === "reeling") {
          this.progress(350, 340, 480, collection.reelProgress, collection.reelCursor, 0.35, 0.65);
          if (!this.uiSkinChrome) {
            this.text("线张力", 330, 375, 16, C.cream, "right");
            this.rect(350, 378, 480, 12, C.cream);
          } else {
            this.text("线张力", 330, 375, 16, C.ink, "right");
          }
          this.rect(350, 378, 480 * Math.min(1, collection.tension), 12, collection.tension > 0.8 ? C.red : C.honey);
        }
        if (collection.phase === "idle") this.button(520, 405, 240, 50, "按住抛竿", true);
        if (collection.phase === "charging") this.button(360, 405, 240, 50, "松开抛竿 " + Math.round(collection.power * 100) + "%", true);
        if (collection.phase === "waiting") this.button(360, 405, 240, 50, "提竿", false);
        if (collection.phase === "bite") this.button(360, 405, 240, 50, "立即提竿", true);
        if (collection.phase === "reeling") this.button(330, 405, 300, 55, collection.reelHeld ? "收线中 松开可放线" : "按住收线 松开放线", true);
      }
    },

    /**
     * 三棵可摇的椰子树。x 与 input.js 的 treeAt 一致。
     * 树根放在海岸线上沿，下面的空篮子留在底板上。
     */
    coconutArtLayout: function () {
      var W = this.width;
      var xs = this.portrait
        ? [Math.round(W * 0.276), Math.round(W * 0.5), Math.round(W * 0.724)]
        : [265, 480, 695];
      return {
        xs: xs,
        rootY: this.portrait ? 730 : 432,
        treeH: this.portrait ? 560 : 384,
        basket: this.portrait ? { x: 389, y: 748 } : { x: 756, y: 440 },
        nutH: this.portrait ? 40 : 34
      };
    },

    // 树上那串青椰的位置，相对抠图内容区。v 从上往下。
    coconutCrownUV: { u: 0.5, v: 0.32 },

    coconutTreePose: function (index) {
      var layout = this.coconutArtLayout();
      var shakes = AIGCUtils.Collection && AIGCUtils.Collection.treeShakes;
      var shake = shakes ? shakes[index] || 0 : 0;
      return {
        x: layout.xs[index],
        y: layout.rootY,
        h: layout.treeH,
        rot: shake > 0 ? Math.sin(shake / 28) * 0.11 : 0,
        shake: shake
      };
    },

    coconutCrownPoint: function (index) {
      var pose = this.coconutTreePose(index);
      var frame = this.spriteFrame("coconut_tree", 0, pose.h);
      if (!frame) return null;
      var dx = (this.coconutCrownUV.u - 0.5) * frame.w;
      var dy = -(1 - this.coconutCrownUV.v) * frame.h;
      var c = Math.cos(pose.rot);
      var s = Math.sin(pose.rot);
      return {
        x: pose.x + dx * c - dy * s,
        y: pose.y + dx * s + dy * c
      };
    },

    coconutBasketAnchor: function () {
      if (!this.artOn || !this.uiSkinChrome) return null;
      return this.coconutArtLayout().basket;
    },

    drawArtCoconutGrove: function () {
      var layout = this.coconutArtLayout();
      var shakes = (AIGCUtils.Collection && AIGCUtils.Collection.treeShakes) || [0, 0, 0];
      var order = [0, 1, 2];
      order.sort(function (a, b) { return (shakes[a] > 0 ? 1 : 0) - (shakes[b] > 0 ? 1 : 0); });
      for (var n = 0; n < order.length; n++) {
        var i = order[n];
        var pose = this.coconutTreePose(i);
        var drawn = this.paintFootSprite("coconut_tree", pose.x, pose.y, 0, pose.h, false, { rot: pose.rot });
        if (!drawn && !this.cocoTreeMiss) {
          this.cocoTreeMiss = true;
          console.warn("[CoconutArt] tree sprite missing");
        }
        if (pose.shake > 300 && this.cocoSwayLog !== i) {
          this.cocoSwayLog = i;
          var crown = this.coconutCrownPoint(i);
          console.log("[CoconutArt] sway", i, "root", pose.x, pose.y, "crown", crown ? Math.round(crown.x) + "," + Math.round(crown.y) : "missing");
        }
      }
      if (shakes[0] <= 0 && shakes[1] <= 0 && shakes[2] <= 0) this.cocoSwayLog = -1;
      var mark = (this.portrait ? "port" : "land") + ":" + layout.xs.join(",");
      if (this.cocoArtLog !== mark) {
        this.cocoArtLog = mark;
        console.log("[CoconutArt] slots", layout.xs.join(","), "rootY", layout.rootY, "basket", layout.basket.x, layout.basket.y);
      }
    },

    drawCoconut: function () {
      var W = this.width, H = this.height;
      var ct = 64, cb = H - 72, ch = cb - ct;
      var hw = Math.round(W / 2);
      var collection = AIGCUtils.Collection;
      var treeX = collection.getTreeX ? collection.getTreeX() : [Math.round(W * 0.276), Math.round(W * 0.5), Math.round(W * 0.724)];
      var groundRatio = this.portrait ? 0.72 : 0.64;
      var groundY = ct + Math.round(ch * groundRatio);
      var sandH = cb - groundY;
      if (this.uiSkinChrome && this.artOn) {
        this.drawArtCoconutGrove();
      } else if (!this.artOn) {
        this.rect(0, ct, W, groundY - ct, C.leafLight);
        this.rect(0, groundY, W, sandH, C.sand);
        for (var i = 0; i < 3; i++) {
          var shakeX = collection.treeShakes[i] > 0 ? Math.sin(collection.treeShakes[i] / 28) * 9 : 0;
          var treeScale = this.portrait ? 0.68 : 0.8;
          this.palm(treeX[i] + shakeX, ct + Math.round(ch * 0.28), treeScale);
        }
      }
      if (!this.artOn && !this.uiSkinChrome) this.text("椰林区", hw, ct + 24, 28, C.ink, "center");
      if (collection.phase !== "coconutRound") {
        var instr = "点击椰树开始采摘";
        if (this.uiSkinChrome) {
          this.text(instr, hw, ct + 76, 15, [0.45, 0.42, 0.38, 0.88], "center");
        } else {
          if (this.artOn) this.rect(hw - 190, groundY + 4, 380, 32, [0.98, 0.92, 0.79, 0.88]);
          this.text(instr, hw, groundY + 10, 17, C.ink, "center");
        }
      }
      collection.coconuts.forEach(function (coconut) {
        if (this.uiSkinChrome && this.artOn) {
          this.paintCenterSprite("coconut_green", coconut.x, coconut.y, this.coconutArtLayout().nutH, { rot: coconut.cracked ? 0 : coconut.rotation || 0 });
          return;
        }
        if (this.artOn && !coconut.cracked) {
          this.circle(coconut.x, coconut.y, coconut.golden ? 20 : 16, coconut.golden ? C.honey : C.leaf);
          this.circle(coconut.x - 4, coconut.y - 5, 5, C.cream);
        } else {
          this.coconut(coconut.x, coconut.y, coconut.cracked ? 15 : 21, coconut.golden);
          if (coconut.cracked) {
            this.line(coconut.x - 24, coconut.y - 8, coconut.x + 24, coconut.y + 8, 4, C.cream);
            this.line(coconut.x - 20, coconut.y + 12, coconut.x + 20, coconut.y - 12, 4, C.cream);
          }
        }
      }, this);
      var basketX = Math.round(W * 0.84);
      if (this.uiSkinChrome) {
        var signY = this.portrait ? ct + Math.round(ch * 0.55) : ct + Math.round(ch * 0.52);
        this.text("" + collection.caughtThisRound, basketX, signY, 17, C.ink, "center");
      } else {
        var basketY = groundY + Math.round(sandH * 0.12);
        if (!this.artOn) {
          this.rect(basketX - 75, basketY, 140, 60, C.wood);
          this.rect(basketX - 65, basketY + 6, 120, 46, C.woodLight);
          for (var basket = 0; basket < collection.basketVisual; basket++) {
            this.coconut(basketX - 60 + (basket % 5) * 22, basketY + 14 + Math.floor(basket / 5) * 20, 10);
          }
        }
        if (this.artOn) this.rect(basketX - 78, groundY - 30, 156, 30, [0.98, 0.92, 0.79, 0.9]);
        this.text("椰子筐 " + collection.caughtThisRound, basketX, groundY - 24, 17, C.ink, "center");
      }
      if (collection.phase === "coconutRound") {
        var remaining = Math.max(0, Math.ceil((collection.roundDuration - collection.timer) / 1000));
        this.text("剩余 " + remaining + " 秒", W - 24, ct + 52, 15, C.ink, "right");
      }
    },

    drawBuild: function () {
      var W = this.width, H = this.height;
      var ct = 64, cb = H - 72, ch = cb - ct;
      var hw = Math.round(W / 2);
      var game = AIGCUtils.Game;
      var swing = Math.sin(Math.min(1, game.buildAnim / 320) * Math.PI);
      var groundY = ct + Math.round(ch * 0.56);
      if (!this.artOn) {
        this.rect(0, ct, W, groundY - ct, C.sky);
        this.rect(0, groundY, W, cb - groundY, C.sand);
      }
      this.rabbit(Math.round(W * 0.2), groundY - 30, 36);
      var cx = hw, cy = Math.round(ct + ch * 0.3);
      if (game.buildStage === "chop") {
        this.text("第一步 亲手砍树", cx, ct + 24, 17, C.ink, "center");
        this.rect(cx - 28, cy + 28, 54, 164, C.wood);
        this.rect(cx - 22, cy + 34, 42, 152, [0.52, 0.36, 0.24, 1]);
        this.circle(cx, cy, 76, C.leaf);
        this.circle(cx - 38, cy - 50, 46, [0.38, 0.58, 0.32, 1]);
        this.line(Math.round(W * 0.25), groundY - 30, cx - 50 + swing * (-70), cy + 10 - swing * 60, 10, C.wood);
        this.rect(cx - 75 + swing * (-70), cy - 12 - swing * 60, 44, 26, C.woodLight);
        this.rect(cx - 118, ct + 46, 236, 16, C.wood);
        this.rect(cx - 116, ct + 48, 232 * Math.min(1, game.buildHits / 6), 12, C.honey);
      }
      if (game.buildStage === "saw") {
        this.text("第二步 把树干锯成木头", cx, ct + 24, 17, C.ink, "center");
        for (var log = 0; log < 3; log++) {
          this.rect(cx - 132, cy + 8 + log * 44, 254, 34, C.wood);
          this.rect(cx - 126, cy + 12 + log * 44, 242, 26, C.woodLight);
        }
        this.line(cx - 60 + swing * 160, cy + 20, cx - 20 + swing * 160, cy + 80, 11, [0.92, 0.88, 0.82, 1]);
        this.line(Math.round(W * 0.2), groundY - 30, cx - 80 + swing * 130, cy + 30, 9, C.wood);
      }
      if (game.buildStage === "assemble" || game.buildStage === "fire") {
        var stageLabel = game.buildStage === "assemble" ? "第三步 动手搭建烤鱼店" : "最后一步 整理烤鱼篝火";
        this.text(stageLabel, cx, ct + 24, 24, C.ink, "center");
        var assembled = game.buildStage === "fire" ? 4 : game.buildHits;
        this.rect(cx - 200, groundY - 26, 390, 40, C.woodLight);
        if (assembled >= 1) this.rect(cx - 180, cy + 20, 22, 165, C.wood);
        if (assembled >= 2) this.rect(cx + 155, cy + 20, 22, 165, C.wood);
        if (assembled >= 3) this.tri(cx - 215, cy + 30, cx, cy - 45, cx + 215, cy + 30, C.paper);
        if (assembled >= 4) {
          this.rect(cx - 110, cy + 40, 200, 52, C.paper);
          this.text("烤鱼店", cx, cy + 56, 22, C.ink, "center");
        }
        if (game.buildStage === "assemble") this.line(Math.round(W * 0.2), groundY - 30, cx - 110, groundY - 55 - swing * 80, 8, C.woodLight);
      }
      if (game.buildStage === "fire") {
        for (var stone = 0; stone < 8; stone++) {
          var angle = stone / 8 * Math.PI * 2;
          this.circle(cx + Math.cos(angle) * 48, groundY - 16 + Math.sin(angle) * 18, 12, C.brown);
        }
        this.line(cx - 35, groundY - 16, cx + 35, groundY - 32, 11, C.wood);
        this.line(cx - 35, groundY - 32, cx + 35, groundY - 16, 11, C.wood);
        if (game.buildHits > 0) this.tri(cx, groundY - 16 - 55 - swing * 16, cx - 28, groundY - 16, cx + 28, groundY - 16, C.orange);
      }
      var labels = { chop: "砍树", saw: "锯木", assemble: "搭建", fire: "生火" };
      var totals = { chop: 3, saw: 3, assemble: 4, fire: 2 };
      this.button(cx - 110, cb - 68, 220, 54, labels[game.buildStage] + " " + game.buildHits + "/" + totals[game.buildStage], true);
    },

    drawCustomerOrderBubble: function (cx, top, customer, ready, anchor) {
      var L = AIGCUtils.ShopLayout || {};
      var skinBubble = this.uiSkinChrome && this.artOn;
      anchor = anchor || {};
      var bw = skinBubble && anchor.bw ? anchor.bw : 188;
      var bh = skinBubble && anchor.bh ? anchor.bh : 72;
      var bubbleCx =
        skinBubble && anchor.cx
          ? anchor.cx > 0 && anchor.cx <= 1
            ? Math.round(this.width * anchor.cx)
            : anchor.cx
          : cx;
      var bx = bubbleCx - Math.round(bw / 2);
      var by = typeof (skinBubble && anchor.top) === "number" ? anchor.top : typeof top === "number" ? top : 0;
      var lineSize = skinBubble ? (this.portrait ? 12 : 13) : 12;
      var iconSize = skinBubble ? (this.portrait ? 24 : 28) : 26;
      var bubbleKey = "order-bubble";
      if (skinBubble && !this.portrait && this.scenes["order-bubble-skin-land"]) {
        bubbleKey = "order-bubble-skin-land";
      }
      if (this.scenes[bubbleKey]) {
        this.paintUiStretch(bubbleKey, bx, by, bw, bh);
        this.flush();
      } else if (!skinBubble) {
        this.rect(bx, by, bw, bh, C.paper);
        this.rect(bx + 3, by + 3, bw - 6, bh - 6, C.cream);
      }
      if (customer.leaving) {
        if (!skinBubble) this.text("谢谢光临", cx, by + Math.round(bh / 2), 14, C.green, "center");
        return;
      }
      var rowFishY;
      var rowJuiceY;
      if (skinBubble) {
        if (this.portrait) {
          var ct = 64;
          var custH = anchor.custH || Math.round((this.height - 136) * 0.47);
          rowFishY = ct + Math.round(custH * (anchor.rowFishFrac || 0.21));
          rowJuiceY = ct + Math.round(custH * (anchor.rowJuiceFrac || 0.28));
        } else {
          var midLine = anchor.rowFishY && anchor.rowJuiceY
            ? Math.round((anchor.rowFishY + anchor.rowJuiceY) / 2)
            : anchor.top + 36;
          rowFishY = anchor.rowFishY || anchor.top + 26;
          rowJuiceY = anchor.rowJuiceY || anchor.top + 50;
          if (customer.order.fish > 0 && customer.order.juice <= 0) rowFishY = midLine;
          if (customer.order.juice > 0 && customer.order.fish <= 0) rowJuiceY = midLine;
        }
      } else {
        rowFishY = by + 26;
        rowJuiceY = by + 50;
      }
      var self = this;
      if (customer.order.fish > 0) {
        var species = AIGCUtils.Recipes.getFishSpecies(customer.order.speciesId);
        var fishLine = species.name + "烤鱼×" + customer.order.fish;
        this.drawOrderRow(bubbleCx, rowFishY, lineSize, fishLine, iconSize, function (ix, iy) {
          self.paintGrilledIcon(customer.order.speciesId, ix, iy, iconSize);
        });
      }
      if (customer.order.juice > 0) {
        var juiceLine = "椰子汁×" + customer.order.juice;
        var jy = customer.order.fish > 0 ? rowJuiceY : rowFishY;
        this.drawOrderRow(bubbleCx, jy, lineSize, juiceLine, iconSize, function (ix, iy) {
          self.paintCoconutIcon("green_juiced", ix, iy, iconSize);
        });
      }
      if (!skinBubble) {
        var hint = ready ? "点击交付" : "等餐中";
        this.text(hint, cx, by + bh - 10, 11, ready ? C.green : C.orange, "center");
      }
    },

    drawOrderCustomer: function (customer, x, y) {
      var missing = AIGCUtils.Selling.getMissing(customer);
      var ready = missing.fish === 0 && missing.juice === 0;
      this.rect(x, y, 300, 140, C.cream);
      this.rect(x, y, 6, 140, customer.leaving ? C.green : C.woodLight);
      var slide = customer.arrival + (customer.leaving ? customer.leaveTimer * 0.65 : 0);
      var animalX = x + 52 + slide;
      var animalColor = customer.type === "cat" ? C.honey : customer.type === "rabbit" ? C.white : customer.type === "bear" ? C.woodLight : C.fish;
      this.ellipse(animalX, y + 91, 31, 35, animalColor);
      this.circle(animalX, y + 55, 30, animalColor);
      this.circle(animalX - 20, y + 32, 10, animalColor);
      this.circle(animalX + 20, y + 32, 10, animalColor);
      this.circle(animalX - 10, y + 52, 3, C.ink, 8);
      this.circle(animalX + 10, y + 52, 3, C.ink, 8);
      if (customer.leaving) {
        this.text("谢谢 欢迎再来", x + 190, y + 54, 19, C.green, "center");
        return;
      }
      var line = 0;
      if (customer.order.fish > 0) {
        if (this.uiSkinChrome) this.paintFishIcon(customer.order.speciesId, x + 125, y + 40, 28);
        else this.fish(x + 125, y + 38, 19, true, customer.order.speciesId);
        this.text("×" + customer.order.fish, x + 155, y + 24, 20, C.ink);
        line++;
      }
      if (customer.order.juice > 0) {
        this.juice(x + 125, y + 38 + line * 34, 25);
        this.text("×" + customer.order.juice, x + 155, y + 24 + line * 34, 20, C.ink);
      }
      this.text(ready ? "点击交付" : "等餐中", x + 105, y + 98, 17, ready ? C.green : C.orange);
    },

    shopPoint: function (slot) {
      if (!slot) return { x: 0, y: 0, headDx: 0, headDy: 0 };
      if (this.portrait) {
        return {
          x: slot.x * this.width,
          y: slot.y * this.height,
          headDx: (slot.headDx || 0) * this.width,
          headDy: (slot.headDy || 0) * this.height,
          id: slot.id
        };
      }
      return { x: slot.x, y: slot.y, headDx: slot.headDx || 0, headDy: slot.headDy || 0, id: slot.id };
    },

    spriteFrame: function (key, targetW, targetH) {
      if (!this.scenes[key]) {
        if (!this.sceneLoading[key] && !this.missingShopSprites[key]) {
          this.missingShopSprites[key] = true;
          console.warn("[ShopLayout] sprite missing", key);
        }
        return null;
      }
      var trimMap = AIGCUtils.AssetSprites && AIGCUtils.AssetSprites.trim;
      var trim = (trimMap && trimMap[key]) || [0, 0, 1, 1];
      var aspect = this.sceneAspect[key] || 1;
      var du = trim[2] - trim[0];
      var dv = trim[3] - trim[1];
      if (du <= 0 || dv <= 0) return null;
      var contentAspect = aspect * du / dv;
      var w;
      var h;
      if (targetH) {
        h = targetH;
        w = h * contentAspect;
      } else {
        w = targetW || 64;
        h = w / contentAspect;
      }
      return { w: w, h: h, u0: trim[0], v0: trim[1], u1: trim[2], v1: trim[3] };
    },

    paintTexturedQuad: function (key, x, y, w, h, u0, v0, u1, v1, rot, pivotX, pivotY) {
      if (!this.scenes[key] || w <= 0 || h <= 0) return false;
      this.useTexture(this.scenes[key]);
      var white = [1, 1, 1, 1];
      var pts = [
        [x, y, u0, v0],
        [x + w, y, u1, v0],
        [x, y + h, u0, v1],
        [x + w, y + h, u1, v1]
      ];
      if (rot) {
        var c = Math.cos(rot);
        var s = Math.sin(rot);
        for (var i = 0; i < 4; i++) {
          var dx = pts[i][0] - pivotX;
          var dy = pts[i][1] - pivotY;
          pts[i][0] = pivotX + dx * c - dy * s;
          pts[i][1] = pivotY + dx * s + dy * c;
        }
      }
      this.vertex(pts[0][0], pts[0][1], white, pts[0][2], pts[0][3], 2);
      this.vertex(pts[1][0], pts[1][1], white, pts[1][2], pts[1][3], 2);
      this.vertex(pts[2][0], pts[2][1], white, pts[2][2], pts[2][3], 2);
      this.vertex(pts[1][0], pts[1][1], white, pts[1][2], pts[1][3], 2);
      this.vertex(pts[3][0], pts[3][1], white, pts[3][2], pts[3][3], 2);
      this.vertex(pts[2][0], pts[2][1], white, pts[2][2], pts[2][3], 2);
      return true;
    },

    paintFootSprite: function (key, footX, footY, targetW, targetH, flip, motion) {
      motion = motion || {};
      var frame = this.spriteFrame(key, targetW, targetH);
      if (!frame) return null;
      var scaleY = motion.scaleY == null ? 1 : motion.scaleY;
      var drawH = frame.h * Math.max(0, scaleY);
      var x = footX - frame.w / 2;
      var y = footY - drawH;
      if (drawH < 0.4) return { x: x, y: footY, w: frame.w, h: 0 };
      var u0 = frame.u0;
      var u1 = frame.u1;
      if (flip) {
        var swap = u0;
        u0 = u1;
        u1 = swap;
      }
      var pivotY = motion.pivot === "center" ? y + drawH / 2 : footY;
      if (!this.paintTexturedQuad(key, x, y, frame.w, drawH, u0, frame.v0, u1, frame.v1, motion.rot || 0, footX, pivotY)) return null;
      this.flush();
      return { x: x, y: y, w: frame.w, h: drawH };
    },

    paintCenterSprite: function (key, cx, cy, targetH, motion) {
      motion = motion || {};
      var frame = this.spriteFrame(key, 0, targetH);
      if (!frame) return null;
      var scaleY = motion.scaleY == null ? 1 : motion.scaleY;
      var drawH = frame.h * Math.max(0, scaleY);
      var x = cx - frame.w / 2;
      var y = cy - drawH / 2;
      if (drawH < 0.4) return { x: x, y: cy, w: frame.w, h: 0 };
      if (!this.paintTexturedQuad(key, x, y, frame.w, drawH, frame.u0, frame.v0, frame.u1, frame.v1, motion.rot || 0, cx, cy)) return null;
      this.flush();
      return { x: x, y: y, w: frame.w, h: drawH };
    },

    customerSlidePoint: function (slotPoint, customer) {
      var span = Math.max(24, this.width + 40 - slotPoint.x);
      var enter = Math.max(0, Math.min(1, (customer.arrival || 0) / 320));
      var leave = customer.leaving ? Math.max(0, Math.min(1, (customer.leaveTimer || 0) / 1100)) : 0;
      var along = customer.leaving ? Math.max(enter, leave) : enter;
      return {
        x: slotPoint.x + span * along,
        y: slotPoint.y,
        headDx: slotPoint.headDx || 0,
        headDy: slotPoint.headDy || 0,
        id: slotPoint.id
      };
    },

    grillNet: function (box) {
      return {
        x: box.x + box.w * 0.5,
        y: box.y + box.h * 0.28
      };
    },

    drawArtStokeFlames: function (box) {
      var x = box.x + box.w * 0.5;
      var baseY = box.y + box.h;
      var now = Date.now();
      var fh = box.h * 0.24 + Math.sin(now / 200) * box.h * 0.05 + Math.sin(now / 137) * box.h * 0.03;
      var fw = box.w * 0.11 + Math.sin(now / 160 + 1) * box.w * 0.02;
      this.tri(x, baseY - fh, x - fw, baseY, x + fw, baseY, C.orange);
      var fh2 = fh * 0.65 + Math.sin(now / 115 + 2) * box.h * 0.03;
      this.tri(x + fw * 0.1, baseY - fh2, x - fw * 0.5, baseY, x + fw * 0.55, baseY, C.honey);
      if (this.artFlameLog !== "stoke") {
        this.artFlameLog = "stoke";
        console.log("[ShopLayout] stoke flame at grill bottom", Math.round(x), Math.round(baseY));
      }
    },

    drawArtGrillFish: function (current, box, slideAmp) {
      var phase = Date.now() / 160;
      var slide = current.stage === "flip" ? Math.sin(phase) * slideAmp : 0;
      var scaleY = current.stage === "flip" ? Math.abs(Math.cos(phase)) : 1;
      var net = this.grillNet(box);
      var fishH = Math.max(28, Math.round(box.h * 0.4));
      var speciesId = AIGCUtils.Recipes.normalizeSpeciesId(current.speciesId);
      var key = "grilled_" + speciesId;
      this.paintCenterSprite(key, net.x + slide, net.y, fishH, { scaleY: scaleY });
      var mark = current.stage + ":" + speciesId;
      if (this.artGrillLog !== mark) {
        this.artGrillLog = mark;
        console.log("[ShopLayout] grill fish", current.stage, key, "net", Math.round(net.x), Math.round(net.y), "scaleY", scaleY.toFixed(2), "slide", Math.round(slide));
      }
      this.shopNet = { x: net.x, y: net.y, scaleY: scaleY, slide: slide, key: key, stage: current.stage };
    },

    drawArtJuice: function (current) {
      if (!current || !this.shopJuicerPoint) return false;
      var juiced = current.taps >= 3 || current.stage === "straw";
      var key = juiced ? "coconut_green_juiced" : "coconut_green";
      var hitProgress = current.hitTimer > 0 ? 1 - current.hitTimer / 260 : 1;
      var shake = current.hitTimer > 0 ? Math.sin(hitProgress * Math.PI * 3) * 4 : 0;
      var h = this.portrait ? 84 : 108;
      this.paintFootSprite(key, this.shopJuicerPoint.x + shake, this.shopJuicerPoint.y, 0, h, false);
      var mark = key + ":" + current.taps + ":" + current.stage;
      if (this.artJuiceLog !== mark) {
        this.artJuiceLog = mark;
        console.log("[ShopLayout] juice sprite", key, "taps", current.taps, "stage", current.stage, "shake", Math.round(shake));
      }
      this.shopJuice = { key: key, taps: current.taps, stage: current.stage, shake: shake };
      return true;
    },

    drawArtFishFlight: function (plating, t) {
      if (!this.shopGrillBox || !AIGCUtils.ShopLayout) return false;
      var board = this.portrait ? AIGCUtils.ShopLayout.port : AIGCUtils.ShopLayout.land;
      if (!board || !board.plates) return false;
      var speciesId = AIGCUtils.Recipes.normalizeSpeciesId(plating.speciesId);
      var slot = null;
      for (var i = 0; i < board.plates.length; i++) {
        if (board.plates[i].id === speciesId) slot = board.plates[i];
      }
      if (!slot) return false;
      var end = this.shopPoint(slot);
      var net = this.grillNet(this.shopGrillBox);
      var h = this.portrait ? 20 : 38;
      var key = "grilled_" + speciesId;
      var frame = this.spriteFrame(key, 0, h);
      if (!frame) return false;
      var startY = net.y + frame.h / 2;
      var x = net.x + (end.x - net.x) * t;
      var y = startY + (end.y - startY) * t - Math.sin(t * Math.PI) * 65;
      this.paintFootSprite(key, x, y, 0, h, false);
      this.shopFlight = {
        key: key,
        t: t,
        x: x,
        y: y,
        netX: net.x,
        netY: net.y,
        endX: end.x,
        endY: end.y
      };
      if (this.artFlightLog !== key) {
        this.artFlightLog = key;
        console.log("[ShopLayout] plate flight", key, "net", Math.round(net.x), Math.round(net.y), "anchor", Math.round(end.x), Math.round(end.y));
      }
      return true;
    },

    drawShopOrderBubble: function (customer, foot) {
      var headX = foot.x + (foot.headDx || 0);
      var headY = foot.y + (foot.headDy || 0);
      var fishN = customer.leaving ? 0 : (customer.order.fish || 0);
      var juiceN = customer.leaving ? 0 : (customer.order.juice || 0);
      var lines = [];
      if (customer.leaving) {
        lines.push({ text: "谢谢光临", kind: "bye" });
      } else {
        if (fishN > 0) {
          var species = AIGCUtils.Recipes.getFishSpecies(customer.order.speciesId);
          lines.push({ text: species.name + "烤鱼×" + fishN, kind: "fish" });
        }
        if (juiceN > 0) lines.push({ text: "椰子汁×" + juiceN, kind: "juice" });
      }
      if (!lines.length) return;
      var font = this.portrait ? 12 : 13;
      var icon = this.portrait ? 22 : 24;
      var widest = 0;
      for (var li = 0; li < lines.length; li++) {
        var extra = lines[li].kind === "bye" ? 0 : icon + 6;
        widest = Math.max(widest, extra + this.textWidth(lines[li].text, font));
      }
      var lineH = font + 18;
      var bw = Math.max(this.portrait ? 168 : 188, Math.round(widest / 0.76));
      var bh = Math.max(this.portrait ? 64 : 68, Math.round(lines.length * lineH / 0.56));
      var padTop = Math.round(bh * 0.16);
      var bx = Math.round(headX - bw / 2);
      var by = Math.round(headY - bh);
      if (!this.paintUiStretch("order-bubble", bx, by, bw, bh)) {
        if (!this.missingShopSprites["order-bubble"]) {
          this.missingShopSprites["order-bubble"] = true;
          console.warn("[ShopLayout] order bubble missing");
        }
        return;
      }
      this.flush();
      var ccx = bx + bw * 0.5;
      var textLeft = ccx - widest / 2;
      var textRight = ccx + widest / 2;
      var textTop = by + padTop;
      var textBottom = textTop + lines.length * lineH;
      var inside = textLeft >= bx + 4 && textRight <= bx + bw - 4 && textBottom <= by + bh - 4;
      if (!this.shopBubbles) this.shopBubbles = [];
      this.shopBubbles.push({
        x: bx, y: by, w: bw, h: bh,
        headX: headX, headY: headY,
        textLeft: textLeft, textRight: textRight, textTop: textTop, textBottom: textBottom,
        inside: inside,
        customerId: customer.id
      });
      if (!inside && !this.bubbleFitWarned) {
        this.bubbleFitWarned = true;
        console.warn("[ShopLayout] order text outside bubble", customer.id, Math.round(textLeft), Math.round(textRight), bx, bx + bw);
      }
      var self = this;
      for (var row = 0; row < lines.length; row++) {
        var line = lines[row];
        var cy = textTop + lineH * row + lineH / 2;
        if (line.kind === "bye") {
          this.text(line.text, ccx, this.textYInBox(line.text, font, cy - lineH / 2, lineH), font, C.green, "center");
        } else if (line.kind === "fish") {
          this.drawOrderRow(ccx, cy, font, line.text, icon, function (ix, iy) {
            self.paintGrilledIcon(customer.order.speciesId, ix, iy, icon);
          });
        } else {
          this.drawOrderRow(ccx, cy, font, line.text, icon, function (ix, iy) {
            self.paintCoconutIcon("green_juiced", ix, iy, icon);
          });
        }
      }
    },

    drawShopPlates: function () {
      var L = AIGCUtils.ShopLayout;
      var board = this.portrait ? L.port : L.land;
      var plates = (board && board.plates) || [];
      var goods = AIGCUtils.GameState.bakedGoods;
      var height = this.portrait ? 20 : 38;
      for (var i = 0; i < plates.length; i++) {
        var plate = plates[i];
        var count = goods.filter(function (good) {
          return good.recipeId === "fish_grilled" && good.speciesId === plate.id;
        }).length;
        if (!count) continue;
        var anchor = this.shopPoint(plate);
        var placed = this.paintFootSprite("grilled_" + plate.id, anchor.x, anchor.y, 0, height, false);
        if (count > 1) {
          var labelX = placed ? placed.x + placed.w + 2 : anchor.x + 16;
          var labelY = placed ? placed.y + placed.h * 0.35 : anchor.y - 14;
          this.text("×" + count, labelX, labelY, this.portrait ? 12 : 13, C.ink, "left");
        }
      }
    },

    drawShopCast: function () {
      var L = AIGCUtils.ShopLayout;
      if (!L) return;
      var board = this.portrait ? L.port : L.land;
      if (!board) return;
      var grill = this.shopPoint(board.grill);
      var grillW = this.portrait ? Math.round(this.width * 0.32) : 164;
      this.shopGrillBox = this.paintFootSprite(L.grillKey(), grill.x, grill.y, grillW, 0, false);
      var rabbit = this.shopPoint(board.rabbit);
      var rabbitH = this.portrait ? Math.round(this.height * 0.13) : 124;
      var bakingNow = AIGCUtils.Baking;
      var rabbitRot = 0;
      if (bakingNow && bakingNow.current && bakingNow.current.recipeId === "fish_grilled" && bakingNow.current.stage === "flip") {
        rabbitRot = Math.sin(Date.now() / 160) * 0.22;
      }
      this.paintFootSprite("hero_rabbit_grill", rabbit.x, rabbit.y, 0, rabbitH, true, { rot: rabbitRot });
      var customers = board.customers || [];
      var queue = (AIGCUtils.Selling && AIGCUtils.Selling.queue) || [];
      var customerH = this.portrait ? Math.round(this.height * 0.12) : 116;
      for (var i = 0; i < customers.length && i < queue.length; i++) {
        var point = this.shopPoint(customers[i]);
        var slid = this.customerSlidePoint(point, queue[i]);
        this.paintFootSprite(L.customerSpriteKey(queue[i]), slid.x, slid.y, 0, customerH, false);
        this.drawShopOrderBubble(queue[i], slid);
        var motionKey = queue[i].id + ":" + (queue[i].leaving ? "out" : "in");
        if ((queue[i].arrival > 300 || queue[i].leaving) && this.customerMotionLog !== motionKey) {
          this.customerMotionLog = motionKey;
          console.log("[ShopLayout] customer", queue[i].leaving ? "leave" : "arrive", queue[i].id, "slot", i, "x", Math.round(slid.x), "foot", Math.round(point.x));
        }
      }
      this.shopJuicerPoint = this.shopPoint(board.juicer);
      if (!this.shopArtLogged) {
        this.shopArtLogged = true;
        console.log("[ShopLayout] art slots", this.portrait ? "port" : "land", JSON.stringify(board));
      }
    },

    drawReadyGoods: function () {
      if (this.uiSkinChrome && this.artOn && AIGCUtils.ShopLayout) {
        this.drawShopPlates();
        return;
      }
      var W = this.width, H = this.height;
      var goods = AIGCUtils.GameState.bakedGoods;
      var juiceGoods = goods.filter(function (good) { return good.recipeId === "coconut_juice"; });
      var plateY = H - 72 - 75;
      var startX = this.portrait ? 10 : 65;
      var stepX = this.portrait ? Math.round((W - 20) / AIGCUtils.FishSpecies.length) : 90;
      var labelColor = this.uiSkinChrome ? C.ink : C.cream;
      for (var plate = 0; plate < AIGCUtils.FishSpecies.length; plate++) {
        var plateX = startX + plate * stepX + Math.round(stepX / 2);
        var species = AIGCUtils.FishSpecies[plate];
        var fishGoods = goods.filter(function (good) {
          return good.recipeId === "fish_grilled" && good.speciesId === species.id;
        });
        if (!fishGoods.length) continue;
        if (!this.uiSkinChrome) {
          this.ellipse(plateX, plateY + 25, 28, 9, C.cream);
          var visible = Math.min(3, fishGoods.length);
          for (var fishIndex = 0; fishIndex < visible; fishIndex++) {
            this.fish(plateX - (visible - 1) * 10 + fishIndex * 20, plateY + 14 - fishIndex * 3, 14, true, species.id);
          }
        } else {
          this.paintGrilledIcon(species.id, plateX, plateY + 12, 28);
        }
        if (fishGoods.length > 1) this.text("×" + fishGoods.length, plateX + 18, plateY - 4, 12, labelColor, "center");
      }
      if (this.uiSkinChrome) return;
      var juiceStartX = this.portrait ? Math.round(W * 0.6) : 455;
      for (var juice = 0; juice < Math.min(3, juiceGoods.length); juice++) {
        var juiceX = juiceStartX + juice * (this.portrait ? 44 : 58);
        this.ellipse(juiceX, plateY + 22, 20, 7, C.cream);
        this.juice(juiceX, plateY + 5, 22);
        this.text("椰子汁", juiceX, plateY + 34, 11, C.ink, "center");
      }
    },

    drawPlating: function () {
      var W = this.width, H = this.height;
      var plating = AIGCUtils.Baking.plating;
      if (!plating) return;
      var t = Math.min(1, plating.timer / 750);
      var isFish = plating.recipeId === "fish_grilled";
      var hw = Math.round(W / 2);
      // 出餐动画：从烤制区飞向成品区
      var startX = this.portrait ? Math.round(W * 0.25) : 210;
      var startY = this.portrait ? Math.round(H * 0.55) : 235;
      var endX = this.portrait ? Math.round(W * 0.3) : 200;
      var endY = H - 72 - 75;
      if (!isFish) {
        startX = this.portrait ? Math.round(W * 0.75) : 520;
        endX = this.portrait ? Math.round(W * 0.65) : 520;
      }
      if (this.uiSkinChrome && this.artOn && AIGCUtils.ShopLayout) {
        var plateBoard = this.portrait ? AIGCUtils.ShopLayout.port : AIGCUtils.ShopLayout.land;
        if (isFish && plateBoard && plateBoard.plates) {
          var plateIndex = 0;
          for (var pi = 0; pi < AIGCUtils.FishSpecies.length; pi++) {
            if (AIGCUtils.FishSpecies[pi].id === plating.speciesId) plateIndex = pi;
          }
          var plateAnchor = this.shopPoint(plateBoard.plates[plateIndex]);
          endX = plateAnchor.x;
          endY = plateAnchor.y - 18;
          if (this.shopGrillBox) {
            startX = this.shopGrillBox.x + this.shopGrillBox.w / 2;
            startY = this.shopGrillBox.y + this.shopGrillBox.h * 0.3;
          }
        } else if (!isFish && this.shopJuicerPoint) {
          startX = this.shopJuicerPoint.x;
          startY = this.shopJuicerPoint.y - 36;
          endX = this.shopJuicerPoint.x;
          endY = this.shopJuicerPoint.y - 18;
        }
      }
      var x = startX + (endX - startX) * t;
      var y = startY + (endY - startY) * t - Math.sin(t * Math.PI) * 65;
      var artFlight = isFish && this.uiSkinChrome && this.artOn && this.drawArtFishFlight(plating, t);
      if (isFish && !artFlight) this.fish(x, y, 27, true, plating.speciesId);
      if (!isFish) {
        if (this.uiSkinChrome && this.artOn) this.paintCenterSprite("coconut_green_juiced", x, y, this.portrait ? 52 : 70, {});
        else this.juice(x, y, 40);
      }
      this.text(plating.title, isFish ? startX : (this.portrait ? Math.round(W * 0.75) : 520), Math.round(H * 0.2), 18, isFish ? C.cream : C.ink, "center");
    },

    drawShop: function () {
      this.shopGrillBox = null;
      this.shopJuicerPoint = null;
      this.shopBubbles = [];
      this.shopFlight = null;
      if (this.uiSkinChrome && this.artOn) this.drawShopCast();
      var W = this.width, H = this.height;
      var ct = 64, cb = H - 72, ch = cb - ct;
      var hw = Math.round(W / 2);
      var baking = AIGCUtils.Baking;
      var state = AIGCUtils.GameState;

      if (this.portrait) {
        // ── 竖屏商店布局：顾客区上（面朝玩家），厨房区下 ──
        var custH = Math.round(ch * 0.47);
        var custBottom = ct + custH;   // ~451
        var kitchenY = custBottom + 14;
        var kitchenH = Math.round(ch * 0.38);
        var hw2 = Math.round(W / 2);
        var slotW = hw2;

        if (!this.artOn) {
          this.rect(0, ct, W, custH, C.paper);
          this.rect(0, custBottom, W, 14, C.wood);
          this.rect(0, kitchenY, W, kitchenH, C.sky);
          this.rect(0, kitchenY + Math.round(kitchenH * 0.58), W, Math.round(kitchenH * 0.42), C.sand);
        }

        // ── 顾客区（面朝玩家，第一人称视角）──
        var queue = AIGCUtils.Selling.queue;
        for (var qi = 0; qi < Math.min(2, queue.length); qi++) {
          var customer2 = queue[qi];
          var missing2 = AIGCUtils.Selling.getMissing(customer2);
          var ready2 = missing2.fish === 0 && missing2.juice === 0;
          if (this.uiSkinChrome && this.artOn) {
            var skinCustomers = (AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.port && AIGCUtils.ShopLayout.port.customers) || [];
            var skinP = skinCustomers[qi] ? this.customerSlidePoint(this.shopPoint(skinCustomers[qi]), customer2) : { x: Math.round(W / 2), y: custBottom };
            var stTextS = customer2.leaving ? "完成" : (ready2 ? "点击交付" : "等餐中");
            var stColorS = customer2.leaving || ready2 ? C.green : C.orange;
            this.text(stTextS, Math.round(skinP.x), Math.round(skinP.y + 14), 15, stColorS, "center");
            continue;
          }
          var portBubbles = (AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.orderBubblePort) || [];
          var anchorP = portBubbles[qi] || portBubbles[0] || { cx: 0.34, rowFishFrac: 0.21, rowJuiceFrac: 0.28 };
          var cx2 = anchorP.cx > 0 && anchorP.cx <= 1 ? Math.round(W * anchorP.cx) : anchorP.cx;
          var animalColor = customer2.type === "cat" ? C.honey : customer2.type === "rabbit" ? C.white : customer2.type === "bear" ? C.woodLight : C.fish;
          var sz = Math.round(custH * 0.15);
          var headY2 = ct + Math.round(custH * 0.61);
          var bodyY2 = ct + Math.round(custH * 0.78);
          if (!this.uiSkinChrome) {
            this.ellipse(cx2, bodyY2, sz * 0.78, sz * 0.88, animalColor);
            this.circle(cx2, headY2, sz, animalColor);
            this.circle(cx2 - sz * 0.52, headY2 - sz * 0.72, sz * 0.3, animalColor);
            this.circle(cx2 + sz * 0.52, headY2 - sz * 0.72, sz * 0.3, animalColor);
            this.circle(cx2 - sz * 0.27, headY2 - sz * 0.1, sz * 0.11, C.ink, 12);
            this.circle(cx2 + sz * 0.27, headY2 - sz * 0.1, sz * 0.11, C.ink, 12);
            this.circle(cx2, headY2 + sz * 0.26, sz * 0.08, C.orange, 10);
          }
          var anchorDraw = {};
          for (var ak in anchorP) if (anchorP.hasOwnProperty(ak)) anchorDraw[ak] = anchorP[ak];
          anchorDraw.custH = custH;
          anchorDraw.cx = anchorP.cx;
          this.drawCustomerOrderBubble(cx2, ct, customer2, ready2, anchorDraw);
          // 状态标签（柜台边缘）
          var stText = customer2.leaving ? "完成" : (ready2 ? "点击交付" : "等餐中");
          var stColor = customer2.leaving ? C.green : (ready2 ? C.green : C.orange);
          this.text(stText, cx2, custBottom - 42, 17, stColor, "center");
        }
        // 金币飘字
        for (var me = 0; me < AIGCUtils.Selling.moneyEffects.length; me++) {
          var money = AIGCUtils.Selling.moneyEffects[me];
          var alpha = 1 - money.timer / 1100;
          var mx2 = money.slot % 2 === 0 ? Math.round(slotW * 0.5) : Math.round(slotW + slotW * 0.5);
          var my2 = custBottom - 40 - money.timer * 0.04;
          if (this.uiSkinChrome && this.artOn && AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.port) {
            var portSlot = (AIGCUtils.ShopLayout.port.customers || [])[money.slot];
            if (portSlot) {
              var portP = this.shopPoint(portSlot);
              mx2 = portP.x;
              my2 = portP.y + portP.headDy - money.timer * 0.04;
            }
          }
          this.text("+" + money.amount, mx2, my2, 22, [0.42, 0.67, 0.34, alpha], "center");
        }

        // ── 厨房区（下方，烤制2/3宽 / 椰子汁1/3宽）──
        var kitchenW = Math.round(W * 2 / 3);   // ~360px
        var juiceW = W - kitchenW;               // ~180px
        var furnaceX = Math.round(kitchenW * 0.47), furnaceY = kitchenY + Math.round(kitchenH * 0.48);
        if (!this.artOn) this.rect(0, kitchenY, kitchenW, kitchenH, C.woodLight);
        if (!this.uiSkinChrome) this.text("烤鱼区 · 厨房", Math.round(kitchenW / 2), kitchenY + 14, 14, C.cream, "center");
        var grillY = furnaceY + 40, grillW = Math.round(kitchenW * 0.75);
        if (this.shopGrillBox) {
          furnaceX = Math.round(this.shopGrillBox.x + this.shopGrillBox.w / 2);
          grillY = Math.round(this.shopGrillBox.y + this.shopGrillBox.h * 0.58);
        }
        if (!this.artOn) {
          this.circle(furnaceX, furnaceY, 38, C.brown);
          this.rect(furnaceX - grillW / 2 - 4, grillY - 9, grillW + 8, 6, C.woodLight);
          var grillBars = Math.round(grillW / 18);
          for (var gbi = 0; gbi < grillBars; gbi++) {
            var barX = furnaceX - grillW / 2 + 8 + gbi * Math.round((grillW - 16) / Math.max(1, grillBars - 1));
            this.line(barX, grillY - 9, barX, grillY - 3, 3, C.wood);
          }
          this.rect(furnaceX - grillW / 2, grillY, grillW, 18, C.wood);
          this.rect(furnaceX - grillW / 2 + 4, grillY + 4, grillW - 8, 10, C.brown);
          this.line(furnaceX - grillW / 2 + 6, grillY + 18, furnaceX - grillW / 2 - 3, grillY + 36, 5, C.wood);
          this.line(furnaceX + grillW / 2 - 6, grillY + 18, furnaceX + grillW / 2 + 3, grillY + 36, 5, C.wood);
        }
        // 原画层：火在烤架精灵下沿，鱼贴烤网中心。矢量层仍相对旧烤架面。
        var artFishPort = this.uiSkinChrome && this.artOn && this.shopGrillBox && baking.current && baking.current.recipeId === "fish_grilled";
        if (artFishPort) {
          if (baking.current.stage === "stoke") this.drawArtStokeFlames(this.shopGrillBox);
          if (baking.current.stage === "cooking" || baking.current.stage === "flip") this.drawArtGrillFish(baking.current, this.shopGrillBox, 16);
        } else {
          var flameNow = Date.now();
          var flameBase = baking.current && baking.current.recipeId === "fish_grilled" && baking.current.perfectFire ? 34 : 19;
          if (this.artOn && !(baking.current && baking.current.recipeId === "fish_grilled")) flameBase = 0;
          var fh = flameBase + Math.sin(flameNow / 200) * 6 + Math.sin(flameNow / 137) * 3;
          var fw = 14 + Math.sin(flameNow / 160 + 1) * 3;
          var flameBaseY = grillY - 9;
          if (flameBase > 0) {
            this.tri(furnaceX, flameBaseY - fh, furnaceX - fw, flameBaseY, furnaceX + fw, flameBaseY, C.orange);
            var fh2 = fh * 0.65 + Math.sin(flameNow / 115 + 2) * 3;
            this.tri(furnaceX + fw * 0.1, flameBaseY - fh2, furnaceX - fw * 0.5, flameBaseY, furnaceX + fw * 0.55, flameBaseY, C.honey);
          }
          if (baking.current && baking.current.recipeId === "fish_grilled") {
            var flipLift = baking.current.stage === "flip" ? Math.abs(Math.sin(Date.now() / 160)) * 26 : 0;
            var flipSlide = baking.current.stage === "flip" ? Math.sin(Date.now() / 160) * 16 : 0;
            if (this.uiSkinChrome) this.paintFishIcon(baking.current.speciesId, furnaceX + flipSlide, grillY - 48 - flipLift, 36);
            else this.fish(furnaceX + flipSlide, grillY - 48 - flipLift, 22, true, baking.current.speciesId);
          }
        }
        if (!(baking.current && baking.current.recipeId === "fish_grilled") && !this.artOn) {
          this.text("选生鱼 开始烤制", Math.round(kitchenW / 2), kitchenY + 26, 13, C.cream, "center");
        }
        if (!this.artOn) this.rabbitBack(furnaceX, grillY + 18, 26);
        // 进度条/文字在兔子之上（最顶层）
        if (baking.current && baking.current.recipeId === "fish_grilled") {
          if (baking.current.stage === "stoke") {
            this.text("生火 绿区点击", Math.round(kitchenW / 2), kitchenY + 26, 13, C.cream, "center");
            this.progress(8, kitchenY + Math.round(kitchenH * 0.85), kitchenW - 18, null, baking.current.cursor, 0.4, 0.6);
          } else if (baking.current.stage === "cooking") {
            this.text(baking.current.perfectFire ? "完美火势" : "烤制中", Math.round(kitchenW / 2), kitchenY + 26, 13, C.cream, "center");
            if (!this.uiSkinChrome) this.rect(8, kitchenY + Math.round(kitchenH * 0.85), kitchenW - 18, 13, C.cream);
            this.rect(8, kitchenY + Math.round(kitchenH * 0.85), (kitchenW - 18) * Math.min(1, baking.current.elapsed / baking.current.cookDuration), 13, C.honey);
          } else if (baking.current.stage === "flip") {
            this.text("翻面 绿色外焦里嫩", Math.round(kitchenW / 2), kitchenY + 26, 13, C.cream, "center");
            this.progress(8, kitchenY + Math.round(kitchenH * 0.85), kitchenW - 18, null, baking.current.cursor);
          }
        }
        // 椰子汁区（右1/3）
        var juiceCX = kitchenW + Math.round(juiceW / 2);
        var juiceCY = kitchenY + Math.round(kitchenH * 0.42);
        if (this.shopJuicerPoint) {
          juiceCX = Math.round(this.shopJuicerPoint.x);
          juiceCY = Math.round(this.shopJuicerPoint.y - this.height * 0.02);
        }
        if (!this.uiSkinChrome) {
          this.rect(kitchenW + 4, kitchenY, juiceW - 4, kitchenH, C.paper);
          this.text("椰子汁", juiceCX, kitchenY + 14, 13, C.ink, "center");
        }
        if (!this.uiSkinChrome) {
          var jGrillY = juiceCY + 48, jGrillW = 40;
          this.rect(juiceCX - jGrillW / 2 - 3, jGrillY - 7, jGrillW + 6, 5, C.woodLight);
          for (var jgi = 0; jgi < 3; jgi++) {
            this.line(juiceCX - jGrillW / 2 + 4 + jgi * 14, jGrillY - 7, juiceCX - jGrillW / 2 + 4 + jgi * 14, jGrillY - 2, 3, C.wood);
          }
          this.rect(juiceCX - jGrillW / 2, jGrillY, jGrillW, 14, C.wood);
          this.rect(juiceCX - jGrillW / 2 + 3, jGrillY + 3, jGrillW - 6, 8, C.brown);
          this.line(juiceCX - jGrillW / 2 + 4, jGrillY + 14, juiceCX - jGrillW / 2 - 2, jGrillY + 28, 4, C.wood);
          this.line(juiceCX + jGrillW / 2 - 4, jGrillY + 14, juiceCX + jGrillW / 2 + 2, jGrillY + 28, 4, C.wood);
        }
        if (baking.current && baking.current.recipeId === "coconut_juice") {
          var artJuicePort = this.uiSkinChrome && this.artOn && this.drawArtJuice(baking.current);
          if (baking.current.stage === "crack") {
            if (!artJuicePort) {
              var hitProgress2 = baking.current.hitTimer > 0 ? 1 - baking.current.hitTimer / 260 : 1;
              var swing2 = baking.current.hitTimer > 0 ? Math.sin(hitProgress2 * Math.PI) : 0;
              var cShake = baking.current.hitTimer > 0 ? Math.sin(hitProgress2 * Math.PI * 3) * 4 : 0;
              this.coconut(juiceCX + cShake, juiceCY, 32);
              for (var cr2 = 0; cr2 < baking.current.taps; cr2++) this.line(juiceCX - 16 + cr2 * 10, juiceCY - 22, juiceCX - 8 + cr2 * 8, juiceCY - 4, 3, C.cream);
              this.line(juiceCX - 55, kitchenY + 38, juiceCX - 16 + swing2 * 10, juiceCY - 24 + swing2 * 18, 7, C.woodLight);
            }
            this.text(baking.current.taps >= 3 ? "敲开了" : "点击敲开 " + baking.current.taps + "/3", juiceCX, kitchenY + 26, 13, C.ink, "center");
          } else {
            if (!artJuicePort) this.juice(juiceCX, juiceCY, 44, false);
            this.text("点击插吸管", juiceCX, kitchenY + 26, 13, C.ink, "center");
          }
        } else {
          if (state.ingredients.coconut > 0) {
            if (!this.uiSkinChrome) {
              this.text("点椰子开始", juiceCX, kitchenY + 26, 13, C.ink, "center");
              this.coconut(juiceCX - 18, juiceCY, 21);
              this.coconut(juiceCX + 16, juiceCY + 10, 17);
            }
          } else {
            this.rect(kitchenW + 8, kitchenY + 38, juiceW - 20, 45, C.disabled);
            this.text("椰子用完 去椰林", juiceCX, kitchenY + 56, 13, C.cream, "center");
          }
        }
        // 成品 + 食材选择
        this.drawReadyGoods();
        this.drawPlating();
        var bW = Math.round((W - 10) / AIGCUtils.FishSpecies.length);
        for (var si = 0; si < AIGCUtils.FishSpecies.length; si++) {
          var species2 = AIGCUtils.FishSpecies[si];
          var fishCount2 = state.getFishCount(species2.id);
          var unlocked2 = this.speciesShopUnlocked(species2.id);
          var bx2 = 5 + si * bW;
          if (!unlocked2) {
            if (!this.uiSkinChrome) {
              this.rect(bx2, cb - 60, bW - 4, 50, [0.55, 0.52, 0.48, 0.75]);
              this.text("锁", bx2 + Math.round(bW / 2), cb - 42, 17, C.cream, "center");
            } else {
              this.text("锁", bx2 + Math.round(bW / 2), cb - 38, 16, [0.5, 0.46, 0.42, 0.9], "center");
            }
          } else if (fishCount2) {
            var ic2 = Math.min(32, Math.round(bW * 0.38));
            if (this.uiSkinChrome) {
              this.paintFishIcon(species2.id, bx2 + 18, cb - 28, ic2);
              this.button(bx2 + 32, cb - 60, bW - 36, 50, species2.name + " " + fishCount2, true);
            } else {
              this.button(bx2, cb - 60, bW - 4, 50, species2.name + " " + fishCount2, true);
              this.paintFishIcon(species2.id, bx2 + Math.round(bW * 0.28), cb - 28, ic2);
            }
          } else {
            var ic0 = Math.min(28, Math.round(bW * 0.36));
            if (this.uiSkinChrome) {
              this.paintFishIcon(species2.id, bx2 + 18, cb - 28, ic0);
              this.button(bx2 + 30, cb - 60, bW - 34, 50, species2.name + " 0", false);
            } else {
              this.button(bx2, cb - 60, bW - 4, 50, species2.name + " 0", false);
              this.paintFishIcon(species2.id, bx2 + Math.round(bW * 0.28), cb - 28, ic0);
            }
          }
        }

      } else {
        if (!this.artOn) {
          this.rect(0, 64, 960, 404, C.sky);
          this.rect(0, 130, 960, 338, C.sand);
          this.rect(20, 115, 390, 270, C.woodLight);
        }
        if (!this.uiSkinChrome) this.rect(420, 115, 200, 270, C.paper);
        if (!this.uiSkinChrome) {
          this.text("烤鱼区 · 厨房", 210, 125, 21, C.cream, "center");
          this.text("椰子汁区", 520, 125, 20, C.ink, "center");
          this.text("送餐口", 520, 151, 16, C.ink, "center");
        }
        var lgX = 210, lgY = 336, lgW = Math.round(390 * 0.75);
        if (this.shopGrillBox) {
          lgX = Math.round(this.shopGrillBox.x + this.shopGrillBox.w / 2);
          lgY = Math.round(this.shopGrillBox.y + this.shopGrillBox.h * 0.58);
        }
        if (!this.artOn) {
          this.circle(210, 285, 49, C.brown);
          this.rect(lgX - lgW / 2 - 4, lgY - 9, lgW + 8, 6, C.woodLight);
          var lgBars = Math.round(lgW / 18);
          for (var glb = 0; glb < lgBars; glb++) {
            var lgBarX = lgX - lgW / 2 + 8 + glb * Math.round((lgW - 16) / Math.max(1, lgBars - 1));
            this.line(lgBarX, lgY - 9, lgBarX, lgY - 3, 3, C.wood);
          }
          this.rect(lgX - lgW / 2, lgY, lgW, 20, C.wood);
          this.rect(lgX - lgW / 2 + 4, lgY + 4, lgW - 8, 12, C.brown);
          this.line(lgX - lgW / 2 + 7, lgY + 20, lgX - lgW / 2 - 4, lgY + 44, 5, C.wood);
          this.line(lgX + lgW / 2 - 7, lgY + 20, lgX + lgW / 2 + 4, lgY + 44, 5, C.wood);
        }
        var artFishLand = this.uiSkinChrome && this.artOn && this.shopGrillBox && baking.current && baking.current.recipeId === "fish_grilled";
        if (artFishLand) {
          if (baking.current.stage === "stoke") this.drawArtStokeFlames(this.shopGrillBox);
          if (baking.current.stage === "cooking" || baking.current.stage === "flip") this.drawArtGrillFish(baking.current, this.shopGrillBox, 20);
        } else {
          var lgFlameNow = Date.now();
          var lgFlameBase = baking.current && baking.current.recipeId === "fish_grilled" && baking.current.perfectFire ? 44 : 26;
          if (this.artOn && !(baking.current && baking.current.recipeId === "fish_grilled")) lgFlameBase = 0;
          var lgFh = lgFlameBase + Math.sin(lgFlameNow / 200) * 8 + Math.sin(lgFlameNow / 137) * 4;
          var lgFw = 20 + Math.sin(lgFlameNow / 160 + 1) * 4;
          var lgFlameBaseY = lgY - 9;
          if (lgFlameBase > 0) {
            this.tri(lgX, lgFlameBaseY - lgFh, lgX - lgFw, lgFlameBaseY, lgX + lgFw, lgFlameBaseY, C.orange);
            var lgFh2 = lgFh * 0.65 + Math.sin(lgFlameNow / 115 + 2) * 4;
            this.tri(lgX + lgFw * 0.1, lgFlameBaseY - lgFh2, lgX - lgFw * 0.5, lgFlameBaseY, lgX + lgFw * 0.55, lgFlameBaseY, C.honey);
          }
          if (baking.current && baking.current.recipeId === "fish_grilled") {
            var landFlip = baking.current.stage === "flip" ? Math.abs(Math.sin(Date.now() / 160)) * 32 : 0;
            var landSlide = baking.current.stage === "flip" ? Math.sin(Date.now() / 160) * 20 : 0;
            if (this.uiSkinChrome) this.paintFishIcon(baking.current.speciesId, lgX + landSlide, lgY - 48 - landFlip, 42);
            else this.fish(lgX + landSlide, lgY - 48 - landFlip, 34, true, baking.current.speciesId);
          }
        }
        if (!(baking.current && baking.current.recipeId === "fish_grilled") && !this.artOn) {
          this.text("选择生鱼 开始烤制", 220, 170, 19, C.cream, "center");
        }
        if (!this.artOn) this.rabbitBack(lgX, lgY + 20, 28);
        // 进度条/文字在兔子之上（最顶层）
        if (baking.current && baking.current.recipeId === "fish_grilled") {
          if (baking.current.stage === "stoke") {
            this.text("生火中 绿色区域点击", 210, 170, 20, C.cream, "center");
            this.progress(75, 360, 270, null, baking.current.cursor, 0.4, 0.6);
          } else if (baking.current.stage === "cooking") {
            this.text(baking.current.perfectFire ? "完美火势 加速20%" : "烤制中", 210, 170, 19, C.cream, "center");
            if (!this.uiSkinChrome) this.rect(75, 360, 270, 20, C.cream);
            this.rect(75, 360, 270 * Math.min(1, baking.current.elapsed / baking.current.cookDuration), 20, C.honey);
          } else if (baking.current.stage === "flip") {
            this.text("翻面 绿色外焦里嫩", 210, 170, 19, C.cream, "center");
            this.progress(75, 360, 270, null, baking.current.cursor);
          }
        }
        var ljX = 520, ljY = 245;
        if (this.shopJuicerPoint) {
          ljX = Math.round(this.shopJuicerPoint.x);
          ljY = Math.round(this.shopJuicerPoint.y - 28);
        }
        if (baking.current && baking.current.recipeId === "coconut_juice") {
          var artJuiceLand = this.uiSkinChrome && this.artOn && this.drawArtJuice(baking.current);
          if (baking.current.stage === "crack") {
            if (!artJuiceLand) {
              var hitProgress = baking.current.hitTimer > 0 ? 1 - baking.current.hitTimer / 260 : 1;
              var swing = baking.current.hitTimer > 0 ? Math.sin(hitProgress * Math.PI) : 0;
              var coconutShake = baking.current.hitTimer > 0 ? Math.sin(hitProgress * Math.PI * 3) * 4 : 0;
              this.coconut(ljX + coconutShake, ljY, 48);
              for (var crack = 0; crack < baking.current.taps; crack++) this.line(ljX - 20 + crack * 15, ljY - 30, ljX - 10 + crack * 10, ljY + 5, 3, C.cream);
              this.line(ljX - 80, ljY - 95, ljX - 25 + swing * 15, ljY - 35 + swing * 35, 8, C.woodLight);
              this.rect(ljX - 42 + swing * 15, ljY - 55 + swing * 35, 45, 25, C.wood);
            }
            this.text(baking.current.taps >= 3 ? "敲开了" : "点击敲开 " + baking.current.taps + "/3", ljX, ljY - 65, 18, C.ink, "center");
          } else {
            if (!artJuiceLand) {
              this.juice(ljX, ljY, 65, false);
              if (!this.shopJuicerPoint) this.line(575, 280, 595, 220, 5, C.orange);
            }
            this.text("点击插吸管", ljX, ljY - 65, 18, C.ink, "center");
          }
        } else {
          if (state.ingredients.coconut > 0) {
            if (!this.uiSkinChrome) {
              this.text("点击椰子开始", 520, 180, 16, C.ink, "center");
              this.coconut(555, 220, 22);
              this.coconut(580, 230, 20);
              this.coconut(540, 238, 19);
            }
          } else {
            this.rect(442, 190, 155, 65, C.disabled);
            this.text("椰子用完了 去椰林", 520, 210, 17, C.cream, "center");
          }
        }
        this.drawReadyGoods();
        this.drawPlating();
        for (var customerIndex = 0; customerIndex < AIGCUtils.Selling.queue.length; customerIndex++) {
          if (!this.artOn) {
            this.drawOrderCustomer(AIGCUtils.Selling.queue[customerIndex], 630, 95 + customerIndex * 155);
          }
        }
        if (this.artOn && !this.uiSkinChrome) {
          var landBubbles = (AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.orderBubbleLand) || [];
          for (var ai = 0; ai < Math.min(2, AIGCUtils.Selling.queue.length); ai++) {
            var oc = AIGCUtils.Selling.queue[ai];
            var anchor = landBubbles[ai] || landBubbles[0];
            if (!anchor) continue;
            var om = AIGCUtils.Selling.getMissing(oc);
            var oready = om.fish === 0 && om.juice === 0;
            this.drawCustomerOrderBubble(anchor.cx, anchor.top, oc, oready, anchor);
          }
        }
        for (var effect = 0; effect < AIGCUtils.Selling.moneyEffects.length; effect++) {
          var money = AIGCUtils.Selling.moneyEffects[effect];
          var alpha = 1 - money.timer / 1100;
          var moneyX = 690;
          var moneyY = 82 + money.slot * 155 - money.timer * 0.035;
          if (this.uiSkinChrome && this.artOn && AIGCUtils.ShopLayout && AIGCUtils.ShopLayout.land) {
            var moneySlot = (AIGCUtils.ShopLayout.land.customers || [])[money.slot];
            if (moneySlot) {
              moneyX = moneySlot.x;
              moneyY = moneySlot.y + (moneySlot.headDy || -90) - money.timer * 0.03;
            }
          }
          this.text("+" + money.amount, moneyX, moneyY, 25, [0.42, 0.67, 0.34, alpha], "center");
        }
        for (var speciesIndex = 0; speciesIndex < AIGCUtils.FishSpecies.length; speciesIndex++) {
          var species = AIGCUtils.FishSpecies[speciesIndex];
          var fishCount = state.getFishCount(species.id);
          var unlocked = this.speciesShopUnlocked(species.id);
          var bx = 20 + speciesIndex * 150;
          if (!unlocked) {
            if (!this.uiSkinChrome) {
              this.rect(bx, 402, 135, 54, [0.55, 0.52, 0.48, 0.75]);
              this.text("锁", bx + 68, 424, 17, C.cream, "center");
            } else {
              this.text("锁", bx + 68, 424, 16, [0.5, 0.46, 0.42, 0.9], "center");
            }
          } else if (fishCount) {
            var lbl = species.name + " " + fishCount;
            if (this.uiSkinChrome) {
              this.paintFishIcon(species.id, bx + 16, 402 + 27, 32);
              this.button(bx + 34, 402, 101, 54, lbl, true);
            } else {
              this.button(bx, 402, 135, 54, lbl, true);
              this.paintFishIcon(species.id, bx + 22, 402 + 27, 30);
            }
          } else {
            var lbl0 = species.name + " 0";
            if (this.uiSkinChrome) {
              this.paintFishIcon(species.id, bx + 16, 402 + 27, 28);
              this.button(bx + 32, 402, 103, 54, lbl0, false);
            } else {
              this.button(bx, 402, 135, 54, lbl0, false);
              this.paintFishIcon(species.id, bx + 22, 402 + 27, 28);
            }
          }
        }
        if (!this.uiSkinChrome) this.text("点椰子做椰子汁", 520, 382, 16, C.ink, "center");
      }
    },

    drawInventory: function () {
      var state = AIGCUtils.GameState;
      var W = this.width, H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      var dlgW = this.portrait ? Math.min(W - 40, 480) : 520;
      var dlgH = this.portrait ? 420 : 400;
      var dlgX = hw - Math.round(dlgW / 2);
      var dlgY = hh - Math.round(dlgH / 2);
      this.rect(0, 0, W, H, C.overlay);
      if (!this.paintUiStretch("dialog-inventory", dlgX, dlgY, dlgW, dlgH)) {
        this.rect(dlgX, dlgY, dlgW, dlgH, C.cream);
      }
      var titleSize = 22;
      this.text("背包", hw, this.textYInBox("背包", titleSize, dlgY + 8, 52), titleSize, C.ink, "center");
      var lineSize = this.portrait ? 16 : 17;
      var lineY0 = dlgY + 72;
      for (var i = 0; i < AIGCUtils.FishSpecies.length; i++) {
        var species = AIGCUtils.FishSpecies[i];
        var fine = state.fishStock.filter(function (fish) {
          return fish.speciesId === species.id && fish.quality === "fine";
        }).reduce(function (total, fish) {
          return total + Math.max(1, fish.portions || 1);
        }, 0);
        var row = species.name + " " + state.getFishCount(species.id) + "  优质 " + fine;
        var rowY = lineY0 + i * 36;
        this.paintFishIcon(species.id, dlgX + 36, rowY + 14, 28);
        this.text(row, dlgX + 58, this.textYInBox(row, lineSize, rowY, 32), lineSize, C.ink, "left");
      }
      var matY = lineY0 + AIGCUtils.FishSpecies.length * 36 + 8;
      this.text(
        "椰子 " + state.ingredients.coconut + "    金椰子 " + state.ingredients.goldenCoconut,
        hw,
        this.textYInBox("椰子", lineSize, matY, 32),
        lineSize,
        C.ink,
        "center"
      );
      this.text(
        "烤鱼 " + state.getProductCount("fish_grilled") + "    椰子汁 " + state.getProductCount("coconut_juice"),
        hw,
        this.textYInBox("烤鱼", lineSize, matY + 38, 32),
        lineSize,
        C.ink,
        "center"
      );
      this.text("轻触空白处关闭", hw, dlgY + dlgH - 28, 14, [0.45, 0.42, 0.38, 0.9], "center");
    },

    drawFishEscapedDialog: function (hw, hh, W, portrait) {
      var H = this.height;
      var collection = AIGCUtils.Collection;
      this.rect(0, 0, W, H, C.overlay);
      if (!this.paintUiStretch("dialog-fish-result", hw - 200, hh - 150, 400, 300)) {
        if (portrait) {
          var dlgH = 280, dlgY = Math.round(H / 2 - dlgH / 2);
          this.rect(20, dlgY, W - 40, dlgH, C.cream);
          this.text("太晚了 鱼跑了", hw, dlgY + 40, 26, C.ink, "center");
          this.text("可复活当前这次钓鱼", hw, dlgY + 90, 17, C.ink, "center");
        } else {
          this.rect(225, 125, 510, 285, C.cream);
          this.text("太晚了 鱼跑了", hw, 165, 26, C.ink, "center");
          this.text("可复活当前这次钓鱼", hw, 225, 17, C.ink, "center");
        }
      } else {
        this.text("太晚了 鱼跑了", hw, hh - 118, 26, C.ink, "center");
        this.text("看广告可复活本次", hw, hh + 18, 17, C.ink, "center");
      }
      if (portrait) {
        var dlgY2 = Math.round(H / 2 - 140);
        this.button(30, dlgY2 + 180, 220, 52, collection.reviveBusy ? "广告加载中" : "看广告复活", true);
        this.button(268, dlgY2 + 180, 170, 52, "放弃重钓", false);
      } else {
        this.button(260, 335, 220, 54, collection.reviveBusy ? "广告加载中" : "看广告复活", true);
        this.button(500, 335, 180, 54, "放弃重钓", false);
      }
    },

    drawFishResult: function () {
      var fish = AIGCUtils.Collection.caughtFish;
      if (!fish) return;
      var W = this.width, H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      var species = AIGCUtils.Recipes.getFishSpecies(fish.speciesId);
      this.rect(0, 0, W, H, C.overlay);
      if (!this.paintUiStretch("dialog-fish-result", hw - 200, hh - 150, 400, 300)) {
        this.rect(hw - 200, hh - 155, 400, 300, C.cream);
      }
      this.text("钓到鱼了", hw, hh - 118, 26, C.ink, "center");
      this.fish(hw, hh - 48, 48, false, fish.speciesId);
      this.text(species.name + " " + fish.weight.toFixed(1) + "kg", hw, hh - 2, 17, C.ink, "center");
      this.text((fish.quality === "fine" ? "优质鱼获" : "普通鱼获") + " · " + fish.portions + "份鱼肉", hw, hh + 28, 17, fish.quality === "fine" ? C.orange : C.ink, "center");
      var showGuide = AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt;
      if (showGuide) {
        if (!this.scenes["dialog-fish-result"]) {
          this.text("三条鱼已备好 去地图选椰林", hw, hh + 52, 17, C.green, "center");
        }
        this.button(hw - 200, hh + 65, 180, 54, "去地图", true);
        this.button(hw + 10, hh + 65, 180, 54, "继续钓鱼", false);
      } else {
        this.button(hw - 110, hh + 65, 220, 54, "收进鱼篓", true);
      }
    },

    drawCoconutSummary: function () {
      var collection = AIGCUtils.Collection;
      var W = this.width, H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      this.rect(0, 0, W, H, C.overlay);
      if (!this.paintUiStretch("dialog-coconut-summary", hw - 240, hh - 165, 480, 300)) {
        this.rect(hw - 240, hh - 165, 480, 300, C.cream);
        this.coconut(hw, hh - 50, 35);
      }
      this.text("本轮采摘结束", hw, hh - 122, 26, C.ink, "center");
      this.text("筐里共有 " + collection.caughtThisRound + " 个椰子", hw, hh - 6, 17, C.ink, "center");
      if (AIGCUtils.GameState.shopBuilt) {
        this.text("继续采摘 还是去地图逛逛", hw, hh + 22, 17, C.ink, "center");
        this.button(hw - 200, hh + 50, 180, 54, "继续采摘", true);
        this.button(hw + 10, hh + 50, 180, 54, "去地图逛逛", false);
      } else if (AIGCUtils.GameState.tasks.coconut) {
        this.text("现在建店 还是继续采摘", hw, hh + 22, 17, C.ink, "center");
        this.button(hw - 200, hh + 50, 180, 54, "搭建烤鱼店", true);
        this.button(hw + 10, hh + 50, 180, 54, "再采一轮", false);
      } else {
        this.button(hw - 90, hh + 50, 180, 54, "再试一次", true);
      }
    },

    drawEnergyPrompt: function () {
      var type = AIGCUtils.Game.energyPrompt;
      var energy = AIGCUtils.Energy.get(type);
      var isFish = type === "fish";
      var W = this.width, H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      this.rect(0, 0, W, H, C.overlay);
      this.rect(hw - 245, hh - 185, 490, 320, C.cream);
      this.text(isFish ? "钓鱼体力耗尽" : "采摘体力耗尽", hw, hh - 150, 30, C.ink, "center");
      this.text(isFish ? "15分钟恢复1格体力" : "36分钟恢复1格体力", hw, hh - 90, 21, C.ink, "center");
      this.text(isFish ? "看广告可补满 不限次数" : "看广告可补满 今日剩" + energy.remainingAds + "次", hw, hh - 45, 20, C.ink, "center");
      if (energy.remainingAds === 0) {
        this.text("请等待恢复 或明天再来", hw, hh - 5, 18, C.orange, "center");
        this.button(hw - 90, hh + 40, 180, 58, "稍后再来", true);
      } else {
        var adLabel = isFish ? "看广告补满（不限次）" : "看广告补满（剩" + energy.remainingAds + "次）";
        this.button(hw - 220, hh + 40, 230, 58, AIGCUtils.Game.energyAdBusy ? "广告加载中" : adLabel, true);
        this.button(hw + 20, hh + 40, 180, 58, isFish ? "继续等待" : "放弃采摘", false);
      }
    },

    drawGoFishingPrompt: function () {
      var W = this.width, H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      var dlgW = 480;
      var dlgH = 300;
      var dlgX = hw - Math.round(dlgW / 2);
      var dlgY = hh - Math.round(dlgH / 2);
      var speciesId = AIGCUtils.Game.goFishingSpeciesId || "small";
      var species = AIGCUtils.Recipes.getFishSpecies(speciesId);
      this.rect(0, 0, W, H, C.overlay);
      if (!this.paintUiStretch("dialog-go-fishing", dlgX, dlgY, dlgW, dlgH)) {
        this.rect(dlgX, dlgY, dlgW, dlgH, C.cream);
      }
      var titleSize = 24;
      this.text("厨房缺鱼", hw, dlgY + 36, titleSize, C.ink, "center");
      this.paintFishIcon(speciesId, hw, dlgY + 118, 56);
      this.text(
        "「" + species.name + "」原料不足",
        hw,
        dlgY + 168,
        17,
        C.ink,
        "center"
      );
      this.text("去钓鱼区补充后再回来烤制？", hw, dlgY + 198, 15, [0.42, 0.38, 0.34, 0.95], "center");
      this.button(hw - 200, dlgY + dlgH - 64, 180, 54, "去钓鱼", true);
      this.button(hw + 20, dlgY + dlgH - 64, 180, 54, "先取消", false);
    },

    drawOfflinePrompt: function () {
      var W = this.width, H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      this.rect(0, 0, W, H, C.overlay);
      if (!this.paintUiStretch("dialog-offline", hw - 295, hh - 150, 590, 300)) {
        this.rect(hw - 255, hh - 185, 510, 320, C.cream);
      }
      this.text("离线自动采集", hw, hh - 118, 26, C.ink, "center");
      this.text("下线也能收鱼肉和椰子", hw, hh - 62, 17, C.ink, "center");
      this.text("看1次广告 永久解锁", hw, hh - 18, 17, C.orange, "center");
      this.button(hw - 230, hh + 40, 230, 58, AIGCUtils.Game.offlineAdBusy ? "广告加载中" : "看广告永久解锁", true);
      this.button(hw + 20, hh + 40, 170, 58, "稍后再说", false);
    },

    drawOfflineDialog: function () {
      var pending = AIGCUtils.GameState.pendingOffline;
      var W = this.width, H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      this.rect(0, 0, W, H, C.overlay);
      if (!this.paintUiStretch("dialog-offline", hw - 295, hh - 150, 590, 300)) {
        this.rect(hw - 305, hh - 195, 610, 335, C.cream);
        this.fish(hw - 150, hh - 40, 33, false, "small");
        this.coconut(hw + 80, hh - 40, 27);
      }
      this.text("欢迎回来", hw, hh - 118, 26, C.ink, "center");
      this.text("离线" + AIGCUtils.OfflineManager.getOfflineDuration() + " 采集到", hw, hh - 62, 17, C.ink, "center");
      this.text("鱼肉 " + pending.fish + "份", hw - 40, hh - 8, 17, C.ink, "center");
      this.text("椰子 " + pending.coconut + "个", hw + 90, hh - 8, 17, C.ink, "center");
      this.button(hw - 295, hh + 40, 170, 58, "直接领取", true);
      this.button(hw - 115, hh + 40, 230, 58, AIGCUtils.Game.offlineAdBusy ? "广告加载中" : "看广告双倍领取", false);
      this.button(hw + 125, hh + 40, 110, 58, "稍后", false);
    },

    draw: function () {
      if (!this.init()) return;
      if (!this.fontReady) this.loadFont();
      this.resize();
      var gl = this.gl;
      gl.clearColor(0.12, 0.16, 0.17, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.vertices = [];
      this.boundTexture = this.fontTexture || this.ensureDummyTexture();
      if (!this.sceneCatalog.length || (!this.scenes["map-land"] && !this.sceneLoading["map-land"])) this.loadScenes();
      var area = AIGCUtils.Game.currentArea;
      this.artShiftX = 0;
      // 椰林只让被点中的那棵树绕树根摆，底板不再跟着平移。
      if (area === "fishing" && AIGCUtils.Collection.phase === "reeling") {
        this.artShiftX = Math.sin(AIGCUtils.Collection.timer / 70) * 6;
      }
      if (area === "build" && AIGCUtils.Game.buildAnim > 0) {
        this.artShiftX = Math.sin(Math.min(1, AIGCUtils.Game.buildAnim / 320) * Math.PI) * 8;
      }
      var backdrop = this.backdropKey(area);
      var contentTop = 64;
      var contentHeight = this.height - 72 - contentTop;
      var shift = Math.max(-12, Math.min(12, this.artShiftX));
      this.uiSkinChrome = !!(backdrop && backdrop.indexOf("ui-skin-") === 0);
      if (this.uiSkinChrome) {
        this.artOn = !!(backdrop && this.paintScene(backdrop, shift, 0, this.width, this.height, 0, 0));
        if (this.artOn) console.log("[Prototype] UI skin backdrop", backdrop);
      } else {
        this.artOn = !!(backdrop && this.paintScene(backdrop, shift - 14, contentTop, this.width + 28, contentHeight, 0, 0));
      }
      if (area === "map") this.drawMap();
      if (area === "fishing") this.drawFishing();
      if (area === "coconut") this.drawCoconut();
      if (area === "build") this.drawBuild();
      if (area === "shop") this.drawShop();
      if (area !== "build") {
        this.drawHUD();
        this.drawNav();
      }
      if (AIGCUtils.Game.showInventory) this.drawInventory();
      if (AIGCUtils.Game.messageTimer > 0) {
        var W = this.width;
        this.rect(Math.round(W / 2) - 220, 72, 440, 44, C.overlay);
        this.text(AIGCUtils.Game.message, Math.round(W / 2), 83, 20, C.cream, "center");
      }
      if (area === "fishing" && AIGCUtils.Collection.phase === "fishResult") this.drawFishResult();
      if (area === "coconut" && AIGCUtils.Collection.phase === "coconutSummary") this.drawCoconutSummary();
      if (AIGCUtils.Game.goFishingPrompt) this.drawGoFishingPrompt();
      if (AIGCUtils.Game.offlinePrompt) this.drawOfflinePrompt();
      if (AIGCUtils.Game.offlineDialog && AIGCUtils.GameState.pendingOffline) this.drawOfflineDialog();
      if (AIGCUtils.Game.energyPrompt) this.drawEnergyPrompt();
      this.flush();
    }
  };
})();
