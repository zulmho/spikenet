const pool = require('../config/db');
const { calculateSellerRiskScore } = require('./marketTrust');

let marketSchemaReady = false;

async function ensureMarketSchema() {
  if (marketSchemaReady) return;
  const result = await pool.query("SELECT to_regclass('public.market_wallets') AS market_wallets");
  if (!result.rows[0]?.market_wallets) {
    const err = new Error('Market schema is missing. Run npm run migrate before starting SpikeNet.');
    err.status = 503;
    err.publicMessage = 'Market database is not ready';
    throw err;
  }
  marketSchemaReady = true;
}

async function ensureWallet(userId, client = pool) {
  const result = await client.query(
    `INSERT INTO market_wallets (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING user_id, balance, locked_balance`,
    [userId]
  );
  return result.rows[0];
}

function makeTradeHash({ listingId, buyerId, sellerId, price }) {
  const raw = `${listingId}:${buyerId}:${sellerId}:${price}:${Date.now()}:${Math.random()}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return `SN-${Math.abs(hash).toString(16).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

async function ensureDirectChatBetween(client, userA, userB) {
  const u1 = Math.min(Number(userA), Number(userB));
  const u2 = Math.max(Number(userA), Number(userB));
  const chat = await client.query(
    `INSERT INTO direct_chats (user_one_id, user_two_id)
     VALUES ($1, $2)
     ON CONFLICT (user_one_id, user_two_id)
     DO UPDATE SET user_one_id = EXCLUDED.user_one_id
     RETURNING id`,
    [u1, u2]
  );
  return chat.rows[0].id;
}

async function addLedgerEntry(client, { userId, type, amount, wallet, tradeId = null, listingId = null, note = '' }) {
  await client.query(
    `INSERT INTO market_ledger (user_id, type, amount, balance_after, locked_after, trade_id, listing_id, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      type,
      Number(amount || 0).toFixed(2),
      Number(wallet?.balance || 0).toFixed(2),
      Number(wallet?.locked_balance || 0).toFixed(2),
      tradeId,
      listingId,
      note
    ]
  );
}

function normalizeEvidenceItems(rawItems) {
  const items = Array.isArray(rawItems) ? rawItems : [];
  return items
    .slice(0, 8)
    .map((item) => {
      const content = String(item?.content || '').trim().slice(0, 1000);
      if (!content) return null;
      const kind = ['screenshot', 'link', 'message', 'text'].includes(String(item?.kind || '').trim())
        ? String(item.kind).trim()
        : (/^https?:\/\//i.test(content) ? 'link' : 'text');
      return {
        kind,
        content,
        note: String(item?.note || '').trim().slice(0, 300)
      };
    })
    .filter(Boolean);
}

function normalizeListingImageUrl(value) {
  const raw = String(value || '').trim().slice(0, 1000);
  if (!raw) return '';
  if (/^\/uploads\/[a-zA-Z0-9._/-]+$/i.test(raw)) return raw;
  if (/^https?:\/\/[^\s"'<>]+$/i.test(raw)) return raw;
  return '';
}

async function addDisputeEvidence(client, disputeId, userId, items) {
  const evidence = normalizeEvidenceItems(items);
  for (const item of evidence) {
    await client.query(
      `INSERT INTO market_dispute_evidence (dispute_id, user_id, kind, content, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [disputeId, userId, item.kind, item.content, item.note]
    );
  }
  return evidence.length;
}

async function addDisputeEvent(client, { disputeId, actorId, eventType, message = '', metadata = {} }) {
  await client.query(
    `INSERT INTO market_dispute_events (dispute_id, actor_id, event_type, message, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [disputeId, actorId || null, eventType, String(message || '').slice(0, 500), JSON.stringify(metadata || {})]
  );
}

function emitMarketEvent(req, userId, payload) {
  const io = req.app.get('io');
  if (!io || !userId) return;
  io.to(`user_room_${userId}`).emit('marketEvent', {
    title: payload.title || 'Marketplace',
    message: payload.message || 'Market updated',
    type: payload.type || 'deal',
    tradeId: payload.tradeId || null,
    listingId: payload.listingId || null
  });
}

async function getSellerRiskSnapshot(client, sellerId) {
  const result = await client.query(
    `SELECT COALESCE(sr.avg_rating, 0) AS rating,
            COALESCE(sr.review_count, 0) AS review_count,
            COALESCE(st.total_trades, 0) AS total_trades,
            COALESCE(st.completed_trades, 0) AS completed_trades,
            COALESCE(dd.dispute_count, 0) AS dispute_count,
            COALESCE(dd.open_disputes, 0) AS open_disputes,
            COALESCE(msf.flag, 'none') AS manual_flag,
            COALESCE(msf.note, '') AS flag_note
     FROM users u
     LEFT JOIN (
       SELECT seller_id, ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::int AS review_count
       FROM market_reviews
       GROUP BY seller_id
     ) sr ON sr.seller_id = u.id
     LEFT JOIN (
       SELECT seller_id,
              COUNT(*)::int AS total_trades,
              COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_trades
       FROM market_trades
       GROUP BY seller_id
     ) st ON st.seller_id = u.id
     LEFT JOIN (
       SELECT seller_id,
              COUNT(*)::int AS dispute_count,
              COUNT(*) FILTER (WHERE status = 'open')::int AS open_disputes
       FROM market_disputes
       GROUP BY seller_id
     ) dd ON dd.seller_id = u.id
     LEFT JOIN market_seller_flags msf ON msf.seller_id = u.id
     WHERE u.id = $1`,
    [sellerId]
  );
  const stats = result.rows[0] || {};
  const risk = calculateSellerRiskScore(stats);
  return {
    ...stats,
    risk_score: risk.score,
    risk_reasons: risk.reasons
  };
}

async function isMarketModerator(user, client = pool) {
  const username = String(user?.username || '').toLowerCase();
  if (Number(user?.id) === 1 || username === 'admin' || username === 'moderator') return true;
  if (!Number.isInteger(Number(user?.id))) return false;

  const result = await client.query(
    `SELECT 1 FROM market_moderators WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );
  return result.rowCount > 0;
}

module.exports = {
  addDisputeEvent,
  addDisputeEvidence,
  addLedgerEntry,
  emitMarketEvent,
  ensureDirectChatBetween,
  ensureMarketSchema,
  ensureWallet,
  getSellerRiskSnapshot,
  isMarketModerator,
  makeTradeHash,
  normalizeEvidenceItems,
  normalizeListingImageUrl
};
