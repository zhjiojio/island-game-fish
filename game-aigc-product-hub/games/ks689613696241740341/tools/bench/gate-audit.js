#!/usr/bin/env node
/**
 * bench/gate-audit.js —— F2P/P2P 双闸门 + 变异体杀灭率
 * ═══════════════════════════════════════════════════════════════════
 * 用法：node tools/bench/gate-audit.js [关卡上限] [每关seed数]
 * 退出码：0 = 杀灭率达标；非 0 = 存在意外存活的变异体
 *
 * 【它回答一个红线体系自己回答不了的问题】
 * 8 条红线全绿 ≠ 红线有用。一个 `process.exit(0)` 的空脚本也能全绿。
 * 全绿只说明【当前状态好】，不说明【有能力发现问题】。
 *
 * 所以本脚本反向施压：注入 15 个已知缺陷，看红线抓不抓得住。
 *   Killed   = 红线炸了 → 这条红线在这个方向上有效
 *   Survived = 红线没反应 → 【红线在这个方向上是瞎的】= 未来事故入口
 *
 * 【F2P / P2P 双闸门（来自 SWE-bench，GameFix 沿用）】
 *   F2P (Fail-to-Pass) ：注入缺陷后红线必须【由绿转红】。
 *                        没转红 = 存活变异体 = 检测盲区。
 *   P2P (Pass-to-Pass) ：不注入任何缺陷时红线必须【保持绿】。
 *                        没保持 = 红线自身有假红灯，会训练所有人忽略它。
 * 两个闸门缺一不可：只有 F2P 会催生"为了抓 bug 而过度敏感"的红线，
 * 只有 P2P 会催生"永远绿灯"的假红线。
 *
 * 【预期存活是允许的 —— 但必须提前声明】
 * M13/M14（容量均分、队列严格轮转）预期存活，因为它们破坏的是
 * 「策略性/信息量」，而当前红线体系【没有任何一条在量化这件事】。
 * 提前声明预期存活的意义：把"不知道自己不知道"变成"知道自己不知道"。
 * 未声明却存活 = 真盲区，必须补红线。
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';
const { MUTATORS } = require('./mutators');
const { readSources, load } = require('./sandbox');
const { USABLE_SLOTS, QUEUE_HEAD, CLEAR_BUDGET } = require('./rules');

const MAXN = parseInt(process.argv[2], 10) || 12;
const SEEDS = parseInt(process.argv[3], 10) || 2;

// 预期存活白名单：这些算子破坏的维度目前【确实】没有红线覆盖，
// 存活是真实的、已知的盲区，不算 F2P 失败。但必须在这里显式登记。
const EXPECTED_SURVIVORS = { M13: '策略性/容量信息量无量化判据', M14: '队列多样性无量化判据' };

const RT_OPT = { slots: USABLE_SLOTS, queueHead: QUEUE_HEAD, clearBudget: CLEAR_BUDGET };

/**
 * 在给定的 PD/LG 上跑一遍红线，返回各红线的计数。
 * 【为什么要在这里重跑而不是 exec validate-levels.js】
 * 因为变异体只存在于内存里的源码字符串，没有落盘。
 * 落盘再跑会污染工作区，且一旦脚本中途崩溃就留下被污染的源码 —— 极危险。
 */
function runRedLines(PD, LG, L) {
  const V = { unsolvable: 0, negS: 0, zombie: 0, beanMismatch: 0, layout: 0, star: 0 };
  const fps = {};
  let tot = 0, prevS = 9, prevC = 0, mono = 0;
  for (let n = 1; n <= MAXN; n++) {
    const D = LG.difficulty(n);
    if (D.S > prevS + 1e-9) mono++;
    if (D.C < prevC) mono++;
    prevS = D.S; prevC = D.C;
    for (let k = 0; k < SEEDS; k++) {
      let lv;
      try { lv = LG.genLevel(n, n * 10007 + k * 7919); }
      catch (e) { V.unsolvable++; tot++; continue; }
      tot++;
      if (!lv) { V.unsolvable++; continue; }
      const m = lv._meta || {};
      let rt;
      try { rt = PD.simulateRuntime(lv, RT_OPT); }
      catch (e) { V.unsolvable++; continue; }
      if (!rt.ok) V.unsolvable++;
      if (m.S < -1e-9) V.negS++;
      if (rt.zPeak >= USABLE_SLOTS) V.zombie++;
      if (lv.beans.length !== D.N) V.beanMismatch++;
      const maxW = 618, maxH = L.laneY - L.stageY - 30;
      const cell = Math.max(9, Math.min(20, Math.floor(Math.min(maxW / lv.cols, maxH / lv.rows))));
      const top0 = L.stageY + Math.max(10, (maxH - lv.rows * cell) / 2) + cell / 2;
      if (top0 + (lv.rows - 1) * cell >= L.laneY - 20 || lv.cols * cell > 750) V.layout++;
      const perfect = m.carMoves, bad = Math.ceil((m.carMoves || 0) * 1.8);
      if (!(perfect <= lv.stars.three && bad > lv.stars.two)) V.star++;
      const rn = {};
      lv.beans.forEach(b => { rn[b.gy] = (rn[b.gy] || 0) + 1; });
      fps[lv.shapeKind + '|' + lv.paintMode + '|' + Object.keys(rn).map(x => rn[x]).join('-')] = 1;
    }
  }
  const dup = (1 - Object.keys(fps).length / Math.max(1, tot)) * 100;
  return {
    V1: V.unsolvable, V2: V.negS, V3: V.zombie, V4: V.beanMismatch,
    V5: dup, V6: V.layout, V7: mono, V8: V.star, tot
  };
}

// 把红线结果压成「是否报警」的布尔向量。这是 F2P 判定的基准。
function toAlarms(r) {
  return {
    V1: r.V1 > 0, V2: r.V2 > 0, V3: r.V3 > 0, V4: r.V4 > 0,
    V5: r.V5 > 5, V6: r.V6 > 0, V7: r.V7 > 0, V8: r.V8 > 0
  };
}
function alarmList(a) { return Object.keys(a).filter(k => a[k]); }

console.log('═══ F2P/P2P 双闸门 + 变异体杀灭率 ═══');
console.log('  样本规模：1~' + MAXN + ' 关 × ' + SEEDS + ' seed\n');

const src = readSources();

// ── P2P 闸门：不注入任何缺陷，红线必须保持原状 ─────────────────
console.log('【P2P 闸门】原始代码基线');
const base = load(src.core, src.levelgen, { silent: true });
if (!base.PD || !base.LG) {
  console.log('  ✗ 原始代码都加载不了：' + JSON.stringify(base.errors));
  process.exit(2);
}
const baseR = runRedLines(base.PD, base.LG, base.L);
const baseA = toAlarms(baseR);
const baseAlarms = alarmList(baseA);
console.log('  基线红线状态：' + (baseAlarms.length
  ? '⚠ ' + baseAlarms.join(',') + ' 已报警' : '✅ 全绿'));
console.log('  基线数值：V1=' + baseR.V1 + ' V2=' + baseR.V2 + ' V3=' + baseR.V3
  + ' V4=' + baseR.V4 + ' V5=' + baseR.V5.toFixed(1) + '% V7=' + baseR.V7 + ' V8=' + baseR.V8
  + '  (样本 ' + baseR.tot + ' 局)');
if (baseAlarms.length) {
  console.log('  ⚠️ 基线已有报警 → 这些红线在本次 F2P 判定中会被【排除】，');
  console.log('     因为「本来就红」无法证明「是变异导致它红的」。');
  console.log('     这不是脚本的缺陷，而是【必须先修好基线才能测能力】。');
}

// ── F2P 闸门：逐个注入，看红线是否由绿转红 ────────────────────
console.log('\n【F2P 闸门】逐个注入变异体（共 ' + MUTATORS.length + ' 个）\n');

let killed = 0, survived = 0, stale = 0, undecidable = 0;
const survivors = [];
const undecided = [];

// 【关键：区分「真盲区」与「因基线污染无法判定」】
// 若一个算子期望被 V1 抓，而 V1 在基线就已经是红的，
// 那么这个算子【无法被评估】—— 不能算 killed（没证据），
// 也不能算 survived（那会把【测量失效】误报成【红线无能】）。
// 混为一谈会得出「杀灭率 6.7%」这种严重失真的数字，
// 而失真的指标比没有指标更危险 —— 它会把精力引到错的地方。
function expectedLines(mu) {
  const out = [];
  const m = mu.expect.match(/V\d/g);
  if (m) for (const v of m) if (out.indexOf(v) < 0) out.push(v);
  return out;
}

for (const mu of MUTATORS) {
  let core = src.core, levelgen = src.levelgen;
  const mutated = mu.apply(mu.target === 'core' ? core : levelgen);
  if (mutated == null) {
    stale++;
    console.log('  ⊘ ' + mu.id + ' [' + mu.dim + '] 锚点未唯一命中 —— 算子已过期，需修');
    console.log('        ' + mu.desc);
    continue;
  }
  if (mu.target === 'core') core = mutated; else levelgen = mutated;

  const env = load(core, levelgen, { silent: true });
  let verdict, detail;

  if (!env.PD || !env.LG) {
    // 加载即崩 = 被最强的方式抓住（T1 类缺陷的正确表现）
    verdict = 'killed'; detail = '加载即崩溃（T1 类，被沙箱直接捕获）';
  } else {
    let r;
    try { r = runRedLines(env.PD, env.LG, env.L); }
    catch (e) { r = null; }
    if (!r) { verdict = 'killed'; detail = '红线执行期抛错'; }
    else {
      const a = toAlarms(r);
      // 只认【基线绿、变异后红】的红线 —— 这才是 F2P 的严格定义
      const newly = Object.keys(a).filter(k => a[k] && !baseA[k]);
      if (newly.length) { verdict = 'killed'; detail = '触发 ' + newly.join(',') ; }
      else {
        // 补充判据：即使没有红线【翻转】，若数值发生显著恶化也算捕获
        const drift = [];
        for (const k of ['V1', 'V3', 'V4', 'V8']) {
          if (r[k] > baseR[k] * 1.5 && r[k] - baseR[k] >= 3) drift.push(k + ' ' + baseR[k] + '→' + r[k]);
        }
        if (drift.length) { verdict = 'killed'; detail = '数值显著恶化：' + drift.join(', '); }
        else {
          // 先判断是【真盲区】还是【基线污染导致无法判定】
          const exp = expectedLines(mu);
          const blocked = exp.filter(v => baseA[v]);
          if (exp.length && blocked.length === exp.length) {
            verdict = 'undecidable';
            detail = '期望判据 ' + blocked.join(',') + ' 在基线已红 → 无法证伪';
          } else {
            verdict = 'survived'; detail = '所有红线无反应';
          }
        }
      }
    }
  }

  if (verdict === 'killed') {
    killed++;
    console.log('  ✅ KILLED   ' + mu.id + ' [' + mu.dim + '] ' + mu.desc);
    console.log('              捕获方式：' + detail);
  } else if (verdict === 'undecidable') {
    undecidable++;
    undecided.push({ mu, detail });
    console.log('  ➖ 无法判定  ' + mu.id + ' [' + mu.dim + '] ' + mu.desc);
    console.log('              ' + detail);
  } else {
    survived++;
    const expected = EXPECTED_SURVIVORS[mu.id];
    survivors.push({ mu, expected });
    console.log('  ' + (expected ? '🟡 SURVIVED(已声明)' : '❌ SURVIVED(真盲区) ') + ' ' + mu.id + ' [' + mu.dim + '] ' + mu.desc);
    console.log('              期望被抓：' + mu.expect);
    if (expected) console.log('              已登记盲区：' + expected);
  }
}

// ── 汇总 ────────────────────────────────────────────────────────
const realSurvivors = survivors.filter(s => !s.expected);
// 【分母必须排除无法判定项】否则杀灭率会把「测不了」算成「没抓住」。
const decidable = MUTATORS.length - stale - undecidable;
const rate = decidable ? (killed / decidable * 100) : 0;

console.log('\n─── 汇总 ───');
console.log('  算子总数     : ' + MUTATORS.length);
console.log('  过期算子     : ' + stale);
console.log('  无法判定     : ' + undecidable + '（期望判据在基线已红，不计入分母）');
console.log('  可判定样本   : ' + decidable);
console.log('  Killed       : ' + killed);
console.log('  Survived     : ' + survived + '（已声明盲区 ' + (survived - realSurvivors.length)
  + '，真盲区 ' + realSurvivors.length + '）');
console.log('  变异体杀灭率 : ' + rate.toFixed(1) + '%   ← 红线体系的【能力】指标');
console.log('                 （8/8 全绿只是【状态】指标，两者不可互相替代）');

if (undecidable) {
  console.log('\n  ⚠️ 有 ' + undecidable + ' 个算子无法判定 —— 它们的期望判据在基线就已经是红的。');
  console.log('     这不是红线的能力问题，而是【测量环境被污染】。');
  console.log('     必须先把基线修绿，才能得到真实的杀灭率。顺序不可逆。');
}
if (realSurvivors.length) {
  console.log('\n  ⚠️ 未声明的存活变异体 = 红线的真实盲区，必须补判据：');
  for (const s of realSurvivors) {
    console.log('     ' + s.mu.id + ' [' + s.mu.dim + '] ' + s.mu.desc);
    console.log('         应补：' + s.mu.expect);
  }
}
if (stale) {
  console.log('\n  ⚠️ 过期算子 = 源码已改但算子锚点没跟上。');
  console.log('     它们既不算 killed 也不算 survived —— 是【测量能力本身的损耗】，必须修。');
}

const pass = realSurvivors.length === 0 && stale === 0 && undecidable === 0;
console.log('\n' + (pass
  ? '✅ F2P/P2P 双闸门通过，杀灭率 ' + rate.toFixed(1) + '%'
  : '❌ 双闸门未通过：' + realSurvivors.length + ' 个真盲区 + '
    + undecidable + ' 个无法判定 + ' + stale + ' 个过期算子'));
process.exit(pass ? 0 : 1);
