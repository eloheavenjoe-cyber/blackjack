import { cardFromStr, handValue, isSoft, canDouble, canSplit } from './engine.js';

export function hiOptIIValue(card) {
  let c = card;

  // If card is a string, convert it to card object
  if (typeof card === 'string') {
    c = cardFromStr(card);
  }

  const rank = c.rank;

  // 2, 3, 6, 7 → +1
  if (['2', '3', '6', '7'].includes(rank)) return 1;

  // 4, 5 → +2
  if (['4', '5'].includes(rank)) return 2;

  // 10, J, Q, K → -2
  if (['10', 'J', 'Q', 'K'].includes(rank)) return -2;

  // A, 8, 9 → 0
  return 0;
}

export function botBet(trueCount, startingBalance, minBet, maxBet, currentBalance) {
  // Calculate unit: max(minBet, floor(startingBalance / 100))
  const unit = Math.max(minBet, Math.floor(startingBalance / 100));

  let betAmount;

  // TC-based ramp
  if (trueCount <= 0) {
    betAmount = minBet;
  } else if (trueCount < 2) {
    betAmount = 2 * unit;
  } else if (trueCount < 3) {
    betAmount = 4 * unit;
  } else if (trueCount < 4) {
    betAmount = 6 * unit;
  } else if (trueCount < 5) {
    betAmount = 8 * unit;
  } else {
    betAmount = 12 * unit;
  }

  // Clamp to [minBet, maxBet], then ensure it doesn't exceed currentBalance
  const clamped = Math.max(minBet, Math.min(betAmount, maxBet));
  return Math.min(clamped, currentBalance);
}

// Dealer upcard column index: [2,3,4,5,6,7,8,9,10,A]
const DC = { '2':0,'3':1,'4':2,'5':3,'6':4,'7':5,'8':6,'9':7,'10':8,'J':8,'Q':8,'K':8,'A':9 };

const HARD = {
  5:  'HHHHHHHHHH',
  6:  'HHHHHHHHHH',
  7:  'HHHHHHHHHH',
  8:  'HHHHHHHHHH',
  9:  'HDDDDHHHHH',
  10: 'DDDDDDDDHH',
  11: 'DDDDDDDDDH',
  12: 'HHSSSHHHHHH'.slice(0, 10),
  13: 'SSSSSHHHHH',
  14: 'SSSSSHHHHH',
  15: 'SSSSSHHHHH',
  16: 'SSSSSHHHHH',
  17: 'SSSSSSSSSS',
};

const SOFT = {
  13: 'HHHDDHHHHH',
  14: 'HHHDDHHHHH',
  15: 'HHDDDHHHHHH'.slice(0, 10),
  16: 'HHDDDHHHHHH'.slice(0, 10),
  17: 'HDDDDHHHHH',
  18: 'DDDDDSSHHH',
  19: 'SSSSSSSSSS',
  20: 'SSSSSSSSSS',
};

const PAIR = {
  2:  'PPPPPPHHHHH'.slice(0, 10),
  3:  'HHPPPPHHHHH'.slice(0, 10),
  4:  'HHHPPHHHHHH'.slice(0, 10),
  5:  'DDDDDDDDHH',
  6:  'PPPPPHHHHH',
  7:  'PPPPPPHHHHH'.slice(0, 10),
  8:  'PPPPPPPPPP',
  9:  'PPPPPSPPSS',
  10: 'SSSSSSSSSS',
  11: 'PPPPPPPPPP',
};

function pairRankValue(rank) {
  if (rank === 'A') return 11;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

export function basicStrategy(handStrs, dealerUpcardStr, settings) {
  const hand = handStrs.map(cardFromStr);
  const upcard = cardFromStr(dealerUpcardStr);
  const di = DC[upcard.rank] ?? 8;

  // Pairs (check before soft — A-A is both)
  if (hand.length === 2 && hand[0].rank === hand[1].rank) {
    const pv = pairRankValue(hand[0].rank);
    const row = PAIR[pv] ?? HARD[Math.min(handValue(hand), 17)];
    return row[di] ?? 'H';
  }

  const hv = handValue(hand);

  // Soft hand
  if (isSoft(hand) && hv >= 13 && hv <= 20) {
    const row = SOFT[hv];
    if (row) return row[di] ?? 'H';
  }

  // Hard hand (cap at 17)
  const key = Math.min(Math.max(hv, 5), 17);
  const row = HARD[key] ?? 'SSSSSSSSSS';
  return row[di] ?? 'S';
}

function indexDeviation(hv, isSoftHand, dealerRank, trueCount, settings) {
  if (isSoftHand) return null;
  if (hv === 16 && dealerRank === '10' && trueCount >= 0) return 'S';
  if (hv === 15 && dealerRank === '10' && trueCount >= 4) return 'S';
  if (hv === 12 && dealerRank === '4'  && trueCount >= 0) return 'S';
  if (hv === 12 && dealerRank === '3'  && trueCount >= 2) return 'S';
  if (hv === 12 && dealerRank === '2'  && trueCount >= 3) return 'S';
  if (hv === 9  && dealerRank === '2'  && trueCount >= 1) return 'D';
  if (hv === 9  && dealerRank === '7'  && trueCount >= 3) return 'D';
  if (hv === 11 && dealerRank === 'A'  && trueCount >= 1) return 'D';
  if (hv === 10 && dealerRank === '10' && trueCount >= 4) return 'D';
  if (hv === 10 && dealerRank === 'A'  && trueCount >= 3) return 'D';
  return null;
}

export function botDecision(handStrs, dealerUpcardStr, trueCount, settings, balance, splitCount) {
  const hand = handStrs.map(cardFromStr);
  const upcard = cardFromStr(dealerUpcardStr);
  const hv = handValue(hand);
  const soft = isSoft(hand);

  let action = basicStrategy(handStrs, dealerUpcardStr, settings);

  const isPair = hand.length === 2 && hand[0].rank === hand[1].rank;
  if (!isPair) {
    const dev = indexDeviation(hv, soft, upcard.rank, trueCount, settings);
    if (dev) action = dev;
  }

  if (action === 'P') {
    const ph = { cards: hand, status: 'active', splitCount: splitCount || 0, bet: 1 };
    if (!canSplit(ph, settings, balance)) action = 'H';
  }
  if (action === 'D') {
    const ph = { cards: hand, status: 'active', splitCount: 0, bet: 1 };
    if (!canDouble(ph, settings, balance)) action = 'H';
  }

  const MAP = { H: 'hit', S: 'stand', D: 'double', P: 'split' };
  return MAP[action] ?? 'stand';
}

const BOT_NAMES = [
  'Alex', 'Jordan', 'Riley', 'Morgan', 'Casey',
  'Drew', 'Quinn', 'Blake', 'Avery', 'Reese',
  'Skyler', 'Dakota', 'Peyton', 'Finley', 'Sage',
];

export function pickBotName(usedNames) {
  const used = new Set((usedNames || []).map(n => n.toLowerCase()));
  const available = BOT_NAMES.filter(n => !used.has(n.toLowerCase()));
  if (!available.length) return null;
  return available[Math.floor(Math.random() * available.length)];
}

const EMOTE_TABLE = {
  blackjack: { chance: 0.70, pool: ['🔥', '👑', '💸'] },
  win:       { chance: 0.35, pool: ['🔥', '💸'] },
  bust:      { chance: 0.40, pool: ['😂', '💀'] },
  lose:      { chance: 0.20, pool: ['😂', '😬'] },
  push:      { chance: 0.10, pool: ['😬'] },
};

export function getBotEmote(outcome) {
  const entry = EMOTE_TABLE[outcome];
  if (!entry || Math.random() > entry.chance) return null;
  return entry.pool[Math.floor(Math.random() * entry.pool.length)];
}
