const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../package/api/kwai-payment.js'), 'utf8');
function load(ks) { const window = { M3: {} }; const logs = []; const timers = new Map(); let seq = 0; const console = { log: x => logs.push(x), warn: x => logs.push(x), error: x => logs.push(x) }; vm.runInNewContext(source, { window, ks, console, Promise, setTimeout: fn => { const id = ++seq; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) }); return { api: window.KwaiPayment, logs, runTimers: () => { const list = Array.from(timers.values()); timers.clear(); list.forEach(fn => fn()); } }; }
test('H5 不提供假支付且未知平台不可用', async () => {
  const env = load(undefined);
  assert.strictEqual(env.api.getPlatform(), '');
  assert.strictEqual(env.api.isAvailable(), false);
  assert.strictEqual((await env.api.requestPayment({ sign: 'secret' })).code, 'PAYMENT_API_UNAVAILABLE');
});
test('识别 Android/iOS 并仅传白名单参数', async () => {
  let options;
  const env = load({ getSystemInfoSync: () => ({ platform: 'android', system: 'Android 14' }), requestGamePayment: o => { options = o; o.success({}); } });
  assert.strictEqual(env.api.getPlatform(), 'android');
  const result = await env.api.requestPayment({ zone_id: '1', sign: 'secret', product_type: 9, evil: 'drop' });
  assert.strictEqual(result.outcome, 'success');
  assert.strictEqual(options.zone_id, '1'); assert.strictEqual(options.sign, 'secret');
  assert.strictEqual(options.product_type, undefined); assert.strictEqual(options.evil, undefined);
  assert.ok(env.logs.every(line => String(line).indexOf('secret') < 0), '不得记录 sign');
  assert.strictEqual(load({ getSystemInfoSync: () => ({ system: 'iOS 18' }), requestGamePayment () {} }).api.getPlatform(), 'ios');
});
test('complete 空对象和无回调 watchdog 都归一为 unknown', async () => {
  let options;
  const completeEnv = load({ getSystemInfoSync: () => ({ system: 'Android' }), requestGamePayment: o => { options = o; } });
  const completed = completeEnv.api.requestPayment({ sign: 'x' }); options.complete({});
  assert.strictEqual((await completed).outcome, 'unknown');
  const silentEnv = load({ getSystemInfoSync: () => ({ system: 'Android' }), requestGamePayment () {} });
  const silent = silentEnv.api.requestPayment({ sign: 'x' }); silentEnv.runTimers();
  const result = await silent;
  assert.strictEqual(result.outcome, 'unknown'); assert.strictEqual(result.code, 'PAYMENT_CALLBACK_TIMEOUT');
});
test('多回调 settle-once，取消与异常归一化', async () => {
  let options;
  const env = load({ getSystemInfoSync: () => ({ system: 'Android' }), requestGamePayment: o => { options = o; } });
  const pending = env.api.requestPayment({ sign: 'x' });
  options.fail({ errCode: 1, errMsg: 'user cancel' }); options.success({}); options.complete({ errMsg: 'fail' });
  assert.strictEqual((await pending).outcome, 'cancel');
  const thrown = load({ getSystemInfoSync: () => ({ system: 'Android' }), requestGamePayment: () => { throw new Error('boom'); } });
  assert.strictEqual((await thrown.api.requestPayment({ sign: 'x' })).outcome, 'unknown');
});
