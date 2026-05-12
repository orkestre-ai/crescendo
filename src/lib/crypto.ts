import crypto from 'crypto';
import { rootLogger } from '@/lib/logging';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const log = rootLogger.child({ module: 'crypto' });

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    log.error('ENCRYPTION_KEY environment variable is not set');
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  if (key.length !== 64) {
    log.error({ keyLength: key.length }, 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypts a string using AES-256-GCM
 * Returns format: iv:authTag:ciphertext (all base64 encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypts a string encrypted with encrypt()
 * Expects format: iv:authTag:ciphertext (all base64 encoded)
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');

  if (parts.length !== 3) {
    log.error('Invalid encrypted data format — expected iv:authTag:ciphertext');
    throw new Error('Invalid encrypted data format');
  }

  const [ivBase64, authTagBase64, ciphertext] = parts;
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    log.error({ err }, 'Decryption failed — possible key mismatch or corrupted data');
    throw err;
  }
}

/**
 * Masks a string, showing only last 4 characters
 * Returns format: ****abcd
 */
export function maskApiKey(apiKey: string | null | undefined): string | null {
  if (!apiKey || apiKey.length < 4) {
    return null;
  }
  const lastFour = apiKey.slice(-4);
  return `****${lastFour}`;
}
