const express = require('express');
const pool = require('../../config/db');
const { validateBody } = require('../../middleware/validate');
const { addLedgerEntry, ensureMarketSchema, ensureWallet } = require('../../services/marketCore');
const {
  createDepositIntent,
  createWithdrawalIntent,
  getPaymentProviderConfig
} = require('../../services/paymentProvider');

const router = express.Router();

router.get('/wallet/payment-methods', (req, res) => {
  const config = getPaymentProviderConfig();
  return res.json({
    provider: config.provider,
    publicName: config.publicName,
    mode: config.mode,
    currency: config.currency,
    spkRate: config.spkRate,
    ready: config.ready,
    supportsAutomaticCheckout: config.supportsAutomaticCheckout,
    methods: [
      {
        id: config.provider,
        name: config.publicName,
        type: config.mode,
        enabled: config.ready,
        description: config.provider === 'manual'
          ? 'Создаёт заявку. Модератор сверяет оплату и начисляет SPK.'
          : 'Создаёт checkout у платёжного провайдера.'
      }
    ]
  });
});

router.post('/wallet/topup', validateBody({
  amount: { type: 'money', min: 1, max: 10000, required: true },
  reference: { type: 'string', max: 160, default: '' },
  note: { type: 'string', max: 300, default: '' }
}), async (req, res) => {
  const amount = Number(req.body.amount);

  try {
    await ensureMarketSchema();
    await ensureWallet(req.user.id);
    const intent = await createDepositIntent({
      userId: req.user.id,
      amount,
      reference: String(req.body.reference || '').trim().slice(0, 160),
      note: String(req.body.note || '').trim().slice(0, 300)
    });
    const result = await pool.query(
      `INSERT INTO market_payment_requests (
         user_id, type, amount, provider, reference, user_note,
         provider_payment_id, provider_checkout_url, provider_status, provider_payload
       )
       VALUES ($1, 'deposit', $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id, type, status, amount, provider, reference, user_note,
                 provider_payment_id, provider_checkout_url, provider_status, created_at`,
      [
        req.user.id,
        amount.toFixed(2),
        intent.provider,
        String(req.body.reference || '').trim().slice(0, 160),
        String(req.body.note || '').trim().slice(0, 300),
        intent.providerPaymentId,
        intent.checkoutUrl,
        intent.providerStatus,
        JSON.stringify(intent.payload || {})
      ]
    );
    req.app.get('io')?.emit('marketUpdated');
    return res.status(202).json({ success: true, request: result.rows[0] });
  } catch (err) {
    console.error('Wallet top up request failed:', err.message);
    return res.status(500).json({ error: 'Could not create top up request' });
  }
});

router.post('/wallet/withdraw', validateBody({
  amount: { type: 'money', min: 1, max: 10000, required: true },
  destination: { type: 'string', min: 4, max: 240, required: true },
  note: { type: 'string', max: 300, default: '' }
}), async (req, res) => {
  const amount = Number(req.body.amount);
  const destination = req.body.destination;
  const userNote = req.body.note;

  const client = await pool.connect();
  try {
    await ensureMarketSchema();
    await client.query('BEGIN');
    await ensureWallet(req.user.id, client);
    const intent = await createWithdrawalIntent({
      userId: req.user.id,
      amount,
      destination,
      note: userNote
    });
    const wallet = await client.query(
      `SELECT user_id, balance, locked_balance
       FROM market_wallets
       WHERE user_id = $1
       FOR UPDATE`,
      [req.user.id]
    );
    if (Number(wallet.rows[0]?.balance || 0) < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Not enough free SPK for withdrawal' });
    }
    const walletRes = await client.query(
      `UPDATE market_wallets
       SET balance = balance - $1,
           updated_at = NOW()
       WHERE user_id = $2
       RETURNING user_id, balance, locked_balance`,
      [amount.toFixed(2), req.user.id]
    );
    const request = await client.query(
      `INSERT INTO market_payment_requests (
         user_id, type, amount, provider, destination, user_note,
         provider_payment_id, provider_checkout_url, provider_status, provider_payload
       )
       VALUES ($1, 'withdrawal', $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING id, type, status, amount, provider, destination, user_note,
                 provider_payment_id, provider_checkout_url, provider_status, created_at`,
      [
        req.user.id,
        amount.toFixed(2),
        intent.provider,
        destination,
        userNote,
        intent.providerPaymentId,
        intent.checkoutUrl,
        intent.providerStatus,
        JSON.stringify(intent.payload || {})
      ]
    );
    await addLedgerEntry(client, {
      userId: req.user.id,
      type: 'withdrawal_hold',
      amount: -amount,
      wallet: walletRes.rows[0],
      note: `Withdrawal request #${request.rows[0].id} reserved`
    });
    await client.query('COMMIT');
    req.app.get('io')?.emit('marketUpdated');
    return res.status(202).json({ success: true, request: request.rows[0], wallet: walletRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Wallet withdrawal failed:', err.message);
    return res.status(500).json({ error: 'Could not create withdrawal request' });
  } finally {
    client.release();
  }
});

module.exports = router;
