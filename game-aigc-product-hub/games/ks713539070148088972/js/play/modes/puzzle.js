/** puzzle：底图 + 可拖拽子元素的图形拼图玩法。 */
(function () {
  'use strict';

  if (typeof GraphicsMatchMode === 'undefined' && typeof require === 'function') {
    require('./graphics-match-mode.js');
  }

  function PuzzleMode(level, theme) {
    GraphicsMatchMode.call(this, level, theme);
    this._scenes = (level.scenes || []).slice();
    if (!this._scenes.length) {
      // 兼容旧的单底图结构；新后台统一使用 scenes[]。
      this._scenes = [{ id: 'scene_0', scene: level.scene, completeImage: level.completeImage, odds: level.odds || [] }];
    }
    this._currentScene = 0;
    this._slots = [];
    this._pieceById = {};
    this._matched = {};
    this._matchedCount = 0;
    this._totalCount = 0;
    this._completed = false;
    this._timedOut = false;
    this._snap = null;
    this._hintShownAt = (typeof M3 !== 'undefined' && M3._now) ? M3._now() : Date.now();
    this._hintTargetPieceId = null;
    this._hintForced = false;
    this._hintLoops = 2;
    for (var i = 0; i < this._scenes.length; i++) {
      var sceneSlots = this._scenes[i].odds || [];
      for (var j = 0; j < sceneSlots.length; j++) {
        sceneSlots[j]._sceneIndex = i;
        this._slots.push(sceneSlots[j]);
        this._pieceById[sceneSlots[j].id] = sceneSlots[j];
      }
    }
    // 必须在汇总所有 scenes[].odds 后计算，否则总数会一直是 0，顶部进度点无法绘制。
    this._totalCount = this._slots.length;
    if (this.getMatchConfig().shuffle) {
      for (var s = this._slots.length - 1; s > 0; s--) {
        var r = Math.floor(Math.random() * (s + 1));
        var tmp = this._slots[s]; this._slots[s] = this._slots[r]; this._slots[r] = tmp;
      }
    }
    // 开场复用换装玩法的引导手，让玩家立即理解“从底部拖到对应位置”。
    this.onHint(null, true, 4);
  }
  GraphicsMatchMode.extend(PuzzleMode);

  // 资源分组顺序：第一张底图+第一张子元素线稿 → 其他底图/线稿 →
  // 所有场景缩略图+所有彩色图+主题通关图。第一组是进入关卡首帧必须优先到位的资源。
  PuzzleMode.collectAssetGroups = function (level, theme) {
    var scenes = (level.scenes || []).slice();
    if (!scenes.length) scenes = [{ scene: level.scene, odds: level.odds || [] }];
    var first = scenes[0] || {};
    var firstOdd = (first.odds || [])[0] || {};
    var firstGroup = [first.scene, firstOdd.scene];
    var thumbnails = [];
    var linearts = [];
    var colored = [];

    scenes.forEach(function (scene) {
      if (scene !== first && scene.scene) linearts.push(scene.scene);
      (scene.odds || []).forEach(function (odd, index) {
        thumbnails.push(odd.thumbnail);
        if (!(scene === first && index === 0)) linearts.push(odd.scene);
        colored.push(odd.result);
      });
    });

    // 第一张子元素的线稿已经进入首帧优先组，其他线稿位于第二层；
    // 缩略图和彩色图统一放在第三层，避免拆成不同优先级。
    colored.push(level.completeImage, theme && theme.completeImage);
    return [firstGroup, linearts, thumbnails.concat(colored)];
  };

  PuzzleMode.prototype.getMatchConfig = function () {
    return {
      tray: { cardSize: 70, gap: 6, sidePad: 12, height: 80, gapAbove: 16, scrollable: true, hideMatched: true },
      dragGhost: { sizing: 'actual', scale: 1, baseSize: 60, offsetY: 0, fitMode: 'stretch' },
      // 判定半径 = 目标短边 × hitRadiusRatio，且不低于 minHitSize。
      // 相比默认的 60% / 60px，拼图使用更严格的 35% / 30px。
      drop: { requireIdMatch: true, hitRadiusRatio: 0.35, minHitSize: 30, wrongFeedback: 'ripple' },
      snap: { enabled: true, durationMs: 180, easing: 'easeOut', pulseScale: 1.08 },
      shuffle: true, autoAdvanceMs: 0, hintGestureMode: 'scroll-to-target'
    };
  };

  // 拼图缩略栏沿用换装玩法的底部定位：底部功能栏上方预留 16px，
  // 再整体上移 25px，保证两个玩法的舞台/缩略栏落在同一条视觉基准线上。
  PuzzleMode.prototype._layoutStage = function () {
    return this._layoutMatchStage('puzzle');
  };

  PuzzleMode.prototype._getAvailableItems = function () {
    var list = [];
    for (var i = 0; i < this._slots.length; i++) if (!this._matched[this._slots[i].id]) list.push(this._slots[i]);
    return list;
  };

  // 提示顺序固定按 scenes[].odds[]，不能复用底部缩略栏的随机顺序。
  PuzzleMode.prototype._getHintPiece = function () {
    for (var si = 0; si < this._scenes.length; si++) {
      var odds = this._scenes[si].odds || [];
      for (var oi = 0; oi < odds.length; oi++) {
        if (!this._matched[odds[oi].id]) return odds[oi];
      }
    }
    return null;
  };

  PuzzleMode.prototype._getCurrentScene = function () { return this._scenes[this._currentScene] || {}; };
  PuzzleMode.prototype._getCurrentSlots = function () {
    var scene = this._getCurrentScene();
    return scene.odds || [];
  };

  PuzzleMode.prototype.switchScene = function (direction) {
    var next = this._currentScene + direction;
    if (next < 0 || next >= this._scenes.length) return false;
    this._currentScene = next;
    return true;
  };

  PuzzleMode.prototype.getCompleteImage = function () {
    var scene = this._getCurrentScene();
    return scene.completeImage || null;
  };

  PuzzleMode.prototype.getPuzzleState = function () {
    return { matched: this._matched, matchedCount: this._matchedCount, totalCount: this._totalCount, dragging: this._dragging };
  };

  PuzzleMode.prototype._findDropTarget = function (x, y) {
    var fit = this._fit, cfg = this.getMatchConfig();
    if (!fit) return null;
    var best = null, bestD = Infinity;
    var minHit = cfg.drop.minHitSize || 0;
    if (M3.Layout.px) minHit = M3.Layout.px(minHit);
    var currentSlots = this._getCurrentSlots();
    for (var i = 0; i < currentSlots.length; i++) {
      var slot = currentSlots[i];
      if (this._matched[slot.id]) continue;
      var sw = (slot.w || 0) / 100 * fit.w;
      var sh = (slot.h || 0) / 100 * fit.h;
      var scx = fit.x + (slot.x || 0) / 100 * fit.w + sw / 2;
      var scy = fit.y + (slot.y || 0) / 100 * fit.h + sh / 2;
      var hitRadiusRatio = typeof cfg.drop.hitRadiusRatio === 'number' ? cfg.drop.hitRadiusRatio : 0.35;
      var minHitRadius = M3.Layout.px ? M3.Layout.px(30) : 30;
      var radius = Math.max(Math.min(sw, sh) * hitRadiusRatio, minHitRadius, minHit);
      var d = Math.sqrt((x - scx) * (x - scx) + (y - scy) * (y - scy));
      if (d < radius && d < bestD) { bestD = d; best = slot; }
    }
    return best;
  };

  PuzzleMode.prototype._slotRect = function (slot) {
    return {
      x: this._fit.x + (slot.x || 0) / 100 * this._fit.w,
      y: this._fit.y + (slot.y || 0) / 100 * this._fit.h,
      w: (slot.w || 0) / 100 * this._fit.w,
      h: (slot.h || 0) / 100 * this._fit.h
    };
  };

  PuzzleMode.prototype._returnToTray = function (itemId, x, y) {
    // 候选卡片仍在列表中，动画只负责把拖拽体缩小并送回对应卡片。
    this._startReturnAnimation(itemId, x, y, 60);
  };

  PuzzleMode.prototype._getTrayItemCenter = function (itemId) {
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

  PuzzleMode.prototype._drawReturnAnimation = function () {
    var anim = this._returnAnim;
    if (!anim) return;
    var item = this._pieceById[anim.itemId];
    var target = this._getTrayItemCenter(anim.itemId);
    if (!item || !target) { this._returnAnim = null; return; }
    var age = M3._now() - anim.startedAt;
    var p = Math.min(1, age / anim.durationMs);
    if (p >= 1) { this._returnAnim = null; return; }
    var ease = 1 - Math.pow(1 - p, 3);
    var x = anim.fromX + (target.x - anim.fromX) * ease;
    var y = anim.fromY + (target.y - anim.fromY) * ease;
    var src = item.thumbnail || item.result || item.scene;
    var size = anim.fromSize + (anim.traySize - anim.fromSize) * ease;
    if (src) Renderer.drawImageFit(src, x - size / 2, y - size / 2, size, size, 1);
  };

  PuzzleMode.prototype._startSnap = function (piece, slot) {
    if (!this.getMatchConfig().snap.enabled) return;
    this._snap = { id: piece.id, slot: slot, startedAt: M3._now() };
  };

  PuzzleMode.prototype.endDrag = function (x, y) {
    if (!this._dragging) return { accepted: false, reason: 'not-dragging' };
    var piece = this._getDragItem(this._dragging.itemId);
    this._dragging = null;
    if (!piece || this._matched[piece.id]) return { accepted: false, reason: 'already-matched' };
    if (this._isInTray(x, y)) {
      this._returnToTray(piece.id, x, y);
      return { accepted: true, correct: false, complete: false, reason: 'returned-to-tray' };
    }
    var slot = this._findDropTarget(x, y);
    if (!slot) {
      // 拖到舞台空白处也算一次错误尝试，和拖到错误拼图位置保持一致。
      if (window.PlayController && PlayController.onModeWrong) PlayController.onModeWrong(piece, x, y);
      this._returnToTray(piece.id, x, y);
      return { accepted: true, correct: false, complete: false, reason: 'no-target' };
    }
    if (!this._isPairMatched(piece.id, slot.id)) {
      if (window.PlayController && PlayController.onModeWrong) PlayController.onModeWrong(piece, x, y);
      this._returnToTray(piece.id, x, y);
      return { accepted: true, correct: false, complete: false };
    }
    this._matched[piece.id] = true;
    this._matchedCount++;
    this._startSnap(piece, slot);
    if (window.PlayController && PlayController.onModeCorrect) PlayController.onModeCorrect(piece, x, y, this._matchedCount - 1);
    var complete = this._matchedCount === this._totalCount;
    if (complete && !this._completed) {
      this._completed = true;
      setTimeout(function () {
        if (window.PlayController && PlayController.onModeComplete) PlayController.onModeComplete();
      }, this.getMatchConfig().snap.durationMs + 420);
    }
    return { accepted: true, correct: true, complete: complete };
  };

  PuzzleMode.prototype._drawTargetArea = function () {
    if (!this._fit) return;
    var bounds = this._fit;
    var list = this._getCurrentSlots().slice().sort(function (a, b) {
      var dz = (a.zIndex || 0) - (b.zIndex || 0);
      if (dz) return dz;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    for (var i = 0; i < list.length; i++) {
      var slot = list[i], src = this._matched[slot.id] ? slot.result : slot.scene;
      var r = this._slotRect(slot);
      if (!src) continue;

      // 允许配置坐标越过底图，但只绘制它与舞台矩形相交的部分。
      // 使用 UV 裁剪，避免元素溢出到缩略栏或改变缩略栏布局。
      var x1 = Math.max(r.x, bounds.x);
      var y1 = Math.max(r.y, bounds.y);
      var x2 = Math.min(r.x + r.w, bounds.x + bounds.w);
      var y2 = Math.min(r.y + r.h, bounds.y + bounds.h);
      if (x1 >= x2 || y1 >= y2) continue;
      var u0 = (x1 - r.x) / r.w;
      var v0 = (y1 - r.y) / r.h;
      var us = (x2 - x1) / r.w;
      var vs = (y2 - y1) / r.h;
      Renderer.drawImageRegion(src, x1, y1, x2 - x1, y2 - y1, u0, v0, us, vs);
    }
  };

  PuzzleMode.prototype.draw = function () {
    var layout = this._layoutStage();
    var character = layout.character;
    var scene = this._getCurrentScene();
    if (scene.scene) {
      this._fit = this._calcFitWidth(scene.scene, character.x, character.y, character.w, character.h);
      if (this._fit) this._fit.y = character.y + character.h - this._fit.h;
    }
    if (!this._fit) this._fit = { x: character.x, y: character.y, w: character.w, h: character.h };
    if (scene.scene) Renderer.drawImage(scene.scene, this._fit.x, this._fit.y, this._fit.w, this._fit.h);
    this._drawTargetArea();
    this._drawImageDividers(this._fit.y, this._fit.y + this._fit.h);

    var self = this;
    var navY = layout.nav.y;
    var navSize = layout.nav.size;
    if (this._currentScene > 0) {
      var leftSrc = CONFIG.uiAsset('gameNavLeft') || CONFIG.uiAsset('btnBack');
      Renderer.drawImage(leftSrc, 8, navY, navSize, navSize);
      InputManager.add({ x: 8, y: navY, w: navSize, h: navSize, priority: 20, label: 'puzzle-prev', onTap: function () { self.switchScene(-1); } });
    }
    if (this._currentScene < this._scenes.length - 1) {
      var rightSrc = CONFIG.uiAsset('gameNavRight') || CONFIG.uiAsset('btnBack');
      Renderer.drawImage(rightSrc, M3.Layout.w - 48, navY, navSize, navSize);
      InputManager.add({ x: M3.Layout.w - 48, y: navY, w: navSize, h: navSize, priority: 20, label: 'puzzle-next', onTap: function () { self.switchScene(1); } });
    }

    var items = this._getAvailableItems();
    var tray = this._layoutTray(layout, items);
    this._trayLayout = tray;
    this._drawTrayBackground(tray);
    this._drawTrayCards(tray, items, function (piece, action, x, y) {
      if (action === 'start') { if (self.startDrag(piece.id, x, y) && Audio.playDressupOutfitPick) Audio.playDressupOutfitPick(); }
      else if (action === 'move') self.moveDrag(x, y);
      else self.endDrag(x, y);
    });
    this._drawHintGesture(items);
    if (this._dragging) this._drawDragGhost(this._getDragItem(this._dragging.itemId));
    this._drawReturnAnimation();
  };

  PuzzleMode.prototype._drawHintGesture = function (items) {
    if (!this._hintTargetPieceId || this._dragging || this._completed) return;
    var piece = this._pieceById[this._hintTargetPieceId];
    if (!piece || this._matched[piece.id] || piece._sceneIndex !== this._currentScene) return;
    var handSrc = CONFIG.uiAsset('tapHand');
    if (!handSrc || !TextureManager.get(handSrc)) return;

    var start = this._getTrayItemCenter(piece.id);
    var rect = this._slotRect(piece);
    if (!start || !rect) return;
    var end = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    var cycleMs = 1600;
    var totalMs = cycleMs * (this._hintLoops || 2);
    var age = M3._now() - this._hintShownAt;
    if (age >= totalMs) return;

    var t = age % cycleMs;
    var x = start.x, y = start.y, alpha = 0, scale = 1;
    if (t < 150) {
      alpha = t / 150;
    } else if (t < 950) {
      var p = (t - 150) / 800;
      var ep = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      x = start.x + (end.x - start.x) * ep;
      y = start.y + (end.y - start.y) * ep;
      alpha = 1;
      scale = 1 - 0.12 * ep;
    } else if (t < 1150) {
      x = end.x; y = end.y; alpha = 1; scale = 0.88;
    } else if (t < 1300) {
      x = end.x; y = end.y; alpha = 1 - (t - 1150) / 150; scale = 0.88;
    }
    if (alpha > 0) {
      var size = 66 * scale;
      Renderer.drawImage(handSrc, x - size / 2, y - size / 2, size, size, alpha);
    }
  };

  PuzzleMode.prototype.needsCountdown = function () { return true; };
  PuzzleMode.prototype.initState = function (state) {
    state.puzzle = { maxErrors: typeof this.level.maxErrors === 'number' ? this.level.maxErrors : 3, errorCount: 0 };
  };
  PuzzleMode.prototype.getStatusInfo = function (state) {
    var p = state.puzzle || {}, remain = Math.max(0, (p.maxErrors || 3) - (p.errorCount || 0));
    return { progress: this._matchedCount, progressTotal: this._totalCount, rightText: '剩 ' + remain + ' 次', rightColor: remain <= 1 ? '#ff4444' : '#ff8866', rightIsTimer: false, timerSecs: state.time };
  };
  PuzzleMode.prototype.onTimeout = function () { this._timedOut = true; };
  PuzzleMode.prototype.onRevive = function (state, type) { if (state.puzzle) { if (type === 'time') state.time += this.getReviveAmount('time'); else state.puzzle.maxErrors += this.getReviveAmount('count'); } this._timedOut = false; };
  PuzzleMode.prototype.onCorrectCallback = function () {
    if (Audio.playCorrect) Audio.playCorrect();
    this._hintForced = false;
    this._hintShownAt = -Infinity;
  };
  PuzzleMode.prototype.onWrongCallback = function (state, ctx) {
    if (Audio.playDressupWrong) Audio.playDressupWrong();
    else if (Audio.playWrong) Audio.playWrong();
    if (!state.puzzle) return;
    ctx = ctx || {};
    if (window.InputManager) InputManager.addErrRipple(ctx.x, ctx.y);
    state.floats.push({
      x: M3.Layout.w / 2,
      y: M3.Layout.h / 2 - 60,
      text: '不对哦！', t: M3._now(), life: 900,
      color: '#ff4444'
    });
    state.puzzle.errorCount++;
    if (state.puzzle.errorCount >= state.puzzle.maxErrors) {
      state.running = false;
      this._timedOut = false;
      if (Audio.playLose) Audio.playLose();
      if (typeof SceneManager !== 'undefined' && SceneManager.open) SceneManager.open('lose-modal', {
        level: state.level,
        remaining: this._totalCount - this._matchedCount,
        title: this.getLoseTitle(), subtitle: this.getLoseSubtitle(state),
        reviveLabel: this.getReviveLabel(), limitType: 'count',
        reviveAmount: this.getReviveAmount('count')
      });
    }
  };
  PuzzleMode.prototype.getLoseTitle = function () { return this._timedOut ? '时间到！' : '机会用完！'; };
  PuzzleMode.prototype.getLoseSubtitle = function () { return '已拼好 ' + this._matchedCount + '/' + this._totalCount; };
  PuzzleMode.prototype.getReviveLabel = function () { return '看广告续命'; };
  PuzzleMode.prototype.getReviveToast = function (type) { return type === 'time' ? '⏰ +' + this.getReviveAmount('time') + ' 秒！继续加油！' : '❤️ +' + this.getReviveAmount('count') + ' 次机会已恢复！'; };
  PuzzleMode.prototype.showToolbarButtons = function () { return { hint: CONFIG.getShowHint('puzzle'), skip: false }; };
  PuzzleMode.prototype.onHint = function (state, silent, loops) {
    var piece = this._getHintPiece();
    if (!piece) return;
    var items = this._getAvailableItems();
    if (piece._sceneIndex !== this._currentScene) this._currentScene = piece._sceneIndex;
    this._scrollToItem(piece.id, items);
    this._hintTargetPieceId = piece.id;
    this._hintShownAt = M3._now();
    this._hintForced = true;
    this._hintLoops = (typeof loops === 'number' && loops > 0) ? loops : 2;
    if (!silent && Audio.playHint) Audio.playHint();
  };
  PuzzleMode.prototype.calcStars = function () { return 0; };
  PuzzleMode.prototype.calcBeatPct = function () { return 0; };
  PuzzleMode.prototype.confirm = function () { return { complete: this._matchedCount === this._totalCount, remaining: this._totalCount - this._matchedCount }; };

  if (typeof ModeRegistry !== 'undefined') ModeRegistry.register('puzzle', PuzzleMode);
  window.PuzzleMode = PuzzleMode;
})();
