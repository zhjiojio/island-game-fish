// 用户资料与剧情入口解耦：启动恢复已授权资料，用户点击时才申请新授权。
// 公开昵称/头像不作为管理员凭证，也不保存或打印临时 login code。
(function (global) {
  'use strict';
  function create(options) {
    options = options || {};
    var api = options.api;
    var changed = options.onChange || function () {};
    var later = options.setTimer || setTimeout;
    var cancel = options.clearTimer || clearTimeout;
    var user = { nickName: '', avatarUrl: '', logging: false, status: 'idle' };
    var request = null, generation = 0;
    function publish(next) { user = next; changed(user); }
    function load(interactive, success, failure) {
      if (user.status === 'ready' || user.status === 'preview') {
        if (success) success(user);
        return;
      }
      if (request) {
        request.interactive = request.interactive || !!interactive;
        request.waiters.push({ success: success, failure: failure });
        return;
      }
      if (!api) {
        publish({ nickName: '预览玩家', avatarUrl: '', logging: false, status: 'preview', mock: true });
        if (success) success(user);
        return;
      }
      var run = request = { id: ++generation, interactive: !!interactive, waiters: [{ success: success, failure: failure }] };
      function active() { return request === run && run.id === generation; }
      function finish(status, info) {
        if (!active()) return;
        cancel(run.timer);
        request = null;
        var ok = status === 'ready';
        publish({ nickName: ok ? info.nickName || info.nickname || info.userName || '快手用户' : '',
          avatarUrl: ok ? info.avatarUrl || info.avatar || info.headImgUrl || '' : '',
          logging: false, status: status });
        run.waiters.forEach(function (w) {
          var fn = ok ? w.success : w.failure;
          if (fn) { try { fn(ok ? user : { reason: status }); } catch (_) {} }
        });
      }
      // 平台异常不阻断剧情；迟到回调不能覆盖后续重试结果。
      run.timer = later(function () { finish('timeout'); }, 15000);
      publish({ nickName: '', avatarUrl: '', logging: true, status: 'loading' });
      function invoke(name, params, onSuccess, onFail) {
        if (!active()) return;
        if (typeof api[name] !== 'function') { onFail({ reason: 'unsupported' }); return; }
        var done = false;
        params.success = function (value) { if (active() && !done) { done = true; onSuccess(value || {}); } };
        params.fail = function (error) { if (active() && !done) { done = true; onFail(error || {}); } };
        try { api[name](params); } catch (error) { params.fail(error); }
      }
      function getInfo() {
        invoke('getUserInfo', { withCredentials: true, lang: 'zh_CN' }, function (res) {
          if (!res.userInfo) { finish('error'); return; }
          finish('ready', res.userInfo);
        }, function () { finish('error'); });
      }
      function authorize() {
        if (!run.interactive) { finish('needs_authorization'); return; }
        invoke('authorize', { scope: 'scope.userInfo' }, getInfo, function () { finish('denied'); });
      }
      function settings() {
        invoke('getSetting', {}, function (res) {
          if (res.authSetting && res.authSetting['scope.userInfo'] === true) getInfo();
          else authorize();
        }, function () {
          // 旧客户端没有 getSetting：静默尝试已授权资料，拒绝后等用户主动重试。
          if (run.interactive) authorize();
          else getInfo();
        });
      }
      function login() {
        invoke('login', {}, function () { settings(); }, function () { finish('error'); });
      }
      invoke('checkSession', {}, settings, login);
    }
    function reset() {
      generation++;
      if (request) cancel(request.timer);
      request = null;
      publish({ nickName: '', avatarUrl: '', logging: false, status: 'idle' });
    }
    return { load: load, reset: reset, get: function () { return user; } };
  }
  global.UserProfile = { create: create };
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis));
