import { initializeApp, getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, set, get, update, onValue } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
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
  await set(ref(db, `rooms/${roomCode}`), {
    hostId: uid,
    phase: 'waiting',
    settings,
    dealer: { hand: [], hiddenCard: null },
    currentTurn: null,
    turnDeadline: null,
    players: {
      [uid]: {
        name: playerName,
        balance: settings.startingBalance,
        bet: 0,
        hands: [],
        bets: [],
        handIndex: 0,
        insurance: false,
        status: 'waiting',
        isHost: true,
        action: null
      }
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
  const existing = Object.values(players).find(p => p.name === playerName);
  if (!existing) {
    const count = Object.keys(players).length;
    if (count >= 4) throw new Error('Room is full (max 4 players)');
  }
  isHost = uid === room.hostId;
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
    action: null
  });
  return room;
}

export function onRoomChange(callback) {
  return onValue(ref(db, `rooms/${roomCode}`), snap => callback(snap.val()));
}

export async function writePlayerAction(fields) {
  await update(ref(db, `rooms/${roomCode}/players/${uid}`), fields);
}
