#!/usr/bin/env node
/**
 * 第 2 关终局调参 —— 硬约束：① 保留像素画原生颜色（形状必须好看）② 普通玩家胜率 ≈50%
 * ═══════════════════════════════════════════════════════════════════
 * 已排除的方向：
 *   ✗ 深度分环重新上色 —— 能到 +19pt 增益，但图案变同心色环，用户否决
 *   ✗ 只调 capMax/容量阶梯/干扰车 —— 45 组全扫，车位占用恒<0.4，增益恒 0
 *
 * 本轮四个组合旋钮（全部不碰规则、不碰形状、不碰颜色）：
 *   A. 图案筛选 spreadMin —— 只用【原生颜色天然横跨剥离深度】的模板
 *      实测 house(均spread 0.73) / fish(cy 1.00) 天生就有依赖链，melon(bl 0.22) 没有
 *   B. capMax —— 车越大越吃不满 → 越可能占位等
 *   C. 车队排序 queueMode —— 【最重要的未测杠杆】
 *      现状 shuffle 是"加权随机打散"，等于主动帮玩家把不同色摊开。
 *      cluster  = 同色成龙（前4格常同色 → 该色取不到就全部空转）
 *      deepFirst= 内层色排前面（开局队列里全是"现在还取不到"的色）
 *   D. 干扰车 decoy
 */
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD, LG = PD.LG;

function mkRnd(s) {
  s = (s | 0) || 1; if (s < 0) s = -s;
  return function () { s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0; return ((s >>> 0) % 100000) / 100000; };
}
function depthInfo(beans) {
  var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, i;
  for (i = 0; i < beans.length; i++) {
    var b = beans[i];
    if (b.gx < minx) minx = b.gx; if (b.gx > maxx) maxx = b.gx;
    if (b.gy < miny) miny = b.gy; if (b.gy > maxy) maxy = b.gy;
  }
  var rows = maxy - miny + 1, cols = maxx - minx + 1, grid = [], r, c;
  for (r = 0; r < rows; r++) { var row = []; for (c = 0; c < cols; c++) row.push(null); grid.push(row); }
  for (i = 0; i < beans.length; i++) grid[beans[i].gy - miny][beans[i].gx - minx] = 1;
  var pd = LG.peelDepth(grid, rows, cols);
  var d = [], byCol = {};
  for (i = 0; i < beans.length; i++) {
    var dd = pd.d[beans[i].gy - miny][beans[i].gx - minx];
    d.push(dd);
    var col = beans[i].color;
    if (!byCol[col]) byCol[col] = { n: 0, layers: {}, maxD: 0 };
    byCol[col].n++; byCol[col].layers[dd] = 1;
    if (dd > byCol[col].maxD) byCol[col].maxD = dd;
  }
  // 平均 spread：每色深度跨度 / 总深度
  var sum = 0, cn = 0;
  for (var k in byCol) { sum += Object.keys(byCol[k].layers).length / Math.max(1, pd.maxDepth); cn++; }
  return { d: d, maxDepth: pd.maxDepth, byCol: byCol, avgSpread: sum / Math.max(1, cn) };
}

/** 车队排序：只改顺序，不改任何车的颜色/容量 */
function reorder(cars, mode, seed, depthByColor) {
  var rnd = mkRnd(seed), i, out;
  if (mode === 'cluster') {
    // 同色成龙：按颜色分桶，桶顺序随机，桶内保持
    var bk = {}, keys = [];
    for (i = 0; i < cars.length; i++) { if (!bk[cars[i].color]) { bk[cars[i].color] = []; keys.push(cars[i].color); } bk[cars[i].color].push(cars[i]); }
    for (i = keys.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = keys[i]; keys[i] = keys[j]; keys[j] = t; }
    out = [];
    for (i = 0; i < keys.length; i++) out = out.concat(bk[keys[i]]);
    return out;
  }
  if (mode === 'deepFirst') {
    // 内层色（该色最浅深度越大 = 越晚暴露）排前面 → 开局队列里全是取不到的色
    out = cars.slice();
    out.sort(function (a, b) {
      var da = depthByColor[a.color] === undefined ? 0 : depthByColor[a.color];
      var db = depthByColor[b.color] === undefined ? 0 : depthByColor[b.color];
      return db - da || (rnd() - 0.5);
    });
    return out;
  }
  if (mode === 'bigFirst') {
    out = cars.slice();
    out.sort(function (a, b) { return b.cap - a.cap || (rnd() - 0.5); });
    return out;
  }
  return cars;   // shuffle = 现状（deriveCars 已做加权随机打散）
}

function play(lv, policy, rnd) {
  var beans = lv.beans.map(function (b) { return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false }; });
  var bd = PD.buildBounds(beans);
  var q8 = [], pend = [], i;
  for (i = 0; i < lv.cars.length; i++) { if (i < 8) q8.push(lv.cars[i]); else pend.push(lv.cars[i]); }
  while (q8.length < 8) q8.push(null);
  var slots = [null, null, null, null, null], USABLE = 5;
  var remain = beans.length, guard = 0, moves = 0;
  var Esum = 0, En = 0, occSum = 0, occN = 0, occMax = 0, Wsum = 0, Wn = 0, Wzero = 0, tight = 0;
  function take(qi) {
    var c = q8[qi]; q8[qi] = null;
    if (qi < 4 && q8[qi + 4]) { q8[qi] = q8[qi + 4]; q8[qi + 4] = null; if (pend.length) q8[qi + 4] = pend.shift(); }
    return c;
  }
  function res(w) {
    return { win: w, moves: moves, occ: occSum / Math.max(1, occN), occMax: occMax,
             E: Esum / Math.max(1, En), Wz: Wzero / Math.max(1, Wn), tight: tight / Math.max(1, occN) };
  }
  while (remain > 0 && guard++ < 80000) {
    var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans), did = false, s;
    for (s = 0; s < USABLE; s++) {
      var car = slots[s];
      if (!car || car.left <= 0) continue;
      for (i = 0; i < beans.length; i++) {
        var b = beans[i];
        if (b.gone || b.color !== car.color) continue;
        if (!PD.isPickable(b, top) || !PD.pathOut(b, occ, bd, null)) continue;
        b.gone = true; car.left--; remain--; did = true;
        top = PD.buildTopIndex(beans); occ = PD.buildOccupancy(beans);
        if (car.left === 0) break;
      }
      if (car.left === 0) slots[s] = null;
    }
    if (did) continue;
    if (remain === 0) break;
    var exp = {}, rest = {};
    for (i = 0; i < beans.length; i++) {
      var b3 = beans[i]; if (b3.gone) continue;
      rest[b3.color] = (rest[b3.color] || 0) + 1;
      if (PD.isPickable(b3, top) && PD.pathOut(b3, occ, bd, null)) exp[b3.color] = (exp[b3.color] || 0) + 1;
    }
    var usedN = 0; for (s = 0; s < USABLE; s++) if (slots[s]) usedN++;
    occSum += usedN; occN++; if (usedN > occMax) occMax = usedN; if (usedN >= USABLE - 1) tight++;
    var W = 0, av = 0;
    for (i = 0; i < 4; i++) { if (!q8[i]) continue; av++; if (!exp[q8[i].color]) W++; }
    if (av) { Wsum += W; Wn++; if (!W) Wzero++; }
    var fi = -1;
    for (s = 0; s < USABLE; s++) if (!slots[s]) { fi = s; break; }
    if (fi < 0) return res(false);
    var best = -1;
    if (policy === 'random') { var a2 = []; for (i = 0; i < 4; i++) if (q8[i]) a2.push(i); if (a2.length) best = a2[Math.floor(rnd() * a2.length)]; }
    else if (policy === 'smart') {
      var bs = -1e9;
      for (i = 0; i < 4; i++) {
        if (!q8[i]) continue;
        var e = (exp[q8[i].color] || 0) - q8[i].cap;
        if (!exp[q8[i].color]) e -= 1000;
        if (e > bs) { bs = e; best = i; }
      }
    }
    else { for (i = 0; i < 4; i++) if (q8[i] && exp[q8[i].color]) { best = i; break; } }
    if (best < 0) { for (i = 0; i < 4; i++) if (q8[i] && rest[q8[i].color]) { best = i; break; } }
    if (best < 0) { for (i = 0; i < 4; i++) if (q8[i]) { best = i; break; } }
    if (best < 0) return res(false);
    var pk = q8[best];
    Esum += (exp[pk.color] || 0) / Math.max(1, pk.cap); En++;
    take(best);
    slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0 };
    moves++;
  }
  return res(remain === 0);
}

var RUNS = parseInt(process.argv[2], 10) || 14;
var CASES = [];
['shuffle', 'cluster', 'deepFirst', 'bigFirst'].forEach(function (q) {
  [13, 20, 26, 33].forEach(function (cap) {
    [0, 2].forEach(function (dec) {
      CASES.push({ q: q, cap: cap, dec: dec });
    });
  });
});

console.log('═══ 第 2 关终局：保留原生颜色（形状好看）+ 目标胜率 50%（' + RUNS + ' 局/组合）═══');
console.log('排序       cap decoy | 车数 | spread 车位占用 峰值 紧张率 | E均值 Wzero | 随手 普通 老手 | 增益');
var out = [];
CASES.forEach(function (cs) {
  var wR = 0, wC = 0, wS = 0, aOcc = 0, aMax = 0, aE = 0, aWz = 0, aCars = 0, aT = 0, aSp = 0;
  for (var t = 0; t < RUNS; t++) {
    var sd = (2 * 7919 + t * 104729) >>> 0;
    var lv = LG.genLevel(2, sd, { forceDecoy: 0 });        // 原生颜色，图案不动
    var info = depthInfo(lv.beans);
    aSp += info.avgSpread;
    // 每色的"最浅深度"（越大 = 越晚暴露）
    var minD = {};
    for (var z = 0; z < lv.beans.length; z++) {
      var col = lv.beans[z].color, dd = info.d[z];
      if (minD[col] === undefined || dd < minD[col]) minD[col] = dd;
    }
    lv.cars = PD.deriveCars(lv.counts, 0, cs.cap, sd ^ 0x77);
    lv.cars = reorder(lv.cars, cs.q, sd ^ 0xa1, minD);
    if (cs.dec > 0) lv.cars = LG.injectDecoys(lv.cars, Object.keys(lv.counts), lv.counts, cs.dec, sd ^ 0x31);
    aCars += lv.cars.length;
    var r1 = play(lv, 'random', mkRnd(sd + 1));
    var r2 = play(lv, 'casual', mkRnd(sd + 2));
    var r3 = play(lv, 'smart', mkRnd(sd + 3));
    if (r1.win) wR++; if (r2.win) wC++; if (r3.win) wS++;
    aOcc += r2.occ; aMax += r2.occMax; aE += r2.E; aWz += r2.Wz; aT += r2.tight;
  }
  var pr = wR / RUNS * 100, pc = wC / RUNS * 100, ps = wS / RUNS * 100;
  var row = { q: cs.q, cap: cs.cap, dec: cs.dec, pr: pr, pc: pc, ps: ps, gain: ps - pc,
              occ: aOcc / RUNS, max: aMax / RUNS, E: aE / RUNS, Wz: aWz / RUNS * 100,
              cars: aCars / RUNS, tight: aT / RUNS * 100, sp: aSp / RUNS };
  out.push(row);
  console.log(
    cs.q.padEnd(10) + String(cs.cap).padStart(4) + String(cs.dec).padStart(6) + ' | ' +
    row.cars.toFixed(1).padStart(4) + ' | ' + row.sp.toFixed(2).padStart(6) + ' ' +
    row.occ.toFixed(2).padStart(8) + ' ' + row.max.toFixed(1).padStart(4) + ' ' + row.tight.toFixed(0).padStart(5) + '% | ' +
    row.E.toFixed(2).padStart(5) + ' ' + row.Wz.toFixed(0).padStart(4) + '% | ' +
    pr.toFixed(0).padStart(4) + '% ' + pc.toFixed(0).padStart(4) + '% ' + ps.toFixed(0).padStart(4) + '% | ' +
    (row.gain >= 0 ? '+' : '') + row.gain.toFixed(0) + 'pt'
  );
});
console.log('\n═══ 命中目标（普通 42~58% 且 增益>=15pt）═══');
var ok = out.filter(function (r) { return r.pc >= 42 && r.pc <= 58 && r.gain >= 15; });
ok.sort(function (a, b) { return b.gain - a.gain; });
if (!ok.length) {
  console.log('（无完美命中）离 50% 最近的 6 个：');
  out.sort(function (a, b) { return Math.abs(a.pc - 50) - Math.abs(b.pc - 50) || (b.gain - a.gain); });
  ok = out.slice(0, 6);
}
ok.slice(0, 8).forEach(function (r) {
  console.log('  ' + r.q + ' cap=' + r.cap + ' decoy=' + r.dec +
    ' → 普通 ' + r.pc.toFixed(0) + '% / 老手 ' + r.ps.toFixed(0) + '% (' + (r.gain >= 0 ? '+' : '') + r.gain.toFixed(0) + 'pt)' +
    '  车位占用 ' + r.occ.toFixed(2) + ' 峰值 ' + r.max.toFixed(1) + ' 紧张 ' + r.tight.toFixed(0) + '% E=' + r.E.toFixed(2));
});
