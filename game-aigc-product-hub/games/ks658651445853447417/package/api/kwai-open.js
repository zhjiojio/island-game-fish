/**
 * kwai-open.js — 快手小游戏开放接口模块（登录 / 用户信息 / 授权 / Feed）
 *
 * 使用方式：
 *   // 登录
 *   KwaiOpen.login({
 *     onSuccess: function(res) { console.log('code:', res.code); },
 *     onFail:    function(err) {},
 *   });
 *
 *   // 校验登录态
 *   KwaiOpen.checkSession({
 *     onSuccess: function() { console.log('session 有效'); },
 *     onFail:    function() { console.log('session 已过期'); },
 *   });
 *
 *   // 获取用户信息
 *   KwaiOpen.getUserInfo({
 *     onSuccess: function(res) { console.log(res.userInfo); },
 *     onFail:    function(err) {},
 *   });
 *
 *   // 发起授权
 *   KwaiOpen.authorize({
 *     scope:     'scope.userInfo',
 *     onSuccess: function() {},
 *     onFail:    function(err) {},
 *   });
 *
 *   // 查询授权状态
 *   KwaiOpen.getSetting({
 *     onSuccess: function(res) { console.log(res.authSetting); },
 *     onFail:    function(err) {},
 *   });
 *
 *   // 监听 / 取消监听 Feed 状态变化
 *   KwaiOpen.onFeedStatusChange(function(res) { console.log(res.type); });
 *   KwaiOpen.offFeedStatusChange(callback);
 *
 * onFeedStatusChange res.type 说明：
 *   feedEnter   进入 Feed 流
 *   feedExit    离开 Feed 流
 */

(function () {

  function login(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiOpen] 非快手环境，跳过 login');
      onFail({ errMsg: '非快手环境' });
      return;
    }

    ks.login({
      success: function (res) {
        console.log('[KwaiOpen] 登录成功 code:', res.code);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiOpen] 登录失败', err.errMsg);
        onFail(err);
      },
    });
  }

  function checkSession(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiOpen] 非快手环境，跳过 checkSession');
      onFail({ errMsg: '非快手环境' });
      return;
    }

    ks.checkSession({
      success: function () {
        console.log('[KwaiOpen] session 有效');
        onSuccess();
      },
      fail: function (err) {
        console.log('[KwaiOpen] session 已过期', err);
        onFail(err);
      },
    });
  }

  function getUserInfo(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiOpen] 非快手环境，跳过 getUserInfo');
      onFail({ errMsg: '非快手环境' });
      return;
    }

    ks.getUserInfo({
      success: function (res) {
        console.log('[KwaiOpen] 获取用户信息成功', res.userInfo);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiOpen] 获取用户信息失败', err);
        onFail(err);
      },
    });
  }

  function authorize(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiOpen] 非快手环境，跳过 authorize');
      onFail({ errMsg: '非快手环境' });
      return;
    }

    ks.authorize({
      scope: options.scope,
      success: function (res) {
        console.log('[KwaiOpen] 授权成功 scope:', options.scope, res);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiOpen] 授权失败 scope:', options.scope, err);
        onFail(err);
      },
    });
  }

  function getSetting(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiOpen] 非快手环境，跳过 getSetting');
      onFail({ errMsg: '非快手环境' });
      return;
    }

    ks.getSetting({
      success: function (res) {
        console.log('[KwaiOpen] 获取设置成功', res.authSetting);
        onSuccess(res);
      },
      fail: function (err) {
        console.warn('[KwaiOpen] 获取设置失败', err);
        onFail(err);
      },
    });
  }

  function onFeedStatusChange(callback) {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiOpen] 非快手环境，跳过 onFeedStatusChange');
      return;
    }
    if (typeof ks.onFeedStatusChange !== 'function') {
      console.warn('[KwaiOpen] onFeedStatusChange 不支持（需 >= 14.4.10）');
      return;
    }
    ks.onFeedStatusChange(callback);
  }

  function offFeedStatusChange(callback) {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiOpen] 非快手环境，跳过 offFeedStatusChange');
      return;
    }
    if (typeof ks.offFeedStatusChange !== 'function') {
      console.warn('[KwaiOpen] offFeedStatusChange 不支持（需 >= 14.4.10）');
      return;
    }
    ks.offFeedStatusChange(callback);
  }

  window.KwaiOpen = {
    login:               login,
    checkSession:        checkSession,
    getUserInfo:         getUserInfo,
    authorize:           authorize,
    getSetting:          getSetting,
    onFeedStatusChange:  onFeedStatusChange,
    offFeedStatusChange: offFeedStatusChange,
  };

})();
