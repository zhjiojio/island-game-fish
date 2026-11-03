#!/usr/bin/env node
/**
 * suck() 热路径微基准 —— 量化「卡口感知排序」的真实开销
 * ═══════════════════════════════════════════════════════════════════
 * 真机实测 fps 6~13、长帧 150~200ms。suck() 每 90ms 被 watchdog 敲一次，
 * 所以 suck 的单次耗时必须 << 16ms，否则直接吃掉整个帧预算。
 *
 * 对比三种实现：
 *   base   ：改动前（只按 depthOf 排序，无卡口值）
 *   bad    ：上一版（cellIdx 在车位循环内重建 6 次 + 对全部同色豆算 gateValue）
 *   fixed  ：本版（cellIdx 整轮懒建 1 次 + 只对已确认可走的候选算 gateValue）
 */
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD, LG = PD.LG;

var lv = LG.genLevel(2, 12345);
var beans = lv.beans.map(function (b) {
  return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false, moving: false };
});
var bd = PD.buildBounds(beans);
// 模拟中局：清掉 35% 的豆（此时候选最多、最吃性能）
var rnd = 1;
for (var i = 0; i < beans.length; i++) {
  rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
  if ((rnd % 100) < 35) beans[i].gone = true;
}
var alive = 0;
for (i = 0; i < beans.length; i++) if (!beans[i].gone) alive++;

// 造 5 辆在位车（模拟 5 个车位全满）
var cols = {};
for (i = 0; i < beans.length; i++) if (!beans[i].gone) cols[beans[i].color] = 1;
var colList = Object.keys(cols);
var slots = [];
for (i = 0; i < 5; i++) slots.push({ color: colList[i % colList.length], left: 12, onWay: 0, leave: -1 });

function depthOf(b) {
  return Math.min(b.gx - bd.minX, bd.maxX - b.gx, b.gy - bd.minY, bd.maxY - b.gy);
}

// ── base：改动前 ──
function suckBase() {
  var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans);
  var reach = PD.buildReach(occ, bd, {}), si, i, n = 0;
  for (si = 0; si < 5; si++) {
    var car = slots[si], cands = [];
    for (i = 0; i < beans.length; i++) {
      var b0 = beans[i];
      if (b0.gone || b0.moving || b0.color !== car.color) continue;
      cands.push(b0);
    }
    cands.sort(function (p, q) { return depthOf(p) - depthOf(q) || p.gy - q.gy; });
    for (i = 0; i < cands.length; i++) {
      if (!PD.canWalkFast(cands[i], top, reach)) continue;
      if (!PD.canWalk(cands[i], top, occ, bd, {})) continue;
      n++; break;
    }
  }
  return n;
}

// ── bad：上一版（索引在循环内重建 + 全量算卡口） ──
function suckBad() {
  var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans);
  var reach = PD.buildReach(occ, bd, {}), si, i, n = 0;
  for (si = 0; si < 5; si++) {
    var car = slots[si], cands = [];
    for (i = 0; i < beans.length; i++) {
      var b0 = beans[i];
      if (b0.gone || b0.moving || b0.color !== car.color) continue;
      cands.push(b0);
    }
    if (cands.length > 1) {
      var cellIdx = PD.buildCellIndex(beans);              // ← 每车位重建一次
      for (i = 0; i < cands.length; i++) {                 // ← 对全部同色豆算
        var gv = PD.gateValue(cands[i], beans, top, reach, cellIdx);
        cands[i]._gc = gv.colors; cands[i]._gb = gv.beans;
      }
      cands.sort(function (p, q) {
        return (p._gc - q._gc) || (p._gb - q._gb) || (depthOf(p) - depthOf(q)) || (p.gy - q.gy);
      });
    }
    for (i = 0; i < cands.length; i++) {
      if (!PD.canWalkFast(cands[i], top, reach)) continue;
      if (!PD.canWalk(cands[i], top, occ, bd, {})) continue;
      n++; break;
    }
  }
  return n;
}

// ── fixed：本版（先过滤再排序 + 索引懒建复用） ──
function suckFixed() {
  var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans);
  var reach = PD.buildReach(occ, bd, {}), si, i, n = 0, cellIdx = null;
  for (si = 0; si < 5; si++) {
    var car = slots[si], cands = [];
    for (i = 0; i < beans.length; i++) {
      var b0 = beans[i];
      if (b0.gone || b0.moving || b0.color !== car.color) continue;
      if (!PD.canWalkFast(b0, top, reach)) continue;       // ← 先过滤
      cands.push(b0);
      if (cands.length >= 24) break;
    }
    if (!cands.length) continue;
    if (cands.length > 1) {
      if (!cellIdx) cellIdx = PD.buildCellIndex(beans);    // ← 整轮只建一次
      for (i = 0; i < cands.length; i++) {
        var gv = PD.gateValue(cands[i], beans, top, reach, cellIdx);
        cands[i]._gc = gv.colors; cands[i]._gb = gv.beans;
      }
      cands.sort(function (p, q) {
        return (p._gc - q._gc) || (p._gb - q._gb) || (depthOf(p) - depthOf(q)) || (p.gy - q.gy);
      });
    }
    for (i = 0; i < cands.length; i++) {
      if (!PD.canWalk(cands[i], top, occ, bd, {})) continue;
      n++; break;
    }
  }
  return n;
}

function bench(fn, name, N) {
  fn(); fn();                                    // 预热 JIT
  var t0 = process.hrtime.bigint();
  for (var k = 0; k < N; k++) fn();
  var ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  return { name: name, ms: ms };
}

console.log('═══ suck() 热路径微基准（第2关中局，存活 ' + alive + ' 豆，5 车位满载）═══');
console.log('注：suck 每 90ms 调一次，单次必须 << 16ms（一帧预算）');
var N = 200;
var rb = bench(suckBase, 'base  改动前      ', N);
var rd = bench(suckBad, 'bad   上一版(卡)  ', N);
var rf = bench(suckFixed, 'fixed 本版(已修)  ', N);
[rb, rd, rf].forEach(function (r) {
  var mob = r.ms * 6;                            // 手机约为桌面 Node 的 5~8 倍
  console.log('  ' + r.name + r.ms.toFixed(2).padStart(7) + ' ms/次   估手机 ' +
    mob.toFixed(0).padStart(4) + ' ms   ' + (mob > 16 ? '✗ 超一帧预算' : '✓ 安全'));
});
console.log('\n  上一版 vs 改动前 : ' + (rd.ms / rb.ms).toFixed(1) + ' 倍');
console.log('  本版   vs 改动前 : ' + (rf.ms / rb.ms).toFixed(2) + ' 倍');
console.log('  本版   vs 上一版 : 快 ' + (rd.ms / rf.ms).toFixed(1) + ' 倍');
