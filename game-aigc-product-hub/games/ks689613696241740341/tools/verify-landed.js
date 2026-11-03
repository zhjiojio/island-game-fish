#!/usr/bin/env node
/**
 * 落地后验证 —— 走完整 genLevel（含 solveLevel 校验 + 干扰车注入），确认改动真的生效
 * 对比：opt.noDeepQueue=true（旧队列） vs 默认（新深度优先队列）
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
  function res(w) { return { win: w, moves: moves, occ: occSum / Math.max(1, occN), occMax: occMax, tight: tight / Math.max(1, occN), Wz: Wz / Math.max(1, Wn) }; }
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
    var un = 0; for (s = 0; s < USABLE; s++) if (slots[s]) un++;
    occSum += un; occN++; if (un > occMax) occMax = un; if (un >= USABLE - 1) tight++;
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
        if (!e0) sc = -1000 - q8[i].cap; else if (e0 >= q8[i].cap) sc = 500 + e0; else sc = e0 - q8[i].cap;
        if (sc > bs) { bs = sc; best = i; }
      }
    } else { for (i = 0; i < 4; i++) if (q8[i] && exp[q8[i].color]) { best = i; break; } }
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

var RUNS = parseInt(process.argv[2], 10) || 30;
console.log('═══ 落地后验证：完整 genLevel（含校验+干扰车），' + RUNS + ' 局 ═══');
[{ n: '旧队列(noDeepQueue)', o: { noDeepQueue: true } }, { n: '新队列(已落地)     ', o: {} }].forEach(function (v) {
  var wR = 0, wC = 0, wS = 0, aOcc = 0, aMax = 0, aT = 0, aWz = 0, a3 = 0, aDec = 0, bits = '';
  for (var t = 0; t < RUNS; t++) {
    var sd = (t * 2654435761 + 1013904223) >>> 0;
    var lv = LG.genLevel(2, sd, v.o);
    if (!lv) { console.log('  !! genLevel 返回 null @seed' + sd); continue; }
    a3 += lv.stars.three; aDec += (lv._meta && lv._meta.decoyN) || 0;
    var r1 = play(lv, 'random', mkRnd(sd + 1));
    var r2 = play(lv, 'casual', mkRnd(sd + 2));
    var r3 = play(lv, 'smart', mkRnd(sd + 3));
    if (r1.win) wR++; if (r2.win) wC++; if (r3.win) wS++;
    bits += r2.win ? '1' : '0';
    aOcc += r2.occ; aMax += r2.occMax; aT += r2.tight; aWz += r2.Wz;
  }
  console.log(v.n + ' | 车位占用 ' + (aOcc / RUNS).toFixed(2) + ' 峰值 ' + (aMax / RUNS).toFixed(1) +
    ' 紧张 ' + (aT / RUNS * 100).toFixed(0) + '% Wzero ' + (aWz / RUNS * 100).toFixed(0) + '%' +
    ' | 三星阈 ' + (a3 / RUNS).toFixed(0) + ' 干扰车 ' + (aDec / RUNS).toFixed(1) +
    ' | 随手 ' + (wR / RUNS * 100).toFixed(0) + '% 普通 ' + (wC / RUNS * 100).toFixed(0) +
    '% 老手 ' + (wS / RUNS * 100).toFixed(0) + '%');
  console.log('   胜负位图: ' + bits);
});
