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
    // ↓ 其他平台能力模块按需引入（根据游戏功能选择）
    // require('../api/kwai-base.js');       // 系统信息 / 生命周期 / 触摸事件
    // require('../api/kwai-render.js');     // 画布 / 帧率控制 / 字体 / 图片预加载
    // require('../api/kwai-ui.js');         // Toast / Modal / Loading / 胶囊按钮布局
    // require('../api/kwai-network.js');    // HTTP 请求 / 下载 / 上传 / WebSocket
    // require('../api/kwai-storage.js');    // 本地数据缓存
    // require('../api/kwai-file.js');       // 文件系统
    // require('../api/kwai-media.js');      // 视频 / 音频 / 图片管理
    // require('../api/kwai-device.js');     // 传感器 / 键盘 / 网络状态 / 振动
    // require('../api/kwai-open.js');       // 用户信息 / 授权 / Feed 流直出
    // require('../api/kwai-record.js');     // 对局回放录制
    // require('../api/kwai-repost.js');     // 主动转发
    // require('../api/kwai-shortcut.js');   // 添加到桌面
    // require('../api/kwai-siderbar.js');   // 侧边栏
    // require('../api/kwai-commonuse.js');  // 设为常用
    // require('../api/kwai-official.js');   // 官方号 / CP 服务号
    // require('../api/kwai-game-community.js');  // 游戏圈
    // require('../api/kwai-subpackage.js');      // 分包加载
    // require('../api/kwai-data-analysis.js');   // 数据分析上报
    //↓ 游戏文件（按依赖顺序填入，禁止在 game.js 等文件内再写 require）
    // require('./constants.js');
    // require('./layout.js');
    // require('./board.js');
    // require('./levels.js');
    // require('./game.js');
    // require('./render.js');
    // require('./input.js');
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
  // 【占位绘制】
  // 仅用于模版验证，AI 生成游戏后此函数应被 render.js 中的绘制逻辑替代。
  // ─────────────────────────────────────────────────────────────────────────
  function draw() {
    var w = canvas.width / (window.devicePixelRatio || 1);
    var h = canvas.height / (window.devicePixelRatio || 1);
    ctx.fillStyle = '#5bc8e8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H5 快手小游戏模版', w / 2, h / 2 - 20);
    ctx.font = '16px sans-serif';
    ctx.fillText('欢迎，开始编写你的玩法', w / 2, h / 2 + 12);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 【主循环】
  // 每帧先 resize（幂等，尺寸未变时开销极低），再执行绘制。
  // AI 生成游戏后将 draw() 替换为 M3.Game.update() + M3.Render.draw() 等调用。
  // ─────────────────────────────────────────────────────────────────────────
  function loop() {
    resize();
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
