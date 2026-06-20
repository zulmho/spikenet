const pool = require('../config/db');

const GLOBAL_ROLES = ['admin', 'support', 'market_moderator'];

let adminSchemaReady = false;

async function ensureAdminSchema() {
  if (adminSchemaReady) return;

  const result = await pool.query("SELECT to_regclass('public.user_roles') AS user_roles");
  if (!result.rows[0]?.user_roles) {
    const err = new Error('Admin schema is missing. Run npm run migrate before starting SpikeNet.');
    err.status = 503;
    err.publicMessage = 'Admin database is not ready';
    throw err;
  }
  adminSchemaReady = true;
}

function addImplicitRoles(user, roles) {
  const username = String(user?.username || '').toLowerCase();
  const result = new Set(roles);

  if (Number(user?.id) === 1 || username === 'admin') {
    result.add('admin');
    result.add('support');
    result.add('market_moderator');
  }
  if (username === 'moderator') result.add('market_moderator');

  return [...result].filter(role => GLOBAL_ROLES.includes(role));
}

async function getUserRoles(user, client = pool) {
  if (!user?.id) return [];
  await ensureAdminSchema();

  const result = await client.query(
    'SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role ASC',
    [user.id]
  );

  return addImplicitRoles(user, result.rows.map(row => row.role));
}

async function getModerationState(userId, client = pool) {
  await ensureAdminSchema();

  const result = await client.query(
    `SELECT is_banned, ban_reason, muted_until, mute_reason
     FROM user_moderation
     WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0] || {};
  const mutedUntil = row.muted_until ? new Date(row.muted_until) : null;

  return {
    is_banned: !!row.is_banned,
    ban_reason: row.ban_reason || '',
    muted_until: mutedUntil && mutedUntil > new Date() ? mutedUntil.toISOString() : null,
    mute_reason: row.mute_reason || ''
  };
}

async function canAccessAdmin(user) {
  const roles = await getUserRoles(user);
  return roles.includes('admin') || roles.includes('support');
}

async function isGlobalAdmin(user) {
  const roles = await getUserRoles(user);
  return roles.includes('admin');
}

async function isMarketModerator(user) {
  const roles = await getUserRoles(user);
  return roles.includes('market_moderator');
}

async function isUserMuted(userId) {
  const moderation = await getModerationState(userId);
  return !!moderation.muted_until;
}

module.exports = {
  GLOBAL_ROLES,
  ensureAdminSchema,
  getUserRoles,
  getModerationState,
  canAccessAdmin,
  isGlobalAdmin,
  isMarketModerator,
  isUserMuted
};
