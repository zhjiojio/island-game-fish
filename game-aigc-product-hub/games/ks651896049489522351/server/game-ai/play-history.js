function resetPlayActionHistory (room) {
  if (!room) return;
  room.playActionHistory = [];
  room.playActionSeq = 0;
}

function appendPlayAction (room, { playerId, type, cards = [], playType = null }) {
  if (!room || !playerId || !['play', 'pass'].includes(type)) {
    throw new Error('game-ai: 出牌历史参数非法');
  }
  if (!Array.isArray(room.playActionHistory)) room.playActionHistory = [];
  room.playActionSeq = Number(room.playActionSeq || 0) + 1;
  const ranks = type === 'play'
    ? cards.map(card => Number(card.rank)).filter(Number.isInteger).sort((a, b) => a - b)
    : [];
  room.playActionHistory.push(Object.freeze({
    seq: room.playActionSeq,
    playerId,
    type,
    ranks: Object.freeze(ranks),
    playType: type === 'play' ? (playType || null) : null,
  }));
}

module.exports = { resetPlayActionHistory, appendPlayAction };
