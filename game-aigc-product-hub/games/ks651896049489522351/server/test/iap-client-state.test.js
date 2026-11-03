const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PKG = path.resolve(__dirname, '../../package');
function env(options = {}) {
  const handlers = {}, sent = [], payments = [], timers = new Map(); let seq = 0, storageWrites = 0;
  const storage = options.storage || {};
  const flashes = [];
  const authData = { accountId: 'a', loginType: options.loginType || 'kwai' };
  const pendingHttp = [];
  const window = { M3: { Auth: { getIdentity: () => ({ accountId: 'a', loginType: options.loginType || 'kwai' }) }, IapHttp: { request: (type, data) => {
    const request = { type, data };
    sent.push(request);
    return { then: (resolve, reject) => { request.resolve = resolve; request.reject = reject; } };
  } }, Network: { on: (t, f) => { handlers[t] = f; }, send: (type, data) => sent.push({ type, data }), getAuthData: () => options.authBeforeIap ? authData : null }, Game: { syncWallet () {}, flash: msg => flashes.push(msg) } } };
  const localStorage = { getItem: k => storage[k] || null, setItem: (k, v) => { storageWrites++; if (options.storageFails || (options.failStorageWriteAt && storageWrites === options.failStorageWriteAt)) throw new Error('quota'); storage[k] = v; }, removeItem: k => { delete storage[k]; } };
  const sandbox = { window, console, Date, Math, Promise, Uint8Array, isFinite, localStorage, setTimeout: fn => { const id = ++seq; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(fs.readFileSync(path.join(PKG, 'js/diamond-wallet.js'), 'utf8'), sandbox);
  sandbox.KwaiPayment = { getPlatform: () => 'android', isAvailable: () => true, requestPayment: p => { payments.push(p); return Promise.resolve({ outcome: 'success', message: 'ok' }); } };
  sandbox.KwaiBase = { onShow () {} };
  vm.runInNewContext(fs.readFileSync(path.join(PKG, 'js/iap.js'), 'utf8'), sandbox);
  function emit(type, data) { handlers[type](data || {}); }
  function reply(request, type, data) { request.resolve(data || {}); }
  if (!options.authBeforeIap) emit('authOk', authData);
  return { iap: window.M3.Iap, wallet: window.M3.DiamondWallet, sent, payments, emit, reply, timers, storage, flashes, runLastTimer: () => { const ids = Array.from(timers.keys()); const id = ids[ids.length - 1]; const fn = timers.get(id); timers.delete(id); if (fn) fn(); } };
}
test('平台托管余额保留字符串精度且拒绝旧观测与错账号', () => {
  const e = env(); const w = e.wallet; const epoch = w.getAccountEpoch();
  assert.strictEqual(w.normalize('0009007199254740993'), '9007199254740993');
  assert.strictEqual(w.compare('9007199254740993', '9007199254740992'), 1);
  assert.strictEqual(w.format('12345678901234567890'), '1234567890123456.7万');
  assert.ok(w.apply({ accountId: 'a', chargeBalance: '9007199254740990', freeBalance: '3', balance: '9007199254740993', observedAt: 2, stale: false }, 'a', epoch));
  assert.strictEqual(w.apply({ accountId: 'a', balance: '1', observedAt: 1 }, 'a', epoch), false);
  assert.strictEqual(w.apply({ accountId: 'b', balance: '9', observedAt: 3 }, 'a', epoch), false);
  assert.strictEqual(w.getState().balance, '9007199254740993');
  assert.strictEqual(w.getState().chargeBalance, '9007199254740990');
});
test('平台 success 只进入确认，服务端 FULFILLED 才到账', async () => {
  const e = env();
  const pendingReq = e.sent.find(x => x.type === 'getPendingIapOrders'); e.reply(pendingReq, 'pendingIapOrders', { orders: [] });
  e.iap.loadCatalog(); const cat = e.sent.find(x => x.type === 'getIapCatalog'); e.reply(cat, 'iapCatalog', { items: [{ skuId: 's', platforms: ['android'] }] });
  assert.strictEqual(e.iap.buy('s'), true); assert.strictEqual(e.iap.buy('s'), false, '单活跃支付');
  const create = e.sent.find(x => x.type === 'createIapOrder'); e.reply(create, 'iapOrderCreated', { orderId: 'o1', paymentParams: { sign: 'secret' } });
  await Promise.resolve(); await Promise.resolve();
  assert.strictEqual(e.iap.getState().flow, 'CONFIRMING_RESULT');
  e.runLastTimer();
  const query = e.sent.filter(x => x.type === 'getIapOrder').pop(); e.reply(query, 'iapOrder', { orderId: 'o1', status: 'PAYMENT_CONFIRMED' });
  assert.strictEqual(e.iap.getState().flow, 'FULFILLED'); assert.strictEqual(e.wallet.getState().balance, '0', '支付履约不能客户端加余额');
  const balanceReq = e.sent.filter(x => x.type === 'getPlatformCoinBalance').pop();
  e.reply(balanceReq, 'platformCoinBalance', { accountId: 'a', chargeBalance: '60', freeBalance: '0', balance: '60', observedAt: 1, stale: false });
  assert.strictEqual(e.wallet.getState().balance, '60');
});
test('取消保留恢复记录，detach 隔离旧平台回调', async () => {
  const e = env();
  e.reply(e.sent.find(x => x.type === 'getPendingIapOrders'), 'pendingIapOrders', { orders: [] });
  e.iap.loadCatalog(); e.reply(e.sent.find(x => x.type === 'getIapCatalog'), 'iapCatalog', { items: [{ skuId: 's', platforms: ['android'] }] });
  const old = e.iap.getState().epoch;
  e.iap.buy('s'); const create = e.sent.find(x => x.type === 'createIapOrder');
  // Existing mock resolves success asynchronously; detach before its microtask applies.
  e.reply(create, 'iapOrderCreated', { orderId: 'old-order', paymentParams: { sign: 'x' } });
  e.iap.detachCurrentAccount(); await Promise.resolve(); await Promise.resolve();
  assert.ok(e.iap.getState().epoch > old); assert.strictEqual(e.iap.getState().accountId, '');
  assert.strictEqual(e.sent.filter(x => x.type === 'reportIapClientResult').length, 0, '旧结果不得经新连接上报');
  assert.match(e.storage['ddz_iap_pending_v1:a'], /old-order/, '旧账号恢复记录必须保留');
});
test('authFail 推进 epoch 并阻止晚到建单响应唤起支付', async () => {
  const e = env();
  e.iap.loadCatalog(); e.reply(e.sent.find(x => x.type === 'getIapCatalog'), 'iapCatalog', { items: [{ skuId: 's', platforms: ['android'] }] });
  const oldEpoch = e.iap.getState().epoch;
  assert.strictEqual(e.iap.buy('s'), true);
  const create = e.sent.find(x => x.type === 'createIapOrder');
  e.emit('authFail', {});
  e.reply(create, 'iapOrderCreated', { orderId: 'late-order', paymentParams: { sign: 'secret' } });
  await Promise.resolve(); await Promise.resolve();
  assert.ok(e.iap.getState().epoch > oldEpoch);
  assert.strictEqual(e.iap.getState().active, null);
  assert.strictEqual(e.iap.getState().flow, 'IDLE');
  assert.strictEqual(e.payments.length, 0);
});

test('建单失败后显式重试复用原 requestId', () => {
  const e = env();
  e.reply(e.sent.find(x => x.type === 'getPendingIapOrders'), 'pendingIapOrders', { orders: [] });
  e.iap.loadCatalog(); e.reply(e.sent.find(x => x.type === 'getIapCatalog'), 'iapCatalog', { items: [{ skuId: 's', platforms: ['android'] }] });
  assert.ok(e.iap.buy('s'));
  const first = e.sent.filter(x => x.type === 'createIapOrder').pop();
  e.iap.handleError({ commandType: 'createIapOrder', correlationId: first.data.correlationId, code: 'PAYMENT_UNAVAILABLE', message: '暂不可用' });
  assert.strictEqual(e.iap.getState().flow, 'SERVICE_ERROR'); assert.ok(e.iap.retryCreate());
  const second = e.sent.filter(x => x.type === 'createIapOrder').pop();
  assert.strictEqual(second.data.requestId, first.data.requestId);
});
test('兑换持久化 clientRequestId，accepted 后按 exchangeOrderId 轮询', () => {
  const storage = {}, e = env({ storage });
  assert.ok(e.iap.exchange('ex1')); const first = e.sent.filter(x => x.type === 'createPlatformCoinExchange').pop();
  assert.ok(first.data.clientRequestId);
  e.reply(first, 'platformCoinExchangeAccepted', { exchangeOrderId: 'ex-order-1' });
  e.runLastTimer();
  const query = e.sent.filter(x => x.type === 'getPlatformCoinExchange').pop();
  assert.strictEqual(query.data.exchangeOrderId, 'ex-order-1');
  e.reply(query, 'platformCoinExchangeResult', { exchangeOrderId: 'ex-order-1', status: 'DEBIT_UNKNOWN' });
  assert.strictEqual(e.iap.getState().exchangeStatus, 'DEBIT_UNKNOWN');
  assert.strictEqual(e.iap.retryExchange(), false, '扣款未知时不能创建或手动重试');
  e.runLastTimer();
  assert.strictEqual(e.sent.filter(x => x.type === 'createPlatformCoinExchange').length, 1);
  assert.strictEqual(e.sent.filter(x => x.type === 'getPlatformCoinExchange').pop().data.exchangeOrderId, 'ex-order-1');
  const restarted = env({ storage });
  assert.strictEqual(restarted.iap.getState().exchangePending, true);
  restarted.runLastTimer();
  assert.strictEqual(restarted.sent.filter(x => x.type === 'getPlatformCoinExchange').pop().data.exchangeOrderId, 'ex-order-1');
});
test('EXCHANGE_PENDING 使用服务端原订单号恢复查询', () => {
  const e = env();
  assert.ok(e.iap.exchange('ex1'));
  const create = e.sent.filter(x => x.type === 'createPlatformCoinExchange').pop();
  create.reject({ code: 'EXCHANGE_PENDING', message: 'exchange confirmation pending', exchangeOrderId: 'existing-order' });
  e.runLastTimer();
  const query = e.sent.filter(x => x.type === 'getPlatformCoinExchange').pop();
  assert.strictEqual(query.data.exchangeOrderId, 'existing-order');
  assert.strictEqual(e.iap.getState().exchangeStatus, 'ACCEPTED');
});

test('轮询按 lastCheckedAt 公平选择后续订单', () => {
  const storage = { 'ddz_iap_pending_v1:a': JSON.stringify([
    { orderId: 'old', requestId: 'r1', skuId: 's', os: 'android', stage: 'confirming', createdAt: 1, lastCheckedAt: 50 },
    { orderId: 'next', requestId: 'r2', skuId: 's', os: 'android', stage: 'created', createdAt: 2, lastCheckedAt: 0 },
  ]) };
  const e = env({ storage });
  const pendingRecovery = e.sent.find(x => x.type === 'getPendingIapOrders');
  e.reply(pendingRecovery, 'pendingIapOrders', { orders: [] });
  e.runLastTimer();
  assert.strictEqual(e.sent.filter(x => x.type === 'getIapOrder').pop().data.orderId, 'next');
});
test('三笔未决订单时拒绝新支付且存储失败可见', () => {
  const storage = { 'ddz_iap_pending_v1:a': JSON.stringify([1, 2, 3].map((n) => ({ orderId: 'o' + n, requestId: 'r' + n, skuId: 's', os: 'android', stage: 'created', createdAt: n }))) };
  const e = env({ storage });
  e.iap.loadCatalog(); e.reply(e.sent.find(x => x.type === 'getIapCatalog'), 'iapCatalog', { items: [{ skuId: 's', platforms: ['android'] }] });
  assert.strictEqual(e.iap.buy('s'), false); assert.strictEqual(e.iap.getState().flow, 'PENDING_LIMIT'); assert.match(e.iap.getState().error, /3笔/);
  const broken = env({ storageFails: true }); broken.iap.exchange('ex');
  assert.strictEqual(broken.iap.getState().storageError, true); assert.match(broken.flashes.pop(), /恢复不可用/);
});

test('游客不能触发任何平台支付请求', () => {
  const e = env({ loginType: 'guest', authBeforeIap: true });
  assert.strictEqual(e.iap.getState().accountId, 'a');
  assert.strictEqual(e.iap.loadCatalog(), false);
  assert.strictEqual(e.iap.buy('s'), false);
  assert.strictEqual(e.iap.exchange('ex'), false);
  e.iap.syncWallet();
  e.iap.recover();
  e.iap.refresh();
  assert.deepStrictEqual(e.sent, []);
});
test('持久化失败时不发送资金请求且不遗留锁', () => {
  const e = env({ storageFails: true });
  e.iap.loadCatalog(); e.reply(e.sent.find(x => x.type === 'getIapCatalog'), 'iapCatalog', { items: [{ skuId: 's', platforms: ['android'] }] });
  assert.strictEqual(e.iap.buy('s'), false);
  assert.strictEqual(e.sent.some(x => x.type === 'createIapOrder'), false);
  assert.strictEqual(e.iap.getState().active, null);
  assert.strictEqual(e.iap.exchange('ex'), false);
  assert.strictEqual(e.sent.some(x => x.type === 'createPlatformCoinExchange'), false);
  assert.strictEqual(e.iap.getState().exchangePending, false);
  assert.strictEqual(e.iap.getState().storageError, true);
  assert.match(e.flashes.pop(), /恢复不可用/);
});

test('建单成功后订单映射持久化失败时不唤起平台支付', async () => {
  const e = env({ failStorageWriteAt: 2 });
  e.iap.loadCatalog();
  e.reply(e.sent.find(x => x.type === 'getIapCatalog'), 'iapCatalog', { items: [{ skuId: 's', platforms: ['android'] }] });
  assert.strictEqual(e.iap.buy('s'), true);
  const create = e.sent.find(x => x.type === 'createIapOrder');
  e.reply(create, 'iapOrderCreated', { orderId: 'o1', paymentParams: { sign: 'secret' } });
  await Promise.resolve();
  assert.strictEqual(e.payments.length, 0);
  assert.strictEqual(e.iap.getState().flow, 'SERVICE_ERROR');
  assert.strictEqual(e.iap.getState().active.orderId, '');
  assert.strictEqual(e.iap.getState().storageError, true);
});

test('IAP 错误由唯一入口消费', () => {
  const e = env();
  assert.strictEqual(e.iap.handleError({ commandType: 'getIapOrder', code: 'RATE_LIMITED' }), true);
  assert.strictEqual(e.iap.handleError({ commandType: 'play', message: 'bad' }), false);
});
