/**
 * kwai-login.js — 快手小游戏用户登录模块
 *
 * 使用方式（main.js 或游戏入口）：
 *   KwaiLogin.init({
 *     onSuccess: function() { startGame(); },
 *     onFail:    function() { startGameAsGuest(); },
 *   });
 *
 * 【登录链路】（遵循快手小游戏登录指南）
 *   ks.login 只返回一次性 code，必须由服务端用 appId + appSecret 调
 *   code2Session 换取 open_id / session_key，再由服务端派生 accountId
 *   并签发自定义登录态（sessionToken）。
 *
 *   openId 与 session_key 全程不下发客户端：
 *   openId 是账号主键级凭证，缓存在客户端等于把身份交给客户端自证；
 *   session_key 是会话密钥，官方明确要求仅服务端保管。
 */

(function () {

  // 已持有有效的快手自定义登录态时，不应重复调用 ks.login。
  // 官方说明：ks.login 会刷新 session_key，导致服务端保存的旧值立即失效。
  function hasKwaiSession() {
    try {
      return !!(window.M3 && M3.Auth && M3.Auth.getSessionToken
        && M3.Auth.getSessionToken('kwai'));
    } catch (e) {
      return false;
    }
  }

  function requestLoginCode(onSuccess, onFail) {
    ks.login({
      success: function (res) {
        var code = res && res.code ? res.code : '';
        if (!code) {
          console.warn('[KwaiLogin] 未取到 code，转游客态');
          onFail();
          return;
        }
        console.log('[KwaiLogin] 已获取登录 code，交由服务端换取身份');

        if (window.M3 && M3.Auth && M3.Auth.setPendingCode) {
          M3.Auth.setPendingCode(code);
        }

        // 【关键】服务端禁止一条连接中途换号，因此不能只把 code 暂存等待「下一次」握手：
        // 若此刻已有连接（可能已认证为游客），必须主动重建连接，
        // 让首帧 auth 携带 code 完成快手身份认证，否则用户会一直停留在游客态。
        if (window.M3 && M3.Network && M3.Network.reconnectForAuth) {
          M3.Network.reconnectForAuth();
        }

        onSuccess();
      },
      fail: function (err) {
        console.warn('[KwaiLogin] 登录失败，以游客态继续', err && err.errMsg);
        onFail();
      },
    });
  }

  function init(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};
    // forceRelogin：用户在游客态主动点「快手登录」时置 true，跳过登录态复用
    var forceRelogin = !!options.forceRelogin;

    if (typeof ks === 'undefined') {
      console.warn('[KwaiLogin] 非快手环境，跳过登录');
      onFail();
      return;
    }

    // 自定义登录态仍在有效期内：直接复用，由 auth 握手 resume，
    // 既省一次网络往返，也避免无谓刷新平台 session_key。
    if (!forceRelogin && hasKwaiSession()) {
      console.log('[KwaiLogin] 复用已有快手登录态');
      onSuccess();
      return;
    }

    requestLoginCode(onSuccess, onFail);
  }

  window.KwaiLogin = { init: init };

})();
