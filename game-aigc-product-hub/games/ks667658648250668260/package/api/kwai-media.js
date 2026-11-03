/**
 * kwai-media.js — 快手小游戏 / Web 双端媒体模块（视频 + 音频 + 图片）
 *
 * 使用方式：
 *
 *   // 视频（快手 / Web 通用）
 *   KwaiMedia.Video.play('intro', {
 *     src:    'video/intro.mp4',
 *     width:  375,
 *     height: 667,
 *     onEnded: function() { KwaiMedia.Video.destroy('intro'); },
 *     onError: function() { KwaiMedia.Video.destroy('intro'); },
 *   });
 *
 *   // 视频背景 + canvas 叠加（underGameView，Web 端需传 canvas 参数）
 *   KwaiMedia.Video.play('bg', {
 *     src:            'video/bg.mp4',
 *     width:          750,
 *     height:         1334,
 *     underGameView:  true,
 *     canvas:         document.getElementById('gameCanvas'),
 *     loop:           true,
 *     muted:          true,
 *   });
 *
 *   // 音频
 *   KwaiMedia.Audio.playBgm('audio/bgm.mp3');
 *   KwaiMedia.Audio.playSfx('audio/click.mp3');
 *
 *   // 图片
 *   KwaiMedia.Image.load('assets/hero.png').then(function(img) { ctx.drawImage(img, x, y); });
 *
 *   // 退出销毁
 *   KwaiMedia.destroyAll();
 */

(function () {

  // ==================================================================
  //  Video 模块（快手小游戏 / Web 双环境适配）
  // ==================================================================

  var _videos = {};
  var _isKwai = typeof ks !== 'undefined' && ks.createVideo;
  var _videoEventMap = {
    loadeddata: 'onCandraw',
    play: 'onPlay',
    pause: 'onPause',
    ended: 'onEnded',
    error: 'onError',
    waiting: 'onWaiting',
    timeupdate: 'onTimeUpdate',
    progress: 'onProgress',
  };

  function _bindKwaiVideoEvents (video, options) {
    var events = ['onCandraw', 'onPlay', 'onPause', 'onStop', 'onTimeUpdate',
      'onEnded', 'onError', 'onWaiting', 'onProgress'];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (typeof options[ev] === 'function') video[ev](options[ev]);
    }
  }

  function _bindWebVideoEvents (videoEl, options) {
    for (var htmlEv in _videoEventMap) {
      if (_videoEventMap.hasOwnProperty(htmlEv)) {
        var cb = options[_videoEventMap[htmlEv]];
        if (typeof cb === 'function') {
          videoEl.addEventListener(htmlEv, (function (v, evName, fn) {
            return function () {
              if (evName === 'timeupdate') {
                fn({ position: v.currentTime, duration: v.duration || 0 });
              } else if (evName === 'progress' && v.buffered.length > 0) {
                var end = v.buffered.end(v.buffered.length - 1);
                fn({ buffered: v.duration ? (end / v.duration * 100) : 0, duration: v.duration || 0 });
              } else if (evName === 'loadeddata') {
                fn(v.videoWidth / (v.videoHeight || 1));
              } else if (evName === 'error') {
                fn('video load error');
              } else {
                fn();
              }
            };
          })(videoEl, htmlEv, cb));
        }
      }
    }
  }

  function _validateVideo (options) {
    if (!options.src) { console.error('[KwaiMedia] src 是必填参数'); return false; }
    if (options.width === undefined) { console.error('[KwaiMedia] width 是必填参数'); return false; }
    if (options.height === undefined) { console.error('[KwaiMedia] height 是必填参数'); return false; }
    return true;
  }

  function _applyKwaiVideoProps (video, options) {
    if (options.x !== undefined) video.x = options.x;
    if (options.y !== undefined) video.y = options.y;
    if (options.width !== undefined) video.width = options.width;
    if (options.height !== undefined) video.height = options.height;
    if (options.poster !== undefined) video.poster = options.poster;
    if (options.initialTime !== undefined) video.initialTime = options.initialTime;
    if (options.objectFit !== undefined) video.objectFit = options.objectFit;
    if (options.backgroundColor !== undefined) video.backgroundColor = options.backgroundColor;
    if (options.autoplay !== undefined) video.autoplay = !!options.autoplay;
    if (options.loop !== undefined) video.loop = !!options.loop;
    if (options.muted !== undefined) video.muted = !!options.muted;
    if (options.underGameView !== undefined) video.underGameView = !!options.underGameView;
    if (options.src !== undefined) video.src = options.src;
  }

  function _applyWebVideoProps (videoEl, options) {
    videoEl.style.position = 'absolute';
    videoEl.style.left = (options.x || 0) + 'px';
    videoEl.style.top = (options.y || 0) + 'px';
    videoEl.style.width = options.width + 'px';
    videoEl.style.height = options.height + 'px';
    videoEl.style.display = 'block';
    if (options.objectFit) videoEl.style.objectFit = options.objectFit;
    if (options.backgroundColor !== undefined) videoEl.style.backgroundColor = options.backgroundColor;
    if (options.loop !== undefined) videoEl.loop = !!options.loop;
    if (options.autoplay !== undefined) videoEl.autoplay = !!options.autoplay;
    if (options.muted !== undefined) videoEl.muted = !!options.muted;
    if (options.poster !== undefined) videoEl.poster = options.poster;
    if (options.controls !== undefined) videoEl.controls = !!options.controls;

    // underGameView: video 在 canvas 之下，canvas 透明叠加
    if (options.underGameView) {
      videoEl.style.zIndex = '1';
      videoEl.style.pointerEvents = 'none';
    }
  }

  function _setupUnderGameView (videoEl, options) {
    if (_isKwai) return;
    var canvas = options.canvas;
    if (!canvas) { console.warn('[KwaiMedia] underGameView 需要提供 canvas 参数'); return; }
    canvas.width = options.width;
    canvas.height = options.height;
    canvas.style.position = 'absolute';
    canvas.style.left = (options.x || 0) + 'px';
    canvas.style.top = (options.y || 0) + 'px';
    canvas.style.zIndex = '2';
    canvas.style.pointerEvents = 'auto';
  }

  function videoCreate (name, options) {
    options = options || {};
    if (!_validateVideo(options)) return null;
    if (_videos[name]) videoDestroy(name);

    if (_isKwai) {
      // 快手小游戏环境
      var video = ks.createVideo(options);
      _bindKwaiVideoEvents(video, options);
      _applyKwaiVideoProps(video, options);
      _videos[name] = video;
      return video;
    }

    // Web 环境
    var container = options.container || document.body;
    var videoEl = document.createElement('video');
    _applyWebVideoProps(videoEl, options);
    _bindWebVideoEvents(videoEl, options);

    if (options.underGameView) _setupUnderGameView(videoEl, options);

    if (options.initialTime !== undefined) videoEl.currentTime = options.initialTime;
    videoEl.src = options.src;
    container.appendChild(videoEl);

    _videos[name] = videoEl;
    return videoEl;
  }

  function videoPlay (name, options) {
    var v = _videos[name];
    if (v) {
      try { v.play(); } catch (e) { console.error('[KwaiMedia] play 失败:', e); }
      return;
    }
    if (!options) { console.error('[KwaiMedia] play 首次调用缺少 options'); return; }
    v = videoCreate(name, options);
    if (!v) return;
    if (options.autoplay !== false) {
      try {
        setTimeout(() => {
          v.play();
        }, 10);
      } catch (e) { console.error('[KwaiMedia] play 失败:', e); }
    }
  }

  function videoPause (name) { var v = _videos[name]; if (v) try { v.pause(); } catch (e) { } }
  function videoResume (name) { var v = _videos[name]; if (v) try { v.play(); } catch (e) { } }

  function videoStop (name) {
    if (_isKwai) { var v = _videos[name]; if (v) try { v.stop(); } catch (e) { } }
    else { var v = _videos[name]; if (v) { v.pause(); v.currentTime = 0; } }
  }

  function videoSeek (name, time) {
    if (typeof time !== 'number' || time < 0) { console.warn('[KwaiMedia] seek 参数无效'); return; }
    var v = _videos[name];
    if (!v) return;
    if (_isKwai) { try { v.seek(time); } catch (e) { } }
    else { v.currentTime = time; }
  }

  function videoDestroy (name) {
    if (_isKwai) {
      var v = _videos[name]; if (v) { try { v.destroy(); } catch (e) { } }
    } else {
      var v = _videos[name];
      if (v) { v.pause(); v.src = ''; if (v.parentNode) v.parentNode.removeChild(v); }
    }
    delete _videos[name];
  }

  function videoDestroyAll () {
    for (var name in _videos) { if (_videos.hasOwnProperty(name)) videoDestroy(name); }
    _videos = {};
  }

  function videoGet (name) { return _videos[name] || null; }

  // ==================================================================
  //  Audio 模块（BGM 单例 + 音效池，快手 / Web 双端）
  // ==================================================================

  var _bgm = null;
  var _sfxPool = {};
  var _sfxCount = 0;
  var _sfxMax = 10;
  var _voice = null;
  var _voiceSeq = 0;
  var _voiceSessionOrigin = null;
  var _voiceEndedHandler = null;
  var _voiceErrorHandler = null;
  var _audioSettings = { bgmEnabled: true, sfxEnabled: true, bgmVolume: 0.6, sfxVolume: 1.0 };

  function _createAudio () {
    if (_isKwai) {
      var a = ks.createInnerAudioContext();
      a.obeyMuteSwitch = false;
      return a;
    }
    return new Audio();
  }

  function _createSfxAudio () {
    if (_isKwai) {
      var a = ks.createInnerAudioContext();
      // 与 BGM 一致：不跟随系统静音开关。游戏音效/语音包是核心体验，
      // obeyMuteSwitch=true 时手机静音模式下全部无声（表现为"试听不播放"）
      a.obeyMuteSwitch = false;
      return a;
    }
    return new Audio();
  }

  function _audioDestroy (a) {
    if (_isKwai) { a.destroy(); }
    else { a.pause(); a.src = ''; a.load(); }
  }

  // ── BGM：快小 InnerAudio 换 src 不生效，切歌/恢复一律销毁重建 ──
  var _bgmList = [];
  var _bgmIndex = 0;
  var _bgmListMode = false;
  var _bgmSrc = '';          // 单曲模式当前曲目
  var _bgmLoadedSrc = '';    // 已加载到实例的曲目（不依赖读回 bgm.src）

  function _bgmCurrentSrc () {
    if (_bgmListMode && _bgmList.length) return _bgmList[_bgmIndex];
    return _bgmSrc || '';
  }

  function _startBgm () {
    var src = _bgmCurrentSrc();
    if (!src || !_audioSettings.bgmEnabled) return;
    // 同一曲且还在播 → 跳过（防止重复调用把 BGM 打断重头）
    if (_bgm && _bgmLoadedSrc === src && !_bgm.paused) return;
    // 销毁旧实例重建：换 src 在快小上不生效，必须新实例
    if (_bgm) { try { _audioDestroy(_bgm); } catch (e) {} _bgm = null; }
    var a = _createAudio();
    a.loop = !_bgmListMode;                    // 单曲循环；轮播由 ended 驱动切下一首
    a.volume = _audioSettings.bgmVolume;
    a.src = src;
    _bgm = a;
    _bgmLoadedSrc = src;
    // 新实例重新绑 ended；旧实例销毁时监听随之释放，无泄漏
    if (_isKwai) { if (a.onEnded) a.onEnded(_bgmPlayNext); }
    else { a.addEventListener('ended', _bgmPlayNext); }
    var p = a.play();
    if (p && typeof p.catch === 'function') p.catch(function () { });
  }

  function _bgmPlayNext () {
    if (!_bgmListMode || !_bgmList.length) return;
    _bgmIndex = (_bgmIndex + 1) % _bgmList.length;
    if (_audioSettings.bgmEnabled) _startBgm();
  }

  function audioPlayBgm (src) {
    _bgmListMode = false;
    if (src) _bgmSrc = src;
    // 开关关闭时只记住曲目；重新打开时 resumeBgm 会销毁重建播放
    if (!_audioSettings.bgmEnabled) return;
    _startBgm();
  }

  function audioPlayBgmList (list) {
    if (!list || !list.length) return;
    _bgmList = list.slice();
    _bgmIndex = 0;
    _bgmListMode = true;
    if (!_audioSettings.bgmEnabled) return;
    _startBgm();
  }

  function audioPauseBgm () { if (_bgm) { try { _bgm.pause(); } catch (e) {} } }
  function audioResumeBgm () {
    if (!_audioSettings.bgmEnabled || !_bgmCurrentSrc()) return;
    // 快小暂停态实例直接 play() 不可靠，销毁重建从头播
    _startBgm();
  }
  function audioStopBgm () {
    if (_bgm) {
      try { _bgm.pause(); } catch (e) {}
      if (_isKwai) { try { _bgm.seek(0); } catch (e) {} }
      else { _bgm.currentTime = 0; }
    }
  }

  function audioPlaySfx (src) {
    if (!_audioSettings.sfxEnabled) return;
    var a = _sfxPool[src];
    if (!a) {
      if (_sfxCount >= _sfxMax) {
        for (var k in _sfxPool) { if (_sfxPool.hasOwnProperty(k)) { _audioDestroy(_sfxPool[k]); delete _sfxPool[k]; _sfxCount--; break; } }
      }
      a = _createSfxAudio();
      a.volume = _audioSettings.sfxVolume;
      a.src = src;
      _sfxPool[src] = a;
      _sfxCount++;
    }
    if (_isKwai) { try { a.seek(0); } catch (e) {} }
    else { a.currentTime = 0; }
    var sp = a.play();
    if (sp && typeof sp.catch === 'function') sp.catch(function () { });
  }

  function _unbindVoiceEvents () {
    if (!_voice) return;
    try {
      if (_isKwai) {
        if (_voiceEndedHandler && _voice.offEnded) _voice.offEnded(_voiceEndedHandler);
        if (_voiceErrorHandler && _voice.offError) _voice.offError(_voiceErrorHandler);
      } else {
        if (_voiceEndedHandler) _voice.removeEventListener('ended', _voiceEndedHandler);
        if (_voiceErrorHandler) _voice.removeEventListener('error', _voiceErrorHandler);
      }
    } catch (e) {}
    _voiceEndedHandler = null;
    _voiceErrorHandler = null;
  }

  // 快小 InnerAudio 换 src 不生效：语音实例用完即销毁，需要播再创建
  function _stopVoiceInstance () {
    if (!_voice) return;
    _unbindVoiceEvents();
    try { _voice.pause(); } catch (e) {}
    try { _audioDestroy(_voice); } catch (e) {}
    _voice = null;
  }

  function _finishVoice (seq, options) {
    if (seq !== _voiceSeq) return;
    _stopVoiceInstance();
    var origin = _voiceSessionOrigin;
    _voiceSessionOrigin = null;
    if (origin != null) audioFadeBgm(origin, 500);
    if (options && typeof options.onEnded === 'function') options.onEnded();
  }

  function audioPlayVoice (src, options) {
    options = options || {};
    if (!src || !_audioSettings.sfxEnabled) return false;
    if (_voiceSessionOrigin == null) {
      _voiceSessionOrigin = _bgm ? Number(_bgm.volume) : Number(_audioSettings.bgmVolume);
    }
    var seq = ++_voiceSeq;
    // 销毁旧实例重建：换 src 复用在快小上不生效（第一次能播，后续全哑）
    _stopVoiceInstance();
    _voice = _createSfxAudio();
    _voice.volume = _audioSettings.sfxVolume;
    _voiceEndedHandler = function () { _finishVoice(seq, options); };
    _voiceErrorHandler = function (err) {
      if (seq !== _voiceSeq) return;
      _finishVoice(seq, null);
      if (typeof options.onError === 'function') options.onError(err || new Error('voice_play_failed'));
    };
    if (_isKwai) {
      if (_voice.onEnded) _voice.onEnded(_voiceEndedHandler);
      if (_voice.onError) _voice.onError(_voiceErrorHandler);
    } else {
      _voice.addEventListener('ended', _voiceEndedHandler);
      _voice.addEventListener('error', _voiceErrorHandler);
    }
    audioFadeBgm(Math.min(_voiceSessionOrigin, 0.3), 300);
    _voice.src = src;
    var playResult;
    try { playResult = _voice.play(); } catch (err) { _voiceErrorHandler(err); return false; }
    if (playResult && typeof playResult.catch === 'function') playResult.catch(_voiceErrorHandler);
    return true;
  }

  function audioStopVoice () {
    if (!_voice && _voiceSessionOrigin == null) return;
    ++_voiceSeq;
    _stopVoiceInstance();
    var origin = _voiceSessionOrigin;
    _voiceSessionOrigin = null;
    if (origin != null) audioFadeBgm(origin, 500);
  }

  function audioSetBgmVolume (v) { _audioSettings.bgmVolume = v; if (_bgm) _bgm.volume = v; }

  var _fadeTimer = null;
  function audioFadeBgm (to, duration) {
    to = Math.max(0, Math.min(1, to));
    duration = duration || 800;
    clearInterval(_fadeTimer);
    if (!_bgm) { _audioSettings.bgmVolume = to; return; }
    var from = _bgm.volume;
    var steps = Math.round(duration / 30); // 30ms 一步
    var step = (to - from) / steps;
    var i = 0;
    _fadeTimer = setInterval(function () {
      i++;
      var v = from + step * i;
      if (i >= steps) { v = to; clearInterval(_fadeTimer); _fadeTimer = null; }
      _bgm.volume = v;
      _audioSettings.bgmVolume = v;
    }, 30);
  }
  function audioSetSfxVolume (v) {
    _audioSettings.sfxVolume = v;
    for (var k in _sfxPool) { if (_sfxPool.hasOwnProperty(k)) _sfxPool[k].volume = v; }
    if (_voice) _voice.volume = v;
  }
  function audioSetBgmEnabled (e) { _audioSettings.bgmEnabled = e; e ? audioResumeBgm() : audioPauseBgm(); }
  function audioSetSfxEnabled (e) { _audioSettings.sfxEnabled = e; if (!e) audioStopVoice(); }

  function audioDestroyAll () {
    audioStopVoice();
    if (_voice) { _audioDestroy(_voice); _voice = null; }
    if (_bgm) { _audioDestroy(_bgm); _bgm = null; }
    _bgmLoadedSrc = ''; _bgmSrc = ''; _bgmList = []; _bgmIndex = 0; _bgmListMode = false;
    for (var k in _sfxPool) { if (_sfxPool.hasOwnProperty(k)) _audioDestroy(_sfxPool[k]); }
    _sfxPool = {}; _sfxCount = 0;
  }

  function audioDestroyAllSfx () {
    for (var k in _sfxPool) { if (_sfxPool.hasOwnProperty(k)) _audioDestroy(_sfxPool[k]); }
    _sfxPool = {}; _sfxCount = 0;
  }

  // ==================================================================
  //  Image 模块（快手 / Web 双端）
  // ==================================================================

  function imageLoad (src) {
    return new Promise(function (resolve, reject) {
      var img = _isKwai ? ks.createImage() : new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function (err) { reject(err); };
      img.src = src;
    });
  }

  function imageLoadAll (srcs) {
    var tasks = [];
    var result = {};
    for (var i = 0; i < srcs.length; i++) {
      (function (s) {
        tasks.push(imageLoad(s).then(function (img) { result[s] = img; }));
      })(srcs[i]);
    }
    return Promise.all(tasks).then(function () { return result; });
  }

  // ==================================================================
  //  切后台自动暂停 / 回前台自动恢复（快手 + Web）
  // ==================================================================

  function _pauseAllVideos () {
    for (var name in _videos) { if (_videos.hasOwnProperty(name)) videoPause(name); }
  }
  function _resumeAllVideos () {
    for (var name in _videos) { if (_videos.hasOwnProperty(name)) videoResume(name); }
  }

  if (typeof KwaiEvent !== 'undefined' && KwaiEvent.on) {
    KwaiEvent.on('kwai:hide', function () { audioPauseBgm(); _pauseAllVideos(); });
    KwaiEvent.on('kwai:show', function () { audioResumeBgm(); _resumeAllVideos(); });
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { audioPauseBgm(); _pauseAllVideos(); }
      else { audioResumeBgm(); _resumeAllVideos(); }
    });
  }

  // ==================================================================
  //  公开 API
  // ==================================================================

  function destroyAll () {
    videoDestroyAll();
    audioDestroyAll();
  }

  window.KwaiMedia = {
    Video: {
      create: videoCreate,
      play: videoPlay,
      pause: videoPause,
      resume: videoResume,
      stop: videoStop,
      seek: videoSeek,
      destroy: videoDestroy,
      destroyAll: videoDestroyAll,
      get: videoGet,
    },
    Audio: {
      playBgm: audioPlayBgm,
      playBgmList: audioPlayBgmList,
      pauseBgm: audioPauseBgm,
      resumeBgm: audioResumeBgm,
      stopBgm: audioStopBgm,
      playSfx: audioPlaySfx,
      playVoice: audioPlayVoice,
      stopVoice: audioStopVoice,
      setBgmVolume: audioSetBgmVolume,
      fadeBgm: audioFadeBgm,
      setSfxVolume: audioSetSfxVolume,
      setBgmEnabled: audioSetBgmEnabled,
      setSfxEnabled: audioSetSfxEnabled,
      destroyAll: audioDestroyAll,
      destroyAllSfx: audioDestroyAllSfx,
    },
    Image: {
      load: imageLoad,
      loadAll: imageLoadAll,
    },
    destroyAll: destroyAll,
  };

})();