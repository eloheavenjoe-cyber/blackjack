export const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

export const WHEEL_SEQUENCE = [
  0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,
  24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26
];

export function getColor(n) {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

export function spin() {
  return Math.floor(Math.random() * 37);
}

export function calcPayouts(spinResult, bets) {
  const n = spinResult;
  const color = getColor(n);
  const isOdd  = n > 0 && n % 2 !== 0;
  const isEven = n > 0 && n % 2 === 0;
  const isLow  = n >= 1 && n <= 18;
  const isHigh = n >= 19 && n <= 36;
  const dozen  = n === 0 ? 0 : Math.ceil(n / 12);
  const col    = n === 0 ? 0 : ((n - 1) % 3) + 1;

  const result = {};
  for (const [uid, b] of Object.entries(bets)) {
    if (!b) continue;
    let delta = 0;
    const checks = [
      [b.red,    color === 'red',   1],
      [b.black,  color === 'black', 1],
      [b.odd,    isOdd,             1],
      [b.even,   isEven,            1],
      [b.low,    isLow,             1],
      [b.high,   isHigh,            1],
      [b.dozen1, dozen === 1,       2],
      [b.dozen2, dozen === 2,       2],
      [b.dozen3, dozen === 3,       2],
      [b.col1,   col === 1,         2],
      [b.col2,   col === 2,         2],
      [b.col3,   col === 3,         2],
    ];
    for (const [amount, wins, mult] of checks) {
      if (!amount) continue;
      delta += wins ? amount * mult : -amount;
    }
    result[uid] = delta;
  }
  return result;
}
