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
