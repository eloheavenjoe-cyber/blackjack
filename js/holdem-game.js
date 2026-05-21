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
  // Implemented in Task 12
}

function scheduleNextHand(room) {
  // Implemented in Task 14
}

main().catch(console.error);
