const MIN_RANK = 3;
const MAX_RANK = 17;
const RANK_COUNT = MAX_RANK - MIN_RANK + 1;
const MAX_HAND_SIZE = 20;

function validateHand (hand) {
  if (!Array.isArray(hand)) throw new TypeError('hand_strength_invalid_hand');
  if (hand.length > MAX_HAND_SIZE) throw new RangeError('hand_strength_too_many_cards');
  const counts = Array(RANK_COUNT).fill(0);
  const ids = new Set();
  for (const card of hand) {
    const rank = Number(card?.rank);
    if (!Number.isInteger(rank) || rank < MIN_RANK || rank > MAX_RANK) {
      throw new RangeError('hand_strength_invalid_rank');
    }
    counts[rank - MIN_RANK] += 1;
    const maximum = rank >= 16 ? 1 : 4;
    if (counts[rank - MIN_RANK] > maximum) throw new RangeError('hand_strength_invalid_rank_count');
    if (card?.id) {
      if (ids.has(card.id)) throw new RangeError('hand_strength_duplicate_card_id');
      ids.add(card.id);
    }
  }
  return counts;
}

function rankIndex (rank) {
  return rank - MIN_RANK;
}

function countCards (counts) {
  return counts.reduce((sum, count) => sum + count, 0);
}

function stateKey (counts) {
  return counts.join('');
}

function subtractPattern (counts, patternCounts) {
  const next = counts.map((count, index) => count - patternCounts[index]);
  return next.some(count => count < 0) ? null : next;
}

function patternFromRanks (ranks) {
  const counts = Array(RANK_COUNT).fill(0);
  for (const rank of ranks) counts[rankIndex(rank)] += 1;
  return counts;
}

function cardsFromCounts (counts) {
  const cards = [];
  for (let index = 0; index < counts.length; index++) {
    const rank = index + MIN_RANK;
    for (let offset = 0; offset < counts[index]; offset++) {
      cards.push({ id: `strength-${rank}-${offset}`, suit: 'strength', rank, label: String(rank) });
    }
  }
  return cards;
}

module.exports = {
  MIN_RANK,
  MAX_RANK,
  RANK_COUNT,
  MAX_HAND_SIZE,
  validateHand,
  rankIndex,
  countCards,
  stateKey,
  subtractPattern,
  patternFromRanks,
  cardsFromCounts,
};
