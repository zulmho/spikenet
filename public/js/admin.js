// SpikeNet admin/moderation module.
// Extracted from the legacy app bundle; still uses shared global app state until the next refactor pass.

function openAdminCenter() {
  if (!canOpenAdminCenter()) return alert('Нет доступа к Admin Center');
  document.body.classList.remove('chat-mode', 'group-mode', 'market-mode', 'social-hub-mode', 'social-hub-group-active', 'social-hub-direct-active');
  document.body.classList.add('admin-mode');
  document.getElementById('spike-chat-dock')?.classList.remove('open');
  document.getElementById('lobby-panel')?.classList.remove('open');
  document.getElementById('socialSidebar')?.classList.remove('open');
  if (typeof parkGroupView === 'function') parkGroupView();
  closePrivateChat({ silent: true });
  loadAdminOverview();
  requestAnimationFrame(() => document.getElementById('spike-admin-center')?.scrollIntoView({ block: 'start' }));
}

async function loadAdminOverview() {
  if (!canOpenAdminCenter()) return;
  try {
    const [overviewRes, moderationRes] = await Promise.all([
      fetch('/api/admin/overview'),
      fetch('/api/admin/moderation-center')
    ]);
    const data = await overviewRes.json().catch(() => ({}));
    const moderationData = await moderationRes.json().catch(() => ({}));
    if (!overviewRes.ok) return alert(data.error || 'Не удалось загрузить админку');
    adminState = {
      loaded: true,
      roles: Array.isArray(data.roles) ? data.roles : [],
      users: Array.isArray(data.users) ? data.users : [],
      reports: Array.isArray(data.reports) ? data.reports : [],
      audit: Array.isArray(data.audit) ? data.audit : [],
      moderation: moderationRes.ok ? normalizeAdminModerationCenter(moderationData) : {
        loaded: false,
        summary: {},
        disputes: [],
        reports: [],
        suspiciousTrades: [],
        newSellers: [],
        audit: []
      }
    };
    currentUserRoles = adminState.roles.length ? adminState.roles : currentUserRoles;
    updateAdminAccessUi();
    renderAdminCenter();
  } catch (err) {
    console.error('Admin load failed:', err);
    alert('Ошибка загрузки Admin Center');
  }
}

function normalizeAdminModerationCenter(data = {}) {
  return {
    loaded: true,
    summary: data.summary || {},
    disputes: Array.isArray(data.disputes) ? data.disputes : [],
    reports: Array.isArray(data.reports) ? data.reports : [],
    suspiciousTrades: Array.isArray(data.suspiciousTrades) ? data.suspiciousTrades : [],
    newSellers: Array.isArray(data.newSellers) ? data.newSellers : [],
    audit: Array.isArray(data.audit) ? data.audit : []
  };
}

async function loadAdminModerationCenter() {
  if (!canOpenAdminCenter()) return;
  try {
    const res = await fetch('/api/admin/moderation-center');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось загрузить модцентр', 'Admin Center', 'error');
    adminState.moderation = normalizeAdminModerationCenter(data);
    renderAdminCenter();
  } catch (err) {
    showSpikeAlert('Ошибка загрузки модцентра', 'Admin Center', 'error');
  }
}

function adminRoleLabel(role) {
  if (role === 'admin') return 'admin';
  if (role === 'support') return 'support';
  if (role === 'market_moderator') return 'market mod';
  return role;
}

function getAdminUserRoles(user) {
  const roles = Array.isArray(user.roles) ? [...user.roles] : [];
  if (Number(user.id) === 1) {
    ['admin', 'support', 'market_moderator'].forEach(role => {
      if (!roles.includes(role)) roles.push(role);
    });
  }
  return roles;
}

function isAdminUserMuted(user) {
  return user.muted_until && new Date(user.muted_until) > new Date();
}

function renderAdminCenter() {
  const usersList = document.getElementById('admin-users-list');
  const reportsList = document.getElementById('admin-reports-list');
  const auditList = document.getElementById('admin-audit-list');
  if (!usersList || !reportsList || !auditList) return;

  const query = String(document.getElementById('admin-user-search')?.value || '').trim().toLowerCase();
  const users = adminState.users.filter(user => {
    if (!query) return true;
    return String(user.id).includes(query) || String(user.username || '').toLowerCase().includes(query);
  });
  const banned = adminState.users.filter(user => user.is_banned).length;
  const muted = adminState.users.filter(isAdminUserMuted).length;
  const openReports = adminState.reports.filter(report => ['open', 'reviewing'].includes(report.status)).length;

  document.getElementById('admin-stat-users').textContent = String(adminState.users.length);
  document.getElementById('admin-stat-banned').textContent = String(banned);
  document.getElementById('admin-stat-muted').textContent = String(muted);
  document.getElementById('admin-stat-reports').textContent = String(openReports);

  if (!adminState.loaded) {
    usersList.innerHTML = '<div class="sn-card spike-market-trade">Загрузка Admin Center...</div>';
    reportsList.innerHTML = '';
    auditList.innerHTML = '';
    return;
  }

  usersList.innerHTML = users.length
    ? users.map(renderAdminUserCard).join('')
    : '<div class="sn-card spike-market-trade">Пользователей под этот поиск нет.</div>';

  reportsList.innerHTML = adminState.reports.length
    ? adminState.reports.map(report => `
      <div class="sn-card spike-market-trade ${['open', 'reviewing'].includes(report.status) ? 'disputed' : ''}">
        <strong>#${report.id} · ${escapeHtml(report.target_username || 'unknown')}</strong> · ${escapeHtml(report.status)}
        <div class="spike-market-subtle">от ${escapeHtml(report.reporter_username || 'unknown')}</div>
        <div>${escapeHtml(report.reason || '')}</div>
        ${report.context ? `<div class="spike-market-hash">${escapeHtml(report.context)}</div>` : ''}
        ${report.resolution ? `<div class="sn-card-muted spike-market-protect" style="margin-top:7px;">${escapeHtml(report.resolution)}</div>` : ''}
        <div class="spike-admin-actions" style="margin-top:7px;">
          <button class="sn-btn spike-mini-btn social-action-btn" onclick="updateAdminReport(${report.id}, 'reviewing')">reviewing</button>
          <button class="sn-btn spike-mini-btn social-action-btn" onclick="updateAdminReport(${report.id}, 'resolved')">resolved</button>
          <button class="sn-btn spike-mini-btn social-action-btn" onclick="updateAdminReport(${report.id}, 'dismissed')">dismiss</button>
        </div>
      </div>
    `).join('')
    : '<div class="sn-card spike-market-trade">Жалоб пока нет.</div>';

  auditList.innerHTML = adminState.audit.length
    ? adminState.audit.map(item => `
      <div class="sn-card spike-market-trade">
        <strong>${escapeHtml(item.action || 'action')}</strong>
        <div class="spike-market-subtle">${escapeHtml(item.actor_username || 'system')} -> ${escapeHtml(item.target_username || 'none')}</div>
        <span class="spike-market-hash">${escapeHtml(new Date(item.created_at).toLocaleString())}</span>
      </div>
    `).join('')
    : '<div class="sn-card spike-market-trade">Журнал пока пуст.</div>';

  renderAdminModerationCenter();
}

function setModStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value || 0);
}

function renderAdminModerationCenter() {
  const mod = adminState.moderation || {};
  const disputes = mod.disputes || [];
  const reports = mod.reports || [];
  const suspicious = mod.suspiciousTrades || [];
  const sellers = mod.newSellers || [];
  const audit = mod.audit || [];
  const openDisputes = disputes.filter(item => item.status === 'open').length;
  const openReports = reports.filter(item => ['open', 'reviewing'].includes(item.status)).length;
  const riskyTrades = suspicious.filter(item => Number(item.risk_score || 0) > 0).length;

  setModStat('mod-stat-disputes', openDisputes);
  setModStat('mod-stat-reports', openReports);
  setModStat('mod-stat-suspicious', riskyTrades);
  setModStat('mod-stat-sellers', sellers.length);
  setModStat('mod-stat-audit', audit.length);
  setModStat('mod-chip-disputes', openDisputes);
  setModStat('mod-chip-reports', openReports);
  setModStat('mod-chip-suspicious', riskyTrades);
  setModStat('mod-chip-sellers', sellers.length);
  setModStat('mod-chip-audit', audit.length);

  const disputesList = document.getElementById('mod-disputes-list');
  const reportsList = document.getElementById('mod-reports-list');
  const suspiciousList = document.getElementById('mod-suspicious-list');
  const sellersList = document.getElementById('mod-sellers-list');
  const auditList = document.getElementById('mod-audit-list');
  if (!disputesList || !reportsList || !suspiciousList || !sellersList || !auditList) return;

  if (!mod.loaded) {
    disputesList.innerHTML = '<div class="spike-mod-item">Нет доступа или пульт ещё не загружен.</div>';
    reportsList.innerHTML = '';
    suspiciousList.innerHTML = '';
    sellersList.innerHTML = '';
    auditList.innerHTML = '';
    return;
  }

  disputesList.innerHTML = disputes.length ? disputes.slice(0, 8).map(dispute => `
    <div class="sn-card spike-mod-item ${dispute.status === 'open' ? 'risky' : ''}">
      <strong>#${dispute.id} · ${escapeHtml(dispute.title || 'Лот')}</strong>
      <div class="spike-market-subtle">${escapeHtml(dispute.buyer_username || 'buyer')} -> ${escapeHtml(dispute.seller_username || 'seller')} · ${Math.round(Number(dispute.price || 0))} SPK</div>
      <div>${escapeHtml(String(dispute.reason || '').slice(0, 110))}</div>
      <div class="spike-mod-actions">
        <button class="sn-btn spike-mini-btn social-action-btn" onclick="openModerationTrade(${dispute.trade_id})">Сделка</button>
        ${dispute.status === 'open' ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="resolveMarketDispute(${dispute.id}, 'refund_buyer').then(loadAdminModerationCenter)">Refund</button>
        <button class="sn-btn spike-mini-btn social-action-btn" onclick="resolveMarketDispute(${dispute.id}, 'pay_seller').then(loadAdminModerationCenter)">Pay seller</button>` : `<span class="sn-badge spike-market-chip">${escapeHtml(dispute.status)}</span>`}
      </div>
      <span class="spike-market-hash">${Number(dispute.evidence_count || 0)} evidence · ${Number(dispute.event_count || 0)} events</span>
    </div>
  `).join('') : '<div class="spike-mod-item">Открытых споров нет.</div>';

  reportsList.innerHTML = reports.length ? reports.slice(0, 8).map(report => `
    <div class="sn-card spike-mod-item ${['open', 'reviewing'].includes(report.status) ? 'risky' : ''}">
      <strong>#${report.id} · ${escapeHtml(report.target_username || 'unknown')}</strong>
      <div class="spike-market-subtle">от ${escapeHtml(report.reporter_username || 'unknown')} · ${escapeHtml(report.status)}</div>
      <div>${escapeHtml(String(report.reason || '').slice(0, 120))}</div>
      <div class="spike-mod-actions">
        <button class="sn-btn spike-mini-btn social-action-btn" onclick="updateAdminReport(${report.id}, 'reviewing')">Взять</button>
        <button class="sn-btn spike-mini-btn social-action-btn" onclick="updateAdminReport(${report.id}, 'resolved')">Закрыть</button>
        <button class="sn-btn spike-mini-btn social-action-btn" onclick="updateAdminReport(${report.id}, 'dismissed')">Отклонить</button>
      </div>
    </div>
  `).join('') : '<div class="spike-mod-item">Жалоб нет.</div>';

  suspiciousList.innerHTML = suspicious.length ? suspicious.slice(0, 8).map(trade => `
    <div class="sn-card spike-mod-item ${Number(trade.risk_score || 0) > 0 ? 'risky' : ''}">
      <strong>#${trade.id} · ${escapeHtml(trade.title || 'Сделка')}</strong>
      <div class="spike-market-subtle">${Math.round(Number(trade.price || 0))} SPK · pending ${Number(trade.pending_hours || 0).toFixed(1)}h · risk ${Number(trade.risk_score || 0)}</div>
      <div>${escapeHtml(trade.buyer_username || 'buyer')} -> ${escapeHtml(trade.seller_username || 'seller')}</div>
      <div class="spike-mod-actions">
        <button class="sn-btn spike-mini-btn social-action-btn" onclick="openModerationTrade(${trade.id})">Открыть</button>
        <button class="sn-btn spike-mini-btn social-action-btn" onclick="openMarketSellerProfile(${trade.seller_id}, '${encodeURIComponent(trade.seller_username || 'seller')}')">Продавец</button>
      </div>
    </div>
  `).join('') : '<div class="spike-mod-item">Подозрительных сделок нет.</div>';

  sellersList.innerHTML = sellers.length ? sellers.slice(0, 8).map(seller => `
    <div class="spike-mod-item">
      <strong>${escapeHtml(seller.seller_username || 'seller')}</strong>
      <div class="spike-market-subtle">${Number(seller.active_listings || 0)} лотов · ${Number(seller.completed_trades || 0)} done · ${Number(seller.dispute_count || 0)} disputes</div>
      <div class="spike-mod-actions">
        <button class="sn-btn spike-mini-btn social-action-btn" onclick="openMarketSellerProfile(${seller.seller_id}, '${encodeURIComponent(seller.seller_username || 'seller')}')">Профиль</button>
        <button class="sn-btn spike-mini-btn social-action-btn" onclick="openTradeChat(${seller.seller_id}, '${encodeURIComponent(seller.seller_username || 'seller')}')">Написать</button>
      </div>
    </div>
  `).join('') : '<div class="spike-mod-item">Новых продавцов нет.</div>';

  auditList.innerHTML = audit.length ? audit.slice(0, 10).map(item => `
    <div class="spike-mod-item">
      <strong>${escapeHtml(item.action || 'action')}</strong>
      <div class="spike-market-subtle">${escapeHtml(item.actor_username || 'system')} -> ${escapeHtml(item.target_username || 'none')}</div>
      <span class="spike-market-hash">${escapeHtml(new Date(item.created_at).toLocaleString())}</span>
    </div>
  `).join('') : '<div class="spike-mod-item">Логов пока нет.</div>';
}

async function openModerationTrade(tradeId) {
  await loadMarketplace();
  openMarketDealRoom(tradeId);
}

function renderAdminUserCard(user) {
  const roles = getAdminUserRoles(user);
  const roleSet = new Set(roles);
  const muted = isAdminUserMuted(user);
  const avatar = escapeHtmlAttr(user.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.username || 'user')}`);
  const canEditRoles = isCurrentUserAdmin();
  const roleToggles = ['admin', 'support', 'market_moderator'].map(role => `
    <label class="spike-admin-role-toggle" title="${role === 'admin' ? 'полный доступ' : role === 'support' ? 'жалобы, баны и муты' : 'споры маркета'}">
      <input type="checkbox"
        ${roleSet.has(role) ? 'checked' : ''}
        ${canEditRoles && !(Number(user.id) === 1 && role === 'admin') ? '' : 'disabled'}
        onchange="updateAdminRole(${user.id}, '${role}', this.checked)">
      ${adminRoleLabel(role)}
    </label>
  `).join('');

  const statusChips = [
    user.is_banned ? '<span class="sn-badge spike-market-chip">banned</span>' : '',
    muted ? '<span class="sn-badge spike-market-chip">muted</span>' : '',
    user.open_reports ? `<span class="sn-badge spike-market-chip">${user.open_reports} reports</span>` : ''
  ].join('');

  return `
    <div class="sn-card spike-admin-user-card">
      <div class="spike-admin-user-top">
        <div class="spike-admin-user-main">
          <img class="sn-avatar spike-admin-avatar" src="${avatar}">
          <div style="min-width:0;">
            <strong>${escapeHtml(user.username || 'user')} <span class="spike-market-subtle">#${escapeHtml(user.user_tag || user.id)}</span></strong>
            <div class="spike-market-subtle">id ${user.id} · ${escapeHtml(user.current_status || 'offline')}</div>
          </div>
        </div>
        <div class="spike-admin-actions">${statusChips}</div>
      </div>
      <div class="spike-admin-role-row">${roleToggles}</div>
      <div class="spike-admin-actions">
        ${user.is_banned
          ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="runAdminModeration(${user.id}, 'unban')">Unban</button>`
          : `<button class="sn-btn spike-mini-btn social-action-btn" onclick="runAdminModeration(${user.id}, 'ban')">Ban</button>`}
        ${muted
          ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="runAdminModeration(${user.id}, 'unmute')">Unmute</button>`
          : `<button class="sn-btn spike-mini-btn social-action-btn" onclick="runAdminModeration(${user.id}, 'mute')">Mute</button>`}
        <button class="sn-btn spike-mini-btn social-action-btn" onclick="openPublicGamerProfile(${user.id})">Профиль</button>
      </div>
      ${(user.ban_reason || user.mute_reason)
        ? `<div class="spike-market-subtle">${escapeHtml(user.ban_reason || user.mute_reason)}</div>`
        : ''}
    </div>
  `;
}

async function updateAdminRole(userId, role, enabled) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, enabled })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Не удалось обновить роль');
    await loadAdminOverview();
  } catch (err) {
    alert('Ошибка обновления роли');
  }
}

async function runAdminModeration(userId, action) {
  let reason = '';
  let minutes = 60;
  if (action === 'ban' || action === 'mute') {
    reason = prompt(action === 'ban' ? 'Причина бана' : 'Причина мута') || '';
  }
  if (action === 'mute') {
    minutes = Number(prompt('На сколько минут мут?', '60') || 60);
  }
  if ((action === 'ban' || action === 'unban') && !confirm(`${action} пользователя id ${userId}?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${userId}/moderation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason, minutes })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Не удалось применить действие');
    await loadAdminOverview();
  } catch (err) {
    alert('Ошибка модерации');
  }
}

async function updateAdminReport(reportId, status) {
  const resolution = ['resolved', 'dismissed'].includes(status)
    ? (prompt('Комментарий по жалобе') || '')
    : '';
  try {
    const res = await fetch(`/api/admin/reports/${reportId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, resolution })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || 'Не удалось обновить жалобу');
    await loadAdminOverview();
  } catch (err) {
    alert('Ошибка обновления жалобы');
  }
}


