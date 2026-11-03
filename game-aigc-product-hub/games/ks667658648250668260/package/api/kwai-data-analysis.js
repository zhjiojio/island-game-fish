/**
 * kwai-data-analysis.js — 快手小游戏数据分析模块
 *
 * 使用方式：
 *   // 场景上报（ks.reportScene → 埋点 ID 6501408 CUSTOMIZE_SCENE）
 *   KwaiDataAnalysis.reportScene({
 *     sceneId:   7001,
 *     costTime:  500,
 *     dimension: { entry: 'ad' },
 *     metric:    { loadTime: '500' },
 *   });
 *   // 返回 true/false（是否成功调用 API）
 *
 *   // 事件上报（ks.reportAnalytics → 自定义分析事件）
 *   KwaiDataAnalysis.reportAnalytics('ad_click', { node: 'EP01_N1', opt: 0 });
 *
 * 约束（reportScene）：
 *   - 同一 sceneId 同一启动只能上报一次（重复会报错）
 *   - dimension 值须为非空字符串；metric 值须能 parse 为数字
 *   - 序列化后 ≤ 1024 字符；Android/iOS < 13.5.40 无此 API → 自动降级
 */

(function () {

  var _isKwai = typeof ks !== 'undefined';

  // ─── ks.reportScene ─────────────────────────────────────────

  function reportScene(options) {
    options = options || {};
    var onFail = options.fail || function () {};

    if (!_isKwai) {
      try { if ((typeof GameGlobal !== 'undefined' ? GameGlobal : {}).__LG_VERBOSE__)
        console.warn('[KwaiDataAnalysis] 非快手环境，跳过 reportScene'); } catch (_) {}
      return false;
    }
    if (typeof ks.reportScene !== 'function') return false;

    try {
      ks.reportScene({
        sceneId:   options.sceneId,
        costTime:  options.costTime  || 0,
        dimension: options.dimension || {},
        metric:    options.metric    || {},
        success: function (res) {
          if (options.success) options.success(res);
          try { if ((typeof GameGlobal !== 'undefined' ? GameGlobal : {}).__LG_VERBOSE__)
            console.log('[KwaiDataAnalysis] reportScene ok sceneId:', options.sceneId, res); } catch (_) {}
        },
        fail: function (err) {
          try { console.warn('[SCENE FAIL]', options.sceneId, err && (err.errMsg || err.errCode || err)); } catch (_) {}
          onFail(err);
        },
      });
      return true;
    } catch (e) {
      try { if ((typeof GameGlobal !== 'undefined' ? GameGlobal : {}).__LG_VERBOSE__)
        console.warn('[KwaiDataAnalysis] reportScene throw:', e && e.message); } catch (_) {}
      return false;
    }
  }

  // ─── ks.reportAnalytics ──────────────────────────────────────
  // 上报自定义分析事件（字符串事件名，与 reportScene 数字 sceneId 是两条独立通道）

  function reportAnalytics(eventName, params) {
    var hasAPI = _isKwai && typeof ks.reportAnalytics === 'function';
    if (hasAPI) {
      // 正式包：走平台 API
      try { ks.reportAnalytics(eventName, params || {}); } catch (e) {}
    } else {
      // 预览包 fallback：console 输出便于 DevTools 查看
      try { console.log('[Analytics]', eventName, JSON.stringify(params || {})); } catch (_) {}
    }
  }

  window.KwaiDataAnalysis = {
    reportScene:     reportScene,
    reportAnalytics: reportAnalytics,
  };

})();

