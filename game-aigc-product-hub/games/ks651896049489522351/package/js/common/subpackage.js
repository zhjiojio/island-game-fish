/**
 * subpackage.js — 快手小游戏分包门禁与预载（双端）
 *
 * 分包内容（game.json subpackages）：
 *   ingame：牌局图片 / bgm_room.mp3 / 局内 Spine 特效（sandaiyi、feiji、
 *           wangzha、zhadan、spring）
 *   popup：  弹窗切图（asset/image/popup）+ 结算/弹窗 Spine 特效
 *           （win、fail、broke、gongxi、goumai）
 *
 * 快手端：ks.loadSubpackage 下载分包后才可访问其内资源；
 *         所有资源加载点（AssetManager 图片 / KwaiMedia 音频 / SpineFX
 *         的 json+atlas fetch）经 ensure() 门禁等待分包就绪。
 * H5 端：无分包概念，一切直接放行（静态文件按新路径照常可达）。
 *
 * 使用方式：
 *   // 按资源路径门禁：主包路径返回 null（同步放行），子包路径返回 Promise
 *   var gate = M3.Subpackage.ensure(src);
 *   if (gate && gate.then) gate.then(loadIt); else loadIt();
 *
 *   // 预载（主页起来后调用，提前下载分包）
 *   M3.Subpackage.preload('ingame');
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  var _isKwai = (typeof ks !== 'undefined') && (typeof ks.loadSubpackage === 'function');

  // name -> 就绪 Promise（null 表示上次失败、可重试）
  var _loaded = {};

  // 路径前缀 → 分包名（与 game.json subpackages 对应）
  var _PREFIX_PKG = {
    'subpackages/ingame/': 'ingame',
    'subpackages/popup/':  'popup'
  };

  function load (name) {
    if (_loaded[name]) return _loaded[name];
    if (!_isKwai) return (_loaded[name] = Promise.resolve(true));
    _loaded[name] = new Promise(function (resolve) {
      try {
        ks.loadSubpackage({
          name: name,
          success: function () {
            console.log('[Subpackage] 分包就绪:', name);
            resolve(true);
          },
          fail: function (err) {
            console.warn('[Subpackage] 加载失败 name:', name,
              err && (err.code + ' ' + err.errorMsg));
            _loaded[name] = null;   // 允许下次重试
            resolve(false);
          }
        });
      } catch (e) {
        console.warn('[Subpackage] loadSubpackage 异常:', name, e);
        _loaded[name] = null;
        resolve(false);
      }
    });
    return _loaded[name];
  }

  // 按资源路径门禁：主包路径 → null（同步放行）；子包路径 → Promise
  function ensure (path) {
    if (!path || typeof path !== 'string') return null;
    if (path.indexOf('subpackages/') !== 0) return null;
    for (var prefix in _PREFIX_PKG) {
      if (path.indexOf(prefix) === 0) return load(_PREFIX_PKG[prefix]);
    }
    return null;
  }

  // 预载：失败仅告警不阻塞业务（后续 ensure 会重试）
  function preload (name) { return load(name); }

  M3.Subpackage = {
    load: load,
    ensure: ensure,
    preload: preload
  };
})();
