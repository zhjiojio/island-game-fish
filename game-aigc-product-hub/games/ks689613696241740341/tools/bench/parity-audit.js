#!/usr/bin/env node
/**
 * bench/parity-audit.js —— 求解器 ↔ 运行时 口径一致性审计
 * ═══════════════════════════════════════════════════════════════════
 * 用法：node tools/bench/parity-audit.js [关卡上限] [每关seed数]
 * 退出码：0 = 口径一致；非 0 = 存在分裂，禁止 build
 *
 * 【它治什么病】skill 已知坑 10：求解器全绿但真机 56% 死局。
 * 根因是真机规则被重复实现了五遍（solveLevel / pd-game / simRuntime /
 * playOnce / refPlay），改一条规则要同步五处，漏一处就是【假绿灯】。
 *
 * 【本次审计首跑就抓到的真实事故】
 *   solveLevel 40/40 判可解，运行时 17/40 死局（42.5%）；
 *   peakSlots 求解器恒报 1、运行时 4~5。
 * 根因比已知坑 10 更深 —— solveLevel 有三处「先知特权」：
 *   ⓐ 可从整个 queue 任意挑车（运行时只能取前 4 格）
 *   ⓑ 于是自动绕开所有 ghost 干扰车
 *   ⓒ 车位随时压缩（运行时是固定物理槽）
 * 已通过把真机规则收拢为 PD.simulateRuntime 修复。
 *
 * 【三层检查 · 缺一不可】
 *   L1 静态 anchor  ：按 rules.js 扫源码，看规则有没有在各处实现。便宜但只能证明「提到了」。
 *   L2 重复实现探测 ：搜 tools/ 里有没有人又手写了一遍 while(remain>0) 模拟器。
 *                     这是【元检查】—— 防的是「规则本身被复制成 N 份」这个根因。
 *   L3 单向蕴含    ：solveLevel 判不可解 ⟹ 运行时必不可解。
 *                     ⚠️ 判据不是「两者数字相等」！先知比人强，落差是正常难度，
 *                     要查的是【上界有没有被违反】。
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { RULES, IMPL_FILES, USABLE_SLOTS, QUEUE_HEAD, CLEAR_BUDGET } = require('./rules');
const { loadPristine } = require('./sandbox');

const MAXN = parseInt(process.argv[2], 10) || 30;
const SEEDS = parseInt(process.argv[3], 10) || 3;

function pad(s, w) { s = '' + s; while (s.length < w) s += ' '; return s; }
function padL(s, w) { s = '' + s; while (s.length < w) s = ' ' + s; return s; }

console.log('═══ 口径一致性审计（GameFix 口径同步机制移植）═══\n');

// ═══════════════════════════════════════════════════════════════════
// L1 静态 anchor 扫描
// ═══════════════════════════════════════════════════════════════════
console.log('【L1】静态规则 anchor 扫描');
console.log('  判据：rules.js 声明的每条规则，都必须能在对应实现文件里找到特征代码\n');

const srcCache = {};
for (const key of Object.keys(IMPL_FILES)) {
  const p = path.join(__dirname, IMPL_FILES[key]);
  srcCache[key] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

let staticMiss = 0;
for (const rule of RULES) {
  const missing = [];
  for (const file of Object.keys(rule.anchors)) {
    const re = rule.anchors[file];
    if (!re) continue;
    const src = srcCache[file];
    if (src == null) { missing.push(file + '(文件缺失)'); continue; }
    if (!re.test(src)) missing.push(file);
  }
  const ok = missing.length === 0;
  if (!ok) staticMiss++;
  console.log('  ' + (ok ? '✓' : '⚠') + ' ' + rule.id + ' ' + rule.name);
  if (!ok) {
    console.log('      未命中：' + missing.join(', '));
    console.log('      风险  ：' + rule.why.replace(/\n\s*/g, ' '));
  }
}
console.log('\n  L1：' + (RULES.length - staticMiss) + '/' + RULES.length + ' 条规则齐备'
  + (staticMiss ? '，' + staticMiss + ' 条有缺口（WARN，需确认是否内联实现）' : ''));

// ═══════════════════════════════════════════════════════════════════
// L2 重复实现探测（元检查：防的是「规则被复制成 N 份」这个根因）
// ═══════════════════════════════════════════════════════════════════
console.log('\n【L2】重复实现探测');
console.log('  判据：tools/ 下不许再有手写的运行时模拟器，必须调 PD.simulateRuntime\n');

const TOOLS_DIR = path.join(__dirname, '..');
// 手写模拟器的指纹：同时出现「remain 递减循环」+「车位数组」+「装豆判定」
const SIM_FINGERPRINTS = [
  /while\s*\(\s*remain\s*>\s*0/,
  /slots\s*\[/,
  /isPickable/
];
const dupes = [];
for (const f of fs.readdirSync(TOOLS_DIR)) {
  if (!f.endsWith('.js')) continue;
  const p = path.join(TOOLS_DIR, f);
  if (!fs.statSync(p).isFile()) continue;
  const src = fs.readFileSync(p, 'utf8');
  const hits = SIM_FINGERPRINTS.filter(re => re.test(src)).length;
  if (hits === SIM_FINGERPRINTS.length && !/PD\.simulateRuntime|simulateRuntime\s*\(/.test(src)) {
    dupes.push(f);
  }
}
if (dupes.length) {
  console.log('  ⚠ 发现 ' + dupes.length + ' 个文件自带手写模拟器且未调用 PD.simulateRuntime：');
  for (const d of dupes) console.log('      tools/' + d);
  console.log('      风险：这些文件的判定口径会随 pd-game 演进而静默失效 —— 假绿灯的温床。');
  console.log('      建议：改为 PD.simulateRuntime(lv, { slots:5, queueHead:4 })。');
} else {
  console.log('  ✓ 未发现重复实现，运行时规则唯一');
}

// ═══════════════════════════════════════════════════════════════════
// L3 单向蕴含验证（真判据）
// ═══════════════════════════════════════════════════════════════════
console.log('\n【L3】单向蕴含验证');
console.log('  判据：solveLevel 判不可解 ⟹ 运行时必不可解（上界不许被违反）');
console.log('  ⚠️ 反向不成立且不该成立：先知比人强，落差就是这一关的难度\n');

const { PD, LG, errors } = loadPristine({ silent: true });
if (!PD || !LG) {
  console.log('  ✗ 沙箱加载失败：' + JSON.stringify(errors));
  process.exit(2);
}
if (typeof PD.simulateRuntime !== 'function') {
  console.log('  ✗ PD.simulateRuntime 不存在 —— 单一真值源缺失（违反 R8）');
  process.exit(2);
}

const RT_OPT = { slots: USABLE_SLOTS, queueHead: QUEUE_HEAD, clearBudget: CLEAR_BUDGET };
let tot = 0, solveFail = 0, rtFail = 0, implViolate = 0, autoRelGain = 0, movesDiv = 0;
const cases = [];
const gapByLevel = [];

for (let n = 1; n <= MAXN; n++) {
  let lvTot = 0, lvRtFail = 0;
  for (let k = 0; k < SEEDS; k++) {
    const lv = LG.genLevel(n, n * 10007 + k * 7919);
    if (!lv) continue;
    tot++; lvTot++;

    let sol;
    try { sol = PD.solveLevel(lv, { slots: USABLE_SLOTS, walk: true }); }
    catch (e) { sol = { solvable: null, reason: 'THROW:' + e.message }; }
    const rt = PD.simulateRuntime(lv, RT_OPT);
    // 对照实验：多给「该色清空即放行」通道能救活多少局 → 量化 R3 分裂的杀伤力
    const rtAuto = PD.simulateRuntime(lv, Object.assign({ autoRelease: true }, RT_OPT));

    if (!rt.ok) { rtFail++; lvRtFail++; }
    if (sol.solvable !== true) solveFail++;
    if (!rt.ok && rtAuto.ok) autoRelGain++;

    // P1 上界违反：先知说不可解，但真机居然过了 → 说明 solveLevel 比运行时还严，
    // 那它作为上界的定位就崩了（通常意味着有人给它加了运行时没有的限制）
    if (sol.solvable === false && rt.ok) {
      implViolate++;
      if (cases.length < 6) cases.push({ n, k, type: 'P1上界违反', a: sol.reason || '不可解', b: '运行时可解' });
    }
    // P2 三星阈值口径：stars 必须由 carMoves 回写，且与运行时 carMoves 同量级
    // ⚠️ 只在【运行时通关】的局比对 —— 死局的 carMoves 是被截断的半程数据，
    //    拿它当分母会把「关卡太难」误报成「三星阈值错」，是典型的测量假象。
    if (rt.ok && lv.stars && lv.stars.three > 0 && rt.carMoves > 0) {
      const ratio = lv.stars.three / rt.carMoves;
      // 三星阈值应在运行时调车次数的 0.8~2 倍区间。
      // <0.8 = 神仙都拿不到三星；>2 = 闭眼玩也是三星（skill 已知坑「三星永远3星」）。
      if (ratio < 0.8 || ratio > 2) {
        movesDiv++;
        if (cases.length < 6) cases.push({ n, k, type: 'P2三星量级', a: '阈值' + lv.stars.three, b: '运行时' + rt.carMoves + ' (×' + ratio.toFixed(1) + ')' });
      }
    }
  }
  if (lvTot) gapByLevel.push({ n, fail: lvRtFail, tot: lvTot });
}

const rows = [
  ['P1', '上界违反(先知严于真机)', implViolate, implViolate === 0, '必须 = 0'],
  ['P2', '三星阈值量级失真', movesDiv, movesDiv === 0, '必须 = 0'],
  ['P3', 'autoRelease 通道残留', autoRelGain, autoRelGain === 0, '必须 = 0']
];
let bad = 0;
for (const r of rows) {
  if (!r[3]) bad++;
  console.log('  ' + (r[3] ? '✓' : '✗') + ' ' + r[0] + ' ' + pad(r[1], 24) + padL(r[2] + '/' + tot, 10) + '   (判据 ' + r[4] + ')');
}

console.log('\n  样本 ' + tot + ' 局');
console.log('  先知(solveLevel)判不可解 : ' + solveFail + ' 局');
console.log('  真机(simulateRuntime)失败 : ' + rtFail + ' 局  ← 这个数才是【真实难度】');
console.log('  先知-真机落差             : ' + (rtFail - solveFail) + ' 局'
  + '  ← 正常应 >0（先知比人强）；若为 0 说明求解器没在做上界');

if (cases.length) {
  console.log('\n  异常样例（最多 6 条）：');
  for (const c of cases) {
    console.log('    第' + pad(c.n + '关/seed' + c.k, 14) + pad(c.type, 14) + pad(c.a, 20) + c.b);
  }
}

// 难度曲线快照：真机失败率随关卡的走势（balance/level 维度的量化入口）
console.log('\n  真机失败率曲线（每关 ' + SEEDS + ' seed）：');
let line = '    ';
for (const g of gapByLevel) {
  const r = g.fail / g.tot;
  line += (r === 0 ? '·' : r < 0.34 ? '▁' : r < 0.67 ? '▄' : '█');
  if (g.n % 10 === 0) line += ' ';
}
console.log(line);
console.log('    · =0%失败   ▁ <34%   ▄ <67%   █ ≥67%    （关卡 1→' + MAXN + '，每 10 关一空格）');

console.log('\n' + (bad === 0
  ? '✅ L3 口径蕴含成立' + (staticMiss || dupes.length ? '（L1/L2 有 WARN，见上）' : '')
  : '❌ ' + bad + ' 类口径分裂 —— 红线是假绿灯，禁止 build'));
process.exit(bad === 0 ? 0 : 1);
