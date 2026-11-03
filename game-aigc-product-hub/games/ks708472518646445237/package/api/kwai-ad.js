/**
 * kwai-ad.js — 快手小游戏广告统一管理（激励视频 + 插屏 + Banner）
 *
 * 广告位 ID 自动从 window.KwaiAdConfig 读取（由脚手架阶段写入 kwai-ad-config.js）。
 *
 * 使用方式（main.js 或游戏入口）：
 *
 *   // 关卡失败 → 展示激励广告（复活/奖励）
 *   KwaiAd.showRewarded(
 *     function () { revivePlayer(); },   // 用户看完，发放奖励
 *     function () { confirmGameOver(); } // 用户中途关闭，不发奖励
 *   );
 *
 *   // 关卡完成 → 展示插屏（含频控，频控未满足时直接执行回调）
 *   KwaiAd.showInterstitial(function () { loadNextLevel(); });
 *
 *   // 进入菜单 / 结算页 → 展示 Banner
 *   KwaiAd.showBanner(function (h) { adjustLayoutForBanner(h); });
 *
 *   // 游戏开始 / 进入关卡 → 隐藏 Banner
 *   KwaiAd.hideBanner();
 *
 *   // 用户手动关闭 Banner 按钮时调用（本次启动不再展示）
 *   KwaiAd.onBannerUserClose();
 *
 * 频控规则（官方）：
 *   - 冷启动 30 秒内禁止插屏 / Banner（代码默认 32 秒含缓冲）
 *   - 插屏：上次任意广告结束 60 秒内不可重复（代码默认 62 秒）
 *   - Banner：adIntervals 最小 30 秒；用户关闭后本次不再展示
 */

(function () {

  var COLD_START_MS            = 32000;
  var INTERSTITIAL_INTERVAL_MS = 62000;
  var BANNER_REFRESH_MS        = 35000;

  var _startTime    = Date.now();
  var _lastAdTime   = 0;
  var _bannerAd     = null;
  var _bannerClosed = false;
  var _rewardedAd   = null;

  // ─── 内部工具 ──────────────────────────────────────────────

  function _config() {
    return (typeof KwaiAdConfig !== 'undefined' && KwaiAdConfig) || {};
  }

  function _canShowInterstitial() {
    var now = Date.now();
    return (now - _startTime >= COLD_START_MS)
        && (_lastAdTime === 0 || now - _lastAdTime >= INTERSTITIAL_INTERVAL_MS);
  }

  // ─── 激励视频 ──────────────────────────────────────────────

  function _initRewardedAd() {
    var adUnitId = _config().rewardedAdUnitId;
    if (typeof ks === 'undefined') {
      console.warn('[KwaiAd] 非快手环境，跳过激励广告初始化');
      return;
    }
    if (!adUnitId) return;
    _rewardedAd = ks.createRewardedVideoAd({ adUnitId: adUnitId });
    _rewardedAd.onError(function (err) {
      console.warn('[KwaiAd] 激励广告错误', err && err.errMsg);
    });
  }

  /**
   * 展示激励广告
   * @param {Function} onRewarded - 用户看完（isEnded=true），在此发放奖励
   * @param {Function} [onCancel] - 用户中途关闭（isEnded=false），不发奖励
   */
  function showRewarded(onRewarded, onCancel) {
    if (!_rewardedAd) { _initRewardedAd(); }
    if (!_rewardedAd) { if (onCancel) onCancel(); return; }

    // 每次 show 前重新绑定 onClose，避免多次调用累积回调
    _rewardedAd.onClose(function (res) {
      _lastAdTime = Date.now();
      if (res && res.isEnded) { if (onRewarded) onRewarded(); }
      else { if (onCancel) onCancel(); }
    });
    // 先 load 拉流（若不支持则 show 时会自动加载），再 show
    var p;
    try { p = _rewardedAd.load && _rewardedAd.load(); } catch (e) {}
    if (p && typeof p.then === 'function') {
      p.then(function () {
        var q = _rewardedAd.show();
        if (q && typeof q.catch === 'function') q.catch(function (err) {
          console.warn('[KwaiAd] show 失败', err && err.errMsg);
          if (onCancel) onCancel();
        });
      }).catch(function (err) {
        console.warn('[KwaiAd] load 失败', err && err.errMsg);
        if (onCancel) onCancel();
      });
    } else {
      var r = _rewardedAd.show();
      if (r && typeof r.catch === 'function') r.catch(function (err) {
        console.warn('[KwaiAd] show 失败', err && err.errMsg);
        if (onCancel) onCancel();
      });
    }
  }

  // ─── 插屏广告 ──────────────────────────────────────────────

  function _doShowInterstitial(onClose) {
    var adUnitId = _config().interstitialAdUnitId;
    _lastAdTime = Date.now();
    var ad = ks.createInterstitialAd({ adUnitId: adUnitId });
    var done = function () { _lastAdTime = Date.now(); if (onClose) onClose(); };
    ad.onClose(done);
    ad.onError(function (err) {
      console.warn('[KwaiAd] 插屏广告错误', err && err.errMsg);
      done();
    });
    ad.show().catch(done);
  }

  /**
   * 展示插屏广告（含频控保护）
   * @param {Function} [onClose] - 广告关闭后回调；频控未满足时立即触发，不阻塞游戏流程
   */
  function showInterstitial(onClose) {
    var adUnitId = _config().interstitialAdUnitId;
    if (typeof ks === 'undefined') {
      console.warn('[KwaiAd] 非快手环境，跳过插屏广告');
      if (onClose) onClose();
      return;
    }
    if (!adUnitId) { if (onClose) onClose(); return; }

    if (!_canShowInterstitial()) {
      console.log('[KwaiAd] 插屏频控未满足，跳过');
      setTimeout(function () { if (onClose) onClose(); }, 50);
      return;
    }
    setTimeout(function () { _doShowInterstitial(onClose); }, 800);
  }

  // ─── Banner 广告 ──────────────────────────────────────────

  function _initBannerAd(onResize) {
    if (_bannerClosed) return;
    if (typeof ks === 'undefined') {
      console.warn('[KwaiAd] 非快手环境，跳过 Banner 广告初始化');
      return;
    }
    var adUnitId = _config().bannerAdUnitId;
    if (!adUnitId) return;

    var sys = ks.getSystemInfoSync();
    _bannerAd = ks.createBannerAd({
      adUnitId: adUnitId,
      adIntervals: 30,
      style: {
        left: 0,
        top: sys.windowHeight - 80,
        width: Math.max(308, sys.windowWidth),
      },
    });
    _bannerAd.onResize(function (res) {
      _bannerAd.style.top = sys.windowHeight - res.height;
      if (onResize) onResize(res.height);
    });
    _bannerAd.onError(function (err) {
      console.warn('[KwaiAd] Banner 广告错误', err && err.errMsg);
    });
  }

  /**
   * 展示 Banner 广告（进入菜单 / 结算页时调用）
   * 冷启动 32 秒内调用会延迟到满足条件后展示。
   * @param {Function} [onResize] - Banner 高度变化回调，用于调整游戏布局底部留白
   */
  function showBanner(onResize) {
    if (_bannerClosed) return;

    function doShow() {
      if (!_bannerAd) _initBannerAd(onResize);
      if (_bannerAd) { _bannerAd.hide(); _bannerAd.show(); }
    }

    var elapsed = Date.now() - _startTime;
    if (elapsed >= COLD_START_MS) {
      doShow();
    } else {
      setTimeout(doShow, COLD_START_MS - elapsed);
    }
  }

  /**
   * 隐藏 Banner 广告（游戏开始 / 进入关卡时调用）
   */
  function hideBanner() {
    if (_bannerAd) _bannerAd.hide();
  }

  /**
   * 用户手动关闭 Banner 后调用，本次启动不再展示
   */
  function onBannerUserClose() {
    _bannerClosed = true;
    if (_bannerAd) {
      _bannerAd.hide();
      _bannerAd.destroy();
      _bannerAd = null;
    }
  }

  // ─── Banner 定期刷新（非游戏态自动补漏，由调用方控制场景） ──
  // 如需自动刷新，在适当时机重复调用 showBanner() 即可，无需额外 setInterval。

  window.KwaiAd = {
    showRewarded:      showRewarded,
    showInterstitial:  showInterstitial,
    showBanner:        showBanner,
    hideBanner:        hideBanner,
    onBannerUserClose: onBannerUserClose,
  };

})();
