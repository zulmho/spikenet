const express = require('express');
const pool = require('../config/db');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.post('/settings', protect, async (req, res) => {
  const { avatar_url, color_accent, compact_grid, spike_sound } = req.body;

  try {
    await pool.query(
      `UPDATE users
       SET avatar_url = $1, color_accent = $2, compact_grid = $3, spike_sound = $4
       WHERE id = $5`,
      [avatar_url, color_accent, compact_grid, spike_sound, req.user.id]
    );

    return res.json({ success: true, message: 'Settings saved' });
  } catch (err) {
    console.error('Settings save failed:', err.message);
    return res.status(500).json({ success: false, error: 'Could not save settings' });
  }
});

router.get('/', protect, async (req, res) => {
  try {
    const dbRes = await pool.query(
      'SELECT id, username, user_tag, avatar_url, current_status, spycat_karma FROM users ORDER BY id ASC'
    );
    return res.json(dbRes.rows);
  } catch (err) {
    return res.status(500).json({ error: 'Could not load users' });
  }
});

router.get('/profile/:userId', protect, async (req, res) => {
  const targetUserId = req.params.userId;

  try {
    const userRes = await pool.query(
      'SELECT id, username, user_tag, avatar_url, current_status FROM users WHERE id = $1',
      [targetUserId]
    );

    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const marketStatsRes = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE seller_id = $1 OR buyer_id = $1)::int AS total_deals,
         COUNT(*) FILTER (WHERE (seller_id = $1 OR buyer_id = $1) AND status = 'completed')::int AS completed_deals,
         COUNT(*) FILTER (WHERE seller_id = $1 AND status = 'completed')::int AS seller_completed_deals
       FROM market_trades`,
      [targetUserId]
    );
    const listingsRes = await pool.query(
      `SELECT id, title, price, status, created_at
       FROM market_listings
       WHERE seller_id = $1 AND status IN ('active', 'escrow')
       ORDER BY created_at DESC
       LIMIT 5`,
      [targetUserId]
    );

    return res.json({
      user: userRes.rows[0],
      marketStats: marketStatsRes.rows[0] || { total_deals: 0, completed_deals: 0, seller_completed_deals: 0 },
      activeListings: listingsRes.rows
    });
  } catch (err) {
    console.error('Profile load failed:', err.message);
    return res.status(500).json({ error: 'Could not load profile' });
  }
});

module.exports = router;
