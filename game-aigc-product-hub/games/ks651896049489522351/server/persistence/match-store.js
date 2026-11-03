const { getDb, transaction, jsonStringify } = require('./db');

function nowMs () {
  return Date.now();
}

function createMatchId (roomId, roundNo) {
  return `m_${roomId}_${roundNo}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEventId (matchId, seq) {
  return `evt_${matchId || 'no_match'}_${seq}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createMatch (room, players) {
  const roundNo = room.round.number;
  const matchId = createMatchId(room.id, roundNo);
  const now = nowMs();
  await transaction(async () => {
    await getDb().run(`
      ${getDb().insertIgnoreKeyword} INTO game_matches (
        match_id, room_id, round_no, status, player_ids_json, account_ids_json,
        base_bet, has_bots, human_count, bot_count, bot_mode, bot_strategy_version,
        started_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'started', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      matchId,
      room.id,
      roundNo,
      jsonStringify(players.map(p => p.id)),
      jsonStringify(players.map(p => p.accountId)),
      room.round.baseScore || 0,
      room.hasBots ? 1 : 0,
      players.filter(p => !p.isBot).length,
      players.filter(p => p.isBot).length,
      room.botMode || null,
      room.botStrategyVersion || null,
      now,
      now,
      now,
    ]);
    for (const player of players) {
      await getDb().run(`
        ${getDb().insertIgnoreKeyword} INTO game_match_participants (
          match_id, player_id, account_id, seat, role, is_bot,
          controller_type, persona_id, joined_at, created_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
      `, [
        matchId,
        player.id,
        player.accountId,
        player.seat,
        player.isBot ? 1 : 0,
        player.controllerType || (player.isBot ? 'bot' : 'human'),
        player.personaId || null,
        player.joinedAt || now,
        now,
      ]);
    }
  });
  return matchId;
}

async function appendMatchEvent (room, eventType, payload = {}, actor = null) {
  const matchId = room.matchId || null;
  const previousSeq = room.eventSeq;
  const seq = previousSeq + 1;
  const actorPlayerId = actor?.id || payload.actorId || payload.playerId || null;
  const actorAccountId = actor?.accountId || null;
  room.eventSeq = seq;
  try {
    await transaction(async () => {
      await getDb().run(`
        ${getDb().insertIgnoreKeyword} INTO game_match_events (
          event_id, match_id, room_id, round_no, seq, event_type,
          actor_player_id, actor_account_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        createEventId(matchId, seq),
        matchId,
        room.id,
        room.round?.number || 0,
        seq,
        eventType,
        actorPlayerId,
        actorAccountId,
        jsonStringify(payload),
        nowMs(),
      ]);
    });
  } catch (err) {
    room.eventSeq = previousSeq;
    throw err;
  }
}

async function updateParticipantRoles (room, rolesByPlayerId = null) {
  if (!room.matchId) return;
  await transaction(async () => {
    for (const player of Object.values(room.players || {})) {
      const role = rolesByPlayerId && Object.prototype.hasOwnProperty.call(rolesByPlayerId, player.id)
        ? rolesByPlayerId[player.id]
        : player.role;
      await getDb().run(`
        UPDATE game_match_participants SET role = ?
        WHERE match_id = ? AND player_id = ?
      `, [role || null, room.matchId, player.id]);
    }
  });
}

async function recordLandlordAssignment (room, options = {}) {
  const previousSeq = room.eventSeq;
  try {
    await transaction(async () => {
      await appendMatchEvent(room, 'bid', options.bidPayload || {}, options.bidActor || null);
      await updateParticipantRoles(room, options.rolesByPlayerId || null);
      await appendMatchEvent(room, 'landlord_assigned', options.landlordPayload || {}, options.landlordActor || null);
    });
  } catch (err) {
    room.eventSeq = previousSeq;
    throw err;
  }
}

async function recordGameStart (room, options = {}) {
  const previousSeq = room.eventSeq;
  try {
    await transaction(async () => {
      await appendMatchEvent(room, 'double', options.doublePayload || {}, options.actor || null);
      await updateParticipantRoles(room, options.rolesByPlayerId || null);
      await appendMatchEvent(room, 'game_began', options.gamePayload || {}, options.actor || null);
    });
  } catch (err) {
    room.eventSeq = previousSeq;
    throw err;
  }
}

async function settleMatch (room, result) {
  if (!room.matchId) return;
  const now = nowMs();
  await transaction(async () => {
    await getDb().run(`
      UPDATE game_matches
      SET status = 'settled',
          dealer_player_id = ?,
          winner_team = ?,
          winner_ids_json = ?,
          base_bet = ?,
          bid_score = ?,
          multiplier = ?,
          spring = ?,
          requested_deltas_json = ?,
          deltas_json = ?,
          balances_json = ?,
          config_version = ?,
          multiplier_breakdown_json = ?,
          settled_at = ?,
          updated_at = ?
      WHERE match_id = ?
    `, [
      room.dealer || null,
      result.winnerTeam || null,
      jsonStringify(result.winnerIds || []),
      result.baseBet || 0,
      result.bidScore || 0,
      result.multiplier || 1,
      result.spring ? 1 : 0,
      jsonStringify(result.requestedDeltas || {}),
      jsonStringify(result.deltas || {}),
      jsonStringify(result.balances || {}),
      Number(room.configVersion || 0),
      result.multiplierBreakdown ? jsonStringify(result.multiplierBreakdown) : null,
      now,
      now,
      room.matchId,
    ]);

    // 结构化结算列：台费(抽水)/税前输赢/税后净变化/结算后余额（checklist：牌局结果表）
    const taxByPlayer = result.taxDeltas || {};
    const grossByPlayer = result.grossDeltas || {};
    const netByPlayer = result.deltas || {};
    const afterByPlayer = result.balances || {};
    const playerIds = new Set([
      ...Object.keys(netByPlayer),
      ...Object.keys(afterByPlayer),
    ]);
    for (const pid of playerIds) {
      const net = netByPlayer[pid] != null ? Number(netByPlayer[pid]) : null;
      const after = afterByPlayer[pid] != null ? Number(afterByPlayer[pid]) : null;
      // 胜负：按角色与胜方阵营判定（landlord/farmers → win/lose）
      const role = room.players[pid]?.role || null;
      const winResult = result.winnerTeam && role
        ? ((result.winnerTeam === 'landlord' && role === 'landlord') ||
           (result.winnerTeam === 'farmers' && role === 'farmer') ? 'win' : 'lose')
        : null;
      // 台费：开局收取的入场费（room.entryFees，amount 为负记账值，落库取绝对值）
      const entryFee = room.entryFees?.[room.players[pid]?.accountId]?.amount;
      await getDb().run(`
        UPDATE game_match_participants
        SET tax_amount = ?, gross_delta = ?, net_delta = ?, balance_after = ?,
            room_type = ?, win_result = ?, entry_fee_beans = ?, balance_before = ?
        WHERE match_id = ? AND player_id = ?
      `, [
        taxByPlayer[pid] != null ? Number(taxByPlayer[pid]) : null,
        grossByPlayer[pid] != null ? Number(grossByPlayer[pid]) : null,
        net,
        after,
        room.roomType || null,
        winResult,
        entryFee != null ? Math.abs(Number(entryFee)) : null,
        (after != null && net != null) ? after - net : null,
        room.matchId,
        pid,
      ]);
    }
  });
}

async function recordSettlement (room, result, actor = null) {
  const previousSeq = room.eventSeq;
  try {
    await transaction(async () => {
      await settleMatch(room, result);
      await appendMatchEvent(room, 'settlement', result, actor);
    });
  } catch (err) {
    room.eventSeq = previousSeq;
    throw err;
  }
}

module.exports = {
  createMatch,
  updateParticipantRoles,
  appendMatchEvent,
  recordLandlordAssignment,
  recordGameStart,
  settleMatch,
  recordSettlement,
};
