const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const env = require('../src/config/env');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function run() {
  const backupDir = path.resolve(__dirname, '..', env.backupDir);
  fs.mkdirSync(backupDir, { recursive: true });

  const outputFile = path.join(backupDir, `${env.db.database}-${timestamp()}.sql`);
  const args = [
    '--host', env.db.host,
    '--port', String(env.db.port),
    '--username', env.db.user,
    '--format', 'plain',
    '--no-owner',
    '--no-privileges',
    '--file', outputFile,
    env.db.database
  ];

  const child = spawn('pg_dump', args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      PGPASSWORD: env.db.password || ''
    }
  });

  child.on('error', (err) => {
    console.error('Could not start pg_dump. Make sure PostgreSQL bin is in PATH.');
    console.error(err.message);
    process.exitCode = 1;
  });

  child.on('exit', (code) => {
    if (code === 0) {
      console.log(`Backup created: ${outputFile}`);
    } else {
      console.error(`pg_dump failed with exit code ${code}`);
      process.exitCode = code || 1;
    }
  });
}

run();
