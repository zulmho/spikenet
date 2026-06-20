const express = require('express');
const pool = require('../../config/db');
const { calculateSellerRiskScore } = require('../../services/marketTrust');
const { ensureMarketSchema, ensureWallet, isMarketModerator } = require('../../services/marketCore');

const router = express.Router();

router.get('/overview', async (req, res) => {
  try {
    await ensureMarketSchema();
    const wallet = await ensureWallet(req.user.id);

    const listings = await pool.query(
      `SELECT ml.id, ml.title, ml.description, ml.category, ml.price, ml.status, ml.created_at,
              COALESCE(ml.image_url, '') AS image_url,
              u.id AS seller_id, u.username AS seller_username, u.avatar_url AS seller_avatar,
              COALESCE(sr.avg_rating, 0) AS seller_rating,
              COALESCE(sr.review_count, 0) AS seller_review_count,
              COALESCE(st.total_trades, 0) AS seller_total_trades,
              COALESCE(st.completed_trades, 0) AS seller_completed_trades,
              COALESCE(st.dispute_count, 0) AS seller_dispute_count,
              CASE
                WHEN COALESCE(st.total_trades, 0) > 0
                THEN ROUND((COALESCE(st.completed_trades, 0)::numeric / st.total_trades::numeric) * 100)
                ELSE 0
              END AS seller_success_rate,
              (
                COALESCE(st.completed_trades, 0) >= 5
                AND COALESCE(sr.avg_rating, 0) >= 4.5
                AND COALESCE(st.dispute_count, 0) <= 1
              ) AS seller_verified,
              COALESCE(wc.watch_count, 0) AS watch_count,
              COALESCE(msf.flag, 'none') AS seller_manual_flag,
              COALESCE(msf.note, '') AS seller_flag_note,
              (mw.user_id IS NOT NULL) AS watched_by_me
       FROM market_listings ml
       JOIN users u ON u.id = ml.seller_id
       LEFT JOIN (
         SELECT seller_id, ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::int AS review_count
         FROM market_reviews
         GROUP BY seller_id
       ) sr ON sr.seller_id = ml.seller_id
       LEFT JOIN (
         SELECT seller_id,
                COUNT(*)::int AS total_trades,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_trades,
                COUNT(*) FILTER (WHERE EXISTS (
                  SELECT 1 FROM market_disputes md WHERE md.trade_id = market_trades.id
                ))::int AS dispute_count
         FROM market_trades
         GROUP BY seller_id
       ) st ON st.seller_id = ml.seller_id
       LEFT JOIN (
         SELECT listing_id, COUNT(*)::int AS watch_count
         FROM market_watchlist
         GROUP BY listing_id
       ) wc ON wc.listing_id = ml.id
       LEFT JOIN market_seller_flags msf ON msf.seller_id = ml.seller_id
       LEFT JOIN market_watchlist mw ON mw.listing_id = ml.id AND mw.user_id = $1
       WHERE ml.status = 'active'
       ORDER BY ml.created_at DESC
       LIMIT 60`,
      [req.user.id]
    );

    const trades = await pool.query(
      `SELECT mt.id, mt.listing_id, mt.price, mt.trade_hash, mt.status, mt.created_at, mt.confirmed_at, mt.cancelled_at,
              mt.seller_risk_score_snapshot, mt.seller_flag_snapshot, mt.seller_flag_note_snapshot,
              mt.buyer_id, mt.seller_id,
              buyer.username AS buyer_username,
              seller.username AS seller_username,
              ml.title,
              md.id AS dispute_id,
              md.status AS dispute_status,
              md.reason AS dispute_reason,
              md.resolution AS dispute_resolution,
              md.moderator_note AS dispute_moderator_note,
              md.resolved_at AS dispute_resolved_at,
              md.payout_user_id AS dispute_payout_user_id,
              md.payout_amount AS dispute_payout_amount,
              md.payout_note AS dispute_payout_note,
              md.risk_score_snapshot AS dispute_risk_score_snapshot,
              md.risk_breakdown AS dispute_risk_breakdown,
              resolver.username AS dispute_resolver_username,
              payout_user.username AS dispute_payout_username,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', mde.id,
                  'kind', mde.kind,
                  'content', mde.content,
                  'note', mde.note,
                  'created_at', mde.created_at,
                  'username', ev_user.username
                ) ORDER BY mde.created_at DESC)
                FROM market_dispute_evidence mde
                LEFT JOIN users ev_user ON ev_user.id = mde.user_id
                WHERE mde.dispute_id = md.id
              ), '[]'::json) AS dispute_evidence,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', mdev.id,
                  'event_type', mdev.event_type,
                  'message', mdev.message,
                  'metadata', mdev.metadata,
                  'created_at', mdev.created_at,
                  'username', ev_actor.username
                ) ORDER BY mdev.created_at DESC)
                FROM market_dispute_events mdev
                LEFT JOIN users ev_actor ON ev_actor.id = mdev.actor_id
                WHERE mdev.dispute_id = md.id
              ), '[]'::json) AS dispute_events,
              EXISTS (
                SELECT 1 FROM market_reviews mr
                WHERE mr.trade_id = mt.id AND mr.buyer_id = $1
              ) AS reviewed_by_me
       FROM market_trades mt
       JOIN users buyer ON buyer.id = mt.buyer_id
       JOIN users seller ON seller.id = mt.seller_id
       JOIN market_listings ml ON ml.id = mt.listing_id
       LEFT JOIN market_disputes md ON md.trade_id = mt.id
       LEFT JOIN users resolver ON resolver.id = md.resolved_by
       LEFT JOIN users payout_user ON payout_user.id = md.payout_user_id
       WHERE mt.buyer_id = $1 OR mt.seller_id = $1
       ORDER BY mt.created_at DESC
       LIMIT 20`,
      [req.user.id]
    );

    const ledger = await pool.query(
      `SELECT id, type, amount, balance_after, locked_after, trade_id, listing_id, note, created_at
       FROM market_ledger
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 35`,
      [req.user.id]
    );

    const myListings = await pool.query(
      `SELECT id, title, description, category, price, status, created_at, sold_at, COALESCE(image_url, '') AS image_url
       FROM market_listings
       WHERE seller_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user.id]
    );

    const paymentRequests = await pool.query(
      `SELECT mpr.id, mpr.type, mpr.status, mpr.amount, mpr.provider, mpr.destination,
              mpr.reference, mpr.user_note, mpr.moderator_note, mpr.provider_payment_id,
              mpr.provider_checkout_url, mpr.provider_status, mpr.created_at, mpr.processed_at,
              processor.username AS processed_by_username
       FROM market_payment_requests mpr
       LEFT JOIN users processor ON processor.id = mpr.processed_by
       WHERE mpr.user_id = $1
       ORDER BY mpr.created_at DESC
       LIMIT 20`,
      [req.user.id]
    );
    const marketModerator = await isMarketModerator(req.user);

    const listingRows = listings.rows.map((listing) => {
      const risk = calculateSellerRiskScore(listing);
      return {
        ...listing,
        seller_risk_score: risk.score,
        seller_risk_reasons: risk.reasons
      };
    });

    return res.json({
      wallet,
      listings: listingRows,
      trades: trades.rows,
      ledger: ledger.rows,
      myListings: myListings.rows,
      paymentRequests: paymentRequests.rows,
      isMarketModerator: marketModerator
    });
  } catch (err) {
    console.error('Market overview failed:', err.message);
    return res.status(500).json({ error: 'Could not load marketplace' });
  }
});

module.exports = router;
