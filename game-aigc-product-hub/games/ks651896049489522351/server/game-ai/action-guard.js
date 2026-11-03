const { removeCards } = require('../cards');
const { analyzePlay, canBeat } = require('../rules');

function snapshotAction (action) {
  if (!action) return null;
  return {
    ...action,
    cardIds: Array.isArray(action.cardIds) ? action.cardIds.slice() : [],
    meta: action.meta ? { ...action.meta } : {},
  };
}

function currentActionPlayerId (room) {
  if (room?.phase === 'bidding') return room.bidState?.currentPlayerId || null;
  if (room?.phase === 'doubling') return room.doublingPlayerId || null;
  if (room?.phase === 'playing') return room.currentPlayerId || null;
  return null;
}

function matchesActionGuard (room, playerId, guard = null) {
  if (!room || room.disposed) return false;
  if (!guard) return currentActionPlayerId(room) === playerId;
  return room.autoActionSeq === guard.seq &&
    room.phase === guard.phase &&
    currentActionPlayerId(room) === playerId;
}

function inspectPlayingAction (room, playerId, action) {
  if (!room || room.phase !== 'playing') return { valid: false, reason: 'phase_changed' };
  if (room.currentPlayerId !== playerId) return { valid: false, reason: 'actor_changed' };
  if (!room.players?.[playerId]) return { valid: false, reason: 'player_missing' };
  if (!action || !['playCards', 'pass'].includes(action.type)) return { valid: false, reason: 'action_invalid' };

  if (action.type === 'pass') {
    const canPass = Boolean(room.lastPlay && room.lastPlay.playerId !== playerId);
    return canPass ? { valid: true } : { valid: false, reason: 'pass_not_allowed' };
  }

  if (!Array.isArray(action.cardIds) || action.cardIds.length === 0) {
    return { valid: false, reason: 'cards_missing' };
  }
  const selected = removeCards(room.hands?.[playerId] || [], action.cardIds);
  if (!selected || selected.length === 0) return { valid: false, reason: 'cards_changed' };
  const analysis = analyzePlay(selected);
  if (!analysis) return { valid: false, reason: 'play_invalid' };
  if (!canBeat(analysis, room.lastPlay?.analysis || null)) return { valid: false, reason: 'cannot_beat' };
  return { valid: true };
}

function asRuleFallback (selectedAction, ruleAction) {
  const fallback = snapshotAction(ruleAction);
  if (!fallback) return null;
  const selectedMeta = selectedAction?.meta || {};
  fallback.meta = {
    ...(fallback.meta || {}),
    requestedEngine: selectedMeta.requestedEngine || 'douzero',
    selectedEngine: 'rule',
    fallbackReason: 'douzero_apply_rejected',
    fallbackApplied: true,
  };
  for (const key of ['decisionId', 'candidateCount', 'inferenceMs', 'totalDecisionMs']) {
    if (selectedMeta[key] !== undefined && selectedMeta[key] !== null) fallback.meta[key] = selectedMeta[key];
  }
  return fallback;
}

function selectPlayingAction (room, playerId, selectedAction, ruleAction = null) {
  const selected = snapshotAction(selectedAction);
  const selectedInspection = inspectPlayingAction(room, playerId, selected);
  if (selectedInspection.valid) return { action: selected, fallbackApplied: false };

  if (selected?.meta?.selectedEngine !== 'douzero') {
    return { action: null, fallbackApplied: false, reason: selectedInspection.reason };
  }
  const fallback = asRuleFallback(selected, ruleAction);
  const fallbackInspection = inspectPlayingAction(room, playerId, fallback);
  if (!fallbackInspection.valid) {
    return { action: null, fallbackApplied: true, reason: fallbackInspection.reason };
  }
  return { action: fallback, fallbackApplied: true };
}

async function applyGuardedPlayingAction (options = {}) {
  const { room, playerId, selectedAction, ruleAction, guard, apply } = options;
  if (typeof apply !== 'function' || !matchesActionGuard(room, playerId, guard)) return false;
  const selection = selectPlayingAction(room, playerId, selectedAction, ruleAction);
  if (!selection.action) return false;
  // Selection is side-effect free. The caller holds the room action lock, so
  // exactly one authoritative apply is attempted for the final selected action.
  return apply(selection.action);
}

module.exports = {
  snapshotAction,
  matchesActionGuard,
  inspectPlayingAction,
  selectPlayingAction,
  applyGuardedPlayingAction,
};
