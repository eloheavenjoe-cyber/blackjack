import { getColor, WHEEL_SEQUENCE } from './roulette-engine.js';

const CHIP_DENOMS = [1, 5, 25, 100, 500];
let selectedChip = 25;

const BET_CELLS = [
  { id: 'red',    label: 'Red',     cls: 'cell-red',   span: 3 },
  { id: 'black',  label: 'Black',   cls: 'cell-black', span: 3 },
  { id: 'odd',    label: 'Odd',     cls: '',           span: 3 },
  { id: 'even',   label: 'Even',    cls: '',           span: 3 },
  { id: 'low',    label: '1–18',    cls: '',           span: 3 },
  { id: 'high',   label: '19–36',   cls: '',           span: 3 },
  { id: 'dozen1', label: '1st 12',  cls: 'span2',      span: 2 },
  { id: 'dozen2', label: '2nd 12',  cls: 'span2',      span: 2 },
  { id: 'dozen3', label: '3rd 12',  cls: 'span2',      span: 2 },
  { id: 'col1',   label: 'Col 1',   cls: 'span2',      span: 2 },
  { id: 'col2',   label: 'Col 2',   cls: 'span2',      span: 2 },
  { id: 'col3',   label: 'Col 3',   cls: 'span2',      span: 2 },
];

export function buildWheel(rotorEl) {
  const cx = 200, cy = 200, outerR = 175, innerR = 88;
  const N = 37;
  const TWO_PI = 2 * Math.PI;
  const startOffset = -Math.PI / 2;

  const ns = 'http://www.w3.org/2000/svg';

  for (let i = 0; i < N; i++) {
    const num = WHEEL_SEQUENCE[i];
    const a0 = startOffset + (i / N) * TWO_PI;
    const a1 = startOffset + ((i + 1) / N) * TWO_PI;

    const ox1 = cx + outerR * Math.cos(a0), oy1 = cy + outerR * Math.sin(a0);
    const ox2 = cx + outerR * Math.cos(a1), oy2 = cy + outerR * Math.sin(a1);
    const ix2 = cx + innerR * Math.cos(a1), iy2 = cy + innerR * Math.sin(a1);
    const ix1 = cx + innerR * Math.cos(a0), iy1 = cy + innerR * Math.sin(a0);

    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d',
      `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 0 1 ${ox2} ${oy2}` +
      ` L ${ix2} ${iy2} A ${innerR} ${innerR} 0 0 0 ${ix1} ${iy1} Z`
    );
    const color = getColor(num);
    path.setAttribute('fill',
      color === 'red' ? '#8b1a1a' : color === 'green' ? '#145a32' : '#111'
    );
    path.setAttribute('stroke', '#c9a84c');
    path.setAttribute('stroke-width', '0.6');
    rotorEl.appendChild(path);

    const midAngle = (a0 + a1) / 2;
    const labelR = (outerR + innerR) / 2;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    const deg = (midAngle * 180 / Math.PI) + 90;

    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', lx);
    text.setAttribute('y', ly);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', 'white');
    text.setAttribute('font-size', '9');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('font-family', 'Arial, sans-serif');
    text.setAttribute('transform', `rotate(${deg}, ${lx}, ${ly})`);
    text.textContent = num;
    rotorEl.appendChild(text);
  }

  // Center cap
  const cap = document.createElementNS(ns, 'circle');
  cap.setAttribute('cx', cx); cap.setAttribute('cy', cy); cap.setAttribute('r', innerR);
  cap.setAttribute('fill', '#1a0e06');
  cap.setAttribute('stroke', '#c9a84c'); cap.setAttribute('stroke-width', '1.5');
  rotorEl.appendChild(cap);

  const capText = document.createElementNS(ns, 'text');
  capText.setAttribute('x', cx); capText.setAttribute('y', cy);
  capText.setAttribute('text-anchor', 'middle'); capText.setAttribute('dominant-baseline', 'middle');
  capText.setAttribute('fill', '#c9a84c'); capText.setAttribute('font-size', '11');
  capText.setAttribute('font-family', 'Georgia, serif'); capText.setAttribute('letter-spacing', '1');
  capText.textContent = 'ROULETTE';
  rotorEl.appendChild(capText);

  rotorEl.style.transformOrigin = `${cx}px ${cy}px`;
}

const SEGMENT_DEG = 360 / 37;

export function animateSpin(rotorEl, ballEl, winningNumber, onComplete) {
  const winIndex = WHEEL_SEQUENCE.indexOf(winningNumber);
  const pocketAngle = winIndex * SEGMENT_DEG + SEGMENT_DEG / 2;
  const extra = 360 * 6;
  const landing = (360 - (pocketAngle % 360)) % 360;
  const wheelFinalDeg = extra + landing;

  // Ball counter-rotates, always ending at top (multiples of 360 from 0).
  const ballRounds = Math.ceil((wheelFinalDeg * 1.2) / 360);
  const ballFinalDeg = -(ballRounds * 360);

  // Force reflow so the browser registers the reset-to-0 before animating.
  rotorEl.getBoundingClientRect();

  rotorEl.style.transition = 'transform 5s cubic-bezier(0.17, 0.67, 0.08, 1)';
  rotorEl.style.transform = `rotate(${wheelFinalDeg}deg)`;

  ballEl.style.transformOrigin = '200px 200px';
  ballEl.style.transition = 'transform 5s cubic-bezier(0.17, 0.67, 0.08, 1)';
  ballEl.style.transform = `rotate(${ballFinalDeg}deg)`;

  setTimeout(onComplete, 5200);
}

export function resetBallAndRotor(rotorEl, ballEl) {
  rotorEl.style.transition = 'none';
  rotorEl.style.transform = 'rotate(0deg)';
  ballEl.style.transition = 'none';
  ballEl.style.transform = 'rotate(0deg)';
}

export function buildBettingGrid(gridEl, onBet) {
  gridEl.innerHTML = '';
  for (const cell of BET_CELLS) {
    const div = document.createElement('div');
    div.className = `bet-cell ${cell.cls}`;
    div.dataset.betId = cell.id;
    div.innerHTML = `<span class="bet-cell-label">${cell.label}</span><span class="bet-cell-amount" id="bet-amount-${cell.id}"></span>`;
    div.addEventListener('click', () => onBet(cell.id, selectedChip));
    gridEl.appendChild(div);
  }
}

export function buildChipSelector(containerEl) {
  containerEl.innerHTML = '';
  for (const denom of CHIP_DENOMS) {
    const btn = document.createElement('button');
    btn.className = 'chip-btn' + (denom === selectedChip ? ' chip-btn-active' : '');
    btn.dataset.denom = denom;
    btn.title = `$${denom}`;

    const chipColors = { 1: '#e8e8e8', 5: '#e53935', 25: '#43a047', 100: '#1e88e5', 500: '#7b1fa2' };
    btn.style.cssText = `width:44px;height:44px;border-radius:50%;background:${chipColors[denom]};` +
      `border:3px solid rgba(255,255,255,0.5);color:white;font-weight:bold;font-size:0.7rem;` +
      `box-shadow:0 2px 6px rgba(0,0,0,0.4);`;
    btn.textContent = denom >= 1000 ? `${denom/1000}K` : `$${denom}`;
    btn.addEventListener('click', () => {
      selectedChip = denom;
      containerEl.querySelectorAll('.chip-btn').forEach(b => {
        b.style.outline = '';
        b.classList.remove('chip-btn-active');
      });
      btn.style.outline = '3px solid #c9a84c';
      btn.classList.add('chip-btn-active');
    });
    if (denom === selectedChip) {
      btn.style.outline = '3px solid #c9a84c';
    }
    containerEl.appendChild(btn);
  }
}

export function updateBetCell(betId, amount) {
  const el = document.getElementById(`bet-amount-${betId}`);
  if (el) el.textContent = amount > 0 ? `$${amount}` : '';
}

export function clearBetCells() {
  for (const cell of BET_CELLS) updateBetCell(cell.id, 0);
}

export function setGridEnabled(enabled) {
  document.querySelectorAll('.bet-cell').forEach(el => {
    el.classList.toggle('disabled', !enabled);
  });
}

export function showSpinResult(number, color, playerDelta) {
  const el = document.getElementById('spin-result');
  if (!el) return;
  el.className = `result-${color}`;
  document.getElementById('spin-number').textContent = number;
  document.getElementById('spin-color-label').textContent = color.toUpperCase();
  el.hidden = false;

  const lastEl = document.getElementById('hud-last-result');
  if (lastEl) {
    lastEl.textContent = playerDelta > 0 ? `+$${playerDelta}` : playerDelta < 0 ? `-$${Math.abs(playerDelta)}` : 'Push';
    lastEl.style.color = playerDelta > 0 ? 'var(--clr-win)' : playerDelta < 0 ? 'var(--clr-lose)' : 'var(--clr-push)';
  }
}

export function hideSpinResult() {
  const el = document.getElementById('spin-result');
  if (el) el.hidden = true;
}

export function renderPlayers(players, myUid, payouts) {
  const panel = document.getElementById('players-panel');
  if (!panel) return;
  panel.innerHTML = '';
  for (const [pid, p] of Object.entries(players || {})) {
    if (p.kicked) continue;
    const row = document.createElement('div');
    row.className = 'player-row';
    const delta = payouts?.[pid];

    const nameSpan = document.createElement('span');
    nameSpan.className = 'player-row-name';
    nameSpan.textContent = (p.name ?? '(unknown)') + (pid === myUid ? ' ★' : '');

    const balanceSpan = document.createElement('span');
    balanceSpan.className = 'player-row-balance';
    balanceSpan.textContent = `$${p.balance ?? 0}`;

    if (delta != null) {
      const deltaSpan = document.createElement('span');
      deltaSpan.className = delta >= 0 ? 'player-row-delta-pos' : 'player-row-delta-neg';
      deltaSpan.textContent = `${delta >= 0 ? '+' : ''}$${delta}`;
      balanceSpan.appendChild(deltaSpan);
    }

    row.appendChild(nameSpan);
    row.appendChild(balanceSpan);
    panel.appendChild(row);
  }
}
