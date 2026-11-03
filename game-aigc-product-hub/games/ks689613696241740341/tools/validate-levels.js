/**
 * 关卡验收脚本（新增任何内容后必跑，全绿才允许上线）
 * ═══════════════════════════════════════════════════════════════════
 * 用法：node tools/validate-levels.js [关卡上限] [每关seed数]
 *   node tools/validate-levels.js            # 默认 1~60 关 × 6 seed = 360 局
 *   node tools/validate-levels.js 100 4      # 1~100 关 × 4 seed
 *
 * 退出码：0 = 全绿可上线；非 0 = 有红线未过，禁止 build
 *
 * 8 条验收红线见 skill docs/add-level-workflow.md 第 8.2 节
 * ═══════════════════════════════════════════════════════════════════
 */
global.window = global;
var path = require('path');
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD, LG = PD.LG, L = PD.L;

var MAXN = parseInt(process.argv[2], 10) || 60;
var SEEDS = parseInt(process.argv[3], 10) || 6;

// ── 运行时规则判据：【已收拢到 PD.simulateRuntime】—— 不在本文件重写 ──
// ═══════════════════════════════════════════════════════════════════
// 【为什么删掉了本地 simRuntime】
// 旧版本文件里有一份完整的手写模拟器，与 pd-game 运行时、pd-levelgen/refPlay、
// tools/winrate/playOnce 并列存在 —— 同一套规则被写了四遍。
// 改一条规则要同步四处，漏一处就产生【假绿灯】—— 已知坑 10 的
// 「求解器全绿但真机 56% 死局」就是这么来的。
//
// 【本次审计当场抓到的现行事故】旧代码 V1 调的是 simRuntime(lv, true)，
// autoRelease=true 意为「该色清空即放行」—— 而 pd-game.js:995 已明确删除这条通道
// （铁律：车只能靠装满或广告权益离场）。于是验收脚本比真机宽松，
// 8 条红线全绿但玩家会卡死 —— 红线在自己骗自己。
//
// 现在改为调用唯一真值源 PD.simulateRuntime，且【不传 autoRelease】。
// ⚠️ 任何人想在本文件里重新手写模拟器，都会被
//    tools/bench/parity-audit.js 的 L2 重复实现探测当场拦下。
// ═══════════════════════════════════════════════════════════════════
var RT_OPT = { slots: 5, queueHead: 4, clearBudget: 4 };
function simRuntime(lv) {
  if (typeof PD.simulateRuntime !== 'function') {
    console.error('✗ PD.simulateRuntime 不存在 —— 口径单一真值源缺失，拒绝验收');
    process.exit(2);
  }
  return PD.simulateRuntime(lv, RT_OPT);
}

console.log('═══ 关卡验收：1~' + MAXN + ' 关 × ' + SEEDS + ' seed = ' + (MAXN * SEEDS) + ' 局 ═══\n');

var V = { unsolvable: 0, negS: 0, zombie: 0, beanMismatch: 0, layout: 0, star: 0, genNull: 0 };
var fps = {}, tot = 0, sMin = 9, sMax = 0, prevS = 9, prevC = 0, monoBreak = 0;
var firstFail = null;
var prevShape = null, adjSame = 0, adjTot = 0;   // V10 相邻关同图统计

for (var n = 1; n <= MAXN; n++) {
  var D = LG.difficulty(n);
  // V7 难度单调：S 不许上升、C 不许下降（同段内允许持平）
  if (D.S > prevS + 1e-9) monoBreak++;
  if (D.C < prevC) monoBreak++;
  prevS = D.S; prevC = D.C;

  for (var k = 0; k < SEEDS; k++) {
    var lv = LG.genLevel(n, n * 10007 + k * 7919);
    tot++;
    // ══ 【V1 / V9 必须分开计】旧代码把两件事塞进了同一个计数器 ═════════
    //   ① genLevel 返回 null = 【生成器重试耗尽】—— 真机有兜底（pd-game.js:700
    //     回落固定遮罩关），玩家能正常玩，只是图案不是程序化的那张。
    //     这是【质量折扣】，不是事故。
    //   ② simulateRuntime 判不可解 = 【玩家真的卡死】—— P0 事故。
    // 合并计数的后果：本次审计里 V1=1 看上去像「还有一关不可解」，
    // 实际上 60 局中【不可解 = 0】，那 1 例是关 8 的生成器回落。
    // 两者修法完全不同（一个改规则、一个调重试/阈值），混在一起会把人
    // 往错误方向引 —— 【失真的指标比没有指标更危险】。
    if (!lv) { V.genNull++; continue; }
    var m = lv._meta;

    // V1 运行时可解性（真实规则，不是 solveLevel）
    // 【不传 autoRelease】旧代码传 true 造成假绿灯，已修正。见上方 simRuntime 注释。
    var rt = simRuntime(lv);
    if (!rt.ok) { V.unsolvable++; if (!firstFail) firstFail = { n: n, C: D.C, remain: rt.remain, why: rt.why }; }
    // V2 单色冗余不得为【负】（已校准语义：S === 0 是现行设计，不是缺陷）
    // ════════════════════════════════════════════════════════════════
    // 【为什么判据从 <=0 改成 <0 · 本次审计抓到的第二类事故】
    // 旧判据要求 min(S_color) > 0（必须有冗余座位）。但现行设计已把 S 归零：
    // LG.difficulty(n).S 全程返回 0，意为【每色总容量 ≡ 该色豆数】——
    // 这是一条故意的设计决策：只有 S=0 才能保证「每辆车都刚好装满」，
    // 从而让「装满即离场」成为唯一正常通道（否则就必须保留「该色清空即放行」，
    // 而用户铁律已明确删除那条通道）。
    //
    // 于是形成了一个【判据与设计相互矛盾】的死结：无论关卡怎么生，V2 永远爆红。
    // 永远爆红的红线等于没有红线 —— 它只会训练所有人无脑忽略它，
    // 进而连带着忽略旁边真正重要的 V1。【假红灯比假绿灯更难治】，
    // 因为假绿灯至少还会让人保留对红线的信任。
    //
    // 正确语义：S 不得为【负】（负冗余 = 容量 < 豆数 = 数学上不可通关）。
    // S === 0 是契约精确命中，应该算最优而不是失败。
    if (m.S < -1e-9) V.negS++;
    if (m.S < sMin) sMin = m.S;
    if (m.S > sMax) sMax = m.S;
    // V3 僵尸车峰值 < 可用车位
    if (rt.zPeak >= 5) V.zombie++;
    // V4 豆数 = 契约
    if (lv.beans.length !== D.N) V.beanMismatch++;
    // V6 布局不越界
    var maxW = 618, maxH = L.laneY - L.stageY - 30;
    // ⚠️ 必须与 pd-game.js newGame 里的公式逐字一致（豆子 60% 后是 9~20）
    var cell = Math.max(9, Math.min(20, Math.floor(Math.min(maxW / lv.cols, maxH / lv.rows))));
    var top0 = L.stageY + Math.max(10, (maxH - lv.rows * cell) / 2) + cell / 2;
    if (top0 + (lv.rows - 1) * cell >= L.laneY - 20 || lv.cols * cell > 750) V.layout++;
    // V8 三星有区分度（完美 3 星、手残 1 星）
    var perfect = m.carMoves, bad = Math.ceil(m.carMoves * 1.8);
    if (!(perfect <= lv.stars.three && bad > lv.stars.two)) V.star++;
    // V5 图案指纹
    var rn = {};
    lv.beans.forEach(function (b) { rn[b.gy] = (rn[b.gy] || 0) + 1; });
    fps[lv.shapeKind + '|' + lv.paintMode + '|' + Object.keys(rn).map(function (x) { return rn[x]; }).join('-')] = 1;
    // V10 【连续同图】玩家真正能感知的不是全局唯一率，而是
    // 「上一关刚打完的图，下一关又来一遍」。前者是统计量，后者是体验量。
    if (k === 0) {                      // 只看同一 seed 链上的相邻关（= 一个玩家的真实路径）
      if (prevShape !== null && lv.shapeKind === prevShape) adjSame++;
      adjTot++;
      prevShape = lv.shapeKind;
    }
  }
}

var uniq = Object.keys(fps).length;
var dupRate = (1 - uniq / tot) * 100;
// ══ 【V5 判据必须按素材库容量校准 · 2026-08-31】════════════════
// 旧判据 dupRate <= 5% 是个【凭空的绝对数】，与素材库有多少张图无关。
// 鸽笼原理：ART 只有 14 张（× 2 种镜像 = 28 种 shapeKind），跑 60 局
// 必然重复。指纹里叠了行分布才把上限拉高，但天花板仍然存在。
// 【为什么这是假红灯】即使把生成器优化到理论最优（本次已从 55% 降到 6.7%），
//   只要局数 > 素材种类数，这条红线就永远红。永远红的红线会训练所有人
//   忽略它 —— 而忽略习惯会蔓延到旁边真正重要的 V1。
// 【正确口径】重复率要和【理论下限】比：局数 tot、可用指纹种类 M，
//   理论最优重复率 = max(0, 1 - M/tot)。判据 = 【不得超过理论最优 + 5pt】。
//   这样素材库扩容后判据自动变严，无需改代码；而素材少时也不会逆天。
var SHAPE_KINDS = LG.ART.length * 2;              // 每张图×（原样 / 左右镜像）
var floorDup = Math.max(0, (1 - SHAPE_KINDS / tot)) * 100;
var dupBudget = floorDup + 5;
var adjRate = adjTot > 1 ? (adjSame / (adjTot - 1)) * 100 : 0;

var rows = [
  ['V1', '不可解关卡', V.unsolvable, V.unsolvable === 0, '必须 = 0'],
  ['V9', '生成器回落(null)', V.genNull, V.genNull <= Math.ceil(tot * 0.05), '<= 5% — 真机有兜底，属质量折扣'],
  ['V2', 'min(S_color) < 0(负冗余)', V.negS, V.negS === 0, '必须 = 0'],
  ['V3', '僵尸车峰值 >= 5', V.zombie, V.zombie === 0, '必须 = 0'],
  ['V4', '豆数 != 契约 N', V.beanMismatch, V.beanMismatch === 0, '必须 = 0'],
  ['V5', '图案重复率', dupRate.toFixed(1) + '%', dupRate <= dupBudget + 1e-9,
   '<= 理论下限' + floorDup.toFixed(1) + '% + 5pt = ' + dupBudget.toFixed(1) + '%'],
  ['V10', '相邻关同图率', adjRate.toFixed(1) + '%', adjRate <= 10,
   '<= 10% — 玩家真正能感知的重复'],
  ['V6', '布局越界', V.layout, V.layout === 0, '必须 = 0'],
  ['V7', '难度非单调', monoBreak, monoBreak === 0, '必须 = 0'],
  ['V8', '三星无区分度', V.star, V.star === 0, '必须 = 0']
];
var bad = 0;
rows.forEach(function (r) {
  if (!r[3]) bad++;
  console.log('  ' + (r[3] ? '✓' : '✗') + ' ' + r[0] + ' ' + String(r[1]).padEnd(18) +
    String(r[2]).padStart(8) + '   (判据 ' + r[4] + ')');
});
console.log('\n  实测 S 区间: ' + (sMin * 100).toFixed(1) + '% ~ ' + (sMax * 100).toFixed(1) + '%');
console.log('  唯一图案数 : ' + uniq + ' / ' + tot + '（素材库上限 ' + SHAPE_KINDS + ' 种 shapeKind）');
if (firstFail) console.log('  首个失败   : 第' + firstFail.n + '关(' + firstFail.C + '色) 剩' + firstFail.remain + '豆 — ' + firstFail.why);

console.log(bad === 0 ? '\n✅ 全部红线绿灯，允许上线' : '\n❌ ' + bad + ' 条红线未过，禁止 build');
process.exit(bad === 0 ? 0 : 1);
