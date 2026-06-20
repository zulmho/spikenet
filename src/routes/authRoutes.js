const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/db');
const env = require('../config/env');
const { protect, signToken } = require('../middleware/auth');
const { rateLimit } = require('../middleware/security');
const { ensureAdminSchema, getUserRoles, getModerationState } = require('../services/adminService');
const { validateBody } = require('../middleware/validate');
const { validateStrongPassword, passwordPolicyText } = require('../services/passwordPolicy');

const router = express.Router();

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/'
  };
}

const authAttemptLimit = rateLimit({
  scope: 'auth-attempt',
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax
});

function normalizeResetToken(token) {
  return String(token || '').trim().replace(/\s+/g, '').toUpperCase();
}

async function hashResetToken(token) {
  return bcrypt.hash(normalizeResetToken(token), 10);
}

router.post('/register', authAttemptLimit, validateBody({
  username: { type: 'string', min: 3, max: 32, required: true },
  password: { type: 'string', min: 10, max: 128, required: true, trim: false }
}), async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can contain only letters, numbers, dot, underscore and dash' });
  }

  const passwordCheck = validateStrongPassword(password, username);
  if (!passwordCheck.ok) {
    return res.status(400).json({
      error: `Слабый пароль: ${passwordCheck.errors.join(', ')}. ${passwordPolicyText()}`,
      code: 'WEAK_PASSWORD',
      fields: ['password']
    });
  }

  try {
    const userCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`;
    const userTag = Math.floor(1000 + Math.random() * 9000);

    const newUser = await pool.query(
      `INSERT INTO users (username, password_hash, avatar_url, current_status, user_tag)
       VALUES ($1, $2, $3, 'new on SpikeNet', $4)
       RETURNING id, username, user_tag`,
      [username, passwordHash, avatarUrl, userTag]
    );

    return res.status(201).json({ message: 'Registration successful', user: newUser.rows[0] });
  } catch (err) {
    console.error('Registration failed:', err.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', authAttemptLimit, validateBody({
  username: { type: 'string', min: 1, max: 64, required: true },
  password: { type: 'string', min: 1, max: 128, required: true, trim: false }
}), async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  try {
    const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = userRes.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    await ensureAdminSchema();
    const moderation = await getModerationState(user.id);
    if (moderation.is_banned) {
      return res.status(403).json({ error: moderation.ban_reason || 'Account is banned' });
    }
    const roles = await getUserRoles(user);

    await pool.query("UPDATE users SET current_status = 'online' WHERE id = $1", [user.id]);

    const token = signToken(user);
    res.cookie('token', token, {
      ...cookieOptions(),
      maxAge: 24 * 60 * 60 * 1000
    });

    return res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        current_status: 'online',
        roles,
        moderation
      }
    });
  } catch (err) {
    console.error('Login failed:', err.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/password/reset/request', authAttemptLimit, validateBody({
  username: { type: 'string', min: 1, max: 64, required: true }
}), async (req, res) => {
  const username = req.body.username;
  const publicMessage = 'Если аккаунт найден, код восстановления создан.';

  try {
    const userRes = await pool.query('SELECT id, username, user_tag FROM users WHERE username = $1', [username]);
    const user = userRes.rows[0];
    if (!user) return res.json({ message: publicMessage });

    const resetToken = crypto.randomBytes(4).toString('hex').toUpperCase();
    const tokenHash = await hashResetToken(resetToken);
    await pool.query(
      `UPDATE users
       SET password_reset_token_hash = $1,
           password_reset_expires_at = NOW() + INTERVAL '15 minutes'
       WHERE id = $2`,
      [tokenHash, user.id]
    );

    return res.json({
      message: publicMessage,
      expiresInMinutes: 15,
      resetToken: env.nodeEnv === 'production' ? undefined : resetToken
    });
  } catch (err) {
    console.error('Password reset request failed:', err.message);
    return res.status(500).json({ error: 'Could not create password reset code' });
  }
});

router.post('/password/reset/confirm', authAttemptLimit, validateBody({
  username: { type: 'string', min: 1, max: 64, required: true },
  token: { type: 'string', min: 4, max: 64, required: true },
  password: { type: 'string', min: 10, max: 128, required: true, trim: false }
}), async (req, res) => {
  const username = req.body.username;
  const token = normalizeResetToken(req.body.token);
  const password = req.body.password;

  const passwordCheck = validateStrongPassword(password, username);
  if (!passwordCheck.ok) {
    return res.status(400).json({
      error: `Слабый пароль: ${passwordCheck.errors.join(', ')}. ${passwordPolicyText()}`,
      code: 'WEAK_PASSWORD',
      fields: ['password']
    });
  }

  try {
    const userRes = await pool.query(
      `SELECT id, username, password_reset_token_hash, password_reset_expires_at
       FROM users
       WHERE username = $1`,
      [username]
    );
    const user = userRes.rows[0];
    if (!user || !user.password_reset_token_hash || !user.password_reset_expires_at) {
      return res.status(400).json({ error: 'Код восстановления неверный или устарел' });
    }

    if (new Date(user.password_reset_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Код восстановления устарел' });
    }

    const tokenOk = await bcrypt.compare(token, user.password_reset_token_hash);
    if (!tokenOk) return res.status(400).json({ error: 'Код восстановления неверный или устарел' });

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token_hash = NULL,
           password_reset_expires_at = NULL,
           password_updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    return res.json({ message: 'Пароль обновлён. Теперь можно войти.' });
  } catch (err) {
    console.error('Password reset confirm failed:', err.message);
    return res.status(500).json({ error: 'Could not reset password' });
  }
});

function sendLoggedOut(res) {
  const expires = new Date(0);
  res.clearCookie('token', cookieOptions());
  res.cookie('token', '', { ...cookieOptions(), expires, maxAge: 0 });
  res.append('Set-Cookie', 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax');
  return res.json({ message: 'Logged out' });
}

router.post('/logout', (req, res) => {
  return sendLoggedOut(res);
});

router.get('/logout', (req, res) => {
  return sendLoggedOut(res);
});

router.get('/me', protect, async (req, res) => {
  try {
    await ensureAdminSchema();
    const userRes = await pool.query(
      `SELECT id, username, user_tag, avatar_url, current_status, spycat_karma,
              color_accent, compact_grid, spike_sound
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = userRes.rows[0];
    const moderation = await getModerationState(user.id);
    return res.json({
      ...user,
      roles: await getUserRoles(user),
      moderation
    });
  } catch (err) {
    console.error('Session check failed:', err.message);
    return res.status(500).json({ error: 'Session check failed' });
  }
});

module.exports = router;
