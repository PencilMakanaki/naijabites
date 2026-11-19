import { randomBytes } from 'node:crypto';

// ULID: 26 characters, sortable by creation time, safe to show in URLs.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

export function ulid(now = Date.now()) {
  let time = BigInt(now);
  let timePart = '';
  for (let i = 0; i < 10; i += 1) {
    timePart = ALPHABET[Number(time % 32n)] + timePart;
    time /= 32n;
  }
  let random = BigInt(`0x${randomBytes(10).toString('hex')}`);
  let randomPart = '';
  for (let i = 0; i < 16; i += 1) {
    randomPart = ALPHABET[Number(random % 32n)] + randomPart;
    random /= 32n;
  }
  return timePart + randomPart;
}
