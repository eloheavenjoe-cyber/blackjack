const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

export const RANK_VALUE = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
  '10':10,'J':11,'Q':12,'K':13,'A':14
};

export function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank });
  return deck;
}

export function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function cardToStr(card) { return `${card.rank}_${card.suit}`; }

export function cardFromStr(str) {
  const idx = str.indexOf('_');
  return { rank: str.slice(0, idx), suit: str.slice(idx + 1) };
}

export function dealHoleCards(deck, playerCount) {
  const hands = Array.from({ length: playerCount }, () => []);
  let idx = 0;
  for (let round = 0; round < 2; round++)
    for (let p = 0; p < playerCount; p++)
      hands[p].push(deck[idx++]);
  return { hands, remaining: deck.slice(idx) };
}

export function dealCommunity(deck, phase) {
  if (phase !== 'flop' && phase !== 'turn' && phase !== 'river')
    throw new Error(`Unknown phase: ${phase}`);
  const count = phase === 'flop' ? 3 : 1;
  return { cards: deck.slice(0, count), remaining: deck.slice(count) };
}

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k)
  ];
}

function evaluate5(cards) {
  const vals = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const isStr8 = vals[0] - vals[4] === 4 && new Set(vals).size === 5;
  const isWheel = vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2;

  const counts = {};
  vals.forEach(v => counts[v] = (counts[v] || 0) + 1);
  const groups = Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || +b[0] - +a[0])
    .map(([v, c]) => ({ val: +v, count: c }));

  if (isFlush && (isStr8 || isWheel)) {
    const high = isWheel ? 5 : vals[0];
    return { rank: 8, name: high === 14 ? 'Royal Flush' : 'Straight Flush', tiebreakers: [high] };
  }
  if (groups[0].count === 4)
    return { rank: 7, name: 'Four of a Kind', tiebreakers: [groups[0].val, groups[1].val] };
  if (groups[0].count === 3 && groups[1].count === 2)
    return { rank: 6, name: 'Full House', tiebreakers: [groups[0].val, groups[1].val] };
  if (isFlush)
    return { rank: 5, name: 'Flush', tiebreakers: vals };
  if (isStr8)
    return { rank: 4, name: 'Straight', tiebreakers: [vals[0]] };
  if (isWheel)
    return { rank: 4, name: 'Straight', tiebreakers: [5] };
  if (groups[0].count === 3)
    return { rank: 3, name: 'Three of a Kind', tiebreakers: [groups[0].val, ...groups.slice(1).map(g => g.val)] };
  if (groups[0].count === 2 && groups[1].count === 2)
    return { rank: 2, name: 'Two Pair', tiebreakers: [groups[0].val, groups[1].val, groups[2].val] };
  if (groups[0].count === 2)
    return { rank: 1, name: 'One Pair', tiebreakers: [groups[0].val, ...groups.slice(1).map(g => g.val)] };
  return { rank: 0, name: 'High Card', tiebreakers: vals };
}

export function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank > b.rank ? 1 : -1;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const aVal = a.tiebreakers[i] || 0;
    const bVal = b.tiebreakers[i] || 0;
    if (aVal !== bVal) return aVal > bVal ? 1 : -1;
  }
  return 0;
}

export function evaluateHand(holeCards, communityCards) {
  const all7 = [...holeCards, ...communityCards];
  return combinations(all7, 5).reduce((best, combo) => {
    const result = evaluate5(combo);
    return !best || compareHands(result, best) > 0 ? result : best;
  }, null);
}

export function calculateSidePots(players) {
  const sorted = [...players].sort((a, b) => a.totalBet - b.totalBet);
  const pots = [];
  let prevCap = 0;

  for (const player of sorted) {
    if (player.totalBet <= prevCap) continue;
    const cap = player.totalBet;
    const slice = cap - prevCap;
    const contributors = players.filter(p => p.totalBet > prevCap);
    const amount = contributors.reduce((sum, p) => sum + Math.min(p.totalBet - prevCap, slice), 0);
    const eligiblePlayers = players
      .filter(p => !p.folded && p.totalBet >= cap)
      .map(p => p.uid);
    if (amount > 0) pots.push({ amount, eligiblePlayers });
    prevCap = cap;
  }

  return pots;
}

export function getNextActionSeat(seats, currentSeat, currentBet) {
  const active = seats
    .filter(s => !s.folded && !s.allIn && !s.sittingOut)
    .sort((a, b) => a.seat - b.seat);

  if (active.length <= 1) return null;

  const needsAction = active.filter(s => !s.acted || s.streetBet < currentBet);
  if (needsAction.length === 0) return null;

  if (currentSeat === -1) {
    return needsAction.reduce((min, s) => s.streetBet < min.streetBet ? s : min).seat;
  }

  const underbets = needsAction.filter(s => s.streetBet < currentBet);
  const toAct = underbets.length > 0 ? underbets : needsAction;
  return (toAct.find(s => s.seat > currentSeat) ?? toAct[0]).seat;
}

export function getNextDealerSeat(seats, currentDealer) {
  const available = seats
    .filter(s => !s.sittingOut)
    .map(s => s.seat)
    .sort((a, b) => a - b);
  if (available.length === 0) return currentDealer;
  return available.find(s => s > currentDealer) ?? available[0];
}

export function getBlinds(settings) {
  const [sb, bb] = settings.blindPreset.split('/').map(Number);
  return { sb, bb };
}
