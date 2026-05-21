const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

export const RANK_VALUE = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
  '10':10,'J':11,'Q':12,'K':13,'A':14
};

export function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank });
  return deck;
}

export function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function cardToStr(card) { return `${card.rank}_${card.suit}`; }

export function cardFromStr(str) {
  const idx = str.indexOf('_');
  return { rank: str.slice(0, idx), suit: str.slice(idx + 1) };
}

export function dealHoleCards(deck, playerCount) {
  const hands = Array.from({ length: playerCount }, () => []);
  let idx = 0;
  for (let round = 0; round < 2; round++)
    for (let p = 0; p < playerCount; p++)
      hands[p].push(deck[idx++]);
  return { hands, remaining: deck.slice(idx) };
}

export function dealCommunity(deck, phase) {
  if (phase !== 'flop' && phase !== 'turn' && phase !== 'river')
    throw new Error(`Unknown phase: ${phase}`);
  const count = phase === 'flop' ? 3 : 1;
  return { cards: deck.slice(0, count), remaining: deck.slice(count) };
}
