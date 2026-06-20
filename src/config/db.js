const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool(env.db);

module.exports = pool;
