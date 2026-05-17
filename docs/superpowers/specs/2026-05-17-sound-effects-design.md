# Sound Effects — Design Spec
Date: 2026-05-17

## Overview

Add client-side sound effects to the multiplayer blackjack game. Each client fires its own sounds locally based on game state changes observed via Firebase. No host-only audio paths. No external dependencies.

## Architecture

### `js/sound.js` — Singleton AudioManager

```
init()         — preload all files; call once at page load
play(key)      — play a sound by key; no-op if muted or file missing
toggleMute()   — flip mute state, persist to localStorage
isMuted()      — return current mute state
```

**Preloading:** One `Audio` instance per file, created and `.load()`-ed at `init()`. On `play(key)`, the node is cloned so the same sound can overlap (rapid chip clicks).

**Mute persistence:** `localStorage` key `bj_muted`. Initialised from this value at `init()`.

**Missing files:** If a file fails to load, the key is removed from the map — `play()` silently skips it. This covers placeholder sounds.

### Files — `assets/sounds/`

| Key | Filename | Status |
|---|---|---|
| `card_deal` | `card_deal.wav` | ✅ present |
| `dealer_reveal` | `dealer_reveal.wav` | ✅ present |
| `chip_click` | `chip_click.wav` | ✅ present |
| `win` | `win.wav` | ✅ present |
| `blackjack` | `blackjack.wav` | ✅ present |
| `lose` | `lose.wav` | ⏳ placeholder |
| `bust` | `bust.wav` | ⏳ placeholder |

## Sound Events & Trigger Points

| Sound | Key | Fired from | Condition |
|---|---|---|---|
| Card dealt | `card_deal` | `game.js handleDealingPhase` | after `dealCards` resolves; one `play()` per active player (N players = N pings, staggered 120ms) |
| Dealer reveal | `dealer_reveal` | `ui.js renderDealerAreaEl` | when `phase === 'resolution'` and `dealer.hiddenCard` is present (guarded by `lastDealerRenderKey` dedup already in place) |
| Chip click | `chip_click` | `game.js` chip button click handler | every chip denomination click |
| Bet confirmed | `chip_click` | `game.js` confirm bet button click | on click |
| Win | `win` | `game.js handleRoomUpdate` | phase → `resolution`, local player result is `win` |
| Blackjack | `blackjack` | `game.js handleRoomUpdate` | phase → `resolution`, local player result is `blackjack` |
| Lose | `lose` | `game.js handleRoomUpdate` | phase → `resolution`, result is `lose` or `dealer_blackjack` |
| Bust | `bust` | `game.js handleRoomUpdate` | phase → `resolution`, result is `bust` |

**Outcome sound guard:** A module-level `lastSoundPhase` variable in `game.js` prevents re-firing outcome sounds on subsequent Firebase updates within the same resolution phase. Reset when phase leaves `resolution`.

**Outcome resolution logic:** Reuses the same hand-evaluation path as `determineCatchphraseEvent` — checks dealer cards + player hands, calls `resolveHand` per hand, picks the best result (blackjack > win > push > lose > bust).

## UI — Mute Button

- Added to the table HTML (not injected by JS) in the HUD area, top-right near shoe/count display.
- Renders `🔊` / `🔇` as a small icon button with class `mute-btn`.
- On click: `sound.toggleMute()`, swap icon.
- On page load: icon initialised from `sound.isMuted()`.
- Single event listener added in `game.js` `init()`.

## iOS / Autoplay Note

`new Audio()` on iOS requires a user gesture before playback. Since no sound fires before the first chip click or button press, the browser's autoplay gate is unlocked naturally. No special handling needed.

## Out of Scope

- Volume slider (mute only)
- Background/ambient music
- Sounds for split, double, surrender actions
- Host-broadcast audio events
