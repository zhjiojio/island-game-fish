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
  // 一个实例、一个在途请求、一次结算。SDK 监听只注册一次，不能让后一次点击
  // 覆盖正在播放的广告回调，也不能让迟到的 error 抢先吞掉真实完播的 close。
  var _rewardedCb   = null;
  var _rewardedLifecycleBound = false;
  var _rewardedHidden = false;

  // ─── 内部工具 ──────────────────────────────────────────────

  function _config() {
    return (typeof KwaiAdConfig !== 'undefined' && KwaiAdConfig) || {};
  }
  function _adminBypass() {
    return (typeof AdminAdControl !== 'undefined' && AdminAdControl.isBypassed() === true)
      || (typeof GameGlobal !== 'undefined' && GameGlobal.state && GameGlobal.state.sessionAdBypass === true)
      || (typeof window !== 'undefined' && window.state && window.state.sessionAdBypass === true);
  }

  function _canShowInterstitial() {
    var now = Date.now();
    return (now - _startTime >= COLD_START_MS)
        && (_lastAdTime === 0 || now - _lastAdTime >= INTERSTITIAL_INTERVAL_MS);
  }

  // ─── 激励视频 ──────────────────────────────────────────────

  function _finishRewarded(request, rewarded, error) {
    if (!request || request !== _rewardedCb || request.done) return;
    request.done = true;
    clearTimeout(request.errorTimer);
    clearTimeout(request.loadingTimer);
    clearTimeout(request.returnTimer);
    _rewardedCb = null;
    if (rewarded) { if (request.onRewarded) request.onRewarded(); }
    else { if (request.onCancel) request.onCancel(error); }
  }

  function _rewardedError(request, err, reason) {
    if (!request || request !== _rewardedCb || request.done) return;
    // show 已成功或广告正在前台之上播放时，close 才是是否完播的依据。
    // 某些容器会在关闭广告/预取下一条素材时发出 error，不能覆盖本次播放结果。
    if (request.shown || _rewardedHidden) return;
    clearTimeout(request.errorTimer);
    request.errorTimer = setTimeout(function () {
      if (request.shown || _rewardedHidden) return;
      _finishRewarded(request, false, {
        reason: reason || 'show_fail',
        errCode: err && err.errCode,
        errMsg: err && err.errMsg
      });
    }, 250);
  }

  function _bindRewardedLifecycle() {
    if (_rewardedLifecycleBound) return;
    _rewardedLifecycleBound = true;
    if (typeof ks.onHide === 'function') ks.onHide(function () {
      _rewardedHidden = true;
      if (!_rewardedCb) return;
      _rewardedCb.leftGame = true;
      clearTimeout(_rewardedCb.loadingTimer);
      clearTimeout(_rewardedCb.errorTimer);
      clearTimeout(_rewardedCb.returnTimer);
    });
    if (typeof ks.onShow === 'function') ks.onShow(function () {
      _rewardedHidden = false;
      var request = _rewardedCb;
      if (!request || !request.leftGame) return;
      request.leftGame = false;
      // 只在返回游戏后恢复丢回调保护，不把后台播放时长当成加载超时。
      // 给不同容器中 onShow / onClose 的先后差异留出窗口。
      clearTimeout(request.returnTimer);
      request.returnTimer = setTimeout(function () {
        _finishRewarded(request, false, { reason: 'close_timeout' });
      }, 8000);
    });
  }

  function _initRewardedAd() {
    var adUnitId = _config().rewardedAdUnitId;
    if (typeof ks === 'undefined') {
      console.warn('[KwaiAd] 非快手环境，跳过激励广告初始化');
      return;
    }
    if (!adUnitId) return;
    _bindRewardedLifecycle();
    _rewardedAd = ks.createRewardedVideoAd({ adUnitId: adUnitId });
    _rewardedAd.onError(function (err) {
      console.warn('[KwaiAd] 激励广告错误', err && err.errMsg);
      _rewardedError(_rewardedCb, err, 'show_fail');
    });
    // onClose 仅此一次注册；每次 show 只更新 _rewardedCb 引用
    _rewardedAd.onClose(function (res) {
      _lastAdTime = Date.now();
      _finishRewarded(_rewardedCb, !!(res && res.isEnded === true), { reason: 'not_finished' });
    });
  }

  /**
   * 展示激励广告
   * @param {Function} onRewarded - 用户看完（isEnded=true），在此发放奖励
   * @param {Function} [onCancel] - 用户中途关闭（isEnded=false），不发奖励
   */
  function showRewarded(onRewarded, onCancel) {
    if (_rewardedCb) {
      if (onCancel) onCancel({ reason: 'busy' });
      return;
    }
    if (_adminBypass()) {
      var bypassRequest = _rewardedCb = {
        onRewarded: onRewarded || null, onCancel: onCancel || null,
        done: false, shown: false, leftGame: false,
        errorTimer: null, loadingTimer: null, returnTimer: null
      };
      setTimeout(function () {
        if (bypassRequest !== _rewardedCb || bypassRequest.done) return;
        if (_adminBypass()) _finishRewarded(bypassRequest, true);
        else {
          _rewardedCb = null;
          showRewarded(onRewarded, onCancel);
        }
      }, 0);
      return;
    }
    try { if (!_rewardedAd) _initRewardedAd(); }
    catch (err) {
      _rewardedAd = null;
      if (onCancel) onCancel({ reason: 'no_ad_instance', errMsg: err && err.message });
      return;
    }
    if (!_rewardedAd) { if (onCancel) onCancel({ reason: 'no_ad_instance' }); return; }

    var current = _rewardedCb = {
      onRewarded: onRewarded || null, onCancel: onCancel || null,
      done: false, shown: false, leftGame: false,
      errorTimer: null, loadingTimer: null, returnTimer: null
    };
    try {
      var showing = _rewardedAd.show();
      if (showing && typeof showing.then === 'function') {
        // 仅限制仍未 show 成功的前台加载；成功后不限制广告播放时长。
        if (!current.done && !_rewardedHidden) current.loadingTimer = setTimeout(function () {
          if (!current.shown && !_rewardedHidden) _finishRewarded(current, false, { reason: 'timeout' });
        }, 30000);
        showing.then(function () {
          if (current !== _rewardedCb || current.done) return;
          current.shown = true;
          clearTimeout(current.loadingTimer);
          clearTimeout(current.errorTimer);
        }, function (err) { _rewardedError(current, err, 'show_fail'); });
      } else if (showing && typeof showing.catch === 'function') {
        showing.catch(function (err) { _rewardedError(current, err, 'show_fail'); });
      }
    } catch (err) { _rewardedError(current, err, 'show_throw'); }
  }

  // ─── 插屏广告 ──────────────────────────────────────────────

  function _doShowInterstitial(onClose) {
    if (_adminBypass()) { if (onClose) onClose(); return; }
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
    if (_adminBypass()) {
      setTimeout(function () {
        if (_adminBypass()) { if (onClose) onClose(); }
        else showInterstitial(onClose);
      }, 0);
      return;
    }
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
    if (_bannerClosed || _adminBypass()) return;

    function doShow() {
      if (_adminBypass()) return;
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
    isRewardedPending: function () { return !!_rewardedCb; },
    isRewardedShowing: function () { return !!(_rewardedCb && (_rewardedCb.shown || _rewardedHidden)); },
    showInterstitial:  showInterstitial,
    showBanner:        showBanner,
    hideBanner:        hideBanner,
    onBannerUserClose: onBannerUserClose,
  };

})();
