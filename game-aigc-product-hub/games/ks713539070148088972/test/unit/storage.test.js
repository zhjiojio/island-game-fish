/**
 * test/unit/storage.test.js — Storage 单测
 * 覆盖：ks/localStorage 双写降级、每日解锁结构过期判定、永久解锁 key 拼接、
 *       统计累加、clearAll 批量清理
 * 说明：jsdom 环境自带 localStorage，测试环境里没有全局 `ks`（快手小游戏 API），
 *       Storage 内部会自动降级只用 localStorage，这正好覆盖了"H5 浏览器兜底"分支。
 */
'use strict';

require('../../js/core/product.config.js');
require('../../js/core/config.js');
require('../../js/systems/storage.js');

var Storage = window.Storage;

describe('Storage', function () {
  beforeEach(function () {
    localStorage.clear();
  });

  test('set/get 基本读写（JSON 序列化往返）', function () {
    Storage.set('k1', { a: 1, b: 'x' });
    expect(Storage.get('k1')).toEqual({ a: 1, b: 'x' });
  });

  test('get 不存在的 key 应返回 null', function () {
    expect(Storage.get('not-exist-key')).toBeNull();
  });

  test('remove 后 get 应返回 null', function () {
    Storage.set('k2', 'v');
    Storage.remove('k2');
    expect(Storage.get('k2')).toBeNull();
  });

  describe('每日解锁（isDailyUnlocked / markDailyUnlocked）', function () {
    test('未标记过的 id 应为未解锁', function () {
      expect(Storage.isDailyUnlocked('daily_key', 'pack1')).toBe(false);
    });

    test('标记后同一天应判定为已解锁', function () {
      Storage.markDailyUnlocked('daily_key', 'pack1');
      expect(Storage.isDailyUnlocked('daily_key', 'pack1')).toBe(true);
    });

    test('标记的 id 与查询的 id 不同应判定为未解锁', function () {
      Storage.markDailyUnlocked('daily_key', 'pack1');
      expect(Storage.isDailyUnlocked('daily_key', 'pack2')).toBe(false);
    });

    test('存储的 date 不是今天应判定为未解锁（模拟跨天失效）', function () {
      localStorage.setItem('daily_key', JSON.stringify({ date: '2000-1-1', ids: { pack1: 1 } }));
      expect(Storage.isDailyUnlocked('daily_key', 'pack1')).toBe(false);
    });
  });

  describe('主题永久解锁（isThemePermUnlocked / markThemePermUnlocked）', function () {
    test('未解锁的主题应为 false', function () {
      expect(Storage.isThemePermUnlocked(1)).toBe(false);
    });

    test('markThemePermUnlocked 后应判定为已解锁', function () {
      Storage.markThemePermUnlocked(1);
      expect(Storage.isThemePermUnlocked(1)).toBe(true);
    });

    test('不同主题 id 互不影响', function () {
      Storage.markThemePermUnlocked(1);
      expect(Storage.isThemePermUnlocked(2)).toBe(false);
    });
  });

  describe('通关记录（markLevelPassed / isLevelPassed）', function () {
    test('未通关的关卡应为 false', function () {
      expect(Storage.isLevelPassed(5)).toBe(false);
    });

    test('markLevelPassed 后应判定为已通关', function () {
      Storage.markLevelPassed(5);
      expect(Storage.isLevelPassed(5)).toBe(true);
    });
  });

  describe('统计（addStat / getStats）', function () {
    test('无数据时 getStats 应返回默认零值结构', function () {
      expect(Storage.getStats()).toEqual({ correct: 0, wrong: 0, levelPass: 0 });
    });

    test('addStat 默认累加 1', function () {
      Storage.addStat('correct');
      Storage.addStat('correct');
      expect(Storage.getStats().correct).toBe(2);
    });

    test('addStat 支持自定义增量', function () {
      Storage.addStat('wrong', 3);
      expect(Storage.getStats().wrong).toBe(3);
    });
  });

  describe('上次所在关卡（setLastLevel / getLastLevel）', function () {
    test('未设置时应返回 null', function () {
      expect(Storage.getLastLevel('theme1')).toBeNull();
    });

    test('setLastLevel 后应能读回', function () {
      Storage.setLastLevel('theme1', 7);
      expect(Storage.getLastLevel('theme1')).toBe(7);
    });
  });

  describe('clearAll', function () {
    test('应清空固定 key 与动态 key（按 themes 列表）', function () {
      Storage.set(CONFIG.STORAGE_KEYS.user, { nickName: 'x' });
      Storage.addStat('correct');
      Storage.markThemePermUnlocked('t1');
      Storage.setLastLevel('t1', 3);

      Storage.clearAll([{ id: 't1' }]);

      expect(Storage.get(CONFIG.STORAGE_KEYS.user)).toBeNull();
      expect(Storage.getStats()).toEqual({ correct: 0, wrong: 0, levelPass: 0 });
      expect(Storage.isThemePermUnlocked('t1')).toBe(false);
      expect(Storage.getLastLevel('t1')).toBeNull();
    });

    test('不传 themes 时也不应抛异常（仅清固定 key）', function () {
      expect(function () { Storage.clearAll(); }).not.toThrow();
    });
  });
});
