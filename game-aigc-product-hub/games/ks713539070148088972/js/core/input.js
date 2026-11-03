/**
 * core/input.js — 点击/触摸事件系统
 * 职责：
 *   - 管理 tapAreas 注册表（每帧由场景/弹窗重建）
 *   - handleTap：100ms debounce + priority 降序命中 + 金色涟漪
 *   - handleMove：隐私浮层等需要 scroll 的场景
 *   - 输入源：canvas touchstart + ks.onTouchStart 双绑定
 * 依赖：GLContext, Renderer
 * 导出：InputManager
 *
 * tapArea 格式：
 *   { x, y, w, h, priority, onTap(cx,cy), label? }
 *   priority 越大越先命中（弹窗 > 游戏页 > 背景）
 */
(function () {
  'use strict';

  var _areas     = [];
  var _dragAreas = [];
  var _dragState = null;
  var _ripples   = [];   // [{x,y,t,maxR}]
  var _lastTap   = 0;
  var DEBOUNCE   = 100;  // ms

  // 全局 move 监听器（由 Welcome/ScrollModal 注册）
  var _moveListeners = [];

  // 全局双指缩放监听器（由玩法模式在支持放大的关卡里注册，见 CONFIG.getShowZoom）
  var _pinchListeners = [];

  // 全局单指平移监听器（放大后单指拖拽平移图片，见 base-mode.js applyPinch(1,dx,dy)）
  var _panListeners = [];

  // 「手势模式」判定函数：由 play.js 在放大功能开启的关卡里注册，返回 true 时才启用
  // 下方「延迟触发 tap + 移动转平移 + 双指立即取消」这套手势判定；未注册/返回 false 时
  // 沿用最原始的「touchstart 立即 tap」逻辑，避免给不支持放大的场景（首页/换装拖拽等）
  // 平白增加点击延迟或误判风险。
  var _gestureModeFn = null;

  var InputManager = window.InputManager = {

    /** 清空本帧所有 tapArea（每帧 draw 开始时调用） */
    clear: function () {
      _areas.length = 0;
      _dragAreas.length = 0;
    },

    /**
     * 注册点击热区
     * @param {object} area  { x, y, w, h, priority, onTap, label? }
     */
    add: function (area) {
      _areas.push(area);
    },

    /**
     * 批量注册
     * @param {object[]} areas
     */
    addAll: function (areas) {
      for (var i = 0; i < areas.length; i++) _areas.push(areas[i]);
    },

    /**
     * 注册拖拽热区
     * @param {object} area  { x, y, w, h, priority, onDragStart, onDragMove, onDragEnd, label? }
     */
    addDrag: function (area) {
      _dragAreas.push(area);
    },

    /** 批量注册拖拽热区 */
    addDragAll: function (areas) {
      for (var i = 0; i < areas.length; i++) _dragAreas.push(areas[i]);
    },

    /** 是否正在拖拽 */
    isDragging: function () {
      return !!_dragState;
    },

    /**
     * 取消当前拖拽，不触发 onDragEnd。
     * 广告/系统弹窗会中断触摸生命周期，iOS 返回后可能没有补发 touchend，
     * 必须主动清理，否则后续点击都会被残留拖拽状态吸收。
     */
    cancelDrag: function () {
      _dragState = null;
    },

    /**
     * 只做命中探测，不触发 onTap/涟漪/debounce（供 bindCanvas 判断按下点落在哪个
     * priority 的区域，从而决定是否启用「tap/拖拽平移」手势判定——只有落在舞台
     * 区域（priority 0，即找茬图片区）才需要手势判定，HUD 按钮等更高 priority
     * 区域应保持原来的「按下即触发」，不需要抬手判定，点击才不会显得迟钝）。
     * @param {number} cx,cy
     * @returns {object|null} 命中的 area，未命中任何区域返回 null
     */
    peekArea: function (cx, cy) {
      var sorted = _areas.slice().sort(function (a, b) {
        return (b.priority || 0) - (a.priority || 0);
      });
      for (var i = 0; i < sorted.length; i++) {
        var a = sorted[i];
        if (cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h) return a;
      }
      return null;
    },

    /**
     * 处理点击事件
     * @param {number} cx,cy  逻辑像素坐标
     */
    handleTap: function (cx, cy) {
      if (_dragState) return;
      var now = M3._now();
      if (now - _lastTap < DEBOUNCE) return;
      _lastTap = now;

      // 按 priority 降序排序（高 priority 先命中）
      var sorted = _areas.slice().sort(function (a, b) {
        return (b.priority || 0) - (a.priority || 0);
      });

      for (var i = 0; i < sorted.length; i++) {
        var a = sorted[i];
        if (cx >= a.x && cx <= a.x + a.w && cy >= a.y && cy <= a.y + a.h) {
          // 添加金色涟漪
          _ripples.push({ x: cx, y: cy, t: now, maxR: 28, rgb: '255,200,60', style: 'fill' });
          if (a.onTap) {
            try { a.onTap(cx, cy); } catch (e) { console.error('[Input] onTap error', a.label, e); }
          }
          return; // 命中即停止，防穿透
        }
      }
    },

    /**
     * 处理拖拽开始
     * @param {number} cx, cy  逻辑像素坐标
     * @returns {boolean}  命中 dragArea 返回 true
     */
    handleDragStart: function (cx, cy) {
      // 小游戏环境里同一次触摸可能同时经过 canvas 事件和 ks.onTouchStart。
      // 第一次事件已经建立拖拽状态，后续重复事件只能吸收，不能再次触发按钮回调。
      if (_dragState) return true;
      var sorted = _dragAreas.slice().sort(function (a, b) {
        return (b.priority || 0) - (a.priority || 0);
      });
      for (var i = 0; i < sorted.length; i++) {
        var area = sorted[i];
        if (cx >= area.x && cx <= area.x + area.w && cy >= area.y && cy <= area.y + area.h) {
          _dragState = { area: area, startX: cx, startY: cy, x: cx, y: cy };
          if (area.onDragStart) area.onDragStart(cx, cy);
          return true;
        }
      }
      return false;
    },

    /**
     * 处理拖拽移动
     * @param {number} cx, cy
     * @returns {boolean}  正在拖拽返回 true
     */
    handleDragMove: function (cx, cy) {
      if (!_dragState) return false;
      _dragState.x = cx;
      _dragState.y = cy;
      if (_dragState.area.onDragMove) _dragState.area.onDragMove(cx, cy);
      return true;
    },

    /**
     * 处理拖拽结束
     * @param {number} cx, cy
     * @returns {boolean}  正在拖拽返回 true
     */
    handleDragEnd: function (cx, cy) {
      if (!_dragState) return false;
      var area = _dragState.area;
      _dragState = null;
      if (area.onDragEnd) area.onDragEnd(cx, cy);
      return true;
    },

    /**
     * 处理移动事件（用于滚动浮层）
     * @param {number} cx,cy
     */
    handleMove: function (cx, cy) {
      for (var i = 0; i < _moveListeners.length; i++) {
        try { _moveListeners[i](cx, cy); } catch (e) {}
      }
    },

    /**
     * 注册 move 监听（弹窗打开时注册，关闭时移除）
     * @param {Function} fn
     */
    onMove: function (fn) {
      _moveListeners.push(fn);
    },

    offMove: function (fn) {
      var idx = _moveListeners.indexOf(fn);
      if (idx >= 0) _moveListeners.splice(idx, 1);
    },

    /**
     * 处理双指缩放事件（由 bindCanvas 内的多点触控检测调用）
     * @param {number} scaleDelta  本帧相对上一帧的距离比值（>1 张开/放大，<1 捏合/缩小）
     * @param {number} dxScreen,dyScreen  两指中点本帧相对上一帧的位移（逻辑像素，用于双指平移）
     */
    handlePinch: function (scaleDelta, dxScreen, dyScreen) {
      for (var i = 0; i < _pinchListeners.length; i++) {
        try { _pinchListeners[i](scaleDelta, dxScreen, dyScreen); } catch (e) { console.error('[Input] pinch listener error', e); }
      }
    },

    /**
     * 注册双指缩放监听（玩法模式进入时注册，退出时 offPinch 移除）
     * @param {Function} fn  (scaleDelta, dxScreen, dyScreen) => void
     */
    onPinch: function (fn) {
      _pinchListeners.push(fn);
    },

    offPinch: function (fn) {
      var idx = _pinchListeners.indexOf(fn);
      if (idx >= 0) _pinchListeners.splice(idx, 1);
    },

    /**
     * 处理单指平移事件（放大后按住拖动，见 bindCanvas 内「手势模式」下的移动转平移逻辑）
     * @param {number} dxScreen,dyScreen  本帧相对上一帧的位移（逻辑像素）
     */
    handlePan: function (dxScreen, dyScreen) {
      for (var i = 0; i < _panListeners.length; i++) {
        try { _panListeners[i](dxScreen, dyScreen); } catch (e) { console.error('[Input] pan listener error', e); }
      }
    },

    /** 注册单指平移监听 */
    onPan: function (fn) {
      _panListeners.push(fn);
    },

    offPan: function (fn) {
      var idx = _panListeners.indexOf(fn);
      if (idx >= 0) _panListeners.splice(idx, 1);
    },

    /**
     * 注册「手势模式」判定函数：返回 true 时，单指按下不会立即触发 tap，而是等待
     * TAP_DELAY 毫秒——期间若移动超过 MOVE_CANCEL_PX 视为拖拽平移（转发 handlePan），
     * 若第二根手指按下则立即取消（转入双指缩放，见 handleMultiStart）；未移动则到时
     * 正常触发 tap。只有 play.js 在放大功能开启的关卡里会注册为 true，其余场景
     * （首页/换装拖拽等）保持旧版「按下即触发」的即时手感。
     * @param {Function} fn  () => boolean
     */
    setGestureMode: function (fn) {
      _gestureModeFn = fn;
    },

    /**
     * 绘制涟漪（由 Renderer 在所有场景绘制后调用）
     * style: 'fill'（默认，实心圆点扩散，普通点击用）/ 'ring'（描边圆环扩散，点错反馈用）
     */
    drawRipples: function () {
      var now = M3._now();
      for (var i = _ripples.length - 1; i >= 0; i--) {
        var r = _ripples[i];
        var life = r.life || 400;
        var t = now - r.t;
        if (t > life) { _ripples.splice(i, 1); continue; }
        var progress = t / life;
        var radius   = r.maxR * progress;
        var alpha    = (1 - progress) * 0.7;
        var rgb      = r.rgb || '255,200,60';
        if (r.style === 'ring') {
          Renderer.drawCircle(r.x, r.y, radius, {
            fill: 'rgba(0,0,0,0)',
            stroke: 'rgba(' + rgb + ',' + alpha.toFixed(2) + ')',
            strokeW: 3
          });
        } else {
          Renderer.drawCircle(r.x, r.y, radius, {
            fill: 'rgba(' + rgb + ',' + alpha.toFixed(2) + ')'
          });
        }
      }
    },

    /** 添加错误涟漪（红色描边圆环，从命中点向外扩散） */
    addErrRipple: function (cx, cy) {
      _ripples.push({ x: cx, y: cy, t: M3._now(), maxR: 44, life: 500, rgb: '255,60,60', style: 'ring' });
    },

    /** 绑定输入源到 canvas */
    bindCanvas: function (canvas) {
      var self = this;

      function toLogical(clientX, clientY) {
        var dpr  = GLContext.dpr;
        var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : {left:0,top:0};
        return {
          x: (clientX - rect.left),
          y: (clientY - rect.top)
        };
      }

      function tX(t) { return t.clientX !== undefined ? t.clientX : t.x; }
      function tY(t) { return t.clientY !== undefined ? t.clientY : t.y; }

      function onTouch(touches, handler) {
        if (!touches || touches.length === 0) return;
        var t = touches[0];
        var p = toLogical(tX(t), tY(t));
        handler.call(self, p.x, p.y);
      }

      function isGestureMode() { return !!(_gestureModeFn && _gestureModeFn()); }

      // ── 单指 tap / 拖拽平移判定（仅「手势模式」开启时生效）───────────────────
      // 按下先不触发 tap，而是记录起点；移动超过 MOVE_CANCEL_PX → 判定为拖拽平移
      // （转发 handlePan，不再触发 tap）；未超过阈值就抬手 → 在 touchend 时立即
      // 触发 tap（而不是用定时器延迟触发——定时器方案在快速点击时经常被 touchend
      // 先一步清空，导致"点了没反应，多点几次才生效"）。期间第二根手指按下会被
      // handleMultiStart 立即打断（clearPending），转入双指捏合。
      var MOVE_CANCEL_PX = 18;  // px（判定为拖拽而非点击的最小位移，适当放宽避免正常点击被误判成拖拽）
      var _pending = null;      // {x,y,lastX,lastY,panning}
      // canvas 事件和 ks 原生事件可能同时到达。同一次真实触摸在两个输入源
      // 上通常具有相同坐标且时间非常接近，因此在分发入口去重，而不是用
      // _dragState 拦截所有后续点击。
      var _lastStart = null;    // {x, y, at}
      var START_DEDUPE_MS = 120;
      var START_DEDUPE_DISTANCE = 8;

      function clearPending() {
        _pending = null;
      }

      function isDuplicateStart(cx, cy) {
        if (!_lastStart) return false;
        var now = M3._now();
        var dx = cx - _lastStart.x, dy = cy - _lastStart.y;
        return now - _lastStart.at <= START_DEDUPE_MS &&
          Math.sqrt(dx * dx + dy * dy) <= START_DEDUPE_DISTANCE;
      }

      function rememberStart(cx, cy) {
        _lastStart = { x: cx, y: cy, at: M3._now() };
      }

      /** start 分发：先尝试 dragArea（即时响应，如换装缩略图拖拽），未命中则走 tapArea。
       *  只有命中「舞台」区域（priority 0，即找茬图片区，见 play.js 'stage-tap'）才启用
       *  tap/拖拽平移手势判定；命中 HUD 按钮等更高 priority 区域（含未命中任何区域）
       *  一律保持原来的「按下即触发」，避免按钮点击被强加一层不必要的抬手判定而变迟钝。 */
      function handleStart(cx, cy) {
        if (isDuplicateStart(cx, cy)) return;
        rememberStart(cx, cy);
        if (self.handleDragStart(cx, cy)) return;
        if (!isGestureMode()) { self.handleTap(cx, cy); return; }
        var hit = self.peekArea(cx, cy);
        if (!hit || (hit.priority || 0) > 0) { self.handleTap(cx, cy); return; }
        _pending = { x: cx, y: cy, lastX: cx, lastY: cy, panning: false };
      }

      /** move 分发：先尝试 dragMove；手势模式下 pending tap 超过阈值转为持续平移；否则走既有 move 监听 */
      function handleMoveDispatch(cx, cy) {
        if (self.handleDragMove(cx, cy)) return;
        if (_pending) {
          if (!_pending.panning) {
            var dx0 = cx - _pending.x, dy0 = cy - _pending.y;
            if (Math.sqrt(dx0 * dx0 + dy0 * dy0) >= MOVE_CANCEL_PX) {
              _pending.panning = true;
            }
          }
          if (_pending.panning) {
            self.handlePan(cx - _pending.lastX, cy - _pending.lastY);
            _pending.lastX = cx; _pending.lastY = cy;
          }
          return;
        }
        self.handleMove(cx, cy);
      }

      /** end 分发：抬手时若仍是「未移动」的 pending → 立即触发 tap；否则只是拖拽结束 */
      function handleEndDispatch(cx, cy) {
        if (_pending) {
          var p = _pending;
          _pending = null;
          if (!p.panning) self.handleTap(p.x, p.y);
        }
        self.handleDragEnd(cx, cy);
      }

      // ── 双指捏合/张开缩放检测（与单指 tap/drag/move 并存，touches.length>=2 时接管）──
      // _pinch 记录上一帧两指间距与中点，逐帧算出 scaleDelta（距离比值）+ 中点位移，
      // 通过 InputManager.handlePinch 广播给已注册的玩法模式（见 base-mode.js applyPinch）。
      var _pinch = null;

      function pinchSnapshot(touches) {
        var p0 = toLogical(tX(touches[0]), tY(touches[0]));
        var p1 = toLogical(tX(touches[1]), tY(touches[1]));
        var dx = p1.x - p0.x, dy = p1.y - p0.y;
        return {
          dist: Math.sqrt(dx * dx + dy * dy),
          midX: (p0.x + p1.x) / 2,
          midY: (p0.y + p1.y) / 2
        };
      }

      function handleMultiStart(touches) {
        if (touches && touches.length >= 2) {
          // 第二根手指按下：立即取消可能正在等待的单指 tap/平移，避免误触命中判定
          clearPending();
          _pinch = pinchSnapshot(touches);
          return true;
        }
        return false;
      }

      function handleMultiMove(touches) {
        if (touches && touches.length >= 2) {
          var snap = pinchSnapshot(touches);
          if (_pinch) {
            var scaleDelta = _pinch.dist > 0 ? (snap.dist / _pinch.dist) : 1;
            self.handlePinch(scaleDelta, snap.midX - _pinch.midX, snap.midY - _pinch.midY);
          }
          _pinch = snap;
          return true;
        }
        return false;
      }

      function handleMultiEnd(touches) {
        if (!touches || touches.length < 2) { _pinch = null; }
      }

      function cancelInterruptedGesture() {
        clearPending();
        _pinch = null;
        self.cancelDrag();
        _lastStart = null;
      }

      // DOM 事件
      canvas.addEventListener('touchstart', function (e) {
        if (handleMultiStart(e.touches)) return;
        onTouch(e.changedTouches, handleStart);
      }, { passive: true });
      canvas.addEventListener('touchmove', function (e) {
        if (handleMultiMove(e.touches)) return;
        onTouch(e.changedTouches, handleMoveDispatch);
      }, { passive: true });
      canvas.addEventListener('touchend', function (e) {
        handleMultiEnd(e.touches);
        if (e.touches && e.touches.length > 0) return; // 还有手指按着，不触发 dragEnd
        onTouch(e.changedTouches, handleEndDispatch);
      }, { passive: true });
      canvas.addEventListener('touchcancel', function () {
        cancelInterruptedGesture();
      }, { passive: true });
      canvas.addEventListener('mousedown', function (e) {
        handleStart(e.offsetX, e.offsetY);
      });
      canvas.addEventListener('mousemove', function (e) {
        handleMoveDispatch(e.offsetX, e.offsetY);
      });
      canvas.addEventListener('mouseup', function (e) {
        handleEndDispatch(e.offsetX, e.offsetY);
      });

      // 快手小游戏原生事件
      if (typeof ks !== 'undefined') {
        ks.onTouchStart(function (e) {
          if (handleMultiStart(e.touches)) return;
          onTouch(e.touches, handleStart);
        });
        ks.onTouchMove(function (e) {
          if (handleMultiMove(e.touches)) return;
          onTouch(e.touches, handleMoveDispatch);
        });
        ks.onTouchEnd(function (e) {
          handleMultiEnd(e.touches);
          if (e.touches && e.touches.length > 0) return;
          onTouch(e.touches, handleEndDispatch);
        });
        if (ks.onTouchCancel) {
          ks.onTouchCancel(function () { cancelInterruptedGesture(); });
        }
      }

      // 广告、系统弹窗、切后台都可能让 touchend 永远不回来，必须把整套
      // 手势状态一起清掉，避免下一次进入页面继续被旧状态拦截。
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('blur', cancelInterruptedGesture);
        window.addEventListener('pagehide', cancelInterruptedGesture);
      }
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) cancelInterruptedGesture();
        });
      }
    }
  };
})();
