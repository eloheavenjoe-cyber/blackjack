# Stale Room Cleanup Design

**Date:** 2026-05-20  
**Status:** Approved

## Overview

Old rooms accumulate in Firebase indefinitely. On each new room creation, scan all existing rooms and delete any that are older than 2.5 hours AND have no connected players. Rooms with active players are never deleted regardless of age.

---

## Data Layer

### New Firebase field: `createdAt`

- **Type:** integer (Unix milliseconds from `Date.now()`), room-level, host-write
- **Written:** once, at room creation in `createRoom()` in `room.js`
- **Purpose:** Determines room age for staleness check

Old rooms with no `createdAt` field are treated as infinitely old (age = `Infinity`) — eligible for deletion immediately if no connected players.

**Firebase rule** — same host-write pattern as `roundCount`, `shoeRoundCount`, etc.:
```json
"createdAt": {
  ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()"
}
```

---

## Cleanup Logic

### `cleanupStaleRooms()` — private function in `room.js`

Not exported. Called at the top of `createRoom()` before writing the new room.

```js
async function cleanupStaleRooms() {
  const STALE_MS = 9_000_000; // 2.5 hours
  const snap = await get(ref(db, 'rooms'));
  if (!snap.exists()) return;
  const deletions = {};
  snap.forEach(child => {
    const room = child.val();
    const age = room.createdAt ? Date.now() - room.createdAt : Infinity;
    if (age < STALE_MS) return;
    const hasConnected = Object.values(room.players || {}).some(p => p.connected === true);
    if (hasConnected) return;
    deletions[`rooms/${child.key}`] = null;
  });
  if (Object.keys(deletions).length > 0) await update(ref(db), deletions);
}
```

**Key behaviors:**
- Reads all rooms in one `get()` — only runs on room creation, not per-render
- Deletes all stale rooms in a single `update()` multi-write (no loop of individual deletes)
- Rooms with any `connected: true` player are skipped regardless of age
- Old rooms with no `createdAt` get `Infinity` age → eligible for deletion if no connected players

### Error handling

`cleanupStaleRooms()` is called inside a `try/catch` in `createRoom()`. Cleanup failure does NOT block room creation — log the error and continue.

```js
export async function createRoom(playerName, settings) {
  try { await cleanupStaleRooms(); } catch (e) { console.warn('Cleanup failed:', e); }
  // ... existing room creation logic ...
}
```

---

## Firebase Rules Changes

Two changes to `firebase-rules.json`. Both must be deployed together with `npx firebase-tools deploy --only database`.

### 1. `createdAt` field rule

Add alongside other host-write fields:
```json
"createdAt": {
  ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()"
}
```

### 2. Room-level deletion rule

Replace the existing `".write": false` at `$roomCode` level with a condition that allows authenticated users to delete (write `null`) but not write arbitrary top-level data:

```json
"$roomCode": {
  ".read": true,
  ".write": "!newData.exists() && auth !== null",
  ...existing field rules unchanged...
}
```

This means:
- Any logged-in user can delete any room node (write `null`)
- No one can write arbitrary top-level room data (field-level rules still control that)
- Existing field rules (`phase`, `currentTurn`, `players`, etc.) are unaffected

---

## Scope

- Changes to `js/room.js` only (new private function + one field in `createRoom()`)
- `firebase-rules.json` — two additions, one modification
- No UI changes
- No changes to any other JS file
