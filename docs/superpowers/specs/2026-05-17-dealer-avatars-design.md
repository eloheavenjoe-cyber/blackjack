# Dealer Avatars — Design Spec

**Date:** 2026-05-17
**Status:** Approved

---

## Overview

The host selects one of six dealer avatars from a dropdown in the lobby settings. The selection is stored in `room.settings.dealerAvatar` (integer index) and all clients swap the dealer image accordingly. No name is displayed in-game — the names exist only as dropdown labels.

---

## Data Model

### `DEALER_OPTIONS` — exported from `js/settings.js`

```js
export const DEALER_OPTIONS = [
  { name: 'Happy Merchant', file: 'dealer-merchant.png' },
  { name: 'Happy Piggy',    file: 'dealer-piggy.png' },
  { name: 'Happy China',    file: 'dealer-china.png' },
  { name: 'Happy Alien',    file: 'dealer-alien.png' },
  { name: 'Happy Wife',     file: 'dealer-wife.png' },
  { name: 'Happy Muz',      file: 'dealer-muz.png' },
];
```

### `DEFAULT_SETTINGS` change

Add `dealerAvatar: 0` (index into `DEALER_OPTIONS`, default = Happy Merchant).

### `validateSettings` change

```js
if (!Number.isInteger(s.dealerAvatar) || s.dealerAvatar < 0 || s.dealerAvatar >= DEALER_OPTIONS.length)
  errors.push('Invalid dealer avatar');
```

---

## Lobby (js/lobby.js)

Add one new row to `renderSettingsForm`:

```js
{ key: 'dealerAvatar', label: 'Dealer', type: 'select',
  options: DEALER_OPTIONS.map((_, i) => i),
  labels: DEALER_OPTIONS.map(d => d.name) }
```

This follows the exact same pattern as all existing select rows. No other lobby changes.

---

## Game (js/game.js + game.html)

### game.html

Remove the hardcoded `src` from the dealer avatar img so it is always set by JS:

```html
<img id="dealer-img" width="80" height="80" alt="Dealer">
```

(Add `id="dealer-img"` to make selection unambiguous.)

### game.js

In the `onRoomChange` handler (alongside existing state reads), update the avatar whenever room state arrives:

```js
const avatarIdx = room.settings?.dealerAvatar ?? 0;
const { file } = DEALER_OPTIONS[avatarIdx] ?? DEALER_OPTIONS[0];
document.getElementById('dealer-img').src = `assets/${file}`;
```

Import `DEALER_OPTIONS` from `./settings.js`.

---

## Image Files

Naming convention: `assets/dealer-<slug>.png`

| Index | Name | File |
|---|---|---|
| 0 | Happy Merchant | `assets/dealer-merchant.png` |
| 1 | Happy Piggy | `assets/dealer-piggy.png` |
| 2 | Happy China | `assets/dealer-china.png` |
| 3 | Happy Alien | `assets/dealer-alien.png` |
| 4 | Happy Wife | `assets/dealer-wife.png` |
| 5 | Happy Muz | `assets/dealer-muz.png` |

The existing `assets/dealer-avatar.png` should be renamed to `assets/dealer-merchant.png` when dropping in the real images. Until then, a placeholder can be left; the code will 404 gracefully (broken img, no JS error).

---

## Firebase Rules

No change needed. `dealerAvatar` is a new key inside the existing `settings` object, already covered by the current write rule.

---

## Files Changed

| File | Change |
|---|---|
| `js/settings.js` | Add `DEALER_OPTIONS` export, `dealerAvatar: 0` default, validation rule |
| `js/lobby.js` | Add dealer select row to `renderSettingsForm` |
| `js/game.js` | Import `DEALER_OPTIONS`, update `#dealer-img` src on room change |
| `game.html` | Add `id="dealer-img"` to avatar img, remove hardcoded `src` |

---

## Out of Scope

- Dealer name displayed in-game
- Dealer chat messages (future feature, not specced here)
- Per-player avatar selection
