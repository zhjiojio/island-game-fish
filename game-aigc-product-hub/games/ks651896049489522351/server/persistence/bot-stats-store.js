const crypto = require('crypto');
const { getDb, retryableTransaction } = require('./db');

const DEFAULT_MAX_MATCHES = 20;
const DEFAULT_MAX_POSITIVE_GAIN = 30000;
const VALID_MODES = new Set(['solo', 'duo']);

function requireUserAccountId (accountId) {
  const id = String(accountId || '').trim();
  const lower = id.toLowerCase();
  if (!id) throw new Error('bot-stats-store: 缺少 accountId');
  if (lower.startsWith('bot::') || lower.startsWith('system::')) {
    throw new Error('bot-stats-store: 额度只适用于真人账号');
  }
  return id;
}

function requireId (value, name) {
  const id = String(value || '').trim();
  if (!id) throw new Error(`bot-stats-store: 缺少 ${name}`);
  return id;
}

function nonNegativeInteger (value, name) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`bot-stats-store: ${name} 必须是非负安全整数`);
  return n;
}

function rowToReservation (row) {
  if (!row) return null;
  return {
    reservationId: row.reservation_id,
    matchRequestId: row.match_request_id,
    matchId: row.match_id || null,
    accountId: row.account_id,
    statDate: row.stat_date,
    reservedPositiveGain: Number(row.reserved_positive_gain || 0),
    status: row.status,
    createdAt: Number(row.created_at || 0),
    activatedAt: row.activated_at == null ? null : Number(row.activated_at),
    releasedAt: row.released_at == null ? null : Number(row.released_at),
    settledAt: row.settled_at == null ? null : Number(row.settled_at),
    updatedAt: Number(row.updated_at || 0),
  };
}

function rowToStats (row) {
  if (!row) return null;
  return {
    accountId: row.account_id,
    statDate: row.stat_date,
    matchCount: Number(row.match_count || 0),
    soloBotMatchCount: Number(row.solo_bot_match_count || 0),
    duoBotMatchCount: Number(row.duo_bot_match_count || 0),
    winCount: Number(row.win_count || 0),
    loseCount: Number(row.lose_count || 0),
    netGain: Number(row.net_gain || 0),
    positiveGainTotal: Number(row.positive_gain_total || 0),
    reservedPositiveGain: Number(row.reserved_positive_gain || 0),
    reservedMatchCount: Number(row.reserved_match_count || 0),
    consecutiveBotMatches: Number(row.consecutive_bot_matches || 0),
    lastMatchAt: Number(row.last_match_at || 0),
  };
}

async function getReservationByRequest (matchRequestId, accountId) {
  const row = await getDb().get(
    'SELECT * FROM bot_quota_reservations WHERE match_request_id = ? AND account_id = ?',
    [matchRequestId, accountId]
  );
  return rowToReservation(row);
}

async function getReservation (reservationId) {
  const row = await getDb().get(
    'SELECT * FROM bot_quota_reservations WHERE reservation_id = ?', [reservationId]);
  return rowToReservation(row);
}

async function getDailyStats (accountId, statDate) {
  const row = await getDb().get(
    'SELECT * FROM bot_match_stats WHERE account_id = ? AND stat_date = ?',
    [requireUserAccountId(accountId), requireId(statDate, 'statDate')]
  );
  return rowToStats(row);
}

async function ensureStatsRow (database, accountId, statDate, now) {
  await database.run(`
    ${database.insertIgnoreKeyword} INTO bot_match_stats (
      account_id, stat_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?)
  `, [accountId, statDate, now, now]);
}

async function getStatsForUpdate (database, accountId, statDate) {
  return database.get(
    'SELECT * FROM bot_match_stats WHERE account_id = ? AND stat_date = ? FOR UPDATE',
    [accountId, statDate]
  );
}

async function getReservationForUpdate (database, reservationId) {
  return database.get(
    'SELECT * FROM bot_quota_reservations WHERE reservation_id = ? FOR UPDATE',
    [reservationId]
  );
}

async function reserveBotQuota (options = {}) {
  const accountId = requireUserAccountId(options.accountId);
  const statDate = requireId(options.statDate, 'statDate');
  const matchRequestId = requireId(options.matchRequestId, 'matchRequestId');
  const reservationId = String(options.reservationId || `bqr_${crypto.randomUUID()}`);
  const requiredPositiveGain = nonNegativeInteger(options.requiredPositiveGain || 0, 'requiredPositiveGain');
  const maxMatches = nonNegativeInteger(options.maxMatches == null ? DEFAULT_MAX_MATCHES : options.maxMatches, 'maxMatches');
  const maxPositiveGain = nonNegativeInteger(options.maxPositiveGain == null ? DEFAULT_MAX_POSITIVE_GAIN : options.maxPositiveGain, 'maxPositiveGain');

  return retryableTransaction(async () => {
    const database = getDb();
    const now = Date.now();
    await ensureStatsRow(database, accountId, statDate, now);
    const stats = await getStatsForUpdate(database, accountId, statDate);
    const existingRow = await database.get(
      'SELECT * FROM bot_quota_reservations WHERE match_request_id = ? AND account_id = ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
      [matchRequestId, accountId]
    );
    const existing = rowToReservation(existingRow);
    // 幂等只复用 reserved/active。released（组房失败已释放——如资金池耗尽期间
    // reserveBotQuota 成功但 reserveTreasuryExposure 失败的循环）与 settled（已
    // 结算完毕）的旧预留不可复用：release/settle 已对称回退当日配额，这里重新
    // 创建新预留并重新占用，否则开局 activateBotQuota 撞 released->active 使房间卡死。
    if (existing && (existing.status === 'reserved' || existing.status === 'active')) {
      return { ok: true, reservation: existing, idempotent: true };
    }

    const occupiedMatches = Number(stats.match_count || 0) + Number(stats.reserved_match_count || 0);
    const occupiedGain = Number(stats.positive_gain_total || 0) + Number(stats.reserved_positive_gain || 0);
    if (occupiedMatches >= maxMatches) {
      return { ok: false, reason: 'daily_match_limit', stats: rowToStats(stats) };
    }
    if (occupiedGain + requiredPositiveGain > maxPositiveGain) {
      return { ok: false, reason: 'daily_positive_gain_limit', stats: rowToStats(stats) };
    }

    await database.run(`
      INSERT INTO bot_quota_reservations (
        reservation_id, match_request_id, match_id, account_id, stat_date,
        reserved_positive_gain, status, created_at, activated_at,
        released_at, settled_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, ?, 'reserved', ?, NULL, NULL, NULL, ?)
    `, [reservationId, matchRequestId, accountId, statDate, requiredPositiveGain, now, now]);
    await database.run(`
      UPDATE bot_match_stats
      SET reserved_match_count = reserved_match_count + 1,
          reserved_positive_gain = reserved_positive_gain + ?,
          updated_at = ?
      WHERE account_id = ? AND stat_date = ?
    `, [requiredPositiveGain, now, accountId, statDate]);

    return { ok: true, reservation: await getReservation(reservationId), idempotent: false };
  });
}

async function activateBotQuota (reservationId, matchId, mode) {
  const id = requireId(reservationId, 'reservationId');
  const targetMatchId = requireId(matchId, 'matchId');
  if (!VALID_MODES.has(mode)) throw new Error('bot-stats-store: mode 必须是 solo 或 duo');

  return retryableTransaction(async () => {
    const database = getDb();
    const row = await getReservationForUpdate(database, id);
    if (!row) throw new Error(`bot_quota_reservation_not_found:${id}`);
    if (row.status === 'active' || row.status === 'settled') {
      if (row.match_id && row.match_id !== targetMatchId) throw new Error('bot_quota_match_id_conflict');
      return { reservation: rowToReservation(row), idempotent: true };
    }
    if (row.status !== 'reserved') throw new Error(`bot_quota_invalid_transition:${row.status}->active`);

    const now = Date.now();
    const modeColumn = mode === 'solo' ? 'solo_bot_match_count' : 'duo_bot_match_count';
    await database.run(`
      UPDATE bot_quota_reservations
      SET status = 'active', match_id = ?, activated_at = ?, updated_at = ?
      WHERE reservation_id = ? AND status = 'reserved'
    `, [targetMatchId, now, now, id]);
    await database.run(`
      UPDATE bot_match_stats
      SET reserved_match_count = CASE WHEN reserved_match_count > 0 THEN reserved_match_count - 1 ELSE 0 END,
          match_count = match_count + 1,
          ${modeColumn} = ${modeColumn} + 1,
          consecutive_bot_matches = consecutive_bot_matches + 1,
          last_match_at = ?, updated_at = ?
      WHERE account_id = ? AND stat_date = ?
    `, [now, now, row.account_id, row.stat_date]);
    return { reservation: await getReservation(id), idempotent: false };
  });
}

async function releaseBotQuota (reservationId) {
  const id = requireId(reservationId, 'reservationId');
  return retryableTransaction(async () => {
    const database = getDb();
    const row = await getReservationForUpdate(database, id);
    if (!row) throw new Error(`bot_quota_reservation_not_found:${id}`);
    if (row.status === 'released') return { reservation: rowToReservation(row), idempotent: true };
    if (row.status === 'settled') throw new Error('bot_quota_invalid_transition:settled->released');
    if (row.status !== 'reserved' && row.status !== 'active') {
      throw new Error(`bot_quota_invalid_transition:${row.status}->released`);
    }

    const now = Date.now();
    await database.run(`
      UPDATE bot_quota_reservations
      SET status = 'released', released_at = ?, updated_at = ?
      WHERE reservation_id = ? AND status = ?
    `, [now, now, id, row.status]);
    await database.run(`
      UPDATE bot_match_stats
      SET reserved_match_count = CASE WHEN reserved_match_count >= ? THEN reserved_match_count - ? ELSE 0 END,
          reserved_positive_gain = CASE WHEN reserved_positive_gain >= ? THEN reserved_positive_gain - ? ELSE 0 END,
          updated_at = ?
      WHERE account_id = ? AND stat_date = ?
    `, [
      row.status === 'reserved' ? 1 : 0,
      row.status === 'reserved' ? 1 : 0,
      Number(row.reserved_positive_gain || 0),
      Number(row.reserved_positive_gain || 0),
      now,
      row.account_id,
      row.stat_date,
    ]);
    return { reservation: await getReservation(id), idempotent: false };
  });
}

async function settleBotQuotaInTransaction (reservationId, options = {}) {
  const id = requireId(reservationId, 'reservationId');
  const netGain = Number(options.netGain || 0);
  if (!Number.isSafeInteger(netGain)) throw new Error('bot-stats-store: netGain 必须是安全整数');
  const positiveGain = Math.max(0, netGain);
  const database = getDb();
  const row = await getReservationForUpdate(database, id);
  if (!row) throw new Error(`bot_quota_reservation_not_found:${id}`);
  if (row.status === 'settled') return { reservation: rowToReservation(row), idempotent: true };
  if (row.status !== 'active') throw new Error(`bot_quota_invalid_transition:${row.status}->settled`);
  const reserved = Number(row.reserved_positive_gain || 0);
  if (positiveGain > reserved) throw new Error(`bot_quota_positive_gain_exceeds_reservation:${positiveGain}>${reserved}`);

  const now = Date.now();
  await database.run(`
    UPDATE bot_quota_reservations
    SET status = 'settled', settled_at = ?, updated_at = ?
    WHERE reservation_id = ? AND status = 'active'
  `, [now, now, id]);
  await database.run(`
    UPDATE bot_match_stats
    SET net_gain = net_gain + ?,
        positive_gain_total = positive_gain_total + ?,
        reserved_positive_gain = CASE WHEN reserved_positive_gain >= ? THEN reserved_positive_gain - ? ELSE 0 END,
        win_count = win_count + ?,
        lose_count = lose_count + ?,
        updated_at = ?
    WHERE account_id = ? AND stat_date = ?
  `, [netGain, positiveGain, reserved, reserved, netGain > 0 ? 1 : 0, netGain < 0 ? 1 : 0, now, row.account_id, row.stat_date]);
  return { reservation: await getReservation(id), stats: await getDailyStats(row.account_id, row.stat_date), idempotent: false };
}

async function settleBotQuota (reservationId, options = {}) {
  return retryableTransaction(() => settleBotQuotaInTransaction(reservationId, options));
}

module.exports = {
  DEFAULT_MAX_MATCHES,
  DEFAULT_MAX_POSITIVE_GAIN,
  getDailyStats,
  getReservation,
  getReservationByRequest,
  reserveBotQuota,
  activateBotQuota,
  releaseBotQuota,
  settleBotQuotaInTransaction,
  settleBotQuota,
};
