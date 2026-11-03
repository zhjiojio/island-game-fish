/**
 * kwai-repost.js — 快手小游戏转发分享模块
 *
 * 使用方式：
 *   KwaiRepost.shareAppMessage({
 *     templateId: 'xxx',
 *     query:      { from: 'share', level: 5 },
 *     onSuccess:  function() { console.log('分享成功'); },
 *     onCancel:   function() { console.log('用户取消'); },
 *     onFail:     function(err) { console.warn(err.errMsg); },
 *   });
 *
 * 说明：
 *   query 可传 object（自动拼成 query string）或字符串
 *   templateId 在快手小游戏后台配置
 */

(function () {

  function buildQuery(params) {
    if (!params) return '';
    if (typeof params === 'string') return params;
    return Object.keys(params)
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
  }

  function shareAppMessage(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onCancel  = options.onCancel  || function () {};
    var onFail    = options.onFail    || function () {};

    if (typeof ks === 'undefined') {
      console.warn('[KwaiRepost] 非快手环境，跳过 shareAppMessage');
      onFail({ errMsg: '非快手环境' });
      return;
    }

    ks.shareAppMessage({
      templateId: options.templateId || '',
      query:      buildQuery(options.query),
      success: function () {
        console.log('[KwaiRepost] 分享成功');
        onSuccess();
      },
      fail: function (err) {
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
          console.log('[KwaiRepost] 用户取消分享');
          onCancel();
        } else {
          console.warn('[KwaiRepost] 分享失败', err.errMsg);
          onFail(err);
        }
      },
    });
  }

  window.KwaiRepost = {
    shareAppMessage: shareAppMessage,
    buildQuery:      buildQuery,
  };

})();
