import assert from 'node:assert/strict';
import { getColor, spin, calcPayouts, WHEEL_SEQUENCE, RED_NUMBERS } from '../js/roulette-engine.js';

// WHEEL_SEQUENCE
assert.equal(WHEEL_SEQUENCE.length, 37, '37 pockets');
assert.equal(WHEEL_SEQUENCE[0], 0, 'first pocket is 0');
assert.equal(new Set(WHEEL_SEQUENCE).size, 37, 'all 37 numbers unique');

// getColor
assert.equal(getColor(0), 'green');
assert.equal(getColor(1), 'red');
assert.equal(getColor(2), 'black');
assert.equal(getColor(36), 'red');
assert.equal(getColor(35), 'black');

// spin
for (let i = 0; i < 200; i++) {
  const s = spin();
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 36, `spin() ${s} out of range`);
}

// calcPayouts — even money bets (1:1)
assert.deepEqual(calcPayouts(1, { p1: { red: 100 } }), { p1: 100 }, 'red wins on 1');
assert.deepEqual(calcPayouts(2, { p1: { red: 100 } }), { p1: -100 }, 'red loses on 2 (black)');
assert.deepEqual(calcPayouts(0, { p1: { red: 100 } }), { p1: -100 }, 'red loses on 0');

assert.deepEqual(calcPayouts(2, { p1: { black: 50 } }), { p1: 50 }, 'black wins on 2');
assert.deepEqual(calcPayouts(1, { p1: { black: 50 } }), { p1: -50 }, 'black loses on 1 (red)');

assert.deepEqual(calcPayouts(1, { p1: { odd: 10 } }), { p1: 10 }, 'odd wins on 1');
assert.deepEqual(calcPayouts(2, { p1: { odd: 10 } }), { p1: -10 }, 'odd loses on 2');
assert.deepEqual(calcPayouts(0, { p1: { odd: 10 } }), { p1: -10 }, 'odd loses on 0');

assert.deepEqual(calcPayouts(2, { p1: { even: 10 } }), { p1: 10 }, 'even wins on 2');
assert.deepEqual(calcPayouts(1, { p1: { even: 10 } }), { p1: -10 }, 'even loses on 1');
assert.deepEqual(calcPayouts(0, { p1: { even: 10 } }), { p1: -10 }, 'even loses on 0');

assert.deepEqual(calcPayouts(18, { p1: { low: 20 } }), { p1: 20 }, 'low wins on 18');
assert.deepEqual(calcPayouts(19, { p1: { low: 20 } }), { p1: -20 }, 'low loses on 19');
assert.deepEqual(calcPayouts(0, { p1: { low: 20 } }), { p1: -20 }, 'low loses on 0');

assert.deepEqual(calcPayouts(19, { p1: { high: 20 } }), { p1: 20 }, 'high wins on 19');
assert.deepEqual(calcPayouts(18, { p1: { high: 20 } }), { p1: -20 }, 'high loses on 18');

// calcPayouts — dozens (2:1)
assert.deepEqual(calcPayouts(12, { p1: { dozen1: 10 } }), { p1: 20 }, '1st dozen pays 2:1 on 12');
assert.deepEqual(calcPayouts(1,  { p1: { dozen1: 10 } }), { p1: 20 }, '1st dozen pays 2:1 on 1');
assert.deepEqual(calcPayouts(13, { p1: { dozen1: 10 } }), { p1: -10 }, '1st dozen loses on 13');
assert.deepEqual(calcPayouts(0,  { p1: { dozen1: 10 } }), { p1: -10 }, '1st dozen loses on 0');

assert.deepEqual(calcPayouts(24, { p1: { dozen2: 10 } }), { p1: 20 }, '2nd dozen pays 2:1 on 24');
assert.deepEqual(calcPayouts(13, { p1: { dozen2: 10 } }), { p1: 20 }, '2nd dozen pays 2:1 on 13');
assert.deepEqual(calcPayouts(12, { p1: { dozen2: 10 } }), { p1: -10 }, '2nd dozen loses on 12');

assert.deepEqual(calcPayouts(36, { p1: { dozen3: 10 } }), { p1: 20 }, '3rd dozen pays 2:1 on 36');
assert.deepEqual(calcPayouts(25, { p1: { dozen3: 10 } }), { p1: 20 }, '3rd dozen pays 2:1 on 25');
assert.deepEqual(calcPayouts(24, { p1: { dozen3: 10 } }), { p1: -10 }, '3rd dozen loses on 24');

// calcPayouts — columns (2:1)
assert.deepEqual(calcPayouts(1,  { p1: { col1: 10 } }), { p1: 20 }, 'col1 wins on 1');
assert.deepEqual(calcPayouts(34, { p1: { col1: 10 } }), { p1: 20 }, 'col1 wins on 34');
assert.deepEqual(calcPayouts(2,  { p1: { col1: 10 } }), { p1: -10 }, 'col1 loses on 2');

assert.deepEqual(calcPayouts(2,  { p1: { col2: 10 } }), { p1: 20 }, 'col2 wins on 2');
assert.deepEqual(calcPayouts(35, { p1: { col2: 10 } }), { p1: 20 }, 'col2 wins on 35');
assert.deepEqual(calcPayouts(1,  { p1: { col2: 10 } }), { p1: -10 }, 'col2 loses on 1');

assert.deepEqual(calcPayouts(3,  { p1: { col3: 10 } }), { p1: 20 }, 'col3 wins on 3');
assert.deepEqual(calcPayouts(36, { p1: { col3: 10 } }), { p1: 20 }, 'col3 wins on 36');
assert.deepEqual(calcPayouts(1,  { p1: { col3: 10 } }), { p1: -10 }, 'col3 loses on 1');
assert.deepEqual(calcPayouts(0,  { p1: { col1: 10 } }), { p1: -10 }, 'col1 loses on 0');

// multiple bet types in one player
assert.deepEqual(calcPayouts(1, { p1: { red: 10, odd: 10 } }), { p1: 20 }, 'wins both red and odd');
assert.deepEqual(calcPayouts(2, { p1: { red: 10, odd: 10 } }), { p1: -20 }, 'loses both red and odd');
assert.deepEqual(calcPayouts(1, { p1: { red: 10, even: 10 } }), { p1: 0 }, 'red wins, even loses — net 0');

// multiple players
const multi = calcPayouts(7, { p1: { red: 100 }, p2: { black: 100 } });
assert.equal(multi.p1, 100, 'p1 wins red on 7');
assert.equal(multi.p2, -100, 'p2 loses black on 7');

// empty bets entry
assert.deepEqual(calcPayouts(5, { p1: {} }), { p1: 0 }, 'no bets = zero delta');

console.log('All roulette engine tests passed.');
