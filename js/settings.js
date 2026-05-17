export const DEALER_OPTIONS = [
  { name: 'Happy Merchant', file: 'dealer-merchant.png' },
  { name: 'Happy Piggy',    file: 'dealer-piggy.png' },
  { name: 'Happy China',    file: 'dealer-china.png' },
  { name: 'Happy Alien',    file: 'dealer-alien.png' },
  { name: 'Happy Wife',     file: 'dealer-wife.png' },
  { name: 'Happy Muz',      file: 'dealer-muz.png' },
];

export const DEFAULT_SETTINGS = {
  decks: 6,
  blackjackPayout: '3:2',
  dealerHitSoft17: false,
  doubleDown: 'any',
  doubleAfterSplit: true,
  reSplit: '2',
  surrender: 'late',
  insurance: false,
  minBet: 5,
  maxBet: 500,
  startingBalance: 1000,
  actionTimer: 30,
  dealerAvatar: 0,
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
  if (s.minBet < 1 || s.minBet > 5000) errors.push('Min bet out of range');
  if (s.maxBet < s.minBet || s.maxBet > 5000) errors.push('Max bet out of range');
  if (s.startingBalance < 100 || s.startingBalance > 25000) errors.push('Starting balance out of range');
  const timerOk = s.actionTimer === 0 || [15, 30, 60].includes(s.actionTimer) || (s.actionTimer >= 5 && s.actionTimer <= 300);
  if (!timerOk) errors.push('Invalid timer value');
  if (!Number.isInteger(s.dealerAvatar) || s.dealerAvatar < 0 || s.dealerAvatar >= DEALER_OPTIONS.length)
    errors.push('Invalid dealer avatar');
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
