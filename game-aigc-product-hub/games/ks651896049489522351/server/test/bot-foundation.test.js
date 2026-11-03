const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

process.env.DDZ_AUTH_MODE = 'dev';
process.env.DDZ_AUTH_SECRET = 'bot_foundation_test_secret';

const { setupMysqlTest, teardownMysqlTest } = require('./helpers/mysql-test');

const { getDb } = require('../persistence/db');
const accountStore = require('../persistence/account-store');
const walletStore = require('../persistence/wallet-store');
const botStatsStore = require('../persistence/bot-stats-store');
const treasuryStore = require('../persistence/treasury-store');
const auth = require('../auth');

const USER = 'guest_bot_foundation_user';
const TREASURY = 'system::bot_treasury::junior';
const DATE = '2026-08-10';

async function seedTreasury (beans = 100000) {
  const db = getDb();
  await db.run('DELETE FROM bot_treasury_reservations WHERE treasury_account_id = ?', [TREASURY]);
  await db.run('DELETE FROM wallet_ledger WHERE account_id = ?', [TREASURY]);
  await db.run('DELETE FROM wallets WHERE account_id = ?', [TREASURY]);
  await db.run('DELETE FROM accounts WHERE account_id = ?', [TREASURY]);
  await db.run(`
    INSERT INTO accounts (
      account_id, account_type, login_type, kwai_open_id_hash, device_id,
      first_ip, last_ip, login_count, banned, ban_reason, created_at, last_login_at
    ) VALUES (?, 'system_treasury', 'system', '', '', '', '', 0, 0, '', 0, 0)
  `, [TREASURY]);
  await db.run(`
    INSERT INTO wallets (
      account_id, beans, frozen_beans, total_earned, total_spent, total_won,
      total_lost, daily_login_date, share_reward_date, created_at, updated_at, version
    ) VALUES (?, ?, 0, 0, 0, 0, 0, '', '', 0, 0, 1)
  `, [TREASURY, beans]);
}

async function resetQuota () {
  const db = getDb();
  await db.run('DELETE FROM bot_quota_reservations WHERE account_id = ?', [USER]);
  await db.run('DELETE FROM bot_match_stats WHERE account_id = ?', [USER]);
}

let ready = false;

test.before(async () => {
  try {
    await setupMysqlTest();
    ready = true;
    await accountStore.recordLogin(USER, { loginType: 'guest', deviceId: 'bot-foundation-device' });
    await walletStore.getOrCreateWallet(USER, { initialBeans: 20000 });
  } catch (e) { console.log('[SKIP] MySQL 测试环境不可用:', e.message); }
});

test.after(async () => {
  if (ready) await teardownMysqlTest();
});

test('匹配入场客户端构建版本已刷新并完整透传预约票据', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const packageDir = path.resolve(__dirname, '../../package');
  const indexHtml = fs.readFileSync(path.join(packageDir, 'index.html'), 'utf8');
  const buildVersion = indexHtml.match(/BUILD_VERSION\s*=\s*['"](\d+)['"]/);
  assert.ok(buildVersion, '客户端必须声明统一构建版本');
  assert.ok(Number(buildVersion[1]) >= 13, '构建版本不得倒退到预约票据修复之前');

  const sent = [];
  class FakeWebSocket {
    constructor () {
      this.readyState = 1;
      setImmediate(() => this.onopen());
    }

    send (raw) {
      const payload = JSON.parse(raw);
      sent.push(payload);
      if (payload.type === 'auth') {
        setImmediate(() => this.onmessage({ data: JSON.stringify({ type: 'authOk', data: {} }) }));
      }
    }

    close () {}
  }

  const sandbox = {
    window: {
      M3: {
        Config: { SERVER_URL: 'ws://test.invalid' },
        Auth: {
          buildAuthPayload: () => ({ type: 'auth', deviceId: 'test-device' }),
          applyAuthResult: () => {},
        },
        log: () => {},
      },
    },
    WebSocket: FakeWebSocket,
    setImmediate,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    JSON,
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(packageDir, 'js/network.js'), 'utf8'),
    sandbox,
    { filename: 'network.js' }
  );

  sandbox.window.M3.Network.joinRoom(
    '测试用户', '123456', '', '', 'junior', '',
    { matchRequestId: 'match-request-1', joinTicket: 'signed-ticket-1' }
  );
  await new Promise(resolve => setTimeout(resolve, 10));
  sandbox.window.M3.Network.disconnect();

  const join = sent.find(payload => payload.type === 'join');
  assert.ok(join, '认证完成后必须发送 join 请求');
  assert.strictEqual(join.matchRequestId, 'match-request-1');
  assert.strictEqual(join.joinTicket, 'signed-ticket-1');
});

test('保留账号命名空间不能通过认证、账号或普通钱包入口访问', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  assert.throws(
    () => auth.issueSessionToken({ accountId: TREASURY, loginType: 'system' }),
    /保留账号命名空间/
  );
  await assert.rejects(() => accountStore.recordLogin('bot::fake', {}), /拒绝外部记录保留账号/);
  await assert.rejects(() => walletStore.getOrCreateWallet(TREASURY), /拒绝保留账号命名空间/);
});

test('机器人额度预占和激活按 matchRequestId 幂等', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await resetQuota();
  const options = {
    reservationId: 'quota-reserve-1',
    matchRequestId: 'request-1',
    accountId: USER,
    statDate: DATE,
    requiredPositiveGain: 5000,
  };
  const first = await botStatsStore.reserveBotQuota(options);
  const repeated = await botStatsStore.reserveBotQuota({ ...options, reservationId: 'ignored-id' });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(first.idempotent, false);
  assert.strictEqual(repeated.idempotent, true);
  assert.strictEqual(repeated.reservation.reservationId, 'quota-reserve-1');

  let stats = await botStatsStore.getDailyStats(USER, DATE);
  assert.strictEqual(stats.reservedMatchCount, 1);
  assert.strictEqual(stats.reservedPositiveGain, 5000);

  const active = await botStatsStore.activateBotQuota('quota-reserve-1', 'match-1', 'solo');
  const activeAgain = await botStatsStore.activateBotQuota('quota-reserve-1', 'match-1', 'solo');
  assert.strictEqual(active.idempotent, false);
  assert.strictEqual(activeAgain.idempotent, true);
  stats = await botStatsStore.getDailyStats(USER, DATE);
  assert.strictEqual(stats.reservedMatchCount, 0);
  assert.strictEqual(stats.matchCount, 1);
  assert.strictEqual(stats.soloBotMatchCount, 1);
  assert.strictEqual(stats.reservedPositiveGain, 5000);
});

test('正收益只累计正值，亏损不能恢复额度，结算不可超过预占', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await resetQuota();
  await botStatsStore.reserveBotQuota({
    reservationId: 'quota-gain-1', matchRequestId: 'request-gain-1',
    accountId: USER, statDate: DATE, requiredPositiveGain: 3000,
  });
  await botStatsStore.activateBotQuota('quota-gain-1', 'match-gain-1', 'solo');
  await assert.rejects(
    () => botStatsStore.settleBotQuota('quota-gain-1', { netGain: 3001 }),
    /exceeds_reservation/
  );
  await botStatsStore.settleBotQuota('quota-gain-1', { netGain: 2500 });

  await botStatsStore.reserveBotQuota({
    reservationId: 'quota-loss-1', matchRequestId: 'request-loss-1',
    accountId: USER, statDate: DATE, requiredPositiveGain: 1000,
  });
  await botStatsStore.activateBotQuota('quota-loss-1', 'match-loss-1', 'duo');
  await botStatsStore.settleBotQuota('quota-loss-1', { netGain: -800 });

  const stats = await botStatsStore.getDailyStats(USER, DATE);
  assert.strictEqual(stats.netGain, 1700);
  assert.strictEqual(stats.positiveGainTotal, 2500);
  assert.strictEqual(stats.reservedPositiveGain, 0);
  assert.strictEqual(stats.winCount, 1);
  assert.strictEqual(stats.loseCount, 1);
});

test('每日场次和累计正收益预占执行硬上限', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await resetQuota();
  await getDb().run(`
    INSERT INTO bot_match_stats (
      account_id, stat_date, match_count, positive_gain_total,
      created_at, updated_at
    ) VALUES (?, ?, 20, 0, 0, 0)
  `, [USER, DATE]);
  const matchLimit = await botStatsStore.reserveBotQuota({
    matchRequestId: 'limit-match', accountId: USER, statDate: DATE, requiredPositiveGain: 1,
  });
  assert.deepStrictEqual({ ok: matchLimit.ok, reason: matchLimit.reason }, { ok: false, reason: 'daily_match_limit' });

  await resetQuota();
  await getDb().run(`
    INSERT INTO bot_match_stats (
      account_id, stat_date, positive_gain_total, reserved_positive_gain,
      created_at, updated_at
    ) VALUES (?, ?, 29000, 500, 0, 0)
  `, [USER, DATE]);
  const gainLimit = await botStatsStore.reserveBotQuota({
    matchRequestId: 'limit-gain', accountId: USER, statDate: DATE, requiredPositiveGain: 501,
  });
  assert.deepStrictEqual({ ok: gainLimit.ok, reason: gainLimit.reason }, { ok: false, reason: 'daily_positive_gain_limit' });
});

test('释放未激活额度会同时归还场次和正收益预占且保持幂等', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await resetQuota();
  await botStatsStore.reserveBotQuota({
    reservationId: 'quota-release-1', matchRequestId: 'request-release-1',
    accountId: USER, statDate: DATE, requiredPositiveGain: 7000,
  });
  const first = await botStatsStore.releaseBotQuota('quota-release-1');
  const repeated = await botStatsStore.releaseBotQuota('quota-release-1');
  assert.strictEqual(first.idempotent, false);
  assert.strictEqual(repeated.idempotent, true);
  const stats = await botStatsStore.getDailyStats(USER, DATE);
  assert.strictEqual(stats.reservedMatchCount, 0);
  assert.strictEqual(stats.reservedPositiveGain, 0);
  assert.strictEqual(stats.matchCount, 0);
});

test('资金池敞口预占、释放和幂等保持冻结余额守恒', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await seedTreasury(100000);
  const options = {
    reservationId: 'treasury-release-1',
    matchRequestGroupId: 'group-release-1',
    roomId: 'room-release-1', roomType: 'junior', treasuryAccountId: TREASURY,
    requiredExposure: 30000, minReserve: 10000,
  };
  const first = await treasuryStore.reserveTreasuryExposure(options);
  const repeated = await treasuryStore.reserveTreasuryExposure({ ...options, reservationId: 'ignored' });
  assert.strictEqual(first.ok, true);
  assert.strictEqual(repeated.idempotent, true);
  let wallet = await treasuryStore.getTreasuryWallet(TREASURY);
  assert.strictEqual(wallet.beans, 100000);
  assert.strictEqual(wallet.frozenBeans, 30000);

  const released = await treasuryStore.releaseTreasuryExposure('treasury-release-1');
  const releasedAgain = await treasuryStore.releaseTreasuryExposure('treasury-release-1');
  assert.strictEqual(released.idempotent, false);
  assert.strictEqual(releasedAgain.idempotent, true);
  wallet = await treasuryStore.getTreasuryWallet(TREASURY);
  assert.strictEqual(wallet.beans, 100000);
  assert.strictEqual(wallet.frozenBeans, 0);
});

test('资金池结算只写一笔聚合变化，赔付不得超过预占', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await seedTreasury(100000);
  await treasuryStore.reserveTreasuryExposure({
    reservationId: 'treasury-settle-1', matchRequestGroupId: 'group-settle-1',
    roomId: 'room-settle-1', roomType: 'junior', treasuryAccountId: TREASURY,
    requiredExposure: 20000, minReserve: 10000,
  });
  await treasuryStore.activateTreasuryReservation('treasury-settle-1', 'match-settle-1');
  await assert.rejects(
    () => treasuryStore.settleTreasuryExposure('treasury-settle-1', { actualTreasuryDelta: -20001, roundNo: 1 }),
    /payout_exceeds_reservation/
  );
  const settled = await treasuryStore.settleTreasuryExposure('treasury-settle-1', {
    actualTreasuryDelta: -12000, roundNo: 1,
  });
  const repeated = await treasuryStore.settleTreasuryExposure('treasury-settle-1', {
    actualTreasuryDelta: -12000, roundNo: 1,
  });
  assert.strictEqual(settled.idempotent, false);
  assert.strictEqual(repeated.idempotent, true);
  const wallet = await treasuryStore.getTreasuryWallet(TREASURY);
  assert.strictEqual(wallet.beans, 88000);
  assert.strictEqual(wallet.frozenBeans, 0);
  const rows = await getDb().all(
    "SELECT * FROM wallet_ledger WHERE account_id = ? AND type = 'bot_treasury_settlement'",
    [TREASURY]
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(Number(rows[0].amount), -12000);
});

test('资金池余额不足时拒绝预占且不产生冻结', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  await seedTreasury(35000);
  const result = await treasuryStore.reserveTreasuryExposure({
    reservationId: 'treasury-insufficient-1', matchRequestGroupId: 'group-insufficient-1',
    roomId: 'room-insufficient-1', roomType: 'junior', treasuryAccountId: TREASURY,
    requiredExposure: 30000, minReserve: 10000,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'insufficient_treasury');
  const wallet = await treasuryStore.getTreasuryWallet(TREASURY);
  assert.strictEqual(wallet.frozenBeans, 0);
});
