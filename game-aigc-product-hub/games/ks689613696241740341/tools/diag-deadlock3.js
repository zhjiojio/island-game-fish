// ══════════════════════════════════════════════════════════════════
// 第三步：队列里同色车是否连续成堆？（这是第二步指向的真正杠杆）
// ══════════════════════════════════════════════════════════════════
// 【第二步的发现】失败现场 60 个僵尸车位里，ghost 一个都没有。
//   两类失败：① 第7步猝死，5车位全同色且该色被埋 ② 第43步锁死，同色车重复占位。
// 【本步要量化】队列前 4 格（玩家实际能看到、能抓的窗口）里同色重复有多严重。
//   如果经常出现"前4格有3辆同色"，玩家顺手连抓就必死 —— 那队列排序就是真旋钮。
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD;

function pad(s, w) { s = '' + s; while (s.length < w) s += ' '; return s; }
function padL(s, w) { s = '' + s; while (s.length < w) s = ' ' + s; return s; }

console.log('═══ 第三步：队列同色聚集度 ═══');
console.log('【口径】滑动窗口扫全队列，统计"任意连续5辆里最多有几辆同色"');
console.log('  5 个车位 → 若窗口内同色 >=4，玩家顺手连抓就会把车位喂给同一个颜色。\n');
console.log(pad('关', 4) + padL('车队长', 7) + padL('前4格最多同色', 15) +
  padL('全队列最长同色连击', 20) + padL('窗口5内同色>=4的占比', 22) + '  前8格颜色序列');

for (var n = 1; n <= 10; n++) {
  var maxRun = 0, bad5 = 0, win5 = 0, front4 = 0, seq = '';
  var samples = 8;
  for (var k = 0; k < samples; k++) {
    var lv = PD.LG.genLevel(n, (n * 7919 + k * 104729) >>> 0);
    if (!lv) continue;
    var cs = lv.cars, i, j;
    // 前 4 格里最多同色数
    var f = {};
    for (i = 0; i < Math.min(4, cs.length); i++) f[cs[i].color] = (f[cs[i].color] || 0) + 1;
    for (var fk in f) if (f[fk] > front4) front4 = f[fk];
    // 最长同色连击
    var run = 1;
    for (i = 1; i < cs.length; i++) {
      if (cs[i].color === cs[i - 1].color) { run++; if (run > maxRun) maxRun = run; }
      else run = 1;
    }
    // 滑动窗口 5
    for (i = 0; i + 5 <= cs.length; i++) {
      var w = {}, mx = 0;
      for (j = i; j < i + 5; j++) w[cs[j].color] = (w[cs[j].color] || 0) + 1;
      for (var wk in w) if (w[wk] > mx) mx = w[wk];
      win5++; if (mx >= 4) bad5++;
    }
    if (k === 0) {
      var t = [];
      for (i = 0; i < Math.min(8, cs.length); i++) t.push(cs[i].color.substr(0, 2));
      seq = t.join('-');
    }
  }
  console.log(pad(n, 4) + padL('~', 7) + padL(front4, 15) + padL(maxRun, 20) +
    padL((win5 ? (bad5 / win5 * 100).toFixed(1) : 0) + '%', 22) + '  ' + seq);
}

// ── 直接验证：把队列强制打散后胜率变多少 ────────────────────────
console.log('\n═══ 决定性实验：打散同色车 vs 现状 ═══');
console.log('【做法】把车队重排成"同色尽量不相邻"，其余一切不变，看胜率变化。');
console.log('  若胜率大幅上升 → 证明同色聚集就是当前难度的真正来源。\n');

function simCasual(lv, usable) {
  var beans = lv.beans.map(function (b) {
    return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false };
  });
  var bd = PD.buildBounds(beans);
  var q8 = [], pend = [], i;
  for (i = 0; i < lv.cars.length; i++) { if (i < 8) q8.push(lv.cars[i]); else pend.push(lv.cars[i]); }
  while (q8.length < 8) q8.push(null);
  var slots = []; for (i = 0; i < usable; i++) slots.push(null);
  var remain = beans.length, guard = 0;
  function take(qi) {
    var c = q8[qi]; q8[qi] = null;
    if (qi < 4 && q8[qi + 4]) { q8[qi] = q8[qi + 4]; q8[qi + 4] = null; if (pend.length) q8[qi + 4] = pend.shift(); }
    return c;
  }
  while (remain > 0 && guard++ < 30000) {
    var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans), did = false, s;
    for (s = 0; s < usable; s++) {
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
    var fi = -1;
    for (s = 0; s < usable; s++) if (!slots[s]) { fi = s; break; }
    if (fi < 0) return false;
    var need = {};
    for (i = 0; i < beans.length; i++) {
      var b2 = beans[i];
      if (!b2.gone && PD.isPickable(b2, top) && PD.pathOut(b2, occ, bd, null)) need[b2.color] = 1;
    }
    var best = -1;
    for (i = 0; i < 4; i++) if (q8[i] && need[q8[i].color]) { best = i; break; }
    if (best < 0) { for (i = 0; i < 4; i++) if (q8[i]) { best = i; break; } }
    if (best < 0) return false;
    var pk = take(best);
    slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0 };
  }
  return remain === 0;
}

// 轮转打散：按颜色分桶，然后轮流取 → 同色最大程度分开
function spreadCars(cars) {
  var bucket = {}, order = [], i;
  for (i = 0; i < cars.length; i++) {
    var c = cars[i].color;
    if (!bucket[c]) { bucket[c] = []; order.push(c); }
    bucket[c].push(cars[i]);
  }
  // 大桶优先，避免末尾堆同色
  order.sort(function (a, b) { return bucket[b].length - bucket[a].length; });
  var out = [], left = cars.length;
  while (left > 0) {
    for (i = 0; i < order.length; i++) {
      var bk = bucket[order[i]];
      if (bk.length) { out.push(bk.shift()); left--; }
    }
  }
  return out;
}

console.log(pad('关', 4) + padL('现状胜率', 10) + padL('打散后胜率', 12) + padL('差', 6));
for (var n2 = 2; n2 <= 8; n2++) {
  var w1 = 0, w2 = 0, tot = 0;
  for (var k2 = 0; k2 < 15; k2++) {
    var lv = PD.LG.genLevel(n2, (n2 * 7919 + k2 * 104729) >>> 0);
    if (!lv) continue;
    tot++;
    var orig = lv.cars;
    if (simCasual(lv, 5)) w1++;
    // 换成打散队列（深拷贝车对象，避免 left 被上一轮改脏）
    lv.cars = spreadCars(orig).map(function (c) {
      return { color: c.color, cap: c.cap, decoy: c.decoy || 0 };
    });
    if (simCasual(lv, 5)) w2++;
    lv.cars = orig;
  }
  var r1 = tot ? Math.round(w1 / tot * 100) : 0;
  var r2 = tot ? Math.round(w2 / tot * 100) : 0;
  console.log(pad(n2, 4) + padL(r1 + '%', 10) + padL(r2 + '%', 12) +
    padL((r2 - r1 > 0 ? '+' : '') + (r2 - r1), 6));
}
