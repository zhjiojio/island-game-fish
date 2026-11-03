// js/kwai-ad-config.js（最先加载，在 kwai-event-bus.js 之后）
// 广告位 ID 统一来自 core/product.config.js（PRODUCT_CONFIG.adUnit），避免和
// core/config.js 里的 CONFIG.AD_UNIT 出现两套不一致的配置。
// 注意：本文件必须在 core/product.config.js 之后加载。
(function () {
  var adUnit = (window.PRODUCT_CONFIG && window.PRODUCT_CONFIG.adUnit) || {};
  window.KwaiAdConfig = {
    rewardedAdUnitId:     adUnit.rewarded     || '__REWARDED_AD_UNIT_ID__',
    interstitialAdUnitId: adUnit.interstitial || '__INTERSTITIAL_AD_UNIT_ID__',
    bannerAdUnitId:       adUnit.banner       || '__BANNER_AD_UNIT_ID__'
  };
})();
