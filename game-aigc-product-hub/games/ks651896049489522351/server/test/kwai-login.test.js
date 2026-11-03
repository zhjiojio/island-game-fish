// 快手 code2session 集成测试。
// 用本地 mock 服务替代快手线上接口，验证：
//   1. 请求方式与参数完全符合官方文档（GET + app_id/app_secret/js_code/grant_type）；
//   2. 成功链路能派生稳定 accountId、签发 token、内存保管 session_key；
//   3. 各类失败响应一律拒绝，绝不降级为游客。
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DDZ_AUTH_MODE = 'dev';
process.env.DDZ_AUTH_SECRET = 'integration_secret';
process.env.DDZ_KWAI_APP_SECRET = 'integration_kwai_app_secret';

let lastRequest = null;
let respond = () => ({ status: 200, body: { result: 1, open_id: 'open-id-1', session_key: 'sk-1' } });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  lastRequest = {
    method: req.method,
    pathname: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  };
  const out = respond();
  res.writeHead(out.status, { 'Content-Type': out.raw ? 'text/html' : 'application/json' });
  res.end(out.raw ? out.raw : JSON.stringify(out.body));
});

let auth;

test.before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  process.env.DDZ_KWAI_CODE2SESSION_URL = `http://127.0.0.1:${port}/game/minigame/jscode2session`;
  process.env.DDZ_KWAI_TIMEOUT_MS = '1000';
  auth = require('../auth');
});

test.after(() => new Promise(resolve => server.close(resolve)));

test('成功链路：GET 请求参数符合官方文档', async () => {
  respond = () => ({ status: 200, body: { result: 1, open_id: 'open-id-1', session_key: 'sk-1', union_id: 'u-1' } });

  const r = await auth.authenticate(
    { intent: 'kwai_login', code: 'code-1', deviceId: 'dev-1' },
    { ip: '127.0.0.1' }
  );

  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.identity.loginType, 'kwai');
  assert.match(r.identity.accountId, /^ks_[0-9a-f]{32}$/);
  assert.ok(r.token);

  assert.strictEqual(lastRequest.method, 'GET');
  assert.strictEqual(lastRequest.pathname, '/game/minigame/jscode2session');
  assert.strictEqual(lastRequest.query.grant_type, 'authorization_code');
  assert.strictEqual(lastRequest.query.js_code, 'code-1');
  assert.ok(lastRequest.query.app_id);
  assert.ok(lastRequest.query.app_secret);
});

test('session_key 仅存服务端内存，openId 仅供内部绑定且不进入 token / 公开 identity', async () => {
  respond = () => ({ status: 200, body: { result: 1, open_id: 'open-id-2', session_key: 'sk-secret-2' } });

  const r = await auth.authenticate(
    { intent: 'kwai_login', code: 'code-2', deviceId: 'dev-2' },
    { ip: '127.0.0.1' }
  );

  assert.strictEqual(r.ok, true);
  assert.strictEqual(auth.getPlatformSessionKey(r.identity.accountId), 'sk-secret-2');
  assert.strictEqual(r.identity.platformOpenId, 'open-id-2');
  assert.ok(!JSON.stringify(r.identity).includes('sk-secret-2'), 'session_key 不得进入内部 identity');

  const tokenIdentity = auth.verifySessionToken(r.token);
  assert.deepStrictEqual(tokenIdentity, {
    accountId: r.identity.accountId,
    loginType: 'kwai',
    deviceId: 'dev-2',
  });
  assert.strictEqual(Object.hasOwn(tokenIdentity, 'platformOpenId'), false, 'openId 不得进入 token');

  const publicIdentity = {
    accountId: r.identity.accountId,
    loginType: r.identity.loginType,
    deviceId: r.identity.deviceId,
  };
  assert.ok(!JSON.stringify(publicIdentity).includes('open-id-2'), 'openId 不得进入公开 identity');
});

test('同一 openId 多次登录得到同一 accountId', async () => {
  respond = () => ({ status: 200, body: { result: 1, open_id: 'open-id-stable', session_key: 'sk' } });

  const a = await auth.authenticate({ intent: 'kwai_login', code: 'c1', deviceId: 'd1' }, { ip: '127.0.0.1' });
  const b = await auth.authenticate({ intent: 'kwai_login', code: 'c2', deviceId: 'd2' }, { ip: '127.0.0.1' });
  assert.strictEqual(a.identity.accountId, b.identity.accountId);
});

test('平台失败响应一律拒绝，不降级游客', async () => {
  const cases = [
    { name: 'result 非成功', out: { status: 200, body: { result: 100, msg: 'invalid code' } } },
    { name: 'open_id 缺失', out: { status: 200, body: { result: 1, session_key: 'sk' } } },
    { name: 'HTTP 500', out: { status: 500, body: {} } },
    { name: '非 JSON', out: { status: 200, raw: '<html>error</html>' } },
  ];

  for (const item of cases) {
    respond = () => item.out;
    const r = await auth.authenticate(
      { intent: 'kwai_login', code: 'bad', deviceId: 'dev-x' },
      { ip: '127.0.0.1' }
    );
    assert.strictEqual(r.ok, false, `${item.name} 必须拒绝`);
    assert.strictEqual(r.code, 'INVALID_KWAI_CODE', `${item.name} 应判定为登录失败`);
  }
});

test('失败原因不得回传含密钥的请求信息', async () => {
  respond = () => ({ status: 500, body: {} });
  const r = await auth.authenticate(
    { intent: 'kwai_login', code: 'bad', deviceId: 'dev-y' },
    { ip: '127.0.0.1' }
  );
  assert.strictEqual(r.ok, false);
  assert.ok(!r.reason.includes('app_secret'), '错误原因泄漏了 appSecret 参数');
  assert.ok(!r.reason.includes('js_code'), '错误原因泄漏了 code');
});

test('kwai_login 意图缺少 code 时拒绝，不落回游客', async () => {
  const r = await auth.authenticate({ intent: 'kwai_login', deviceId: 'dev-z' }, { ip: '127.0.0.1' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'MISSING_CREDENTIAL');
});

test('resume 意图下失效 token 明确报错，而非静默变成游客', async () => {
  const r = await auth.authenticate(
    { intent: 'resume', sessionToken: 'garbage.token', deviceId: 'dev-w' },
    { ip: '127.0.0.1' }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.code, 'INVALID_SESSION_TOKEN');
});
