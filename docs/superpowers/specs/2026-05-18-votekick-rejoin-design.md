# Design: Votekick / Host Kick + Rejoin Fix

Date: 2026-05-18

## Overview

Two independent features:

1. **Votekick / Host Kick** — players can be removed from the game via host command or unanimous player vote
2. **Rejoin Fix** — players who refresh or accidentally close the tab reconnect with their balance and hand state intact

---

## Feature 1: Votekick / Host Kick

### Constraints

- Kicking restricted to `waiting` and `betting` phases only (never mid-hand)
- Host is immune to votekick — any attempt prints `"SYSTEM: Nice try, buddy"` locally
- Non-host `/kick <name>` initiates or adds to a vote; vote must be unanimous among eligible voters
- Host `/kick <name>` is an immediate kick, no vote required
- Kicked players can rejoin (the kick is a forced exit, not a permanent ban)
- Kick votes reset between hands

### Data Model

Two new fields on each `players/${uid}` node. No new Firebase rules required — both are covered by the existing `players/$playerId` write rule (`auth !== null && ($playerId === auth.uid || hostId === auth.uid)`).

| Field | Type | Meaning |
|-------|------|---------|
| `kickVote` | `string \| null` | UID of the player this player is voting to kick |
| `kicked` | `true \| undefined` | Set when a player is kicked out |

### Command Parsing (`chat.js`)

`/kick <name>` added to `handleCommand` alongside `/tip`. Validation order:

1. Phase check — if not `waiting` or `betting`: local error `"Kicks are only allowed between hands."`
2. Target lookup — case-insensitive name match, excludes self
3. No match: local error `"No player named X found."`
4. Target is host: local message `"SYSTEM: Nice try, buddy"` — nothing else
5. Kicker is host: call `kickPlayer(roomCode, targetUid)` + `sendSystemMessage("[name] was kicked.")`
6. Kicker is non-host: call `sendKickVote(roomCode, uid, targetUid)` + `sendSystemMessage("[voter] voted to kick [target].")`

`isHost` and `sendSystemMessage` are already exported from `room.js` and available for import in `chat.js`.

### New `room.js` Exports

**`kickPlayer(code, targetUid)`**
Sets `kicked: true` on the target's player node. Used by both the host direct kick (from `chat.js`) and the unanimous vote executor (from `game.js`).

**`sendKickVote(code, voterUid, targetUid)`**
Writes `kickVote: targetUid` to the voter's own player node via `update()`.

### Vote Detection (`game.js` `handleRoomUpdate`)

Host only. Placed at the top level of `handleRoomUpdate` (not inside the existing `if (room.phase === 'betting')` block where shuffle vote lives), guarded by `['waiting', 'betting'].includes(room.phase)` and the `!kickingPlayer` flag.

```
eligible voters = players where:
  connected !== false
  AND !kicked
  AND uid !== hostId
  AND uid !== targetUid
```

For each unique non-null `kickVote` target: count eligible voters who voted for that target. If count > 0 and count === eligible.length → execute kick.

### Kick Execution (`game.js`)

`executeKickVote(targetUid, targetName)` — host only, guarded by `kickingPlayer` boolean flag to prevent double-fire on rapid room updates (same pattern as `shufflingShoe` flag for shuffle shoe).

1. `kickPlayer(roomCode, targetUid)` — sets `kicked: true`
2. Clear `kickVote: null` on all non-kicked players in one `update()` call
3. `sendSystemMessage(roomCode, "[name] was kicked by vote.")`

### Kicked Client Detection (`game.js` `onRoomChange`)

Checked before any other room update handling:

```js
const me = (room.players || {})[uid];
if (me?.kicked) {
  alert("Hahaha kicked noob (u can rejoin bro <3)");
  location.href = 'index.html';
  return;
}
```

### Vote Reset Between Hands

In `playDealerHand`'s betting-reset block, add `kickVote: null` to the existing per-player field wipe alongside `shuffleVote: false`.

### Filtering Kicked Players from Game Logic

Everywhere `room.players` is iterated, add `!p.kicked` to filters:

| Location | Change |
|----------|--------|
| `handleRoomUpdate` — betting `active` players check | Add `!p.kicked` |
| `handleRoomUpdate` — shuffle vote eligibility | Add `!p.kicked` |
| `handleRoomUpdate` — kick vote eligibility | Already specced as excluding kicked |
| `advanceFromBetting` — sitting-out loop | Skip kicked players |
| `ui.js` `renderTableState` | Don't render spot for `p.kicked === true` |
| `joinRoom()` — room full count | `filter(p => !p.kicked).length` |

---

## Feature 2: Rejoin Fix

### The Bug

`joinRoom()` always calls `set()` with `balance: room.settings.startingBalance`, wiping the player's balance on every page load. The name-based `existing` lookup only bypasses the room-full check — it does not preserve any state.

### Identity Model

**Same UID = same player.** Firebase Anonymous Auth sessions persist in `localStorage`, so a refresh or accidental tab close on the same device returns the same UID. This covers the vast majority of real disconnect scenarios. Cross-device and cleared-storage cases result in a fresh join (the game's popup message "u can rejoin bro" makes this acceptable).

### Fixed `joinRoom()` Logic

Three-branch check replacing the current name-based lookup:

**Branch 1 — UID exists, not kicked:**
Player is reconnecting. Call `update({ connected: true })` only and return. Preserves balance, hands, bets, status, action — everything.

**Branch 2 — UID exists, kicked:**
Player was kicked and is coming back. Fall through to fresh join. They get a clean slate (starting balance, no hands).

**Branch 3 — UID not found:**
Genuine new player. Existing fresh-join behavior applies. Room full check counts only non-kicked players: `Object.values(players).filter(p => !p.kicked).length >= 6`.

The name-based `existing` lookup is removed entirely.

### Behavior After Reconnect

| Phase at reconnect | Result |
|--------------------|--------|
| `waiting` | Restores to `waiting` status, balance intact |
| `betting` | Restores bet and status, can continue betting |
| `playing` | Restores hands/bets/handIndex/status — if it's their turn, action buttons render |
| `resolution` | Sees their outcome, balance will be updated by host's payout logic |

`setupConnectionMonitoring` is unchanged — it already re-attaches the `onDisconnect` handler and sets `connected: true` on reconnect via `.info/connected`.

---

## Files Changed

| File | Changes |
|------|---------|
| `js/chat.js` | Add `/kick` to `handleCommand`; import `isHost`, `kickPlayer`, `sendKickVote`, `sendSystemMessage` from `room.js` |
| `js/room.js` | Add `kickPlayer`, `sendKickVote` exports; fix `joinRoom()` with UID-based reconnect logic |
| `js/game.js` | Add kick vote detection in `handleRoomUpdate`; add `executeKickVote()`; add kicked-client redirect in `onRoomChange`; add `kickVote: null` to hand reset; filter `!p.kicked` in all player loops |
| `js/ui.js` | Filter `p.kicked` in `renderTableState` |
| `firebase-rules.json` | No changes required |

No Firebase rules deployment needed.
