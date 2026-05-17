import { sendChatMessage, listenChatMessages, sendEmojiReaction, listenEmojiReactions } from './room.js';
import * as sound from './sound.js';

const EMOJI_LIST = ['😂', '😬', '💀', '🔥', '👑', '💸'];

export function initChat(roomCode, playerUid, playerName) {
  let collapsed = false;
  const initTs = Date.now();

  const panel = document.getElementById('chat-panel');
  const emojiBar = document.getElementById('emoji-bar');

  panel.innerHTML = `
    <div id="chat-header">
      <span>Chat</span>
      <span id="chat-unread"></span>
      <button id="chat-toggle" title="Toggle chat">▼</button>
    </div>
    <div id="chat-messages"></div>
    <div id="chat-input-row">
      <input id="chat-input" type="text" placeholder="Say something..." maxlength="200">
      <button id="chat-send">Send</button>
    </div>
  `;

  emojiBar.innerHTML = '';
  for (const emoji of EMOJI_LIST) {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn';
    btn.textContent = emoji;
    btn.addEventListener('click', () => sendEmojiReaction(roomCode, playerUid, emoji));
    emojiBar.appendChild(btn);
  }

  const messagesEl = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const toggleBtn = document.getElementById('chat-toggle');
  const unreadDot = document.getElementById('chat-unread');

  toggleBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    panel.classList.toggle('collapsed', collapsed);
    toggleBtn.textContent = collapsed ? '▲' : '▼';
    if (!collapsed) {
      unreadDot.classList.remove('visible');
    }
  });

  document.getElementById('chat-send').addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

  function sendMessage() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendChatMessage(roomCode, playerUid, playerName, text);
  }

  listenChatMessages(roomCode, msg => {
    appendMessage(messagesEl, msg);
    if (msg.ts > initTs) {
      if (collapsed) unreadDot.classList.add('visible');
      if (msg.uid !== playerUid) sound.play('chat_notify');
    }
  });

  listenEmojiReactions(roomCode, ({ emoji }) => spawnFloatingEmoji(emoji), initTs);
}

function appendMessage(container, { name, text }) {
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<span class="chat-msg-name">${escapeHtml(name)}:</span> ${escapeHtml(text)}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function spawnFloatingEmoji(emoji) {
  const el = document.createElement('span');
  el.className = 'emoji-float';
  el.textContent = emoji;
  el.style.left = `${Math.random() * Math.min(280, window.innerWidth * 0.35)}px`;
  el.style.bottom = '48px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}
