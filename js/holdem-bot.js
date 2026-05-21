import { evaluateHand, RANK_VALUE, getBlinds } from './holdem-engine.js';

// Returns 1 (premium), 2 (strong), 3 (playable), 0 (trash)
function classifyPreflop(holeCards) {
  const [c1, c2] = holeCards;
  const r1 = RANK_VALUE[c1.rank], r2 = RANK_VALUE[c2.rank];
  const suited = c1.suit === c2.suit;
  const high = Math.max(r1, r2), low = Math.min(r1, r2);
  const pair = r1 === r2;

  // Tier 1: JJ+, AK (suited or offsuit)
  if (pair && high >= 11) return 1;
  if (high === 14 && low === 13) return 1;

  // Tier 2: TT-77, AQo, AQs, AJs, KQs
  if (pair && high >= 7 && high <= 10) return 2;
  if (high === 14 && low === 12) return 2;
  if (high === 14 && low === 11 && suited) return 2;
  if (high === 13 && low === 12 && suited) return 2;

  // Tier 3: 66-22, suited connectors JTs-54s, AXs, KJs, QJs
  if (pair && high >= 2 && high <= 6) return 3;
  if (suited && high - low === 1 && high >= 5 && high <= 11) return 3;
  if (high === 14 && suited) return 3;
  if (high === 13 && low === 11 && suited) return 3;
  if (high === 12 && low === 11 && suited) return 3;

  return 0;
}

function preflopAction(holeCards, mode, bb, currentBet, minRaise, callAmount, isFree, player) {
  const tier = classifyPreflop(holeCards);

  if (tier === 0) {
    return isFree ? { type: 'check' } : { type: 'fold' };
  }

  const raiseTarget = 3 * bb;
  const minRaiseTotal = currentBet + minRaise;
  const maxAmount = player.stack + (player.streetBet || 0);
  const canRaise = raiseTarget >= minRaiseTotal && maxAmount >= currentBet;

  if (mode === 'aggro') {
    if (tier <= 2 && canRaise) {
      return { type: 'raise', amount: Math.min(raiseTarget, maxAmount) };
    }
    return isFree ? { type: 'check' } : { type: 'call' };
  }

  // Passive: only tier 1 raises
  if (tier === 1 && canRaise) {
    return { type: 'raise', amount: Math.min(raiseTarget, maxAmount) };
  }
  return isFree ? { type: 'check' } : { type: 'call' };
}

function postflopAction(holeCards, communityCards, mode, currentBet, minRaise, pot, callAmount, isFree, player) {
  const result = evaluateHand(holeCards, communityCards);
  const rank = result.rank;
  const maxAmount = player.stack + (player.streetBet || 0);
  const minRaiseTotal = currentBet + minRaise;

  if (rank === 0) {
    return isFree ? { type: 'check' } : { type: 'fold' };
  }

  const potOdds = callAmount > 0 ? callAmount / (pot + callAmount) : 0;

  if (rank === 1) {
    if (!isFree && potOdds > 0.4) return { type: 'fold' };
    return isFree ? { type: 'check' } : { type: 'call' };
  }

  if (rank === 2) {
    if (mode === 'passive' && !isFree && potOdds > 0.4) return { type: 'fold' };
    return isFree ? { type: 'check' } : { type: 'call' };
  }

  if (rank <= 4) {
    if (mode === 'aggro') {
      const target = currentBet + Math.floor(pot / 2);
      if (target >= minRaiseTotal && maxAmount >= currentBet) {
        return { type: 'raise', amount: Math.min(target, maxAmount) };
      }
    }
    return isFree ? { type: 'check' } : { type: 'call' };
  }

  // rank 5-8: flush through royal flush
  if (mode === 'aggro') {
    const target = currentBet + pot;
    if (target >= minRaiseTotal && maxAmount >= currentBet) {
      return { type: 'raise', amount: Math.min(target, maxAmount) };
    }
  }
  return isFree ? { type: 'check' } : { type: 'call' };
}

export function getHoldemBotAction(holeCards, communityCards, room, player, mode) {
  const { bb } = getBlinds(room.settings);
  const currentBet = room.currentBet || 0;
  const minRaise = room.minRaise || bb;
  const pot = room.pot || 0;
  const callAmount = Math.max(0, currentBet - (player.streetBet || 0));
  const isFree = callAmount === 0;

  if (!communityCards || communityCards.length === 0) {
    return preflopAction(holeCards, mode, bb, currentBet, minRaise, callAmount, isFree, player);
  }
  return postflopAction(holeCards, communityCards, mode, currentBet, minRaise, pot, callAmount, isFree, player);
}
