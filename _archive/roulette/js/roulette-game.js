import {
  initRoom, joinRoom, onRoomChange, uid, roomCode,
  isHost, updateRoomField, updateAllBalances,
  setupConnectionMonitoring
} from './room.js';
import { initChat } from './chat.js';
import { initMusicPlayer } from './music.js';
import { initLeaderboard, updateLeaderboard } from './leaderboard.js';
import { spin, calcPayouts, getColor } from './roulette-engine.js';
import {
  buildWheel, buildBettingGrid, buildChipSelector,
  animateSpin, resetBallAndRotor,
  updateBetCell, clearBetCells, setGridEnabled,
  showSpinResult, hideSpinResult, renderPlayers
} from './roulette-ui.js';
import { update, ref, getDatabase } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import * as sound from './sound.js';

const params = new URLSearchParams(location.search);
const code = params.get('room');
if (!code) location.href = 'index.html';

let currentRoom = null;
let localBets = {};          // { betId: amount }
let lastPhase = null;
let spinning = false;
let bettingLocked = false;

const rotorEl = document.getElementById('wheel-rotor');
const ballEl  = document.getElementById('ball');

function db() { return getDatabase(getApp()); }

async function writeBetsToFirebase() {
  const betObj = {};
  for (const [k, v] of Object.entries(localBets)) {
    betObj[k] = v > 0 ? v : null;
  }
  await update(ref(db(), `rooms/${roomCode}/rouletteBets/${uid}`), betObj);
}

function getTotalBet() {
  return Object.values(localBets).reduce((s, v) => s + (v || 0), 0);
}

function updateBetTotalDisplay() {
  const el = document.getElementById('my-bet-total');
  if (el) el.textContent = `Bet: $${getTotalBet()}`;
}

function updateBalanceDisplay(balance) {
  const el = document.getElementById('hud-balance');
  if (el) el.textContent = `$${balance}`;
}

function updatePhaseLabel(phase) {
  const el = document.getElementById('phase-label');
  if (!el) return;
  const labels = { betting: 'Place your bets', spinning: 'No more bets...', results: 'Round over' };
  el.textContent = labels[phase] || '';
}

function handleBettingPhase(room) {
  hideSpinResult();
  setGridEnabled(true);
  updatePhaseLabel('betting');

  const hostCtrl = document.getElementById('host-controls');
  const btnSpin  = document.getElementById('btn-close-spin');
  const btnNext  = document.getElementById('btn-next-round');
  if (hostCtrl && isHost) {
    hostCtrl.hidden = false;
    btnSpin.hidden  = false;
    btnNext.hidden  = true;
  }

  renderPlayers(room.players, uid, null);
}

function handleSpinningPhase(room) {
  if (spinning) return;
  spinning = true;
  setGridEnabled(false);
  updatePhaseLabel('spinning');

  const { number, color } = room.lastSpin || {};

  animateSpin(rotorEl, ballEl, number, () => {
    try {
      showSpinResult(number, color, null);
      if (isHost) applyPayoutsAndSetResults(room).catch(console.error);
    } finally {
      spinning = false;
    }
  });
}

async function applyPayoutsAndSetResults(room) {
  const { number } = room.lastSpin;
  const bets = room.rouletteBets || {};
  const payouts = calcPayouts(number, bets);

  // Write balance updates and phase change atomically to avoid clients
  // seeing results phase before balances are updated.
  const updates = { [`rooms/${roomCode}/phase`]: 'results' };
  const players = room.players || {};
  for (const [pid, p] of Object.entries(players)) {
    if (p.kicked) continue;
    const delta = payouts[pid] || 0;
    updates[`rooms/${roomCode}/players/${pid}/balance`] = (p.balance || 0) + delta;
  }
  await update(ref(db()), updates);
}

function handleResultsPhase(room) {
  const { number, color } = room.lastSpin || {};
  const bets = room.rouletteBets || {};
  const payouts = calcPayouts(number, bets);
  const myDelta = payouts[uid] || 0;

  showSpinResult(number, color, myDelta);
  setGridEnabled(false);
  updatePhaseLabel('results');
  renderPlayers(room.players, uid, payouts);
  updateLeaderboard(room);

  const hostCtrl = document.getElementById('host-controls');
  const btnSpin  = document.getElementById('btn-close-spin');
  const btnNext  = document.getElementById('btn-next-round');
  if (hostCtrl && isHost) {
    hostCtrl.hidden = false;
    btnSpin.hidden  = true;
    btnNext.hidden  = false;
  }
}

function handleRoomChange(room) {
  if (!room) return;
  currentRoom = room;

  const me = room.players?.[uid];
  if (me) updateBalanceDisplay(me.balance ?? 0);

  renderPlayers(room.players, uid, null);

  const phase = room.phase;
  if (phase === 'betting') {
    if (lastPhase !== 'betting') {
      localBets = {};
      clearBetCells();
      updateBetTotalDisplay();
      resetBallAndRotor(rotorEl, ballEl);
    }
    handleBettingPhase(room);
  } else if (phase === 'spinning' && lastPhase !== 'spinning') {
    handleSpinningPhase(room);
  } else if (phase === 'results' && lastPhase !== 'results') {
    handleResultsPhase(room);
  }

  lastPhase = phase;
}

async function init() {
  await initRoom();
  const playerName = sessionStorage.getItem('playerName') || 'Player';
  await joinRoom(code, playerName);
  setupConnectionMonitoring();
  sound.init();

  buildWheel(rotorEl);
  buildChipSelector(document.getElementById('chip-selector'));
  buildBettingGrid(document.getElementById('bet-grid'), onBetClick);
  setGridEnabled(false);

  initChat(roomCode, uid, playerName, {});
  initMusicPlayer(roomCode, isHost);
  initLeaderboard();

  document.getElementById('btn-mute')?.addEventListener('click', () => {
    sound.toggleMute();
    document.getElementById('btn-mute').textContent = sound.isMuted() ? '🔇' : '🔊';
  });

  document.getElementById('btn-leave')?.addEventListener('click', () => {
    location.href = 'index.html';
  });

  document.getElementById('btn-clear-bets')?.addEventListener('click', async () => {
    if (currentRoom?.phase !== 'betting') return;
    localBets = {};
    clearBetCells();
    updateBetTotalDisplay();
    await writeBetsToFirebase().catch(console.error);
  });

  document.getElementById('btn-close-spin')?.addEventListener('click', async () => {
    if (!isHost || currentRoom?.phase !== 'betting') return;
    const result = spin();
    const color = getColor(result);
    const db2 = db();
    await update(ref(db2), {
      [`rooms/${roomCode}/lastSpin`]: { number: result, color },
      [`rooms/${roomCode}/phase`]: 'spinning',
    });
  });

  document.getElementById('btn-next-round')?.addEventListener('click', async () => {
    if (!isHost || currentRoom?.phase !== 'results') return;
    const db2 = db();
    await update(ref(db2), {
      [`rooms/${roomCode}/rouletteBets`]: null,
      [`rooms/${roomCode}/phase`]: 'betting',
    });
  });

  onRoomChange(handleRoomChange);
}

async function onBetClick(betId, amount) {
  if (bettingLocked || currentRoom?.phase !== 'betting') return;
  const me = currentRoom?.players?.[uid];
  const balance = me?.balance ?? 0;
  const currentTotal = getTotalBet();
  if (currentTotal + amount > balance) return;

  bettingLocked = true;
  try {
    localBets[betId] = (localBets[betId] || 0) + amount;
    updateBetCell(betId, localBets[betId]);
    updateBetTotalDisplay();
    await writeBetsToFirebase();
  } finally {
    bettingLocked = false;
  }
}

init().catch(console.error);
