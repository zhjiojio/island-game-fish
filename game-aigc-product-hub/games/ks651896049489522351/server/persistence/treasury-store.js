const crypto = require('crypto');
const { getDb, retryableTransaction, jsonStringify } = require('./db');
const logger = require('../logger');

const TREASURY_PREFIX = 'system::bot_treasury::';

function requireId (value, name) {
  const id = String(value || '').trim();
  if (!id) throw new Error(`treasury-store: 缺少 ${name}`);
  return id;
}

function requireTreasuryAccountId (accountId) {
  const id = requireId(accountId, 'treasuryAccountId');
  if (!id.startsWith(TREASURY_PREFIX)) throw new Error('treasury-store: 非法机器人资金池账号');
  return id;
}

function safeInteger (value, name, minimum = Number.MIN_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < minimum) throw new Error(`treasury-store: ${name} 非法`);
  return n;
}

function rowToReservation (row) {
  if (!row) return null;
  return {
    reservationId: row.reservation_id,
    matchRequestGroupId: row.match_request_group_id,
    matchId: row.match_id || null,
    roomId: row.room_id,
    roomType: row.room_type,
    treasuryAccountId: row.treasury_account_id,
    reservedExposure: Number(row.reserved_exposure || 0),
    actualTreasuryDelta: row.actual_treasury_delta == null ? null : Number(row.actual_treasury_delta),
    status: row.status,
    createdAt: Number(row.created_at || 0),
    activatedAt: row.activated_at == null ? null : Number(row.activated_at),
    releasedAt: row.released_at == null ? null : Number(row.released_at),
    settledAt: row.settled_at == null ? null : Number(row.settled_at),
    updatedAt: Number(row.updated_at || 0),
  };
}

function rowToWallet (row) {
  if (!row) return null;
  const beans = Number(row.beans || 0);
  const frozenBeans = Number(row.frozen_beans || 0);
  return {
    accountId: row.account_id,
    beans,
    frozenBeans,
    availableBeans: Math.max(0, beans - frozenBeans),
    version: Number(row.version || 1),
  };
}

async function getReservation (reservationId) {
  const row = await getDb().get(
    'SELECT * FROM bot_treasury_reservations WHERE reservation_id = ?', [reservationId]);
  return rowToReservation(row);
}

async function getReservationByGroup (matchRequestGroupId) {
  const row = await getDb().get(
    'SELECT * FROM bot_treasury_reservations WHERE match_request_group_id = ?',
    [matchRequestGroupId]
  );
  return rowToReservation(row);
}

async function getTreasuryWallet (treasuryAccountId) {
  const id = requireTreasuryAccountId(treasuryAccountId);
  const row = await getDb().get(`
    SELECT w.*
    FROM wallets w
    INNER JOIN accounts a ON a.account_id = w.account_id
    WHERE w.account_id = ? AND a.account_type = 'system_treasury'
  `, [id]);
  return rowToWallet(row);
}

async function getTreasuryForUpdate (database, treasuryAccountId) {
  return database.get(`
    SELECT w.*
    FROM wallets w
    INNER JOIN accounts a ON a.account_id = w.account_id
    WHERE w.account_id = ? AND a.account_type = 'system_treasury' FOR UPDATE
  `, [treasuryAccountId]);
}

async function getReservationForUpdate (database, reservationId) {
  return database.get(
    'SELECT * FROM bot_treasury_reservations WHERE reservation_id = ? FOR UPDATE',
    [reservationId]
  );
}

async function insertLedger (database, options) {
  await database.run(`
    INSERT INTO wallet_ledger (
      tx_id, account_id, type, amount, balance_before, balance_after,
      room_id, round_no, match_id, idempotency_key, meta_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    `tx_${crypto.randomUUID()}`,
    options.accountId,
    options.type,
    options.amount,
    options.balanceBefore,
    options.balanceAfter,
    options.roomId || null,
    Number.isInteger(options.roundNo) ? options.roundNo : null,
    options.matchId || null,
    options.idempotencyKey,
    jsonStringify(options.meta || {}),
    options.now,
  ]);
}

async function reserveTreasuryExposure (options = {}) {
  const treasuryAccountId = requireTreasuryAccountId(options.treasuryAccountId);
  const matchRequestGroupId = requireId(options.matchRequestGroupId, 'matchRequestGroupId');
  const roomId = requireId(options.roomId, 'roomId');
  const roomType = requireId(options.roomType, 'roomType');
  const reservationId = String(options.reservationId || `btr_${crypto.randomUUID()}`);
  const requiredExposure = safeInteger(options.requiredExposure, 'requiredExposure', 0);
  const minReserve = safeInteger(options.minReserve || 0, 'minReserve', 0);

  return retryableTransaction(async () => {
    const database = getDb();
    const treasury = await getTreasuryForUpdate(database, treasuryAccountId);
    if (!treasury) throw new Error(`treasury_not_initialized:${treasuryAccountId}`);

    const existingRow = await database.get(
      'SELECT * FROM bot_treasury_reservations WHERE match_request_group_id = ? FOR UPDATE',
      [matchRequestGroupId]
    );
    if (existingRow) return { ok: true, reservation: rowToReservation(existingRow), idempotent: true };

    const available = Number(treasury.beans || 0) - Number(treasury.frozen_beans || 0);
    if (available < requiredExposure + minReserve) {
      return { ok: false, reason: 'insufficient_treasury', available, requiredExposure, minReserve };
    }

    const now = Date.now();
    await database.run(`
      INSERT INTO bot_treasury_reservations (
        reservation_id, match_request_group_id, match_id, room_id, room_type,
        treasury_account_id, reserved_exposure, actual_treasury_delta, status,
        created_at, activated_at, released_at, settled_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, ?, NULL, 'reserved', ?, NULL, NULL, NULL, ?)
    `, [reservationId, matchRequestGroupId, roomId, roomType, treasuryAccountId, requiredExposure, now, now]);
    await database.run(`
      UPDATE wallets
      SET frozen_beans = frozen_beans + ?, updated_at = ?, version = version + 1
      WHERE account_id = ?
    `, [requiredExposure, now, treasuryAccountId]);
    await insertLedger(database, {
      accountId: treasuryAccountId,
      type: 'bot_exposure_reserve',
      amount: 0,
      balanceBefore: Number(treasury.beans || 0),
      balanceAfter: Number(treasury.beans || 0),
      roomId,
      idempotencyKey: `bot_exposure_reserve:${matchRequestGroupId}`,
      meta: { reservationId, requiredExposure, frozenBefore: Number(treasury.frozen_beans || 0), frozenAfter: Number(treasury.frozen_beans || 0) + requiredExposure },
      now,
    });

    return { ok: true, reservation: await getReservation(reservationId), idempotent: false };
  });
}

async function activateTreasuryReservation (reservationId, matchId) {
  const id = requireId(reservationId, 'reservationId');
  const targetMatchId = requireId(matchId, 'matchId');
  return retryableTransaction(async () => {
    const database = getDb();
    const row = await getReservationForUpdate(database, id);
    if (!row) throw new Error(`treasury_reservation_not_found:${id}`);
    if (row.status === 'active' || row.status === 'settled') {
      if (row.match_id && row.match_id !== targetMatchId) throw new Error('treasury_match_id_conflict');
      return { reservation: rowToReservation(row), idempotent: true };
    }
    if (row.status !== 'reserved') throw new Error(`treasury_invalid_transition:${row.status}->active`);
    const now = Date.now();
    await database.run(`
      UPDATE bot_treasury_reservations
      SET status = 'active', match_id = ?, activated_at = ?, updated_at = ?
      WHERE reservation_id = ? AND status = 'reserved'
    `, [targetMatchId, now, now, id]);
    return { reservation: await getReservation(id), idempotent: false };
  });
}

async function releaseTreasuryExposure (reservationId) {
  const id = requireId(reservationId, 'reservationId');
  return retryableTransaction(async () => {
    const database = getDb();
    const row = await getReservationForUpdate(database, id);
    if (!row) throw new Error(`treasury_reservation_not_found:${id}`);
    if (row.status === 'released') return { reservation: rowToReservation(row), idempotent: true };
    if (row.status === 'settled') throw new Error('treasury_invalid_transition:settled->released');
    if (row.status !== 'reserved' && row.status !== 'active') {
      throw new Error(`treasury_invalid_transition:${row.status}->released`);
    }

    const treasury = await getTreasuryForUpdate(database, row.treasury_account_id);
    if (!treasury) throw new Error(`treasury_not_initialized:${row.treasury_account_id}`);
    const exposure = Number(row.reserved_exposure || 0);
    if (Number(treasury.frozen_beans || 0) < exposure) throw new Error('treasury_frozen_balance_invariant');
    const now = Date.now();
    await database.run(`
      UPDATE wallets
      SET frozen_beans = frozen_beans - ?, updated_at = ?, version = version + 1
      WHERE account_id = ?
    `, [exposure, now, row.treasury_account_id]);
    await database.run(`
      UPDATE bot_treasury_reservations
      SET status = 'released', released_at = ?, updated_at = ?
      WHERE reservation_id = ? AND status = ?
    `, [now, now, id, row.status]);
    await insertLedger(database, {
      accountId: row.treasury_account_id,
      type: 'bot_exposure_release',
      amount: 0,
      balanceBefore: Number(treasury.beans || 0),
      balanceAfter: Number(treasury.beans || 0),
      roomId: row.room_id,
      matchId: row.match_id,
      idempotencyKey: `bot_exposure_release:${id}`,
      meta: { reservationId: id, releasedExposure: exposure },
      now,
    });
    return { reservation: await getReservation(id), wallet: await getTreasuryWallet(row.treasury_account_id), idempotent: false };
  });
}

async function settleTreasuryExposureInTransaction (reservationId, options = {}) {
  const id = requireId(reservationId, 'reservationId');
  const actualTreasuryDelta = safeInteger(options.actualTreasuryDelta, 'actualTreasuryDelta');
  const roundNo = Number(options.roundNo);
  if (!Number.isInteger(roundNo) || roundNo < 1) throw new Error('treasury-store: roundNo 非法');
  const database = getDb();
  const row = await getReservationForUpdate(database, id);
  if (!row) throw new Error(`treasury_reservation_not_found:${id}`);
  if (row.status === 'settled') {
    if (Number(row.actual_treasury_delta || 0) !== actualTreasuryDelta) throw new Error('treasury_settlement_delta_conflict');
    return { reservation: rowToReservation(row), wallet: await getTreasuryWallet(row.treasury_account_id), idempotent: true };
  }
  if (row.status !== 'active') throw new Error(`treasury_invalid_transition:${row.status}->settled`);

  const exposure = Number(row.reserved_exposure || 0);
  if (actualTreasuryDelta < 0 && -actualTreasuryDelta > exposure) {
    throw new Error(`treasury_payout_exceeds_reservation:${-actualTreasuryDelta}>${exposure}`);
  }
  const treasury = await getTreasuryForUpdate(database, row.treasury_account_id);
  if (!treasury) throw new Error(`treasury_not_initialized:${row.treasury_account_id}`);
  const before = Number(treasury.beans || 0);
  const frozenBefore = Number(treasury.frozen_beans || 0);
  if (frozenBefore < exposure) throw new Error('treasury_frozen_balance_invariant');
  const after = before + actualTreasuryDelta;
  if (!Number.isSafeInteger(after) || after < 0) throw new Error('treasury_insufficient_for_settlement');

  const now = Date.now();
  await database.run(`
    UPDATE wallets
    SET beans = ?, frozen_beans = frozen_beans - ?,
        total_earned = total_earned + ?, total_spent = total_spent + ?,
        total_won = total_won + ?, total_lost = total_lost + ?,
        updated_at = ?, version = version + 1
    WHERE account_id = ?
  `, [
    after,
    exposure,
    actualTreasuryDelta > 0 ? actualTreasuryDelta : 0,
    actualTreasuryDelta < 0 ? -actualTreasuryDelta : 0,
    actualTreasuryDelta > 0 ? actualTreasuryDelta : 0,
    actualTreasuryDelta < 0 ? -actualTreasuryDelta : 0,
    now,
    row.treasury_account_id,
  ]);
  await database.run(`
    UPDATE bot_treasury_reservations
    SET status = 'settled', actual_treasury_delta = ?, settled_at = ?, updated_at = ?
    WHERE reservation_id = ? AND status = 'active'
  `, [actualTreasuryDelta, now, now, id]);
  await insertLedger(database, {
    accountId: row.treasury_account_id,
    type: 'bot_treasury_settlement',
    amount: actualTreasuryDelta,
    balanceBefore: before,
    balanceAfter: after,
    roomId: row.room_id,
    roundNo,
    matchId: row.match_id,
    idempotencyKey: `bot_treasury:${row.match_id}:${roundNo}:${row.room_type}`,
    meta: { reservationId: id, reservedExposure: exposure, releasedExposure: exposure - Math.max(0, -actualTreasuryDelta) },
    now,
  });
  // 机器人铸造/蒸发流水（checklist：机器人日志表）
  if (actualTreasuryDelta !== 0) {
    try {
      const { recordBotEconomyLog } = require('./economy-ledger');
      await recordBotEconomyLog(database, {
        botScope: row.treasury_account_id,
        delta: actualTreasuryDelta,
        balanceBefore: before,
        balanceAfter: after,
        roomId: row.room_id,
        roundNo,
        matchId: row.match_id,
        source: 'settlement',
      });
    } catch (logErr) {
      logger.error('[treasury] bot_economy_log 写入失败:', logErr.message);
    }
  }
  return { reservation: await getReservation(id), wallet: await getTreasuryWallet(row.treasury_account_id), idempotent: false };
}

async function settleTreasuryExposure (reservationId, options = {}) {
  return retryableTransaction(() => settleTreasuryExposureInTransaction(reservationId, options));
}

module.exports = {
  TREASURY_PREFIX,
  getTreasuryWallet,
  getReservation,
  getReservationByGroup,
  reserveTreasuryExposure,
  activateTreasuryReservation,
  releaseTreasuryExposure,
  settleTreasuryExposureInTransaction,
  settleTreasuryExposure,
};
