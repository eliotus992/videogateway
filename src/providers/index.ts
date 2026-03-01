import { SeedanceProvider } from './seedance.js';
import { KlingProvider } from './kling.js';
import { RunwayProvider } from './runway.js';
import { PikaProvider } from './pika.js';
import { LumaProvider } from './luma.js';
import { HaiperProvider } from './haiper.js';
import { HailuoProvider } from './hailuo.js';
import { StableVideoProvider } from './stable-video.js';
import type { ProviderAdapter, ProviderId } from '../types/index.js';

export {
  SeedanceProvider,
  KlingProvider,
  RunwayProvider,
  PikaProvider,
  LumaProvider,
  HaiperProvider,
  HailuoProvider,
  StableVideoProvider
};

export type { ProviderAdapter };

// Provider 配置映射
export const PROVIDER_CONFIG: Record<ProviderId, {
  name: string;
  models: string[];
  maxDuration: number;
  features: string[];
}> = {
  seedance: {
    name: 'ByteDance Seedance',
    models: ['seedance-1.0', 'seedance-1.0-pro'],
    maxDuration: 10,
    features: ['text-to-video', 'image-to-video', 'camera-control']
  },
  kling: {
    name: 'Kling AI',
    models: ['kling-1.6', 'kling-1.0'],
    maxDuration: 10,
    features: ['text-to-video', 'image-to-video', 'motion-brush']
  },
  runway: {
    name: 'Runway ML',
    models: ['runway-gen3', 'runway-gen2'],
    maxDuration: 16,
    features: ['text-to-video', 'image-to-video', 'motion-brush', 'camera-control']
  },
  pika: {
    name: 'Pika Labs',
    models: ['pika-2.0', 'pika-1.5'],
    maxDuration: 10,
    features: ['text-to-video', 'image-to-video', 'expand-video']
  },
  luma: {
    name: 'Luma AI Dream Machine',
    models: ['luma-1.0', 'luma-1.5'],
    maxDuration: 5,
    features: ['text-to-video', 'image-to-video']
  },
  haiper: {
    name: 'Haiper AI',
    models: ['haiper-v2', 'haiper-v1'],
    maxDuration: 8,
    features: ['text-to-video', 'image-to-video', 'repaint']
  },
  hailuo: {
    name: 'Hailuo AI (海螺)',
    models: ['hailuo-video-v1'],
    maxDuration: 10,
    features: ['text-to-video', 'image-to-video']
  },
  'stable-video': {
    name: 'Stability AI Stable Video',
    models: ['stable-video-1-1', 'stable-video-1-0'],
    maxDuration: 4,
    features: ['image-to-video']
  }
};

// Provider 工厂
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
    case 'pika':
      return new PikaProvider(apiKey, baseUrl);
    case 'luma':
      return new LumaProvider(apiKey, baseUrl);
    case 'haiper':
      return new HaiperProvider(apiKey, baseUrl);
    case 'hailuo':
      return new HailuoProvider(apiKey, baseUrl);
    case 'stable-video':
      return new StableVideoProvider(apiKey, baseUrl);
    default:
      throw new Error(`Unknown provider: ${id}`);
  }
}

// Provider 注册表
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

  getAvailable(): ProviderId[] {
    return Array.from(this.providers.keys());
  }

  findForRequest(request: import('../types/index.js').VideoGenerationRequest): ProviderAdapter[] {
    return this.getAll()
      .filter(p => p.validateRequest(request))
      .sort((a, b) => a.estimateCost(request) - b.estimateCost(request));
  }

  getProviderInfo(): Array<{ id: ProviderId; name: string; models: string[]; features: string[] }> {
    return this.getAll().map(p => ({
      id: p.id,
      name: p.name,
      ...PROVIDER_CONFIG[p.id]
    }));
  }
}
