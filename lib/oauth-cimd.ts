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
 * - ipaddr.js .range() check: treat anything non-'unicast' as blocked
 * - Custom DNS lookup to connect only to vetted IPs (prevents DNS rebinding)
 * - No redirects (undici request doesn't follow redirects by default)
 * - Stream response body, abort if >1MB
 * - Timeout covering entire request including body read
 * - JSON content-type required
 * - Cache with TTL (5 minutes)
 * - Vendor verification: only known hosts marked verified (env-configurable)
 */

import { lookup as dnsLookup } from 'node:dns/promises';
import { Agent, request, Dispatcher } from 'undici';
import * as ipaddr from 'ipaddr.js';

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
 * Check if IP address is private/loopback/link-local
 * Uses ipaddr.js .range(): anything non-'unicast' is blocked
 * (private, loopback, linkLocal, carrierGradeNat, uniqueLocal, unspecified, multicast, reserved, etc.)
 */
function isPrivateIP(ipString: string): boolean {
  try {
    // Strip brackets if present (e.g., [::1] -> ::1)
    const ip = ipString.startsWith('[') && ipString.endsWith(']')
      ? ipString.slice(1, -1)
      : ipString;
    
    // ipaddr.process() unwraps IPv4-mapped IPv6
    const addr = ipaddr.process(ip);
    
    // .range() returns: 'unicast', 'private', 'loopback', 'linkLocal', 
    // 'carrierGradeNat', 'uniqueLocal', 'unspecified', 'multicast', 
    // 'reserved', 'benchmarking', etc.
    // Block anything that's not 'unicast'
    const range = addr.range();
    return range !== 'unicast';
  } catch {
    // Invalid IP -> block
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
export function isKnownVendorHost(hostname: string): boolean {
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

export interface FetchCIMDOptions {
  lookup?: typeof dnsLookup;
  dispatcher?: Dispatcher;
  allowHttp?: boolean; // Test-only flag
}

/**
 * Fetch and validate a CIMD document from client_id URL
 * Returns { doc, verified } or null if invalid
 * 
 * Full SSRF protections with DNS resolution and IP validation.
 */
export async function fetchCIMD(
  clientId: string,
  options: FetchCIMDOptions = {}
): Promise<{ doc: CIMDDocument; verified: boolean } | null> {
  const { lookup = dnsLookup, dispatcher, allowHttp = false } = options;
  
  try {
    // Client ID must be a valid HTTPS URL for CIMD (or http in tests)
    const url = new URL(clientId);
    if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
      return null;
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
    
    // Create custom agent with vetted addresses (prevents DNS rebinding)
    // Node's net.connect calls lookup with options.all === true (autoSelectFamily)
    // and expects array form: callback(null, [{address, family}])
    // Otherwise single form: callback(null, address, family)
    const vettedAddresses = addresses; // Keep all vetted addresses
    const customAgent = dispatcher || new Agent({
      connect: {
        lookup(_hostname, options, callback) {
          // Always return vetted addresses, ignore any DNS changes
          if (options?.all) {
            // Array form for autoSelectFamily
            callback(null, vettedAddresses);
          } else {
            // Single form (use first vetted address)
            callback(null, vettedAddresses[0].address, vettedAddresses[0].family);
          }
        }
      }
    });
    
    // Fetch with timeout covering entire request including body
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    
    try {
      const response = await request(clientId, {
        method: 'GET',
        dispatcher: customAgent,
        signal: controller.signal,
        // Note: undici request doesn't follow redirects by default
        // maxRedirections removed (not supported in undici v7+)
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Bureau/1.0 OAuth CIMD'
        }
      });
      
      // Check status (reject redirects)
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
      // Infer vendor from hostname using exact/dot-suffix match
      const url = new URL(clientId);
      const hostname = url.hostname.toLowerCase();
      
      let vendor = 'other';
      if (isKnownVendorHost(hostname)) {
        // Determine which vendor
        if (hostname === 'openai.com' || hostname.endsWith('.openai.com') ||
            hostname === 'chatgpt.com' || hostname.endsWith('.chatgpt.com')) {
          vendor = 'openai';
        } else if (hostname === 'cursor.com' || hostname.endsWith('.cursor.com')) {
          vendor = 'cursor';
        }
      }
      
      return {
        client_id: cimd.doc.client_id,
        client_name: cimd.doc.client_name || 'Unknown Client',
        client_uri: cimd.doc.client_uri,
        redirect_uris: cimd.doc.redirect_uris,
        verified: cimd.verified,
        vendor,
        registration: 'cimd'
      };
    }
  }
  
  // Fall back to DB lookup (static or DCR clients)
  return null; // Caller should query DB if CIMD fails
}
