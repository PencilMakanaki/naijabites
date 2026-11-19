import { AppError, notFound as makeNotFound } from './errors.js';

export function notFoundHandler(req, res, next) {
  next(makeNotFound());
}

export function errorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);
    let status = 500;
    let code = 'server_error';
    let message = 'Something went wrong. Please try again.';
    let fields;

    if (err instanceof AppError) {
      ({ status, code, message, fields } = err);
    } else if (err?.type === 'entity.parse.failed') {
      status = 400; code = 'bad_request'; message = 'The request could not be understood.';
    } else if (err?.type === 'entity.too.large') {
      status = 413; code = 'bad_request'; message = 'The request is too large.';
    } else if (Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
      status = err.status; code = 'bad_request'; message = 'The request could not be understood.';
    } else {
      logger.error({ err, requestId: req.id }, 'Unhandled error');
    }

    const error = { code, message, requestId: req.id };
    if (fields) error.fields = fields;
    res.status(status).json({ error });
  };
}
