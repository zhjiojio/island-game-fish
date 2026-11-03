/**
 * compliance.js — 平台合规能力预留。
 *
 * 这里只提供统一入口，不在启动时主动申请授权，也不采集或上报数据。
 * 隐私政策正式地址由发布配置注入，禁止把密钥或用户信息写入此文件。
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  var PRIVACY_POLICY_URL = '';

  function unavailable (options) {
    if (options && typeof options.fail === 'function') {
      options.fail({ errMsg: '当前环境暂不支持该能力' });
    }
  }

  function callKwai (method, options) {
    var api = typeof ks !== 'undefined' ? ks[method] : null;
    if (typeof api !== 'function') {
      unavailable(options);
      return false;
    }
    api.call(ks, options || {});
    return true;
  }

  M3.Compliance = {
    PRIVACY_POLICY_URL: PRIVACY_POLICY_URL,

    openPrivacyPolicy: function (options) {
      if (typeof ks !== 'undefined' && typeof ks.openPrivacyContract === 'function') {
        ks.openPrivacyContract(options || {});
        return true;
      }
      unavailable(options);
      return false;
    },

    requestRealNameAuth: function (options) {
      return callKwai('requestRealNameAuth', options);
    },

    getAntiAddictionInfo: function (options) {
      return callKwai('getAntiAddictionInfo', options);
    },

    openCustomerServicePage: function (options) {
      return callKwai('openCustomerServicePage', options);
    },
  };
})();
