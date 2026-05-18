# Lobby Redesign + Public Room List — Design Spec
_Date: 2026-05-19_

## Overview

Two parallel goals:
1. Visual polish of the lobby (`index.html` / `css/lobby.css`) — same gold/dark casino palette, elevated execution.
2. Opt-in public room feature — hosts can mark their room public; players see a live list of public rooms on the Join tab and can join with one click.

---

## Firebase Structure

### New node: `/publicRooms/${roomCode}`

```json
{
  "hostName": "Faber",
  "playerCount": 2,
  "phase": "waiting"
}
```

**Lifecycle:**
- Written when the host creates a room with "Public Room" enabled.
- Updated on every host `onRoomChange` — player count and phase kept in sync.
- Deleted via Firebase `onDisconnect` when the host's connection drops.
- Deleted manually when the host closes the lobby cleanly (leaves the waiting screen).

**Firebase rules:**
- `/publicRooms` — readable by any `auth !== null`.
- `/publicRooms/${roomCode}` — writable only if `auth.uid === root.child('rooms').child(roomCode).child('hostId').val()`.

### New room.js exports

| Function | Description |
|---|---|
| `writePublicRoom(code, data)` | `update` ref at `/publicRooms/${code}` |
| `removePublicRoom(code)` | `remove` ref at `/publicRooms/${code}` |
| `listenPublicRooms(callback)` | `onValue` on `/publicRooms`, fires with full snapshot val |
| `setupPublicRoomDisconnect(code)` | `onDisconnect(ref).remove()` on `/publicRooms/${code}` |

---

## Lobby.js / index.html Changes

### Create pane

- Add a styled "Public Room" toggle checkbox below the Create Room button.
- On room creation: if checked, call `writePublicRoom` with initial data and `setupPublicRoomDisconnect`.
- In the host's `onRoomChange` callback (already wired in `showLobby`): if the room is public, call `writePublicRoom` to sync updated `playerCount` and `phase`.
- On host leaving cleanly (navigating away / game starting): call `removePublicRoom`.

### Join pane

- Below the room code input and Join button: a scrollable `#public-rooms-list` container.
- On tab switch to Join: call `listenPublicRooms` and render live lobby cards.
- If no public rooms exist: show a subtle "No public rooms available" placeholder.

### Lobby card — displayed fields

| Field | Display |
|---|---|
| Host name | Bold gold text |
| Player count | e.g. "3 / 6 players" |
| Phase | Pill badge — green "Waiting" or amber "In Progress" |

**Interaction:** Clicking a card directly triggers the join flow with that room's code — no manual code entry, no extra button press. If the name field is empty at click time, show the same "Enter your name" error as the manual join flow (no join attempted).

### Panel width

Join pane panel expands to `520px` to accommodate the lobby list below the code input without feeling cramped.

---

## Visual Redesign

### Background (`#lobby-bg`)

- Keep dark brown radial gradient base.
- Add a large faint card-suit pattern (♠ ♥ ♦ ♣) via CSS `::before` pseudo-element, `opacity: 0.04`, scattered with `font-size` variation.
- Subtle vignette via `radial-gradient` overlay.

### Title

- Text: `♠ BLACKJACK ♥`
- Gold gradient text via `background: linear-gradient(...); -webkit-background-clip: text; color: transparent`
- `letter-spacing: 6px`, `font-size: 2.8rem`
- Suits styled in muted colors (♠ dark, ♥ muted red)

### Panel

- `border-radius: 16px` (up from 12px)
- `box-shadow: 0 0 40px rgba(201,168,76,0.15), 0 8px 32px rgba(0,0,0,0.6)`
- Same border color (`--clr-gold`)

### Inputs

- Name input: bottom-border-only style for a cleaner look.
- Room code input: retains full border (needs to stand out).

### Buttons

- Create Room / Join Room: gold gradient fill (`linear-gradient(135deg, #c9a84c, #e0bd60)`) instead of flat gold.
- Hover: brighten gradient slightly.

### Lobby cards

```
background: rgba(35, 107, 71, 0.15)   /* faint felt tint */
border-left: 3px solid var(--clr-gold)
border-radius: 8px
padding: 10px 14px
cursor: pointer
transition: transform 0.15s, box-shadow 0.15s
```

Hover state: `transform: translateY(-2px)`, `box-shadow: 0 4px 12px rgba(201,168,76,0.2)`

Phase badge pills:
- Waiting: `background: #4caf50`, white text
- In Progress: `background: #c9a84c`, dark text

### Lobby screen (post-join)

No structural changes — inherits improved background and panel shadows automatically.

---

## Files Changed

| File | Change |
|---|---|
| `css/lobby.css` | Full visual overhaul + lobby card styles |
| `index.html` | Public Room toggle in create pane, `#public-rooms-list` in join pane |
| `js/lobby.js` | Public room create/sync/cleanup logic, join-tab listener, card click handler |
| `js/room.js` | 4 new exports: `writePublicRoom`, `removePublicRoom`, `listenPublicRooms`, `setupPublicRoomDisconnect` |
| `firebase-rules.json` | `/publicRooms` read rule + host-only write rule |

---

## Out of Scope

- Password-protected public rooms
- Filtering/sorting the lobby list
- Pagination (max ~20 public rooms expected; `onValue` snapshot is sufficient)
- Spectator join from lobby list
