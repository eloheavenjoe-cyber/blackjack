export function renderSeats(room, myUid, myHoleCards) {
  const container = document.getElementById('seats');
  container.innerHTML = '';

  const players = Object.entries(room.players || {})
    .filter(([, p]) => !p.sittingOut || p.stack > 0)
    .sort(([, a], [, b]) => a.seat - b.seat);

  for (const [uid, player] of players) {
    const div = document.createElement('div');
    div.className = 'seat' +
      (room.actionSeat === player.seat ? ' active-turn' : '') +
      (player.folded ? ' folded' : '') +
      (player.sittingOut ? ' sitting-out' : '');
    div.dataset.seat = player.seat;

    const badges = [];
    if (player.seat === room.dealerSeat) badges.push('<span class="seat-badge dealer">D</span>');
    const { sbSeat, bbSeat } = getBlindsSeats(room);
    if (player.seat === sbSeat) badges.push('<span class="seat-badge sb">SB</span>');
    if (player.seat === bbSeat) badges.push('<span class="seat-badge bb">BB</span>');

    const isMe = uid === myUid;
    let cards;
    if (isMe && myHoleCards) {
      cards = myHoleCards.map(c => renderCardFaceUp(c)).join('');
    } else if (player.showCards) {
      cards = player.showCards.map(renderCardFaceUpFromStr).join('');
    } else if (!player.folded) {
      cards = '<div class="card card-back"></div><div class="card card-back"></div>';
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

function renderCardFaceUp(card) {
  return `<div class="card rank-${card.rank} suit-${card.suit}"></div>`;
}

function renderCardFaceUpFromStr(str) {
  const idx = str.indexOf('_');
  return renderCardFaceUp({ rank: str.slice(0, idx), suit: str.slice(idx + 1) });
}

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
