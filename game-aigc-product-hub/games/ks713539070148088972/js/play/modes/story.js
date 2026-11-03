/**
 * play/modes/story.js — 剧情找线索模式
 * 职责：
 *   - 开场案件简报（点击「开始」才计时）
 *   - Boss 亮度切换（找到第 N 条触发）
 *   - 旁白气泡打字机动画（覆盖 BaseMode 默认的淡入淡出气泡）
 *   - 通关 nextHook 揭示弹窗
 *   - hitTest 为"取中心距点击最近的相交框"特殊逻辑，需覆盖 BaseMode 默认实现；
 *     onCorrect 复用 BaseMode 默认实现后追加 Boss 亮度逻辑
 * 依赖：BaseMode, Renderer, TextureManager, CONFIG, M3, Difficulty, PlayController
 */
(function () {
  'use strict';

  function StoryMode(level, theme) {
    BaseMode.call(this, level, theme);
    this._bossBright = false;   // Boss 阶段亮度切换
    this._narrative   = null;   // { text, t, typeIdx } 打字机旁白（覆盖 BaseMode 的 _narrativeTxt 存储方式）
    this._introShown  = false;  // 简报是否已显示
    this._introOver   = false;  // 简报是否已关闭（可以计时）
  }
  BaseMode.extend(StoryMode);

  StoryMode.collectAssetGroups = function (level) {
    return [[level.scene], [level.completeImage]];
  };

  StoryMode.prototype.draw = function (state) {
    var level   = this.level;
    if (!level.scene) return;

    var stage   = CONFIG.getLayoutRegions(level.mode).stage;
    var W       = stage.w;
    var stageY  = stage.y;
    var stageH  = stage.h;

    var fit = this._calcFitWidth(level.scene, 0, stageY, W, stageH);
    this._fit = fit;
    if (fit) {
      // Boss 亮度：覆盖暗色遮罩
      if (this._bossBright) {
        Renderer.drawImage(level.scene, fit.x, fit.y, fit.w, fit.h);
      } else {
        Renderer.drawImage(level.scene, fit.x, fit.y, fit.w, fit.h, 0.5);
        Renderer.drawRect(fit.x, fit.y, fit.w, fit.h, 'rgba(0,0,20,0.4)');
      }
      this._drawImageDividers(fit.y, fit.y + fit.h);
    }

    // 命中标记（金色，区别于其他玩法的绿色）
    this._drawMarks('#ffd700');

    // 提示遮罩
    this._drawHintMask(state, fit);

    // 旁白气泡
    this._drawNarrative();
  };

  /**
   * 简报覆盖层（由 PlayController 在 HUD 绘制之后调用，确保黑色蒙版 + 卡片
   * 盖住返回按钮/倒计时/进度点/底部工具栏等 HUD 元素，而不是被 HUD 盖住）
   */
  StoryMode.prototype.drawOverlay = function (state) {
    if (!this._introOver) {
      this._drawIntro(state);
    }
  };

  StoryMode.prototype._drawIntro = function (state) {
    var self  = this;
    var level = this.level;
    var intro = level.intro || (this.theme && this.theme.storyIntro);
    if (!intro) { this._introOver = true; PlayController.startStoryCountdown(); return; }

    var W  = M3.Layout.w;
    var H  = M3.Layout.h;

    // 全屏遮罩（必须用 drawRoundRect(radius=0) 而非 drawRect，否则蒙层走 ShapeBatch
    // 在 endFrame 时晚于 SpriteBatch flush，会盖在卡片/按钮之上导致按钮点不到）
    Renderer.drawRoundRect(0, 0, W, H, 0, { fill: 'rgba(0,0,0,0.85)' });

    // 卡片
    var cardW = W - 48, cardH = 340;
    var cardX = 24, cardY = (H - cardH) / 2;
    Renderer.drawRoundRect(cardX, cardY, cardW, cardH, 16, {
      fill: '#0e1520',
      stroke: '#8866cc',
      strokeW: 2
    });

    // 章节标题
    var chapterTitle = (intro.chapterTitle || '') + '\n' + (intro.title || '');
    Renderer.drawText(chapterTitle, W/2, cardY + 24, {
      fontSize: 15, color: '#cc99ff',
      align: 'center', maxWidth: cardW - 40
    });

    // 正文
    if (intro.body) {
      Renderer.drawText(intro.body, W/2, cardY + 88, {
        fontSize: 13, color: '#ddccff',
        align: 'center', maxWidth: cardW - 40, maxLines: 4
      });
    }

    // 调查方向
    var goals = intro.goals || level.briefGoals || [];
    var goalStartY = cardY + 180;
    if (goals.length > 0) {
      Renderer.drawText(intro.sectionTitle || '本关调查方向', W/2, goalStartY, {
        fontSize: 12, color: '#9988cc', align: 'center'
      });
      for (var i = 0; i < goals.length; i++) {
        Renderer.drawText('• ' + goals[i], W/2, goalStartY + 20 + i * 22, {
          fontSize: 12, color: '#bbbbee', align: 'center', maxWidth: cardW - 40
        });
      }
    }

    // 开始按钮
    var btnW = 140, btnH = 40;
    var btnX = (W - btnW) / 2, btnY = cardY + cardH - btnH - 20;
    var areas = [UIKit.drawButton(btnX, btnY, btnW, btnH, intro.buttonText || '开始找线索', {
      bgColor: '#9955ee', textColor: '#fff', fontSize: 15, radius: 20
    }, function () {
      self._introOver = true;
      PlayController.startStoryCountdown();
    }, 9999)];
    InputManager.addAll(areas);

    // 全屏点击吸收（防穿透到舞台）
    InputManager.add({
      x: 0, y: 0, w: W, h: H, priority: 9998, label: 'intro-absorber',
      onTap: function () {}
    });
  };

  StoryMode.prototype.hitTest = function (cx, cy, hits) {
    if (!this._introOver) return { hit: false };
    var fit = this._fit;
    if (!fit) return { hit: false };

    var odds = this.level.odds || [];
    var diff = window.Difficulty ? Difficulty.getDiff(this.level) : { hitScale: 1.0 };
    var hs   = diff.hitScale || 1.0;

    // story 取中心距点击最近的相交框（防大框抢点）
    var bestIdx = -1, bestDist = Infinity;
    for (var i = 0; i < odds.length; i++) {
      if (hits.indexOf(i) >= 0) continue;
      var o   = odds[i];
      var ox  = fit.x + (o.x / 100) * fit.w;
      var oy  = fit.y + (o.y / 100) * fit.h;
      var ow  = (o.w / 100) * fit.w * hs;
      var oh  = (o.h / 100) * fit.h * hs;
      var ocx = ox + (o.w / 100) * fit.w / 2;
      var ocy = oy + (o.h / 100) * fit.h / 2;
      var rx  = Math.max(ocx - ow/2, fit.x);
      var ry  = Math.max(ocy - oh/2, fit.y);
      var rx2 = Math.min(ocx + ow/2, fit.x + fit.w);
      var ry2 = Math.min(ocy + oh/2, fit.y + fit.h);

      if (cx >= rx && cx <= rx2 && cy >= ry && cy <= ry2) {
        var dist = Math.hypot(cx - ocx, cy - ocy);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
    }
    if (bestIdx >= 0) return { hit: true, oddIdx: bestIdx };
    return { hit: false };
  };

  StoryMode.prototype.onCorrect = function (oddIdx, cx, cy) {
    BaseMode.prototype.onCorrect.call(this, oddIdx, cx, cy);

    // Boss 亮度切换
    var level = this.level;
    if (level.bossStage > 0 && oddIdx + 1 >= level.bossStage) {
      this._bossBright = !this._bossBright;
    }
  };

  StoryMode.prototype.showNarrative = function (text) {
    this._narrative = { text: text, t: M3._now(), typeIdx: 0 };
  };

  /** 打字机效果旁白气泡（覆盖 BaseMode 默认的淡入淡出气泡） */
  StoryMode.prototype._drawNarrative = function () {
    var n = this._narrative;
    if (!n) return;
    var age = M3._now() - n.t;
    if (age > 4000) { this._narrative = null; return; }
    // 打字机效果
    var chars = Math.floor(age / 60);
    var display = n.text.slice(0, chars);
    var alpha = age > 3200 ? 1 - (age - 3200) / 800 : 1;

    var W = M3.Layout.w;
    var bw = 260, bh = 52;
    var bx = (W - bw) / 2;
    var by = CONFIG.getLayoutRegions(this.level.mode).stage.y + 12;
    Renderer.drawRoundRect(bx, by, bw, bh, 10, { fill: 'rgba(10,5,30,' + (0.88 * alpha) + ')' });
    Renderer.drawText(display, W/2, by + 12, {
      fontSize: 13, color: 'rgba(255,240,180,' + alpha + ')',
      align: 'center', maxWidth: 240, maxLines: 2
    });
  };

  if (typeof ModeRegistry !== 'undefined') {
    ModeRegistry.register('story', StoryMode);
  }
})();
