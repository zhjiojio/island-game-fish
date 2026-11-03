/**
 * layout.js — 换装匹配布局
 *
 * 区域划分（从上到下）：
 *   ┌─────────────────────┐ safeTop
 *   │        HUD          │ 56px  — 倒计时/标题/进度/错误剩余
 *   ├─────────────────────┤
 *   │                     │
 *   │     sceneArea       │ 弹性 — 人物立绘 + 场景背景 + 对话框
 *   │                     │
 *   ├─────────────────────┤
 *   │     optionBar       │ 112px — 4 个衣服选项卡片
 *   ├─────────────────────┤
 *   │     toolBar         │ 72px  — +5次 / 提示 / 加时
 *   └─────────────────────┘ h - bottomPadding
 *
 * EV-005：bottomPadding 由 KwaiAd.showBanner onResize 写入，init() 不重置。
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  M3.Layout = M3.Layout || {};

  var HUD_H        = 56;   // 顶部 HUD
  var OPTION_BAR_H = 112;  // 4 张衣服卡片
  var TOOL_BAR_H   = 72;   // 3 个工具按钮
  var OPTION_GAP   = 6;    // optionBar 与 sceneArea 之间间距
  var TOOL_GAP     = 4;    // toolBar 与 optionBar 之间间距

  function init() {
    var canvas = window.canvas;
    var dpr    = window.devicePixelRatio || 1;

    var logicW = canvas.width  / dpr;
    var logicH = canvas.height / dpr;

    M3.Layout.w        = logicW;
    M3.Layout.h        = logicH;
    M3.Layout.safeTop  = M3.Layout.safeTop || 0;
    M3.Layout.usableH  = logicH - M3.Layout.safeTop;

    // EV-005：保留已有 bottomPadding，不重置
    M3.Layout.bottomPadding = M3.Layout.bottomPadding || 0;

    M3.Layout.centerX = logicW * 0.5;
    M3.Layout.centerY = logicH * 0.5;

    // ── HUD ────────────────────────────────────────────────────────────────
    M3.Layout.hudH = HUD_H;
    M3.Layout.hudY = M3.Layout.safeTop;

    // ── 底部总高 ──────────────────────────────────────────────────────────
    var bottomH = OPTION_BAR_H + OPTION_GAP + TOOL_BAR_H + TOOL_GAP
                  + M3.Layout.bottomPadding;

    // ── 场景区（人物立绘区域）──────────────────────────────────────────────
    var sceneTop = M3.Layout.safeTop + HUD_H;
    var sceneH   = Math.max(0, logicH - sceneTop - bottomH);
    M3.Layout.sceneArea = { x: 0, y: sceneTop, w: logicW, h: sceneH };

    // ── 选项栏（4 张衣服卡）──────────────────────────────────────────────
    var optionY = sceneTop + sceneH + OPTION_GAP;
    M3.Layout.optionBar = { x: 0, y: optionY, w: logicW, h: OPTION_BAR_H };

    // 4 张卡片单独尺寸
    var cardMargin = 8;
    var cardW      = (logicW - cardMargin * 5) / 4;
    var cardH      = OPTION_BAR_H - 8;
    M3.Layout.optionCards = [];
    for (var i = 0; i < 4; i++) {
      M3.Layout.optionCards.push({
        x: cardMargin + i * (cardW + cardMargin),
        y: optionY + 4,
        w: cardW,
        h: cardH,
      });
    }

    // ── 工具栏（3 个激励按钮）────────────────────────────────────────────
    var toolY = optionY + OPTION_BAR_H + TOOL_GAP;
    M3.Layout.toolBar = { x: 0, y: toolY, w: logicW, h: TOOL_BAR_H };

    var toolMargin = 10;
    var toolW      = (logicW - toolMargin * 4) / 3;
    var toolH      = TOOL_BAR_H - 8;
    M3.Layout.toolBtns = [];
    for (var j = 0; j < 3; j++) {
      M3.Layout.toolBtns.push({
        x: toolMargin + j * (toolW + toolMargin),
        y: toolY + 4,
        w: toolW,
        h: toolH,
      });
    }
  }

  M3.Layout.init = init;
  init();
})();
