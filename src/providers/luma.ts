import { BaseProvider } from './base.js';
import type { ProviderAdapter, VideoGenerationRequest, GenerationStatus, ProviderId } from '../types/index.js';

/**
 * Luma AI (Dream Machine) 适配器
 * API 参考: https://docs.lumalabs.ai/docs/api
 */
export class LumaProvider extends BaseProvider implements ProviderAdapter {
  readonly id: ProviderId = 'luma';
  readonly name = 'Luma AI Dream Machine';

  private costTable = {
    '480p': 0.32,
    '720p': 0.55,
    '1080p': 0.95,
    '4k': 2.00
  };

  getDefaultBaseUrl(): string {
    return 'https://api.lumalabs.ai/dream-machine/v1';
  }

  validateRequest(request: VideoGenerationRequest): boolean {
    return request.model.startsWith('luma');
  }

  estimateCost(request: VideoGenerationRequest): number {
    const duration = request.duration || 5;
    const resolution = request.resolution || '720p';
    return this.costTable[resolution] * duration;
  }

  estimateTime(request: VideoGenerationRequest): number {
    // Luma 通常需要 20-60 秒
    return 40;
  }

  async submit(request: VideoGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    const body = {
      prompt: request.prompt,
      negative_prompt: request.negative_prompt,
      // Luma 支持 text-to-video 和 image-to-video
      ...(request.aspect_ratio && { aspect_ratio: request.aspect_ratio }),
      loop: false
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

    // Luma 状态: pending → processing → completed/failed
    const state = data.state;
    let status: GenerationStatus = 'pending';
    
    if (state === 'queued') status = 'queued';
    else if (state === 'dreaming') status = 'processing';
    else if (state === 'completed') status = 'completed';
    else if (state === 'failed') status = 'failed';

    return {
      status,
      video_url: data.assets?.video,
      error: data.failure_reason
    };
  }

  async cancel(provider_job_id: string): Promise<boolean> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/generations/${provider_job_id}`, {
      method: 'DELETE'
    });

    return response.ok;
  }
}
