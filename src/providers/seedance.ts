import { BaseProvider } from './base.js';
import type { ProviderAdapter, VideoGenerationRequest, GenerationStatus, ProviderId, VideoModel, Resolution } from '../types/index.js';

/**
 * 字节跳动 Seedance 适配器
 * API 文档参考: https://www.volcengine.com/docs/6791
 */
export class SeedanceProvider extends BaseProvider implements ProviderAdapter {
  readonly id: ProviderId = 'seedance';
  readonly name = 'ByteDance Seedance';

  // Cost per second (USD)
  private costTable: Record<Resolution, number> = {
    '480p': 0.15,
    '720p': 0.25,
    '1080p': 0.50,
    '4k': 1.00
  };

  // Model mapping
  private modelMapping: Record<VideoModel, string> = {
    'seedance-1.0': 'seedance-v1',
    'seedance-1.0-pro': 'seedance-v1-pro',
    'kling-1.6': '', // Not supported
    'kling-1.0': '',
    'runway-gen3': '',
    'runway-gen2': '',
    'pika-2.0': '',
    'luma-1.0': ''
  };

  getDefaultBaseUrl(): string {
    return 'https://api.volcengine.com/seedance/v1';
  }

  validateRequest(request: VideoGenerationRequest): boolean {
    // Seedance 只支持自己的模型
    return request.model.startsWith('seedance');
  }

  estimateCost(request: VideoGenerationRequest): number {
    const duration = request.duration || 5;
    const resolution = request.resolution || '720p';
    return this.costTable[resolution] * duration;
  }

  estimateTime(request: VideoGenerationRequest): number {
    // Seedance 通常需要 30-120 秒生成 5 秒视频
    const duration = request.duration || 5;
    return duration * 15; // 15x real-time
  }

  async submit(request: VideoGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }> {
    const model = this.modelMapping[request.model] || 'seedance-v1';
    
    const body = {
      model: model,
      prompt: request.prompt,
      negative_prompt: request.negative_prompt,
      duration: request.duration || 5,
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

    // Map Seedance status to our status
    const statusMap: Record<string, GenerationStatus> = {
      'pending': 'pending',
      'queued': 'queued',
      'processing': 'processing',
      'completed': 'completed',
      'failed': 'failed'
    };

    return {
      status: statusMap[data.status] || 'pending',
      progress: data.progress,
      video_url: data.video_url,
      error: data.error_message
    };
  }

  async cancel(provider_job_id: string): Promise<boolean> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/generations/${provider_job_id}/cancel`, {
      method: 'POST'
    });

    return response.ok;
  }
}
