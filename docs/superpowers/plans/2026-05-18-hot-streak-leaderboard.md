# Hot Streak & Session Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-player hot streak badge (🔥N, shown at 2+ consecutive wins) next to names on the table, and a collapsible draggable leaderboard panel (top-left) showing all players' hands won, total wagered, and session profit.

**Architecture:** Stat computation is extracted to a pure `js/stats.js` module (testable with Node). The host computes stat deltas inside the existing `playDealerHand()` resolution loop and batch-writes them to player Firebase nodes via a new `updateAllPlayerStats()` helper. A new `js/leaderboard.js` module piggybacks on the existing `onRoomChange` stream — no new Firebase listeners. The streak badge is rendered inline in `renderTableState()` in `ui.js`.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database (existing), Node `assert` for unit tests.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `js/stats.js` | Create | Pure `computeStatDelta(player, totalPayouts)` helper |
| `tests/stats.test.mjs` | Create | Unit tests for stat delta logic |
| `js/room.js` | Modify | Add `updateAllPlayerStats(statsMap)`; init stat fields in `createRoom` + `joinRoom` |
| `js/leaderboard.js` | Create | Panel DOM, drag, collapse, `initLeaderboard()`, `updateLeaderboard(room)` |
| `css/leaderboard.css` | Create | Panel styles, profit colour classes, `streak-pop` animation |
| `game.html` | Modify | Link `leaderboard.css`; add `#leaderboard-region` div |
| `js/ui.js` | Modify | Streak badge in `renderTableState()` |
| `js/game.js` | Modify | Import stats/leaderboard; compute deltas in `playDealerHand()`; wire init/update |

---

## Task 1: Pure stat helper + tests

**Files:**
- Create: `js/stats.js`
- Create: `tests/stats.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/stats.test.mjs`:

```js
import assert from 'node:assert/strict';
import { computeStatDelta } from '../js/stats.js';

// Win round — streak increments, handsWon increments, profit positive
{
  const player = { bet: 10, bets: [10], winStreak: 0, handsWon: 0, totalWagered: 0, sessionProfit: 0 };
  const result = computeStatDelta(player, 20); // win: $10 bet, $20 payout
  assert.equal(result.winStreak, 1, 'streak increments on win');
  assert.equal(result.handsWon, 1, 'handsWon increments on win');
  assert.equal(result.totalWagered, 10, 'totalWagered accumulates');
  assert.equal(result.sessionProfit, 10, 'profit = payout - wagered');
}

// Loss round — streak resets to 0
{
  const player = { bet: 10, bets: [10], winStreak: 3, handsWon: 3, totalWagered: 30, sessionProfit: 15 };
  const result = computeStatDelta(player, 0); // loss: $10 bet, $0 payout
  assert.equal(result.winStreak, 0, 'streak resets on loss');
  assert.equal(result.handsWon, 3, 'handsWon unchanged on loss');
  assert.equal(result.totalWagered, 40, 'totalWagered still accumulates on loss');
  assert.equal(result.sessionProfit, 5, 'profit decreases on loss');
}

// Push round — streak unchanged
{
  const player = { bet: 10, bets: [10], winStreak: 2, handsWon: 2, totalWagered: 20, sessionProfit: 10 };
  const result = computeStatDelta(player, 10); // push: $10 bet, $10 payout back
  assert.equal(result.winStreak, 2, 'streak unchanged on push');
  assert.equal(result.handsWon, 2, 'handsWon unchanged on push');
  assert.equal(result.sessionProfit, 10, 'profit unchanged on push');
}

// Blackjack (3:2) — win with 2.5x payout
{
  const player = { bet: 10, bets: [10], winStreak: 1, handsWon: 1, totalWagered: 10, sessionProfit: 10 };
  const result = computeStatDelta(player, 25); // blackjack: $10 bet, $25 payout
  assert.equal(result.winStreak, 2, 'streak increments on blackjack');
  assert.equal(result.sessionProfit, 25, 'profit = 25 - 10 added to existing 10');
}

// Split round — uses sum of bets array, not just player.bet
{
  const player = { bet: 10, bets: [10, 10], winStreak: 0, handsWon: 0, totalWagered: 0, sessionProfit: 0 };
  const result = computeStatDelta(player, 40); // both split hands win: $20 wagered, $40 payout
  assert.equal(result.totalWagered, 20, 'totalWagered = sum(bets) for splits');
  assert.equal(result.sessionProfit, 20, 'profit = 40 - 20');
  assert.equal(result.winStreak, 1);
}

// Fallback: player.bets empty — uses player.bet
{
  const player = { bet: 10, bets: [], winStreak: 0, handsWon: 0, totalWagered: 0, sessionProfit: 0 };
  const result = computeStatDelta(player, 20);
  assert.equal(result.totalWagered, 10, 'falls back to player.bet when bets array is empty');
}

console.log('All stats tests passed.');
```

- [ ] **Step 2: Run test to confirm it fails**

```
node tests/stats.test.mjs
```

Expected: error — `Cannot find module '../js/stats.js'`

- [ ] **Step 3: Create `js/stats.js`**

```js
export function computeStatDelta(player, totalPayouts) {
  const wagered = (player.bets && player.bets.length > 0)
    ? player.bets.reduce((s, b) => s + b, 0)
    : (player.bet || 0);
  const roundProfit = totalPayouts - wagered;
  const isWin = roundProfit > 0;
  const isLoss = roundProfit < 0;
  return {
    winStreak: isWin ? (player.winStreak || 0) + 1 : isLoss ? 0 : (player.winStreak || 0),
    handsWon:  (player.handsWon  || 0) + (isWin ? 1 : 0),
    totalWagered:  (player.totalWagered  || 0) + wagered,
    sessionProfit: (player.sessionProfit || 0) + roundProfit,
  };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```
node tests/stats.test.mjs
```

Expected: `All stats tests passed.`

- [ ] **Step 5: Commit**

```
git add js/stats.js tests/stats.test.mjs
git commit -m "feat: add computeStatDelta pure helper with tests"
```

---

## Task 2: Firebase helpers + stat field initialisation

**Files:**
- Modify: `js/room.js`

- [ ] **Step 1: Add `updateAllPlayerStats` to room.js**

After the `updateAllBalances` function (around line 123), add:

```js
export async function updateAllPlayerStats(statsMap) {
  const updates = {};
  for (const [pid, stats] of Object.entries(statsMap)) {
    for (const [key, val] of Object.entries(stats)) {
      updates[`rooms/${roomCode}/players/${pid}/${key}`] = val;
    }
  }
  if (Object.keys(updates).length > 0) await update(ref(db), updates);
}
```

- [ ] **Step 2: Init stat fields in `createRoom`**

In `createRoom`, inside the player object literal (around line 41), add the four stat fields:

```js
[`rooms/${roomCode}/players/${uid}`]: {
  name: playerName,
  balance: settings.startingBalance,
  bet: 0,
  hands: [],
  bets: [],
  handIndex: 0,
  insurance: false,
  status: 'waiting',
  isHost: true,
  action: null,
  connected: true,
  winStreak: 0,
  handsWon: 0,
  totalWagered: 0,
  sessionProfit: 0,
},
```

- [ ] **Step 3: Init stat fields in `joinRoom` new-player branch**

In `joinRoom`, in the `set(ref(...), { ... })` call for new players (around line 76), add the four stat fields:

```js
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
  action: null,
  connected: true,
  winStreak: 0,
  handsWon: 0,
  totalWagered: 0,
  sessionProfit: 0,
});
```

- [ ] **Step 4: Commit**

```
git add js/room.js
git commit -m "feat: add updateAllPlayerStats helper and init stat fields on join"
```

---

## Task 3: Leaderboard CSS + module + HTML wiring

**Files:**
- Create: `css/leaderboard.css`
- Create: `js/leaderboard.js`
- Modify: `game.html`

- [ ] **Step 1: Create `css/leaderboard.css`**

```css
#leaderboard-region {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 12;
  width: 260px;
}

#lb-panel {
  width: 100%;
  background: rgba(10, 6, 2, 0.88);
  border: 1px solid rgba(201, 168, 76, 0.3);
  border-radius: 8px;
  overflow: hidden;
}

#lb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--clr-gold);
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: grab;
  user-select: none;
}

#lb-panel:not(.collapsed) #lb-header {
  border-bottom: 1px solid rgba(201, 168, 76, 0.2);
}

#lb-toggle {
  background: none;
  border: none;
  color: var(--clr-gold);
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
#lb-toggle:hover { color: var(--clr-text); }

#lb-panel.collapsed #lb-body {
  display: none;
}

#lb-body {
  padding: 6px 8px;
}

#lb-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--clr-text);
}

#lb-table th {
  color: rgba(201, 168, 76, 0.7);
  font-weight: normal;
  padding: 2px 4px;
  text-align: left;
  border-bottom: 1px solid rgba(201, 168, 76, 0.15);
}

#lb-table th:not(:first-child),
#lb-table td:not(:first-child) {
  text-align: right;
}

#lb-table td {
  padding: 3px 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

#lb-table tr:last-child td {
  border-bottom: none;
}

.lb-profit-pos { color: #4caf50; }
.lb-profit-neg { color: var(--clr-lose, #e05555); }

@keyframes streak-pop {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.45); }
  100% { transform: scale(1); }
}

.streak-badge {
  display: inline-block;
}

.streak-badge.pop {
  animation: streak-pop 0.35s ease;
}
```

- [ ] **Step 2: Create `js/leaderboard.js`**

```js
let _collapsed = false;

export function initLeaderboard() {
  const region = document.getElementById('leaderboard-region');
  if (!region) return;

  region.innerHTML = `
    <div id="lb-panel">
      <div id="lb-header">
        <span>📊 Leaderboard</span>
        <button id="lb-toggle">−</button>
      </div>
      <div id="lb-body">
        <table id="lb-table">
          <thead>
            <tr>
              <th>Player</th>
              <th title="Hands Won">W</th>
              <th>Wagered</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody id="lb-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('lb-toggle').addEventListener('click', () => {
    _collapsed = !_collapsed;
    document.getElementById('lb-panel').classList.toggle('collapsed', _collapsed);
    document.getElementById('lb-toggle').textContent = _collapsed ? '+' : '−';
  });

  makeDraggable();
}

export function updateLeaderboard(room) {
  const tbody = document.getElementById('lb-tbody');
  if (!tbody) return;

  const players = room?.players || {};
  const rows = Object.values(players)
    .filter(p => !p.kicked)
    .sort((a, b) => (b.sessionProfit || 0) - (a.sessionProfit || 0));

  tbody.innerHTML = '';
  for (const p of rows) {
    const profit  = p.sessionProfit || 0;
    const wagered = p.totalWagered  || 0;
    const streak  = p.winStreak     || 0;

    const streakHtml = streak >= 2
      ? ` <span class="streak-badge">🔥${streak}</span>`
      : '';
    const profitClass = profit > 0 ? 'lb-profit-pos' : profit < 0 ? 'lb-profit-neg' : '';
    const profitStr   = profit > 0 ? `+$${fmt(profit)}` : profit < 0 ? `-$${fmt(-profit)}` : '$0';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.name)}${p.isHost ? ' ♛' : ''}${streakHtml}</td>
      <td>${p.handsWon || 0}</td>
      <td>$${fmt(wagered)}</td>
      <td class="${profitClass}">${profitStr}</td>
    `;
    tbody.appendChild(tr);
  }
}

function fmt(n) {
  const abs = Math.abs(n);
  return abs >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeDraggable() {
  const region = document.getElementById('leaderboard-region');
  const header = document.getElementById('lb-header');
  if (!region || !header) return;

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener('mousedown', e => {
    if (e.target.id === 'lb-toggle') return;
    dragging = true;
    const rect = region.getBoundingClientRect();
    region.style.left = rect.left + 'px';
    region.style.top  = rect.top  + 'px';
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    region.style.left = (e.clientX - offsetX) + 'px';
    region.style.top  = (e.clientY - offsetY) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    header.style.cursor = 'grab';
  });
}
```

- [ ] **Step 3: Update `game.html`**

Add `leaderboard.css` link after `music.css` (line 13):

```html
  <link rel="stylesheet" href="css/music.css">
  <link rel="stylesheet" href="css/leaderboard.css">
```

Add `leaderboard-region` div inside `#table-wrap`, after `#music-region` (around line 72):

```html
    <div id="music-region">
      <div id="music-panel"></div>
    </div>
    <div id="leaderboard-region"></div>
```

- [ ] **Step 4: Commit**

```
git add css/leaderboard.css js/leaderboard.js game.html
git commit -m "feat: add leaderboard panel module and styles"
```

---

## Task 4: Streak badge in player spots

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Replace the name element render in `renderTableState`**

Find this block (around line 185):

```js
    const nameEl = document.createElement('div');
    nameEl.className = 'player-name';
    nameEl.textContent = player.name + (player.isHost ? ' ♛' : '');
    spot.appendChild(nameEl);
```

Replace with:

```js
    const nameEl = document.createElement('div');
    nameEl.className = 'player-name';
    nameEl.appendChild(document.createTextNode(player.name + (player.isHost ? ' ♛' : '')));
    if ((player.winStreak || 0) >= 2) {
      const badge = document.createElement('span');
      badge.className = 'streak-badge pop';
      badge.textContent = ` 🔥${player.winStreak}`;
      nameEl.appendChild(badge);
      badge.addEventListener('animationend', () => badge.classList.remove('pop'), { once: true });
    }
    spot.appendChild(nameEl);
```

- [ ] **Step 2: Commit**

```
git add js/ui.js
git commit -m "feat: render hot streak badge in player name spots"
```

---

## Task 5: Wire stat computation into game.js

**Files:**
- Modify: `js/game.js`

- [ ] **Step 1: Add imports at the top of `game.js`**

After the existing imports, add:

```js
import { computeStatDelta } from './stats.js';
import { initLeaderboard, updateLeaderboard } from './leaderboard.js';
```

Also add `updateAllPlayerStats` to the existing `room.js` import line. Change:

```js
import { initRoom, joinRoom, onRoomChange, writePlayerAction, uid, roomCode, isHost,
         setPhase, setCurrentTurn, dealCards, updatePlayer, updateAllBalances, updateRoomField, getRoom,
         setupConnectionMonitoring, listenPendingTips, removeTipEntry, sendSystemMessage,
         kickPlayer, clearKickVotes, listenRainEvents, listenKekryEvents } from './room.js';
```

To:

```js
import { initRoom, joinRoom, onRoomChange, writePlayerAction, uid, roomCode, isHost,
         setPhase, setCurrentTurn, dealCards, updatePlayer, updateAllBalances, updateAllPlayerStats,
         updateRoomField, getRoom,
         setupConnectionMonitoring, listenPendingTips, removeTipEntry, sendSystemMessage,
         kickPlayer, clearKickVotes, listenRainEvents, listenKekryEvents } from './room.js';
```

- [ ] **Step 2: Call `initLeaderboard()` in the `init()` function**

In the `init()` function (around line 33), add `initLeaderboard()` after `initMusicPlayer`:

```js
  initMusicPlayer(roomCode, isHost);
  initLeaderboard();
```

- [ ] **Step 3: Call `updateLeaderboard(room)` in the `onRoomChange` callback**

In the `onRoomChange` callback (around line 51), add `updateLeaderboard(room)` after `applyMusicState`:

```js
    applyMusicState(room?.music ?? null);
    updateLeaderboard(room);
```

- [ ] **Step 4: Compute stat deltas in `playDealerHand()`**

In `playDealerHand()`, find the existing `balanceMap` computation loop (around line 620). Replace:

```js
  const balanceMap = {};
  const players = freshRoom.players || {};
  for (const [pid, player] of Object.entries(players)) {
    if (!['playing', 'done', 'bust', 'surrendered'].includes(player.status)) continue;
    let newBal = player.balance - (player.bet || 0);
    const hands = player.hands || [];
    const bets = player.bets || [];
    for (let i = 0; i < hands.length; i++) {
      const handCards = hands[i].map(cardFromStr);
      const st = player.status === 'surrendered' ? 'surrendered' : isBust(handCards) ? 'bust' : 'active';
      const ph = { cards: handCards, status: st, bet: bets[i] || 0 };
      const { payout } = resolveHand(ph, dealerCards, freshRoom.settings);
      newBal += payout;
    }
    balanceMap[pid] = newBal;
  }
  await updateAllBalances(balanceMap);
```

With:

```js
  const balanceMap = {};
  const statsMap   = {};
  const players = freshRoom.players || {};
  for (const [pid, player] of Object.entries(players)) {
    if (!['playing', 'done', 'bust', 'surrendered'].includes(player.status)) continue;
    let newBal = player.balance - (player.bet || 0);
    let totalPayouts = 0;
    const hands = player.hands || [];
    const bets = player.bets || [];
    for (let i = 0; i < hands.length; i++) {
      const handCards = hands[i].map(cardFromStr);
      const st = player.status === 'surrendered' ? 'surrendered' : isBust(handCards) ? 'bust' : 'active';
      const ph = { cards: handCards, status: st, bet: bets[i] || 0 };
      const { payout } = resolveHand(ph, dealerCards, freshRoom.settings);
      newBal += payout;
      totalPayouts += payout;
    }
    balanceMap[pid] = newBal;
    statsMap[pid]   = computeStatDelta(player, totalPayouts);
  }
  await updateAllBalances(balanceMap);
  await updateAllPlayerStats(statsMap);
```

- [ ] **Step 5: Run the existing engine tests to confirm nothing broke**

```
npm test
```

Expected: `All deck/hand tests passed.` and `All stats tests passed.`  
(The test script only runs engine.test.mjs — update package.json if both should run.)

To run both tests:

```
node tests/engine.test.mjs && node tests/stats.test.mjs
```

Expected: both print their success messages with no assertion errors.

- [ ] **Step 6: Commit**

```
git add js/game.js
git commit -m "feat: compute and persist hot streak and session stats on resolution"
```

---

## Task 6: Manual smoke test + push

- [ ] **Step 1: Open the game locally**

Open `game.html` in a browser (or run via a local static server). The 📊 Leaderboard panel should appear top-left, collapsed by default showing just the header.

- [ ] **Step 2: Verify leaderboard expands/collapses**

Click `+` / `−` toggle. Body should show/hide. Panel should be draggable by the header.

- [ ] **Step 3: Play two hands and verify stats update**

Win a hand — confirm the leaderboard shows W=1, Wagered and Profit update correctly. Win a second hand — confirm 🔥2 appears next to the player's name on the table and in the leaderboard row.

- [ ] **Step 4: Verify push doesn't reset streak**

Push a hand — streak should remain at 2 (or whatever it was).

- [ ] **Step 5: Verify loss resets streak**

Lose a hand after a streak — 🔥 badge should disappear from the player spot.

- [ ] **Step 6: Push to GitHub**

```
git push
```

GitHub Pages auto-deploys. Verify live at https://eloheavenjoe-cyber.github.io/blackjack/
