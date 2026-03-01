import { BaseProvider } from './base.js';
import type { ProviderAdapter, VideoGenerationRequest, GenerationStatus, ProviderId } from '../types/index.js';

/**
 * Hailuo AI (海螺/MiniMax) 适配器
 * API 参考: https://www.hailuo.ai/video
 */
export class HailuoProvider extends BaseProvider implements ProviderAdapter {
  readonly id: ProviderId = 'hailuo';
  readonly name = 'Hailuo AI (海螺)';

  private costTable = {
    '480p': 0.12,
    '720p': 0.20,
    '1080p': 0.40,
    '4k': 0.80
  };

  getDefaultBaseUrl(): string {
    return 'https://api.hailuo.ai/v1';
  }

  validateRequest(request: VideoGenerationRequest): boolean {
    return request.model.startsWith('hailuo');
  }

  estimateCost(request: VideoGenerationRequest): number {
    const duration = request.duration || 5;
    const resolution = request.resolution || '720p';
    return this.costTable[resolution] * duration;
  }

  estimateTime(request: VideoGenerationRequest): number {
    // 海螺通常需要 30-120 秒
    return 60;
  }

  async submit(request: VideoGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    const body = {
      model: 'hailuo-video-v1',
      prompt: request.prompt,
      negative_prompt: request.negative_prompt,
      duration: Math.min(request.duration || 5, 10),
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
      provider_job_id: data.task_id,
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
      'success': 'completed',
      'failed': 'failed'
    };

    return {
      status: statusMap[data.status] || 'pending',
      progress: data.progress,
      video_url: data.video_url,
      error: data.error_msg
    };
  }

  async cancel(provider_job_id: string): Promise<boolean> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/videos/generations/${provider_job_id}/cancel`, {
      method: 'POST'
    });

    return response.ok;
  }
}
