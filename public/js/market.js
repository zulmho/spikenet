// SpikeNet marketplace module.
// Extracted from the legacy app bundle; still uses the shared global app state until the next refactor pass.

async function loadMarketplace() {
  try {
    const res = await fetch('/api/market/overview');
    if (!res.ok) return;
    marketState = await res.json();
    marketState.listings = enrichMarketListings(marketState.listings || []);
    if (marketState.isMarketModerator === true) {
      marketModerationState.allowed = true;
      if (!currentUserRoles.includes('market_moderator')) currentUserRoles.push('market_moderator');
    }
    renderMarketplace();
    if (typeof updateSpikeDashboard === 'function') updateSpikeDashboard();
  } catch (err) {
    console.error('Marketplace load failed:', err);
  }
}

function openMarketScreen() {
  document.body.classList.remove('chat-mode', 'group-mode', 'market-mode', 'admin-mode', 'social-hub-mode', 'social-hub-group-active', 'social-hub-direct-active');
  document.getElementById('spike-chat-dock')?.classList.remove('open');
  document.getElementById('lobby-panel')?.classList.remove('open');
  document.getElementById('socialSidebar')?.classList.remove('open');
  if (typeof parkGroupView === 'function') parkGroupView();
  closePrivateChat({ silent: true });
  loadMarketplace();
  requestAnimationFrame(() => document.getElementById('spike-marketplace')?.scrollIntoView({ block: 'start' }));
}

function openSellMarketTab() {
  openMarketScreen();
  switchMarketTab('sell');
  requestAnimationFrame(() => document.querySelector('[data-market-view="sell"]')?.scrollIntoView({ block: 'start' }));
}

function openWalletMarketTab() {
  openMarketScreen();
  switchMarketTab('wallet');
  requestAnimationFrame(() => document.querySelector('[data-market-view="wallet"]')?.scrollIntoView({ block: 'start' }));
}

function openPurchasesMarketTab() {
  openMarketScreen();
  switchMarketTab('purchases');
  requestAnimationFrame(() => document.querySelector('[data-market-view="trades"]')?.scrollIntoView({ block: 'start' }));
}

function renderMarketplace() {
  const walletBalance = document.getElementById('market-wallet-balance');
  const walletLocked = document.getElementById('market-wallet-locked');
  const walletFree = document.getElementById('market-wallet-free');
  const headerWalletBalance = document.getElementById('header-wallet-balance');
  const ledgerCount = document.getElementById('market-ledger-count');
  const statListings = document.getElementById('market-stat-listings');
  const statTrades = document.getElementById('market-stat-trades');
  const listingsGrid = document.getElementById('market-listings-grid');
  const visibleListingsCount = document.getElementById('market-visible-listings-count');
  const tradesList = document.getElementById('market-trades-list');
  const ledgerList = document.getElementById('market-ledger-list');
  const paymentRequestsList = document.getElementById('market-payment-requests-list');
  const myListingsList = document.getElementById('market-my-listings-list');
  const actionCenter = document.getElementById('market-action-center');
  const pendingCount = document.getElementById('market-trades-pending-count');
  const disputeCount = document.getElementById('market-trades-dispute-count');
  const completedCount = document.getElementById('market-trades-completed-count');
  const cancelledCount = document.getElementById('market-trades-cancelled-count');
  const tradesSubtitle = document.getElementById('market-trades-subtitle');
  const balance = Number(marketState.wallet?.balance || 0);
  const locked = Number(marketState.wallet?.locked_balance || 0);
  if (walletBalance) walletBalance.textContent = Math.round(Number(marketState.wallet?.balance || 0));
  if (walletLocked) walletLocked.textContent = Math.round(Number(marketState.wallet?.locked_balance || 0));
  if (walletFree) walletFree.textContent = `${Math.round(balance)} SPK`;
  if (headerWalletBalance) headerWalletBalance.textContent = `${Math.round(balance)} SPK`;
  if (ledgerCount) ledgerCount.textContent = String(marketState.ledger?.length || 0);
  if (statListings) statListings.textContent = String(marketState.listings?.length || 0);
  if (statTrades) statTrades.textContent = String(marketState.trades?.length || 0);
  const tradeStats = getMarketTradeStats();
  if (pendingCount) pendingCount.textContent = String(tradeStats.pending);
  if (disputeCount) disputeCount.textContent = String(tradeStats.dispute);
  if (completedCount) completedCount.textContent = String(tradeStats.completed);
  if (cancelledCount) cancelledCount.textContent = String(tradeStats.cancelled);
  if (tradesSubtitle) tradesSubtitle.textContent = getMarketTradesSubtitle();
  syncMarketChrome();
  updateMarketExchangeFilterOptions();
  renderMarketListingPreview();
  renderMarketActionCenter(actionCenter);

  if (listingsGrid) {
    const listings = getVisibleMarketListings();
    if (visibleListingsCount) visibleListingsCount.textContent = String(listings.length);
    if (!listings.length) {
      listingsGrid.innerHTML = `
        <div class="sn-card spike-market-card">
          <div class="spike-market-card-top">
            <span class="sn-badge spike-market-chip">empty</span>
            <span class="sn-badge spike-market-chip">Spike Protect</span>
          </div>
          <h4>Биржа ждёт первый лот</h4>
          <div class="spike-market-subtle">Выставь ключ, предмет, услугу или аккаунт. Покупка пойдёт через escrow.</div>
          <div class="spike-market-card-actions">
            <button class="sn-btn spike-mini-btn social-action-btn" onclick="switchMarketTab('sell')">Выставить лот</button>
            <button class="sn-btn spike-mini-btn social-action-btn" onclick="resetMarketExchangeFilters()">Сбросить фильтры</button>
          </div>
        </div>`;
    } else {
      listingsGrid.innerHTML = listings.map(listing => {
        const mine = Number(listing.seller_id) === Number(currentUserId);
        const action = mine
          ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="cancelMarketListing(${listing.id})">Снять</button>`
          : `<button class="sn-btn spike-mini-btn social-action-btn" onclick="openMarketProductPage(${listing.id})">Открыть</button>`;
        const watchAction = listing.watched_by_me
          ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="unwatchMarketListing(${listing.id})">Убрать</button>`
          : `<button class="sn-btn spike-mini-btn social-action-btn" onclick="watchMarketListing(${listing.id})">Сохранить</button>`;
        const sellerName = encodeURIComponent(listing.seller_username || 'Spike trader');
        const verifiedBadge = isMarketSellerVerified(listing)
          ? '<span class="sn-badge spike-market-chip">verified</span>'
          : '';
        const marketGame = listing.market_game || inferMarketGame(listing);
        const marketRegion = listing.market_region || inferMarketRegion(listing);
        return `
          <div class="sn-card spike-market-card spike-listing-card">
            ${renderListingImage(listing.image_url, listing.title, listing.category)}
            <div class="spike-market-card-top">
              ${renderMarketCategoryBadge(listing.category)}
              <span class="sn-badge spike-market-chip">${listing.watched_by_me ? 'saved' : 'escrow'}</span>
              ${verifiedBadge}
            </div>
            <h4 style="cursor:pointer;" onclick="openMarketProductPage(${listing.id})">${escapeHtml(listing.title)}</h4>
            <div class="spike-listing-price-row">
              <span class="spike-market-price">${Math.round(Number(listing.price || 0))} SPK</span>
              <span class="sn-badge spike-market-chip">${Math.round(Number(listing.seller_success_rate || 0))}% success</span>
              ${renderRiskBadge(listing.seller_risk_score || 0)}
            </div>
            <div class="spike-market-card-top">
              <span class="sn-badge spike-market-chip">${escapeHtml(marketGame === 'other' ? 'other game' : marketGame)}</span>
              <span class="sn-badge spike-market-chip">${escapeHtml(marketRegion)}</span>
              <span class="sn-badge spike-market-chip">${Number(listing.watch_count || 0)} saved</span>
            </div>
            <div class="spike-market-subtle">${escapeHtml(listing.description || 'без описания')}</div>
            <div class="spike-listing-seller-row">
              <img src="${escapeHtml(listing.seller_avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${sellerName}`)}" alt="">
              <div>
                <strong>${escapeHtml(listing.seller_username || 'Spike trader')}</strong>
                <span>${renderSellerRating(listing)} · ${Number(listing.seller_total_trades || 0)} сделок</span>
              </div>
            </div>
            <div class="spike-market-card-actions">
              <button class="sn-btn spike-mini-btn social-action-btn" onclick="openMarketSellerProfile(${listing.seller_id}, '${sellerName}')">Профиль</button>
              ${watchAction}
              ${action}
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (tradesList) {
    const trades = getVisibleMarketTrades();
    if (!trades.length) {
      tradesList.innerHTML = `<div class="sn-card spike-market-trade">${escapeHtml(getMarketTradesEmptyText())}</div>`;
    } else {
      tradesList.innerHTML = trades.map(trade => `
        <div class="sn-card spike-market-trade ${trade.dispute_status ? 'disputed' : ''}">
          <div class="spike-market-card-top">
            <span class="sn-badge spike-market-chip">${escapeHtml(getTradeRoleLabel(trade))}</span>
            <span class="sn-badge spike-market-chip">${escapeHtml(formatSellerDate(trade.created_at))}</span>
          </div>
          <strong>${escapeHtml(trade.title || 'Лот')}</strong> · ${Math.round(Number(trade.price || 0))} SPK · ${renderMarketStatusLabel(trade.status)}
          <div>${escapeHtml(trade.buyer_username || 'buyer')} -> ${escapeHtml(trade.seller_username || 'seller')}</div>
          ${renderTradeTimeline(trade)}
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:7px;">
            <button class="sn-btn spike-mini-btn social-action-btn" onclick="openMarketDealRoom(${trade.id})">Открыть</button>
            ${trade.dispute_status ? `<span class="sn-badge spike-market-chip">dispute: ${escapeHtml(trade.dispute_status)}</span>` : ''}
          </div>
          <span class="spike-market-hash">${escapeHtml(trade.trade_hash || '')}</span>
        </div>
      `).join('');
    }
  }

  if (ledgerList) {
    if (!marketState.ledger?.length) {
      ledgerList.innerHTML = `<div class="sn-card spike-market-trade">Операций пока нет.</div>`;
    } else {
      ledgerList.innerHTML = marketState.ledger.map(entry => {
        const amount = Number(entry.amount || 0);
        const sign = amount > 0 ? '+' : '';
        const amountClass = amount >= 0 ? '#5eead4' : '#fca5a5';
        return `
          <div class="sn-card spike-market-trade">
            <strong>${escapeHtml(renderLedgerType(entry.type))}</strong>
            <span style="color:${amountClass}; font-weight:900;">${sign}${Math.round(amount)} SPK</span>
            <div class="spike-market-subtle">${escapeHtml(entry.note || '')}</div>
            <span class="spike-market-hash">balance ${Math.round(Number(entry.balance_after || 0))} · escrow ${Math.round(Number(entry.locked_after || 0))}</span>
          </div>
        `;
      }).join('');
    }
  }

  if (paymentRequestsList) {
    const requests = marketState.paymentRequests || [];
    if (!requests.length) {
      paymentRequestsList.innerHTML = `<div class="sn-card spike-market-trade">Платёжных заявок пока нет.</div>`;
    } else {
      paymentRequestsList.innerHTML = requests.map(request => `
        <div class="sn-card spike-market-trade">
          <strong>${escapeHtml(renderPaymentType(request.type))} · ${Math.round(Number(request.amount || 0))} SPK</strong>
          ${renderPaymentStatus(request.status)}
          <div class="spike-market-subtle">
            ${escapeHtml(request.type === 'withdrawal' ? (request.destination || 'адрес вывода не указан') : (request.reference || request.provider || 'ручное пополнение'))}
          </div>
          <div class="spike-market-subtle">
            ${escapeHtml(request.provider || 'manual')} · ${escapeHtml(request.provider_status || 'pending')}
            ${request.provider_payment_id ? ` · ${escapeHtml(request.provider_payment_id)}` : ''}
          </div>
          ${request.provider_checkout_url ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="window.open('${escapeHtml(request.provider_checkout_url)}', '_blank', 'noopener')">Открыть оплату</button>` : ''}
          ${request.moderator_note ? `<div class="spike-ticket-warning">${escapeHtml(request.moderator_note)}</div>` : ''}
          <span class="spike-market-hash">${escapeHtml(new Date(request.created_at).toLocaleString())}${request.processed_by_username ? ` · ${escapeHtml(request.processed_by_username)}` : ''}</span>
        </div>
      `).join('');
    }
  }

  if (myListingsList) {
    if (!marketState.myListings?.length) {
      myListingsList.innerHTML = `<div class="sn-card spike-market-trade">Ты ещё не выставлял лоты.</div>`;
    } else {
      myListingsList.innerHTML = marketState.myListings.map(listing => `
        <div class="sn-card spike-market-trade">
          <strong>${escapeHtml(listing.title || 'Лот')}</strong> · ${Math.round(Number(listing.price || 0))} SPK · ${renderMarketStatusLabel(listing.status)}
          <div class="spike-market-subtle">${escapeHtml(renderMarketCategory(listing.category))} · ${escapeHtml(listing.description || 'без описания')}</div>
          ${listing.status === 'active'
            ? `<button class="sn-btn spike-mini-btn social-action-btn" style="margin-top:7px;" onclick="cancelMarketListing(${listing.id})">Снять</button>`
            : ''}
        </div>
      `).join('');
    }
  }
}

function getMarketListingText(listing) {
  return `${listing?.title || ''} ${listing?.description || ''}`.toLowerCase();
}

function inferMarketGame(listing) {
  const text = getMarketListingText(listing);
  const games = [
    ['cs2', ['cs2', 'counter-strike', 'counter strike', 'кс2']],
    ['dota 2', ['dota', 'дота']],
    ['valorant', ['valorant', 'валорант']],
    ['fortnite', ['fortnite', 'фортнайт']],
    ['minecraft', ['minecraft', 'майнкрафт']],
    ['roblox', ['roblox', 'роблокс']],
    ['steam', ['steam', 'стим']],
    ['xbox', ['xbox']],
    ['playstation', ['playstation', 'psn', 'ps5', 'ps4']]
  ];
  const found = games.find(([, aliases]) => aliases.some(alias => text.includes(alias)));
  return found ? found[0] : 'other';
}

function inferMarketRegion(listing) {
  const text = getMarketListingText(listing);
  const compact = ` ${text.replace(/[()[\],.;:]/g, ' ')} `;
  const regions = [
    ['RU', [' ru ', ' russia ', ' россия ', ' рус ', ' снг ', ' cis ']],
    ['EU', [' eu ', ' europe ', ' европа ']],
    ['NA', [' na ', ' usa ', ' us ', ' america ', ' сша ']],
    ['TR', [' tr ', ' turkey ', ' турция ']],
    ['GLOBAL', [' global ', ' worldwide ', ' world ', ' глобал ', ' весь мир ']]
  ];
  const found = regions.find(([, aliases]) => aliases.some(alias => compact.includes(alias)));
  return found ? found[0] : 'GLOBAL';
}

function isMarketSellerVerified(listing) {
  if (listing.seller_manual_flag === 'verified') return true;
  if (['risky', 'blocked'].includes(listing.seller_manual_flag)) return false;
  const completed = Number(listing.seller_completed_trades || 0);
  const rating = Number(listing.seller_rating || 0);
  const success = Number(listing.seller_success_rate || 0);
  const disputes = Number(listing.seller_dispute_count || 0);
  return listing.seller_verified === true
    || listing.seller_verified === 'true'
    || (completed >= 5 && rating >= 4.5 && success >= 85 && disputes <= 1);
}

function enrichMarketListings(listings = []) {
  return listings.map(listing => ({
    ...listing,
    market_game: listing.market_game || inferMarketGame(listing),
    market_region: listing.market_region || inferMarketRegion(listing),
    seller_verified: isMarketSellerVerified(listing)
  }));
}

function updateMarketExchangeFilterOptions() {
  const popularGames = ['steam', 'roblox', 'cs2', 'dota 2', 'valorant', 'minecraft', 'fortnite', 'genshin', 'psn', 'xbox'];
  const games = [...new Set([...popularGames, ...(marketState.listings || []).map(inferMarketGame)])].filter(Boolean).sort();
  const regions = [...new Set((marketState.listings || []).map(inferMarketRegion))].sort();
  const gameSelect = document.getElementById('market-game-filter');
  const regionSelect = document.getElementById('market-region-filter');
  if (gameSelect && document.activeElement !== gameSelect) {
    gameSelect.innerHTML = '<option value="all">Все игры</option>' + games.map(game => (
      `<option value="${escapeHtmlAttr(game)}">${escapeHtml(game === 'other' ? 'Другое' : game)}</option>`
    )).join('');
    gameSelect.value = marketUiState.game;
  }
  if (regionSelect && document.activeElement !== regionSelect) {
    regionSelect.innerHTML = '<option value="all">Все регионы</option>' + regions.map(region => (
      `<option value="${escapeHtmlAttr(region)}">${escapeHtml(region)}</option>`
    )).join('');
    regionSelect.value = marketUiState.region;
  }
}

function syncMarketChrome() {
  document.querySelectorAll('.spike-market-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.marketTab === marketUiState.tab);
  });
  document.querySelectorAll('.spike-market-view').forEach(view => {
    const targetView = marketUiState.tab === 'purchases' ? 'trades' : marketUiState.tab;
    view.classList.toggle('active', view.dataset.marketView === targetView);
  });
  document.querySelectorAll('.spike-market-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.marketFilter === marketUiState.filter);
  });
  document.querySelectorAll('.spike-store-category[data-store-category]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.storeCategory === marketUiState.filter);
  });
  document.querySelectorAll('.spike-trade-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tradeFilter === marketUiState.tradeFilter);
  });
  document.querySelectorAll('.spike-trade-role-filter').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tradeRole === marketUiState.tradeRole);
  });
  const sortSelect = document.getElementById('market-sort-select');
  if (sortSelect) sortSelect.value = marketUiState.sort;
  const minPriceInput = document.getElementById('market-min-price-input');
  const maxPriceInput = document.getElementById('market-max-price-input');
  if (minPriceInput && document.activeElement !== minPriceInput) minPriceInput.value = marketUiState.minPrice ?? '';
  if (maxPriceInput && document.activeElement !== maxPriceInput) maxPriceInput.value = marketUiState.maxPrice ?? '';
  const searchInput = document.getElementById('market-search-input');
  if (searchInput && document.activeElement !== searchInput) searchInput.value = marketUiState.query || '';
  const ratingSelect = document.getElementById('market-rating-filter');
  if (ratingSelect) ratingSelect.value = String(marketUiState.minRating || 0);
  const verifiedInput = document.getElementById('market-verified-filter');
  if (verifiedInput) verifiedInput.checked = marketUiState.verifiedOnly === true;
  const advancedActive = marketUiState.game !== 'all'
    || marketUiState.region !== 'all'
    || marketUiState.minPrice !== null
    || marketUiState.maxPrice !== null
    || marketUiState.minRating > 0
    || marketUiState.verifiedOnly === true;
  document.querySelector('.spike-filter-toggle')?.classList.toggle('active', advancedActive);
}

function switchMarketTab(tab) {
  marketUiState.tab = tab || 'lots';
  if (marketUiState.tab === 'purchases') {
    marketUiState.tradeRole = 'buyer';
  } else if (marketUiState.tab === 'trades' && marketUiState.tradeRole === 'buyer') {
    marketUiState.tradeRole = 'all';
  }
  syncMarketChrome();
  renderMarketplace();
  if (marketUiState.tab === 'moderation') loadMarketModeration();
}

function setMarketFilter(filter) {
  marketUiState.filter = filter || 'all';
  renderMarketplace();
}

function setMarketSort(sort) {
  marketUiState.sort = sort || 'new';
  renderMarketplace();
}

function setMarketSearch(query) {
  marketUiState.query = String(query || '').trim().toLowerCase();
  renderMarketplace();
}

function toggleMarketFilters() {
  document.querySelector('.spike-market-exchange-filters')?.classList.toggle('open');
}

function setMarketSearchFromHeader(query) {
  const marketSearchInput = document.getElementById('market-search-input');
  const headerSearchInput = document.getElementById('spike-global-market-search');
  if (marketSearchInput && marketSearchInput.value !== query) marketSearchInput.value = query;
  if (headerSearchInput && headerSearchInput.value !== query) headerSearchInput.value = query;
  setMarketSearch(query);
}

function setMarketGameFilter(game) {
  marketUiState.game = game || 'all';
  const select = document.getElementById('market-game-filter');
  if (select && [...select.options].some(option => option.value === marketUiState.game)) select.value = marketUiState.game;
  document.getElementById('spike-marketplace')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  renderMarketplace();
}

function setMarketQuickCategory(category) {
  marketUiState.filter = category || 'all';
  marketUiState.game = 'all';
  document.querySelectorAll('.spike-store-category').forEach(button => {
    button.classList.toggle('active', button.dataset.storeCategory === marketUiState.filter);
  });
  document.querySelectorAll('.spike-market-filter').forEach(button => {
    button.classList.toggle('active', button.dataset.marketFilter === marketUiState.filter);
  });
  const gameSelect = document.getElementById('market-game-filter');
  if (gameSelect) gameSelect.value = 'all';
  renderMarketplace();
  document.getElementById('spike-marketplace')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function setMarketRegionFilter(region) {
  marketUiState.region = region || 'all';
  renderMarketplace();
}

function setMarketRatingFilter(rating) {
  const value = Number(rating);
  marketUiState.minRating = Number.isFinite(value) && value > 0 ? value : 0;
  renderMarketplace();
}

function setMarketVerifiedFilter(checked) {
  marketUiState.verifiedOnly = checked === true;
  renderMarketplace();
}

function setMarketPriceRange() {
  const minRaw = document.getElementById('market-min-price-input')?.value;
  const maxRaw = document.getElementById('market-max-price-input')?.value;
  const min = minRaw === '' ? null : Number(minRaw);
  const max = maxRaw === '' ? null : Number(maxRaw);
  marketUiState.minPrice = Number.isFinite(min) && min >= 0 ? min : null;
  marketUiState.maxPrice = Number.isFinite(max) && max >= 0 ? max : null;
  renderMarketplace();
}

function resetMarketExchangeFilters() {
  marketUiState = {
    ...marketUiState,
    filter: 'all',
    sort: 'new',
    query: '',
    game: 'all',
    region: 'all',
    minPrice: null,
    maxPrice: null,
    minRating: 0,
    verifiedOnly: false
  };
  renderMarketplace();
}

function setMarketTradeFilter(filter) {
  marketUiState.tradeFilter = filter || 'all';
  renderMarketplace();
}

function setMarketTradeRole(role) {
  marketUiState.tradeRole = role || 'all';
  if (role === 'buyer') marketUiState.tab = 'purchases';
  if (role === 'all' || role === 'seller') marketUiState.tab = 'trades';
  renderMarketplace();
}

function getVisibleMarketListings() {
  const filtered = [...(marketState.listings || [])].filter(listing => (
    (
      marketUiState.filter === 'all'
      || (marketUiState.filter === 'watchlist' ? listing.watched_by_me : listing.category === marketUiState.filter)
    )
    && (marketUiState.game === 'all' || (listing.market_game || inferMarketGame(listing)) === marketUiState.game)
    && (marketUiState.region === 'all' || (listing.market_region || inferMarketRegion(listing)) === marketUiState.region)
    && (
      !marketUiState.query
      || `${listing.title || ''} ${listing.description || ''} ${listing.seller_username || ''}`
        .toLowerCase()
        .includes(marketUiState.query)
    )
    && (marketUiState.minPrice === null || Number(listing.price || 0) >= marketUiState.minPrice)
    && (marketUiState.maxPrice === null || Number(listing.price || 0) <= marketUiState.maxPrice)
    && (marketUiState.minRating <= 0 || Number(listing.seller_rating || 0) >= marketUiState.minRating)
    && (!marketUiState.verifiedOnly || isMarketSellerVerified(listing))
  ));
  return filtered.sort((a, b) => {
    if (marketUiState.sort === 'cheap') return Number(a.price || 0) - Number(b.price || 0);
    if (marketUiState.sort === 'expensive') return Number(b.price || 0) - Number(a.price || 0);
    if (marketUiState.sort === 'popular') {
      return Number(b.watch_count || 0) - Number(a.watch_count || 0)
        || Number(b.seller_review_count || 0) - Number(a.seller_review_count || 0)
        || new Date(b.created_at || 0) - new Date(a.created_at || 0);
    }
    if (marketUiState.sort === 'trusted') {
      return Number(b.seller_rating || 0) - Number(a.seller_rating || 0)
        || Number(b.seller_success_rate || 0) - Number(a.seller_success_rate || 0)
        || Number(b.seller_review_count || 0) - Number(a.seller_review_count || 0);
    }
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
}

function getMarketTradeStats() {
  return (marketState.trades || []).reduce((stats, trade) => {
    if (trade.status === 'pending') stats.pending += 1;
    if (trade.status === 'completed') stats.completed += 1;
    if (trade.status === 'cancelled') stats.cancelled += 1;
    if (trade.dispute_status) stats.dispute += 1;
    return stats;
  }, { pending: 0, completed: 0, cancelled: 0, dispute: 0 });
}

function getVisibleMarketTrades() {
  return [...(marketState.trades || [])].filter(trade => {
    if (marketUiState.tradeRole === 'buyer' && Number(trade.buyer_id) !== Number(currentUserId)) return false;
    if (marketUiState.tradeRole === 'seller' && Number(trade.seller_id) !== Number(currentUserId)) return false;
    if (marketUiState.tradeFilter === 'all') return true;
    if (marketUiState.tradeFilter === 'dispute') return Boolean(trade.dispute_status);
    return trade.status === marketUiState.tradeFilter;
  });
}

function getTradeRoleLabel(trade) {
  if (Number(trade.buyer_id) === Number(currentUserId)) return 'моя покупка';
  if (Number(trade.seller_id) === Number(currentUserId)) return 'моя продажа';
  return 'сделка';
}

function getMarketTradesSubtitle() {
  if (marketUiState.tradeRole === 'buyer') return 'твои покупки: escrow, получение, спор и история';
  if (marketUiState.tradeRole === 'seller') return 'твои продажи: передача лота, escrow и выплаты';
  return 'escrow, подтверждения, споры и хэш операции';
}

function getMarketTradesEmptyText() {
  if (marketUiState.tradeRole === 'buyer') return 'Покупок пока нет. После покупки лота она появится здесь и останется после перезахода.';
  if (marketUiState.tradeRole === 'seller') return 'Продаж пока нет. Когда кто-то купит твой лот, сделка появится здесь.';
  return 'Под этот фильтр сделок пока нет.';
}

function getMarketActionItems() {
  return (marketState.trades || []).filter(trade => {
    const isBuyer = Number(trade.buyer_id) === Number(currentUserId);
    const isSeller = Number(trade.seller_id) === Number(currentUserId);
    return (trade.status === 'pending' && isBuyer)
      || (trade.status === 'pending' && isSeller)
      || (trade.dispute_status === 'open');
  });
}

function renderMarketActionCenter(container) {
  if (!container) return;
  const items = getMarketActionItems();
  if (!items.length) {
    container.innerHTML = '<strong>Нужно действие</strong><br>Сейчас нет сделок, которые требуют реакции.';
    return;
  }
  container.innerHTML = `
    <strong>Нужно действие: ${items.length}</strong><br>
    ${items.slice(0, 3).map(trade => {
      const label = trade.dispute_status === 'open'
        ? 'спор ждёт решения'
        : Number(trade.buyer_id) === Number(currentUserId)
          ? 'подтверди получение или открой спор'
          : 'передай лот и веди чат сделки';
      return `<button class="sn-btn spike-mini-btn social-action-btn" style="margin:7px 6px 0 0;" onclick="openMarketDealRoom(${trade.id})">#${trade.id} · ${escapeHtml(label)}</button>`;
    }).join('')}
  `;
}

async function loadMarketModeration() {
  try {
    const [summaryRes, disputesRes, paymentsRes] = await Promise.all([
      fetch('/api/market/admin/summary'),
      fetch('/api/market/admin/disputes'),
      fetch('/api/market/admin/payments')
    ]);
    if (summaryRes.status === 403 || disputesRes.status === 403 || paymentsRes.status === 403) {
      marketModerationState = { loaded: true, allowed: false, summary: null, disputes: [], payments: [] };
      renderMarketModeration();
      return;
    }
    const summary = await summaryRes.json().catch(() => ({}));
    const disputes = await disputesRes.json().catch(() => ({}));
    const payments = await paymentsRes.json().catch(() => ({}));
    if (!summaryRes.ok || !disputesRes.ok || !paymentsRes.ok) throw new Error(summary.error || disputes.error || payments.error || 'moderation load failed');
    marketModerationState = {
      loaded: true,
      allowed: true,
      summary,
      disputes: disputes.disputes || [],
      payments: payments.payments || []
    };
    renderMarketModeration();
  } catch (err) {
    marketModerationState = { loaded: true, allowed: false, summary: null, disputes: [], payments: [] };
    renderMarketModeration('Не удалось загрузить модерацию.');
  }
}

function renderMarketModeration(errorText = '') {
  const list = document.getElementById('market-admin-disputes-list');
  const paymentsList = document.getElementById('market-admin-payments-list');
  const summary = marketModerationState.summary || {};
  const openEl = document.getElementById('market-admin-open-disputes');
  const resolvedEl = document.getElementById('market-admin-resolved-disputes');
  const pendingEl = document.getElementById('market-admin-pending-trades');
  const activeEl = document.getElementById('market-admin-active-listings');
  const pendingPaymentsEl = document.getElementById('market-admin-pending-payments');
  const disputeFilter = document.getElementById('market-admin-dispute-filter');
  const paymentFilter = document.getElementById('market-admin-payment-filter');
  const queryInput = document.getElementById('market-admin-query');
  if (openEl) openEl.textContent = String(summary.open_disputes || 0);
  if (resolvedEl) resolvedEl.textContent = String(summary.resolved_disputes || 0);
  if (pendingEl) pendingEl.textContent = String(summary.pending_trades || 0);
  if (activeEl) activeEl.textContent = String(summary.active_listings || 0);
  if (pendingPaymentsEl) pendingPaymentsEl.textContent = String(summary.pending_payments || 0);
  if (disputeFilter) disputeFilter.value = marketModerationState.disputeFilter || 'open';
  if (paymentFilter) paymentFilter.value = marketModerationState.paymentFilter || 'pending';
  if (queryInput && document.activeElement !== queryInput) queryInput.value = marketModerationState.query || '';
  if (!list) return;
  if (marketModerationState.allowed === false) {
    const moderatorHint = `Доступ: id=1, admin/moderator usernames или role market_moderator. Сейчас: @${currentUsername || 'user'} / id ${currentUserId || '?'}`;
    list.innerHTML = `<div class="sn-card spike-market-trade">
      <strong>${escapeHtml(errorText || 'Нет доступа к market moderation.')}</strong>
      <div class="spike-market-subtle" style="margin-top:6px;">${escapeHtml(moderatorHint)}</div>
    </div>`;
    if (paymentsList) paymentsList.innerHTML = '';
    return;
  }
  if (!marketModerationState.loaded) {
    list.innerHTML = '<div class="sn-card spike-market-trade">Загрузка споров...</div>';
    if (paymentsList) paymentsList.innerHTML = '<div class="sn-card spike-market-trade">Загрузка платежей...</div>';
    return;
  }
  const query = String(marketModerationState.query || '').trim().toLowerCase();
  const matchesQuery = (...values) => !query || values.some(value => String(value || '').toLowerCase().includes(query));
  if (paymentsList) {
    const payments = (marketModerationState.payments || []).filter(payment => {
      const statusOk = marketModerationState.paymentFilter === 'all' || payment.status === marketModerationState.paymentFilter;
      return statusOk && matchesQuery(payment.id, payment.username, payment.type, payment.status, payment.provider, payment.destination, payment.reference, payment.user_note);
    });
    paymentsList.innerHTML = payments.length
      ? payments.map(renderMarketModerationPayment).join('')
      : '<div class="sn-card spike-market-trade">Платёжных заявок под фильтром нет.</div>';
  }
  const disputes = (marketModerationState.disputes || []).filter(dispute => {
    const statusOk = marketModerationState.disputeFilter === 'all' || dispute.status === marketModerationState.disputeFilter;
    return statusOk && matchesQuery(dispute.id, dispute.trade_id, dispute.title, dispute.status, dispute.reason, dispute.buyer_username, dispute.seller_username, dispute.resolved_by_username);
  });
  list.innerHTML = disputes.length
    ? disputes.map(renderMarketModerationDispute).join('')
    : '<div class="sn-card spike-market-trade">Споров под фильтром нет.</div>';
}

function renderMarketModerationPayment(payment) {
  return `
        <div class="sn-card spike-market-trade ${payment.status === 'pending' ? 'disputed' : ''}">
          <strong>#${payment.id} · ${escapeHtml(renderPaymentType(payment.type))} · ${Math.round(Number(payment.amount || 0))} SPK</strong>
          ${renderPaymentStatus(payment.status)}
          <div>${escapeHtml(payment.username || 'user')} · ${escapeHtml(payment.provider || 'manual')}</div>
          <div class="spike-market-subtle">
            ${escapeHtml(payment.provider_status || 'pending')}
            ${payment.provider_payment_id ? ` · ${escapeHtml(payment.provider_payment_id)}` : ''}
          </div>
          <div class="spike-market-subtle">${escapeHtml(payment.type === 'withdrawal' ? payment.destination : (payment.reference || payment.user_note || 'ручная заявка'))}</div>
          ${payment.provider_checkout_url ? `<a class="spike-market-hash" href="${escapeHtml(payment.provider_checkout_url)}" target="_blank" rel="noopener">checkout</a>` : ''}
          ${payment.moderator_note ? `<div class="sn-card-muted spike-market-protect" style="margin-top:7px;">${escapeHtml(payment.moderator_note)}</div>` : ''}
          ${payment.status === 'pending'
            ? `<div class="spike-mod-note-row">
                <input id="market-payment-note-${payment.id}" class="sn-input" placeholder="комментарий модератора">
                <button class="sn-btn spike-mini-btn social-action-btn" onclick="resolveMarketPayment(${payment.id}, 'approve')">Подтвердить</button>
                <button class="sn-btn spike-mini-btn social-action-btn" onclick="resolveMarketPayment(${payment.id}, 'reject')">Отклонить</button>
              </div>`
            : `<span class="spike-market-hash">${escapeHtml(payment.processed_by_username || 'processed')} · ${escapeHtml(payment.processed_at ? new Date(payment.processed_at).toLocaleString() : '')}</span>`}
        </div>
      `;
}

function renderMarketModerationDispute(dispute) {
  const events = Array.isArray(dispute.events) ? dispute.events.slice(0, 4) : [];
  const evidence = Array.isArray(dispute.evidence) ? dispute.evidence.slice(0, 3) : [];
  return `
    <div class="sn-card spike-market-trade ${dispute.status === 'open' ? 'disputed' : ''}">
      <strong>#${dispute.trade_id} · ${escapeHtml(dispute.title || 'Lot')}</strong> · ${Math.round(Number(dispute.price || 0))} SPK · ${renderMarketStatusLabel(dispute.status)}
      <div>${escapeHtml(dispute.buyer_username || 'buyer')} -> ${escapeHtml(dispute.seller_username || 'seller')} · ${escapeHtml(new Date(dispute.created_at).toLocaleString())}</div>
      <div class="spike-market-subtle">${escapeHtml(dispute.reason || 'no reason')}</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:7px;">
        <span class="sn-badge spike-market-chip">${Number(dispute.evidence_count || 0)} доказ.</span>
        <span class="sn-badge spike-market-chip">${Number(dispute.event_count || 0)} событий</span>
        ${renderRiskBadge(dispute.risk_score_snapshot || 0, 'risk')}
        ${dispute.resolved_by_username ? `<span class="sn-badge spike-market-chip">модер: ${escapeHtml(dispute.resolved_by_username)}</span>` : ''}
        ${dispute.payout_username ? `<span class="sn-badge spike-market-chip">выплата: ${escapeHtml(dispute.payout_username)} · ${Math.round(Number(dispute.payout_amount || 0))} SPK</span>` : ''}
      </div>
      ${dispute.moderator_note ? `<div class="sn-card-muted spike-market-protect" style="margin-top:7px;">${escapeHtml(dispute.moderator_note)}</div>` : ''}
      ${dispute.payout_note ? `<div class="spike-market-subtle" style="margin-top:6px;">${escapeHtml(dispute.payout_note)}</div>` : ''}
      ${events.length ? `<div class="spike-mod-history">
        <strong>История</strong>
        ${events.map(event => `<div><span>${escapeHtml(event.event_type || 'event')}</span> · ${escapeHtml(event.username || 'system')} · ${escapeHtml(new Date(event.created_at).toLocaleString())}<br>${escapeHtml(event.message || '')}</div>`).join('')}
      </div>` : ''}
      ${evidence.length ? `<div class="spike-mod-history">
        <strong>Доказательства</strong>
        ${evidence.map(item => `<div><span>${escapeHtml(item.kind || 'evidence')}</span> · ${escapeHtml(item.username || 'player')}<br>${/^https?:\/\//i.test(item.content || '') ? `<a href="${escapeHtmlAttr(item.content)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.content)}</a>` : escapeHtml(item.content || '')}</div>`).join('')}
      </div>` : ''}
      ${dispute.status === 'open'
        ? `<div class="spike-mod-note-row">
            <input id="market-dispute-note-${dispute.id}" class="sn-input" placeholder="комментарий решения">
            <button class="sn-btn spike-mini-btn social-action-btn" onclick="openMarketDealRoom(${dispute.trade_id})">Чат сделки</button>
            <button class="sn-btn spike-mini-btn social-action-btn" onclick="resolveMarketDispute(${dispute.id}, 'refund_buyer')">Вернуть покупателю</button>
            <button class="sn-btn spike-mini-btn social-action-btn" onclick="resolveMarketDispute(${dispute.id}, 'pay_seller')">Выплатить продавцу</button>
          </div>`
        : `<span class="spike-market-hash">${escapeHtml(renderDisputeResolution(dispute.resolution))}</span>`}
    </div>
  `;
}

function setMarketModerationQuery(query) {
  marketModerationState.query = String(query || '').trim().toLowerCase();
  renderMarketModeration();
}

function setMarketDisputeFilter(filter) {
  marketModerationState.disputeFilter = filter || 'open';
  renderMarketModeration();
}

function setMarketPaymentFilter(filter) {
  marketModerationState.paymentFilter = filter || 'pending';
  renderMarketModeration();
}

function getTradeDisputeEvidence(trade) {
  return Array.isArray(trade.dispute_evidence) ? trade.dispute_evidence : [];
}

function getTradeDisputeEvents(trade) {
  return Array.isArray(trade.dispute_events) ? trade.dispute_events : [];
}

function renderDisputeEvidence(trade) {
  const evidence = getTradeDisputeEvidence(trade);
  if (!trade.dispute_id) return '';
  const body = evidence.length
    ? evidence.map(item => {
        const isLink = /^https?:\/\//i.test(item.content || '');
        return `
          <div class="sn-card spike-market-trade">
            <strong>${escapeHtml(item.kind || 'доказательство')} · ${escapeHtml(item.username || 'player')}</strong>
            <div>${isLink
              ? `<a href="${escapeHtmlAttr(item.content)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.content)}</a>`
              : escapeHtml(item.content || '')}</div>
            ${item.note ? `<div class="spike-market-subtle">${escapeHtml(item.note)}</div>` : ''}
            <span class="spike-market-hash">${escapeHtml(new Date(item.created_at).toLocaleString())}</span>
          </div>
        `;
      }).join('')
    : '<div class="sn-card spike-market-trade">Доказательств пока нет.</div>';
  return `<div class="sn-card-muted spike-market-protect" style="margin-top:10px;">
    <strong>Доказательства</strong>
    <div class="spike-market-ledger" style="margin-top:8px;">${body}</div>
  </div>`;
}

function renderDisputeEvents(trade) {
  const events = getTradeDisputeEvents(trade);
  if (!trade.dispute_id) return '';
  const body = events.length
    ? events.map(event => `
      <div class="sn-card spike-market-trade">
        <strong>${escapeHtml(event.event_type || 'event')}</strong>
        <div class="spike-market-subtle">${escapeHtml(event.username || 'system')} · ${escapeHtml(new Date(event.created_at).toLocaleString())}</div>
        ${event.message ? `<div>${escapeHtml(event.message)}</div>` : ''}
      </div>
    `).join('')
    : '<div class="sn-card spike-market-trade">Истории пока нет.</div>';
  return `<div class="sn-card-muted spike-market-protect" style="margin-top:10px;">
    <strong>История спора</strong>
    <div class="spike-market-ledger" style="margin-top:8px;">${body}</div>
  </div>`;
}

function getRiskTone(score) {
  const value = Number(score || 0);
  if (value >= 70) return 'danger';
  if (value >= 40) return 'warn';
  return 'safe';
}

function renderRiskBadge(score, label = 'risk') {
  const value = Math.max(0, Math.min(100, Math.round(Number(score || 0))));
  return `<span class="sn-badge spike-risk-badge ${getRiskTone(value)}">${escapeHtml(label)} ${value}/100</span>`;
}

function renderRiskReasons(rawReasons) {
  const reasons = Array.isArray(rawReasons)
    ? rawReasons
    : Array.isArray(rawReasons?.reasons)
      ? rawReasons.reasons
      : [];
  return reasons.length
    ? reasons.slice(0, 5).map(reason => `<span class="sn-badge spike-market-chip">${escapeHtml(reason)}</span>`).join('')
    : '<span class="sn-badge spike-market-chip">нет красных флагов</span>';
}

function renderDealSecurityPanel(trade) {
  const sellerRisk = Number(trade.seller_risk_score_snapshot || trade.dispute_risk_score_snapshot || 0);
  const flag = trade.seller_flag_snapshot || 'none';
  const flagNote = trade.seller_flag_note_snapshot || '';
  const payoutAmount = Number(trade.dispute_payout_amount || 0);
  const payout = trade.dispute_payout_user_id
    ? `
      <div class="spike-security-row">
        <span>Выплата</span>
        <strong>${escapeHtml(trade.dispute_payout_username || `user #${trade.dispute_payout_user_id}`)} · ${Math.round(payoutAmount)} SPK</strong>
      </div>
      <div class="spike-market-subtle">${escapeHtml(trade.dispute_payout_note || 'Записано решением модератора')}</div>
    `
    : '<div class="spike-market-subtle">Выплата ещё не проведена.</div>';
  const resolved = trade.dispute_resolved_at
    ? `<div class="spike-security-row"><span>Закрыто</span><strong>${escapeHtml(new Date(trade.dispute_resolved_at).toLocaleString())}</strong></div>`
    : '';
  const resolver = trade.dispute_resolver_username
    ? `<div class="spike-security-row"><span>Модератор</span><strong>${escapeHtml(trade.dispute_resolver_username)}</strong></div>`
    : '';
  const riskBreakdown = trade.dispute_risk_breakdown || {};
  return `
    <div class="sn-card-muted spike-market-protect spike-deal-security">
      <div class="spike-security-head">
        <strong>Безопасность сделки</strong>
        ${renderRiskBadge(sellerRisk, 'риск продавца')}
      </div>
      <div class="spike-security-grid">
        <div class="spike-security-row"><span>Флаг продавца</span><strong>${escapeHtml(flag)}</strong></div>
        <div class="spike-security-row"><span>Escrow</span><strong>${trade.status === 'pending' ? 'SPK заморожены' : 'закрыт'}</strong></div>
        ${resolver}
        ${resolved}
      </div>
      ${flagNote ? `<div class="spike-ticket-warning">${escapeHtml(flagNote)}</div>` : ''}
      <div class="spike-risk-reasons">${renderRiskReasons(riskBreakdown.reasons)}</div>
      ${trade.dispute_status || trade.dispute_resolution ? `<div class="spike-security-payout">${payout}</div>` : ''}
    </div>
  `;
}

function parseEvidencePrompt(raw) {
  return String(raw || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map(line => ({
      kind: /^https?:\/\//i.test(line) ? 'link' : 'text',
      content: line,
      note: ''
    }));
}

function renderMarketListingPreview() {
  const preview = document.getElementById('market-listing-preview');
  if (!preview) return;
  const title = document.getElementById('market-title-input')?.value.trim() || 'Твой новый лот';
  const category = document.getElementById('market-category-select')?.value || 'key';
  const price = Number(document.getElementById('market-price-input')?.value || 0);
  const imageUrl = document.getElementById('market-image-input')?.value.trim();
  const description = document.getElementById('market-description-input')?.value.trim() || 'Описание, регион и условия передачи будут здесь.';
  preview.innerHTML = `
    ${renderListingImage(imageUrl, title, category)}
    <div class="spike-market-card-top">
      ${renderMarketCategoryBadge(category)}
      <span class="sn-badge spike-market-chip">preview</span>
    </div>
    <h4>${escapeHtml(title)}</h4>
    <span class="spike-market-price">${Math.round(price)} SPK</span>
    <div class="spike-market-subtle">${escapeHtml(description)}</div>
    <div class="sn-card-muted spike-market-protect">Покупатель увидит escrow ticket перед оплатой. Деньги заморозятся до подтверждения.</div>
  `;
}

function getListingImageUrl(listing) {
  const direct = String(listing?.image_url || listing?.imageUrl || '').trim();
  if (direct) return direct;
  const category = String(listing?.category || 'other');
  const game = String(listing?.market_game || inferMarketGame(listing) || '').toLowerCase();
  const seed = encodeURIComponent(`${category}-${game}-${listing?.title || 'spikenet'}`);
  const fallbackMap = {
    key: `https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=720&q=80&seed=${seed}`,
    item: `https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=720&q=80&seed=${seed}`,
    service: `https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=720&q=80&seed=${seed}`,
    account: `https://images.unsplash.com/photo-1607853202273-797f1c22a38e?auto=format&fit=crop&w=720&q=80&seed=${seed}`,
    other: `https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?auto=format&fit=crop&w=720&q=80&seed=${seed}`
  };
  return fallbackMap[category] || fallbackMap.other;
}

function renderListingImage(imageUrl, title, category = 'other') {
  const url = imageUrl || getListingImageUrl({ title, category });
  return `
    <div class="spike-listing-image">
      <img src="${escapeHtml(url)}" alt="" loading="lazy" onerror="this.closest('.spike-listing-image').classList.add('broken'); this.remove();">
      <span>${escapeHtml((category || 'lot').toUpperCase())}</span>
    </div>
  `;
}

async function uploadMarketListingImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const res = await fetch('/api/uploads/file', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name || 'listing-image')
        },
        body: file
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return showSpikeAlert(data.error || 'Не удалось загрузить картинку', 'Marketplace', 'error');
      const imageInput = document.getElementById('market-image-input');
      if (imageInput) imageInput.value = data.url || '';
      renderMarketListingPreview();
      showSpikeAlert('Картинка лота загружена.', 'Marketplace', 'success');
    } catch (err) {
      showSpikeAlert('Ошибка загрузки картинки.', 'Marketplace', 'error');
    }
  };
  input.click();
}

function renderMarketTradeActions(trade) {
  const isBuyer = Number(trade.buyer_id) === Number(currentUserId);
  const isSeller = Number(trade.seller_id) === Number(currentUserId);
  const otherId = Number(trade.buyer_id) === Number(currentUserId) ? trade.seller_id : trade.buyer_id;
  const otherName = Number(trade.buyer_id) === Number(currentUserId) ? trade.seller_username : trade.buyer_username;
  const chat = otherId
    ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="openTradeChat(${otherId}, '${encodeURIComponent(otherName || 'Trader')}')">Чат сделки</button>`
    : '';
  if (trade.status !== 'pending') {
    const review = trade.status === 'completed' && isBuyer && !trade.reviewed_by_me
      ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="reviewMarketTrade(${trade.id})">Оценить продавца</button>`
      : '';
    return `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:7px;">${chat}${review}</div>`;
  }
  if (!isBuyer && !isSeller) return '';
  const dispute = trade.dispute_status
    ? `<span class="sn-badge spike-market-chip">dispute: ${escapeHtml(trade.dispute_status)}</span>`
    : `<button class="sn-btn spike-mini-btn social-action-btn" onclick="openMarketDispute(${trade.id})">Открыть спор</button>`;
  const confirm = isBuyer
    ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="confirmMarketTrade(${trade.id})">Подтвердить получение</button>`
    : '';
  return `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:7px;">
    ${chat}
    ${confirm}
    ${dispute}
    <button class="sn-btn spike-mini-btn social-action-btn" onclick="cancelMarketTrade(${trade.id})">Отменить escrow</button>
  </div>`;
}

function openMarketDealRoom(tradeId) {
  const trade = (marketState.trades || []).find(item => Number(item.id) === Number(tradeId));
  const overlay = document.getElementById('marketDealRoomOverlay');
  const titleEl = document.getElementById('market-deal-title');
  const subtitleEl = document.getElementById('market-deal-subtitle');
  const bodyEl = document.getElementById('market-deal-body');
  const actionsEl = document.getElementById('market-deal-actions');
  if (!trade || !overlay || !titleEl || !subtitleEl || !bodyEl || !actionsEl) return;

  currentMarketDealId = Number(trade.id);
  const isBuyer = Number(trade.buyer_id) === Number(currentUserId);
  const otherId = isBuyer ? trade.seller_id : trade.buyer_id;
  const otherName = isBuyer ? trade.seller_username : trade.buyer_username;
  const role = isBuyer ? 'покупатель' : 'продавец';
  const statusLabel = trade.dispute_status ? `dispute: ${trade.dispute_status}` : trade.status || 'pending';

  titleEl.textContent = trade.title || 'Сделка';
  subtitleEl.textContent = `#${trade.id} · ${role} · ${statusLabel}`;
  bodyEl.innerHTML = `
    <div class="spike-deal-room-grid">
      <div class="spike-ticket-row"><span>Сумма</span><strong>${Math.round(Number(trade.price || 0))} SPK</strong></div>
      <div class="spike-ticket-row"><span>Статус</span><strong>${escapeHtml(statusLabel)}</strong></div>
      <div class="spike-ticket-row"><span>Покупатель</span><strong>${escapeHtml(trade.buyer_username || 'buyer')}</strong></div>
      <div class="spike-ticket-row"><span>Продавец</span><strong>${escapeHtml(trade.seller_username || 'seller')}</strong></div>
    </div>
    ${renderTradeTimeline(trade)}
    <div class="spike-deal-room-note">
      ${isBuyer
        ? 'Подтверждай получение только после передачи лота. Если продавец тянет или условия не совпали, открой спор.'
        : 'Передай лот покупателю и веди переписку в чате сделки. Деньги выйдут из escrow после подтверждения покупателем.'}
    </div>
    ${renderDealSecurityPanel(trade)}
    ${trade.dispute_reason ? `<div class="spike-ticket-warning" style="margin-top:10px;"><strong>Причина спора</strong><br>${escapeHtml(trade.dispute_reason)}</div>` : ''}
    ${trade.dispute_resolution ? `<div class="sn-card-muted spike-market-protect" style="margin-top:10px;"><strong>Решение</strong><br>${escapeHtml(renderDisputeResolution(trade.dispute_resolution))}</div>` : ''}
    ${trade.dispute_moderator_note ? `<div class="sn-card-muted spike-market-protect" style="margin-top:10px;"><strong>Комментарий модератора</strong><br>${escapeHtml(trade.dispute_moderator_note)}</div>` : ''}
    ${renderDisputeEvidence(trade)}
    ${renderDisputeEvents(trade)}
    <span class="spike-market-hash">${escapeHtml(trade.trade_hash || '')}</span>
  `;

  const chat = otherId
    ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="openTradeChat(${otherId}, '${encodeURIComponent(otherName || 'Trader')}')">Чат сделки</button>`
    : '';
  const review = trade.status === 'completed' && isBuyer && !trade.reviewed_by_me
    ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="reviewMarketTrade(${trade.id})">Оценить продавца</button>`
    : '';
  const confirm = trade.status === 'pending' && isBuyer
    ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="confirmMarketTrade(${trade.id})">Подтвердить получение</button>`
    : '';
  const dispute = trade.status === 'pending' && !trade.dispute_status
    ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="openMarketDispute(${trade.id})">Открыть спор</button>`
    : '';
  const cancel = trade.status === 'pending' && !trade.dispute_status
    ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="cancelMarketTrade(${trade.id})">Отменить escrow</button>`
    : '';
  const canResolveDispute = userLooksLikeMarketModerator();
  const arbitration = canResolveDispute && trade.dispute_status === 'open' && trade.dispute_id
    ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="resolveMarketDispute(${trade.dispute_id}, 'refund_buyer')">Вернуть покупателю</button>
       <button class="sn-btn spike-mini-btn social-action-btn" onclick="resolveMarketDispute(${trade.dispute_id}, 'pay_seller')">Выплатить продавцу</button>`
    : '';
  const waitingForModerator = !canResolveDispute && trade.dispute_status === 'open' && trade.dispute_id
    ? `<span class="sn-badge spike-market-chip">спор ждёт модератора</span>`
    : '';
  const addEvidence = trade.dispute_id
    ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="addMarketDisputeEvidence(${trade.dispute_id})">Добавить доказательства</button>`
    : '';
  actionsEl.innerHTML = `${chat}${confirm}${review}${dispute}${addEvidence}${arbitration}${waitingForModerator}${cancel}`;
  overlay.classList.add('active');
}

function closeMarketDealRoom(event) {
  if (event && event.target?.id !== 'marketDealRoomOverlay') return;
  document.getElementById('marketDealRoomOverlay')?.classList.remove('active');
  currentMarketDealId = null;
}

function renderTradeTimeline(trade) {
  const status = trade.status || 'pending';
  const isCompleted = status === 'completed';
  const isCancelled = status === 'cancelled';
  return `
    <div class="sn-badge spike-trade-steps">
      <span class="sn-badge spike-trade-step active">escrow</span>
      <span class="sn-badge spike-trade-step ${!isCancelled ? 'active' : ''}">передача</span>
      <span class="sn-badge spike-trade-step ${isCompleted ? 'active' : ''}">подтверждение</span>
      <span class="sn-badge spike-trade-step ${isCompleted ? 'active' : isCancelled ? 'active' : ''}">${isCancelled ? 'refund' : 'done'}</span>
    </div>
  `;
}

function renderMarketStatusLabel(status) {
  const labels = {
    pending: 'escrow',
    completed: 'done',
    cancelled: 'cancelled'
  };
  return `<span class="sn-badge spike-market-chip">${labels[status] || 'done'}</span>`;
}

function renderMarketCategory(category) {
  return {
    key: 'ключ',
    item: 'предмет',
    service: 'услуга',
    account: 'аккаунт',
    other: 'другое'
  }[category] || 'лот';
}

function renderMarketCategoryBadge(category) {
  const icons = {
    key: '#',
    item: '◆',
    service: '*',
    account: 'ID',
    other: '+'
  };
  const clean = ['key', 'item', 'service', 'account', 'other'].includes(category) ? category : 'other';
  return `<span class="sn-badge spike-market-chip spike-category-badge spike-category-${clean}">
    <span class="spike-category-icon">${escapeHtml(icons[clean])}</span>${escapeHtml(renderMarketCategory(clean))}
  </span>`;
}

function renderDisputeResolution(resolution) {
  return {
    refund_buyer: 'Средства возвращены покупателю',
    pay_seller: 'Escrow выплачен продавцу'
  }[resolution] || resolution || 'Спор закрыт';
}

function renderSellerRating(listing) {
  const count = Number(listing.seller_review_count || 0);
  if (!count) return '<span class="sn-badge spike-market-chip">новый продавец</span>';
  const rating = Number(listing.seller_rating || 0).toFixed(1);
  return `<span class="sn-badge spike-market-chip">★ ${rating} (${count})</span>`;
}

function getSellerTrustBadge(seller) {
  const level = seller.trust_level || 'new';
  if (level === 'verified') return 'проверенный продавец';
  if (level === 'trusted') return 'надёжный продавец';
  if (level === 'risky') return 'рискованный продавец';
  return 'новый продавец';
}

function sellerTrustClass(seller) {
  return seller.trust_level || 'new';
}

function formatSellerDate(value) {
  if (!value) return 'нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'нет данных';
  return date.toLocaleDateString();
}

async function setMarketSellerFlag(sellerId, flag) {
  const selectedFlag = flag || document.getElementById(`seller-flag-select-${sellerId}`)?.value || 'none';
  const note = selectedFlag === 'none' ? '' : (document.getElementById(`seller-flag-note-${sellerId}`)?.value.trim() || '');
  try {
    const res = await fetch(`/api/market/sellers/${sellerId}/flag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flag: selectedFlag, note })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Could not update seller flag', 'Marketplace', 'error');
    showSpikeAlert('Seller trust flag updated.', 'Marketplace', 'success');
    await loadMarketplace();
    await openMarketSellerProfile(sellerId, encodeURIComponent(data.username || 'Seller'));
  } catch (err) {
    showSpikeAlert('Marketplace connection error.', 'Marketplace', 'error');
  }
}

function renderLedgerType(type) {
  const labels = {
    test_topup: 'Тестовое пополнение',
    deposit_approved: 'Пополнение подтверждено',
    deposit_rejected: 'Пополнение отклонено',
    withdrawal_hold: 'Вывод зарезервирован',
    withdrawal_paid: 'Вывод выплачен',
    withdrawal_refund: 'Вывод возвращён',
    escrow_lock: 'Escrow заморожен',
    escrow_release: 'Escrow выпущен',
    escrow_refund: 'Escrow возвращён',
    sale_income: 'Доход с продажи',
    spikenet_fee: 'Комиссия SpikeNet',
    dispute_refund: 'Возврат по спору',
    dispute_reversal: 'Коррекция по спору',
    dispute_release: 'Выпуск по спору',
    dispute_payout: 'Выплата по спору'
  };
  return labels[type] || type || 'Ledger';
}

function renderPaymentType(type) {
  return {
    deposit: 'Пополнение',
    withdrawal: 'Вывод'
  }[type] || 'Платёж';
}

function renderPaymentStatus(status) {
  const labels = {
    pending: 'ожидает',
    approved: 'подтверждено',
    rejected: 'отклонено'
  };
  const cls = status === 'approved' ? 'safe' : status === 'rejected' ? 'danger' : 'warn';
  return `<span class="sn-badge spike-risk-badge ${cls}">${labels[status] || status || 'pending'}</span>`;
}

function openTradeChat(userId, encodedName) {
  openChatsDock();
  openPrivateChat(Number(userId), decodeURIComponent(encodedName || 'Trader'));
}

async function openMarketSellerProfile(sellerId, encodedName) {
  const overlay = document.getElementById('marketSellerOverlay');
  const nameEl = document.getElementById('market-seller-name');
  const statsEl = document.getElementById('market-seller-stats');
  const reviewsEl = document.getElementById('market-seller-reviews');
  if (!overlay || !nameEl || !statsEl || !reviewsEl) return;
  nameEl.textContent = decodeURIComponent(encodedName || 'Seller');
  statsEl.textContent = 'загружаем репутацию';
  reviewsEl.innerHTML = '<div class="spike-market-review">Загрузка...</div>';
  overlay.classList.add('active');

  try {
    const res = await fetch(`/api/market/sellers/${sellerId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'seller load failed');
    const seller = data.seller || {};
    const rating = Number(seller.rating || 0).toFixed(1);
    const completed = Number(seller.completed_trades || 0);
    const total = Number(seller.total_trades || 0);
    const disputes = Number(seller.dispute_count || 0);
    const successRate = total ? Math.round((completed / total) * 100) : 0;
    const trustBadge = getSellerTrustBadge(seller);
    nameEl.textContent = seller.username || decodeURIComponent(encodedName || 'Seller');
    statsEl.textContent = `${trustBadge} · ★ ${rating} · отзывов: ${seller.review_count || 0}`;
    const activeListingsHtml = (data.activeListings || []).length
      ? `
        <div class="spike-market-head" style="margin-top:14px;">
          <div>
            <div class="spike-market-title">Активные лоты</div>
            <div class="spike-market-subtle">${data.activeListings.length} на продаже</div>
          </div>
        </div>
        ${(data.activeListings || []).map(listing => `
          <div class="spike-market-review">
            <strong>${escapeHtml(listing.title || 'Лот')} · ${Math.round(Number(listing.price || 0))} SPK</strong>
            <div class="spike-market-subtle">${escapeHtml(renderMarketCategory(listing.category))} · ${escapeHtml(listing.description || 'без описания')}</div>
          </div>
        `).join('')}
      `
      : '';
    const reviewsHtml = (data.reviews || []).length
      ? data.reviews.map(review => `
          <div class="spike-market-review">
            <strong>★ ${Number(review.rating || 0)} · ${escapeHtml(review.buyer_username || 'buyer')}</strong>
            <div class="spike-market-subtle">${escapeHtml(review.listing_title || 'Сделка')}</div>
            <div>${escapeHtml(review.comment || 'Без комментария')}</div>
          </div>
        `).join('')
      : '<div class="spike-market-review">Отзывов пока нет.</div>';
    reviewsEl.innerHTML = `
      <div class="spike-seller-trust-grid">
        <div class="sn-card-muted spike-seller-trust-card">Успешность<strong>${successRate}%</strong></div>
        <div class="sn-card-muted spike-seller-trust-card">Сделки<strong>${completed}/${total}</strong></div>
        <div class="sn-card-muted spike-seller-trust-card">Споры<strong>${disputes}</strong></div>
      </div>
      ${activeListingsHtml}
      <div class="spike-market-head" style="margin-top:14px;">
        <div>
          <div class="spike-market-title">Отзывы</div>
          <div class="spike-market-subtle">${seller.review_count || 0} всего</div>
        </div>
      </div>
      ${reviewsHtml}
    `;
  } catch (err) {
    statsEl.textContent = 'не удалось загрузить профиль';
    reviewsEl.innerHTML = '<div class="spike-market-review">Попробуй обновить позже.</div>';
  }
}

async function openMarketSellerProfile(sellerId, encodedName) {
  const overlay = document.getElementById('marketSellerOverlay');
  const nameEl = document.getElementById('market-seller-name');
  const statsEl = document.getElementById('market-seller-stats');
  const reviewsEl = document.getElementById('market-seller-reviews');
  if (!overlay || !nameEl || !statsEl || !reviewsEl) return;
  const fallbackName = decodeURIComponent(encodedName || 'Seller');
  nameEl.textContent = fallbackName;
  statsEl.textContent = 'загружаю профиль продавца';
  reviewsEl.innerHTML = '<div class="spike-market-review">Загрузка...</div>';
  overlay.classList.add('active');

  try {
    const res = await fetch(`/api/market/sellers/${sellerId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'seller load failed');
    const seller = data.seller || {};
    const rating = Number(seller.rating || 0).toFixed(1);
    const completed = Number(seller.completed_trades || 0);
    const total = Number(seller.total_trades || 0);
    const disputes = Number(seller.dispute_count || 0);
    const openDisputes = Number(seller.open_disputes || 0);
    const successRate = Number(seller.success_rate || 0);
    const riskScore = Number(seller.risk_score || 0);
    const trustBadge = getSellerTrustBadge(seller);
    const trustClass = sellerTrustClass(seller);
    const avatar = escapeHtmlAttr(seller.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seller.username || fallbackName)}`);
    const moderatorFlagTools = userLooksLikeMarketModerator()
      ? `
        <div class="spike-market-protect spike-seller-moderation" style="margin-top:12px;">
          <strong>Модерация продавца</strong>
          <div class="spike-market-subtle">Текущий флаг: ${escapeHtml(seller.manual_flag || 'none')} ${seller.flag_note ? `· ${escapeHtml(seller.flag_note)}` : ''}</div>
          <div class="spike-moderation-grid">
            <select id="seller-flag-select-${seller.id}">
              <option value="none" ${seller.manual_flag === 'none' ? 'selected' : ''}>none</option>
              <option value="verified" ${seller.manual_flag === 'verified' ? 'selected' : ''}>verified</option>
              <option value="trusted" ${seller.manual_flag === 'trusted' ? 'selected' : ''}>trusted</option>
              <option value="risky" ${seller.manual_flag === 'risky' ? 'selected' : ''}>risky</option>
              <option value="blocked" ${seller.manual_flag === 'blocked' ? 'selected' : ''}>blocked</option>
            </select>
            <input id="seller-flag-note-${seller.id}" placeholder="комментарий модератора" value="${escapeHtmlAttr(seller.flag_note || '')}">
            <button class="sn-btn spike-mini-btn social-action-btn" onclick="setMarketSellerFlag(${seller.id})">Сохранить</button>
          </div>
        </div>
      `
      : '';
    nameEl.textContent = seller.username || fallbackName;
    statsEl.textContent = `${trustBadge} · рейтинг ${rating} · риск ${riskScore}/100 · отзывов ${seller.review_count || 0}`;

    const activeListingsHtml = (data.activeListings || []).length
      ? `
        <div class="spike-market-head" style="margin-top:14px;">
          <div>
            <div class="spike-market-title">Активные лоты</div>
            <div class="spike-market-subtle">${data.activeListings.length} доступно сейчас</div>
          </div>
        </div>
        <div class="spike-seller-listing-grid">
          ${(data.activeListings || []).map(listing => `
            <div class="sn-card spike-market-card spike-listing-card">
              ${renderListingImage(listing.image_url, listing.title, listing.category)}
              <div class="spike-market-card-top">
                ${renderMarketCategoryBadge(listing.category)}
                <span class="sn-badge spike-market-chip">${Math.round(Number(listing.price || 0))} SPK</span>
              </div>
              <h4>${escapeHtml(listing.title || 'Lot')}</h4>
              <div class="spike-market-subtle">${escapeHtml(listing.description || 'no description')}</div>
              <button class="sn-btn spike-mini-btn social-action-btn" onclick="closeMarketSellerProfile(); openMarketProductPage(${listing.id})">Открыть лот</button>
            </div>
          `).join('')}
        </div>
      `
      : '<div class="spike-market-review" style="margin-top:14px;">Активных лотов сейчас нет.</div>';

    const reviewsHtml = (data.reviews || []).length
      ? data.reviews.map(review => `
          <div class="spike-market-review">
            <strong>оценка ${Number(review.rating || 0)}/5 · ${escapeHtml(review.buyer_username || 'buyer')}</strong>
            <div class="spike-market-subtle">${escapeHtml(review.listing_title || 'Сделка')} · ${escapeHtml(formatSellerDate(review.created_at))}</div>
            <div>${escapeHtml(review.comment || 'Без комментария')}</div>
          </div>
        `).join('')
      : '<div class="spike-market-review">Отзывов пока нет.</div>';

    const recentTradesHtml = (data.recentTrades || []).length
      ? data.recentTrades.map(trade => `
          <div class="spike-market-review">
            <strong>${escapeHtml(trade.title || 'Сделка')} · ${Math.round(Number(trade.price || 0))} SPK</strong>
            <div class="spike-market-subtle">${escapeHtml(trade.status || 'pending')} · покупатель ${escapeHtml(trade.buyer_username || 'unknown')} · ${escapeHtml(formatSellerDate(trade.created_at))}</div>
          </div>
        `).join('')
      : '<div class="spike-market-review">Истории сделок пока нет.</div>';

    reviewsEl.innerHTML = `
      <div class="spike-seller-hero">
        <img class="sn-avatar spike-seller-avatar" src="${avatar}">
        <div>
          <div class="spike-seller-name-row">
            <strong>${escapeHtml(seller.username || fallbackName)}</strong>
            <span class="sn-badge spike-seller-badge ${trustClass}">${escapeHtml(trustBadge)}</span>
            ${seller.verified ? '<span class="sn-badge spike-seller-badge verified">verified</span>' : ''}
          </div>
          <div class="spike-seller-badge-row" style="margin-top:8px;">
            <span class="sn-badge spike-market-chip">статус: ${escapeHtml(seller.current_status || 'offline')}</span>
            <span class="sn-badge spike-market-chip">с ${escapeHtml(formatSellerDate(seller.first_sale_at))}</span>
            <span class="sn-badge spike-market-chip">${escapeHtml(seller.response_time_label || 'response unknown')}</span>
          </div>
        </div>
      </div>

      ${moderatorFlagTools}

      <div class="spike-seller-trust-grid" style="margin-top:12px;">
        <div class="sn-card-muted spike-seller-trust-card">Риск<strong>${riskScore}/100</strong></div>
        <div class="sn-card-muted spike-seller-trust-card">Успешность<strong>${successRate}%</strong></div>
        <div class="sn-card-muted spike-seller-trust-card">Сделки<strong>${completed}/${total}</strong></div>
        <div class="sn-card-muted spike-seller-trust-card">Рейтинг<strong>${rating}</strong></div>
        <div class="sn-card-muted spike-seller-trust-card">Споры<strong>${disputes}</strong></div>
        <div class="sn-card-muted spike-seller-trust-card">Открытые<strong>${openDisputes}</strong></div>
        <div class="sn-card-muted spike-seller-trust-card">Повторы<strong>${Number(seller.repeat_buyers || 0)}</strong></div>
      </div>
      <div class="spike-risk-reasons" style="margin-top:10px;">${renderRiskReasons(seller.risk_reasons)}</div>

      ${activeListingsHtml}

      <div class="spike-market-head" style="margin-top:14px;">
        <div>
          <div class="spike-market-title">Отзывы</div>
          <div class="spike-market-subtle">${seller.review_count || 0} всего</div>
        </div>
      </div>
      ${reviewsHtml}

      <div class="spike-market-head" style="margin-top:14px;">
        <div>
          <div class="spike-market-title">Последние сделки</div>
          <div class="spike-market-subtle">свежая активность продавца</div>
        </div>
      </div>
      ${recentTradesHtml}
    `;
  } catch (err) {
    statsEl.textContent = 'не удалось загрузить профиль продавца';
    reviewsEl.innerHTML = '<div class="spike-market-review">Попробуй обновить позже.</div>';
  }
}

function closeMarketSellerProfile(event) {
  if (event && event.target?.id !== 'marketSellerOverlay') return;
  document.getElementById('marketSellerOverlay')?.classList.remove('active');
}

function renderMarketDeliveryTerms(listing) {
  const description = String(listing.description || '').trim();
  const lines = description.split(/\n+/).map(line => line.trim()).filter(Boolean);
  const termLine = lines.find(line => /услов|передач|delivery|transfer|region|регион/i.test(line));
  if (termLine) return termLine;
  if (listing.category === 'service') return 'Условия услуги согласуются в чате сделки. Оплата держится в escrow до подтверждения результата.';
  if (listing.category === 'account') return 'Передача аккаунта только через чат сделки: логин, почта, смена доступа и подтверждение покупателем.';
  if (listing.category === 'item') return 'Передача предмета через внутриигровой трейд или agreed trade-link. Подтверждай только после получения.';
  return 'Продавец передаёт лот в чате сделки. Деньги выходят из escrow только после подтверждения покупателем.';
}

function getSimilarMarketListings(listing) {
  return (marketState.listings || [])
    .filter(item => Number(item.id) !== Number(listing.id))
    .filter(item => item.category === listing.category || item.market_game === listing.market_game || item.market_region === listing.market_region)
    .sort((a, b) => {
      const aScore = (a.category === listing.category ? 2 : 0) + (a.market_game === listing.market_game ? 2 : 0) + (a.market_region === listing.market_region ? 1 : 0);
      const bScore = (b.category === listing.category ? 2 : 0) + (b.market_game === listing.market_game ? 2 : 0) + (b.market_region === listing.market_region ? 1 : 0);
      return bScore - aScore || Number(b.watch_count || 0) - Number(a.watch_count || 0);
    })
    .slice(0, 4);
}

function openMarketProductPage(listingId, options = {}) {
  const listing = (marketState.listings || []).find(item => Number(item.id) === Number(listingId));
  const overlay = document.getElementById('marketProductOverlay');
  const titleEl = document.getElementById('market-product-title');
  const subtitleEl = document.getElementById('market-product-subtitle');
  const bodyEl = document.getElementById('market-product-body');
  if (!listing || !overlay || !titleEl || !subtitleEl || !bodyEl) return;

  currentMarketProductId = Number(listing.id);
  const price = Number(listing.price || 0);
  const balance = Number(marketState.wallet?.balance || 0);
  const mine = Number(listing.seller_id) === Number(currentUserId);
  const sellerBlocked = listing.seller_manual_flag === 'blocked';
  const sellerName = listing.seller_username || 'Spike trader';
  const sellerEncoded = encodeURIComponent(sellerName);
  const marketGame = listing.market_game || inferMarketGame(listing);
  const marketRegion = listing.market_region || inferMarketRegion(listing);
  const similar = getSimilarMarketListings(listing);
  const verifiedBadge = isMarketSellerVerified(listing) ? '<span class="sn-badge spike-seller-badge verified">verified</span>' : '<span class="sn-badge spike-seller-badge new">not verified</span>';

  titleEl.textContent = listing.title || 'Лот';
  subtitleEl.textContent = `${renderMarketCategory(listing.category)} · ${marketGame === 'other' ? 'other game' : marketGame} · ${marketRegion}`;
  bodyEl.innerHTML = `
    <div class="spike-product-layout">
      <div class="spike-product-main">
        <div class="spike-product-gallery">
          <img src="${escapeHtml(getListingImageUrl(listing))}" alt="" onerror="this.closest('.spike-product-gallery').classList.add('broken'); this.remove();">
          <span>${escapeHtml(renderMarketCategory(listing.category))}</span>
        </div>
        <div class="spike-product-hero">
          <div class="spike-product-title-row">
            <div>
              <div class="spike-market-card-top" style="justify-content:flex-start; margin-bottom:10px;">
                ${renderMarketCategoryBadge(listing.category)}
                <span class="sn-badge spike-market-chip">${escapeHtml(marketGame === 'other' ? 'other game' : marketGame)}</span>
                <span class="sn-badge spike-market-chip">${escapeHtml(marketRegion)}</span>
                <span class="sn-badge spike-market-chip">${Number(listing.watch_count || 0)} saved</span>
              </div>
              <h3>${escapeHtml(listing.title || 'Лот')}</h3>
            </div>
            <div class="spike-product-price">${Math.round(price)} SPK</div>
          </div>
        </div>

        <div class="spike-product-section">
          <h4>Описание</h4>
          <div class="spike-market-subtle">${escapeHtml(listing.description || 'Продавец пока не добавил подробное описание.')}</div>
        </div>

        <div class="spike-product-section">
          <h4>Условия передачи</h4>
          <div class="spike-market-subtle">${escapeHtml(renderMarketDeliveryTerms(listing))}</div>
        </div>

        <div class="spike-product-section">
          <h4>Escrow-защита</h4>
          <div class="sn-card-muted spike-market-protect">
            SPK замораживаются в escrow. Покупатель подтверждает получение после передачи лота. Если условия не совпали, можно открыть спор и приложить доказательства из сделки.
          </div>
        </div>
      </div>

      <div class="spike-product-side">
        <div class="spike-product-section spike-product-seller">
          <h4>Продавец</h4>
          <strong>${escapeHtml(sellerName)}</strong>
          <div class="spike-seller-badge-row">
            ${verifiedBadge}
            ${renderSellerRating(listing)}
            <span class="sn-badge spike-market-chip">${Math.round(Number(listing.seller_success_rate || 0))}% success</span>
          </div>
          <div class="spike-product-meta-grid">
            <div class="spike-wallet-metric">Сделок<strong>${Number(listing.seller_total_trades || 0)}</strong></div>
            <div class="spike-wallet-metric">Споров<strong>${Number(listing.seller_dispute_count || 0)}</strong></div>
          </div>
          <button class="sn-btn spike-mini-btn social-action-btn" onclick="openMarketSellerProfile(${listing.seller_id}, '${sellerEncoded}')">Профиль продавца</button>
          <button class="sn-btn spike-mini-btn social-action-btn" onclick="openTradeChat(${listing.seller_id}, '${sellerEncoded}')">Написать продавцу</button>
        </div>

        <div class="spike-product-section">
          <h4>Покупка</h4>
          <div class="spike-ticket-summary">
            <div class="spike-ticket-row"><span>Цена</span><strong>${Math.round(price)} SPK</strong></div>
            <div class="spike-ticket-row"><span>Баланс</span><strong>${Math.round(balance)} SPK</strong></div>
          </div>
          ${mine
            ? `<button class="sn-btn spike-mini-btn social-action-btn" onclick="cancelMarketListing(${listing.id})">Снять лот</button>`
            : `<button class="sn-btn spike-mini-btn social-action-btn" onclick="openMarketBuyTicket(${listing.id})" ${balance < price || sellerBlocked ? 'disabled style="opacity:.45;"' : ''}>Купить через escrow</button>`}
          ${sellerBlocked ? '<div class="spike-ticket-warning" style="margin-top:10px;">Продавец заблокирован модерацией для новых сделок.</div>' : ''}
          ${balance < price && !mine && !sellerBlocked ? '<div class="spike-ticket-warning" style="margin-top:10px;">Не хватает SPK. Пополни кошелёк перед покупкой.</div>' : ''}
        </div>

        <div class="spike-product-section spike-product-similar">
          <h4>Похожие лоты</h4>
          ${similar.length ? similar.map(item => `
            <div class="spike-product-similar-item">
              <div class="spike-product-similar-image">
                <img src="${escapeHtml(getListingImageUrl(item))}" alt="" loading="lazy" onerror="this.remove();">
              </div>
              <div style="min-width:0;">
                <strong>${escapeHtml(item.title || 'Лот')}</strong>
                <div class="spike-market-subtle">${Math.round(Number(item.price || 0))} SPK · ${escapeHtml(renderMarketCategory(item.category))}</div>
              </div>
              <button class="sn-btn spike-mini-btn social-action-btn" onclick="openMarketProductPage(${item.id})">Открыть</button>
            </div>
          `).join('') : '<div class="spike-market-subtle">Похожих активных лотов пока нет.</div>'}
        </div>
      </div>
    </div>
  `;
  overlay.classList.add('active');
  if (!options.skipHistory && window.location.pathname !== `/market/listing/${listing.id}`) {
    window.history.pushState({ marketListingId: listing.id }, '', `/market/listing/${listing.id}`);
  }
}

function closeMarketProductPage(event, options = {}) {
  if (event && event.target?.id !== 'marketProductOverlay') return;
  document.getElementById('marketProductOverlay')?.classList.remove('active');
  currentMarketProductId = null;
  if (!options.skipHistory && /^\/market\/listing\/\d+$/.test(window.location.pathname)) {
    window.history.pushState({}, '', '/');
  }
}

function openMarketBuyTicket(listingId) {
  const listing = (marketState.listings || []).find(item => Number(item.id) === Number(listingId));
  const overlay = document.getElementById('marketBuyTicketOverlay');
  const titleEl = document.getElementById('market-ticket-title');
  const subtitleEl = document.getElementById('market-ticket-subtitle');
  const bodyEl = document.getElementById('market-ticket-body');
  const chatBtn = document.getElementById('market-ticket-chat-btn');
  const sellerBtn = document.getElementById('market-ticket-seller-btn');
  const confirmBtn = document.getElementById('market-ticket-confirm-btn');
  if (!listing || !overlay || !titleEl || !subtitleEl || !bodyEl || !confirmBtn) return;

  currentMarketTicketId = Number(listing.id);
  const price = Number(listing.price || 0);
  const balance = Number(marketState.wallet?.balance || 0);
  const fee = Math.round(price * 0.02);
  const total = Math.round(price);
  const sellerName = listing.seller_username || 'Spike trader';
  const sellerRating = Number(listing.seller_rating || 0);
  const sellerReviews = Number(listing.seller_review_count || 0);
  const canBuy = balance >= total;

  titleEl.textContent = listing.title || 'Покупка лота';
  subtitleEl.textContent = `${renderMarketCategory(listing.category)} · escrow ticket`;
  bodyEl.innerHTML = `
    <div class="spike-ticket-summary">
      <div class="spike-ticket-row"><span>Цена</span><strong>${Math.round(price)} SPK</strong></div>
      <div class="spike-ticket-row"><span>Комиссия SpikeNet 2%</span><strong>${fee} SPK при выплате</strong></div>
      <div class="spike-ticket-row spike-ticket-total"><span>Итого к заморозке</span><strong>${total} SPK</strong></div>
      <div class="spike-ticket-row"><span>Твой баланс</span><strong>${Math.round(balance)} SPK</strong></div>
      <div class="spike-ticket-row"><span>Продавец</span><strong>${escapeHtml(sellerName)} · ${sellerReviews ? `★ ${sellerRating.toFixed(1)} (${sellerReviews})` : 'new seller'}</strong></div>
      <div class="spike-ticket-row"><span>После покупки</span><strong>SPK уйдут в escrow</strong></div>
    </div>
    <div class="spike-checkout-steps">
      <span>1. Заморозка SPK</span>
      <span>2. Чат сделки</span>
      <span>3. Передача лота</span>
      <span>4. Подтверждение</span>
    </div>
    <div class="sn-card-muted spike-market-protect">
      <strong>Spike Protect</strong><br>
      Оплата замораживается. Подтверждай получение только после передачи лота. Если что-то пошло не так, открывай спор в сделках.
    </div>
    ${canBuy ? '' : '<div class="spike-ticket-warning" style="margin-top:10px;">Не хватает SPK для покупки. Пополни кошелёк во вкладке Кошелёк.</div>'}
  `;
  if (chatBtn) chatBtn.onclick = () => openTradeChat(listing.seller_id, encodeURIComponent(sellerName));
  if (sellerBtn) sellerBtn.onclick = () => openMarketSellerProfile(listing.seller_id, encodeURIComponent(sellerName));
  confirmBtn.disabled = !canBuy;
  confirmBtn.style.opacity = canBuy ? '1' : '0.45';
  confirmBtn.onclick = () => buyMarketListing(currentMarketTicketId);
  overlay.classList.add('active');
}

function closeMarketBuyTicket(event) {
  if (event && event.target?.id !== 'marketBuyTicketOverlay') return;
  document.getElementById('marketBuyTicketOverlay')?.classList.remove('active');
  currentMarketTicketId = null;
}

async function buyMarketListing(listingId) {
  try {
    const res = await fetch(`/api/market/listings/${listingId}/buy`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось купить лот', 'Marketplace', 'error');
    closeMarketBuyTicket();
    closeMarketProductPage();
    switchMarketTab('trades');
    showSpikeAlert('Деньги заморожены в escrow. Подтверди получение после передачи.', 'Marketplace', 'success');
    await loadMarketplace();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function topUpMarketWallet(presetAmount) {
  const raw = presetAmount || prompt('Сколько SPK добавить?');
  if (!raw) return;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    return showSpikeAlert('Сумма должна быть от 1 до 10000 SPK.', 'Marketplace', 'error');
  }
  const reference = prompt('Комментарий/референс оплаты: карта, чек, tx id. Можно оставить пустым.') || '';
  try {
    const res = await fetch('/api/market/wallet/topup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, reference })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось создать заявку на пополнение', 'Marketplace', 'error');
    showSpikeAlert(`Заявка на пополнение ${Math.round(amount)} SPK создана. Модератор подтвердит платёж.`, 'Marketplace', 'success');
    await loadMarketplace();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function withdrawMarketWallet() {
  const raw = prompt('Сколько SPK вывести?');
  if (!raw) return;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    return showSpikeAlert('Сумма вывода должна быть от 1 до 10000 SPK.', 'Marketplace', 'error');
  }
  const destination = prompt('Куда вывести: карта, кошелёк, контакт или реквизиты') || '';
  if (destination.trim().length < 4) {
    return showSpikeAlert('Укажи реквизиты вывода.', 'Marketplace', 'error');
  }
  const note = prompt('Комментарий к выводу. Можно оставить пустым.') || '';
  try {
    const res = await fetch('/api/market/wallet/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, destination, note })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось создать заявку на вывод', 'Marketplace', 'error');
    showSpikeAlert(`Заявка на вывод ${Math.round(amount)} SPK создана. Средства зарезервированы до решения модератора.`, 'Marketplace', 'success');
    await loadMarketplace();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function watchMarketListing(listingId) {
  try {
    const res = await fetch(`/api/market/listings/${listingId}/watch`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось сохранить лот', 'Marketplace', 'error');
    showSpikeAlert('Лот добавлен в Watchlist.', 'Marketplace', 'success');
    await loadMarketplace();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function unwatchMarketListing(listingId) {
  try {
    const res = await fetch(`/api/market/listings/${listingId}/watch`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось убрать лот', 'Marketplace', 'error');
    showSpikeAlert('Лот убран из Watchlist.', 'Marketplace', 'success');
    await loadMarketplace();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function cancelMarketListing(listingId) {
  try {
    const res = await fetch(`/api/market/listings/${listingId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось снять лот', 'Marketplace', 'error');
    showSpikeAlert('Лот снят.', 'Marketplace', 'success');
    await loadMarketplace();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function confirmMarketTrade(tradeId) {
  try {
    const res = await fetch(`/api/market/trades/${tradeId}/confirm`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось подтвердить сделку', 'Marketplace', 'error');
    closeMarketDealRoom();
    showSpikeAlert('Escrow выпущен продавцу.', 'Marketplace', 'success');
    await loadMarketplace();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function reviewMarketTrade(tradeId) {
  const ratingRaw = prompt('Оценка продавца от 1 до 5');
  if (ratingRaw === null) return;
  const rating = Number(ratingRaw);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return showSpikeAlert('Нужна оценка от 1 до 5.', 'Marketplace', 'error');
  }
  const comment = prompt('Короткий отзыв о сделке') || '';
  try {
    const res = await fetch(`/api/market/trades/${tradeId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, comment })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось сохранить отзыв', 'Marketplace', 'error');
    showSpikeAlert('Отзыв сохранён. Репутация продавца обновлена.', 'Marketplace', 'success');
    await loadMarketplace();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function openMarketDispute(tradeId) {
  const reason = prompt('Опиши проблему по сделке');
  if (!reason) return;
  if (reason.trim().length < 8) {
    return showSpikeAlert('Опиши проблему чуть подробнее.', 'Marketplace', 'error');
  }
  const evidence = parseEvidencePrompt(prompt('Доказательства: ссылки/текст, по одному на строку. Можно оставить пустым.') || '');
  try {
    const res = await fetch(`/api/market/trades/${tradeId}/dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, evidence })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось открыть спор', 'Marketplace', 'error');
    closeMarketDealRoom();
    showSpikeAlert('Спор открыт. Сделка помечена в истории.', 'Marketplace', 'warning');
    await loadMarketplace();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function addMarketDisputeEvidence(disputeId) {
  const evidence = parseEvidencePrompt(prompt('Доказательства: ссылки/текст, по одному на строку') || '');
  if (!evidence.length) return;
  const note = prompt('Короткая заметка к доказательствам') || '';
  if (note.trim()) evidence.forEach(item => { item.note = note.trim(); });
  try {
    const res = await fetch(`/api/market/disputes/${disputeId}/evidence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось добавить доказательства', 'Marketplace', 'error');
    showSpikeAlert('Доказательства добавлены в спор.', 'Marketplace', 'success');
    await loadMarketplace();
    if (marketUiState.tab === 'moderation') await loadMarketModeration();
    if (currentMarketDealId) openMarketDealRoom(currentMarketDealId);
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function resolveMarketDispute(disputeId, resolution) {
  const label = resolution === 'refund_buyer'
    ? 'вернуть SPK покупателю'
    : 'выплатить SPK продавцу';
  if (!confirm(`Закрыть спор и ${label}?`)) return;
  try {
    const noteInput = document.getElementById(`market-dispute-note-${disputeId}`);
    const typedNote = noteInput ? noteInput.value.trim() : '';
    const moderator_note = typedNote || (prompt('Комментарий модератора: почему такое решение?') || '').trim();
    if (moderator_note.length < 8) {
      showSpikeAlert('Нужен комментарий модератора: минимум 8 символов.', 'Marketplace', 'warning');
      if (noteInput) noteInput.focus();
      return;
    }
    const res = await fetch(`/api/market/disputes/${disputeId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolution, moderator_note })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось закрыть спор', 'Marketplace', 'error');
    closeMarketDealRoom();
    showSpikeAlert('Спор закрыт, escrow пересчитан.', 'Marketplace', 'success');
    await loadMarketplace();
    if (marketUiState.tab === 'moderation') await loadMarketModeration();
    if (document.body.classList.contains('admin-mode')) await loadAdminModerationCenter();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function resolveMarketPayment(paymentId, decision) {
  const label = decision === 'approve' ? 'подтвердить платёж' : 'отклонить платёж';
  if (!confirm(`${label}?`)) return;
  const noteInput = document.getElementById(`market-payment-note-${paymentId}`);
  const typedNote = noteInput ? noteInput.value.trim() : '';
  const moderator_note = typedNote || prompt('Комментарий модератора к платежу') || '';
  try {
    const res = await fetch(`/api/market/admin/payments/${paymentId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, moderator_note })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось обработать платёж', 'Marketplace', 'error');
    showSpikeAlert(decision === 'approve' ? 'Платёж подтверждён.' : 'Платёж отклонён.', 'Marketplace', 'success');
    await loadMarketplace();
    if (marketUiState.tab === 'moderation') await loadMarketModeration();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

async function cancelMarketTrade(tradeId) {
  try {
    const res = await fetch(`/api/market/trades/${tradeId}/cancel`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showSpikeAlert(data.error || 'Не удалось отменить escrow', 'Marketplace', 'error');
    closeMarketDealRoom();
    showSpikeAlert('Escrow отменён, средства возвращены покупателю.', 'Marketplace', 'success');
    await loadMarketplace();
  } catch (err) {
    showSpikeAlert('Ошибка связи с маркетом.', 'Marketplace', 'error');
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('.ps-social-sidebar') || e.target.closest('.theme-toggle-btn')) return;
  const sidebar = document.getElementById('socialSidebar');
  if (sidebar && sidebar.classList.contains('open')) sidebar.classList.remove('open');
});

window.addEventListener('popstate', () => {
  const productMatch = window.location.pathname.match(/^\/market\/listing\/(\d+)$/);
  if (productMatch) {
    openMarketScreen();
    const listingId = Number(productMatch[1]);
    Promise.resolve((marketState.listings || []).length ? null : loadMarketplace())
      .then(() => openMarketProductPage(listingId, { skipHistory: true }));
  } else {
    closeMarketProductPage(null, { skipHistory: true });
  }
});

// --- УПРАВЛЕНИЕ МОДАЛЬНЫМИ ОКНАМИ С ТАБАМИ И КАРТОЧКОЙ ПРОФИЛЯ ---
const settingsOverlay = document.getElementById('settingsModalOverlay');
const profileOverlay = document.getElementById('profileCardOverlay');

function openSettingsModal() { settingsOverlay.classList.add('active'); }
function closeSettingsModal() { settingsOverlay.classList.remove('active'); }
function openProfileCard() { profileOverlay.classList.add('active'); }
function closeProfileCard() { profileOverlay.classList.remove('active'); }

window.toggleSocialSidebar = function() {
  const sidebar = document.getElementById('socialSidebar');
  if (sidebar) sidebar.classList.toggle('open');
};

window.openSocialSidebar = function() {
  const sidebar = document.getElementById('socialSidebar');
  if (sidebar) sidebar.classList.add('open');
};

function switchSettingsTab(event, tabId) {
  document.querySelectorAll('.ps-tab-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.ps-tab-btn').forEach(b => b.classList.remove('active'));
  
  document.getElementById(tabId).classList.add('active');
  event.currentTarget.classList.add('active');

  const titles = { 'tab-visual': 'Кастомизация интерфейса', 'tab-analytics': 'Market-настройки' };
  document.getElementById('ps-modal-title-dyn').innerText = titles[tabId];
}

// --- 👥 ЖЕЛЕЗНЫЙ JS МОДУЛЬ СИСТЕМЫ ДРУЗЕЙ ---
window.switchSocialTab = function(event, tabId) {
  document.querySelectorAll('.ps-social-content').forEach(c => {
    c.style.setProperty('display', 'none', 'important');
    c.classList.remove('active');
  });
  document.querySelectorAll('.ps-social-tab-btn').forEach(b => b.classList.remove('active'));
  
  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.style.setProperty('display', 'flex', 'important');
    targetTab.classList.add('active');
  }
  if (event?.currentTarget) {
    event.currentTarget.classList.add('active');
  } else {
    document.querySelector(`.ps-social-tab-btn[onclick*="${tabId}"]`)?.classList.add('active');
  }
};
