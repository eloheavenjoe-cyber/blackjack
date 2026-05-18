let _collapsed = false;

export function initLeaderboard() {
  const region = document.getElementById('leaderboard-region');
  if (!region) return;

  region.innerHTML = `
    <div id="lb-panel">
      <div id="lb-header">
        <span>📊 Leaderboard</span>
        <button id="lb-toggle">−</button>
      </div>
      <div id="lb-body">
        <table id="lb-table">
          <thead>
            <tr>
              <th>Player</th>
              <th title="Bankroll">BR</th>
              <th title="Hands Won">W</th>
              <th>Wagered</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody id="lb-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('lb-toggle').addEventListener('click', () => {
    _collapsed = !_collapsed;
    document.getElementById('lb-panel').classList.toggle('collapsed', _collapsed);
    document.getElementById('lb-toggle').textContent = _collapsed ? '+' : '−';
  });

  makeDraggable();
}

export function updateLeaderboard(room) {
  const tbody = document.getElementById('lb-tbody');
  if (!tbody) return;

  const oldTops = {};
  for (const tr of tbody.querySelectorAll('tr[data-uid]')) {
    oldTops[tr.dataset.uid] = tr.getBoundingClientRect().top;
  }

  const players = room?.players || {};
  const entries = Object.entries(players)
    .filter(([, p]) => !p.kicked)
    .sort(([, a], [, b]) => (b.sessionProfit || 0) - (a.sessionProfit || 0));

  tbody.innerHTML = '';
  const newRows = [];

  for (const [uid, p] of entries) {
    const profit  = p.sessionProfit || 0;
    const wagered = p.totalWagered  || 0;
    const streak  = Number(p.winStreak) || 0;

    const streakHtml = streak >= 2
      ? ` <span class="streak-badge">🔥${streak}</span>`
      : '';
    const profitClass = profit > 0 ? 'lb-profit-pos' : profit < 0 ? 'lb-profit-neg' : '';
    const profitStr   = profit > 0 ? `+$${fmt(profit)}` : profit < 0 ? `-$${fmt(-profit)}` : '$0';

    const tr = document.createElement('tr');
    tr.dataset.uid = uid;
    tr.innerHTML = `
      <td>${escapeHtml(p.name)}${p.isHost ? ' ♛' : ''}${streakHtml}</td>
      <td>$${fmt(p.balance || 0)}</td>
      <td>${p.handsWon || 0}</td>
      <td>$${fmt(wagered)}</td>
      <td class="${profitClass}">${profitStr}</td>
    `;
    tbody.appendChild(tr);
    newRows.push({ tr, uid });
  }

  if (Object.keys(oldTops).length === 0) return;

  for (const { tr, uid } of newRows) {
    const oldTop = oldTops[uid];
    if (oldTop === undefined) continue; // new player joining mid-session — no prior position to animate from
    const newTop = tr.getBoundingClientRect().top;
    const delta = oldTop - newTop;
    if (delta === 0) continue;
    tr.style.transform = `translateY(${delta}px)`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tr.style.transition = 'transform 350ms ease';
        tr.style.transform = 'translateY(0)';
        tr.addEventListener('transitionend', () => {
          tr.style.transition = '';
          tr.style.transform = '';
        }, { once: true });
      });
    });
  }
}

function fmt(n) {
  const abs = Math.abs(n);
  return abs >= 1000 ? (abs / 1000).toFixed(1) + 'k' : String(abs);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function makeDraggable() {
  const region = document.getElementById('leaderboard-region');
  const header = document.getElementById('lb-header');
  if (!region || !header) return;

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener('mousedown', e => {
    if (e.target.id === 'lb-toggle') return;
    dragging = true;
    const rect = region.getBoundingClientRect();
    region.style.left = rect.left + 'px';
    region.style.top  = rect.top  + 'px';
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    region.style.left = (e.clientX - offsetX) + 'px';
    region.style.top  = (e.clientY - offsetY) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    header.style.cursor = 'grab';
  });
}
