/**
 * cdn-loader.js — CDN 资源加载器（标准库）
 *
 * 职责：
 *   ① 从 CDN URL 下载资源并缓存到本地（快手文件系统 / 浏览器内存）
 *   ② 防重复下载（已缓存则直接返回本地路径）
 *   ③ 双端适配：快手用 KwaiNetwork.downloadFile + KwaiFile；H5 直接返回 CDN URL
 *   ④ 与 M3.AssetManager 协作，下载完成后自动注册到资源管理器
 *
 * 依赖：
 *   - standard/asset-manager.js
 *   - api/kwai-network.js（快手环境，可选）
 *   - api/kwai-file.js（快手环境，可选）
 *
 * 使用方式：
 *
 *   // 加载单个 CDN 图片
 *   M3.CdnLoader.loadImage('bg', 'https://cdn.example.com/level2-bg.png', 'scene:level2', {
 *     onSuccess: function (img) { },  // img 为 Image 对象
 *     onFail:    function (e)   { console.error(e); },
 *   });
 *
 *   // 批量预加载 CDN 资源
 *   M3.CdnLoader.preload([
 *     { key: 'level2-bg',  url: 'https://cdn.example.com/level2-bg.png' },
 *     { key: 'level2-bgm', url: 'https://cdn.example.com/level2-bgm.mp3', type: 'audio' },
 *   ], {
 *     onProgress: function (done, total) { },  // 更新进度条
 *     onSuccess:  function () { startLevel2(); },
 *     onFail:     function (e) { console.error(e); },
 *   });
 *
 *   // 检查是否已缓存
 *   M3.CdnLoader.isCached('level2-bg'); // 返回 true / false
 *
 * CDN 资源代码引用替换规范：
 *   上传前（本地路径）：
 *     loadImage('assets/images/level2-bg.png')
 *   上传后（CDN + CdnLoader）：
 *     M3.CdnLoader.loadImage('level2-bg', 'https://cdn.example.com/level2-bg.png', 'scene:level2', {...})
 *
 *   严禁直接将 CDN URL 硬编码到 new Image().src 或 img.src 中，
 *   必须通过 M3.CdnLoader 统一管理，确保缓存复用和错误处理一致。
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  // key → localPath (快手) 或 cdnUrl (H5)
  var _cache = {};
  // key → Promise（下载中防重复）
  var _pending = {};

  var _isKwai = typeof ks !== 'undefined';

  /**
   * 内部：快手环境下载文件到本地，返回 Promise<localFilePath>
   */
  function _downloadToLocal(url) {
    return new Promise(function (resolve, reject) {
      if (typeof KwaiNetwork === 'undefined' || typeof KwaiNetwork.downloadFile !== 'function') {
        // 没有 downloadFile 能力时，回退到直接使用 URL
        resolve(url);
        return;
      }
      KwaiNetwork.downloadFile({
        url: url,
        onSuccess: function (res) { resolve(res.tempFilePath || res.filePath || url); },
        onFail: function (e) { reject(e); },
      });
    });
  }

  /**
   * 加载单张 CDN 图片
   * @param {string} key     资源唯一标识，与 M3.AssetManager 的 key 对应
   * @param {string} url     CDN 完整 URL
   * @param {string} [group] AssetManager 分组标签（切场景时批量释放）
   * @param {object} [opts]  { onSuccess(img), onFail(e) }
   * @returns {Promise}
   */
  function loadImage(key, url, group, opts) {
    opts = opts || {};

    // 已缓存：直接从 AssetManager 获取
    if (_cache[key]) {
      var img = M3.AssetManager && M3.AssetManager.get(key);
      if (img) {
        if (opts.onSuccess) opts.onSuccess(img);
        return Promise.resolve(img);
      }
    }

    // 下载中：复用
    if (_pending[key]) {
      return _pending[key].then(function (img) {
        if (opts.onSuccess) opts.onSuccess(img);
        return img;
      }, function (e) {
        if (opts.onFail) opts.onFail(e);
        return Promise.reject(e);
      });
    }

    // H5 浏览器：直接使用 CDN URL
    var srcPromise = _isKwai ? _downloadToLocal(url) : Promise.resolve(url);

    var promise = srcPromise.then(function (localPath) {
      _cache[key] = localPath;
      // 注册到 AssetManager
      if (M3.AssetManager) {
        var handle = M3.AssetManager.acquire('image', key, localPath, group || 'cdn');
        return M3.AssetManager.ready(key).then(function (img) {
          delete _pending[key];
          return img;
        });
      }
      // 无 AssetManager 时直接创建 Image
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          delete _pending[key];
          resolve(img);
        };
        img.onerror = function (e) {
          delete _pending[key];
          reject(e);
        };
        img.src = localPath;
      });
    });

    _pending[key] = promise;

    return promise.then(function (img) {
      if (opts.onSuccess) opts.onSuccess(img);
      return img;
    }, function (e) {
      if (opts.onFail) opts.onFail(e);
      return Promise.reject(e);
    });
  }

  /**
   * 批量预加载 CDN 资源（图片为主，其他类型静默跳过）
   * @param {Array} items  [{ key, url, type?, group? }, ...]
   * @param {object} opts  { onProgress(done, total), onSuccess(), onFail(e) }
   * @returns {Promise}
   */
  function preload(items, opts) {
    opts = opts || {};
    var total = items.length;
    var done = 0;

    var promises = items.map(function (item) {
      var type = item.type || 'image';
      if (type !== 'image') {
        // 非图片类型（audio 等）暂时跳过，直接计入完成
        done++;
        if (opts.onProgress) opts.onProgress(done, total);
        return Promise.resolve();
      }
      return loadImage(item.key, item.url, item.group || 'cdn-preload').then(function () {
        done++;
        if (opts.onProgress) opts.onProgress(done, total);
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
   * 检查资源是否已缓存
   * @param {string} key
   * @returns {boolean}
   */
  function isCached(key) {
    return !!_cache[key];
  }

  M3.CdnLoader = {
    loadImage: loadImage,
    preload: preload,
    isCached: isCached,
  };
})();
