const express = require('express');
const pool = require('../../config/db');
const { validateBody } = require('../../middleware/validate');
const { ensureMarketSchema, normalizeListingImageUrl } = require('../../services/marketCore');

const router = express.Router();

router.post('/listings', validateBody({
  title: { type: 'string', min: 3, max: 90, required: true },
  description: { type: 'string', max: 600, default: '' },
  category: { type: 'enum', values: ['key', 'item', 'service', 'account', 'other'], default: 'key' },
  price: { type: 'money', min: 0.01, max: 1000000, required: true },
  imageUrl: { type: 'string', max: 1000, default: '' },
  image_url: { type: 'string', max: 1000, default: '' }
}), async (req, res) => {
  const title = req.body.title;
  const description = req.body.description;
  const imageUrl = normalizeListingImageUrl(req.body.imageUrl || req.body.image_url);
  const category = req.body.category || 'key';
  const price = Number(req.body.price);

  try {
    await ensureMarketSchema();
    const result = await pool.query(
      `INSERT INTO market_listings (seller_id, title, description, category, price, image_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, title, description, category, price, image_url, status, created_at`,
      [req.user.id, title, description, category, price.toFixed(2), imageUrl]
    );

    req.app.get('io')?.emit('marketUpdated');
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create listing failed:', err.message);
    return res.status(500).json({ error: 'Could not create listing' });
  }
});

router.post('/listings/:id/watch', async (req, res) => {
  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId)) return res.status(400).json({ error: 'Invalid listing' });

  try {
    await ensureMarketSchema();
    const listing = await pool.query(
      `SELECT id FROM market_listings WHERE id = $1 AND status = 'active'`,
      [listingId]
    );
    if (listing.rowCount === 0) return res.status(404).json({ error: 'Listing not found' });

    await pool.query(
      `INSERT INTO market_watchlist (user_id, listing_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, listing_id) DO NOTHING`,
      [req.user.id, listingId]
    );
    req.app.get('io')?.to(`user_room_${req.user.id}`).emit('marketUpdated');
    return res.json({ success: true });
  } catch (err) {
    console.error('Watch listing failed:', err.message);
    return res.status(500).json({ error: 'Could not save listing' });
  }
});

router.delete('/listings/:id/watch', async (req, res) => {
  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId)) return res.status(400).json({ error: 'Invalid listing' });

  try {
    await ensureMarketSchema();
    await pool.query(
      `DELETE FROM market_watchlist WHERE user_id = $1 AND listing_id = $2`,
      [req.user.id, listingId]
    );
    req.app.get('io')?.to(`user_room_${req.user.id}`).emit('marketUpdated');
    return res.json({ success: true });
  } catch (err) {
    console.error('Unwatch listing failed:', err.message);
    return res.status(500).json({ error: 'Could not remove saved listing' });
  }
});

router.delete('/listings/:id', async (req, res) => {
  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId)) return res.status(400).json({ error: 'Invalid listing' });

  try {
    await ensureMarketSchema();
    const result = await pool.query(
      `UPDATE market_listings
       SET status = 'cancelled'
       WHERE id = $1 AND seller_id = $2 AND status = 'active'
       RETURNING id`,
      [listingId, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Listing not found' });

    req.app.get('io')?.emit('marketUpdated');
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not cancel listing' });
  }
});

module.exports = router;
