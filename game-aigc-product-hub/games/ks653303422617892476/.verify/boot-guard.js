// main.js 守卫验证：玩法层缺失时应绘制占位画面且不抛异常
const fs = require('fs');
const PKG = '/Users/zoe/work/minigame/game-aigc-product-hub/games/ks653303422617892476/package';

const calls = [];
const ctx = new Proxy({}, {
  get(t, p) {
    if (p === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (p === 'measureText') return () => ({ width: 40 });
    if (typeof p === 'string') return (...a) => { calls.push([p, ...a]); };
    return undefined;
  },
  set() { return true; },
});

const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };

let rafCount = 0, rafFn = null;
const canvas = { style: {}, width: 0, height: 0, getContext: () => ctx, addEventListener() {} };
global.window = {
  canvas, devicePixelRatio: 2, innerWidth: 414, innerHeight: 896,
  addEventListener() {},
  requestAnimationFrame(fn) { rafCount++; rafFn = fn; },
};
global.canvas = canvas;
global.requestAnimationFrame = global.window.requestAnimationFrame;

function load(f) {
  const code = fs.readFileSync(`${PKG}/${f}`, 'utf8');
  new Function('window', 'canvas', 'localStorage', 'console', 'Math', 'ks', 'requestAnimationFrame', code)(
    global.window, canvas, global.localStorage, console, Math, undefined, global.requestAnimationFrame
  );
}

let pass = 0, fail = 0;
const check = (n, c, d) => c ? (pass++, console.log(`  PASS ${n}`)) : (fail++, console.log(`  FAIL ${n} -> ${d}`));

// 按 index.html 顺序加载（不含已删除的玩法层）
let loadErr = null;
try {
  ['js/m3-init.js', 'js/kwai-event-bus.js', 'js/kwai-ad-config.js',
   'api/kwai-login.js', 'api/kwai-ad.js', 'api/kwai-share.js',
   'js/layout.js', 'js/compliance.js', 'js/main.js'].forEach(load);
} catch (e) { loadErr = e.message + '\n' + e.stack.split('\n')[1]; }

console.log('\n[启动] 玩法层缺失下的启动健壮性');
check('全部脚本加载无异常（无 ReferenceError）', loadErr === null, loadErr);
check('主循环已注册 requestAnimationFrame', rafCount > 0, `rafCount=${rafCount}`);

console.log('\n[主循环] 手动推进 3 帧');
let frameErr = null;
try { for (let i = 0; i < 3; i++) rafFn && rafFn(); } catch (e) { frameErr = e.message; }
check('连续 3 帧无异常抛出', frameErr === null, frameErr);

console.log('\n[占位画面] 确认实际有绘制而非白屏');
const fills = calls.filter(c => c[0] === 'fillRect');
const texts = calls.filter(c => c[0] === 'fillText');
check('有 fillRect 背景绘制', fills.length > 0, `fillRect=${fills.length}`);
check('有 fillText 文案绘制', texts.length > 0, `fillText=${texts.length}`);
const hint = texts.find(t => String(t[1]).includes('重建中'));
check('占位文案包含「重建中」', !!hint, texts.map(t => t[1]).join(' | ') || '无文案');
if (hint) console.log(`       实际文案: "${hint[1]}"`);

console.log('\n[平台层] 复用资产完好');
const M3 = global.window.M3;
check('M3.Layout 可用', !!(M3 && M3.Layout && M3.Layout.init), 'missing');
check('M3.Compliance 四项接口完好',
  !!M3.Compliance && ['openPrivacyPolicy','requestRealNameAuth','getAntiAddictionInfo','openCustomerServicePage']
    .every(k => typeof M3.Compliance[k] === 'function'), 'missing');
check('M3.Board / M3.Game / M3.Render 已确实移除',
  !M3.Board && !M3.Game && !M3.Render,
  `Board=${!!M3.Board} Game=${!!M3.Game} Render=${!!M3.Render}`);

console.log(`\n==== 结果：${pass} 通过 / ${fail} 失败 ====`);
process.exit(fail === 0 ? 0 : 1);
