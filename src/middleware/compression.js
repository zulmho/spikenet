const zlib = require('zlib');

const COMPRESSIBLE_TYPES = /^(text\/|application\/(?:json|javascript|xml)|image\/svg\+xml)/i;
const MIN_COMPRESS_BYTES = 1024;

function acceptsEncoding(req, encoding) {
  return String(req.headers['accept-encoding'] || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .some((item) => item === encoding || item.startsWith(`${encoding};`));
}

function shouldCompress(req, res, body) {
  if (!Buffer.isBuffer(body) || body.length < MIN_COMPRESS_BYTES) return false;
  if (res.getHeader('Content-Encoding')) return false;
  const type = String(res.getHeader('Content-Type') || '');
  return COMPRESSIBLE_TYPES.test(type);
}

function compression(req, res, next) {
  if (req.method === 'HEAD') return next();

  const originalSend = res.send.bind(res);

  res.send = function sendCompressed(body) {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    if (!shouldCompress(req, res, buffer)) return originalSend(body);

    const useBrotli = acceptsEncoding(req, 'br');
    const useGzip = !useBrotli && acceptsEncoding(req, 'gzip');
    if (!useBrotli && !useGzip) return originalSend(body);

    try {
      const encoded = useBrotli
        ? zlib.brotliCompressSync(buffer, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 }
        })
        : zlib.gzipSync(buffer, { level: 6 });

      res.setHeader('Content-Encoding', useBrotli ? 'br' : 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('Content-Length', String(encoded.length));
      return originalSend(encoded);
    } catch (_) {
      return originalSend(body);
    }
  };

  return next();
}

module.exports = compression;
