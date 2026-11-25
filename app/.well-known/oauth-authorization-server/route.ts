import { NextResponse } from 'next/server';
import { ALLOWED_SCOPES } from '@/lib/oauth-scopes';

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
    scopes_supported: ALLOWED_SCOPES,
    // CIMD is not advertised: CIMD clients are not stored in bureau.oauth_clients, so the
    // oauth_codes/oauth_grants client_id foreign keys would reject them. Needs a migration first.
    authorization_response_iss_parameter_supported: true
  });
}
