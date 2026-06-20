const crypto = require('crypto');
const env = require('../config/env');

const buckets = new Map();

function clientKey(req, scope) {
  const userId = req.user?.id ? `u:${req.user.id}` : '';
  return `${scope}:${userId || req.ip || req.socket.remoteAddress || 'unknown'}`;
}

function rateLimit({ scope = 'global', windowMs, max }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = clientKey(req, scope);
    const current = buckets.get(key);
    const bucket = current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(max - bucket.count, 0)));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      return res.status(429).json({
        error: 'Too many requests. Please slow down.',
        code: 'RATE_LIMITED'
      });
    }

    return next();
  };
}

function cleanupRateLimitBuckets() {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

setInterval(cleanupRateLimitBuckets, 5 * 60 * 1000).unref();

function securityHeaders(req, res, next) {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

  if (env.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  return next();
}

function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = String(id).slice(0, 80);
  res.setHeader('X-Request-Id', req.requestId);
  return next();
}

function requireJson(req, res, next) {
  const contentLength = Number(req.headers['content-length'] || 0);
  const hasBody = contentLength > 0 || req.headers['transfer-encoding'];
  if (!hasBody) return next();

  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.is('application/json') === false) {
    return res.status(415).json({
      error: 'Content-Type must be application/json',
      code: 'UNSUPPORTED_MEDIA_TYPE'
    });
  }
  return next();
}

module.exports = {
  rateLimit,
  requestId,
  requireJson,
  securityHeaders
};
