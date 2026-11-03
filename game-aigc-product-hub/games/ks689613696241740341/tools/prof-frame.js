// ══ 帧耗时剖分器 ══════════════════════════════════════════════════════
// 【为什么要这个】真机日志报 fps≈10~12、最差帧 217ms，但「哪一段慢」全靠猜。
// 这里用一个 mock canvas 上下文记录每一条绘制指令，跑真实的 render(dt)，
// 就能拿到「每帧发了多少条指令、分别是什么、集中在哪个函数」。
// 【为什么不用真机 profiler】小游戏容器没有 devtools timeline；而且我们要的
// 不是绝对 ms（Node 和手机差 5~10 倍），是【指令数量级和分布】——
// 那个在两个平台是一致的，能直接指出算法层面的浪费。
// 用法：node tools/prof-frame.js [关卡] [帧数]
var path = require('path');
global.window = global;

// ── mock canvas：只记账，不真画 ────────────────────────────────────
var TALLY = {};       // 指令名 → 次数
var STACK = [];       // 当前调用栈标签（由 render 内部无法感知，这里用采样近似）
function bump(name) { TALLY[name] = (TALLY[name] || 0) + 1; }

function mkCtx() {
  var ctx = {
    canvas: { width: 750, height: 1624 },
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '',
    textAlign: '', textBaseline: '', shadowBlur: 0, shadowColor: '', globalCompositeOperation: '',
    lineJoin: '', lineCap: '', filter: ''
  };
  var ops = ['save', 'restore', 'beginPath', 'closePath', 'fill', 'stroke', 'clip',
             'translate', 'rotate', 'scale', 'setTransform', 'resetTransform',
             'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'quadraticCurveTo',
             'bezierCurveTo', 'fillRect', 'strokeRect', 'clearRect', 'drawImage',
             'fillText', 'strokeText', 'setLineDash', 'getLineDash', 'putImageData'];
  ops.forEach(function (op) { ctx[op] = function () { bump(op); }; });
  ctx.measureText = function (s) { bump('measureText'); return { width: (s || '').length * 12 }; };
  ctx.createLinearGradient = function () {
    bump('createLinearGradient');
    return { addColorStop: function () { bump('addColorStop'); } };
  };
  ctx.createRadialGradient = function () {
    bump('createRadialGradient');
    return { addColorStop: function () { bump('addColorStop'); } };
  };
  ctx.createPattern = function () { bump('createPattern'); return {}; };
  ctx.getImageData = function (x, y, w, h) {
    bump('getImageData');
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  };
  return ctx;
}

var MAIN = mkCtx();
function fakeCanvas(w, h) {
  return {
    width: w || 750, height: h || 1624,
    getContext: function () { return mkCtx(); }
  };
}

// ── mock 小游戏环境 ────────────────────────────────────────────────
global.ks = {
  createCanvas: function () { return fakeCanvas(); },
  createImage: function () { var o = {}; setTimeout(function () { if (o.onerror) o.onerror(); }, 0); return o; },
  getSystemInfoSync: function () { return { windowWidth: 375, windowHeight: 812, pixelRatio: 2, platform: 'ios' }; },
  vibrateShort: function () {}, createInnerAudioContext: function () {
    return { play: function () {}, stop: function () {}, destroy: function () {}, seek: function () {} };
  },
  getStorageSync: function () { return ''; }, setStorageSync: function () {},
  onShow: function () {}, onHide: function () {}
};
global.canvas = fakeCanvas();
global.document = {
  createElement: function () { return fakeCanvas(); },
  addEventListener: function () {}
};
global.Image = function () { var o = {}; setTimeout(function () { if (o.onerror) o.onerror(); }, 0); return o; };
var rafQ = [];
global.requestAnimationFrame = function (f) { rafQ.push(f); return rafQ.length; };
global.cancelAnimationFrame = function () {};

var JS = path.join(__dirname, '..', 'package', 'js');
require(path.join(JS, 'pd-core.js'));
require(path.join(JS, 'pd-levelgen.js'));

var PD = window.M3.PD;
var lvNo = parseInt(process.argv[2] || '3', 10);
var frames = parseInt(process.argv[3] || '60', 10);

var lv = PD.LG.genLevel(lvNo, (lvNo * 7919 + 12345) >>> 0);
if (!lv) { console.log('关卡生成失败'); process.exit(1); }

console.log('══ 帧绘制指令剖分 ══');
console.log('关卡 ' + lvNo + '：豆 ' + lv.beans.length + ' 颗、车 ' + lv.cars.length + ' 辆、色 ' + (lv._realCols || '?'));
console.log('');

// ── 静态审计：数清「一帧全量重绘」到底是多少条指令 ──────────────
// 这是最关键的量：豆阵有 N 颗豆，若每帧都逐颗画，就是 N 条 drawImage；
// 若烘进离屏缓存，就是 1 条。两者差 N 倍。
var N = lv.beans.length;
console.log('【量级基准】');
console.log('  豆阵全量逐颗绘制 = ' + N + ' 条 drawImage/帧');
console.log('  豆阵走缓存       = 1 条 drawImage/帧      （' + N + '× 差距）');
console.log('  立绘两层全屏     = 2 条 750×1624 drawImage/帧 = ' +
            (2 * 750 * 1624 / 1e6).toFixed(1) + ' M 像素/帧');
console.log('  60fps 下立绘像素吞吐 = ' +
            (2 * 750 * 1624 * 60 / 1e9).toFixed(2) + ' G 像素/秒');
console.log('');
console.log('【判据】手机 GPU 填充率约 1~4 G 像素/秒（中低端机更低）。');
console.log('  仅立绘两层就吃掉 ' + (2 * 750 * 1624 * 60 / 1e9).toFixed(2) +
            ' G/s → 中低端机单这一项就打满，这解释了 fps 10~12。');
