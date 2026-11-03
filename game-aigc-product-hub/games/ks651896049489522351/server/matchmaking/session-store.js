const crypto = require('crypto');

const ACTIVE_STATUSES = new Set(['queued', 'assembling', 'reserved', 'joining', 'active']);

function createMatchSessionStore () {
  const byAccount = new Map();
  const byRequest = new Map();

  function create (input) {
    const accountId = String(input.accountId || '').trim();
    if (!accountId) throw new Error('match-session-store: 缺少 accountId');
    const current = byAccount.get(accountId);
    if (current && ACTIVE_STATUSES.has(current.status)) return { session: current, created: false };
    const now = Number(input.now || Date.now());
    const session = {
      matchRequestId: String(input.matchRequestId || `matchreq_${crypto.randomUUID()}`),
      accountId,
      ws: input.ws || null,
      roomType: input.roomType,
      nickname: input.nickname || '玩家',
      avatarUrl: input.avatarUrl || '',
      loginType: input.loginType || '',
      status: 'queued',
      joinedAt: now,
      // 资产带配对用：入队时的可用铁豆快照（0 = 未采集，配对时不限制）
      availableBeans: Number(input.availableBeans || 0),
      soloFillAt: Number(input.soloFillAt || 0),
      duoFillAt: Number(input.duoFillAt || 0),
      beans: Number(input.beans || 0),   // 资产段位匹配快照（入队时余额）
      reconnectToken: '',
      reservationId: null,
      roomId: null,
      createdAt: now,
      updatedAt: now,
    };
    byAccount.set(accountId, session);
    byRequest.set(session.matchRequestId, session);
    return { session, created: true };
  }

  function update (session, patch) {
    if (!session) return null;
    Object.assign(session, patch, { updatedAt: Date.now() });
    return session;
  }

  function remove (session, status = 'cancelled') {
    if (!session) return false;
    update(session, { status, ws: null });
    byAccount.delete(session.accountId);
    byRequest.delete(session.matchRequestId);
    return true;
  }

  function getByAccount (accountId) { return byAccount.get(accountId) || null; }
  function getByRequest (requestId) { return byRequest.get(requestId) || null; }
  function size () { return byAccount.size; }
  function values () { return [...byAccount.values()]; }

  return { create, update, remove, getByAccount, getByRequest, size, values };
}

module.exports = { ACTIVE_STATUSES, createMatchSessionStore };
