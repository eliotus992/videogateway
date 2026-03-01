import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { errorHandler } from '../src/middleware/error.js';
import type { ProviderAdapter, VideoGenerationRequest } from '../src/types/index.js';

// Mock provider for testing
class MockProvider implements ProviderAdapter {
  readonly id = 'mock' as const;
  readonly name = 'Mock Provider';
  
  validateRequest(request: VideoGenerationRequest): boolean {
    return request.model === 'mock-1.0';
  }
  
  estimateCost(request: VideoGenerationRequest): number {
    return (request.duration || 5) * 0.1;
  }
  
  estimateTime(request: VideoGenerationRequest): number {
    return 10;
  }
  
  async submit(request: VideoGenerationRequest) {
    return {
      provider_job_id: `mock_${Date.now()}`,
      estimated_seconds: 10
    };
  }
  
  async checkStatus(provider_job_id: string) {
    return {
      status: 'completed' as const,
      video_url: 'https://example.com/video.mp4'
    };
  }
  
  async cancel(provider_job_id: string) {
    return true;
  }
}

describe('Provider Adapter', () => {
  const provider = new MockProvider();
  
  it('should validate supported models', () => {
    expect(provider.validateRequest({ model: 'mock-1.0', prompt: 'test' })).toBe(true);
    expect(provider.validateRequest({ model: 'seedance-1.0', prompt: 'test' })).toBe(false);
  });
  
  it('should estimate cost correctly', () => {
    expect(provider.estimateCost({ model: 'mock-1.0', prompt: 'test', duration: 5 })).toBe(0.5);
    expect(provider.estimateCost({ model: 'mock-1.0', prompt: 'test', duration: 10 })).toBe(1.0);
  });
  
  it('should submit and return job id', async () => {
    const result = await provider.submit({ model: 'mock-1.0', prompt: 'test' });
    expect(result.provider_job_id).toMatch(/^mock_\d+$/);
    expect(result.estimated_seconds).toBe(10);
  });
  
  it('should check status and return completed', async () => {
    const status = await provider.checkStatus('mock_123');
    expect(status.status).toBe('completed');
    expect(status.video_url).toBeDefined();
  });
});
