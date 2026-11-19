import { validationFailed } from './errors.js';

export function fieldsFrom(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) return next(validationFailed(fieldsFrom(result.error)));
    req.body = result.data;
    next();
  };
}
