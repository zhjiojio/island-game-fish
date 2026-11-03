#!/usr/bin/env node
/**
 * 第 2 关「豆的颜色组合」实验 —— 核心变量：颜色是否横跨剥离深度
 * ═══════════════════════════════════════════════════════════════════
 * 上一轮已证明：只调车/容量/干扰车，车位占用恒 <0.4/5，胜率恒 90~100%，技术增益恒 0。
 * 根因：颜色成块连续 → 一辆车进场能把该色吃到底 → 车位秒回收 → 无压力。
 *
 * 本轮唯一变量 = 上色策略（豆的颜色怎么分布），车队仍由豆数反推（规则零改动）：
 *   art   ：现状。用像素画自带色（黑边一圈/红肉一片）→ 颜色成块
 *   ring  ：按剥离深度分环，color = floor(depth/band) % C → 每色横跨全深度
 *   itl   ：深度交错。同一深度内也按位置切分 → 每色既横跨深度又分散
 *   hybrid：保留最外轮廓色（视觉不崩），内部按深度分环
 *
 * 预期：颜色横跨深度 → 车吃不满 → 必须占位等 → 车位占用↑ → 才有"给谁留位"的决策
 */
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD, LG = PD.LG;
var COLOR_ORDER = ['pink', 'cyan', 'yellow', 'white', 'green', 'red', 'black'];

function mkRnd(s) {
  s = (s | 0) || 1; if (s < 0) s = -s;
  return function () { s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0; return ((s >>> 0) % 100000) / 100000; };
}

/** 由 beans 计算每颗豆的剥离深度 */
function depthMap(beans) {
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
  var d = [];
  for (i = 0; i < beans.length; i++) d.push(pd.d[beans[i].gy - miny][beans[i].gx - minx]);
  return { d: d, maxDepth: pd.maxDepth };
}

/** 重新上色（豆的位置完全不动，只改颜色）。返回 counts */
function repaint(beans, mode, C, seed, band) {
  var rnd = mkRnd(seed), dm = depthMap(beans), i;
  var colors = COLOR_ORDER.slice(0, C);
  var total = beans.length;
  var quota = [], base = Math.floor(total / C), rem = total - base * C;
  for (i = 0; i < C; i++) quota.push(base + (i < rem ? 1 : 0));
  var used = []; for (i = 0; i < C; i++) used.push(0);
  band = band || 1;

  // 建立分配顺序 + 每颗豆的"倾向色"
  var idx = [];
  for (i = 0; i < beans.length; i++) idx.push(i);

  function prefOf(i) {
    var d = dm.d[i];
    if (mode === 'ring') return Math.floor(d / band) % C;
    if (mode === 'itl') {
      // 深度分环 + 环内按 x 切片 → 同深度也混色，每色更碎更分散
      var slice = Math.floor((beans[i].gx + 100) / 3);
      return (Math.floor(d / band) + slice) % C;
    }
    if (mode === 'hybrid') {
      // 最外 2 层保留为固定一色（视觉轮廓），内部按深度分环
      if (d <= 1) return C - 1;
      return Math.floor((d - 2) / band) % Math.max(1, C - 1);
    }
    return 0;
  }
  // 按深度排序分配（保证环状结构稳定），配额满则顺延
  idx.sort(function (a, b) { return dm.d[a] - dm.d[b] || (rnd() - 0.5); });
  var cnt = {};
  for (var z = 0; z < idx.length; z++) {
    var bi = idx[z], k = prefOf(bi), tries = 0;
    while (used[k] >= quota[k] && tries++ < C) k = (k + 1) % C;
    used[k]++;
    beans[bi].color = colors[k];
    cnt[colors[k]] = (cnt[colors[k]] || 0) + 1;
  }
  return cnt;
}

function play(lv, policy, rnd) {
  var beans = lv.beans.map(function (b) { return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false }; });
  var bd = PD.buildBounds(beans);
  var q8 = [], pend = [], i;
  for (i = 0; i < lv.cars.length; i++) { if (i < 8) q8.push(lv.cars[i]); else pend.push(lv.cars[i]); }
  while (q8.length < 8) q8.push(null);
  var slots = [null, null, null, null, null], USABLE = 5;
  var remain = beans.length, guard = 0, moves = 0;
  var Esum = 0, En = 0, occSum = 0, occN = 0, Wsum = 0, Wn = 0, Wzero = 0, occMax = 0;
  function take(qi) {
    var c = q8[qi]; q8[qi] = null;
    if (qi < 4 && q8[qi + 4]) { q8[qi] = q8[qi + 4]; q8[qi + 4] = null; if (pend.length) q8[qi + 4] = pend.shift(); }
    return c;
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
    occSum += usedN; occN++; if (usedN > occMax) occMax = usedN;
    var W = 0, av = 0;
    for (i = 0; i < 4; i++) { if (!q8[i]) continue; av++; if (!exp[q8[i].color]) W++; }
    if (av) { Wsum += W; Wn++; if (!W) Wzero++; }
    var fi = -1;
    for (s = 0; s < USABLE; s++) if (!slots[s]) { fi = s; break; }
    if (fi < 0) return { win: false, moves: moves, occ: occSum / Math.max(1, occN), occMax: occMax, E: Esum / Math.max(1, En), Wz: Wzero / Math.max(1, Wn) };
    var best = -1;
    if (policy === 'random') { var a2 = []; for (i = 0; i < 4; i++) if (q8[i]) a2.push(i); if (a2.length) best = a2[Math.floor(rnd() * a2.length)]; }
    else if (policy === 'smart') {
      // 老手：优先「暴露豆数 >= 车容量」的车（能吃满就走，不占位）
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
    if (best < 0) return { win: false, moves: moves, occ: occSum / Math.max(1, occN), occMax: occMax, E: Esum / Math.max(1, En), Wz: Wzero / Math.max(1, Wn) };
    var pk = q8[best];
    Esum += (exp[pk.color] || 0) / Math.max(1, pk.cap); En++;
    take(best);
    slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0 };
    moves++;
  }
  return { win: remain === 0, moves: moves, occ: occSum / Math.max(1, occN), occMax: occMax, E: Esum / Math.max(1, En), Wz: Wzero / Math.max(1, Wn) };
}

var RUNS = parseInt(process.argv[2], 10) || 8;
// 上色策略 × 色数 × 环宽 × capMax
var CASES = [
  { m: 'art',    C: 5, band: 1, cap: 13, label: '现状(自带色)' },
  { m: 'ring',   C: 5, band: 1, cap: 13, label: '深度分环 band1' },
  { m: 'ring',   C: 5, band: 2, cap: 13, label: '深度分环 band2' },
  { m: 'ring',   C: 6, band: 1, cap: 13, label: '分环 6色' },
  { m: 'ring',   C: 5, band: 1, cap: 20, label: '分环 cap20' },
  { m: 'ring',   C: 5, band: 1, cap: 26, label: '分环 cap26' },
  { m: 'itl',    C: 5, band: 1, cap: 13, label: '深度交错' },
  { m: 'itl',    C: 5, band: 2, cap: 20, label: '交错 band2 cap20' },
  { m: 'hybrid', C: 5, band: 1, cap: 13, label: '混合(保外轮廓)' },
  { m: 'hybrid', C: 6, band: 2, cap: 20, label: '混合 6色 cap20' }
];

console.log('═══ 第 2 关「豆的颜色组合」实验（' + RUNS + ' 局/组合，规则零改动）═══');
console.log('策略                 | 色数 车数 | 车位占用 峰值 | E均值 Wzero | 随手 普通 老手 | 技术增益');
CASES.forEach(function (cs) {
  var wR = 0, wC = 0, wS = 0, aOcc = 0, aMax = 0, aE = 0, aWz = 0, aCars = 0;
  for (var t = 0; t < RUNS; t++) {
    var sd = (2 * 7919 + t * 104729) >>> 0;
    var lv = LG.genLevel(2, sd, { forceDecoy: 0 });
    if (cs.m !== 'art') {
      var cnt = repaint(lv.beans, cs.m, cs.C, sd ^ 0x55, cs.band);
      lv.counts = cnt;
    }
    lv.cars = PD.deriveCars(lv.counts, 0, cs.cap, sd ^ 0x77);
    aCars += lv.cars.length;
    var r1 = play(lv, 'random', mkRnd(sd + 1));
    var r2 = play(lv, 'casual', mkRnd(sd + 2));
    var r3 = play(lv, 'smart', mkRnd(sd + 3));
    if (r1.win) wR++; if (r2.win) wC++; if (r3.win) wS++;
    aOcc += r2.occ; aMax += r2.occMax; aE += r2.E; aWz += r2.Wz;
  }
  var pr = wR / RUNS * 100, pc = wC / RUNS * 100, ps = wS / RUNS * 100;
  console.log(
    cs.label.padEnd(20) + ' | ' + String(cs.C).padStart(3) + ' ' + (aCars / RUNS).toFixed(1).padStart(5) + ' | ' +
    (aOcc / RUNS).toFixed(2).padStart(8) + ' ' + (aMax / RUNS).toFixed(1).padStart(4) + ' | ' +
    (aE / RUNS).toFixed(2).padStart(5) + ' ' + (aWz / RUNS * 100).toFixed(0).padStart(4) + '% | ' +
    pr.toFixed(0).padStart(4) + '% ' + pc.toFixed(0).padStart(4) + '% ' + ps.toFixed(0).padStart(4) + '% | ' +
    (ps - pc >= 0 ? '+' : '') + (ps - pc).toFixed(0) + 'pt'
  );
});
