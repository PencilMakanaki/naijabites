import crypto from 'node:crypto';

const SIGNATURE_TOLERANCE_SECONDS = 300;
const SIGNATURE_LENGTH = 128;

/**
 * Compares two hexadecimal HMAC signatures safely.
 */
function signaturesMatch(expected, received) {
  if (
    typeof received !== 'string' ||
    !/^[0-9a-f]{128}$/i.test(received)
  ) {
    return false;
  }

  const receivedBuffer = Buffer.from(received, 'hex');

  return (
    expected.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expected, receivedBuffer)
  );
}

/**
 * Verifies Paystack's newer Paystack-Signature header.
 *
 * Format:
 * t=timestamp,v1=whk_keyId:signature
 *
 * The signing secret must be the complete whsec_ value.
 */
function verifyModernSignature(rawBody, header, webhookSecret) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof header !== 'string' ||
    !webhookSecret
  ) {
    return false;
  }

  const parts = header.split(',');
  let timestamp = null;
  const signatures = [];

  for (const part of parts) {
    const separator = part.indexOf('=');

    if (separator === -1) continue;

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (name === 't') {
      if (timestamp !== null || !/^\d+$/.test(value)) {
        return false;
      }

      timestamp = Number(value);
    }

    if (name === 'v1') {
      const colon = value.indexOf(':');

      if (colon === -1) continue;

      const keyId = value.slice(0, colon);
      const signature = value.slice(colon + 1);

      if (
        /^whk_[A-Za-z0-9_-]+$/.test(keyId) &&
        /^[0-9a-f]{128}$/i.test(signature)
      ) {
        signatures.push(signature);
      }
    }
  }

  if (
    !Number.isSafeInteger(timestamp) ||
    signatures.length === 0
  ) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = crypto
    .createHmac('sha512', webhookSecret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();

  return signatures.some((signature) =>
    signaturesMatch(expected, signature)
  );
}

/**
 * Verifies Paystack's legacy x-paystack-signature header.
 *
 * This signature uses the Paystack API secret key and
 * signs the raw request body without a timestamp.
 */
function verifyLegacySignature(rawBody, header, secretKey) {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof header !== 'string' ||
    !secretKey ||
    !/^[0-9a-f]{128}$/i.test(header)
  ) {
    return false;
  }

  const expected = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody)
    .digest();

  return signaturesMatch(expected, header);
}

/**
 * Public verification function used by the webhook route.
 *
 * Modern signature takes priority. We do not fall back to
 * the legacy signature if a modern signature is present but invalid.
 */
export function verifyPaystackWebhook({
  rawBody,
  headers,
  webhookSecret,
  secretKey,
}) {
  if (!Buffer.isBuffer(rawBody) || !headers) {
    return false;
  }

  const modernHeader = headers['paystack-signature'];

  if (modernHeader !== undefined) {
    return verifyModernSignature(
      rawBody,
      modernHeader,
      webhookSecret
    );
  }

  const legacyHeader = headers['x-paystack-signature'];

  if (legacyHeader !== undefined) {
    return verifyLegacySignature(
      rawBody,
      legacyHeader,
      secretKey
    );
  }

  return false;
}