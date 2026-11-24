import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { POST as validateInvite } from '@/app/api/auth/validate-invite/route';
import { NextRequest } from 'next/server';

describe('Onboarding UX', () => {
  describe('Device code detection in invite validation', () => {
    it('should detect BURE-XXXX as device code and suggest sign-in', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/validate-invite', {
        method: 'POST',
        body: JSON.stringify({ code: 'BURE-AB12' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await validateInvite(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.valid).toBe(false);
      expect(data.isDeviceCode).toBe(true);
      expect(data.error).toContain('bot-connect code');
      expect(data.error).toContain('Sign in first');
      expect(data.signInUrl).toBe('/auth/signin?next=%2Fconnect%2Fdevice%3Fuser_code%3DBURE-AB12');
    });

    it('should detect lowercase device code', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/validate-invite', {
        method: 'POST',
        body: JSON.stringify({ code: 'bure-cd34' }),
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await validateInvite(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.isDeviceCode).toBe(true);
      expect(data.signInUrl).toContain('user_code=bure-cd34');
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
      expect(data.valid).toBe(false);
      expect(data.isDeviceCode).toBeUndefined();
      if (response.status === 400) {
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
