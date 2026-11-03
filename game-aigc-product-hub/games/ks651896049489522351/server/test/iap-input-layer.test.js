const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('BeanReward 与资金页同时可见时只有 beanreward 按钮响应', () => {
  const handlers = {};
  const calls = [];
  const buttons = [
    { x: 0, y: 0, w: 100, h: 100, label: 'diamond_store_buy_s', onClick: () => calls.push('commerce') },
    { x: 0, y: 0, w: 100, h: 100, label: 'beanreward_close', onClick: () => calls.push('beanreward') },
  ];
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), addEventListener: (name, fn) => { handlers[name] = fn; } };
  const M3 = {
    Layout: { w: 100, h: 100 }, Render: { getHitBtns: () => buttons, getHandHits: () => [] },
    Game: { getScreen: () => 'home' }, SceneBeanReward: { isVisible: () => true },
    SceneDiamondStore: { isVisible: () => true }, SceneDiamondExchange: { isVisible: () => false }, log () {},
  };
  const window = { M3, canvas, addEventListener () {} };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../package/js/input.js'), 'utf8'), {
    window, document: { readyState: 'complete', addEventListener () {} }, console, Date,
  });
  const event = { offsetX: 10, offsetY: 10, preventDefault () {} };
  handlers.mousedown(event); handlers.mouseup(event);
  assert.deepStrictEqual(calls, ['beanreward']);
});
