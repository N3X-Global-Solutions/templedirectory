export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

/** Consistent response envelope: { success, data, error, meta? }. */
export function sendData(res, data, meta = null, status = 200) {
  const body = { success: true, data, error: null };
  res.status(status).json(meta ? { ...body, meta } : body);
}

export function sendError(res, status, message, details = null) {
  const body = { success: false, data: null, error: message };
  res.status(status).json(details ? { ...body, details } : body);
}

export function createErrorHandler(logger) {
  // Express identifies error middleware by its four-argument signature.
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    if (err instanceof HttpError) {
      sendError(res, err.status, err.message, err.details);
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      sendError(res, 400, 'The request body is not valid JSON');
      return;
    }
    if (err?.type === 'entity.too.large') {
      sendError(res, 413, 'The request is too large');
      return;
    }
    logger.error(`[error] ${req.method} ${req.originalUrl}`, err);
    sendError(res, 500, 'Something went wrong. Please try again.');
  };
}

export function parseId(value) {
  const text = String(value ?? '');
  if (!/^\d{1,12}$/.test(text)) return null;
  const id = Number(text);
  return id > 0 ? id : null;
}

export function requireId(value) {
  const id = parseId(value);
  if (!id) throw new HttpError(404, 'Record not found');
  return id;
}
