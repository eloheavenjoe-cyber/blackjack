# Design: Emoji Float from Player Spot + Leaderboard Improvements

**Date:** 2026-05-18  
**Status:** Approved

---

## Overview

Three related UI improvements:

1. Floating emojis originate from the sender's player spot on the table instead of a fixed screen position
2. Leaderboard rows animate smoothly into new sort order after each round
3. Leaderboard gains a `BR` (bankroll) column showing each player's current balance

---

## 1. Emoji Float from Player Spot

### Goal

When a player clicks an emoji reaction, all clients (including the sender) see the emoji floating up from that player's spot on the table arc, not from the bottom-left of the screen.

### Current behavior

`spawnFloatingEmoji(emoji)` in `chat.js` positions emojis at a random `left` value (0–35% of viewport width) and `bottom: 48px`. The `uid` field present in the Firebase event payload `{ uid, emoji, ts }` is already received by the callback but currently ignored.

### Changes

**`js/ui.js` — `renderTableState`**  
Add `spot.dataset.uid = pid` when rendering a non-empty spot. Empty spots get no `data-uid`.

**`js/chat.js` — `listenEmojiReactions` callback**  
Change `({ emoji }) => spawnFloatingEmoji(emoji)` to `(ev) => spawnFloatingEmoji(ev.emoji, ev.uid)`.

**`js/chat.js` — `spawnFloatingEmoji`**  
Signature: `spawnFloatingEmoji(emoji, uid)`

Logic:
1. If `uid` is provided, query `document.querySelector(`[data-uid="${uid}"]`)`
2. If found, call `getBoundingClientRect()` — set `left` to `rect.left + rect.width / 2`, `top` to `rect.top - 10` (pixels, `position: fixed`)
3. If not found (player left, spot not rendered), fall back to current behavior: random `left`, `bottom: 48px`

The existing `@keyframes emoji-float` (`translateY(-300px)`, 2.5s ease-out) works unchanged for both cases. Switching from `bottom`-based to `top`-based positioning is handled by setting `top` instead of `bottom` on the element.

### Constraints

- No Firebase schema change
- No new listeners
- No changes to `room.js`
- `data-uid` is set on every `renderTableState` call, so it stays current as players join/leave

---

## 2. Leaderboard Animated Re-sort

### Goal

When round resolution updates player stats and the sort order changes, leaderboard rows visually slide into their new positions (FLIP animation) rather than instantly jumping.

### Current behavior

`updateLeaderboard(room)` in `js/leaderboard.js` does `tbody.innerHTML = ''` then appends rows in sorted order. Already sorts by `sessionProfit` descending on every call. Updates are triggered by `onRoomChange` in `game.js`, which fires when the host batch-writes stats at round end — the correct and only time rankings change.

### Changes

**`js/leaderboard.js` — `updateLeaderboard`**

Replace the `tbody.innerHTML = ''` rebuild with a FLIP-style update:

1. **Snapshot** — before any DOM change, record each existing row's `getBoundingClientRect().top` keyed by player uid. Use a `data-uid` attribute on each `<tr>` (set during row creation).
2. **Rebuild** — clear and repopulate `tbody` in new sorted order (existing logic), adding `data-uid` to each `<tr>`.
3. **Animate** — for each new `<tr>`, look up the uid's old `top` in the snapshot. If found and the delta is non-zero:
   - Apply `transform: translateY(${oldTop - newTop}px)` immediately (no transition)
   - On the next frame (`requestAnimationFrame`), apply `transition: transform 350ms ease` and `transform: translateY(0)`
   - After transition ends (`transitionend`), clear both inline styles
4. **First render** — if the snapshot is empty (no prior rows), skip animation and render directly.

### Constraints

- No new CSS class needed; transition is applied and removed inline
- 350ms duration — snappy but readable
- Only rows whose position actually changed will animate; static rows are untouched

---

## 3. Bankroll Column

### Goal

Show each player's current balance in the leaderboard so players can see who has the most chips at a glance.

### Column order

`Player | BR | W | Wagered | Profit`

### Changes

**`js/leaderboard.js` — `initLeaderboard`**  
Add `<th title="Bankroll">BR</th>` as the second column header (after `Player`, before `W`).

**`js/leaderboard.js` — `updateLeaderboard` row render**  
Add `<td>$${fmt(p.balance || 0)}</td>` as the second cell in each row.

`balance` is already on the player Firebase node and present in `room.players` — no new reads required.

---

## Files Changed

| File | Change |
|------|--------|
| `js/ui.js` | Add `spot.dataset.uid = pid` in `renderTableState` |
| `js/chat.js` | Update `listenEmojiReactions` callback; update `spawnFloatingEmoji` signature and positioning logic |
| `js/leaderboard.js` | FLIP animation in `updateLeaderboard`; add `BR` column in `initLeaderboard` and row render |

No CSS changes required. No Firebase schema changes. No new files.
