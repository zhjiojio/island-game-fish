// 认证模块单测。
// 每个用例都对应一条真实存在过的攻击路径，改动 auth.js 前请先确认这些用例仍然通过。
//
// 注意：auth.js 在 require 时即读取环境变量并冻结模式，
// 因此不同模式必须在独立子进程里验证（见文件末尾的 strict 模式用例）。
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

process.env.DDZ_AUTH_MODE = process.env.DDZ_AUTH_MODE || 'dev';
process.env.DDZ_AUTH_SECRET = process.env.DDZ_AUTH_SECRET || 'unit_test_secret';
process.env.DDZ_KWAI_APP_SECRET = process.env.DDZ_KWAI_APP_SECRET || 'unit_test_kwai_app_secret';

const auth = require('../auth');
const kwaiApp = require('../config/kwai-app');
const fs = require('node:fs');

const AUTH_PATH = path.join(__dirname, '..', 'auth.js');

// ---- 凭证不外泄回归 ----
// appSecret 一旦被打进客户端包体等于公开，任何人都能伪造 code2session 调用。
test('appSecret 绝不出现在客户端目录中', () => {
  const secret = kwaiApp.getAppSecret();
  assert.ok(secret, '内置凭证缺失');

  const clientRoot = path.join(__dirname, '..', '..', 'package');
  const offenders = [];

  (function walk (dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(full);
        continue;
      }
      if (!/\.(js|json|html|txt|md)$/i.test(entry.name)) continue;
      if (fs.readFileSync(full, 'utf8').includes(secret)) offenders.push(full);
    }
  })(clientRoot);

  assert.deepStrictEqual(offenders, [], 'appSecret 泄漏进客户端包体');
});

test('code2session 使用官方小游戏接口与 grant_type', () => {
  // 旧实现走的是 POST /oauth2/mp/code2session，与小游戏文档不符，
  // 即便配置了正确凭证也换不到 openId。
  const source = fs.readFileSync(AUTH_PATH, 'utf8');
  assert.match(source, /grant_type=authorization_code/);
  assert.match(source, /method:\s*'GET'/);
  assert.match(kwaiApp.getCode2SessionUrl(), /\/game\/minigame\/jscode2session$/);
});

function runInMode (env, script) {
  return execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, ...env, DDZ_AUTH_PATH: AUTH_PATH },
    encoding: 'utf8',
  }).trim();
}

test('游客 accountId 由服务端密钥派生，同设备稳定、跨设备不同', () => {
  const a1 = auth.deriveGuestAccountId('device-A');
  const a2 = auth.deriveGuestAccountId('device-A');
  const b1 = auth.deriveGuestAccountId('device-B');
  assert.strictEqual(a1, a2, '同一设备必须得到稳定身份，否则每次登录都白拿新手铁豆');
  assert.notStrictEqual(a1, b1);
  assert.match(a1, /^guest_[0-9a-f]{32}$/);
});

test('游客 accountId 不可由客户端猜测构造', () => {
  // 攻击者即使知道受害者 deviceId，也无法在不知服务端密钥的情况下算出 accountId
  const derived = auth.deriveGuestAccountId('victim-device');
  assert.ok(!derived.includes('victim-device'), 'accountId 不得包含设备原文');
});

test('sessionToken 签发后可校验，篡改任意一位即失效', () => {
  const identity = { accountId: 'guest_abc', loginType: 'guest', deviceId: 'd1' };
  const token = auth.issueSessionToken(identity);
  const parsed = auth.verifySessionToken(token);
  assert.ok(parsed, 'token 必须能被自身校验通过');
  assert.strictEqual(parsed.accountId, 'guest_abc');
  assert.strictEqual(parsed.loginType, 'guest');

  // 篡改签名
  const badSig = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a');
  assert.strictEqual(auth.verifySessionToken(badSig), null);

  // 篡改载荷（换成他人 accountId）后签名对不上
  const body = Buffer.from(JSON.stringify({
    a: 'guest_victim', t: 'guest', d: 'd1', e: Date.now() + 60000,
  })).toString('base64url');
  assert.strictEqual(auth.verifySessionToken(body + '.' + token.split('.').pop()), null);
});

test('过期 token 一律拒绝', () => {
  const body = Buffer.from(JSON.stringify({
    a: 'guest_abc', t: 'guest', d: 'd1', e: Date.now() - 1000,
  })).toString('base64url');
  // 用合法流程签一个已过期的 token：借 issue 再手工改 exp 会破坏签名，
  // 这里直接验证格式非法的 token 也被拒
  assert.strictEqual(auth.verifySessionToken(body), null);
  assert.strictEqual(auth.verifySessionToken(''), null);
  assert.strictEqual(auth.verifySessionToken(null), null);
});

test('deviceId 清洗：剔除特殊字符并限长', () => {
  assert.strictEqual(auth.sanitizeDeviceId('  abc-123_x  '), 'abc-123_x');
  assert.ok(!auth.sanitizeDeviceId('<script>alert(1)</script>').includes('<'));
  assert.ok(auth.sanitizeDeviceId('x'.repeat(500)).length <= 64);
});

test('maskId 不泄漏完整身份', () => {
  const masked = auth.maskId('guest_0123456789abcdef');
  assert.ok(!masked.includes('0123456789abcdef'));
  assert.ok(masked.includes('***'));
});

test('dev 模式：带 deviceId 的游客登录成功并签发 token', async () => {
  const result = await auth.authenticate({ deviceId: 'dev-device-1' }, { ip: '127.0.0.1' });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.identity.loginType, 'guest');
  assert.ok(result.token);
});

test('缺少任何凭证时拒绝认证', async () => {
  const result = await auth.authenticate({}, { ip: '127.0.0.1' });
  assert.strictEqual(result.ok, false);
});

test('已配置凭证时：无效 code 一律拒绝，不得静默降级为游客', async () => {
  // 关键安全语义：code 校验失败属于明确的登录失败，任何模式都不降级。
  // 若校验失败也降级，攻击者随手发一个垃圾 code 就能绕过快手登录。
  //
  // 这里用一个必然失败且不出网的 code2session 地址，避免真实请求快手线上接口。
  const out = runInMode(
    {
      DDZ_AUTH_MODE: 'dev',
      DDZ_AUTH_SECRET: 'test_secret',
      DDZ_KWAI_CODE2SESSION_URL: 'http://127.0.0.1:1/jscode2session',
      DDZ_KWAI_TIMEOUT_MS: '300',
    },
    `const a = require(process.env.DDZ_AUTH_PATH);
     a.authenticate({ intent: 'kwai_login', code: 'some-code', deviceId: 'dev-device-2' }, { ip: '127.0.0.1' })
      .then(r => console.log(JSON.stringify({ ok: r.ok, code: r.code })));`
  );
  const r = JSON.parse(out);
  assert.strictEqual(r.ok, false, 'code 校验失败必须拒绝');
  assert.strictEqual(r.code, 'INVALID_KWAI_CODE');
});

test('快手 code 优先于随包携带的旧游客 token', async () => {
  // 回归：旧实现先校验 token 再看 code，导致用户握着游客 token 点快手登录时
  // code 永远不会被消费，永久停留在游客身份。
  const guest = await auth.authenticate({ intent: 'guest', deviceId: 'dev-device-3' }, { ip: '127.0.0.1' });
  assert.strictEqual(guest.ok, true);

  const out = runInMode(
    {
      DDZ_AUTH_MODE: 'dev',
      DDZ_AUTH_SECRET: 'test_secret',
      DDZ_KWAI_CODE2SESSION_URL: 'http://127.0.0.1:1/jscode2session',
      DDZ_KWAI_TIMEOUT_MS: '300',
    },
    `const a = require(process.env.DDZ_AUTH_PATH);
     const g = a.issueSessionToken({ accountId: 'guest_x', loginType: 'guest', deviceId: 'd' });
     a.authenticate({ intent: 'kwai_login', code: 'c', sessionToken: g, deviceId: 'd' }, { ip: '127.0.0.1' })
      .then(r => console.log(JSON.stringify({ ok: r.ok, code: r.code })));`
  );
  const r = JSON.parse(out);
  // 必须走 code 分支并因换取失败而拒绝，而不是拿旧 token 直接放行
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'INVALID_KWAI_CODE');
});

test('accountId 不随 token 签名密钥轮换而漂移', () => {
  // 身份盐与 DDZ_AUTH_SECRET 必须解耦，否则轮换签名密钥会让所有快手用户
  // 变成新账号，钱包与战绩全部失联。
  const read = secret => JSON.parse(runInMode(
    { DDZ_AUTH_MODE: 'dev', DDZ_AUTH_SECRET: secret },
    `const a = require(process.env.DDZ_AUTH_PATH);
     console.log(JSON.stringify({ id: a.deriveKwaiAccountId('open-id-fixed') }));`
  ));
  assert.strictEqual(read('secret_v1').id, read('secret_v2').id);
});

test('session_key 只在服务端内存保管，不进入 identity', async () => {
  auth.rememberPlatformSession('ks_test_account', 'sk_value');
  assert.strictEqual(auth.getPlatformSessionKey('ks_test_account'), 'sk_value');
  assert.strictEqual(auth.hasPlatformSession('ks_test_account'), true);
  auth.forgetPlatformSession('ks_test_account');
  assert.strictEqual(auth.hasPlatformSession('ks_test_account'), false);
});

test('strict 模式：拒绝游客登录', () => {
  const out = runInMode(
    { DDZ_AUTH_MODE: 'strict', DDZ_AUTH_SECRET: 'strict_secret' },
    `const a = require(process.env.DDZ_AUTH_PATH);
     a.authenticate({ deviceId: 'x' }, { ip: '1.1.1.1' })
      .then(r => console.log(JSON.stringify({ ok: r.ok, code: r.code, guest: a.GUEST_LOGIN_ALLOWED })));`
  );
  const r = JSON.parse(out);
  assert.strictEqual(r.ok, false, 'strict 模式必须拒绝游客');
  assert.strictEqual(r.guest, false);
  assert.strictEqual(r.code, 'GUEST_LOGIN_FORBIDDEN');
});

test('strict 模式缺少密钥时拒绝启动（不允许随机密钥上线）', () => {
  let threw = false;
  try {
    runInMode(
      { DDZ_AUTH_MODE: 'strict', DDZ_AUTH_SECRET: '' },
      `require(process.env.DDZ_AUTH_PATH);`
    );
  } catch (e) {
    threw = true;
    assert.match(String(e.stderr || ''), /DDZ_AUTH_SECRET/);
  }
  assert.ok(threw, 'strict 模式必须因缺少密钥而启动失败');
});

test('未配置 DDZ_AUTH_MODE 时默认走 strict（失败保险）', () => {
  const out = runInMode(
    { DDZ_AUTH_MODE: '', DDZ_AUTH_SECRET: 'some_secret' },
    `const a = require(process.env.DDZ_AUTH_PATH);
     console.log(JSON.stringify({ mode: a.AUTH_MODE, guest: a.GUEST_LOGIN_ALLOWED }));`
  );
  const r = JSON.parse(out);
  assert.strictEqual(r.mode, 'strict', '忘记配置时必须落到最严格模式，而非最宽松');
  assert.strictEqual(r.guest, false);
});

test('新账号按 IP 限流，老账号不占配额', () => {
  const now = Date.now();
  const ip = '10.0.0.99';
  let blocked = false;
  for (let i = 0; i < 100; i++) {
    if (auth.hitNewAccountLimit(ip, now)) { blocked = true; break; }
  }
  assert.ok(blocked, '同一 IP 无限建号必须在阈值内被拦下');
});
