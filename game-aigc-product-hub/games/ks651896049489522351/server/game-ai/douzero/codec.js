const DOUZERO_POSITIONS = Object.freeze(['landlord', 'landlord_down', 'landlord_up']);
const VALID_DOUZERO_RANKS = new Set([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 20, 30]);

function toDouzeroRank (rank) {
  const value = Number(rank);
  if (value >= 3 && value <= 14) return value;
  if (value === 15) return 17;
  if (value === 16) return 20;
  if (value === 17) return 30;
  throw new Error(`douzero_invalid_rank:${rank}`);
}

function toDouzeroRanks (cardsOrRanks) {
  return (cardsOrRanks || [])
    .map(item => toDouzeroRank(typeof item === 'object' ? item.rank : item))
    .sort((a, b) => a - b);
}

function assertDouzeroRanks (ranks) {
  if (!Array.isArray(ranks) || ranks.some(rank => !VALID_DOUZERO_RANKS.has(Number(rank)))) {
    throw new Error('douzero_invalid_encoded_cards');
  }
}

function buildPositionMaps (publicState, actorId) {
  const seats = publicState?.seats || [];
  const landlordId = publicState?.dealer;
  if (seats.length !== 3 || !landlordId || !seats.includes(landlordId) || !seats.includes(actorId)) {
    throw new Error('douzero_invalid_seats');
  }
  const landlordSeat = seats.indexOf(landlordId);
  const playerToPosition = new Map([
    [seats[landlordSeat], 'landlord'],
    [seats[(landlordSeat + 1) % 3], 'landlord_down'],
    [seats[(landlordSeat + 2) % 3], 'landlord_up'],
  ]);
  const positionToPlayer = Object.fromEntries([...playerToPosition].map(([id, position]) => [position, id]));
  return {
    position: playerToPosition.get(actorId),
    playerToPosition,
    positionToPlayer,
  };
}

function rankSignature (ranks) {
  return ranks.slice().sort((a, b) => a - b).join(',');
}

function actionRanks (action, handById) {
  if (action.type === 'pass') return [];
  const cards = Array.isArray(action.cards) && action.cards.length
    ? action.cards
    : (action.cardIds || []).map(id => handById.get(id)).filter(Boolean);
  if (cards.length !== (action.cardIds || []).length) throw new Error('douzero_candidate_card_missing');
  return toDouzeroRanks(cards);
}

function createCandidateSet (actions, hand) {
  const handById = new Map((hand || []).map(card => [card.id, card]));
  const deduped = new Map();
  for (const action of actions || []) {
    if (!action || !['playCards', 'pass'].includes(action.type)) continue;
    const ranks = actionRanks(action, handById);
    const key = action.type === 'pass' ? 'pass' : `play:${rankSignature(ranks)}`;
    const cardKey = (action.cardIds || []).slice().sort().join('|');
    const previous = deduped.get(key);
    if (!previous || cardKey < previous.cardKey) {
      deduped.set(key, { action, ranks, cardKey });
    }
  }
  const ordered = [...deduped.values()].sort((a, b) => {
    if (a.action.type !== b.action.type) return a.action.type === 'pass' ? -1 : 1;
    if (a.ranks.length !== b.ranks.length) return a.ranks.length - b.ranks.length;
    return rankSignature(a.ranks).localeCompare(rankSignature(b.ranks), 'en', { numeric: true });
  });
  const candidates = [];
  const candidateMap = new Map();
  ordered.forEach((entry, index) => {
    const id = `a${index}`;
    candidates.push(Object.freeze({ id, cards: Object.freeze(entry.ranks.slice()) }));
    candidateMap.set(id, entry.action);
  });
  return { candidates: Object.freeze(candidates), candidateMap };
}

module.exports = {
  DOUZERO_POSITIONS,
  VALID_DOUZERO_RANKS,
  toDouzeroRank,
  toDouzeroRanks,
  assertDouzeroRanks,
  buildPositionMaps,
  createCandidateSet,
};
