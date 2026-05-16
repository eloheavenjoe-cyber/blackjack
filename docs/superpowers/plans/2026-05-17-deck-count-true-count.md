# Deck Count & True Count Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show all players a live shoe count (always visible) and let the host optionally reveal Hi-Lo running/true count to all players.

**Architecture:** Host writes `cardsRemaining` and `runningCount` to Firebase after each card-consuming action (hit, double, split, deal, dealer draw). Clients read from room state in `renderTableState` and update two fixed-position overlay elements. A host-only toggle button controls `showCount` in Firebase. Host controls panel becomes persistent across all phases.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database, plain CSS.

---

## File Map

| File | Change |
|---|---|
| `js/engine.js` | Add `hiLoValue(card)` export |
| `js/game.js` | Add `runningCount` module var + `hiLoValue` import; write `cardsRemaining`+`runningCount` after each action; add count toggle button in `init()` |
| `js/ui.js` | Update `renderTableState` for shoe/count/toggle-label; update `updatePhaseUI` so host-controls stays visible for host |
| `game.html` | Add `#shoe-display` and `#count-display` elements |
| `css/hud.css` | Style `#shoe-display` and `#count-display` |
| `tests/engine.test.mjs` | Add `hiLoValue` tests |

---

## Task 1: hiLoValue in engine.js

**Files:**
- Modify: `js/engine.js`
- Modify: `tests/engine.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append to the bottom of `tests/engine.test.mjs` (before the final console.log or after it):

```js
// hiLoValue
import { hiLoValue } from '../js/engine.js';
assert.equal(hiLoValue({ rank: '2', suit: 'hearts' }), 1,  '2 = +1');
assert.equal(hiLoValue({ rank: '6', suit: 'clubs' }),  1,  '6 = +1');
assert.equal(hiLoValue({ rank: '7', suit: 'spades' }), 0,  '7 = 0');
assert.equal(hiLoValue({ rank: '9', suit: 'diamonds'}), 0, '9 = 0');
assert.equal(hiLoValue({ rank: '10', suit: 'hearts'}), -1, '10 = -1');
assert.equal(hiLoValue({ rank: 'J',  suit: 'hearts'}), -1, 'J = -1');
assert.equal(hiLoValue({ rank: 'Q',  suit: 'hearts'}), -1, 'Q = -1');
assert.equal(hiLoValue({ rank: 'K',  suit: 'hearts'}), -1, 'K = -1');
assert.equal(hiLoValue({ rank: 'A',  suit: 'hearts'}), -1, 'A = -1');
console.log('hiLoValue tests passed.');
```

Also update the import line at the top of the test file to include `hiLoValue`:

```js
import {
  createDeck, shuffle, cardFromStr, cardToStr,
  handValue, isSoft, isBlackjack, isBust,
  canHit, canStand, canDouble, canSplit, canSurrender,
  dealerShouldHit, resolveHand, hiLoValue
} from '../js/engine.js';
```

- [ ] **Step 2: Run tests to confirm they fail**

```
node tests/engine.test.mjs
```

Expected: Error — `hiLoValue` is not exported.

- [ ] **Step 3: Add hiLoValue to engine.js**

Add after the `canInsure` function (around line 115):

```js
export function hiLoValue(card) {
  if (['2', '3', '4', '5', '6'].includes(card.rank)) return 1;
  if (['10', 'J', 'Q', 'K', 'A'].includes(card.rank)) return -1;
  return 0;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```
node tests/engine.test.mjs
```

Expected: All tests pass, including `hiLoValue tests passed.`

- [ ] **Step 5: Commit**

```
git add js/engine.js tests/engine.test.mjs
git commit -m "feat: add hiLoValue (Hi-Lo card counting) to engine"
```

---

## Task 2: HTML elements and CSS

**Files:**
- Modify: `game.html`
- Modify: `css/hud.css`

- [ ] **Step 1: Add display elements to game.html**

Inside `<div id="table-wrap">`, add both elements before the closing `</div>` (after the `#host-controls` div):

```html
    <div id="shoe-display"></div>
    <div id="count-display" hidden>
      <div id="rc-value">RC: +0</div>
      <div id="tc-value">TC: +0.0</div>
    </div>
```

Full updated tail of `<div id="table-wrap">`:

```html
    <div id="action-buttons" hidden></div>
    <div id="chip-selector-wrap" hidden></div>
    <div id="host-controls" hidden></div>
    <div id="shoe-display"></div>
    <div id="count-display" hidden>
      <div id="rc-value">RC: +0</div>
      <div id="tc-value">TC: +0.0</div>
    </div>
  </div>
```

- [ ] **Step 2: Add CSS to hud.css**

Append to the bottom of `css/hud.css`:

```css
#shoe-display {
  position: fixed;
  top: 16px;
  right: 80px;
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--clr-text-dim);
  letter-spacing: 1px;
  z-index: 10;
  pointer-events: none;
}

#count-display {
  position: fixed;
  top: 50%;
  left: 20px;
  transform: translateY(-50%);
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--clr-text-dim);
  letter-spacing: 1px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
}
```

- [ ] **Step 3: Commit**

```
git add game.html css/hud.css
git commit -m "feat: add shoe-display and count-display overlay elements"
```

---

## Task 3: Update ui.js

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Update renderTableState to update shoe and count displays**

At the bottom of `renderTableState`, just before the final closing `}`, add after the `updatePhaseUI(...)` call:

```js
  const shoeEl = document.getElementById('shoe-display');
  if (shoeEl) {
    shoeEl.textContent = room.cardsRemaining != null
      ? `Shoe: ${(room.cardsRemaining / 52).toFixed(1)} decks`
      : '';
  }

  const countEl = document.getElementById('count-display');
  if (countEl) {
    countEl.hidden = !room.showCount;
    if (room.showCount && room.cardsRemaining) {
      const rc = room.runningCount || 0;
      const tc = rc / (room.cardsRemaining / 52);
      const rcEl = document.getElementById('rc-value');
      const tcEl = document.getElementById('tc-value');
      if (rcEl) rcEl.textContent = `RC: ${rc >= 0 ? '+' : ''}${rc}`;
      if (tcEl) tcEl.textContent = `TC: ${tc >= 0 ? '+' : ''}${tc.toFixed(1)}`;
    }
  }

  const countBtn = document.getElementById('btn-toggle-count');
  if (countBtn) countBtn.textContent = room.showCount ? 'Hide Count' : 'Show Count';
```

The full `renderTableState` function should now end with:

```js
  const me = players[myUid];
  if (me) {
    const balEl = document.getElementById('hud-balance');
    if (balEl) balEl.textContent = `$${me.balance}`;
    const betEl = document.getElementById('hud-bet');
    if (betEl) betEl.textContent = `$${me.bet || 0}`;
  }

  updatePhaseUI(room, myUid, players[myUid]);

  const shoeEl = document.getElementById('shoe-display');
  if (shoeEl) {
    shoeEl.textContent = room.cardsRemaining != null
      ? `Shoe: ${(room.cardsRemaining / 52).toFixed(1)} decks`
      : '';
  }

  const countEl = document.getElementById('count-display');
  if (countEl) {
    countEl.hidden = !room.showCount;
    if (room.showCount && room.cardsRemaining) {
      const rc = room.runningCount || 0;
      const tc = rc / (room.cardsRemaining / 52);
      const rcEl = document.getElementById('rc-value');
      const tcEl = document.getElementById('tc-value');
      if (rcEl) rcEl.textContent = `RC: ${rc >= 0 ? '+' : ''}${rc}`;
      if (tcEl) tcEl.textContent = `TC: ${tc >= 0 ? '+' : ''}${tc.toFixed(1)}`;
    }
  }

  const countBtn = document.getElementById('btn-toggle-count');
  if (countBtn) countBtn.textContent = room.showCount ? 'Hide Count' : 'Show Count';
}
```

- [ ] **Step 2: Update updatePhaseUI so host-controls stays visible for the host**

In `updatePhaseUI`, find this line:

```js
  if (hostCtrl) hostCtrl.hidden = true;
```

Replace it with:

```js
  if (hostCtrl) hostCtrl.hidden = (room.hostId !== myUid);
```

- [ ] **Step 3: Commit**

```
git add js/ui.js
git commit -m "feat: update renderTableState and updatePhaseUI for shoe/count display"
```

---

## Task 4: Track runningCount in game.js — dealing, hit, double, split

**Files:**
- Modify: `js/game.js`

- [ ] **Step 1: Add module-level runningCount and import hiLoValue**

At the top of `js/game.js`, update the engine import line to include `hiLoValue`:

```js
import { createDeck, shuffle, cardToStr, cardFromStr, handValue, isBlackjack, isBust,
         canHit, canStand, canDouble, canSplit, canSurrender, dealerShouldHit, resolveHand,
         hiLoValue } from './engine.js';
```

Below the existing module-level variable declarations (near `let localDeck = [];`), add:

```js
let runningCount = 0;
```

- [ ] **Step 2: Reset runningCount on reshuffle and write after dealing**

In `handleDealingPhase`, find the reshuffle block:

```js
    if (localDeck.length < 20) {
      localDeck = shuffle(createDeck(room.settings.decks)).map(cardToStr);
    }
```

Replace with:

```js
    if (localDeck.length < 20) {
      localDeck = shuffle(createDeck(room.settings.decks)).map(cardToStr);
      runningCount = 0;
    }
```

Then find the lines after `localDeck = result.remaining;`:

```js
    localDeck = result.remaining;

    await setPhase('playing');
```

Replace with:

```js
    localDeck = result.remaining;

    const dealtCards = [
      ...Object.values(result.playerHands).flat(),
      ...result.dealerHand
    ].map(cardFromStr);
    runningCount += dealtCards.reduce((sum, c) => sum + hiLoValue(c), 0);
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', runningCount),
    ]);

    await setPhase('playing');
```

- [ ] **Step 3: Write count after hit**

In `applyPlayerAction`, find the hit block:

```js
  if (actionType === 'hit') {
    const card = localDeck.shift();
    newHandStrs.push(card);
    const newHand = newHandStrs.map(cardFromStr);
    newStatus = isBust(newHand) ? 'bust' : player.status;
    const newHands = [...(player.hands || [])];
    newHands[handIdx] = newHandStrs;
    await updatePlayer(pid, { hands: newHands, status: newStatus, action: null });
    if (newStatus !== 'bust') return;
  }
```

Replace with:

```js
  if (actionType === 'hit') {
    const card = localDeck.shift();
    newHandStrs.push(card);
    const newHand = newHandStrs.map(cardFromStr);
    newStatus = isBust(newHand) ? 'bust' : player.status;
    const newHands = [...(player.hands || [])];
    newHands[handIdx] = newHandStrs;
    await updatePlayer(pid, { hands: newHands, status: newStatus, action: null });
    runningCount += hiLoValue(cardFromStr(card));
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', runningCount),
    ]);
    if (newStatus !== 'bust') return;
  }
```

- [ ] **Step 4: Write count after double**

Find the double block ending with:

```js
    await updatePlayer(pid, { hands: newHands, bets: newBets, balance: newBalance, status: newStatus, action: null });
  } else if (actionType === 'split') {
```

Add the count write between the `updatePlayer` call and the `} else if (actionType === 'split')`:

```js
    await updatePlayer(pid, { hands: newHands, bets: newBets, balance: newBalance, status: newStatus, action: null });
    runningCount += hiLoValue(cardFromStr(card));
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', runningCount),
    ]);
  } else if (actionType === 'split') {
```

- [ ] **Step 5: Write count after split**

Find the split block. It currently ends with:

```js
    newBalance -= bets[handIdx] || 0;
    await updatePlayer(pid, { hands, bets, balance: newBalance, splitCount: (player.splitCount || 0) + 1, action: null });
    await setCurrentTurn(pid, settings.actionTimer || 30);
    return;
  }
```

Replace with:

```js
    newBalance -= bets[handIdx] || 0;
    await updatePlayer(pid, { hands, bets, balance: newBalance, splitCount: (player.splitCount || 0) + 1, action: null });
    runningCount += hiLoValue(cardFromStr(draw1)) + hiLoValue(cardFromStr(draw2));
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', runningCount),
    ]);
    await setCurrentTurn(pid, settings.actionTimer || 30);
    return;
  }
```

- [ ] **Step 6: Commit**

```
git add js/game.js
git commit -m "feat: track runningCount in game.js for deal/hit/double/split"
```

---

## Task 5: Track runningCount in dealer hand + add host toggle button

**Files:**
- Modify: `js/game.js`

- [ ] **Step 1: Write count after dealer hand resolves**

In `playDealerHand`, find the current setup:

```js
async function playDealerHand(room) {
  await setPhase('resolution');
  const dealer = room.dealer;
  let dealerCards = [...(dealer.hand || []), dealer.hiddenCard].filter(Boolean).map(cardFromStr);

  while (dealerShouldHit(dealerCards, room.settings)) {
    dealerCards.push(cardFromStr(localDeck.shift()));
  }

  const dealerStrs = dealerCards.map(cardToStr);
  const { setDealer } = await import('./room.js');
  await setDealer(dealerStrs.slice(0, -1), dealerStrs[dealerStrs.length - 1]);
```

Replace with:

```js
async function playDealerHand(room) {
  await setPhase('resolution');
  const dealer = room.dealer;
  let dealerCards = [...(dealer.hand || []), dealer.hiddenCard].filter(Boolean).map(cardFromStr);

  const revealedCards = [];
  if (dealer.hiddenCard) revealedCards.push(cardFromStr(dealer.hiddenCard));

  while (dealerShouldHit(dealerCards, room.settings)) {
    const drawn = cardFromStr(localDeck.shift());
    dealerCards.push(drawn);
    revealedCards.push(drawn);
  }

  const dealerStrs = dealerCards.map(cardToStr);
  const { setDealer } = await import('./room.js');
  await setDealer(dealerStrs.slice(0, -1), dealerStrs[dealerStrs.length - 1]);

  runningCount += revealedCards.reduce((sum, c) => sum + hiLoValue(c), 0);
  await Promise.all([
    updateRoomField('cardsRemaining', localDeck.length),
    updateRoomField('runningCount', runningCount),
  ]);
```

- [ ] **Step 2: Add count toggle button to host init**

In the `init()` function, after the `onRoomChange(...)` call and before `document.getElementById('btn-donate')...`, add:

```js
  if (isHost) {
    const hostCtrl = document.getElementById('host-controls');
    if (hostCtrl) {
      const countBtn = document.createElement('button');
      countBtn.id = 'btn-toggle-count';
      countBtn.className = 'action-btn';
      countBtn.style.marginTop = '8px';
      countBtn.textContent = 'Show Count';
      countBtn.addEventListener('click', async () => {
        await updateRoomField('showCount', !(currentRoom?.showCount));
      });
      hostCtrl.appendChild(countBtn);
    }
  }
```

- [ ] **Step 3: Commit**

```
git add js/game.js
git commit -m "feat: track runningCount for dealer reveal; add host count toggle"
```

---

## Task 6: Push and smoke test

- [ ] **Step 1: Push to master**

```
git push origin master
```

- [ ] **Step 2: Open the live site and run through a hand**

URL: https://eloheavenjoe-cyber.github.io/blackjack/

Verify:
- `Shoe: X.X decks` appears top-right immediately when game starts, decreases after each deal/hit/double
- As non-host, count display is hidden by default
- As host, "Show Count" button appears in host-controls at all phases (not just betting)
- Clicking "Show Count" → button label changes to "Hide Count", RC and TC appear on left for all players
- RC and TC values update each action (deal, hit, double, split, dealer draw)
- RC resets to 0 when deck reshuffles (shoe count jumps back up)
- "Hide Count" hides the count display for all players again
- Force Start button still works during betting
- Existing features unaffected: chip selector, action buttons, balances, timer
