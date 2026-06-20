const test = require('node:test');
const assert = require('node:assert/strict');
const { validateStrongPassword } = require('../src/services/passwordPolicy');

test('password policy rejects weak passwords', () => {
  assert.equal(validateStrongPassword('1234567890', 'zulamho').ok, false);
  assert.equal(validateStrongPassword('zulamho123!A', 'zulamho').ok, false);
  assert.equal(validateStrongPassword('NoSpecial123', 'zulamho').ok, false);
  assert.equal(validateStrongPassword('No digit!', 'zulamho').ok, false);
});

test('password policy accepts a strong password', () => {
  assert.equal(validateStrongPassword('SpikeTrade42!', 'zulamho').ok, true);
});
