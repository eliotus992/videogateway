import { SeedanceProvider } from './seedance.js';
import { KlingProvider } from './kling.js';
import { RunwayProvider } from './runway.js';
import { PikaProvider } from './pika.js';
import { LumaProvider } from './luma.js';
import { HaiperProvider } from './haiper.js';
import { HailuoProvider } from './hailuo.js';
import { StableVideoProvider } from './stable-video.js';
import { SeedreamProvider } from './seedream.js';
import { StabilityImageProvider } from './stability-image.js';
import { ReplicateProvider } from './replicate.js';
import type { ProviderAdapter, ProviderId } from '../types/index.js';

export {
  SeedanceProvider,
  KlingProvider,
  RunwayProvider,
  PikaProvider,
  LumaProvider,
  HaiperProvider,
  HailuoProvider,
  StableVideoProvider,
  SeedreamProvider,
  StabilityImageProvider,
  ReplicateProvider
};

export type { ProviderAdapter };
export type { ImageProviderAdapter } from './seedream.js';

// Provider 配置映射
export const PROVIDER_CONFIG: Record<ProviderId, {
  name: string;
  videoModels: string[];
  imageModels: string[];
  maxDuration: number;
  features: string[];
}> = {
  seedance: {
    name: 'ByteDance Seedance/Seedream',
    videoModels: ['seedance-1.0', 'seedance-1.0-pro'],
    imageModels: ['seedream-v1', 'seedream-v2'],
    maxDuration: 10,
    features: ['text-to-video', 'image-to-video', 'text-to-image', 'camera-control']
  },
  kling: {
    name: 'Kling AI',
    videoModels: ['kling-1.6', 'kling-1.0'],
    imageModels: [],
    maxDuration: 10,
    features: ['text-to-video', 'image-to-video', 'motion-brush']
  },
  runway: {
    name: 'Runway ML',
    videoModels: ['runway-gen3', 'runway-gen2'],
    imageModels: [],
    maxDuration: 16,
    features: ['text-to-video', 'image-to-video', 'motion-brush', 'camera-control']
  },
  pika: {
    name: 'Pika Labs',
    videoModels: ['pika-2.0', 'pika-1.5'],
    imageModels: [],
    maxDuration: 10,
    features: ['text-to-video', 'image-to-video', 'expand-video']
  },
  luma: {
    name: 'Luma AI Dream Machine',
    videoModels: ['luma-1.0', 'luma-1.5'],
    imageModels: [],
    maxDuration: 5,
    features: ['text-to-video', 'image-to-video']
  },
  haiper: {
    name: 'Haiper AI',
    videoModels: ['haiper-v2', 'haiper-v1'],
    imageModels: [],
    maxDuration: 8,
    features: ['text-to-video', 'image-to-video', 'repaint']
  },
  hailuo: {
    name: 'Hailuo AI (海螺)',
    videoModels: ['hailuo-video-v1'],
    imageModels: [],
    maxDuration: 10,
    features: ['text-to-video', 'image-to-video']
  },
  'stable-video': {
    name: 'Stability AI Stable Video',
    videoModels: ['stable-video-1-1', 'stable-video-1-0'],
    imageModels: [],
    maxDuration: 4,
    features: ['image-to-video']
  },
  stability: {
    name: 'Stability AI Image',
    videoModels: [],
    imageModels: [
      'stable-diffusion-xl-1024-v1-0',
      'stable-diffusion-v1-6',
      'stable-image-core',
      'stable-image-ultra'
    ],
    maxDuration: 0,
    features: ['text-to-image', 'image-to-image']
  },
  replicate: {
    name: 'Replicate',
    videoModels: ['replicate-svd', 'replicate-animate', 'replicate-zeroscope'],
    imageModels: ['replicate-sdxl', 'replicate-flux', 'replicate-kandinsky'],
    maxDuration: 10,
    features: ['text-to-video', 'image-to-video', 'text-to-image', 'model-hosting']
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
    case 'stability':
      return new StabilityImageProvider(apiKey, baseUrl);
    case 'replicate':
      return new ReplicateProvider(apiKey, baseUrl);
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

  getProviderInfo(): Array<{ 
    id: ProviderId; 
    name: string; 
    videoModels: string[]; 
    imageModels: string[];
    features: string[] 
  }> {
    return this.getAll().map(p => ({
      id: p.id,
      name: p.name,
      ...PROVIDER_CONFIG[p.id]
    }));
  }
}
