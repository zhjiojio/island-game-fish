// 探针：实际颜色依赖链深度（不看 mode 字符串，直接量测豆阵结构）
// 【口径】模拟"逐层剥离"：反复找出当前所有可取豆，记录它们的颜色集合，
//   移除后再找下一批。「需要几批才能见到全部颜色」= 真实的依赖链深度。
// 这比 mode 名可靠 —— mode 只是契约意图，实际会被 min(shellK, C-1, maxDepth-1) 夹。
var path = require('path');
global.window = global;
var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));
var PD = window.M3.PD;
function pad(s, w) { s = '' + s; while (s.length < w) s += ' '; return s; }
function padL(s, w) { s = '' + s; while (s.length < w) s = ' ' + s; return s; }

// 返回：开局可取的颜色数 / 见到全部颜色需要剥几轮
function measureDepth(lv) {
  var beans = lv.beans.map(function (b) {
    return { color: b.color, gx: b.gx, gy: b.gy, layer: b.layer, gone: false };
  });
  var bd = PD.buildBounds(beans);
  var allCol = {}, i;
  for (i = 0; i < beans.length; i++) allCol[beans[i].color] = 1;
  var totalCol = 0; for (var c in allCol) totalCol++;
  var seen = {}, seenN = 0, round = 0, firstBatch = 0;
  while (seenN < totalCol && round < 40) {
    var top = PD.buildTopIndex(beans), occ = PD.buildOccupancy(beans);
    var batch = [], bc = {};
    for (i = 0; i < beans.length; i++) {
      var b = beans[i];
      if (b.gone) continue;
      if (PD.isPickable(b, top) && PD.pathOut(b, occ, bd, null)) { batch.push(b); bc[b.color] = 1; }
    }
    if (!batch.length) break;
    var n2 = 0; for (var k2 in bc) n2++;
    if (round === 0) firstBatch = n2;
    for (var kk in bc) if (!seen[kk]) { seen[kk] = 1; seenN++; }
    for (i = 0; i < batch.length; i++) batch[i].gone = true;
    round++;
  }
  return { totalCol: totalCol, firstBatch: firstBatch, rounds: round };
}

console.log('【读法】开局可取色 = 第一批就能动的颜色数（越少越难，1 = 只有一条路）');
console.log('        见全色轮数 = 要剥几轮才见到所有颜色（越多 = 依赖链越深）\n');
console.log(pad('关', 4) + padL('契约sh', 7) + padL('契约C', 6) + padL('实际色数', 9) +
  padL('开局可取色', 11) + padL('见全色轮数', 11) + '  判定');
for (var n = 1; n <= 10; n++) {
  var D = PD.LG.difficulty(n);
  var fb = [], rd = [], tc = [];
  for (var k = 0; k < 8; k++) {
    var lv = PD.LG.genLevel(n, (n * 7919 + k * 104729) >>> 0);
    if (!lv) continue;
    var m = measureDepth(lv);
    fb.push(m.firstBatch); rd.push(m.rounds); tc.push(m.totalCol);
  }
  function avg(a) { return a.length ? (a.reduce(function (x, y) { return x + y; }, 0) / a.length) : 0; }
  var aF = avg(fb), aR = avg(rd), aT = avg(tc);
  var judge;
  if (aF >= aT - 0.3) judge = '开局全色可取 → 壳层【未生效】';
  else if (aF <= 1.3) judge = '开局只1色可取 → 极深依赖';
  else judge = '开局' + aF.toFixed(1) + '/' + aT.toFixed(1) + '色可取 → 有梯度';
  console.log(pad(n, 4) + padL(D.shellK, 7) + padL(D.C, 6) + padL(aT.toFixed(1), 9) +
    padL(aF.toFixed(1), 11) + padL(aR.toFixed(1), 11) + '  ' + judge);
}
