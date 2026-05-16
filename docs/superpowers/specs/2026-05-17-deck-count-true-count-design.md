# Deck Count & True Count Display — Design Spec
Date: 2026-05-17

## Overview

Show players how many decks remain in the shoe (always visible) and optionally show the Hi-Lo running count and true count (host-toggled). Host is sole authority for all count state, written to Firebase after each card-consuming action.

---

## Data Model

New fields on the Firebase room object:

| Field | Type | Description |
|---|---|---|
| `cardsRemaining` | number | `localDeck.length` after each action. Written by host. |
| `runningCount` | number | Hi-Lo running count. Written by host. Reset to 0 on reshuffle. |
| `showCount` | boolean | Host-controlled toggle. Written by host on button click. |

True count is **not** stored in Firebase — computed client-side on render:
```
trueCount = runningCount / (cardsRemaining / 52)
```
Rounded to 1 decimal.

### Hi-Lo Card Values

Implemented as `hiLoValue(card)` in `engine.js`:
- 2–6 → +1
- 7–9 → 0
- 10/J/Q/K/A → −1

`runningCount` lives as a module-level variable in `game.js` alongside `localDeck`. Host-only.

---

## Host-Side Writes (game.js)

One `updateRoomField` call per action (batched, not per-card):

1. **Dealing phase** (`handleDealingPhase`) — after `dealCards` returns, count Hi-Lo for all dealt cards (player hands + dealer visible card). If deck was reshuffled this hand, reset `runningCount` to 0 first, then count.
2. **Hit** (`applyPlayerAction`) — add drawn card's Hi-Lo value to `runningCount`, write both fields.
3. **Double** (`applyPlayerAction`) — same as hit (one card drawn).
4. **Split** (`applyPlayerAction`) — two cards drawn, add both Hi-Lo values, write once.
5. **Dealer hand** (`playDealerHand`) — after dealer finishes drawing, count all dealer cards including revealed hidden card. Write once, before `updateAllBalances`.
6. **Reshuffle** — occurs in `handleDealingPhase` when `localDeck.length < 20`. Reset `runningCount` to 0 before counting newly dealt cards.

---

## Display (game.html + ui.js)

### New HTML elements in game.html

- `#shoe-display` — top right area, non-intrusive. Always rendered.
- `#count-display` — left side. Hidden by default (`hidden` attribute).

### Rendering (renderTableState in ui.js)

On every `onRoomChange`:

- `#shoe-display`: `Shoe: X.X decks` where X.X = `(room.cardsRemaining / 52).toFixed(1)`. Show nothing if `cardsRemaining` is undefined.
- `#count-display`: shown only when `room.showCount === true`. Displays:
  - `RC: +3` (running count, with sign)
  - `TC: +1.2` (true count, computed client-side, with sign)
  - Hidden (`.hidden = true`) when `room.showCount` is false or undefined.

No new render keys needed — these are direct text updates, not DOM rebuilds.

### CSS

Small muted fixed-position text. Does not overlap existing HUD (balance top-left, bet HUD bottom).

---

## Host Controls Panel (ui.js + game.js)

`#host-controls` becomes a persistent admin panel visible to the host at all phases.

- `updatePhaseUI` in `ui.js` stops unconditionally hiding `hostCtrl`. Instead, it only hides it when the current user is not the host. The `isHost` flag from `room.js` is used.
- "Force Start" button: rendering unchanged — still only added during betting phase by `renderBettingUI`.
- "Show Count / Hide Count" toggle button: added once to `hostCtrl` on game page init (not rebuilt on every room update). On click, writes `showCount: !currentRoom.showCount` via `updateRoomField`.
- Toggle button label is updated in `renderTableState` each room change to reflect current `room.showCount` state.

---

## Files Changed

| File | Change |
|---|---|
| `js/engine.js` | Add `hiLoValue(card)` export |
| `js/game.js` | Add `runningCount` module var; write `cardsRemaining` + `runningCount` after each action; add count toggle button init |
| `js/ui.js` | Update `renderTableState` to render shoe/count displays; update `updatePhaseUI` to keep host panel visible |
| `game.html` | Add `#shoe-display` and `#count-display` elements |
| `css/` | Style `#shoe-display` and `#count-display` |
