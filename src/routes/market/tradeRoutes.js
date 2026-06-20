const express = require('express');
const pool = require('../../config/db');
const { validateBody } = require('../../middleware/validate');
const { MARKET_FEE_RATE, calculateMarketFee } = require('../../services/marketTrust');
const {
  addLedgerEntry,
  emitMarketEvent,
  ensureDirectChatBetween,
  ensureMarketSchema,
  ensureWallet,
  getSellerRiskSnapshot,
  makeTradeHash
} = require('../../services/marketCore');

const router = express.Router();

router.post('/listings/:id/buy', async (req, res) => {
  const listingId = Number(req.params.id);
  if (!Number.isInteger(listingId)) return res.status(400).json({ error: 'Invalid listing' });

  const client = await pool.connect();
  try {
    await ensureMarketSchema();
    await client.query('BEGIN');

    const listingRes = await client.query(
      `SELECT ml.id, ml.seller_id, ml.price, ml.status, COALESCE(msf.flag, 'none') AS seller_manual_flag
       FROM market_listings ml
       LEFT JOIN market_seller_flags msf ON msf.seller_id = ml.seller_id
       WHERE ml.id = $1
       FOR UPDATE OF ml`,
      [listingId]
    );
    const listing = listingRes.rows[0];
    if (!listing || listing.status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Listing is not available' });
    }
    if (Number(listing.seller_id) === Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You cannot buy your own listing' });
    }
    if (listing.seller_manual_flag === 'blocked') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Seller is blocked from new marketplace deals' });
    }

    const buyerWallet = await ensureWallet(req.user.id, client);
    await ensureWallet(listing.seller_id, client);
    const price = Number(listing.price);
    if (Number(buyerWallet.balance) < price) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Not enough Spike balance' });
    }

    const buyerAfterLock = await client.query(
      `UPDATE market_wallets
       SET balance = balance - $1,
           locked_balance = locked_balance + $1,
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING balance, locked_balance`,
      [price, req.user.id]
    );
    await client.query(
      `UPDATE market_listings
       SET status = 'escrow'
       WHERE id = $1`,
      [listingId]
    );

    const tradeHash = makeTradeHash({
      listingId,
      buyerId: req.user.id,
      sellerId: listing.seller_id,
      price
    });
    const sellerRisk = await getSellerRiskSnapshot(client, listing.seller_id);
    const trade = await client.query(
      `INSERT INTO market_trades (
         listing_id, buyer_id, seller_id, price, trade_hash, status,
         seller_risk_score_snapshot, seller_flag_snapshot, seller_flag_note_snapshot
       )
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
       RETURNING id, listing_id, buyer_id, seller_id, price, trade_hash, status, created_at`,
      [
        listingId,
        req.user.id,
        listing.seller_id,
        price,
        tradeHash,
        sellerRisk.risk_score,
        sellerRisk.manual_flag,
        sellerRisk.flag_note
      ]
    );
    const tradeRow = trade.rows[0];
    await addLedgerEntry(client, {
      userId: req.user.id,
      type: 'escrow_lock',
      amount: -price,
      wallet: buyerAfterLock.rows[0],
      tradeId: tradeRow.id,
      listingId,
      note: `Escrow lock for listing #${listingId}`
    });
    const dealChatId = await ensureDirectChatBetween(client, req.user.id, listing.seller_id);
    const dealMessage = await client.query(
      `INSERT INTO direct_messages (chat_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, chat_id, sender_id, content, created_at`,
      [
        dealChatId,
        req.user.id,
        `SpikeNet escrow #${tradeRow.id}: средства заморожены. Hash: ${tradeHash}`
      ]
    );

    await client.query('COMMIT');
    const io = req.app.get('io');
    io?.emit('marketUpdated');
    emitMarketEvent(req, listing.seller_id, {
      title: 'SpikeNet Market',
      message: `${req.user.username} купил твой лот. Открой сделку и передай лот.`,
      type: 'sale',
      tradeId: tradeRow.id,
      listingId
    });
    return res.json(tradeRow);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Buy listing failed:', err.message);
    return res.status(500).json({ error: 'Could not complete trade' });
  } finally {
    client.release();
  }
});

router.post('/trades/:id/confirm', async (req, res) => {
  const tradeId = Number(req.params.id);
  if (!Number.isInteger(tradeId)) return res.status(400).json({ error: 'Invalid trade' });

  const client = await pool.connect();
  try {
    await ensureMarketSchema();
    await client.query('BEGIN');

    const tradeRes = await client.query(
      `SELECT id, listing_id, buyer_id, seller_id, price, status,
              EXISTS (
                SELECT 1 FROM market_disputes md
                WHERE md.trade_id = market_trades.id AND md.status = 'open'
              ) AS has_open_dispute
       FROM market_trades
       WHERE id = $1
       FOR UPDATE`,
      [tradeId]
    );
    const trade = tradeRes.rows[0];
    if (!trade || trade.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending trade not found' });
    }
    if (Number(trade.buyer_id) !== Number(req.user.id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only buyer can confirm this trade' });
    }
    if (trade.has_open_dispute) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Resolve the dispute before confirming this trade' });
    }

    const price = Number(trade.price);
    const buyerAfterConfirm = await client.query(
      `UPDATE market_wallets
       SET locked_balance = GREATEST(locked_balance - $1, 0),
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING balance, locked_balance`,
      [price, trade.buyer_id]
    );
    const feeInfo = calculateMarketFee(price);
    const sellerAfterConfirm = await client.query(
      `UPDATE market_wallets
       SET balance = balance + $1,
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING balance, locked_balance`,
      [feeInfo.net, trade.seller_id]
    );
    await client.query(
      `UPDATE market_trades
       SET status = 'completed', confirmed_at = NOW()
       WHERE id = $1`,
      [tradeId]
    );
    await client.query(
      `UPDATE market_listings
       SET status = 'sold', sold_at = NOW()
       WHERE id = $1`,
      [trade.listing_id]
    );
    await addLedgerEntry(client, {
      userId: trade.buyer_id,
      type: 'escrow_release',
      amount: 0,
      wallet: buyerAfterConfirm.rows[0],
      tradeId,
      listingId: trade.listing_id,
      note: `Escrow released to seller`
    });
    await addLedgerEntry(client, {
      userId: trade.seller_id,
      type: 'sale_income',
      amount: feeInfo.net,
      wallet: sellerAfterConfirm.rows[0],
      tradeId,
      listingId: trade.listing_id,
      note: `Sale income from listing #${trade.listing_id}`
    });
    await addLedgerEntry(client, {
      userId: trade.seller_id,
      type: 'spikenet_fee',
      amount: -feeInfo.fee,
      wallet: sellerAfterConfirm.rows[0],
      tradeId,
      listingId: trade.listing_id,
      note: `SpikeNet fee ${Math.round(MARKET_FEE_RATE * 100)}%`
    });

    await client.query('COMMIT');
    req.app.get('io')?.emit('marketUpdated');
    emitMarketEvent(req, trade.seller_id, {
      title: 'SpikeNet Market',
      message: `Покупатель подтвердил получение. ${Math.round(feeInfo.net)} SPK выпущены тебе после комиссии.`,
      type: 'sale',
      tradeId,
      listingId: trade.listing_id
    });
    emitMarketEvent(req, trade.buyer_id, {
      title: 'SpikeNet Market',
      message: 'Сделка завершена. Можно оставить отзыв продавцу.',
      type: 'purchase',
      tradeId,
      listingId: trade.listing_id
    });
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Confirm trade failed:', err.message);
    return res.status(500).json({ error: 'Could not confirm trade' });
  } finally {
    client.release();
  }
});

router.post('/trades/:id/cancel', async (req, res) => {
  const tradeId = Number(req.params.id);
  if (!Number.isInteger(tradeId)) return res.status(400).json({ error: 'Invalid trade' });

  const client = await pool.connect();
  try {
    await ensureMarketSchema();
    await client.query('BEGIN');

    const tradeRes = await client.query(
      `SELECT id, listing_id, buyer_id, seller_id, price, status,
              EXISTS (
                SELECT 1 FROM market_disputes md
                WHERE md.trade_id = market_trades.id AND md.status = 'open'
              ) AS has_open_dispute
       FROM market_trades
       WHERE id = $1
       FOR UPDATE`,
      [tradeId]
    );
    const trade = tradeRes.rows[0];
    if (!trade || trade.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending trade not found' });
    }
    const requesterId = Number(req.user.id);
    if (requesterId !== Number(trade.buyer_id) && requesterId !== Number(trade.seller_id)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Trade access denied' });
    }
    if (trade.has_open_dispute) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Resolve the dispute before cancelling this trade' });
    }

    const price = Number(trade.price);
    const buyerAfterCancel = await client.query(
      `UPDATE market_wallets
       SET balance = balance + $1,
           locked_balance = GREATEST(locked_balance - $1, 0),
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING balance, locked_balance`,
      [price, trade.buyer_id]
    );
    await client.query(
      `UPDATE market_trades
       SET status = 'cancelled', cancelled_at = NOW()
       WHERE id = $1`,
      [tradeId]
    );
    await client.query(
      `UPDATE market_listings
       SET status = 'active'
       WHERE id = $1`,
      [trade.listing_id]
    );
    await addLedgerEntry(client, {
      userId: trade.buyer_id,
      type: 'escrow_refund',
      amount: price,
      wallet: buyerAfterCancel.rows[0],
      tradeId,
      listingId: trade.listing_id,
      note: `Escrow refund for listing #${trade.listing_id}`
    });

    await client.query('COMMIT');
    req.app.get('io')?.emit('marketUpdated');
    emitMarketEvent(req, trade.buyer_id, {
      title: 'SpikeNet Market',
      message: 'Escrow отменен, SPK возвращены покупателю.',
      type: 'purchase',
      tradeId,
      listingId: trade.listing_id
    });
    emitMarketEvent(req, trade.seller_id, {
      title: 'SpikeNet Market',
      message: 'Сделка отменена, лот снова активен на бирже.',
      type: 'trade_cancelled',
      tradeId,
      listingId: trade.listing_id
    });
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Cancel trade failed:', err.message);
    return res.status(500).json({ error: 'Could not cancel trade' });
  } finally {
    client.release();
  }
});

router.post('/trades/:id/review', validateBody({
  rating: { type: 'int', min: 1, max: 5, required: true },
  comment: { type: 'string', max: 400, default: '' }
}), async (req, res) => {
  const tradeId = Number(req.params.id);
  const rating = Number(req.body.rating);
  const comment = req.body.comment;

  if (!Number.isInteger(tradeId)) return res.status(400).json({ error: 'Invalid trade' });

  try {
    await ensureMarketSchema();
    const tradeRes = await pool.query(
      `SELECT id, buyer_id, seller_id, status
       FROM market_trades
       WHERE id = $1`,
      [tradeId]
    );
    const trade = tradeRes.rows[0];
    if (!trade || trade.status !== 'completed') {
      return res.status(404).json({ error: 'Completed trade not found' });
    }
    if (Number(trade.buyer_id) !== Number(req.user.id)) {
      return res.status(403).json({ error: 'Only buyer can review this seller' });
    }

    const result = await pool.query(
      `INSERT INTO market_reviews (trade_id, buyer_id, seller_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (trade_id) DO UPDATE
       SET rating = EXCLUDED.rating,
           comment = EXCLUDED.comment,
           created_at = NOW()
       WHERE market_reviews.buyer_id = EXCLUDED.buyer_id
       RETURNING id, trade_id, seller_id, rating, comment, created_at`,
      [tradeId, req.user.id, trade.seller_id, rating, comment]
    );

    if (result.rowCount === 0) return res.status(403).json({ error: 'Review access denied' });
    req.app.get('io')?.emit('marketUpdated');
    emitMarketEvent(req, trade.seller_id, {
      title: 'SpikeNet Market',
      message: `Покупатель оставил отзыв: ${rating}/5.`,
      type: 'review',
      tradeId
    });
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Review trade failed:', err.message);
    return res.status(500).json({ error: 'Could not save review' });
  }
});

module.exports = router;
