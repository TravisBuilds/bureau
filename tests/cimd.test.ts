/**
 * CIMD Unit Tests
 * Tests fetchCIMD with SSRF protection edge cases
 * 
 * Run with: npx tsx tests/cimd.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { MockAgent, setGlobalDispatcher } from 'undici';
import { fetchCIMD, isKnownVendorHost } from '../lib/oauth-cimd';

// Mock lookup function
type LookupResult = Array<{ address: string; family: 4 | 6 }>;
function mockLookup(results: LookupResult) {
  return async (_hostname: string, _options: any) => results;
}

describe('CIMD SSRF Protection Tests', () => {
  
  it('should block private IPv4 (10.0.0.1)', async () => {
    const result = await fetchCIMD('http://test.local/cimd.json', {
      lookup: mockLookup([{ address: '10.0.0.1', family: 4 }]),
      allowHttp: true
    });
    assert.strictEqual(result, null, 'Should block 10.0.0.1');
  });
  
  it('should block loopback IPv4 (127.0.0.1)', async () => {
    const result = await fetchCIMD('http://test.local/cimd.json', {
      lookup: mockLookup([{ address: '127.0.0.1', family: 4 }]),
      allowHttp: true
    });
    assert.strictEqual(result, null, 'Should block 127.0.0.1');
  });
  
  it('should block carrier-grade NAT (100.64.0.1)', async () => {
    const result = await fetchCIMD('http://test.local/cimd.json', {
      lookup: mockLookup([{ address: '100.64.0.1', family: 4 }]),
      allowHttp: true
    });
    assert.strictEqual(result, null, 'Should block 100.64.0.1');
  });
  
  it('should block link-local (169.254.1.1)', async () => {
    const result = await fetchCIMD('http://test.local/cimd.json', {
      lookup: mockLookup([{ address: '169.254.1.1', family: 4 }]),
      allowHttp: true
    });
    assert.strictEqual(result, null, 'Should block 169.254.1.1');
  });
  
  it('should block private IPv4 (192.168.1.1)', async () => {
    const result = await fetchCIMD('http://test.local/cimd.json', {
      lookup: mockLookup([{ address: '192.168.1.1', family: 4 }]),
      allowHttp: true
    });
    assert.strictEqual(result, null, 'Should block 192.168.1.1');
  });
  
  it('should block IPv6 loopback (::1)', async () => {
    const result = await fetchCIMD('http://test.local/cimd.json', {
      lookup: mockLookup([{ address: '::1', family: 6 }]),
      allowHttp: true
    });
    assert.strictEqual(result, null, 'Should block ::1');
  });
  
  it('should block IPv6 unique local (fc00::1)', async () => {
    const result = await fetchCIMD('http://test.local/cimd.json', {
      lookup: mockLookup([{ address: 'fc00::1', family: 6 }]),
      allowHttp: true
    });
    assert.strictEqual(result, null, 'Should block fc00::1');
  });
  
  it('should block IPv6 link-local (fe80::1)', async () => {
    const result = await fetchCIMD('http://test.local/cimd.json', {
      lookup: mockLookup([{ address: 'fe80::1', family: 6 }]),
      allowHttp: true
    });
    assert.strictEqual(result, null, 'Should block fe80::1');
  });
  
  it('should block IPv4-mapped IPv6 (::ffff:127.0.0.1)', async () => {
    const result = await fetchCIMD('http://test.local/cimd.json', {
      lookup: mockLookup([{ address: '::ffff:127.0.0.1', family: 6 }]),
      allowHttp: true
    });
    assert.strictEqual(result, null, 'Should block ::ffff:127.0.0.1');
  });
  
  it('should block bracket-wrapped IPv6 ([::1])', async () => {
    const result = await fetchCIMD('http://[::1]/cimd.json', {
      lookup: mockLookup([{ address: '::1', family: 6 }]),
      allowHttp: true
    });
    assert.strictEqual(result, null, 'Should block [::1]');
  });
  
  it('should allow public IPv4 with valid response', async () => {
    // Use MockAgent for HTTP mocking (avoids network/DNS issues)
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    const mockPool = mockAgent.get('http://public.test');
    
    mockPool.intercept({
      path: '/cimd.json',
      method: 'GET'
    }).reply(200, JSON.stringify({
      client_id: 'http://public.test/cimd.json',
      client_name: 'Test Client',
      redirect_uris: ['https://example.com/callback']
    }), {
      headers: { 'content-type': 'application/json' }
    });
    
    const result = await fetchCIMD('http://public.test/cimd.json', {
      lookup: mockLookup([{ address: '8.8.8.8', family: 4 }]),
      dispatcher: mockAgent,
      allowHttp: true
    });
    
    assert.ok(result, 'Should allow public IP');
    assert.strictEqual(result.doc.client_name, 'Test Client');
  });
  
  it('should reject redirects (302)', async () => {
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    const mockPool = mockAgent.get('http://public.test');
    
    mockPool.intercept({
      path: '/cimd-redirect',
      method: 'GET'
    }).reply(302, '', {
      headers: { 'location': 'http://evil.com/cimd.json' }
    });
    
    const result = await fetchCIMD('http://public.test/cimd-redirect', {
      lookup: mockLookup([{ address: '8.8.8.8', family: 4 }]),
      dispatcher: mockAgent,
      allowHttp: true
    });
    
    assert.strictEqual(result, null, 'Should reject 302 redirect');
  });
  
  it('should abort oversized response (>1MB)', async () => {
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    const mockPool = mockAgent.get('http://public.test');
    
    // Create >1MB response
    const largeBody = 'x'.repeat(1024 * 1024 + 1);
    
    mockPool.intercept({
      path: '/cimd-large',
      method: 'GET'
    }).reply(200, largeBody, {
      headers: { 'content-type': 'application/json' }
    });
    
    const result = await fetchCIMD('http://public.test/cimd-large', {
      lookup: mockLookup([{ address: '8.8.8.8', family: 4 }]),
      dispatcher: mockAgent,
      allowHttp: true
    });
    
    assert.strictEqual(result, null, 'Should abort >1MB response');
  });
  
  it('should reject client_id mismatch', async () => {
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    const mockPool = mockAgent.get('http://mismatch.test');
    
    mockPool.intercept({
      path: '/cimd-mismatch.json',
      method: 'GET'
    }).reply(200, JSON.stringify({
      client_id: 'https://wrong.com/cimd.json', // Mismatch
      client_name: 'Test Client',
      redirect_uris: ['https://example.com/callback']
    }), {
      headers: { 'content-type': 'application/json' }
    });
    
    const result = await fetchCIMD('http://mismatch.test/cimd-mismatch.json', {
      lookup: mockLookup([{ address: '8.8.8.8', family: 4 }]),
      dispatcher: mockAgent,
      allowHttp: true
    });
    
    assert.strictEqual(result, null, 'Should reject client_id mismatch');
  });
  
  it('should reject non-JSON content-type', async () => {
    const mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    const mockPool = mockAgent.get('http://nonjson.test');
    
    mockPool.intercept({
      path: '/cimd-html.json',
      method: 'GET'
    }).reply(200, '<html>Not JSON</html>', {
      headers: { 'content-type': 'text/html' }
    });
    
    const result = await fetchCIMD('http://nonjson.test/cimd-html.json', {
      lookup: mockLookup([{ address: '8.8.8.8', family: 4 }]),
      dispatcher: mockAgent,
      allowHttp: true
    });
    
    assert.strictEqual(result, null, 'Should reject non-JSON');
  });
  
});

describe('Vendor Verification Tests', () => {
  
  it('should NOT verify evilchatgpt.com', () => {
    assert.strictEqual(isKnownVendorHost('evilchatgpt.com'), false);
  });
  
  it('should NOT verify chatgpt.com.evil.io', () => {
    assert.strictEqual(isKnownVendorHost('chatgpt.com.evil.io'), false);
  });
  
  it('should verify openai.com (exact)', () => {
    assert.strictEqual(isKnownVendorHost('openai.com'), true);
  });
  
  it('should verify api.openai.com (dot-suffix)', () => {
    assert.strictEqual(isKnownVendorHost('api.openai.com'), true);
  });
  
  it('should verify cursor.com (exact)', () => {
    assert.strictEqual(isKnownVendorHost('cursor.com'), true);
  });
  
  it('should verify app.cursor.com (dot-suffix)', () => {
    assert.strictEqual(isKnownVendorHost('app.cursor.com'), true);
  });
  
});

console.log('\n✅ Running CIMD tests...\n');
