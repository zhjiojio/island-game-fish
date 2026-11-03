const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
const RANK_LABELS = { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' };

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 3; rank <= 15; rank++) {
      deck.push({ id: `${suit}-${rank}`, suit, rank, label: RANK_LABELS[rank] });
    }
  }
  deck.push({ id: 'joker-16', suit: 'joker', rank: 16, label: RANK_LABELS[16] });
  deck.push({ id: 'joker-17', suit: 'joker', rank: 17, label: RANK_LABELS[17] });
  return deck;
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sortCards(cards) {
  return [...cards].sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
}

function removeCards(hand, ids) {
  const remaining = [...hand];
  const selected = [];
  for (const id of ids) {
    const idx = remaining.findIndex(c => c.id === id);
    if (idx < 0) return null;
    selected.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return selected;
}

module.exports = { createDeck, shuffle, sortCards, removeCards };