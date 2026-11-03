const { analyzePlay } = require('../rules');
const { enumerateLegalActions } = require('./legal-actions');
const {
  evaluateHand,
  evaluateHandStrength,
  HAND_EVALUATOR_V1,
  HAND_EVALUATOR_LITE,
  HAND_POLICY_V1,
  HAND_POLICY_LITE,
  V1_THRESHOLDS,
  LITE_THRESHOLDS,
} = require('./hand-strength');
const { getPersona, getControllerProfile } = require('./personas');

const STRATEGY_VERSION = 'bot-ai-v1';

function clamp (value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function evaluateStrengthForStrategy (hand, options = {}) {
  const hasEvaluatorVersion = Object.prototype.hasOwnProperty.call(options, 'handEvaluatorVersion');
  const hasPolicyVersion = Object.prototype.hasOwnProperty.call(options, 'handPolicyVersion');
  const requestedEvaluatorVersion = hasEvaluatorVersion
    ? (options.handEvaluatorVersion === HAND_EVALUATOR_V1 ? HAND_EVALUATOR_V1 : HAND_EVALUATOR_LITE)
    : HAND_EVALUATOR_LITE;
  const requestedPolicyVersion = hasPolicyVersion
    ? (options.handPolicyVersion === HAND_POLICY_V1 ? HAND_POLICY_V1 : HAND_POLICY_LITE)
    : HAND_POLICY_LITE;
  const actual = evaluateHand(hand, { evaluatorVersion: requestedEvaluatorVersion });
  return { actual, requestedEvaluatorVersion, requestedPolicyVersion };
}

function policyForEvaluation (_evaluation, requestedPolicyVersion) {
  return requestedPolicyVersion === HAND_POLICY_V1
    ? { version: HAND_POLICY_V1, thresholds: V1_THRESHOLDS }
    : { version: HAND_POLICY_LITE, thresholds: LITE_THRESHOLDS };
}

function strengthMeta (evaluations, policy) {
  const evaluation = evaluations.actual;
  const features = evaluation.features || {};
  const meta = {
    handEvaluatorVersion: evaluation.version,
    handEvaluatorRequestedVersion: evaluations.requestedEvaluatorVersion,
    handPolicyVersion: policy.version,
    handPolicyRequestedVersion: evaluations.requestedPolicyVersion,
    handStrengthScore: Number(evaluation.score.toFixed(4)),
    handStrengthBucket: Math.min(9, Math.floor(evaluation.score * 10)),
  };
  if (evaluation.version === HAND_EVALUATOR_LITE) {
    meta.handStrengthFeatures = {
      estimatedTurns: features.estimatedTurns,
      controlPower: Number((features.controlPower || 0).toFixed(4)),
      weakLooseCards: features.weakLooseCards,
      structuredCoverage: Number((features.structuredCoverage || 0).toFixed(4)),
    };
  }
  return meta;
}

function isCriticalState (observation, actions) {
  const counts = Object.values(observation.publicState.handCounts || {}).map(Number).filter(n => n > 0);
  if (counts.some(count => count <= 2)) return true;
  if (observation.self.handCount <= 5) return true;
  return actions.some(action => action.type === 'playCards' && action.cardIds.length === observation.self.handCount);
}

function isTeammateLastPlay (observation) {
  const lastPlayerId = observation.publicState.lastPlay?.playerId;
  if (!lastPlayerId || observation.self.role !== 'farmer') return false;
  return observation.publicState.roles?.[lastPlayerId] === 'farmer';
}

function opponentMinimumCount (observation) {
  const roles = observation.publicState.roles || {};
  const myRole = observation.self.role;
  const opponentIds = Object.keys(observation.publicState.handCounts || {}).filter(id => {
    if (id === observation.self.playerId) return false;
    if (!myRole || !roles[id]) return true;
    return roles[id] !== myRole;
  });
  return opponentIds.reduce((min, id) => Math.min(min, Number(observation.publicState.handCounts[id] || 99)), 99);
}

function playScore (observation, action, persona, profile) {
  if (action.type === 'pass') {
    let score = -1.5;
    if (isTeammateLastPlay(observation)) score += 5 * persona.cooperatePreference;
    if (opponentMinimumCount(observation) <= 2) score -= 8;
    return score;
  }

  const analysis = action.analysis || analyzePlay(action.cards || []);
  const remaining = observation.self.handCount - action.cardIds.length;
  if (remaining === 0) return 1000;
  let score = action.cardIds.length * 2.5 - remaining * 0.12;
  const mainRank = Number(analysis?.rank || 0);
  const powerPlay = analysis?.type === 'bomb' || analysis?.type === 'rocket';
  const isResponse = observation.publicState.lastPlay && observation.publicState.lastPlay.playerId !== observation.self.playerId;

  if (isResponse) score -= mainRank * (0.12 + (1 - persona.riskPreference) * 0.08);
  else score -= mainRank * 0.04;
  if (powerPlay) {
    score += opponentMinimumCount(observation) <= 2 ? 14 : -8 * (1 - persona.powerPlayPreference);
  }
  if (isTeammateLastPlay(observation) && remaining > 0) {
    score -= 12 * persona.cooperatePreference;
  }
  if (opponentMinimumCount(observation) <= 2) score += mainRank * 0.34;
  score += (persona.skillLevel + profile.skillModifier) * action.cardIds.length;
  return score;
}

function bidThreshold (bidPhase, thresholds) {
  if (bidPhase === 'calling') return thresholds.calling;
  if (bidPhase === 'robbing') return thresholds.robbing;
  if (bidPhase === 'final_confirm') return thresholds.final_confirm;
  return Number.POSITIVE_INFINITY;
}

function bidDecisionForEvaluation (evaluation, persona, profile, bidPhase, requestedPolicyVersion) {
  const policy = policyForEvaluation(evaluation, requestedPolicyVersion);
  const adjusted = evaluation.score + (persona.bidAggression - 0.5) * 0.18 + profile.skillModifier * 0.08;
  const threshold = bidThreshold(bidPhase, policy.thresholds);
  return { policy, adjusted, threshold, desired: adjusted >= threshold ? 1 : 0 };
}

function decideBid (observation, persona, profile, rng, options) {
  const evaluations = evaluateStrengthForStrategy(observation.self.hand, options);
  const strength = evaluations.actual.score;
  const bidPhase = observation.publicState.bidState?.phase || 'calling';
  const decision = bidDecisionForEvaluation(
    evaluations.actual,
    persona,
    profile,
    bidPhase,
    evaluations.requestedPolicyVersion
  );
  let desired = decision.desired;

  const critical = desired === 1 && strength >= 0.8;
  const mistakeRate = critical || !profile.allowMistakes
    ? 0
    : clamp(persona.baseMistakeRate + profile.mistakeModifier, 0, 0.05);
  let mistakeApplied = false;
  if (desired > 0 && rng() < mistakeRate) {
    desired = 0;
    mistakeApplied = true;
  }
  return {
    type: 'bid', score: desired, cardIds: [],
    meta: {
      confidence: clamp(Math.abs(decision.adjusted - decision.threshold) + 0.45, 0, 1),
      reason: `hand_strength:${strength.toFixed(3)}`,
      mistakeApplied,
      strategyVersion: STRATEGY_VERSION,
      ...strengthMeta(evaluations, decision.policy),
    },
  };
}

function decidePlay (observation, persona, profile, rng) {
  const actions = enumerateLegalActions(observation);
  if (!actions.length) return null;
  const ranked = actions
    .map(action => ({ action, score: playScore(observation, action, persona, profile) }))
    .sort((a, b) => b.score - a.score || a.action.cardIds.length - b.action.cardIds.length);
  const critical = isCriticalState(observation, actions) || opponentMinimumCount(observation) <= 2;
  const bestIsPower = ranked[0].action.analysis?.type === 'bomb' || ranked[0].action.analysis?.type === 'rocket';
  const maximumMistake = critical ? 0 : bestIsPower ? 0.02 : 0.06;
  const mistakeRate = profile.allowMistakes
    ? clamp(persona.baseMistakeRate + profile.mistakeModifier, 0, maximumMistake)
    : 0;
  let selected = ranked[0];
  let mistakeApplied = false;
  if (ranked.length > 1 && rng() < mistakeRate) {
    const plausible = ranked.filter((entry, index) => index > 0 && ranked[0].score - entry.score <= 8);
    if (plausible.length) {
      selected = plausible[Math.floor(rng() * plausible.length)];
      mistakeApplied = true;
    }
  }
  return {
    type: selected.action.type,
    score: 0,
    cardIds: selected.action.cardIds,
    meta: {
      confidence: clamp(0.5 + (selected.score - (ranked[1]?.score ?? selected.score - 2)) / 16, 0, 1),
      reason: selected.action.type === 'pass' ? 'protect_or_no_efficient_beat' : `play:${selected.action.analysis?.type || 'unknown'}`,
      mistakeApplied,
      strategyVersion: STRATEGY_VERSION,
    },
  };
}

function decideAction (observation, options = {}) {
  if (!observation || !observation.self || !observation.publicState) throw new Error('game-ai: observation 非法');
  const persona = getPersona(options.personaId);
  const profile = getControllerProfile(options.profileId);
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  if (observation.phase === 'bidding') return decideBid(observation, persona, profile, rng, options);
  if (observation.phase === 'doubling') return decideDouble(observation, persona, profile, rng, options);
  if (observation.phase === 'playing') return decidePlay(observation, persona, profile, rng);
  return null;
}

function doubleDecisionForEvaluation (evaluation, persona, profile, role, requestedPolicyVersion) {
  const policy = policyForEvaluation(evaluation, requestedPolicyVersion);
  const adjusted = evaluation.score + (persona.bidAggression - 0.5) * 0.18 + profile.skillModifier * 0.08;
  const superThreshold = role === 'farmer'
    ? policy.thresholds.farmerSuperDouble
    : policy.thresholds.landlordSuperDouble;
  const doubleThreshold = role === 'farmer'
    ? policy.thresholds.farmerDouble
    : policy.thresholds.landlordDouble;
  let multiplier = 1;
  if (adjusted >= superThreshold) multiplier = 4;
  else if (adjusted >= doubleThreshold) multiplier = 2;
  return { policy, adjusted, multiplier };
}

function decideDouble (observation, persona, profile, _rng, options) {
  const evaluations = evaluateStrengthForStrategy(observation.self.hand, options);
  const decision = doubleDecisionForEvaluation(
    evaluations.actual,
    persona,
    profile,
    observation.self.role,
    evaluations.requestedPolicyVersion
  );
  return {
    type: 'double', score: 0, cardIds: [], multiplier: decision.multiplier,
    meta: {
      confidence: decision.adjusted,
      reason: `hand_strength:${evaluations.actual.score.toFixed(3)}`,
      strategyVersion: STRATEGY_VERSION,
      ...strengthMeta(evaluations, decision.policy),
    },
  };
}

module.exports = { STRATEGY_VERSION, evaluateHandStrength, decideAction };
