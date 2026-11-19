// Validation rules ported from the current NaijaBites app (server.js and signup.js),
// so the same rules apply in the browser and on the server. No dependencies.
import { LIMITS } from './constants.js';

export const MESSAGES = Object.freeze({
  name: 'Enter your full name (2–80 characters).',
  email: 'Enter a valid email address.',
  password: 'Use 8+ characters including uppercase, lowercase, a number and a symbol.',
  passwordTooLong: `Use ${LIMITS.PASSWORD_MAX} characters or fewer.`,
  phone: 'Enter a valid phone number.',
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_INPUT_RE = /^[+()\d\s.-]{7,20}$/;

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return email.length > 0 && email.length <= LIMITS.EMAIL_MAX && EMAIL_RE.test(email);
}

export function normalizeName(value) {
  return String(value ?? '').trim();
}

export function isValidFullName(name) {
  const length = [...name].length; // count characters, not UTF-16 units
  return length >= LIMITS.NAME_MIN && length <= LIMITS.NAME_MAX;
}

/** Returns an error message, or null when the password is acceptable. */
export function passwordProblem(password) {
  const p = String(password ?? '');
  if (p.length < LIMITS.PASSWORD_MIN || !/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/\d/.test(p) || !/[^A-Za-z0-9]/.test(p)) {
    return MESSAGES.password;
  }
  if (p.length > LIMITS.PASSWORD_MAX) return MESSAGES.passwordTooLong;
  return null;
}

/**
 * Phone is optional. Accepts the same characters as the current sign-up form,
 * and stores Nigerian numbers in international form (+234...).
 * Returns { ok: true, value } (value is null when empty) or { ok: false, message }.
 */
export function normalizePhone(input) {
  const raw = String(input ?? '').trim();
  if (raw === '') return { ok: true, value: null };
  if (!PHONE_INPUT_RE.test(raw)) return { ok: false, message: MESSAGES.phone };
  const cleaned = raw.replace(/[\s().-]/g, '');
  if (!/^\+?\d{7,15}$/.test(cleaned)) return { ok: false, message: MESSAGES.phone };
  if (cleaned.startsWith('+234')) {
    return cleaned.length === 14 ? { ok: true, value: cleaned } : { ok: false, message: MESSAGES.phone };
  }
  if (cleaned.startsWith('234')) {
    return cleaned.length === 13 ? { ok: true, value: `+${cleaned}` } : { ok: false, message: MESSAGES.phone };
  }
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return { ok: true, value: `+234${cleaned.slice(1)}` };
  }
  return { ok: true, value: cleaned };
}
