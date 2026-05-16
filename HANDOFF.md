# Blackjack Multiplayer — Handoff Summary (Session 4)

## Project

**Location:** C:\Users\Faber\Projects\Blackjack
**Live URL:** https://eloheavenjoe-cyber.github.io/blackjack/
**Repo:** https://github.com/eloheavenjoe-cyber/blackjack (master, auto-deploys via GitHub Pages)
**Firebase:** Realtime Database, Anonymous Auth
**Deploy:** git push to master — no build step. Firebase rules deploy separately: `npx firebase-tools deploy --only database`

---

## What Was Fixed This Session

### Session 3 Bugs (fixed at session start)

| Bug | Fix |
|---|---|
| Balance not deducting on losses | `playDealerHand` now subtracts `totalBet` before adding payouts (game.js ~285) |
| Dealer card count not showing during playing phase | `renderDealerAreaEl` in ui.js now appends a `.hand-value` badge for `playing`/`dealing` phase |
| Insurance option in lobby (non-functional) | Removed `insurance` row from `renderSettingsForm` in lobby.js — field still exists in Firebase/settings.js for later |

### New Features Implemented This Session

**Deck Count Display** — always visible, top-right: `Shoe: X.X decks`
**True Count Display** — host-toggled, left side: `RC: +N` / `TC: +N.N` (Hi-Lo system)
**Host Admin Panel** — `#host-controls` is now visible to the host across ALL phases, not just betting

**Architecture:**
- `hiLoValue(card)` added to `engine.js` — returns +1 (2–6), 0 (7–9), -1 (10/J/Q/K/A)
- `runningCount` module-level var in `game.js` (host-only), reset to 0 on deck reshuffle
- Host writes `cardsRemaining`, `runningCount`, `showCount` to Firebase after each card-consuming action (deal, hit, double, split, dealer reveal)
- True count computed client-side: `runningCount / (cardsRemaining / 52)`
- All clients read from `room` state in `renderTableState`
- `#shoe-display` (top-right) and `#count-display` (left, two child divs: `#rc-value`, `#tc-value`) added to game.html
- CSS in hud.css: fixed position, `--clr-text-dim`, `pointer-events: none`

### Critical Bug Found and Fixed (post-deploy)

**Firebase rules were missing entries for the 3 new fields.** All host writes to `cardsRemaining`, `runningCount`, and `showCount` hit the parent `.write: false` and were rejected with `PERMISSION_DENIED`. This caused:
- **Game stuck after betting**: `handleDealingPhase` threw before `setPhase('playing')` was reached
- **Count toggle blink**: Firebase optimistic update showed briefly, then reverted; non-hosts never saw it

**Fix:** Added 3 rules to `firebase-rules.json` (same pattern as other host-only fields) and deployed via `npx firebase-tools deploy --only database`.

**IMPORTANT PATTERN:** Any new room-level field the host writes needs an explicit `.write` rule in `firebase-rules.json` AND a deploy. Player-level fields are covered by the existing `players/$playerId` rule and don't need new entries.

---

## Current State

Works reliably (tested with multiple players, many hands):
- Lobby, room creation/join, settings panel
- All game phases: betting → dealing → playing → resolution → betting
- Hit, stand, double, split, surrender
- Balance updates correctly on win/loss/push/blackjack
- Chip selector, action buttons, timer ring, auto-advance from betting
- Host Force Start
- Dealer card count shown during playing phase
- Shoe count updates after every action (deal, hit, double, split, dealer draw)
- True count display toggled by host, visible to all players when enabled
- Running count resets on reshuffle

Diagnostic console.log statements still in game.js lines ~23, 25, 28 — remove before shipping.

---

## Known Bugs (Fix These)

### 1. Starting Balance Slider May Not Apply (MEDIUM)

**Reported:** User set starting balance slider to 10,000 — balance stayed at 1,000. Max bet behavior also uncertain.

**Root cause candidates:**
- `validateSettings` in `settings.js` caps `maxBet > 1000` → error. If the user tried to set maxBet above 1000 simultaneously, the error blocks Start silently (the alert might have been missed). When they retry without changing maxBet, balance still shows 1000 if `currentSettings` was never re-populated.
- The range slider `'input'` event in `renderSettingsForm` (lobby.js) may not fire on all browsers if the slider thumb is dragged past max — worth testing with keyboard too.
- `startingBalance: 10000` should pass validation (`> 10000` is false at exactly 10000). If it still doesn't apply, check whether `createRoom` is receiving the updated `currentSettings` vs the stale DEFAULT copy.

**Where to look:**
- `js/lobby.js` `renderSettingsForm` — the `inp.addEventListener('input', ...)` that updates `currentSettings[row.key]`
- `js/settings.js` `validateSettings` — current hard caps: minBet ≤ 500, maxBet ≤ 1000, startingBalance ≤ 10000

---

## New Features Requested

### 2. Expand Bet and Balance Ranges (LOW — do this first, it's small)

**Request:** Starting balance range 100–25,000, max bet range 1–5,000.

**Files to change:**

**`js/settings.js`** — update `validateSettings` caps:
```js
if (s.minBet < 1 || s.minBet > 5000) errors.push('Min bet out of range');
if (s.maxBet < s.minBet || s.maxBet > 5000) errors.push('Max bet out of range');
if (s.startingBalance < 100 || s.startingBalance > 25000) errors.push('Starting balance out of range');
```

**`js/lobby.js`** — update rows in `renderSettingsForm`:
```js
{ key: 'minBet', label: 'Min Bet', type: 'range', min: 1, max: 5000 },
{ key: 'maxBet', label: 'Max Bet', type: 'range', min: 1, max: 5000 },
{ key: 'startingBalance', label: 'Starting Balance', type: 'range', min: 100, max: 25000, step: 100 },
```

`DEFAULT_SETTINGS` (`minBet: 5, maxBet: 500, startingBalance: 1000`) can stay — the defaults are reasonable.

After expanding ranges, also re-test the balance slider to confirm whether it was a range cap issue or a slider event issue.

### 3. Implement Insurance (MEDIUM-HIGH — separate session after range fix)

Insurance was disabled in Session 3 (the phase transition existed but had no handler, freezing the game permanently). Needs full implementation.

**Phase flow:** `dealing → insurance → playing` (when dealer upcard is Ace AND `room.settings.insurance === true`)

**How insurance works:**
- Triggers when dealer upcard is Ace and `room.settings.insurance === true`
- Each active player offered a side bet of up to half their main bet
- If dealer has blackjack: insurance pays 2:1 (player receives 3× their insurance bet). Main bet resolves normally (push if player also has BJ, loss otherwise).
- If dealer does not have blackjack: insurance bets are lost, game continues to playing phase
- Timer applies (same `actionTimer` setting)

**Implementation steps:**

1. Re-add insurance check in `handleDealingPhase` (game.js) after `dealCards` returns:
```js
const dealerUp = cardFromStr(result.dealerHand[0]);
if (room.settings.insurance && dealerUp.rank === 'A') {
  await setPhase('insurance');
  const deadline = Date.now() + (room.settings.actionTimer || 30) * 1000;
  await updateRoomField('turnDeadline', deadline);
  return;
}
await setPhase('playing');
```

2. Add `'insurance'` handler in `handleRoomUpdate` (game.js):
```js
if (room.phase === 'insurance') {
  renderInsuranceUI(room);
  if (isHost) watchInsuranceDecisions(room);
}
```

3. `watchInsuranceDecisions`: when all active players have `insurance !== null` OR timer expires → host resolves and calls `setPhase('playing')` then `advanceTurn`

4. Player writes `{ insurance: amount }` via `writePlayerAction` (0 = decline, positive value = bet amount)

5. Insurance resolution at END of `playDealerHand`: after dealer hand revealed, check for dealer blackjack. If BJ: pay insurance (player receives 3× insurance amount). If no BJ: forfeit insurance. Do this before the main hand `resolveHand` loop.

6. Add insurance row back to `renderSettingsForm` in lobby.js once implemented. `DEFAULT_SETTINGS` already has `insurance: false` — change to `true` after implementation.

7. `canInsure(dealerUpCard, settings)` already exists in engine.js line 113.

8. Add `insurance` to Firebase rules if any new room-level fields are written (player insurance decisions are covered by the existing `players/$playerId` rule).

---

## Architecture Notes

- **State model:** Room state in Firebase RTDB at `rooms/${roomCode}`. All clients react to `onRoomChange`. Host is sole authority for `phase`, `dealer`, `currentTurn`, `turnDeadline`, `cardsRemaining`, `runningCount`, `showCount`.
- **Phase flow:** `waiting → betting → dealing → [insurance →] playing → resolution → betting → ...`
- **Render pattern:** `renderTableState` (called every `onRoomChange`) uses render keys (`lastBettingRenderKey`, `lastDealerRenderKey`) to skip unnecessary DOM rebuilds. Keep this pattern for new UI sections.
- **localDeck:** Module-level in game.js, host only. Reshuffles when < 20 cards remain. If host refreshes mid-game, deck is lost — known limitation.
- **runningCount:** Module-level in game.js, host only. Reset on reshuffle. Written to Firebase after every card action.
- **timer.js:** `startTimer` always calls `stopTimer` first — only one timer active at a time.
- **Firebase rules:** New room-level host-write fields need explicit `.write` rule in `firebase-rules.json` AND `npx firebase-tools deploy --only database`. Player fields covered by `players/$playerId` rule.

## Key Files

| File | Purpose |
|---|---|
| `js/room.js` | Firebase reads/writes — uid, roomCode, isHost, initRoom, createRoom, joinRoom, onRoomChange, writePlayerAction, setPhase, setCurrentTurn, dealCards, updatePlayer, updateAllBalances, updateRoomField, setDealer |
| `js/game.js` | Game page controller. Module-level: `localDeck`, `runningCount`, `currentRoom`. |
| `js/ui.js` | DOM rendering — renderTableState, renderHandEl, renderChipSelector, updatePhaseUI, renderDealerAreaEl |
| `js/engine.js` | Pure game logic, no Firebase. Exports: handValue, resolveHand, hiLoValue, canInsure, etc. |
| `js/lobby.js` | Lobby page controller, settings form |
| `js/timer.js` | startTimer/stopTimer |
| `js/settings.js` | DEFAULT_SETTINGS and validateSettings |
| `css/hud.css` | HUD, action buttons, chip selector, host controls, shoe/count displays (fixed position, z-index 10–11) |
| `firebase-rules.json` | Firebase RTDB security rules — must deploy separately after any changes |
