(function () {
  // 清单中的关卡 URL 优先；模板兼容未提供 URL 的清单。
  window.RUNTIME_CONFIG_BASE_URL = window.RUNTIME_CONFIG_BASE_URL || '';
  window.RUNTIME_CONFIG_ENDPOINTS = window.RUNTIME_CONFIG_ENDPOINTS || {
    manifestUrl: 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/ksgame_wolves/runtime-manifest.json',
    levelUrlTemplate: 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/ksgame_wolves/releases/ksgame-wolves-20261015-002/levels/{levelId}.json'
  };
})();
