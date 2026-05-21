import { sendChatMessage, listenChatMessages, sendEmojiReaction, listenEmojiReactions,
         getRoom, sendTipRequest, isHost, kickPlayer, sendKickVote, sendSystemMessage,
         setKickVotesEnabled, sendRainEvent, sendKekryEvent, transferHost } from './room.js';
import * as sound from './sound.js';

const EMOJI_LIST = ['😂', '😬', '💀', '🔥', '👑', '💸'];

export function initChat(roomCode, playerUid, playerName, { onAddBot, onRemoveBot, onForceSkip, onBotMode } = {}) {
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
    if (text.startsWith('/')) { handleCommand(text); return; }
    sendChatMessage(roomCode, playerUid, playerName, text);
  }

  async function handleCommand(text) {
    const parts = text.slice(1).trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();

    if (cmd === 'tip') {
      if (parts.length < 3) { showLocalMessage('Usage: /tip <name> <amount>'); return; }
      const amount = parseInt(parts[parts.length - 1], 10);
      if (isNaN(amount) || amount <= 0) { showLocalMessage('Invalid amount. Usage: /tip <name> <amount>'); return; }
      const targetName = parts.slice(1, -1).join(' ');
      const room = await getRoom();
      if (!room) { showLocalMessage('Could not reach room.'); return; }
      if (!['waiting', 'betting'].includes(room.phase)) { showLocalMessage('Tips are only allowed between hands.'); return; }
      const players = room.players || {};
      const me = players[playerUid];
      if (!me) { showLocalMessage('Player data not found.'); return; }
      const match = Object.entries(players).find(([pid, p]) => pid !== playerUid && p.name.toLowerCase() === targetName.toLowerCase());
      if (!match) { showLocalMessage(`No player named "${targetName}" found.`); return; }
      if (amount > me.balance) { showLocalMessage(`Insufficient balance. You have $${me.balance}.`); return; }
      await sendTipRequest(roomCode, playerUid, match[0], amount);

    } else if (cmd === 'kick') {
      const targetName = parts.slice(1).join(' ');
      if (!targetName) { showLocalMessage('Usage: /kick <name>'); return; }
      const room = await getRoom();
      if (!room) { showLocalMessage('Could not reach room.'); return; }
      if (!['waiting', 'betting'].includes(room.phase)) { showLocalMessage('Kicks are only allowed between hands.'); return; }
      const players = room.players || {};
      const match = Object.entries(players).find(([, p]) => !p.kicked && p.name.toLowerCase() === targetName.toLowerCase());
      if (!match) { showLocalMessage(`No player named "${targetName}" found.`); return; }
      const [targetUid, targetPlayer] = match;
      if (targetUid === room.hostId) { showLocalMessage('SYSTEM: Nice try, buddy'); return; }
      if (isHost) {
        await kickPlayer(roomCode, targetUid);
        await sendSystemMessage(roomCode, `${targetPlayer.name} was kicked.`);
      } else {
        if (room.kickVotesEnabled === false) { showLocalMessage('Kick votes are currently disabled.'); return; }
        await sendKickVote(roomCode, playerUid, targetUid);
        await sendSystemMessage(roomCode, `${playerName} voted to kick ${targetPlayer.name}.`);
      }

    } else if (cmd === 'kickvotes') {
      if (!isHost) { showLocalMessage('Only the host can change kick vote settings.'); return; }
      const arg = parts[1]?.toLowerCase();
      if (arg !== 'on' && arg !== 'off') { showLocalMessage('Usage: /kickvotes on|off'); return; }
      const enabled = arg === 'on';
      await setKickVotesEnabled(roomCode, enabled);
      await sendSystemMessage(roomCode, `Kick votes have been ${enabled ? 'enabled' : 'disabled'}.`);

    } else if (cmd === 'makeitrain') {
      if (!isHost) { showLocalMessage('Only the host can make it rain.'); return; }
      await sendRainEvent(roomCode);
      await sendSystemMessage(roomCode, `${playerName} is making it rain`);

    } else if (cmd === 'kekry') {
      if (!isHost) { showLocalMessage('Only the host can kekry.'); return; }
      await sendKekryEvent(roomCode);
      await sendSystemMessage(roomCode, 'RY IS FALLING FROM THE SKY KEKW');

    } else if (cmd === 'givehost') {
      if (!isHost) { showLocalMessage('Only the host can transfer host.'); return; }
      const targetName = parts.slice(1).join(' ');
      if (!targetName) { showLocalMessage('Usage: /givehost <name>'); return; }
      const room = await getRoom();
      if (!room) { showLocalMessage('Could not reach room.'); return; }
      const players = room.players || {};
      const match = Object.entries(players).find(
        ([pid, p]) => !p.kicked && p.connected !== false && pid !== playerUid &&
                      p.name.toLowerCase() === targetName.toLowerCase()
      );
      if (!match) { showLocalMessage(`No active player named "${targetName}" found.`); return; }
      const [newHostUid, newHostPlayer] = match;
      await transferHost(roomCode, newHostUid);
      await sendSystemMessage(roomCode, `${playerName} gave host to ${newHostPlayer.name}.`);

    } else if (cmd === 'addbot') {
      if (!isHost) { showLocalMessage('Only the host can add bots.'); return; }
      if (!onAddBot) { showLocalMessage('Bot feature not available.'); return; }
      const room = await getRoom();
      if (!room) { showLocalMessage('Could not reach room.'); return; }
      const activeCount = Object.values(room.players || {}).filter(p => !p.kicked).length;
      if (activeCount >= 7) { showLocalMessage('Table is full (max 7 seats).'); return; }
      try { await onAddBot(room); } catch { showLocalMessage('Failed to add bot.'); }

    } else if (cmd === 'removebot') {
      if (!isHost) { showLocalMessage('Only the host can remove bots.'); return; }
      if (!onRemoveBot) { showLocalMessage('Bot feature not available.'); return; }
      const targetName = parts.slice(1).join(' ');
      if (!targetName) { showLocalMessage('Usage: /removebot <name>'); return; }
      const room = await getRoom();
      if (!room) { showLocalMessage('Could not reach room.'); return; }
      if (!['waiting', 'betting', 'showdown'].includes(room.phase)) {
        showLocalMessage('Cannot remove a bot during an active hand.'); return;
      }
      const result = await onRemoveBot(targetName, room);
      if (result === false) showLocalMessage(`No bot named "${targetName}" found.`);

    } else if (cmd === 'forceskip') {
      if (!isHost) { showLocalMessage('Only the host can force skip.'); return; }
      if (!onForceSkip) { showLocalMessage('Force skip not available.'); return; }
      const room = await getRoom();
      if (!room) { showLocalMessage('Could not reach room.'); return; }
      if (room.phase === 'betting' || room.phase === 'waiting') {
        showLocalMessage('Game is already in the betting/waiting phase.'); return;
      }
      await onForceSkip();
      await sendSystemMessage(roomCode, `${playerName} force-skipped to the next round. Bets have been refunded.`);

    } else if (cmd === 'bot') {
      if (!isHost) { showLocalMessage('Only the host can change bot mode.'); return; }
      const arg = parts[1]?.toLowerCase();
      if (arg !== 'passive' && arg !== 'aggro') { showLocalMessage('Usage: /bot passive|aggro'); return; }
      if (!onBotMode) { showLocalMessage('Bot mode not available.'); return; }
      onBotMode(arg);
      await sendSystemMessage(roomCode, `Bot mode set to ${arg}.`);

    } else {
      showLocalMessage('Unknown command. Available: /tip, /kick, /kickvotes on|off, /givehost, /addbot, /removebot <name>, /forceskip, /bot passive|aggro');
    }
  }

  function showLocalMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg chat-msg-system';
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  listenChatMessages(roomCode, msg => {
    appendMessage(messagesEl, msg);
    if (msg.ts > initTs) {
      if (collapsed) unreadDot.classList.add('visible');
      if (msg.uid !== playerUid) sound.play('chat_notify');
    }
  });

  listenEmojiReactions(roomCode, ev => spawnFloatingEmoji(ev.emoji, ev.uid));
}

function appendMessage(container, { uid: msgUid, name, text }) {
  const div = document.createElement('div');
  if (msgUid === 'system') {
    div.className = 'chat-msg chat-msg-system';
    div.innerHTML = `<span>SYSTEM:</span> ${escapeHtml(text)}`;
  } else {
    div.className = 'chat-msg';
    div.innerHTML = `<span class="chat-msg-name">${escapeHtml(name)}:</span> ${escapeHtml(text)}`;
  }
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

function spawnFloatingEmoji(emoji, uid) {
  const el = document.createElement('span');
  el.className = 'emoji-float';
  el.textContent = emoji;

  const dx       = (Math.random() - 0.5) * 80;
  const rot      = (Math.random() - 0.5) * 30;
  const rise     = 250 + Math.random() * 100;
  const duration = 2 + Math.random() * 1.2;
  el.style.setProperty('--dx',        `${dx}px`);
  el.style.setProperty('--rot',       `${rot}deg`);
  el.style.setProperty('--mid-y',     `${-(rise * 0.5).toFixed(1)}px`);
  el.style.setProperty('--end-y',     `${-rise.toFixed(1)}px`);
  el.style.setProperty('--float-dur', `${duration.toFixed(2)}s`);

  if (uid) {
    const spot = document.querySelector(`[data-uid="${CSS.escape(uid)}"]`);
    if (spot) {
      const rect = spot.getBoundingClientRect();
      el.style.left = `${rect.left + rect.width / 2}px`;
      el.style.top = `${rect.top - 10}px`;
      el.style.marginLeft = '-1.25rem';
      document.body.appendChild(el);
      el.addEventListener('animationend', () => el.remove());
      return;
    }
  }
  el.style.left = `${Math.random() * Math.min(280, window.innerWidth * 0.35)}px`;
  el.style.bottom = '48px';
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}
