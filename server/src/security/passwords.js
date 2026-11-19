import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Current format: scrypt$N$r$p$salt$hash (salt and hash in base64url).
// Legacy format from the old app: "<salt as hex text>:<64-byte scrypt as hex>" with Node's default
// scrypt settings. Legacy hashes still verify, and the caller is told to replace them.
export const CURRENT = Object.freeze({ N: 32768, r: 8, p: 3, keyLength: 64, saltBytes: 16 });
const MAX = Object.freeze({ N: 1 << 20, r: 16, p: 16 });

function derive(password, salt, keyLength, options) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

const memoryFor = (N, r) => 128 * N * r * 2;

export async function hashPassword(password) {
  const { N, r, p, keyLength, saltBytes } = CURRENT;
  const salt = randomBytes(saltBytes);
  const key = await derive(String(password), salt, keyLength, { N, r, p, maxmem: memoryFor(N, r) });
  return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Returns { valid, needsRehash }. Never throws on malformed stored values. */
export async function verifyPassword(password, stored) {
  const text = String(stored ?? '');
  try {
    if (text.startsWith('scrypt$')) return await verifyCurrent(String(password), text);
    if (text.includes(':')) return await verifyLegacy(String(password), text);
  } catch {
    // fall through to "not valid"
  }
  return { valid: false, needsRehash: false };
}

async function verifyCurrent(password, text) {
  const [, nText, rText, pText, saltText, hashText] = text.split('$');
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  const okParams =
    Number.isInteger(N) && N >= 2 && N <= MAX.N && (N & (N - 1)) === 0 &&
    Number.isInteger(r) && r >= 1 && r <= MAX.r &&
    Number.isInteger(p) && p >= 1 && p <= MAX.p;
  if (!okParams || !saltText || !hashText) return { valid: false, needsRehash: false };
  const expected = Buffer.from(hashText, 'base64url');
  const key = await derive(password, Buffer.from(saltText, 'base64url'), expected.length, { N, r, p, maxmem: memoryFor(N, r) });
  const valid = expected.length === key.length && timingSafeEqual(key, expected);
  const needsRehash = valid && (N !== CURRENT.N || r !== CURRENT.r || p !== CURRENT.p || expected.length !== CURRENT.keyLength);
  return { valid, needsRehash };
}

async function verifyLegacy(password, text) {
  const index = text.indexOf(':');
  const salt = text.slice(0, index);
  const keyHex = text.slice(index + 1);
  if (!salt || !/^[0-9a-f]+$/i.test(keyHex)) return { valid: false, needsRehash: false };
  const expected = Buffer.from(keyHex, 'hex');
  const key = await derive(password, salt, expected.length, {}); // old app used the salt as text and Node's defaults
  const valid = expected.length === key.length && timingSafeEqual(key, expected);
  return { valid, needsRehash: valid };
}

let dummyHash;
/** Spends the same time as a real check, so an unknown email cannot be told apart by timing. */
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('timing-equaliser-not-a-real-password');
  await verifyPassword(password, dummyHash);
}
