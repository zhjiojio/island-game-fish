/**
 * render/renderer.js — 高层语义渲染 API（对业务层暴露）
 * 职责：
 *   - 每帧 beginFrame / endFrame 管理批次状态
 *   - drawImage / drawImageFit / drawRoundRect / drawText / drawCircle / drawLine
 *   - 圆角矩形通过 SDF shader（Shaders.round）实现
 *   - 坐标系：逻辑像素（375 虚拟视口），内部乘以 DPR 转物理像素
 * 依赖：GLContext, Shaders, SpriteBatch, ShapeBatch, TextureManager, TextRenderer
 * 导出：Renderer
 *
 * 业务层使用示例：
 *   Renderer.beginFrame();
 *   Renderer.clear(0.2, 0.4, 0.8, 1.0);
 *   Renderer.drawImage('assets/Icon/btn-close.png', 10, 20, 46, 46);
 *   Renderer.drawRoundRect(50, 100, 200, 80, 12, {fill: '#EBF3FF', stroke: '#6AA0F2', strokeW: 2});
 *   Renderer.drawText('Hello', 150, 140, {fontSize: 16, color: '#333'});
 *   Renderer.endFrame();
 */
(function () {
  'use strict';

  /** 解析 CSS 颜色字符串 → [r,g,b,a] 0~1 */
  var _colorCanvas = null;
  var _colorCtx = null;
  function parseColor(css) {
    if (!_colorCanvas) {
      _colorCanvas = document.createElement('canvas');
      _colorCanvas.width = _colorCanvas.height = 1;
      _colorCtx = _colorCanvas.getContext('2d');
    }
    _colorCtx.clearRect(0, 0, 1, 1);
    _colorCtx.fillStyle = css;
    _colorCtx.fillRect(0, 0, 1, 1);
    var d = _colorCtx.getImageData(0, 0, 1, 1).data;
    return [d[0]/255, d[1]/255, d[2]/255, d[3]/255];
  }

  // 缓存最近 64 个颜色转换结果
  var _colorMap = {};
  function colorToRGBA(css) {
    if (_colorMap[css]) return _colorMap[css];
    var v = parseColor(css);
    if (Object.keys(_colorMap).length > 64) _colorMap = {};
    _colorMap[css] = v;
    return v;
  }

  var Renderer = window.Renderer = {

    // ── 帧管理 ────────────────────────────────────────────────────────────────
    beginFrame: function () {
      // noop：batch 会在 flush 时提交
    },

    endFrame: function () {
      SpriteBatch.flush();
      ShapeBatch.flush();
    },

    /**
     * 立即提交当前已入批但未提交的 SpriteBatch(贴图)/ShapeBatch(纯色) 绘制命令。
     * 背景：两个批次各自累积，只有 flush 时才真正提交给 GL，且 endFrame() 里固定是
     * "先提交所有贴图，再提交所有纯色矩形"——这意味着一帧内任何 drawRect（如 UI 分割条）
     * 永远盖在这一帧所有 drawImage 之上，与两者在 JS 里的调用先后顺序无关。
     * 当某个纯色矩形需要严格插在"某些贴图之下、另一些贴图之上"时（如舞台紫色分割条：
     * 要盖住背景图但不能盖住舞台图），必须在该矩形绘制后立即调用本方法，把它提交到
     * GL 命令流的正确位置，后续贴图才会真正叠加在其上方。
     */
    flush: function () {
      SpriteBatch.flush();
      ShapeBatch.flush();
    },

    /** 清屏 */
    clear: function (r, g, b, a) {
      var gl = GLContext.gl;
      if (!gl) return;
      SpriteBatch.flush();
      ShapeBatch.flush();
      gl.clearColor(r || 0, g || 0, b || 0, a === undefined ? 1 : a);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    // ── 图片绘制 ──────────────────────────────────────────────────────────────
    /**
     * 绘制图片（严格指定目标矩形）
     * @param {string} src      图片路径/URL
     * @param {number} x,y,w,h  目标矩形（逻辑像素）
     * @param {number} [alpha]
     * @param {number[]} [tint]  [r,g,b] 0~1
     */
    drawImage: function (src, x, y, w, h, alpha, tint) {
      var entry = TextureManager.get(src);
      if (!entry || !entry.tex) return;
      SpriteBatch.drawSprite(entry.tex, x, y, w, h, 0, 0, 1, 1, alpha, tint);
    },

    /**
     * 绘制图片的指定 UV 子区域（用于双指缩放：目标矩形不变，只截取图片局部区域放大铺满）
     * @param {string} src
     * @param {number} x,y,w,h  目标矩形（逻辑像素，通常与未缩放时的 contain 矩形一致）
     * @param {number} u0,v0    UV 子区域左上角（0~1）
     * @param {number} us,vs    UV 子区域宽高（0~1，越小代表放大倍数越高）
     * @param {number} [alpha]
     */
    drawImageRegion: function (src, x, y, w, h, u0, v0, us, vs, alpha) {
      var entry = TextureManager.get(src);
      if (!entry || !entry.tex) return;
      SpriteBatch.drawSprite(entry.tex, x, y, w, h, u0, v0, us, vs, alpha);
    },

    /**
     * 绘制图片，并绕目标矩形中心顺时针旋转 angle 弧度（用于沿路径方向的飞行特效等）
     * @param {string} src
     * @param {number} x,y,w,h  目标矩形（逻辑像素）
     * @param {number} angle    顺时针旋转角度（弧度）
     * @param {number} [alpha]
     * @param {number[]} [tint]
     */
    drawImageRotated: function (src, x, y, w, h, angle, alpha, tint) {
      var entry = TextureManager.get(src);
      if (!entry || !entry.tex) return;
      SpriteBatch.drawSprite(entry.tex, x, y, w, h, 0, 0, 1, 1, alpha, tint, angle);
    },

    /** 水平翻转绘制图片（用于左右箭头共用同一个 icon） */
    drawImageFlippedX: function (src, x, y, w, h, alpha) {
      var entry = TextureManager.get(src);
      if (!entry || !entry.tex) return;
      SpriteBatch.drawSprite(entry.tex, x, y, w, h, 1, 0, -1, 1, alpha);
    },

    /**
     * contain 模式：等比缩放居中绘入目标矩形
     * @returns {{x,y,w,h}} 实际绘制矩形（可用于计算命中区域）
     */
    drawImageFit: function (src, x, y, w, h, alpha) {
      var entry = TextureManager.get(src);
      if (!entry || !entry.tex) return {x:x, y:y, w:w, h:h};
      var img  = entry.img;
      var iw   = img.width, ih = img.height;
      var scale = Math.min(w / iw, h / ih);
      var dw   = iw * scale, dh = ih * scale;
      var dx   = x + (w - dw) / 2, dy = y + (h - dh) / 2;
      SpriteBatch.drawSprite(entry.tex, dx, dy, dw, dh, 0, 0, 1, 1, alpha);
      return {x: dx, y: dy, w: dw, h: dh};
    },

    /**
     * cover 模式：等比缩放铺满目标矩形（裁剪溢出部分）
     * 通过 UV 裁剪实现（不依赖 stencil/scissor）
     */
    drawImageCover: function (src, x, y, w, h, alpha) {
      var entry = TextureManager.get(src);
      if (!entry || !entry.tex) return;
      var img   = entry.img;
      var iw    = img.width, ih = img.height;
      var scale = Math.max(w / iw, h / ih);
      var sw    = w / (iw * scale), sh = h / (ih * scale);
      var su    = (1 - sw) / 2, sv = (1 - sh) / 2;
      SpriteBatch.drawSprite(entry.tex, x, y, w, h, su, sv, sw, sh, alpha);
    },

    // ── 形状绘制 ──────────────────────────────────────────────────────────────
    /**
     * 纯色矩形
     * @param {number} x,y,w,h
     * @param {string|number[]} color  CSS 字符串 或 [r,g,b,a]
     */
    drawRect: function (x, y, w, h, color) {
      var rgba = Array.isArray(color) ? color : colorToRGBA(color);
      ShapeBatch.drawRect(x, y, w, h, rgba);
    },

    /**
     * 圆角矩形（SDF shader）
     * @param {number} x,y,w,h
     * @param {number} radius
     * @param {object} style  { fill, stroke, strokeW }（CSS 颜色字符串）
     */
    drawRoundRect: function (x, y, w, h, radius, style) {
      var gl   = GLContext.gl;
      var prog = Shaders.round;
      if (!gl || !prog) return;
      // 先 flush 其他批次
      SpriteBatch.flush();
      ShapeBatch.flush();

      var dpr = GLContext.dpr;
      var cx = (x + w/2) * dpr, cy = (y + h/2) * dpr;
      var hw = (w/2) * dpr,     hh = (h/2) * dpr;
      var r  = radius * dpr;

      gl.useProgram(prog);
      var uRes    = gl.getUniformLocation(prog, 'u_resolution');
      var uRect   = gl.getUniformLocation(prog, 'u_rect');
      var uRad    = gl.getUniformLocation(prog, 'u_radius');
      var uColor  = gl.getUniformLocation(prog, 'u_color');
      var uStroke = gl.getUniformLocation(prog, 'u_stroke');
      var uSColor = gl.getUniformLocation(prog, 'u_strokeColor');

      gl.uniform2f(uRes, GLContext.canvas.width, GLContext.canvas.height);
      gl.uniform4f(uRect, cx, cy, hw, hh);
      gl.uniform1f(uRad, r);

      var fillC = colorToRGBA(style.fill || 'rgba(0,0,0,0)');
      gl.uniform4f(uColor, fillC[0], fillC[1], fillC[2], fillC[3]);

      var sw = (style.strokeW || 0) * dpr;
      gl.uniform1f(uStroke, sw);
      if (sw > 0 && style.stroke) {
        var sc = colorToRGBA(style.stroke);
        gl.uniform4f(uSColor, sc[0], sc[1], sc[2], sc[3]);
      }

      // 绘制覆盖四边形（物理像素）
      var px0 = (x - 1) * dpr, py0 = (y - 1) * dpr;
      var px1 = (x + w + 1) * dpr, py1 = (y + h + 1) * dpr;
      var verts = new Float32Array([
        px0, py0,  px1, py0,  px0, py1,
        px1, py0,  px1, py1,  px0, py1
      ]);
      var tmpVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, tmpVbo);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      var aPos = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.deleteBuffer(tmpVbo);
    },

    /**
     * 圆形（通过圆角矩形实现）
     */
    drawCircle: function (cx, cy, radius, style) {
      this.drawRoundRect(cx - radius, cy - radius, radius*2, radius*2, radius, style);
    },

    /**
     * 聚光灯挖空遮罩：在 (x,y,w,h) 区域内铺满暗色，除以 (holeCx,holeCy) 为圆心、
     * holeRadius 为半径的圆形区域完全透明挖空（硬边，用于提示玩法定位答案）。
     * @param {number} x,y,w,h        遮罩覆盖矩形（逻辑像素，通常传目标图片的 fit 区域）
     * @param {number} holeCx,holeCy  挖空圆心（逻辑像素）
     * @param {number} holeRadius     挖空圆半径（逻辑像素）
     * @param {string} [dimColor]     暗色遮罩颜色（CSS 字符串，默认黑色 75% 透明度）
     */
    drawSpotlightMask: function (x, y, w, h, holeCx, holeCy, holeRadius, dimColor) {
      var gl   = GLContext.gl;
      var prog = Shaders.mask;
      if (!gl || !prog) return;
      SpriteBatch.flush();
      ShapeBatch.flush();

      var dpr = GLContext.dpr;

      gl.useProgram(prog);
      var uRes    = gl.getUniformLocation(prog, 'u_resolution');
      var uHoleC  = gl.getUniformLocation(prog, 'u_holeCenter');
      var uHoleR  = gl.getUniformLocation(prog, 'u_holeRadius');
      var uColor  = gl.getUniformLocation(prog, 'u_dimColor');

      gl.uniform2f(uRes, GLContext.canvas.width, GLContext.canvas.height);
      gl.uniform2f(uHoleC, holeCx * dpr, holeCy * dpr);
      gl.uniform1f(uHoleR, holeRadius * dpr);

      var dimC = colorToRGBA(dimColor || 'rgba(0,0,0,0.75)');
      gl.uniform4f(uColor, dimC[0], dimC[1], dimC[2], dimC[3]);

      var px0 = x * dpr, py0 = y * dpr;
      var px1 = (x + w) * dpr, py1 = (y + h) * dpr;
      var verts = new Float32Array([
        px0, py0,  px1, py0,  px0, py1,
        px1, py0,  px1, py1,  px0, py1
      ]);
      var tmpVbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, tmpVbo);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      var aPos = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.deleteBuffer(tmpVbo);
    },

    // ── 文字绘制 ──────────────────────────────────────────────────────────────
    /**
     * 绘制文字（通过纹理栅格化）
     * @param {string} text
     * @param {number} x,y  绘制基点（align 默认 center 时为水平中心）
     * @param {object} style  { fontSize, color, fontFamily, strokeColor, strokeWidth, maxWidth, maxLines, align }
     */
    drawText: function (text, x, y, style) {
      if (!text) return;
      var entry = TextRenderer.getTexture(text, style);
      if (!entry) return;
      var align = (style && style.align) || 'center';
      var valign = (style && style.valign) || 'top';
      var dx = align === 'center' ? x - entry.w/2 :
               align === 'right'  ? x - entry.w   : x;
      var dy = y;
      if (valign === 'middle') dy = y - entry.h / 2;
      else if (valign === 'bottom') dy = y - entry.h;
      SpriteBatch.drawSprite(entry.tex, dx, dy, entry.w, entry.h);
    },

    // ── 初始化 ────────────────────────────────────────────────────────────────
    init: function (canvas) {
      GLContext.init(canvas);
      Shaders.init(GLContext.gl);
      SpriteBatch.init();
      ShapeBatch.init();
    },

    /** contextRestored 回调 */
    onContextRestored: function () {
      Shaders.rebuild(GLContext.gl);
      SpriteBatch.rebuild();
      ShapeBatch.rebuild();
      TextureManager.rebuildAll();
      TextRenderer.rebuildAll();
    }
  };
})();
