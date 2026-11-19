// Values used by both the browser and the server. Keep the database CHECK lists in sync with these.
export const ROLES = Object.freeze(['customer', 'vendor', 'rider', 'admin']);
export const SESSION_AREAS = ROLES;
export const ADMIN_LEVELS = Object.freeze(['super', 'support', 'finance']);
export const USER_STATUSES = Object.freeze(['active', 'suspended', 'deleted']);
export const TOKEN_PURPOSES = Object.freeze(['email_verify', 'password_reset', 'email_change']);
export const CURRENCY = 'NGN';

export const LIMITS = Object.freeze({
  NAME_MIN: 2,
  NAME_MAX: 80,
  EMAIL_MAX: 254,
  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,
  PHONE_MAX: 20,
  CART_QTY_MIN: 1,
  CART_QTY_MAX: 20,
});
