// /admin 门禁测试：IP 白名单、远程开关、密码校验、防爆破锁定。
// 这些用例直接打 handler，不启服务、不连库（拒绝路径都在触达 SQL 之前返回）。
const test = require('node:test');
const assert = require('node:assert');

const { createAdminHttpHandler } = require('../admin/admin-http');

const LOCAL = '127.0.0.1';
const REMOTE = '203.0.113.9';
const VALID_TOKEN = 'correct-horse-battery-staple';

function makeRequest (over = {}) {
  return {
    method: 'GET',
    path: '/admin',
    query: new URLSearchParams(),
    headers: {},
    rawBody: '',
    clientIp: LOCAL,
    ...over,
  };
}

// 每个用例独立实例：模块内的 loginFails 是模块级共享状态，
// 同一 IP 之间会互相污染，所以每个 test 都换一个 handler + 唯一 IP。
function newHandler () {
  return createAdminHttpHandler({});
}

async function withEnv (env, fn) {
  const saved = {};
  for (const key of Object.keys(env)) {
    saved[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

async function apiCall (handler, { ip, token, path = '/admin/api/users', method = 'GET' }) {
  return handler.handle(makeRequest({
    method,
    path,
    clientIp: ip,
    headers: token === undefined ? {} : { 'x-admin-token': token },
  }));
}

test('未开 ADMIN_ALLOW_REMOTE 时公网来源拿不到页面也调不动接口', async () => {
  await withEnv({ ADMIN_ALLOW_REMOTE: undefined, ADMIN_TOKEN: VALID_TOKEN }, async () => {
    const handler = newHandler();

    const page = await handler.handle(makeRequest({ clientIp: REMOTE }));
    assert.strictEqual(page.status, 403);
    assert.strictEqual(page.html, 'forbidden');

    const api = await apiCall(handler, { ip: REMOTE, token: VALID_TOKEN });
    assert.strictEqual(api.status, 403);
    assert.strictEqual(api.data.error.code, 'FORBIDDEN');
  });
});

test('本地来源默认放行页面，不需要额外开关', async () => {
  await withEnv({ ADMIN_ALLOW_REMOTE: undefined }, async () => {
    const page = await newHandler().handle(makeRequest({ clientIp: LOCAL }));
    assert.strictEqual(page.status, 200);
    assert.ok(String(page.html).includes('ADMIN_TOKEN'), '页面应正常返回');
  });
});

test('ADMIN_ALLOW_REMOTE=1 才放开公网页面，密码仍然必需', async () => {
  await withEnv({ ADMIN_ALLOW_REMOTE: '1', ADMIN_TOKEN: VALID_TOKEN }, async () => {
    const handler = newHandler();
    const page = await handler.handle(makeRequest({ clientIp: REMOTE }));
    assert.strictEqual(page.status, 200);

    // 页面可读 ≠ 数据可取，无密码仍是 401
    const noToken = await apiCall(handler, { ip: REMOTE });
    assert.strictEqual(noToken.status, 401);
    assert.strictEqual(noToken.data.error.code, 'UNAUTHORIZED');
  });
});

test('连续 5 次密码错误后锁定，锁定期间正确密码也被拒', async () => {
  await withEnv({ ADMIN_ALLOW_REMOTE: '1', ADMIN_TOKEN: VALID_TOKEN }, async () => {
    const handler = newHandler();
    const ip = '198.51.100.11';

    for (let i = 1; i <= 5; i += 1) {
      const res = await apiCall(handler, { ip, token: `wrong-${i}` });
      assert.strictEqual(res.status, 401, `第 ${i} 次应仍返回 401`);
    }

    const locked = await apiCall(handler, { ip, token: 'wrong-6' });
    assert.strictEqual(locked.status, 429, '第 6 次应被锁定');
    assert.strictEqual(locked.data.error.code, 'RATE_LIMITED');
    assert.match(locked.data.error.message, /retry in \d+ min/);

    const withCorrect = await apiCall(handler, { ip, token: VALID_TOKEN });
    assert.strictEqual(withCorrect.status, 429, '锁定优先于密码校验');
  });
});

test('锁定按 IP 隔离，别的来源不受牵连', async () => {
  await withEnv({ ADMIN_ALLOW_REMOTE: '1', ADMIN_TOKEN: VALID_TOKEN }, async () => {
    const handler = newHandler();
    const offender = '198.51.100.21';
    const innocent = '198.51.100.22';

    for (let i = 0; i < 5; i += 1) await apiCall(handler, { ip: offender, token: 'bad' });
    assert.strictEqual((await apiCall(handler, { ip: offender, token: VALID_TOKEN })).status, 429);

    const other = await apiCall(handler, { ip: innocent, token: VALID_TOKEN, path: '/admin/api/unknown-route' });
    assert.strictEqual(other.status, 404, '过了门禁才会走到 404');
    assert.strictEqual(other.data.error.code, 'NOT_FOUND');
  });
});

test('登录成功后失败计数清零', async () => {
  await withEnv({ ADMIN_ALLOW_REMOTE: '1', ADMIN_TOKEN: VALID_TOKEN }, async () => {
    const handler = newHandler();
    const ip = '198.51.100.31';

    for (let i = 0; i < 4; i += 1) {
      assert.strictEqual((await apiCall(handler, { ip, token: 'bad' })).status, 401);
    }
    const ok = await apiCall(handler, { ip, token: VALID_TOKEN, path: '/admin/api/unknown-route' });
    assert.strictEqual(ok.status, 404, '正确密码应通过门禁');

    // 计数已清零：再错 4 次仍是 401，不会因为累计到 5 次而被锁
    for (let i = 0; i < 4; i += 1) {
      assert.strictEqual((await apiCall(handler, { ip, token: 'bad' })).status, 401);
    }
  });
});

test('锁定以第 5 次失败为起点计满 15 分钟，不被首次失败的窗口提前解除', async () => {
  // 真实 handler 无法注入时钟，这里临时覆盖 Date.now（模块内按调用时才读），
  // 复现「首次失败后隔 14 分钟才凑满 5 次」的慢速爆破：
  // 若按首次失败起算窗口，锁会在 T+15 就被清掉，实际只锁了 1 分钟。
  await withEnv({ ADMIN_ALLOW_REMOTE: '1', ADMIN_TOKEN: VALID_TOKEN }, async () => {
    const handler = newHandler();
    const ip = '198.51.100.41';
    const MIN = 60 * 1000;
    const realNow = Date.now;
    let fake = 1_700_000_000_000;
    Date.now = () => fake;
    try {
      // 第 1 次失败在 T+0，随后 4 次让第 5 次落在 T+14min，锁到 T+29min
      await apiCall(handler, { ip, token: 'bad' });
      fake += 14 * MIN;
      for (let i = 0; i < 4; i += 1) await apiCall(handler, { ip, token: 'bad' });

      // T+20min：此时「距首次失败」已超 15min 窗口，但锁要到 T+29min 才满，
      // 若把窗口过期当作解锁条件，这里就会错误放行（缺陷暴露点）
      fake = 1_700_000_000_000 + 20 * MIN;
      const midLock = await apiCall(handler, { ip, token: VALID_TOKEN });
      assert.strictEqual(midLock.status, 429, 'T+20min 仍在锁定期内，不应放行');

      // T+28min：仍锁
      fake = 1_700_000_000_000 + 28 * MIN;
      assert.strictEqual((await apiCall(handler, { ip, token: VALID_TOKEN })).status, 429);

      // T+30min：锁已过期，正确密码应通过门禁（走到 404）
      fake = 1_700_000_000_000 + 30 * MIN;
      const unlocked = await apiCall(handler, { ip, token: VALID_TOKEN, path: '/admin/api/unknown-route' });
      assert.strictEqual(unlocked.status, 404, '锁过期后应恢复访问');
    } finally {
      Date.now = realNow;
    }
  });
});
