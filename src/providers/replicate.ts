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
 * Replicate 平台适配器
 * 支持多种图像和视频模型
 */
export class ReplicateProvider extends BaseProvider implements ProviderAdapter, ImageProviderAdapter {
  readonly id: ProviderId = 'replicate';
  readonly name = 'Replicate';

  getDefaultBaseUrl(): string {
    return 'https://api.replicate.com/v1';
  }

  // Video support
  validateRequest(request: import('../types/index.js').VideoGenerationRequest): boolean {
    return request.model.startsWith('replicate-');
  }

  estimateCost(request: import('../types/index.js').VideoGenerationRequest): number {
    return (request.duration || 5) * 0.15;
  }

  estimateTime(request: import('../types/index.js').VideoGenerationRequest): number {
    return 60;
  }

  async submit(request: import('../types/index.js').VideoGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    // Map model to Replicate model ID
    const modelMap: Record<string, string> = {
      'replicate-svd': 'stability-ai/stable-video-diffusion',
      'replicate-animate': 'lucataco/animate-diff',
      'replicate-zeroscope': 'anotherjesse/zeroscope-v2-xl'
    };

    const modelId = modelMap[request.model] || request.model;
    
    const response = await this.fetchWithAuth(`${this.baseUrl}/predictions`, {
      method: 'POST',
      body: JSON.stringify({
        version: modelId,
        input: {
          prompt: request.prompt,
          ...(request.aspect_ratio && { aspect_ratio: request.aspect_ratio })
        }
      })
    });

    if (!response.ok) {
      this.handleError(response, 'Submit video generation');
    }

    const data = await response.json();
    
    return {
      provider_job_id: data.id,
      estimated_seconds: 60
    };
  }

  async checkStatus(provider_job_id: string): Promise<{
    status: GenerationStatus;
    progress?: number;
    video_url?: string;
    error?: string;
  }> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/predictions/${provider_job_id}`);

    if (!response.ok) {
      this.handleError(response, 'Check status');
    }

    const data = await response.json();

    const statusMap: Record<string, GenerationStatus> = {
      'starting': 'pending',
      'processing': 'processing',
      'succeeded': 'completed',
      'failed': 'failed',
      'canceled': 'failed'
    };

    return {
      status: statusMap[data.status] || 'pending',
      progress: data.progress ? Math.round(data.progress * 100) : undefined,
      video_url: data.output?.[0],
      error: data.error
    };
  }

  async cancel(provider_job_id: string): Promise<boolean> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/predictions/${provider_job_id}/cancel`, {
      method: 'POST'
    });
    return response.ok;
  }

  // Image generation support
  supportsImageGeneration(): boolean {
    return true;
  }

  validateImageRequest(request: ImageGenerationRequest): boolean {
    return request.model.startsWith('replicate-') || 
           request.model.includes('sdxl') || 
           request.model.includes('flux');
  }

  estimateImageCost(request: ImageGenerationRequest): number {
    return 0.03 * (request.n || 1);
  }

  async submitImage(request: ImageGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    // Map common models to Replicate versions
    const modelMap: Record<string, string> = {
      'replicate-sdxl': 'stability-ai/sdxl',
      'replicate-flux': 'black-forest-labs/flux-schnell',
      'replicate-kandinsky': 'ai-forever/kandinsky-2'
    };

    const modelId = modelMap[request.model] || request.model;

    const response = await this.fetchWithAuth(`${this.baseUrl}/predictions`, {
      method: 'POST',
      body: JSON.stringify({
        version: modelId,
        input: {
          prompt: request.prompt,
          negative_prompt: request.negative_prompt,
          width: parseInt(request.size?.split('x')[0] || '1024'),
          height: parseInt(request.size?.split('x')[1] || '1024'),
          num_outputs: request.n || 1
        }
      })
    });

    if (!response.ok) {
      this.handleError(response, 'Submit image generation');
    }

    const data = await response.json();
    
    return {
      provider_job_id: data.id,
      estimated_seconds: 15
    };
  }

  async checkImageStatus(provider_job_id: string): Promise<{
    status: GenerationStatus;
    progress?: number;
    image_url?: string;
    error?: string;
  }> {
    // Replicate 使用相同的 status endpoint
    const status = await this.checkStatus(provider_job_id);
    return {
      ...status,
      image_url: status.video_url // Replicate 输出格式相同
    };
  }
}
