# Roulette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add European Roulette (outside bets only, host-triggered spin, animated SVG wheel) as a second game in the existing multi-player casino, gated behind a game picker added to the lobby.

**Architecture:** Option A — game picker inside the existing `index.html`/`lobby.js`. `room.js` writes `gameType` on room creation; `goToGame()` routes to `game.html` or `roulette.html` based on it. Roulette gets its own HTML page, engine, UI module, and CSS. All shared infrastructure (`room.js`, `chat.js`, `music.js`, `leaderboard.js`, `sound.js`) reused unchanged.

**Tech Stack:** Vanilla ES modules, Firebase Realtime Database, CSS animations (no frameworks). Tests via `node:assert/strict`, run with `node`.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `firebase-rules.json` | Add write rules for `gameType`, `rouletteBets/{uid}`, `lastSpin` |
| Modify | `js/room.js` | Add `gameType` param to `createRoom` |
| Modify | `js/settings.js` | Export `ROULETTE_DEFAULT_SETTINGS` |
| Modify | `index.html` | Add game picker toggle buttons in `#pane-create` |
| Modify | `css/lobby.css` | Style game picker buttons |
| Modify | `js/lobby.js` | `selectedGame` state, game-aware settings form, routing |
| Modify | `package.json` | Add roulette test to test script |
| Create | `js/roulette-engine.js` | Pure functions: `spin()`, `calcPayouts()`, `getColor()`, constants |
| Create | `tests/roulette-engine.test.mjs` | Unit tests for engine |
| Create | `roulette.html` | Game page shell |
| Create | `css/roulette.css` | Table layout, wheel, betting grid, HUD, results |
| Create | `js/roulette-ui.js` | SVG wheel builder, spin animation, betting grid, chip selector |
| Create | `js/roulette-game.js` | Firebase coordination, phase management, game loop |

---

## Task 1: Firebase Rules

**Files:**
- Modify: `firebase-rules.json`

- [ ] **Step 1: Add the three new field rules**

Open `firebase-rules.json`. Inside the `"$roomCode"` block (after the `"kekryEvents"` block, before the closing `}`), add:

```json
        "gameType": {
          ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()"
        },
        "rouletteBets": {
          "$uid": {
            ".write": "auth !== null && ($uid === auth.uid || data.parent().parent().child('hostId').val() === auth.uid)"
          }
        },
        "lastSpin": {
          ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()"
        }
```

- [ ] **Step 2: Deploy**

```
firebase deploy --only database
```

Expected: `Deploy complete!`

- [ ] **Step 3: Commit**

```bash
git add firebase-rules.json
git commit -m "feat: add firebase rules for roulette gameType, rouletteBets, lastSpin"
```

---

## Task 2: Lobby Prerequisite

**Files:**
- Modify: `js/room.js:47-76`
- Modify: `js/settings.js`
- Modify: `index.html`
- Modify: `css/lobby.css`
- Modify: `js/lobby.js`

### Step 1: Add `gameType` to `createRoom` in `room.js`

Change the function signature and add the field to the Firebase write. Find this in `js/room.js:47`:

```js
export async function createRoom(playerName, settings) {
```

Replace with:

```js
export async function createRoom(playerName, settings, gameType = 'blackjack') {
```

Then find the `update(ref(db), {` call (around line 51) and add `gameType` alongside `createdAt`:

```js
    [`rooms/${roomCode}/gameType`]: gameType,
```

Add it immediately after the `createdAt` line so the update object includes `gameType`.

- [ ] **Step 2: Add `ROULETTE_DEFAULT_SETTINGS` to `settings.js`**

At the end of `js/settings.js`, add:

```js
export const ROULETTE_DEFAULT_SETTINGS = {
  minBet: 5,
  maxBet: 500,
  startingBalance: 1000,
};
```

- [ ] **Step 3: Add game picker to `index.html`**

In `index.html`, find the `#pane-create` div:

```html
      <div id="pane-create">
        <button id="btn-create" class="btn-primary">Create Room</button>
```

Replace with:

```html
      <div id="pane-create">
        <div id="game-picker">
          <button id="pick-bj" class="game-pick active">♠ Blackjack</button>
          <button id="pick-roulette" class="game-pick">⚫ Roulette</button>
        </div>
        <button id="btn-create" class="btn-primary">Create Room</button>
```

- [ ] **Step 4: Style the game picker in `css/lobby.css`**

Append to `css/lobby.css`:

```css
#game-picker {
  display: flex;
  gap: 8px;
}

.game-pick {
  flex: 1;
  padding: 8px 0;
  background: rgba(201,168,76,0.08);
  border: 1px solid rgba(201,168,76,0.3);
  color: var(--clr-text-dim);
  font-size: 0.85rem;
  letter-spacing: 1px;
  border-radius: 4px;
  transition: background 0.15s, color 0.15s;
}

.game-pick.active {
  background: rgba(201,168,76,0.25);
  border-color: var(--clr-gold);
  color: var(--clr-gold);
}
```

- [ ] **Step 5: Update `lobby.js` — imports and state**

At the top of `js/lobby.js`, update the import from `settings.js`:

```js
import { DEFAULT_SETTINGS, validateSettings, DEALER_OPTIONS, ROULETTE_DEFAULT_SETTINGS } from './settings.js';
```

After the existing `let currentSettings = { ...DEFAULT_SETTINGS };` line, add:

```js
let selectedGame = 'blackjack';
let currentRouletteSettings = { ...ROULETTE_DEFAULT_SETTINGS };
```

- [ ] **Step 6: Update `lobby.js` — game picker click handlers**

After the `$('tab-join').addEventListener` block (around line 28), add:

```js
$('pick-bj').addEventListener('click', () => {
  selectedGame = 'blackjack';
  $('pick-bj').classList.add('active');
  $('pick-roulette').classList.remove('active');
  renderSettingsForm(true);
});
$('pick-roulette').addEventListener('click', () => {
  selectedGame = 'roulette';
  $('pick-roulette').classList.add('active');
  $('pick-bj').classList.remove('active');
  renderSettingsForm(true);
});
```

- [ ] **Step 7: Update `lobby.js` — `goToGame` accepts game type**

Find and replace the existing `goToGame` function:

```js
function goToGame(gameType = 'blackjack') {
  const page = gameType === 'roulette' ? 'roulette.html' : 'game.html';
  window.location.href = `${page}?room=${roomCode}`;
}
```

- [ ] **Step 8: Update `lobby.js` — `createRoom` call passes `gameType`**

Find the `createRoom` call in the `btn-create` click handler:

```js
    await createRoom(name, currentSettings);
```

Replace with:

```js
    const activeSettings = selectedGame === 'roulette' ? currentRouletteSettings : currentSettings;
    await createRoom(name, activeSettings, selectedGame);
```

Also update the `writePublicRoom` call in the same handler to include `gameType`:

```js
      await writePublicRoom(roomCode, { hostName: name, playerCount: 1, phase: 'waiting', gameType: selectedGame });
```

- [ ] **Step 9: Update `lobby.js` — `writePublicRoom` on room change also includes `gameType`**

Find the `writePublicRoom` call inside `onRoomChange` (inside `showLobby`):

```js
      writePublicRoom(roomCode, { hostName, playerCount, phase: room.phase });
```

Replace with:

```js
      writePublicRoom(roomCode, { hostName, playerCount, phase: room.phase, gameType: room.gameType || 'blackjack' });
```

- [ ] **Step 10: Update `lobby.js` — route join clients using room's `gameType`**

Find inside `onRoomChange`:

```js
    if (!asHost && room.phase !== 'waiting') goToGame();
```

Replace with:

```js
    if (!asHost && room.phase !== 'waiting') goToGame(room.gameType || 'blackjack');
```

- [ ] **Step 11: Update `lobby.js` — `btn-start` handler uses active settings**

Find the start button handler. Replace its body with:

```js
$('btn-start').addEventListener('click', async () => {
  if (!roomCode) return;
  const activeSettings = selectedGame === 'roulette' ? currentRouletteSettings : currentSettings;
  if (selectedGame === 'blackjack') {
    const errors = validateSettings(currentSettings);
    if (errors.length > 0) { showError(errors[0]); return; }
  }
  await updateRoomField('settings', activeSettings);
  if (lastRoom?.players) {
    const balanceMap = {};
    for (const pid of Object.keys(lastRoom.players)) {
      balanceMap[pid] = activeSettings.startingBalance;
    }
    await updateAllBalances(balanceMap);
  }
  if (isPublicRoom) {
    isPublicRoom = false;
    await removePublicRoom(roomCode);
  }
  await setPhase('betting');
  goToGame(selectedGame);
});
```

- [ ] **Step 12: Update `lobby.js` — show game badge in public room cards**

In `renderPublicRooms`, find where `hostEl.textContent = room.hostName;` is set. After the `infoEl.appendChild(phaseEl);` line, add a game badge:

```js
    const gameEl = document.createElement('span');
    gameEl.className = 'room-card-game';
    gameEl.textContent = room.gameType === 'roulette' ? 'Roulette' : 'Blackjack';
    infoEl.appendChild(gameEl);
```

Then append to `css/lobby.css`:

```css
.room-card-game {
  font-size: 0.7rem;
  color: var(--clr-gold);
  opacity: 0.7;
  margin-left: 4px;
}
```

- [ ] **Step 13: Update `lobby.js` — `renderSettingsForm` is game-aware**

At the top of the existing `renderSettingsForm(editable)` function, add:

```js
function renderSettingsForm(editable) {
  if (selectedGame === 'roulette') {
    renderRouletteSettingsForm(editable);
    return;
  }
  // ... rest of existing function unchanged
```

Then add a new function after `renderSettingsForm`:

```js
function renderRouletteSettingsForm(editable) {
  const container = $('settings-form');
  const rows = [
    { key: 'minBet', label: 'Min Bet', type: 'range', min: 1, max: 5000 },
    { key: 'maxBet', label: 'Max Bet', type: 'range', min: 1, max: 5000 },
    { key: 'startingBalance', label: 'Starting Balance', type: 'range', min: 100, max: 25000, step: 100 },
  ];
  container.innerHTML = '';
  for (const row of rows) {
    const div = document.createElement('div');
    div.className = 'setting-row';
    const label = document.createElement('label');
    label.textContent = row.label;
    div.appendChild(label);
    const valSpan = document.createElement('span');
    valSpan.className = 'setting-value';
    valSpan.textContent = currentRouletteSettings[row.key];
    if (editable) {
      const inp = document.createElement('input');
      inp.type = 'range';
      inp.min = row.min; inp.max = row.max; inp.step = row.step || 1;
      inp.value = currentRouletteSettings[row.key];
      inp.addEventListener('input', () => {
        currentRouletteSettings[row.key] = Number(inp.value);
        valSpan.textContent = inp.value;
      });
      div.appendChild(inp);
    }
    div.appendChild(valSpan);
    container.appendChild(div);
  }
}
```

- [ ] **Step 14: Verify lobby works for both games**

Open `index.html` in a browser (via live server or `firebase serve`).
- Verify game picker buttons are visible and toggle correctly
- Verify selecting Roulette shows the 3-field settings panel
- Verify selecting Blackjack shows the full BJ settings panel

- [ ] **Step 15: Commit**

```bash
git add js/room.js js/settings.js index.html css/lobby.css js/lobby.js
git commit -m "feat: add game picker to lobby, route to roulette.html based on gameType"
```

---

## Task 3: Roulette Engine (TDD)

**Files:**
- Create: `tests/roulette-engine.test.mjs`
- Create: `js/roulette-engine.js`
- Modify: `package.json`

- [ ] **Step 1: Update `package.json` test script**

```json
{
  "type": "module",
  "scripts": {
    "test": "node tests/engine.test.mjs && node tests/roulette-engine.test.mjs"
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/roulette-engine.test.mjs`:

```js
import assert from 'node:assert/strict';
import { getColor, spin, calcPayouts, WHEEL_SEQUENCE, RED_NUMBERS } from '../js/roulette-engine.js';

// WHEEL_SEQUENCE
assert.equal(WHEEL_SEQUENCE.length, 37, '37 pockets');
assert.equal(WHEEL_SEQUENCE[0], 0, 'first pocket is 0');
assert.equal(new Set(WHEEL_SEQUENCE).size, 37, 'all 37 numbers unique');

// getColor
assert.equal(getColor(0), 'green');
assert.equal(getColor(1), 'red');
assert.equal(getColor(2), 'black');
assert.equal(getColor(36), 'red');
assert.equal(getColor(35), 'black');

// spin
for (let i = 0; i < 200; i++) {
  const s = spin();
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 36, `spin() ${s} out of range`);
}

// calcPayouts — even money bets (1:1)
assert.deepEqual(calcPayouts(1, { p1: { red: 100 } }), { p1: 100 }, 'red wins on 1');
assert.deepEqual(calcPayouts(2, { p1: { red: 100 } }), { p1: -100 }, 'red loses on 2 (black)');
assert.deepEqual(calcPayouts(0, { p1: { red: 100 } }), { p1: -100 }, 'red loses on 0');

assert.deepEqual(calcPayouts(2, { p1: { black: 50 } }), { p1: 50 }, 'black wins on 2');
assert.deepEqual(calcPayouts(1, { p1: { black: 50 } }), { p1: -50 }, 'black loses on 1 (red)');

assert.deepEqual(calcPayouts(1, { p1: { odd: 10 } }), { p1: 10 }, 'odd wins on 1');
assert.deepEqual(calcPayouts(2, { p1: { odd: 10 } }), { p1: -10 }, 'odd loses on 2');
assert.deepEqual(calcPayouts(0, { p1: { odd: 10 } }), { p1: -10 }, 'odd loses on 0');

assert.deepEqual(calcPayouts(2, { p1: { even: 10 } }), { p1: 10 }, 'even wins on 2');
assert.deepEqual(calcPayouts(1, { p1: { even: 10 } }), { p1: -10 }, 'even loses on 1');
assert.deepEqual(calcPayouts(0, { p1: { even: 10 } }), { p1: -10 }, 'even loses on 0');

assert.deepEqual(calcPayouts(18, { p1: { low: 20 } }), { p1: 20 }, 'low wins on 18');
assert.deepEqual(calcPayouts(19, { p1: { low: 20 } }), { p1: -20 }, 'low loses on 19');
assert.deepEqual(calcPayouts(0, { p1: { low: 20 } }), { p1: -20 }, 'low loses on 0');

assert.deepEqual(calcPayouts(19, { p1: { high: 20 } }), { p1: 20 }, 'high wins on 19');
assert.deepEqual(calcPayouts(18, { p1: { high: 20 } }), { p1: -20 }, 'high loses on 18');

// calcPayouts — dozens (2:1)
assert.deepEqual(calcPayouts(12, { p1: { dozen1: 10 } }), { p1: 20 }, '1st dozen pays 2:1 on 12');
assert.deepEqual(calcPayouts(1,  { p1: { dozen1: 10 } }), { p1: 20 }, '1st dozen pays 2:1 on 1');
assert.deepEqual(calcPayouts(13, { p1: { dozen1: 10 } }), { p1: -10 }, '1st dozen loses on 13');
assert.deepEqual(calcPayouts(0,  { p1: { dozen1: 10 } }), { p1: -10 }, '1st dozen loses on 0');

assert.deepEqual(calcPayouts(24, { p1: { dozen2: 10 } }), { p1: 20 }, '2nd dozen pays 2:1 on 24');
assert.deepEqual(calcPayouts(13, { p1: { dozen2: 10 } }), { p1: 20 }, '2nd dozen pays 2:1 on 13');
assert.deepEqual(calcPayouts(12, { p1: { dozen2: 10 } }), { p1: -10 }, '2nd dozen loses on 12');

assert.deepEqual(calcPayouts(36, { p1: { dozen3: 10 } }), { p1: 20 }, '3rd dozen pays 2:1 on 36');
assert.deepEqual(calcPayouts(25, { p1: { dozen3: 10 } }), { p1: 20 }, '3rd dozen pays 2:1 on 25');
assert.deepEqual(calcPayouts(24, { p1: { dozen3: 10 } }), { p1: -10 }, '3rd dozen loses on 24');

// calcPayouts — columns (2:1)
assert.deepEqual(calcPayouts(1,  { p1: { col1: 10 } }), { p1: 20 }, 'col1 wins on 1');
assert.deepEqual(calcPayouts(34, { p1: { col1: 10 } }), { p1: 20 }, 'col1 wins on 34');
assert.deepEqual(calcPayouts(2,  { p1: { col1: 10 } }), { p1: -10 }, 'col1 loses on 2');

assert.deepEqual(calcPayouts(2,  { p1: { col2: 10 } }), { p1: 20 }, 'col2 wins on 2');
assert.deepEqual(calcPayouts(35, { p1: { col2: 10 } }), { p1: 20 }, 'col2 wins on 35');
assert.deepEqual(calcPayouts(1,  { p1: { col2: 10 } }), { p1: -10 }, 'col2 loses on 1');

assert.deepEqual(calcPayouts(3,  { p1: { col3: 10 } }), { p1: 20 }, 'col3 wins on 3');
assert.deepEqual(calcPayouts(36, { p1: { col3: 10 } }), { p1: 20 }, 'col3 wins on 36');
assert.deepEqual(calcPayouts(1,  { p1: { col3: 10 } }), { p1: -10 }, 'col3 loses on 1');
assert.deepEqual(calcPayouts(0,  { p1: { col1: 10 } }), { p1: -10 }, 'col1 loses on 0');

// multiple bet types in one player
assert.deepEqual(calcPayouts(1, { p1: { red: 10, odd: 10 } }), { p1: 20 }, 'wins both red and odd');
assert.deepEqual(calcPayouts(2, { p1: { red: 10, odd: 10 } }), { p1: -20 }, 'loses both red and odd');
assert.deepEqual(calcPayouts(1, { p1: { red: 10, even: 10 } }), { p1: 0 }, 'red wins, even loses — net 0');

// multiple players
const multi = calcPayouts(7, { p1: { red: 100 }, p2: { black: 100 } });
assert.equal(multi.p1, 100, 'p1 wins red on 7');
assert.equal(multi.p2, -100, 'p2 loses black on 7');

// empty bets entry
assert.deepEqual(calcPayouts(5, { p1: {} }), { p1: 0 }, 'no bets = zero delta');

console.log('All roulette engine tests passed.');
```

- [ ] **Step 3: Run the test — confirm it fails**

```
node tests/roulette-engine.test.mjs
```

Expected: error like `Cannot find module '../js/roulette-engine.js'`

- [ ] **Step 4: Implement `js/roulette-engine.js`**

```js
export const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export const WHEEL_SEQUENCE = [
  0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,
  24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26
];

export function getColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export function spin() {
  return Math.floor(Math.random() * 37);
}

export function calcPayouts(spinResult, bets) {
  const n = spinResult;
  const color = getColor(n);
  const isOdd  = n > 0 && n % 2 !== 0;
  const isEven = n > 0 && n % 2 === 0;
  const isLow  = n >= 1 && n <= 18;
  const isHigh = n >= 19 && n <= 36;
  const dozen  = n === 0 ? 0 : Math.ceil(n / 12);
  const col    = n === 0 ? 0 : ((n - 1) % 3) + 1;

  const result = {};
  for (const [uid, b] of Object.entries(bets)) {
    if (!b) continue;
    let delta = 0;
    const checks = [
      [b.red,    color === 'red',   1],
      [b.black,  color === 'black', 1],
      [b.odd,    isOdd,             1],
      [b.even,   isEven,            1],
      [b.low,    isLow,             1],
      [b.high,   isHigh,            1],
      [b.dozen1, dozen === 1,       2],
      [b.dozen2, dozen === 2,       2],
      [b.dozen3, dozen === 3,       2],
      [b.col1,   col === 1,         2],
      [b.col2,   col === 2,         2],
      [b.col3,   col === 3,         2],
    ];
    for (const [amount, wins, mult] of checks) {
      if (!amount) continue;
      delta += wins ? amount * mult : -amount;
    }
    result[uid] = delta;
  }
  return result;
}
```

- [ ] **Step 5: Run tests — confirm all pass**

```
npm test
```

Expected:
```
All deck/hand tests passed.
All action/resolution tests passed.
hiLoValue tests passed.
All roulette engine tests passed.
```

- [ ] **Step 6: Commit**

```bash
git add js/roulette-engine.js tests/roulette-engine.test.mjs package.json
git commit -m "feat: roulette engine — spin, calcPayouts, European wheel sequence"
```

---

## Task 4: `roulette.html` Shell

**Files:**
- Create: `roulette.html`

- [ ] **Step 1: Create `roulette.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roulette</title>
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/chips.css">
  <link rel="stylesheet" href="css/chat.css">
  <link rel="stylesheet" href="css/music.css">
  <link rel="stylesheet" href="css/leaderboard.css">
  <link rel="stylesheet" href="css/roulette.css">
</head>
<body>
  <div id="table-wrap">
    <div id="background-scene"></div>

    <div id="table">
      <!-- Left: wheel -->
      <div id="wheel-section">
        <div id="wheel-frame">
          <div id="wheel-pointer">▼</div>
          <div id="wheel-rotor-wrap">
            <svg id="wheel-svg" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
              <g id="wheel-rotor"></g>
              <circle id="ball" cx="200" cy="22" r="7" fill="white"
                style="filter:drop-shadow(0 2px 3px rgba(0,0,0,0.7))"/>
            </svg>
          </div>
        </div>
        <div id="spin-result" hidden>
          <span id="spin-number"></span>
          <span id="spin-color-label"></span>
        </div>
        <div id="phase-label"></div>
      </div>

      <!-- Right: betting + players -->
      <div id="action-section">
        <div id="chip-selector" class="chip-selector"></div>
        <div id="bet-grid"></div>
        <div id="bet-controls">
          <button id="btn-clear-bets" class="action-btn">Clear</button>
          <span id="my-bet-total">Bet: $0</span>
        </div>
        <div id="players-panel"></div>
        <div id="host-controls" hidden>
          <button id="btn-close-spin" class="btn-primary">Close Bets &amp; Spin</button>
          <button id="btn-next-round" class="btn-primary" hidden>Next Round</button>
        </div>
      </div>
    </div>

    <div id="hud">
      <div class="hud-item">
        <div class="hud-label">Balance</div>
        <div class="hud-value gold" id="hud-balance">$0</div>
      </div>
      <div class="hud-item">
        <div class="hud-label">Last</div>
        <div class="hud-value" id="hud-last-result"></div>
      </div>
      <div class="hud-item" style="margin-left:auto; display:flex; align-items:center; gap:12px;">
        <button id="btn-mute" class="mute-btn" title="Toggle sound">🔊</button>
        <button id="btn-leave" class="hud-leave-btn" title="Leave table">Leave</button>
      </div>
    </div>

    <div id="chat-region">
      <div id="chat-panel"></div>
      <div id="emoji-bar"></div>
    </div>
    <div id="music-region">
      <div id="music-panel"></div>
    </div>
    <div id="leaderboard-region"></div>
  </div>
  <script type="module" src="js/roulette-game.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add roulette.html
git commit -m "feat: add roulette.html shell"
```

---

## Task 5: `css/roulette.css`

**Files:**
- Create: `css/roulette.css`

- [ ] **Step 1: Create `css/roulette.css`**

```css
/* Layout */
body { overflow: hidden; }

#table-wrap {
  position: relative;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

#background-scene {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 40%, var(--clr-felt) 0%, var(--clr-felt-dark) 55%, var(--clr-felt-edge) 100%);
  z-index: 0;
}

#table {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 16px 24px;
  min-height: 0;
}

/* Wheel section */
#wheel-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

#wheel-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

#wheel-pointer {
  color: var(--clr-gold);
  font-size: 22px;
  line-height: 1;
  margin-bottom: -4px;
  z-index: 2;
  text-shadow: 0 0 8px rgba(201,168,76,0.8);
}

#wheel-rotor-wrap {
  position: relative;
  width: 320px;
  height: 320px;
}

#wheel-svg {
  width: 320px;
  height: 320px;
  border-radius: 50%;
  box-shadow:
    0 0 0 3px #c9a84c,
    0 0 30px rgba(0,0,0,0.6),
    inset 0 0 20px rgba(0,0,0,0.4);
}

#wheel-rotor {
  transform-origin: 200px 200px;
}

#ball {
  transform-origin: 200px 200px;
}

#spin-result {
  text-align: center;
  padding: 10px 24px;
  border: 1px solid var(--clr-gold);
  border-radius: 8px;
  background: rgba(0,0,0,0.5);
  min-width: 160px;
}

#spin-number {
  font-size: 2.8rem;
  font-weight: bold;
  color: var(--clr-text);
}

#spin-color-label {
  display: block;
  font-size: 0.85rem;
  letter-spacing: 3px;
  text-transform: uppercase;
  margin-top: 2px;
}

#spin-result.result-red    #spin-number { color: #e53935; }
#spin-result.result-black  #spin-number { color: #e0d8c8; }
#spin-result.result-green  #spin-number { color: #4caf50; }
#spin-result.result-red    #spin-color-label { color: #e53935; }
#spin-result.result-black  #spin-color-label { color: #9e9e9e; }
#spin-result.result-green  #spin-color-label { color: #4caf50; }

#phase-label {
  font-size: 0.8rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--clr-text-dim);
}

/* Action section */
#action-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 320px;
  max-width: 420px;
}

/* Betting grid */
#bet-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
}

.bet-cell {
  grid-column: span 3;
  padding: 10px 4px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(201,168,76,0.25);
  border-radius: 4px;
  text-align: center;
  cursor: pointer;
  font-size: 0.75rem;
  letter-spacing: 1px;
  color: var(--clr-text);
  text-transform: uppercase;
  transition: background 0.12s, border-color 0.12s;
  user-select: none;
  position: relative;
}

.bet-cell:hover:not(.disabled) {
  background: rgba(201,168,76,0.15);
  border-color: var(--clr-gold);
}

.bet-cell.disabled {
  opacity: 0.4;
  cursor: default;
}

.bet-cell.cell-red   { background: rgba(178,34,34,0.25); border-color: rgba(178,34,34,0.5); }
.bet-cell.cell-black { background: rgba(20,20,20,0.5); }
.bet-cell.cell-red:hover:not(.disabled)   { background: rgba(178,34,34,0.45); }
.bet-cell.cell-black:hover:not(.disabled) { background: rgba(60,60,60,0.6); }

/* Dozens/columns span 2 of 6 columns */
.bet-cell.span2 { grid-column: span 2; }

.bet-cell-label { font-size: 0.72rem; }
.bet-cell-amount {
  display: block;
  font-size: 0.85rem;
  color: var(--clr-gold);
  margin-top: 2px;
  min-height: 1em;
}

/* Bet controls */
#bet-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-btn {
  padding: 6px 14px;
  background: rgba(201,168,76,0.1);
  border: 1px solid rgba(201,168,76,0.4);
  color: var(--clr-gold);
  font-size: 0.8rem;
  border-radius: 4px;
}
.action-btn:hover { background: rgba(201,168,76,0.2); }

#my-bet-total {
  font-size: 0.85rem;
  color: var(--clr-text-dim);
}

/* Players panel */
#players-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
}

.player-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  background: rgba(255,255,255,0.04);
  border-radius: 4px;
  font-size: 0.82rem;
}

.player-row-name { color: var(--clr-text); }
.player-row-balance { color: var(--clr-gold); }
.player-row-delta-pos { color: var(--clr-win); font-size: 0.75rem; }
.player-row-delta-neg { color: var(--clr-lose); font-size: 0.75rem; }

/* Host controls */
#host-controls {
  display: flex;
  gap: 8px;
}

.btn-primary {
  padding: 10px 20px;
  background: var(--clr-gold);
  color: #1a1008;
  font-weight: bold;
  font-size: 0.9rem;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-primary:hover { opacity: 0.85; }

/* HUD */
#hud {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 8px 20px;
  background: rgba(10,7,3,0.8);
  border-top: 1px solid rgba(201,168,76,0.2);
}

.hud-item { display: flex; flex-direction: column; gap: 1px; }
.hud-label { font-size: 0.65rem; letter-spacing: 2px; text-transform: uppercase; color: var(--clr-text-dim); }
.hud-value { font-size: 1rem; color: var(--clr-text); font-family: var(--font-ui); }
.hud-value.gold { color: var(--clr-gold); }

.mute-btn, .hud-leave-btn {
  background: transparent;
  border: 1px solid rgba(201,168,76,0.3);
  color: var(--clr-text-dim);
  padding: 4px 10px;
  font-size: 0.8rem;
  border-radius: 4px;
}
.mute-btn:hover, .hud-leave-btn:hover { border-color: var(--clr-gold); color: var(--clr-text); }

/* Chat/music/leaderboard positioning (mirrors game.html layout) */
#chat-region {
  position: fixed;
  bottom: 48px;
  right: 12px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

#music-region {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 20;
}

#leaderboard-region {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 20;
}
```

- [ ] **Step 2: Commit**

```bash
git add css/roulette.css
git commit -m "feat: roulette table CSS — layout, wheel frame, betting grid, HUD"
```

---

## Task 6: `js/roulette-ui.js`

**Files:**
- Create: `js/roulette-ui.js`

- [ ] **Step 1: Create `js/roulette-ui.js`**

```js
import { getColor, WHEEL_SEQUENCE } from './roulette-engine.js';

const CHIP_DENOMS = [1, 5, 25, 100, 500];
let selectedChip = 25;

const BET_CELLS = [
  { id: 'red',    label: 'Red',     cls: 'cell-red',   span: 3 },
  { id: 'black',  label: 'Black',   cls: 'cell-black', span: 3 },
  { id: 'odd',    label: 'Odd',     cls: '',           span: 3 },
  { id: 'even',   label: 'Even',    cls: '',           span: 3 },
  { id: 'low',    label: '1–18',    cls: '',           span: 3 },
  { id: 'high',   label: '19–36',   cls: '',           span: 3 },
  { id: 'dozen1', label: '1st 12',  cls: 'span2',      span: 2 },
  { id: 'dozen2', label: '2nd 12',  cls: 'span2',      span: 2 },
  { id: 'dozen3', label: '3rd 12',  cls: 'span2',      span: 2 },
  { id: 'col1',   label: 'Col 1',   cls: 'span2',      span: 2 },
  { id: 'col2',   label: 'Col 2',   cls: 'span2',      span: 2 },
  { id: 'col3',   label: 'Col 3',   cls: 'span2',      span: 2 },
];

export function buildWheel(rotorEl) {
  const cx = 200, cy = 200, outerR = 175, innerR = 88;
  const N = 37;
  const TWO_PI = 2 * Math.PI;
  const startOffset = -Math.PI / 2;

  const ns = 'http://www.w3.org/2000/svg';

  for (let i = 0; i < N; i++) {
    const num = WHEEL_SEQUENCE[i];
    const a0 = startOffset + (i / N) * TWO_PI;
    const a1 = startOffset + ((i + 1) / N) * TWO_PI;

    const ox1 = cx + outerR * Math.cos(a0), oy1 = cy + outerR * Math.sin(a0);
    const ox2 = cx + outerR * Math.cos(a1), oy2 = cy + outerR * Math.sin(a1);
    const ix2 = cx + innerR * Math.cos(a1), iy2 = cy + innerR * Math.sin(a1);
    const ix1 = cx + innerR * Math.cos(a0), iy1 = cy + innerR * Math.sin(a0);

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d',
      `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 0 1 ${ox2} ${oy2}` +
      ` L ${ix2} ${iy2} A ${innerR} ${innerR} 0 0 0 ${ix1} ${iy1} Z`
    );
    const color = getColor(num);
    path.setAttribute('fill',
      color === 'red' ? '#8b1a1a' : color === 'green' ? '#145a32' : '#111'
    );
    path.setAttribute('stroke', '#c9a84c');
    path.setAttribute('stroke-width', '0.6');
    rotorEl.appendChild(path);

    const midAngle = (a0 + a1) / 2;
    const labelR = (outerR + innerR) / 2;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    const deg = (midAngle * 180 / Math.PI) + 90;

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', lx);
    text.setAttribute('y', ly);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', 'white');
    text.setAttribute('font-size', '9');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('font-family', 'Arial, sans-serif');
    text.setAttribute('transform', `rotate(${deg}, ${lx}, ${ly})`);
    text.textContent = num;
    rotorEl.appendChild(text);
  }

  // Center cap
  const ns2 = 'http://www.w3.org/2000/svg';
  const cap = document.createElementNS(ns2, 'circle');
  cap.setAttribute('cx', cx); cap.setAttribute('cy', cy); cap.setAttribute('r', innerR);
  cap.setAttribute('fill', '#1a0e06');
  cap.setAttribute('stroke', '#c9a84c'); cap.setAttribute('stroke-width', '1.5');
  rotorEl.appendChild(cap);

  const capText = document.createElementNS(ns2, 'text');
  capText.setAttribute('x', cx); capText.setAttribute('y', cy);
  capText.setAttribute('text-anchor', 'middle'); capText.setAttribute('dominant-baseline', 'middle');
  capText.setAttribute('fill', '#c9a84c'); capText.setAttribute('font-size', '11');
  capText.setAttribute('font-family', 'Georgia, serif'); capText.setAttribute('letter-spacing', '1');
  capText.textContent = 'ROULETTE';
  rotorEl.appendChild(capText);

  rotorEl.style.transformOrigin = `${cx}px ${cy}px`;
}

const SEGMENT_DEG = 360 / 37;

export function animateSpin(rotorEl, ballEl, winningNumber, onComplete) {
  const winIndex = WHEEL_SEQUENCE.indexOf(winningNumber);
  const pocketAngle = winIndex * SEGMENT_DEG + SEGMENT_DEG / 2;
  const extra = 360 * 6;
  const landing = (360 - (pocketAngle % 360)) % 360;
  const wheelFinalDeg = extra + landing;

  // Ball counter-rotates, always ending at top (multiples of 360 from 0).
  const ballRounds = Math.ceil((wheelFinalDeg * 1.2) / 360);
  const ballFinalDeg = -(ballRounds * 360);

  // Force reflow so the browser registers the reset-to-0 before animating.
  rotorEl.getBoundingClientRect();

  rotorEl.style.transition = 'transform 5s cubic-bezier(0.17, 0.67, 0.08, 1)';
  rotorEl.style.transform = `rotate(${wheelFinalDeg}deg)`;

  ballEl.style.transformOrigin = '200px 200px';
  ballEl.style.transition = 'transform 5s cubic-bezier(0.17, 0.67, 0.08, 1)';
  ballEl.style.transform = `rotate(${ballFinalDeg}deg)`;

  setTimeout(onComplete, 5200);
}

export function resetBallAndRotor(rotorEl, ballEl) {
  rotorEl.style.transition = 'none';
  rotorEl.style.transform = 'rotate(0deg)';
  ballEl.style.transition = 'none';
  ballEl.style.transform = 'rotate(0deg)';
}

export function buildBettingGrid(gridEl, onBet) {
  gridEl.innerHTML = '';
  for (const cell of BET_CELLS) {
    const div = document.createElement('div');
    div.className = `bet-cell ${cell.cls}`;
    div.dataset.betId = cell.id;
    if (cell.span === 2) div.classList.add('span2');
    div.innerHTML = `<span class="bet-cell-label">${cell.label}</span><span class="bet-cell-amount" id="bet-amount-${cell.id}"></span>`;
    div.addEventListener('click', () => onBet(cell.id, selectedChip));
    gridEl.appendChild(div);
  }
}

export function buildChipSelector(containerEl) {
  containerEl.innerHTML = '';
  for (const denom of CHIP_DENOMS) {
    const btn = document.createElement('button');
    btn.className = 'chip-btn' + (denom === selectedChip ? ' chip-btn-active' : '');
    btn.dataset.denom = denom;
    btn.title = `$${denom}`;

    const chipColors = { 1: '#e8e8e8', 5: '#e53935', 25: '#43a047', 100: '#1e88e5', 500: '#7b1fa2' };
    btn.style.cssText = `width:44px;height:44px;border-radius:50%;background:${chipColors[denom]};` +
      `border:3px solid rgba(255,255,255,0.5);color:white;font-weight:bold;font-size:0.7rem;` +
      `box-shadow:0 2px 6px rgba(0,0,0,0.4);`;
    btn.textContent = denom >= 1000 ? `${denom/1000}K` : `$${denom}`;
    btn.addEventListener('click', () => {
      selectedChip = denom;
      containerEl.querySelectorAll('.chip-btn').forEach(b => b.style.outline = '');
      btn.style.outline = '3px solid #c9a84c';
    });
    containerEl.appendChild(btn);
  }
}

export function updateBetCell(betId, amount) {
  const el = document.getElementById(`bet-amount-${betId}`);
  if (el) el.textContent = amount > 0 ? `$${amount}` : '';
}

export function clearBetCells() {
  for (const cell of BET_CELLS) updateBetCell(cell.id, 0);
}

export function setGridEnabled(enabled) {
  document.querySelectorAll('.bet-cell').forEach(el => {
    el.classList.toggle('disabled', !enabled);
  });
}

export function showSpinResult(number, color, playerDelta) {
  const el = document.getElementById('spin-result');
  el.className = `result-${color}`;
  document.getElementById('spin-number').textContent = number;
  document.getElementById('spin-color-label').textContent = color.toUpperCase();
  el.hidden = false;

  const lastEl = document.getElementById('hud-last-result');
  if (lastEl) {
    lastEl.textContent = playerDelta > 0 ? `+$${playerDelta}` : playerDelta < 0 ? `-$${Math.abs(playerDelta)}` : 'Push';
    lastEl.style.color = playerDelta > 0 ? 'var(--clr-win)' : playerDelta < 0 ? 'var(--clr-lose)' : 'var(--clr-push)';
  }
}

export function hideSpinResult() {
  const el = document.getElementById('spin-result');
  if (el) el.hidden = true;
}

export function renderPlayers(players, myUid, payouts) {
  const panel = document.getElementById('players-panel');
  if (!panel) return;
  panel.innerHTML = '';
  for (const [pid, p] of Object.entries(players || {})) {
    if (p.kicked) continue;
    const row = document.createElement('div');
    row.className = 'player-row';
    const delta = payouts?.[pid];
    const deltaHtml = delta != null
      ? `<span class="${delta >= 0 ? 'player-row-delta-pos' : 'player-row-delta-neg'}">${delta >= 0 ? '+' : ''}$${delta}</span>`
      : '';
    row.innerHTML = `<span class="player-row-name">${p.name}${pid === myUid ? ' ★' : ''}</span>` +
      `<span class="player-row-balance">$${p.balance ?? 0} ${deltaHtml}</span>`;
    panel.appendChild(row);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/roulette-ui.js
git commit -m "feat: roulette UI — SVG wheel builder, spin animation, betting grid"
```

---

## Task 7: `js/roulette-game.js`

**Files:**
- Create: `js/roulette-game.js`

- [ ] **Step 1: Create `js/roulette-game.js`**

```js
import {
  initRoom, joinRoom, onRoomChange, uid, roomCode,
  isHost, updateRoomField, updateAllBalances,
  setupConnectionMonitoring
} from './room.js';
import { initChat } from './chat.js';
import { initMusicPlayer } from './music.js';
import { initLeaderboard, updateLeaderboard } from './leaderboard.js';
import { spin, calcPayouts, getColor } from './roulette-engine.js';
import {
  buildWheel, buildBettingGrid, buildChipSelector,
  animateSpin, resetBallAndRotor,
  updateBetCell, clearBetCells, setGridEnabled,
  showSpinResult, hideSpinResult, renderPlayers
} from './roulette-ui.js';
import { update, ref, getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import * as sound from './sound.js';

const params = new URLSearchParams(location.search);
const code = params.get('room');
if (!code) location.href = 'index.html';

let currentRoom = null;
let localBets = {};          // { betId: amount }
let lastPhase = null;
let spinning = false;

const rotorEl = document.getElementById('wheel-rotor');
const ballEl  = document.getElementById('ball');

function db() { return getDatabase(getApp()); }

async function writeBetsToFirebase() {
  const betObj = {};
  for (const [k, v] of Object.entries(localBets)) {
    betObj[k] = v > 0 ? v : null;
  }
  await update(ref(db(), `rooms/${roomCode}/rouletteBets/${uid}`), betObj);
}

function getTotalBet() {
  return Object.values(localBets).reduce((s, v) => s + (v || 0), 0);
}

function updateBetTotalDisplay() {
  const el = document.getElementById('my-bet-total');
  if (el) el.textContent = `Bet: $${getTotalBet()}`;
}

function updateBalanceDisplay(balance) {
  const el = document.getElementById('hud-balance');
  if (el) el.textContent = `$${balance}`;
}

function updatePhaseLabel(phase) {
  const el = document.getElementById('phase-label');
  if (!el) return;
  const labels = { betting: 'Place your bets', spinning: 'No more bets...', results: 'Round over' };
  el.textContent = labels[phase] || '';
}

function handleBettingPhase(room) {
  hideSpinResult();
  setGridEnabled(true);
  updatePhaseLabel('betting');

  const hostCtrl = document.getElementById('host-controls');
  const btnSpin  = document.getElementById('btn-close-spin');
  const btnNext  = document.getElementById('btn-next-round');
  if (hostCtrl && isHost) {
    hostCtrl.hidden = false;
    btnSpin.hidden  = false;
    btnNext.hidden  = true;
  }

  renderPlayers(room.players, uid, null);
}

function handleSpinningPhase(room) {
  if (spinning) return;
  spinning = true;
  setGridEnabled(false);
  updatePhaseLabel('spinning');

  const { number, color } = room.lastSpin || {};

  animateSpin(rotorEl, ballEl, number, () => {
    spinning = false;
    showSpinResult(number, color, null);
    if (isHost) applyPayoutsAndSetResults(room);
  });
}

async function applyPayoutsAndSetResults(room) {
  const { number } = room.lastSpin;
  const bets = room.rouletteBets || {};
  const payouts = calcPayouts(number, bets);

  // Write balance updates and phase change atomically to avoid clients
  // seeing results phase before balances are updated.
  const updates = { [`rooms/${roomCode}/phase`]: 'results' };
  const players = room.players || {};
  for (const [pid, p] of Object.entries(players)) {
    if (p.kicked) continue;
    const delta = payouts[pid] || 0;
    updates[`rooms/${roomCode}/players/${pid}/balance`] = (p.balance || 0) + delta;
  }
  await update(ref(db()), updates);
}

function handleResultsPhase(room) {
  const { number, color } = room.lastSpin || {};
  const bets = room.rouletteBets || {};
  const payouts = calcPayouts(number, bets);
  const myDelta = payouts[uid] || 0;

  showSpinResult(number, color, myDelta);
  setGridEnabled(false);
  updatePhaseLabel('results');
  renderPlayers(room.players, uid, payouts);
  updateLeaderboard(room.players, uid);

  const hostCtrl = document.getElementById('host-controls');
  const btnSpin  = document.getElementById('btn-close-spin');
  const btnNext  = document.getElementById('btn-next-round');
  if (hostCtrl && isHost) {
    hostCtrl.hidden = false;
    btnSpin.hidden  = true;
    btnNext.hidden  = false;
  }
}

function handleRoomChange(room) {
  if (!room) return;
  currentRoom = room;

  const me = room.players?.[uid];
  if (me) updateBalanceDisplay(me.balance ?? 0);

  renderPlayers(room.players, uid, null);

  const phase = room.phase;
  if (phase === 'betting') {
    if (lastPhase !== 'betting') {
      localBets = {};
      clearBetCells();
      updateBetTotalDisplay();
      resetBallAndRotor(rotorEl, ballEl);
    }
    handleBettingPhase(room);
  } else if (phase === 'spinning' && lastPhase !== 'spinning') {
    handleSpinningPhase(room);
  } else if (phase === 'results' && lastPhase !== 'results') {
    handleResultsPhase(room);
  }

  lastPhase = phase;
}

async function init() {
  await initRoom();
  const playerName = sessionStorage.getItem('playerName') || 'Player';
  await joinRoom(code, playerName);
  setupConnectionMonitoring();
  sound.init();

  buildWheel(rotorEl);
  buildChipSelector(document.getElementById('chip-selector'));
  buildBettingGrid(document.getElementById('bet-grid'), onBetClick);
  setGridEnabled(false);

  initChat(roomCode, uid, playerName, {});
  initMusicPlayer(roomCode, isHost);
  initLeaderboard();

  document.getElementById('btn-mute')?.addEventListener('click', () => {
    sound.toggleMute();
    document.getElementById('btn-mute').textContent = sound.isMuted() ? '🔇' : '🔊';
  });

  document.getElementById('btn-leave')?.addEventListener('click', () => {
    location.href = 'index.html';
  });

  document.getElementById('btn-clear-bets')?.addEventListener('click', async () => {
    if (currentRoom?.phase !== 'betting') return;
    localBets = {};
    clearBetCells();
    updateBetTotalDisplay();
    await writeBetsToFirebase();
  });

  document.getElementById('btn-close-spin')?.addEventListener('click', async () => {
    if (!isHost || currentRoom?.phase !== 'betting') return;
    const result = spin();
    const color = getColor(result);
    const db2 = db();
    await update(ref(db2), {
      [`rooms/${roomCode}/lastSpin`]: { number: result, color },
      [`rooms/${roomCode}/phase`]: 'spinning',
    });
  });

  document.getElementById('btn-next-round')?.addEventListener('click', async () => {
    if (!isHost || currentRoom?.phase !== 'results') return;
    const db2 = db();
    await update(ref(db2), {
      [`rooms/${roomCode}/rouletteBets`]: null,
      [`rooms/${roomCode}/phase`]: 'betting',
    });
  });

  onRoomChange(handleRoomChange);
}

async function onBetClick(betId, amount) {
  if (currentRoom?.phase !== 'betting') return;
  const me = currentRoom?.players?.[uid];
  const balance = me?.balance ?? 0;
  const currentTotal = getTotalBet();
  if (currentTotal + amount > balance) return;

  localBets[betId] = (localBets[betId] || 0) + amount;
  updateBetCell(betId, localBets[betId]);
  updateBetTotalDisplay();
  await writeBetsToFirebase();
}

init().catch(console.error);
```

- [ ] **Step 2: Commit**

```bash
git add js/roulette-game.js
git commit -m "feat: roulette game loop — Firebase coordination, phase management, payouts"
```

---

## Task 8: End-to-End Test

- [ ] **Step 1: Serve the project**

```
firebase serve
```

Or use a local HTTP server (`npx serve .` or VS Code Live Server). Open `http://localhost:5000` (or wherever it serves).

- [ ] **Step 2: Test lobby routing**

- Open two browser windows to `index.html`
- In window 1: enter a name, select Roulette, click Create Room
- Verify the settings panel shows only Min Bet / Max Bet / Starting Balance
- Click Start Game — verify redirect to `roulette.html?room=XXXXX`
- In window 2: enter a name, join the room code — verify redirect to `roulette.html`

- [ ] **Step 3: Test betting phase**

- Verify chip selector renders (5 colored chips: $1 $5 $25 $100 $500)
- Click chip denominations — verify selection highlight changes
- Click betting cells — verify amount updates in the cell and "Bet: $N" updates
- Verify balance is deducted in the bet total (can't bet more than balance)
- Click Clear — verify all cells reset to empty

- [ ] **Step 4: Test wheel spin**

- As host: click "Close Bets & Spin"
- Verify wheel animates (rotates ~6 full turns, slows, stops)
- Verify ball counter-rotates
- Verify spin result panel appears (number and color)
- Verify players panel shows correct balance after payout

- [ ] **Step 5: Test Next Round**

- As host: click "Next Round"
- Verify phase returns to betting
- Verify bet cells clear
- Verify spin result panel hides

- [ ] **Step 6: Test with 2 players**

- Join with two browser windows, both place different bets
- Spin — verify each player's correct win/loss shows in the players panel

- [ ] **Step 7: Verify Blackjack lobby still works**

- On `index.html`, confirm Blackjack is selected by default
- Create a Blackjack room and confirm redirect to `game.html` still works

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "feat: roulette game complete — lobby picker, wheel, betting grid, payouts"
```
