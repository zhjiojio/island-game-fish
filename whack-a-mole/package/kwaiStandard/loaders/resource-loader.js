/**
 * resource-loader.js — 统一资源路径解析器（本地路径 / CDN 双态，标准库）
 *
 * 职责：
 *   ① 游戏代码永远只写包内相对路径（如 'res/Image/xxx.png'、'res/Audio/bgm.mp3'、'res/Video/intro.mp4'），
 *      不感知资源是否已 CDN 化
 *   ② 运行时查 kwaiStandard/loaders/resource-manifest.js 注入的映射表，命中则解析为 CDN URL，未命中原样返回本地路径
 *   ③ 快手端命中 CDN 的资源先走 KwaiNetwork.downloadFile 下载到本地文件后再使用；H5 端直接用 CDN URL
 *   ④ 本模块只做路径解析的 hook，不提供任何资源加载 API；真正的加载/播放仍由
 *      KwaiRender.loadImage / KwaiMedia.Image.load / KwaiMedia.Video.* / KwaiMedia.Audio.* /
 *      AIGCUtils.AssetManager 内部统一调用本模块解析后再加载，对业务代码零侵入
 *
 * 【重要】游戏业务代码不需要、也不应该直接调用本模块。
 * 统一规范：图片用 KwaiRender.loadImage / AIGCUtils.AssetManager.acquire，
 *          视频用 KwaiMedia.Video.*，音频用 KwaiMedia.Audio.*，
 *          传入参数始终是包内相对路径，CDN 解析在这些封装内部自动完成。
 *
 * 映射表来源：
 *   kwaiStandard/loaders/resource-manifest.js 开发阶段内容为空对象 `{}`，由平台/CDN 上传流程在打包阶段写入
 *   真实的「本地相对路径 → CDN URL」映射，**不改动任何游戏业务代码**。
 *
 * 依赖：
 *   - kwaiStandard/loaders/resource-manifest.js（必须在本文件之前 require，写入 window.AIGCResourceManifest）
 *   - kwaiOpenApi/kwai-network.js（快手环境下载 CDN 资源到本地，可选，缺失时降级为直接用 CDN URL）
 *
 * 内部调用方式（仅供 kwaiStandard/api 层使用，详见 kwai-render.js / kwai-media.js / asset-manager.js）：
 *
 *   AIGCUtils.ResourceLoader.resolve('res/Audio/bgm-main.mp3', function (realSrc) {
 *     // realSrc：未映射返回原始本地路径；H5 命中映射返回 CDN URL；
 *     // 快手命中映射时返回已下载到本地的文件路径（回调可能异步触发）
 *   });
 *
 * 批量预下载（切场景前预热 CDN 资源，减少首次使用时的下载等待）：
 *
 *   AIGCUtils.ResourceLoader.preload([
 *     { key: 'level2-bg',  path: 'res/Image/level2-bg.png', type: 'image' },
 *     { key: 'level2-bgm', path: 'res/Audio/level2-bgm.mp3', type: 'audio' },
 *   ], {
 *     onProgress: function (done, total) { },
 *     onSuccess:  function () { startLevel2(); },
 *     onFail:     function (e) { console.error(e); },
 *   });
 *
 *   AIGCUtils.ResourceLoader.isCached('level2-bg'); // true / false
 */
(function () {
  var AIGCUtils = window.AIGCUtils = window.AIGCUtils || {};

  var _isKwai = typeof ks !== 'undefined';

  // cdnUrl → 本地下载后的文件路径（快手环境下载缓存，防重复下载）
  var _downloadCache = {};
  // cdnUrl → 等待下载完成的回调队列
  var _downloadPending = {};

  /**
   * 内部：快手环境下载 CDN 文件到本地，返回 Promise<localFilePath>
   */
  function _downloadToLocal(url) {
    return new Promise(function (resolvePromise, rejectPromise) {
      if (typeof KwaiNetwork === 'undefined' || typeof KwaiNetwork.downloadFile !== 'function') {
        resolvePromise(url);
        return;
      }
      KwaiNetwork.downloadFile({
        url: url,
        onSuccess: function (res) { resolvePromise(res.tempFilePath || res.filePath || url); },
        onFail: function (e) { rejectPromise(e); },
      });
    });
  }

  /**
   * 本地相对路径 → 真实加载地址（CDN URL / 下载后本地路径 / 原样本地路径）
   * @param {string}   localPath  包内相对路径，如 'res/Image/xxx.png'
   * @param {Function} callback   function (realSrc) —— 未命中映射或 H5 环境同步触发；
   *                              快手环境命中映射且首次下载时异步触发
   */
  function resolve(localPath, callback) {
    callback = callback || function () {};

    if (!localPath || typeof localPath !== 'string' || localPath.indexOf('http') === 0) {
      callback(localPath);
      return;
    }

    var manifest = window.AIGCResourceManifest || {};
    var normalized = localPath.replace(/^\.\//, '');
    var cdnUrl = manifest[normalized];

    // 未命中映射：开发阶段 / 平台尚未 CDN 化，原样返回本地路径
    if (!cdnUrl) {
      callback(localPath);
      return;
    }

    // H5：直接使用 CDN URL，浏览器自身处理网络加载
    if (!_isKwai) {
      callback(cdnUrl);
      return;
    }

    // 快手环境：下载到本地文件后使用，带缓存与防重复下载
    if (_downloadCache[cdnUrl]) {
      callback(_downloadCache[cdnUrl]);
      return;
    }
    if (_downloadPending[cdnUrl]) {
      _downloadPending[cdnUrl].push(callback);
      return;
    }
    _downloadPending[cdnUrl] = [callback];
    _downloadToLocal(cdnUrl).then(function (localFilePath) {
      _downloadCache[cdnUrl] = localFilePath;
      var cbs = _downloadPending[cdnUrl];
      delete _downloadPending[cdnUrl];
      for (var i = 0; i < cbs.length; i++) cbs[i](localFilePath);
    }, function (e) {
      console.error('[ResourceLoader] CDN 资源下载失败，降级使用本地路径', cdnUrl, e);
      var cbs = _downloadPending[cdnUrl];
      delete _downloadPending[cdnUrl];
      for (var i = 0; i < cbs.length; i++) cbs[i](localPath);
    });
  }

  // key → true，preload() 完成的资源缓存标记（供 isCached 查询）
  var _preloadedKeys = {};

  /**
   * 批量预下载资源（切场景前预热，减少首次使用时的下载等待）。
   * 仅做路径解析 + 快手端预下载到本地，不做任何资源对象的创建/缓存，
   * 真正的加载对象仍由 KwaiRender/KwaiMedia/AssetManager 按需创建。
   * @param {Array} items  [{ key, path, type? }, ...]，type 当前仅用于日志标注，不影响解析逻辑
   * @param {object} [opts]  { onProgress(done, total), onSuccess(), onFail(e) }
   * @returns {Promise}
   */
  function preload(items, opts) {
    opts = opts || {};
    items = items || [];
    var total = items.length;
    var done = 0;

    if (total === 0) {
      if (opts.onSuccess) opts.onSuccess();
      return Promise.resolve();
    }

    var promises = items.map(function (item) {
      return new Promise(function (res) {
        resolve(item.path, function () {
          _preloadedKeys[item.key] = true;
          done++;
          if (opts.onProgress) opts.onProgress(done, total);
          res();
        });
      });
    });

    return Promise.all(promises).then(function () {
      if (opts.onSuccess) opts.onSuccess();
    }, function (e) {
      if (opts.onFail) opts.onFail(e);
      return Promise.reject(e);
    });
  }

  /**
   * 检查资源是否已通过 preload() 预下载
   * @param {string} key
   * @returns {boolean}
   */
  function isCached(key) {
    return !!_preloadedKeys[key];
  }

  AIGCUtils.ResourceLoader = {
    resolve: resolve,
    preload: preload,
    isCached: isCached,
  };
})();
