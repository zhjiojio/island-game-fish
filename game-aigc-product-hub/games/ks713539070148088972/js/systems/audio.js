/**
 * systems/audio.js — 音效/BGM/震动/语音包
 * 职责：
 *   - 音频上下文预创建复用 pool（快手环境频繁 new 会卡顿）
 *   - BGM 轮播 + duck（人声响时 BGM 降音量）
 *   - 语音包路径路由（CDN / 子包，全部在此维护）
 *   - 震动封装（ks.vibrateShort 语义化）
 *   - 全局静音开关
 * 依赖：CONFIG, Storage, SubpackageLoader
 * 导出：Audio
 */
(function () {
  'use strict';

  // ── 平台音频工厂 ──────────────────────────────────────────────────────────────
  function createAudioCtx() {
    if (typeof ks !== 'undefined' && ks.createInnerAudioContext)
      return ks.createInnerAudioContext();
    if (typeof wx !== 'undefined' && wx.createInnerAudioContext)
      return wx.createInnerAudioContext();
    // 浏览器兜底（index.html 本地预览用）：用原生 <audio> 模拟 InnerAudioContext 接口，
    // 否则 BGM/音效在浏览器里全部静默（play/stop 均为空函数）。
    if (typeof window !== 'undefined' && typeof window.Audio === 'function' && !window.Audio.__isM3Stub) {
      var el = new window.Audio();
      var wrapper = {
        _el: el,
        _inUse: false,
        onEnded: null,
        onError: null,
        get src() { return el.src; },
        set src(v) { try { el.src = v; el.load(); } catch (e) {} },
        get loop() { return el.loop; },
        set loop(v) { el.loop = !!v; },
        get volume() { return el.volume; },
        set volume(v) { try { el.volume = v; } catch (e) {} },
        play: function () { var p = el.play(); if (p && p.catch) p.catch(function () {}); },
        stop: function () { try { el.pause(); el.currentTime = 0; } catch (e) {} },
        seek: function (t) { try { el.currentTime = t || 0; } catch (e) {} }
      };
      el.addEventListener('ended', function () { if (wrapper.onEnded) wrapper.onEnded(); });
      el.addEventListener('error', function () { if (wrapper.onError) wrapper.onError(); });
      return wrapper;
    }
    // 最终兜底：不支持任何音频能力的环境，返回空对象
    return {
      src: '', loop: false, volume: 1,
      play: function () {}, stop: function () {}, seek: function () {},
      onEnded: null, onError: null, _inUse: false
    };
  }

  // ── 音频池 ────────────────────────────────────────────────────────────────────
  var POOL_SIZE = 6;
  var _pool = [];
  function getPoolItem() {
    for (var i = 0; i < _pool.length; i++) {
      var p = _pool[i];
      if (!p._inUse) return p;
    }
    if (_pool.length < POOL_SIZE) {
      var a = createAudioCtx();
      a._inUse = false;
      _pool.push(a);
      return a;
    }
    // pool 满时复用最旧的
    var oldest = _pool[0];
    try { oldest.stop(); } catch(e) {}
    oldest._inUse = false;
    return oldest;
  }

  // BGM 专用通道（3 首轮播）
  var _bgmCtx     = null;
  var _bgmIdx     = 0;
  var _bgmPaused  = false;
  var _bgmVolume  = 0.6;  // BGM 正常音量

  // 场景单曲循环 BGM 通道（选择关卡/关卡中，与上面的轮播通道独立）
  var _bgmTrackCtx = null;
  var _bgmTrackKey = null;
  var _bgmTrackSrc = null;
  // BGM 统一缓存：按真实 src 管理音频播放器实例，播放后不删除，只更新状态。
  // ctx 是 ks.createInnerAudioContext() / 浏览器 <audio> 的统一包装对象。
  var _bgmCache = {};
  // 静音期间记住最近播放的场景单曲 key，避免重新开启音乐时误播成 startBgm() 的
  // 通用轮播列表（该列表是脚手架遗留的占位曲目，命名 bgm_2_northeast 等来自旧
  // 「老铁」模版，不是本产品真正的 BGM——见 toggleBgmMuted 的踩坑记录）
  var _pausedBgmTrackKey = null;
  var _pausedBgmTrackSrc = null;

  // 人声当前通道
  var _voiceCtx   = null;

  // 全局静音状态
  var _muted      = false;
  var _bgmMuted   = false;

  // 当前语音包 id
  var _voicePackId = 'xiaomei';

  var Audio = window.Audio = window.M3Audio = {

    init: function () {
      var K = CONFIG.STORAGE_KEYS;
      _muted    = Storage.get(K.sfxEnabled) === '0';
      _bgmMuted = Storage.get(K.bgmEnabled) === '0';
      _voicePackId = Storage.get(K.voicePack) || CONFIG.DEFAULT_VOICE_PACK;
      // 验证语音包今日是否解锁
      this._validateVoicePack();
      // 预载短音效
      this._preloadSfx();
    },

    // ── 短音效 ────────────────────────────────────────────────────────────────
    // 每个 key 的多实例小轮播池（见 _playSfx 注释：避免 stop()+seek(0) 重启同一个
    // audio 实例造成的解码/寻址延迟，把极短音效（如 wrong.mp3 仅 0.18s）整段吃掉）
    _sfxPool: {},
    _SFX_POOL_SIZE: 3,

    _preloadSfx: function () {
      var preloadKeys = ['correct', 'wrong', 'tick'];
      var self = this;
      preloadKeys.forEach(function (k) {
        var cfg = CONFIG.AUDIO[k];
        if (!cfg) return;
        // 提前把轮播池填满并预设好 src，首次点错/点对时直接播放已就绪的实例，
        // 不必现造 ctx 再等 src 首次加载。
        var pool = self._sfxPool[k] = { list: [], idx: 0 };
        for (var i = 0; i < self._SFX_POOL_SIZE; i++) {
          var ctx = createAudioCtx();
          ctx.src = cfg.cdn || cfg.local;
          pool.list.push(ctx);
        }
      });
    },

    /**
     * 播放短音效。旧实现每次都对同一个共享 ctx 执行 stop()+seek(0)+play()，
     * 在快手/微信小游戏 InnerAudioContext 上，对"正在播放中的实例"执行 stop 再
     * play 会有一段真实的重新寻址/解码延迟（几十~上百毫秒）。对 correct.mp3(0.6s)
     * 这类较长音效影响不明显，但 wrong.mp3 只有 0.18s，短时间内连续点错时这段延迟
     * 经常会把整段音频"吃掉"，表现为画面上有点错反馈动画、却完全听不到音效
     * （旧 bug）。现改为每个 key 维护一个小轮播池（默认 3 个实例），轮流播放，
     * 不必等待/打断同一实例，从根本上避免这段重启延迟。
     */
    _playSfx: function (key) {
      if (_muted) return;
      var cfg = CONFIG.AUDIO[key];
      var src = (cfg && cfg.cdn) || (cfg && cfg.local) || '';
      if (!src) return;

      var pool = this._sfxPool[key];
      if (!pool) { pool = this._sfxPool[key] = { list: [], idx: 0 }; }
      if (pool.list.length < this._SFX_POOL_SIZE) {
        var ctx = createAudioCtx();
        ctx.src = src;
        pool.list.push(ctx);
      }
      var inst = pool.list[pool.idx];
      pool.idx = (pool.idx + 1) % pool.list.length;
      try { inst.play(); } catch (e) {}
    },

    // ── 语义化音效 API（业务层调用）──────────────────────────────────────────
    playCorrect:  function () { this._playSfx('correct'); this._vibrate('medium'); },
    playWrong:    function () { this._playSfx('wrong');   this._vibrate('light');  },
    playTick:     function () { this._playSfx('tick'); },
    playTimeup:   function () { this._playVoice('timeup') || this._playSfx('timeup'); },
    playHint:     function () { this._playSfx('hint'); },
    playRevive:   function () { this._playSfx('revive'); },
    playSkip:     function () { this._playSfx('skip'); },
    playLose:     function () {
      this._vibrate('heavy'); this._vibrate('heavy');
      this._playVoice('timeup') || this._playSfx('timeup');
      this._playSfx('loseModal');
    },

    // ── 全局一次性音效（关卡转场/通关/UI点击）────────────────────────────────
    playLevelTransition: function () { this._playSfx('levelTransition'); },
    playWin:      function () { this._playSfx('win'); },
    playAllFoundFlash: function () { this._playSfx('allFoundFlash'); },
    playUiClick:         function () { this._playSfx('uiClick'); },

    // ── 换装模式专属音效（区别于找茬模式的 correct/wrong）────────────────────
    playDressupCorrect:    function () { this._playSfx('dressupCorrect'); this._vibrate('medium'); },
    playDressupWrong:      function () { this._playSfx('dressupWrong');   this._vibrate('light');  },
    playDressupCharSwitch: function () { this._playSfx('dressupCharSwitch'); },
    playDressupOutfitPick: function () { this._playSfx('dressupOutfitPick'); },

    /** 播放语音包 clip（key = clip 名，不含包前缀） */
    play: function (key) {
      if (_muted) return;
      // 随机候选
      var resolved = this._resolveKey(key);
      this._playVoice(resolved);
    },

    // ── BGM ───────────────────────────────────────────────────────────────────
    // 注意：这三个 BGM 播放入口只应受「音乐」开关（_bgmMuted）控制，不应再叠加
    // 判断 _muted（「音效」开关）——两个开关在 settings-overlay.js 里是两个独立按钮
    // （音乐行 toggleBgmMuted / 音效行 toggleMuted），叠加判断会导致关掉音效的同时
    // 把音乐也一起挡住启动/续播（旧 bug：关任意一个开关，另一个的音频都会消失）。
    startBgm: function () {
      if (_bgmMuted) return;
      if (_bgmCtx && !_bgmPaused) return; // 已在播
      if (!_bgmCtx) {
        _bgmCtx = createAudioCtx();
        _bgmCtx.loop = false;
        var self = this;
        _bgmCtx.onEnded = function () { self._nextBgm(); };
      }
      _bgmPaused = false;
      this._playBgmTrack(_bgmIdx);
    },

    stopBgm: function () {
      if (_bgmCtx) {
        try { _bgmCtx.stop(); } catch(e) {}
        _bgmPaused = true;
      }
      // 场景单曲循环轨也一并停掉，避免和轮播 BGM 叠音；停之前先记住 key，
      // 供 toggleBgmMuted() 重新开启音乐时恢复回同一首场景曲，而不是误播
      // startBgm() 的通用轮播占位曲目。
      if (_bgmTrackCtx) {
        if (_bgmTrackKey) {
          _pausedBgmTrackKey = _bgmTrackKey;
          _pausedBgmTrackSrc = _bgmTrackSrc;
        }
        if (_bgmTrackSrc && _bgmCache[_bgmTrackSrc]) {
          _bgmCache[_bgmTrackSrc].state = 'stopped';
        }
        try { _bgmTrackCtx.stop(); } catch(e) {}
        _bgmTrackKey = null;
        _bgmTrackSrc = null;
      }
    },

  /**
  * 按场景切换单曲循环 BGM（如"选择关卡"/"关卡中"），与 startBgm() 的三首轮播互不干扰。
     * @param {string} key  CONFIG.AUDIO.bgm.tracks 里的 key
     */
    startBgmTrack: function (key) {
      if (_bgmMuted) return;
      var tracks = CONFIG.AUDIO.bgm.tracks || {};
      var cfg = tracks[key];
      if (!cfg) return;
      this.playBgm(cfg.cdn || cfg.local, key);
    },

    /**
     * 预热场景 BGM：设置 src 会触发平台开始下载/解码，但不调用 play，避免
     * welcome/home 阶段提前听到关卡音乐。进入对应场景时由 playBgm 复用这个音频对象。
     */
    preloadBgmTrack: function (key) {
      var tracks = CONFIG.AUDIO.bgm.tracks || {};
      var cfg = tracks[key];
      var src = cfg && (cfg.cdn || cfg.local);
      this.preloadBgm(src, key);
    },

    /** 统一预热通用场景音乐（关卡列表 + 关卡内）。 */
    preloadCommonBgms: function () {
      this.preloadBgmTrack('select_level');
      this.preloadBgmTrack('in_level');
    },

    /**
     * 预热任意 BGM。只设置 src，不播放；同一个 src 始终复用同一个缓存项。
     * state 是播放器生命周期状态，不代表平台已经完成全部音频解码：
     * loading → 已开始加载，playing → 正在播放，stopped → 已停止，error → 加载失败。
     */
    preloadBgm: function (src, key) {
      if (_bgmMuted || !src || !key) return null;
      if (_bgmCache[src]) return _bgmCache[src];

      var ctx = createAudioCtx();
      var entry = _bgmCache[src] = {
        ctx: ctx,
        key: key,
        src: src,
        state: 'loading'
      };
      ctx.loop = true;
      ctx.volume = 0;
      ctx.onError = function (err) {
        if (_bgmCache[src] === entry) {
          entry.state = 'error';
          entry.error = err || null;
        }
      };
      ctx.src = src;
      return entry;
    },

    /** 预热主题专属 BGM；未配置时预热默认关卡音乐。 */
    preloadThemeBgm: function (theme) {
      var src = RemoteConfig.getThemeBgmSrc(theme);
      if (src) {
        this.preloadBgm(src, 'theme:' + src);
      } else {
        this.preloadBgmTrack('in_level');
      }
    },

    /**
     * 直接播放主题字段里的完整 CDN URL，不对文件名做任何拼接或映射；
     * URL 为空/非法时回退默认关卡曲。
     */
    startThemeBgm: function (theme) {
      var src = RemoteConfig.getThemeBgmSrc(theme);
      if (src) {
        this.playBgm(src, 'theme:' + src);
      } else {
        this.startBgmTrack('in_level');
      }
    },

    /** 播放指定 BGM；优先复用 preloadBgm 已创建的播放器实例。 */
    playBgm: function (src, key) {
      if (_bgmMuted || !src) return;
      // 停掉轮播 BGM 通道，避免和场景单曲同时播放
      if (_bgmCtx) { try { _bgmCtx.stop(); } catch(e) {} _bgmPaused = true; }
      if (_bgmTrackSrc === src && _bgmTrackCtx) {
        var current = _bgmCache[src];
        if (current) current.state = 'playing';
        try { _bgmTrackCtx.play(); } catch (e0) {}
        return;
      }

      var entry = _bgmCache[src];
      if (!entry || entry.state === 'error') {
        delete _bgmCache[src];
        entry = this.preloadBgm(src, key);
      }
      if (!entry) return;

      if (_bgmTrackCtx && _bgmTrackCtx !== entry.ctx) {
        try { _bgmTrackCtx.stop(); } catch (e1) {}
        if (_bgmTrackSrc && _bgmCache[_bgmTrackSrc]) {
          _bgmCache[_bgmTrackSrc].state = 'stopped';
        }
      }
      _bgmTrackCtx = entry.ctx;
      _bgmTrackKey = key;
      _bgmTrackSrc = src;
      entry.key = key;
      entry.state = 'playing';
      _bgmTrackCtx.loop = true;
      _bgmTrackCtx.volume = _bgmVolume;
      try { _bgmTrackCtx.play(); } catch (e2) {}
    },

    stopBgmTrack: function () {
      if (_bgmTrackCtx) {
        if (_bgmTrackSrc && _bgmCache[_bgmTrackSrc]) {
          _bgmCache[_bgmTrackSrc].state = 'stopped';
        }
        try { _bgmTrackCtx.stop(); } catch(e) {}
      }
      _bgmTrackKey = null;
      _bgmTrackSrc = null;
    },

    _playBgmTrack: function (idx) {
      var list = CONFIG.AUDIO.bgm.cdn;
      if (!list || !list.length) return;
      _bgmIdx = idx % list.length;
      _bgmCtx.src    = list[_bgmIdx];
      _bgmCtx.volume = _bgmVolume;
      try { _bgmCtx.play(); } catch(e) {}
    },

    _nextBgm: function () {
      if (_bgmPaused || _bgmMuted) return;
      this._playBgmTrack(_bgmIdx + 1);
    },

    // ── 语音包 ────────────────────────────────────────────────────────────────
    setVoicePack: function (packId, cb) {
      var self = this;
      // 非 xiaomei 先确保 voice-extra 子包加载（remaining_* 提示语音在该子包内）。
      // 注意：M3.SubpackageLoader（不是全局 SubpackageLoader）；且该子包目前未
      // 真实声明/未放素材，见 CONFIG.VOICE_EXTRA_SUBPACKAGE_ENABLED 说明，未启用
      // 时直接跳过加载，不影响切换语音包本身（remaining_* 语音会静默不播放）。
      var loader = (typeof M3 !== 'undefined') && M3.SubpackageLoader;
      if (packId !== 'xiaomei' && CONFIG.VOICE_EXTRA_SUBPACKAGE_ENABLED && loader) {
        loader.loadVoiceExtra(function () {
          self._doSetVoicePack(packId, cb);
        }, function () {
          // 子包加载失败：不阻塞切换语音包，仅 remaining_* 语音会缺失
          self._doSetVoicePack(packId, cb);
        });
      } else {
        this._doSetVoicePack(packId, cb);
      }
    },

    _doSetVoicePack: function (packId, cb) {
      _voicePackId = packId;
      Storage.set(CONFIG.STORAGE_KEYS.voicePack, packId);
      if (_voiceCtx) {
        try { _voiceCtx.stop(); } catch(e) {}
        _voiceCtx._inUse = false;
        _voiceCtx = null;
      }
      setTimeout(function () {
        if (cb) cb();
        Audio.play('greet');
      }, 100);
    },

    _validateVoicePack: function () {
      if (_voicePackId === CONFIG.DEFAULT_VOICE_PACK) return;
      var pack = CONFIG.VOICE_PACKS.find(function (p) { return p.id === _voicePackId; });
      if (!pack) { _voicePackId = CONFIG.DEFAULT_VOICE_PACK; return; }
      if (!pack.free) {
        var unlocked = Storage.isDailyUnlocked(CONFIG.STORAGE_KEYS.voiceUnlocks, _voicePackId);
        if (!unlocked) {
          _voicePackId = CONFIG.DEFAULT_VOICE_PACK;
          Storage.set(CONFIG.STORAGE_KEYS.voicePack, CONFIG.DEFAULT_VOICE_PACK);
        }
      }
    },

    getVoicePackId: function () { return _voicePackId; },

    // ── 静音控制 ──────────────────────────────────────────────────────────────
    // 「音效」开关（_muted）只应控制短音效（_playSfx）、语音播报（_playVoice/play）、
    // 震动（_vibrate）——不应影响 BGM，BGM 播放/暂停完全由「音乐」开关（_bgmMuted，
    // 见 toggleBgmMuted）独立控制。旧实现里 toggleMuted 会额外调用 stopBgm()，且
    // startBgm/startBgmTrack/_nextBgm 也一并判断 _muted，导致关掉音效的同时把正在播
    // 的音乐也停了（旧 bug：设置页任意关一个开关，两种音频都会消失）。
    toggleMuted: function () {
      _muted = !_muted;
      Storage.set(CONFIG.STORAGE_KEYS.sfxEnabled, _muted ? '0' : '1');
      if (_muted && _voiceCtx) {
        try { _voiceCtx.stop(); } catch(e) {}
      }
    },
    toggleBgmMuted: function () {
      _bgmMuted = !_bgmMuted;
      Storage.set(CONFIG.STORAGE_KEYS.bgmEnabled, _bgmMuted ? '0' : '1');
      if (_bgmMuted) {
        this.stopBgm();
      } else {
        this._resumeBgm();
      }
    },

    /**
     * 恢复 BGM 播放：优先恢复静音前正在播的场景单曲（select_level/in_level），
     * 而非 startBgm() 的通用轮播列表——那份列表是脚手架遗留占位曲目，包含
     * 旧「老铁」模版的曲目（bgm_2_northeast 等），不是本产品的 BGM，之前
     * 这里无条件调用 startBgm() 导致关闭音乐再开启后串成老铁 BGM。
     */
    _resumeBgm: function () {
      if (_pausedBgmTrackSrc) {
        this.playBgm(_pausedBgmTrackSrc, _pausedBgmTrackKey);
      } else if (_pausedBgmTrackKey) {
        this.startBgmTrack(_pausedBgmTrackKey);
      } else {
        this.startBgm();
      }
    },
    isMuted:    function () { return _muted; },
    isBgmMuted: function () { return _bgmMuted; },

    resumeAudio: function () {
      if (_bgmMuted) return;
      if (_bgmTrackCtx && _bgmTrackKey) {
        try { _bgmTrackCtx.play(); } catch(e) {}
      } else if (_bgmCtx && !_bgmPaused) {
        try { _bgmCtx.play(); } catch(e) {}
      } else {
        this._resumeBgm();
      }
    },

    // ── 震动 ──────────────────────────────────────────────────────────────────
    _vibrate: function (type) {
      if (_muted) return;
      if (typeof ks !== 'undefined' && ks.vibrateShort) {
        try { ks.vibrateShort({ type: type }); } catch(e) {}
      } else if (navigator.vibrate) {
        navigator.vibrate(type === 'heavy' ? 80 : type === 'medium' ? 40 : 15);
      }
    },

    // ── 内部工具 ──────────────────────────────────────────────────────────────
    /** 随机候选 key 解析（final_hit → final_hit_a/b/c 随机） */
    _resolveKey: function (key) {
      var multiKeys = CONFIG.VOICE_MULTI_KEYS;
      for (var i = 0; i < multiKeys.length; i++) {
        if (key === multiKeys[i]) {
          var variants = ['_a', '_b', '_c'];
          return key + variants[Math.floor(Math.random() * variants.length)];
        }
      }
      return key;
    },

    /** 播放语音包 clip */
    _playVoice: function (key) {
      if (_muted) return false;
      var url = this._resolveCdnVoice(_voicePackId, key);
      if (!url) return false;
      return this._playUrl(url);
    },

    /** 播放一条完整的语音 URL（人物专属语音等场景数据直接给出的 CDN 地址），不经过语音包 key 拼接 */
    playVoiceUrl: function (url) {
      if (_muted || !url) return false;
      return this._playUrl(url);
    },

    /** 按 URL 走人声通道播放：打断上一条语音 + duck BGM + 从音频池取 context */
    _playUrl: function (url) {
      // 打断上一条还在播的语音：语音是单通道播报（不像 BGM/音效可以叠加），
      // 连续触发多次语音提示（如剩余提示 + 命中提示短时间内先后触发）时，若不
      // 主动停掉上一条，两条语音会在音频池的不同 context 上同时播放，叠出杂音。
      if (_voiceCtx && _voiceCtx._inUse) {
        try { _voiceCtx.stop(); } catch(e) {}
        _voiceCtx._inUse = false;
      }

      // duck BGM
      if (_bgmCtx) {
        try { _bgmCtx.volume = 0; } catch(e) {}
        // 预估语音时长 3.8s 后恢复 BGM 音量
        clearTimeout(this._bgmDuckTimer);
        this._bgmDuckTimer = setTimeout(function () {
          if (_bgmCtx && !_bgmPaused) {
            try { _bgmCtx.volume = _bgmVolume; } catch(e) {}
          }
        }, 3800);
      }

      var ctx = getPoolItem();
      ctx._inUse = true;
      ctx.src    = url;
      _voiceCtx  = ctx;
      ctx.onEnded = function () { ctx._inUse = false; };
      try { ctx.play(); } catch(e) {}
      return true;
    },

    /** CDN 语音 URL 路由 */
    _resolveCdnVoice: function (packId, clipKey) {
      // remaining_* 设计上在 voice-extra 子包，但该子包目前未真实声明/未放素材
      // （game.json.subpackages 为空，本地和 CDN 均无对应文件）。未启用时直接
      // 跳过（返回空串），避免构造一条实际不存在的路径去加载导致悬挂请求/报错。
      if (clipKey.indexOf('remaining_') === 0) {
        var loader = (typeof M3 !== 'undefined') && M3.SubpackageLoader;
        if (!CONFIG.VOICE_EXTRA_SUBPACKAGE_ENABLED || !loader || !loader.isLoaded('voice-extra')) {
          return '';
        }
        return 'subpackages/voice-extra/assets/audio/voices/' + packId + '/' + clipKey + '.mp3';
      }
      var pack = CONFIG.VOICE_PACKS.find(function (p) { return p.id === packId; });
      var prefix = (pack && pack.cdnPrefix) ? pack.cdnPrefix : ('voice_' + packId + '_');
      return CONFIG.CDN_BASE_MEDIA + prefix + clipKey + '.mp3';
    },

    /** CDN 音效 URL */
    _resolveCdnAudio: function (key) {
      var cfg = CONFIG.AUDIO[key];
      return cfg ? (cfg.cdn || cfg.local) : '';
    }
  };
})();
