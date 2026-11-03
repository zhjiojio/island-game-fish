(function () {
  var M3 = window.M3 = window.M3 || {};

  // ── 快手小游戏环境：按依赖顺序 require 所有模块 ─────────────────────────────
  if (typeof require === 'function') {
    // 1. 基础初始化（必须第一行）
    require('./m3-init.js');

    // 2. 标准库
    // 注：cdn-loader.js / game-logger.js / asset-manager.js 已不在加载链里——
    // 本项目图片加载走 TextureManager（js/render/texture.js），日志走 console，
    // 这三个模块业务代码从未调用过，属于孤儿模块。文件本身仍保留在 standard/，
    // 后续若要统一接入可再重新加回来。
    require('../standard/kwai-event-bus.js');
    require('../standard/subpackage-loader.js');

    // 3. 产品定制层（必须在 kwai-ad-config.js / core/config.js 之前加载）
    require('./core/product.config.js');

    // 4. 平台能力 API
    require('./kwai-ad-config.js');
    require('../api/kwai-login.js');
    require('../api/kwai-ad.js');
    require('../api/kwai-share.js');
    require('../api/kwai-subpackage.js');
    require('../api/kwai-open.js');
    require('../api/kwai-shortcut.js');
    // kwai-file.js / kwai-network.js：供 render/texture.js 的图片本地磁盘缓存
    // （下载落盘 + 复用本地文件，避免同一 URL 重复走网络）使用，须在 texture.js 之前加载。
    require('../api/kwai-file.js');
    require('../api/kwai-network.js');

    // 5. WebGL 渲染层
    require('./render/gl.js');
    require('./render/shaders.js');
    require('./render/texture.js');
    require('./render/batch.js');
    require('./render/text.js');
    require('./render/renderer.js');

    // 6. 核心层
    require('./core/config.js');
    require('./core/scene.js');
    require('./core/input.js');
    require('./core/loop.js');
    require('./core/ui-kit.js');

    // 7. 数据层
    require('./data/mock-levels-config.js');
    require('./data/remote-config.js');
    require('./data/difficulty.js');

    // 8. 系统层
    require('./systems/storage.js');
    require('./systems/audio.js');
    require('./systems/ads.js');
    require('./systems/telemetry.js');
    require('./systems/checkin.js');

    // 9. 玩法层
    require('./play/mode-registry.js');
    require('./play/modes/base-mode.js');
    require('./play/modes/graphics-match-mode.js');
    require('./play/modes/hidden.js');
    require('./play/modes/spot.js');
    require('./play/modes/hunt.js');
    require('./play/modes/story.js');
    require('./play/modes/dressup.js');
    require('./play/modes/puzzle.js');
    require('./play/hud/hud.js');
    require('./play/play.js');
    require('./play/asset-loader.js');
    require('./play/reward-flow.js');

    // 10. 弹窗
    require('./play/modals/win-modal.js');
    require('./play/modals/lose-modal.js');
    require('./play/modals/settings-overlay.js');
    require('./play/modals/unlock-overlays.js');
    require('./play/modals/checkin-modal.js');

    // 11. 场景
    require('./scenes/welcome.js');
    require('./scenes/home.js');
    require('./scenes/game-scene.js');
  }

  // ── Canvas 获取 ──────────────────────────────────────────────────────────────
  var canvas = window.canvas;
  if (!canvas) {
    // H5 浏览器环境（从 index.html 的 DOM 获取）
    canvas = document.getElementById('gameCanvas');
  }
  if (!canvas) {
    console.error('[Main] canvas not found');
    return;
  }

  // ── 初始化渲染器 ──────────────────────────────────────────────────────────────
  Renderer.init(canvas);

  // ── 绑定输入 ──────────────────────────────────────────────────────────────────
  InputManager.bindCanvas(canvas);

  // ── 初始化系统 ────────────────────────────────────────────────────────────────
  Storage.get; // 确保已加载
  Audio.init();
  Ads.init();

  // ── 预加载 UI 图标（快手环境 ks.createImage 不支持懒加载，必须提前 TextureManager.load）──
  var _uiKeys = Object.keys(CONFIG.UI_ASSETS || {});
  _uiKeys.forEach(function (key) {
    var src = CONFIG.uiAsset(key);
    if (src) TextureManager.load(src).catch(function (e) { console.error('[preload fail]', key, src, e); });
  });

  // ── 登录 + 拉取用户信息（头像/昵称，写入 Storage，home.js 头像区自动读取）──────
  // 说明：
  //   - KwaiLogin.init 仅做 session 校验 + ks.login 拿临时 code；code 换 openId
  //     需要开发者服务器支持，本模板未接后端，此处只走「游客态」继续（不阻塞启动）。
  //   - getUserInfo 会触发系统授权弹窗（scope.userInfo），失败/拒绝时静默回退，
  //     home.js 会用默认头像 + 「铁子」兜底文案，不影响主流程。
  KwaiLogin.init({
    onSuccess: function () {
      KwaiOpen.getUserInfo({
        onSuccess: function (res) {
          var info = res && res.userInfo;
          if (!info) return;
          if (info.avatarUrl) TextureManager.load(info.avatarUrl);
          Storage.set(CONFIG.STORAGE_KEYS.user, {
            avatar:   info.avatarUrl || '',
            nickName: info.nickName  || ''
          });
        },
        onFail: function () { /* 静默回退，home.js 用默认兜底 */ }
      });
    },
    onFail: function () { /* 游客态继续 */ }
  });

  // ── 埋点：冷热启判断 ──────────────────────────────────────────────────────────
  (function () {
    var now        = Date.now();
    var lastBoot   = Storage.get(CONFIG.STORAGE_KEYS.teleLastBoot) || 0;
    var isCold     = (now - lastBoot) > 30 * 60 * 1000; // 30 分钟
    Storage.set(CONFIG.STORAGE_KEYS.teleLastBoot, now);
    Telemetry.jsStart(isCold);
  })();

  // ── 注册玩法模式（确保 mode 文件已加载）──────────────────────────────────────
  // mode 文件末尾已自注册，此处仅验证
  var registeredModes = ModeRegistry.list();
  console.info('[Main] registered modes:', registeredModes.join(', '));

  // ── 启动首个场景 ──────────────────────────────────────────────────────────────
  // 跳过欢迎页（调试用）：localStorage['<CONFIG.STORAGE_KEY_PREFIX>_skip_welcome'] = '1'
  var skipWelcome = false;
  try { skipWelcome = localStorage.getItem(CONFIG.STORAGE_KEY_PREFIX + '_skip_welcome') === '1'; } catch(e) {}
  SceneManager.go(skipWelcome ? 'home' : 'welcome');

  // ── 启动主循环 ────────────────────────────────────────────────────────────────
  GameLoop.start();

  // ── 主循环注册 update/draw 代理（GameLoop 内部调用 SceneManager）──────────────
  // 注意：GameLoop 已硬编码调用 SceneManager.update / SceneManager.draw
  // UIKit.drawToasts() 在各 scene.draw 内调用（欢迎页/首页通用）
  // welcome/home 场景需要单独调用 UIKit.drawToasts()
  // 因为 game-scene.js 已包含，home/welcome 也需要手动注入：
  var _origSceneDraw = SceneManager.draw.bind(SceneManager);
  SceneManager.draw = function () {
    _origSceneDraw();
    // 全局 toast（所有场景通用）
    UIKit.drawToasts();
    // 广告 loading 遮罩（全局最顶层）
    var adArea = UIKit.drawAdLoading();
    if (adArea) InputManager.add(adArea);
  };

  console.info('[Main] ' + CONFIG.BUILD_VER + ' started [MARKER]');

  // ── 生命周期：后台返回时恢复 GL 上下文 + BGM + 倒计时 ────────────────────────
  function _onAppShow() {
    GameLoop.resume();
    if (window.Audio && Audio.resumeAudio) Audio.resumeAudio();
    if (window.Ads && Ads.onAppShow) {
      Ads.onAppShow();
    }
    if (window.PlayController && PlayController.state && PlayController.state.paused && PlayController._resumeAfterAd) {
      PlayController._resumeAfterAd();
    }
  }

  if (typeof ks !== 'undefined' && ks.onShow) {
    ks.onShow(function () { _onAppShow(); });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) _onAppShow();
    });
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pageshow', function (e) {
      if (e && e.persisted) _onAppShow();
    });
  }
})();
