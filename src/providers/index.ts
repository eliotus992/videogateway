import { SeedanceProvider } from './seedance.js';
import { KlingProvider } from './kling.js';
import { RunwayProvider } from './runway.js';
import type { ProviderAdapter, VideoGenerationRequest, ProviderId } from '../types/index.js';

export { SeedanceProvider, KlingProvider, RunwayProvider };
export type { ProviderAdapter };

// Provider factory
export function createProvider(
  id: ProviderId,
  apiKey: string,
  baseUrl?: string
): ProviderAdapter {
  switch (id) {
    case 'seedance':
      return new SeedanceProvider(apiKey, baseUrl);
    case 'kling':
      return new KlingProvider(apiKey, baseUrl);
    case 'runway':
      return new RunwayProvider(apiKey, baseUrl);
    default:
      throw new Error(`Unknown provider: ${id}`);
  }
}

// Provider registry
export class ProviderRegistry {
  private providers: Map<ProviderId, ProviderAdapter> = new Map();

  register(provider: ProviderAdapter): void {
    this.providers.set(provider.id, provider);
  }

  get(id: ProviderId): ProviderAdapter {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Provider not found: ${id}`);
    }
    return provider;
  }

  getAll(): ProviderAdapter[] {
    return Array.from(this.providers.values());
  }

  findForRequest(request: VideoGenerationRequest): ProviderAdapter[] {
    return this.getAll()
      .filter(p => p.validateRequest(request))
      .sort((a, b) => a.estimateCost(request) - b.estimateCost(request));
  }
}
