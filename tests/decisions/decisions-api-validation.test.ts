/**
 * Decision API Route Validation Tests
 * 
 * Tests that API routes properly validate UUID formats and return
 * appropriate status codes (404 for decision IDs, 400 for stream_id)
 * rather than 500 errors when receiving malformed UUIDs.
 */

import { describe, test, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getDecision, PATCH as patchDecision, DELETE as deleteDecision } from '@/app/api/decisions/[id]/route';
import { GET as listDecisions, POST as createDecision } from '@/app/api/decisions/route';

// Mock auth to simulate authenticated user
vi.mock('@/lib/auth-helpers', () => ({
  getAuthUser: async () => ({
    id: '00000000-0000-0000-0000-000000000001',
    email: 'test@example.com',
    workspaceId: '00000000-0000-0000-0000-000000000002'
  })
}));

// Mock withUser to avoid database calls
vi.mock('@/lib/db', () => ({
  withUser: async (userId: string, email: string, fn: Function) => {
    return fn({
      query: async () => ({ rows: [] })
    });
  }
}));

describe('Decision API UUID Validation', () => {
  test('GET /api/decisions/[id] with non-UUID returns 404', async () => {
    const request = new NextRequest('http://localhost/api/decisions/not-a-uuid');
    const params = Promise.resolve({ id: 'not-a-uuid' });
    
    const response = await getDecision(request, { params });
    const data = await response.json();
    
    expect(response.status).toBe(404);
    expect(data.error).toBe('Invalid decision ID format');
    console.log('✅ GET /api/decisions/not-a-uuid → 404');
  });
  
  test('GET /api/decisions/[id] with invalid UUID format returns 404', async () => {
    const request = new NextRequest('http://localhost/api/decisions/12345');
    const params = Promise.resolve({ id: '12345' });
    
    const response = await getDecision(request, { params });
    const data = await response.json();
    
    expect(response.status).toBe(404);
    expect(data.error).toBe('Invalid decision ID format');
    console.log('✅ GET /api/decisions/12345 → 404');
  });
  
  test('PATCH /api/decisions/[id] with non-UUID returns 404', async () => {
    const request = new NextRequest('http://localhost/api/decisions/not-a-uuid', {
      method: 'PATCH',
      body: JSON.stringify({ verdict: 'worked' })
    });
    const params = Promise.resolve({ id: 'not-a-uuid' });
    
    const response = await patchDecision(request, { params });
    const data = await response.json();
    
    expect(response.status).toBe(404);
    expect(data.error).toBe('Invalid decision ID format');
    console.log('✅ PATCH /api/decisions/not-a-uuid → 404');
  });
  
  test('DELETE /api/decisions/[id] with non-UUID returns 404', async () => {
    const request = new NextRequest('http://localhost/api/decisions/not-a-uuid', {
      method: 'DELETE'
    });
    const params = Promise.resolve({ id: 'not-a-uuid' });
    
    const response = await deleteDecision(request, { params });
    const data = await response.json();
    
    expect(response.status).toBe(404);
    expect(data.error).toBe('Invalid decision ID format');
    console.log('✅ DELETE /api/decisions/not-a-uuid → 404');
  });
  
  test('GET /api/decisions with malformed stream_id returns 400', async () => {
    const request = new NextRequest('http://localhost/api/decisions?stream_id=not-a-uuid');
    
    const response = await listDecisions(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid stream_id format');
    console.log('✅ GET /api/decisions?stream_id=not-a-uuid → 400');
  });
  
  test('GET /api/decisions with numeric stream_id returns 400', async () => {
    const request = new NextRequest('http://localhost/api/decisions?stream_id=12345');
    
    const response = await listDecisions(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid stream_id format');
    console.log('✅ GET /api/decisions?stream_id=12345 → 400');
  });
  
  test('POST /api/decisions with malformed stream_id returns 400', async () => {
    const request = new NextRequest('http://localhost/api/decisions', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test',
        action: 'Test',
        metric_name: 'test',
        review_date: '2026-12-01',
        stream_id: 'not-a-uuid'
      })
    });
    
    const response = await createDecision(request);
    const data = await response.json();
    
    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid stream_id format');
    console.log('✅ POST /api/decisions with stream_id=not-a-uuid → 400');
  });
  
  test('Valid UUID formats pass validation (404 is from DB not found, not validation)', async () => {
    // This should pass validation and reach the database layer (which returns empty due to mock)
    const validUuid = '12345678-1234-1234-1234-123456789abc';
    const request = new NextRequest(`http://localhost/api/decisions/${validUuid}`);
    const params = Promise.resolve({ id: validUuid });
    
    const response = await getDecision(request, { params });
    const data = await response.json();
    
    // The response is 404 because the DB returns no rows (mocked), but the error message
    // should be "Decision not found", not "Invalid decision ID format"
    expect(response.status).toBe(404);
    expect(data.error).toBe('Decision not found'); // This proves validation passed
    console.log(`✅ GET /api/decisions/${validUuid} → validation passed, DB returned not found`);
  });
  
  test('Edge case: UUID with uppercase passes validation', async () => {
    const validUuid = '12345678-ABCD-1234-5678-123456789ABC';
    const request = new NextRequest(`http://localhost/api/decisions/${validUuid}`);
    const params = Promise.resolve({ id: validUuid });
    
    const response = await getDecision(request, { params });
    const data = await response.json();
    
    // Should pass validation (error is "not found", not "invalid format")
    expect(response.status).toBe(404);
    expect(data.error).toBe('Decision not found');
    console.log(`✅ GET /api/decisions/${validUuid} (uppercase) → validation passed`);
  });
  
  test('Edge case: Empty string decision ID returns 404', async () => {
    const request = new NextRequest('http://localhost/api/decisions/');
    const params = Promise.resolve({ id: '' });
    
    const response = await getDecision(request, { params });
    const data = await response.json();
    
    expect(response.status).toBe(404);
    expect(data.error).toBe('Invalid decision ID format');
    console.log('✅ GET /api/decisions/ (empty) → 404');
  });
});
