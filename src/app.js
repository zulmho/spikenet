const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const env = require('./config/env');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const friendRoutes = require('./routes/friendRoutes');
const groupRoutes = require('./routes/groupRoutes');
const lobbyRoutes = require('./routes/lobbyRoutes');
const dmRoutes = require('./routes/dmRoutes');
const marketRoutes = require('./routes/marketRoutes');
const adminRoutes = require('./routes/adminRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const telemetryRoutes = require('./routes/telemetryRoutes');
const errorHandler = require('./middleware/errorHandler');
const compression = require('./middleware/compression');
const compressedStatic = require('./middleware/compressedStatic');
const { rateLimit, requestId, requireJson, securityHeaders } = require('./middleware/security');
const { checkDatabaseReady } = require('./services/bootCheck');

function staticCacheOptions(kind = 'public') {
  const isProduction = env.nodeEnv === 'production';
  return {
    etag: true,
    maxAge: isProduction ? (kind === 'uploads' ? '7d' : '30d') : 0,
    immutable: isProduction && kind !== 'html',
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  };
}

function createApp(io) {
  const app = express();

  if (io) app.set('io', io);

  if (env.trustProxy) app.set('trust proxy', 1);

  app.disable('x-powered-by');
  app.use(requestId);
  app.use(securityHeaders);
  app.use(rateLimit({
    scope: 'global',
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.max
  }));
  app.use(compression);
  app.use(express.json({ limit: env.jsonLimit }));
  app.use(cookieParser());
  app.use(compressedStatic(path.join(__dirname, '..', 'public'), {
    production: env.nodeEnv === 'production'
  }));
  app.use(express.static(path.join(__dirname, '..', 'public'), staticCacheOptions()));
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
    ...staticCacheOptions('uploads'),
    fallthrough: false
  }));

  app.get('/health', async (req, res) => {
    try {
      const db = await checkDatabaseReady();
      res.status(db.ok ? 200 : 503).json({
        ok: db.ok,
        app: 'SpikeNet',
        env: env.nodeEnv,
        uptime: Math.round(process.uptime()),
        db
      });
    } catch (err) {
      res.status(503).json({
        ok: false,
        app: 'SpikeNet',
        env: env.nodeEnv,
        uptime: Math.round(process.uptime()),
        db: { ok: false, message: err.message }
      });
    }
  });

  app.use('/api/auth', requireJson, authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/friends', friendRoutes);
  app.use('/api/groups', groupRoutes);
  app.use('/api/lobby', lobbyRoutes);
  app.use('/api/dm', dmRoutes);
  app.use('/api/market', rateLimit({
    scope: 'market-write',
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.writeMax
  }), marketRoutes);
  app.use('/api/admin', rateLimit({
    scope: 'admin-write',
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.writeMax
  }), adminRoutes);
  app.use('/api/uploads', rateLimit({
    scope: 'upload',
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.uploadMax
  }), uploadRoutes);
  app.use('/api/telemetry', rateLimit({
    scope: 'telemetry',
    windowMs: env.rateLimit.windowMs,
    max: env.rateLimit.writeMax
  }), telemetryRoutes);
  app.get('/market/listing/:id', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
  app.get('/legal/offer', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'legal-offer.html'));
  });
  app.get('/contacts', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'contacts.html'));
  });
  app.get('/how-it-works', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'how-it-works.html'));
  });

  app.use(errorHandler);

  return app;
}

module.exports = createApp;
