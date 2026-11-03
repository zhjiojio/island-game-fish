(function () {
  var M3 = window.M3 = window.M3 || {};

  // ─────────────────────────────────────────────────────────────────────────
  // 【快手小游戏环境文件加载】
  // 快手不走 index.html，由根目录 game.js require 本文件，再由此处按序加载依赖。
  // H5 浏览器走 index.html 的 <script> 标签，不进入本分支。
  // AI 生成游戏时按实际文件和依赖顺序填写，子文件夹用相对路径（如 './utils/helper.js'）。
  // ─────────────────────────────────────────────────────────────────────────
  if (typeof require === 'function') {
    require('./m3-init.js'); // 必须第一行：初始化 M3.Layout 等全局基础参数
    require('./kwai-event-bus.js'); // 事件总线（平台能力基础，勿删）
    require('./kwai-ad-config.js'); // 广告位配置（平台能力基础，勿删）
    require('../api/kwai-login.js'); // 用户登录
    require('../api/kwai-ad.js');    // 广告（激励 / 插屏 / Banner）
    require('../api/kwai-share.js'); // 分享
    require('./layout.js');
    require('./compliance.js');
    // ── 换装匹配玩法层（v4）────────────────────────────────────────
    require('./scene.js');   // 关卡数据（8 题 + 程序化绘制）
    require('./board.js');   // 选题状态机（选项/预览/判定）
    require('./game.js');    // 流程控制（热区点击 + 广告）
    require('./render.js');  // 渲染（HUD/场景/选项栏/工具栏）
    require('./input.js');   // 输入（点击坐标 → 热区映射）
  }

  var canvas = window.canvas;
  var ctx = canvas.getContext('2d');

  // ─────────────────────────────────────────────────────────────────────────
  // 【屏幕适配 + DPR + 安全区】
  // canvas 物理尺寸 = CSS 尺寸 × DPR，配合 setTransform 保证高清渲染。
  // M3.Layout 基础字段已由 m3-init.js 初始化，此处只负责 resize 更新。
  // 所有游戏内容的 Y 起点必须从 M3.Layout.safeTop 开始，禁止从 0 开始绘制。
  // ─────────────────────────────────────────────────────────────────────────
  function getSafeTop() {
    // 快手小游戏环境：从系统信息读取安全区
    if (typeof ks !== 'undefined' && ks.getSystemInfoSync) {
      try {
        var info = ks.getSystemInfoSync();
        return (info.safeArea && info.safeArea.top) ? info.safeArea.top : 0;
      } catch (e) { return 0; }
    }
    return 0;
  }

  function resize() {
    var cssW = window.innerWidth || 375;   // CSS 逻辑像素宽（浏览器视口宽 / 快手屏幕宽），375 为 iPhone 6 兜底值
    var cssH = window.innerHeight || 667;  // CSS 逻辑像素高，667 为 iPhone 6 兜底值
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 更新布局参数
    M3.Layout.w = cssW;
    M3.Layout.h = cssH;
    M3.Layout.safeTop = getSafeTop();
    M3.Layout.usableH = cssH - M3.Layout.safeTop;
  }
  resize();
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 【统一时间源】
  // M3._now 已由 m3-init.js 定义，此处无需重复。
  // 所有主循环和动画逻辑统一使用 M3._now()，禁止直接调用 performance.now()。
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // 【游戏初始化 & 主循环】
  // ─────────────────────────────────────────────────────────────────────────
  M3.Layout.init();
  if (M3.Render && M3.Render.init) M3.Render.init();
  if (M3.Game   && M3.Game.init)   M3.Game.init();
  if (M3.Input  && M3.Input.init)  M3.Input.init();

  if (typeof KwaiLogin !== 'undefined') {
    KwaiLogin.init({
      onSuccess: function (openId) {},
      onFail:    function ()        {},
    });
  }

  // 合规接口初始化（实名认证 + 防沉迷预拉取，静默降级不阻塞启动）
  if (M3.Compliance && M3.Compliance.init) {
    M3.Compliance.init();
  }
  function loop() {
    resize();
    M3.Layout.init();
    if (M3.Game   && M3.Game.update) M3.Game.update();
    if (M3.Render && M3.Render.draw) M3.Render.draw();
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
