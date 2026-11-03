const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../../package/js/iap-http.js'), 'utf8');

function load () {
  const calls = [];
  const window = { M3: {
    Config: { HTTP_SERVER_URL: 'https://game.example.com/' },
    Auth: { getIdentity: () => ({ accountId: 'a', loginType: 'kwai' }), getSessionToken: () => 'token-value' },
  } };
  const KwaiNetwork = { request: options => { calls.push(options); options.onSuccess({ statusCode: 200, data: { ok: true } }); } };
  vm.runInNewContext(source, { window, KwaiNetwork, Promise, encodeURIComponent });
  return { api: window.M3.IapHttp, calls };
}

test('充值建单使用 HTTP Bearer 与 Idempotency-Key', async () => {
  const env = load();
  await env.api.request('createIapOrder', { requestId: 'r1', skuId: 'd60', os: 'android' });
  const request = env.calls[0];
  assert.strictEqual(request.url, 'https://game.example.com/api/v1/iap/orders');
  assert.strictEqual(request.method, 'POST');
  assert.strictEqual(request.header.Authorization, 'Bearer token-value');
  assert.strictEqual(request.header['Idempotency-Key'], 'r1');
  assert.strictEqual(request.data.skuId, 'd60');
  assert.strictEqual(request.data.os, 'android');
});

test('查询与兑换映射到平台币 HTTP 路由', async () => {
  const env = load();
  await env.api.request('getPlatformCoinBalance', { os: 'ios' });
  await env.api.request('getPlatformCoinExchange', { exchangeOrderId: 'e/1' });
  assert.strictEqual(env.calls[0].url, 'https://game.example.com/api/v1/platform-coins/balance?os=ios');
  assert.strictEqual(env.calls[1].url, 'https://game.example.com/api/v1/platform-coins/exchange-orders/e%2F1');
});

test('HTTP 错误归一化且保留安全的兑换恢复订单号', async () => {
  const env = load();
  env.calls.length = 0;
  const original = env.api.request;
  const window = { M3: { Config: { HTTP_SERVER_URL: 'https://game.example.com' }, Auth: { getIdentity: () => ({ loginType: 'kwai' }), getSessionToken: () => 'secret-token' } } };
  const KwaiNetwork = { request: options => options.onSuccess({ statusCode: 409, data: { error: { code: 'EXCHANGE_PENDING', message: 'conflict', exchangeOrderId: 'existing-order' } } }) };
  vm.runInNewContext(source, { window, KwaiNetwork, Promise, encodeURIComponent });
  await assert.rejects(window.M3.IapHttp.request('getPendingIapOrders', {}), error => error.code === 'EXCHANGE_PENDING' && error.exchangeOrderId === 'existing-order' && !JSON.stringify(error).includes('secret-token'));
  assert.ok(original);
});
