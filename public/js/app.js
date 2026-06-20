let currentActiveChatId = null;
let currentChatTargetUserId = null;
let currentDirectMessages = [];
let currentDirectPinned = null;
let directTypingTimer = null;
let directTypingStopTimer = null;
let searchTimeout = null;
let currentCurrency = 'KZT';
let exchangeRates = { KZT: 1, RUB: 0.19, USD: 0.0022 };
const currencySymbols = { KZT: '₸', RUB: '₽', USD: '$' };
let currentGroupSettings = null;

let isLoginMode = true; 
let isPasswordRecoveryMode = false;
let currentUserId = null;
let currentUsername = "";
let currentUserRoles = [];
let currentUserModeration = {};
let activeRoomToken = null;
let socket = null;
const spycatState = { isHunting: false }; // 🟢 ФИКС: Исправлено критическое "=" на законное двоеточие ":"
let isCatTyping = false;
let socialSearchTimeout = null;
let localAudioStream = null;
let peerConnections = {}; 
let isVoiceConnected = false;
let isMuted = false;
let isDeafened = false;
let voiceSpeechInterval = null;
let directCallState = null;
let directRingTimer = null;
let directRingAudioCtx = null;
let marketState = { wallet: null, listings: [], trades: [], ledger: [], myListings: [] };
let adminState = {
  loaded: false,
  roles: [],
  users: [],
  reports: [],
  audit: [],
  moderation: {
    loaded: false,
    summary: {},
    disputes: [],
    reports: [],
    suspiciousTrades: [],
    newSellers: [],
    audit: []
  }
};
let marketUiState = {
  tab: 'lots',
  filter: 'all',
  sort: 'new',
  query: '',
  game: 'all',
  region: 'all',
  minPrice: null,
  maxPrice: null,
  minRating: 0,
  verifiedOnly: false,
  tradeFilter: 'all'
};
let marketModerationState = {
  loaded: false,
  allowed: null,
  summary: null,
  disputes: [],
  payments: [],
  disputeFilter: 'open',
  paymentFilter: 'pending',
  query: ''
};
let currentMarketProductId = null;
let currentMarketTicketId = null;
let currentMarketDealId = null;
let lobbyTypingTimer = null;
let lobbyTypingStopTimer = null;
const lobbyTypingUsers = new Map();
let activeMessageMenuPayload = null;
const spikeUnreadState = {
  chats: {},
  groups: {}
};
let chatDockTab = 'direct';

function userLooksLikeMarketModerator() {
  const username = String(currentUsername || '').toLowerCase();
  return marketModerationState.allowed === true
    || currentUserRoles.includes('market_moderator')
    || Number(currentUserId) === 1
    || username === 'admin'
    || username === 'moderator';
}

function canOpenAdminCenter() {
  return currentUserRoles.includes('admin') || currentUserRoles.includes('support') || Number(currentUserId) === 1;
}

function isCurrentUserAdmin() {
  return currentUserRoles.includes('admin') || Number(currentUserId) === 1;
}

function updateAdminAccessUi() {
  const adminBtn = document.getElementById('ps-rail-admin-btn');
  if (adminBtn) adminBtn.style.display = canOpenAdminCenter() ? 'flex' : 'none';
}
let lastSpikeDealSignature = localStorage.getItem('spikenet_last_deal_signature') || '';
const spikeDealCooldownMs = 60 * 60 * 1000;
const spikeStorageKey = 'spikenet_state_v2';
const spikeState = {
  notifications: [],
  activity: [],
  friendsCount: 0,
  groupsCount: 0,
  activeVoiceUsers: 0,
  profile: {
    banner: '',
    status: '',
    badge: '★'
  },
  theme: localStorage.getItem('spikenet_theme') || 'night-hunt',
  presence: localStorage.getItem('spikenet_presence') || 'online',
  pinnedMessage: localStorage.getItem('spikenet_pinned_message') || '',
  pinnedMessages: [],
  replyTarget: null,
  selectedVoiceChannel: localStorage.getItem('spikenet_voice_channel') || 'voice',
  messageReactions: {}
};

window.spikeSoundEnabled = true;

function restoreSpikeState() {
  try {
    const saved = JSON.parse(localStorage.getItem(spikeStorageKey) || '{}');
    if (Array.isArray(saved.notifications)) spikeState.notifications = saved.notifications.slice(0, 30);
    if (Array.isArray(saved.activity)) spikeState.activity = saved.activity.slice(0, 30);
    if (saved.profile) spikeState.profile = { ...spikeState.profile, ...saved.profile };
  } catch (e) {}
  try {
    spikeState.messageReactions = JSON.parse(localStorage.getItem('spikenet_reactions') || '{}');
  } catch (e) {
    spikeState.messageReactions = {};
  }
  try {
    spikeState.pinnedMessages = JSON.parse(localStorage.getItem('spikenet_pins') || '[]');
  } catch (e) {
    spikeState.pinnedMessages = [];
  }
  applySpikeTheme(spikeState.theme);
  const presenceSelect = document.getElementById('presence-select');
  if (presenceSelect) presenceSelect.value = spikeState.presence;
  renderSpikeNotifications();
  renderSpikeActivity();
  hydrateSpikeProfileExtras();
  renderPinnedMessage();
}

function persistSpikeState() {
  localStorage.setItem(spikeStorageKey, JSON.stringify({
    notifications: spikeState.notifications.slice(0, 30),
    activity: spikeState.activity.slice(0, 30),
    profile: spikeState.profile
  }));
  localStorage.setItem('spikenet_theme', spikeState.theme);
  localStorage.setItem('spikenet_presence', spikeState.presence);
  localStorage.setItem('spikenet_pinned_message', spikeState.pinnedMessage || '');
  localStorage.setItem('spikenet_reactions', JSON.stringify(spikeState.messageReactions || {}));
  localStorage.setItem('spikenet_pins', JSON.stringify(spikeState.pinnedMessages || []));
}

function showSpikeAlert(message, title = 'Спайк сообщает', type = 'info') {
  const stack = document.getElementById('spike-toast-stack');
  if (!stack) return window.__nativeAlert ? window.__nativeAlert(message) : console.log(message);
  const toast = document.createElement('div');
  toast.className = `spike-toast ${type}`;
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(String(message))}</p>`;
  stack.prepend(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 240);
  }, 4200);
}

window.__nativeAlert = window.alert.bind(window);
window.alert = (message) => showSpikeAlert(message);

const IMPORTANT_NOTIFICATION_TYPES = new Set([
  'dm',
  'mention',
  'call',
  'invite',
  'dispute',
  'purchase',
  'sale',
  'dispute_resolution'
]);

function addSpikeNotification(title, text, type = 'info') {
  if (!IMPORTANT_NOTIFICATION_TYPES.has(type)) return;
  const item = { title, text, type, time: new Date().toISOString() };
  spikeState.notifications.unshift(item);
  spikeState.notifications = spikeState.notifications.slice(0, 30);
  persistSpikeState();
  renderSpikeNotifications();
  if (!['dnd', 'invisible'].includes(spikeState.presence)) {
    showSpikeAlert(text, title, type);
  }
}

function renderSpikeNotifications() {
  const beforeCount = spikeState.notifications.length;
  spikeState.notifications = spikeState.notifications.filter(n => IMPORTANT_NOTIFICATION_TYPES.has(n.type));
  if (spikeState.notifications.length !== beforeCount) persistSpikeState();
  const list = document.getElementById('spike-notifications-list');
  const badge = document.getElementById('spike-notification-count');
  if (badge) {
    badge.textContent = spikeState.notifications.length;
    badge.style.display = spikeState.notifications.length ? 'flex' : 'none';
  }
  if (!list) return;
  if (!spikeState.notifications.length) {
    list.innerHTML = `<div class="spike-notification-item">Новых уведомлений нет.</div>`;
    return;
  }
  list.innerHTML = spikeState.notifications.map(n => `
    <div class="spike-notification-item">
      <strong>${escapeHtml(n.title)}</strong>
      <div>${escapeHtml(n.text)}</div>
      <small>${new Date(n.time).toLocaleString('ru-RU')}</small>
    </div>
  `).join('');
}

function toggleNotificationCenter() {
  document.getElementById('spike-notification-popover')?.classList.toggle('open');
}

function clearSpikeNotifications() {
  spikeState.notifications = [];
  persistSpikeState();
  renderSpikeNotifications();
}

function addSpikeActivity(text, kind = 'signal') {
  return;
}

function renderSpikeActivity() {
  const feed = document.getElementById('spike-activity-feed');
  if (!feed) return;
  if (!spikeState.activity.length) {
    feed.innerHTML = `<div class="spike-feed-item">Пока тихо. Спайк прислушивается.</div>`;
    const quiet = document.getElementById('spike-activity-feed-quiet');
    if (quiet) quiet.innerHTML = feed.innerHTML;
    return;
  }
  const html = spikeState.activity.map(item => `
    <div class="spike-feed-item">
      ${escapeHtml(item.text)}
      <small>${new Date(item.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</small>
    </div>
  `).join('');
  feed.innerHTML = html;
  const quiet = document.getElementById('spike-activity-feed-quiet');
  if (quiet) quiet.innerHTML = html;
}

function clearSpikeActivity() {
  spikeState.activity = [];
  persistSpikeState();
  renderSpikeActivity();
}

function applySpikeTheme(theme) {
  spikeState.theme = theme || 'night-hunt';
  document.body.setAttribute('data-spike-theme', spikeState.theme);
  const select = document.getElementById('spikeThemeSelect');
  if (select) select.value = spikeState.theme;
  persistSpikeState();
}

function getSpikeLevel(listingsCount, dealsCount, friendsCount, groupsCount) {
  const score = listingsCount * 10 + dealsCount * 18 + friendsCount * 5 + groupsCount * 8;
  if (score >= 220) return { name: 'Легенда SpikeNet', progress: 100 };
  if (score >= 140) return { name: 'Надёжный продавец', progress: Math.min(100, Math.round((score - 140) / 80 * 100)) };
  if (score >= 70) return { name: 'Escrow trader', progress: Math.round((score - 70) / 70 * 100) };
  if (score >= 25) return { name: 'Участник рынка', progress: Math.round((score - 25) / 45 * 100) };
  return { name: 'Новичок сети', progress: Math.max(8, Math.round(score / 25 * 100)) };
}

function updateSpikeDashboard() {
  const listingsCount = Array.isArray(marketState?.listings) ? marketState.listings.length : 0;
  const dealsCount = Array.isArray(marketState?.trades) ? marketState.trades.length : 0;
  const level = getSpikeLevel(listingsCount, dealsCount, spikeState.friendsCount, spikeState.groupsCount);
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('spike-stat-games', listingsCount);
  setText('spike-stat-deals', dealsCount);
  setText('spike-stat-friends', spikeState.friendsCount);
  setText('spike-stat-groups', spikeState.groupsCount);
  setText('spike-level-label', level.name);
  setText('spike-profile-level-label', level.name);
  const bar = document.getElementById('spike-level-progress');
  if (bar) bar.style.width = `${level.progress}%`;
  const profileBar = document.getElementById('spike-profile-level-progress');
  if (profileBar) profileBar.style.width = `${level.progress}%`;
}

function updateVoiceStatusText() {
  const status = document.querySelector('.ps-profile-status');
  const dockStatus = document.getElementById('spike-dock-status');
  const dockUser = document.getElementById('spike-dock-username');
  const sidebarTitle = document.getElementById('spike-sidebar-voice-title');
  const connectBtn = document.getElementById('spike-sidebar-voice-connect');
  const voiceLabel = getVoiceChannelLabel();
  if (dockUser) dockUser.textContent = currentUsername || 'voice';
  if (sidebarTitle) sidebarTitle.textContent = voiceLabel;
  if (isVoiceConnected) {
    const mode = isMuted ? 'микрофон выключен' : isDeafened ? 'звук выключен' : 'в голосе';
    if (status) status.textContent = `SpikeNet Voice: ${mode}`;
    if (dockStatus) dockStatus.textContent = `${voiceLabel} · ${mode}`;
    if (connectBtn) connectBtn.textContent = 'Отключиться';
  } else {
    if (status) status.textContent = spikeState.profile.status || 'Агент сети SpikeNet';
    if (dockStatus) dockStatus.textContent = 'не подключён';
    if (connectBtn) connectBtn.textContent = 'Подключиться';
  }
}

function setPresenceStatus(status) {
  spikeState.presence = status;
  localStorage.setItem('spikenet_presence', status);
  const statusInput = document.getElementById('my-custom-status-input');
  const readable = { online: 'В сети', idle: 'Отошёл', dnd: 'Не беспокоить', invisible: 'Невидимка' }[status] || 'В сети';
  if (statusInput && !statusInput.value.trim()) statusInput.value = readable;
  if (activeRoomToken && socket) {
    socket.emit('updateStatus', { userId: currentUserId, newStatus: readable, roomToken: activeRoomToken });
  }
}

function switchLobbyChannel(channel, button) {
  document.querySelectorAll('.spike-channel-btn').forEach(btn => btn.classList.remove('active'));
  if (button) button.classList.add('active');
  document.querySelectorAll('.spike-channel-view').forEach(view => view.classList.remove('active'));
  document.getElementById(`lobby-channel-${channel}`)?.classList.add('active');
  const chatInput = document.getElementById('chat-input');
  if (chatInput) chatInput.parentElement.style.display = '';
  if (channel === 'deals') renderLobbyDeals();
  const labels = {
    chat: ['# общий', 'чат группы, ссылки и быстрые сборы'],
    deals: ['# лоты', 'активные предложения из маркета'],
    votes: ['# голосования', 'выбор игры вечера и сборы'],
    media: ['# медиа', 'превью картинок и ссылок'],
    voice: ['voice общий', 'общий голосовой канал'],
    duo: ['voice дуо', 'быстрый канал на двоих'],
    squad: ['voice сквад', 'голос для полной пати']
  };
  const [title, topic] = labels[channel] || labels.chat;
  const titleEl = document.getElementById('spike-channel-title');
  const topicEl = document.getElementById('spike-channel-topic');
  if (titleEl) titleEl.textContent = title;
  if (topicEl) topicEl.textContent = topic;
}

function getVoiceChannelLabel(channel = spikeState.selectedVoiceChannel) {
  return {
    voice: 'voice общий',
    duo: 'voice дуо',
    squad: 'voice сквад'
  }[channel] || 'voice общий';
}

function selectVoiceChannel(channel, button) {
  const previousVoiceChannel = spikeState.selectedVoiceChannel;
  const shouldReconnect = isVoiceConnected && previousVoiceChannel !== channel;
  spikeState.selectedVoiceChannel = channel || 'voice';
  localStorage.setItem('spikenet_voice_channel', spikeState.selectedVoiceChannel);
  document.querySelectorAll('.spike-voice-channel-btn').forEach(btn => btn.classList.remove('voice-selected'));
  if (button) button.classList.add('voice-selected');
  const panel = document.getElementById('spike-sidebar-voice-panel');
  if (panel) panel.classList.add('active');
  updateVoiceStatusText();
  updateVoiceCounter();
  if (shouldReconnect) {
    disconnectFromVoiceChannels();
    setTimeout(() => toggleVoiceConnect(), 80);
  }
}

function getMessageKey(text, author, time) {
  return btoa(unescape(encodeURIComponent(`${author}|${time}|${text}`))).replace(/=+$/g, '').slice(0, 28);
}

function renderMessageContent(content) {
  const safe = escapeHtml(content);
  return safe
    .replace(/(https?:\/\/[^\s<]+|\/uploads\/[^\s<]+)/g, '<a class="spike-message-link" href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/@([\wА-Яа-яЁё-]+)/g, '<span class="spike-mention">@$1</span>');
}

function getReactionCount(key, reaction) {
  return spikeState.messageReactions?.[key]?.[reaction] || 0;
}

function reactToMessage(key, reaction) {
  spikeState.messageReactions[key] = spikeState.messageReactions[key] || {};
  spikeState.messageReactions[key][reaction] = (spikeState.messageReactions[key][reaction] || 0) + 1;
  persistSpikeState();
  document.querySelectorAll(`[data-reaction-key="${key}"][data-reaction="${reaction}"]`).forEach(el => {
    el.textContent = `${reaction} ${getReactionCount(key, reaction)}`;
  });
}

function pinMessage(content, author) {
  const pin = { author, content, time: new Date().toISOString() };
  spikeState.pinnedMessages.unshift(pin);
  spikeState.pinnedMessages = spikeState.pinnedMessages.slice(0, 12);
  spikeState.pinnedMessage = `${author}: ${content}`.slice(0, 180);
  persistSpikeState();
  renderPinnedMessage();
  renderPinsList();
}

function pinMessageFromButton(button) {
  pinMessage(button.dataset.pinContent || '', button.dataset.pinAuthor || 'Геймер');
}

function renderPinnedMessage() {
  const box = document.getElementById('spike-pinned-message');
  const text = document.getElementById('spike-pinned-text');
  if (!box || !text) return;
  if (!spikeState.pinnedMessage) {
    box.classList.remove('active');
    text.textContent = '';
    return;
  }
  text.textContent = spikeState.pinnedMessage;
  box.classList.add('active');
  renderPinsList();
}

function clearPinnedMessage() {
  spikeState.pinnedMessage = '';
  spikeState.pinnedMessages = [];
  persistSpikeState();
  renderPinnedMessage();
  renderPinsList();
}

function renderPinsList() {
  const list = document.getElementById('spike-pins-list');
  if (!list) return;
  if (!spikeState.pinnedMessages?.length) {
    list.innerHTML = `<div class="spike-feed-item">Пинов пока нет.</div>`;
    return;
  }
  list.innerHTML = spikeState.pinnedMessages.map(pin => `
    <div class="spike-feed-item">
      <strong>${escapeHtml(pin.author)}</strong>
      <div>${escapeHtml(pin.content)}</div>
      <small>${new Date(pin.time).toLocaleString('ru-RU')}</small>
    </div>
  `).join('');
}

restoreSpikeState();

const rtcConfig = {
  bundlePolicy: 'balanced',
  rtcpMuxPolicy: 'require',
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};
const pendingIceCandidates = {};

async function checkUserSession() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const user = await res.json();
      loginSuccessInit(user);
    } else {
      showAuthScreenAfterLogoutIfNeeded();
    }
  } catch (e) {
    showAuthScreenAfterLogoutIfNeeded();
  }
}

function showAuthScreenAfterLogoutIfNeeded() {
  document.getElementById('auth-screen-element')?.classList.add('active');
  if (sessionStorage.getItem('spikenet_open_register_after_logout') === '1') {
    sessionStorage.removeItem('spikenet_open_register_after_logout');
    if (isLoginMode) toggleAuthMode();
  }
}

function toggleAuthMode() {
  if (isPasswordRecoveryMode) {
    closePasswordRecovery();
    return;
  }
  isLoginMode = !isLoginMode;
  document.getElementById('auth-screen-title').innerText = isLoginMode ? 'Вход в SpikeNet' : 'Регистрация в SpikeNet';
  document.getElementById('auth-submit-main-btn').innerText = isLoginMode ? 'Войти в SpikeNet' : 'Создать аккаунт';
  document.getElementById('auth-toggle-link-el').innerText = isLoginMode ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти';
  const hint = document.getElementById('auth-password-policy-hint');
  if (hint) hint.style.display = isLoginMode ? 'none' : 'block';
  const forgot = document.getElementById('auth-forgot-password-btn');
  if (forgot) forgot.style.display = isLoginMode ? 'inline-flex' : 'none';
}

function getPasswordPolicyErrors(password, username = '') {
  const value = String(password || '');
  const lowered = value.toLowerCase();
  const cleanUsername = String(username || '').trim().toLowerCase();
  const errors = [];
  if (value.length < 10) errors.push('минимум 10 символов');
  if (/\s/.test(value)) errors.push('без пробелов');
  if (!/[a-zа-яё]/.test(value)) errors.push('маленькая буква');
  if (!/[A-ZА-ЯЁ]/.test(value)) errors.push('большая буква');
  if (!/\d/.test(value)) errors.push('цифра');
  if (!/[^A-Za-zА-Яа-яЁё0-9\s]/.test(value)) errors.push('спецсимвол');
  if (cleanUsername && lowered.includes(cleanUsername)) errors.push('не используй ник в пароле');
  return errors;
}

function openPasswordRecovery() {
  isPasswordRecoveryMode = true;
  document.getElementById('auth-screen-title').innerText = 'Восстановление пароля';
  document.getElementById('auth-submit-main-btn').style.display = 'none';
  document.getElementById('auth-recovery-panel').style.display = 'grid';
  document.getElementById('auth-password-policy-hint').style.display = 'block';
  document.getElementById('auth-forgot-password-btn').style.display = 'none';
  document.getElementById('auth-toggle-link-el').innerText = 'Вернуться ко входу';
  const resetUsername = document.getElementById('auth-reset-username-input');
  const authUsername = document.getElementById('auth-username-input');
  if (resetUsername && authUsername?.value.trim()) resetUsername.value = authUsername.value.trim();
}

function closePasswordRecovery() {
  if (!isPasswordRecoveryMode) return;
  isPasswordRecoveryMode = false;
  document.getElementById('auth-screen-title').innerText = isLoginMode ? 'Вход в SpikeNet' : 'Регистрация в SpikeNet';
  document.getElementById('auth-submit-main-btn').style.display = '';
  document.getElementById('auth-recovery-panel').style.display = 'none';
  document.getElementById('auth-toggle-link-el').innerText = isLoginMode ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти';
  document.getElementById('auth-password-policy-hint').style.display = isLoginMode ? 'none' : 'block';
  const forgot = document.getElementById('auth-forgot-password-btn');
  if (forgot) forgot.style.display = isLoginMode ? 'inline-flex' : 'none';
}

async function requestPasswordResetCode() {
  const username = document.getElementById('auth-reset-username-input').value.trim();
  if (!username) return alert('Введи ник аккаунта');
  try {
    const res = await fetch('/api/auth/password/reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Не удалось создать код восстановления');
    if (data.resetToken) {
      const codeInput = document.getElementById('auth-reset-code-input');
      if (codeInput) codeInput.value = data.resetToken;
      alert(`Код восстановления: ${data.resetToken}. Он действует 15 минут.`);
    } else {
      alert(data.message || 'Если аккаунт найден, код отправлен.');
    }
  } catch (err) {
    alert('Ошибка сети при восстановлении');
  }
}

async function confirmPasswordReset() {
  const username = document.getElementById('auth-reset-username-input').value.trim();
  const token = document.getElementById('auth-reset-code-input').value.trim();
  const password = document.getElementById('auth-reset-new-password-input').value;
  if (!username || !token || !password) return alert('Заполни ник, код и новый пароль');
  const errors = getPasswordPolicyErrors(password, username);
  if (errors.length) return alert(`Пароль слабый: ${errors.join(', ')}`);
  try {
    const res = await fetch('/api/auth/password/reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, token, password })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Не удалось сменить пароль');
    alert(data.message || 'Пароль обновлён');
    closePasswordRecovery();
    if (!isLoginMode) toggleAuthMode();
    document.getElementById('auth-username-input').value = username;
    document.getElementById('auth-password-input').value = '';
  } catch (err) {
    alert('Ошибка сети при смене пароля');
  }
}

async function submitAuthForm() {
  const u = document.getElementById('auth-username-input').value.trim();
  const p = document.getElementById('auth-password-input').value;
  if (!u || !p) return alert('Заполните все поля!');
  if (isPasswordRecoveryMode) return closePasswordRecovery();
  if (!isLoginMode) {
    const errors = getPasswordPolicyErrors(p, u);
    if (errors.length) return alert(`Пароль слабый: ${errors.join(', ')}`);
  }

  const url = isLoginMode ? '/api/auth/login' : '/api/auth/register';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error);

    if (isLoginMode) {
      loginSuccessInit(data.user);
    } else {
      alert(data.message);
      toggleAuthMode();
    }
  } catch (err) { alert('Ошибка сети бэкенда'); }
}

function loginSuccessInit(user) {
  currentUserId = user.id;
  currentUsername = user.username;
  currentUserRoles = Array.isArray(user.roles) ? user.roles : [];
  currentUserModeration = user.moderation || {};
  updateAdminAccessUi();
  
  const authScreen = document.getElementById('auth-screen-element');
  if (authScreen) authScreen.classList.remove('active');
  
  document.getElementById('main-dashboard-container').classList.add('active');
  
  // РЕНДЕРИМ ТЕГ РЯДОМ С ИМЕНЕМ В ШАПКЕ ХАБА
  const userTagString = user.user_tag ? `<span class="sn-muted" style="font-weight:400; font-size:0.85rem;">#${user.user_tag}</span>` : '';
  document.getElementById('welcome-username-lbl').innerHTML = `${currentUsername} ${userTagString}`;
  document.getElementById('ps-profile-username-title').innerHTML = `${currentUsername} ${userTagString}`;
  
  initSocketConnection();
  loadSocialHubList();
  loadMyPersistentGroupsFromServer(); // 🔥 Получаем вечные комнаты из PostgreSQL

  Promise.resolve().then(() => {
    loadMarketplace();
    checkUrlForLobbyRoom(); 
    applyClientSettings(user); 
    applySpikeProfileExtras();
  });
}

async function logoutSession() {
  try {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    const logoutResponse = await fetch('/api/auth/logout', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: '{}'
    });
    if (!logoutResponse.ok) {
      await fetch('/api/auth/logout', { method: 'GET', cache: 'no-store', credentials: 'same-origin' });
    }
  } catch (err) {
    console.warn('Logout request failed, clearing client state anyway:', err);
  } finally {
    try {
      sessionStorage.clear();
      Object.keys(localStorage)
        .filter(key => key.startsWith('spikenet_') || key.startsWith('spike'))
        .forEach(key => localStorage.removeItem(key));
    } catch (_) {}
    currentUserId = null;
    currentUsername = '';
    currentUserRoles = [];
    currentUserModeration = {};
    document.body.classList.remove('chat-mode', 'group-mode', 'market-mode', 'admin-mode', 'social-hub-mode', 'social-hub-group-active', 'social-hub-direct-active');
    document.getElementById('main-dashboard-container')?.classList.remove('active');
    document.getElementById('profileCardOverlay')?.classList.remove('active');
    const authScreen = document.getElementById('auth-screen-element');
    if (authScreen) authScreen.classList.add('active');
    if (isLoginMode) toggleAuthMode();
    const usernameInput = document.getElementById('auth-username-input');
    const passwordInput = document.getElementById('auth-password-input');
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';
    try { window.history.replaceState({}, '', '/'); } catch (_) {}
  }
}

function normalizeStoredAvatarUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/uploads/')) return raw;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin && url.pathname.startsWith('/uploads/')) {
      return url.pathname;
    }
  } catch (_) {}
  return raw;
}

function getCurrentAvatarUrlForSave() {
  return normalizeStoredAvatarUrl(document.getElementById('user-avatar-preview')?.getAttribute('src') || '');
}

async function saveUserUiSettings({ avatarUrl } = {}) {
  const colorAccentSelect = document.getElementById('colorAccentSelect');
  const compactGridToggle = document.getElementById('compactGridToggle');
  const soundToggle = document.getElementById('soundToggle');
  const uiPayload = {
    avatar_url: normalizeStoredAvatarUrl(avatarUrl || getCurrentAvatarUrlForSave()),
    color_accent: colorAccentSelect ? colorAccentSelect.value : '#f59e0b',
    compact_grid: compactGridToggle ? compactGridToggle.checked : false,
    spike_sound: soundToggle ? soundToggle.checked : true
  };

  const res = await fetch('/api/users/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(uiPayload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not save settings');
  return uiPayload;
}

async function uploadSpikeImageFile(file, { title = 'SpikeNet' } = {}) {
  if (!file) throw new Error('Файл не выбран.');
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Можно загрузить только картинку.');
  }
  const res = await fetch('/api/uploads/file', {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name || 'image')
    },
    body: file
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Не удалось загрузить картинку для ${title}.`);
  return normalizeStoredAvatarUrl(data.url);
}

function setCurrentAvatar(avatarUrl) {
  const clean = normalizeStoredAvatarUrl(avatarUrl);
  const preview = document.getElementById('user-avatar-preview');
  const bigAv = document.getElementById('ps-big-avatar');
  if (preview) preview.src = clean;
  if (bigAv) bigAv.src = clean;
  return clean;
}

async function saveSelectedProfileAvatar() {
  const avatarInput = document.getElementById('avatarFileInput');
  const file = avatarInput?.files?.[0];
  if (!file) return '';
  if (!file.type.startsWith('image/')) throw new Error('Аватаркой может быть только картинка.');

  const avatarUrl = await uploadSpikeImageFile(file, { title: 'аватара' });
  setCurrentAvatar(avatarUrl);
  await saveUserUiSettings({ avatarUrl });
  avatarInput.value = '';
  return avatarUrl;
}

// --- 📡 СЕКЦИЯ SOCKET.IO ЛОББИ С ЛИЧНЫМИ КОМНАТАМИ И РАБОЧИМ ВОЙСОМ ---
function initSocketConnection() {
  if (!socket) {
    socket = io();

    // 🔥 Объявляем сессию сокету, теперь инвайты между разными вкладками аккаунтов летают без осечек!
    socket.emit('initUserSession', { userId: currentUserId });

    socket.on('messageDeleted', ({ messageId }) => {
      currentDirectMessages = currentDirectMessages.filter(msg => msg.id !== messageId);
      if (currentDirectPinned?.id === messageId) {
        currentDirectPinned = null;
        renderDirectPinned();
      }
      const msgEl = document.getElementById(`dm-msg-${messageId}`);
      if (msgEl) msgEl.remove();
      const lobbyMsgEl = document.getElementById(`lobby-msg-${messageId}`);
      if (lobbyMsgEl) lobbyMsgEl.remove();
    });

    socket.on('chatCleared', () => {
      currentDirectMessages = [];
      currentDirectPinned = null;
      renderDirectPinned();
      const log = document.getElementById('ps-dm-messages-log');
      if (log) log.innerHTML = '<p class="ps-social-empty" style="padding:20px 0;">История переписки очищена</p>';
    });

    socket.on('moderationBlocked', ({ reason }) => {
      showSpikeAlert(reason || 'Действие заблокировано модерацией', 'Moderation', 'warning');
    });

    socket.on('lobbyUpdated', ({ members, votes }) => {
      updateGroupToolbarPermissions(members);
      const roleOrder = [
        ['owner', 'Владелец'],
        ['admin', 'Админы'],
        ['member', 'Онлайн']
      ];
      document.getElementById('lobby-members-container').innerHTML = roleOrder.map(([targetRole, label]) => {
        const roleMembers = members.filter(m => (m.role || 'member') === targetRole);
        if (!roleMembers.length) return '';
        return `<div class="spike-member-section">${label} - ${roleMembers.length}</div>` + roleMembers.map(m => {
        const avatar = m.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(m.username);
        const tagSuffix = m.user_tag ? `<span class="sn-muted" style="font-weight:400;">#${escapeHtml(m.user_tag)}</span>` : '';
        const role = m.role || 'member';
        return `
          <div class="member-tag" onclick="openPublicGamerProfile(${m.id})">
            <img src="${avatar}"> 
            <span style="min-width:0;">
              <span>${escapeHtml(m.username)}${tagSuffix}</span>
              <span style="display:block; color:var(--text-muted); font-size:0.76rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(m.current_status || 'В сети')}</span>
            </span>
            <span class="ps-member-role ${role}">${getRoleLabel(role)}</span>
          </div>
        `;
        }).join('');
      }).join('');
      if (document.getElementById('groupSettingsModalOverlay')?.classList.contains('active')) {
        loadGroupSettings();
      }
      
      document.querySelectorAll('.vote-btn-lobby').forEach(b => {
        b.innerHTML = `Заинтересован (0)`; b.classList.remove('active-voted');
      });
    });

    socket.on('newMessage', (msg) => {
      const chatContainer = document.getElementById('chat-messages');
      if (!chatContainer) return;
      renderLobbyMessage(msg, chatContainer);
      markLobbySeen();
      const groupVisible = document.body.classList.contains('group-mode') || document.body.classList.contains('social-hub-group-active');
      if (activeRoomToken && (document.hidden || !groupVisible)) {
        setGroupUnread(activeRoomToken, true);
      }
      if (currentUsername && msg.username !== currentUsername && String(msg.content || '').toLowerCase().includes(`@${currentUsername.toLowerCase()}`)) {
        addSpikeNotification('Упоминание в группе', `${msg.username} упомянул тебя.`, 'mention');
      }
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });

    socket.on('lobbyTyping', ({ userId, username, isTyping }) => {
      if (Number(userId) === Number(currentUserId)) return;
      if (isTyping) {
        lobbyTypingUsers.set(userId, username || 'user');
        setTimeout(() => {
          lobbyTypingUsers.delete(userId);
          renderLobbyTypingIndicator();
        }, 3500);
      } else {
        lobbyTypingUsers.delete(userId);
      }
      renderLobbyTypingIndicator();
    });

    socket.on('lobbySeenUpdated', ({ seenCount }) => {
      const el = document.getElementById('spike-read-receipts');
      if (el) el.textContent = `seen ${seenCount || 0}`;
    });

    // СЛУШАТЕЛЬ РЕАЛ-ТАЙМ ПРИГЛАШЕНИЙ В ГРУППОВЫЕ КОМНАТЫ
    socket.on('incomingLobbyInvite', ({ roomToken, senderUsername }) => {
      addSpikeNotification('Инвайт в группу', `${senderUsername} зовёт тебя в сквад.`, 'invite');
      addSpikeActivity(`${senderUsername} отправил приглашение в группу`, 'invite');
      const speech = document.getElementById('cat-speech');
      if (speech) {
        playPs5Tick();
        speech.innerHTML = `🐾 <b>${senderUsername}</b> зовёт тебя в сквад лобби! <br><button onclick="joinInvitedSquadRoom('${roomToken}')" style="padding:4px 10px; font-size:0.75rem; margin-top:5px; background:var(--accent); color:#000; font-weight:bold; border-radius:4px;">Залететь ➔</button>`;
        speech.classList.add('show');
      }
    });

    // WebRTC
    socket.on('voice-channels-list', (usersList) => {
      usersList.forEach(user => {
        initPeerConnection(user.socketId, user.userId, user.username, true);
      });
    });

    socket.on('voice-user-joined', ({ socketId, userId, username, voiceChannel }) => {
      if (voiceChannel && voiceChannel !== spikeState.selectedVoiceChannel) return;
      initPeerConnection(socketId, userId, username, false);
    });

    socket.on('voice-offer-received', async ({ senderSocketId, offer }) => {
      if (!peerConnections[senderSocketId] && directCallState?.peerSocketId === senderSocketId) {
        try {
          await ensureDirectCallAudio();
          initPeerConnection(senderSocketId, directCallState.peerUserId, directCallState.peerUsername, false);
          directCallState.status = 'connected';
          showDirectCallBanner(`Соединение с ${directCallState.peerUsername}`, { connected: true });
        } catch (e) {
          console.error('Direct call offer failed:', e);
          endDirectCall();
          return;
        }
      }
      if (peerConnections[senderSocketId]) {
        try {
          await peerConnections[senderSocketId].setRemoteDescription(new RTCSessionDescription(offer));
          flushPendingIce(senderSocketId);
          const answer = await peerConnections[senderSocketId].createAnswer();
          await peerConnections[senderSocketId].setLocalDescription(answer);
          socket.emit('voice-answer', { targetSocketId: senderSocketId, answer: peerConnections[senderSocketId].localDescription });
        } catch (e) { console.error('Ошибка в WebRTC Offer:', e); }
      }
    });

    socket.on('voice-answer-received', ({ senderSocketId, answer }) => {
      if (peerConnections[senderSocketId]) {
        peerConnections[senderSocketId].setRemoteDescription(new RTCSessionDescription(answer))
          .then(() => flushPendingIce(senderSocketId))
          .catch(e => console.error(e));
      }
    });

    socket.on('voice-ice-candidate-received', ({ senderSocketId, candidate }) => {
      if (peerConnections[senderSocketId]) {
        addRemoteIceCandidate(senderSocketId, candidate);
      }
    });

    socket.on('voice-user-speaking', ({ userId, voiceChannel, isSpeaking }) => {
      if (voiceChannel && voiceChannel !== spikeState.selectedVoiceChannel) return;
      toggleLocalAvatarSpeaking(userId, isSpeaking);
    });

    socket.on('voice-user-left', ({ socketId, userId, voiceChannel }) => {
      if (voiceChannel && voiceChannel !== spikeState.selectedVoiceChannel) return;
      if (peerConnections[socketId]) {
        peerConnections[socketId].close();
        delete peerConnections[socketId];
      }
      const audioEl = document.getElementById(`audio-stream-${socketId}`);
      if (audioEl) audioEl.remove();

      const node = document.getElementById(`voice-user-${userId}`);
      if (node) node.remove();
      updateVoiceCounter();
    });

    // СОЦИАЛКА
    socket.on('incomingFriendRequest', () => {
      loadSocialHubList();
    });

    socket.on('socialListUpdated', () => {
      loadSocialHubList();
    });

    socket.on('globalSocialUpdate', () => {
      loadSocialHubList();
    });

    socket.on('marketUpdated', () => {
      loadMarketplace();
    });

    socket.on('marketDisputeUpdated', () => {
      loadMarketplace();
    });

    socket.on('marketEvent', (event) => {
      loadMarketplace();
      addSpikeNotification(event.title || 'Marketplace', event.message || 'Market updated', event.type || 'deal');
    });

    socket.on('newDirectMessage', (msg) => {
      if (currentActiveChatId === msg.chat_id) {
        const log = document.getElementById('ps-dm-messages-log');
        if (!log) return;
        currentDirectMessages.push(msg);
        log.insertAdjacentHTML('beforeend', renderDirectMessage(msg));
        filterDirectChat(document.getElementById('spike-dm-search')?.value || '');
        log.scrollTop = log.scrollHeight;
        return;
        const isMy = msg.sender_id === currentUserId;
        const time = new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

        log.innerHTML += `
          <div class="ps-dm-msg-bubble ${isMy ? 'my-msg' : 'their-msg'}" id="dm-msg-${msg.id}">
            <div>${msg.content}</div>
            <div class="ps-dm-msg-meta">${time}</div>
            <span class="ps-msg-del-bucket" onclick="deleteSingleMessage(${msg.id})">🗑️</span>
          </div>
        `;
        log.scrollTop = log.scrollHeight;
      }
    });

    socket.on('incomingDMAlert', ({ chatId, username, content, senderId }) => {
      if (currentActiveChatId !== chatId) {
        addSpikeNotification('Новое личное сообщение', `${username}: ${content.substring(0, 42)}`, 'dm');
        addSpikeActivity(`${username} написал в личку`, 'dm');
        const speech = document.getElementById('cat-speech');
        if (speech) {
          speech.innerText = `🐾 ${username} пишет в личку: "${content.substring(0, 20)}..."`;
          speech.classList.add('show');
          setTimeout(() => speech.classList.remove('show'), 4000);
        }

        setChatUnread(senderId, (spikeUnreadState.chats[senderId] || 0) + 1);
      }
    });

    socket.on('directTyping', ({ chatId, username, isTyping }) => {
      if (currentActiveChatId !== chatId) return;
      const typing = document.getElementById('spike-dm-typing');
      if (!typing) return;
      typing.textContent = isTyping ? `${username || 'Игрок'} печатает...` : '';
    });

    socket.on('directMessageReaction', (msg) => {
      const index = currentDirectMessages.findIndex(item => item.id === msg.id);
      if (index !== -1) currentDirectMessages[index] = { ...currentDirectMessages[index], ...msg };
      const node = document.getElementById(`dm-msg-${msg.id}`);
      if (node) node.outerHTML = renderDirectMessage(currentDirectMessages[index] || msg);
      filterDirectChat(document.getElementById('spike-dm-search')?.value || '');
    });

    socket.on('directChatPinned', ({ chatId, messageId }) => {
      if (currentActiveChatId !== chatId) return;
      currentDirectPinned = currentDirectMessages.find(msg => msg.id === messageId) || null;
      renderDirectPinned();
    });

    socket.on('incomingDirectCall', ({ callerId, callerUsername, callerSocketId }) => {
      directCallState = {
        direction: 'incoming',
        status: 'ringing',
        peerUserId: callerId,
        peerUsername: callerUsername,
        peerSocketId: callerSocketId
      };
      addSpikeNotification('Входящий звонок', `${callerUsername} звонит тебе.`, 'call');
      startDirectRingTone();
      showDirectCallBanner(`${callerUsername} звонит...`, { incoming: true });
      const speech = document.getElementById('cat-speech');
      if (speech) {
        speech.innerText = `${callerUsername} звонит в личке`;
        speech.classList.add('show');
        setTimeout(() => speech.classList.remove('show'), 4000);
      }
    });

    socket.on('directCallAccepted', async ({ calleeId, calleeUsername, calleeSocketId }) => {
      if (!directCallState) return;
      directCallState = {
        ...directCallState,
        status: 'connected',
        peerUserId: calleeId,
        peerUsername: calleeUsername,
        peerSocketId: calleeSocketId
      };
      await ensureDirectCallAudio();
      showDirectCallBanner(`Соединение с ${calleeUsername}`, { connected: true });
      initPeerConnection(calleeSocketId, calleeId, calleeUsername, true);
    });

    socket.on('directCallDeclined', ({ username }) => {
      showDirectCallBanner(`${username || 'Игрок'} отклонил звонок`, { ended: true });
      stopDirectRingTone();
      setTimeout(() => endDirectCall(false), 1200);
    });

    socket.on('directCallEnded', ({ username }) => {
      showDirectCallBanner(`${username || 'Игрок'} завершил звонок`, { ended: true });
      setTimeout(() => endDirectCall(false), 900);
    });
  }
}

// --- JS-МОДУЛЬ ВЗАИМОДЕЙСТВИЯ С ВЕЧНЫМИ ГРУППАМИ ХАБА ---

function sendMyStatusUpdate() {
  const input = document.getElementById('my-custom-status-input');
  if (!input.value.trim()) return;
  if (activeRoomToken) {
    socket.emit('updateStatus', { userId: currentUserId, newStatus: input.value.trim(), roomToken: activeRoomToken });
    socket.emit('sendMessage', {
      roomToken: activeRoomToken,
      userId: currentUserId,
      username: currentUsername,
      content: `📝 Игрок ${currentUsername} обновил status: "${input.value.trim()}"`,
      isSystem: true
    });
    input.value = '';
  } else alert('Обновится внутри сокет-лобби!');
}

function copyLobbyLink() {
  navigator.clipboard.writeText(window.location.href).then(() => alert('📋 Скопировано пацанам!'));
}

window.voteForGameInLobby = function(id) {
  if (!activeRoomToken) return alert('Сначала создайте или войдите в лобби!');
  socket.emit('voteGame', { roomToken: activeRoomToken, userId: currentUserId, productId: id });
}

// --- ЗВУКИ ---
let audioCtx = null;
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }

function playPs5Tick() {
  try {
    initAudio(); if (!audioCtx) return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(850, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.015, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.04);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.04);
  } catch (e) {}
}

function playPs5Select() {
  try {
    initAudio(); if (!audioCtx) return;
    const osc1 = audioCtx.createOscillator(); const osc2 = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc1.type = 'triangle'; osc1.frequency.setValueAtTime(260, audioCtx.currentTime); osc1.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.08);
    osc2.type = 'sine'; osc2.frequency.setValueAtTime(520, audioCtx.currentTime); osc2.frequency.exponentialRampToValueAtTime(150, audioCtx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.09);
    osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination); osc1.start(); osc2.start(); osc1.stop(audioCtx.currentTime + 0.09); osc2.stop(audioCtx.currentTime + 0.09);
  } catch (e) {}
}

function playRetroBeepTalkSound(char) {
  try {
    if (!window.spikeSoundEnabled) return;
    initAudio(); if (!audioCtx || char === " ") return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = 'sine'; const bF = 580; const rP = Math.random() * 40 - 20;
    osc.frequency.setValueAtTime(bF + rP, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.02, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.03);
    osc.connect(gain); gain.connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + 0.03);
  } catch (e) {}
}

document.addEventListener('click', (e) => {
  if (e.target.closest('button') || e.target.closest('.sub-filter-btn') || e.target.closest('.currency-switcher select') || e.target.closest('.party-toggle-btn') || e.target.closest('.history-toggle') || e.target.closest('.vote-btn-lobby') || e.target.closest('.ps-tab-btn')) {
    playPs5Select();
  }
});

let spyBubbleTimeout = null;
function interactWithCat() {
  if (isCatTyping) return;
  isCatTyping = true;
  
  const speechBubble = document.getElementById('cat-speech'); 
  const body = document.querySelector('.cat-body-svg');
  let randomPhrase = "";
  const activeName = currentUsername || "Странник";

  const phrases = [
    `Маркет под контролем, ${activeName}!`,
    `Escrow сделки на месте, ${activeName}.`,
    `Чат в лобби работает стабильно, ${activeName}.`,
    `Спайк следит за безопасностью сделок, ${activeName}.`,
    `Спайк держит SpikeNet под контролем, ${activeName}.`,
    `${activeName}, у SpikeNet сегодня очень хищный вайб.`
  ];
  
  randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];
  
  speechBubble.innerHTML = ""; 
  speechBubble.classList.add('show'); 
  body.classList.add('hunting-mode');
  
  let letterIdx = 0;
  const textSpan = document.createElement('span');
  const cursorSpan = document.createElement('span');
  cursorSpan.textContent = ' █';
  cursorSpan.style.animation = 'blink 0.5s infinite';
  cursorSpan.style.color = 'var(--sn-brand)';
  
  speechBubble.appendChild(textSpan);
  speechBubble.appendChild(cursorSpan);

  function typeLetter() {
    if (letterIdx < randomPhrase.length) {
      const currentChar = randomPhrase.charAt(letterIdx);
      textSpan.textContent += currentChar;
      playRetroBeepTalkSound(currentChar); 
      letterIdx++; 
      setTimeout(typeLetter, 35);
    } else { 
      cursorSpan.remove();
      isCatTyping = false;
      clearTimeout(spyBubbleTimeout);
      spyBubbleTimeout = setTimeout(() => { 
        speechBubble.classList.remove('show'); 
        body.classList.remove('hunting-mode');
      }, 6000); 
    }
  }
  typeLetter();
}

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) {
    document.documentElement.removeAttribute('data-theme');
    applySpikeTheme('night-hunt');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    applySpikeTheme('light-desk');
  }
}
function getRawConvertedPrice(p) { return p * exchangeRates[currentCurrency]; }
function formatPrice(p) { const converted = getRawConvertedPrice(p); return currentCurrency === 'USD' ? `${converted.toFixed(2)} $` : `${Math.round(converted)} ${currencySymbols[currentCurrency]}`; }

document.getElementById('market-listing-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    title: document.getElementById('market-title-input')?.value.trim(),
    category: document.getElementById('market-category-select')?.value,
    price: Number(document.getElementById('market-price-input')?.value || 0),
    description: document.getElementById('market-description-input')?.value.trim(),
    imageUrl: document.getElementById('market-image-input')?.value.trim()
  };
  try {
    const res = await fetch('/api/market/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось выставить лот', 'Marketplace', 'error');
    event.currentTarget.reset();
    showSpikeAlert('Лот выставлен.', 'Marketplace', 'success');
    switchMarketTab('lots');
    await loadMarketplace();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
});

['market-title-input', 'market-category-select', 'market-price-input', 'market-image-input', 'market-description-input'].forEach(id => {
  document.getElementById(id)?.addEventListener('input', renderMarketListingPreview);
  document.getElementById(id)?.addEventListener('change', renderMarketListingPreview);
});

function openHomeScreen() {
  document.body.classList.remove('chat-mode', 'group-mode', 'market-mode', 'admin-mode', 'social-hub-mode', 'social-hub-group-active', 'social-hub-direct-active');
  document.getElementById('spike-chat-dock')?.classList.remove('open');
  document.getElementById('lobby-panel')?.classList.remove('open');
  document.getElementById('socialSidebar')?.classList.remove('open');
  if (typeof parkGroupView === 'function') parkGroupView();
  closePrivateChat({ silent: true });
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function toggleSpikeRail() {
  const collapsed = document.body.classList.toggle('spike-rail-collapsed');
  try { localStorage.setItem('spikeRailCollapsed', collapsed ? '1' : '0'); } catch (_) {}
}

async function loadSocialHubList() {
  try {
    const res = await fetch('/api/friends/list');
    if (!res.ok) return;
    const data = await res.json();
    renderApprovedFriends(data.friends);
    renderPendingRequests(data.requests);
  } catch (err) { console.error('Ошибка загрузки списков:', err); }
}

function renderApprovedFriends(friends) {
  const container = document.getElementById('friends-list-render');
  const badge = document.getElementById('friends-count-badge');
  if (!container) return;
  badge.innerText = friends.length > 0 ? `(${friends.length})` : '';
  spikeState.friendsCount = friends.length;
  window.cachedFriendsList = friends;
  renderDirectChatsRail();
  updateSpikeDashboard();

  if (friends.length === 0) {
    container.innerHTML = `
      <div class="spike-empty-state">
        <strong>Добавь первого друга</strong>
        <span>Найди ник, отправь заявку и начни личный чат.</span>
        <button class="spike-empty-action" onclick="switchSocialTab(null, 'social-search')">
          <strong>Найти друга</strong><span>по нику или ник#тегу</span>
        </button>
      </div>`;
    return;
  }

  // Запоминаем друзей в глобальный кэш вкладки для быстрого инвайта в пати

  container.innerHTML = friends.map(f => {
    const avatar = f.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(f.username);
    
    let statusText = '';
    const currentStatus = f.current_status || 'Гейминг';
    if (currentStatus.includes('Катает в')) statusText = `<span class="sn-accent" style="font-weight:700; animation: blinker 2s linear infinite;">🎮 ${currentStatus}</span>`;
    else if (currentStatus.includes('В лобби')) statusText = `<span class="sn-accent" style="font-weight:700;">🔮 ${currentStatus}</span>`;
    else if (currentStatus === 'В сети') statusText = `<span class="sn-accent">🔵 В сети</span>`;
    else statusText = `<span class="sn-muted">⚫ ${currentStatus}</span>`;

    const friendTag = f.user_tag ? `<span class="sn-muted" style="font-size:0.75rem;">#${f.user_tag}</span>` : '';

    return `
      <div class="ps-social-user-card">
        <div class="ps-social-user-info">
          <img class="ps-social-avatar" src="${avatar}" onclick="openPublicGamerProfile(${f.id})">
          <div>
            <div class="ps-social-name" onclick="openPublicGamerProfile(${f.id})">${f.username} ${friendTag}</div>
            <div class="ps-social-status-text">${statusText}</div>
          </div>
        </div>
        <div class="ps-social-actions">
          <button class="ps-social-btn ps-social-btn-danger" onclick="removeFriendLink(${f.id})">Удалить</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderPendingRequests(requests) {
  const container = document.getElementById('requests-list-render');
  const badge = document.getElementById('requests-count-badge');
  if (!container) return;

  if (requests.length > 0) {
    badge.innerText = requests.length;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }

  if (requests.length === 0) {
    container.innerHTML = `<p class="ps-social-empty">Входящих заявок нет</p>`;
    return;
  }

  container.innerHTML = requests.map(r => {
    const avatar = r.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(r.username);
    const reqTag = r.user_tag ? `<span class="sn-muted" style="font-size:0.75rem;">#${r.user_tag}</span>` : '';
    return `
      <div class="ps-social-user-card">
        <div class="ps-social-user-info">
          <img class="ps-social-avatar" src="${avatar}" onclick="openPublicGamerProfile(${r.id})">
          <div class="ps-social-name" onclick="openPublicGamerProfile(${r.id})">${r.username} ${reqTag}</div>
        </div>
        <div class="ps-social-actions">
          <button class="ps-social-btn ps-social-btn-success" onclick="acceptFriendRequest(${r.id})">Принять</button>
          <button class="ps-social-btn ps-social-btn-danger" onclick="removeFriendLink(${r.id})">Отклонить</button>
        </div>
      </div>
    `;
  }).join('');
}

window.sendFriendRequest = async function(friendId) {
  try {
    const res = await fetch('/api/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId })
    });
    const data = await res.json();
    loadSocialHubList();
  } catch (e) { console.error(e); }
};

window.acceptFriendRequest = async function(requesterId) {
  try {
    const res = await fetch('/api/friends/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterId })
    });
    if (res.ok) {
      loadSocialHubList();
    }
  } catch (e) { console.error(e); }
};

window.removeFriendLink = async function(targetId) {
  try {
    await fetch('/api/friends/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId })
    });
    addSpikeActivity('Контакт удалён из списка друзей', 'friend');
    loadSocialHubList();
  } catch (e) { console.error(e); }
};

// --- 🎙️ ГОЛОСОВОЙ ДВИЖОК WebRTC ---
window.toggleVoiceConnect = async function() {
  if (!activeRoomToken) return alert('Сначала создай или зайди в пати-лобби!');
  const channelBtn = document.getElementById('voice-channel-main');
  document.getElementById('spike-sidebar-voice-panel')?.classList.add('active');
  
  if (isVoiceConnected) {
    disconnectFromVoiceChannels();
  } else {
    try {
      localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      isVoiceConnected = true;
      if (channelBtn) channelBtn.classList.add('connected-active');
      const controls = document.getElementById('voiceControlsPanel');
      if (controls) controls.style.display = 'flex';
      
      renderVoiceUsersList();
      socket.emit('voice-join', { roomToken: activeRoomToken, userId: currentUserId, username: currentUsername, voiceChannel: spikeState.selectedVoiceChannel });
      startVoiceActivityDetection();
      addSpikeActivity(`${currentUsername} подключился к голосу`, 'voice');
      updateVoiceStatusText();
    } catch (err) {
      console.error('Ошибка доступа к микрофону:', err);
      alert('Не удалось получить доступ к микрофону.');
    }
  }
};

function startVoiceActivityDetection() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(localAudioStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let wasSpeaking = false;

    voiceSpeechInterval = setInterval(() => {
      if (isMuted || !isVoiceConnected) return;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      let average = sum / bufferLength;
      let isSpeaking = average > 15; 
      
      if (isSpeaking !== wasSpeaking) {
        wasSpeaking = isSpeaking;
        toggleLocalAvatarSpeaking(currentUserId, isSpeaking);
        socket.emit('voice-speaking-state', { roomToken: activeRoomToken, userId: currentUserId, voiceChannel: spikeState.selectedVoiceChannel, isSpeaking });
      }
    }, 100);
  } catch (e) { console.error(e); }
}

function toggleLocalAvatarSpeaking(userId, isSpeaking) {
  const userNode = document.getElementById(`voice-user-${userId}`);
  if (userNode) {
    if (isSpeaking) userNode.classList.add('is-speaking');
    else userNode.classList.remove('is-speaking');
  }
}

function initPeerConnection(targetSocketId, userId, username, isInitiator) {
  if (peerConnections[targetSocketId]) return;

  const peer = new RTCPeerConnection(rtcConfig);
  peerConnections[targetSocketId] = peer;
  pendingIceCandidates[targetSocketId] = pendingIceCandidates[targetSocketId] || [];

  if (localAudioStream) {
    localAudioStream.getTracks().forEach(track => peer.addTrack(track, localAudioStream));
  }

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('voice-ice-candidate', { targetSocketId, candidate: event.candidate });
    }
  };

  peer.ontrack = (event) => {
    let audioEl = document.getElementById(`audio-stream-${targetSocketId}`);
    if (!audioEl) {
      audioEl = document.createElement('audio');
      audioEl.id = `audio-stream-${targetSocketId}`;
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
    }
    audioEl.srcObject = event.streams[0];
    audioEl.muted = isDeafened;
    audioEl.play?.().catch(() => {});
  };

  peer.onconnectionstatechange = () => {
    if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) {
      cleanupPeerConnection(targetSocketId);
    }
  };

  peer.oniceconnectionstatechange = () => {
    if (['failed', 'closed'].includes(peer.iceConnectionState)) {
      cleanupPeerConnection(targetSocketId);
    }
  };

  if (userId && username) {
    addVoiceUserNode(userId, username);
  }

  if (isInitiator) {
    peer.createOffer()
      .then(offer => peer.setLocalDescription(offer))
      .then(() => {
        socket.emit('voice-offer', { targetSocketId: targetSocketId, offer: peer.localDescription });
      })
      .catch(e => console.error('Ошибка создания Offer:', e));
  }
}

function cleanupPeerConnection(socketId) {
  const peer = peerConnections[socketId];
  if (peer) {
    try { peer.close(); } catch (e) {}
    delete peerConnections[socketId];
  }
  delete pendingIceCandidates[socketId];
  document.getElementById(`audio-stream-${socketId}`)?.remove();
}

function addRemoteIceCandidate(socketId, candidate) {
  if (!candidate) return;
  const peer = peerConnections[socketId];
  if (!peer) return;
  const ice = new RTCIceCandidate(candidate);
  if (!peer.remoteDescription) {
    pendingIceCandidates[socketId] = pendingIceCandidates[socketId] || [];
    pendingIceCandidates[socketId].push(ice);
    return;
  }
  peer.addIceCandidate(ice).catch(e => console.error(e));
}

function flushPendingIce(socketId) {
  const peer = peerConnections[socketId];
  const queue = pendingIceCandidates[socketId] || [];
  if (!peer || !peer.remoteDescription || !queue.length) return;
  pendingIceCandidates[socketId] = [];
  queue.forEach(candidate => peer.addIceCandidate(candidate).catch(e => console.error(e)));
}

function renderVoiceUsersList() {
  const container = document.getElementById('voice-active-users-list');
  if (container) {
    container.innerHTML = '';
    addVoiceUserNode(currentUserId, currentUsername);
  }
}

function addVoiceUserNode(userId, username) {
  const container = document.getElementById('voice-active-users-list');
  if (!container || document.getElementById(`voice-user-${userId}`)) return;

  const avatar = 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(username);
  const userHtml = `
    <div class="ps-voice-user-node" id="voice-user-${userId}" onclick="openPublicGamerProfile(${userId})">
      <div style="display:flex; align-items:center; gap:8px;">
        <img class="ps-voice-avatar-frame" src="${avatar}">
        <span>${username}</span>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', userHtml);
  updateVoiceCounter();
}

function updateVoiceCounter() {
  const container = document.getElementById('voice-active-users-list');
  if (container) {
    const count = container.children.length;
    document.getElementById('voice-counter').innerText = `(${count})`;
    const inline = document.getElementById('voice-counter-inline');
    if (inline) inline.innerText = `(${count})`;
    const sidebarCount = document.getElementById('spike-sidebar-voice-count');
    if (sidebarCount) sidebarCount.innerText = `(${count})`;
    spikeState.activeVoiceUsers = count;
    updateVoiceStatusText();
  }
}

function toggleMicrophoneMute() {
  isMuted = !isMuted;
  const btn = document.getElementById('btnToggleMute');
  if (localAudioStream) { localAudioStream.getAudioTracks().forEach(track => track.enabled = !isMuted); }
  if (isMuted) btn.classList.add('active-muted');
  else btn.classList.remove('active-muted');
  updateVoiceStatusText();
}

function toggleVoiceDeafen() {
  isDeafened = !isDeafened;
  const btn = document.getElementById('btnToggleDeafen');
  Object.keys(peerConnections).forEach(socketId => {
    const audioEl = document.getElementById(`audio-stream-${socketId}`);
    if (audioEl) audioEl.muted = isDeafened;
  });
  if (isDeafened) btn.classList.add('active-muted');
  else btn.classList.remove('active-muted');
  updateVoiceStatusText();
}

function disconnectFromVoiceChannels() {
  if (!isVoiceConnected) return;
  isVoiceConnected = false;
  clearInterval(voiceSpeechInterval);

  if (localAudioStream) { localAudioStream.getTracks().forEach(track => track.stop()); }
  if (activeRoomToken) { socket.emit('voice-leave', { roomToken: activeRoomToken, userId: currentUserId, voiceChannel: spikeState.selectedVoiceChannel }); }
  
  Object.keys(peerConnections).forEach(socketId => {
    if (peerConnections[socketId]) peerConnections[socketId].close();
    const audioEl = document.getElementById(`audio-stream-${socketId}`);
    if (audioEl) audioEl.remove();
  });
  peerConnections = {};

  document.getElementById('voice-channel-main')?.classList.remove('connected-active');
  const controls = document.getElementById('voiceControlsPanel');
  if (controls) controls.style.display = 'none';
  const voiceList = document.getElementById('voice-active-users-list');
  if (voiceList) voiceList.innerHTML = '';
  updateVoiceCounter();
  addSpikeActivity(`${currentUsername || 'Игрок'} вышел из голоса`, 'voice');
  updateVoiceStatusText();
}

// --- 👥 ГЛОБАЛЬНЫЙ ЖИВОЙ ПОИСК ГЕЙМЕРОВ ---
window.executeSocialSearchLive = function(val) {
  const container = document.getElementById('search-users-render');
  clearTimeout(socialSearchTimeout);
  
  if (val.trim().length < 2) {
    container.innerHTML = `<p class="ps-social-empty">Введите никнейм для поиска</p>`;
    return;
  }

  socialSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/friends/search?query=${encodeURIComponent(val.trim())}`);
      if (!res.ok) return;
      const users = await res.json();

      if (users.length === 0) {
        container.innerHTML = `<p class="ps-social-empty">Геймер не найден</p>`;
        return;
      }

      container.innerHTML = users.map(u => {
        const avatar = u.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(u.username);
        const searchTag = u.user_tag ? `<span class="sn-muted" style="font-weight:400;">#${u.user_tag}</span>` : '';
        return `
          <div class="ps-social-user-card">
            <div class="ps-social-user-info">
              <img class="ps-social-avatar" src="${avatar}" onclick="openPublicGamerProfile(${u.id})">
              <div class="ps-social-name" onclick="openPublicGamerProfile(${u.id})">${u.username} ${searchTag}</div>
            </div>
            <div class="ps-social-actions">
              <button class="ps-social-btn ps-social-btn-success" onclick="sendFriendRequest(${u.id})">➕ Добавить</button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {}
  }, 300);
};

// ==========================================
// ⚙️ КЛИЕНТСКИЙ ДВИЖОК ЛИЧНЫХ СООБЩЕНИЙ
// ==========================================

window.saveAllHubSettingsLive = async function() {
  const soundToggle = document.getElementById('soundToggle');
  const compactGridToggle = document.getElementById('compactGridToggle');
  const animPresetSelect = document.getElementById('animPresetSelect');
  const colorAccentSelect = document.getElementById('colorAccentSelect');
  const spikeThemeSelect = document.getElementById('spikeThemeSelect');

  if (soundToggle) window.spikeSoundEnabled = soundToggle.checked;
  
  if (animPresetSelect) {
    if (animPresetSelect.value === 'performance') document.body.classList.add('perf-mode');
    else document.body.classList.remove('perf-mode');
  }

  if (colorAccentSelect) {
    const accentColor = colorAccentSelect.value;
    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty('--accent-glow', accentColor + '40');
  }

  if (spikeThemeSelect) applySpikeTheme(spikeThemeSelect.value);

  try {
    await saveUserUiSettings();
  } catch (err) { console.error('Ошибка сохранения UI в бд:', err); }

  closeSettingsModal();
};

// Слушатели DOM контента
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (localStorage.getItem('spikeRailCollapsed') === '1') {
      document.body.classList.add('spike-rail-collapsed');
    }
  } catch (_) {}

  const saveAvatarBtn = document.getElementById('saveAvatarBtn');
  const avatarInput = document.getElementById('avatarFileInput');

  if(saveAvatarBtn && avatarInput) {
    saveAvatarBtn.addEventListener('click', async () => {
      if (!avatarInput.files?.[0]) return showSpikeAlert('Выбери файл аватарки.', 'Профиль', 'warning');

      saveAvatarBtn.disabled = true;
      saveAvatarBtn.textContent = 'Загрузка...';
      try {
        await saveSelectedProfileAvatar();
        showSpikeAlert('Аватар обновлён.', 'Профиль', 'success');
      } catch(e) {
        console.error(e);
        showSpikeAlert(e.message || 'Ошибка загрузки аватара.', 'Профиль', 'error');
      } finally {
        saveAvatarBtn.disabled = false;
        saveAvatarBtn.textContent = 'Сменить';
      }
    });
  }
});

// 🔥 ИНИЦИАЛИЗАЦИЯ КЛИЕНТСКИХ НАСТРОЕК
function applyClientSettings(user) {
  const dbAvatar = user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(user.username);
  const preview = document.getElementById('user-avatar-preview');
  const bigAv = document.getElementById('ps-big-avatar');
  
  if(preview) preview.src = dbAvatar;
  if(bigAv) bigAv.src = dbAvatar;

  const compactGridToggle = document.getElementById('compactGridToggle');
  if (compactGridToggle) compactGridToggle.checked = !!user.compact_grid;

  const soundToggle = document.getElementById('soundToggle');
  if (soundToggle) {
    soundToggle.checked = user.spike_sound !== false;
  }
  window.spikeSoundEnabled = user.spike_sound !== false;

  const colorAccentSelect = document.getElementById('colorAccentSelect');
  const accentColor = user.color_accent || '#f59e0b';
  if (colorAccentSelect) colorAccentSelect.value = accentColor;
  document.documentElement.style.setProperty('--accent', accentColor);
  document.documentElement.style.setProperty('--accent-glow', accentColor + '40');
  applySpikeTheme(spikeState.theme);
  hydrateSpikeProfileExtras();
}

// 🔥 ДВИЖОК ПУБЛИЧНЫХ ПРОФИЛЕЙ

checkUserSession();checkUserSession();

