const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PACKAGE_DIR = path.resolve(__dirname, '../../package');

function loadSceneVoice () {
  const sent = [];
  const flashes = [];
  const confirms = [];
  let accountId = 'kwai_a';
  let loginType = 'kwai';
  const hitBtns = [];
  const timers = new Map();
  let timerSeq = 0;
  function fakeSetTimeout (fn) { timerSeq += 1; timers.set(timerSeq, fn); return timerSeq; }
  function fakeClearTimeout (id) { timers.delete(id); }
  function runTimers () {
    const callbacks = Array.from(timers.values());
    timers.clear();
    callbacks.forEach(fn => fn());
  }
  const gradient = { addColorStop () {} };
  const ctx = new Proxy({
    measureText: text => ({ width: String(text).length * 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  }, { get: (target, key) => target[key] || function () {}, set: (target, key, value) => { target[key] = value; return true; } });
  const window = {
    devicePixelRatio: 1,
    confirm: label => { confirms.push(label); return true; },
    M3: {
      Layout: { w: 800, h: 600 },
      Auth: { getIdentity: () => ({ accountId, loginType }), isGuest: () => loginType === 'guest' },
      Game: { flash: msg => flashes.push(msg), getWallet: () => ({ beans: 1000, availableBeans: 1000 }), getScreen: () => 'home' },
      Network: { send: (type, data) => sent.push({ type, data }) },
      Render: new Proxy(
        { getCtx: () => ctx, getHitBtns: () => hitBtns, glMeasureText: text => String(text).length * 10 },
        { get: (target, key) => target[key] || function () {} }
      ),
      SceneGame: { getVoicePackImage: () => null },
      Assets: { loaded: () => false },
    },
  };
  function Image () { this.complete = false; this.naturalWidth = 0; this.src = ''; }
  const sandbox = { window, Image, console, Date, Math, setTimeout: fakeSetTimeout, clearTimeout: fakeClearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(PACKAGE_DIR, 'js/scene-voice.js'), 'utf8'), sandbox, { filename: 'scene-voice.js' });
  return { scene: window.M3.SceneVoice, sent, flashes, confirms, hitBtns, runTimers, setIdentity: (id, type) => { accountId = id; loginType = type || 'kwai'; } };
}

function drawAndClickPack (env) {
  env.scene.show(1);
  env.scene.draw();
  const button = env.hitBtns.find(item => /^voice_pack_/.test(item.label));
  assert.ok(button, '应绘制专属语音包按钮');
  button.onClick();
}

test('语音入口默认关闭，收到配置后开放，认证重置后再次关闭', () => {
  const env = loadSceneVoice();
  env.scene.show(1);
  env.scene.draw();
  assert.strictEqual(env.hitBtns.length, 0, '未收到 voiceConfig 时不得打开语音面板');

  env.scene.setConfig({ schemaVersion: 2, interactive: [], packs: [] });
  assert.strictEqual(env.scene.isAvailable(), true);
  env.scene.show(1);
  env.scene.draw();
  assert.ok(env.hitBtns.some(item => item.label === 'voice_mask'));

  env.hitBtns.length = 0;
  env.scene.resetForAccount('kwai_a', true);
  assert.strictEqual(env.scene.isAvailable(), false);
  env.scene.show(1);
  env.scene.draw();
  assert.strictEqual(env.hitBtns.length, 0, '重连后不得复用上个连接的旧语音配置');
});

test('客户端权益未知时禁购，单调 seq 生效后允许购买', () => {
  const env = loadSceneVoice();
  env.scene.setConfig({ schemaVersion: 2, interactive: [], packs: [{ packId: 'monkey', sku: 'voice_pack:monkey', name: '猴子', icon: '', priceBeans: 100, saleEnabled: true, defaultVoiceId: 'v1', voices: [{ voiceId: 'v1', text: '测试', voiceUrl: 'x' }] }] });
  drawAndClickPack(env);
  // v3 契约：权益未知时点击只主动补拉权益（不发起购买）
  assert.strictEqual(env.sent.length, 1);
  assert.strictEqual(env.sent[0].type, 'getEntitlements');
  assert.match(env.flashes.pop(), /权益加载中/);
  env.hitBtns.length = 0;
  env.scene.applyEntitlements({ seq: 2, items: [] });
  env.scene.applyEntitlements({ seq: 1, items: [{ sku: 'voice_pack:monkey' }] });
  drawAndClickPack(env);
  assert.strictEqual(env.sent[1].type, 'buySku', '旧 seq 不得把空权益倒灌成已拥有');
});

test('账号切换清空旧权益和 pending，游客（含 Web 端）允许购买', () => {
  const env = loadSceneVoice();
  env.scene.setConfig({ schemaVersion: 2, interactive: [], packs: [{ packId: 'monkey', sku: 'voice_pack:monkey', name: '猴子', priceBeans: 100, saleEnabled: true, defaultVoiceId: 'v1', voices: [{ voiceId: 'v1', text: '测试', voiceUrl: 'x' }] }] });
  env.scene.applyEntitlements({ seq: 1, items: [{ sku: 'voice_pack:monkey' }] });
  env.setIdentity('guest_b', 'guest');
  env.scene.resetForAccount('guest_b');
  env.scene.applyEntitlements({ seq: 1, items: [] });
  // 新契约：游客不拦截购买，钱包挂在游客账号下由服务端权威扣豆
  drawAndClickPack(env);
  assert.strictEqual(env.sent[0].type, 'buySku', '游客应能直接发起购买');
});

test('匹配 requestId 的购买成功后才能结束 pending 并发送已拥有语音', () => {
  const env = loadSceneVoice();
  env.scene.setConfig({ schemaVersion: 2, interactive: [], packs: [{ packId: 'monkey', sku: 'voice_pack:monkey', name: '猴子', priceBeans: 100, saleEnabled: true, defaultVoiceId: 'v1', voices: [{ voiceId: 'v1', text: '测试', voiceUrl: 'x' }] }] });
  env.scene.applyEntitlements({ seq: 1, items: [] });
  drawAndClickPack(env);
  const buy = env.sent[0];
  env.scene.applyPurchaseResult({ requestId: 'wrong', sku: 'voice_pack:monkey', ok: true });
  env.hitBtns.length = 0;
  drawAndClickPack(env);
  assert.strictEqual(env.sent.length, 1, '错误 requestId 不得结束 pending');
  env.scene.applyPurchaseResult({ requestId: buy.data.requestId, sku: buy.data.sku, ok: true, charged: true });
  env.hitBtns.length = 0;
  drawAndClickPack(env);
  // v3 契约：购买成功终帧结束 pending 后，点击已拥有包 = 切换语音包（不再广播 voiceMsg）
  assert.strictEqual(env.sent.length, 1, '已拥有包点击不得再次发起购买');
  assert.match(env.flashes.pop(), /语音包已切换/);
});

test('权益快照失败不吞购买成功终帧，且不会伪造完整快照已就绪', () => {
  const env = loadSceneVoice();
  env.scene.setConfig({ schemaVersion: 2, interactive: [], packs: [
    { packId: 'monkey', sku: 'voice_pack:monkey', name: '猴子', priceBeans: 100, saleEnabled: true, defaultVoiceId: 'v1', voices: [{ voiceId: 'v1', text: '测试', voiceUrl: 'x' }] },
    { packId: 'master', sku: 'voice_pack:master', name: '圣手', priceBeans: 100, saleEnabled: true, defaultVoiceId: 'v2', voices: [{ voiceId: 'v2', text: '测试2', voiceUrl: 'y' }] },
  ] });
  env.scene.applyEntitlements({ seq: 1, items: [] });
  drawAndClickPack(env);
  const buy = env.sent[0];
  env.scene.markEntitlementsUnavailable({ seq: 2, retryAfterMs: 3000 });
  env.scene.applyPurchaseResult({ requestId: buy.data.requestId, sku: buy.data.sku, ok: true, charged: true });

  env.hitBtns.length = 0;
  drawAndClickPack(env);
  // v3 契约：成功终帧必须结束 pending（点击已购 SKU 只切换、不重复购买）
  assert.strictEqual(env.sent.length, 1, '成功终帧必须结束 pending 并允许使用已购 SKU');
  assert.match(env.flashes.pop(), /语音包已切换/);

  env.hitBtns.length = 0;
  env.scene.show(1);
  env.scene.draw();
  const secondPack = env.hitBtns.filter(item => /^voice_pack_/.test(item.label))[1];
  assert.ok(secondPack);
  secondPack.onClick();
  assert.strictEqual(env.sent.length, 2, '快照不可用时不得继续购买其他 SKU');
  assert.match(env.flashes.pop(), /权益加载中/);
});

test('付费商品促销标签不改变确认金额语义', () => {
  const env = loadSceneVoice();
  env.scene.setConfig({ schemaVersion: 2, interactive: [], packs: [{
    packId: 'promo', sku: 'voice_pack:promo', name: '促销包', priceBeans: 100,
    promoLabel: '限时折扣', saleEnabled: true, defaultVoiceId: 'v1',
    voices: [{ voiceId: 'v1', text: '测试', voiceUrl: 'x' }],
  }] });
  env.scene.applyEntitlements({ seq: 1, items: [] });
  drawAndClickPack(env);
  assert.match(env.confirms[0], /100 铁豆/);
  assert.doesNotMatch(env.confirms[0], /免费领取/);
});

test('权益失败帧推进 seq，晚到的旧成功快照不得倒灌', () => {
  const env = loadSceneVoice();
  env.scene.setConfig({ schemaVersion: 2, interactive: [], packs: [{
    packId: 'monkey', sku: 'voice_pack:monkey', name: '猴子', priceBeans: 100,
    saleEnabled: true, defaultVoiceId: 'v1', voices: [{ voiceId: 'v1', text: '测试', voiceUrl: 'x' }],
  }] });
  env.scene.markEntitlementsUnavailable({ seq: 2, retryAfterMs: 3000 });
  env.scene.applyEntitlements({ seq: 1, items: [{ sku: 'voice_pack:monkey' }] });
  drawAndClickPack(env);
  // v3 契约：快照不可用时点击只补拉权益，不发起购买
  assert.strictEqual(env.sent.length, 1);
  assert.strictEqual(env.sent[0].type, 'getEntitlements');
  assert.match(env.flashes.pop(), /权益加载中/);
});

test('购买终帧超时释放 pending，并用新请求同步权益', () => {
  const env = loadSceneVoice();
  env.scene.setConfig({ schemaVersion: 2, interactive: [], packs: [{
    packId: 'monkey', sku: 'voice_pack:monkey', name: '猴子', priceBeans: 100,
    saleEnabled: true, defaultVoiceId: 'v1', voices: [{ voiceId: 'v1', text: '测试', voiceUrl: 'x' }],
  }] });
  env.scene.applyEntitlements({ seq: 1, items: [] });
  drawAndClickPack(env);
  const firstRequestId = env.sent[0].data.requestId;
  env.runTimers();
  assert.strictEqual(env.sent[1].type, 'getEntitlements');
  assert.match(env.flashes.pop(), /同步超时/);

  env.hitBtns.length = 0;
  drawAndClickPack(env);
  assert.strictEqual(env.sent[2].type, 'buySku');
  assert.notStrictEqual(env.sent[2].data.requestId, firstRequestId);
});

test('权益不可用按服务端建议重试且账号切换取消旧重试', () => {
  const env = loadSceneVoice();
  env.scene.markEntitlementsUnavailable({ seq: 1, retryAfterMs: 1000 });
  env.runTimers();
  // runTimers 同时触发模块加载兜底（getVoiceConfig）与服务端建议重试（getEntitlements）
  assert.strictEqual(env.sent[0].type, 'getVoiceConfig', '模块加载兜底先于权益重试触发');
  assert.strictEqual(env.sent[1].type, 'getEntitlements', '应按服务端建议重试拉取权益');

  env.scene.markEntitlementsUnavailable({ seq: 2, retryAfterMs: 1000 });
  env.setIdentity('kwai_b', 'kwai');
  env.scene.resetForAccount('kwai_b', true);
  env.runTimers();
  assert.strictEqual(env.sent.length, 2, '切换账号后旧权益重试不得发出');
});

function fakeAudio () {
  const events = {};
  return {
    src: '', volume: 1, currentTime: 0, loop: false,
    play () { return Promise.resolve(); }, pause () {}, load () {},
    addEventListener (name, fn) { events[name] = fn; },
    removeEventListener (name, fn) { if (events[name] === fn) delete events[name]; },
    emit (name, value) { if (events[name]) events[name](value); },
  };
}

function loadMedia () {
  const audios = [];
  function Audio () { const audio = fakeAudio(); audios.push(audio); return audio; }
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(PACKAGE_DIR, 'api/kwai-media.js'), 'utf8'), { window, Audio, console, setTimeout, setInterval, clearInterval }, { filename: 'kwai-media.js' });
  return { media: window.KwaiMedia, audios };
}

test('连续语音打断只由最新播放恢复一次原始 BGM 基线', async () => {
  const env = loadMedia();
  env.media.Audio.playBgm('bgm');
  const bgm = env.audios[0];
  bgm.volume = 0.6;
  env.media.Audio.playVoice('voice-1');
  const stale = env.audios[1];
  env.media.Audio.playVoice('voice-2');
  // 新契约：每次播放销毁旧实例重建（快小 InnerAudio 换 src 不生效），最新语音是新实例
  const voice = env.audios[env.audios.length - 1];
  assert.notStrictEqual(voice, stale, '语音播放必须销毁旧实例重建，不得复用换 src');
  stale.emit('ended');   // 已销毁实例的事件不得触发恢复
  voice.emit('ended');   // 只有最新实例结束才恢复基线
  await new Promise(resolve => setTimeout(resolve, 650));
  assert.ok(Math.abs(bgm.volume - 0.6) < 0.001, `BGM 应恢复到 0.6，实际 ${bgm.volume}`);
});
