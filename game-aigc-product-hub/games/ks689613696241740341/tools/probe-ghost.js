// 临时探针：实测各关真实 ghost 数（不能凭 LADDER 配置猜 —— decoy 是小数，
// genLevel 里按 seed 做伯努利取整，且 injectDecoys 在 pool 为空时会直接 return，
// 所以「契约值」和「实际落地值」可能差很远。这正是要验的东西。）
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
// 【坑】PD 不在 global 上，而是挂在 window.M3.PD（见 pd-core.js 第 8-9 行）。
// 直接写 global.PD 会拿到 undefined —— winrate.js 用的就是下面这行写法。
var PD = window.M3.PD;

console.log('关  decoy契约  C  cap  shellK | 实际ghost分布        均值  车队');
for (var n = 2; n <= 8; n++) {
  var D = PD.LG.difficulty(n), gh = [], cars = 0, cols = 0;
  for (var k = 0; k < 10; k++) {
    var lv = PD.LG.genLevel(n, (n * 7919 + k * 104729) >>> 0);
    if (!lv) continue;
    var on = {}, i;
    for (i = 0; i < lv.beans.length; i++) on[lv.beans[i].color] = 1;
    var g = 0;
    for (i = 0; i < lv.cars.length; i++) if (!on[lv.cars[i].color]) g++;
    gh.push(g); cars = lv.cars.length;
    cols = 0; for (var c in on) cols++;
  }
  var avg = gh.length ? gh.reduce(function (a, b) { return a + b; }, 0) / gh.length : 0;
  console.log('关' + n + '   ' + D.decoy.toFixed(2) + '     ' + D.C + '  ' + D.capMax +
    '    ' + D.shellK + '    | [' + gh.join(',') + ']  ' + avg.toFixed(1) + '  ' + cars +
    '辆/场上' + cols + '色');
}

// ── 追根：ghost=0 到底是哪条路径产生的 ────────────────────────────
// 关3 有 3/10 局 ghost=0。要区分三种可能：
//   ① _meta.decoyN 就是 0  → 注入循环全失败（我刚改的那段没兜住）
//   ② decoyN>0 但实测 ghost=0 → 注入的"干扰色"其实场上有豆（fieldCols 口径错）
//   ③ lv 是 fallback 固定关卡 → 压根没走 genLevel 的注入分支
// ── 追根 2：ghost=0 的局，injectDecoys 到底有没有把车塞进去 ──────────
// refPlay 是【无前瞻贪心】参考玩家，车位堵死就 return false。所以要区分两种可能：
//   ① injectDecoys 塞进去了，但每个 dn 都被 refPlay 否掉 → 是"参考玩家太笨"
//   ② injectDecoys 压根没塞（pool 为空 / 数量为 0）→ 是"注入本身失效"
// 直接复刻注入段，把每次尝试的实际 ghost 数打出来，一眼区分。
console.log('\n── 关3 seed0 注入追踪 ──');
(function () {
  var lv = PD.LG.genLevel(3, (3 * 7919 + 0 * 104729) >>> 0);
  if (!lv) { console.log('genLevel 返回 null'); return; }
  var fieldCols = [], ck;
  for (ck in lv.counts) if (lv.counts.hasOwnProperty(ck)) fieldCols.push(ck);
  console.log('场上色=[' + fieldCols.join(',') + '] 当前车数=' + lv.cars.length);
  var realCars = lv.cars, on = {}, i;
  for (i = 0; i < lv.beans.length; i++) on[lv.beans[i].color] = 1;
  for (var att = 0; att < 6; att++) {
    var dn = att < 4 ? 4 : Math.max(1, 4 - Math.floor((att - 4) / 3) - 1);
    var trial = PD.LG.injectDecoys(realCars, fieldCols, lv.counts, dn,
      (lv.seed ^ (0x3c6ef372 + att * 0x9e3779b9)) >>> 0);
    var g = 0;
    for (i = 0; i < trial.length; i++) if (!on[trial[i].color]) g++;
    console.log('att' + att + ' dn=' + dn + ' → 车数' + trial.length + ' ghost=' + g);
  }
})();

console.log('\n── 关3 逐局溯源 ──');
for (var k2 = 0; k2 < 10; k2++) {
  var lv2 = PD.LG.genLevel(3, (3 * 7919 + k2 * 104729) >>> 0);
  if (!lv2) { console.log('seed' + k2 + ' → NULL'); continue; }
  var on2 = {}, i2;
  for (i2 = 0; i2 < lv2.beans.length; i2++) on2[lv2.beans[i2].color] = 1;
  var g2 = 0;
  for (i2 = 0; i2 < lv2.cars.length; i2++) if (!on2[lv2.cars[i2].color]) g2++;
  var m = lv2._meta || {};
  var keys = []; for (var kk in m) keys.push(kk + '=' + m[kk]);
  console.log('seed' + k2 + ' 实测ghost=' + g2 + ' | _meta: ' + keys.join(' '));
}

