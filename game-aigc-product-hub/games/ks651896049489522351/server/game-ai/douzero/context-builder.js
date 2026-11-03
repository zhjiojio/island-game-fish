const { createDeck } = require('../../cards');
const {
  DOUZERO_POSITIONS,
  toDouzeroRanks,
  assertDouzeroRanks,
  buildPositionMaps,
  createCandidateSet,
} = require('./codec');

const MAX_DOUZERO_CANDIDATES = 1024;

class DouZeroContextError extends Error {
  constructor (message) {
    super(message);
    this.name = 'DouZeroContextError';
    this.reason = 'douzero_invalid_context';
  }
}

function fail (message) {
  throw new DouZeroContextError(message);
}

function assertCountMap (values, label) {
  for (const rank of values) {
    if (!Number.isInteger(rank)) fail(`${label}:invalid_rank`);
  }
  const expected = new Map();
  for (const card of createDeck()) {
    const encoded = toDouzeroRanks([card])[0];
    expected.set(encoded, (expected.get(encoded) || 0) + 1);
  }
  const actual = new Map();
  for (const rank of values) actual.set(rank, (actual.get(rank) || 0) + 1);
  for (const [rank, count] of actual) {
    if (count > (expected.get(rank) || 0)) fail(`${label}:too_many_${rank}`);
  }
}

function buildDouZeroContext (observation, actions, options = {}) {
  try {
    if (!observation?.self || !observation?.publicState) fail('missing_observation');
    const decisionId = String(options.decisionId || '').trim();
    if (!decisionId || decisionId.length > 160) fail('invalid_decision_id');

    const { position, playerToPosition, positionToPlayer } = buildPositionMaps(
      observation.publicState,
      observation.self.playerId
    );
    const history = observation.publicState.playActionHistory || [];
    const playedCards = Object.fromEntries(DOUZERO_POSITIONS.map(item => [item, []]));
    const lastMoveByPosition = Object.fromEntries(DOUZERO_POSITIONS.map(item => [item, []]));
    const actionSequence = [];
    let bombCount = 0;

    let expectedSequence = 1;
    for (const entry of history) {
      if (Number(entry.seq) !== expectedSequence) fail('history_sequence_invalid');
      expectedSequence += 1;
      const entryPosition = playerToPosition.get(entry.playerId);
      if (!entryPosition || !['play', 'pass'].includes(entry.type)) fail('invalid_history_entry');
      const ranks = entry.type === 'play' ? toDouzeroRanks(entry.ranks || []) : [];
      if (entry.type === 'play' && ranks.length === 0) fail('empty_play_history');
      assertDouzeroRanks(ranks);
      actionSequence.push(ranks);
      lastMoveByPosition[entryPosition] = ranks;
      if (entry.type === 'play') {
        playedCards[entryPosition].push(...ranks);
        if (entry.playType === 'bomb' || entry.playType === 'rocket') bombCount += 1;
      }
    }
    for (const key of DOUZERO_POSITIONS) playedCards[key].sort((a, b) => a - b);

    const hand = toDouzeroRanks(observation.self.hand);
    const bottomCards = toDouzeroRanks(observation.publicState.landlordCardsVisible || []);
    if (bottomCards.length !== 3) fail('bottom_cards_missing');
    const numCardsLeft = {};
    for (const key of DOUZERO_POSITIONS) {
      const playerId = positionToPlayer[key];
      const count = Number(observation.publicState.handCounts?.[playerId]);
      if (!Number.isInteger(count) || count < 0 || count > (key === 'landlord' ? 20 : 17)) {
        fail(`invalid_hand_count:${key}`);
      }
      numCardsLeft[key] = count;
      const initialCount = key === 'landlord' ? 20 : 17;
      if (count + playedCards[key].length !== initialCount) fail(`position_card_count_mismatch:${key}`);
    }
    if (hand.length !== numCardsLeft[position]) fail('self_hand_count_mismatch');

    const allPlayed = DOUZERO_POSITIONS.flatMap(key => playedCards[key]);
    const remainingCount = Object.values(numCardsLeft).reduce((sum, count) => sum + count, 0);
    if (remainingCount + allPlayed.length !== 54) fail('deck_count_mismatch');
    assertCountMap(hand.concat(allPlayed), 'known_cards');
    const otherRemaining = 54 - hand.length - allPlayed.length;
    const expectedOtherRemaining = remainingCount - numCardsLeft[position];
    if (otherRemaining !== expectedOtherRemaining || otherRemaining < 0) fail('other_hand_count_mismatch');

    const lastPlay = observation.publicState.lastPlay;
    const lastMove = lastPlay ? toDouzeroRanks(lastPlay.cards || []) : [];
    const lastMovePosition = lastPlay ? playerToPosition.get(lastPlay.playerId) : null;
    if (lastPlay && !lastMovePosition) fail('invalid_last_move_player');

    const { candidates, candidateMap } = createCandidateSet(actions, observation.self.hand);
    if (!candidates.length) fail('no_candidates');
    if (candidates.length > MAX_DOUZERO_CANDIDATES) fail('too_many_candidates');

    return {
      request: {
        schema_version: 1,
        decision_id: decisionId,
        position,
        hand,
        bottom_cards: bottomCards,
        played_cards: playedCards,
        action_sequence: actionSequence,
        num_cards_left: numCardsLeft,
        last_move: lastMove,
        last_move_position: lastMovePosition,
        last_move_by_position: lastMoveByPosition,
        must_play: !lastPlay || lastPlay.playerId === observation.self.playerId,
        bomb_count: Math.max(0, Math.min(14, bombCount)),
        candidates,
      },
      candidateMap,
      candidateCount: candidates.length,
    };
  } catch (err) {
    if (err instanceof DouZeroContextError) throw err;
    throw new DouZeroContextError(err.message || 'context_build_failed');
  }
}

module.exports = { MAX_DOUZERO_CANDIDATES, DouZeroContextError, buildDouZeroContext };
