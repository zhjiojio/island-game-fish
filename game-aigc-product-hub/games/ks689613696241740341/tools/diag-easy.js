#!/usr/bin/env node
/**
 * 偏易关诊断 —— 关2/5/7/8/9 实测比目标易 +20~+35，而三根轴据说都已触底。
 * 【要回答的问题】到底是「轴没落地」还是「轴落地了但不够狠」？
 * 这两种情况的修法完全相反：
 *   · 没落地 → 修闸门（gate 写错/被 noOpenGate 跳过/重试耗尽后放行）
 *   · 落地了但不够 → 必须找第四根轴，改参数纯属白费
 * 所以先量清楚每关【实际落地】的三轴值，用偏易关和达标关做对照。
 */
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD, LG = PD.LG;

var N = parseInt(process.argv[2] || '24', 10);
var VERDICT = { 1: 'OK', 2: '偏易', 3: 'OK', 4: 'OK', 5: '偏易',
                6: 'OK', 7: '偏易', 8: '偏易', 9: '偏易', 10: 'OK' };

function avg(a) {
  if (!a.length) return 0;
  var s = 0;
  for (var i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}
function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

console.log('══ 偏易关三轴落地诊断（每关 ' + N + ' 局）══\n');
console.log(pad('关', 4) + pad('判定', 7) + pad('目标', 7) +
            pad('开局色', 9) + pad('前4可用', 10) +
            pad('实际色', 8) + pad('单色占比', 10) +
            pad('车数', 7) + pad('豆数', 7) + 'ghost');

for (var n = 1; n <= 10; n++) {
  var oc = [], fu = [], rc = [], ms = [], cars = [], beans = [], gh = [];
  var ocT = null, fuT = null;
  for (var k = 0; k < N; k++) {
    var seed = (n * 100003 + k * 7919 + 12345) >>> 0;
    var lv = LG.genLevel(n, seed);
    if (!lv) continue;
    if (PD.LG_measureOpenColors) {
      var o = PD.LG_measureOpenColors(lv.beans);
      oc.push(o || 0);
    }
    if (PD.LG_measureFrontUsable) {
      var f = PD.LG_measureFrontUsable(lv.beans, lv.cars);
      fu.push(f || 0);
    }
    rc.push(lv._realCols || 0);
    ms.push(lv._maxShare || 0);
    cars.push(lv.cars.length);
    beans.push(lv.beans.length);
    var g = 0;
    for (var ci = 0; ci < lv.cars.length; ci++) if (lv.cars[ci].decoy === 1) g++;
    gh.push(g);
    if (!ocT && PD.LG_openColorsTarget) ocT = PD.LG_openColorsTarget(n, seed);
    if (!fuT && PD.LG_frontUsableTarget) fuT = PD.LG_frontUsableTarget(n, seed);
  }
  var w = PD.LG_targetWinRate ? PD.LG_targetWinRate(n) : 0;
  console.log(
    pad(n, 4) +
    pad(VERDICT[n] || '?', 7) +
    pad(Math.round(w * 100) + '%', 7) +
    pad(avg(oc).toFixed(1) + (ocT ? '[' + ocT.lo + ',' + ocT.hi + ']' : ''), 9) +
    pad(avg(fu).toFixed(2), 10) +
    pad(avg(rc).toFixed(1), 8) +
    pad((avg(ms) * 100).toFixed(0) + '%', 10) +
    pad(avg(cars).toFixed(0), 7) +
    pad(avg(beans).toFixed(0), 7) +
    avg(gh).toFixed(1)
  );
}

console.log('\n【判读要点】');
console.log('  · 若偏易关的三轴值和达标关几乎一样 → 轴已触底，参数没救，要找第四轴。');
console.log('  · 单色占比若仍 >45% → 第三轴闸门没真正生效（应被 gate 拦掉）。');
console.log('  · 前4可用若普遍 >0 → 第二轴的伯努利难档没抽中，p 算小了。');
