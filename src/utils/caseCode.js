const crypto = require('crypto');
const config = require('../config');

// Crockford base32 (no I, L, O, U) -> easy to read and type
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const FORMAT = /^WD[0-9A-HJKMNP-TV-Z]{16}$/;

function base32(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return out;
}

// 10 random bytes = 80 bits of entropy, from a CSPRNG
function generateCaseCode() {
  const raw = base32(crypto.randomBytes(10)); // 16 chars
  return `WD-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function normalize(code) {
  return String(code).toUpperCase().replace(/[\s-]/g, '');
}

function isValidFormat(code) {
  return FORMAT.test(normalize(code));
}

// Keyed hash (HMAC) so a leaked DB cannot be used to confirm or brute-force codes offline
function hashCaseCode(code) {
  return crypto.createHmac('sha256', config.pepper).update(normalize(code)).digest('hex');
}

module.exports = { generateCaseCode, hashCaseCode, isValidFormat };
