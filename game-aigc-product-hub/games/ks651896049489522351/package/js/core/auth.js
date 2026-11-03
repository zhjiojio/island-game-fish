(function () {
  var M3 = window.M3 = window.M3 || {};

  // ============================================================
  // 客户端登录认证模块
  // ------------------------------------------------------------
  // 职责边界（务必遵守）：
  //   1. 客户端**不再**自己决定 accountId —— 身份一律由服务端 auth 回包下发。
  //      历史实现在本地生成 guest_h5_xxx 并随每条消息上报，
  //      改一下 localStorage 就能接管他人钱包，已彻底移除。
  //   2. 本模块只负责三件事：
  //      · 维护设备标识 deviceId（游客身份的派生因子，服务端做 HMAC）
  //      · 维护服务端签发的 sessionToken（免重复登录）
  //      · 快手环境下取 ks.login 的 code，交给服务端换 openId
  // ============================================================

  var DEVICE_KEY = 'ddz_device_id';
  // 【token 分键存储】
  // 快手号与游客号是两个独立账号、两份钱包（当前不做资产迁移）。
  // 若共用一个 token 键，用户一旦因断网降级过游客，之后每次启动都会
  // resume 成游客，永远回不到快手号——表现为「钱包丢了」。
  var TOKEN_KEY_KWAI = 'ddz_session_token_kwai';
  var TOKEN_KEY_GUEST = 'ddz_session_token_guest';
  var TOKEN_KEY_LEGACY = 'ddz_session_token';

  var CLIENT_CAPABILITIES = ['voice_config_v2', 'voice_trade_v1'];
  var _identity = null;   // { accountId, loginType } —— 来自服务端 authOk
  var _pendingCode = '';  // 本次待上报的快手 code（一次性，用后即清）

  function readStorage (key) {
    try {
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.getSync) {
        return KwaiStorage.getSync(key) || '';
      }
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key) || '';
      }
    } catch (e) {}
    return '';
  }

  function writeStorage (key, value) {
    try {
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.setSync) {
        KwaiStorage.setSync(key, value);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch (e) {}
  }

  function removeStorage (key) {
    try {
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.removeSync) KwaiStorage.removeSync(key);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch (e) {}
  }

  // 设备标识：仅作为服务端派生游客 accountId 的输入因子。
  // 即使被他人获知也无法直接冒用——服务端会用自己的密钥做 HMAC，
  // 且正式环境（strict）根本不接受游客通道。
  function getDeviceId () {
    var id = readStorage(DEVICE_KEY);
    if (!id) {
      id = 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
      writeStorage(DEVICE_KEY, id);
    }
    return id;
  }

  function getSessionToken (loginType) {
    return readStorage(loginType === 'kwai' ? TOKEN_KEY_KWAI : TOKEN_KEY_GUEST);
  }

  function setSessionToken (token, loginType) {
    if (!token) return;
    writeStorage(loginType === 'kwai' ? TOKEN_KEY_KWAI : TOKEN_KEY_GUEST, token);
  }

  // 冷启动时 runtime identity 尚未建立（要等 WS authOk 下发），
  // 但存储里可能已有上一局签发的 sessionToken。HTTP 层在 identity 缺失时
  // 用它兜底，避免本地误判 UNAUTHENTICATED 而提前建一条 WS「拿 token」
  // ——那条连接随后必然被 ks.login 的 reconnectForAuth 拆掉重建，
  // 表现为一次启动两条「WS 连接成功」。
  function getStoredSession () {
    var kwai = readStorage(TOKEN_KEY_KWAI);
    if (kwai) return { token: kwai, loginType: 'kwai' };
    var guest = readStorage(TOKEN_KEY_GUEST);
    if (guest) return { token: guest, loginType: 'guest' };
    return null;
  }

  // 旧版本遗留的单一 token 键：迁移为游客 token。
  // 旧实现下只可能产生游客身份（快手登录从未真正可用），归为游客是安全的。
  function migrateLegacyToken () {
    var legacy = readStorage(TOKEN_KEY_LEGACY);
    if (!legacy) return;
    if (!readStorage(TOKEN_KEY_GUEST)) writeStorage(TOKEN_KEY_GUEST, legacy);
    removeStorage(TOKEN_KEY_LEGACY);
  }

  M3.Auth = {
    getDeviceId: getDeviceId,
    getSessionToken: getSessionToken,
    getStoredSession: getStoredSession,

    // 组装 auth 帧。通过显式 intent 告知服务端本次登录意图，
    // 避免服务端在 token / code 之间猜优先级（旧实现会让旧游客 token 抢占 code）。
    buildAuthPayload: function () {
      migrateLegacyToken();
      var payload = { type: 'auth', deviceId: getDeviceId(), capabilities: CLIENT_CAPABILITIES.slice() };

      // 意图 1：快手登录。持有新鲜 code 时优先级最高，且不携带任何 token。
      if (_pendingCode) {
        payload.intent = 'kwai_login';
        payload.code = _pendingCode;
        _pendingCode = '';   // code 一次性且有效期短，用后立即清除
        return payload;
      }

      // 意图 2：恢复快手登录态。官方要求自定义登录态有效时不重复调 ks.login，
      // 否则会白白刷新平台 session_key。
      var kwaiToken = getSessionToken('kwai');
      if (kwaiToken) {
        payload.intent = 'resume';
        payload.sessionToken = kwaiToken;
        return payload;
      }

      // 意图 3：游客。有游客 token 则复用，否则由服务端基于 deviceId 派生。
      payload.intent = 'guest';
      var guestToken = getSessionToken('guest');
      if (guestToken) payload.sessionToken = guestToken;
      return payload;
    },

    // 快手登录拿到的 code，在下一次 auth 帧随连接上报
    setPendingCode: function (code) {
      _pendingCode = String(code || '');
    },
    hasPendingCode: function () {
      return !!_pendingCode;
    },

    // 服务端 authOk 回包
    applyAuthResult: function (data) {
      if (!data) return;
      var loginType = data.loginType || '';
      if (data.sessionToken) setSessionToken(data.sessionToken, loginType);
      _identity = {
        accountId: data.accountId || '',
        loginType: loginType,
        authMode: data.authMode || '',
        guestAllowed: !!data.guestAllowed,
        enabledCapabilities: Array.isArray(data.enabledCapabilities) ? data.enabledCapabilities.slice() : [],
      };
      // 缓存服务端下发的配置值（比 main.js 的 Network.on handler 更早执行，不会丢失）
      if (data.shortcutRewardBeans) M3._shortcutRewardBeans = data.shortcutRewardBeans;
      return _identity;
    },

    getIdentity: function () { return _identity; },
    isGuest: function () { return !!(_identity && _identity.loginType === 'guest'); },

    // 认证失败：只清除已失效的那一份 token。
    // 不能一次性清光——否则游客 token 过期会连带删掉快手 token。
    // deviceId 保留是有意为之：清掉等于换新设备，会让游客白拿一份新手铁豆。
    clearSession: function (loginType) {
      if (loginType === 'kwai') {
        removeStorage(TOKEN_KEY_KWAI);
      } else if (loginType === 'guest') {
        removeStorage(TOKEN_KEY_GUEST);
      } else {
        removeStorage(TOKEN_KEY_KWAI);
        removeStorage(TOKEN_KEY_GUEST);
      }
      removeStorage(TOKEN_KEY_LEGACY);
      _identity = null;
      _pendingCode = '';
    },
  };
})();
