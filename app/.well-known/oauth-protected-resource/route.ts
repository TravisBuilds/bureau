import { NextResponse } from 'next/server';

/**
 * RFC 9728 OAuth Protected Resource Metadata
 * Required by MCP spec
 */
export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bureau-krustbuild.vercel.app';
  
  return NextResponse.json({
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    resource_signing_alg_values_supported: [],
    resource_documentation: `${baseUrl}/docs/mcp`,
    scopes_supported: ['ingest:write', 'clone:write', 'questions:read', 'questions:write', 'team:read']
  });
}
