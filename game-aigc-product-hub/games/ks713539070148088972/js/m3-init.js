(function () {
  // ─────────────────────────────────────────────────────────────────────────
  // m3-init.js — 全局命名空间与布局参数初始化
  //
  // 【职责】
  //   本文件必须在所有游戏 js 文件之前加载 / require，负责：
  //   1. 创建 window.M3 全局命名空间
  //   2. 初始化 M3.Layout（屏幕尺寸 + 安全区基础字段）
  //   3. 提供 M3._now() 统一时间源
  //
  // 【加载规则】
  //   H5：index.html 中必须是第一个 <script src="js/m3-init.js?v=1">
  //   快手：main.js require 块中必须是第一行 require('./m3-init.js')
  //
  // 【扩展规则】
  //   其他 js 文件（layout.js / board.js / game.js …）均可安全地向
  //   M3.Layout / M3.C / M3.Game 等挂载属性，无需再做 M3.Layout = M3.Layout || {}
  //   的防御性检查，因为 m3-init.js 已保证这些基础对象存在。
  // ─────────────────────────────────────────────────────────────────────────

  var M3 = window.M3 = window.M3 || {};

  // ── 屏幕布局基础字段 ──────────────────────────────────────────────────────
  M3.Layout = {
    safeTop: 0,    // 顶部安全区高度（逻辑像素）：状态栏 + 刘海
    safeBottom: 0, // 底部安全区高度（逻辑像素）：Home 指示条
    usableH: 0,   // 可用高度 = 屏幕总高 - safeTop
    w:       0,   // 屏幕逻辑宽度
    h:       0,   // 屏幕逻辑高度
    scale:   1    // 布局缩放系数 = 实际宽度 / 设计稿宽度(CONFIG.VW)，由 core/loop.js resize() 计算并 clamp
    // layout.js 等子模块会在此对象上追加 calc / cell / boardX / boardY 等字段
  };

  // ── 布局像素缩放工具 ──────────────────────────────────────────────────────
  // 用法：把 CONFIG 里按 375 设计稿写的固定 px 常量（padding/间距/图标尺寸/字号）
  // 传进来，统一乘以 M3.Layout.scale 并取整，保证不同宽度机型上元素等比缩放、
  // 不出现"标题变了但按钮没变"的错位（scale 是单一系数，同时作用于宽高，不会
  // 导致图片/图标被拉伸变形）。
  M3.Layout.px = function (n) {
    return Math.round(n * M3.Layout.scale);
  };

  // ── 统一时间源 ────────────────────────────────────────────────────────────
  // 禁止在业务代码中直接调用 performance.now()。
  // 快手环境时间基不一致，直接调用会导致动画卡死。
  M3._now = function () {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  };
})();
