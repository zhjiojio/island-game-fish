function clamp (value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function evaluateV1 (hand) {
  const cards = hand || [];
  const groups = new Map();
  for (const card of cards) {
    const rank = Number(card.rank);
    groups.set(rank, (groups.get(rank) || 0) + 1);
  }
  let score = 0;
  if (groups.has(16)) score += 2.2;
  if (groups.has(17)) score += 3;
  score += (groups.get(15) || 0) * 0.9;
  score += (groups.get(14) || 0) * 0.45;
  score += [...groups.values()].filter(count => count === 4).length * 4;
  score += [...groups.values()].filter(count => count === 3).length * 1.15;
  score += [...groups.values()].filter(count => count === 2).length * 0.32;
  score -= [...groups.entries()].filter(([rank, count]) => count === 1 && rank < 11).length * 0.2;
  return clamp(score / 14, 0, 1);
}

function resultV1 (hand, diagnostics = {}) {
  return {
    version: 'hand-strength-v1',
    score: evaluateV1(hand),
    features: { cardCount: (hand || []).length },
    diagnostics: {
      exact: true,
      exploredStates: 0,
      fallbackApplied: false,
      fallbackReason: null,
      ...diagnostics,
    },
  };
}

module.exports = { evaluateV1, resultV1 };
