import type { ProviderAdapter, VideoGenerationRequest, GenerationStatus } from '../types/index.js';

export abstract class BaseProvider implements ProviderAdapter {
  abstract readonly id: string;
  abstract readonly name: string;
  
  protected apiKey: string;
  protected baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || this.getDefaultBaseUrl();
  }

  abstract getDefaultBaseUrl(): string;
  abstract validateRequest(request: VideoGenerationRequest): boolean;
  abstract estimateCost(request: VideoGenerationRequest): number;
  abstract estimateTime(request: VideoGenerationRequest): number;
  abstract submit(request: VideoGenerationRequest): Promise<{ provider_job_id: string; estimated_seconds: number }>;
  abstract checkStatus(provider_job_id: string): Promise<{
    status: GenerationStatus;
    progress?: number;
    video_url?: string;
    error?: string;
  }>;
  abstract cancel(provider_job_id: string): Promise<boolean>;

  // Common utility methods
  protected async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    return fetch(url, {
      ...options,
      headers
    });
  }

  protected handleError(response: Response, context: string): never {
    throw new Error(`${context} failed: ${response.status} ${response.statusText}`);
  }
}
