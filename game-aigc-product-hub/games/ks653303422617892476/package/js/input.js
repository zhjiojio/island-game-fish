/**
 * input.js — 换装匹配输入层
 *
 * 职责：
 *   1. 监听 canvas 触摸/鼠标事件（按下 / 移动 / 抬起）
 *   2. 将原始坐标转换为游戏逻辑像素
 *   3. 按下时命中 M3.Render.zones 热区：
 *        - 衣服选项 → 进入拖拽模式
 *        - 其他热区 → 直接 M3.Game.onZoneTap
 *   4. 移动时更新拖拽位置；抬起时判断是否落在人物区 → 确认选择
 *
 * 不做：
 *   - 不直接修改游戏状态（只调 Board/Game 提供的接口）
 *   - 不绘制任何 canvas 内容
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  M3.Input = M3.Input || {};

  // 按下时记录的待触发热区（抬起且未拖走时才触发点击）
  var _pendingZoneId = null;
  var _pendingIsOption = false;
  var _downX = 0, _downY = 0;

  // 普通按钮的点击冷却（防连点），拖拽不受此限制
  var _lastTapTime = 0;
  var TAP_COOLDOWN = 250;

  // ── 坐标转换 ──────────────────────────────────────────────────────────────

  /**
   * 将输入事件坐标转换为游戏逻辑坐标。
   * H5 的 clientX/clientY 本身就是 CSS 像素，热区也是 CSS 逻辑像素，
   * 因此不能再除以 devicePixelRatio。
   */
  function toLogic(rawX, rawY) {
    var canvas = window.canvas;
    if (canvas && typeof canvas.getBoundingClientRect === 'function') {
      var rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        var logicW = (M3.Layout && M3.Layout.w) ? M3.Layout.w : rect.width;
        var logicH = (M3.Layout && M3.Layout.h) ? M3.Layout.h : rect.height;
        return {
          x: (rawX - rect.left) * (logicW / rect.width),
          y: (rawY - rect.top)  * (logicH / rect.height)
        };
      }
    }
    return { x: rawX, y: rawY };
  }

  function hitZone(tx, ty) {
    var zones = (M3.Render && M3.Render.zones) ? M3.Render.zones : [];
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (tx >= z.x && tx <= z.x + z.w && ty >= z.y && ty <= z.y + z.h) {
        return z;
      }
    }
    return null;
  }

  /** 判断坐标是否落在人物区（PLAYING 时为主内容框内区） */
  function inSceneArea(tx, ty) {
    var L = M3.Layout;
    if (!L) return false;
    // drawPlaying 每帧把 levelMainArea 设为主内容框内区，优先使用它；
    // 其它阶段回退到 layout 计算的 sceneArea。
    var sa = L.levelMainArea || L.sceneArea;
    if (!sa) return false;
    return tx >= sa.x && tx <= sa.x + sa.w
        && ty >= sa.y && ty <= sa.y + sa.h;
  }

  // ── 按下 ──────────────────────────────────────────────────────────────────

  function handleDown(rawX, rawY) {
    var p = toLogic(rawX, rawY);
    _downX = p.x;
    _downY = p.y;
    _pendingZoneId   = null;
    _pendingIsOption = false;

    var z = hitZone(p.x, p.y);
    if (!z) return;

    // 衣服选项 → 进入拖拽模式（松手时再判定）
    if (z.id.indexOf('play_option_') === 0) {
      var optIdx = parseInt(z.id.replace('play_option_', ''), 10);
      if (M3.Board && M3.Board.startDrag && M3.Board.startDrag(optIdx, p.x, p.y)) {
        _pendingZoneId   = z.id;
        _pendingIsOption = true;
      }
      return;
    }

    // 其他热区：记录下来，抬起时触发
    _pendingZoneId = z.id;
  }

  // ── 移动 ──────────────────────────────────────────────────────────────────

  function handleMove(rawX, rawY) {
    if (!M3.Board || !M3.Board.dragging) return;
    var p = toLogic(rawX, rawY);
    if (M3.Board.moveDrag) M3.Board.moveDrag(p.x, p.y);
  }

  // ── 抬起 ──────────────────────────────────────────────────────────────────

  function handleUp(rawX, rawY) {
    var p = toLogic(rawX, rawY);

    // ① 拖拽结束
    if (M3.Board && M3.Board.dragging) {
      var onChar = inSceneArea(p.x, p.y);
      var picked = M3.Board.endDrag ? M3.Board.endDrag(onChar) : -1;
      if (picked >= 0) _vibrate('light');
      _pendingZoneId   = null;
      _pendingIsOption = false;
      return;
    }

    // ② 普通按钮点击：要求抬起时仍在同一热区内
    if (_pendingZoneId && !_pendingIsOption) {
      var z = hitZone(p.x, p.y);
      if (z && z.id === _pendingZoneId) {
        var now = M3._now ? M3._now() : Date.now();
        if (now - _lastTapTime >= TAP_COOLDOWN) {
          _lastTapTime = now;
          if (M3.Game && M3.Game.onZoneTap) M3.Game.onZoneTap(z.id);
        }
      }
    }
    _pendingZoneId   = null;
    _pendingIsOption = false;
  }

  function _vibrate(type) {
    try {
      if (typeof ks !== 'undefined' && ks.vibrateShort) {
        ks.vibrateShort({ type: type || 'light' });
      }
    } catch (e) {}
  }

  // ── 事件绑定 ──────────────────────────────────────────────────────────────

  M3.Input.init = function () {
    var canvas = window.canvas;
    if (!canvas) return;

    if (typeof canvas.addEventListener === 'function') {
      // 触摸
      canvas.addEventListener('touchstart', function (e) {
        e.preventDefault && e.preventDefault();
        var t = e.changedTouches && e.changedTouches[0];
        if (t) handleDown(t.clientX, t.clientY);
      }, { passive: false });

      canvas.addEventListener('touchmove', function (e) {
        e.preventDefault && e.preventDefault();
        var t = e.changedTouches && e.changedTouches[0];
        if (t) handleMove(t.clientX, t.clientY);
      }, { passive: false });

      canvas.addEventListener('touchend', function (e) {
        e.preventDefault && e.preventDefault();
        var t = e.changedTouches && e.changedTouches[0];
        if (t) handleUp(t.clientX, t.clientY);
      }, { passive: false });

      canvas.addEventListener('touchcancel', function () {
        if (M3.Board && M3.Board.cancelDrag) M3.Board.cancelDrag();
        _pendingZoneId = null;
        _pendingIsOption = false;
      }, { passive: false });

      // 鼠标（H5 本地预览调试）
      canvas.addEventListener('mousedown', function (e) {
        handleDown(e.clientX, e.clientY);
      });
      canvas.addEventListener('mousemove', function (e) {
        handleMove(e.clientX, e.clientY);
      });
      canvas.addEventListener('mouseup', function (e) {
        handleUp(e.clientX, e.clientY);
      });
      canvas.addEventListener('mouseleave', function () {
        if (M3.Board && M3.Board.cancelDrag) M3.Board.cancelDrag();
        _pendingZoneId = null;
        _pendingIsOption = false;
      });
    }

    // 快手小游戏全局触摸（部分版本 canvas 无事件）
    if (typeof ks !== 'undefined' && ks.onTouchStart) {
      ks.onTouchStart(function (e) {
        var t = e.touches && e.touches[0];
        if (t) handleDown(t.clientX || t.pageX, t.clientY || t.pageY);
      });
      if (ks.onTouchMove) {
        ks.onTouchMove(function (e) {
          var t = e.touches && e.touches[0];
          if (t) handleMove(t.clientX || t.pageX, t.clientY || t.pageY);
        });
      }
      if (ks.onTouchEnd) {
        ks.onTouchEnd(function (e) {
          var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
          if (t) handleUp(t.clientX || t.pageX, t.clientY || t.pageY);
        });
      }
    }
  };

})();
