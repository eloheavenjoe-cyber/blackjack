import assert from 'node:assert/strict';
import { computeStatDelta } from '../js/stats.js';

// Win round — streak increments, handsWon increments, profit positive
{
  const player = { bet: 10, bets: [10], winStreak: 0, handsWon: 0, totalWagered: 0, sessionProfit: 0 };
  const result = computeStatDelta(player, 20); // win: $10 bet, $20 payout
  assert.equal(result.winStreak, 1, 'streak increments on win');
  assert.equal(result.handsWon, 1, 'handsWon increments on win');
  assert.equal(result.totalWagered, 10, 'totalWagered accumulates');
  assert.equal(result.sessionProfit, 10, 'profit = payout - wagered');
}

// Loss round — streak resets to 0
{
  const player = { bet: 10, bets: [10], winStreak: 3, handsWon: 3, totalWagered: 30, sessionProfit: 15 };
  const result = computeStatDelta(player, 0); // loss: $10 bet, $0 payout
  assert.equal(result.winStreak, 0, 'streak resets on loss');
  assert.equal(result.handsWon, 3, 'handsWon unchanged on loss');
  assert.equal(result.totalWagered, 40, 'totalWagered still accumulates on loss');
  assert.equal(result.sessionProfit, 5, 'profit decreases on loss');
}

// Push round — streak unchanged
{
  const player = { bet: 10, bets: [10], winStreak: 2, handsWon: 2, totalWagered: 20, sessionProfit: 10 };
  const result = computeStatDelta(player, 10); // push: $10 bet, $10 payout back
  assert.equal(result.winStreak, 2, 'streak unchanged on push');
  assert.equal(result.handsWon, 2, 'handsWon unchanged on push');
  assert.equal(result.sessionProfit, 10, 'profit unchanged on push');
}

// Blackjack (3:2) — win with 2.5x payout
{
  const player = { bet: 10, bets: [10], winStreak: 1, handsWon: 1, totalWagered: 10, sessionProfit: 10 };
  const result = computeStatDelta(player, 25); // blackjack: $10 bet, $25 payout
  assert.equal(result.winStreak, 2, 'streak increments on blackjack');
  assert.equal(result.sessionProfit, 25, 'profit = 25 - 10 added to existing 10');
}

// Split round — uses sum of bets array, not just player.bet
{
  const player = { bet: 10, bets: [10, 10], winStreak: 0, handsWon: 0, totalWagered: 0, sessionProfit: 0 };
  const result = computeStatDelta(player, 40); // both split hands win: $20 wagered, $40 payout
  assert.equal(result.totalWagered, 20, 'totalWagered = sum(bets) for splits');
  assert.equal(result.sessionProfit, 20, 'profit = 40 - 20');
  assert.equal(result.winStreak, 1);
}

// Fallback: player.bets empty — uses player.bet
{
  const player = { bet: 10, bets: [], winStreak: 0, handsWon: 0, totalWagered: 0, sessionProfit: 0 };
  const result = computeStatDelta(player, 20);
  assert.equal(result.totalWagered, 10, 'falls back to player.bet when bets array is empty');
}

console.log('All stats tests passed.');
