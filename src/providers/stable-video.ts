import { BaseProvider } from './base.js';
import type { ProviderAdapter, VideoGenerationRequest, GenerationStatus, ProviderId } from '../types/index.js';

/**
 * Stability AI (Stable Video) 适配器
 * API 参考: https://platform.stability.ai/docs/api-reference
 */
export class StableVideoProvider extends BaseProvider implements ProviderAdapter {
  readonly id: ProviderId = 'stable-video';
  readonly name = 'Stability AI Stable Video';

  private costTable = {
    '480p': 0.18,
    '720p': 0.30,
    '1080p': 0.55,
    '4k': 1.10
  };

  getDefaultBaseUrl(): string {
    return 'https://api.stability.ai/v2beta';
  }

  validateRequest(request: VideoGenerationRequest): boolean {
    return request.model.startsWith('stable-video') || request.model.startsWith('svd');
  }

  estimateCost(request: VideoGenerationRequest): number {
    const duration = request.duration || 5;
    const resolution = request.resolution || '720p';
    return this.costTable[resolution] * duration;
  }

  estimateTime(request: VideoGenerationRequest): number {
    // Stable Video 通常需要 20-60 秒
    return 40;
  }

  async submit(request: VideoGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    const model = request.model === 'stable-video-1-1' 
      ? 'stable-video-1-1' 
      : 'stable-video-1-0';
    
    const body = {
      model: model,
      prompt: request.prompt,
      negative_prompt: request.negative_prompt,
      // Stable Video 参数
      cfg_scale: 2.5,
      motion_bucket_id: 127,
      seed: Math.floor(Math.random() * 1000000)
    };

    const response = await this.fetchWithAuth(`${this.baseUrl}/image-to-video`, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      this.handleError(response, 'Submit generation');
    }

    const data = await response.json();
    
    return {
      provider_job_id: data.id,
      estimated_seconds: this.estimateTime(request)
    };
  }

  async checkStatus(provider_job_id: string): Promise<{
    status: GenerationStatus;
    progress?: number;
    video_url?: string;
    error?: string;
  }> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/results/${provider_job_id}`);

    if (!response.ok) {
      this.handleError(response, 'Check status');
    }

    const data = await response.json();

    // Stability 状态处理
    if (data.status === 'success' && data.video) {
      return {
        status: 'completed',
        video_url: data.video
      };
    }

    const statusMap: Record<string, GenerationStatus> = {
      'pending': 'pending',
      'in-progress': 'processing',
      'success': 'completed',
      'error': 'failed'
    };

    return {
      status: statusMap[data.status] || 'pending',
      error: data.error
    };
  }

  async cancel(provider_job_id: string): Promise<boolean> {
    // Stability AI 可能不支持取消
    return false;
  }
}
