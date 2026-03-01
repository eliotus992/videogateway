import { BaseProvider } from './base.js';
import type { 
  ProviderAdapter, 
  ImageGenerationRequest, 
  ImageGenerationResponse,
  GenerationStatus, 
  ProviderId 
} from '../types/index.js';
import type { ImageProviderAdapter } from './seedream.js';

/**
 * Stability AI 图像生成适配器
 * API: https://platform.stability.ai/docs/api-reference
 */
export class StabilityImageProvider extends BaseProvider implements ProviderAdapter, ImageProviderAdapter {
  readonly id: ProviderId = 'stability';
  readonly name = 'Stability AI';

  private imageCostTable = {
    '256x256': 0.015,
    '512x512': 0.025,
    '1024x1024': 0.04,
    '2048x2048': 0.08
  };

  getDefaultBaseUrl(): string {
    return 'https://api.stability.ai/v2beta';
  }

  // Video - not supported
  validateRequest(): boolean { return false; }
  estimateCost(): number { return 0; }
  estimateTime(): number { return 0; }
  async submit() { throw new Error('Use StableVideoProvider for video'); }
  async checkStatus() { throw new Error('Use StableVideoProvider for video'); }
  async cancel() { return false; }

  // Image generation
  supportsImageGeneration(): boolean {
    return true;
  }

  validateImageRequest(request: ImageGenerationRequest): boolean {
    const validModels = [
      'stable-diffusion-xl-1024-v1-0',
      'stable-diffusion-v1-6',
      'stable-image-core',
      'stable-image-ultra'
    ];
    return validModels.includes(request.model);
  }

  estimateImageCost(request: ImageGenerationRequest): number {
    const size = request.size || '1024x1024';
    const baseCost = this.imageCostTable[size as keyof typeof this.imageCostTable] || 0.04;
    return baseCost * (request.n || 1);
  }

  async submitImage(request: ImageGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    const model = request.model || 'stable-image-core';
    
    const body = {
      prompt: request.prompt,
      negative_prompt: request.negative_prompt,
      aspect_ratio: this.mapAspectRatio(request.size),
      seed: request.seed || Math.floor(Math.random() * 1000000),
      output_format: 'png'
    };

    // Stability 有不同的 endpoint 根据模型
    const endpoint = model.includes('core') || model.includes('ultra')
      ? `${this.baseUrl}/stable-image/generate/sd3`  
      : `${this.baseUrl}/text-to-image`;

    const response = await this.fetchWithAuth(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      this.handleError(response, 'Submit image generation');
    }

    const data = await response.json();
    
    // Stability 返回的是 base64 或 url
    return {
      provider_job_id: data.id || `sd_${Date.now()}`,
      estimated_seconds: 5
    };
  }

  async checkImageStatus(provider_job_id: string): Promise<{
    status: GenerationStatus;
    progress?: number;
    image_url?: string;
    error?: string;
  }> {
    // Stability 通常是同步的，直接返回 completed
    // 如果是异步任务，调用 status endpoint
    return {
      status: 'completed',
      image_url: '' // 实际从之前的响应中提取
    };
  }

  private mapAspectRatio(size?: string): string {
    const map: Record<string, string> = {
      '1024x1024': '1:1',
      '1024x576': '16:9',
      '576x1024': '9:16',
      '1344x768': '16:9',
      '768x1344': '9:16'
    };
    return map[size || '1024x1024'] || '1:1';
  }
}
