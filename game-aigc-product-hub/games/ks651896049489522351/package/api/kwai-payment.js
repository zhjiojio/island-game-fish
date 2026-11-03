(function () {
  'use strict';

  var PAYMENT_WATCHDOG_MS = 120000;
  var FIELDS = ['zone_id', 'os', 'currency_type', 'buy_quantity', 'third_party_trade_no',
    'extension', 'product_type', 'goods_category', 'goods_name', 'sign'];

  function text (value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/[\r\n\t]/g, ' ').slice(0, 255);
  }

  function platform () {
    if (typeof ks === 'undefined' || !ks.getSystemInfoSync) return '';
    try {
      var info = ks.getSystemInfoSync() || {};
      var value = String(info.platform || '') + ' ' + String(info.system || '');
      if (/iphone|ipad|ios/i.test(value)) return 'ios';
      if (/android/i.test(value)) return 'android';
    } catch (e) {}
    return '';
  }

  function copyParams (input) {
    var output = {};
    input = input || {};
    for (var i = 0; i < FIELDS.length; i++) {
      var key = FIELDS[i];
      if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
      if (key === 'extension' && (input[key] === '' || input[key] === null || input[key] === undefined)) continue;
      if (key === 'product_type' && platform() !== 'ios') continue;
      output[key] = input[key];
    }
    return output;
  }

  function classify (err) {
    var code = text(err && (err.errCode !== undefined ? err.errCode : err.code));
    var message = text(err && (err.errMsg || err.message || err));
    var combined = (code + ' ' + message).toLowerCase();
    var cancel = /cancel|取消|canceled|cancelled|user_cancel/.test(combined);
    return { outcome: cancel ? 'cancel' : 'fail', code: code || (cancel ? 'USER_CANCELLED' : 'PLATFORM_FAIL'), message: message };
  }

  function unavailable () {
    return { outcome: 'fail', code: 'PAYMENT_API_UNAVAILABLE', message: '支付能力不可用' };
  }

  window.KwaiPayment = {
    isAvailable: function () {
      return !!(platform() && typeof ks !== 'undefined' && typeof ks.requestGamePayment === 'function');
    },
    getPlatform: platform,
    requestPayment: function (paymentParams) {
      return new Promise(function (resolve) {
        if (!(platform() && typeof ks !== 'undefined' && typeof ks.requestGamePayment === 'function')) { resolve(unavailable()); return; }
        var settled = false;
        var watchdog = setTimeout(function () {
          settle({ outcome: 'unknown', code: 'PAYMENT_CALLBACK_TIMEOUT', message: '支付结果未知，请稍后查询订单' });
        }, PAYMENT_WATCHDOG_MS);
        function settle (result) {
          if (settled) return;
          settled = true;
          clearTimeout(watchdog);
          resolve(result);
        }
        var options = copyParams(paymentParams);
        console.log('[KwaiPayment] requestGamePayment params:', JSON.stringify(options));
        options.success = function (res) {
          settle({ outcome: 'success', code: text(res && (res.errCode || res.code)) || 'SUCCESS', message: text(res && (res.errMsg || res.message)) });
        };
        options.fail = function (err) { settle(classify(err)); };
        options.complete = function (res) {
          if (!settled) {
            if (res && (res.errCode !== undefined || res.errMsg)) settle(classify(res));
            else settle({ outcome: 'unknown', code: 'PAYMENT_COMPLETE_UNKNOWN', message: '平台未返回明确支付结果' });
          }
        };
        try {
          ks.requestGamePayment(options);
        } catch (e) {
          settle({ outcome: 'unknown', code: text(e && (e.code || e.name)) || 'PAYMENT_EXCEPTION', message: text(e && e.message) });
        }
      });
    },
  };
})();
