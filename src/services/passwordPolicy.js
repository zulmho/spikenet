const COMMON_PASSWORDS = new Set([
  'password',
  'qwerty',
  'qwerty123',
  '12345678',
  '123456789',
  '11111111',
  '00000000',
  'zulamho',
  'spikenet'
]);

function validateStrongPassword(password, username = '') {
  const value = String(password || '');
  const lowered = value.toLowerCase();
  const cleanUsername = String(username || '').trim().toLowerCase();
  const errors = [];

  if (value.length < 10) errors.push('минимум 10 символов');
  if (value.length > 128) errors.push('максимум 128 символов');
  if (/\s/.test(value)) errors.push('без пробелов');
  if (!/[a-zа-яё]/i.test(value)) errors.push('нужна буква');
  if (!/[a-zа-яё]/.test(value)) errors.push('нужна маленькая буква');
  if (!/[A-ZА-ЯЁ]/.test(value)) errors.push('нужна большая буква');
  if (!/\d/.test(value)) errors.push('нужна цифра');
  if (!/[^A-Za-zА-Яа-яЁё0-9\s]/.test(value)) errors.push('нужен спецсимвол');
  if (cleanUsername && lowered.includes(cleanUsername)) errors.push('не должен содержать ник');
  if (COMMON_PASSWORDS.has(lowered)) errors.push('слишком простой пароль');

  return {
    ok: errors.length === 0,
    errors
  };
}

function passwordPolicyText() {
  return 'Пароль: минимум 10 символов, большая и маленькая буква, цифра, спецсимвол, без пробелов и ника внутри.';
}

module.exports = {
  validateStrongPassword,
  passwordPolicyText
};
