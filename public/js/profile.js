// SpikeNet profile module.
// Profile tabs and visual extras extracted from the legacy app bundle.

function switchProfileTab(event, tabId) {
  document.querySelectorAll('.spike-profile-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.spike-profile-section').forEach(section => section.classList.remove('active'));
  event.currentTarget.classList.add('active');
  document.getElementById(tabId)?.classList.add('active');
}

function hydrateSpikeProfileExtras() {
  const banner = document.getElementById('spikeProfileBannerInput');
  const status = document.getElementById('spikeProfileStatusInput');
  const badge = document.getElementById('spikeProfileBadgeSelect');
  if (banner) banner.value = '';
  if (status) status.value = spikeState.profile.status || '';
  if (badge) badge.value = spikeState.profile.badge || '★';
  applySpikeProfileExtras();
}

function applySpikeProfileExtras() {
  const profileCard = document.querySelector('.ps-profile-card');
  if (profileCard) {
    if (spikeState.profile.banner) {
      profileCard.style.setProperty(
        'background-image',
        `linear-gradient(rgba(8,13,21,.72), rgba(8,13,21,.92)), url("${spikeState.profile.banner}")`,
        'important'
      );
      profileCard.style.setProperty('background-size', 'cover', 'important');
      profileCard.style.setProperty('background-position', 'center', 'important');
    } else {
      profileCard.style.removeProperty('background-image');
      profileCard.style.removeProperty('background-size');
      profileCard.style.removeProperty('background-position');
    }
  }
  const title = document.getElementById('ps-profile-username-title');
  if (title && currentUsername) {
    title.dataset.badge = spikeState.profile.badge || '★';
  }
  const status = document.querySelector('#profileCardOverlay .ps-profile-status');
  if (status) status.textContent = spikeState.profile.status || 'Агент сети SpikeNet';
}

function previewSelectedAvatarFile(file) {
  if (!file || !file.type?.startsWith('image/')) return;
  const previewUrl = URL.createObjectURL(file);
  setCurrentAvatar(previewUrl);
}

function previewSelectedBannerFile(file) {
  if (!file || !file.type?.startsWith('image/')) return;
  const profileCard = document.querySelector('.ps-profile-card');
  if (!profileCard) return;
  const previewUrl = URL.createObjectURL(file);
  profileCard.style.setProperty(
    'background-image',
    `linear-gradient(rgba(8,13,21,.72), rgba(8,13,21,.92)), url("${previewUrl}")`,
    'important'
  );
  profileCard.style.setProperty('background-size', 'cover', 'important');
  profileCard.style.setProperty('background-position', 'center', 'important');
}

async function saveSpikeProfileExtras() {
  const bannerInput = document.getElementById('spikeProfileBannerInput');
  const bannerFile = bannerInput?.files?.[0] || null;

  try {
    const avatarInput = document.getElementById('avatarFileInput');
    if (avatarInput?.files?.[0]) {
      await saveSelectedProfileAvatar();
    }
    if (bannerFile) {
      spikeState.profile.banner = await uploadSpikeImageFile(bannerFile, { title: 'баннера профиля' });
      bannerInput.value = '';
    }
    spikeState.profile.status = document.getElementById('spikeProfileStatusInput')?.value.trim() || '';
    spikeState.profile.badge = document.getElementById('spikeProfileBadgeSelect')?.value || '★';
    persistSpikeState();
    applySpikeProfileExtras();
    showSpikeAlert('Профиль сохранён.', 'Профиль', 'success');
  } catch (err) {
    console.error(err);
    showSpikeAlert(err.message || 'Не удалось сохранить профиль.', 'Профиль', 'error');
  }
}

// Public player profile.

window.openPublicGamerProfile = async function(targetUserId) {
  if (targetUserId == currentUserId) return openProfileCard(); 
  
  const overlay = document.getElementById('publicGamerProfileOverlay');
  const trustRender = document.getElementById('ps-market-trust-render');
  
  trustRender.innerHTML = `<p class="sn-empty ps-social-empty" style="padding:15px 0;">Загружаем market trust...</p>`;
  overlay.classList.add('active');

  try {
    const res = await fetch(`/api/users/profile/${targetUserId}`);
    if (!res.ok) return trustRender.innerHTML = `<p class="sn-empty ps-social-empty">Ошибка загрузки профиля.</p>`;
    const data = await res.json();

    const targetTagSuffix = data.user.user_tag ? ` <span style="color:var(--text-muted); font-weight:400; font-size:0.95rem;">#${data.user.user_tag}</span>` : '';
    document.getElementById('ps-pub-avatar').src = data.user.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(data.user.username);
    document.getElementById('ps-pub-username-title').innerHTML = `${data.user.username}${targetTagSuffix}`;
    const stats = data.marketStats || {};
    document.getElementById('ps-pub-market-count').innerText = Number(stats.total_deals || 0);

    const statusEl = document.getElementById('ps-pub-live-status');
    const status = data.user.current_status || 'Гейминг';
    if (status.includes('Катает в')) statusEl.innerHTML = `<span class="sn-accent" style="font-weight:700;">🎮 ${status}</span>`;
    else if (status.includes('В лобби')) statusEl.innerHTML = `<span class="sn-accent" style="font-weight:700;">🔮 ${status}</span>`;
    else statusEl.innerHTML = `<span class="sn-muted">⚫ ${status}</span>`;

    const listings = Array.isArray(data.activeListings) ? data.activeListings : [];
    if (!listings.length) {
      trustRender.innerHTML = `
        <div class="sn-empty ps-social-empty">
          Сделок: ${Number(stats.total_deals || 0)} · Успешных: ${Number(stats.completed_deals || 0)}<br>
          Активных лотов пока нет.
        </div>
      `;
    } else {
      trustRender.innerHTML = listings.map(listing => `
        <button class="ps-radar-game-item" onclick="openMarketProductPage(${Number(listing.id)})">
          <div class="ps-radar-game-title">${escapeHtml(listing.title)} · ${Number(listing.price || 0)} SPK</div>
        </button>
      `).join('');
    }
  } catch (err) { trustRender.innerHTML = `<p class="sn-empty ps-social-empty">Ошибка связи</p>`; }
};

window.closePublicProfileCard = function() {
  document.getElementById('publicGamerProfileOverlay').classList.remove('active');
};

// 🔥 МОДУЛЬ УПРАВЛЕНИЯ СКУАД-ИНВАЙТАМИ ДРУЗЕЙ В ПОСТОЯННУЮ КОМНАТУ


