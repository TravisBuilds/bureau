import { NextResponse } from 'next/server';

/**
 * RFC 8414 OAuth Authorization Server Metadata
 * Required by MCP spec
 */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bureau-krustbuild.vercel.app';
  
  return NextResponse.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    revocation_endpoint: `${baseUrl}/api/oauth/revoke`,
    device_authorization_endpoint: `${baseUrl}/api/oauth/device`,
    registration_endpoint: `${baseUrl}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
      'urn:ietf:params:oauth:grant-type:device_code'
    ],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'], // Public clients
    service_documentation: `${baseUrl}/docs/oauth`,
    scopes_supported: ['ingest:write']
  });
}
