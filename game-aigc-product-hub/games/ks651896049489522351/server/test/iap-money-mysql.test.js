'use strict';

process.env.DDZ_AUTH_MODE = 'dev';
process.env.DDZ_AUTH_SECRET = 'iap_mysql_test_auth_secret';
process.env.DDZ_KWAI_PAY_SIGN_KEY = 'iap_mysql_test_sign_key';
process.env.DDZ_KWAI_PAY_NOTIFY_KEY = 'iap_mysql_test_notify_key';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { setupMysqlTest, teardownMysqlTest } = require('./helpers/mysql-test');

let ready = false;
let dbm;

async function seedAccount (accountId, beans = '0', loginType = 'kwai') {
  const db = dbm.getDb();
  const now = Date.now();
  await db.run(`
    INSERT INTO accounts (
      account_id, account_type, login_type, kwai_open_id_hash, device_id,
      first_ip, last_ip, login_count, banned, ban_reason, created_at, last_login_at
    ) VALUES (?, 'user', ?, '', '', '', '', 1, 0, '', ?, ?)
  `, [accountId, loginType, now, now]);
  await db.run(`
    INSERT INTO wallets (
      account_id, beans, frozen_beans, total_earned, total_spent, total_won,
      total_lost, daily_login_date, share_reward_date, created_at, updated_at, version
    ) VALUES (?, ?, 0, 0, 0, 0, 0, '', '', ?, ?, 1)
  `, [accountId, beans, now, now]);
}

test.before(async () => {
  try {
    dbm = await setupMysqlTest();
    const db = dbm.getDb();
    await db.run("UPDATE iap_products SET goods_category = 'test_virtual_goods'");
    require('../payment/catalog').invalidateCache();
    require('../payment/platform-exchange-catalog').invalidateCache();
    ready = true;
  } catch (err) {
    console.log('[SKIP] MySQL IAP 测试环境不可用:', err.message);
  }
});

test.after(async () => {
  if (ready) await teardownMysqlTest();
});

test('IAP 与平台币兑换商品迁移后默认启用', async t => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const db = dbm.getDb();
  const iapProducts = await db.all('SELECT enabled_android, enabled_ios FROM iap_products');
  const exchangeProducts = await db.all('SELECT enabled FROM platform_exchange_products');
  assert.ok(iapProducts.length > 0);
  assert.ok(exchangeProducts.length > 0);
  assert.ok(iapProducts.every(product => Number(product.enabled_android) === 1 && Number(product.enabled_ios) === 1));
  assert.ok(exchangeProducts.every(product => Number(product.enabled) === 1));

  await db.run('UPDATE iap_products SET enabled_android = 0, enabled_ios = 0');
  await db.run('UPDATE platform_exchange_products SET enabled = 0');
  await dbm.migrateIapMysql(db);

  const repairedIapProducts = await db.all('SELECT enabled_android, enabled_ios FROM iap_products');
  const repairedExchangeProducts = await db.all('SELECT enabled FROM platform_exchange_products');
  assert.ok(repairedIapProducts.every(product => Number(product.enabled_android) === 1 && Number(product.enabled_ios) === 1));
  assert.ok(repairedExchangeProducts.every(product => Number(product.enabled) === 1));
});

test('平台扣币并发重放只发放一次铁豆', async t => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const accountId = 'ks_iap_exchange_concurrent';
  await seedAccount(accountId, '0');
  const requestId = crypto.randomUUID();
  const calls = [];
  const service = require('../payment/platform-exchange-service').createPlatformExchangeService({
    identityStore: { requireOpenIdForAccount: async () => 'mysql-test-open-id' },
    client: { pay: async request => { calls.push(request); return { success: true, code: '1', chargeBalance: '90', freeBalance: '0' }; } },
    maxPayAttempts: 1,
    payPriority: 1,
  });
  const input = { accountId, loginType: 'kwai', exchangeSkuId: 'diamond_to_beans_10', clientRequestId: requestId, os: 'android', userIp: '127.0.0.1' };
  const results = await Promise.all(Array.from({ length: 10 }, () => service.exchange(input)));

  assert.equal(new Set(results.map(result => result.exchangeOrderId)).size, 1);
  const db = dbm.getDb();
  const beans = await db.get('SELECT beans FROM wallets WHERE account_id = ?', [accountId]);
  const orders = await db.get('SELECT COUNT(*) AS count FROM platform_exchange_orders WHERE account_id = ?', [accountId]);
  const ledger = await db.get("SELECT COUNT(*) AS count FROM wallet_ledger WHERE account_id = ? AND type = 'platform_exchange_credit'", [accountId]);
  assert.equal(String(beans.beans), '10000');
  assert.equal(Number(orders.count), 1);
  assert.equal(Number(ledger.count), 1);
  assert.equal(new Set(calls.map(call => call.bizNo)).size, 1);
});

test('平台扣币成功后恢复履约保持 BIGINT 精度', async t => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const accountId = 'ks_iap_bigint';
  await seedAccount(accountId, '9007199254740993');
  const service = require('../payment/platform-exchange-service').createPlatformExchangeService({
    identityStore: { requireOpenIdForAccount: async () => 'mysql-test-open-id' },
    client: { pay: async () => ({ success: true, code: '1' }) },
    maxPayAttempts: 1,
    payPriority: 1,
  });
  const input = { accountId, loginType: 'kwai', exchangeSkuId: 'diamond_to_beans_10', clientRequestId: crypto.randomUUID(), os: 'ios', userIp: '127.0.0.1' };
  const result = await service.exchange(input);
  assert.equal(result.status, 'FULFILLED');
  const wallet = await dbm.getDb().get('SELECT beans, total_earned FROM wallets WHERE account_id = ?', [accountId]);
  assert.equal(String(wallet.beans), '9007199254750993');
  assert.equal(String(wallet.total_earned), '10000');
});

test('迁移幂等且旧本地钻石表不存在', async t => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const db = dbm.getDb();
  await dbm.migrateIapMysql(db);
  await dbm.assertIapSchemaIntegrity(db);
  const rows = await db.all(`
    SELECT TABLE_NAME AS table_name FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('diamond_wallets', 'diamond_ledger', 'diamond_exchange_orders', 'diamond_exchange_products')
  `);
  assert.deepEqual(rows, []);
});

test('未完成订单查询按认证账号隔离且只返回可恢复状态', async t => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const ownAccount = 'ks_iap_pending_owner';
  const otherAccount = 'ks_iap_pending_other';
  await seedAccount(ownAccount, '0');
  await seedAccount(otherAccount, '0');
  const service = require('../payment/order-service');
  const ownPending = await service.createOrder({
    accountId: ownAccount, loginType: 'kwai', skuId: 'diamond_30', platform: 'android', clientRequestId: crypto.randomUUID(),
  });
  const ownConfirmed = await service.createOrder({
    accountId: ownAccount, loginType: 'kwai', skuId: 'diamond_30', platform: 'android', clientRequestId: crypto.randomUUID(),
  });
  await dbm.getDb().run("UPDATE iap_orders SET status = 'PAYMENT_CONFIRMED' WHERE order_id = ?", [ownConfirmed.orderId]);
  const ownStale = await service.createOrder({
    accountId: ownAccount, loginType: 'kwai', skuId: 'diamond_30', platform: 'android', clientRequestId: crypto.randomUUID(),
  });
  await dbm.getDb().run("UPDATE iap_orders SET status = 'STALE' WHERE order_id = ?", [ownStale.orderId]);
  const ownReview = await service.createOrder({
    accountId: ownAccount, loginType: 'kwai', skuId: 'diamond_30', platform: 'android', clientRequestId: crypto.randomUUID(),
  });
  await dbm.getDb().run("UPDATE iap_orders SET status = 'REVIEW' WHERE order_id = ?", [ownReview.orderId]);
  const otherPending = await service.createOrder({
    accountId: otherAccount, loginType: 'kwai', skuId: 'diamond_30', platform: 'android', clientRequestId: crypto.randomUUID(),
  });

  const orders = await service.listPendingOrders(ownAccount);
  assert.deepEqual(new Set(orders.map(order => order.orderId)), new Set([ownPending.orderId, ownStale.orderId, ownReview.orderId]));
  assert.deepEqual(new Set(orders.map(order => order.status)), new Set(['PENDING', 'STALE', 'REVIEW']));
  assert.ok(!orders.some(order => order.orderId === ownConfirmed.orderId));
  assert.ok(!orders.some(order => order.orderId === otherPending.orderId));
});

test('并发创建不同订单不突破 PENDING 上限', async t => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const accountId = 'ks_iap_pending_limit';
  await seedAccount(accountId, '0');
  const service = require('../payment/order-service');
  const settled = await Promise.allSettled(Array.from({ length: 10 }, () => service.createOrder({
    accountId,
    loginType: 'kwai',
    skuId: 'diamond_30',
    platform: 'android',
    clientRequestId: crypto.randomUUID(),
  })));
  assert.equal(settled.filter(result => result.status === 'fulfilled').length, 3);
  const row = await dbm.getDb().get(
    "SELECT COUNT(*) AS count FROM iap_orders WHERE account_id = ? AND status = 'PENDING'",
    [accountId],
  );
  assert.equal(Number(row.count), 3);
});

test('游客不能创建充值订单', async t => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const accountId = 'guest_iap_forbidden';
  await seedAccount(accountId, '0', 'guest');
  const service = require('../payment/order-service');
  await assert.rejects(
    service.createOrder({ accountId, loginType: 'guest', skuId: 'diamond_30', platform: 'android', clientRequestId: crypto.randomUUID() }),
    err => err.code === 'GUEST_PAYMENT_FORBIDDEN',
  );
  const saved = await dbm.getDb().get('SELECT COUNT(*) AS count FROM iap_orders WHERE account_id = ?', [accountId]);
  assert.equal(Number(saved.count), 0);
});

function buildNotifyBody (openId, orderId, platformOrderId) {
  const params = {
    open_id: openId,
    app_id: require('../config/kwai-app').getAppId(),
    third_party_trade_no: orderId,
    order_id: platformOrderId,
  };
  params.sign = require('../payment/signature').signGamePayment(params, process.env.DDZ_KWAI_PAY_NOTIFY_KEY);
  return new URLSearchParams(params).toString();
}

test('并发支付回调只确认一次平台入账且不创建本地钻石表', async t => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const openId = 'iap_notify_concurrent_open_id';
  const accountId = require('../identity/kwai-account-id').deriveKwaiAccountId(openId);
  await seedAccount(accountId, '0');
  const order = await require('../payment/order-service').createOrder({
    accountId,
    loginType: 'kwai',
    skuId: 'diamond_30',
    platform: 'android',
    clientRequestId: crypto.randomUUID(),
  });
  const body = buildNotifyBody(openId, order.orderId, 'platform_notify_concurrent_001');
  const results = await Promise.all(Array.from({ length: 10 }, () =>
    require('../payment/notify-handler').handleNotify(body, 'application/x-www-form-urlencoded')));

  assert.ok(results.every(result => result.text === 'success'));
  const db = dbm.getDb();
  const savedOrder = await db.get('SELECT status, platform_order_id, notify_count FROM iap_orders WHERE order_id = ?', [order.orderId]);
  assert.equal(savedOrder.status, 'PAYMENT_CONFIRMED');
  assert.equal(savedOrder.platform_order_id, 'platform_notify_concurrent_001');
  assert.equal(Number(savedOrder.notify_count), 1);
});
