(function () {
  var M3 = window.M3 = window.M3 || {};

  // ─────────────────────────────────────────────────────────────────────────
  // 【快手小游戏环境文件加载】
  // 快手不走 index.html，由根目录 game.js require 本文件，再由此处按序加载依赖。
  // H5 浏览器走 index.html 的 <script> 标签，不进入本分支。
  // AI 生成游戏时按实际文件和依赖顺序填写，子文件夹用相对路径（如 './utils/helper.js'）。
  // ─────────────────────────────────────────────────────────────────────────
  if (typeof require === 'function') {
    require('./common/m3-init.js'); // 必须第一行：初始化 M3.Layout 等全局基础参数
    require('./common/kwai-event-bus.js'); // 事件总线（平台能力基础，勿删）
    require('./common/kwai-ad-config.js'); // 广告位配置（平台能力基础，勿删）
    require('../api/kwai-base.js');  // 生命周期 / 系统信息
    require('../api/kwai-payment.js'); // 快手真实支付适配（H5 不模拟）
    require('../api/kwai-login.js'); // 用户登录
    require('../api/kwai-ad.js');    // 广告（激励 / 插屏 / Banner）
    require('../api/kwai-share.js'); // 分享
    require('../api/kwai-network.js');    // HTTP 请求 / 下载 / 上传 / WebSocket
    require('../api/kwai-storage.js');    // 本地数据缓存
    require('../api/kwai-file.js');       // 沙盒文件系统（语音包下载缓存等）
    require('../api/kwai-open.js');       // 用户信息 / 授权 / Feed 流直出
    require('../api/kwai-ui.js');         // Toast / Modal / Loading / 胶囊按钮布局
    require('../api/kwai-media.js');      // 音频(BGM/SFX) / 视频 / 图片（双端适配）
    require('../api/kwai-device.js');     // 振动（vibrateShort）
    // ↓ 斗地主游戏文件（按依赖顺序）
    require('./common/compliance.js');    // 隐私政策、实名、防沉迷与客服能力预留
    require('./common/vibrate.js');       // 震动统一管理（分级/节流/预算/开关），需在所有业务场景之前
    require('./common/config.js');
    require('./common/subpackage.js'); // 快手小游戏分包门禁与预载（H5 端直通放行）
    require('./common/asset-manager.js'); // 统一资源管理器（引用计数 + 双端适配），需在 scene-home / render 之前加载
    require('./core/voice-pack.js');      // 快手小帅斗地主语音包
    require('./core/auth.js');
    require('./common/layout.js');
    require('./common/ui-button.js');
    require('./core/deck.js');
    require('./core/rule.js');
    require('./core/network.js');
    require('./core/game.js');
    require('./iap/diamond-wallet.js');
    require('./iap/iap-http.js');
    require('./iap/iap.js');
    require('./core/game-http.js');
    require('./scene/home.js');
    require('./popup/ad-reward.js');      // 看广告得铁豆弹窗（主页）
    require('./popup/newcomer.js');       // 新手礼包弹窗（首次进入欢迎礼）
    require('./popup/add-desk.js');       // 加桌有奖弹窗（主页加桌 icon）
    require('./popup/bankrupt.js');       // 破产补助弹窗（结算页顶层）
    require('./popup/bean-reward.js');    // 获得豆子弹窗（通用，全场景最顶层）
    require('./popup/record.js');
    require('./core/matchmaking.js');
    require('./scene/game.js');
    require('./popup/voice.js');          // 局内语音/聊天弹窗
    require('./popup/settlement.js');
    require('./common/settings.js');      // 音频设置配置（读写存储 + 应用到 KwaiMedia，UI 在 scene-profile 设置 Tab）
    require('./popup/profile.js');
    require('./popup/shop.js');           // 商城弹窗（钻石/铁豆/语音包）
    require('./popup/exchange.js');       // 钻石换铁豆弹窗
    require('./popup/insufficient-diamond.js'); // 钻石不足弹窗
    require('./popup/insufficient-beans.js');   // 豆子不足弹窗（进场引导购买）
    require('./lib/spine38.js');       // Spine 3.8 runtime（全局 window.spine）
    require('./common/spine-fx.js');   // 一次性 Spine 特效（共享主 GL，播完销毁）
    require('./common/render.js');
    require('./common/input.js');
  }

  var canvas = window.canvas;
  // 获取 WebGL 1.0 上下文（不使用 webgl2），挂到 M3.gl 供 render.js 直接使用。
  // 上下文参数（移动端帧率优先）：
  //   alpha:false  — 画布不透明：每帧全屏 clear + 背景覆盖，省掉 alpha 通道，
  //                  合成时无半透明边缘伪影，UI 更锐利
  //   antialias:false — MSAA 在高 DPR 手机上是数倍写带宽（1080p×dpr3 + 4xMSAA 直接打满）。
  //                  本渲染器的圆形/圆环/文字边缘都由 shader smoothstep 与纹理自带羽化处理，
  //                  几何抗锯齿只对 _fill/_stroke 的斜边有效，收益远小于带宽代价。
  //   depth/stencil:false — 纯 2D 正交渲染用不到深度/模板缓冲（裁剪走 SCISSOR_TEST）
  //   preserveDrawingBuffer:false — 【关键】置 true 会强制驱动每帧保留并拷贝整块
  //                  framebuffer，废掉移动 GPU tile-based 渲染的 discard 快路径，
  //                  是真机掉到 10fps 以下的主因。全包无 readPixels/toDataURL，无需保留。
  //   powerPreference — 优先高性能 GPU（双显卡设备走独显）
  var GL_CONTEXT_OPTIONS = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  };
  var gl = canvas.getContext('webgl', GL_CONTEXT_OPTIONS) ||
    canvas.getContext('experimental-webgl', GL_CONTEXT_OPTIONS);
  if (!gl) {
    console.error('[M3] WebGL not supported, rendering disabled');
  }
  M3.gl = gl;   // 全局共享，render.js 直接取用

  // ─────────────────────────────────────────────────────────────────────────
  // 【屏幕适配 + DPR + 安全区】
  // canvas 物理尺寸 = CSS 尺寸 × DPR，配合 setTransform 保证高清渲染。
  // M3.Layout 基础字段已由 m3-init.js 初始化，此处只负责 resize 更新。
  // 所有游戏内容的 Y 起点必须从 M3.Layout.safeTop 开始，禁止从 0 开始绘制。
  // ─────────────────────────────────────────────────────────────────────────
  function getSafeTop () {
    // 快手小游戏环境：从系统信息读取安全区
    if (typeof ks !== 'undefined' && ks.getSystemInfoSync) {
      try {
        var info = ks.getSystemInfoSync();
        var top = (info.safeArea && info.safeArea.top) ? info.safeArea.top : 0;
        // 部分机型横屏下 safeArea 未做坐标转换，返回的是竖屏 top（约 40~60），
        // 会导致整个内容区被压下、卡片区可用高度变小 → 三张场次卡 contain
        // 缩放后横向空隙拉大（真机「间距大」、Web 正常的根因之一）。
        // 横屏时刘海/状态栏在左右两侧，顶部 top 不可能超过屏高的 15%，
        // 超过即判定为未转换的竖屏坐标，按 0 处理。
        var sw = info.screenWidth || info.windowWidth || 0;
        var sh = info.screenHeight || info.windowHeight || 0;
        if (top > 0 && sw > sh && top > sh * 0.15) return 0;
        return top;
      } catch (e) { return 0; }
    }
    return 0;
  }

  // 记录上一次的画布尺寸，仅当尺寸真正变化时才重建 backing store。
  // 【关键修复】canvas.width/height 每帧赋值会重新分配整块画布缓冲区，
  // 在全屏浏览器（大画布 + 高 DPR）下会周期性露出未初始化的 GPU 显存，
  // 表现为「红色全屏定时闪动」；手机画布小、开销低故不复现。
  var _lastCssW = 0, _lastCssH = 0, _lastDpr = 0;

  // 渲染 DPR。
  //
  // 【为什么不能在快手环境钳制】
  //   H5 的 canvas 有 CSS 尺寸与 backing store 两层，缩小 backing store 后浏览器
  //   会自动拉伸回 CSS 尺寸，降分辨率只掉锐度不影响画面完整性。
  //   快手小游戏的主画布是屏幕直连画布：canvas.width/height 就是实际上屏像素，
  //   没有 CSS 层做回填。一旦写入小于屏幕的尺寸，画面不会被拉伸 → 直接黑屏。
  //   所以钳制只在 H5 生效，快手一律使用平台原始 dpr。
  var MAX_RENDER_DPR = 2;
  var _isMiniGameEnv = (typeof ks !== 'undefined') || (typeof wx !== 'undefined');
  function renderDpr () {
    var d = window.devicePixelRatio || 1;
    if (d < 1) d = 1;
    if (_isMiniGameEnv) return d;
    return Math.min(d, MAX_RENDER_DPR);
  }
  M3.renderDpr = renderDpr;   // render.js 的 scissor/文字烘焙需与 backing store 同一 DPR

  function resize () {
    var cssW = window.innerWidth || 375;   // CSS 逻辑像素宽（浏览器视口宽 / 快手屏幕宽），375 为 iPhone 6 兜底值
    var cssH = window.innerHeight || 667;  // CSS 逻辑像素高，667 为 iPhone 6 兜底值
    var dpr = renderDpr();

    // 尺寸/DPR 未变化时，跳过昂贵的画布重建，避免全屏浏览器周期性红屏闪动
    if (cssW === _lastCssW && cssH === _lastCssH && dpr === _lastDpr) return;
    _lastCssW = cssW; _lastCssH = cssH; _lastDpr = dpr;

    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // WebGL 用 viewport 替代 ctx.setTransform，并通知渲染器更新逻辑分辨率
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
    if (M3.Render && M3.Render.onResize) M3.Render.onResize(cssW, cssH);
    // 更新布局参数
    M3.Layout.w = cssW;
    M3.Layout.h = cssH;
    M3.Layout.safeTop = getSafeTop();
    M3.Layout.usableH = cssH - M3.Layout.safeTop;
  }
  var _resizeTimer = 0;
  function scheduleResize () {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
      _resizeTimer = 0;
      resize();
    }, 120);
  }

  resize();
  if (typeof window.addEventListener === 'function') {
    // 浏览器地址栏收放会连续产生多次 resize；合并为视口稳定后的一次重建。
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', function () {
      clearTimeout(_resizeTimer);
      _resizeTimer = 0;
      resize();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 【统一时间源】
  // M3._now 已由 m3-init.js 定义，此处无需重复。
  // 所有主循环和动画逻辑统一使用 M3._now()，禁止直接调用 performance.now()。
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // 【游戏绘制】
  // 委托给 M3.Render.draw() 进行全部 Canvas 渲染。
  // ─────────────────────────────────────────────────────────────────────────
  function draw () {
    M3.Render.draw();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 【主循环 + WebSocket 消息处理 + 游戏初始化】
  // ─────────────────────────────────────────────────────────────────────────
  var _lastNow = 0;
  var _handledJoin = false;

  function loop () {
    // Canvas backing store 只允许在初始化或真实 resize/orientationchange 事件中重建。
    // 每帧调用 resize 会把浏览器地址栏/DPR 的瞬时抖动放大成整块高分辨率缓冲区重建，
    // 在出牌动画期间表现为周期性全屏红闪。
    var now = M3._now();
    M3.Layout.calc();
    M3.Render.update(now);
    draw();
    _lastNow = now;
    requestAnimationFrame(loop);
  }

  // 结算页有人退出后，剩余玩家自动离房的一次性保护标记（避免每帧 state 重复发 leaveRoom）
  var _autoLeaveSent = false;
  var _playedThisRoom = false;   // 本房间是否已真正开过局（进过 bidding/playing/settlement）

  // ---- WebSocket 消息处理 ----

  // 重连成功后自动重新同步钱包。
  //
  // 为什么必须有这一段：network.js 的重连恢复只在「身处房间」时重发 join，
  // 大厅场景（无 _lastRoom）重连后不会补发任何业务请求。于是首次连接一旦
  // 抖动触发重连，getWallet 的回包就永远等不到，大厅卡在「同步失败」。
  //
  // 挂在 authOk 而不是连接建立事件上：业务消息必须等认证闸门放行才能发，
  // authOk 是「可以安全发业务请求」的唯一准确信号。
  M3.Network.on('authOk', function (data) {
    if (M3.SceneVoice && M3.SceneVoice.resetForAccount) M3.SceneVoice.resetForAccount(data && data.accountId || '', true);
    // 上线查一次新手礼包领取状态（未领取自动弹窗，终身一次由服务端控制）
    if (M3.SceneNewcomer && M3.SceneNewcomer.checkOnLaunch) M3.SceneNewcomer.checkOnLaunch();
    // 加桌有奖金额：存到全局缓存，弹窗打开时再读取（避免 authOk 早于弹窗模块初始化）
    if (data && data.shortcutRewardBeans) {
      M3._shortcutRewardBeans = data.shortcutRewardBeans;
    }
    // 冷启动/重连自动回房：服务端在 authOk 里下发 resumeRoomId 表示该账号仍在某个
    // 进行中的房间持有座位（上次掉线未主动离场）。只要当前不在局内，就自动回房恢复对局。
    M3.log('NET', 'authOk resume?', data && data.resumeRoomId, 'screen=', M3.Game && M3.Game.getScreen && M3.Game.getScreen());
    if (data && data.resumeRoomId && M3.Game) {
      var inGame = M3.Game.getScreen && M3.Game.getScreen() === 'game';
      var sameRoom = M3.Game.getRoomId && M3.Game.getRoomId() === data.resumeRoomId;
      if (!inGame && !sameRoom && M3.Game.resumeRoom) {
        M3.log('NET', 'auto resume room', data.resumeRoomId);
        M3.Game.resumeRoom(data.resumeRoomId, data.resumeRoomType || '');
      }
    }
    // authOk 是 HTTP token 已落盘、可以安全请求 bootstrap 的唯一时点。
    // 首次认证也必须同步：此前跳过首个 authOk，只依赖 bootstrap 的定时重试，
    // 在弱网下重试耗尽就会让首页一直显示「铁豆同步失败」，手动刷新后才恢复。
    if (M3.Game && M3.Game.syncWallet) M3.Game.syncWallet();
    // 重连后同步钻石余额（仅快手平台有效，canUsePayment 内部自动判断）
    if (M3.Iap && M3.Iap.syncWallet) M3.Iap.syncWallet();
    // 重连后重发未确认的广告领豆（幂等 transId，服务端自动去重）
    if (M3.Game && M3.Game.retryPendingAdClaim) M3.Game.retryPendingAdClaim();
    // 登录就绪：若本次启动来自桌面快捷方式（冷启动时 _user 未就绪被跳过），补发加桌奖励
    if (M3.Game && M3.Game.maybeClaimShortcut) M3.Game.maybeClaimShortcut();
  });

  M3.Network.on('wallet', function (data) {
    if (data && data.wallet && M3.Game.setWallet) M3.Game.setWallet(data.wallet, data.economy, {
      walletSource: data.walletSource || '',
      economyVersion: data.economyVersion || (data.economy && data.economy.version) || '',
      initialBeans: data.initialBeans || 0,
      serverNow: data.serverNow || 0,
      rewardType: data.rewardType || '',
    });
    if (data && data.rewardType) {
      if (M3.SceneHome && M3.SceneHome.markTaskDone) {
        if (data.rewardType === 'share_reward' && (data.claimed || data.amount === 0)) M3.SceneHome.markTaskDone('share');
        if (data.rewardType === 'shortcut_reward' && (data.claimed || data.amount === 0)) M3.SceneHome.markTaskDone('join');
      }
      // 看广告得铁豆：服务端权威发放后刷新弹窗上的次数，并弹出获得豆子弹窗
      if (data.rewardType === 'ad_reward' &&
        M3.SceneAdReward && M3.SceneAdReward.isVisible && M3.SceneAdReward.isVisible()) {
        if (M3.Vibrate) M3.Vibrate.medium();   // 看广告获得豆子成功：中×1
        M3.SceneAdReward.updateFromWallet(data);
        if (data.amount && M3.SceneBeanReward && M3.SceneBeanReward.show)
          M3.SceneBeanReward.show(data.amount);
      }
      // 广告领豆服务端已处理（claimed 或 duplicate），清除 pending 避免重复发送
      if (data.rewardType === 'ad_reward') {
        if (M3.Game && M3.Game.clearPendingAdClaim) M3.Game.clearPendingAdClaim();
      }
      // 新手礼包：领取成功后关闭弹窗（服务端权威发豆），并弹出获得豆子弹窗
      if (data.rewardType === 'newcomer_gift' &&
        M3.SceneNewcomer && M3.SceneNewcomer.onWalletReward) {
        var _newcomerAmount = data.amount;
        M3.SceneNewcomer.onWalletReward(data);
        if (_newcomerAmount && M3.SceneBeanReward && M3.SceneBeanReward.show)
          M3.SceneBeanReward.show(_newcomerAmount);
      }
      // 破产补助：领取后关闭弹窗（服务端权威发豆，每日限 1 次），并弹出获得豆子弹窗
      if (data.rewardType === 'bankrupt_relief' &&
        M3.SceneBankrupt && M3.SceneBankrupt.onWalletReward) {
        var _bankruptAmount = data.amount;
        M3.SceneBankrupt.onWalletReward(data);
        if (_bankruptAmount && M3.SceneBeanReward && M3.SceneBeanReward.show)
          M3.SceneBeanReward.show(_bankruptAmount);
      }
    }
  });

  // 广告奖励状态查询回包（弹窗打开时拉取今日次数）
  M3.Network.on('adRewardStatus', function (data) {
    if (M3.SceneAdReward && M3.SceneAdReward.updateStatus) M3.SceneAdReward.updateStatus(data);
  });

  // 快手支付回调到账通知：服务端确认充值成功后推送
  M3.Network.on('iapConfirmed', function (data) {
    console.log('[IAP] 服务端确认充值到账 orderId=' + (data && data.orderId) + ' diamonds=' + (data && data.diamondsGranted));
    if (M3.Iap && M3.Iap._onServerIapConfirmed) M3.Iap._onServerIapConfirmed(data);
  });

  // 新手礼包状态查询回包（上线查一次，未领取自动弹出）
  M3.Network.on('newcomerGiftStatus', function (data) {
    if (M3.SceneNewcomer && M3.SceneNewcomer.updateStatus) M3.SceneNewcomer.updateStatus(data);
  });

  // 成就统计回包（个人面板打开时拉取）
  M3.Network.on('profileStats', function (data) {
    if (M3.SceneProfile && M3.SceneProfile.updateStats) M3.SceneProfile.updateStats(data);
  });

  // H5 端竞态修复：auth.js 可能在本文件加载前就完成首连认证（本文件是最后一个
  // 加载的脚本），首连的 authOk 到达时 authOk 监听尚未注册（handlers=0 直接丢失）。
  // 因此这里在加载完成时主动触发一次上线检查；若此刻尚未认证，
  // sendGetStatus 的消息会自动排队（network.js _wsSend），认证完成后统一 flush。
  // authOk 监听里的调用保留，作为重连场景的兜底。
  if (M3.SceneNewcomer && M3.SceneNewcomer.checkOnLaunch) {
    M3.SceneNewcomer.checkOnLaunch();
  }

  M3.Network.on('joined', function (data) {
    // 局内调试模式：不进入真实房间（匹配回调迟到时直接离房，避免覆盖 mock 状态）
    if (M3.SceneGame && M3.SceneGame.isDebugMode && M3.SceneGame.isDebugMode()) {
      M3.Network.send('leaveRoom');
      return;
    }
    _autoLeaveSent = false;   // 新入房重置自动离房保护
    _playedThisRoom = false;  // 新入房重置开局标记
    if (M3.Game.clearResuming) M3.Game.clearResuming();  // 回房恢复落定，解除 goHome 屏蔽
    // 已成功加入（匹配到的）房间：匹配流程到此结束，移除匹配 loading，
    // 否则 loading 遮罩会一直盖在房间上，表现为「匹配成功却没开始游戏」。
    if (M3.Matchmaking && M3.Matchmaking.isMatching && M3.Matchmaking.isMatching() && M3.Matchmaking.stop) {
      M3.Matchmaking.stop();
    }
    M3.Game.setMyPlayerId(data.playerId);
    if (data.roomType && M3.Game.setRoomType) M3.Game.setRoomType(data.roomType);
    if (data.wallet && M3.Game.setWallet) M3.Game.setWallet(data.wallet, data.economy, {
      walletSource: data.walletSource || 'joined',
      serverNow: data.serverNow || 0,
    });
    M3.Render.resetHits();
  });

  M3.Network.on('state', function (data) {
    // 局内/结算调试模式：忽略真实对局状态推送（mock 状态不被覆盖）
    if ((M3.SceneGame && M3.SceneGame.isDebugMode && M3.SceneGame.isDebugMode()) ||
        (M3.SceneSettlement && M3.SceneSettlement.isDebugMode && M3.SceneSettlement.isDebugMode())) return;
    var prevPhase = (M3.Game.getState() || {}).phase;
    if (data && data.serverNow && M3.Game.setServerOffset) {
      M3.Game.setServerOffset(data.serverNow - Date.now());
    }
    if (data && data.economy && M3.Game.setEconomy) M3.Game.setEconomy(data.economy);
    M3.Game.setState(data);
    if (M3.Game.updateWalletFromState) M3.Game.updateWalletFromState(data);

    // 匹配 loading：人齐（3 人到位）即视为匹配成功，移除 loading 开始游戏。
    if (M3.Matchmaking && M3.Matchmaking.isMatching && M3.Matchmaking.isMatching()) {
      var _pc = 0;
      if (data.players) {
        for (var _mpid in data.players) {
          if (Object.prototype.hasOwnProperty.call(data.players, _mpid)) _pc++;
        }
      }
      if (_pc >= 3 || data.phase === 'bidding' || data.phase === 'playing') {
        M3.Matchmaking.stop();
      }
    }

    // 标记本房间已真正开过局：一旦进入 bidding/playing/settlement 即视为已开局。
    if (data.phase === 'bidding' || data.phase === 'playing' || data.phase === 'settlement') {
      _playedThisRoom = true;
    }

    // 结算页面有人退出后，其余玩家退回大厅（而不是停留在房间/准备页）。
    // 关键：先让玩家完整看到「结算界面」——处于 settlement 阶段时不离房；
    // 待服务端把本局推进到下一轮准备（ready/waiting）且房间仍不满 3 人时，
    // 说明无法继续，剩余玩家此刻才离房回大厅。触发者自身走 leftRoom→goHome。
    // 必须限定「本房间已开过局」，否则匹配刚进房凑人阶段(ready/waiting 且不足 3 人)
    // 会被误判为「有人退出」而错误离房 → 表现为"已取消匹配"退回大厅。
    if (_playedThisRoom && data.players && (data.phase === 'ready' || data.phase === 'waiting')) {
      var _connected = 0, _total = 0;
      for (var _pid in data.players) {
        if (!Object.prototype.hasOwnProperty.call(data.players, _pid)) continue;
        _total++;
        if (data.players[_pid].connected !== false) _connected++;
      }
      if (!_autoLeaveSent && (_total < 3 || _connected < 3) &&
        M3.Game.getScreen() === 'game') {
        M3.log('STATE', 'peer left (post-settlement) → back to home');
        _autoLeaveSent = true;
        M3.Game.leaveRoom();
        return;
      }
    }

    // 匹配进房后直接进入游戏局内：任意对局阶段（含 waiting/ready）一旦到来即切到
    // game 屏，不再经过 room「准备房间」页。room 屏仅保留给旧的手动建房/输码路径兜底。
    if (data.phase === 'waiting' || data.phase === 'ready' ||
      data.phase === 'bidding' || data.phase === 'playing' || data.phase === 'settlement') {
      if (M3.Game.getScreen() === 'room') {
        M3.Game.goGame();
      }
    }
    // 自动准备：匹配进房后无需玩家手动点「准备」，三人到齐即自动开局发牌。
    // 仅在 ready 阶段、我方存在且尚未 ready 时自动补发一次 setReady，避免重复发送。
    if (data.phase === 'ready') {
      var _myId = M3.Game.getMyPlayerId();
      var _me = _myId && data.players ? data.players[_myId] : null;
      if (_me && !_me.ready) {
        M3.Network.send('setReady', { ready: true });
      }
    }
    // 保存战绩：首次进入 settlement 时记录
    if (data.phase === 'settlement' && prevPhase !== 'settlement' && data.result) {
      var myId = M3.Game.getMyPlayerId();
      if (myId && data.result.deltas) {
        var delta = data.result.deltas[myId] || 0;
        var isWin = data.result.winnerIds && data.result.winnerIds.indexOf(myId) !== -1;
        var myPlayer = data.players && data.players[myId];
        var role = myPlayer ? (myPlayer.role || 'farmer') : 'farmer';
        if (M3.SceneRecord && M3.SceneRecord.addRecord) {
          M3.SceneRecord.addRecord({ result: isWin ? 'win' : 'lose', role: role, delta: delta });
        }
      }
    }
    // 每次轮到我跟牌时都判断：手里没有任何能压过当前最新出牌的牌（含炸弹/火箭兜底），
    // 则常驻提示「你没有大过对家的牌」，直到离开我的回合才清除。
    (function () {
      var myId = M3.Game.getMyPlayerId && M3.Game.getMyPlayerId();
      var lastPlay = data.lastPlay;
      var needFollow = data.phase === 'playing' && data.currentPlayerId === myId &&
        lastPlay && lastPlay.playerId && lastPlay.playerId !== myId;
      if (!M3.SceneGame) return;
      if (!myId || !needFollow) {
        if (M3.SceneGame.clearRuleTip) M3.SceneGame.clearRuleTip(true);
        return;
      }
      if (M3.Game.hasBeatableForCurrent && !M3.Game.hasBeatableForCurrent()) {
        if (M3.SceneGame.showRuleTip) M3.SceneGame.showRuleTip('你没有大过对家的牌', true);
      } else if (M3.SceneGame.clearRuleTip) {
        M3.SceneGame.clearRuleTip(true);
      }
    })();
  });

  M3.Network.on('hand', function (data) {
    // 局内调试模式：忽略真实发牌推送
    if (M3.SceneGame && M3.SceneGame.isDebugMode && M3.SceneGame.isDebugMode()) return;
    M3.Game.setHand(data.cards || []);
    M3.Game.clearSelected();
  });

  // ---- 服务端提示结果（DouZero 或规则降级） ----
  M3.Network.on('hintResult', function (data) {
    if (M3.Game.applyHintResult) M3.Game.applyHintResult(data);
  });

  M3.Network.on('notice', function (data) {
    // 局内 notice 文字提示全部移除（如「xx 出了 xx 牌型」等），只保留动画：
    //   其中「他人 xx 不出」由 playerPassed 动画居中展示（见 scene-game.js）。
    // 大厅系统提示走各自的 M3.Game.flash 直接调用，不经过 notice，不受影响。
    if (data.action) M3.Render.enqueueAnimation(data);
    // 三带一：Spine 特效（服务端广播 playType，房间所有人可见；播完自动销毁）
    if (data.action === 'cardsPlayed' && data.playType === 'triple-single' &&
      M3.SpineFX && M3.SpineFX.playOnce) {
      M3.SpineFX.playOnce('sandaiyi', { x: 550, scale: 0.4 });
    }
    // 飞机（纯飞机 / 飞机带单 / 飞机带对）：Spine 特效（同上，所有人可见）
    if (data.action === 'cardsPlayed' &&
      (data.playType === 'airplane' || data.playType === 'airplane-singles' ||
        data.playType === 'airplane-pairs') &&
      M3.SpineFX && M3.SpineFX.playOnce) {
      M3.SpineFX.playOnce('feiji', { scale: 0.5 });
    }
    // 王炸（rocket）：Spine 特效（同上，所有人可见）
    if (data.action === 'cardsPlayed' && data.playType === 'rocket' &&
      M3.SpineFX && M3.SpineFX.playOnce) {
      M3.SpineFX.playOnce('wangzha', { scale: 0.7, y: 460 });
    }
    // 炸弹（bomb）：Spine 特效（素材含 '1' 爆炸 / 'idle' 待机两动画，默认播 '1'）
    if (data.action === 'cardsPlayed' && data.playType === 'bomb' &&
      M3.SpineFX && M3.SpineFX.playOnce) {
      M3.SpineFX.playOnce('zhadan', { anim: 'idle', scale: 1 });
    }
    // 春天 / 反春：结算倍数翻倍时播放（服务端 spring 分支广播，房间所有人可见）
    if (data.action === 'multiplierChanged' && (data.label === '春天' || data.label === '反春') &&
      M3.SpineFX && M3.SpineFX.playOnce) {
      M3.SpineFX.playOnce('spring', { scale: 0.5 });
      if (typeof KwaiMedia !== 'undefined') KwaiMedia.Audio.playSfx('subpackages/ingame/asset/spine/spring/spring.wav');
    }
  });

  M3.Network.on('error', function (data) {
    if (M3.Iap && M3.Iap.handleError && M3.Iap.handleError(data || {})) return;
    var msg = data && data.message ? data.message : '';
    // 回房恢复过程中 join 被拒（房间已解散/座位被回收等）：解除恢复保护并回大厅，避免卡死。
    if (M3.Game.isResuming && M3.Game.isResuming()) {
      if (M3.Game.clearResuming) M3.Game.clearResuming();
      if (M3.Game.goHome) M3.Game.goHome();
      M3.Game.flash(msg || '房间已结束');
      return;
    }
    // 结算页「房间不存在」：房间在结算期间被解散（人机房打满 3 局上限
    // bot_room_complete、或其余玩家已全部离开）。提示房间已解散，清理
    // 连接状态后自动重新匹配，无缝进入下一局。
    var inGame = M3.Game.getScreen && M3.Game.getScreen() === 'game';
    if (inGame && msg === '房间不存在') {
      var state = M3.Game.getState && M3.Game.getState();
      var inSettlement = state && state.phase === 'settlement';
      if (inSettlement) {
        M3.Network.send('leaveRoom');
        var roomType = (M3.Game.getRoomType && M3.Game.getRoomType()) || 'junior';
        if (M3.Matchmaking && M3.Matchmaking.start) {
          M3.Game.flash('房间已解散，正在重新匹配…');
          M3.Matchmaking.start({ roomType: roomType });
        } else {
          if (M3.Game.goHome) M3.Game.goHome();
        }
        return;
      }
    }
    // 局内出牌被服务端拒绝时：收回选中牌，并在手牌上方以规则提示条展示（figma 973:3766）。
    // 说明：「你没有大过对家的牌」只在【回合开始】即无任何可压牌时提示（见 state 回调），
    // 因此这里所有「已选牌被拒绝」的场景（含选了压不过的牌，但其实手里有更大的牌）
    // 一律归一化为「你选择的牌不符合规则」，不再复用「没有大过」文案。
    var isPlayReject = /规则|规范|不符合|大过|压|牌型|不能出|轮到|更大/.test(msg);
    if (inGame && isPlayReject && M3.SceneGame && M3.SceneGame.showRuleTip) {
      if (M3.Game.clearSelected) M3.Game.clearSelected();
      M3.SceneGame.showRuleTip('你选择的牌不符合规则');
      return;
    }
    M3.Game.flash(msg);
  });

  // 语音面板配置下发：两个 tab 的数据（互动语音 / 专属语音包）由服务端提供
  M3.Network.on('voiceConfig', function (data) {
    if (data && M3.SceneVoice && M3.SceneVoice.setConfig) M3.SceneVoice.setConfig(data);
  });

  M3.Network.on('entitlements', function (data) {
    if (M3.SceneVoice && M3.SceneVoice.applyEntitlements) M3.SceneVoice.applyEntitlements(data);
  });

  M3.Network.on('entitlementsUnavailable', function (data) {
    if (M3.SceneVoice && M3.SceneVoice.markEntitlementsUnavailable) M3.SceneVoice.markEntitlementsUnavailable(data);
    if (M3.Game && M3.Game.flash) M3.Game.flash('权益加载失败，请稍后重试');
  });

  M3.Network.on('purchaseResult', function (data) {
    if (M3.SceneVoice && M3.SceneVoice.applyPurchaseResult) M3.SceneVoice.applyPurchaseResult(data);
  });

  // 语音消息由服务端广播回声统一驱动，发送者与其他玩家行为一致。
  M3.Network.on('voiceMsg', function (data) {
    if (!data) return;
    var fromId = data.playerId || data.actorId || data.from;
    var text = data.text || '';
    var voiceUrl = data.voiceUrl || '';
    var audioKey = data.audioKey || '';
    if (fromId && (text || voiceUrl) && M3.SceneGame && M3.SceneGame.showVoiceBubble) {
      M3.SceneGame.showVoiceBubble(fromId, text, voiceUrl, audioKey);
    }
  });

  M3.Network.on('leftRoom', function () {
    // 局内/结算调试模式：忽略离房推送（调试退出由 debugHide 控制，避免被拉回大厅）
    if ((M3.SceneGame && M3.SceneGame.isDebugMode && M3.SceneGame.isDebugMode()) ||
        (M3.SceneSettlement && M3.SceneSettlement.isDebugMode && M3.SceneSettlement.isDebugMode())) return;
    // 匹配流程已接管（人机房打满局数被解散后自动重新匹配等场景）：
    // 服务端对本连接离房的确认回包不应把刚开始的匹配 cancel 回大厅。
    if (M3.Matchmaking && M3.Matchmaking.isMatching && M3.Matchmaking.isMatching()) return;
    // 已经在家了就不重复切换
    if (M3.Game.getScreen() !== 'home') {
      M3.Game.goHome();
    }
  });
  M3.Network.on('roomCreated', function (data) {
    M3.Game.goRoom(data.roomId, data.roomType || 'junior');
  });

  // ---- 初始化渲染器 ----
  M3.Render.init();

  // ---- 预加载公共按钮底图（全局常驻，不释放）----
  if (M3.UIButton && M3.UIButton.preload) M3.UIButton.preload();

  // ---- 检查分享进入时带的 roomId ----
  var sharedRoomId = M3.Game.checkLaunchQuery();
  if (sharedRoomId) {
    // 分享进入，先登录再自动加入房间
    M3.Game._pendingRoomId = sharedRoomId;
  }

  // ---- 启动主循环 ----
  // 启动来源（加桌奖励发放条件）：冷启动 getLaunchOptionsSync 读一次，
  // onShow 每次回前台更新（iOS addShortcut 无回调，按钮回调解发不可靠，
  // 改为按真实桌面启动来源发放；见 game.js setLaunchFrom / maybeClaimShortcut）
  if (typeof KwaiBase !== 'undefined') {
    try {
      var _launchOpts = KwaiBase.getLaunchOptions();
      if (M3.Game && M3.Game.setLaunchFrom) M3.Game.setLaunchFrom(_launchOpts && _launchOpts.from);
      KwaiBase.onShow(function (res) {
        if (M3.Game && M3.Game.setLaunchFrom) M3.Game.setLaunchFrom(res && res.from);
      });
    } catch (e) { console.warn('[Main] 启动来源读取失败', e); }
  }
  // 应用音频设置（音量/开关），确保第一帧就用对配置
  if (M3.SceneSettings && M3.SceneSettings.applyConfig) M3.SceneSettings.applyConfig();
  // 尝试立即播放 BGM（快手小游戏无 autoplay 限制，直接生效；H5 浏览器失败会被 catch 忽略，等待用户交互时 input.js 重试）
  if (typeof KwaiMedia !== 'undefined') KwaiMedia.Audio.playBgmList(['asset/audio/bgm/bgm_0.mp3']);
  // 分包预载：主包启动只下载 ~4.6MB，主页起来后后台预载子包，
  // 业务侧资源加载点已由 M3.Subpackage 门禁兜底（未就绪时自动等待）。
  // ingame（牌局图/BGM/特效 ~2.3MB）用户必玩，立即预载；
  // popup（弹窗/结算 ~4.1MB）低频，延迟 2.5s 避免抢占首启带宽。
  if (M3.Subpackage && M3.Subpackage.preload) {
    M3.Subpackage.preload('ingame');
    setTimeout(function () { M3.Subpackage.preload('popup'); }, 2500);
  }
  // URL ?scene=game：自动进入局内调试模式（免开局调试局内 UI）
  if (typeof location !== 'undefined' && /[?&]scene=game\b/.test(location.search) &&
    M3.SceneGame && M3.SceneGame.debugShow) {
    M3.SceneGame.debugShow();
  }
  requestAnimationFrame(loop);
})();
