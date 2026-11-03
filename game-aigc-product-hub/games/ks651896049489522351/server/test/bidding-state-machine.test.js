const test = require('node:test');
const assert = require('node:assert');

process.env.DDZ_AUTH_MODE = process.env.DDZ_AUTH_MODE || 'dev';
process.env.DDZ_AUTH_SECRET = process.env.DDZ_AUTH_SECRET || 'test_secret';

const { createDeck, sortCards } = require('../cards');
const matchStore = require('../persistence/match-store');
const {
  createRoom,
  clearActionTimer,
  applyBidUnlocked,
} = require('../index.js');

function createBiddingRoom () {
  const room = createRoom('bid-state-machine', 'junior');
  const deck = createDeck();
  const playerIds = ['p1', 'p2', 'p3'];

  room.phase = 'bidding';
  room.seats = playerIds.slice();
  room.players = Object.fromEntries(playerIds.map((id, seat) => [id, {
    id,
    name: `玩家${seat + 1}`,
    seat,
    ready: true,
    connected: true,
    ws: null,
  }]));
  room.hands = {
    p1: sortCards(deck.slice(0, 17)),
    p2: sortCards(deck.slice(17, 34)),
    p3: sortCards(deck.slice(34, 51)),
  };
  room.handCounts = { p1: 17, p2: 17, p3: 17 };
  room.landlordCardsHidden = sortCards(deck.slice(51));
  room.round = {
    number: 1,
    starterSeat: 0,
    passCount: 0,
    multiplier: 1,
    baseScore: 100,
    playCounts: { p1: 0, p2: 0, p3: 0 },
  };
  room.bidState = {
    currentPlayerId: 'p1',
    starterId: 'p1',
    highestScore: 0,
    highestPlayerId: null,
    firstCallerId: null,
    robberId: null,
    bidMultiplier: 1,
    phase: 'calling',
    turns: 0,
    passed: [],
  };
  return room;
}

test('calling 最后一位叫地主时直接进入加倍，不能多走一轮抢地主', async () => {
  const originalAppend = matchStore.appendMatchEvent;
  const originalAssign = matchStore.recordLandlordAssignment;
  const room = createBiddingRoom();
  const observedPhases = [];

  matchStore.appendMatchEvent = async () => {};
  matchStore.recordLandlordAssignment = async () => {};
  try {
    await applyBidUnlocked(room, 'p1', 0);
    observedPhases.push(room.bidState?.phase || room.phase);
    await applyBidUnlocked(room, 'p2', 0);
    observedPhases.push(room.bidState?.phase || room.phase);
    await applyBidUnlocked(room, 'p3', 1);

    assert.deepStrictEqual(observedPhases, ['calling', 'calling']);
    assert.strictEqual(room.phase, 'doubling');
    assert.strictEqual(room.dealer, 'p3');
    assert.strictEqual(room.doublingPlayerId, 'p3');
    assert.strictEqual(room.doublingBidMultiplier, 1);
    assert.strictEqual(room.bidState, null);
  } finally {
    clearActionTimer(room);
    matchStore.appendMatchEvent = originalAppend;
    matchStore.recordLandlordAssignment = originalAssign;
  }
});
