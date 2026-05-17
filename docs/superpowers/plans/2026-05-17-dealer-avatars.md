# Dealer Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the host pick one of six dealer avatars from a lobby dropdown; all clients swap the dealer image when room state updates.

**Architecture:** `DEALER_OPTIONS` array lives in `settings.js` (already imported by both `lobby.js` and, after this change, `game.js`). The selection is stored as an integer index in `room.settings.dealerAvatar` and propagated to all clients via the existing `onRoomChange` Firebase listener. No Firebase rules change needed.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database, GitHub Pages.

---

## File Map

| File | Change |
|---|---|
| `js/settings.js` | Export `DEALER_OPTIONS`, add `dealerAvatar: 0` default, add validation |
| `js/lobby.js` | Import `DEALER_OPTIONS`, add `dealerAvatar` select row to `renderSettingsForm` |
| `js/game.js` | Import `DEALER_OPTIONS`, update `#dealer-img` src in `onRoomChange` callback |
| `game.html` | Add `id="dealer-img"` to avatar img, remove hardcoded `src` attribute |

No new files. No Firebase rules change. No CSS change.

---

### Task 1: Add `DEALER_OPTIONS` to `settings.js`

**Files:**
- Modify: `js/settings.js`

- [ ] **Step 1: Add the `DEALER_OPTIONS` export above `DEFAULT_SETTINGS`**

Open `js/settings.js`. Insert this block at the very top of the file, before `export const DEFAULT_SETTINGS`:

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

- [ ] **Step 2: Add `dealerAvatar: 0` to `DEFAULT_SETTINGS`**

Inside the `DEFAULT_SETTINGS` object, add the new key after `actionTimer`:

```js
export const DEFAULT_SETTINGS = {
  decks: 6,
  blackjackPayout: '3:2',
  dealerHitSoft17: false,
  doubleDown: 'any',
  doubleAfterSplit: true,
  reSplit: '2',
  surrender: 'late',
  insurance: false,
  minBet: 5,
  maxBet: 500,
  startingBalance: 1000,
  actionTimer: 30,
  dealerAvatar: 0,
};
```

- [ ] **Step 3: Add validation for `dealerAvatar` in `validateSettings`**

Inside `validateSettings`, add this line after the `actionTimer` check:

```js
if (!Number.isInteger(s.dealerAvatar) || s.dealerAvatar < 0 || s.dealerAvatar >= DEALER_OPTIONS.length)
  errors.push('Invalid dealer avatar');
```

- [ ] **Step 4: Commit**

```bash
git add js/settings.js
git commit -m "feat: add DEALER_OPTIONS and dealerAvatar setting"
```

---

### Task 2: Add dealer dropdown to lobby settings form

**Files:**
- Modify: `js/lobby.js`

- [ ] **Step 1: Import `DEALER_OPTIONS`**

At the top of `js/lobby.js`, the existing import is:

```js
import { DEFAULT_SETTINGS, validateSettings } from './settings.js';
```

Change it to:

```js
import { DEFAULT_SETTINGS, validateSettings, DEALER_OPTIONS } from './settings.js';
```

- [ ] **Step 2: Add the `dealerAvatar` row to `renderSettingsForm`**

In `renderSettingsForm`, the `rows` array currently ends with:

```js
    { key: 'actionTimer', label: 'Action Timer (s)', type: 'select', options: [0,15,30,60], labels: ['Off','15s','30s','60s'] },
```

Add the dealer row after it:

```js
    { key: 'actionTimer', label: 'Action Timer (s)', type: 'select', options: [0,15,30,60], labels: ['Off','15s','30s','60s'] },
    { key: 'dealerAvatar', label: 'Dealer', type: 'select', options: DEALER_OPTIONS.map((_, i) => i), labels: DEALER_OPTIONS.map(d => d.name) },
```

No other changes needed. The existing `select` rendering already handles integer options:
- Option values `0`–`5` are stringified by the DOM, then the `change` handler converts them back to numbers via `Number(v)`.
- The initial selection uses `String(currentSettings[row.key]) === String(opt)` which works correctly for integers.
- The non-editable display reads `row.labels[idx]` which shows the dealer name.

- [ ] **Step 3: Commit**

```bash
git add js/lobby.js
git commit -m "feat: add dealer avatar dropdown to lobby settings"
```

---

### Task 3: Swap dealer avatar image in game

**Files:**
- Modify: `game.html`
- Modify: `js/game.js`

- [ ] **Step 1: Update `game.html` — add `id` to the avatar img, remove hardcoded `src`**

Find the existing line in `game.html`:

```html
          <img src="assets/dealer-avatar.png" width="80" height="80" alt="Dealer">
```

Replace it with:

```html
          <img id="dealer-img" width="80" height="80" alt="Dealer">
```

- [ ] **Step 2: Add `DEALER_OPTIONS` import to `game.js`**

`game.js` currently has no import from `settings.js`. Add this import at the top of the file, after the existing imports:

```js
import { DEALER_OPTIONS } from './settings.js';
```

- [ ] **Step 3: Update avatar src in the `onRoomChange` callback**

In `game.js`, the `onRoomChange` callback (starting at line 44) currently reads:

```js
  onRoomChange(room => {
    currentRoom = room;
    renderTableState(room, uid, async denom => {
      const me = (room.players || {})[uid];
      const newBet = Math.max((me?.bet || 0) - denom, 0);
      await writePlayerAction({ bet: newBet });
    });
    handleRoomUpdate(room);
  });
```

Add the avatar update directly after `handleRoomUpdate(room)`:

```js
  onRoomChange(room => {
    currentRoom = room;
    renderTableState(room, uid, async denom => {
      const me = (room.players || {})[uid];
      const newBet = Math.max((me?.bet || 0) - denom, 0);
      await writePlayerAction({ bet: newBet });
    });
    handleRoomUpdate(room);
    const avatarIdx = room?.settings?.dealerAvatar ?? 0;
    const { file } = DEALER_OPTIONS[avatarIdx] ?? DEALER_OPTIONS[0];
    document.getElementById('dealer-img').src = `assets/${file}`;
  });
```

- [ ] **Step 4: Commit**

```bash
git add game.html js/game.js
git commit -m "feat: swap dealer avatar image from room settings"
```

---

### Task 4: Push and verify

- [ ] **Step 1: Push to GitHub Pages**

```bash
git push origin master
```

- [ ] **Step 2: Verify in the live game**

1. Open https://eloheavenjoe-cyber.github.io/blackjack/ in two browser tabs.
2. In tab 1 (host): create a room. In the lobby settings, confirm a **Dealer** dropdown appears with all 6 names.
3. Select a non-default dealer (e.g., Happy Piggy). Click Start.
4. In both tabs, confirm the dealer area shows a broken-img placeholder (expected — image files not yet dropped in). The `src` attribute on `#dealer-img` should read `assets/dealer-piggy.png`.
5. Switch back to default (Happy Merchant) in a new room — `src` should read `assets/dealer-merchant.png`.
6. In tab 2 (non-host): join the same room. Confirm the Dealer row is shown read-only with the correct dealer name.

**Note on images:** All 6 image files (`assets/dealer-merchant.png` etc.) will 404 until you drop them in. That's expected and won't cause JS errors — the img element just shows a broken-image icon. Once you add the files, rename the existing `assets/dealer-avatar.png` to `assets/dealer-merchant.png` and add the remaining five.

- [ ] **Step 3: Update memory**

Mark dealer avatars as done in the project memory file at:
`C:\Users\Faber\.claude\projects\c--Users-Faber-Projects-Poe-Gamba-Simulator\memory\project_blackjack.md`
