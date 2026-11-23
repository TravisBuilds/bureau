/**
 * Client ID Metadata Documents (CIMD) support
 * Per MCP 2025-11-25 and 2026-07-28 auth spec + OAuth Client ID Metadata Document draft
 * 
 * The client_id HTTPS URL itself IS the metadata document.
 * Fetch it directly (not /.well-known/oauth-client).
 * 
 * SSRF protections:
 * - HTTPS only
 * - DNS resolution with ALL addresses checked; reject if ANY are private/loopback/link-local
 * - CIDR-based IP validation (ipaddr.js): 0.0.0.0/8, 100.64/10, 127/8, 169.254/16, 10/8, 
 *   172.16/12, 192.168/16, 198.18/15, 224/4+, ::, ::1, fc00::/7, fe80::/10, IPv4-mapped IPv6
 * - Custom DNS lookup to connect only to vetted IPs (prevents DNS rebinding)
 * - No redirects
 * - Stream response body, abort if >1MB
 * - Timeout covering entire request including body read
 * - JSON content-type required
 * - Cache with TTL (5 minutes)
 * - Vendor verification: only known hosts marked verified (env-configurable)
 */

import { lookup } from 'node:dns/promises';
import { Agent, request } from 'undici';
import { Address4, Address6 } from 'ipaddr.js';

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

// Simple in-memory cache for CIMD documents
const cimdCache = new Map<string, { doc: CIMDDocument; verified: boolean; expiresAt: number }>();

/**
 * Check if IP address is private/loopback/link-local using CIDR ranges
 * Covers: 0.0.0.0/8, 100.64/10, 127/8, 169.254/16, 10/8, 172.16/12, 192.168/16,
 * 198.18/15, 224/4+, ::, ::1, fc00::/7, fe80::/10, IPv4-mapped IPv6
 */
function isPrivateIP(ipString: string): boolean {
  try {
    // Parse IP address
    let addr: Address4 | Address6;
    
    try {
      addr = Address6.parse(ipString);
      
      // Check IPv4-mapped IPv6 (::ffff:a.b.c.d)
      if (addr.isIPv4MappedAddress()) {
        const ipv4 = addr.to4();
        return isPrivateIPv4(ipv4.address);
      }
      
      // IPv6 special addresses
      if (addr.range() === 'unspecified') return true; // ::
      if (addr.range() === 'loopback') return true; // ::1
      if (addr.range() === 'uniqueLocal') return true; // fc00::/7
      if (addr.range() === 'linkLocal') return true; // fe80::/10
      if (addr.range() === 'multicast') return true;
      
      return false;
    } catch {
      // Not IPv6, try IPv4
      addr = Address4.parse(ipString);
      return isPrivateIPv4(addr.address);
    }
  } catch {
    // Invalid IP
    return true; // Reject unparseable IPs
  }
}

function isPrivateIPv4(ipString: string): boolean {
  try {
    const addr = Address4.parse(ipString);
    const octets = addr.octets;
    
    // 0.0.0.0/8
    if (octets[0] === 0) return true;
    
    // 10.0.0.0/8
    if (octets[0] === 10) return true;
    
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return true;
    
    // 127.0.0.0/8 (loopback)
    if (octets[0] === 127) return true;
    
    // 169.254.0.0/16 (link-local)
    if (octets[0] === 169 && octets[1] === 254) return true;
    
    // 172.16.0.0/12
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
    
    // 192.168.0.0/16
    if (octets[0] === 192 && octets[1] === 168) return true;
    
    // 198.18.0.0/15 (benchmark testing)
    if (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19)) return true;
    
    // 224.0.0.0/4 (multicast)
    if (octets[0] >= 224) return true;
    
    return false;
  } catch {
    return true;
  }
}

/**
 * Check if hostname matches a known vendor domain
 * Requires exact match or proper dot-suffix match (not substring)
 * 
 * Known vendors (env-configurable via BUREAU_OAUTH_VERIFIED_HOSTS):
 * - openai.com (ChatGPT)
 * - cursor.com (Cursor)
 */
function isKnownVendorHost(hostname: string): boolean {
  const defaultVendors = [
    'openai.com',    // ChatGPT CIMD clients
    'cursor.com'     // Cursor CIMD clients
  ];
  
  const envVendors = process.env.BUREAU_OAUTH_VERIFIED_HOSTS
    ? process.env.BUREAU_OAUTH_VERIFIED_HOSTS.split(',').map(h => h.trim()).filter(Boolean)
    : [];
  
  const knownHosts = [...defaultVendors, ...envVendors];
  
  for (const known of knownHosts) {
    // Exact match
    if (hostname === known) return true;
    
    // Dot-suffix match (subdomain.openai.com matches openai.com)
    if (hostname.endsWith('.' + known)) return true;
  }
  
  return false;
}

/**
 * Fetch and validate a CIMD document from client_id URL
 * Returns { doc, verified } or null if invalid
 * 
 * Full SSRF protections with DNS resolution and IP validation.
 */
export async function fetchCIMD(clientId: string): Promise<{ doc: CIMDDocument; verified: boolean } | null> {
  try {
    // Client ID must be a valid HTTPS URL for CIMD
    const url = new URL(clientId);
    if (url.protocol !== 'https:') {
      return null; // CIMD requires HTTPS client_id
    }
    
    // Check cache first
    const cached = cimdCache.get(clientId);
    if (cached && cached.expiresAt > Date.now()) {
      return { doc: cached.doc, verified: cached.verified };
    }
    
    const hostname = url.hostname.toLowerCase();
    
    // Block bracket-wrapped IPs like [::1]
    if (hostname.startsWith('[') && hostname.endsWith(']')) {
      const ip = hostname.slice(1, -1);
      if (isPrivateIP(ip)) {
        console.warn(`CIMD: Blocked private IP in brackets: ${hostname}`);
        return null;
      }
    }
    
    // DNS resolution: get ALL addresses
    let addresses: Array<{ address: string; family: 4 | 6 }>;
    try {
      const results = await lookup(hostname, { all: true });
      addresses = results.map(r => ({ address: r.address, family: r.family as 4 | 6 }));
    } catch (err) {
      console.warn(`CIMD: DNS resolution failed for ${hostname}:`, err);
      return null;
    }
    
    if (addresses.length === 0) {
      console.warn(`CIMD: No addresses resolved for ${hostname}`);
      return null;
    }
    
    // Check if ANY resolved address is private (reject if so)
    for (const addr of addresses) {
      if (isPrivateIP(addr.address)) {
        console.warn(`CIMD: Blocked private/reserved IP ${addr.address} for ${hostname}`);
        return null;
      }
    }
    
    // Use first vetted address
    const vettedAddress = addresses[0].address;
    
    // Create custom agent with vetted IP (prevents DNS rebinding)
    const agent = new Agent({
      connect: {
        lookup: (_hostname, _options, callback) => {
          // Always return the vetted IP, ignore any DNS changes
          callback(null, vettedAddress, addresses[0].family);
        }
      }
    });
    
    // Fetch with timeout covering entire request including body
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    try {
      const response = await request(clientId, {
        method: 'GET',
        dispatcher: agent,
        signal: controller.signal,
        maxRedirections: 0, // No redirects
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Bureau/1.0 OAuth CIMD'
        }
      });
      
      // Check status
      if (response.statusCode !== 200) {
        console.warn(`CIMD: HTTP ${response.statusCode} for ${clientId}`);
        return null;
      }
      
      // Validate content-type
      const contentType = response.headers['content-type'];
      if (!contentType || !contentType.toString().includes('application/json')) {
        console.warn(`CIMD: Invalid content-type: ${contentType}`);
        return null;
      }
      
      // Stream body with size cap (abort if >1MB)
      const chunks: Buffer[] = [];
      let totalSize = 0;
      const maxSize = 1024 * 1024; // 1MB
      
      for await (const chunk of response.body) {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          controller.abort();
          console.warn(`CIMD: Response body too large (>${maxSize} bytes)`);
          return null;
        }
        chunks.push(Buffer.from(chunk));
      }
      
      clearTimeout(timeout);
      
      const text = Buffer.concat(chunks).toString('utf-8');
      const doc = JSON.parse(text) as CIMDDocument;
      
      // Validate required fields
      if (!doc.client_id || !doc.redirect_uris || doc.redirect_uris.length === 0) {
        console.warn(`CIMD: Missing required fields`);
        return null;
      }
      
      // Validate client_id matches the fetched URL exactly
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
      
      // Check if this is a known vendor (for verified status)
      const verified = isKnownVendorHost(hostname);
      
      // Cache for 5 minutes
      cimdCache.set(clientId, {
        doc,
        verified,
        expiresAt: Date.now() + 5 * 60 * 1000
      });
      
      return { doc, verified };
      
    } finally {
      clearTimeout(timeout);
    }
    
  } catch (error) {
    // Network error, timeout, or invalid JSON
    if ((error as any).name !== 'AbortError') {
      console.warn(`CIMD fetch error for ${clientId}:`, error);
    }
    return null;
  }
}

/**
 * Resolve client by ID: try CIMD first, fall back to DB lookup
 * Returns client info with verified status
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
      // Infer vendor from hostname
      const url = new URL(clientId);
      let vendor = 'other';
      if (url.hostname.includes('openai.com') || url.hostname.includes('chatgpt.com')) {
        vendor = 'openai';
      } else if (url.hostname.includes('cursor.com')) {
        vendor = 'cursor';
      }
      
      return {
        client_id: cimd.doc.client_id,
        client_name: cimd.doc.client_name || 'Unknown Client',
        client_uri: cimd.doc.client_uri,
        redirect_uris: cimd.doc.redirect_uris,
        verified: cimd.verified, // Only true if on known vendor list
        vendor,
        registration: 'cimd'
      };
    }
  }
  
  // Fall back to DB lookup (static or DCR clients)
  return null; // Caller should query DB if CIMD fails
}
