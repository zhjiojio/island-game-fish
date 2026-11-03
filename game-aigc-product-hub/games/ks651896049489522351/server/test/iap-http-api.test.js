process.env.DDZ_AUTH_MODE = 'dev';
process.env.DDZ_AUTH_SECRET = 'iap_http_test_secret';
process.env.DDZ_KWAI_PAY_SIGN_KEY = 'iap_http_test_sign_key';
process.env.DDZ_KWAI_PAY_NOTIFY_KEY = 'iap_http_test_notify_key';
process.env.DDZ_KWAI_PAY_SIGN_KEY = 'iap_http_test_sign_key';
process.env.DDZ_KWAI_PAY_NOTIFY_KEY = 'iap_http_test_notify_key';

const test = require('node:test');
const assert = require('node:assert');
const auth = require('../auth');
const { createIapHttpHandler } = require('../payment/http-api');
const { getConfig, _resetConfig } = require('../payment/config');
const { handleRequest, registerIapHttpHandler, setReady, clientIp } = require('../http-server');

function setup (options = {}) {
  const calls = [];
  const config = { orderCreateEnabled: true, platformEnabled: true, exchangeEnabled: true, androidEnabled: true, iosEnabled: true, ...(options.config || {}) };
  const createResults = options.createResults || [{ orderId: 'o1', status: 'PENDING', paymentParams: { sign: 'x' }, idempotent: false }];
  let createIndex = 0;
  const handler = createIapHttpHandler({
    getConfig: () => config,
    iapCatalog: { getEnabledProducts: async os => [{ skuId: 'd60', priceFen: '605', platformCoinAmount: '60', displayName: '60钻石', enabledAndroid: os === 'android', enabledIos: os === 'ios' }] },
    iapOrderService: {
      createOrder: async input => { calls.push(['create', input]); return createResults[Math.min(createIndex++, createResults.length - 1)]; },
      reportClientResult: async (...args) => calls.push(['report', ...args]),
      getOrderForAccount: async () => {
        if (options.getOrderError) throw options.getOrderError;
        return { orderId: 'o1', skuId: 'd60', status: 'PAYMENT_CONFIRMED', platformCoinAmount: '60', createdAt: 1, paymentConfirmedAt: 2 };
      },
      listPendingOrders: async () => [{ orderId: 'o1', skuId: 'd60', status: 'PENDING', platformCoinAmount: '60', createdAt: 1, updatedAt: 2 }],
    },
    exchangeCatalog: {
      getExchangeProductsForAccount: async () => [{ exchangeSkuId: 'x60', displayName: '60钻石换铁豆', costBalance: '60', grantBeans: '60000', displayOrder: 1 }],
      getEnabledExchangeProducts: async () => [{ exchangeSkuId: 'x60', displayName: '60钻石换铁豆', costBalance: '60', grantBeans: '60000', displayOrder: 1 }],
    },
    platformBalanceService: { getBalance: async input => { calls.push(['balance', input]); return { accountId: input.accountId, chargeBalance: '60', freeBalance: '10', balance: '70', observedAt: 1, stale: false }; } },
    platformExchangeService: {
      exchange: async input => { calls.push(['exchange', input]); return { exchangeOrderId: 'e1', status: 'DEBIT_UNKNOWN' }; },
      getOrderForAccount: async () => ({ exchangeOrderId: 'e1', status: 'FULFILLED', spentBalance: '60', grantedBeans: '60000' }),
    },
  });
  const token = auth.issueSessionToken({ accountId: 'ks_test', loginType: 'kwai' });
  async function call (method, path, options = {}) {
    const url = new URL(path, 'http://localhost');
    return handler.handle({ method, path: url.pathname, query: url.searchParams, headers: { authorization: `Bearer ${token}`, ...(options.headers || {}) }, rawBody: options.body ? JSON.stringify(options.body) : '', clientIp: '127.0.0.1' });
  }
  return { call, calls, handler };
}

test('支付配置默认启用所有能力且要求密钥', () => {
  const original = {
    signKey: process.env.DDZ_KWAI_PAY_SIGN_KEY,
    notifyKey: process.env.DDZ_KWAI_PAY_NOTIFY_KEY,
    platformEnabled: process.env.DDZ_KWAI_PLATFORM_IAP_ENABLED,
    orderCreateEnabled: process.env.DDZ_KWAI_IAP_ORDER_CREATE_ENABLED,
    exchangeEnabled: process.env.DDZ_PLATFORM_COIN_EXCHANGE_ENABLED,
  };
  try {
    process.env.DDZ_KWAI_PAY_SIGN_KEY = 'test_sign_key';
    process.env.DDZ_KWAI_PAY_NOTIFY_KEY = 'test_notify_key';
    process.env.DDZ_KWAI_PLATFORM_IAP_ENABLED = 'false';
    process.env.DDZ_KWAI_IAP_ORDER_CREATE_ENABLED = 'false';
    process.env.DDZ_PLATFORM_COIN_EXCHANGE_ENABLED = 'false';
    _resetConfig();
    const config = getConfig();
    assert.strictEqual(config.platformEnabled, true);
    assert.strictEqual(config.orderCreateEnabled, true);
    assert.strictEqual(config.androidEnabled, true);
    assert.strictEqual(config.iosEnabled, true);
    assert.strictEqual(config.exchangeEnabled, true);

    delete process.env.DDZ_KWAI_PAY_SIGN_KEY;
    _resetConfig();
    assert.throws(() => getConfig(), /DDZ_KWAI_PAY_SIGN_KEY/);
  } finally {
    for (const [key, value] of Object.entries({
      DDZ_KWAI_PAY_SIGN_KEY: original.signKey,
      DDZ_KWAI_PAY_NOTIFY_KEY: original.notifyKey,
      DDZ_KWAI_PLATFORM_IAP_ENABLED: original.platformEnabled,
      DDZ_KWAI_IAP_ORDER_CREATE_ENABLED: original.orderCreateEnabled,
      DDZ_PLATFORM_COIN_EXCHANGE_ENABLED: original.exchangeEnabled,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    _resetConfig();
  }
});

test('公开支付商品目录无需 Bearer，订单接口要求快手身份', async () => {
  const { handler, call } = setup();
  const publicCatalog = await handler.handle({ method: 'GET', path: '/api/v1/iap/products', query: new URLSearchParams('os=android'), headers: {}, rawBody: '', clientIp: '' });
  assert.strictEqual(publicCatalog.status, 200);
  const guest = auth.issueSessionToken({ accountId: 'guest_test', loginType: 'guest' });
  const forbidden = await handler.handle({ method: 'POST', path: '/api/v1/iap/orders', query: new URLSearchParams(), headers: { authorization: `Bearer ${guest}`, 'content-type': 'application/json', 'idempotency-key': '12345678-1234-4234-8234-123456789abc' }, rawBody: JSON.stringify({ skuId: 'd60', os: 'android' }), clientIp: '' });
  assert.strictEqual(forbidden.status, 403);
  assert.strictEqual((await call('POST', '/api/v1/iap/orders', { headers: { 'content-type': 'application/json', 'idempotency-key': '12345678-1234-4234-8234-123456789abc' }, body: { skuId: 'd60', os: 'android' } })).status, 201);
});

test('充值 HTTP API 透传幂等键并按账号隔离', async () => {
  const { call, calls } = setup();
  const catalog = await call('GET', '/api/v1/iap/products?os=android');
  assert.strictEqual(catalog.status, 200);
  assert.strictEqual(catalog.data.items[0].skuId, 'd60');
  assert.strictEqual(catalog.data.items[0].priceText, '¥6.05');
  const created = await call('POST', '/api/v1/iap/orders', { headers: { 'content-type': 'application/json', 'idempotency-key': '12345678-1234-4234-8234-123456789abc' }, body: { skuId: 'd60', os: 'android' } });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(calls[0][1].accountId, 'ks_test');
  assert.strictEqual(calls[0][1].clientRequestId, '12345678-1234-4234-8234-123456789abc');
  const order = await call('GET', '/api/v1/iap/orders/o1');
  assert.strictEqual(order.data.status, 'PAYMENT_CONFIRMED');
  const pending = await call('GET', '/api/v1/iap/orders?status=pending');
  assert.strictEqual(pending.data.orders.length, 1);
});

test('商品目录默认同时提供 Android、iOS 与平台币兑换商品', async () => {
  const { call } = setup();
  const android = await call('GET', '/api/v1/iap/products?os=android');
  const ios = await call('GET', '/api/v1/iap/products?os=ios');
  const exchangeCatalog = await call('GET', '/api/v1/platform-coins/exchange-products');
  assert.strictEqual(android.data.items[0].platforms[0], 'android');
  assert.strictEqual(ios.data.items[0].platforms[0], 'ios');
  assert.strictEqual(exchangeCatalog.data.items[0].exchangeSkuId, 'x60');
});

test('充值订单首次创建返回 201，幂等重放返回 200', async () => {
  const result = { orderId: 'o1', status: 'PENDING', paymentParams: { sign: 'x' } };
  const { call } = setup({ createResults: [{ ...result, idempotent: false }, { ...result, idempotent: true }] });
  const options = { headers: { 'content-type': 'application/json', 'idempotency-key': '12345678-1234-4234-8234-123456789abc' }, body: { skuId: 'd60', os: 'android' } };
  assert.strictEqual((await call('POST', '/api/v1/iap/orders', options)).status, 201);
  assert.strictEqual((await call('POST', '/api/v1/iap/orders', options)).status, 200);
});

test('公开错误使用固定消息且内部异常脱敏', async () => {
  const { call: invalidCall } = setup();
  const invalid = await invalidCall('POST', '/api/v1/iap/orders', { headers: { 'idempotency-key': '12345678-1234-4234-8234-123456789abc' }, body: { skuId: 'd60', os: 'android' } });
  assert.deepStrictEqual(invalid.data.error, { code: 'INVALID_CONTENT_TYPE', message: 'content-type must be application/json' });

  const { call } = setup({ getOrderError: new Error('mysql password=secret internal detail') });
  const failure = await call('GET', '/api/v1/iap/orders/o1');
  assert.strictEqual(failure.status, 500);
  assert.deepStrictEqual(failure.data.error, { code: 'PAYMENT_REQUEST_FAILED', message: 'payment request failed' });
});

test('仅受信代理可从右向左剥离代理链', () => {
  const request = { headers: { 'x-forwarded-for': '198.51.100.9, 203.0.113.7, 10.0.0.2' }, socket: { remoteAddress: '10.0.0.1' } };
  assert.strictEqual(clientIp(request, { trustedProxyIps: [] }), '10.0.0.1');
  assert.strictEqual(clientIp(request, { trustedProxyIps: ['10.0.0.1', '10.0.0.2'] }), '203.0.113.7');
  assert.strictEqual(clientIp({ ...request, headers: { 'x-forwarded-for': 'spoofed' } }, { trustedProxyIps: ['10.0.0.1'] }), '10.0.0.1');
});

test('支付 HTTP 前置响应统一禁止缓存', async () => {
  registerIapHttpHandler({ handle: async () => ({ handled: true, status: 200, data: {} }) });
  setReady(false);
  function response () {
    return {
      headers: {},
      writeHead (status, headers) { this.status = status; this.headers = headers; },
      end (body) { this.body = body; },
    };
  }
  const base = { url: '/api/v1/iap/products?os=android', headers: { host: 'localhost' }, socket: { remoteAddress: '127.0.0.1' }, on () {}, resume () {} };
  const unavailable = response();
  await handleRequest({ ...base, method: 'GET' }, unavailable);
  assert.strictEqual(unavailable.status, 503);
  assert.strictEqual(unavailable.headers['Cache-Control'], 'no-store');

  const options = response();
  await handleRequest({ ...base, method: 'OPTIONS' }, options);
  assert.strictEqual(options.status, 204);
  assert.strictEqual(options.headers['Cache-Control'], 'no-store');
});

test('余额和兑换 HTTP API 复用平台资金服务', async () => {
  const { call, calls } = setup();
  const balance = await call('GET', '/api/v1/platform-coins/balance?os=android');
  assert.strictEqual(balance.data.balance, '70');
  const catalog = await call('GET', '/api/v1/platform-coins/exchange-products');
  assert.strictEqual(catalog.data.items[0].exchangeSkuId, 'x60');
  const accepted = await call('POST', '/api/v1/platform-coins/exchange-orders', { headers: { 'content-type': 'application/json', 'idempotency-key': '12345678-1234-4234-8234-123456789abc' }, body: { exchangeSkuId: 'x60', os: 'android' } });
  assert.strictEqual(accepted.status, 202);
  assert.strictEqual(calls.find(call => call[0] === 'exchange')[1].clientRequestId, '12345678-1234-4234-8234-123456789abc');
  const result = await call('GET', '/api/v1/platform-coins/exchange-orders/e1');
  assert.strictEqual(result.status, 200);
  assert.strictEqual(result.data.status, 'FULFILLED');
});
