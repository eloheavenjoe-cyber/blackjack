# Sound Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side sound effects (card deal, chip click, dealer reveal, win/lose/bust outcomes) with a mute toggle persisted to localStorage.

**Architecture:** A singleton `js/sound.js` module preloads all `.wav` files at init and exposes `play(key)` / `toggleMute()` / `isMuted()`. Each client fires its own sounds locally based on Firebase state changes — no host-only audio paths. Missing files are silently skipped. Outcome sounds reuse the existing `determineCatchphraseEvent` logic via a sound key map.

**Tech Stack:** Vanilla JS ES modules, Web Audio (`new Audio()`), localStorage, no external dependencies.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `js/sound.js` | **Create** | AudioManager singleton — preload, play, mute |
| `game.html` | **Modify** | Add mute button element to HUD |
| `css/hud.css` | **Modify** | Style `.mute-btn` |
| `js/game.js` | **Modify** | Import sound; fire chip_click, card_deal, outcome sounds; init mute button |
| `js/ui.js` | **Modify** | Import sound; fire dealer_reveal in renderDealerAreaEl |

---

## Task 1: Create `js/sound.js`

**Files:**
- Create: `js/sound.js`

- [ ] **Step 1: Create the file with this exact content**

```js
const SOUNDS = {
  card_deal:     'assets/sounds/card_deal.wav',
  dealer_reveal: 'assets/sounds/dealer_reveal.wav',
  chip_click:    'assets/sounds/chip_click.wav',
  win:           'assets/sounds/win.wav',
  blackjack:     'assets/sounds/blackjack.wav',
  lose:          'assets/sounds/lose.wav',
  bust:          'assets/sounds/bust.wav',
};

const nodes = {};
let muted = false;

export function init() {
  muted = localStorage.getItem('bj_muted') === 'true';
  for (const [key, src] of Object.entries(SOUNDS)) {
    const audio = new Audio(src);
    audio.addEventListener('error', () => { delete nodes[key]; });
    audio.load();
    nodes[key] = audio;
  }
}

export function play(key) {
  if (muted || !nodes[key]) return;
  const clone = nodes[key].cloneNode();
  clone.play().catch(() => {});
}

export function toggleMute() {
  muted = !muted;
  localStorage.setItem('bj_muted', String(muted));
  return muted;
}

export function isMuted() {
  return muted;
}
```

- [ ] **Step 2: Verify the file was created**

Open `js/sound.js` and confirm it exists with the four exported functions: `init`, `play`, `toggleMute`, `isMuted`.

- [ ] **Step 3: Commit**

```bash
git add js/sound.js
git commit -m "feat: add sound manager module"
```

---

## Task 2: Add mute button to `game.html` and `css/hud.css`

**Files:**
- Modify: `game.html:40-53`
- Modify: `css/hud.css`

- [ ] **Step 1: Add the mute button to `game.html`**

Locate the `#hud` div (around line 40). It currently ends with the donate button item. Add a mute button item **before** the closing `</div>` of `#hud`:

```html
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
      <div class="hud-item">
        <button id="btn-mute" class="mute-btn" title="Toggle sound">🔊</button>
      </div>
    </div>
```

- [ ] **Step 2: Add `.mute-btn` style to `css/hud.css`**

Append to the end of `css/hud.css`:

```css
.mute-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
  color: var(--clr-text-dim);
  transition: color 0.15s;
}
.mute-btn:hover { color: var(--clr-gold); }
```

- [ ] **Step 3: Manually verify**

Open `game.html` in a browser (join a room). Confirm the 🔊 button appears in the bottom HUD bar to the right of the Send Chips button. Confirm it has a hover effect.

- [ ] **Step 4: Commit**

```bash
git add game.html css/hud.css
git commit -m "feat: add mute button to HUD"
```

---

## Task 3: Wire sound triggers in `js/game.js`

**Files:**
- Modify: `js/game.js`

This task has five independent changes within the file. Make them all before committing.

- [ ] **Step 1: Add the import at the top of `js/game.js`**

Add this line directly after the existing imports (after the `triggerCatchphrase` import line):

```js
import * as sound from './sound.js';
```

- [ ] **Step 2: Add `resolveOutcomeSound` helper function**

Add this function anywhere before `handleRoomUpdate` in `game.js`. It maps a catchphrase event string to a sound key:

```js
function resolveOutcomeSound(room) {
  const event = determineCatchphraseEvent(room);
  const map = {
    player_blackjack: 'blackjack',
    win:              'win',
    dealer_bust:      'win',
    lose:             'lose',
    dealer_blackjack: 'lose',
    bust:             'bust',
  };
  return map[event] ?? null;
}
```

- [ ] **Step 3: Init sound and wire the mute button in `init()`**

Inside the `async function init()`, after `await joinRoom(...)` and before `onRoomChange(...)`, add:

```js
  sound.init();
  const muteBtn = document.getElementById('btn-mute');
  if (muteBtn) {
    muteBtn.textContent = sound.isMuted() ? '🔇' : '🔊';
    muteBtn.addEventListener('click', () => {
      muteBtn.textContent = sound.toggleMute() ? '🔇' : '🔊';
    });
  }
```

- [ ] **Step 4: Fire `chip_click` on chip and confirm-bet clicks**

In `renderBettingUI`, locate the `renderChipSelector` call. Its last argument is the `onChipClick` callback. Add `sound.play('chip_click');` as the first line inside that callback:

```js
        const selector = renderChipSelector(settings.minBet, settings.maxBet, me.bet || 0, me.balance, async denom => {
          sound.play('chip_click');
          const newBet = Math.min((me.bet || 0) + denom, settings.maxBet);
          await writePlayerAction({ bet: newBet });
        });
```

Also add it to the confirm-bet button click handler (first line, before the `bet` const):

```js
        confirmBtn.addEventListener('click', async () => {
          sound.play('chip_click');
          const bet = (currentRoom?.players?.[uid]?.bet || 0);
          if (bet < settings.minBet) { alert(`Minimum bet is $${settings.minBet}`); return; }
          await writePlayerAction({ status: 'ready' });
          wrap.hidden = true;
        });
```

- [ ] **Step 5: Fire `card_deal` sounds in `handleDealingPhase`**

In `handleDealingPhase`, after `const result = await dealCards(localDeck, activePids, playerBets);`, add staggered deal sounds (one per active player):

```js
    activePids.forEach((_, i) => setTimeout(() => sound.play('card_deal'), i * 150));
```

The full block around the insertion point:

```js
    const result = await dealCards(localDeck, activePids, playerBets);
    activePids.forEach((_, i) => setTimeout(() => sound.play('card_deal'), i * 150));
    localDeck = result.remaining;
```

- [ ] **Step 6: Add module-level `lastSoundPhase` variable and fire outcome sounds**

Add this variable at the top of `game.js` alongside the other module-level vars (near `lastCatchphrasePhase`):

```js
let lastSoundPhase = null;
```

In `handleRoomUpdate`, locate the existing `resolution` block that uses `lastCatchphrasePhase`. Directly **after** that block (but still inside `handleRoomUpdate`), add the outcome sound block:

```js
  if (room.phase === 'resolution' && lastSoundPhase !== 'resolution') {
    lastSoundPhase = 'resolution';
    setTimeout(() => {
      const r = currentRoom;
      if (!r || r.phase !== 'resolution') return;
      const key = resolveOutcomeSound(r);
      if (key) sound.play(key);
    }, 1200);
  }
  if (room.phase !== 'resolution') lastSoundPhase = room.phase;
```

The 1200ms delay matches how Firebase propagates dealer card updates after `setPhase('resolution')` — by the time the callback fires, `currentRoom` has the complete dealer hand.

- [ ] **Step 7: Manually verify**

Open the game in a browser with two players. Confirm:
- Chip clicks make a clink sound
- Confirm Bet makes a clink sound
- Cards being dealt produce N staggered deal sounds (N = number of players)
- Win/lose/bust plays the correct outcome sound at resolution
- Blackjack plays the blackjack sound

- [ ] **Step 8: Commit**

```bash
git add js/game.js
git commit -m "feat: wire sound triggers in game.js"
```

---

## Task 4: Wire dealer reveal sound in `js/ui.js`

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Add the import at the top of `js/ui.js`**

Add after the existing import line at the top:

```js
import * as sound from './sound.js';
```

- [ ] **Step 2: Fire `dealer_reveal` in `renderDealerAreaEl`**

Locate the `else if` branch that handles `phase === 'resolution' && dealer.hiddenCard`. Add `sound.play('dealer_reveal');` after the card is appended:

```js
  } else if (phase === 'resolution' && dealer.hiddenCard) {
    const revealed = renderCard(cardFromStr(dealer.hiddenCard));
    revealed.classList.add('flipping');
    handDiv.appendChild(revealed);
    sound.play('dealer_reveal');
  }
```

The existing `lastDealerRenderKey` dedup guard already ensures this branch runs exactly once per unique dealer state, so the sound fires only once at reveal.

- [ ] **Step 3: Manually verify**

Play a round. Confirm a flip/reveal sound plays the moment the dealer's hole card is revealed at resolution.

- [ ] **Step 4: Commit**

```bash
git add js/ui.js
git commit -m "feat: wire dealer reveal sound in ui.js"
```

---

## Task 5: End-to-end verification and mute persistence check

- [ ] **Step 1: Full round test**

Play a complete round with at least two players and verify the full sound sequence:
1. Chip clicks → `chip_click` ✓
2. Confirm bet → `chip_click` ✓
3. Deal → N staggered `card_deal` sounds ✓
4. Dealer hole card flip → `dealer_reveal` ✓
5. Resolution → correct outcome sound (`win`, `blackjack`, `lose`, or `bust`) ✓

- [ ] **Step 2: Mute persistence test**

1. Click 🔊 → icon becomes 🔇, sounds stop
2. Reload the page → icon should still show 🔇 (loaded from localStorage)
3. Click 🔇 → icon becomes 🔊, sounds resume

- [ ] **Step 3: Missing file test**

Temporarily rename `lose.wav` to `lose.wav.bak` (or leave it absent). Play a losing round. Confirm no JS error and no sound plays (silent no-op). Restore the file after.

- [ ] **Step 4: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: sound effects post-verification corrections"
```

Only create this commit if step 1-3 revealed issues that needed fixing.
