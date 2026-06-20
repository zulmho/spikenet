const cookie = require('cookie');
const pool = require('../config/db');
const env = require('../config/env');
const { verifyToken } = require('../middleware/auth');
const {
  getRoomByToken,
  getOrCreateRoom,
  addRoomMember,
  isRoomMember,
  ensureRoomRoles,
  emitLobbyState
} = require('../services/lobbyService');
const { isUserMuted } = require('../services/adminService');

const state = {
  voiceUsers: {},
  onlineUsers: {},
  userSockets: {},
  roomSeen: {}
};

const socketBuckets = new Map();
let messageReplyColumnsReady = false;
let directMessageColumnsReady = false;

function allowSocketEvent(userId, scope) {
  const now = Date.now();
  const key = `${scope}:${userId}`;
  const current = socketBuckets.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + env.rateLimit.windowMs };
  bucket.count += 1;
  socketBuckets.set(key, bucket);
  return bucket.count <= env.rateLimit.socketMax;
}

function guardSocketEvent(socket, scope) {
  if (allowSocketEvent(socket.user.id, scope)) return true;
  socket.emit('rateLimited', {
    scope,
    message: 'Too many actions. Please slow down.'
  });
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of socketBuckets.entries()) {
    if (bucket.resetAt <= now) socketBuckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

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
    throw new Error('Lobby message schema is missing. Run npm run migrate before starting SpikeNet.');
  }
  messageReplyColumnsReady = true;
}

async function ensureDirectMessageColumns() {
  if (directMessageColumnsReady) return;
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'direct_messages' AND column_name = 'reactions'
    ) AS has_reactions
  `);
  if (!result.rows[0]?.has_reactions) {
    throw new Error('Direct message schema is missing. Run npm run migrate before starting SpikeNet.');
  }
  directMessageColumnsReady = true;
}

async function getDirectChatForUser(chatId, userId) {
  const chatRes = await pool.query(
    `SELECT id, user_one_id, user_two_id
     FROM direct_chats
     WHERE id = $1 AND (user_one_id = $2 OR user_two_id = $2)`,
    [chatId, userId]
  );
  return chatRes.rows[0] || null;
}

function otherChatUser(chat, userId) {
  return Number(chat.user_one_id) === Number(userId) ? chat.user_two_id : chat.user_one_id;
}

function registerSocketHandlers(io) {
  io.use((socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers.cookie || '');
      const token = cookies.token;
      if (!token) return next(new Error('Socket auth failed: token missing'));

      const decoded = verifyToken(token);
      socket.user = { id: decoded.id, username: decoded.username };
      return next();
    } catch (err) {
      return next(new Error('Socket auth failed: invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = Number(socket.user.id);
    const username = socket.user.username;

    let boundRoomToken = null;

    socket.join(`user_room_${userId}`);
    state.onlineUsers[socket.id] = userId;
    state.userSockets[userId] = socket.id;

    pool.query("UPDATE users SET current_status = 'online' WHERE id = $1", [userId])
      .then(() => io.emit('globalSocialUpdate'))
      .catch((err) => console.error(err.message));

    socket.on('initUserSession', () => {
      state.userSockets[userId] = socket.id;
    });

    socket.on('joinDirectChat', async ({ chatId }) => {
      try {
        const chat = await getDirectChatForUser(chatId, userId);
        if (!chat) return;
        socket.join(`direct_chat_${chat.id}`);
      } catch (err) {
        console.error('joinDirectChat failed:', err.message);
      }
    });

    socket.on('sendDirectMessage', async ({ chatId, content }) => {
      if (!guardSocketEvent(socket, 'direct-message')) return;
      const cleanContent = String(content || '').trim();
      if (!cleanContent) return;

      try {
        if (await isUserMuted(userId)) {
          socket.emit('moderationBlocked', { reason: 'You are muted and cannot send messages yet.' });
          return;
        }

        const chat = await getDirectChatForUser(chatId, userId);
        if (!chat) return;
        await ensureDirectMessageColumns();

        const dbInsert = await pool.query(
          'INSERT INTO direct_messages (chat_id, sender_id, content) VALUES ($1, $2, $3) RETURNING id, reactions',
          [chat.id, userId, cleanContent.slice(0, 2000)]
        );
        const avatarRes = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId]);

        const payload = {
          id: dbInsert.rows[0].id,
          chat_id: chat.id,
          sender_id: userId,
          username,
          avatar_url: avatarRes.rows[0]?.avatar_url || '',
          content: cleanContent.slice(0, 2000),
          reactions: dbInsert.rows[0].reactions || {},
          created_at: new Date()
        };

        io.to(`direct_chat_${chat.id}`).emit('newDirectMessage', payload);
        const targetUserId = otherChatUser(chat, userId);
        socket.to(`user_room_${targetUserId}`).emit('incomingDMAlert', {
          chatId: chat.id,
          username,
          content: payload.content,
          senderId: userId
        });
      } catch (err) {
        console.error('sendDirectMessage failed:', err.message);
      }
    });

    socket.on('typingDirect', async ({ chatId, isTyping }) => {
      try {
        const chat = await getDirectChatForUser(chatId, userId);
        if (!chat) return;
        socket.to(`direct_chat_${chat.id}`).emit('directTyping', {
          chatId: chat.id,
          userId,
          username,
          isTyping: !!isTyping
        });
      } catch (err) {
        console.error('typingDirect failed:', err.message);
      }
    });

    socket.on('sendMessage', async ({ roomToken, content, isSystem, replyTo }) => {
      if (!guardSocketEvent(socket, 'group-message')) return;
      const cleanContent = String(content || '').trim();
      if (!roomToken || !cleanContent) return;

      try {
        if (!isSystem && await isUserMuted(userId)) {
          socket.emit('moderationBlocked', { reason: 'You are muted and cannot send messages yet.' });
          return;
        }

        const room = await getRoomByToken(roomToken);
        if (!room || !(await isRoomMember(room.id, userId))) return;

        const cleanReply = replyTo && replyTo.author && replyTo.content
          ? {
              author: String(replyTo.author).slice(0, 80),
              content: String(replyTo.content).slice(0, 180)
            }
          : null;

        let insertedMessageId = null;
        if (!isSystem) {
          await ensureMessageReplyColumns();
          const inserted = await pool.query(
            `INSERT INTO messages (room_id, user_id, username, content, reply_author, reply_content)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [room.id, userId, username, cleanContent.slice(0, 2000), cleanReply?.author || null, cleanReply?.content || null]
          );
          insertedMessageId = inserted.rows[0]?.id || null;
        }

        io.to(roomToken).emit('newMessage', {
          id: insertedMessageId,
          username,
          content: cleanContent.slice(0, 2000),
          replyTo: cleanReply,
          isSystem: !!isSystem,
          created_at: new Date()
        });
      } catch (err) {
        console.error('sendMessage failed:', err.message);
      }
    });

    socket.on('sendLobbyInvite', async ({ roomToken, targetUserId }) => {
      if (!guardSocketEvent(socket, 'invite')) return;
      try {
        const room = await getRoomByToken(roomToken);
        if (!room || !(await isRoomMember(room.id, userId))) return;

        io.to(`user_room_${Number(targetUserId)}`).emit('incomingLobbyInvite', {
          roomToken,
          senderUsername: username
        });
      } catch (err) {
        console.error('sendLobbyInvite failed:', err.message);
      }
    });

    socket.on('directCallInvite', ({ targetUserId }) => {
      if (!guardSocketEvent(socket, 'direct-call')) return;
      const cleanTargetId = Number(targetUserId);
      if (!Number.isInteger(cleanTargetId) || cleanTargetId === userId) return;

      io.to(`user_room_${cleanTargetId}`).emit('incomingDirectCall', {
        callerId: userId,
        callerUsername: username,
        callerSocketId: socket.id
      });
    });

    socket.on('directCallAccept', ({ targetSocketId }) => {
      if (!targetSocketId) return;
      io.to(targetSocketId).emit('directCallAccepted', {
        calleeId: userId,
        calleeUsername: username,
        calleeSocketId: socket.id
      });
    });

    socket.on('directCallDecline', ({ targetSocketId }) => {
      if (!targetSocketId) return;
      io.to(targetSocketId).emit('directCallDeclined', {
        userId,
        username
      });
    });

    socket.on('directCallEnd', ({ targetSocketId }) => {
      if (!targetSocketId) return;
      io.to(targetSocketId).emit('directCallEnded', {
        userId,
        username
      });
    });

    socket.on('deleteLobbyMessage', async ({ roomToken, messageId }) => {
      const cleanMessageId = Number(messageId);
      if (!roomToken || !Number.isInteger(cleanMessageId)) return;

      try {
        const room = await getRoomByToken(roomToken);
        if (!room || !(await isRoomMember(room.id, userId))) return;

        const result = await pool.query(
          `DELETE FROM messages
           WHERE id = $1 AND room_id = $2 AND user_id = $3
           RETURNING id`,
          [cleanMessageId, room.id, userId]
        );

        if (result.rowCount > 0) {
          io.to(roomToken).emit('messageDeleted', { messageId: cleanMessageId, scope: 'lobby' });
        }
      } catch (err) {
        console.error('deleteLobbyMessage failed:', err.message);
      }
    });

    socket.on('addMemberToGroup', async ({ roomToken, targetUserId }) => {
      try {
        await ensureRoomRoles();
        const room = await getRoomByToken(roomToken);
        if (!room || !(await isRoomMember(room.id, userId))) return;

        const requesterRole = Number(room.creator_id) === Number(userId)
          ? 'owner'
          : (await pool.query(
              'SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2',
              [room.id, userId]
            )).rows[0]?.role;
        if (requesterRole !== 'owner' && requesterRole !== 'admin') return;

        await addRoomMember(room.id, Number(targetUserId));
        await emitLobbyState(io, roomToken, room.id);
      } catch (err) {
        console.error('addMemberToGroup failed:', err.message);
      }
    });

    socket.on('joinRoom', async ({ roomToken }) => {
      if (!roomToken) return;

      try {
        boundRoomToken = roomToken;
        socket.join(roomToken);

        const room = await getOrCreateRoom(roomToken, userId);
        await addRoomMember(room.id, userId);
        await pool.query('UPDATE users SET current_status = $1 WHERE id = $2', [`В лобби #${roomToken}`, userId]);

        io.emit('globalSocialUpdate');
        socket.to(roomToken).emit('newMessage', {
          username: 'SpikeNet',
          content: `${username} вошёл в группу`,
          isSystem: true,
          created_at: new Date()
        });
        await emitLobbyState(io, roomToken, room.id);
      } catch (err) {
        console.error('joinRoom failed:', err.message);
      }
    });

    socket.on('typingLobby', ({ roomToken, isTyping }) => {
      if (!roomToken) return;
      socket.to(roomToken).emit('lobbyTyping', { userId, username, isTyping: !!isTyping });
    });

    socket.on('lobbySeen', ({ roomToken }) => {
      if (!roomToken) return;
      state.roomSeen[roomToken] = state.roomSeen[roomToken] || {};
      state.roomSeen[roomToken][userId] = Date.now();
      io.to(roomToken).emit('lobbySeenUpdated', {
        seenCount: Object.keys(state.roomSeen[roomToken]).length
      });
    });

    socket.on('updateStatus', async ({ newStatus, roomToken }) => {
      const cleanStatus = String(newStatus || '').trim().slice(0, 120);
      if (!cleanStatus) return;

      try {
        await pool.query('UPDATE users SET current_status = $1 WHERE id = $2', [cleanStatus, userId]);
        const room = roomToken ? await getRoomByToken(roomToken) : null;
        if (room) await emitLobbyState(io, roomToken, room.id);
        io.emit('globalSocialUpdate');
      } catch (err) {
        console.error('updateStatus failed:', err.message);
      }
    });

    socket.on('voteGame', async ({ roomToken, productId }) => {
      try {
        const room = await getRoomByToken(roomToken);
        if (!room || !(await isRoomMember(room.id, userId))) return;

        const existingVote = await pool.query(
          'SELECT id FROM room_votes WHERE room_id = $1 AND user_id = $2 AND product_id = $3',
          [room.id, userId, productId]
        );

        if (existingVote.rows.length > 0) {
          await pool.query('DELETE FROM room_votes WHERE id = $1', [existingVote.rows[0].id]);
        } else {
          await pool.query(
            'INSERT INTO room_votes (room_id, user_id, product_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [room.id, userId, productId]
          );

          const gameRes = await pool.query('SELECT title FROM products WHERE id = $1', [productId]);
          if (gameRes.rows.length > 0) {
            await pool.query('UPDATE users SET current_status = $1 WHERE id = $2', [`Катает в ${gameRes.rows[0].title}`, userId]);
            io.emit('globalSocialUpdate');
          }
        }

        await emitLobbyState(io, roomToken, room.id);
      } catch (err) {
        console.error('voteGame failed:', err.message);
      }
    });

    socket.on('voice-join', ({ roomToken, voiceChannel }) => {
      if (!roomToken) return;
      const cleanVoiceChannel = ['voice', 'duo', 'squad'].includes(String(voiceChannel)) ? String(voiceChannel) : 'voice';

      state.voiceUsers[socket.id] = { roomToken, voiceChannel: cleanVoiceChannel, userId, username };
      const activeList = Object.keys(state.voiceUsers)
        .filter((sid) => state.voiceUsers[sid].roomToken === roomToken && state.voiceUsers[sid].voiceChannel === cleanVoiceChannel && sid !== socket.id)
        .map((sid) => ({
          socketId: sid,
          userId: state.voiceUsers[sid].userId,
          username: state.voiceUsers[sid].username,
          voiceChannel: state.voiceUsers[sid].voiceChannel
        }));

        socket.emit('voice-channels-list', activeList);
      socket.to(roomToken).emit('voice-user-joined', { socketId: socket.id, userId, username, voiceChannel: cleanVoiceChannel });
    });

    socket.on('voice-offer', ({ targetSocketId, offer }) => {
      io.to(targetSocketId).emit('voice-offer-received', { senderSocketId: socket.id, offer });
    });

    socket.on('voice-answer', ({ targetSocketId, answer }) => {
      io.to(targetSocketId).emit('voice-answer-received', { senderSocketId: socket.id, answer });
    });

    socket.on('voice-ice-candidate', ({ targetSocketId, candidate }) => {
      io.to(targetSocketId).emit('voice-ice-candidate-received', { senderSocketId: socket.id, candidate });
    });

    socket.on('voice-speaking-state', ({ roomToken, voiceChannel, isSpeaking }) => {
      socket.to(roomToken).emit('voice-user-speaking', { userId, voiceChannel, isSpeaking });
    });

    socket.on('voice-leave', ({ roomToken }) => {
      const voiceChannel = state.voiceUsers[socket.id]?.voiceChannel;
      if (state.voiceUsers[socket.id]) delete state.voiceUsers[socket.id];
      socket.to(roomToken).emit('voice-user-left', { socketId: socket.id, userId, voiceChannel });
    });

    socket.on('leaveRoom', async ({ roomToken }) => {
      await handleExitCleanup(io, socket, roomToken, userId);
      if (roomToken) {
        socket.to(roomToken).emit('newMessage', {
          username: 'SpikeNet',
          content: `${username} left the group`,
          isSystem: true,
          created_at: new Date()
        });
      }
      await pool.query("UPDATE users SET current_status = 'online' WHERE id = $1", [userId]);
      io.emit('globalSocialUpdate');
    });

    socket.on('disconnect', async () => {
      if (boundRoomToken) await handleExitCleanup(io, socket, boundRoomToken, userId);

      delete state.onlineUsers[socket.id];
      delete state.userSockets[userId];

      const activeTabs = Object.values(state.onlineUsers).filter((id) => Number(id) === userId);
      if (activeTabs.length === 0) {
        await pool.query("UPDATE users SET current_status = 'Оффлайн' WHERE id = $1", [userId])
          .catch((err) => console.error(err.message));
        io.emit('globalSocialUpdate');
      }
    });
  });
}

async function handleExitCleanup(io, socket, roomToken, userId) {
  const voiceChannel = state.voiceUsers[socket.id]?.voiceChannel;
  if (state.voiceUsers[socket.id]) delete state.voiceUsers[socket.id];
  socket.to(roomToken).emit('voice-user-left', { socketId: socket.id, userId, voiceChannel });

  const room = await getRoomByToken(roomToken);
  if (room) await emitLobbyState(io, roomToken, room.id);
}

module.exports = registerSocketHandlers;
