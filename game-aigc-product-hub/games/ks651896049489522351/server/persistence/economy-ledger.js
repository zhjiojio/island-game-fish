// ============================================================
// economy-ledger.js — 经济流水补全
// ------------------------------------------------------------
// 钻石流水（diamond_ledger）：平台币由平台托管，本地只记录业务级
// 变动事件（充值到账 / 兑换消耗），余额观察值尽力而为（可 NULL）。
// 机器人流水（bot_economy_log）：国库铸造/蒸发逐笔记录。
// 幂等：全部走唯一 idempotency_key（INSERT IGNORE），重放安全。
// ============================================================
'use strict';

const { getDb, applySqlFile } = require('./db');
const path = require('path');
const logger = require('../logger');

let initialized = false;

async function ensureColumn (db, table, column, definition) {
  const row = await db.get(`
    SELECT COLUMN_NAME AS column_name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, [table, column]);
  if (!row) await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function initEconomyLedger () {
  if (initialized) return;
  const db = getDb();
  await applySqlFile(db, path.join(__dirname, '..', 'scripts', 'migrations', '20260919_economy_ledger.sql'));
  // 牌局结果结构化列（可重复执行）
  await ensureColumn(db, 'game_matches', 'config_version', 'INT NOT NULL DEFAULT 0');
  await ensureColumn(db, 'game_matches', 'multiplier_breakdown_json', 'TEXT NULL');
  await ensureColumn(db, 'game_match_participants', 'tax_amount', 'BIGINT NULL');
  await ensureColumn(db, 'game_match_participants', 'gross_delta', 'BIGINT NULL');
  await ensureColumn(db, 'game_match_participants', 'net_delta', 'BIGINT NULL');
  await ensureColumn(db, 'game_match_participants', 'balance_after', 'BIGINT NULL');
  await ensureColumn(db, 'game_match_participants', 'room_type', 'VARCHAR(32) NULL');
  await ensureColumn(db, 'game_match_participants', 'win_result', 'VARCHAR(8) NULL');
  await ensureColumn(db, 'game_match_participants', 'entry_fee_beans', 'BIGINT NULL');
  await ensureColumn(db, 'game_match_participants', 'balance_before', 'BIGINT NULL');
  // 机器人资金池钱包：按配置 bot.initial_balance 幂等初始化（已存在不覆盖）
  const { TIER_TYPES, getEffectiveSync } = require('./config-store');
  const initialBalance = getEffectiveSync().effective.bot.initialBalance;
  for (const t of TIER_TYPES) {
    const accountId = `system::bot_treasury::${t}`;
    await db.run(`
      INSERT IGNORE INTO accounts (
        account_id, account_type, login_type, kwai_open_id_hash, device_id,
        first_ip, last_ip, login_count, banned, ban_reason, created_at, last_login_at
      ) VALUES (?, 'system_treasury', 'system', '', '', '', '', 0, 0, '', 0, 0)
    `, [accountId]);
    await db.run(`
      INSERT IGNORE INTO wallets (
        account_id, beans, frozen_beans, total_earned, total_spent, total_won,
        total_lost, daily_login_date, share_reward_date, created_at, updated_at, version
      ) VALUES (?, ?, 0, 0, 0, 0, 0, '', '', 0, 0, 1)
    `, [accountId, initialBalance]);
  }
  initialized = true;
  logger.info(`[economy-ledger] 流水表就绪（diamond_ledger / bot_economy_log / 牌局结算列），机器人资金池初始余额 ${initialBalance}`);
}

/**
 * 钻石流水。direction: 'in'（充值到账）| 'out'（兑换消耗）；delta 带符号。
 * balanceAfter 为平台托管余额观察值，拿不到时传 null（列可空）。
 * dbOrOpts: 事务内传入事务句柄以同事务写入。
 */
async function recordDiamondLedger ({ accountId, direction, delta, source, skuId = null, platform = null, balanceAfter = null, idempotencyKey, meta = null }, dbOrOpts = null) {
  const db = (dbOrOpts && typeof dbOrOpts.run === 'function') ? dbOrOpts : getDb();
  if (!accountId || !Number.isInteger(Number(delta)) || Number(delta) === 0 || !source || !idempotencyKey) {
    throw Object.assign(new Error('diamond ledger invalid args'), { code: 'INVALID_REQUEST' });
  }
  const dir = Number(delta) > 0 ? 'in' : 'out';
  await db.run(`
    INSERT IGNORE INTO diamond_ledger
      (account_id, direction, delta, source, sku_id, platform, balance_after, idempotency_key, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [accountId, dir, Number(delta), source, skuId, platform,
      balanceAfter == null ? null : String(balanceAfter),
      String(idempotencyKey).slice(0, 128), Date.now()]);
}

/**
 * 机器人资金池铸造/蒸发流水。delta>0 → mint（池流入），delta<0 → evaporate（池流出）。
 * 需在事务内调用（传入事务 db）。
 */
async function recordBotEconomyLog (db, { botScope, delta, balanceBefore, balanceAfter, roomId = null, roundNo = null, matchId = null, source = 'settlement' }) {
  const d = Number(delta);
  if (!botScope || !Number.isInteger(d) || d === 0) return;
  await db.run(`
    INSERT INTO bot_economy_log
      (bot_scope, direction, amount, balance_before, balance_after, room_id, round_no, match_id, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [botScope, d > 0 ? 'mint' : 'evaporate', Math.abs(d),
      Number(balanceBefore) || 0, Number(balanceAfter) || 0,
      roomId, roundNo, matchId, source, Date.now()]);
}

module.exports = { initEconomyLedger, recordDiamondLedger, recordBotEconomyLog };
