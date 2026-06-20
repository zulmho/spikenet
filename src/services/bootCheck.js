const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const env = require('../config/env');

function requiredMigrationFiles() {
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  return fs.readdirSync(migrationsDir)
    .filter(file => file.endsWith('.sql'))
    .sort();
}

async function checkDatabaseReady() {
  await pool.query('SELECT 1');

  const table = await pool.query("SELECT to_regclass('public.schema_migrations') AS migrations_table");
  if (!table.rows[0]?.migrations_table) {
    return {
      ok: false,
      missing: requiredMigrationFiles(),
      message: 'schema_migrations table is missing'
    };
  }

  const appliedRes = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedRes.rows.map(row => row.filename));
  const missing = requiredMigrationFiles().filter(file => !applied.has(file));

  return {
    ok: missing.length === 0,
    missing,
    message: missing.length ? `Missing migrations: ${missing.join(', ')}` : 'Database is ready'
  };
}

async function assertBootReady() {
  const result = await checkDatabaseReady();
  if (result.ok) {
    console.log('Database boot check passed');
    return result;
  }

  const message = `${result.message}. Run npm run migrate.`;
  if (env.nodeEnv === 'production') {
    throw new Error(message);
  }

  console.warn(`Database boot check warning: ${message}`);
  return result;
}

module.exports = {
  assertBootReady,
  checkDatabaseReady
};
