const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DDZ_AUTH_MODE = 'dev';
process.env.DDZ_AUTH_SECRET = 'bot_settlement_test_secret';

const { setupMysqlTest, teardownMysqlTest } = require('./helpers/mysql-test');

const db = require('../persistence/db');
const accountStore = require('../persistence/account-store');
const walletStore = require('../persistence/wallet-store');
const botStatsStore = require('../persistence/bot-stats-store');
const treasuryStore = require('../persistence/treasury-store');
const matchStore = require('../persistence/match-store');
const botSettlementStore = require('../persistence/bot-settlement-store');

const TREASURY = 'system::bot_treasury::settlement_test';
const ACCOUNT_PREFIX = 'acct_bot_settlement_h';
const ROOM_PREFIX = '88000';
const DATE = '2026-01-01';

async function cleanupFixtures () {
  const database = db.getDb();
  await database.run('DELETE FROM game_match_events WHERE room_id LIKE ?', [`${ROOM_PREFIX}%`]);
  await database.run('DELETE FROM game_match_participants WHERE account_id LIKE ?', [`${ACCOUNT_PREFIX}%`]);
  await database.run('DELETE FROM game_matches WHERE room_id LIKE ?', [`${ROOM_PREFIX}%`]);
  await database.run('DELETE FROM bot_quota_reservations WHERE account_id LIKE ?', [`${ACCOUNT_PREFIX}%`]);
  await database.run('DELETE FROM bot_match_stats WHERE account_id LIKE ?', [`${ACCOUNT_PREFIX}%`]);
  await database.run('DELETE FROM bot_treasury_reservations WHERE treasury_account_id = ?', [TREASURY]);
  await database.run('DELETE FROM wallet_ledger WHERE account_id LIKE ? OR account_id = ?', [`${ACCOUNT_PREFIX}%`, TREASURY]);
  await database.run('DELETE FROM wallets WHERE account_id LIKE ?', [`${ACCOUNT_PREFIX}%`]);
  await database.run('DELETE FROM wallets WHERE account_id = ?', [TREASURY]);
  await database.run('DELETE FROM accounts WHERE account_id LIKE ?', [`${ACCOUNT_PREFIX}%`]);
  await database.run('DELETE FROM accounts WHERE account_id = ?', [TREASURY]);
}

async function createHuman (accountId, playerId, seat, beans = 20000) {
  await accountStore.recordLogin(accountId, { loginType: 'test' });
  await walletStore.getOrCreateWallet(accountId, { initialBeans: beans, todayKey: DATE });
  return { id: playerId, accountId, seat, isBot: false, controllerType: 'human', beans, ready: false };
}

async function seedTreasury (beans = 100000) {
  const database = db.getDb();
  await database.run(`
    ${database.insertIgnoreKeyword} INTO accounts (
      account_id, account_type, login_type, kwai_open_id_hash, device_id,
      first_ip, last_ip, login_count, banned, ban_reason, created_at, last_login_at
    ) VALUES (?, 'system_treasury', 'system', '', '', '', '', 0, 0, '', 0, 0)
  `, [TREASURY]);
  await database.run(`
    ${database.insertIgnoreKeyword} INTO wallets (
      account_id, beans, frozen_beans, total_earned, total_spent, total_won,
      total_lost, daily_login_date, share_reward_date, created_at, updated_at, version
    ) VALUES (?, ?, 0, 0, 0, 0, 0, '', '', 0, 0, 1)
  `, [TREASURY, beans]);
  await database.run(`
    UPDATE wallets
    SET beans = ?, frozen_beans = 0, total_earned = 0, total_spent = 0,
        total_won = 0, total_lost = 0, updated_at = 0, version = version + 1
    WHERE account_id = ?
  `, [beans, TREASURY]);
}

async function createRoomFixture (suffix = '1', exposure = 1000) {
  const accountId = `${ACCOUNT_PREFIX}${suffix}`;
  const human = await createHuman(accountId, 'human1', 0);
  await seedTreasury(100000);
  const quota = await botStatsStore.reserveBotQuota({
    matchRequestId: `req_bot_settlement_h${suffix}`, accountId: human.accountId,
    statDate: DATE, requiredPositiveGain: 1000,
  });
  const treasury = await treasuryStore.reserveTreasuryExposure({
    matchRequestGroupId: `group_bot_settlement_${suffix}`, roomId: `${ROOM_PREFIX}${suffix}`, roomType: 'junior',
    treasuryAccountId: TREASURY,
    requiredExposure: exposure, minReserve: 10000,
  });
  const room = {
    id: `${ROOM_PREFIX}${suffix}`, roomType: 'junior', hasBots: true, botMode: 'solo', botStrategyVersion: 'test',
    matchRequestGroupId: `group_bot_settlement_${suffix}`,
    players: {
      human1: human,
      bot1: { id: 'bot1', accountId: 'bot::b1', seat: 1, isBot: true, controllerType: 'bot', personaId: 'calm', beans: 20000, ready: false },
      bot2: { id: 'bot2', accountId: 'bot::b2', seat: 2, isBot: true, controllerType: 'bot', personaId: 'steady', beans: 20000, ready: false },
    },
    seats: ['human1', 'bot1', 'bot2'],
    round: { number: 1, baseScore: 100, bidScore: 1, multiplier: 1 },
    eventSeq: 0,
    dealer: 'human1',
    quotaReservationIds: { [human.accountId]: quota.reservation.reservationId },
    treasuryReservationId: treasury.reservation.reservationId,
  };
  room.matchId = await matchStore.createMatch(room, Object.values(room.players));
  await botStatsStore.activateBotQuota(quota.reservation.reservationId, room.matchId, room.botMode);
  await treasuryStore.activateTreasuryReservation(treasury.reservation.reservationId, room.matchId);
  return room;
}

let ready = false;

test.before(async () => {
  try {
    await setupMysqlTest();
    await cleanupFixtures();
    ready = true;
  } catch (e) {
    console.log('[SKIP] MySQL 测试环境不可用:', e.message);
  }
});

test.after(async () => {
  if (!ready) return;
  try {
    await cleanupFixtures();
  } finally {
    await teardownMysqlTest();
  }
});

test('机器人局真人、资金池、额度和比赛状态原子结算且守恒', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const room = await createRoomFixture('1');
  const beforeHuman = await walletStore.getWallet('acct_bot_settlement_h1');
  const beforeTreasury = await treasuryStore.getTreasuryWallet(TREASURY);
  const result = await botSettlementStore.settleBotEconomy(room, {
    human1: 200, bot1: -100, bot2: -100,
  }, { taxRate: 0.03, winnerTeam: 'landlord', baseBet: 100, bidScore: 1, multiplier: 1, spring: false });

  assert.equal(result.deltas.human1, 194);
  assert.equal(result.botTreasuryDelta, -200);
  assert.equal(result.taxTotal, 6);
  assert.equal(result.deltas.human1 + result.botTreasuryDelta + result.taxTotal, 0);
  const human = await walletStore.getWallet('acct_bot_settlement_h1');
  const treasury = await treasuryStore.getTreasuryWallet(TREASURY);
  assert.equal(human.beans, beforeHuman.beans + 194);
  assert.equal(treasury.beans, beforeTreasury.beans - 200);
  assert.equal(treasury.frozenBeans, 0);
  const stats = await botStatsStore.getDailyStats('acct_bot_settlement_h1', '2026-01-01');
  assert.equal(stats.positiveGainTotal, 194);
  assert.equal(stats.reservedMatchCount, 0);
  const match = await db.getDb().get('SELECT status, has_bots, bot_count FROM game_matches WHERE match_id = ?', [room.matchId]);
  assert.equal(match.status, 'settled');
  assert.equal(match.has_bots, 1);
  assert.equal(match.bot_count, 2);
});

test('赔付超过资金池预占时整笔回滚，真人不到账且额度仍 active', async (t) => {
  if (!ready) return t.skip('MySQL 测试环境不可用');
  const room = await createRoomFixture('2', 10);
  const beforeHuman = await walletStore.getWallet('acct_bot_settlement_h2');
  const beforeTreasury = await treasuryStore.getTreasuryWallet(TREASURY);
  await assert.rejects(
    botSettlementStore.settleBotEconomy(room, { human1: 200, bot1: -100, bot2: -100 }, {
      taxRate: 0.03, winnerTeam: 'landlord', baseBet: 100, bidScore: 1, multiplier: 1, spring: false,
    }),
    /treasury_payout_exceeds_reservation/
  );
  assert.equal((await walletStore.getWallet('acct_bot_settlement_h2')).beans, beforeHuman.beans);
  assert.equal((await treasuryStore.getTreasuryWallet(TREASURY)).beans, beforeTreasury.beans);
  const quota = await botStatsStore.getReservation(room.quotaReservationIds.acct_bot_settlement_h2);
  assert.equal(quota.status, 'active');
});
