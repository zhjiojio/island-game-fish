const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JS = path.resolve(__dirname, '../../package/js');
function env(balance = '5') {
  const calls = [], wallet = { balance, ready: true, syncing: false };
  const iapState = { catalog: [{ skuId: 'd10', diamonds: 10, priceText: '¥1', platforms: ['android'] }], exchangeCatalog: [{ exchangeSkuId: 'x10', costBalance: '10', grantBeans: 10000 }], pending: [], flow: 'READY', exchangePending: false };
  const M3 = { Layout: { w: 812, h: 375, safeTop: 0 }, Auth: { getIdentity: () => ({ accountId: 'a', loginType: 'kwai' }) }, Game: { flash: m => calls.push(['flash', m]) }, Input: { cancelCurrentGesture: () => calls.push(['cancel']) }, DiamondWallet: { getState: () => wallet, compare: (a, b) => BigInt(a) === BigInt(b) ? 0 : BigInt(a) > BigInt(b) ? 1 : -1, format: String }, Iap: { getState: () => iapState, loadCatalog: () => calls.push(['catalog']), loadExchangeCatalog: () => calls.push(['exchangeCatalog']), syncWallet: () => calls.push(['wallet']), recover: () => calls.push(['recover']), buy: id => { calls.push(['buy', id]); return true; }, exchange: id => { calls.push(['exchange', id]); iapState.exchangePending = true; return true; } } };
  const sandbox = { window: { M3 }, console };
  for (const file of ['scene-diamond-store.js', 'scene-diamond-exchange.js']) vm.runInNewContext(fs.readFileSync(path.join(JS, file), 'utf8'), sandbox);
  return { M3, calls, wallet, iapState };
}
test('首页平台钻石入口打开统一商城且游客不能打开支付商城', () => {
  const src = fs.readFileSync(path.join(JS, 'scene-home.js'), 'utf8');
  assert.match(src, /diamondWallet\.ready \? M3\.DiamondWallet\.format\(diamondWallet\.balance\) : '--'/);
  assert.match(src, /if \(M3\.SceneShop && M3\.SceneShop\.show\) M3\.SceneShop\.show\(1\)/);
  assert.doesNotMatch(src, /diamond_store_home_entry|sandboxGuest|IAP_SANDBOX_REQUESTED/);
  const e = env();
  e.M3.Auth.getIdentity = () => ({ accountId: 'guest', loginType: 'guest' });
  assert.strictEqual(e.M3.SceneDiamondStore.show(), false);
  assert.match(e.calls.find(x => x[0] === 'flash')[1], /快手小游戏/);
});

test('商城打开会刷新目录、余额和恢复订单', () => {
  const e = env(); assert.strictEqual(e.M3.SceneDiamondStore.show(), true); assert.strictEqual(e.M3.SceneDiamondStore.isVisible(), true);
  assert.deepStrictEqual(e.calls.map(x => x[0]), ['cancel', 'catalog', 'wallet', 'recover']);
});
test('平台余额仅展示，兑换由服务端权威判断', () => {
  const e = env('9'); e.M3.SceneDiamondExchange.show(); assert.strictEqual(e.M3.SceneDiamondExchange.select('x10'), true);
  assert.strictEqual(e.M3.SceneDiamondExchange.confirm(), true); assert.strictEqual(e.calls.some(x => x[0] === 'exchange'), true);
});
test('确认兑换只发送一次串行请求', () => {
  const e = env('10'); e.M3.SceneDiamondExchange.show(); assert.strictEqual(e.M3.SceneDiamondExchange.select('x10'), true);
  assert.strictEqual(e.M3.SceneDiamondExchange.confirm(), true); assert.deepStrictEqual(e.calls.filter(x => x[0] === 'exchange'), [['exchange', 'x10']]);
  assert.strictEqual(e.M3.SceneDiamondExchange.select('x10'), false);
});
test('商城遮罩前缀存在且关闭不停止后台 IAP 状态', () => {
  const e = env(); e.M3.SceneDiamondStore.show(); e.iapState.flow = 'CONFIRMING_RESULT'; e.iapState.pending.push({ orderId: 'o' });
  e.M3.SceneDiamondStore.hide(); assert.strictEqual(e.M3.SceneDiamondStore.isVisible(), false); assert.strictEqual(e.iapState.flow, 'CONFIRMING_RESULT'); assert.strictEqual(e.iapState.pending.length, 1);
  const src = fs.readFileSync(path.join(JS, 'scene-diamond-store.js'), 'utf8'); assert.match(src, /diamond_store_mask/);
});
