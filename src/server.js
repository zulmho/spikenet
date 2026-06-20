const http = require('http');
const { Server } = require('socket.io');
const env = require('./config/env');
const createApp = require('./app');
const registerSocketHandlers = require('./sockets');
const { assertBootReady } = require('./services/bootCheck');

const app = createApp();
const server = http.createServer(app);
const io = new Server(server);

app.set('io', io);
registerSocketHandlers(io);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${env.port} is already in use. Close the old server or set PORT=3002.`);
    process.exit(1);
  }

  console.error(err);
  process.exit(1);
});

async function start() {
  await assertBootReady();
  server.listen(env.port, () => {
    console.log(`Backend started on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error('Backend boot failed:', err.message);
  process.exit(1);
});

module.exports = { app, server, io };
