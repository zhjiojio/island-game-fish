(function () {
  window.PRIVACY_POLICY_URL = '__PRIVACY_POLICY_URL__';
  // Vibration moved to the standard api/kwai-device.js module (KwaiDevice).
  window.KwaiBase = {
    getSystemInfo: function () { return typeof ks !== 'undefined' && ks.getSystemInfoSync ? ks.getSystemInfoSync() : {}; },
    onHide: function (fn) { if (typeof ks !== 'undefined' && ks.onHide) ks.onHide(fn); },
    onShow: function (fn) { if (typeof ks !== 'undefined' && ks.onShow) ks.onShow(fn); },
    requestRealNameAuth: function () { if (typeof kwaigame !== 'undefined' && kwaigame.requestRealNameAuth) { kwaigame.requestRealNameAuth(); return true; } return false; },
    getAntiAddictionInfo: function () { if (typeof kwaigame !== 'undefined' && kwaigame.getAntiAddictionInfo) return kwaigame.getAntiAddictionInfo(); return null; },
    openCustomerServicePage: function () { if (typeof kwaigame !== 'undefined' && kwaigame.openCustomerServicePage) { kwaigame.openCustomerServicePage(); return true; } return false; }
  };
}());
