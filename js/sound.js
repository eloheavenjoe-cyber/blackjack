const SOUNDS = {
  card_deal:     'assets/sounds/card_deal.wav',
  dealer_reveal: 'assets/sounds/dealer_reveal.wav',
  chip_click:    'assets/sounds/chip_click.wav',
  win:           'assets/sounds/win.wav',
  blackjack:     'assets/sounds/blackjack.wav',
  lose:          'assets/sounds/lose.wav',
  bust:          'assets/sounds/bust.wav',
  chat_notify:   'assets/sounds/chat_notify.wav',
  shuffle_shoe:  'assets/sounds/shuffle_shoe.wav',
};

const nodes = {};
let muted = false;
let volume = 1;

export function init() {
  muted = localStorage.getItem('bj_muted') === 'true';
  volume = parseFloat(localStorage.getItem('bj_volume') ?? '1');
  for (const [key, src] of Object.entries(SOUNDS)) {
    const audio = new Audio(src);
    audio.addEventListener('error', () => { delete nodes[key]; });
    audio.load();
    nodes[key] = audio;
  }
}

export function play(key) {
  if (muted || !nodes[key]) return;
  const clone = nodes[key].cloneNode();
  clone.volume = volume;
  clone.play().catch(() => {});
}

export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  localStorage.setItem('bj_volume', String(volume));
}

export function getVolume() {
  return volume;
}

export function toggleMute() {
  muted = !muted;
  localStorage.setItem('bj_muted', String(muted));
  return muted;
}

export function isMuted() {
  return muted;
}
