# Stale Room Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically delete stale rooms (older than 2.5 hours, no connected players) each time a new room is created.

**Architecture:** A private `cleanupStaleRooms()` function in `room.js` reads all rooms, identifies stale ones (via `createdAt` timestamp + connected player check), and deletes them in a single Firebase multi-write before the new room is created. Firebase rules are updated to allow authenticated users to delete room nodes and hosts to write `createdAt`.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database, GitHub Pages.

---

## File Map

| File | Change |
|------|--------|
| `js/room.js` | Add `cleanupStaleRooms()` private function; add `createdAt: Date.now()` to `createRoom()`; call cleanup at top of `createRoom()` |
| `firebase-rules.json` | Add `createdAt` host-write rule; change `$roomCode` `.write` from `false` to allow deletion by any auth user |

---

## Task 1: Update Firebase rules and deploy

**Files:**
- Modify: `firebase-rules.json:6` (room-level `.write`)
- Modify: `firebase-rules.json:48-50` (add `createdAt` after `shoeRoundCount`)

- [ ] **Step 1: Change the room-level `.write` rule to allow deletion**

In `firebase-rules.json`, replace line 6:

```json
// Before
".write": false,
```

With:

```json
// After
".write": "!newData.exists() && auth !== null",
```

This allows any authenticated user to delete a room node (write `null`) while leaving all field-level write rules unchanged. Writes that are not deletions (`newData.exists()` is true) still fall through to the field-level rules.

- [ ] **Step 2: Add `createdAt` field rule**

In `firebase-rules.json`, after the `shoeRoundCount` block (after line 50, before `"chat"`), insert:

```json
"createdAt": {
  ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()"
},
```

The full `shoeRoundCount` + `createdAt` block should look like:

```json
"shoeRoundCount": {
  ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()"
},
"createdAt": {
  ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()"
},
```

- [ ] **Step 3: Deploy the rules**

```bash
cd "C:/Users/Faber/Projects/Blackjack"
npx firebase-tools deploy --only database
```

Expected output: `✔  Database: rules deploy complete`

- [ ] **Step 4: Commit**

```bash
git add firebase-rules.json
git commit -m "fix: allow room deletion + add createdAt rule for stale room cleanup"
```

---

## Task 2: Add `cleanupStaleRooms()` and `createdAt` to `room.js`

**Files:**
- Modify: `js/room.js:33-61` (`createRoom` function + insert new function before it)

- [ ] **Step 1: Add `cleanupStaleRooms()` before `createRoom()`**

In `js/room.js`, insert the following function between `generateRoomCode()` (ends at line 31) and `createRoom()` (starts at line 33):

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

Note: `get`, `ref`, and `update` are already imported at line 2 of `room.js` — no new imports needed.

- [ ] **Step 2: Add `createdAt` to `createRoom()` and call cleanup**

In `js/room.js`, replace the current `createRoom` function (lines 33–61):

```js
// Before
export async function createRoom(playerName, settings) {
  roomCode = generateRoomCode();
  isHost = true;
  await update(ref(db), {
    [`rooms/${roomCode}/hostId`]: uid,
    [`rooms/${roomCode}/phase`]: 'waiting',
    [`rooms/${roomCode}/kickVotesEnabled`]: true,
    [`rooms/${roomCode}/settings`]: settings,
    [`rooms/${roomCode}/dealer`]: { hand: [], hiddenCard: null },
    [`rooms/${roomCode}/players/${uid}`]: {
      name: playerName,
      balance: settings.startingBalance,
      bet: 0,
      hands: [],
      bets: [],
      handIndex: 0,
      insurance: false,
      status: 'waiting',
      isHost: true,
      action: null,
      connected: true,
      winStreak: 0,
      handsWon: 0,
      totalWagered: 0,
      sessionProfit: 0
    }
  });
  return roomCode;
}
```

With:

```js
// After
export async function createRoom(playerName, settings) {
  try { await cleanupStaleRooms(); } catch (e) { console.warn('Cleanup failed:', e); }
  roomCode = generateRoomCode();
  isHost = true;
  await update(ref(db), {
    [`rooms/${roomCode}/hostId`]: uid,
    [`rooms/${roomCode}/phase`]: 'waiting',
    [`rooms/${roomCode}/kickVotesEnabled`]: true,
    [`rooms/${roomCode}/settings`]: settings,
    [`rooms/${roomCode}/createdAt`]: Date.now(),
    [`rooms/${roomCode}/dealer`]: { hand: [], hiddenCard: null },
    [`rooms/${roomCode}/players/${uid}`]: {
      name: playerName,
      balance: settings.startingBalance,
      bet: 0,
      hands: [],
      bets: [],
      handIndex: 0,
      insurance: false,
      status: 'waiting',
      isHost: true,
      action: null,
      connected: true,
      winStreak: 0,
      handsWon: 0,
      totalWagered: 0,
      sessionProfit: 0
    }
  });
  return roomCode;
}
```

- [ ] **Step 3: Verify in browser**

Open the Firebase console → Realtime Database. Create a new room. Confirm:
- The new room has a `createdAt` field with a recent Unix timestamp (13 digits, e.g. `1716220000000`)
- Old rooms with no connected players and no `createdAt` (or `createdAt` older than 2.5 hours) are deleted
- Active rooms (with `connected: true` players) are NOT deleted

To force-test cleanup without waiting 2.5 hours: manually set `createdAt` on an existing empty test room to a value in the past (e.g. `1` or `0`), then create a new room and watch the test room disappear.

- [ ] **Step 4: Commit**

```bash
git add js/room.js
git commit -m "feat: auto-delete stale rooms on create (2.5h TTL, skip rooms with connected players)"
```

---

## Task 3: Push and smoke test

- [ ] **Step 1: Push to GitHub Pages**

```bash
git push origin master
```

- [ ] **Step 2: Smoke test on live site**

Open https://eloheavenjoe-cyber.github.io/blackjack/. Create a room. In Firebase console confirm `createdAt` is written on the new room. Check that the existing accumulated stale rooms were cleaned up (rooms with no `createdAt` and no connected players should be gone).
