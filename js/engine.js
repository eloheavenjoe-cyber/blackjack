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
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return aces > 0 && total < 21;
}

export function isBlackjack(hand) {
  return hand.length === 2 && handValue(hand) === 21;
}

export function isBust(hand) {
  return handValue(hand) > 21;
}

export function canHit(playerHand) {
  return playerHand.status === 'active' && handValue(playerHand.cards) < 21;
}

export function canStand(playerHand) {
  return playerHand.status === 'active';
}

export function canDouble(playerHand, settings, balance) {
  if (playerHand.status !== 'active') return false;
  if (playerHand.cards.length !== 2) return false;
  if (balance < playerHand.bet) return false;
  if (settings.doubleDown === 'off') return false;
  if (settings.doubleDown === '9-10-11') {
    const v = handValue(playerHand.cards);
    return v >= 9 && v <= 11;
  }
  return true;
}

export function canSplit(playerHand, settings, balance) {
  if (playerHand.status !== 'active') return false;
  if (playerHand.cards.length !== 2) return false;
  if (playerHand.cards[0].rank !== playerHand.cards[1].rank) return false;
  if (balance < playerHand.bet) return false;
  const maxSplits = { off: 0, '2': 2, '3': 3, '4': 4 }[settings.reSplit] ?? 0;
  return playerHand.splitCount < maxSplits;
}

export function canSurrender(playerHand, settings) {
  if (playerHand.status !== 'active') return false;
  if (settings.surrender === 'off') return false;
  return playerHand.cards.length === 2;
}

export function canInsure(dealerUpCard, settings) {
  return settings.insurance && dealerUpCard.rank === 'A';
}

export function hiLoValue(card) {
  if (['2', '3', '4', '5', '6'].includes(card.rank)) return 1;
  if (['10', 'J', 'Q', 'K', 'A'].includes(card.rank)) return -1;
  return 0;
}

export function dealerShouldHit(dealerHand, settings) {
  const value = handValue(dealerHand);
  if (value < 17) return true;
  if (value === 17 && settings.dealerHitSoft17 && isSoft(dealerHand)) return true;
  return false;
}

export function resolveHand(playerHand, dealerHand, settings) {
  if (playerHand.status === 'surrendered') {
    return { result: 'surrender', payout: Math.floor(playerHand.bet / 2) };
  }
  if (playerHand.status === 'bust') {
    return { result: 'bust', payout: 0 };
  }
  const dealerBust = isBust(dealerHand);
  const playerBJ = isBlackjack(playerHand.cards);
  const dealerBJ = isBlackjack(dealerHand);

  if (playerBJ && !dealerBJ) {
    const mult = { '3:2': 2.5, '6:5': 2.2, '1:1': 2.0 }[settings.blackjackPayout] ?? 2.5;
    return { result: 'blackjack', payout: Math.floor(playerHand.bet * mult) };
  }
  if (dealerBJ && !playerBJ) {
    return { result: 'dealer_blackjack', payout: 0 };
  }
  if (dealerBJ && playerBJ) {
    return { result: 'push', payout: playerHand.bet };
  }
  const pv = handValue(playerHand.cards);
  const dv = handValue(dealerHand);
  if (dealerBust || pv > dv) return { result: 'win', payout: playerHand.bet * 2 };
  if (pv === dv) return { result: 'push', payout: playerHand.bet };
  return { result: 'lose', payout: 0 };
}
