const pool = require('../config/db');

let roleColumnReady = false;

async function ensureRoomRoles() {
  if (roleColumnReady) return;
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'room_members' AND column_name = 'role'
    ) AS has_role
  `);
  if (!result.rows[0]?.has_role) {
    const err = new Error('Room role schema is missing. Run npm run migrate before starting SpikeNet.');
    err.status = 503;
    err.publicMessage = 'Group database is not ready';
    throw err;
  }
  roleColumnReady = true;
}

async function getRoomByToken(roomToken) {
  const roomRes = await pool.query('SELECT id, room_token, creator_id FROM party_rooms WHERE room_token = $1', [roomToken]);
  return roomRes.rows[0] || null;
}

async function getOrCreateRoom(roomToken, creatorId) {
  const existing = await getRoomByToken(roomToken);
  if (existing) return existing;

  const created = await pool.query(
    'INSERT INTO party_rooms (room_token, creator_id) VALUES ($1, $2) RETURNING id, room_token, creator_id',
    [roomToken, creatorId]
  );
  return created.rows[0];
}

async function addRoomMember(roomId, userId) {
  await ensureRoomRoles();
  await pool.query(
    'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [roomId, userId]
  );
}

async function isRoomMember(roomId, userId) {
  const member = await pool.query(
    'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
    [roomId, userId]
  );
  return member.rows.length > 0;
}

async function buildLobbyState(roomId) {
  await ensureRoomRoles();
  const members = await pool.query(
    `SELECT u.id, u.username, u.user_tag, u.avatar_url, u.current_status,
            CASE
              WHEN pr.creator_id = u.id THEN 'owner'
              ELSE COALESCE(rm.role, 'member')
            END as role
     FROM room_members rm
     JOIN users u ON rm.user_id = u.id
     JOIN party_rooms pr ON pr.id = rm.room_id
     WHERE rm.room_id = $1
     ORDER BY
       CASE WHEN pr.creator_id = u.id THEN 0 WHEN COALESCE(rm.role, 'member') = 'admin' THEN 1 ELSE 2 END,
       rm.joined_at ASC`,
    [roomId]
  );

  const votes = await pool.query(
    `SELECT rv.product_id, COUNT(rv.user_id) as vote_count
     FROM room_votes rv
     WHERE rv.room_id = $1
     GROUP BY rv.product_id`,
    [roomId]
  );

  return { members: members.rows, votes: votes.rows };
}

async function emitLobbyState(io, roomToken, roomId) {
  const state = await buildLobbyState(roomId);
  io.to(roomToken).emit('lobbyUpdated', state);
  io.emit('globalSocialUpdate');
}

module.exports = {
  getRoomByToken,
  getOrCreateRoom,
  addRoomMember,
  isRoomMember,
  ensureRoomRoles,
  buildLobbyState,
  emitLobbyState
};
