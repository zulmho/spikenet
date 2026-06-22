const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
};

function acceptsGzip(req) {
  return String(req.headers['accept-encoding'] || '').toLowerCase().includes('gzip');
}

function makeCacheHeader({ production, html, uploads }) {
  if (html) return 'no-cache';
  if (!production) return 'public, max-age=0';
  return uploads ? 'public, max-age=604800, immutable' : 'public, max-age=2592000, immutable';
}

function compressedStatic(rootDir, options = {}) {
  const root = path.resolve(rootDir);
  const production = options.production === true;
  const uploads = options.uploads === true;

  return (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || !acceptsGzip(req)) return next();

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.originalUrl || req.url, 'http://spikenet.local').pathname);
    } catch (_) {
      return next();
    }

    const ext = path.extname(pathname).toLowerCase();
    const contentType = TYPES[ext];
    if (!contentType) return next();

    const filePath = path.resolve(root, `.${pathname}`);
    if (!filePath.startsWith(`${root}${path.sep}`)) return next();

    fs.stat(filePath, (statErr, stat) => {
      if (statErr || !stat.isFile()) return next();

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Cache-Control', makeCacheHeader({
        production,
        html: ext === '.html',
        uploads
      }));
      res.setHeader('Last-Modified', stat.mtime.toUTCString());

      if (req.method === 'HEAD') return res.end();

      return fs.createReadStream(filePath)
        .on('error', next)
        .pipe(zlib.createGzip({ level: 6 }))
        .pipe(res);
    });
  };
}

module.exports = compressedStatic;
