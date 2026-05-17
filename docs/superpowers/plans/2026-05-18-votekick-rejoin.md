# Votekick / Host Kick + Rejoin Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/kick` chat command (host = instant kick, others = unanimous vote) and fix the rejoin bug that wipes player balance on refresh.

**Architecture:** Kick state lives on player nodes (`kickVote`, `kicked` fields) — no new Firebase rules needed. Host detects unanimous votes in `handleRoomUpdate` (same pattern as shuffle vote). Rejoin fix changes `joinRoom()` to skip the `set()` call when the UID already has a slot, preserving all state.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database, GitHub Pages (no build step — edits go live on push to master).

---

### Task 1: Fix `joinRoom()` — preserve state on reconnect

**Files:**
- Modify: `js/room.js` (the `joinRoom` export, lines 57–83)

The bug: `joinRoom()` always calls `set()` with `balance: room.settings.startingBalance`, wiping everything on every page load. Fix: if the player's UID already has a slot and isn't kicked, just update `connected: true`.

- [ ] **Step 1: Manual baseline — confirm the bug**

Open the live game in two tabs (or have a friend join). Note a player's balance. Refresh that player's tab. Verify their balance resets to the starting balance. This is what we're fixing.

- [ ] **Step 2: Replace `joinRoom()` in `js/room.js`**

The current function is at lines 57–83. Replace the entire function body:

```js
export async function joinRoom(code, playerName) {
  roomCode = code.trim().toUpperCase();
  const snap = await get(ref(db, `rooms/${roomCode}`));
  if (!snap.exists()) throw new Error('Room not found');
  const room = snap.val();
  const players = room.players || {};
  isHost = uid === room.hostId;

  const mySlot = players[uid];
  if (mySlot && !mySlot.kicked) {
    await update(ref(db, `rooms/${roomCode}/players/${uid}`), { connected: true });
    return room;
  }

  const activeCount = Object.values(players).filter(p => !p.kicked).length;
  if (activeCount >= 6) throw new Error('Room is full (max 6 players)');

  const activeDuringPlay = ['dealing', 'playing'].includes(room.phase);
  await set(ref(db, `rooms/${roomCode}/players/${uid}`), {
    name: playerName,
    balance: room.settings.startingBalance,
    bet: 0,
    hands: [],
    bets: [],
    handIndex: 0,
    insurance: false,
    status: activeDuringPlay ? 'sitting-out' : 'waiting',
    isHost,
    action: null,
    connected: true
  });
  return room;
}
```

Key changes from original:
- Checks `players[uid]` first — if slot exists and not kicked, update `connected: true` only and return
- Room-full count uses `.filter(p => !p.kicked)` (kicked slots don't block new players)
- Removes the old name-based `existing` lookup entirely

- [ ] **Step 3: Manual verify — rejoin preserves balance**

1. Open the game, join a room, place a bet so balance changes
2. Refresh the page
3. Confirm balance is preserved (not reset to starting balance)
4. Confirm you're back in the game with the correct state

- [ ] **Step 4: Manual verify — new player still joins cleanly**

1. Open the game in a fresh private/incognito window (new UID)
2. Join the same room with a new name
3. Confirm they appear as a new player with starting balance

- [ ] **Step 5: Commit**

```bash
git add js/room.js
git commit -m "fix: preserve player state on reconnect (UID-based rejoin)"
```

---

### Task 2: Add kick primitives to `room.js`

**Files:**
- Modify: `js/room.js` (add three new exports at the bottom)

- [ ] **Step 1: Add `kickPlayer`, `sendKickVote`, `clearKickVotes` to the bottom of `js/room.js`**

```js
export async function kickPlayer(code, targetUid) {
  await update(ref(db, `rooms/${code}/players/${targetUid}`), { kicked: true });
}

export async function sendKickVote(code, voterUid, targetUid) {
  await update(ref(db, `rooms/${code}/players/${voterUid}`), { kickVote: targetUid });
}

export async function clearKickVotes(code, playerUids) {
  const updates = {};
  for (const pid of playerUids) {
    updates[`rooms/${code}/players/${pid}/kickVote`] = null;
  }
  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/room.js
git commit -m "feat: add kickPlayer, sendKickVote, clearKickVotes to room.js"
```

---

### Task 3: Add `/kick` command to `chat.js`

**Files:**
- Modify: `js/chat.js` (import line + `handleCommand` function)

- [ ] **Step 1: Update the import line at the top of `js/chat.js`**

Current line 1:
```js
import { sendChatMessage, listenChatMessages, sendEmojiReaction, listenEmojiReactions, getRoom, sendTipRequest } from './room.js';
```

Replace with:
```js
import { sendChatMessage, listenChatMessages, sendEmojiReaction, listenEmojiReactions,
         getRoom, sendTipRequest, isHost, kickPlayer, sendKickVote, sendSystemMessage } from './room.js';
```

- [ ] **Step 2: Replace `handleCommand` in `js/chat.js`**

Current `handleCommand` (lines 60–90) only handles `/tip` and falls through to an error for everything else. Replace the entire function:

```js
async function handleCommand(text) {
  const parts = text.slice(1).trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();

  if (cmd === 'tip') {
    if (parts.length < 3) { showLocalMessage('Usage: /tip <name> <amount>'); return; }
    const amount = parseInt(parts[parts.length - 1], 10);
    if (isNaN(amount) || amount <= 0) { showLocalMessage('Invalid amount. Usage: /tip <name> <amount>'); return; }
    const targetName = parts.slice(1, -1).join(' ');
    const room = await getRoom();
    if (!room) { showLocalMessage('Could not reach room.'); return; }
    if (!['waiting', 'betting'].includes(room.phase)) { showLocalMessage('Tips are only allowed between hands.'); return; }
    const players = room.players || {};
    const me = players[playerUid];
    if (!me) { showLocalMessage('Player data not found.'); return; }
    const match = Object.entries(players).find(([pid, p]) => pid !== playerUid && p.name.toLowerCase() === targetName.toLowerCase());
    if (!match) { showLocalMessage(`No player named "${targetName}" found.`); return; }
    if (amount > me.balance) { showLocalMessage(`Insufficient balance. You have $${me.balance}.`); return; }
    await sendTipRequest(roomCode, playerUid, match[0], amount);

  } else if (cmd === 'kick') {
    const targetName = parts.slice(1).join(' ');
    if (!targetName) { showLocalMessage('Usage: /kick <name>'); return; }
    const room = await getRoom();
    if (!room) { showLocalMessage('Could not reach room.'); return; }
    if (!['waiting', 'betting'].includes(room.phase)) { showLocalMessage('Kicks are only allowed between hands.'); return; }
    const players = room.players || {};
    const match = Object.entries(players).find(([, p]) => !p.kicked && p.name.toLowerCase() === targetName.toLowerCase());
    if (!match) { showLocalMessage(`No player named "${targetName}" found.`); return; }
    const [targetUid, targetPlayer] = match;
    if (targetUid === room.hostId) { showLocalMessage('SYSTEM: Nice try, buddy'); return; }
    if (isHost) {
      await kickPlayer(roomCode, targetUid);
      await sendSystemMessage(roomCode, `${targetPlayer.name} was kicked.`);
    } else {
      await sendKickVote(roomCode, playerUid, targetUid);
      await sendSystemMessage(roomCode, `${playerName} voted to kick ${targetPlayer.name}.`);
    }

  } else {
    showLocalMessage('Unknown command. Available: /tip <name> <amount>, /kick <name>');
  }
}
```

- [ ] **Step 3: Manual verify — host kick**

1. Open game with two tabs (host + one player), game in `betting` phase
2. Host types `/kick <playerName>` in chat
3. Kicked player should get the alert: "Hahaha kicked noob (u can rejoin bro <3)"
4. Kicked player redirected to `index.html`
5. SYSTEM message in host's chat: "[name] was kicked."

- [ ] **Step 4: Manual verify — host immunity**

1. Non-host player types `/kick <hostName>`
2. Only the typing player sees: "SYSTEM: Nice try, buddy" (local message, not broadcast)
3. Nothing happens to the host

- [ ] **Step 5: Manual verify — phase restriction**

1. During `playing` phase, type `/kick <name>` in chat
2. See local error: "Kicks are only allowed between hands."

- [ ] **Step 6: Commit**

```bash
git add js/chat.js
git commit -m "feat: add /kick chat command with host kick and vote initiation"
```

---

### Task 4: Filter kicked players from table rendering

**Files:**
- Modify: `js/ui.js` (one line in `renderTableState`, around line 156)

- [ ] **Step 1: Filter kicked players from `playerEntries` in `renderTableState`**

In `js/ui.js`, find `renderTableState` (line 153). The line:
```js
const playerEntries = Object.entries(players);
```

Replace with:
```js
const playerEntries = Object.entries(players).filter(([, p]) => !p.kicked);
```

This makes kicked players invisible on the table — their spot shows as "Open" instead.

- [ ] **Step 2: Manual verify**

1. Host kicks a player during betting
2. The kicked player's spot on the table immediately shows "Open"
3. No ghost entry remains

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: hide kicked players from table rendering"
```

---

### Task 5: Kicked-client redirect + game logic filters in `game.js`

**Files:**
- Modify: `js/game.js` (multiple locations — read the file fresh before editing)

- [ ] **Step 1: Add kicked-client redirect to the `onRoomChange` callback**

In `js/game.js`, the `onRoomChange` callback starts at line 45. Add the kicked check at the very top of the callback, before `currentRoom = room`:

```js
onRoomChange(room => {
  const me = (room?.players || {})[uid];
  if (me?.kicked) {
    alert('Hahaha kicked noob (u can rejoin bro <3)');
    location.href = 'index.html';
    return;
  }
  currentRoom = room;
  // ... rest of existing callback unchanged
```

- [ ] **Step 2: Add `!p.kicked` to the betting `active` players filter in `handleRoomUpdate`**

In `js/game.js`, find this line inside the `if (room.phase === 'betting')` block (around line 111):
```js
const active = Object.values(room.players || {}).filter(p => p.status !== 'sitting-out' && p.connected !== false);
```

Replace with:
```js
const active = Object.values(room.players || {}).filter(p => !p.kicked && p.status !== 'sitting-out' && p.connected !== false);
```

- [ ] **Step 3: Add `!p.kicked` to the shuffle vote eligibility filter in `handleRoomUpdate`**

In `js/game.js`, find the shuffle vote eligible filter (around line 122):
```js
const eligible = Object.values(room.players || {}).filter(
  p => p.connected !== false && p.status !== 'sitting-out'
);
```

Replace with:
```js
const eligible = Object.values(room.players || {}).filter(
  p => !p.kicked && p.connected !== false && p.status !== 'sitting-out'
);
```

- [ ] **Step 4: Skip kicked players in `advanceFromBetting`**

In `js/game.js`, find `advanceFromBetting` (around line 278):
```js
async function advanceFromBetting(room) {
  const players = room.players || {};
  for (const [pid, p] of Object.entries(players)) {
    if (p.status !== 'ready' && p.status !== 'sitting-out') {
      await updatePlayer(pid, { status: 'sitting-out' });
    }
  }
  await setPhase('dealing');
}
```

Replace with:
```js
async function advanceFromBetting(room) {
  const players = room.players || {};
  for (const [pid, p] of Object.entries(players)) {
    if (p.kicked) continue;
    if (p.status !== 'ready' && p.status !== 'sitting-out') {
      await updatePlayer(pid, { status: 'sitting-out' });
    }
  }
  await setPhase('dealing');
}
```

- [ ] **Step 5: Add `kickVote: null` to the hand-reset loop in `playDealerHand` and skip kicked players**

In `js/game.js`, find the `setTimeout` reset block in `playDealerHand` (around line 557):
```js
setTimeout(async () => {
  for (const pid of Object.keys(players)) {
    await updatePlayer(pid, { hands: [], bets: [], handIndex: 0, bet: 0, status: 'waiting', action: null, insurance: false, shuffleVote: false });
  }
  await updateRoomField('turnDeadline', null);
  await setPhase('betting');
}, 5000);
```

Replace with:
```js
setTimeout(async () => {
  for (const [pid, p] of Object.entries(players)) {
    if (p.kicked) continue;
    await updatePlayer(pid, { hands: [], bets: [], handIndex: 0, bet: 0, status: 'waiting', action: null, insurance: false, shuffleVote: false, kickVote: null });
  }
  await updateRoomField('turnDeadline', null);
  await setPhase('betting');
}, 5000);
```

- [ ] **Step 6: Manual verify — kicked player during betting**

1. Three-player game in betting phase (host + 2 players)
2. Host kicks one player
3. Confirm game continues normally with remaining 2 players
4. Confirm Force Start / advance still works (doesn't wait for kicked player)

- [ ] **Step 7: Commit**

```bash
git add js/game.js
git commit -m "feat: kicked client redirect, filter kicked players from game logic"
```

---

### Task 6: Kick vote detection + `executeKickVote` in `game.js`

**Files:**
- Modify: `js/game.js` (add module-level flag, new function, new block in `handleRoomUpdate`)

- [ ] **Step 1: Update `game.js` import line to include `kickPlayer`, `clearKickVotes`**

Current import from `room.js` (line 1–3):
```js
import { initRoom, joinRoom, onRoomChange, writePlayerAction, uid, roomCode, isHost,
         setPhase, setCurrentTurn, dealCards, updatePlayer, updateAllBalances, updateRoomField, getRoom,
         setupConnectionMonitoring, listenPendingTips, removeTipEntry, sendSystemMessage } from './room.js';
```

Replace with:
```js
import { initRoom, joinRoom, onRoomChange, writePlayerAction, uid, roomCode, isHost,
         setPhase, setCurrentTurn, dealCards, updatePlayer, updateAllBalances, updateRoomField, getRoom,
         setupConnectionMonitoring, listenPendingTips, removeTipEntry, sendSystemMessage,
         kickPlayer, clearKickVotes } from './room.js';
```

- [ ] **Step 2: Add `kickingPlayer` module-level flag**

In `js/game.js`, find the module-level flags near the top (around line 21–28, where `shufflingShoe` is declared):
```js
let shufflingShoe = false;
```

Add immediately after it:
```js
let kickingPlayer = false;
```

- [ ] **Step 3: Add `executeKickVote` function**

Add this function in `js/game.js` after `executeShuffleShoe` (around line 306):

```js
async function executeKickVote(targetUid, targetName, room) {
  if (kickingPlayer) return;
  kickingPlayer = true;
  try {
    await kickPlayer(roomCode, targetUid);
    const nonKickedUids = Object.entries(room.players || {})
      .filter(([pid, p]) => !p.kicked && pid !== targetUid)
      .map(([pid]) => pid);
    await clearKickVotes(roomCode, nonKickedUids);
    await sendSystemMessage(roomCode, `${targetName} was kicked by vote.`);
  } finally {
    kickingPlayer = false;
  }
}
```

- [ ] **Step 4: Add kick vote detection block to `handleRoomUpdate`**

In `js/game.js`, inside `handleRoomUpdate`, add this block after the `renderShuffleVoteButton(room)` call (around line 104), before the `if (room.phase !== 'betting')` line:

```js
if (isHost && ['waiting', 'betting'].includes(room.phase) && !kickingPlayer) {
  const players = room.players || {};
  const hostId = room.hostId;
  const voteMap = {};
  for (const [pid, p] of Object.entries(players)) {
    if (!p.kicked && pid !== hostId && p.connected !== false && p.kickVote) {
      if (!voteMap[p.kickVote]) voteMap[p.kickVote] = [];
      voteMap[p.kickVote].push(pid);
    }
  }
  for (const [targetUid, voters] of Object.entries(voteMap)) {
    const target = players[targetUid];
    if (!target || target.kicked) continue;
    const eligible = Object.entries(players).filter(
      ([pid, p]) => !p.kicked && pid !== hostId && p.connected !== false && pid !== targetUid
    );
    if (eligible.length > 0 && voters.length === eligible.length) {
      executeKickVote(targetUid, target.name, room);
      break;
    }
  }
}
```

- [ ] **Step 5: Manual verify — unanimous vote kick (3+ players)**

Setup: 4-player game (host, A, B, C) in betting phase. Goal: vote-kick player B.

1. Player A types `/kick B` → chat shows "A voted to kick B." — no kick yet
2. Player C types `/kick B` → chat shows "C voted to kick B."
3. Vote is now 2/2 eligible (A and C, excluding host and target B) → kick fires
4. B sees alert "Hahaha kicked noob (u can rejoin bro <3)" and gets redirected
5. Chat shows "B was kicked by vote."
6. B's spot on the table shows "Open"

- [ ] **Step 6: Manual verify — vote resets between hands**

1. Player A votes to kick B (1/2, no kick)
2. Hand completes normally (resolution → betting)
3. After reset, Player A's `kickVote` field is cleared
4. Player A would need to re-type `/kick B` to vote again

- [ ] **Step 7: Manual verify — unanimous with 2 total players (host + 1)**

With only host + one other player, the other player has no one to vote with — the eligible set for any target is empty (only non-host, non-target players). The vote can never fire. Only the host can kick in this scenario. Confirm: non-host in a 2-player room types `/kick host` → "Nice try, buddy". No other kick path exists for non-host.

- [ ] **Step 8: Commit**

```bash
git add js/game.js
git commit -m "feat: unanimous kick vote detection and executeKickVote"
```

---

### Task 7: Push to master and verify live

- [ ] **Step 1: Push**

```bash
git push origin master
```

GitHub Pages deploys automatically. Wait ~60 seconds.

- [ ] **Step 2: Smoke test live site**

Run the full manual test sequence from Tasks 3–6 on the live site at https://eloheavenjoe-cyber.github.io/blackjack/:

1. Rejoin preserves balance (refresh mid-game)
2. Host `/kick` works (instant kick, alert, redirect, spot clears)
3. Host immunity message
4. Phase restriction (no kick during playing)
5. Unanimous vote kick with 3+ players
6. Kicked player can rejoin as fresh player
7. Vote resets between hands
