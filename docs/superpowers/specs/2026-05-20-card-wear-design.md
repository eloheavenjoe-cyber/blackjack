# Card Wear Design

**Date:** 2026-05-20  
**Status:** Approved

## Overview

Cards visually age as rounds are played within a shoe. Wear resets when the shoe is shuffled, mirroring real casino behavior. Three stages: fresh, mid, worn. Each stage adds visual degradation (CSS filter) and physical damage markers (inset shadow, crease line).

---

## Data Layer

### New Firebase field: `shoeRoundCount`

- **Type:** integer, room-level, host-write
- **Purpose:** Tracks rounds played since the last shuffle. Drives wear stage. Distinct from `roundCount` (which accumulates across the whole session and never resets).
- **No Firebase rules change needed** — host-controlled room fields are already permitted by existing rules.

#### Where it changes

| Location | File | Action |
|----------|------|--------|
| `advanceFromBetting()` ~line 672 | `game.js` | Increment alongside `roundCount` |
| `executeShuffleShoe()` ~line 684 | `game.js` | Reset to 0 in existing `Promise.all` |
| `handleDealingPhase()` ~line 752 | `game.js` | Reset to 0 in auto-reshuffle branch |

---

## Wear Stages

| Stage | `shoeRoundCount` | Class on `#table` | Visual filter | Physical damage |
|-------|-----------------|-------------------|---------------|-----------------|
| Fresh | 0–9 | *(none)* | None | None |
| Mid | 10–29 | `wear-mid` | `sepia(0.15) brightness(0.93)` | Edge darkening (soft inset shadow) |
| Worn | 30+ | `wear-worn` | `sepia(0.35) brightness(0.87) contrast(0.95)` | Edge darkening (heavy) + crease line |

---

## JS Changes

### `game.js` — `advanceFromBetting()`

Replace the single `roundCount` write with a `Promise.all`:

```js
await Promise.all([
  updateRoomField('roundCount', (room.roundCount || 0) + 1),
  updateRoomField('shoeRoundCount', (room.shoeRoundCount || 0) + 1),
]);
await setPhase('dealing');
```

### `game.js` — `executeShuffleShoe()`

Add `shoeRoundCount: 0` reset into the existing `Promise.all`:

```js
await Promise.all([
  updateRoomField('cardsRemaining', localDeck.length),
  updateRoomField('runningCount', 0),
  updateRoomField('shoeRoundCount', 0),
]);
```

### `game.js` — `handleDealingPhase()` auto-reshuffle branch

After the existing count resets:

```js
await updateRoomField('shoeRoundCount', 0);
```

### `ui.js` — `renderTableState()`

Compute stage and apply/remove class on `#table`:

```js
const shoeRound = room.shoeRoundCount ?? 0;
const wearStage = shoeRound >= 30 ? 'wear-worn' : shoeRound >= 10 ? 'wear-mid' : '';
const tableEl = document.getElementById('table');
tableEl.classList.remove('wear-mid', 'wear-worn');
if (wearStage) tableEl.classList.add(wearStage);
```

---

## CSS Changes (`css/cards.css`)

All rules are additive — nothing existing is modified. The `box-shadow` on `.card-svg` re-declares the existing shadow values plus the new inset (CSS `box-shadow` doesn't cascade additively).

```css
/* Mid wear — slight yellowing, soft edge shadow */
#table.wear-mid .card-svg {
  filter: sepia(0.15) brightness(0.93);
  box-shadow: 2px 2px 0px 1px rgba(0,0,0,0.4), 3px 5px 12px rgba(0,0,0,0.6),
              inset 0 0 8px rgba(0,0,0,0.25);
}

/* Worn — visibly aged, heavy edge shadow, crease */
#table.wear-worn .card-svg {
  filter: sepia(0.35) brightness(0.87) contrast(0.95);
  box-shadow: 2px 2px 0px 1px rgba(0,0,0,0.4), 3px 5px 12px rgba(0,0,0,0.6),
              inset 0 0 14px rgba(0,0,0,0.45);
}

/* Crease line — face-up cards only, worn stage only */
#table.wear-worn .card-wrap:not(.face-down)::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    128deg,
    transparent 42%,
    rgba(0,0,0,0.07) 50%,
    transparent 58%
  );
  pointer-events: none;
  border-radius: var(--radius-card);
}
```

**Why `.card-wrap:not(.face-down)::after`:** `.card-wrap.face-down::after` is already claimed by the shimmer animation. This selector only targets face-up cards, avoiding collision.

---

## Scope

- No changes to `renderCard()` or `renderHandEl()` signatures
- No changes to Firebase rules
- No new assets
- Wear applies uniformly to all cards on the table (same shoe age for all)
