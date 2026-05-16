# Multiplayer Browser Blackjack — Design Spec
**Date:** 2026-05-16  
**Status:** Approved

---

## Overview

A multiplayer browser-based blackjack game hosted on GitHub Pages. Up to 4 players join via room code, play against an automated dealer, with fully customizable casino rules. No build tools — plain HTML/CSS/JS. Real-time sync via Firebase Realtime Database.

---

## Architecture

**Approach:** Host-authoritative client + Firebase Realtime Database.

- The host's browser runs all game logic (shuffle, deal, hand resolution).
- Other players connect via room code, receive state via Firebase listeners, and write only their own actions (bets, hit/stand/etc.) to their own Firebase node.
- Host watches all player action nodes and drives the game forward.
- No cloud functions. No backend server. Fully static.

**Firebase state tree:**
```
rooms/{roomCode}/
  settings: { decks, blackjackPayout, dealerHitSoft17, doubleDown, doubleAfterSplit, reSplit, surrender, insurance, minBet, maxBet, startingBalance, actionTimer }
  phase: "waiting" | "betting" | "dealing" | "playing" | "resolution"
  players: {
    [playerId]: { name, balance, bet, hand, status, isHost }
  }
  dealer: { hand, hiddenCard }
  hostId: "..."
  currentTurn: "playerId"
  turnDeadline: <unix timestamp>  // for timer enforcement
```

---

## UI / Table Layout

**Theme:** Dark atmospheric casino. Deep brown/black background with CSS pillar/column decorative elements. Table is a large D-shaped arc (tan/brown CSS felt gradient) occupying the lower ~60% of the viewport.

**Zones:**

| Zone | Content |
|---|---|
| Top center | Dealer area: SVG dealer avatar, dealer cards, circular countdown timer ring |
| Table center | Printed table rules text, chip denomination selector (during betting) |
| Bottom arc | 4 player spots, left-to-right. Each: name tag, cards, chip stack, bet amount |
| Active player spot | Highlighted with glow. Action buttons inline: Hit / Stand / Double / Split / Surrender |
| Bottom-left HUD | Balance, current bet, total bet |
| Right edge | Decorative card shoe SVG |

**Player spots:** Always rendered for 4 positions. Empty spots show an "Open" placeholder. Players who sit out (broke or inactive) show a greyed-out state.

**Cards:** htdebeer/SVG-cards (MIT licensed), included as local assets. Deal animation slides cards from the shoe to each player spot. Hidden dealer card shows card-back SVG.

**Chips:** SVG chips, color-coded by denomination:
- White = 1
- Red = 5
- Green = 25
- Black = 100
- Purple = 500

---

## Game Flow

```
waiting → betting → dealing → playing → resolution → waiting (loops)
```

### Waiting (Lobby)
- Players see room code and connected player list.
- Host sees full settings panel. Non-hosts see read-only rules summary.
- Host clicks "Start Game" to advance to betting.
- Table felt text updates dynamically to reflect current payout/dealer rules.

### Betting
- All players place bets simultaneously.
- Per-action timer counts down (configurable). Players who don't bet in time sit out the round.
- Host can force-advance.
- Chip selector UI shown in table center.

### Dealing
- Host deals 2 cards to each active player and 2 to dealer (one dealer card face-down).
- If dealer shows Ace and insurance is enabled: insurance prompt shown to all players before play begins.

### Playing
- Players act in turn order (left to right).
- Active player's spot is highlighted; action buttons appear.
- Per-action timer counts down per decision. On timeout: auto-stand.
- Split hands played sequentially on the same spot.
- Blackjack (21 on first 2 cards) resolved immediately with payout — player doesn't wait for others.
- Bust resolved immediately — player hand is marked, turn skips to next player.

### Resolution
- Dealer's hidden card revealed.
- Dealer plays by house rules (configurable: hit/stand on soft 17).
- All remaining hands evaluated vs dealer.
- Win/loss/push animations and balance updates.
- Results displayed for ~5 seconds, then auto-advance to betting phase.

### Edge Cases
- Player runs out of chips: sits out future rounds, stays in room, can receive chip donations.
- Host disconnects: game freezes (Firebase state preserved). If host reconnects, game resumes. No automatic host migration (out of scope).

---

## Rules & Settings

Configurable by host in lobby. Locked once game starts. Synced to all players via Firebase.

| Setting | Options | Default |
|---|---|---|
| Number of decks | 1, 2, 4, 6, 8 | 6 |
| Blackjack payout | 3:2, 6:5, 1:1 | 3:2 |
| Dealer hits soft 17 | Yes / No | No |
| Double down | Any two cards / 9-10-11 only / Off | Any two cards |
| Double after split | Yes / No | Yes |
| Re-split | Off / Up to 2 / Up to 3 / Up to 4 | Up to 2 |
| Surrender | Off / Late / Early | Late |
| Insurance | Yes / No | Yes |
| Minimum bet | 1–500 (slider) | 5 |
| Maximum bet | Min–1000 (slider) | 500 |
| Starting balance | 100–10,000 (slider) | 1,000 |
| Action timer | Off / 15s / 30s / 60s / Custom | 30s |

---

## Social Features

### Chip Donations
- Any player can open a "Send Chips" panel via a button in their HUD.
- Select recipient from active player list, enter amount, confirm.
- Transfer is instant — both balances update in Firebase immediately.
- Constraints: only from own balance, cannot exceed own balance, only available during **waiting** or **betting** phase (blocked during active hand).

---

## Technical Stack & File Structure

**Stack:**
- Vanilla JS (ES modules via `<script type="module">`)
- Firebase Realtime Database v9 modular SDK (CDN)
- SVG cards: htdebeer/SVG-cards (local assets)
- Pure CSS animations for card dealing, chip stacking, timer ring
- No bundler, no framework, no build step

**File structure:**
```
blackjack/
  index.html              — lobby / room join screen
  game.html               — main game table
  css/
    base.css              — reset, fonts, CSS variables, dark theme
    lobby.css             — lobby, settings panel, player list
    table.css             — felt, player spots, dealer area, background
    cards.css             — card layout, deal animations, flip animation
    chips.css             — chip stack rendering, denomination selector
    hud.css               — balance strip, timer ring, notifications
  js/
    engine.js             — pure game logic (no Firebase dependency)
    room.js               — Firebase read/write, room lifecycle, host logic
    ui.js                 — DOM rendering, Firebase state listeners
    timer.js              — countdown logic, auto-action on timeout
    settings.js           — settings panel, validation, Firebase sync
    donate.js             — chip transfer logic
  assets/
    cards/                — SVG card files (htdebeer/SVG-cards)
    chips/                — SVG chip files
    sounds/               — (optional) deal, win, chip sounds
  firebase-config.js      — Firebase project credentials (public read-only key)
  docs/
    superpowers/
      specs/
        2026-05-16-blackjack-design.md
```

**Hosting:** GitHub Pages from the `main` branch root. Firebase credentials are safe to expose (Realtime Database security rules restrict write access to valid room participants).

**Firebase Security Rules:**
```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": true,
        ".write": false,
        "settings": {
          ".write": "data.parent().child('hostId').val() === auth.uid || !data.exists()"
        },
        "phase": {
          ".write": "data.parent().child('hostId').val() === auth.uid"
        },
        "dealer": {
          ".write": "data.parent().child('hostId').val() === auth.uid"
        },
        "currentTurn": {
          ".write": "data.parent().child('hostId').val() === auth.uid"
        },
        "turnDeadline": {
          ".write": "data.parent().child('hostId').val() === auth.uid"
        },
        "players": {
          "$playerId": {
            ".write": "$playerId === auth.uid || data.parent().parent().child('hostId').val() === auth.uid"
          }
        },
        "hostId": {
          ".write": "!data.exists()"
        }
      }
    }
  }
}
```
Anonymous Firebase Auth is used — players sign in anonymously on page load, giving them a stable `auth.uid` for the session. No account creation required.

**Mid-session joins:** A new player who enters a room code while a game is in the "playing" or "dealing" phase is added to the player list but marked as sitting out. They join from the next betting phase.

---

## Out of Scope
- Persistent accounts / balance history
- Chat system
- Mobile-first layout (desktop-first, mobile can be a later pass)
- Host migration on disconnect
- Spectator mode
