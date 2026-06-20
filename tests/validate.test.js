const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBody } = require('../src/middleware/validate');

function runValidation(schema, body) {
  const req = { body };
  let statusCode = 200;
  let payload = null;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      payload = data;
      return this;
    }
  };

  validateBody(schema)(req, res, () => {
    nextCalled = true;
  });

  return { req, statusCode, payload, nextCalled };
}

test('dispute resolution validation requires a real moderator note', () => {
  const schema = {
    resolution: { type: 'enum', values: ['refund_buyer', 'pay_seller'], required: true },
    moderator_note: { type: 'string', min: 8, max: 800, required: true }
  };

  const empty = runValidation(schema, { resolution: 'refund_buyer', moderator_note: '' });
  assert.equal(empty.statusCode, 400);
  assert.equal(empty.nextCalled, false);
  assert.deepEqual(empty.payload.fields, ['moderator_note']);

  const short = runValidation(schema, { resolution: 'refund_buyer', moderator_note: 'short' });
  assert.equal(short.statusCode, 400);
  assert.equal(short.nextCalled, false);

  const valid = runValidation(schema, {
    resolution: 'pay_seller',
    moderator_note: 'Seller provided enough delivery evidence.'
  });
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.nextCalled, true);
  assert.equal(valid.req.body.moderator_note, 'Seller provided enough delivery evidence.');
});
