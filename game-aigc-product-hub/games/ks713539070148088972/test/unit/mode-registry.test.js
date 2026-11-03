/**
 * test/unit/mode-registry.test.js — ModeRegistry 单测
 * 覆盖：register/create/list 基本行为 + 未注册 id 的容错
 */
'use strict';

require('../../js/play/mode-registry.js');

describe('ModeRegistry', function () {
  beforeEach(function () {
    // 每个 mode-registry.js 加载都是新的模块闭包吗？不是——window.ModeRegistry 是
    // 单例，内部 _registry 在 require 时就固定了闭包变量，跨测试文件会累积状态。
    // 这里用 jest.resetModules + 重新 require 保证每个 test 用干净的注册表。
    jest.resetModules();
    require('../../js/play/mode-registry.js');
  });

  test('register 后 list 应包含该 id', function () {
    function FakeMode() {}
    window.ModeRegistry.register('fake', FakeMode);
    expect(window.ModeRegistry.list()).toContain('fake');
  });

  test('create 应返回注册的构造函数实例，并传入 level/theme', function () {
    function FakeMode(level, theme) {
      this.level = level;
      this.theme = theme;
    }
    window.ModeRegistry.register('fake', FakeMode);

    var level = { idx: 1 };
    var theme = { id: 2 };
    var inst = window.ModeRegistry.create('fake', level, theme);

    expect(inst).toBeInstanceOf(FakeMode);
    expect(inst.level).toBe(level);
    expect(inst.theme).toBe(theme);
  });

  test('create 未注册的 id 应返回 null（不抛异常）', function () {
    var inst = window.ModeRegistry.create('not-exist', {}, {});
    expect(inst).toBeNull();
  });

  test('list 初始应为空数组（干净的注册表）', function () {
    expect(window.ModeRegistry.list()).toEqual([]);
  });

  test('重复 register 同一个 id 应覆盖为最新的构造函数', function () {
    function ModeA() { this.tag = 'A'; }
    function ModeB() { this.tag = 'B'; }
    window.ModeRegistry.register('dup', ModeA);
    window.ModeRegistry.register('dup', ModeB);
    var inst = window.ModeRegistry.create('dup', {}, {});
    expect(inst.tag).toBe('B');
  });

  test('dressup mode 可以通过注册表创建', function () {
    require('../../js/play/modes/base-mode.js');
    require('../../js/play/modes/dressup.js');
    var level = { mode: 'dressup', outfits: [] };
    var mode = ModeRegistry.create('dressup', level, { id: 'theme' });

    expect(mode).toBeTruthy();
    expect(mode.level).toBe(level);
    expect(mode.theme.id).toBe('theme');
    expect(typeof mode.draw).toBe('function');
  });
});
