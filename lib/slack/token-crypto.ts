/**
 * Slack bot token at rest: AES-256-GCM via the existing BUREAU_ACTIVITY_ENCRYPTION_KEY, with an
 * AAD of "bureau-slack:<workspaceId>:<teamId>", so a ciphertext only decrypts for the workspace and
 * Slack team it was issued to. Fails closed (throws) when the key is missing or malformed.
 * Never log, return or persist the plaintext.
 */
import { encryptScoped, decryptScoped } from '../activity-crypto';

export function encryptBotToken(token: string, workspaceId: string, teamId: string): string {
  if (!/^xoxb-[A-Za-z0-9-]+$/.test(token)) throw new Error('Not a Slack bot token');
  return encryptScoped('slack', token, [workspaceId, teamId]);
}

export function decryptBotToken(envelope: string, workspaceId: string, teamId: string): string {
  return decryptScoped('slack', envelope, [workspaceId, teamId]);
}
