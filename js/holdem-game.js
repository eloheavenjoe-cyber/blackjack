import {
  initRoom, uid, roomCode, isHost,
  onRoomChange, writePlayerAction, updatePlayer,
  createHoldemRoom, joinHoldemRoom, writeHoleCards, watchHoleCards, updateHoldemState, getRoom, getDb
} from './room.js';
import {
  shuffle, createDeck, cardToStr, dealHoleCards, dealCommunity,
  getBlinds, getNextDealerSeat, getNextActionSeat, calculateSidePots,
  evaluateHand, compareHands
} from './holdem-engine.js';
import {
  renderSeats, renderCommunityCards, renderPot,
  renderActionControls, showWinnerMessage,
  updateRoundCounter, initHoldemLeaderboard, updateHoldemLeaderboard
} from './holdem-ui.js';
import { initChat } from './chat.js';
import { initMusicPlayer } from './music.js';
import { init as initSound, play as playSound, toggleMute, isMuted, getVolume, setVolume } from './sound.js';

const params = new URLSearchParams(window.location.search);
const code   = params.get('room');
const name   = sessionStorage.getItem('playerName') || localStorage.getItem('playerName') || 'Player';

let localDeck = [];
let myHoleCards = null;
let stopTimer = null;
let lastProcessedAction = null;
let nextHandScheduled = false;

async function main() {
  await initRoom();

  const room = code
    ? await joinHoldemRoom(code, name)
    : await createHoldemRoom(name, JSON.parse(localStorage.getItem('holdemSettings') || 'null') || { blindPreset: '10/20', startingStack: 1000 });

  initSound();

  const muteBtn = document.getElementById('btn-mute');
  if (muteBtn) {
    muteBtn.textContent = isMuted() ? '🔇' : '🔊';
    muteBtn.addEventListener('click', () => {
      muteBtn.textContent = toggleMute() ? '🔇' : '🔊';
    });
  }
  const sfxSlider = document.getElementById('sfx-volume');
  if (sfxSlider) {
    sfxSlider.value = Math.round(getVolume() * 100);
    sfxSlider.addEventListener('input', () => setVolume(sfxSlider.value / 100));
  }
  const leaveBtn = document.getElementById('btn-leave');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      if (confirm('Leave the table?')) location.href = 'index.html';
    });
  }

  initHoldemLeaderboard();
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

    const stackEl = document.getElementById('hud-stack');
    if (stackEl && me) stackEl.textContent = `$${me.stack ?? 0}`;
    const handEl = document.getElementById('hud-hand-num');
    if (handEl && room.handNumber) handEl.textContent = `#${room.handNumber}`;

    updateRoundCounter(room.handNumber || 0);
    updateHoldemLeaderboard(room);

    if (room.phase === 'waiting') renderLobby(room);
    if (room.phase === 'showdown' && isHost && !nextHandScheduled) {
      nextHandScheduled = true;
      scheduleNextHand(room);
    }

    checkStreetProgress(room);
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
  const n = seats.length;
  // Heads-up: dealer posts SB (acts first preflop)
  const sbPlayer = n === 2 ? seats[dealerIdx]           : seats[(dealerIdx + 1) % n];
  const bbPlayer = n === 2 ? seats[(dealerIdx + 1) % n] : seats[(dealerIdx + 2) % n];

  const resetUpdates = {};
  for (const [pid, p] of Object.entries(room.players)) {
    if (p.sittingOut) continue;
    resetUpdates[`players/${pid}/folded`]    = false;
    resetUpdates[`players/${pid}/allIn`]     = false;
    resetUpdates[`players/${pid}/acted`]     = false;
    resetUpdates[`players/${pid}/streetBet`] = 0;
    resetUpdates[`players/${pid}/totalBet`]  = 0;
    resetUpdates[`players/${pid}/ready`]     = false;
    resetUpdates[`players/${pid}/action`]    = null;
    resetUpdates[`players/${pid}/showCards`] = null;
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

function watchForPlayerAction(room) {
  if (!isHost) return;

  for (const [pid, player] of Object.entries(room.players || {})) {
    if (!player.action) continue;
    const token = `${pid}:${player.action.ts}`;
    if (token === lastProcessedAction) continue;
    if (room.actionSeat !== player.seat) continue;
    if (player.folded || player.allIn) continue;

    lastProcessedAction = token;
    applyAction(pid, player, room);
    return;
  }
}

async function applyAction(pid, player, room) {
  const { type, amount } = player.action;
  const currentBet = room.currentBet || 0;
  const { bb } = getBlinds(room.settings);

  const updates = { [`players/${pid}/action`]: null, [`players/${pid}/acted`]: true };

  if (type === 'fold') {
    updates[`players/${pid}/folded`] = true;
  } else if (type === 'check') {
    // no bet change
  } else if (type === 'call') {
    const callAmt = Math.min(currentBet - (player.streetBet || 0), player.stack);
    updates[`players/${pid}/stack`]     = player.stack - callAmt;
    updates[`players/${pid}/streetBet`] = (player.streetBet || 0) + callAmt;
    updates[`players/${pid}/totalBet`]  = (player.totalBet || 0) + callAmt;
    if (player.stack - callAmt === 0) updates[`players/${pid}/allIn`] = true;
  } else if (type === 'raise') {
    const added = Math.min(amount - (player.streetBet || 0), player.stack);
    const newStreetBet = (player.streetBet || 0) + added;
    const newRaise = newStreetBet - currentBet;

    updates[`players/${pid}/stack`]     = player.stack - added;
    updates[`players/${pid}/streetBet`] = newStreetBet;
    updates[`players/${pid}/totalBet`]  = (player.totalBet || 0) + added;
    updates.currentBet  = newStreetBet;
    updates.minRaise    = Math.max(newRaise, bb);
    if (player.stack - added === 0) updates[`players/${pid}/allIn`] = true;

    // Only a full raise (>= minRaise) reopens action; short all-in does not
    if (newRaise >= (room.minRaise || bb)) {
      for (const [otherId, other] of Object.entries(room.players || {})) {
        if (otherId === pid || other.folded || other.allIn || other.sittingOut) continue;
        updates[`players/${otherId}/acted`] = false;
      }
    }
  }

  await updateHoldemState(updates);
}

async function checkStreetProgress(room) {
  if (!isHost) return;
  if (!['preflop','flop','turn','river'].includes(room.phase)) return;

  watchForPlayerAction(room);

  const allPlayers = Object.values(room.players || {});
  const active = allPlayers.filter(p => !p.folded && !p.sittingOut);
  if (active.length === 1) {
    await awardPotToLastPlayer(room, active[0]);
    return;
  }

  const seats = allPlayers.filter(p => !p.sittingOut).map(p => ({
    seat: p.seat, folded: p.folded, allIn: p.allIn,
    sittingOut: p.sittingOut, acted: p.acted, streetBet: p.streetBet || 0
  }));
  const nextSeat = getNextActionSeat(seats, room.actionSeat ?? -1, room.currentBet || 0);

  if (nextSeat === null) {
    await advancePhase(room);
  } else if (nextSeat !== room.actionSeat) {
    await updateHoldemState({ actionSeat: nextSeat });
  }
}

async function awardPotToLastPlayer(room, winner) {
  const totalPot = Object.values(room.players || {})
    .filter(p => !p.sittingOut)
    .reduce((s, p) => s + (p.streetBet || 0), room.pot || 0);

  const winnerUid = Object.entries(room.players).find(([, p]) => p.seat === winner.seat)?.[0];
  if (!winnerUid) return;

  const newStack = (winner.stack || 0) + totalPot;
  await updateHoldemState({
    [`players/${winnerUid}/stack`]: newStack,
    phase: 'showdown',
    pot: 0
  });
  showWinnerMessage(winner.name, 'everyone folded');
  playSound('win');
}

async function runShowdown(room) {
  const players = Object.entries(room.players || {}).filter(([, p]) => !p.folded && !p.sittingOut);
  const community = (room.communityCards || []).map(s => {
    const i = s.indexOf('_');
    return { rank: s.slice(0, i), suit: s.slice(i + 1) };
  });

  const cardRevealUpdates = {};
  const handResults = [];

  for (const [pid] of players) {
    const holeSnap = await getHoleCardsOnce(pid);
    if (!holeSnap) continue;
    const holeCards = holeSnap.map(s => {
      const i = s.indexOf('_');
      return { rank: s.slice(0, i), suit: s.slice(i + 1) };
    });
    const result = evaluateHand(holeCards, community);
    handResults.push({ pid, result, holeCards });
    cardRevealUpdates[`players/${pid}/showCards`] = holeSnap;
  }

  const allPlayers = Object.entries(room.players || {}).map(([uid, p]) => ({
    uid, totalBet: (p.totalBet || 0) + (p.streetBet || 0), folded: p.folded
  }));

  const totalPot = Object.values(room.players || {})
    .filter(p => !p.sittingOut)
    .reduce((s, p) => s + (p.streetBet || 0), room.pot || 0);

  const sidePots = calculateSidePots(allPlayers);

  const stackDeltas = {};
  const winMessages = [];

  for (const pot of sidePots) {
    const eligible = handResults.filter(h => pot.eligiblePlayers.includes(h.pid));
    if (eligible.length === 0) continue;

    eligible.sort((a, b) => compareHands(b.result, a.result));
    const best = eligible[0].result;
    const winners = eligible.filter(h => compareHands(h.result, best) === 0);
    const share = Math.floor(pot.amount / winners.length);

    for (const w of winners) {
      stackDeltas[w.pid] = (stackDeltas[w.pid] || 0) + share;
      winMessages.push({ name: room.players[w.pid]?.name, handName: w.result.name });
    }
  }

  const stackUpdates = {};
  for (const [pid, delta] of Object.entries(stackDeltas)) {
    stackUpdates[`players/${pid}/stack`] = (room.players[pid]?.stack || 0) + delta;
  }

  for (const [pid, player] of Object.entries(room.players || {})) {
    const newStack = stackUpdates[`players/${pid}/stack`] ?? player.stack;
    if (newStack <= 0 && !player.sittingOut) {
      stackUpdates[`players/${pid}/sittingOut`] = true;
    }
  }

  const streetBetReset = {};
  for (const pid of Object.keys(room.players || {})) {
    streetBetReset[`players/${pid}/streetBet`] = 0;
  }

  await updateHoldemState({
    ...cardRevealUpdates,
    ...stackUpdates,
    ...streetBetReset,
    phase:    'showdown',
    pot:      totalPot,
    sidePots: sidePots
  });

  for (const msg of winMessages) showWinnerMessage(msg.name, msg.handName);
  playSound('win');
}

function scheduleNextHand(room) {
  setTimeout(async () => {
    nextHandScheduled = false;
    const fresh = await getCurrentRoom();
    if (fresh) await startNewHand(fresh);
  }, 4000);
}

async function getHoleCardsOnce(targetUid) {
  const { get, ref } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
  const snap = await get(ref(getDb(), `privateData/${roomCode}/holeCards/${targetUid}`));
  return snap.val();
}

async function getCurrentRoom() {
  const { get, ref } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
  const snap = await get(ref(getDb(), `rooms/${roomCode}`));
  return snap.val();
}

main().catch(console.error);
