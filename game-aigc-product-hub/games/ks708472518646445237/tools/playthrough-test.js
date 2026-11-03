// tools/playthrough-test.js — 全流程模拟：驱动真实引擎走完每条分支，捕获运行时异常
// 用法：node tools/playthrough-test.js
const fs = require('fs');
const path = require('path');
const PKG = path.resolve(__dirname, '../package');

// ── Canvas / 平台桩 ──
const noop = () => {};
// 交互结果在真机保留 1.4/1.8 秒反馈；自动通路测试只同步结算这两类短反馈。
const testTimeout = (fn, ms) => {
  if (ms === 700 || ms === 900 || ms === 1000 || ms === 1400 || ms === 1800 || ms === 2500 || ms === 3800 || ms === 4300 || ms === 4500) fn();
  return 1;
};
const ctxStub = new Proxy({}, {
  get: (_, k) => {
    if (k === 'measureText') return (s) => ({ width: String(s || '').length * 7 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    return noop;
  },
  set: () => true
});
const canvas = { width: 1179, height: 2556, style: {}, getContext: () => ctxStub, addEventListener: noop };

global.window = {
  canvas, innerWidth: 393, innerHeight: 852, devicePixelRatio: 3,
  addEventListener: noop, document: { getElementById: () => canvas }
};
global.window.window = global.window;
global.requestAnimationFrame = noop;
global.performance = { now: () => Date.now() };
global.Image = function () { this.onload = null; this.onerror = null; };

// 平台能力桩：广告直接成功，模拟用户看完
global.window.KwaiAd = { showRewarded: (ok) => ok && ok() };
global.window.KwaiShare = { share: noop };
global.window.KwaiLogin = { init: (o) => o && o.onSuccess && o.onSuccess('mock') };

// 收集运行时异常
const errors = [];
const origErr = console.error;
console.error = (...a) => { errors.push(a.join(' ')); };
console.log = noop;   // 静音业务日志

function load(f) {
  const code = fs.readFileSync(path.join(PKG, f), 'utf8');
  new Function('window', 'requestAnimationFrame', 'performance', 'console', 'setTimeout',
               'clearTimeout', 'setInterval', 'clearInterval', 'Image', 'ks', 'wx', code)
    (global.window, noop, global.performance, console, testTimeout, clearTimeout,
     setInterval, clearInterval, global.Image, undefined, undefined);
}

['js/m3-init.js', 'js/tb-config.js', 'js/tb-loader.js', 'js/tb-story.js', 'js/tb-model.js',
 'js/tb-ui.js', 'js/tb-audio.js', 'js/tb-engine.js', 'js/tb-render.js'].forEach(load);

const M3 = global.window.M3;
M3.Layout.w = 393; M3.Layout.h = 852; M3.Layout.safeTop = 47; M3.Layout.usableH = 805;
M3.UI.bind(ctxStub); M3.Engine.bind(ctxStub); M3.Render.bind(ctxStub);
M3.Model.init(M3.Story);

const E = M3.Engine, Model = M3.Model, Story = M3.Story;
const restoreLog = origErr;

let fail = 0;
function ok(c, m) { if (c) restoreLog('  ✅ ' + m); else { restoreLog('  ❌ ' + m); fail++; } }

// 渲染一帧并返回可点击动作列表
function renderFrame() {
  M3.Render.draw();
  return M3.UI.hitZones().map(z => z.action);
}

// 模拟一条通路：每到分支就选第 pick 个选项
function run(label, pickIdx) {
  Model.reset();
  E.restart();
  const visited = [];
  let steps = 0;

  renderFrame();
  E.handle('splash_start');       // 进入直播间

  while (steps++ < 200) {
    const nd = E.node();
    if (!nd) break;
    if (visited[visited.length - 1] !== nd.id) visited.push(nd.id);

    // 每帧给足星光，保证高价选项可点（单独测星光不足场景）
    Model.addStars(3000);
    const actions = renderFrame();
    if (E.state.phase === 'ending') break;

    // 优先走剧情推进类动作
    const branch = actions.filter(a => /^(branch|support|pick|room|ad_watch):?/.test(a) || a === 'ad_watch');
    if (branch.length) {
      const chosen = branch[Math.min(pickIdx, branch.length - 1)];
      E.handle(chosen);
      continue;
    }
    if (actions.indexOf('pick_done') >= 0) { E.handle('pick_done'); continue; }
    if (actions.indexOf('game_continue') >= 0) { E.handle('game_continue'); continue; }
    // 多选题：先点满
    const multi = actions.filter(a => a.indexOf('multi:') === 0);
    if (multi.length) { multi.slice(0, nd.ui.pick).forEach(a => E.handle(a)); continue; }
    if (actions.indexOf('next') >= 0) { E.handle('next'); continue; }
    // 无交互节点：手动推进
    if (nd.next) E.handle('next');
    else break;
  }

  const done = E.state.phase === 'ending' || visited.indexOf('shot-30') >= 0;
  ok(done, `${label}：走通至结局（经过 ${visited.length} 个节点，${steps} 步）`);
  return visited;
}

restoreLog('\n[1] 全流程通路模拟');
const p0 = run('分支全取第 1 项', 0);
const p1 = run('分支全取第 2 项', 1);
const p2 = run('分支全取最后项', 9);

restoreLog('\n[2] 关键节点覆盖');
const all = new Set([...p0, ...p1, ...p2]);
['shot-01','shot-11','shot-13','shot-15','shot-16','shot-19','shot-22','shot-23','shot-29','shot-30']
  .forEach(id => ok(all.has(id), `覆盖 ${id}（${Story.shots[id].title}）`));

restoreLog('\n[3] 结局正确性');
Model.reset(); E.restart(); renderFrame(); E.handle('splash_start');
Model.chooseSupport('zhuchang');
Model.addStars(999999);
Model.sendGift('zhuchang', 'tiaimo-night', 20, 'test');
ok(Model.ranking()[0].id === 'zhuchang', 'all in 后该候选人夺冠');
ok(!!Story.endings[Model.ranking()[0].id], '冠军有对应结局台词');

restoreLog('\n[4] 星光不足场景（不得崩溃 / 不得负数）');
Model.reset(); E.restart(); renderFrame(); E.handle('splash_start');
for (let i = 0; i < 40; i++) E.handle('gift:tiaimo-night');   // 疯狂点最贵礼物
ok(Model.getStars() >= 0, `星光不为负（当前 ${Model.getStars()}）`);
ok(E.state.phase === 'live', '星光不足时游戏未崩溃');

restoreLog('\n[5] 结局页与重开');
E.state.phase = 'ending';
const endActions = renderFrame();
ok(endActions.indexOf('share') >= 0, '结局页有分享按钮');
ok(endActions.indexOf('restart') >= 0, '结局页有再来一局按钮');
E.handle('restart');
ok(E.state.phase === 'splash', '重开回到启动页');
ok(Model.getStars() === M3.Config.STAR_INIT, '重开后星光重置');

restoreLog('\n[6] 运行时异常');
ok(errors.length === 0, `无 console.error${errors.length ? '：' + errors.slice(0, 3).join(' | ') : ''}`);

restoreLog(fail === 0 ? '\n🎉 全流程模拟通过\n' : `\n💥 ${fail} 项失败\n`);
process.exit(fail ? 1 : 0);
