# Blackjack Multiplayer — Handoff Summary (Session 2)

## Project
- **Location:** `C:\Users\Faber\Projects\Blackjack`
- **Live URL:** `https://eloheavenjoe-cyber.github.io/blackjack/`
- **Firebase:** Realtime Database, Anonymous Auth, GitHub Pages hosting

---

## What Was Done This Session

### Bugs Fixed
| Bug | Fix | Files |
|-----|-----|-------|
| `chip-selector-wrap` and `host-controls` invisible | They had no CSS position — painted behind `#background-scene` (z-index 0). Added `position: fixed; bottom: 190px; z-index: 11` | `css/hud.css` |
| Force Start never showed even when `isHost=true` | It was inside the `if (!me) return` guard. Moved outside so it always renders for host during betting | `js/game.js` |
| Stale `turnDeadline` skipping betting on hand 2+ | `playDealerHand` reset players/phase but never cleared `turnDeadline`. Host would immediately call `advanceFromBetting` | `js/game.js` |
| Players never win/lose chips (payouts always $0) | `bets[]` array was never populated during dealing. `resolveHand` uses `bets[i]`, not `bet`. Fixed `dealCards` to accept `playerBets` map and write `bets: [playerBets[pid]]` | `js/room.js`, `js/game.js` |
| Chip selector re-opens after confirming bet | `onRoomChange` fires after `writePlayerAction({status:'ready'})` and `renderBettingUI` re-renders without checking `status==='ready'` | `js/game.js` |
| Action buttons re-appear after clicking Hit/Stand | `onRoomChange` fires before Firebase propagates the turn change, so `renderActionButtons` re-renders and un-hides the buttons | `js/game.js` |
| Hand value badge below cards instead of above | `renderHandEl` appended badge after `handDiv`. Swapped order | `js/ui.js` |
| `updatePhaseUI` hid chipWrap even during betting | Moved the `if (!me) return` guard below the betting visibility check | `js/ui.js` |

### Diagnostic Logs Added (still in code — remove when stable)
```
[BJ] init — uid: ... name: ... code: ...
[BJ] joinRoom done — uid: ... isHost: ...
[BJ] room update — phase: ... isHost: ... uid: ... hostId: ... myPlayer: ...
```
Remove these `console.log` calls from `js/game.js` lines 21, 23, 26 when bugs are resolved.

---

## Current State

### Works
- Lobby: create room, join with room code, see player list, change settings
- Navigation: Start button transitions to game.html for all players
- Table renders with player names and spots
- Chip selector visible and functional during betting
- Force Start visible for host during betting
- Cards are dealt to players
- Hand value badge shows above each hand
- Chips/payouts now calculate correctly (bets array fixed)
- Resolution phase runs and balances update
- Game resets to betting after 5-second delay

### Still Broken / Known Issues

#### 1. Button flickering / requires multiple clicks (HIGH PRIORITY)
**Root cause:** Every Firebase write (chip click, action click) triggers `onRoomChange`, which calls `renderBettingUI` or `renderActionButtons`, which does `innerHTML = ''` and rebuilds all buttons from scratch. The DOM teardown-and-rebuild races with the click handler. Clicking a $25 chip writes `bet: 25` to Firebase → `onRoomChange` → `wrap.innerHTML = ''` destroys the buttons → rebuilds them. A rapid second click hits a stale or momentarily absent button.

**Fix:** Debounce the re-render, or check if state actually changed before rebuilding. Simplest approach: in `renderBettingUI`, compare the current rendered bet amount to the incoming `me.bet` and skip the rebuild if unchanged.

#### 2. Dealer card appears to flip/animate on every bet click (MEDIUM)
**Root cause:** `renderDealerAreaEl` does `wrap.innerHTML = ''` on every `onRoomChange`, destroying and recreating the dealer card DOM nodes. The face-down card element (`renderCard(null)`) is a brand-new node each time — any CSS transition fires from the start. During the playing phase specifically, the face-down card is recreated on every chip add.

**Fix:** Only call `renderDealerAreaEl` if the dealer state actually changed (compare `dealer.hand` and `dealer.hiddenCard` to previous render). Or add a check: if the dealer element already shows the correct cards, skip the rebuild.

#### 3. No automatic inter-hand flow — host must Force Start every hand (MEDIUM)
**Root cause:** After resolution, phase resets to `'betting'`. Players place bets and confirm (`status = 'ready'`). Then nothing happens — the host must click Force Start manually.

**Fix:** In `handleRoomUpdate`, when phase is `'betting'` and host, check if ALL non-sitting-out players are `'ready'`. If so, call `advanceFromBetting` automatically:
```js
if (room.phase === 'betting' && isHost) {
  const active = Object.values(room.players || {}).filter(p => p.status !== 'sitting-out');
  if (active.length > 0 && active.every(p => p.status === 'ready')) {
    advanceFromBetting(room);
  }
}
```

#### 4. Duplicate timer — `startTimer` called twice per turn (MEDIUM)
**Root cause:** `advanceTurn` calls `startTimer(deadline, null, callback)` on the host side. Then `renderActionButtons` also calls `startTimer(room.turnDeadline, updateFn, callback)` when it fires for the current-turn player. If the host IS the current-turn player, two timers are running simultaneously. Both will fire at the deadline and both will try to auto-stand.

**Fix:** Read `timer.js` to see if `startTimer` cancels the previous timer. If not, add a guard — e.g., don't start the per-action timer in `advanceTurn` for the host's own turn (let `renderActionButtons` handle it), or cancel any existing timer before starting a new one.

#### 5. `setDealer` call in `playDealerHand` uses wrong data model when dealer hits (LOW)
**Root cause:** `dealCards` stores `dealer.hand = [visibleCard]` and `dealer.hiddenCard = hiddenCard`. In `playDealerHand`, after the dealer hits extra cards, the code does:
```js
await setDealer(dealerStrs.slice(0, -1), dealerStrs[dealerStrs.length - 1]);
```
This stores ALL cards except the last as `dealer.hand`, and the last card as `dealer.hiddenCard`. If the dealer hits two extra cards, the "hidden card" slot contains a hit card, not the original hidden card. The visual renders OK (all cards show), but the data model is wrong.

**Fix:** Track the actual hidden card index separately, or change the data model: store all dealer cards in `dealer.hand` and use a `dealer.revealedCount` field to know how many were visible at deal time.

#### 6. `joinRoom` called on game.html resets player balance each navigation (LOW)
**Root cause:** `game.js init()` calls `joinRoom(code, name)` which always does `set(players/${uid}, { balance: room.settings.startingBalance, ... })`. If a player navigates away and back (e.g., page refresh mid-game), their balance resets to startingBalance.

**Fix:** In game.js, replace `joinRoom` with a lighter "rejoin" function that only writes the player entry if they don't already exist in `room.players`, and preserves their existing balance if they do.

---

## Key File Map

| File | Role |
|------|------|
| `js/room.js` | Firebase reads/writes. Exports: `uid`, `roomCode`, `isHost`, `initRoom`, `createRoom`, `joinRoom`, `onRoomChange`, `writePlayerAction`, `setPhase`, `setCurrentTurn`, `dealCards`, `updatePlayer`, `updateAllBalances`, `updateRoomField`, `setDealer` |
| `js/game.js` | Game page controller. Phases: betting → dealing → playing → resolution → betting. `handleRoomUpdate` dispatches to `renderBettingUI`, `handleDealingPhase`, `renderActionButtons`, `watchForPlayerAction`, `applyPlayerAction`, `playDealerHand` |
| `js/ui.js` | DOM rendering. `renderTableState` (called every `onRoomChange`), `renderHandEl`, `renderChipSelector`, `updatePhaseUI` |
| `js/engine.js` | Pure game logic — no Firebase. `handValue`, `canHit/Stand/Double/Split/Surrender`, `dealerShouldHit`, `resolveHand` |
| `js/lobby.js` | Lobby page controller — create/join room, show player list, Start button |
| `js/timer.js` | `startTimer(deadline, tickFn, expireFn)` / `stopTimer()` — read this before touching timer logic |
| `css/hud.css` | HUD, action-buttons, chip-selector-wrap, host-controls positioning. All game controls are `position: fixed` with `z-index: 11` |
| `firebase-rules.json` | Must redeploy after changes: `firebase deploy --only database` |

---

## Architecture Notes

### State model
Room state lives entirely in Firebase RTDB at `rooms/${roomCode}`. All clients react to `onRoomChange` (Firebase `onValue`). The host is the sole authority — only the host writes `phase`, `dealer`, `currentTurn`, `turnDeadline`. Any client can write to their own `players/${uid}` entry.

### Phase flow
```
waiting → betting → dealing → playing → resolution → betting → ...
```
- `waiting`: room created, no game started
- `betting`: players place bets (`me.bet`), confirm (`me.status = 'ready'`), host Force Starts
- `dealing`: host only — deals cards, writes `hands`, `bets[]`, sets `currentTurn` to first player
- `playing`: players act in turn (enforced by `currentTurn`), host processes actions via `watchForPlayerAction`
- `resolution`: dealer plays, balances updated, 5-second pause, then reset to `betting`

### The central UI problem
`renderTableState` and `handleRoomUpdate` run on EVERY `onRoomChange`. They both tear down and rebuild their DOM sections via `innerHTML = ''`. This is the source of most UI jank. The fix is to make renders idempotent and conditional — only rebuild if something actually changed.

### localDeck
`localDeck` is a module-level array in `game.js`, only on the host's client. The host shuffles and deals from this deck — guests never see it. This means **page refresh on the host breaks the game** (deck is lost). A more robust approach would store the remaining deck in Firebase, but that exposes card order to all clients (cheating risk). A future fix would be to reshuffle only when needed (deck < threshold) and never let the host refresh mid-game.
