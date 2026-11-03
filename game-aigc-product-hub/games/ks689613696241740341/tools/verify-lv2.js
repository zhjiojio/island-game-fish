#!/usr/bin/env node
/**
 * 第 2 关验证 —— 换 seed 池 + 加大样本，确认 50% 不是 seed 巧合
 * ═══════════════════════════════════════════════════════════════════
 * 上一轮 20 组全部恰好 50% 且 普通=老手，太整齐，怀疑是"固定 seed 决定胜负"。
 * 本轮：① 换完全不同的 seed 池 ② 样本加到 60 局 ③ 打印每个 seed 的胜负位图
 *       ④ 对比 shuffle(现状) vs deepFirst，看差异是否稳定
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
function minDepthByColor(beans) {
  var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, i;
  for (i = 0; i < beans.length; i++) {
    var b = beans[i];
    if (b.gx < minx) minx = b.gx; if (b.gx > maxx) maxx = b.gx;
    if (b.gy < miny) miny = b.gy; if (b.gy > maxy) maxy = b.gy;
  }
  var rows = maxy - miny + 1, cols = maxx - minx + 1, grid = [], r, c;
  for (r = 0; r < rows; r++) { var row = []; for (c = 0; c < cols; c++) row.push(null); grid.push(row); }
  for (i = 0; i < beans.length; i++) grid[beans[i].gy - miny][beans[i].gx - minx] = 1;
  var pd = LG.peelDepth(grid, rows, cols), md = {};
  for (i = 0; i < beans.length; i++) {
    var dd = pd.d[beans[i].gy - miny][beans[i].gx - minx], col = beans[i].color;
    if (md[col] === undefined || dd < md[col]) md[col] = dd;
  }
  return md;
}
function reorderDeepFirst(cars, seed, minD) {
  var rnd = mkRnd(seed), out = cars.slice();
  out.sort(function (a, b) {
    var da = minD[a.color] === undefined ? 0 : minD[a.color];
    var db = minD[b.color] === undefined ? 0 : minD[b.color];
    return db - da || (rnd() - 0.5);
  });
  return out;
}
function play(lv, policy, rnd) {
  var beans = lv.beans.map(function (b) { return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false }; });
  var bd = PD.buildBounds(beans);
  var q8 = [], pend = [], i;
  for (i = 0; i < lv.cars.length; i++) { if (i < 8) q8.push(lv.cars[i]); else pend.push(lv.cars[i]); }
  while (q8.length < 8) q8.push(null);
  var slots = [null, null, null, null, null], USABLE = 5;
  var remain = beans.length, guard = 0, moves = 0, occSum = 0, occN = 0, occMax = 0, tight = 0, Wz = 0, Wn = 0;
  function take(qi) {
    var c = q8[qi]; q8[qi] = null;
    if (qi < 4 && q8[qi + 4]) { q8[qi] = q8[qi + 4]; q8[qi + 4] = null; if (pend.length) q8[qi + 4] = pend.shift(); }
    return c;
  }
  function res(w) {
    return { win: w, moves: moves, occ: occSum / Math.max(1, occN), occMax: occMax,
             tight: tight / Math.max(1, occN), Wz: Wz / Math.max(1, Wn) };
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
    if (av) { Wn++; if (!W) Wz++; }
    var fi = -1;
    for (s = 0; s < USABLE; s++) if (!slots[s]) { fi = s; break; }
    if (fi < 0) return res(false);
    var best = -1;
    if (policy === 'random') { var a2 = []; for (i = 0; i < 4; i++) if (q8[i]) a2.push(i); if (a2.length) best = a2[Math.floor(rnd() * a2.length)]; }
    else if (policy === 'smart') {
      var bs = -1e9;
      for (i = 0; i < 4; i++) {
        if (!q8[i]) continue;
        var e0 = exp[q8[i].color] || 0, sc;
        if (!e0) sc = -1000 - q8[i].cap;
        else if (e0 >= q8[i].cap) sc = 500 + e0;
        else sc = e0 - q8[i].cap;
        if (sc > bs) { bs = sc; best = i; }
      }
    }
    else { for (i = 0; i < 4; i++) if (q8[i] && exp[q8[i].color]) { best = i; break; } }
    if (best < 0) { for (i = 0; i < 4; i++) if (q8[i] && rest[q8[i].color]) { best = i; break; } }
    if (best < 0) { for (i = 0; i < 4; i++) if (q8[i]) { best = i; break; } }
    if (best < 0) return res(false);
    var pk = q8[best];
    take(best);
    slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0 };
    moves++;
  }
  return res(remain === 0);
}

var RUNS = parseInt(process.argv[2], 10) || 40;
// 全新 seed 池（与之前 n*7919+t*104729 完全不同）
function seedOf(t) { return (t * 2654435761 + 1013904223) >>> 0; }

var VARIANTS = [
  { name: 'shuffle 现状 cap13 d0', deep: false, cap: 13, dec: 0 },
  { name: 'deepFirst cap13 d0   ', deep: true,  cap: 13, dec: 0 },
  { name: 'deepFirst cap13 d2   ', deep: true,  cap: 13, dec: 2 },
  { name: 'deepFirst cap10 d2   ', deep: true,  cap: 10, dec: 2 },
  { name: 'deepFirst cap9  d3   ', deep: true,  cap: 9,  dec: 3 }
];

console.log('═══ 第 2 关验证：全新 seed 池，' + RUNS + ' 局 ═══');
console.log('变体                    | 车位占用 峰值 紧张率 Wzero | 随手 普通 老手 | 增益 | 普通胜负位图');
VARIANTS.forEach(function (v) {
  var wR = 0, wC = 0, wS = 0, aOcc = 0, aMax = 0, aT = 0, aWz = 0, bits = '';
  for (var t = 0; t < RUNS; t++) {
    var sd = seedOf(t);
    var lv = LG.genLevel(2, sd, { forceDecoy: 0 });
    lv.cars = PD.deriveCars(lv.counts, 0, v.cap, sd ^ 0x77);
    if (v.deep) lv.cars = reorderDeepFirst(lv.cars, sd ^ 0xa1, minDepthByColor(lv.beans));
    if (v.dec > 0) lv.cars = LG.injectDecoys(lv.cars, Object.keys(lv.counts), lv.counts, v.dec, sd ^ 0x31);
    var r1 = play(lv, 'random', mkRnd(sd + 1));
    var r2 = play(lv, 'casual', mkRnd(sd + 2));
    var r3 = play(lv, 'smart', mkRnd(sd + 3));
    if (r1.win) wR++; if (r2.win) wC++; if (r3.win) wS++;
    bits += r2.win ? '1' : '0';
    aOcc += r2.occ; aMax += r2.occMax; aT += r2.tight; aWz += r2.Wz;
  }
  var pr = wR / RUNS * 100, pc = wC / RUNS * 100, ps = wS / RUNS * 100;
  console.log(
    v.name + ' | ' + (aOcc / RUNS).toFixed(2).padStart(8) + ' ' + (aMax / RUNS).toFixed(1).padStart(4) + ' ' +
    (aT / RUNS * 100).toFixed(0).padStart(5) + '% ' + (aWz / RUNS * 100).toFixed(0).padStart(4) + '% | ' +
    pr.toFixed(0).padStart(4) + '% ' + pc.toFixed(0).padStart(4) + '% ' + ps.toFixed(0).padStart(4) + '% | ' +
    (ps - pc >= 0 ? '+' : '') + (ps - pc).toFixed(0) + 'pt | ' + bits
  );
});
