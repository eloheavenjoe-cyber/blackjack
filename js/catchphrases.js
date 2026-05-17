const LINES = {
  dealer_blackjack: [
    "Blackjack. I'd say sorry, but I'm not.",
    "House wins. It always does. Read the sign.",
    "Natural 21. Don't take it personally — actually, do.",
    "Ooh, that had to hurt. Pay up.",
    "Statistically, your luck turns around eventually.",
  ],
  dealer_bust: [
    "22. My therapist will hear about this.",
    "I busted. Don't make it weird.",
    "The house loses. Enjoy it. It won't last.",
    "I walked right into that one.",
    "Dealer busts. I need a moment.",
  ],
  player_blackjack: [
    "Another 21? You're killing me here.",
    "Beautiful. I hate it.",
    "Of course you did.",
    "21. My condolences to my bankroll.",
    "Blackjack! ...great.",
  ],
  bust: [
    "Greed is a cruel mistress.",
    "The spirit was willing but the math was not.",
    "Bold strategy. Costly, but bold.",
    "Should've stopped two cards ago.",
    "Bust. I won't say I saw it coming. I saw it coming.",
  ],
  win: [
    "You win. For now.",
    "Fine. Take it.",
    "The casino wins the war. You won a battle.",
    "Enjoy it. The odds remember everything.",
    "Beginner's luck. Or just luck. Hard to tell.",
  ],
  lose: [
    "That's mine now. Thank you for your contribution.",
    "Sorry. Actually, not that sorry.",
    "Rough. But predictable.",
    "The house wins. Shocking, I know.",
    "Better luck next hand. There's always a next hand.",
  ],
  push: [
    "Nobody wins. Nobody loses. Nobody has fun.",
    "A tie. How anticlimactic.",
    "We'll call it a draw. A coward's outcome.",
    "Push. The world's most unsatisfying result.",
    "We both walked away from that one.",
  ],
  surrender: [
    "Half your bet, all your dignity.",
    "Surrender accepted. Cowardice respected.",
    "The bravest thing you can do is run.",
    "Smart call. I was going to wreck you.",
    "Lived to fight another hand.",
  ],
};

let bubbleTimeout = null;

export function triggerCatchphrase(event) {
  const lines = LINES[event];
  if (!lines) return;
  const bubble = document.getElementById('dealer-bubble');
  if (!bubble) return;

  if (bubbleTimeout) {
    clearTimeout(bubbleTimeout);
    bubbleTimeout = null;
  }
  bubble.classList.remove('active');
  void bubble.offsetWidth; // force reflow to restart animation

  bubble.textContent = lines[Math.floor(Math.random() * lines.length)];
  bubble.classList.add('active');

  bubbleTimeout = setTimeout(() => {
    bubble.classList.remove('active');
    bubble.textContent = '';
    bubbleTimeout = null;
  }, 4300);
}
