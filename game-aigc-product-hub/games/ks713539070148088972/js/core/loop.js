/**
 * core/loop.js — 主循环
 * 职责：
 *   - requestAnimationFrame 循环
 *   - resize（幂等，尺寸未变时跳过）
 *   - 每帧调用 SceneManager.update(dt) + SceneManager.draw()
 *   - 安全区/布局参数更新（M3.Layout）
 * 依赖：GLContext, Renderer, SceneManager, InputManager, M3
 * 导出：GameLoop
 */
(function () {
  'use strict';

  var _lastCssW = 0, _lastCssH = 0, _lastDpr = 0;
  var _lastTime = 0;

  function getSafeTop() {
    if (typeof ks !== 'undefined' && ks.getSystemInfoSync) {
      try {
        var info = ks.getSystemInfoSync();
        return (info.safeArea && info.safeArea.top) ? info.safeArea.top : 15;
      } catch (e) { return 0; }
    }
    return 0;
  }

  function getSafeBottom() {
    if (typeof ks !== 'undefined' && ks.getSystemInfoSync) {
      try {
        var info = ks.getSystemInfoSync();
        if (info.safeArea) {
          if (info.screenHeight && info.safeArea.bottom) {
            return Math.max(0, info.screenHeight - info.safeArea.bottom);
          }
          if (info.screenHeight && info.safeArea.height) {
            return Math.max(0, info.screenHeight - info.safeArea.height - info.safeArea.top);
          }
        }
        return 0;
      } catch (e) { return 0; }
    }
    return 0;
  }

  function resize() {
    var isKS = typeof ks !== 'undefined';
    var cssW, cssH;
    if (isKS) {
      cssW = window.innerWidth;
      cssH = window.innerHeight;
    } else {
      var el = document.documentElement;
      cssW = parseInt(el.getAttribute('data-debug-w') || '360', 10);
      cssH = parseInt(el.getAttribute('data-debug-h') || '780', 10);
    }
    var dpr = window.devicePixelRatio || 1;

    if (cssW === _lastCssW && cssH === _lastCssH && dpr === _lastDpr) return;
    _lastCssW = cssW; _lastCssH = cssH; _lastDpr = dpr;

    var canvas = GLContext.canvas;
    if (canvas) {
      canvas.style.width  = cssW + 'px';
      canvas.style.height = cssH + 'px';
    }
    GLContext.resize(cssW, cssH);

    M3.Layout.w       = cssW;
    M3.Layout.h       = cssH;
    M3.Layout.safeTop = getSafeTop();
    M3.Layout.safeBottom = getSafeBottom();
    M3.Layout.usableH = cssH - M3.Layout.safeTop;
    M3.Layout.dpr     = dpr;

    // 布局缩放系数：以设计稿宽度(CONFIG.VW=375)为基准，宽屏/窄屏等比放大缩小 HUD 布局
    // 常量（padding/图标尺寸/字号），clamp 到 [LAYOUT_SCALE_MIN, LAYOUT_SCALE_MAX] 防止
    // 平板等极端宽屏把 HUD 撑得过大，或极窄机型把 HUD 压得过小。
    var rawScale = cssW / CONFIG.VW;
    M3.Layout.scale = Math.max(CONFIG.LAYOUT_SCALE_MIN, Math.min(CONFIG.LAYOUT_SCALE_MAX, rawScale));
  }

  var GameLoop = window.GameLoop = {

    _running: false,

    start: function () {
      if (this._running) return;
      this._running = true;
      _lastTime = M3._now();
      var self = this;
      function loop() {
        if (!self._running) return;
        resize();
        var now = M3._now();
        var dt  = Math.min((now - _lastTime) / 1000, 0.1); // 最大 100ms 防后台跳帧
        _lastTime = now;

        Renderer.beginFrame();
        Renderer.clear(0, 0, 0, 1);

        InputManager.clear();   // 每帧重建热区
        SceneManager.update(dt);
        SceneManager.draw();
        InputManager.drawRipples();

        Renderer.endFrame();
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    },

    stop: function () { this._running = false; },

    resume: function () {
      if (!GLContext.gl) {
        GLContext.init(GLContext.canvas);
        if (GLContext.gl && window.Renderer) {
          Shaders.init(GLContext.gl);
          SpriteBatch.init();
          ShapeBatch.init();
          window.Renderer.onContextRestored();
        }
      }
      _lastTime = M3._now();
      _lastCssW = 0;
    }
  };

  // resize 事件绑定
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
  }
})();
