// SpikeNet groups/lobby module.
// Group message UI, pins, replies and lobby helpers extracted from the legacy app bundle.

function togglePinsDrawer() {
  renderPinsList();
  document.getElementById('spike-pins-drawer')?.classList.toggle('open');
}

function setReplyTarget(author, content) {
  spikeState.replyTarget = { author, content };
  const preview = document.getElementById('spike-reply-preview');
  const text = document.getElementById('spike-reply-text');
  if (text) text.textContent = `Ответ ${author}: ${content.slice(0, 90)}`;
  if (preview) preview.classList.add('active');
  document.getElementById('chat-input')?.focus();
}

function setReplyTargetFromButton(button) {
  setReplyTarget(button.dataset.replyAuthor || 'Геймер', button.dataset.replyContent || '');
}

function clearReplyTarget() {
  spikeState.replyTarget = null;
  document.getElementById('spike-reply-preview')?.classList.remove('active');
}

function renderLobbyMessage(msg, chatContainer) {
  const timeString = new Date(msg.created_at || new Date()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (msg.isSystem) {
    chatContainer.innerHTML += `<div class="ps-msg-system">${renderMessageContent(msg.content)}</div>`;
    return;
  }
  const author = msg.username || 'Геймер';
  const isMy = String(msg.user_id || msg.sender_id || '') === String(currentUserId || '');
  const userAvatar = msg.avatar_url || document.getElementById('user-avatar-preview')?.src || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(author);
  const trimmedContent = String(msg.content || '').trim();
  const isImageUrl = isLobbyImageReference(trimmedContent);
  const key = getMessageKey(trimmedContent, author, msg.created_at || timeString);
  const domId = msg.id ? `lobby-msg-${msg.id}` : `lobby-msg-${key}`;
  const finalMessageBody = isImageUrl
    ? `<div class="sn-card ps-msg-text spike-room-bubble spike-room-media"><img src="${escapeHtmlAttr(trimmedContent)}" class="ps-chat-img-payload" onclick="window.open('${escapeHtmlAttr(trimmedContent)}', '_blank')"></div>`
    : `<div class="sn-card ps-msg-text spike-room-bubble">${renderMessageContent(trimmedContent)}</div>`;
  const replyHtml = msg.replyTo
    ? `<div class="spike-reply-line">Ответ ${escapeHtml(msg.replyTo.author)}: ${escapeHtml(msg.replyTo.content)}</div>`
    : '';

  chatContainer.innerHTML += `
    <div id="${domId}" class="ps-msg-block spike-room-message ${isMy ? 'my-msg' : 'their-msg'}" data-message-id="${escapeHtmlAttr(msg.id || '')}" data-message-key="${escapeHtmlAttr(key)}" data-message-author="${escapeHtmlAttr(author)}" data-message-content="${escapeHtmlAttr(trimmedContent)}" data-chat-search="${escapeHtmlAttr(`${author} ${trimmedContent}`.toLowerCase())}" oncontextmenu="openMessageContextMenu(event, this)">
      <img class="sn-avatar ps-msg-avatar spike-room-avatar" src="${userAvatar}">
      <div class="ps-msg-content-zone spike-room-body">
        <div class="ps-msg-meta spike-room-meta">
          <span class="ps-msg-author">${escapeHtml(author)}</span>
            <span class="ps-msg-time">${timeString}</span>
          </div>
        ${replyHtml}
        ${finalMessageBody}
        <div class="spike-msg-tools">
          <button class="sn-btn" onclick="reactToMessage('${key}', '+1')" data-reaction-key="${key}" data-reaction="+1">+1 ${getReactionCount(key, '+1')}</button>
          <button class="sn-btn" onclick="reactToMessage('${key}', 'ok')" data-reaction-key="${key}" data-reaction="ok">ok ${getReactionCount(key, 'ok')}</button>
          <button class="sn-btn" data-reply-content="${escapeHtmlAttr(trimmedContent)}" data-reply-author="${escapeHtmlAttr(author)}" onclick="setReplyTargetFromButton(this)">reply</button>
          <button class="sn-btn" data-pin-content="${escapeHtmlAttr(trimmedContent)}" data-pin-author="${escapeHtmlAttr(author)}" onclick="pinMessageFromButton(this)">pin</button>
        </div>
      </div>
    </div>
  `;
}

function isLobbyAttachmentReference(value) {
  const raw = String(value || '').trim();
  return /^https?:\/\/[^\s<>"']+$/i.test(raw) || /^\/uploads\/[^\s<>"']+$/i.test(raw);
}

function isLobbyImageReference(value) {
  const raw = String(value || '').trim().split('?')[0].toLowerCase();
  return isLobbyAttachmentReference(value) && /\.(jpeg|jpg|gif|png|webp|avif)$/i.test(raw);
}

function filterLobbyChat(query) {
  const needle = String(query || '').trim().toLowerCase();
  document.querySelectorAll('#chat-messages .ps-msg-block').forEach(block => {
    const hay = block.getAttribute('data-chat-search') || '';
    const hit = !needle || hay.includes(needle);
    block.classList.toggle('spike-search-hidden', !hit);
    block.classList.toggle('spike-search-hit', !!needle && hit);
  });
}

function openMessageContextMenu(event, block) {
  event.preventDefault();
  const menu = document.getElementById('spike-message-menu');
  if (!menu || !block) return;
  activeMessageMenuPayload = {
    id: block.dataset.messageId || '',
    key: block.dataset.messageKey || '',
    author: block.dataset.messageAuthor || '',
    content: block.dataset.messageContent || ''
  };
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 190)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 180)}px`;
  menu.classList.add('open');
}

function closeMessageContextMenu() {
  document.getElementById('spike-message-menu')?.classList.remove('open');
}

function messageMenuAction(action) {
  const payload = activeMessageMenuPayload;
  closeMessageContextMenu();
  if (!payload) return;
  if (action === 'reply') return setReplyTarget(payload.author, payload.content);
  if (action === 'react') return reactToMessage(payload.key, '+1');
  if (action === 'pin') return pinMessage(payload.content, payload.author);
  if (action === 'delete' && payload.id && activeRoomToken && socket) {
    socket.emit('deleteLobbyMessage', { roomToken: activeRoomToken, messageId: payload.id });
  }
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('#spike-message-menu')) closeMessageContextMenu();
});

function insertMention() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.value = `${input.value}${input.value ? ' ' : ''}@`;
  input.focus();
}

function renderLobbyDeals() {
  const list = document.getElementById('spike-lobby-deals-list');
  if (!list) return;
  const listings = (marketState.listings || []).slice(0, 8);
  if (!listings.length) {
    list.innerHTML = `<div class="sn-card spike-feed-item">Активных лотов пока нет.</div>`;
    return;
  }
  list.innerHTML = listings.map(listing => `
    <div class="sn-card spike-feed-item">
      <strong>${escapeHtml(listing.title || 'Лот')}</strong> · ${Number(listing.price || 0)} SPK
    </div>
  `).join('');
}

function chooseGameNight() {
  const panel = document.getElementById('spike-game-night-panel');
  const title = document.getElementById('spike-game-night-title');
  if (!title || !panel) return;
  const pick = (marketState.listings || [])[0];
  title.textContent = pick ? pick.title : 'активных лотов пока нет';
  panel.classList.add('active');
  if (pick) addSpikeActivity(`Лот для группы: ${pick.title}`, 'market');
}

// Persistent group navigation and lobby messaging.

window.copyTimedInviteLink = async function() {
  if (!activeRoomToken) return;
  const ttl = Number(document.getElementById('spike-invite-ttl')?.value || 0);
  const expiresAt = ttl > 0 ? Date.now() + ttl : 0;
  const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(activeRoomToken)}${expiresAt ? `&invite_exp=${expiresAt}` : ''}`;
  try {
    await navigator.clipboard.writeText(url);
    showSpikeAlert('Invite link copied.', 'SpikeNet', 'success');
  } catch (err) {
    prompt('Copy invite link:', url);
  }
};

async function createNewSquadGroupPrompt() {
  const gName = prompt("Введите уникальное название вашей постоянной группы/сервера:");
  if (!gName || gName.trim() === '') return;

  try {
    const res = await fetch('/api/groups/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName: gName })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error);

    alert(`🏰 Группа "${gName}" успешно зарегистрирована в PostgreSQL!`);
    loadMyPersistentGroupsFromServer(); 
    joinSquadRoom(data.roomToken); 

  } catch (e) { alert("Ошибка связи с сервером групп"); }
}

function getSquadShortName(roomToken) {
  const cleanName = String(roomToken || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const words = cleanName.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return cleanName.slice(0, 2).toUpperCase() || 'G';
}

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getRoleLabel(role) {
  if (role === 'owner') return 'Владелец';
  if (role === 'admin') return 'Админ';
  return 'Участник';
}

function updateGroupToolbarPermissions(members = []) {
  const me = members.find(member => Number(member.id) === Number(currentUserId));
  const canManage = me && (me.role === 'owner' || me.role === 'admin');
  const inviteBtn = document.getElementById('copy-lobby-link-btn');
  if (inviteBtn) {
    inviteBtn.disabled = !canManage;
    inviteBtn.title = canManage ? 'Добавить друга в группу' : 'Добавлять участников могут владелец и админы';
    inviteBtn.style.opacity = canManage ? '1' : '0.55';
  }
}

async function loadMyPersistentGroupsFromServer() {
  try {
    const res = await fetch('/api/groups/my');
    if (!res.ok) return;
    const groups = await res.json();
    const container = document.getElementById('my-persistent-squads-list');

    if (groups.length === 0) {
      container.innerHTML = `<span style="font-size:0.85rem; color:var(--text-muted); padding-left:5px;">Вы пока не состоите в постоянных группах</span>`;
      return;
    }

    container.innerHTML = groups.map(g => {
      const isActive = activeRoomToken === g.room_token ? 'active-squad' : '';
      return `<button class="sn-btn ps-squad-node-btn ${isActive}" onclick="joinSquadRoom('${g.room_token.replace(/'/g, "\\'")}')">🔮 ${g.room_token}</button>`;
    }).join('');

  } catch(e) { console.error(e); }
}

function setCentralCreateButtonVisible(isVisible) {
  const button = document.getElementById('lobby-action-main-btn');
  if (button) button.style.display = isVisible ? 'inline-flex' : 'none';
}

window.openGroupInSocialHub = function(roomToken) {
  if (isVoiceConnected) disconnectFromVoiceChannels(); 
  activeRoomToken = roomToken;
  setGroupUnread(roomToken, false);
  currentActiveChatId = null;
  currentChatTargetUserId = null;
  chatDockTab = 'groups';
  if (typeof openSocialHubShell === 'function') openSocialHubShell('group');
  else {
    document.body.classList.remove('group-mode', 'market-mode', 'admin-mode');
    document.body.classList.add('chat-mode', 'social-hub-mode', 'social-hub-group-active');
    document.getElementById('spike-chat-dock')?.classList.add('open');
  }
  document.getElementById('ps-dm-chat-view')?.style && (document.getElementById('ps-dm-chat-view').style.display = 'none');
  if (typeof mountGroupViewInSocialHub === 'function') mountGroupViewInSocialHub();
  else document.getElementById('lobby-panel')?.classList.add('open');
  document.getElementById('lobby-room-title').innerHTML = `🏰 Группа: <span class="sn-accent">${activeRoomToken}</span>`;
  switchLobbyChannel('chat', document.querySelector('.spike-channel-btn[onclick*="chat"]'));
  document.querySelectorAll('.spike-voice-channel-btn').forEach(btn => btn.classList.remove('voice-selected'));
  const selectedVoiceBtn = [...document.querySelectorAll('.spike-voice-channel-btn')]
    .find(btn => btn.getAttribute('onclick')?.includes(`'${spikeState.selectedVoiceChannel}'`));
  if (selectedVoiceBtn) selectedVoiceBtn.classList.add('voice-selected');
  updateVoiceStatusText();
  setCentralCreateButtonVisible(false);
  
  window.history.pushState({}, '', '?room=' + encodeURIComponent(activeRoomToken));
  
  if (socket) socket.emit('joinRoom', { roomToken: activeRoomToken, userId: currentUserId });

  loadGroupChatHistory(activeRoomToken);
  loadMyPersistentGroupsFromServer();
  if (typeof renderDirectChatsRail === 'function') renderDirectChatsRail();
};

window.joinSquadRoom = window.openGroupInSocialHub;

async function loadGroupChatHistory(roomToken) {
  const chat = document.getElementById('chat-messages');
  chat.innerHTML = `<div class="ps-msg-system">📡 Синхронизация логов архива группы...</div>`;
  
  try {
    const res = await fetch(`/api/lobby/history/${encodeURIComponent(roomToken)}`);
    if (!res.ok) return;
    const messages = await res.json();
    
    chat.innerHTML = '';
    if (messages.length === 0) {
      chat.innerHTML = `<div class="ps-msg-system">✨ В чате этой группы пока нет сообщений. Скинь ссылку на картинку или напиши что-нибудь первым!</div>`;
      return;
    }

    messages.forEach(msg => renderLobbyMessage(msg, chat));
    chat.scrollTop = chat.scrollHeight;
    markLobbySeen();
  } catch(e) { console.error(e); }
}

function markLobbySeen() {
  if (!activeRoomToken || !socket) return;
  socket.emit('lobbySeen', { roomToken: activeRoomToken });
}

function renderLobbyTypingIndicator() {
  const el = document.getElementById('spike-typing-indicator');
  if (!el) return;
  const names = [...lobbyTypingUsers.values()].slice(0, 3);
  el.textContent = names.length ? `${names.join(', ')} typing...` : '';
}

function emitLobbyTyping(isTyping) {
  if (!activeRoomToken || !socket) return;
  socket.emit('typingLobby', { roomToken: activeRoomToken, isTyping });
}

function handleLobbyInputTyping() {
  clearTimeout(lobbyTypingTimer);
  clearTimeout(lobbyTypingStopTimer);
  lobbyTypingTimer = setTimeout(() => emitLobbyTyping(true), 120);
  lobbyTypingStopTimer = setTimeout(() => emitLobbyTyping(false), 1200);
}

function checkUrlForLobbyRoom() {
  const productMatch = window.location.pathname.match(/^\/market\/listing\/(\d+)$/);
  if (productMatch) {
    openMarketScreen();
    const listingId = Number(productMatch[1]);
    const openWhenReady = async () => {
      if (!(marketState.listings || []).length) await loadMarketplace();
      openMarketProductPage(listingId, { skipHistory: true });
    };
    openWhenReady();
    return;
  }
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  const inviteExp = Number(urlParams.get('invite_exp') || 0);
  if (inviteExp && Date.now() > inviteExp) {
    showSpikeAlert('Invite link expired.', 'SpikeNet', 'warning');
    window.history.replaceState({}, '', window.location.pathname);
    return;
  }
  if (roomParam) {
    joinSquadRoom(roomParam);
  }
}

window.joinInvitedSquadRoom = function(roomToken) {
  document.getElementById('cat-speech').classList.remove('show');
  joinSquadRoom(roomToken);
};

function sendMessage() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (text && activeRoomToken) {
    const payload = { 
      roomToken: activeRoomToken, 
      userId: currentUserId, 
      username: currentUsername, 
      content: text,
      replyTo: spikeState.replyTarget
    };
    socket.emit('sendMessage', payload);
    emitLobbyTyping(false);
    if (spikeState.replyTarget) clearReplyTarget();
    input.value = '';
  }
}

window.attachLobbyMessageFile = function() {
  const upload = confirm('Загрузить файл с компьютера? Нажми Cancel, чтобы вставить ссылку.');
  if (upload) {
    document.getElementById('lobby-file-input')?.click();
    return;
  }
  const url = prompt('Вставь ссылку на картинку или файл');
  if (!url || !/^https?:\/\//i.test(url.trim())) return;
  const input = document.getElementById('chat-input');
  if (!input) return;
  input.value = url.trim();
  sendMessage();
};

window.uploadLobbyMessageFile = async function(file) {
  const inputEl = document.getElementById('lobby-file-input');
  try {
    if (!file || !activeRoomToken) return;
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
    if (!res.ok || !data.url) {
      showSpikeAlert(data.error || 'Не удалось загрузить файл.', 'Upload', 'error');
      return;
    }
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.value = data.url;
    sendMessage();
  } catch (err) {
    showSpikeAlert('Ошибка загрузки файла.', 'Upload', 'error');
  } finally {
    if (inputEl) inputEl.value = '';
  }
};

document.getElementById('chat-input').addEventListener('input', handleLobbyInputTyping);

document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendQuickReaction(text) {
  if (activeRoomToken) {
    socket.emit('sendMessage', { 
      roomToken: activeRoomToken, 
      userId: currentUserId, 
      username: currentUsername, 
      content: text 
    });
  } else alert('Сначала создайте или войдите в лобби пати!');
}

function leaveCurrentLobby() {
  if (!activeRoomToken) return;
  socket.emit('leaveRoom', { roomToken: activeRoomToken, userId: currentUserId });
  activeRoomToken = null;
  document.body.classList.remove('group-mode', 'social-hub-group-active');
  document.body.classList.add('chat-mode', 'social-hub-mode', 'social-hub-direct-active');
  document.getElementById('lobby-panel')?.classList.remove('open');
  if (typeof parkGroupView === 'function') parkGroupView();
  if (typeof showSocialHubEmpty === 'function') showSocialHubEmpty('Выбери чат или группу слева', 'Группа закрыта. Social Hub остался открытым.');
  setCentralCreateButtonVisible(true);
  document.getElementById('chat-messages').innerHTML = '';
  const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
  window.history.pushState({}, '', cleanUrl);
  if (typeof loadMarketplace === 'function') loadMarketplace();
  loadMyPersistentGroupsFromServer();
  if (typeof renderDirectChatsRail === 'function') renderDirectChatsRail();
}

// Group settings, membership and group persistence overrides.

window.openGroupSettingsModal = async function() {
  if (!activeRoomToken) return alert('Сначала откройте группу.');
  document.getElementById('groupSettingsModalOverlay').classList.add('active');
  await loadGroupSettings();
};

window.closeGroupSettingsModal = function() {
  document.getElementById('groupSettingsModalOverlay').classList.remove('active');
};

async function loadGroupSettings() {
  if (!activeRoomToken) return;
  const list = document.getElementById('group-settings-members-list');
  list.innerHTML = `<div class="ps-msg-system">Загрузка настроек группы...</div>`;

  try {
    const res = await fetch(`/api/groups/settings?roomToken=${encodeURIComponent(activeRoomToken)}`);
    const data = await res.json();
    if (!res.ok) {
      list.innerHTML = `<div class="ps-msg-system">${escapeHtml(data.error || 'Не удалось загрузить настройки')}</div>`;
      return;
    }

    currentGroupSettings = data;
    document.getElementById('group-settings-title').innerText = `⚙️ ${data.room.roomToken}`;
    document.getElementById('group-settings-count').innerText = data.members.length;
    document.getElementById('group-settings-subtitle').innerText = data.canManage
      ? 'Управление участниками и ролями'
      : 'Просмотр участников и ролей';

    document.getElementById('group-settings-actions').innerHTML = renderGroupAdminActions(data);
    list.innerHTML = data.members.map(member => renderGroupSettingsMember(member, data)).join('');
  } catch (err) {
    list.innerHTML = `<div class="ps-msg-system">Ошибка связи с сервером группы</div>`;
  }
}

function renderGroupAdminActions(settings) {
  const isOwner = settings.requesterRole === 'owner';
  const canManage = settings.canManage;
  const members = new Set(settings.members.map(m => Number(m.id)));
  const friends = (window.cachedFriendsList || []).filter(f => !members.has(Number(f.id)));
  const friendOptions = friends.map(f => {
    const tag = f.user_tag ? `#${f.user_tag}` : '';
    return `<option value="${f.id}">${escapeHtml(f.username)} ${escapeHtml(tag)}</option>`;
  }).join('');

  const commonActions = `
    <div class="sn-card ps-group-action-card">
      <div>
        <div class="ps-group-action-title">Ссылка и быстрые действия</div>
        <div class="ps-group-action-desc">Скопируй ссылку на группу или обнови список участников.</div>
      </div>
      <div class="ps-group-action-row">
        <button class="sn-btn social-action-btn" onclick="copyActiveGroupLink()">Скопировать ссылку</button>
        <button class="sn-btn social-action-btn" onclick="loadGroupSettings()">Обновить</button>
        <button class="sn-btn social-action-btn" onclick="leaveGroupFromSettings()">Выйти из группы</button>
      </div>
    </div>
  `;

  const adminActions = canManage ? `
    <div class="sn-card ps-group-action-card">
      <div>
        <div class="ps-group-action-title">Добавить участника</div>
        <div class="ps-group-action-desc">Доступно владельцу и админам. Добавлять можно только друзей.</div>
      </div>
      <div class="ps-group-action-row">
        <select id="group-add-friend-select" class="sn-input ps-role-select" ${friends.length ? '' : 'disabled'}>
          ${friends.length ? friendOptions : '<option>Нет друзей для добавления</option>'}
        </select>
        <button class="sn-btn social-action-btn" onclick="addSelectedFriendToGroup()" ${friends.length ? '' : 'disabled'}>Добавить</button>
      </div>
    </div>
  ` : '';

  const ownerActions = isOwner ? `
    <div class="sn-card ps-group-action-card">
      <div>
        <div class="ps-group-action-title">Переименовать группу</div>
        <div class="ps-group-action-desc">Код группы в скобках сохранится, поменяется только название.</div>
      </div>
      <div class="ps-group-action-row">
        <input id="group-rename-input" class="sn-input ps-input-text" placeholder="Новое название группы">
        <button class="sn-btn social-action-btn" onclick="renameActiveGroup()">Сохранить</button>
      </div>
    </div>
    <div class="sn-card ps-group-action-card ps-owner-danger-zone">
      <div>
        <div class="ps-group-action-title">Опасная зона</div>
        <div class="ps-group-action-desc">Удаление группы уберёт участников, чат и голоса этой комнаты.</div>
      </div>
      <div class="ps-group-action-row">
        <button class="sn-btn sn-btn-danger ps-kick-btn" onclick="deleteActiveGroup()">Удалить группу</button>
      </div>
    </div>
  ` : '';

  return commonActions + adminActions + ownerActions;
}

function renderGroupSettingsMember(member, settings) {
  const avatar = member.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(member.username);
  const role = member.role || 'member';
  const isOwner = role === 'owner';
  const requesterIsOwner = settings.requesterRole === 'owner';
  const requesterCanKick = settings.requesterRole === 'owner' || (settings.requesterRole === 'admin' && role === 'member');
  const canChangeRole = requesterIsOwner && !isOwner;
  const canKick = requesterCanKick && !isOwner && Number(member.id) !== Number(currentUserId);

  const roleControl = canChangeRole
    ? `<select class="sn-input ps-role-select" onchange="updateGroupMemberRole(${member.id}, this.value)">
         <option value="member" ${role === 'member' ? 'selected' : ''}>Участник</option>
         <option value="admin" ${role === 'admin' ? 'selected' : ''}>Админ</option>
       </select>`
    : `<span class="sn-badge ps-member-role ${role}">${getRoleLabel(role)}</span>`;

  const kickButton = canKick
    ? `<button class="sn-btn sn-btn-danger ps-kick-btn" onclick="kickGroupMember(${member.id}, '${escapeHtmlAttr(member.username)}')">Убрать</button>`
    : '';

  return `
    <div class="ps-group-member-row">
      <img class="sn-avatar" src="${avatar}" alt="">
      <div>
        <div class="ps-group-member-name">${escapeHtml(member.username)}</div>
        <div class="ps-group-member-status">${escapeHtml(member.current_status || 'В сети')}</div>
      </div>
      <div class="ps-group-member-actions">
        ${roleControl}
        ${kickButton}
      </div>
    </div>
  `;
}

window.updateGroupMemberRole = async function(targetUserId, role) {
  if (!activeRoomToken) return;
  try {
    const res = await fetch('/api/groups/role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomToken: activeRoomToken, targetUserId, role })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Не удалось изменить роль');
    await loadGroupSettings();
  } catch (err) {
    alert('Ошибка связи при изменении роли');
  }
};

window.addSelectedFriendToGroup = async function() {
  const select = document.getElementById('group-add-friend-select');
  const targetUserId = Number(select?.value);
  if (!activeRoomToken || !targetUserId) return;

  try {
    const res = await fetch('/api/groups/add-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomToken: activeRoomToken, targetUserId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Не удалось добавить участника');

    const friend = (window.cachedFriendsList || []).find(f => Number(f.id) === targetUserId);
    if (socket && friend) {
      socket.emit('sendLobbyInvite', {
        roomToken: activeRoomToken,
        targetUserId,
        senderUsername: currentUsername
      });
    }
    await loadGroupSettings();
  } catch (err) {
    alert('Ошибка связи при добавлении участника');
  }
};

window.kickGroupMember = async function(targetUserId, username) {
  if (!activeRoomToken) return;
  if (!confirm(`Убрать ${username} из группы?`)) return;

  try {
    const res = await fetch('/api/groups/kick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomToken: activeRoomToken, targetUserId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Не удалось убрать участника');
    await loadGroupSettings();
  } catch (err) {
    alert('Ошибка связи при удалении участника');
  }
};

window.renameActiveGroup = async function() {
  const input = document.getElementById('group-rename-input');
  const groupName = input?.value.trim();
  if (!activeRoomToken || !groupName) return alert('Введите новое название группы');

  try {
    const res = await fetch('/api/groups/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomToken: activeRoomToken, groupName })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Не удалось переименовать группу');

    activeRoomToken = data.roomToken;
    document.getElementById('lobby-room-title').innerHTML = `🏰 Группа: <span class="sn-accent">${escapeHtml(activeRoomToken)}</span>`;
    window.history.pushState({}, '', '?room=' + encodeURIComponent(activeRoomToken));
    if (socket) socket.emit('joinRoom', { roomToken: activeRoomToken, userId: currentUserId });
    loadGroupChatHistory(activeRoomToken);
    await loadMyPersistentGroupsFromServer();
    await loadGroupSettings();
  } catch (err) {
    alert('Ошибка связи при переименовании группы');
  }
};

window.deleteActiveGroup = async function() {
  if (!activeRoomToken) return;
  if (!confirm(`Удалить группу ${activeRoomToken}? Это действие нельзя отменить.`)) return;

  try {
    const res = await fetch('/api/groups/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomToken: activeRoomToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Не удалось удалить группу');

    closeGroupSettingsModal();
    leaveCurrentLobby();
    await loadMyPersistentGroupsFromServer();
  } catch (err) {
    alert('Ошибка связи при удалении группы');
  }
};

window.leaveGroupFromSettings = async function() {
  if (!activeRoomToken) return;
  const token = activeRoomToken;
  closeGroupSettingsModal();
  await leaveGroup(token);
};

window.copyActiveGroupLink = async function() {
  if (!activeRoomToken) return;
  const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(activeRoomToken)}`;
  try {
    await navigator.clipboard.writeText(url);
    alert('Ссылка на группу скопирована');
  } catch (err) {
    prompt('Скопируйте ссылку на группу:', url);
  }
};

// ИНТЕРАКТИВНОЕ СОЗДАНИЕ ВЕЧНОЙ ГРУППЫ ЧЕРЕЗ PROMPT С ЗАПИСЬЮ В БД
async function createNewSquadGroupPrompt() {
  const gName = prompt("Введите уникальное название вашей постоянной группы/сервера:");
  if (!gName || gName.trim() === '') return;

  try {
    const res = await fetch('/api/groups/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupName: gName })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error);

    alert(`🏰 Группа "${gName}" успешно зарегистрирована в PostgreSQL!`);
    loadMyPersistentGroupsFromServer(); 
    joinSquadRoom(data.roomToken); 

  } catch (e) { alert("Ошибка связи с сервером групп"); }
}

// ЗАГРУЗКА ИЗ ПОСТГРЕСА СПИСКА ГРУПП ГЕЙМЕРА
async function loadMyPersistentGroupsFromServer() {
  try {
    const res = await fetch('/api/groups/my');
    const groups = await res.json();
    const container = document.getElementById('my-persistent-squads-list');

    if (groups.length === 0) {
      container.innerHTML = `<span style="font-size:0.85rem; color:var(--text-muted);">Пока нет групп</span>`;
      return;
    }

    container.innerHTML = groups.map(g => {
      const isActive = activeRoomToken === g.room_token ? 'active-squad' : '';
      return `
        <div class="sn-btn ps-squad-node-btn ${isActive}">
          <span onclick="joinSquadRoom('${g.room_token}')">🔮 ${g.room_token}</span>
          <span class="leave-group-x" onclick="leaveGroup('${g.room_token}')">×</span>
        </div>
      `;
    }).join('');
  } catch(e) { console.error(e); }
}

loadMyPersistentGroupsFromServer = async function() {
  try {
    const res = await fetch('/api/groups/my');
    const groups = await res.json();
    window.cachedGroupsList = Array.isArray(groups) ? groups : [];
    const container = document.getElementById('my-persistent-squads-list');
    if (!container) return;
    spikeState.groupsCount = groups.length;
    updateSpikeDashboard();
    if (document.body.classList.contains('chat-mode') && chatDockTab === 'groups') renderDirectChatsRail();

    if (groups.length === 0) {
      container.innerHTML = `
        <button class="sn-btn ps-squad-node-btn" onclick="createNewSquadGroupPrompt()" title="Создать первую группу" aria-label="Создать первую группу">
          <span class="ps-rail-icon">+</span><span class="ps-rail-text">Группа</span>
        </button>`;
      return;
    }

    container.innerHTML = groups.map(g => {
      const isActive = activeRoomToken === g.room_token ? 'active-squad' : '';
      const encodedToken = encodeURIComponent(g.room_token);
      const safeTitle = escapeHtmlAttr(g.room_token);
      const shortName = escapeHtmlAttr(getSquadShortName(g.room_token));

      return `
        <button class="sn-btn ps-squad-node-btn ${isActive}" onclick="joinSquadRoom(decodeURIComponent('${encodedToken}'))" title="${safeTitle}" aria-label="Открыть группу ${safeTitle}">
          <span class="ps-rail-icon">${shortName}</span>
          <span class="ps-rail-text">${safeTitle}</span>
          <span id="rail-group-unread-${encodedToken}" class="ps-rail-unread-dot ${spikeUnreadState.groups[g.room_token] ? 'active' : ''}"></span>
          <span class="leave-group-x" onclick="event.stopPropagation(); leaveGroup(decodeURIComponent('${encodedToken}'))" title="Выйти из группы">x</span>
        </button>
      `;
    }).join('');
  } catch(e) { console.error(e); }
};

window.leaveGroup = async function(roomToken) {
  if (!confirm(`Выйти из группы ${roomToken}?`)) return;
  try {
    await fetch('/api/groups/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomToken })
    });
    loadMyPersistentGroupsFromServer();
    if (activeRoomToken === roomToken) leaveCurrentLobby();
  } catch (e) { alert('Ошибка выхода'); }
};

// Подгрузка логов переписки группы из Postgres
async function loadGroupChatHistory(roomToken) {
  const chat = document.getElementById('chat-messages');
  chat.innerHTML = `<div class="ps-msg-system">📡 Синхронизация логов архива группы...</div>`;
  
  try {
    const res = await fetch(`/api/lobby/history/${encodeURIComponent(roomToken)}`);
    if (!res.ok) return;
    const messages = await res.json();
    
    chat.innerHTML = '';
    if (messages.length === 0) {
      chat.innerHTML = `<div class="ps-msg-system">✨ В чате этой группы пока нет сообщений. Скинь ссылку на картинку или напиши что-нибудь первым!</div>`;
      return;
    }

    messages.forEach(msg => renderLobbyMessage(msg, chat));
    chat.scrollTop = chat.scrollHeight;
    markLobbySeen();
  } catch(e) { console.error(e); }
}

// Squad invite modal.

window.openSquadInviteModal = function() {
  if (!activeRoomToken) return alert('Сначала выберите или создайте постоянную группу!');
  
  const overlay = document.getElementById('squadInviteModalOverlay');
  const listRender = document.getElementById('squad-friends-invite-list');
  overlay.classList.add('active');

  const friends = window.cachedFriendsList || [];
  if (friends.length === 0) {
    listRender.innerHTML = `<p class="sn-empty ps-social-empty">У вас нет друзей для приглашения.</p>`;
    return;
  }

  listRender.innerHTML = friends.map(f => {
    const avatar = f.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(f.username);
    return `
      <div class="sn-card ps-social-user-card" style="width:100%;">
        <div class="ps-social-user-info">
          <img class="sn-avatar ps-social-avatar" src="${avatar}">
          <span class="ps-social-name">${f.username}</span>
        </div>
        <button class="sn-btn ps-social-btn ps-social-btn-success" onclick="executeLiveSquadInvite(${f.id}, '${f.username.replace(/'/g, "\\'")}')">➕ Добавить</button>
      </div>
    `;
  }).join('');
};

window.closeSquadInviteModal = function() {
  document.getElementById('squadInviteModalOverlay').classList.remove('active');
};

window.executeLiveSquadInvite = async function(targetUserId, targetUsername) {
  if (!activeRoomToken) return;

  try {
    const res = await fetch('/api/groups/add-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomToken: activeRoomToken, targetUserId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Только владелец или админ может добавлять участников');

    if (socket) {
      socket.emit('sendLobbyInvite', {
        roomToken: activeRoomToken,
        targetUserId: targetUserId,
        senderUsername: currentUsername
      });
    }

    alert(`🏰 Игрок ${targetUsername} добавлен в группу!`);
    closeSquadInviteModal();
    if (document.getElementById('groupSettingsModalOverlay')?.classList.contains('active')) await loadGroupSettings();
  } catch (err) {
    alert('Ошибка связи при добавлении участника');
  }
};



