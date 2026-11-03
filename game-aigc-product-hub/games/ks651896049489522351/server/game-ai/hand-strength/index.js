const { validateHand } = require('./hand-state');
const { resultV1 } = require('./evaluator-v1');
const { evaluateLite } = require('./evaluator-lite');
const {
  HAND_EVALUATOR_V1,
  HAND_EVALUATOR_LITE,
} = require('./policies');

function normalizeEvaluatorVersion (value) {
  return value === HAND_EVALUATOR_V1 ? HAND_EVALUATOR_V1 : HAND_EVALUATOR_LITE;
}

function evaluateHand (hand, options = {}) {
  const cards = hand == null ? [] : hand;
  const counts = validateHand(cards);
  const requestedVersion = normalizeEvaluatorVersion(options.evaluatorVersion);
  return requestedVersion === HAND_EVALUATOR_V1
    ? resultV1(cards)
    : evaluateLite(cards, counts);
}

function evaluateHandStrength (hand, options = {}) {
  return evaluateHand(hand, options).score;
}

module.exports = {
  evaluateHand,
  evaluateHandStrength,
  normalizeEvaluatorVersion,
  ...require('./policies'),
};
