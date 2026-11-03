(function () {
  'use strict';
  var M3 = window.M3 = window.M3 || {};

  function encode (value) { return encodeURIComponent(String(value || '')); }

  function request (method, path, options) {
    options = options || {};
    return new Promise(function (resolve, reject) {
      var identity = M3.Auth && M3.Auth.getIdentity ? M3.Auth.getIdentity() : null;
      var token = identity && M3.Auth.getSessionToken ? M3.Auth.getSessionToken(identity.loginType) : '';
      // catalog / balance 接口允许匿名；其他接口只要有 token 即放行，
      // loginType 由服务端判断（mock 模式下 guest 也能兑换）
      var isPublic = options.public === true;
      if (!isPublic && (!identity || !token)) {
        reject({ code: 'UNAUTHENTICATED', message: '请先登录' });
        return;
      }
      var headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;
      if (options.body) headers['content-type'] = 'application/json';
      if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
      KwaiNetwork.request({
        url: String(M3.Config.HTTP_SERVER_URL || '').replace(/\/$/, '') + path,
        method: method,
        data: options.body || {},
        header: headers,
        timeout: options.timeout || 10000,
        onSuccess: function (res) {
          var data = res && res.data || {};
          if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
          if (res.statusCode >= 200 && res.statusCode < 300) { resolve(data); return; }
          var error = data.error || {};
          reject({ code: error.code || 'HTTP_' + res.statusCode, message: error.message || '支付服务请求失败',
            exchangeOrderId: String(error.exchangeOrderId || ''), statusCode: res.statusCode });
        },
        onFail: function (err) {
          reject({ code: 'NETWORK_ERROR', message: String(err && err.errMsg || '网络请求失败') });
        },
      });
    });
  }

  M3.IapHttp = {
    request: function (type, data) {
      data = data || {};
      if (type === 'mockBuyIapOrder') return request('POST', '/api/v1/iap/mock-buy', { body: { skuId: data.skuId, requestId: data.requestId } });
      if (type === 'getIapCatalog') return request('GET', '/api/v1/iap/products?os=' + encode(data.os || 'android'), { public: true });
      if (type === 'createIapOrder') return request('POST', '/api/v1/iap/orders', { idempotencyKey: data.requestId, body: { skuId: data.skuId, os: data.os } });
      if (type === 'reportIapClientResult') return request('POST', '/api/v1/iap/orders/' + encode(data.orderId) + '/client-result', { body: { code: data.code, message: data.message } });
      if (type === 'getIapOrder') return request('GET', '/api/v1/iap/orders/' + encode(data.orderId));
      if (type === 'getPendingIapOrders') return request('GET', '/api/v1/iap/orders?status=pending');
      if (type === 'getPlatformCoinBalance') return request('GET', '/api/v1/platform-coins/balance?os=' + encode(data.os), { public: true });
      if (type === 'getPlatformCoinExchangeCatalog') return request('GET', '/api/v1/platform-coins/exchange-products', { public: true });
      if (type === 'createPlatformCoinExchange') return request('POST', '/api/v1/platform-coins/exchange-orders', { idempotencyKey: data.clientRequestId, body: { exchangeSkuId: data.exchangeSkuId, qty: data.qty || 1, os: data.os } });
      if (type === 'getPlatformCoinExchange') return request('GET', '/api/v1/platform-coins/exchange-orders/' + encode(data.exchangeOrderId));
      return Promise.reject({ code: 'UNSUPPORTED_IAP_COMMAND', message: '不支持的支付接口' });
    },
  };
})();
