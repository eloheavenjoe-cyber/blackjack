import assert from 'node:assert/strict';
import { getHoldemBotAction } from '../js/holdem-bot.js';

function room(currentBet = 0, pot = 100, minRaise = 20) {
  return { currentBet, pot, minRaise, settings: { blindPreset: '10/20' } };
}
function player(stack = 1000, streetBet = 0) {
  return { stack, streetBet };
}

// --- PREFLOP ---

// Passive tier 1 (AA), no bet → raise to 60 (3×BB)
{
  const act = getHoldemBotAction(
    [{ rank: 'A', suit: 'hearts' }, { rank: 'A', suit: 'spades' }],
    [],
    room(0, 30, 20),
    player(1000, 0),
    'passive'
  );
  assert.equal(act.type, 'raise', 'passive tier1 no bet → raise');
  assert.equal(act.amount, 60, 'passive tier1 raise amount = 3×BB = 60');
}

// Passive tier 1 (AKo), large bet already (100) → call (3×BB=60 < currentBet+minRaise)
{
  const act = getHoldemBotAction(
    [{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'clubs' }],
    [],
    room(100, 200, 20),
    player(1000, 0),
    'passive'
  );
  assert.equal(act.type, 'call', 'passive tier1 big bet → call');
}

// Passive tier 2 (TT), normal bet → call (no raise in passive tier 2)
{
  const act = getHoldemBotAction(
    [{ rank: '10', suit: 'hearts' }, { rank: '10', suit: 'spades' }],
    [],
    room(20, 30, 20),
    player(1000, 0),
    'passive'
  );
  assert.equal(act.type, 'call', 'passive tier2 → call');
}

// Passive tier 3 (suited connector JTs), bet → call
{
  const act = getHoldemBotAction(
    [{ rank: 'J', suit: 'hearts' }, { rank: '10', suit: 'hearts' }],
    [],
    room(20, 30, 20),
    player(1000, 0),
    'passive'
  );
  assert.equal(act.type, 'call', 'passive tier3 → call');
}

// Passive trash (72o), bet → fold
{
  const act = getHoldemBotAction(
    [{ rank: '7', suit: 'hearts' }, { rank: '2', suit: 'clubs' }],
    [],
    room(20, 30, 20),
    player(1000, 0),
    'passive'
  );
  assert.equal(act.type, 'fold', 'passive trash with bet → fold');
}

// Passive trash (72o), no bet (BB and free: streetBet >= currentBet) → check
{
  const act = getHoldemBotAction(
    [{ rank: '7', suit: 'hearts' }, { rank: '2', suit: 'clubs' }],
    [],
    room(20, 30, 20),
    player(980, 20),
    'passive'
  );
  assert.equal(act.type, 'check', 'passive trash BB free → check');
}

// Aggro tier 1 (KK), no bet → raise to 60
{
  const act = getHoldemBotAction(
    [{ rank: 'K', suit: 'hearts' }, { rank: 'K', suit: 'spades' }],
    [],
    room(0, 30, 20),
    player(1000, 0),
    'aggro'
  );
  assert.equal(act.type, 'raise', 'aggro tier1 → raise');
  assert.equal(act.amount, 60, 'aggro tier1 raise = 3×BB = 60');
}

// Aggro tier 2 (AQo), no bet → raise
{
  const act = getHoldemBotAction(
    [{ rank: 'A', suit: 'hearts' }, { rank: 'Q', suit: 'clubs' }],
    [],
    room(0, 30, 20),
    player(1000, 0),
    'aggro'
  );
  assert.equal(act.type, 'raise', 'aggro tier2 → raise');
}

// Aggro tier 3 (JTs), bet → call (no raise in aggro tier 3)
{
  const act = getHoldemBotAction(
    [{ rank: 'J', suit: 'hearts' }, { rank: '10', suit: 'hearts' }],
    [],
    room(20, 30, 20),
    player(1000, 0),
    'aggro'
  );
  assert.equal(act.type, 'call', 'aggro tier3 → call');
}

// --- POSTFLOP ---

const community3 = [
  { rank: 'K', suit: 'hearts' },
  { rank: 'Q', suit: 'diamonds' },
  { rank: 'J', suit: 'clubs' }
];

// High card, no bet → check
{
  const act = getHoldemBotAction(
    [{ rank: '7', suit: 'hearts' }, { rank: '2', suit: 'clubs' }],
    community3,
    room(0, 100, 20),
    player(1000, 0),
    'passive'
  );
  assert.equal(act.type, 'check', 'high card no bet → check');
}

// High card, with bet → fold
{
  const act = getHoldemBotAction(
    [{ rank: '7', suit: 'hearts' }, { rank: '2', suit: 'clubs' }],
    community3,
    room(20, 100, 20),
    player(1000, 0),
    'passive'
  );
  assert.equal(act.type, 'fold', 'high card with bet → fold');
}

// One pair, pot odds ≤ 40% → call (callAmt=20, pot=100 → 20/120 = 0.167)
{
  const act = getHoldemBotAction(
    [{ rank: 'A', suit: 'hearts' }, { rank: '2', suit: 'clubs' }],
    [{ rank: 'A', suit: 'diamonds' }, { rank: '5', suit: 'hearts' }, { rank: '9', suit: 'clubs' }],
    room(20, 100, 20),
    player(1000, 0),
    'passive'
  );
  assert.equal(act.type, 'call', 'one pair pot odds ≤40% → call');
}

// One pair, pot odds > 40% → fold (callAmt=50, pot=60 → 50/110 = 0.454)
{
  const act = getHoldemBotAction(
    [{ rank: 'A', suit: 'hearts' }, { rank: '2', suit: 'clubs' }],
    [{ rank: 'A', suit: 'diamonds' }, { rank: '5', suit: 'hearts' }, { rank: '9', suit: 'clubs' }],
    room(50, 60, 20),
    player(1000, 0),
    'passive'
  );
  assert.equal(act.type, 'fold', 'one pair pot odds >40% → fold');
}

// Trips (rank 3), passive → call any bet
{
  const act = getHoldemBotAction(
    [{ rank: 'A', suit: 'hearts' }, { rank: 'A', suit: 'clubs' }],
    [{ rank: 'A', suit: 'diamonds' }, { rank: '5', suit: 'hearts' }, { rank: '9', suit: 'clubs' }],
    room(50, 100, 20),
    player(1000, 0),
    'passive'
  );
  assert.equal(act.type, 'call', 'trips passive → call');
}

// Trips (rank 3), aggro, no bet → raise ½ pot
// pot=100 → halfPot=50, target=0+50=50, minAmt=0+20=20 → raise 50
{
  const act = getHoldemBotAction(
    [{ rank: 'A', suit: 'hearts' }, { rank: 'A', suit: 'clubs' }],
    [{ rank: 'A', suit: 'diamonds' }, { rank: '5', suit: 'hearts' }, { rank: '9', suit: 'clubs' }],
    room(0, 100, 20),
    player(1000, 0),
    'aggro'
  );
  assert.equal(act.type, 'raise', 'trips aggro → raise');
  assert.equal(act.amount, 50, 'trips aggro raise = ½ pot = 50');
}

// Flush (rank 5), passive → call
{
  const act = getHoldemBotAction(
    [{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'hearts' }],
    [{ rank: 'Q', suit: 'hearts' }, { rank: 'J', suit: 'hearts' }, { rank: '9', suit: 'hearts' }],
    room(50, 200, 20),
    player(1000, 0),
    'passive'
  );
  assert.equal(act.type, 'call', 'flush passive → call');
}

// Flush (rank 5), aggro, no bet → raise pot-sized
// pot=100, target=0+100=100, minAmt=0+20=20 → raise 100
{
  const act = getHoldemBotAction(
    [{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'hearts' }],
    [{ rank: 'Q', suit: 'hearts' }, { rank: 'J', suit: 'hearts' }, { rank: '9', suit: 'hearts' }],
    room(0, 100, 20),
    player(1000, 0),
    'aggro'
  );
  assert.equal(act.type, 'raise', 'flush aggro → raise');
  assert.equal(act.amount, 100, 'flush aggro raise = pot-sized = 100');
}

// Short-stacked bot (stack=30, streetBet=20, currentBet=50): maxAmount=50=currentBet, callAmount=30
// would-be target=100, but maxAmount(50) >= currentBet(50) → still valid all-in raise
// → raise to 50 (all-in)
{
  const act = getHoldemBotAction(
    [{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'hearts' }],
    [{ rank: 'Q', suit: 'hearts' }, { rank: 'J', suit: 'hearts' }, { rank: '9', suit: 'hearts' }],
    room(50, 200, 20),
    player(30, 20),
    'aggro'
  );
  // maxAmount=50 >= currentBet=50 → valid, but Math.min(250, 50) = 50
  assert.ok(act.type === 'raise' || act.type === 'call', 'short stack aggro flush: raise or call (never invalid)');
  if (act.type === 'raise') {
    assert.ok(act.amount >= 50, 'short stack raise amount must be >= currentBet');
  }
}

// Short-stacked bot where stack < callAmount (maxAmount < currentBet): must NOT raise
{
  const act = getHoldemBotAction(
    [{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'hearts' }],
    [{ rank: 'Q', suit: 'hearts' }, { rank: 'J', suit: 'hearts' }, { rank: '9', suit: 'hearts' }],
    room(50, 200, 20),
    player(25, 20),
    'aggro'
  );
  // maxAmount=45 < currentBet=50 → must not raise (would corrupt currentBet)
  assert.notEqual(act.type, 'raise', 'maxAmount < currentBet must never return raise');
}

console.log('holdem-bot.test: all assertions passed');
