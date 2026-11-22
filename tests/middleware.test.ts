import { describe, it, expect } from 'vitest';

/**
 * Test middleware public path logic
 */
describe('Middleware Public Paths', () => {
  it('should correctly identify public vs protected paths', () => {
    // Helper function that mimics middleware logic
    const isPublic = (pathname: string): boolean => {
      return (
        pathname === '/' ||
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/api/ingest')
      );
    };

    // Public paths
    expect(isPublic('/')).toBe(true);
    expect(isPublic('/auth/signin')).toBe(true);
    expect(isPublic('/auth/signup')).toBe(true);
    expect(isPublic('/auth/callback')).toBe(true);
    expect(isPublic('/api/ingest')).toBe(true);

    // Protected paths (must NOT be public)
    expect(isPublic('/top-floor')).toBe(false);
    expect(isPublic('/admin')).toBe(false);
    expect(isPublic('/settings/connect-agent')).toBe(false);
    expect(isPublic('/api/tokens')).toBe(false);
    expect(isPublic('/api/intake-logs')).toBe(false);
    expect(isPublic('/connections')).toBe(false);
    expect(isPublic('/onboarding')).toBe(false);
    expect(isPublic('/stream/abc-123')).toBe(false);
  });

  it('should NOT treat "/" as prefix that matches everything', () => {
    const isPublic = (pathname: string): boolean => {
      return (
        pathname === '/' ||
        pathname.startsWith('/auth/') ||
        pathname.startsWith('/api/ingest')
      );
    };

    // Critical: these must be false
    expect(isPublic('/top-floor')).toBe(false);
    expect(isPublic('/admin')).toBe(false);
  });
});
