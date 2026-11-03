/**
 * play/modes/hidden.js — 单图找茬（找穿越物）模式
 * 职责：
 *   - 单图 contain 居中绘制
 *   - 命中判定/命中反馈/旁白气泡均复用 BaseMode 默认实现
 * 依赖：BaseMode, Renderer, CONFIG, M3
 */
(function () {
  'use strict';

  function HiddenMode(level, theme) {
    BaseMode.call(this, level, theme);
  }
  BaseMode.extend(HiddenMode);

  HiddenMode.collectAssetGroups = function (level) {
    return [[level.scene], [level.completeImage]];
  };

  HiddenMode.prototype.draw = function (state) {
    var level = this.level;
    if (!level.scene) return;

    var stage = CONFIG.getLayoutRegions(level.mode).stage;
    var W      = stage.w;
    var stageY = stage.y;
    var stageH = stage.h;

    var fit = this._calcFitWidth(level.scene, 0, stageY, W, stageH);
    this._fit = fit;
    if (fit) {
      this._drawZoomedImage(level.scene, fit);
      this._drawImageDividers(fit.y, fit.y + fit.h);
    } else {
      // 占位框
      Renderer.drawRoundRect(10, stageY + 10, W - 20, stageH - 20, 8, { fill: '#1a2a3a' });
      Renderer.drawText('图片加载中…', W/2, stageY + stageH/2, { fontSize: 16, color: '#888', align: 'center' });
    }

    this._drawMarks();
    this._drawHintMask(state, fit);
    this._drawNarrative();
  };

  // 注册到 ModeRegistry（在 mode-registry.js 加载后执行）
  if (typeof ModeRegistry !== 'undefined') {
    ModeRegistry.register('hidden', HiddenMode);
  }
})();
