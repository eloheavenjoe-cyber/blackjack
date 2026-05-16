export const DEFAULT_SETTINGS = {
  decks: 6,
  blackjackPayout: '3:2',
  dealerHitSoft17: false,
  doubleDown: 'any',
  doubleAfterSplit: true,
  reSplit: '2',
  surrender: 'late',
  insurance: true,
  minBet: 5,
  maxBet: 500,
  startingBalance: 1000,
  actionTimer: 30,
};

export function validateSettings(s) {
  const errors = [];
  if (![1, 2, 4, 6, 8].includes(s.decks)) errors.push('Invalid deck count');
  if (!['3:2', '6:5', '1:1'].includes(s.blackjackPayout)) errors.push('Invalid payout');
  if (!['any', '9-10-11', 'off'].includes(s.doubleDown)) errors.push('Invalid double-down rule');
  if (!['off', '2', '3', '4'].includes(s.reSplit)) errors.push('Invalid re-split rule');
  if (!['off', 'late', 'early'].includes(s.surrender)) errors.push('Invalid surrender rule');
  if (typeof s.dealerHitSoft17 !== 'boolean') errors.push('dealerHitSoft17 must be a boolean');
  if (typeof s.doubleAfterSplit !== 'boolean') errors.push('doubleAfterSplit must be a boolean');
  if (typeof s.insurance !== 'boolean') errors.push('insurance must be a boolean');
  if (s.minBet < 1 || s.minBet > 500) errors.push('Min bet out of range');
  if (s.maxBet < s.minBet || s.maxBet > 1000) errors.push('Max bet out of range');
  if (s.startingBalance < 100 || s.startingBalance > 10000) errors.push('Starting balance out of range');
  const timerOk = s.actionTimer === 0 || [15, 30, 60].includes(s.actionTimer) || (s.actionTimer >= 5 && s.actionTimer <= 300);
  if (!timerOk) errors.push('Invalid timer value');
  return errors;
}

export function settingsSummaryLines(s) {
  const payout = s.blackjackPayout;
  const soft17 = s.dealerHitSoft17 ? 'Dealer hits soft 17' : 'Dealer stands on all 17s';
  return [
    `BLACKJACK PAYS ${payout}`,
    soft17,
    `Insurance pays 2 to 1`,
  ];
}
