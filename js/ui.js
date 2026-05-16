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
