(function () {
  'use strict';

  // Jest 直接加载 dressup.js 时没有经过 main.js 的脚本顺序；生产环境由 main.js/index.html
  // 保证 graphics-match-mode.js 先加载，这个分支只为单测和独立调试保留。
  if (typeof GraphicsMatchMode === 'undefined' && typeof require === 'function') {
    require('./graphics-match-mode.js');
  }

  function DressupMode(level, theme) {
    GraphicsMatchMode.call(this, level, theme);
    this._characters = level.characters || [];
    this._outfits = (level.outfits || []).slice();
    for (var s = this._outfits.length - 1; s > 0; s--) {
      var r = Math.floor(Math.random() * (s + 1));
      var tmp = this._outfits[s];
      this._outfits[s] = this._outfits[r];
      this._outfits[r] = tmp;
    }
    this._outfitById = {};
    this._currentChar = 0;
    this._matchedChars = {};
    this._matchedOutfits = {};
    this._matchedCount = 0;
    this._totalPairs = this._characters.length;
    this._completed = false;
    this._dragging = null;
    this._fit = null;
    this._scrollX = 0;
    this._hintShownAt = (typeof M3 !== 'undefined' && M3._now) ? M3._now() : Date.now();
    this._hintTargetOutfitId = this._characters[0] ? this._characters[0].correctOutfit : null;
    this._hintForced = false;
    this._hintLoops = 2; // 引导动画循环次数，onHint(state, silent, loops) 可覆盖，不传则默认 2 次
    this._bubble = null; // { text, dir, shownAt } 翻到该角色时展示的对话气泡
    this._advanceToken = 0; // 匹配成功后自动切下一张原图的防抖 token，见 _scheduleAutoAdvance
    this._transition = null; // 原图左右滑动切换的过渡动画状态，见 _startCharTransition

    for (var i = 0; i < this._outfits.length; i++) {
      this._outfitById[this._outfits[i].id] = this._outfits[i];
    }

    // 开场也展示第一个角色的对白气泡（此前误删，导致第一关/第一位角色进场时不冒泡，
    // 只有切到后面角色才有气泡），复用 _showCharDialog 统一处理气泡+语音，不再单独播语音。
    this._showCharDialog(this._currentChar);
    // 新手引导直接复用"看视频提示"（onHint）里滚动定位+手势动画那套逻辑，不再
    // 单独写一份引导：静默触发一次（silent=true，跳过提示音效），并多播几轮
    // （loops=4）让新玩家有更充分的时间看清操作方式。
    this.onHint(null, true, 4);
  }
  GraphicsMatchMode.extend(DressupMode);

  // 资源分组顺序：当前角色 → 底部衣服缩略图 → 其他角色 → 结算图。
  // PlayController 不需要理解 characters/outfits 字段，只消费这个二维数组。
  DressupMode.collectAssetGroups = function (level) {
    var current = level.characters && level.characters[0];
    var critical = current ? [current.scene, current.result] : [];
    (level.outfits || []).forEach(function (outfit) { critical.push(outfit.thumbnail); });
    return [
      critical,
      (level.characters || []).slice(1).reduce(function (list, character) {
        list.push(character.scene, character.result);
        return list;
      }, []),
      [level.completeImage]
    ];
  };

  DressupMode.prototype.getDressupState = function () {
    return {
      matchedChars: this._matchedChars,
      matchedOutfits: this._matchedOutfits,
      matchedCount: this._matchedCount,
      totalPairs: this._totalPairs,
      currentChar: this._currentChar,
      dragging: this._dragging
    };
  };

  DressupMode.prototype._getAvailableItems = function () {
    var items = [];
    for (var i = 0; i < this._outfits.length; i++) {
      if (!this._matchedOutfits[this._outfits[i].id]) items.push(this._outfits[i]);
    }
    return items;
  };

  DressupMode.prototype.endDrag = function (x, y) {
    if (!this._dragging) return { accepted: false, reason: 'not-dragging' };
    var outfit = this._outfitById[this._dragging.outfitId];
    this._dragging = null;
    if (!outfit) return { accepted: false, reason: 'missing-outfit' };
    if (this._isInTray(x, y)) {
      this._startReturnAnimation(outfit.id, x, y, 60);
      return { accepted: true, correct: false, complete: false, reason: 'returned-to-tray' };
    }
    if (this._matchedOutfits[outfit.id]) return { accepted: false, reason: 'already-matched' };
    if (!this._isOnCharacter(x, y)) {
      Audio.playUiClick();
      return { accepted: false, reason: 'outside-character' };
    }

    var char = this._characters[this._currentChar];
    if (this._matchedChars[char.id]) return { accepted: false, reason: 'char-already-matched' };

    if (outfit.id === char.correctOutfit) {
      this._matchedChars[char.id] = true;
      this._matchedOutfits[outfit.id] = true;
      this._matchedCount++;
      // 飞行特效"从衣服那里飘出"：用衣服拖拽释放时的位置（即衣服贴到角色身上的位置）
      // 作为起点，而不是 spot 玩法那种"点击命中位置"
      if (window.PlayController && PlayController.onModeCorrect) {
        PlayController.onModeCorrect(outfit, x, y, this._matchedCount - 1);
      }
      var complete = this._matchedCount === this._totalPairs;
      if (complete && !this._completed) {
        this._completed = true;
        // 通关结算卡片延迟弹出，让玩家先看清最后一次匹配成功的效果，
        // 与"匹配成功后自动切下一张原图"保持一致的等待时长。
        var completeDelay = typeof CONFIG.DRESSUP_AUTO_ADVANCE_MS === 'number' ? CONFIG.DRESSUP_AUTO_ADVANCE_MS : 0;
        var completeFn = function () {
          if (window.PlayController && PlayController.onModeComplete) PlayController.onModeComplete();
        };
        if (typeof CONFIG.DRESSUP_AUTO_ADVANCE_MS === 'number') setTimeout(completeFn, completeDelay);
        else completeFn();
      } else if (!complete) {
        // 匹配成功后自动滚动到下一个未匹配角色的原图，不需要用户手动点左右箭头。
        this._scheduleAutoAdvance();
      }
      return { accepted: true, correct: true, complete: complete };
    } else {
      if (window.InputManager) InputManager.addErrRipple(x, y);
      if (window.PlayController && PlayController.onModeWrong) PlayController.onModeWrong(outfit);
      return { accepted: true, correct: false, complete: false };
    }
  };

  DressupMode.prototype.confirm = function () {
    var remaining = this._totalPairs - this._matchedCount;
    if (remaining > 0) return { complete: false, remaining: remaining };
    if (!this._completed) {
      this._completed = true;
      if (window.PlayController && PlayController.onModeComplete) PlayController.onModeComplete();
    }
    return { complete: true, remaining: 0 };
  };

  DressupMode.prototype.switchChar = function (direction) {
    var newIdx = this._currentChar + direction;
    if (newIdx < 0 || newIdx >= this._totalPairs) return false;
    this._advanceToken = (this._advanceToken || 0) + 1; // 用户手动切换，作废尚未触发的自动切换
    this._startCharTransition(this._currentChar, newIdx, direction);
    this._currentChar = newIdx;
    if (this._matchedCount === 0 && !this._hintForced) {
      this._hintTargetOutfitId = this._characters[newIdx].correctOutfit;
    }
    this._showCharDialog(newIdx);
    return true;
  };

  /**
   * 匹配成功后自动切到下一个未匹配角色的原图（不需要用户点左右箭头），
   * 等待时长见 CONFIG.DRESSUP_AUTO_ADVANCE_MS。用 _advanceToken 防止：
   * 延迟期间玩家又手动切换/再次匹配，导致这次过期的自动切换错误地覆盖当前状态。
   */
  DressupMode.prototype._scheduleAutoAdvance = function () {
    var self = this;
    var token = ++this._advanceToken;
    setTimeout(function () {
      if (self._advanceToken !== token) return;
      if (self._completed || self._timedOut) return;
      self._autoAdvanceToNextChar();
    }, CONFIG.DRESSUP_AUTO_ADVANCE_MS);
  };

  DressupMode.prototype._autoAdvanceToNextChar = function () {
    var total = this._totalPairs;
    for (var i = 1; i <= total; i++) {
      var idx = (this._currentChar + i) % total;
      if (!this._matchedChars[this._characters[idx].id]) {
        this._startCharTransition(this._currentChar, idx, 1);
        this._currentChar = idx;
        this._showCharDialog(idx);
        return;
      }
    }
  };

  /**
   * 记录一次原图切换的滑动过渡：direction>0 视觉上内容向左滑（新图从右侧滑入，
   * 旧图向左滑出）；direction<0 则相反。draw() 里在动画时长内同时绘制新旧两张图。
   */
  DressupMode.prototype._startCharTransition = function (fromIdx, toIdx, direction) {
    this._transition = {
      fromIdx: fromIdx, toIdx: toIdx,
      dir: direction >= 0 ? 1 : -1,
      startAt: M3._now()
    };
  };

  /**
   * 翻到某个角色时展示其对话气泡并播放对应语音（不再等匹配成功才触发）。
   */
  DressupMode.prototype._showCharDialog = function (charIdx) {
    var char = this._characters[charIdx];
    if (!char) { this._bubble = null; return; }
    var text = char.matchText || '';
    var dir = char.matchTextDir || 'right';
    if (char.voiceUrl) Audio.playVoiceUrl(char.voiceUrl);
    this._bubble = (text && dir !== 'none') ? { text: text, dir: dir, shownAt: M3._now() } : null;
  };

  // ── 多态覆盖 ─────────────────────────────────────────────────────────────

  DressupMode.prototype.needsCountdown = function () { return true; };

  // 倒计时由 PlayController 统一扣减 state.time；这里只记录换装专属超时状态。
  DressupMode.prototype.onTimeout = function (state) {
    if (this._completed || this._timedOut) return;
    this._timedOut = true;
    if (window.Analytics) Analytics.trackLevelEvent(state.level.idx, 'dressup_timeout');
  };

  DressupMode.prototype.calcStars = function (state) { return 0; };

  DressupMode.prototype.calcBeatPct = function (state) { return 0; };

  /**
   * 复活（按 limitType 精确恢复对应资源，与 base-mode.js 保持一致，数值统一来自
   * getReviveAmount(limitType)，继承自 BaseMode，按玩法可在 product.config.js
   * 里单独配置，见 config.js CONFIG.getReviveAmount）：
   *   - 'count' → 错误次数用尽触发，在已用尽的基础上追加机会次数；
   *   - 'time'  → 计时器耗尽触发，在剩余时间基础上追加秒数（不重置为满时长）。
   */
  DressupMode.prototype.onRevive = function (state, limitType) {
    if (limitType === 'time') {
      // 统一追加通用倒计时，不再维护 dressup.timeLeft。
      state.time = (state.time || 0) + this.getReviveAmount('time');
    } else if (state.dressup) {
      state.dressup.maxErrors = (state.dressup.maxErrors || 0) + this.getReviveAmount('count');
    }
    this._timedOut = false;
  };

  DressupMode.prototype.getStatusInfo = function (state) {
    var maxE = state.dressup ? state.dressup.maxErrors : 3;
    var used = state.dressup ? state.dressup.errorCount : 0;
    var remain = maxE - used;
    return {
      progress: this._matchedCount,
      progressTotal: this._totalPairs,
      rightText: '剩 ' + remain + ' 次',
      rightColor: remain <= 1 ? '#ff4444' : (remain <= 2 ? '#ffaa44' : '#ff8866'),
      rightIsTimer: false,
      timerSecs: state.time
    };
  };

  DressupMode.prototype.getLoseTitle = function () {
    return this._timedOut ? '时间到！' : '机会用完！';
  };

  DressupMode.prototype.getLoseSubtitle = function (state) {
    return '已匹配 ' + this._matchedCount + '/' + this._totalPairs;
  };

  DressupMode.prototype.getReviveLabel = function () { return '看广告续命'; };
  /** 复活成功 toast 文案（按 limitType 区分：'time'=只加了时间，'count'=只加了机会次数） */
  DressupMode.prototype.getReviveToast = function (limitType) {
    if (limitType === 'time') return '⏰ +' + this.getReviveAmount('time') + ' 秒！继续加油！';
    return '❤️ +' + this.getReviveAmount('count') + ' 次机会已恢复！';
  };
  DressupMode.prototype.showToolbarButtons = function () {
    return { hint: CONFIG.getShowHint('dressup'), skip: false };
  };
  DressupMode.prototype.getIntroAudio = function () { return null; };

  /**
   * 看视频提示 / 新手引导 共用：切到第一个未匹配的角色，把该角色对应的正确衣服自动
   * 滚动到可见位置，并重播一次"手从缩略图挪到角色身上"的引导动画。
   * @param {object|null} state  仅用于占位对齐调用方签名，逻辑不依赖 state
   * @param {boolean} [silent]   true = 新手引导静默触发，不播放提示音效
   * @param {number} [loops]     引导动画循环播放次数，不传则默认播 2 次
   */
  DressupMode.prototype.onHint = function (state, silent, loops) {
    var targetCharIdx = -1;
    for (var i = 0; i < this._characters.length; i++) {
      if (!this._matchedChars[this._characters[i].id]) { targetCharIdx = i; break; }
    }
    if (targetCharIdx < 0) return;
    if (targetCharIdx !== this._currentChar) {
      this._currentChar = targetCharIdx;
      this._showCharDialog(targetCharIdx);
    }

    var char = this._characters[targetCharIdx];
    var targetOutfitId = char.correctOutfit;

    var availableOutfits = [];
    for (var j = 0; j < this._outfits.length; j++) {
      if (!this._matchedOutfits[this._outfits[j].id]) availableOutfits.push(this._outfits[j]);
    }
    var idx = -1;
    for (var k = 0; k < availableOutfits.length; k++) {
      if (availableOutfits[k].id === targetOutfitId) { idx = k; break; }
    }

    if (idx >= 0) {
      var cardSize = 70, gap = 6, sidePad = 12;
      var stripW = M3.Layout.w - sidePad * 2;
      var contentW = availableOutfits.length * cardSize + (availableOutfits.length - 1) * gap;
      var maxScrollX = Math.max(0, contentW - stripW);
      var targetCardX = idx * (cardSize + gap);
      var desiredScroll = targetCardX + cardSize / 2 - stripW / 2; // 尽量居中显示
      this._scrollX = Math.max(0, Math.min(maxScrollX, desiredScroll));
    }

    this._hintTargetOutfitId = targetOutfitId;
    this._hintShownAt = M3._now();
    this._hintForced = true;
    this._hintLoops = (typeof loops === 'number' && loops > 0) ? loops : 2; // 未传入次数时默认播 2 次
    if (!silent) Audio.playHint();
  };

  DressupMode.prototype.initState = function (state) {
    state.dressup = {
      maxErrors: typeof this.level.maxErrors === 'number' ? this.level.maxErrors : 3,
      errorCount: 0
    };
  };

  DressupMode.prototype.onCorrectCallback = function (state, ctx) {
    Audio.playDressupCorrect();
    this._hintForced = false;
    this._hintShownAt = -Infinity; // 一旦匹配成功立即停止引导动画，不再等待循环播完
    if (window.Analytics) Analytics.trackLevelEvent(state.level.idx, 'dressup_correct');
    if (window.Telemetry) Telemetry.buttonClick('dressup_correct', { levelIdx: String(state.level.idx), outfitId: ctx.outfit.id });
  };

  DressupMode.prototype.onWrongCallback = function (state, ctx) {
    Audio.playDressupWrong();
    state.floats.push({
  x: M3.Layout.w / 2, y: M3.Layout.h / 2 - 60,
      text: '不对哦！', t: M3._now(), life: 900,
      color: '#ff4444'
    });
    if (window.Analytics) Analytics.trackLevelEvent(state.level.idx, 'dressup_wrong');
    if (window.Telemetry) Telemetry.buttonClick('dressup_wrong', { levelIdx: String(state.level.idx), outfitId: ctx.outfit.id });
    if (state.dressup) {
      state.dressup.errorCount++;
      if (state.dressup.errorCount >= state.dressup.maxErrors) {
        state.running = false;
        Audio.playLose();
        var ds = this.getDressupState();
        var unmatched = ds.totalPairs - ds.matchedCount;
        SceneManager.open('lose-modal', {
          level: state.level,
          remaining: unmatched,
          title: this.getLoseTitle(),
          subtitle: this.getLoseSubtitle(state),
          reviveLabel: this.getReviveLabel(),
          limitType: 'count', // 错误次数用尽触发，对应「看视频可增加N次游戏次数」底部提示
          reviveAmount: this.getReviveAmount('count') // 显式传给卡片文案，与 onRevive 生效数值保持同一来源
        });
      }
    }
  };

  DressupMode.prototype._isOnCharacter = function (x, y) {
    if (!this._fit) return false;
    return x >= this._fit.x &&
           x <= this._fit.x + this._fit.w &&
           y >= this._fit.y &&
           y <= this._fit.y + this._fit.h;
  };

  /**
   * 计算换装玩法所有舞台坐标。
   * 这里只返回布局，不执行绘制或注册交互，避免 draw() 同时承担布局和渲染职责。
   */
  DressupMode.prototype._layoutDressup = function () {
    return this._layoutMatchStage('dressup');
  };

  /** 绘制单个角色原图（供 draw() 正常态与切换过渡态共用） */
  DressupMode.prototype._drawCharImage = function (char, x, y, w, h) {
    if (!char) return null;
    var isMatched = this._matchedChars[char.id];
    var imgSrc = isMatched ? char.result : char.scene;
    if (imgSrc) {
      // 人物原图保持比例并完整绘制，不使用 cover，避免左右/上下裁剪人物。
      var fit = this._calcFitWidth(imgSrc, x, y, w, h);
      if (fit) {
        // 底边沿用原舞台底部：图片比例调整后，整体向下对齐，避免底部区域上移。
        fit.y = y + h - fit.h;
        Renderer.drawImage(imgSrc, fit.x, fit.y, fit.w, fit.h);
      }
      return fit;
    } else {
      Renderer.drawRoundRect(x, y, w, h, 12, {
        fill: 'rgba(40,50,70,0.6)', stroke: 'rgba(120,160,220,0.8)', strokeW: 2
      });
      Renderer.drawText(isMatched ? '已匹配' : '角色区域', x + w / 2, y + h / 2 - 8, {
        fontSize: 16, color: 'rgba(180,200,240,0.8)', align: 'center'
      });
      return null;
    }
  };

  DressupMode.prototype.draw = function (state) {
    var W = M3.Layout.w;
    var layout = this._layoutDressup();
    var character = layout.character;
    var trayLayout = layout.tray;
    this._trayLayout = trayLayout;

    // 角色立绘满宽铺满整个舞台区域（对齐参考图：无左右留白、无虚线边框）
    var charW = character.w;
    var charH = character.h;
    var charX = character.x;
    var charY = character.y;
    this._fit = { x: charX, y: charY, w: charW, h: charH };
    var dividerTop = character.y, dividerBottom = character.y + character.h;

    var char = this._characters[this._currentChar];
    var trans = this._transition;
    if (trans) {
      var slideMs = CONFIG.DRESSUP_CHAR_SLIDE_MS;
      var age = M3._now() - trans.startAt;
      if (age >= slideMs) {
        this._transition = null;
        trans = null;
      }
    }

    if (trans) {
      var p = Math.min(1, age / slideMs);
      var ep = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // ease-in-out
      var fromChar = this._characters[trans.fromIdx];
      var toChar = this._characters[trans.toIdx];
      var offOld = -trans.dir * charW * ep;      // 旧图滑出（dir>0 时向左滑出）
      var offNew = trans.dir * charW * (1 - ep);  // 新图滑入（dir>0 时从右侧滑入）

      var fromFit = this._drawCharImage(fromChar, charX + offOld, charY, charW, charH);
      var toFit = this._drawCharImage(toChar, charX + offNew, charY, charW, charH);
      this._fit = toFit || fromFit || this._fit;
      if (fromFit || toFit) {
        dividerTop = Math.min(fromFit ? fromFit.y : Infinity, toFit ? toFit.y : Infinity);
        dividerBottom = Math.max(fromFit ? fromFit.y + fromFit.h : -Infinity,
          toFit ? toFit.y + toFit.h : -Infinity);
      }
    } else if (char) {
      this._fit = this._drawCharImage(char, charX, charY, charW, charH) || this._fit;
      dividerTop = this._fit.y;
      dividerBottom = this._fit.y + this._fit.h;
    }

    // 舞台图片区域（原图所在位置）上下紫色分割线，与其他玩法保持统一
    this._drawImageDividers(dividerTop, dividerBottom);

    var self = this;

    // 翻到该角色时的对话气泡（bubble_tail_left/right.png，138:59 原图比例）
    if (this._bubble) {
      var bubbleAge = M3._now() - this._bubble.shownAt;
      var bubbleDuration = 2600, bubbleFade = 400;
      if (bubbleAge > bubbleDuration + bubbleFade) {
        this._bubble = null;
      } else {
        var bubbleAlpha = bubbleAge > bubbleDuration
          ? Math.max(0, 1 - (bubbleAge - bubbleDuration) / bubbleFade)
          : 1;
        var bw = 140, bh = bw * (177 / 414);
        var bPad = 14;
        var bx = this._bubble.dir === 'left'
          ? (this._fit.x + bPad)
          : (this._fit.x + this._fit.w - bw - bPad);
        var by = this._fit.y + 32;
        var bubbleSrc = this._bubble.dir === 'left'
          ? CONFIG.uiAsset('mnvBubbleTailRight')
          : CONFIG.uiAsset('mnvBubbleTailLeft');
        var bubbleEntry = bubbleSrc ? TextureManager.get(bubbleSrc) : null;
        if (bubbleEntry) {
          Renderer.drawImage(bubbleSrc, bx, by, bw, bh, bubbleAlpha);
          Renderer.drawText(this._bubble.text, bx + bw / 2, by + bh / 2 - 19, {
            fontSize: 12, color: '#141056', align: 'center', maxWidth: bw - 32, bold: true
          });
        } else {
          Renderer.drawRoundRect(bx, by, bw, bh, 12, { fill: 'rgba(255,255,255,0.95)' });
          Renderer.drawText(this._bubble.text, bx + bw / 2, by + bh / 2 - 13, {
            fontSize: 12, color: '#141056', align: 'center', maxWidth: bw - 20
          });
        }
      }
    }

    var navY = layout.nav.y; // 按钮高 40px，距原图底部留 16px

    if (this._currentChar > 0) {
      var prevX = 8, prevY = navY, prevW = layout.nav.size, prevH = layout.nav.size;
      var navLSrc = CONFIG.uiAsset('gameNavLeft') || CONFIG.uiAsset('btnBack');
      Renderer.drawImage(navLSrc, prevX, prevY, prevW, prevH);
      InputManager.add({
        x: prevX, y: prevY, w: prevW, h: prevH, priority: 20, label: 'dressup-prev',
        onTap: function () { if (self.switchChar(-1)) Audio.playDressupCharSwitch(); }
      });
    }

    if (this._currentChar < this._totalPairs - 1) {
      var nextX = W - 48, nextY = navY, nextW = layout.nav.size, nextH = layout.nav.size;
      var navRSrc = CONFIG.uiAsset('gameNavRight') || CONFIG.uiAsset('btnBack');
      Renderer.drawImage(navRSrc, nextX, nextY, nextW, nextH);
      InputManager.add({
        x: nextX, y: nextY, w: nextW, h: nextH, priority: 20, label: 'dressup-next',
        onTap: function () { if (self.switchChar(1)) Audio.playDressupCharSwitch(); }
      });
    }

    var cardSize = trayLayout.cardSize;
    var cardY = trayLayout.y;
    var gap = trayLayout.gap;
    var sidePad = trayLayout.sidePad;
    var stripW = trayLayout.stripW;
    var availableOutfits = [];
    for (var i = 0; i < this._outfits.length; i++) {
      if (!this._matchedOutfits[this._outfits[i].id]) {
        availableOutfits.push(this._outfits[i]);
      }
    }
    var n = availableOutfits.length;
    if (n > 0) {
      var contentW = n * cardSize + (n - 1) * gap;
      var maxScrollX = Math.max(0, contentW - stripW);
      this._scrollX = Math.max(0, Math.min(this._scrollX, maxScrollX));

      // 背景横向滚动热区（priority 低于卡片，命中空白处才滚动，不影响卡片拖拽换装）
      if (maxScrollX > 0) {
        var scrollStartX = this._scrollX;
        InputManager.addDrag({
          x: sidePad, y: cardY, w: stripW, h: cardSize, priority: 5, label: 'outfit-strip-scroll',
          onDragStart: function (sx, sy) { scrollStartX = self._scrollX; self._dragStartCx = sx; },
          onDragMove: function (mx, my) {
            self._scrollX = Math.max(0, Math.min(maxScrollX, scrollStartX - (mx - self._dragStartCx)));
          },
          onDragEnd: function () {}
        });
      }

      var frameSrc = CONFIG.uiAsset('mnvFrameDashed');
      var frameEntry = frameSrc ? TextureManager.get(frameSrc) : null;

      for (var j = 0; j < n; j++) {
        var outfit = availableOutfits[j];
        var cx = sidePad + j * (cardSize + gap) - this._scrollX;
        var cy = cardY;
        if (cx + cardSize < sidePad || cx > sidePad + stripW) continue;

        // level_border.png 是带浅紫色实底的虚线框图（非镂空），必须先画在底层当背景，
        // 缩略图再叠加在上面，否则缩略图会被这张实底框图整个盖住
        if (frameEntry) {
          Renderer.drawImage(frameSrc, cx, cy, cardSize, cardSize);
        } else {
          Renderer.drawRoundRect(cx, cy, cardSize, cardSize, 5, {
            stroke: '#acabff', strokeW: 0.9
          });
        }

        var hideThumb = (this._dragging && this._dragging.outfitId === outfit.id) ||
          (this._returnAnim && this._returnAnim.itemId === outfit.id);
        if (!hideThumb && outfit.thumbnail) {
          Renderer.drawImageFit(outfit.thumbnail, cx + 4, cy + 4, cardSize - 8, cardSize - 8);
        } else if (!hideThumb) {
          Renderer.drawRoundRect(cx + 4, cy + 4, cardSize - 8, cardSize - 8, 6, {
            fill: 'rgba(30,40,60,0.85)'
          });
          Renderer.drawText(outfit.name || outfit.id, cx + cardSize / 2, cy + cardSize / 2 - 4, {
            fontSize: 11, color: '#ddeeff', align: 'center', maxWidth: cardSize - 12
          });
        }

        (function (outfitRef, dx, dy, dw, dh) {
          var gestureMode = null;
          var startX = 0, startY = 0, scrollStartX = 0;
          InputManager.addDrag({
            x: dx, y: dy, w: dw, h: dh, priority: 10, label: 'outfit-' + outfitRef.id,
            onDragStart: function (sx, sy) {
              gestureMode = null;
              startX = sx;
              startY = sy;
              scrollStartX = self._scrollX;
            },
            onDragMove: function (mx, my) {
              if (!gestureMode) {
                var moveDx = mx - startX, moveDy = my - startY;
                if (Math.abs(moveDx) < 6 && Math.abs(moveDy) < 6) return;
                if (Math.abs(moveDx) > Math.abs(moveDy)) {
                  gestureMode = 'scroll';
                } else {
                  gestureMode = 'place';
                  if (self.startDrag(outfitRef.id, startX, startY)) Audio.playDressupOutfitPick();
                }
              }
              if (gestureMode === 'scroll') {
                self._scrollX = Math.max(0, Math.min(maxScrollX, scrollStartX - (mx - startX)));
              } else {
                self.moveDrag(mx, my);
              }
            },
            onDragEnd: function (ex, ey) {
              if (gestureMode === 'place') self.endDrag(ex, ey);
            }
          });
        })(outfit, cx, cy, cardSize, cardSize);
      }

      // 循环播放"手从衣服缩略图拖到角色身上"的引导动画（复用老模版 tapHand，
      // 等新模版补图后替换）。首次进入自动播一轮；已匹配过一次后自动停止，但
      // 通过 onHint()（看视频提示）可强制重新触发一轮，此时会定位到提示的目标
      // 衣服卡片，而不是列表里的第一张。
      var hintCycleMs = 1600, hintLoops = this._hintLoops || 2, hintTotalMs = hintCycleMs * hintLoops;
      var hintAge = M3._now() - this._hintShownAt;
      if ((this._matchedCount === 0 || this._hintForced) && !this._dragging && hintAge < hintTotalMs) {
        var handSrc = CONFIG.uiAsset('tapHand');
        var handEntry2 = handSrc ? TextureManager.get(handSrc) : null;
        if (handEntry2) {
          var handSize = 66;
          var startCardIdx = 0;
          if (this._hintTargetOutfitId) {
            for (var hi = 0; hi < availableOutfits.length; hi++) {
              if (availableOutfits[hi].id === this._hintTargetOutfitId) { startCardIdx = hi; break; }
            }
          }
          var startHX = sidePad + startCardIdx * (cardSize + gap) + cardSize / 2 - this._scrollX;
          var startHY = cardY + cardSize / 2;
          var endHX = this._fit.x + this._fit.w / 2;
          var endHY = this._fit.y + this._fit.h * 0.55;

          var t = hintAge % hintCycleMs;
          var handX, handY, handAlpha, handScale;
          if (t < 150) {
            // 停留在起点，淡入
            handX = startHX; handY = startHY;
            handAlpha = t / 150;
            handScale = 1;
          } else if (t < 950) {
            // 从缩略图挪到角色身上（ease-in-out）
            var p = (t - 150) / 800;
            var ep = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            handX = startHX + (endHX - startHX) * ep;
            handY = startHY + (endHY - startHY) * ep;
            handAlpha = 1;
            handScale = 1 - 0.12 * ep; // 移动过程轻微缩小，模拟按压手感
          } else if (t < 1150) {
            // 停留在角色身上（"按下"感）
            handX = endHX; handY = endHY;
            handAlpha = 1;
            handScale = 0.88;
          } else if (t < 1300) {
            // 淡出
            handX = endHX; handY = endHY;
            handAlpha = 1 - (t - 1150) / 150;
            handScale = 0.88;
          } else {
            // 间隙：隐藏，等待下一轮回到起点
            handAlpha = 0;
            handX = startHX; handY = startHY; handScale = 1;
          }

          if (handAlpha > 0) {
            var hs = handSize * handScale;
            Renderer.drawImage(handSrc, handX - hs / 2, handY - hs / 2, hs, hs, handAlpha);
          }
        }
      }
    }


    if (this._dragging) {
      var dragOutfit = this._outfitById[this._dragging.outfitId];
      if (dragOutfit) {
        // 拖出来跟手的缩略图放大 2.5 倍，让玩家看清衣服细节，也强化"正在拖拽"的反馈
        var dragScale = 4;
        var dragBaseSize = 60;
        var dragSize = dragBaseSize * dragScale * this._getTrayApproachScale(this._dragging.y);
        if (dragOutfit.thumbnail) {
          Renderer.drawImageFit(dragOutfit.thumbnail, this._dragging.x - dragSize / 2, this._dragging.y - dragSize / 2, dragSize, dragSize);
        } else {
          var lw = dragBaseSize, lh = 24;
          Renderer.drawRoundRect(this._dragging.x - lw / 2, this._dragging.y - lh, lw, lh, 6, {
            fill: 'rgba(0,0,0,0.7)', stroke: 'rgba(255,220,100,0.8)', strokeW: 1
          });
          Renderer.drawText(dragOutfit.name || dragOutfit.id, this._dragging.x, this._dragging.y - lh + 4, {
            fontSize: 11, color: '#ffdd66', align: 'center'
          });
        }
      }
    }

    // 拖回底部栏时，跟手图缩小并回到原卡片；该操作不计错。
    var returnAnim = this._returnAnim;
    if (returnAnim) {
      var returnOutfit = this._outfitById[returnAnim.itemId];
      var returnTarget = this._getTrayItemCenter(returnAnim.itemId);
      if (!returnOutfit || !returnTarget) {
        this._returnAnim = null;
      } else {
        var returnAge = M3._now() - returnAnim.startedAt;
        var returnP = Math.min(1, returnAge / returnAnim.durationMs);
        if (returnP >= 1) {
          this._returnAnim = null;
        } else {
          var returnEase = 1 - Math.pow(1 - returnP, 3);
          var returnX = returnAnim.fromX + (returnTarget.x - returnAnim.fromX) * returnEase;
          var returnY = returnAnim.fromY + (returnTarget.y - returnAnim.fromY) * returnEase;
          var returnSize = returnAnim.fromSize + (returnAnim.traySize - returnAnim.fromSize) * returnEase;
          if (returnOutfit.thumbnail) Renderer.drawImageFit(returnOutfit.thumbnail,
            returnX - returnSize / 2, returnY - returnSize / 2, returnSize, returnSize, 1);
        }
      }
    }
  };

  if (typeof ModeRegistry !== 'undefined') {
    ModeRegistry.register('dressup', DressupMode);
  }
})();
