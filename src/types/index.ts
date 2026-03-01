// 从 image.ts 导出图像生成类型
export * from './image.js';

// Video generation status
export type GenerationStatus = 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

// Supported video models
export type VideoModel = 
  // ByteDance
  | 'seedance-1.0'
  | 'seedance-1.0-pro'
  // Kling
  | 'kling-1.6'
  | 'kling-1.0'
  // Runway
  | 'runway-gen3'
  | 'runway-gen2'
  // Pika
  | 'pika-2.0'
  | 'pika-1.5'
  // Luma
  | 'luma-1.0'
  | 'luma-1.5'
  // Haiper
  | 'haiper-v2'
  | 'haiper-v1'
  // Hailuo
  | 'hailuo-video-v1'
  // Stable Video
  | 'stable-video-1-1'
  | 'stable-video-1-0'
  // Replicate Video
  | 'replicate-svd'
  | 'replicate-animate'
  | 'replicate-zeroscope';

// Provider identifiers - 包含图像和视频 providers
export type ProviderId = 
  | 'seedance' 
  | 'kling' 
  | 'runway' 
  | 'pika'
  | 'luma'
  | 'haiper'
  | 'hailuo'
  | 'stable-video'
  | 'stability'
  | 'replicate';

// Resolution options
export type Resolution = '480p' | '720p' | '1080p' | '4k';

// Aspect ratio
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

// Video generation request
export interface VideoGenerationRequest {
  model: VideoModel;
  prompt: string;
  negative_prompt?: string;
  duration?: number; // seconds
  resolution?: Resolution;
  aspect_ratio?: AspectRatio;
  callback_url?: string;
  metadata?: Record<string, string>;
}

// Video generation response
export interface VideoGenerationResponse {
  id: string;
  status: GenerationStatus;
  model: VideoModel;
  provider: ProviderId;
  created_at: string;
  updated_at: string;
  estimated_seconds?: number;
  progress?: number;
  error?: string;
}

// Video generation result
export interface VideoGenerationResult {
  id: string;
  status: GenerationStatus;
  video_url?: string;
  thumbnail_url?: string;
  duration?: number;
  resolution?: Resolution;
  cost_usd?: number;
  provider: ProviderId;
  created_at: string;
  completed_at?: string;
}

// Provider configuration
export interface ProviderConfig {
  id: ProviderId;
  name: string;
  enabled: boolean;
  api_key: string;
  base_url?: string;
  cost_per_second: Record<Resolution, number>;
  max_duration: number;
  supported_models: VideoModel[];
  rate_limit_rpm: number;
  timeout_seconds: number;
}

// Routing strategy
export type RoutingStrategy = 'cost_optimized' | 'speed' | 'quality' | 'fallback';

// Routing configuration
export interface RoutingConfig {
  strategy: RoutingStrategy;
  providers: ProviderConfig[];
  fallback_enabled: boolean;
  max_retries: number;
}

// Queue job data
export interface GenerationJob {
  id: string;
  request: VideoGenerationRequest | ImageGenerationRequest;
  type: 'video' | 'image';
  provider: ProviderId;
  attempts: number;
  max_attempts: number;
  created_at: number;
}

// Provider adapter interface
export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly name: string;
  
  // Video methods
  validateRequest(request: VideoGenerationRequest): boolean;
  estimateCost(request: VideoGenerationRequest): number;
  estimateTime(request: VideoGenerationRequest): number;
  
  submit(request: VideoGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }>;
  checkStatus(provider_job_id: string): Promise<{
    status: GenerationStatus;
    progress?: number;
    video_url?: string;
    error?: string;
  }>;
  cancel(provider_job_id: string): Promise<boolean>;
}

// Usage statistics
export interface UsageStats {
  total_generations: number;
  total_images: number;  // 新增：图像生成统计
  completed: number;
  failed: number;
  pending: number;
  total_cost_usd: number;
  by_provider: Record<ProviderId, {
    count: number;
    image_count?: number;  // 新增
    cost_usd: number;
    avg_duration_seconds: number;
  }>;
  by_day: Array<{
    date: string;
    count: number;
    image_count?: number;  // 新增
    cost_usd: number;
  }>;
}

// Dashboard data
export interface DashboardData {
  usage: UsageStats;
  recent_generations: VideoGenerationResult[];
  recent_images: ImageGenerationResult[];  // 新增
  providers_status: Array<{
    id: ProviderId;
    name: string;
    configured: boolean;
    supports_image?: boolean;  // 新增
    supports_video?: boolean;  // 新增
    healthy: boolean;
    last_used?: string;
  }>;
  rate_limit_status: {
    limit: number;
    used: number;
    reset_at: string;
  };
}
