# Chat Room + Floating Emoji Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible chat panel (bottom-left) with a row of emoji reaction buttons below it; text messages persist in Firebase for the room session; emoji clicks trigger floating animations visible to all players in real time.

**Architecture:** Two new Firebase paths (`chat/` and `emojiEvents/`) under `rooms/${roomCode}` — separate channels so emoji events don't pollute the chat log. A new `js/chat.js` module owns all UI and listener logic. `room.js` gains four new exports using Firebase `push` + `onChildAdded`. Emoji float elements are appended to `document.body` and self-remove on `animationend`.

**Tech Stack:** Firebase Realtime Database (modular SDK v10, `push` + `onChildAdded`), vanilla JS ES modules, CSS keyframe animation.

---

### Task 1: Add Firebase rules for chat and emojiEvents, deploy

**Files:**
- Modify: `firebase-rules.json`

- [ ] **Step 1: Add write rules for both paths**

In `firebase-rules.json`, add two siblings alongside the existing `players`, `cardsRemaining`, etc. entries inside `"$roomCode"`:

```json
"chat": {
  "$msgId": {
    ".write": "auth !== null"
  }
},
"emojiEvents": {
  "$eventId": {
    ".write": "auth !== null"
  }
}
```

Final `firebase-rules.json` `"$roomCode"` block should look like:

```json
"$roomCode": {
  ".read": true,
  ".write": false,
  "settings":       { ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()" },
  "phase":          { ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()" },
  "dealer":         { ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()" },
  "currentTurn":    { ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()" },
  "turnDeadline":   { ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()" },
  "players": {
    "$playerId": {
      ".write": "auth !== null && ($playerId === auth.uid || data.parent().parent().child('hostId').val() === auth.uid)"
    }
  },
  "hostId":         { ".write": "!data.parent().exists()" },
  "cardsRemaining": { ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()" },
  "runningCount":   { ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()" },
  "showCount":      { ".write": "data.parent().child('hostId').val() === auth.uid || !data.parent().exists()" },
  "chat": {
    "$msgId": { ".write": "auth !== null" }
  },
  "emojiEvents": {
    "$eventId": { ".write": "auth !== null" }
  }
}
```

- [ ] **Step 2: Deploy the rules**

```bash
npx firebase-tools deploy --only database
```

Expected output: `✔  Deploy complete!`

- [ ] **Step 3: Commit**

```bash
git add firebase-rules.json
git commit -m "feat: add Firebase rules for chat and emojiEvents paths"
```

---

### Task 2: Add chat and emoji Firebase functions to room.js

**Files:**
- Modify: `js/room.js`

- [ ] **Step 1: Add `push` and `onChildAdded` to the Firebase import**

The current import line (line 2 in `room.js`) is:
```js
import { getDatabase, ref, set, get, update, onValue, onDisconnect as fbOnDisconnect } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
```

Change it to:
```js
import { getDatabase, ref, set, get, update, onValue, onDisconnect as fbOnDisconnect, push, onChildAdded } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
```

- [ ] **Step 2: Add the four new exported functions at the bottom of `room.js`**

```js
export function sendChatMessage(code, playerUid, name, text) {
  push(ref(db, `rooms/${code}/chat`), { uid: playerUid, name, text, ts: Date.now() });
}

export function listenChatMessages(code, callback) {
  return onChildAdded(ref(db, `rooms/${code}/chat`), snap => callback(snap.val()));
}

export function sendEmojiReaction(code, playerUid, emoji) {
  push(ref(db, `rooms/${code}/emojiEvents`), { uid: playerUid, emoji, ts: Date.now() });
}

export function listenEmojiReactions(code, callback, afterTs = 0) {
  return onChildAdded(ref(db, `rooms/${code}/emojiEvents`), snap => {
    const val = snap.val();
    if (val.ts > afterTs) callback(val);
  });
}
```

`afterTs` prevents replaying old emoji events from before the client joined. Chat messages replay on join (useful to see recent history); emoji events do not.

- [ ] **Step 3: Commit**

```bash
git add js/room.js
git commit -m "feat: add sendChatMessage, listenChatMessages, sendEmojiReaction, listenEmojiReactions to room.js"
```

---

### Task 3: Add chat_notify sound key to sound.js

**Files:**
- Modify: `js/sound.js`

- [ ] **Step 1: Add the key to the SOUNDS map**

In `js/sound.js`, the `SOUNDS` object currently ends with `bust`. Add `chat_notify` after it:

```js
const SOUNDS = {
  card_deal:     'assets/sounds/card_deal.wav',
  dealer_reveal: 'assets/sounds/dealer_reveal.wav',
  chip_click:    'assets/sounds/chip_click.wav',
  win:           'assets/sounds/win.wav',
  blackjack:     'assets/sounds/blackjack.wav',
  lose:          'assets/sounds/lose.wav',
  bust:          'assets/sounds/bust.wav',
  chat_notify:   'assets/sounds/chat_notify.wav',
};
```

The `audio.addEventListener('error', ...)` handler in `init()` already silently removes missing keys, so this is a silent no-op until `assets/sounds/chat_notify.wav` is added.

- [ ] **Step 2: Commit**

```bash
git add js/sound.js
git commit -m "feat: add chat_notify placeholder key to sound.js"
```

---

### Task 4: Create css/chat.css

**Files:**
- Create: `css/chat.css`

- [ ] **Step 1: Create the file**

```css
#chat-region {
  position: fixed;
  bottom: 48px;
  left: 16px;
  z-index: 12;
  width: 280px;
  display: flex;
  flex-direction: column;
}

#chat-panel {
  width: 100%;
  background: rgba(10, 6, 2, 0.88);
  border: 1px solid rgba(201, 168, 76, 0.3);
  border-radius: 8px 8px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#chat-panel.collapsed {
  border-radius: 8px;
}

#chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(201, 168, 76, 0.2);
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--clr-gold);
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: default;
}

#chat-panel.collapsed #chat-header {
  border-bottom: none;
}

#chat-toggle {
  background: none;
  border: none;
  color: var(--clr-gold);
  font-size: 13px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
#chat-toggle:hover { color: var(--clr-text); }

#chat-unread {
  display: none;
  background: var(--clr-gold);
  border-radius: 50%;
  width: 8px;
  height: 8px;
  margin-left: 4px;
}
#chat-unread.visible { display: inline-block; }

#chat-messages {
  height: 150px;
  overflow-y: auto;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-family: var(--font-ui);
  font-size: 12px;
  color: var(--clr-text);
}

#chat-messages::-webkit-scrollbar { width: 4px; }
#chat-messages::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.3); border-radius: 2px; }

.chat-msg { line-height: 1.4; word-break: break-word; }
.chat-msg-name { color: var(--clr-gold); font-weight: bold; }

#chat-panel.collapsed #chat-messages,
#chat-panel.collapsed #chat-input-row {
  display: none;
}

#chat-input-row {
  display: flex;
  gap: 6px;
  padding: 6px 10px;
  border-top: 1px solid rgba(201, 168, 76, 0.2);
}

#chat-input {
  flex: 1;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  min-width: 0;
}

#chat-send {
  padding: 4px 10px;
  font-size: 12px;
  background: rgba(20,12,4,0.9);
  color: var(--clr-gold);
  border: 1px solid var(--clr-gold);
  border-radius: 4px;
  font-family: var(--font-ui);
}
#chat-send:hover { background: var(--clr-gold); color: #1a1008; }

#emoji-bar {
  width: 100%;
  display: flex;
  justify-content: space-around;
  padding: 6px 10px;
  background: rgba(10, 6, 2, 0.78);
  border: 1px solid rgba(201, 168, 76, 0.3);
  border-top: none;
  border-radius: 0 0 8px 8px;
}

.emoji-btn {
  background: none;
  border: none;
  font-size: 1.4rem;
  cursor: pointer;
  padding: 2px;
  line-height: 1;
  transition: transform 0.1s;
}
.emoji-btn:hover { transform: scale(1.3); }

@keyframes emoji-float {
  0%   { transform: translateY(0);      opacity: 1; }
  100% { transform: translateY(-300px); opacity: 0; }
}

.emoji-float {
  position: fixed;
  font-size: 2.5rem;
  pointer-events: none;
  animation: emoji-float 2.5s ease-out forwards;
  z-index: 100;
}
```

- [ ] **Step 2: Commit**

```bash
git add css/chat.css
git commit -m "feat: add chat panel and emoji float CSS"
```

---

### Task 5: Create js/chat.js

**Files:**
- Create: `js/chat.js`

- [ ] **Step 1: Create the file**

```js
import { sendChatMessage, listenChatMessages, sendEmojiReaction, listenEmojiReactions } from './room.js';
import * as sound from './sound.js';

const EMOJI_LIST = ['😂', '😬', '💀', '🔥', '👑', '💸'];

let collapsed = false;
let unreadCount = 0;

export function initChat(roomCode, playerUid, playerName) {
  const initTs = Date.now();

  const panel = document.getElementById('chat-panel');
  const emojiBar = document.getElementById('emoji-bar');

  panel.innerHTML = `
    <div id="chat-header">
      <span>Chat</span>
      <span id="chat-unread"></span>
      <button id="chat-toggle" title="Toggle chat">▼</button>
    </div>
    <div id="chat-messages"></div>
    <div id="chat-input-row">
      <input id="chat-input" type="text" placeholder="Say something..." maxlength="200">
      <button id="chat-send">Send</button>
    </div>
  `;

  for (const emoji of EMOJI_LIST) {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', () => sendEmojiReaction(roomCode, playerUid, emoji));
    emojiBar.appendChild(btn);
  }

  const messagesEl = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const toggleBtn = document.getElementById('chat-toggle');
  const unreadDot = document.getElementById('chat-unread');

  toggleBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    toggleBtn.textContent = collapsed ? '▲' : '▼';
    if (!collapsed) {
      unreadCount = 0;
      unreadDot.classList.remove('visible');
    }
  });

  document.getElementById('chat-send').addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

  function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendChatMessage(roomCode, playerUid, playerName, text);
  }

  listenChatMessages(roomCode, msg => {
    appendMessage(messagesEl, msg);
    if (collapsed) {
      unreadCount++;
      unreadDot.classList.add('visible');
    }
    sound.play('chat_notify');
  });

  listenEmojiReactions(roomCode, ({ emoji }) => spawnFloatingEmoji(emoji), initTs);
}

function appendMessage(container, { name, text }) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="chat-msg-name">${escapeHtml(name)}:</span> ${escapeHtml(text)}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function spawnFloatingEmoji(emoji) {
  const el = document.createElement('span');
  el.className = 'emoji-float';
  el.textContent = emoji;
  el.style.left = `${Math.random() * Math.min(280, window.innerWidth * 0.35)}px`;
  el.style.bottom = '48px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}
```

- [ ] **Step 2: Commit**

```bash
git add js/chat.js
git commit -m "feat: add chat.js module with initChat, message rendering, emoji float"
```

---

### Task 6: Update game.html

**Files:**
- Modify: `game.html`

- [ ] **Step 1: Add the chat.css link in `<head>`**

After the existing `<link rel="stylesheet" href="css/hud.css">` line, add:

```html
<link rel="stylesheet" href="css/chat.css">
```

- [ ] **Step 2: Add chat-region div shells before the closing `</div>` of `#table-wrap`**

Before `</div>` that closes `#table-wrap` (currently line 68, just before the `<script>` tag), add:

```html
<div id="chat-region">
  <div id="chat-panel"></div>
  <div id="emoji-bar"></div>
</div>
```

Final bottom of `game.html` should look like:

```html
    <div id="shuffle-vote-wrap" hidden></div>
    <div id="count-display" hidden>
      <div id="rc-value">RC: +0</div>
      <div id="tc-value">TC: +0.0</div>
    </div>
    <div id="chat-region">
      <div id="chat-panel"></div>
      <div id="emoji-bar"></div>
    </div>
  </div>
  <script type="module" src="js/game.js"></script>
</body>
```

- [ ] **Step 3: Commit**

```bash
git add game.html
git commit -m "feat: add chat-region div shells and chat.css link to game.html"
```

---

### Task 7: Wire initChat in game.js

**Files:**
- Modify: `js/game.js`

- [ ] **Step 1: Add initChat to the import list at the top of game.js**

After the existing imports, add:

```js
import { initChat } from './chat.js';
```

- [ ] **Step 2: Call initChat inside the `init()` function**

In `init()`, after the `setupConnectionMonitoring()` call and before `sound.init()`, add:

```js
const name = sessionStorage.getItem('playerName') || 'Player';
// ... (name is already declared above, just add the initChat call)
initChat(roomCode, uid, name);
```

The full updated section of `init()` should look like:

```js
async function init() {
  await initRoom();
  const name = sessionStorage.getItem('playerName') || 'Player';
  await joinRoom(code, name);
  setupConnectionMonitoring();
  initChat(roomCode, uid, name);

  sound.init();
  // ... rest unchanged
```

- [ ] **Step 3: Commit**

```bash
git add js/game.js
git commit -m "feat: wire initChat into game.js init"
```

---

### Task 8: End-to-end verification

No automated tests for Firebase/DOM UI. Verify manually by opening two browser tabs to the same room.

- [ ] **Step 1: Open the game in two tabs**

Navigate both to `game.html?room=<code>` (create a room in tab 1, join in tab 2).

- [ ] **Step 2: Verify chat panel is visible**

Bottom-left of both tabs should show the chat panel (header "Chat" + empty message area + input row) with the emoji bar immediately below it (six emoji buttons).

- [ ] **Step 3: Send a chat message from tab 1**

Type a message and press Enter (or Send). Confirm it appears in both tabs formatted as `PlayerName: message text`.

- [ ] **Step 4: Verify collapse/expand**

Click the `▼` toggle in tab 1. Panel should collapse to just the header row with `▲`. Emoji bar remains visible. Send a message from tab 2 — the gold unread dot should appear on the collapsed panel in tab 1. Click `▲` to expand — dot disappears.

- [ ] **Step 5: Click an emoji in tab 1**

An emoji should float upward and fade on **both** tabs from the bottom-left region.

- [ ] **Step 6: Verify no replay on join**

Refresh tab 2 and rejoin. Old emoji events should NOT re-animate. Old chat messages SHOULD appear (replayed from Firebase).

- [ ] **Step 7: Verify no console errors**

Open DevTools → Console in both tabs. Confirm no errors during send, receive, or emoji events.

- [ ] **Step 8: Commit verification complete (no code change needed)**

If any bugs found during verification, fix and commit them before marking done.
