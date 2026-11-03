// js/tb-loader.js — 媒体资源加载层（快手 Canvas 运行时 / H5 双端兼容）
// 职责：
//   1. 视频：wx.downloadFile 缓存 → wx.createVideo（underGameView 置于 canvas 之下）
//   2. 图片：wx.createImage / new Image()
//   3. 音频：wx.createInnerAudioContext / Audio
//   4. 顺序预取：沿剧情 next 链提前下载后续视频，避免切镜黑屏
(function () {
  var M3 = window.M3;
  var isKS = typeof wx !== 'undefined' && !!wx.createVideo;

  // ─── 视频本地缓存 ────────────────────────────────────────────
  var vCache = {};    // url -> localPath
  var vLoading = {};  // url -> true

  function ensureLocal(url, cb) {
    if (vCache[url]) { cb && cb(vCache[url]); return; }
    if (!isKS || !wx.downloadFile) { cb && cb(url); return; }
    if (vLoading[url]) {
      var t = setInterval(function () {
        if (vCache[url]) { clearInterval(t); cb && cb(vCache[url]); }
        else if (!vLoading[url]) { clearInterval(t); cb && cb(url); }
      }, 200);
      return;
    }
    vLoading[url] = true;
    try {
      wx.downloadFile({
        url: url,
        success: function (res) {
          var local = res.tempFilePath || res.filePath || url;
          vCache[url] = local; vLoading[url] = false;
          cb && cb(local);
        },
        fail: function (e) {
          vLoading[url] = false;
          console.log('[v] dl-fail', url, e && e.errMsg);
          cb && cb(url);
        }
      });
    } catch (e) { vLoading[url] = false; cb && cb(url); }
  }

  function isCached(url) { return !!vCache[url]; }
  function cachedVideo(url) { return vCache[url] || null; }

  function videoSource(file) {
    var value = String(file || '');
    if (/^(https?:|wxfile:|ksfile:|file:)/.test(value) || value.charAt(0) === '/') return value;
    return M3.Config.url(value);
  }

  // ─── 图片 ────────────────────────────────────────────────────
  var imgCache = {};
  function loadImage(file, cb) {
    var src = M3.Config.url(file);
    if (imgCache[src]) { cb && cb(imgCache[src]); return; }
    var im;
    try {
      im = isKS && wx.createImage ? wx.createImage()
         : (typeof Image !== 'undefined' ? new Image() : null);
    } catch (e) { im = null; }
    if (!im) { cb && cb(null); return; }
    var done = false;
    im.onload = function () {
      if (done) return; done = true;
      imgCache[src] = im; cb && cb(im);
    };
    im.onerror = function () {
      if (done) return; done = true;
      console.log('[img] err', src); cb && cb(null);
    };
    setTimeout(function () {
      if (done) return; done = true;
      console.log('[img] timeout', src); cb && cb(null);
    }, 8000);
    im.src = src;
  }
  function getImage(file) { return imgCache[M3.Config.url(file)] || null; }

  // ─── 音频（人声 / 音效）────────────────────────────────────────
  function createAudio(file) {
    var src = M3.Config.url(file);
    try {
      if (isKS && wx.createInnerAudioContext) {
        var a = wx.createInnerAudioContext();
        a.src = src;
        return a;
      }
      if (typeof Audio !== 'undefined') {
        var h = new Audio(); h.src = src; return h;
      }
    } catch (e) {}
    return null;
  }

  // ─── 视频实例 ─────────────────────────────────────────────────
  // 无缝切换策略：先建新视频，onPlay 触发（首帧已出）后再销毁旧实例
  function createVideo(file, opt, handlers) {
    var src = videoSource(file);
    if (!isKS) return null;
    var v = wx.createVideo({
      src: src,
      x: 0, y: 0,
      width: opt.width, height: opt.height,
      autoplay: true, controls: false, objectFit: 'cover',
      loop: !!opt.loop,
      underGameView: true,          // 关键：视频置于 canvas 之下，HUD 才能叠加
      showCenterPlayBtn: false,
      enableProgressGesture: false,
      muted: !!opt.muted
    });
    if (handlers) {
      if (handlers.onPlay  && v.onPlay)  v.onPlay(handlers.onPlay);
      if (handlers.onEnded && v.onEnded) v.onEnded(handlers.onEnded);
      if (handlers.onError && v.onError) v.onError(handlers.onError);
    }
    try { v.play(); } catch (e) {}
    return v;
  }

  function destroyVideo(v) {
    if (v && v.destroy) { try { v.destroy(); } catch (e) {} }
  }

  M3.Loader = {
    isKS:         isKS,
    ensureLocal:  ensureLocal,
    isCached:     isCached,
    cachedVideo:  cachedVideo,
    loadImage:    loadImage,
    getImage:     getImage,
    createAudio:  createAudio,
    createVideo:  createVideo,
    destroyVideo: destroyVideo
  };
})();
