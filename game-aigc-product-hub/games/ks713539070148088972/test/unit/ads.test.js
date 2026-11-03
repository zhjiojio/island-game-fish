/**
 * test/unit/ads.test.js — Ads 单测
 * 覆盖：
 *   - DEV_SKIP_ADS 开关跳过真实广告直接判定成功
 *   - H5（无 ks/wx）环境模拟广告
 *   - showSkipAd 需连续看满 AD_SKIP_COUNT 次，中途失败即重置计数
 *   - trySpawnInterstitial 冷启延迟 + 频控间隔
 *   - isLoading 防重入
 * 说明：ads.js 依赖 UIKit.showAdLoading/hideAdLoading，测试里用最简 stub 代替；
 *       M3._now 用可控的时间戳变量模拟，配合 jest fake timers 精确控制频控窗口。
 */
'use strict';

function loadFresh() {
  jest.resetModules();
  require('../../js/core/product.config.js');
  require('../../js/core/config.js');
  global.M3 = global.M3 || {};
  global.M3._now = function () { return mockNow; };
  global.UIKit = {
    showAdLoading: jest.fn(),
    hideAdLoading: jest.fn()
  };
  require('../../js/systems/ads.js');
  return window.Ads;
}

var mockNow;

describe('Ads', function () {
  var Ads;

  beforeEach(function () {
    mockNow = 0;
    jest.useFakeTimers();
    Ads = loadFresh();
    Ads.init();
  });

  afterEach(function () {
    jest.useRealTimers();
    delete global.ks;
    delete global.wx;
  });

  describe('showRewarded — DEV_SKIP_ADS 开关', function () {
    test('DEV_SKIP_ADS=true 时应不请求真实广告位，直接判定成功', function () {
      CONFIG.DEV_SKIP_ADS = true;
      var cb = jest.fn();
      Ads.showRewarded(cb, 'test-slot');

      expect(global.UIKit.showAdLoading).toHaveBeenCalled();
      jest.advanceTimersByTime(300);
      expect(cb).toHaveBeenCalledWith(true);
      expect(global.UIKit.hideAdLoading).toHaveBeenCalled();
    });

    test('DEV_SKIP_ADS=true 时防重入：loading 中再次调用应被忽略', function () {
      CONFIG.DEV_SKIP_ADS = true;
      var cb1 = jest.fn(), cb2 = jest.fn();
      Ads.showRewarded(cb1, 'a');
      Ads.showRewarded(cb2, 'b'); // 应被忽略（_loading 为 true）
      jest.advanceTimersByTime(300);
      expect(cb1).toHaveBeenCalledWith(true);
      expect(cb2).not.toHaveBeenCalled();
    });
  });

  describe('showRewarded — H5 环境（无 ks/wx）模拟广告', function () {
    test('无真实广告 SDK 时应在 800ms 后模拟"已看完"', function () {
      CONFIG.DEV_SKIP_ADS = false;
      var cb = jest.fn();
      Ads.showRewarded(cb, 'slot');
      expect(cb).not.toHaveBeenCalled();
      jest.advanceTimersByTime(800);
      expect(cb).toHaveBeenCalledWith(true);
    });
  });

  describe('showRewarded — 真实广告 SDK（ks 环境）', function () {
    function fakeAd() {
      var closeHandler = null;
      return {
        onClose: function (fn) { closeHandler = fn; },
        offClose: function () {},
        show: function () { return Promise.resolve(); },
        _triggerClose: function (res) { closeHandler(res); }
      };
    }

    test('isEnded=true 时应判定成功', function () {
      CONFIG.DEV_SKIP_ADS = false;
      var ad = fakeAd();
      global.ks = { createRewardedVideoAd: function () { return ad; } };
      Ads = loadFresh();
      Ads.init();
      CONFIG.DEV_SKIP_ADS = false;

      var cb = jest.fn();
      Ads.showRewarded(cb, 'slot');
      return Promise.resolve().then(function () {
        ad._triggerClose({ isEnded: true });
        expect(cb).toHaveBeenCalledWith(true);
      });
    });

    test('isEnded=false（用户中途关闭）时应判定失败', function () {
      CONFIG.DEV_SKIP_ADS = false;
      var ad = fakeAd();
      global.ks = { createRewardedVideoAd: function () { return ad; } };
      Ads = loadFresh();
      Ads.init();
      CONFIG.DEV_SKIP_ADS = false;

      var cb = jest.fn();
      Ads.showRewarded(cb, 'slot');
      return Promise.resolve().then(function () {
        ad._triggerClose({ isEnded: false });
        expect(cb).toHaveBeenCalledWith(false);
      });
    });

    test('加载超时（AD_LOADING_TIMEOUT 内 show() 未 resolve，广告迟迟未展示）应判定失败', function () {
      CONFIG.DEV_SKIP_ADS = false;
      // 卡在"加载中"：show() 返回一个永不 resolve/reject 的 Promise，模拟广告
      // 物料一直没拉到、迟迟不弹出的场景——这才是 AD_LOADING_TIMEOUT 该兜底的情况。
      var ad = {
        onClose: function () {},
        offClose: function () {},
        show: function () { return new Promise(function () {}); }
      };
      global.ks = { createRewardedVideoAd: function () { return ad; } };
      Ads = loadFresh();
      Ads.init();
      CONFIG.DEV_SKIP_ADS = false;

      var cb = jest.fn();
      Ads.showRewarded(cb, 'slot');
      jest.advanceTimersByTime(CONFIG.AD_LOADING_TIMEOUT);
      expect(cb).toHaveBeenCalledWith(false);
    });

    test('广告成功展示后（show() 已 resolve），即使观看时长超过 AD_LOADING_TIMEOUT 也不应提前判失败', function () {
      // 回归用例：修复"8s 计时器跨越整个观看时长"的 bug —— 之前 show().then() 里
      // 遗漏 clearTimeout，导致广告完整播完（真实场景常见 15~30s）后，真正的
      // onClose(isEnded:true) 回调到达前，8s 超时已先一步判失败并被丢弃。
      CONFIG.DEV_SKIP_ADS = false;
      var ad = fakeAd();
      global.ks = { createRewardedVideoAd: function () { return ad; } };
      Ads = loadFresh();
      Ads.init();
      CONFIG.DEV_SKIP_ADS = false;

      var cb = jest.fn();
      Ads.showRewarded(cb, 'slot');
      return Promise.resolve().then(function () {
        // 广告已成功展示（show() 已 resolve），此时前进超过 8s，不应触发失败回调
        jest.advanceTimersByTime(CONFIG.AD_LOADING_TIMEOUT + 20000);
        expect(cb).not.toHaveBeenCalled();
        // 20s 后用户看完广告关闭，才应该真正触发成功回调
        ad._triggerClose({ isEnded: true });
        expect(cb).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('showSkipAd（连续观看 AD_SKIP_COUNT 次）', function () {
    test('连续看满 AD_SKIP_COUNT 次后应触发 onSkip', function () {
      CONFIG.DEV_SKIP_ADS = true;
      var onSkip = jest.fn();
      Ads.showSkipAd(onSkip);

      for (var i = 0; i < CONFIG.AD_SKIP_COUNT; i++) {
        jest.advanceTimersByTime(300);
      }
      expect(onSkip).toHaveBeenCalledTimes(1);
    });

    test('中途失败一次应重置计数，不会提前触发 onSkip', function () {
      CONFIG.DEV_SKIP_ADS = false; // 用 H5 模拟通道（800ms 内必定成功），这里改用真实 SDK 手动控制失败
      var ad = (function () {
        var closeHandler = null;
        return {
          onClose: function (fn) { closeHandler = fn; },
          offClose: function () {},
          show: function () { return Promise.resolve(); },
          _triggerClose: function (res) { closeHandler(res); }
        };
      })();
      global.ks = { createRewardedVideoAd: function () { return ad; } };
      Ads = loadFresh();
      Ads.init();
      CONFIG.DEV_SKIP_ADS = false;

      var onSkip = jest.fn();
      Ads.showSkipAd(onSkip);

      return Promise.resolve()
        .then(function () { ad._triggerClose({ isEnded: true }); })  // 第 1 次成功
        .then(function () { ad._triggerClose({ isEnded: false }); }) // 第 2 次失败 → 重置
        .then(function () {
          expect(onSkip).not.toHaveBeenCalled();
        });
    });
  });

  describe('trySpawnInterstitial（频控）', function () {
    test('冷启 32s 内不应展示插屏', function () {
      var shown = jest.fn();
      global.ks = { createInterstitialAd: function () { return { show: function () { shown(); return Promise.resolve(); } }; } };
      Ads = loadFresh();
      mockNow = 0;
      Ads.init();
      mockNow = 10000; // 冷启 10s，未到 32s
      Ads.trySpawnInterstitial();
      expect(shown).not.toHaveBeenCalled();
    });

    test('冷启超过 32s 后应展示插屏', function () {
      var shown = jest.fn();
      global.ks = { createInterstitialAd: function () { return { show: function () { shown(); return Promise.resolve(); } }; } };
      Ads = loadFresh();
      mockNow = 0;
      Ads.init();
      mockNow = 33000;
      Ads.trySpawnInterstitial();
      expect(shown).toHaveBeenCalledTimes(1);
    });

    test('两次插屏间隔小于 62s 时第二次应被频控拦截', function () {
      var shown = jest.fn();
      global.ks = { createInterstitialAd: function () { return { show: function () { shown(); return Promise.resolve(); } }; } };
      Ads = loadFresh();
      mockNow = 0;
      Ads.init();
      mockNow = 33000;
      Ads.trySpawnInterstitial(); // 第 1 次展示
      mockNow = 33000 + 30000;    // 30s 后（< 62s 间隔）
      Ads.trySpawnInterstitial(); // 应被拦截
      expect(shown).toHaveBeenCalledTimes(1);
    });
  });

  test('isLoading 应反映当前是否有广告正在加载中', function () {
    CONFIG.DEV_SKIP_ADS = true;
    expect(Ads.isLoading()).toBe(false);
    Ads.showRewarded(function () {}, 's');
    expect(Ads.isLoading()).toBe(true);
    jest.advanceTimersByTime(300);
    expect(Ads.isLoading()).toBe(false);
  });
});
