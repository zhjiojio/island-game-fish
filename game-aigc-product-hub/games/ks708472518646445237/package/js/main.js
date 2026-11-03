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
    require('./tb-config.js');   // 全局配置 + CDN 基址
    require('./tb-loader.js');   // 视频 / 图片 / 音频加载与缓存
    require('./tb-story.js');    // 剧本数据（30 shot）
    require('./tb-model.js');    // 玩法数据模型（星光 / 排名 / 换装）
    require('./tb-ui.js');       // Canvas 绘制基元 + 直播间 HUD
    require('./tb-audio.js');    // 人声顺序播报
    require('./tb-engine.js');   // 主引擎：剧情推进 + 交互分发
    require('./tb-render.js');   // 每帧绘制
    require('./tb-input.js');    // 触摸输入
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
    // v1.0.13 修复视频顶部/底部留黑：快手环境优先用系统真实屏幕尺寸，
    //   避免 window.innerHeight 排除状态栏后视频被限制在中间造成上下黑条
    var cssW = window.innerWidth || 375;
    var cssH = window.innerHeight || 667;
    if (typeof ks !== 'undefined' && ks.getSystemInfoSync) {
      try {
        var sysInfo = ks.getSystemInfoSync();
        if (sysInfo && sysInfo.screenWidth)  cssW = sysInfo.screenWidth;
        if (sysInfo && sysInfo.screenHeight) cssH = sysInfo.screenHeight;
      } catch (e) {}
    }
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
  // 【游戏装配】
  // 占位绘制已由 tb-render.js 的 Canvas 绘制逻辑替代。
  // ─────────────────────────────────────────────────────────────────────────
  M3.UI.bind(ctx);
  M3.Engine.bind(ctx);
  M3.Render.bind(ctx);
  M3.Model.init(M3.Story);
  M3.Input.init();

  // 登录（失败降级为游客态，不阻塞游戏）
  if (window.KwaiLogin && window.KwaiLogin.init) {
    window.KwaiLogin.init({
      onSuccess: function (openId) { M3.Engine.report('login_ok', { openId: openId ? 1 : 0 }); },
      onFail:    function ()       { M3.Engine.report('login_fail', {}); }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 【主循环】
  // 每帧先 resize（幂等，尺寸未变时开销极低），再执行绘制。
  // 必须每帧 clearRect（在 Render.draw 内），否则 underGameView 的视频会被
  // canvas 的黑色缓存帧盖住。
  // ─────────────────────────────────────────────────────────────────────────
  function loop() {
    resize();
    M3.Engine.tick();
    M3.Render.draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
