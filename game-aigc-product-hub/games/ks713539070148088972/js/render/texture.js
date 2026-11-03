/**
 * render/texture.js — WebGL 纹理管理器
 * 职责：
 *   - 图片 → WebGL 纹理上传（引用计数）
 *   - 纹理缓存（key = src URL）
 *   - contextRestored 重建
 * 依赖：GLContext, 快手 ks.createImage / wx.createImage / new Image
 * 导出：TextureManager
 */
(function () {
  'use strict';

  /** @type {Object.<string, {tex: WebGLTexture, refs: number, img: HTMLImageElement}>} */
  var _cache = {};
  /** 加载中的 promise，防重复请求 @type {Object.<string, Promise>} */
  var _pending = {};

  // ── 并发限制 + 失败重试 ──────────────────────────────────────────────────
  // 一次性把一整关（尤其换装玩法几十件衣服缩略图）全部图片同时甩给网络层，
  // 弱网下极易互相挤占带宽导致大量请求撞上超时；超时后旧逻辑直接放弃且永不
  // 重试，表现为卡片/角色图永久占位、"加载不出来"。这里加一个简单的并发队列
  // + 失败自动重试，不改变调用方 API（TextureManager.load 签名不变）。
  var MAX_CONCURRENT = 4;
  var RETRY_LIMIT = 2;       // 首次 + 最多再重试 2 次
  var RETRY_DELAY_MS = 600;  // 重试间隔（简单线性退避）
  var _activeCount = 0;
  var _queue = []; // [{run: Function}]

  function _runQueued() {
    while (_activeCount < MAX_CONCURRENT && _queue.length > 0) {
      var task = _queue.shift();
      _activeCount++;
      task.run();
    }
  }

  function _enqueue(run) {
    _queue.push({ run: run });
    _runQueued();
  }

  function _taskDone() {
    _activeCount--;
    _runQueued();
  }

  // ── 本地磁盘缓存（仅快手环境，依赖 Storage/KwaiFile/KwaiNetwork，均在本模块之后\n  //    require，但这里只在运行时的回调里引用它们，加载顺序不受影响）──────────
  // 目的：内存缓存 _cache 只在本次运行时生效，冷启动/场景切换回收纹理后都要重新
  // 走网络；这里把远程图片首次加载成功后异步落盘到用户目录，后续再次 load()
  // 同一个 URL 时优先读本地文件，省掉一次网络请求。
  var _isKwai = typeof ks !== 'undefined';
  var DISK_CACHE_KEY = 'zc_tex_disk_cache_v1';
  var DISK_CACHE_DIR = 'tex_cache';
  var _diskMap = null;      // 持久化的 src -> 本地文件路径 映射
  var _diskCaching = {};    // 正在后台下载落盘的 src，去重用，仅内存态

  function _ensureDiskMap() {
    if (_diskMap) return _diskMap;
    _diskMap = {};
    try {
      if (typeof Storage !== 'undefined') {
        var saved = Storage.get(DISK_CACHE_KEY);
        if (saved && typeof saved === 'object') _diskMap = saved;
      }
    } catch (e) {}
    return _diskMap;
  }

  function _persistDiskMap() {
    try {
      if (typeof Storage !== 'undefined') Storage.set(DISK_CACHE_KEY, _diskMap);
    } catch (e) {}
  }

  /** 简单字符串 hash，生成磁盘文件名（避免 URL 里的斜杠/参数当文件名） */
  function _hashSrc(src) {
    var h = 0;
    for (var i = 0; i < src.length; i++) {
      h = ((h << 5) - h + src.charCodeAt(i)) | 0;
    }
    return 'tex_' + (h >>> 0).toString(16);
  }

  /** 远程图片首次加载成功后，后台异步下载一份落盘，不阻塞/不影响本次 resolve */
  function _cacheToDiskInBackground(src) {
    if (!_isKwai) return;
    if (typeof KwaiNetwork === 'undefined' || typeof KwaiFile === 'undefined') return;
    var map = _ensureDiskMap();
    if (map[src] || _diskCaching[src]) return;
    _diskCaching[src] = true;
    KwaiNetwork.downloadFile({
      url: src,
      onSuccess: function (res) {
        var tempPath = res && res.tempFilePath;
        if (!tempPath) { delete _diskCaching[src]; return; }
        try {
          var dir = KwaiFile.userDataPath + '/' + DISK_CACHE_DIR;
          if (!KwaiFile.existsSync(dir)) KwaiFile.mkdirSync(dir, true);
        } catch (e) {}
        var destPath = KwaiFile.userDataPath + '/' + DISK_CACHE_DIR + '/' + _hashSrc(src);
        KwaiFile.saveFile({
          tempPath: tempPath,
          destPath: destPath,
          onSuccess: function (savedPath) {
            map[src] = savedPath || destPath;
            _persistDiskMap();
            delete _diskCaching[src];
          },
          onFail: function () { delete _diskCaching[src]; }
        });
      },
      onFail: function () { delete _diskCaching[src]; }
    });
  }

  /**
   * 创建平台图片对象
   */
  function createImageObj() {
    if (typeof ks !== 'undefined' && ks.createImage) return ks.createImage();
    if (typeof wx !== 'undefined' && wx.createImage) return wx.createImage();
    return new Image();
  }

  /**
   * 将 HTMLImageElement 上传为 WebGL 纹理
   * @param {WebGLRenderingContext} gl
   * @param {HTMLImageElement} img
   * @returns {WebGLTexture}
   */
  function uploadTexture(gl, img) {
    if (!gl || !img || !img.width || !img.height) return null;
    var tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    var uploaded = false;
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      uploaded = true;
    } catch (e) {
      // 快手部分机型 texImage2D 接受宽高版本
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, img.width, img.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, img);
        uploaded = true;
      } catch (e2) {
        console.error('[Texture] texImage2D failed', e2);
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!uploaded) {
      try { gl.deleteTexture(tex); } catch (e3) {}
      return null;
    }
    return tex;
  }

  var TextureManager = window.TextureManager = {

    /**
     * 加载图片并返回纹理（已缓存直接返回）
     * @param {string} src  图片 URL 或本地路径
     * @param {number} [timeout=8000]  超时 ms
     * @returns {Promise<{tex: WebGLTexture, img: HTMLImageElement, src: string}>}
     */
    load: function (src, timeout) {
      if (_cache[src]) {
        _cache[src].refs++;
        return Promise.resolve(_cache[src]);
      }
      if (_pending[src]) return _pending[src];

      var _timeout = timeout || 8000;
      var gl = GLContext.gl;
      var isRemote = /^https?:\/\//.test(src);

      // 命中本地磁盘缓存：直接读本地文件，不再走网络（仅快手环境）
      var actualSrc = src;
      if (isRemote && _isKwai) {
        var diskMap = _ensureDiskMap();
        var localPath = diskMap[src];
        if (localPath) {
          if (typeof KwaiFile !== 'undefined' && KwaiFile.existsSync(localPath)) {
            actualSrc = localPath;
          } else {
            // 本地文件已被系统清理/损坏，清掉映射，回退为远程加载
            delete diskMap[src];
            _persistDiskMap();
          }
        }
      }

      var promise = new Promise(function (resolve, reject) {
        function attempt(curActualSrc, retryCount) {
          var img = createImageObj();
          var timer = setTimeout(function () {
            img.onload = img.onerror = null;
            onFail();
          }, _timeout);

          function onFail() {
            clearTimeout(timer);
            // 本地磁盘缓存文件加载失败（可能已损坏/被清理），清掉映射后回退一次远程 URL，
            // 不计入重试次数配额。
            if (curActualSrc !== src) {
              var diskMap2 = _ensureDiskMap();
              delete diskMap2[src];
              _persistDiskMap();
              attempt(src, retryCount);
              return;
            }
            // 弱网/瞬时失败：并发限制之外再加一层重试，避免一次超时就永久占位。
            // 仅对远程 URL 重试——本地相对路径 404 意味着文件根本不存在，重试只会
            // 原样再 404 一次，白白占用 MAX_CONCURRENT 名额、拖慢队列里排在后面的
            // 关键素材（如欢迎页背景图）。2026-09-11 修复：本地资源直接快速失败，
            // 不进入重试等待（600ms/1200ms 线性退避），避免一批不存在的占位素材
            // （如 assets/Icon/ 下未就位的图标）把并发队列堵住十几秒，导致背景图/
            // logo 等真正存在的关键素材迟迟排不上号，欢迎页表现为持续显示纯色兜底。
            if (isRemote && retryCount < RETRY_LIMIT) {
              setTimeout(function () {
                attempt(curActualSrc, retryCount + 1);
              }, RETRY_DELAY_MS * (retryCount + 1));
              return;
            }
            _taskDone();
            delete _pending[src];
            reject(new Error('[Texture] load failed after ' + (retryCount + 1) + ' attempts: ' + src));
          }

          img.onload = function () {
            clearTimeout(timer);
            var tex = gl ? uploadTexture(gl, img) : null;
            // 图片 onload 不代表 WebGL 纹理上传成功；例如 H5 跨域/CORS 或上下文异常时，
            // 继续使用空纹理会在画面上表现为整块黑色。让它进入统一失败重试流程。
            if (!tex) {
              onFail();
              return;
            }
            var entry = { tex: tex, img: img, src: src, refs: 1 };
            _cache[src] = entry;
            _taskDone();
            delete _pending[src];
            resolve(entry);
            // 首次走远程 URL 加载成功：后台异步落盘缓存，供下次 load 同一 URL 时
            // 直接读本地文件；命中磁盘缓存加载成功（actualSrc !== src）则无需重复缓存。
            if (isRemote && curActualSrc === src) {
              _cacheToDiskInBackground(src);
            }
          };
          img.onerror = onFail;
          // H5 浏览器环境加载跨域 CDN 图片需要设置 crossOrigin，
          // 否则 WebGL texImage2D 会因 tainted canvas 抛出 SecurityError。
          // 注意：必须在设置 src 之前赋值，且服务端需返回 CORS 响应头。
          if (typeof ks === 'undefined' && typeof wx === 'undefined' &&
              /^https?:\/\//.test(curActualSrc)) {
            img.crossOrigin = 'anonymous';
          }
          img.src = curActualSrc;
        }

        // 并发限制：同一时刻最多 MAX_CONCURRENT 张图片在加载，超出的排队等待，
        // 避免换装关卡几十张缩略图一次性抢网络导致大面积超时。
        _enqueue(function () { attempt(actualSrc, 0); });
      });

      _pending[src] = promise;
      return promise;
    },

    /**
     * 同步获取已缓存纹理（未加载返回 null）
     * @param {string} src
     * @returns {{tex: WebGLTexture, img: HTMLImageElement}|null}
     */
    get: function (src) {
      return _cache[src] || null;
    },

    /**
     * 减少引用计数，到 0 时释放 GL 纹理（img 仍保留用于重建）
     * @param {string} src
     */
    release: function (src) {
      var entry = _cache[src];
      if (!entry) return;
      entry.refs--;
      if (entry.refs <= 0) {
        var gl = GLContext.gl;
        if (gl && entry.tex) gl.deleteTexture(entry.tex);
        delete _cache[src];
      }
    },

    /**
     * 释放一组纹理（场景切换时批量释放）
     * @param {string[]} srcList
     */
    releaseGroup: function (srcList) {
      for (var i = 0; i < srcList.length; i++) this.release(srcList[i]);
    },

    /**
     * contextRestored 时重建所有已缓存纹理
     * 由 GLContext 的 webglcontextrestored 事件触发
     */
    rebuildAll: function () {
      var gl = GLContext.gl;
      if (!gl) return;
      Object.keys(_cache).forEach(function (src) {
        var entry = _cache[src];
        if (entry.img) entry.tex = uploadTexture(gl, entry.img);
      });
    }
  };
})();
