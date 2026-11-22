/**
 * Bureau - Credential Storage
 * Server-side only - never exposed to client
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const CREDENTIALS_DIR = path.join(process.cwd(), 'data', 'credentials');
const ENCRYPTION_KEY = process.env.BUREAU_ENCRYPTION_KEY || 'dev-key-change-in-production-32b'; // 32 bytes for AES-256

// Ensure directory exists
if (!fs.existsSync(CREDENTIALS_DIR)) {
  fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
}

interface StoredCredential {
  projectName: string;
  providerId: string;
  providerType: string;
  encrypted: string;
  iv: string; // Initialization vector for decryption
  createdAt: string;
  expiresAt?: string;
}

/**
 * Encrypt credentials using AES-256-CBC
 * NEVER send encrypted credentials to client
 */
export function encryptCredential(plaintext: string): { encrypted: string; iv: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32)),
    iv
  );
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return {
    encrypted,
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypt credentials (server-side only)
 */
export function decryptCredential(encrypted: string, iv: string): string {
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32)),
    Buffer.from(iv, 'hex')
  );
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Store credentials for a project-provider connection
 * Server-side only
 */
export function storeCredentials(
  projectName: string,
  providerId: string,
  providerType: string,
  apiKey: string,
  expiresAt?: string
): void {
  const { encrypted, iv } = encryptCredential(apiKey);
  
  const credential: StoredCredential = {
    projectName,
    providerId,
    providerType,
    encrypted,
    iv,
    createdAt: new Date().toISOString(),
    expiresAt,
  };
  
  const filename = `${projectName.toLowerCase().replace(/\s+/g, '-')}-${providerId}.json`;
  const filepath = path.join(CREDENTIALS_DIR, filename);
  
  fs.writeFileSync(filepath, JSON.stringify(credential, null, 2));
}

/**
 * Retrieve and decrypt credentials
 * Server-side only - never expose to client
 */
export function getCredentials(
  projectName: string,
  providerId: string
): string | null {
  const filename = `${projectName.toLowerCase().replace(/\s+/g, '-')}-${providerId}.json`;
  const filepath = path.join(CREDENTIALS_DIR, filename);
  
  if (!fs.existsSync(filepath)) {
    return null;
  }
  
  const stored: StoredCredential = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  
  // Check expiration
  if (stored.expiresAt && new Date(stored.expiresAt) < new Date()) {
    return null;
  }
  
  return decryptCredential(stored.encrypted, stored.iv);
}

/**
 * List all credentials for a project (without decrypting)
 * Returns only metadata, never the actual credentials
 */
export function listProjectCredentials(projectName: string): Array<{
  providerId: string;
  providerType: string;
  createdAt: string;
  expiresAt?: string;
  isExpired: boolean;
}> {
  const prefix = `${projectName.toLowerCase().replace(/\s+/g, '-')}-`;
  const files = fs.existsSync(CREDENTIALS_DIR)
    ? fs.readdirSync(CREDENTIALS_DIR).filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    : [];
  
  return files.map(file => {
    const stored: StoredCredential = JSON.parse(
      fs.readFileSync(path.join(CREDENTIALS_DIR, file), 'utf-8')
    );
    return {
      providerId: stored.providerId,
      providerType: stored.providerType,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      isExpired: stored.expiresAt ? new Date(stored.expiresAt) < new Date() : false,
    };
  });
}

/**
 * Delete credentials
 */
export function deleteCredentials(projectName: string, providerId: string): void {
  const filename = `${projectName.toLowerCase().replace(/\s+/g, '-')}-${providerId}.json`;
  const filepath = path.join(CREDENTIALS_DIR, filename);
  
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }
}

/**
 * SECURITY: Validate that encrypted credentials are never sent to client
 * This function should be called in API routes to strip sensitive data
 */
export function sanitizeForClient<T extends Record<string, any>>(data: T): T {
  const sanitized = { ...data };
  
  // Remove any fields that might contain credentials
  const sensitiveFields = ['encrypted', 'iv', 'apiKey', 'secret', 'token', 'password'];
  sensitiveFields.forEach(field => {
    if (field in sanitized) {
      delete sanitized[field];
    }
  });
  
  return sanitized;
}
