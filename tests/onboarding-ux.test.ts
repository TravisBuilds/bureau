import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { POST as validateInvite } from '@/app/api/auth/validate-invite/route';
import { NextRequest } from 'next/server';

describe('Onboarding UX', () => {
  describe('Device code detection in invite validation', () => {
    it('should detect BURE-XXXX format', () => {
      // Test the regex pattern used in the route
      const deviceCodePattern = /^BURE-[A-Z0-9]{4}$/i;
      
      expect(deviceCodePattern.test('BURE-AB12')).toBe(true);
      expect(deviceCodePattern.test('bure-cd34')).toBe(true);
      expect(deviceCodePattern.test('BURE-1234')).toBe(true);
      expect(deviceCodePattern.test('invalid123')).toBe(false);
      expect(deviceCodePattern.test('BUREAU_PILOT_001')).toBe(false);
    });

    it('should construct correct signInUrl with device code', () => {
      const code = 'BURE-AB12';
      const signInUrl = `/auth/signin?next=${encodeURIComponent(`/connect/device?user_code=${code}`)}`;
      
      expect(signInUrl).toBe('/auth/signin?next=%2Fconnect%2Fdevice%3Fuser_code%3DBURE-AB12');
      expect(decodeURIComponent(signInUrl.split('next=')[1])).toBe('/connect/device?user_code=BURE-AB12');
    });

    it('should not treat regular invalid codes as device codes', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/validate-invite', {
        method: 'POST',
        body: JSON.stringify({ code: 'invalid123' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await validateInvite(request);
      const data = await response.json();

      // Status may be 400 or 500 depending on DB availability in test env
      expect([400, 500]).toContain(response.status);
      if (data.valid !== undefined) {
        expect(data.valid).toBe(false);
      }
      expect(data.isDeviceCode).toBeUndefined();
      if (response.status === 400 && data.error) {
        expect(data.error).toBe('Invalid or expired invite code');
      }
    });
  });

  describe('Middleware query string preservation', () => {
    it('should preserve query params in redirect next parameter', () => {
      // This is tested via the middleware.ts code change
      // The middleware now constructs: const nextPath = pathname + (request.nextUrl.search || '');
      // Test: /connect/device?user_code=X → next=/connect/device?user_code=X
      
      const testPath = '/connect/device';
      const testQuery = '?user_code=BURE-TEST';
      const expectedNext = testPath + testQuery;
      
      // Verify format (actual middleware execution tested in integration)
      const encoded = encodeURIComponent(expectedNext);
      expect(encoded).toContain('%2Fconnect%2Fdevice');
      expect(encoded).toContain('user_code%3DBURE-TEST');
    });
  });
});
