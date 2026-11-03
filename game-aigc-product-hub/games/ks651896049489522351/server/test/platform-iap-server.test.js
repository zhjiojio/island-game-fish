'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlatformClient } = require('../payment/platform-client');
const { buildZoneId, createPlatformBalanceService } = require('../payment/platform-balance-service');
const { createPlatformExchangeService, buildStableIds } = require('../payment/platform-exchange-service');
const { STATUSES } = require('../payment/platform-exchange-store');

function memoryStore () {
  let order = null;
  return {
    STATUSES,
    async getByAccountAndRequestId (accountId, requestId) {
      return order && order.accountId === accountId && order.clientRequestId === requestId ? { ...order } : null;
    },
    async getById (id) { return order?.exchangeOrderId === id ? { ...order } : null; },
    async getBlockingByAccountAndSku (accountId, skuId) {
      return order && order.accountId === accountId && order.exchangeSkuId === skuId &&
        [STATUSES.CREATED, STATUSES.DEBITING, STATUSES.DEBIT_UNKNOWN, STATUSES.DEBIT_SUCCEEDED, STATUSES.FULFILLING].includes(order.status)
        ? { ...order }
        : null;
    },
    async insertOrder (value) {
      const timestamp = Date.now();
      order = { ...value, status: STATUSES.CREATED, debitAttempts: 0, beansBalanceAfter: null,
        createdAt: timestamp, updatedAt: timestamp };
    },
    async beginDebitAttempt (id, options) {
      const timestamp = Date.now();
      const leaseMs = Number(options?.leaseMs || 30000);
      const claimable = order.status === STATUSES.CREATED || order.status === STATUSES.DEBIT_UNKNOWN ||
        (order.status === STATUSES.DEBITING && timestamp - order.updatedAt >= leaseMs);
      if (!claimable) return 0;
      order.status = STATUSES.DEBITING;
      order.debitAttempts += 1;
      order.updatedAt = timestamp;
      return 1;
    },
    async recordDebitResult (id, status, result) {
      if (order.status !== STATUSES.DEBITING) return 0;
      order.status = status;
      order.platformCode = result.code || '';
      order.updatedAt = Date.now();
      return 1;
    },
    async markReview (id, reason) { order.status = STATUSES.REVIEW; order.platformMessage = reason; return 1; },
    async listRecoverable () { return order ? [{ ...order }] : []; },
    async markFulfilling () { order.status = STATUSES.FULFILLING; return 1; },
    async markFulfilled (id, after) { order.status = STATUSES.FULFILLED; order.beansBalanceAfter = String(after); return 1; },
    age (ms) { order.updatedAt -= ms; },
    mutate (values) { Object.assign(order, values); },
    snapshot () { return { ...order }; },
  };
}

function fakeDb () {
  const ledger = new Map();
  const wallet = { beans: '10', total_earned: '10' };
  return {
    ledger,
    wallet,
    async get (sql, params) {
      if (sql.includes('FROM accounts')) return { account_id: params[0] };
      if (sql.includes('FROM wallet_ledger')) return ledger.get(params[0]) || null;
      if (sql.includes('FROM wallets')) return { ...wallet };
      return null;
    },
    async run (sql, params) {
      if (sql.includes('UPDATE wallets')) { wallet.beans = params[0]; wallet.total_earned = String(BigInt(wallet.total_earned) + BigInt(params[1])); return { affectedRows: 1 }; }
      if (sql.includes('INSERT INTO wallet_ledger')) ledger.set(params[6], { balance_before: params[3], balance_after: params[4] });
      return { affectedRows: 1 };
    },
  };
}

const passthroughTx = async fn => fn();
const identityStore = { requireOpenIdForAccount: async () => 'plain-open-id' };
const catalog = { getExchangeProduct: async () => ({ enabled: true, exchangeSkuId: 'sku', platformProductId: '3', platformProductType: 0, displayName: '3000铁豆', costBalance: '3', grantBeans: '3000' }) };

test('zone_id is stable by account and contains no OS', () => {
  const a = buildZoneId('account-1');
  assert.equal(a, buildZoneId('account-1'));
  assert.notEqual(a, buildZoneId('account-2'));
  assert.doesNotMatch(a, /android|ios/i);
});

test('balance DTO keeps balance as string and hides open_id', async () => {
  let request;
  const service = createPlatformBalanceService({
    client: { getBalance: async value => { request = value; return { chargeBalance: 9007199254740990n, freeBalance: 3n }; } },
    identityStore,
    db: { run: async () => ({ affectedRows: 1 }) },
  });
  const result = await service.getBalance({ accountId: 'account-1', loginType: 'kwai', os: 'android', userIp: '127.0.0.1' });
  assert.equal(result.balance, '9007199254740993');
  assert.equal(result.chargeBalance, '9007199254740990');
  assert.equal(result.freeBalance, '3');
  assert.equal(request.openId, 'plain-open-id');
  assert.equal(JSON.stringify(result).includes('plain-open-id'), false);
});

test('platform client sends expected pay contract without logging secrets', async () => {
  let request;
  const client = createPlatformClient({ appId: 'app', accessToken: 'token', signKey: 'sign-key', baseUrl: 'https://example.test', fetch: async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200, json: async () => ({ code: 1, data: { chargeBalance: 7, freeBalance: 0 } }) };
  } });
  const result = await client.pay({
    openId: 'secret-open', zoneId: 'zone', os: 'android', userIp: '127.0.0.1',
    bizNo: 'biz123', amount: '3', payPriority: 1, productName: '铁豆',
    productInfo: '[]', productDesc: 'exchange',
  });
  assert.equal(result.success, true);
  const body = Object.fromEntries(new URLSearchParams(request.options.body));
  assert.equal(request.options.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(body.open_id, 'secret-open');
  assert.equal(body.biz_no, 'biz123');
  assert.equal(body.pay_priority, '1');
  assert.ok(body.sign);
  assert.equal(request.url.includes('token'), false);
});

test('pay retries reuse biz_no, then successful debit credits exactly once', async () => {
  const store = memoryStore();
  const db = fakeDb();
  const calls = [];
  const service = createPlatformExchangeService({
    store, db, retryableTransaction: passthroughTx, lockWalletForUpdate: async () => ({}),
    identityStore, catalog, maxPayAttempts: 3,
    client: { pay: async request => { calls.push(request); if (calls.length === 1) throw Object.assign(new Error('timeout'), { code: 'PLATFORM_TIMEOUT', retryable: true }); return { success: true, code: '1' }; } },
  });
  const input = { accountId: 'account-1', loginType: 'kwai', os: 'android', userIp: '127.0.0.1', exchangeSkuId: 'sku', clientRequestId: '123e4567-e89b-42d3-a456-426614174000' };
  const result = await service.exchange(input);
  assert.equal(result.status, STATUSES.FULFILLED);
  assert.equal(result.grantedBeans, '3000');
  assert.equal(db.wallet.beans, '3010');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].bizNo, calls[1].bizNo);
  assert.equal(calls[0].bizNo, buildStableIds(input.accountId, input.clientRequestId).bizNo);
  const repeated = await service.exchange(input);
  assert.equal(repeated.idempotent, true);
  assert.equal(db.wallet.beans, '3010');
  assert.equal(calls.length, 2);
});

test('exhausted immediate retries remain unknown and later reuse the same biz_no', async () => {
  const store = memoryStore();
  const calls = [];
  const service = createPlatformExchangeService({
    store, db: fakeDb(), retryableTransaction: passthroughTx, lockWalletForUpdate: async () => ({}),
    identityStore, catalog, maxPayAttempts: 2, unknownRetryMs: 1000,
    client: { pay: async request => { calls.push(request); throw Object.assign(new Error('timeout'), { code: 'PLATFORM_TIMEOUT', retryable: true }); } },
  });
  const input = { accountId: 'account-2', loginType: 'kwai', os: 'ios', userIp: '127.0.0.1', exchangeSkuId: 'sku', clientRequestId: '223e4567-e89b-42d3-a456-426614174000' };
  const first = await service.exchange(input);
  assert.equal(first.status, STATUSES.DEBIT_UNKNOWN);
  assert.equal(calls.length, 2);
  assert.equal(new Set(calls.map(call => call.bizNo)).size, 1);
  store.age(1001);
  const again = await service.exchange(input);
  assert.equal(again.status, STATUSES.DEBIT_UNKNOWN);
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map(call => call.bizNo)).size, 1);
});

test('expired DEBITING lease is reclaimed with the original biz_no', async () => {
  const store = memoryStore();
  const calls = [];
  const service = createPlatformExchangeService({
    store, db: fakeDb(), retryableTransaction: passthroughTx, lockWalletForUpdate: async () => ({}),
    identityStore, catalog, maxPayAttempts: 1, debitLeaseMs: 1000,
    client: { pay: async request => { calls.push(request); return { success: true, code: '1' }; } },
  });
  const input = { accountId: 'account-3', loginType: 'kwai', os: 'android', userIp: '127.0.0.1', exchangeSkuId: 'sku', clientRequestId: '323e4567-e89b-42d3-a456-426614174000' };
  const ids = buildStableIds(input.accountId, input.clientRequestId);
  await service.exchange(input);
  store.mutate({ status: STATUSES.DEBITING, beansBalanceAfter: null, updatedAt: Date.now() - 1001 });
  const result = await service.getOrderForAccount(input.accountId, ids.exchangeOrderId);
  assert.equal(result.status, STATUSES.FULFILLED);
  assert.equal(calls.at(-1).bizNo, ids.bizNo);
});

test('malformed successful HTTP response is classified as unknown', async () => {
  const client = createPlatformClient({
    appId: 'app', accessToken: 'token', signKey: 'sign-key', baseUrl: 'https://example.test',
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ data: {} }) }),
  });
  await assert.rejects(() => client.pay({
    openId: 'secret-open', zoneId: 'zone', os: 'android', userIp: '127.0.0.1',
    bizNo: 'biz123', amount: '3', payPriority: 1, productName: '铁豆',
    productInfo: '[]', productDesc: 'exchange',
  }), err => err.code === 'PLATFORM_INVALID_RESPONSE' && err.retryable === true);
});
