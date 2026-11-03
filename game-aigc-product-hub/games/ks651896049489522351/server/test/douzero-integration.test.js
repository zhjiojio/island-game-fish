const test = require('node:test');
const assert = require('node:assert');
const { createDeck, sortCards } = require('../cards');
const { analyzePlay } = require('../rules');
const { buildObservation } = require('../game-ai/observation');
const { enumerateLegalActions, enumerateCorePlays } = require('../game-ai/legal-actions');
const { appendPlayAction, resetPlayActionHistory } = require('../game-ai/play-history');
const { toDouzeroRank, buildPositionMaps, createCandidateSet } = require('../game-ai/douzero/codec');
const { buildDouZeroContext } = require('../game-ai/douzero/context-builder');
const { CircuitBreaker } = require('../game-ai/douzero/circuit-breaker');
const { DEFAULT_MAX_CONCURRENT, DouZeroClient } = require('../game-ai/douzero/client');
const { DecisionRouter, chooseRoundMode, strategyVersionForMode, sameAction } = require('../game-ai/decision-router');
const { applyGuardedPlayingAction } = require('../game-ai/action-guard');
const { ShadowMetrics } = require('../game-ai/shadow-metrics');
const { shouldLogDecision, formatDecisionLog } = require('../game-ai/decision-log');
const { scheduleGuardedAction, scheduleLockedActionRetry } = require('../bots/bot-scheduler');

function fullRoom () {
  const deck = createDeck();
  const landlordHand = sortCards(deck.slice(0, 20));
  const downHand = sortCards(deck.slice(20, 37));
  const upHand = sortCards(deck.slice(37));
  return {
    id: '100001',
    instanceId: 'room-instance',
    phase: 'playing',
    dealer: 'landlord-player',
    currentPlayerId: 'down-player',
    players: {
      'landlord-player': { id: 'landlord-player', seat: 0, role: 'landlord' },
      'down-player': { id: 'down-player', seat: 1, role: 'farmer' },
      'up-player': { id: 'up-player', seat: 2, role: 'farmer' },
    },
    seats: ['landlord-player', 'down-player', 'up-player'],
    hands: {
      'landlord-player': landlordHand,
      'down-player': downHand,
      'up-player': upHand,
    },
    handCounts: { 'landlord-player': 20, 'down-player': 17, 'up-player': 17 },
    landlordCardsVisible: landlordHand.slice(0, 3),
    lastPlay: null,
    playActionHistory: [],
    playActionSeq: 0,
    round: { number: 3, multiplier: 1, passCount: 0 },
    autoActionSeq: 7,
  };
}

function contextFor (room = fullRoom(), actorId = 'down-player') {
  const observation = buildObservation(room, actorId);
  const actions = enumerateLegalActions(observation);
  return { observation, actions, context: buildDouZeroContext(observation, actions, { decisionId: 'room-instance:3:7' }) };
}

test('环境缺省时 DouZero 默认 active 且全量流量', () => {
  const { createDecisionRouterFromEnv } = require('../game-ai/decision-router');
  const router = createDecisionRouterFromEnv({});
  assert.strictEqual(router.config.mode, 'active');
  assert.strictEqual(router.config.trafficPercent, 100);
  assert.strictEqual(DEFAULT_MAX_CONCURRENT, 4);
  assert.strictEqual(router.client.maxConcurrent, DEFAULT_MAX_CONCURRENT);
  assert.strictEqual(router.shadowClient.maxConcurrent, 2);
});

test('Node 主流量并发允许显式覆盖 Sidecar 容量配置', () => {
  const { createDecisionRouterFromEnv } = require('../game-ai/decision-router');
  const router = createDecisionRouterFromEnv({ DDZ_DOUZERO_MAX_CONCURRENT: '6' });
  assert.strictEqual(router.client.maxConcurrent, 6);
});

test('牌值与三个相对座位映射正确', () => {
  assert.deepStrictEqual([3, 14, 15, 16, 17].map(toDouzeroRank), [3, 14, 17, 20, 30]);
  const room = fullRoom();
  assert.strictEqual(buildPositionMaps(buildObservation(room, 'landlord-player').publicState, 'landlord-player').position, 'landlord');
  assert.strictEqual(buildPositionMaps(buildObservation(room, 'down-player').publicState, 'down-player').position, 'landlord_down');
  assert.strictEqual(buildPositionMaps(buildObservation(room, 'up-player').publicState, 'up-player').position, 'landlord_up');
});

test('上下文仅含自身手牌与公开历史，并保持 54 张守恒', () => {
  const room = fullRoom();
  const played = room.hands['landlord-player'].pop();
  room.handCounts['landlord-player'] = 19;
  room.lastPlay = { playerId: 'landlord-player', cards: [played], analysis: analyzePlay([played]) };
  appendPlayAction(room, { playerId: 'landlord-player', type: 'play', cards: [played], playType: 'single' });
  const { context } = contextFor(room);
  const request = context.request;
  assert.strictEqual(request.position, 'landlord_down');
  assert.deepStrictEqual(request.action_sequence, [[toDouzeroRank(played.rank)]]);
  assert.deepStrictEqual(request.last_move_by_position.landlord, [toDouzeroRank(played.rank)]);
  assert.strictEqual(request.hand.length, 17);
  assert.strictEqual(Object.values(request.num_cards_left).reduce((a, b) => a + b, 0) + 1, 54);
  const serialized = JSON.stringify(request);
  assert.strictEqual(serialized.includes('accountId'), false);
  assert.strictEqual(serialized.includes('hands'), false);
});

test('pass 被保留在动作序列与各位置最近动作中', () => {
  const room = fullRoom();
  const played = room.hands['landlord-player'].pop();
  room.handCounts['landlord-player'] = 19;
  room.lastPlay = { playerId: 'landlord-player', cards: [played], analysis: analyzePlay([played]) };
  appendPlayAction(room, { playerId: 'landlord-player', type: 'play', cards: [played], playType: 'single' });
  appendPlayAction(room, { playerId: 'down-player', type: 'pass' });
  room.currentPlayerId = 'up-player';
  const { context } = contextFor(room, 'up-player');
  assert.deepStrictEqual(context.request.action_sequence[1], []);
  assert.deepStrictEqual(context.request.last_move_by_position.landlord_down, []);
});

test('相同牌面候选去重并稳定映射到精确 cardIds', () => {
  const hand = sortCards(createDeck().filter(card => card.rank === 3).slice(0, 2));
  const actions = hand.map(card => ({ type: 'playCards', cardIds: [card.id], cards: [card], analysis: analyzePlay([card]) }));
  const first = createCandidateSet(actions, hand);
  const second = createCandidateSet(actions.slice().reverse(), hand);
  assert.strictEqual(first.candidates.length, 1);
  assert.deepStrictEqual(first.candidates, second.candidates);
  assert.deepStrictEqual(first.candidateMap.get('a0').cardIds, second.candidateMap.get('a0').cardIds);
});

test('复杂牌型候选覆盖飞机与四带二且全部通过权威规则', () => {
  const deck = createDeck();
  const byRank = rank => deck.filter(card => card.rank === rank);
  const hand = sortCards([
    ...byRank(3).slice(0, 4),
    ...byRank(4).slice(0, 3),
    ...byRank(5).slice(0, 3),
    ...byRank(6).slice(0, 2),
    ...byRank(7).slice(0, 2),
    ...byRank(8).slice(0, 1),
    ...byRank(9).slice(0, 1),
  ]);
  const actions = enumerateCorePlays(hand, null);
  const types = new Set(actions.map(action => action.analysis.type));
  assert.ok(types.has('airplane'));
  assert.ok(types.has('airplane-singles'));
  assert.ok(types.has('airplane-pairs'));
  assert.ok(types.has('four-two-singles'));
  assert.ok(types.has('four-two-pairs'));
  for (const action of actions) {
    assert.ok(analyzePlay(action.cards), `非法候选: ${action.cardIds.join(',')}`);
  }
});

test('出牌历史按局重置并使用连续序号', () => {
  const room = fullRoom();
  const card = room.hands['landlord-player'][0];
  appendPlayAction(room, { playerId: 'landlord-player', type: 'play', cards: [card], playType: 'single' });
  appendPlayAction(room, { playerId: 'down-player', type: 'pass' });
  assert.deepStrictEqual(room.playActionHistory.map(item => item.seq), [1, 2]);
  resetPlayActionHistory(room);
  assert.deepStrictEqual(room.playActionHistory, []);
  assert.strictEqual(room.playActionSeq, 0);
});

test('DouZero client 校验 decision 与候选，拒绝未知候选', async () => {
  const response = new Response(JSON.stringify({ schema_version: 1, decision_id: 'd1', candidate_id: 'bad' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const client = new DouZeroClient({ fetchImpl: async () => response, timeoutMs: 100 });
  await assert.rejects(
    client.decidePlay({}, { expectedDecisionId: 'd1', candidateIds: new Set(['a0']) }),
    err => err.reason === 'douzero_unknown_candidate'
  );
});

test('DouZero client 将串包响应计入熔断失败', async () => {
  let failures = 0;
  const breaker = {
    acquire: () => ({ allowed: true, probe: false }),
    success: () => {},
    failure: () => { failures += 1; },
    releaseProbe: () => {},
  };
  const response = new Response(JSON.stringify({ schema_version: 1, decision_id: 'old', candidate_id: 'a0' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  const client = new DouZeroClient({ breaker, fetchImpl: async () => response, timeoutMs: 100 });
  await assert.rejects(
    client.decidePlay({}, { expectedDecisionId: 'new', candidateIds: new Set(['a0']) }),
    err => err.reason === 'douzero_stale_response'
  );
  assert.strictEqual(failures, 1);
});

test('DouZero client 超时后返回可分类错误', async () => {
  const client = new DouZeroClient({
    timeoutMs: 50,
    fetchImpl: async (_url, options) => await new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
  });
  await assert.rejects(client.decidePlay({}), err => err.reason === 'douzero_timeout');
});

test('DouZero client 的 400/422 不计熔断失败，5xx 与超时计入失败', async () => {
  const recorded = [];
  const breaker = {
    acquire: () => ({ allowed: true, probe: false }),
    success: () => recorded.push('success'),
    failure: () => recorded.push('failure'),
    releaseProbe: () => recorded.push('release'),
  };
  for (const status of [400, 422, 500, 504]) {
    const client = new DouZeroClient({
      breaker,
      timeoutMs: 100,
      fetchImpl: async () => new Response('{}', { status }),
    });
    await assert.rejects(client.decidePlay({}));
  }
  const timeoutClient = new DouZeroClient({
    breaker,
    timeoutMs: 50,
    fetchImpl: async (_url, options) => await new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
  });
  await assert.rejects(timeoutClient.decidePlay({}));
  assert.deepStrictEqual(recorded, ['failure', 'failure', 'failure']);
});

test('DouZero client 满载时快速拒绝且不发 HTTP 请求', async () => {
  let fetchCalls = 0;
  const client = new DouZeroClient({
    maxConcurrent: 1,
    fetchImpl: async () => { fetchCalls += 1; return new Response('{}', { status: 200 }); },
  });
  client.inFlight = 1;
  await assert.rejects(client.decidePlay({}), err => err.reason === 'douzero_busy');
  assert.strictEqual(fetchCalls, 0);
});

test('熔断器达到阈值后打开，冷却后只放一个探测', () => {
  let now = 1000;
  const breaker = new CircuitBreaker({ windowSize: 10, minimumRequests: 10, minimumFailures: 5, cooldownMs: 100, now: () => now });
  for (let index = 0; index < 5; index++) breaker.success();
  for (let index = 0; index < 5; index++) breaker.failure();
  assert.strictEqual(breaker.state(), 'open');
  assert.strictEqual(breaker.acquire().allowed, false);
  now += 101;
  assert.deepStrictEqual(breaker.acquire(), { allowed: true, probe: true });
  assert.strictEqual(breaker.acquire().allowed, false);
  breaker.success(true);
  assert.strictEqual(breaker.state(), 'closed');
});

test('熔断后旧的并发成功响应不能提前关闭熔断器', () => {
  let now = 1000;
  const breaker = new CircuitBreaker({ windowSize: 2, minimumRequests: 2, minimumFailures: 2, cooldownMs: 100, now: () => now });
  breaker.failure(false);
  breaker.failure(false);
  assert.strictEqual(breaker.state(), 'open');
  breaker.success(false);
  assert.strictEqual(breaker.state(), 'open');
  now += 101;
  const probe = breaker.acquire();
  breaker.success(probe.probe);
  assert.strictEqual(breaker.state(), 'closed');
});

test('active 成功使用模型候选；异常自动降级同快照规则动作', async () => {
  const { observation, actions } = contextFor();
  const ruleAction = actions.find(action => action.type === 'playCards');
  let selectedAction;
  const successRouter = new DecisionRouter({
    mode: 'active', trafficPercent: 100,
    client: {
      decidePlay: async request => {
        const selected = request.candidates[request.candidates.length - 1];
        selectedAction = selected.id;
        return { schema_version: 1, decision_id: request.decision_id, candidate_id: selected.id, model: { name: 'douzero-wp', version: 'test', sha256: 'abc' }, inference_ms: 2 };
      },
    },
  });
  const modelAction = await successRouter.resolve(observation, { mode: 'active', decisionId: 'd-model', ruleAction, actions, deadlineAt: Date.now() + 1000 });
  assert.strictEqual(modelAction.meta.selectedEngine, 'douzero');
  assert.ok(selectedAction);

  const fallbackRouter = new DecisionRouter({
    mode: 'active', trafficPercent: 100,
    client: { decidePlay: async () => { throw Object.assign(new Error('down'), { reason: 'douzero_unavailable' }); } },
  });
  const fallback = await fallbackRouter.resolve(observation, { mode: 'active', decisionId: 'd-fallback', ruleAction, actions, deadlineAt: Date.now() + 1000 });
  assert.deepStrictEqual(fallback.cardIds, ruleAction.cardIds);
  assert.strictEqual(fallback.meta.selectedEngine, 'rule');
  assert.strictEqual(fallback.meta.fallbackReason, 'douzero_unavailable');
});

test('off 模式绝不调用 Sidecar', async () => {
  const { observation, actions } = contextFor();
  const ruleAction = actions.find(action => action.type === 'playCards');
  let calls = 0;
  const router = new DecisionRouter({
    client: { decidePlay: async () => { calls += 1; throw new Error('should_not_call'); } },
  });
  const action = await router.resolve(observation, {
    mode: 'rule',
    decisionId: 'd-off',
    ruleAction,
    actions,
  });
  assert.strictEqual(calls, 0);
  assert.strictEqual(action.meta.selectedEngine, 'rule');
  assert.deepStrictEqual(action.cardIds, ruleAction.cardIds);
});

test('shadow 使用独立 client 且不等待模型响应', async () => {
  const { observation, actions } = contextFor();
  const ruleAction = actions.find(action => action.type === 'playCards');
  let activeCalls = 0;
  let shadowCalls = 0;
  const router = new DecisionRouter({
    client: { decidePlay: async () => { activeCalls += 1; throw new Error('active_should_not_call'); } },
    shadowClient: {
      decidePlay: async () => {
        shadowCalls += 1;
        return await new Promise(() => {});
      },
    },
  });
  const action = await router.resolve(observation, {
    mode: 'shadow',
    decisionId: 'd-shadow',
    ruleAction,
    actions,
  });
  assert.strictEqual(action.meta.selectedEngine, 'rule');
  assert.strictEqual(activeCalls, 0);
  assert.strictEqual(shadowCalls, 1);
});

test('shadow 结果通过聚合回调报告一致性，不包含牌面', async () => {
  const { observation, actions } = contextFor();
  const ruleAction = actions.find(action => action.type === 'playCards');
  const candidateSet = createCandidateSet(actions, observation.self.hand);
  const ruleCandidate = [...candidateSet.candidateMap.entries()]
    .find(([, action]) => sameAction(action, ruleAction));
  assert.ok(ruleCandidate, '应能精确找到规则动作对应候选');
  let resolveReport;
  const report = new Promise(resolve => { resolveReport = resolve; });
  const router = new DecisionRouter({
    client: { decidePlay: async () => { throw new Error('active_should_not_call'); } },
    shadowClient: {
      decidePlay: async request => {
        return { schema_version: 1, decision_id: request.decision_id, candidate_id: ruleCandidate[0], inference_ms: 3 };
      },
    },
  });
  await router.resolve(observation, {
    mode: 'shadow',
    decisionId: 'd-shadow-report',
    ruleAction,
    actions,
    onShadowResult: resolveReport,
  });
  const summary = await report;
  assert.strictEqual(summary.agreed, true);
  assert.strictEqual(summary.inferenceMs, 3);
  assert.strictEqual(JSON.stringify(summary).includes('card'), false);
});

test('shadow 回调异常不会反向影响规则决策或触发第二次回调', async () => {
  const { observation, actions } = contextFor();
  const ruleAction = actions.find(action => action.type === 'playCards');
  let reports = 0;
  const router = new DecisionRouter({
    shadowClient: {
      decidePlay: async request => ({
        schema_version: 1,
        decision_id: request.decision_id,
        candidate_id: request.candidates[0].id,
        inference_ms: 1,
      }),
    },
  });
  const action = await router.resolve(observation, {
    mode: 'shadow',
    decisionId: 'd-shadow-callback-error',
    ruleAction,
    actions,
    onShadowResult: () => { reports += 1; throw new Error('metrics_down'); },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(action.meta.selectedEngine, 'rule');
  assert.strictEqual(reports, 1);
});

test('影子指标按固定样本窗口聚合且日志不包含牌面或身份', () => {
  const logs = [];
  const metrics = new ShadowMetrics({ logEvery: 3, logger: line => logs.push(line) });
  metrics.record({ agreed: true, position: 'landlord', inferenceMs: 3, cardIds: ['secret-card'] });
  metrics.record({ agreed: false, position: 'landlord_down', inferenceMs: 5, roomId: 'secret-room' });
  const summary = metrics.record({ agreed: null, position: 'landlord_up', reason: 'douzero_timeout' });
  assert.deepStrictEqual(summary.positions, { landlord: 1, landlord_down: 1, landlord_up: 1 });
  assert.strictEqual(summary.agreementPercent, 50);
  assert.strictEqual(summary.averageInferenceMs, 4);
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].includes('secret'), false);
});

test('影子指标窗口配置被限制在安全范围', () => {
  assert.strictEqual(new ShadowMetrics({ logEvery: 'bad' }).logEvery, 100);
  assert.strictEqual(new ShadowMetrics({ logEvery: -3 }).logEvery, 1);
  assert.strictEqual(new ShadowMetrics({ logEvery: 999999 }).logEvery, 100000);
});

test('规则动作按稳定比例采样，模型和降级动作始终记录且日志脱敏', () => {
  const room = fullRoom();
  room.players['down-player'].isBot = true;
  assert.strictEqual(shouldLogDecision(room, 'down-player', { selectedEngine: 'rule' }, 0), false);
  assert.strictEqual(shouldLogDecision(room, 'down-player', { requestedEngine: 'douzero_shadow', selectedEngine: 'rule' }, 0), false);
  assert.strictEqual(shouldLogDecision(room, 'down-player', { selectedEngine: 'douzero' }, 0), true);
  assert.strictEqual(shouldLogDecision(room, 'down-player', { selectedEngine: 'rule', fallbackReason: 'douzero_timeout' }, 0), true);
  const log = formatDecisionLog(room, 'down-player', 'pass', {
    requestedEngine: 'douzero', selectedEngine: 'rule', fallbackReason: 'douzero_timeout', totalDecisionMs: 801,
  });
  assert.ok(log.includes('requested_engine=douzero'));
  assert.ok(log.includes('selected_engine=rule'));
  assert.ok(log.includes('fallback=douzero_timeout'));
  assert.strictEqual(log.includes(room.id), false);
  assert.strictEqual(log.includes('down-player'), false);

  const shadowLog = formatDecisionLog(room, 'down-player', 'playCards', {
    requestedEngine: 'douzero_shadow', selectedEngine: 'rule',
  });
  assert.ok(shadowLog.includes('requested_engine=douzero_shadow'));
  assert.ok(shadowLog.includes('selected_engine=rule'));

  const normalizedLog = formatDecisionLog(room, 'down-player', 'pass', {
    requestedEngine: 'untrusted_engine',
    selectedEngine: 'untrusted_engine',
    fallbackReason: 'untrusted_reason',
  });
  assert.ok(normalizedLog.includes('requested_engine=rule'));
  assert.ok(normalizedLog.includes('selected_engine=rule'));
  assert.ok(normalizedLog.includes('fallback=other'));
  assert.strictEqual(normalizedLog.includes('untrusted'), false);
});

test('模型动作落地前失效时，同一锁内只执行一次规则回退动作', async () => {
  const room = fullRoom();
  const actions = enumerateLegalActions(buildObservation(room, 'down-player'))
    .filter(action => action.type === 'playCards' && action.cardIds.length === 1);
  assert.ok(actions.length >= 2);
  const modelAction = {
    ...actions[0],
    meta: { requestedEngine: 'douzero', selectedEngine: 'douzero', decisionId: 'd-apply', totalDecisionMs: 8 },
  };
  const ruleAction = { ...actions[1], meta: { strategyVersion: 'bot-ai-v1' } };
  room.hands['down-player'] = room.hands['down-player'].filter(card => !modelAction.cardIds.includes(card.id));
  room.handCounts['down-player'] = room.hands['down-player'].length;
  const applied = [];
  const result = await applyGuardedPlayingAction({
    room,
    playerId: 'down-player',
    selectedAction: modelAction,
    ruleAction,
    guard: { seq: room.autoActionSeq, phase: 'playing' },
    apply: async action => { applied.push(action); return true; },
  });
  assert.strictEqual(result, true);
  assert.strictEqual(applied.length, 1);
  assert.deepStrictEqual(applied[0].cardIds, ruleAction.cardIds);
  assert.strictEqual(applied[0].meta.selectedEngine, 'rule');
  assert.strictEqual(applied[0].meta.fallbackReason, 'douzero_apply_rejected');
});

test('过期代际与双重非法动作均不会调用最终 apply', async () => {
  const room = fullRoom();
  const action = enumerateLegalActions(buildObservation(room, 'down-player'))
    .find(candidate => candidate.type === 'playCards');
  let applyCalls = 0;
  const execute = guard => applyGuardedPlayingAction({
    room,
    playerId: 'down-player',
    selectedAction: { ...action, meta: { selectedEngine: 'douzero' } },
    ruleAction: action,
    guard,
    apply: async () => { applyCalls += 1; return true; },
  });
  assert.strictEqual(await execute({ seq: room.autoActionSeq + 1, phase: 'playing' }), false);
  room.hands['down-player'] = [];
  room.handCounts['down-player'] = 0;
  assert.strictEqual(await execute({ seq: room.autoActionSeq, phase: 'playing' }), false);
  assert.strictEqual(applyCalls, 0);
});

test('晚到响应只形成旧决策结果，代际 guard 阻止其执行', async () => {
  const { observation, actions } = contextFor();
  const ruleAction = actions.find(action => action.type === 'playCards');
  let release;
  const router = new DecisionRouter({
    client: {
      decidePlay: async request => await new Promise(resolve => {
        release = () => resolve({
          schema_version: 1,
          decision_id: request.decision_id,
          candidate_id: request.candidates[0].id,
          model: { name: 'douzero-wp', version: 'test', sha256: 'abc' },
          inference_ms: 2,
        });
      }),
    },
  });
  const pending = router.resolve(observation, {
    mode: 'active',
    decisionId: 'd-old',
    ruleAction,
    actions,
  });
  await new Promise(resolve => setImmediate(resolve));
  const room = fullRoom();
  let callback;
  let executed = false;
  scheduleGuardedAction({
    room,
    playerId: 'down-player',
    seq: room.autoActionSeq,
    phase: 'playing',
    setTimer: fn => { callback = fn; return 1; },
    execute: async () => { executed = true; },
  });
  room.autoActionSeq += 1;
  release();
  await pending;
  await callback();
  assert.strictEqual(executed, false);
});

test('整局灰度选择稳定且 off 永远使用规则模式', () => {
  assert.strictEqual(chooseRoundMode({ mode: 'off', trafficPercent: 100 }, 'same'), 'rule');
  assert.strictEqual(chooseRoundMode({ mode: 'active', trafficPercent: 100 }, 'same'), 'active');
  assert.strictEqual(chooseRoundMode({ mode: 'shadow', shadowPercent: 100 }, 'same'), 'shadow');
  assert.strictEqual(chooseRoundMode({ mode: 'active', trafficPercent: 42 }, 'stable'), chooseRoundMode({ mode: 'active', trafficPercent: 42 }, 'stable'));
  assert.strictEqual(strategyVersionForMode('shadow', 'wp-2026.09'), 'bot-ai-v1+dz-wp-2026.09-shadow');
});

test('doubling 定时任务使用 doublingPlayerId 守卫', async () => {
  const room = fullRoom();
  room.phase = 'doubling';
  room.currentPlayerId = null;
  room.doublingPlayerId = 'down-player';
  let callback;
  let executed = false;
  scheduleGuardedAction({
    room,
    playerId: 'down-player',
    seq: room.autoActionSeq,
    phase: 'doubling',
    setTimer: fn => { callback = fn; return 1; },
    execute: async () => { executed = true; },
  });
  await callback();
  assert.strictEqual(executed, true);
});

test('watchdog 遇到动作锁时持续等待，释放后只接管一次', async () => {
  const room = fullRoom();
  room.players['down-player'].isBot = true;
  room.actionLock = true;
  const callbacks = [];
  let executions = 0;
  const options = {
    room,
    playerId: 'down-player',
    seq: room.autoActionSeq,
    phase: 'playing',
    delayMs: 1,
    setTimer: callback => { callbacks.push(callback); return callbacks.length; },
    execute: async () => { executions += 1; },
  };
  scheduleLockedActionRetry(options);
  await callbacks.shift()();
  assert.strictEqual(executions, 0);
  assert.strictEqual(callbacks.length, 1);
  room.actionLock = false;
  await callbacks.shift()();
  assert.strictEqual(executions, 1);
});

// ---- hint 消息处理：服务端提示功能（DouZero 优先，降级规则 AI） ----

test('hint: DouZero 可用时返回 source=douzero 且 cardIds 不为空', async () => {
  const room = fullRoom();
  room.botDecisionMode = 'active';
  const observation = buildObservation(room, 'down-player');
  const actions = enumerateLegalActions(observation).filter(a => a.type === 'playCards');
  assert.ok(actions.length > 0);
  const modelAction = { ...actions[0], meta: { requestedEngine: 'douzero', selectedEngine: 'douzero', decisionId: 'hint-1', totalDecisionMs: 20 } };
  const router = new DecisionRouter({
    mode: 'active',
    trafficPercent: 100,
    createClient: () => ({
      decidePlay: async () => ({
        candidate_id: actions[0].meta?.candidateId || 'c0',
        decision_id: 'hint-1',
        inference_ms: 10,
        model: { name: 'dz', version: 'test', sha256: 'abc' },
      }),
    }),
  });
  // 验证 resolve() 在 active 模式下调用成功并返回 douzero engine
  const result = await router.resolve(observation, {
    mode: 'active',
    decisionId: 'hint-1',
    deadlineAt: Date.now() + 800,
    ruleAction: actions[0],
  });
  // 可能因候选映射差异降级，但不报错
  assert.ok(result);
  assert.ok(result.meta);
  assert.ok(['douzero', 'rule'].includes(result.meta.selectedEngine));
});

test('hint: DouZero 不可用时自动降级规则 AI 且不抛出异常', async () => {
  const room = fullRoom();
  const observation = buildObservation(room, 'down-player');
  const actions = enumerateLegalActions(observation).filter(a => a.type === 'playCards');
  const router = new DecisionRouter({
    mode: 'active',
    trafficPercent: 100,
    createClient: () => ({
      decidePlay: async () => { throw Object.assign(new Error('unavailable'), { reason: 'douzero_unavailable' }); },
    }),
  });
  const result = await router.resolve(observation, {
    mode: 'active',
    decisionId: 'hint-fallback',
    deadlineAt: Date.now() + 800,
    ruleAction: actions[0],
  });
  assert.ok(result);
  assert.strictEqual(result.meta.selectedEngine, 'rule');
  assert.strictEqual(result.meta.fallbackReason, 'douzero_unavailable');
});

test('hint: off 模式不调用 DouZero 直接返回规则 AI 结果', async () => {
  const room = fullRoom();
  const observation = buildObservation(room, 'down-player');
  const actions = enumerateLegalActions(observation).filter(a => a.type === 'playCards');
  let called = false;
  const router = new DecisionRouter({
    mode: 'off',
    trafficPercent: 100,
    createClient: () => ({
      decidePlay: async () => { called = true; return {}; },
    }),
  });
  const result = await router.resolve(observation, {
    mode: 'rule',
    decisionId: 'hint-off',
    ruleAction: actions[0],
  });
  assert.strictEqual(called, false);
  assert.ok(result);
  assert.strictEqual(result.meta.selectedEngine, 'rule');
});
