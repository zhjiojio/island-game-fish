#!/usr/bin/env node
/**
 * 第 2 关收口 —— 锁定 deepFirst 排序，细扫把普通胜率从 58% 压到 50%
 * ═══════════════════════════════════════════════════════════════════
 * 已验证结论（全部保留像素画原生颜色，形状零改动）：
 *   排序 shuffle(现状) → 车位占用 0.06、Wzero 69%、普通 100%   ← 车位免费，零决策
 *   排序 deepFirst     → 车位占用 1.04、Wzero  5%、普通  58%   ← 车位挤，必须判断
 *   deepFirst = 车队按「该色最早暴露深度」降序排，内层色排前面
 *              → 开局队列前 4 全是"现在还取不到"的色 → 必须挑、必须留位
 *
 * 本轮把 cap（9~14 细粒度）× decoy（0~4）扫开，目标 普通 46~54%，且 smart > casual。
 * 注：smart 策略改为「优先能吃满就走的车」，这是本关真正的最优策略（避免占位）。
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
/** deepFirst：只改车队顺序，车的颜色/容量/总数完全不变 */
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
  var remain = beans.length, guard = 0, moves = 0;
  var Esum = 0, En = 0, occSum = 0, occN = 0, occMax = 0, Wsum = 0, Wn = 0, Wzero = 0, tight = 0;
  function take(qi) {
    var c = q8[qi]; q8[qi] = null;
    if (qi < 4 && q8[qi + 4]) { q8[qi] = q8[qi + 4]; q8[qi + 4] = null; if (pend.length) q8[qi + 4] = pend.shift(); }
    return c;
  }
  function res(w) {
    return { win: w, moves: moves, occ: occSum / Math.max(1, occN), occMax: occMax,
             E: Esum / Math.max(1, En), Wz: Wzero / Math.max(1, Wn), W: Wsum / Math.max(1, Wn),
             tight: tight / Math.max(1, occN) };
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
      // 最优策略：优先"能一次吃满就走"的车（不占位）；其次剩余豆最多
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
    Esum += (exp[pk.color] || 0) / Math.max(1, pk.cap); En++;
    take(best);
    slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0 };
    moves++;
  }
  return res(remain === 0);
}

var RUNS = parseInt(process.argv[2], 10) || 24;
var CASES = [];
[9, 10, 11, 12, 13].forEach(function (cap) {
  [0, 1, 2, 3].forEach(function (dec) { CASES.push({ cap: cap, dec: dec }); });
});

console.log('═══ 第 2 关收口：deepFirst 排序 + 原生颜色（' + RUNS + ' 局/组合）═══');
console.log('cap decoy | 车数 车/位 | 车位占用 峰值 紧张率 | E均值 W均值 Wzero | 随手 普通 老手 | 增益 | 距50%');
var out = [];
CASES.forEach(function (cs) {
  var wR = 0, wC = 0, wS = 0, aOcc = 0, aMax = 0, aE = 0, aWz = 0, aW = 0, aCars = 0, aT = 0;
  for (var t = 0; t < RUNS; t++) {
    var sd = (2 * 7919 + t * 104729) >>> 0;
    var lv = LG.genLevel(2, sd, { forceDecoy: 0 });
    var minD = minDepthByColor(lv.beans);
    lv.cars = PD.deriveCars(lv.counts, 0, cs.cap, sd ^ 0x77);
    lv.cars = reorderDeepFirst(lv.cars, sd ^ 0xa1, minD);
    if (cs.dec > 0) lv.cars = LG.injectDecoys(lv.cars, Object.keys(lv.counts), lv.counts, cs.dec, sd ^ 0x31);
    aCars += lv.cars.length;
    var r1 = play(lv, 'random', mkRnd(sd + 1));
    var r2 = play(lv, 'casual', mkRnd(sd + 2));
    var r3 = play(lv, 'smart', mkRnd(sd + 3));
    if (r1.win) wR++; if (r2.win) wC++; if (r3.win) wS++;
    aOcc += r2.occ; aMax += r2.occMax; aE += r2.E; aWz += r2.Wz; aW += r2.W; aT += r2.tight;
  }
  var pr = wR / RUNS * 100, pc = wC / RUNS * 100, ps = wS / RUNS * 100;
  var row = { cap: cs.cap, dec: cs.dec, pr: pr, pc: pc, ps: ps, gain: ps - pc,
              occ: aOcc / RUNS, max: aMax / RUNS, E: aE / RUNS, Wz: aWz / RUNS * 100,
              W: aW / RUNS, cars: aCars / RUNS, tight: aT / RUNS * 100 };
  out.push(row);
  console.log(
    String(cs.cap).padStart(3) + String(cs.dec).padStart(6) + ' | ' +
    row.cars.toFixed(1).padStart(4) + ' ' + (row.cars / 5).toFixed(1).padStart(4) + ' | ' +
    row.occ.toFixed(2).padStart(8) + ' ' + row.max.toFixed(1).padStart(4) + ' ' + row.tight.toFixed(0).padStart(5) + '% | ' +
    row.E.toFixed(2).padStart(5) + ' ' + row.W.toFixed(2).padStart(5) + ' ' + row.Wz.toFixed(0).padStart(4) + '% | ' +
    pr.toFixed(0).padStart(4) + '% ' + pc.toFixed(0).padStart(4) + '% ' + ps.toFixed(0).padStart(4) + '% | ' +
    (row.gain >= 0 ? '+' : '') + row.gain.toFixed(0) + 'pt | ' + Math.abs(row.pc - 50).toFixed(0) + 'pt'
  );
});
console.log('\n═══ 命中 普通 44~56%（按 |胜率-50| 升序，同距看增益）═══');
var ok = out.filter(function (r) { return r.pc >= 44 && r.pc <= 56; });
ok.sort(function (a, b) { return Math.abs(a.pc - 50) - Math.abs(b.pc - 50) || (b.gain - a.gain); });
if (!ok.length) { out.sort(function (a, b) { return Math.abs(a.pc - 50) - Math.abs(b.pc - 50); }); ok = out.slice(0, 6); console.log('（无命中，列最近 6 个）'); }
ok.slice(0, 8).forEach(function (r) {
  console.log('  cap=' + r.cap + ' decoy=' + r.dec + ' → 随手 ' + r.pr.toFixed(0) + '% / 普通 ' + r.pc.toFixed(0) +
    '% / 老手 ' + r.ps.toFixed(0) + '% (' + (r.gain >= 0 ? '+' : '') + r.gain.toFixed(0) + 'pt)' +
    '  车位占用 ' + r.occ.toFixed(2) + ' 峰值 ' + r.max.toFixed(1) + ' 紧张 ' + r.tight.toFixed(0) + '% Wzero=' + r.Wz.toFixed(0) + '%');
});
