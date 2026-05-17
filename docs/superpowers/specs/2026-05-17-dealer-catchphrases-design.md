# Dealer Catchphrases — Design Spec

**Date:** 2026-05-17
**Status:** Approved

---

## Overview

The dealer displays a speech bubble once per hand reacting to the outcome. The bubble is local/client-side — no Firebase writes. Every client independently renders the same catchphrase because all clients share the same game state (phase, results).

---

## Architecture

### New file: `js/catchphrases.js`

Owns the line pools and all bubble DOM logic. Exports one function:

```js
triggerCatchphrase(event)
```

Where `event` is one of: `dealer_blackjack`, `dealer_bust`, `player_blackjack`, `bust`, `win`, `lose`, `push`, `surrender`.

Internally picks a random line from the pool for that event, injects it into `#dealer-bubble`, and runs the show/hide animation.

### New element: `#dealer-bubble` in `game.html`

Added as a sibling inside `#dealer-area`, above `#dealer-hand-wrap`. Hidden by default via CSS.

### New styles in `css/table.css`

Speech bubble shape (rounded rect with a small downward pointer arrow). Fade-in 0.3s, hold 3.5s, fade-out 0.5s — implemented via CSS animation + a JS `setTimeout` to remove the active class.

### Trigger point: `js/game.js`

In the existing `onRoomChange` listener, detect the transition from any phase → `'resolution'`. At that moment, determine the event from room state and call `triggerCatchphrase(event)`.

---

## Event Priority

When multiple outcomes are possible in a single hand (e.g. dealer bust AND a player blackjack), pick the single highest-priority event:

1. `dealer_blackjack`
2. `dealer_bust`
3. `player_blackjack`
4. `bust` (local player busted)
5. `win`
6. `lose`
7. `push`
8. `surrender`

All events (1–8) are evaluated against the **local player's** outcome. `player_blackjack` fires when the local player (uid) got blackjack. If the local player has no hand this round (spectator), the bubble is skipped entirely.

---

## Line Pools

5 lines per event, one picked at random each time.

### `dealer_blackjack`
- "Blackjack. I'd say sorry, but I'm not."
- "House wins. It always does. Read the sign."
- "Natural 21. Don't take it personally — actually, do."
- "Ooh, that had to hurt. Pay up."
- "Statistically, your luck turns around eventually."

### `dealer_bust`
- "22. My therapist will hear about this."
- "I busted. Don't make it weird."
- "The house loses. Enjoy it. It won't last."
- "I walked right into that one."
- "Dealer busts. I need a moment."

### `player_blackjack`
- "Another 21? You're killing me here."
- "Beautiful. I hate it."
- "Of course you did."
- "21. My condolences to my bankroll."
- "Blackjack! ...great."

### `bust`
- "Greed is a cruel mistress."
- "The spirit was willing but the math was not."
- "Bold strategy. Costly, but bold."
- "Should've stopped two cards ago."
- "Bust. I won't say I saw it coming. I saw it coming."

### `win`
- "You win. For now."
- "Fine. Take it."
- "The casino wins the war. You won a battle."
- "Enjoy it. The odds remember everything."
- "Beginner's luck. Or just luck. Hard to tell."

### `lose`
- "That's mine now. Thank you for your contribution."
- "Sorry. Actually, not that sorry."
- "Rough. But predictable."
- "The house wins. Shocking, I know."
- "Better luck next hand. There's always a next hand."

### `push`
- "Nobody wins. Nobody loses. Nobody has fun."
- "A tie. How anticlimactic."
- "We'll call it a draw. A coward's outcome."
- "Push. The world's most unsatisfying result."
- "We both walked away from that one."

### `surrender`
- "Half your bet, all your dignity."
- "Surrender accepted. Cowardice respected."
- "The bravest thing you can do is run."
- "Smart call. I was going to wreck you."
- "Lived to fight another hand."

---

## Bubble Lifecycle

1. Phase transitions to `'resolution'` → event determined → `triggerCatchphrase(event)` called
2. Random line picked, inserted into `#dealer-bubble`
3. CSS class `active` added → fade-in animation plays (0.3s)
4. `setTimeout` after 4.0s → `active` class removed → fade-out (0.5s)
5. After fade-out, bubble text cleared
6. Next hand begins cleanly with no residual bubble

**Guard:** if `triggerCatchphrase` is called while a bubble is already showing (shouldn't happen given one-per-hand rule), cancel the existing timeout and replace immediately.

---

## Files Changed

| File | Change |
|---|---|
| `js/catchphrases.js` | New — line pools + bubble logic |
| `game.html` | Add `#dealer-bubble` div inside `#dealer-area` |
| `css/table.css` | Speech bubble styles + animation |
| `js/game.js` | Detect resolution phase, call `triggerCatchphrase` |

---

## Out of Scope

- Text-to-speech
- Firebase sync (intentionally local)
- Per-player bubbles (one bubble only, reacts to local player outcome for player events)
- Manual host trigger
