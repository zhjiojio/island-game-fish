// audio.js · 音频管理（BGM + 台词）
(function () {
  var G = GameGlobal;
  var voiceCtx = null;
  var Audio = {
    muted: false,
    playVoice: function (name, onEnded) {
      if (!name) { if (onEnded) onEnded(); return; }
      try {
        if (voiceCtx) { try { voiceCtx.stop(); voiceCtx.destroy && voiceCtx.destroy(); } catch (e) {} }
        voiceCtx = ks.createInnerAudioContext();
        voiceCtx.src = 'assets/audio/' + name + '.mp3';
        voiceCtx.volume = Audio.muted ? 0 : 1.0;
        voiceCtx.onEnded(function () { if (onEnded) onEnded(); });
        voiceCtx.onError(function () { if (onEnded) onEnded(); });
        voiceCtx.play();
      } catch (e) {
        if (onEnded) onEnded();
      }
    },
    stopVoice: function () {
      if (voiceCtx) { try { voiceCtx.stop(); } catch (e) {} }
    },
    setMuted: function (m) {
      Audio.muted = !!m;
      if (voiceCtx) voiceCtx.volume = m ? 0 : 1.0;
    }
  };
  G.Audio = Audio;
})();
