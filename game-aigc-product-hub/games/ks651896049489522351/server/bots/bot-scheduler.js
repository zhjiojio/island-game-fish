function clampRandom (rng) {
  return Math.max(0, Math.min(0.999999, Number(rng()) || 0));
}

function randomBetween (min, max, rng) {
  return Math.round(min + (max - min) * clampRandom(rng));
}

function thinkingDelayMs (observation, action, persona, rng = Math.random) {
  const speed = Number(persona?.thinkSpeed || 1);
  const counts = Object.values(observation?.publicState?.handCounts || {}).map(Number).filter(n => n > 0);
  const critical = observation?.self?.handCount <= 5 || counts.some(count => count <= 2);
  let range;
  if (critical) range = [1800, 4500];
  else if (!action || action.type === 'pass' || (action.type === 'bid' && action.score === 0)) range = [500, 1400];
  else if (observation?.publicState?.lastPlay && observation.publicState.lastPlay.playerId !== observation.self.playerId) range = [700, 1800];
  else range = [1200, 3000];

  let delay = randomBetween(range[0], range[1], rng) * speed;
  const jitter = 0.7 + clampRandom(rng) * 0.6;
  delay *= jitter;
  if (clampRandom(rng) < 0.08) delay *= 2 + clampRandom(rng);
  return Math.max(350, Math.min(6000, Math.round(delay)));
}

function scheduleGuardedAction (options = {}) {
  const room = options.room;
  const playerId = options.playerId;
  const seq = options.seq;
  const phase = options.phase;
  const delayMs = Math.max(0, Number(options.delayMs || 0));
  const setTimer = options.setTimer || setTimeout;
  if (!room || !playerId || typeof options.execute !== 'function') throw new Error('bot-scheduler: 参数非法');
  return setTimer(async () => {
    if (room.disposed) return;
    if (room.autoActionSeq !== seq) return;
    if (room.phase !== phase) return;
    const actorId = phase === 'bidding'
      ? room.bidState?.currentPlayerId
      : phase === 'doubling'
        ? room.doublingPlayerId
        : room.currentPlayerId;
    if (actorId !== playerId) return;
    await options.execute();
  }, delayMs);
}

function scheduleLockedActionRetry (options = {}) {
  const room = options.room;
  const playerId = options.playerId;
  const seq = options.seq;
  const phase = options.phase;
  const setTimer = options.setTimer || setTimeout;
  const delayMs = Math.max(1, Number(options.delayMs || 250));
  if (!room || !playerId || typeof options.execute !== 'function') throw new Error('bot-scheduler: 参数非法');
  return setTimer(async () => {
    if (room.disposed || room.autoActionSeq !== seq || room.phase !== phase) return;
    const actorId = phase === 'bidding'
      ? room.bidState?.currentPlayerId
      : phase === 'doubling'
        ? room.doublingPlayerId
        : room.currentPlayerId;
    if (actorId !== playerId) return;
    if (room.actionLock) {
      const timer = scheduleLockedActionRetry(options);
      if (room.players?.[playerId]?.isBot) room.botWatchdog = timer;
      else room.actionTimer = timer;
      return;
    }
    await options.execute();
  }, delayMs);
}

module.exports = { thinkingDelayMs, scheduleGuardedAction, scheduleLockedActionRetry };
