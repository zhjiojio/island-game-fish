const test = require('node:test');
const assert = require('node:assert');
const { createMatchmakingOrchestrator } = require('../matchmaking/orchestrator');
const { createJoinReservationStore } = require('../matchmaking/reservation');

function entry (accountId, roomType = 'junior', joinedAt = 1000) {
  return { accountId, roomType, joinedAt, ws: { id: accountId, readyState: 1 }, nickname: accountId };
}

function createHarness (clock = { now: 1000 }) {
  const assemblies = [];
  const orchestrator = createMatchmakingOrchestrator({
    roomTypes: ['junior', 'mid', 'master'],
    now: () => clock.now,
    rng: () => 0,
    config: { soloMinMs: 28000, soloMaxMs: 36000, duoMinMs: 80000, duoMaxMs: 105000 },
    onAssemble: async request => {
      assemblies.push(request);
      return {
        ok: true,
        roomId: `room-${assemblies.length}`,
        reservationIds: Object.fromEntries(request.humans.map(h => [h.accountId, `r-${h.accountId}`])),
      };
    },
  });
  return { orchestrator, assemblies, clock };
}

test('同账号只能存在一个活跃匹配会话，重连只更新 ws', () => {
  const { orchestrator } = createHarness();
  const first = orchestrator.enqueue(entry('a'));
  const secondWs = { id: 'a-new' };
  const second = orchestrator.enqueue({ ...entry('a'), ws: secondWs });
  assert.strictEqual(first.created, true);
  assert.strictEqual(second.created, false);
  assert.strictEqual(orchestrator.queueLength('junior'), 1);
  assert.strictEqual(second.session.ws, secondWs);
});

test('三真人始终优先于机器人补位', async () => {
  const { orchestrator, assemblies, clock } = createHarness();
  orchestrator.enqueue(entry('a'));
  orchestrator.enqueue(entry('b'));
  orchestrator.enqueue(entry('c'));
  clock.now = 200000;
  await orchestrator.process('junior');
  assert.strictEqual(assemblies.length, 1);
  assert.strictEqual(assemblies[0].mode, 'human');
  assert.strictEqual(assemblies[0].botCount, 0);
});

test('单真人达到稳定随机阈值后补两个机器人', async () => {
  const { orchestrator, assemblies, clock } = createHarness();
  orchestrator.enqueue(entry('a'));
  clock.now = 28999;
  await orchestrator.process('junior');
  assert.strictEqual(assemblies.length, 0);
  clock.now = 29000;
  await orchestrator.process('junior');
  assert.strictEqual(assemblies.length, 1);
  assert.strictEqual(assemblies[0].mode, 'solo');
  assert.strictEqual(assemblies[0].botCount, 2);
});

test('双真人继续等待至更久阈值后补一个机器人', async () => {
  const { orchestrator, assemblies, clock } = createHarness();
  orchestrator.enqueue(entry('a'));
  orchestrator.enqueue(entry('b'));
  clock.now = 80999;
  await orchestrator.process('junior');
  assert.strictEqual(assemblies.length, 0);
  clock.now = 81000;
  await orchestrator.process('junior');
  assert.strictEqual(assemblies.length, 1);
  assert.strictEqual(assemblies[0].mode, 'duo');
  assert.strictEqual(assemblies[0].botCount, 1);
});

test('大师场即使超时也不补机器人', async () => {
  const { orchestrator, assemblies, clock } = createHarness();
  orchestrator.enqueue(entry('a', 'master'));
  clock.now = 200000;
  await orchestrator.process('master');
  assert.strictEqual(assemblies.length, 0);
  assert.strictEqual(orchestrator.queueLength('master'), 1);
});

test('同场次并发 process 被串行化，不会重复组装同一批账号', async () => {
  const { orchestrator, assemblies, clock } = createHarness();
  orchestrator.enqueue(entry('a'));
  clock.now = 29000;
  await Promise.all(Array.from({ length: 10 }, () => orchestrator.process('junior')));
  assert.strictEqual(assemblies.length, 1);
  assert.strictEqual(orchestrator.queueLength('junior'), 0);
});

test('取消必须匹配 accountId 和可选 matchRequestId', () => {
  const { orchestrator } = createHarness();
  const { session } = orchestrator.enqueue(entry('a'));
  assert.strictEqual(orchestrator.cancelByAccount('a', 'wrong'), false);
  assert.strictEqual(orchestrator.queueLength('junior'), 1);
  assert.strictEqual(orchestrator.cancelByAccount('a', session.matchRequestId), true);
  assert.strictEqual(orchestrator.queueLength('junior'), 0);
});

test('joinTicket 与账号/房间/请求绑定且只能消费一次', () => {
  let now = 1000;
  const store = createJoinReservationStore({ secret: 'join-ticket-test-secret', now: () => now, ttlMs: 10000 });
  const issued = store.issue({ accountId: 'a', roomId: 'room1', matchRequestId: 'req1' });
  assert.ok(issued.joinTicket.length >= 32);
  assert.strictEqual(store.validateAndConsume({ accountId: 'b', roomId: 'room1', matchRequestId: 'req1', joinTicket: issued.joinTicket }).ok, false);
  assert.strictEqual(store.validateAndConsume({ accountId: 'a', roomId: 'room2', matchRequestId: 'req1', joinTicket: issued.joinTicket }).reason, 'ticket_binding_mismatch');
  assert.strictEqual(store.validateAndConsume({ accountId: 'a', roomId: 'room1', matchRequestId: 'req1', joinTicket: issued.joinTicket }).ok, true);
  assert.strictEqual(store.validateAndConsume({ accountId: 'a', roomId: 'room1', matchRequestId: 'req1', joinTicket: issued.joinTicket }).reason, 'ticket_consumed');
});

test('joinTicket 过期拒绝；重签发会使旧票据立即失效', () => {
  let now = 1000;
  const store = createJoinReservationStore({ secret: 'join-ticket-test-secret', now: () => now, ttlMs: 5000 });
  const first = store.issue({ accountId: 'a', roomId: 'room1', matchRequestId: 'req1' });
  const second = store.reissue('a');
  assert.ok(second);
  assert.strictEqual(store.validateAndConsume({ accountId: 'a', roomId: 'room1', matchRequestId: 'req1', joinTicket: first.joinTicket }).reason, 'ticket_invalid');
  now = second.expiresAt + 1;
  assert.strictEqual(store.validateAndConsume({ accountId: 'a', roomId: 'room1', matchRequestId: 'req1', joinTicket: second.joinTicket }).reason, 'ticket_expired');
});
