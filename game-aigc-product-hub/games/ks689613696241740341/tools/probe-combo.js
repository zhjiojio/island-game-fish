#!/usr/bin/env node
/**
 * 组合学探针 —— 只测「豆的颜色组合 / 车的容量组合 / 队列颜色组合」
 * ═══════════════════════════════════════════════════════════════════
 * 不涉及任何规则改动。目的是回答一个问题：
 *   在现有规则下，当前的组合到底给了玩家多少「可犯错空间」？
 *
 * 三个核心指标（全部只与组合有关）：
 *   R  = 同一时刻【有豆可取】的颜色数。R 越接近可用车位(5)，随便抓一辆都能干活 → 零决策。
 *        R=1~2 时，队列前 4 里大概率没有对的车 → 必须挑、必须等 → 才有决策。
 *   W  = 队列前 4 中【此刻放进去会空转】的车数量（颜色被围住/已清空）。
 *        W=0 → 闭着眼抓都对。W>=2 → 必须看阵、必须判断。
 *   E  = 该色【当前暴露豆数】 / 【该色车容量】。E<1 = 车装不满就得等 → 软占位。
 *        E 恒 >=1 → 车进场就一口吃完立刻走 → 车位是免费的 → 零压力。
 */
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD, LG = PD.LG;

var MAXN = parseInt(process.argv[2], 10) || 10;
var SEEDS = parseInt(process.argv[3], 10) || 3;

function probeOnce(lv) {
  var beans = lv.beans.map(function (b) {
    return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false };
  });
  var bd = PD.buildBounds(beans);
  var q8 = [], pend = [], i;
  for (i = 0; i < lv.cars.length; i++) { if (i < 8) q8.push(lv.cars[i]); else pend.push(lv.cars[i]); }
  while (q8.length < 8) q8.push(null);
  var slots = [null, null, null, null, null], USABLE = 5;
  var remain = beans.length, guard = 0;
  var Rsum = 0, Rn = 0, Rmin = 99, Wsum = 0, Wn = 0, Wzero = 0;
  var Esum = 0, En = 0, Elt1 = 0;

  function exposedByColor() {
    var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans), m = {};
    for (var j = 0; j < beans.length; j++) {
      var b = beans[j];
      if (b.gone) continue;
      if (!PD.isPickable(b, top) || !PD.pathOut(b, occ, bd, null)) continue;
      m[b.color] = (m[b.color] || 0) + 1;
    }
    return m;
  }
  function take(qi) {
    var c = q8[qi]; q8[qi] = null;
    if (qi < 4 && q8[qi + 4]) { q8[qi] = q8[qi + 4]; q8[qi + 4] = null; if (pend.length) q8[qi + 4] = pend.shift(); }
    return c;
  }

  while (remain > 0 && guard++ < 60000) {
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

    // ── 决策点：此刻要从队列前 4 挑一辆进空位 ──
    var exp = exposedByColor(), keys = Object.keys(exp), R = keys.length;
    Rsum += R; Rn++; if (R < Rmin) Rmin = R;

    var rest = {};
    for (i = 0; i < beans.length; i++) if (!beans[i].gone) rest[beans[i].color] = 1;
    var W = 0, avail = 0;
    for (i = 0; i < 4; i++) {
      if (!q8[i]) continue;
      avail++;
      if (!exp[q8[i].color]) W++;              // 此刻放进去 = 空转占位
    }
    if (avail > 0) { Wsum += W; Wn++; if (W === 0) Wzero++; }

    var fi = -1;
    for (s = 0; s < USABLE; s++) if (!slots[s]) { fi = s; break; }
    if (fi < 0) return { dead: true, R: Rsum / Math.max(1, Rn), Rmin: Rmin, W: Wsum / Math.max(1, Wn), Wzero: Wzero / Math.max(1, Wn), E: Esum / Math.max(1, En), Elt1: Elt1 / Math.max(1, En) };

    // 参照玩家：抓第一辆「此刻有可取豆」的车
    var best = -1;
    for (i = 0; i < 4; i++) if (q8[i] && exp[q8[i].color]) { best = i; break; }
    if (best < 0) {
      for (i = 0; i < 4; i++) if (q8[i] && rest[q8[i].color]) { best = i; break; }
    }
    if (best < 0) { for (i = 0; i < 4; i++) if (q8[i]) { best = i; break; } }
    if (best < 0) return { dead: true, R: Rsum / Math.max(1, Rn), Rmin: Rmin, W: Wsum / Math.max(1, Wn), Wzero: Wzero / Math.max(1, Wn), E: Esum / Math.max(1, En), Elt1: Elt1 / Math.max(1, En) };

    var pk = q8[best];
    // E：该车进场时，它的颜色暴露了多少豆 / 它的容量
    var e = (exp[pk.color] || 0) / Math.max(1, pk.cap);
    Esum += e; En++; if (e < 1) Elt1++;

    take(best);
    slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0 };
  }
  return {
    dead: remain > 0,
    R: Rsum / Math.max(1, Rn), Rmin: Rmin,
    W: Wsum / Math.max(1, Wn), Wzero: Wzero / Math.max(1, Wn),
    E: Esum / Math.max(1, En), Elt1: Elt1 / Math.max(1, En)
  };
}

console.log('═══ 组合学探针：R=同时可取色数  W=前4里空转车数  Wzero=闭眼抓也对的比例  E=进场即可吃比  Elt1=需要等的车占比 ═══');
console.log('关 | 色数 车数 车/位 | capMax 容量种类   | R均值 Rmin | W均值 Wzero | E均值 Elt1');
for (var n = 1; n <= MAXN; n++) {
  var accR = 0, accRmin = 0, accW = 0, accWz = 0, accE = 0, accE1 = 0, accCars = 0, accKinds = 0, C = 0, cap = 0;
  for (var k = 0; k < SEEDS; k++) {
    var lv = LG.genLevel(n, (n * 7919 + k * 104729) >>> 0);
    var D = LG.difficulty(n);
    C = D.C; cap = D.capMax;
    var kinds = {}; for (var i = 0; i < lv.cars.length; i++) kinds[lv.cars[i].cap] = 1;
    accCars += lv.cars.length; accKinds += Object.keys(kinds).length;
    var r = probeOnce(lv);
    accR += r.R; accRmin += r.Rmin; accW += r.W; accWz += r.Wzero; accE += r.E; accE1 += r.Elt1;
  }
  var f = function (x) { return (x / SEEDS).toFixed(2); };
  console.log(
    String(n).padStart(2) + ' | ' + String(C).padStart(3) + ' ' + f(accCars).padStart(5) + ' ' +
    (accCars / SEEDS / 5).toFixed(1).padStart(4) + ' | ' + String(cap).padStart(5) + ' ' + f(accKinds).padStart(6) + '种     | ' +
    f(accR).padStart(5) + ' ' + f(accRmin).padStart(4) + ' | ' + f(accW).padStart(5) + ' ' +
    (accWz / SEEDS * 100).toFixed(0).padStart(4) + '% | ' + f(accE).padStart(5) + ' ' +
    (accE1 / SEEDS * 100).toFixed(0).padStart(4) + '%'
  );
}
