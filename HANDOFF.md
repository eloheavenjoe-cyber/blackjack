# Handoff Summary — Session 10

## Project
Local: `C:\Users\Faber\Projects\Blackjack`
Live: https://eloheavenjoe-cyber.github.io/blackjack/
Repo: https://github.com/eloheavenjoe-cyber/blackjack (master, auto-deploys via GitHub Pages)

---

## What Was Done This Session

### 1. Fixed emoji float visibility bug (commit `ad9ed54`)

**Root cause:** `listenEmojiReactions` in `room.js` filtered emoji events with `val.ts > afterTs` where `afterTs = Date.now()` on each client at join time. When the sender's clock was even 1ms behind the receiver's, the event was silently dropped — so emoji floats only appeared for the clicker.

**Fix:** Replaced the client-side timestamp filter with Firebase push-key ordering.
- Added `query`, `orderByKey`, `startAfter`, `limitToLast` to the Firebase import in `room.js`
- `listenEmojiReactions` now async: does a `get(limitToLast(1))` at join time to find the last push key, then attaches `onChildAdded` with `startAfter(lastKey)` (two-branch: if no events exist, attaches plain `ref` with no filter)
- Removed `initTs` argument from the call site in `chat.js`
- **Note:** The handoff's proposed sentinel `'0'` was wrong — Firebase push keys start with `-` (ASCII 45 < 48 for `'0'`), so `startAfter('0')` would never fire. Two-branch approach avoids the sentinel problem entirely.

---

### 2. Host-selectable dealer avatars (commits `b533135`–`1ae2712`)

**Architecture:**
- `DEALER_OPTIONS` array exported from `js/settings.js`: 6 entries `{ name, file }` — single source of truth for both dropdown labels and image filenames
- `dealerAvatar: 0` added to `DEFAULT_SETTINGS`, validation added to `validateSettings`
- Lobby: `DEALER_OPTIONS` imported into `lobby.js`, new `dealerAvatar` select row added to `renderSettingsForm` (host-editable, non-host read-only via existing pattern)
- Game: `DEALER_OPTIONS` imported into `game.js`, `#dealer-img` src updated in `onRoomChange` callback after `handleRoomUpdate`. Null-guarded: `const dealerImg = document.getElementById('dealer-img'); if (dealerImg) dealerImg.src = \`assets/${file}\``
- `game.html`: added `id="dealer-img"` to avatar img, removed hardcoded `src`

**Dealers:** Happy Merchant (0), Happy Piggy (1), Happy China (2), Happy Alien (3), Happy Wife (4), Happy Muz (5)

**Image files:** `assets/dealer-merchant.png` through `assets/dealer-muz.png` — user provided and committed. Old `assets/dealer-avatar.png` and `assets/dealer-avatar1.png` deleted.

---

## In Progress — Brainstorming Started, Not Yet Specced

### Remove donate system + add chat command system with `/tip`

**Donate system to remove:**
- `js/donate.js` — delete file
- `game.html` line 53: remove `<button id="btn-donate">`
- `js/game.js` line 74: remove `btn-donate` event listener
- `js/game.js` lines 604–605: remove `showDonatePanel` function
- `css/hud.css`: remove `#donate-panel` and `#donate-overlay` styles

**Why removing it:** The `runTransaction` approach in `donate.js` writes directly to the recipient's Firebase balance node. Non-host clients can't write to another player's node (Firebase rules restrict player writes to own uid), so the feature only worked for the host.

**Chat command system (`/tip`):**
- User types `/tip <name> <amount>` in the chat input
- Chat module intercepts messages starting with `/` before sending to Firebase
- On success: a SYSTEM message is posted to the chat: `SYSTEM: [tipper] tipped [recipient] $[amount]!`
- On error (unknown player, insufficient funds, etc.): system message visible only to the sender

**Brainstorming paused at this question (answer before continuing):**

> Does `/tip` actually transfer real chips from the tipper's balance, or is it just a cosmetic announcement in chat with no balance effect?

This is the key design fork — it determines whether `/tip` needs Firebase balance writes (and how to handle the permissions problem that broke the old donate system) or is purely a cosmetic chat event.

---

## Key Architecture Reminders
- `player.bet` = original betting-phase bet, never mutated during play
- `player.bets[]` = per-hand array, updated by doubles/splits
- Always `getRoom()` for fresh data in `playDealerHand` — the room arg is stale
- New room-level Firebase fields → need `.write` rule + `npx firebase-tools deploy --only database`
- Player-level fields (`connected`, `shuffleVote`, `kicked`) → covered by existing rule, no redeploy
- `DEALER_OPTIONS` in `settings.js` is the single source of truth for dealer names and image filenames

---

## Feature Backlog — Updated

**Tier 1:**
- 🔲 Votekick / host kick (use `kicked: true` flag on player node, separate from `connected`)

**Tier 2:**
- Lucky Lucky side bet
- Lobby music player

**Tier 3 — Polish:**
- ✅ Host-selectable dealer avatars (done this session)
- 🔲 Custom player titles (10 titles, trigger conditions TBD)
- 🔲 UI redesign (needs dedicated session with mockups)
- 🔲 `chat_notify.wav` (drop into `assets/sounds/`)

**Tier 4 — Complex:**
- Insurance (full spec in Session 5 handoff, `canInsure()` in `engine.js`)

**In progress / next:**
- Remove donate system + add `/tip` chat command (brainstorming paused — see above)
