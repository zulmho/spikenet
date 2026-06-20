const express = require('express');
const pool = require('../config/db');
const { protect } = require('../middleware/auth');

const router = express.Router();

let dmSchemaReady = false;

async function ensureDmSchema() {
  if (dmSchemaReady) return;
  const result = await pool.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'direct_chats' AND column_name = 'pinned_message_id'
      ) AS has_pinned,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'direct_messages' AND column_name = 'reactions'
      ) AS has_reactions
  `);
  if (!result.rows[0]?.has_pinned || !result.rows[0]?.has_reactions) {
    const err = new Error('DM schema is missing. Run npm run migrate before starting SpikeNet.');
    err.status = 503;
    err.publicMessage = 'Chat database is not ready';
    throw err;
  }
  dmSchemaReady = true;
}

async function getChatForUser(chatId, userId) {
  await ensureDmSchema();
  const chatRes = await pool.query(
    `SELECT id, user_one_id, user_two_id
     FROM direct_chats
     WHERE id = $1 AND (user_one_id = $2 OR user_two_id = $2)`,
    [chatId, userId]
  );
  return chatRes.rows[0] || null;
}

router.post('/chat', protect, async (req, res) => {
  const friendId = Number(req.body.friendId);
  const myId = Number(req.user.id);

  if (!friendId || friendId === myId) {
    return res.status(400).json({ error: 'Invalid chat participant' });
  }

  const u1 = Math.min(myId, friendId);
  const u2 = Math.max(myId, friendId);

  try {
    await ensureDmSchema();
    const chatRes = await pool.query(
      `INSERT INTO direct_chats (user_one_id, user_two_id)
       VALUES ($1, $2)
       ON CONFLICT (user_one_id, user_two_id)
       DO UPDATE SET user_one_id = EXCLUDED.user_one_id
       RETURNING id`,
      [u1, u2]
    );

    return res.json({ chatId: chatRes.rows[0].id });
  } catch (err) {
    console.error('DM chat create failed:', err.message);
    return res.status(500).json({ error: 'Could not create chat' });
  }
});

router.get('/history/:chatId', protect, async (req, res) => {
  try {
    await ensureDmSchema();
    const chat = await getChatForUser(req.params.chatId, req.user.id);
    if (!chat) return res.status(403).json({ error: 'Chat access denied' });

    const pinnedRes = await pool.query(
      `SELECT dm.id, dm.chat_id, dm.sender_id, u.username, u.avatar_url, dm.content, dm.reactions, dm.created_at
       FROM direct_chats dc
       JOIN direct_messages dm ON dm.id = dc.pinned_message_id
       JOIN users u ON u.id = dm.sender_id
       WHERE dc.id = $1`,
      [req.params.chatId]
    );

    const history = await pool.query(
      `SELECT dm.id, dm.chat_id, dm.sender_id, u.username, u.avatar_url, dm.content, dm.reactions, dm.created_at
       FROM direct_messages dm
       JOIN users u ON u.id = dm.sender_id
       WHERE dm.chat_id = $1
       ORDER BY dm.created_at ASC
       LIMIT 100`,
      [req.params.chatId]
    );

    return res.json({ messages: history.rows, pinned: pinnedRes.rows[0] || null });
  } catch (err) {
    return res.status(500).json({ error: 'Could not load DM history' });
  }
});

router.delete('/message/:messageId', protect, async (req, res) => {
  try {
    await ensureDmSchema();
    const deleted = await pool.query(
      `DELETE FROM direct_messages dm
       USING direct_chats dc
       WHERE dm.id = $1
         AND dm.chat_id = dc.id
         AND (dc.user_one_id = $2 OR dc.user_two_id = $2)
       RETURNING dm.id, dm.chat_id`,
      [req.params.messageId, req.user.id]
    );

    if (deleted.rows.length === 0) return res.status(404).json({ error: 'Message not found' });

    const io = req.app.get('io');
    io.to(`direct_chat_${deleted.rows[0].chat_id}`).emit('messageDeleted', {
      messageId: Number(req.params.messageId)
    });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not delete message' });
  }
});

router.delete('/chat/:chatId/clear', protect, async (req, res) => {
  try {
    await ensureDmSchema();
    const chat = await getChatForUser(req.params.chatId, req.user.id);
    if (!chat) return res.status(403).json({ error: 'Chat access denied' });

    await pool.query('DELETE FROM direct_messages WHERE chat_id = $1', [req.params.chatId]);
    req.app.get('io').to(`direct_chat_${req.params.chatId}`).emit('chatCleared');

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not clear chat' });
  }
});

router.post('/chat/:chatId/pin', protect, async (req, res) => {
  const messageId = req.body.messageId ? Number(req.body.messageId) : null;
  try {
    await ensureDmSchema();
    const chat = await getChatForUser(req.params.chatId, req.user.id);
    if (!chat) return res.status(403).json({ error: 'Chat access denied' });

    if (messageId) {
      const message = await pool.query(
        'SELECT id FROM direct_messages WHERE id = $1 AND chat_id = $2',
        [messageId, chat.id]
      );
      if (!message.rows[0]) return res.status(404).json({ error: 'Message not found' });
    }

    await pool.query('UPDATE direct_chats SET pinned_message_id = $1 WHERE id = $2', [messageId, chat.id]);
    req.app.get('io')?.to(`direct_chat_${chat.id}`).emit('directChatPinned', { chatId: chat.id, messageId });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Could not pin message' });
  }
});

router.post('/message/:messageId/react', protect, async (req, res) => {
  const reaction = String(req.body.reaction || '').trim().slice(0, 12);
  if (!reaction) return res.status(400).json({ error: 'Reaction is required' });

  try {
    await ensureDmSchema();
    const message = await pool.query(
      `SELECT dm.id, dm.chat_id, dm.reactions
       FROM direct_messages dm
       JOIN direct_chats dc ON dc.id = dm.chat_id
       WHERE dm.id = $1 AND (dc.user_one_id = $2 OR dc.user_two_id = $2)`,
      [req.params.messageId, req.user.id]
    );
    const row = message.rows[0];
    if (!row) return res.status(404).json({ error: 'Message not found' });

    const reactions = row.reactions || {};
    reactions[reaction] = reactions[reaction] || [];
    const userKey = String(req.user.id);
    if (reactions[reaction].includes(userKey)) {
      reactions[reaction] = reactions[reaction].filter(id => id !== userKey);
      if (!reactions[reaction].length) delete reactions[reaction];
    } else {
      reactions[reaction].push(userKey);
    }

    const updated = await pool.query(
      'UPDATE direct_messages SET reactions = $1::jsonb WHERE id = $2 RETURNING id, chat_id, reactions',
      [JSON.stringify(reactions), row.id]
    );
    req.app.get('io')?.to(`direct_chat_${row.chat_id}`).emit('directMessageReaction', updated.rows[0]);
    return res.json(updated.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Could not update reaction' });
  }
});

module.exports = router;
