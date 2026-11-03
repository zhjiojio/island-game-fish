const crypto = require('crypto');

function constantTimeHexEqual (left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createJoinReservationStore (options = {}) {
  const secret = String(options.secret || '').trim();
  if (secret.length < 16) throw new Error('join-reservation: 必须配置至少 16 字符的独立票据密钥');
  const now = options.now || Date.now;
  const ttlMs = Math.max(5000, Number(options.ttlMs || 60000));
  const byAccount = new Map();
  const byId = new Map();

  function digest (ticket, reservation) {
    const binding = [
      ticket,
      reservation.accountId,
      reservation.roomId,
      reservation.matchRequestId,
      reservation.expiresAt,
    ].join('\n');
    return crypto.createHmac('sha256', secret).update(binding).digest('hex');
  }

  function issue (input) {
    const accountId = String(input.accountId || '').trim();
    const roomId = String(input.roomId || '').trim();
    const matchRequestId = String(input.matchRequestId || '').trim();
    if (!accountId || !roomId || !matchRequestId) throw new Error('join-reservation: 缺少绑定字段');
    invalidateAccount(accountId);
    const reservationId = `join_${crypto.randomUUID()}`;
    const ticket = crypto.randomBytes(24).toString('base64url');
    const reservation = {
      reservationId,
      accountId,
      roomId,
      matchRequestId,
      expiresAt: now() + ttlMs,
      consumedAt: 0,
      ticketHash: '',
    };
    reservation.ticketHash = digest(ticket, reservation);
    byAccount.set(accountId, reservation);
    byId.set(reservationId, reservation);
    return { reservationId, joinTicket: ticket, expiresAt: reservation.expiresAt };
  }

  function validateAndConsume (input) {
    const accountId = String(input.accountId || '').trim();
    const reservation = byAccount.get(accountId);
    if (!reservation) return { ok: false, reason: 'reservation_not_found' };
    if (reservation.consumedAt) return { ok: false, reason: 'ticket_consumed' };
    if (reservation.expiresAt < now()) {
      invalidateAccount(accountId);
      return { ok: false, reason: 'ticket_expired' };
    }
    if (reservation.roomId !== String(input.roomId || '') ||
        reservation.matchRequestId !== String(input.matchRequestId || '')) {
      return { ok: false, reason: 'ticket_binding_mismatch' };
    }
    const actual = digest(String(input.joinTicket || ''), reservation);
    if (!constantTimeHexEqual(actual, reservation.ticketHash)) return { ok: false, reason: 'ticket_invalid' };
    reservation.consumedAt = now();
    return { ok: true, reservation: { ...reservation, ticketHash: undefined } };
  }

  function reissue (accountId) {
    const current = byAccount.get(String(accountId || '').trim());
    if (!current || current.consumedAt || current.expiresAt < now()) return null;
    return issue({ accountId: current.accountId, roomId: current.roomId, matchRequestId: current.matchRequestId });
  }

  function invalidateAccount (accountId) {
    const id = String(accountId || '').trim();
    const current = byAccount.get(id);
    if (!current) return false;
    byAccount.delete(id);
    byId.delete(current.reservationId);
    return true;
  }

  function invalidateRoom (roomId) {
    let count = 0;
    for (const reservation of [...byId.values()]) {
      if (reservation.roomId === roomId && invalidateAccount(reservation.accountId)) count += 1;
    }
    return count;
  }

  function sweep () {
    let count = 0;
    for (const reservation of [...byId.values()]) {
      if (reservation.expiresAt < now() && invalidateAccount(reservation.accountId)) count += 1;
    }
    return count;
  }

  function getByAccount (accountId) {
    const value = byAccount.get(String(accountId || '').trim());
    return value ? { ...value, ticketHash: undefined } : null;
  }

  return { issue, reissue, validateAndConsume, invalidateAccount, invalidateRoom, sweep, getByAccount };
}

module.exports = { createJoinReservationStore };
