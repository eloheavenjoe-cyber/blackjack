import { cardFromStr } from './engine.js';

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
  } else if (trueCount === 1) {
    betAmount = 2 * unit;
  } else if (trueCount === 2) {
    betAmount = 4 * unit;
  } else if (trueCount === 3) {
    betAmount = 6 * unit;
  } else if (trueCount === 4) {
    betAmount = 8 * unit;
  } else { // TC >= 5
    betAmount = 12 * unit;
  }

  // Clamp to [minBet, min(maxBet, currentBalance)]
  const lowerBound = minBet;
  const upperBound = Math.min(maxBet, currentBalance);

  return Math.max(lowerBound, Math.min(betAmount, upperBound));
}
