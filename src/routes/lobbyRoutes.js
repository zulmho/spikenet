const express = require('express');
const pool = require('../config/db');
const { protect } = require('../middleware/auth');

const router = express.Router();

let messageReplyColumnsReady = false;

async function ensureMessageReplyColumns() {
  if (messageReplyColumnsReady) return;
  const result = await pool.query(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'reply_author'
      ) AS has_reply_author,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'reply_content'
      ) AS has_reply_content
  `);
  if (!result.rows[0]?.has_reply_author || !result.rows[0]?.has_reply_content) {
    const err = new Error('Lobby message schema is missing. Run npm run migrate before starting SpikeNet.');
    err.status = 503;
    err.publicMessage = 'Group chat database is not ready';
    throw err;
  }
  messageReplyColumnsReady = true;
}

router.get('/history/:roomToken', protect, async (req, res) => {
  try {
    await ensureMessageReplyColumns();
    const messages = await pool.query(
      `SELECT m.id, m.username, m.content, m.created_at, m.reply_author, m.reply_content
       FROM messages m
       JOIN party_rooms pr ON m.room_id = pr.id
       WHERE pr.room_token = $1
       ORDER BY m.created_at ASC
       LIMIT 50`,
      [req.params.roomToken]
    );
    return res.json(messages.rows.map((message) => ({
      id: message.id,
      username: message.username,
      content: message.content,
      created_at: message.created_at,
      replyTo: message.reply_author
        ? { author: message.reply_author, content: message.reply_content || '' }
        : null
    })));
  } catch (err) {
    return res.status(500).json({ error: 'Could not load lobby history' });
  }
});

module.exports = router;
