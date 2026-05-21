# Roulette — Design Spec

**Date:** 2026-05-20  
**Status:** Approved  
**Variant:** European (single zero, 37 pockets)  
**Bet types:** Outside only  
**Spin control:** Host closes bets and triggers spin  
**Wheel:** Full animated SVG  

---

## 1. Lobby & Routing (Architecture Prerequisite)

### Game Picker
`index.html` adds a game selector row above the Create Room button — two toggle buttons: **Blackjack** (default) and **Roulette**. On the Join tab, public room cards show a game type badge.

### `lobby.js` Changes
- Tracks `selectedGame` (`'blackjack'` | `'roulette'`), defaults to `'blackjack'`
- On Create Room: writes `gameType: selectedGame` to Firebase alongside existing fields
- `goToGame()` routes to `game.html` (BJ) or `roulette.html` (Roulette) based on `room.gameType`
- Settings panel renders BJ settings when `selectedGame === 'blackjack'`, or Roulette settings (min bet, max bet, starting balance) when `'roulette'`
- Join flow reads `gameType` from the room and routes accordingly — no picker needed on join

### Firebase Rules
New entry needed: `gameType` writeable by host (same pattern as all other host-only fields).

---

## 2. Firebase Data Model

Roulette rooms use the same `rooms/{code}` path and all existing fields (`hostId`, `phase`, `players`, `settings`, `chat`, `createdAt`, `gameType`, etc.).

### Roulette-specific additions

```
rooms/{code}/
  gameType: "roulette"
  phase: "betting" | "spinning" | "results"
  rouletteBets/
    {uid}/
      red: number
      black: number
      odd: number
      even: number
      low: number        (1–18)
      high: number       (19–36)
      dozen1: number     (1–12)
      dozen2: number     (13–24)
      dozen3: number     (25–36)
      col1: number
      col2: number
      col3: number
  lastSpin/
    number: 0–36
    color: "red" | "black" | "green"
```

- Player balances live in `players/{uid}/balance` — same as BJ
- `rouletteBets` resets to null at the start of each betting phase
- Each bet field is a chip amount (0 if not placed)

### Firebase Rules
- `rouletteBets/{uid}` writeable by that player or host
- `lastSpin` writeable by host only

---

## 3. Game Files & Phase Flow

### New Files
| File | Purpose |
|------|---------|
| `roulette.html` | Game page — imports shared modules + roulette JS/CSS |
| `js/roulette-engine.js` | Pure logic: spin RNG, payout calculation |
| `js/roulette-game.js` | Firebase coordination, phase management, host controls |
| `js/roulette-ui.js` | SVG wheel, betting grid, chip placement, result display |
| `css/roulette.css` | Table layout, wheel container, betting grid, results panel |

### Reused Unchanged
`room.js`, `chat.js`, `music.js`, `leaderboard.js`, `sound.js`, `base.css`, `chat.css`, `music.css`

### Phase Flow

```
betting → spinning → results → betting
```

**betting**
- Players place/adjust chips on the betting grid
- Host sees "Close Bets & Spin" button; players see placement UI and balance
- Bets written to `rouletteBets/{uid}` in Firebase as they're placed

**spinning**
- Host triggers spin: host client runs RNG, picks 0–36, then writes `lastSpin` + `phase: "spinning"` in a single atomic `update()` call
- All clients read `lastSpin` and animate their wheel simultaneously
- Betting UI disabled

**results**
- Payouts calculated client-side from `lastSpin` + `rouletteBets`
- Host writes updated balances to Firebase
- Result panel shows winning number, color, and each player's net win/loss
- Host clicks "Next Round": host writes `rouletteBets: null` + `phase: "betting"` in a single atomic `update()` call

Host is single source of truth for spin result and balance updates — same pattern as BJ engine.

---

## 4. SVG Wheel & Betting Grid

### Wheel

European pocket sequence (37 pockets):
`0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26`

- Each pocket is an SVG `path` arc segment colored red, black, or green (0 only)
- Number labels rotate to stay upright
- Wheel SVG is static in the DOM
- CSS `@keyframes` animation: several full rotations + calculated final angle derived from winning pocket index
- A separate ball element counter-rotates during spin, then drops inward and stops over the winning segment

### Betting Grid

HTML table layout:

```
[ RED      ] [ BLACK     ]
[ ODD      ] [ EVEN      ]
[ 1–18     ] [ 19–36     ]
[ 1st 12   ] [ 2nd 12   ] [ 3rd 12  ]
[ Column 1 ] [ Column 2 ] [ Column 3]
```

- Each cell shows current bet amount (empty = 0)
- Clicking a cell places one chip denomination
- Chip selector reuses `chips.css`
- Clear button zeros all bets
- Bet cells disabled during `spinning` and `results` phases

---

## 5. Payout Logic

Landing on 0 loses all outside bets. No La Partage rule.

| Bet | Wins on | Pays |
|-----|---------|------|
| Red | red numbers | 1:1 |
| Black | black numbers | 1:1 |
| Odd | odd numbers (not 0) | 1:1 |
| Even | even numbers (not 0) | 1:1 |
| Low (1–18) | 1–18 | 1:1 |
| High (19–36) | 19–36 | 1:1 |
| 1st Dozen | 1–12 | 2:1 |
| 2nd Dozen | 13–24 | 2:1 |
| 3rd Dozen | 25–36 | 2:1 |
| Column 1 | 1,4,7,10,13,16,19,22,25,28,31,34 | 2:1 |
| Column 2 | 2,5,8,11,14,17,20,23,26,29,32,35 | 2:1 |
| Column 3 | 3,6,9,12,15,18,21,24,27,30,33,36 | 2:1 |

### `roulette-engine.js` exports
- `spin()` → random integer 0–36
- `calcPayouts(spinResult, bets)` → `{ [uid]: netDelta }` — iterates each player's bets, sums wins and losses, returns net change per player

Host applies deltas to Firebase balances. All clients can independently verify but only host writes.

---

## Red Numbers
`1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36`  
All others (except 0) are black. 0 is green.
