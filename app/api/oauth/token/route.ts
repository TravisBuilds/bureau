import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, refreshAccessToken, pollDeviceCode } from '@/lib/oauth-server';

/**
 * POST /api/oauth/token - Token endpoint
 * Handles:
 * - authorization_code grant (with PKCE)
 * - refresh_token grant (with rotation)
 * - urn:ietf:params:oauth:grant-type:device_code (device flow)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.formData();
    const grantType = body.get('grant_type')?.toString();
    
    if (!grantType) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'Missing grant_type' },
        { status: 400 }
      );
    }
    
    // Authorization code grant
    if (grantType === 'authorization_code') {
      const code = body.get('code')?.toString();
      const codeVerifier = body.get('code_verifier')?.toString();
      const clientId = body.get('client_id')?.toString();
      const redirectUri = body.get('redirect_uri')?.toString();
      const resource = body.get('resource')?.toString() || null;
      
      if (!code || !codeVerifier || !clientId || !redirectUri) {
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'Missing required parameters' },
          { status: 400 }
        );
      }
      
      try {
        const tokens = await exchangeCode(code, codeVerifier, clientId, redirectUri, resource);
        
        return NextResponse.json({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_type: tokens.tokenType,
          expires_in: tokens.expiresIn
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        
        if (msg === 'INVALID_CODE' || msg === 'CODE_EXPIRED') {
          return NextResponse.json(
            { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' },
            { status: 400 }
          );
        }
        if (msg === 'CODE_ALREADY_USED') {
          return NextResponse.json(
            { error: 'invalid_grant', error_description: 'Authorization code already used' },
            { status: 400 }
          );
        }
        if (msg === 'INVALID_PKCE') {
          return NextResponse.json(
            { error: 'invalid_grant', error_description: 'PKCE validation failed' },
            { status: 400 }
          );
        }
        
        throw error;
      }
    }
    
    // Refresh token grant
    if (grantType === 'refresh_token') {
      const refreshToken = body.get('refresh_token')?.toString();
      
      if (!refreshToken) {
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'Missing refresh_token' },
          { status: 400 }
        );
      }
      
      try {
        const tokens = await refreshAccessToken(refreshToken);
        
        return NextResponse.json({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          token_type: tokens.tokenType,
          expires_in: tokens.expiresIn
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        
        if (msg.includes('INVALID_REFRESH_TOKEN') || msg.includes('TOKEN_EXPIRED') || msg.includes('TOKEN_REVOKED')) {
          return NextResponse.json(
            { error: 'invalid_grant', error_description: 'Invalid or expired refresh token' },
            { status: 400 }
          );
        }
        if (msg.includes('REFRESH_TOKEN_REUSED')) {
          return NextResponse.json(
            { error: 'invalid_grant', error_description: 'Refresh token reuse detected - all tokens revoked' },
            { status: 400 }
          );
        }
        
        throw error;
      }
    }
    
    // Device code grant
    if (grantType === 'urn:ietf:params:oauth:grant-type:device_code') {
      const deviceCode = body.get('device_code')?.toString();
      
      if (!deviceCode) {
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'Missing device_code' },
          { status: 400 }
        );
      }
      
      try {
        const result = await pollDeviceCode(deviceCode);
        
        if (result.status === 'pending') {
          return NextResponse.json(
            { error: 'authorization_pending' },
            { status: 400 }
          );
        }
        
        if (result.status === 'approved') {
          return NextResponse.json({
            access_token: result.accessToken,
            refresh_token: result.refreshToken,
            token_type: result.tokenType,
            expires_in: result.expiresIn
          });
        }
        
        return NextResponse.json(
          { error: 'access_denied' },
          { status: 400 }
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        
        if (msg === 'EXPIRED_TOKEN') {
          return NextResponse.json(
            { error: 'expired_token' },
            { status: 400 }
          );
        }
        if (msg === 'ACCESS_DENIED') {
          return NextResponse.json(
            { error: 'access_denied' },
            { status: 400 }
          );
        }
        
        throw error;
      }
    }
    
    return NextResponse.json(
      { error: 'unsupported_grant_type' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('OAuth token error:', error);
    return NextResponse.json(
      { error: 'server_error', error_description: 'Token request failed' },
      { status: 500 }
    );
  }
}
