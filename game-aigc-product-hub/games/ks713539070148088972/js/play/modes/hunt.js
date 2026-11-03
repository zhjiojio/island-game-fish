/**
 * play/modes/hunt.js — 静态寻物模式
 * 职责：
 *   - 单图 contain 显示（同 hidden）
 *   - 状态条下方的寻物清单 icon 条（PROPS[prop].iconImg 或 emoji chip）
 *   - 找到后 icon 变灰打勾
 *   - 命中判定/命中反馈均复用 BaseMode 默认实现
 * 依赖：BaseMode, Renderer, TextureManager, CONFIG, M3
 */
(function () {
  'use strict';

  function HuntMode(level, theme) {
    BaseMode.call(this, level, theme);
  }
  BaseMode.extend(HuntMode);

  HuntMode.collectAssetGroups = function (level) {
    return [[level.scene], [level.completeImage]];
  };

  HuntMode.prototype.draw = function (state) {
    var level = this.level;
    if (!level.scene) return;

    var stage   = CONFIG.getLayoutRegions(level.mode).stage;
    var W       = stage.w;
    // hunt 多一条 strip 高度（40px），在 stage 区域内部二次收缩，不影响三大区域边界
    var STRIP_H = 40;
    var stageY  = stage.y + STRIP_H;
    var stageH  = stage.h - STRIP_H;

    // 绘制寻物 strip
    this._drawHuntStrip(state, stage.y, W, STRIP_H);

    // 场景图
    var fit = this._calcFitWidth(level.scene, 0, stageY, W, stageH);
    this._fit = fit;
    if (fit) {
      this._drawZoomedImage(level.scene, fit);
      this._drawImageDividers(fit.y, fit.y + fit.h);
    }

    this._drawMarks();
    this._drawHintMask(state, fit);
  };

  HuntMode.prototype._drawHuntStrip = function (state, y, W, h) {
    Renderer.drawRect(0, y, W, h, 'rgba(20,40,20,0.85)');
    var odds  = this.level.odds || [];
    var chipW = Math.min(52, Math.floor((W - 16) / Math.max(odds.length, 1)));
    var startX = (W - chipW * odds.length) / 2;

    for (var i = 0; i < odds.length; i++) {
      var odd      = odds[i];
      var found    = state.hits.indexOf(i) >= 0;
      var cx       = startX + i * chipW + chipW / 2;
      var chipY    = y + 4;
      var chipSize = h - 8;

      // 优先使用 PROPS 中的 iconImg（本地资源）
      var iconSrc = null;
      var props   = window.RemoteConfig ? RemoteConfig.props : {};
      if (odd.prop && props[odd.prop] && props[odd.prop].iconImg) {
        iconSrc = props[odd.prop].iconImg;
      }

      if (iconSrc && TextureManager.get(iconSrc)) {
        Renderer.drawImage(iconSrc, cx - chipSize/2, chipY, chipSize, chipSize, found ? 0.35 : 1.0);
      } else {
        // emoji/文字 chip
        var emoji = (props[odd.prop] && props[odd.prop].emoji) || '';
        var text  = emoji || odd.tag || '?';
        Renderer.drawRoundRect(cx - chipSize/2, chipY, chipSize, chipSize, 6, {
          fill: found ? 'rgba(40,40,40,0.5)' : 'rgba(0,180,100,0.2)'
        });
        Renderer.drawText(text, cx, chipY + chipSize/2 - 7, {
          fontSize: found ? 10 : 12,
          color: found ? '#666' : '#fff',
          align: 'center'
        });
      }

      // 找到打勾
      if (found) {
        Renderer.drawText('✓', cx, chipY + chipSize/2 - 8, {
          fontSize: 14, color: '#00ff88', align: 'center'
        });
      }
    }
  };

  if (typeof ModeRegistry !== 'undefined') {
    ModeRegistry.register('hunt', HuntMode);
  }
})();
