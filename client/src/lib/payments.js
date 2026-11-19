import { api } from './api.js';

export function createOrder({ addressId, idempotencyKey }) {
  return api.post('/me/checkout', { addressId, idempotencyKey });
}

export function initializePayment(orderId) {
  return api.post(`/me/checkout/${encodeURIComponent(orderId)}/payment`);
}

export function verifyPayment(orderId, reference) {
  return api.post(`/me/checkout/${encodeURIComponent(orderId)}/payment/verify`, { reference });
}

export function startPaystackRedirect(payment) {
  if (typeof payment?.authorizationUrl !== 'string' || !payment.authorizationUrl.startsWith('https://')) {
    throw new Error('Paystack did not provide a valid secure payment link. Please try again.');
  }
  window.location.assign(payment.authorizationUrl);
}
