/**
 * scenes/welcome.js — 欢迎页场景
 * 功能：
 *   - welcome-char 全屏背景 + title 大图
 *   - 「立即找茬」按钮 + 音乐开关 + 隐私政策
 *   - 版权小字
 *   - 可滚动隐私政策浮层
 * 依赖：Renderer, UIKit, TextureManager, CONFIG, M3, Audio, RemoteConfig, Telemetry
 */
(function () {
  'use strict';

  // 隐私政策全文（内嵌，实际项目可外置 JSON）
  var PRIVACY_TEXT = [
    '生效日期：2026年9月11日',
    '',
    '北京慕远科技有限公司及其关联公司（以下简称"我们"）深知个人信息对您的重要性，我们将按照法律法规的规定，保护您的个人信息及隐私安全。我们制定本《隐私政策》并特别提示：希望您在使用我们的小游戏前仔细阅读并理解本《隐私政策》，以便做出适当的选择。',
    '',
    '【特别提示】请您仔细阅读本《隐私政策》，尤其是加粗、划线的内容，以充分理解我们对您个人信息的处理规则。如您在阅读或使用小游戏过程中有任何疑问，可通过本隐私政策预留的联系方式与我们沟通。如您经沟通后仍不同意本隐私政策的条款，有权立即停止访问和使用。',
    '',
    '一、我们如何收集和使用您的个人信息',
    '',
    '1. 账号登录',
    '当您登录我们的小游戏时，我们将申请使用您的快手账号信息（包括快手昵称、头像及您授权的其他信息），以完成账号登录、标识您的游戏身份并展示游戏内个人信息。',
    '',
    '2. 支付服务',
    '当您在游戏内进行充值、购买服务或虚拟资产时，部分支付服务由我们的合作方及第三方支付机构向您提供，我们、我们的合作方及第三方支付机构可能会获取您的订单信息（如订单流水号、支付金额、优惠券信息、商品信息、银行信息等），这些信息是支付功能所必需的信息，拒绝提供将导致您无法使用该功能，但不影响其他功能的正常使用。',
    '',
    '3. 分享',
    '（1）我们支持您将游戏内容分享至快手聊天、朋友圈或外部平台。分享功能由您主动触发，我们不会未经您的操作自动分享您的信息。',
    '（2）我们在游戏中向您提供榜单功能，如游戏排行榜，在榜单中我们会对信息内容、用户等进行自动化排序展示，您的昵称、头像等账号公开信息、我们根据您在游戏内的行为情况形成统计数据等将在榜单中公开展示。',
    '',
    '4. 运营安全保障与统计分析',
    '（1）为了向用户提供优质而可靠的内容、服务，维护产品及功能的正常稳定运行，更好地预防恶意程序、钓鱼网站、网络漏洞、计算机病毒、网络攻击、网络侵入安全风险，更准确地识别违反法律法规或平台相关规则的情况，我们需收集、使用和整合终端用户的设备信息、操作日志信息、传感器信息以及用户授权的信息，用于分析服务的稳定性、判断账号安全、进行身份验证、识别违法违规情况、检测及防范安全事件，依法采取必要的记录、分析、处置措施。',
    '（2）设备信息：设备标识信息（OAID、IDFA、IDFV、AndroidID及其他综合设备参数和系统信息形成的设备标识符，不同的标识符在有效期、是否可由用户重置以及获取方式及不同系统方面会有所不同）、网络相关信息（蓝牙、IP地址、网络状态、类型、接入方式、网络质量数据）、设备参数信息（设备名称、设备型号）、硬件操作系统信息（操作系统、语言、分辨率）。',
    '（3）为了提升运营质量与效率而进行研究、统计分析时，我们可能会收集您在游戏中的游戏行为数据以及其他根据上述场景收集的个人信息，用于优化游戏体验和改进游戏功能。上述数据均为去标识化后的统计数据分析，我们不会将其用于识别您的特定身份。',
    '',
    '5. 征得同意的例外',
    '根据法律法规规定，在下列情形中，处理您的个人信息无需征得您的同意：',
    '（1）为订立、履行您作为一方当事人的合同所必需，或者按照依法制定的劳动规章制度和依法签订的集体合同实施人力资源管理所必需；',
    '（2）为履行法定职责或者法定义务所必需；',
    '（3）为应对突发公共卫生事件，或者紧急情况下为保护自然人的生命健康和财产安全所必需；',
    '（4）为公共利益实施新闻报道、舆论监督行为，在合理的范围内处理您的个人信息；',
    '（5）依照《个人信息保护法》规定在合理范围内处理您自行公开或者其他已经合法公开的个人信息；',
    '（6）法律行政法规规定的其他情形。',
    '',
    '二、我们如何委托处理、共享、转移、公开披露您的个人信息',
    '',
    '1. 委托处理',
    '为了向您提供更完善、更优质的产品和/或服务，某些功能可能由我们的技术服务合作方提供，我们可能会委托合作方处理您的某些个人信息。我们会与受托处理您个人信息的合作方依据法律规定签署相关协议，并对其个人信息处理活动进行约束和监督。',
    '',
    '2. 共享',
    '为实现本隐私政策中声明的目的，我们需与关联公司或第三方合作伙伴共享您的个人信息。我们将遵守合法、正当、必要的原则，审慎评估合作伙伴的处理目的、安全保障能力，并根据法律规定签署相关协议。同时，我们会对合作伙伴进行严格的监督与管理，一旦发现其存在违规违约行为，将立即停止合作并追究其法律责任。',
    '',
    '3. 合作场景',
    '（1）为实现本隐私政策中声明的目的，我们的某些服务将由我们和授权合作伙伴共同提供或者委托处理，如第三方支付机构、活动合作方等。我们可能会与合作伙伴共享您的某些个人信息，以提供更好的客户服务和用户体验。我们仅会出于合法、正当、必要的目的共享您的个人信息，并且只会提供服务所必要的个人信息。',
    '（2）在法定情形下的共享。我们可能会根据法律法规规定、诉讼争议解决需要，或按行政、司法机关依法提出的强制性要求，共享您的个人信息。',
    '（3）在获取您同意的情况下共享：获得您的同意后，我们可能与第三方共享您的个人信息；',
    '（4）为提升相关领域的科研能力，促进科技发展水平，我们在确保数据安全与目的正当的前提下，可能会与合作的科研院所、高校等机构使用去标识化或匿名化的数据。',
    '（5）为保障游戏功能的实现与应用的稳定运行，我们需与快手平台共享，并从快手平台处使用您快手账号内的相关信息（如基本账号信息、身份认证信息、设备信息、行为数据、支付交易数据等），以实现账号登录、广告、支付等对应功能及目的。关于快手平台如何收集、使用您的个人信息，您可以参考快手平台的服务协议及隐私政策。',
    '',
    '4. 转移',
    '如我们因合并、分立、解散、被宣告破产需要转移个人信息的，会向您告知接收方的名称或者姓名和联系方式。我们会要求接收方继续履行本隐私政策约定义务。接收方变更原先的处理目的、处理方式的，其将重新向您征求同意。',
    '',
    '5. 公开披露',
    '我们不会主动公开您未自行公开的信息，除非遵循国家法律法规规定或者获得您的同意。',
    '',
    '三、我们如何存储和保护您的个人信息',
    '',
    '1. 存储地点',
    '我们会按照法律法规的规定，将在中国境内运营过程中收集和产生的个人信息存储于中国境内。',
    '',
    '2. 存储期限',
    '我们仅在为实现目的所必需的时间及法律法规所规定的保存期限内保留您的个人信息，超出上述存储期限后，我们会对您的个人信息进行删除或匿名化处理。',
    '',
    '3. 安全保护措施',
    '我们已采取符合业界标准、合理可行的安全防护措施保护您的信息，防止个人信息遭到未经授权访问、公开披露、使用、修改、损坏或丢失，包括数据加密传输、访问权限控制、安全审计等。',
    '',
    '四、您的权利',
    '在您使用我们的游戏期间，您可以通过以下方式行使相关权利，我们会在符合法律法规要求的情形下响应您的请求。',
    '',
    '1. 查询与更正',
    '您可以在游戏内【我的】页面查看您的昵称、头像等账户信息。',
    '如您需要更正您的快手账号信息，您可以通过快手APP-左上角【≡】-【设置】以及APP-【我】更正您的快手昵称等账号信息。',
    '',
    '2. 删除',
    '您可以通过本政策公示的联系方式向我们提出删除您个人信息的请求。',
    '',
    '3. 撤回同意',
    '您可以通过快手APP设置页面关闭相应权限，即视为撤回对相应信息收集的同意。',
    '',
    '4. 注销账号',
    '您可以通过快手APP左上角【≡】-【设置】-【账号与安全】-【注销账号】注销您的快手账号，注销后我们将在合理期限内删除您的个人信息或进行匿名化处理；因适用的法律和安全技术限制必须留存的，我们将停止除存储和采取必要的安全保护措施之外的处理。',
    '请注意，当您撤回同意或删除信息后，我们可能无法继续为您提供相应的游戏功能和服务。',
    '',
    '五、未成年人保护',
    '我们非常重视对未成年人个人信息的保护。我们的游戏不面向未满14周岁的未成年人。如果您是未满14周岁的未成年人，请勿使用我们的游戏或向我们提供个人信息。',
    '如果我们发现在未获得监护人同意的情况下收集了未满14周岁未成年人的个人信息，我们将尽快删除相关信息。',
    '',
    '六、本政策的更新',
    '我们可能适时修订本政策。当政策条款发生变更时，我们会在游戏内或以其他适当方式向您展示变更后的政策。对于重大变更，我们会以更为显著的方式通知您。',
    '',
    '七、如何联系我们',
    '如果您对本政策有任何疑问、意见或建议，可以通过【ksxyxpt@kuaishou.com】与我们联系。',
    '我们将尽快审核所涉问题，并在验证您的身份后及时予以回复。一般情况下，我们将在十五个工作日内回复您的请求。'
  ].join('\n');

  var _privacyOpen   = false;
  var _privacyScrollY = 0;
  var _privacyMoveY  = 0;
  // 拖拽滚动状态：onDragStart 记录按下时 y 与当时滚动量，onDragMove 按差值换算
  var _privacyDragStartY = 0;
  var _privacyDragStartScroll = 0;

  // ── 开始按钮位置的加载条（在关键素材未加载完成前，用进度条占位替代按钮） ──
  var _assetsReady   = false;
  var _loadProgress  = 0;
  // 是否已经完整齐备过一次"关卡配置 + 封面图"：只在本局游戏进程里第一次进欢迎页
  // （真正冷启动）时才需要真的等这一段；一旦齐备过，说明 RemoteConfig 和启动目标
  // 资源早已经全部到位（否则按钮不可能出现过），后续每次重新进入欢迎页直接认为
  // 这一段已完成，避免后台预热共用同一并发队列时反复排队。
  var _configAssetsEverReady = false;
  var _remoteConfigReady = false;
  var _autoEnteredLevelList = false;
  var _startupRoute = null;
  // enter() 调用代数：配合下方兜底超时定时器，防止"旧一轮 enter() 的延迟回调"
  // 在场景被重新进入之后才触发，误把新一轮的加载状态强制置为完成。
  var _enterGen = 0;
  // 加载条兜底超时：任何单张素材（不管是本身没配好、CDN 抽风还是被外部工具误删/
  // 挪走）导致进度永远卡不满时，最多等这么久就强制放行按钮，不能让玩家彻底进不去游戏。
  var LOADING_FALLBACK_MS = 6000;

  // 欢迎页现在只承担 loading 和启动路由。普通用户进入关卡列表，冷启动新用户
  // 在第一关资源准备完成后直接进入第一关；两条路径都要求配置先完成。
  function _maybeEnterStartupRoute() {
    if (!_assetsReady || !_remoteConfigReady || !_startupRoute || _autoEnteredLevelList) return;
    _autoEnteredLevelList = true;
    if (_startupRoute.type === 'game' && _startupRoute.level) {
      Storage.set(CONFIG.STORAGE_KEYS.newUserFirstLevelDone, '1');
      Telemetry.firstLevelEnter();
      PlayController.pickLevel(_startupRoute.level.idx);
      return;
    }
    SceneManager.go('home');
  }

  SceneManager.register('welcome', {
    enter: function () {
      _privacyOpen   = false;
      _privacyScrollY = 0;
      _assetsReady   = false;
      _remoteConfigReady = false;
      _autoEnteredLevelList = false;
      _startupRoute = null;
      _loadProgress  = 0;
      var gen = ++_enterGen;

      var T = CONFIG.TEMPLATE.welcome;
      var showStartButton = T.showStartButton !== false;

      // ── 请求优先级 ───────────────────────────────────────────────────────
      // 素材数组的顺序即请求发起顺序（TextureManager 内部按 MAX_CONCURRENT=4
      // 的并发队列 FIFO 处理，排在前面的先拿到网络请求名额），因此这里按"用户
      // 能看到什么"的优先级排列，而不是随手写的顺序：
      //   1. mnvPageBg —— UIKit.drawFlowingBackground 用的流动背景，欢迎页/
      //      首页/游戏页三处都靠它打底，最先到位能避免整个加载期间背景都是
      //      纯色兜底（#4A3B6B）。2026-09-11 换图后已把暗纹烘焙进底图本身，
      //      不再需要 mnvBgPuzzle 单独占一个加载名额（见 ui-kit.js 停用说明）。
      //   2. logo —— 欢迎页视觉主体，其次到位能让首帧尽快出现完整品牌视觉。
      //   3. mnvLoadingBarTrack —— 加载条自己的底图，再其次到位能让加载条尽快
      //      从"素材未就绪的描边胶囊兜底"切换成正式视觉。
      //   4. globalBg —— 保留加载（避免误删导致某处未来引用它时报错/白屏），
      //      但目前全工程没有任何 draw 代码实际绘制它，优先级降到最后。
      var criticalAssets = [
        CONFIG.uiAsset('mnvPageBg')
      ];
      if (T.logoAsset) {
        criticalAssets.push(CONFIG.uiAsset(T.logoAsset));
      }
      criticalAssets.push(CONFIG.uiAsset('mnvLoadingBarTrack'));
      if (showStartButton && T.startButtonAsset) {
        criticalAssets.push(CONFIG.uiAsset(T.startButtonAsset));
      }
      if (T.showSigninButton && T.signinButtonAsset) {
        criticalAssets.push(CONFIG.uiAsset(T.signinButtonAsset));
      }
      if (T.showDesktopButton && T.desktopButtonAsset) {
        criticalAssets.push(CONFIG.uiAsset(T.desktopButtonAsset));
      }
      criticalAssets.push(CONFIG.uiAsset('globalBg'));

      // 去重（多个来源可能引用同一张图，如 mnvPageBg/mnvBgPuzzle），避免同一个
      // src 被计入多次 uiTotal，导致加载条进度权重被不必要地拉长。
      var _seenCritical = {};
      criticalAssets = criticalAssets.filter(function (src) {
        if (!src) return false;
        if (_seenCritical[src]) return false;
        _seenCritical[src] = true;
        return true;
      });

      // ── 加载条改为两段加权进度：UI 关键图 + 启动目标资源。
      //    启动目标由 RemoteConfig 到手后决定：普通用户等待 home UI/主题封面，
      //    冷启动用户等待 game UI/第一关资源，避免进入下一页后才临时拉首屏图片。
      var UI_WEIGHT = 0.5;
      var uiTotal = 0;
      var uiDone  = 0;
      var uiProgress = 1;
      var _seenUiSrcs = {};

      // configTotal 先占 1 份给"拉取关卡配置"本身，配置到手后再按封面图张数动态扩容；
      // 若本局进程已经齐备过一次，直接把这 1 份当成已完成，不再等待。
      var configTotal = 1;
      var configDone  = _configAssetsEverReady ? 1 : 0;

      function _recalc() {
        var configProgress = configDone / configTotal;
        var p = uiProgress * UI_WEIGHT + configProgress * (1 - UI_WEIGHT);
        _loadProgress = Math.min(100, Math.round(p * 100));
        if (uiProgress >= 1 && configDone >= configTotal) {
          _assetsReady = true;
          _configAssetsEverReady = true;
        }
        _maybeEnterStartupRoute();
      }

      function _onUiAssetSettled() {
        uiDone++;
        uiProgress = uiDone / uiTotal;
        _recalc();
      }

      function _onConfigItemSettled() {
        configDone++;
        _recalc();
      }

      function _loadUiAssets(srcs) {
        var newSrcs = (srcs || []).filter(function (src) {
          if (!src || _seenUiSrcs[src]) return false;
          _seenUiSrcs[src] = true;
          return true;
        });
        uiTotal += newSrcs.length;
        uiProgress = uiTotal === 0 ? 1 : uiDone / uiTotal;
        newSrcs.forEach(function (src) {
          TextureManager.load(src).then(_onUiAssetSettled, _onUiAssetSettled);
        });
        _recalc();
      }

      _loadUiAssets(criticalAssets);

      // 统一预热关卡列表和关卡内的通用 BGM；随后继续播放列表音乐。
      // 冷启动用户进入第一关时可直接复用 in_level，普通用户进入 home 时
      // 可直接复用 select_level。
      if (window.Audio && Audio.preloadCommonBgms) {
        Audio.preloadCommonBgms();
      }
      Audio.startBgmTrack('select_level');

      Telemetry.welcomeShown();
      Analytics.trackScreen('welcome');

      RemoteConfig.load(function (err) {
        _remoteConfigReady = true;
        if (err) {
          console.warn('[Welcome] remote config load failed:', err);
          _startupRoute = { type: 'home' };
          if (!_configAssetsEverReady) _onConfigItemSettled(); // 配置拉取失败也算"完成"这一步，避免卡住加载条/按钮永不出现
          _maybeEnterStartupRoute();
          return;
        }

        var coldStartEnabled = !!(CONFIG.TEMPLATE.welcome &&
          CONFIG.TEMPLATE.welcome.coldStartToFirstLevel);
        var isNewUser = !Storage.get(CONFIG.STORAGE_KEYS.newUserFirstLevelDone);
        var firstLevel = coldStartEnabled && isNewUser ? _getColdStartLevel() : null;
        var isColdStart = !!firstLevel;
        _startupRoute = isColdStart
          ? { type: 'game', level: firstLevel }
          : { type: 'home' };

        var routeUiAssets = [];
        if (isColdStart) {
          if (window.PlayController && PlayController._collectGameUiSrcs) {
            routeUiAssets = PlayController._collectGameUiSrcs();
          } else if (window.GameSceneAssets && GameSceneAssets.criticalAssetSrcs) {
            routeUiAssets = GameSceneAssets.criticalAssetSrcs();
          }
        } else if (window.HomeAssets && HomeAssets.criticalAssetSrcs) {
          routeUiAssets = HomeAssets.criticalAssetSrcs();
        }
        _loadUiAssets(routeUiAssets);

        var covers = [];
        (RemoteConfig.themes || []).forEach(function (t) {
          var coverSrc = RemoteConfig.getThemeCoverSrc(t);
          if (coverSrc) covers.push(coverSrc);
        });

        var targetSrcs = isColdStart && PlayController._collectLevelSrcs
          ? PlayController._collectLevelSrcs(firstLevel)
          : covers;

        if (_configAssetsEverReady) {
          // 已经齐备过一次，加载条不再等待目标资源；这里只做后台补热。
          targetSrcs.forEach(function (src) {
            TextureManager.load(src).catch(function () {});
          });
        } else {
          // 普通用户等待主题封面；冷启动用户等待第一关所有玩法资源。
          // TextureManager 内部按 src 去重，后续 home/play 再次调用不会重复下载。
          configTotal += targetSrcs.length;
          _onConfigItemSettled(); // "拉取配置"这一步本身完成
          if (targetSrcs.length > 0) {
            targetSrcs.forEach(function (src) {
              TextureManager.load(src).then(_onConfigItemSettled, _onConfigItemSettled);
            });
          }
        }

        // 目标之外的关卡交给 home 按当前可见主题逐步预热，避免欢迎页一次性把
        // 所有主题资源都排进 TextureManager 队列，影响启动目标和首页首屏。
      });

      // 兜底：不管是素材本身没配好、CDN 抽风还是被别处误删/挪走导致某张图
      // 永远 settle 不了，最多等 LOADING_FALLBACK_MS 就强制放行按钮，避免玩家
      // 彻底卡在加载页进不去游戏。gen 校验防止这个旧的延迟回调在场景被重新
      // 进入之后才触发，误把新一轮的加载状态强制置为完成。
      setTimeout(function () {
        if (gen !== _enterGen || _assetsReady) return;
        console.warn('[Welcome] 加载超时兜底，强制放行（' + LOADING_FALLBACK_MS + 'ms 内资源未全部就绪）');
        _assetsReady = true;
        _configAssetsEverReady = true;
        _loadProgress = 100;
        if (!_startupRoute) _startupRoute = { type: 'home' };
        _maybeEnterStartupRoute();
      }, LOADING_FALLBACK_MS);
    },

    exit: function () {
      Analytics.leaveScreen('welcome');
    },

    draw: function () {
      var W = M3.Layout.w, H = M3.Layout.h;
      var areas = [];
      var t = M3._now() / 1000;
      var T = CONFIG.TEMPLATE.welcome;

      UIKit.drawFlowingBackground(W, H);

      if (T.logoAsset) {
        var logoSrc = CONFIG.uiAsset(T.logoAsset);
        var logoEntry = logoSrc ? TextureManager.get(logoSrc) : null;
        if (logoEntry) {
          var logoW = W * 0.80;
          var logoH = logoW * (logoEntry.img ? logoEntry.img.height / logoEntry.img.width : 89 / 300);
          Renderer.drawImage(logoSrc, (W - logoW) / 2, H * 0.30, logoW, logoH);
        }
        // logo 图未加载完成前不画任何占位文字（曾用 CONFIG.GAME_TITLE 兜底，但那是
        // 旧产品遗留文案，与当前 logo 图内容不一致，会在加载瞬间闪现错误标题）。
        // logo 现已改本地加载（见 product.config.js gameLogo），首帧就能就位，
        // 空白间隙极短，不需要兜底文字。
      } else {
        var TITLE_RATIO = 428 / 124;
        var titleEntry = TextureManager.get(CONFIG.uiAsset('title'));
        var tw, th;
        if (titleEntry) {
          tw = W * 0.88;
          th = tw / TITLE_RATIO;
          Renderer.drawImage(CONFIG.uiAsset('title'), (W - tw) / 2, H * 0.12, tw, th);
        }
        // 同上，title 图未加载完成前不画占位文字
      }

      var breath = 1 + Math.sin(t * 3) * 0.05;
      var baseBtnW = W * 0.65, baseBtnH = 73;
      var showStartButton = T.showStartButton !== false;
      // 按钮图片实际宽高比约束高度，避免不同屏幕比例下宽高比变形
      var _startSrc = showStartButton && T.startButtonAsset ? CONFIG.uiAsset(T.startButtonAsset) : null;
      var _startEntry = _startSrc ? TextureManager.get(_startSrc) : null;
      if (_startEntry && _startEntry.img && _startEntry.img.width > 0) {
        baseBtnH = baseBtnW * (_startEntry.img.height / _startEntry.img.width);
      }
      var btnX0 = (W - baseBtnW) / 2, btnY0 = H * 0.55;

      if (!showStartButton) {
        // 当前模板的 welcome 只承担 loading 和自动启动路由，不注册任何开始按钮热区。
        if (!_assetsReady) this._drawLoadingBar(btnX0, btnY0, baseBtnW, baseBtnH);
      } else if (!_assetsReady) {
        this._drawLoadingBar(btnX0, btnY0, baseBtnW, baseBtnH);
      } else if (T.startButtonAsset) {
        var startSrc = CONFIG.uiAsset(T.startButtonAsset);
        var startEntry = startSrc ? TextureManager.get(startSrc) : null;
        if (startEntry) {
          var btnW2 = baseBtnW * breath, btnH2 = baseBtnH * breath;
          var btnCx2 = btnX0 + baseBtnW / 2, btnCy2 = btnY0 + baseBtnH / 2;
          var btnX2 = btnCx2 - btnW2 / 2, btnY2 = btnCy2 - btnH2 / 2;
          Renderer.drawImage(startSrc, btnX2, btnY2, btnW2, btnH2);
          areas.push({
            x: btnX2, y: btnY2, w: btnW2, h: btnH2, priority: 200, label: 'btn-enter',
            onTap: _handleStartTap
          });
        } else {
          _drawDefaultStartButton(areas, t, W, H, btnX0, btnY0, baseBtnW, baseBtnH, breath);
        }
      } else {
        _drawDefaultStartButton(areas, t, W, H, btnX0, btnY0, baseBtnW, baseBtnH, breath);
      }

      if (showStartButton && _assetsReady && !T.startButtonAsset) {
        var floatY = Math.sin(t * 4) * 5;
        var handSize = 62;
        var ringX = btnX0 + baseBtnW * 0.80;
        var ringY = btnY0 + baseBtnH / 2 + floatY;
        var ring = 0.5 + 0.5 * Math.sin(t * 4);
        Renderer.drawCircle(ringX, ringY, 13 + ring * 19, {
          stroke: 'rgba(168,240,163,' + (0.55 * (1 - ring)).toFixed(2) + ')', strokeW: 2.5
        });
        var handEntry = TextureManager.get(CONFIG.uiAsset('tapHand'));
        if (handEntry) {
          var hcx = ringX + handSize * 0.25;
          var hcy = ringY + handSize * 0.34;
          Renderer.drawImage(CONFIG.uiAsset('tapHand'), hcx - handSize / 2, hcy - handSize / 2, handSize, handSize);
        } else {
          Renderer.drawCircle(ringX, ringY, 8, { fill: '#a8f0a3' });
        }
      }

      // 左上角设置按钮（圆形齿轮图标，仅图标不带文案）
      var setSize = 56;
      var setX = 16;
      var setY = M3.Layout.safeTop + 16;
      var setSrc = CONFIG.uiAsset('mnvBtnSetting');
      var setEntry = setSrc ? TextureManager.get(setSrc) : null;
      if (setEntry) {
        Renderer.drawImage(setSrc, setX, setY, setSize, setSize);
      } else {
        Renderer.drawCircle(setX + setSize / 2, setY + setSize / 2, setSize / 2, { fill: 'rgba(60,50,140,0.85)' });
        Renderer.drawText('⚙', setX + setSize / 2, setY + setSize / 2 - 11, {
          fontSize: 20, color: '#ffffff', align: 'center', bold: true
        });
      }
      areas.push({
        x: setX, y: setY, w: setSize, h: setSize,
        priority: 200, label: 'welcome-settings',
        onTap: function () {
          Audio.playUiClick();
          Telemetry.openSettings();
          SceneManager.open('settings-overlay', { from: 'welcome' });
        }
      });

      // _assetsReady 前不展示"添加桌面"按钮，也不画占位方块：加载阶段这个按钮
      // 素材本来就还没到位，硬画一个半透明圆角占位方块会让加载页显得很突兀；
      // 等加载条走完、素材真正就绪后再让它正常出现即可。
      if (_assetsReady && T.showDesktopButton && T.desktopButtonAsset && !Storage.get(CONFIG.STORAGE_KEYS.shortcutInstalled)) {
        var dtSrc = CONFIG.uiAsset(T.desktopButtonAsset);
        var dtEntry = dtSrc ? TextureManager.get(dtSrc) : null;
        var dtSize = 90;
        var dtX = W - dtSize - 20, dtY = H - dtSize - 30;
        if (dtEntry) {
          Renderer.drawImage(dtSrc, dtX, dtY, dtSize, dtSize);
        } else {
          Renderer.drawRoundRect(dtX, dtY, dtSize, dtSize, 18, {
            fill: 'rgba(255,255,255,0.15)', stroke: 'rgba(255,255,255,0.4)', strokeW: 1.5
          });
        }
        areas.push({
          x: dtX, y: dtY, w: dtSize, h: dtSize, priority: 220, label: 'btn-add-desktop',
          onTap: function () {
            Audio.playUiClick();
            Telemetry.buttonClick('add_desktop', { from: 'welcome' });
            if (typeof ks !== 'undefined' && ks.showShortcutMenu) {
              ks.showShortcutMenu();
            } else if (typeof KwaiShortcut !== 'undefined') {
              KwaiShortcut.add({
                onSuccess: function () {
                  Storage.set(CONFIG.STORAGE_KEYS.shortcutInstalled, '1');
                  UIKit.toast('🏠 已添加到桌面！');
                },
                onFail: function () {}
              });
            }
          }
        });
      }

      var footerY = btnY0 + baseBtnH + 26;
      areas.push({
        x: (W - 140) / 2, y: footerY - 2, w: 140, h: 18,
        priority: 210, label: 'privacy',
        onTap: function () { Audio.playUiClick(); _privacyOpen = true; }
      });
      Renderer.drawText('点击按钮代表您已同意《隐私政策》', W/2, footerY, {
        fontSize: 11, color: 'rgba(255,255,255,0.75)', align: 'center'
      });
      Renderer.drawText('著作权人：' + CONFIG.COPYRIGHT_OWNER, W/2, footerY + 20, {
        fontSize: 10, color: 'rgba(255,255,255,0.55)', align: 'center'
      });

      Renderer.drawText(CONFIG.BUILD_VER, 8, H - 12, {
        fontSize: 9, color: 'rgba(255,255,255,0.25)', align: 'left'
      });

      if (_privacyOpen) {
        areas = areas.concat(this._drawPrivacy(W, H));
      }

      areas.push({ x: 0, y: 0, w: W, h: H, priority: 0, label: 'blank-tap', onTap: function () { Audio.playUiClick(); } });

      InputManager.addAll(areas);
    },

    /**
     * 开始按钮位置的加载条：占据「立即找茬」按钮的区域，底图用 mnvLoadingBarTrack
     * 素材图（深色胶囊+紫色描边，930x66），素材尚未就绪时兜底画一条浅色描边胶囊轨道，
     * 避免首帧空白；绿色填充条用 drawRoundRect 画成两端圆角的胶囊，天然带圆头，
     * 无需额外素材。
     */
    _drawLoadingBar: function (areaX, areaY, areaW, areaH) {
      // 参考视觉稿把加载条整体放大（含内部绿色填充条，两者按同一 barW 等比算出，
      // 天然一起放大），并把文字与轨道的间距拉开，不再贴得太近。
      var barW = areaW * 1.05;
      var barH = 26; // 素材未就绪时的兜底高度

      var trackSrc = CONFIG.uiAsset('mnvLoadingBarTrack');
      var trackEntry = trackSrc ? TextureManager.get(trackSrc) : null;
      if (trackEntry && trackEntry.img && trackEntry.img.width) {
        // 素材宽高比 930:66，按 barW 等比算出实际高度，让填充条严格贴合底图边界
        barH = barW * (trackEntry.img.height / trackEntry.img.width);
      }
      var x = areaX + (areaW - barW) / 2;
      var y = areaY + (areaH - barH) / 2;

      if (trackEntry) {
        Renderer.drawImage(trackSrc, x, y, barW, barH);
      } else {
        Renderer.drawRoundRect(x, y, barW, barH, barH / 2, {
          stroke: 'rgba(255,255,255,0.8)', strokeW: 2
        });
      }

      var pad = Math.max(2, barH * 0.18);
      var fillH = barH - pad * 2;
      var fillMaxW = barW - pad * 2;
      var fillW = fillMaxW * (_loadProgress / 100);
      if (fillW > 0) {
        fillW = Math.max(fillH, fillW);
        Renderer.drawRoundRect(x + pad, y + pad, fillW, fillH, fillH / 2, {
          fill: '#4cd964'
        });
      }

      Renderer.drawText('游戏正在加载中，请稍后... ' + _loadProgress + '%', areaX + areaW / 2, y - 34, {
        fontSize: 13, color: '#ffffff', align: 'center', bold: true,
        strokeColor: '#141056', strokeWidth: 3
      });
    },

    _drawPrivacy: function (W, H) {
      var areas = [];
      var dragAreas = [];
      // 遮罩
      Renderer.drawRect(0, 0, W, H, 'rgba(0,0,0,0.7)');

      // 卡片
      var cw = W - 40, ch = H * 0.7;
      var cx = 20, cy = (H - ch) / 2;
      Renderer.drawRoundRect(cx, cy, cw, ch, 16, {
        fill: '#f8f4ee', stroke: '#ccbbaa', strokeW: 2
      });

      // 标题
      Renderer.drawText('用户隐私政策', cx + cw/2, cy + 20, {
        fontSize: 16, color: '#334', align: 'center'
      });

      // ── 可滚动文字区 ──────────────────────────────────────────────────────
      // 隐私政策全文较长（100+ 行），无法在一屏内完整展示，这里实现"视口内逐行
      // 绘制 + 拖拽滚动"：先按与 TextRenderer.getTexture 内部一致的参数（物理
      // 像素 fontSize*dpr / maxWidth*dpr）把全文折成行，再只绘制落在视口内的
      // 行——无 GL 裁剪的情况下按行级过滤即可模拟遮挡，滚动量由拖拽热区维护。
      var fontSize = 12;
      var lineH   = Math.ceil(fontSize * 1.4);
      var textX   = cx + 20;
      var textW   = cw - 40;
      var viewTop = cy + 52;
      var viewH   = ch - 100;

      var dpr = (typeof GLContext !== 'undefined' && GLContext.dpr) || 1;
      var lines = (window.TextRenderer && TextRenderer.wrapLines)
        ? TextRenderer.wrapLines(PRIVACY_TEXT, fontSize * dpr, textW * dpr, 9999)
        : PRIVACY_TEXT.split('\n');

      var totalH    = lines.length * lineH;
      var maxScroll = Math.max(0, totalH - viewH);
      if (_privacyScrollY < 0) _privacyScrollY = 0;
      if (_privacyScrollY > maxScroll) _privacyScrollY = maxScroll;

      for (var i = 0; i < lines.length; i++) {
        var ly = viewTop + i * lineH - _privacyScrollY;
        if (ly > viewTop + viewH - lineH) break;   // 已滚出视口下缘，后面的行更靠下，直接结束
        if (ly < viewTop - lineH) continue;        // 已滚出视口上缘的旧行
        if (!lines[i]) continue;                   // 空行（段落间距）无纹理可画
        Renderer.drawText(lines[i], textX, ly, {
          fontSize: fontSize, color: '#445', align: 'left'
        });
      }

      // 可滚动时在卡片右缘画一条滚动条，提示当前阅读位置
      if (maxScroll > 0) {
        var trackX = cx + cw - 10, trackTop = viewTop + 4, trackH = viewH - 8;
        var thumbH = Math.max(30, trackH * viewH / totalH);
        var thumbY = trackTop + (trackH - thumbH) * (_privacyScrollY / maxScroll);
        Renderer.drawRoundRect(trackX - 2, trackTop, 4, trackH, 2, {
          fill: 'rgba(0,0,0,0.12)'
        });
        Renderer.drawRoundRect(trackX - 2, thumbY, 4, thumbH, 2, {
          fill: 'rgba(60,60,90,0.45)'
        });
      }

      // 关闭 / 同意
      areas.push(UIKit.drawButton(cx + (cw - 160) / 2, cy + ch - 52, 160, 40, '我已阅读，同意', {
        bgColor: '#1155aa', textColor: '#fff', fontSize: 14, radius: 20
      }, function () {
        _privacyOpen = false;
        // H5 privacy agree 逻辑（快手平台另有原生弹窗）
      }, 9999));

      // 文字视口的拖拽热区：按下记录起始位置，移动换算为滚动量（手指上滑 =
      // 内容上移，即 scrollY 增大）。拖拽热区在 input.js 的 handleStart 中先于
      // tap 分发，但只覆盖视口（不含下方「同意」按钮区域），不会误吞按钮点击。
      dragAreas.push({
        x: cx, y: viewTop, w: cw, h: viewH,
        priority: 9997, label: 'privacy-scroll',
        onDragStart: function (sx, sy) {
          _privacyDragStartY = sy;
          _privacyDragStartScroll = _privacyScrollY;
        },
        onDragMove: function (mx, my) {
          _privacyScrollY = Math.max(0, Math.min(
            maxScroll,
            _privacyDragStartScroll - (my - _privacyDragStartY)
          ));
        },
        onDragEnd: function () {}
      });
      InputManager.addDragAll(dragAreas);

      // 全屏吸收
      areas.push({ x: 0, y: 0, w: W, h: H, priority: 9998, label: 'privacy-absorber', onTap: function () {} });

      return areas;
    }
  });

  /**
   * 冷启动新用户点「立即找茬」会直接进入哪一关：取 RemoteConfig.themes[0]
   * （第一个主题）下的第一关。抽成独立函数供 _handleStartTap（实际跳转）和
   * enter() 里的加载条阻塞逻辑（提前把这一关素材加载完）共用同一份判定，
   * 避免两处各写一份、后续改主题顺序时只改了一处导致行为不一致。
   * @returns {Object|null} 关卡对象，主题/关卡数据尚未就绪时返回 null
   */
  function _getColdStartLevel() {
    var firstTheme = (RemoteConfig.themes || [])[0];
    if (!firstTheme) return null;
    var levels = RemoteConfig.getLevelsByTheme(firstTheme.id);
    return (levels && levels[0]) || null;
  }

  /**
   * 「立即找茬」按钮点击统一入口：
   * 当 CONFIG.TEMPLATE.welcome.coldStartToFirstLevel 为 true 且本地从未标记过
   * newUserFirstLevelDone 时，新用户直接跳过首页选主题，进入 _getColdStartLevel()
   * 算出的第一关；配置为 false 或老用户/数据异常兜底时，仍走原有「进首页」路径。
   * 该判定只在本次点击生效一次：无论是否成功跳关，都会立即标记为已用过，避免
   * 配置异常导致反复回退首页时又被重复判定为新用户。
   */
  function _handleStartTap() {
    Audio.playUiClick();
    Telemetry.buttonClick('btn_enter', { from: 'welcome' });

    var coldStartEnabled = !!(CONFIG.TEMPLATE.welcome &&
      CONFIG.TEMPLATE.welcome.coldStartToFirstLevel);

    if (coldStartEnabled) {
      var isNewUser = !Storage.get(CONFIG.STORAGE_KEYS.newUserFirstLevelDone);
      if (isNewUser) {
        Storage.set(CONFIG.STORAGE_KEYS.newUserFirstLevelDone, '1');

        var firstLevel = _getColdStartLevel();
        if (firstLevel) {
          Telemetry.firstLevelEnter();
          PlayController.pickLevel(firstLevel.idx);
          return;
        }
      }
    }

    SceneManager.go('home');
  }

  function _drawDefaultStartButton(areas, t, W, H, btnX0, btnY0, baseBtnW, baseBtnH, breath) {
    var btnW = baseBtnW * breath, btnH = baseBtnH * breath;
    var btnCx = btnX0 + baseBtnW / 2, btnCy = btnY0 + baseBtnH / 2;
    var btnX = btnCx - btnW / 2, btnY = btnCy - btnH / 2;
    var btnR = Math.min(btnH / 2, 14 * breath);

    Renderer.drawRoundRect(btnX + 1, btnY + 5, btnW, btnH, btnR, { fill: 'rgba(0,70,0,0.38)' });
    Renderer.drawRoundRect(btnX, btnY, btnW, btnH, btnR, { fill: '#1a5000' });
    var innerX = btnX + 3, innerY = btnY + 3, innerW = btnW - 6, innerH = btnH - 6;
    Renderer.drawRoundRect(innerX, innerY, innerW, innerH, Math.max(0, btnR - 1), { fill: '#96e968' });
    Renderer.drawRoundRect(btnX, btnY, btnW, btnH, btnR, { stroke: '#1a5c00', strokeW: 2.5 });

    Renderer.drawText('立即找茬', btnCx, btnCy - (22 * breath * 1.4) / 2, {
      fontSize: 22 * breath, color: '#ffffff', align: 'center',
      strokeColor: '#003008', strokeWidth: 4 * breath, bold: true
    });
    areas.push({
      x: btnX, y: btnY, w: btnW, h: btnH, priority: 200, label: 'btn-enter',
      onTap: _handleStartTap
    });
  }
})();
