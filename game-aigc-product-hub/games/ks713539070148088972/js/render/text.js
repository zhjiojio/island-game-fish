/**
 * render/text.js — 文字栅格化 + 排版
 * 职责：
 *   - 用离屏 Canvas 2D 将文字栅格化为纹理（避免 WebGL 直接排版复杂性）
 *   - 提供 measureText / wrapLines / getTextTexture
 *   - 缓存相同文字纹理，支持引用计数释放
 * 注意：本文件中使用 Canvas 2D 仅用于文字栅格化，不用于游戏场景绘制
 * 依赖：GLContext, TextureManager（仅上传逻辑），SpriteBatch
 * 导出：TextRenderer
 */
(function () {
  'use strict';

  /** @type {HTMLCanvasElement} */
  var _offscreen = null;
  /** @type {CanvasRenderingContext2D} */
  var _ctx2d = null;
  /** @type {Object.<string, {tex: WebGLTexture, w: number, h: number, refs: number, lastUsed: number}>} */
  var _textCache = {};

  // ── LRU 淘汰（防止纹理缓存无限增长）───────────────────────────────────────────
  // 背景：getTexture 按 (text, fontSize, color, font, maxWidth) 缓存纹理，refs 计
  // 数机制依赖调用方主动 releaseTexture，但业务层（renderer.js drawText）从未调用
  // 过，倒计时数字/分数等动态文字每变化一次都会生成一条永久缓存，长时间游玩会导致
  // GPU 纹理内存无限增长。这里加一个上限：超过 MAX_TEXT_CACHE 条时，一次性淘汰
  // 最久未使用的 EVICT_BATCH 条，避免频繁抖动。
  var MAX_TEXT_CACHE = 200;
  var EVICT_BATCH     = 40;

  function evictLRUIfNeeded() {
    var keys = Object.keys(_textCache);
    if (keys.length <= MAX_TEXT_CACHE) return;
    keys.sort(function (a, b) { return _textCache[a].lastUsed - _textCache[b].lastUsed; });
    var gl = GLContext.gl;
    for (var i = 0; i < EVICT_BATCH && i < keys.length; i++) {
      var entry = _textCache[keys[i]];
      if (gl && entry.tex) gl.deleteTexture(entry.tex);
      delete _textCache[keys[i]];
    }
  }

  function getOffscreen() {
    if (_offscreen) return { canvas: _offscreen, ctx: _ctx2d };
    _offscreen = document.createElement('canvas');
    _ctx2d = _offscreen.getContext('2d');
    return { canvas: _offscreen, ctx: _ctx2d };
  }

  /**
   * 生成文字纹理缓存 key
   */
  function cacheKey(text, fontSize, color, font, maxW, bold) {
    return [text, fontSize, color, font, maxW || '', bold ? 'b' : ''].join('|');
  }

  var TextRenderer = window.TextRenderer = {

    /**
     * 测量文字宽度（逻辑像素）
     * @param {string} text
     * @param {number} fontSize  px
     * @param {string} [fontFamily]
     * @returns {number}
     */
    measure: function (text, fontSize, fontFamily) {
      var o = getOffscreen();
      o.ctx.font = fontSize + 'px ' + (fontFamily || 'sans-serif');
      return o.ctx.measureText(text).width;
    },

    /**
     * 中文自动折行（逐字）
     * @param {string} text
     * @param {number} fontSize
     * @param {number} maxWidth  逻辑像素
     * @param {number} maxLines
     * @param {string} [fontFamily]
     * @returns {string[]}
     */
    wrapLines: function (text, fontSize, maxWidth, maxLines, fontFamily) {
      var o = getOffscreen();
      o.ctx.font = fontSize + 'px ' + (fontFamily || 'sans-serif');
      var lines = [], cur = '';
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (ch === '\n') { lines.push(cur); cur = ''; continue; }
        var test = cur + ch;
        if (o.ctx.measureText(test).width > maxWidth && cur.length > 0) {
          lines.push(cur);
          cur = ch;
        } else {
          cur = test;
        }
        if (lines.length >= maxLines - 1) {
          // 最后一行：剩余文字加省略号
          var remain = text.slice(i + 1 - cur.length + lines.join('').length);
          if (remain.length > 0 && i < text.length - 1) {
            while (o.ctx.measureText(cur + '…').width > maxWidth && cur.length > 0) {
              cur = cur.slice(0, -1);
            }
            cur += '…';
            i = text.length; // break
          }
          break;
        }
      }
      if (cur) lines.push(cur);
      return lines.slice(0, maxLines);
    },

    /**
     * 截断超长文字（超出部分用省略号）
     * @param {string} text
     * @param {number} fontSize
     * @param {number} maxWidth
     * @param {string} [fontFamily]
     * @returns {string}
     */
    ellipsis: function (text, fontSize, maxWidth, fontFamily) {
      var o = getOffscreen();
      o.ctx.font = fontSize + 'px ' + (fontFamily || 'sans-serif');
      if (o.ctx.measureText(text).width <= maxWidth) return text;
      while (text.length > 0 && o.ctx.measureText(text + '…').width > maxWidth) {
        text = text.slice(0, -1);
      }
      return text + '…';
    },

    /**
     * 生成（或复用）文字纹理
     * @param {string} text
     * @param {object} style  { fontSize, color, fontFamily, bold, strokeColor, strokeWidth, lineHeight, maxWidth, align }
     * @returns {{tex: WebGLTexture, w: number, h: number}|null}
     */
    getTexture: function (text, style) {
      var gl = GLContext.gl;
      if (!gl) return null;

      var key = cacheKey(text, style.fontSize, style.color, style.fontFamily, style.maxWidth, style.bold);
      if (_textCache[key]) {
        _textCache[key].refs++;
        _textCache[key].lastUsed = M3._now ? M3._now() : Date.now();
        return _textCache[key];
      }

      var o = getOffscreen();
      var ctx = o.ctx;
      var dpr = GLContext.dpr;
      var fontSize    = (style.fontSize || 14) * dpr;
      var fontFamily  = style.fontFamily || 'sans-serif';
      var fontWeight  = style.bold ? 'bold ' : ''; // CSS font 简写要求 weight 必须在 size 之前
      var color       = style.color || '#ffffff';
      var strokeColor = style.strokeColor;
      var strokeWidth = (style.strokeWidth || 0) * dpr;
      var lineH       = (style.lineHeight || style.fontSize * 1.4) * dpr;
      var align       = style.align || 'center';

      ctx.font = fontWeight + fontSize + 'px ' + fontFamily;

      // 折行
      var lines;
      if (style.maxWidth) {
        lines = this.wrapLines(text, fontSize, style.maxWidth * dpr, style.maxLines || 10, fontFamily);
      } else {
        lines = text.split('\n');
      }

      // 计算画布尺寸
      var maxLineW = 0;
      for (var i = 0; i < lines.length; i++) {
        var lw = ctx.measureText(lines[i]).width;
        if (lw > maxLineW) maxLineW = lw;
      }
      var canvasW = Math.ceil(maxLineW + strokeWidth * 2 + 4);
      var canvasH = Math.ceil(lines.length * lineH + strokeWidth * 2 + 4);

      o.canvas.width  = canvasW;
      o.canvas.height = canvasH;
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.font        = fontWeight + fontSize + 'px ' + fontFamily;
      ctx.textAlign   = align;
      ctx.textBaseline = 'top';

      var drawX = align === 'center' ? canvasW / 2 : align === 'right' ? canvasW : 0;
      for (var j = 0; j < lines.length; j++) {
        var dy = j * lineH + strokeWidth + 2;
        if (strokeColor && strokeWidth > 0) {
          ctx.strokeStyle   = strokeColor;
          ctx.lineWidth     = strokeWidth * 2;
          ctx.lineJoin      = 'round';
          ctx.strokeText(lines[j], drawX, dy);
        }
        ctx.fillStyle = color;
        ctx.fillText(lines[j], drawX, dy);
      }

      var tex = GLContext.gl.createTexture();
      var glRef = GLContext.gl;
      glRef.bindTexture(glRef.TEXTURE_2D, tex);
      glRef.texParameteri(glRef.TEXTURE_2D, glRef.TEXTURE_WRAP_S, glRef.CLAMP_TO_EDGE);
      glRef.texParameteri(glRef.TEXTURE_2D, glRef.TEXTURE_WRAP_T, glRef.CLAMP_TO_EDGE);
      glRef.texParameteri(glRef.TEXTURE_2D, glRef.TEXTURE_MIN_FILTER, glRef.LINEAR);
      glRef.texParameteri(glRef.TEXTURE_2D, glRef.TEXTURE_MAG_FILTER, glRef.LINEAR);
      glRef.texImage2D(glRef.TEXTURE_2D, 0, glRef.RGBA, glRef.RGBA, glRef.UNSIGNED_BYTE, o.canvas);
      glRef.bindTexture(glRef.TEXTURE_2D, null);

      var entry = {
        tex:  tex,
        w:    canvasW / dpr,
        h:    canvasH / dpr,
        refs: 1,
        lastUsed: M3._now ? M3._now() : Date.now(),
        key:  key
      };
      _textCache[key] = entry;
      evictLRUIfNeeded();
      return entry;
    },

    /**
     * 释放文字纹理
     * @param {string} key  由 getTexture 返回的 entry.key
     */
    releaseTexture: function (key) {
      var entry = _textCache[key];
      if (!entry) return;
      entry.refs--;
      if (entry.refs <= 0) {
        var gl = GLContext.gl;
        if (gl && entry.tex) gl.deleteTexture(entry.tex);
        delete _textCache[key];
      }
    },

    /** contextRestored 时重建（全部 canvas 来源的纹理需要重新上传） */
    rebuildAll: function () {
      // 简单策略：清空缓存，上层按需重建
      _textCache = {};
    }
  };
})();
