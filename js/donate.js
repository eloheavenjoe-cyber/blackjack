import { uid, roomCode } from './room.js';
import { getDatabase, ref, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

export function showDonatePanel(room, myUid) {
  const allowedPhases = ['waiting', 'betting'];
  if (!allowedPhases.includes(room?.phase)) {
    alert('Chip donations are only available between hands.');
    return;
  }

  const players = room.players || {};
  const me = players[myUid];
  if (!me) return;

  const others = Object.entries(players).filter(([pid]) => pid !== myUid);
  if (others.length === 0) {
    alert('No other players to send chips to.');
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'donate-overlay';

  const panel = document.createElement('div');
  panel.id = 'donate-panel';

  const h3 = document.createElement('h3');
  h3.textContent = 'Send Chips';
  panel.appendChild(h3);

  const toLabel = document.createElement('label');
  toLabel.textContent = 'To:';
  panel.appendChild(toLabel);

  const sel = document.createElement('select');
  sel.id = 'donate-to';
  for (const [pid, p] of others) {
    const opt = document.createElement('option');
    opt.value = pid;
    opt.textContent = p.name;
    sel.appendChild(opt);
  }
  panel.appendChild(sel);

  const amtLabel = document.createElement('label');
  amtLabel.textContent = 'Amount:';
  panel.appendChild(amtLabel);

  const amtInput = document.createElement('input');
  amtInput.id = 'donate-amount';
  amtInput.type = 'number';
  amtInput.min = '1';
  amtInput.max = String(me.balance);
  amtInput.value = '100';
  panel.appendChild(amtInput);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn-primary';
  confirmBtn.textContent = 'Send';
  confirmBtn.addEventListener('click', async () => {
    const toPid = sel.value;
    const amount = parseInt(amtInput.value, 10);
    if (!toPid || isNaN(amount) || amount <= 0 || amount > me.balance) {
      alert('Invalid amount'); return;
    }
    try {
      await sendChips(myUid, toPid, amount);
      cleanup();
    } catch (e) {
      alert('Transfer failed: ' + e.message);
    }
  });
  panel.appendChild(confirmBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'action-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', cleanup);
  panel.appendChild(cancelBtn);

  function cleanup() {
    overlay.remove();
    panel.remove();
  }

  overlay.addEventListener('click', cleanup);

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

async function sendChips(fromUid, toUid, amount) {
  const db = getDatabase();
  const fromRef = ref(db, `rooms/${roomCode}/players/${fromUid}/balance`);
  const toRef = ref(db, `rooms/${roomCode}/players/${toUid}/balance`);

  await runTransaction(fromRef, current => {
    if (current === null) return current;
    if (current < amount) throw new Error('Insufficient balance');
    return current - amount;
  });

  await runTransaction(toRef, current => {
    return (current || 0) + amount;
  });
}
