// MySQL 下验证购买事务、钱包行锁和权益唯一键的组合正确性（独立测试库）。
const test = require('node:test');
const assert = require('node:assert');

const { setupMysqlTest, teardownMysqlTest } = require('./helpers/mysql-test');

const { getDb } = require('../persistence/db');
const walletStore = require('../persistence/wallet-store');
const entitlementStore = require('../persistence/entitlement-store');
const { purchaseSku } = require('../trade/purchase');

const ACCOUNT = `trade_mysql_${process.pid}`;
const SKU = 'voice_pack:tiezi';
const CONCURRENCY = 8;
let mysqlReady = false;

test.before(async () => {
  try {
    await setupMysqlTest();
    mysqlReady = true;
  } catch (err) {
    console.log(`[SKIP] MySQL 交易环境不可用: ${err.message}`);
  }
});

test.after(async () => {
  if (mysqlReady) await teardownMysqlTest();
});

test('MySQL 同账号同 SKU 并发购买只扣一次并只发一份权益', async (t) => {
  if (!mysqlReady) return t.skip('MySQL 交易环境不可用');

  await walletStore.getOrCreateWallet(ACCOUNT, {
    initialBeans: 500,
    todayKey: '2026-08-14',
  });

  const results = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => purchaseSku({
      accountId: ACCOUNT,
      sku: SKU,
    }))
  );

  assert.ok(results.every(result => result.ok && result.owned));
  assert.strictEqual(results.filter(result => result.charged).length, 1);
  assert.strictEqual((await walletStore.getWallet(ACCOUNT)).beans, 400);

  const ledger = await getDb().all(
    "SELECT * FROM wallet_ledger WHERE account_id = ? AND type = 'sku_purchase'",
    [ACCOUNT]
  );
  assert.strictEqual(ledger.length, 1);
  assert.strictEqual(Number(ledger[0].amount), -100);

  const entitlements = await entitlementStore.listEntitlements(ACCOUNT);
  assert.strictEqual(entitlements.filter(item => item.sku === SKU).length, 1);
});
