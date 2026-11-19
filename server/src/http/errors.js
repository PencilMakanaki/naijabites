export class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const badRequest = (message = 'The request could not be understood.') => new AppError(400, 'bad_request', message);
export const unauthenticated = (message = 'Please sign in to continue.') => new AppError(401, 'unauthenticated', message);
export const forbidden = (message = 'You do not have access to this.') => new AppError(403, 'forbidden', message);
export const notFound = (message = 'Not found.') => new AppError(404, 'not_found', message);
export const conflict = (message, code = 'conflict') => new AppError(409, code, message);
export const validationFailed = (fields, message = 'Please check the highlighted fields.') =>
  new AppError(422, 'validation_failed', message, fields);
