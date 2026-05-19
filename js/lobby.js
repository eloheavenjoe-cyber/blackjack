import { initRoom, createRoom, joinRoom, onRoomChange, setPhase, uid, roomCode, updateRoomField, updateAllBalances, writePublicRoom, removePublicRoom, listenPublicRooms, setupPublicRoomDisconnect, listenConnected } from './room.js';
import { DEFAULT_SETTINGS, validateSettings, DEALER_OPTIONS } from './settings.js';

let currentSettings = { ...DEFAULT_SETTINGS };
let lastRoom = null;
let isPublicRoom = false;
let publicRoomsUnsubscribe = null;

const $ = id => document.getElementById(id);

$('tab-create').addEventListener('click', () => {
  $('tab-create').classList.add('active');
  $('tab-join').classList.remove('active');
  $('pane-create').hidden = false;
  $('pane-join').hidden = true;
});
$('tab-join').addEventListener('click', async () => {
  $('tab-join').classList.add('active');
  $('tab-create').classList.remove('active');
  $('pane-join').hidden = false;
  $('pane-create').hidden = true;
  if (!publicRoomsUnsubscribe) {
    await initRoom();
    publicRoomsUnsubscribe = listenPublicRooms(renderPublicRooms);
  }
});

function showError(msg) {
  const el = $('join-error');
  el.textContent = msg;
  el.hidden = false;
}

function goToGame() {
  window.location.href = `game.html?room=${roomCode}`;
}

$('btn-create').addEventListener('click', async () => {
  const name = $('input-name').value.trim();
  if (!name) return showError('Enter your name');
  isPublicRoom = $('chk-public').checked;
  try {
    await initRoom();
    await createRoom(name, currentSettings);
    sessionStorage.setItem('playerName', name);
    if (isPublicRoom) {
      await writePublicRoom(roomCode, { hostName: name, playerCount: 1, phase: 'waiting' });
      await setupPublicRoomDisconnect(roomCode);
      listenConnected(connected => {
        if (connected && isPublicRoom) setupPublicRoomDisconnect(roomCode);
      });
    }
    showLobby(true);
  } catch (e) {
    showError(e.message);
  }
});

$('btn-join').addEventListener('click', async () => {
  const name = $('input-name').value.trim();
  const code = $('input-code').value.trim();
  if (!name) return showError('Enter your name');
  if (!code) return showError('Enter a room code');
  try {
    await initRoom();
    await joinRoom(code, name);
    sessionStorage.setItem('playerName', name);
    showLobby(false);
  } catch (e) {
    showError(e.message);
  }
});

function showLobby(asHost) {
  $('join-screen').hidden = true;
  $('lobby-screen').hidden = false;
  $('room-code-text').textContent = roomCode;

  $('room-code-display').addEventListener('click', () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      const el = $('room-code-display');
      el.dataset.original = el.dataset.original || el.innerHTML;
      el.textContent = 'Copied!';
      setTimeout(() => { el.innerHTML = el.dataset.original; delete el.dataset.original; }, 1500);
    });
  });

  if (asHost) {
    $('btn-start').hidden = false;
    $('lobby-status').hidden = true;
    renderSettingsForm(true);
  } else {
    $('settings-note').hidden = false;
    renderSettingsForm(false);
  }

  onRoomChange(room => {
    if (!room) return;
    lastRoom = room;
    renderPlayerList(room.players || {});
    if (asHost && isPublicRoom) {
      const playerCount = Object.values(room.players || {}).filter(p => !p.kicked).length;
      const hostName = (room.players || {})[uid]?.name || '';
      writePublicRoom(roomCode, { hostName, playerCount, phase: room.phase });
    }
    if (!asHost && room.phase !== 'waiting') goToGame();
  });
}

$('btn-start').addEventListener('click', async () => {
  if (!roomCode) return;
  const errors = validateSettings(currentSettings);
  if (errors.length > 0) { showError(errors[0]); return; }
  await updateRoomField('settings', currentSettings);
  if (lastRoom?.players) {
    const balanceMap = {};
    for (const pid of Object.keys(lastRoom.players)) {
      balanceMap[pid] = currentSettings.startingBalance;
    }
    await updateAllBalances(balanceMap);
  }
  if (isPublicRoom) {
    isPublicRoom = false;
    await removePublicRoom(roomCode);
  }
  await setPhase('betting');
  goToGame();
});

function renderPublicRooms(rooms) {
  const container = $('public-rooms-list');
  if (!container) return;
  container.innerHTML = '';
  const entries = Object.entries(rooms);
  if (entries.length === 0) {
    const p = document.createElement('p');
    p.className = 'no-rooms-msg';
    p.textContent = 'No public rooms available';
    container.appendChild(p);
    return;
  }
  for (const [code, room] of entries) {
    const card = document.createElement('div');
    card.className = 'room-card';

    const hostEl = document.createElement('div');
    hostEl.className = 'room-card-host';
    hostEl.textContent = room.hostName;

    const infoEl = document.createElement('div');
    infoEl.className = 'room-card-info';

    const countEl = document.createElement('span');
    countEl.className = 'room-card-count';
    countEl.textContent = `${room.playerCount} / 6 players`;

    const phaseEl = document.createElement('span');
    const isWaiting = room.phase === 'waiting';
    phaseEl.className = 'room-card-phase ' + (isWaiting ? 'phase-waiting' : 'phase-inprogress');
    phaseEl.textContent = isWaiting ? 'Waiting' : 'In Progress';

    infoEl.appendChild(countEl);
    infoEl.appendChild(phaseEl);
    card.appendChild(hostEl);
    card.appendChild(infoEl);

    card.addEventListener('click', async () => {
      const name = $('input-name').value.trim();
      if (!name) return showError('Enter your name');
      try {
        await initRoom();
        await joinRoom(code, name);
        sessionStorage.setItem('playerName', name);
        showLobby(false);
      } catch (e) {
        showError(e.message);
      }
    });

    container.appendChild(card);
  }
}

function renderPlayerList(players) {
  const ul = $('player-list-ul');
  ul.innerHTML = '';
  for (const [, p] of Object.entries(players)) {
    const li = document.createElement('li');
    li.textContent = p.name;
    if (p.isHost) {
      const badge = document.createElement('span');
      badge.className = 'host-badge';
      badge.textContent = '(host)';
      li.appendChild(badge);
    }
    ul.appendChild(li);
  }
}

function renderSettingsForm(editable) {
  const container = $('settings-form');
  const rows = [
    { key: 'decks', label: 'Decks', type: 'select', options: [1,2,4,6,8] },
    { key: 'blackjackPayout', label: 'Blackjack Pays', type: 'select', options: ['3:2','6:5','1:1'] },
    { key: 'dealerHitSoft17', label: 'Dealer Hits Soft 17', type: 'select', options: [false, true], labels: ['No','Yes'] },
    { key: 'doubleDown', label: 'Double Down', type: 'select', options: ['any','9-10-11','off'], labels: ['Any Two Cards','9-10-11 Only','Off'] },
    { key: 'doubleAfterSplit', label: 'Double After Split', type: 'select', options: [true, false], labels: ['Yes','No'] },
    { key: 'reSplit', label: 'Re-Split', type: 'select', options: ['off','2','3','4'], labels: ['Off','Up to 2','Up to 3','Up to 4'] },
    { key: 'surrender', label: 'Surrender', type: 'select', options: ['off','late','early'], labels: ['Off','Late','Early'] },
    { key: 'minBet', label: 'Min Bet', type: 'range', min: 1, max: 5000 },
    { key: 'maxBet', label: 'Max Bet', type: 'range', min: 1, max: 5000 },
    { key: 'startingBalance', label: 'Starting Balance', type: 'range', min: 100, max: 25000, step: 100 },
    { key: 'actionTimer', label: 'Action Timer (s)', type: 'select', options: [0,15,30,60], labels: ['Off','15s','30s','60s'] },
    { key: 'dealerAvatar', label: 'Dealer', type: 'select', options: DEALER_OPTIONS.map((_, i) => i), labels: DEALER_OPTIONS.map(d => d.name) },
  ];

  container.innerHTML = '';
  for (const row of rows) {
    const div = document.createElement('div');
    div.className = 'setting-row';
    const label = document.createElement('label');
    label.textContent = row.label;
    div.appendChild(label);

    if (row.type === 'select') {
      if (editable) {
        const sel = document.createElement('select');
        (row.options || []).forEach((opt, i) => {
          const o = document.createElement('option');
          o.value = opt;
          o.textContent = row.labels ? row.labels[i] : opt;
          if (String(currentSettings[row.key]) === String(opt)) o.selected = true;
          sel.appendChild(o);
        });
        sel.addEventListener('change', () => {
          let v = sel.value;
          if (v === 'true') v = true;
          else if (v === 'false') v = false;
          else if (v !== '' && !isNaN(Number(v))) v = Number(v);
          currentSettings[row.key] = v;
        });
        div.appendChild(sel);
      } else {
        const span = document.createElement('span');
        span.className = 'setting-value';
        const idx = (row.options || []).findIndex(o => String(o) === String(currentSettings[row.key]));
        span.textContent = row.labels ? row.labels[idx] : currentSettings[row.key];
        div.appendChild(span);
      }
    } else if (row.type === 'range') {
      const valSpan = document.createElement('span');
      valSpan.className = 'setting-value';
      valSpan.textContent = currentSettings[row.key];
      if (editable) {
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = row.min; inp.max = row.max; inp.step = row.step || 1;
        inp.value = currentSettings[row.key];
        inp.addEventListener('input', () => {
          currentSettings[row.key] = Number(inp.value);
          valSpan.textContent = inp.value;
        });
        div.appendChild(inp);
      }
      div.appendChild(valSpan);
    }
    container.appendChild(div);
  }
}
