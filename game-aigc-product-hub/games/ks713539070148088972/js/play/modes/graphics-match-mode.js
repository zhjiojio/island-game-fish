/**
 * 图形匹配玩法共用骨架。
 *
 * 这里只抽取“拖拽这个动作”和候选区，不抽取落点判定：dressup 是单个角色矩形，
 * puzzle 是多个 slot 的邻近吸附，两者的算法应由具体玩法自己实现。
 */
(function () {
  'use strict';

  function GraphicsMatchMode(level, theme) {
    BaseMode.call(this, level, theme);
    this._dragging = null;
    this._fit = null;
    this._scrollX = 0;
    this._hintShownAt = (typeof M3 !== 'undefined' && M3._now) ? M3._now() : Date.now();
    this._hintLoops = 2;
    this._hintForced = false;
  }
  BaseMode.extend(GraphicsMatchMode);
  GraphicsMatchMode.extend = function (Ctor) {
    Ctor.prototype = Object.create(GraphicsMatchMode.prototype);
    Ctor.prototype.constructor = Ctor;
  };

  GraphicsMatchMode.prototype.getMatchConfig = function () {
    return {
      tray: { cardSize: 70, gap: 6, sidePad: 12, height: 80, gapAbove: 16, scrollable: true, hideMatched: true },
      dragGhost: { sizing: 'scale', scale: 4, baseSize: 60, offsetY: 0, fitMode: 'fit' },
      drop: { requireIdMatch: true, minHitSize: 0, wrongFeedback: 'ripple' },
      snap: { enabled: false, durationMs: 180, easing: 'easeOut', pulseScale: 1.08 },
      shuffle: true, autoAdvanceMs: 0, hintGestureMode: 'scroll-to-target'
    };
  };

  GraphicsMatchMode.prototype._getDragItem = function (id) {
    var map = this._pieceById || this._outfitById || {};
    return map[id] || null;
  };

  GraphicsMatchMode.prototype.startDrag = function (itemId, x, y) {
    var item = this._getDragItem(itemId);
    if (!item || this._isItemMatched(itemId)) return false;
    if (this._returnAnim && this._returnAnim.itemId === itemId) this._returnAnim = null;
    // itemId 是共用命名；outfitId 保留 dressup 旧实现读取的字段，确保抽取不改变旧回调协议。
    this._dragging = { itemId: itemId, outfitId: itemId, x: x, y: y };
    return true;
  };

  GraphicsMatchMode.prototype.moveDrag = function (x, y) {
    if (!this._dragging) return false;
    this._dragging.x = x;
    this._dragging.y = y;
    return true;
  };

  GraphicsMatchMode.prototype._isItemMatched = function (id) {
    return !!((this._matched || {})[id] || (this._matchedOutfits || {})[id]);
  };

  GraphicsMatchMode.prototype._isPairMatched = function (pieceId, targetId) {
    return !this.getMatchConfig().drop.requireIdMatch || pieceId === targetId;
  };

  GraphicsMatchMode.prototype._layoutStage = function () {
    var mode = this.level && this.level.mode || 'puzzle';
    var regions = CONFIG.getLayoutRegions(mode);
    var stage = regions.stage;
    var tray = this.getMatchConfig().tray;
    var trayH = tray.height;
    var stageH = Math.max(1, stage.h - trayH - tray.gapAbove);
    this._fit = { x: stage.x, y: stage.y, w: stage.w, h: stageH };
    return { stage: stage, tray: tray, trayY: stage.y + stageH + tray.gapAbove };
  };

  /**
   * 换装/拼图共用的舞台布局。
   * 只计算舞台、人物/底图、缩略栏和箭头坐标，不负责绘制和交互注册。
   */
  GraphicsMatchMode.prototype._layoutMatchStage = function (mode) {
    var W = M3.Layout.w;
    var stage = CONFIG.getLayoutRegions ? CONFIG.getLayoutRegions(mode).stage : {
      x: 0, y: 0, w: W, h: M3.Layout.h
    };
    var tray = this.getMatchConfig().tray;
    var cardGap = 16;
    var imgCardGap = 15;
    var yOffset = M3.Layout.px ? M3.Layout.px(25) : 25;
    var cardRowBottom = stage.y + stage.h - cardGap - yOffset;
    var stageY = stage.y - yOffset;
    var stageH = cardRowBottom - tray.height - imgCardGap - stageY;
    var character = { x: 0, y: stageY, w: W, h: stageH };

    return {
      stage: stage,
      character: character,
      trayY: cardRowBottom - tray.height,
      tray: {
        y: cardRowBottom - tray.height + (tray.height - tray.cardSize) / 2,
        cardSize: tray.cardSize,
        gap: tray.gap,
        height: tray.height,
        gapAbove: tray.gapAbove,
        sidePad: tray.sidePad,
        stripW: W - tray.sidePad * 2
      },
      nav: { y: character.y + character.h - 56, size: 40 }
    };
  };

  GraphicsMatchMode.prototype._layoutTray = function (layout, items) {
    var cfg = this.getMatchConfig().tray;
    var contentW = items.length * cfg.cardSize + Math.max(0, items.length - 1) * cfg.gap;
    var stripW = M3.Layout.w - cfg.sidePad * 2;
    var maxScrollX = Math.max(0, contentW - stripW);
    this._scrollX = Math.max(0, Math.min(this._scrollX, maxScrollX));
    return {
      y: layout.trayY + (cfg.height - cfg.cardSize) / 2,
      stripW: stripW,
      maxScrollX: maxScrollX,
      cardSize: cfg.cardSize,
      gap: cfg.gap,
      sidePad: cfg.sidePad
    };
  };

  GraphicsMatchMode.prototype._drawTrayBackground = function (tray, onScroll) {
    // 候选区只负责滚动热区；边框由每张卡片单独绘制。
    // 不能把 mnvFrameDashed 拉伸成整条 strip，否则会覆盖/挤压卡片，和 dressup 的表现不一致。
    if (tray.maxScrollX > 0 && this.getMatchConfig().tray.scrollable) {
      var self = this;
      var startScroll = this._scrollX, startX = 0;
      InputManager.addDrag({
        x: tray.sidePad, y: tray.y, w: tray.stripW, h: tray.cardSize,
        priority: 5, label: 'graphics-match-tray-scroll',
        onDragStart: function (x) { startScroll = self._scrollX; startX = x; },
        onDragMove: function (x) {
          self._scrollX = Math.max(0, Math.min(tray.maxScrollX, startScroll - (x - startX)));
          if (onScroll) onScroll(self._scrollX);
        }, onDragEnd: function () {}
      });
    }
  };

  GraphicsMatchMode.prototype._drawTrayCards = function (tray, items, onPick) {
    var self = this;
    for (var i = 0; i < items.length; i++) {
      (function (item, index) {
        var x = tray.sidePad + index * (tray.cardSize + tray.gap) - self._scrollX;
        if (x + tray.cardSize < tray.sidePad || x > tray.sidePad + tray.stripW) return;
        var frameSrc = CONFIG.uiAsset('mnvFrameDashed');
        if (frameSrc && TextureManager.get(frameSrc)) Renderer.drawImage(frameSrc, x, tray.y, tray.cardSize, tray.cardSize);
        else Renderer.drawRoundRect(x, tray.y, tray.cardSize, tray.cardSize, 5, { stroke: '#acabff', strokeW: 0.9 });
        // 缩略图可使用完整元素图，避免复杂遮挡关系下直接复用 result。
        // 旧配置没有 thumbnail 时继续回退到 result，再回退到 scene。
        var thumb = item.thumbnail || item.result || item.scene;
        // 拖拽时隐藏源缩略图，避免源卡片和跟手图重叠；回收动画结束后再恢复。
        var hideThumb = (self._dragging && self._dragging.itemId === item.id) ||
          (self._returnAnim && self._returnAnim.itemId === item.id);
        if (!hideThumb) {
          if (thumb) Renderer.drawImageFit(thumb, x + 4, tray.y + 4, tray.cardSize - 8, tray.cardSize - 8);
          else Renderer.drawText(item.tag || item.name || item.id, x + tray.cardSize / 2, tray.y + tray.cardSize / 2, { fontSize: 11, align: 'center', maxWidth: tray.cardSize - 10 });
        }

        var gestureMode = null, sx = 0, sy = 0, scrollStart = 0;
        InputManager.addDrag({
          x: x, y: tray.y, w: tray.cardSize, h: tray.cardSize, priority: 10,
          label: 'graphics-match-' + item.id,
          onDragStart: function (px, py) { gestureMode = null; sx = px; sy = py; scrollStart = self._scrollX; },
          onDragMove: function (px, py) {
            if (!gestureMode) {
              if (Math.abs(px - sx) < 6 && Math.abs(py - sy) < 6) return;
              gestureMode = Math.abs(px - sx) > Math.abs(py - sy) ? 'scroll' : 'place';
              if (gestureMode === 'place' && onPick) onPick(item, 'start', sx, sy);
            }
            if (gestureMode === 'scroll') self._scrollX = Math.max(0, Math.min(tray.maxScrollX, scrollStart - (px - sx)));
            else if (onPick) onPick(item, 'move', px, py);
          },
          onDragEnd: function (px, py) { if (gestureMode === 'place' && onPick) onPick(item, 'end', px, py); }
        });
      })(items[i], i);
    }
  };

  /** 当前释放点是否仍在底部缩略栏内。回到底部属于取消拖拽，不应计错。 */
  GraphicsMatchMode.prototype._isInTray = function (x, y) {
    var tray = this._trayLayout;
    if (!tray || typeof x !== 'number' || typeof y !== 'number') return false;
    var pad = 12;
    return x >= tray.sidePad - pad && x <= tray.sidePad + tray.stripW + pad &&
      y >= tray.y - pad && y <= tray.y + tray.cardSize + pad;
  };

  GraphicsMatchMode.prototype._startReturnAnimation = function (itemId, x, y, fromSize) {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    var tray = this._trayLayout;
    this._returnAnim = {
      itemId: itemId, fromX: x, fromY: y, fromSize: fromSize || 60,
      startedAt: M3._now(), durationMs: 220,
      traySize: tray ? Math.max(1, tray.cardSize - 8) : 62
    };
  };

  GraphicsMatchMode.prototype._getTrayItemCenter = function (itemId) {
    var layout = this._trayLayout;
    if (!layout) return null;
    var items = this._getAvailableItems();
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === itemId) {
        return {
          x: layout.sidePad + i * (layout.cardSize + layout.gap) - this._scrollX + layout.cardSize / 2,
          y: layout.y + layout.cardSize / 2
        };
      }
    }
    return null;
  };

  /**
   * 拖拽体靠近底部栏时的视觉提示：越接近缩略栏，缩放越小。
   * 从缩略栏上方约 50px 开始生效，进入栏内时缩到接近卡片内容尺寸。
   */
  GraphicsMatchMode.prototype._getTrayApproachScale = function (y) {
    var tray = this._trayLayout;
    if (!tray || typeof y !== 'number') return 1;
    var trayCenterY = tray.y + tray.cardSize / 2;
    var approachRange = 50;
    var progress = Math.max(0, Math.min(1, (y - (trayCenterY - approachRange)) / approachRange));
    return 1 - progress * 0.7;
  };

  GraphicsMatchMode.prototype._drawDragGhost = function (item) {
    if (!this._dragging || !item) return;
    var cfg = this.getMatchConfig().dragGhost;
    var src = item.thumbnail || item.result || item.scene;
    var x = this._dragging.x, y = this._dragging.y + (cfg.offsetY || 0);
    var approachScale = this._getTrayApproachScale(y);
    if (cfg.sizing === 'actual' && this._fit && item.w != null && item.h != null) {
      var w = item.w / 100 * this._fit.w * approachScale;
      var h = item.h / 100 * this._fit.h * approachScale;
      if (src) Renderer.drawImage(src, x - w / 2, y - h / 2, w, h);
      return;
    }
    var size = (cfg.baseSize || 60) * (cfg.scale || 1) * approachScale;
    if (src) Renderer.drawImageFit(src, x - size / 2, y - size / 2, size, size);
  };

  GraphicsMatchMode.prototype._scrollToItem = function (itemId, items) {
    var cfg = this.getMatchConfig().tray;
    var list = items || this._getAvailableItems();
    for (var i = 0; i < list.length; i++) if (list[i].id === itemId) {
      var stripW = M3.Layout.w - cfg.sidePad * 2;
      var desired = i * (cfg.cardSize + cfg.gap) + cfg.cardSize / 2 - stripW / 2;
      var contentW = list.length * cfg.cardSize + Math.max(0, list.length - 1) * cfg.gap;
      this._scrollX = Math.max(0, Math.min(Math.max(0, contentW - stripW), desired));
      return;
    }
  };

  GraphicsMatchMode.prototype._getAvailableItems = function () { return []; };

  window.GraphicsMatchMode = GraphicsMatchMode;
})();
