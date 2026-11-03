const PLAY_LABELS = {
  single: '单张', pair: '对子', triple: '三张',
  'triple-single': '三带一', 'triple-pair': '三带二',
  straight: '顺子', 'pair-straight': '连对',
  airplane: '飞机', 'airplane-singles': '飞机带单', 'airplane-pairs': '飞机带对',
  'four-two-singles': '四带二', 'four-two-pairs': '四带两对',
  bomb: '炸弹', rocket: '火箭',
};

function rankGroups(cards) {
  const counts = new Map();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
  return [...counts.entries()]
    .map(([r, ct]) => ({ rank: r, count: ct }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);
}

function isConsecutive(ranks) {
  if (ranks.some(r => r >= 15)) return false;
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return false;
  }
  return true;
}

function consecutiveSlices(ranks) {
  const valid = ranks.filter(r => r < 15).sort((a, b) => a - b);
  const slices = [];
  let start = 0;
  for (let i = 1; i <= valid.length; i++) {
    if (i === valid.length || valid[i] !== valid[i - 1] + 1) {
      const run = valid.slice(start, i);
      for (let len = run.length; len >= 2; len--) {
        for (let offset = 0; offset + len <= run.length; offset++) {
          slices.push(run.slice(offset, offset + len));
        }
      }
      start = i;
    }
  }
  return slices.sort((a, b) => b.length - a.length || b[b.length - 1] - a[a.length - 1]);
}

function analyzePlay(cards) {
  if (!cards || cards.length === 0) return null;
  const groups = rankGroups(cards);
  const counts = groups.map(g => g.count).sort((a, b) => b - a);
  const ranks = groups.map(g => g.rank).sort((a, b) => a - b);
  const len = cards.length;

  // rocket
  if (len === 2 && ranks.includes(16) && ranks.includes(17)) {
    return { type: 'rocket', rank: 17, length: len, label: PLAY_LABELS.rocket };
  }
  // bomb
  if (len === 4 && groups.length === 1) {
    return { type: 'bomb', rank: groups[0].rank, length: len, label: PLAY_LABELS.bomb };
  }
  // single
  if (len === 1) return { type: 'single', rank: ranks[0], length: len, label: PLAY_LABELS.single };
  // pair
  if (len === 2 && groups.length === 1) return { type: 'pair', rank: ranks[0], length: len, label: PLAY_LABELS.pair };
  // triple
  if (len === 3 && groups.length === 1) return { type: 'triple', rank: ranks[0], length: len, label: PLAY_LABELS.triple };
  // triple-single
  if (len === 4 && counts[0] === 3) {
    const r = groups.find(g => g.count === 3).rank;
    return { type: 'triple-single', rank: r, length: len, label: PLAY_LABELS['triple-single'] };
  }
  // triple-pair
  if (len === 5 && counts[0] === 3 && counts[1] === 2) {
    const r = groups.find(g => g.count === 3).rank;
    return { type: 'triple-pair', rank: r, length: len, label: PLAY_LABELS['triple-pair'] };
  }
  // straight
  if (len >= 5 && groups.every(g => g.count === 1) && isConsecutive(ranks)) {
    return { type: 'straight', rank: ranks[ranks.length - 1], length: len, chainLength: ranks.length, label: PLAY_LABELS.straight };
  }
  // pair-straight
  if (len >= 6 && len % 2 === 0 && groups.every(g => g.count === 2) && isConsecutive(ranks)) {
    return { type: 'pair-straight', rank: ranks[ranks.length - 1], length: len, chainLength: ranks.length, label: PLAY_LABELS['pair-straight'] };
  }
  // airplane variants
  const triples = groups.filter(g => g.count === 3).map(g => g.rank).sort((a, b) => a - b);
  if (triples.length >= 2) {
    const chains = consecutiveSlices(triples);
    for (const chain of chains) {
      const n = chain.length;
      const mainRank = chain[chain.length - 1];
      if (len === n * 3) {
        return { type: 'airplane', rank: mainRank, length: len, chainLength: n, label: PLAY_LABELS.airplane };
      }
      // airplane-singles: count non-chain cards
      const chainRanks = new Set(chain);
      const extra = groups.reduce((sum, g) => sum + (chainRanks.has(g.rank) ? Math.max(0, g.count - 3) : g.count), 0);
      if (len === n * 4 && extra === n) {
        return { type: 'airplane-singles', rank: mainRank, length: len, chainLength: n, label: PLAY_LABELS['airplane-singles'] };
      }
      // airplane-pairs
      const pairExtra = groups.filter(g => !chainRanks.has(g.rank) && g.count === 2).length;
      if (len === n * 5 && pairExtra === n) {
        return { type: 'airplane-pairs', rank: mainRank, length: len, chainLength: n, label: PLAY_LABELS['airplane-pairs'] };
      }
    }
  }
  // four-two-singles
  if (len === 6 && counts[0] === 4) {
    const r = groups.find(g => g.count === 4).rank;
    return { type: 'four-two-singles', rank: r, length: len, label: PLAY_LABELS['four-two-singles'] };
  }
  // four-two-pairs
  if (len === 8 && counts[0] === 4 && groups.filter(g => g.count === 2).length === 2) {
    const r = groups.find(g => g.count === 4).rank;
    return { type: 'four-two-pairs', rank: r, length: len, label: PLAY_LABELS['four-two-pairs'] };
  }
  return null;
}

function canBeat(candidate, previous) {
  if (!previous) return true;
  if (candidate.type === 'rocket') return previous.type !== 'rocket';
  if (previous.type === 'rocket') return false;
  if (candidate.type === 'bomb' && previous.type !== 'bomb') return true;
  if (previous.type === 'bomb' && candidate.type !== 'bomb') return false;
  if (candidate.type !== previous.type) return false;
  if (candidate.length !== previous.length) return false;
  if ((candidate.chainLength || 0) !== (previous.chainLength || 0)) return false;
  return candidate.rank > previous.rank;
}

function isMultiplierPlay(play) {
  return play.type === 'bomb' || play.type === 'rocket';
}

module.exports = { analyzePlay, canBeat, isMultiplierPlay };