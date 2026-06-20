const express = require('express');
const pool = require('../../config/db');
const {
  addLedgerEntry,
  emitMarketEvent,
  ensureMarketSchema,
  ensureWallet,
  isMarketModerator
} = require('../../services/marketCore');

const router = express.Router();

router.get('/admin/disputes', async (req, res) => {
  try {
    await ensureMarketSchema();
    if (!(await isMarketModerator(req.user))) {
      return res.status(403).json({ error: 'Market moderator access required' });
    }

    const result = await pool.query(
      `SELECT md.id, md.trade_id, md.reason, md.status, md.created_at, md.resolution, md.resolved_at, md.moderator_note,
              md.payout_user_id, md.payout_amount, md.payout_note, md.risk_score_snapshot, md.risk_breakdown,
              mt.listing_id, mt.price, mt.status AS trade_status,
              ml.title,
              buyer.id AS buyer_id, buyer.username AS buyer_username,
              seller.id AS seller_id, seller.username AS seller_username,
              resolver.username AS resolved_by_username,
              payout_user.username AS payout_username,
              (SELECT COUNT(*)::int FROM market_dispute_evidence mde WHERE mde.dispute_id = md.id) AS evidence_count,
              (SELECT COUNT(*)::int FROM market_dispute_events mdev WHERE mdev.dispute_id = md.id) AS event_count,
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
              ), '[]'::json) AS evidence,
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
              ), '[]'::json) AS events
       FROM market_disputes md
       JOIN market_trades mt ON mt.id = md.trade_id
       JOIN market_listings ml ON ml.id = mt.listing_id
       JOIN users buyer ON buyer.id = md.buyer_id
       JOIN users seller ON seller.id = md.seller_id
       LEFT JOIN users resolver ON resolver.id = md.resolved_by
       LEFT JOIN users payout_user ON payout_user.id = md.payout_user_id
       ORDER BY (md.status = 'open') DESC, md.created_at DESC
       LIMIT 80`
    );
    return res.json({ disputes: result.rows });
  } catch (err) {
    console.error('Admin disputes failed:', err.message);
    return res.status(500).json({ error: 'Could not load disputes' });
  }
});

router.get('/admin/summary', async (req, res) => {
  try {
    await ensureMarketSchema();
    if (!(await isMarketModerator(req.user))) {
      return res.status(403).json({ error: 'Market moderator access required' });
    }

    const result = await pool.query(
      `SELECT
       COUNT(*) FILTER (WHERE status = 'open')::int AS open_disputes,
       COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_disputes,
       (SELECT COUNT(*)::int FROM market_trades WHERE status = 'pending') AS pending_trades,
       (SELECT COUNT(*)::int FROM market_listings WHERE status = 'active') AS active_listings,
       (SELECT COUNT(*)::int FROM market_payment_requests WHERE status = 'pending') AS pending_payments
       FROM market_disputes`
    );
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Admin summary failed:', err.message);
    return res.status(500).json({ error: 'Could not load market moderation summary' });
  }
});

router.get('/admin/payments', async (req, res) => {
  try {
    await ensureMarketSchema();
    if (!(await isMarketModerator(req.user))) {
      return res.status(403).json({ error: 'Market moderator access required' });
    }

    const result = await pool.query(
      `SELECT mpr.id, mpr.user_id, mpr.type, mpr.status, mpr.amount, mpr.provider,
              mpr.destination, mpr.reference, mpr.user_note, mpr.moderator_note,
              mpr.provider_payment_id, mpr.provider_checkout_url, mpr.provider_status,
              mpr.created_at, mpr.processed_at,
              requester.username AS username,
              processor.username AS processed_by_username
       FROM market_payment_requests mpr
       JOIN users requester ON requester.id = mpr.user_id
       LEFT JOIN users processor ON processor.id = mpr.processed_by
       ORDER BY (mpr.status = 'pending') DESC, mpr.created_at DESC
       LIMIT 80`
    );
    return res.json({ payments: result.rows });
  } catch (err) {
    console.error('Admin payments failed:', err.message);
    return res.status(500).json({ error: 'Could not load payment requests' });
  }
});

router.post('/admin/payments/:id/resolve', async (req, res) => {
  const paymentId = Number(req.params.id);
  const decision = ['approve', 'reject'].includes(req.body.decision) ? req.body.decision : '';
  const moderatorNote = String(req.body.moderator_note || '').trim().slice(0, 600);
  if (!Number.isInteger(paymentId)) return res.status(400).json({ error: 'Invalid payment request' });
  if (!decision) return res.status(400).json({ error: 'Invalid payment decision' });

  const client = await pool.connect();
  try {
    await ensureMarketSchema();
    await client.query('BEGIN');
    if (!(await isMarketModerator(req.user, client))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Market moderator access required' });
    }

    const paymentRes = await client.query(
      `SELECT id, user_id, type, status, amount
       FROM market_payment_requests
       WHERE id = $1
       FOR UPDATE`,
      [paymentId]
    );
    const payment = paymentRes.rows[0];
    if (!payment || payment.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pending payment request not found' });
    }

    await ensureWallet(payment.user_id, client);
    const amount = Number(payment.amount);
    let walletAfter = null;
    let ledgerType = '';
    let ledgerAmount = 0;
    let ledgerNote = '';

    if (payment.type === 'deposit' && decision === 'approve') {
      const walletRes = await client.query(
        `UPDATE market_wallets
         SET balance = balance + $1,
             updated_at = NOW()
         WHERE user_id = $2
         RETURNING user_id, balance, locked_balance`,
        [amount.toFixed(2), payment.user_id]
      );
      walletAfter = walletRes.rows[0];
      ledgerType = 'deposit_approved';
      ledgerAmount = amount;
      ledgerNote = `Deposit request #${payment.id} approved`;
    } else if (payment.type === 'withdrawal' && decision === 'approve') {
      const walletRes = await client.query(
        `SELECT user_id, balance, locked_balance
         FROM market_wallets
         WHERE user_id = $1`,
        [payment.user_id]
      );
      walletAfter = walletRes.rows[0];
      ledgerType = 'withdrawal_paid';
      ledgerAmount = 0;
      ledgerNote = `Withdrawal request #${payment.id} paid manually`;
    } else if (payment.type === 'withdrawal' && decision === 'reject') {
      const walletRes = await client.query(
        `UPDATE market_wallets
         SET balance = balance + $1,
             updated_at = NOW()
         WHERE user_id = $2
         RETURNING user_id, balance, locked_balance`,
        [amount.toFixed(2), payment.user_id]
      );
      walletAfter = walletRes.rows[0];
      ledgerType = 'withdrawal_refund';
      ledgerAmount = amount;
      ledgerNote = `Withdrawal request #${payment.id} rejected and returned`;
    } else {
      const walletRes = await client.query(
        `SELECT user_id, balance, locked_balance
         FROM market_wallets
         WHERE user_id = $1`,
        [payment.user_id]
      );
      walletAfter = walletRes.rows[0];
      ledgerType = 'deposit_rejected';
      ledgerAmount = 0;
      ledgerNote = `Deposit request #${payment.id} rejected`;
    }

    await client.query(
      `UPDATE market_payment_requests
       SET status = $1,
           moderator_note = $2,
           processed_by = $3,
           processed_at = NOW()
       WHERE id = $4`,
      [decision === 'approve' ? 'approved' : 'rejected', moderatorNote, req.user.id, paymentId]
    );
    await addLedgerEntry(client, {
      userId: payment.user_id,
      type: ledgerType,
      amount: ledgerAmount,
      wallet: walletAfter,
      note: moderatorNote ? `${ledgerNote}: ${moderatorNote}` : ledgerNote
    });

    await client.query('COMMIT');
    req.app.get('io')?.emit('marketUpdated');
    emitMarketEvent(req, payment.user_id, {
      title: 'SpikeNet Wallet',
      message: decision === 'approve'
        ? 'Платёжная заявка подтверждена модератором.'
        : 'Платёжная заявка отклонена модератором.',
      type: 'wallet'
    });
    return res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Resolve payment failed:', err.message);
    return res.status(500).json({ error: 'Could not resolve payment request' });
  } finally {
    client.release();
  }
});

module.exports = router;
