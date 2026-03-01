import { BaseProvider } from './base.js';
import type { ProviderAdapter, VideoGenerationRequest, GenerationStatus, ProviderId } from '../types/index.js';

/**
 * Runway ML 适配器
 * API 文档参考: https://docs.runwayml.com/
 */
export class RunwayProvider extends BaseProvider implements ProviderAdapter {
  readonly id: ProviderId = 'runway';
  readonly name = 'Runway ML';

  private costTable = {
    '480p': 0.20,
    '720p': 0.35,
    '1080p': 0.60,
    '4k': 1.20
  };

  getDefaultBaseUrl(): string {
    return 'https://api.runwayml.com/v1';
  }

  validateRequest(request: VideoGenerationRequest): boolean {
    return request.model.startsWith('runway');
  }

  estimateCost(request: VideoGenerationRequest): number {
    const duration = request.duration || 5;
    const resolution = request.resolution || '720p';
    return this.costTable[resolution] * duration;
  }

  estimateTime(request: VideoGenerationRequest): number {
    const duration = request.duration || 5;
    return duration * 20;
  }

  async submit(request: VideoGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    const body = {
      model: request.model === 'runway-gen3' ? 'gen-3-alpha' : 'gen-2',
      prompt: request.prompt,
      negative_prompt: request.negative_prompt,
      duration: Math.min(request.duration || 5, 16), // Runway max 16s
      resolution: request.resolution || '720p'
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

    return {
      status: data.status,
      progress: data.progress,
      video_url: data.output?.video,
      error: data.failure_reason
    };
  }

  async cancel(provider_job_id: string): Promise<boolean> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/generations/${provider_job_id}/cancel`, {
      method: 'POST'
    });

    return response.ok;
  }
}
