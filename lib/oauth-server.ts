/**
 * Bureau OAuth 2.1 Authorization Server
 * Implements RFC 8414, RFC 9728, RFC 7009, RFC 8628
 * With PKCE (S256), refresh token rotation, reuse detection
 * 
 * SECURITY DEFINER functions handle secret-bearing tables.
 */

import crypto from 'crypto';
import { query, withUser } from './db';

// Token generation
export function generateToken(prefix: string): { token: string; hash: string; tokenPrefix: string } {
  const random = crypto.randomBytes(32).toString('hex'); // 64 hex chars
  const token = `${prefix}${random}`;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenPrefix = token.substring(0, 15);
  return { token, hash, tokenPrefix };
}

// Generate auth code (60s TTL)
export function generateAuthCode(): { code: string; hash: string } {
  const random = crypto.randomBytes(32).toString('hex');
  const code = `bur_code_${random}`;
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  return { code, hash };
}

// Generate device code and user code
export function generateDeviceCodes(): { 
  deviceCode: string; 
  deviceCodeHash: string; 
  userCode: string 
} {
  const deviceRandom = crypto.randomBytes(32).toString('hex');
  const deviceCode = `bur_device_${deviceRandom}`;
  const deviceCodeHash = crypto.createHash('sha256').update(deviceCode).digest('hex');
  
  // User code: BURE-XXXX (8 alphanumeric, easy to type)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1
  let userCode = 'BURE-';
  for (let i = 0; i < 4; i++) {
    userCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return { deviceCode, deviceCodeHash, userCode };
}

// Verify PKCE challenge
export function verifyPKCE(codeVerifier: string, codeChallenge: string, method: string): boolean {
  if (method !== 'S256') {
    return false; // Only S256 supported
  }
  
  const hash = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return hash === codeChallenge;
}

// Validate redirect URI (exact match, HTTPS or localhost)
export function validateRedirectUri(uri: string, allowedUris: string[]): boolean {
  if (!allowedUris.includes(uri)) {
    return false;
  }
  
  try {
    const url = new URL(uri);
    // Must be HTTPS or localhost
    if (url.protocol === 'https:') {
      return true;
    }
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Store authorization code
export async function storeAuthCode(params: {
  userId: string;
  workspaceId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
  scopes: string[];
  agentLabel: string;
  streamIds: string[];
  allowCreateStreams: boolean;
}): Promise<string> {
  const { code, hash } = generateAuthCode();
  
  await query(
    `INSERT INTO bureau.oauth_codes (
      code_hash, client_id, user_id, workspace_id, redirect_uri,
      code_challenge, code_challenge_method, resource, scopes,
      agent_label, stream_ids, allow_create_streams, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW() + INTERVAL '60 seconds')`,
    [
      hash, params.clientId, params.userId, params.workspaceId, params.redirectUri,
      params.codeChallenge, 'S256', params.resource, params.scopes,
      params.agentLabel, params.streamIds, params.allowCreateStreams
    ]
  );
  
  return code;
}

// Exchange code for tokens
export async function exchangeCode(
  code: string,
  codeVerifier: string,
  clientId: string,
  redirectUri: string,
  resource: string | null
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}> {
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  
  // Fetch and consume code
  const codeRows = await query<{
    user_id: string;
    workspace_id: string;
    client_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    resource: string | null;
    scopes: string[];
    agent_label: string;
    stream_ids: string[];
    allow_create_streams: boolean;
    expires_at: Date;
    consumed_at: Date | null;
  }>(
    `SELECT * FROM bureau.oauth_codes WHERE code_hash = $1`,
    [codeHash]
  );
  
  if (codeRows.length === 0) {
    throw new Error('INVALID_CODE');
  }
  
  const codeData = codeRows[0];
  
  // Validate code not expired/consumed
  if (codeData.consumed_at) {
    throw new Error('CODE_ALREADY_USED');
  }
  if (new Date(codeData.expires_at) < new Date()) {
    throw new Error('CODE_EXPIRED');
  }
  
  // Validate client_id, redirect_uri, resource match
  if (codeData.client_id !== clientId) {
    throw new Error('CLIENT_MISMATCH');
  }
  if (codeData.redirect_uri !== redirectUri) {
    throw new Error('REDIRECT_URI_MISMATCH');
  }
  if (codeData.resource !== resource) {
    throw new Error('RESOURCE_MISMATCH');
  }
  
  // Verify PKCE
  if (!verifyPKCE(codeVerifier, codeData.code_challenge, codeData.code_challenge_method)) {
    throw new Error('INVALID_PKCE');
  }
  
  // Mark code as consumed
  await query(
    `UPDATE bureau.oauth_codes SET consumed_at = NOW() WHERE code_hash = $1`,
    [codeHash]
  );
  
  // Create or get grant
  const grantRows = await query<{ id: string }>(
    `INSERT INTO bureau.oauth_grants (workspace_id, user_id, client_id, vendor, scopes, resource)
     VALUES ($1, $2, $3, (SELECT vendor FROM bureau.oauth_clients WHERE client_id = $3), $4, $5)
     ON CONFLICT (workspace_id, user_id, client_id) 
     DO UPDATE SET last_seen_at = NOW(), status = 'active'
     RETURNING id`,
    [codeData.workspace_id, codeData.user_id, clientId, codeData.scopes, resource]
  );
  
  const grantId = grantRows[0].id;
  
  // Create agent link
  const agentLinkRows = await query<{ id: string }>(
    `INSERT INTO bureau.agent_links (
      workspace_id, grant_id, agent_label, stream_ids, allow_create_streams, scopes
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (grant_id, agent_label)
    DO UPDATE SET stream_ids = $4, allow_create_streams = $5, status = 'active', last_used_at = NOW()
    RETURNING id`,
    [codeData.workspace_id, grantId, codeData.agent_label, codeData.stream_ids, codeData.allow_create_streams, codeData.scopes]
  );
  
  const agentLinkId = agentLinkRows[0].id;
  
  // Create hidden ingest_token for FK
  const { token: hiddenToken, hash: hiddenHash, tokenPrefix: hiddenPrefix } = generateToken('bureau_hidden_');
  await query(
    `INSERT INTO bureau.ingest_tokens (
      workspace_id, name, token_hash, token_prefix, kind, agent_link_id
    ) VALUES ($1, $2, $3, $4, 'agent_link', $5)
    ON CONFLICT DO NOTHING`,
    [codeData.workspace_id, `Agent Link: ${codeData.agent_label}`, hiddenHash, hiddenPrefix, agentLinkId]
  );
  
  // Mint tokens
  const { token: accessToken, hash: accessHash, tokenPrefix: accessPrefix } = generateToken('bureau_at_');
  const { token: refreshToken, hash: refreshHash, tokenPrefix: refreshPrefix } = generateToken('bureau_rt_');
  const familyId = crypto.randomUUID();
  
  await query(
    `SELECT bureau.mint_oauth_tokens($1, $2, $3, $4, $5, $6)`,
    [grantId, accessHash, accessPrefix, refreshHash, refreshPrefix, familyId]
  );
  
  return {
    accessToken,
    refreshToken,
    expiresIn: 3600, // 1 hour
    tokenType: 'Bearer'
  };
}

// Refresh token exchange
export async function refreshAccessToken(
  refreshToken: string
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}> {
  const oldHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const { token: newRefreshToken, hash: newHash, tokenPrefix: newPrefix } = generateToken('bureau_rt_');
  
  try {
    // Rotate via SECURITY DEFINER function (handles reuse detection)
    const rotateRows = await query<{
      grant_id: string;
      family_id: string;
      workspace_id: string;
      user_id: string;
    }>(
      `SELECT * FROM bureau.rotate_refresh_token($1, $2, $3)`,
      [oldHash, newHash, newPrefix]
    );
    
    if (rotateRows.length === 0) {
      throw new Error('INVALID_REFRESH_TOKEN');
    }
    
    const { grant_id, family_id, workspace_id, user_id } = rotateRows[0];
    
    // Mint new access token
    const { token: accessToken, hash: accessHash, tokenPrefix: accessPrefix } = generateToken('bureau_at_');
    
    await query(
      `INSERT INTO bureau.oauth_tokens (token_hash, token_prefix, kind, grant_id, expires_at)
       VALUES ($1, $2, 'access', $3, NOW() + INTERVAL '1 hour')`,
      [accessHash, accessPrefix, grant_id]
    );
    
    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600,
      tokenType: 'Bearer'
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Rethrow known errors
    if (msg.includes('INVALID_REFRESH_TOKEN') || msg.includes('TOKEN_REVOKED') || 
        msg.includes('TOKEN_EXPIRED') || msg.includes('GRANT_REVOKED') ||
        msg.includes('REFRESH_TOKEN_REUSED')) {
      throw error;
    }
    throw new Error('REFRESH_FAILED');
  }
}

// Revoke token (RFC 7009)
export async function revokeToken(token: string, tokenTypeHint?: string): Promise<void> {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  
  // Revoke the token (works for both access and refresh)
  await query(
    `UPDATE bureau.oauth_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
    [hash]
  );
  
  // If it's a refresh token, revoke the entire family
  if (tokenTypeHint === 'refresh_token' || token.startsWith('bureau_rt_')) {
    await query(
      `UPDATE bureau.oauth_tokens t1
       SET revoked_at = NOW()
       FROM bureau.oauth_tokens t2
       WHERE t1.family_id = t2.family_id
         AND t2.token_hash = $1
         AND t1.revoked_at IS NULL`,
      [hash]
    );
  }
}

// Device code flow: start
export async function startDeviceFlow(
  clientName: string,
  scopes: string[]
): Promise<{
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}> {
  const { deviceCode, deviceCodeHash, userCode } = generateDeviceCodes();
  
  await query(
    `INSERT INTO bureau.oauth_device_codes (
      device_code_hash, user_code, client_name, scopes, interval, expires_at
    ) VALUES ($1, $2, $3, $4, 5, NOW() + INTERVAL '10 minutes')`,
    [deviceCodeHash, userCode, clientName, scopes]
  );
  
  const baseUri = process.env.NEXT_PUBLIC_APP_URL || 'https://bureau-krustbuild.vercel.app';
  
  return {
    deviceCode,
    userCode,
    verificationUri: `${baseUri}/connect/device`,
    verificationUriComplete: `${baseUri}/connect/device?user_code=${userCode}`,
    expiresIn: 600, // 10 minutes
    interval: 5 // Poll every 5 seconds
  };
}

// Device code flow: poll
export async function pollDeviceCode(
  deviceCode: string
): Promise<{
  status: 'pending' | 'approved' | 'denied';
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType?: string;
}> {
  const deviceCodeHash = crypto.createHash('sha256').update(deviceCode).digest('hex');
  
  const deviceRows = await query<{
    status: string;
    user_id: string | null;
    workspace_id: string | null;
    scopes: string[];
    agent_label: string | null;
    stream_ids: string[] | null;
    allow_create_streams: boolean;
    expires_at: Date;
  }>(
    `SELECT * FROM bureau.oauth_device_codes WHERE device_code_hash = $1`,
    [deviceCodeHash]
  );
  
  if (deviceRows.length === 0 || new Date(deviceRows[0].expires_at) < new Date()) {
    throw new Error('EXPIRED_TOKEN');
  }
  
  const device = deviceRows[0];
  
  if (device.status === 'denied') {
    throw new Error('ACCESS_DENIED');
  }
  
  if (device.status === 'pending') {
    return { status: 'pending' };
  }
  
  if (device.status === 'consumed') {
    throw new Error('ALREADY_CONSUMED');
  }
  
  // Status is approved, mint tokens
  if (!device.user_id || !device.workspace_id || !device.agent_label) {
    throw new Error('INVALID_DEVICE_STATE');
  }
  
  // Mark as consumed
  await query(
    `UPDATE bureau.oauth_device_codes SET status = 'consumed' WHERE device_code_hash = $1`,
    [deviceCodeHash]
  );
  
  // Create grant for device flow (use 'script' client)
  const grantRows = await query<{ id: string }>(
    `INSERT INTO bureau.oauth_grants (workspace_id, user_id, client_id, vendor, scopes)
     VALUES ($1, $2, 'script-device', 'script', $3)
     ON CONFLICT (workspace_id, user_id, client_id)
     DO UPDATE SET last_seen_at = NOW(), status = 'active'
     RETURNING id`,
    [device.workspace_id, device.user_id, device.scopes]
  );
  
  const grantId = grantRows[0].id;
  
  // Create agent link
  await query(
    `INSERT INTO bureau.agent_links (
      workspace_id, grant_id, agent_label, stream_ids, allow_create_streams, scopes
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (grant_id, agent_label)
    DO UPDATE SET stream_ids = $4, allow_create_streams = $5, status = 'active'`,
    [device.workspace_id, grantId, device.agent_label, device.stream_ids || [], device.allow_create_streams, device.scopes]
  );
  
  // Mint tokens
  const { token: accessToken, hash: accessHash, tokenPrefix: accessPrefix } = generateToken('bureau_at_');
  const { token: refreshToken, hash: refreshHash, tokenPrefix: refreshPrefix } = generateToken('bureau_rt_');
  const familyId = crypto.randomUUID();
  
  await query(
    `SELECT bureau.mint_oauth_tokens($1, $2, $3, $4, $5, $6)`,
    [grantId, accessHash, accessPrefix, refreshHash, refreshPrefix, familyId]
  );
  
  return {
    status: 'approved',
    accessToken,
    refreshToken,
    expiresIn: 3600,
    tokenType: 'Bearer'
  };
}
