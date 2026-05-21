# Texas Hold'em Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add No-Limit Texas Hold'em as a second game in the casino, fully playable with 2–6 humans, reusing BJ's shared infrastructure.

**Architecture:** Parallel file structure (holdem.html + css/holdem.css + js/holdem-engine.js + js/holdem-ui.js + js/holdem-game.js). Shared modules (chat, music, sound, timer, leaderboard, chips CSS) imported directly with zero changes. Host keeps `localDeck` in memory; only dealt cards written to Firebase.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database (CDN 10.12.2), Node.js `assert` for tests.

---

> **Schema note:** The per-player Firebase node gains one field beyond the spec: `acted: false` (reset each street). This tracks whether a player has had their turn this street, enabling clean preflop BB-option and raise-reset logic. See Task 4 for details.

---

## Task 1: Engine — Deck & Deal

**Files:**
- Create: `js/holdem-engine.js`
- Create: `tests/holdem-engine.test.mjs`
- Modify: `package.json` (add test script entry)

- [ ] **Step 1: Create `js/holdem-engine.js` with deck & deal exports**

```js
// js/holdem-engine.js

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

export const RANK_VALUE = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
  '10':10,'J':11,'Q':12,'K':13,'A':14
};

export function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank });
  return deck;
}

export function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function cardToStr(card) { return `${card.rank}_${card.suit}`; }

export function cardFromStr(str) {
  const idx = str.indexOf('_');
  return { rank: str.slice(0, idx), suit: str.slice(idx + 1) };
}

export function dealHoleCards(deck, playerCount) {
  const hands = Array.from({ length: playerCount }, () => []);
  let idx = 0;
  for (let round = 0; round < 2; round++)
    for (let p = 0; p < playerCount; p++)
      hands[p].push(deck[idx++]);
  return { hands, remaining: deck.slice(idx) };
}

export function dealCommunity(deck, phase) {
  const count = phase === 'flop' ? 3 : 1;
  return { cards: deck.slice(0, count), remaining: deck.slice(count) };
}
```

- [ ] **Step 2: Create `tests/holdem-engine.test.mjs` with deck/deal tests**

```js
import assert from 'node:assert/strict';
import {
  createDeck, shuffle, cardToStr, cardFromStr,
  dealHoleCards, dealCommunity, RANK_VALUE
} from '../js/holdem-engine.js';

const deck = createDeck();
assert.equal(deck.length, 52, '52 cards');
assert.equal(new Set(deck.map(cardToStr)).size, 52, 'all unique');

assert.equal(RANK_VALUE['A'], 14);
assert.equal(RANK_VALUE['10'], 10);
assert.equal(RANK_VALUE['2'], 2);

const shuffled = shuffle(deck);
assert.equal(shuffled.length, 52);
assert.equal(new Set(shuffled.map(cardToStr)).size, 52);

assert.deepEqual(cardFromStr(cardToStr({ rank: '10', suit: 'hearts' })), { rank: '10', suit: 'hearts' });

const { hands, remaining } = dealHoleCards(deck, 4);
assert.equal(hands.length, 4);
hands.forEach(h => assert.equal(h.length, 2));
assert.equal(remaining.length, 44);

const { cards: flop, remaining: r1 } = dealCommunity(remaining, 'flop');
assert.equal(flop.length, 3);
assert.equal(r1.length, 41);

const { cards: turn, remaining: r2 } = dealCommunity(r1, 'turn');
assert.equal(turn.length, 1);
assert.equal(r2.length, 40);

const { cards: river } = dealCommunity(r2, 'river');
assert.equal(river.length, 1);

console.log('holdem-engine deck/deal: all tests passed');
```

- [ ] **Step 3: Run the test to confirm it passes**

```
node tests/holdem-engine.test.mjs
```

Expected: `holdem-engine deck/deal: all tests passed`

- [ ] **Step 4: Add holdem test to `package.json`**

```json
{
  "type": "module",
  "scripts": {
    "test": "node tests/engine.test.mjs && node tests/roulette-engine.test.mjs && node tests/holdem-engine.test.mjs"
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add js/holdem-engine.js tests/holdem-engine.test.mjs package.json
git commit -m "feat: holdem engine — deck & deal"
```

---

## Task 2: Engine — Hand Evaluator

**Files:**
- Modify: `js/holdem-engine.js`
- Modify: `tests/holdem-engine.test.mjs`

- [ ] **Step 1: Write the failing test for all hand types**

Append to `tests/holdem-engine.test.mjs`:

```js
import { evaluateHand, compareHands } from '../js/holdem-engine.js';

function c(rank, suit) { return { rank, suit }; }

// Royal flush
const royalH = evaluateHand(
  [c('A','hearts'), c('K','hearts')],
  [c('Q','hearts'), c('J','hearts'), c('10','hearts'), c('2','clubs'), c('3','spades')]
);
assert.equal(royalH.rank, 8);
assert.equal(royalH.name, 'Royal Flush');

// Straight flush (9-high)
const sfH = evaluateHand(
  [c('9','spades'), c('8','spades')],
  [c('7','spades'), c('6','spades'), c('5','spades'), c('A','hearts'), c('K','clubs')]
);
assert.equal(sfH.rank, 8);
assert.equal(sfH.name, 'Straight Flush');
assert.equal(sfH.tiebreakers[0], 9);

// Four of a kind
const foakH = evaluateHand(
  [c('A','hearts'), c('A','diamonds')],
  [c('A','clubs'), c('A','spades'), c('K','hearts'), c('2','clubs'), c('3','spades')]
);
assert.equal(foakH.rank, 7);
assert.equal(foakH.name, 'Four of a Kind');

// Full house
const fhH = evaluateHand(
  [c('K','hearts'), c('K','diamonds')],
  [c('K','clubs'), c('Q','hearts'), c('Q','spades'), c('2','clubs'), c('3','spades')]
);
assert.equal(fhH.rank, 6);
assert.equal(fhH.name, 'Full House');

// Flush
const flH = evaluateHand(
  [c('A','hearts'), c('10','hearts')],
  [c('7','hearts'), c('4','hearts'), c('2','hearts'), c('K','spades'), c('Q','clubs')]
);
assert.equal(flH.rank, 5);
assert.equal(flH.name, 'Flush');

// Straight (9-high)
const strH = evaluateHand(
  [c('9','hearts'), c('8','spades')],
  [c('7','clubs'), c('6','diamonds'), c('5','hearts'), c('K','spades'), c('2','clubs')]
);
assert.equal(strH.rank, 4);
assert.equal(strH.tiebreakers[0], 9);

// Wheel straight (A-2-3-4-5, high=5)
const wheelH = evaluateHand(
  [c('A','hearts'), c('2','spades')],
  [c('3','clubs'), c('4','diamonds'), c('5','hearts'), c('K','spades'), c('Q','clubs')]
);
assert.equal(wheelH.rank, 4);
assert.equal(wheelH.tiebreakers[0], 5, 'wheel high is 5');

// Three of a kind
const tripsH = evaluateHand(
  [c('Q','hearts'), c('Q','spades')],
  [c('Q','clubs'), c('K','hearts'), c('J','spades'), c('9','clubs'), c('3','diamonds')]
);
assert.equal(tripsH.rank, 3);

// Two pair
const tpH = evaluateHand(
  [c('K','hearts'), c('K','spades')],
  [c('Q','hearts'), c('Q','spades'), c('J','clubs'), c('9','hearts'), c('3','diamonds')]
);
assert.equal(tpH.rank, 2);

// One pair
const pairH = evaluateHand(
  [c('A','hearts'), c('A','spades')],
  [c('K','clubs'), c('Q','hearts'), c('J','spades'), c('9','clubs'), c('3','diamonds')]
);
assert.equal(pairH.rank, 1);

// High card
const hcH = evaluateHand(
  [c('A','hearts'), c('K','spades')],
  [c('Q','clubs'), c('J','hearts'), c('9','spades'), c('7','clubs'), c('2','diamonds')]
);
assert.equal(hcH.rank, 0);

// Tie: same two pair, A kicker beats J kicker
const tp1 = evaluateHand(
  [c('K','hearts'), c('Q','hearts')],
  [c('K','spades'), c('Q','spades'), c('A','clubs'), c('2','hearts'), c('3','diamonds')]
);
const tp2 = evaluateHand(
  [c('K','clubs'), c('Q','clubs')],
  [c('K','diamonds'), c('Q','diamonds'), c('J','clubs'), c('2','hearts'), c('3','diamonds')]
);
assert.equal(compareHands(tp1, tp2), 1, 'A kicker beats J kicker');
assert.equal(compareHands(tp2, tp1), -1);

// Perfect tie (both make same straight)
const t1 = evaluateHand(
  [c('A','hearts'), c('K','hearts')],
  [c('Q','spades'), c('J','clubs'), c('10','diamonds'), c('2','hearts'), c('3','clubs')]
);
const t2 = evaluateHand(
  [c('A','spades'), c('K','spades')],
  [c('Q','spades'), c('J','clubs'), c('10','diamonds'), c('2','hearts'), c('3','clubs')]
);
assert.equal(compareHands(t1, t2), 0, 'perfect tie');

console.log('holdem-engine hand evaluator: all tests passed');
```

- [ ] **Step 2: Run the test — expect ReferenceError (not yet implemented)**

```
node tests/holdem-engine.test.mjs
```

Expected: fails with `SyntaxError` or `ReferenceError` on `evaluateHand`

- [ ] **Step 3: Implement hand evaluator — append to `js/holdem-engine.js`**

```js
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k)
  ];
}

function evaluate5(cards) {
  const vals = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const isStr8 = vals[0] - vals[4] === 4 && new Set(vals).size === 5;
  const isWheel = vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2;

  const counts = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const groups = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || +b[0] - +a[0])
    .map(([v, c]) => ({ val: +v, count: c }));

  if (isFlush && (isStr8 || isWheel)) {
    const high = isWheel ? 5 : vals[0];
    return { rank: 8, name: high === 14 ? 'Royal Flush' : 'Straight Flush', tiebreakers: [high] };
  }
  if (groups[0].count === 4)
    return { rank: 7, name: 'Four of a Kind', tiebreakers: [groups[0].val, groups[1].val] };
  if (groups[0].count === 3 && groups[1].count === 2)
    return { rank: 6, name: 'Full House', tiebreakers: [groups[0].val, groups[1].val] };
  if (isFlush)
    return { rank: 5, name: 'Flush', tiebreakers: vals };
  if (isStr8)
    return { rank: 4, name: 'Straight', tiebreakers: [vals[0]] };
  if (isWheel)
    return { rank: 4, name: 'Straight', tiebreakers: [5] };
  if (groups[0].count === 3)
    return { rank: 3, name: 'Three of a Kind', tiebreakers: [groups[0].val, ...groups.slice(1).map(g => g.val)] };
  if (groups[0].count === 2 && groups[1].count === 2)
    return { rank: 2, name: 'Two Pair', tiebreakers: [groups[0].val, groups[1].val, groups[2].val] };
  if (groups[0].count === 2)
    return { rank: 1, name: 'One Pair', tiebreakers: [groups[0].val, ...groups.slice(1).map(g => g.val)] };
  return { rank: 0, name: 'High Card', tiebreakers: vals };
}

export function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const diff = (a.tiebreakers[i] || 0) - (b.tiebreakers[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function evaluateHand(holeCards, communityCards) {
  const all7 = [...holeCards, ...communityCards];
  return combinations(all7, 5).reduce((best, combo) => {
    const result = evaluate5(combo);
    return !best || compareHands(result, best) > 0 ? result : best;
  }, null);
}
```

- [ ] **Step 4: Run the test**

```
node tests/holdem-engine.test.mjs
```

Expected: `holdem-engine hand evaluator: all tests passed`

- [ ] **Step 5: Commit**

```bash
git add js/holdem-engine.js tests/holdem-engine.test.mjs
git commit -m "feat: holdem engine — hand evaluator"
```

---

## Task 3: Engine — Side Pot Calculator

**Files:**
- Modify: `js/holdem-engine.js`
- Modify: `tests/holdem-engine.test.mjs`

- [ ] **Step 1: Write the failing test**

Append to `tests/holdem-engine.test.mjs`:

```js
import { calculateSidePots } from '../js/holdem-engine.js';

// No all-ins — single pot
const sp1 = calculateSidePots([
  { uid: 'a', totalBet: 100, folded: false },
  { uid: 'b', totalBet: 100, folded: false },
]);
assert.equal(sp1.length, 1);
assert.equal(sp1[0].amount, 200);
assert.deepEqual(sp1[0].eligiblePlayers.sort(), ['a', 'b']);

// One all-in: A(100), B(200), C(200)
const sp2 = calculateSidePots([
  { uid: 'a', totalBet: 100, folded: false },
  { uid: 'b', totalBet: 200, folded: false },
  { uid: 'c', totalBet: 200, folded: false },
]);
assert.equal(sp2.length, 2);
assert.equal(sp2[0].amount, 300, 'main pot 100×3');
assert.deepEqual(sp2[0].eligiblePlayers.sort(), ['a', 'b', 'c']);
assert.equal(sp2[1].amount, 200, 'side pot 100×2');
assert.deepEqual(sp2[1].eligiblePlayers.sort(), ['b', 'c']);

// Folded player excluded from eligible but chips stay in pot
const sp3 = calculateSidePots([
  { uid: 'a', totalBet: 200, folded: false },
  { uid: 'b', totalBet: 200, folded: true },
  { uid: 'c', totalBet: 200, folded: false },
]);
assert.equal(sp3.length, 1);
assert.equal(sp3[0].amount, 600);
assert.deepEqual(sp3[0].eligiblePlayers.sort(), ['a', 'c'], 'folded excluded');

// Two all-ins at different levels: A(50), B(100), C(200)
const sp4 = calculateSidePots([
  { uid: 'a', totalBet: 50, folded: false },
  { uid: 'b', totalBet: 100, folded: false },
  { uid: 'c', totalBet: 200, folded: false },
]);
assert.equal(sp4.length, 3);
assert.equal(sp4[0].amount, 150, 'pot 1: 50×3');
assert.deepEqual(sp4[0].eligiblePlayers.sort(), ['a', 'b', 'c']);
assert.equal(sp4[1].amount, 100, 'pot 2: 50×2');
assert.deepEqual(sp4[1].eligiblePlayers.sort(), ['b', 'c']);
assert.equal(sp4[2].amount, 100, 'pot 3: 100×1');
assert.deepEqual(sp4[2].eligiblePlayers, ['c']);

console.log('holdem-engine side pots: all tests passed');
```

- [ ] **Step 2: Run — expect fail**

```
node tests/holdem-engine.test.mjs
```

- [ ] **Step 3: Implement `calculateSidePots` — append to `js/holdem-engine.js`**

```js
export function calculateSidePots(players) {
  const sorted = [...players].sort((a, b) => a.totalBet - b.totalBet);
  const pots = [];
  let prevCap = 0;

  for (const player of sorted) {
    if (player.totalBet <= prevCap) continue;
    const cap = player.totalBet;
    const slice = cap - prevCap;
    const contributors = players.filter(p => p.totalBet > prevCap);
    const amount = contributors.reduce((sum, p) => sum + Math.min(p.totalBet - prevCap, slice), 0);
    const eligiblePlayers = players
      .filter(p => !p.folded && p.totalBet >= cap)
      .map(p => p.uid);
    if (amount > 0) pots.push({ amount, eligiblePlayers });
    prevCap = cap;
  }

  return pots;
}
```

- [ ] **Step 4: Run — expect pass**

```
node tests/holdem-engine.test.mjs
```

Expected: `holdem-engine side pots: all tests passed`

- [ ] **Step 5: Commit**

```bash
git add js/holdem-engine.js tests/holdem-engine.test.mjs
git commit -m "feat: holdem engine — side pot calculator"
```

---

## Task 4: Engine — Betting State Machine & Blind Rotation

**Files:**
- Modify: `js/holdem-engine.js`
- Modify: `tests/holdem-engine.test.mjs`

> `getNextActionSeat` uses `acted` (boolean on each seat) and `currentBet` rather than `lastAggressor`. When a player raises: reset all other active players' `acted = false` and update `currentBet`. This cleanly handles the preflop BB option (BB starts with `acted: false` despite posting).

- [ ] **Step 1: Write failing tests**

Append to `tests/holdem-engine.test.mjs`:

```js
import { getNextActionSeat, getNextDealerSeat, getBlinds } from '../js/holdem-engine.js';

// Preflop: BB posted (acted=false), SB posted (acted=false), UTG hasn't acted
const preflop = [
  { seat: 0, folded: false, allIn: false, sittingOut: false, acted: false, streetBet: 20 }, // BB
  { seat: 1, folded: false, allIn: false, sittingOut: false, acted: false, streetBet: 10 }, // SB
  { seat: 2, folded: false, allIn: false, sittingOut: false, acted: false, streetBet: 0 },  // UTG
];
// Start: pass currentSeat=-1 to get first to act
assert.equal(getNextActionSeat(preflop, -1, 20), 2, 'UTG acts first (seat > -1 with pending)');

// After UTG calls
const afterUtg = [
  { seat: 0, folded: false, allIn: false, sittingOut: false, acted: false, streetBet: 20 },
  { seat: 1, folded: false, allIn: false, sittingOut: false, acted: false, streetBet: 10 },
  { seat: 2, folded: false, allIn: false, sittingOut: false, acted: true,  streetBet: 20 },
];
assert.equal(getNextActionSeat(afterUtg, 2, 20), 1, 'SB next');

// After SB calls
const afterSb = [
  { seat: 0, folded: false, allIn: false, sittingOut: false, acted: false, streetBet: 20 },
  { seat: 1, folded: false, allIn: false, sittingOut: false, acted: true,  streetBet: 20 },
  { seat: 2, folded: false, allIn: false, sittingOut: false, acted: true,  streetBet: 20 },
];
assert.equal(getNextActionSeat(afterSb, 1, 20), 0, 'BB gets option');

// After BB checks — street closed
const afterBbCheck = [
  { seat: 0, folded: false, allIn: false, sittingOut: false, acted: true, streetBet: 20 },
  { seat: 1, folded: false, allIn: false, sittingOut: false, acted: true, streetBet: 20 },
  { seat: 2, folded: false, allIn: false, sittingOut: false, acted: true, streetBet: 20 },
];
assert.equal(getNextActionSeat(afterBbCheck, 0, 20), null, 'street closed');

// Raise: seat 2 raises to 60 — others reset to acted=false
const afterRaise = [
  { seat: 0, folded: false, allIn: false, sittingOut: false, acted: false, streetBet: 20 },
  { seat: 1, folded: false, allIn: false, sittingOut: false, acted: false, streetBet: 10 },
  { seat: 2, folded: false, allIn: false, sittingOut: false, acted: true,  streetBet: 60 },
];
assert.equal(getNextActionSeat(afterRaise, 2, 60), 0, 'BB responds to raise (wrap to seat 0)');

// Skip folded/allIn/sittingOut
const withFold = [
  { seat: 0, folded: true,  allIn: false, sittingOut: false, acted: true,  streetBet: 20 },
  { seat: 1, folded: false, allIn: false, sittingOut: false, acted: false, streetBet: 20 },
  { seat: 2, folded: false, allIn: false, sittingOut: false, acted: true,  streetBet: 20 },
];
assert.equal(getNextActionSeat(withFold, 2, 20), 1, 'skips folded seat 0, wraps to seat 1');

// Only one active player → null
const solo = [
  { seat: 0, folded: false, allIn: false, sittingOut: false, acted: false, streetBet: 0 },
  { seat: 1, folded: true,  allIn: false, sittingOut: false, acted: true,  streetBet: 20 },
  { seat: 2, folded: true,  allIn: false, sittingOut: false, acted: true,  streetBet: 20 },
];
assert.equal(getNextActionSeat(solo, 0, 20), null, 'solo active → null');

// getNextDealerSeat — skips sittingOut
const dealerSeats = [
  { seat: 0, sittingOut: false },
  { seat: 1, sittingOut: false },
  { seat: 3, sittingOut: true },
  { seat: 4, sittingOut: false },
];
assert.equal(getNextDealerSeat(dealerSeats, 1), 4, 'skips seat 3 (sitting out)');
assert.equal(getNextDealerSeat(dealerSeats, 4), 0, 'wraps to seat 0');

// getBlinds
assert.deepEqual(getBlinds({ blindPreset: '10/20' }), { sb: 10, bb: 20 });
assert.deepEqual(getBlinds({ blindPreset: '25/50' }), { sb: 25, bb: 50 });

console.log('holdem-engine betting/blinds: all tests passed');
```

- [ ] **Step 2: Run — expect fail**

```
node tests/holdem-engine.test.mjs
```

- [ ] **Step 3: Implement — append to `js/holdem-engine.js`**

```js
export function getNextActionSeat(seats, currentSeat, currentBet) {
  const active = seats
    .filter(s => !s.folded && !s.allIn && !s.sittingOut)
    .sort((a, b) => a.seat - b.seat);

  if (active.length <= 1) return null;

  const needsAction = active.filter(s => !s.acted || s.streetBet < currentBet);
  if (needsAction.length === 0) return null;

  return (needsAction.find(s => s.seat > currentSeat) ?? needsAction[0]).seat;
}

export function getNextDealerSeat(seats, currentDealer) {
  const available = seats
    .filter(s => !s.sittingOut)
    .map(s => s.seat)
    .sort((a, b) => a - b);
  if (available.length === 0) return currentDealer;
  return available.find(s => s > currentDealer) ?? available[0];
}

export function getBlinds(settings) {
  const [sb, bb] = settings.blindPreset.split('/').map(Number);
  return { sb, bb };
}
```

- [ ] **Step 4: Run full test suite**

```
npm test
```

Expected: all three test files pass

- [ ] **Step 5: Commit**

```bash
git add js/holdem-engine.js tests/holdem-engine.test.mjs
git commit -m "feat: holdem engine — betting state machine & blind rotation"
```

---

## Task 5: Lobby Integration

**Files:**
- Modify: `js/settings.js`
- Modify: `js/lobby.js`
- Modify: `index.html`

- [ ] **Step 1: Add Hold'em settings to `js/settings.js`**

Append after the existing `DEFAULT_SETTINGS` block:

```js
export const HOLDEM_DEFAULT_SETTINGS = {
  blindPreset: '10/20',
  startingStack: 1000
};

export function validateHoldemSettings(s) {
  const errors = [];
  if (!['5/10','10/20','25/50','100/200'].includes(s.blindPreset))
    errors.push('Invalid blind preset');
  if (!Number.isInteger(s.startingStack) || s.startingStack < 100 || s.startingStack > 100000)
    errors.push('Starting stack must be 100–100000');
  return errors;
}
```

- [ ] **Step 2: Add Hold'em imports and settings form to `js/lobby.js`**

At the top of `lobby.js`, add to existing imports:

```js
import { HOLDEM_DEFAULT_SETTINGS, validateHoldemSettings } from './settings.js';
```

Add a `currentHoldemSettings` variable near `currentSettings`:

```js
let currentHoldemSettings = { ...HOLDEM_DEFAULT_SETTINGS };
```

Add this function alongside `renderSettingsForm`:

```js
function renderHoldemSettingsForm() {
  const container = document.getElementById('settings-form');
  container.innerHTML = `
    <div class="setting-row">
      <label>Blinds</label>
      <select id="blind-preset">
        ${['5/10','10/20','25/50','100/200'].map(v =>
          `<option value="${v}" ${currentHoldemSettings.blindPreset === v ? 'selected' : ''}>${v}</option>`
        ).join('')}
      </select>
    </div>
    <div class="setting-row">
      <label>Starting Stack</label>
      <input type="number" id="starting-stack" min="100" max="100000" step="100"
        value="${currentHoldemSettings.startingStack}">
    </div>
  `;
  document.getElementById('blind-preset').addEventListener('change', e => {
    currentHoldemSettings.blindPreset = e.target.value;
  });
  document.getElementById('starting-stack').addEventListener('input', e => {
    currentHoldemSettings.startingStack = parseInt(e.target.value, 10) || 1000;
  });
}
```

In the `btn-start` click handler, add a branch for Hold'em alongside the existing BJ branch:

```js
if (selectedGame === 'holdem') {
  const errors = validateHoldemSettings(currentHoldemSettings);
  if (errors.length) { showError(errors.join(', ')); return; }
  const code = await createRoom(playerName, currentHoldemSettings, 'holdem');
  goToGame('holdem', code);
  return;
}
```

In `pick-bj` and the new `pick-holdem` event listeners, set `selectedGame` and render the appropriate settings form:

```js
document.getElementById('pick-bj').addEventListener('click', () => {
  selectedGame = 'blackjack';
  renderSettingsForm();
});

document.getElementById('pick-holdem').addEventListener('click', () => {
  selectedGame = 'holdem';
  renderHoldemSettingsForm();
});
```

Update `goToGame` to handle `'holdem'`:

```js
export function goToGame(gameType, code) {
  const path = gameType === 'holdem' ? 'holdem.html' : 'game.html';
  window.location.href = `${path}?room=${code}`;
}
```

- [ ] **Step 3: Add game picker buttons to `index.html`**

Find the existing `#game-picker` element (or the host/join form area) and add the two-button picker before the settings form. The exact location depends on current markup — find where the "Create Room" flow begins and prepend:

```html
<div id="game-picker">
  <button id="pick-bj" class="game-pick-btn">Blackjack</button>
  <button id="pick-holdem" class="game-pick-btn">Texas Hold'em</button>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add js/settings.js js/lobby.js index.html
git commit -m "feat: lobby — add Texas Hold'em game picker and settings"
```

---

## Task 6: room.js — Hold'em Firebase Helpers

**Files:**
- Modify: `js/room.js`

> `room.js` is the Firebase layer. We add Hold'em-specific helpers without modifying existing BJ functions.

- [ ] **Step 1: Append Hold'em helpers to `js/room.js`**

```js
// ── Hold'em helpers ─────────────────────────────────────────────────────────

export async function createHoldemRoom(playerName, settings) {
  try { await cleanupStaleRooms(); } catch (e) { console.warn('Cleanup failed:', e); }
  roomCode = generateRoomCode();
  isHost = true;
  const seat = 0;
  await update(ref(db), {
    [`rooms/${roomCode}/hostId`]: uid,
    [`rooms/${roomCode}/phase`]: 'waiting',
    [`rooms/${roomCode}/gameType`]: 'holdem',
    [`rooms/${roomCode}/settings`]: settings,
    [`rooms/${roomCode}/createdAt`]: Date.now(),
    [`rooms/${roomCode}/handNumber`]: 0,
    [`rooms/${roomCode}/dealerSeat`]: 0,
    [`rooms/${roomCode}/players/${uid}`]: {
      name: playerName, seat,
      stack: settings.startingStack,
      streetBet: 0, totalBet: 0,
      folded: false, allIn: false,
      sittingOut: false, acted: false,
      ready: false, isHost: true, connected: true
    }
  });
  return roomCode;
}

export async function joinHoldemRoom(code, playerName) {
  roomCode = code.trim().toUpperCase();
  const snap = await get(ref(db, `rooms/${roomCode}`));
  if (!snap.exists()) throw new Error('Room not found');
  const room = snap.val();
  isHost = uid === room.hostId;

  const players = room.players || {};
  if (players[uid]) {
    await update(ref(db, `rooms/${roomCode}/players/${uid}`), { connected: true });
    return room;
  }

  const takenSeats = Object.values(players).map(p => p.seat);
  const seat = [0,1,2,3,4,5].find(s => !takenSeats.includes(s));
  if (seat === undefined) throw new Error('Room is full (max 6 players)');

  await set(ref(db, `rooms/${roomCode}/players/${uid}`), {
    name: playerName, seat,
    stack: room.settings.startingStack,
    streetBet: 0, totalBet: 0,
    folded: false, allIn: false,
    sittingOut: false, acted: false,
    ready: false, isHost, connected: true
  });
  return room;
}

export async function writeHoleCards(targetUid, cardStrs) {
  await set(ref(db, `privateData/${roomCode}/holeCards/${targetUid}`), cardStrs);
}

export function watchHoleCards(callback) {
  return onValue(ref(db, `privateData/${roomCode}/holeCards/${uid}`), snap => {
    callback(snap.val() ? snap.val().map(s => ({ rank: s.split('_')[0], suit: s.split('_')[1] })) : null);
  });
}

export async function updateHoldemState(updates) {
  const prefixed = {};
  for (const [k, v] of Object.entries(updates))
    prefixed[`rooms/${roomCode}/${k}`] = v;
  await update(ref(db), prefixed);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/room.js
git commit -m "feat: room.js — add Hold'em Firebase helpers"
```

---

## Task 7: holdem.html Skeleton

**Files:**
- Create: `holdem.html`

- [ ] **Step 1: Create `holdem.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Texas Hold'em</title>
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/cards.css">
  <link rel="stylesheet" href="css/chips.css">
  <link rel="stylesheet" href="css/chat.css">
  <link rel="stylesheet" href="css/music.css">
  <link rel="stylesheet" href="css/leaderboard.css">
  <link rel="stylesheet" href="css/hud.css">
  <link rel="stylesheet" href="css/holdem.css">
</head>
<body>
  <div id="table">
    <div id="community-area">
      <div id="community-cards"></div>
      <div id="pot-display">
        <span id="main-pot">Pot: $0</span>
        <div id="side-pots"></div>
      </div>
    </div>
    <div id="seats"></div>
  </div>

  <div id="hud">
    <div id="action-controls" class="hidden">
      <button id="btn-fold">Fold</button>
      <button id="btn-check" class="hidden">Check</button>
      <button id="btn-call" class="hidden">Call <span id="call-amount"></span></button>
      <div id="raise-area" class="hidden">
        <input type="range" id="raise-slider" min="0" max="0" step="1">
        <span id="raise-display">$0</span>
        <button id="btn-raise">Raise</button>
        <button id="btn-allin">All-In</button>
      </div>
    </div>
    <div id="timer-bar-container" class="hidden">
      <div id="timer-bar"></div>
    </div>
    <div id="status-msg"></div>
  </div>

  <div id="chat-panel">
    <div id="chat-messages"></div>
    <div id="chat-input-row">
      <input type="text" id="chat-input" placeholder="Message…" maxlength="200">
      <button id="chat-send">Send</button>
    </div>
  </div>

  <div id="music-panel"></div>
  <div id="leaderboard-panel"></div>

  <script type="module" src="js/holdem-game.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add holdem.html
git commit -m "feat: holdem.html skeleton"
```

---

## Task 8: holdem.css — Table Layout

**Files:**
- Create: `css/holdem.css`

- [ ] **Step 1: Create `css/holdem.css`**

```css
#table {
  position: relative;
  width: 820px;
  height: 480px;
  margin: 0 auto;
  border-radius: 240px / 120px;
  background: var(--felt-color, #1a6b3a);
  border: 8px solid #5c3a1e;
  box-shadow: 0 0 60px rgba(0,0,0,0.6), inset 0 0 40px rgba(0,0,0,0.3);
}

/* 6-seat positions around a semi-ellipse */
.seat {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  transform: translate(-50%, -50%);
}

/* Seat indices 0-5, laid out clockwise from bottom-center */
.seat[data-seat="0"] { left: 50%;  top: 88%; }  /* bottom center (hero) */
.seat[data-seat="1"] { left: 20%;  top: 78%; }  /* bottom left */
.seat[data-seat="2"] { left: 6%;   top: 50%; }  /* middle left */
.seat[data-seat="3"] { left: 20%;  top: 22%; }  /* top left */
.seat[data-seat="4"] { left: 80%;  top: 22%; }  /* top right */
.seat[data-seat="5"] { left: 94%;  top: 50%; }  /* middle right */

.seat .player-name {
  font-size: 0.75rem;
  color: #eee;
  background: rgba(0,0,0,0.5);
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.seat .player-stack {
  font-size: 0.8rem;
  color: #f0d060;
  font-weight: bold;
}

.seat .hole-cards {
  display: flex;
  gap: 3px;
}

.seat .seat-badge {
  font-size: 0.6rem;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: bold;
}

.seat .seat-badge.dealer { background: #fff; color: #000; }
.seat .seat-badge.sb     { background: #3399ff; color: #fff; }
.seat .seat-badge.bb     { background: #ff9933; color: #fff; }

.seat.active-turn .player-name {
  box-shadow: 0 0 8px 2px #ffe066;
}

.seat.folded { opacity: 0.4; }
.seat.sitting-out .player-name { text-decoration: line-through; }

/* Community card area */
#community-area {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -55%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

#community-cards {
  display: flex;
  gap: 6px;
}

#pot-display {
  text-align: center;
  color: #f0f0e0;
}

#main-pot {
  font-size: 1rem;
  font-weight: bold;
}

#side-pots {
  font-size: 0.75rem;
  color: #ccc;
}

/* Street bet label under hole cards */
.seat .street-bet {
  font-size: 0.7rem;
  color: #aaddff;
}

/* Action controls */
#action-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

#raise-area {
  display: flex;
  gap: 6px;
  align-items: center;
}

#raise-slider { width: 120px; }

/* Timer bar */
#timer-bar-container {
  width: 200px;
  height: 6px;
  background: rgba(255,255,255,0.2);
  border-radius: 3px;
  margin-top: 4px;
}

#timer-bar {
  height: 100%;
  background: #66ccff;
  border-radius: 3px;
  transition: width 1s linear;
}

.hidden { display: none !important; }
```

- [ ] **Step 2: Commit**

```bash
git add css/holdem.css
git commit -m "feat: holdem.css — table and seat layout"
```

---

## Task 9: holdem-ui.js — Seat & Card Rendering

**Files:**
- Create: `js/holdem-ui.js`

- [ ] **Step 1: Create `js/holdem-ui.js`**

```js
// js/holdem-ui.js
import { cardToStr } from './holdem-engine.js';

export function renderSeats(room, myUid, myHoleCards) {
  const container = document.getElementById('seats');
  container.innerHTML = '';

  const players = Object.entries(room.players || {})
    .filter(([, p]) => !p.sittingOut || p.stack > 0)
    .sort(([, a], [, b]) => a.seat - b.seat);

  for (const [uid, player] of players) {
    const div = document.createElement('div');
    div.className = 'seat' +
      (room.actionSeat === player.seat ? ' active-turn' : '') +
      (player.folded ? ' folded' : '') +
      (player.sittingOut ? ' sitting-out' : '');
    div.dataset.seat = player.seat;

    const badges = [];
    if (player.seat === room.dealerSeat) badges.push('<span class="seat-badge dealer">D</span>');
    const { sbSeat, bbSeat } = getBlindsSeats(room);
    if (player.seat === sbSeat) badges.push('<span class="seat-badge sb">SB</span>');
    if (player.seat === bbSeat) badges.push('<span class="seat-badge bb">BB</span>');

    const isMe = uid === myUid;
    const cards = isMe && myHoleCards
      ? myHoleCards.map(c => renderCardFaceUp(c)).join('')
      : (player.folded ? '' : '<div class="card card-back"></div><div class="card card-back"></div>');

    div.innerHTML = `
      <div class="hole-cards">${cards}</div>
      <div class="player-name">${player.name}</div>
      <div class="player-stack">$${player.stack}</div>
      ${player.streetBet > 0 ? `<div class="street-bet">$${player.streetBet}</div>` : ''}
      <div style="display:flex;gap:3px">${badges.join('')}</div>
    `;
    container.appendChild(div);
  }
}

export function renderCommunityCards(cards) {
  const container = document.getElementById('community-cards');
  container.innerHTML = (cards || []).map(c =>
    typeof c === 'string'
      ? renderCardFaceUpFromStr(c)
      : renderCardFaceUp(c)
  ).join('');
}

export function renderPot(room) {
  document.getElementById('main-pot').textContent = `Pot: $${room.pot || 0}`;
  const sideDiv = document.getElementById('side-pots');
  sideDiv.innerHTML = (room.sidePots || []).map((sp, i) =>
    `<div>Side Pot ${i + 1} (${sp.eligiblePlayers.length}p): $${sp.amount}</div>`
  ).join('');
}

export function showShowdownCards(players) {
  // Flip all non-folded players' cards face up at showdown
  for (const [uid, player] of Object.entries(players)) {
    if (player.folded || !player.showCards) continue;
    const seatEl = document.querySelector(`.seat[data-seat="${player.seat}"] .hole-cards`);
    if (!seatEl || !player.showCards) continue;
    seatEl.innerHTML = player.showCards.map(renderCardFaceUpFromStr).join('');
  }
}

export function showWinnerMessage(name, handName) {
  const el = document.getElementById('status-msg');
  el.textContent = `${name} wins — ${handName}`;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3500);
}

function getBlindsSeats(room) {
  const seats = Object.values(room.players || {})
    .filter(p => !p.sittingOut)
    .map(p => p.seat)
    .sort((a, b) => a - b);
  if (seats.length < 2) return { sbSeat: -1, bbSeat: -1 };
  const dealerIdx = seats.indexOf(room.dealerSeat);
  const sbSeat = seats[(dealerIdx + 1) % seats.length];
  const bbSeat = seats[(dealerIdx + 2) % seats.length];
  return { sbSeat, bbSeat };
}

function renderCardFaceUp(card) {
  return `<div class="card rank-${card.rank} suit-${card.suit}"></div>`;
}

function renderCardFaceUpFromStr(str) {
  const idx = str.indexOf('_');
  return renderCardFaceUp({ rank: str.slice(0, idx), suit: str.slice(idx + 1) });
}
```

- [ ] **Step 2: Commit**

```bash
git add js/holdem-ui.js
git commit -m "feat: holdem-ui — seat and card rendering"
```

---

## Task 10: holdem-ui.js — Action Controls & Pot Display

**Files:**
- Modify: `js/holdem-ui.js`

- [ ] **Step 1: Append action control functions to `js/holdem-ui.js`**

```js
export function renderActionControls(myPlayer, room, onAction) {
  const ctrl = document.getElementById('action-controls');
  if (!myPlayer || room.actionSeat !== myPlayer.seat || myPlayer.folded || myPlayer.allIn) {
    ctrl.classList.add('hidden');
    return;
  }
  ctrl.classList.remove('hidden');

  const currentBet = room.currentBet || 0;
  const callAmount = Math.min(currentBet - (myPlayer.streetBet || 0), myPlayer.stack);
  const canCheck = callAmount <= 0;
  const { bb } = parseBlinds(room.settings.blindPreset);
  const minRaise = Math.max(room.minRaise || bb, bb);
  const maxRaise = myPlayer.stack;

  // Check/Call toggle
  const checkBtn = document.getElementById('btn-check');
  const callBtn  = document.getElementById('btn-call');
  if (canCheck) {
    checkBtn.classList.remove('hidden');
    callBtn.classList.add('hidden');
  } else {
    checkBtn.classList.add('hidden');
    callBtn.classList.remove('hidden');
    document.getElementById('call-amount').textContent = `$${callAmount}`;
  }

  // Raise slider
  const raiseArea = document.getElementById('raise-area');
  if (myPlayer.stack > callAmount) {
    raiseArea.classList.remove('hidden');
    const slider = document.getElementById('raise-slider');
    const raiseMin = callAmount + minRaise;
    slider.min = raiseMin;
    slider.max = maxRaise;
    slider.value = Math.min(raiseMin, maxRaise);
    document.getElementById('raise-display').textContent = `$${slider.value}`;
    slider.oninput = () => {
      document.getElementById('raise-display').textContent = `$${slider.value}`;
    };
  } else {
    raiseArea.classList.add('hidden');
  }

  // Wire buttons (replace to clear old listeners)
  rewire('btn-fold',  () => onAction({ type: 'fold' }));
  rewire('btn-check', () => onAction({ type: 'check' }));
  rewire('btn-call',  () => onAction({ type: 'call', amount: callAmount }));
  rewire('btn-raise', () => {
    const amount = parseInt(document.getElementById('raise-slider').value, 10);
    onAction({ type: 'raise', amount });
  });
  rewire('btn-allin', () => onAction({ type: 'raise', amount: myPlayer.stack }));
}

export function startTimer(seconds, onExpire) {
  const bar = document.getElementById('timer-bar');
  const container = document.getElementById('timer-bar-container');
  container.classList.remove('hidden');
  bar.style.width = '100%';
  const start = Date.now();
  const interval = setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    const pct = Math.max(0, 100 - (elapsed / seconds) * 100);
    bar.style.width = pct + '%';
    if (elapsed >= seconds) {
      clearInterval(interval);
      container.classList.add('hidden');
      onExpire();
    }
  }, 200);
  return () => clearInterval(interval);
}

function parseBlinds(preset) {
  const [sb, bb] = preset.split('/').map(Number);
  return { sb, bb };
}

function rewire(id, handler) {
  const btn = document.getElementById(id);
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener('click', handler);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/holdem-ui.js
git commit -m "feat: holdem-ui — action controls and timer"
```

---

## Task 11: holdem-game.js — Init, Join & Lobby

**Files:**
- Create: `js/holdem-game.js`

- [ ] **Step 1: Create `js/holdem-game.js` with init and lobby ready-up**

```js
// js/holdem-game.js
import {
  initRoom, uid, roomCode, isHost,
  onRoomChange, writePlayerAction, updatePlayer, setPhase,
  createHoldemRoom, joinHoldemRoom, writeHoleCards, watchHoleCards, updateHoldemState
} from './room.js';
import { shuffle, createDeck, cardToStr, dealHoleCards, dealCommunity,
         getBlinds, getNextDealerSeat, getNextActionSeat, calculateSidePots,
         evaluateHand, compareHands } from './holdem-engine.js';
import { renderSeats, renderCommunityCards, renderPot,
         renderActionControls, startTimer, showShowdownCards, showWinnerMessage } from './holdem-ui.js';
import { initChat } from './chat.js';
import { initMusic } from './music.js';
import { playSound } from './sound.js';

const params = new URLSearchParams(window.location.search);
const code   = params.get('room');
const name   = localStorage.getItem('playerName') || 'Player';

let localDeck = [];
let myHoleCards = null;
let stopTimer = null;

async function main() {
  await initRoom();

  const room = code
    ? await joinHoldemRoom(code, name)
    : await createHoldemRoom(name, JSON.parse(localStorage.getItem('holdemSettings') || 'null') || { blindPreset: '10/20', startingStack: 1000 });

  initChat(roomCode);
  initMusic();
  watchHoleCards(cards => { myHoleCards = cards; });

  onRoomChange(room => {
    if (!room) return;
    renderSeats(room, uid, myHoleCards);
    renderCommunityCards(room.communityCards);
    renderPot(room);

    const me = room.players?.[uid];
    renderActionControls(me, room, handleAction);

    if (room.phase === 'waiting') renderLobby(room);
    if (room.phase === 'showdown' && isHost) scheduleNextHand(room);
  });

  if (isHost) renderHostControls();
}

function renderLobby(room) {
  const status = document.getElementById('status-msg');
  const me = room.players?.[uid];
  if (!me) return;

  status.innerHTML = me.ready
    ? 'Waiting for others…'
    : '<button id="btn-ready">Ready</button>';

  document.getElementById('btn-ready')?.addEventListener('click', async () => {
    await updatePlayer(uid, { ready: true });
    if (isHost) checkAllReady(room);
  });
}

async function checkAllReady(room) {
  const players = Object.values(room.players || {});
  const active = players.filter(p => !p.sittingOut);
  if (active.length < 2) return;
  if (!active.every(p => p.ready)) return;
  await startNewHand(room);
}

function renderHostControls() {
  // Host sees a "Start Game" button in lobby
  // (checkAllReady handles auto-start when all ready)
}

async function handleAction(action) {
  const ts = Date.now();
  await writePlayerAction({ action: { ...action, ts } });
}

main().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add js/holdem-game.js
git commit -m "feat: holdem-game — init, join, lobby ready-up"
```

---

## Task 12: holdem-game.js — Host: Deal & Phase Transitions

**Files:**
- Modify: `js/holdem-game.js`

- [ ] **Step 1: Add `startNewHand` and phase-advance logic**

Append to `js/holdem-game.js`:

```js
async function startNewHand(room) {
  const players = Object.values(room.players || {}).filter(p => !p.sittingOut);
  if (players.length < 2) return;

  const seats = players.sort((a, b) => a.seat - b.seat);
  const newDealer = getNextDealerSeat(seats, room.dealerSeat ?? -1);
  const { sb, bb } = getBlinds(room.settings);

  // Sort by seat to find SB/BB
  const active = seats.filter(p => p.stack > 0);
  const dealerIdx = active.findIndex(p => p.seat === newDealer);
  const sbPlayer = active[(dealerIdx + 1) % active.length];
  const bbPlayer = active[(dealerIdx + 2) % active.length];

  // Reset all players for new hand
  const resetUpdates = {};
  for (const [pid, p] of Object.entries(room.players)) {
    if (p.sittingOut) continue;
    resetUpdates[`players/${pid}/folded`]    = false;
    resetUpdates[`players/${pid}/allIn`]     = false;
    resetUpdates[`players/${pid}/acted`]     = false;
    resetUpdates[`players/${pid}/streetBet`] = 0;
    resetUpdates[`players/${pid}/totalBet`]  = 0;
  }

  // Post blinds
  const sbUid = Object.entries(room.players).find(([,p]) => p.seat === sbPlayer.seat)?.[0];
  const bbUid = Object.entries(room.players).find(([,p]) => p.seat === bbPlayer.seat)?.[0];
  resetUpdates[`players/${sbUid}/streetBet`] = Math.min(sb, sbPlayer.stack);
  resetUpdates[`players/${sbUid}/totalBet`]  = Math.min(sb, sbPlayer.stack);
  resetUpdates[`players/${sbUid}/stack`]     = sbPlayer.stack - Math.min(sb, sbPlayer.stack);
  resetUpdates[`players/${bbUid}/streetBet`] = Math.min(bb, bbPlayer.stack);
  resetUpdates[`players/${bbUid}/totalBet`]  = Math.min(bb, bbPlayer.stack);
  resetUpdates[`players/${bbUid}/stack`]     = bbPlayer.stack - Math.min(bb, bbPlayer.stack);

  // Deal hole cards
  localDeck = shuffle(createDeck());
  const playerUids = active.map(p =>
    Object.entries(room.players).find(([,pl]) => pl.seat === p.seat)[0]
  );
  const { hands, remaining } = dealHoleCards(localDeck, playerUids.length);
  localDeck = remaining;

  for (let i = 0; i < playerUids.length; i++) {
    await writeHoleCards(playerUids[i], hands[i].map(cardToStr));
  }

  // UTG = seat after BB
  const utg = getNextActionSeat(
    active.map(p => ({ ...p, acted: false, streetBet: p.seat === bbPlayer.seat ? bb : (p.seat === sbPlayer.seat ? sb : 0) })),
    bbPlayer.seat, bb
  );

  await updateHoldemState({
    ...resetUpdates,
    phase:        'preflop',
    dealerSeat:   newDealer,
    communityCards: [],
    pot:          sb + bb,
    sidePots:     [],
    currentBet:   bb,
    minRaise:     bb,
    actionSeat:   utg ?? bbPlayer.seat,
    handNumber:   (room.handNumber || 0) + 1
  });

  playSound('deal');
}

async function advancePhase(room) {
  const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const next = phases[phases.indexOf(room.phase) + 1];
  if (!next) return;

  if (next === 'showdown') {
    await runShowdown(room);
    return;
  }

  // Collect bets into pot
  const players = Object.values(room.players || {});
  const newPot = players.reduce((s, p) => s + (p.streetBet || 0), room.pot || 0);

  // Deal community cards
  const { cards, remaining } = dealCommunity(localDeck, next);
  localDeck = remaining;

  // Reset street state for all non-folded, non-all-in players
  const resetUpdates = {};
  for (const [pid, p] of Object.entries(room.players)) {
    if (p.folded || p.sittingOut) continue;
    resetUpdates[`players/${pid}/streetBet`] = 0;
    resetUpdates[`players/${pid}/acted`]     = false;
  }

  const activePlayers = players
    .filter(p => !p.folded && !p.sittingOut)
    .map(p => ({ ...p, acted: false, streetBet: 0 }));

  const dealerSeat = room.dealerSeat;
  const firstToAct = getNextActionSeat(activePlayers, dealerSeat, 0);

  await updateHoldemState({
    ...resetUpdates,
    phase:          next,
    communityCards: [...(room.communityCards || []), ...cards.map(cardToStr)],
    pot:            newPot,
    currentBet:     0,
    minRaise:       getBlinds(room.settings).bb,
    actionSeat:     firstToAct
  });

  playSound('card');
}
```

- [ ] **Step 2: Commit**

```bash
git add js/holdem-game.js
git commit -m "feat: holdem-game — host deal and phase transitions"
```

---

## Task 13: holdem-game.js — Player Actions & Turn Management

**Files:**
- Modify: `js/holdem-game.js`

- [ ] **Step 1: Add `watchForPlayerAction` and `applyAction` to `js/holdem-game.js`**

```js
let lastProcessedAction = null;

function watchForPlayerAction(room) {
  if (!isHost) return;

  for (const [pid, player] of Object.entries(room.players || {})) {
    if (!player.action) continue;
    const token = `${pid}:${player.action.ts}`;
    if (token === lastProcessedAction) continue;
    if (room.actionSeat !== player.seat) continue;
    if (player.folded || player.allIn) continue;

    lastProcessedAction = token;
    applyAction(pid, player, room);
    return;
  }
}

async function applyAction(pid, player, room) {
  const { type, amount } = player.action;
  const currentBet = room.currentBet || 0;
  const { bb } = getBlinds(room.settings);

  const updates = { [`players/${pid}/action`]: null, [`players/${pid}/acted`]: true };

  if (type === 'fold') {
    updates[`players/${pid}/folded`] = true;
  } else if (type === 'check') {
    // No bet change
  } else if (type === 'call') {
    const callAmt = Math.min(currentBet - (player.streetBet || 0), player.stack);
    updates[`players/${pid}/stack`]     = player.stack - callAmt;
    updates[`players/${pid}/streetBet`] = (player.streetBet || 0) + callAmt;
    updates[`players/${pid}/totalBet`]  = (player.totalBet || 0) + callAmt;
    if (player.stack - callAmt === 0) updates[`players/${pid}/allIn`] = true;
  } else if (type === 'raise') {
    const totalContrib = amount; // amount = new total bet this street
    const added = Math.min(totalContrib - (player.streetBet || 0), player.stack);
    const newStreetBet = (player.streetBet || 0) + added;
    const newRaise = newStreetBet - currentBet;

    updates[`players/${pid}/stack`]     = player.stack - added;
    updates[`players/${pid}/streetBet`] = newStreetBet;
    updates[`players/${pid}/totalBet`]  = (player.totalBet || 0) + added;
    updates.currentBet = newStreetBet;
    updates.minRaise   = Math.max(newRaise, bb);
    if (player.stack - added === 0) updates[`players/${pid}/allIn`] = true;

    // Reset all other active players' acted flag
    for (const [otherId, other] of Object.entries(room.players || {})) {
      if (otherId === pid || other.folded || other.allIn || other.sittingOut) continue;
      updates[`players/${otherId}/acted`] = false;
    }
  }

  await updateHoldemState(updates);

  // Re-read room state after update to check if street is closed
  // (onRoomChange will trigger — let it handle the next step)
}

// In onRoomChange handler, after rendering, add:
function checkStreetProgress(room) {
  if (!isHost) return;
  if (!['preflop','flop','turn','river'].includes(room.phase)) return;

  watchForPlayerAction(room);

  // Check if only one player remains (everyone else folded)
  const active = Object.values(room.players || {}).filter(p => !p.folded && !p.sittingOut);
  if (active.length === 1) {
    awardPotToLastPlayer(room, active[0]);
    return;
  }

  // Check if street is closed
  const seats = Object.values(room.players || {}).filter(p => !p.sittingOut);
  const nextSeat = getNextActionSeat(seats, room.actionSeat ?? -1, room.currentBet || 0);
  if (nextSeat === null) {
    // All active are either acted/all-in → advance phase
    advancePhase(room);
  } else {
    updateHoldemState({ actionSeat: nextSeat });
  }
}
```

> Add `checkStreetProgress(room)` to the `onRoomChange` callback after the render calls.

- [ ] **Step 2: Commit**

```bash
git add js/holdem-game.js
git commit -m "feat: holdem-game — player actions and turn management"
```

---

## Task 14: holdem-game.js — Showdown, Pot Award & Next Hand

**Files:**
- Modify: `js/holdem-game.js`

- [ ] **Step 1: Add showdown, `awardPotToLastPlayer`, and `scheduleNextHand`**

```js
async function runShowdown(room) {
  const players = Object.entries(room.players || {}).filter(([, p]) => !p.folded && !p.sittingOut);
  const community = (room.communityCards || []).map(s => {
    const i = s.indexOf('_');
    return { rank: s.slice(0, i), suit: s.slice(i + 1) };
  });

  // Reveal each player's hole cards (write showCards to their player node for UI)
  const cardRevealUpdates = {};
  const handResults = [];

  for (const [pid] of players) {
    const holeSnap = await getHoleCardsOnce(pid);
    if (!holeSnap) continue;
    const holeCards = holeSnap.map(s => {
      const i = s.indexOf('_');
      return { rank: s.slice(0, i), suit: s.slice(i + 1) };
    });
    const result = evaluateHand(holeCards, community);
    handResults.push({ pid, result, holeCards });
    cardRevealUpdates[`players/${pid}/showCards`] = holeSnap;
  }

  // Determine winners per side pot
  const allPlayers = Object.entries(room.players || {}).map(([uid, p]) => ({
    uid, totalBet: p.totalBet || 0, folded: p.folded, allIn: p.allIn
  }));

  // Collect remaining street bets into final pot
  const totalPot = Object.values(room.players || {}).reduce((s, p) => s + (p.streetBet || 0), room.pot || 0);
  const sidePots = calculateSidePots(allPlayers.map(p => ({
    ...p,
    totalBet: (room.players[p.uid]?.totalBet || 0) + (room.players[p.uid]?.streetBet || 0)
  })));

  // Award each pot
  const stackDeltas = {};
  const winMessages = [];

  for (const pot of sidePots) {
    const eligible = handResults.filter(h => pot.eligiblePlayers.includes(h.pid));
    if (eligible.length === 0) continue;

    eligible.sort((a, b) => compareHands(b.result, a.result));
    const best = eligible[0].result;
    const winners = eligible.filter(h => compareHands(h.result, best) === 0);
    const share = Math.floor(pot.amount / winners.length);

    for (const w of winners) {
      stackDeltas[w.pid] = (stackDeltas[w.pid] || 0) + share;
      winMessages.push(`${room.players[w.pid]?.name} wins $${share} — ${w.result.name}`);
    }
  }

  // Apply stack changes
  const stackUpdates = {};
  for (const [pid, delta] of Object.entries(stackDeltas)) {
    const current = room.players[pid]?.stack || 0;
    stackUpdates[`players/${pid}/stack`] = current + delta;
  }

  // Mark busted players as sitting out
  for (const [pid, player] of Object.entries(room.players || {})) {
    const newStack = stackUpdates[`players/${pid}/stack`] ?? player.stack;
    if (newStack <= 0 && !player.sittingOut) {
      stackUpdates[`players/${pid}/sittingOut`] = true;
    }
  }

  await updateHoldemState({
    ...cardRevealUpdates,
    ...stackUpdates,
    phase:    'showdown',
    pot:      totalPot,
    sidePots: sidePots
  });

  showShowdownCards(room.players);
  for (const msg of winMessages) showWinnerMessage('', msg);
  playSound('win');
}

async function awardPotToLastPlayer(room, winner) {
  const totalPot = Object.values(room.players || {}).reduce(
    (s, p) => s + (p.streetBet || 0), room.pot || 0
  );
  const newStack = (winner.stack || 0) + totalPot;
  await updateHoldemState({
    [`players/${Object.entries(room.players).find(([,p]) => p.seat === winner.seat)?.[0]}/stack`]: newStack,
    phase: 'showdown',
    pot: 0
  });
  showWinnerMessage(winner.name, 'everyone folded');
  playSound('win');
}

function scheduleNextHand(room) {
  setTimeout(async () => {
    const snap = await getCurrentRoom();
    await startNewHand(snap);
  }, 4000);
}

// Helpers needed by the above — add these imports/stubs:
async function getHoleCardsOnce(targetUid) {
  // Host reads from privateData to reveal at showdown
  const { get, ref, getDatabase } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
  const { getApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const db = getDatabase(getApp());
  const snap = await get(ref(db, `privateData/${roomCode}/holeCards/${targetUid}`));
  return snap.val();
}

async function getCurrentRoom() {
  const { get, ref, getDatabase } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
  const { getApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  const db = getDatabase(getApp());
  const snap = await get(ref(db, `rooms/${roomCode}`));
  return snap.val();
}
```

> Add `export function getDb() { return db; }` to `room.js` to avoid re-importing Firebase in holdem-game.js. Then replace the dynamic imports in `getHoleCardsOnce` / `getCurrentRoom` with `import { getDb } from './room.js'` and `getDb()`.

- [ ] **Step 2: Add `getDb` to `room.js`**

In `js/room.js`, after `let db, auth;`:

```js
export function getDb() { return db; }
```

Then update `getHoleCardsOnce` and `getCurrentRoom` in `holdem-game.js`:

```js
import { getDb, roomCode } from './room.js';
import { get, ref } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

async function getHoleCardsOnce(targetUid) {
  const snap = await get(ref(getDb(), `privateData/${roomCode}/holeCards/${targetUid}`));
  return snap.val();
}

async function getCurrentRoom() {
  const snap = await get(ref(getDb(), `rooms/${roomCode}`));
  return snap.val();
}
```

- [ ] **Step 3: Run full test suite one final time**

```
npm test
```

Expected: all three test files pass

- [ ] **Step 4: Commit**

```bash
git add js/holdem-game.js js/room.js
git commit -m "feat: holdem-game — showdown, pot award, next hand"
```

---

## Self-Review Checklist

- [x] Spec coverage: engine (Tasks 1–4), lobby (Task 5), Firebase helpers (Task 6), HTML (Task 7), CSS (Task 8), UI (Tasks 9–10), game layer (Tasks 11–14)
- [x] No TBDs or TODOs in any step
- [x] `acted` field introduced in Task 4 and used consistently in Tasks 11–13
- [x] `getDb()` added to `room.js` in Task 14 before it's used
- [x] Card rank `'10'` (not `'T'`) matches BJ engine throughout
- [x] `compareHands` exported and used in Tasks 2 and 14
- [x] `calculateSidePots` signature (`players` with `uid`, `totalBet`, `folded`) matches Task 14 call sites
- [x] `getNextActionSeat` signature (`seats`, `currentSeat`, `currentBet`) consistent across Tasks 4, 12, 13
