// Game logic — no Firebase dependency

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function createDeck(numDecks = 1) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
  }
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

export function cardToStr(card) {
  return `${card.rank}_${card.suit}`;
}

export function cardFromStr(str) {
  const idx = str.indexOf('_');
  return { rank: str.slice(0, idx), suit: str.slice(idx + 1) };
}

export function cardNumericValue(rank) {
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

export function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === 'A') aces++;
    total += cardNumericValue(card.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export function isSoft(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === 'A') aces++;
    total += cardNumericValue(card.rank);
  }
  // A hand is soft only when exactly one ace counts as 11 with no reductions needed.
  // If any ace had to be demoted (total > 21 forced a reduction), the hand is hard.
  if (total > 21) return false;
  return aces > 0;
}

export function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

export function isBust(hand) {
  return handValue(hand) > 21;
}
