/**
 * 老铁眼真尖 · 统一反馈模块（音效 + 震动）
 * ─────────────────────────────────────────────────────────
 * 设计原则（UX 视角）：
 *   - 找对：清脆"叮" + 中等震动（正反馈要爽、要即时）
 *   - 找错：低闷"哒" + 短促轻震动（负反馈要克制，别烦人）
 * 平台兼容：
 *   - 音效：优先 ks.createInnerAudioContext()，回退 wx / H5 Audio
 *   - 震动：优先 ks.vibrateShort()，回退 navigator.vibrate()
 * 关键坑：小游戏 InnerAudioContext 不能频繁 new，必须预创建复用；
 *         快速连点时先 seek(0) 再 play() 以支持重叠触发。
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  var BASE = 'assets/audio/';
  // ⭐ v1.0.50 BGM 走 CDN 分包加载，主包不打入 3 首 BGM（省 3.6MB）
  var CDN_BASE = 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/';
  var SOUNDS = {
    correct: BASE + 'correct.mp3',
    wrong:   BASE + 'wrong.mp3',
    timeup:  BASE + 'timeup.mp3',   // ⭐ 兜底：无 pack 时用默认
    // ⭐ v0.0.61 真 mp3 替代 Web Audio 合成（快手小游戏无 window.AudioContext）
    tick:    BASE + 'tick.mp3',        // 每秒滴答
    // ⭐ v0.0.95 移除 bgm_loop.mp3（976KB 冗余），完全由 bgm_list 三首承担 BGM
    // ⭐ v1.0.50 三首 BGM 走 CDN 分包加载（进游戏后异步拉，不阻塞启动 loading）
    bgm_list: [
      CDN_BASE + 'bgm_1_chiptune.mp3',
      CDN_BASE + 'bgm_2_northeast.mp3',
      CDN_BASE + 'bgm_3_disco.mp3'
    ],
    // ⭐ v0.0.58 三段全局奖励语音（不区分角色，节省生成量）
    global_revive: BASE + 'global/revive.mp3',
    global_hint:   BASE + 'global/hint.mp3',
    global_skip:   BASE + 'global/skip.mp3'
  };

  // ⭐ v0.0.46 语音包动态覆写：{ greet: 'assets/audio/voices/xiaomei/greet.mp3', timeup: ... }
  var _packOverride = {};
  var _PACK_KEY = 'laotie_voice_pack';

  var _pool = {};      // src -> audioContext
  var _ready = false;
  var _muted = false;
  var _STORAGE_KEY = 'laotie_sfx_enabled';
  // ⭐ v0.0.63 BGM 独立开关（默认 ON，是全局音效的子集）
  var _bgmMuted = false;
  var _BGM_KEY = 'laotie_bgm_enabled';

  function _getKs(){
    if (typeof ks !== 'undefined') return ks;
    if (typeof window !== 'undefined' && window.ks) return window.ks;
    if (typeof global !== 'undefined' && global.ks) return global.ks;
    return null;
  }

  // ⭐ 持久化读取音效开关（默认 ON）
  function _loadMuted(){
    try {
      var ksApi = _getKs();
      if (ksApi && ksApi.getStorageSync){
        var v = ksApi.getStorageSync(_STORAGE_KEY);
        if (v === '0' || v === 0 || v === false) return true;
        return false;
      }
      if (typeof localStorage !== 'undefined'){
        var v2 = localStorage.getItem(_STORAGE_KEY);
        if (v2 === '0') return true;
        return false;
      }
    } catch(e){}
    return false;
  }
  function _saveMuted(muted){
    try {
      var ksApi = _getKs();
      var val = muted ? '0' : '1';
      if (ksApi && ksApi.setStorageSync){ ksApi.setStorageSync(_STORAGE_KEY, val); return; }
      if (typeof localStorage !== 'undefined'){ localStorage.setItem(_STORAGE_KEY, val); }
    } catch(e){}
  }
  _muted = _loadMuted();

  // ⭐ v0.0.63 BGM 独立开关持久化
  function _loadBgmMuted(){
    try {
      var ksApi = _getKs();
      if (ksApi && ksApi.getStorageSync){
        var v = ksApi.getStorageSync(_BGM_KEY);
        if (v === '0' || v === 0 || v === false) return true;
        return false;
      }
      if (typeof localStorage !== 'undefined'){
        var v2 = localStorage.getItem(_BGM_KEY);
        if (v2 === '0') return true;
        return false;
      }
    } catch(e){}
    return false;
  }
  function _saveBgmMuted(muted){
    try {
      var ksApi = _getKs();
      var val = muted ? '0' : '1';
      if (ksApi && ksApi.setStorageSync){ ksApi.setStorageSync(_BGM_KEY, val); return; }
      if (typeof localStorage !== 'undefined'){ localStorage.setItem(_BGM_KEY, val); }
    } catch(e){}
  }
  _bgmMuted = _loadBgmMuted();

  // 预创建音频上下文（复用，避免频繁 new 导致小游戏卡顿）
  // ⭐ v1.3.0 音频路径重写规则（最终稳定版）：
  //   remaining_* → voice-extra 子包路径（CDN 无此文件，子包里才有）
  //   非 remaining → 全部走 CDN（含 xiaomei，主包不再保留语音文件）
  //   liuhaoguaizai 专属 v3 命名前缀
  function _rewriteAudioCDN(src){
    if (typeof src !== 'string') return src;
    if (src.indexOf('http') === 0) return src;
    // 把 query 剥离后再匹配，最后追加回去（兼容 ?v=v4 cache-buster）
    var qIdx = src.indexOf('?');
    var qs = qIdx >= 0 ? src.slice(qIdx) : '';
    var pathOnly = qIdx >= 0 ? src.slice(0, qIdx) : src;
    var m = pathOnly.match(/^assets\/audio\/voices\/([^\/]+)\/([^\/]+\.mp3)$/);
    if (m) {
      var packId = m[1];
      var fileName = m[2];
      var isRemaining = fileName.indexOf('remaining_') === 0;

      // ⭐ v1.3.0 remaining_* 均在 voice-extra 子包（CDN 无此文件）
      if (isRemaining) {
        if (window.M3 && window.M3.SubpkgLoader && window.M3.SubpkgLoader.isLoaded('voice-extra')) {
          return 'subpackages/voice-extra/' + pathOnly + qs;
        }
        // voice-extra 未加载时保持原路径（setVoicePack 确保子包加载后才播放，正常不会到达此处）
        return src;
      }

      // ⭐ v1.3.0 非 remaining：全部走 CDN（liuhaoguaizai 专属 v3 前缀，其余通用前缀）
      if (packId === 'liuhaoguaizai') {
        return CDN_BASE + 'voice_liuhaoguaizai_v3_' + fileName + qs;
      }
      return CDN_BASE + 'voice_' + packId + '_' + fileName + qs;
    }
    return src;
  }
  function _createAudio(src){
    src = _rewriteAudioCDN(src);
    var ksApi = _getKs();
    var a = null;
    try {
      if (ksApi && ksApi.createInnerAudioContext) a = ksApi.createInnerAudioContext();
      else if (typeof wx !== 'undefined' && wx.createInnerAudioContext) a = wx.createInnerAudioContext();
      else if (typeof Audio !== 'undefined') a = new Audio();
    } catch (e) { return null; }
    if (!a) return null;
    try { a.src = src; } catch (e) {}
    try { a.volume = 1.0; } catch (e) {}
    return a;
  }

  // 初始化：预加载所有音效
  M3.Feedback = {
    init: function () {
      if (_ready) return;
      // ⭐ v0.0.95 首帧提速：只预加载短音效 (correct/wrong/tick)，BGM/timeup/global 懒加载
      //   BGM mp3 每个 1MB，如果 init 就 createAudio 会阻塞主线程 200-500ms 严重影响首帧
      var PRELOAD_KEYS = ['correct', 'wrong', 'tick'];
      var loaded = 0, failed = 0;
      PRELOAD_KEYS.forEach(function (key) {
        var src = SOUNDS[key];
        if (!src) return;
        var a = _createAudio(src);
        if (a) { _pool[key] = a; loaded++; } else failed++;
      });
      _ready = true;
      console.log('[Feedback v0.0.95] fast init: preload=' + loaded + ' failed=' + failed + ' (bgm/voice lazy)');

      // ⭐ v0.1.1 预热 Web Audio：首次 new AudioContext 有 100-300ms 阻塞，提前到 init 里做，让首次点击秒响应
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx && !this._ac) {
          this._ac = new Ctx();
          console.log('[Feedback v0.1.1] AudioContext warmed up, state=' + this._ac.state);
        }
      } catch(e){}
    },

    setMuted: function (m) {
      _muted = !!m; _saveMuted(_muted);
      // ⭐ v0.0.48b 静音开关立即生效：停止当前所有播放中的音频（含 bgm/lastPlaying/pool）
      if (_muted) this._stopAllAudio();
      else { try { this.startBgm && this.startBgm(); } catch(e){} }
    },
    isMuted: function () { return _muted; },
    toggleMuted: function () {
      _muted = !_muted; _saveMuted(_muted);
      if (_muted) this._stopAllAudio();
      else { try { this.startBgm && this.startBgm(); } catch(e){} }
      return _muted;
    },
    // ⭐ v0.0.63 BGM 独立开关（是全局音效的子集）：全局关时 BGM 一定关；全局开时才允许独立控制 BGM
    isBgmMuted: function () { return _bgmMuted; },
    setBgmMuted: function (m) {
      _bgmMuted = !!m; _saveBgmMuted(_bgmMuted);
      if (_bgmMuted) { try { this.stopBgm && this.stopBgm(); } catch(e){} }
      else if (!_muted) { try { this.startBgm && this.startBgm(); } catch(e){} }
    },
    toggleBgmMuted: function () {
      _bgmMuted = !_bgmMuted; _saveBgmMuted(_bgmMuted);
      if (_bgmMuted) { try { this.stopBgm && this.stopBgm(); } catch(e){} }
      else if (!_muted) { try { this.startBgm && this.startBgm(); } catch(e){} }
      return _bgmMuted;
    },
    // \u2b50 v0.0.48b \u7acb\u5373\u6253\u65ad\u5168\u90e8\u97f3\u9891\uff1apool \u5185\u6240\u6709 audio + _lastPlaying + bgm + Web Audio \u5408\u6210
    _stopAllAudio: function(){
      try {
        for (var k in _pool){
          if (_pool.hasOwnProperty(k) && _pool[k]){
            try { if (typeof _pool[k].stop === 'function') _pool[k].stop(); else _pool[k].pause(); } catch(e){}
          }
        }
      } catch(e){}
      this._lastPlaying = null;
      // Web Audio \u5408\u6210\u7684 bgm\uff08osc + lfo\uff09
      try { if (typeof this.stopBgm === 'function') this.stopBgm(); } catch(e){}
      // \u2b50 v0.0.48f \u5f7b\u5e95\u5173\u95ed\u4e3b AudioContext\uff08\u5173\u6389 = \u6302\u5728\u4e0a\u9762\u7684\u6240\u6709 osc \u7acb\u5373\u6b7b\uff09
      //   \u4e0b\u6b21 play/click/tick \u4f1a\u91cd\u5efa\u4e00\u4e2a\u65b0 ctx\uff0c\u9759\u97f3\u671f\u95f4\u5c31\u6ca1\u58f0\u4e86
      try {
        if (this._ac && typeof this._ac.close === 'function' && this._ac.state !== 'closed'){
          this._ac.close();
        }
      } catch(e){}
      this._ac = null;
    },

    // \u2b50 v0.0.67 \u7cbe\u51c6\u6253\u65ad\u5f53\u524d\u8bed\u97f3\u53f0\u8bcd\uff08intro/greet/timeup \u7b49\uff09\uff0c\u4e0d\u52a8 bgm/tick pool
    //   \u9002\u7528\u573a\u666f\uff1a\u4e2d\u9014\u9000\u51fa\u5173\u5361 / \u5207\u4e3b\u9898 / \u56de\u5230\u5927\u5385 / \u56de\u5230 welcome
    stopVoice: function(){
      // 1. \u6253\u65ad _lastPlaying\uff08\u4e0a\u4e00\u4e2a\u5728\u64ad\u7684 mp3 audio\uff09
      try {
        if (this._lastPlaying){
          if (typeof this._lastPlaying.stop === 'function') this._lastPlaying.stop();
          else if (typeof this._lastPlaying.pause === 'function') this._lastPlaying.pause();
        }
      } catch(e){}
      this._lastPlaying = null;
      // 2. \u626b pool\uff0c\u53ea\u505c intro/greet/timeup/pass/scene1_intro/scene2_intro/global_* \u7c7b voice
      var VOICE_PATTERNS = /^(pack:)?(scene\d+_intro|greet|timeup|pass\d?|final_hit|almost_out|remaining_\d|wrong|global_)/;
      try {
        for (var k in _pool){
          if (_pool.hasOwnProperty(k) && _pool[k] && VOICE_PATTERNS.test(k)){
            try { if (typeof _pool[k].stop === 'function') _pool[k].stop(); else _pool[k].pause(); } catch(e){}
          }
        }
      } catch(e){}
      // 3. \u6062\u590d BGM \u97f3\u91cf\uff08\u4e4b\u524d duck \u5230 0\uff09
      try {
        clearTimeout(this._bgmRestoreTimer);
        if (this._bgmAudio) this._bgmAudio.volume = this._bgmVolume || 0.042;
      } catch(e){}
    },

    // ⭐ v0.0.46 切换语音包：接受 pack 对象或 pack.id
    // ⭐ v1.0.74 分包改造：非默认包需先加载 voice-extra 子包
    setVoicePack: function(pack){
      if (!pack) return;
      var self = this;
      // ⭐ v0.0.70 语音包切换硬化：先记 id，再刷新 override，再持久化，日志留痕
      if (typeof pack === 'string' && window.M3 && window.M3.VOICE_PACKS){
        for (var i=0;i<window.M3.VOICE_PACKS.length;i++){
          if (window.M3.VOICE_PACKS[i].id === pack){ pack = window.M3.VOICE_PACKS[i]; break; }
        }
      }
      if (!pack || !pack.clips) { console.warn('[VOICE v0.0.70] setVoicePack 无效 pack:', pack); return; }
      // ⭐ v1.0.74 非 xiaomei 包先加载 voice-extra 子包（异步，成功后再执行切包逻辑）
      if (pack.id && pack.id !== 'xiaomei' && window.M3 && window.M3.SubpkgLoader) {
        var _pack = pack;
        window.M3.SubpkgLoader.loadVoicePack(pack.id, function(err) {
          if (err) { console.warn('[VOICE v1.0.74] voice-extra 加载失败，降级用 CDN 路径', err); }
          self._doSetVoicePack(_pack);
        });
        return;
      }
      this._doSetVoicePack(pack);
    },
    // ⭐ v1.0.74 内部：真正执行切包逻辑（供 setVoicePack 同步/异步两路复用）
    _doSetVoicePack: function(pack){
      // ⭐ v1.0.8 修 pool 清理 bug：旧 poolKey 是 'pack:'+key+':'+src 长格式
      //   之前只 delete _pool[shortKey] 根本没清到，导致切包后旧包 audio 残留
      try {
        var toDel = [];
        for (var pk in _pool){ if (_pool.hasOwnProperty(pk) && pk.indexOf('pack:') === 0) toDel.push(pk); }
        for (var d=0; d<toDel.length; d++){
          try { if (_pool[toDel[d]] && typeof _pool[toDel[d]].stop === 'function') _pool[toDel[d]].stop(); } catch(_e){}
          try { if (_pool[toDel[d]] && typeof _pool[toDel[d]].destroy === 'function') _pool[toDel[d]].destroy(); } catch(_e){}
          delete _pool[toDel[d]];
        }
        console.log('[VOICE v1.0.8] 清理旧包 pool 数量=' + toDel.length);
      } catch(_e){}
      // 打断当前正在播的（可能是旧包的 greet）
      try {
        if (this._lastPlaying){
          if (typeof this._lastPlaying.stop === 'function') this._lastPlaying.stop();
          else if (typeof this._lastPlaying.pause === 'function') this._lastPlaying.pause();
        }
      } catch(_e){}
      this._lastPlaying = null;
      // 先落 _packId（getVoicePackId 拿到的第一个 return 就是它）
      this._packId = pack.id;
      // ⭐ v1.0.8 深复制 clips 到 _packOverride，避免外部引用被改
      _packOverride = {};
      for (var k in pack.clips){ if (pack.clips.hasOwnProperty(k)) _packOverride[k] = pack.clips[k]; }
      // 持久化 —— ks 与 localStorage 双写，防单端丢
      try {
        var ksApi = _getKs();
        if (ksApi && ksApi.setStorageSync) ksApi.setStorageSync(_PACK_KEY, pack.id);
        if (typeof localStorage !== 'undefined') localStorage.setItem(_PACK_KEY, pack.id);
      } catch(e){}
      // ⭐ v1.0.8 全局暴露当前 packId，方便调试和 UI 校验
      if (window.M3) window.M3._activeVoicePackId = pack.id;
      console.log('[VOICE v1.0.8] setVoicePack ✅ id=' + pack.id + ' name=' + pack.name + ' clips=' + Object.keys(_packOverride).length);
    },
    getVoicePackId: function(){
      if (this._packId) return this._packId;
      try {
        var ksApi = _getKs();
        if (ksApi && ksApi.getStorageSync){
          var v = ksApi.getStorageSync(_PACK_KEY);
          if (v) return v;
        }
        if (typeof localStorage !== 'undefined'){
          var v2 = localStorage.getItem(_PACK_KEY);
          if (v2) return v2;
        }
      } catch(e){}
      return (window.M3 && window.M3.DEFAULT_VOICE_PACK) || 'xiaomei';
    },

    // 播放音效（支持连点重叠：先 stop/seek 再 play）
    // ⭐ v0.0.47 加"当前正在播的"记录，播新的时先打断
    // ⭐ v0.0.55 支持随机候选：若 key ∈ M3.VOICE_MULTI_KEYS 且存在 key_a/_b/_c，则随机挑一条播
    //           并同时把 BGM 音量 duck 到 0（voice 播完再恢复）
    _lastPlaying: null,
    _resolveKey: function(key){
      var multiKeys = (window.M3 && window.M3.VOICE_MULTI_KEYS) || [];
      if (multiKeys.indexOf(key) < 0) return key;
      // 检查 _packOverride 中是否有 _a/_b/_c
      var cand = [];
      ['a','b','c','d'].forEach(function(L){
        var k = key+'_'+L;
        if (_packOverride[k]) cand.push(k);
      });
      if (cand.length === 0) return key;  // fallback 原 key
      return cand[Math.floor(Math.random() * cand.length)];
    },
    play: function (key) {
      if (_muted) return;
      // ⭐ v1.0.9 全局音频硬绑定当前语音包 · 铁律
      //   NON_VOICE_KEYS：只有 correct/tick 是纯 SFX（无人声版本），其他都是人声
      //   wrong / timeup / greet / pass* / final_hit / almost_out / scene*_intro 都是人声
      var NON_VOICE = { correct:1, tick:1 };
      // 全局奖励音（原 global/*）→ 映射当前包
      // ⭐ v1.0.66 修复：global_hint 不再 fallback 到 pass2/greet（那是通关庆祝/开场语音），
      //              若当前 pack 无 hint 专属音，直接静默返回，避免误播"通关"音让用户困惑
      if (key === 'global_hint'){
        if (_packOverride['global_hint']) key = 'global_hint';
        else if (_packOverride['hint']) key = 'hint';
        else { /* 无 hint 音频 → 静默，不播任何 fallback */ return; }
      } else {
      var GLOBAL_MAP = { global_skip: 'pass3', global_revive: 'final_hit_a' };
      if (GLOBAL_MAP[key]){
        var mapped = GLOBAL_MAP[key];
        if (_packOverride[mapped]) key = mapped;
        else if (_packOverride['pass']) key = 'pass';
        else if (_packOverride['greet']) key = 'greet';
        else { console.warn('[VOICE v1.0.9] global 映射失败，pack 缺少 pass/greet，key=' + mapped); return; }
      }
      }
      var isVoice = !NON_VOICE[key];
      // ⭐ 随机候选路由（timeup/greet/wrong/final_hit/almost_out 走多条）
      var pickedKey = this._resolveKey(key);
      var src = null;
      if (isVoice){
        // 人声：只从当前 pack 找。缺就同族替换（如 timeup 缺 → greet 替代）
        src = _packOverride[pickedKey] || _packOverride[key];
        if (!src){
          // 同族兜底顺序：greet → pass → pass2 → final_hit_a
          var fallbacks = ['greet', 'pass', 'pass2', 'final_hit_a'];
          for (var f=0; f<fallbacks.length; f++){
            if (_packOverride[fallbacks[f]]) { src = _packOverride[fallbacks[f]]; pickedKey = fallbacks[f]; break; }
          }
        }
        if (!src){ console.warn('[VOICE v1.0.9] 当前包无匹配 key=' + key + ' pack=' + this._packId); return; }
      } else {
        // 非人声：SOUNDS 全局
        src = SOUNDS[pickedKey] || SOUNDS[key];
        if (!src) return;
      }
      var poolKey = isVoice ? ('pack:'+(this._packId||'?')+':'+pickedKey+':'+src) : pickedKey;
      // ⭐ v1.0.9 真机排查日志（可通过 M3._VOICE_DEBUG=false 关闭）
      if (isVoice && (window.M3 && window.M3._VOICE_DEBUG !== false)){
        console.log('[VOICE v1.0.9][play] key=' + key + ' → pickedKey=' + pickedKey + ' pack=' + this._packId + ' src=' + src);
      }
      var a = _pool[poolKey];
      if (!a) {
        a = _createAudio(src);
        if (!a) return;
        _pool[poolKey] = a;
      }
      // ⭐ 打断上一个还在播的（避免叠音）
      if (this._lastPlaying && this._lastPlaying !== a) {
        try { if (typeof this._lastPlaying.stop === 'function') this._lastPlaying.stop(); else this._lastPlaying.pause(); } catch(e){}
      }
      // ⭐ v0.0.55 BGM duck：voice 一响，bgm 降到 0；voice 结束后恢复
      var self = this;
      if (this._bgmAudio){
        try { this._bgmAudio.volume = 0.0; } catch(e){}
        // 用估算时长兜底（真机 InnerAudioContext onEnded 有时不触发）
        clearTimeout(this._bgmRestoreTimer);
        this._bgmRestoreTimer = setTimeout(function(){
          try { if (self._bgmAudio) self._bgmAudio.volume = self._bgmVolume || 0.042; } catch(e){}
        }, 3800); // 大部分台词 <3.5s，兜底 3.8s 恢复
        try {
          if (typeof a.onEnded === 'function'){
            a.onEnded(function(){
              try { if (self._bgmAudio) self._bgmAudio.volume = self._bgmVolume || 0.042; } catch(e){}
            });
          } else if ('onended' in a){
            a.onended = function(){ try { if (self._bgmAudio) self._bgmAudio.volume = self._bgmVolume || 0.042; } catch(e){} };
          }
        } catch(e){}
      }
      try {
        if (typeof a.stop === 'function') { try { a.stop(); } catch (e) {} }
        if (typeof a.seek === 'function') { try { a.seek(0); } catch (e) {} }
        else { try { a.currentTime = 0; } catch (e) {} }
        a.play();
        this._lastPlaying = a;
      } catch (e) {}
    },

    // 震动：type = 'medium'（找对）| 'light'（找错）| 'heavy'
    vibrate: function (type) {
      var ksApi = _getKs();
      try {
        if (ksApi && ksApi.vibrateShort) {
          ksApi.vibrateShort({ type: type || 'medium' });
          return;
        }
      } catch (e) {}
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          // H5 / Android：medium≈25ms，light≈12ms，heavy≈40ms
          var ms = type === 'light' ? 12 : (type === 'heavy' ? 40 : 25);
          navigator.vibrate(ms);
        }
      } catch (e) {}
    },

    // 语义化组合：一次调用同时给音 + 震
    correct: function () { this.play('correct'); this.vibrate('medium'); },
    wrong:   function () { this.play('wrong');   this.vibrate('light');  },

    // ⭐ 按钮点击轻反馈（合成短促 "tick"）+ 轻震动
    // ⭐ v0.1.1 提速：AudioContext 首次 new 有 100-300ms 阻塞，改由 init() 预创建；且异步 setTimeout(0) 避免阻塞点击响应
    click: function () {
      if (_muted) return;
      var self = this;
      // 异步播放，让点击响应先返回，音效在下个 tick 追赶（用户感官上无差）
      var doPlay = function(){
        try {
          var ac = self._ac;
          if (!ac){
            var Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            ac = self._ac = new Ctx();
          }
          if (ac.state === 'suspended' && ac.resume) { try { ac.resume(); } catch(_e){} }
          var t0 = ac.currentTime;
          var osc = ac.createOscillator(), g = ac.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(1400, t0);
          osc.frequency.exponentialRampToValueAtTime(700, t0 + 0.05);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
          osc.connect(g).connect(ac.destination);
          osc.start(t0); osc.stop(t0 + 0.08);
        } catch(e){}
      };
      if (typeof setTimeout === 'function') setTimeout(doPlay, 0); else doPlay();
      try {
        var ksApi = _getKs();
        if (ksApi && ksApi.vibrateShort) ksApi.vibrateShort({ type:'light' });
        else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8);
      } catch(e){}
    },

    // ⭐ v0.0.61 倒计时最后 10 秒每秒滴答 —— 改用真 mp3（Web Audio 在快手小游戏容器不支持）
    //   关键 bug 修复：tick 不走 play()（play 会写 _lastPlaying → 打断随后的 wrong.mp3！）
    //   → 独立 pool 独立播放，永远不影响 correct/wrong
    tick: function () {
      if (_muted) return;
      try {
        var a = _pool['__tick'];
        if (!a){
          a = _createAudio(SOUNDS.tick);
          if (!a) return;
          _pool['__tick'] = a;
        }
        try { if (typeof a.stop === 'function') a.stop(); } catch(e){}
        try { if (typeof a.seek === 'function') a.seek(0); else a.currentTime = 0; } catch(e){}
        a.play();
      } catch(e){}
    },

    // ⭐ 解锁成功：简单欢快的上行琶音（C-E-G-C 大三和弦），Web Audio 合成
    unlockAnthem: function () {
      if (_muted) { this.vibrate('medium'); return; }
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        var ac = this._ac || (this._ac = new Ctx());
        // C5-E5-G5-C6 上行 → 停在 C6 稍长（欢快、上扬）
        var notes = [
          { f: 523.25, t: 0.00, d: 0.14 },
          { f: 659.25, t: 0.10, d: 0.14 },
          { f: 783.99, t: 0.20, d: 0.14 },
          { f: 1046.5, t: 0.30, d: 0.32 }
        ];
        notes.forEach(function(n){
          setTimeout(function(){
            var osc = ac.createOscillator(), g = ac.createGain();
            osc.type = 'triangle'; // 三角波：清亮、卡通感
            osc.frequency.value = n.f;
            g.gain.setValueAtTime(0.0001, ac.currentTime);
            g.gain.exponentialRampToValueAtTime(0.32, ac.currentTime + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + n.d);
            osc.connect(g).connect(ac.destination);
            osc.start(); osc.stop(ac.currentTime + n.d + 0.02);
          }, n.t * 1000);
        });
      } catch(e){}
      this.vibrate('medium');
    },

    // ⭐ v0.0.43 时间到/失败：主发声改为女声 timeup.mp3（真人克隆音）
    lose: function () {
      if (_muted) { this.vibrate('heavy'); return; }
      // ① 主发声：女声"时间到啦～"
      try { this.play('timeup'); } catch(e){}
      // ⭐ v0.0.48e 用户明确要求：删除尾巴的合成"咚"音，只保留真人 timeup 音频
      this.vibrate('heavy');
      var self = this;
      setTimeout(function(){ self.vibrate('heavy'); }, 300);
    },

    // ⭐ v0.0.55 全新真·BGM：Web Audio 合成 8 小节欢快 loop（C 大调，128 BPM 卡通感）
    //   - 主鼓：sub-bass kick 4 分音
    //   - 和弦：I-vi-IV-V 循环（C-Am-F-G），triangle 波
    //   - 主旋律：8 分音符主题+跳音，square 波（游戏机感）
    //   - 音量 0.25，voice 播放时 duck 到 0（在 play() 中处理）
    //   - 通过 startBgm() 启动，stopBgm() 停止；受 _muted 控制
    _bgm: null,
    _bgmAudio: null,       // 外置 mp3（如未来接入真 mp3 用）
    _bgmVolume: 0.042,     // ⭐ v0.1.1 BGM 音量 +40% (0.03→0.042)
    _bgmScheduler: null,
    _bgmIdx: 0,            // ⭐ v0.0.76 当前播放第几首（0/1/2 轮流）
    _bgmPool: {},          // ⭐ v0.0.76 缓存已创建的 audio 对象，key=src
    // ⭐ v0.0.61 BGM 改用真 mp3 loop（快手小游戏容器无 window.AudioContext）
    // ⭐ v0.0.95 循环播放策略：优先单曲 loop=true；再用 onEnded 兜底切下一首
    _playBgmByIndex: function(idx){
      if (_muted || _bgmMuted) return;
      var self = this;
      var list = SOUNDS.bgm_list || [SOUNDS.bgm];
      idx = ((idx % list.length) + list.length) % list.length;
      this._bgmIdx = idx;
      var src = list[idx];
      try {
        // ⭐ v0.0.95 停掉所有其他 pool 内的 audio（避免多首同时播 = 双播 bug）
        try {
          var p = this._bgmPool || {};
          for (var k in p){
            if (p.hasOwnProperty(k) && p[k] && p[k] !== p[src]){
              try { if (typeof p[k].stop === 'function') p[k].stop(); else p[k].pause(); } catch(e){}
            }
          }
        } catch(e){}
        var a = this._bgmPool[src];
        if (!a){
          a = _createAudio(src);
          if (!a){
            self._bgmRetry = (self._bgmRetry||0) + 1;
            if (self._bgmRetry <= 10){
              console.warn('[BGM v0.0.95] createAudio failed, retry #' + self._bgmRetry, src);
              setTimeout(function(){ self._playBgmByIndex(idx); }, 500);
            } else {
              console.warn('[BGM v0.0.95] createAudio failed (retry exhausted)', src);
            }
            return;
          }
          self._bgmRetry = 0;
          try { a.loop = true; } catch(e){}      // ⭐ v0.0.95 单曲循环，避免 onEnded 不触发
          try { a.autoplay = false; } catch(e){}
          try { a.volume = self._bgmVolume || 0.042; } catch(e){}
          // onEnded 兜底：万一某个环境 loop 不生效，也自动重播（同一首）
          var goNext = function(){
            if (!self._bgm) return;
            try { if (typeof a.seek === 'function') a.seek(0); else a.currentTime = 0; } catch(e){}
            try { a.play(); } catch(e){}
          };
          try { a.onEnded && (a.onEnded = goNext); } catch(e){}
          try { a.onended = goNext; } catch(e){}
          this._bgmPool[src] = a;
        }
        // ⭐ v0.0.95 关键：如果当前 _bgm 就是这个 audio 且正在播，不重新 play（避免双播）
        if (this._bgm === a){
          console.log('[BGM v0.0.95] already playing this track, skip re-play');
          return;
        }
        try { if (typeof a.stop === 'function') a.stop(); } catch(e){}
        try { if (typeof a.seek === 'function') a.seek(0); else a.currentTime = 0; } catch(e){}
        try { a.loop = true; } catch(e){}
        try { a.volume = self._bgmVolume || 0.042; } catch(e){}
        a.play();
        this._bgm = a;
        this._bgmAudio = a;
        console.log('[BGM v0.0.95] playing #' + idx + ' (loop=true) → ' + src);
      } catch(e){ console.warn('[BGM v0.0.95] play fail', e); }
    },
    startBgm: function(){
      if (_muted){ console.log('[BGM v0.0.95] skipped (muted)'); return; }
      if (_bgmMuted){ console.log('[BGM v0.0.95] skipped (bgm sub-mute)'); return; }
      // ⭐ v0.0.95 严格幂等：_bgm 存在且未 pause 就跳过（避免调用方重复触发导致双播）
      if (this._bgm){
        try {
          var isPaused = (typeof this._bgm.paused !== 'undefined') ? this._bgm.paused : false;
          if (!isPaused){ console.log('[BGM v0.0.95] already playing, skip'); return; }
        } catch(e){}
      }
      var list = SOUNDS.bgm_list || [SOUNDS.bgm];
      var startIdx = (typeof this._bgmIdx === 'number' && this._bgmIdx > 0) ? this._bgmIdx : Math.floor(Math.random() * list.length);
      this._playBgmByIndex(startIdx);
    },
    stopBgm: function(){
      try {
        if (this._bgm){
          try { if (typeof this._bgm.stop === 'function') this._bgm.stop(); else this._bgm.pause(); } catch(e){}
        }
        // ⭐ v0.0.76 停掉 pool 内所有轮播中的 audio
        try {
          var p = this._bgmPool || {};
          for (var k in p){
            try { if (typeof p[k].stop === 'function') p[k].stop(); else p[k].pause(); } catch(e){}
          }
        } catch(e){}
      } catch(e){}
      this._bgm = null;
      this._bgmAudio = null;
    },
    unlockAudio: function(){
      // ⭐ v0.0.61 快手小游戏容器无 Web Audio API，不需要 unlock；保留空实现向后兼容
    }
  };

  // ⭐ v0.0.48f 一次性自愈：feedback.js 首次加载时立即扫全局，把所有可能残留的
  //    AudioContext / OscillatorNode（老版 startBgm 未清理导致的嗡嗡嗡）强制关掉。
  //    这段代码只在文件初始化时跑一次，不影响后续正常音频。
  try {
    // 1) 干掉已挂在 M3.Feedback._bgm 的旧 osc（如果 hot reload 前一次的引用还在）
    if (M3.Feedback && M3.Feedback._bgm){
      try { M3.Feedback._bgm.o1 && M3.Feedback._bgm.o1.stop && M3.Feedback._bgm.o1.stop(); } catch(e){}
      try { M3.Feedback._bgm.lfo && M3.Feedback._bgm.lfo.stop && M3.Feedback._bgm.lfo.stop(); } catch(e){}
      M3.Feedback._bgm = null;
    }
    // 2) 干掉已挂在 M3.Feedback._ac 的旧 AudioContext（老 osc 全部会 die）
    if (M3.Feedback && M3.Feedback._ac && typeof M3.Feedback._ac.close === 'function'){
      try { M3.Feedback._ac.close(); } catch(e){}
      M3.Feedback._ac = null;
    }
    // 3) 暴露 console 调试兜底
    if (typeof window !== 'undefined'){
      window.__killBgm = function(){
        try { M3.Feedback._stopAllAudio && M3.Feedback._stopAllAudio(); } catch(e){}
        return 'bgm killed';
      };
    }
  } catch(e){}
})();
