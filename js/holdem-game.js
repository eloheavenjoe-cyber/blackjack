import {
  initRoom, uid, roomCode, isHost,
  onRoomChange, writePlayerAction, updatePlayer,
  createHoldemRoom, joinHoldemRoom, writeHoleCards, watchHoleCards, updateHoldemState, getRoom
} from './room.js';
import {
  shuffle, createDeck, cardToStr, dealHoleCards, dealCommunity,
  getBlinds, getNextDealerSeat, getNextActionSeat, calculateSidePots,
  evaluateHand, compareHands
} from './holdem-engine.js';
import {
  renderSeats, renderCommunityCards, renderPot,
  renderActionControls, startTimer, showShowdownCards, showWinnerMessage
} from './holdem-ui.js';
import { initChat } from './chat.js';
import { initMusicPlayer } from './music.js';
import { play as playSound } from './sound.js';

const params = new URLSearchParams(window.location.search);
const code   = params.get('room');
const name   = sessionStorage.getItem('playerName') || localStorage.getItem('playerName') || 'Player';

let localDeck = [];
let myHoleCards = null;
let stopTimer = null;

async function main() {
  await initRoom();

  const room = code
    ? await joinHoldemRoom(code, name)
    : await createHoldemRoom(name, JSON.parse(localStorage.getItem('holdemSettings') || 'null') || { blindPreset: '10/20', startingStack: 1000 });

  initChat(roomCode, uid, name);
  initMusicPlayer(roomCode, isHost);
  watchHoleCards(cards => {
    myHoleCards = cards;
  });

  onRoomChange(room => {
    if (!room) return;
    renderSeats(room, uid, myHoleCards);
    renderCommunityCards(room.communityCards);
    renderPot(room);

    const me = room.players?.[uid];
    if (me) renderActionControls(me, room, handleAction);

    if (room.phase === 'waiting') renderLobby(room);
    if (room.phase === 'showdown' && isHost) scheduleNextHand(room);
  });

  if (isHost) renderHostControls();
}

function renderLobby(room) {
  const status = document.getElementById('status-msg');
  const me = room.players?.[uid];
  if (!me) return;

  if (me.ready) {
    status.textContent = 'Waiting for others…';
    return;
  }

  if (document.getElementById('btn-ready')) return;

  status.innerHTML = '<button id="btn-ready">Ready</button>';
  document.getElementById('btn-ready').addEventListener('click', async () => {
    await updatePlayer(uid, { ready: true });
    if (isHost) await checkAllReady(room);
  });
}

async function checkAllReady(room) {
  const fresh = await getRoom();
  const players = Object.values(fresh?.players || {});
  const active = players.filter(p => !p.sittingOut);
  if (active.length < 2) return;
  if (!active.every(p => p.ready)) return;
  await startNewHand(fresh);
}

function renderHostControls() {
  // Host's ready button acts as the game start trigger via checkAllReady
}

async function handleAction(action) {
  const ts = Date.now();
  await writePlayerAction({ action: { ...action, ts } });
}

async function startNewHand(room) {
  const players = Object.values(room.players || {}).filter(p => !p.sittingOut);
  if (players.length < 2) return;

  const seats = players.sort((a, b) => a.seat - b.seat);
  const newDealer = getNextDealerSeat(seats, room.dealerSeat ?? -1);
  const { sb, bb } = getBlinds(room.settings);

  const dealerIdx = seats.findIndex(p => p.seat === newDealer);
  const sbPlayer = seats[(dealerIdx + 1) % seats.length];
  const bbPlayer = seats[(dealerIdx + 2) % seats.length];

  const resetUpdates = {};
  for (const [pid, p] of Object.entries(room.players)) {
    if (p.sittingOut) continue;
    resetUpdates[`players/${pid}/folded`]    = false;
    resetUpdates[`players/${pid}/allIn`]     = false;
    resetUpdates[`players/${pid}/acted`]     = false;
    resetUpdates[`players/${pid}/streetBet`] = 0;
    resetUpdates[`players/${pid}/totalBet`]  = 0;
    resetUpdates[`players/${pid}/ready`]     = false;
  }

  const sbUid = Object.entries(room.players).find(([, p]) => p.seat === sbPlayer.seat)?.[0];
  const bbUid = Object.entries(room.players).find(([, p]) => p.seat === bbPlayer.seat)?.[0];
  const sbAmount = Math.min(sb, sbPlayer.stack);
  const bbAmount = Math.min(bb, bbPlayer.stack);
  resetUpdates[`players/${sbUid}/streetBet`] = sbAmount;
  resetUpdates[`players/${sbUid}/totalBet`]  = sbAmount;
  resetUpdates[`players/${sbUid}/stack`]     = sbPlayer.stack - sbAmount;
  resetUpdates[`players/${bbUid}/streetBet`] = bbAmount;
  resetUpdates[`players/${bbUid}/totalBet`]  = bbAmount;
  resetUpdates[`players/${bbUid}/stack`]     = bbPlayer.stack - bbAmount;

  // Deal hole cards
  localDeck = shuffle(createDeck());
  const playerUids = seats.map(p =>
    Object.entries(room.players).find(([, pl]) => pl.seat === p.seat)[0]
  );
  const { hands, remaining } = dealHoleCards(localDeck, playerUids.length);
  localDeck = remaining;

  for (let i = 0; i < playerUids.length; i++) {
    await writeHoleCards(playerUids[i], hands[i].map(cardToStr));
  }

  // UTG = first to act after BB
  const seatStates = seats.map(p => ({
    seat: p.seat,
    acted: false,
    streetBet: p.seat === bbPlayer.seat ? bbAmount : (p.seat === sbPlayer.seat ? sbAmount : 0),
    folded: false, allIn: false, sittingOut: false
  }));
  const utg = getNextActionSeat(seatStates, bbPlayer.seat, bbAmount);

  await updateHoldemState({
    ...resetUpdates,
    phase:          'preflop',
    dealerSeat:     newDealer,
    communityCards: [],
    pot:            sbAmount + bbAmount,
    sidePots:       [],
    currentBet:     bbAmount,
    minRaise:       bbAmount,
    actionSeat:     utg ?? bbPlayer.seat,
    handNumber:     (room.handNumber || 0) + 1
  });

  playSound('deal');
}

async function advancePhase(room) {
  const phases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
  const next = phases[phases.indexOf(room.phase) + 1];
  if (!next) return;

  if (next === 'showdown') {
    await runShowdown(room);
    return;
  }

  const players = Object.values(room.players || {});
  const newPot = players.filter(p => !p.sittingOut).reduce((s, p) => s + (p.streetBet || 0), room.pot || 0);

  const { cards, remaining } = dealCommunity(localDeck, next);
  localDeck = remaining;

  const resetUpdates = {};
  for (const [pid, p] of Object.entries(room.players)) {
    if (p.folded || p.sittingOut) continue;
    resetUpdates[`players/${pid}/streetBet`] = 0;
    resetUpdates[`players/${pid}/acted`]     = false;
  }

  const activePlayers = players
    .filter(p => !p.folded && !p.sittingOut)
    .map(p => ({ ...p, acted: false, streetBet: 0 }));

  const firstToAct = getNextActionSeat(activePlayers, room.dealerSeat, 0);

  await updateHoldemState({
    ...resetUpdates,
    phase:          next,
    communityCards: [...(room.communityCards || []), ...cards.map(cardToStr)],
    pot:            newPot,
    currentBet:     0,
    minRaise:       getBlinds(room.settings).bb,
    actionSeat:     firstToAct
  });

  playSound('card');
}

async function runShowdown(room) {
  // Implemented in Task 14
}

function scheduleNextHand(room) {
  // Implemented in Task 14
}

main().catch(console.error);
