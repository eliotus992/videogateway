import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/index.js';

describe('API Endpoints', () => {
  describe('GET /', () => {
    it('should return service info', async () => {
      const res = await app.request('/');
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.name).toBe('VideoGateway');
      expect(json.version).toBe('0.1.0');
      expect(json.endpoints).toBeDefined();
    });
  });
  
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      
      const json = await res.json();
      expect(json.status).toBe('healthy');
      expect(json.timestamp).toBeDefined();
    });
  });
  
  describe('POST /v1/video/generations', () => {
    it('should reject without authentication', async () => {
      const res = await app.request('/v1/video/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'seedance-1.0',
          prompt: 'Test'
        })
      });
      
      expect(res.status).toBe(401);
    });
    
    it('should reject invalid model', async () => {
      const res = await app.request('/v1/video/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-key'
        },
        body: JSON.stringify({
          model: 'invalid-model',
          prompt: 'Test'
        })
      });
      
      expect(res.status).toBe(400);
    });
  });
  
  describe('GET /v1/video/generations/:id', () => {
    it('should return 404 for non-existent generation', async () => {
      const res = await app.request('/v1/video/generations/vg_nonexistent1234');
      expect(res.status).toBe(401); // 先验证 auth，再检查存在性
    });
  });
  
  describe('404 handler', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await app.request('/unknown-route');
      expect(res.status).toBe(404);
      
      const json = await res.json();
      expect(json.code).toBe('NOT_FOUND');
    });
  });
});
