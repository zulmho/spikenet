const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`OK   ${message}`);
}

function checkFile(file) {
  if (fs.existsSync(path.join(__dirname, '..', file))) {
    pass(`${file} exists`);
  } else {
    fail(`${file} is missing`);
  }
}

try {
  const env = require('../src/config/env');

  if (env.nodeEnv !== 'production') fail('NODE_ENV must be production for the final deploy check');
  else pass('NODE_ENV=production');

  if (env.jwtSecret && env.jwtSecret.length >= 32) pass('JWT_SECRET length is production-safe');
  else fail('JWT_SECRET must be at least 32 characters');

  if (env.db.password) pass('DB_PASSWORD is set');
  else fail('DB_PASSWORD is required');

  if (env.appUrl && /^https?:\/\//.test(env.appUrl)) pass('APP_URL is set');
  else fail('APP_URL must be a full URL');

  if (env.port > 0 && env.port < 65536) pass('PORT is valid');
  else fail('PORT is invalid');

  checkFile('.env.example');
  checkFile('scripts/backup-db.js');
  checkFile('migrations');
  checkFile('public/js/spikenet-react-modules.js');
  checkFile('public/config/feature-flags.json');

  if (!fs.existsSync(path.join(__dirname, '..', '.env'))) {
    fail('.env is missing for local deploy checks');
  } else {
    pass('.env exists locally');
  }
} catch (err) {
  fail(err.message);
}
