/**
 * Bureau - Agent Provider Tests
 * Test dispatch lifecycle, auth security, and MockProvider
 */

import { describe, it, expect } from 'vitest';
import { MockProvider } from './providers/MockProvider';
import { encryptCredential, decryptCredential, sanitizeForClient } from './credential-storage';

describe('MockProvider', () => {
  const provider = new MockProvider();
  
  describe('Connection', () => {
    it('should connect with mock credentials', async () => {
      const creds = await provider.connect({ apiKey: 'test-key' });
      
      expect(creds.providerId).toBe('mock-provider');
      expect(creds.type).toBe('mock');
      expect(creds.encrypted).toBeDefined();
      expect(creds.createdAt).toBeDefined();
    });
  });
  
  describe('Agent Listing', () => {
    it('should list available mock agents', async () => {
      const creds = await provider.connect({ apiKey: 'test-key' });
      const agents = await provider.listAgents(creds);
      
      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0].id).toBeDefined();
      expect(agents[0].displayName).toBeDefined();
      expect(agents[0].providerType).toBe('mock');
      expect(agents[0].capabilities).toBeInstanceOf(Array);
    });
  });
  
  describe('Task Dispatch Lifecycle', () => {
    it('should dispatch a task and return taskId', async () => {
      const result = await provider.dispatchTask(
        'mock-agent-1',
        'Test task brief',
        'Test context'
      );
      
      expect(result.taskId).toBeDefined();
      expect(result.agentId).toBe('mock-agent-1');
      expect(result.status).toBe('queued');
    });
    
    it('should transition task from queued to running to completed', async () => {
      const result = await provider.dispatchTask(
        'mock-agent-1',
        'Test task',
        'Test context'
      );
      
      // Initially queued
      let status = await provider.getTaskStatus(result.taskId);
      expect(status.status).toBe('queued');
      
      // Wait for running
      await new Promise(resolve => setTimeout(resolve, 600));
      status = await provider.getTaskStatus(result.taskId);
      expect(status.status).toBe('running');
      expect(status.startedAt).toBeDefined();
      
      // Wait for completed
      await new Promise(resolve => setTimeout(resolve, 2500));
      status = await provider.getTaskStatus(result.taskId);
      expect(status.status).toBe('completed');
      expect(status.completedAt).toBeDefined();
      expect(status.result).toBeDefined();
      expect(status.result).toContain('MOCK RESULT');
    });
    
    it('should include brief and context in task result', async () => {
      const brief = 'Fix return tracking';
      const context = 'Priority 1, blocks retention measurement';
      
      const result = await provider.dispatchTask('mock-agent-1', brief, context);
      
      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 3100));
      
      const task = await provider.getTaskStatus(result.taskId);
      expect(task.result).toContain(brief);
      expect(task.context).toBe(context);
    });
    
    it('should stream task updates', async () => {
      const result = await provider.dispatchTask('mock-agent-1', 'Test', 'Context');
      
      const updates: string[] = [];
      for await (const update of provider.streamTask!(result.taskId)) {
        updates.push(update);
      }
      
      expect(updates.length).toBeGreaterThan(0);
      expect(updates.some(u => u.includes('queued'))).toBe(true);
      expect(updates.some(u => u.includes('completed'))).toBe(true);
    });
  });
  
  describe('Chat', () => {
    it('should send message and get response', async () => {
      const result = await provider.sendMessage(
        'mock-agent-1',
        'Hello agent',
        'conv-1'
      );
      
      expect(result.messageId).toBeDefined();
      expect(result.response).toBeDefined();
      expect(result.response).toContain('MOCK RESPONSE');
      expect(result.response).toContain('Hello agent');
    });
    
    it('should maintain conversation context', async () => {
      const convId = `conv-${Date.now()}`;
      
      const msg1 = await provider.sendMessage('mock-agent-1', 'First message', convId);
      const msg2 = await provider.sendMessage('mock-agent-1', 'Second message', convId);
      
      expect(msg1.messageId).not.toBe(msg2.messageId);
    });
  });
});

describe('Credential Security', () => {
  describe('Encryption', () => {
    it('should encrypt and decrypt credentials', () => {
      const plaintext = 'sk-test-api-key-12345';
      const { encrypted, iv } = encryptCredential(plaintext);
      
      expect(encrypted).toBeDefined();
      expect(iv).toBeDefined();
      expect(encrypted).not.toBe(plaintext);
      
      const decrypted = decryptCredential(encrypted, iv);
      expect(decrypted).toBe(plaintext);
    });
    
    it('should produce different ciphertext for same input', () => {
      const plaintext = 'test-key';
      const result1 = encryptCredential(plaintext);
      const result2 = encryptCredential(plaintext);
      
      // Different IVs should produce different ciphertext
      expect(result1.encrypted).not.toBe(result2.encrypted);
      expect(result1.iv).not.toBe(result2.iv);
    });
  });
  
  describe('Client Sanitization', () => {
    it('should remove sensitive fields from objects', () => {
      const data = {
        id: 'test-id',
        name: 'Test',
        encrypted: 'secret-data',
        iv: 'secret-iv',
        apiKey: 'sk-123',
        secret: 'password',
        token: 'bearer-token',
      };
      
      const sanitized = sanitizeForClient(data);
      
      expect(sanitized.id).toBe('test-id');
      expect(sanitized.name).toBe('Test');
      expect(sanitized.encrypted).toBeUndefined();
      expect(sanitized.iv).toBeUndefined();
      expect(sanitized.apiKey).toBeUndefined();
      expect(sanitized.secret).toBeUndefined();
      expect(sanitized.token).toBeUndefined();
    });
    
    it('should not expose credentials in API responses', () => {
      const mockResponse = {
        providerId: 'test-provider',
        encrypted: 'should-be-removed',
        agents: ['agent-1'],
      };
      
      const safe = sanitizeForClient(mockResponse);
      expect('encrypted' in safe).toBe(false);
    });
  });
});
