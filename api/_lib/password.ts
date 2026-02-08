import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const HASH_PREFIX = 'scrypt';
const SALT_BYTES = 16;
const KEY_LENGTH = 64;
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER || '';

const withPepper = (password: string): string => `${password}${PASSWORD_PEPPER}`;

export const isHashedPassword = (value?: string): boolean =>
  typeof value === 'string' && value.startsWith(`${HASH_PREFIX}$`);

export const hashPassword = (password: string): string => {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hash = scryptSync(withPepper(password), salt, KEY_LENGTH).toString('hex');
  return `${HASH_PREFIX}$${salt}$${hash}`;
};

export const verifyPassword = (inputPassword: string, storedPassword?: string): boolean => {
  if (!storedPassword) return false;

  if (!isHashedPassword(storedPassword)) {
    return storedPassword === inputPassword;
  }

  const [, salt, storedHash] = storedPassword.split('$');
  if (!salt || !storedHash) return false;

  const derived = scryptSync(withPepper(inputPassword), salt, KEY_LENGTH).toString('hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');
  const derivedBuffer = Buffer.from(derived, 'hex');

  if (storedBuffer.length !== derivedBuffer.length) return false;
  return timingSafeEqual(storedBuffer, derivedBuffer);
};
