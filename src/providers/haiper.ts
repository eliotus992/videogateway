import { BaseProvider } from './base.js';
import type { ProviderAdapter, VideoGenerationRequest, GenerationStatus, ProviderId } from '../types/index.js';

/**
 * Haiper AI 适配器
 * API 参考: https://haiper.ai/docs/api
 */
export class HaiperProvider extends BaseProvider implements ProviderAdapter {
  readonly id: ProviderId = 'haiper';
  readonly name = 'Haiper AI';

  private costTable = {
    '480p': 0.15,
    '720p': 0.25,
    '1080p': 0.45,
    '4k': 0.90
  };

  getDefaultBaseUrl(): string {
    return 'https://api.haiper.ai/v1';
  }

  validateRequest(request: VideoGenerationRequest): boolean {
    return request.model.startsWith('haiper');
  }

  estimateCost(request: VideoGenerationRequest): number {
    const duration = request.duration || 5;
    const resolution = request.resolution || '720p';
    return this.costTable[resolution] * duration;
  }

  estimateTime(request: VideoGenerationRequest): number {
    // Haiper 通常需要 30-90 秒
    return 60;
  }

  async submit(request: VideoGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    const body = {
      model: 'haiper-v2',
      prompt: request.prompt,
      negative_prompt: request.negative_prompt,
      duration: Math.min(request.duration || 5, 8), // Haiper max 8s
      resolution: request.resolution || '720p',
      aspect_ratio: request.aspect_ratio || '16:9'
    };

    const response = await this.fetchWithAuth(`${this.baseUrl}/generations`, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      this.handleError(response, 'Submit generation');
    }

    const data = await response.json();
    
    return {
      provider_job_id: data.generation_id,
      estimated_seconds: this.estimateTime(request)
    };
  }

  async checkStatus(provider_job_id: string): Promise<{
    status: GenerationStatus;
    progress?: number;
    video_url?: string;
    error?: string;
  }> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/generations/${provider_job_id}`);

    if (!response.ok) {
      this.handleError(response, 'Check status');
    }

    const data = await response.json();

    const statusMap: Record<string, GenerationStatus> = {
      'pending': 'pending',
      'queued': 'queued',
      'rendering': 'processing',
      'completed': 'completed',
      'failed': 'failed'
    };

    return {
      status: statusMap[data.status] || 'pending',
      progress: data.progress_percent,
      video_url: data.output?.video_url,
      error: data.error?.message
    };
  }

  async cancel(provider_job_id: string): Promise<boolean> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/generations/${provider_job_id}/cancel`, {
      method: 'POST'
    });

    return response.ok;
  }
}
