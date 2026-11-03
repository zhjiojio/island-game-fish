/**
 * kwai-share.js — 快手小游戏分享模块
 *
 * 使用方式：
 *
 *   // 主动分享（游戏结束 / 刷新最高分等场景）
 *   KwaiShare.share({
 *     title:      '我在「游戏名」得了 9999 分，来挑战我！',
 *     imageUrl:   'https://cdn.example.com/share-cover.png', // 可留空
 *     extraQuery: { score: 9999, level: 5 },                 // 可选，附加分享参数
 *   });
 *
 *   // 获取启动时携带的分享参数（从好友分享入口打开时读取）
 *   var query = KwaiShare.getLaunchQuery();
 *   // query.score / query.level ...
 */

(function () {

  var _defaultTitle    = '快来挑战我！';
  var _defaultImageUrl = '';

  function _buildQuery(extraQuery) {
    if (!extraQuery) return '';
    return Object.keys(extraQuery)
      .map(function (k) { return k + '=' + encodeURIComponent(extraQuery[k]); })
      .join('&');
  }

  // 注册系统菜单「转发」回调（文件加载时自动注册，使用最近一次 share 的参数）
  var _lastParams = { title: _defaultTitle, imageUrl: _defaultImageUrl, query: '' };

  if (typeof ks !== 'undefined' && ks.onShareAppMessage) {
    ks.onShareAppMessage(function () {
      return { title: _lastParams.title, imageUrl: _lastParams.imageUrl, query: _lastParams.query };
    });
  }

  /**
   * 主动触发分享
   * @param {Object} options
   * @param {string}  options.title        - 分享标题
   * @param {string}  [options.imageUrl]   - 分享封面图 URL，留空则不带封面
   * @param {Object}  [options.extraQuery] - 附加参数，会拼到 query 字段
   * @param {string}  [options.templateId] - 分享模版 ID，不传走默认分享文案
   * @param {Function} [options.success]  - 分享成功回调
   * @param {Function} [options.fail]     - 分享失败回调
   * @param {Function} [options.complete] - 分享结束回调（成功/失败都会执行）
   */
  function share(options) {
    options = options || {};
    var params = {
      title:    options.title    || _defaultTitle,
      imageUrl: options.imageUrl || _defaultImageUrl,
      query:    _buildQuery(options.extraQuery),
    };
    if (options.templateId) {
      params.templateId = options.templateId;
    }
    if (typeof options.success   === 'function') { params.success   = options.success;   }
    if (typeof options.fail      === 'function') { params.fail      = options.fail;      }
    if (typeof options.complete  === 'function') { params.complete  = options.complete;  }
    _lastParams = params;
    if (typeof ks === 'undefined') {
      console.warn('[KwaiShare] 非快手环境，跳过分享');
      if (typeof options.fail     === 'function') { options.fail({  errMsg: 'shareAppMessage:fail non-kwai env' }); }
      if (typeof options.complete === 'function') { options.complete({ errMsg: 'shareAppMessage:complete'       }); }
      return;
    }
    ks.shareAppMessage(params);
  }

  /**
   * 获取启动时携带的分享参数（从好友分享链接打开游戏时读取）
   * @returns {Object} query 键值对，如 { score: '9999', level: '5' }
   */
  function getLaunchQuery() {
    if (typeof ks === 'undefined') {
      console.warn('[KwaiShare] 非快手环境，跳过获取分享参数');
      return {};
    }
    var launchOptions = ks.getLaunchOptionsSync();
    return (launchOptions && launchOptions.query) || {};
  }

  window.KwaiShare = {
    share:          share,
    getLaunchQuery: getLaunchQuery,
  };

})();
