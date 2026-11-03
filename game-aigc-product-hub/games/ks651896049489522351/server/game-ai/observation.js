const { sortCards } = require('../cards');

function cloneCards (cards) {
  return sortCards(cards || []).map(card => ({
    id: card.id,
    suit: card.suit,
    rank: card.rank,
    label: card.label,
  }));
}

function clonePlayActionHistory (history) {
  return (history || []).map(entry => Object.freeze({
    seq: Number(entry.seq || 0),
    playerId: String(entry.playerId || ''),
    type: entry.type,
    ranks: Object.freeze([...(entry.ranks || [])].map(Number)),
    playType: entry.playType || null,
  }));
}

function buildObservation (room, playerId) {
  const player = room && room.players ? room.players[playerId] : null;
  if (!room || !player) throw new Error('game-ai: 无法为未知玩家构造观察');
  const hand = cloneCards((room.hands && room.hands[playerId]) || []);
  const lastPlay = room.lastPlay
    ? {
        playerId: room.lastPlay.playerId,
        cards: cloneCards(room.lastPlay.cards || []),
        analysis: room.lastPlay.analysis ? { ...room.lastPlay.analysis } : null,
      }
    : null;
  return Object.freeze({
    phase: room.phase,
    self: Object.freeze({
      playerId,
      seat: player.seat,
      role: player.role || null,
      hand: Object.freeze(hand),
      handCount: hand.length,
    }),
    publicState: Object.freeze({
      seats: Object.freeze([...(room.seats || [])]),
      dealer: room.dealer || null,
      currentPlayerId: room.currentPlayerId || null,
      doublingPlayerId: room.doublingPlayerId || null,
      bidState: room.bidState ? Object.freeze({
        currentPlayerId: room.bidState.currentPlayerId || null,
        highestScore: Number(room.bidState.highestScore || 0),
        highestPlayerId: room.bidState.highestPlayerId || null,
        firstCallerId: room.bidState.firstCallerId || null,
        phase: room.bidState.phase || 'calling',
        bidMultiplier: Number(room.bidState.bidMultiplier || 1),
        turns: Number(room.bidState.turns || 0),
        passed: Object.freeze([...(room.bidState.passed || [])]),
      }) : null,
      lastPlay,
      handCounts: Object.freeze({ ...(room.handCounts || {}) }),
      landlordCardsVisible: room.landlordCardsVisible ? Object.freeze(cloneCards(room.landlordCardsVisible)) : Object.freeze([]),
      multiplier: Number((room.round && room.round.multiplier) || 1),
      roundNo: Number(room.round?.number || room.roundNo || 0),
      playActionHistory: Object.freeze(clonePlayActionHistory(room.playActionHistory)),
      roles: Object.freeze(Object.fromEntries(
        Object.entries(room.players || {}).map(([id, p]) => [id, p.role || null])
      )),
    }),
  });
}

module.exports = { buildObservation };
