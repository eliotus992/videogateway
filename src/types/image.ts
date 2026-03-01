// 图像生成类型
export type ImageModel = 
  // ByteDance
  | 'seedream-v1'
  | 'seedream-v2'
  // Stability
  | 'stable-diffusion-xl-1024-v1-0'
  | 'stable-diffusion-v1-6'
  | 'stable-image-core'
  | 'stable-image-ultra'
  // Replicate
  | 'replicate-sdxl'
  | 'replicate-flux'
  | 'replicate-kandinsky'
  | 'replicate-svd'
  | 'replicate-animate'
  | 'replicate-zeroscope'
  // OpenAI compatible
  | 'dall-e-3'
  | 'dall-e-2';

// 图像尺寸
export type ImageSize = 
  | '256x256' 
  | '512x512' 
  | '1024x1024' 
  | '1792x1024' 
  | '1024x1792'
  | '2048x2048';

// 图像风格
export type ImageStyle = 
  | 'vivid' 
  | 'natural'
  | 'photographic'
  | 'anime'
  | 'digital-art'
  | 'cinematic';

// 图像生成请求
export interface ImageGenerationRequest {
  model: ImageModel;
  prompt: string;
  negative_prompt?: string;
  n?: number; // 生成数量 (1-10)
  size?: ImageSize;
  quality?: 'standard' | 'hd';
  style?: ImageStyle;
  image_url?: string; // 图生图时的参考图
  seed?: number;
  callback_url?: string;
  metadata?: Record<string, string>;
}

// 图像生成响应
export interface ImageGenerationResponse {
  id: string;
  status: GenerationStatus;
  model: ImageModel;
  provider: ProviderId;
  created_at: string;
  updated_at: string;
  estimated_seconds?: number;
  progress?: number;
  error?: string;
}

// 图像生成结果
export interface ImageGenerationResult {
  id: string;
  status: GenerationStatus;
  images: Array<{
    url: string;
    revised_prompt?: string;
  }>;
  model: ImageModel;
  provider: ProviderId;
  created_at: string;
  completed_at?: string;
  cost_usd?: number;
}
