const express = require('express');
const pool = require('../../config/db');
const { validateBody } = require('../../middleware/validate');
const { MARKET_FEE_RATE, calculateMarketFee } = require('../../services/marketTrust');
const {
  addDisputeEvent,
  addDisputeEvidence,
  addLedgerEntry,
  emitMarketEvent,
  ensureMarketSchema,
  getSellerRiskSnapshot,
  isMarketModerator,
  normalizeEvidenceItems
} = require('../../services/marketCore');

const router = express.Router();

router.post('/trades/:id/dispute', validateBody({
  reason: { type: 'string', min: 8, max: 600, required: true },
  evidence: { type: 'array', maxItems: 8, default: [] }
}), async (req, res) => {
  const tradeId = Number(req.params.id);
  const reason = req.body.reason;
  const evidenceItems = normalizeEvidenceItems(req.body.evidence);

  if (!Number.isInteger(tradeId)) return res.status(400).json({ error: 'Invalid trade' });

  const client = await pool.connect();
  try {
    await ensureMarketSchema();
    await client.query('BEGIN');

    const tradeRes = await client.query(
      `SELECT id, buyer_id, seller_id, status
       FROM market_trades
       WHERE id = $1`,
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

    const sellerRisk = await getSellerRiskSnapshot(client, trade.seller_id);
    await client.query(
      `UPDATE market_trades
       SET seller_risk_score_snapshot = $1,
           seller_flag_snapshot = $2,
           seller_flag_note_snapshot = $3
       WHERE id = $4`,
      [sellerRisk.risk_score, sellerRisk.manual_flag, sellerRisk.flag_note, tradeId]
    );

    const result = await client.query(
      `INSERT INTO market_disputes (trade_id, opener_id, buyer_id, seller_id, reason, risk_score_snapshot, risk_breakdown)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (trade_id) DO UPDATE
       SET reason = EXCLUDED.reason,
           opener_id = EXCLUDED.opener_id,
           status = 'open',
           created_at = NOW(),
           resolved_at = NULL,
           resolution = NULL,
           moderator_note = '',
           payout_user_id = NULL,
           payout_amount = 0,
           payout_note = '',
           risk_score_snapshot = EXCLUDED.risk_score_snapshot,
           risk_breakdown = EXCLUDED.risk_breakdown
       RETURNING id, trade_id, status, reason, created_at`,
      [
        tradeId,
        req.user.id,
        trade.buyer_id,
        trade.seller_id,
        reason,
        sellerRisk.risk_score,
        JSON.stringify({
          reasons: sellerRisk.risk_reasons,
          manual_flag: sellerRisk.manual_flag,
          flag_note: sellerRisk.flag_note,
          total_trades: Number(sellerRisk.total_trades || 0),
          completed_trades: Number(sellerRisk.completed_trades || 0),
          dispute_count: Number(sellerRisk.dispute_count || 0),
          open_disputes: Number(sellerRisk.open_disputes || 0),
          rating: Number(sellerRisk.rating || 0)
        })
      ]
    );
    const dispute = result.rows[0];
    const evidenceCount = await addDisputeEvidence(client, dispute.id, req.user.id, evidenceItems);
    await addDisputeEvent(client, {
      disputeId: dispute.id,
      actorId: req.user.id,
      eventType: 'opened',
      message: reason,
      metadata: { evidenceCount }
    });
    if (evidenceCount > 0) {
      await addDisputeEvent(client, {
        disputeId: dispute.id,
        actorId: req.user.id,
        eventType: 'evidence_added',
        message: `${evidenceCount} evidence item(s) added on open`,
        metadata: { evidenceCount }
      });
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    io?.emit('marketUpdated');
    io?.to(`user_room_${trade.buyer_id}`).emit('marketDisputeUpdated', result.rows[0]);
    io?.to(`user_room_${trade.seller_id}`).emit('marketDisputeUpdated', result.rows[0]);
    emitMarketEvent(req, trade.buyer_id, {
      title: 'SpikeNet Market',
      message: 'По сделке открыт спор. Проверь deal room.',
      type: 'dispute',
      tradeId
    });
    emitMarketEvent(req, trade.seller_id, {
      title: 'SpikeNet Market',
      message: 'По сделке открыт спор. Проверь deal room.',
      type: 'dispute',
      tradeId
    });
    return res.status(201).json(dispute);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Open dispute failed:', err.message);
    return res.status(500).json({ error: 'Could not open dispute' });
  } finally {
    client.release();
  }
});

router.post('/disputes/:id/evidence', validateBody({
  evidence: { type: 'array', maxItems: 8, default: [] },
  kind: { type: 'string', max: 30, default: '' },
  content: { type: 'string', max: 1000, default: '' },
  note: { type: 'string', max: 300, default: '' }
}), async (req, res) => {
  const disputeId = Number(req.params.id);
  const evidenceItems = normalizeEvidenceItems(req.body.evidence || [req.body]);

  if (!Number.isInteger(disputeId)) return res.status(400).json({ error: 'Invalid dispute' });
  if (!evidenceItems.length) return res.status(400).json({ error: 'Evidence is empty' });

  const client = await pool.connect();
  try {
    await ensureMarketSchema();
    await client.query('BEGIN');

    const disputeRes = await client.query(
      `SELECT id, trade_id, buyer_id, seller_id, status
       FROM market_disputes
       WHERE id = $1
       FOR UPDATE`,
      [disputeId]
    );
    const dispute = disputeRes.rows[0];
    if (!dispute) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const requesterId = Number(req.user.id);
    const isParticipant = requesterId === Number(dispute.buyer_id) || requesterId === Number(dispute.seller_id);
    if (!isParticipant && !(await isMarketModerator(req.user, client))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Dispute access denied' });
    }

    const evidenceCount = await addDisputeEvidence(client, dispute.id, req.user.id, evidenceItems);
    await addDisputeEvent(client, {
      disputeId: dispute.id,
      actorId: req.user.id,
      eventType: 'evidence_added',
      message: `${evidenceCount} evidence item(s) added`,
      metadata: { evidenceCount }
    });

    await client.query('COMMIT');
    const io = req.app.get('io');
    io?.emit('marketUpdated');
    io?.to(`user_room_${dispute.buyer_id}`).emit('marketDisputeUpdated', { id: dispute.id, trade_id: dispute.trade_id });
    io?.to(`user_room_${dispute.seller_id}`).emit('marketDisputeUpdated', { id: dispute.id, trade_id: dispute.trade_id });
    return res.status(201).json({ success: true, evidenceCount });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Add dispute evidence failed:', err.message);
    return res.status(500).json({ error: 'Could not add evidence' });
  } finally {
    client.release();
  }
});

router.post('/disputes/:id/resolve', validateBody({
  resolution: { type: 'enum', values: ['refund_buyer', 'pay_seller'], required: true },
  moderator_note: { type: 'string', min: 8, max: 800, required: true }
}), async (req, res) => {
  const disputeId = Number(req.params.id);
  const resolution = req.body.resolution;
  const moderatorNote = req.body.moderator_note;
  if (!Number.isInteger(disputeId)) return res.status(400).json({ error: 'Invalid dispute' });

  const client = await pool.connect();
  try {
    await ensureMarketSchema();
    await client.query('BEGIN');

    const disputeRes = await client.query(
      `SELECT md.id, md.trade_id, md.buyer_id, md.seller_id, md.status,
              mt.listing_id, mt.price, mt.status AS trade_status
       FROM market_disputes md
       JOIN market_trades mt ON mt.id = md.trade_id
       WHERE md.id = $1
       FOR UPDATE`,
      [disputeId]
    );
    const dispute = disputeRes.rows[0];
    if (!dispute || dispute.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Open dispute not found' });
    }
    if (!(await isMarketModerator(req.user, client))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only market moderators can resolve disputes' });
    }

    const price = Number(dispute.price);
    let payoutUserId = null;
    let payoutAmount = 0;
    let payoutNote = '';
    if (resolution === 'refund_buyer') {
      payoutUserId = dispute.buyer_id;
      payoutAmount = price;
      payoutNote = 'Refunded to buyer after moderator decision';
      if (dispute.trade_status === 'pending') {
        const buyerWallet = await client.query(
          `UPDATE market_wallets
           SET balance = balance + $1,
               locked_balance = GREATEST(locked_balance - $1, 0),
               updated_at = NOW()
           WHERE user_id = $2
           RETURNING balance, locked_balance`,
          [price, dispute.buyer_id]
        );
        await addLedgerEntry(client, {
          userId: dispute.buyer_id,
          type: 'dispute_refund',
          amount: price,
          wallet: buyerWallet.rows[0],
          tradeId: dispute.trade_id,
          listingId: dispute.listing_id,
          note: `Dispute resolved: refund to buyer`
        });
      } else if (dispute.trade_status === 'completed') {
        const buyerWallet = await client.query(
          `UPDATE market_wallets
           SET balance = balance + $1,
               updated_at = NOW()
           WHERE user_id = $2
           RETURNING balance, locked_balance`,
          [price, dispute.buyer_id]
        );
        const sellerWallet = await client.query(
          `UPDATE market_wallets
           SET balance = balance - $1,
               updated_at = NOW()
           WHERE user_id = $2
           RETURNING balance, locked_balance`,
          [price, dispute.seller_id]
        );
        await addLedgerEntry(client, {
          userId: dispute.buyer_id,
          type: 'dispute_refund',
          amount: price,
          wallet: buyerWallet.rows[0],
          tradeId: dispute.trade_id,
          listingId: dispute.listing_id,
          note: `Dispute resolved after completion: refund to buyer`
        });
        await addLedgerEntry(client, {
          userId: dispute.seller_id,
          type: 'dispute_reversal',
          amount: -price,
          wallet: sellerWallet.rows[0],
          tradeId: dispute.trade_id,
          listingId: dispute.listing_id,
          note: `Dispute reversal from listing #${dispute.listing_id}`
        });
      }
      await client.query(
        `UPDATE market_trades
         SET status = 'cancelled', cancelled_at = NOW()
         WHERE id = $1`,
        [dispute.trade_id]
      );
      await client.query(
        `UPDATE market_listings
         SET status = 'active'
         WHERE id = $1`,
        [dispute.listing_id]
      );
    } else {
      const feeInfo = calculateMarketFee(price);
      payoutUserId = dispute.seller_id;
      payoutAmount = feeInfo.net;
      payoutNote = `Paid to seller after ${Math.round(MARKET_FEE_RATE * 100)}% SpikeNet fee`;
      if (dispute.trade_status === 'pending') {
        const buyerWallet = await client.query(
          `UPDATE market_wallets
           SET locked_balance = GREATEST(locked_balance - $1, 0),
               updated_at = NOW()
           WHERE user_id = $2
           RETURNING balance, locked_balance`,
          [price, dispute.buyer_id]
        );
        const sellerWallet = await client.query(
          `UPDATE market_wallets
           SET balance = balance + $1,
               updated_at = NOW()
           WHERE user_id = $2
           RETURNING balance, locked_balance`,
          [feeInfo.net, dispute.seller_id]
        );
        await addLedgerEntry(client, {
          userId: dispute.buyer_id,
          type: 'dispute_release',
          amount: 0,
          wallet: buyerWallet.rows[0],
          tradeId: dispute.trade_id,
          listingId: dispute.listing_id,
          note: `Dispute resolved: escrow paid to seller`
        });
        await addLedgerEntry(client, {
          userId: dispute.seller_id,
          type: 'dispute_payout',
          amount: feeInfo.net,
          wallet: sellerWallet.rows[0],
          tradeId: dispute.trade_id,
          listingId: dispute.listing_id,
          note: `Dispute payout from listing #${dispute.listing_id}`
        });
        await addLedgerEntry(client, {
          userId: dispute.seller_id,
          type: 'spikenet_fee',
          amount: -feeInfo.fee,
          wallet: sellerWallet.rows[0],
          tradeId: dispute.trade_id,
          listingId: dispute.listing_id,
          note: `SpikeNet fee ${Math.round(MARKET_FEE_RATE * 100)}%`
        });
      } else if (dispute.trade_status === 'cancelled') {
        const buyerWallet = await client.query(
          `UPDATE market_wallets
           SET balance = balance - $1,
               updated_at = NOW()
           WHERE user_id = $2
           RETURNING balance, locked_balance`,
          [price, dispute.buyer_id]
        );
        const sellerWallet = await client.query(
          `UPDATE market_wallets
           SET balance = balance + $1,
               updated_at = NOW()
           WHERE user_id = $2
           RETURNING balance, locked_balance`,
          [feeInfo.net, dispute.seller_id]
        );
        await addLedgerEntry(client, {
          userId: dispute.buyer_id,
          type: 'dispute_reversal',
          amount: -price,
          wallet: buyerWallet.rows[0],
          tradeId: dispute.trade_id,
          listingId: dispute.listing_id,
          note: `Dispute reversal: refund paid to seller`
        });
        await addLedgerEntry(client, {
          userId: dispute.seller_id,
          type: 'dispute_payout',
          amount: feeInfo.net,
          wallet: sellerWallet.rows[0],
          tradeId: dispute.trade_id,
          listingId: dispute.listing_id,
          note: `Dispute payout from listing #${dispute.listing_id}`
        });
        await addLedgerEntry(client, {
          userId: dispute.seller_id,
          type: 'spikenet_fee',
          amount: -feeInfo.fee,
          wallet: sellerWallet.rows[0],
          tradeId: dispute.trade_id,
          listingId: dispute.listing_id,
          note: `SpikeNet fee ${Math.round(MARKET_FEE_RATE * 100)}%`
        });
      }
      await client.query(
        `UPDATE market_trades
         SET status = 'completed', confirmed_at = NOW()
         WHERE id = $1`,
        [dispute.trade_id]
      );
      await client.query(
        `UPDATE market_listings
         SET status = 'sold', sold_at = NOW()
         WHERE id = $1`,
        [dispute.listing_id]
      );
    }

    const sellerRisk = await getSellerRiskSnapshot(client, dispute.seller_id);
    const resolved = await client.query(
      `UPDATE market_disputes
       SET status = 'resolved',
           resolution = $1,
           resolved_by = $2,
           moderator_note = $3,
           payout_user_id = $4,
           payout_amount = $5,
           payout_note = $6,
           risk_score_snapshot = $7,
           risk_breakdown = $8::jsonb,
           resolved_at = NOW()
       WHERE id = $9
       RETURNING id, trade_id, status, resolution, resolved_at, payout_user_id, payout_amount, payout_note, risk_score_snapshot`,
      [
        resolution,
        req.user.id,
        moderatorNote,
        payoutUserId,
        payoutAmount.toFixed(2),
        payoutNote,
        sellerRisk.risk_score,
        JSON.stringify({
          reasons: sellerRisk.risk_reasons,
          manual_flag: sellerRisk.manual_flag,
          flag_note: sellerRisk.flag_note,
          total_trades: Number(sellerRisk.total_trades || 0),
          completed_trades: Number(sellerRisk.completed_trades || 0),
          dispute_count: Number(sellerRisk.dispute_count || 0),
          open_disputes: Number(sellerRisk.open_disputes || 0),
          rating: Number(sellerRisk.rating || 0)
        }),
        disputeId
      ]
    );
    const resolutionText = resolution === 'refund_buyer'
      ? 'Спор закрыт: SPK возвращены покупателю.'
      : 'Спор закрыт: escrow выплачен продавцу.';

    await addDisputeEvent(client, {
      disputeId,
      actorId: req.user.id,
      eventType: 'resolved',
      message: `${resolutionText} Комментарий модератора: ${moderatorNote}`,
      metadata: { resolution, payoutUserId, payoutAmount, payoutNote }
    });

    await client.query('COMMIT');
    const io = req.app.get('io');
    io?.emit('marketUpdated');
    io?.to(`user_room_${dispute.buyer_id}`).emit('marketDisputeUpdated', resolved.rows[0]);
    io?.to(`user_room_${dispute.seller_id}`).emit('marketDisputeUpdated', resolved.rows[0]);
    emitMarketEvent(req, dispute.buyer_id, {
      title: 'SpikeNet Market',
      message: resolutionText,
      type: 'dispute_resolution',
      tradeId: dispute.trade_id,
      listingId: dispute.listing_id
    });
    emitMarketEvent(req, dispute.seller_id, {
      title: 'SpikeNet Market',
      message: resolutionText,
      type: 'dispute_resolution',
      tradeId: dispute.trade_id,
      listingId: dispute.listing_id
    });
    return res.json(resolved.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Resolve dispute failed:', err.message);
    return res.status(500).json({ error: 'Could not resolve dispute' });
  } finally {
    client.release();
  }
});

module.exports = router;
