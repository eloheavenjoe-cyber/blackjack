# Lobby Redesign + Public Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the lobby visually (gold gradient title, card-suit background, polished panels) and add an opt-in public room system where hosts can list their room publicly and players can join with one click from a live lobby list.

**Architecture:** A new `/publicRooms/${roomCode}` Firebase node holds lightweight room metadata (host name, player count, phase). The host client writes and syncs this record; a Firebase `onDisconnect` hook cleans it up automatically on disconnect. The Join tab subscribes to `/publicRooms` with `onValue` and renders live cards.

**Tech Stack:** Firebase Realtime Database, vanilla JS ES modules, CSS custom properties.

---

## File Map

| File | Change |
|---|---|
| `firebase-rules.json` | Add `/publicRooms` read + host-only write rule |
| `js/room.js` | Add 4 exports: `writePublicRoom`, `removePublicRoom`, `listenPublicRooms`, `setupPublicRoomDisconnect` |
| `index.html` | Add public toggle checkbox in create pane; add `#public-rooms-list` in join pane; update h1 with suit spans |
| `js/lobby.js` | Import new room.js exports; wire create/sync/cleanup; render public rooms; card click join |
| `css/lobby.css` | Full visual overhaul + lobby card styles |

---

## Task 1: Firebase Rules + Deploy

**Files:**
- Modify: `firebase-rules.json`

- [ ] **Step 1: Add `/publicRooms` rule**

In `firebase-rules.json`, add the `publicRooms` node after the closing `}` of the `rooms` block (before the outer closing `}`):

```json
{
  "rules": {
    "rooms": {
      ... (existing rules unchanged)
    },
    "publicRooms": {
      ".read": "auth !== null",
      "$roomCode": {
        ".write": "auth !== null && root.child('rooms').child($roomCode).child('hostId').val() === auth.uid"
      }
    }
  }
}
```

The exact edit — replace the closing of the rules object:

Old:
```json
        "kekryEvents": {
          "$eventId": {
            ".write": "auth !== null"
          }
        }
      }
    }
  }
}
```

New:
```json
        "kekryEvents": {
          "$eventId": {
            ".write": "auth !== null"
          }
        }
      }
    },
    "publicRooms": {
      ".read": "auth !== null",
      "$roomCode": {
        ".write": "auth !== null && root.child('rooms').child($roomCode).child('hostId').val() === auth.uid"
      }
    }
  }
}
```

- [ ] **Step 2: Deploy rules**

```bash
npx firebase-tools deploy --only database
```

Expected output: `✔  Deploy complete!`

- [ ] **Step 3: Commit**

```bash
git add firebase-rules.json
git commit -m "feat: add publicRooms Firebase rules"
```

---

## Task 2: room.js — New Exports

**Files:**
- Modify: `js/room.js`

All four functions use Firebase primitives already imported in room.js (`update`, `remove`, `onValue`, `fbOnDisconnect`, `ref`, `db`).

- [ ] **Step 1: Add the four exports at the bottom of `js/room.js`**

```js
export async function writePublicRoom(code, data) {
  await update(ref(db, `publicRooms/${code}`), data);
}

export async function removePublicRoom(code) {
  await remove(ref(db, `publicRooms/${code}`));
}

export function listenPublicRooms(callback) {
  return onValue(ref(db, 'publicRooms'), snap => callback(snap.val() || {}));
}

export async function setupPublicRoomDisconnect(code) {
  await fbOnDisconnect(ref(db, `publicRooms/${code}`)).remove();
}
```

- [ ] **Step 2: Verify imports already present in room.js**

Confirm the top of `js/room.js` already imports: `update`, `remove`, `onValue`, `ref` from firebase-database, and `fbOnDisconnect` (aliased from `onDisconnect`). All are present — no import changes needed.

- [ ] **Step 3: Commit**

```bash
git add js/room.js
git commit -m "feat: add public room Firebase helpers to room.js"
```

---

## Task 3: index.html — Structure Changes

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Update the h1 title to include suit spans**

Old:
```html
<h1>Blackjack</h1>
```

New:
```html
<h1><span class="suit-dark">♠</span> BLACKJACK <span class="suit-red">♥</span></h1>
```

- [ ] **Step 2: Add public room toggle in create pane**

Old:
```html
<div id="pane-create">
  <button id="btn-create" class="btn-primary">Create Room</button>
</div>
```

New:
```html
<div id="pane-create">
  <button id="btn-create" class="btn-primary">Create Room</button>
  <label class="public-toggle">
    <input type="checkbox" id="chk-public">
    Make room public
  </label>
</div>
```

- [ ] **Step 3: Add public rooms list and section label in join pane**

Old:
```html
<div id="pane-join" hidden>
  <input id="input-code" type="text" placeholder="Room code" maxlength="5" autocomplete="off" style="text-transform:uppercase">
  <button id="btn-join" class="btn-primary">Join Room</button>
</div>
```

New:
```html
<div id="pane-join" hidden>
  <input id="input-code" type="text" placeholder="Room code" maxlength="5" autocomplete="off" style="text-transform:uppercase">
  <button id="btn-join" class="btn-primary">Join Room</button>
  <p class="rooms-section-label">Public Rooms</p>
  <div id="public-rooms-list"></div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add public room toggle and lobby list container to index.html"
```

---

## Task 4: lobby.js — Public Room Create / Sync / Cleanup

**Files:**
- Modify: `js/lobby.js`

- [ ] **Step 1: Update the import line to include new room.js exports**

Old:
```js
import { initRoom, createRoom, joinRoom, onRoomChange, setPhase, uid, roomCode, updateRoomField, updateAllBalances } from './room.js';
```

New:
```js
import { initRoom, createRoom, joinRoom, onRoomChange, setPhase, uid, roomCode, updateRoomField, updateAllBalances, writePublicRoom, removePublicRoom, listenPublicRooms, setupPublicRoomDisconnect } from './room.js';
```

- [ ] **Step 2: Add `isPublicRoom` module-level variable after the existing `let lastRoom = null;`**

Old:
```js
let currentSettings = { ...DEFAULT_SETTINGS };
let lastRoom = null;
```

New:
```js
let currentSettings = { ...DEFAULT_SETTINGS };
let lastRoom = null;
let isPublicRoom = false;
```

- [ ] **Step 3: Replace the `btn-create` listener to capture the checkbox and write the public room**

Old:
```js
$('btn-create').addEventListener('click', async () => {
  const name = $('input-name').value.trim();
  if (!name) return showError('Enter your name');
  try {
    await initRoom();
    await createRoom(name, currentSettings);
    sessionStorage.setItem('playerName', name);
    showLobby(true);
  } catch (e) {
    showError(e.message);
  }
});
```

New:
```js
$('btn-create').addEventListener('click', async () => {
  const name = $('input-name').value.trim();
  if (!name) return showError('Enter your name');
  isPublicRoom = $('chk-public').checked;
  try {
    await initRoom();
    await createRoom(name, currentSettings);
    sessionStorage.setItem('playerName', name);
    if (isPublicRoom) {
      await writePublicRoom(roomCode, { hostName: name, playerCount: 1, phase: 'waiting' });
      await setupPublicRoomDisconnect(roomCode);
    }
    showLobby(true);
  } catch (e) {
    showError(e.message);
  }
});
```

- [ ] **Step 4: Replace the `btn-start` listener to remove public room before starting**

Old:
```js
$('btn-start').addEventListener('click', async () => {
  if (!roomCode) return;
  const errors = validateSettings(currentSettings);
  if (errors.length > 0) { showError(errors[0]); return; }
  await updateRoomField('settings', currentSettings);
  if (lastRoom?.players) {
    const balanceMap = {};
    for (const pid of Object.keys(lastRoom.players)) {
      balanceMap[pid] = currentSettings.startingBalance;
    }
    await updateAllBalances(balanceMap);
  }
  await setPhase('betting');
  goToGame();
});
```

New:
```js
$('btn-start').addEventListener('click', async () => {
  if (!roomCode) return;
  const errors = validateSettings(currentSettings);
  if (errors.length > 0) { showError(errors[0]); return; }
  await updateRoomField('settings', currentSettings);
  if (lastRoom?.players) {
    const balanceMap = {};
    for (const pid of Object.keys(lastRoom.players)) {
      balanceMap[pid] = currentSettings.startingBalance;
    }
    await updateAllBalances(balanceMap);
  }
  if (isPublicRoom) await removePublicRoom(roomCode);
  await setPhase('betting');
  goToGame();
});
```

- [ ] **Step 5: Update `showLobby` to sync public room on every host room change**

In `showLobby`, find the `onRoomChange` callback block and update it:

Old:
```js
  onRoomChange(room => {
    if (!room) return;
    lastRoom = room;
    renderPlayerList(room.players || {});
    if (!asHost && room.phase !== 'waiting') goToGame();
  });
```

New:
```js
  onRoomChange(room => {
    if (!room) return;
    lastRoom = room;
    renderPlayerList(room.players || {});
    if (asHost && isPublicRoom) {
      const playerCount = Object.values(room.players || {}).filter(p => !p.kicked).length;
      const hostName = (room.players || {})[uid]?.name || '';
      writePublicRoom(roomCode, { hostName, playerCount, phase: room.phase });
    }
    if (!asHost && room.phase !== 'waiting') goToGame();
  });
```

- [ ] **Step 6: Commit**

```bash
git add js/lobby.js
git commit -m "feat: wire public room create, sync, and cleanup in lobby.js"
```

---

## Task 5: lobby.js — Join Tab Public Rooms List

**Files:**
- Modify: `js/lobby.js`

- [ ] **Step 1: Add `publicRoomsUnsubscribe` module-level variable after `isPublicRoom`**

```js
let publicRoomsUnsubscribe = null;
```

- [ ] **Step 2: Update the `tab-join` click handler to start the public rooms listener**

Old:
```js
$('tab-join').addEventListener('click', () => {
  $('tab-join').classList.add('active');
  $('tab-create').classList.remove('active');
  $('pane-join').hidden = false;
  $('pane-create').hidden = true;
});
```

New:
```js
$('tab-join').addEventListener('click', () => {
  $('tab-join').classList.add('active');
  $('tab-create').classList.remove('active');
  $('pane-join').hidden = false;
  $('pane-create').hidden = true;
  if (!publicRoomsUnsubscribe) {
    publicRoomsUnsubscribe = listenPublicRooms(renderPublicRooms);
  }
});
```

- [ ] **Step 3: Add `renderPublicRooms` function before `renderPlayerList`**

```js
async function renderPublicRooms(rooms) {
  const container = $('public-rooms-list');
  if (!container) return;
  container.innerHTML = '';
  const entries = Object.entries(rooms);
  if (entries.length === 0) {
    const p = document.createElement('p');
    p.className = 'no-rooms-msg';
    p.textContent = 'No public rooms available';
    container.appendChild(p);
    return;
  }
  for (const [code, room] of entries) {
    const card = document.createElement('div');
    card.className = 'room-card';

    const hostEl = document.createElement('div');
    hostEl.className = 'room-card-host';
    hostEl.textContent = room.hostName;

    const infoEl = document.createElement('div');
    infoEl.className = 'room-card-info';

    const countEl = document.createElement('span');
    countEl.className = 'room-card-count';
    countEl.textContent = `${room.playerCount} / 6 players`;

    const phaseEl = document.createElement('span');
    const isWaiting = room.phase === 'waiting';
    phaseEl.className = 'room-card-phase ' + (isWaiting ? 'phase-waiting' : 'phase-inprogress');
    phaseEl.textContent = isWaiting ? 'Waiting' : 'In Progress';

    infoEl.appendChild(countEl);
    infoEl.appendChild(phaseEl);
    card.appendChild(hostEl);
    card.appendChild(infoEl);

    card.addEventListener('click', async () => {
      const name = $('input-name').value.trim();
      if (!name) return showError('Enter your name');
      try {
        await initRoom();
        await joinRoom(code, name);
        sessionStorage.setItem('playerName', name);
        showLobby(false);
      } catch (e) {
        showError(e.message);
      }
    });

    container.appendChild(card);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add js/lobby.js
git commit -m "feat: add public rooms list and card click join in lobby.js"
```

---

## Task 6: CSS — Full Visual Overhaul

**Files:**
- Modify: `css/lobby.css`

- [ ] **Step 1: Replace the entire contents of `css/lobby.css` with the following**

```css
body { display: flex; align-items: center; justify-content: center; min-height: 100vh; overflow: auto; }

#lobby-wrap { position: relative; width: 100vw; min-height: 100vh; display: flex; align-items: center; justify-content: center; }

#lobby-bg {
  position: fixed; inset: 0;
  background: radial-gradient(ellipse at 50% 20%, #3d2810 0%, #1a1008 60%, #0d0804 100%);
  z-index: 0;
}

#lobby-bg::before {
  content: '♠  ♥  ♦  ♣  ♠  ♥  ♦  ♣  ♠  ♥  ♦  ♣  ♠  ♥  ♦  ♣  ♠  ♥  ♦  ♣  ♠  ♥  ♦  ♣  ♠  ♥  ♦  ♣  ♠  ♥  ♦  ♣';
  position: absolute; inset: 0;
  font-size: 52px; letter-spacing: 20px; line-height: 88px;
  color: rgba(201, 168, 76, 0.04);
  word-break: break-all; overflow: hidden;
  pointer-events: none;
}

.panel {
  position: relative; z-index: 1;
  background: rgba(20, 12, 4, 0.93);
  border: 1px solid var(--clr-gold);
  border-radius: 16px;
  padding: 36px 44px;
  width: 440px;
  display: flex; flex-direction: column; gap: 16px;
  box-shadow: 0 0 40px rgba(201,168,76,0.15), 0 8px 32px rgba(0,0,0,0.6);
}

h1 {
  text-align: center;
  font-size: 2.8rem;
  letter-spacing: 6px;
  background: linear-gradient(135deg, #c9a84c 0%, #f0d882 50%, #c9a84c 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

h1 .suit-dark { -webkit-text-fill-color: #7a6a4a; background-clip: unset; }
h1 .suit-red  { -webkit-text-fill-color: #7a2828; background-clip: unset; }

h3 {
  font-size: 1rem; color: var(--clr-gold); letter-spacing: 2px;
  text-transform: uppercase; border-bottom: 1px solid rgba(201,168,76,0.3);
  padding-bottom: 6px;
}

#input-name {
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--clr-gold);
  border-radius: 0;
  padding: 8px 4px;
  font-size: 15px;
}
#input-name::placeholder { color: var(--clr-text-dim); }
#input-name:focus { outline: none; border-bottom-color: #f0d882; }

#input-code { width: 100%; }

.tab-row { display: flex; gap: 0; border: 1px solid var(--clr-gold); border-radius: 6px; overflow: hidden; }
.tab { flex: 1; padding: 9px; background: transparent; color: var(--clr-text-dim); font-size: 14px; border-radius: 0; transition: background 0.15s, color 0.15s; }
.tab.active { background: var(--clr-gold); color: #1a1008; font-weight: bold; }
.tab:not(.active):hover { background: rgba(201,168,76,0.1); color: var(--clr-text); }

.btn-primary {
  width: 100%; padding: 12px;
  background: linear-gradient(135deg, #c9a84c 0%, #e0bd60 100%);
  color: #1a1008;
  font-size: 16px; font-weight: bold;
  border-radius: 6px;
  transition: filter 0.2s, transform 0.1s;
}
.btn-primary:hover { filter: brightness(1.12); }
.btn-primary:active { transform: scale(0.98); }

.public-toggle {
  display: flex; align-items: center; gap: 8px;
  color: var(--clr-text-dim); font-size: 13px; cursor: pointer;
  user-select: none;
}
.public-toggle input[type=checkbox] {
  accent-color: var(--clr-gold);
  width: 14px; height: 14px; cursor: pointer;
}

.error-msg { color: var(--clr-lose); font-size: 13px; text-align: center; }

#room-code-display {
  text-align: center; font-size: 1.4rem; letter-spacing: 4px;
  color: var(--clr-gold); font-family: var(--font-ui);
  cursor: pointer; user-select: none;
  transition: opacity 0.15s;
}
#room-code-display:hover { opacity: 0.75; }

#player-list-ul { list-style: none; display: flex; flex-direction: column; gap: 6px; }
#player-list-ul li {
  padding: 8px 12px; background: rgba(201, 168, 76, 0.08);
  border-radius: 6px; font-size: 14px;
  display: flex; align-items: center; gap: 8px;
}
#player-list-ul li .host-badge { font-size: 11px; color: var(--clr-gold); }

.setting-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 0; border-bottom: 1px solid rgba(201,168,76,0.1);
  font-size: 13px;
}
.setting-row label { color: var(--clr-text-dim); }
.setting-row select, .setting-row input[type=range] {
  background: #2a1e0a; color: var(--clr-text);
  border: 1px solid var(--clr-gold); border-radius: 3px; padding: 2px 6px;
}
.setting-value { min-width: 48px; text-align: right; color: var(--clr-gold); font-family: var(--font-ui); font-size: 13px; }

#lobby-status { text-align: center; font-size: 13px; color: var(--clr-text-dim); }

.rooms-section-label {
  font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
  color: var(--clr-text-dim); margin-top: 4px;
}

#public-rooms-list {
  display: flex; flex-direction: column; gap: 8px;
  max-height: 260px; overflow-y: auto;
}

.no-rooms-msg {
  text-align: center; color: var(--clr-text-dim); font-size: 13px;
  padding: 16px 0; font-style: italic;
}

.room-card {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  background: rgba(35, 107, 71, 0.15);
  border: 1px solid rgba(201, 168, 76, 0.2);
  border-left: 3px solid var(--clr-gold);
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}
.room-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(201, 168, 76, 0.2);
  background: rgba(35, 107, 71, 0.28);
}

.room-card-host { font-weight: bold; color: var(--clr-gold); font-size: 14px; }

.room-card-info { display: flex; align-items: center; gap: 8px; }

.room-card-count { font-size: 12px; color: var(--clr-text-dim); }

.room-card-phase {
  font-size: 11px; font-weight: bold; font-family: var(--font-ui);
  padding: 2px 8px; border-radius: 10px;
}
.phase-waiting { background: #4caf50; color: #fff; }
.phase-inprogress { background: #c9a84c; color: #1a1008; }
```

- [ ] **Step 2: Verify `h1 .suit-dark` and `h1 .suit-red` override the gradient correctly**

Open `index.html` in the browser (via GitHub Pages or local file). The title should show muted dark ♠ and muted red ♥ flanking gold gradient "BLACKJACK". If the suits are invisible (text-fill-color not overriding), add `!important` to both suit rules:

```css
h1 .suit-dark { -webkit-text-fill-color: #7a6a4a !important; }
h1 .suit-red  { -webkit-text-fill-color: #7a2828 !important; }
```

- [ ] **Step 3: Commit**

```bash
git add css/lobby.css
git commit -m "feat: full lobby visual overhaul with card-suit background and styled public room cards"
```

---

## Task 7: Push and Smoke Test

- [ ] **Step 1: Push all commits**

```bash
git push
```

- [ ] **Step 2: Smoke test — Create public room**

1. Open the live site. Confirm title shows `♠ BLACKJACK ♥` with gradient gold center text.
2. Confirm card-suit pattern is faintly visible in background.
3. Click Create Game tab. Check the "Make room public" checkbox. Enter a name. Click Create Room.
4. Open a second browser tab on the Join Game tab. Confirm the public room appears as a card with host name, "1 / 6 players", and a green "Waiting" badge.

- [ ] **Step 3: Smoke test — Join via card**

1. In the second tab, leave the name field empty and click the room card. Confirm "Enter your name" error appears and no join is attempted.
2. Enter a name, click the card. Confirm it joins the room and reaches the lobby screen.

- [ ] **Step 4: Smoke test — Sync and cleanup**

1. A third player joins via code. Confirm the card in any Join tab updates to "2 / 6 players".
2. Host clicks Start Game. Confirm the room card disappears from the public list (removed on game start).
3. Create a new public room, then close the host tab entirely. Within a few seconds confirm the room card disappears (onDisconnect cleanup).
