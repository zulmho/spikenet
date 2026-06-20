const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateMarketFee, calculateSellerRiskScore } = require('../src/services/marketTrust');

test('market fee is 2 percent and returns net payout', () => {
  assert.deepEqual(calculateMarketFee(1000), { fee: 20, net: 980 });
  assert.deepEqual(calculateMarketFee(99.99), { fee: 2, net: 97.99 });
});

test('seller risk score reacts to manual flags and disputes', () => {
  const newSeller = calculateSellerRiskScore({ total_trades: 0 });
  assert.equal(newSeller.score, 18);
  assert.ok(newSeller.reasons.includes('new seller'));

  const blocked = calculateSellerRiskScore({
    total_trades: 2,
    completed_trades: 0,
    dispute_count: 4,
    open_disputes: 1,
    manual_flag: 'blocked'
  });
  assert.equal(blocked.score, 100);
  assert.ok(blocked.reasons.includes('seller blocked by moderation'));

  const trusted = calculateSellerRiskScore({
    total_trades: 20,
    completed_trades: 19,
    dispute_count: 1,
    rating: 4.9,
    review_count: 12,
    manual_flag: 'verified'
  });
  assert.equal(trusted.score, 0);
});
