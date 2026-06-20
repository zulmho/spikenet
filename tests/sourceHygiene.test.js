const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const roots = ['README.md', 'src', 'public', 'docs', 'scripts', 'migrations'];
const ignoredFiles = new Set([
  path.join('public', 'js', 'spikenet-react-modules.js')
]);

function walk(target) {
  const fullPath = path.join(__dirname, '..', target);
  if (!fs.existsSync(fullPath)) return [];
  const stat = fs.statSync(fullPath);
  if (stat.isFile()) return [fullPath];

  return fs.readdirSync(fullPath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules') return [];
    return walk(path.join(target, entry.name));
  });
}

test('source files do not contain mojibake Russian text', () => {
  const files = roots
    .flatMap(walk)
    .filter(file => /\.(md|js|jsx|mjs|css|html|sql)$/.test(file))
    .filter(file => !ignoredFiles.has(path.relative(path.join(__dirname, '..'), file)));

  const mojibake = /(?:Рџ|РЎ|Р |СЃ|С‚|С‹|СЊ|С‰|Рё|Р°|Рѕ|Рµ|Рґ|Рї|Р»|РЅ|Рј)/;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      content,
      mojibake,
      `Looks like broken UTF-8 text in ${path.relative(path.join(__dirname, '..'), file)}`
    );
  }
});
