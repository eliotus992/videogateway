import { BaseProvider } from './base.js';
import type { ProviderAdapter, VideoGenerationRequest, GenerationStatus, ProviderId, VideoModel, Resolution } from '../types/index.js';

/**
 * 可灵 (Kling) 适配器
 * API 文档参考: https://klingai.com/
 */
export class KlingProvider extends BaseProvider implements ProviderAdapter {
  readonly id: ProviderId = 'kling';
  readonly name = 'Kling AI';

  private costTable: Record<Resolution, number> = {
    '480p': 0.10,
    '720p': 0.20,
    '1080p': 0.40,
    '4k': 0.80
  };

  getDefaultBaseUrl(): string {
    return 'https://api.klingai.com/v1';
  }

  validateRequest(request: VideoGenerationRequest): boolean {
    return request.model.startsWith('kling');
  }

  estimateCost(request: VideoGenerationRequest): number {
    const duration = request.duration || 5;
    const resolution = request.resolution || '720p';
    return this.costTable[resolution] * duration;
  }

  estimateTime(request: VideoGenerationRequest): number {
    const duration = request.duration || 5;
    return duration * 12;
  }

  async submit(request: VideoGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    const body = {
      model: request.model === 'kling-1.6' ? 'kling-v1-6' : 'kling-v1',
      prompt: request.prompt,
      negative_prompt: request.negative_prompt,
      duration: request.duration || 5,
      resolution: request.resolution || '720p',
      aspect_ratio: request.aspect_ratio || '16:9'
    };

    const response = await this.fetchWithAuth(`${this.baseUrl}/videos/generations`, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      this.handleError(response, 'Submit generation');
    }

    const data = await response.json();
    
    return {
      provider_job_id: data.data.id,
      estimated_seconds: this.estimateTime(request)
    };
  }

  async checkStatus(provider_job_id: string): Promise<{
    status: GenerationStatus;
    progress?: number;
    video_url?: string;
    error?: string;
  }> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/videos/generations/${provider_job_id}`);

    if (!response.ok) {
      this.handleError(response, 'Check status');
    }

    const data = await response.json();

    const statusMap: Record<string, GenerationStatus> = {
      'submitted': 'pending',
      'queued': 'queued',
      'processing': 'processing',
      'succeed': 'completed',
      'failed': 'failed'
    };

    return {
      status: statusMap[data.data.status] || 'pending',
      progress: data.data.progress,
      video_url: data.data.video_url,
      error: data.data.error_message
    };
  }

  async cancel(provider_job_id: string): Promise<boolean> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/videos/generations/${provider_job_id}/cancel`, {
      method: 'POST'
    });

    return response.ok;
  }
}
