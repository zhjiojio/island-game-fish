const { rankIndex } = require('./hand-state');

const STRUCTURED_TYPES = new Set([
  'pair', 'triple', 'triple-single', 'triple-pair', 'straight', 'pair-straight',
  'airplane', 'airplane-singles', 'airplane-pairs', 'bomb', 'rocket',
]);

const LITE_WEIGHTS = Object.freeze({
  intercept: -2,
  turnEfficiency: 2,
  controlPower: 1.8,
  structuredCoverage: 0.9,
  finishingPotential: 0.6,
  weakLooseBurden: -1.5,
  controlBreakPenalty: -0.5,
});

function clamp (value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sigmoid (value) {
  return 1 / (1 + Math.exp(-value));
}

function countCards (counts) {
  return counts.reduce((sum, count) => sum + count, 0);
}

function longestRun (counts, minimumCount, minimumLength) {
  let best = null;
  let start = 0;
  while (start < 12) {
    while (start < 12 && counts[start] < minimumCount) start += 1;
    let end = start;
    while (end < 12 && counts[end] >= minimumCount) end += 1;
    if (end - start >= minimumLength && (!best || end - start > best.length)) {
      best = { start, length: end - start };
    }
    start = end + 1;
  }
  return best;
}

function takeCards (counts, amount, excluded = new Set(), pairsOnly = false) {
  const taken = Array(counts.length).fill(0);
  let remaining = amount;
  const order = [...counts.keys()].sort((left, right) =>
    counts[left] - counts[right] || left - right
  );
  for (const index of order) {
    if (excluded.has(index)) continue;
    if (pairsOnly) {
      if (counts[index] < 2 || remaining < 2) continue;
      taken[index] = 2;
      remaining -= 2;
    } else {
      const take = Math.min(counts[index], remaining);
      taken[index] = take;
      remaining -= take;
    }
    if (remaining === 0) return taken;
  }
  return null;
}

function consume (counts, patternCounts) {
  for (let index = 0; index < counts.length; index++) counts[index] -= patternCounts[index];
}

function patternSummary (type, patternCounts, initialCounts) {
  let controlBreakPenalty = 0;
  for (let index = 0; index < 13; index++) {
    if (initialCounts[index] === 4 && patternCounts[index] > 0 && patternCounts[index] < 4) controlBreakPenalty += 1;
  }
  const jokerUsed = patternCounts[13] > 0 || patternCounts[14] > 0;
  if (initialCounts[13] && initialCounts[14] && type !== 'rocket' && jokerUsed) {
    controlBreakPenalty += 1;
  }
  const cardCount = countCards(patternCounts);
  const rank = patternCounts.findIndex(count => count > 0) + 3;
  return {
    type,
    cardCount,
    controlBreakPenalty,
    weakLooseCards: type === 'single' && rank < 11 ? 1 : 0,
    structuredCards: STRUCTURED_TYPES.has(type) ? cardCount : 0,
    straightCoverage: type === 'straight' ? cardCount : 0,
    pairStraightCoverage: type === 'pair-straight' ? cardCount : 0,
    airplaneCoverage: type.startsWith('airplane') ? cardCount : 0,
  };
}

function addPattern (plan, counts, initialCounts, type, patternCounts) {
  consume(counts, patternCounts);
  const summary = patternSummary(type, patternCounts, initialCounts);
  plan.turns += 1;
  plan.controlBreakPenalty += summary.controlBreakPenalty;
  plan.weakLooseCards += summary.weakLooseCards;
  plan.structuredCards += summary.structuredCards;
  plan.straightCoverage += summary.straightCoverage;
  plan.pairStraightCoverage += summary.pairStraightCoverage;
  plan.airplaneCoverage += summary.airplaneCoverage;
}

function consumeRocket (plan, counts, initialCounts) {
  if (!counts[13] || !counts[14]) return false;
  const pattern = Array(counts.length).fill(0);
  pattern[13] = 1;
  pattern[14] = 1;
  addPattern(plan, counts, initialCounts, 'rocket', pattern);
  return true;
}

function consumeBomb (plan, counts, initialCounts) {
  const index = counts.findIndex((count, rankIndex) => rankIndex < 13 && count === 4);
  if (index < 0) return false;
  const pattern = Array(counts.length).fill(0);
  pattern[index] = 4;
  addPattern(plan, counts, initialCounts, 'bomb', pattern);
  return true;
}

function consumeAirplane (plan, counts, initialCounts, pairWingsFirst) {
  const run = longestRun(counts, 3, 2);
  if (!run) return false;
  const pattern = Array(counts.length).fill(0);
  const excluded = new Set();
  for (let index = run.start; index < run.start + run.length; index++) {
    pattern[index] = 3;
    excluded.add(index);
  }
  const remaining = counts.map((count, index) => count - pattern[index]);
  const pairWings = takeCards(remaining, run.length * 2, excluded, true);
  const singleWings = takeCards(remaining, run.length, excluded, false);
  let type = 'airplane';
  const wings = pairWingsFirst ? pairWings || singleWings : singleWings || pairWings;
  if (wings) {
    for (let index = 0; index < pattern.length; index++) pattern[index] += wings[index];
    type = countCards(wings) === run.length * 2 ? 'airplane-pairs' : 'airplane-singles';
  }
  addPattern(plan, counts, initialCounts, type, pattern);
  return true;
}

function consumeRun (plan, counts, initialCounts, type) {
  const amount = type === 'pair-straight' ? 2 : 1;
  const run = longestRun(counts, amount, type === 'pair-straight' ? 3 : 5);
  if (!run) return false;
  const pattern = Array(counts.length).fill(0);
  for (let index = run.start; index < run.start + run.length; index++) pattern[index] = amount;
  addPattern(plan, counts, initialCounts, type, pattern);
  return true;
}

function consumeTriple (plan, counts, initialCounts, pairFirst) {
  const tripleIndex = counts.findIndex(count => count === 3);
  if (tripleIndex < 0) return false;
  const pattern = Array(counts.length).fill(0);
  pattern[tripleIndex] = 3;
  const remaining = counts.map((count, index) => count - pattern[index]);
  const excluded = new Set([tripleIndex]);
  const pair = takeCards(remaining, 2, excluded, true);
  const single = takeCards(remaining, 1, excluded, false);
  const wing = pairFirst ? pair || single : single || pair;
  let type = 'triple';
  if (wing) {
    for (let index = 0; index < pattern.length; index++) pattern[index] += wing[index];
    type = countCards(wing) === 2 ? 'triple-pair' : 'triple-single';
  }
  addPattern(plan, counts, initialCounts, type, pattern);
  return true;
}

function finishGroups (plan, counts, initialCounts) {
  consumeRocket(plan, counts, initialCounts);
  while (consumeBomb(plan, counts, initialCounts)) {}
  while (consumeTriple(plan, counts, initialCounts, true)) {}
  for (let index = 0; index < counts.length; index++) {
    while (counts[index] >= 2) {
      const pattern = Array(counts.length).fill(0);
      pattern[index] = 2;
      addPattern(plan, counts, initialCounts, 'pair', pattern);
    }
    while (counts[index] > 0) {
      const pattern = Array(counts.length).fill(0);
      pattern[index] = 1;
      addPattern(plan, counts, initialCounts, 'single', pattern);
    }
  }
}

function buildPlan (initialCounts, order, options) {
  const counts = initialCounts.slice();
  const plan = {
    turns: 0,
    controlBreakPenalty: 0,
    weakLooseCards: 0,
    structuredCards: 0,
    straightCoverage: 0,
    pairStraightCoverage: 0,
    airplaneCoverage: 0,
  };
  if (options.preservePower) {
    consumeRocket(plan, counts, initialCounts);
    while (consumeBomb(plan, counts, initialCounts)) {}
  }
  for (const type of order) {
    let consumed = true;
    while (consumed) {
      if (type === 'airplane') consumed = consumeAirplane(plan, counts, initialCounts, options.pairWingsFirst);
      else if (type === 'triple') consumed = consumeTriple(plan, counts, initialCounts, options.pairWingsFirst);
      else consumed = consumeRun(plan, counts, initialCounts, type);
    }
  }
  finishGroups(plan, counts, initialCounts);
  return plan;
}

function comparePlans (left, right) {
  return left.turns - right.turns ||
    left.controlBreakPenalty - right.controlBreakPenalty ||
    left.weakLooseCards - right.weakLooseCards ||
    right.structuredCards - left.structuredCards ||
    right.airplaneCoverage - left.airplaneCoverage ||
    right.straightCoverage - left.straightCoverage;
}

function controlFeatures (counts, plan) {
  const hasRocket = Boolean(counts[rankIndex(16)] && counts[rankIndex(17)]);
  const bombCount = counts.slice(0, 13).filter(count => count === 4).length;
  let raw = bombCount * 0.22;
  if (hasRocket) raw += 0.35;
  else raw += counts[rankIndex(16)] * 0.10 + counts[rankIndex(17)] * 0.14;
  raw += counts[rankIndex(15)] * 0.05;
  raw += counts[rankIndex(14)] * 0.025;
  return {
    hasRocket,
    bombCount,
    controlPower: clamp(raw, 0, 1),
    controlBreakPenalty: clamp(plan.controlBreakPenalty, 0, 1),
  };
}

function evaluateLite (hand, counts) {
  const cardCount = hand.length;
  if (cardCount === 0) {
    return {
      version: 'hand-strength-lite',
      score: 0,
      features: {
        cardCount: 0, estimatedTurns: 0, turnEfficiency: 0, controlPower: 0,
        bombCount: 0, hasRocket: false, weakLooseCards: 0, weakLooseRatio: 0,
        straightCoverage: 0, pairStraightCoverage: 0, airplaneCoverage: 0,
        structuredCoverage: 0, finishingPotential: 0, controlBreakPenalty: 0,
      },
      diagnostics: { deterministic: true, evaluatedPlans: 0, fallbackApplied: false, fallbackReason: null },
    };
  }

  const orders = [
    ['airplane', 'straight', 'pair-straight', 'triple'],
    ['airplane', 'pair-straight', 'straight', 'triple'],
    ['straight', 'airplane', 'pair-straight', 'triple'],
    ['pair-straight', 'airplane', 'straight', 'triple'],
  ];
  const plans = [];
  for (const order of orders) {
    plans.push(buildPlan(counts, order, { preservePower: true, pairWingsFirst: true }));
    plans.push(buildPlan(counts, order, { preservePower: false, pairWingsFirst: false }));
  }
  plans.sort(comparePlans);
  const best = plans[0];
  const estimatedTurns = best.turns;
  const turnEfficiency = clamp(1 - (estimatedTurns - 1) / Math.max(1, cardCount - 1), 0, 1);
  const weakLooseRatio = best.weakLooseCards / cardCount;
  const structuredCoverage = best.structuredCards / cardCount;
  const control = controlFeatures(counts, best);
  const closesInTwo = estimatedTurns <= 2 ? 1 : 0;
  const closesInThree = estimatedTurns === 3 ? 0.65 : 0;
  const finishingPotential = clamp(
    turnEfficiency * 0.55 + Math.max(closesInTwo, closesInThree) * 0.30 + control.controlPower * 0.15,
    0,
    1
  );
  const rawScore = LITE_WEIGHTS.intercept +
    LITE_WEIGHTS.turnEfficiency * turnEfficiency +
    LITE_WEIGHTS.controlPower * control.controlPower +
    LITE_WEIGHTS.structuredCoverage * structuredCoverage +
    LITE_WEIGHTS.finishingPotential * finishingPotential +
    LITE_WEIGHTS.weakLooseBurden * weakLooseRatio +
    LITE_WEIGHTS.controlBreakPenalty * control.controlBreakPenalty;

  return {
    version: 'hand-strength-lite',
    score: clamp(sigmoid(rawScore), 0, 1),
    features: {
      cardCount,
      estimatedTurns,
      turnEfficiency,
      controlPower: control.controlPower,
      bombCount: control.bombCount,
      hasRocket: control.hasRocket,
      weakLooseCards: best.weakLooseCards,
      weakLooseRatio,
      straightCoverage: best.straightCoverage,
      pairStraightCoverage: best.pairStraightCoverage,
      airplaneCoverage: best.airplaneCoverage,
      structuredCoverage,
      finishingPotential,
      controlBreakPenalty: control.controlBreakPenalty,
    },
    diagnostics: {
      deterministic: true,
      evaluatedPlans: plans.length,
      fallbackApplied: false,
      fallbackReason: null,
    },
  };
}

module.exports = { evaluateLite };
