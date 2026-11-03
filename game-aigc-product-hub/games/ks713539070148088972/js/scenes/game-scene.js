/**
 * scenes/game-scene.js — 游戏场景外壳（委托给 PlayController）
 * 注意：实际渲染和逻辑全部在 PlayController 和 mode 里，此处只是 SceneManager 的胶水
 */
(function () {
  'use strict';

  // ── 游戏页关键 UI 素材清单（单一数据源） ────────────────────────────────
  // 同 home.js 的 _criticalAssetSrcs：抽成独立函数供 welcome.js 提前预热，
  // 避免玩家第一次从首页点进关卡时，这些图才刚发起请求导致的空白/占位。
  var _CRITICAL_ASSET_KEYS = ['mnvPageBg', 'mnvBtnBack',
    'gameNavLeft', 'gameNavRight',
    'btnAddDesktop', 'mnvIconCorrect', 'mnvIconWrong'];

  function _criticalAssetSrcs() {
    var srcs = [];
    var seen = {};
    _CRITICAL_ASSET_KEYS.forEach(function (key) {
      var src = CONFIG.uiAsset(key);
      if (src && !seen[src]) { seen[src] = true; srcs.push(src); }
    });
    return srcs;
  }

  // 供 welcome.js 的欢迎页加载条提前预热游戏页素材（见 welcome.js criticalAssets）
  window.GameSceneAssets = {
    criticalAssetSrcs: _criticalAssetSrcs
  };

  SceneManager.register('game', {
    enter: function (data) {
      // 正常情况下 welcome.js 的加载条早已把这批图预加载完，这里只是兜底
      // 再发一轮（TextureManager 内部按 src 去重，已缓存的直接命中）。
      _criticalAssetSrcs().forEach(function (src) {
        TextureManager.load(src);
      });
    },
    exit: function () {},
    update: function (dt) {
      PlayController.update(dt);
    },
    draw: function () {
      PlayController.draw();
      UIKit.drawToasts();
      var adArea = UIKit.drawAdLoading();
      if (adArea) InputManager.add(adArea);
    }
  });
})();
