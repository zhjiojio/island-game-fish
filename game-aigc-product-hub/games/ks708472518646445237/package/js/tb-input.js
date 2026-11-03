// js/tb-input.js — 触摸 / 鼠标输入（两端统一映射到 UI.hitZones）
(function () {
  var M3 = window.M3;
  var UI = M3.UI, E = M3.Engine;
  var canvas = window.canvas;
  var isKS = typeof ks !== 'undefined' && !!ks.onTouchStart;

  // v1.0.15：隐私浮层滚动状态
  var privacyDragActive = false;
  var privacyLastY = 0;
  var privacyStartY = 0;
  var privacyMoved = false;
  var PRIVACY_DRAG_THRESHOLD = 8; // 移动超过 8px 视为拖动，抑制"tap 关闭"

  function toLogical(cx, cy) {
    // 快手：ks.onTouchStart 给的已是逻辑像素
    if (isKS) return { x: cx, y: cy };
    var dpr = window.devicePixelRatio || 1;
    var r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: canvas.width / dpr, height: canvas.height / dpr };
    if (!r.width || !r.height) return { x: cx, y: cy };
    return {
      x: (cx - r.left) * (canvas.width / dpr) / r.width,
      y: (cy - r.top)  * (canvas.height / dpr) / r.height
    };
  }

  function dispatch(x, y) {
    var zones = UI.hitZones();
    // 后绘制的在上层，倒序命中
    for (var i = zones.length - 1; i >= 0; i--) {
      var z = zones[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) {
        E.handle(z.action);
        return true;
      }
    }
    return false;
  }

  function inPrivacyContent(x, y) {
    var c = E.state && E.state._privacyContent;
    if (!c) return false;
    return x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h;
  }

  function onTouchStart(e) {
    var t = (e && e.touches && e.touches[0]) ||
            (e && e.changedTouches && e.changedTouches[0]) || e;
    if (!t) return;
    var cx = t.clientX != null ? t.clientX : (t.pageX != null ? t.pageX : t.x || 0);
    var cy = t.clientY != null ? t.clientY : (t.pageY != null ? t.pageY : t.y || 0);
    var p = toLogical(cx, cy);

    // 隐私浮层：正文区域按下 → 开启拖动，不立刻分发；抬起时若未移动才关闭
    if (E.state.showPrivacy && inPrivacyContent(p.x, p.y)) {
      privacyDragActive = true;
      privacyLastY = p.y;
      privacyStartY = p.y;
      privacyMoved = false;
      return;
    }

    var hit = dispatch(p.x, p.y);
    if (!hit && E.state.phase === 'splash' && !E.state.showPrivacy && p.y > UI.H * 0.5) E.handle('splash_start');
    else if (!hit && E.state.phase === 'live' &&
             !E.state.showPrivacy && !E.state.needStars &&
             !E.state.thanksOverlay && !E.state.outfitPreview &&
             !E.state.gameResultReady) {
      E.handle('toggle_pure');
    }
  }

  function onTouchMove(e) {
    if (!privacyDragActive) return;
    var t = (e && e.touches && e.touches[0]) ||
            (e && e.changedTouches && e.changedTouches[0]) || e;
    if (!t) return;
    var cx = t.clientX != null ? t.clientX : (t.pageX != null ? t.pageX : t.x || 0);
    var cy = t.clientY != null ? t.clientY : (t.pageY != null ? t.pageY : t.y || 0);
    var p = toLogical(cx, cy);
    var dy = p.y - privacyLastY;
    privacyLastY = p.y;
    if (Math.abs(p.y - privacyStartY) > PRIVACY_DRAG_THRESHOLD) privacyMoved = true;
    var sy = (E.state.privacyScrollY || 0) - dy;
    var max = E.state._privacyScrollMax || 0;
    if (sy < 0) sy = 0;
    if (sy > max) sy = max;
    E.state.privacyScrollY = sy;
  }

  function onTouchEnd(e) {
    if (privacyDragActive) {
      privacyDragActive = false;
      // 若未真正拖动，视为一次 tap —— 在正文区域内点击不关闭浮层
      // 若命中标题栏 × 或"我知道了"按钮的话，会走 onTouchStart 里的 dispatch 分支
      privacyMoved = false;
      return;
    }
  }

  function init() {
    if (isKS) {
      ks.onTouchStart(onTouchStart);
      if (ks.onTouchMove) ks.onTouchMove(onTouchMove);
      if (ks.onTouchEnd)  ks.onTouchEnd(onTouchEnd);
      return;
    }
    if (canvas && canvas.addEventListener) {
      canvas.addEventListener('touchstart', function (e) {
        if (e.preventDefault) e.preventDefault();
        onTouchStart(e);
      }, { passive: false });
      canvas.addEventListener('touchmove', function (e) {
        if (e.preventDefault) e.preventDefault();
        onTouchMove(e);
      }, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd);
      canvas.addEventListener('mousedown', function (e) {
        onTouchStart(e);
      });
      canvas.addEventListener('mousemove', function (e) {
        if (privacyDragActive && (e.buttons & 1)) onTouchMove(e);
      });
      canvas.addEventListener('mouseup', onTouchEnd);
    }
  }

  M3.Input = { init: init };
})();
