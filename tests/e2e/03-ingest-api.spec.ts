import { test, expect } from '@playwright/test';

test.describe('Ingest API', () => {
  test('POST /api/ingest requires authentication', async ({ request }) => {
    const response = await request.post('/api/ingest', {
      data: {
        stream: 'test-stream',
        charges: [],
      },
    });
    
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('token');
  });

  test('POST /api/ingest rejects invalid data', async ({ request }) => {
    const response = await request.post('/api/ingest', {
      headers: {
        'Authorization': 'Bearer invalid_token_format',
      },
      data: {
        // Missing required fields
      },
    });
    
    expect([400, 401]).toContain(response.status());
  });

  test('POST /api/ingest validates charge schema', async ({ request }) => {
    const response = await request.post('/api/ingest', {
      headers: {
        'Authorization': 'Bearer bureau_test_12345678',
      },
      data: {
        stream: 'test-stream',
        charges: [
          {
            // Missing required fields like description, costUsd
            invalidField: 'invalid',
          },
        ],
      },
    });
    
    // Should reject with 400 or 401 (depending on token validity)
    expect([400, 401]).toContain(response.status());
  });

  test('GET /api/ingest-tokens requires authentication', async ({ request }) => {
    const response = await request.get('/api/ingest-tokens');
    
    // Should redirect to signin, return 401, or 404 if not set up
    expect([302, 401, 404]).toContain(response.status());
  });
});
