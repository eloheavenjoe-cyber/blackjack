import { handValue, isBlackjack, isBust, cardFromStr } from './engine.js';
import * as sound from './sound.js';

const RANK_MAP = { A: '1', J: 'jack', Q: 'queen', K: 'king' };
const SUIT_MAP = { hearts: 'heart', diamonds: 'diamond', clubs: 'club', spades: 'spade' };

export function cardToSvgId(card) {
  const rank = RANK_MAP[card.rank] || card.rank;
  const suit = SUIT_MAP[card.suit] || card.suit;
  return `${suit}_${rank}`;
}

export function renderCard(card, animate = false) {
  const wrap = document.createElement('div');
  wrap.className = 'card-wrap' + (animate ? ' dealing' : '');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'card-svg');
  svg.setAttribute('viewBox', '0 0 169.075 244.64');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `assets/cards/svg-cards.svg#${card ? cardToSvgId(card) : 'back'}`);
  svg.appendChild(use);
  wrap.appendChild(svg);
  return wrap;
}

export function renderHandEl(cardStrs, animate = false) {
  const frag = document.createDocumentFragment();
  const cards = (cardStrs || []).map(cardFromStr);

  if (cards.length > 0) {
    const val = handValue(cards);
    const badge = document.createElement('div');
    badge.className = 'hand-value' +
      (isBust(cards) ? ' bust' : isBlackjack(cards) ? ' blackjack' : '');
    badge.textContent = isBust(cards) ? 'Bust' : isBlackjack(cards) ? 'BJ' : val;
    frag.appendChild(badge);
  }

  const handDiv = document.createElement('div');
  handDiv.className = 'hand';
  cards.forEach((card, i) => {
    const el = renderCard(card, animate);
    if (animate) el.style.animationDelay = `${i * 0.12}s`;
    handDiv.appendChild(el);
  });
  frag.appendChild(handDiv);

  return frag;
}

const CHIP_DENOMS = [500, 100, 25, 5, 1];

export function renderChipSelector(minBet, maxBet, currentBet, balance, onChipClick) {
  const div = document.createElement('div');
  div.className = 'chip-selector';
  for (const denom of [1, 5, 25, 100, 500]) {
    if (denom > balance || currentBet + denom > maxBet) continue;
    const btn = document.createElement('button');
    btn.className = 'chip-btn';
    btn.title = `+${denom}`;
    const img = document.createElement('img');
    img.src = `assets/chips/chip-${denom}.svg`;
    img.alt = String(denom);
    btn.appendChild(img);
    btn.addEventListener('click', () => onChipClick(denom));
    div.appendChild(btn);
  }
  return div;
}

export function renderChipStack(amount, onRemove = null) {
  const stack = document.createElement('div');
  stack.className = 'chip-stack';
  let remaining = amount;
  const chips = [];
  for (const d of CHIP_DENOMS) {
    while (remaining >= d) { chips.push(d); remaining -= d; }
  }
  chips.slice(0, 8).forEach(d => {
    const img = document.createElement('img');
    img.className = 'chip-stack-chip';
    img.src = `assets/chips/chip-${d}.svg`;
    img.alt = String(d);
    if (onRemove) {
      img.classList.add('chip-stack-chip--removable');
      img.title = `−${d}`;
      img.addEventListener('click', () => onRemove(d));
    }
    stack.appendChild(img);
  });
  const label = document.createElement('div');
  label.className = 'bet-amount';
  label.textContent = amount > 0 ? `$${amount}` : '';
  stack.appendChild(label);
  return stack;
}

const TIMER_RADIUS = 20;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;

export function createTimerRing(totalMs) {
  const wrap = document.createElement('div');
  wrap.className = 'timer-ring-wrap';

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '48'); svg.setAttribute('height', '48');
  svg.setAttribute('viewBox', '0 0 48 48');

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bg.setAttribute('class', 'timer-ring-bg');
  bg.setAttribute('cx', '24'); bg.setAttribute('cy', '24'); bg.setAttribute('r', TIMER_RADIUS);

  const fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  fg.setAttribute('class', 'timer-ring-fg');
  fg.setAttribute('cx', '24'); fg.setAttribute('cy', '24'); fg.setAttribute('r', TIMER_RADIUS);
  fg.setAttribute('stroke-dasharray', TIMER_CIRCUMFERENCE);
  fg.setAttribute('stroke-dashoffset', '0');

  svg.appendChild(bg);
  svg.appendChild(fg);

  const text = document.createElement('div');
  text.className = 'timer-text';
  text.textContent = Math.ceil(totalMs / 1000);

  wrap.appendChild(svg);
  wrap.appendChild(text);

  wrap._fg = fg;
  wrap._text = text;
  wrap._total = totalMs;

  return wrap;
}

export function updateTimerRing(wrap, remainingMs) {
  const pct = Math.max(0, remainingMs / wrap._total);
  wrap._fg.setAttribute('stroke-dashoffset', TIMER_CIRCUMFERENCE * (1 - pct));
  wrap._text.textContent = Math.ceil(remainingMs / 1000);
  if (remainingMs < 5000) wrap._fg.setAttribute('stroke', 'var(--clr-lose)');
}

let lastDealerRenderKey = null;

const SPOT_IDS = ['spot-0', 'spot-1', 'spot-2', 'spot-3', 'spot-4', 'spot-5'];

function formatBalance(n) {
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function renderTableState(room, myUid, onRemoveChip = null) {
  if (!room) return;
  const players = room.players || {};
  const playerEntries = Object.entries(players).filter(([, p]) => !p.kicked);
  const settings = room.settings || {};

  const payoutEl = document.getElementById('rule-payout');
  if (payoutEl) payoutEl.textContent = `BLACKJACK PAYS ${(settings.blackjackPayout || '3:2').replace(':', ' TO ')}`;
  const dealerEl = document.getElementById('rule-dealer');
  if (dealerEl) dealerEl.textContent = settings.dealerHitSoft17 ? 'Dealer hits soft 17' : 'Dealer must stand on all 17s';

  renderDealerAreaEl(room.dealer, room.phase);

  SPOT_IDS.forEach((spotId, i) => {
    const spot = document.getElementById(spotId);
    if (!spot) return;
    spot.innerHTML = '';
    const [pid, player] = playerEntries[i] || [null, null];
    if (!player) {
      spot.className = 'player-spot empty';
      spot.removeAttribute('data-uid');
      const label = document.createElement('div');
      label.className = 'player-name';
      label.textContent = 'Open';
      spot.appendChild(label);
      return;
    }
    const isDisconnected = player.connected === false;
    spot.className = 'player-spot' +
      (pid === room.currentTurn ? ' active-turn' : '') +
      (player.status === 'sitting-out' ? ' sitting-out' : '') +
      (isDisconnected ? ' disconnected' : '');
    spot.dataset.uid = pid;

    const nameEl = document.createElement('div');
    nameEl.className = 'player-name';
    nameEl.appendChild(document.createTextNode(player.name + (player.isHost ? ' ♛' : '')));
    if ((player.winStreak || 0) >= 2) {
      const badge = document.createElement('span');
      badge.className = 'streak-badge pop';
      badge.textContent = ` 🔥${player.winStreak}`;
      nameEl.appendChild(badge);
      badge.addEventListener('animationend', () => badge.classList.remove('pop'), { once: true });
    }
    spot.appendChild(nameEl);

    const balEl = document.createElement('div');
    if (isDisconnected) {
      balEl.className = 'player-balance disconnected-badge';
      balEl.textContent = 'Disconnected';
    } else {
      balEl.className = 'player-balance';
      balEl.textContent = `$${formatBalance(player.balance)}`;
    }
    spot.appendChild(balEl);

    const hands = player.hands || [];
    if (hands.length > 1) {
      spot.classList.add('multi-hand');
      const handsRow = document.createElement('div');
      handsRow.className = 'hands-row';
      hands.forEach((handStrs, hi) => {
        const isActiveHand = hi === (player.handIndex || 0) && pid === room.currentTurn;
        const cell = document.createElement('div');
        cell.className = 'hand-cell' + (isActiveHand ? ' active-hand' : '');
        cell.appendChild(renderHandEl(handStrs, false));
        if (player.bets && player.bets[hi]) cell.appendChild(renderChipStack(player.bets[hi]));
        handsRow.appendChild(cell);
      });
      spot.appendChild(handsRow);
    } else {
      hands.forEach((handStrs, hi) => {
        const isActiveHand = hi === (player.handIndex || 0) && pid === room.currentTurn;
        const frag = renderHandEl(handStrs, false);
        if (isActiveHand) {
          const wrap = document.createElement('div');
          wrap.style.outline = '2px solid gold';
          wrap.style.borderRadius = '6px';
          wrap.appendChild(frag);
          spot.appendChild(wrap);
        } else {
          spot.appendChild(frag);
        }
        if (player.bets && player.bets[hi]) spot.appendChild(renderChipStack(player.bets[hi]));
      });
    }

    if (room.phase === 'betting' && player.bet > 0) {
      const canRemove = onRemoveChip && pid === myUid && player.status !== 'ready';
      spot.appendChild(renderChipStack(player.bet, canRemove ? onRemoveChip : null));
    }
  });

  const me = players[myUid];
  if (me) {
    const balEl = document.getElementById('hud-balance');
    if (balEl) balEl.textContent = `$${me.balance - (me.bet || 0)}`;
    const betEl = document.getElementById('hud-bet');
    const totalBet = me.bets && me.bets.length > 0
      ? me.bets.reduce((s, b) => s + b, 0)
      : (me.bet || 0);
    if (betEl) betEl.textContent = `$${totalBet}`;
  }

  updatePhaseUI(room, myUid, players[myUid]);

  const shoeEl = document.getElementById('shoe-display');
  if (shoeEl) {
    shoeEl.textContent = room.cardsRemaining != null
      ? `Shoe: ${(room.cardsRemaining / 52).toFixed(1)} decks`
      : '';
  }

  const countEl = document.getElementById('count-display');
  if (countEl) {
    countEl.hidden = !room.showCount;
    if (room.showCount && room.cardsRemaining) {
      const rc = room.runningCount || 0;
      const tc = rc / (room.cardsRemaining / 52);
      const rcEl = document.getElementById('rc-value');
      const tcEl = document.getElementById('tc-value');
      if (rcEl) rcEl.textContent = `RC: ${rc >= 0 ? '+' : ''}${rc}`;
      if (tcEl) tcEl.textContent = `TC: ${tc >= 0 ? '+' : ''}${tc.toFixed(1)}`;
    }
  }

  const countBtn = document.getElementById('btn-toggle-count');
  if (countBtn) countBtn.textContent = room.showCount ? 'Hide Count' : 'Show Count';
}

function renderDealerAreaEl(dealer, phase) {
  const wrap = document.getElementById('dealer-hand-wrap');
  if (!wrap) return;
  const dealerKey = JSON.stringify({ hand: dealer?.hand ?? null, hidden: dealer?.hiddenCard ?? null, phase });
  if (dealerKey === lastDealerRenderKey) return;
  lastDealerRenderKey = dealerKey;
  wrap.innerHTML = '';
  if (!dealer || !dealer.hand || dealer.hand.length === 0) return;

  const visibleCards = dealer.hand.map(cardFromStr);
  const handDiv = document.createElement('div');
  handDiv.className = 'hand';
  visibleCards.forEach(card => handDiv.appendChild(renderCard(card)));

  if (phase === 'playing' || phase === 'dealing') {
    handDiv.appendChild(renderCard(null));
  } else if (phase === 'resolution' && dealer.hiddenCard) {
    const revealed = renderCard(cardFromStr(dealer.hiddenCard));
    revealed.classList.add('flipping');
    handDiv.appendChild(revealed);
    sound.play('dealer_reveal');
  }
  if ((phase === 'playing' || phase === 'dealing') && visibleCards.length > 0) {
    const badge = document.createElement('div');
    badge.className = 'hand-value';
    badge.textContent = handValue(visibleCards);
    wrap.appendChild(badge);
  }
  if (dealer.hand.length > 0 && phase === 'resolution') {
    const allCards = [...visibleCards];
    if (dealer.hiddenCard) allCards.push(cardFromStr(dealer.hiddenCard));
    const badge = document.createElement('div');
    badge.className = 'hand-value';
    badge.textContent = handValue(allCards);
    wrap.appendChild(badge);
  }
  wrap.appendChild(handDiv);
}

function updatePhaseUI(room, myUid, me) {
  const actionWrap = document.getElementById('action-buttons');
  const chipWrap = document.getElementById('chip-selector-wrap');
  const hostCtrl = document.getElementById('host-controls');
  if (!actionWrap || !chipWrap) return;

  actionWrap.hidden = true;
  chipWrap.hidden = true;
  if (hostCtrl) hostCtrl.hidden = (room.hostId !== myUid);

  if (room.phase === 'betting') {
    chipWrap.hidden = false;
  }

  if (!me) return;

  if (room.phase === 'playing' && room.currentTurn === myUid && me?.status === 'playing') {
    actionWrap.hidden = false;
  }
}
