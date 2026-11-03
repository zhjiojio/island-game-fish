/**
 * measure-td.js —— 难度的「真实」度量：容错率 T 与陷阱深度 D
 *
 * 【为什么要有这个工具】
 * 之前我们用「随机策略跑 N 局算胜率」来衡量难度，这是错的。实测同一批关卡：
 *   casual(20%手滑) → 40% ／ patient(只放确定能装的) → 3% ／ sequential → 0%
 * 同一个关卡，胜率从 40% 摆到 0%。说明那个数字量的不是关卡难度，
 * 而是「某个特定策略的失误率」。真人不手滑 → 永远不输 → 「随便就能过关」。
 *
 * 正确的难度定义必须是关卡的【内在属性】，与玩家策略无关：
 *   T（Tolerance 容错率）= 安全首步 / 可选首步
 *       在每个决策点枚举所有可放的车，问「放了它之后局面是否仍可解」。
 *       T=1.0 → 随便放都能过 = 零难度（当前状态）
 *       T=0.5 → 一半的选择会走进死路
 *   D（Trap Depth 陷阱深度）= 走出错误一步后，还能继续走多少步才暴露
 *       D=1 即时惩罚；D=8 是「八步后才发现刚才那步错了」——
 *       这就是用户校准的「过早放上去 → 浪费一个坑位」的数学表达。
 *
 * 【口径必须与运行时一致】判定「是否仍可解」用的是 pd-core 的 solveLevel，
 * 它已经删掉了「该色清空就自动放行」这条比运行时宽松的通道。
 */
'use strict';
global.window = global;
var path = require('path');
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD, LG = PD.LG;

// ── 局面快照：把「关卡 + 已消耗状态」打包成 solveLevel 能吃的 lv 形状 ──
// 【为什么要重新打包】solveLevel 只接受完整 lv 对象。要判断「放了车 X 之后还可解吗」，
// 必须构造一个「豆阵已少掉若干颗 + 队列已少掉车 X + 车位上已有 X」的中间局面。
function snapshot(st) {
  var beans = [], i;
  for (i = 0; i < st.beans.length; i++) {
    if (!st.beans[i].gone) beans.push({
      id: st.beans[i].id, color: st.beans[i].color,
      gx: st.beans[i].gx, gy: st.beans[i].gy, layer: st.beans[i].layer, gone: false
    });
  }
  // 在场车折算成「队列最前面的车」——solveLevel 会先把它们放进车位。
  // 注意 left 而非 cap：在场车已经装了一部分。
  var cars = [];
  for (i = 0; i < st.slots.length; i++) {
    var c = st.slots[i];
    if (c) cars.push({ color: c.color, cap: c.left, decoy: c.decoy || 0, _onboard: 1 });
  }
  for (i = 0; i < st.queue.length; i++) if (st.queue[i]) cars.push(st.queue[i]);
  for (i = 0; i < st.pend.length; i++) cars.push(st.pend[i]);
  return { beans: beans, cars: cars, cols: st.cols, rows: st.rows, slots: st.S, stars: {} };
}

function solvable(st) {
  var snap = snapshot(st);
  if (!snap.beans.length) return true;
  try {
    var r = PD.solveLevel(snap, { slots: st.S, walk: true });
    // 【字段名必须核对】solveLevel 返回的是 { solvable, carMoves, ... }，不是 .ok。
    // 读错字段会永远得到 undefined → 全部判为不可解 → T 恒等于 0，
    // 那是工具 bug 冒充「难度极高」，比没有工具更危险。
    return !!(r && r.solvable);
  } catch (e) { return false; }
}

// ── 工具自检：不可跳过 ──────────────────────────────────────
// 【为什么必须有】T 是个「看起来很专业的数字」，一旦工具有 bug，
// 它会安静地给出一个可信的假值（比如 T=0），而我会拿着它去调参数。
// 上一轮的教训就是「先出数字后自我论证」。所以先证明工具能分辨黑白：
//   ① 原始关卡必须判为可解（生成器保证了 Feasible）
//   ② 人为破坏（挪掉一辆必需的车）后必须判为不可解
// 两条都过，T 才有资格被解读。
function selfTest() {
  var lv = LG.genLevel(2, 12345);
  if (!lv) return { ok: false, why: 'genLevel 失败' };
  var st = initState(lv, 6);
  settle(st);
  var pos = solvable(st);
  // 破坏：把队列与 pend 里所有车删掉一半容量 → 总容量 < 豆数 → 必然不可解
  var bad = cloneState(st);
  bad.pend = [];
  for (var i = 4; i < 8; i++) bad.queue[i] = null;
  var neg = solvable(bad);
  return { ok: (pos === true && neg === false), positive: pos, negative: neg };
}

// ── 初始状态 ────────────────────────────────────────────────
function initState(lv, S) {
  var beans = lv.beans.map(function (b) {
    return { id: b.id, color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false, moving: false };
  });
  var q8 = [null, null, null, null, null, null, null, null], pend = [], i;
  for (i = 0; i < lv.cars.length; i++) { if (i < 8) q8[i] = lv.cars[i]; else pend.push(lv.cars[i]); }
  var slots = []; for (i = 0; i < S; i++) slots.push(null);
  return {
    beans: beans, queue: q8, pend: pend, slots: slots,
    cols: lv.cols, rows: lv.rows, S: S,
    bd: PD.buildBounds(beans), remain: beans.length
  };
}

function cloneState(st) {
  var beans = st.beans.map(function (b) {
    return { id: b.id, color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: b.gone, moving: false };
  });
  return {
    beans: beans,
    queue: st.queue.slice(),
    pend: st.pend.slice(),
    slots: st.slots.map(function (c) { return c ? { color: c.color, cap: c.cap, left: c.left, decoy: c.decoy, loaded: c.loaded } : null; }),
    cols: st.cols, rows: st.rows, S: st.S,
    bd: PD.buildBounds(beans), remain: st.remain
  };
}

// ── 自动结算：装豆 + 装满离场（与运行时同口径，不含「该色清空放行」）──
function settle(st) {
  var guard = 0;
  while (guard++ < 100000) {
    var top = PD.buildTopIndex(st.beans);
    var occ = PD.buildOccupancy(st.beans);
    var did = false, s, i;
    for (s = 0; s < st.slots.length; s++) {
      var car = st.slots[s];
      if (!car || car.left <= 0) continue;
      for (i = 0; i < st.beans.length; i++) {
        var b = st.beans[i];
        if (b.gone || b.color !== car.color) continue;
        if (!PD.isPickable(b, top) || !PD.pathOut(b, occ, st.bd, null)) continue;
        b.gone = true; car.left--; car.loaded = (car.loaded || 0) + 1;
        st.remain--; did = true;
        top = PD.buildTopIndex(st.beans); occ = PD.buildOccupancy(st.beans);
        if (car.left === 0) break;
      }
      // 【运行时唯一的正常离场规则】装满才走。装不满的车永远占位 = 僵尸。
      if (car.left === 0) { st.slots[s] = null; did = true; }
    }
    if (!did) break;
  }
}

function takeFromQueue(st, qi) {
  var c = st.queue[qi];
  st.queue[qi] = null;
  // 固定 8 格稀疏队列：后排补前排，pend 补后排（与 pd-game 同规则）
  if (qi < 4 && st.queue[qi + 4]) {
    st.queue[qi] = st.queue[qi + 4]; st.queue[qi + 4] = null;
    if (st.pend.length) st.queue[qi + 4] = st.pend.shift();
  }
  return c;
}

function freeSlot(st) { for (var i = 0; i < st.slots.length; i++) if (!st.slots[i]) return i; return -1; }

/**
 * 测一局的 T 与 D。
 * T：每个决策点上「安全步/可选步」的平均值。
 * D：对每个不安全步，测「走错之后还能再走多少步才真正无解」。
 */
function measure(lv, S, opt) {
  opt = opt || {};
  var maxDecisions = opt.maxDecisions || 12;   // 只测前若干个决策点（全测太慢）
  var probeD = opt.probeD !== false;
  var st = initState(lv, S);
  settle(st);
  var Ts = [], Ds = [], decisions = 0, guard = 0;

  while (st.remain > 0 && decisions < maxDecisions && guard++ < 500) {
    var fi = freeSlot(st);
    if (fi < 0) break;                                  // 车位满 → 无决策可做
    var avail = [];
    for (var i = 0; i < 4; i++) if (st.queue[i]) avail.push(i);   // 只有前 4 格可拖
    if (!avail.length) break;
    if (avail.length < 2) {                             // 只有一个选择 → 不构成决策
      var only = takeFromQueue(st, avail[0]);
      st.slots[fi] = { color: only.color, cap: only.cap, left: only.cap, decoy: only.decoy || 0, loaded: 0 };
      settle(st);
      continue;
    }

    var safe = 0, unsafe = [];
    for (var a = 0; a < avail.length; a++) {
      var trial = cloneState(st);
      var pk = takeFromQueue(trial, avail[a]);
      trial.slots[freeSlot(trial)] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0, loaded: 0 };
      settle(trial);
      if (solvable(trial)) safe++; else unsafe.push(avail[a]);
    }
    Ts.push(safe / avail.length);
    decisions++;

    // ── D：走错一步之后，还能"若无其事"地走多少步 ──
    if (probeD && unsafe.length) {
      var wrong = cloneState(st);
      var wp = takeFromQueue(wrong, unsafe[0]);
      wrong.slots[freeSlot(wrong)] = { color: wp.color, cap: wp.cap, left: wp.cap, decoy: wp.decoy || 0, loaded: 0 };
      settle(wrong);
      var steps = 0, g2 = 0;
      // 「还能走」= 还有豆能上车 或 还能放车。走到彻底动不了为止。
      while (g2++ < 60) {
        var f2 = freeSlot(wrong);
        var av2 = [];
        for (var j = 0; j < 4; j++) if (wrong.queue[j]) av2.push(j);
        if (f2 < 0 || !av2.length) break;
        var before = wrong.remain;
        var p2 = takeFromQueue(wrong, av2[0]);
        wrong.slots[f2] = { color: p2.color, cap: p2.cap, left: p2.cap, decoy: p2.decoy || 0, loaded: 0 };
        settle(wrong);
        steps++;
        if (wrong.remain === before && f2 === freeSlot(wrong)) break;   // 毫无进展 → 卡死
      }
      Ds.push(steps);
    }

    // 主线：走一步安全的（没有安全步就走第一个，反映真实困境）
    var pick = -1;
    for (var b2 = 0; b2 < avail.length; b2++) if (unsafe.indexOf(avail[b2]) < 0) { pick = avail[b2]; break; }
    if (pick < 0) pick = avail[0];
    var mv = takeFromQueue(st, pick);
    st.slots[freeSlot(st)] = { color: mv.color, cap: mv.cap, left: mv.cap, decoy: mv.decoy || 0, loaded: 0 };
    settle(st);
  }

  function avg(a) { var s = 0, i; if (!a.length) return null; for (i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  return { T: avg(Ts), D: avg(Ds), decisions: decisions, TList: Ts };
}

// ── CLI ─────────────────────────────────────────────────────
if (require.main === module) {
  // 【门禁】先跑自检，不过就不允许输出任何 T 值。
  var stv = selfTest();
  console.log('工具自检：原关卡可解=' + stv.positive + '  人为破坏后可解=' + stv.negative +
              '  → ' + (stv.ok ? '✅ 能分辨黑白' : '❌ 工具不可信，拒绝输出'));
  if (!stv.ok) process.exit(1);
  console.log('');
  var levels = process.argv[2] ? process.argv[2].split(',').map(Number) : [1, 2, 5, 10, 25];
  var seeds = +(process.argv[3] || 3);
  var S = +(process.argv[4] || 6);
  var out = [];
  console.log('关卡难度真实度量  车位S=' + S + '  seeds=' + seeds);
  console.log('T=容错率(安全步/可选步, 1.0=随便放都能过)  D=陷阱深度(走错后还能走几步)');
  console.log('关 |  豆数 | 色 |   T   |  D   | 决策点');
  for (var li = 0; li < levels.length; li++) {
    var n = levels[li], Tsum = 0, Dsum = 0, Tn = 0, Dn = 0, bean = 0, col = 0, cnt = 0;
    for (var k = 0; k < seeds; k++) {
      var lv = LG.genLevel(n, (n * 7919 + k * 104729) >>> 0);
      if (!lv) continue;
      var m = measure(lv, S, { maxDecisions: 10 });
      if (m.T !== null) { Tsum += m.T; Tn++; }
      if (m.D !== null) { Dsum += m.D; Dn++; }
      var cs = {}; for (var q = 0; q < lv.beans.length; q++) cs[lv.beans[q].color] = 1;
      bean += lv.beans.length; col += Object.keys(cs).length; cnt++;
    }
    if (!cnt) continue;
    var T = Tn ? Tsum / Tn : null, D = Dn ? Dsum / Dn : null;
    out.push({ level: n, beans: Math.round(bean / cnt), colors: +(col / cnt).toFixed(1), T: T, D: D });
    console.log(String(n).padStart(2) + ' | ' + String(Math.round(bean / cnt)).padStart(5) + ' | ' +
      String((col / cnt).toFixed(1)).padStart(3) + ' | ' +
      (T === null ? '  n/a' : T.toFixed(3)).padStart(6) + ' | ' +
      (D === null ? ' n/a' : D.toFixed(1)).padStart(5) + ' | ' + Tn);
  }
  require('fs').writeFileSync('/tmp/td-result.json', JSON.stringify(out, null, 2));
  console.log('\n→ /tmp/td-result.json');
}
module.exports = { measure: measure, initState: initState, settle: settle, solvable: solvable };
