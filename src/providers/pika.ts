import { BaseProvider } from './base.js';
import type { ProviderAdapter, VideoGenerationRequest, GenerationStatus, ProviderId } from '../types/index.js';

/**
 * Pika Labs 适配器
 * API 参考: https://pika.art/docs/api
 */
export class PikaProvider extends BaseProvider implements ProviderAdapter {
  readonly id: ProviderId = 'pika';
  readonly name = 'Pika Labs';

  private costTable = {
    '480p': 0.30,
    '720p': 0.50,
    '1080p': 0.80,
    '4k': 1.50
  };

  getDefaultBaseUrl(): string {
    return 'https://api.pika.art/v1';
  }

  validateRequest(request: VideoGenerationRequest): boolean {
    return request.model.startsWith('pika');
  }

  estimateCost(request: VideoGenerationRequest): number {
    const duration = request.duration || 5;
    const resolution = request.resolution || '720p';
    return this.costTable[resolution] * duration;
  }

  estimateTime(request: VideoGenerationRequest): number {
    // Pika 通常需要 30-60 秒
    return 45;
  }

  async submit(request: VideoGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    const model = request.model === 'pika-2.0' ? 'pika-2.0' : 'pika-1.5';
    
    const body = {
      model: model,
      prompt: request.prompt,
      negative_prompt: request.negative_prompt,
      duration: Math.min(request.duration || 5, 10), // Pika max 10s
      resolution: this.mapResolution(request.resolution || '720p'),
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
    const response = await this.fetchWithAuth(`${this.baseUrl}/generations/${provider_job_id}`);

    if (!response.ok) {
      this.handleError(response, 'Check status');
    }

    const data = await response.json();

    const statusMap: Record<string, GenerationStatus> = {
      'pending': 'pending',
      'queued': 'queued',
      'in_progress': 'processing',
      'completed': 'completed',
      'failed': 'failed'
    };

    return {
      status: statusMap[data.status] || 'pending',
      progress: data.progress,
      video_url: data.video?.url,
      error: data.error?.message
    };
  }

  async cancel(provider_job_id: string): Promise<boolean> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/generations/${provider_job_id}/cancel`, {
      method: 'POST'
    });

    return response.ok;
  }

  private mapResolution(resolution: string): string {
    const map: Record<string, string> = {
      '480p': '480p',
      '720p': '720p',
      '1080p': '1080p',
      '4k': '4k'
    };
    return map[resolution] || '720p';
  }
}
