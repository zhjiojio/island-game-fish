const { createMatchSessionStore } = require('./session-store');

const DEFAULTS = Object.freeze({
  soloMinMs: 28000,
  soloMaxMs: 36000,
  duoMinMs: 80000,
  duoMaxMs: 105000,
  enabledBotRoomTypes: ['junior', 'mid'],
  // 匹配资产区间开关（默认关闭）：开启后真人配对要求双方余额互相在 ±30% 以内；
  // 关闭时完全退回原 FIFO 行为（不做资产判断）
  assetBandEnabled: false,
  // 匹配资产区间 ±30%：两名真人配对要求余额互相都在对方的 1.3 倍以内；
  // 余额快照为 0（未采集/读不到）时不限制，保证兼容不阻塞
  assetBandRatio: 1.3,
  // 资产带内找配对时最多向后扫描的队列人数（锚点为队首，保证 FIFO 公平性）
  assetBandScanLimit: 6,
});

function randomBetween (min, max, rng) {
  return Math.round(min + Math.max(0, Math.min(0.999999, rng())) * (max - min));
}

function createMatchmakingOrchestrator (options = {}) {
  const config = { ...DEFAULTS, ...(options.config || {}) };
  const roomTypes = options.roomTypes || ['junior', 'mid', 'master'];
  const queues = Object.fromEntries(roomTypes.map(type => [type, []]));
  const locks = Object.fromEntries(roomTypes.map(type => [type, Promise.resolve()]));
  const sessions = options.sessions || createMatchSessionStore();
  const rng = options.rng || Math.random;
  const now = options.now || Date.now;
  const onAssemble = options.onAssemble;
  if (typeof onAssemble !== 'function') throw new Error('matchmaking-orchestrator: 缺少 onAssemble');

  // 资产带兼容：开关关闭时直接放行（完全退回 FIFO 不判资产）；
  // a、b 互相都在对方 ±30%（×assetBandRatio）以内；
  // 任一方余额快照为 0（未采集）时视为不限制（兜底，防队列卡死）
  function inAssetBand (a, b) {
    if (!config.assetBandEnabled) return true;
    const av = Number(a && a.availableBeans || 0);
    const bv = Number(b && b.availableBeans || 0);
    if (!av || !bv) return true;
    return av <= bv * config.assetBandRatio && bv <= av * config.assetBandRatio;
  }

  // 从队列前 scanLimit 人中（队首为锚）挑一个与锚资产兼容的伙伴；
  // 找不到返回 null（不强行配对，交给 duo/solo 计时器兜底）
  function pickBandedPartner (queue, anchorIndex) {
    const anchor = queue[anchorIndex];
    const limit = Math.min(queue.length, anchorIndex + 1 + config.assetBandScanLimit);
    for (let i = anchorIndex + 1; i < limit; i++) {
      if (queue[i].status !== 'queued') continue;
      if (inAssetBand(anchor, queue[i])) return queue[i];
    }
    return null;
  }

  // 从队列前 scanLimit+2 人中找「资产互相兼容的三人组」（锚=队首）；
  // 找不到返回 null —— 不兼容的玩家继续等 duoFillAt/soloFillAt 的 bot 补位，不会饿死
  function pickBandedTrio (queue) {
    const limit = Math.min(queue.length, 1 + config.assetBandScanLimit);
    const anchor = queue[0];
    if (!anchor || anchor.status !== 'queued') return null;
    const pool = [];
    for (let i = 1; i < limit; i++) {
      if (queue[i].status !== 'queued') continue;
      if (inAssetBand(anchor, queue[i])) pool.push(queue[i]);
    }
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        if (inAssetBand(pool[i], pool[j])) return [anchor, pool[i], pool[j]];
      }
    }
    return null;
  }

  function getQueue (roomType) {
    if (!queues[roomType]) throw new Error(`matchmaking-orchestrator: 未知场次 ${roomType}`);
    return queues[roomType];
  }

  function queueLength (roomType) { return getQueue(roomType).length; }
  function totalSize () { return Object.values(queues).reduce((sum, queue) => sum + queue.length, 0); }

  function enqueue (input) {
    const roomType = input.roomType;
    const joinedAt = Number(input.joinedAt || now());
    const result = sessions.create({
      ...input,
      roomType,
      now: joinedAt,
      soloFillAt: joinedAt + randomBetween(config.soloMinMs, config.soloMaxMs, rng),
      duoFillAt: joinedAt + randomBetween(config.duoMinMs, config.duoMaxMs, rng),
    });
    if (result.created) getQueue(roomType).push(result.session);
    else if (input.ws) sessions.update(result.session, { ws: input.ws });
    return result;
  }

  function removeFromQueue (session) {
    if (!session) return false;
    const queue = getQueue(session.roomType);
    const index = queue.indexOf(session);
    if (index >= 0) queue.splice(index, 1);
    return index >= 0;
  }

  function isOpenSession (session) {
    return !!(session && session.ws && session.ws.readyState === 1);
  }

  function pruneDisconnectedQueuedSessions (roomType) {
    const queue = getQueue(roomType);
    let removed = 0;
    for (let i = queue.length - 1; i >= 0; i--) {
      const session = queue[i];
      if (session.status !== 'queued') continue;
      if (isOpenSession(session)) continue;
      queue.splice(i, 1);
      sessions.remove(session, 'disconnected');
      removed += 1;
    }
    return removed;
  }

  function cancelByAccount (accountId, matchRequestId) {
    const session = sessions.getByAccount(accountId);
    if (!session) return false;
    if (matchRequestId && session.matchRequestId !== matchRequestId) return false;
    removeFromQueue(session);
    sessions.remove(session, 'cancelled');
    return true;
  }

  async function assemble (roomType, humans, botCount, mode) {
    for (const session of humans) sessions.update(session, { status: 'assembling' });
    try {
      const result = await onAssemble({ roomType, humans, botCount, mode });
      if (!result || result.ok === false) {
        for (const session of humans) sessions.update(session, { status: 'queued' });
        return false;
      }
      const queue = getQueue(roomType);
      for (const session of humans) {
        const index = queue.indexOf(session);
        if (index >= 0) queue.splice(index, 1);
        sessions.update(session, {
          status: 'reserved',
          roomId: result.roomId,
          reservationId: result.reservationIds?.[session.accountId] || null,
        });
      }
      return true;
    } catch (error) {
      for (const session of humans) sessions.update(session, { status: 'queued' });
      if (options.onError) options.onError(error, { roomType, humans, botCount, mode });
      return false;
    }
  }

  // 资产段位匹配（±assetBandRatio）：从队列头部取 3 人时，要求后两人 beans
  // 落在队首 beans 的 ±ratio 区间内；同段位不足则返回 null（等待机器人兜底）。
  function pickInBandHumans (queue) {
    if (queue.length < 3) return null;
    const first = queue[0];
    const beans = Number(first.beans || 0);
    const lo = beans * (1 - config.assetBandRatio);
    const hi = beans * (1 + config.assetBandRatio);
    const inBand = queue.slice(1).filter(s => {
      const b = Number(s.beans || 0);
      return b >= lo && b <= hi;
    }).slice(0, 2);
    if (inBand.length < 2) return null;
    return [first, ...inBand];
  }

  async function processUnlocked (roomType) {
    pruneDisconnectedQueuedSessions(roomType);
    const queue = getQueue(roomType);
    let assembled = 0;
    // 3 真人房：有 bot 兜底的场次（junior/mid）按资产带找兼容三人组，找不到不强组
    // （等 duo/solo 计时器补 bot）；无 bot 兜底的场次（master）维持原 FIFO 直接组，
    // 否则不兼容玩家会无限等待（没有计时器兜底）
    const botFillAvailable = config.enabledBotRoomTypes.includes(roomType);
    while (queue.length >= 3) {
      const humans = botFillAvailable ? pickBandedTrio(queue) : queue.slice(0, 3);
      if (!humans) break;
      if (!(await assemble(roomType, humans, 0, 'human'))) break;
      assembled += 1;
    }
    if (queue.length === 0 || !botFillAvailable) return assembled;

    const time = now();
    if (queue.length >= 2) {
      // duo：到点后优先在资产带内找伙伴；带内没有则用队首两人兜底配对
      //（等待已达 duoFillAt 上限，不再无限等，保证活性）
      const head = queue[0];
      const partner = pickBandedPartner(queue, 0) || queue[1];
      const duoReadyAt = Math.max(head.duoFillAt, partner.duoFillAt);
      const humans = [head, partner];
      if (time >= duoReadyAt && await assemble(roomType, humans, 1, 'duo')) assembled += 1;
      return assembled;
    }

    const human = queue[0];
    if (time >= human.soloFillAt && await assemble(roomType, [human], 2, 'solo')) assembled += 1;
    return assembled;
  }

  function process (roomType) {
    const previous = locks[roomType] || Promise.resolve();
    const next = previous.then(() => processUnlocked(roomType), () => processUnlocked(roomType));
    locks[roomType] = next.then(() => undefined, () => undefined);
    return next;
  }

  function resume (accountId, ws) {
    const session = sessions.getByAccount(accountId);
    if (!session) return null;
    sessions.update(session, { ws });
    return session;
  }

  function markJoining (accountId) {
    const session = sessions.getByAccount(accountId);
    if (!session || session.status !== 'reserved') return null;
    return sessions.update(session, { status: 'joining' });
  }

  function markActive (accountId) {
    const session = sessions.getByAccount(accountId);
    if (!session || (session.status !== 'joining' && session.status !== 'reserved')) return null;
    return sessions.update(session, { status: 'active' });
  }

  function complete (accountId, status = 'active') {
    const session = sessions.getByAccount(accountId);
    if (!session) return false;
    return sessions.remove(session, status);
  }

  return {
    queues,
    sessions,
    enqueue,
    process,
    cancelByAccount,
    resume,
    markJoining,
    markActive,
    complete,
    pruneDisconnectedQueuedSessions,
    queueLength,
    totalSize,
  };
}

module.exports = { DEFAULTS, createMatchmakingOrchestrator };
