/**
 * AES-256-GCM envelope for activity log content (server-side only).
 *
 * Key: BUREAU_ACTIVITY_ENCRYPTION_KEY, 32 random bytes as base64 (44 chars) or hex (64 chars).
 * There is deliberately no fallback key: if the variable is missing or malformed, encryption
 * and decryption throw ActivityKeyError and logging is refused (fail closed).
 *
 * Format: "v1:<iv b64>:<tag b64>:<ciphertext b64>" (12-byte random IV, 16-byte auth tag).
 * Additional authenticated data binds a ciphertext to its workspace + user, so a row's content
 * can't be copied onto another person's row and still decrypt.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export const ACTIVITY_KEY_ENV = 'BUREAU_ACTIVITY_ENCRYPTION_KEY';
export const ACTIVITY_KEY_VERSION = 1;

export class ActivityKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActivityKeyError';
  }
}

function loadKey(): Buffer {
  const raw = (process.env[ACTIVITY_KEY_ENV] || '').trim();
  if (!raw) throw new ActivityKeyError(`${ACTIVITY_KEY_ENV} is not set; activity logging is disabled`);
  let key: Buffer;
  if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new ActivityKeyError(`${ACTIVITY_KEY_ENV} must be 32 bytes (base64 or hex)`);
  return key;
}

/** True when a usable key is configured (never reveals the key). */
export function activityKeyConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

const aad = (workspaceId: string, userId: string) => Buffer.from(`bureau-activity:${workspaceId}:${userId}`, 'utf8');

export function encryptActivity(plaintext: string, workspaceId: string, userId: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(workspaceId, userId));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${ACTIVITY_KEY_VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptActivity(envelope: string, workspaceId: string, userId: string): string {
  const parts = envelope.split(':');
  if (parts.length !== 4 || parts[0] !== `v${ACTIVITY_KEY_VERSION}`) throw new Error('Unsupported activity ciphertext');
  const key = loadKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
  decipher.setAAD(aad(workspaceId, userId));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
}
