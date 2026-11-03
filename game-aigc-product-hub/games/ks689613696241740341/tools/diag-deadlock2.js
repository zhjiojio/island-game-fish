// ══════════════════════════════════════════════════════════════════
// 第二步：把一局失败局面完整打出来，看「颜色围死」是永久还是暂时
// ══════════════════════════════════════════════════════════════════
// 【要回答的问题】失败那一刻：5 个车位上是什么车？场上还剩什么豆？
//   这些豆是【真的取不到】（被四面围死/无出路），还是【只是暂时被挡】？
// 【为什么这个区分决定一切】若是"暂时被挡"，说明模拟器把"卡一下"当成了"死了"
//   → 测出来的失败率本身就是假的 → 调 LADDER 是在追一个不存在的目标。
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD;

function pad(s, w) { s = '' + s; while (s.length < w) s += ' '; return s; }

// casual 玩家 + 失败现场快照
function simWithSnapshot(lv, usable) {
  var beans = lv.beans.map(function (b) {
    return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false };
  });
  var bd = PD.buildBounds(beans);
  var q8 = [], pend = [], i;
  for (i = 0; i < lv.cars.length; i++) { if (i < 8) q8.push(lv.cars[i]); else pend.push(lv.cars[i]); }
  while (q8.length < 8) q8.push(null);
  var slots = []; for (i = 0; i < usable; i++) slots.push(null);
  var remain = beans.length, guard = 0, moves = 0;
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

    if (fi < 0) {
      // ── 死局现场：车位全满且无车能装 ──
      // 关键诊断：把每个车位的车、以及该色的剩余豆情况全部打出来
      top = PD.buildTopIndex(beans); occ = PD.buildOccupancy(beans);
      var restCnt = {}, pickCnt = {};
      for (i = 0; i < beans.length; i++) {
        var b3 = beans[i];
        if (b3.gone) continue;
        restCnt[b3.color] = (restCnt[b3.color] || 0) + 1;
        if (PD.isPickable(b3, top) && PD.pathOut(b3, occ, bd, null)) {
          pickCnt[b3.color] = (pickCnt[b3.color] || 0) + 1;
        }
      }
      var slotDesc = [];
      for (s = 0; s < usable; s++) {
        var sc = slots[s];
        if (!sc) { slotDesc.push('空'); continue; }
        var rc = restCnt[sc.color] || 0, pc = pickCnt[sc.color] || 0;
        var why;
        if (rc === 0)      why = '该色豆已清空 → 永久僵尸';
        else if (pc === 0) why = '该色还剩' + rc + '颗但全被挡 → 暂时取不到';
        else               why = '该色有' + pc + '颗可取(异常!)';
        slotDesc.push(sc.color + '(需' + sc.left + ')[' + why + ']');
      }
      return {
        win: false, moves: moves, remain: remain,
        slots: slotDesc, restCnt: restCnt, pickCnt: pickCnt
      };
    }

    var need = {};
    for (i = 0; i < beans.length; i++) {
      var b2 = beans[i];
      if (!b2.gone && PD.isPickable(b2, top) && PD.pathOut(b2, occ, bd, null)) need[b2.color] = 1;
    }
    var best = -1;
    for (i = 0; i < 4; i++) if (q8[i] && need[q8[i].color]) { best = i; break; }
    if (best < 0) { for (i = 0; i < 4; i++) if (q8[i]) { best = i; break; } }
    if (best < 0) return { win: false, moves: moves, remain: remain, slots: ['队列已空'], restCnt: {}, pickCnt: {} };
    var pk = take(best);
    slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0 };
    moves++;
  }
  return { win: remain === 0, moves: moves, remain: remain };
}

console.log('═══ 第二步：失败现场解剖（关 3~6，各扫 30 局，打印前 3 次失败）═══');
console.log('【核心问题】僵尸车是「该色豆已清空」还是「该色豆还在只是被挡」？\n');

var tally = { cleared: 0, blocked: 0, weird: 0 };
for (var n = 3; n <= 6; n++) {
  var shown = 0, wins = 0, tot = 0;
  for (var k = 0; k < 30 && shown < 3; k++) {
    var lv = PD.LG.genLevel(n, (n * 7919 + k * 104729) >>> 0);
    if (!lv) continue;
    tot++;
    var r = simWithSnapshot(lv, 5);
    if (r.win) { wins++; continue; }
    shown++;
    console.log('关' + n + ' seed' + k + ' 失败：已调车' + r.moves + '次，场上还剩' + r.remain + '颗豆');
    for (var s = 0; s < r.slots.length; s++) {
      console.log('    车位' + (s + 1) + ': ' + r.slots[s]);
      if (r.slots[s].indexOf('永久僵尸') >= 0) tally.cleared++;
      else if (r.slots[s].indexOf('暂时取不到') >= 0) tally.blocked++;
      else if (r.slots[s].indexOf('异常') >= 0) tally.weird++;
    }
    console.log('');
  }
  console.log('  → 关' + n + ' 前' + tot + '局中胜' + wins + '局\n');
}
console.log('>>> 第二步汇总（所有打印出的车位）：');
console.log('    该色豆已清空（真·永久僵尸）: ' + tally.cleared);
console.log('    该色豆还在但被挡（暂时）  : ' + tally.blocked);
console.log('    有可取豆却判死（逻辑异常）: ' + tally.weird);
