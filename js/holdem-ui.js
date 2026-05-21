export function renderSeats(room, myUid, myHoleCards) {
  const container = document.getElementById('seats');
  container.innerHTML = '';

  const playersBySeat = {};
  for (const [uid, p] of Object.entries(room.players || {})) {
    if (!p.sittingOut || p.stack > 0) playersBySeat[p.seat] = { uid, player: p };
  }

  const { sbSeat, bbSeat } = getBlindsSeats(room);

  for (let seatIdx = 0; seatIdx < 7; seatIdx++) {
    const entry = playersBySeat[seatIdx];
    const div = document.createElement('div');
    div.dataset.seat = seatIdx;

    if (!entry) {
      div.className = 'seat empty';
      div.innerHTML = '<div class="player-name">Open</div>';
      container.appendChild(div);
      continue;
    }

    const { uid, player } = entry;
    div.dataset.uid = uid;
    div.className = 'seat' +
      (room.actionSeat === player.seat ? ' active-turn' : '') +
      (player.folded ? ' folded' : '') +
      (player.sittingOut ? ' sitting-out' : '');

    const badges = [];
    if (player.seat === room.dealerSeat) badges.push('<span class="seat-badge dealer">D</span>');
    if (player.seat === sbSeat) badges.push('<span class="seat-badge sb">SB</span>');
    if (player.seat === bbSeat) badges.push('<span class="seat-badge bb">BB</span>');

    const isMe = uid === myUid;
    let cards;
    if (isMe && myHoleCards) {
      cards = myHoleCards.map(c => renderCardFaceUp(c)).join('');
    } else if (player.showCards) {
      cards = player.showCards.map(renderCardFaceUpFromStr).join('');
    } else if (!player.folded) {
      cards = CARD_BACK + CARD_BACK;
    } else {
      cards = '';
    }

    div.innerHTML = `
      <div class="hole-cards">${cards}</div>
      <div class="player-name">${player.name}</div>
      <div class="player-stack">$${player.stack ?? 0}</div>
      ${player.streetBet > 0 ? `<div class="street-bet">$${player.streetBet}</div>` : ''}
      <div style="display:flex;gap:3px">${badges.join('')}</div>
    `;
    container.appendChild(div);
  }
}

export function renderCommunityCards(cards) {
  const container = document.getElementById('community-cards');
  container.innerHTML = (cards || []).map(c =>
    typeof c === 'string'
      ? renderCardFaceUpFromStr(c)
      : renderCardFaceUp(c)
  ).join('');
}

export function renderPot(room) {
  document.getElementById('main-pot').textContent = `Pot: $${room.pot || 0}`;
  const sideDiv = document.getElementById('side-pots');
  sideDiv.innerHTML = (room.sidePots || []).map((sp, i) =>
    `<div>Side Pot ${i + 1} (${sp.eligiblePlayers.length}p): $${sp.amount}</div>`
  ).join('');
}

export function showShowdownCards(players) {
  for (const [uid, player] of Object.entries(players)) {
    if (player.folded || !player.showCards) continue;
    const seatEl = document.querySelector(`.seat[data-seat="${player.seat}"] .hole-cards`);
    if (!seatEl) continue;
    seatEl.innerHTML = player.showCards.map(renderCardFaceUpFromStr).join('');
  }
}

export function showWinnerMessage(name, handName) {
  const el = document.getElementById('status-msg');
  el.textContent = handName ? `${name} wins — ${handName}` : handName || name;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 3500);
}

export function renderActionControls(myPlayer, room, onAction) {
  const ctrl = document.getElementById('action-controls');
  if (!myPlayer || room.phase === 'waiting' || room.actionSeat !== myPlayer.seat || myPlayer.folded || myPlayer.allIn) {
    ctrl.classList.add('hidden');
    return;
  }
  ctrl.classList.remove('hidden');

  const currentBet = room.currentBet || 0;
  const callAmount = Math.min(currentBet - (myPlayer.streetBet || 0), myPlayer.stack || 0);
  const canCheck = callAmount <= 0;
  const { bb } = parseBlinds(room.settings.blindPreset);
  const minRaise = Math.max(room.minRaise || bb, bb);

  const checkBtn = document.getElementById('btn-check');
  const callBtn  = document.getElementById('btn-call');
  if (canCheck) {
    checkBtn.classList.remove('hidden');
    callBtn.classList.add('hidden');
  } else {
    checkBtn.classList.add('hidden');
    callBtn.classList.remove('hidden');
    document.getElementById('call-amount').textContent = `$${callAmount}`;
  }

  const raiseArea = document.getElementById('raise-area');
  if (myPlayer.stack > callAmount) {
    raiseArea.classList.remove('hidden');
    const slider = document.getElementById('raise-slider');
    const raiseMin = callAmount + minRaise;
    slider.min = raiseMin;
    slider.max = myPlayer.stack;
    slider.value = Math.min(raiseMin, myPlayer.stack);
    document.getElementById('raise-display').textContent = `$${slider.value}`;
    slider.oninput = () => {
      document.getElementById('raise-display').textContent = `$${slider.value}`;
    };
  } else {
    raiseArea.classList.add('hidden');
  }

  rewire('btn-fold',  () => onAction({ type: 'fold' }));
  rewire('btn-check', () => onAction({ type: 'check' }));
  rewire('btn-call',  () => onAction({ type: 'call', amount: callAmount }));
  rewire('btn-raise', () => {
    const amount = parseInt(document.getElementById('raise-slider').value, 10);
    onAction({ type: 'raise', amount });
  });
  rewire('btn-allin', () => onAction({ type: 'raise', amount: myPlayer.stack }));
}

export function startTimer(seconds, onExpire) {
  const bar = document.getElementById('timer-bar');
  const container = document.getElementById('timer-bar-container');
  container.classList.remove('hidden');
  bar.style.width = '100%';
  const start = Date.now();
  const interval = setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    const pct = Math.max(0, 100 - (elapsed / seconds) * 100);
    bar.style.width = pct + '%';
    if (elapsed >= seconds) {
      clearInterval(interval);
      container.classList.add('hidden');
      onExpire();
    }
  }, 200);
  return () => clearInterval(interval);
}

function getBlindsSeats(room) {
  const seats = Object.values(room.players || {})
    .filter(p => !p.sittingOut)
    .map(p => p.seat)
    .sort((a, b) => a - b);
  if (seats.length < 2) return { sbSeat: -1, bbSeat: -1 };
  const n = seats.length;
  const dealerIdx = seats.indexOf(room.dealerSeat);
  const sbSeat = n === 2 ? seats[dealerIdx]           : seats[(dealerIdx + 1) % n];
  const bbSeat = n === 2 ? seats[(dealerIdx + 1) % n] : seats[(dealerIdx + 2) % n];
  return { sbSeat, bbSeat };
}

const RANK_SVG = { A: '1', J: 'jack', Q: 'queen', K: 'king' };
const SUIT_SVG = { hearts: 'heart', diamonds: 'diamond', clubs: 'club', spades: 'spade' };

function cardSvg(rank, suit, faceDown = false) {
  const r = RANK_SVG[rank] || rank;
  const s = SUIT_SVG[suit] || suit;
  const id = faceDown ? 'back' : `${s}_${r}`;
  return `<div class="card-wrap${faceDown ? ' face-down' : ''}"><svg class="card-svg" viewBox="0 0 169.075 244.64"><use href="assets/cards/svg-cards.svg#${id}"></use></svg></div>`;
}

function renderCardFaceUp(card) {
  return cardSvg(card.rank, card.suit);
}

function renderCardFaceUpFromStr(str) {
  const idx = str.indexOf('_');
  return cardSvg(str.slice(0, idx), str.slice(idx + 1));
}

const CARD_BACK = cardSvg('', '', true);

function parseBlinds(preset) {
  const [sb, bb] = preset.split('/').map(Number);
  return { sb, bb };
}

function rewire(id, handler) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);
  fresh.addEventListener('click', handler);
}

/* ── Round counter ───────────────────────────────────────────────────────── */

let _lastRenderedRound = null;

export function updateRoundCounter(n) {
  const cell = document.querySelector('#round-counter .flip-cell');
  if (!cell) return;
  if (_lastRenderedRound === null) {
    cell.textContent = n;
    _lastRenderedRound = n;
    return;
  }
  if (n === _lastRenderedRound) return;
  _lastRenderedRound = n;
  cell.classList.remove('flip-in');
  cell.classList.add('flip-out');
  cell.addEventListener('animationend', function onOut() {
    cell.textContent = n;
    cell.classList.remove('flip-out');
    cell.classList.add('flip-in');
    cell.addEventListener('animationend', function onIn() {
      cell.classList.remove('flip-in');
    }, { once: true });
  }, { once: true });
}

/* ── Holdem leaderboard ──────────────────────────────────────────────────── */

let _lbDragging = false;
let _lbOffsetX = 0;
let _lbOffsetY = 0;
let _lbCollapsed = false;

export function initHoldemLeaderboard() {
  const region = document.getElementById('leaderboard-region');
  if (!region) return;

  region.innerHTML = `
    <div id="lb-panel">
      <div id="lb-header">
        <span>📊 Leaderboard</span>
        <button id="lb-toggle">−</button>
      </div>
      <div id="lb-body">
        <table id="lb-table">
          <thead>
            <tr>
              <th>Player</th>
              <th title="Chip Stack">Stack</th>
              <th title="Hands Won">W</th>
            </tr>
          </thead>
          <tbody id="lb-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('lb-toggle').addEventListener('click', () => {
    _lbCollapsed = !_lbCollapsed;
    document.getElementById('lb-panel').classList.toggle('collapsed', _lbCollapsed);
    document.getElementById('lb-toggle').textContent = _lbCollapsed ? '+' : '−';
  });

  const header = document.getElementById('lb-header');
  header.addEventListener('mousedown', e => {
    if (e.target.id === 'lb-toggle') return;
    _lbDragging = true;
    const rect = region.getBoundingClientRect();
    region.style.left = rect.left + 'px';
    region.style.top  = rect.top  + 'px';
    _lbOffsetX = e.clientX - rect.left;
    _lbOffsetY = e.clientY - rect.top;
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!_lbDragging) return;
    region.style.left = (e.clientX - _lbOffsetX) + 'px';
    region.style.top  = (e.clientY - _lbOffsetY) + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!_lbDragging) return;
    _lbDragging = false;
    header.style.cursor = 'grab';
  });
}

export function updateHoldemLeaderboard(room) {
  const tbody = document.getElementById('lb-tbody');
  if (!tbody) return;

  const players = Object.entries(room?.players || {})
    .filter(([, p]) => !p.kicked)
    .sort(([, a], [, b]) => (b.stack || 0) - (a.stack || 0));

  tbody.innerHTML = '';
  for (const [, p] of players) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(p.name)}</td>
      <td>$${p.stack ?? 0}</td>
      <td>${p.handsWon || 0}</td>
    `;
    tbody.appendChild(tr);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
