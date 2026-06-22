const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const limitBytes = Number(process.env.PERF_ASSET_WARN_BYTES || 180 * 1024);
const shouldFail = process.env.PERF_AUDIT_FAIL === '1';

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return [fullPath];
  });
}

function formatKb(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

const assets = walk(publicDir)
  .filter((file) => /\.(css|js|png|jpe?g|webp|gif|svg|html)$/i.test(file))
  .map((file) => ({
    file: path.relative(root, file).replaceAll(path.sep, '/'),
    size: fs.statSync(file).size
  }))
  .sort((a, b) => b.size - a.size);

console.log('SpikeNet frontend asset audit');
console.log(`Warning threshold: ${formatKb(limitBytes)}`);
console.log('');

for (const asset of assets.slice(0, 20)) {
  const mark = asset.size >= limitBytes ? '!' : ' ';
  console.log(`${mark} ${formatKb(asset.size).padStart(7)}  ${asset.file}`);
}

const oversized = assets.filter((asset) => asset.size >= limitBytes);
if (oversized.length) {
  console.log('');
  console.log('Needs optimization:');
  oversized.forEach((asset) => console.log(`- ${asset.file}: ${formatKb(asset.size)}`));
  if (shouldFail) process.exitCode = 1;
}
