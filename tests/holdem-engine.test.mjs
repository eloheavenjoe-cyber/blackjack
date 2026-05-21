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
// Verify shuffle actually reordered cards (astronomically unlikely to be identical)
assert.notDeepEqual(shuffled.map(cardToStr), deck.map(cardToStr), 'shuffle must change order');

assert.deepEqual(cardFromStr(cardToStr({ rank: '10', suit: 'hearts' })), { rank: '10', suit: 'hearts' });

const { hands, remaining } = dealHoleCards(deck, 4);
assert.equal(hands.length, 4);
hands.forEach(h => assert.equal(h.length, 2));
assert.equal(remaining.length, 44);

// Verify round-robin dealing order: player 0 gets card[0], player 1 gets card[1], etc.
const orderedDeck = createDeck(); // always same order
const { hands: rotHands } = dealHoleCards(orderedDeck, 3);
assert.deepEqual(rotHands[0][0], orderedDeck[0], 'p0 first card = deck[0]');
assert.deepEqual(rotHands[1][0], orderedDeck[1], 'p1 first card = deck[1]');
assert.deepEqual(rotHands[2][0], orderedDeck[2], 'p2 first card = deck[2]');
assert.deepEqual(rotHands[0][1], orderedDeck[3], 'p0 second card = deck[3]');
assert.deepEqual(rotHands[1][1], orderedDeck[4], 'p1 second card = deck[4]');
assert.deepEqual(rotHands[2][1], orderedDeck[5], 'p2 second card = deck[5]');

const { cards: flop, remaining: r1 } = dealCommunity(remaining, 'flop');
assert.equal(flop.length, 3);
assert.equal(r1.length, 41);

const { cards: turn, remaining: r2 } = dealCommunity(r1, 'turn');
assert.equal(turn.length, 1);
assert.equal(r2.length, 40);

const { cards: river } = dealCommunity(r2, 'river');
assert.equal(river.length, 1);

console.log('holdem-engine deck/deal: all tests passed');
