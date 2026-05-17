# Chat Room + Floating Emoji Reactions — Design Spec

**Date:** 2026-05-17  
**Status:** Approved

---

## Overview

Add a collapsible chat panel to the game table (bottom-left) and a row of emoji reaction buttons below it. Emoji clicks trigger a floating animation visible to all players in real time via Firebase. Text chat is persistent within the room session. Both features are active at all game phases.

---

## Data Model (Firebase)

Two new paths under `rooms/${roomCode}`:

```
rooms/${roomCode}/chat/{pushId}
  { uid: string, name: string, text: string, ts: number }

rooms/${roomCode}/emojiEvents/{pushId}
  { uid: string, emoji: string, ts: number }
```

- `chat` accumulates for the room's lifetime. No cleanup — rooms are ephemeral.
- `emojiEvents` also accumulates but entries are tiny. Clients only react to new ones via `onChildAdded` (events before the client joined are ignored by virtue of when the listener attaches).
- Both paths need `.write` rules added to `firebase-rules.json` → one Firebase rules redeploy required.

---

## Firebase Rules

Add to `firebase-rules.json` under the room rules:

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

---

## UI Layout

Bottom-left of `#table-wrap`, absolutely positioned. Two stacked sections:

```
┌─────────────────────────┐   ← #chat-panel (~280px wide)
│ Chat           [Hide ▼] │   ← header with toggle button
├─────────────────────────┤
│ User A: nice hand       │   ← #chat-messages (scrollable, ~150px tall)
│ User B: gg              │     shows last 50 messages, auto-scrolls to bottom
│                         │
├─────────────────────────┤
│ [_______________] [Send] │   ← #chat-input + #chat-send (Enter also sends)
└─────────────────────────┘
  😂  😬  💀  🔥  👑  💸      ← #emoji-bar (below panel, same left alignment)
```

**Collapsed state:** Panel shrinks to a single `[Chat ▲]` header button only. `#emoji-bar` remains visible below it.  
**Unread badge:** When collapsed and a new message arrives, a small gold dot appears on the toggle button. Cleared on expand.

---

## Emoji Configuration

Defined as a single constant in `js/chat.js` — easy to update:

```js
const EMOJI_LIST = ['😂', '😬', '💀', '🔥', '👑', '💸'];
```

Buttons are generated from this array at init time. Changing the list requires only editing this one line.

---

## Emoji Float Animation

When a reaction event arrives (including the local player's own click):

1. Create a `<span class="emoji-float">` containing the emoji character
2. Append to `#table-wrap` (floats above all game elements)
3. Position: random X within left 40% of viewport, Y at bottom of viewport
4. CSS keyframe animates translateY(-300px) + opacity 0→1→0 over 2.5s
5. Remove element from DOM after animation ends (`animationend` event)

Multiple simultaneous reactions each spawn independent elements — no coordination needed.

```css
@keyframes emoji-float {
  0%   { transform: translateY(0);      opacity: 1; }
  100% { transform: translateY(-300px); opacity: 0; }
}

.emoji-float {
  position: absolute;
  font-size: 2.5rem;
  pointer-events: none;
  animation: emoji-float 2.5s ease-out forwards;
  z-index: 100;
}
```

---

## Notification Sound

`js/sound.js` already has an `AudioManager` with a sound map and silent no-op for missing files. Add `chat_notify` as a new key:

```js
chat_notify: 'assets/sounds/chat_notify.wav'
```

Plays on each incoming text message (not on emoji events). Silent until `assets/sounds/chat_notify.wav` is added — matches the existing pattern for `lose.wav` / `bust.wav`.

---

## New Module: `js/chat.js`

Owns all chat + emoji UI logic. Exported function:

```js
export function initChat(roomCode, uid, name) { ... }
```

Called once from `game.js` after the player has joined the room. Responsibilities:
- Build `#chat-panel` and `#emoji-bar` DOM (or wire up pre-existing HTML shells)
- Call `listenChatMessages` and `listenEmojiReactions` from `room.js`
- Handle send (button click + Enter key)
- Handle emoji button clicks → `sendEmojiReaction` + local float spawn
- On incoming chat message: append to `#chat-messages`, scroll to bottom, play `chat_notify`, increment unread badge if collapsed
- On incoming emoji event: spawn float element

---

## Changes by File

| File | Change |
|------|--------|
| `js/chat.js` | **New.** Full chat + emoji module. |
| `css/chat.css` | **New.** Panel layout, collapse animation, emoji-bar, float keyframe. |
| `js/room.js` | Add `sendChatMessage`, `listenChatMessages`, `sendEmojiReaction`, `listenEmojiReactions`. |
| `js/sound.js` | Add `chat_notify` to sound map. |
| `js/game.js` | Import `initChat`; call after room join. |
| `game.html` | Add `<link>` for `chat.css`; add `#chat-panel` and `#emoji-bar` div shells. |
| `firebase-rules.json` | Add `.write` rules for `chat/` and `emojiEvents/`. Redeploy required. |

---

## Out of Scope

- Message history on reconnect (new joins see only messages received after joining — acceptable)
- Moderation / message deletion
- Emoji float origin customization (bottom-left for now, revisit later)
- Emoji in chat text input (separate concern)
