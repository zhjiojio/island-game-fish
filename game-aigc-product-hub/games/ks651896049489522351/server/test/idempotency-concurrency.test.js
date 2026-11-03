// 幂等写入的并发正确性回归测试。
//
// 背景：钱包写入曾使用「先 SELECT 查幂等键、再 INSERT」的 check-then-act 写法。
// 两个并发事务会同时查到「不存在」，于是双双 INSERT，后者撞上
// wallet_ledger.idempotency_key 唯一约束抛异常。
// 真实触发场景：三名玩家同时开局，各自触发房间冻结。
//
// 为什么必须用 MySQL 跑：
//   用真实的 MySQL 连接池并发复现竞态（历史：SQLite 串行事务队列下测不出来）。
//   因此本文件在没有可用 MySQL 时整体跳过，而不是伪造成通过。
//
// 运行：DDZ_MYSQL_USER=root DDZ_MYSQL_DATABASE=ddz node --test test/idempotency-concurrency.test.js
const test = require('node:test');
const assert = require('node:assert');

const { setupMysqlTest, teardownMysqlTest } = require('./helpers/mysql-test');

const { getDb } = require('../persistence/db');
const walletStore = require('../persistence/wallet-store');

const ACCOUNT = `idem_concurrency_${process.pid}`;
const WALLET_INIT_PREFIX = `wallet_init_${process.pid}_`;
const CONCURRENCY = 8;

let mysqlReady = false;

test.before(async () => {
  try {
    await setupMysqlTest();
    mysqlReady = true;
  } catch (e) {
    console.log(`[SKIP] MySQL 不可用，跳过并发幂等测试: ${e.message}`);
  }
});

test.after(async () => {
  if (!mysqlReady) return;
  try {
    const db = getDb();
    await db.run('DELETE FROM wallet_ledger WHERE account_id = ?', [ACCOUNT]);
    await db.run('DELETE FROM wallets WHERE account_id = ?', [ACCOUNT]);
    await db.run('DELETE FROM wallet_ledger WHERE account_id LIKE ?', [`${WALLET_INIT_PREFIX}%`]);
    await db.run('DELETE FROM wallets WHERE account_id LIKE ?', [`${WALLET_INIT_PREFIX}%`]);
  } finally {
    await teardownMysqlTest();
  }
});

async function reseed (beans) {
  const db = getDb();
  await db.run('DELETE FROM wallet_ledger WHERE account_id = ?', [ACCOUNT]);
  await db.run('DELETE FROM wallets WHERE account_id = ?', [ACCOUNT]);
  await walletStore.getOrCreateWallet(ACCOUNT, { initialBeans: beans });
}

test('并发冻结同一幂等键：恰好生效一次，且不抛异常', async (t) => {
  if (!mysqlReady) return t.skip('MySQL 不可用');
  await reseed(10000);

  const key = `room_freeze:concurrency_test_${process.pid}:1:${ACCOUNT}`;
  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, () =>
      walletStore.freezeWalletBeans(ACCOUNT, 800, {
        idempotencyKey: key, roomId: 'concurrency_test', roundNo: 1,
      }))
  );

  const rejected = results.filter(r => r.status === 'rejected');
  assert.strictEqual(rejected.length, 0,
    `不应有请求抛异常，首个异常: ${rejected[0] && rejected[0].reason.message}`);

  const rows = await getDb().all(
    'SELECT * FROM wallet_ledger WHERE idempotency_key = ?', [key]);
  assert.strictEqual(rows.length, 1, '同一幂等键只能产生一条流水');

  const wallet = await walletStore.getWallet(ACCOUNT);
  assert.strictEqual(Number(wallet.frozenBeans), 800, '冻结额度不得被重复累加');

  // 恰好一个请求真正执行写入，其余都应识别为幂等命中
  const hits = results.filter(r => r.status === 'fulfilled' && r.value.idempotent).length;
  assert.strictEqual(hits, CONCURRENCY - 1, '除首个写入外，其余都应判为幂等命中');
});

test('并发扣款同一幂等键：余额只被扣一次', async (t) => {
  if (!mysqlReady) return t.skip('MySQL 不可用');
  await reseed(10000);

  const key = `room_entry_fee:concurrency_test_${process.pid}:${ACCOUNT}`;
  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENCY }, () =>
      walletStore.applyWalletDelta(ACCOUNT, -150, 'room_entry_fee', { idempotencyKey: key }))
  );

  const rejected = results.filter(r => r.status === 'rejected');
  assert.strictEqual(rejected.length, 0,
    `不应有请求抛异常，首个异常: ${rejected[0] && rejected[0].reason.message}`);

  const wallet = await walletStore.getWallet(ACCOUNT);
  // 关键断言：扣一次是 9850，扣两次就是 9700 —— 这就是资损
  assert.strictEqual(Number(wallet.beans), 9850, '余额只能被扣一次');

  const rows = await getDb().all(
    'SELECT * FROM wallet_ledger WHERE idempotency_key = ?', [key]);
  assert.strictEqual(rows.length, 1, '同一幂等键只能产生一条流水');
});

test('不同幂等键并发：各自独立生效，不互相吞没', async (t) => {
  if (!mysqlReady) return t.skip('MySQL 不可用');
  await reseed(10000);

  // 与上面相反的方向：确认修复没有把「本该各自生效」的写入误判成幂等命中
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) =>
      walletStore.applyWalletDelta(ACCOUNT, -100, 'room_entry_fee', {
        idempotencyKey: `distinct_key_${process.pid}_${i}`,
      }))
  );
  assert.strictEqual(results.filter(r => r.status === 'rejected').length, 0);

  const wallet = await walletStore.getWallet(ACCOUNT);
  assert.strictEqual(Number(wallet.beans), 10000 - 500, '5 笔不同幂等键应全部生效');
});

test('多个新账号并发初始化钱包：全部成功且新手流水只写一次', async (t) => {
  if (!mysqlReady) return t.skip('MySQL 不可用');
  const db = getDb();
  await db.run('DELETE FROM wallet_ledger WHERE account_id LIKE ?', [`${WALLET_INIT_PREFIX}%`]);
  await db.run('DELETE FROM wallets WHERE account_id LIKE ?', [`${WALLET_INIT_PREFIX}%`]);

  const accounts = Array.from({ length: CONCURRENCY }, (_, i) => `${WALLET_INIT_PREFIX}${i}`);
  const results = await Promise.allSettled(
    accounts.map(accountId => walletStore.getOrCreateWallet(accountId, {
      initialBeans: 20000,
      todayKey: '2026-08-28',
    }))
  );

  const rejected = results.filter(r => r.status === 'rejected');
  assert.strictEqual(rejected.length, 0,
    `并发初始化钱包不应抛异常，首个异常: ${rejected[0] && rejected[0].reason.message}`);

  const wallets = await db.all(
    'SELECT account_id, beans FROM wallets WHERE account_id LIKE ?',
    [`${WALLET_INIT_PREFIX}%`]
  );
  assert.strictEqual(wallets.length, CONCURRENCY, '每个新账号都应创建钱包');
  assert.ok(wallets.every(row => Number(row.beans) === 20000), '新账号初始铁豆应一致');

  const ledgers = await db.all(
    "SELECT account_id FROM wallet_ledger WHERE account_id LIKE ? AND type = 'new_user_grant'",
    [`${WALLET_INIT_PREFIX}%`]
  );
  assert.strictEqual(ledgers.length, CONCURRENCY, '每个新账号只应有一条新手赠送流水');
});

// 新账号首次 bootstrap 的钱包并发回归。
//
// 线上事故：客户端首次启动并发请求「每日登录 / 新手礼包 / 广告次数」三条路径，
// 三条都会对同一张还不存在的 wallets 行发起建钱包事务。
//
// 旧实现有两个叠加缺陷：
//   1. getDailyRewardStatus 自称「只读、不产生任何写入」，实现里却在
//      getOrCreateWallet(id)——没带 initialBeans，等于按 0 豆建行。
//      它一旦抢在 getOrCreateWallet(20000) 之前插入，新号就永久只有 0 豆，
//      而且因为行已存在，新手赠送流水再也不会补发（没有第二个补发入口）。
//   2. createWallet 用 INSERT IGNORE 建行，撞唯一键时只持 S 锁，
//      随后的 SELECT ... FOR UPDATE 要 X 锁，并发时容易 ER_LOCK_DEADLOCK 1213。
//
// 用例 1 打缺陷 1：确定性复现（旧实现 20/20 丢豆，修复后 0/20）。
// 用例 2 打缺陷 2：并发多条路径不许抛异常，且各奖励只记一次。
test('只读的奖励状态查询不得抢建 0 豆钱包，新手赠送不能被吞', async (t) => {
  if (!mysqlReady) return t.skip('MySQL 不可用');
  const db = getDb();
  const today = '2026-10-20';

  // 多轮跑：缺陷是竞态，单轮可能靠时序侥幸躲过
  for (let round = 0; round < 10; round += 1) {
    const accountId = `readonly_race_${process.pid}_${round}`;
    await db.run('DELETE FROM wallet_ledger WHERE account_id = ?', [accountId]);
    await db.run('DELETE FROM reward_claims WHERE account_id = ?', [accountId]);
    await db.run('DELETE FROM wallets WHERE account_id = ?', [accountId]);

    // 「查广告次数」与「建钱包」同时发生，顺序由调度器决定
    await Promise.allSettled([
      walletStore.getDailyRewardStatus(accountId, 'ad_reward', today),
      walletStore.getOrCreateWallet(accountId, { initialBeans: 20000, todayKey: today }),
    ]);

    const wallet = await walletStore.getWallet(accountId);
    assert.strictEqual(Number(wallet.beans), 20000,
      `第 ${round} 轮：新号必须拿到 20000 新手赠送，实际 ${wallet.beans}（只读查询抢先按 0 豆建了行）`);

    const grants = await db.all(
      "SELECT tx_id FROM wallet_ledger WHERE account_id = ? AND type = 'new_user_grant'",
      [accountId]
    );
    assert.strictEqual(grants.length, 1,
      `第 ${round} 轮：新手赠送流水必须恰好一条，实际 ${grants.length} 条`);

    await db.run('DELETE FROM wallet_ledger WHERE account_id = ?', [accountId]);
    await db.run('DELETE FROM wallets WHERE account_id = ?', [accountId]);
  }
});

// 调用序对齐真实代码：index.js 的每个奖励包装器都是先 getOrCreateWallet
// 再进奖励事务，这里照抄，不直接调 store 层奖励函数（那会绕过建钱包步骤）。
test('新账号并发 bootstrap：不死锁，且各奖励只记一次', async (t) => {
  if (!mysqlReady) return t.skip('MySQL 不可用');
  const db = getDb();
  const accountId = `bootstrap_race_${process.pid}`;
  await db.run('DELETE FROM wallet_ledger WHERE account_id = ?', [accountId]);
  await db.run('DELETE FROM reward_claims WHERE account_id = ?', [accountId]);
  await db.run('DELETE FROM wallets WHERE account_id = ?', [accountId]);

  const today = '2026-10-20';
  const create = () => walletStore.getOrCreateWallet(accountId, { initialBeans: 20000, todayKey: today });

  const results = await Promise.allSettled([
    (async () => { await create(); return walletStore.claimDailyLoginIfNeeded(accountId, 1000, today); })(),
    (async () => { await create(); return walletStore.getDailyRewardStatus(accountId, 'ad_reward', today); })(),
    (async () => { await create(); return walletStore.claimShareRewardIfNeeded(accountId, 500, today); })(),
    (async () => { await create(); return walletStore.claimDailyLoginIfNeeded(accountId, 1000, today); })(),
    create(),
  ]);

  const rejected = results.filter(r => r.status === 'rejected');
  assert.strictEqual(rejected.length, 0,
    `并发 bootstrap 不应有任何一条抛异常（死锁会在这里暴露），首个异常: ${rejected[0] && rejected[0].reason.message}`);

  const grants = await db.all(
    "SELECT tx_id FROM wallet_ledger WHERE account_id = ? AND type = 'new_user_grant'",
    [accountId]
  );
  assert.strictEqual(grants.length, 1, '新手赠送流水只能有一条，重复发放就是资损');

  const wallet = await walletStore.getWallet(accountId);
  assert.strictEqual(Number(wallet.beans), 20500,
    '新号应为 20000 新手赠送 + 500 分享；每日登录在建档时已被 todayKey 预占位，不得再发一次');

  // 建钱包时 daily_login_date 已置为当天，因此不该产生独立的 daily_login 流水。
  // 这里断言的是「不许出现第二条」——真要出现两条就是重复发豆。
  const logins = await db.all(
    "SELECT tx_id FROM wallet_ledger WHERE account_id = ? AND type = 'daily_login'",
    [accountId]
  );
  assert.ok(logins.length <= 1, `每日登录奖励最多一条，实际 ${logins.length} 条`);

  await db.run('DELETE FROM wallet_ledger WHERE account_id = ?', [accountId]);
  await db.run('DELETE FROM reward_claims WHERE account_id = ?', [accountId]);
  await db.run('DELETE FROM wallets WHERE account_id = ?', [accountId]);
});
