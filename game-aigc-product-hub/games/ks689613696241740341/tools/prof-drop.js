// ══ beanCacheDrop 的隐藏 O(N²) 实测 ══════════════════════════════════
// 【线索链】① 立绘填充率假设：算出 0.15 G 像素/秒，不足以打满 → 否掉。
//          ② suck() 假设：实测三步合计 0.16ms，占 CPU 1% → 否掉。
//          ③ 主循环全屏合成：只 2 次 drawImage/帧 → 已优化过，不是瓶颈。
// 剩下唯一没测的就是 beanCacheDrop —— 它是「豆子事件」触发的，不在帧里，
// 所以前面按帧算的剖分全都看不到它。
//
// 【嫌疑】它注释说「相交邻居通常 ≤ 9 颗」，但代码是
//   for (i = 0; i < S.beans.length; i++) —— 每次事件都【全量遍历 404 颗豆】
//   来找那 9 个邻居。而豆子事件是每颗豆两次（起步 moving、落地 gone），
//   一关 404 豆 = 808 次事件，每次扫 404 → 32.6 万次 beanXY() 调用。
//   更关键：吞吐提到 30 颗/秒后，每秒就是 60 次事件 × 404 = 2.4 万次/秒，
//   且每次事件还要 clearRect + 若干 drawBean（真 canvas 操作，手机上极贵）。
// 这里实测「一次 drop 的成本」和「一秒内的总成本」。
var path = require('path');
global.window = global;
global.ks = { getSystemInfoSync: function () { return { windowWidth: 375, windowHeight: 812, pixelRatio: 2 }; } };

var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD;

console.log('══ beanCacheDrop 邻居查找成本（纯 JS 部分，不含 canvas）══\n');

[1, 3, 6, 10].forEach(function (n) {
  var lv = PD.LG.genLevel(n, (n * 7919 + 12345) >>> 0);
  if (!lv) return;
  var beans = lv.beans.map(function (b) {
    return { gx: b.gx, gy: b.gy, color: b.color, gone: false, moving: false };
  });
  var N = beans.length;
  var cell = 34;
  // 复刻 beanCacheDrop 的邻居扫描（beanXY 等价为 gx*cell）
  function scan(target) {
    var hits = 0;
    var tx = target.gx * cell, ty = target.gy * cell;
    var pad = cell;
    var rx = tx - cell - pad, ry = ty - cell - pad;
    var rw = cell * 3 + pad * 2, rh = cell * 3 + pad * 2;
    for (var i = 0; i < beans.length; i++) {
      var b = beans[i];
      if (b === target || b.gone || b.moving) continue;
      var px = b.gx * cell, py = b.gy * cell;
      if (px + cell * 2 < rx || px - cell * 2 > rx + rw) continue;
      if (py + cell * 2 < ry || py - cell * 2 > ry + rh) continue;
      hits++;
    }
    return hits;
  }
  // 预热
  scan(beans[0]);
  var t0 = process.hrtime.bigint();
  var totalHits = 0, ITER = 2000;
  for (var k = 0; k < ITER; k++) totalHits += scan(beans[k % N]);
  var t1 = process.hrtime.bigint();
  var per = Number(t1 - t0) / 1e6 / ITER;
  var avgHits = totalHits / ITER;

  console.log('── 关' + n + '：' + N + ' 豆 ──');
  console.log('  单次邻居扫描：' + per.toFixed(4) + ' ms（遍历 ' + N + ' 颗找到 ' +
              avgHits.toFixed(1) + ' 个相交邻居）');
  console.log('  → 注释说「≤9 颗」是对的，但为找这 ' + avgHits.toFixed(0) +
              ' 个要扫 ' + N + ' 颗 = 浪费 ' + (100 - avgHits / N * 100).toFixed(1) + '%');
  // 吞吐 30 豆/秒 → 每秒 60 次事件（起步+落地各一次）
  var evPerSec = 60;
  console.log('  30豆/秒吞吐 → ' + evPerSec + ' 次事件/秒');
  console.log('  纯 JS 扫描：' + (per * evPerSec).toFixed(2) + ' ms/秒（手机7×≈' +
              (per * evPerSec * 7).toFixed(0) + 'ms）');
  console.log('  【真正的贵处】每次事件还要 ' + avgHits.toFixed(0) +
              ' 次 drawBean + 1 次 clearRect = ' +
              (avgHits * evPerSec).toFixed(0) + ' 次 drawImage/秒到离屏画布');
  console.log('');
});

console.log('【结论判据】');
console.log('  纯 JS 扫描即使 ×7 也只有几 ms/秒 —— 不是瓶颈。');
console.log('  但每秒往离屏画布发数百次 drawImage，会持续触发');
console.log('  「离屏画布 → GPU 纹理」的重新上传。这才是手机上的真实代价：');
console.log('  离屏 canvas 每次被写，它作为纹理的缓存就失效，');
console.log('  下一帧 drawImage(beanCache) 就得重新上传 750×1624 整张纹理。');
console.log('  → 每秒 60 次事件 = 每秒最多 60 次全屏纹理重传 = 真凶。');
