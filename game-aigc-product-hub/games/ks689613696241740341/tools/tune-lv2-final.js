#!/usr/bin/env node
/**
 * 第 2 关精调 —— 锁定「深度分环上色 + 大车」方向，扫 cap / 色数 / 环宽 / 干扰车
 * ═══════════════════════════════════════════════════════════════════
 * 前两轮结论：
 *   ① 只调车/容量/干扰车 → 车位占用恒 <0.4、胜率恒 90~100%、技术增益恒 0
 *   ② 唯一有效杠杆 = 让【每种颜色横跨剥离深度】(深度分环) + 【单车容量 > 该色单环豆数】
 *      → E 压到 <1 → 车吃不满必须占位等 → 车位第一次成为稀缺资源
 *      实测 分环+cap20：车位占用 0.01→1.25、峰值 0.2→2.7、技术增益 0→+33pt
 *
 * 本轮目标：把普通玩家胜率稳定压到 55~70%，且技术增益 >= 15pt（会玩真的有用）
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
/** 深度分环上色：颜色 = floor(depth/band) % C，保证每色横跨全深度 */
function repaintRing(beans, C, seed, band, keepEdge) {
  var rnd = mkRnd(seed), dm = depthMap(beans), i;
  var colors = COLOR_ORDER.slice(0, C), total = beans.length;
  var quota = [], base = Math.floor(total / C), rem = total - base * C;
  for (i = 0; i < C; i++) quota.push(base + (i < rem ? 1 : 0));
  var used = []; for (i = 0; i < C; i++) used.push(0);
  var idx = []; for (i = 0; i < beans.length; i++) idx.push(i);
  idx.sort(function (a, b) { return dm.d[a] - dm.d[b] || (rnd() - 0.5); });
  var cnt = {};
  for (var z = 0; z < idx.length; z++) {
    var bi = idx[z], d = dm.d[bi], k;
    if (keepEdge && d <= 1) k = C - 1;                       // 最外 2 层固定一色 → 保留视觉轮廓
    else k = Math.floor(d / band) % C;
    var tries = 0;
    while (used[k] >= quota[k] && tries++ < C) k = (k + 1) % C;
    used[k]++; beans[bi].color = colors[k];
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
  var Esum = 0, En = 0, occSum = 0, occN = 0, occMax = 0, Wsum = 0, Wn = 0, Wzero = 0, full = 0;
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
    occSum += usedN; occN++; if (usedN > occMax) occMax = usedN; if (usedN >= USABLE - 1) full++;
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
        var e = (exp[q8[i].color] || 0) - q8[i].cap;         // 能吃满就走（不占位）最优
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
  function res(w) {
    return { win: w, moves: moves, occ: occSum / Math.max(1, occN), occMax: occMax,
             E: Esum / Math.max(1, En), Wz: Wzero / Math.max(1, Wn), tight: full / Math.max(1, occN) };
  }
}

var RUNS = parseInt(process.argv[2], 10) || 20;
var CASES = [];
[16, 18, 20, 22, 25].forEach(function (cap) {
  [5, 6].forEach(function (C) {
    [1].forEach(function (band) {
      [false, true].forEach(function (ke) {
        CASES.push({ cap: cap, C: C, band: band, ke: ke });
      });
    });
  });
});

console.log('═══ 第 2 关精调：深度分环 + 大车（' + RUNS + ' 局/组合）═══');
console.log('cap 色数 环宽 保轮廓 | 车数 车/位 | 车位占用 峰值 紧张率 | E均值 Wzero | 随手 普通 老手 | 增益');
var out = [];
CASES.forEach(function (cs) {
  var wR = 0, wC = 0, wS = 0, aOcc = 0, aMax = 0, aE = 0, aWz = 0, aCars = 0, aT = 0;
  for (var t = 0; t < RUNS; t++) {
    var sd = (2 * 7919 + t * 104729) >>> 0;
    var lv = LG.genLevel(2, sd, { forceDecoy: 0 });
    lv.counts = repaintRing(lv.beans, cs.C, sd ^ 0x55, cs.band, cs.ke);
    lv.cars = PD.deriveCars(lv.counts, 0, cs.cap, sd ^ 0x77);
    aCars += lv.cars.length;
    var r1 = play(lv, 'random', mkRnd(sd + 1));
    var r2 = play(lv, 'casual', mkRnd(sd + 2));
    var r3 = play(lv, 'smart', mkRnd(sd + 3));
    if (r1.win) wR++; if (r2.win) wC++; if (r3.win) wS++;
    aOcc += r2.occ; aMax += r2.occMax; aE += r2.E; aWz += r2.Wz; aT += r2.tight;
  }
  var pr = wR / RUNS * 100, pc = wC / RUNS * 100, ps = wS / RUNS * 100;
  var row = { cap: cs.cap, C: cs.C, band: cs.band, ke: cs.ke, pr: pr, pc: pc, ps: ps, gain: ps - pc,
              occ: aOcc / RUNS, max: aMax / RUNS, E: aE / RUNS, Wz: aWz / RUNS * 100, cars: aCars / RUNS, tight: aT / RUNS * 100 };
  out.push(row);
  console.log(
    String(cs.cap).padStart(3) + String(cs.C).padStart(4) + String(cs.band).padStart(5) +
    (cs.ke ? '   是' : '   否') + ' | ' + row.cars.toFixed(1).padStart(4) + ' ' + (row.cars / 5).toFixed(1).padStart(4) + ' | ' +
    row.occ.toFixed(2).padStart(8) + ' ' + row.max.toFixed(1).padStart(4) + ' ' + row.tight.toFixed(0).padStart(5) + '% | ' +
    row.E.toFixed(2).padStart(5) + ' ' + row.Wz.toFixed(0).padStart(4) + '% | ' +
    pr.toFixed(0).padStart(4) + '% ' + pc.toFixed(0).padStart(4) + '% ' + ps.toFixed(0).padStart(4) + '% | ' +
    (row.gain >= 0 ? '+' : '') + row.gain.toFixed(0) + 'pt'
  );
});
console.log('\n═══ 最优（普通 55~72% 且 增益>=15pt，按增益降序）═══');
var ok = out.filter(function (r) { return r.pc >= 55 && r.pc <= 72 && r.gain >= 15; });
ok.sort(function (a, b) { return b.gain - a.gain; });
if (!ok.length) { out.sort(function (a, b) { return b.gain - a.gain; }); ok = out.slice(0, 5); console.log('（无完美命中，列增益最高 5 个）'); }
ok.slice(0, 6).forEach(function (r) {
  console.log('  cap=' + r.cap + ' 色数=' + r.C + ' 保轮廓=' + (r.ke ? '是' : '否') +
    ' → 普通 ' + r.pc.toFixed(0) + '% / 老手 ' + r.ps.toFixed(0) + '% (+' + r.gain.toFixed(0) + 'pt)' +
    '  车位占用 ' + r.occ.toFixed(2) + ' 峰值 ' + r.max.toFixed(1) + ' 紧张率 ' + r.tight.toFixed(0) + '% E=' + r.E.toFixed(2));
});
