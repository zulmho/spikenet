const MARKET_FEE_RATE = 0.02;

function calculateMarketFee(amount) {
  const price = Number(amount || 0);
  const fee = Math.round(price * MARKET_FEE_RATE * 100) / 100;
  return {
    fee,
    net: Math.max(Math.round((price - fee) * 100) / 100, 0)
  };
}

function calculateSellerRiskScore(stats = {}) {
  const total = Number(stats.total_trades || stats.seller_total_trades || 0);
  const completed = Number(stats.completed_trades || stats.seller_completed_trades || 0);
  const disputes = Number(stats.dispute_count || stats.seller_dispute_count || 0);
  const openDisputes = Number(stats.open_disputes || 0);
  const rating = Number(stats.rating || stats.seller_rating || 0);
  const reviews = Number(stats.review_count || stats.seller_review_count || 0);
  const flag = String(stats.manual_flag || stats.seller_manual_flag || 'none');

  let score = 0;
  const reasons = [];
  if (flag === 'blocked') {
    score += 80;
    reasons.push('seller blocked by moderation');
  } else if (flag === 'risky') {
    score += 45;
    reasons.push('seller marked risky');
  } else if (flag === 'verified' || flag === 'trusted') {
    score -= 15;
    reasons.push('moderator trust flag');
  }
  if (total === 0) {
    score += 18;
    reasons.push('new seller');
  }
  if (total > 0 && completed / total < 0.7) {
    score += 20;
    reasons.push('low completion rate');
  }
  if (disputes >= 3) {
    score += 30;
    reasons.push('many disputes');
  } else if (disputes > 0) {
    score += disputes * 8;
    reasons.push('has disputes');
  }
  if (openDisputes > 0) {
    score += openDisputes * 15;
    reasons.push('open disputes');
  }
  if (reviews > 0 && rating < 4) {
    score += 16;
    reasons.push('low rating');
  }
  if (completed >= 10 && rating >= 4.6 && disputes <= 1) {
    score -= 18;
    reasons.push('strong trade history');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons
  };
}

module.exports = {
  MARKET_FEE_RATE,
  calculateMarketFee,
  calculateSellerRiskScore
};
