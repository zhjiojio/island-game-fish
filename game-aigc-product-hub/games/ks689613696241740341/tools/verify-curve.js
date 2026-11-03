// 验收：实测胜率 vs 目标曲线
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

var RUNS = parseInt(process.argv[2] || '20', 10);
var MAXN = parseInt(process.argv[3] || '10', 10);
console.log('每关 ' + RUNS + ' 局\n');
console.log(pad('关', 4) + padL('目标', 6) + padL('实测', 6) + padL('偏差', 7) +
  padL('开局色', 8) + padL('目标区间', 10) + padL('生成重试', 9) + '  判定');
for (var n = 1; n <= MAXN; n++) {
  var win = 0, tot = 0, ocs = [], trs = [], fus = [];
  for (var k = 0; k < RUNS; k++) {
    var lv = PD.LG.genLevel(n, (n * 7919 + k * 104729) >>> 0);
    if (!lv) continue;
    tot++;
    ocs.push(lv._openColors || 0);
    trs.push((lv._meta && lv._meta.tries) || 0); fus.push(lv._frontUsable || 0);
    if (simCasual(lv, 5)) win++;
  }
  function avg(a) { return a.length ? (a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0; }
  var wr = tot ? win / tot : 0;
  var tw = PD.LG_targetWinRate(n);
  var oct = PD.LG_openColorsTarget(n);
  var dev = Math.round((wr - tw) * 100);
  console.log(pad(n, 4) + padL(Math.round(tw * 100) + '%', 6) +
    padL(Math.round(wr * 100) + '%', 6) +
    padL((dev > 0 ? '+' : '') + dev, 7) +
    padL(avg(ocs).toFixed(1), 8) +
    padL('[' + oct.lo + ',' + oct.hi + ']', 10) +
    padL(avg(trs).toFixed(1), 9) + padL(avg(fus).toFixed(1), 7) +
    '  ' + (Math.abs(dev) <= 10 ? 'OK' : (dev > 0 ? '偏易' : '偏难')));
}
