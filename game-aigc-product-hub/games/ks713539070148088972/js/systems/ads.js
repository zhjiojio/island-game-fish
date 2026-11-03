/**
 * systems/ads.js — 广告统一入口
 * 职责：
 *   - 激励视频：loading 遮罩 + 8s 超时 + isEnded 校验 + 埋点
 *   - 插屏：频控（冷启 32s 内禁 / 间隔 62s）
 *   - 广告矩阵（跳关/提示/复活/解锁全部/解锁语音包/每日解锁主题）统一在此调用
 * 依赖：CONFIG, UIKit, Telemetry
 * 导出：Ads
 */
(function () {
  'use strict';

  var _rewardedAd = null;
  var _loading    = false;
  var _adShown    = false;  // 广告是否已成功展示（ad.show().then() 触发过）
  var _adShownTime = 0;     // 广告成功展示的时间戳（用于 onAppShow 兜底判断时长）
  var _pendingCb  = null;  // 当前广告请求的回调（供 onShow 兜底使用）
  var _watchTimer = null;  // onClose 丢失时的最终兜底计时器
  var _skipCount  = 0;  // 跳关连续观看计数

  // 插屏频控
  var _firstStartMs    = 0;
  // 注意：初始值不能是 0——M3._now() 用的是 performance.now()（相对页面加载
  // 时间，不是 epoch），若 _lastInterstitialMs 初始为 0，"距上次插屏 62s 间隔"
  // 的判断会在第一次插屏时错误生效（now - 0 < 62000 在页面加载 62s 内恒为
  // true），导致首条插屏被间隔频控误挡，而不是只受"冷启 32s 延迟"限制。用
  // -Infinity 表示"从未展示过插屏"，间隔判断自然不会拦截第一次。
  var _lastInterstitialMs = -Infinity;
  var INTERSTITIAL_COLD_DELAY = 32000;
  var INTERSTITIAL_INTERVAL   = 62000;

  function createRewarded() {
    var unitId = CONFIG.AD_UNIT.rewarded;
    if (typeof ks !== 'undefined' && ks.createRewardedVideoAd) {
      return ks.createRewardedVideoAd({ adUnitId: unitId });
    }
    if (typeof wx !== 'undefined' && wx.createRewardedVideoAd) {
      return wx.createRewardedVideoAd({ adUnitId: unitId });
    }
    return null;
  }

  var Ads = window.Ads = {

    init: function () {
      _firstStartMs = M3._now();
      _rewardedAd   = createRewarded();
    },

    /**
     * 展示激励视频广告
     * @param {Function} cb  function(ok: boolean)  ok=true 表示看完
     * @param {string} [slot]  埋点用途标识
     */
    showRewarded: function (cb, slot) {
      if (_loading) return; // 防重入

      // 广告会打断当前触摸；iOS 返回时不一定补发 touchend，先清理拖拽状态，
      // 避免广告结束后整个游戏继续被旧的 dragState 拦截。
      if (window.InputManager && InputManager.cancelDrag) InputManager.cancelDrag();

      // 开发期跳过广告：直接模拟"已看完"，不请求真实广告位
      if (CONFIG.DEV_SKIP_ADS) {
        console.warn('[Ads] DEV_SKIP_ADS=true，跳过广告直接判定成功（生产环境请勿开启）');
        _loading = true;
        UIKit.showAdLoading();
        setTimeout(function () { Ads._finish(cb, true, slot); }, 300);
        return;
      }

      _loading = true;
      _adShown = false;
      _pendingCb = cb;
      UIKit.showAdLoading();
      if (typeof Telemetry !== 'undefined') Telemetry.report(7021, { slot: slot || '' });

      var done = false;
      var ad   = _rewardedAd;
      if (!ad) {
        ad = _rewardedAd = createRewarded();
      }
      if (!ad) {
        // 浏览器 H5 调试环境没有小游戏广告实例，需要保留模拟成功能力，
        // 否则浏览器无法继续验证解锁后的流程；小游戏环境没有广告实例则必须失败。
        var isBrowserDebug = typeof document !== 'undefined' &&
          typeof ks === 'undefined' && typeof wx === 'undefined';
        setTimeout(function () { Ads._finish(cb, isBrowserDebug, slot); }, 800);
        return;
      }

      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        Ads._finish(cb, false, slot);
      }, CONFIG.AD_LOADING_TIMEOUT);

      function onClose(res) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        var ok = !!(res && res.isEnded);
        Ads._finish(cb, ok, slot);
      }

      // 卸载旧 handler 防重复绑定
      try { ad.offClose(); } catch(e) {}
      ad.onClose(onClose);

      ad.show().then(function () {
        clearTimeout(timer);
        _adShown = true;
        _adShownTime = M3._now();
        // 某些广告/宿主组合在提前退出时可能同时丢失 onClose 和后续 onShow。
        // 不能只依赖加载超时，否则 show 成功后加载计时器已被清掉，遮罩会永久存在。
        _watchTimer = setTimeout(function () {
          if (!_loading || !_pendingCb) return;
          console.warn('[Ads] onClose missing, watch timeout; force finishing');
          Ads._finish(_pendingCb, false, 'watch_timeout');
        }, CONFIG.AD_WATCH_TIMEOUT);
        if (typeof Telemetry !== 'undefined') Telemetry.report(7022, { slot: slot || '', result: 'ok' });
      }).catch(function (err) {
        clearTimeout(timer);
        if (!done) {
          done = true;
          Ads._finish(cb, false, slot);
        }
        // 广告实例可能在切后台/系统弹窗（如添加桌面）后失效，销毁旧实例
        // 强制下次重新创建，避免持续复用失效实例导致广告永远拉不起来
        _rewardedAd = null;
      });
    },

    /** @private */
    _finish: function (cb, ok, slot) {
      if (_watchTimer) {
        clearTimeout(_watchTimer);
        _watchTimer = null;
      }
      _loading = false;
      _adShown = false;
      _adShownTime = 0;
      _pendingCb = null;
      UIKit.hideAdLoading();
      if (typeof Telemetry !== 'undefined') {
        Telemetry.report(7023, { result: ok ? 'ended' : 'failed', slot: slot || '' });
        if (ok) Telemetry.report(7024, { slot: slot || '' });
      }
      if (cb) try { cb(ok); } catch(e) {}
    },

    isLoading: function () { return _loading; },

    /**
     * 小游戏从后台返回时调用（ks.onShow）。
     * 如果广告还在加载阶段（没弹出），说明被后台打断了，强制收尾为失败。
     * 如果广告已展示（用户正在看或看完了），不干预——等 onClose 正常回调。
     */
    onAppShow: function () {
      if (!_loading) return;

      // 广告还没弹出（加载阶段被后台打断）→ 立即收尾为失败
      if (!_adShown && _pendingCb) {
        console.warn('[Ads] onShow: ad loading interrupted, force finishing');
        Ads._finish(_pendingCb, false, 'onShow_interrupt');
        return;
      }

      // 广告已弹出但 onClose 还没回调。
      // 注意：某些平台在广告弹出时也会触发 onShow，此时用户还在看广告，
      // 不能提前收尾。用 _adShownTime 判断：广告展示后直接 return，
      // 由 onClose 正常回调收尾。只在"广告已展示但 onClose 确实丢了"时兜底——
      // 用户关掉广告回到游戏会再次触发 onShow，此时广告展示时间已经很长了，
      // 延迟 3 秒等 onClose，还不来就按展示时长判定。
      // 为避免广告弹出时的那次 onShow 误触发兜底，只忽略刚展示后的短暂回调。
      // 旧逻辑要求展示时间 > 10 秒，短广告提前退出且丢 onClose 时会永久卡住。
      if (_adShown && _pendingCb) {
        var watchSecs = (M3._now() - _adShownTime) / 1000;
        if (watchSecs < 2) return; // 广告刚弹出不久，用户可能还在看，不干预

        var cb = _pendingCb;
        var shownTime = _adShownTime;
        setTimeout(function () {
          if (!_loading || _pendingCb !== cb) return;
          var secs = (M3._now() - shownTime) / 1000;
          var ok = secs >= 15;
          console.warn('[Ads] onShow: onClose missing, watchSecs=' + secs.toFixed(1) + ', grant=' + ok);
          Ads._finish(cb, ok, 'onClose_missing');
        }, 3000);
      }
    },

    // ── 跳关（需连续看 2 个）──────────────────────────────────────────────────
    /**
     * @param {Function} onSkip  看满 2 次后回调
     */
    showSkipAd: function (onSkip, onCancel) {
      _skipCount = 0;
      function doOne() {
        Ads.showRewarded(function (ok) {
          if (!ok) { _skipCount = 0; if (onCancel) onCancel(); return; }
          _skipCount++;
          if (_skipCount >= CONFIG.AD_SKIP_COUNT) {
            _skipCount = 0;
            if (onSkip) onSkip();
          } else {
            doOne();
          }
        }, 'skip');
      }
      doOne();
    },

    // ── 插屏 ──────────────────────────────────────────────────────────────────
    trySpawnInterstitial: function () {
      var now = M3._now();
      if (now - _firstStartMs < INTERSTITIAL_COLD_DELAY) return;
      if (now - _lastInterstitialMs < INTERSTITIAL_INTERVAL) return;

      var unitId = CONFIG.AD_UNIT.interstitial;
      var show = function (ad) {
        _lastInterstitialMs = M3._now();
        ad.show().catch(function () {});
      };

      if (typeof ks !== 'undefined' && ks.createInterstitialAd) {
        var ad = ks.createInterstitialAd({ adUnitId: unitId });
        show(ad);
      } else if (typeof wx !== 'undefined' && wx.createInterstitialAd) {
        var adWx = wx.createInterstitialAd({ adUnitId: unitId });
        show(adWx);
      }
    }
  };
})();
