// tools/logic-test.js — 无头逻辑自测：剧本连通性 + 数据模型 + 资源引用有效性
// 用法：node tools/logic-test.js
const fs = require('fs');
const path = require('path');
const PKG = path.resolve(__dirname, '../package');

// ── 最小 Canvas / 平台桩，让业务代码可在 Node 下加载 ──
const noop = () => {};
const stubCtx = new Proxy({}, {
  get: (_, k) => {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    return noop;
  },
  set: () => true
});
global.window = {
  canvas: { width: 393, height: 852, style: {}, getContext: () => stubCtx, addEventListener: noop },
  innerWidth: 393, innerHeight: 852, devicePixelRatio: 3,
  addEventListener: noop
};
global.window.window = global.window;
global.requestAnimationFrame = noop;
global.performance = { now: () => Date.now() };

function load(f) {
  const code = fs.readFileSync(path.join(PKG, f), 'utf8');
  new Function('window', 'requestAnimationFrame', 'performance', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'Math', 'JSON', 'Object', code)
    (global.window, noop, global.performance, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, Object);
}

['js/m3-init.js', 'js/tb-config.js', 'js/tb-story.js', 'js/tb-model.js'].forEach(load);

const M3 = global.window.M3;
const Story = M3.Story, Model = M3.Model;

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('  ✅', msg);
  else { console.log('  ❌', msg); fail++; }
}

// ── 1. 剧本连通性：所有 next / options.next 必须存在 ──
console.log('\n[1] 剧本连通性');
const S = Story.shots;
const ids = Object.keys(S);
ok(ids.length >= 30, `shot 节点数 = ${ids.length}（主线 30 镜 + 分支子节点）`);
ok(!!S[Story.entry], `入口 ${Story.entry} 存在`);

let dangling = [];
ids.forEach(id => {
  const n = S[id];
  const targets = [];
  if (n.next) targets.push(n.next);
  if (n.ui && n.ui.options) n.ui.options.forEach(o => { if (o.next) targets.push(o.next); });
  targets.forEach(t => { if (!S[t]) dangling.push(`${id} → ${t}`); });
});
ok(dangling.length === 0, `无悬空跳转${dangling.length ? '：' + dangling.join(', ') : ''}`);

// 每个非 ending 节点必须有出路
let deadEnds = ids.filter(id => {
  const n = S[id];
  if (n.type === 'ending') return false;
  const hasBranch = n.ui && n.ui.options && n.ui.options.some(o => o.next);
  return !n.next && !hasBranch;
});
ok(deadEnds.length === 0, `无死胡同${deadEnds.length ? '：' + deadEnds.join(', ') : ''}`);

// 从入口可达全部节点
const seen = new Set(); const q = [Story.entry];
while (q.length) {
  const id = q.pop(); if (seen.has(id) || !S[id]) continue;
  seen.add(id);
  const n = S[id];
  if (n.next) q.push(n.next);
  if (n.ui && n.ui.options) n.ui.options.forEach(o => o.next && q.push(o.next));
}
const unreach = ids.filter(i => !seen.has(i));
ok(unreach.length === 0, `全部节点可达${unreach.length ? '，不可达：' + unreach.join(', ') : ''}`);

// ── 2. 数据模型 ──
console.log('\n[2] 数据模型');
Model.init(Story);
ok(Model.getStars() === M3.Config.STAR_INIT, `初始星光 = ${Model.getStars()}`);
ok(M3.Config.STAR_INIT === 100, `初始星光 = 100（新策略）`);
ok(M3.Config.STAR_RATE === 0, `自然增长关闭（STAR_RATE = 0）`);
Model.addStars(999999);
ok(Model.getStars() > 1000, '广告/奖励星光可以突破 1000');
Model.reset();
Model.addPassiveStars(999999);
ok(Model.getStars() === M3.Config.STAR_INIT, `自然增长已关闭：调用 addPassiveStars 后仍等于初始值`);
Model.reset();
ok(Model.ranking().length === 4, '排名含 4 位候选人');

Model.chooseSupport('pijiu');
ok(Model.getSupport() === 'pijiu', '可选定支持者');

const before = Model.getStars();
const e = Model.sendGift('pijiu', 'cheers', 10, 'test');
ok(e !== null, '星光充足时可送礼');
ok(Model.getStars() === before - 30, `送干杯×10 扣 30 星光（${before} → ${Model.getStars()}）`);

const poor = Model.sendGift('pijiu', 'tiaimo-night', 1, 'test');
ok(poor === null, '星光不足时拒绝送礼（不产生负数）');
ok(Model.getStars() >= 0, '星光永不为负');

Model.addStars(100000);
Model.sendGift('pijiu', 'tiaimo-night', 1, 'test');
ok(Model.ranking()[0].id === 'pijiu', '大额礼物后该候选人升至第一');

// 结算稳定性：同一 shot 多次结算结果一致
const a1 = Model.settle('rank-first', 'shot-13');
Model.recordVote('lingwu', 999999, 'crowd', 'x');
const a2 = Model.settle('rank-first', 'shot-13');
ok(a1 === a2, '同一 shot 的结算结果幂等（画面与数据一致）');
ok(Model.settle('rank-first', 'shot-25') === 'lingwu', '不同 shot 重新结算反映最新排名');

// 倍率
Model.setMultiplier(2);
const led = Model.recordVote('zhuchang', 1000, 'crowd', 'x');
ok(led.amount === 2000, '倍率生效（1000 → 2000）');
Model.setMultiplier(1);

// 广告次数上限
let cnt = 0;
while (Model.canWatchAd()) { Model.markAdView(); cnt++; if (cnt > 50) break; }
ok(cnt === M3.Config.AD_MAX_VIEW, `激励视频上限 = ${cnt} 次`);

// ── 3. 资源引用（收集全部 CDN 路径）──
console.log('\n[3] 资源引用');
const assets = new Set();
function collect(o) {
  if (!o || typeof o !== 'object') return;
  Object.keys(o).forEach(k => {
    const v = o[k];
    if (typeof v === 'string' && /^assets\/.+\.(mp4|png|jpg|mp3|wav)$/.test(v)) assets.add(v);
    else if (typeof v === 'object') collect(v);
  });
}
collect(S); collect(Story.candidates); collect(Story.gifts); collect(Story.outfits);
const list = [...assets].sort();
console.log(`  ℹ️  引用素材 ${list.length} 个`);
ok(list.length > 0, '存在素材引用');
ok(list.every(f => M3.Config.url(f).startsWith('https://')), '全部素材解析为 CDN 绝对地址');
ok(!M3.Config.url('assets/video/x.mp4').includes('/assets/'), 'CDN 路径已剥离 assets/ 前缀');

fs.writeFileSync(path.join(__dirname, 'asset-refs.txt'), list.join('\n'));
console.log(`  ℹ️  已写出引用清单 → tools/asset-refs.txt`);

// ── 4. 禁止 DOM/CSS（上次上线失败的根因）──
console.log('\n[4] Canvas 合规检查');
const banned = [
  [/document\.createElement/, 'document.createElement'],
  [/innerHTML/,               'innerHTML'],
  [/appendChild/,             'appendChild'],
  [/querySelector/,           'querySelector'],
  [/\.style\.[a-zA-Z]/,       'element.style.*'],
  [/className/,               'className'],
  [/<div|<span|<button/,      'HTML 标签'],
];
const gameFiles = fs.readdirSync(path.join(PKG, 'js')).filter(f => /^tb-.*\.js$/.test(f));
let violations = [];
gameFiles.forEach(f => {
  let src = fs.readFileSync(path.join(PKG, 'js', f), 'utf8');
  // 剥离注释后再检查，避免说明文字里的关键词造成误报
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  banned.forEach(([re, name]) => {
    if (re.test(src)) violations.push(`${f}: ${name}`);
  });
});
ok(violations.length === 0, `业务代码无 DOM/CSS 用法${violations.length ? '：' + violations.join(', ') : ''}`);

console.log(fail === 0 ? '\n🎉 全部通过\n' : `\n💥 ${fail} 项失败\n`);
process.exit(fail ? 1 : 0);
