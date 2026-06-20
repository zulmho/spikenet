const express = require('express');
const pool = require('../config/db');
const { protect } = require('../middleware/auth');
const { getRoomByToken, ensureRoomRoles, emitLobbyState } = require('../services/lobbyService');

const router = express.Router();

router.post('/create', protect, async (req, res) => {
  const groupName = String(req.body.groupName || '').trim();
  if (!groupName) return res.status(400).json({ error: 'Group name is required' });

  const roomToken = Math.random().toString(36).substring(2, 7);

  try {
    const groupInsert = await pool.query(
      'INSERT INTO party_rooms (room_token, creator_id) VALUES ($1, $2) RETURNING id, room_token',
      [`${groupName} (${roomToken})`, req.user.id]
    );

    const newRoom = groupInsert.rows[0];
    await pool.query(
      'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [newRoom.id, req.user.id]
    );

    return res.status(201).json({ success: true, roomToken: newRoom.room_token });
  } catch (err) {
    console.error('Group create failed:', err.message);
    return res.status(500).json({ error: 'Could not create group' });
  }
});

router.get('/my', protect, async (req, res) => {
  try {
    const myGroups = await pool.query(
      `SELECT pr.id, pr.room_token
       FROM party_rooms pr
       JOIN room_members rm ON pr.id = rm.room_id
       WHERE rm.user_id = $1
       ORDER BY pr.id DESC`,
      [req.user.id]
    );
    return res.json(myGroups.rows);
  } catch (err) {
    return res.status(500).json({ error: 'Could not load groups' });
  }
});

async function getRequesterRole(room, userId) {
  if (Number(room.creator_id) === Number(userId)) return 'owner';

  await ensureRoomRoles();
  const member = await pool.query(
    'SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2',
    [room.id, userId]
  );
  return member.rows[0]?.role || null;
}

function canManageMembers(role) {
  return role === 'owner' || role === 'admin';
}

async function sendGroupSettings(req, res, roomToken) {
  try {
    await ensureRoomRoles();

    const room = await getRoomByToken(roomToken);
    if (!room) return res.status(404).json({ error: 'Group not found' });

    const requesterRole = await getRequesterRole(room, req.user.id);
    if (!requesterRole) return res.status(403).json({ error: 'You are not a member of this group' });

    const members = await pool.query(
      `SELECT u.id, u.username, u.user_tag, u.avatar_url, u.current_status,
              CASE
                WHEN pr.creator_id = u.id THEN 'owner'
                ELSE COALESCE(rm.role, 'member')
              END as role
       FROM room_members rm
       JOIN users u ON u.id = rm.user_id
       JOIN party_rooms pr ON pr.id = rm.room_id
       WHERE rm.room_id = $1
       ORDER BY
         CASE WHEN pr.creator_id = u.id THEN 0 WHEN COALESCE(rm.role, 'member') = 'admin' THEN 1 ELSE 2 END,
         rm.joined_at ASC`,
      [room.id]
    );

    return res.json({
      room: { id: room.id, roomToken: room.room_token, creatorId: room.creator_id },
      requesterRole,
      canManage: requesterRole === 'owner' || requesterRole === 'admin',
      members: members.rows
    });
  } catch (err) {
    console.error('Group settings failed:', err.message);
    return res.status(500).json({ error: 'Could not load group settings' });
  }
}

router.get('/settings', protect, async (req, res) => {
  return sendGroupSettings(req, res, String(req.query.roomToken || ''));
});

router.get('/:roomToken/settings', protect, async (req, res) => {
  return sendGroupSettings(req, res, req.params.roomToken);
});

async function updateMemberRole(req, res, roomToken) {
  const targetUserId = Number(req.body.targetUserId);
  const role = String(req.body.role || '').trim();

  if (!targetUserId || !['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    await ensureRoomRoles();

    const room = await getRoomByToken(roomToken);
    if (!room) return res.status(404).json({ error: 'Group not found' });

    const requesterRole = await getRequesterRole(room, req.user.id);
    if (requesterRole !== 'owner') {
      return res.status(403).json({ error: 'Only the group owner can change roles' });
    }

    if (Number(room.creator_id) === targetUserId) {
      return res.status(400).json({ error: 'Owner role cannot be changed' });
    }

    const update = await pool.query(
      'UPDATE room_members SET role = $1 WHERE room_id = $2 AND user_id = $3',
      [role, room.id, targetUserId]
    );

    if (update.rowCount === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const io = req.app.get('io');
    if (io) await emitLobbyState(io, room.room_token, room.id);

    return res.json({ success: true });
  } catch (err) {
    console.error('Role update failed:', err.message);
    return res.status(500).json({ error: 'Could not update role' });
  }
}

router.post('/role', protect, async (req, res) => {
  return updateMemberRole(req, res, String(req.body.roomToken || ''));
});

router.post('/:roomToken/role', protect, async (req, res) => {
  return updateMemberRole(req, res, req.params.roomToken);
});

async function kickMember(req, res, roomToken) {
  const targetUserId = Number(req.body.targetUserId);
  if (!targetUserId) return res.status(400).json({ error: 'Invalid user' });

  try {
    await ensureRoomRoles();

    const room = await getRoomByToken(roomToken);
    if (!room) return res.status(404).json({ error: 'Group not found' });

    const requesterRole = await getRequesterRole(room, req.user.id);
    if (requesterRole !== 'owner' && requesterRole !== 'admin') {
      return res.status(403).json({ error: 'Only admins can remove members' });
    }

    if (Number(room.creator_id) === targetUserId) {
      return res.status(400).json({ error: 'Owner cannot be removed' });
    }

    const targetRole = await getRequesterRole(room, targetUserId);
    if (!targetRole) return res.status(404).json({ error: 'Member not found' });

    if (requesterRole === 'admin' && targetRole === 'admin') {
      return res.status(403).json({ error: 'Admins cannot remove other admins' });
    }

    await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, targetUserId]);

    const io = req.app.get('io');
    if (io) await emitLobbyState(io, room.room_token, room.id);

    return res.json({ success: true });
  } catch (err) {
    console.error('Kick member failed:', err.message);
    return res.status(500).json({ error: 'Could not remove member' });
  }
}

router.post('/kick', protect, async (req, res) => {
  return kickMember(req, res, String(req.body.roomToken || ''));
});

router.post('/:roomToken/kick', protect, async (req, res) => {
  return kickMember(req, res, req.params.roomToken);
});

async function addGroupMember(req, res, roomToken) {
  const targetUserId = Number(req.body.targetUserId);
  if (!targetUserId) return res.status(400).json({ error: 'Invalid user' });

  try {
    await ensureRoomRoles();

    const room = await getRoomByToken(roomToken);
    if (!room) return res.status(404).json({ error: 'Group not found' });

    const requesterRole = await getRequesterRole(room, req.user.id);
    if (!canManageMembers(requesterRole)) {
      return res.status(403).json({ error: 'Only admins can add members' });
    }

    await pool.query(
      'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [room.id, targetUserId]
    );

    const io = req.app.get('io');
    if (io) await emitLobbyState(io, room.room_token, room.id);

    return res.json({ success: true });
  } catch (err) {
    console.error('Add member failed:', err.message);
    return res.status(500).json({ error: 'Could not add member' });
  }
}

router.post('/add-member', protect, async (req, res) => {
  return addGroupMember(req, res, String(req.body.roomToken || ''));
});

async function renameGroup(req, res, roomToken) {
  const groupName = String(req.body.groupName || '').trim().slice(0, 60);
  if (!groupName) return res.status(400).json({ error: 'Group name is required' });

  try {
    const room = await getRoomByToken(roomToken);
    if (!room) return res.status(404).json({ error: 'Group not found' });

    const requesterRole = await getRequesterRole(room, req.user.id);
    if (requesterRole !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can rename the group' });
    }

    const suffix = room.room_token.match(/\s\([a-z0-9]{5}\)$/i)?.[0] || ` (${Math.random().toString(36).substring(2, 7)})`;
    const newRoomToken = `${groupName}${suffix}`;

    await pool.query('UPDATE party_rooms SET room_token = $1 WHERE id = $2', [newRoomToken, room.id]);

    const io = req.app.get('io');
    if (io) await emitLobbyState(io, newRoomToken, room.id);

    return res.json({ success: true, roomToken: newRoomToken });
  } catch (err) {
    console.error('Rename group failed:', err.message);
    return res.status(500).json({ error: 'Could not rename group' });
  }
}

router.post('/rename', protect, async (req, res) => {
  return renameGroup(req, res, String(req.body.roomToken || ''));
});

async function deleteGroup(req, res, roomToken) {
  try {
    const room = await getRoomByToken(roomToken);
    if (!room) return res.status(404).json({ error: 'Group not found' });

    const requesterRole = await getRequesterRole(room, req.user.id);
    if (requesterRole !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can delete the group' });
    }

    await pool.query('DELETE FROM room_members WHERE room_id = $1', [room.id]);
    await pool.query('DELETE FROM room_votes WHERE room_id = $1', [room.id]);
    await pool.query('DELETE FROM messages WHERE room_id = $1', [room.id]);
    await pool.query('DELETE FROM party_rooms WHERE id = $1', [room.id]);

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete group failed:', err.message);
    return res.status(500).json({ error: 'Could not delete group' });
  }
}

router.post('/delete', protect, async (req, res) => {
  return deleteGroup(req, res, String(req.body.roomToken || ''));
});

router.post('/leave', protect, async (req, res) => {
  const { roomToken } = req.body;

  try {
    const room = await getRoomByToken(roomToken);
    if (!room) return res.status(404).json({ error: 'Group not found' });

    await pool.query('DELETE FROM room_members WHERE room_id = $1 AND user_id = $2', [room.id, req.user.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not leave group' });
  }
});

module.exports = router;
