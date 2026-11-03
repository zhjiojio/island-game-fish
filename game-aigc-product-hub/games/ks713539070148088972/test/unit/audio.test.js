/**
 * test/unit/audio.test.js — Audio 单测
 * 覆盖：
 *   - 静音状态持久化与读取（init/toggleMuted/toggleBgmMuted）
 *   - _resolveCdnVoice 语音 URL 路由（默认前缀 / 自定义 cdnPrefix / remaining_*
 *     子包开关兜底）
 *   - _resolveKey 多候选随机解析
 *   - 语音打断：连续 play() 会先停掉上一条还在播的语音，不会同时有两条语音在播
 *   - setVoicePack：VOICE_EXTRA_SUBPACKAGE_ENABLED 关闭时不阻塞切换
 * 说明：用自定义 ks.createInnerAudioContext 工厂返回可断言的 jest.fn() 音频
 *       context，替代 audio.js 内部的哑对象兜底，从而能观测 play/stop 调用。
 */
'use strict';

function makeFakeAudioCtx() {
  return {
    src: '', loop: false, volume: 1,
    play: jest.fn(), stop: jest.fn(), seek: jest.fn(),
    onEnded: null, onError: null, _inUse: false
  };
}

function loadFresh() {
  jest.resetModules();
  require('../../js/core/product.config.js');
  require('../../js/core/config.js');
  require('../../js/systems/storage.js');
  global.M3 = global.M3 || {};
  global.M3.SubpackageLoader = { isLoaded: function () { return false; }, loadVoiceExtra: function (ok) { ok(); } };
  require('../../js/systems/audio.js');
  return window.Audio;
}

describe('Audio', function () {
  var Audio, createdCtxs;

  beforeEach(function () {
    localStorage.clear();
    createdCtxs = [];
    global.ks = {
      createInnerAudioContext: jest.fn(function () {
        var ctx = makeFakeAudioCtx();
        createdCtxs.push(ctx);
        return ctx;
      })
    };
    Audio = loadFresh();
  });

  afterEach(function () {
    delete global.ks;
  });

  describe('静音状态', function () {
    test('init 时应从 Storage 读取上次的静音状态', function () {
      localStorage.setItem(CONFIG.STORAGE_KEYS.sfxEnabled, JSON.stringify('0'));
      localStorage.setItem(CONFIG.STORAGE_KEYS.bgmEnabled, JSON.stringify('0'));
      Audio.init();
      expect(Audio.isMuted()).toBe(true);
      expect(Audio.isBgmMuted()).toBe(true);
    });

    test('无历史记录时默认不静音', function () {
      Audio.init();
      expect(Audio.isMuted()).toBe(false);
      expect(Audio.isBgmMuted()).toBe(false);
    });

    test('toggleMuted 应翻转状态并持久化', function () {
      Audio.init();
      Audio.toggleMuted();
      expect(Audio.isMuted()).toBe(true);
      expect(localStorage.getItem(CONFIG.STORAGE_KEYS.sfxEnabled)).toBe('"0"');
      Audio.toggleMuted();
      expect(Audio.isMuted()).toBe(false);
      expect(localStorage.getItem(CONFIG.STORAGE_KEYS.sfxEnabled)).toBe('"1"');
    });

    test('toggleBgmMuted 应翻转状态并持久化', function () {
      Audio.init();
      Audio.toggleBgmMuted();
      expect(Audio.isBgmMuted()).toBe(true);
      expect(localStorage.getItem(CONFIG.STORAGE_KEYS.bgmEnabled)).toBe('"0"');
    });
  });

  describe('_resolveCdnVoice（语音 URL 路由）', function () {
    beforeEach(function () { Audio.init(); });

    test('默认包（无 cdnPrefix）应用 voice_<packId>_<clip>.mp3 命名', function () {
      var url = Audio._resolveCdnVoice('xiaomei', 'greet');
      expect(url).toBe(CONFIG.CDN_BASE_MEDIA + 'voice_xiaomei_greet.mp3');
    });

    test('自定义 cdnPrefix 的包应使用该 prefix 而非默认拼接规则', function () {
      var pack = CONFIG.VOICE_PACKS.find(function (p) { return p.cdnPrefix; });
      expect(pack).toBeTruthy(); // 确认测试环境的 product.config.js 确实配了至少一个自定义 prefix 包
      var url = Audio._resolveCdnVoice(pack.id, 'greet');
      expect(url).toBe(CONFIG.CDN_BASE_MEDIA + pack.cdnPrefix + 'greet.mp3');
    });

    test('remaining_* clip 在 VOICE_EXTRA_SUBPACKAGE_ENABLED=false 时应返回空串（不构造无效路径）', function () {
      CONFIG.VOICE_EXTRA_SUBPACKAGE_ENABLED = false;
      var url = Audio._resolveCdnVoice('xiaomei', 'remaining_1_a');
      expect(url).toBe('');
    });

    test('remaining_* clip 在子包已启用且已加载时应返回子包内路径', function () {
      CONFIG.VOICE_EXTRA_SUBPACKAGE_ENABLED = true;
      global.M3.SubpackageLoader.isLoaded = function () { return true; };
      var url = Audio._resolveCdnVoice('xiaomei', 'remaining_1_a');
      expect(url).toBe('subpackages/voice-extra/assets/audio/voices/xiaomei/remaining_1_a.mp3');
    });

    test('remaining_* clip 在子包启用但尚未加载完成时仍应返回空串', function () {
      CONFIG.VOICE_EXTRA_SUBPACKAGE_ENABLED = true;
      global.M3.SubpackageLoader.isLoaded = function () { return false; };
      var url = Audio._resolveCdnVoice('xiaomei', 'remaining_1_a');
      expect(url).toBe('');
    });
  });

  describe('_resolveKey（多候选随机）', function () {
    test('非多候选 key 应原样返回', function () {
      expect(Audio._resolveKey('greet')).toBe('greet');
    });

    test('多候选 key 应返回 _a/_b/_c 之一', function () {
      var multiKey = CONFIG.VOICE_MULTI_KEYS[0];
      for (var i = 0; i < 20; i++) {
        var resolved = Audio._resolveKey(multiKey);
        expect(['_a', '_b', '_c'].some(function (suf) { return resolved === multiKey + suf; })).toBe(true);
      }
    });
  });

  describe('语音打断', function () {
    beforeEach(function () {
      Audio.init();
      createdCtxs.length = 0; // init() 内部 _preloadSfx 会预创建 3 个短音效 context，这里只关心语音相关的
    });

    test('静音时 play() 不应创建任何音频 context', function () {
      Audio.toggleMuted(); // 静音
      Audio.play('greet');
      expect(createdCtxs).toHaveLength(0);
    });

    test('连续两次 play() 应先停掉上一条语音，且复用同一个音频池 context（不会同时两条语音在播）', function () {
      Audio.play('greet');
      expect(createdCtxs).toHaveLength(1);
      var ctx1 = createdCtxs[0];
      expect(ctx1.play).toHaveBeenCalledTimes(1);
      expect(ctx1._inUse).toBe(true);

      Audio.play('wrong');
      // 音频池优先复用空闲 context：打断逻辑先把 ctx1 标记为空闲，
      // getPoolItem() 立刻把它选出来复用，所以不会新建第二个 context
      expect(createdCtxs).toHaveLength(1);
      expect(ctx1.stop).toHaveBeenCalledTimes(1);
      expect(ctx1.play).toHaveBeenCalledTimes(2);
      expect(ctx1._inUse).toBe(true);
    });

    test('上一条语音已自然播完（_inUse=false）时，新的 play() 不应调用 stop', function () {
      Audio.play('greet');
      var ctx1 = createdCtxs[0];
      ctx1._inUse = false; // 模拟 onEnded 已触发
      Audio.play('wrong');
      expect(ctx1.stop).not.toHaveBeenCalled();
    });
  });

  describe('setVoicePack', function () {
    beforeEach(function () { Audio.init(); });

    afterEach(function () { jest.useRealTimers(); });

    test('VOICE_EXTRA_SUBPACKAGE_ENABLED=false 时切换非默认包不应阻塞（不等待子包加载）', function () {
      CONFIG.VOICE_EXTRA_SUBPACKAGE_ENABLED = false;
      jest.useFakeTimers();
      var cb = jest.fn();
      Audio.setVoicePack('longaotian', cb);
      // _doSetVoicePack 内部用 setTimeout 100ms 触发 cb + greet 语音
      jest.advanceTimersByTime(100);
      expect(cb).toHaveBeenCalled();
      expect(Audio.getVoicePackId()).toBe('longaotian');
    });

    test('切换语音包后应持久化到 Storage', function () {
      CONFIG.VOICE_EXTRA_SUBPACKAGE_ENABLED = false;
      Audio.setVoicePack('xiaoshuai', function () {});
      expect(JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.voicePack))).toBe('xiaoshuai');
    });
  });
});
