# Round Counter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent per-session round counter to the top-left of the felt table, synced via Firebase, with a CSS 3D flip animation on increment.

**Architecture:** A new `roundCount` Firebase field on the room is incremented by the host in `advanceFromBetting()`. All clients receive it via the existing `onRoomChange` listener and call `updateRoundCounter()` (private to `ui.js`) from within `renderTableState`. The flip animation uses two CSS `@keyframes` (flip-out / flip-in) driven by `animationend` events — no JS timers.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database, CSS 3D transforms

---

## File Map

| File | Change |
|---|---|
| `game.html` | Add `#round-counter` element inside `#table` |
| `css/hud.css` | Add styles for `#round-counter`, `.round-label`, `.flip-cell` + `@keyframes` |
| `js/game.js` | Increment `roundCount` in `advanceFromBetting()` |
| `js/ui.js` | Add `updateRoundCounter(n)` (private), call from `renderTableState` |

---

## Task 1: Add HTML element

**Files:**
- Modify: `game.html:19-43` (inside `#table`, before `#table-center`)

- [ ] **Step 1: Add `#round-counter` inside `#table`**

In `game.html`, add the following immediately after the `<div id="table">` opening tag (before `#dealer-area`):

```html
<div id="round-counter">
  <div class="round-label">ROUND</div>
  <div class="flip-cell">0</div>
</div>
```

The full `#table` block should now open as:

```html
<div id="table">
  <div id="round-counter">
    <div class="round-label">ROUND</div>
    <div class="flip-cell">0</div>
  </div>
  <div id="dealer-area">
```

- [ ] **Step 2: Commit**

```bash
git add game.html
git commit -m "feat: add #round-counter HTML element to table"
```

---

## Task 2: Add CSS styles and flip animation

**Files:**
- Modify: `css/hud.css` (append to end of file)

- [ ] **Step 1: Append styles to `css/hud.css`**

Add to the end of `css/hud.css`:

```css
#round-counter {
  position: absolute;
  top: 20px;
  left: 20px;
  perspective: 200px;
  text-align: center;
  pointer-events: none;
  z-index: 3;
}

.round-label {
  color: var(--clr-text-dim);
  font-size: 10px;
  font-family: var(--font-ui);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 2px;
}

.flip-cell {
  color: var(--clr-gold);
  font-size: 28px;
  font-family: var(--font-main);
  font-weight: bold;
  transform-origin: center center;
  display: block;
  line-height: 1;
}

.flip-cell.flip-out {
  animation: flip-out 0.13s ease-in forwards;
}

.flip-cell.flip-in {
  animation: flip-in 0.13s ease-out forwards;
}

@keyframes flip-out {
  from { transform: rotateX(0deg); }
  to   { transform: rotateX(90deg); }
}

@keyframes flip-in {
  from { transform: rotateX(-90deg); }
  to   { transform: rotateX(0deg); }
}
```

- [ ] **Step 2: Open the game in a browser and verify**

Open `game.html` (or navigate to the hosted URL). You should see "ROUND" in dim text and "0" in gold at the top-left corner of the felt table. No animation yet.

- [ ] **Step 3: Commit**

```bash
git add css/hud.css
git commit -m "feat: add round counter styles and flip-out/flip-in keyframes"
```

---

## Task 3: Increment `roundCount` in Firebase on deal start

**Files:**
- Modify: `js/game.js:663-672` (`advanceFromBetting` function)

- [ ] **Step 1: Add `updateRoomField` call in `advanceFromBetting`**

The current `advanceFromBetting` in `js/game.js` looks like this:

```javascript
async function advanceFromBetting(room) {
  const players = room.players || {};
  for (const [pid, p] of Object.entries(players)) {
    if (p.kicked) continue;
    if (p.status !== 'ready' && p.status !== 'sitting-out') {
      await updatePlayer(pid, { status: 'sitting-out' });
    }
  }
  await setPhase('dealing');
}
```

Replace it with:

```javascript
async function advanceFromBetting(room) {
  const players = room.players || {};
  for (const [pid, p] of Object.entries(players)) {
    if (p.kicked) continue;
    if (p.status !== 'ready' && p.status !== 'sitting-out') {
      await updatePlayer(pid, { status: 'sitting-out' });
    }
  }
  await updateRoomField('roundCount', (room.roundCount || 0) + 1);
  await setPhase('dealing');
}
```

`updateRoomField` is already imported at the top of `game.js` — no import change needed.

- [ ] **Step 2: Commit**

```bash
git add js/game.js
git commit -m "feat: increment roundCount in Firebase when dealing phase starts"
```

---

## Task 4: Wire counter display and animation in `ui.js`

**Files:**
- Modify: `js/ui.js` (add module-level variable + private function + one call in `renderTableState`)

- [ ] **Step 1: Add module-level tracking variable**

At the top of `js/ui.js`, after the existing imports (after line 2), add:

```javascript
let _lastRenderedRound = null;
```

- [ ] **Step 2: Add `updateRoundCounter` private function**

Add the following function anywhere before `renderTableState` in `js/ui.js` (e.g. after `renderHandEl`):

```javascript
function updateRoundCounter(n) {
  const cell = document.querySelector('#round-counter .flip-cell');
  if (!cell) return;
  if (_lastRenderedRound === null) {
    cell.textContent = n;
    _lastRenderedRound = n;
    return;
  }
  if (n === _lastRenderedRound) return;
  _lastRenderedRound = n;
  cell.classList.remove('flip-in');
  cell.classList.add('flip-out');
  cell.addEventListener('animationend', function onOut() {
    cell.removeEventListener('animationend', onOut);
    cell.textContent = n;
    cell.classList.remove('flip-out');
    cell.classList.add('flip-in');
    cell.addEventListener('animationend', function onIn() {
      cell.removeEventListener('animationend', onIn);
      cell.classList.remove('flip-in');
    });
  });
}
```

- [ ] **Step 3: Call `updateRoundCounter` from `renderTableState`**

In `renderTableState`, find the `updatePhaseUI` call (currently the last meaningful call in the function, around line 312):

```javascript
  updatePhaseUI(room, myUid, players[myUid]);
```

Add the round counter call immediately after it:

```javascript
  updatePhaseUI(room, myUid, players[myUid]);
  updateRoundCounter(room.roundCount || 0);
```

- [ ] **Step 4: Commit**

```bash
git add js/ui.js
git commit -m "feat: render round counter with flip animation in ui.js"
```

---

## Task 5: End-to-end verification

- [ ] **Step 1: Open the game and start a session**

Open the game, join a room as host, and start a hand. When the dealing phase begins, the counter should flip from 0 to 1.

- [ ] **Step 2: Play several rounds**

Play 3–4 complete hands. Verify:
- Counter increments by 1 each time dealing starts (not on reshuffle, not on resolution)
- The flip animation plays smoothly — old number rotates out, new number rotates in
- A second player in the same room sees the same count in sync

- [ ] **Step 3: Test mid-session join**

Have a player join after round 3 has already been played. Verify they immediately see "3" (or whatever the current count is) without animation.

- [ ] **Step 4: Verify reshuffle does not reset counter**

Trigger a shoe reshuffle (via the shuffle vote or host button). Verify the round counter does NOT change.
