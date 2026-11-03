#!/usr/bin/env node
/**
 * 静态组合分析：颜色 × 剥离深度 交叉表
 * ═══════════════════════════════════════════════════════════════════
 * 只看「豆的颜色组合」本身，不模拟对局，秒出。
 *
 * 核心指标 —— 颜色的【深度跨度】：
 *   spread(color) = 该色豆分布的剥离深度层数 / 图案总深度
 *   spread 接近 0  → 该色全挤在同一圈（如西瓜黑边全在 depth0）
 *                   → 开局一次性全暴露 → 车进场秒吃满 → 车位零占用 → 零压力
 *   spread 接近 1  → 该色横跨内外 → 车吃掉外层后必须【等】内层暴露
 *                   → 车占着位子等 → 车位才第一次变成稀缺资源
 *
 *   headRatio(color) = 该色在最外层(depth<=2)的豆数 / 该色总豆数
 *   headRatio 高 = 开局就能吃掉大半 = 没有后续依赖
 */
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD, LG = PD.LG;

var MAXN = parseInt(process.argv[2], 10) || 10;
var SEEDS = parseInt(process.argv[3], 10) || 3;

// 从 beans 反建 grid，复用 LG.peelDepth
function depthOfBeans(beans) {
  var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, i;
  for (i = 0; i < beans.length; i++) {
    var b = beans[i];
    if (b.gx < minx) minx = b.gx; if (b.gx > maxx) maxx = b.gx;
    if (b.gy < miny) miny = b.gy; if (b.gy > maxy) maxy = b.gy;
  }
  var rows = maxy - miny + 1, cols = maxx - minx + 1, grid = [], r, c;
  for (r = 0; r < rows; r++) { var row = []; for (c = 0; c < cols; c++) row.push(null); grid.push(row); }
  for (i = 0; i < beans.length; i++) grid[beans[i].gy - miny][beans[i].gx - minx] = 1;
  var pd = LG.peelDepth(grid, rows, cols);
  var out = [];
  for (i = 0; i < beans.length; i++) out.push(pd.d[beans[i].gy - miny][beans[i].gx - minx]);
  return { d: out, maxDepth: pd.maxDepth };
}

console.log('═══ 颜色 × 剥离深度 组合分析（spread=深度跨度占比, head=最外3层占该色比例）═══');
console.log('关 | 图案      maxD | 各色: 豆数 spread head | 均spread 均head | 开局暴露色数');
for (var n = 1; n <= MAXN; n++) {
  for (var k = 0; k < SEEDS; k++) {
    var lv = LG.genLevel(n, (n * 7919 + k * 104729) >>> 0);
    var info = depthOfBeans(lv.beans);
    var byCol = {};
    for (var i = 0; i < lv.beans.length; i++) {
      var col = lv.beans[i].color, d = info.d[i];
      if (!byCol[col]) byCol[col] = { n: 0, layers: {}, head: 0 };
      byCol[col].n++; byCol[col].layers[d] = 1;
      if (d <= 2) byCol[col].head++;
    }
    var parts = [], sumSpread = 0, sumHead = 0, cn = 0, openColors = 0;
    for (var col in byCol) {
      var o = byCol[col];
      var spread = Object.keys(o.layers).length / Math.max(1, info.maxDepth);
      var head = o.head / o.n;
      sumSpread += spread; sumHead += head; cn++;
      if (o.head > 0) openColors++;
      parts.push(col.slice(0, 2) + ':' + String(o.n).padStart(3) + ' ' + spread.toFixed(2) + '/' + head.toFixed(2));
    }
    console.log(
      String(n).padStart(2) + ' | ' + (lv.shapeKind || '?').padEnd(10) + String(info.maxDepth).padStart(3) +
      ' | ' + parts.join('  ') +
      ' | ' + (sumSpread / cn).toFixed(2) + ' ' + (sumHead / cn).toFixed(2) +
      ' | ' + openColors + '/' + cn
    );
  }
}
