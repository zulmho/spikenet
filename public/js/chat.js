// SpikeNet direct chat module.
// Chat rail/list controls extracted from the legacy app bundle.

function renderDirectChatsRail() {
  const container = document.getElementById('spike-chat-dock-list');
  updateChatTotalUnread();
  if (!container) return;
  const friends = window.cachedFriendsList || [];
  if (!friends.length) {
    container.innerHTML = `
      <div class="sn-empty spike-empty-state">
        <strong>Чаты появятся после друзей</strong>
        <span>Добавь человека, и здесь будет DM как в Discord.</span>
        <button class="sn-btn spike-empty-action" onclick="openSocialSidebar(); switchSocialTab(null, 'social-search')">
          <strong>Добавить друга</strong><span>открыть поиск</span>
        </button>
      </div>`;
    return;
  }

  container.innerHTML = friends.map((friend) => {
    const encodedName = encodeURIComponent(friend.username || 'Геймер');
    const unread = spikeUnreadState.chats[friend.id] || 0;
    const title = escapeHtmlAttr(friend.username || 'Чат');
    const avatar = friend.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(friend.username || 'DM');
    const activeClass = Number(currentChatTargetUserId) === Number(friend.id) ? 'active' : '';
    return `
      <button class="sn-card spike-chat-row ${activeClass}" onclick="openPrivateChat(${friend.id}, decodeURIComponent('${encodedName}'))" title="${title}" aria-label="Открыть чат ${title}">
        <span class="spike-chat-row-main">
          <img class="sn-avatar spike-chat-row-avatar" src="${avatar}">
          <span class="spike-chat-row-name">${title}</span>
        </span>
        <span id="rail-dm-unread-${friend.id}" class="ps-rail-unread-dot ${unread ? 'active' : ''}">${unread || ''}</span>
      </button>
    `;
  }).join('');
}

async function openChatsDock() {
  const dock = document.getElementById('spike-chat-dock');
  const list = document.getElementById('spike-chat-dock-list');
  const viewHost = document.getElementById('spike-chat-dock-view');
  const dmView = document.getElementById('ps-dm-chat-view');
  if (!dock || !list || !viewHost || !dmView) return;
  openSocialHubShell(activeRoomToken ? 'group' : 'direct');
  document.getElementById('lobby-panel')?.classList.remove('open');
  document.getElementById('socialSidebar')?.classList.remove('open');
  dock.classList.add('open');
  list.style.display = 'flex';
  dmView.style.display = 'none';
  if (activeRoomToken) {
    chatDockTab = 'groups';
    mountGroupViewInSocialHub();
  } else if (!currentActiveChatId) {
    parkGroupView();
    showSocialHubEmpty();
  } else {
    viewHost.appendChild(dmView);
  }
  renderDirectChatsRail();
  await Promise.allSettled([
    loadSocialHubList(),
    loadMyPersistentGroupsFromServer()
  ]);
  renderDirectChatsRail();
}

function closeChatsDock() {
  document.body.classList.remove('chat-mode', 'social-hub-mode', 'social-hub-group-active', 'social-hub-direct-active');
  document.getElementById('spike-chat-dock')?.classList.remove('open');
  parkGroupView();
  closePrivateChat();
}

function updateChatTotalUnread() {
  const directTotal = Object.values(spikeUnreadState.chats).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const groupTotal = Object.values(spikeUnreadState.groups).filter(Boolean).length;
  const total = directTotal + groupTotal;
  const badge = document.getElementById('rail-chat-total-unread');
  if (!badge) return;
  badge.textContent = total || '';
  badge.classList.toggle('active', total > 0);
}

function setChatUnread(friendId, count) {
  spikeUnreadState.chats[friendId] = Math.max(0, count || 0);
  const badge = document.getElementById(`rail-dm-unread-${friendId}`);
  if (badge) {
    badge.textContent = spikeUnreadState.chats[friendId] || '';
    badge.classList.toggle('active', spikeUnreadState.chats[friendId] > 0);
  }
  updateChatTotalUnread();
}

function setGroupUnread(roomToken, isUnread) {
  if (!roomToken) return;
  spikeUnreadState.groups[roomToken] = !!isUnread;
  const badge = document.getElementById(`rail-group-unread-${encodeURIComponent(roomToken)}`);
  if (badge) badge.classList.toggle('active', !!isUnread);
  const chatBadge = document.getElementById(`chat-group-unread-${encodeURIComponent(roomToken)}`);
  if (chatBadge) chatBadge.classList.toggle('active', !!isUnread);
  updateChatTotalUnread();
}

function setChatDockTab(tab) {
  chatDockTab = tab === 'groups' ? 'groups' : 'direct';
  renderDirectChatsRail();
}

function setSocialHubTitle(title = 'Чаты') {
  const el = document.querySelector('.spike-chat-dock-title');
  if (el) el.textContent = title;
}

function showSocialHubEmpty(title = 'Выбери чат слева', text = 'Личные чаты и группы теперь живут в одном месте.') {
  const viewHost = document.getElementById('spike-chat-dock-view');
  if (!viewHost) return;
  viewHost.innerHTML = `
    <div class="sn-empty spike-chat-empty-view">
      <div class="sn-empty spike-empty-state">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(text)}</span>
      </div>
    </div>`;
}

function openSocialHubShell(mode = 'direct') {
  const dock = document.getElementById('spike-chat-dock');
  const list = document.getElementById('spike-chat-dock-list');
  if (!dock || !list) return false;
  document.body.classList.remove('group-mode', 'market-mode', 'admin-mode');
  document.body.classList.add('chat-mode', 'social-hub-mode');
  document.body.classList.toggle('social-hub-group-active', mode === 'group');
  document.body.classList.toggle('social-hub-direct-active', mode !== 'group');
  document.getElementById('socialSidebar')?.classList.remove('open');
  dock.classList.add('open');
  list.style.display = 'flex';
  setSocialHubTitle('Social Hub');
  return true;
}

function parkGroupView() {
  const lobby = document.getElementById('lobby-panel');
  const parking = document.getElementById('spike-group-parking');
  if (lobby && parking && lobby.parentElement !== parking) parking.appendChild(lobby);
}

function parkDirectView() {
  const dmView = document.getElementById('ps-dm-chat-view');
  const parking = document.getElementById('spike-dm-parking');
  if (dmView && parking && dmView.parentElement !== parking) parking.appendChild(dmView);
}

function mountGroupViewInSocialHub() {
  const viewHost = document.getElementById('spike-chat-dock-view');
  const lobby = document.getElementById('lobby-panel');
  if (!viewHost || !lobby) return false;
  parkDirectView();
  viewHost.innerHTML = '';
  viewHost.appendChild(lobby);
  lobby.classList.add('open', 'spike-social-group-view');
  return true;
}

renderDirectChatsRail = function() {
  const container = document.getElementById('spike-chat-dock-list');
  if (!container) return;
  updateChatTotalUnread();
  const friends = window.cachedFriendsList || [];
  const groups = window.cachedGroupsList || [];
  const directUnreadTotal = Object.values(spikeUnreadState.chats).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const groupUnreadTotal = Object.values(spikeUnreadState.groups).filter(Boolean).length;

  const directHtml = friends.length ? friends.map((friend) => {
    const encodedName = encodeURIComponent(friend.username || 'Геймер');
    const unread = spikeUnreadState.chats[friend.id] || 0;
    const title = escapeHtmlAttr(friend.username || 'Чат');
    const avatar = friend.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(friend.username || 'DM');
    const activeClass = Number(currentChatTargetUserId) === Number(friend.id) ? 'active' : '';
    return `
      <button class="sn-card spike-chat-row ${activeClass}" onclick="openPrivateChat(${friend.id}, decodeURIComponent('${encodedName}'))" title="${title}" aria-label="Открыть чат ${title}">
        <span class="spike-chat-row-main">
          <img class="sn-avatar spike-chat-row-avatar" src="${avatar}">
          <span class="spike-chat-row-name">${title}<small>личный чат</small></span>
        </span>
        <span id="rail-dm-unread-${friend.id}" class="ps-rail-unread-dot ${unread ? 'active' : ''}">${unread || ''}</span>
      </button>
    `;
  }).join('') : `
    <div class="sn-empty spike-empty-state compact">
      <strong>Личек пока нет</strong>
      <button class="sn-btn spike-empty-action" onclick="openSocialSidebar(); switchSocialTab(null, 'social-search')">Добавить друга</button>
    </div>`;

  const groupsHtml = groups.length ? groups.map((group) => {
      const token = group.room_token || group.roomToken || '';
      const encodedToken = encodeURIComponent(token);
      const activeClass = activeRoomToken === token ? 'active' : '';
      const unread = spikeUnreadState.groups[token] ? 'active' : '';
      const safeTitle = escapeHtmlAttr(token);
      return `
      <button class="sn-card spike-chat-row spike-group-row ${activeClass}" onclick="openGroupInSocialHub(decodeURIComponent('${encodedToken}'))" title="${safeTitle}" aria-label="Открыть группу ${safeTitle}">
          <span class="spike-chat-row-main">
            <span class="sn-avatar spike-chat-row-avatar spike-group-avatar">${escapeHtml(getSquadShortName(token))}</span>
            <span class="spike-chat-row-name">${safeTitle}<small>группа SpikeNet</small></span>
          </span>
          <span id="chat-group-unread-${encodedToken}" class="ps-rail-unread-dot ${unread}"></span>
        </button>
      `;
    }).join('') : `
    <div class="sn-empty spike-empty-state compact">
      <strong>Групп пока нет</strong>
      <button class="sn-btn spike-empty-action" onclick="createNewSquadGroupPrompt()">Создать группу</button>
    </div>`;

  container.innerHTML = `
    <div class="spike-chat-section">
      <div class="spike-chat-section-label">Личные${directUnreadTotal ? ` <span>${directUnreadTotal}</span>` : ''}</div>
      ${directHtml}
    </div>
    <div class="spike-chat-section">
      <div class="spike-chat-section-label">Группы${groupUnreadTotal ? ` <span>${groupUnreadTotal}</span>` : ''}</div>
      ${groupsHtml}
    </div>
  `;
};

// Direct message view, attachments, reactions and calls.

function isSafeDirectUrl(value) {
  const raw = String(value || '').trim();
  if (/^\/uploads\/[^\s<>"']+$/i.test(raw)) return true;
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (e) {
    return false;
  }
}

function renderDirectMessageContent(content) {
  const raw = String(content || '').trim();
  const safe = escapeHtml(raw).replace(/\n/g, '<br>');
  if (!isSafeDirectUrl(raw)) return `<div>${safe}</div>`;

  const lower = raw.split('?')[0].toLowerCase();
  const href = escapeHtmlAttr(raw);
  const host = (() => {
    if (raw.startsWith('/uploads/')) return raw.split('/').pop() || 'attachment';
    try { return new URL(raw).host.replace(/^www\./, ''); } catch (_) { return 'attachment'; }
  })();
  if (/\.(png|jpe?g|gif|webp|avif)$/i.test(lower)) {
    return `
      <a class="spike-dm-link-preview" href="${href}" target="_blank" rel="noopener">${escapeHtml(host)}</a>
      <a href="${href}" target="_blank" rel="noopener">
        <img class="spike-dm-attachment" src="${href}" alt="attachment">
      </a>
    `;
  }

  return `
    <a class="spike-dm-file-link" href="${href}" target="_blank" rel="noopener">${escapeHtml(host)}</a>
  `;
}

function renderDirectReactions(msg) {
  const reactions = msg?.reactions || {};
  const entries = Object.entries(reactions).filter(([, users]) => Array.isArray(users) && users.length);
  if (!entries.length) return '';
  return `
    <div class="spike-dm-reactions">
      ${entries.map(([reaction, users]) => `
        <button class="sn-btn spike-dm-reaction" onclick="reactDirectMessage(${msg.id}, '${escapeHtmlAttr(reaction)}')">${escapeHtml(reaction)} ${users.length}</button>
      `).join('')}
    </div>
  `;
}

function renderDirectMessage(msg) {
  const isMy = msg.sender_id === currentUserId;
  const time = new Date(msg.created_at || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const searchText = `${msg.username || ''} ${msg.content || ''}`.toLowerCase();
  const author = msg.username || (isMy ? currentUsername : 'Геймер');
  const avatar = msg.avatar_url || (isMy ? document.getElementById('user-avatar-preview')?.src : '') || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(author || 'DM')}`;
  return `
    <div class="spike-dm-message ${isMy ? 'my-msg' : 'their-msg'}" id="dm-msg-${msg.id}" data-dm-search="${escapeHtmlAttr(searchText)}" data-message-id="${escapeHtmlAttr(msg.id)}" data-message-content="${escapeHtmlAttr(msg.content || '')}" oncontextmenu="openDirectMessageContextMenu(event, this)">
      <img class="sn-avatar spike-dm-message-avatar" src="${escapeHtmlAttr(avatar)}">
      <div class="spike-dm-message-stack">
        <div class="spike-dm-message-meta">
          <strong>${escapeHtml(author)}</strong>
          <span>${time}</span>
        </div>
        <div class="spike-dm-bubble">
          <div class="spike-dm-bubble-content">${renderDirectMessageContent(msg.content)}</div>
          ${renderDirectReactions(msg)}
        </div>
      </div>
    </div>
  `;
}

let activeDirectMessageMenuPayload = null;

function openDirectMessageContextMenu(event, node) {
  event.preventDefault();
  const menu = document.getElementById('spike-dm-context-menu');
  if (!menu || !node) return;
  activeDirectMessageMenuPayload = {
    id: Number(node.dataset.messageId),
    content: node.dataset.messageContent || ''
  };
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 190)}px`;
  menu.classList.add('open');
}

function closeDirectMessageContextMenu() {
  document.getElementById('spike-dm-context-menu')?.classList.remove('open');
}

window.directMessageMenuAction = async function(action) {
  const payload = activeDirectMessageMenuPayload;
  closeDirectMessageContextMenu();
  if (!payload?.id) return;
  if (action === 'react') return reactDirectMessage(payload.id, '+1');
  if (action === 'pin') return pinDirectMessage(payload.id);
  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(payload.content || '');
      showSpikeAlert('Сообщение скопировано.', 'Chat', 'success');
    } catch (e) {
      prompt('Сообщение:', payload.content || '');
    }
    return;
  }
  if (action === 'delete') return deleteSingleMessage(payload.id, { skipConfirm: true });
};

document.addEventListener('click', (event) => {
  if (!event.target.closest('#spike-dm-context-menu')) closeDirectMessageContextMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDirectMessageContextMenu();
});

function renderDirectPinned() {
  const box = document.getElementById('spike-dm-pinned');
  if (!box) return;
  if (!currentDirectPinned) {
    box.classList.remove('active');
    box.innerHTML = '';
    return;
  }
  const text = String(currentDirectPinned.content || '').slice(0, 110);
  box.classList.add('active');
  box.innerHTML = `
    <span><b>Pinned:</b> ${escapeHtml(text)}</span>
    <button class="sn-btn spike-mini-btn social-action-btn" onclick="pinDirectMessage(null)">Unpin</button>
  `;
}

window.pinDirectMessage = async function(messageId) {
  if (!currentActiveChatId) return;
  try {
    const res = await fetch(`/api/dm/chat/${currentActiveChatId}/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId })
    });
    if (!res.ok) throw new Error('pin failed');
    currentDirectPinned = messageId ? currentDirectMessages.find(msg => msg.id === messageId) || null : null;
    renderDirectPinned();
  } catch (e) {
    showSpikeAlert('Не удалось обновить закреп', 'Chat', 'warning');
  }
};

window.reactDirectMessage = async function(messageId, reaction) {
  try {
    const res = await fetch(`/api/dm/message/${messageId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction })
    });
    if (!res.ok) throw new Error('reaction failed');
  } catch (e) {
    showSpikeAlert('Не удалось поставить реакцию', 'Chat', 'warning');
  }
};

window.filterDirectChat = function(query = '') {
  const needle = String(query || '').trim().toLowerCase();
  document.querySelectorAll('#ps-dm-messages-log .ps-dm-msg-bubble').forEach(node => {
    const hit = !needle || (node.dataset.dmSearch || '').includes(needle);
    node.classList.toggle('spike-dm-hidden', !hit);
  });
};

window.clearDirectSearch = function() {
  const input = document.getElementById('spike-dm-search');
  if (input) input.value = '';
  filterDirectChat('');
};

window.handleDirectTyping = function() {
  if (!socket || !currentActiveChatId) return;
  if (!directTypingTimer) {
    socket.emit('typingDirect', { chatId: currentActiveChatId, isTyping: true });
  }
  clearTimeout(directTypingTimer);
  clearTimeout(directTypingStopTimer);
  directTypingTimer = setTimeout(() => { directTypingTimer = null; }, 900);
  directTypingStopTimer = setTimeout(() => {
    socket.emit('typingDirect', { chatId: currentActiveChatId, isTyping: false });
  }, 1300);
};

window.attachPrivateMessageFile = function() {
  const upload = confirm('Загрузить файл с компьютера? Нажми Cancel, чтобы вставить ссылку.');
  if (upload) {
    document.getElementById('ps-dm-file-input')?.click();
    return;
  }
  const url = prompt('Paste image or file link');
  if (!url || !isSafeDirectUrl(url)) return;
  const input = document.getElementById('ps-dm-message-input');
  if (!input) return;
  input.value = url.trim();
  sendPrivateMessage();
};

window.uploadPrivateMessageFile = async function(file) {
  const inputEl = document.getElementById('ps-dm-file-input');
  try {
    if (!file || !currentActiveChatId) return;
    if (file.size > 12 * 1024 * 1024) {
      showSpikeAlert('Файл больше 12 MB.', 'Upload', 'warning');
      return;
    }
    const res = await fetch('/api/uploads/file', {
      method: 'POST',
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name || 'file')
      },
      body: file
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showSpikeAlert(data.error || 'Не удалось загрузить файл.', 'Upload', 'error');
      return;
    }
    const input = document.getElementById('ps-dm-message-input');
    if (!input) return;
    input.value = data.url;
    sendPrivateMessage();
  } catch (err) {
    showSpikeAlert('Ошибка загрузки файла.', 'Upload', 'error');
  } finally {
    if (inputEl) inputEl.value = '';
  }
};

window.openPrivateChat = async function(friendId, friendUsername) {
  currentChatTargetUserId = friendId;
  setChatUnread(friendId, 0);
  chatDockTab = 'direct';
  parkGroupView();
  renderDirectChatsRail();
  openSocialHubShell('direct');
  document.getElementById('socialSidebar')?.classList.remove('open');
  document.getElementById('ps-dm-target-username').innerText = friendUsername;
  const friend = (window.cachedFriendsList || []).find(item => Number(item.id) === Number(friendId));
  const peerAvatar = document.getElementById('spike-dm-peer-avatar');
  if (peerAvatar) peerAvatar.src = friend?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(friendUsername || 'DM')}`;

  try {
    const res = await fetch('/api/dm/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId })
    });
    const data = await res.json();
    
    if (!data.chatId) return alert('Не удалось открыть чат');
    currentActiveChatId = data.chatId;

    if (socket) socket.emit('joinDirectChat', { chatId: currentActiveChatId });

    await loadChatHistory(currentActiveChatId);
    clearDirectSearch();
    const typing = document.getElementById('spike-dm-typing');
    if (typing) typing.textContent = '';

    const dmView = document.getElementById('ps-dm-chat-view');
    const viewHost = document.getElementById('spike-chat-dock-view');
    const list = document.getElementById('spike-chat-dock-list');
    if (viewHost) viewHost.innerHTML = '';
    if (viewHost && dmView) viewHost.appendChild(dmView);
    if (list) list.style.display = 'flex';
    if (dmView) dmView.style.display = 'block';

    const log = document.getElementById('ps-dm-messages-log');
    log.scrollTop = log.scrollHeight;

  } catch (e) { console.error('Ошибка открытия лички:', e); }
};

function showDirectCallBanner(text, options = {}) {
  const banner = document.getElementById('spike-dm-call-banner');
  const label = document.getElementById('spike-dm-call-text');
  const acceptBtn = document.getElementById('spike-dm-call-accept');
  if (label) label.textContent = text || 'Звонок...';
  if (acceptBtn) acceptBtn.style.display = options.incoming ? 'inline-flex' : 'none';
  if (banner) banner.classList.add('active');
}

function startDirectRingTone() {
  stopDirectRingTone();
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    directRingAudioCtx = directRingAudioCtx || new AudioContext();
    if (directRingAudioCtx.state === 'suspended') directRingAudioCtx.resume().catch(() => {});
    const playRing = () => {
      const osc = directRingAudioCtx.createOscillator();
      const gain = directRingAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(740, directRingAudioCtx.currentTime);
      osc.frequency.setValueAtTime(920, directRingAudioCtx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.0001, directRingAudioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.045, directRingAudioCtx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, directRingAudioCtx.currentTime + 0.46);
      osc.connect(gain);
      gain.connect(directRingAudioCtx.destination);
      osc.start();
      osc.stop(directRingAudioCtx.currentTime + 0.5);
    };
    playRing();
    directRingTimer = setInterval(playRing, 1100);
  } catch (e) {}
}

function stopDirectRingTone() {
  if (directRingTimer) clearInterval(directRingTimer);
  directRingTimer = null;
}

async function ensureDirectCallAudio() {
  if (isVoiceConnected) disconnectFromVoiceChannels();
  if (!localAudioStream || !localAudioStream.active) {
    localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
  localAudioStream.getAudioTracks().forEach(track => track.enabled = true);
  isMuted = false;
  return localAudioStream;
}

window.startDirectCall = async function() {
  if (!currentChatTargetUserId || !socket) return;
  try {
    await ensureDirectCallAudio();
  } catch (e) {
    alert('Не удалось получить доступ к микрофону.');
    return;
  }
  directCallState = {
    direction: 'outgoing',
    status: 'calling',
    peerUserId: currentChatTargetUserId,
    peerUsername: document.getElementById('ps-dm-target-username')?.innerText || 'Игрок',
    peerSocketId: null
  };
  socket.emit('directCallInvite', { targetUserId: currentChatTargetUserId });
  showDirectCallBanner('Звоним...');
};

window.acceptDirectCall = async function() {
  if (!directCallState?.peerSocketId || !socket) return;
  try {
    stopDirectRingTone();
    await ensureDirectCallAudio();
    directCallState.status = 'accepted';
    socket.emit('directCallAccept', { targetSocketId: directCallState.peerSocketId });
    showDirectCallBanner(`Соединение с ${directCallState.peerUsername}`, { connected: true });
  } catch (e) {
    alert('Не удалось получить доступ к микрофону.');
    socket.emit('directCallDecline', { targetSocketId: directCallState.peerSocketId });
    endDirectCall(false);
  }
};

window.endDirectCall = function(notifyPeer = true) {
  stopDirectRingTone();
  if (notifyPeer && directCallState?.peerSocketId && socket) {
    const eventName = directCallState.status === 'ringing' ? 'directCallDecline' : 'directCallEnd';
    socket.emit(eventName, { targetSocketId: directCallState.peerSocketId });
  }
  if (directCallState?.peerSocketId && peerConnections[directCallState.peerSocketId]) {
    peerConnections[directCallState.peerSocketId].close();
    delete peerConnections[directCallState.peerSocketId];
  }
  if (directCallState?.peerSocketId) {
    const audioEl = document.getElementById(`audio-stream-${directCallState.peerSocketId}`);
    if (audioEl) audioEl.remove();
  }
  if (!isVoiceConnected && localAudioStream) {
    localAudioStream.getTracks().forEach(track => track.stop());
    localAudioStream = null;
  }
  directCallState = null;
  document.getElementById('spike-dm-call-banner')?.classList.remove('active');
};

window.closePrivateChat = function(options = {}) {
  currentActiveChatId = null;
  currentChatTargetUserId = null;
  currentDirectMessages = [];
  currentDirectPinned = null;
  clearTimeout(directTypingTimer);
  clearTimeout(directTypingStopTimer);
  directTypingTimer = null;
  directTypingStopTimer = null;
  renderDirectPinned();
  const typing = document.getElementById('spike-dm-typing');
  if (typing) typing.textContent = '';
  endDirectCall();
  const dmView = document.getElementById('ps-dm-chat-view');
  const parking = document.getElementById('spike-dm-parking');
  if (dmView) {
    dmView.style.display = 'none';
    if (parking) parking.appendChild(dmView);
  }
  const chatList = document.getElementById('spike-chat-dock-list');
  if (chatList) chatList.style.display = 'flex';
  const viewHost = document.getElementById('spike-chat-dock-view');
  if (viewHost && activeRoomToken && !options.silent) {
    chatDockTab = 'groups';
    openSocialHubShell('group');
    mountGroupViewInSocialHub();
  } else if (viewHost && !options.silent) {
    showSocialHubEmpty('Выбери чат слева', 'Личные сообщения появятся после добавления друзей.');
  }
  renderDirectChatsRail();
};

async function loadChatHistory(chatId) {
  try {
    const res = await fetch(`/api/dm/history/${chatId}`);
    const data = await res.json();
    const messages = Array.isArray(data) ? data : (data.messages || []);
    currentDirectMessages = messages;
    currentDirectPinned = Array.isArray(data) ? null : (data.pinned || null);
    renderDirectPinned();

    const modernLog = document.getElementById('ps-dm-messages-log');
    if (!modernLog) return;
    modernLog.innerHTML = messages.map(renderDirectMessage).join('');
    filterDirectChat(document.getElementById('spike-dm-search')?.value || '');
    modernLog.scrollTop = modernLog.scrollHeight;
    return;
    const legacyMessages = await res.json();
    
    const log = document.getElementById('ps-dm-messages-log');
    log.innerHTML = '';

    messages.forEach(msg => {
      const isMy = msg.sender_id === currentUserId;
      const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      
      log.innerHTML += `
        <div class="ps-dm-msg-bubble ${isMy ? 'my-msg' : 'their-msg'}" id="dm-msg-${msg.id}">
          <div>${msg.content}</div>
          <div class="ps-dm-msg-meta">${time}</div>
          <span class="ps-msg-del-bucket" onclick="deleteSingleMessage(${msg.id})">🗑️</span>
        </div>
      `;
    });
    log.scrollTop = log.scrollHeight;
  } catch (e) { console.error(e); }
}

window.sendPrivateMessage = function() {
  const input = document.getElementById('ps-dm-message-input');
  const content = input.value.trim();
  if (!content || !currentActiveChatId) return;

  if (socket) {
    socket.emit('sendDirectMessage', {
      chatId: currentActiveChatId,
      senderId: currentUserId,
      username: currentUsername,
      content: content,
      targetUserId: currentChatTargetUserId
    });
    socket.emit('typingDirect', { chatId: currentActiveChatId, isTyping: false });
  }
  clearTimeout(directTypingTimer);
  clearTimeout(directTypingStopTimer);
  directTypingTimer = null;
  directTypingStopTimer = null;
  input.value = '';
};

// --- 🔥 СИНХРОНИЗАЦИЯ НАСТРОЕК UI И БОТА С ПОСТГРЕСОМ ---

// Direct message destructive actions.

window.deleteSingleMessage = async function(messageId, options = {}) {
  if (!options.skipConfirm && !confirm('Удалить сообщение?')) return;
  try { await fetch(`/api/dm/message/${messageId}`, { method: 'DELETE' }); } catch (e) {}
};

window.clearPrivateChatHistory = async function() {
  if (!currentActiveChatId) return;
  if (!confirm('Стереть историю?')) return;
  try { await fetch(`/api/dm/chat/${currentActiveChatId}/clear`, { method: 'DELETE' }); } catch (e) {}
};


