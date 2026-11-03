// video.js · 视频播放（本地路径或 CDN URL 都支持）
(function () {
  var G = GameGlobal;
  var videoInstance = null;
  var Video = {
    play: function (src, rect, onEnded) {
      Video.destroy();
      try {
        if (!ks.createVideo) { if (onEnded) onEnded(); return; }
        // 支持 http(s):// 直接传，否则当本地 assets 路径
        var finalSrc = (src && src.indexOf && src.indexOf('http') === 0)
          ? src
          : ('assets/video/' + src + '.mp4');
        videoInstance = ks.createVideo({
          src: finalSrc,
          x: rect.x, y: rect.y, width: rect.w, height: rect.h,
          autoplay: true, controls: false, muted: false, loop: false, showCenterPlayBtn: false
        });
        if (videoInstance.onEnded) {
          videoInstance.onEnded(function () {
            Video.destroy();
            if (onEnded) onEnded();
          });
        }
        if (videoInstance.onError) {
          videoInstance.onError(function (err) {
            console.warn('[video] onError', err);
            Video.destroy();
            if (onEnded) onEnded();
          });
        }
      } catch (e) {
        console.warn('[video] play exception', e);
        if (onEnded) onEnded();
      }
    },
    destroy: function () {
      if (videoInstance) {
        try { videoInstance.stop && videoInstance.stop(); } catch (e) {}
        try { videoInstance.destroy && videoInstance.destroy(); } catch (e) {}
        videoInstance = null;
      }
    },
    isPlaying: function () { return !!videoInstance; }
  };
  G.Video = Video;
})();
