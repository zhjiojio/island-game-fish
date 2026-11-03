// ═══════════════════════════════════════════════════════════════════
// 诊断：为什么单轴敏感度测出来「所有旋钮都无效」
// ═══════════════════════════════════════════════════════════════════
// 【怀疑 1 · 重生成混淆】我在 genLevel 里加了「注入失败 → 换 seed 重生成整关」。
//   而 refPlay 复验用到 D.usable、注入量用到 D.decoy —— 也就是说：
//   改动任何一个影响 refPlay 的旋钮，都会改变【哪些 seed 触发重生成】，
//   于是拿到的是【一批完全不同的关卡】。这不是「同一关调旋钮」，
//   而是「换了一批关卡」→ 对照实验的前提被破坏。
//   验法：同 seed 下，对比不同旋钮设置产生的豆阵指纹是否一致。
//
// 【怀疑 2 · 失败原因与旋钮无关】若 decoy=0（场上根本没有干扰车）时
//   仍有 30% 失败，那失败必然来自「颜色被围死取不到」—— 那是【图案几何】
//   属性，不是难度旋钮能控制的。要把失败原因分类统计出来。
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD;

function fp(lv) {  // 豆阵指纹：只看豆的位置+颜色，不含车队
  var s = '';
  for (var i = 0; i < lv.beans.length; i += 37) {
    s += lv.beans[i].color.charAt(0) + lv.beans[i].gx + ',' + lv.beans[i].gy + ';';
  }
  return lv.beans.length + '|' + s;
}

console.log('═══ 怀疑1：改旋钮是否换掉了关卡本体 ═══');
console.log('（同一个 seed，若指纹不同 → 拿到的是不同的关卡 → 对照实验无效）');
var cfgs = [
  ['基准', {}],
  ['forceDecoy=0', { forceDecoy: 0 }],
  ['forceDecoy=2', { forceDecoy: 2 }],
  ['forceShell=0', { forceShell: 0 }],
  ['forceUsable=6', { forceUsable: 6 }],
  ['forceCap=8', { forceCap: 8 }]
];
for (var k = 0; k < 4; k++) {
  var seed = (4 * 7919 + k * 104729) >>> 0;
  var line = 'seed' + k + ': ';
  var baseFp = null, same = [];
  for (var ci = 0; ci < cfgs.length; ci++) {
    var lv = PD.LG.genLevel(4, seed, cfgs[ci][1]);
    var f = lv ? fp(lv) : 'NULL';
    if (ci === 0) baseFp = f;
    same.push(cfgs[ci][0] + (f === baseFp ? '=同' : '≠异'));
  }
  console.log(line + same.join(' '));
}

// ── 失败原因分类 ───────────────────────────────────────────────
// 把 simCasual 的失败拆成两类：
//   A「车位堵死」 = 有空位但队列前4没有能干活的车，被迫塞进无用车
//   B「颜色围死」 = 场上还有豆，但没有任何一颗是可取的（几何锁死）
console.log('\n═══ 怀疑2：失败原因分类（第4关，20局）═══');
function simDiag(lv, usable) {
  var beans = lv.beans.map(function (b) {
    return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false };
  });
  var bd = PD.buildBounds(beans);
  var q8 = [], pend = [], i;
  for (i = 0; i < lv.cars.length; i++) { if (i < 8) q8.push(lv.cars[i]); else pend.push(lv.cars[i]); }
  while (q8.length < 8) q8.push(null);
  var slots = []; for (i = 0; i < usable; i++) slots.push(null);
  var remain = beans.length, guard = 0, ghostIn = 0;
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
    var need = {}, anyPick = 0;
    for (i = 0; i < beans.length; i++) {
      var b2 = beans[i];
      if (!b2.gone && PD.isPickable(b2, top) && PD.pathOut(b2, occ, bd, null)) { need[b2.color] = 1; anyPick++; }
    }
    var fi = -1;
    for (s = 0; s < usable; s++) if (!slots[s]) { fi = s; break; }
    if (fi < 0) return { win: false, why: anyPick === 0 ? 'B颜色围死' : 'A车位堵死', ghostIn: ghostIn, remain: remain };
    if (anyPick === 0) return { win: false, why: 'B颜色围死', ghostIn: ghostIn, remain: remain };
    var best = -1;
    for (i = 0; i < 4; i++) if (q8[i] && need[q8[i].color]) { best = i; break; }
    if (best < 0) { for (i = 0; i < 4; i++) if (q8[i]) { best = i; break; } }
    if (best < 0) return { win: false, why: '队列空', ghostIn: ghostIn, remain: remain };
    var pk = take(best);
    if (pk.decoy) ghostIn++;
    slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0 };
  }
  return { win: remain === 0, why: guard >= 30000 ? '超时' : '-', ghostIn: ghostIn, remain: remain };
}
function report(opt, label) {
  var win = 0, tot = 0, why = {}, gi = 0;
  for (var k2 = 0; k2 < 20; k2++) {
    var lv = PD.LG.genLevel(4, (4 * 7919 + k2 * 104729) >>> 0, opt);
    if (!lv) continue;
    tot++;
    var r = simDiag(lv, opt.forceUsable || 5);
    gi += r.ghostIn;
    if (r.win) win++; else why[r.why] = (why[r.why] || 0) + 1;
  }
  var parts = []; for (var w in why) parts.push(w + '×' + why[w]);
  console.log((label + '                              ').slice(0, 30) +
    ('   ' + Math.round(win / tot * 100) + '%').slice(-5) +
    '  误塞ghost均' + (gi / tot).toFixed(1) + '  失败:' + (parts.join(' ') || '无'));
}
report({}, '基准');
report({ forceDecoy: 0 }, 'decoy=0');
report({ forceShell: 0 }, 'shellK=0');
