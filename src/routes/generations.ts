import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { VideoGenerationRequestSchema } from '../types/schemas.js';
import type { VideoGenerationResponse, VideoGenerationResult } from '../types/index.js';
import { ProviderRegistry } from '../providers/index.js';

// In-memory store for MVP (replace with Redis/D1 in production)
const generationsStore = new Map<string, VideoGenerationResponse & { result?: VideoGenerationResult }>();

// Provider registry
const registry = new ProviderRegistry();

// Initialize providers from env (in production, load from config)
function initProviders() {
  if (process.env.SEEDANCE_API_KEY) {
    const { SeedanceProvider } = await import('../providers/seedance.js');
    registry.register(new SeedanceProvider(process.env.SEEDANCE_API_KEY));
  }
  if (process.env.KLING_API_KEY) {
    const { KlingProvider } = await import('../providers/kling.js');
    registry.register(new KlingProvider(process.env.KLING_API_KEY));
  }
  if (process.env.RUNWAY_API_KEY) {
    const { RunwayProvider } = await import('../providers/runway.js');
    registry.register(new RunwayProvider(process.env.RUNWAY_API_KEY));
  }
}

const app = new Hono();

// POST /v1/video/generations - Create new generation
app.post('/', async (c) => {
  const body = await c.req.json();
  
  // Validate request
  const validated = VideoGenerationRequestSchema.parse(body);
  
  // Find suitable providers
  const providers = registry.findForRequest(validated);
  if (providers.length === 0) {
    return c.json({
      error: 'No provider available for the requested model',
      code: 'NO_PROVIDER'
    }, 400);
  }

  // Select provider (cost-optimized by default)
  const provider = providers[0];
  
  // Create generation record
  const id = `vg_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  
  const generation: VideoGenerationResponse = {
    id,
    status: 'pending',
    model: validated.model,
    provider: provider.id,
    created_at: now,
    updated_at: now,
    estimated_seconds: provider.estimateTime(validated)
  };

  generationsStore.set(id, generation);

  // Submit to provider asynchronously
  // In production, this should go to a queue (BullMQ)
  submitToProvider(id, validated, provider).catch(console.error);

  return c.json(generation, 201);
});

// GET /v1/video/generations/:id - Get generation status
app.get('/:id', (c) => {
  const id = c.req.param('id');
  const generation = generationsStore.get(id);
  
  if (!generation) {
    return c.json({ error: 'Generation not found', code: 'NOT_FOUND' }, 404);
  }

  return c.json(generation);
});

// GET /v1/video/generations/:id/result - Get generation result
app.get('/:id/result', (c) => {
  const id = c.req.param('id');
  const generation = generationsStore.get(id);
  
  if (!generation) {
    return c.json({ error: 'Generation not found', code: 'NOT_FOUND' }, 404);
  }

  if (generation.status !== 'completed') {
    return c.json({
      error: 'Generation not completed',
      status: generation.status,
      code: 'NOT_READY'
    }, 400);
  }

  return c.json(generation.result);
});

// DELETE /v1/video/generations/:id - Cancel generation
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const generation = generationsStore.get(id);
  
  if (!generation) {
    return c.json({ error: 'Generation not found', code: 'NOT_FOUND' }, 404);
  }

  if (['completed', 'failed'].includes(generation.status)) {
    return c.json({ error: 'Cannot cancel completed generation', code: 'INVALID_STATE' }, 400);
  }

  // In production, cancel via provider
  generation.status = 'failed';
  generation.error = 'Cancelled by user';
  generation.updated_at = new Date().toISOString();

  return c.json({ success: true });
});

// Async submission (replace with BullMQ in production)
async function submitToProvider(
  id: string,
  request: import('../types/schemas.js').VideoGenerationRequestInput,
  provider: import('../providers/index.js').ProviderAdapter
): Promise<void> {
  const generation = generationsStore.get(id);
  if (!generation) return;

  try {
    generation.status = 'queued';
    generation.updated_at = new Date().toISOString();

    const { provider_job_id, estimated_seconds } = await provider.submit(request);
    
    generation.status = 'processing';
    generation.estimated_seconds = estimated_seconds;
    generation.updated_at = new Date().toISOString();

    // Poll for completion (in production, use webhooks)
    pollForCompletion(id, provider, provider_job_id);
  } catch (error) {
    generation.status = 'failed';
    generation.error = error instanceof Error ? error.message : 'Unknown error';
    generation.updated_at = new Date().toISOString();
  }
}

// Poll for completion (replace with webhook in production)
async function pollForCompletion(
  id: string,
  provider: import('../providers/index.js').ProviderAdapter,
  provider_job_id: string
): Promise<void> {
  const maxAttempts = 60; // 5 minutes with 5s interval
  const interval = 5000;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(resolve => setTimeout(resolve, interval));

    const generation = generationsStore.get(id);
    if (!generation || generation.status === 'failed') return;

    try {
      const status = await provider.checkStatus(provider_job_id);
      
      generation.status = status.status;
      generation.progress = status.progress;
      generation.updated_at = new Date().toISOString();

      if (status.status === 'completed') {
        generation.result = {
          id,
          status: 'completed',
          video_url: status.video_url,
          provider: provider.id,
          created_at: generation.created_at,
          completed_at: new Date().toISOString()
        };
        break;
      }

      if (status.status === 'failed') {
        generation.error = status.error || 'Provider failed';
        break;
      }
    } catch (error) {
      console.error(`Poll error for ${id}:`, error);
    }
  }
}

// Initialize providers on first request
let initialized = false;
app.use('*', async (c, next) => {
  if (!initialized) {
    await initProviders();
    initialized = true;
  }
  await next();
});

export const generationsRouter = app;
