// 事务隔离性回归测试。覆盖曾导致「B 上报 committed 但写入被 A 回滚吞掉」的资损级缺陷。
// 运行：DDZ_MYSQL_PASSWORD=... node --test test/*.test.js（独立测试库，用完即 DROP）
const test = require('node:test');
const assert = require('node:assert');

const { setupMysqlTest, teardownMysqlTest } = require('./helpers/mysql-test');

const { getDb, transaction } = require('../persistence/db');

const ACCOUNT = 'tx_test_account';

let ready = false;

async function seed (beans) {
  await getDb().run('DELETE FROM wallet_ledger WHERE account_id = ?', [ACCOUNT]);
  await getDb().run('DELETE FROM wallets WHERE account_id = ?', [ACCOUNT]);
  await getDb().run(
    `INSERT INTO wallets (account_id, beans, frozen_beans, total_earned, total_spent,
     total_won, total_lost, daily_login_date, share_reward_date, created_at, updated_at, version)
     VALUES (?, ?, 0, 0, 0, 0, 0, '', '', 0, 0, 1)`, [ACCOUNT, beans]);
}

async function beans () {
  const row = await getDb().get('SELECT beans FROM wallets WHERE account_id = ?', [ACCOUNT]);
  return Number(row.beans);
}

test.before(async () => {
  try { await setupMysqlTest(); ready = true; }
  catch (e) { console.log('[SKIP] MySQL 测试环境不可用:', e.message); }
});
test.after(async () => { if (ready) await teardownMysqlTest(); });

test('并发事务相互隔离：A 回滚不得吞掉 B 已提交的写入', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await seed(1000);

  const failing = transaction(async () => {
    await getDb().run('UPDATE wallets SET beans = 1 WHERE account_id = ?', [ACCOUNT]);
    await new Promise(r => setTimeout(r, 30));
    throw new Error('intentional rollback');
  }).catch(() => 'rolled back');

  // 让 B 落在 A 的事务窗口内，复现原缺陷的时序
  await new Promise(r => setTimeout(r, 10));
  const succeeding = transaction(async () => {
    await getDb().run('UPDATE wallets SET beans = 777 WHERE account_id = ?', [ACCOUNT]);
    return 'committed';
  });

  assert.strictEqual(await failing, 'rolled back');
  assert.strictEqual(await succeeding, 'committed');
  assert.strictEqual(await beans(), 777, 'B 上报提交，落库就必须是 777');
});

test('同一异步上下文的嵌套事务复用外层事务（不死锁、不重复提交）', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await seed(1000);
  const ret = await transaction(async () => {
    await getDb().run('UPDATE wallets SET beans = beans + 1 WHERE account_id = ?', [ACCOUNT]);
    return transaction(async () => {
      await getDb().run('UPDATE wallets SET beans = beans + 1 WHERE account_id = ?', [ACCOUNT]);
      return 'nested ok';
    });
  });
  assert.strictEqual(ret, 'nested ok');
  assert.strictEqual(await beans(), 1002);
});

test('50 个并发事务累加不丢写', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await seed(0);
  await Promise.all(Array.from({ length: 50 }, () => transaction(async () => {
    await getDb().run('UPDATE wallets SET beans = beans + 10 WHERE account_id = ?', [ACCOUNT]);
  })));
  assert.strictEqual(await beans(), 500, '50 × 10 必须全部落库');
});

test('队列中某个事务失败后，后续事务仍能正常执行', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await seed(100);
  const results = await Promise.allSettled([
    transaction(async () => { throw new Error('boom'); }),
    transaction(async () => {
      await getDb().run('UPDATE wallets SET beans = beans + 5 WHERE account_id = ?', [ACCOUNT]);
      return 'ok';
    }),
  ]);
  assert.strictEqual(results[0].status, 'rejected');
  assert.strictEqual(results[1].status, 'fulfilled');
  assert.strictEqual(await beans(), 105, '失败事务不得卡死队列');
});
