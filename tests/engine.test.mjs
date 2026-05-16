import assert from 'node:assert/strict';
import {
  createDeck, shuffle, cardFromStr, cardToStr,
  handValue, isSoft, isBlackjack, isBust
} from '../js/engine.js';

// createDeck
const deck1 = createDeck(1);
assert.equal(deck1.length, 52, 'single deck = 52 cards');
const deck6 = createDeck(6);
assert.equal(deck6.length, 312, '6 decks = 312 cards');

// cardToStr / cardFromStr round-trip
const card = { rank: '10', suit: 'hearts' };
assert.equal(cardToStr(card), '10_hearts');
assert.deepEqual(cardFromStr('10_hearts'), { rank: '10', suit: 'hearts' });
assert.deepEqual(cardFromStr('A_spades'), { rank: 'A', suit: 'spades' });

// handValue
assert.equal(handValue([{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }]), 21);
assert.equal(handValue([{ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }]), 12);
assert.equal(handValue([{ rank: '7', suit: 'spades' }, { rank: '8', suit: 'hearts' }, { rank: '9', suit: 'diamonds' }]), 24);
assert.equal(handValue([{ rank: 'A', suit: 'spades' }, { rank: '6', suit: 'hearts' }]), 17);

// isSoft
assert.equal(isSoft([{ rank: 'A', suit: 'spades' }, { rank: '6', suit: 'hearts' }]), true, 'A+6 is soft 17');
assert.equal(isSoft([{ rank: '7', suit: 'spades' }, { rank: '6', suit: 'hearts' }, { rank: '4', suit: 'clubs' }]), false, 'hard 17 not soft');
assert.equal(isSoft([{ rank: 'A', suit: 'spades' }, { rank: 'A', suit: 'hearts' }, { rank: '9', suit: 'clubs' }]), false, 'A+A+9=21 not soft');

// isBlackjack
assert.equal(isBlackjack([{ rank: 'A', suit: 'spades' }, { rank: 'K', suit: 'hearts' }]), true);
assert.equal(isBlackjack([{ rank: 'A', suit: 'spades' }, { rank: '6', suit: 'hearts' }, { rank: '4', suit: 'clubs' }]), false, '3-card 21 is not blackjack');

// isBust
assert.equal(isBust([{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'hearts' }, { rank: '5', suit: 'clubs' }]), true);
assert.equal(isBust([{ rank: '10', suit: 'spades' }, { rank: '8', suit: 'hearts' }, { rank: '3', suit: 'clubs' }]), false);

console.log('All deck/hand tests passed.');
