import { z } from 'zod';
import { VideoModel, Resolution, AspectRatio, RoutingStrategy } from './index.js';

// Validation schemas
export const VideoModelSchema = z.enum([
  'seedance-1.0',
  'seedance-1.0-pro',
  'kling-1.6',
  'kling-1.0',
  'runway-gen3',
  'runway-gen2',
  'pika-2.0',
  'luma-1.0'
]);

export const ResolutionSchema = z.enum(['480p', '720p', '1080p', '4k']);
export const AspectRatioSchema = z.enum(['16:9', '9:16', '1:1', '4:3', '3:4']);

export const VideoGenerationRequestSchema = z.object({
  model: VideoModelSchema,
  prompt: z.string().min(1).max(4000),
  negative_prompt: z.string().max(2000).optional(),
  duration: z.number().int().min(1).max(60).optional().default(5),
  resolution: ResolutionSchema.optional().default('720p'),
  aspect_ratio: AspectRatioSchema.optional().default('16:9'),
  callback_url: z.string().url().optional(),
  metadata: z.record(z.string()).optional()
});

export const RoutingConfigSchema = z.object({
  strategy: z.enum(['cost_optimized', 'speed', 'quality', 'fallback']).optional().default('cost_optimized'),
  providers: z.array(z.string()).optional(),
  max_retries: z.number().int().min(1).max(5).optional().default(3)
});

// Type inference
export type VideoGenerationRequestInput = z.infer<typeof VideoGenerationRequestSchema>;
export type RoutingConfigInput = z.infer<typeof RoutingConfigSchema>;
