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
    scenes: {},
    sceneAspect: {},
    sceneLoading: {},
    artOn: false,
    artShiftX: 0,

    loadScenes: function () {
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Image) {
        console.error("[Prototype] Scene art loader unavailable");
        return;
      }
      var renderer = this;
      this.sceneCatalog.forEach(function (item) {
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
        return night ? "night" : this.sceneKey("map");
      }
      if (area === "fishing") return this.sceneKey("fish");
      if (area === "coconut") return this.sceneKey("coconut");
      if (area === "shop") return this.sceneKey("shop");
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

    drawArtFishingMotion: function () {
      var collection = AIGCUtils.Collection;
      var W = this.width;
      var ct = 64;
      var ch = this.height - 72 - ct;
      var pull = collection.phase === "reeling" && collection.reelHeld ? Math.sin(collection.timer / 75) * 14 : 0;
      var now = Date.now();
      var originX, originY, tipX, tipY, waterY, bobX;
      if (this.portrait) {
        originX = W * 0.3;
        originY = ct + ch * 0.46;
        tipX = W * 0.46 + pull;
        tipY = ct + ch * 0.3;
        waterY = ct + ch * 0.5;
        bobX = W * 0.62;
      } else {
        originX = 210;
        originY = 310;
        tipX = 390 + pull;
        tipY = 200;
        waterY = 248;
        bobX = 560;
      }
      this.line(originX, originY, tipX, tipY, 5, C.wood);
      var bobY = waterY + Math.sin(now / 260) * 6;
      if (collection.phase === "bite") bobY += 18;
      if (collection.phase === "reeling") {
        bobX += Math.sin(collection.timer / 90) * 22;
        bobY += Math.cos(collection.timer / 110) * 10;
      }
      if (collection.phase !== "idle" && collection.phase !== "charging") {
        this.line(tipX, tipY, bobX, Math.min(tipY, waterY), 2, C.cream);
        this.line(bobX, waterY, bobX, bobY, 2, C.ink);
      }
      var ripples = collection.phase === "bite" ? 3 : 2;
      for (var i = 0; i < ripples; i++) {
        var progress = ((now / 650 + i * 0.33) % 1);
        this.circle(bobX, bobY, 6 + progress * 30, [0.98, 0.92, 0.79, 0.3 * (1 - progress)], 14);
      }
      this.circle(bobX, bobY, collection.phase === "bite" ? 11 : 7, C.orange);
      if (collection.phase === "waiting" || collection.phase === "bite" || collection.phase === "reeling") {
        var span = this.portrait ? W * 0.46 : 340;
        var start = this.portrait ? W * 0.4 : 420;
        this.fish(start + ((now / 16) % span), bobY + 42 + Math.sin(now / 380) * 12, 18, false);
      }
      if (collection.phase === "reeling") this.fish(bobX + 16, bobY + 28, 22, false);
      if (collection.phase === "fishCaught") {
        var caughtT = Math.min(1, collection.timer / 850);
        this.fish(bobX, bobY - Math.sin(caughtT * Math.PI) * 130, 36, false);
        this.text("钓到了", this.portrait ? W / 2 : 610, waterY - 20, 28, C.cream, "center");
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

    drawHUD: function () {
      var state = AIGCUtils.GameState;
      var W = this.width;
      this.rect(0, 0, W, 64, C.cream);
      this.rect(0, 60, W, 4, C.wood);
      if (this.portrait) {
        this.text("孤岛烤鱼店", 10, 16, 17, C.ink);
        this.text("第" + state.day + "天", 115, 21, 15, C.ink);
        this.text("金币" + state.coins, 192, 21, 15, C.ink);
        this.text("鱼肉" + state.ingredients.fish, 271, 21, 15, C.ink);
        this.text("椰子" + state.ingredients.coconut, 350, 21, 15, C.ink);
        this.text("等级" + state.level, 429, 21, 15, C.ink);
      } else {
        this.text("孤岛烤鱼店", 20, 16, 26, C.ink);
        this.text("第" + state.day + "天", 350, 21, 19, C.ink);
        this.text("金币 " + state.coins, 445, 21, 19, C.ink);
        this.text("鱼肉 " + state.ingredients.fish, 575, 21, 19, C.ink);
        this.text("椰子 " + state.ingredients.coconut, 700, 21, 19, C.ink);
        this.text("等级 " + state.level, 830, 21, 19, C.ink);
      }
    },

    drawNav: function () {
      var W = this.width, H = this.height;
      var navY = H - 72;
      var fishEnergy = AIGCUtils.Energy.get("fish");
      var coconutEnergy = AIGCUtils.Energy.get("coconut");
      this.rect(0, navY, W, 72, C.cream);
      this.rect(0, navY, W, 4, C.wood);
      this.button(20, navY + 8, 130, 48, "地图", AIGCUtils.Game.currentArea === "map");
      this.button(170, navY + 8, 130, 48, "背包", false);
      var energyText = this.portrait
        ? "钓" + fishEnergy.value + "/" + fishEnergy.max + " 摘" + coconutEnergy.value + "/" + coconutEnergy.max
        : "钓鱼体力 " + fishEnergy.value + "/" + fishEnergy.max + "  采摘体力 " + coconutEnergy.value + "/" + coconutEnergy.max;
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
        this.text("钓鱼区", hw, fishY + zoneH * 0.45, 26, C.ink, "center");
        this.text("椰林区", hw, coconutY + zoneH * 0.45, 26, C.ink, "center");
        this.text(AIGCUtils.GameState.shopBuilt ? "烤鱼店" : "待搭建", hw, shopY + zoneH * 0.45, 26, C.ink, "center");
        if (AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt) {
          this.text("新目标 采摘椰子", hw, coconutY + zoneH * 0.72, 18, C.ink, "center");
        }
        var offlineLabel = "离线采集 20分钟解锁";
        if (AIGCUtils.GameState.playTimeMs >= 20 * 60 * 1000) offlineLabel = "解锁离线采集";
        if (AIGCUtils.GameState.offlineUnlocked) offlineLabel = "离线采集已开启";
        if (AIGCUtils.GameState.pendingOffline) offlineLabel = "领取离线食材";
        this.button(hw - 140, cb - 62, 280, 48, offlineLabel, !!AIGCUtils.GameState.pendingOffline || AIGCUtils.GameState.playTimeMs >= 20 * 60 * 1000 && !AIGCUtils.GameState.offlineUnlocked);
      } else {
        if (!this.artOn) {
          this.ellipse(480, 270, 405, 185, C.sand);
          this.line(310, 235, 480, 350, 16, C.paper);
          this.line(480, 350, 660, 220, 16, C.paper);
          this.rect(80, 105, 330, 180, C.paper);
          this.rect(520, 90, 330, 180, C.leafLight);
          this.rect(330, 295, 330, 150, AIGCUtils.GameState.shopBuilt ? C.honey : C.woodLight);
        } else {
          var guide = { x: 80, y: 105, w: 330, h: 180 };
          if (AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt) guide = { x: 520, y: 90, w: 330, h: 180 };
          else if (AIGCUtils.GameState.shopBuilt || AIGCUtils.GameState.tasks.coconut) guide = { x: 330, y: 295, w: 330, h: 150 };
          this.pulseFrame(guide.x, guide.y, guide.w, guide.h);
        }
        if (!this.artOn) {
          this.fish(185, 175, 48, false);
          this.palm(610, 150, 0.45);
        }
        this.text("钓鱼区", 280, 160, 28, C.ink, "center");
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
        // 操控区背景
        this.rect(0, ct, W, uiH, C.cream);
        this.rect(0, ct + uiH - 4, W, 4, C.wood);
        // 指引文字
        this.rect(10, ct + 8, W - 120, 38, C.paper);
        this.text("1选点 2选饵 3抛竿 4等咬钩 5提竿", hw - 50, ct + 18, 14, C.ink, "center");
        this.button(W - 108, ct + 8, 98, 38, "离开", false);
        // 钓点和鱼饵按钮（3列网格）
        if (collection.phase === "idle") {
          var btnW = Math.round((W - 16) / 3);
          var spots = [{ id: "shallow", name: "浅滩" }, { id: "reef", name: "礁石·铁竿" }, { id: "deep", name: "深海·金竿" }];
          var baits = [{ id: "worm", name: "蚯蚓" }, { id: "shrimp", name: "虾米·未解锁" }, { id: "secret", name: "秘制·未解锁" }];
          for (var s = 0; s < 3; s++) {
            this.button(8 + s * (btnW + 2), ct + 54, btnW, 34, spots[s].name, collection.spotId === spots[s].id);
          }
          for (var b = 0; b < 3; b++) {
            this.button(8 + b * (btnW + 2), ct + 94, btnW, 34, baits[b].name, collection.baitId === baits[b].id);
          }
        }
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
          this.fish(hw + escapedT * 160, seaTop + seaH * 0.35 + escapedT * 55, 28, false);
          this.rect(0, 0, W, H, C.overlay);
          var dlgH = 280, dlgY = Math.round(H / 2 - dlgH / 2);
          this.rect(20, dlgY, W - 40, dlgH, C.cream);
          this.text("太晚了 鱼跑了", hw, dlgY + 40, 28, C.ink, "center");
          this.text("可复活当前这次钓鱼", hw, dlgY + 90, 18, C.ink, "center");
          this.button(30, dlgY + 180, 220, 52, collection.reviveBusy ? "广告加载中" : "看广告复活", true);
          this.button(268, dlgY + 180, 170, 52, "放弃重钓", false);
          return;
        }
        // 指引提示
        var instr = "选中浅滩和蚯蚓 按住抛竿";
        if (collection.phase === "charging") instr = "松开甩竿";
        if (collection.phase === "waiting") instr = "等待浮标下沉再提竿";
        if (collection.phase === "bite") instr = "咬钩了 立即提竿";
        if (collection.phase === "reeling") instr = "拉锯战 控制线张力";
        this.text(instr, hw, seaTop + (struggling ? 64 : 40), 18, C.cream, "center");
        // 进度条
        var barY = cb - 110;
        if (collection.phase === "charging") this.progress(20, barY, W - 40, collection.power, collection.power, 0.4, 0.7);
        if (collection.phase === "reeling") {
          this.progress(20, barY, W - 40, collection.reelProgress, collection.reelCursor, 0.35, 0.65);
          this.text("线张力", 18, barY + 38, 15, C.cream, "right");
          this.rect(20, barY + 38, W - 40, 11, C.cream);
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
        this.rect(20, 72, 810, 42, C.cream);
        this.text("1选点  2看气泡  3选饵  4抛竿  5等咬钩  6提竿  7拉锯", 425, 82, 17, C.ink, "center");
        this.button(835, 72, 100, 42, "离开", false);
        if (collection.phase === "idle") {
          // 横屏选点和鱼饵放在船下方的浅滩，避免挡住兔子和船身。抛竿按钮在右侧。
          var spots = [{ id: "shallow", name: "浅滩" }, { id: "reef", name: "礁石·铁竿" }, { id: "deep", name: "深海·金竿" }];
          for (var spot = 0; spot < spots.length; spot++) {
            this.button(14 + spot * 128, 376, 120, 38, spots[spot].name, collection.spotId === spots[spot].id);
          }
          var baits = [{ id: "worm", name: "蚯蚓" }, { id: "shrimp", name: "虾米·未解锁" }, { id: "secret", name: "秘制·未解锁" }];
          for (var bait = 0; bait < baits.length; bait++) {
            this.button(14 + bait * 128, 420, 120, 38, baits[bait].name, collection.baitId === baits[bait].id);
          }
        }
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
        if (collection.phase === "idle") this.button(520, 405, 240, 50, "按住抛竿", true);
        if (collection.phase === "charging") this.button(360, 405, 240, 50, "松开抛竿 " + Math.round(collection.power * 100) + "%", true);
        if (collection.phase === "waiting") this.button(360, 405, 240, 50, "提竿", false);
        if (collection.phase === "bite") this.button(360, 405, 240, 50, "立即提竿", true);
        if (collection.phase === "reeling") this.button(330, 405, 300, 55, collection.reelHeld ? "收线中 松开可放线" : "按住收线 松开放线", true);
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
      if (!this.artOn) {
        this.rect(0, ct, W, groundY - ct, C.leafLight);
        this.rect(0, groundY, W, sandH, C.sand);
        for (var i = 0; i < 3; i++) {
          var shakeX = collection.treeShakes[i] > 0 ? Math.sin(collection.treeShakes[i] / 28) * 9 : 0;
          var treeScale = this.portrait ? 0.68 : 0.8;
          this.palm(treeX[i] + shakeX, ct + Math.round(ch * 0.28), treeScale);
        }
      }
      if (!this.artOn) this.text("椰林区", hw, ct + 24, 28, C.ink, "center");
      var instr = collection.phase === "coconutRound" ? "点击椰树摇一摇 接住掉落椰子" : "点击椰树开始20秒采摘";
      if (this.artOn) this.rect(hw - 190, groundY + 4, 380, 32, [0.98, 0.92, 0.79, 0.88]);
      this.text(instr, hw, groundY + 10, 19, C.ink, "center");
      collection.coconuts.forEach(function (coconut) {
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
      var basketX = Math.round(W * 0.84), basketY = groundY + Math.round(sandH * 0.12);
      if (!this.artOn) {
        this.rect(basketX - 75, basketY, 140, 60, C.wood);
        this.rect(basketX - 65, basketY + 6, 120, 46, C.woodLight);
        for (var basket = 0; basket < collection.basketVisual; basket++) {
          this.coconut(basketX - 60 + (basket % 5) * 22, basketY + 14 + Math.floor(basket / 5) * 20, 10);
        }
      }
      if (this.artOn) this.rect(basketX - 78, groundY - 30, 156, 30, [0.98, 0.92, 0.79, 0.9]);
      this.text("椰子筐 " + collection.caughtThisRound, basketX, groundY - 24, 18, C.ink, "center");
      if (collection.phase === "coconutRound") {
        var remaining = Math.max(0, Math.ceil((collection.roundDuration - collection.timer) / 1000));
        this.text("剩余 " + remaining + " 秒", W - 24, ct + 24, 19, C.ink, "right");
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
        this.text("第一步 亲手砍树", cx, ct + 24, 26, C.ink, "center");
        this.rect(cx - 25, cy + 30, 48, 160, C.wood);
        this.circle(cx, cy, 75, C.leaf);
        this.line(Math.round(W * 0.25), groundY - 30, cx - 50 + swing * (-70), cy + 10 - swing * 60, 9, C.woodLight);
        this.rect(cx - 75 + swing * (-70), cy - 12 - swing * 60, 42, 25, C.ink);
      }
      if (game.buildStage === "saw") {
        this.text("第二步 把树干锯成木头", cx, ct + 24, 24, C.ink, "center");
        for (var log = 0; log < 3; log++) this.rect(cx - 130, cy + 10 + log * 44, 250, 30, C.woodLight);
        this.line(cx - 60 + swing * 160, cy + 20, cx - 20 + swing * 160, cy + 80, 10, C.cream);
        this.line(Math.round(W * 0.2), groundY - 30, cx - 80 + swing * 130, cy + 30, 8, C.wood);
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
      var W = this.width, H = this.height;
      var goods = AIGCUtils.GameState.bakedGoods;
      var juiceGoods = goods.filter(function (good) { return good.recipeId === "coconut_juice"; });
      // 成品展示区位置（适配横/竖屏）：紧贴底部导航上方
      var plateY = H - 72 - 75;
      var startX = this.portrait ? 10 : 65;
      var stepX = this.portrait ? Math.round((W - 20) / AIGCUtils.FishSpecies.length) : 90;
      for (var plate = 0; plate < AIGCUtils.FishSpecies.length; plate++) {
        var plateX = startX + plate * stepX + Math.round(stepX / 2) - (this.portrait ? 0 : 0);
        var species = AIGCUtils.FishSpecies[plate];
        var fishGoods = goods.filter(function (good) {
          return good.recipeId === "fish_grilled" && good.speciesId === species.id;
        });
        this.ellipse(plateX, plateY + 25, 28, 9, C.cream);
        var visible = Math.min(3, fishGoods.length);
        for (var fishIndex = 0; fishIndex < visible; fishIndex++) {
          this.fish(plateX - (visible - 1) * 10 + fishIndex * 20, plateY + 14 - fishIndex * 3, 14, true, species.id);
        }
        this.text(species.name, plateX, plateY + 36, 11, C.cream, "center");
        if (fishGoods.length > 3) this.text(String(fishGoods.length), plateX + 25, plateY, 11, C.cream, "center");
      }
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
      var x = startX + (endX - startX) * t;
      var y = startY + (endY - startY) * t - Math.sin(t * Math.PI) * 65;
      if (isFish) this.fish(x, y, 27, true, plating.speciesId);
      if (!isFish) this.juice(x, y, 40);
      this.text(plating.title, isFish ? startX : (this.portrait ? Math.round(W * 0.75) : 520), Math.round(H * 0.2), 18, isFish ? C.cream : C.ink, "center");
    },

    drawShop: function () {
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
          var cx2 = qi === 0 ? Math.round(slotW * 0.5) : Math.round(slotW + slotW * 0.5);
          var animalColor = customer2.type === "cat" ? C.honey : customer2.type === "rabbit" ? C.white : customer2.type === "bear" ? C.woodLight : C.fish;
          var sz = Math.round(custH * 0.15);
          var headY2 = ct + Math.round(custH * 0.61);
          var bodyY2 = ct + Math.round(custH * 0.78);
          // 动物躯体（面朝玩家）
          this.ellipse(cx2, bodyY2, sz * 0.78, sz * 0.88, animalColor);
          this.circle(cx2, headY2, sz, animalColor);
          this.circle(cx2 - sz * 0.52, headY2 - sz * 0.72, sz * 0.3, animalColor);
          this.circle(cx2 + sz * 0.52, headY2 - sz * 0.72, sz * 0.3, animalColor);
          this.circle(cx2 - sz * 0.27, headY2 - sz * 0.1, sz * 0.11, C.ink, 12);
          this.circle(cx2 + sz * 0.27, headY2 - sz * 0.1, sz * 0.11, C.ink, 12);
          this.circle(cx2, headY2 + sz * 0.26, sz * 0.08, C.orange, 10);
          // 点单气泡（顾客头顶，不遮头）
          var bh2 = Math.round(custH * 0.27), by2 = ct + 12, bw2 = 184, bx2 = cx2 - 92;
          this.rect(bx2, by2, bw2, bh2, C.cream);
          this.rect(bx2 + 3, by2 + 3, bw2 - 6, bh2 - 6, C.paper);
          if (customer2.leaving) {
            this.text("谢谢！欢迎再来", cx2, by2 + bh2 * 0.5, 16, C.green, "center");
          } else {
            var itemY2 = by2 + 22;
            if (customer2.order.fish > 0) {
              this.fish(cx2 - 30, itemY2 + 14, 17, true, customer2.order.speciesId);
              this.text("×" + customer2.order.fish, cx2, itemY2 + 4, 17, C.ink);
              itemY2 += 38;
            }
            if (customer2.order.juice > 0) {
              this.juice(cx2 - 30, itemY2 + 12, 20);
              this.text("×" + customer2.order.juice, cx2, itemY2 + 4, 17, C.ink);
            }
          }
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
          this.text("+" + money.amount, mx2, custBottom - 40 - money.timer * 0.04, 22, [0.42, 0.67, 0.34, alpha], "center");
        }

        // ── 厨房区（下方，烤制2/3宽 / 椰子汁1/3宽）──
        var kitchenW = Math.round(W * 2 / 3);   // ~360px
        var juiceW = W - kitchenW;               // ~180px
        var furnaceX = Math.round(kitchenW * 0.47), furnaceY = kitchenY + Math.round(kitchenH * 0.48);
        if (!this.artOn) this.rect(0, kitchenY, kitchenW, kitchenH, C.woodLight);
        this.text("烤鱼区 · 厨房", Math.round(kitchenW / 2), kitchenY + 14, 14, C.cream, "center");
        var grillY = furnaceY + 40, grillW = Math.round(kitchenW * 0.75);
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
        // ── 动画火焰：从烤架面往上喷，鱼刚好在火焰上 ──
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
        // 鱼放在烤架面上（火焰正上方）
        if (baking.current && baking.current.recipeId === "fish_grilled") {
          var flipLift = baking.current.stage === "flip" ? Math.abs(Math.sin(Date.now() / 160)) * 26 : 0;
          var flipSlide = baking.current.stage === "flip" ? Math.sin(Date.now() / 160) * 16 : 0;
          this.fish(furnaceX + flipSlide, grillY - 48 - flipLift, 22, true, baking.current.speciesId);
        } else if (!this.artOn) {
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
            this.rect(8, kitchenY + Math.round(kitchenH * 0.85), kitchenW - 18, 13, C.cream);
            this.rect(8, kitchenY + Math.round(kitchenH * 0.85), (kitchenW - 18) * Math.min(1, baking.current.elapsed / baking.current.cookDuration), 13, C.honey);
          } else if (baking.current.stage === "flip") {
            this.text("翻面 绿色外焦里嫩", Math.round(kitchenW / 2), kitchenY + 26, 13, C.cream, "center");
            this.progress(8, kitchenY + Math.round(kitchenH * 0.85), kitchenW - 18, null, baking.current.cursor);
          }
        }
        // 椰子汁区（右1/3）
        var juiceCX = kitchenW + Math.round(juiceW / 2);
        var juiceCY = kitchenY + Math.round(kitchenH * 0.42);
        this.rect(kitchenW + 4, kitchenY, juiceW - 4, kitchenH, C.paper);
        this.text("椰子汁", juiceCX, kitchenY + 14, 13, C.ink, "center");
        // ── 椰子汁区烧烤架（小号）──
        var jGrillY = juiceCY + 48, jGrillW = 40;
        this.rect(juiceCX - jGrillW / 2 - 3, jGrillY - 7, jGrillW + 6, 5, C.woodLight);
        for (var jgi = 0; jgi < 3; jgi++) {
          this.line(juiceCX - jGrillW / 2 + 4 + jgi * 14, jGrillY - 7, juiceCX - jGrillW / 2 + 4 + jgi * 14, jGrillY - 2, 3, C.wood);
        }
        this.rect(juiceCX - jGrillW / 2, jGrillY, jGrillW, 14, C.wood);
        this.rect(juiceCX - jGrillW / 2 + 3, jGrillY + 3, jGrillW - 6, 8, C.brown);
        this.line(juiceCX - jGrillW / 2 + 4, jGrillY + 14, juiceCX - jGrillW / 2 - 2, jGrillY + 28, 4, C.wood);
        this.line(juiceCX + jGrillW / 2 - 4, jGrillY + 14, juiceCX + jGrillW / 2 + 2, jGrillY + 28, 4, C.wood);
        if (baking.current && baking.current.recipeId === "coconut_juice") {
          if (baking.current.stage === "crack") {
            var hitProgress2 = baking.current.hitTimer > 0 ? 1 - baking.current.hitTimer / 260 : 1;
            var swing2 = baking.current.hitTimer > 0 ? Math.sin(hitProgress2 * Math.PI) : 0;
            var cShake = baking.current.hitTimer > 0 ? Math.sin(hitProgress2 * Math.PI * 3) * 4 : 0;
            this.coconut(juiceCX + cShake, juiceCY, 32);
            for (var cr2 = 0; cr2 < baking.current.taps; cr2++) this.line(juiceCX - 16 + cr2 * 10, juiceCY - 22, juiceCX - 8 + cr2 * 8, juiceCY - 4, 3, C.cream);
            this.line(juiceCX - 55, kitchenY + 38, juiceCX - 16 + swing2 * 10, juiceCY - 24 + swing2 * 18, 7, C.woodLight);
            this.text(baking.current.taps >= 3 ? "敲开了" : "点击敲开 " + baking.current.taps + "/3", juiceCX, kitchenY + 26, 13, C.ink, "center");
          } else {
            this.juice(juiceCX, juiceCY, 44, false);
            this.text("点击插吸管", juiceCX, kitchenY + 26, 13, C.ink, "center");
          }
        } else {
          if (state.ingredients.coconut > 0) {
            this.text("点椰子开始", juiceCX, kitchenY + 26, 13, C.ink, "center");
            this.coconut(juiceCX - 18, juiceCY, 21);
            this.coconut(juiceCX + 16, juiceCY + 10, 17);
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
          if (fishCount2) {
            this.button(5 + si * bW, cb - 60, bW - 4, 50, species2.name + " " + fishCount2, true);
          } else {
            this.rect(5 + si * bW, cb - 60, bW - 4, 50, C.disabled);
            this.text(species2.name + " 0", 5 + si * bW + Math.round(bW / 2), cb - 57, 14, C.cream, "center");
            this.text("去钓鱼", 5 + si * bW + Math.round(bW / 2), cb - 38, 12, C.cream, "center");
          }
        }

      } else {
        if (!this.artOn) {
          this.rect(0, 64, 960, 404, C.sky);
          this.rect(0, 130, 960, 338, C.sand);
          this.rect(20, 115, 390, 270, C.woodLight);
        }
        this.rect(420, 115, 200, 270, C.paper);
        this.text("烤鱼区 · 厨房", 210, 125, 21, C.cream, "center");
        this.text("椰子汁区", 520, 125, 20, C.ink, "center");
        this.text("送餐口", 520, 151, 16, C.ink, "center");
        var lgFlameNow = Date.now();
        var lgFlameBase = baking.current && baking.current.recipeId === "fish_grilled" && baking.current.perfectFire ? 44 : 26;
        if (this.artOn && !(baking.current && baking.current.recipeId === "fish_grilled")) lgFlameBase = 0;
        var lgFh = lgFlameBase + Math.sin(lgFlameNow / 200) * 8 + Math.sin(lgFlameNow / 137) * 4;
        var lgFw = 20 + Math.sin(lgFlameNow / 160 + 1) * 4;
        var lgX = 210, lgY = 336, lgW = Math.round(390 * 0.75);
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
        var lgFlameBaseY = lgY - 9;
        if (lgFlameBase > 0) {
          this.tri(lgX, lgFlameBaseY - lgFh, lgX - lgFw, lgFlameBaseY, lgX + lgFw, lgFlameBaseY, C.orange);
          var lgFh2 = lgFh * 0.65 + Math.sin(lgFlameNow / 115 + 2) * 4;
          this.tri(lgX + lgFw * 0.1, lgFlameBaseY - lgFh2, lgX - lgFw * 0.5, lgFlameBaseY, lgX + lgFw * 0.55, lgFlameBaseY, C.honey);
        }
        if (baking.current && baking.current.recipeId === "fish_grilled") {
          var landFlip = baking.current.stage === "flip" ? Math.abs(Math.sin(Date.now() / 160)) * 32 : 0;
          var landSlide = baking.current.stage === "flip" ? Math.sin(Date.now() / 160) * 20 : 0;
          this.fish(lgX + landSlide, lgY - 48 - landFlip, 34, true, baking.current.speciesId);
        } else if (!this.artOn) {
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
            this.rect(75, 360, 270, 20, C.cream);
            this.rect(75, 360, 270 * Math.min(1, baking.current.elapsed / baking.current.cookDuration), 20, C.honey);
          } else if (baking.current.stage === "flip") {
            this.text("翻面 绿色外焦里嫩", 210, 170, 19, C.cream, "center");
            this.progress(75, 360, 270, null, baking.current.cursor);
          }
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
      }
    },

    drawInventory: function () {
      var state = AIGCUtils.GameState;
      var W = this.width, H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      var panelH = 410;
      var panelTop = hh - Math.round(panelH / 2);
      this.rect(0, 0, W, H, C.overlay);
      this.rect(hw - 250, panelTop, 500, panelH, C.cream);
      this.text("背包", hw, panelTop + 45, 30, C.ink, "center");
      for (var i = 0; i < AIGCUtils.FishSpecies.length; i++) {
        var species = AIGCUtils.FishSpecies[i];
        var fine = state.fishStock.filter(function (fish) {
          return fish.speciesId === species.id && fish.quality === "fine";
        }).reduce(function (total, fish) {
          return total + Math.max(1, fish.portions || 1);
        }, 0);
        this.text(species.name + " " + state.getFishCount(species.id) + "  优质 " + fine, hw - 210, panelTop + 75 + i * 38, 20, C.ink);
      }
      this.rect(hw - 220, panelTop + 240, 190, 38, C.paper);
      this.coconut(hw - 198, panelTop + 259, 12);
      this.text("椰子 " + state.ingredients.coconut, hw - 175, panelTop + 248, 18, C.ink);
      this.rect(hw - 20, panelTop + 240, 190, 38, C.honey);
      this.coconut(hw + 2, panelTop + 259, 12, true);
      this.text("金椰子 " + state.ingredients.goldenCoconut, hw + 25, panelTop + 248, 18, C.ink);
      this.text("烤鱼 " + state.getProductCount("fish_grilled"), hw - 210, panelTop + 305, 20, C.ink);
      this.text("椰子汁 " + state.getProductCount("coconut_juice"), hw - 210, panelTop + 345, 20, C.ink);
    },

    drawFishResult: function () {
      var fish = AIGCUtils.Collection.caughtFish;
      if (!fish) return;
      var W = this.width, H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      var species = AIGCUtils.Recipes.getFishSpecies(fish.speciesId);
      this.rect(0, 0, W, H, C.overlay);
      this.rect(hw - 200, hh - 155, 400, 300, C.cream);
      this.text("钓到鱼了", hw, hh - 130, 30, C.ink, "center");
      this.fish(hw, hh - 50, 48, false, fish.speciesId);
      this.text(species.name + " " + fish.weight.toFixed(1) + "kg", hw, hh - 5, 25, C.ink, "center");
      this.text((fish.quality === "fine" ? "优质鱼获" : "普通鱼获") + " · 获得" + fish.portions + "份鱼肉", hw, hh + 30, 20, fish.quality === "fine" ? C.orange : C.ink, "center");
      var showGuide = AIGCUtils.GameState.fishCaught >= 3 && !AIGCUtils.GameState.tasks.coconut && !AIGCUtils.GameState.shopBuilt;
      if (showGuide) {
        this.rect(hw - 150, hh + 30, 300, 30, C.cream);
        this.text("三条鱼已备好 去地图选椰林", hw, hh + 31, 18, C.green, "center");
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
      this.rect(hw - 240, hh - 165, 480, 300, C.cream);
      this.text("本轮采摘结束", hw, hh - 130, 30, C.ink, "center");
      this.coconut(hw, hh - 50, 35);
      this.text("筐里共有 " + collection.caughtThisRound + " 个椰子", hw, hh - 10, 23, C.ink, "center");
      if (AIGCUtils.GameState.shopBuilt) {
        this.text("继续采摘 还是去地图逛逛", hw, hh + 22, 19, C.ink, "center");
        this.button(hw - 200, hh + 50, 180, 54, "继续采摘", true);
        this.button(hw + 10, hh + 50, 180, 54, "去地图逛逛", false);
      } else if (AIGCUtils.GameState.tasks.coconut) {
        this.text("现在建店 还是继续采摘", hw, hh + 22, 19, C.ink, "center");
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

    drawOfflinePrompt: function () {
      var W = this.width, H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      this.rect(0, 0, W, H, C.overlay);
      this.rect(hw - 255, hh - 185, 510, 320, C.cream);
      this.text("离线自动采集", hw, hh - 150, 30, C.ink, "center");
      this.text("你已经玩了20分钟", hw, hh - 98, 22, C.ink, "center");
      this.text("下线也能收鱼肉和椰子", hw, hh - 58, 21, C.ink, "center");
      this.text("看1次广告 永久解锁", hw, hh - 18, 21, C.orange, "center");
      this.button(hw - 230, hh + 40, 230, 58, AIGCUtils.Game.offlineAdBusy ? "广告加载中" : "看广告永久解锁", true);
      this.button(hw + 20, hh + 40, 170, 58, "稍后再说", false);
    },

    drawOfflineDialog: function () {
      var pending = AIGCUtils.GameState.pendingOffline;
      var W = this.width, H = this.height;
      var hw = Math.round(W / 2);
      var hh = Math.round(H / 2);
      this.rect(0, 0, W, H, C.overlay);
      this.rect(hw - 305, hh - 195, 610, 335, C.cream);
      this.text("欢迎回来", hw, hh - 160, 30, C.ink, "center");
      this.text("离线" + AIGCUtils.OfflineManager.getOfflineDuration() + " 采集到", hw, hh - 110, 21, C.ink, "center");
      this.fish(hw - 150, hh - 40, 33, false, "small");
      this.text("鱼肉 " + pending.fish + "份", hw - 110, hh - 55, 22, C.ink);
      this.coconut(hw + 80, hh - 40, 27);
      this.text("椰子 " + pending.coconut + "个", hw + 110, hh - 55, 22, C.ink);
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
      if (area === "coconut") {
        var shakes = AIGCUtils.Collection.treeShakes || [];
        for (var shakeIndex = 0; shakeIndex < shakes.length; shakeIndex++) {
          if (shakes[shakeIndex] > 0) this.artShiftX += Math.sin(shakes[shakeIndex] / 28) * 6;
        }
      }
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
      this.artOn = !!(backdrop && this.paintScene(backdrop, shift - 14, contentTop, this.width + 28, contentHeight, 0, 0));
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
      if (AIGCUtils.Game.offlinePrompt) this.drawOfflinePrompt();
      if (AIGCUtils.Game.offlineDialog && AIGCUtils.GameState.pendingOffline) this.drawOfflineDialog();
      if (AIGCUtils.Game.energyPrompt) this.drawEnergyPrompt();
      this.flush();
    }
  };
})();
