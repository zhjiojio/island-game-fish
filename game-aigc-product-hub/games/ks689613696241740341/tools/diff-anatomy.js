// ═══════════════════════════════════════════════════════════════════
// 前 10 关难度全景表 —— 把「契约值」和「实际落地值」并排打出来
// ═══════════════════════════════════════════════════════════════════
// 【为什么必须并排看】契约（difficulty(n) 返回值）只是【意图】，
// 中间还要过 genArt → paintBeans → deriveCars → injectDecoys → refPlay 复验
// 五道工序，每一道都可能偏离意图（decoy 小数要取整、C 会因 ghost 占色而缩水、
// 注入失败会换 seed 重生成）。只看契约就等于只看图纸不看成品。
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD;
var RUNS = 12;

function pad(s, w) { s = '' + s; while (s.length < w) s += ' '; return s; }
function padL(s, w) { s = '' + s; while (s.length < w) s = ' ' + s; return s; }

console.log('═══ 前 10 关 · 契约 vs 实际 ═══');
console.log(pad('关', 3) + pad('段', 8) + padL('豆数', 5) + padL('色C', 4) +
  padL('cap', 5) + padL('壳sh', 5) + padL('decoy', 6) +
  pad('  | queueOrder', 16) + padL('mix', 4) +
  padL('  实测ghost', 11) + padL('场上色', 7) + padL('车数', 5) +
  padL('三星阈', 7) + padL('调车数', 7));

for (var n = 1; n <= 10; n++) {
  var D = PD.LG.difficulty(n);
  var dc = PD.LG.diffCfgOf ? PD.LG.diffCfgOf(n) : { queueOrder: '?', windowMix: '?' };
  var ghs = [], colsArr = [], carsArr = [], starArr = [], moveArr = [];
  for (var k = 0; k < RUNS; k++) {
    var lv = PD.LG.genLevel(n, (n * 7919 + k * 104729) >>> 0);
    if (!lv) continue;
    var on = {}, i;
    for (i = 0; i < lv.beans.length; i++) on[lv.beans[i].color] = 1;
    var g = 0;
    for (i = 0; i < lv.cars.length; i++) if (!on[lv.cars[i].color]) g++;
    var nc = 0; for (var c in on) nc++;
    ghs.push(g); colsArr.push(nc); carsArr.push(lv.cars.length);
    starArr.push(lv.stars.three);
    moveArr.push((lv._meta && lv._meta.carMoves) || 0);
  }
  function avg(a) { return a.length ? (a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0; }
  function mn(a) { return a.length ? Math.min.apply(null, a) : 0; }
  function mx(a) { return a.length ? Math.max.apply(null, a) : 0; }

  console.log(pad(n, 3) + pad(D.seg, 8) + padL(D.N, 5) + padL(D.C, 4) +
    padL(D.capMax, 5) + padL(D.shellK, 5) + padL(D.decoy.toFixed(2), 6) +
    pad('  | ' + dc.queueOrder, 16) + padL(dc.windowMix, 4) +
    padL(avg(ghs).toFixed(1) + '(' + mn(ghs) + '~' + mx(ghs) + ')', 11) +
    padL(avg(colsArr).toFixed(1), 7) +
    padL(avg(carsArr).toFixed(0), 5) +
    padL(avg(starArr).toFixed(0), 7) +
    padL(avg(moveArr).toFixed(0), 7));
}

// ── 单轴敏感度：每根旋钮单独动，看胜率变化多少 ────────────────────
// 【为什么要做】「哪根旋钮有效」不能靠读代码判断，只能靠控制变量实测。
// 以第 4 关为基准，每次只改一个参数，其余全部锁死。
console.log('\n═══ 第 4 关 · 单轴敏感度（普通玩家胜率，各 20 局）═══');
console.log('【读法】胜率降得越多 = 这根旋钮越有效。降幅 <5pt 基本等于无效轴。');

function simCasual(lv, usable) {
  // 简化版 casual 玩家：优先抓「当前有可取豆」的车，否则抓队首
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

function winrate(opt, label) {
  var win = 0, tot = 0;
  for (var k = 0; k < 20; k++) {
    var lv = PD.LG.genLevel(4, (4 * 7919 + k * 104729) >>> 0, opt);
    if (!lv) continue;
    tot++;
    if (simCasual(lv, 5)) win++;
  }
  var wr = tot ? Math.round(win / tot * 100) : 0;
  console.log(pad(label, 34) + padL(wr + '%', 6) + '  (' + win + '/' + tot + ')');
  return wr;
}

var base = winrate({}, '基准（第4关原样）');
console.log('── 单独放松某一轴 → 胜率应该回升 ──');
winrate({ forceDecoy: 0 }, 'decoy 4.92 → 0（去掉全部ghost）');
winrate({ forceDecoy: 2 }, 'decoy 4.92 → 2');
winrate({ forceShell: 0 }, 'shellK 3 → 0（无洋葱壳）');
winrate({ forceShell: 1 }, 'shellK 3 → 1');
winrate({ forceCap: 20 }, 'capMax 11 → 20（车少、决策稀疏）');
winrate({ noDeepQueue: 1 }, 'queueOrder deepFirst → random');
winrate({ forceC: 3 }, '色数 5 → 3');
winrate({ forceUsable: 6 }, '可用车位 5 → 6（等于看广告）');
console.log('── 单独收紧某一轴 → 胜率应该下降 ──');
winrate({ forceCap: 8 }, 'capMax 11 → 8（车更多）');
winrate({ forceUsable: 4 }, '可用车位 5 → 4');
