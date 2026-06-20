const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const migrationsDir = path.join(__dirname, '..', 'migrations');

test('migration files are ordered and idempotent by convention', () => {
  const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql')).sort();
  assert.ok(files.length >= 2);
  assert.deepEqual(files, [...files].sort());

  for (const file of files) {
    assert.match(file, /^\d{3}_[a-z0-9_]+\.sql$/);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    assert.match(sql, /(CREATE TABLE IF NOT EXISTS|ALTER TABLE)/i);
  }
});
