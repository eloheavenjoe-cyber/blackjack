import { handValue, isBlackjack, isBust, cardFromStr } from './engine.js';

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
  const handDiv = document.createElement('div');
  handDiv.className = 'hand';

  const cards = (cardStrs || []).map(cardFromStr);
  cards.forEach((card, i) => {
    const el = renderCard(card, animate);
    if (animate) el.style.animationDelay = `${i * 0.12}s`;
    handDiv.appendChild(el);
  });

  frag.appendChild(handDiv);

  if (cards.length > 0) {
    const val = handValue(cards);
    const badge = document.createElement('div');
    badge.className = 'hand-value' +
      (isBust(cards) ? ' bust' : isBlackjack(cards) ? ' blackjack' : '');
    badge.textContent = isBust(cards) ? 'Bust' : isBlackjack(cards) ? 'BJ' : val;
    frag.appendChild(badge);
  }
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

export function renderChipStack(amount) {
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

const SPOT_IDS = ['spot-0', 'spot-1', 'spot-2', 'spot-3'];

export function renderTableState(room, myUid) {
  if (!room) return;
  const players = room.players || {};
  const playerEntries = Object.entries(players);
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
      const label = document.createElement('div');
      label.className = 'player-name';
      label.textContent = 'Open';
      spot.appendChild(label);
      return;
    }
    spot.className = 'player-spot' +
      (pid === room.currentTurn ? ' active-turn' : '') +
      (player.status === 'sitting-out' ? ' sitting-out' : '');

    const nameEl = document.createElement('div');
    nameEl.className = 'player-name';
    nameEl.textContent = player.name + (player.isHost ? ' ♛' : '');
    spot.appendChild(nameEl);

    const hands = player.hands || [];
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
      if (player.bets && player.bets[hi]) {
        spot.appendChild(renderChipStack(player.bets[hi]));
      }
    });

    if (room.phase === 'betting' && player.bet > 0) {
      spot.appendChild(renderChipStack(player.bet));
    }
  });

  const me = players[myUid];
  if (me) {
    const balEl = document.getElementById('hud-balance');
    if (balEl) balEl.textContent = `$${me.balance}`;
    const betEl = document.getElementById('hud-bet');
    if (betEl) betEl.textContent = `$${me.bet || 0}`;
  }

  updatePhaseUI(room, myUid, players[myUid]);
}

function renderDealerAreaEl(dealer, phase) {
  const wrap = document.getElementById('dealer-hand-wrap');
  if (!wrap) return;
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
  }
  wrap.appendChild(handDiv);
  if (dealer.hand.length > 0 && phase === 'resolution') {
    const allCards = [...visibleCards];
    if (dealer.hiddenCard) allCards.push(cardFromStr(dealer.hiddenCard));
    const val = handValue(allCards);
    const badge = document.createElement('div');
    badge.className = 'hand-value';
    badge.textContent = val;
    wrap.appendChild(badge);
  }
}

function updatePhaseUI(room, myUid, me) {
  const actionWrap = document.getElementById('action-buttons');
  const chipWrap = document.getElementById('chip-selector-wrap');
  const hostCtrl = document.getElementById('host-controls');
  if (!actionWrap || !chipWrap) return;

  actionWrap.hidden = true;
  chipWrap.hidden = true;
  if (hostCtrl) hostCtrl.hidden = true;

  if (room.phase === 'betting') {
    chipWrap.hidden = false;
  }

  if (!me) return;

  if (room.phase === 'playing' && room.currentTurn === myUid) {
    actionWrap.hidden = false;
  }
}
