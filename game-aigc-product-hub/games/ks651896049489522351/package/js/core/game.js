(function () {
  var M3 = window.M3 = window.M3 || {};

  // ---- 游戏状态机 ----
  var _screen = 'home';    // home | room | game（去掉 login 屏，直接进大厅）
  var _user = null;          // { openId, nickname, avatarUrl }
  // 加桌奖励桌面启动来源白名单（详见 M3.Game.setLaunchFrom）
  var _launchFrom = '';
  var _DESK_FROMS = ['retention_desk_ios', 'retention_apk', 'shortcut_app'];
  var _roomId = '';
  var _myPlayerId = null;
  var _state = null;         // server state
  var _myHand = [];
  var _selectedCardIds = {};
  var _hintCycleKey = '';
  var _hintCycleIndex = 0;
  var _hintPending = false;       // 等待服务端 hintResult 响应中
  var _hintFallbackTimer = 0;     // hintResult 超时降级定时器
  var _flashMsg = '';
  var _flashTimer = 0;
  var _showRoomInput = false;
  var _roomInputText = '';
  var _loginLoading = false;
  var _cachedChecked = false;
  var _serverOffset = 0;
  var _wallet = null;
  var _walletReady = false;
  var _walletSyncing = false;
  var _walletError = '';
  var _walletSyncTimer = 0;
  var _walletMeta = null;
  var _economy = null;
  // 看广告领豆：等待服务端确认的 transId（断线重连后重发，幂等）
  var _pendingAdTransId = '';
  var _pendingGoHome = false;
  var _resuming = false;   // 冷启动自动回房恢复中：期间屏蔽 goHome/enterHomeNow，避免被登录/钱包回调打断
  var _roomType = 'junior';
  var USER_CACHE_KEY = 'dou_di_zhu_user';
  var GUEST_CACHE_KEY = 'dou_di_zhu_guest_identity';
  var USER_CACHE_VERSION = 2;

  function readStorageJson (key) {
    try {
      var value;
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.getSync) {
        value = KwaiStorage.getSync(key);
      } else if (typeof localStorage !== 'undefined') {
        value = localStorage.getItem(key);
      }
      if (!value) return null;
      if (typeof value === 'object') return value;
      try { return JSON.parse(value); } catch (e) { return null; }
    } catch (e2) { return null; }
  }

  function writeStorageJson (key, value) {
    try {
      var raw = JSON.stringify(value);
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.setSync) {
        KwaiStorage.setSync(key, value);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, raw);
      }
    } catch (e) {}
  }

  function removeStorage (key) {
    try {
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.removeSync) KwaiStorage.removeSync(key);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch (e) {}
  }

  function randomToken () {
    return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  // 本地游客档案：只保存**昵称/头像**等展示信息，绝不含 accountId。
  //
  // 历史实现在这里生成 'guest_h5_' + 时间戳 作为 accountId 并随每条消息上报，
  // 服务端直接采信，导致改一下 localStorage 就能接管他人钱包。
  // 现在身份统一由服务端 auth 回包下发（见 js/auth.js），
  // 客户端只负责设备标识 deviceId，accountId 永远来自服务端。
  function getOrCreateGuestProfile (forceNew) {
    var guest = !forceNew ? readStorageJson(GUEST_CACHE_KEY) : null;
    if (!guest || !guest.nickname) {
      guest = {
        version: USER_CACHE_VERSION,
        nickname: '游客' + Math.floor(1000 + Math.random() * 9000),
        avatarUrl: '',
        createdAt: Date.now(),
      };
      writeStorageJson(GUEST_CACHE_KEY, guest);
    }
    return {
      version: USER_CACHE_VERSION,
      accountId: serverAccountId(),
      nickname: guest.nickname,
      avatarUrl: guest.avatarUrl || '',
      loginType: serverLoginType() || 'guest',
      createdAt: guest.createdAt || Date.now(),
      lastLoginAt: Date.now(),
    };
  }

  // accountId / loginType 的唯一可信来源：服务端 authOk 回包
  function serverAccountId () {
    var identity = M3.Auth && M3.Auth.getIdentity ? M3.Auth.getIdentity() : null;
    return identity ? (identity.accountId || '') : '';
  }

  function serverLoginType () {
    var identity = M3.Auth && M3.Auth.getIdentity ? M3.Auth.getIdentity() : null;
    return identity ? (identity.loginType || '') : '';
  }

  // 规范化用户展示信息。
  // 注意：accountId / openId **不再**由此函数编造或从 openId 推导，
  // 一律以服务端 auth 结果为准，这里只做昵称/头像的清洗。
  function normalizeUser (user, allowGuest) {
    if (!user) return null;
    var nickname = String(user.nickname || user.nickName || user.userName || '').trim().slice(0, 12);
    var accountId = serverAccountId();
    var loginType = serverLoginType() || user.loginType || '';
    if (!nickname && !allowGuest) return null;
    if (!nickname || nickname === 'Guest' || nickname === '快手玩家') {
      nickname = getOrCreateGuestProfile(false).nickname;
    }
    return {
      version: USER_CACHE_VERSION,
      accountId: accountId,
      nickname: nickname || '玩家' + Math.floor(1000 + Math.random() * 9000),
      avatarUrl: user.avatarUrl || user.userHead || '',
      loginType: loginType,
      createdAt: user.createdAt || Date.now(),
      lastLoginAt: Date.now(),
    };
  }

  // 发往服务端的用户信息。
  //
  // 【安全约束】只允许携带展示类字段（昵称、头像）。
  // 历史实现会带上 accountId / openId / loginType，服务端直接采信，
  // 任何人手改一行 JS 就能顶替他人账号。现在服务端已在 validateMessage 里
  // 强制删除这些字段，客户端也同步不再发送，双向对齐避免误以为还生效。
  function userPayload () {
    var user = normalizeUser(_user, true) || getOrCreateGuestProfile(false);
    _user = user;
    return {
      nickname: user.nickname || '玩家',
      avatarUrl: user.avatarUrl || '',
    };
  }

  // 尝试从本地缓存恢复用户信息（同步读取）
  function tryRestoreCachedUser () {
    if (_cachedChecked) return;
    _cachedChecked = true;
    try {
      var cached = readStorageJson(USER_CACHE_KEY);
      var normalized = normalizeUser(cached, false);
      if (normalized && normalized.nickname && normalized.nickname !== '快手玩家') {
        _user = normalized;
        cacheUser();
        _loginLoading = true;
        // 已在首页，直接同步钱包
        setTimeout(function () { requestWalletSync(); }, 0);
      }
    } catch (e) {}
  }

  // 缓存用户信息到本地（同步写入）
  function cacheUser () {
    if (!_user) return;
    _user = normalizeUser(_user, true) || _user;
    writeStorageJson(USER_CACHE_KEY, _user);
    syncNickname();
  }

  var _nicknameSynced = '';
  var _nicknamePending = '';

  function syncNickname (retry) {
    if (!_user || !M3.GameHttp || !M3.GameHttp.updateProfile) return;
    var identity = M3.Auth && M3.Auth.getIdentity ? M3.Auth.getIdentity() : null;
    if (!identity || !identity.accountId) return;
    var nickname = String(_user.nickname || '').trim().slice(0, 12);
    if (!nickname) return;
    var key = identity.accountId + ':' + nickname;
    if (key === _nicknameSynced || key === _nicknamePending) return;
    _nicknamePending = key;
    M3.GameHttp.updateProfile(nickname).then(function () {
      _nicknameSynced = key;
    }).catch(function () {
      if ((retry || 0) < 2) {
        setTimeout(function () { syncNickname((retry || 0) + 1); }, 1500);
      }
    }).then(function () {
      if (_nicknamePending === key) _nicknamePending = '';
      var current = M3.Auth && M3.Auth.getIdentity ? M3.Auth.getIdentity() : null;
      if (_user && current && (current.accountId + ':' + String(_user.nickname || '').trim().slice(0, 12)) !== key) {
        syncNickname();
      }
    });
  }

  // token 尚未就绪时的重试次数上限（bootstrap 在 auth.js 完成前可能 UNAUTHENTICATED）
  var WALLET_SYNC_MAX_RETRY = 5;
  var _walletSyncRetry = 0;
  // 最近一次 bootstrap 成功同步的时间戳（新鲜度去抖用，见 requestWalletSync）
  var _walletSyncedAt = 0;

  // bootstrap 响应：一次性派发钱包、economy、新手状态、广告次数、语音配置、权益
  function _applyBootstrapResponse (data) {
    if (!data) return;

    // ── 钱包 + economy ──
    if (data.wallet) {
      M3.Game.setWallet(data.wallet, data.economy, {
        walletSource: data.walletSource || 'server',
        economyVersion: data.economyVersion || '',
        initialBeans: data.initialBeans || 0,
        serverNow: data.serverNow || 0,
        rewardType: data.rewardType || '',
      });
      // 记录 bootstrap 成功同步时间（requestWalletSync 新鲜度去抖用）
      _walletSyncedAt = Date.now();
    }
    // 每日登录奖励 toast
    if (data.claimed && data.rewardType === 'daily_login' && data.amount > 0) {
      M3.Game.flash(data.message || ('每日登录，获得 ' + data.amount + ' 铁豆'));
      if (M3.SceneBeanReward && M3.SceneBeanReward.show) M3.SceneBeanReward.show(data.amount);
    }

    // ── 新手礼包 ──
    if (data.newcomerGift && M3.SceneNewcomer && M3.SceneNewcomer.updateStatus) {
      M3.SceneNewcomer.updateStatus(data.newcomerGift);
    } else if (M3.SceneNewcomer && M3.SceneNewcomer.sendGetStatus) {
      // 异常兜底：bootstrap 回包缺 newcomerGift 字段（旧服务端/异常裁剪）才走 WS 查询
      M3.SceneNewcomer.sendGetStatus();
    }

    // ── 广告次数 ──
    if (data.adReward && M3.SceneAdReward && M3.SceneAdReward.updateStatus) {
      M3.SceneAdReward.updateStatus(data.adReward);
    }

    // ── 语音配置 ──
    if (data.voiceConfig && M3.SceneVoice && M3.SceneVoice.setConfig) {
      M3.SceneVoice.setConfig(data.voiceConfig);
    }

    // ── 权益（已购语音包）──
    if (data.entitlements && M3.SceneVoice && M3.SceneVoice.applyEntitlements) {
      M3.SceneVoice.applyEntitlements(data.entitlements);
    }

    // ── IAP 账号绑定：bootstrap 已含 identity，不需要等 WebSocket authOk ──
    // iap.js 的 bindAccount 依赖 accountId + loginType，从 M3.Auth.getIdentity() 取。
    // 仅在 IAP 尚未绑定此账号时桥接：此前每次 bootstrap 回包都重触发一次
    // bindAccount（balance + exchange-products），与 WS authOk 的订阅重复，
    // 一次启动连环多次；已绑定同账号则跳过（换号时仍会补绑）。
    if (M3.Iap && M3.Iap._handle) {
      var _iapIdentity = M3.Auth && M3.Auth.getIdentity ? M3.Auth.getIdentity() : null;
      if (_iapIdentity && _iapIdentity.accountId &&
          (!M3.Iap.isBoundTo || !M3.Iap.isBoundTo(_iapIdentity.accountId))) {
        M3.Iap._handle('authOk', {
          accountId: _iapIdentity.accountId,
          loginType: _iapIdentity.loginType || 'guest',
        });
      }
    }
  }

  // 等待 game-http.js 模块加载的重试计数（见 requestWalletSync 开头的说明）
  var _gameHttpWaitN = 0;

  function requestWalletSync (isRetry) {
    if (!_user) return;
    // 外部触发的去抖（isRetry 为内部重试，不受限）：
    //   1) 在途去抖——启动链上 tryRestoreCachedUser / autoLogin.onSuccess /
    //      authOk 会在数秒内连续触发多次 bootstrap；
    //   2) 新鲜度去抖——同账号 60 秒内刚成功 bootstrap 过则跳过（换账号不受限，
    //      冷启动缓存 token 拉过一次后，登录完成的权威刷新若账号未变即冗余；
    //      窗口内的钱包变化由 WS 推送与对局 state 增量补齐）。
    // 此前一次启动最多打过 3 次 bootstrap。
    if (!isRetry) {
      if (_walletSyncing) return;
      if (_walletReady && _wallet && _walletSyncedAt && Date.now() - _walletSyncedAt < 60000) {
        var _idNow = M3.Auth && M3.Auth.getIdentity ? M3.Auth.getIdentity() : null;
        if (!_idNow || !_idNow.accountId || _idNow.accountId === (_wallet.accountId || '')) return;
      }
    }
    if (!isRetry) _walletSyncRetry = 0;

    _walletSyncing = true;
    _walletError = '';
    clearTimeout(_walletSyncTimer);

    // ── GameHttp 尚未加载完成：index.html 脚本是动态按序加载（game.js 先于
    // game-http.js 执行），tryRestoreCachedUser 的 setTimeout(0) 钱包同步会抢在
    // game-http.js 执行之前触发——本地有缓存用户时必现。等待模块就绪
    // （150ms × 40 ≈ 6s 内静默重试），期间不弹任何错误提示。
    if (!M3.GameHttp) {
      if (_gameHttpWaitN < 40) {
        _gameHttpWaitN++;
        _walletSyncTimer = setTimeout(function () { requestWalletSync(true); }, 150);
        return;
      }
      // 超时仍未加载（脚本加载失败等异常）才提示
      _walletSyncing = false;
      _walletError = '钱包同步组件加载失败，请刷新重试';
      if (_pendingGoHome) { _pendingGoHome = false; enterHomeNow(); }
      M3.Game.flash(_walletError);
      return;
    }
    _gameHttpWaitN = 0;

    // ── HTTP bootstrap：token 就绪则直接请求，无需等待 WebSocket auth ──
    M3.GameHttp.bootstrap().then(function (data) {
      clearTimeout(_walletSyncTimer);
      _applyBootstrapResponse(data);
      syncNickname();
      // bootstrap 成功 = token 有效：主动建立 WS 完成 authOk。连接是惰性的
      // （仅匹配/领奖/401 才 ensureSocket），刷新后停在主页时无人触发连接，
      // 充值档商品（loadCatalog 要求 authed）与钻石余额（syncDiamond）会
      // 一直空置——「[IAP] syncDiamond skip: not authed」即此场景。
      if (M3.Network && M3.Network.ensureSocket) {
        var _u = (M3.Game.getUser && M3.Game.getUser()) || {};
        M3.Network.ensureSocket(_u.nickname || '玩家');
      }
    }).catch(function (err) {
      // token 尚未就绪时短暂重试，等 auth.js 完成认证后 token 写入
      if (err && err.code === 'UNAUTHENTICATED' && _walletSyncRetry < WALLET_SYNC_MAX_RETRY) {
        _walletSyncRetry++;
        // 【关键】token 只能经 WS auth 帧获取（deviceId → 服务端认证 → 下发
        // sessionToken），之后数据才全走 HTTP bootstrap。401 说明还没认证：
        // 必须主动触发 socket 连接（不发 getWallet，只为 auth 认证），
        // authOk 写入 token 后下面的重试 bootstrap 即可成功。
        if (M3.Network && M3.Network.ensureSocket) M3.Network.ensureSocket('玩家');
        M3.log('NET', 'bootstrap retry (no token, ensuring socket auth)', { attempt: _walletSyncRetry });
        _walletSyncTimer = setTimeout(function () { requestWalletSync(true); }, 600);
        return;
      }
      clearTimeout(_walletSyncTimer);
      _walletSyncing = false;
      _walletError = (err && err.message) || '钱包同步失败，请检查网络连接';
      _loginLoading = false;
      if (_pendingGoHome) { _pendingGoHome = false; enterHomeNow(); }
      M3.Game.flash(_walletError);
    });
  }

  // claim 奖励通用响应处理（wallet + rewardType 派发）
  function _applyClaimResponse (data) {
    if (!data || !data.wallet) return;
    M3.Game.setWallet(data.wallet, data.economy, {
      walletSource: 'server',
      economyVersion: data.economyVersion || '',
      initialBeans: data.initialBeans || 0,
      serverNow: data.serverNow || 0,
      rewardType: data.rewardType || '',
    });
    if (data.message) M3.Game.flash(data.message);
    if (data.claimed && data.amount > 0 && M3.SceneBeanReward && M3.SceneBeanReward.show) {
      M3.SceneBeanReward.show(data.amount);
    }
    // 广告次数更新
    if (data.rewardType === 'ad_reward' && M3.SceneAdReward && M3.SceneAdReward.updateFromWallet) {
      M3.SceneAdReward.updateFromWallet(data);
    }
    // 新手礼包状态更新
    if (data.rewardType === 'newcomer_gift' && M3.SceneNewcomer && M3.SceneNewcomer.onWalletReward) {
      M3.SceneNewcomer.onWalletReward(data);
    }
    // 破产补助
    if (data.rewardType === 'bankrupt_relief' && M3.SceneBankrupt && M3.SceneBankrupt.onWalletReward) {
      M3.SceneBankrupt.onWalletReward(data);
    }
    // 任务标记
    if (M3.SceneHome && M3.SceneHome.markTaskDone) {
      if (data.rewardType === 'share_reward' && (data.claimed || data.amount === 0)) M3.SceneHome.markTaskDone('share');
      if (data.rewardType === 'shortcut_reward' && (data.claimed || data.amount === 0)) M3.SceneHome.markTaskDone('join');
    }
  }

  function normalizeRoomType (roomType) {
    if (roomType === 'classic') return 'junior';
    if (roomType === 'senior') return 'master';
    return roomType || 'junior';
  }

  function clientRoomTier(roomType) {
    var type = normalizeRoomType(roomType || _roomType || 'junior');
    var serverTiers = _economy && _economy.roomTiers ? _economy.roomTiers : null;
    if (serverTiers && serverTiers[type]) return serverTiers[type];
    var tiers = {
      // 与服务端 ROOM_TIERS 同步的兜底值（仅服务端 economy 未下发时生效）：
      // 验资门槛 500/50000/500000、冻结（逃跑罚款）400/8000/64000
      junior: { name: '初级场', minBeansToMatch: 500, freezeBeans: 400 },
      mid:    { name: '中级场', minBeansToMatch: 50000, freezeBeans: 8000 },
      master: { name: '大师场', minBeansToMatch: 500000, freezeBeans: 64000 },
    };
    return tiers[type] || tiers.junior;
  }

  function hasBeansToEnter (roomType) {
    var tier = clientRoomTier(roomType || _roomType || 'junior');
    return _walletReady && (((_wallet && Number(_wallet.availableBeans != null ? _wallet.availableBeans : _wallet.beans)) || 0) >= tier.minBeansToMatch);
  }

  // 进入该场次还差多少铁豆（用于挑选够进场的最低兑换档）
  function beansDeficit (roomType) {
    var tier = clientRoomTier(roomType || _roomType || 'junior');
    var own = (_wallet && Number(_wallet.availableBeans != null ? _wallet.availableBeans : _wallet.beans)) || 0;
    return Math.max(0, Number(tier.minBeansToMatch || 0) - own);
  }

  function guideEarnBeans (roomType) {
    var tier = clientRoomTier(roomType || _roomType || 'junior');
    M3.Game.flash('铁豆不足，' + (tier.name || '该场次') + '至少需要' + tier.minBeansToMatch + '铁豆，可看广告或分享领豆');
  }

  function enterHomeNow () {
    // 冷启动自动回房恢复期间，屏蔽一切回大厅动作，避免登录/钱包回调把刚恢复的牌桌覆盖掉。
    if (_resuming) { M3.log('STATE', 'skip → home (resuming)'); return; }
    M3.log('STATE', '→ home');
    if (M3.Matchmaking && M3.Matchmaking.isMatching && M3.Matchmaking.isMatching()) {
      M3.Matchmaking.cancel();
    }
    _screen = 'home';
    _myPlayerId = null;
    _state = null;
    _myHand = [];
    _selectedCardIds = {};
    _roomId = '';
    _roomType = 'junior';
    _showRoomInput = false;
    _roomInputText = '';
    _loginLoading = false;
    M3.Network.clearRoom();
    var name = _user ? _user.nickname : '玩家';
    M3.Network.ensureSocket(name);
    // 进入大厅：释放游戏资源 + 重新加载大厅图片 + 恢复大厅 BGM
    if (typeof KwaiMedia !== 'undefined') {
      KwaiMedia.Audio.stopBgm();
      KwaiMedia.Audio.playBgmList(['asset/audio/bgm/bgm_0.mp3']);
      if (M3.SceneSettings && M3.SceneSettings.applyConfig) M3.SceneSettings.applyConfig();
    }
    if (M3.SceneHome && M3.SceneHome.ensureImages) M3.SceneHome.ensureImages();
  }

  // 启动时检查缓存
  tryRestoreCachedUser();

  M3.Game = {
    // ---- 屏幕 ----
    getScreen: function () { return _screen; },

    // ---- 提示出牌 ----
    hintCards: function () {
      var state = _state;
      if (!state) return;
      // 非出牌阶段或非自己回合，直接走本地规则
      if (state.phase !== 'playing' || state.currentPlayerId !== _myPlayerId) {
        _hintLocalFallback();
        return;
      }
      // 若服务端连接可用则请求 DouZero 提示，否则立即走本地规则
      var connected = M3.Network && M3.Network.getStatus && M3.Network.getStatus() === 'connected';
      if (connected) {
        if (_hintPending) return;   // 已有等待中的请求，避免重复发送
        _hintPending = true;
        clearTimeout(_hintFallbackTimer);
        // 超时 1s 未收到 hintResult 则降级本地规则
        _hintFallbackTimer = setTimeout(function () {
          if (!_hintPending) return;
          _hintPending = false;
          _hintLocalFallback();
        }, 1000);
        M3.Network.send('hint', {});
      } else {
        _hintLocalFallback();
      }
    },

    // 跟牌场景：判断我当前是否「有任何能压过上家出牌的牌」（含炸弹/火箭兜底）。
    // 用于回合开始时提前提示「你没有大过对家的牌」。自由出牌场景恒为 true。
    hasBeatableForCurrent: function () {
      var state = _state;
      if (!state) return true;
      var lastPlay = state.lastPlay;
      var myId = _myPlayerId;
      if (!lastPlay || lastPlay.playerId === myId || !lastPlay.analysis) return true;
      var hand = sortAsc(_myHand || []);
      if (!hand.length) return true;
      var picked = findBeatCards(hand, lastPlay.analysis, { allowPower: true });
      return !!(picked && picked.length > 0);
    },

    // ---- 服务端提示结果回调（DouZero 或规则降级） ----
    applyHintResult: function (data) {
      clearTimeout(_hintFallbackTimer);
      _hintPending = false;
      var source = data && data.source;
      var cardIds = data && Array.isArray(data.cardIds) ? data.cardIds : [];
      // source=none / 空 cardIds → 降级本地规则
      if (!source || source === 'none' || !cardIds.length) {
        _hintLocalFallback();
        return;
      }
      // 服务端返回推荐牌组（DouZero 或 rule）→ 按 id 在手牌中找到对应卡并选中
      var idSet = {};
      for (var i = 0; i < cardIds.length; i++) idSet[cardIds[i]] = true;
      var matched = (_myHand || []).filter(function (c) { return idSet[c.id]; });
      if (!matched.length) {
        _hintLocalFallback();
        return;
      }
      selectCards(matched);
    },

    // ---- 震动（兼容转发：统一走 M3.Vibrate，开关/节流/预算/降级全在那层）----
    vibrate: function (type) {
      var V = M3.Vibrate;
      if (!V) return;
      if (type === 'heavy') V.heavy();
      else if (type === 'light') V.light();
      else V.medium();
    },

    claimBankruptReward: function () {
      if (!_user) return;
      if (M3.GameHttp) {
        M3.GameHttp.claim('bankrupt_relief').then(_applyClaimResponse).catch(function (err) {
          M3.Game.flash((err && err.message) || '破产补助领取失败');
        });
        return;
      }
      var payload = userPayload();
      M3.Network.ensureSocket(payload.nickname || '玩家');
      M3.Network.send('claimBankruptReward', payload);
    },

    // ---- 用户 ----
    getUser: function () { return _user; },
    setUser: function (user) { _user = user; },
    getWallet: function () { return _wallet; },
    getWalletStatus: function () { return { ready: _walletReady, syncing: _walletSyncing, error: _walletError, meta: _walletMeta }; },
    isWalletReady: function () { return _walletReady; },
    setWallet: function (wallet, economy, meta) {
      _wallet = wallet || null;
      if (economy) _economy = economy;
      _walletReady = !!wallet;
      _walletSyncing = false;
      _walletError = '';
      _walletMeta = meta || _walletMeta;
      clearTimeout(_walletSyncTimer);
      if (meta && meta.walletSource === 'server') {
        console.log('[DDZ:WALLET] synced from server', meta, wallet);
      }
      if (_pendingGoHome) {
        _pendingGoHome = false;
        enterHomeNow();
      }
    },
    // 仅允许当前 Number 钱包模型安全承载的数值 patch；字符串大数等待全链路迁移。
    patchWallet: function (patch) {
      if (!patch) return false;
      var next = Object.assign({}, _wallet || {});
      var keys = ['beans', 'availableBeans', 'frozenBeans'];
      var changed = false;
      for (var i = 0; i < keys.length; i++) {
        var value = patch[keys[i]];
        if (typeof value === 'number' && isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER) {
          next[keys[i]] = value; changed = true;
        }
      }
      if (changed) { _wallet = next; _walletReady = true; }
      return changed;
    },
    getEconomy: function () { return _economy || {}; },
    setEconomy: function (economy) { if (economy) _economy = economy; },
    syncWallet: function () { requestWalletSync(); },
    updateWalletFromState: function (state) {
      if (!state || !_myPlayerId || !state.players || !state.players[_myPlayerId]) return;
      var p = state.players[_myPlayerId];
      var walletPatch = {
        beans: typeof p.beans === 'number' ? p.beans : 0,
        frozenBeans: typeof p.frozenBeans === 'number' ? p.frozenBeans : ((_wallet && _wallet.frozenBeans) || 0),
        availableBeans: typeof p.availableBeans === 'number' ? p.availableBeans : (typeof p.beans === 'number' ? p.beans : 0)
      };
      _wallet = Object.assign({}, _wallet || {}, walletPatch);
      _walletReady = true;
      _walletSyncing = false;
      _walletError = '';
    },
    hasBeansToEnter: function (roomType) { return hasBeansToEnter(roomType); },
    beansDeficit: function (roomType) { return beansDeficit(roomType); },
    guideEarnBeans: function (roomType) { guideEarnBeans(roomType); },
    // 破产补助可领判定（服务端 wallet.bankruptRelief 随每次 wallet 推送更新，
    // 权威数据不依赖客户端内存态）：{ claimable, amount }
    bankruptReliefAvailable: function () {
      var r = _wallet && _wallet.bankruptRelief;
      return (r && r.claimable && Number(r.amount) > 0) ? r : null;
    },

    // ---- 房间 ----
    getRoomId: function () { return _roomId; },
    setRoomId: function (id) { _roomId = id; },
    getRoomType: function () { return _roomType; },
    setRoomType: function (type) { _roomType = normalizeRoomType(type || 'junior'); },
    // 场次配置（优先服务端 economy.roomTiers，含 freezeBeans 等；本地兜底同服务端默认值）
    getRoomTier: function (roomType) { return clientRoomTier(roomType); },

    // ---- 玩家 ----
    getMyPlayerId: function () { return _myPlayerId; },
    setMyPlayerId: function (id) { _myPlayerId = id; },
    // 回房恢复落定：收到 joined 后解除恢复保护，之后 goHome/enterHomeNow 恢复正常。
    clearResuming: function () { _resuming = false; },
    isResuming: function () { return _resuming; },

    // ---- 游戏状态 ----
    getState: function () { return _state; },
    setState: function (s) { _state = s; },
    setServerOffset: function (offset) { _serverOffset = offset || 0; },
    getServerNow: function () { return Date.now() + _serverOffset; },

    // ---- 手牌 ----
    getHand: function () { return _myHand; },
    setHand: function (h) { _myHand = h; },

    // ---- 选中卡牌 ----
    getSelectedIds: function () { return _selectedCardIds; },
    clearSelected: function () { _selectedCardIds = {}; },
    toggleSelect: function (id) {
      if (_selectedCardIds[id]) {
        delete _selectedCardIds[id];
      } else {
        _selectedCardIds[id] = true;
      }
    },
    setSelect: function (id, val) {
      if (val) {
        _selectedCardIds[id] = true;
      } else {
        delete _selectedCardIds[id];
      }
    },

    // ---- 提示消息 ----
    getFlashMsg: function () { return _flashMsg; },
    flash: function (msg) {
      _flashMsg = msg;
      clearTimeout(_flashTimer);
      _flashTimer = setTimeout(function () { _flashMsg = ''; }, 1400);
    },
    clearFlash: function () { _flashMsg = ''; },

    // ---- 豆子数量全局统一展示格式 ----
    // <10000 原样展示；>=10000 → xx.x万；>=1亿 → xx.x亿
    //（保留一位小数，小数位为 0 时取整：1万 / 12.3万 / 3亿 / 12.5亿）
    // 负数返回 '-xx'（结算变动值场景）；非数字兜底 '0'
    formatBeans: function (n) {
      n = Number(n);
      if (!isFinite(n)) return '0';
      var neg = n < 0;
      var v = Math.abs(n);
      var s;
      if (v < 10000) {
        s = String(Math.floor(v));
      } else if (v < 100000000) {
        var w = Math.round(v / 10000 * 10) / 10;
        // 万位四舍五入顶到 10000 万时按 1 亿展示，避免出现「10000万」
        if (w >= 10000) {
          s = '1亿';
        } else {
          s = (w % 1 === 0 ? String(w) : w.toFixed(1)) + '万';
        }
      } else {
        var y = Math.round(v / 100000000 * 10) / 10;
        s = (y % 1 === 0 ? String(y) : y.toFixed(1)) + '亿';
      }
      return (neg ? '-' : '') + s;
    },

    // ---- 加入房间弹窗（六位数字键盘） ----
    getShowJoinModal: function () { return _showRoomInput; },
    setShowJoinModal: function (v) {
      _showRoomInput = v;
      if (v) _roomInputText = '';
    },
    getRoomDigits: function () { return _roomInputText; },
    addRoomDigit: function (d) {
      if (_roomInputText.length < 6) _roomInputText += String(d);
    },
    delRoomDigit: function () {
      _roomInputText = _roomInputText.slice(0, -1);
    },
    confirmJoinRoom: function () {
      if (_roomInputText.length === 6) {
        _showRoomInput = false;
        M3.Game.joinRoom(_roomInputText);
      }
    },

    // ---- 登录状态 ----
    isLoginLoading: function () { return _loginLoading; },
    setLoginLoading: function (v) { _loginLoading = v; },

    // ---- 退出登录 ----
    logout: function () {
      // 第一条同步路径先隔离 IAP，旧平台回调不得串到新账号。
      if (M3.Iap && M3.Iap.detachCurrentAccount) M3.Iap.detachCurrentAccount();
      if (M3.DiamondWallet && M3.DiamondWallet.resetForAccount) M3.DiamondWallet.resetForAccount('');
      // 清除缓存
      try {
        removeStorage(USER_CACHE_KEY);
        removeStorage(GUEST_CACHE_KEY);
      } catch (e) {}
      // 清空用户与认证会话，再断连
      _user = null;
      if (M3.Auth && M3.Auth.clearSession) M3.Auth.clearSession();
      _wallet = null;
      _walletReady = false;
      _walletSyncing = false;
      _walletError = '';
      clearTimeout(_walletSyncTimer);
      _walletSyncing = false;
      _walletError = '';
      _walletMeta = null;
      clearTimeout(_walletSyncTimer);
      _pendingGoHome = false;
      M3.Network.disconnect();
      // 回到大厅并重新自动登录
      enterHomeNow();
      setTimeout(function () { M3.Game.autoLogin(); }, 300);
    },

    goHome: function () {
      if (_user && !_walletReady) {
        _loginLoading = true;
        _pendingGoHome = true;
        requestWalletSync();
        return;
      }
      enterHomeNow();
    },

    goRoom: function (roomId, roomType, matchReservation) {
      roomType = normalizeRoomType(roomType || _roomType || 'junior');
      if (!hasBeansToEnter(roomType)) { guideEarnBeans(roomType); return; }
      M3.log('STATE', '→ game (skip room page)', roomId);
      // 进入游戏：切房间 BGM，applyConfig 应用开关配置，局内降到 20%
      if (typeof KwaiMedia !== 'undefined') {
        KwaiMedia.Audio.stopBgm();
        if (KwaiMedia.Audio.setBgmVolume) KwaiMedia.Audio.setBgmVolume(0);
        KwaiMedia.Audio.playBgm('subpackages/ingame/asset/audio/bgm/bgm_room.mp3');
        if (M3.SceneSettings && M3.SceneSettings.applyConfig) M3.SceneSettings.applyConfig();
        if (KwaiMedia.Audio.fadeBgm) KwaiMedia.Audio.fadeBgm(0.2, 600);
      }
      if (M3.SceneGame && M3.SceneGame.ensureImages) M3.SceneGame.ensureImages();
      // 匹配/加入后直接进入游戏局内屏（不再经过 room「准备房间」页）。
      // scene-game.js 已能渲染 waiting/ready 等开局前阶段，配合自动准备直接开牌。
      _screen = 'game';
      _roomId = roomId;
      _roomType = roomType;
      _myPlayerId = null;
      _state = null;
      _myHand = [];
      _selectedCardIds = {};

      // 在同一 socket 上发 join
      var payload = userPayload();
      M3.Network.joinRoom(payload.nickname, roomId, payload.avatarUrl, payload.openId, roomType, payload.accountId, matchReservation || null);
    },

    // 冷启动/重连自动回房：回到的是上次掉线、且服务端仍保留座位的进行中对局，
    // 座位已扣过入场费，故不走 goRoom 的铁豆门槛，直接切屏并发 join（服务端命中
    // playerCanRecoverSeat 后按重连恢复处理，回 joined + state + hand）。
    resumeRoom: function (roomId, roomType) {
      if (!roomId) return;
      roomType = normalizeRoomType(roomType || _roomType || 'junior');
      M3.log('STATE', '→ game (resume room)', roomId);
      // 清除待回大厅标记：冷启动时 tryRestoreCachedUser/登录流程会置 _pendingGoHome，
      // 若不清除，随后到达的 wallet 回包会触发 enterHomeNow 把刚恢复的牌桌覆盖回大厅。
      _pendingGoHome = false;
      _loginLoading = false;
      _resuming = true;   // 标记恢复中，屏蔽 goHome/enterHomeNow 直到 joined 落定
      if (typeof KwaiMedia !== 'undefined') {
        KwaiMedia.Audio.stopBgm();
        if (KwaiMedia.Audio.setBgmVolume) KwaiMedia.Audio.setBgmVolume(0);
        KwaiMedia.Audio.playBgm('subpackages/ingame/asset/audio/bgm/bgm_room.mp3');
        if (M3.SceneSettings && M3.SceneSettings.applyConfig) M3.SceneSettings.applyConfig();
        if (KwaiMedia.Audio.fadeBgm) KwaiMedia.Audio.fadeBgm(0.2, 600);
      }
      if (M3.SceneGame && M3.SceneGame.ensureImages) M3.SceneGame.ensureImages();
      _screen = 'game';
      _roomId = roomId;
      _roomType = roomType;
      _myPlayerId = null;
      _state = null;
      _myHand = [];
      _selectedCardIds = {};
      var payload = userPayload();
      M3.Network.joinRoom(payload.nickname, roomId, payload.avatarUrl, payload.openId, roomType, payload.accountId, null);
    },

    goGame: function () {
      // 从 room 阶段切到 game 阶段（不跨场景，不释放资源）
      _screen = 'game';
    },

    // 匹配开始时进入「房间内等待」视图：切到 game 屏并清空上一局残留状态，
    // 让匹配 loading 覆盖在房间背景之上；真正的 join 在 matchFound 后进行。
    enterMatchRoom: function (roomType) {
      // 进入匹配：切房间 BGM，applyConfig 应用开关配置，降到 20%
      if (typeof KwaiMedia !== 'undefined') {
        KwaiMedia.Audio.stopBgm();
        if (KwaiMedia.Audio.setBgmVolume) KwaiMedia.Audio.setBgmVolume(0);
        KwaiMedia.Audio.playBgm('subpackages/ingame/asset/audio/bgm/bgm_room.mp3');
        if (M3.SceneSettings && M3.SceneSettings.applyConfig) M3.SceneSettings.applyConfig();
        if (KwaiMedia.Audio.fadeBgm) KwaiMedia.Audio.fadeBgm(0.2, 600);
      }
      if (M3.SceneGame && M3.SceneGame.ensureImages) M3.SceneGame.ensureImages();
      _screen = 'game';
      _roomType = normalizeRoomType(roomType || _roomType || 'junior');
      _myPlayerId = null;
      _state = null;
      _myHand = [];
      _selectedCardIds = {};
    },

    // ---- 自动登录（启动时静默执行，不弹出登录页） ----
    autoLogin: function () {
      // H5/浏览器测试环境：直接使用稳定的本地游客身份
      if (typeof ks === 'undefined') {
        _user = _user || getOrCreateGuestProfile(false);
        cacheUser();
        requestWalletSync();
        return;
      }

      // 快手环境：静默调 ks.login 获取 code，交给服务端认证
      if (typeof KwaiLogin !== 'undefined' && KwaiLogin.init) {
        KwaiLogin.init({
          onSuccess: function () {
            // 初始化占位用户展示信息（accountId 由服务端 authOk 下发）
            if (!_user || !_user.nickname || _user.nickname.indexOf('快手') === 0) {
              _user = normalizeUser({
                nickname: '快手用户' + Math.floor(Math.random() * 9000 + 1000),
                avatarUrl: '',
                loginType: 'kwai',
              }, true);
            }
            cacheUser();
            requestWalletSync();

            // 后台尝试获取用户头像昵称（授权 + 拉取）
            M3.Game._fetchUserInfoSilent();
          },
          onFail: function () {
            // 登录失败，使用游客身份
            if (!_user) {
              _user = getOrCreateGuestProfile(false);
              cacheUser();
            }
            requestWalletSync();
          },
        });
      } else {
        // KwaiLogin 不可用，降级为游客
        _user = _user || getOrCreateGuestProfile(false);
        cacheUser();
        requestWalletSync();
      }
    },

    // 内部：静默拉取用户信息（不触发页面跳转，仅更新 _user）
    _fetchUserInfoSilent: function () {
      var self = this;
      if (typeof KwaiOpen === 'undefined') return;

      KwaiOpen.getSetting({
        onSuccess: function (res) {
          var authSetting = res.authSetting || {};
          if (authSetting['scope.userInfo'] === true) {
            // 已授权，直接获取
            self._doGetUserInfo();
          } else if (authSetting['scope.userInfo'] === false) {
            // 曾拒绝，不做任何事（保持当前占位昵称）
            _loginLoading = false;
          } else {
            // 从未请求过授权，发起申请
            self._requestAuthThenGetUserInfo();
          }
        },
        onFail: function () {
          // getSetting 失败，尝试直接申请授权
          self._requestAuthThenGetUserInfo();
        },
      });
    },

    // 内部：先授权 scope.userInfo，再获取用户信息（静默，不跳页）
    _requestAuthThenGetUserInfo: function () {
      var self = this;
      KwaiOpen.authorize({
        scope: 'scope.userInfo',
        onSuccess: function () {
          self._doGetUserInfo();
        },
        onFail: function () {
          // 用户拒绝授权，保持当前身份
          _loginLoading = false;
        },
      });
    },

    // 内部：获取用户信息并就地更新（不跳页）
    _doGetUserInfo: function () {
      var self = this;
      KwaiOpen.getUserInfo({
        onSuccess: function (res) {
          var info = res.userInfo || res;
          _user = normalizeUser(Object.assign({}, _user || {}, {
            nickname: info.nickName || info.nickname || info.userName || (_user && _user.nickname) || '快手玩家',
            avatarUrl: info.avatarUrl || info.userHead || '',
          }), true);
          _loginLoading = false;
          cacheUser();
        },
        onFail: function () {
          _loginLoading = false;
        },
      });
    },

    // 点击头像重新获取/更新用户信息（强制重新授权流程）
    refreshUserInfo: function () {
      var self = this;
      if (typeof ks === 'undefined') {
        // H5 环境：直接使用本地游客身份
        _user = getOrCreateGuestProfile(true);
        cacheUser();
        M3.Game.flash('已刷新游客身份');
        return;
      }

      M3.Game.flash('正在更新用户信息...');

      // 强制重登可能切换快手账号，重建连接前先同步隔离旧 IAP 任务。
      if (M3.Iap && M3.Iap.detachCurrentAccount) M3.Iap.detachCurrentAccount();
      if (M3.DiamondWallet && M3.DiamondWallet.resetForAccount) M3.DiamondWallet.resetForAccount('');

      // 先确保登录态有效（forceRelogin 跳过缓存复用）
      if (typeof KwaiLogin !== 'undefined' && KwaiLogin.init) {
        KwaiLogin.init({
          forceRelogin: true,
          onSuccess: function () {
            // 强制走授权流程（用 getSetting 而非复用，因为可能之前被拒绝过）
            if (typeof KwaiOpen !== 'undefined') {
              KwaiOpen.authorize({
                scope: 'scope.userInfo',
                onSuccess: function () {
                  KwaiOpen.getUserInfo({
                    onSuccess: function (res) {
                      var info = res.userInfo || res;
                      _user = normalizeUser(Object.assign({}, _user || {}, {
                        nickname: info.nickName || info.nickname || info.userName || (_user && _user.nickname) || '快手玩家',
                        avatarUrl: info.avatarUrl || info.userHead || '',
                      }), true);
                      cacheUser();
                      M3.Game.flash('用户信息已更新');
                    },
                    onFail: function () {
                      M3.Game.flash('获取用户信息失败');
                    },
                  });
                },
                onFail: function () {
                  M3.Game.flash('需要授权才能获取用户信息');
                },
              });
            }
          },
          onFail: function () {
            M3.Game.flash('登录失败，请稍后重试');
          },
        });
      }
    },

    // ---- 创建房间 ----
    createRoom: function (roomType) {
      roomType = normalizeRoomType(roomType || 'junior');
      if (!_user) return;
      if (!hasBeansToEnter(roomType)) { guideEarnBeans(roomType); return; }
      var payload = userPayload();
      M3.Network.send('createRoom', Object.assign({}, payload, { roomType: roomType }));
    },

    // ---- 进入场次：房间卡片直接进入对应档位快速匹配 ----
    enterRoom: function (options) {
      options = options || {};
      var roomType = normalizeRoomType(options.type || options.roomType || 'junior');
      if (!_user) { M3.Game.flash('请先登录'); return; }
      // 豆子不足（钱包已就绪且确实不足）：先弹「豆子不足」引导购买，
      // 用户关闭后才退回看广告链路——未达上限弹「看广告得铁豆」弹窗；
      // 已达上限提示「明日再来吧」。
      // 钱包未就绪时放行，由服务端匹配门槛（INSUFFICIENT_MATCH_BEANS）权威兜底。
      if (_walletReady && !hasBeansToEnter(roomType)) {
        // 破产补助可领（服务端 wallet.bankruptRelief 权威判定）：点场次优先弹补助，
        // 领取发豆到账即可进场；已领/不可领时 wallet 回包会刷新 claimable
        var _relief = this.bankruptReliefAvailable && this.bankruptReliefAvailable();
        if (_relief && M3.SceneBankrupt && M3.SceneBankrupt.show) {
          M3.SceneBankrupt.show(_relief.amount);
          return;
        }
        var fallbackToAd = function () {
          var AR = M3.SceneAdReward;
          if (AR && AR.queryStatus) {
            AR.queryStatus(function (st) {
              if (st && Number(st.remaining) > 0) {
                if (AR.show) AR.show();
              } else if (st) {
                M3.Game.flash('明日再来吧');
              } else {
                guideEarnBeans(roomType);   // 状态获取失败/超时：退回原有提示
              }
            });
          } else {
            guideEarnBeans(roomType);
          }
        };
        var IB = M3.SceneInsufficientBeans;
        // 兑换目录未就绪时 show 返回 false，直接走原看广告链路
        if (!(IB && IB.show && IB.show({
          roomType: roomType,
          deficit: beansDeficit(roomType),
          onClosed: fallbackToAd,
        }))) {
          fallbackToAd();
        }
        return;
      }
      if (M3.Matchmaking && M3.Matchmaking.start) M3.Matchmaking.start({ roomType: roomType });
    },

    // ---- 加入房间 ----
    joinRoom: function (roomId, roomType, matchReservation) {
      if (!roomId) return;
      roomType = normalizeRoomType(roomType || _roomType || 'junior');
      if (!hasBeansToEnter(roomType)) { guideEarnBeans(roomType); return; }
      _roomInputText = '';
      _showRoomInput = false;
      this.goRoom(roomId, roomType, matchReservation || null);
    },

    // ---- 退出房间 ----
    leaveRoom: function () {
      M3.Network.send('leaveRoom');
      // 乐观切换：立即回大厅（结算阶段服务端必然放行；leftRoom 推送到达时
      // 已在 home，main.js 幂等跳过不重复切屏）
      M3.Game.goHome();
    },

    // ---- 分享赚铁豆 ----
    claimShareReward: function () {
      if (!_user) return;
      if (M3.GameHttp) {
        M3.GameHttp.claim('share_reward').then(_applyClaimResponse).catch(function (err) {
          M3.Game.flash((err && err.message) || '分享奖励领取失败');
        });
        return;
      }
      var payload = userPayload();
      M3.Network.ensureSocket(payload.nickname || '玩家');
      M3.Network.send('claimShareReward', payload);
    },

    // ---- 广告补豆 ----
    claimAdReward: function () {
      if (!_user) return;
      if (!_pendingAdTransId) {
        _pendingAdTransId = 'h5_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      }
      var transId = _pendingAdTransId;
      if (M3.GameHttp) {
        M3.GameHttp.claim('ad_reward', { adTransId: transId }).then(function (data) {
          if (data && data.rewardType === 'ad_reward' && (data.claimed || data.claimCount > 0)) {
            _pendingAdTransId = ''; // 确认成功，清除 pending
          }
          _applyClaimResponse(data);
        }).catch(function (err) {
          M3.Game.flash((err && err.message) || '广告奖励领取失败');
        });
        return;
      }
      // 降级 WebSocket
      var payload = userPayload();
      payload.adTransId = transId;
      M3.Network.ensureSocket(payload.nickname || '玩家');
      M3.Network.send('claimAdReward', payload);
    },

    // 重连后重发未确认的广告领豆（由 main.js authOk handler 调用）
    retryPendingAdClaim: function () {
      if (!_pendingAdTransId || !_user) return;
      // HTTP 模式直接重试
      if (M3.GameHttp) { M3.Game.claimAdReward(); return; }
      var payload = userPayload();
      payload.adTransId = _pendingAdTransId;
      M3.Network.send('claimAdReward', payload);
      M3.log('GAME', 'retry pending ad claim', _pendingAdTransId);
    },

    // 广告领豆服务端确认后清除 pending（claimed=true 或 duplicate 均视为已处理）
    clearPendingAdClaim: function () {
      _pendingAdTransId = '';
    },

    // ---- 加桌奖励 ----
    // 发放条件（2026-10-22 定稿）：启动来源是桌面快捷方式 / mini apk 才发，
    // 由 ks.getLaunchOptionsSync / ks.onShow 的 from 判定（iOS 的 addShortcut
    // 无回调，按按钮回调解发在 iOS 永远不可达；改为按真实启动来源发放）。
    // 服务端 lifetimeOnce 终身一次幂等，多触发点重复请求无害。
    claimShortcutReward: function () {
      if (!_user) return;
      if (M3.GameHttp) {
        M3.GameHttp.claim('shortcut_reward').then(_applyClaimResponse).catch(function (err) {
          M3.Game.flash((err && err.message) || '加桌奖励领取失败');
        });
        return;
      }
      var payload = userPayload();
      M3.Network.ensureSocket(payload.nickname || '玩家');
      M3.Network.send('claimShortcutReward', payload);
    },

    // ── 启动来源（桌面启动发放加桌奖励）──
    // 桌面来源白名单：iOS 桌面快捷方式 / Android mini apk / Android 快捷方式
    setLaunchFrom: function (from) {
      var prev = _launchFrom;
      _launchFrom = String(from || '');
      // 来源变化（冷启动读到 / onShow 回前台更新）时尝试发放
      if (_launchFrom && _launchFrom !== prev) M3.Game.maybeClaimShortcut();
    },
    maybeClaimShortcut: function () {
      if (_DESK_FROMS.indexOf(_launchFrom) === -1) return;
      M3.Game.claimShortcutReward();   // 未登录时内部安全返回，登录后由 authOk 再补发
    },

    // ---- 分享房间 ----
    shareRoom: function () {
      if (typeof KwaiShare !== 'undefined' && KwaiShare.share) {
        KwaiShare.share({
          title: '来和我一起玩斗地主吧！',
          extraQuery: { roomId: _roomId },
        });
      } else {
        // H5 环境：复制到剪贴板或显示
        M3.Game.flash('房间号：' + _roomId + '（分享给好友即可加入）');
        // 尝试复制
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(_roomId).catch(function () {});
        }
      }
    },

    // ---- 解析分享参数（从启动参数获取 roomId） ----
    checkLaunchQuery: function () {
      if (typeof KwaiShare !== 'undefined' && KwaiShare.getLaunchQuery) {
        var query = KwaiShare.getLaunchQuery();
        if (query && query.roomId) {
          return query.roomId;
        }
      }
      return null;
    },
  };

  // 启动时自动登录（静默，不弹出登录页，直接进大厅）
  // 延迟执行以确保 render / input 等模块完全初始化
  setTimeout(function () {
    M3.Game.autoLogin();
  }, 100);

  // 本地规则提示（DouZero 不可用时的降级路径）
  function _hintLocalFallback () {
    var state = _state;
    if (!state) return;
    var lastPlay = state.lastPlay;
    var myId = _myPlayerId;
    if (!lastPlay || lastPlay.playerId === myId) {
      hintFreePlay();
    } else {
      hintBeat(lastPlay);
    }
  }

  // 提示：新一轮自由出牌（连续点击时在不同可出方案间轮换）
  function hintFreePlay () {
    var hand = sortAsc(_myHand || []);
    if (!hand || hand.length === 0) return;
    var candidates = listLeadCandidates(hand);
    var picked = pickHintCandidate('lead', null, hand, candidates);
    if (picked && picked.length > 0) selectCards(picked);
  }

  // 提示：需要跟上家出牌。连续点击时在不同可压方案间轮换，必要时包含炸弹/火箭兜底。
  function hintBeat (lastPlay) {
    var hand = sortAsc(_myHand || []);
    if (!hand || !lastPlay || !lastPlay.analysis) return;
    var candidates = listBeatCandidates(hand, lastPlay.analysis);
    var picked = pickHintCandidate('beat', lastPlay.analysis, hand, candidates);

    if (picked && picked.length > 0) {
      // 有可压的牌：直接把牌选中提上来，不再弹「建议出 xxx」提示
      selectCards(picked);
    } else {
      // 无牌可压：自动帮用户点「不出」，并提示「xx不出」（首轮/自己是上家时服务端会校验）
      if (M3.Vibrate) M3.Vibrate.err();   // 提示按钮无牌可出：中×2（错误语义）
      _selectedCardIds = {};
      var canPass = lastPlay && lastPlay.playerId && lastPlay.playerId !== _myPlayerId;
      if (canPass) {
        M3.Network.send('pass');
        // 「不出」不再弹 toast（改为在自己牌堆上方展示「不出」文字，由 scene-game 处理）
      }
    }
  }

  function shouldLeadHighSingleHint () {
    var state = _state;
    var myId = _myPlayerId;
    if (!state || !myId || !state.players || !state.dealer) return false;
    var me = state.players[myId];
    if (!me || me.role !== 'farmer') return false;
    var landlordCount = state.handCounts ? (state.handCounts[state.dealer] || 0) : 0;
    return landlordCount > 0 && landlordCount <= 2;
  }

  function shouldUsePowerPlayHint (analysis) {
    var state = _state;
    var myId = _myPlayerId;
    var hand = _myHand || [];
    if (hand.length <= 4) return true;
    if (analysis && analysis.type === 'bomb') return true;
    if (!state || !state.handCounts || !state.lastPlay) return false;
    var lastCount = state.handCounts[state.lastPlay.playerId] || 0;
    if (lastCount > 0 && lastCount <= 2) return true;
    var landlordCount = state.dealer ? (state.handCounts[state.dealer] || 0) : 0;
    var me = state.players && state.players[myId];
    return !!(me && me.role === 'farmer' && landlordCount > 0 && landlordCount <= 2);
  }

  function findLeadCards (hand) {
    var candidates = listLeadCandidates(hand);
    return candidates.length ? candidates[0] : [];
  }

  function hintContextKey (mode, analysis, hand) {
    var state = _state || {};
    var lastPlay = state.lastPlay || {};
    var ids = sortAsc(hand || []).map(function (c) { return c.id; }).join(',');
    var prev = analysis ? [analysis.type, analysis.rank, analysis.length, analysis.chainLength || 0].join(':') : 'lead';
    return [mode, state.round && state.round.number || 0, state.currentPlayerId || '', lastPlay.playerId || '', prev, ids].join('|');
  }

  function pickHintCandidate (mode, analysis, hand, candidates) {
    candidates = dedupeCandidates(candidates || []);
    if (!candidates.length) {
      _hintCycleKey = '';
      _hintCycleIndex = 0;
      return [];
    }
    var key = hintContextKey(mode, analysis, hand);
    if (_hintCycleKey !== key) {
      _hintCycleKey = key;
      _hintCycleIndex = 0;
    }
    var picked = candidates[_hintCycleIndex % candidates.length];
    _hintCycleIndex = (_hintCycleIndex + 1) % candidates.length;
    return picked;
  }

  function candidateKey (cards) {
    return sortAsc(cards || []).map(function (c) { return c.id; }).join('|');
  }

  function addCandidate (out, seen, cards, previous) {
    if (!cards || cards.length === 0) return;
    var sorted = sortAsc(cards);
    var analysis = M3.Rule && M3.Rule.analyzePlay ? M3.Rule.analyzePlay(sorted) : null;
    if (!analysis) return;
    if (previous && M3.Rule && M3.Rule.canBeat && !M3.Rule.canBeat(analysis, previous)) return;
    var key = candidateKey(sorted);
    if (seen[key]) return;
    seen[key] = true;
    out.push(sorted);
  }

  function dedupeCandidates (candidates) {
    var out = [];
    var seen = {};
    for (var i = 0; i < candidates.length; i++) {
      var cards = candidates[i] || [];
      var key = candidateKey(cards);
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push(sortAsc(cards));
    }
    return out;
  }

  function listLeadCandidates (hand) {
    var groups = groupByRank(hand);
    var out = [];
    var seen = {};
    var highSingle = shouldLeadHighSingleHint();

    // 优先减少手数，但保留多种可选方案，连续点击时轮换。
    addCandidate(out, seen, hand, null);
    addStraightCandidates(out, seen, groups, 1, 5, 0, 0, null);
    addStraightCandidates(out, seen, groups, 2, 3, 0, 0, null);
    addAirplaneCandidates(out, seen, groups, 0, 0, 2, null);
    addAirplaneCandidates(out, seen, groups, 0, 0, 1, null);
    addAirplaneCandidates(out, seen, groups, 0, 0, 0, null);
    addTripleWithCandidates(out, seen, groups, 0, 2, null);
    addTripleWithCandidates(out, seen, groups, 0, 1, null);
    addNOfKindCandidates(out, seen, groups, 3, 0, true, null);
    addNOfKindCandidates(out, seen, groups, 2, 0, true, null);
    addFourWithCandidates(out, seen, groups, 0, 2, null);
    addFourWithCandidates(out, seen, groups, 0, 1, null);
    addSingleCandidates(out, seen, groups, 0, true, true, highSingle, null);
    addSingleCandidates(out, seen, groups, 0, false, false, highSingle, null);
    addNOfKindCandidates(out, seen, groups, 4, 0, false, null);
    addRocketCandidate(out, seen, groups, null);
    return sortHintCandidates(out, null);
  }

  function listBeatCandidates (hand, analysis) {
    var groups = groupByRank(hand);
    var out = [];
    var seen = {};
    if (!analysis) return out;

    if (analysis.type === 'single') addSingleCandidates(out, seen, groups, analysis.rank, true, true, false, analysis);
    else if (analysis.type === 'pair') addNOfKindCandidates(out, seen, groups, 2, analysis.rank, true, analysis);
    else if (analysis.type === 'triple') addNOfKindCandidates(out, seen, groups, 3, analysis.rank, true, analysis);
    else if (analysis.type === 'triple-single') addTripleWithCandidates(out, seen, groups, analysis.rank, 1, analysis);
    else if (analysis.type === 'triple-pair') addTripleWithCandidates(out, seen, groups, analysis.rank, 2, analysis);
    else if (analysis.type === 'straight') addStraightCandidates(out, seen, groups, 1, analysis.chainLength || analysis.length, analysis.rank, analysis.rank, analysis);
    else if (analysis.type === 'pair-straight') addStraightCandidates(out, seen, groups, 2, analysis.chainLength || (analysis.length / 2), analysis.rank, analysis.rank, analysis);
    else if (analysis.type === 'airplane') addAirplaneCandidates(out, seen, groups, analysis.rank, analysis.chainLength || 2, 0, analysis);
    else if (analysis.type === 'airplane-singles') addAirplaneCandidates(out, seen, groups, analysis.rank, analysis.chainLength || 2, 1, analysis);
    else if (analysis.type === 'airplane-pairs') addAirplaneCandidates(out, seen, groups, analysis.rank, analysis.chainLength || 2, 2, analysis);
    else if (analysis.type === 'four-two-singles') addFourWithCandidates(out, seen, groups, analysis.rank, 1, analysis);
    else if (analysis.type === 'four-two-pairs') addFourWithCandidates(out, seen, groups, analysis.rank, 2, analysis);
    else if (analysis.type === 'bomb') addNOfKindCandidates(out, seen, groups, 4, analysis.rank, false, analysis);

    if (shouldUsePowerPlayHint(analysis)) {
      if (analysis.type !== 'bomb') addNOfKindCandidates(out, seen, groups, 4, 0, false, analysis);
      if (analysis.type !== 'rocket') addRocketCandidate(out, seen, groups, analysis);
    }
    return sortHintCandidates(out, analysis);
  }

  function sortHintCandidates (candidates, previous) {
    return dedupeCandidates(candidates).sort(function (a, b) {
      var aa = M3.Rule.analyzePlay(a) || {};
      var bb = M3.Rule.analyzePlay(b) || {};
      var powerA = aa.type === 'bomb' || aa.type === 'rocket';
      var powerB = bb.type === 'bomb' || bb.type === 'rocket';
      if (previous && powerA !== powerB) return powerA ? 1 : -1;
      if (a.length !== b.length) return b.length - a.length;
      return (aa.rank || 0) - (bb.rank || 0);
    });
  }

  function addSingleCandidates (out, seen, groups, minRank, preferSolo, avoidBomb, preferHigh, previous) {
    var candidates = [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].rank > minRank && (!avoidBomb || groups[i].cards.length < 4)) candidates.push(groups[i]);
    }
    candidates.sort(function (a, b) { return preferHigh ? b.rank - a.rank : a.rank - b.rank; });
    for (var j = 0; j < candidates.length; j++) {
      if (!preferSolo || candidates[j].cards.length === 1) addCandidate(out, seen, [candidates[j].cards[0]], previous);
    }
    if (preferSolo) {
      for (var k = 0; k < candidates.length; k++) {
        if (candidates[k].cards.length !== 1) addCandidate(out, seen, [candidates[k].cards[0]], previous);
      }
    }
  }

  function addNOfKindCandidates (out, seen, groups, n, minRank, avoidBomb, previous) {
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].rank > minRank && groups[i].cards.length >= n && (!avoidBomb || groups[i].cards.length < 4)) {
        addCandidate(out, seen, groups[i].cards.slice(0, n), previous);
      }
    }
  }

  function addTripleWithCandidates (out, seen, groups, minRank, wingCount, previous) {
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.rank <= minRank || g.cards.length < 3 || g.cards.length >= 4) continue;
      var triple = g.cards.slice(0, 3);
      for (var j = 0; j < groups.length; j++) {
        var w = groups[j];
        if (w.rank === g.rank || w.cards.length >= 4) continue;
        if (wingCount === 1 && w.cards.length >= 1) addCandidate(out, seen, triple.concat([w.cards[0]]), previous);
        if (wingCount === 2 && w.cards.length >= 2) addCandidate(out, seen, triple.concat(w.cards.slice(0, 2)), previous);
      }
    }
  }

  function addStraightCandidates (out, seen, groups, eachCount, chainLength, minHighRank, previousRank, previous) {
    var minLen = eachCount === 1 ? 5 : 3;
    var required = chainLength || minLen;
    if (required < minLen) return;
    var valid = groups.filter(function (g) { return g.rank < 15 && g.cards.length >= eachCount; });
    for (var i = 0; i < valid.length; i++) {
      for (var len = required; len <= valid.length - i; len++) {
        var ok = true;
        for (var j = 1; j < len; j++) {
          if (valid[i + j].rank !== valid[i].rank + j) { ok = false; break; }
        }
        if (!ok) break;
        var high = valid[i + len - 1].rank;
        if (high <= minHighRank) continue;
        var picked = [];
        for (var k = 0; k < len; k++) picked = picked.concat(valid[i + k].cards.slice(0, eachCount));
        addCandidate(out, seen, picked, previous);
        if (chainLength) break;
      }
    }
  }

  function addAirplaneCandidates (out, seen, groups, minRank, chainLength, wingCount, previous) {
    var triples = groups.filter(function (g) { return g.rank < 15 && g.cards.length >= 3 && g.cards.length < 4; });
    var requiredLength = chainLength || 0;
    for (var start = 0; start < triples.length; start++) {
      var chain = [triples[start]];
      for (var i = start + 1; i < triples.length; i++) {
        if (triples[i].rank === chain[chain.length - 1].rank + 1) chain.push(triples[i]);
        else if (triples[i].rank > chain[chain.length - 1].rank + 1) break;
      }
      for (var len = chain.length; len >= 2; len--) {
        if (requiredLength && len !== requiredLength) continue;
        for (var offset = 0; offset + len <= chain.length; offset++) {
          var segment = chain.slice(offset, offset + len);
          var high = segment[segment.length - 1].rank;
          if (high <= minRank) continue;
          var mainRanks = {};
          for (var r = 0; r < segment.length; r++) mainRanks[segment[r].rank] = true;
          var wingSets = listAirplaneWingSets(groups, mainRanks, len, wingCount);
          for (var ws = 0; ws < wingSets.length; ws++) {
            var main = [];
            for (var m = 0; m < segment.length; m++) main = main.concat(segment[m].cards.slice(0, 3));
            addCandidate(out, seen, main.concat(wingSets[ws]), previous);
          }
        }
      }
    }
  }

  function listAirplaneWingSets (groups, mainRanks, chainLength, wingCount) {
    if (wingCount === 0) return [[]];
    var eligible = [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (mainRanks[g.rank] || g.cards.length >= 4) continue;
      if (wingCount === 1 && g.cards.length >= 1) eligible.push([g.cards[0]]);
      if (wingCount === 2 && g.cards.length >= 2) eligible.push(g.cards.slice(0, 2));
    }
    return combineGroups(eligible, chainLength);
  }

  function addFourWithCandidates (out, seen, groups, minRank, wingMode, previous) {
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.rank <= minRank || g.cards.length < 4) continue;
      var wingSets = listFourWingSets(groups, g.rank, wingMode);
      for (var w = 0; w < wingSets.length; w++) addCandidate(out, seen, g.cards.slice(0, 4).concat(wingSets[w]), previous);
    }
  }

  function listFourWingSets (groups, mainRank, wingMode) {
    var eligible = [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.rank === mainRank || g.cards.length >= 4) continue;
      if (wingMode === 1 && g.cards.length >= 1) eligible.push([g.cards[0]]);
      if (wingMode === 2 && g.cards.length >= 2) eligible.push(g.cards.slice(0, 2));
    }
    return combineGroups(eligible, 2);
  }

  function combineGroups (groups, count, start, prefix, out) {
    start = start || 0;
    prefix = prefix || [];
    out = out || [];
    if (prefix.length === count) {
      var cards = [];
      for (var i = 0; i < prefix.length; i++) cards = cards.concat(prefix[i]);
      out.push(cards);
      return out;
    }
    for (var j = start; j <= groups.length - (count - prefix.length); j++) {
      prefix.push(groups[j]);
      combineGroups(groups, count, j + 1, prefix, out);
      prefix.pop();
    }
    return out;
  }

  function addRocketCandidate (out, seen, groups, previous) {
    var small = null, big = null;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].rank === 16) small = groups[i].cards[0];
      if (groups[i].rank === 17) big = groups[i].cards[0];
    }
    if (small && big) addCandidate(out, seen, [small, big], previous);
  }

  function findBeatCards (hand, analysis, options) {
    options = options || {};
    var groups = groupByRank(hand);
    var picked = [];

    if (analysis.type === 'single') picked = pickSingle(groups, analysis.rank, true, true, false);
    else if (analysis.type === 'pair') picked = pickNOfKind(groups, 2, analysis.rank, true);
    else if (analysis.type === 'triple') picked = pickNOfKind(groups, 3, analysis.rank, true);
    else if (analysis.type === 'triple-single') picked = pickTripleWith(groups, analysis.rank, 1);
    else if (analysis.type === 'triple-pair') picked = pickTripleWith(groups, analysis.rank, 2);
    else if (analysis.type === 'straight') picked = pickStraight(groups, analysis.rank, analysis.chainLength || analysis.length, 1);
    else if (analysis.type === 'pair-straight') picked = pickStraight(groups, analysis.rank, analysis.chainLength || (analysis.length / 2), 2);
    else if (analysis.type === 'airplane') picked = findAirplane(groups, analysis.rank, analysis.chainLength || 2, 0);
    else if (analysis.type === 'airplane-singles') picked = findAirplane(groups, analysis.rank, analysis.chainLength || 2, 1);
    else if (analysis.type === 'airplane-pairs') picked = findAirplane(groups, analysis.rank, analysis.chainLength || 2, 2);
    else if (analysis.type === 'four-two-singles') picked = findFourWith(groups, analysis.rank, 1);
    else if (analysis.type === 'four-two-pairs') picked = findFourWith(groups, analysis.rank, 2);
    else if (analysis.type === 'bomb') picked = pickNOfKind(groups, 4, analysis.rank, false);
    else if (analysis.type === 'rocket') picked = [];

    if (picked && picked.length > 0) return picked;
    if ((options.allowPower || shouldUsePowerPlayHint(analysis)) && !options.suppressPower) {
      var bomb = pickNOfKind(groups, 4, 0, false);
      if (bomb && bomb.length > 0 && analysis.type !== 'bomb') return bomb;
      var rocket = pickRocket(groups);
      if (rocket && rocket.length > 0 && analysis.type !== 'rocket') return rocket;
    }
    return [];
  }

  function sortAsc (cards) {
    return (cards || []).slice().sort(function (a, b) { return a.rank - b.rank || String(a.id).localeCompare(String(b.id)); });
  }

  function groupByRank (cards) {
    var map = {};
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].rank;
      if (!map[r]) map[r] = [];
      map[r].push(cards[i]);
    }
    var keys = Object.keys(map).map(function (k) { return parseInt(k, 10); }).sort(function (a, b) { return a - b; });
    var groups = [];
    for (var j = 0; j < keys.length; j++) {
      groups.push({ rank: keys[j], cards: map[keys[j]].slice().sort(function (a, b) { return String(a.id).localeCompare(String(b.id)); }) });
    }
    return groups;
  }

  function selectCards (cards) {
    _selectedCardIds = {};
    for (var i = 0; i < cards.length; i++) {
      if (cards[i]) _selectedCardIds[cards[i].id] = true;
    }
  }

  function describePlay (play) {
    if (!play) return '';
    var cards = play.cards || [];
    if (cards.length > 0) return describeCards(cards);
    var analysis = play.analysis || play;
    var typeName = analysis && analysis.label ? analysis.label : getPlayTypeLabel(analysis && analysis.type);
    var rankText = analysis && analysis.rank ? rankLabel(analysis.rank) : '';
    return typeName + (rankText ? rankText : '');
  }

  function describeCards (cards) {
    if (!cards || cards.length === 0) return '';
    var analysis = M3.Rule && M3.Rule.analyzePlay ? M3.Rule.analyzePlay(cards) : null;
    var labels = sortAsc(cards).map(function (card) { return cardLabel(card); }).join(' ');
    if (analysis && analysis.label) return analysis.label + '（' + labels + '）';
    return '（' + labels + '）';
  }

  function getPlayTypeLabel (type) {
    var labels = M3.Rule && M3.Rule.PLAY_LABELS ? M3.Rule.PLAY_LABELS : {};
    return labels[type] || '牌';
  }

  function rankLabel (rank) {
    var labels = M3.Config && M3.Config.RANK_LABELS ? M3.Config.RANK_LABELS : null;
    if (labels && labels[rank]) return labels[rank];
    var fallback = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' };
    return fallback[rank] || String(rank || '');
  }

  function cardLabel (card) {
    if (!card) return '';
    var suit = '';
    if (M3.Deck && M3.Deck.suitSymbol) suit = M3.Deck.suitSymbol(card) || '';
    return (suit || '') + (card.label || rankLabel(card.rank));
  }

  function pickSingle (groups, minRank, preferSolo, avoidBomb, preferHigh) {
    var candidates = [];
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].rank > minRank && (!avoidBomb || groups[i].cards.length < 4)) candidates.push(groups[i]);
    }
    candidates.sort(function (a, b) { return preferHigh ? b.rank - a.rank : a.rank - b.rank; });
    for (var j = 0; preferSolo && j < candidates.length; j++) {
      if (candidates[j].cards.length === 1) return [candidates[j].cards[0]];
    }
    return candidates.length > 0 ? [candidates[0].cards[0]] : [];
  }

  function pickNOfKind (groups, n, minRank, avoidBomb) {
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].rank > minRank && groups[i].cards.length >= n && (!avoidBomb || groups[i].cards.length < 4)) {
        return groups[i].cards.slice(0, n);
      }
    }
    return [];
  }

  function pickTripleWith (groups, minRank, wingCount) {
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.rank <= minRank || g.cards.length < 3 || g.cards.length >= 4) continue;
      var triple = g.cards.slice(0, 3);
      var wing = [];
      for (var j = 0; j < groups.length; j++) {
        var w = groups[j];
        if (w.rank === g.rank || w.cards.length >= 4) continue;
        if (wingCount === 1 && w.cards.length >= 1) { wing = [w.cards[0]]; break; }
        if (wingCount === 2 && w.cards.length >= 2) { wing = w.cards.slice(0, 2); break; }
      }
      if (wing.length === wingCount) return triple.concat(wing);
    }
    return [];
  }

  function findAirplane (groups, minRank, chainLength, wingCount) {
    var triples = groups.filter(function (g) { return g.rank < 15 && g.cards.length >= 3 && g.cards.length < 4; });
    var requiredLength = chainLength || 0;
    for (var start = 0; start < triples.length; start++) {
      var chain = [triples[start]];
      for (var i = start + 1; i < triples.length; i++) {
        if (triples[i].rank === chain[chain.length - 1].rank + 1) chain.push(triples[i]);
        else if (triples[i].rank > chain[chain.length - 1].rank + 1) break;
      }
      for (var len = chain.length; len >= 2; len--) {
        if (requiredLength && len !== requiredLength) continue;
        for (var offset = 0; offset + len <= chain.length; offset++) {
          var segment = chain.slice(offset, offset + len);
          var high = segment[segment.length - 1].rank;
          if (high <= minRank) continue;
          var mainRanks = {};
          for (var r = 0; r < segment.length; r++) mainRanks[segment[r].rank] = true;
          var wings = pickAirplaneWings(groups, mainRanks, len, wingCount);
          if (wings.length === len * wingCount) {
            var main = [];
            for (var m = 0; m < segment.length; m++) main = main.concat(segment[m].cards.slice(0, 3));
            return main.concat(wings);
          }
        }
      }
    }
    return [];
  }

  function pickAirplaneWings (groups, mainRanks, chainLength, wingCount) {
    if (wingCount === 0) return [];
    var picked = [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (mainRanks[g.rank] || g.cards.length >= 4) continue;
      if (wingCount === 1 && g.cards.length >= 1) picked.push(g.cards[0]);
      if (wingCount === 2 && g.cards.length >= 2) picked = picked.concat(g.cards.slice(0, 2));
      if (picked.length >= chainLength * wingCount) return picked.slice(0, chainLength * wingCount);
    }
    return [];
  }

  function findFourWith (groups, minRank, wingMode) {
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.rank <= minRank || g.cards.length < 4) continue;
      var wings = pickFourWings(groups, g.rank, wingMode);
      if (wings.length === (wingMode === 2 ? 4 : 2)) return g.cards.slice(0, 4).concat(wings);
    }
    return [];
  }

  function pickFourWings (groups, mainRank, wingMode) {
    var picked = [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g.rank === mainRank || g.cards.length >= 4) continue;
      if (wingMode === 1 && g.cards.length >= 1) picked.push(g.cards[0]);
      if (wingMode === 2 && g.cards.length >= 2) picked = picked.concat(g.cards.slice(0, 2));
      if (picked.length >= (wingMode === 2 ? 4 : 2)) return picked.slice(0, wingMode === 2 ? 4 : 2);
    }
    return [];
  }

  function pickStraight (groups, minRank, chainLength, eachCount) {
    var minLen = eachCount === 1 ? 5 : 3;
    if (!chainLength || chainLength < minLen) return [];
    var valid = groups.filter(function (g) { return g.rank < 15 && g.cards.length >= eachCount; });
    for (var i = 0; i <= valid.length - chainLength; i++) {
      var ok = true;
      for (var j = 1; j < chainLength; j++) {
        if (valid[i + j].rank !== valid[i].rank + j) { ok = false; break; }
      }
      if (!ok) continue;
      var high = valid[i + chainLength - 1].rank;
      if (high <= minRank) continue;
      var picked = [];
      for (var k = 0; k < chainLength; k++) picked = picked.concat(valid[i + k].cards.slice(0, eachCount));
      return picked;
    }
    return [];
  }

  function pickRocket (groups) {
    var small = null, big = null;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].rank === 16) small = groups[i].cards[0];
      if (groups[i].rank === 17) big = groups[i].cards[0];
    }
    return small && big ? [small, big] : [];
  }
})();