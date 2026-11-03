const crypto = require('crypto');

const REQUESTED_ENGINES = new Set(['rule', 'douzero', 'douzero_shadow']);
const SELECTED_ENGINES = new Set(['rule', 'douzero']);
const FALLBACK_REASONS = new Set([
  'bot_watchdog',
  'decision_error',
  'douzero_apply_rejected',
  'douzero_busy',
  'douzero_circuit_open',
  'douzero_invalid_context',
  'douzero_invalid_request',
  'douzero_invalid_response',
  'douzero_stale_response',
  'douzero_timeout',
  'douzero_unavailable',
  'douzero_unknown_candidate',
  'single_candidate',
]);

function clampPercent (value, fallback = 5) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
}

function normalizeRequestedEngine (value) {
  return REQUESTED_ENGINES.has(value) ? value : 'rule';
}

function normalizeSelectedEngine (value) {
  return SELECTED_ENGINES.has(value) ? value : 'rule';
}

function normalizeFallbackReason (value) {
  if (!value) return null;
  return FALLBACK_REASONS.has(value) ? value : 'other';
}

function stablePercent (value) {
  const digest = crypto.createHash('sha256').update(String(value || '')).digest();
  return digest.readUInt32BE(0) % 100;
}

function shouldLogDecision (room, playerId, decisionMeta, samplePercent = 5) {
  if (decisionMeta?.selectedEngine === 'douzero' || decisionMeta?.fallbackReason) return true;
  const percent = clampPercent(samplePercent);
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  return stablePercent(`${room?.instanceId || room?.id || ''}:${room?.round?.number || 0}:${playerId}`) < percent;
}

function formatDecisionLog (room, playerId, actionType, decisionMeta) {
  const requestedEngine = normalizeRequestedEngine(decisionMeta?.requestedEngine);
  const selectedEngine = normalizeSelectedEngine(decisionMeta?.selectedEngine);
  const fallbackReason = normalizeFallbackReason(decisionMeta?.fallbackReason);
  const fallback = fallbackReason ? ` fallback=${fallbackReason}` : '';
  const latency = Number.isFinite(Number(decisionMeta?.totalDecisionMs))
    ? ` latency=${Math.max(0, Math.round(Number(decisionMeta.totalDecisionMs)))}ms`
    : '';
  const roomRef = crypto.createHash('sha256').update(String(room?.instanceId || room?.id || '')).digest('hex').slice(0, 10);
  const seat = Number.isInteger(room?.players?.[playerId]?.seat) ? room.players[playerId].seat : -1;
  return `[机器人决策] room_ref=${roomRef} seat=${seat} requested_engine=${requestedEngine} selected_engine=${selectedEngine} action=${actionType}${latency}${fallback}`;
}

module.exports = {
  clampPercent,
  normalizeRequestedEngine,
  normalizeSelectedEngine,
  normalizeFallbackReason,
  stablePercent,
  shouldLogDecision,
  formatDecisionLog,
};
