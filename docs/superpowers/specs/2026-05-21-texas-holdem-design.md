# Texas Hold'em Design

**Date:** 2026-05-21
**Variant:** No-Limit Texas Hold'em (NLHE)
**Status:** Approved

---

## Overview

Add Texas Hold'em as a second game in the casino alongside Blackjack. Uses the existing multi-game lobby infrastructure (`goToGame`, `gameType` in Firebase, game picker in `index.html`). Maximum reuse of shared modules — new Hold'em files import BJ's chat, music, sound, timer, leaderboard, and all CSS utilities without modification.

- 2–6 players, human-only (bot seam included for future extension)
- No-Limit betting (all-in always possible)
- Cash game, no blind escalation
- Bust = spectate, no rebuy
- Host-configurable blind presets; host orchestrates all phase transitions

---

## File Structure

### New files

| File | Purpose |
|---|---|
| `holdem.html` | Game page — table, HUD, chat, music panel |
| `css/holdem.css` | Table layout, seats, community cards, pot display |
| `js/holdem-engine.js` | Pure logic: deck, hand evaluator, side pots, betting state machine |
| `js/holdem-ui.js` | DOM: card renders, seat updates, action controls, pot display |
| `js/holdem-game.js` | Firebase sync, host orchestration, turn management, blind rotation |

### Unchanged imports (zero BJ modifications)

`firebase-config.js`, `js/chat.js`, `js/music.js`, `js/sound.js`, `js/timer.js`, `js/leaderboard.js`, `js/stats.js`, `css/base.css`, `css/chips.css`, `css/chat.css`, `css/music.css`, `css/leaderboard.css`, `css/hud.css`, `css/cards.css`

### Modified files

| File | Change |
|---|---|
| `js/lobby.js` | Add Hold'em as selectable game; settings form for blind preset |
| `js/settings.js` | Add `HOLDEM_DEFAULT_SETTINGS` |
| `index.html` | Restore two-button game picker (BJ / Texas Hold'em) |

---

## Settings

```js
HOLDEM_DEFAULT_SETTINGS = {
  blindPreset: '10/20',   // options: '5/10', '10/20', '25/50', '100/200'
  startingStack: 1000
}
```

---

## Firebase Schema

Extends the existing `rooms/{roomId}` structure. Fields already present (`host`, `players`, `gameType`, `status`, `settings`, `chat`) are reused unchanged.

### Room-level fields (Hold'em only)

```
handNumber: 0
phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
communityCards: []       // 0–5 cards, public
pot: 0                   // main pot total
sidePots: []             // [{ amount, eligiblePlayers[] }]
currentBet: 0            // highest bet this street
minRaise: 0              // last raise increment (for min-raise enforcement)
dealerSeat: 0            // rotates each hand
actionSeat: 0            // whose turn it is
lastAggressor: null      // seat index; null = no raise this street
```

> **Deck is NOT stored in Firebase.** The host keeps `localDeck` in memory (same pattern as BJ's `game.js`). On each phase transition, the host deals from `localDeck` and writes only the resulting community cards / hole cards to Firebase. This prevents any client from reading upcoming cards.

### Per-player fields (inside `players/{uid}`)

```
seat: 0–5
stack: 1000
streetBet: 0             // bet this street (determines call size)
totalBet: 0              // total bet this hand (side pot calculation)
folded: false
allIn: false
sittingOut: false        // true after busting; no rebuy
ready: false
```

### Private hole cards

Written to `privateData/{roomId}/holeCards/{uid}` — a separate Firebase path. Security rules restrict each uid to reading only their own node. Community cards and pot are public under the room node.

---

## Game Engine (`holdem-engine.js`)

Pure functions, no Firebase, fully testable. No external libraries.

### Deck & deal

- `shuffleDeck()` — returns standard 52-card array, same `{ suit, rank, value }` shape as BJ
- `dealHoleCards(deck, playerCount)` — returns `{ hands: [[card,card], ...], remaining }`
- `dealCommunity(deck, phase)` — deals 3 cards (flop), 1 (turn), 1 (river); returns `{ cards, remaining }`

### Hand evaluator

- `evaluateHand(holeCards, communityCards)` — best 5 from 7
- Returns `{ rank: 0–8, name: string, tiebreakers: [] }`
- Rank scale: 0 = high card, 1 = pair, 2 = two pair, 3 = trips, 4 = straight, 5 = flush, 6 = full house, 7 = quads, 8 = straight flush (includes royal)
- Handles ties — equal rank + tiebreakers → chop pot
- Called at showdown across all non-folded players

### Side pot calculator

- `calculateSidePots(players)` — input: `[{ uid, totalBet, folded, allIn }]`
- Algorithm: sort by `totalBet` ascending, iterate creating pot slices at each all-in level
- Returns `[{ amount, eligiblePlayers[] }]` — main pot first, side pots in order
- Called by host after each street and at showdown

### Betting round state machine

- `getNextActionSeat(seats, currentSeat)` — skips folded/allIn/sittingOut players
- Returns `null` when street is closed (action back to last aggressor, no pending calls)
- Host uses return value to either advance to next action or close the street

### Blind & dealer rotation

- `getNextDealerSeat(seats, currentDealer)` — skips sittingOut players
- Small blind = next active seat after dealer; big blind = next after small blind
- Heads-up exception: dealer posts small blind

---

## UI & Table Layout

### Table

- Same felt texture and ambient effects (breathing glow, card shimmer, spotlight flicker) via `base.css`
- Seats arranged in a semi-ellipse, up to 6 positions
- Dealer button, SB/BB labels, and stack sizes rendered at each seat
- Community cards centered on table; pot total displayed below

### Cards

- Same card face/back CSS classes from `cards.css`
- Hole cards: your own 2 show face-up; opponents show 2 face-down backs
- Showdown: all remaining players flip face-up with BJ's existing reveal animation

### Action controls (bottom HUD, visible only on your turn)

| Control | Condition |
|---|---|
| Fold | Always available |
| Check | `currentBet === yourStreetBet` |
| Call | Shows exact amount; grayed if already matched |
| Raise | Opens slider/input; min = `minRaise` or BB; max = stack |
| All-In | One-click shortcut to max raise |

Timer bar reused from `timer.js`. Controls hidden when not your turn.

### Pot display

- Main pot shown center-table
- Side pots stack below: "Side Pot (X players) — $Y"
- Chip animations from `chips.css` for bet-to-pot movement

### Showdown

- Cards flip, winning hand name flashes (e.g. "Full House — Aces over Kings")
- Chips animate to winner(s)
- Chop pot: chips split and animate to multiple winners

---

## Lobby Integration

### Game picker

`index.html` shows two buttons: Blackjack and Texas Hold'em. Selecting Hold'em shows a settings form (blind preset dropdown + starting stack input). Host creates room → `gameType: 'holdem'` → `goToGame('holdem')` → `holdem.html`.

### Public room list

Existing room cards already render a `gameType` badge. Hold'em rooms display "Texas Hold'em". No changes to room card rendering.

### Hand flow

```
Lobby (ready-up)
  → Deal hole cards (host writes to privateData)
    → Preflop betting
      → Flop (3 community cards)
        → Flop betting
          → Turn (1 card)
            → Turn betting
              → River (1 card)
                → River betting
                  → Showdown (evaluate, award pot)
                    → Next hand (rotate dealer, reset state)
```

Host drives all phase transitions via Firebase writes. Clients listen and render. Same authority model as BJ.

### Bust & spectate

Player hits 0 chips → `sittingOut: true`. They see the table but action controls are hidden. No rejoin for the session.

---

## Future: Bot Hook

`holdem-game.js` exports `getActionForSeat(seat, gameState)` returning `null` in this version. Future bot work fills this in — same seam as `bot.js` in BJ.

---

## Out of Scope

- Tournaments / blind escalation
- Rebuy
- Bots (seam included, logic deferred)
- Sit-n-go formats
- Hand history / replay
