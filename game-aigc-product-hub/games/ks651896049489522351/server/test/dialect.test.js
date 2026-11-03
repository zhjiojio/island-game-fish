// MySQL upsert 方言语义回归测试。
// 约定：业务代码统一写 MySQL 风格 SQL（ON DUPLICATE KEY UPDATE / INSERT IGNORE /
// GREATEST / VALUES(col)），本文件直接在 MySQL 上锁定这些语法的运行语义。
// 运行：DDZ_MYSQL_PASSWORD=... node --test test/dialect.test.js（独立测试库，用完即 DROP）
const test = require('node:test');
const assert = require('node:assert');

const { setupMysqlTest, teardownMysqlTest } = require('./helpers/mysql-test');

const dbm = require('../persistence/db');

let ready = false;

test.before(async () => {
  try { await setupMysqlTest(); ready = true; }
  catch (e) { console.log('[SKIP] MySQL 测试环境不可用:', e.message); }
});
test.after(async () => { if (ready) await teardownMysqlTest(); });

async function createStatsTable () {
  await dbm.getDb().run(`CREATE TABLE IF NOT EXISTS t_stats (
    account_id VARCHAR(128) PRIMARY KEY,
    games INT NOT NULL DEFAULT 0,
    streak INT NOT NULL DEFAULT 0,
    max_streak INT NOT NULL DEFAULT 0,
    updated_at BIGINT)`);
}

test('ON DUPLICATE KEY UPDATE + GREATEST 的 upsert 语义正确', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const db = dbm.getDb();
  await createStatsTable();

  // SET 列顺序：max_streak 必须在 streak 之前——MySQL 的 UPDATE SET 从左到右
  // 顺序执行，放后面会读到已更新的 streak（连胜多记 1）；顺序正确时与
  // 「SET 全部基于旧行值」的标准语义一致。
  const sql = `INSERT INTO t_stats (account_id, games, streak, max_streak, updated_at)
    VALUES (?, 1, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      games = games + 1,
      max_streak = GREATEST(max_streak, CASE WHEN ? = 1 THEN streak + 1 ELSE 0 END),
      streak = CASE WHEN ? = 1 THEN streak + 1 ELSE 0 END,
      updated_at = ?`;

  // 两连胜后一负：games=3、streak 清零、max_streak 停在 2
  await db.run(sql, ['acct', 1, 1, 1, 1, 1, Date.now()]);
  await db.run(sql, ['acct', 2, 2, 2, 1, 1, Date.now()]);
  await db.run(sql, ['acct', 0, 0, 0, 0, 0, Date.now()]);
  const row = await db.get('SELECT games, streak, max_streak FROM t_stats WHERE account_id = ?', ['acct']);
  assert.strictEqual(row.games, 3, '总对局应累加到 3');
  assert.strictEqual(row.streak, 0, '输局后连胜应清零');
  assert.strictEqual(row.max_streak, 2, '最高连胜应保留历史峰值 2');
});

test('INSERT IGNORE 冲突行不报错不覆盖', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const db = dbm.getDb();
  await db.run(`CREATE TABLE IF NOT EXISTS t_ig (k VARCHAR(64) PRIMARY KEY, v INT NOT NULL)`);
  await db.run('INSERT IGNORE INTO t_ig (k, v) VALUES (?, ?)', ['x', 1]);
  // 第二次插入同主键：静默忽略（affectedRows=0），值保持首条
  const result = await db.run('INSERT IGNORE INTO t_ig (k, v) VALUES (?, ?)', ['x', 99]);
  const row = await db.get('SELECT v FROM t_ig WHERE k = ?', ['x']);
  assert.strictEqual(row.v, 1, 'INSERT IGNORE 冲突时不应覆盖已有行');
  assert.strictEqual(Number(result.affectedRows), 0, '冲突插入的 affectedRows 应为 0');
});

test('ON DUPLICATE 段内 VALUES(col) 引用取本次插入值', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const db = dbm.getDb();
  await db.run(`CREATE TABLE IF NOT EXISTS t_val (k VARCHAR(64) PRIMARY KEY, v INT NOT NULL)`);
  await db.run('INSERT INTO t_val (k, v) VALUES (?, ?)', ['y', 1]);
  // 冲突时用本次插入值覆盖
  await db.run('INSERT INTO t_val (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', ['y', 42]);
  const row = await db.get('SELECT v FROM t_val WHERE k = ?', ['y']);
  assert.strictEqual(row.v, 42, 'VALUES(col) 引用应取本次插入值');
});
