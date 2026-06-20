const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return fullPath;
  });
}

test('runtime code does not mutate database schema', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const files = walk(srcDir).filter(file => /\.(js|jsx|mjs)$/.test(file));
  const forbidden = /\b(CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX|ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS)\b/i;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      content,
      forbidden,
      `Schema changes must live in migrations, not runtime code: ${path.relative(srcDir, file)}`
    );
  }
});
