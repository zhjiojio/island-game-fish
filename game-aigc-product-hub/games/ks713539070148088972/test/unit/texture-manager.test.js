/**
 * test/unit/texture-manager.test.js — TextureManager 并发限制 + 失败重试单测
 * 背景：换装等多图玩法一次性并发请求几十张缩略图，弱网下容易大量超时，
 *       旧实现超时后直接放弃且永不重试，表现为图片永久占位/"加载不出来"。
 * 覆盖：
 *   - 同一时刻正在加载的图片数不超过 MAX_CONCURRENT，超出的排队等待
 *   - 单次失败（onerror）后会自动重试，最终仍能加载成功
 *   - 重试次数耗尽后才 reject
 * 说明：用自定义的 window.Image stub 控制 onload/onerror 触发时机，
 *       不依赖真实网络/GL 上下文（GLContext.gl 置空即可，load() 对 gl 为 null 有兜底）。
 */
'use strict';

function loadFresh() {
  jest.resetModules();
  global.GLContext = { gl: null };
  global.Storage = { get: function () { return null; }, set: function () {} };
  require('../../js/render/texture.js');
  return window.TextureManager;
}

var _images;

function installImageStub() {
  _images = [];
  global.Image = function () {
    this.onload = null;
    this.onerror = null;
    this._src = null;
    var self = this;
    Object.defineProperty(this, 'src', {
      set: function (v) { self._src = v; _images.push(self); },
      get: function () { return self._src; }
    });
    this.width = 10;
    this.height = 10;
  };
}

describe('TextureManager 并发限制 + 失败重试', function () {
  var TextureManager;

  beforeEach(function () {
    installImageStub();
    TextureManager = loadFresh();
  });

  test('同一时刻并发加载数不超过上限，超出的排队', function () {
    var srcs = [];
    for (var i = 0; i < 10; i++) srcs.push('https://cdn.test/img' + i + '.png');
    srcs.forEach(function (src) { TextureManager.load(src).catch(function () {}); });

    // 只有前 4 个（MAX_CONCURRENT）应该已经创建了 Image 并设置了 src
    expect(_images.length).toBe(4);

    // 完成前 4 个后，应该立刻补位加载队列里的下一批
    _images.slice(0, 4).forEach(function (img) { img.onload(); });
    expect(_images.length).toBe(8);
  });

  test('加载失败会自动重试，最终成功', function (done) {
    var src = 'https://cdn.test/retry-once.png';
    TextureManager.load(src).then(function (entry) {
      expect(entry.src).toBe(src);
      done();
    });

    expect(_images.length).toBe(1);
    _images[0].onerror(); // 第一次失败

    // 重试是 setTimeout 延迟触发的，走真实定时器
    setTimeout(function () {
      expect(_images.length).toBe(2); // 已发起第二次尝试
      _images[1].onload(); // 第二次成功
    }, 700);
  }, 2000);

  test('重试次数耗尽后最终 reject', function (done) {
    var src = 'https://cdn.test/always-fail.png';
    TextureManager.load(src).catch(function (err) {
      expect(err).toBeTruthy();
      expect(_images.length).toBe(3); // 首次尝试 + RETRY_LIMIT(2) 次重试 = 共 3 次
      done();
    });

    // 每次失败后新一次尝试都是异步（setTimeout 退避）创建的，轮询等待新 Image
    // 出现后再触发它的 onerror，避免和内部重试延迟产生竞态。
    var attemptIdx = 0;
    var poll = setInterval(function () {
      if (_images.length > attemptIdx) {
        var img = _images[attemptIdx];
        attemptIdx++;
        img.onerror();
        if (attemptIdx >= 3) clearInterval(poll);
      }
    }, 20);
  }, 8000);
});
