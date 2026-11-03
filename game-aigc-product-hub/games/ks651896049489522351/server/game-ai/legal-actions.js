const { sortCards } = require('../cards');
const { analyzePlay, canBeat } = require('../rules');

function combinations (items, count, start = 0, prefix = [], output = []) {
  if (prefix.length === count) {
    output.push(prefix.slice());
    return output;
  }
  const remaining = count - prefix.length;
  for (let i = start; i <= items.length - remaining; i++) {
    prefix.push(items[i]);
    combinations(items, count, i + 1, prefix, output);
    prefix.pop();
  }
  return output;
}

// 牌面相同的花色对 DouZero 和斗地主规则都等价。按点数枚举带牌，
// 避免先产生大量花色组合、再在 addCandidate 中去重。
function rankCardCombinations (cards, count) {
  const groups = groupByRank(cards);
  const output = [];
  function visit (index, remaining, selected) {
    if (remaining === 0) {
      output.push(selected.slice());
      return;
    }
    if (index >= groups.length) return;
    const availableAfter = groups.slice(index + 1).reduce((sum, group) => sum + group.cards.length, 0);
    const group = groups[index];
    for (let take = 0; take <= Math.min(group.cards.length, remaining); take++) {
      if (remaining - take > availableAfter) continue;
      visit(index + 1, remaining - take, selected.concat(group.cards.slice(0, take)));
    }
  }
  visit(0, count, []);
  return output;
}

function actionKey (cards) {
  return cards.map(card => Number(card.rank)).sort((a, b) => a - b).join('|');
}

function groupByRank (hand) {
  const map = new Map();
  for (const card of sortCards(hand || [])) {
    if (!map.has(card.rank)) map.set(card.rank, []);
    map.get(card.rank).push(card);
  }
  return [...map.entries()]
    .map(([rank, cards]) => ({ rank, cards: cards.slice().sort((a, b) => a.id.localeCompare(b.id)) }))
    .sort((a, b) => a.rank - b.rank);
}

function addCandidate (output, seen, cards, previous) {
  if (!cards || cards.length === 0) return;
  const analysis = analyzePlay(cards);
  if (!analysis || !canBeat(analysis, previous || null)) return;
  const key = actionKey(cards);
  if (seen.has(key)) return;
  seen.add(key);
  output.push({ type: 'playCards', cardIds: sortCards(cards).map(card => card.id), cards: sortCards(cards), analysis });
}

function enumerateChains (groups, eachCount, minimumLength, previous, output, seen) {
  const valid = groups.filter(group => group.rank < 15 && group.cards.length >= eachCount);
  for (let start = 0; start < valid.length; start++) {
    for (let end = start + minimumLength; end <= valid.length; end++) {
      const chain = valid.slice(start, end);
      if (chain.some((group, index) => index > 0 && group.rank !== chain[index - 1].rank + 1)) break;
      addCandidate(output, seen, chain.flatMap(group => group.cards.slice(0, eachCount)), previous);
    }
  }
}

function enumerateCorePlays (hand, previous) {
  const output = [];
  const seen = new Set();
  const groups = groupByRank(hand);

  addCandidate(output, seen, hand, previous);
  for (const group of groups) {
    for (let count = 1; count <= Math.min(4, group.cards.length); count++) {
      addCandidate(output, seen, group.cards.slice(0, count), previous);
    }
  }

  enumerateChains(groups, 1, 5, previous, output, seen);
  enumerateChains(groups, 2, 3, previous, output, seen);
  enumerateChains(groups, 3, 2, previous, output, seen);

  const triples = groups.filter(group => group.cards.length >= 3);
  const wingSingles = groups;
  const wingPairs = groups.filter(group => group.cards.length >= 2);
  for (const triple of triples) {
    for (const wing of wingSingles) {
      if (wing.rank !== triple.rank) addCandidate(output, seen, triple.cards.slice(0, 3).concat(wing.cards[0]), previous);
    }
    for (const wing of wingPairs) {
      if (wing.rank !== triple.rank) addCandidate(output, seen, triple.cards.slice(0, 3).concat(wing.cards.slice(0, 2)), previous);
    }
  }

  const tripleGroups = groups.filter(group => group.rank < 15 && group.cards.length >= 3);
  for (let start = 0; start < tripleGroups.length; start++) {
    for (let end = start + 2; end <= tripleGroups.length; end++) {
      const chain = tripleGroups.slice(start, end);
      if (chain.some((group, index) => index > 0 && group.rank !== chain[index - 1].rank + 1)) break;
      const coreRanks = new Set(chain.map(group => group.rank));
      const core = chain.flatMap(group => group.cards.slice(0, 3));
      addCandidate(output, seen, core, previous);

      const remaining = hand.filter(card => !coreRanks.has(card.rank));
      for (const wings of rankCardCombinations(remaining, chain.length)) {
        addCandidate(output, seen, core.concat(wings), previous);
      }
      const remainingPairs = groups.filter(group => !coreRanks.has(group.rank) && group.cards.length >= 2);
      for (const pairWings of combinations(remainingPairs, chain.length)) {
        addCandidate(output, seen, core.concat(pairWings.flatMap(group => group.cards.slice(0, 2))), previous);
      }
    }
  }

  const bombs = groups.filter(group => group.cards.length === 4);
  for (const bomb of bombs) {
    addCandidate(output, seen, bomb.cards, previous);
    const otherCards = hand.filter(card => card.rank !== bomb.rank);
    for (const wings of rankCardCombinations(otherCards, 2)) addCandidate(output, seen, bomb.cards.concat(wings), previous);
    const pairs = wingPairs.filter(group => group.rank !== bomb.rank);
    for (const pairWings of combinations(pairs, 2)) {
      addCandidate(output, seen, bomb.cards.concat(pairWings.flatMap(group => group.cards.slice(0, 2))), previous);
    }
  }

  const smallJoker = hand.find(card => card.rank === 16);
  const bigJoker = hand.find(card => card.rank === 17);
  if (smallJoker && bigJoker) addCandidate(output, seen, [smallJoker, bigJoker], previous);

  return output;
}

function enumerateLegalActions (observation) {
  if (!observation || !observation.self) return [];
  if (observation.phase === 'bidding') {
    const highest = Number(observation.publicState.bidState?.highestScore || 0);
    const actions = [{ type: 'bid', score: 0, cardIds: [] }];
    for (let score = highest + 1; score <= 3; score++) actions.push({ type: 'bid', score, cardIds: [] });
    return actions;
  }
  if (observation.phase !== 'playing') return [];

  const lastPlay = observation.publicState.lastPlay;
  const isLeading = !lastPlay || lastPlay.playerId === observation.self.playerId;
  const previous = isLeading ? null : lastPlay.analysis;
  const actions = enumerateCorePlays(observation.self.hand, previous);
  if (!isLeading) actions.push({ type: 'pass', score: 0, cardIds: [] });
  return actions;
}

module.exports = { enumerateLegalActions, groupByRank, enumerateCorePlays };
