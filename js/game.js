import { initRoom, joinRoom, onRoomChange, writePlayerAction, uid, roomCode, isHost,
         setPhase, setCurrentTurn, dealCards, updatePlayer, updateAllBalances, updateAllPlayerStats,
         updateRoomField, getRoom,
         setupConnectionMonitoring, listenPendingTips, removeTipEntry, sendSystemMessage,
         kickPlayer, clearKickVotes, listenRainEvents, listenKekryEvents,
         updateIsHost, transferHost, addBotPlayer, sendEmojiReaction } from './room.js';
import { renderTableState, renderChipSelector, tossChip, createTimerRing, updateTimerRing } from './ui.js';
import { initChat } from './chat.js';
import { initMusicPlayer, applyMusicState } from './music.js';
import { startTimer, stopTimer } from './timer.js';
import { createDeck, shuffle, cardToStr, cardFromStr, handValue, isBlackjack, isBust,
         canHit, canStand, canDouble, canSplit, canSurrender, dealerShouldHit, resolveHand,
         hiLoValue } from './engine.js';
import { triggerCatchphrase } from './catchphrases.js';
import * as sound from './sound.js';
import { DEALER_OPTIONS } from './settings.js';
import { computeStatDelta } from './stats.js';
import { initLeaderboard, updateLeaderboard } from './leaderboard.js';
import { hiOptIIValue, botBet, botDecision, pickBotName, getBotEmote } from './bot.js';

const params = new URLSearchParams(location.search);
const code = params.get('room');

if (!code) {
  location.href = 'index.html';
}

let currentRoom = null;
let playerName = '';
let localDeck = [];
let runningCount = 0;
let lastBettingRenderKey = null;
let advancingFromBetting = false;
let shufflingShoe = false;
let kickingPlayer = false;
let lastCatchphrasePhase = null;
let lastSoundPhase = null;
let hostInitialized = false;
const botUids = new Set();
const botsPlacingBets = new Set();
let hiOptIICount = 0;
const disconnectTimers = new Map();

function initHostFeatures() {
  if (hostInitialized) return;
  hostInitialized = true;
  getRoom().then(snap => {
    if (snap?.players) {
      for (const [pid, p] of Object.entries(snap.players)) {
        if (p.isBot && !p.kicked) botUids.add(pid);
      }
    }
  }).catch(console.error);
  const hostCtrl = document.getElementById('host-controls');
  if (hostCtrl && !document.getElementById('btn-toggle-count')) {
    const countBtn = document.createElement('button');
    countBtn.id = 'btn-toggle-count';
    countBtn.className = 'action-btn';
    countBtn.style.marginTop = '8px';
    countBtn.textContent = 'Show Count';
    countBtn.addEventListener('click', async () => {
      await updateRoomField('showCount', !(currentRoom?.showCount));
    });
    hostCtrl.appendChild(countBtn);
  }
  listenPendingTips(roomCode, async (tipId, { fromUid, toUid, amount }) => {
    const room = await getRoom();
    const players = room?.players || {};
    const tipper = players[fromUid];
    const recipient = players[toUid];
    await removeTipEntry(roomCode, tipId);
    if (!tipper || !recipient || amount <= 0 || tipper.balance < amount) return;
    await updateAllBalances({
      [fromUid]: tipper.balance - amount,
      [toUid]: recipient.balance + amount,
    });
    await sendSystemMessage(roomCode, `${tipper.name} tipped ${recipient.name} $${amount}!`);
  });
}

async function addBot(room) {
  const players = room.players || {};
  const usedNames = Object.values(players).filter(p => !p.kicked).map(p => p.name);
  const name = pickBotName(usedNames);
  if (!name) return;
  const botUid = `bot_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const balance = room.settings?.startingBalance ?? 0;
  await addBotPlayer(roomCode, botUid, name, balance, room.phase);
  botUids.add(botUid);
  await sendSystemMessage(roomCode, `${name} joined the table.`);
}

async function removeBot(targetName, room) {
  const players = room.players || {};
  const match = Object.entries(players).find(
    ([, p]) => p.isBot && !p.kicked && p.name.toLowerCase() === targetName.toLowerCase()
  );
  if (!match) return false;
  const [targetUid, targetPlayer] = match;
  await kickPlayer(roomCode, targetUid);
  botUids.delete(targetUid);
  await sendSystemMessage(roomCode, `${targetPlayer.name} was removed from the table.`);
  return true;
}

async function init() {
  await initRoom();
  playerName = sessionStorage.getItem('playerName') || 'Player';
  await joinRoom(code, playerName);
  setupConnectionMonitoring();
  sound.init();
  initChat(roomCode, uid, playerName, { onAddBot: addBot, onRemoveBot: removeBot });
  initMusicPlayer(roomCode, isHost);
  initLeaderboard();
  listenRainEvents(roomCode, spawnRain);
  listenKekryEvents(roomCode, spawnKekry);
  const muteBtn = document.getElementById('btn-mute');
  if (muteBtn) {
    muteBtn.textContent = sound.isMuted() ? '🔇' : '🔊';
    muteBtn.addEventListener('click', () => {
      muteBtn.textContent = sound.toggleMute() ? '🔇' : '🔊';
    });
  }

  const sfxSlider = document.getElementById('sfx-volume');
  if (sfxSlider) {
    sfxSlider.value = Math.round(sound.getVolume() * 100);
    sfxSlider.addEventListener('input', () => {
      sound.setVolume(sfxSlider.value / 100);
    });
  }

  const leaveBtn = document.getElementById('btn-leave');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', async () => {
      if (!confirm('Leave the table?')) return;
      if (isHost) {
        const players = currentRoom?.players || {};
        const myName = players[uid]?.name || 'Host';
        const newHostEntry = Object.entries(players).find(
          ([pid, p]) => pid !== uid && !p.kicked && p.connected !== false
        );
        if (newHostEntry) {
          const [newHostUid, newHostPlayer] = newHostEntry;
          await transferHost(roomCode, newHostUid);
          await sendSystemMessage(roomCode, `${myName} left. ${newHostPlayer.name} is now the host.`);
        }
      }
      location.href = 'index.html';
    });
  }

  onRoomChange(room => {
    const me = (room?.players || {})[uid];
    if (me?.kicked) {
      alert('Hahaha kicked noob (u can rejoin bro <3)');
      location.href = 'index.html';
      return;
    }
    currentRoom = room;
    if (isHost) {
      for (const botUid of [...botUids]) {
        if ((room?.players || {})[botUid]?.kicked) botUids.delete(botUid);
      }
    }
    if (room?.hostId === uid && !isHost) {
      updateIsHost(true);
      initHostFeatures();
    }
    applyMusicState(room?.music ?? null);
    updateLeaderboard(room);
    renderTableState(room, uid, async denom => {
      const me = (room.players || {})[uid];
      const newBet = Math.max((me?.bet || 0) - denom, 0);
      await writePlayerAction({ bet: newBet });
    });
    handleRoomUpdate(room);
    const avatarIdx = room?.settings?.dealerAvatar ?? 0;
    const { file } = DEALER_OPTIONS[avatarIdx] ?? DEALER_OPTIONS[0];
    const dealerImg = document.getElementById('dealer-img');
    if (dealerImg) dealerImg.src = `assets/${file}`;
  });

  if (isHost) initHostFeatures();
}

const KEKRY_IMAGES = ['assets/kekwkekw.png', 'assets/sheepshagga.png'];
function spawnKekry() {
  for (let i = 0; i < 65; i++) {
    const el = document.createElement('img');
    el.className = 'img-rain';
    el.src = KEKRY_IMAGES[Math.floor(Math.random() * KEKRY_IMAGES.length)];
    el.style.left = `${Math.random() * 100}vw`;
    el.style.width = `${3 + Math.random() * 2}rem`;
    el.style.animationDelay = `${Math.random() * 3}s`;
    el.style.animationDuration = `${3 + Math.random() * 2.25}s`;
    el.style.setProperty('--rot', `${10 + Math.random() * 20}deg`);
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

const RAIN_EMOJIS = ['💸', '💰', '🤑', '💵'];
function spawnRain() {
  for (let i = 0; i < 50; i++) {
    const el = document.createElement('span');
    el.className = 'emoji-rain';
    el.textContent = RAIN_EMOJIS[Math.floor(Math.random() * RAIN_EMOJIS.length)];
    el.style.left = `${Math.random() * 100}vw`;
    el.style.fontSize = `${1.5 + Math.random() * 1.5}rem`;
    el.style.animationDelay = `${Math.random() * 1.5}s`;
    el.style.animationDuration = `${2 + Math.random() * 1.5}s`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }
}

function resolveOutcomeSound(room) {
  const event = determineCatchphraseEvent(room);
  const map = {
    player_blackjack: 'blackjack',
    win:              'win',
    dealer_bust:      'win',
    lose:             'lose',
    dealer_blackjack: 'lose',
    bust:             'bust',
  };
  return map[event] ?? null;
}

function decomposeChips(amount) {
  const denoms = [500, 100, 25, 5, 1];
  const chips = [];
  let remaining = amount;
  for (const d of denoms) {
    while (remaining >= d) { chips.push(d); remaining -= d; }
  }
  return chips.slice(0, 8);
}

function handleRoomUpdate(room) {
  if (!room) return;

  renderShuffleVoteButton(room);

  if (isHost && ['waiting', 'betting'].includes(room.phase) && !kickingPlayer && room.kickVotesEnabled !== false) {
    const players = room.players || {};
    const hostId = room.hostId;
    const voteMap = {};
    for (const [pid, p] of Object.entries(players)) {
      if (!p.kicked && pid !== hostId && p.connected !== false && p.kickVote) {
        if (!voteMap[p.kickVote]) voteMap[p.kickVote] = [];
        voteMap[p.kickVote].push(pid);
      }
    }
    for (const [targetUid, voters] of Object.entries(voteMap)) {
      const target = players[targetUid];
      if (!target || target.kicked) continue;
      const eligible = Object.entries(players).filter(
        ([pid, p]) => !p.kicked && pid !== hostId && p.connected !== false && pid !== targetUid
      );
      if (eligible.length >= 2 && voters.length === eligible.length) {
        executeKickVote(targetUid, target.name, room);
        break;
      }
    }
  }

  if (room.phase !== 'betting') lastBettingRenderKey = null;

  if (room.phase === 'betting') {
    renderBettingUI(room);
    if (isHost) {
      const players = room.players || {};
      const decksRemaining = Math.max(localDeck.length / 52, 0.5);
      const trueCount = hiOptIICount / decksRemaining;
      for (const botUid of botUids) {
        const bot = players[botUid];
        if (!bot || bot.kicked || bot.status !== 'waiting') continue;
        if (botsPlacingBets.has(botUid)) continue;
        botsPlacingBets.add(botUid);
        const bet = botBet(trueCount, room.settings.startingBalance, room.settings.minBet, room.settings.maxBet, bot.balance);
        const chips = decomposeChips(bet);
        if (!chips.length) {
          updatePlayer(botUid, { bet: 0, status: 'ready' }).catch(console.error);
          botsPlacingBets.delete(botUid);
          continue;
        }
        chips.forEach((chip, i) => {
          const isLast = i === chips.length - 1;
          const running = chips.slice(0, i + 1).reduce((a, b) => a + b, 0);
          const delay = (i + 1) * 350 + Math.random() * 100;
          setTimeout(async () => {
            const botNow = (currentRoom?.players || {})[botUid];
            if (!botNow || botNow.status !== 'waiting') {
              botsPlacingBets.delete(botUid);
              return;
            }
            const update = isLast ? { bet: running, status: 'ready' } : { bet: running };
            await updatePlayer(botUid, update).catch(console.error);
            if (isLast) botsPlacingBets.delete(botUid);
          }, delay);
        });
      }
    }
    if (isHost && !advancingFromBetting) {
      const active = Object.values(room.players || {}).filter(p => !p.kicked && p.status !== 'sitting-out' && p.connected !== false);
      if (active.length > 0 && active.every(p => p.status === 'ready')) {
        advancingFromBetting = true;
        advanceFromBetting(room).finally(() => { advancingFromBetting = false; });
      } else if (room.turnDeadline && room.turnDeadline - Date.now() <= 0) {
        advancingFromBetting = true;
        advanceFromBetting(room).finally(() => { advancingFromBetting = false; });
      }
    }
    if (isHost && !shufflingShoe && !advancingFromBetting) {
      const eligible = Object.values(room.players || {}).filter(
        p => !p.kicked && p.connected !== false && p.status !== 'sitting-out'
      );
      const N = eligible.length;
      const yesCount = eligible.filter(p => p.shuffleVote === true).length;
      const threshold = Math.floor(N / 2) + 1;
      if (N > 0 && yesCount >= threshold) {
        executeShuffleShoe(room);
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

  if (room.phase === 'resolution' && lastCatchphrasePhase !== 'resolution') {
    lastCatchphrasePhase = 'resolution';
    setTimeout(() => {
      const r = currentRoom;
      if (!r || r.phase !== 'resolution') return;
      const event = determineCatchphraseEvent(r);
      if (event) triggerCatchphrase(event);
      if (isHost) {
        for (const botUid of botUids) {
          const bot = (r.players || {})[botUid];
          if (!bot || bot.kicked) continue;
          const outcome = resolveBotOutcome(bot, r);
          if (!outcome) continue;
          const emoji = getBotEmote(outcome);
          if (emoji) {
            const rv = Math.random();
            const clicks = rv < 0.70 ? 1 + Math.floor(Math.random() * 2)
                         : rv < 0.90 ? 3 + Math.floor(Math.random() * 2)
                         : 5 + Math.floor(Math.random() * 6);
            let t = 500 + Math.random() * 1500;
            for (let i = 0; i < clicks; i++) {
              setTimeout(() => sendEmojiReaction(roomCode, botUid, emoji), t);
              t += 300 + Math.random() * 500;
            }
          }
        }
      }
    }, 1500);
  }
  if (room.phase !== 'resolution') {
    lastCatchphrasePhase = room.phase;
  }

  if (room.phase === 'playing' && lastSoundPhase !== 'playing') {
    const activePlayers = Object.values(room.players || {}).filter(p => p.status === 'playing').length;
    for (let i = 0; i < activePlayers; i++) {
      setTimeout(() => sound.play('card_deal'), i * 150);
    }
  }
  if (room.phase === 'resolution' && lastSoundPhase !== 'resolution') {
    lastSoundPhase = 'resolution';
    setTimeout(() => {
      const r = currentRoom;
      if (!r || r.phase !== 'resolution') return;
      const key = resolveOutcomeSound(r);
      if (key) sound.play(key);
    }, 1200);
  }
  if (room.phase !== 'resolution') lastSoundPhase = room.phase;

  if (isHost) {
    const players = room.players || {};
    for (const [pid, p] of Object.entries(players)) {
      if (p.kicked) {
        if (disconnectTimers.has(pid)) {
          clearTimeout(disconnectTimers.get(pid));
          disconnectTimers.delete(pid);
        }
        continue;
      }
      if (p.connected === false) {
        if (!disconnectTimers.has(pid)) {
          sendSystemMessage(roomCode, `${p.name} has disconnected.`);
          const timerId = setTimeout(async () => {
            disconnectTimers.delete(pid);
            const fresh = await getRoom();
            const fp = (fresh?.players || {})[pid];
            if (!fp || fp.kicked || fp.connected !== false) return;
            if (['playing', 'dealing'].includes(fresh?.phase)) return;
            await kickPlayer(roomCode, pid);
          }, 30000);
          disconnectTimers.set(pid, timerId);
        }
      } else {
        if (disconnectTimers.has(pid)) {
          clearTimeout(disconnectTimers.get(pid));
          disconnectTimers.delete(pid);
        }
      }
    }
  }
}

function resolveBotOutcome(bot, room) {
  if (!['done', 'bust', 'surrendered'].includes(bot.status)) return null;
  const dealer = room.dealer || {};
  const dealerCardStrs = [...(dealer.hand || [])];
  if (dealer.hiddenCard) dealerCardStrs.push(dealer.hiddenCard);
  const dealerCards = dealerCardStrs.map(cardFromStr);

  if (bot.status === 'surrendered') return 'lose';
  if (bot.status === 'bust') return 'bust';

  const hands = bot.hands || [];
  const bets = bot.bets || [];
  const results = hands.map((handStrs, i) => {
    const handCards = handStrs.map(cardFromStr);
    if (isBust(handCards)) return 'bust';
    const ph = { cards: handCards, status: 'active', bet: bets[i] || 0 };
    return resolveHand(ph, dealerCards, room.settings).result;
  });
  if (results.some(r => r === 'blackjack')) return 'blackjack';
  if (results.some(r => r === 'win')) return 'win';
  if (results.every(r => r === 'bust')) return 'bust';
  if (results.some(r => r === 'push')) return 'push';
  return 'lose';
}

function determineCatchphraseEvent(room) {
  const me = (room.players || {})[uid];
  if (!me || !['done', 'bust', 'surrendered'].includes(me.status)) return null;

  const dealer = room.dealer || {};
  const dealerCardStrs = [...(dealer.hand || [])];
  if (dealer.hiddenCard) dealerCardStrs.push(dealer.hiddenCard);
  const dealerCards = dealerCardStrs.map(cardFromStr);

  if (isBlackjack(dealerCards)) return 'dealer_blackjack';
  if (isBust(dealerCards)) return 'dealer_bust';
  if (me.status === 'surrendered') return 'surrender';

  const playerHands = (me.hands || [[]]).map(h => h.map(cardFromStr));

  if (playerHands.length === 1) {
    if (isBlackjack(playerHands[0])) return 'player_blackjack';
    if (isBust(playerHands[0])) return 'bust';
  }

  const results = playerHands.map((hand, i) => {
    if (isBust(hand)) return 'bust';
    const bet = (me.bets || [])[i] || me.bet || 0;
    const ph = { cards: hand, status: 'active', bet };
    return resolveHand(ph, dealerCards, room.settings).result;
  });

  if (results.some(r => r === 'blackjack')) return 'player_blackjack';
  if (results.some(r => r === 'win')) return 'win';
  if (results.every(r => r === 'bust')) return 'bust';
  if (results.some(r => r === 'push')) return 'push';
  if (results.every(r => r === 'lose')) return 'lose';
  return null;
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
        const mySpot = document.querySelector(`[data-uid="${uid}"]`);
        const selector = renderChipSelector(settings.minBet, settings.maxBet, me.bet || 0, me.balance, async (denom, chipBtn) => {
          tossChip(chipBtn, mySpot, denom);
          sound.play('chip_click');
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
          sound.play('chip_click');
          await writePlayerAction({ status: 'ready' });
          wrap.hidden = true;
        });
        wrap.appendChild(confirmBtn);

        const sitOutBtn = document.createElement('button');
        sitOutBtn.className = 'action-btn';
        sitOutBtn.textContent = 'Sit Out';
        sitOutBtn.style.marginTop = '4px';
        sitOutBtn.addEventListener('click', async () => {
          await writePlayerAction({ status: 'sitting-out' });
          await sendSystemMessage(roomCode, `${playerName} is sitting the round out.`);
        });
        wrap.appendChild(sitOutBtn);
      } else {
        wrap.hidden = false;
      }
    } else if (me && me.status === 'sitting-out') {
      lastBettingRenderKey = null;
      wrap.hidden = false;
      wrap.innerHTML = '';
      const label = document.createElement('div');
      label.className = 'sitting-out-label';
      label.textContent = 'Sitting Out';
      label.style.cssText = 'color:var(--clr-text-dim);font-size:13px;letter-spacing:1px;margin-bottom:6px;text-align:center;';
      const rejoinBtn = document.createElement('button');
      rejoinBtn.className = 'action-btn';
      rejoinBtn.textContent = 'Rejoin';
      rejoinBtn.addEventListener('click', async () => {
        await writePlayerAction({ status: 'waiting', bet: 0 });
        await sendSystemMessage(roomCode, `${playerName} is rejoining.`);
      });
      wrap.appendChild(label);
      wrap.appendChild(rejoinBtn);
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
      if (!hostCtrl.querySelector('#btn-new-shoe')) {
        const newShoeBtn = document.createElement('button');
        newShoeBtn.id = 'btn-new-shoe';
        newShoeBtn.className = 'action-btn';
        newShoeBtn.style.marginTop = '8px';
        newShoeBtn.textContent = 'New Shoe';
        newShoeBtn.addEventListener('click', () => executeShuffleShoe(currentRoom));
        hostCtrl.appendChild(newShoeBtn);
      }
      hostCtrl.hidden = false;
    }
  }
}

async function advanceFromBetting(room) {
  const players = room.players || {};
  for (const [pid, p] of Object.entries(players)) {
    if (p.kicked) continue;
    if (p.status !== 'ready' && p.status !== 'sitting-out') {
      await updatePlayer(pid, { status: 'sitting-out' });
    }
  }
  await setPhase('dealing');
}

async function executeShuffleShoe(room) {
  if (!isHost) return;
  if (shufflingShoe) return;
  shufflingShoe = true;
  try {
    localDeck = shuffle(createDeck(room.settings.decks)).map(cardToStr);
    runningCount = 0;
    hiOptIICount = 0;
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', 0),
    ]);
    const players = room.players || {};
    await Promise.all(
      Object.keys(players).map(pid => updatePlayer(pid, { shuffleVote: false }))
    );
  } finally {
    shufflingShoe = false;
  }
}

async function executeKickVote(targetUid, targetName, room) {
  if (kickingPlayer) return;
  kickingPlayer = true;
  try {
    await kickPlayer(roomCode, targetUid);
    const nonKickedUids = Object.entries(room.players || {})
      .filter(([pid, p]) => !p.kicked && pid !== targetUid)
      .map(([pid]) => pid);
    await clearKickVotes(roomCode, nonKickedUids);
    await sendSystemMessage(roomCode, `${targetName} was kicked by vote.`);
  } finally {
    kickingPlayer = false;
  }
}

function renderShuffleVoteButton(room) {
  const wrap = document.getElementById('shuffle-vote-wrap');
  if (!wrap) return;

  if (room.phase !== 'betting') {
    wrap.hidden = true;
    return;
  }

  const me = (room.players || {})[uid];
  if (!me || me.status === 'sitting-out') {
    wrap.hidden = true;
    return;
  }

  const eligible = Object.values(room.players || {}).filter(
    p => !p.kicked && p.connected !== false && p.status !== 'sitting-out'
  );
  const N = eligible.length;
  const yesCount = eligible.filter(p => p.shuffleVote === true).length;

  wrap.hidden = false;
  wrap.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'action-btn' + (me.shuffleVote ? ' voted' : '');
  btn.textContent = `Shuffle Shoe ${yesCount}/${N}`;
  btn.addEventListener('click', async () => {
    await writePlayerAction({ shuffleVote: !me.shuffleVote });
  });
  wrap.appendChild(btn);
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
      hiOptIICount = 0;
    }
    const players = room.players || {};
    const activePids = Object.entries(players)
      .filter(([, p]) => p.status === 'ready')
      .map(([pid]) => pid)
      .reverse();

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
    hiOptIICount += dealtCards.reduce((sum, c) => sum + hiOptIIValue(c), 0);
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

  console.log(`[advanceTurn] queue=${JSON.stringify(queue)} lastPid=${lastPid} lastIdx=${lastIdx} nextPid=${nextPid ?? 'NONE→dealer'}`);

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
  if (!player) return;

  const autoHandIdx = player.handIndex || 0;
  const autoHandStrs = (player.hands || [[]])[autoHandIdx] || [];
  if (autoHandStrs.length >= 2 && handValue(autoHandStrs.map(cardFromStr)) === 21) {
    const autoToken = `${turn}:auto21:${autoHandIdx}:${autoHandStrs.length}`;
    if (autoToken !== watchedAction) {
      watchedAction = autoToken;
      await applyPlayerAction(turn, 'stand', room);
    }
    return;
  }

  if (botUids.has(turn)) {
    const bot = player;
    const handIdx = bot.handIndex || 0;
    const handStrs = (bot.hands || [[]])[handIdx] || [];
    const botToken = `${turn}:bot:${handIdx}:${handStrs.length}`;
    if (botToken === watchedAction) {
      console.log(`[watchFor] BOT DEDUP skip: ${turn}(${bot.name}) token=${botToken}`);
      return;
    }
    watchedAction = botToken;
    const dealerUpcard = room.dealer?.hand?.[0];
    if (!dealerUpcard || !handStrs.length) return;
    const decksRemaining = Math.max(localDeck.length / 52, 0.5);
    const trueCount = hiOptIICount / decksRemaining;
    const realBet = (bot.bets || [])[handIdx] || bot.bet || 0;
    const action = botDecision(handStrs, dealerUpcard, trueCount, room.settings, bot.balance, bot.splitCount || 0, realBet);
    const delay = 1500 + Math.random() * 1500 + (Math.random() < 0.25 ? 1000 + Math.random() * 1500 : 0);
    const capturedTurn = turn;
    console.log(`[watchFor] BOT SCHEDULE: ${turn}(${bot.name}) → ${action} in ${Math.round(delay)}ms | hand=${JSON.stringify(handStrs)}`);
    setTimeout(() => {
      if (currentRoom.currentTurn !== capturedTurn) {
        console.log(`[watchFor] BOT STALE: ${capturedTurn}(${bot.name}) currentTurn=${currentRoom.currentTurn} — skipped`);
        return;
      }
      applyPlayerAction(capturedTurn, action, currentRoom);
    }, delay);
    return;
  }

  if (player.connected === false) {
    const dcToken = `${turn}:disconnected`;
    if (dcToken === watchedAction) return;
    watchedAction = dcToken;
    await applyPlayerAction(turn, 'stand', room);
    return;
  }

  if (!player.action) return;

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
    .map(([id]) => id)
    .reverse();
  console.log(`[applyAction] pid=${pid}(${player.name}) action=${actionType} currentTurn=${room.currentTurn} activePids=${JSON.stringify(activePids)}`);

  let newHandStrs = [...handStrs];
  let newStatus = player.status;
  let newBalance = player.balance;

  if (actionType === 'hit') {
    const card = localDeck.shift();
    newHandStrs.push(card);
    const newHand = newHandStrs.map(cardFromStr);
    const newHands = [...(player.hands || [])];
    newHands[handIdx] = newHandStrs;
    const busted = isBust(newHand);
    const moreHands = handIdx < newHands.length - 1;
    if (busted && moreHands) {
      await updatePlayer(pid, { hands: newHands, handIndex: handIdx + 1, action: null });
    } else {
      newStatus = busted ? 'bust' : player.status;
      await updatePlayer(pid, { hands: newHands, status: newStatus, action: null });
    }
    runningCount += hiLoValue(cardFromStr(card));
    hiOptIICount += hiOptIIValue(cardFromStr(card));
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', runningCount),
    ]);
    if (!busted) return;
    if (moreHands) { await setCurrentTurn(pid, settings.actionTimer || 30); return; }
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
    const newHands = [...(player.hands || [])];
    newHands[handIdx] = newHandStrs;
    const moreHandsD = handIdx < newHands.length - 1;
    if (moreHandsD) {
      await updatePlayer(pid, { hands: newHands, bets: newBets, balance: newBalance, handIndex: handIdx + 1, action: null });
    } else {
      newStatus = isBust(newHand) ? 'bust' : 'done';
      await updatePlayer(pid, { hands: newHands, bets: newBets, balance: newBalance, status: newStatus, action: null });
    }
    runningCount += hiLoValue(cardFromStr(card));
    hiOptIICount += hiOptIIValue(cardFromStr(card));
    await Promise.all([
      updateRoomField('cardsRemaining', localDeck.length),
      updateRoomField('runningCount', runningCount),
    ]);
    if (moreHandsD) { await setCurrentTurn(pid, settings.actionTimer || 30); return; }
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
    hiOptIICount += hiOptIIValue(cardFromStr(draw1)) + hiOptIIValue(cardFromStr(draw2));
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

  const revealedCards = [];
  if (dealer.hiddenCard) revealedCards.push(cardFromStr(dealer.hiddenCard));

  while (dealerShouldHit(dealerCards, room.settings)) {
    const drawn = cardFromStr(localDeck.shift());
    dealerCards.push(drawn);
    revealedCards.push(drawn);
  }

  const dealerStrs = dealerCards.map(cardToStr);
  const { setDealer } = await import('./room.js');
  await setDealer(dealerStrs.slice(0, -1), dealerStrs[dealerStrs.length - 1]);

  runningCount += revealedCards.reduce((sum, c) => sum + hiLoValue(c), 0);
  hiOptIICount += revealedCards.reduce((sum, c) => sum + hiOptIIValue(c), 0);
  await Promise.all([
    updateRoomField('cardsRemaining', localDeck.length),
    updateRoomField('runningCount', runningCount),
  ]);

  const freshRoom = await getRoom();
  const balanceMap = {};
  const statsMap   = {};
  const players = freshRoom.players || {};
  for (const [pid, player] of Object.entries(players)) {
    if (!['playing', 'done', 'bust', 'surrendered'].includes(player.status)) continue;
    // player.balance has already been reduced by any extra bets from doubles/splits.
    // player.bet holds the original betting-phase bet (never mutated during play).
    // Deduct only the original bet here; payouts cover the full doubled/split amounts.
    let newBal = player.balance - (player.bet || 0);
    let totalPayouts = 0;
    const hands = player.hands || [];
    const bets = player.bets || [];
    for (let i = 0; i < hands.length; i++) {
      const handCards = hands[i].map(cardFromStr);
      const st = player.status === 'surrendered' ? 'surrendered' : isBust(handCards) ? 'bust' : 'active';
      const ph = { cards: handCards, status: st, bet: bets[i] || 0 };
      const { payout } = resolveHand(ph, dealerCards, freshRoom.settings);
      newBal += payout;
      totalPayouts += payout;
    }
    balanceMap[pid] = newBal;
    statsMap[pid]   = computeStatDelta(player, totalPayouts);
  }
  await updateAllBalances(balanceMap);
  await updateAllPlayerStats(statsMap);

  setTimeout(async () => {
    for (const [pid, p] of Object.entries(players)) {
      if (p.kicked) continue;
      const nextStatus = p.status === 'sitting-out' ? 'sitting-out' : 'waiting';
      await updatePlayer(pid, { hands: [], bets: [], handIndex: 0, bet: 0, status: nextStatus, action: null, insurance: false, shuffleVote: false, kickVote: null });
    }
    await updateRoomField('turnDeadline', null);
    await setPhase('betting');
    if (isHost) {
      const freshPlayers = (await getRoom())?.players || {};
      for (const botUid of [...botUids]) {
        const bot = freshPlayers[botUid];
        if (!bot || bot.kicked) { botUids.delete(botUid); continue; }
        if (bot.balance <= 0) {
          await kickPlayer(roomCode, botUid);
          botUids.delete(botUid);
          await sendSystemMessage(roomCode, `${bot.name} is out of chips and left the table.`);
        }
      }
    }
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

init();
