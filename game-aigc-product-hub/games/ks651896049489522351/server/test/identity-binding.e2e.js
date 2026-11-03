// 端到端验证「身份只能由服务端 auth 握手决定」。
// 需要服务端已在 PORT 上运行（建议 DDZ_AUTH_MODE=dev 启动）。
//
// 覆盖三条历史攻击路径：
//   1. 不认证直接发业务消息 → 旧实现会凭 connId 造号并白送新手铁豆
//   2. 自报 accountId 冒用他人钱包 → 旧实现直接采信客户端字段
//   3. 换连接重放同一 deviceId → 必须回到同一账号，而非每次新建
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const VICTIM_DEVICE = 'e2e-victim-device';
const ATTACKER_DEVICE = 'e2e-attacker-device';

function once (ws, type, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting ' + type)), timeoutMs);
    const onMsg = (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type !== type) return;
      clearTimeout(timer); ws.off('message', onMsg); resolve(msg.data);
    };
    ws.on('message', onMsg);
  });
}

function onceClose (ws, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting close')), timeoutMs);
    ws.on('close', (code) => { clearTimeout(timer); resolve(code); });
  });
}

function connect () {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  return new Promise((res, rej) => { ws.on('open', () => res(ws)); ws.on('error', rej); });
}

async function authAs (ws, deviceId) {
  ws.send(JSON.stringify({ type: 'auth', deviceId }));
  return await once(ws, 'authOk');
}

const failures = [];
function check (ok, label) {
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${label}`);
  if (!ok) failures.push(label);
}

(async () => {
  // ---- 用例 1：未认证即请求业务消息，必须被拒绝并断连 ----
  {
    const ws = await connect();
    ws.send(JSON.stringify({ type: 'getWallet', nickname: '未认证者' }));
    const err = await once(ws, 'error');
    const closeCode = await onceClose(ws);
    check(err.code === 'UNAUTHENTICATED', '未认证请求 getWallet 被拒绝');
    check(closeCode === 1008, `未认证连接被 1008 断开（实际 ${closeCode}）`);
  }

  // ---- 用例 2：认证后的 accountId 由服务端派生，客户端无法指定 ----
  const victimWs = await connect();
  const victimAuth = await authAs(victimWs, VICTIM_DEVICE);
  const victimAccountId = victimAuth.accountId;
  check(/^guest_[0-9a-f]{32}$/.test(victimAccountId),
    `服务端派生游客 accountId 格式正确（${victimAccountId}）`);
  check(!victimAccountId.includes(VICTIM_DEVICE), 'accountId 不含 deviceId 原文');

  victimWs.send(JSON.stringify({ type: 'getWallet', nickname: '受害者' }));
  const victimWallet = await once(victimWs, 'wallet');
  check(victimWallet.wallet.accountId === victimAccountId, '钱包账号与认证身份一致');
  console.log(`  受害者余额 = ${victimWallet.wallet.beans}`);

  // ---- 用例 3：攻击者自报受害者 accountId，必须无效 ----
  const attackerWs = await connect();
  const attackerAuth = await authAs(attackerWs, ATTACKER_DEVICE);
  check(attackerAuth.accountId !== victimAccountId, '不同设备得到不同账号');

  attackerWs.send(JSON.stringify({
    type: 'getWallet',
    accountId: victimAccountId,     // 冒用
    openId: victimAccountId,
    guestId: victimAccountId,
    nickname: '攻击者',
  }));
  const spoofed = await once(attackerWs, 'wallet');
  check(spoofed.wallet.accountId === attackerAuth.accountId,
    `自报 accountId 被忽略，回包仍是本人（${spoofed.wallet.accountId}）`);

  // ---- 用例 4：重复认证不得中途换号 ----
  attackerWs.send(JSON.stringify({ type: 'auth', deviceId: VICTIM_DEVICE }));
  const reAuth = await once(attackerWs, 'authOk');
  check(reAuth.accountId === attackerAuth.accountId, '同一连接重复认证不得切换身份');

  // ---- 用例 5：同 deviceId 换连接必须回到同一账号（否则每连一次白送一份新手豆）----
  const rejoinWs = await connect();
  const rejoinAuth = await authAs(rejoinWs, VICTIM_DEVICE);
  check(rejoinAuth.accountId === victimAccountId, '同设备重连回到同一账号，不重复发放新手铁豆');

  // ---- 用例 6：sessionToken 可复用登录 ----
  if (rejoinAuth.sessionToken) {
    const tokenWs = await connect();
    tokenWs.send(JSON.stringify({ type: 'auth', sessionToken: rejoinAuth.sessionToken }));
    const tokenAuth = await once(tokenWs, 'authOk');
    check(tokenAuth.accountId === victimAccountId, 'sessionToken 复用登录回到同一账号');
    tokenWs.close();
  }

  // ---- 用例 7：伪造 sessionToken 必须被拒 ----
  {
    const ws = await connect();
    ws.send(JSON.stringify({ type: 'auth', sessionToken: 'forged.token' }));
    const fail = await once(ws, 'authFail');
    check(!!fail.code, `伪造 sessionToken 被拒（${fail.code}）`);
    ws.close();
  }

  // ---- 用例 8：auth 与业务消息「连发」不得被误判为未认证 ----
  // 回归用例。客户端真实时序是 auth 后立即发 getWallet，不等 authOk。
  // 服务端消息处理是 async，若不串行化，第二条会在第一条 await 期间被处理，
  // 此时 authenticated 尚未置位 → 合法请求被 1008 断开，
  // 大厅表现为「同步失败 点击重试」。
  {
    const ws = await connect();
    // 关键：两条消息在同一 tick 内连续发出，不等待任何回包
    ws.send(JSON.stringify({ type: 'auth', deviceId: 'e2e-pipeline-device' }));
    ws.send(JSON.stringify({ type: 'getWallet', nickname: '连发测试' }));

    const got = await Promise.race([
      once(ws, 'wallet').then(d => ({ ok: true, data: d })),
      once(ws, 'error').then(d => ({ ok: false, data: d })),
    ]).catch(e => ({ ok: false, data: { message: e.message } }));

    check(got.ok, `auth 后连发 getWallet 不被误判未认证（${got.ok ? 'wallet 正常返回' : got.data.code || got.data.message}）`);
    if (got.ok) {
      const beans = got.data && got.data.wallet ? got.data.wallet.beans : null;
      check(Number(beans) === 20000, `连发场景余额正确（${beans}）`);
    }
    ws.close();
  }

  victimWs.close(); attackerWs.close(); rejoinWs.close();

  console.log(failures.length
    ? `\n[FAIL] ${failures.length} 项未通过：\n  - ${failures.join('\n  - ')}`
    : '\n[PASS] 身份边界全部用例通过');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error('测试异常:', e.message); process.exit(2); });
