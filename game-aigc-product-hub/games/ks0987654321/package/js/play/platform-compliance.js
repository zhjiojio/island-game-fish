(function () {
  var M3 = window.M3;
  var PRIVACY_POLICY_URL = '';
  function call(name, fallback) {
    try { if (typeof kwaigame !== 'undefined' && typeof kwaigame[name] === 'function') return kwaigame[name](); } catch (e) { console.warn('Compliance', name + ' 调用失败'); }
    if (fallback) fallback(); return null;
  }
  M3.Compliance = {
    PRIVACY_POLICY_URL: PRIVACY_POLICY_URL,
    openPrivacyPolicy: function () { return PRIVACY_POLICY_URL; },
    requestRealNameAuth: function () { return call('requestRealNameAuth'); },
    getAntiAddictionInfo: function () { return call('getAntiAddictionInfo'); },
    openCustomerServicePage: function () { return call('openCustomerServicePage'); }
  };
})();
