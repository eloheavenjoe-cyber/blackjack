# Dealer Catchphrases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a one-per-hand speech bubble near the dealer at resolution, picking a humorous line based on the hand outcome.

**Architecture:** A new `catchphrases.js` module owns all line pools and the bubble DOM logic, triggered from `game.js` when the phase transitions to `resolution`. The bubble is purely client-side — no Firebase. A 1.5s delay after phase change ensures the dealer's final hand has been written to Firebase before we evaluate the outcome.

**Tech Stack:** Vanilla JS ES modules, CSS keyframe animation, existing Firebase room state.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `game.html` | Modify | Add `#dealer-bubble` div inside `#dealer-area` |
| `css/table.css` | Modify | Speech bubble styles + fade animation |
| `js/catchphrases.js` | Create | Line pools + `triggerCatchphrase(event)` |
| `js/game.js` | Modify | Detect resolution phase, call `triggerCatchphrase` |

---

### Task 1: Add `#dealer-bubble` to game.html

**Files:**
- Modify: `game.html:17-29`

- [ ] **Step 1: Open game.html and find `#dealer-area`**

Current content of `#dealer-area` (lines 17–29):
```html
<div id="dealer-area">
  <div id="dealer-avatar">
    <img src="assets/dealer-avatar.png" width="80" height="80" alt="Dealer">
  </div>
  <div id="dealer-hand-wrap"></div>
  <div id="timer-ring-container"></div>
</div>
```

- [ ] **Step 2: Add `#dealer-bubble` as the first child of `#dealer-area`**

Replace the `#dealer-area` block with:
```html
<div id="dealer-area">
  <div id="dealer-bubble"></div>
  <div id="dealer-avatar">
    <img src="assets/dealer-avatar.png" width="80" height="80" alt="Dealer">
  </div>
  <div id="dealer-hand-wrap"></div>
  <div id="timer-ring-container"></div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add game.html
git commit -m "feat: add dealer-bubble element to dealer area"
```

---

### Task 2: Add speech bubble CSS to table.css

**Files:**
- Modify: `css/table.css` (append after line 144)

- [ ] **Step 1: Append the following to the end of `css/table.css`**

```css
#dealer-bubble {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%) translateY(-115%);
  width: 220px;
  background: rgba(20, 12, 4, 0.95);
  border: 1px solid var(--clr-gold);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--clr-text);
  font-family: var(--font-ui);
  text-align: center;
  z-index: 10;
  opacity: 0;
  pointer-events: none;
  white-space: normal;
  line-height: 1.4;
}

#dealer-bubble::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid var(--clr-gold);
}

#dealer-bubble.active {
  animation: bubble-in-out 4.3s ease forwards;
}

@keyframes bubble-in-out {
  0%   { opacity: 0; }
  7%   { opacity: 1; }
  80%  { opacity: 1; }
  100% { opacity: 0; }
}
```

- [ ] **Step 2: Commit**

```bash
git add css/table.css
git commit -m "feat: dealer speech bubble styles and fade animation"
```

---

### Task 3: Create `js/catchphrases.js`

**Files:**
- Create: `js/catchphrases.js`

- [ ] **Step 1: Create the file with line pools and trigger function**

```js
const LINES = {
  dealer_blackjack: [
    "Blackjack. I'd say sorry, but I'm not.",
    "House wins. It always does. Read the sign.",
    "Natural 21. Don't take it personally — actually, do.",
    "Ooh, that had to hurt. Pay up.",
    "Statistically, your luck turns around eventually.",
  ],
  dealer_bust: [
    "22. My therapist will hear about this.",
    "I busted. Don't make it weird.",
    "The house loses. Enjoy it. It won't last.",
    "I walked right into that one.",
    "Dealer busts. I need a moment.",
  ],
  player_blackjack: [
    "Another 21? You're killing me here.",
    "Beautiful. I hate it.",
    "Of course you did.",
    "21. My condolences to my bankroll.",
    "Blackjack! ...great.",
  ],
  bust: [
    "Greed is a cruel mistress.",
    "The spirit was willing but the math was not.",
    "Bold strategy. Costly, but bold.",
    "Should've stopped two cards ago.",
    "Bust. I won't say I saw it coming. I saw it coming.",
  ],
  win: [
    "You win. For now.",
    "Fine. Take it.",
    "The casino wins the war. You won a battle.",
    "Enjoy it. The odds remember everything.",
    "Beginner's luck. Or just luck. Hard to tell.",
  ],
  lose: [
    "That's mine now. Thank you for your contribution.",
    "Sorry. Actually, not that sorry.",
    "Rough. But predictable.",
    "The house wins. Shocking, I know.",
    "Better luck next hand. There's always a next hand.",
  ],
  push: [
    "Nobody wins. Nobody loses. Nobody has fun.",
    "A tie. How anticlimactic.",
    "We'll call it a draw. A coward's outcome.",
    "Push. The world's most unsatisfying result.",
    "We both walked away from that one.",
  ],
  surrender: [
    "Half your bet, all your dignity.",
    "Surrender accepted. Cowardice respected.",
    "The bravest thing you can do is run.",
    "Smart call. I was going to wreck you.",
    "Lived to fight another hand.",
  ],
};

let bubbleTimeout = null;

export function triggerCatchphrase(event) {
  const lines = LINES[event];
  if (!lines) return;
  const bubble = document.getElementById('dealer-bubble');
  if (!bubble) return;

  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
    bubbleTimeout = null;
  }
  bubble.classList.remove('active');
  void bubble.offsetWidth; // force reflow to restart animation

  bubble.textContent = lines[Math.floor(Math.random() * lines.length)];
  bubble.classList.add('active');

  bubbleTimeout = setTimeout(() => {
    bubble.classList.remove('active');
    bubble.textContent = '';
    bubbleTimeout = null;
  }, 4300);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/catchphrases.js
git commit -m "feat: catchphrases module with line pools and bubble trigger"
```

---

### Task 4: Wire up trigger in game.js

**Files:**
- Modify: `js/game.js:1-8` (imports)
- Modify: `js/game.js:51-82` (handleRoomUpdate)

- [ ] **Step 1: Add import at the top of game.js**

Current imports (lines 1–7):
```js
import { initRoom, joinRoom, onRoomChange, writePlayerAction, uid, roomCode, isHost,
         setPhase, setCurrentTurn, dealCards, updatePlayer, updateAllBalances, updateRoomField, getRoom } from './room.js';
import { renderTableState, renderChipSelector, createTimerRing, updateTimerRing } from './ui.js';
import { startTimer, stopTimer } from './timer.js';
import { createDeck, shuffle, cardToStr, cardFromStr, handValue, isBlackjack, isBust,
         canHit, canStand, canDouble, canSplit, canSurrender, dealerShouldHit, resolveHand,
         hiLoValue } from './engine.js';
```

Add one line after the engine.js import:
```js
import { triggerCatchphrase } from './catchphrases.js';
```

- [ ] **Step 2: Add phase-tracking variable after the existing `let` declarations (after line 20)**

Current declarations:
```js
let currentRoom = null;
let localDeck = [];
let runningCount = 0;
let lastBettingRenderKey = null;
let advancingFromBetting = false;
```

Add:
```js
let currentRoom = null;
let localDeck = [];
let runningCount = 0;
let lastBettingRenderKey = null;
let advancingFromBetting = false;
let lastCatchphrasePhase = null;
```

- [ ] **Step 3: Add `determineCatchphraseEvent` function after the `handleRoomUpdate` function (after line 82)**

```js
function determineCatchphraseEvent(room) {
  const me = (room.players || {})[uid];
  if (!me || !['playing', 'done', 'bust', 'surrendered'].includes(me.status)) return null;

  const dealer = room.dealer || {};
  const dealerCardStrs = [...(dealer.hand || [])];
  if (dealer.hiddenCard) dealerCardStrs.push(dealer.hiddenCard);
  const dealerCards = dealerCardStrs.map(cardFromStr);

  if (isBlackjack(dealerCards)) return 'dealer_blackjack';
  if (isBust(dealerCards)) return 'dealer_bust';

  const playerHands = (me.hands || [[]]).map(h => h.map(cardFromStr));
  if (playerHands.some(h => isBlackjack(h))) return 'player_blackjack';
  if (me.status === 'bust') return 'bust';
  if (me.status === 'surrendered') return 'surrender';

  const firstHand = playerHands[0] || [];
  const firstBet = (me.bets || [])[0] || me.bet || 0;
  const ph = { cards: firstHand, status: 'active', bet: firstBet };
  const { result } = resolveHand(ph, dealerCards, room.settings);
  if (result === 'win') return 'win';
  if (result === 'push') return 'push';
  return 'lose';
}
```

- [ ] **Step 4: Add resolution detection into `handleRoomUpdate`**

Current `handleRoomUpdate` (lines 51–82):
```js
function handleRoomUpdate(room) {
  if (!room) return;

  if (room.phase !== 'betting') lastBettingRenderKey = null;

  if (room.phase === 'betting') {
    renderBettingUI(room);
    ...
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
```

Add the resolution block at the end of `handleRoomUpdate`, just before the closing `}`:

```js
  if (room.phase === 'resolution' && lastCatchphrasePhase !== 'resolution') {
    lastCatchphrasePhase = 'resolution';
    setTimeout(() => {
      const r = currentRoom;
      if (!r || r.phase !== 'resolution') return;
      const event = determineCatchphraseEvent(r);
      if (event) triggerCatchphrase(event);
    }, 1500);
  }
  if (room.phase !== 'resolution') {
    lastCatchphrasePhase = room.phase;
  }
```

- [ ] **Step 5: Commit**

```bash
git add js/game.js
git commit -m "feat: wire dealer catchphrase trigger on resolution phase"
```

---

### Task 5: Push and verify

- [ ] **Step 1: Push to origin**

```bash
git push
```

- [ ] **Step 2: Manual verification checklist**

Open the live site and play a hand. Verify:
- [ ] Speech bubble appears above the dealer avatar ~1.5s after cards are revealed
- [ ] Bubble fades in, holds ~3.5s, fades out
- [ ] Line is appropriate to the outcome (bust → bust pool, win → win pool, etc.)
- [ ] A second hand shows a new (possibly different) line
- [ ] Bubble does not appear during betting or playing phases
- [ ] Bubble doesn't block the dealer cards or avatar

---

## Self-Review Notes

- **Spec coverage:** All 8 event types covered in pools ✓. Priority order implemented in `determineCatchphraseEvent` ✓. One bubble per hand via `lastCatchphrasePhase` guard ✓. Bubble lifecycle (fade in/hold/fade out + clear) ✓. Spectator guard (`me.status` check) ✓.
- **No placeholders:** All code is complete. ✓
- **Type consistency:** `triggerCatchphrase(event)` called with string event key matching `LINES` object keys. `determineCatchphraseEvent` returns those same keys or `null`. ✓
- **1.5s delay rationale:** `playDealerHand` calls `setPhase('resolution')` then immediately starts dealing dealer cards and calls `setDealer()`. The Firebase writes are sequential but near-instant. 1.5s is sufficient headroom for all clients to see the updated dealer hand before evaluating the event.
