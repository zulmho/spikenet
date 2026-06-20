const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const pool = require('../src/config/db');
const createApp = require('../src/app');

const runIntegration = process.env.SPIKENET_INTEGRATION_TESTS === '1';

function fakeIo() {
  return {
    emit() {},
    to() {
      return this;
    }
  };
}

async function startTestServer() {
  const app = createApp(fakeIo());
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

async function jsonFetch(baseUrl, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.headers || {})
    },
    body: options.body && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body
  });
  const data = await res.json().catch(() => ({}));
  return { res, data, cookie: res.headers.get('set-cookie') };
}

async function registerAndLogin(baseUrl, username) {
  await jsonFetch(baseUrl, '/api/auth/register', {
    method: 'POST',
    body: { username, password: 'test12345' }
  });
  const login = await jsonFetch(baseUrl, '/api/auth/login', {
    method: 'POST',
    body: { username, password: 'test12345' }
  });
  assert.equal(login.res.status, 200);
  return {
    id: login.data.user.id,
    username,
    cookie: login.cookie.split(';')[0]
  };
}

test('integration: market deal, dispute moderation and direct chat controls', { skip: !runIntegration }, async () => {
  const server = await startTestServer();
  const suffix = Date.now().toString(36);
  const createdUsers = [];

  try {
    const admin = await registerAndLogin(server.baseUrl, `it_admin_${suffix}`);
    const buyer = await registerAndLogin(server.baseUrl, `it_buyer_${suffix}`);
    const seller = await registerAndLogin(server.baseUrl, `it_seller_${suffix}`);
    createdUsers.push(admin.id, buyer.id, seller.id);

    await pool.query(
      `INSERT INTO user_roles (user_id, role, granted_by)
       VALUES ($1, 'market_moderator', $1)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [admin.id]
    );
    await pool.query(
      `INSERT INTO market_moderators (user_id, granted_by)
       VALUES ($1, $1)
       ON CONFLICT (user_id) DO NOTHING`,
      [admin.id]
    );

    const listing = await jsonFetch(server.baseUrl, '/api/market/listings', {
      method: 'POST',
      cookie: seller.cookie,
      body: {
        title: `Integration lot ${suffix}`,
        description: 'integration test lot',
        category: 'key',
        price: 100
      }
    });
    assert.equal(listing.res.status, 201);

    const buy = await jsonFetch(server.baseUrl, `/api/market/listings/${listing.data.id}/buy`, {
      method: 'POST',
      cookie: buyer.cookie
    });
    assert.equal(buy.res.status, 200);

    const dispute = await jsonFetch(server.baseUrl, `/api/market/trades/${buy.data.id}/dispute`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: {
        reason: 'seller did not deliver the integration lot',
        evidence: [{ kind: 'text', content: 'chat transcript: no delivery' }]
      }
    });
    assert.equal(dispute.res.status, 201);

    const forbiddenResolve = await jsonFetch(server.baseUrl, `/api/market/disputes/${dispute.data.id}/resolve`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: { resolution: 'refund_buyer', moderator_note: 'buyer cannot moderate' }
    });
    assert.equal(forbiddenResolve.res.status, 403);

    const resolved = await jsonFetch(server.baseUrl, `/api/market/disputes/${dispute.data.id}/resolve`, {
      method: 'POST',
      cookie: admin.cookie,
      body: { resolution: 'refund_buyer', moderator_note: 'integration refund' }
    });
    assert.equal(resolved.res.status, 200);
    assert.equal(resolved.data.status, 'resolved');

    const chat = await jsonFetch(server.baseUrl, '/api/dm/chat', {
      method: 'POST',
      cookie: buyer.cookie,
      body: { friendId: seller.id }
    });
    assert.equal(chat.res.status, 200);

    const message = await pool.query(
      `INSERT INTO direct_messages (chat_id, sender_id, content)
       VALUES ($1, $2, 'integration hello')
       RETURNING id`,
      [chat.data.chatId, buyer.id]
    );

    const pinned = await jsonFetch(server.baseUrl, `/api/dm/chat/${chat.data.chatId}/pin`, {
      method: 'POST',
      cookie: buyer.cookie,
      body: { messageId: message.rows[0].id }
    });
    assert.equal(pinned.res.status, 200);

    const reaction = await jsonFetch(server.baseUrl, `/api/dm/message/${message.rows[0].id}/react`, {
      method: 'POST',
      cookie: seller.cookie,
      body: { reaction: 'ok' }
    });
    assert.equal(reaction.res.status, 200);
    assert.deepEqual(reaction.data.reactions.ok, [String(seller.id)]);
  } finally {
    if (createdUsers.length) {
      await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [createdUsers]);
    }
    await server.close();
    await pool.end();
  }
});
