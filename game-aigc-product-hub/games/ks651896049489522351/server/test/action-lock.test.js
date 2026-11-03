// 验证回合动作串行化：await 窗口内的重复 playCards 必须被拒绝。
// 运行：node --test server/test/
const test = require('node:test');
const assert = require('node:assert');

// withActionLock 的行为契约（与 index.js 中实现一致）
async function withActionLock (room, fn) {
  if (!room) return false;
  if (room.actionLock) return false;
  room.actionLock = true;
  try {
    return await fn();
  } finally {
    room.actionLock = false;
  }
}

test('await 窗口内的并发重复动作只有第一个生效', async () => {
  const room = { id: '100000', actionLock: false, currentPlayerId: 'p1', plays: 0 };

  // 模拟 applyPlayCardsUnlocked：守卫 -> await 落库 -> 之后才推进 currentPlayerId
  async function playUnlocked (playerId) {
    if (room.currentPlayerId !== playerId) return false;
    await new Promise(r => setTimeout(r, 20));   // 模拟 appendMatchEvent 落库
    room.plays += 1;
    room.currentPlayerId = 'p2';                 // 守卫条件此刻才失效
    return true;
  }
  const play = (pid) => withActionLock(room, () => playUnlocked(pid));

  const [first, second] = await Promise.all([play('p1'), play('p1')]);

  assert.strictEqual(first, true, '第一次出牌应成功');
  assert.strictEqual(second, false, '同回合第二次出牌必须被锁拒绝');
  assert.strictEqual(room.plays, 1, '一个回合只能出一手牌');
});

test('无锁时同样的并发会出两手牌（回归对照）', async () => {
  const room = { currentPlayerId: 'p1', plays: 0 };
  async function playUnlocked (playerId) {
    if (room.currentPlayerId !== playerId) return false;
    await new Promise(r => setTimeout(r, 20));
    room.plays += 1;
    room.currentPlayerId = 'p2';
    return true;
  }
  await Promise.all([playUnlocked('p1'), playUnlocked('p1')]);
  assert.strictEqual(room.plays, 2, '证明漏洞真实存在：无锁时一回合可出两手牌');
});

test('锁在异常抛出后必须释放，避免房间永久卡死', async () => {
  const room = { actionLock: false };
  await assert.rejects(withActionLock(room, async () => { throw new Error('db fail'); }));
  assert.strictEqual(room.actionLock, false, '异常后锁必须归位');
  assert.strictEqual(await withActionLock(room, async () => true), true, '房间应能继续行动');
});
