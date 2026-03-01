import { BaseProvider } from './base.js';
import type { 
  ProviderAdapter, 
  ImageGenerationRequest, 
  ImageGenerationResponse,
  GenerationStatus, 
  ProviderId 
} from '../types/index.js';

/**
 * Provider 图像生成能力接口
 */
export interface ImageProviderAdapter {
  supportsImageGeneration(): boolean;
  validateImageRequest(request: ImageGenerationRequest): boolean;
  estimateImageCost(request: ImageGenerationRequest): number;
  submitImage(request: ImageGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }>;
  checkImageStatus(provider_job_id: string): Promise<{
    status: GenerationStatus;
    progress?: number;
    image_url?: string;
    error?: string;
  }>;
}

/**
 * 字节跳动 即梦/Seedream 图像生成适配器
 * API 参考: https://www.volcengine.com/docs/6791
 */
export class SeedreamProvider extends BaseProvider implements ProviderAdapter, ImageProviderAdapter {
  readonly id: ProviderId = 'seedance'; // 复用 video 的 id
  readonly name = 'ByteDance Seedream';

  private imageCostTable = {
    '512x512': 0.02,
    '1024x1024': 0.04,
    '2048x2048': 0.08
  };

  getDefaultBaseUrl(): string {
    return 'https://api.volcengine.com/seedream/v1';
  }

  // Video 相关（继承）
  validateRequest(): boolean { return false; } // 视频用 seedance
  estimateCost(): number { return 0; }
  estimateTime(): number { return 0; }
  async submit() { throw new Error('Use SeedanceProvider for video'); }
  async checkStatus() { throw new Error('Use SeedanceProvider for video'); }
  async cancel() { return false; }

  // Image 相关
  supportsImageGeneration(): boolean {
    return true;
  }

  validateImageRequest(request: ImageGenerationRequest): boolean {
    // Seedream 支持文生图、图生图
    return ['seedream-v1', 'seedream-v2'].includes(request.model);
  }

  estimateImageCost(request: ImageGenerationRequest): number {
    const size = request.size || '1024x1024';
    return this.imageCostTable[size as keyof typeof this.imageCostTable] || 0.04;
  }

  async submitImage(request: ImageGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    const body = {
      model: request.model,
      prompt: request.prompt,
      negative_prompt: request.negative_prompt,
      size: request.size || '1024x1024',
      n: request.n || 1,
      style: request.style,
      ...(request.image_url && { image_url: request.image_url }) // 图生图
    };

    const response = await this.fetchWithAuth(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      this.handleError(response, 'Submit image generation');
    }

    const data = await response.json();
    
    return {
      provider_job_id: data.id,
      estimated_seconds: 10 // 图像生成通常很快
    };
  }

  async checkImageStatus(provider_job_id: string): Promise<{
    status: GenerationStatus;
    progress?: number;
    image_url?: string;
    error?: string;
  }> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/images/generations/${provider_job_id}`);

    if (!response.ok) {
      this.handleError(response, 'Check image status');
    }

    const data = await response.json();

    return {
      status: data.status,
      image_url: data.image_url,
      error: data.error_message
    };
  }
}
