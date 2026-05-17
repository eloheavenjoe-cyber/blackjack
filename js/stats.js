export function computeStatDelta(player, totalPayouts) {
  const wagered = (player.bets && player.bets.length > 0)
    ? player.bets.reduce((s, b) => s + b, 0)
    : (player.bet || 0);
  const roundProfit = totalPayouts - wagered;
  const isWin = roundProfit > 0;
  const isLoss = roundProfit < 0;
  return {
    winStreak: isWin ? (player.winStreak || 0) + 1 : isLoss ? 0 : (player.winStreak || 0),
    handsWon:  (player.handsWon  || 0) + (isWin ? 1 : 0),
    totalWagered:  (player.totalWagered  || 0) + wagered,
    sessionProfit: (player.sessionProfit || 0) + roundProfit,
  };
}
