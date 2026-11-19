// Form checks that run in the browser before anything is sent.
// They use the same rules as the server.

import {
  MESSAGES,
  isValidEmail,
  isValidFullName,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  passwordProblem,
} from '@naijabites/shared/rules';

export function validateRegister({ name, email, phone, password, confirm }) {
  const errors = {};

  if (!isValidFullName(normalizeName(name))) {
    errors.name = MESSAGES.name;
  }

  if (!isValidEmail(normalizeEmail(email))) {
    errors.email = MESSAGES.email;
  }

  const phoneResult = normalizePhone(phone);

  if (!phoneResult.ok) {
    errors.phone = phoneResult.message;
  }

  const problem = passwordProblem(password);

  if (problem) {
    errors.password = problem;
  } else if (password !== confirm) {
    errors.confirm = 'Passwords do not match.';
  }

  return errors;
}

export function validateEmailOnly({ email }) {
  return isValidEmail(normalizeEmail(email))
    ? {}
    : { email: MESSAGES.email };
}

export function validateNewPassword({ password, confirm }) {
  const errors = {};
  const problem = passwordProblem(password);

  if (problem) {
    errors.password = problem;
  } else if (password !== confirm) {
    errors.confirm = 'Passwords do not match.';
  }

  return errors;
}

export function validateProfile({ name, phone }) {
  const errors = {};

  if (!isValidFullName(normalizeName(name))) {
    errors.name = MESSAGES.name;
  }

  const phoneResult = normalizePhone(phone);

  if (!phoneResult.ok) {
    errors.phone = phoneResult.message;
  }

  return errors;
}

// Converts different error types into a readable message.
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

export const hasErrors = (errors) => Object.keys(errors).length > 0;