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

import { evaluateHand, compareHands } from '../js/holdem-engine.js';

function c(rank, suit) { return { rank, suit }; }

// Royal flush
const royalH = evaluateHand(
  [c('A','hearts'), c('K','hearts')],
  [c('Q','hearts'), c('J','hearts'), c('10','hearts'), c('2','clubs'), c('3','spades')]
);
assert.equal(royalH.rank, 8);
assert.equal(royalH.name, 'Royal Flush');

// Straight flush (9-high)
const sfH = evaluateHand(
  [c('9','spades'), c('8','spades')],
  [c('7','spades'), c('6','spades'), c('5','spades'), c('A','hearts'), c('K','clubs')]
);
assert.equal(sfH.rank, 8);
assert.equal(sfH.name, 'Straight Flush');
assert.equal(sfH.tiebreakers[0], 9);

// Four of a kind
const foakH = evaluateHand(
  [c('A','hearts'), c('A','diamonds')],
  [c('A','clubs'), c('A','spades'), c('K','hearts'), c('2','clubs'), c('3','spades')]
);
assert.equal(foakH.rank, 7);
assert.equal(foakH.name, 'Four of a Kind');

// Full house
const fhH = evaluateHand(
  [c('K','hearts'), c('K','diamonds')],
  [c('K','clubs'), c('Q','hearts'), c('Q','spades'), c('2','clubs'), c('3','spades')]
);
assert.equal(fhH.rank, 6);
assert.equal(fhH.name, 'Full House');

// Flush
const flH = evaluateHand(
  [c('A','hearts'), c('10','hearts')],
  [c('7','hearts'), c('4','hearts'), c('2','hearts'), c('K','spades'), c('Q','clubs')]
);
assert.equal(flH.rank, 5);
assert.equal(flH.name, 'Flush');

// Straight (9-high)
const strH = evaluateHand(
  [c('9','hearts'), c('8','spades')],
  [c('7','clubs'), c('6','diamonds'), c('5','hearts'), c('K','spades'), c('2','clubs')]
);
assert.equal(strH.rank, 4);
assert.equal(strH.tiebreakers[0], 9);

// Wheel straight (A-2-3-4-5, high=5)
const wheelH = evaluateHand(
  [c('A','hearts'), c('2','spades')],
  [c('3','clubs'), c('4','diamonds'), c('5','hearts'), c('K','spades'), c('Q','clubs')]
);
assert.equal(wheelH.rank, 4);
assert.equal(wheelH.tiebreakers[0], 5, 'wheel high is 5');

// Three of a kind
const tripsH = evaluateHand(
  [c('Q','hearts'), c('Q','spades')],
  [c('Q','clubs'), c('K','hearts'), c('J','spades'), c('9','clubs'), c('3','diamonds')]
);
assert.equal(tripsH.rank, 3);

// Two pair
const tpH = evaluateHand(
  [c('K','hearts'), c('K','spades')],
  [c('Q','hearts'), c('Q','spades'), c('J','clubs'), c('9','hearts'), c('3','diamonds')]
);
assert.equal(tpH.rank, 2);

// One pair
const pairH = evaluateHand(
  [c('A','hearts'), c('A','spades')],
  [c('K','clubs'), c('Q','hearts'), c('J','spades'), c('9','clubs'), c('3','diamonds')]
);
assert.equal(pairH.rank, 1);

// High card
const hcH = evaluateHand(
  [c('A','hearts'), c('K','spades')],
  [c('Q','clubs'), c('J','hearts'), c('9','spades'), c('7','clubs'), c('2','diamonds')]
);
assert.equal(hcH.rank, 0);

// Tie: same two pair, A kicker beats J kicker
const tp1 = evaluateHand(
  [c('K','hearts'), c('Q','hearts')],
  [c('K','spades'), c('Q','spades'), c('A','clubs'), c('2','hearts'), c('3','diamonds')]
);
const tp2 = evaluateHand(
  [c('K','clubs'), c('Q','clubs')],
  [c('K','diamonds'), c('Q','diamonds'), c('J','clubs'), c('2','hearts'), c('3','diamonds')]
);
assert.equal(compareHands(tp1, tp2), 1, 'A kicker beats J kicker');
assert.equal(compareHands(tp2, tp1), -1);

// Perfect tie (both make same straight)
const t1 = evaluateHand(
  [c('A','hearts'), c('K','hearts')],
  [c('Q','spades'), c('J','clubs'), c('10','diamonds'), c('2','hearts'), c('3','clubs')]
);
const t2 = evaluateHand(
  [c('A','spades'), c('K','spades')],
  [c('Q','spades'), c('J','clubs'), c('10','diamonds'), c('2','hearts'), c('3','clubs')]
);
assert.equal(compareHands(t1, t2), 0, 'perfect tie');

console.log('holdem-engine hand evaluator: all tests passed');
