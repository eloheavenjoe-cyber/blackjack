# Round Counter — Design Spec

**Date:** 2026-05-20  
**Status:** Approved

---

## Overview

A persistent round counter displayed in the top-left corner of the felt table. Counts continuously for the entire session (never resets on reshuffle). All players see the same value via Firebase. Animates with a CSS 3D rotateX flip when the number increments.

---

## Storage

- New field: `rooms/{roomCode}/roundCount` (integer, starts at 0/absent)
- Incremented by the **host only** inside `startDeal()` in `js/game.js`, alongside the `setPhase('dealing')` call
- Increment formula: `(room.roundCount || 0) + 1`
- Call: `updateRoomField('roundCount', newCount)`
- No Firebase rules change required — room-level fields are covered by existing rules

**Timing:** Increments at dealing phase start. "Round N" appears as cards are being dealt.

---

## Display

**Element:** `#round-counter`, placed as an `absolute` child of `#table` in `game.html`  
**Position:** `top: 20px; left: 20px` (top-left corner of the felt surface)  
**Structure:**
```html
<div id="round-counter">
  <div class="round-label">ROUND</div>
  <div class="flip-cell">0</div>
</div>
```

**Styling (in `css/hud.css`):**
- `#round-counter`: `position: absolute; top: 20px; left: 20px; perspective: 200px; text-align: center; pointer-events: none; z-index: 3`
- `.round-label`: small uppercase dim text, matching existing `.hud-label` style (10px, `--clr-text-dim`, letter-spacing 1px)
- `.flip-cell`: gold Georgia serif, ~28px bold, `transform-origin: center center`, `--clr-gold`

---

## Animation

Two CSS `@keyframes` in `css/hud.css`:

```css
@keyframes flip-out {
  from { transform: rotateX(0deg); }
  to   { transform: rotateX(90deg); }
}
@keyframes flip-in {
  from { transform: rotateX(-90deg); }
  to   { transform: rotateX(0deg); }
}
```

Both run at 130ms `ease-in` / `ease-out` respectively.

**JS flow in `updateRoundCounter(n)` (added to `js/ui.js`):**
1. If `n` equals current displayed value, do nothing (no animation on first render — just set text)
2. Add class `flip-out` to `.flip-cell`
3. On `animationend`: swap text to new value, replace class with `flip-in`
4. On second `animationend`: remove `flip-in` class

No JS timers — driven entirely by `animationend` events.

**First render (no prior value):** set text directly, no animation.

---

## Data Flow

1. Host increments `roundCount` in Firebase at dealing phase start
2. All clients receive update via existing `onRoomChange` listener in `game.js`
3. `renderTableState(room)` in `ui.js` calls `updateRoundCounter(room.roundCount || 0)`
4. `updateRoundCounter` compares against last rendered value, triggers flip if changed

`updateRoundCounter` tracks last rendered value in a module-level variable in `ui.js`.

---

## Files Changed

| File | Change |
|---|---|
| `game.html` | Add `#round-counter` inside `#table` div |
| `css/hud.css` | Add `#round-counter` + `.round-label` + `.flip-cell` styles + `@keyframes flip-out/flip-in` |
| `js/game.js` | Increment `roundCount` in `startDeal()` via `updateRoomField` |
| `js/ui.js` | Add `updateRoundCounter(n)` function; call it from `renderTableState` |

---

## Edge Cases

- **Player joins mid-session:** Reads current `roundCount` from Firebase on first render — sees the correct current round immediately, no animation
- **Host reconnects:** `startDeal()` is host-only; reconnect guard already in place for dealing phase — no double-increment risk
- **roundCount absent (new room):** Treated as 0; first dealing phase sets it to 1
