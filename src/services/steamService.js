const axios = require('axios');

function extractSteamAppId(productUrl) {
  const match = String(productUrl || '').match(/app\/(\d+)/);
  return match ? match[1] : null;
}

async function searchSteam(term) {
  const response = await axios.get('https://store.steampowered.com/api/storesearch/', {
    params: { term, l: 'russian', cc: 'kz' },
    timeout: 10000
  });

  return (response.data.items || []).map((item) => ({
    id: item.id,
    title: item.name,
    price: item.price ? item.price.final / 100 : 0,
    image: item.tiny_image,
    url: `https://store.steampowered.com/app/${item.id}/`
  }));
}

async function getAppDetails(appId) {
  const response = await axios.get('https://store.steampowered.com/api/appdetails', {
    params: { appids: appId, cc: 'kz' },
    timeout: 15000
  });

  const app = response.data[appId];
  if (!app || !app.success) return null;
  return app.data;
}

async function getSteamReviews(appId) {
  try {
    const response = await axios.get(`https://store.steampowered.com/appreviews/${appId}`, {
      params: {
        json: 1,
        language: 'all',
        purchase_type: 'all',
        num_per_page: 0
      },
      timeout: 10000
    });

    const summary = response.data.query_summary || {};
    return {
      score_desc: summary.review_score_desc || '',
      percent: summary.total_positive && summary.total_reviews
        ? Math.round((summary.total_positive / summary.total_reviews) * 100)
        : 0
    };
  } catch (err) {
    return { score_desc: '', percent: 0 };
  }
}

function extractGameplayHours(aboutText, genres) {
  const text = `${aboutText || ''} ${genres || ''}`.toLowerCase();
  if (text.includes('rpg') || text.includes('role-playing')) return 40;
  if (text.includes('strategy') || text.includes('simulation')) return 25;
  if (text.includes('roguelike') || text.includes('survival')) return 20;
  if (text.includes('multiplayer') || text.includes('co-op')) return 30;
  return 15;
}

function isCoopGame(gameData) {
  const categories = gameData.categories || [];
  return categories.some((cat) => {
    const description = String(cat.description || '').toLowerCase();
    return ['co-op', 'multi-player', 'multiplayer', 'кооператив'].some((keyword) => description.includes(keyword));
  });
}

module.exports = {
  extractSteamAppId,
  searchSteam,
  getAppDetails,
  getSteamReviews,
  extractGameplayHours,
  isCoopGame
};
