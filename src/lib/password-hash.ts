import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

export const min_staff_password_length = 8;
const prefix = 'scrypt1';

export function hash_staff_password(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `${prefix}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function is_hashed_password(stored: string) {
  return stored.startsWith(`${prefix}$`);
}

export function verify_staff_password(stored: string, password: string) {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== prefix) return stored === password;
  const expected = Buffer.from(parts[2], 'hex');
  if (expected.length !== 32) return false;
  const actual = scryptSync(password, Buffer.from(parts[1], 'hex'), 32);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
