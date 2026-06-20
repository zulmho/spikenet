require('dotenv').config();

function numberFromEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

function boolFromEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const env = {
  port: numberFromEnv('PORT', 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET,
  appUrl: process.env.APP_URL || 'http://localhost:3001',
  trustProxy: boolFromEnv('TRUST_PROXY', false),
  corsOrigin: process.env.CORS_ORIGIN || '',
  backupDir: process.env.BACKUP_DIR || 'backups',
  uploadMaxMb: numberFromEnv('UPLOAD_MAX_MB', 12),
  jsonLimit: process.env.JSON_LIMIT || '1mb',
  payments: {
    provider: process.env.PAYMENT_PROVIDER || 'manual',
    publicName: process.env.PAYMENT_PUBLIC_NAME || 'Manual review',
    apiKey: process.env.PAYMENT_API_KEY || '',
    shopId: process.env.PAYMENT_SHOP_ID || '',
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || '',
    currency: process.env.PAYMENT_CURRENCY || 'SPK',
    spkRate: numberFromEnv('PAYMENT_SPK_RATE', 1)
  },
  rateLimit: {
    windowMs: numberFromEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    max: numberFromEnv('RATE_LIMIT_MAX', 900),
    authMax: numberFromEnv('AUTH_RATE_LIMIT_MAX', 30),
    writeMax: numberFromEnv('WRITE_RATE_LIMIT_MAX', 180),
    uploadMax: numberFromEnv('UPLOAD_RATE_LIMIT_MAX', 40),
    socketMax: numberFromEnv('SOCKET_RATE_LIMIT_MAX', 90)
  },
  db: {
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_DATABASE || 'my_database',
    password: process.env.DB_PASSWORD,
    port: numberFromEnv('DB_PORT', 5432),
    ssl: boolFromEnv('DB_SSL', false) ? { rejectUnauthorized: boolFromEnv('DB_SSL_REJECT_UNAUTHORIZED', true) } : false,
    max: numberFromEnv('DB_POOL_MAX', 10),
    idleTimeoutMillis: numberFromEnv('DB_IDLE_TIMEOUT_MS', 30000),
    connectionTimeoutMillis: numberFromEnv('DB_CONNECTION_TIMEOUT_MS', 5000)
  }
};

if (!env.jwtSecret) {
  if (env.nodeEnv === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  env.jwtSecret = 'dev_only_change_me';
}

if (env.nodeEnv === 'production') {
  const weakSecrets = new Set(['dev_only_change_me', 'change_this_secret_before_production']);
  if (weakSecrets.has(env.jwtSecret) || String(env.jwtSecret).length < 32) {
    throw new Error('JWT_SECRET must be unique and at least 32 characters in production');
  }
  if (!process.env.DB_PASSWORD) {
    throw new Error('DB_PASSWORD is required in production');
  }
}

module.exports = env;
