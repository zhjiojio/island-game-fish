/**
 * game-http.js — 游戏大厅 HTTP 客户端（合并版）
 *
 * 自包含 HTTP 适配层，不依赖外部 KwaiNetwork 全局：
 *   - 快手小游戏：ks.request
 *   - Web 浏览器：fetch
 *
 * 公开 API（均返回 Promise）：
 *   M3.GameHttp.bootstrap()                  → GET  /api/v1/game/bootstrap
 *   M3.GameHttp.claim(type, extra?)           → POST /api/v1/game/claim
 *   M3.GameHttp.profile()                    → GET  /api/v1/game/profile
 *   M3.GameHttp.buySku(sku, requestId, src)  → POST /api/v1/game/sku/buy
 *
 * type 枚举: 'ad_reward' | 'share_reward' | 'bankrupt_relief' |
 *            'shortcut_reward' | 'newcomer_gift'
 */
(function () {
  'use strict';

  var M3 = window.M3 = window.M3 || {};
  var _isKwai = typeof ks !== 'undefined';

  // ─── 底层 HTTP 适配（Promise） ─────────────────────────────

  function _send(method, url, headers, body, timeout) {
    return new Promise(function (resolve, reject) {

      function onOk(statusCode, data) {
        if (statusCode >= 200 && statusCode < 300) {
          console.log('[GameHttp]', method, url, statusCode, JSON.stringify(data).slice(0, 400));
          resolve(data);
        } else {
          var error = (data && data.error) || {};
          console.warn('[GameHttp]', method, url, statusCode, JSON.stringify(error));
          reject({ code: error.code || ('HTTP_' + statusCode), message: error.message || '服务请求失败' });
        }
      }

      function onErr(msg) {
        console.warn('[GameHttp]', method, url, 'FAIL', msg);
        reject({ code: 'NETWORK_ERROR', message: String(msg || '网络请求失败') });
      }

      function parseData(raw) {
        if (typeof raw === 'string') { try { return JSON.parse(raw); } catch (e) { return {}; } }
        return raw || {};
      }

      if (_isKwai) {
        ks.request({
          url:      url,
          method:   method,
          data:     body || {},
          header:   headers,
          timeout:  timeout || 10000,
          success:  function (res) { onOk(res.statusCode, parseData(res.data)); },
          fail:     function (err) { onErr(err && err.errMsg); },
        });
      } else {
        var fetchOpts = { method: method, headers: headers };
        if (body) fetchOpts.body = JSON.stringify(body);
        fetch(url, fetchOpts).then(function (res) {
          var statusCode = res.status;
          return res.text().then(function (text) { onOk(statusCode, parseData(text)); });
        }).catch(function (err) { onErr(err && err.message); });
      }
    });
  }

  // ─── 鉴权 + 公共头组装 ────────────────────────────────────

  function _req(method, path, body) {
    return new Promise(function (resolve, reject) {
      var identity = M3.Auth && M3.Auth.getIdentity ? M3.Auth.getIdentity() : null;
      var token = identity && M3.Auth.getSessionToken ? M3.Auth.getSessionToken(identity.loginType) : '';
      if (!token && M3.Auth && M3.Auth.getStoredSession) {
        // 冷启动 identity 为空但存储里有上一局签发的 sessionToken：直接用它走
        // HTTP，不再本地误判 UNAUTHENTICATED → 提前 ensureSocket 建一条 WS
        // 去「拿 token」——那条连接随后必被 ks.login 的 reconnectForAuth
        // 拆掉重建（表现为启动期两条「WS 连接成功」）。
        // token 失效时服务端 401 仍走原有的 ensureSocket + 重试路径。
        var stored = M3.Auth.getStoredSession();
        if (stored) token = stored.token;
      }
      if (!token) {
        reject({ code: 'UNAUTHENTICATED', message: '未登录，请稍后再试' });
        return;
      }

      var headers = {
        'Authorization':        'Bearer ' + token,
        'X-Client-Capabilities': M3.GameHttp._capabilities,
      };
      if (body) headers['content-type'] = 'application/json';

      var baseUrl = String((M3.Config && M3.Config.HTTP_SERVER_URL) || '').replace(/\/$/, '');
      _send(method, baseUrl + path, headers, body || null, 10000).then(resolve).catch(reject);
    });
  }

  // ─── 公开 API ─────────────────────────────────────────────

  M3.GameHttp = {
    /** 透传给服务端的客户端能力集 */
    _capabilities: 'voice_config_v2,voice_trade_v1',

    /** 启动时一次拿齐所有数据 */
    bootstrap: function () {
      return _req('GET', '/api/v1/game/bootstrap');
    },

    /** 统一奖励领取 */
    claim: function (type, extra) {
      var body = { type: type };
      if (extra) Object.keys(extra).forEach(function (k) { body[k] = extra[k]; });
      return _req('POST', '/api/v1/game/claim', body);
    },

    updateProfile: function (nickname) {
      return _req('POST', '/api/v1/game/profile', { nickname: nickname });
    },

    /** 个人成就统计（仅在面板打开时调用） */
    profile: function () {
      return _req('GET', '/api/v1/game/profile');
    },

    /** 购买语音包 */
    buySku: function (sku, requestId, source) {
      return _req('POST', '/api/v1/game/sku/buy', {
        sku:       sku,
        requestId: requestId || '',
        source:    source    || '',
      });
    },
  };

})();
