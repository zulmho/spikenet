const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

function localAssets(attribute) {
  const pattern = new RegExp(`${attribute}="(/[^"#?]+)`, 'g');
  return [...indexHtml.matchAll(pattern)]
    .map(match => match[1])
    .filter(asset => !asset.startsWith('/socket.io/'));
}

test('index.html references existing local frontend assets', () => {
  const assets = [
    ...localAssets('href'),
    ...localAssets('src')
  ].filter(asset => /\.(css|js|png|jpg|jpeg|webp|svg|ico)$/.test(asset));

  for (const asset of assets) {
    const filePath = path.join(publicDir, asset.slice(1));
    assert.ok(fs.existsSync(filePath), `Missing frontend asset: ${asset}`);
  }
});

test('legacy root style.css is not used anymore', () => {
  assert.doesNotMatch(indexHtml, /href="\/style\.css"/);
  assert.equal(fs.existsSync(path.join(publicDir, 'style.css')), false);
});

test('retired home tracker and news css is not shipped', () => {
  const css = ['ui.css', 'design-system.css', 'mobile.css', 'market.css', 'chat.css']
    .map(file => fs.readFileSync(path.join(publicDir, 'css', file), 'utf8'))
    .join('\n');

  for (const retiredSelector of [
    'spike-news',
    'price-data',
    'sales-box',
    'form-box',
    'games-grid',
    'spike-picks',
    'spike-onboarding',
    'chart-container'
  ]) {
    assert.doesNotMatch(css, new RegExp(retiredSelector), `Retired selector still shipped: ${retiredSelector}`);
  }
});
