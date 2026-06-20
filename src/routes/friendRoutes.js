const express = require('express');
const pool = require('../config/db');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/search', protect, async (req, res) => {
  const query = String(req.query.query || '').trim();
  if (query.length < 2) return res.json([]);

  try {
    let searchRes;
    if (query.includes('#')) {
      const [namePart, tagPartRaw] = query.split('#');
      const tagPart = parseInt(tagPartRaw, 10);
      searchRes = Number.isNaN(tagPart)
        ? { rows: [] }
        : await pool.query(
          `SELECT id, username, user_tag, avatar_url, current_status
           FROM users
           WHERE username ILIKE $1 AND user_tag = $2 AND id != $3
           LIMIT 5`,
          [namePart, tagPart, req.user.id]
        );
    } else {
      searchRes = await pool.query(
        `SELECT id, username, user_tag, avatar_url, current_status
         FROM users
         WHERE username ILIKE $1 AND id != $2
         LIMIT 5`,
        [`%${query}%`, req.user.id]
      );
    }

    return res.json(searchRes.rows);
  } catch (err) {
    console.error('Friend search failed:', err.message);
    return res.status(500).json({ error: 'Search failed' });
  }
});

router.post('/request', protect, async (req, res) => {
  const friendId = Number(req.body.friendId);
  if (!friendId || friendId === Number(req.user.id)) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    const checkExist = await pool.query(
      `SELECT 1 FROM friendships
       WHERE (user_id = $1 AND friend_id = $2)
          OR (user_id = $2 AND friend_id = $1)`,
      [req.user.id, friendId]
    );

    if (checkExist.rows.length > 0) {
      return res.status(400).json({ error: 'Request already exists or users are already friends' });
    }

    await pool.query(
      "INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, 'pending')",
      [req.user.id, friendId]
    );

    req.app.get('io').to(`user_room_${friendId}`).emit('incomingFriendRequest');
    return res.json({ success: true, message: 'Friend request sent' });
  } catch (err) {
    console.error('Friend request failed:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/list', protect, async (req, res) => {
  try {
    const approvedFriends = await pool.query(
      `SELECT u.id, u.username, u.user_tag, u.avatar_url, u.current_status,
              (SELECT COUNT(*) FROM room_members rm WHERE rm.user_id = u.id) as is_in_lobby
       FROM (
         SELECT friend_id AS buddy_id FROM friendships WHERE user_id = $1 AND status = 'accepted'
         UNION ALL
         SELECT user_id AS buddy_id FROM friendships WHERE friend_id = $1 AND status = 'accepted'
       ) f
       JOIN users u ON u.id = f.buddy_id`,
      [req.user.id]
    );

    const pendingRequests = await pool.query(
      `SELECT u.id, u.username, u.user_tag, u.avatar_url
       FROM friendships f
       JOIN users u ON f.user_id = u.id
       WHERE f.friend_id = $1 AND f.status = 'pending'`,
      [req.user.id]
    );

    return res.json({ friends: approvedFriends.rows, requests: pendingRequests.rows });
  } catch (err) {
    console.error('Friend list failed:', err.message);
    return res.status(500).json({ error: 'Could not load friends' });
  }
});

router.post('/accept', protect, async (req, res) => {
  const requesterId = Number(req.body.requesterId);

  try {
    const updateRes = await pool.query(
      `UPDATE friendships
       SET status = 'accepted'
       WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'
       RETURNING *`,
      [requesterId, req.user.id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(400).json({ error: 'Request not found' });
    }

    const io = req.app.get('io');
    io.to(`user_room_${req.user.id}`).emit('socialListUpdated');
    io.to(`user_room_${requesterId}`).emit('socialListUpdated');

    return res.json({ success: true, message: 'Friend request accepted' });
  } catch (err) {
    console.error('Friend accept failed:', err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/remove', protect, async (req, res) => {
  const targetId = Number(req.body.targetId);

  try {
    await pool.query(
      `DELETE FROM friendships
       WHERE (user_id = $1 AND friend_id = $2)
          OR (user_id = $2 AND friend_id = $1)`,
      [req.user.id, targetId]
    );

    const io = req.app.get('io');
    io.to(`user_room_${req.user.id}`).emit('socialListUpdated');
    io.to(`user_room_${targetId}`).emit('socialListUpdated');

    return res.json({ success: true, message: 'Friend removed' });
  } catch (err) {
    console.error('Friend remove failed:', err.message);
    return res.status(500).json({ error: 'Could not remove friend' });
  }
});

module.exports = router;
