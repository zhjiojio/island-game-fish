// 找第二根难度轴：开局色已压到硬下限2，关4之后需要别的量继续加压
// 【候选】① 见全色轮数（依赖链长度）② 前4格可用车数（队列给的选择余量）
//        ③ 车队总长（决策次数）
// 【做法】固定开局色=2 的关卡池，按候选量分组看胜率差异 —— 有差异才是有效轴
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD;
function pad(s, w) { s = '' + s; while (s.length < w) s += ' '; return s; }
function padL(s, w) { s = '' + s; while (s.length < w) s = ' ' + s; return s; }

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

// 候选轴 A：前4格里「颜色开局就能取」的车数（队列给的选择余量）
function frontUsable(lv) {
  var beans = lv.beans.map(function (b) {
    return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false };
  });
  var bd = PD.buildBounds(beans);
  var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans);
  var ok = {}, i;
  for (i = 0; i < beans.length; i++) {
    var b = beans[i];
    if (PD.isPickable(b, top) && PD.pathOut(b, occ, bd, null)) ok[b.color] = 1;
  }
  var cnt = 0;
  for (i = 0; i < Math.min(4, lv.cars.length); i++) if (ok[lv.cars[i].color]) cnt++;
  return cnt;
}

// 候选轴 B：见全色需要剥几轮
function peelRounds(lv) {
  var beans = lv.beans.map(function (b) {
    return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false };
  });
  var bd = PD.buildBounds(beans);
  var all = {}, i; for (i = 0; i < beans.length; i++) all[beans[i].color] = 1;
  var tot = 0; for (var c in all) tot++;
  var seen = {}, sn = 0, r = 0;
  while (sn < tot && r < 40) {
    var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans), batch = [];
    for (i = 0; i < beans.length; i++) {
      var b = beans[i];
      if (b.gone) continue;
      if (PD.isPickable(b, top) && PD.pathOut(b, occ, bd, null)) { batch.push(b); if (!seen[b.color]) { seen[b.color] = 1; sn++; } }
    }
    if (!batch.length) break;
    for (i = 0; i < batch.length; i++) batch[i].gone = true;
    r++;
  }
  return r;
}

// 收集大样本，按候选轴分组
console.log('【目的】开局色已锁死在 2，需要第二根轴继续加压。');
console.log('【做法】收集关 4~8 的大量样本，按各候选轴分组看胜率差异。\n');
var rows = [];
for (var n = 4; n <= 8; n++) {
  for (var k = 0; k < 24; k++) {
    var lv = PD.LG.genLevel(n, (n * 7919 + k * 104729) >>> 0);
    if (!lv) continue;
    rows.push({
      n: n, oc: lv._openColors || 0,
      fu: frontUsable(lv), pr: peelRounds(lv),
      cars: lv.cars.length,
      win: simCasual(lv, 5) ? 1 : 0
    });
  }
}
console.log('总样本 ' + rows.length + ' 局\n');

function group(key, label) {
  var g = {};
  for (var i = 0; i < rows.length; i++) {
    var v = rows[i][key];
    if (!g[v]) g[v] = { w: 0, t: 0 };
    g[v].t++; g[v].w += rows[i].win;
  }
  var ks = Object.keys(g).sort(function (a, b) { return a - b; });
  console.log('── 按【' + label + '】分组 ──');
  var out = [];
  for (var j = 0; j < ks.length; j++) {
    var gg = g[ks[j]];
    if (gg.t < 4) continue;
    var wr = Math.round(gg.w / gg.t * 100);
    out.push({ k: ks[j], wr: wr, t: gg.t });
    console.log('  ' + label + '=' + padL(ks[j], 3) + '  胜率' + padL(wr + '%', 5) + '  (n=' + gg.t + ')');
  }
  if (out.length >= 2) {
    var span = Math.max.apply(null, out.map(function (o) { return o.wr; })) -
               Math.min.apply(null, out.map(function (o) { return o.wr; }));
    console.log('  → 胜率跨度 ' + span + 'pt  ' + (span >= 20 ? '★有效轴' : (span >= 10 ? '弱相关' : '无效轴')));
  }
  console.log('');
}
group('fu', '前4格可用车数');
group('pr', '见全色轮数');
group('cars', '车队长');
