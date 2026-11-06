(function () {
  window.AIGCUtils = window.AIGCUtils || {};

  function compileShader(gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("[DesignRenderer] shader error", gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  function createProgram(gl, vertexSource, fragmentSource, attributes) {
    var vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    var fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("[DesignRenderer] program link error", gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }

  function loadImageTexture(gl, image) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return texture;
  }

  var DesignRenderer = {
    gl: null,
    canvas: null,
    width: 1,
    height: 1,
    textures: {},
    fontTexture: null,
    bgProgram: null,
    rectProgram: null,
    textProgram: null,
    bgBuffer: null,
    rectBuffer: null,
    textBuffer: null,
    rectVertices: [],
    textVertices: [],
    ready: false,
    sceneTextureMap: {
      map: "res/Image/e1.1-map.png",
      fishing: "res/Image/e1.2-fishing.png",
      coconut: "res/Image/e1.4-coconut.png",
      shop: "res/Image/e1.3-shop.png"
    },

    init: function () {
      if (this.ready) return true;
      var canvas = window.canvas;
      if (!canvas) {
        console.error("[DesignRenderer] canvas missing");
        return false;
      }
      var gl;
      try { gl = canvas.getContext("webgl"); } catch (error) { gl = null; }
      if (!gl) {
        console.error("[DesignRenderer] WebGL1 unavailable");
        return false;
      }
      this.canvas = canvas;
      this.gl = gl;
      this.bgProgram = createProgram(gl,
        "attribute vec2 a_position;attribute vec2 a_uv;varying vec2 v_uv;void main(){gl_Position=vec4(a_position,0.0,1.0);v_uv=a_uv;}",
        "precision mediump float;uniform sampler2D u_image;varying vec2 v_uv;void main(){gl_FragColor=texture2D(u_image,v_uv);}",
        ["a_position", "a_uv"]);
      this.rectProgram = createProgram(gl,
        "attribute vec2 a_position;attribute vec4 a_color;varying vec4 v_color;void main(){gl_Position=vec4(a_position,0.0,1.0);v_color=a_color;}",
        "precision mediump float;varying vec4 v_color;void main(){gl_FragColor=v_color;}",
        ["a_position", "a_color"]);
      this.textProgram = createProgram(gl,
        "attribute vec2 a_position;attribute vec4 a_color;attribute vec2 a_uv;varying vec4 v_color;varying vec2 v_uv;void main(){gl_Position=vec4(a_position,0.0,1.0);v_color=a_color;v_uv=a_uv;}",
        "precision mediump float;uniform sampler2D u_font;varying vec4 v_color;varying vec2 v_uv;void main(){gl_FragColor=vec4(v_color.rgb,v_color.a*texture2D(u_font,v_uv).a);}",
        ["a_position", "a_color", "a_uv"]);
      if (!this.bgProgram || !this.rectProgram || !this.textProgram) return false;
      this.bgBuffer = gl.createBuffer();
      this.rectBuffer = gl.createBuffer();
      this.textBuffer = gl.createBuffer();
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.resize();
      this.loadTextures();
      this.ready = true;
      console.log("[DesignRenderer] ready");
      return true;
    },

    resize: function () {
      var layout = AIGCUtils.Layout;
      var cssWidth = layout ? layout.w : window.innerWidth;
      var cssHeight = layout ? layout.h : window.innerHeight;
      var dpr = window.devicePixelRatio || 1;
      var physicalWidth = Math.round(cssWidth * dpr);
      var physicalHeight = Math.round(cssHeight * dpr);
      if (this.canvas.width !== physicalWidth || this.canvas.height !== physicalHeight) {
        this.canvas.width = physicalWidth;
        this.canvas.height = physicalHeight;
      }
      this.width = cssWidth;
      this.height = cssHeight;
      this.gl.viewport(0, 0, physicalWidth, physicalHeight);
    },

    loadTextures: function () {
      var renderer = this;
      var gl = this.gl;
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Image || !KwaiMedia.Image.load) {
        console.error("[DesignRenderer] KwaiMedia.Image unavailable");
        return;
      }
      var tasks = [];
      for (var scene in this.sceneTextureMap) {
        if (this.sceneTextureMap.hasOwnProperty(scene)) {
          (function (sceneName, path) {
            tasks.push(KwaiMedia.Image.load(path).then(function (image) {
              renderer.textures[sceneName] = loadImageTexture(gl, image);
              console.log("[DesignRenderer] scene texture loaded", sceneName);
            }).catch(function (error) {
              console.error("[DesignRenderer] scene texture failed", sceneName, error);
            }));
          })(scene, this.sceneTextureMap[scene]);
        }
      }
      tasks.push(KwaiMedia.Image.load(AIGCUtils.FontAtlas.image).then(function (image) {
        renderer.fontTexture = loadImageTexture(gl, image);
        console.log("[DesignRenderer] font texture loaded");
      }).catch(function (error) {
        console.error("[DesignRenderer] font texture failed", error);
      }));
    },

    ndcX: function (x) { return (x / this.width) * 2.0 - 1.0; },
    ndcY: function (y) { return 1.0 - (y / this.height) * 2.0; },

    rect: function (x, y, width, height, color) {
      var x1 = this.ndcX(x);
      var y1 = this.ndcY(y);
      var x2 = this.ndcX(x + width);
      var y2 = this.ndcY(y + height);
      var r = color[0], g = color[1], b = color[2], a = color.length > 3 ? color[3] : 1.0;
      this.rectVertices.push(
        x1, y1, r, g, b, a,
        x2, y1, r, g, b, a,
        x1, y2, r, g, b, a,
        x2, y1, r, g, b, a,
        x2, y2, r, g, b, a,
        x1, y2, r, g, b, a
      );
    },

    textWidth: function (text, size) {
      var atlas = AIGCUtils.FontAtlas;
      var scale = size / atlas.fontSize;
      var width = 0;
      for (var i = 0; i < text.length; i++) {
        var glyph = atlas.glyphs[text[i]];
        width += (glyph ? glyph.advance : size) * scale;
      }
      return width;
    },

    text: function (text, x, y, size, color, align) {
      var atlas = AIGCUtils.FontAtlas;
      var scale = size / atlas.fontSize;
      var cursor = x;
      if (align === "center") cursor = x - this.textWidth(text, size) / 2;
      if (align === "right") cursor = x - this.textWidth(text, size);
      for (var i = 0; i < text.length; i++) {
        var glyph = atlas.glyphs[text[i]];
        if (!glyph) continue;
        var left = cursor + glyph.xoffset * scale;
        var top = y + glyph.yoffset * scale;
        var width = glyph.w * scale;
        var height = glyph.h * scale;
        var u0 = glyph.x / atlas.width;
        var v0 = glyph.y / atlas.height;
        var u1 = (glyph.x + glyph.w) / atlas.width;
        var v1 = (glyph.y + glyph.h) / atlas.height;
        var r = color[0], g = color[1], b = color[2], a = color.length > 3 ? color[3] : 1.0;
        var x1 = this.ndcX(left), y1 = this.ndcY(top);
        var x2 = this.ndcX(left + width), y2 = this.ndcY(top + height);
        this.textVertices.push(
          x1, y1, r, g, b, a, u0, v0,
          x2, y1, r, g, b, a, u1, v0,
          x1, y2, r, g, b, a, u0, v1,
          x2, y1, r, g, b, a, u1, v0,
          x2, y2, r, g, b, a, u1, v1,
          x1, y2, r, g, b, a, u0, v1
        );
        cursor += glyph.advance * scale;
      }
    },

    drawBackground: function (scene) {
      var gl = this.gl;
      var texture = this.textures[scene];
      if (!texture) return;
      gl.useProgram(this.bgProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bgBuffer);
      var vertices = new Float32Array([
        -1, -1, 0, 1,
        1, -1, 1, 1,
        -1, 1, 0, 0,
        1, -1, 1, 1,
        1, 1, 1, 0,
        -1, 1, 0, 0
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      var position = gl.getAttribLocation(this.bgProgram, "a_position");
      var uv = gl.getAttribLocation(this.bgProgram, "a_uv");
      gl.enableVertexAttribArray(position);
      gl.enableVertexAttribArray(uv);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(gl.getUniformLocation(this.bgProgram, "u_image"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },

    flushRects: function () {
      var gl = this.gl;
      if (!this.rectVertices.length) return;
      gl.useProgram(this.rectProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rectBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.rectVertices), gl.DYNAMIC_DRAW);
      var position = gl.getAttribLocation(this.rectProgram, "a_position");
      var color = gl.getAttribLocation(this.rectProgram, "a_color");
      gl.enableVertexAttribArray(position);
      gl.enableVertexAttribArray(color);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(color, 4, gl.FLOAT, false, 24, 8);
      gl.drawArrays(gl.TRIANGLES, 0, this.rectVertices.length / 6);
      this.rectVertices.length = 0;
    },

    flushText: function () {
      var gl = this.gl;
      if (!this.textVertices.length || !this.fontTexture) return;
      gl.useProgram(this.textProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.textBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.textVertices), gl.DYNAMIC_DRAW);
      var position = gl.getAttribLocation(this.textProgram, "a_position");
      var color = gl.getAttribLocation(this.textProgram, "a_color");
      var uv = gl.getAttribLocation(this.textProgram, "a_uv");
      gl.enableVertexAttribArray(position);
      gl.enableVertexAttribArray(color);
      gl.enableVertexAttribArray(uv);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 32, 0);
      gl.vertexAttribPointer(color, 4, gl.FLOAT, false, 32, 8);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 32, 24);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.fontTexture);
      gl.uniform1i(gl.getUniformLocation(this.textProgram, "u_font"), 0);
      gl.drawArrays(gl.TRIANGLES, 0, this.textVertices.length / 8);
      this.textVertices.length = 0;
    },

    clear: function () {
      this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    },

    draw: function (scene) {
      this.clear();
      this.drawBackground(scene);
    }
  };

  window.AIGCUtils.DesignRenderer = DesignRenderer;
})();
