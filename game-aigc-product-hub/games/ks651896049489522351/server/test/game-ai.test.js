const test = require('node:test');
const assert = require('node:assert');
const { createDeck } = require('../cards');
const { analyzePlay, canBeat } = require('../rules');
const { buildObservation } = require('../game-ai/observation');
const { enumerateLegalActions } = require('../game-ai/legal-actions');
const { decideAction, evaluateHandStrength } = require('../game-ai/strategy');
const { getPersona } = require('../game-ai/personas');
const { thinkingDelayMs, scheduleGuardedAction } = require('../bots/bot-scheduler');
const { createBot } = require('../bots/bot-factory');

function cards (...ranks) {
  const deck = createDeck();
  const used = new Set();
  return ranks.map(rank => {
    const card = deck.find(item => item.rank === rank && !used.has(item.id));
    used.add(card.id);
    return card;
  });
}

function roomFor (hand, options = {}) {
  const other1 = cards(3, 4, 5);
  const other2 = cards(6, 7, 8);
  return {
    phase: options.phase || 'playing',
    players: {
      bot: { id: 'bot', seat: 0, role: options.role || 'farmer' },
      p1: { id: 'p1', seat: 1, role: options.p1Role || 'farmer' },
      p2: { id: 'p2', seat: 2, role: options.p2Role || 'landlord' },
    },
    seats: ['bot', 'p1', 'p2'],
    dealer: 'p2',
    hands: { bot: hand, p1: other1, p2: other2 },
    handCounts: { bot: hand.length, p1: options.p1Count || 8, p2: options.p2Count || 10 },
    currentPlayerId: 'bot',
    bidState: options.bidState || null,
    lastPlay: options.lastPlay || null,
    landlordCardsVisible: [],
    round: { multiplier: 1 },
    roundNo: 1,
    autoActionSeq: 1,
  };
}

test('安全观察只包含自己的手牌，不包含其他玩家 hands/accountId/ws', () => {
  const room = roomFor(cards(3, 3, 4, 5, 6));
  room.players.p1.accountId = 'secret-account';
  room.players.p1.ws = { secret: true };
  room.hands.p1 = [{ id: 'opponent-private-card-sentinel', suit: 'hidden', rank: 17, label: 'hidden' }];
  const observation = buildObservation(room, 'bot');
  const text = JSON.stringify(observation);
  assert.strictEqual(observation.self.hand.length, 5);
  assert.strictEqual(text.includes('secret-account'), false);
  assert.strictEqual(text.includes('secret'), false);
  assert.strictEqual(text.includes(otherCardId(room.hands.p1)), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(observation.publicState, 'hands'), false);
});

function otherCardId (hand) {
  return hand[0].id;
}

test('所有生成的出牌候选都通过现有 analyzePlay/canBeat 校验', () => {
  const hand = cards(3, 3, 3, 4, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 15, 16, 17);
  const previousCards = cards(4, 4);
  const room = roomFor(hand, {
    lastPlay: { playerId: 'p2', cards: previousCards, analysis: analyzePlay(previousCards) },
  });
  const observation = buildObservation(room, 'bot');
  const actions = enumerateLegalActions(observation);
  assert.ok(actions.length > 1);
  for (const action of actions) {
    if (action.type === 'pass') continue;
    const selected = hand.filter(card => action.cardIds.includes(card.id));
    const analysis = analyzePlay(selected);
    assert.ok(analysis, `候选必须是合法牌型: ${action.cardIds.join(',')}`);
    assert.ok(canBeat(analysis, room.lastPlay.analysis), `候选必须能压过前手: ${analysis.type}`);
  }
});

test('策略能识别一手走完并且关键残局不应用失误', () => {
  const hand = cards(7, 7, 7);
  const observation = buildObservation(roomFor(hand), 'bot');
  const action = decideAction(observation, {
    personaId: 'aggressive', profileId: 'bot_solo_fill', rng: () => 0,
  });
  assert.strictEqual(action.type, 'playCards');
  assert.strictEqual(action.cardIds.length, 3);
  assert.strictEqual(action.meta.mistakeApplied, false);
});

test('农民面对队友前手时优先保护队友而不是无意义压牌', () => {
  const hand = cards(6, 9, 12);
  const previousCards = cards(5);
  const observation = buildObservation(roomFor(hand, {
    p1Count: 3,
    p2Count: 8,
    lastPlay: { playerId: 'p1', cards: previousCards, analysis: analyzePlay(previousCards) },
  }), 'bot');
  const action = decideAction(observation, {
    personaId: 'balanced', profileId: 'bot_duo_fill', rng: () => 0.99,
  });
  assert.strictEqual(action.type, 'pass');
});

test('叫分依据自身牌力且不会叫低于当前最高分', () => {
  const strong = cards(17, 16, 15, 15, 15, 15, 14, 14, 14, 13, 13, 12, 12, 11, 10, 9, 8);
  const weak = cards(3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 3, 4, 5, 6, 7, 8);
  assert.ok(evaluateHandStrength(strong) > evaluateHandStrength(weak));

  const strongRoom = roomFor(strong, {
    phase: 'bidding', bidState: { currentPlayerId: 'bot', highestScore: 2, turns: 1, passed: [] },
  });
  const action = decideAction(buildObservation(strongRoom, 'bot'), {
    personaId: 'balanced', profileId: 'bot_duo_fill', rng: () => 0.99,
  });
  assert.ok(action.score === 0 || action.score === 1);
  assert.strictEqual(action.meta.handEvaluatorVersion, 'hand-strength-lite');
  assert.strictEqual(action.meta.handPolicyVersion, 'bid-double-policy-lite');
});

test('Lite 叫抢与加倍返回版本化诊断且保持动作协议', () => {
  const strong = cards(17, 16, 15, 15, 15, 15, 14, 14, 14, 13, 13, 12, 12, 11, 10, 9, 8);
  const biddingRoom = roomFor(strong, {
    phase: 'bidding',
    bidState: { currentPlayerId: 'bot', highestScore: 0, phase: 'calling', turns: 0, passed: [] },
  });
  const bid = decideAction(buildObservation(biddingRoom, 'bot'), {
    personaId: 'balanced', profileId: 'bot_duo_fill', rng: () => 0.99,
  });
  assert.ok([0, 1].includes(bid.score));
  assert.strictEqual(bid.meta.handEvaluatorVersion, 'hand-strength-lite');
  assert.strictEqual(bid.meta.handPolicyVersion, 'bid-double-policy-lite');
  assert.ok(Number.isInteger(bid.meta.handStrengthFeatures.estimatedTurns));

  const doublingRoom = roomFor(strong, { phase: 'doubling', role: 'landlord' });
  doublingRoom.doublingPlayerId = 'bot';
  const double = decideAction(buildObservation(doublingRoom, 'bot'), {
    personaId: 'balanced', profileId: 'bot_duo_fill', rng: () => 0.99,
  });
  assert.ok([1, 2, 4].includes(double.multiplier));
  assert.strictEqual(double.meta.handEvaluatorVersion, 'hand-strength-lite');
});

test('显式 V1 回滚同时切换评估器和策略', () => {
  const hand = cards(3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11);
  const room = roomFor(hand, {
    phase: 'bidding',
    bidState: { currentPlayerId: 'bot', highestScore: 0, phase: 'calling', turns: 0, passed: [] },
  });
  const action = decideAction(buildObservation(room, 'bot'), {
    personaId: 'balanced', profileId: 'bot_duo_fill', rng: () => 0.99,
    handEvaluatorVersion: 'hand-strength-v1',
    handPolicyVersion: 'bid-double-policy-v1',
  });
  assert.strictEqual(action.meta.handEvaluatorVersion, 'hand-strength-v1');
  assert.strictEqual(action.meta.handEvaluatorRequestedVersion, 'hand-strength-v1');
  assert.strictEqual(action.meta.handPolicyVersion, 'bid-double-policy-v1');
  assert.strictEqual(action.meta.handPolicyRequestedVersion, 'bid-double-policy-v1');
});

test('Evaluator 与 Policy 版本可以独立选择', () => {
  const hand = cards(3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 3, 4);
  const room = roomFor(hand, {
    phase: 'bidding',
    bidState: { currentPlayerId: 'bot', highestScore: 0, phase: 'calling', turns: 0, passed: [] },
  });
  const action = decideAction(buildObservation(room, 'bot'), {
    personaId: 'balanced', profileId: 'bot_duo_fill', rng: () => 0.99,
    handEvaluatorVersion: 'hand-strength-lite',
    handPolicyVersion: 'bid-double-policy-v1',
  });
  assert.strictEqual(action.meta.handEvaluatorVersion, 'hand-strength-lite');
  assert.strictEqual(action.meta.handPolicyVersion, 'bid-double-policy-v1');
});

test('未知叫抢阶段采用保守决策', () => {
  const hand = cards(17, 16, 15, 15, 15, 15, 14, 14, 14, 13, 13, 12, 12, 11, 10, 9, 8);
  const room = roomFor(hand, {
    phase: 'bidding',
    bidState: { currentPlayerId: 'bot', highestScore: 0, phase: 'unknown', turns: 0, passed: [] },
  });
  const action = decideAction(buildObservation(room, 'bot'), {
    personaId: 'balanced', profileId: 'bot_duo_fill', rng: () => 0.99,
  });
  assert.strictEqual(action.score, 0);
});

test('思考延迟落在硬上限内且人格速度产生差异', () => {
  const observation = buildObservation(roomFor(cards(3, 4, 5, 6, 7, 8, 9)), 'bot');
  const fast = thinkingDelayMs(observation, { type: 'playCards' }, getPersona('aggressive'), () => 0.5);
  const slow = thinkingDelayMs(observation, { type: 'playCards' }, getPersona('cautious'), () => 0.5);
  assert.ok(fast >= 350 && fast <= 6000);
  assert.ok(slow >= 350 && slow <= 6000);
  assert.ok(slow > fast);
});

test('代际校验阻止过期机器人定时任务执行', async () => {
  const room = roomFor(cards(3));
  let callback;
  let executed = false;
  scheduleGuardedAction({
    room, playerId: 'bot', seq: 1, phase: 'playing', delayMs: 1,
    setTimer: fn => { callback = fn; return 1; },
    execute: async () => { executed = true; },
  });
  room.autoActionSeq = 2;
  await callback();
  assert.strictEqual(executed, false);
});

test('机器人身份使用保留前缀且不会复用同房昵称、人格', () => {
  const first = createBot({ minimumBeans: 1000, rng: () => 0.1 });
  const second = createBot({
    minimumBeans: 1000,
    usedNames: [first.name], usedAvatars: [first.avatarUrl], excludedPersonaIds: [first.personaId],
    rng: () => 0.1,
  });
  assert.ok(first.id.startsWith('bot::'));
  assert.strictEqual(first.autoManaged, false);
  assert.strictEqual(first.connected, true);
  assert.notStrictEqual(second.name, first.name);
  assert.notStrictEqual(second.personaId, first.personaId);
});
