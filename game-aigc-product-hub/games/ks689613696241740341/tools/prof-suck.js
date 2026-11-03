// ══ suck() 真实成本实测 ═══════════════════════════════════════════════
// 【为什么专测这个】真机 fps≈10~12。我先怀疑立绘填充率，但剖分算出只有
// 0.15 G 像素/秒 —— 远达不到打满 GPU，假设被自己否掉了。
// 豆阵也已经烘进离屏缓存（1 次 drawImage/帧），不是瓶颈。
// 剩下最大的嫌疑是 suck()：它被 watchdog 每 90ms 敲一次，内部要
// buildTopIndex + buildOccupancy + buildReach（BFS 灌全阵可达水）。
// 关卡 3 有 404 颗豆 —— 如果 buildReach 是全阵 BFS，每 90ms 跑一次
// 就是每秒 11 次全阵扫描，这才是能把帧率压到 10 的量级。
// 这里直接调 pd-core 的真函数计时，不猜。
var path = require('path');
global.window = global;
global.ks = { getSystemInfoSync: function () { return { windowWidth: 375, windowHeight: 812, pixelRatio: 2 }; } };

var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD;

function bench(label, fn, iters) {
  fn(); // 预热，排除首次 JIT
  var t0 = process.hrtime.bigint();
  for (var i = 0; i < iters; i++) fn();
  var t1 = process.hrtime.bigint();
  var per = Number(t1 - t0) / 1e6 / iters;
  console.log('  ' + label + '：' + per.toFixed(3) + ' ms/次');
  return per;
}

console.log('══ suck() 内部各步真实耗时（Node，手机约慢 5~10×）══\n');

[1, 3, 6, 10].forEach(function (n) {
  var lv = PD.LG.genLevel(n, (n * 7919 + 12345) >>> 0);
  if (!lv) { console.log('关' + n + ' 生成失败'); return; }
  var beans = lv.beans.map(function (b) {
    return { gx: b.gx, gy: b.gy, color: b.color, gone: false, moving: false };
  });
  console.log('── 关' + n + '：' + beans.length + ' 豆 ──');
  var bd = PD.buildBounds(beans);          // bounds 是运行时算的，lv 上没有
  var top, occ, reach;
  var t1 = bench('buildTopIndex ', function () { top = PD.buildTopIndex(beans); }, 200);
  var t2 = bench('buildOccupancy', function () { occ = PD.buildOccupancy(beans); }, 200);
  var t3 = bench('buildReach(BFS)', function () { reach = PD.buildReach(occ, bd, {}); }, 200);
  var sum = t1 + t2 + t3;
  console.log('  ── 单次 suck 三步合计：' + sum.toFixed(3) + ' ms');
  console.log('  ── watchdog 每 90ms 敲一次 → 每秒 ' + (1000 / 90).toFixed(1) +
              ' 次 = ' + (sum * 1000 / 90).toFixed(1) + ' ms/秒 CPU');
  console.log('  ── 手机按 7× 估：' + (sum * 7 * 1000 / 90).toFixed(0) +
              ' ms/秒（1000ms 里占 ' + (sum * 7 * 100 / 90).toFixed(0) + '%）');
  console.log('');
});
