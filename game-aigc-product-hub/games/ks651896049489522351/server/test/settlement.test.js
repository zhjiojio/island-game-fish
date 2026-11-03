// 结算算术测试：抽水、封顶、春天、输家余额不足时的账目守恒。
// 这里复刻 settleRound 中的纯计算部分（不含 DB），锁定金额分配行为。
const test = require('node:test');
const assert = require('node:assert');

// 与 server/index.js settleRound 中的算术保持一致
function computeSettlement ({
  landlordId, farmerIds, winnerId, baseScore, multiplier,
  maxMultiplier, taxRate, playCounts, availableBeans,
}) {
  const landlordWon = winnerId === landlordId;
  const spring = landlordWon
    ? farmerIds.every(id => (playCounts[id] || 0) === 0)
    : (playCounts[landlordId] || 0) <= 1;
  let mult = multiplier;
  if (spring) mult *= 2;
  mult = Math.min(mult, maxMultiplier);
  const unit = Math.max(1, baseScore) * mult;

  const requested = {};
  if (landlordWon) {
    requested[landlordId] = unit * 2;
    for (const id of farmerIds) requested[id] = -unit;
  } else {
    requested[landlordId] = -unit * 2;
    for (const id of farmerIds) requested[id] = unit;
  }

  const winnerIds = landlordWon ? [landlordId] : farmerIds.slice();
  const allIds = [landlordId, ...farmerIds];
  const loserIds = allIds.filter(id => !winnerIds.includes(id));

  // 输家实际只能输掉可用余额上限
  const deltas = {};
  let totalLost = 0;
  for (const id of loserIds) {
    const shouldLose = Math.abs(requested[id] || 0);
    const actualLose = Math.min(shouldLose, availableBeans[id]);
    deltas[id] = -actualLose;
    totalLost += actualLose;
  }

  // 赢家按请求占比分配，末位兜差，再各自扣抽水
  const positiveRequestedTotal = winnerIds.reduce((s, id) => s + Math.max(0, requested[id] || 0), 0) || 1;
  const grossDeltas = {}; const taxDeltas = {};
  let remainingWin = totalLost; let taxTotal = 0;
  winnerIds.forEach((id, idx) => {
    const grossShare = idx === winnerIds.length - 1
      ? remainingWin
      : Math.floor(totalLost * Math.max(0, requested[id] || 0) / positiveRequestedTotal);
    const tax = Math.floor(grossShare * taxRate);
    grossDeltas[id] = grossShare;
    taxDeltas[id] = -tax;
    deltas[id] = grossShare - tax;
    taxTotal += tax;
    remainingWin -= grossShare;
  });

  return { deltas, grossDeltas, taxDeltas, taxTotal, spring, multiplier: mult, unit, winnerIds, loserIds };
}

const BASE = {
  landlordId: 'L', farmerIds: ['F1', 'F2'],
  baseScore: 100, multiplier: 1, maxMultiplier: 64, taxRate: 0.03,
  playCounts: { L: 5, F1: 3, F2: 3 },
  availableBeans: { L: 1000000, F1: 1000000, F2: 1000000 },
};

function conserved (r) {
  // 净变动 + 抽水 = 0（+0 规避 -0 与 0 的 strictEqual 差异）
  const net = Object.values(r.deltas).reduce((a, b) => a + b, 0);
  return net + r.taxTotal + 0;
}

test('地主赢：农民各输一份，地主收两份并扣抽水', () => {
  const r = computeSettlement({ ...BASE, winnerId: 'L' });
  assert.strictEqual(r.unit, 100);
  assert.strictEqual(r.deltas.F1, -100);
  assert.strictEqual(r.deltas.F2, -100);
  assert.strictEqual(r.grossDeltas.L, 200);
  assert.strictEqual(r.taxDeltas.L, -6, '200 × 3% = 6');
  assert.strictEqual(r.deltas.L, 194);
  assert.strictEqual(conserved(r), 0, '账目必须守恒');
});

test('农民赢：地主输两份，两农民均分并各自扣抽水', () => {
  const r = computeSettlement({ ...BASE, winnerId: 'F1' });
  assert.strictEqual(r.deltas.L, -200);
  assert.strictEqual(r.grossDeltas.F1 + r.grossDeltas.F2, 200, '毛收益合计等于地主所输');
  assert.strictEqual(conserved(r), 0);
});

test('春天：地主赢且农民一张未出，倍数翻倍', () => {
  const r = computeSettlement({
    ...BASE, winnerId: 'L', playCounts: { L: 5, F1: 0, F2: 0 },
  });
  assert.ok(r.spring, '应判定春天');
  assert.strictEqual(r.multiplier, 2);
  assert.strictEqual(r.unit, 200);
  assert.strictEqual(conserved(r), 0);
});

test('反春：农民赢且地主仅出一手，倍数翻倍', () => {
  const r = computeSettlement({
    ...BASE, winnerId: 'F1', playCounts: { L: 1, F1: 3, F2: 3 },
  });
  assert.ok(r.spring, '应判定反春');
  assert.strictEqual(r.multiplier, 2);
  assert.strictEqual(conserved(r), 0);
});

test('倍数封顶生效', () => {
  const r = computeSettlement({ ...BASE, winnerId: 'L', multiplier: 1000, maxMultiplier: 64 });
  assert.strictEqual(r.multiplier, 64, '不得超过场次封顶');
  assert.strictEqual(r.unit, 6400);
});

test('输家余额不足：只输光可用余额，赢家收益同步缩水', () => {
  const r = computeSettlement({
    ...BASE, winnerId: 'L',
    availableBeans: { L: 1000000, F1: 30, F2: 100 },
  });
  assert.strictEqual(r.deltas.F1, -30, '只能输光 30');
  assert.strictEqual(r.deltas.F2, -100);
  assert.strictEqual(r.grossDeltas.L, 130, '赢家毛收益 = 实际输掉总额');
  assert.strictEqual(conserved(r), 0, '缩水后仍须守恒');
});

test('输家余额为 0：不产生负余额', () => {
  const r = computeSettlement({
    ...BASE, winnerId: 'L',
    availableBeans: { L: 1000000, F1: 0, F2: 0 },
  });
  // -Math.min(0, 0) 会得到 -0；JSON 序列化为 0，业务上等价，
  // 这里用 +0 归一后断言，避免 strictEqual 对 -0/0 的区分造成误报。
  assert.strictEqual(r.deltas.F1 + 0, 0);
  assert.strictEqual(r.grossDeltas.L, 0);
  assert.strictEqual(r.taxTotal, 0, '无收益则无抽水');
  assert.strictEqual(conserved(r), 0);
});
test('抽水向下取整，不产生凭空增发', () => {
  // 地主应输 unit*2 = 200；余额 201 足够，故实际输 200。
  // 两农民各得毛收益 100，各自 floor(100 × 3%) = 3 抽水。
  const r = computeSettlement({
    ...BASE, winnerId: 'F1',
    availableBeans: { L: 201, F1: 1000000, F2: 1000000 },
  });
  assert.strictEqual(r.deltas.L, -200, '只按应输额扣，不多扣');
  const grossSum = r.grossDeltas.F1 + r.grossDeltas.F2;
  assert.strictEqual(grossSum, 200, '毛收益合计必须等于实际输掉的额度');
  assert.strictEqual(r.taxTotal, 6, 'floor 抽水合计');
  assert.strictEqual(conserved(r), 0);
});

test('各档位抽水率均守恒', () => {
  for (const taxRate of [0, 0.03, 0.04, 0.05]) {
    for (const winnerId of ['L', 'F1']) {
      const r = computeSettlement({ ...BASE, winnerId, taxRate });
      assert.strictEqual(conserved(r), 0, `taxRate=${taxRate} winner=${winnerId} 应守恒`);
    }
  }
});

test('大师场参数下的完整结算', () => {
  const r = computeSettlement({
    ...BASE, winnerId: 'L', baseScore: 6400, maxMultiplier: 256, taxRate: 0.05,
  });
  assert.strictEqual(r.unit, 6400);
  assert.strictEqual(r.grossDeltas.L, 12800);
  assert.strictEqual(r.taxDeltas.L, -640, '12800 × 5% = 640');
  assert.strictEqual(r.deltas.L, 12160);
  assert.strictEqual(conserved(r), 0);
});
