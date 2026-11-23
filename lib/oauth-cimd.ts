/**
 * Client ID Metadata Documents (CIMD) support
 * Per MCP 2025-11-25 and 2026-07-28 auth spec
 * 
 * Clients can self-describe by publishing a metadata document at:
 * https://<client_id>/.well-known/oauth-client
 */

interface CIMDDocument {
  client_id: string;
  client_name?: string;
  client_uri?: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
  contacts?: string[];
  logo_uri?: string;
  policy_uri?: string;
  tos_uri?: string;
}

/**
 * Fetch and validate a CIMD document from client_id
 * Returns null if document is unreachable or invalid
 */
export async function fetchCIMD(clientId: string): Promise<CIMDDocument | null> {
  try {
    // Client ID must be a valid HTTPS URL for CIMD
    const url = new URL(clientId);
    if (url.protocol !== 'https:') {
      return null; // CIMD requires HTTPS client_id
    }
    
    // Construct metadata URL
    const metadataUrl = `${url.origin}/.well-known/oauth-client`;
    
    // Fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    const response = await fetch(metadataUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Bureau/1.0 OAuth Client'
      }
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      return null;
    }
    
    const doc = await response.json() as CIMDDocument;
    
    // Validate required fields
    if (!doc.client_id || !doc.redirect_uris || doc.redirect_uris.length === 0) {
      return null;
    }
    
    // Validate client_id matches
    if (doc.client_id !== clientId) {
      console.warn(`CIMD client_id mismatch: requested ${clientId}, got ${doc.client_id}`);
      return null;
    }
    
    // Validate all redirect_uris are HTTPS or localhost
    for (const uri of doc.redirect_uris) {
      try {
        const redirectUrl = new URL(uri);
        if (redirectUrl.protocol !== 'https:' && 
            redirectUrl.hostname !== 'localhost' && 
            redirectUrl.hostname !== '127.0.0.1') {
          console.warn(`CIMD invalid redirect_uri: ${uri}`);
          return null;
        }
      } catch {
        console.warn(`CIMD malformed redirect_uri: ${uri}`);
        return null;
      }
    }
    
    return doc;
    
  } catch (error) {
    // Network error, timeout, or invalid JSON
    return null;
  }
}

/**
 * Resolve client by ID: try CIMD first, fall back to DB lookup
 * Returns client info or null if not found/invalid
 */
export async function resolveClient(clientId: string): Promise<{
  client_id: string;
  client_name: string;
  client_uri?: string;
  redirect_uris: string[];
  verified: boolean;
  vendor?: string;
  registration: 'static' | 'cimd' | 'dcr';
} | null> {
  // Try CIMD first if client_id looks like a URL
  if (clientId.startsWith('https://')) {
    const cimd = await fetchCIMD(clientId);
    if (cimd) {
      // Infer vendor from redirect URIs
      let vendor = 'other';
      const firstRedirect = new URL(cimd.redirect_uris[0]);
      if (firstRedirect.hostname.includes('openai.com') || firstRedirect.hostname.includes('chatgpt.com')) {
        vendor = 'openai';
      } else if (firstRedirect.hostname.includes('cursor.com')) {
        vendor = 'cursor';
      }
      
      return {
        client_id: cimd.client_id,
        client_name: cimd.client_name || 'Unknown Client',
        client_uri: cimd.client_uri,
        redirect_uris: cimd.redirect_uris,
        verified: true, // CIMD clients are self-verified via DNS/TLS
        vendor,
        registration: 'cimd'
      };
    }
  }
  
  // Fall back to DB lookup (static or DCR clients)
  return null; // Caller should query DB if CIMD fails
}
