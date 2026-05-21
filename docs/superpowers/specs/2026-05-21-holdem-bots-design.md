# Texas Hold'em Bots — Design Spec

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Add bot players to Texas Hold'em. Bots are host-controlled via `/addbot` and `/removebot <name>` (already in `chat.js`, just needs callbacks wired). Two modes — passive and aggro — toggled globally via `/bot passive` and `/bot aggro`. Default is passive.

---

## Architecture

Four files change; one new file is created.

### New: `js/holdem-bot.js`

Pure logic module. No Firebase, no DOM. Single export:

```js
getHoldemBotAction(holeCards, communityCards, room, player, mode)
  → { type: 'fold'|'check'|'call'|'raise', amount?: number }
```

Imports `pickBotName(usedNames)` from `bot.js` (already exported) to pick bot names without duplicates.

#### Preflop hand classification

Classify hole cards into four tiers. Position is not tracked — bots play hand strength only.

| Tier | Examples | Passive | Aggro |
|------|----------|---------|-------|
| 1 — Premium | AA, KK, QQ, JJ, AKs, AKo | Call/raise to 3×BB | Raise to 3×BB always |
| 2 — Strong | TT-77, AQs, AJs, KQs, AQo | Call | Raise to 3×BB |
| 3 — Playable | 66-22, suited connectors (JTs–54s), AXs, KJs, QJs | Call/limp | Call |
| Trash | Everything else | Fold (check if BB and free) | Fold (check if BB and free) |

Suited = same suit. Connectedness checked by rank adjacency (`RANK_VALUE` from holdem-engine.js).

#### Postflop decision

Call `evaluateHand(holeCards, communityCards)` from `holdem-engine.js`. Map result rank:

| Hand rank | Hand name | Passive | Aggro |
|-----------|-----------|---------|-------|
| 5–8 | Flush through Royal Flush | Call any bet | Raise (pot-sized, capped at stack) |
| 3–4 | Trips / Straight | Call any bet | Raise (½ pot) |
| 2 | Two Pair | Call if pot odds ≤ 40% | Call any bet |
| 1 | One Pair | Call if pot odds ≤ 40% | Call if pot odds ≤ 40% |
| 0 | High Card | Check if free, else fold | Check if free, else fold |

**Pot odds check:** `callAmount / (pot + callAmount)`. Fold if ratio exceeds 40% and hand rank < 2.

**Raise sizing:**
- 3×BB raise preflop (clamped to stack)
- ½ pot postflop for aggro Tier 3–4 (`Math.floor(pot / 2)`, clamped to `[currentBet + minRaise, stack]`)
- Pot-sized postflop for aggro Tier 5–8 (clamped same)
- Always fall back to call if raise amount would be less than `currentBet + minRaise`

---

### `js/holdem-game.js` changes

**Module-level additions:**
```js
const botUids = new Set();   // UIDs of bot players in this room
let botMode = 'passive';     // 'passive' | 'aggro'
```

**`addHoldemBot(room)`** (host only):
1. Check active player count < 7
2. Pick name via `pickHoldemBotName()`, generate fake UID (`'bot_' + Math.random().toString(36).slice(2, 9)`)
3. Find next free seat (0–6) not in `room.players`
4. Call `addHoldemBotPlayer(roomCode, botUid, name, room.settings.startingStack)` (new room.js export)
5. Add to `botUids`
6. If hand is in progress (`phase !== 'waiting'`): bot joins as `sittingOut: true`, `ready: false` — enters next hand automatically
7. If `phase === 'waiting'`: write `ready: true` so bot counts toward the start condition

**`removeHoldemBot(name, room)`** (host only):
1. Find bot by name in `room.players`
2. Write `sittingOut: true` to sit them out; they'll be excluded from next hand
3. After 500ms write `kicked: true` to remove from render
4. Remove from `botUids`
5. Return `false` if not found (chat.js already shows error on false)

**Bot turn intercept in `checkStreetProgress`:**

After the existing action-processing loop, before `getNextActionSeat`:

```
if actionSeat belongs to a botUid AND phase is preflop/flop/turn/river:
  delay 1000–2500ms
  fetch hole cards via getHoleCardsOnce(botUid)
  call getHoldemBotAction(holeCards, communityCards, room, player, botMode)
  write action to players/${botUid}/action
  return  ← let next snapshot trigger normal applyAction path
```

Dedup guard: check `room.players[actionPid]?.action` — if already non-null, the action was written last cycle; skip the intercept and let the existing action-processing loop above handle it via `applyAction`. No extra tracking variable needed.

**`initChat` call updated:**
```js
initChat(roomCode, uid, name, {
  onAddBot: addHoldemBot,
  onRemoveBot: removeHoldemBot,
  onBotMode: (mode) => { botMode = mode; }
});
```

---

### `js/chat.js` changes

Add `/bot` command to `handleCommand`:

```
} else if (cmd === 'bot') {
  if (!isHost) { showLocalMessage('Only the host can change bot mode.'); return; }
  const arg = parts[1]?.toLowerCase();
  if (arg !== 'passive' && arg !== 'aggro') { showLocalMessage('Usage: /bot passive|aggro'); return; }
  if (!onBotMode) { showLocalMessage('Bot mode not available.'); return; }
  onBotMode(arg);
  await sendSystemMessage(roomCode, `Bot mode set to ${arg}.`);
```

Add `onBotMode` to the destructured callback options in `initChat` signature. Update the unknown-command help text to include `/bot passive|aggro`.

---

### `js/room.js` changes

Add `addHoldemBotPlayer(code, botUid, name, stack)`:

```js
export async function addHoldemBotPlayer(code, botUid, name, stack) {
  const snap = await get(ref(db, `rooms/${code}/players`));
  const players = snap.val() || {};
  const takenSeats = Object.values(players).map(p => p.seat);
  const seat = [0,1,2,3,4,5,6].find(s => !takenSeats.includes(s));
  if (seat === undefined) throw new Error('Room is full');
  await set(ref(db, `rooms/${code}/players/${botUid}`), {
    name, seat, stack,
    streetBet: 0, totalBet: 0,
    folded: false, allIn: false,
    sittingOut: false, acted: false,
    ready: true, isBot: true, connected: true
  });
}
```

---

## Firebase rules

No new rules needed. Bot players write to `players/${botUid}/action` — covered by the existing `players/$playerId` write rule since the host is the one writing on the bot's behalf using the host's auth context. The host's auth UID is `auth.uid`, not the fake bot UID, so we must confirm the existing rule allows host to write to any player slot.

Confirmed: the `players/$playerId` rule allows host to write to any player slot (`data.parent().parent().child('hostId').val() === auth.uid`). Writing bot actions directly to `players/${botUid}/action` from the host is safe.

---

## Bot names

Reuse `pickBotName(usedNames)` from `bot.js` — already exported. Import it in `holdem-game.js`:
```js
import { pickBotName } from './bot.js';
```

Pass current player names from `room.players` when calling it so no duplicate names appear at the table.

---

## Timing & feel

- Bot action delay: `1000 + Math.random() * 1500` ms (1–2.5s)
- No emote system for holdem bots in this feature (can be added later)
- Bots do not go broke and get kicked automatically in this version — `sittingOut` is set when stack hits 0 (already handled by existing showdown logic)

---

## Out of scope

- Per-bot mode (all bots share one global mode)
- Bot emotes / reactions
- Bot auto-removal on broke (handled by existing showdown `sittingOut` logic)
- Position-aware strategy (UTG vs BTN raises)
- Bluffing
