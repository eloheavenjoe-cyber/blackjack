import { setMusicState } from './room.js';

// Add your tracks here. Files go in assets/music/
export const PLAYLIST = [
  { title: 'How does he does it', file: 'assets/music/How does he does it.mp3' },
  { title: 'Rybong left the discord again', file: 'assets/music/Rybong left the discord again.mp3' },
  { title: 'rybong please play some dbd', file: 'assets/music/rybong please play some dbd.mp3' },
  { title: 'rybongqueueupdbd', file: 'assets/music/rybongqueueupdbd.mp3' },
];

let audio = null;
let _roomCode = null;
let _isHost = false;
let collapsed = true;
let muted = false;
let lastTrackIndex = null;
let lastPlaying = null;

export function initMusicPlayer(roomCode, isHost) {
  _roomCode = roomCode;
  _isHost = isHost;
  audio = new Audio();
  audio.volume = 0.5;
  audio.addEventListener('ended', onTrackEnded);
  buildPanel();
}

function buildPanel() {
  const panel = document.getElementById('music-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div id="music-header">
      <span>Music</span>
      <button id="music-toggle">▲</button>
    </div>
    <div id="music-body">
      <div id="music-now-playing">No track loaded</div>
      ${_isHost ? `
        <div id="music-host-controls">
          <button id="music-prev" title="Previous">⏮</button>
          <button id="music-playpause" title="Play/Pause">▶</button>
          <button id="music-next" title="Next">⏭</button>
        </div>
        <div id="music-playlist">
          ${PLAYLIST.map((t, i) => `<div class="music-track" data-index="${i}">${escapeHtml(t.title)}</div>`).join('')}
        </div>
      ` : ''}
      <div id="music-volume-row">
        <button id="music-mute-btn" title="Mute">🔊</button>
        <input type="range" id="music-volume" min="0" max="1" step="0.05" value="0.5">
      </div>
      <div id="music-autoplay-prompt" hidden>
        <button id="music-enable-btn">▶ Click to enable audio</button>
      </div>
    </div>
  `;

  panel.classList.add('collapsed');

  document.getElementById('music-toggle').addEventListener('click', () => {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    document.getElementById('music-toggle').textContent = collapsed ? '▲' : '▼';
  });

  document.getElementById('music-mute-btn').addEventListener('click', () => {
    muted = !muted;
    audio.muted = muted;
    document.getElementById('music-mute-btn').textContent = muted ? '🔇' : '🔊';
  });

  document.getElementById('music-volume').addEventListener('input', e => {
    audio.volume = parseFloat(e.target.value);
    if (audio.volume > 0 && muted) {
      muted = false;
      audio.muted = false;
      document.getElementById('music-mute-btn').textContent = '🔊';
    }
  });

  if (_isHost) {
    document.getElementById('music-prev').addEventListener('click', () => {
      const idx = lastTrackIndex === null
        ? PLAYLIST.length - 1
        : (lastTrackIndex - 1 + PLAYLIST.length) % PLAYLIST.length;
      setMusicState(_roomCode, idx, true);
    });

    document.getElementById('music-next').addEventListener('click', () => {
      const idx = lastTrackIndex === null ? 0 : (lastTrackIndex + 1) % PLAYLIST.length;
      setMusicState(_roomCode, idx, true);
    });

    document.getElementById('music-playpause').addEventListener('click', () => {
      if (lastTrackIndex === null) {
        setMusicState(_roomCode, 0, true);
      } else {
        setMusicState(_roomCode, lastTrackIndex, !lastPlaying);
      }
    });

    document.querySelectorAll('.music-track').forEach(el => {
      el.addEventListener('click', () => {
        setMusicState(_roomCode, parseInt(el.dataset.index, 10), true);
      });
    });
  }

  document.getElementById('music-enable-btn')?.addEventListener('click', () => {
    audio.play().then(() => {
      document.getElementById('music-autoplay-prompt').hidden = true;
    }).catch(() => {});
  });

  makeDraggable();
}

function makeDraggable() {
  const region = document.getElementById('music-region');
  const header = document.getElementById('music-header');
  if (!region || !header) return;

  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener('mousedown', e => {
    if (e.target.id === 'music-toggle') return;
    dragging = true;
    const rect = region.getBoundingClientRect();
    region.style.right = 'auto';
    region.style.bottom = 'auto';
    region.style.left = rect.left + 'px';
    region.style.top = rect.top + 'px';
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    region.style.left = (e.clientX - offsetX) + 'px';
    region.style.top = (e.clientY - offsetY) + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    header.style.cursor = 'grab';
  });
}

export function applyMusicState(music) {
  if (!audio || !music) return;

  const { trackIndex, playing } = music;
  const trackChanged = trackIndex !== lastTrackIndex;
  const playingChanged = playing !== lastPlaying;

  lastTrackIndex = trackIndex;
  lastPlaying = playing;

  if (trackChanged) {
    const track = PLAYLIST[trackIndex];
    if (!track) return;
    audio.src = track.file;
    audio.load();
    updateNowPlaying();
    updatePlaylistHighlight();
  }

  if (trackChanged || playingChanged) {
    if (playing) {
      audio.play().catch(() => {
        const prompt = document.getElementById('music-autoplay-prompt');
        if (prompt) prompt.hidden = false;
      });
    } else {
      audio.pause();
    }
    const btn = document.getElementById('music-playpause');
    if (btn) btn.textContent = playing ? '⏸' : '▶';
  }
}

function onTrackEnded() {
  if (!_isHost || lastTrackIndex === null) return;
  const next = (lastTrackIndex + 1) % PLAYLIST.length;
  setMusicState(_roomCode, next, true);
}

function updateNowPlaying() {
  const el = document.getElementById('music-now-playing');
  if (!el) return;
  const track = lastTrackIndex !== null ? PLAYLIST[lastTrackIndex] : null;
  el.textContent = track ? `♪ ${track.title}` : 'No track loaded';
}

function updatePlaylistHighlight() {
  document.querySelectorAll('.music-track').forEach((el, i) => {
    el.classList.toggle('active', i === lastTrackIndex);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
