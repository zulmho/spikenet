const express = require('express');
const pool = require('../../config/db');
const { validateBody } = require('../../middleware/validate');
const { calculateSellerRiskScore } = require('../../services/marketTrust');
const { ensureMarketSchema, isMarketModerator } = require('../../services/marketCore');

const router = express.Router();

router.get('/sellers/:id', async (req, res) => {
  const sellerId = Number(req.params.id);
  if (!Number.isInteger(sellerId)) return res.status(400).json({ error: 'Invalid seller' });

  try {
    await ensureMarketSchema();
    const sellerRes = await pool.query(
      `SELECT u.id, u.username, u.user_tag, u.avatar_url, u.current_status,
              COALESCE(rr.rating, 0) AS rating,
              COALESCE(rr.review_count, 0) AS review_count,
              COALESCE(tt.completed_trades, 0) AS completed_trades,
              COALESCE(tt.total_trades, 0) AS total_trades,
              COALESCE(tt.cancelled_trades, 0) AS cancelled_trades,
              COALESCE(tt.first_sale_at, NULL) AS first_sale_at,
              COALESCE(tt.last_sale_at, NULL) AS last_sale_at,
              COALESCE(tt.repeat_buyers, 0) AS repeat_buyers,
              COALESCE(tt.avg_confirm_hours, NULL) AS avg_confirm_hours,
              COALESCE(dd.dispute_count, 0) AS dispute_count,
              COALESCE(dd.open_disputes, 0) AS open_disputes,
              COALESCE(aa.active_listings, 0) AS active_listings,
              COALESCE(msf.flag, 'none') AS manual_flag,
              COALESCE(msf.note, '') AS flag_note,
              flagger.username AS flagged_by_username,
              msf.updated_at AS flag_updated_at
       FROM users u
       LEFT JOIN (
         SELECT seller_id, ROUND(AVG(rating)::numeric, 1) AS rating, COUNT(*)::int AS review_count
         FROM market_reviews
         GROUP BY seller_id
       ) rr ON rr.seller_id = u.id
       LEFT JOIN (
         SELECT seller_id,
                COUNT(*)::int AS total_trades,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_trades,
                COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_trades,
                MIN(confirmed_at) FILTER (WHERE status = 'completed') AS first_sale_at,
                MAX(confirmed_at) FILTER (WHERE status = 'completed') AS last_sale_at,
                COUNT(DISTINCT buyer_id) FILTER (WHERE status = 'completed')::int AS repeat_buyers,
                ROUND(AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at)) / 3600) FILTER (WHERE status = 'completed' AND confirmed_at IS NOT NULL)::numeric, 1) AS avg_confirm_hours
         FROM market_trades
         GROUP BY seller_id
       ) tt ON tt.seller_id = u.id
       LEFT JOIN (
         SELECT seller_id,
                COUNT(*)::int AS dispute_count,
                COUNT(*) FILTER (WHERE status = 'open')::int AS open_disputes
         FROM market_disputes
         GROUP BY seller_id
       ) dd ON dd.seller_id = u.id
       LEFT JOIN (
         SELECT seller_id, COUNT(*)::int AS active_listings
         FROM market_listings
         WHERE status = 'active'
         GROUP BY seller_id
       ) aa ON aa.seller_id = u.id
       LEFT JOIN market_seller_flags msf ON msf.seller_id = u.id
       LEFT JOIN users flagger ON flagger.id = msf.updated_by
       WHERE u.id = $1
       GROUP BY u.id, u.username, u.user_tag, u.avatar_url, u.current_status, rr.rating, rr.review_count,
                tt.completed_trades, tt.total_trades, tt.cancelled_trades, tt.first_sale_at,
                tt.last_sale_at, tt.repeat_buyers, tt.avg_confirm_hours,
                dd.dispute_count, dd.open_disputes, aa.active_listings,
                msf.flag, msf.note, msf.updated_at, flagger.username`,
      [sellerId]
    );
    const seller = sellerRes.rows[0];
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    const totalTrades = Number(seller.total_trades || 0);
    const completedTrades = Number(seller.completed_trades || 0);
    const disputeCount = Number(seller.dispute_count || 0);
    const rating = Number(seller.rating || 0);
    seller.success_rate = totalTrades ? Math.round((completedTrades / totalTrades) * 100) : 0;
    seller.dispute_rate = totalTrades ? Math.round((disputeCount / totalTrades) * 100) : 0;
    const sellerRisk = calculateSellerRiskScore(seller);
    seller.risk_score = sellerRisk.score;
    seller.risk_reasons = sellerRisk.reasons;
    seller.verified = completedTrades >= 5 && rating >= 4.5 && seller.success_rate >= 85 && disputeCount <= 1;
    seller.trust_level = seller.verified
      ? 'verified'
      : disputeCount >= 3 || seller.dispute_rate >= 25
        ? 'risky'
        : completedTrades === 0
          ? 'new'
          : 'trusted';
    if (seller.manual_flag && seller.manual_flag !== 'none') {
      seller.trust_level = seller.manual_flag === 'blocked' ? 'risky' : seller.manual_flag;
      seller.verified = seller.manual_flag === 'verified';
    }
    const avgHours = Number(seller.avg_confirm_hours || 0);
    seller.response_time_label = avgHours
      ? avgHours < 1
        ? `~${Math.max(5, Math.round(avgHours * 60))} мин до закрытия`
        : `~${avgHours.toFixed(1)} ч до закрытия`
      : completedTrades >= 3
        ? '~30 мин ответа'
        : 'мало данных';

    const reviews = await pool.query(
      `SELECT mr.id, mr.rating, mr.comment, mr.created_at,
              buyer.username AS buyer_username,
              ml.title AS listing_title
       FROM market_reviews mr
       JOIN users buyer ON buyer.id = mr.buyer_id
       JOIN market_trades mt ON mt.id = mr.trade_id
       JOIN market_listings ml ON ml.id = mt.listing_id
       WHERE mr.seller_id = $1
       ORDER BY mr.created_at DESC
       LIMIT 20`,
      [sellerId]
    );

    const activeListings = await pool.query(
      `SELECT id, title, description, category, price, created_at, COALESCE(image_url, '') AS image_url
       FROM market_listings
       WHERE seller_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 12`,
      [sellerId]
    );

    const recentTrades = await pool.query(
      `SELECT mt.id, mt.price, mt.status, mt.created_at, mt.confirmed_at,
              ml.title,
              buyer.username AS buyer_username
       FROM market_trades mt
       JOIN market_listings ml ON ml.id = mt.listing_id
       JOIN users buyer ON buyer.id = mt.buyer_id
       WHERE mt.seller_id = $1
       ORDER BY mt.created_at DESC
       LIMIT 10`,
      [sellerId]
    );

    return res.json({
      seller,
      reviews: reviews.rows,
      activeListings: activeListings.rows,
      recentTrades: recentTrades.rows
    });
  } catch (err) {
    console.error('Seller profile failed:', err.message);
    return res.status(500).json({ error: 'Could not load seller profile' });
  }
});

router.post('/sellers/:id/flag', validateBody({
  flag: { type: 'enum', values: ['none', 'verified', 'trusted', 'risky', 'blocked'], required: true },
  note: { type: 'string', max: 500, default: '' }
}), async (req, res) => {
  const sellerId = Number(req.params.id);
  const flag = ['none', 'verified', 'trusted', 'risky', 'blocked'].includes(req.body.flag)
    ? req.body.flag
    : 'none';
  const note = String(req.body.note || '').trim().slice(0, 500);

  if (!Number.isInteger(sellerId)) return res.status(400).json({ error: 'Invalid seller' });

  try {
    await ensureMarketSchema();
    if (!(await isMarketModerator(req.user))) {
      return res.status(403).json({ error: 'Market moderator access required' });
    }

    const seller = await pool.query('SELECT id FROM users WHERE id = $1', [sellerId]);
    if (!seller.rows[0]) return res.status(404).json({ error: 'Seller not found' });

    if (flag === 'none') {
      await pool.query('DELETE FROM market_seller_flags WHERE seller_id = $1', [sellerId]);
    } else {
      await pool.query(
        `INSERT INTO market_seller_flags (seller_id, flag, note, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (seller_id) DO UPDATE
         SET flag = EXCLUDED.flag, note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [sellerId, flag, note, req.user.id]
      );
    }

    req.app.get('io')?.emit('marketUpdated');
    return res.json({ success: true, sellerId, flag, note });
  } catch (err) {
    console.error('Seller flag failed:', err.message);
    return res.status(500).json({ error: 'Could not update seller flag' });
  }
});

module.exports = router;
