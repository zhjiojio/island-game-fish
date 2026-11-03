#!/usr/bin/env node
/**
 * bench/strict-curve.js —— Strict 生存曲线 + Cliff 落差
 * ═══════════════════════════════════════════════════════════════════
 * 用法：node tools/bench/strict-curve.js [关卡上限] [每关seed数]
 *
 * 【为什么需要"生存曲线"而不是一个平均胜率】
 * 平均胜率 78% 这个数几乎没有信息量 —— 它可能是
 *   (a) 每关都稳定 78%     ← 健康
 *   (b) 前 20 关 100%、后 10 关 22%   ← 断崖，玩家在第 21 关集体流失
 * 两者平均值完全相同，但产品后果天差地别。
 * 平均值把【分布】压成了【一个点】，而流失恰恰发生在分布的形状里。
 *
 * 【Strict 指标（移植 GameFix）】
 * 定义生存函数 S(τ) = 「达标线定在 τ 分时，有多少比例的关卡仍然合格」。
 * τ 从 0 升到 100，S(τ) 单调不增 —— 这就是生存曲线。
 *   Strict = S(τ) 在 τ∈[90,100] 这个高标准带上的【平均高度】。
 * 为什么取高标准带而不是取整条曲线的均值：
 *   低标准区间人人都过，没有区分度；真正的能力差异只在高标准区显现。
 *   这与「难度倾斜权重 w = p(1-p)²」同源 —— 都是把测量精度分配到难处。
 *
 * 【Cliff 指标（移植 GameFix 的 Explicit Issue → Self-Discovery 落差）】
 * GameFix 发现：告诉模型"这里有 bug"时它能修，让它自己找 bug 时分数断崖下跌。
 * 落差幅度本身就是一个独立指标 —— 它测的是【自主发现能力】。
 *
 * 映射到拼豆：
 *   「被明确告知」≈ 老手玩家（知道要挑车、要留位、要躲 ghost）
 *   「自主发现」  ≈ 随手玩家（闭眼抓前 4 格第一辆能用的车）
 *   Cliff = 老手胜率 − 随手胜率
 * Cliff 太小 = 玩不玩心都一样 → 没有策略深度（用户原话「这还有策略么？」）
 * Cliff 太大 = 新手完全打不动 → 前期流失
 * 所以 Cliff 有一个【健康区间】，不是越大越好也不是越小越好。
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';
const { loadPristine } = require('./sandbox');
const { USABLE_SLOTS, QUEUE_HEAD, CLEAR_BUDGET } = require('./rules');

const MAXN = parseInt(process.argv[2], 10) || 30;
const SEEDS = parseInt(process.argv[3], 10) || 4;

const { PD, LG } = loadPristine({ silent: true });
if (!PD || !LG || typeof PD.simulateRuntime !== 'function') {
  console.log('✗ 沙箱或 PD.simulateRuntime 缺失');
  process.exit(2);
}

/**
 * 两档玩家画像。
 * 【实测教训一：资源参数刻画不出水平差异】
 * 第一版用 clearBudget 4 vs 0 区分老手/随手 → Cliff = 0.0，两曲线完全重合。
 * 原因：死局主因是「队列已空」，那条路径根本不消耗广告额度 —— 资源不是瓶颈。
 *
 * 【实测教训二：决策参数也刻画不出差异，而这次是真结论不是假象】
 * 第二版改成只差挑车策略（best 挑最优 / first 拖第一辆），跑同一模拟器。
 * 结果 Cliff 仍然 = 0.0，且逐关 ok/carMoves/clears 【逐位相同】。
 *
 * 这时必须停止调参，去问「为什么改不动」。答案在 deriveCars 的冗余率契约：
 *   LG.difficulty(n).S ≡ 0  →  每色总容量 ≡ 该色豆数  →  每辆车必然恰好装满
 * 于是「挑哪辆车」在结果上完全等价 —— 早拖晚拖都装满，顺序不改变任何终局。
 * 【策略维度在数学上被 S=0 消灭了】。这正是用户原话「这还有策略么？」的根因。
 *
 * 所以 Cliff = 0 不是测量缺陷，是【真实且严重的设计问题】，必须如实报出。
 * 修它要动的是 S 契约（给出正冗余，让"装不满就变僵尸"成为真实代价），
 * 而不是继续给模拟器加参数。
 * ⚠️ 顺带一条通用教训：同一假设连续两次改参数都无效时，
 *    该怀疑的是假设本身，而不是参数还没调对。
 */
const PROFILES = [
  { key: 'veteran', name: '老手(挑最优车)', opt: { slots: USABLE_SLOTS, queueHead: QUEUE_HEAD, clearBudget: CLEAR_BUDGET, pick: 'best' } },
  { key: 'casual',  name: '随手(拖第一辆)', opt: { slots: USABLE_SLOTS, queueHead: QUEUE_HEAD, clearBudget: CLEAR_BUDGET, pick: 'first' } }
];

console.log('═══ Strict 生存曲线 + Cliff 落差 ═══');
console.log('  样本：1~' + MAXN + ' 关 × ' + SEEDS + ' seed\n');

// 逐关采样：每关得到两档画像的通关率
const perLevel = [];
for (let n = 1; n <= MAXN; n++) {
  const row = { n, veteran: 0, casual: 0, tot: 0 };
  for (let k = 0; k < SEEDS; k++) {
    const lv = LG.genLevel(n, n * 10007 + k * 7919);
    if (!lv) continue;
    row.tot++;
    for (const p of PROFILES) {
      let r;
      try { r = PD.simulateRuntime(lv, p.opt); } catch (e) { r = { ok: false }; }
      if (r.ok) row[p.key]++;
    }
  }
  if (row.tot) perLevel.push(row);
}

// ── 生存曲线：S(τ) = 通关率 ≥ τ% 的关卡占比 ────────────────────
function survival(key) {
  const rates = perLevel.map(r => r[key] / r.tot * 100);
  const S = [];
  for (let tau = 0; tau <= 100; tau++) {
    S.push(rates.filter(x => x >= tau).length / rates.length * 100);
  }
  return S;
}
// Strict = S(τ) 在 [90,100] 的平均高度
function strict(S) {
  let sum = 0;
  for (let t = 90; t <= 100; t++) sum += S[t];
  return sum / 11;
}

const Sv = survival('veteran'), Sc = survival('casual');
const strictV = strict(Sv), strictC = strict(Sc);

// ── 输出生存曲线（ASCII，取 τ = 0,10,...,100）────────────────
console.log('【生存曲线】S(τ) = 通关率 ≥ τ% 的关卡占比');
console.log('   τ%  │ ' + '老手'.padEnd(24) + '随手');
for (let t = 100; t >= 0; t -= 10) {
  const bv = '█'.repeat(Math.round(Sv[t] / 5));
  const bc = '▒'.repeat(Math.round(Sc[t] / 5));
  console.log('  ' + String(t).padStart(3) + '  │ ' + (bv + ' ' + Sv[t].toFixed(0) + '%').padEnd(26)
    + bc + ' ' + Sc[t].toFixed(0) + '%');
}

console.log('\n【Strict 指标】S(τ) 在高标准带 τ∈[90,100] 的平均高度');
console.log('  老手 Strict : ' + strictV.toFixed(1) + '%');
console.log('  随手 Strict : ' + strictC.toFixed(1) + '%');
console.log('  判据：老手 Strict 应 ≥ 70%（否则连懂玩法的人都过不去 = 关卡有 bug 而非难）');

// ── Cliff ───────────────────────────────────────────────────────
const wrV = perLevel.reduce((a, r) => a + r.veteran, 0) / perLevel.reduce((a, r) => a + r.tot, 0) * 100;
const wrC = perLevel.reduce((a, r) => a + r.casual, 0) / perLevel.reduce((a, r) => a + r.tot, 0) * 100;
const cliff = wrV - wrC;

console.log('\n【Cliff 落差】老手胜率 − 随手胜率 = 策略深度的量化');
console.log('  老手总胜率 : ' + wrV.toFixed(1) + '%');
console.log('  随手总胜率 : ' + wrC.toFixed(1) + '%');
console.log('  Cliff      : ' + cliff.toFixed(1) + ' 个百分点');
console.log('  健康区间   : 15 ~ 45');
console.log('    < 15 → 玩不玩心都一样，没有策略深度（用户原话「这还有策略么？」）');
console.log('    > 45 → 新手完全打不动，前期流失');
if (cliff < 1) {
  console.log('\n  ⚠️ Cliff ≈ 0 且两档画像逐位相同 —— 这【不是测量缺陷】，是设计结论：');
  console.log('     S ≡ 0（每色总容量恒等于豆数）⟹ 每辆车必然恰好装满');
  console.log('     ⟹ 挑哪辆车在终局上完全等价 ⟹ 策略维度在数学上被消灭。');
  console.log('     要修必须动 S 契约给出正冗余，让「装不满就变僵尸」成为真实代价；');
  console.log('     继续给模拟器加参数是无效的（已实测两轮）。');
}

// ── 逐关落差热图：定位断崖具体在第几关 ────────────────────────
console.log('\n【逐关热图】上行=老手，下行=随手  （█满过 ▄部分 ·全灭）');
function heat(key) {
  let s = '  ';
  for (const r of perLevel) {
    const x = r[key] / r.tot;
    s += x === 1 ? '█' : x >= 0.5 ? '▄' : x > 0 ? '▁' : '·';
    if (r.n % 10 === 0) s += ' ';
  }
  return s;
}
console.log(heat('veteran'));
console.log(heat('casual'));
let ruler = '  ';
for (const r of perLevel) { ruler += (r.n % 10 === 0 ? '|' : ' '); if (r.n % 10 === 0) ruler += ' '; }
console.log(ruler + ' ← 每 10 关一刻度');

// ── 断崖定位：连续 ≥3 关老手也过不去的区段 ─────────────────────
const cliffs = [];
let run = null;
for (const r of perLevel) {
  const bad = r.veteran / r.tot < 0.5;
  if (bad) { if (!run) run = { from: r.n, to: r.n }; else run.to = r.n; }
  else { if (run && run.to - run.from >= 2) cliffs.push(run); run = null; }
}
if (run && run.to - run.from >= 2) cliffs.push(run);

if (cliffs.length) {
  console.log('\n  ⚠️ 检测到 ' + cliffs.length + ' 处断崖区（连续 ≥3 关老手胜率 < 50%）：');
  for (const c of cliffs) console.log('     第 ' + c.from + ' ~ ' + c.to + ' 关');
  console.log('     这是【玩家集体流失点】。断崖 ≠ 难度提升 —— 难度提升是斜坡，断崖是墙。');
} else {
  console.log('\n  ✅ 未检测到断崖区');
}

// ── 单调性：难度应是斜坡不是锯齿 ───────────────────────────────
// 【为什么锯齿是致命的】玩家对难度的感知是相对的：
// 第 5 关过不去、第 6 关一次过，玩家的结论不是"第 5 关难"，
// 而是"这游戏很随机、我的操作不重要" —— 直接摧毁掌控感。
let saw = 0;
for (let i = 1; i < perLevel.length; i++) {
  const prev = perLevel[i - 1].veteran / perLevel[i - 1].tot;
  const cur = perLevel[i].veteran / perLevel[i].tot;
  if (cur - prev > 0.5) saw++;     // 突然变简单 0.5 以上 = 锯齿
}
console.log('\n【难度单调性】胜率突升(>50pp)次数：' + saw
  + (saw > 0 ? '  ⚠️ 锯齿会摧毁玩家的掌控感（"这游戏很随机"）' : '  ✅ 斜坡形态'));

const pass = strictV >= 70 && cliff >= 15 && cliff <= 45 && cliffs.length === 0;
console.log('\n' + (pass ? '✅ 曲线健康' : '❌ 曲线未达标（见上方判据）'));
process.exit(pass ? 0 : 1);
