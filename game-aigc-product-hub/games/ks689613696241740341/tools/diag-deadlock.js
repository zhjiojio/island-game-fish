// ═══════════════════════════════════════════════════════════════════
// 死局归因诊断 —— 三步，只输出原始数据，不做推理
// ═══════════════════════════════════════════════════════════════════
// 【背景矛盾】铁律 S=0（每色车总容量 === 该色豆数）意味着每辆真车都刚好装满，
//   于是"永久装不满的车"应该只能是 ghost。ghost ≤ 5 = 车位数，且 casual 玩家
//   会主动避开 ghost。按此推理死局应该极难发生。
//   但 winrate.js 实测第 4 关有 30% 失败率，且报出 40% 是「颜色被围住取不到」。
// 【三个可能出口】(a) S=0 没真生效  (b) 判定过严：暂时卡住被当成永久死局
//   (c) 洋葱壳造成了 S=0 之外的新阻塞
// 本脚本逐个查。
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD;

function pad(s, w) { s = '' + s; while (s.length < w) s += ' '; return s; }
function padL(s, w) { s = '' + s; while (s.length < w) s = ' ' + s; return s; }

// ══════════════════════════════════════════════════════════════════
// 第一步：验 S=0 是否真生效（纯算术，无推理成分）
// ══════════════════════════════════════════════════════════════════
console.log('═══ 第一步：每色「车总容量」vs「豆数」═══');
console.log('【口径】只统计真车（非 ghost）。若 S=0 生效，两列必须严格相等。');
console.log(pad('关', 4) + pad('颜色', 8) + padL('豆数', 6) + padL('车容量和', 9) +
  padL('差', 5) + padL('真车数', 7) + '  判定');

var step1Bad = 0;
for (var n = 1; n <= 10; n++) {
  var lv = PD.LG.genLevel(n, (n * 7919) >>> 0);
  if (!lv) { console.log(pad(n, 4) + 'genLevel 返回 null'); continue; }
  // 场上各色豆数
  var beanCnt = {}, i;
  for (i = 0; i < lv.beans.length; i++) {
    beanCnt[lv.beans[i].color] = (beanCnt[lv.beans[i].color] || 0) + 1;
  }
  // 各色车容量之和（分真车/ghost）
  var capSum = {}, carNum = {}, ghostCap = {}, ghostNum = {};
  for (i = 0; i < lv.cars.length; i++) {
    var c = lv.cars[i];
    if (beanCnt[c.color]) {
      capSum[c.color] = (capSum[c.color] || 0) + c.cap;
      carNum[c.color] = (carNum[c.color] || 0) + 1;
    } else {
      ghostCap[c.color] = (ghostCap[c.color] || 0) + c.cap;
      ghostNum[c.color] = (ghostNum[c.color] || 0) + 1;
    }
  }
  var first = true;
  for (var col in beanCnt) {
    var b = beanCnt[col], cp = capSum[col] || 0, d = cp - b;
    if (d !== 0) step1Bad++;
    console.log(pad(first ? n : '', 4) + pad(col, 8) + padL(b, 6) + padL(cp, 9) +
      padL((d > 0 ? '+' : '') + d, 5) + padL(carNum[col] || 0, 7) +
      '  ' + (d === 0 ? 'OK' : (d > 0 ? '容量多余 → 必有车装不满' : '容量不足 → 有豆无车')));
    first = false;
  }
  // ghost 单独列出
  var gl = [];
  for (var gc in ghostNum) gl.push(gc + '×' + ghostNum[gc] + '(cap' + ghostCap[gc] + ')');
  console.log(pad('', 4) + '  ghost: ' + (gl.length ? gl.join(' ') : '无'));
}
console.log('\n>>> 第一步汇总：色×关 组合中容量≠豆数的个数 = ' + step1Bad);
