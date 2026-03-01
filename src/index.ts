import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';

import { generationsRouter, initProvidersFromEnv } from './routes/generations.js';
import { keysRouter } from './routes/keys.js';
import { healthRouter } from './routes/health.js';
import { createGenerationWorker } from './queue/index.js';
import { ProviderRegistry } from './providers/index.js';
import { errorHandler } from './middleware/error.js';
import { createApiKey } from './auth/api-keys.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));
app.use('*', prettyJSON());

// Error handling
app.onError(errorHandler);

// Initialize providers
initProvidersFromEnv();

// Initialize worker
const registry = new ProviderRegistry();
if (process.env.SEEDANCE_API_KEY) {
  const { SeedanceProvider } = await import('./providers/seedance.js');
  registry.register(new SeedanceProvider(process.env.SEEDANCE_API_KEY));
}
if (process.env.KLING_API_KEY) {
  const { KlingProvider } = await import('./providers/kling.js');
  registry.register(new KlingProvider(process.env.KLING_API_KEY));
}
if (process.env.RUNWAY_API_KEY) {
  const { RunwayProvider } = await import('./providers/runway.js');
  registry.register(new RunwayProvider(process.env.RUNWAY_API_KEY));
}

// Start worker if providers configured
let worker: ReturnType<typeof createGenerationWorker> | null = null;
if (registry.getAll().length > 0 && process.env.REDIS_URL) {
  worker = createGenerationWorker(registry);
  console.log(`[Worker] Started with ${registry.getAll().length} providers`);
}

// Routes
app.route('/v1/video/generations', generationsRouter);
app.route('/v1/keys', keysRouter);
app.route('/health', healthRouter);

// Root
app.get('/', (c) => {
  return c.json({
    name: 'VideoGateway',
    version: '0.1.0',
    description: 'Unified AI video generation gateway',
    providers: registry.getAll().map(p => ({ id: p.id, name: p.name })),
    endpoints: {
      'POST /v1/video/generations': 'Create a video generation task',
      'GET /v1/video/generations/:id': 'Get generation status',
      'GET /v1/video/generations/:id/result': 'Get generation result',
      'DELETE /v1/video/generations/:id': 'Cancel generation',
      'POST /v1/keys': 'Create API key',
      'GET /v1/keys': 'List API keys',
      'DELETE /v1/keys/:id': 'Revoke API key',
      'GET /health': 'Health check'
    }
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (worker) {
    await worker.close();
  }
  process.exit(0);
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

console.log(`🎬 VideoGateway starting on port ${port}`);
console.log(`📡 Providers: ${registry.getAll().map(p => p.name).join(', ') || 'None'}`);
console.log(`⚡ Worker: ${worker ? 'Active' : 'Inactive (no Redis)'}`);

// 创建默认 admin key（如果没有）
if (process.env.ADMIN_API_KEY) {
  console.log('🔑 Admin API key configured');
}

serve({
  fetch: app.fetch,
  port
});

export default app;
