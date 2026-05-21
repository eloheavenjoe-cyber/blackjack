import assert from 'node:assert/strict';
import {
  createDeck, shuffle, cardToStr, cardFromStr,
  dealHoleCards, dealCommunity, RANK_VALUE
} from '../js/holdem-engine.js';

const deck = createDeck();
assert.equal(deck.length, 52, '52 cards');
assert.equal(new Set(deck.map(cardToStr)).size, 52, 'all unique');

assert.equal(RANK_VALUE['A'], 14);
assert.equal(RANK_VALUE['10'], 10);
assert.equal(RANK_VALUE['2'], 2);

const shuffled = shuffle(deck);
assert.equal(shuffled.length, 52);
assert.equal(new Set(shuffled.map(cardToStr)).size, 52);

assert.deepEqual(cardFromStr(cardToStr({ rank: '10', suit: 'hearts' })), { rank: '10', suit: 'hearts' });

const { hands, remaining } = dealHoleCards(deck, 4);
assert.equal(hands.length, 4);
hands.forEach(h => assert.equal(h.length, 2));
assert.equal(remaining.length, 44);

const { cards: flop, remaining: r1 } = dealCommunity(remaining, 'flop');
assert.equal(flop.length, 3);
assert.equal(r1.length, 41);

const { cards: turn, remaining: r2 } = dealCommunity(r1, 'turn');
assert.equal(turn.length, 1);
assert.equal(r2.length, 40);

const { cards: river } = dealCommunity(r2, 'river');
assert.equal(river.length, 1);

console.log('holdem-engine deck/deal: all tests passed');
