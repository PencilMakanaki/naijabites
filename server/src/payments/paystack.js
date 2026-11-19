import { AppError } from '../http/errors.js';

const PAYSTACK_API = 'https://api.paystack.co';
const REQUEST_TIMEOUT_MS = 15000;

function paymentError(message, status = 502) {
  return new AppError(status, 'payment_gateway_error', message);
}

export function createPaystackClient({ secretKey }) {
  if (
    !secretKey ||
    (!secretKey.startsWith('sk_test_') &&
      !secretKey.startsWith('sk_live_'))
  ) {
    throw new AppError(
      503,
      'payment_configuration_error',
      'Paystack is not configured correctly.',
    );
  }

  async function request(path, { method = 'POST', body } = {}) {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(`${PAYSTACK_API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });

      let result;

      try {
        result = await response.json();
      } catch {
        throw paymentError('Paystack returned an invalid response.');
      }

      if (!response.ok || result.status !== true) {
        throw paymentError(
          typeof result.message === 'string'
            ? result.message
            : 'Paystack could not process the payment request.',
        );
      }

      return result.data;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw paymentError(
          'Paystack request timed out. Please try again.',
        );
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw paymentError(
        'Unable to connect to Paystack. Please try again.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    initialize({
      email,
      amountKobo,
      reference,
      callbackUrl,
      metadata,
    }) {
      return request('/transaction/initialize', {
        method: 'POST',
        body: {
          email,
          amount: amountKobo,
          currency: 'NGN',
          reference,
          callback_url: callbackUrl,
          metadata,
        },
      });
    },

    verify(reference) {
      return request(
        `/transaction/verify/${encodeURIComponent(reference)}`,
        { method: 'GET' },
      );
    },

    refund({
      transaction,
      amountKobo,
      merchantNote,
      reference,
    }) {
      return request('/refund', {
        method: 'POST',
        body: {
          transaction,
          amount: amountKobo,
          currency: 'NGN',
          merchant_note: merchantNote,
          reference,
        },
      });
    },
  };
}