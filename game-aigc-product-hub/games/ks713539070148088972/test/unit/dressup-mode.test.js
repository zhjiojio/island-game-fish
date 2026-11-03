'use strict';

describe('DressupMode (multi-character match)', function () {
  var DressupMode;

  beforeEach(function () {
    window.M3 = window.M3 || {};
    window.M3.Layout = { w: 414, h: 896, safeTop: 0, usableH: 896 };
    window.M3._now = function () { return Date.now(); };

    window.Renderer = {
      drawRect: jest.fn(),
      drawRoundRect: jest.fn(),
      drawText: jest.fn(),
      drawImage: jest.fn(),
      drawImageFit: jest.fn(),
      drawImageFlippedX: jest.fn(),
      drawCircle: jest.fn()
    };

    window.InputManager = {
      add: jest.fn(),
      addAll: jest.fn(),
      addDrag: jest.fn(),
      addDragAll: jest.fn(),
      addErrRipple: jest.fn(),
      clear: jest.fn(),
      isDragging: jest.fn(function () { return false; }),
      handleDragStart: jest.fn(),
      handleDragMove: jest.fn(),
      handleDragEnd: jest.fn(),
      handleTap: jest.fn()
    };

    window.CONFIG = {
      HUD_H: 44,
      STATUS_H: 32,
      TOOLBAR_H: 48,
      uiAsset: jest.fn(function () { return ''; }),
      TEMPLATE: { hud: { showBottomItemStrip: false } },
      getHudContentHeight: function () { return this.HUD_H; },
      getStageBottomReserve: function () { return this.TOOLBAR_H; }
    };

    window.PlayController = {};

    jest.resetModules();
    require('../../js/play/modes/base-mode.js');
    require('../../js/play/mode-registry.js');
    require('../../js/play/modes/dressup.js');
    DressupMode = window.ModeRegistry.create('dressup', { mode: 'dressup', characters: [], outfits: [] }, { id: 'theme' }).constructor;
  });

  test('拖对衣服到正确角色上时标记匹配并回调 correct', function () {
    var correct = jest.fn();
    var complete = jest.fn();
    window.PlayController = { onModeCorrect: correct, onModeComplete: complete };

    var mode = new DressupMode({
      characters: [
        { id: 'char_01', scene: 'a.jpg', result: 'a_result.jpg', correctOutfit: 'outfit_02' },
        { id: 'char_02', scene: 'b.jpg', result: 'b_result.jpg', correctOutfit: 'outfit_01' }
      ],
      outfits: [
        { id: 'outfit_01', name: '衣服1', thumbnail: 't1.jpg' },
        { id: 'outfit_02', name: '衣服2', thumbnail: 't2.jpg' }
      ]
    }, {});
    mode._fit = { x: 0, y: 0, w: 200, h: 300 };

    mode.startDrag('outfit_02', 10, 10);
    var result = mode.endDrag(100, 120);

    expect(result).toEqual({ accepted: true, correct: true, complete: false });
    expect(correct).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
    expect(mode.getDressupState().matchedCount).toBe(1);
    expect(mode.getDressupState().matchedChars['char_01']).toBe(true);
    expect(mode.getDressupState().matchedOutfits['outfit_02']).toBe(true);
  });

  test('拖错衣服到角色上回调 wrong 且不计入匹配', function () {
    var wrong = jest.fn();
    window.PlayController = { onModeWrong: wrong };

    var mode = new DressupMode({
      characters: [
        { id: 'char_01', scene: 'a.jpg', result: 'a_result.jpg', correctOutfit: 'outfit_02' },
        { id: 'char_02', scene: 'b.jpg', result: 'b_result.jpg', correctOutfit: 'outfit_01' }
      ],
      outfits: [
        { id: 'outfit_01', name: '衣服1', thumbnail: 't1.jpg' },
        { id: 'outfit_02', name: '衣服2', thumbnail: 't2.jpg' }
      ]
    }, {});
    mode._fit = { x: 0, y: 0, w: 200, h: 300 };

    mode.startDrag('outfit_01', 10, 10);
    var result = mode.endDrag(100, 120);

    expect(result).toEqual({ accepted: true, correct: false, complete: false });
    expect(wrong).toHaveBeenCalledWith(expect.objectContaining({ id: 'outfit_01' }));
    expect(mode.getDressupState().matchedCount).toBe(0);
  });

  test('左右切换角色不改匹配状态', function () {
    var mode = new DressupMode({
      characters: [
        { id: 'char_01', scene: 'a.jpg', result: 'a_result.jpg', correctOutfit: 'outfit_02' },
        { id: 'char_02', scene: 'b.jpg', result: 'b_result.jpg', correctOutfit: 'outfit_01' }
      ],
      outfits: [
        { id: 'outfit_01', name: '衣服1', thumbnail: 't1.jpg' },
        { id: 'outfit_02', name: '衣服2', thumbnail: 't2.jpg' }
      ]
    }, {});
    mode._fit = { x: 0, y: 0, w: 200, h: 300 };

    expect(mode.getDressupState().currentChar).toBe(0);
    expect(mode.switchChar(1)).toBe(true);
    expect(mode.getDressupState().currentChar).toBe(1);
    expect(mode.switchChar(-1)).toBe(true);
    expect(mode.getDressupState().currentChar).toBe(0);
    expect(mode.switchChar(-1)).toBe(false);
    expect(mode.getDressupState().currentChar).toBe(0);
  });

  test('全部匹配后触发 complete 且不重复触发', function () {
    var complete = jest.fn();
    window.PlayController = { onModeCorrect: jest.fn(), onModeComplete: complete };

    var mode = new DressupMode({
      characters: [
        { id: 'char_01', scene: 'a.jpg', result: 'a_result.jpg', correctOutfit: 'outfit_02' },
        { id: 'char_02', scene: 'b.jpg', result: 'b_result.jpg', correctOutfit: 'outfit_01' }
      ],
      outfits: [
        { id: 'outfit_01', name: '衣服1', thumbnail: 't1.jpg' },
        { id: 'outfit_02', name: '衣服2', thumbnail: 't2.jpg' }
      ]
    }, {});
    mode._fit = { x: 0, y: 0, w: 200, h: 300 };

    mode.startDrag('outfit_02', 0, 0);
    mode.endDrag(100, 120);

    mode.switchChar(1);
    mode.startDrag('outfit_01', 0, 0);
    var result = mode.endDrag(100, 120);

    expect(result).toEqual({ accepted: true, correct: true, complete: true });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(mode.confirm()).toEqual({ complete: true, remaining: 0 });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  test('已匹配的衣服不能再次拖拽', function () {
    var mode = new DressupMode({
      characters: [
        { id: 'char_01', scene: 'a.jpg', result: 'a_result.jpg', correctOutfit: 'outfit_01' }
      ],
      outfits: [
        { id: 'outfit_01', name: '衣服1', thumbnail: 't1.jpg' }
      ]
    }, {});
    mode._fit = { x: 0, y: 0, w: 200, h: 300 };

    mode.startDrag('outfit_01', 0, 0);
    mode.endDrag(100, 120);

    expect(mode.startDrag('outfit_01', 0, 0)).toBe(false);
  });

  test('draw 设置 _fit 并为未匹配衣服注册 dragArea', function () {
    var mode = new DressupMode({
      characters: [
        { id: 'c1', scene: 'a.jpg', result: 'ar.jpg', correctOutfit: 'o2' },
        { id: 'c2', scene: 'b.jpg', result: 'br.jpg', correctOutfit: 'o1' }
      ],
      outfits: [
        { id: 'o1', name: '衣1', thumbnail: 't1.jpg' },
        { id: 'o2', name: '衣2', thumbnail: 't2.jpg' }
      ]
    }, {});

    mode.draw({});

    expect(mode._fit).toBeTruthy();
    expect(InputManager.addDrag).toHaveBeenCalledTimes(2);
    expect(InputManager.add).toHaveBeenCalled();
  });

  test('draw 对已匹配的衣服不注册 dragArea', function () {
    var mode = new DressupMode({
      characters: [
        { id: 'c1', scene: 'a.jpg', result: 'ar.jpg', correctOutfit: 'o1' },
        { id: 'c2', scene: 'b.jpg', result: 'br.jpg', correctOutfit: 'o2' }
      ],
      outfits: [
        { id: 'o1', name: '衣1', thumbnail: 't1.jpg' },
        { id: 'o2', name: '衣2', thumbnail: 't2.jpg' }
      ]
    }, {});
    mode._fit = { x: 0, y: 0, w: 200, h: 300 };

    mode.startDrag('o1', 0, 0);
    mode.endDrag(100, 120);

    InputManager.addDrag.mockClear();
    mode.draw({});

    expect(InputManager.addDrag).toHaveBeenCalledTimes(1);
  });

  test('draw 注册左右箭头 tapArea', function () {
    var mode = new DressupMode({
      characters: [
        { id: 'c1', scene: 'a.jpg', result: 'ar.jpg', correctOutfit: 'o2' },
        { id: 'c2', scene: 'b.jpg', result: 'br.jpg', correctOutfit: 'o1' }
      ],
      outfits: [
        { id: 'o1', name: '衣1', thumbnail: 't1.jpg' },
        { id: 'o2', name: '衣2', thumbnail: 't2.jpg' }
      ]
    }, {});

    mode.draw({});
    var addCalls = InputManager.add.mock.calls;
    var hasLeftRight = addCalls.some(function (call) {
      var area = call[0];
      return area.label && (area.label === 'dressup-prev' || area.label === 'dressup-next');
    });
    expect(hasLeftRight).toBe(true);
  });
});
