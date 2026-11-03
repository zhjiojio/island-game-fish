// 限流与房间兜底回收测试。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// index.js 加载 auth.js 时需要 auth 环境变量；
// 不设置则默认 strict 模式 → 要求 DDZ_AUTH_SECRET → 直接抛异常。
process.env.DDZ_AUTH_MODE = process.env.DDZ_AUTH_MODE || 'dev';
process.env.DDZ_AUTH_SECRET = process.env.DDZ_AUTH_SECRET || 'test_secret';

const srv = require('../index.js');
const {
  hitAccountRateLimit, sweepAccountRateBuckets,
  sweepRooms, touchRoom, rooms, disconnectTimers, createRoom,
  serializePublicPlayers, playerBlocksNewSession, playerCanRecoverSeat,
} = srv;

test('入房完整分支保留昵称声明，首次加入及重连不产生 ReferenceError', async () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.resolve(__dirname, '../index.js'), 'utf8');
  const start = source.indexOf("    if (type === 'join') {", source.indexOf('// ---- 加入房间 ----'));
  const end = source.indexOf('// ---- 退出房间 ----', start);
  const branch = source.slice(start, end);
  const room = { players: {}, seats: [null, null, null], handCounts: {}, hands: {} };
  const messages = [];
  const context = vm.createContext({
    type: 'join', data: { roomId: '994410', nickname: '郝江' },
    playerId: null, currentRoomId: null, rooms: new Map([['994410', room]]),
    ws: {}, connId: 'test', boundLoginType: 'kwai', clientCapabilities: new Set(),
    resolveAccountId: () => 'ks_test', checkAccountRateLimit: () => false,
    rejectIfEscapeCd: async () => false,
    getRoomTierForRoom: () => ({ type: 'junior', name: '初级场', entryFeeBeans: 0 }),
    guestRoomTypeRejection: () => null,
    playerCanRecoverSeat: (player, accountId) => player.accountId === accountId,
    hasEnoughBeansToMatch: async () => true,
    getOrCreateWallet: async () => ({ beans: 20000 }),
    playerCount: () => Object.keys(room.players).length,
    sendTo: (socket, type, data) => messages.push({ type, data }),
    VOICE_CHAT: { enabled: false }, loadEntitlementsSnapshot: async () => {},
    matchStore: { appendMatchEvent: async () => {} },
    logger: { info: () => {} }, allPlayers: () => [], broadcastAll: () => {},
    clearDisconnectTimer: () => {}, syncPlayerBeans: async () => {},
    buildStatePayload: () => ({}),
  });
  const run = code => vm.runInContext(`(async () => { ${code} })()`, context);
  const withoutName = branch.replace(/      const name = .*;\n/, '');
  await assert.rejects(run(withoutName), /name is not defined/);
  room.players = {};
  room.seats = [null, null, null];
  context.playerId = null;
  context.currentRoomId = null;
  await run(branch);
  assert.strictEqual(Object.values(room.players)[0].name, '郝江');
  assert.ok(messages.some(message => message.type === 'joined'));
  messages.length = 0;
  await run(branch);
  assert.ok(messages.some(message => message.type === 'joined'));
  assert.strictEqual(Object.keys(room.players).length, 1);
});

test('账号维度限流跨连接生效（重连无法重置配额）', () => {
  const account = 'rl_acct_1';
  const limit = srv.COMMAND_RATE_LIMITS.claimShareReward; // 60s / 3 次
  const hits = [];
  for (let i = 0; i < limit.max + 2; i++) {
    hits.push(hitAccountRateLimit(account, 'claimShareReward'));
  }
  assert.deepStrictEqual(hits.slice(0, limit.max), Array(limit.max).fill(false), '配额内应放行');
  assert.ok(hits[limit.max], '超出配额必须拦截');
  assert.ok(hits[limit.max + 1], '持续超出仍拦截');
});

test('不同账号的配额互不影响', () => {
  for (let i = 0; i < 5; i++) hitAccountRateLimit('rl_acct_2', 'claimShareReward');
  assert.strictEqual(hitAccountRateLimit('rl_acct_3', 'claimShareReward'), false,
    '别的账号刷爆不应影响本账号');
});

test('未纳入账号限流的高频指令不受影响（出牌不能被误限）', () => {
  for (let i = 0; i < 100; i++) {
    assert.strictEqual(hitAccountRateLimit('rl_acct_4', 'playCards'), false,
      'playCards 属对局内高频指令，不应走账号限流');
  }
});

test('空闲限流桶会被清理，避免 Map 无界增长', () => {
  hitAccountRateLimit('rl_acct_stale', 'getWallet');
  // 用未来时间点触发清理判定
  const removed = sweepAccountRateBuckets(0, Date.now() + 1000);
  assert.ok(removed >= 1, '空闲桶应被回收');
});

test('sweepRooms 回收无人房间', () => {
  rooms.clear();
  const room = createRoom('900001', 'junior');
  rooms.set('900001', room);
  assert.strictEqual(rooms.size, 1);
  const ret = sweepRooms();
  assert.ok(ret.disposedRooms.includes('900001'), '无人房间应被回收');
  assert.strictEqual(rooms.size, 0);
});

test('sweepRooms 不回收仍有活跃连接的房间', () => {
  rooms.clear();
  const room = createRoom('900002', 'junior');
  const fakeWs = { readyState: 1 };
  room.players['p1'] = { id: 'p1', seat: 0, ws: fakeWs };
  room.seats[0] = 'p1';
  room.lastActivityAt = 0;  // 故意标记为极久未活动
  rooms.set('900002', room);
  sweepRooms();
  assert.strictEqual(rooms.size, 1, '有活跃连接的房间不得被误杀');
  rooms.clear();
});

test('sweepRooms 回收长期空闲且连接已断的房间', () => {
  rooms.clear();
  const room = createRoom('900003', 'junior');
  room.players['p1'] = { id: 'p1', seat: 0, ws: { readyState: 3 } }; // CLOSED
  room.seats[0] = 'p1';
  room.lastActivityAt = Date.now() - 3600000;  // 1 小时前
  rooms.set('900003', room);
  const ret = sweepRooms();
  assert.ok(ret.disposedRooms.includes('900003'), '长期空闲+连接已断应回收');
  rooms.clear();
});

test('sweepRooms 清理孤儿断线定时器', () => {
  rooms.clear();
  disconnectTimers.clear();
  const timer = setTimeout(() => {}, 60000);
  disconnectTimers.set('999999:p_ghost', timer);   // 房间并不存在
  const ret = sweepRooms();
  assert.strictEqual(ret.orphanTimers, 1, '孤儿定时器应被清理');
  assert.strictEqual(disconnectTimers.size, 0);
});

test('touchRoom 刷新活跃时间，避免活跃房被回收', () => {
  rooms.clear();
  const room = createRoom('900004', 'junior');
  room.players['p1'] = { id: 'p1', seat: 0, ws: { readyState: 3 } };
  room.seats[0] = 'p1';
  room.lastActivityAt = Date.now() - 3600000;
  rooms.set('900004', room);
  touchRoom(room);                       // 模拟一次广播
  sweepRooms();
  assert.strictEqual(rooms.size, 1, '刚活跃过的房间不应被回收');
  rooms.clear();
});

test('主动退出托管座位完成旧局结算但不阻塞新匹配或被误恢复', () => {
  const accountId = 'acct_active_leave';
  const activeLeavePlayer = {
    accountId,
    isBot: false,
    connected: false,
    autoManaged: true,
    autoManagedReason: 'active_leave',
    detachedFromSession: true,
  };
  assert.strictEqual(playerBlocksNewSession(activeLeavePlayer, accountId), false);
  assert.strictEqual(playerCanRecoverSeat(activeLeavePlayer, accountId), false);

  const disconnectedPlayer = {
    accountId,
    isBot: false,
    connected: false,
    autoManaged: true,
    autoManagedReason: 'disconnect_timeout',
    detachedFromSession: false,
  };
  assert.strictEqual(playerBlocksNewSession(disconnectedPlayer, accountId), true);
  assert.strictEqual(playerCanRecoverSeat(disconnectedPlayer, accountId), true);
});

test('游戏主循环不得逐帧重建 Canvas backing store', () => {
  const mainSource = fs.readFileSync(
    path.resolve(__dirname, '../../package/js/main.js'),
    'utf8'
  );
  const loopSource = mainSource.match(/function loop \(\) \{([\s\S]*?)requestAnimationFrame\(loop\);\n  \}/);
  assert.ok(loopSource, '应能定位游戏主循环');
  assert.doesNotMatch(loopSource[1], /\bresize\s*\(/);
});

test('state 下发不含 ws / accountId 等敏感字段', () => {
  const players = {
    p1: { id: 'p1', accountId: 'secret_acct', name: '甲', seat: 0, ready: true,
          beans: 100, role: 'farmer', connected: true, detachedFromSession: true,
          ws: { readyState: 1, _socket: { remoteAddress: '10.1.2.3' } } },
  };
  const out = JSON.stringify(serializePublicPlayers(players));
  assert.ok(!out.includes('secret_acct'), 'accountId 不得下发');
  assert.ok(!out.includes('_socket'), 'ws 内部结构不得下发');
  assert.ok(!out.includes('10.1.2.3'), '对端 IP 不得下发');
  assert.ok(!out.includes('detachedFromSession'), '内部会话脱离标记不得下发');
  assert.ok(out.includes('"name":"甲"'), '正常字段应保留');
  assert.ok(out.includes('"beans":100'), '余额字段应保留');
});

test('语音 capability 只接受受支持的安全白名单', () => {
  const capabilities = srv.sanitizeCapabilities([
    'voice_config_v2', 'voice_trade_v1', 'unknown', 'bad:value', 'voice_config_v2', 42,
  ]);
  assert.deepStrictEqual(Array.from(capabilities), ['voice_config_v2', 'voice_trade_v1']);
});

test('语音发送状态拒绝托管、断线与主动离场座位', () => {
  assert.strictEqual(srv.canPlayerSendVoice({ connected: true, autoManaged: false, detachedFromSession: false }), true);
  assert.strictEqual(srv.canPlayerSendVoice({ connected: false, autoManaged: false, detachedFromSession: false }), false);
  assert.strictEqual(srv.canPlayerSendVoice({ connected: true, autoManaged: true, detachedFromSession: false }), false);
  assert.strictEqual(srv.canPlayerSendVoice({ connected: true, autoManaged: false, detachedFromSession: true }), false);
});

test('voiceMsg 的连接级与账号级配额均为 10 秒 6 次', () => {
  assert.deepStrictEqual(srv.COMMAND_RATE_LIMITS.voiceMsg, { windowMs: 10000, max: 6 });
  const accountId = `voice_rate_${process.pid}`;
  for (let i = 0; i < 6; i++) assert.strictEqual(srv.hitAccountRateLimit(accountId, 'voiceMsg'), false);
  assert.strictEqual(srv.hitAccountRateLimit(accountId, 'voiceMsg'), true);
});

test('语音配置按 capability 区分 v1/v2 且付费内容不混入免费索引', () => {
  const voice = require('../game-ai/voice-config');
  const legacy = voice.getVoiceConfigForCapabilities(new Set());
  const modern = voice.getVoiceConfigForCapabilities(new Set(['voice_config_v2']));
  assert.strictEqual(legacy.packs.length, 0, '旧客户端不得展示不可购买的专属包');
  assert.strictEqual(modern.schemaVersion, 3);
  assert.ok(modern.packs.length > 0 && Array.isArray(modern.packs[0].voices));
  assert.deepStrictEqual(
    new Set(voice.VOICE_PACK_SKUS),
    new Set(require('../trade/catalog').ITEMS.filter(item => item.type === 'voice_pack').map(item => item.sku)),
    '内容定义全集必须与语音商品全集一致，不能用启用态列表代替定义态列表'
  );
  for (const item of modern.interactive) assert.match(item.voiceUrl, /^https:\/\//);
  for (const pack of modern.packs) {
    for (const item of pack.voices) assert.match(item.voiceUrl, /^https:\/\//);
  }
  assert.strictEqual(voice.VOICE_BY_ID.get('it_1').free, true);
  assert.strictEqual(voice.VOICE_BY_ID.get('vp_tiezi_jiaodizhu').free, false);
  assert.strictEqual(voice.VOICE_BY_ID.has('vp_1'), false, '旧幽灵 ID 必须失效');
  const projected = srv.buildVoiceConfigForCapabilities(new Set(['voice_config_v2']));
  assert.ok(projected.packs.every(pack => !pack.saleEnabled || srv.enabledVoiceContentSkus.has(pack.sku)),
    '内容已下线的语音包不得投影为可购买');
  const temporarilyDisabledSku = 'voice_pack:tiezi';
  srv.enabledVoiceContentSkus.delete(temporarilyDisabledSku);
  try {
    assert.strictEqual(srv.isSkuPurchaseEnabled(temporarilyDisabledSku), false,
      '内容下线后直连 buySku 也必须被禁用，不能只隐藏客户端入口');
  } finally {
    srv.enabledVoiceContentSkus.add(temporarilyDisabledSku);
  }
  assert.strictEqual(srv.isSkuPurchaseEnabled(temporarilyDisabledSku), true);
});

test('本地启动默认使用 MySQL 并显式开启全部服务端功能开关', () => {
  const serverRoot = path.resolve(__dirname, '..');
  const startScript = fs.readFileSync(path.resolve(serverRoot, 'scripts/start-dev.sh'), 'utf8');
  const featureFlags = new Set();

  function collectFeatureFlags (dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'test') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectFeatureFlags(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        const source = fs.readFileSync(fullPath, 'utf8');
        for (const match of source.matchAll(/process\.env\.(DDZ_[A-Z0-9_]+_ENABLED)\b/g)) {
          featureFlags.add(match[1]);
        }
      }
    }
  }

  collectFeatureFlags(serverRoot);
  assert.ok(featureFlags.size > 0, '应能发现至少一个服务端功能开关');
  assert.ok(startScript.includes('this project is MySQL-only'),
    '本地开发脚本必须显式拒绝非 MySQL 方言');

  for (const flag of featureFlags) {
    const localName = `FEATURE_${flag.slice('DDZ_'.length)}`;
    const defaultBinding = localName + '="${' + flag + ':-true}"';
    const processBinding = flag + '="' + String.fromCharCode(36) + localName + '"';
    assert.ok(startScript.includes(defaultBinding),
      `${flag} 必须在本地启动脚本中默认开启，缺少 ${defaultBinding}`);
    assert.ok(startScript.includes(processBinding),
      `${flag} 必须显式传入 Node 服务进程，缺少 ${processBinding}`);
  }
});

test('本地与 Compose 默认启用轻量牌力并保留 V1 回滚', () => {
  const serverRoot = path.resolve(__dirname, '..');
  const projectRoot = path.resolve(serverRoot, '..');
  const startScript = fs.readFileSync(path.resolve(serverRoot, 'scripts/start-dev.sh'), 'utf8');
  assert.ok(startScript.includes('DDZ_HAND_STRENGTH_MODE="${DDZ_HAND_STRENGTH_MODE:-lite}"'));
  assert.ok(!startScript.includes('DDZ_HAND_STRENGTH_MAX_STATES'));
  assert.ok(!startScript.includes('DDZ_HAND_STRENGTH_SHADOW_LOG_PERCENT'));

  for (const relativePath of ['compose.yml', 'server/docker-compose.yml']) {
    const compose = fs.readFileSync(path.resolve(projectRoot, relativePath), 'utf8');
    assert.ok(compose.includes('DDZ_HAND_STRENGTH_MODE: ${DDZ_HAND_STRENGTH_MODE:-lite}'));
    assert.ok(!compose.includes('DDZ_HAND_STRENGTH_MAX_STATES'));
    assert.ok(!compose.includes('DDZ_HAND_STRENGTH_SHADOW_LOG_PERCENT'));
  }
});

test('本地启动将同一 DouZero 容量配置传给 Node 和 Sidecar', () => {
  const serverRoot = path.resolve(__dirname, '..');
  const projectRoot = path.resolve(serverRoot, '..');
  const startScript = fs.readFileSync(path.resolve(serverRoot, 'scripts/start-dev.sh'), 'utf8');
  const sidecarScript = fs.readFileSync(path.resolve(projectRoot, 'douzero-service/scripts/start.sh'), 'utf8');
  const sidecarApp = fs.readFileSync(path.resolve(projectRoot, 'douzero-service/app.py'), 'utf8');

  assert.ok(startScript.includes('DOUZERO_MAX_CONCURRENT="${DOUZERO_MAX_CONCURRENT:-4}"'));
  assert.ok(startScript.includes('export DOUZERO_MAX_CONCURRENT'));
  assert.ok(startScript.includes('DDZ_DOUZERO_MAX_CONCURRENT="${DDZ_DOUZERO_MAX_CONCURRENT:-$DOUZERO_MAX_CONCURRENT}"'));
  assert.ok(sidecarScript.includes('-e DOUZERO_MAX_CONCURRENT="${DOUZERO_MAX_CONCURRENT:-4}"'));
  assert.ok(sidecarApp.includes('os.getenv("DOUZERO_MAX_CONCURRENT", "4")'));

  for (const relativePath of ['compose.yml', 'server/docker-compose.yml']) {
    const compose = fs.readFileSync(path.resolve(projectRoot, relativePath), 'utf8');
    assert.ok(compose.includes('DDZ_DOUZERO_MAX_CONCURRENT: ${DOUZERO_MAX_CONCURRENT:-4}'), `${relativePath} 的 Node 并发必须复用 Sidecar 容量`);
    assert.ok(compose.includes('DOUZERO_MAX_CONCURRENT: ${DOUZERO_MAX_CONCURRENT:-4}'), `${relativePath} 的 Sidecar 并发必须使用统一容量`);
  }
});
