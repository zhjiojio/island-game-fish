const test = require('node:test');
const assert = require('node:assert');
const { performance } = require('node:perf_hooks');
const { createDeck } = require('../cards');
const {
  evaluateHand,
  evaluateHandStrength,
  HAND_EVALUATOR_V1,
  HAND_EVALUATOR_LITE,
} = require('../game-ai/hand-strength');
const {
  HandStrengthRuntime,
  normalizeHandStrengthMode,
} = require('../game-ai/hand-strength/runtime');

function cards (...ranks) {
  const deck = createDeck();
  const used = new Set();
  return ranks.map(rank => {
    const card = deck.find(item => item.rank === rank && !used.has(item.id));
    used.add(card.id);
    return card;
  });
}

function legacyScore (hand) {
  const groups = new Map();
  for (const card of hand || []) groups.set(card.rank, (groups.get(card.rank) || 0) + 1);
  let score = 0;
  if (groups.has(16)) score += 2.2;
  if (groups.has(17)) score += 3;
  score += (groups.get(15) || 0) * 0.9;
  score += (groups.get(14) || 0) * 0.45;
  score += [...groups.values()].filter(count => count === 4).length * 4;
  score += [...groups.values()].filter(count => count === 3).length * 1.15;
  score += [...groups.values()].filter(count => count === 2).length * 0.32;
  score -= [...groups.entries()].filter(([rank, count]) => count === 1 && rank < 11).length * 0.2;
  return Math.max(0, Math.min(1, score / 14));
}

test('V1 保留旧公式作为紧急回滚', () => {
  const samples = [
    cards(3, 4, 5, 6, 7),
    cards(17, 16, 15, 15, 14, 14, 3, 3, 3, 3),
    cards(3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10),
  ];
  for (const hand of samples) {
    assert.strictEqual(evaluateHandStrength(hand, { evaluatorVersion: HAND_EVALUATOR_V1 }), legacyScore(hand));
    assert.strictEqual(evaluateHand(hand, { evaluatorVersion: HAND_EVALUATOR_V1 }).score, legacyScore(hand));
  }
});

test('牌力入口默认使用 Lite 并校验非法手牌且不修改输入', () => {
  const hand = cards(3, 4, 5, 6, 7);
  const snapshot = JSON.stringify(hand);
  assert.strictEqual(evaluateHand(hand).version, HAND_EVALUATOR_LITE);
  assert.strictEqual(JSON.stringify(hand), snapshot);
  assert.throws(() => evaluateHand([{ id: 'bad', rank: 18 }]), /invalid_rank/);
  assert.throws(() => evaluateHand([{ id: 'same', rank: 3 }, { id: 'same', rank: 4 }]), /duplicate_card_id/);
  assert.throws(() => evaluateHand([{ id: 'joker-a', rank: 16 }, { id: 'joker-b', rank: 16 }]), /invalid_rank_count/);
  assert.throws(() => evaluateHand([...createDeck().slice(0, 20), createDeck()[20]]), /too_many_cards/);
});

test('Lite 与花色、输入顺序无关且结果确定', () => {
  const first = cards(3, 3, 4, 4, 5, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17);
  const second = first.slice().reverse().map(card => ({ ...card, suit: `other-${card.suit}` }));
  assert.deepStrictEqual(evaluateHand(first), evaluateHand(second));
});

test('Lite 识别顺子、连对和飞机的一手结构', () => {
  const samples = [
    [cards(3, 4, 5, 6, 7, 8), 'straightCoverage'],
    [cards(3, 3, 4, 4, 5, 5), 'pairStraightCoverage'],
    [cards(3, 3, 3, 4, 4, 4), 'airplaneCoverage'],
    [cards(3, 3, 3, 4, 4, 4, 5, 6), 'airplaneCoverage'],
    [cards(3, 3, 3, 4, 4, 4, 5, 5, 6, 6), 'airplaneCoverage'],
  ];
  for (const [hand, coverage] of samples) {
    const result = evaluateHand(hand);
    assert.strictEqual(result.features.estimatedTurns, 1);
    assert.strictEqual(result.features[coverage], hand.length);
    assert.ok(result.score >= 0 && result.score <= 1);
  }
});

test('Lite 对完整结构的判断优于离散低牌', () => {
  const straight = evaluateHand(cards(3, 4, 5, 6, 7, 8));
  const loose = evaluateHand(cards(3, 5, 7, 9, 11, 13));
  assert.strictEqual(straight.features.weakLooseCards, 0);
  assert.strictEqual(straight.features.structuredCoverage, 1);
  assert.ok(straight.score > loose.score);
});

test('Lite 识别火箭、炸弹并保护控制牌', () => {
  const protectedResult = evaluateHand(cards(17, 16, 15, 15, 15, 15, 14, 14));
  assert.strictEqual(protectedResult.features.hasRocket, true);
  assert.strictEqual(protectedResult.features.bombCount, 1);
  assert.strictEqual(protectedResult.features.controlBreakPenalty, 0);
  assert.ok(protectedResult.features.controlPower >= 0.8);

  const brokenResult = evaluateHand(cards(3, 3, 3, 4, 4, 4, 16, 17));
  assert.strictEqual(brokenResult.features.estimatedTurns, 1);
  assert.strictEqual(brokenResult.features.controlBreakPenalty, 1);
});

test('Lite 固定运行八种贪心计划且不会预算降级', () => {
  const result = evaluateHand(cards(3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11));
  assert.strictEqual(result.version, HAND_EVALUATOR_LITE);
  assert.strictEqual(result.diagnostics.deterministic, true);
  assert.strictEqual(result.diagnostics.evaluatedPlans, 8);
  assert.strictEqual(result.diagnostics.fallbackApplied, false);
  assert.strictEqual(result.diagnostics.fallbackReason, null);
});

test('Lite 批量评估耗时受控', () => {
  const deck = createDeck();
  const hands = [];
  for (let index = 0; index < 500; index++) {
    const offset = index % deck.length;
    hands.push([...deck.slice(offset), ...deck.slice(0, offset)].slice(0, index % 2 ? 17 : 20));
  }
  const started = performance.now();
  for (const hand of hands) evaluateHand(hand);
  assert.ok(performance.now() - started < 1000);
});

test('牌力运行模式只接受 Lite 与 V1，默认启用 Lite', () => {
  assert.strictEqual(normalizeHandStrengthMode(), 'lite');
  assert.strictEqual(normalizeHandStrengthMode('lite'), 'lite');
  assert.strictEqual(normalizeHandStrengthMode('v1'), 'v1');
  assert.strictEqual(normalizeHandStrengthMode('v2'), 'lite');
  assert.strictEqual(normalizeHandStrengthMode('shadow'), 'lite');

  const room = {};
  new HandStrengthRuntime().configureRoom(room);
  assert.strictEqual(room.handStrengthMode, 'lite');
  assert.strictEqual(room.handEvaluatorVersion, HAND_EVALUATOR_LITE);
  assert.strictEqual(room.handPolicyVersion, 'bid-double-policy-lite');

  new HandStrengthRuntime({ mode: 'v1' }).configureRoom(room);
  assert.strictEqual(room.handStrengthMode, 'v1');
  assert.strictEqual(room.handEvaluatorVersion, HAND_EVALUATOR_V1);
  assert.strictEqual(room.handPolicyVersion, 'bid-double-policy-v1');
});
