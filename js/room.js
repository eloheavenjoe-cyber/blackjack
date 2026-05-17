import { initializeApp, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, set, get, update, remove, onValue, onDisconnect as fbOnDisconnect, push, onChildAdded, query, orderByKey, startAfter, limitToLast } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { FIREBASE_CONFIG } from '../firebase-config.js';

let db, auth;
export let uid = null;
export let roomCode = null;
export let isHost = false;

export async function initRoom() {
  try {
    const app = initializeApp(FIREBASE_CONFIG);
    db = getDatabase(app);
    auth = getAuth(app);
  } catch (e) {
    if (e.code !== 'app/duplicate-app') throw e;
    const app = getApp();
    db = getDatabase(app);
    auth = getAuth(app);
  }
  const cred = await signInAnonymously(auth);
  uid = cred.user.uid;
  return uid;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function createRoom(playerName, settings) {
  roomCode = generateRoomCode();
  isHost = true;
  await update(ref(db), {
    [`rooms/${roomCode}/hostId`]: uid,
    [`rooms/${roomCode}/phase`]: 'waiting',
    [`rooms/${roomCode}/kickVotesEnabled`]: true,
    [`rooms/${roomCode}/settings`]: settings,
    [`rooms/${roomCode}/dealer`]: { hand: [], hiddenCard: null },
    [`rooms/${roomCode}/players/${uid}`]: {
      name: playerName,
      balance: settings.startingBalance,
      bet: 0,
      hands: [],
      bets: [],
      handIndex: 0,
      insurance: false,
      status: 'waiting',
      isHost: true,
      action: null,
      connected: true
    }
  });
  return roomCode;
}

export async function joinRoom(code, playerName) {
  roomCode = code.trim().toUpperCase();
  const snap = await get(ref(db, `rooms/${roomCode}`));
  if (!snap.exists()) throw new Error('Room not found');
  const room = snap.val();
  const players = room.players || {};
  isHost = uid === room.hostId;

  const mySlot = players[uid];
  if (mySlot && !mySlot.kicked) {
    await update(ref(db, `rooms/${roomCode}/players/${uid}`), { connected: true });
    return room;
  }

  const activeCount = Object.values(players).filter(p => !p.kicked).length;
  if (activeCount >= 6) throw new Error('Room is full (max 6 players)');

  const activeDuringPlay = ['dealing', 'playing'].includes(room.phase);
  await set(ref(db, `rooms/${roomCode}/players/${uid}`), {
    name: playerName,
    balance: room.settings.startingBalance,
    bet: 0,
    hands: [],
    bets: [],
    handIndex: 0,
    insurance: false,
    status: activeDuringPlay ? 'sitting-out' : 'waiting',
    isHost,
    action: null,
    connected: true
  });
  return room;
}

export function onRoomChange(callback) {
  return onValue(ref(db, `rooms/${roomCode}`), snap => callback(snap.val()));
}

export async function writePlayerAction(fields) {
  await update(ref(db, `rooms/${roomCode}/players/${uid}`), fields);
}

export async function setPhase(phase) {
  await update(ref(db), { [`rooms/${roomCode}/phase`]: phase });
}

export async function setDealer(handStrs, hiddenCardStr) {
  await set(ref(db, `rooms/${roomCode}/dealer`), {
    hand: handStrs,
    hiddenCard: hiddenCardStr
  });
}

export async function setCurrentTurn(playerId, timerSeconds) {
  const deadline = timerSeconds > 0 ? Date.now() + timerSeconds * 1000 : null;
  await update(ref(db), {
    [`rooms/${roomCode}/currentTurn`]: playerId,
    [`rooms/${roomCode}/turnDeadline`]: deadline
  });
}

export async function updatePlayer(playerId, fields) {
  await update(ref(db, `rooms/${roomCode}/players/${playerId}`), fields);
}

export async function updateAllBalances(balanceMap) {
  const updates = {};
  for (const [pid, bal] of Object.entries(balanceMap)) {
    updates[`rooms/${roomCode}/players/${pid}/balance`] = bal;
  }
  await update(ref(db), updates);
}

export async function dealCards(deckStrs, playerIds, playerBets = {}) {
  let idx = 0;
  const updates = {};
  const playerHands = {};
  for (const pid of playerIds) {
    playerHands[pid] = [deckStrs[idx++]];
  }
  const dealerHand = [deckStrs[idx++]];
  for (const pid of playerIds) {
    playerHands[pid].push(deckStrs[idx++]);
  }
  const hiddenCard = deckStrs[idx++];

  for (const pid of playerIds) {
    updates[`rooms/${roomCode}/players/${pid}/hands`] = [playerHands[pid]];
    updates[`rooms/${roomCode}/players/${pid}/bets`] = [playerBets[pid] || 0];
    updates[`rooms/${roomCode}/players/${pid}/handIndex`] = 0;
    updates[`rooms/${roomCode}/players/${pid}/status`] = 'playing';
    updates[`rooms/${roomCode}/players/${pid}/action`] = null;
  }
  updates[`rooms/${roomCode}/dealer/hand`] = dealerHand;
  updates[`rooms/${roomCode}/dealer/hiddenCard`] = hiddenCard;

  await update(ref(db), updates);
  return { remaining: deckStrs.slice(idx), playerHands, dealerHand, hiddenCard };
}

export async function updateRoomField(field, value) {
  await update(ref(db), { [`rooms/${roomCode}/${field}`]: value });
}

export async function getRoom() {
  const snap = await get(ref(db, `rooms/${roomCode}`));
  return snap.val();
}

export function setupConnectionMonitoring() {
  onValue(ref(db, '.info/connected'), async (snap) => {
    if (snap.val() !== true) return;
    const connRef = ref(db, `rooms/${roomCode}/players/${uid}/connected`);
    await update(ref(db, `rooms/${roomCode}/players/${uid}`), { connected: true });
    await fbOnDisconnect(connRef).set(false);
  });
}

export async function sendChatMessage(code, playerUid, name, text) {
  await push(ref(db, `rooms/${code}/chat`), { uid: playerUid, name, text, ts: Date.now() });
}

export function listenChatMessages(code, callback) {
  return onChildAdded(ref(db, `rooms/${code}/chat`), snap => {
    const val = snap.val();
    if (val) callback(val);
  });
}

export async function sendEmojiReaction(code, playerUid, emoji) {
  await push(ref(db, `rooms/${code}/emojiEvents`), { uid: playerUid, emoji, ts: Date.now() });
}

export async function listenEmojiReactions(code, callback) {
  const snap = await get(query(ref(db, `rooms/${code}/emojiEvents`), limitToLast(1)));
  const q = snap.exists()
    ? query(ref(db, `rooms/${code}/emojiEvents`), orderByKey(), startAfter(Object.keys(snap.val())[0]))
    : ref(db, `rooms/${code}/emojiEvents`);
  return onChildAdded(q, s => { const val = s.val(); if (val) callback(val); });
}

export async function sendTipRequest(code, fromUid, toUid, amount) {
  await push(ref(db, `rooms/${code}/pendingTips`), { fromUid, toUid, amount });
}

export function listenPendingTips(code, callback) {
  return onChildAdded(ref(db, `rooms/${code}/pendingTips`), snap => {
    if (snap.val()) callback(snap.key, snap.val());
  });
}

export async function removeTipEntry(code, tipId) {
  await remove(ref(db, `rooms/${code}/pendingTips/${tipId}`));
}

export async function sendSystemMessage(code, text) {
  await push(ref(db, `rooms/${code}/chat`), { uid: 'system', name: 'SYSTEM', text, ts: Date.now() });
}

export async function kickPlayer(code, targetUid) {
  await update(ref(db, `rooms/${code}/players/${targetUid}`), { kicked: true });
}

export async function sendKickVote(code, voterUid, targetUid) {
  await update(ref(db, `rooms/${code}/players/${voterUid}`), { kickVote: targetUid });
}

export async function clearKickVotes(code, playerUids) {
  const updates = {};
  for (const pid of playerUids) {
    updates[`rooms/${code}/players/${pid}/kickVote`] = null;
  }
  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
}

export async function setKickVotesEnabled(code, enabled) {
  await update(ref(db, `rooms/${code}`), { kickVotesEnabled: enabled });
}

export async function setMusicState(code, trackIndex, playing) {
  await update(ref(db, `rooms/${code}/music`), { trackIndex, playing });
}
