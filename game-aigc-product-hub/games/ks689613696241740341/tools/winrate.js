#!/usr/bin/env node
/**
 * 胜率模拟器 —— 用蒙特卡洛量化「随手玩」的通过概率
 * ═══════════════════════════════════════════════════════════════════
 * 用法: node tools/winrate.js [关卡上限] [每关局数]
 *
 * 【为什么需要它】此前难度全靠 S/色数/车数 这些"看起来像难度"的参数拍脑袋调，
 * 但玩家真正感知的是「我会不会输」。变现更是直接绑在失败率上（输了才看广告）。
 * 所以难度必须用【通过概率】定义，而不是用参数猜。
 *
 * 【玩家模型】三档策略，都不做前瞻搜索：
 *   random  完全随手：从队列前 4 随便抓一辆塞进空位
 *   casual  略有意识：优先抓"当前有可取豆"的车，否则随手（≈普通玩家）
 *   smart   老手：优先抓 剩余豆最多 的颜色（尽量避免僵尸车）
 * 目标胜率按 casual 档定义。
 */
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD, LG = PD.LG;

var MAXN = parseInt(process.argv[2], 10) || 30;
var RUNS = parseInt(process.argv[3], 10) || 40;

function mkRnd(s) {
  s = (s | 0) || 1; if (s < 0) s = -s;
  return function () { s ^= s << 13; s |= 0; s ^= s >>> 17; s ^= s << 5; s |= 0; return ((s >>> 0) % 100000) / 100000; };
}

/**
 * 单局模拟。返回 {win, why}
 * 与 pd-game.js 同口径：5 可用车位、队列前 4 可取、该色清空即放行、
 * 车装满即离场、豆需 isPickable && pathOut。
 */
function playOnce(lv, policy, rnd) {
  var beans = lv.beans.map(function (b) { return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false }; });
  var bd = PD.buildBounds(beans);
  var q8 = [null, null, null, null, null, null, null, null], pend = [], i;
  for (i = 0; i < lv.cars.length; i++) { if (i < 8) q8[i] = lv.cars[i]; else pend.push(lv.cars[i]); }
  var slots = [null, null, null, null, null], USABLE = 5;
  var remain = beans.length, guard = 0;

  function take(qi) {
    var c = q8[qi]; q8[qi] = null;
    if (qi < 4 && q8[qi + 4]) { q8[qi] = q8[qi + 4]; q8[qi + 4] = null; if (pend.length) q8[qi + 4] = pend.shift(); }
    return c;
  }

  while (remain > 0 && guard++ < 200000) {
    var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans), did = false, s;
    // ① 车装豆（自动，玩家不控制）
    for (s = 0; s < USABLE; s++) {
      var car = slots[s];
      if (!car || car.left <= 0) continue;
      for (i = 0; i < beans.length; i++) {
        var b = beans[i];
        if (b.gone || b.color !== car.color) continue;
        if (!PD.isPickable(b, top) || !PD.pathOut(b, occ, bd, null)) continue;
        b.gone = true; car.left--; car.loaded = (car.loaded || 0) + 1; remain--; did = true;
        top = PD.buildTopIndex(beans); occ = PD.buildOccupancy(beans);
        if (car.left === 0) break;
      }
      if (car.left === 0) slots[s] = null;      // 装满离场
    }
    // ② 放行规则 —— 【关键：区分"装过豆"和"一颗没装"】
    //  用户校准的陷阱语义：「他如果过早的放上去，可能就浪费了一个坑位」。
    //  所以必须区分两种车：
    //   A. 已经装过豆的车（loaded>0）→ 正常工作中，该色清空即放行（原规则）
    //   B. 进位至今一颗豆都没装进去的车（loaded===0）→ 它的色被外壳锁着，
    //      这辆车在【空转占位】。它必须一直等到自己那个色真的解锁、装到豆为止。
    //  【为什么不能沿用旧规则】旧规则只看 !rest[color]（该色是否清空）。而洋葱壳
    //  陷阱车是【真色车】，它的色最终一定会清空 → 于是错放的车总能被自动放走 →
    //  「浪费坑位」的代价被系统免费抹掉 → 无论怎么错放都不会输 → 胜率恒 100%。
    //  现在改成：只有真的装过豆（或该色彻底没了且它装过）才放行，
    //  空转车必须占着坑位等解锁 —— 这才让"过早放上去"真的付出代价。
    var rest = {};
    for (i = 0; i < beans.length; i++) if (!beans[i].gone) rest[beans[i].color] = (rest[beans[i].color] || 0) + 1;
    for (s = 0; s < USABLE; s++) {
      var c2 = slots[s];
      if (!c2 || c2.decoy === 1) continue;          // ghost 永不放行
      if (rest[c2.color]) continue;                 // 该色还有豆 → 继续等/继续装
      // 该色场上已无豆：装过豆的车正常离场；一颗没装的车说明它从未工作过 →
      // 它是被错放的空转车，此刻该色已清空、它永远等不到豆了 → 永久僵尸，不放行。
      if (c2.loaded > 0) { slots[s] = null; did = true; }
    }
    if (did) continue;
    if (remain === 0) break;

    // ③ 玩家决策：挑一辆车进空位
    var fi = -1;
    for (i = 0; i < USABLE; i++) if (!slots[i]) { fi = i; break; }

    var movable = {};
    for (i = 0; i < beans.length; i++) {
      var bb = beans[i];
      if (!bb.gone && PD.isPickable(bb, top) && PD.pathOut(bb, occ, bd, null)) movable[bb.color] = 1;
    }
    var avail = [];
    for (i = 0; i < 4; i++) if (q8[i]) avail.push(i);

    // ── 死因归类（车位占满只是"症状"，必须还原成"病因"）─────────────
    // 【为什么必须拆】旧版一律记成「车位被僵尸车占满」，那是最后一帧的现象，
    // 不是原因。同一个现象背后至少 5 条独立成因，混在一起就没法定向调参：
    // 改 ghost 剂量只影响 ①，改壳层只影响 ②，改 capMax 只影响 ③，
    // 全都塞进一个桶里 → 看不出哪个旋钮在起作用。
    if (fi < 0) {
      var nGhost = 0, nIdle = 0, nWaste = 0, nWait = 0;
      for (s = 0; s < USABLE; s++) {
        var cz = slots[s]; if (!cz) continue;
        var restC = rest[cz.color] || 0;
        if (cz.decoy === 1) nGhost++;                       // ① ghost：场上根本没这色
        else if (cz.loaded === 0 && !movable[cz.color]) nIdle++;  // ② 错放空转：这色此刻拿不到
        else if (restC === 0) nWaste++;                     // ③ 容量浪费：这色清空了却装不满
        else nWait++;                                       // ④ 正常工作中，只是慢
      }
      var why;
      if (nGhost >= 3) why = '干扰车堵死车位';
      else if (nIdle >= 2) why = '错放空转车（色被围住取不到）';
      else if (nGhost + nIdle >= 3) why = '干扰车+错放混合堵死';
      else if (nWaste >= 2) why = '车容量浪费（装不满赖着不走）';
      else if (!Object.keys(movable).length) why = '豆被几何围死（无豆可取）';
      else why = '车位占满但仍有可取豆（决策失误）';
      return { win: false, why: why, remain: remain,
               detail: { ghost: nGhost, idle: nIdle, waste: nWaste, wait: nWait } };
    }
    if (!avail.length) return { win: false, why: '队列耗尽但豆没清完', remain: remain };
    // 有空位、队列也有车，但没有任何一辆车的颜色现在能取到豆 →
    // 真机里玩家可以硬拖一辆进去（占位换时间），这里如实模拟：
    // 若连"能取到豆的颜色"都不存在，说明是几何围死，拖任何车都无意义。
    if (!Object.keys(movable).length) {
      return { win: false, why: '豆被几何围死（无豆可取）', remain: remain };
    }

    var pick;
    if (policy === 'random') {
      pick = avail[Math.floor(rnd() * avail.length)];
    } else if (policy === 'casual') {
      // 普通玩家：看一眼「这色现在有豆能装吗」就拖，不数豆、不看容量。
      // 注意：ghost 车会被这层过滤挡住（它的色没豆），但 greedy 挡不住 ——
      // 正是用户要的「不认真看就中计」；且有20% 手滑会随便拖。
      var good = avail.filter(function (qi) { return movable[q8[qi].color]; });
      pick = (good.length && rnd() < 0.8) ? good[Math.floor(rnd() * good.length)]
                                          : avail[Math.floor(rnd() * avail.length)];
    } else {
      // 老手：会数豆。把「容量远大于该色剩豆」的车（greedy）也认出来并避开。
      var bestQ = -1, bestScore = -1e9;
      for (i = 0; i < avail.length; i++) {
        var qi2 = avail[i], col = q8[qi2].color, left = rest[col] || 0;
        var sc = Math.min(q8[qi2].cap, left);          // 能实际装进去多少
        if (!movable[col]) sc -= 1000;                 // 当前一颗都取不到 → 别拖
        if (q8[qi2].cap > left) sc -= (q8[qi2].cap - left) * 3;   // 装不满的惩罚
        if (sc > bestScore) { bestScore = sc; bestQ = qi2; }
      }
      pick = bestQ < 0 ? avail[0] : bestQ;
    }
    var pk = take(pick);
    slots[fi] = { color: pk.color, cap: pk.cap, left: pk.cap, decoy: pk.decoy || 0, loaded: 0 };
  }
  return { win: remain === 0, remain: remain, why: remain === 0 ? '' : '超时' };
}

function rateOf(n, policy, runs) {
  var win = 0, whys = {};
  for (var k = 0; k < runs; k++) {
    var lv = LG.genLevel(n, (n * 100003 + k * 7919) >>> 0);
    if (!lv) continue;
    var r = playOnce(lv, policy, mkRnd(n * 31 + k * 17 + 1));
    if (r.win) win++; else whys[r.why] = (whys[r.why] || 0) + 1;
  }
  return { rate: win / runs, whys: whys };
}

// ── 目标胜率曲线（用户要求：第 2 关起 ≈30%，靠失败驱动广告变现）──
var TARGET = function (n) {
  if (n <= 1) return 0.90;                       // 第 1 关（旧第2关）教学：几乎必过
  if (n <= 7) return 0.30;                       // 第 2 关就上强度
  if (n <= 17) return 0.25;
  if (n <= 31) return 0.20;
  return 0.15;
};

console.log('═══ 胜率实测：1~' + MAXN + ' 关 × ' + RUNS + ' 局/关 ═══');
console.log('关  目标   随手     普通(判据)  老手    偏差');
var bad = 0, allWhy = {};
for (var n = 1; n <= MAXN; n++) {
  var tg = TARGET(n);
  var rr = rateOf(n, 'random', RUNS), rc = rateOf(n, 'casual', RUNS), rs = rateOf(n, 'smart', RUNS);
  var dev = rc.rate - tg;
  var flag = Math.abs(dev) <= 0.15 ? '  ' : '⚠️';
  if (Math.abs(dev) > 0.15) bad++;
  var wk = Object.keys(rc.whys).sort(function (a, b) { return rc.whys[b] - rc.whys[a]; });
  console.log(
    String(n).padEnd(3) +
    (tg * 100).toFixed(0).padStart(3) + '%  ' +
    (rr.rate * 100).toFixed(0).padStart(4) + '%  ' +
    (rc.rate * 100).toFixed(0).padStart(6) + '%  ' +
    (rs.rate * 100).toFixed(0).padStart(6) + '%  ' +
    (dev >= 0 ? '+' : '') + (dev * 100).toFixed(0).padStart(3) + ' ' + flag
  );
  // 【死因必须全量列出，不能只报 top1】只看第一名会误判旋钮：
  // 比如 top1 是干扰车，但第二名"错放空转"占 30% 时，调壳层同样有效。
  for (var wi = 0; wi < wk.length; wi++) {
    var cnt = rc.whys[wk[wi]];
    console.log('      └ ' + (cnt / RUNS * 100).toFixed(0).padStart(3) + '%  ' + wk[wi] + ' (' + cnt + '局)');
  }
  for (var ak in rc.whys) allWhy[ak] = (allWhy[ak] || 0) + rc.whys[ak];
}
console.log('\n偏离目标 >15pt 的关卡数: ' + bad + ' / ' + MAXN);
// 全局死因分布 —— 看清“到底是哪个机制在贡献难度”，而不是一个笼统的“车位占满”
var tw = 0, gk;
for (gk in allWhy) tw += allWhy[gk];
if (tw) {
  console.log('\n═══ 失败原因全局分布（普通玩家，共 ' + tw + ' 次失败）═══');
  Object.keys(allWhy).sort(function (a, b) { return allWhy[b] - allWhy[a]; }).forEach(function (k) {
    console.log('  ' + (allWhy[k] / tw * 100).toFixed(1).padStart(5) + '%  ' + k + '  (' + allWhy[k] + ')');
  });
}
console.log(bad === 0 ? '\n✅ 胜率曲线达标' : '\n❌ 需要继续调 LADDER');
