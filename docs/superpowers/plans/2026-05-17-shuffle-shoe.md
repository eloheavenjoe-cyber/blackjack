# Shuffle Shoe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Shuffle Shoe" vote button visible to all players during betting, plus a host-only "New Shoe" force button, both triggering a full deck rebuild with RC/TC reset.

**Architecture:** Vote state lives on each player's node (`shuffleVote: boolean`) — no new Firebase rules needed. The host tallies votes on every room update via `handleRoomUpdate` and fires `executeShuffleShoe` when a majority is reached. Force shuffle calls the same function directly. A `shufflingShoe` guard prevents double-fire.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database, no build step.

---

### Task 1: Add `#shuffle-vote-wrap` to game.html

**Files:**
- Modify: `game.html`

- [ ] **Step 1: Add the div near `#shoe-display`**

In `game.html`, find this line:
```html
    <div id="shoe-display"></div>
```
Add the new div immediately after it:
```html
    <div id="shoe-display"></div>
    <div id="shuffle-vote-wrap" hidden></div>
```

- [ ] **Step 2: Verify in browser DevTools**

Open `game.html` in the browser. In the Elements panel confirm `#shuffle-vote-wrap` exists in the DOM and has the `hidden` attribute.

- [ ] **Step 3: Commit**

```bash
git add game.html
git commit -m "feat: add shuffle-vote-wrap div to game.html"
```

---

### Task 2: Add CSS for vote button wrapper and `.voted` state

**Files:**
- Modify: `css/hud.css`

- [ ] **Step 1: Append styles to hud.css**

At the end of `css/hud.css`, add:

```css
#shuffle-vote-wrap {
  position: fixed;
  top: 44px;
  right: 20px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.action-btn.voted {
  background: var(--clr-gold);
  color: #1a1008;
}
.action-btn.voted:hover {
  background: rgba(201, 168, 76, 0.7);
  color: #1a1008;
}
```

The wrapper sits just below `#shoe-display` (which is `top: 16px; right: 20px`). `.voted` inverts the gold button to filled — same token as the existing hover state, so it's visually consistent.

- [ ] **Step 2: Quick visual check**

In DevTools, temporarily remove `hidden` from `#shuffle-vote-wrap` and inject `<button class="action-btn">Shuffle Shoe 0/4</button>` inside it. Confirm it appears below the shoe counter in the top-right. Then add a second button with class `action-btn voted` and confirm it renders as gold-filled. Reload to restore state.

- [ ] **Step 3: Commit**

```bash
git add css/hud.css
git commit -m "feat: add shuffle vote button CSS"
```

---

### Task 3: Add `executeShuffleShoe` and `shufflingShoe` guard to game.js

**Files:**
- Modify: `js/game.js`

- [ ] **Step 1: Add module-level guard**

In `game.js`, find the block of module-level flags near the top (around line 24–26):
```js
let lastBettingRenderKey = null;
let advancingFromBetting = false;
```
Add the new guard on the next line:
```js
let shufflingShoe = false;
```

- [ ] **Step 2: Add `executeShuffleShoe` after `advanceFromBetting`**

Find the end of `advanceFromBetting` (around line 246):
```js
async function advanceFromBetting(room) {
  const players = room.players || {};
  for (const [pid, p] of Object.entries(players)) {
    if (p.status !== 'ready' && p.status !== 'sitting-out') {
      await updatePlayer(pid, { status: 'sitting-out' });
    }
  }
  await setPhase('dealing');
}
```
Insert the new function immediately after it:
```js
async function executeShuffleShoe(room) {
  if (shufflingShoe) return;
  shufflingShoe = true;
  try {
    localDeck = shuffle(createDeck(room.settings.decks)).map(cardToStr);
    runningCount = 0;
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', 0),
    ]);
    const players = room.players || {};
    await Promise.all(
      Object.keys(players).map(pid => updatePlayer(pid, { shuffleVote: false }))
    );
  } finally {
    shufflingShoe = false;
  }
}
```

- [ ] **Step 3: Verify no JS errors**

Open the game in a browser. Check the DevTools console — no errors on load. The function is not yet called, so no behavioral change yet.

- [ ] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "feat: add executeShuffleShoe with shufflingShoe guard"
```

---

### Task 4: Reset `shuffleVote` between rounds in `playDealerHand`

**Files:**
- Modify: `js/game.js`

- [ ] **Step 1: Add `shuffleVote: false` to the player reset**

In `playDealerHand`, find the existing player-reset call inside the `setTimeout` (around line 467):
```js
      await updatePlayer(pid, { hands: [], bets: [], handIndex: 0, bet: 0, status: 'waiting', action: null, insurance: false });
```
Change it to:
```js
      await updatePlayer(pid, { hands: [], bets: [], handIndex: 0, bet: 0, status: 'waiting', action: null, insurance: false, shuffleVote: false });
```

- [ ] **Step 2: Verify via Firebase console**

Play through one full hand to resolution. After the 5-second delay when players reset to `waiting`, open the Firebase Realtime Database console and confirm each player node has `shuffleVote: false`.

- [ ] **Step 3: Commit**

```bash
git add js/game.js
git commit -m "feat: reset shuffleVote per player on round reset in playDealerHand"
```

---

### Task 5: Add vote tally detection in `handleRoomUpdate`

**Files:**
- Modify: `js/game.js`

- [ ] **Step 1: Add vote check inside the betting block**

In `handleRoomUpdate`, find the end of the auto-advance block inside `if (room.phase === 'betting')`:
```js
    if (isHost && !advancingFromBetting) {
      const active = Object.values(room.players || {}).filter(p => p.status !== 'sitting-out' && p.connected !== false);
      if (active.length > 0 && active.every(p => p.status === 'ready')) {
        advancingFromBetting = true;
        advanceFromBetting(room).finally(() => { advancingFromBetting = false; });
      } else if (room.turnDeadline && room.turnDeadline - Date.now() <= 0) {
        advancingFromBetting = true;
        advanceFromBetting(room).finally(() => { advancingFromBetting = false; });
      }
    }
```
Immediately after this block (still inside `if (room.phase === 'betting')`), add:
```js
    if (isHost && !shufflingShoe) {
      const eligible = Object.values(room.players || {}).filter(
        p => p.connected !== false && p.status !== 'sitting-out'
      );
      const N = eligible.length;
      const yesCount = eligible.filter(p => p.shuffleVote === true).length;
      const threshold = Math.floor(N / 2) + 1;
      if (N > 0 && yesCount >= threshold) {
        executeShuffleShoe(room);
      }
    }
```

- [ ] **Step 2: Verify**

Open the game as two players (host in one tab, guest in another) during the betting phase. Write `shuffleVote: true` directly onto both player nodes in the Firebase console. The shoe counter should jump to the full deck count (e.g. 312 for 6 decks) and RC should reset to 0.

- [ ] **Step 3: Commit**

```bash
git add js/game.js
git commit -m "feat: add host-side vote majority tally for shuffle shoe"
```

---

### Task 6: Add "New Shoe" force button to host controls

**Files:**
- Modify: `js/game.js`

- [ ] **Step 1: Add button inside `renderBettingUI`**

In `renderBettingUI`, find the existing Force Start button append inside `if (isHost)`:
```js
      if (!hostCtrl.querySelector('.action-btn')) {
        const forceBtn = document.createElement('button');
        forceBtn.className = 'action-btn';
        forceBtn.textContent = 'Force Start';
        forceBtn.addEventListener('click', () => advanceFromBetting(currentRoom));
        hostCtrl.appendChild(forceBtn);
      }
      hostCtrl.hidden = false;
```
After the `if (!hostCtrl.querySelector('.action-btn'))` block (but before `hostCtrl.hidden = false`), add:
```js
      if (!hostCtrl.querySelector('#btn-new-shoe')) {
        const newShoeBtn = document.createElement('button');
        newShoeBtn.id = 'btn-new-shoe';
        newShoeBtn.className = 'action-btn';
        newShoeBtn.style.marginTop = '8px';
        newShoeBtn.textContent = 'New Shoe';
        newShoeBtn.addEventListener('click', () => executeShuffleShoe(currentRoom));
        hostCtrl.appendChild(newShoeBtn);
      }
```

- [ ] **Step 2: Verify**

Open the game as host. During the betting phase, confirm "New Shoe" appears in the host controls panel below "Force Start". Click it — shoe counter should reset to full deck, RC/TC to 0. Confirm the button does not duplicate on subsequent `onRoomChange` fires.

- [ ] **Step 3: Commit**

```bash
git add js/game.js
git commit -m "feat: add New Shoe force shuffle button for host in betting phase"
```

---

### Task 7: Add vote button render for all players

**Files:**
- Modify: `js/game.js`

- [ ] **Step 1: Add `renderShuffleVoteButton` function**

After the `executeShuffleShoe` function (inserted in Task 3), add:

```js
function renderShuffleVoteButton(room) {
  const wrap = document.getElementById('shuffle-vote-wrap');
  if (!wrap) return;

  if (room.phase !== 'betting') {
    wrap.hidden = true;
    return;
  }

  const me = (room.players || {})[uid];
  if (!me || me.status === 'sitting-out') {
    wrap.hidden = true;
    return;
  }

  const eligible = Object.values(room.players || {}).filter(
    p => p.connected !== false && p.status !== 'sitting-out'
  );
  const N = eligible.length;
  const yesCount = eligible.filter(p => p.shuffleVote === true).length;

  wrap.hidden = false;
  wrap.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'action-btn' + (me.shuffleVote ? ' voted' : '');
  btn.textContent = `Shuffle Shoe ${yesCount}/${N}`;
  btn.addEventListener('click', async () => {
    await writePlayerAction({ shuffleVote: !me.shuffleVote });
  });
  wrap.appendChild(btn);
}
```

- [ ] **Step 2: Call `renderShuffleVoteButton` at the top of `handleRoomUpdate`**

In `handleRoomUpdate`, immediately after `if (!room) return;` and before `if (room.phase !== 'betting') lastBettingRenderKey = null;`, add:

```js
  renderShuffleVoteButton(room);
```

The top of `handleRoomUpdate` should now look like:
```js
function handleRoomUpdate(room) {
  if (!room) return;

  renderShuffleVoteButton(room);

  if (room.phase !== 'betting') lastBettingRenderKey = null;

  if (room.phase === 'betting') {
    // ...
```

- [ ] **Step 3: Full end-to-end verify**

Open two browser tabs — host and guest — both in betting phase.

1. **Vote path:** Both see "Shuffle Shoe 0/2". Host clicks → button highlights gold, count shows "1/2". Guest clicks → count shows "2/2", shoe reshuffles automatically. Both buttons reset to "0/2" unhighlighted.
2. **Force path:** Host clicks "New Shoe" in host controls → shoe resets immediately, vote count stays "0/2".
3. **Phase visibility:** Advance to dealing/playing/resolution — vote button is hidden. Return to betting — vote button reappears.
4. **Cross-round reset:** One player votes (count "1/2"), don't reach majority, play a full hand. On the next betting phase, count is back to "0/2".

- [ ] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "feat: add Shuffle Shoe vote button for all players during betting"
```
