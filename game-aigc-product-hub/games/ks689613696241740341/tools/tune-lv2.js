#!/usr/bin/env node
/**
 * 第 2 关组合扫描 —— 只改「车的容量组合 / 车数 / 干扰车数」，不动规则、不动图案
 * ═══════════════════════════════════════════════════════════════════
 * 假设：E（进场即可吃比）是"车位免费"的根因。
 *   E >> 1 → 车进场秒吃满立刻走 → 车位零占用 → 零压力 → 随便拖都过
 *   E <  1 → 车吃不满，必须占着位子等内层暴露 → 车位稀缺 → 才有"给谁留位"的决策
 *
 * 手段（全部只是"组合"层面）：
 *   A. capMax 抬高 → 车变大变少 → 单车容量 > 该色当前暴露量 → 被迫等
 *   B. 容量阶梯化 ratio → 同色车容量做成 大:中:小，而不是均分
 *      （均分 = 每辆都刚好能吃满 = 每辆都是"安全牌" = 零判断）
 *   C. decoy 干扰车数量 → 现在是 4.9，几乎必堵，是胜率抖动的来源
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

/**
 * 容量阶梯化：把某色的总容量重新切成「大车 → 中车 → 小车」
 * 总和恒定（= 该色豆数，S=0 铁律不破），只改分布。
 * ratio=1.0 → 均分（现状）；ratio=2.5 → 最大车是最小车的 2.5 倍
 */
function ladderCaps(total, num, ratio) {
  if (num <= 1) return [total];
  var w = [], i, sum = 0;
  for (i = 0; i < num; i++) { var v = 1 + (ratio - 1) * (num - 1 - i) / (num - 1); w.push(v); sum += v; }
  var caps = [], acc = 0;
  for (i = 0; i < num - 1; i++) { var c = Math.max(3, Math.round(total * w[i] / sum)); caps.push(c); acc += c; }
  caps.push(total - acc);
  if (caps[num - 1] < 3) {                       // 末车太小 → 从最大车借
    var d = 3 - caps[num - 1]; caps[0] -= d; caps[num - 1] = 3;
  }
  return caps;
}

/** 按 capMax + 阶梯比 重建车队（替代 PD.deriveCars，其余全同） */
function rebuildCars(counts, capMax, ratio, seed) {
  var rnd = mkRnd(seed), cars = [], k, i;
  var order = ['pink', 'cyan', 'yellow', 'white', 'green', 'red', 'black'];
  for (k = 0; k < order.length; k++) {
    var col = order[k], n = counts[col] || 0;
    if (!n) continue;
    var num = Math.max(1, Math.ceil(n / capMax));
    var caps = ladderCaps(n, num, ratio);
    for (i = 0; i < num; i++) cars.push({ color: col, cap: caps[i] });
  }
  // 加权随机排队（同 shuffleQueue 思路：防长龙，但不做完美轮转）
  var buckets = {}, keys = [];
  for (i = 0; i < cars.length; i++) { if (!buckets[cars[i].color]) { buckets[cars[i].color] = []; keys.push(cars[i].color); } buckets[cars[i].color].push(cars[i]); }
  var out = [], last = null, lastN = 0, guard = 0;
  while (out.length < cars.length && guard++ < 9999) {
    var pool = [], tot = 0;
    for (i = 0; i < keys.length; i++) {
      var b = buckets[keys[i]];
      if (!b.length) continue;
      if (keys[i] === last && lastN >= 2) continue;
      pool.push({ k: keys[i], w: b.length }); tot += b.length;
    }
    if (!pool.length) { for (i = 0; i < keys.length; i++) if (buckets[keys[i]].length) { pool.push({ k: keys[i], w: 1 }); tot += 1; } }
    if (!pool.length) break;
    var t = rnd() * tot, pickK = pool[0].k;
    for (i = 0; i < pool.length; i++) { t -= pool[i].w; if (t <= 0) { pickK = pool[i].k; break; } }
    out.push(buckets[pickK].shift());
    if (pickK === last) lastN++; else { last = pickK; lastN = 1; }
  }
  return out;
}

/** 一局模拟 + 指标采集。policy: casual(优先有豆可取) / smart(优先剩余豆最多) / random */
function play(lv, policy, rnd) {
  var beans = lv.beans.map(function (b) { return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false }; });
  var bd = PD.buildBounds(beans);
  var q8 = [], pend = [], i;
  for (i = 0; i < lv.cars.length; i++) { if (i < 8) q8.push(lv.cars[i]); else pend.push(lv.cars[i]); }
  while (q8.length < 8) q8.push(null);
  var slots = [null, null, null, null, null], USABLE = 5;
  var remain = beans.length, guard = 0, moves = 0;
  var Esum = 0, En = 0, Wsum = 0, Wn = 0, Wzero = 0, occSum = 0, occN = 0;
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
    // 决策点
    var exp = {}, rest = {};
    for (i = 0; i < beans.length; i++) {
      var b3 = beans[i]; if (b3.gone) continue;
      rest[b3.color] = (rest[b3.color] || 0) + 1;
      if (PD.isPickable(b3, top) && PD.pathOut(b3, occ, bd, null)) exp[b3.color] = (exp[b3.color] || 0) + 1;
    }
    var W = 0, av = 0, used = 0;
    for (s = 0; s < USABLE; s++) if (slots[s]) used++;
    occSum += used; occN++;
    for (i = 0; i < 4; i++) { if (!q8[i]) continue; av++; if (!exp[q8[i].color]) W++; }
    if (av) { Wsum += W; Wn++; if (!W) Wzero++; }
    var fi = -1;
    for (s = 0; s < USABLE; s++) if (!slots[s]) { fi = s; break; }
    if (fi < 0) return { win: false, moves: moves, E: Esum / Math.max(1, En), W: Wsum / Math.max(1, Wn), Wz: Wzero / Math.max(1, Wn), occ: occSum / Math.max(1, occN) };
    var best = -1;
    if (policy === 'random') { var av2 = []; for (i = 0; i < 4; i++) if (q8[i]) av2.push(i); if (av2.length) best = av2[Math.floor(rnd() * av2.length)]; }
    else if (policy === 'smart') { var bn = -1; for (i = 0; i < 4; i++) { if (!q8[i] || !exp[q8[i].color]) continue; if ((rest[q8[i].color] || 0) > bn) { bn = rest[q8[i].color]; best = i; } } }
    else { for (i = 0; i < 4; i++) if (q8[i] && exp[q8[i].color]) { best = i; break; } }
    if (best < 0) { for (i = 0; i < 4; i++) if (q8[i] && rest[q8[i].color]) { best = i; break; } }
    if (best < 0) { for (i = 0; i < 4; i++) if (q8[i]) { best = i; break; } }
    if (best < 0) return { win: false, moves: moves, E: Esum / Math.max(1, En), W: Wsum / Math.max(1, Wn), Wz: Wzero / Math.max(1, Wn), occ: occSum / Math.max(1, occN) };
    var pk = q8[best];
    Esum += (exp[pk.color] || 0) / Math.max(1, pk.cap); En++;
    take(best);
    slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0 };
    moves++;
  }
  return { win: remain === 0, moves: moves, E: Esum / Math.max(1, En), W: Wsum / Math.max(1, Wn), Wz: Wzero / Math.max(1, Wn), occ: occSum / Math.max(1, occN) };
}

var CAPS = [13, 20, 26, 33, 40];
var RATIOS = [1.0, 1.8, 2.6];
var DECOYS = [0, 1, 2];
var RUNS = parseInt(process.argv[2], 10) || 12;

console.log('═══ 第 2 关组合扫描（' + RUNS + ' 局/组合）═══');
console.log('cap 阶梯 decoy | 车数 车/位 容量种类 | E均值 W均值 Wzero 车位占用 | 随手 普通 老手 | 技术增益');
var results = [];
for (var ci = 0; ci < CAPS.length; ci++) {
  for (var ri = 0; ri < RATIOS.length; ri++) {
    for (var di = 0; di < DECOYS.length; di++) {
      var cap = CAPS[ci], ratio = RATIOS[ri], dec = DECOYS[di];
      var wR = 0, wC = 0, wS = 0, aE = 0, aW = 0, aWz = 0, aOcc = 0, aCars = 0, aKinds = 0;
      for (var t = 0; t < RUNS; t++) {
        var sd = (2 * 7919 + t * 104729) >>> 0;
        var lv = LG.genLevel(2, sd, { forceDecoy: 0 });    // 先拿到无干扰车的基础关卡
        lv.cars = rebuildCars(lv.counts, cap, ratio, sd ^ 0x77);
        if (dec > 0) lv.cars = LG.injectDecoys(lv.cars, Object.keys(lv.counts), lv.counts, dec, sd ^ 0x31);
        var kinds = {}; for (var z = 0; z < lv.cars.length; z++) kinds[lv.cars[z].cap] = 1;
        aCars += lv.cars.length; aKinds += Object.keys(kinds).length;
        var r1 = play(lv, 'random', mkRnd(sd + 1));
        var r2 = play(lv, 'casual', mkRnd(sd + 2));
        var r3 = play(lv, 'smart', mkRnd(sd + 3));
        if (r1.win) wR++; if (r2.win) wC++; if (r3.win) wS++;
        aE += r2.E; aW += r2.W; aWz += r2.Wz; aOcc += r2.occ;
      }
      var pc = wC / RUNS * 100, ps = wS / RUNS * 100, pr = wR / RUNS * 100;
      var row = {
        cap: cap, ratio: ratio, dec: dec, pc: pc, ps: ps, pr: pr,
        gain: ps - pc, E: aE / RUNS, W: aW / RUNS, Wz: aWz / RUNS * 100,
        occ: aOcc / RUNS, cars: aCars / RUNS, kinds: aKinds / RUNS
      };
      results.push(row);
      console.log(
        String(cap).padStart(3) + ' ' + ratio.toFixed(1) + ' ' + String(dec).padStart(5) + ' | ' +
        row.cars.toFixed(1).padStart(4) + ' ' + (row.cars / 5).toFixed(1).padStart(4) + ' ' + row.kinds.toFixed(1).padStart(6) + '种 | ' +
        row.E.toFixed(2).padStart(5) + ' ' + row.W.toFixed(2).padStart(5) + ' ' + row.Wz.toFixed(0).padStart(4) + '% ' +
        row.occ.toFixed(2).padStart(8) + ' | ' + pr.toFixed(0).padStart(4) + '% ' + pc.toFixed(0).padStart(4) + '% ' + ps.toFixed(0).padStart(4) + '% | ' +
        (ps - pc >= 0 ? '+' : '') + (ps - pc).toFixed(0) + 'pt'
      );
    }
  }
}
// 推荐：普通档命中 55~70%（IAA 最优区间），且技术增益 >= 15pt（会玩真的有用）
console.log('\n═══ 推荐组合（普通 55~70% 且 技术增益>=15pt）═══');
var ok = results.filter(function (r) { return r.pc >= 55 && r.pc <= 70 && r.gain >= 15; });
ok.sort(function (a, b) { return b.gain - a.gain; });
if (!ok.length) {
  console.log('（无完美命中，列出技术增益最高的 5 个）');
  results.sort(function (a, b) { return b.gain - a.gain; });
  ok = results.slice(0, 5);
}
ok.slice(0, 6).forEach(function (r) {
  console.log('  cap=' + r.cap + ' 阶梯=' + r.ratio.toFixed(1) + ' decoy=' + r.dec +
    '  → 普通 ' + r.pc.toFixed(0) + '% / 老手 ' + r.ps.toFixed(0) + '% (增益 +' + r.gain.toFixed(0) + 'pt)' +
    '  E=' + r.E.toFixed(2) + ' Wzero=' + r.Wz.toFixed(0) + '% 车位占用=' + r.occ.toFixed(2));
});
