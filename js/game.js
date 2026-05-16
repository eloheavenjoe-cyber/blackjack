import { initRoom, joinRoom, onRoomChange, writePlayerAction, uid, roomCode, isHost,
         setPhase, setCurrentTurn, dealCards, updatePlayer, updateAllBalances, updateRoomField } from './room.js';
import { renderTableState, renderChipSelector, createTimerRing, updateTimerRing } from './ui.js';
import { startTimer, stopTimer } from './timer.js';
import { createDeck, shuffle, cardToStr, cardFromStr, handValue, isBlackjack, isBust,
         canHit, canStand, canDouble, canSplit, canSurrender, dealerShouldHit, resolveHand,
         hiLoValue } from './engine.js';

const params = new URLSearchParams(location.search);
const code = params.get('room');

if (!code) {
  location.href = 'index.html';
}

let currentRoom = null;
let localDeck = [];
let runningCount = 0;
let lastBettingRenderKey = null;
let advancingFromBetting = false;

async function init() {
  await initRoom();
  const name = sessionStorage.getItem('playerName') || 'Player';
  console.log('[BJ] init — uid:', uid, 'name:', name, 'code:', code);
  await joinRoom(code, name);
  console.log('[BJ] joinRoom done — uid:', uid, 'isHost:', isHost);

  onRoomChange(room => {
    console.log('[BJ] room update — phase:', room?.phase, 'isHost:', isHost, 'uid:', uid, 'hostId:', room?.hostId, 'myPlayer:', (room?.players || {})[uid]);
    currentRoom = room;
    renderTableState(room, uid);
    handleRoomUpdate(room);
  });

  document.getElementById('btn-donate')?.addEventListener('click', showDonatePanel);
}

function handleRoomUpdate(room) {
  if (!room) return;

  if (room.phase !== 'betting') lastBettingRenderKey = null;

  if (room.phase === 'betting') {
    renderBettingUI(room);
    if (isHost && !advancingFromBetting) {
      const active = Object.values(room.players || {}).filter(p => p.status !== 'sitting-out');
      if (active.length > 0 && active.every(p => p.status === 'ready')) {
        advancingFromBetting = true;
        advanceFromBetting(room).finally(() => { advancingFromBetting = false; });
      } else if (room.turnDeadline && room.turnDeadline - Date.now() <= 0) {
        advancingFromBetting = true;
        advanceFromBetting(room).finally(() => { advancingFromBetting = false; });
      }
    }
  }

  if (room.phase === 'dealing' && isHost) {
    handleDealingPhase(room);
  }

  if (room.phase === 'playing') {
    if (room.currentTurn === uid) {
      renderActionButtons(room);
    }
    if (isHost) {
      watchForPlayerAction(room);
    }
  }
}

// ---- BETTING PHASE ----
function renderBettingUI(room) {
  const wrap = document.getElementById('chip-selector-wrap');
  if (wrap) {
    const me = (room.players || {})[uid];
    if (me && me.status === 'ready') {
      wrap.hidden = true;
      lastBettingRenderKey = null;
    } else if (me && me.status !== 'sitting-out') {
      const settings = room.settings;
      const renderKey = `${me.bet ?? 0}|${me.status}|${me.balance}`;
      if (renderKey !== lastBettingRenderKey) {
        lastBettingRenderKey = renderKey;
        wrap.hidden = false;
        wrap.innerHTML = '';
        const selector = renderChipSelector(settings.minBet, settings.maxBet, me.bet || 0, me.balance, async denom => {
          const newBet = Math.min((me.bet || 0) + denom, settings.maxBet);
          await writePlayerAction({ bet: newBet });
        });
        wrap.appendChild(selector);

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'action-btn';
        confirmBtn.textContent = 'Confirm Bet';
        confirmBtn.style.marginTop = '8px';
        confirmBtn.addEventListener('click', async () => {
          const bet = (currentRoom?.players?.[uid]?.bet || 0);
          if (bet < settings.minBet) { alert(`Minimum bet is $${settings.minBet}`); return; }
          await writePlayerAction({ status: 'ready' });
          wrap.hidden = true;
        });
        wrap.appendChild(confirmBtn);
      } else {
        wrap.hidden = false;
      }
    } else {
      wrap.hidden = true;
    }
  }

  if (isHost) {
    const hostCtrl = document.getElementById('host-controls');
    if (hostCtrl) {
      if (!hostCtrl.querySelector('.action-btn')) {
        const forceBtn = document.createElement('button');
        forceBtn.className = 'action-btn';
        forceBtn.textContent = 'Force Start';
        forceBtn.addEventListener('click', () => advanceFromBetting(currentRoom));
        hostCtrl.appendChild(forceBtn);
      }
      hostCtrl.hidden = false;
    }
  }
}

async function advanceFromBetting(room) {
  const players = room.players || {};
  for (const [pid, p] of Object.entries(players)) {
    if (p.status !== 'ready' && p.status !== 'sitting-out') {
      await updatePlayer(pid, { status: 'sitting-out' });
    }
  }
  await setPhase('dealing');
}

// ---- DEALING PHASE ----
let dealingInProgress = false;

async function handleDealingPhase(room) {
  if (dealingInProgress) return;
  dealingInProgress = true;
  try {
    if (localDeck.length < 20) {
      localDeck = shuffle(createDeck(room.settings.decks)).map(cardToStr);
      runningCount = 0;
    }
    const players = room.players || {};
    const activePids = Object.entries(players)
      .filter(([, p]) => p.status === 'ready')
      .map(([pid]) => pid);

    if (activePids.length === 0) { await setPhase('waiting'); return; }

    const playerBets = {};
    for (const pid of activePids) playerBets[pid] = players[pid].bet || 0;
    const result = await dealCards(localDeck, activePids, playerBets);
    localDeck = result.remaining;

    const dealtCards = [
      ...Object.values(result.playerHands).flat(),
      ...result.dealerHand
    ].map(cardFromStr);
    runningCount += dealtCards.reduce((sum, c) => sum + hiLoValue(c), 0);
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', runningCount),
    ]);

    await setPhase('playing');
    await advanceTurn(room, activePids, null);
  } finally {
    dealingInProgress = false;
  }
}

// ---- PLAYING PHASE ----
async function advanceTurn(room, activePids, lastPid) {
  const players = room.players || {};
  const queue = activePids || Object.entries(players)
    .filter(([, p]) => p.status === 'playing')
    .map(([pid]) => pid);

  const lastIdx = lastPid ? queue.indexOf(lastPid) : -1;
  const nextPid = queue[lastIdx + 1];

  if (!nextPid) {
    await playDealerHand(room);
    return;
  }

  await setCurrentTurn(nextPid, room.settings.actionTimer || 30);

  if (isHost && room.settings.actionTimer > 0 && nextPid !== uid) {
    const deadline = Date.now() + room.settings.actionTimer * 1000;
    startTimer(deadline, null, async () => {
      await applyPlayerAction(nextPid, 'stand', currentRoom);
    });
  }
}

let watchedAction = null;
async function watchForPlayerAction(room) {
  const turn = room.currentTurn;
  if (!turn) return;

  const player = (room.players || {})[turn];
  if (!player?.action) return;

  const actionToken = `${turn}:${player.action.ts ?? player.action.type}`;
  if (actionToken === watchedAction) return;
  watchedAction = actionToken;

  await applyPlayerAction(turn, player.action.type, room);
}

async function applyPlayerAction(pid, actionType, room) {
  stopTimer();
  const player = (room.players || {})[pid];
  if (!player) return;
  const handIdx = player.handIndex || 0;
  const handStrs = (player.hands || [[]])[handIdx] || [];
  const settings = room.settings;
  const activePids = Object.entries(room.players || {})
    .filter(([, p]) => p.status === 'playing')
    .map(([id]) => id);

  let newHandStrs = [...handStrs];
  let newStatus = player.status;
  let newBalance = player.balance;

  if (actionType === 'hit') {
    const card = localDeck.shift();
    newHandStrs.push(card);
    const newHand = newHandStrs.map(cardFromStr);
    newStatus = isBust(newHand) ? 'bust' : player.status;
    const newHands = [...(player.hands || [])];
    newHands[handIdx] = newHandStrs;
    await updatePlayer(pid, { hands: newHands, status: newStatus, action: null });
    runningCount += hiLoValue(cardFromStr(card));
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', runningCount),
    ]);
    if (newStatus !== 'bust') return;
  } else if (actionType === 'stand') {
    const hands = player.hands || [];
    if (handIdx < hands.length - 1) {
      await updatePlayer(pid, { handIndex: handIdx + 1, action: null });
      await setCurrentTurn(pid, settings.actionTimer || 30);
      return;
    }
    await updatePlayer(pid, { status: 'done', action: null });
  } else if (actionType === 'double') {
    const card = localDeck.shift();
    newHandStrs.push(card);
    const newHand = newHandStrs.map(cardFromStr);
    newBalance -= (player.bets || [])[handIdx] || 0;
    const newBets = [...(player.bets || [])];
    newBets[handIdx] = (newBets[handIdx] || 0) * 2;
    newStatus = isBust(newHand) ? 'bust' : 'done';
    const newHands = [...(player.hands || [])];
    newHands[handIdx] = newHandStrs;
    await updatePlayer(pid, { hands: newHands, bets: newBets, balance: newBalance, status: newStatus, action: null });
    runningCount += hiLoValue(cardFromStr(card));
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', runningCount),
    ]);
  } else if (actionType === 'split') {
    const hands = [...(player.hands || [])];
    const bets = [...(player.bets || [])];
    const [c1, c2] = handStrs.map(cardFromStr);
    const draw1 = localDeck.shift();
    const draw2 = localDeck.shift();
    hands[handIdx] = [cardToStr(c1), draw1];
    hands.splice(handIdx + 1, 0, [cardToStr(c2), draw2]);
    bets.splice(handIdx + 1, 0, bets[handIdx]);
    newBalance -= bets[handIdx] || 0;
    await updatePlayer(pid, { hands, bets, balance: newBalance, splitCount: (player.splitCount || 0) + 1, action: null });
    runningCount += hiLoValue(cardFromStr(draw1)) + hiLoValue(cardFromStr(draw2));
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', runningCount),
    ]);
    await setCurrentTurn(pid, settings.actionTimer || 30);
    return;
  } else if (actionType === 'surrender') {
    await updatePlayer(pid, { status: 'surrendered', action: null });
  }

  await advanceTurn(room, activePids, pid);
}

// ---- RESOLUTION PHASE ----
async function playDealerHand(room) {
  await setPhase('resolution');
  const dealer = room.dealer;
  let dealerCards = [...(dealer.hand || []), dealer.hiddenCard].filter(Boolean).map(cardFromStr);

  while (dealerShouldHit(dealerCards, room.settings)) {
    dealerCards.push(cardFromStr(localDeck.shift()));
  }

  const dealerStrs = dealerCards.map(cardToStr);
  const { setDealer } = await import('./room.js');
  await setDealer(dealerStrs.slice(0, -1), dealerStrs[dealerStrs.length - 1]);

  const balanceMap = {};
  const players = room.players || {};
  for (const [pid, player] of Object.entries(players)) {
    if (!['playing', 'done', 'bust', 'surrendered'].includes(player.status)) continue;
    const totalBet = (player.bets || []).reduce((s, b) => s + b, 0);
    let newBal = player.balance - totalBet;
    const hands = player.hands || [];
    const bets = player.bets || [];
    for (let i = 0; i < hands.length; i++) {
      const handCards = hands[i].map(cardFromStr);
      const st = player.status === 'surrendered' ? 'surrendered' : isBust(handCards) ? 'bust' : 'active';
      const ph = { cards: handCards, status: st, bet: bets[i] || 0 };
      const { payout } = resolveHand(ph, dealerCards, room.settings);
      newBal += payout;
    }
    balanceMap[pid] = newBal;
  }
  await updateAllBalances(balanceMap);

  setTimeout(async () => {
    for (const pid of Object.keys(players)) {
      await updatePlayer(pid, { hands: [], bets: [], handIndex: 0, bet: 0, status: 'waiting', action: null, insurance: false });
    }
    await updateRoomField('turnDeadline', null);
    await setPhase('betting');
  }, 5000);
}

// ---- ACTION BUTTONS ----
function renderActionButtons(room) {
  const wrap = document.getElementById('action-buttons');
  if (!wrap) return;
  const me = (room.players || {})[uid];
  if (!me || me.action || me.status === 'done' || me.status === 'bust' || me.status === 'surrendered') {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = '';
  const handIdx = me.handIndex || 0;
  const handStrs = (me.hands || [[]])[handIdx] || [];
  const hand = handStrs.map(cardFromStr);
  const ph = { cards: hand, status: 'active', splitCount: me.splitCount || 0, bet: (me.bets || [])[handIdx] || 0 };
  const s = room.settings;

  const buttons = [
    { label: 'Hit', type: 'hit', enabled: canHit(ph) },
    { label: 'Stand', type: 'stand', enabled: canStand(ph) },
    { label: 'Double', type: 'double', enabled: canDouble(ph, s, me.balance) },
    { label: 'Split', type: 'split', enabled: canSplit(ph, s, me.balance) },
    { label: 'Surrender', type: 'surrender', enabled: canSurrender(ph, s) },
  ];

  for (const { label, type, enabled } of buttons) {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = label;
    btn.disabled = !enabled;
    btn.addEventListener('click', async () => {
      wrap.hidden = true;
      await writePlayerAction({ action: { type, handIndex: handIdx, ts: Date.now() } });
    });
    wrap.appendChild(btn);
  }

  if (room.turnDeadline && s.actionTimer > 0) {
    const totalMs = s.actionTimer * 1000;
    const ring = createTimerRing(totalMs);
    wrap.appendChild(ring);
    startTimer(room.turnDeadline, ms => updateTimerRing(ring, ms), async () => {
      wrap.hidden = true;
      await writePlayerAction({ action: { type: 'stand', handIndex: handIdx, ts: Date.now() } });
    });
  }
}

// ---- DONATE ----
function showDonatePanel() {
  import('./donate.js').then(m => m.showDonatePanel(currentRoom, uid));
}

init();
