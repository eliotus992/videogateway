import { describe, it, expect, beforeEach } from 'vitest';
import { VideoGenerationRequestSchema, RoutingConfigSchema } from '../src/types/schemas.js';
import { z } from 'zod';

describe('Request Validation', () => {
  describe('VideoGenerationRequestSchema', () => {
    it('should validate valid request', () => {
      const validRequest = {
        model: 'seedance-1.0',
        prompt: 'A cat dancing',
        duration: 5,
        resolution: '1080p',
        aspect_ratio: '16:9'
      };
      
      const result = VideoGenerationRequestSchema.parse(validRequest);
      expect(result.model).toBe('seedance-1.0');
      expect(result.duration).toBe(5);
    });
    
    it('should use defaults for optional fields', () => {
      const minimalRequest = {
        model: 'kling-1.6',
        prompt: 'Test prompt'
      };
      
      const result = VideoGenerationRequestSchema.parse(minimalRequest);
      expect(result.duration).toBe(5);
      expect(result.resolution).toBe('720p');
      expect(result.aspect_ratio).toBe('16:9');
    });
    
    it('should reject empty prompt', () => {
      const invalidRequest = {
        model: 'seedance-1.0',
        prompt: ''
      };
      
      expect(() => VideoGenerationRequestSchema.parse(invalidRequest))
        .toThrow(z.ZodError);
    });
    
    it('should reject invalid model', () => {
      const invalidRequest = {
        model: 'invalid-model',
        prompt: 'Test'
      };
      
      expect(() => VideoGenerationRequestSchema.parse(invalidRequest))
        .toThrow(z.ZodError);
    });
    
    it('should reject duration out of range', () => {
      const invalidRequest = {
        model: 'seedance-1.0',
        prompt: 'Test',
        duration: 100
      };
      
      expect(() => VideoGenerationRequestSchema.parse(invalidRequest))
        .toThrow(z.ZodError);
    });
    
    it('should validate callback_url', () => {
      const requestWithCallback = {
        model: 'seedance-1.0',
        prompt: 'Test',
        callback_url: 'https://example.com/webhook'
      };
      
      const result = VideoGenerationRequestSchema.parse(requestWithCallback);
      expect(result.callback_url).toBe('https://example.com/webhook');
    });
    
    it('should reject invalid callback_url', () => {
      const invalidRequest = {
        model: 'seedance-1.0',
        prompt: 'Test',
        callback_url: 'not-a-url'
      };
      
      expect(() => VideoGenerationRequestSchema.parse(invalidRequest))
        .toThrow(z.ZodError);
    });
  });
  
  describe('RoutingConfigSchema', () => {
    it('should use default strategy', () => {
      const result = RoutingConfigSchema.parse({});
      expect(result.strategy).toBe('cost_optimized');
      expect(result.max_retries).toBe(3);
    });
    
    it('should accept valid strategy', () => {
      const config = { strategy: 'speed', max_retries: 5 };
      const result = RoutingConfigSchema.parse(config);
      expect(result.strategy).toBe('speed');
      expect(result.max_retries).toBe(5);
    });
    
    it('should reject invalid retry count', () => {
      expect(() => RoutingConfigSchema.parse({ max_retries: 10 }))
        .toThrow(z.ZodError);
    });
  });
});
