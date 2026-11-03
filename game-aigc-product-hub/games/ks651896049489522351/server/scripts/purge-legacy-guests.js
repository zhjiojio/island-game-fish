/**
 * 作废历史遗留的客户端自生成身份（`guest_h5_*`）。
 *
 * 【为什么是作废而不是迁移】
 * 这批 accountId 由客户端在 localStorage 里自行生成（`guest_h5_` + 时间戳），
 * 且旧服务端直接采信客户端上报值。也就是说：
 *   · 任何人改一行 localStorage 就能取得这些身份，余额归属本身不可信；
 *   · 新体系下 accountId = HMAC(服务端密钥, deviceId)，与旧值无任何对应关系，
 *     想迁移就必须凭「某个 localStorage 值曾出现过」来认定所有权，
 *     而这恰恰是本次安全改造要消灭的前提。
 * 因此正确处理是整体作废，而非想办法保住余额。
 *
 * 用法：
 *   # 先看会删什么（默认就是 dry-run，不会改数据）
 *   node scripts/purge-legacy-guests.js
 *
 *   # 确认无误后真正执行
 *   node scripts/purge-legacy-guests.js --confirm
 *
 *   # MySQL 环境
 *   DDZ_MYSQL_HOST=... node scripts/purge-legacy-guests.js --confirm
 *
 * 生产环境请勿直接跑本脚本，改由 DBA 执行 docs 中的等价 SQL。
 */
const { getDb, initDb, closeDb, transaction } = require('../persistence/db');

// 旧客户端生成的身份前缀。新身份分别为 `guest_<hmac>` 与 `ks_<hmac>`，
// 都不含 `h5_` 段，所以该模式不会误伤新数据。
const LEGACY_PREFIX = 'guest_h5_';
// SQL LIKE 中 `_` 是单字符通配符，必须转义，否则会匹配到 `guestXh5Y...` 之类。
const LEGACY_LIKE = 'guest\\_h5\\_%';

const CONFIRMED = process.argv.includes('--confirm');

async function countRows (db, sql, params = []) {
  const row = await db.get(sql, params);
  return Number((row && (row.n ?? row.N)) || 0);
}

async function survey (db) {
  return {
    wallets: await countRows(db,
      `SELECT COUNT(*) AS n FROM wallets WHERE account_id LIKE '${LEGACY_LIKE}'`),
    ledger: await countRows(db,
      `SELECT COUNT(*) AS n FROM wallet_ledger WHERE account_id LIKE '${LEGACY_LIKE}'`),
    rewards: await countRows(db,
      `SELECT COUNT(*) AS n FROM reward_claims WHERE account_id LIKE '${LEGACY_LIKE}'`),
    accounts: await countRows(db,
      `SELECT COUNT(*) AS n FROM accounts WHERE account_id LIKE '${LEGACY_LIKE}'`),
    events: await countRows(db,
      `SELECT COUNT(*) AS n FROM game_match_events WHERE actor_account_id LIKE '${LEGACY_LIKE}'`),
    matches: await countRows(db,
      `SELECT COUNT(*) AS n FROM game_matches WHERE account_ids_json LIKE '%${LEGACY_PREFIX}%'`),
  };
}

async function main () {
  await initDb();
  const db = getDb();
  console.log(`[清理] 目标库: ${db.label}`);

  const before = await survey(db);
  console.log('[清理] 待处理的遗留记录:');
  for (const [k, v] of Object.entries(before)) console.log(`  ${k.padEnd(9)} ${v}`);

  const total = Object.values(before).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log('[清理] 没有遗留数据，无需处理');
    return;
  }

  if (!CONFIRMED) {
    console.log('\n[清理] 这是预演（dry-run），未改动任何数据');
    console.log('[清理] 确认无误后追加 --confirm 参数执行');
    return;
  }

  // 单事务内完成，避免删到一半失败留下「钱包没了但流水还在」的孤儿数据。
  // 删除顺序遵循外键依赖：先子表（ledger 引用 wallets.account_id），再主表。
  await transaction(async () => {
    await db.run(`DELETE FROM game_match_events WHERE actor_account_id LIKE '${LEGACY_LIKE}'`);
    await db.run(`DELETE FROM game_matches WHERE account_ids_json LIKE '%${LEGACY_PREFIX}%'`);
    await db.run(`DELETE FROM reward_claims WHERE account_id LIKE '${LEGACY_LIKE}'`);
    await db.run(`DELETE FROM wallet_ledger WHERE account_id LIKE '${LEGACY_LIKE}'`);
    await db.run(`DELETE FROM accounts WHERE account_id LIKE '${LEGACY_LIKE}'`);
    await db.run(`DELETE FROM wallets WHERE account_id LIKE '${LEGACY_LIKE}'`);
  });

  const after = await survey(db);
  const remaining = Object.values(after).reduce((a, b) => a + b, 0);
  console.log('\n[清理] 执行完成，剩余遗留记录:');
  for (const [k, v] of Object.entries(after)) console.log(`  ${k.padEnd(9)} ${v}`);

  if (remaining > 0) {
    throw new Error(`仍有 ${remaining} 条遗留记录未清除，请检查`);
  }
  console.log('[清理] 全部遗留身份已作废');
}

main()
  .catch(err => {
    console.error('[清理] 失败:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => { await closeDb(); });
