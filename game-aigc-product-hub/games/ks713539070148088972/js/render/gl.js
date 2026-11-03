/**
 * render/gl.js — WebGL 上下文管理
 * 职责：创建 GL 上下文，处理 contextlost/restore，维护 viewport 与 DPR
 * 依赖：无
 * 导出：GLContext 单例，通过 GLContext.gl 取 WebGLRenderingContext
 */
(function () {
  'use strict';

  var GLContext = window.GLContext = {
    gl: null,
    canvas: null,
    dpr: 1,

    /**
     * 初始化 GL 上下文
     * @param {HTMLCanvasElement} canvas
     * @returns {WebGLRenderingContext|null}
     */
    init: function (canvas) {
      this.canvas = canvas;
      this.dpr = window.devicePixelRatio || 1;

      var gl = null;
      var opts = { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false };
      try { gl = canvas.getContext('webgl2', opts); } catch (e) {}
      if (!gl) {
        try { gl = canvas.getContext('webgl', opts); } catch (e) {}
      }
      if (!gl) {
        console.error('[GL] WebGL not supported');
        return null;
      }

      this.gl = gl;
      this._bindContextEvents(canvas);

      // 基础 GL 设置
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

      return gl;
    },

    /**
     * 同步 canvas 物理尺寸 → GL viewport
     * 由 loop.js resize() 调用，每帧幂等执行
     * @param {number} cssW  逻辑像素宽
     * @param {number} cssH  逻辑像素高
     */
    resize: function (cssW, cssH) {
      var dpr = window.devicePixelRatio || 1;
      var pw = Math.round(cssW * dpr);
      var ph = Math.round(cssH * dpr);
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width  = pw;
        this.canvas.height = ph;
      }
      this.dpr = dpr;
      if (this.gl) this.gl.viewport(0, 0, pw, ph);
    },

    /** @private */
    _bindContextEvents: function (canvas) {
      var self = this;
      canvas.addEventListener('webglcontextlost', function (e) {
        e.preventDefault();
        console.warn('[GL] context lost');
        self.gl = null;
      }, false);
      canvas.addEventListener('webglcontextrestored', function () {
        console.info('[GL] context restored');
        self.init(canvas);
        // 通知渲染器重建所有纹理/shader
        if (window.Renderer) window.Renderer.onContextRestored();
      }, false);
    }
  };
})();
