# Hot Streak & Session Leaderboard — Design Spec

## Overview

Two linked features:
1. **Hot streak badge** — 🔥N displayed next to a player's name when they win 2+ hands in a row.
2. **Session leaderboard** — collapsible, draggable panel (top-left) showing all players' hands won, total wagered, and net profit for the current room session.

## Data Model

Four new fields added to each player's Firebase node at `rooms/${roomCode}/players/${uid}`:

| Field | Type | Description |
|---|---|---|
| `winStreak` | number | Current consecutive wins. +1 on net-win round, reset to 0 on net-loss round, unchanged on push/break-even |
| `handsWon` | number | Total rounds won this session |
| `totalWagered` | number | Sum of all bets placed including doubles/splits (`sum(player.bets)` per round) |
| `sessionProfit` | number | Running net profit: sum of `(sum(payouts) - sum(player.bets))` per round |

**Initialization:** `createRoom` and the new-player branch of `joinRoom` set all four fields to `0`. On reconnect (rejoin), existing values are preserved — stats survive a page refresh.

**No new Firebase rules needed.** All four fields live under `players/${uid}`, which is already covered by the existing player-level write rule.

## Streak Logic (round-level)

Evaluated by the host at the end of `playDealerHand()` after `resolveHand()` runs for all hands:

- **Net win round:** `roundProfit > 0` → `winStreak++`, `handsWon++`
- **Net loss round:** `roundProfit < 0` → `winStreak = 0`
- **Push / break-even:** `roundProfit === 0` → `winStreak` unchanged

Where `roundProfit = sum(payouts) - sum(player.bets)` for that round. `player.bets` is initialized to `[player.bet]` at deal and extended by doubles/splits, so it always equals total wagered.

Surrender and bust are net-loss outcomes (payout = 0 or partial). Blackjack is a net-win outcome (payout = 2.5× or 2×).

Split hands: the round is judged as a whole via net `roundProfit`, not hand-by-hand.

## Stats Update Flow

In `playDealerHand()` (game.js, host-only), during the existing `balanceMap` computation loop, accumulate per-player stats in parallel:

1. For each active player, sum up all `payout` values from `resolveHand()` calls → `totalPayouts`.
2. `roundProfit = totalPayouts - sum(player.bets)`.
3. `totalWagered += sum(player.bets)`.
4. Determine outcome from `roundProfit` sign → update `winStreak`, `handsWon`.
5. Build stat update: `{ winStreak, handsWon, totalWagered, sessionProfit }`.
6. Write via a new `updatePlayerStats(pid, stats)` room.js helper, batched alongside `updateAllBalances()`.

## Hot Streak Display

Modified in `renderTableState()` in `ui.js`:

- If `player.winStreak >= 2`, append `<span class="streak-badge">🔥${player.winStreak}</span>` to the name element after the host crown.
- If `winStreak < 2`, no badge rendered.
- A `.streak-pop` CSS animation (brief scale pulse) fires when the badge renders, giving visual feedback on increment. Since `renderTableState` re-renders on every room update, the animation triggers naturally when the streak number changes.

## Leaderboard Panel

**New files:** `js/leaderboard.js`, `css/leaderboard.css`

**Panel layout:**
```
┌─ 📊 Leaderboard  [−] ─────┐
│ Player       W  Wagered  Profit │
│ Isaac ♛  🔥4  7  $2,400  +$340 │
│ Rybong   🔥2  4  $1,100   −$80 │
│ Joe           2    $600  +$120 │
└─────────────────────────────────┘
```

- Rows sorted by `sessionProfit` descending.
- Profit column: green `+$N` if positive, red `−$N` if negative, neutral `$0` if zero.
- Player name includes streak badge if `winStreak >= 2`.

**Positioning & interaction:**
- Default: `position: fixed; top: 12px; left: 12px`.
- Draggable by header bar (same pattern as music panel: switches to explicit `top`/`left` on first drag).
- Collapse toggle `[−]`/`[+]` hides body, leaving only the header visible.

**Init flow (game.js):**
```js
import { initLeaderboard, updateLeaderboard } from './leaderboard.js';
// in init():
initLeaderboard();
// in onRoomChange callback:
updateLeaderboard(room);
```

`initLeaderboard()` creates and appends the panel DOM. `updateLeaderboard(room)` reads `room.players`, sorts by `sessionProfit`, and re-renders rows. No Firebase listeners of its own — piggybacks on the existing `onRoomChange` stream.

## Files Changed

| File | Change |
|---|---|
| `js/room.js` | Add `updatePlayerStats(pid, stats)` helper; init stat fields in `createRoom` and new-player `joinRoom` branch |
| `js/game.js` | Compute stat deltas in `playDealerHand()`; import and call `initLeaderboard` / `updateLeaderboard` |
| `js/ui.js` | Render streak badge in `renderTableState()` |
| `js/leaderboard.js` | New module: panel DOM, drag, collapse, render |
| `css/leaderboard.css` | New stylesheet: panel, header, table, profit colours, streak-pop animation |
| `game.html` | Link `leaderboard.css` |

## Out of Scope

- Stats are not persisted after the room is destroyed.
- No per-hand breakdown or history view.
- No reset command for stats mid-session.
