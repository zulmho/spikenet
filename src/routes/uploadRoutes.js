const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { protect } = require('../middleware/auth');
const env = require('../config/env');

const router = express.Router();

const uploadsRoot = path.join(__dirname, '..', '..', 'uploads');
const allowedTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'application/pdf',
  'text/plain',
  'application/zip'
]);

function safeExt(filename, mime) {
  const ext = path.extname(String(filename || '')).toLowerCase().replace(/[^.\w]/g, '');
  if (ext && ext.length <= 8) return ext;
  return {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'application/zip': '.zip'
  }[mime] || '.bin';
}

router.post('/file', protect, express.raw({ type: '*/*', limit: `${env.uploadMaxMb}mb` }), async (req, res) => {
  const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const originalName = decodeURIComponent(String(req.headers['x-file-name'] || 'file').slice(0, 120));

  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: 'File is empty' });
  }
  if (!allowedTypes.has(mime)) {
    return res.status(400).json({ error: 'File type is not allowed' });
  }

  await fs.promises.mkdir(uploadsRoot, { recursive: true });
  const id = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const filename = `${req.user.id}-${id}${safeExt(originalName, mime)}`;
  const target = path.join(uploadsRoot, filename);
  await fs.promises.writeFile(target, req.body);

  return res.json({
    url: `/uploads/${filename}`,
    name: originalName,
    size: req.body.length,
    type: mime
  });
});

module.exports = router;
