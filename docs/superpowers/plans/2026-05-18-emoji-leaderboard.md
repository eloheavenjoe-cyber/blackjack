# Emoji Player-Spot Float + Leaderboard Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Float emojis from the sender's table spot, animate leaderboard row re-ordering, and add a bankroll column.

**Architecture:** Three focused changes across three files. `ui.js` tags each player spot with `data-uid` so `chat.js` can look up screen position at emit time. `leaderboard.js` switches from `Object.values` to `Object.entries` (to get uids), adds the BR column, and wraps its rebuild loop in a FLIP animation.

**Tech Stack:** Vanilla JS ES modules, Firebase Realtime Database, CSS transitions, `requestAnimationFrame`

**Spec:** `docs/superpowers/specs/2026-05-18-emoji-leaderboard-design.md`

---

## File Map

| File | Change |
|------|--------|
| `js/ui.js` | Add `spot.dataset.uid = pid` in `renderTableState` |
| `js/chat.js` | Update `listenEmojiReactions` callback; rewrite `spawnFloatingEmoji` with uid lookup |
| `js/leaderboard.js` | Switch to `Object.entries`, add BR column, add FLIP animation in `updateLeaderboard` |

No new files. No CSS changes. No Firebase schema changes.

---

## Task 1: Tag player spots with `data-uid`

**Files:**
- Modify: `js/ui.js` (around line 180 — the non-empty spot render path in `renderTableState`)

These DOM attributes are what allow `chat.js` to find a player's spot by uid at emoji-emit time. Empty spots must NOT get a `data-uid` or a stale uid from a prior render.

- [ ] **Step 1: Read the file before editing**

Read `js/ui.js` lines 166–185 to confirm the exact location of the non-empty spot render path.

- [ ] **Step 2: Clear `data-uid` on empty spots**

In the empty-spot branch (right after `spot.className = 'player-spot empty'`), add:

```js
spot.removeAttribute('data-uid');
```

- [ ] **Step 3: Set `data-uid` on occupied spots**

Immediately after `spot.className = 'player-spot' + ...` (the non-empty branch, around line 180), add:

```js
spot.dataset.uid = pid;
```

The diff in context:

```js
spot.className = 'player-spot' +
  (pid === room.currentTurn ? ' active-turn' : '') +
  (player.status === 'sitting-out' ? ' sitting-out' : '') +
  (isDisconnected ? ' disconnected' : '');
spot.dataset.uid = pid;   // <-- add this line
```

- [ ] **Step 4: Manual verify**

Open the game in a browser, open DevTools, inspect any occupied `#spot-N` — it should have a `data-uid` attribute equal to the player's Firebase uid. Empty spots should have none.

- [ ] **Step 5: Commit**

```bash
git add js/ui.js
git commit -m "feat: tag player spots with data-uid for emoji targeting"
```

---

## Task 2: Float emojis from the sender's player spot

**Files:**
- Modify: `js/chat.js` (lines 141–174 — `listenEmojiReactions` callback and `spawnFloatingEmoji`)

The `listenEmojiReactions` callback already receives `{ uid, emoji, ts }` — the uid is available, just unused. The animation keyframe (`translateY(-300px)`, 2.5s) is unchanged; only the spawn origin changes.

- [ ] **Step 1: Read the file before editing**

Read `js/chat.js` lines 140–175 to confirm the current `listenEmojiReactions` call and `spawnFloatingEmoji` definition.

- [ ] **Step 2: Update the `listenEmojiReactions` callback**

Change line 141 from:

```js
listenEmojiReactions(roomCode, ({ emoji }) => spawnFloatingEmoji(emoji));
```

to:

```js
listenEmojiReactions(roomCode, ev => spawnFloatingEmoji(ev.emoji, ev.uid));
```

- [ ] **Step 3: Rewrite `spawnFloatingEmoji`**

Replace the entire function (lines 166–174) with:

```js
function spawnFloatingEmoji(emoji, uid) {
  const el = document.createElement('span');
  el.className = 'emoji-float';
  el.textContent = emoji;

  if (uid) {
    const spot = document.querySelector(`[data-uid="${uid}"]`);
    if (spot) {
      const rect = spot.getBoundingClientRect();
      el.style.left = `${rect.left + rect.width / 2}px`;
      el.style.top = `${rect.top - 10}px`;
      document.body.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
      return;
    }
  }
  el.style.left = `${Math.random() * Math.min(280, window.innerWidth * 0.35)}px`;
  el.style.bottom = '48px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}
```

Note: when using the spot path, the element uses `top` (not `bottom`). The existing `translateY(-300px)` animation carries it upward regardless. The fallback (uid not found / spot not in DOM) preserves the old behavior exactly.

- [ ] **Step 4: Manual verify**

Have two browser tabs open in the same room. Click an emoji button in tab A. In tab B the emoji should float up from tab A's player spot on the table arc. Also verify: if you click from a seat that's currently empty (shouldn't happen but edge-case), it falls back gracefully.

- [ ] **Step 5: Commit**

```bash
git add js/chat.js
git commit -m "feat: float emojis from sender's player spot"
```

---

## Task 3: Leaderboard — BR column + FLIP animated re-sort

**Files:**
- Modify: `js/leaderboard.js` (full file — `initLeaderboard` and `updateLeaderboard`)

This task combines the BR column and FLIP animation because both require touching the same row-render loop, and doing them in two passes would mean writing the loop twice.

Key change in `updateLeaderboard`: switch from `Object.values(players)` to `Object.entries(players)` so each row has the player's uid for both the FLIP snapshot key and the `data-uid` attribute on `<tr>`.

- [ ] **Step 1: Read the file before editing**

Read `js/leaderboard.js` in full to confirm current state matches the session 14 implementation.

- [ ] **Step 2: Add `BR` column header in `initLeaderboard`**

In the `<thead>` inside `initLeaderboard`, change:

```html
<tr>
  <th>Player</th>
  <th title="Hands Won">W</th>
  <th>Wagered</th>
  <th>Profit</th>
</tr>
```

to:

```html
<tr>
  <th>Player</th>
  <th title="Bankroll">BR</th>
  <th title="Hands Won">W</th>
  <th>Wagered</th>
  <th>Profit</th>
</tr>
```

- [ ] **Step 3: Rewrite `updateLeaderboard`**

Replace the entire `updateLeaderboard` function with:

```js
export function updateLeaderboard(room) {
  const tbody = document.getElementById('lb-tbody');
  if (!tbody) return;

  const oldTops = {};
  for (const tr of tbody.querySelectorAll('tr[data-uid]')) {
    oldTops[tr.dataset.uid] = tr.getBoundingClientRect().top;
  }

  const players = room?.players || {};
  const entries = Object.entries(players)
    .filter(([, p]) => !p.kicked)
    .sort(([, a], [, b]) => (b.sessionProfit || 0) - (a.sessionProfit || 0));

  tbody.innerHTML = '';
  const newRows = [];

  for (const [uid, p] of entries) {
    const profit  = p.sessionProfit || 0;
    const wagered = p.totalWagered  || 0;
    const streak  = p.winStreak     || 0;

    const streakHtml = streak >= 2
      ? ` <span class="streak-badge">🔥${streak}</span>`
      : '';
    const profitClass = profit > 0 ? 'lb-profit-pos' : profit < 0 ? 'lb-profit-neg' : '';
    const profitStr   = profit > 0 ? `+$${fmt(profit)}` : profit < 0 ? `-$${fmt(-profit)}` : '$0';

    const tr = document.createElement('tr');
    tr.dataset.uid = uid;
    tr.innerHTML = `
      <td>${escapeHtml(p.name)}${p.isHost ? ' ♛' : ''}${streakHtml}</td>
      <td>$${fmt(p.balance || 0)}</td>
      <td>${p.handsWon || 0}</td>
      <td>$${fmt(wagered)}</td>
      <td class="${profitClass}">${profitStr}</td>
    `;
    tbody.appendChild(tr);
    newRows.push({ tr, uid });
  }

  if (Object.keys(oldTops).length === 0) return;

  for (const { tr, uid } of newRows) {
    const oldTop = oldTops[uid];
    if (oldTop === undefined) continue;
    const newTop = tr.getBoundingClientRect().top;
    const delta = oldTop - newTop;
    if (delta === 0) continue;
    tr.style.transform = `translateY(${delta}px)`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tr.style.transition = 'transform 350ms ease';
        tr.style.transform = 'translateY(0)';
        tr.addEventListener('transitionend', () => {
          tr.style.transition = '';
          tr.style.transform = '';
        }, { once: true });
      });
    });
  }
}
```

Why double `requestAnimationFrame`: the first rAF runs after the browser processes the layout with the inverse transform applied; the second ensures we're in a fresh paint cycle before enabling the transition, which is required for the browser to animate from the displaced position to the natural one.

- [ ] **Step 4: Manual verify — BR column**

Open the leaderboard in a live game. Confirm the column order is `Player | BR | W | Wagered | Profit` and the BR column shows each player's current balance as `$N`.

- [ ] **Step 5: Manual verify — animated re-sort**

Play through a full round where at least two players have different outcomes. After dealer resolution, watch the leaderboard — rows should smoothly slide into new positions rather than jumping. If rankings don't change (same order after round), no animation plays — that's correct.

- [ ] **Step 6: Manual verify — sort is live**

Confirm the leaderboard re-orders immediately after each round ends without needing to collapse and reopen the panel.

- [ ] **Step 7: Commit**

```bash
git add js/leaderboard.js
git commit -m "feat: add BR column and FLIP animated re-sort to leaderboard"
```

---

## Done

All three features are live. No Firebase rules deploy needed. Push to master to deploy to GitHub Pages:

```bash
git push origin master
```
