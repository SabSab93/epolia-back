import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);

// Checked when the e-mail is unknown, so the login takes the same time
// whether the account exists or not. No password can match it.
const dummySalt = '0'.repeat(32);
export const dummyPasswordHash = `${dummySalt}:${'0'.repeat(128)}`;

export const minPasswordLength = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)) as Buffer;

  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  const [salt, storedHash] = passwordHash.split(':');
  // Hash even when the stored value is malformed, so the response time
  // never tells such an account apart.
  const hash = (await scrypt(password, salt || dummySalt, 64)) as Buffer;

  if (!salt || !storedHash) {
    return false;
  }

  const storedHashBuffer = Buffer.from(storedHash, 'hex');

  if (hash.length !== storedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(hash, storedHashBuffer);
}
