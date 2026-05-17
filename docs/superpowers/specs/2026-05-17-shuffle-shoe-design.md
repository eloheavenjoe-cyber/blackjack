# Shuffle Shoe — Design Spec

**Date:** 2026-05-17  
**Status:** Approved

## Overview

Two ways to shuffle a new shoe during the betting phase:

- **Vote Shuffle** — any player (including host) can vote. When a majority of eligible players vote yes, the host fires a full new shoe automatically.
- **Force Shuffle** — host-only button that bypasses voting and shuffles immediately.

Both paths share the same shuffle execution function. Available in the betting phase only.

---

## Data Model

### New player field: `shuffleVote: boolean`

Stored on `rooms/${roomCode}/players/${uid}/shuffleVote`.

- Written by each player to their own node — covered by existing Firebase rules, no redeploy needed.
- `true` = voted yes for a shuffle, `false` / absent = no vote.

### Reset points

| When | What |
|------|------|
| Between rounds (resolution → betting) | `shuffleVote: false` added to the existing player-reset object in `playDealerHand` |
| When shuffle fires mid-betting | `executeShuffleShoe` writes `shuffleVote: false` for all players |

No new room-level fields. No Firebase rules changes.

---

## Shuffle Execution

`executeShuffleShoe(room)` in `game.js` — called by both force and vote paths.

1. Rebuild deck: `localDeck = shuffle(createDeck(room.settings.decks)).map(cardToStr)`
2. Reset: `runningCount = 0`
3. Write `cardsRemaining` (new deck length) and `runningCount` (0) to Firebase
4. Write `shuffleVote: false` to every player node (clears votes, counter resets to 0/N)

**Guard:** module-level `shufflingShoe = false` flag prevents double-fire on the host — same pattern as `dealingInProgress` and `advancingFromBetting`.

---

## Host Vote Detection

In `handleRoomUpdate`, when `phase === 'betting'` and `isHost`, after the existing auto-advance check:

```
eligible = players where connected !== false AND status !== 'sitting-out'
N = eligible.length
threshold = Math.floor(N / 2) + 1
yesCount = eligible where shuffleVote === true
if N > 0 AND yesCount >= threshold → executeShuffleShoe(currentRoom)
```

The `shufflingShoe` guard ensures this fires at most once per condition edge.

---

## UI

### Vote button — all players (betting phase)

- New `<div id="shuffle-vote-wrap" hidden></div>` added to `game.html` near `#shoe-display`.
- Shown to all non-sitting-out players during betting, including after confirming a bet.
- Single button: label `"Shuffle Shoe X/N"` where X = current yes-vote count among eligible players, N = eligible player count.
- Re-rendered on every `onRoomChange` during betting (vote counts update live).
- CSS class `.voted` on the button when `me.shuffleVote === true` (visual highlight).
- Click: `writePlayerAction({ shuffleVote: !me.shuffleVote })` — toggles.
- Hidden when `phase !== 'betting'` or player is sitting-out.

### Force button — host only (betting phase)

- Added to `#host-controls` during `renderBettingUI`, alongside existing Force Start button.
- Label: `"New Shoe"`.
- Click: calls `executeShuffleShoe(currentRoom)` directly.
- Not shown outside betting phase (follows same `renderBettingUI` pattern as Force Start).

---

## Files Changed

| File | Change |
|------|--------|
| `js/game.js` | Add `executeShuffleShoe`, `shufflingShoe` guard, vote detection in `handleRoomUpdate`, force button in `renderBettingUI`, vote button render logic, reset `shuffleVote` in `playDealerHand` |
| `js/room.js` | No changes |
| `js/ui.js` | No changes |
| `game.html` | Add `<div id="shuffle-vote-wrap" hidden></div>` near `#shoe-display` |
| `css/hud.css` | Add `.voted` highlight style for the vote button |
| `firebase-rules.json` | No changes |

---

## Out of Scope

- Reshuffling remaining cards (not a full new shoe) — not requested
- Vote shuffle outside betting phase — not supported
- Votekick / other vote types — separate feature, separate Firebase fields
