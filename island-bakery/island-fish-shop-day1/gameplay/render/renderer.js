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
      var fragmentSource = "precision mediump float;uniform sampler2D u_font;varying vec4 v_color;varying vec2 v_uv;varying float v_textured;void main(){vec4 color=v_color;if(v_textured>0.5){color.a*=texture2D(u_font,v_uv).a;}gl_FragColor=color;}";
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

    resize: function () {
      var layout = AIGCUtils.Layout || { w: 896, h: 414 };
      var width = layout.w || 896;
      var height = layout.h || 414;
      this.scale = Math.min(width / 960, height / 540);
      this.offsetX = (width - 960 * this.scale) / 2;
      this.offsetY = (height - 540 * this.scale) / 2;
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
      this.vertices.push(point[0], point[1], color[0], color[1], color[2], color[3], u || 0, v || 0, textured ? 1 : 0);
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
      this.rect(x + 3, y + 5, width, height, C.shadow);
      this.rect(x, y, width, height, active ? C.orange : C.wood);
      this.rect(x + 4, y + 4, width - 8, height - 10, active ? C.honey : C.paper);
      this.text(label, x + width / 2, y + height / 2 - 10, 20, C.ink, "center");
    },

    progress: function (x, y, width, value, cursor, zoneStart, zoneEnd) {
      var start = zoneStart === undefined ? 0.25 : zoneStart;
      var end = zoneEnd === undefined ? 0.75 : zoneEnd;
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

    drawHUD: function () {
      var state = AIGCUtils.GameState;
      this.rect(0, 0, 960, 64, C.cream);
      this.rect(0, 60, 960, 4, C.wood);
      this.text("孤岛烤鱼店", 20, 16, 26, C.ink);
      this.text("第" + state.day + "天", 350, 21, 19, C.ink);
      this.text("金币 " + state.coins, 445, 21, 19, C.ink);
      this.text("鱼肉 " + state.ingredients.fish, 575, 21, 19, C.ink);
      this.text("椰子 " + state.ingredients.coconut, 700, 21, 19, C.ink);
      this.text("等级 " + state.level, 830, 21, 19, C.ink);
    },

    drawNav: function () {
      var fishEnergy = AIGCUtils.Energy.get("fish");
      var coconutEnergy = AIGCUtils.Energy.get("coconut");
      this.rect(0, 468, 960, 72, C.cream);
      this.rect(0, 468, 960, 4, C.wood);
      this.button(20, 476, 130, 48, "地图", AIGCUtils.Game.currentArea === "map");
      this.button(170, 476, 130, 48, "背包", false);
      this.text("钓鱼体力 " + fishEnergy.value + "/" + fishEnergy.max + "  采摘体力 " + coconutEnergy.value + "/" + coconutEnergy.max, 930, 495, 17, C.ink, "right");
    },

    drawMap: function () {
      this.rect(0, 64, 960, 404, C.sea);
      this.ellipse(480, 270, 405, 185, C.sand);
      this.line(310, 235, 480, 350, 16, C.paper);
      this.line(480, 350, 660, 220, 16, C.paper);
      this.rect(80, 105, 330, 180, C.paper);
      this.rect(520, 90, 330, 180, C.leafLight);
      this.rect(330, 295, 330, 150, AIGCUtils.GameState.shopBuilt ? C.honey : C.woodLight);
      this.fish(185, 175, 48, false);
      this.text("钓鱼区", 280, 160, 28, C.ink, "center");
      this.palm(610, 150, 0.45);
      this.text("椰林区", 735, 150, 28, C.ink, "center");
      this.text(AIGCUtils.GameState.shopBuilt ? "烤鱼店" : "待搭建", 495, 345, 28, C.ink, "center");
      this.text("地图", 480, 76, 22, C.cream, "center");
      if (AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt) {
        this.text("新目标 采摘椰子", 735, 210, 20, C.ink, "center");
      }
      var offlineLabel = "离线采集 20分钟解锁";
      if (AIGCUtils.GameState.playTimeMs >= 20 * 60 * 1000) offlineLabel = "解锁离线采集";
      if (AIGCUtils.GameState.offlineUnlocked) offlineLabel = "离线采集已开启";
      if (AIGCUtils.GameState.pendingOffline) offlineLabel = "领取离线食材";
      this.button(675, 405, 250, 48, offlineLabel, !!AIGCUtils.GameState.pendingOffline || AIGCUtils.GameState.playTimeMs >= 20 * 60 * 1000 && !AIGCUtils.GameState.offlineUnlocked);
    },

    drawFishing: function () {
      var collection = AIGCUtils.Collection;
      var struggling = collection.phase === "reeling";
      var pull = struggling && collection.reelHeld ? Math.sin(collection.timer / 75) * 9 : 0;
      this.rect(0, 64, 960, 404, C.sky);
      this.rect(0, 150, 960, 318, C.sea);
      this.rect(20, 72, 810, 42, C.cream);
      this.text("1选点  2看气泡  3选饵  4抛竿  5等咬钩  6提竿  7拉锯", 425, 82, 17, C.ink, "center");
      this.button(835, 72, 100, 42, "离开", false);
      if (collection.phase === "idle") {
        var spots = [{ id: "shallow", name: "浅滩" }, { id: "reef", name: "礁石·铁竿" }, { id: "deep", name: "深海·金竿" }];
        for (var spot = 0; spot < spots.length; spot++) {
          this.button(35 + spot * 125, 122, 115, 38, spots[spot].name, collection.spotId === spots[spot].id);
        }
        var baits = [{ id: "worm", name: "蚯蚓" }, { id: "shrimp", name: "虾米·未解锁" }, { id: "secret", name: "秘制·未解锁" }];
        for (var bait = 0; bait < baits.length; bait++) {
          this.button(35 + bait * 125, 170, 115, 36, baits[bait].name, collection.baitId === baits[bait].id);
        }
      }
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
      var fishX = collection.hookX + (struggling ? Math.sin(collection.timer / 90) * 20 : 0);
      var biteDrop = collection.phase === "bite" ? 20 : 0;
      var fishY = collection.hookY + biteDrop + (struggling ? Math.cos(collection.timer / 110) * 9 : collection.phase === "waiting" ? Math.sin(collection.timer / 70) * 4 : 0);
      this.line(350 + pull, 180 + Math.abs(pull) * 0.5, fishX, fishY, 2, C.ink);
      this.circle(fishX, fishY, 8, C.orange);
      if (struggling) {
        this.fish(fishX + 15, fishY + 36, 27, false);
        this.text("左侧松手放线 绿色按住收线 右侧会断线", 600, 170, 18, C.cream, "center");
      }
      if (collection.phase === "fishCaught") {
        var caughtT = Math.min(1, collection.timer / 850);
        this.fish(460 + caughtT * 100, 300 - Math.sin(caughtT * Math.PI) * 150, 42, false);
        this.text("钓到了", 610, 175, 30, C.cream, "center");
      }
      if (collection.phase === "fishEscaped") {
        var escapedT = Math.min(1, collection.timer / 850);
        this.fish(470 + escapedT * 210, 300 + escapedT * 70, 34, false);
        this.rect(0, 0, 960, 540, C.overlay);
        this.rect(225, 125, 510, 285, C.cream);
        this.text("太晚了 鱼跑了", 480, 165, 30, C.ink, "center");
        this.text("可复活当前这次钓鱼", 480, 225, 20, C.ink, "center");
        this.button(260, 335, 220, 54, collection.reviveBusy ? "广告加载中" : "看广告复活", true);
        this.button(500, 335, 180, 54, "放弃重钓", false);
        return;
      }
      var instruction = "选中浅滩和蚯蚓 按住抛竿";
      if (collection.phase === "charging") instruction = "松开甩竿";
      if (collection.phase === "waiting") instruction = "等待3-5秒 浮标下沉再提竿";
      if (collection.phase === "bite") instruction = "咬钩了 立即提竿";
      if (collection.phase === "reeling") instruction = "拉锯战 控制线张力";
      this.text(instruction, 600, 225, 22, C.cream, "center");
      if (collection.phase === "charging") this.progress(350, 340, 480, collection.power, collection.power, 0.4, 0.7);
      if (collection.phase === "reeling") {
        this.progress(350, 340, 480, collection.reelProgress, collection.reelCursor, 0.35, 0.65);
        this.text("线张力", 330, 375, 16, C.cream, "right");
        this.rect(350, 378, 480, 12, C.cream);
        this.rect(350, 378, 480 * Math.min(1, collection.tension), 12, collection.tension > 0.8 ? C.red : C.honey);
      }
      if (collection.phase === "idle") this.button(360, 405, 240, 50, "按住抛竿", true);
      if (collection.phase === "charging") this.button(360, 405, 240, 50, "松开抛竿 " + Math.round(collection.power * 100) + "%", true);
      if (collection.phase === "waiting") this.button(360, 405, 240, 50, "提竿", false);
      if (collection.phase === "bite") this.button(360, 405, 240, 50, "立即提竿", true);
      if (collection.phase === "reeling") this.button(330, 405, 300, 55, collection.reelHeld ? "收线中 松开可放线" : "按住收线 松开放线", true);
    },

    drawCoconut: function () {
      var collection = AIGCUtils.Collection;
      this.rect(0, 64, 960, 404, C.leafLight);
      this.rect(0, 365, 960, 103, C.sand);
      var treeX = [250, 465, 680];
      for (var i = 0; i < 3; i++) {
        var shakeX = collection.treeShakes[i] > 0 ? Math.sin(collection.treeShakes[i] / 28) * 9 : 0;
        this.palm(treeX[i] + shakeX, 165, 0.8);
      }
      this.text("椰林区", 480, 88, 30, C.ink, "center");
      var instruction = collection.phase === "coconutRound" ? "点击任意椰树摇一摇 接住掉落椰子" : "点击任意一棵椰树 开始20秒采摘";
      this.text(instruction, 430, 385, 21, C.ink, "center");
      collection.coconuts.forEach(function (coconut) {
        this.coconut(coconut.x, coconut.y, coconut.cracked ? 15 : 21, coconut.golden);
        if (coconut.cracked) {
          this.line(coconut.x - 24, coconut.y - 8, coconut.x + 24, coconut.y + 8, 4, C.cream);
          this.line(coconut.x - 20, coconut.y + 12, coconut.x + 20, coconut.y - 12, 4, C.cream);
        }
      }, this);
      this.rect(750, 365, 140, 67, C.wood);
      this.rect(760, 370, 120, 50, C.woodLight);
      for (var basket = 0; basket < collection.basketVisual; basket++) {
        this.coconut(774 + (basket % 5) * 22, 385 + Math.floor(basket / 5) * 20, 10);
      }
      this.text("椰子筐 " + collection.caughtThisRound, 820, 337, 20, C.ink, "center");
      if (collection.phase === "coconutRound") {
        var remaining = Math.max(0, Math.ceil((collection.roundDuration - collection.timer) / 1000));
        this.text("剩余 " + remaining + " 秒", 835, 90, 21, C.ink, "center");
      }
    },

    drawBuild: function () {
      var game = AIGCUtils.Game;
      var swing = Math.sin(Math.min(1, game.buildAnim / 320) * Math.PI);
      this.rect(0, 64, 960, 476, C.sky);
      this.rect(0, 230, 960, 310, C.sand);
      this.rabbit(205, 300, 42);
      if (game.buildStage === "chop") {
        this.text("第一步 亲手砍树", 520, 95, 31, C.ink, "center");
        this.rect(500, 200, 48, 190, C.wood);
        this.circle(525, 175, 85, C.leaf);
        this.line(250, 280, 465, 250 - swing * 70, 9, C.woodLight);
        this.rect(445, 215 - swing * 70, 42, 25, C.ink);
      }
      if (game.buildStage === "saw") {
        this.text("第二步 把树干锯成木头", 520, 95, 31, C.ink, "center");
        for (var log = 0; log < 3; log++) this.rect(420, 225 + log * 48, 250, 34, C.woodLight);
        this.line(350 + swing * 180, 245, 430 + swing * 180, 320, 10, C.cream);
        this.line(250, 280, 370 + swing * 150, 275, 8, C.wood);
      }
      if (game.buildStage === "assemble" || game.buildStage === "fire") {
        this.text(game.buildStage === "assemble" ? "第三步 动手搭建烤鱼店" : "最后一步 整理烤鱼篝火", 520, 95, 31, C.ink, "center");
        var assembled = game.buildStage === "fire" ? 4 : game.buildHits;
        this.rect(350, 375, 390, 45, C.woodLight);
        if (assembled >= 1) this.rect(375, 205, 24, 180, C.wood);
        if (assembled >= 2) this.rect(690, 205, 24, 180, C.wood);
        if (assembled >= 3) this.tri(330, 215, 545, 120, 760, 215, C.paper);
        if (assembled >= 4) {
          this.rect(440, 235, 210, 58, C.paper);
          this.text("烤鱼店", 545, 248, 25, C.ink, "center");
        }
        if (game.buildStage === "assemble") this.line(250, 280, 420, 330 - swing * 90, 8, C.woodLight);
      }
      if (game.buildStage === "fire") {
        for (var stone = 0; stone < 8; stone++) {
          var angle = stone / 8 * Math.PI * 2;
          this.circle(545 + Math.cos(angle) * 55, 355 + Math.sin(angle) * 20, 14, C.brown);
        }
        this.line(510, 355, 580, 335, 12, C.wood);
        this.line(510, 335, 580, 355, 12, C.wood);
        if (game.buildHits > 0) this.tri(545, 275 - swing * 18, 515, 340, 575, 340, C.orange);
      }
      var labels = { chop: "砍树", saw: "锯木", assemble: "搭建", fire: "生火" };
      var totals = { chop: 3, saw: 3, assemble: 4, fire: 2 };
      this.button(380, 435, 200, 58, labels[game.buildStage] + " " + game.buildHits + "/" + totals[game.buildStage], true);
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
        this.fish(x + 125, y + 38, 19, true, customer.order.speciesId);
        this.text("×" + customer.order.fish, x + 155, y + 24, 20, C.ink);
        line++;
      }
      if (customer.order.juice > 0) {
        this.juice(x + 125, y + 38 + line * 34, 25);
        this.text("×" + customer.order.juice, x + 155, y + 24 + line * 34, 20, C.ink);
      }
      this.text(ready ? "点击交付" : "等餐中", x + 105, y + 98, 17, ready ? C.green : C.orange);
    },

    drawReadyGoods: function () {
      var goods = AIGCUtils.GameState.bakedGoods;
      var juiceGoods = goods.filter(function (good) { return good.recipeId === "coconut_juice"; });
      for (var plate = 0; plate < AIGCUtils.FishSpecies.length; plate++) {
        var plateX = 65 + plate * 90;
        var species = AIGCUtils.FishSpecies[plate];
        var fishGoods = goods.filter(function (good) {
          return good.recipeId === "fish_grilled" && good.speciesId === species.id;
        });
        this.ellipse(plateX, 350, 34, 12, C.cream);
        var visible = Math.min(3, fishGoods.length);
        for (var fishIndex = 0; fishIndex < visible; fishIndex++) {
          this.fish(plateX - (visible - 1) * 12 + fishIndex * 24, 338 - fishIndex * 4, 17, true, species.id);
        }
        this.text(species.name, plateX, 362, 12, C.cream, "center");
        if (fishGoods.length > 3) this.text(String(fishGoods.length), plateX + 32, 323, 12, C.cream, "center");
      }
      for (var juice = 0; juice < Math.min(3, juiceGoods.length); juice++) {
        var juiceX = 455 + juice * 58;
        this.ellipse(juiceX, 350, 25, 9, C.cream);
        this.juice(juiceX, 330, 28);
        this.text("椰子汁", juiceX, 360, 12, C.ink, "center");
      }
    },

    drawPlating: function () {
      var plating = AIGCUtils.Baking.plating;
      if (!plating) return;
      var t = Math.min(1, plating.timer / 750);
      var isFish = plating.recipeId === "fish_grilled";
      var startX = isFish ? 210 : 520;
      var startY = 235;
      var endX = isFish ? 200 : 520;
      var endY = 335;
      var x = startX + (endX - startX) * t;
      var y = startY + (endY - startY) * t - Math.sin(t * Math.PI) * 65;
      if (isFish) this.fish(x, y, 27, true, plating.speciesId);
      if (!isFish) this.juice(x, y, 40);
      this.text(plating.title, isFish ? 210 : 520, 175, 18, isFish ? C.cream : C.ink, "center");
    },

    drawShop: function () {
      var baking = AIGCUtils.Baking;
      var state = AIGCUtils.GameState;
      this.rect(0, 64, 960, 404, C.sky);
      this.rect(0, 130, 960, 338, C.sand);
      this.rect(20, 115, 390, 270, C.woodLight);
      this.rect(420, 115, 200, 270, C.paper);
      this.text("烤鱼区 · 厨房", 210, 125, 21, C.cream, "center");
      this.text("椰子汁区", 520, 125, 20, C.ink, "center");
      this.text("送餐口", 520, 151, 16, C.ink, "center");
      this.rabbit(65, 235, 25);
      this.circle(210, 285, 49, C.brown);
      var flame = baking.current && baking.current.recipeId === "fish_grilled" && baking.current.perfectFire ? 44 : 26;
      this.tri(210, 285 - flame, 180, 285, 240, 285, C.orange);
      if (baking.current && baking.current.recipeId === "fish_grilled") {
        this.fish(210, 235, 43, true, baking.current.speciesId);
        if (baking.current.stage === "stoke") {
          this.text("生火中 绿色区域点击", 210, 170, 20, C.cream, "center");
          this.progress(75, 305, 270, null, baking.current.cursor, 0.4, 0.6);
        } else if (baking.current.stage === "cooking") {
          this.text(baking.current.perfectFire ? "完美火势 加速20%" : "烤制中", 210, 170, 19, C.cream, "center");
          this.rect(75, 305, 270, 20, C.cream);
          this.rect(75, 305, 270 * Math.min(1, baking.current.elapsed / baking.current.cookDuration), 20, C.honey);
        } else if (baking.current.stage === "flip") {
          this.text("翻面 绿色外焦里嫩", 210, 170, 19, C.cream, "center");
          this.progress(75, 305, 270, null, baking.current.cursor);
        }
      } else {
        this.text("选择生鱼 开始烤制", 220, 170, 19, C.cream, "center");
      }
      if (baking.current && baking.current.recipeId === "coconut_juice") {
        if (baking.current.stage === "crack") {
          var hitProgress = baking.current.hitTimer > 0 ? 1 - baking.current.hitTimer / 260 : 1;
          var swing = baking.current.hitTimer > 0 ? Math.sin(hitProgress * Math.PI) : 0;
          var coconutShake = baking.current.hitTimer > 0 ? Math.sin(hitProgress * Math.PI * 3) * 4 : 0;
          this.coconut(520 + coconutShake, 245, 48);
          for (var crack = 0; crack < baking.current.taps; crack++) this.line(500 + crack * 15, 215, 510 + crack * 10, 250, 3, C.cream);
          this.line(440, 150, 495 + swing * 15, 210 + swing * 35, 8, C.woodLight);
          this.rect(478 + swing * 15, 190 + swing * 35, 45, 25, C.wood);
          this.text(baking.current.taps >= 3 ? "敲开了" : "点击敲开 " + baking.current.taps + "/3", 520, 180, 18, C.ink, "center");
        } else {
          this.juice(520, 245, 65, false);
          this.line(575, 280, 595, 220, 5, C.orange);
          this.text("点击插吸管", 520, 180, 18, C.ink, "center");
        }
      } else {
        if (state.ingredients.coconut > 0) {
          this.text("点击椰子开始", 520, 180, 16, C.ink, "center");
          this.coconut(555, 220, 22);
          this.coconut(580, 230, 20);
          this.coconut(540, 238, 19);
        } else {
          this.rect(442, 190, 155, 65, C.disabled);
          this.text("椰子用完了 去椰林", 520, 210, 17, C.cream, "center");
        }
      }
      this.drawReadyGoods();
      this.drawPlating();
      for (var customerIndex = 0; customerIndex < AIGCUtils.Selling.queue.length; customerIndex++) {
        this.drawOrderCustomer(AIGCUtils.Selling.queue[customerIndex], 630, 95 + customerIndex * 155);
      }
      for (var effect = 0; effect < AIGCUtils.Selling.moneyEffects.length; effect++) {
        var money = AIGCUtils.Selling.moneyEffects[effect];
        var alpha = 1 - money.timer / 1100;
        this.text("+" + money.amount, 690, 82 + money.slot * 155 - money.timer * 0.035, 25, [0.42, 0.67, 0.34, alpha], "center");
      }
      for (var speciesIndex = 0; speciesIndex < AIGCUtils.FishSpecies.length; speciesIndex++) {
        var species = AIGCUtils.FishSpecies[speciesIndex];
        var fishCount = state.getFishCount(species.id);
        if (fishCount) {
          this.button(20 + speciesIndex * 150, 402, 135, 54, species.name + " " + fishCount, true);
        } else {
          this.rect(20 + speciesIndex * 150, 402, 135, 54, C.disabled);
          this.text(species.name + " 0", 87 + speciesIndex * 150, 405, 17, C.cream, "center");
          this.text("去钓鱼", 87 + speciesIndex * 150, 433, 14, C.cream, "center");
        }
      }
      this.text("点椰子做椰子汁", 520, 382, 16, C.ink, "center");
    },

    drawInventory: function () {
      var state = AIGCUtils.GameState;
      this.rect(0, 0, 960, 540, C.overlay);
      this.rect(230, 70, 500, 410, C.cream);
      this.text("背包", 480, 115, 30, C.ink, "center");
      for (var i = 0; i < AIGCUtils.FishSpecies.length; i++) {
        var species = AIGCUtils.FishSpecies[i];
        var fine = state.fishStock.filter(function (fish) {
          return fish.speciesId === species.id && fish.quality === "fine";
        }).reduce(function (total, fish) {
          return total + Math.max(1, fish.portions || 1);
        }, 0);
        this.text(species.name + " " + state.getFishCount(species.id) + "  优质 " + fine, 290, 145 + i * 38, 20, C.ink);
      }
      this.rect(280, 310, 190, 38, C.paper);
      this.coconut(302, 329, 12);
      this.text("椰子 " + state.ingredients.coconut, 325, 318, 18, C.ink);
      this.rect(480, 310, 190, 38, C.honey);
      this.coconut(502, 329, 12, true);
      this.text("金椰子 " + state.ingredients.goldenCoconut, 525, 318, 18, C.ink);
      this.text("烤鱼 " + state.getProductCount("fish_grilled"), 290, 375, 20, C.ink);
      this.text("椰子汁 " + state.getProductCount("coconut_juice"), 290, 415, 20, C.ink);
    },

    drawFishResult: function () {
      var fish = AIGCUtils.Collection.caughtFish;
      if (!fish) return;
      var species = AIGCUtils.Recipes.getFishSpecies(fish.speciesId);
      this.rect(0, 0, 960, 540, C.overlay);
      this.rect(280, 115, 400, 300, C.cream);
      this.text("钓到鱼了", 480, 140, 30, C.ink, "center");
        this.fish(480, 225, 48, false, fish.speciesId);
      this.text(species.name + " " + fish.weight.toFixed(1) + "kg", 480, 270, 25, C.ink, "center");
      this.text((fish.quality === "fine" ? "优质鱼获" : "普通鱼获") + " · 获得" + fish.portions + "份鱼肉", 480, 303, 20, fish.quality === "fine" ? C.orange : C.ink, "center");
      var showGuide = AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt;
      if (showGuide) {
        this.rect(330, 300, 300, 30, C.cream);
        this.text("三条鱼已备好 去地图选椰林", 480, 301, 18, C.green, "center");
        this.button(290, 335, 180, 54, "去地图", true);
        this.button(490, 335, 180, 54, "继续钓鱼", false);
      } else {
        this.button(370, 335, 220, 54, "收进鱼篓", true);
      }
    },

    drawCoconutSummary: function () {
      var collection = AIGCUtils.Collection;
      this.rect(0, 0, 960, 540, C.overlay);
      this.rect(240, 120, 480, 300, C.cream);
      this.text("本轮采摘结束", 480, 155, 30, C.ink, "center");
      this.coconut(480, 235, 35);
      this.text("筐里共有 " + collection.caughtThisRound + " 个椰子", 480, 275, 23, C.ink, "center");
      if (AIGCUtils.GameState.shopBuilt) {
        this.text("继续采摘 还是去地图逛逛", 480, 307, 19, C.ink, "center");
        this.button(280, 335, 180, 54, "继续采摘", true);
        this.button(500, 335, 180, 54, "去地图逛逛", false);
      } else if (AIGCUtils.GameState.tasks.coconut) {
        this.text("现在建店 还是继续采摘", 480, 307, 19, C.ink, "center");
        this.button(280, 335, 180, 54, "搭建烤鱼店", true);
        this.button(500, 335, 180, 54, "再采一轮", false);
      } else {
        this.button(390, 335, 180, 54, "再试一次", true);
      }
    },

    drawEnergyPrompt: function () {
      var type = AIGCUtils.Game.energyPrompt;
      var energy = AIGCUtils.Energy.get(type);
      var isFish = type === "fish";
      this.rect(0, 0, 960, 540, C.overlay);
      this.rect(235, 115, 490, 320, C.cream);
      this.text(isFish ? "钓鱼体力耗尽" : "采摘体力耗尽", 480, 150, 30, C.ink, "center");
      this.text(isFish ? "15分钟恢复1格体力" : "36分钟恢复1格体力", 480, 210, 21, C.ink, "center");
      this.text(isFish ? "看广告可补满 不限次数" : "看广告可补满 今日剩" + energy.remainingAds + "次", 480, 255, 20, C.ink, "center");
      if (energy.remainingAds === 0) {
        this.text("请等待恢复 或明天再来", 480, 295, 18, C.orange, "center");
        this.button(390, 340, 180, 58, "稍后再来", true);
      } else {
        var adLabel = isFish ? "看广告补满（不限次）" : "看广告补满（剩" + energy.remainingAds + "次）";
        this.button(260, 340, 230, 58, AIGCUtils.Game.energyAdBusy ? "广告加载中" : adLabel, true);
        this.button(520, 340, 180, 58, isFish ? "继续等待" : "放弃采摘", false);
      }
    },

    drawOfflinePrompt: function () {
      this.rect(0, 0, 960, 540, C.overlay);
      this.rect(225, 115, 510, 320, C.cream);
      this.text("离线自动采集", 480, 145, 30, C.ink, "center");
      this.text("你已经玩了20分钟", 480, 198, 22, C.ink, "center");
      this.text("下线也能收鱼肉和椰子", 480, 238, 21, C.ink, "center");
      this.text("看1次广告 永久解锁", 480, 278, 21, C.orange, "center");
      this.button(270, 340, 230, 58, AIGCUtils.Game.offlineAdBusy ? "广告加载中" : "看广告永久解锁", true);
      this.button(520, 340, 170, 58, "稍后再说", false);
    },

    drawOfflineDialog: function () {
      var pending = AIGCUtils.GameState.pendingOffline;
      this.rect(0, 0, 960, 540, C.overlay);
      this.rect(175, 105, 610, 335, C.cream);
      this.text("欢迎回来", 480, 135, 30, C.ink, "center");
      this.text("离线" + AIGCUtils.OfflineManager.getOfflineDuration() + " 采集到", 480, 185, 21, C.ink, "center");
      this.fish(330, 255, 33, false, "small");
      this.text("鱼肉 " + pending.fish + "份", 390, 240, 22, C.ink);
      this.coconut(570, 255, 27);
      this.text("椰子 " + pending.coconut + "个", 620, 240, 22, C.ink);
      this.button(205, 340, 170, 58, "直接领取", true);
      this.button(395, 340, 230, 58, AIGCUtils.Game.offlineAdBusy ? "广告加载中" : "看广告双倍领取", false);
      this.button(645, 340, 110, 58, "稍后", false);
    },

    draw: function () {
      if (!this.init()) return;
      if (!this.fontReady) this.loadFont();
      this.resize();
      var gl = this.gl;
      gl.clearColor(0.12, 0.16, 0.17, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.vertices = [];
      var area = AIGCUtils.Game.currentArea;
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
        this.rect(260, 72, 440, 44, C.overlay);
        this.text(AIGCUtils.Game.message, 480, 83, 20, C.cream, "center");
      }
      if (area === "fishing" && AIGCUtils.Collection.phase === "fishResult") this.drawFishResult();
      if (area === "coconut" && AIGCUtils.Collection.phase === "coconutSummary") this.drawCoconutSummary();
      if (AIGCUtils.Game.offlinePrompt) this.drawOfflinePrompt();
      if (AIGCUtils.Game.offlineDialog && AIGCUtils.GameState.pendingOffline) this.drawOfflineDialog();
      if (AIGCUtils.Game.energyPrompt) this.drawEnergyPrompt();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / 9);
    }
  };
})();
