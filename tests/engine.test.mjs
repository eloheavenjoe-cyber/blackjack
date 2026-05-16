import assert from 'node:assert/strict';
import {
  createDeck, shuffle, cardFromStr, cardToStr,
  handValue, isSoft, isBlackjack, isBust,
  canHit, canStand, canDouble, canSplit, canSurrender,
  dealerShouldHit, resolveHand, hiLoValue
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

const DEFAULT_SETTINGS = {
  doubleDown: 'any', doubleAfterSplit: true,
  reSplit: '2', surrender: 'late',
  insurance: true, dealerHitSoft17: false,
  blackjackPayout: '3:2'
};

// canHit
const activeHand = { cards: [{ rank: '7', suit: 'hearts' }, { rank: '8', suit: 'clubs' }], status: 'active', splitCount: 0, bet: 10 };
assert.equal(canHit(activeHand), true);
const stood = { ...activeHand, status: 'stood' };
assert.equal(canHit(stood), false);

// canDouble
assert.equal(canDouble(activeHand, DEFAULT_SETTINGS, 100), true);
assert.equal(canDouble(activeHand, { ...DEFAULT_SETTINGS, doubleDown: 'off' }, 100), false);
const hand15 = { cards: [{ rank: '7', suit: 'hearts' }, { rank: '8', suit: 'clubs' }], status: 'active', splitCount: 0, bet: 10 }; // 15
assert.equal(canDouble(hand15, { ...DEFAULT_SETTINGS, doubleDown: '9-10-11' }, 100), false, '15 not in 9-10-11');
const hand9 = { cards: [{ rank: '4', suit: 'hearts' }, { rank: '5', suit: 'clubs' }], status: 'active', splitCount: 0, bet: 10 };
assert.equal(canDouble(hand9, { ...DEFAULT_SETTINGS, doubleDown: '9-10-11' }, 100), true, '9 allowed');
assert.equal(canDouble(activeHand, DEFAULT_SETTINGS, 5), false, 'insufficient balance');

// canSplit
const pairHand = { cards: [{ rank: '8', suit: 'hearts' }, { rank: '8', suit: 'clubs' }], status: 'active', splitCount: 0, bet: 10 };
assert.equal(canSplit(pairHand, DEFAULT_SETTINGS, 100), true);
assert.equal(canSplit(activeHand, DEFAULT_SETTINGS, 100), false, 'non-pair');
const maxSplitHand = { ...pairHand, splitCount: 2 };
assert.equal(canSplit(maxSplitHand, DEFAULT_SETTINGS, 100), false, 'at reSplit limit');

// canSurrender
assert.equal(canSurrender(activeHand, DEFAULT_SETTINGS), true, 'late surrender on 2 cards');
const threeCardHand = { cards: [{ rank: '5', suit: 'hearts' }, { rank: '6', suit: 'diamonds' }, { rank: '4', suit: 'clubs' }], status: 'active', splitCount: 0, bet: 10 };
assert.equal(canSurrender(threeCardHand, DEFAULT_SETTINGS), false, 'no surrender after hit');
assert.equal(canSurrender(activeHand, { ...DEFAULT_SETTINGS, surrender: 'off' }), false, 'surrender off');

// dealerShouldHit
const hard16 = [{ rank: '7', suit: 'hearts' }, { rank: '9', suit: 'diamonds' }];
assert.equal(dealerShouldHit(hard16, DEFAULT_SETTINGS), true, 'hard 16 hits');
const hard17 = [{ rank: '10', suit: 'hearts' }, { rank: '7', suit: 'diamonds' }];
assert.equal(dealerShouldHit(hard17, DEFAULT_SETTINGS), false, 'hard 17 stands');
const soft17 = [{ rank: 'A', suit: 'hearts' }, { rank: '6', suit: 'diamonds' }];
assert.equal(dealerShouldHit(soft17, DEFAULT_SETTINGS), false, 'stand on soft 17 when dealerHitSoft17=false');
assert.equal(dealerShouldHit(soft17, { ...DEFAULT_SETTINGS, dealerHitSoft17: true }), true, 'hit soft 17 when enabled');
const hard18 = [{ rank: '10', suit: 'hearts' }, { rank: '8', suit: 'diamonds' }];
assert.equal(dealerShouldHit(hard18, DEFAULT_SETTINGS), false, 'hard 18 stands');

// resolveHand
const bjHand = { cards: [{ rank: 'A', suit: 'hearts' }, { rank: 'K', suit: 'diamonds' }], status: 'active', bet: 100 };
const dealerHard18 = [{ rank: '10', suit: 'hearts' }, { rank: '8', suit: 'diamonds' }];
const r1 = resolveHand(bjHand, dealerHard18, DEFAULT_SETTINGS);
assert.equal(r1.result, 'blackjack');
assert.equal(r1.payout, 250, '3:2 on 100 = 250 returned');

const winHand = { cards: [{ rank: '10', suit: 'hearts' }, { rank: '9', suit: 'diamonds' }], status: 'active', bet: 100 };
const r2 = resolveHand(winHand, dealerHard18, DEFAULT_SETTINGS);
assert.equal(r2.result, 'win');
assert.equal(r2.payout, 200);

const pushHand = { cards: [{ rank: '10', suit: 'hearts' }, { rank: '8', suit: 'diamonds' }], status: 'active', bet: 100 };
const r3 = resolveHand(pushHand, dealerHard18, DEFAULT_SETTINGS);
assert.equal(r3.result, 'push');
assert.equal(r3.payout, 100);

const surrenderHand = { cards: [{ rank: '10', suit: 'hearts' }, { rank: '6', suit: 'diamonds' }], status: 'surrendered', bet: 100 };
const r4 = resolveHand(surrenderHand, dealerHard18, DEFAULT_SETTINGS);
assert.equal(r4.result, 'surrender');
assert.equal(r4.payout, 50);

const bustHand = { cards: [{ rank: '10', suit: 'hearts' }, { rank: '7', suit: 'diamonds' }, { rank: '6', suit: 'clubs' }], status: 'bust', bet: 100 };
const r5 = resolveHand(bustHand, dealerHard18, DEFAULT_SETTINGS);
assert.equal(r5.result, 'bust');
assert.equal(r5.payout, 0);

const dealerBustHand = { cards: [{ rank: '10', suit: 'hearts' }, { rank: '7', suit: 'diamonds' }], status: 'active', bet: 100 };
const dealerBust = [{ rank: '10', suit: 'hearts' }, { rank: '7', suit: 'diamonds' }, { rank: '6', suit: 'clubs' }];
const r6 = resolveHand(dealerBustHand, dealerBust, DEFAULT_SETTINGS);
assert.equal(r6.result, 'win', 'player wins when dealer busts');
assert.equal(r6.payout, 200);

console.log('All action/resolution tests passed.');

// hiLoValue
assert.equal(hiLoValue({ rank: '2', suit: 'hearts' }), 1,  '2 = +1');
assert.equal(hiLoValue({ rank: '6', suit: 'clubs' }),  1,  '6 = +1');
assert.equal(hiLoValue({ rank: '7', suit: 'spades' }), 0,  '7 = 0');
assert.equal(hiLoValue({ rank: '9', suit: 'diamonds'}), 0, '9 = 0');
assert.equal(hiLoValue({ rank: '10', suit: 'hearts'}), -1, '10 = -1');
assert.equal(hiLoValue({ rank: 'J',  suit: 'hearts'}), -1, 'J = -1');
assert.equal(hiLoValue({ rank: 'Q',  suit: 'hearts'}), -1, 'Q = -1');
assert.equal(hiLoValue({ rank: 'K',  suit: 'hearts'}), -1, 'K = -1');
assert.equal(hiLoValue({ rank: 'A',  suit: 'hearts'}), -1, 'A = -1');
console.log('hiLoValue tests passed.');
