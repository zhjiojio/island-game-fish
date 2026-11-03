// 昵称落库与后台检索。需要本地 MySQL，缺失时整组 skip（与既有 MySQL 测试一致）。
const test = require('node:test');
const assert = require('node:assert');

process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
process.env.ADMIN_ALLOW_REMOTE = '1';

const { setupMysqlTest, teardownMysqlTest } = require('./helpers/mysql-test');

let ready = false;
let db = null;
let accountStore = null;
let createAdminHttpHandler = null;

const ALPHA = 'ks_nick_alpha';
const BETA = 'ks_nick_beta';

test.before(async () => {
  try {
    await setupMysqlTest();
    db = require('../persistence/db').getDb();
    accountStore = require('../persistence/account-store');
    createAdminHttpHandler = require('../admin/admin-http').createAdminHttpHandler;
    ready = true;
  } catch (e) {
    console.log('[SKIP] MySQL 测试环境不可用:', e.message);
    return;
  }
  const now = Date.now();
  for (const id of [ALPHA, BETA]) {
    await db.run(
      `INSERT INTO accounts (account_id, account_type, login_type, kwai_open_id_hash, device_id,
        first_ip, last_ip, login_count, banned, ban_reason, created_at, last_login_at)
       VALUES (?, 'user', 'kwai', '', ?, '', '', 1, 0, '', ?, ?)`,
      [id, 'dev_' + id, now, now]
    );
    await db.run(
      `INSERT INTO wallets (account_id, beans, frozen_beans, total_earned, total_spent, total_won,
        total_lost, daily_login_date, share_reward_date, created_at, updated_at, version)
       VALUES (?, 20000, 0, 0, 0, 0, 0, '', '', ?, ?, 1)`,
      [id, now, now]
    );
  }
});

test.after(async () => {
  if (ready) await teardownMysqlTest();
});

function listUsers (query) {
  const handler = createAdminHttpHandler({});
  return handler.handle({
    method: 'GET',
    path: '/admin/api/users',
    query: new URLSearchParams(query),
    headers: { 'x-admin-token': process.env.ADMIN_TOKEN },
    rawBody: '',
    clientIp: '127.0.0.1',
  });
}

test('昵称清洗：剔除控制字符、截断 32 字、空值返回空串', () => {
  if (!ready) return;
  assert.strictEqual(accountStore.sanitizeNickname('  铁蛋\n\t'), '铁蛋');
  assert.strictEqual(accountStore.sanitizeNickname('a'.repeat(50)).length, 32);
  assert.strictEqual(accountStore.sanitizeNickname('   '), '');
  assert.strictEqual(accountStore.sanitizeNickname(null), '');
  assert.strictEqual(accountStore.sanitizeNickname(123), '');
});

test('昵称写入：同值重复上报是 no-op，不同值会覆盖', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  assert.strictEqual(await accountStore.updateNickname(ALPHA, '牌神小明'), true, '首次写入应生效');
  assert.strictEqual(await accountStore.updateNickname(ALPHA, '牌神小明'), false, '同值应跳过 UPDATE');

  const row = await db.get('SELECT nickname FROM accounts WHERE account_id = ?', [ALPHA]);
  assert.strictEqual(row.nickname, '牌神小明');

  assert.strictEqual(await accountStore.updateNickname(ALPHA, '改名了'), true);
  const again = await db.get('SELECT nickname FROM accounts WHERE account_id = ?', [ALPHA]);
  assert.strictEqual(again.nickname, '改名了');
});

test('保留账号（bot::/system::）不写昵称', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  assert.strictEqual(await accountStore.updateNickname('bot::abc', '机器人'), false);
});

test('后台可按昵称检索，且账号 ID 检索不受影响', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await accountStore.updateNickname(ALPHA, '牌神小明');
  await accountStore.updateNickname(BETA, '斗地主之王');

  const byNickname = await listUsers({ q: '牌神' });
  assert.strictEqual(byNickname.status, 200);
  assert.strictEqual(byNickname.data.items.length, 1);
  assert.strictEqual(byNickname.data.items[0].accountId, ALPHA);
  assert.strictEqual(byNickname.data.items[0].nickname, '牌神小明');

  const byAccountId = await listUsers({ q: 'beta' });
  assert.strictEqual(byAccountId.status, 200);
  assert.ok(byAccountId.data.items.some(item => item.accountId === BETA));

  const noMatch = await listUsers({ q: 'zzz_不存在的关键词' });
  assert.strictEqual(noMatch.data.items.length, 0);
});

test('用户详情返回昵称', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await accountStore.updateNickname(ALPHA, '牌神小明');
  const handler = createAdminHttpHandler({});
  const detail = await handler.handle({
    method: 'GET',
    path: `/admin/api/users/${ALPHA}`,
    query: new URLSearchParams(),
    headers: { 'x-admin-token': process.env.ADMIN_TOKEN },
    rawBody: '',
    clientIp: '127.0.0.1',
  });
  assert.strictEqual(detail.status, 200);
  assert.strictEqual(detail.data.account.nickname, '牌神小明');
});

function syncProfile (handler, nickname, token) {
  return handler.handle({
    method: 'POST', path: '/api/v1/game/profile', headers: {
      authorization: token ? `Bearer ${token}` : '', 'content-type': 'application/json',
    }, rawBody: JSON.stringify({ nickname, accountId: BETA }),
  });
}

test('大厅 HTTP 同步昵称绑定认证账号，重复同步成功且不修改钱包', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const auth = require('../auth');
  const handler = require('../game-http').createGameHttpHandler({});
  const token = auth.issueSessionToken({ accountId: ALPHA, loginType: 'kwai' });
  const before = await db.get('SELECT beans FROM wallets WHERE account_id = ?', [ALPHA]);
  const beta = await accountStore.getAccount(BETA);
  for (let i = 0; i < 2; i++) {
    const result = await syncProfile(handler, '大厅玩家', token);
    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.data.nickname, '大厅玩家');
  }
  assert.strictEqual((await accountStore.getAccount(ALPHA)).nickname, '大厅玩家');
  assert.strictEqual((await accountStore.getAccount(BETA)).nickname, beta.nickname);
  assert.deepStrictEqual(await db.get('SELECT beans FROM wallets WHERE account_id = ?', [ALPHA]), before);
  assert.strictEqual((await syncProfile(handler, '未登录', '')).status, 401);
  assert.strictEqual((await syncProfile(handler, '', token)).status, 400);
});

test('客户端昵称同步覆盖大厅、授权后改名及失败重试', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../../package/js/core/game.js'), 'utf8');
  const fragment = source.slice(source.indexOf('  function cacheUser ()'), source.indexOf('  // token 尚未就绪时的重试次数上限'));
  let identity = { accountId: ALPHA };
  let fail = false;
  const calls = [];
  const timers = [];
  const context = vm.createContext({
    _user: { nickname: '大厅玩家' }, USER_CACHE_KEY: 'user',
    normalizeUser: user => user, writeStorageJson: () => {},
    setTimeout: fn => timers.push(fn),
    M3: { Auth: { getIdentity: () => identity }, GameHttp: {
      updateProfile: nickname => {
        calls.push(nickname);
        return fail ? Promise.reject(new Error('offline')) : Promise.resolve({ nickname });
      },
    } },
  });
  vm.runInContext(fragment, context);
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  vm.runInContext('syncNickname(); syncNickname();', context);
  await flush();
  assert.deepStrictEqual(calls, ['大厅玩家']);
  vm.runInContext('cacheUser();', context);
  await flush();
  assert.strictEqual(calls.length, 1);
  context._user.nickname = '授权昵称';
  vm.runInContext('cacheUser();', context);
  await flush();
  assert.strictEqual(calls.at(-1), '授权昵称');
  identity = { accountId: BETA };
  fail = true;
  vm.runInContext('syncNickname();', context);
  await flush();
  assert.strictEqual(timers.length, 1);
  fail = false;
  timers.shift()();
  await flush();
  assert.strictEqual(calls.length, 4);
  vm.runInContext('syncNickname();', context);
  await flush();
  assert.strictEqual(calls.length, 4);
  assert.ok(source.includes('_applyBootstrapResponse(data);\n      syncNickname();'));
});

test('nickname 列缺失时后台降级而非报错', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  // 线上是 DBA 补列，补列之前代码必须仍可用：写入静默失败、列表退回账号/设备检索。
  await db.run('ALTER TABLE accounts DROP COLUMN nickname');
  try {
    assert.strictEqual(await accountStore.updateNickname(ALPHA, '丢弃'), false, '缺列时写入应静默失败');
    const auth = require('../auth');
    const profileHandler = require('../game-http').createGameHttpHandler({});
    const token = auth.issueSessionToken({ accountId: ALPHA, loginType: 'kwai' });
    assert.strictEqual((await syncProfile(profileHandler, '待重试', token)).status, 503);

    const list = await listUsers({ q: 'nick_' });
    assert.strictEqual(list.status, 200, '缺列不应导致列表 500');
    assert.ok(list.data.items.length >= 2, '仍能按账号 ID 检索到行');
    assert.ok(list.data.items.every(item => item.nickname === ''), '缺列时昵称字段为空串');

    const unfiltered = await listUsers({});
    assert.strictEqual(unfiltered.status, 200);
  } finally {
    await db.run("ALTER TABLE accounts ADD COLUMN nickname VARCHAR(64) NOT NULL DEFAULT ''");
  }
});
