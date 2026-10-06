import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const keyLength = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, keyLength).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, storedHash] = stored.split(':');
  if (!salt || !storedHash || !/^[a-f\d]{128}$/i.test(storedHash)) return false;

  const hash = scryptSync(password, salt, keyLength);
  return timingSafeEqual(hash, Buffer.from(storedHash, 'hex'));
}
