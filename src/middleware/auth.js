const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    env.jwtSecret,
    { expiresIn: '24h' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

function protect(req, res, next) {
  const token = req.cookies && req.cookies.token;

  if (!token) {
    return res.status(401).json({ error: 'Access denied. Please log in.' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = { id: decoded.id, username: decoded.username };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid session token. Please log in again.' });
  }
}

module.exports = { protect, signToken, verifyToken };
