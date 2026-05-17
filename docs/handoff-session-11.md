# Handoff Summary — Session 11

## Project
Local: `C:\Users\Faber\Projects\Blackjack`
Live: https://eloheavenjoe-cyber.github.io/blackjack/
Repo: https://github.com/eloheavenjoe-cyber/blackjack (master, auto-deploys via GitHub Pages)

---

## What Was Done This Session

### 1. Removed donate system + added `/tip` chat command (commit `1d4882f`)

**Why the old donate was broken:** `donate.js` used `runTransaction` on the recipient's balance node. Firebase rules only allow a player to write to their own `players/$uid` node, so the credit transaction failed for all non-host clients.

**Architecture:**
- `/tip <name> <amount>` typed in chat is intercepted by `chat.js` before sending to Firebase
- Name matching: last token = amount, everything between `/tip` and amount = name (joined with spaces, case-insensitive)
- Phase restriction: only allowed during `waiting` or `betting`
- Validation: player exists, amount is positive integer, tipper has sufficient balance — all local, using `getRoom()` for fresh data
- On error: local-only bold-red message in chat (only the tipper sees it)
- On success: pushes `{ fromUid, toUid, amount }` to `rooms/${roomCode}/pendingTips`

**Host processing:**
- Host attaches `listenPendingTips` (`onChildAdded`) on game init
- For each tip: `getRoom()` → validate (tipper and recipient still exist, balance still sufficient) → `removeTipEntry` → `updateAllBalances` (both players in one `update` call) → `sendSystemMessage`
- `sendSystemMessage` posts `{ uid: 'system', name: 'SYSTEM', text, ts }` to `rooms/${roomCode}/chat`
- SYSTEM messages render bold red in chat (`.chat-msg-system` class in `chat.css`)

**Files changed:**
- `js/donate.js` — deleted
- `game.html` — removed `#btn-donate` hud-item div, moved `margin-left:auto` to mute button div
- `js/game.js` — removed donate listener + `showDonatePanel`, added `listenPendingTips` host block, added 3 new imports from room.js
- `js/room.js` — added `remove` to Firebase imports; added exports: `sendTipRequest`, `listenPendingTips`, `removeTipEntry`, `sendSystemMessage`
- `js/chat.js` — added `getRoom`/`sendTipRequest` imports; added `handleCommand`, `showLocalMessage` closures inside `initChat`; updated `appendMessage` to detect `uid === 'system'` and apply `.chat-msg-system`
- `css/hud.css` — removed `#donate-panel` and `#donate-overlay` blocks
- `css/chat.css` — added `.chat-msg-system { color: #e53935; font-weight: bold; }`
- `firebase-rules.json` — added `pendingTips.$tipId: ".write": "auth !== null"`
- Firebase rules deployed: `npx firebase-tools deploy --only database`

### 2. Arc geometry tweak + other committed files (commit `30bf448`)

- `css/table.css` — arc radius updated from r=585 to r=610; all 6 player spot positions recalculated
- `assets/dealer-alien.png` — updated image
- `docs/superpowers/plans/2026-05-17-shuffle-shoe.md` — added
- `docs/superpowers/specs/2026-05-17-shuffle-shoe-design.md` — added

---

## Key Architecture Reminders
- `player.bet` = original betting-phase bet, never mutated during play
- `player.bets[]` = per-hand array, updated by doubles/splits
- Always `getRoom()` for fresh data in `playDealerHand` — the room arg is stale
- New room-level Firebase fields → need `.write` rule + `npx firebase-tools deploy --only database`
- Player-level fields (`connected`, `shuffleVote`, `kicked`) → covered by existing `players/$playerId` rule
- `DEALER_OPTIONS` in `settings.js` is the single source of truth for dealer names and image filenames
- `/tip` processing only runs on the host client — if host disconnects, pending tips queue up and process when host reconnects and re-attaches the listener

---

## Feature Backlog — Updated

**Tier 1:**
- 🔲 Votekick / host kick (use `kicked: true` flag on player node, separate from `connected`)

**Tier 2:**
- Lucky Lucky side bet
- Lobby music player

**Tier 3 — Polish:**
- ✅ Host-selectable dealer avatars (session 10)
- ✅ Remove donate + add `/tip` (session 11)
- 🔲 Custom player titles (10 titles, trigger conditions TBD)
- 🔲 UI redesign (needs dedicated session with mockups)
- 🔲 `chat_notify.wav` (drop into `assets/sounds/`)

**Tier 4 — Complex:**
- Insurance (full spec in Session 5 handoff, `canInsure()` in `engine.js`)
