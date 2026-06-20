const crypto = require('crypto');
const env = require('../config/env');

const SUPPORTED_PROVIDERS = new Set(['manual']);

function getPaymentProviderConfig() {
  const provider = String(env.payments.provider || 'manual').toLowerCase();
  const ready = provider === 'manual'
    || Boolean(env.payments.apiKey && env.payments.shopId && env.payments.webhookSecret);

  return {
    provider,
    publicName: env.payments.publicName,
    currency: env.payments.currency,
    spkRate: env.payments.spkRate,
    ready,
    mode: provider === 'manual' ? 'manual_review' : 'provider_checkout',
    supportsAutomaticCheckout: provider !== 'manual' && ready,
    supported: SUPPORTED_PROVIDERS.has(provider)
  };
}

function ensureProviderReady() {
  const config = getPaymentProviderConfig();
  if (!config.supported) {
    const err = new Error(`Payment provider "${config.provider}" is not wired yet`);
    err.status = 503;
    err.publicMessage = 'Payment provider is not available yet';
    throw err;
  }
  if (!config.ready) {
    const err = new Error('Payment provider keys are missing');
    err.status = 503;
    err.publicMessage = 'Payment provider is not configured';
    throw err;
  }
  return config;
}

function makeProviderPaymentId(userId) {
  return `SN-PAY-${userId}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

async function createDepositIntent({ userId, amount, reference = '', note = '' }) {
  const config = ensureProviderReady();
  const providerPaymentId = makeProviderPaymentId(userId);

  if (config.provider === 'manual') {
    return {
      provider: 'manual',
      providerPaymentId,
      checkoutUrl: '',
      providerStatus: 'awaiting_moderator',
      payload: {
        mode: 'manual_review',
        reference,
        note,
        amount: Number(amount),
        currency: config.currency
      }
    };
  }

  throw new Error(`Payment provider "${config.provider}" has no adapter`);
}

async function createWithdrawalIntent({ userId, amount, destination = '', note = '' }) {
  const config = ensureProviderReady();
  const providerPaymentId = makeProviderPaymentId(userId);

  if (config.provider === 'manual') {
    return {
      provider: 'manual',
      providerPaymentId,
      checkoutUrl: '',
      providerStatus: 'awaiting_moderator',
      payload: {
        mode: 'manual_payout',
        destination,
        note,
        amount: Number(amount),
        currency: config.currency
      }
    };
  }

  throw new Error(`Payment provider "${config.provider}" has no adapter`);
}

module.exports = {
  createDepositIntent,
  createWithdrawalIntent,
  getPaymentProviderConfig
};
