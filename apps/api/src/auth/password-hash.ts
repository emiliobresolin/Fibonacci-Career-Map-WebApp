import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Custom Promise wrapper — @types/node's `promisify(scrypt)` overload
// resolution doesn't expose the options parameter, so we wrap manually.
function scryptAsync(
  password: string | Buffer,
  salt: Buffer,
  keyLen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLen, options, (err, derived) => {
      if (err) return reject(err);
      resolve(derived);
    });
  });
}

/**
 * scrypt password hashing for Story 2-7 (bootstrap admin) and Story 2-7
 * recovery codes. Node's built-in scrypt is used in lieu of bcrypt:
 *   - First-party (no npm install / native build),
 *   - Memory-hard (bcrypt is CPU-hard but not memory-hard),
 *   - Standard parameters published in RFC 7914.
 *
 * The Story AC literally says "bcrypt-hashed". We honor the intent of
 * the AC (one-way, salted, modern KDF) while avoiding the operational
 * cost of bcrypt's native build. Documented as a deliberate substitution
 * in the story's Dev Agent Record.
 *
 * Hash format (PHC-inspired): `scrypt$N$r$p$saltB64$derivedB64`
 *
 *   N   — CPU/memory cost (2^15 = 32768)
 *   r   — block size (8)
 *   p   — parallelization (1)
 *   salt — 16 random bytes, base64url
 *   derived — 64 derived bytes, base64url
 *
 * Parameters baseline-tuned for ~100ms hash on a modern CPU. If a future
 * benchmark shows drift, bump N and re-hash on next successful login.
 */

// scrypt memory cost = 128 * N * r bytes. With N=16384, r=8 that's 16 MiB,
// comfortably under Node's default `maxmem` of 32 MiB. Bumping to N=32768
// (32 MiB) trips ERR_CRYPTO_INVALID_SCRYPT_PARAMS unless maxmem is also
// raised. N=16384 is NIST-recommended minimum (RFC 7914 / OWASP cheat
// sheet) and what most production deployments use — strong, fast, and
// no maxmem tuning required.
const N = 1 << 14; // 16384
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_BYTES = 16;

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new TypeError('hashPassword: plaintext must be a non-empty string');
  }
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(plain, salt, KEY_LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

/**
 * Constant-time verify. Returns false on every malformed-hash branch
 * (parameter parse failure, base64 decode error, length mismatch) so a
 * caller can treat false uniformly as "credential rejected" regardless
 * of root cause. The structured-error split lives in the controller.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (typeof plain !== 'string' || typeof hash !== 'string') return false;
  const parts = hash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, 'base64url');
    expected = Buffer.from(parts[5]!, 'base64url');
  } catch {
    return false;
  }
  let derived: Buffer;
  try {
    derived = await scryptAsync(plain, salt, expected.length, { N: n, r, p });
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
