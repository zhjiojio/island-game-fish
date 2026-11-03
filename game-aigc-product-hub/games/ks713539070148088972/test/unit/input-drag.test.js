/**
 * test/unit/input-drag.test.js — InputManager 拖拽状态机单测
 * 覆盖：dragArea 注册/优先级命中 + move/end 生命周期 + tap 隔离
 */
'use strict';

require('../../js/core/input.js');

describe('InputManager drag', function () {
  beforeEach(function () {
    jest.resetModules();
    require('../../js/core/input.js');
  });

  test('命中最高优先级 dragArea 后只调用该区域的 onDragStart', function () {
    var events = [];
    window.InputManager.addDrag({
      x: 0, y: 0, w: 100, h: 100, priority: 10,
      onDragStart: function () { events.push('low'); }
    });
    window.InputManager.addDrag({
      x: 0, y: 0, w: 100, h: 100, priority: 20,
      onDragStart: function (x, y) { events.push('high:' + x + ',' + y); }
    });

    expect(window.InputManager.handleDragStart(20, 30)).toBe(true);
    expect(events).toEqual(['high:20,30']);
    expect(window.InputManager.isDragging()).toBe(true);
  });

  test('拖拽期间只派发 move 和 end，并在结束后清理状态', function () {
    var events = [];
    window.InputManager.addDrag({
      x: 0, y: 0, w: 100, h: 100,
      onDragMove: function (x, y) { events.push('move:' + x + ',' + y); },
      onDragEnd: function (x, y) { events.push('end:' + x + ',' + y); }
    });

    window.InputManager.handleDragStart(10, 10);
    window.InputManager.handleDragMove(25, 35);
    window.InputManager.handleDragEnd(40, 50);

    expect(events).toEqual(['move:25,35', 'end:40,50']);
    expect(window.InputManager.isDragging()).toBe(false);
  });

  test('dragArea 命中时不触发相同坐标的 tapArea', function () {
    var taps = 0;
    window.InputManager.add({ x: 0, y: 0, w: 100, h: 100, onTap: function () { taps++; } });
    window.InputManager.addDrag({ x: 0, y: 0, w: 100, h: 100 });

    expect(window.InputManager.handleDragStart(20, 20)).toBe(true);
    window.InputManager.handleTap(20, 20);

    expect(taps).toBe(0);
  });
});
