/**
 * test/unit/remote-config.test.js — RemoteConfig 单测
 * 覆盖：
 *   - _parse 的过滤逻辑（themes 必须有 http cover；levels 按 hiddenIdxRanges 过滤）
 *   - getLevelsByTheme / getLevelByIdx / getTheme 查询
 *   - load 成功路径（走 fetch mock）
 *   - load 失败重试 3 次后进入 error/timeout 态
 *   - USE_MOCK_CONFIG 开关命中本地 mock 数据
 * 说明：RemoteConfig 是 window 单例，每个 test 需要 jest.resetModules() 重新
 *       require 以获得干净状态（_status/_raw 等闭包变量不会随 describe 重置）。
 */
'use strict';

function loadFresh() {
  jest.resetModules();
  require('../../js/core/product.config.js');
  require('../../js/core/config.js');
  require('../../js/systems/storage.js');
  require('../../js/data/mock-levels-config.js');
  require('../../js/data/remote-config.js');
  return window.RemoteConfig;
}

describe('RemoteConfig', function () {
  var RemoteConfig;

  beforeEach(function () {
    RemoteConfig = loadFresh();
  });

  afterEach(function () {
    delete global.fetch;
    jest.useRealTimers();
  });

  describe('_parse 过滤逻辑', function () {
    test('useFirstLevelSceneAsCover=false 时，themes 必须有 id 且 cover 是 http 开头的字符串，否则过滤掉', function () {
      CONFIG.USE_MOCK_CONFIG = false;
      CONFIG.TEMPLATE.home.useFirstLevelSceneAsCover = false;
      RemoteConfig._parse({
        themes: [
          { id: 1, cover: 'http://cdn/a.png' },
          { id: 2, cover: 'assets/b.png' },   // 非 http，应被过滤
          { cover: 'http://cdn/c.png' },      // 无 id，应被过滤
        ],
        levels: []
      });
      expect(RemoteConfig.themes).toHaveLength(1);
      expect(RemoteConfig.themes[0].id).toBe(1);
    });

    test('useFirstLevelSceneAsCover=true 时，cover 变为可选，只要有 id 就保留', function () {
      CONFIG.USE_MOCK_CONFIG = false;
      CONFIG.TEMPLATE.home.useFirstLevelSceneAsCover = true;
      RemoteConfig._parse({
        themes: [
          { id: 1, cover: 'http://cdn/a.png' },
          { id: 2 },                          // 无 cover，不再被过滤
          { cover: 'http://cdn/c.png' },      // 无 id，仍应被过滤
        ],
        levels: []
      });
      expect(RemoteConfig.themes.map(function (t) { return t.id; })).toEqual([1, 2]);
    });

    test('levels 落在 hiddenIdxRanges 区间内应被过滤', function () {
      RemoteConfig._parse({
        themes: [],
        levels: [
          { idx: 1, themeId: 1 },
          { idx: 5, themeId: 1 },   // 在 [3,6] 区间内，应过滤
          { idx: 10, themeId: 1 }
        ],
        hiddenIdxRanges: [[3, 6]]
      });
      expect(RemoteConfig.levels.map(function (l) { return l.idx; })).toEqual([1, 10]);
    });

    test('缺少 idx 的 level 应被过滤（防脏数据）', function () {
      RemoteConfig._parse({ themes: [], levels: [{ themeId: 1 }] });
      expect(RemoteConfig.levels).toHaveLength(0);
    });

    test('props/tauntLines/version 均应按原样保留', function () {
      RemoteConfig._parse({
        themes: [], levels: [],
        props: { foo: 'bar' }, laotieLines: ['a', 'b'], version: 'v9'
      });
      expect(RemoteConfig.props).toEqual({ foo: 'bar' });
      expect(RemoteConfig.tauntLines).toEqual(['a', 'b']);
      expect(RemoteConfig.version).toBe('v9');
    });

    test('远程 JSON 若已用新字段名 tauntLines，应优先读新字段名', function () {
      RemoteConfig._parse({
        themes: [], levels: [],
        tauntLines: ['new'], laotieLines: ['old']
      });
      expect(RemoteConfig.tauntLines).toEqual(['new']);
    });
  });

  describe('查询方法', function () {
    beforeEach(function () {
      RemoteConfig._parse({
        themes: [
          { id: 1, cover: 'http://cdn/a.png' },
          { id: 2, cover: 'http://cdn/b.png' }
        ],
        levels: [
          { idx: 10, themeId: 1 },
          { idx: 20, themeId: 2 },
          { idx: 11, themeId: 1 }
        ]
      });
    });

    test('getLevelsByTheme 应按 idx 升序返回该主题的关卡', function () {
      var levels = RemoteConfig.getLevelsByTheme(1);
      expect(levels.map(function (l) { return l.idx; })).toEqual([10, 11]);
    });

    test('getLevelsByTheme 支持字符串 themeId（内部会 parseInt）', function () {
      var levels = RemoteConfig.getLevelsByTheme('2');
      expect(levels).toHaveLength(1);
      expect(levels[0].idx).toBe(20);
    });

    test('getLevelByIdx 命中应返回对应关卡，未命中返回 null', function () {
      expect(RemoteConfig.getLevelByIdx(20).themeId).toBe(2);
      expect(RemoteConfig.getLevelByIdx(999)).toBeNull();
    });

    test('getTheme 命中应返回对应主题，未命中返回 null', function () {
      expect(RemoteConfig.getTheme(1).id).toBe(1);
      expect(RemoteConfig.getTheme(99)).toBeNull();
    });
  });

  describe('getThemeCoverSrc', function () {
    test('useFirstLevelSceneAsCover=true 时，hidden/hunt/story 玩法取第一关 scene', function () {
      CONFIG.TEMPLATE.home.useFirstLevelSceneAsCover = true;
      RemoteConfig._parse({
        themes: [{ id: 1, cover: 'http://cdn/fallback.png' }],
        levels: [{ idx: 1, themeId: 1, mode: 'hidden', scene: 'http://cdn/scene1.png' }]
      });
      var theme = RemoteConfig.getTheme(1);
      expect(RemoteConfig.getThemeCoverSrc(theme)).toBe('http://cdn/scene1.png');
    });

    test('useFirstLevelSceneAsCover=true 时，spot 玩法取第一关 sceneA', function () {
      CONFIG.TEMPLATE.home.useFirstLevelSceneAsCover = true;
      RemoteConfig._parse({
        themes: [{ id: 1, cover: 'http://cdn/fallback.png' }],
        levels: [{ idx: 1, themeId: 1, mode: 'spot', sceneA: 'http://cdn/a.png', sceneB: 'http://cdn/b.png' }]
      });
      var theme = RemoteConfig.getTheme(1);
      expect(RemoteConfig.getThemeCoverSrc(theme)).toBe('http://cdn/a.png');
    });

    test('useFirstLevelSceneAsCover=true 时，dressup 玩法取第一个角色的 result（缺失则回退 scene）', function () {
      CONFIG.TEMPLATE.home.useFirstLevelSceneAsCover = true;
      RemoteConfig._parse({
        themes: [{ id: 1, cover: 'http://cdn/fallback.png' }],
        levels: [{
          idx: 1, themeId: 1, mode: 'dressup',
          characters: [{ scene: 'http://cdn/char-scene.png', result: 'http://cdn/char-result.png' }]
        }]
      });
      var theme = RemoteConfig.getTheme(1);
      expect(RemoteConfig.getThemeCoverSrc(theme)).toBe('http://cdn/char-result.png');
    });

    test('取不到第一关场景图时回退到 theme.cover', function () {
      CONFIG.TEMPLATE.home.useFirstLevelSceneAsCover = true;
      RemoteConfig._parse({
        themes: [{ id: 1, cover: 'http://cdn/fallback.png' }],
        levels: []
      });
      var theme = RemoteConfig.getTheme(1);
      expect(RemoteConfig.getThemeCoverSrc(theme)).toBe('http://cdn/fallback.png');
    });

    test('useFirstLevelSceneAsCover=false 时，直接使用 theme.cover', function () {
      CONFIG.TEMPLATE.home.useFirstLevelSceneAsCover = false;
      RemoteConfig._parse({
        themes: [{ id: 1, cover: 'http://cdn/fallback.png' }],
        levels: [{ idx: 1, themeId: 1, mode: 'hidden', scene: 'http://cdn/scene1.png' }]
      });
      var theme = RemoteConfig.getTheme(1);
      expect(RemoteConfig.getThemeCoverSrc(theme)).toBe('http://cdn/fallback.png');
    });
  });

  describe('load()', function () {
    test('USE_MOCK_CONFIG=true 时应直接使用本地 mock 配置，不发请求', function (done) {
      CONFIG.USE_MOCK_CONFIG = true;
      global.fetch = jest.fn(); // 不应被调用

      RemoteConfig.load(function (err, rc) {
        expect(err).toBeNull();
        expect(global.fetch).not.toHaveBeenCalled();
        expect(rc.status()).toBe('success');
        done();
      });
    });

    test('fetch 成功应解析数据并触发回调', function (done) {
      CONFIG.USE_MOCK_CONFIG = false;
      global.fetch = jest.fn().mockResolvedValue({
        json: function () {
          return Promise.resolve({
            themes: [{ id: 1, cover: 'http://cdn/a.png' }],
            levels: [{ idx: 1, themeId: 1 }]
          });
        }
      });

      RemoteConfig.load(function (err, rc) {
        expect(err).toBeNull();
        expect(rc.themes).toHaveLength(1);
        expect(rc.status()).toBe('success');
        done();
      });
    });

    test('重复调用 load 在 loading 中应不重复发起请求', function () {
      CONFIG.USE_MOCK_CONFIG = false;
      global.fetch = jest.fn().mockReturnValue(new Promise(function () {})); // 挂起不 resolve
      RemoteConfig.load();
      RemoteConfig.load();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('已 success 状态下再次 load 应直接回调，不再请求', function (done) {
      CONFIG.USE_MOCK_CONFIG = true;
      RemoteConfig.load(function () {
        global.fetch = jest.fn();
        RemoteConfig.load(function (err, rc) {
          expect(global.fetch).not.toHaveBeenCalled();
          expect(rc.status()).toBe('success');
          done();
        });
      });
    });

    test('连续失败达到 MAX_RETRY 次后应进入 error 态并触发所有回调', function () {
      // 直接驱动 _onFail（内部重试逻辑），不经过真实的 setTimeout/网络请求，
      // 避免真实等待指数退避延时（2s+4s+8s）拖慢测试；重试计数/状态流转本身
      // 是同步逻辑，与是否真的发起了下一次网络请求无关。前两次失败会各自
      // 调度一个真实的重试 setTimeout，这里用 fake timers 接管，测试结束时
      // 不推进它，避免产生游离的真实网络请求。
      jest.useFakeTimers();
      var received = [];
      RemoteConfig.onReady(function (err, rc) { received.push([err, rc]); });

      expect(RemoteConfig.status()).toBe('idle');
      RemoteConfig._onFail(new Error('network fail'));
      expect(RemoteConfig.status()).toBe('idle');   // 第 1/2 次失败仍在重试中，不改变对外状态
      expect(received).toHaveLength(0);

      RemoteConfig._onFail(new Error('network fail'));
      expect(received).toHaveLength(0);

      RemoteConfig._onFail(new Error('network fail'));
      expect(RemoteConfig.status()).toBe('error');
      expect(received).toHaveLength(1);
      expect(received[0][0]).toBeInstanceOf(Error);
      expect(received[0][1]).toBeNull();
    });

    test('_onFail 收到 timeout 错误且重试耗尽后状态应为 timeout（非 error）', function () {
      jest.useFakeTimers();
      RemoteConfig._onFail(new Error('timeout'));
      RemoteConfig._onFail(new Error('timeout'));
      RemoteConfig._onFail(new Error('timeout'));
      expect(RemoteConfig.status()).toBe('timeout');
    });
  });
});
