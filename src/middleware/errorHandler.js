function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;
  const publicMessage = err.publicMessage || (status < 500 ? err.message : 'Server error');
  const payload = {
    error: publicMessage,
    code: err.code || (status >= 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR'),
    requestId: req.requestId
  };

  if (process.env.NODE_ENV !== 'production') {
    payload.details = err.message;
  }

  console.error(`[${req.requestId || 'no-request-id'}]`, err);
  return res.status(status).json({
    ...payload
  });
}

module.exports = errorHandler;
