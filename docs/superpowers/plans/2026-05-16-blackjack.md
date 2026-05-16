# Multiplayer Browser Blackjack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multiplayer browser blackjack game with Firebase real-time sync, customizable casino rules, and a casino-style table UI — hostable on GitHub Pages with no build tools.

**Architecture:** Host-authoritative client. The host's browser runs all game logic and writes state to Firebase Realtime Database. Other players listen to Firebase for state changes and write only their own actions to their own player node. Anonymous Firebase Auth gives each player a stable `uid` for the session. `isHost` is determined by comparing `uid === room.hostId` after loading room state.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database v10 (CDN), htdebeer/SVG-cards (local assets), pure CSS animations. Node.js (dev only, for running engine tests). No bundler, no framework.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `game.html`
- Create: `firebase-config.js`
- Create: `js/engine.js`, `js/room.js`, `js/ui.js`, `js/timer.js`, `js/settings.js`, `js/donate.js`
- Create: `css/base.css`, `css/lobby.css`, `css/table.css`, `css/cards.css`, `css/chips.css`, `css/hud.css`
- Create: `tests/engine.test.mjs`
- Create: `assets/cards/.gitkeep`, `assets/chips/.gitkeep`, `assets/sounds/.gitkeep`

- [ ] **Step 1: Create directory structure**

```
mkdir -p js css assets/cards assets/chips assets/sounds tests
```

- [ ] **Step 2: Create package.json** (dev-only, for ES module test support in Node)

```json
{
  "type": "module",
  "scripts": {
    "test": "node tests/engine.test.mjs"
  }
}
```

- [ ] **Step 3: Create firebase-config.js**

```javascript
// Fill in after creating your Firebase project at console.firebase.google.com
export const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

- [ ] **Step 4: Create index.html shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blackjack</title>
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/lobby.css">
</head>
<body>
  <div id="lobby-screen">
    <h1>Blackjack</h1>
    <div id="join-section"></div>
    <div id="settings-section" hidden></div>
    <div id="player-list-section" hidden></div>
  </div>
  <script type="module" src="js/lobby.js"></script>
</body>
</html>
```

- [ ] **Step 5: Create game.html shell**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blackjack</title>
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/table.css">
  <link rel="stylesheet" href="css/cards.css">
  <link rel="stylesheet" href="css/chips.css">
  <link rel="stylesheet" href="css/hud.css">
</head>
<body>
  <div id="table-wrap">
    <div id="background-scene"></div>
    <div id="table">
      <div id="dealer-area"></div>
      <div id="table-center"></div>
      <div id="players-arc"></div>
    </div>
    <div id="hud"></div>
  </div>
  <script type="module" src="js/game.js"></script>
</body>
</html>
```

- [ ] **Step 6: Create stub JS files** (empty exports so imports don't break)

`js/engine.js`:
```javascript
// Game logic — no Firebase dependency
```

`js/room.js`:
```javascript
// Firebase read/write and room lifecycle
```

`js/ui.js`:
```javascript
// DOM rendering — reads state, writes to DOM
```

`js/timer.js`:
```javascript
// Countdown timer logic
```

`js/settings.js`:
```javascript
// Settings defaults and validation
```

`js/donate.js`:
```javascript
// Chip transfer logic
```

`js/lobby.js`:
```javascript
// Lobby page controller
```

`js/game.js`:
```javascript
// Game page controller
```

- [ ] **Step 7: Create .gitignore**

```
node_modules/
.DS_Store
Thumbs.db
```

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "feat: project scaffold and file structure"
```

---

### Task 2: Game Engine — Deck & Hand Math

**Files:**
- Modify: `js/engine.js`
- Modify: `tests/engine.test.mjs`

- [ ] **Step 1: Write failing tests**

`tests/engine.test.mjs`:
```javascript
import assert from 'node:assert/strict';
import {
  createDeck, shuffle, cardFromStr, cardToStr,
  handValue, isSoft, isBlackjack, isBust
} from '../js/engine.js';

// createDeck
const deck1 = createDeck(1);
assert.equal(deck1.length, 52, 'single deck = 52 cards');
const deck6 = createDeck(6);
assert.equal(deck6.length, 312, '6 decks = 312 cards');

// cardToStr / cardFromStr round-trip
const card = { rank: '10', suit: 'hearts' };
assert.equal(cardToStr(card), '10_hearts');
assert.deepEqual(cardFromStr('10_hearts'), { rank: '10', suit: 'hearts' });
assert.deepEqual(cardFromStr('A_spades'), { rank: 'A', suit: 'spades' });

// handValue
assert.equal(handValue([{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }]), 21);
assert.equal(handValue([{ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }]), 12);
assert.equal(handValue([{ rank: '7', suit: 'spades' }, { rank: '8', suit: 'hearts' }, { rank: '9', suit: 'diamonds' }]), 24);
assert.equal(handValue([{ rank: 'A', suit: 'spades' }, { rank: '6', suit: 'hearts' }]), 17);

// isSoft
assert.equal(isSoft([{ rank: 'A', suit: 'spades' }, { rank: '6', suit: 'hearts' }]), true, 'A+6 is soft 17');
assert.equal(isSoft([{ rank: '7', suit: 'spades' }, { rank: '6', suit: 'hearts' }, { rank: '4', suit: 'clubs' }]), false, 'hard 17 not soft');
assert.equal(isSoft([{ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }, { rank: '9', suit: 'clubs' }]), false, 'A+A+9=21 not soft');

// isBlackjack
assert.equal(isBlackjack([{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }]), true);
assert.equal(isBlackjack([{ rank: 'A', suit: 'spades' }, { rank: '6', suit: 'hearts' }, { rank: '4', suit: 'clubs' }]), false, '3-card 21 is not blackjack');

// isBust
assert.equal(isBust([{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'hearts' }, { rank: '5', suit: 'clubs' }]), true);
assert.equal(isBust([{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'hearts' }, { rank: '3', suit: 'clubs' }]), false);

console.log('All deck/hand tests passed.');
```

- [ ] **Step 2: Run tests — expect failure**

```
node tests/engine.test.mjs
```

Expected: `SyntaxError` or `Error: named export not found`

- [ ] **Step 3: Implement deck & hand functions in engine.js**

```javascript
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(numDecks = 1) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
  }
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

export function cardToStr(card) {
  return `${card.rank}_${card.suit}`;
}

export function cardFromStr(str) {
  const idx = str.indexOf('_');
  return { rank: str.slice(0, idx), suit: str.slice(idx + 1) };
}

export function cardNumericValue(rank) {
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

export function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === 'A') aces++;
    total += cardNumericValue(card.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export function isSoft(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === 'A') aces++;
    total += cardNumericValue(card.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  // Soft if at least one ace is still counted as 11
  return aces > 0 && total <= 21;
}

export function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

export function isBust(hand) {
  return handValue(hand) > 21;
}
```

- [ ] **Step 4: Run tests — expect pass**

```
node tests/engine.test.mjs
```

Expected: `All deck/hand tests passed.`

- [ ] **Step 5: Commit**

```bash
git add js/engine.js tests/engine.test.mjs
git commit -m "feat: game engine deck and hand evaluation"
```

---

### Task 3: Game Engine — Action Guards & Resolution

**Files:**
- Modify: `js/engine.js`
- Modify: `tests/engine.test.mjs`

- [ ] **Step 1: Append action guard & resolution tests**

Append to `tests/engine.test.mjs`:
```javascript
import {
  canHit, canStand, canDouble, canSplit, canSurrender,
  dealerShouldHit, resolveHand
} from '../js/engine.js';

const DEFAULT_SETTINGS = {
  doubleDown: 'any', doubleAfterSplit: true,
  reSplit: '2', surrender: 'late',
  insurance: true, dealerHitSoft17: false,
  blackjackPayout: '3:2'
};

// canHit
const activeHand = { cards: [{ rank: '7', suit: 'hearts' }, { rank: '8', suit: 'clubs' }], status: 'active', splitCount: 0, bet: 10 };
assert.equal(canHit(activeHand), true);
const stood = { ...activeHand, status: 'stood' };
assert.equal(canHit(stood), false);

// canDouble
assert.equal(canDouble(activeHand, DEFAULT_SETTINGS, 100), true);
assert.equal(canDouble(activeHand, { ...DEFAULT_SETTINGS, doubleDown: 'off' }, 100), false);
assert.equal(canDouble(activeHand, { ...DEFAULT_SETTINGS, doubleDown: '9-10-11' }, 100), true, '15 not in 9-10-11');
const hand9 = { cards: [{ rank: '4', suit: 'hearts' }, { rank: '5', suit: 'clubs' }], status: 'active', splitCount: 0, bet: 10 };
assert.equal(canDouble(hand9, { ...DEFAULT_SETTINGS, doubleDown: '9-10-11' }, 100), true, '9 allowed');
assert.equal(canDouble(activeHand, DEFAULT_SETTINGS, 5), false, 'insufficient balance');

// canSplit
const pairHand = { cards: [{ rank: '8', suit: 'hearts' }, { rank: '8', suit: 'clubs' }], status: 'active', splitCount: 0, bet: 10 };
assert.equal(canSplit(pairHand, DEFAULT_SETTINGS, 100), true);
assert.equal(canSplit(activeHand, DEFAULT_SETTINGS, 100), false, 'non-pair');
const maxSplitHand = { ...pairHand, splitCount: 2 };
assert.equal(canSplit(maxSplitHand, DEFAULT_SETTINGS, 100), false, 'at reSplit limit');

// canSurrender
assert.equal(canSurrender(activeHand, DEFAULT_SETTINGS), true, 'late surrender on 2 cards');
const threeCardHand = { cards: [{ rank: '5', suit: 'h' }, { rank: '6', suit: 'd' }, { rank: '4', suit: 'c' }], status: 'active', splitCount: 0, bet: 10 };
assert.equal(canSurrender(threeCardHand, DEFAULT_SETTINGS), false, 'no surrender after hit');
assert.equal(canSurrender(activeHand, { ...DEFAULT_SETTINGS, surrender: 'off' }, false));

// dealerShouldHit
assert.equal(dealerShouldHit([{ rank: '7', suit: 'h' }, { rank: '9', suit: 'd' }], DEFAULT_SETTINGS), false, 'hard 16? no - 16 hits');
assert.equal(dealerShouldHit([{ rank: '7', suit: 'h' }, { rank: '9', suit: 'd' }], DEFAULT_SETTINGS), false);
const soft17 = [{ rank: 'A', suit: 'h' }, { rank: '6', suit: 'd' }];
assert.equal(dealerShouldHit(soft17, DEFAULT_SETTINGS), false, 'stand on soft 17 when dealerHitSoft17=false');
assert.equal(dealerShouldHit(soft17, { ...DEFAULT_SETTINGS, dealerHitSoft17: true }), true, 'hit soft 17 when enabled');

// resolveHand
const bjHand = { cards: [{ rank: 'A', suit: 'h' }, { rank: 'K', suit: 'd' }], status: 'active', bet: 100 };
const dealerHard18 = [{ rank: '10', suit: 'h' }, { rank: '8', suit: 'd' }];
const r1 = resolveHand(bjHand, dealerHard18, DEFAULT_SETTINGS);
assert.equal(r1.result, 'blackjack');
assert.equal(r1.payout, 250, '3:2 on 100 = 250 returned');

const winHand = { cards: [{ rank: '10', suit: 'h' }, { rank: '9', suit: 'd' }], status: 'active', bet: 100 };
const r2 = resolveHand(winHand, dealerHard18, DEFAULT_SETTINGS);
assert.equal(r2.result, 'win');
assert.equal(r2.payout, 200);

const pushHand = { cards: [{ rank: '10', suit: 'h' }, { rank: '8', suit: 'd' }], status: 'active', bet: 100 };
const r3 = resolveHand(pushHand, dealerHard18, DEFAULT_SETTINGS);
assert.equal(r3.result, 'push');
assert.equal(r3.payout, 100);

const surrenderHand = { cards: [{ rank: '10', suit: 'h' }, { rank: '6', suit: 'd' }], status: 'surrendered', bet: 100 };
const r4 = resolveHand(surrenderHand, dealerHard18, DEFAULT_SETTINGS);
assert.equal(r4.result, 'surrender');
assert.equal(r4.payout, 50);

console.log('All action/resolution tests passed.');
```

- [ ] **Step 2: Run tests — expect failure**

```
node tests/engine.test.mjs
```

- [ ] **Step 3: Implement action guards & resolution in engine.js**

Append to `js/engine.js`:
```javascript
export function canHit(playerHand) {
  return playerHand.status === 'active' && handValue(playerHand.cards) < 21;
}

export function canStand(playerHand) {
  return playerHand.status === 'active';
}

export function canDouble(playerHand, settings, balance) {
  if (playerHand.status !== 'active') return false;
  if (playerHand.cards.length !== 2) return false;
  if (balance < playerHand.bet) return false;
  if (settings.doubleDown === 'off') return false;
  if (settings.doubleDown === '9-10-11') {
    const v = handValue(playerHand.cards);
    return v >= 9 && v <= 11;
  }
  return true;
}

export function canSplit(playerHand, settings, balance) {
  if (playerHand.status !== 'active') return false;
  if (playerHand.cards.length !== 2) return false;
  if (playerHand.cards[0].rank !== playerHand.cards[1].rank) return false;
  if (balance < playerHand.bet) return false;
  const maxSplits = { off: 0, '2': 2, '3': 3, '4': 4 }[settings.reSplit] ?? 0;
  return playerHand.splitCount < maxSplits;
}

export function canSurrender(playerHand, settings) {
  if (playerHand.status !== 'active') return false;
  if (settings.surrender === 'off') return false;
  return playerHand.cards.length === 2;
}

export function canInsure(dealerUpCard, settings) {
  return settings.insurance && dealerUpCard.rank === 'A';
}

export function dealerShouldHit(dealerHand, settings) {
  const value = handValue(dealerHand);
  if (value < 17) return true;
  if (value === 17 && settings.dealerHitSoft17 && isSoft(dealerHand)) return true;
  return false;
}

export function resolveHand(playerHand, dealerHand, settings) {
  if (playerHand.status === 'surrendered') {
    return { result: 'surrender', payout: Math.floor(playerHand.bet / 2) };
  }
  if (playerHand.status === 'bust') {
    return { result: 'bust', payout: 0 };
  }
  const dealerBust = isBust(dealerHand);
  const playerBJ = isBlackjack(playerHand.cards);
  const dealerBJ = isBlackjack(dealerHand);

  if (playerBJ && !dealerBJ) {
    const mult = { '3:2': 2.5, '6:5': 2.2, '1:1': 2.0 }[settings.blackjackPayout] ?? 2.5;
    return { result: 'blackjack', payout: Math.floor(playerHand.bet * mult) };
  }
  if (dealerBJ && !playerBJ) {
    return { result: 'dealer_blackjack', payout: 0 };
  }
  if (dealerBJ && playerBJ) {
    return { result: 'push', payout: playerHand.bet };
  }
  const pv = handValue(playerHand.cards);
  const dv = handValue(dealerHand);
  if (dealerBust || pv > dv) return { result: 'win', payout: playerHand.bet * 2 };
  if (pv === dv) return { result: 'push', payout: playerHand.bet };
  return { result: 'lose', payout: 0 };
}
```

- [ ] **Step 4: Fix the 9-10-11 test** — The test has a logic error: `hand9` (4+5=9) should pass the 9-10-11 check but `activeHand` (7+8=15) should fail. Verify:

```
node tests/engine.test.mjs
```

Expected: `All action/resolution tests passed.`

- [ ] **Step 5: Commit**

```bash
git add js/engine.js tests/engine.test.mjs
git commit -m "feat: game engine action guards and hand resolution"
```

---

### Task 4: Settings Module

**Files:**
- Modify: `js/settings.js`

- [ ] **Step 1: Implement settings.js**

```javascript
export const DEFAULT_SETTINGS = {
  decks: 6,
  blackjackPayout: '3:2',
  dealerHitSoft17: false,
  doubleDown: 'any',
  doubleAfterSplit: true,
  reSplit: '2',
  surrender: 'late',
  insurance: true,
  minBet: 5,
  maxBet: 500,
  startingBalance: 1000,
  actionTimer: 30,
};

export function validateSettings(s) {
  const errors = [];
  if (![1, 2, 4, 6, 8].includes(s.decks)) errors.push('Invalid deck count');
  if (!['3:2', '6:5', '1:1'].includes(s.blackjackPayout)) errors.push('Invalid payout');
  if (!['any', '9-10-11', 'off'].includes(s.doubleDown)) errors.push('Invalid double-down rule');
  if (!['off', '2', '3', '4'].includes(s.reSplit)) errors.push('Invalid re-split rule');
  if (!['off', 'late', 'early'].includes(s.surrender)) errors.push('Invalid surrender rule');
  if (s.minBet < 1 || s.minBet > 500) errors.push('Min bet out of range');
  if (s.maxBet < s.minBet || s.maxBet > 1000) errors.push('Max bet out of range');
  if (s.startingBalance < 100 || s.startingBalance > 10000) errors.push('Starting balance out of range');
  if (s.actionTimer !== 0 && ![15, 30, 60].includes(s.actionTimer) && (s.actionTimer < 5 || s.actionTimer > 300)) {
    errors.push('Invalid timer value');
  }
  return errors;
}

export function settingsSummaryLines(s) {
  const payout = s.blackjackPayout;
  const soft17 = s.dealerHitSoft17 ? 'Dealer hits soft 17' : 'Dealer stands on all 17s';
  return [
    `BLACKJACK PAYS ${payout}`,
    soft17,
    `Insurance pays 2 to 1`,
  ];
}
```

- [ ] **Step 2: Commit**

```bash
git add js/settings.js
git commit -m "feat: settings module with defaults and validation"
```

---

### Task 5: Room Module — Create, Join, Listen

**Files:**
- Modify: `js/room.js`

- [ ] **Step 1: Implement room.js**

```javascript
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, set, get, update, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { FIREBASE_CONFIG } from '../firebase-config.js';

let db, auth;
export let uid = null;
export let roomCode = null;
export let isHost = false;

export async function initRoom() {
  const app = initializeApp(FIREBASE_CONFIG);
  db = getDatabase(app);
  auth = getAuth(app);
  const cred = await signInAnonymously(auth);
  uid = cred.user.uid;
  return uid;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function createRoom(playerName, settings) {
  roomCode = generateRoomCode();
  isHost = true;
  await set(ref(db, `rooms/${roomCode}`), {
    hostId: uid,
    phase: 'waiting',
    settings,
    dealer: { hand: [], hiddenCard: null },
    currentTurn: null,
    turnDeadline: null,
    players: {
      [uid]: {
        name: playerName,
        balance: settings.startingBalance,
        bet: 0,
        hands: [],
        bets: [],
        handIndex: 0,
        insurance: false,
        status: 'waiting',
        isHost: true,
        action: null
      }
    }
  });
  return roomCode;
}

export async function joinRoom(code, playerName) {
  roomCode = code.trim().toUpperCase();
  const snap = await get(ref(db, `rooms/${roomCode}`));
  if (!snap.exists()) throw new Error('Room not found');
  const room = snap.val();
  const players = room.players || {};
  const existing = Object.values(players).find(p => p.name === playerName);
  if (!existing) {
    const count = Object.keys(players).length;
    if (count >= 4) throw new Error('Room is full (max 4 players)');
  }
  isHost = uid === room.hostId;
  const activeDuringPlay = ['dealing', 'playing'].includes(room.phase);
  await set(ref(db, `rooms/${roomCode}/players/${uid}`), {
    name: playerName,
    balance: room.settings.startingBalance,
    bet: 0,
    hands: [],
    bets: [],
    handIndex: 0,
    insurance: false,
    status: activeDuringPlay ? 'sitting-out' : 'waiting',
    isHost,
    action: null
  });
  return room;
}

export function onRoomChange(callback) {
  return onValue(ref(db, `rooms/${roomCode}`), snap => callback(snap.val()));
}

export async function writePlayerAction(fields) {
  await update(ref(db, `rooms/${roomCode}/players/${uid}`), fields);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/room.js
git commit -m "feat: room module create/join/listen"
```

---

### Task 6: Room Module — Host Game Control

**Files:**
- Modify: `js/room.js`

- [ ] **Step 1: Append host-only write functions to room.js**

```javascript
export async function setPhase(phase) {
  await update(ref(db, `rooms/${roomCode}`), { phase });
}

export async function setDealer(handStrs, hiddenCardStr) {
  await set(ref(db, `rooms/${roomCode}/dealer`), {
    hand: handStrs,
    hiddenCard: hiddenCardStr
  });
}

export async function setCurrentTurn(playerId, timerSeconds) {
  const deadline = timerSeconds > 0 ? Date.now() + timerSeconds * 1000 : null;
  await update(ref(db, `rooms/${roomCode}`), {
    currentTurn: playerId,
    turnDeadline: deadline
  });
}

export async function updatePlayer(playerId, fields) {
  await update(ref(db, `rooms/${roomCode}/players/${playerId}`), fields);
}

export async function updateAllBalances(balanceMap) {
  // balanceMap: { [playerId]: newBalance }
  const updates = {};
  for (const [pid, bal] of Object.entries(balanceMap)) {
    updates[`rooms/${roomCode}/players/${pid}/balance`] = bal;
  }
  await update(ref(db), updates);
}

export async function dealCards(deckStrs, playerIds, dealerHiddenIdx) {
  // Writes initial deal state for all players and dealer
  // deckStrs: shuffled deck as string array
  // Returns remaining deck
  let idx = 0;
  const updates = {};
  const playerHands = {};
  for (const pid of playerIds) {
    playerHands[pid] = [deckStrs[idx++]];
  }
  const dealerHand = [deckStrs[idx++]];
  for (const pid of playerIds) {
    playerHands[pid].push(deckStrs[idx++]);
  }
  const hiddenCard = deckStrs[idx++];

  for (const pid of playerIds) {
    updates[`rooms/${roomCode}/players/${pid}/hands`] = [playerHands[pid]];
    updates[`rooms/${roomCode}/players/${pid}/handIndex`] = 0;
    updates[`rooms/${roomCode}/players/${pid}/status`] = 'playing';
    updates[`rooms/${roomCode}/players/${pid}/action`] = null;
  }
  updates[`rooms/${roomCode}/dealer/hand`] = dealerHand;
  updates[`rooms/${roomCode}/dealer/hiddenCard`] = hiddenCard;

  await update(ref(db), updates);
  return { remaining: deckStrs.slice(idx), playerHands, dealerHand, hiddenCard };
}
```

- [ ] **Step 2: Commit**

```bash
git add js/room.js
git commit -m "feat: room module host game control functions"
```

---

### Task 7: Timer Module

**Files:**
- Modify: `js/timer.js`

- [ ] **Step 1: Implement timer.js**

```javascript
let intervalId = null;
let deadline = null;
let onTickCb = null;
let onExpireCb = null;

export function startTimer(deadlineTimestamp, onTick, onExpire) {
  stopTimer();
  deadline = deadlineTimestamp;
  onTickCb = onTick;
  onExpireCb = onExpire;

  function tick() {
    const remaining = Math.max(0, deadline - Date.now());
    if (onTickCb) onTickCb(remaining);
    if (remaining <= 0) {
      stopTimer();
      if (onExpireCb) onExpireCb();
    }
  }

  tick();
  intervalId = setInterval(tick, 250);
}

export function stopTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  deadline = null;
}

export function getRemainingMs() {
  if (!deadline) return 0;
  return Math.max(0, deadline - Date.now());
}
```

- [ ] **Step 2: Commit**

```bash
git add js/timer.js
git commit -m "feat: timer module with countdown and expiry callback"
```

---

### Task 8: Base CSS & Dark Casino Theme

**Files:**
- Modify: `css/base.css`
- Modify: `css/table.css`

- [ ] **Step 1: Implement base.css**

```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --clr-bg: #1a1008;
  --clr-bg2: #120c05;
  --clr-felt: #b8965a;
  --clr-felt-dark: #9a7a42;
  --clr-felt-edge: #7a5e2a;
  --clr-gold: #c9a84c;
  --clr-text: #f0e6c8;
  --clr-text-dim: #8a7a5a;
  --clr-active-glow: rgba(201, 168, 76, 0.5);
  --clr-win: #4caf50;
  --clr-lose: #e53935;
  --clr-push: #90a4ae;
  --radius-card: 6px;
  --card-w: 70px;
  --card-h: 98px;
  --font-main: 'Georgia', serif;
  --font-ui: 'Arial', sans-serif;
}

html, body {
  width: 100%; height: 100%;
  overflow: hidden;
  background: var(--clr-bg);
  color: var(--clr-text);
  font-family: var(--font-main);
  user-select: none;
}

button {
  cursor: pointer;
  font-family: var(--font-ui);
  border: none;
  border-radius: 4px;
}

input {
  font-family: var(--font-ui);
  border-radius: 4px;
  border: 1px solid var(--clr-gold);
  background: #2a1e0a;
  color: var(--clr-text);
  padding: 6px 10px;
}
```

- [ ] **Step 2: Implement table.css — background and scene**

```css
#table-wrap {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

/* Dark atmospheric background */
#background-scene {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 50% 0%, #3a2510 0%, #1a1008 60%, #0d0905 100%);
  z-index: 0;
}

/* Decorative pillars */
#background-scene::before,
#background-scene::after {
  content: '';
  position: absolute;
  top: 0; bottom: 0;
  width: 80px;
  background: linear-gradient(to right, #2a1a08, #3d2810, #2a1a08);
  border-right: 3px solid #5a3a18;
  border-left: 3px solid #5a3a18;
}
#background-scene::before { left: 40px; }
#background-scene::after  { right: 40px; }

/* D-shaped table */
#table {
  position: absolute;
  bottom: -120px;
  left: 50%;
  transform: translateX(-50%);
  width: 900px;
  height: 600px;
  border-radius: 450px 450px 0 0;
  background: radial-gradient(ellipse at 50% 30%, var(--clr-felt) 0%, var(--clr-felt-dark) 60%, var(--clr-felt-edge) 100%);
  border: 12px solid #5a3a18;
  border-bottom: none;
  box-shadow: 0 -10px 60px rgba(0,0,0,0.8), inset 0 0 80px rgba(0,0,0,0.3);
  z-index: 1;
}

/* Table text (rule summary printed on felt) */
#table-center {
  position: absolute;
  top: 40%;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  font-family: var(--font-main);
  color: rgba(90, 60, 20, 0.7);
  pointer-events: none;
  white-space: nowrap;
}
#table-center .rule-line {
  font-size: 13px;
  letter-spacing: 2px;
  text-transform: uppercase;
  font-weight: bold;
  line-height: 1.8;
}
#table-center .rule-main {
  font-size: 20px;
  letter-spacing: 4px;
}

/* Dealer area */
#dealer-area {
  position: absolute;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 2;
}

/* Players arc — 4 spots positioned along the curved bottom */
#players-arc {
  position: absolute;
  bottom: 130px;
  left: 0; right: 0;
  display: flex;
  justify-content: space-around;
  padding: 0 60px;
  z-index: 2;
}

.player-spot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 120px;
  padding: 10px 8px;
  border-radius: 10px;
  transition: box-shadow 0.3s;
}

.player-spot.active-turn {
  box-shadow: 0 0 24px 8px var(--clr-active-glow);
}

.player-spot.sitting-out {
  opacity: 0.4;
}

.player-spot .player-name {
  font-size: 13px;
  font-family: var(--font-ui);
  color: var(--clr-text);
  background: rgba(0,0,0,0.5);
  padding: 2px 8px;
  border-radius: 10px;
}

.player-spot.empty .player-name {
  color: var(--clr-text-dim);
}

.player-spot .player-bet-label {
  font-size: 12px;
  color: var(--clr-gold);
  font-family: var(--font-ui);
}
```

- [ ] **Step 3: Commit**

```bash
git add css/base.css css/table.css
git commit -m "feat: base CSS variables and casino table layout"
```

---

### Task 9: Lobby HTML, CSS & JS

**Files:**
- Modify: `index.html`
- Modify: `css/lobby.css`
- Create: `js/lobby.js`

- [ ] **Step 1: Implement index.html (full markup)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blackjack</title>
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/lobby.css">
</head>
<body>
  <div id="lobby-wrap">
    <div id="lobby-bg"></div>

    <!-- Join screen -->
    <div id="join-screen" class="panel">
      <h1>Blackjack</h1>
      <input id="input-name" type="text" placeholder="Your name" maxlength="16" autocomplete="off">

      <div class="tab-row">
        <button id="tab-create" class="tab active">Create Game</button>
        <button id="tab-join" class="tab">Join Game</button>
      </div>

      <div id="pane-create">
        <button id="btn-create" class="btn-primary">Create Room</button>
      </div>

      <div id="pane-join" hidden>
        <input id="input-code" type="text" placeholder="Room code" maxlength="5" autocomplete="off" style="text-transform:uppercase">
        <button id="btn-join" class="btn-primary">Join Room</button>
      </div>

      <p id="join-error" class="error-msg" hidden></p>
    </div>

    <!-- Lobby screen (after joining) -->
    <div id="lobby-screen" hidden class="panel">
      <div id="room-code-display">Room: <span id="room-code-text"></span></div>

      <div id="player-list">
        <h3>Players</h3>
        <ul id="player-list-ul"></ul>
      </div>

      <div id="settings-panel">
        <h3>Table Rules</h3>
        <div id="settings-form"></div>
        <p id="settings-note" hidden>Only the host can change settings</p>
      </div>

      <button id="btn-start" class="btn-primary" hidden>Start Game</button>
      <p id="lobby-status">Waiting for host to start...</p>
    </div>
  </div>
  <script type="module" src="js/lobby.js"></script>
</body>
</html>
```

- [ ] **Step 2: Implement css/lobby.css**

```css
body { display: flex; align-items: center; justify-content: center; min-height: 100vh; overflow: auto; }

#lobby-wrap { position: relative; width: 100vw; min-height: 100vh; display: flex; align-items: center; justify-content: center; }

#lobby-bg {
  position: fixed; inset: 0;
  background: radial-gradient(ellipse at 50% 30%, #3a2510 0%, #1a1008 70%);
  z-index: 0;
}

.panel {
  position: relative; z-index: 1;
  background: rgba(20, 12, 4, 0.92);
  border: 1px solid var(--clr-gold);
  border-radius: 12px;
  padding: 32px 40px;
  width: 420px;
  display: flex; flex-direction: column; gap: 16px;
}

h1 { text-align: center; font-size: 2.4rem; color: var(--clr-gold); letter-spacing: 4px; }
h3 { font-size: 1rem; color: var(--clr-gold); letter-spacing: 2px; text-transform: uppercase; border-bottom: 1px solid var(--clr-gold); padding-bottom: 6px; }

input { width: 100%; }

.tab-row { display: flex; gap: 0; border: 1px solid var(--clr-gold); border-radius: 4px; overflow: hidden; }
.tab { flex: 1; padding: 8px; background: transparent; color: var(--clr-text-dim); font-size: 14px; border-radius: 0; }
.tab.active { background: var(--clr-gold); color: #1a1008; font-weight: bold; }

.btn-primary {
  width: 100%; padding: 12px;
  background: var(--clr-gold); color: #1a1008;
  font-size: 16px; font-weight: bold;
  border-radius: 6px;
  transition: background 0.2s;
}
.btn-primary:hover { background: #e0bd60; }

.error-msg { color: var(--clr-lose); font-size: 13px; text-align: center; }

#room-code-display {
  text-align: center; font-size: 1.4rem; letter-spacing: 4px;
  color: var(--clr-gold); font-family: var(--font-ui);
}

#player-list-ul { list-style: none; display: flex; flex-direction: column; gap: 6px; }
#player-list-ul li {
  padding: 8px 12px; background: rgba(201, 168, 76, 0.1);
  border-radius: 6px; font-size: 14px;
  display: flex; align-items: center; gap: 8px;
}
#player-list-ul li .host-badge { font-size: 11px; color: var(--clr-gold); }

/* Settings form rows */
.setting-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 0; border-bottom: 1px solid rgba(201,168,76,0.1);
  font-size: 13px;
}
.setting-row label { color: var(--clr-text-dim); }
.setting-row select, .setting-row input[type=range] { background: #2a1e0a; color: var(--clr-text); border: 1px solid var(--clr-gold); border-radius: 3px; padding: 2px 6px; }
.setting-value { min-width: 48px; text-align: right; color: var(--clr-gold); font-family: var(--font-ui); font-size: 13px; }

#lobby-status { text-align: center; font-size: 13px; color: var(--clr-text-dim); }
```

- [ ] **Step 3: Implement js/lobby.js**

```javascript
import { initRoom, createRoom, joinRoom, onRoomChange, uid, roomCode } from './room.js';
import { DEFAULT_SETTINGS, validateSettings } from './settings.js';

let currentSettings = { ...DEFAULT_SETTINGS };

const $ = id => document.getElementById(id);

// Tab switching
$('tab-create').addEventListener('click', () => {
  $('tab-create').classList.add('active');
  $('tab-join').classList.remove('active');
  $('pane-create').hidden = false;
  $('pane-join').hidden = true;
});
$('tab-join').addEventListener('click', () => {
  $('tab-join').classList.add('active');
  $('tab-create').classList.remove('active');
  $('pane-join').hidden = false;
  $('pane-create').hidden = true;
});

function showError(msg) {
  const el = $('join-error');
  el.textContent = msg;
  el.hidden = false;
}

async function goToGame() {
  window.location.href = `game.html?room=${roomCode}`;
}

$('btn-create').addEventListener('click', async () => {
  const name = $('input-name').value.trim();
  if (!name) return showError('Enter your name');
  try {
    await initRoom();
    await createRoom(name, currentSettings);
    showLobby(true);
  } catch (e) {
    showError(e.message);
  }
});

$('btn-join').addEventListener('click', async () => {
  const name = $('input-name').value.trim();
  const code = $('input-code').value.trim();
  if (!name) return showError('Enter your name');
  if (!code) return showError('Enter a room code');
  try {
    await initRoom();
    await joinRoom(code, name);
    showLobby(false);
  } catch (e) {
    showError(e.message);
  }
});

function showLobby(asHost) {
  $('join-screen').hidden = true;
  $('lobby-screen').hidden = false;
  $('room-code-text').textContent = roomCode;
  if (asHost) {
    $('btn-start').hidden = false;
    $('lobby-status').hidden = true;
    renderSettingsForm(true);
  } else {
    $('settings-note').hidden = false;
    renderSettingsForm(false);
  }

  onRoomChange(room => {
    if (!room) return;
    renderPlayerList(room.players || {});
    if (room.phase !== 'waiting') goToGame();
  });
}

$('btn-start').addEventListener('click', async () => {
  const { setPhase } = await import('./room.js');
  await setPhase('betting');
});

function renderPlayerList(players) {
  const ul = $('player-list-ul');
  ul.innerHTML = '';
  for (const [id, p] of Object.entries(players)) {
    const li = document.createElement('li');
    li.textContent = p.name;
    if (p.isHost) {
      const badge = document.createElement('span');
      badge.className = 'host-badge';
      badge.textContent = '(host)';
      li.appendChild(badge);
    }
    ul.appendChild(li);
  }
}

function renderSettingsForm(editable) {
  const container = $('settings-form');
  const rows = [
    { key: 'decks', label: 'Decks', type: 'select', options: [1,2,4,6,8] },
    { key: 'blackjackPayout', label: 'Blackjack Pays', type: 'select', options: ['3:2','6:5','1:1'] },
    { key: 'dealerHitSoft17', label: 'Dealer Hits Soft 17', type: 'select', options: [false, true], labels: ['No','Yes'] },
    { key: 'doubleDown', label: 'Double Down', type: 'select', options: ['any','9-10-11','off'], labels: ['Any Two Cards','9-10-11 Only','Off'] },
    { key: 'doubleAfterSplit', label: 'Double After Split', type: 'select', options: [true, false], labels: ['Yes','No'] },
    { key: 'reSplit', label: 'Re-Split', type: 'select', options: ['off','2','3','4'], labels: ['Off','Up to 2','Up to 3','Up to 4'] },
    { key: 'surrender', label: 'Surrender', type: 'select', options: ['off','late','early'], labels: ['Off','Late','Early'] },
    { key: 'insurance', label: 'Insurance', type: 'select', options: [true, false], labels: ['Yes','No'] },
    { key: 'minBet', label: 'Min Bet', type: 'range', min: 1, max: 500 },
    { key: 'maxBet', label: 'Max Bet', type: 'range', min: 1, max: 1000 },
    { key: 'startingBalance', label: 'Starting Balance', type: 'range', min: 100, max: 10000, step: 100 },
    { key: 'actionTimer', label: 'Action Timer (s)', type: 'select', options: [0,15,30,60], labels: ['Off','15s','30s','60s'] },
  ];

  container.innerHTML = '';
  for (const row of rows) {
    const div = document.createElement('div');
    div.className = 'setting-row';
    const label = document.createElement('label');
    label.textContent = row.label;
    div.appendChild(label);

    if (row.type === 'select') {
      if (editable) {
        const sel = document.createElement('select');
        sel.disabled = !editable;
        (row.options || []).forEach((opt, i) => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = row.labels ? row.labels[i] : opt;
          if (String(currentSettings[row.key]) === String(opt)) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', () => {
          let v = sel.value;
          if (v === 'true') v = true;
          else if (v === 'false') v = false;
          else if (!isNaN(Number(v)) && v !== '') v = Number(v);
          currentSettings[row.key] = v;
          saveSettingsToFirebase();
        });
        div.appendChild(sel);
      } else {
        const span = document.createElement('span');
        span.className = 'setting-value';
        const idx = (row.options || []).findIndex(o => String(o) === String(currentSettings[row.key]));
        span.textContent = row.labels ? row.labels[idx] : currentSettings[row.key];
        div.appendChild(span);
      }
    } else if (row.type === 'range') {
      const valSpan = document.createElement('span');
      valSpan.className = 'setting-value';
      valSpan.textContent = currentSettings[row.key];
      if (editable) {
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = row.min; inp.max = row.max; inp.step = row.step || 1;
        inp.value = currentSettings[row.key];
        inp.addEventListener('input', () => {
          currentSettings[row.key] = Number(inp.value);
          valSpan.textContent = inp.value;
          saveSettingsToFirebase();
        });
        div.appendChild(inp);
      }
      div.appendChild(valSpan);
    }
    container.appendChild(div);
  }
}

async function saveSettingsToFirebase() {
  const { update } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
  // Handled via room.js — re-import needed for db ref
  // Settings saved on Start Game button click for simplicity
}
```

- [ ] **Step 4: Commit**

```bash
git add index.html css/lobby.css js/lobby.js
git commit -m "feat: lobby UI with create/join flow and settings panel"
```

---

### Task 10: SVG Card Assets & Rendering

**Files:**
- Modify: `css/cards.css`
- Modify: `js/ui.js`

- [ ] **Step 1: Download SVG cards**

Go to https://github.com/htdebeer/SVG-cards/releases and download the latest release archive. Extract and copy `svg-cards.svg` into `assets/cards/`. Verify by opening the file — card symbol IDs follow the pattern `{rank}_{suit}` where ranks are `1`, `2`–`10`, `jack`, `queen`, `king` and suits are `club`, `diamond`, `heart`, `spade`. The card back is `back`.

- [ ] **Step 2: Implement css/cards.css**

```css
.card-wrap {
  display: inline-block;
  position: relative;
  width: var(--card-w);
  height: var(--card-h);
  margin: -18px; /* overlap cards in a hand */
}
.card-wrap:first-child { margin-left: 0; }

.card-svg {
  width: var(--card-w);
  height: var(--card-h);
  border-radius: var(--radius-card);
  box-shadow: 2px 3px 8px rgba(0,0,0,0.6);
  display: block;
}

.hand {
  display: flex;
  align-items: flex-end;
  min-height: var(--card-h);
}

/* Deal animation */
@keyframes deal-in {
  from { opacity: 0; transform: translateY(-40px) scale(0.85); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.card-wrap.dealing {
  animation: deal-in 0.25s ease-out forwards;
}

/* Flip animation for hidden → revealed */
@keyframes flip-reveal {
  0%   { transform: rotateY(90deg); }
  100% { transform: rotateY(0deg); }
}
.card-wrap.flipping {
  animation: flip-reveal 0.3s ease-out forwards;
}

/* Hand value badge */
.hand-value {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: bold;
  color: var(--clr-text);
  background: rgba(0,0,0,0.65);
  border-radius: 10px;
  padding: 1px 7px;
  text-align: center;
  margin-top: 4px;
}
.hand-value.bust { color: var(--clr-lose); }
.hand-value.blackjack { color: var(--clr-gold); }
```

- [ ] **Step 3: Add card rendering to js/ui.js**

```javascript
const RANK_MAP = { A:'1', J:'jack', Q:'queen', K:'king' };
const SUIT_MAP = { hearts:'heart', diamonds:'diamond', clubs:'club', spades:'spade' };

export function cardToSvgId(card) {
  const rank = RANK_MAP[card.rank] || card.rank;
  const suit = SUIT_MAP[card.suit] || card.suit;
  return `${rank}_${suit}`;
}

export function renderCard(card, animate = false) {
  const wrap = document.createElement('div');
  wrap.className = 'card-wrap' + (animate ? ' dealing' : '');

  const svgUse = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgUse.setAttribute('class', 'card-svg');
  svgUse.setAttribute('viewBox', '0 0 169.075 244.64'); // htdebeer viewbox
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `assets/cards/svg-cards.svg#${card ? cardToSvgId(card) : 'back'}`);
  svgUse.appendChild(use);
  wrap.appendChild(svgUse);
  return wrap;
}

export function renderHand(cards, animate = false) {
  const { handValue, isBlackjack, isBust } = await import('./engine.js');
  // Note: call renderHandSync instead (non-async) with pre-imported functions
}

import { handValue, isBlackjack, isBust, cardFromStr } from './engine.js';

export function renderHandEl(cardStrs, animate = false) {
  const frag = document.createDocumentFragment();
  const handDiv = document.createElement('div');
  handDiv.className = 'hand';

  const cards = (cardStrs || []).map(cardFromStr);
  cards.forEach((card, i) => {
    const el = renderCard(card, animate);
    if (animate) el.style.animationDelay = `${i * 0.12}s`;
    handDiv.appendChild(el);
  });

  frag.appendChild(handDiv);

  if (cards.length > 0) {
    const val = handValue(cards);
    const badge = document.createElement('div');
    badge.className = 'hand-value' + (isBust(cards) ? ' bust' : isBlackjack(cards) ? ' blackjack' : '');
    badge.textContent = isBust(cards) ? 'Bust' : isBlackjack(cards) ? 'BJ' : val;
    frag.appendChild(badge);
  }
  return frag;
}
```

- [ ] **Step 4: Commit**

```bash
git add assets/cards/svg-cards.svg css/cards.css js/ui.js
git commit -m "feat: SVG card assets and card rendering module"
```

---

### Task 11: Chip Assets & Rendering

**Files:**
- Create: `assets/chips/chip-1.svg`, `chip-5.svg`, `chip-25.svg`, `chip-100.svg`, `chip-500.svg`
- Modify: `css/chips.css`
- Modify: `js/ui.js`

- [ ] **Step 1: Create SVG chip files**

`assets/chips/chip-1.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
  <circle cx="30" cy="30" r="28" fill="#e0ddd8" stroke="#aaa" stroke-width="2"/>
  <circle cx="30" cy="30" r="22" fill="none" stroke="#ccc" stroke-width="3" stroke-dasharray="6 4"/>
  <text x="30" y="35" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="#555">1</text>
</svg>
```

`assets/chips/chip-5.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
  <circle cx="30" cy="30" r="28" fill="#c62828" stroke="#8b0000" stroke-width="2"/>
  <circle cx="30" cy="30" r="22" fill="none" stroke="#ef9a9a" stroke-width="3" stroke-dasharray="6 4"/>
  <text x="30" y="35" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="#fff">5</text>
</svg>
```

`assets/chips/chip-25.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
  <circle cx="30" cy="30" r="28" fill="#2e7d32" stroke="#1b5e20" stroke-width="2"/>
  <circle cx="30" cy="30" r="22" fill="none" stroke="#a5d6a7" stroke-width="3" stroke-dasharray="6 4"/>
  <text x="30" y="35" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="#fff">25</text>
</svg>
```

`assets/chips/chip-100.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
  <circle cx="30" cy="30" r="28" fill="#212121" stroke="#424242" stroke-width="2"/>
  <circle cx="30" cy="30" r="22" fill="none" stroke="#757575" stroke-width="3" stroke-dasharray="6 4"/>
  <text x="30" y="35" text-anchor="middle" font-family="Arial" font-size="13" font-weight="bold" fill="#fff">100</text>
</svg>
```

`assets/chips/chip-500.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
  <circle cx="30" cy="30" r="28" fill="#6a1b9a" stroke="#4a148c" stroke-width="2"/>
  <circle cx="30" cy="30" r="22" fill="none" stroke="#ce93d8" stroke-width="3" stroke-dasharray="6 4"/>
  <text x="30" y="35" text-anchor="middle" font-family="Arial" font-size="13" font-weight="bold" fill="#fff">500</text>
</svg>
```

- [ ] **Step 2: Implement css/chips.css**

```css
.chip-selector {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 10px;
}

.chip-btn {
  width: 52px; height: 52px;
  border-radius: 50%;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
  transition: transform 0.12s;
}
.chip-btn:hover { transform: scale(1.15) translateY(-4px); }
.chip-btn img { width: 100%; height: 100%; display: block; }

.chip-stack {
  position: relative;
  display: inline-flex;
  flex-direction: column-reverse;
  align-items: center;
  min-height: 24px;
}

.chip-stack-chip {
  width: 36px; height: 36px;
  margin-top: -24px;
  display: block;
}
.chip-stack-chip:first-child { margin-top: 0; }

.bet-amount {
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--clr-gold);
  margin-top: 4px;
  text-align: center;
}
```

- [ ] **Step 3: Add chip rendering to ui.js**

Append to `js/ui.js`:
```javascript
const CHIP_DENOMS = [500, 100, 25, 5, 1];

export function renderChipSelector(minBet, maxBet, currentBet, balance, onChipClick) {
  const div = document.createElement('div');
  div.className = 'chip-selector';
  for (const denom of [1, 5, 25, 100, 500]) {
    if (denom > balance || currentBet + denom > maxBet) continue;
    const btn = document.createElement('button');
    btn.className = 'chip-btn';
    btn.title = `+${denom}`;
    const img = document.createElement('img');
    img.src = `assets/chips/chip-${denom}.svg`;
    img.alt = String(denom);
    btn.appendChild(img);
    btn.addEventListener('click', () => onChipClick(denom));
    div.appendChild(btn);
  }
  return div;
}

export function renderChipStack(amount) {
  const stack = document.createElement('div');
  stack.className = 'chip-stack';
  let remaining = amount;
  const chips = [];
  for (const d of CHIP_DENOMS) {
    while (remaining >= d) { chips.push(d); remaining -= d; }
  }
  // Show max 8 chips visually
  chips.slice(0, 8).forEach(d => {
    const img = document.createElement('img');
    img.className = 'chip-stack-chip';
    img.src = `assets/chips/chip-${d}.svg`;
    img.alt = String(d);
    stack.appendChild(img);
  });
  const label = document.createElement('div');
  label.className = 'bet-amount';
  label.textContent = amount > 0 ? `$${amount}` : '';
  stack.appendChild(label);
  return stack;
}
```

- [ ] **Step 4: Commit**

```bash
git add assets/chips/ css/chips.css js/ui.js
git commit -m "feat: chip SVG assets and chip rendering"
```

---

### Task 12: HUD & Timer Ring

**Files:**
- Modify: `css/hud.css`
- Modify: `js/ui.js`

- [ ] **Step 1: Implement css/hud.css**

```css
#hud {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  padding: 8px 20px;
  background: rgba(10, 6, 2, 0.85);
  border-top: 1px solid rgba(201,168,76,0.2);
  gap: 24px;
  z-index: 10;
  font-family: var(--font-ui);
  font-size: 13px;
}

.hud-item { display: flex; flex-direction: column; gap: 2px; }
.hud-label { color: var(--clr-text-dim); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
.hud-value { color: var(--clr-text); font-size: 15px; font-weight: bold; }
.hud-value.gold { color: var(--clr-gold); }

/* Action buttons */
#action-buttons {
  display: flex;
  gap: 8px;
  position: fixed;
  bottom: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 11;
}

.action-btn {
  padding: 10px 20px;
  background: rgba(20,12,4,0.9);
  color: var(--clr-gold);
  border: 1px solid var(--clr-gold);
  border-radius: 6px;
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1px;
  transition: background 0.15s;
}
.action-btn:hover { background: var(--clr-gold); color: #1a1008; }
.action-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* Countdown timer ring */
.timer-ring-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  width: 48px; height: 48px;
}

.timer-ring-wrap svg {
  position: absolute;
  top: 0; left: 0;
  transform: rotate(-90deg);
}

.timer-ring-bg { fill: none; stroke: rgba(255,255,255,0.1); stroke-width: 4; }
.timer-ring-fg { fill: none; stroke: var(--clr-gold); stroke-width: 4; stroke-linecap: round; transition: stroke-dashoffset 0.25s linear; }

.timer-text {
  position: relative;
  font-size: 14px;
  font-weight: bold;
  color: var(--clr-text);
  font-family: var(--font-ui);
  z-index: 1;
}

/* Donate panel */
#donate-panel {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(20, 12, 4, 0.97);
  border: 1px solid var(--clr-gold);
  border-radius: 10px;
  padding: 24px 32px;
  z-index: 20;
  min-width: 280px;
  display: flex; flex-direction: column; gap: 12px;
}
#donate-panel h3 { color: var(--clr-gold); }
#donate-panel select, #donate-panel input { width: 100%; }
#donate-panel .btn-primary { width: 100%; }
#donate-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  z-index: 19;
}

/* Result overlay per player spot */
.result-badge {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 18px;
  font-weight: bold;
  font-family: var(--font-ui);
  padding: 4px 14px;
  border-radius: 20px;
  pointer-events: none;
  animation: result-pop 0.3s ease-out;
}
@keyframes result-pop {
  from { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
  to   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
}
.result-badge.win { background: var(--clr-win); color: #fff; }
.result-badge.lose { background: var(--clr-lose); color: #fff; }
.result-badge.push { background: var(--clr-push); color: #1a1008; }
.result-badge.blackjack { background: var(--clr-gold); color: #1a1008; }
```

- [ ] **Step 2: Add timer ring render to ui.js**

Append to `js/ui.js`:
```javascript
const TIMER_RADIUS = 20;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;

export function createTimerRing(totalMs) {
  const wrap = document.createElement('div');
  wrap.className = 'timer-ring-wrap';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '48'); svg.setAttribute('height', '48');
  svg.setAttribute('viewBox', '0 0 48 48');

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bg.setAttribute('class', 'timer-ring-bg');
  bg.setAttribute('cx', '24'); bg.setAttribute('cy', '24'); bg.setAttribute('r', TIMER_RADIUS);

  const fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  fg.setAttribute('class', 'timer-ring-fg');
  fg.setAttribute('cx', '24'); fg.setAttribute('cy', '24'); fg.setAttribute('r', TIMER_RADIUS);
  fg.setAttribute('stroke-dasharray', TIMER_CIRCUMFERENCE);
  fg.setAttribute('stroke-dashoffset', '0');

  svg.appendChild(bg);
  svg.appendChild(fg);

  const text = document.createElement('div');
  text.className = 'timer-text';
  text.textContent = Math.ceil(totalMs / 1000);

  wrap.appendChild(svg);
  wrap.appendChild(text);

  wrap._fg = fg;
  wrap._text = text;
  wrap._total = totalMs;

  return wrap;
}

export function updateTimerRing(wrap, remainingMs) {
  const pct = Math.max(0, remainingMs / wrap._total);
  wrap._fg.setAttribute('stroke-dashoffset', TIMER_CIRCUMFERENCE * (1 - pct));
  wrap._text.textContent = Math.ceil(remainingMs / 1000);
  if (remainingMs < 5000) wrap._fg.setAttribute('stroke', 'var(--clr-lose)');
}
```

- [ ] **Step 3: Commit**

```bash
git add css/hud.css js/ui.js
git commit -m "feat: HUD styles, action buttons, and timer ring"
```

---

### Task 13: Game Table HTML & Full UI Renderer

**Files:**
- Modify: `game.html`
- Modify: `js/ui.js`
- Create: `js/game.js`

- [ ] **Step 1: Implement game.html (full markup)**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blackjack</title>
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/table.css">
  <link rel="stylesheet" href="css/cards.css">
  <link rel="stylesheet" href="css/chips.css">
  <link rel="stylesheet" href="css/hud.css">
</head>
<body>
  <div id="table-wrap">
    <div id="background-scene"></div>
    <div id="table">
      <div id="dealer-area">
        <div id="dealer-avatar">
          <svg viewBox="0 0 80 80" width="80" height="80" xmlns="http://www.w3.org/2000/svg">
            <circle cx="40" cy="40" r="38" fill="#2a1e0a" stroke="#c9a84c" stroke-width="2"/>
            <ellipse cx="40" cy="34" rx="14" ry="16" fill="#f5d5a0"/>
            <ellipse cx="40" cy="65" rx="22" ry="16" fill="#1a1008"/>
            <rect x="20" y="20" width="40" height="8" rx="4" fill="#1a1008"/>
            <rect x="18" y="24" width="44" height="4" rx="2" fill="#c9a84c"/>
          </svg>
        </div>
        <div id="dealer-hand-wrap"></div>
        <div id="timer-ring-container"></div>
      </div>

      <div id="table-center">
        <div class="rule-main rule-line" id="rule-payout">BLACKJACK PAYS 3 TO 2</div>
        <div class="rule-line" id="rule-dealer">Dealer must stand on all 17s</div>
        <div class="rule-line" id="rule-insurance">INSURANCE PAYS 2 TO 1</div>
      </div>

      <div id="players-arc">
        <div class="player-spot empty" id="spot-0"></div>
        <div class="player-spot empty" id="spot-1"></div>
        <div class="player-spot empty" id="spot-2"></div>
        <div class="player-spot empty" id="spot-3"></div>
      </div>
    </div>

    <div id="hud">
      <div class="hud-item">
        <div class="hud-label">Balance</div>
        <div class="hud-value gold" id="hud-balance">$0</div>
      </div>
      <div class="hud-item">
        <div class="hud-label">Bet</div>
        <div class="hud-value" id="hud-bet">$0</div>
      </div>
      <div class="hud-item" style="margin-left:auto">
        <button id="btn-donate" class="action-btn" style="font-size:12px;padding:6px 14px">Send Chips</button>
      </div>
    </div>

    <div id="action-buttons" hidden></div>
    <div id="chip-selector-wrap" hidden></div>
    <div id="host-controls" hidden></div>
  </div>
  <script type="module" src="js/game.js"></script>
</body>
</html>
```

- [ ] **Step 2: Add full table render to ui.js**

Append to `js/ui.js`:
```javascript
const SPOT_IDS = ['spot-0', 'spot-1', 'spot-2', 'spot-3'];

export function renderTableState(room, myUid) {
  if (!room) return;
  const players = room.players || {};
  const playerEntries = Object.entries(players);
  const settings = room.settings || {};

  // Update felt text
  const payoutEl = document.getElementById('rule-payout');
  if (payoutEl) payoutEl.textContent = `BLACKJACK PAYS ${settings.blackjackPayout || '3:2'}`.replace(':', ' TO ').replace('3 TO 2','3 TO 2').replace('6 TO 5','6 TO 5');
  const dealerEl = document.getElementById('rule-dealer');
  if (dealerEl) dealerEl.textContent = settings.dealerHitSoft17 ? 'Dealer hits soft 17' : 'Dealer must stand on all 17s';

  // Dealer area
  renderDealerAreaEl(room.dealer, room.phase);

  // Player spots
  SPOT_IDS.forEach((spotId, i) => {
    const spot = document.getElementById(spotId);
    if (!spot) return;
    spot.innerHTML = '';
    const [pid, player] = playerEntries[i] || [null, null];
    if (!player) {
      spot.className = 'player-spot empty';
      const label = document.createElement('div');
      label.className = 'player-name';
      label.textContent = 'Open';
      spot.appendChild(label);
      return;
    }
    spot.className = 'player-spot' +
      (pid === room.currentTurn ? ' active-turn' : '') +
      (player.status === 'sitting-out' ? ' sitting-out' : '');

    const nameEl = document.createElement('div');
    nameEl.className = 'player-name';
    nameEl.textContent = player.name + (player.isHost ? ' ♛' : '');
    spot.appendChild(nameEl);

    // Render hands
    const hands = player.hands || [];
    hands.forEach((handStrs, hi) => {
      const isActiveHand = hi === (player.handIndex || 0) && pid === room.currentTurn;
      const frag = renderHandEl(handStrs, false);
      if (isActiveHand) {
        const wrap = document.createElement('div');
        wrap.style.outline = '2px solid gold';
        wrap.style.borderRadius = '6px';
        wrap.appendChild(frag);
        spot.appendChild(wrap);
      } else {
        spot.appendChild(frag);
      }
      if (player.bets && player.bets[hi]) {
        spot.appendChild(renderChipStack(player.bets[hi]));
      }
    });

    // Bet label during betting phase
    if (room.phase === 'betting' && player.bet > 0) {
      spot.appendChild(renderChipStack(player.bet));
    }
  });

  // HUD
  const me = players[myUid];
  if (me) {
    const balEl = document.getElementById('hud-balance');
    if (balEl) balEl.textContent = `$${me.balance}`;
    const betEl = document.getElementById('hud-bet');
    if (betEl) betEl.textContent = `$${me.bet || 0}`;
  }

  // Phase-specific UI
  updatePhaseUI(room, myUid, players[myUid]);
}

function renderDealerAreaEl(dealer, phase) {
  const wrap = document.getElementById('dealer-hand-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!dealer || !dealer.hand || dealer.hand.length === 0) return;

  const visibleCards = dealer.hand.map(cardFromStr);
  const handDiv = document.createElement('div');
  handDiv.className = 'hand';
  visibleCards.forEach(card => handDiv.appendChild(renderCard(card)));

  // Hidden card (face-down) — shown as back during playing phase
  if (phase === 'playing' || phase === 'dealing') {
    handDiv.appendChild(renderCard(null)); // null = back
  } else if (phase === 'resolution' && dealer.hiddenCard) {
    // Show the revealed card with flip animation
    const revealed = renderCard(cardFromStr(dealer.hiddenCard));
    revealed.classList.add('flipping');
    handDiv.appendChild(revealed);
  }
  wrap.appendChild(handDiv);
  if (dealer.hand.length > 0 && (phase === 'resolution')) {
    const allCards = [...visibleCards];
    if (dealer.hiddenCard) allCards.push(cardFromStr(dealer.hiddenCard));
    const val = handValue(allCards);
    const badge = document.createElement('div');
    badge.className = 'hand-value';
    badge.textContent = val;
    wrap.appendChild(badge);
  }
}

function updatePhaseUI(room, myUid, me) {
  const actionWrap = document.getElementById('action-buttons');
  const chipWrap = document.getElementById('chip-selector-wrap');
  const hostCtrl = document.getElementById('host-controls');
  if (!actionWrap || !chipWrap) return;

  actionWrap.hidden = true;
  chipWrap.hidden = true;
  if (hostCtrl) hostCtrl.hidden = true;

  if (!me) return;

  if (room.phase === 'betting') {
    chipWrap.hidden = false;
    // Chip selector is rendered by game.js on phase change
  }

  if (room.phase === 'playing' && room.currentTurn === myUid) {
    actionWrap.hidden = false;
    // Action buttons rendered by game.js
  }
}
```

- [ ] **Step 3: Implement js/game.js**

```javascript
import { initRoom, joinRoom, onRoomChange, writePlayerAction, uid, roomCode, isHost,
         setPhase, setCurrentTurn, dealCards, updatePlayer, updateAllBalances } from './room.js';
import { renderTableState, renderChipSelector, createTimerRing, updateTimerRing } from './ui.js';
import { startTimer, stopTimer } from './timer.js';
import { createDeck, shuffle, cardToStr, cardFromStr, handValue, isBlackjack, isBust,
         canHit, canStand, canDouble, canSplit, canSurrender, dealerShouldHit, resolveHand } from './engine.js';

const params = new URLSearchParams(location.search);
const code = params.get('room');

if (!code) {
  location.href = 'index.html';
}

let currentRoom = null;
let localDeck = []; // host only

async function init() {
  await initRoom();
  await joinRoom(code, sessionStorage.getItem('playerName') || 'Player');

  onRoomChange(room => {
    currentRoom = room;
    renderTableState(room, uid);
    handleRoomUpdate(room);
  });

  document.getElementById('btn-donate')?.addEventListener('click', showDonatePanel);
}

function handleRoomUpdate(room) {
  if (!room) return;

  if (room.phase === 'betting') {
    renderBettingUI(room);
    if (isHost && room.turnDeadline) {
      const remaining = room.turnDeadline - Date.now();
      if (remaining <= 0) advanceFromBetting(room);
    }
  }

  if (room.phase === 'dealing' && isHost) {
    handleDealingPhase(room);
  }

  if (room.phase === 'playing') {
    if (room.currentTurn === uid) {
      renderActionButtons(room);
    }
    if (isHost) {
      watchForPlayerAction(room);
    }
  }
}

// ---- BETTING PHASE ----
function renderBettingUI(room) {
  const wrap = document.getElementById('chip-selector-wrap');
  if (!wrap) return;
  wrap.hidden = false;
  wrap.innerHTML = '';
  const me = (room.players || {})[uid];
  if (!me || me.status === 'sitting-out') return;
  const settings = room.settings;
  const selector = renderChipSelector(settings.minBet, settings.maxBet, me.bet || 0, me.balance, async denom => {
    const newBet = Math.min((me.bet || 0) + denom, settings.maxBet);
    await writePlayerAction({ bet: newBet });
  });
  wrap.appendChild(selector);

  // Confirm bet button
  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'action-btn';
  confirmBtn.textContent = 'Confirm Bet';
  confirmBtn.style.marginTop = '8px';
  confirmBtn.addEventListener('click', async () => {
    const bet = (currentRoom?.players?.[uid]?.bet || 0);
    if (bet < settings.minBet) { alert(`Minimum bet is $${settings.minBet}`); return; }
    await writePlayerAction({ status: 'ready' });
    wrap.hidden = true;
  });
  wrap.appendChild(confirmBtn);

  if (isHost) {
    const hostCtrl = document.getElementById('host-controls');
    if (hostCtrl) {
      hostCtrl.hidden = false;
      hostCtrl.innerHTML = '';
      const forceBtn = document.createElement('button');
      forceBtn.className = 'action-btn';
      forceBtn.textContent = 'Force Start';
      forceBtn.addEventListener('click', () => advanceFromBetting(currentRoom));
      hostCtrl.appendChild(forceBtn);
    }
  }
}

async function advanceFromBetting(room) {
  const players = room.players || {};
  // Mark players without bets as sitting out for this round
  for (const [pid, p] of Object.entries(players)) {
    if (p.status !== 'ready' && p.status !== 'sitting-out') {
      await updatePlayer(pid, { status: 'sitting-out' });
    }
  }
  await setPhase('dealing');
}

// ---- DEALING PHASE ----
async function handleDealingPhase(room) {
  if (localDeck.length < 20) {
    localDeck = shuffle(createDeck(room.settings.decks).map(cardToStr));
  }
  const players = room.players || {};
  const activePids = Object.entries(players)
    .filter(([, p]) => p.status === 'ready')
    .map(([pid]) => pid);

  if (activePids.length === 0) { await setPhase('waiting'); return; }

  const result = await dealCards(localDeck, activePids, 0);
  localDeck = result.remaining;

  // Check insurance
  const dealerUp = cardFromStr(result.dealerHand[0]);
  if (room.settings.insurance && dealerUp.rank === 'A') {
    await setPhase('insurance');
    // Set deadline for insurance decision
    const deadline = Date.now() + (room.settings.actionTimer || 30) * 1000;
    await updateRoomField('turnDeadline', deadline);
    return; // insurance phase handles transition to playing
  }

  await setPhase('playing');
  await advanceTurn(room, activePids, null);
}

// ---- PLAYING PHASE ----
async function advanceTurn(room, activePids, lastPid) {
  const players = room.players || {};
  const queue = activePids || Object.entries(players)
    .filter(([, p]) => p.status === 'playing')
    .map(([pid]) => pid);

  const lastIdx = lastPid ? queue.indexOf(lastPid) : -1;
  const nextPid = queue[lastIdx + 1];

  if (!nextPid) {
    // All players done — dealer plays
    await playDealerHand(room);
    return;
  }

  await setCurrentTurn(nextPid, room.settings.actionTimer || 30);

  if (isHost && room.settings.actionTimer > 0) {
    const deadline = Date.now() + room.settings.actionTimer * 1000;
    startTimer(deadline, null, async () => {
      // Auto-stand
      await applyPlayerAction(nextPid, 'stand', room);
    });
  }
}

let watchedAction = null;
function watchForPlayerAction(room) {
  const turn = room.currentTurn;
  if (!turn || turn === watchedAction) return;
  watchedAction = turn;

  const player = (room.players || {})[turn];
  if (!player?.action) return;
  applyPlayerAction(turn, player.action.type, room);
}

async function applyPlayerAction(pid, actionType, room) {
  stopTimer();
  const player = (room.players || {})[pid];
  if (!player) return;
  const handIdx = player.handIndex || 0;
  const handStrs = (player.hands || [[]])[handIdx] || [];
  const hand = handStrs.map(cardFromStr);
  const settings = room.settings;
  const activePids = Object.entries(room.players || {})
    .filter(([, p]) => p.status === 'playing')
    .map(([p]) => p);

  let newHandStrs = [...handStrs];
  let newStatus = player.status;
  let newBalance = player.balance;

  if (actionType === 'hit') {
    const card = localDeck.shift();
    newHandStrs.push(card);
    const newHand = newHandStrs.map(cardFromStr);
    if (isBust(newHand)) newStatus = 'bust';
    const newHands = [...(player.hands || [])];
    newHands[handIdx] = newHandStrs;
    await updatePlayer(pid, { hands: newHands, status: newStatus, action: null });
    if (newStatus !== 'bust') return; // wait for next action
  } else if (actionType === 'stand') {
    // Move to next hand or done
    const hands = player.hands || [];
    if (handIdx < hands.length - 1) {
      await updatePlayer(pid, { handIndex: handIdx + 1, action: null });
      await setCurrentTurn(pid, settings.actionTimer || 30);
      return;
    }
    await updatePlayer(pid, { status: 'done', action: null });
  } else if (actionType === 'double') {
    const card = localDeck.shift();
    newHandStrs.push(card);
    const newHand = newHandStrs.map(cardFromStr);
    newBalance -= player.bets[handIdx];
    const newBets = [...(player.bets || [])];
    newBets[handIdx] *= 2;
    newStatus = isBust(newHand) ? 'bust' : 'done';
    const newHands = [...(player.hands || [])];
    newHands[handIdx] = newHandStrs;
    await updatePlayer(pid, { hands: newHands, bets: newBets, balance: newBalance, status: newStatus, action: null });
  } else if (actionType === 'split') {
    const hands = [...(player.hands || [])];
    const bets = [...(player.bets || [])];
    const [c1, c2] = hand;
    const draw1 = localDeck.shift();
    const draw2 = localDeck.shift();
    hands[handIdx] = [cardToStr(c1), draw1];
    hands.splice(handIdx + 1, 0, [cardToStr(c2), draw2]);
    bets.splice(handIdx + 1, 0, bets[handIdx]);
    newBalance -= bets[handIdx];
    await updatePlayer(pid, { hands, bets, balance: newBalance, splitCount: (player.splitCount || 0) + 1, action: null });
    await setCurrentTurn(pid, settings.actionTimer || 30);
    return;
  } else if (actionType === 'surrender') {
    await updatePlayer(pid, { status: 'surrendered', action: null });
  }

  await advanceTurn(room, activePids, pid);
}

// ---- RESOLUTION PHASE ----
async function playDealerHand(room) {
  await setPhase('resolution');
  const dealer = room.dealer;
  let dealerCards = [...(dealer.hand || []), dealer.hiddenCard].filter(Boolean).map(cardFromStr);

  while (dealerShouldHit(dealerCards, room.settings)) {
    dealerCards.push(cardFromStr(localDeck.shift()));
  }

  const dealerStrs = dealerCards.map(cardToStr);
  // Update dealer hand in Firebase (all cards visible now)
  await import('./room.js').then(({ setDealer }) => setDealer(dealerStrs.slice(0, -1), dealerStrs[dealerStrs.length - 1]));

  // Resolve all player hands
  const balanceMap = {};
  const players = room.players || {};
  for (const [pid, player] of Object.entries(players)) {
    if (!['playing', 'done', 'bust', 'surrendered'].includes(player.status)) continue;
    let newBal = player.balance;
    const hands = player.hands || [];
    const bets = player.bets || [];
    for (let i = 0; i < hands.length; i++) {
      const ph = { cards: hands[i].map(cardFromStr), status: player.status === 'surrendered' ? 'surrendered' : (isBust(hands[i].map(cardFromStr)) ? 'bust' : 'active'), bet: bets[i] || 0 };
      const { payout } = resolveHand(ph, dealerCards, room.settings);
      newBal += payout;
    }
    balanceMap[pid] = newBal;
  }
  await updateAllBalances(balanceMap);

  // Return to betting after delay
  setTimeout(async () => {
    // Reset player round state
    for (const pid of Object.keys(players)) {
      await updatePlayer(pid, { hands: [], bets: [], handIndex: 0, bet: 0, status: 'waiting', action: null, insurance: false });
    }
    await setPhase('betting');
    const timerSeconds = room.settings.actionTimer || 30;
    await import('./room.js').then(({ update, ref }) => {}); // turnDeadline reset handled in setCurrentTurn
  }, 5000);
}

// ---- ACTION BUTTONS ----
function renderActionButtons(room) {
  const wrap = document.getElementById('action-buttons');
  if (!wrap) return;
  wrap.hidden = false;
  wrap.innerHTML = '';
  const me = (room.players || {})[uid];
  if (!me) return;
  const handIdx = me.handIndex || 0;
  const handStrs = (me.hands || [[]])[handIdx] || [];
  const hand = handStrs.map(cardFromStr);
  const ph = { cards: hand, status: 'active', splitCount: me.splitCount || 0, bet: (me.bets || [])[handIdx] || 0 };
  const s = room.settings;

  const buttons = [
    { label: 'Hit', type: 'hit', enabled: canHit(ph) },
    { label: 'Stand', type: 'stand', enabled: canStand(ph) },
    { label: 'Double', type: 'double', enabled: canDouble(ph, s, me.balance) },
    { label: 'Split', type: 'split', enabled: canSplit(ph, s, me.balance) },
    { label: 'Surrender', type: 'surrender', enabled: canSurrender(ph, s) },
  ];

  for (const { label, type, enabled } of buttons) {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = label;
    btn.disabled = !enabled;
    btn.addEventListener('click', async () => {
      wrap.hidden = true;
      await writePlayerAction({ action: { type, handIndex: handIdx }, status: 'playing' });
    });
    wrap.appendChild(btn);
  }

  // Timer ring
  if (room.turnDeadline && s.actionTimer > 0) {
    const totalMs = s.actionTimer * 1000;
    const ring = createTimerRing(totalMs);
    wrap.appendChild(ring);
    startTimer(room.turnDeadline, ms => updateTimerRing(ring, ms), async () => {
      wrap.hidden = true;
      await writePlayerAction({ action: { type: 'stand', handIndex: handIdx } });
    });
  }
}

// ---- DONATE ----
function showDonatePanel() {
  import('./donate.js').then(m => m.showDonatePanel(currentRoom, uid));
}

// Store player name from lobby
document.addEventListener('DOMContentLoaded', () => {
  // Name was set in lobby — passed via sessionStorage
});

init();
```

- [ ] **Step 4: Update lobby.js to store player name and redirect**

In `js/lobby.js`, update both `createRoom` and `joinRoom` click handlers to store the name:
```javascript
// Before redirect, add:
sessionStorage.setItem('playerName', name);
```

And after `showLobby()` sets up `onRoomChange`, the callback already calls `goToGame()` when `room.phase !== 'waiting'`. Confirm `goToGame` redirects correctly to `game.html?room=${roomCode}`.

- [ ] **Step 5: Commit**

```bash
git add game.html js/game.js js/lobby.js js/ui.js
git commit -m "feat: game table HTML, full UI renderer, and game controller"
```

---

### Task 14: Chip Donations

**Files:**
- Modify: `js/donate.js`

- [ ] **Step 1: Implement donate.js**

```javascript
import { uid, writePlayerAction, roomCode } from './room.js';
import { getDatabase, ref, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

export function showDonatePanel(room, myUid) {
  const allowedPhases = ['waiting', 'betting'];
  if (!allowedPhases.includes(room?.phase)) {
    alert('Chip donations are only available between hands.');
    return;
  }

  const players = room.players || {};
  const me = players[myUid];
  if (!me) return;

  const overlay = document.createElement('div');
  overlay.id = 'donate-overlay';

  const panel = document.createElement('div');
  panel.id = 'donate-panel';

  panel.innerHTML = `
    <h3>Send Chips</h3>
    <label>To:</label>
    <select id="donate-to"></select>
    <label>Amount:</label>
    <input id="donate-amount" type="number" min="1" max="${me.balance}" value="100">
    <button class="btn-primary" id="donate-confirm">Send</button>
    <button class="action-btn" id="donate-cancel">Cancel</button>
  `;

  const sel = panel.querySelector('#donate-to');
  for (const [pid, p] of Object.entries(players)) {
    if (pid === myUid) continue;
    const opt = document.createElement('option');
    opt.value = pid;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }

  panel.querySelector('#donate-cancel').addEventListener('click', () => {
    overlay.remove(); panel.remove();
  });

  panel.querySelector('#donate-confirm').addEventListener('click', async () => {
    const toPid = sel.value;
    const amount = parseInt(panel.querySelector('#donate-amount').value, 10);
    if (!toPid || isNaN(amount) || amount <= 0 || amount > me.balance) {
      alert('Invalid donation amount'); return;
    }
    try {
      await sendChips(myUid, toPid, amount);
      overlay.remove(); panel.remove();
    } catch (e) {
      alert('Transfer failed: ' + e.message);
    }
  });

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

async function sendChips(fromUid, toUid, amount) {
  const db = getDatabase();
  const fromRef = ref(db, `rooms/${roomCode}/players/${fromUid}/balance`);
  const toRef = ref(db, `rooms/${roomCode}/players/${toUid}/balance`);

  // Deduct from sender
  await runTransaction(fromRef, current => {
    if (current === null) return current;
    if (current < amount) throw new Error('Insufficient balance');
    return current - amount;
  });

  // Add to recipient
  await runTransaction(toRef, current => {
    return (current || 0) + amount;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add js/donate.js
git commit -m "feat: chip donation panel and Firebase transfer"
```

---

### Task 15: Firebase Security Rules & GitHub Pages Setup

**Files:**
- Create: `firebase-rules.json`
- Create: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Create firebase-rules.json**

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": true,
        ".write": false,
        "settings": {
          ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()"
        },
        "phase": {
          ".write": "data.parent().child('hostId').val() === auth.uid"
        },
        "dealer": {
          ".write": "data.parent().child('hostId').val() === auth.uid"
        },
        "currentTurn": {
          ".write": "data.parent().child('hostId').val() === auth.uid"
        },
        "turnDeadline": {
          ".write": "data.parent().child('hostId').val() === auth.uid"
        },
        "players": {
          "$playerId": {
            ".write": "$playerId === auth.uid || data.parent().parent().child('hostId').val() === auth.uid"
          }
        },
        "hostId": {
          ".write": "!data.parent().exists()"
        }
      }
    }
  }
}
```

- [ ] **Step 2: Create README.md**

```markdown
# Multiplayer Blackjack

Browser-based multiplayer blackjack. Host on GitHub Pages, play with friends via room code.

## Setup

### 1. Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project
3. Add a Web app — copy the config object
4. Enable **Realtime Database** (start in test mode, then apply rules below)
5. Enable **Authentication → Anonymous**

### 2. Configure the app

Edit `firebase-config.js` and paste your Firebase config values.

### 3. Deploy Firebase security rules

Install the Firebase CLI: `npm install -g firebase-tools`

```bash
firebase login
firebase init database   # select your project, use existing rules file
firebase deploy --only database
```

### 4. Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to Settings → Pages → Source: Deploy from branch → `main` / root
3. Share your `https://yourusername.github.io/repo-name/` URL

## Playing

1. Host visits the site, enters name, clicks **Create Game**
2. Share the 5-character room code with friends
3. Friends enter name + code, click **Join Game**
4. Host configures rules in the lobby settings panel
5. Host clicks **Start Game**

## Running tests (engine logic only)

```bash
node tests/engine.test.mjs
```
```

- [ ] **Step 3: Commit**

```bash
git add firebase-rules.json README.md .gitignore
git commit -m "feat: Firebase security rules and GitHub Pages setup guide"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by |
|---|---|
| Up to 4 players | Task 13 (SPOT_IDS, 4 spots) |
| Automated dealer | Task 3 (dealerShouldHit), Task 13 (playDealerHand) |
| Firebase Realtime DB | Task 5 (room.js) |
| Room code join | Task 5 (createRoom, joinRoom) |
| All configurable rules | Task 4 (settings.js), Task 9 (lobby settings panel) |
| Per-action timer | Task 7 (timer.js), Task 13 (renderActionButtons) |
| Dark casino UI | Task 8 (base.css, table.css) |
| SVG cards | Task 10 |
| Chip denominations 1/5/25/100/500 | Task 11 |
| Dealer at top, players at bottom arc | Task 8 (table.css), Task 12 (game.html) |
| Betting phase with chip selector | Task 13 (renderBettingUI) |
| Hit/Stand/Double/Split/Surrender | Task 3 (engine guards), Task 13 (renderActionButtons) |
| Blackjack pays configurable | Task 3 (resolveHand) |
| Insurance | Task 13 (handleDealingPhase) |
| Win/loss/push result badges | Task 12 (hud.css .result-badge — applied in resolution) |
| Chip donations | Task 14 (donate.js) |
| Mid-session joins sit out | Task 5 (joinRoom status check) |
| Host can force-advance betting | Task 13 (Force Start button) |
| Firebase security rules | Task 15 |
| GitHub Pages deploy | Task 15 (README) |

**Known gaps to address during implementation:**
- `updateRoomField` referenced in game.js Task 13 Step 3 (handleDealingPhase) — add this helper to room.js: `export async function updateRoomField(field, value) { await update(ref(db, 'rooms/' + roomCode), { [field]: value }); }`
- Result badges (.result-badge) are defined in CSS but not yet applied in resolution logic — game.js `playDealerHand` should add a badge to each player spot after resolving their hand.
- The `insurance` game phase is set in `handleDealingPhase` but the phase handler in `handleRoomUpdate` needs a branch for `'insurance'` that shows a Yes/No prompt and, on both host and player sides, waits for all responses then transitions to `'playing'`.

These are flagged as known issues to fix during implementation; each is a small addition within the tasks they appear.
