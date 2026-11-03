const { getDb, transaction, jsonStringify } = require('./db');
const walletStore = require('./wallet-store');
const botStatsStore = require('./bot-stats-store');
const treasuryStore = require('./treasury-store');
const logger = require('../logger');

function participantDeltas (participants, requestedDeltas, availableById, taxRate) {
  const winnerIds = participants.filter(p => (requestedDeltas[p.id] || 0) > 0).map(p => p.id);
  const loserIds = participants.filter(p => (requestedDeltas[p.id] || 0) < 0).map(p => p.id);
  const deltas = {};
  let totalLost = 0;
  for (const id of loserIds) {
    const actual = Math.min(Math.abs(requestedDeltas[id] || 0), Math.max(0, Number(availableById[id] || 0)));
    deltas[id] = -actual;
    totalLost += actual;
  }
  const totalRequestedWin = winnerIds.reduce((sum, id) => sum + Math.max(0, requestedDeltas[id] || 0), 0) || 1;
  const grossDeltas = { ...deltas };
  const taxDeltas = {};
  let remaining = totalLost;
  let taxTotal = 0;
  winnerIds.forEach((id, index) => {
    const gross = index === winnerIds.length - 1
      ? remaining
      : Math.floor(totalLost * Math.max(0, requestedDeltas[id] || 0) / totalRequestedWin);
    const tax = Math.floor(gross * taxRate);
    grossDeltas[id] = gross;
    taxDeltas[id] = -tax;
    deltas[id] = gross - tax;
    remaining -= gross;
    taxTotal += tax;
  });
  return { deltas, grossDeltas, taxDeltas, taxTotal, winnerIds, loserIds };
}

async function applyHumanDeltaInTransaction (player, delta, room, meta) {
  return walletStore.applyWalletDelta(player.accountId, delta, delta >= 0 ? 'game_win' : 'game_lose', {
    roomId: room.id,
    roundNo: room.round.number,
    matchId: room.matchId,
    allowCreate: false,
    idempotencyKey: `bot_settlement:${room.matchId}:${room.round.number}:${player.accountId}`,
    meta,
  });
}

async function settleBotEconomy (room, requestedDeltas, options = {}) {
  const participants = Object.values(room.players || {});
  const humans = participants.filter(p => !p.isBot).sort((a, b) => a.accountId.localeCompare(b.accountId));
  const bots = participants.filter(p => p.isBot);
  const balances = {};
  const wallets = {};
  let calculated;
  let botTreasuryDelta = 0;

  await transaction(async () => {
    const availableById = {};
    for (const bot of bots) availableById[bot.id] = Math.max(0, Number(bot.beans || 0));
    for (const human of humans) {
      const wallet = await walletStore.getWalletForUpdate(human.accountId);
      if (!wallet) throw new Error(`bot_settlement_wallet_not_found:${human.accountId}`);
      availableById[human.id] = wallet.availableBeans;
    }

    calculated = participantDeltas(participants, requestedDeltas, availableById, Number(options.taxRate || 0));
    botTreasuryDelta = bots.reduce((sum, bot) => sum + Number(calculated.deltas[bot.id] || 0), 0);
    const humanDeltaTotal = humans.reduce((sum, human) => sum + Number(calculated.deltas[human.id] || 0), 0);
    if (humanDeltaTotal + botTreasuryDelta + calculated.taxTotal !== 0) {
      throw new Error(`bot_settlement_conservation_failed:${humanDeltaTotal}+${botTreasuryDelta}+${calculated.taxTotal}`);
    }

    for (const human of humans) {
      const delta = Number(calculated.deltas[human.id] || 0);
      const ret = await applyHumanDeltaInTransaction(human, delta, room, {
        roomType: room.roomType,
        botMode: room.botMode,
        grossDelta: calculated.grossDeltas[human.id] || delta,
        taxDelta: calculated.taxDeltas[human.id] || 0,
        taxRate: Number(options.taxRate || 0),
      });
      wallets[human.id] = ret.wallet;
      balances[human.id] = ret.wallet.beans;
    }
    await treasuryStore.settleTreasuryExposureInTransaction(room.treasuryReservationId, {
      actualTreasuryDelta: botTreasuryDelta,
      roundNo: room.round.number,
    });
    for (const human of humans) {
      const reservationId = room.quotaReservationIds?.[human.accountId];
      if (!reservationId) throw new Error(`bot_quota_reservation_missing:${human.accountId}`);
      await botStatsStore.settleBotQuotaInTransaction(reservationId, {
        netGain: Number(calculated.deltas[human.id] || 0),
      });
    }
    const settledAt = Date.now();
    await getDb().run(`
      UPDATE game_matches
      SET status = 'settled', dealer_player_id = ?, winner_team = ?,
          winner_ids_json = ?, base_bet = ?, bid_score = ?, multiplier = ?,
          spring = ?, requested_deltas_json = ?, deltas_json = ?, balances_json = ?,
          config_version = ?, settled_at = ?, updated_at = ?
      WHERE match_id = ? AND status = 'started'
    `, [
      room.dealer || null,
      options.winnerTeam || null,
      jsonStringify(calculated.winnerIds),
      options.baseBet || 0,
      options.bidScore || 0,
      options.multiplier || 1,
      options.spring ? 1 : 0,
      jsonStringify(requestedDeltas),
      jsonStringify(calculated.deltas),
      jsonStringify(balances),
      Number(room.configVersion || 0),
      settledAt, settledAt, room.matchId,
    ]);
  });

  for (const human of humans) {
    const wallet = wallets[human.id];
    human.beans = wallet.beans;
    human.frozenBeans = wallet.frozenBeans || 0;
    human.availableBeans = wallet.availableBeans;
  }
  for (const bot of bots) {
    bot.beans = Math.max(0, Number(bot.beans || 0) + Number(calculated.deltas[bot.id] || 0));
    bot.availableBeans = bot.beans;
    balances[bot.id] = bot.beans;
  }
  for (const player of participants) {
    const delta = Number(calculated.deltas[player.id] || 0);
    player.roundDelta = (player.roundDelta || 0) + delta;
    player.totalDelta = (player.totalDelta || 0) + delta;
    player.ready = false;
  }

  // 触底线 / 余额天花板检查（配置：bot.floor_beans / bot.ceiling_beans）。
  // 仅告警不自动改余额——超限后的处理规则（停运/蒸发）待产品确认。
  try {
    const { getTreasuryWallet } = require('./treasury-store');
    const { getEffectiveSync } = require('./config-store');
    const botCfg = getEffectiveSync().effective.bot;
    const treasury = await getTreasuryWallet(`system::bot_treasury::${room.roomType}`);
    const beans = Number(treasury?.beans || 0);
    if (beans < botCfg.floorBeans) {
      logger.warn(`[bot-settlement] 国库余额 ${beans} 低于触底线 ${botCfg.floorBeans}（${room.roomType}），请运营关注`);
    } else if (beans > botCfg.ceilingBeans) {
      logger.warn(`[bot-settlement] 国库余额 ${beans} 超过天花板 ${botCfg.ceilingBeans}（${room.roomType}），请运营关注`);
    }
  } catch (checkErr) {
    logger.error('[bot-settlement] 触底线/天花板检查失败:', checkErr.message);
  }
  return { ...calculated, balances, botTreasuryDelta };
}

module.exports = { participantDeltas, settleBotEconomy };
